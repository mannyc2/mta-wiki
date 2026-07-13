import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";

type SourceBlock = {
  block_id: string;
  raw_text: string;
  raw_text_sha256: string;
};

type SemanticCorrection = {
  correction_id: string;
  op: string;
  record_id: string;
  patch: {
    survivor_record_id?: string;
    set?: Record<string, unknown>;
  };
  source_decision: string;
};

type CoverageRow = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  status?: string;
  verdict: string;
  decision_ids: string[];
  search_receipt_ids: string[];
  required_search_source_ids: string[];
  gtfs_route_ids: string[];
  route_record_ids: string[];
  treatment_record_ids: string[];
  treatment_families: string[];
};

type CoverageManifest = {
  corpus_fingerprint: string;
};

type SearchReceipt = {
  receipt_id: string;
  gap_id: string;
  corpus_fingerprint: string;
  rationale: string;
  source_searches: Array<{
    source_id: string;
    queries: string[];
    matching_block_ids: string[];
  }>;
  registry_search: {
    matched_source_ids: string[];
  };
};

type CoverageDecision = {
  decision_id: string;
  gap_id: string;
  prior_verdict: string;
  verdict: string;
  evidence_refs: unknown[];
  search_receipt_ids: string[];
};

type AcquisitionReceipt = {
  status: string;
  scope: {
    event_record_id: string;
    route_record_id: string;
    treatment_record_id: string;
    superseded_treatment_record_id: string;
  };
  identity_adjudication: {
    survivor_record_id: string;
    superseded_record_id: string;
  };
  temporal_adjudication: {
    canonical_date_normalized: string;
    canonical_date_precision: string;
    lifecycle_phase: string;
    exact_operational_onset: null;
    rejected_inference: string;
  };
  corpus_search: {
    exact_lane_onset_found: boolean;
    nonqualifying_web_discovery_staged: boolean;
  };
};

type AnchorReviewDecision = {
  event_record_id: string;
};

const eventId = "event_dekalb-lafayette-summer2024-temp-lanes";
const projectId = "project_dekalb-lafayette-bus-safety-improvements";
const routeId = "route_b38";
const treatmentId = "treatment_temp-bus-lanes-summer2024";
const duplicateTreatmentIds = [
  "treatment_summer2024-temp-bus-lanes",
  "treatment_temp-bus-lanes-summer2024-delivered-scope",
] as const;
const sourceId = "dekalb_lafayette_cb2_dec2024";
const evidenceId = `${sourceId}#p026_c0002`;
const evidenceSha256 = "sha256:c054459a74d1d0e28e1399d6a1e160f99ce9d454d90ce0c157b9d7a3cc2e8f19";
const dateGapId = "operational-coverage:c6cc3949e83530c9121f0b38";
const decisionId = "dekalb-lafayette-summer-2024-temp-lanes-exact-onset-absent";
const searchReceiptId = "dekalb-lafayette-summer-2024-temp-lanes-exact-onset-search";
const acquisitionReceiptPath = "data/quality/acquisition/receipts/dekalb-lafayette-summer-2024-temporary-bus-lanes.json";

const sourceArtifactPins = {
  dekalb_lafayette_cb2_dec2024: {
    "metadata.json": "17cf5a663bd0aca3543e087e1ffe9c68798dd15bf414d4605da06ed373966ac8",
    "source.pdf": "412db03c4b2a3391e9486ac2a092a82e52bf81854eb631369b1b618a37225540",
    "blocks.jsonl": "51c9f53b970baab069da9ab3835ec3b44334bdb31d45d06ac465f0c1e93463c3",
  },
  dekalb_lafayette_cb3_dec2024: {
    "metadata.json": "2d21a2e9ffe66e195a25cfd1fa3f1241cf37147aef9eab10614d83ceb43848ac",
    "source.pdf": "a1219ffffbef3f5a1aaa6107413e462cdac07bd5063b689671eb15458d8be73f",
    "blocks.jsonl": "c5be391a9ef7b79abfcea79e38939534b072a485fab88e4ab80430d7145b9284",
  },
} as const;

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as T;
}

