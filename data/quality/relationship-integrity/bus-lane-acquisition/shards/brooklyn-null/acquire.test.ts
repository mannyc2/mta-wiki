import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const DIR = import.meta.dir;
const REPO_ROOT = resolve(DIR, "../../../../../..");
const EXPECTED_SET = "candidate-set-v2:24080902f508b55a0033df32";
const EXPECTED_SHA = "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba";
const SHA_RE = /^[0-9a-f]{64}$/;
const NULL_CANDIDATES = new Set([
  "study-event-v2:40faf059c0562d9c833d1f61",
  "study-event-v2:6803927dd89ac794281abdc2",
  "study-event-v2:e2f62a46ac9f1b1a54f713bc",
  "study-event-v2:ea0ab416262ceed4e7184116",
]);
const SUPPORTED_ROUTES = new Set(["B35", "B41", "B46+", "B54", "B67", "B82+", "X27", "X28"]);
const ALLOWED_HOSTS = new Set([
  "www.nyc.gov",
  "data.cityofnewyork.us",
  "www.mta.info",
  "bustime-classic.mta.info",
]);

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, name), "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function readShardJsonl<T>(name: string): T[] {
  return readJsonl<T>(join(DIR, name));
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

type Receipt = {
  receipt_id: string;
  candidate: {
    candidate_id: string;
    candidate_set_sha256: string;
    route_id: string;
    corridor: string;
  };
  acquisition_attempts: Array<{
    category: string;
    query_status: string;
    urls_checked: string[];
    retrievals: Array<{ status: string; retrieved_on: string; sha256: string | null }>;
  }>;
  source_findings: {
    acquired_for_candidate: boolean;
    official_lane_matching_record_count: number;
    exact_project_route_statement_found: boolean;
    exact_project_route_source_id: string | null;
  };
  claim_results: {
    exact_route_treatment_binding_proved: boolean;
    exact_route_binding_evidence: Array<{ source_sha256: string | null }>;
    exact_segment_binding_proved: boolean;
    candidate_date_supported_at_day_precision: boolean;
    official_completion_milestone_proved: boolean;
    date_and_phase_proved: boolean;
    explicit_phase_identity_proved: boolean;
    operational_occurrence_identity_proved: boolean;
  };
  canonical_actions: {
    canonical_links_added: unknown[];
    operational_occurrence_added_or_updated: boolean;
  };
  outcome: {
    registry_projection_excluded: boolean;
    study_projection_eligible: boolean;
    still_unresolved: boolean;
    exclusive_primary_disposition: string;
  };
};

