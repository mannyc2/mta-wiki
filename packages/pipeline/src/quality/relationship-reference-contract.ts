import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaObservationKind } from "@mta-wiki/db/types";

export const RELATIONSHIP_REFERENCE_SCHEMA_VERSION = 1 as const;
export const RELATIONSHIP_REFERENCE_CONTRACT_ID = "relationship-reference-contract-v1" as const;
export const RELATIONSHIP_REFERENCE_REVIEW_LEDGER_ID = "relationship-reference-review-v1" as const;

export type RelationshipReferenceMode = "warn" | "enforce";
export type RelationshipReferenceDirection = "origin_to_target" | "target_to_origin";
export type RelationshipReferenceReviewStrategy =
  | "reference_claim"
  | "context_literal_when_unresolved"
  | "bus_route_reference_or_context_literal";

export type RelationshipReferenceRule = {
  rule_id: string;
  origin_kind: MtaObservationKind;
  fields: string[];
  context_literal_fields: string[];
  target_kinds: MtaObservationKind[];
  relation_kind: string;
  direction: RelationshipReferenceDirection;
  skip_self: boolean;
  unresolved_review_strategy: RelationshipReferenceReviewStrategy;
};

export type RelationshipReferenceReviewPrimary =
  | "reviewed_unresolved_reference_claim"
  | "reviewed_ambiguous_reference_claim"
  | "reviewed_non_authoritative_context_literal"
  | "reviewed_supportable_canonical_target"
  | "reviewed_non_authoritative_self_reference"
  | "reviewed_temporal_scope_mismatch";

export type RelationshipReferenceReviewResolution =
  | "unresolved"
  | "ambiguous"
  | "resolved_self_reference"
  | "resolved_temporal_scope_mismatch";

export type RelationshipReferenceReviewDecision = {
  schema_version: typeof RELATIONSHIP_REFERENCE_SCHEMA_VERSION;
  ledger_id: typeof RELATIONSHIP_REFERENCE_REVIEW_LEDGER_ID;
  decision_id: string;
  rule_id: string;
  field: string;
  normalized_value: string;
  native_resolution: RelationshipReferenceReviewResolution;
  primary_disposition: RelationshipReferenceReviewPrimary;
  proposed_target_record_id: string | null;
  reviewed_at: string;
  reviewed_by: string;
  reason: string;
  reason_codes: string[];
  origin_record_ids: string[];
  source_ids_checked: string[];
  evidence_ids_checked: string[];
  canonical_candidate_ids_checked: string[];
  exact_supported_claims: string[];
  exact_unsupported_claims: string[];
};

export type RelationshipReferenceContract = {
  schema_version: typeof RELATIONSHIP_REFERENCE_SCHEMA_VERSION;
  contract_id: typeof RELATIONSHIP_REFERENCE_CONTRACT_ID;
  contract_status: "warning";
  description: string;
  rules: RelationshipReferenceRule[];
  review_ledger: {
    path: string;
    sha256: string;
    row_count: number;
  };
  enforcement_criteria: {
    unreviewed_reference_count: 0;
    invalid_value_count: 0;
    evidence_invalid_count: 0;
    supportable_resolution_pending_count: 0;
    policy_rule_drift_count: 0;
    native_coverage_mismatch_count: 0;
  };
};

export type LoadedRelationshipReferenceContract = {
  contract: RelationshipReferenceContract;
  decisions: RelationshipReferenceReviewDecision[];
  decisions_by_key: Map<string, RelationshipReferenceReviewDecision>;
  rules_by_id: Map<string, RelationshipReferenceRule>;
  contract_path: string;
  review_ledger_path: string;
};

/** This inventory mirrors the relationship-like payload fields that the deterministic derived
 * relation materializer consumes. The checked-in JSON contract is compared byte-for-byte at the
 * semantic level, and the audit separately reconciles every field count against the native
 * derivedRelationCoverage output. A new generator rule therefore cannot enter enforcement
 * without an explicit versioned policy addition. */
