import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  readSemanticCorrections,
  withSemanticCorrections,
  type SemanticCorrectionEntry,
} from "@mta-wiki/pipeline/records/semantic-corrections";

type LifecycleDecision = {
  record_id: string;
  source_id: string;
  evidence_id: string;
  evidence_sha256: string;
  supporting_evidence_id?: string;
  supporting_evidence_sha256?: string;
  prior_lifecycle_phase: string;
  corrected_lifecycle_phase: string;
  expected_queue_status: "open" | "terminal";
  corroborating_relation_id?: string;
  corroborating_relation_status?: string;
};

type DateCompanion = {
  raw_text: string;
  precision: string;
  confidence: string;
};

type ReviewReceipt = {
  receipt_id: string;
  scope: {
    reviewed_event_count: number;
    corrected_lifecycle_count: number;
    corrected_raw_source_literal_count: number;
    verified_normalized_scalar_count: number;
  };
  lifecycle_decisions: LifecycleDecision[];
  newburgh_date_validation: {
    record_id: string;
    verdict: string;
    canonical_date: string;
    canonical_date_precision: string;
    prior_date_text: string;
    corrected_date_text: string;
    corrected_date_text_normalized: DateCompanion;
    local_source_date_evidence_id: string;
    local_source_date_evidence_sha256: string;
    local_event_evidence_id: string;
    local_event_evidence_sha256: string;
    staged_official_primary_source: {
      publisher: string;
      source_id: string;
      url: string;
      title: string;
      confirmed_onset: string;
      evidence_id: string;
      evidence_sha256: string;
      capture: {
        retrieved_at: string;
        source_html_sha256: string;
        source_html_bytes: number;
        text_sha256: string;
        blocks_sha256: string;
      };
    };
    supporting_government_source: {
      url: string;
      confirmed_onset: string;
      weekday_literal: string;
    };
  };
  expected_effect: {
    canonical_event_delta: number;
    canonical_relation_delta: number;
    operational_occurrence_delta: number;
    priority_gap_delta: number;
    priority_open_delta: number;
    priority_terminal_delta: number;
  };
};

type SourceBlock = {
  block_id: string;
  raw_text_sha256: string;
  normalized_text_sha256: string;
};

type SourceMetadata = {
  sourceId: string;
  sourceUrl: string;
  retrievedAt: string;
  stagedAt: string;
};

type QueueRow = {
  event_record_id: string;
  status: string;
  verdict: string;
  resolved_occurrence_ids: string[];
};

const receiptPath = "data/quality/acquisition/receipts/prospective-lifecycle-and-newburgh-date-review-2023-2026.json";

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as T;
}

