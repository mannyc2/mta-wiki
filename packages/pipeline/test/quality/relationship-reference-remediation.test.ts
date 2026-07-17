import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import type { JsonObject } from "@mta-wiki/db/types";
import {
  generatePayloadReferenceRemediationArtifacts,
  PAYLOAD_REFERENCE_ACCEPTED_PROPOSALS_PATH,
  PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_PATH,
  PAYLOAD_REFERENCE_REMEDIATION_LEDGER_PATH,
  PAYLOAD_REFERENCE_REMEDIATION_SUMMARY_PATH,
} from "../../../../scripts/remediate-relationship-payload-references-v1";

describe("relationship payload-reference remediation v1", () => {
  const generated = generatePayloadReferenceRemediationArtifacts();

  it("materializes every accepted proposal as one unique evidence-bound relation", () => {
    expect(generated.entries).toHaveLength(81);
    expect(generated.ledger).toHaveLength(81);
    expect(generated.entries.every((entry) =>
      entry.validation.state === "accepted" &&
      entry.validation.issues.length === 0 &&
      (entry.tool_args.evidence_refs?.length ?? 0) > 0
    )).toBe(true);

    const tuples = generated.ledger.map((row) =>
      [row.relation_kind, row.subject_id, row.object_id].join("\0")
    );
    expect(new Set(tuples).size).toBe(81);
    expect(generated.ledger.some((row) => row.subject_id === row.object_id)).toBe(false);
    expect(generated.ledger.some((row) =>
      row.subject_id.includes("q20-qbnr-2025") || row.object_id.includes("q20-qbnr-2025")
    )).toBe(false);
  });

  it("preserves the exact source literal and immutable decision provenance", () => {
    const entryBySubmission = new Map(generated.entries.map((entry) => [entry.submission_id, entry]));
    for (const row of generated.ledger) {
      expect(row.relationship_reference_decision_ids.length).toBeGreaterThan(0);
      expect(row.evidence_ids.length).toBeGreaterThan(0);
      const entry = entryBySubmission.get(row.submission_id);
      expect(entry?.tool_args.raw_text).toBe(row.source_literal);
      const extra = entry?.tool_args.payload?.extra_fields as JsonObject | undefined;
      expect(extra?.relationship_reference_source_literal).toBe(row.source_literal);
      expect(extra?.relationship_reference_origin_record_id).toBe(row.origin_record_id);
    }
  });

  it("reproduces every checked-in contract, journal, ledger, and summary byte for byte", () => {
    for (const path of [
      PAYLOAD_REFERENCE_ACCEPTED_PROPOSALS_PATH,
      PAYLOAD_REFERENCE_REMEDIATION_JOURNAL_PATH,
      PAYLOAD_REFERENCE_REMEDIATION_LEDGER_PATH,
      PAYLOAD_REFERENCE_REMEDIATION_SUMMARY_PATH,
    ]) {
      const artifact = generated.artifacts.find((candidate) => candidate.path === path);
      expect(artifact).toBeDefined();
      expect(readFileSync(path, "utf8")).toBe(artifact?.content);
    }
  });
});
