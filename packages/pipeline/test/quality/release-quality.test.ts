import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord, StagedSourceBlock } from "@mta-wiki/db/types";
import {
  checkDeterministicQualityReport,
  correctionsLedgerStats,
  crossFieldSanity,
  deterministicQualityReport,
  evidenceResolution,
  quoteContainsValueSummary,
  sameSourceDuplication,
  semanticInvariantCounts,
  stratifiedSampleRows,
  THRESHOLDS,
  writeDeterministicQualityReport,
} from "@mta-wiki/pipeline/quality/release-quality";

const work = join(tmpdir(), `mta-quality-test-${process.pid}`);
afterAll(() => rmSync(work, { recursive: true, force: true }));

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function record(id: string, kind: MtaCanonicalRecord["record_kind"], payload: MtaCanonicalRecord["payload"] = {}): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: "source_a",
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

function block(sourceId: string, blockId: string, rawText: string): StagedSourceBlock {
  return {
    source_id: sourceId,
    block_id: blockId,
    page_number: 1,
    reading_order: 1,
    source_surface: "pdf_text",
    raw_source_path: `raw/sources/${sourceId}/text.txt`,
    raw_start_char: 0,
    raw_end_char: rawText.length,
    raw_text: rawText,
    normalized_text: rawText,
    raw_text_sha256: sha256(rawText),
    normalized_text_sha256: sha256(rawText),
  };
}

