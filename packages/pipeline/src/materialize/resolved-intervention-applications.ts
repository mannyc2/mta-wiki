import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  OPERATIONAL_OCCURRENCE_APPLICATION_ACTIONS,
  type OperationalOccurrenceApplicationAction,
} from "./operational-occurrence-review.js";
import type { OperationalOccurrenceEvidenceBinding } from "./operational-occurrences.js";

export const RESOLVED_INTERVENTION_MODEL_VERSION = 1 as const;
export const RESOLVED_INTERVENTION_EXTENT_KINDS = [
  "route_wide",
  "bounded_segment",
  "stop_set",
  "service_pattern",
  "unknown",
] as const;

export type ResolvedInterventionExtentKind =
  (typeof RESOLVED_INTERVENTION_EXTENT_KINDS)[number];

export type ResolvedInterventionExtent = {
  kind: ResolvedInterventionExtentKind;
  record_ids: string[];
  description: string | null;
};

export type ResolvedInterventionApplication = {
  schema_version: 1;
  application_id: string;
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_id: string;
  treatment_family: string;
  phase_record_id: string | null;
  action: OperationalOccurrenceApplicationAction;
  applicability: "applies";
  extent: ResolvedInterventionExtent;
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
  review_decision_id: string;
  resolution_method: "accepted_review" | "lossless_v1_migration";
};

