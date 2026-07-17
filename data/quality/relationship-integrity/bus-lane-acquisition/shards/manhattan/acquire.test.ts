import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const DIR = import.meta.dir;
const SET_ID = "candidate-set-v2:24080902f508b55a0033df32";
const SET_SHA = "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba";
const SHA_RE = /^[0-9a-f]{64}$/;
const HOSTS = new Set(["www.nyc.gov", "data.cityofnewyork.us", "www.mta.info", "bustime-classic.mta.info"]);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
function sortJson(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortJson(child)]));
  return value;
}
const stable = (value: unknown): string => JSON.stringify(sortJson(value as Json));
const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
function json<T>(name: string): T { return JSON.parse(readFileSync(join(DIR, name), "utf8")) as T; }
function jsonl<T>(name: string): T[] { return readFileSync(join(DIR, name), "utf8").trim().split("\n").map((line) => JSON.parse(line) as T); }
function fileSha(name: string): string { return digest(readFileSync(join(DIR, name))); }

describe("Manhattan registry-only bus-lane acquisition", () => {
  test("reconciles exactly to the pinned 42-row M-route partition", () => {
    const proof = json<Record<string, unknown>>("partition-proof.json");
    const partition = jsonl<Record<string, string>>("partition.jsonl");
    expect(proof.candidate_set_id).toBe(SET_ID);
    expect(proof.candidate_set_sha256).toBe(SET_SHA);
    expect(proof.exact_backlog_count).toBe(321);
    expect(proof.manhattan_count).toBe(42);
    expect(partition).toHaveLength(42);
    expect(new Set(partition.map((row) => row.candidate_id)).size).toBe(42);
    expect(new Set(partition.map((row) => row.route_id)).size).toBe(42);
    expect(partition.every((row) => /^M\d/.test(row.route_id) && !row.route_id.startsWith("QM"))).toBe(true);
    expect(partition.every((row) => row.corridor.length > 0 && SHA_RE.test(row.ledger_row_sha256) && SHA_RE.test(row.candidate_row_sha256))).toBe(true);
  });

  test("retains official DOT lane rows for every candidate without promoting proximity", () => {
    const partition = jsonl<{ candidate_id: string }>("partition.jsonl");
    const rows = jsonl<{ candidate_id: string; boro: string | null; source_snapshot_sha256: string; source_row_sha256: string; segment_id: string | null }>("official-lane-evidence.jsonl");
    expect(rows.length).toBeGreaterThan(42);
    expect(new Set(rows.map((row) => row.candidate_id))).toEqual(new Set(partition.map((row) => row.candidate_id)));
    expect(rows.every((row) => row.boro === "MAN" && SHA_RE.test(row.source_snapshot_sha256) && SHA_RE.test(row.source_row_sha256))).toBe(true);
    expect(rows.every((row) => row.segment_id === null || /^\d+$/.test(row.segment_id))).toBe(true);
  });

  test("records all four official acquisition channels with dated URLs and byte hashes", () => {
    const checks = json<{ sources: Array<{ retrieval_status: string; content_sha256: string | null }>; route_pages: Array<{ retrieval_status: string; content_sha256: string | null }> }>("acquired-source-checks.json");
    const receipts = jsonl<{
      candidate: { candidate_set_sha256: string };
      acquisition_attempts: Array<{ category: string; query_status: string; urls_checked: string[]; retrievals: Array<{ status: string; retrieved_on: string; sha256: string | null }> }>;
      source_findings: { acquired_for_candidate: boolean };
    }>("receipts.jsonl");
    expect(checks.route_pages).toHaveLength(42);
    expect(checks.route_pages.every((row) => row.retrieval_status === "acquired" && SHA_RE.test(row.content_sha256 ?? ""))).toBe(true);
    expect(checks.sources.filter((row) => row.retrieval_status === "acquired").length).toBeGreaterThanOrEqual(19);
    for (const receipt of receipts) {
      expect(receipt.candidate.candidate_set_sha256).toBe(SET_SHA);
      expect(receipt.acquisition_attempts.map((attempt) => attempt.category)).toEqual([
        "official_nyc_dot_lane_project",
        "official_mta_route_project",
        "official_public_board_committee",
        "other_repository_approved_primary",
      ]);
      expect(receipt.acquisition_attempts.every((attempt) => attempt.query_status.includes("2026-07-15") && attempt.urls_checked.length > 0)).toBe(true);
      expect(receipt.acquisition_attempts.flatMap((attempt) => attempt.urls_checked).every((url) => HOSTS.has(new URL(url).hostname))).toBe(true);
      expect(receipt.acquisition_attempts.every((attempt) => attempt.retrievals.some((row) => row.status === "acquired" && row.retrieved_on === "2026-07-15" && SHA_RE.test(row.sha256 ?? "")))).toBe(true);
      expect(receipt.source_findings.acquired_for_candidate).toBe(true);
    }
  });

  test("separates six generic linkages from segment, phase, and occurrence proof", () => {
    const receipts = jsonl<{
      receipt_id: string;
      candidate: { candidate_id: string; route_id: string };
      claim_results: { exact_route_treatment_binding_proved: boolean; exact_route_binding_evidence: Array<{ source_sha256: string | null }>; exact_segment_binding_proved: boolean; candidate_date_supported_at_day_precision: boolean; date_and_phase_proved: boolean; explicit_phase_identity_proved: boolean; operational_occurrence_identity_proved: boolean };
      canonical_actions: { existing_canonical_links_verified: string[]; canonical_links_added: unknown[]; operational_occurrence_added_or_updated: boolean; authoritative_linkage_intake_gap: boolean };
      outcome: { registry_projection_excluded: boolean; still_unresolved: boolean; study_projection_eligible: boolean };
    }>("receipts.jsonl");
    const supported = receipts.filter((receipt) => receipt.claim_results.exact_route_treatment_binding_proved);
    const gaps = receipts.filter((receipt) => receipt.canonical_actions.authoritative_linkage_intake_gap);
    expect(supported.map((receipt) => receipt.candidate.route_id).sort()).toEqual(["M101", "M102", "M103", "M15+", "M60+", "M98"]);
    expect(supported.every((receipt) => receipt.claim_results.exact_route_binding_evidence.length > 0 && receipt.claim_results.exact_route_binding_evidence.every((row) => SHA_RE.test(row.source_sha256 ?? "")))).toBe(true);
    expect(gaps.map((receipt) => receipt.candidate.route_id).sort()).toEqual(["M101", "M102", "M103", "M98"]);
    expect(receipts.filter((receipt) => receipt.canonical_actions.existing_canonical_links_verified.length > 0).map((receipt) => receipt.candidate.route_id).sort()).toEqual(["M15+", "M60+"]);
    expect(receipts.every((receipt) => !receipt.claim_results.exact_segment_binding_proved && !receipt.claim_results.candidate_date_supported_at_day_precision && !receipt.claim_results.date_and_phase_proved && !receipt.claim_results.explicit_phase_identity_proved && !receipt.claim_results.operational_occurrence_identity_proved)).toBe(true);
    expect(receipts.every((receipt) => receipt.canonical_actions.canonical_links_added.length === 0 && !receipt.canonical_actions.operational_occurrence_added_or_updated)).toBe(true);
    expect(receipts.every((receipt) => receipt.outcome.registry_projection_excluded && receipt.outcome.still_unresolved && !receipt.outcome.study_projection_eligible)).toBe(true);
  });

  test("reconciles receipts, exclusions, summary, and deterministic receipt ids", () => {
    const receipts = jsonl<Record<string, unknown> & { receipt_id: string; candidate: { candidate_id: string } }>("receipts.jsonl");
    const exclusions = jsonl<{ candidate_id: string; study_projection_eligible: boolean }>("registry-projection-exclusions.jsonl");
    const summary = json<Record<string, number | string | string[]>>("summary.json");
    expect(receipts).toHaveLength(42);
    expect(exclusions).toHaveLength(42);
    expect(receipts.map((row) => row.candidate.candidate_id)).toEqual([...receipts.map((row) => row.candidate.candidate_id)].sort());
    for (const receipt of receipts) {
      const { receipt_id: _, ...core } = receipt;
      expect(receipt.receipt_id).toBe(`manhattan-acquisition:${digest(stable(core)).slice(0, 24)}`);
    }
    expect(exclusions.every((row) => !row.study_projection_eligible)).toBe(true);
    expect(summary.researched_count).toBe(42);
    expect(summary.source_acquired_count).toBe(42);
    expect(summary.exact_route_binding_proved_count).toBe(6);
    expect(summary.segment_binding_proved_count).toBe(0);
    expect(summary.date_and_phase_proved_count).toBe(0);
    expect(summary.operational_occurrence_added_or_updated_count).toBe(0);
    expect(summary.explicitly_excluded_count).toBe(42);
    expect(summary.still_unresolved_count).toBe(42);
    expect(summary.study_projection_eligible_count).toBe(0);
    expect(summary.authoritative_linkage_intake_gap_count).toBe(4);
    expect(summary.receipts_sha256).toBe(fileSha("receipts.jsonl"));
    expect(summary.exclusions_sha256).toBe(fileSha("registry-projection-exclusions.jsonl"));
  });

  test("manifest hashes every generated artifact", () => {
    const manifest = json<{ candidate_set_sha256: string; artifacts: Array<{ path: string; sha256: string; bytes: number }>; manifest_payload_sha256: string }>("manifest.json");
    expect(manifest.candidate_set_sha256).toBe(SET_SHA);
    expect(manifest.artifacts).toHaveLength(8);
    expect(manifest.manifest_payload_sha256).toBe(digest(stable(manifest.artifacts)));
    for (const artifact of manifest.artifacts) {
      expect(artifact.sha256).toBe(fileSha(artifact.path));
      expect(artifact.bytes).toBe(readFileSync(join(DIR, artifact.path)).byteLength);
    }
  });
});
