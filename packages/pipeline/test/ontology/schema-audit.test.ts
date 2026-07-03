import { describe, expect, it } from "bun:test";
import { auditSubmissionEntries } from "@mta-wiki/pipeline/ontology/schema-audit";
import type { JsonObject, MtaCanonicalRecord, MtaObservationKind, MtaSubmissionEntry } from "@mta-wiki/db/types";

let counter = 0;

function entry(
  observationKind: MtaObservationKind,
  payload: JsonObject,
  options: { state?: "accepted" | "rejected"; label?: string; rawText?: string } = {},
): MtaSubmissionEntry {
  counter += 1;
  return {
    submission_id: `sub_${counter}`,
    run_id: "test_run",
    submitted_at: "2026-06-08T00:00:00.000Z",
    tool_args_sha256: `sha256:${counter}`,
    tool_args: {
      source_id: "test_source",
      observation_kind: observationKind,
      local_observation_id: `local_${counter}`,
      label: options.label,
      raw_text: options.rawText,
      payload,
    },
    validation: { state: options.state ?? "accepted", issues: [] },
  };
}

function kind(result: ReturnType<typeof auditSubmissionEntries>, observationKind: string) {
  const found = result.kinds.find((entryKind) => entryKind.observation_kind === observationKind);
  if (!found) throw new Error(`kind not found: ${observationKind}`);
  return found;
}

function canonicalRecord(recordKind: MtaObservationKind, payload: JsonObject): MtaCanonicalRecord {
  return {
    record_id: `${recordKind}_canonical`,
    record_kind: recordKind,
    source_id: "test_source",
    local_observation_id: `canonical_${recordKind}`,
    display_name: "Canonical fixture",
    payload,
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-08T00:00:00.000Z",
  };
}

