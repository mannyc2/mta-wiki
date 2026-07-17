import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord, MtaObservationKind } from "@mta-wiki/db/types";

export const RELATIONSHIP_DISPOSITION_SCHEMA_VERSION = 1 as const;
export const RELATIONSHIP_DISPOSITION_CONTRACT_ID = "relationship-dispositions-v1" as const;

export type RelationshipDispositionSelector = "operational_event" | "bus_lane_family_treatment";

export type RelationshipDispositionPrimary =
  | "eligible_occurrence_present"
  | "reviewed_non_projectable_required_roles_unproven"
  | "reviewed_non_projectable_terminal_source_absence"
  | "reviewed_non_projectable_occurrence_excluded"
  | "physical_scope_satisfied"
  | "non_physical_enforcement_or_control"
  | "non_lane_supporting_feature"
  | "aggregate_or_unbounded_treatment"
  | "reviewed_non_projectable_physical_scope_unproven";

export type RelationshipDispositionInvestigation = {
  method: "canonical_graph_and_bound_source_review" | "canonical_graph_source_and_external_acquisition_review";
  source_ids_checked: string[];
  graph_record_ids_checked: string[];
  gap_ids_checked: string[];
  acquisition_receipt_ids: string[];
  exact_supported_claims: string[];
  exact_unsupported_claims: string[];
};

export type RelationshipDispositionDecision = {
  schema_version: typeof RELATIONSHIP_DISPOSITION_SCHEMA_VERSION;
  contract_id: typeof RELATIONSHIP_DISPOSITION_CONTRACT_ID;
  decision_id: string;
  selector: RelationshipDispositionSelector;
  record_id: string;
  record_kind: "event" | "treatment_component";
  primary_disposition: RelationshipDispositionPrimary;
  study_projectable: boolean;
  waiver: boolean;
  reviewed_at: string;
  reviewed_by: string;
  reason: string;
  reason_codes: string[];
  evidence_ids: string[];
  related_record_ids: string[];
  occurrence_ids: string[];
  required_roles_satisfied: string[];
  required_roles_missing: string[];
  investigation: RelationshipDispositionInvestigation;
};

export type RelationshipDispositionLedger = {
  decisions: RelationshipDispositionDecision[];
  byRecordId: Map<string, RelationshipDispositionDecision>;
};

type RelationshipDispositionRoleContract = {
  /** These roles must be partitioned exactly between required_roles_satisfied and
   * required_roles_missing. Adding a role is therefore a versioned contract change rather than
   * an ad-hoc way to obtain a broader waiver. */
  required_roles: readonly string[];
  /** Supported-claim detail may be more precise than the role name, but only these versioned
   * administrative/detail claims may appear in addition to every satisfied role. */
  supplemental_supported_claims: readonly string[];
};

const operationalEventRoles = [
  "canonical_event_identity",
  "operational_onset",
  "phase_identity",
  "realized_status",
  "route_scope",
  "timeline_subject",
  "treatment_scope",
] as const;

/** Exact v1 waiver vocabulary by selector and primary disposition. This is intentionally a
 * per-disposition contract: an occurrence-exclusion role cannot be smuggled into an ordinary
 * missing-role waiver, and a physical-scope review cannot waive unrelated onset/route roles. */
