import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { ExactEvidenceBinding } from "./study-readiness-v1.js";

export const MEMBER_GRAIN_SCHEMA_VERSION = 1 as const;
export const MEMBER_GRAIN_DECISION_CONTRACT_ID = "member-grain-decision-v1" as const;

export type MemberGrainServiceScope =
  | { kind: "all_service" }
  | { kind: "periods"; periods: string[]; directions: string[]; pattern_ids: string[] }
  | {
    kind: "trip_subset";
    periods: string[];
    directions: string[];
    pattern_ids: string[];
    description: string;
  }
  | { kind: "not_applicable" }
  | { kind: "unresolved"; missing_roles: string[] };

export type MemberGrainLineageSegment = {
  predecessor_gtfs_route_id: string;
  successor_gtfs_route_id: string;
  direction: string;
  boundary_stop_ids: [string, string];
  shared_stop_ids: string[];
};

export type MemberGrainDecision = {
  schema_version: typeof MEMBER_GRAIN_SCHEMA_VERSION;
  contract_id: typeof MEMBER_GRAIN_DECISION_CONTRACT_ID;
  decision_id: string;
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_id: string;
  member_extent_decision_id: string | null;
  service_scope: MemberGrainServiceScope;
  lineage_segments: MemberGrainLineageSegment[];
  evidence_bindings: ExactEvidenceBinding[];
  rationale: string;
  reviewed_at: string;
  reviewed_by: string;
};

const decisionFields = new Set([
  "contract_id", "decision_id", "evidence_bindings", "gtfs_route_id", "lineage_segments",
  "member_extent_decision_id", "occurrence_id", "rationale", "reviewed_at", "reviewed_by",
  "route_record_id", "schema_version", "service_scope", "treatment_record_id",
]);
const bindingFields = new Set(["evidence_id", "record_id", "role", "source_id"]);
const lineageFields = new Set([
  "boundary_stop_ids", "direction", "predecessor_gtfs_route_id", "shared_stop_ids",
  "successor_gtfs_route_id",
]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, fields: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(value).filter((field) => !fields.has(field)).sort();
  const missing = [...fields].filter((field) => !(field in value)).sort();
  if (extras.length > 0) throw new Error(`${path}: unknown field(s): ${extras.join(", ")}`);
  if (missing.length > 0) throw new Error(`${path}: missing field(s): ${missing.join(", ")}`);
}

function nonempty(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path}: expected non-empty string`);
  }
  return value.trim();
}

function sortedStrings(value: unknown, path: string, allowEmpty = true): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${path}: expected ${allowEmpty ? "" : "non-empty "}array`);
  }
  const output = value.map((item, index) => nonempty(item, `${path}[${index}]`));
  if (new Set(output).size !== output.length) throw new Error(`${path}: duplicates are forbidden`);
  if (stableJson(output as JsonValue) !== stableJson([...output].sort() as JsonValue)) {
    throw new Error(`${path}: values must be sorted`);
  }
  return output;
}

function parseEvidenceBindings(value: unknown, path: string): ExactEvidenceBinding[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  const bindings = value.map((item, index) => {
    const parsed = object(item, `${path}[${index}]`);
    exactKeys(parsed, bindingFields, `${path}[${index}]`);
    return {
      role: nonempty(parsed.role, `${path}[${index}].role`),
      record_id: nonempty(parsed.record_id, `${path}[${index}].record_id`),
      source_id: nonempty(parsed.source_id, `${path}[${index}].source_id`),
      evidence_id: nonempty(parsed.evidence_id, `${path}[${index}].evidence_id`),
    };
  });
  const keys = bindings.map((binding) =>
    [binding.role, binding.record_id, binding.source_id, binding.evidence_id].join("\0"));
  if (new Set(keys).size !== keys.length) throw new Error(`${path}: duplicates are forbidden`);
  if (stableJson(keys as JsonValue) !== stableJson([...keys].sort() as JsonValue)) {
    throw new Error(`${path}: values must be sorted`);
  }
  return bindings;
}