function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(join(repoRoot, relativePath), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function sha256Hex(relativePath: string): string {
  return createHash("sha256").update(readFileSync(join(repoRoot, relativePath))).digest("hex");
}

function byRecordId(records: readonly MtaCanonicalRecord[], recordId: string): MtaCanonicalRecord {
  const record = records.find((candidate) => candidate.record_id === recordId);
  if (!record) throw new Error(`missing canonical record ${recordId}`);
  return record;
}

describe("DeKalb/Lafayette Summer 2024 temporary bus lanes", () => {
  const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
  const routes = readJsonl<MtaCanonicalRecord>("data/canonical/routes.jsonl");
  const treatments = readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl");
  const relations = readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl");
  const corrections = readJsonl<SemanticCorrection>("data/semantic-corrections/corrections.jsonl");
  const acquisitionReceipt = readJson<AcquisitionReceipt>(acquisitionReceiptPath);

  it("pins both official decks and preserves the source-stated season", () => {
    for (const [pinnedSourceId, artifacts] of Object.entries(sourceArtifactPins)) {
      for (const [filename, expected] of Object.entries(artifacts)) {
        expect(sha256Hex(`raw/sources/${pinnedSourceId}/${filename}`)).toBe(expected);
      }
      const block = readJsonl<SourceBlock>(`raw/sources/${pinnedSourceId}/blocks.jsonl`)
        .find((candidate) => candidate.block_id === "p026_c0002");
      expect(block?.raw_text).toContain("Temporary bus lanes installed during the Summer 2024 G Train shutdown");
      expect(block?.raw_text).toContain("B38 service");
    }

    const event = byRecordId(events, eventId);
    expect(event.payload).toMatchObject({
      event_family: "implementation",
      lifecycle_phase: "installed",
      date_text: "Summer 2024",
      date_normalized: "2024-summer",
      date_precision: "season",
    });
    expect(event.evidence_refs.map((ref) => ref.evidence_id)).toEqual([evidenceId]);
    expect(JSON.stringify(event.payload)).not.toContain("2024-08-12");
    expect(acquisitionReceipt.temporal_adjudication).toMatchObject({
      canonical_date_normalized: "2024-summer",
      canonical_date_precision: "season",
      lifecycle_phase: "installed",
      exact_operational_onset: null,
    });
    expect(acquisitionReceipt.temporal_adjudication.rejected_inference).toContain("August 12");
  });

  it("keeps one temporary-lane identity and direct delivered B38/treatment timelines", () => {
    expect(byRecordId(routes, routeId).payload.route_id).toBe("B38");
    expect(byRecordId(treatments, treatmentId).payload.treatment_family).toBe("bus_lane");
    for (const duplicateId of duplicateTreatmentIds) {
      expect(treatments.some((record) => record.record_id === duplicateId)).toBe(false);
    }
    expect(acquisitionReceipt.identity_adjudication).toMatchObject({
      survivor_record_id: treatmentId,
      superseded_record_id: duplicateTreatmentIds[0],
    });

    const expectedSubjects = new Map([
      ["relation_b38-has-summer2024-temp-lane-event", routeId],
      ["relation_project-has-timeline-summer2024", projectId],
      ["relation_temp-bus-lanes-has-summer2024-event", treatmentId],
    ]);
    for (const [relationId, subjectId] of expectedSubjects) {
      const relation = byRecordId(relations, relationId);
      expect(relation.payload).toMatchObject({
        relation_kind: "has_timeline_event",
        subject_id: subjectId,
        object_id: eventId,
        assertion_status: "delivered",
        as_of_date: "2024-12-19",
      });
      expect(relation.evidence_refs).toHaveLength(1);
      expect(relation.evidence_refs[0]).toMatchObject({
        source_id: sourceId,
        evidence_id: evidenceId,
        block_id: "p026_c0002",
        text_sha256: evidenceSha256,
      });
    }
    expect(byRecordId(relations, "relation_temp-bus-lanes-has-summer2024-event").payload.subject_local_observation_id)
      .toBe("treatment_temp_bus_lanes_summer2024");

    for (const [correctionId, duplicateId] of [
      ["core-coverage-dekalb-lafayette-cb3-temp-lane-duplicate-20260713", duplicateTreatmentIds[0]],
      ["core-coverage-dekalb-lafayette-delivered-scope-treatment-duplicate-20260713", duplicateTreatmentIds[1]],
    ] as const) {
      expect(corrections.find((correction) => correction.correction_id === correctionId)).toMatchObject({
        op: "supersede_record",
        record_id: duplicateId,
        patch: { survivor_record_id: treatmentId },
        source_decision: acquisitionReceiptPath,
      });
    }
    expect(corrections.find((correction) =>
      correction.correction_id === "core-coverage-dekalb-lafayette-summer2024-delivered-timeline-20260713"))
      .toMatchObject({
        op: "patch_payload",
        record_id: "relation_project-has-timeline-summer2024",
        patch: { set: { assertion_status: "delivered" } },
        source_decision: acquisitionReceiptPath,
      });
    expect(corrections.find((correction) =>
      correction.correction_id === "core-coverage-dekalb-lafayette-temp-lane-timeline-local-identity-20260713"))
      .toMatchObject({
        op: "patch_payload",
        record_id: "relation_temp-bus-lanes-has-summer2024-event",
        patch: { set: { subject_local_observation_id: "treatment_temp_bus_lanes_summer2024" } },
        source_decision: acquisitionReceiptPath,
      });
  });

  it("leaves only a terminal exact-date gap with a corpus-bound absence receipt", () => {
    const ledgerRows = readJsonl<CoverageRow>("data/quality/operational-coverage/recoverability-ledger.jsonl")
      .filter((row) => row.event_record_id === eventId);
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toMatchObject({
      gap_id: dateGapId,
      dimension: "date_precision",
      verdict: "absent_in_source",
      decision_ids: [decisionId],
      search_receipt_ids: [searchReceiptId],
      gtfs_route_ids: ["B38"],
      route_record_ids: [routeId],
      treatment_record_ids: [treatmentId],
      treatment_families: ["bus_lane"],
    });
    const queueRow = readJsonl<CoverageRow>("data/quality/operational-coverage/priority-queue.jsonl")
      .find((row) => row.gap_id === dateGapId);
    expect(queueRow?.status).toBe("terminal");

    const decision = readJson<CoverageDecision>(
      `data/operational-anchor-review/ledger-decisions/decisions/${decisionId}.json`,
    );
    expect(decision).toEqual({
      schema_version: 1,
      decision_id: decisionId,
      gap_id: dateGapId,
      prior_verdict: "unreviewed",
      verdict: "absent_in_source",
      reviewer: "codex-corpus-completion-2026-07-13",
      decided_at: "2026-07-13T14:25:00.000Z",
      rationale: expect.any(String),
      proposal_ids: [],
      evidence_refs: [],
      search_receipt_ids: [searchReceiptId],
    });
    const searchReceipt = readJson<SearchReceipt>(
      `data/operational-anchor-review/ledger-decisions/search-receipts/${searchReceiptId}.json`,
    );
    const manifest = readJson<CoverageManifest>("data/quality/operational-coverage/manifest.json");
    expect(searchReceipt).toMatchObject({
      receipt_id: searchReceiptId,
      gap_id: dateGapId,
      corpus_fingerprint: manifest.corpus_fingerprint,
    });
    expect(searchReceipt.source_searches.map((search) => search.source_id))
      .toEqual(ledgerRows[0]!.required_search_source_ids);
    expect(searchReceipt.source_searches.every((search) =>
      search.queries.length > 0 && search.matching_block_ids.length === 0)).toBe(true);
    expect(searchReceipt.registry_search.matched_source_ids).toEqual([
      "dekalb_lafayette_cb2_dec2024",
      "dekalb_lafayette_cb3_dec2024",
    ]);
    expect(searchReceipt.rationale).toContain("August 12 was not inferred");
    expect(acquisitionReceipt.corpus_search).toEqual(expect.objectContaining({
      exact_lane_onset_found: false,
      nonqualifying_web_discovery_staged: false,
    }));
  });

  it("does not approve a season-precision anchor or occurrence", () => {
    const anchorDecisionDir = join(repoRoot, "data", "operational-anchor-review", "accepted", "decisions");
    const anchorDecisions = readdirSync(anchorDecisionDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJson<AnchorReviewDecision>(`data/operational-anchor-review/accepted/decisions/${name}`));
    expect(anchorDecisions.some((decision) => decision.event_record_id === eventId)).toBe(false);

    const occurrences = readJsonl<Record<string, unknown>>(
      "data/contract-fixtures/operational-occurrences-v1/operational_occurrences.jsonl",
    );
    expect(occurrences.some((occurrence) =>
      JSON.stringify(occurrence).includes(eventId))).toBe(false);
  });
});