export const RELATIONSHIP_DISPOSITION_ROLE_CONTRACT_V1 = {
  eligible_occurrence_present: {
    required_roles: operationalEventRoles,
    supplemental_supported_claims: ["evidence_binding"],
  },
  reviewed_non_projectable_required_roles_unproven: {
    required_roles: operationalEventRoles,
    supplemental_supported_claims: ["evidence_binding"],
  },
  reviewed_non_projectable_terminal_source_absence: {
    required_roles: operationalEventRoles,
    supplemental_supported_claims: ["evidence_binding"],
  },
  reviewed_non_projectable_occurrence_excluded: {
    required_roles: operationalEventRoles,
    supplemental_supported_claims: ["evidence_binding"],
  },
  physical_scope_satisfied: {
    required_roles: ["physical_scope"],
    supplemental_supported_claims: [
      "evidence_backed_canonical_physical_scope",
    ],
  },
  non_physical_enforcement_or_control: {
    required_roles: [
      "physical_scope",
      "typed_non_projectable_disposition",
    ],
    supplemental_supported_claims: [
      "typed_disposition:non_physical_enforcement_or_control",
    ],
  },
  non_lane_supporting_feature: {
    required_roles: [
      "physical_scope",
      "typed_non_projectable_disposition",
    ],
    supplemental_supported_claims: [
      "typed_disposition:non_lane_supporting_feature",
    ],
  },
  aggregate_or_unbounded_treatment: {
    required_roles: [
      "physical_scope",
      "typed_non_projectable_disposition",
    ],
    supplemental_supported_claims: [
      "typed_disposition:aggregate_or_unbounded_treatment",
    ],
  },
  reviewed_non_projectable_physical_scope_unproven: {
    required_roles: [
      "physical_scope",
      "typed_non_projectable_disposition",
    ],
    supplemental_supported_claims: [
      "typed_disposition:reviewed_non_projectable_physical_scope_unproven",
    ],
  },
} as const satisfies Record<
  RelationshipDispositionPrimary,
  RelationshipDispositionRoleContract
>;

export const RELATIONSHIP_DISPOSITION_OCCURRENCE_EXCLUSION_REASON_CODES_V1 = [
  "unsupported_bundle_analysis_family",
] as const;

export function relationshipDispositionRoot(rootDir = repoRoot): string {
  return join(rootDir, "data", "relationship-integrity", "dispositions", "v1");
}

export function operationalEventDispositionPath(rootDir = repoRoot): string {
  return join(relationshipDispositionRoot(rootDir), "operational-events", "review.jsonl");
}

export function busLaneTreatmentDispositionPath(rootDir = repoRoot): string {
  return join(relationshipDispositionRoot(rootDir), "bus-lane-treatments", "review.jsonl");
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`${path} must be an array of non-empty strings`);
  }
  const result = value.map((entry) => String(entry).trim());
  if (new Set(result).size !== result.length) throw new Error(`${path} must not contain duplicates`);
  if (result.join("\n") !== [...result].sort((left, right) => left.localeCompare(right)).join("\n")) {
    throw new Error(`${path} must be sorted`);
  }
  return result;
}

const selectors = new Set<RelationshipDispositionSelector>(["operational_event", "bus_lane_family_treatment"]);
const dispositions = new Set<RelationshipDispositionPrimary>([
  "eligible_occurrence_present",
  "reviewed_non_projectable_required_roles_unproven",
  "reviewed_non_projectable_terminal_source_absence",
  "reviewed_non_projectable_occurrence_excluded",
  "physical_scope_satisfied",
  "non_physical_enforcement_or_control",
  "non_lane_supporting_feature",
  "aggregate_or_unbounded_treatment",
  "reviewed_non_projectable_physical_scope_unproven",
]);
const operationalEventDispositions = new Set<RelationshipDispositionPrimary>([
  "eligible_occurrence_present",
  "reviewed_non_projectable_required_roles_unproven",
  "reviewed_non_projectable_terminal_source_absence",
  "reviewed_non_projectable_occurrence_excluded",
]);
const busLaneTreatmentDispositions = new Set<RelationshipDispositionPrimary>([
  "physical_scope_satisfied",
  "non_physical_enforcement_or_control",
  "non_lane_supporting_feature",
  "aggregate_or_unbounded_treatment",
  "reviewed_non_projectable_physical_scope_unproven",
]);

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function evidenceSourceId(evidenceId: string, path: string): string {
  const separator = evidenceId.indexOf("#");
  if (separator <= 0 || separator === evidenceId.length - 1 || evidenceId.indexOf("#", separator + 1) >= 0) {
    throw new Error(`${path} must use the exact source_id#block_id identity`);
  }
  return evidenceId.slice(0, separator);
}