export const RELATIONSHIP_REFERENCE_RULES_V1: readonly RelationshipReferenceRule[] = [
  {
    rule_id: "metric-route-has-metric",
    origin_kind: "metric_claim",
    fields: ["route_label", "route"],
    context_literal_fields: [],
    target_kinds: ["route"],
    relation_kind: "has_metric",
    direction: "target_to_origin",
    skip_self: false,
    unresolved_review_strategy: "bus_route_reference_or_context_literal",
  },
  {
    rule_id: "metric-source-system-has-metric",
    origin_kind: "metric_claim",
    fields: ["source_system", "entity"],
    context_literal_fields: ["source_system"],
    target_kinds: ["entity", "project"],
    relation_kind: "has_metric",
    direction: "target_to_origin",
    skip_self: false,
    unresolved_review_strategy: "reference_claim",
  },
  {
    rule_id: "claim-route-has-claim",
    origin_kind: "claim",
    fields: ["route", "routes"],
    context_literal_fields: [],
    target_kinds: ["route"],
    relation_kind: "has_claim",
    direction: "target_to_origin",
    skip_self: false,
    unresolved_review_strategy: "bus_route_reference_or_context_literal",
  },
  {
    rule_id: "project-routes-served",
    origin_kind: "project",
    fields: ["routes_served", "routes"],
    context_literal_fields: [],
    target_kinds: ["route"],
    relation_kind: "serves_route",
    direction: "origin_to_target",
    skip_self: false,
    unresolved_review_strategy: "bus_route_reference_or_context_literal",
  },
  {
    rule_id: "corridor-routes-served",
    origin_kind: "corridor",
    fields: ["routes", "routes_served"],
    context_literal_fields: [],
    target_kinds: ["route"],
    relation_kind: "operates_on_corridor",
    direction: "target_to_origin",
    skip_self: false,
    unresolved_review_strategy: "bus_route_reference_or_context_literal",
  },
  {
    rule_id: "route-corridors",
    origin_kind: "route",
    fields: ["corridors"],
    context_literal_fields: [],
    target_kinds: ["corridor"],
    relation_kind: "operates_on_corridor",
    direction: "origin_to_target",
    skip_self: false,
    unresolved_review_strategy: "reference_claim",
  },
  {
    rule_id: "route-related-routes",
    origin_kind: "route",
    fields: ["routes", "related_existing_routes"],
    context_literal_fields: [],
    target_kinds: ["route"],
    relation_kind: "related_route",
    direction: "origin_to_target",
    skip_self: true,
    unresolved_review_strategy: "reference_claim",
  },
  {
    rule_id: "route-program",
    origin_kind: "route",
    fields: ["program"],
    context_literal_fields: [],
    target_kinds: ["entity", "project"],
    relation_kind: "part_of_program",
    direction: "origin_to_target",
    skip_self: false,
    unresolved_review_strategy: "reference_claim",
  },
  {
    rule_id: "project-program",
    origin_kind: "project",
    fields: ["program"],
    context_literal_fields: [],
    target_kinds: ["entity", "project"],
    relation_kind: "part_of_program",
    direction: "origin_to_target",
    skip_self: true,
    unresolved_review_strategy: "reference_claim",
  },
  {
    rule_id: "route-operator",
    origin_kind: "route",
    fields: ["operator", "agency"],
    context_literal_fields: [],
    target_kinds: ["entity"],
    relation_kind: "operated_by",
    direction: "origin_to_target",
    skip_self: false,
    unresolved_review_strategy: "reference_claim",
  },
  {
    rule_id: "project-owner",
    origin_kind: "project",
    fields: ["owner"],
    context_literal_fields: [],
    target_kinds: ["entity"],
    relation_kind: "owned_by",
    direction: "origin_to_target",
    skip_self: false,
    unresolved_review_strategy: "reference_claim",
  },
  {
    rule_id: "project-publisher",
    origin_kind: "project",
    fields: ["publisher"],
    context_literal_fields: [],
    target_kinds: ["entity"],
    relation_kind: "published_by",
    direction: "origin_to_target",
    skip_self: false,
    unresolved_review_strategy: "reference_claim",
  },
  {
    rule_id: "source-publisher",
    origin_kind: "source",
    fields: ["publisher"],
    context_literal_fields: [],
    target_kinds: ["entity"],
    relation_kind: "published_by",
    direction: "origin_to_target",
    skip_self: false,
    unresolved_review_strategy: "reference_claim",
  },
  {
    rule_id: "entity-organization",
    origin_kind: "entity",
    fields: ["organization", "agency", "office", "parent_organization", "parent_entity"],
    context_literal_fields: [],
    target_kinds: ["entity"],
    relation_kind: "part_of_agency",
    direction: "origin_to_target",
    skip_self: true,
    unresolved_review_strategy: "reference_claim",
  },
  {
    rule_id: "entity-owner",
    origin_kind: "entity",
    fields: ["owner"],
    context_literal_fields: [],
    target_kinds: ["entity"],
    relation_kind: "owned_by",
    direction: "origin_to_target",
    skip_self: true,
    unresolved_review_strategy: "reference_claim",
  },
] as const;

