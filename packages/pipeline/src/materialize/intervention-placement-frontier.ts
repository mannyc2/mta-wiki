import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { ApplicationPlacementTransition } from "./application-placement-transitions.js";
import {
  parseAcceptedPlacementCandidateDisposition,
  placementCandidateInputFingerprint,
  type AcceptedPlacementCandidateDisposition,
} from "./intervention-placement-candidate-dispositions.js";
import type { InterventionPlacementRegistryEntry } from "./intervention-placements.js";
import type { ResolvedInterventionApplication } from "./resolved-intervention-applications.js";

export const INTERVENTION_PLACEMENT_FRONTIER_VERSION = 1 as const;
export const INTERVENTION_PLACEMENT_RELATION_FAMILIES = [
  "corridor_scope",
  "location_scope",
  "route_scope",
  "timeline_context",
  "treatment_context",
] as const;

export type PlacementObservationDisposition =
  | "candidate_bearing"
  | "included_context"
  | "unrelated_domain_content"
  | "non_authoritative"
  | "unsupported_shape"
  | "invalid";

export type PlacementCandidateDisposition =
  | "resolved_placement"
  | "duplicate_alias"
  | "not_a_placement"
  | "ambiguous"
  | "pending_review"
  | "invalid";

export type PlacementSourceObservationRow = {
  schema_version: 1;
  record_id: string;
  record_kind: string;
  source_ids: string[];
  candidate_ids: string[];
  disposition: PlacementObservationDisposition;
  reason_code: string;
};

export type PlacementCandidateRow = {
  schema_version: 1;
  candidate_id: string;
  origin: "application" | "independent_inventory" | "later_lifecycle";
  application_id: string | null;
  observation_record_ids: string[];
  transition_ids: string[];
  placement_ids: string[];
  disposition: PlacementCandidateDisposition;
  reason_code: string;
};

export type PlacementTransitionReconciliation = {
  schema_version: 1;
  application_id: string;
  reason_code: string;
} & ({
  disposition: "pending_review" | "nonauthorizing_unknown_action";
} | {
  disposition: "accepted_negative_transition";
  candidate_disposition_id: string;
  decision_id: string;
});

export type InterventionPlacementFrontier = {
  cohort: {
    schema_version: 1;
    cohort_id: "intervention-placement-observations-v1";
    examined_record_count: number;
    canonical_input_fingerprint: string;
    predicate_version: 1;
    relation_families: string[];
    examined_record_ids: string[];
  };
  source_observation_ledger: PlacementSourceObservationRow[];
  candidate_ledger: PlacementCandidateRow[];
  candidate_dispositions: AcceptedPlacementCandidateDisposition[];
  transition_reconciliation: PlacementTransitionReconciliation[];
  summary: {
    schema_version: 1;
    examined_observations: number;
    included_observations: number;
    excluded_observations: number;
    candidate_ledger_rows: number;
    application_candidate_count: number;
    transition_count: number;
    transition_reconciliation_count: number;
    placement_registry_count: number;
    counts_by_observation_disposition: Record<string, number>;
    counts_by_candidate_disposition: Record<string, number>;
    frontier_fingerprint: string;
    zero_unexplained_loss: true;
  };
};

const examinedKinds = new Set([
  "event", "treatment_component", "claim", "project", "route", "corridor", "entity",
]);
const relationFamilies = new Set<string>(INTERVENTION_PLACEMENT_RELATION_FAMILIES);