function assertRoleContract(input: {
  primaryDisposition: RelationshipDispositionPrimary;
  requiredRolesSatisfied: readonly string[];
  requiredRolesMissing: readonly string[];
  exactSupportedClaims: readonly string[];
  exactUnsupportedClaims: readonly string[];
  path: string;
}): void {
  const contract = RELATIONSHIP_DISPOSITION_ROLE_CONTRACT_V1[input.primaryDisposition];
  const expectedRoles = [...contract.required_roles].sort((left, right) => left.localeCompare(right));
  const satisfied = [...input.requiredRolesSatisfied].sort((left, right) => left.localeCompare(right));
  const missing = [...input.requiredRolesMissing].sort((left, right) => left.localeCompare(right));
  const observedRoles = [...new Set([...satisfied, ...missing])].sort((left, right) => left.localeCompare(right));
  const overlappingRoles = satisfied.filter((role) => missing.includes(role));
  if (overlappingRoles.length > 0) {
    throw new Error(`${input.path} satisfied and missing roles overlap: ${overlappingRoles.join(", ")}`);
  }
  if (!sameStrings(observedRoles, expectedRoles)) {
    throw new Error(
      `${input.path} must exactly partition the versioned ${input.primaryDisposition} role contract; ` +
      `expected ${expectedRoles.join(", ")}; found ${observedRoles.join(", ")}`,
    );
  }
  const unsupported = [...input.exactUnsupportedClaims].sort((left, right) => left.localeCompare(right));
  if (!sameStrings(unsupported, missing)) {
    throw new Error(
      `${input.path}.investigation.exact_unsupported_claims must exactly match required_roles_missing`,
    );
  }
  const supported = new Set(input.exactSupportedClaims);
  const unsupportedSet = new Set(input.exactUnsupportedClaims);
  const missingSupport = satisfied.filter((role) => !supported.has(role));
  if (missingSupport.length > 0) {
    throw new Error(
      `${input.path}.investigation.exact_supported_claims must include every satisfied role: ${missingSupport.join(", ")}`,
    );
  }
  const contradictoryClaims = input.exactSupportedClaims.filter((claim) => unsupportedSet.has(claim));
  if (contradictoryClaims.length > 0) {
    throw new Error(
      `${input.path} supported and unsupported claims overlap: ${contradictoryClaims.join(", ")}`,
    );
  }
  const allowedSupportedClaims = new Set<string>([
    ...contract.required_roles,
    ...contract.supplemental_supported_claims,
  ]);
  const unexpectedSupportedClaims = input.exactSupportedClaims.filter((claim) => !allowedSupportedClaims.has(claim));
  if (unexpectedSupportedClaims.length > 0) {
    throw new Error(
      `${input.path}.investigation.exact_supported_claims contains unversioned claims: ${unexpectedSupportedClaims.join(", ")}`,
    );
  }
}

function parseInvestigation(value: unknown, path: string): RelationshipDispositionInvestigation {
  const input = object(value, path);
  const allowed = new Set([
    "method",
    "source_ids_checked",
    "graph_record_ids_checked",
    "gap_ids_checked",
    "acquisition_receipt_ids",
    "exact_supported_claims",
    "exact_unsupported_claims",
  ]);
  const extra = Object.keys(input).filter((key) => !allowed.has(key));
  if (extra.length > 0) throw new Error(`${path} has unexpected fields: ${extra.sort().join(", ")}`);
  const method = nonEmpty(input.method, `${path}.method`);
  if (method !== "canonical_graph_and_bound_source_review" && method !== "canonical_graph_source_and_external_acquisition_review") {
    throw new Error(`${path}.method is unsupported`);
  }
  const sourceIdsChecked = strings(input.source_ids_checked, `${path}.source_ids_checked`);
  if (sourceIdsChecked.length === 0) throw new Error(`${path}.source_ids_checked must not be empty`);
  return {
    method,
    source_ids_checked: sourceIdsChecked,
    graph_record_ids_checked: strings(input.graph_record_ids_checked, `${path}.graph_record_ids_checked`),
    gap_ids_checked: strings(input.gap_ids_checked, `${path}.gap_ids_checked`),
    acquisition_receipt_ids: strings(input.acquisition_receipt_ids, `${path}.acquisition_receipt_ids`),
    exact_supported_claims: strings(input.exact_supported_claims, `${path}.exact_supported_claims`),
    exact_unsupported_claims: strings(input.exact_unsupported_claims, `${path}.exact_unsupported_claims`),
  };
}

