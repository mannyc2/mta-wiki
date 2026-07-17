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
  "files.mta.info",
  "new.mta.info",
  "bustime-classic.mta.info",
]);

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, name), "utf8")) as T;
}

function readJsonl<T>(name: string): T[] {
  return readFileSync(join(DIR, name), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function fileSha256(name: string): string {
  return createHash("sha256").update(readFileSync(join(DIR, name))).digest("hex");
}

describe("Staten Island registry-only bus-lane acquisition", () => {
  test("reconciles exactly to the pinned 54-row Staten Island partition", () => {
    const proof = readJson<Record<string, unknown>>("partition-proof.json");
    const partition = readJsonl<Record<string, string>>("partition.jsonl");
    expect(proof.candidate_set_id).toBe(EXPECTED_SET);
    expect(proof.candidate_set_sha256).toBe(EXPECTED_SHA);
    expect(proof.exact_backlog_count).toBe(321);
    expect(proof.staten_island_count).toBe(54);
    expect(proof.s_local_or_sbs_count).toBe(27);
    expect(proof.sim_express_count).toBe(27);
    expect(partition).toHaveLength(54);
    expect(new Set(partition.map((row) => row.candidate_id)).size).toBe(54);
    expect(new Set(partition.map((row) => row.route_id)).size).toBe(54);
    expect(partition.filter((row) => /^S\d/.test(row.route_id))).toHaveLength(27);
    expect(partition.filter((row) => /^SIM\d/.test(row.route_id))).toHaveLength(27);
    expect(partition.every((row) => row.corridor.length > 0 && SHA_RE.test(row.ledger_row_sha256))).toBe(true);
  });

  test("records four genuine official acquisition channels for every candidate", () => {
    const checks = readJson<{
      sources: Array<{
        retrieval_status: string;
        retrieved_on: string;
        content_sha256: string | null;
        byte_length: number | null;
        url: string;
      }>;
      route_pages: Array<{
        candidate_id: string;
        retrieval_status: string;
        retrieved_on: string;
        content_sha256: string | null;
        byte_length: number | null;
        url: string;
      }>;
    }>("acquired-source-checks.json");
    const receipts = readJsonl<{
      candidate: { candidate_set_sha256: string };
      acquisition_attempts: Array<{
        category: string;
        query_status: string;
        urls_checked: string[];
        retrievals: Array<{ status: string; retrieved_on: string; sha256: string | null }>;
      }>;
      source_findings: {
        acquired_for_candidate: boolean;
        acquisition_channels_acquired: Record<string, boolean>;
        official_lane_matching_record_count: number;
      };
    }>("receipts.jsonl");
    expect(checks.sources).toHaveLength(21);
    expect(checks.route_pages).toHaveLength(54);
    expect(
      checks.sources.every(
        (source) =>
          source.retrieval_status === "acquired" &&
          source.retrieved_on === "2026-07-15" &&
          SHA_RE.test(source.content_sha256 ?? "") &&
          (source.byte_length ?? 0) > 0,
      ),
    ).toBe(true);
    expect(
      checks.route_pages.every(
        (source) =>
          source.retrieval_status === "acquired" &&
          source.retrieved_on === "2026-07-15" &&
          SHA_RE.test(source.content_sha256 ?? "") &&
          (source.byte_length ?? 0) > 0,
      ),
    ).toBe(true);
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
      expect(
        receipt.acquisition_attempts
          .flatMap((attempt) => attempt.urls_checked)
          .every((url) => ALLOWED_HOSTS.has(new URL(url).hostname)),
      ).toBe(true);
      expect(
        receipt.acquisition_attempts.every((attempt) =>
          attempt.retrievals.some(
            (retrieval) =>
              retrieval.status === "acquired" &&
              retrieval.retrieved_on === "2026-07-15" &&
              SHA_RE.test(retrieval.sha256 ?? ""),
          ),
        ),
      ).toBe(true);
      expect(receipt.source_findings.acquired_for_candidate).toBe(true);
      expect(Object.values(receipt.source_findings.acquisition_channels_acquired).every(Boolean)).toBe(true);
      expect(receipt.source_findings.official_lane_matching_record_count).toBeGreaterThan(0);
    }
  });

  test("supports only explicit route-project statements and never promotes proximity", () => {
    const receipts = readJsonl<{
      receipt_id: string;
      candidate: { candidate_id: string; route_id: string; corridor: string };
      source_findings: {
        candidate_named_lane_record_count: number;
        exact_project_route_statement_found: boolean;
        broader_corridor_route_inventory_match: boolean;
      };
      claim_results: {
        exact_route_treatment_binding_proved: boolean;
        exact_route_binding_evidence: Array<{ source_sha256: string | null }>;
        exact_segment_binding_proved: boolean;
        date_and_phase_proved: boolean;
        explicit_phase_identity_proved: boolean;
        operational_occurrence_identity_proved: boolean;
      };
      canonical_actions: { canonical_links_added: unknown[]; operational_occurrence_added_or_updated: boolean };
      outcome: { registry_projection_excluded: boolean; study_projection_eligible: boolean; still_unresolved: boolean };
    }>("receipts.jsonl");
    const supported = readJsonl<{ candidate_id: string; route_id: string; canonical_links_added_by_shard: unknown[] }>(
      "supported-linkage-candidates.jsonl",
    );
    const expectedRoutes = new Set([
      "SIM1C", "SIM3C", "SIM33C", "SIM4C", "SIM34", "SIM2", "SIM15", "SIM1", "SIM5", "SIM4", "SIM35", "SIM32",
      "SIM26", "SIM8", "SIM30", "SIM25", "SIM22",
      "S78", "SIM7", "S79+", "S57", "SIM9",
    ]);
    const routeBound = receipts.filter((receipt) => receipt.claim_results.exact_route_treatment_binding_proved);
    expect(receipts).toHaveLength(54);
    expect(routeBound).toHaveLength(22);
    expect(new Set(routeBound.map((receipt) => receipt.candidate.route_id))).toEqual(expectedRoutes);
    expect(routeBound.every((receipt) => receipt.source_findings.exact_project_route_statement_found)).toBe(true);
    expect(
      routeBound.every(
        (receipt) =>
          receipt.source_findings.candidate_named_lane_record_count === 0 || receipt.candidate.route_id === "S79+",
      ),
    ).toBe(true);
    expect(
      routeBound.every(
        (receipt) =>
          receipt.claim_results.exact_route_binding_evidence.length > 0 &&
          receipt.claim_results.exact_route_binding_evidence.every((evidence) => SHA_RE.test(evidence.source_sha256 ?? "")),
      ),
    ).toBe(true);
    expect(receipts.every((receipt) => !receipt.claim_results.exact_segment_binding_proved)).toBe(true);
    expect(receipts.every((receipt) => !receipt.claim_results.date_and_phase_proved)).toBe(true);
    expect(receipts.every((receipt) => !receipt.claim_results.explicit_phase_identity_proved)).toBe(true);
    expect(receipts.every((receipt) => !receipt.claim_results.operational_occurrence_identity_proved)).toBe(true);
    expect(
      receipts.every(
        (receipt) =>
          receipt.canonical_actions.canonical_links_added.length === 0 &&
          !receipt.canonical_actions.operational_occurrence_added_or_updated &&
          receipt.outcome.registry_projection_excluded &&
          !receipt.outcome.study_projection_eligible &&
          receipt.outcome.still_unresolved,
      ),
    ).toBe(true);
    expect(supported).toHaveLength(22);
    expect(new Set(supported.map((row) => row.candidate_id))).toEqual(
      new Set(routeBound.map((receipt) => receipt.candidate.candidate_id)),
    );
    expect(supported.every((row) => row.canonical_links_added_by_shard.length === 0)).toBe(true);
    expect(routeBound.some((receipt) => receipt.candidate.corridor === "Victory Bl")).toBe(false);
    expect(
      receipts.some(
        (receipt) =>
          receipt.candidate.corridor === "Victory Bl" &&
          receipt.source_findings.broader_corridor_route_inventory_match &&
          !receipt.claim_results.exact_route_treatment_binding_proved,
      ),
    ).toBe(true);
  });

  test("reconciles the receipt and exclusion outcomes exactly", () => {
    const exclusions = readJsonl<{ candidate_id: string; study_projection_eligible: boolean }>(
      "registry-projection-exclusions.jsonl",
    );
    const summary = readJson<Record<string, number | string | string[]>>("summary.json");
    expect(exclusions).toHaveLength(54);
    expect(new Set(exclusions.map((row) => row.candidate_id)).size).toBe(54);
    expect(exclusions.every((row) => !row.study_projection_eligible)).toBe(true);
    expect(summary.researched_count).toBe(54);
    expect(summary.source_acquired_count).toBe(54);
    expect(summary.exact_route_binding_proved_count).toBe(22);
    expect(summary.segment_binding_proved_count).toBe(0);
    expect(summary.date_and_phase_proved_count).toBe(0);
    expect(summary.operational_occurrence_added_or_updated_count).toBe(0);
    expect(summary.explicitly_excluded_count).toBe(54);
    expect(summary.still_unresolved_count).toBe(54);
    expect(summary.study_projection_eligible_count).toBe(0);
  });

  test("manifest hashes every generated artifact", () => {
    const manifest = readJson<{
      candidate_set_sha256: string;
      artifacts: Array<{ path: string; sha256: string; bytes: number }>;
    }>("manifest.json");
    expect(manifest.candidate_set_sha256).toBe(EXPECTED_SHA);
    expect(manifest.artifacts).toHaveLength(9);
    for (const artifact of manifest.artifacts) {
      expect(artifact.sha256).toBe(fileSha256(artifact.path));
      expect(artifact.bytes).toBe(readFileSync(join(DIR, artifact.path)).byteLength);
    }
  });
});