function canonical(value: unknown): string {
  return stableJson(value as JsonValue);
}
function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
function histogram(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
const observationDispositionUniverse: PlacementObservationDisposition[] = [
  "candidate_bearing", "included_context", "unrelated_domain_content",
  "non_authoritative", "unsupported_shape", "invalid",
];
const candidateDispositionUniverse: PlacementCandidateDisposition[] = [
  "resolved_placement", "duplicate_alias", "not_a_placement", "ambiguous",
  "pending_review", "invalid",
];
function closedHistogram(universe: readonly string[], values: readonly string[]): Record<string, number> {
  return {
    ...Object.fromEntries(universe.map((value) => [value, 0])),
    ...histogram(values),
  };
}
function sourceIds(record: MtaCanonicalRecord): string[] {
  return sortedUnique([
    record.source_id,
    ...(record.source_ids ?? []),
    ...record.evidence_refs.map((ref) => ref.source_id),
  ].filter(Boolean));
}
function text(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}
function examined(record: MtaCanonicalRecord): boolean {
  if (examinedKinds.has(record.record_kind)) return true;
  return record.record_kind === "relation" &&
    relationFamilies.has(text(record.payload.relation_family) ?? "");
}
function genericCandidateOrigin(record: MtaCanonicalRecord): PlacementCandidateRow["origin"] | null {
  const lifecycle = text(record.payload.lifecycle_phase) ?? text(record.payload.status) ??
    text(record.payload.assertion_status);
  if (record.record_kind === "event" && lifecycle && lifecycle !== "other") return "later_lifecycle";
  const inventory = [
    text(record.payload.current_status),
    text(record.payload.installation_status),
    text(record.payload.operational_status),
  ].filter(Boolean).join(" ");
  if (inventory && /(active|installed|operational|removed|suspended|ended)/u.test(inventory)) {
    return "independent_inventory";
  }
  return null;
}
function applicationCandidateId(applicationId: string): string {
  return `placement-candidate:${fingerprint(["application", applicationId]).slice(0, 24)}`;
}
function recordCandidateId(recordId: string): string {
  return `placement-candidate:${fingerprint(["canonical", recordId]).slice(0, 24)}`;
}

export function buildInterventionPlacementFrontier(input: {
  canonical_records: readonly MtaCanonicalRecord[];
  applications: readonly ResolvedInterventionApplication[];
  registry: readonly InterventionPlacementRegistryEntry[];
  transitions: readonly ApplicationPlacementTransition[];
  candidate_dispositions?: readonly AcceptedPlacementCandidateDisposition[];
}): InterventionPlacementFrontier {
  const examinedRecords = input.canonical_records.filter(examined)
    .sort((a, b) => a.record_id.localeCompare(b.record_id));
  const transitionsByApplication = new Map(input.transitions.map((row) => [row.application_id, row]));
  const applicationBindingIds = new Map<string, string[]>();
  for (const application of input.applications) {
    const ids = sortedUnique([
      application.route_record_id,
      application.treatment_record_id,
      ...(application.phase_record_id ? [application.phase_record_id] : []),
      ...application.extent.record_ids,
      ...application.evidence_bindings.map((binding) => binding.record_id),
    ]);
    for (const id of ids) {
      const applications = applicationBindingIds.get(id) ?? [];
      applications.push(application.application_id);
      applicationBindingIds.set(id, applications);
    }
  }
  const sourceLedger: PlacementSourceObservationRow[] = examinedRecords.map((record) => {
    let disposition: PlacementObservationDisposition;
    let reasonCode: string;
    let candidateIds: string[] = [];
    if (record.evidence_refs.length === 0) {
      disposition = "invalid";
      reasonCode = "missing_canonical_evidence";
    } else if (
      record.record_kind === "relation" &&
      (typeof record.payload.subject_id !== "string" || typeof record.payload.object_id !== "string")
    ) {
      disposition = "unsupported_shape";
      reasonCode = "placement_relation_missing_endpoints";
    } else if (record.truth_status !== "source_stated" || record.review_state === "quarantined") {
      disposition = "non_authoritative";
      reasonCode = "truth_or_review_state_not_authoritative";
    } else {
      const boundApplications = applicationBindingIds.get(record.record_id) ?? [];
      const origin = genericCandidateOrigin(record);
      if (boundApplications.length) {
        disposition = "included_context";
        reasonCode = "exact_application_membership";
        candidateIds = boundApplications.map(applicationCandidateId).sort();
      } else if (origin) {
        disposition = "candidate_bearing";
        reasonCode = origin === "later_lifecycle"
          ? "generic_lifecycle_predicate"
          : "generic_inventory_predicate";
        candidateIds = [recordCandidateId(record.record_id)];
      } else if (record.record_kind === "relation" || ["route", "corridor", "project", "entity"].includes(record.record_kind)) {
        disposition = "included_context";
        reasonCode = "placement_context_only";
      } else {
        disposition = "unrelated_domain_content";
        reasonCode = "no_placement_predicate_match";
      }
    }
    return {
      schema_version: 1,
      record_id: record.record_id,
      record_kind: record.record_kind,
      source_ids: sourceIds(record),
      candidate_ids: candidateIds,
      disposition,
      reason_code: reasonCode,
    };
  });
  const candidates: PlacementCandidateRow[] = input.applications.map((application) => {
    const transition = transitionsByApplication.get(application.application_id);
    const placementIds = transition
      ? sortedUnique([...transition.target_placement_ids, ...transition.result_placement_ids])
      : [];
    return {
      schema_version: 1,
      candidate_id: applicationCandidateId(application.application_id),
      origin: "application",
      application_id: application.application_id,
      observation_record_ids: sortedUnique([
        application.route_record_id,
        application.treatment_record_id,
        ...(application.phase_record_id ? [application.phase_record_id] : []),
        ...application.extent.record_ids,
        ...application.evidence_bindings.map((binding) => binding.record_id),
      ]),
      transition_ids: transition ? [transition.transition_id] : [],
      placement_ids: placementIds,
      disposition: "pending_review",
      reason_code: transition
        ? "accepted_candidate_disposition_required"
        : application.action === "unknown"
          ? "application_action_unknown"
          : "missing_application_transition",
    };
  });
  for (const row of sourceLedger.filter((row) => row.disposition === "candidate_bearing")) {
    candidates.push({
      schema_version: 1,
      candidate_id: row.candidate_ids[0]!,
      origin: row.reason_code === "generic_lifecycle_predicate"
        ? "later_lifecycle"
        : "independent_inventory",
      application_id: null,
      observation_record_ids: [row.record_id],
      transition_ids: [],
      placement_ids: [],
      disposition: "pending_review",
      reason_code: "requires_accepted_declarative_mapping",
    });
  }
  candidates.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  if (new Set(candidates.map((row) => row.candidate_id)).size !== candidates.length) {
    throw new Error("duplicate intervention placement candidate id");
  }
  const candidateById = new Map(candidates.map((row) => [row.candidate_id, row]));
  const placementIds = new Set(input.registry.map((row) => row.placement_id));
  const transitionById = new Map(input.transitions.map((row) => [row.transition_id, row]));
  const candidateDispositions = (input.candidate_dispositions ?? []).map((value, index) =>
    parseAcceptedPlacementCandidateDisposition(value, `candidate disposition[${index}]`)
  ).sort((a, b) => a.disposition_id.localeCompare(b.disposition_id));
  if (new Set(candidateDispositions.map((row) => row.disposition_id)).size !== candidateDispositions.length ||
      new Set(candidateDispositions.map((row) => row.candidate_id)).size !== candidateDispositions.length ||
      new Set(candidateDispositions.map((row) => row.decision_id)).size !== candidateDispositions.length) {
    throw new Error("accepted placement candidate dispositions must be unique per disposition, candidate, and decision");
  }
  for (const decision of candidateDispositions) {
    const candidate = candidateById.get(decision.candidate_id);
    if (!candidate) throw new Error(`${decision.disposition_id}: missing frozen candidate`);
    if (decision.candidate_input_fingerprint !== placementCandidateInputFingerprint(candidate) ||
        decision.application_id !== candidate.application_id) {
      throw new Error(`${decision.disposition_id}: stale candidate binding`);
    }
    if (decision.placement_ids.some((id) => !placementIds.has(id))) {
      throw new Error(`${decision.disposition_id}: unknown placement binding`);
    }
    if (decision.transition_ids.some((id) => !transitionById.has(id))) {
      throw new Error(`${decision.disposition_id}: unknown transition binding`);
    }
    const transition = candidate.application_id
      ? transitionsByApplication.get(candidate.application_id)
      : undefined;
    if (candidate.application_id !== null) {
      if (decision.transition_disposition === "not_applicable") {
        throw new Error(`${decision.disposition_id}: application candidate requires transition reconciliation`);
      }
      if (decision.transition_disposition === "accepted_transition") {
        if (!transition) throw new Error(`${decision.disposition_id}: accepted transition is missing`);
        if (transition.decision_id !== decision.decision_id ||
            transition.batch_id !== decision.batch_id ||
            transition.manifest_sha256 !== decision.manifest_sha256 ||
            transition.primary_reviewer !== decision.primary_reviewer ||
            transition.independent_reviewer !== decision.independent_reviewer ||
            transition.review_outcome !== decision.review_outcome ||
            transition.adjudicator !== decision.adjudicator ||
            transition.integrator_id !== decision.integrator_id ||
            transition.accepted_at !== decision.accepted_at) {
          throw new Error(`${decision.disposition_id}: transition review receipt is inconsistent`);
        }
        const expectedTransitionIds = [transition.transition_id];
        const expectedPlacementIds = sortedUnique([
          ...transition.target_placement_ids,
          ...transition.result_placement_ids,
        ]);
        if (canonical(decision.transition_ids) !== canonical(expectedTransitionIds) ||
            canonical(decision.placement_ids) !== canonical(expectedPlacementIds) ||
            decision.disposition !== "resolved_placement" || expectedPlacementIds.length === 0) {
          throw new Error(`${decision.disposition_id}: positive transition disposition is inconsistent`);
        }
      } else if (transition || decision.transition_ids.length || decision.placement_ids.length ||
          decision.disposition === "resolved_placement" || decision.disposition === "duplicate_alias") {
        throw new Error(`${decision.disposition_id}: negative transition disposition must be nonauthorizing`);
      }
    } else {
      if (decision.transition_disposition !== "not_applicable" || decision.transition_ids.length) {
        throw new Error(`${decision.disposition_id}: non-application candidate cannot reconcile a transition`);
      }
      if ((decision.disposition === "resolved_placement" || decision.disposition === "duplicate_alias") !==
          (decision.placement_ids.length > 0)) {
        throw new Error(`${decision.disposition_id}: declarative placement binding is inconsistent`);
      }
    }
    candidate.transition_ids = decision.transition_ids;
    candidate.placement_ids = decision.placement_ids;
    candidate.disposition = decision.disposition;
    candidate.reason_code = decision.reason_code;
  }
  const dispositionByApplication = new Map(candidateDispositions.flatMap((row) =>
    row.application_id === null ? [] : [[row.application_id, row] as const]
  ));
  const transitionReconciliation = input.applications
    .filter((application) => !transitionsByApplication.has(application.application_id))
    .map((application): PlacementTransitionReconciliation => {
      const decision = dispositionByApplication.get(application.application_id);
      if (decision?.transition_disposition === "accepted_negative_transition") {
        return {
          schema_version: 1,
          application_id: application.application_id,
          disposition: "accepted_negative_transition",
          reason_code: decision.reason_code,
          candidate_disposition_id: decision.disposition_id,
          decision_id: decision.decision_id,
        };
      }
      return {
        schema_version: 1,
        application_id: application.application_id,
        disposition: application.action === "unknown"
          ? "nonauthorizing_unknown_action"
          : "pending_review",
        reason_code: application.action === "unknown"
          ? "unknown_action_cannot_authorize_placement_transition"
          : "accepted_transition_required",
      };
    }).sort((a, b) => a.application_id.localeCompare(b.application_id));
  if (input.applications.length !== input.transitions.length + transitionReconciliation.length) {
    throw new Error("application transition reconciliation is unbalanced");
  }
  const included = sourceLedger.filter((row) =>
    row.disposition === "candidate_bearing" || row.disposition === "included_context"
  ).length;
  const cohort = {
    schema_version: 1 as const,
    cohort_id: "intervention-placement-observations-v1" as const,
    examined_record_count: examinedRecords.length,
    canonical_input_fingerprint: fingerprint(examinedRecords),
    predicate_version: 1 as const,
    relation_families: [...INTERVENTION_PLACEMENT_RELATION_FAMILIES],
    examined_record_ids: examinedRecords.map((record) => record.record_id),
  };
  const summaryWithoutFingerprint = {
    schema_version: 1 as const,
    examined_observations: sourceLedger.length,
    included_observations: included,
    excluded_observations: sourceLedger.length - included,
    candidate_ledger_rows: candidates.length,
    application_candidate_count: input.applications.length,
    transition_count: input.transitions.length,
    transition_reconciliation_count: transitionReconciliation.length,
    placement_registry_count: input.registry.length,
    counts_by_observation_disposition: closedHistogram(
      observationDispositionUniverse,
      sourceLedger.map((row) => row.disposition),
    ),
    counts_by_candidate_disposition: closedHistogram(
      candidateDispositionUniverse,
      candidates.map((row) => row.disposition),
    ),
    zero_unexplained_loss: true as const,
  };
  const summary = {
    ...summaryWithoutFingerprint,
    frontier_fingerprint: fingerprint({
      cohort,
      source_observation_ledger: sourceLedger,
      candidate_ledger: candidates,
      ...(candidateDispositions.length ? { candidate_dispositions: candidateDispositions } : {}),
      transition_reconciliation: transitionReconciliation,
      summary: summaryWithoutFingerprint,
    }),
  };
  if (summary.examined_observations !== summary.included_observations + summary.excluded_observations ||
      summary.candidate_ledger_rows !== Object.values(summary.counts_by_candidate_disposition)
        .reduce((sum, count) => sum + count, 0)) {
    throw new Error("intervention placement frontier arithmetic is unbalanced");
  }
  return {
    cohort,
    source_observation_ledger: sourceLedger,
    candidate_ledger: candidates,
    candidate_dispositions: candidateDispositions,
    transition_reconciliation: transitionReconciliation,
    summary,
  };
}

function json(value: unknown): string { return `${canonical(value)}\n`; }
function jsonl(values: readonly unknown[]): string {
  return values.map(canonical).join("\n") + (values.length ? "\n" : "");
}

export function interventionPlacementFrontierContents(input: {
  frontier: InterventionPlacementFrontier;
  registry: readonly InterventionPlacementRegistryEntry[];
  transitions: readonly ApplicationPlacementTransition[];
}): Record<string, string> {
  return {
    "candidate_ledger.jsonl": jsonl(input.frontier.candidate_ledger),
    ...(input.frontier.candidate_dispositions.length
      ? { "candidate_dispositions.jsonl": jsonl(input.frontier.candidate_dispositions) }
      : {}),
    "cohort.json": json(input.frontier.cohort),
    "registry.jsonl": jsonl(input.registry),
    "source_observation_ledger.jsonl": jsonl(input.frontier.source_observation_ledger),
    "summary.json": json(input.frontier.summary),
    "transition_reconciliation.jsonl": jsonl(input.frontier.transition_reconciliation),
    "transitions.jsonl": jsonl(input.transitions),
  };
}

export function writeInterventionPlacementFrontier(
  outputDir: string,
  input: Parameters<typeof interventionPlacementFrontierContents>[0],
): void {
  mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of Object.entries(interventionPlacementFrontierContents(input))) {
    writeFileSync(join(outputDir, name), content);
  }
}

export function checkInterventionPlacementFrontier(
  outputDir: string,
  input: Parameters<typeof interventionPlacementFrontierContents>[0],
): void {
  for (const [name, content] of Object.entries(interventionPlacementFrontierContents(input))) {
    const path = join(outputDir, name);
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      throw new Error(`intervention placement frontier artifact is missing or stale: ${path}`);
    }
  }
}