export function parseRelationshipDispositionDecision(value: unknown, path: string): RelationshipDispositionDecision {
  const input = object(value, path);
  const allowed = new Set([
    "schema_version",
    "contract_id",
    "decision_id",
    "selector",
    "record_id",
    "record_kind",
    "primary_disposition",
    "study_projectable",
    "waiver",
    "reviewed_at",
    "reviewed_by",
    "reason",
    "reason_codes",
    "evidence_ids",
    "related_record_ids",
    "occurrence_ids",
    "required_roles_satisfied",
    "required_roles_missing",
    "investigation",
  ]);
  const extra = Object.keys(input).filter((key) => !allowed.has(key));
  if (extra.length > 0) throw new Error(`${path} has unexpected fields: ${extra.sort().join(", ")}`);
  if (input.schema_version !== RELATIONSHIP_DISPOSITION_SCHEMA_VERSION) throw new Error(`${path}.schema_version must be 1`);
  if (input.contract_id !== RELATIONSHIP_DISPOSITION_CONTRACT_ID) {
    throw new Error(`${path}.contract_id must be ${RELATIONSHIP_DISPOSITION_CONTRACT_ID}`);
  }
  const selector = nonEmpty(input.selector, `${path}.selector`) as RelationshipDispositionSelector;
  if (!selectors.has(selector)) throw new Error(`${path}.selector is unsupported`);
  const recordKind = nonEmpty(input.record_kind, `${path}.record_kind`);
  if (recordKind !== "event" && recordKind !== "treatment_component") throw new Error(`${path}.record_kind is unsupported`);
  if ((selector === "operational_event") !== (recordKind === "event")) throw new Error(`${path} selector and record_kind disagree`);
  const primaryDisposition = nonEmpty(input.primary_disposition, `${path}.primary_disposition`) as RelationshipDispositionPrimary;
  if (!dispositions.has(primaryDisposition)) throw new Error(`${path}.primary_disposition is unsupported`);
  if (typeof input.study_projectable !== "boolean" || typeof input.waiver !== "boolean") {
    throw new Error(`${path}.study_projectable and waiver must be booleans`);
  }
  if (input.waiver && input.study_projectable) throw new Error(`${path} waiver must never make a record study-projectable`);
  const reviewedAt = nonEmpty(input.reviewed_at, `${path}.reviewed_at`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(reviewedAt)) throw new Error(`${path}.reviewed_at must be YYYY-MM-DD`);
  const evidenceIds = strings(input.evidence_ids, `${path}.evidence_ids`);
  if (evidenceIds.length === 0) throw new Error(`${path}.evidence_ids must not be empty`);
  const occurrenceIds = strings(input.occurrence_ids, `${path}.occurrence_ids`);
  const requiredRolesSatisfied = strings(input.required_roles_satisfied, `${path}.required_roles_satisfied`);
  const requiredRolesMissing = strings(input.required_roles_missing, `${path}.required_roles_missing`);
  const reasonCodes = strings(input.reason_codes, `${path}.reason_codes`);
  const investigation = parseInvestigation(input.investigation, `${path}.investigation`);
  if (input.waiver && reasonCodes.length === 0) {
    throw new Error(`${path}.reason_codes must identify why the reviewed waiver is non-projectable`);
  }
  for (const evidenceId of evidenceIds) {
    const sourceId = evidenceSourceId(evidenceId, `${path}.evidence_ids`);
    if (!investigation.source_ids_checked.includes(sourceId)) {
      throw new Error(
        `${path}.investigation.source_ids_checked does not include evidence source ${sourceId}`,
      );
    }
  }
  if (selector === "operational_event") {
    if (!operationalEventDispositions.has(primaryDisposition)) {
      throw new Error(`${path}.primary_disposition is not valid for operational_event`);
    }
    const eligible = primaryDisposition === "eligible_occurrence_present";
    if (input.study_projectable !== eligible || input.waiver === eligible) {
      throw new Error(`${path} operational-event disposition/projectability/waiver semantics disagree`);
    }
    if (eligible && (occurrenceIds.length === 0 || requiredRolesMissing.length > 0)) {
      throw new Error(`${path} projectable operational event must identify an eligible occurrence with no missing roles`);
    }
    const excludedOccurrence = primaryDisposition === "reviewed_non_projectable_occurrence_excluded";
    if (!eligible && excludedOccurrence !== (occurrenceIds.length > 0)) {
      throw new Error(`${path} only reviewed_non_projectable_occurrence_excluded may bind ineligible occurrence ids`);
    }
    if (excludedOccurrence) {
      if (requiredRolesMissing.length > 0) {
        throw new Error(`${path} reviewed occurrence exclusion must retain all relationship roles as satisfied`);
      }
      if (!RELATIONSHIP_DISPOSITION_OCCURRENCE_EXCLUSION_REASON_CODES_V1.some((code) => reasonCodes.includes(code))) {
        throw new Error(`${path} reviewed occurrence exclusion lacks a versioned exclusion reason code`);
      }
    } else if (!eligible && requiredRolesMissing.length === 0) {
      throw new Error(`${path} non-projectable operational event must identify the exact missing role`);
    }
  } else {
    if (!busLaneTreatmentDispositions.has(primaryDisposition)) {
      throw new Error(`${path}.primary_disposition is not valid for bus_lane_family_treatment`);
    }
    if (input.study_projectable || occurrenceIds.length > 0) {
      throw new Error(`${path} physical-scope review alone must never make a treatment study-projectable or bind an occurrence`);
    }
    const satisfied = primaryDisposition === "physical_scope_satisfied";
    if (input.waiver === satisfied) {
      throw new Error(`${path} bus-lane physical-scope disposition/waiver semantics disagree`);
    }
    if (satisfied && (!requiredRolesSatisfied.includes("physical_scope") || requiredRolesMissing.length > 0)) {
      throw new Error(`${path} physical_scope_satisfied must satisfy physical_scope with no missing roles`);
    }
    if (!satisfied && (!requiredRolesSatisfied.includes("typed_non_projectable_disposition") || !requiredRolesMissing.includes("physical_scope"))) {
      throw new Error(`${path} non-projectable bus-lane disposition must explicitly waive the missing physical_scope role`);
    }
  }
  assertRoleContract({
    primaryDisposition,
    requiredRolesSatisfied,
    requiredRolesMissing,
    exactSupportedClaims: investigation.exact_supported_claims,
    exactUnsupportedClaims: investigation.exact_unsupported_claims,
    path,
  });
  return {
    schema_version: RELATIONSHIP_DISPOSITION_SCHEMA_VERSION,
    contract_id: RELATIONSHIP_DISPOSITION_CONTRACT_ID,
    decision_id: nonEmpty(input.decision_id, `${path}.decision_id`),
    selector,
    record_id: nonEmpty(input.record_id, `${path}.record_id`),
    record_kind: recordKind,
    primary_disposition: primaryDisposition,
    study_projectable: input.study_projectable,
    waiver: input.waiver,
    reviewed_at: reviewedAt,
    reviewed_by: nonEmpty(input.reviewed_by, `${path}.reviewed_by`),
    reason: nonEmpty(input.reason, `${path}.reason`),
    reason_codes: reasonCodes,
    evidence_ids: evidenceIds,
    related_record_ids: strings(input.related_record_ids, `${path}.related_record_ids`),
    occurrence_ids: occurrenceIds,
    required_roles_satisfied: requiredRolesSatisfied,
    required_roles_missing: requiredRolesMissing,
    investigation,
  };
}

