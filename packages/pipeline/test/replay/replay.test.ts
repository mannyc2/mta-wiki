import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  baselineForSource,
  buildReplaySampleManifest,
  diffReplay,
  writeReplayEval,
  type ReplayProjectedRecord,
} from "@mta-wiki/pipeline/replay/replay";

const work = join(tmpdir(), `mta-replay-test-${process.pid}`);
afterAll(() => rmSync(work, { recursive: true, force: true }));

function record(id: string, kind: MtaCanonicalRecord["record_kind"], payload: MtaCanonicalRecord["payload"] = {}, sourceId = "source_a"): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: sourceId,
    local_observation_id: id,
    display_name: id,
    payload,
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-03T00:00:00.000Z",
  };
}

function writeJsonl(path: string, rows: unknown[]) {
  writeFileSync(path, rows.map((row) => stableJson(row as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : ""), "utf8");
}

function writeFixtureRelease(root: string, releaseId: string, records: MtaCanonicalRecord[]) {
  const releaseDir = join(root, "data", "exports", "releases", releaseId);
  const qualityDir = join(root, "data", "quality", releaseId);
  mkdirSync(releaseDir, { recursive: true });
  mkdirSync(qualityDir, { recursive: true });
  writeFileSync(join(root, "data", "exports", "releases", "LATEST"), `${releaseId}\n`, "utf8");
  writeJsonl(join(qualityDir, "sample-audit.jsonl"), [{ record_id: "metric_speed" }]);

  const files: Record<string, string> = {
    source: "sources.jsonl",
    entity: "entities.jsonl",
    project: "projects.jsonl",
    corridor: "corridors.jsonl",
    route: "routes.jsonl",
    treatment_component: "treatment_components.jsonl",
    event: "events.jsonl",
    claim: "claims.jsonl",
    metric_claim: "metric_claims.jsonl",
    table: "tables.jsonl",
    source_gap: "source_gaps.jsonl",
    relation: "relations.jsonl",
  };
  for (const [kind, filename] of Object.entries(files)) writeJsonl(join(releaseDir, filename), records.filter((row) => row.record_kind === kind));
  writeJsonl(join(releaseDir, "route_anchors.jsonl"), []);
  writeFileSync(join(releaseDir, "taxonomy.json"), "{}\n", "utf8");
  writeFileSync(join(releaseDir, "manifest.json"), "{}\n", "utf8");
}

function projected(id: string, value: number): ReplayProjectedRecord {
  return {
    v1_record_id: id,
    record_kind: "metric_claim",
    display_name: "Bus speed",
    truth_status: "source_stated",
    review_state: "unreviewed",
    payload: { metric_name: "bus_speed", value, unit: "mph" },
    evidence_refs: [{ source_id: "source_a", block_id: "p001_c0001" }],
  };
}

describe("replay sample manifest", () => {
  it("is deterministic and always includes audit-cited sources", () => {
    const root = join(work, "sample");
    mkdirSync(join(root, "data", "quality", "test"), { recursive: true });
    writeJsonl(join(root, "data", "quality", "test", "sample-audit.jsonl"), [{ record_id: "metric_audit" }]);

    const sourceA = record("source_a", "source", { publisher: "NYC DOT", content_type: "application/pdf" }, "source_a");
    const sourceB = record("source_b", "source", { authority_tier: "board_material" }, "source_b");
    const metric = record("metric_audit", "metric_claim", { value: 10 }, "source_a");
    metric.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];

    const first = buildReplaySampleManifest([sourceB, metric, sourceA], { releaseId: "test", rootDir: root, targetSourceCount: 1 });
    const second = buildReplaySampleManifest([sourceA, metric, sourceB], { releaseId: "test", rootDir: root, targetSourceCount: 1 });
    expect(first).toEqual(second);
    expect(first.sources.map((source) => source.source_id)).toContain("source_a");
    expect(first.audit.all_audit_sources_included).toBe(true);
  });
});

