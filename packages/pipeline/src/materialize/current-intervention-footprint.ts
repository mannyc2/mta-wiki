import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { ApplicationPlacementTransition } from "./application-placement-transitions.js";
import type { InterventionLifecycleAssertion } from "./intervention-lifecycle.js";
import type { InterventionPlacementRegistryEntry } from "./intervention-placements.js";
import {
  interventionStatesAsOf,
  type InterventionStateAsOf,
} from "./intervention-state-as-of.js";

export type CurrentInterventionFootprintRow = {
  schema_version: 1;
  placement_id: string;
  as_of_date: string;
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_ids: string[];
  treatment_family: string;
  scope: InterventionPlacementRegistryEntry["current_claim"]["scope"];
  state: "confirmed_active";
  supporting_assertion_ids: string[];
};

export type CurrentInterventionFootprintReconciliation = {
  schema_version: 1;
  placement_id: string;
  as_of_date: string;
  state: Exclude<InterventionStateAsOf["state"], "confirmed_active">;
  explanation_code: string;
  supporting_assertion_ids: string[];
  conflicting_assertion_ids: string[];
  terminal_decision_ids: string[];
};

export type InterventionLifecycleProjection = {
  assertions: InterventionLifecycleAssertion[];
  states: InterventionStateAsOf[];
  footprint: CurrentInterventionFootprintRow[];
  footprint_reconciliation: CurrentInterventionFootprintReconciliation[];
  history: Array<
    | {
        schema_version: 1;
        history_kind: "application_transition";
        history_id: string;
        transition_id: string;
        application_id: string;
        action: ApplicationPlacementTransition["action"];
        target_placement_ids: string[];
        result_placement_ids: string[];
        assertion_ids: string[];
      }
    | {
        schema_version: 1;
        history_kind: "accepted_placement_assertion";
        history_id: string;
        placement_id: string;
        assertion_id: string;
        state: InterventionLifecycleAssertion["state"];
        valid_time: InterventionLifecycleAssertion["valid_time"];
        document_time: InterventionLifecycleAssertion["document_time"];
      }
  >;
  summary: {
    schema_version: 1;
    as_of_date: string;
    resolved_placement_count: number;
    placements_with_assertions: number;
    placements_without_assertions: number;
    assertion_count: number;
    accepted_assertion_count: number;
    pending_assertion_count: number;
    conflicted_assertion_count: number;
    rejected_assertion_count: number;
    historical_assertion_count: number;
    historical_accepted_count: number;
    historical_pending_count: number;
    historical_conflicted_count: number;
    historical_rejected_count: number;
    transition_count: number;
    state_count: number;
    confirmed_active_count: number;
    reconciliation_count: number;
    counts_by_state: Record<string, number>;
    input_fingerprint: string;
    zero_unexplained_loss: true;
  };
};

