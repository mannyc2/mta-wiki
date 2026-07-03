import { allKindSpecs, kindSpec, RUNNER_OWNED_FIELDS, type KindSpec } from "@mta-wiki/db/kind-registry";
import type { JsonObject, JsonValue, MtaObservationKind } from "@mta-wiki/db/types";

// Ontology guidance is a thin projection over the kind registry
// (kind-registry.ts), which is the single source of truth for per-kind
// payload structure, companions, and relation-context fields.

type RelationContextField = {
  field: string;
  reason: string;
  suggested_relation?: string | undefined;
};

type AliasField = {
  field: string;
  prefer: string;
  reason: string;
};

type RunnerCompanion = {
  raw: string;
  companion: string;
  reason: string;
};

export type OntologyGuide = {
  observation_kind: MtaObservationKind;
  preferred_fields: string[];
  runner_companions: RunnerCompanion[];
  relation_context_fields: RelationContextField[];
  alias_fields: AliasField[];
  notes: string[];
};

export { RUNNER_OWNED_FIELDS };

function guideFromSpec(spec: KindSpec): OntologyGuide {
  return {
    observation_kind: spec.observation_kind,
    preferred_fields: spec.preferred_fields,
    runner_companions: spec.runner_companions,
    relation_context_fields: spec.relation_context_fields,
    alias_fields: spec.fields
      .filter((field) => field.prefer)
      .map((field) => ({ field: field.name, prefer: field.prefer!, reason: field.description })),
    notes: spec.notes,
  };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasPayloadValue(payload: JsonObject, field: string) {
  const value = payload[field];
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function ontologyGuide(kind?: string | undefined): OntologyGuide[] {
  if (kind) {
    const spec = kindSpec(kind);
    return spec && !spec.deprecated ? [guideFromSpec(spec)] : [];
  }
  return allKindSpecs()
    .filter((spec) => !spec.deprecated)
    .map(guideFromSpec);
}

export function ontologyGuideMarkdown(kind?: string | undefined) {
  const guides = ontologyGuide(kind);
  if (guides.length === 0) return "No curated ontology guide for that observation kind yet.";

  const lines = [
    "Ontology guidance is advisory unless validation says otherwise: preserve raw source literals, use preferred raw fields where available, and let the runner add normalized companions.",
  ];
  for (const guide of guides) {
    lines.push("", `### ${guide.observation_kind}`);
    lines.push(`- Preferred raw fields: ${guide.preferred_fields.join(", ")}`);
    if (guide.runner_companions.length > 0) {
      lines.push(
        `- Runner-owned companions: ${guide.runner_companions.map((item) => `${item.raw} -> ${item.companion}`).join("; ")}`,
      );
    }
    if (guide.alias_fields.length > 0) {
      lines.push(`- Prefer aliases: ${guide.alias_fields.map((item) => `${item.field} -> ${item.prefer}`).join("; ")}`);
    }
    if (guide.relation_context_fields.length > 0) {
      lines.push(`- Relation-context fields: ${guide.relation_context_fields.map((item) => item.field).join(", ")}`);
    }
    for (const note of guide.notes) lines.push(`- ${note}`);
  }
  return lines.join("\n");
}

export function ontologyWarningsForPayload(
  kind: MtaObservationKind,
  submittedPayload: JsonObject | undefined,
  normalizedPayload: JsonObject | undefined = submittedPayload,
) {
  const payload = submittedPayload ?? {};
  const normalized = normalizedPayload ?? {};
  const warnings: string[] = [];
  const spec = kindSpec(kind);
  const guide = spec && !spec.deprecated ? guideFromSpec(spec) : undefined;

  for (const field of Object.keys(payload)) {
    if (field.endsWith("_normalized") || RUNNER_OWNED_FIELDS.has(field)) {
      warnings.push(`${kind}.${field} is runner-owned normalized output; submit the raw source literal and let the runner populate this companion.`);
    }
  }

  if (guide) {
    for (const alias of guide.alias_fields) {
      if (hasPayloadValue(payload, alias.field)) {
        warnings.push(`${kind}.${alias.field} is accepted as passthrough, but prefer ${alias.prefer}. ${alias.reason}`);
      }
    }

    for (const relationField of guide.relation_context_fields) {
      if (hasPayloadValue(normalized, relationField.field)) {
        const relation = relationField.suggested_relation ? ` Suggested relation: ${relationField.suggested_relation}.` : "";
        warnings.push(`${kind}.${relationField.field} is relation context, not a closed enum or identity key. ${relationField.reason}${relation}`);
      }
    }
  }

  if (kind === "route" && Array.isArray(payload.borough)) {
    warnings.push("route.borough is currently mixed scalar/array in the corpus; use borough for one borough and boroughs for arrays.");
  }

  if (kind === "entity" && (typeof payload.publisher === "boolean" || typeof payload.operator === "boolean")) {
    warnings.push("entity publisher/operator booleans are mixed with organization-name fields in the corpus; prefer explicit role fields or relation context when possible.");
  }

  if (kind === "table") {
    warnings.push("table records are deprecated; cite source table/table-like blocks and submit substantive facts as non-table records.");
  }

  return [...new Set(warnings)];
}

export function normalizedCompanionsAdded(submittedPayload: JsonObject | undefined, normalizedPayload: JsonObject | undefined) {
  if (!isJsonObject(normalizedPayload)) return [];
  const submitted = submittedPayload ?? {};
  return Object.keys(normalizedPayload)
    .filter((field) => submitted[field] === undefined)
    .filter((field) => field.endsWith("_normalized") || RUNNER_OWNED_FIELDS.has(field))
    .sort();
}