function parseServiceScope(value: unknown, path: string): MemberGrainServiceScope {
  const parsed = object(value, path);
  const kind = nonempty(parsed.kind, `${path}.kind`);
  if (kind === "all_service" || kind === "not_applicable") {
    exactKeys(parsed, new Set(["kind"]), path);
    return { kind };
  }
  if (kind === "unresolved") {
    exactKeys(parsed, new Set(["kind", "missing_roles"]), path);
    return { kind, missing_roles: sortedStrings(parsed.missing_roles, `${path}.missing_roles`, false) };
  }
  if (kind === "periods" || kind === "trip_subset") {
    exactKeys(parsed, new Set([
      "kind", "periods", "directions", "pattern_ids", ...(kind === "trip_subset" ? ["description"] : []),
    ]), path);
    const periods = sortedStrings(parsed.periods, `${path}.periods`);
    const directions = sortedStrings(parsed.directions, `${path}.directions`);
    const patternIds = sortedStrings(parsed.pattern_ids, `${path}.pattern_ids`);
    if (kind === "periods" && periods.length === 0) {
      throw new Error(`${path}: periods scope requires at least one period`);
    }
    if (kind === "trip_subset" && periods.length + directions.length + patternIds.length === 0) {
      throw new Error(`${path}: trip_subset requires at least one structured selector`);
    }
    return kind === "periods"
      ? { kind, periods, directions, pattern_ids: patternIds }
      : {
        kind,
        periods,
        directions,
        pattern_ids: patternIds,
        description: nonempty(parsed.description, `${path}.description`),
      };
  }
  throw new Error(`${path}.kind: unsupported service scope ${kind}`);
}

function parseLineageSegments(value: unknown, path: string): MemberGrainLineageSegment[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  const segments = value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const parsed = object(item, itemPath);
    exactKeys(parsed, lineageFields, itemPath);
    const boundary = sortedStrings(parsed.boundary_stop_ids, `${itemPath}.boundary_stop_ids`, false);
    if (boundary.length !== 2) throw new Error(`${itemPath}.boundary_stop_ids: expected exactly two stops`);
    const predecessor = nonempty(parsed.predecessor_gtfs_route_id, `${itemPath}.predecessor_gtfs_route_id`);
    const successor = nonempty(parsed.successor_gtfs_route_id, `${itemPath}.successor_gtfs_route_id`);
    if (predecessor === successor) throw new Error(`${itemPath}: predecessor and successor must differ`);
    return {
      predecessor_gtfs_route_id: predecessor,
      successor_gtfs_route_id: successor,
      direction: nonempty(parsed.direction, `${itemPath}.direction`),
      boundary_stop_ids: boundary as [string, string],
      shared_stop_ids: sortedStrings(parsed.shared_stop_ids, `${itemPath}.shared_stop_ids`, false),
    };
  });
  const keys = segments.map((segment) => stableJson(segment as unknown as JsonValue));
  if (new Set(keys).size !== keys.length) throw new Error(`${path}: duplicate lineage segments`);
  if (stableJson(keys as JsonValue) !== stableJson([...keys].sort() as JsonValue)) {
    throw new Error(`${path}: lineage segments must be sorted`);
  }
  return segments;
}

export function memberGrainDecisionKey(value: {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
}): string {
  return `${value.occurrence_id}\0${value.route_record_id}\0${value.treatment_record_id}`;
}