function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(join(repoRoot, relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function expectEvidenceHash(evidenceId: string, expectedHash: string): void {
  const [sourceId, blockId] = evidenceId.split("#");
  if (!sourceId || !blockId) throw new Error(`invalid evidence id ${evidenceId}`);
  const block = readJsonl<SourceBlock>(`raw/sources/${sourceId}/blocks.jsonl`)
    .find((candidate) => candidate.block_id === blockId);
  if (!block) throw new Error(`missing source block ${evidenceId}`);
  expect(block.raw_text_sha256).toBe(expectedHash);
  expect(block.normalized_text_sha256).toBe(expectedHash);
}

function sha256(relativePath: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(join(repoRoot, relativePath))).digest("hex")}`;
}

function correctionFor(corrections: readonly SemanticCorrectionEntry[], recordId: string): SemanticCorrectionEntry {
  const correction = corrections.find((candidate) =>
    candidate.record_id === recordId && candidate.source_decision === receiptPath);
  if (!correction) throw new Error(`missing lifecycle correction for ${recordId}`);
  return correction;
}

describe("reviewed prospective lifecycle corrections", () => {
  const receipt = readJson<ReviewReceipt>(receiptPath);
  const events = readJsonl<MtaCanonicalRecord>("data/canonical/events.jsonl");
  const eventsById = new Map(events.map((record) => [record.record_id, record]));
  const relationsById = new Map(
    readJsonl<MtaCanonicalRecord>("data/canonical/relations.jsonl").map((record) => [record.record_id, record]),
  );
  const corrections = readSemanticCorrections();

  it("patches exactly seven evidence-proven source-time lifecycle overclaims", () => {
    expect(receipt.receipt_id).toBe("prospective-lifecycle-and-newburgh-date-review-2023-2026");
    expect(receipt.scope).toMatchObject({
      reviewed_event_count: 7,
      corrected_lifecycle_count: 7,
      corrected_raw_source_literal_count: 1,
      verified_normalized_scalar_count: 1,
    });
    expect(receipt.lifecycle_decisions).toHaveLength(7);
    expect(new Set(receipt.lifecycle_decisions.map((decision) => decision.record_id)).size).toBe(7);
    expect(receipt.expected_effect).toEqual({
      canonical_event_delta: 7,
      canonical_relation_delta: 0,
      operational_occurrence_delta: 0,
      priority_gap_delta: 0,
      priority_open_delta: 0,
      priority_terminal_delta: 0,
    });

    const receiptCorrections = corrections.filter((correction) => correction.source_decision === receiptPath);
    expect(receiptCorrections).toHaveLength(7);
    expect(new Set(receiptCorrections.map((correction) => correction.record_id))).toEqual(
      new Set(receipt.lifecycle_decisions.map((decision) => decision.record_id)),
    );

    for (const decision of receipt.lifecycle_decisions) {
      const record = eventsById.get(decision.record_id);
      if (!record) throw new Error(`missing canonical event ${decision.record_id}`);
      expect(record.source_ids ?? [record.source_id]).toContain(decision.source_id);
      expect(record.payload.lifecycle_phase).toBe(decision.corrected_lifecycle_phase);
      expect(record.evidence_refs.map((ref) => ref.evidence_id)).toContain(decision.evidence_id);

      const correction = correctionFor(corrections, decision.record_id);
      expect(correction.op).toBe("patch_payload");
      expect((correction.patch.set as JsonObject).lifecycle_phase).toBe(decision.corrected_lifecycle_phase);
      expect(correction.guards.payload?.lifecycle_phase).toBe(decision.prior_lifecycle_phase);
      expect(correction.cascade).toEqual([]);

      const reconstructed = structuredClone(record);
      reconstructed.payload.lifecycle_phase = decision.prior_lifecycle_phase;
      if (decision.record_id === receipt.newburgh_date_validation.record_id) {
        reconstructed.payload.date_text = receipt.newburgh_date_validation.prior_date_text;
        reconstructed.payload.date_text_normalized = {
          raw_text: receipt.newburgh_date_validation.prior_date_text,
          normalized_date: receipt.newburgh_date_validation.canonical_date,
          precision: "day",
          confidence: "parsed_text",
        };
      }
      const applied = withSemanticCorrections([reconstructed], [correction]);
      expect(applied.issues).toEqual([]);
      expect(applied.summary).toMatchObject({ total: 1, applied: 1, skipped: 0 });
      expect(applied.records[0]?.payload).toEqual(record.payload);

      expectEvidenceHash(decision.evidence_id, decision.evidence_sha256);
      if (decision.supporting_evidence_id && decision.supporting_evidence_sha256) {
        expectEvidenceHash(decision.supporting_evidence_id, decision.supporting_evidence_sha256);
      }
      if (decision.corroborating_relation_id && decision.corroborating_relation_status) {
        const relation = relationsById.get(decision.corroborating_relation_id);
        expect(relation?.payload.object_id).toBe(decision.record_id);
        expect(relation?.payload.assertion_status).toBe(decision.corroborating_relation_status);
      }
    }
  });

  it("restores the Newburgh raw literal while retaining the independently verified scalar date", () => {
    const review = receipt.newburgh_date_validation;
    expect(review.verdict).toBe("verified_scalar_date_and_corrected_raw_literal");
    expect(review.canonical_date).toBe("2026-01-02");
    expect(review.canonical_date_precision).toBe("day");
    expect(review.corrected_date_text).toBe("Tuesday, January 2");

    const record = eventsById.get(review.record_id);
    expect(record?.payload.date_text).toBe(review.corrected_date_text);
    expect(record?.payload.date_text_normalized).toEqual(review.corrected_date_text_normalized);
    expect(record?.payload.date_normalized).toBe(review.canonical_date);
    expect(record?.payload.date_precision).toBe(review.canonical_date_precision);
    expect(record?.payload.lifecycle_phase).toBe("planned");
    expectEvidenceHash(review.local_source_date_evidence_id, review.local_source_date_evidence_sha256);
    expectEvidenceHash(review.local_event_evidence_id, review.local_event_evidence_sha256);

    const primary = review.staged_official_primary_source;
    expect(primary.publisher).toBe("Metropolitan Transportation Authority");
    expect(primary.confirmed_onset).toBe(review.canonical_date);
    expect(primary.title).toContain("January 2026");
    expect(primary.url).toMatch(/^https:\/\/www\.mta\.info\//u);
    expectEvidenceHash(primary.evidence_id, primary.evidence_sha256);
    const sourceRoot = `raw/sources/${primary.source_id}`;
    const sourceMetadata = readJson<SourceMetadata>(`${sourceRoot}/metadata.json`);
    expect(sourceMetadata.sourceId).toBe(primary.source_id);
    expect(sourceMetadata.sourceUrl).toBe(primary.url);
    expect(sourceMetadata.retrievedAt).toBe(primary.capture.retrieved_at);
    expect(Date.parse(sourceMetadata.retrievedAt)).toBeLessThanOrEqual(Date.parse(sourceMetadata.stagedAt));
    expect(sha256(`${sourceRoot}/source.html`)).toBe(primary.capture.source_html_sha256);
    expect(readFileSync(join(repoRoot, `${sourceRoot}/source.html`)).byteLength).toBe(primary.capture.source_html_bytes);
    expect(sha256(`${sourceRoot}/text.txt`)).toBe(primary.capture.text_sha256);
    expect(sha256(`${sourceRoot}/blocks.jsonl`)).toBe(primary.capture.blocks_sha256);

    expect(review.supporting_government_source.confirmed_onset).toBe(review.canonical_date);
    expect(review.supporting_government_source.weekday_literal).toBe("Friday");
    expect(review.supporting_government_source.url).toMatch(/^https:\/\/www\.governor\.ny\.gov\//u);
  });

  it("keeps reviewed records occurrence-free and preserves the receipt-pinned queue disposition", () => {
    const rows = readJsonl<QueueRow>("data/quality/operational-coverage/priority-queue.jsonl");
    for (const decision of receipt.lifecycle_decisions) {
      const eventRows = rows.filter((row) => row.event_record_id === decision.record_id);
      expect(eventRows.length).toBeGreaterThan(0);
      expect(eventRows.every((row) => row.status === decision.expected_queue_status)).toBe(true);
      expect(eventRows.every((row) => row.resolved_occurrence_ids.length === 0)).toBe(true);
      if (decision.expected_queue_status === "terminal") {
        expect(eventRows.every((row) => row.verdict === "not_applicable")).toBe(true);
      } else {
        expect(eventRows.every((row) => row.verdict === "unreviewed")).toBe(true);
      }
    }
  });
});
