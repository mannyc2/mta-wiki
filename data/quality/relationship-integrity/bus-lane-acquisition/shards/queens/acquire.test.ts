import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const DIR = import.meta.dir;
const EXPECTED_SET = "candidate-set-v2:24080902f508b55a0033df32";
const EXPECTED_SHA = "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba";
const SHA_RE = /^[0-9a-f]{64}$/;
const ALLOWED_HOSTS = new Set([
  "www.nyc.gov",
  "data.cityofnewyork.us",
  "www.mta.info",
  "bustime-classic.mta.info",
]);

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, name), "utf8")) as T;
}

function readJsonl<T>(name: string): T[] {
  return readFileSync(join(DIR, name), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as T);
}

function sha256(name: string): string {
  return createHash("sha256").update(readFileSync(join(DIR, name))).digest("hex");
}

describe("Queens registry-only bus-lane acquisition", () => {
  test("reconciles exactly to the pinned 113-row Queens partition", () => {
    const proof = readJson<Record<string, unknown>>("partition-proof.json");
    const partition = readJsonl<Record<string, string>>("partition.jsonl");
    expect(proof.candidate_set_id).toBe(EXPECTED_SET);
    expect(proof.candidate_set_sha256).toBe(EXPECTED_SHA);
    expect(proof.exact_backlog_count).toBe(321);
    expect(proof.queens_count).toBe(113);
    expect(proof.q_route_count).toBe(83);
    expect(proof.qm_route_count).toBe(30);
    expect(partition).toHaveLength(113);
    expect(new Set(partition.map((row) => row.candidate_id)).size).toBe(113);
    expect(new Set(partition.map((row) => row.route_id)).size).toBe(113);
    expect(partition.filter((row) => /^Q\d/.test(row.route_id))).toHaveLength(83);
    expect(partition.filter((row) => /^QM\d/.test(row.route_id))).toHaveLength(30);
    expect(partition.every((row) => row.corridor.length > 0 && SHA_RE.test(row.ledger_row_sha256))).toBe(true);
  });

  test("records four genuine official-source checks and hashes acquired bytes", () => {
    const checks = readJson<{
      sources: Array<{ retrieval_status: string; retrieved_on: string; content_sha256: string | null; byte_length: number | null; url: string }>;
      route_pages: Array<{ candidate_id: string; retrieval_status: string; retrieved_on: string; content_sha256: string | null; url: string }>;
    }>("acquired-source-checks.json");
    const receipts = readJsonl<{
      candidate: { candidate_id: string; candidate_set_sha256: string };
      acquisition_attempts: Array<{ category: string; query_status: string; urls_checked: string[]; retrievals: Array<{ status: string; retrieved_on: string; sha256: string | null }> }>;
      source_findings: { acquired_for_candidate: boolean; official_lane_matching_record_count: number };
    }>("receipts.jsonl");
    expect(checks.route_pages).toHaveLength(113);
    expect(checks.sources.every((source) => source.retrieval_status === "acquired" && source.retrieved_on === "2026-07-15" && SHA_RE.test(source.content_sha256 ?? "") && (source.byte_length ?? 0) > 0)).toBe(true);
    expect(checks.route_pages.every((source) => source.retrieval_status === "acquired" && source.retrieved_on === "2026-07-15" && SHA_RE.test(source.content_sha256 ?? ""))).toBe(true);
    for (const receipt of receipts) {
      expect(receipt.candidate.candidate_set_sha256).toBe(EXPECTED_SHA);
      expect(receipt.acquisition_attempts.map((attempt) => attempt.category)).toEqual([
        "official_nyc_dot_lane_project",
        "official_mta_route_project",
        "official_public_board_committee",
        "other_repository_approved_primary",
      ]);
      expect(receipt.acquisition_attempts.every((attempt) => attempt.query_status.includes("2026-07-15"))).toBe(true);
      expect(receipt.acquisition_attempts.every((attempt) => attempt.urls_checked.length > 0)).toBe(true);
      expect(receipt.acquisition_attempts.flatMap((attempt) => attempt.urls_checked).every((url) => ALLOWED_HOSTS.has(new URL(url).hostname))).toBe(true);
      expect(receipt.acquisition_attempts.flatMap((attempt) => attempt.retrievals).every((retrieval) => retrieval.retrieved_on === "2026-07-15")).toBe(true);
      expect(receipt.acquisition_attempts.every((attempt) => attempt.retrievals.some((retrieval) => retrieval.status === "acquired" && SHA_RE.test(retrieval.sha256 ?? "")))).toBe(true);
      expect(receipt.source_findings.acquired_for_candidate).toBe(true);
      expect(receipt.source_findings.official_lane_matching_record_count).toBeGreaterThan(0);
    }
  });

  test("never promotes proximity and reconciles receipt outcomes exactly", () => {
    const receipts = readJsonl<{
      receipt_id: string;
      claim_results: {
        exact_route_treatment_binding_proved: boolean;
        exact_route_binding_evidence: Array<{ source_sha256: string | null }>;
        exact_segment_binding_proved: boolean;
        date_and_phase_proved: boolean;
        explicit_phase_identity_proved: boolean;
        operational_occurrence_identity_proved: boolean;
      };
      canonical_actions: {
        canonical_links_added: string[];
        canonical_records_added: string[];
        canonical_records_updated: string[];
        staged_source_ids: string[];
        journal_path: string | null;
        operational_occurrence_added_or_updated: boolean;
      };
      outcome: { registry_projection_excluded: boolean; study_projection_eligible: boolean; still_unresolved: boolean; exclusive_primary_disposition: string };
    }>("receipts.jsonl");
    const exclusions = readJsonl<{ candidate_id: string; study_projection_eligible: boolean }>("registry-projection-exclusions.jsonl");
    const summary = readJson<Record<string, number | string>>("summary.json");
    expect(receipts).toHaveLength(113);
    expect(exclusions).toHaveLength(113);
    expect(new Set(receipts.map((receipt) => receipt.receipt_id)).size).toBe(113);
    expect(receipts.filter((receipt) => receipt.claim_results.exact_route_treatment_binding_proved)).toHaveLength(5);
    expect(receipts.filter((receipt) => receipt.claim_results.exact_segment_binding_proved)).toHaveLength(0);
    expect(receipts.every((receipt) => !receipt.claim_results.date_and_phase_proved && !receipt.claim_results.explicit_phase_identity_proved)).toBe(true);
    expect(receipts.every((receipt) => !receipt.claim_results.operational_occurrence_identity_proved)).toBe(true);
    const remediated = receipts.filter((receipt) => receipt.canonical_actions.canonical_links_added.length > 0);
    expect(remediated).toHaveLength(5);
    expect(remediated.map((receipt) => receipt.candidate.candidate_id).sort()).toEqual([
      "study-event-v2:2903c93577f1e07b34fa218c",
      "study-event-v2:8483f8b099d292e9d6883859",
      "study-event-v2:a1e55641545033df387b70b1",
      "study-event-v2:d1cc616281e5031091c4b8e9",
      "study-event-v2:df8bb7f9438c48166f1ff8b9",
    ]);
    expect(new Set(remediated.flatMap((receipt) => receipt.canonical_actions.canonical_links_added)).size).toBe(21);
    expect(remediated.every((receipt) => receipt.canonical_actions.journal_path?.endsWith("_queens-acquisition-linkage-remediation.jsonl"))).toBe(true);
    expect(receipts.filter((receipt) => receipt.canonical_actions.canonical_links_added.length === 0)).toHaveLength(108);
    expect(receipts.every((receipt) => !receipt.canonical_actions.operational_occurrence_added_or_updated)).toBe(true);
    expect(receipts.every((receipt) => receipt.outcome.registry_projection_excluded && !receipt.outcome.study_projection_eligible && receipt.outcome.still_unresolved)).toBe(true);
    expect(receipts.filter((receipt) => receipt.claim_results.exact_route_treatment_binding_proved).every((receipt) => receipt.claim_results.exact_route_binding_evidence.length > 0 && receipt.claim_results.exact_route_binding_evidence.every((evidence) => SHA_RE.test(evidence.source_sha256 ?? "")))).toBe(true);
    expect(exclusions.every((row) => !row.study_projection_eligible)).toBe(true);
    expect(summary.researched_count).toBe(113);
    expect(summary.source_acquired_count).toBe(113);
    expect(summary.exact_route_binding_proved_count).toBe(5);
    expect(summary.segment_binding_proved_count).toBe(0);
    expect(summary.date_and_phase_proved_count).toBe(0);
    expect(summary.operational_occurrence_added_or_updated_count).toBe(0);
    expect(summary.canonical_linkage_remediated_count).toBe(5);
    expect(summary.canonical_links_added_count).toBe(21);
    expect(summary.explicitly_excluded_count).toBe(113);
    expect(summary.still_unresolved_count).toBe(113);
    expect(summary.study_projection_eligible_count).toBe(0);
  });

  test("manifest hashes every generated artifact", () => {
    const manifest = readJson<{ candidate_set_sha256: string; artifacts: Array<{ path: string; sha256: string; bytes: number }> }>("manifest.json");
    expect(manifest.candidate_set_sha256).toBe(EXPECTED_SHA);
    expect(manifest.artifacts).toHaveLength(8);
    for (const artifact of manifest.artifacts) {
      expect(artifact.sha256).toBe(sha256(artifact.path));
      expect(artifact.bytes).toBe(readFileSync(join(DIR, artifact.path)).byteLength);
    }
  });
});
