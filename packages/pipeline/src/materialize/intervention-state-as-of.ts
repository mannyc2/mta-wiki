import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { InterventionLifecycleAssertion } from "./intervention-lifecycle.js";
import type { InterventionPlacementRegistryEntry } from "./intervention-placements.js";

export type InterventionStateAsOf = {
  schema_version: 1;
  placement_id: string;
  as_of_date: string;
  state:
    | "confirmed_active"
    | "last_confirmed_active"
    | "confirmed_inactive"
    | "planned"
    | "suspended"
    | "conflicted"
    | "unknown";
  supporting_assertion_ids: string[];
  conflicting_assertion_ids: string[];
  explanation_code: string;
  input_fingerprint: string;
};

export function validateInterventionStateAsOfDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!match || month < 1 || month > 12 || day < 1 || day > days[month - 1]!) {
    throw new Error(`state-as-of date must be an ISO day: ${value}`);
  }
}

function covers(
  assertion: InterventionLifecycleAssertion,
  queryDate: string,
): "certain" | "possible" | "no" {
  const time = assertion.valid_time;
  const earliestStart = time.start_earliest;
  const latestStart = time.start_latest;
  const earliestEnd = time.end_earliest;
  const latestEnd = time.end_latest;
  if (time.coverage_kind === "point") {
    if (earliestStart === queryDate && latestStart === queryDate) return "certain";
    if (earliestStart && latestStart && earliestStart <= queryDate && queryDate <= latestStart) return "possible";
    return "no";
  }
  if (time.coverage_kind === "bounded_interval") {
    if (latestStart! <= queryDate && queryDate <= earliestEnd!) return "certain";
    if (earliestStart! <= queryDate && queryDate <= latestEnd!) return "possible";
    return "no";
  }
  const afterStartCertain = latestStart === null || latestStart <= queryDate;
  const afterStartPossible = earliestStart === null || earliestStart <= queryDate;
  const beforeEndCertain = earliestEnd === null || queryDate <= earliestEnd;
  const beforeEndPossible = latestEnd === null || queryDate <= latestEnd;
  if (afterStartCertain && beforeEndCertain) return "certain";
  if (afterStartPossible && beforeEndPossible) return "possible";
  return "no";
}

function assertionEnd(assertion: InterventionLifecycleAssertion): string | null {
  return assertion.valid_time.end_latest ?? assertion.valid_time.start_latest;
}

export function interventionStateAsOf(
  placementId: string,
  assertions: readonly InterventionLifecycleAssertion[],
  queryDate: string,
): InterventionStateAsOf {
  validateInterventionStateAsOfDate(queryDate);
  const subjectAssertions = assertions
    .filter((assertion) =>
      assertion.subject.kind === "placement" &&
      assertion.subject.placement_id === placementId &&
      assertion.review_state !== "rejected"
    )
    .sort((a, b) => a.assertion_id.localeCompare(b.assertion_id));
  const supersededIds = new Set(subjectAssertions
    .filter((assertion) => assertion.review_state === "accepted")
    .flatMap((assertion) => assertion.supersedes_assertion_ids));
  const current = subjectAssertions.filter((assertion) => !supersededIds.has(assertion.assertion_id));
  const pendingConflict = current.filter((assertion) =>
    (assertion.review_state === "conflicted" || assertion.review_state === "pending") &&
    covers(assertion, queryDate) !== "no"
  );
  const accepted = current.filter((assertion) => assertion.review_state === "accepted");
  const certain = accepted.filter((assertion) => covers(assertion, queryDate) === "certain");
  const possible = accepted.filter((assertion) => covers(assertion, queryDate) === "possible");
  const stateGroups = new Map<string, InterventionLifecycleAssertion[]>();
  for (const assertion of certain) {
    const resolved = assertion.state === "active" ? "confirmed_active"
      : assertion.state === "suspended" ? "suspended"
        : ["ended", "cancelled", "superseded"].includes(assertion.state) ? "confirmed_inactive"
          : assertion.state === "planned" ? "planned"
            : "unknown";
    const rows = stateGroups.get(resolved) ?? [];
    rows.push(assertion);
    stateGroups.set(resolved, rows);
  }
  let state: InterventionStateAsOf["state"];
  let explanation: string;
  let supporting: string[] = [];
  let conflicting: string[] = [];
  const materialStates = [...stateGroups.keys()].filter((key) => key !== "unknown");
  if (pendingConflict.length || possible.length || materialStates.length > 1) {
    state = "conflicted";
    explanation = pendingConflict.length
      ? "unresolved_review_conflict"
      : possible.length
        ? "uncertain_valid_time_can_change_result"
        : "contradictory_accepted_states_overlap";
    conflicting = [...pendingConflict, ...possible, ...certain].map((row) => row.assertion_id).sort();
  } else if (materialStates.length === 1) {
    state = materialStates[0] as InterventionStateAsOf["state"];
    explanation = state === "confirmed_active" ? "accepted_active_evidence_covers_date"
      : state === "confirmed_inactive" ? "accepted_inactive_evidence_covers_date"
        : state === "suspended" ? "accepted_suspension_covers_date"
          : "accepted_future_plan";
    supporting = stateGroups.get(materialStates[0]!)!.map((row) => row.assertion_id).sort();
  } else {
    const pastActive = accepted.filter((assertion) =>
      assertion.state === "active" &&
      assertionEnd(assertion) !== null &&
      assertionEnd(assertion)! < queryDate
    );
    const futurePlan = accepted.filter((assertion) =>
      assertion.state === "planned" &&
      assertion.valid_time.start_earliest !== null &&
      assertion.valid_time.start_earliest > queryDate
    );
    if (futurePlan.length) {
      state = "planned";
      explanation = "accepted_plan_begins_after_query_date";
      supporting = futurePlan.map((row) => row.assertion_id).sort();
    } else if (pastActive.length) {
      state = "last_confirmed_active";
      explanation = "historical_active_evidence_does_not_cover_date";
      const latest = [...pastActive].sort((a, b) =>
        (assertionEnd(b) ?? "").localeCompare(assertionEnd(a) ?? "") ||
        a.assertion_id.localeCompare(b.assertion_id)
      )[0]!;
      supporting = [latest.assertion_id];
    } else {
      state = "unknown";
      explanation = accepted.length ? "accepted_evidence_does_not_resolve_date" : "no_accepted_assertion";
    }
  }
  return {
    schema_version: 1,
    placement_id: placementId,
    as_of_date: queryDate,
    state,
    supporting_assertion_ids: supporting,
    conflicting_assertion_ids: conflicting,
    explanation_code: explanation,
    input_fingerprint: createHash("sha256").update(stableJson({
      placement_id: placementId,
      query_date: queryDate,
      assertions: subjectAssertions,
    } as JsonValue)).digest("hex"),
  };
}

export function interventionStatesAsOf(
  placements: readonly InterventionPlacementRegistryEntry[],
  assertions: readonly InterventionLifecycleAssertion[],
  queryDate: string,
): InterventionStateAsOf[] {
  validateInterventionStateAsOfDate(queryDate);
  return placements.filter((placement) => placement.registry_state === "live_identity")
    .map((placement) => interventionStateAsOf(placement.placement_id, assertions, queryDate))
    .sort((a, b) => a.placement_id.localeCompare(b.placement_id));
}