describe("Brooklyn and borough-null registry-only bus-lane acquisition", () => {
  test("reconciles exactly to the 56 Brooklyn and four named borough-null rows", () => {
    const proof = readJson<Record<string, unknown>>("partition-proof.json");
    const partition = readShardJsonl<Record<string, string>>("partition.jsonl");
    const ledger = readJsonl<Record<string, unknown>>(
      join(REPO_ROOT, "data/quality/rc19-reject-reconciliation/rc19-reject-ledger.jsonl"),
    );
    const exactBacklog = new Set(
      ledger
        .filter(
          (row) =>
            row.exclusive_primary_disposition === "mta_route_or_treatment_scope_binding_gap" &&
            row.treatment_family === "bus_lane",
        )
        .map((row) => String(row.candidate_id)),
    );

    expect(proof.candidate_set_id).toBe(EXPECTED_SET);
    expect(proof.candidate_set_sha256).toBe(EXPECTED_SHA);
    expect(proof.exact_backlog_count).toBe(321);
    expect(proof.brooklyn_count).toBe(56);
    expect(proof.borough_null_count).toBe(4);
    expect(partition).toHaveLength(60);
    expect(new Set(partition.map((row) => row.candidate_id)).size).toBe(60);
    expect(partition.filter((row) => /^B(?!X)/.test(row.route_id))).toHaveLength(56);
    const nullRows = partition.filter((row) => NULL_CANDIDATES.has(row.candidate_id));
    expect(nullRows).toHaveLength(4);
    expect(new Set(nullRows.map((row) => row.route_id))).toEqual(new Set(["X27", "X28", "X37", "X38"]));
    expect(partition.every((row) => exactBacklog.has(row.candidate_id))).toBe(true);
    expect(partition.every((row) => row.corridor.length > 0 && SHA_RE.test(row.ledger_row_sha256))).toBe(true);
  });

  test("records all four official-source channels, retrieval dates, and acquired byte hashes", () => {
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
        url: string;
      }>;
    }>("acquired-source-checks.json");
    const receipts = readShardJsonl<Receipt>("receipts.jsonl");

    expect(checks.route_pages).toHaveLength(60);
    for (const checked of [...checks.sources, ...checks.route_pages]) {
      expect(ALLOWED_HOSTS.has(new URL(checked.url).hostname)).toBe(true);
      expect(checked.retrieved_on).toBe("2026-07-15");
      if (checked.retrieval_status === "acquired") {
        expect(SHA_RE.test(checked.content_sha256 ?? "")).toBe(true);
      } else {
        expect(checked.retrieval_status).toBe("not_retrieved");
        expect(checked.content_sha256).toBeNull();
      }
    }

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
        receipt.acquisition_attempts
          .flatMap((attempt) => attempt.retrievals)
          .every((retrieval) => retrieval.retrieved_on === "2026-07-15"),
      ).toBe(true);
      expect(
        receipt.acquisition_attempts.every((attempt) =>
          attempt.retrievals.some(
            (retrieval) => retrieval.status === "acquired" && SHA_RE.test(retrieval.sha256 ?? ""),
          ),
        ),
      ).toBe(true);
      expect(receipt.source_findings.acquired_for_candidate).toBe(true);
      expect(receipt.source_findings.official_lane_matching_record_count).toBeGreaterThan(0);
    }
  });

  test("keeps route, segment, day, phase, and occurrence claims at their proved precision", () => {
    const receipts = readShardJsonl<Receipt>("receipts.jsonl");
    const byRoute = new Map(receipts.map((receipt) => [receipt.candidate.route_id, receipt]));
    const supported = receipts.filter((receipt) => receipt.claim_results.exact_route_treatment_binding_proved);

    expect(supported).toHaveLength(8);
    expect(new Set(supported.map((receipt) => receipt.candidate.route_id))).toEqual(SUPPORTED_ROUTES);
    expect(supported.every((receipt) => receipt.claim_results.exact_route_binding_evidence.length > 0)).toBe(true);
    expect(
      supported.every((receipt) =>
        receipt.claim_results.exact_route_binding_evidence.every((evidence) =>
          SHA_RE.test(evidence.source_sha256 ?? ""),
        ),
      ),
    ).toBe(true);

    expect(byRoute.get("B82+")?.claim_results.exact_segment_binding_proved).toBe(true);
    expect(byRoute.get("B82+")?.claim_results.candidate_date_supported_at_day_precision).toBe(true);
    expect(byRoute.get("B82")?.claim_results.exact_route_treatment_binding_proved).toBe(false);
    expect(byRoute.get("B82")?.claim_results.exact_segment_binding_proved).toBe(false);
    expect(byRoute.get("B54")?.claim_results.exact_route_treatment_binding_proved).toBe(true);
    expect(byRoute.get("B54")?.claim_results.candidate_date_supported_at_day_precision).toBe(false);
    expect(byRoute.get("B4")?.candidate.corridor).toBe("Nostrand Avenue");
    expect(byRoute.get("B4")?.claim_results.exact_route_treatment_binding_proved).toBe(false);
    for (const route of ["X27", "X28"]) {
      expect(byRoute.get(route)?.source_findings.exact_project_route_source_id).toBe(
        "better_buses_action_plan_2019",
      );
      expect(byRoute.get(route)?.claim_results.official_completion_milestone_proved).toBe(true);
      expect(byRoute.get(route)?.claim_results.candidate_date_supported_at_day_precision).toBe(false);
    }
    expect(receipts.filter((receipt) => receipt.claim_results.exact_segment_binding_proved)).toHaveLength(1);
    expect(receipts.filter((receipt) => receipt.claim_results.candidate_date_supported_at_day_precision)).toHaveLength(1);
    expect(
      receipts.every(
        (receipt) =>
          !receipt.claim_results.date_and_phase_proved &&
          !receipt.claim_results.explicit_phase_identity_proved &&
          !receipt.claim_results.operational_occurrence_identity_proved,
      ),
    ).toBe(true);
  });

  test("excludes every registry projection and reconciles the summary exactly", () => {
    const receipts = readShardJsonl<Receipt>("receipts.jsonl");
    const exclusions = readShardJsonl<{ candidate_id: string; study_projection_eligible: boolean }>(
      "registry-projection-exclusions.jsonl",
    );
    const summary = readJson<Record<string, number | string>>("summary.json");

    expect(receipts).toHaveLength(60);
    expect(exclusions).toHaveLength(60);
    expect(new Set(receipts.map((receipt) => receipt.receipt_id)).size).toBe(60);
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
    expect(exclusions.every((row) => !row.study_projection_eligible)).toBe(true);
    expect(summary.researched_count).toBe(60);
    expect(summary.source_acquired_count).toBe(60);
    expect(summary.exact_route_binding_proved_count).toBe(8);
    expect(summary.segment_binding_proved_count).toBe(1);
    expect(summary.date_and_phase_proved_count).toBe(0);
    expect(summary.operational_occurrence_added_or_updated_count).toBe(0);
    expect(summary.explicitly_excluded_count).toBe(60);
    expect(summary.still_unresolved_count).toBe(60);
    expect(summary.study_projection_eligible_count).toBe(0);
  });

  test("manifest hashes every generated artifact", () => {
    const manifest = readJson<{
      candidate_set_sha256: string;
      artifacts: Array<{ path: string; sha256: string; bytes: number }>;
    }>("manifest.json");
    expect(manifest.candidate_set_sha256).toBe(EXPECTED_SHA);
    expect(manifest.artifacts).toHaveLength(8);
    for (const artifact of manifest.artifacts) {
      const path = join(DIR, artifact.path);
      expect(artifact.sha256).toBe(sha256(path));
      expect(artifact.bytes).toBe(readFileSync(path).byteLength);
    }
  });

  test("offline regeneration is byte deterministic", () => {
    const names = [
      "partition.jsonl",
      "partition-proof.json",
      "acquired-source-checks.json",
      "official-lane-evidence.jsonl",
      "receipts.jsonl",
      "registry-projection-exclusions.jsonl",
      "summary.json",
      "report.md",
      "manifest.json",
    ];
    const before = new Map(names.map((name) => [name, sha256(join(DIR, name))]));
    const result = Bun.spawnSync(["bun", join(DIR, "acquire.ts")], { cwd: REPO_ROOT });
    expect(result.exitCode).toBe(0);
    expect(names.every((name) => sha256(join(DIR, name)) === before.get(name))).toBe(true);
  });
});