const OBSERVATION_KINDS = new Set<MtaObservationKind>([
  "source",
  "entity",
  "project",
  "corridor",
  "route",
  "treatment_component",
  "event",
  "claim",
  "metric_claim",
  "table",
  "source_gap",
  "relation",
]);
const DIRECTIONS = new Set<RelationshipReferenceDirection>(["origin_to_target", "target_to_origin"]);
const STRATEGIES = new Set<RelationshipReferenceReviewStrategy>([
  "reference_claim",
  "context_literal_when_unresolved",
  "bus_route_reference_or_context_literal",
]);
const PRIMARY_DISPOSITIONS = new Set<RelationshipReferenceReviewPrimary>([
  "reviewed_unresolved_reference_claim",
  "reviewed_ambiguous_reference_claim",
  "reviewed_non_authoritative_context_literal",
  "reviewed_supportable_canonical_target",
  "reviewed_non_authoritative_self_reference",
  "reviewed_temporal_scope_mismatch",
]);
const REVIEW_RESOLUTIONS = new Set<RelationshipReferenceReviewResolution>([
  "unresolved",
  "ambiguous",
  "resolved_self_reference",
  "resolved_temporal_scope_mismatch",
]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function sortedStrings(value: unknown, path: string, options: { nonEmpty?: boolean } = {}): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`${path} must be an array of non-empty strings`);
  }
  const strings = value.map((entry) => String(entry).trim());
  if (options.nonEmpty && strings.length === 0) throw new Error(`${path} must not be empty`);
  if (new Set(strings).size !== strings.length) throw new Error(`${path} must not contain duplicates`);
  const sorted = [...strings].sort((left, right) => left.localeCompare(right));
  if (stableJson(strings as unknown as JsonValue) !== stableJson(sorted as unknown as JsonValue)) {
    throw new Error(`${path} must be sorted`);
  }
  return strings;
}

function orderedStrings(value: unknown, path: string, options: { nonEmpty?: boolean } = {}): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`${path} must be an array of non-empty strings`);
  }
  const strings = value.map((entry) => String(entry).trim());
  if (options.nonEmpty && strings.length === 0) throw new Error(`${path} must not be empty`);
  if (new Set(strings).size !== strings.length) throw new Error(`${path} must not contain duplicates`);
  return strings;
}

function onlyFields(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const extra = Object.keys(value).filter((field) => !allowed.includes(field)).sort();
  if (extra.length > 0) throw new Error(`${path} has unexpected fields: ${extra.join(", ")}`);
}

function parseRule(value: unknown, path: string): RelationshipReferenceRule {
  const input = object(value, path);
  onlyFields(input, [
    "rule_id",
    "origin_kind",
    "fields",
    "context_literal_fields",
    "target_kinds",
    "relation_kind",
    "direction",
    "skip_self",
    "unresolved_review_strategy",
  ], path);
  const originKind = nonEmpty(input.origin_kind, `${path}.origin_kind`) as MtaObservationKind;
  if (!OBSERVATION_KINDS.has(originKind)) throw new Error(`${path}.origin_kind is unsupported`);
  const targetKinds = orderedStrings(input.target_kinds, `${path}.target_kinds`, { nonEmpty: true }) as MtaObservationKind[];
  if (targetKinds.some((kind) => !OBSERVATION_KINDS.has(kind))) throw new Error(`${path}.target_kinds contains an unsupported kind`);
  const direction = nonEmpty(input.direction, `${path}.direction`) as RelationshipReferenceDirection;
  if (!DIRECTIONS.has(direction)) throw new Error(`${path}.direction is unsupported`);
  const strategy = nonEmpty(input.unresolved_review_strategy, `${path}.unresolved_review_strategy`) as RelationshipReferenceReviewStrategy;
  if (!STRATEGIES.has(strategy)) throw new Error(`${path}.unresolved_review_strategy is unsupported`);
  if (typeof input.skip_self !== "boolean") throw new Error(`${path}.skip_self must be a boolean`);
  const fields = orderedStrings(input.fields, `${path}.fields`, { nonEmpty: true });
  const contextLiteralFields = sortedStrings(input.context_literal_fields, `${path}.context_literal_fields`);
  if (contextLiteralFields.some((field) => !fields.includes(field))) {
    throw new Error(`${path}.context_literal_fields must be a subset of fields`);
  }
  return {
    rule_id: nonEmpty(input.rule_id, `${path}.rule_id`),
    origin_kind: originKind,
    fields,
    context_literal_fields: contextLiteralFields,
    target_kinds: targetKinds,
    relation_kind: nonEmpty(input.relation_kind, `${path}.relation_kind`),
    direction,
    skip_self: input.skip_self,
    unresolved_review_strategy: strategy,
  };
}