const applicationFields = new Set([
  "action",
  "applicability",
  "application_id",
  "evidence_bindings",
  "extent",
  "gtfs_route_id",
  "occurrence_id",
  "phase_record_id",
  "resolution_method",
  "review_decision_id",
  "route_record_id",
  "schema_version",
  "treatment_family",
  "treatment_record_id",
]);
const extentFields = new Set(["description", "kind", "record_ids"]);
const evidenceFields = new Set(["evidence_id", "record_id", "role", "source_id"]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactFields(input: Record<string, unknown>, fields: ReadonlySet<string>, path: string): void {
  const extras = Object.keys(input).filter((field) => !fields.has(field)).sort();
  if (extras.length) throw new Error(`${path}: unknown field(s): ${extras.join(", ")}`);
  const missing = [...fields].filter((field) => !(field in input)).sort();
  if (missing.length) throw new Error(`${path}: missing field(s): ${missing.join(", ")}`);
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : string(value, path);
}

function sortedStrings(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const values = value.map((entry, index) => string(entry, `${path}[${index}]`));
  const sorted = [...values].sort((left, right) => left.localeCompare(right));
  if (new Set(sorted).size !== sorted.length) throw new Error(`${path} must not contain duplicates`);
  if (stableJson(values as JsonValue) !== stableJson(sorted as JsonValue)) {
    throw new Error(`${path} must be sorted`);
  }
  return sorted;
}

function evidenceBindings(value: unknown, path: string): OperationalOccurrenceEvidenceBinding[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} must be a non-empty array`);
  const bindings = value.map((entry, index) => {
    const bindingPath = `${path}[${index}]`;
    const input = object(entry, bindingPath);
    exactFields(input, evidenceFields, bindingPath);
    return {
      evidence_id: string(input.evidence_id, `${bindingPath}.evidence_id`),
      record_id: string(input.record_id, `${bindingPath}.record_id`),
      role: string(input.role, `${bindingPath}.role`) as OperationalOccurrenceEvidenceBinding["role"],
      source_id: string(input.source_id, `${bindingPath}.source_id`),
    };
  });
  const keys = bindings.map(evidenceBindingKey);
  if (new Set(keys).size !== keys.length) throw new Error(`${path} must not contain duplicates`);
  if (keys.join("\n") !== [...keys].sort().join("\n")) throw new Error(`${path} must be sorted`);
  return bindings;
}

export function evidenceBindingKey(binding: OperationalOccurrenceEvidenceBinding): string {
  return [binding.role, binding.record_id, binding.source_id, binding.evidence_id].join("|");
}

export function sortEvidenceBindings(
  bindings: readonly OperationalOccurrenceEvidenceBinding[],
): OperationalOccurrenceEvidenceBinding[] {
  return [...new Map(bindings.map((binding) => [evidenceBindingKey(binding), binding])).values()]
    .sort((left, right) => evidenceBindingKey(left).localeCompare(evidenceBindingKey(right)));
}

export function resolvedInterventionApplicationIdentity(
  input: Pick<
    ResolvedInterventionApplication,
    "occurrence_id" | "route_record_id" | "treatment_record_id" | "phase_record_id" | "action" | "extent"
  >,
): string {
  const identity = {
    action: input.action,
    extent: {
      kind: input.extent.kind,
      record_ids: [...input.extent.record_ids].sort(),
    },
    occurrence_id: input.occurrence_id,
    phase_record_id: input.phase_record_id,
    route_record_id: input.route_record_id,
    treatment_record_id: input.treatment_record_id,
  };
  return `application:${createHash("sha256")
    .update(`resolved-intervention-application-v1\0${stableJson(identity as JsonValue)}`)
    .digest("hex")
    .slice(0, 24)}`;
}

export function resolvedInterventionDurableApplicationIdentity(
  input: Pick<
    ResolvedInterventionApplication,
    "occurrence_id" | "route_record_id" | "treatment_record_id" | "phase_record_id"
  >,
): string {
  const identity = {
    occurrence_id: input.occurrence_id,
    phase_record_id: input.phase_record_id,
    route_record_id: input.route_record_id,
    treatment_record_id: input.treatment_record_id,
  };
  return `application:${createHash("sha256")
    .update(`resolved-intervention-application-v2\0${stableJson(identity as JsonValue)}`)
    .digest("hex")
    .slice(0, 24)}`;
}

export function resolvedInterventionApplicationIncidenceKey(
  application: ResolvedInterventionApplication,
): string {
  return [
    application.occurrence_id,
    application.route_record_id,
    application.treatment_record_id,
    application.phase_record_id ?? "",
  ].join("|");
}

export function parseResolvedInterventionApplication(
  value: unknown,
  path = "resolved intervention application",
): ResolvedInterventionApplication {
  const input = object(value, path);
  exactFields(input, applicationFields, path);
  if (input.schema_version !== RESOLVED_INTERVENTION_MODEL_VERSION) {
    throw new Error(`${path}.schema_version must be 1`);
  }
  if (input.applicability !== "applies") throw new Error(`${path}.applicability must be applies`);
  const action = string(input.action, `${path}.action`);
  if (!OPERATIONAL_OCCURRENCE_APPLICATION_ACTIONS.includes(action as OperationalOccurrenceApplicationAction)) {
    throw new Error(`${path}.action is unsupported: ${action}`);
  }
  const resolutionMethod = string(input.resolution_method, `${path}.resolution_method`);
  if (resolutionMethod !== "accepted_review" && resolutionMethod !== "lossless_v1_migration") {
    throw new Error(`${path}.resolution_method is unsupported: ${resolutionMethod}`);
  }
  const extentInput = object(input.extent, `${path}.extent`);
  exactFields(extentInput, extentFields, `${path}.extent`);
  const extentKind = string(extentInput.kind, `${path}.extent.kind`);
  if (!RESOLVED_INTERVENTION_EXTENT_KINDS.includes(extentKind as ResolvedInterventionExtentKind)) {
    throw new Error(`${path}.extent.kind is unsupported: ${extentKind}`);
  }
  const extent: ResolvedInterventionExtent = {
    kind: extentKind as ResolvedInterventionExtentKind,
    record_ids: sortedStrings(extentInput.record_ids, `${path}.extent.record_ids`),
    description: nullableString(extentInput.description, `${path}.extent.description`),
  };
  if (extent.kind === "unknown" && extent.record_ids.length > 0) {
    throw new Error(`${path}.extent unknown cannot carry record ids`);
  }
  if (extent.kind !== "unknown" && extent.record_ids.length === 0) {
    throw new Error(`${path}.extent ${extent.kind} requires record ids`);
  }
  const application: ResolvedInterventionApplication = {
    schema_version: 1,
    application_id: string(input.application_id, `${path}.application_id`),
    occurrence_id: string(input.occurrence_id, `${path}.occurrence_id`),
    route_record_id: string(input.route_record_id, `${path}.route_record_id`),
    gtfs_route_id: string(input.gtfs_route_id, `${path}.gtfs_route_id`),
    treatment_record_id: string(input.treatment_record_id, `${path}.treatment_record_id`),
    treatment_family: string(input.treatment_family, `${path}.treatment_family`),
    phase_record_id: nullableString(input.phase_record_id, `${path}.phase_record_id`),
    action: action as OperationalOccurrenceApplicationAction,
    applicability: "applies",
    extent,
    evidence_bindings: evidenceBindings(input.evidence_bindings, `${path}.evidence_bindings`),
    review_decision_id: string(input.review_decision_id, `${path}.review_decision_id`),
    resolution_method: resolutionMethod,
  };
  if (!/^application:[a-f0-9]{24}$/u.test(application.application_id)) {
    throw new Error(`${path}.application_id is stale or invalid`);
  }
  return application;
}
