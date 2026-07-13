import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  readSemanticCorrections,
  withSemanticCorrections,
  type SemanticCorrectionEntry,
} from "@mta-wiki/pipeline/records/semantic-corrections";

type SweepDecision = {
  record_id: string;
  source_id: string;
  evidence_id: string;
  evidence_sha256: string;
  supporting_evidence_id?: string;
  supporting_evidence_sha256?: string;
  corrected_treatment_family: "safety" | "capital_or_infrastructure";
};

type SweepReceipt = {
  receipt_id: string;
  preserved_bus_boarding_records: string[];
  decisions: SweepDecision[];
  ontology_decision: {
    family_counts: Record<string, number>;
  };
};

type SourceBlock = {
  block_id: string;
  raw_text_sha256: string;
  normalized_text_sha256: string;
};

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as T;
}

function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(join(repoRoot, relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function correctionFor(
  corrections: readonly SemanticCorrectionEntry[],
  recordId: string,
  receiptPath: string,
): SemanticCorrectionEntry {
  const correction = corrections.find((candidate) =>
    candidate.record_id === recordId && candidate.source_decision === receiptPath);
  if (!correction) throw new Error(`missing platform-family correction for ${recordId}`);
  return correction;
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

describe("reviewed non-bus platform treatment-family corrections", () => {
  const sweepReceiptPath = "data/quality/acquisition/receipts/non-bus-platform-treatment-family-sweep-2024-2026.json";
  const minimumReceiptPath = "data/quality/acquisition/receipts/platform-safety-barrier-family-2024.json";
  const treatments = readJsonl<MtaCanonicalRecord>("data/canonical/treatment_components.jsonl");
  const treatmentsById = new Map(treatments.map((record) => [record.record_id, record]));
  const corrections = readSemanticCorrections();
  const receipt = readJson<SweepReceipt>(sweepReceiptPath);

  it("preserves every explicitly reviewed bus-boarding platform record", () => {
    expect(receipt.preserved_bus_boarding_records).toHaveLength(6);
    for (const recordId of receipt.preserved_bus_boarding_records) {
      const record = treatmentsById.get(recordId);
      expect(record?.payload.treatment_family).toBe("bus_stop_or_boarding");
      expect(String(record?.payload.treatment_kind)).toMatch(/boarding/u);
    }
  });

  it("applies only the reviewed family patch to all fifteen non-bus records", () => {
    expect(receipt.receipt_id).toBe("non-bus-platform-treatment-family-sweep-2024-2026");
    expect(receipt.decisions).toHaveLength(15);
    expect(receipt.ontology_decision.family_counts).toEqual({ safety: 12, capital_or_infrastructure: 3 });

    for (const decision of receipt.decisions) {
      const record = treatmentsById.get(decision.record_id);
      if (!record) throw new Error(`missing canonical treatment ${decision.record_id}`);
      expect(record.source_ids ?? [record.source_id]).toContain(decision.source_id);
      expect(record.payload.treatment_family).toBe(decision.corrected_treatment_family);
      expect(record.evidence_refs.map((ref) => ref.evidence_id)).toContain(decision.evidence_id);

      const correction = correctionFor(corrections, decision.record_id, sweepReceiptPath);
      expect(correction.op).toBe("patch_payload");
      expect(correction.guards.payload).toEqual({
        treatment_kind: record.payload.treatment_kind,
        description: record.payload.description,
        treatment_family: "bus_stop_or_boarding",
      });
      expect(correction.patch).toEqual({ set: { treatment_family: decision.corrected_treatment_family } });
      expect(correction.cascade).toEqual([]);

      const reconstructed = structuredClone(record);
      reconstructed.payload.treatment_family = "bus_stop_or_boarding";
      const applied = withSemanticCorrections([reconstructed], [correction]);
      expect(applied.issues).toEqual([]);
      expect(applied.summary).toMatchObject({ total: 1, applied: 1, skipped: 0 });
      expect(applied.records[0]?.payload).toEqual(record.payload);

      expectEvidenceHash(decision.evidence_id, decision.evidence_sha256);
      if (decision.supporting_evidence_id && decision.supporting_evidence_sha256) {
        expectEvidenceHash(decision.supporting_evidence_id, decision.supporting_evidence_sha256);
      }
    }
  });

  it("keeps the queue-triggering subway pilot corrected and outside the priority queue", () => {
    const target = treatmentsById.get("treatment_platform-safety-barriers");
    expect(target?.payload.treatment_family).toBe("safety");
    const correction = correctionFor(corrections, target!.record_id, minimumReceiptPath);
    expect(correction.patch).toEqual({ set: { treatment_family: "safety" } });

    const priorityQueue = readFileSync(
      join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl"),
      "utf8",
    );
    expect(priorityQueue).not.toContain("operational-coverage:a892335d5f62bb15794e715b");
    expect(priorityQueue).not.toContain("operational-coverage:7e4a64cefa844d47feffaadb");
  });
});