export function parseMemberGrainDecision(
  value: unknown,
  path = "member grain decision",
): MemberGrainDecision {
  const parsed = object(value, path);
  exactKeys(parsed, decisionFields, path);
  if (parsed.schema_version !== MEMBER_GRAIN_SCHEMA_VERSION ||
      parsed.contract_id !== MEMBER_GRAIN_DECISION_CONTRACT_ID) {
    throw new Error(`${path}: invalid contract header`);
  }
  const extentDecisionId = parsed.member_extent_decision_id === null
    ? null
    : nonempty(parsed.member_extent_decision_id, `${path}.member_extent_decision_id`);
  const serviceScope = parseServiceScope(parsed.service_scope, `${path}.service_scope`);
  const lineageSegments = parseLineageSegments(parsed.lineage_segments, `${path}.lineage_segments`);
  const evidenceBindings = parseEvidenceBindings(parsed.evidence_bindings, `${path}.evidence_bindings`);
  if (evidenceBindings.length === 0) {
    throw new Error(`${path}: grain decisions require exact evidence`);
  }
  const rationale = nonempty(parsed.rationale, `${path}.rationale`);
  const normalizedRationale = rationale.toLowerCase();
  if ((serviceScope.kind === "not_applicable" || serviceScope.kind === "unresolved") &&
      /\b(am peak|pm peak|midday|evening|weekend|frequency|direction|pattern|trip subset|all service)\b/u
        .test(normalizedRationale)) {
    throw new Error(`${path}: service modality may not exist only in prose rationale`);
  }
  if (lineageSegments.length === 0 &&
      /\b(predecessor|successor|route lineage|replaces? (?:the )?[a-z0-9+]+ route)\b/u.test(normalizedRationale)) {
    throw new Error(`${path}: route lineage may not exist only in prose rationale`);
  }
  return {
    schema_version: MEMBER_GRAIN_SCHEMA_VERSION,
    contract_id: MEMBER_GRAIN_DECISION_CONTRACT_ID,
    decision_id: nonempty(parsed.decision_id, `${path}.decision_id`),
    occurrence_id: nonempty(parsed.occurrence_id, `${path}.occurrence_id`),
    route_record_id: nonempty(parsed.route_record_id, `${path}.route_record_id`),
    gtfs_route_id: nonempty(parsed.gtfs_route_id, `${path}.gtfs_route_id`),
    treatment_record_id: nonempty(parsed.treatment_record_id, `${path}.treatment_record_id`),
    member_extent_decision_id: extentDecisionId,
    service_scope: serviceScope,
    lineage_segments: lineageSegments,
    evidence_bindings: evidenceBindings,
    rationale,
    reviewed_at: nonempty(parsed.reviewed_at, `${path}.reviewed_at`),
    reviewed_by: nonempty(parsed.reviewed_by, `${path}.reviewed_by`),
  };
}

function jsonFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory()
      ? jsonFiles(child)
      : entry.isFile() && extname(entry.name) === ".json" ? [child] : [];
  }).sort();
}

function decisionValues(value: unknown, path: string): unknown[] {
  if (Array.isArray(value)) return value;
  const parsed = object(value, path);
  if ("decisions" in parsed) {
    exactKeys(parsed, new Set(["decisions"]), path);
    if (!Array.isArray(parsed.decisions)) throw new Error(`${path}.decisions: expected array`);
    return parsed.decisions;
  }
  return [value];
}

export function loadMemberGrainDecisions(directories: readonly string[]): MemberGrainDecision[] {
  const decisions = directories.flatMap((directory) => jsonFiles(directory).flatMap((path) =>
    decisionValues(JSON.parse(readFileSync(path, "utf8")) as unknown, path)
      .map((value, index) => parseMemberGrainDecision(value, `${path}#${index}`))));
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const decision of decisions) {
    if (ids.has(decision.decision_id)) throw new Error(`duplicate grain decision id ${decision.decision_id}`);
    const key = memberGrainDecisionKey(decision);
    if (keys.has(key)) throw new Error(`duplicate grain decision key ${key}`);
    ids.add(decision.decision_id);
    keys.add(key);
  }
  return decisions.sort((left, right) => memberGrainDecisionKey(left).localeCompare(memberGrainDecisionKey(right)));
}
