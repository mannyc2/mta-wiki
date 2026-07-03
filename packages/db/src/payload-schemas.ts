import { Type, type TSchema } from "typebox";
import { kindSpec, RUNNER_OWNED_FIELDS, type KindFieldSpec, type KindFieldType } from "./kind-registry.js";
import type { JsonObject, JsonValue, MtaObservationKind } from "./types.js";

export type PayloadSchemaResult = {
  /** Hard shape violations: wrong type for a known field, closed-enum miss, runner-owned field submitted. */
  issues: string[];
  /** Advisory: prefer-alias usage and similar. */
  warnings: string[];
  /** Top-level keys the registry does not know. Enforce mode treats these as issues; warn mode as warnings. */
  unknown_fields: string[];
};

function fieldTypeSchema(type: KindFieldType): TSchema {
  switch (type) {
    case "string":
      return Type.String();
    case "number":
      return Type.Number();
    case "boolean":
      return Type.Boolean();
    case "string_array":
      return Type.Array(Type.String());
    case "string_or_number":
      return Type.Union([Type.String(), Type.Number()]);
    case "string_or_string_array":
      return Type.Union([Type.String(), Type.Array(Type.String())]);
    case "string_or_boolean":
      return Type.Union([Type.String(), Type.Boolean()]);
    case "json":
      return Type.Any();
  }
}

function fieldSchema(spec: KindFieldSpec): TSchema {
  const description = spec.prefer ? `${spec.description} Prefer ${spec.prefer}.` : spec.description;
  if (spec.enum_values) {
    return Type.Union(
      [...spec.enum_values.map((value) => Type.Literal(value)), Type.Literal("other")],
      { description: `${description} Allowed: ${spec.enum_values.join(", ")}, other.` },
    );
  }
  const schema = fieldTypeSchema(spec.type);
  (schema as { description?: string }).description = description;
  return schema;
}

/**
 * Typed payload schema for a kind's submit tool: known fields, no additional
 * properties, with extra_fields as the single explicit channel for fields the
 * registry does not know yet (mined by schema-audit as the promotion queue).
 */
export function payloadSchemaForKind(kind: MtaObservationKind): TSchema {
  const spec = kindSpec(kind);
  if (!spec) return Type.Optional(Type.Any());

  const properties: Record<string, TSchema> = {};
  for (const field of spec.fields) {
    properties[field.name] = Type.Optional(fieldSchema(field));
  }
  properties.extra_fields = Type.Optional(
    Type.Record(Type.String(), Type.Any(), {
      description: "Source-backed fields the schema does not know yet. Use existing fields when one fits.",
    }),
  );

  const anchorNote = spec.anchors.length > 0 ? ` Must include at least one of: ${spec.anchors.join(", ")}.` : "";
  return Type.Object(properties, {
    additionalProperties: false,
    description: `${spec.summary}${anchorNote}`,
  });
}

function valueMatchesType(value: JsonValue | undefined, type: KindFieldType): boolean {
  if (value === undefined || value === null) return true;
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "string_array":
      return Array.isArray(value) && value.every((item) => typeof item === "string");
    case "string_or_number":
      return typeof value === "string" || typeof value === "number";
    case "string_or_string_array":
      return typeof value === "string" || (Array.isArray(value) && value.every((item) => typeof item === "string"));
    case "string_or_boolean":
      return typeof value === "string" || typeof value === "boolean";
    case "json":
      return true;
  }
}

function typeLabel(type: KindFieldType) {
  switch (type) {
    case "string_array":
      return "array of strings";
    case "string_or_number":
      return "string or number";
    case "string_or_string_array":
      return "string or array of strings";
    case "string_or_boolean":
      return "string or boolean";
    default:
      return type;
  }
}

export function validatePayloadSchema(kind: MtaObservationKind, payload: JsonObject | undefined): PayloadSchemaResult {
  const result: PayloadSchemaResult = { issues: [], warnings: [], unknown_fields: [] };
  const spec = kindSpec(kind);
  if (!spec || !payload) return result;

  const fieldsByName = new Map(spec.fields.map((field) => [field.name, field]));

  for (const [name, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (name === "extra_fields") {
      if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
        result.issues.push(`${kind}.extra_fields must be an object of field name -> value`);
      }
      continue;
    }
    if (name.startsWith("_")) continue; // runner/materializer bookkeeping such as _merged_field_values

    if (RUNNER_OWNED_FIELDS.has(name) || name.endsWith("_normalized")) {
      result.issues.push(`${kind}.${name} is runner-owned normalized output; submit the raw source literal instead`);
      continue;
    }

    const field = fieldsByName.get(name);
    if (!field) {
      result.unknown_fields.push(name);
      continue;
    }

    if (!valueMatchesType(value, field.type)) {
      result.issues.push(`${kind}.${name} must be ${typeLabel(field.type)}`);
      continue;
    }

    if (field.enum_values && typeof value === "string") {
      const allowed = new Set([...field.enum_values, "other"]);
      if (!allowed.has(value)) {
        result.issues.push(`${kind}.${name} must be one of ${field.enum_values.join(", ")}, other — put non-standard literals in extra_fields`);
      }
    }

    if (field.prefer) {
      result.warnings.push(`${kind}.${name} is accepted, but prefer ${field.prefer}`);
    }
  }

  return result;
}