export function readRelationshipDispositionFile(path: string): RelationshipDispositionDecision[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    const location = `${relative(repoRoot, path)}:${index + 1}`;
    try {
      return [parseRelationshipDispositionDecision(JSON.parse(line) as unknown, location)];
    } catch (error) {
      throw new Error(`${location}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export function readRelationshipDispositionLedger(rootDir = repoRoot): RelationshipDispositionLedger {
  const decisions = [
    ...readRelationshipDispositionFile(operationalEventDispositionPath(rootDir)),
    ...readRelationshipDispositionFile(busLaneTreatmentDispositionPath(rootDir)),
  ].sort((left, right) => left.decision_id.localeCompare(right.decision_id));
  const byRecordId = new Map<string, RelationshipDispositionDecision>();
  const decisionIds = new Set<string>();
  for (const decision of decisions) {
    if (decisionIds.has(decision.decision_id)) throw new Error(`Duplicate relationship disposition decision_id ${decision.decision_id}`);
    if (byRecordId.has(decision.record_id)) throw new Error(`Multiple relationship dispositions target ${decision.record_id}`);
    decisionIds.add(decision.decision_id);
    byRecordId.set(decision.record_id, decision);
  }
  return { decisions, byRecordId };
}

export function validateRelationshipDispositionLedger(
  records: readonly MtaCanonicalRecord[],
  ledger = readRelationshipDispositionLedger(),
): string[] {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const issues: string[] = [];
  for (const inputDecision of ledger.decisions) {
    let decision: RelationshipDispositionDecision;
    try {
      // Callers such as deterministic generators often construct typed objects directly. Reparse
      // here so a TypeScript assertion cannot bypass the same fail-closed role/evidence contract
      // enforced for checked-in JSONL.
      decision = parseRelationshipDispositionDecision(
        inputDecision,
        `relationship disposition ${inputDecision.decision_id}`,
      );
    } catch (error) {
      issues.push(
        `${inputDecision.decision_id} violates the versioned disposition contract: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const record = recordsById.get(decision.record_id);
    if (!record) {
      issues.push(`${decision.decision_id} targets missing canonical record ${decision.record_id}`);
      continue;
    }
    if (record.record_kind !== decision.record_kind) {
      issues.push(`${decision.decision_id} expects ${decision.record_kind}, found ${record.record_kind}`);
    }
    const boundEvidenceById = new Map(
      record.evidence_refs.flatMap((ref) => ref.evidence_id ? [[ref.evidence_id, ref] as const] : []),
    );
    const boundEvidenceIds = new Set(boundEvidenceById.keys());
    const missingEvidence = decision.evidence_ids.filter((evidenceId) => !boundEvidenceIds.has(evidenceId));
    if (missingEvidence.length > 0) {
      issues.push(`${decision.decision_id} cites evidence not bound to ${decision.record_id}: ${missingEvidence.join(", ")}`);
    }
    for (const evidenceId of decision.evidence_ids) {
      const ref = boundEvidenceById.get(evidenceId);
      if (!ref) continue;
      const expectedSourceId = evidenceSourceId(evidenceId, `${decision.decision_id}.evidence_ids`);
      if (ref.source_id !== expectedSourceId) {
        issues.push(
          `${decision.decision_id} evidence ${evidenceId} is bound under mismatched source ${ref.source_id}`,
        );
      }
      if (!decision.investigation.source_ids_checked.includes(ref.source_id)) {
        issues.push(
          `${decision.decision_id} evidence source ${ref.source_id} is absent from source_ids_checked`,
        );
      }
    }
    const missingRelated = decision.related_record_ids.filter((recordId) => !recordsById.has(recordId));
    if (missingRelated.length > 0) {
      issues.push(`${decision.decision_id} references missing related records: ${missingRelated.join(", ")}`);
    }
    const missingGraphChecks = decision.investigation.graph_record_ids_checked.filter((recordId) => !recordsById.has(recordId));
    if (missingGraphChecks.length > 0) {
      issues.push(`${decision.decision_id} investigation references missing graph records: ${missingGraphChecks.join(", ")}`);
    }
    if (decision.study_projectable && decision.required_roles_missing.length > 0) {
      issues.push(`${decision.decision_id} is study-projectable with missing required roles`);
    }
  }
  return issues.sort();
}

export function dispositionRecordKind(selector: RelationshipDispositionSelector): MtaObservationKind {
  return selector === "operational_event" ? "event" : "treatment_component";
}