export function relationshipReferenceDecisionKey(input: {
  rule_id: string;
  field: string;
  normalized_value: string;
  native_resolution: RelationshipReferenceReviewResolution;
}): string {
  return `${input.rule_id}\0${input.field}\0${input.normalized_value}\0${input.native_resolution}`;
}

export function parseRelationshipReferenceReviewDecision(value: unknown, path: string): RelationshipReferenceReviewDecision {
  const input = object(value, path);
  onlyFields(input, [
    "schema_version",
    "ledger_id",
    "decision_id",
    "rule_id",
    "field",
    "normalized_value",
    "native_resolution",
    "primary_disposition",
    "proposed_target_record_id",
    "reviewed_at",
    "reviewed_by",
    "reason",
    "reason_codes",
    "origin_record_ids",
    "source_ids_checked",
    "evidence_ids_checked",
    "canonical_candidate_ids_checked",
    "exact_supported_claims",
    "exact_unsupported_claims",
  ], path);
  if (input.schema_version !== RELATIONSHIP_REFERENCE_SCHEMA_VERSION) throw new Error(`${path}.schema_version must be 1`);
  if (input.ledger_id !== RELATIONSHIP_REFERENCE_REVIEW_LEDGER_ID) {
    throw new Error(`${path}.ledger_id must be ${RELATIONSHIP_REFERENCE_REVIEW_LEDGER_ID}`);
  }
  const nativeResolution = nonEmpty(input.native_resolution, `${path}.native_resolution`);
  if (!REVIEW_RESOLUTIONS.has(nativeResolution as RelationshipReferenceReviewResolution)) {
    throw new Error(`${path}.native_resolution is unsupported`);
  }
  const primaryDisposition = nonEmpty(input.primary_disposition, `${path}.primary_disposition`) as RelationshipReferenceReviewPrimary;
  if (!PRIMARY_DISPOSITIONS.has(primaryDisposition)) throw new Error(`${path}.primary_disposition is unsupported`);
  const proposedTarget = input.proposed_target_record_id === null
    ? null
    : nonEmpty(input.proposed_target_record_id, `${path}.proposed_target_record_id`);
  if ((primaryDisposition === "reviewed_supportable_canonical_target") !== Boolean(proposedTarget)) {
    throw new Error(`${path} proposed_target_record_id is required only for reviewed_supportable_canonical_target`);
  }
  if (
    primaryDisposition === "reviewed_unresolved_reference_claim" &&
    nativeResolution !== "unresolved"
  ) {
    throw new Error(`${path} unresolved disposition requires native_resolution=unresolved`);
  }
  if (
    primaryDisposition === "reviewed_ambiguous_reference_claim" &&
    nativeResolution !== "ambiguous"
  ) {
    throw new Error(`${path} ambiguous disposition requires native_resolution=ambiguous`);
  }
  if (
    primaryDisposition === "reviewed_non_authoritative_self_reference" &&
    nativeResolution !== "resolved_self_reference"
  ) {
    throw new Error(`${path} self-reference disposition requires native_resolution=resolved_self_reference`);
  }
  if (
    primaryDisposition === "reviewed_temporal_scope_mismatch" &&
    nativeResolution !== "resolved_temporal_scope_mismatch"
  ) {
    throw new Error(`${path} temporal-scope disposition requires native_resolution=resolved_temporal_scope_mismatch`);
  }
  if (
    nativeResolution === "resolved_self_reference" &&
    primaryDisposition !== "reviewed_non_authoritative_self_reference"
  ) {
    throw new Error(`${path} native_resolution=resolved_self_reference requires the reviewed self-reference disposition`);
  }
  if (
    nativeResolution === "resolved_temporal_scope_mismatch" &&
    primaryDisposition !== "reviewed_temporal_scope_mismatch"
  ) {
    throw new Error(`${path} native_resolution=resolved_temporal_scope_mismatch requires the reviewed temporal-scope disposition`);
  }
  const reviewedAt = nonEmpty(input.reviewed_at, `${path}.reviewed_at`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(reviewedAt)) throw new Error(`${path}.reviewed_at must be YYYY-MM-DD`);
  const result: RelationshipReferenceReviewDecision = {
    schema_version: RELATIONSHIP_REFERENCE_SCHEMA_VERSION,
    ledger_id: RELATIONSHIP_REFERENCE_REVIEW_LEDGER_ID,
    decision_id: nonEmpty(input.decision_id, `${path}.decision_id`),
    rule_id: nonEmpty(input.rule_id, `${path}.rule_id`),
    field: nonEmpty(input.field, `${path}.field`),
    normalized_value: nonEmpty(input.normalized_value, `${path}.normalized_value`),
    native_resolution: nativeResolution as RelationshipReferenceReviewResolution,
    primary_disposition: primaryDisposition,
    proposed_target_record_id: proposedTarget,
    reviewed_at: reviewedAt,
    reviewed_by: nonEmpty(input.reviewed_by, `${path}.reviewed_by`),
    reason: nonEmpty(input.reason, `${path}.reason`),
    reason_codes: sortedStrings(input.reason_codes, `${path}.reason_codes`, { nonEmpty: true }),
    origin_record_ids: sortedStrings(input.origin_record_ids, `${path}.origin_record_ids`, { nonEmpty: true }),
    source_ids_checked: sortedStrings(input.source_ids_checked, `${path}.source_ids_checked`, { nonEmpty: true }),
    evidence_ids_checked: sortedStrings(input.evidence_ids_checked, `${path}.evidence_ids_checked`, { nonEmpty: true }),
    canonical_candidate_ids_checked: sortedStrings(input.canonical_candidate_ids_checked, `${path}.canonical_candidate_ids_checked`),
    exact_supported_claims: sortedStrings(input.exact_supported_claims, `${path}.exact_supported_claims`),
    exact_unsupported_claims: sortedStrings(input.exact_unsupported_claims, `${path}.exact_unsupported_claims`),
  };
  if (result.exact_supported_claims.length === 0 && result.exact_unsupported_claims.length === 0) {
    throw new Error(`${path} must record an exact supported or unsupported claim`);
  }
  return result;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function relationshipReferenceContractRoot(rootDir = repoRoot): string {
  return join(rootDir, "data", "contracts", "relationship-references", "v1");
}

export function relationshipReferenceContractPath(rootDir = repoRoot): string {
  return join(relationshipReferenceContractRoot(rootDir), "contract.json");
}

export function relationshipReferenceReviewLedgerPath(rootDir = repoRoot): string {
  return join(relationshipReferenceContractRoot(rootDir), "review-decisions.jsonl");
}

function parseContract(value: unknown, path: string): RelationshipReferenceContract {
  const input = object(value, path);
  onlyFields(input, [
    "schema_version",
    "contract_id",
    "contract_status",
    "description",
    "rules",
    "review_ledger",
    "enforcement_criteria",
  ], path);
  if (input.schema_version !== RELATIONSHIP_REFERENCE_SCHEMA_VERSION) throw new Error(`${path}.schema_version must be 1`);
  if (input.contract_id !== RELATIONSHIP_REFERENCE_CONTRACT_ID) {
    throw new Error(`${path}.contract_id must be ${RELATIONSHIP_REFERENCE_CONTRACT_ID}`);
  }
  if (input.contract_status !== "warning") throw new Error(`${path}.contract_status must be warning in v1`);
  if (!Array.isArray(input.rules)) throw new Error(`${path}.rules must be an array`);
  const rules = input.rules.map((rule, index) => parseRule(rule, `${path}.rules[${index}]`));
  const ruleIds = rules.map((rule) => rule.rule_id);
  if (new Set(ruleIds).size !== ruleIds.length) throw new Error(`${path}.rules contains duplicate rule_id values`);
  if (
    stableJson(rules as unknown as JsonValue) !==
    stableJson(RELATIONSHIP_REFERENCE_RULES_V1 as unknown as JsonValue)
  ) {
    throw new Error(`${path}.rules do not match the reviewed v1 generator-field inventory`);
  }

  const ledger = object(input.review_ledger, `${path}.review_ledger`);
  onlyFields(ledger, ["path", "sha256", "row_count"], `${path}.review_ledger`);
  const rowCount = ledger.row_count;
  if (!Number.isInteger(rowCount) || Number(rowCount) < 0) throw new Error(`${path}.review_ledger.row_count must be a non-negative integer`);
  const criteria = object(input.enforcement_criteria, `${path}.enforcement_criteria`);
  const criteriaFields = [
    "unreviewed_reference_count",
    "invalid_value_count",
    "evidence_invalid_count",
    "supportable_resolution_pending_count",
    "policy_rule_drift_count",
    "native_coverage_mismatch_count",
  ] as const;
  onlyFields(criteria, criteriaFields, `${path}.enforcement_criteria`);
  for (const field of criteriaFields) {
    if (criteria[field] !== 0) throw new Error(`${path}.enforcement_criteria.${field} must be 0`);
  }
  return {
    schema_version: RELATIONSHIP_REFERENCE_SCHEMA_VERSION,
    contract_id: RELATIONSHIP_REFERENCE_CONTRACT_ID,
    contract_status: "warning",
    description: nonEmpty(input.description, `${path}.description`),
    rules,
    review_ledger: {
      path: nonEmpty(ledger.path, `${path}.review_ledger.path`),
      sha256: nonEmpty(ledger.sha256, `${path}.review_ledger.sha256`),
      row_count: Number(rowCount),
    },
    enforcement_criteria: {
      unreviewed_reference_count: 0,
      invalid_value_count: 0,
      evidence_invalid_count: 0,
      supportable_resolution_pending_count: 0,
      policy_rule_drift_count: 0,
      native_coverage_mismatch_count: 0,
    },
  };
}

export function loadRelationshipReferenceContract(rootDir = repoRoot): LoadedRelationshipReferenceContract {
  const contractPath = relationshipReferenceContractPath(rootDir);
  if (!existsSync(contractPath)) throw new Error(`relationship reference contract is missing at ${relative(rootDir, contractPath)}`);
  const contract = parseContract(JSON.parse(readFileSync(contractPath, "utf8")) as unknown, relative(rootDir, contractPath));
  const reviewLedgerPath = join(rootDir, contract.review_ledger.path);
  if (!existsSync(reviewLedgerPath)) throw new Error(`relationship reference review ledger is missing at ${contract.review_ledger.path}`);
  const content = readFileSync(reviewLedgerPath, "utf8");
  if (sha256(content) !== contract.review_ledger.sha256) {
    throw new Error(`relationship reference review ledger SHA-256 mismatch at ${contract.review_ledger.path}`);
  }
  const decisions = content.split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`${contract.review_ledger.path}:${index + 1} must be valid JSON: ${String(error)}`);
    }
    return [parseRelationshipReferenceReviewDecision(parsed, `${contract.review_ledger.path}:${index + 1}`)];
  });
  if (decisions.length !== contract.review_ledger.row_count) {
    throw new Error(`relationship reference review ledger row count ${decisions.length} != ${contract.review_ledger.row_count}`);
  }
  const decisionIds = new Set<string>();
  const decisionsByKey = new Map<string, RelationshipReferenceReviewDecision>();
  for (const decision of decisions) {
    if (decisionIds.has(decision.decision_id)) throw new Error(`duplicate relationship reference decision_id ${decision.decision_id}`);
    decisionIds.add(decision.decision_id);
    const key = relationshipReferenceDecisionKey(decision);
    if (decisionsByKey.has(key)) throw new Error(`duplicate relationship reference review key ${key.replaceAll("\0", " / ")}`);
    decisionsByKey.set(key, decision);
  }
  const sorted = [...decisions].sort(
    (left, right) =>
      left.rule_id.localeCompare(right.rule_id) ||
      left.field.localeCompare(right.field) ||
      left.normalized_value.localeCompare(right.normalized_value) ||
      left.native_resolution.localeCompare(right.native_resolution),
  );
  if (stableJson(decisions as unknown as JsonValue) !== stableJson(sorted as unknown as JsonValue)) {
    throw new Error("relationship reference review ledger must be sorted by rule_id, field, normalized_value, native_resolution");
  }
  return {
    contract,
    decisions,
    decisions_by_key: decisionsByKey,
    rules_by_id: new Map(contract.rules.map((rule) => [rule.rule_id, rule])),
    contract_path: contractPath,
    review_ledger_path: reviewLedgerPath,
  };
}