describe("auditSubmissionEntries", () => {
  it("classifies a repeated low-cardinality field as an enum candidate with a sorted closure", () => {
    const entries = [
      entry("route", { service_variant: "sbs" }),
      entry("route", { service_variant: "limited" }),
      entry("route", { service_variant: "sbs" }),
      entry("route", { service_variant: "local" }),
    ];

    const result = auditSubmissionEntries(entries);
    const routeKind = kind(result, "route");
    const variant = routeKind.enum_candidates.find((candidate) => candidate.field === "service_variant");

    expect(variant).toBeDefined();
    expect(variant?.proposed_closure).toEqual(["limited", "local", "sbs"]);
    expect(variant?.occurrences).toBe(4);
    // value_counts only surfaces values seen at least twice.
    expect(variant?.value_counts).toEqual([{ value: "sbs", count: 2 }]);
    // limited and local are singletons -> not saturated -> closure stays open.
    expect(variant?.singleton_count).toBe(2);
    expect(variant?.closure_readiness).toBe("open");
  });

  it("flags a well-sampled, singleton-free enum as a saturation/closure candidate", () => {
    // 12 entries, two values, each recurring -> 0 singletons, full coverage.
    const entries = Array.from({ length: 12 }, (_unused, index) => entry("route", { borough: index % 2 === 0 ? "Brooklyn" : "Queens" }));
    const result = auditSubmissionEntries(entries);
    const borough = kind(result, "route").enum_candidates.find((candidate) => candidate.field === "borough");

    expect(borough?.singleton_count).toBe(0);
    expect(borough?.singleton_ratio).toBe(0);
    expect(borough?.closure_readiness).toBe("saturated");
  });

  it("does not treat a high-cardinality unique-valued field as an enum", () => {
    const entries = [
      entry("route", { route_id: "B46" }),
      entry("route", { route_id: "S79" }),
      entry("route", { route_id: "M14" }),
      entry("route", { route_id: "Bx6" }),
      entry("route", { route_id: "Q52" }),
    ];

    const result = auditSubmissionEntries(entries);
    const routeKind = kind(result, "route");
    const routeId = routeKind.fields.find((field) => field.field === "route_id");

    expect(routeId?.classification).toBe("free_text");
    expect(routeKind.enum_candidates.find((candidate) => candidate.field === "route_id")).toBeUndefined();
  });

  it("classifies numeric and multi-word free-text fields away from enums", () => {
    const entries = [
      entry("metric_claim", { value: 12, location: "14th Street between 3rd and 9th Avenue corridor segment" }),
      entry("metric_claim", { value: 30, location: "Fordham Road from Grand Concourse to Southern Boulevard" }),
      entry("metric_claim", { value: 45, location: "Main Street between Kissena and Roosevelt Avenue" }),
    ];

    const result = auditSubmissionEntries(entries);
    const metricKind = kind(result, "metric_claim");

    expect(metricKind.fields.find((field) => field.field === "value")?.classification).toBe("numeric");
    expect(metricKind.fields.find((field) => field.field === "location")?.classification).toBe("free_text");
    expect(metricKind.enum_candidates).toHaveLength(0);
  });

  it("flags keys outside the declared anchors and counts accepted vs rejected", () => {
    const entries = [
      entry("route", { route_id: "B46", made_up_field: "x" }, { state: "accepted" }),
      entry("route", { route_id: "S79", made_up_field: "y" }, { state: "rejected" }),
    ];

    const result = auditSubmissionEntries(entries);
    const routeKind = kind(result, "route");

    expect(routeKind.submission_count).toBe(2);
    expect(routeKind.accepted_count).toBe(1);
    expect(routeKind.rejected_count).toBe(1);
    expect(routeKind.additional_keys).toContain("made_up_field");
    // route_id is a declared anchor, so it must not appear as an additional key.
    expect(routeKind.additional_keys).not.toContain("route_id");
  });

  it("keeps accepted/rejected/canonical counts separate for promotion decisions", () => {
    const entries = [
      entry("metric_claim", { raw_value_text: "15-or-better", existing_frequency_category: "15-or-better" }, { state: "rejected" }),
      entry("metric_claim", { raw_value_text: "30-or-better", existing_frequency_category: "30-or-better" }, { state: "rejected" }),
      entry("metric_claim", { raw_value_text: "8 mph", unit: "mph" }, { state: "accepted" }),
    ];

    const result = auditSubmissionEntries(entries, [canonicalRecord("metric_claim", { raw_value_text: "9 mph", unit: "mph" })]);
    const metricKind = kind(result, "metric_claim");
    const rejectedOnly = metricKind.fields.find((field) => field.field === "existing_frequency_category");
    const unit = metricKind.fields.find((field) => field.field === "unit");

    expect(result.corpus.canonical_records).toBe(1);
    expect(rejectedOnly?.occurrences).toBe(2);
    expect(rejectedOnly?.accepted_occurrences).toBe(0);
    expect(rejectedOnly?.rejected_occurrences).toBe(2);
    expect(rejectedOnly?.canonical_occurrences).toBe(0);
    expect(unit?.accepted_occurrences).toBe(1);
    expect(unit?.canonical_occurrences).toBe(1);
  });

  it("surfaces repeated labels as source_labels candidates", () => {
    const entries = [
      entry("entity", { entity_name: "NYC DOT" }, { label: "NYC Department of Transportation" }),
      entry("entity", { entity_name: "NYC DOT" }, { label: "NYC Department of Transportation" }),
      entry("entity", { entity_name: "NYCT" }, { label: "seen once" }),
    ];

    const result = auditSubmissionEntries(entries);
    const entityKind = kind(result, "entity");
    const repeat = entityKind.label_repeats.find((item) => item.value === "NYC Department of Transportation");

    expect(repeat).toEqual({ source: "label", value: "NYC Department of Transportation", count: 2 });
    expect(entityKind.label_repeats.find((item) => item.value === "seen once")).toBeUndefined();
  });
});
