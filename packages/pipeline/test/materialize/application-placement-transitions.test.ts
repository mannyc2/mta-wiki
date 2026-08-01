import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  interventionApplicationFingerprint,
  validateApplicationPlacementTransitions,
  validateApplicationPlacementTransitionManifests,
  type ApplicationPlacementTransition,
} from "@mta-wiki/pipeline/materialize/application-placement-transitions";
import {
  placementCandidateDispositionId,
  placementCandidateInputFingerprint,
  validatePlacementDecisionProvenance,
  type AcceptedPlacementCandidateDisposition,
} from "@mta-wiki/pipeline/materialize/intervention-placement-candidate-dispositions";
import {
  buildInterventionPlacementFrontier,
  type PlacementCandidateRow,
} from "@mta-wiki/pipeline/materialize/intervention-placement-frontier";
import {
  interventionPlacementRegistryPartition,
  replayInterventionPlacementIdentityOperations,
  resolveInterventionPlacement,
  type InterventionPlacementFoundingClaim,
  type InterventionPlacementIdentityOperation,
} from "@mta-wiki/pipeline/materialize/intervention-placements";
import type { ResolvedInterventionApplication } from "@mta-wiki/pipeline/materialize/resolved-intervention-applications";

function claim(route = "route_a"): InterventionPlacementFoundingClaim {
  return {
    route_record_id: route,
    gtfs_route_id: route.replace("route_", "").toUpperCase(),
    treatment_record_ids: ["treatment_x"],
    treatment_family: "bus_lane",
    scope: { kind: "unknown", record_ids: [], description: null },
  };
}

function operationBase(operationId: string) {
  return {
    schema_version: 1 as const,
    operation_id: operationId,
    decision_id: `decision:${operationId}`,
    candidate_ids: [`placement-candidate:${operationId}`],
    issued_at: "2026-07-28T00:00:00Z",
    batch_id: "identity-fixture-01",
    manifest_sha256: "a".repeat(64),
    primary_reviewer: "reviewer-primary",
    independent_reviewer: "reviewer-independent",
    review_outcome: "agreement" as const,
    adjudicator: null,
    integrator_id: "plan-054-single-placement-integrator",
    rationale: "Reviewed Plan 054 fixture operation.",
  };
}

function establish(operationId: string, foundingKey: string): InterventionPlacementIdentityOperation {
  return {
    ...operationBase(operationId),
    operation: "establish",
    founding_key: foundingKey,
    claim: claim(),
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
    batch_id: "application-fixture-01",
    manifest_sha256: "a".repeat(64),
    primary_reviewer: "reviewer-primary",
    independent_reviewer: "reviewer-independent",
    review_outcome: "agreement",
    adjudicator: null,
    integrator_id: "plan-054-single-placement-integrator",
    accepted_at: "2026-07-28T00:00:00Z",
    rationale: "Reviewed exact application transition.",
  };
}

function canonicalRecord(id: string, kind: MtaCanonicalRecord["record_kind"]): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: "source_fixture",
    source_ids: ["source_fixture"],
    local_observation_id: id,
    local_observation_ids: [id],
    display_name: id,
    raw_text: id,
    payload: {},
    evidence_refs: [{
      source_id: "source_fixture",
      evidence_id: "source_fixture#p001_b0001",
      source_path: "raw/sources/source_fixture/blocks.jsonl",
      block_id: "p001_b0001",
    }],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "reviewed",
    generated_at: "2026-07-28T00:00:00Z",
  } as MtaCanonicalRecord;
}

