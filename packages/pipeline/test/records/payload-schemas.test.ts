import { describe, expect, it } from "bun:test";
import { allKindSpecs, kindSpec, RUNNER_OWNED_FIELDS, submitToolKinds } from "@mta-wiki/db/kind-registry";
import { payloadSchemaForKind, validatePayloadSchema } from "@mta-wiki/db/payload-schemas";
import { readSubmissionEntries, REQUIRED_PAYLOAD_ANCHORS } from "@mta-wiki/pipeline/records/submissions";
import type { JsonObject, MtaObservationKind } from "@mta-wiki/db/types";

// Journaled tool_args.payload is post-normalization: the runner added the
// *_normalized companions before journaling. Strip them to replay what the
// agent actually submitted.
function agentSubmittedPayload(payload: JsonObject | undefined): JsonObject | undefined {
  if (!payload) return payload;
  const stripped: JsonObject = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key.endsWith("_normalized") || RUNNER_OWNED_FIELDS.has(key)) continue;
    stripped[key] = value;
  }
  return stripped;
}

// Hard-issue ceilings per kind when replaying the accepted historical corpus.
// Issues here are wrong-type / closed-enum / runner-owned findings; unknown
// fields are tracked separately (they are the extra_fields promotion queue,
// not shape violations). Tighten these as the corpus is cleaned.
const ISSUE_RATE_CEILING: Partial<Record<MtaObservationKind, number>> = {
  source: 0.05,
  entity: 0.05,
  project: 0.25,
  corridor: 0.2,
  route: 0.25,
  treatment_component: 0.25,
  event: 0.95, // runner-owned *_normalized companions were journaled into payloads by early runs
  claim: 0.1,
  metric_claim: 0.25,
  source_gap: 0.05,
  relation: 0.05,
};

const UNKNOWN_FIELD_RATE_CEILING: Partial<Record<MtaObservationKind, number>> = {
  source: 0.4, // long tail of singleton document-metadata fields; the extra_fields channel is the right home

  entity: 0.35,
  project: 0.6,
  corridor: 0.5,
  route: 0.4,
  treatment_component: 0.3,
  event: 0.4,
  claim: 0.5,
  metric_claim: 0.5,
  source_gap: 0.2,
  relation: 0.2,
};

describe("kind registry", () => {
  it("declares anchors matching the legacy REQUIRED_PAYLOAD_ANCHORS surface", () => {
    expect(REQUIRED_PAYLOAD_ANCHORS.route).toEqual(["route_id", "route_name", "route", "route_label", "routes"]);
    expect(REQUIRED_PAYLOAD_ANCHORS.metric_claim).toEqual(["metric_name", "raw_value_text", "value", "value_min", "value_max"]);
    expect(REQUIRED_PAYLOAD_ANCHORS.table).toBeUndefined();
    expect(REQUIRED_PAYLOAD_ANCHORS.source).toBeUndefined();
  });

  it("declares anchor fields as known fields", () => {
    for (const spec of allKindSpecs()) {
      const names = new Set(spec.fields.map((field) => field.name));
      for (const anchor of spec.anchors) {
        expect(names.has(anchor)).toBe(true);
      }
    }
  });

  it("generates submit tools for all non-deprecated kinds", () => {
    const kinds = submitToolKinds();
    expect(kinds).toContain("route");
    expect(kinds).toContain("metric_claim");
    expect(kinds).not.toContain("table");
    expect(kinds.length).toBe(11);
  });

  it("builds a strict payload schema with an extra_fields channel", () => {
    const schema = payloadSchemaForKind("route") as { additionalProperties?: boolean; properties?: Record<string, unknown> };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties?.route_id).toBeDefined();
    expect(schema.properties?.extra_fields).toBeDefined();
  });
});

describe("payload schema validation", () => {
  it("flags wrong types, runner-owned fields, and closed-enum misses", () => {
    const result = validatePayloadSchema("route", {
      route_id: 42 as unknown as string,
      borough: "Westchester",
      route_type_normalized: "sbs",
      something_new: "value",
    });
    expect(result.issues.some((issue) => issue.includes("route.route_id must be string"))).toBe(true);
    expect(result.issues.some((issue) => issue.includes("route.borough must be one of"))).toBe(true);
    expect(result.issues.some((issue) => issue.includes("runner-owned"))).toBe(true);
    expect(result.unknown_fields).toEqual(["something_new"]);
  });

  it("accepts clean payloads and extra_fields passthrough", () => {
    const result = validatePayloadSchema("route", {
      route_id: "M86",
      route_name: "M86 Select Bus Service",
      borough: "Manhattan",
      extra_fields: { ridership_note: "weekday only" },
    });
    expect(result.issues).toEqual([]);
    expect(result.unknown_fields).toEqual([]);
  });
});

describe("historical corpus replay", () => {
  const entries = readSubmissionEntries().filter((entry) => entry.validation.state === "accepted");

  it("has the historical corpus available", () => {
    expect(entries.length).toBeGreaterThan(3000);
  });

  for (const kind of submitToolKinds()) {
    it(`keeps ${kind} replay rates under the ceilings`, () => {
      const kindEntries = entries.filter((entry) => entry.tool_args.observation_kind === kind);
      if (kindEntries.length === 0) return;

      let withIssues = 0;
      let withUnknown = 0;
      const sampleIssues = new Map<string, number>();
      for (const entry of kindEntries) {
        const result = validatePayloadSchema(kind, agentSubmittedPayload(entry.tool_args.payload));
        if (result.issues.length > 0) {
          withIssues += 1;
          for (const issue of result.issues) sampleIssues.set(issue, (sampleIssues.get(issue) ?? 0) + 1);
        }
        if (result.unknown_fields.length > 0) withUnknown += 1;
      }

      const issueRate = withIssues / kindEntries.length;
      const unknownRate = withUnknown / kindEntries.length;
      const issueCeiling = ISSUE_RATE_CEILING[kind] ?? 0.1;
      const unknownCeiling = UNKNOWN_FIELD_RATE_CEILING[kind] ?? 0.3;

      const topIssues = [...sampleIssues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      expect(
        issueRate,
        `${kind}: ${withIssues}/${kindEntries.length} entries with schema issues. Top: ${topIssues.map(([issue, count]) => `${count}x ${issue}`).join(" | ")}`,
      ).toBeLessThanOrEqual(issueCeiling);
      expect(unknownRate, `${kind}: ${withUnknown}/${kindEntries.length} entries with unknown fields`).toBeLessThanOrEqual(unknownCeiling);
    });
  }

  it("documents the registry drift queue: unknown fields seen 10+ times need a registry decision", () => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const kind = entry.tool_args.observation_kind;
      if (!kindSpec(kind) || kindSpec(kind)?.deprecated) continue;
      const result = validatePayloadSchema(kind, agentSubmittedPayload(entry.tool_args.payload));
      for (const field of result.unknown_fields) {
        const key = `${kind}.${field}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const frequent = [...counts.entries()].filter(([, count]) => count >= 10).sort((a, b) => b[1] - a[1]);
    // Drift gate: when this fails, promote the field into kind-registry.ts or
    // record why it should stay out (then raise the allowance deliberately).
    expect(
      frequent.length,
      `Frequent unknown fields needing registry decisions: ${frequent.map(([key, count]) => `${key} (${count})`).join(", ")}`,
    ).toBeLessThanOrEqual(40);
  });
});