describe("replay baseline projection", () => {
  it("projects source-specific fields for metrics and relations", () => {
    const metric = record("metric_speed", "metric_claim", { metric_name: "bus_speed", value: 11.5, unit: "mph" });
    metric.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];
    const relation = record("relation_route_metric", "relation", {
      subject_id: "route_m14",
      object_id: "metric_speed",
      relation_family: "metric_context",
      assertion_status: "delivered",
    });
    relation.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];

    const baseline = baselineForSource([metric, relation], "test", "source_a");
    expect(baseline.records).toHaveLength(2);
    expect(baseline.records.find((row) => row.record_kind === "metric_claim")?.payload.value).toBe(11.5);
    expect(baseline.records.find((row) => row.record_kind === "relation")?.relation).toEqual({
      subject_id: "route_m14",
      object_id: "metric_speed",
      relation_family: "metric_context",
      relation_kind: undefined,
      assertion_status: "delivered",
    });
  });
});

describe("replay diff", () => {
  it("is id-insensitive for equal projections", () => {
    const expected = projected("metric_v1", 10);
    const actual = { ...projected("metric_v2", 10), v1_record_id: "new_v2_id" };
    expect(diffReplay([expected], [actual]).match).toBe(1);
  });

  it("ignores v1-only payload residue and volatile evidence metadata", () => {
    const expected = {
      ...projected("metric_v1", 10),
      display_name: "V1 display",
      raw_text: "v1 extracted raw text",
      payload: {
        ...projected("metric_v1", 10).payload,
        _merged_field_values: { unit: ["mph"] },
        derivation_rule: "v1-only",
      },
      evidence_refs: [
        {
          source_id: "source_a",
          block_id: "p001_c0001",
          page_number: 1,
          role: "metric",
          text_sha256: "sha256:abc",
        },
      ],
    } satisfies ReplayProjectedRecord;
    const actual = {
      ...projected("metric_v2", 10),
      display_name: "V2 display",
      payload: projected("metric_v2", 10).payload,
      evidence_refs: [{ source_id: "source_a", block_id: "p001_c0001" }],
    } satisfies ReplayProjectedRecord;

    const diff = diffReplay([expected], [actual]);
    expect(diff.match).toBe(1);
    expect(diff.field_mismatch).toBe(0);
  });

  it("still compares schema payload fields and evidence source blocks", () => {
    const expected = projected("metric_v1", 10);
    const changedPayload = { ...projected("metric_v2", 12), v1_record_id: "metric_v2_payload" };
    const changedBlock = {
      ...projected("metric_v2", 10),
      v1_record_id: "metric_v2_block",
      evidence_refs: [{ source_id: "source_a", block_id: "p001_c0002" }],
    } satisfies ReplayProjectedRecord;

    const payloadDiff = diffReplay([expected], [changedPayload]);
    expect(payloadDiff.field_mismatch).toBe(1);
    expect(payloadDiff.entries.find((entry) => entry.status === "field_mismatch")?.fields).toContain("payload.value");

    const blockDiff = diffReplay([expected], [changedBlock]);
    expect(blockDiff.missing).toBe(1);
    expect(blockDiff.extra).toBe(1);
  });

  it("compares relations through canonical endpoints rather than v1 local alias residue", () => {
    const expected: ReplayProjectedRecord = {
      v1_record_id: "relation_v1",
      record_kind: "relation",
      display_name: "Project has metric",
      truth_status: "source_stated",
      review_state: "unreviewed",
      payload: {
        relation_kind: "has_metric",
        relation_family: "metric_context",
        subject_id: "project_a",
        object_id: "metric_a",
        subject_local_observation_id: "project_local",
        object_local_observation_id: "metric_local",
        description: "v1 wording",
      },
      relation: {
        relation_kind: "has_metric",
        relation_family: "metric_context",
        assertion_status: "delivered",
        subject_id: "project_a",
        object_id: "metric_a",
      },
      evidence_refs: [{ source_id: "source_a", block_id: "p001_c0001" }],
    };
    const actual: ReplayProjectedRecord = {
      ...expected,
      v1_record_id: "relation_v2",
      display_name: "V2 relation wording",
      payload: {
        relation_kind: "has_metric",
        relation_family: "metric_context",
        subject_id: "project_a",
        object_id: "metric_a",
        description: "v2 wording",
      },
    };
    expect(diffReplay([expected], [actual]).match).toBe(1);
  });

  it("classifies field mismatch, missing, and extra records", () => {
    const expectedA = projected("metric_a", 10);
    const actualA = projected("metric_a_v2", 12);
    const expectedB = { ...projected("metric_b", 20), evidence_refs: [{ source_id: "source_a", block_id: "p001_c0002" }] };
    const extra = { ...projected("metric_extra", 30), evidence_refs: [{ source_id: "source_a", block_id: "p001_c0003" }] };
    const diff = diffReplay([expectedA, expectedB], [actualA, extra]);
    expect(diff.field_mismatch).toBe(1);
    expect(diff.entries.find((entry) => entry.status === "field_mismatch")?.fields).toContain("payload.value");
    expect(diff.missing).toBe(1);
    expect(diff.extra).toBe(1);
  });
});