function disposition(
  candidate: PlacementCandidateRow,
  terminal: AcceptedPlacementCandidateDisposition["disposition"],
  transitionDisposition: AcceptedPlacementCandidateDisposition["transition_disposition"],
  placementIds: string[],
  transitionIds: string[],
  decisionId = `candidate-decision:${candidate.candidate_id}`,
): AcceptedPlacementCandidateDisposition {
  const withoutId = {
    schema_version: 1 as const,
    candidate_id: candidate.candidate_id,
    candidate_input_fingerprint: placementCandidateInputFingerprint(candidate),
    application_id: candidate.application_id,
    disposition: terminal,
    placement_ids: placementIds,
    transition_ids: transitionIds,
    transition_disposition: transitionDisposition,
    decision_id: decisionId,
    batch_id: "application-fixture-01",
    manifest_sha256: "a".repeat(64),
    primary_reviewer: "reviewer-primary",
    independent_reviewer: "reviewer-independent",
    review_outcome: "agreement" as const,
    adjudicator: null,
    integrator_id: "plan-054-single-placement-integrator",
    accepted_at: "2026-07-28T00:00:00Z",
    reason_code: terminal === "resolved_placement"
      ? "accepted_application_transition"
      : "accepted_negative_transition",
    rationale: "The frozen evidence was reviewed independently.",
  };
  return { ...withoutId, disposition_id: placementCandidateDispositionId(withoutId) };
}

const records = [
  canonicalRecord("event_one", "event"),
  canonicalRecord("route_a", "route"),
  canonicalRecord("treatment_x", "treatment_component"),
];