function writeJsonl(path: string, rows: unknown[]) {
  writeFileSync(path, rows.map((row) => stableJson(row as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : ""), "utf8");
}

function writeFixtureRoot(releaseId: string, records: MtaCanonicalRecord[], blocks: StagedSourceBlock[]) {
  const root = join(work, releaseId);
  const releaseDir = join(root, "data", "exports", "releases", releaseId);
  mkdirSync(releaseDir, { recursive: true });
  mkdirSync(join(root, "raw", "sources", "source_a"), { recursive: true });
  writeJsonl(join(root, "raw", "sources", "source_a", "blocks.jsonl"), blocks);
  writeFileSync(join(root, "data", "exports", "releases", "LATEST"), `${releaseId}\n`, "utf8");

  const byKind = new Map<string, MtaCanonicalRecord[]>();
  for (const item of records) byKind.set(item.record_kind, [...(byKind.get(item.record_kind) ?? []), item]);
  writeJsonl(join(releaseDir, "sources.jsonl"), byKind.get("source") ?? []);
  writeJsonl(join(releaseDir, "routes.jsonl"), byKind.get("route") ?? []);
  writeJsonl(join(releaseDir, "events.jsonl"), byKind.get("event") ?? []);
  writeJsonl(join(releaseDir, "relations.jsonl"), byKind.get("relation") ?? []);
  writeJsonl(join(releaseDir, "metric_claims.jsonl"), byKind.get("metric_claim") ?? []);
  writeJsonl(join(releaseDir, "treatment_components.jsonl"), byKind.get("treatment_component") ?? []);
  writeJsonl(join(releaseDir, "route_anchors.jsonl"), [{ gtfs_route_id: "B1", canonical_route_record_id: "route_b1", disposition: "true_route", variant_record_ids: [] }]);
  writeFileSync(join(releaseDir, "manifest.json"), "{}\n", "utf8");
  return root;
}

describe("release quality checks", () => {
  it("resolves evidence refs by cited block sha", () => {
    const sourceBlock = block("source_a", "p001_c0001", "M14 bus speeds improved 12% on May 25, 2014.");
    const good = record("metric_good", "metric_claim", { value: "12%" });
    good.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001", text_sha256: sourceBlock.raw_text_sha256 }];
    const bad = record("metric_bad", "metric_claim", { value: "15%" });
    bad.evidence_refs = [{ source_id: "source_a", block_id: "p001_c9999", text_sha256: sourceBlock.raw_text_sha256 }];

    const root = writeFixtureRoot("evidence", [good, bad], [sourceBlock]);
    const summary = evidenceResolution([good, bad], root);
    expect(summary.total_refs).toBe(2);
    expect(summary.resolved_refs).toBe(1);
    expect(summary.resolution_rate).toBe(0.5);
    expect(summary.sample_failures[0]?.record_id).toBe("metric_bad");
  });

  it("checks quoted numeric and date payload values by kind", () => {
    const good = record("metric_good_quote", "metric_claim", { value: "12%", date_text: "May 25, 2014" });
    good.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001", source_quote: "Bus speeds improved 12% on May 25, 2014." }];
    const missing = record("metric_missing_quote", "metric_claim", { value: "17%" });
    missing.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001", source_quote: "Bus speeds improved 12% on May 25, 2014." }];

    const summary = quoteContainsValueSummary([good, missing]).by_kind.metric_claim;
    expect(summary?.values_checked).toBe(3);
    expect(summary?.values_contained).toBe(2);
    expect(summary?.values_missing).toBe(1);
    expect(summary?.sample_failures[0]?.record_id).toBe("metric_missing_quote");
  });

  it("flags event date-window and route id sanity issues", () => {
    const source = record("source_a", "source", { published_date_normalized: "2014-01-01" });
    const event = record("event_future", "event", { date_normalized: "2021-01-01" });
    const routeGood = record("route_b1", "route", { route_id: "B1" });
    const routeBad = record("route_bad", "route", { route_id: "X999" });
    const root = writeFixtureRoot("cross", [source, event, routeGood, routeBad], [block("source_a", "p001_c0001", "text")]);

    const summary = crossFieldSanity([source, event, routeGood, routeBad], "cross", root);
    expect(summary.event_date_window.flagged).toBe(1);
    expect(summary.route_id_sanity.valid).toBe(1);
    expect(summary.route_id_sanity.flagged).toBe(1);
  });

  it("writes a deterministic report for a named release", () => {
    const sourceBlock = block("source_a", "p001_c0001", "M14 bus speeds improved 12%.");
    const metric = record("metric_report", "metric_claim", { value: "12%" });
    metric.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001", text_sha256: sourceBlock.raw_text_sha256, source_quote: "M14 bus speeds improved 12%." }];
    const root = writeFixtureRoot("det", [metric], [sourceBlock]);

    const report = deterministicQualityReport("det", root);
    expect(report.record_count).toBe(1);
    expect(report.evidence_ref_resolution.resolved_refs).toBe(1);
    const written = writeDeterministicQualityReport("det", root);
    expect(written.deterministic).toEqual(report);
    const beforeBytes = readFileSync(written.deterministicPath, "utf8");
    const beforeMtime = statSync(written.deterministicPath).mtimeMs;
    expect(checkDeterministicQualityReport("det", root).checked).toBe(true);
    expect(readFileSync(written.deterministicPath, "utf8")).toBe(beforeBytes);
    expect(statSync(written.deterministicPath).mtimeMs).toBe(beforeMtime);

    writeFileSync(written.deterministicPath, `${beforeBytes} `, "utf8");
    expect(() => checkDeterministicQualityReport("det", root)).toThrow(
      "Tracked deterministic quality report differs",
    );
  });

  it("reports semantic invariant, duplication, threshold, and correction-ledger metrics", () => {
    const relationA = record("relation_loop_a", "relation", { relation_kind: "same_as", subject_id: "entity_a", object_id: "entity_a" });
    const relationB = record("relation_dup_a", "relation", { relation_kind: "serves", subject_id: "route_b1", object_id: "corridor_a", as_of_date: "2026" });
    const relationC = record("relation_dup_b", "relation", { relation_kind: "serves", subject_id: "route_b1", object_id: "corridor_a", as_of_date: "2026" });
    const eventA = record("event_bad", "event", { event_kind: "completion_target", lifecycle_phase: "completed" },);
    const eventB = record("event_dup_a", "event", {});
    const eventC = record("event_dup_b", "event", {});
    eventB.display_name = "Duplicate Event";
    eventC.display_name = "Duplicate Event";
    const quarantined = record("relation_loop_q", "relation", { relation_kind: "same_as", subject_id: "entity_b", object_id: "entity_b" });
    quarantined.review_state = "quarantined";

    const invariants = semanticInvariantCounts([relationA, relationB, relationC, eventA, eventB, eventC, quarantined]);
    expect(invariants.relation_self_loops_open).toBe(1);
    expect(invariants.relation_self_loops_quarantined).toBe(1);
    expect(invariants.event_completion_target_completed_open).toBe(1);

    const dupes = sameSourceDuplication([relationA, relationB, relationC, eventA, eventB, eventC, quarantined]);
    expect(dupes.relations.groups).toBe(1);
    expect(dupes.relations.affected_records).toBe(2);
    expect(dupes.events.groups).toBe(1);
    expect(THRESHOLDS.judgeHumanAgreementMin).toBe(0.9);

    const root = join(work, "ledger");
    mkdirSync(join(root, "data", "semantic-corrections"), { recursive: true });
    writeJsonl(join(root, "data", "semantic-corrections", "corrections.jsonl"), [
      { correction_id: "semqa-000001", op: "set_review_state", provenance: "deterministic_rule", source_decision: "lane-a" },
      { correction_id: "semqa-000002", op: "retract_record", provenance: "human", source_decision: "lane-b" },
    ]);
    const ledger = correctionsLedgerStats(root);
    expect(ledger.entries).toBe(2);
    expect(ledger.by_op.set_review_state).toBe(1);
    expect(ledger.by_provenance.human).toBe(1);
  });
});

describe("stratifiedSampleRows", () => {
  it("returns a stable 300-row v1 sample when enough records exist", () => {
    const records: MtaCanonicalRecord[] = [];
    for (let index = 0; index < 110; index += 1) {
      records.push(record(`relation_${index}`, "relation", { relation_family: "route_scope", subject_id: "route_b1", object_id: `project_${index}` }));
    }
    for (let index = 0; index < 60; index += 1) records.push(record(`treatment_${index}`, "treatment_component"));
    for (let index = 0; index < 80; index += 1) records.push(record(`event_${index}`, "event"));
    for (let index = 0; index < 80; index += 1) records.push(record(`metric_${index}`, "metric_claim"));

    const first = stratifiedSampleRows(records, "v1-rc-test");
    const second = stratifiedSampleRows([...records].reverse(), "v1-rc-test");
    expect(first).toEqual(second);
    expect(first).toHaveLength(300);
    expect(first.filter((row) => row.sample_group === "route_scoped_relation")).toHaveLength(100);
    expect(first.filter((row) => row.sample_group === "treatment_component")).toHaveLength(50);
    expect(first.filter((row) => row.sample_group === "event")).toHaveLength(75);
    expect(first.filter((row) => row.sample_group === "metric_claim")).toHaveLength(75);
  });
});