function canonical(value: unknown): string { return stableJson(value as JsonValue); }
function histogram(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
const resolvedStateUniverse: InterventionStateAsOf["state"][] = [
  "confirmed_active", "last_confirmed_active", "confirmed_inactive", "planned",
  "suspended", "conflicted", "unknown",
];
function closedHistogram(universe: readonly string[], values: readonly string[]): Record<string, number> {
  return {
    ...Object.fromEntries(universe.map((value) => [value, 0])),
    ...histogram(values),
  };
}

export function buildInterventionLifecycleProjection(input: {
  placements: readonly InterventionPlacementRegistryEntry[];
  transitions: readonly ApplicationPlacementTransition[];
  assertions: readonly InterventionLifecycleAssertion[];
  as_of_date: string;
}): InterventionLifecycleProjection {
  const live = input.placements.filter((placement) => placement.registry_state === "live_identity");
  const placementsById = new Map(live.map((placement) => [placement.placement_id, placement]));
  const states = interventionStatesAsOf(live, input.assertions, input.as_of_date);
  const footprint = states.filter((state) => state.state === "confirmed_active").map((state) => {
    const placement = placementsById.get(state.placement_id)!;
    return {
      schema_version: 1 as const,
      placement_id: placement.placement_id,
      as_of_date: input.as_of_date,
      route_record_id: placement.current_claim.route_record_id,
      gtfs_route_id: placement.current_claim.gtfs_route_id,
      treatment_record_ids: placement.current_claim.treatment_record_ids,
      treatment_family: placement.current_claim.treatment_family,
      scope: placement.current_claim.scope,
      state: "confirmed_active" as const,
      supporting_assertion_ids: state.supporting_assertion_ids,
    };
  });
  const footprintReconciliation = states.filter((state) => state.state !== "confirmed_active")
    .map((state): CurrentInterventionFootprintReconciliation => ({
      schema_version: 1,
      placement_id: state.placement_id,
      as_of_date: input.as_of_date,
      state: state.state as Exclude<InterventionStateAsOf["state"], "confirmed_active">,
      explanation_code: state.explanation_code,
      supporting_assertion_ids: state.supporting_assertion_ids,
      conflicting_assertion_ids: state.conflicting_assertion_ids,
      terminal_decision_ids: state.terminal_decision_ids,
    }));
  const assertionIdsByPlacement = new Map<string, string[]>();
  for (const assertion of input.assertions) {
    if (assertion.subject.kind !== "placement") continue;
    const ids = assertionIdsByPlacement.get(assertion.subject.placement_id) ?? [];
    ids.push(assertion.assertion_id);
    assertionIdsByPlacement.set(assertion.subject.placement_id, ids);
  }
  const transitionHistory: InterventionLifecycleProjection["history"] = input.transitions.map((transition) => ({
    schema_version: 1 as const,
    history_kind: "application_transition" as const,
    history_id: transition.transition_id,
    transition_id: transition.transition_id,
    application_id: transition.application_id,
    action: transition.action,
    target_placement_ids: transition.target_placement_ids,
    result_placement_ids: transition.result_placement_ids,
    assertion_ids: [...new Set([
      ...transition.target_placement_ids,
      ...transition.result_placement_ids,
    ].flatMap((id) => assertionIdsByPlacement.get(id) ?? []))].sort(),
  }));
  const acceptedAssertionHistory: InterventionLifecycleProjection["history"] = input.assertions
    .filter((assertion) =>
      assertion.subject.kind === "placement" && assertion.review_state === "accepted"
    )
    .map((assertion) => ({
      schema_version: 1,
      history_kind: "accepted_placement_assertion",
      history_id: assertion.assertion_id,
      placement_id: assertion.subject.kind === "placement" ? assertion.subject.placement_id : "",
      assertion_id: assertion.assertion_id,
      state: assertion.state,
      valid_time: assertion.valid_time,
      document_time: assertion.document_time,
    }));
  const history = [...transitionHistory, ...acceptedAssertionHistory]
    .sort((a, b) => a.history_id.localeCompare(b.history_id));
  const placementAssertionIds = new Set(input.assertions.flatMap((assertion) =>
    assertion.subject.kind === "placement" ? [assertion.subject.placement_id] : []
  ));
  const historicalAssertions = input.assertions.filter((assertion) =>
    assertion.subject.kind !== "placement"
  );
  const assertionReviewCount = (state: InterventionLifecycleAssertion["review_state"]) =>
    input.assertions.filter((assertion) => assertion.review_state === state).length;
  const historicalReviewCount = (state: InterventionLifecycleAssertion["review_state"]) =>
    historicalAssertions.filter((assertion) => assertion.review_state === state).length;
  const summaryWithoutFingerprint = {
    schema_version: 1 as const,
    as_of_date: input.as_of_date,
    resolved_placement_count: live.length,
    placements_with_assertions: live.filter((placement) =>
      placementAssertionIds.has(placement.placement_id)
    ).length,
    placements_without_assertions: live.filter((placement) =>
      !placementAssertionIds.has(placement.placement_id)
    ).length,
    assertion_count: input.assertions.length,
    accepted_assertion_count: assertionReviewCount("accepted"),
    pending_assertion_count: assertionReviewCount("pending"),
    conflicted_assertion_count: assertionReviewCount("conflicted"),
    rejected_assertion_count: assertionReviewCount("rejected"),
    historical_assertion_count: historicalAssertions.length,
    historical_accepted_count: historicalReviewCount("accepted"),
    historical_pending_count: historicalReviewCount("pending"),
    historical_conflicted_count: historicalReviewCount("conflicted"),
    historical_rejected_count: historicalReviewCount("rejected"),
    transition_count: input.transitions.length,
    state_count: states.length,
    confirmed_active_count: footprint.length,
    reconciliation_count: footprintReconciliation.length,
    counts_by_state: closedHistogram(resolvedStateUniverse, states.map((state) => state.state)),
    zero_unexplained_loss: true as const,
  };
  if (summaryWithoutFingerprint.resolved_placement_count !==
      summaryWithoutFingerprint.confirmed_active_count + summaryWithoutFingerprint.reconciliation_count ||
      summaryWithoutFingerprint.resolved_placement_count !== summaryWithoutFingerprint.state_count ||
      summaryWithoutFingerprint.resolved_placement_count !==
        summaryWithoutFingerprint.placements_with_assertions +
          summaryWithoutFingerprint.placements_without_assertions ||
      summaryWithoutFingerprint.assertion_count !==
        summaryWithoutFingerprint.accepted_assertion_count +
          summaryWithoutFingerprint.pending_assertion_count +
          summaryWithoutFingerprint.conflicted_assertion_count +
          summaryWithoutFingerprint.rejected_assertion_count ||
      summaryWithoutFingerprint.historical_assertion_count !==
        summaryWithoutFingerprint.historical_accepted_count +
          summaryWithoutFingerprint.historical_pending_count +
          summaryWithoutFingerprint.historical_conflicted_count +
          summaryWithoutFingerprint.historical_rejected_count) {
    throw new Error("current intervention footprint partition is unbalanced");
  }
  return {
    assertions: [...input.assertions].sort((a, b) => a.assertion_id.localeCompare(b.assertion_id)),
    states,
    footprint,
    footprint_reconciliation: footprintReconciliation,
    history,
    summary: {
      ...summaryWithoutFingerprint,
      input_fingerprint: createHash("sha256").update(canonical({
        placements: live,
        transitions: input.transitions,
        assertions: input.assertions,
        as_of_date: input.as_of_date,
      })).digest("hex"),
    },
  };
}

function json(value: unknown): string { return `${canonical(value)}\n`; }
function jsonl(values: readonly unknown[]): string {
  return values.map(canonical).join("\n") + (values.length ? "\n" : "");
}
export function interventionLifecycleContents(
  projection: InterventionLifecycleProjection,
): Record<string, string> {
  return {
    "assertions.jsonl": jsonl(projection.assertions),
    "current_intervention_footprint.jsonl": jsonl(projection.footprint),
    "current_intervention_footprint_reconciliation.jsonl": jsonl(projection.footprint_reconciliation),
    "intervention_history.jsonl": jsonl(projection.history),
    "intervention_placement_state_as_of.jsonl": jsonl(projection.states),
    "summary.json": json(projection.summary),
  };
}
export function writeInterventionLifecycleProjection(
  outputDir: string,
  projection: InterventionLifecycleProjection,
): void {
  mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of Object.entries(interventionLifecycleContents(projection))) {
    writeFileSync(join(outputDir, name), content);
  }
}
export function checkInterventionLifecycleProjection(
  outputDir: string,
  projection: InterventionLifecycleProjection,
): void {
  for (const [name, content] of Object.entries(interventionLifecycleContents(projection))) {
    const path = join(outputDir, name);
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      throw new Error(`intervention lifecycle artifact is missing or stale: ${path}`);
    }
  }
}