describe("Plan 054 application-placement transition mutation contract", () => {
  it("closes positive and explicit negative application candidates without lifecycle inference", () => {
    const registry = replayInterventionPlacementIdentityOperations([
      establish("01-existing", "existing-placement"),
    ]);
    const add = application("application:add", "add");
    const removeWithoutTarget = application("application:remove-negative", "remove");
    const acceptedTransition = transition(add, [], [registry[0]!.placement_id]);
    const pending = buildInterventionPlacementFrontier({
      canonical_records: records,
      applications: [add, removeWithoutTarget],
      registry,
      transitions: [acceptedTransition],
    });
    const addCandidate = pending.candidate_ledger.find((row) => row.application_id === add.application_id)!;
    const removeCandidate = pending.candidate_ledger.find((row) =>
      row.application_id === removeWithoutTarget.application_id
    )!;
    const closed = buildInterventionPlacementFrontier({
      canonical_records: records,
      applications: [add, removeWithoutTarget],
      registry,
      transitions: [acceptedTransition],
      candidate_dispositions: [
        disposition(
          addCandidate,
          "resolved_placement",
          "accepted_transition",
          [registry[0]!.placement_id],
          [acceptedTransition.transition_id],
          acceptedTransition.decision_id,
        ),
        disposition(removeCandidate, "not_a_placement", "accepted_negative_transition", [], []),
      ],
    });
    expect(closed.summary.counts_by_candidate_disposition.pending_review).toBe(0);
    expect(closed.summary.counts_by_candidate_disposition.resolved_placement).toBe(1);
    expect(closed.summary.counts_by_candidate_disposition.not_a_placement).toBe(1);
    expect(closed.transition_reconciliation).toEqual([
      expect.objectContaining({
        application_id: removeWithoutTarget.application_id,
        disposition: "accepted_negative_transition",
      }),
    ]);
  });

  it("accepts reviewed existing remove targets and rejects remove/suspend result creation", () => {
    const registry = replayInterventionPlacementIdentityOperations([
      establish("01-independent", "independently-reviewed-placement"),
      establish("02-other", "other-placement"),
    ]);
    const remove = application("application:remove", "remove");
    const suspend = application("application:suspend", "suspend");
    expect(validateApplicationPlacementTransitions([
      transition(remove, [registry[0]!.placement_id], []),
    ], [remove], registry)).toHaveLength(1);
    expect(() => validateApplicationPlacementTransitions([
      transition(suspend, [registry[0]!.placement_id], [registry[1]!.placement_id]),
    ], [suspend], registry)).toThrow("cannot establish a result");
  });

  it("accepts transitive reviewed lineage for modify and balances live/redirect/retired identities", () => {
    const predecessor = replayInterventionPlacementIdentityOperations([
      establish("01-predecessor", "predecessor"),
    ])[0]!;
    const firstSplit: InterventionPlacementIdentityOperation[] = [
      establish("01-predecessor", "predecessor"),
      {
        ...operationBase("02-split"),
        operation: "split",
        predecessor_placement_id: predecessor.placement_id,
        successors: [
          { founding_key: "middle", claim: claim(), aliases: [] },
          { founding_key: "middle-other", claim: claim("route_b"), aliases: [] },
        ],
      },
    ];
    const middle = replayInterventionPlacementIdentityOperations(firstSplit)
      .find((row) => row.founding_key === "middle")!;
    const secondSplit: InterventionPlacementIdentityOperation[] = [
      ...firstSplit,
      {
        ...operationBase("03-split-middle"),
        operation: "split",
        predecessor_placement_id: middle.placement_id,
        successors: [
          { founding_key: "final", claim: claim(), aliases: [] },
          { founding_key: "final-other", claim: claim("route_c"), aliases: [] },
        ],
      },
    ];
    const beforeMerge = replayInterventionPlacementIdentityOperations(secondSplit);
    const finalBeforeMerge = beforeMerge.find((row) => row.founding_key === "final")!;
    const finalOther = beforeMerge.find((row) => row.founding_key === "final-other")!;
    const registry = replayInterventionPlacementIdentityOperations([
      ...secondSplit,
      {
        ...operationBase("04-merge"),
        operation: "merge",
        predecessor_placement_ids: [finalBeforeMerge.placement_id, finalOther.placement_id].sort(),
        survivor_placement_id: finalBeforeMerge.placement_id,
      },
    ]);
    const final = registry.find((row) => row.founding_key === "final")!;
    const modify = application("application:modify", "modify");
    expect(validateApplicationPlacementTransitions([
      transition(modify, [predecessor.placement_id], [final.placement_id]),
    ], [modify], registry)).toHaveLength(1);
    expect(interventionPlacementRegistryPartition(registry)).toEqual({
      registry_count: 5,
      live_count: 2,
      redirect_count: 1,
      retired_count: 2,
    });
  });

  it("preserves identity lookup across append-only current-claim correction", () => {
    const initial = replayInterventionPlacementIdentityOperations([
      establish("01-establish", "durable-founding-key"),
    ])[0]!;
    const corrected = replayInterventionPlacementIdentityOperations([
      establish("01-establish", "durable-founding-key"),
      {
        ...operationBase("02-scope-correction"),
        operation: "scope_correction",
        placement_id: initial.placement_id,
        scope: { kind: "bounded_segment", record_ids: ["corridor_one"], description: null },
      },
    ]);
    expect(corrected[0]!.placement_id).toBe(initial.placement_id);
    expect(resolveInterventionPlacement("durable-founding-key", corrected)).toMatchObject({
      placement_id: initial.placement_id,
    });
    expect(corrected[0]!.claim_history).toHaveLength(2);
  });

  it("requires identity mutations and application targets to carry exact independent provenance", () => {
    const add = application("application:establish", "add");
    const remove = application("application:remove-existing", "remove");
    const initial = buildInterventionPlacementFrontier({
      canonical_records: records,
      applications: [add, remove],
      registry: [],
      transitions: [],
    });
    const addCandidate = initial.candidate_ledger.find((row) =>
      row.application_id === add.application_id
    )!;
    const removeCandidate = initial.candidate_ledger.find((row) =>
      row.application_id === remove.application_id
    )!;
    const establishTransitionReceipt = transition(add, [], []);
    const identityOperation: InterventionPlacementIdentityOperation = {
      ...establish("01-reviewed-establish", "reviewed-existing-target"),
      candidate_ids: [addCandidate.candidate_id],
      decision_id: establishTransitionReceipt.decision_id,
      batch_id: establishTransitionReceipt.batch_id,
      manifest_sha256: establishTransitionReceipt.manifest_sha256,
      primary_reviewer: establishTransitionReceipt.primary_reviewer,
      independent_reviewer: establishTransitionReceipt.independent_reviewer,
      review_outcome: establishTransitionReceipt.review_outcome,
      adjudicator: establishTransitionReceipt.adjudicator,
      integrator_id: establishTransitionReceipt.integrator_id,
      issued_at: establishTransitionReceipt.accepted_at,
    };
    const registry = replayInterventionPlacementIdentityOperations([identityOperation]);
    const addTransition = transition(add, [], [registry[0]!.placement_id]);
    const removeTransition = transition(remove, [registry[0]!.placement_id], []);
    const closed = buildInterventionPlacementFrontier({
      canonical_records: records,
      applications: [add, remove],
      registry,
      transitions: [addTransition, removeTransition],
      candidate_dispositions: [
        disposition(
          addCandidate,
          "resolved_placement",
          "accepted_transition",
          [registry[0]!.placement_id],
          [addTransition.transition_id],
          addTransition.decision_id,
        ),
        disposition(
          removeCandidate,
          "resolved_placement",
          "accepted_transition",
          [registry[0]!.placement_id],
          [removeTransition.transition_id],
          removeTransition.decision_id,
        ),
      ],
    });
    expect(() => validatePlacementDecisionProvenance({
      candidate_dispositions: closed.candidate_dispositions,
      candidate_ledger: closed.candidate_ledger,
      identity_operations: [identityOperation],
      registry,
      transitions: [addTransition, removeTransition],
    })).not.toThrow();

    expect(() => validatePlacementDecisionProvenance({
      candidate_dispositions: closed.candidate_dispositions,
      candidate_ledger: closed.candidate_ledger,
      identity_operations: [{ ...identityOperation, decision_id: "decision:drifted" }],
      registry,
      transitions: [addTransition, removeTransition],
    })).toThrow("identity review receipt is inconsistent");

    const selfEstablished = {
      ...identityOperation,
      candidate_ids: [removeCandidate.candidate_id],
      decision_id: removeTransition.decision_id,
    };
    expect(() => validatePlacementDecisionProvenance({
      candidate_dispositions: closed.candidate_dispositions,
      candidate_ledger: closed.candidate_ledger,
      identity_operations: [selfEstablished],
      registry: replayInterventionPlacementIdentityOperations([selfEstablished]),
      transitions: [removeTransition],
    })).toThrow("target lacks independently pre-existing provenance");
  });

  it("validates every accepted transition against exact frozen batch pins", () => {
    const app = application("application:manifest-pinned", "add");
    const value = transition(app, [], ["placement:fixture"]);
    const directory = mkdtempSync(join(tmpdir(), "plan-054-transition-manifest-"));
    const path = join(directory, `${value.batch_id}.json`);
    const manifest = {
      batch_id: value.batch_id,
      candidates: [{
        candidate_id: "placement-candidate:fixture",
        application_id: app.application_id,
        application_fingerprint: value.application_fingerprint,
      }],
      reviewer_assignments: {
        primary_reviewer: value.primary_reviewer,
        required_independent_reviewer: value.independent_reviewer,
        clean_room_adjudicator: "reviewer-adjudicator",
        single_writer_integrator: value.integrator_id,
      },
    };
    const content = JSON.stringify(manifest);
    writeFileSync(path, content);
    const pinned = {
      ...value,
      manifest_sha256: createHash("sha256").update(content).digest("hex"),
    };
    try {
      expect(validateApplicationPlacementTransitionManifests([pinned], directory))
        .toHaveLength(1);
      writeFileSync(path, JSON.stringify({ ...manifest, batch_id: "drifted" }));
      expect(() => validateApplicationPlacementTransitionManifests([pinned], directory))
        .toThrow("frozen batch manifest hash drifted");
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