describe("replay report", () => {
  it("computes per-kind rates for a fixture actual dir", () => {
    const root = join(work, "report");
    const source = record("source_a", "source", { publisher: "NYC DOT", content_type: "application/pdf" }, "source_a");
    source.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0000" }];
    const metric = record("metric_speed", "metric_claim", { metric_name: "bus_speed", value: 10, unit: "mph" });
    metric.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];
    const relation = record("relation_metric", "relation", { subject_id: "route_m14", object_id: "metric_speed", relation_family: "metric_context" });
    relation.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0002" }];
    writeFixtureRelease(root, "test", [source, metric, relation]);

    const actualDir = join(root, "actual");
    mkdirSync(actualDir, { recursive: true });
    const changed = baselineForSource([metric, relation], "test", "source_a");
    changed.records = changed.records.map((row) => (row.record_kind === "metric_claim" ? { ...row, payload: { ...row.payload, value: 12 } } : row));
    changed.records.push({ ...projected("metric_extra", 30), evidence_refs: [{ source_id: "source_a", block_id: "p001_c0003" }] });
    changed.record_count = changed.records.length;
    writeFileSync(join(actualDir, "source_a.json"), `${stableJson(changed as unknown as JsonValue)}\n`, "utf8");

    const result = writeReplayEval({ releaseId: "test", runId: "fixture", actualDir, rootDir: root });
    expect(result.report.totals.expected).toBe(3);
    expect(result.report.totals.match).toBe(1);
    expect(result.report.totals.field_mismatch).toBe(1);
    expect(result.report.totals.extra).toBe(1);
    expect(result.report.by_kind.metric_claim?.agreement_rate).toBe(0);
    expect(result.report.by_kind.relation?.agreement_rate).toBe(1);
    expect(result.report.source_rows).toEqual([
      {
        source_id: "source_a",
        expected: 3,
        actual: 3,
        match: 1,
        field_mismatch: 1,
        missing: 1,
        extra: 1,
        agreement_rate: 1 / 3,
      },
    ]);
    expect(result.report.mismatch_fields_top["payload.value"]).toBe(1);
  });

  it("can scope a pilot report to sources present in the actual dir", () => {
    const root = join(work, "actual-only");
    const sourceA = record("source_a", "source", { publisher: "NYC DOT", content_type: "application/pdf" }, "source_a");
    sourceA.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0000" }];
    const metricA = record("metric_speed", "metric_claim", { metric_name: "bus_speed", value: 10, unit: "mph" }, "source_a");
    metricA.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];
    const sourceB = record("source_b", "source", { publisher: "NYC DOT", content_type: "application/pdf" }, "source_b");
    sourceB.evidence_refs = [{ source_id: "source_b", block_id: "p001_c0000" }];
    const metricB = record("metric_other", "metric_claim", { metric_name: "bus_speed", value: 20, unit: "mph" }, "source_b");
    metricB.evidence_refs = [{ source_id: "source_b", block_id: "p001_c0001" }];
    writeFixtureRelease(root, "test", [sourceA, metricA, sourceB, metricB]);

    const actualDir = join(root, "actual");
    mkdirSync(actualDir, { recursive: true });
    const actual = baselineForSource([sourceA, metricA], "test", "source_a");
    writeFileSync(join(actualDir, "source_a.json"), `${stableJson(actual as unknown as JsonValue)}\n`, "utf8");

    const full = writeReplayEval({ releaseId: "test", runId: "fixture-full", actualDir, rootDir: root });
    const scoped = writeReplayEval({ releaseId: "test", runId: "fixture-scoped", actualDir, actualOnly: true, rootDir: root });
    expect(full.report.source_count).toBe(2);
    expect(full.report.totals.missing).toBeGreaterThan(0);
    expect(scoped.report.source_count).toBe(1);
    expect(scoped.report.totals.missing).toBe(0);
    expect(scoped.report.totals.match).toBe(2);
  });
});
