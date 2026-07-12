import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "bun:test";
import type { JsonObject, MtaCanonicalRecord, StagedSourceBlock } from "@mta-wiki/db/types";
import type { RouteAnchorRow } from "@mta-wiki/pipeline/materialize/route-anchors";
import {
  draftQbnrRecoveryProposalFromFile,
  type QbnrRecoveryDraftOptions,
} from "@mta-wiki/pipeline/records/qbnr-recovery-draft";
import {
  QBNR_SERVICE_CHANGES_SOURCE_ID,
  type QbnrRecoveryBatchSpec,
} from "@mta-wiki/pipeline/records/qbnr-recovery-expander";

const fingerprint = "a".repeat(64);
const gapId = "operational-coverage:fixture-q3";
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function record(recordId: string, recordKind: MtaCanonicalRecord["record_kind"], payload: JsonObject): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: QBNR_SERVICE_CHANGES_SOURCE_ID,
    source_ids: [QBNR_SERVICE_CHANGES_SOURCE_ID],
    local_observation_id: `local_${recordId}`,
    local_observation_ids: [`local_${recordId}`],
    display_name: recordId,
    payload,
    evidence_refs: [],
    submission_ids: [`sub_${recordId}`],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-12T00:00:00.000Z",
  };
}

function fixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "qbnr-recovery-draft-"));
  roots.push(rootDir);
  const rawText = "Q3 | Changes to the Q3 took effect June 29, 2025. | The Q3 will keep its current routing, but some stops have been removed. View the full list of stops. | Get more details on Q3 service. | View the new Q3 timetable.";
  const hash = sha256(rawText);
  const block: StagedSourceBlock = {
    source_id: QBNR_SERVICE_CHANGES_SOURCE_ID,
    block_id: "p001_b0005",
    page_number: 1,
    reading_order: 5,
    source_surface: "ocr_text",
    block_kind: "text",
    raw_source_path: `raw/sources/${QBNR_SERVICE_CHANGES_SOURCE_ID}/text.txt`,
    raw_start_char: 0,
    raw_end_char: rawText.length,
    raw_text: rawText,
    normalized_text: rawText,
    raw_text_sha256: hash,
    normalized_text_sha256: hash,
  };
  const spec: QbnrRecoveryBatchSpec = {
    proposal_id: "orp_qbnr_q3_fixture",
    corpus_fingerprint: fingerprint,
    gap_ids: [gapId],
    project_record_id: "project_qbnr",
    project_label: "Queens redesign",
    drafted_by: "fixture-curator",
    drafted_at: "2026-07-12T00:00:00.000Z",
    rationale: "Exact Q3 row recovery fixture.",
    units: [{
      source_block_ids: [block.block_id],
      source_block_sha256s: [block.raw_text_sha256],
      source_route_labels: ["Q3"],
      route_label: "Q3",
      route_resolution: { mode: "target", target_record_id: "route_q3" },
      study_disposition: { status: "projectable", gtfs_route_id: "Q3" },
      event_kind: "service_change",
      occurrence_shape: "atomic",
      clauses: [{
        clause_kind: "treatment",
        id: "stop_removal",
        label: "Q3 stop removals",
        source_quote: "The Q3 will keep its current routing, but some stops have been removed.",
        treatment_kind: "stop removal",
        expected_treatment_family: "bus_stop_or_boarding",
        description: "Q3 retained its routing while some stops were removed.",
      }, {
        clause_kind: "context",
        source_quote: "View the full list of stops.",
        review_rationale: "Navigation text.",
      }, {
        clause_kind: "context",
        source_quote: "Get more details on Q3 service.",
        review_rationale: "Navigation text.",
      }, {
        clause_kind: "context",
        source_quote: "View the new Q3 timetable.",
        review_rationale: "Navigation text.",
      }],
    }],
  };
  const records = [
    record("project_qbnr", "project", { project_name: "Queens Bus Network Redesign" }),
    record("route_q3", "route", { route_id: "Q3", route_name: "Q3", route_record_scope: "true_route" }),
  ];
  const routeAnchors: RouteAnchorRow[] = [{
    gtfs_route_id: "Q3",
    canonical_route_record_id: "route_q3",
    variant_record_ids: [],
    aliases: ["Q3"],
    disposition: "true_route",
    anchor_reason: "fixture",
  }];
  const sourceDir = join(rootDir, "raw", "sources", QBNR_SERVICE_CHANGES_SOURCE_ID);
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(sourceDir, "blocks.jsonl"), `${JSON.stringify(block)}\n`, "utf8");
  const specPath = join(rootDir, "reviewed-spec.json");
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  const options: QbnrRecoveryDraftOptions = {
    rootDir,
    records,
    blocks: [block],
    routeAnchors,
    currentCorpusFingerprint: fingerprint,
    knownGapIds: new Set([gapId]),
  };
  return { rootDir, block, spec, specPath, options };
}

