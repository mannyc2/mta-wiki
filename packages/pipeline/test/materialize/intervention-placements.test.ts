import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  interventionApplicationFingerprint,
  validateApplicationPlacementTransitions,
  type ApplicationPlacementTransition,
} from "@mta-wiki/pipeline/materialize/application-placement-transitions";
import {
  replayInterventionPlacementIdentityOperations,
  resolveInterventionPlacement,
  type InterventionPlacementFoundingClaim,
  type InterventionPlacementIdentityOperation,
} from "@mta-wiki/pipeline/materialize/intervention-placements";
import type { ResolvedInterventionApplication } from "@mta-wiki/pipeline/materialize/resolved-intervention-applications";

function claim(route = "route_a", scopeIds: string[] = []): InterventionPlacementFoundingClaim {
  return {
    route_record_id: route,
    gtfs_route_id: route.replace("route_", "").toUpperCase(),
    treatment_record_ids: ["treatment_x"],
    treatment_family: "bus_lane",
    scope: scopeIds.length
      ? { kind: "bounded_segment", record_ids: scopeIds, description: null }
      : { kind: "unknown", record_ids: [], description: null },
  };
}

function base(operationId: string) {
  return {
    schema_version: 1 as const,
    operation_id: operationId,
    decision_id: `decision:${operationId}`,
    issued_at: "2026-07-28T00:00:00Z",
    rationale: "Reviewed fixture operation.",
  };
}

function establish(operationId: string, foundingKey: string, route = "route_a"): InterventionPlacementIdentityOperation {
  return {
    ...base(operationId),
    operation: "establish",
    founding_key: foundingKey,
    claim: claim(route),
    aliases: [],
  };
}

function application(id: string, action: ResolvedInterventionApplication["action"]): ResolvedInterventionApplication {
  return {
    schema_version: 1,
    application_id: id,
    occurrence_id: `occurrence:${id}`,
    route_record_id: "route_a",
    gtfs_route_id: "A",
    treatment_record_id: "treatment_x",
    treatment_family: "bus_lane",
    phase_record_id: "event_one",
    action,
    applicability: "applies",
    extent: { kind: "unknown", record_ids: [], description: null },
    evidence_bindings: [{
      role: "treatment_definition",
      record_id: "treatment_x",
      source_id: "source_fixture",
      evidence_id: "source_fixture#p001_b0001",
    }],
    review_decision_id: `review:${id}`,
    resolution_method: "accepted_review",
  };
}

function transition(
  app: ResolvedInterventionApplication,
  targets: string[],
  results: string[],
): ApplicationPlacementTransition {
  const decisionId = `decision:${app.application_id}`;
  const transitionId = `transition:${createHash("sha256").update(stableJson({
    application_id: app.application_id,
    decision_id: decisionId,
    result_placement_ids: results,
    target_placement_ids: targets,
  } as JsonValue)).digest("hex").slice(0, 24)}`;
  return {
    schema_version: 1,
    transition_id: transitionId,
    application_id: app.application_id,
    application_fingerprint: interventionApplicationFingerprint(app),
    action: app.action,
    target_placement_ids: targets,
    result_placement_ids: results,
    decision_id: decisionId,
    evidence_bindings: app.evidence_bindings,
    reviewer: "fixture",
    reviewed_at: "2026-07-28T00:00:00Z",
    rationale: "Reviewed exact application transition.",
  };
}

