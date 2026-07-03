import { describe, expect, it } from "bun:test";
import { anchorMatchExtractResult } from "@mta-wiki/pipeline/identity/anchor-match";
import type { ExtractBoundaryResult } from "@mta-wiki/pipeline/extract/boundary";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";

function record(record_id: string, kind: MtaCanonicalRecord["record_kind"], payload: JsonObject, aliases: string[] = []): MtaCanonicalRecord {
  return {
    record_id,
    record_aliases: aliases,
    record_kind: kind,
    source_id: "source_a",
    local_observation_id: record_id,
    display_name: record_id,
    payload,
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-03T00:00:00.000Z",
  };
}

function extraction(kind: MtaCanonicalRecord["record_kind"], id: string, displayName: string, payload: JsonObject): ExtractBoundaryResult {
  return {
    source_id: "source_a",
    input_record_count: 1,
    accepted_record_count: 1,
    enum_miss_count: 0,
    review: [],
    records: [
      {
        v1_record_id: id,
        record_kind: kind,
        display_name: displayName,
        truth_status: "source_stated",
        review_state: "unreviewed",
        payload,
        evidence_refs: [{ source_id: "source_a", block_id: "p001_c0001" }],
      },
    ],
  };
}

describe("anchorMatchExtractResult", () => {
  it("resolves a known alias to its canonical record id", () => {
    const result = anchorMatchExtractResult(
      extraction("project", "project_local", "Woodhaven SBS", { project_name: "Woodhaven SBS" }),
      [record("project_woodhaven-select-bus-service", "project", { project_name: "Woodhaven SBS" }, ["project_woodhaven_sbs"])],
    );
    expect(result.decisions[0]?.status).toBe("matched");
    expect(result.extraction.records[0]?.v1_record_id).toBe("project_woodhaven-select-bus-service");
  });

  it("does not merge an ambiguous M15 route surface across do-not-merge pairs", () => {
    const local = record("route_m15-local", "route", { route_id: "M15", service_variant: "local" });
    const sbs = record("route_m15-sbs", "route", { route_id: "M15", service_variant: "sbs" });
    const result = anchorMatchExtractResult(extraction("route", "route_local", "M15", { route_id: "M15" }), [local, sbs], [
      { kind: "route", record_ids: ["route_m15-local", "route_m15-sbs"] },
    ]);
    expect(result.decisions[0]?.status).toBe("ambiguous");
    expect(result.extraction.records[0]?.v1_record_id).not.toBe("route_m15-local");
    expect(result.extraction.review.map((entry) => entry.code)).toContain("anchor_ambiguous");
  });

  it("queues no-match global records for review with a stable new id", () => {
    const result = anchorMatchExtractResult(extraction("corridor", "corridor_local", "Imaginary Avenue", { corridor_name: "Imaginary Avenue" }), []);
    expect(result.decisions[0]?.status).toBe("new");
    expect(result.extraction.records[0]?.v1_record_id).toStartWith("corridor_");
    expect(result.extraction.review.map((entry) => entry.code)).toContain("anchor_new");
  });
});