describe("QBNR recovery proposal draft wrapper", () => {
  it("writes exactly one deterministic proposed artifact into the observation queue", () => {
    const first = fixture();
    const result = draftQbnrRecoveryProposalFromFile(first.specPath, first.options);
    const observationDir = join(first.rootDir, "data", "operational-anchor-review", "proposed", "observations");
    expect(readdirSync(observationDir)).toEqual([`${first.spec.proposal_id}.json`]);
    expect(result.proposal.review_state).toBe("proposed");
    expect(readFileSync(result.output_path, "utf8")).toBe(result.content);

    const second = fixture();
    const replay = draftQbnrRecoveryProposalFromFile(second.specPath, second.options);
    expect(replay.content).toBe(result.content);
  });

  it("refuses stale corpus and block pins without writing a proposal", () => {
    const corpus = fixture();
    corpus.spec.corpus_fingerprint = "b".repeat(64);
    writeFileSync(corpus.specPath, JSON.stringify(corpus.spec), "utf8");
    expect(() => draftQbnrRecoveryProposalFromFile(corpus.specPath, corpus.options)).toThrow("stale corpus_fingerprint");

    const source = fixture();
    source.spec.units[0]!.source_block_sha256s[0] = `sha256:${"0".repeat(64)}`;
    writeFileSync(source.specPath, JSON.stringify(source.spec), "utf8");
    expect(() => draftQbnrRecoveryProposalFromFile(source.specPath, source.options)).toThrow("does not match pinned raw_text_sha256");
  });

  it("requires each projectable target to be the unique pinned true-route anchor for its GTFS id", () => {
    const mismatch = fixture();
    mismatch.options.routeAnchors = [{
      gtfs_route_id: "Q3",
      canonical_route_record_id: "route_q3_other",
      variant_record_ids: ["route_q3"],
      aliases: ["Q3"],
      disposition: "true_route",
      anchor_reason: "fixture",
    }];
    expect(() => draftQbnrRecoveryProposalFromFile(mismatch.specPath, mismatch.options))
      .toThrow("target route_q3 does not match pinned Q3 anchor route_q3_other");

    const ambiguous = fixture();
    ambiguous.options.routeAnchors = [
      ...ambiguous.options.routeAnchors!,
      { ...ambiguous.options.routeAnchors![0]!, canonical_route_record_id: "route_q3_other" },
    ];
    expect(() => draftQbnrRecoveryProposalFromFile(ambiguous.specPath, ambiguous.options))
      .toThrow("must have exactly one row in the pinned route-anchor release; found 2");
  });

  it("never overwrites an existing proposal", () => {
    const existing = fixture();
    const first = draftQbnrRecoveryProposalFromFile(existing.specPath, existing.options);
    const original = readFileSync(first.output_path, "utf8");
    expect(() => draftQbnrRecoveryProposalFromFile(existing.specPath, existing.options)).toThrow("already exists");
    expect(readFileSync(first.output_path, "utf8")).toBe(original);
  });

  it("uses the canonical global identity path for a reviewed new-route unit", () => {
    const created = fixture();
    created.spec.units[0]!.route_resolution = { mode: "create" };
    writeFileSync(created.specPath, JSON.stringify(created.spec), "utf8");
    created.options.records = created.options.records!.filter((candidate) => candidate.record_kind !== "route");
    created.options.routeAnchors = [];
    const result = draftQbnrRecoveryProposalFromFile(created.specPath, created.options);
    expect(result.proposal.observations[0]).toMatchObject({
      observation_kind: "route",
      expected_record_id: "route_q3-qbnr-2025",
    });
  });
});