describe("intervention placement identity and transitions", () => {
  it("replays establish, alias, scope correction, and existing-survivor merge deterministically", () => {
    const initial = replayInterventionPlacementIdentityOperations([
      establish("01-establish-a", "route-a-treatment-x"),
      establish("02-establish-b", "route-b-treatment-x", "route_b"),
    ]);
    const [first, second] = initial;
    const operations: InterventionPlacementIdentityOperation[] = [
      establish("01-establish-a", "route-a-treatment-x"),
      establish("02-establish-b", "route-b-treatment-x", "route_b"),
      {
        ...base("03-alias"),
        operation: "alias",
        placement_id: first!.placement_id,
        alias: "legacy-placement-a",
      },
      {
        ...base("04-scope"),
        operation: "scope_correction",
        placement_id: first!.placement_id,
        scope: { kind: "bounded_segment", record_ids: ["corridor_one"], description: null },
      },
      {
        ...base("05-merge"),
        operation: "merge",
        predecessor_placement_ids: [first!.placement_id, second!.placement_id].sort(),
        survivor_placement_id: first!.placement_id,
      },
    ];
    const forward = replayInterventionPlacementIdentityOperations(operations);
    const reverse = replayInterventionPlacementIdentityOperations([...operations].reverse());
    expect(reverse).toEqual(forward);
    expect(resolveInterventionPlacement("legacy-placement-a", forward)).toMatchObject({
      state: "redirect",
      placement_id: first!.placement_id,
    });
    expect(resolveInterventionPlacement(second!.placement_id, forward)).toMatchObject({
      state: "redirect",
      placement_id: first!.placement_id,
    });
    expect(forward.find((row) => row.placement_id === first!.placement_id)?.claim_history).toHaveLength(2);
  });

  it("requires explicit lineage for split and rejects founding/alias conflicts", () => {
    const initial = replayInterventionPlacementIdentityOperations([
      establish("01-establish", "founding"),
    ])[0]!;
    const split = replayInterventionPlacementIdentityOperations([
      establish("01-establish", "founding"),
      {
        ...base("02-split"),
        operation: "split",
        predecessor_placement_id: initial.placement_id,
        successors: [
          { founding_key: "successor-a", claim: claim("route_a"), aliases: [] },
          { founding_key: "successor-b", claim: claim("route_b"), aliases: [] },
        ],
      },
    ]);
    expect(split.find((row) => row.placement_id === initial.placement_id)?.successor_placement_ids)
      .toHaveLength(2);
    expect(() => replayInterventionPlacementIdentityOperations([
      establish("01-a", "same"),
      establish("02-b", "same"),
    ])).toThrow("already owned");
  });

  it("enforces add/retain/resume/suspend/remove/modify/unknown action authority", () => {
    const registry = replayInterventionPlacementIdentityOperations([
      establish("01-establish-a", "placement-a"),
      establish("02-establish-b", "placement-b"),
    ]);
    const [first, second] = registry.map((row) => row.placement_id);
    const add = application("application:add", "add");
    const retain = application("application:retain", "retain");
    const resume = application("application:resume", "resume");
    const modify = application("application:modify", "modify");
    const suspend = application("application:suspend", "suspend");
    const remove = application("application:remove", "remove");
    const unknown = application("application:unknown", "unknown");
    expect(validateApplicationPlacementTransitions([
      transition(add, [], [first!]),
      transition(modify, [first!], [first!]),
      transition(retain, [first!], [first!]),
      transition(resume, [first!], [first!]),
      transition(suspend, [first!], []),
      transition(remove, [first!], []),
      transition(unknown, [], []),
    ], [add, modify, retain, resume, suspend, remove, unknown], registry)).toHaveLength(7);
    expect(() => validateApplicationPlacementTransitions(
      [transition(remove, [second!], [])],
      [remove],
      registry,
    )).toThrow("pre-existing target");
    expect(() => validateApplicationPlacementTransitions(
      [transition(add, [], [first!]), transition(suspend, [first!], [second!])],
      [add, suspend],
      registry,
    )).toThrow("cannot establish");
    expect(() => validateApplicationPlacementTransitions(
      [transition(unknown, [], [first!])],
      [unknown],
      registry,
    )).toThrow("nonauthorizing");
  });

  it("requires reviewed lineage for a replacement modify", () => {
    const predecessor = replayInterventionPlacementIdentityOperations([
      establish("01-establish", "predecessor"),
    ])[0]!;
    const registry = replayInterventionPlacementIdentityOperations([
      establish("01-establish", "predecessor"),
      {
        ...base("02-split"),
        operation: "split",
        predecessor_placement_id: predecessor.placement_id,
        successors: [{
          founding_key: "successor",
          claim: claim(),
          aliases: [],
        }, {
          founding_key: "successor-other",
          claim: claim("route_b"),
          aliases: [],
        }],
      },
    ]);
    const successor = registry.find((row) =>
      row.founding_key === "successor"
    )!;
    const add = application("application:01-add", "add");
    const modify = application("application:02-modify", "modify");
    expect(validateApplicationPlacementTransitions([
      transition(add, [], [predecessor.placement_id]),
      transition(modify, [predecessor.placement_id], [successor.placement_id]),
    ], [add, modify], registry)).toHaveLength(2);
    const unrelated = replayInterventionPlacementIdentityOperations([
      establish("01-a", "a"),
      establish("02-b", "b"),
    ]);
    expect(() => validateApplicationPlacementTransitions([
      transition(add, [], [unrelated[0]!.placement_id]),
      transition(modify, [unrelated[0]!.placement_id], [unrelated[1]!.placement_id]),
    ], [add, modify], unrelated)).toThrow("lacks same-placement continuity or lineage");
  });
});
