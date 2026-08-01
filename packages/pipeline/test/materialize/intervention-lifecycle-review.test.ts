import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

const campaign = join(repoRoot, "data", "intervention-lifecycle", "campaigns", "plan-055");
const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown) => stableJson(value as JsonValue);
const json = <T>(path: string): T =>
  JSON.parse(readFileSync(join(campaign, path), "utf8")) as T;
const jsonl = <T>(path: string): T[] => {
  const value = readFileSync(join(campaign, path), "utf8").trim();
  return value ? value.split("\n").map((line) => JSON.parse(line) as T) : [];
};

type Candidate = {
  lifecycle_candidate_id: string;
  candidate_sha256: string;
  placement_id: string;
  application_action: string;
  resolved_onset: { precision: string };
  phase_semantics: { lifecycle_phase: string | null };
  valid_time_candidate: { coverage_kind: string };
  document_time_candidate: Record<string, string | null>;
  evidence_bindings: Array<{ canonical_record_sha256: string; evidence_text_sha256: string }>;
  risk_classes: string[];
};

describe("Plan 055 frozen lifecycle review portfolio", () => {
  it("freezes the exact 104-placement denominator without pre-accepting lifecycle semantics", () => {
    const rows = jsonl<Candidate>("frozen-cohort/cohort.jsonl");
    expect(rows).toHaveLength(104);
    expect(new Set(rows.map((row) => row.lifecycle_candidate_id)).size).toBe(104);
    expect(new Set(rows.map((row) => row.placement_id)).size).toBe(104);
    expect(rows.every((row) => row.application_action === "add")).toBe(true);
    expect(rows.every((row) => row.valid_time_candidate.coverage_kind === "point")).toBe(true);
    expect(rows.every((row) => row.evidence_bindings.length > 0)).toBe(true);
    expect(rows.every((row) => row.evidence_bindings.every((binding) =>
      /^[0-9a-f]{64}$/u.test(binding.canonical_record_sha256) &&
      /^[0-9a-f]{64}$/u.test(binding.evidence_text_sha256)
    ))).toBe(true);
    expect(rows.every((row) => !("proposed_assertion" in row))).toBe(true);

    const phases = Object.fromEntries([...new Set(rows.map((row) =>
      row.phase_semantics.lifecycle_phase ?? "null"
    ))].sort().map((phase) => [
      phase,
      rows.filter((row) => (row.phase_semantics.lifecycle_phase ?? "null") === phase).length,
    ]));
    expect(phases).toEqual({
      expanded: 16,
      installed: 8,
      launched: 52,
      modified: 5,
      other: 10,
      piloted: 7,
      planned: 6,
    });
    const precisions = Object.fromEntries([...new Set(rows.map((row) =>
      row.resolved_onset.precision
    ))].sort().map((precision) => [
      precision,
      rows.filter((row) => row.resolved_onset.precision === precision).length,
    ]));
    expect(precisions).toEqual({ day: 84, month: 16, season: 3, upper_bound_day: 1 });
    expect(rows.filter((row) => row.risk_classes.includes("cross_source_continuity"))).toHaveLength(27);
    expect(rows.filter((row) => row.risk_classes.includes("uncertain_valid_time_bounds"))).toHaveLength(20);
    expect(rows.filter((row) => row.risk_classes.includes("prospective_not_realized"))).toHaveLength(6);
    expect(rows.filter((row) =>
      row.risk_classes.includes("no_exact_treatment_lifecycle_evidence")
    )).toHaveLength(3);
  });

  it("partitions three independently reviewed content-addressed batches exactly once", () => {
    const rows = jsonl<Candidate>("frozen-cohort/cohort.jsonl");
    const portfolio = json<{
      starting_commit_sha: string;
      production_as_of_date: string;
      representative_dates: string[];
      candidate_count: number;
      batch_count: number;
      candidate_id_partition_sha256: string;
      cohort_sha256: string;
      manifest_partition_sha256: string;
      manifests: Array<{ batch_id: string; path: string; sha256: string; candidate_count: number }>;
      owner_gate: { status: string; publication_authority: boolean };
      provider_usage: { provider_requests: number; actual_cost_usd: number };
    }>("portfolio.json");
    expect(portfolio.starting_commit_sha).toBe("81f895417a47e36214b00aab483d482742f80099");
    expect(portfolio.production_as_of_date).toBe("2026-07-27");
    expect(portfolio.representative_dates).toEqual([
      "2025-06-28", "2025-06-29", "2025-06-30", "2026-07-27",
    ]);
    expect(portfolio.candidate_count).toBe(104);
    expect(portfolio.batch_count).toBe(3);
    expect(portfolio.owner_gate).toEqual(expect.objectContaining({
      status: "approved",
      publication_authority: false,
    }));
    expect(portfolio.provider_usage).toEqual(expect.objectContaining({
      provider_requests: 0,
      actual_cost_usd: 0,
    }));
    expect(portfolio.candidate_id_partition_sha256).toBe(sha256(
      rows.map((row) => row.lifecycle_candidate_id).sort().join("\n"),
    ));
    expect(portfolio.cohort_sha256).toBe(sha256(readFileSync(
      join(campaign, "frozen-cohort", "cohort.jsonl"),
    )));

    const assigned: string[] = [];
    const manifestPins: string[] = [];
    for (const entry of portfolio.manifests) {
      const bytes = readFileSync(join(repoRoot, entry.path));
      expect(sha256(bytes)).toBe(entry.sha256);
      const manifest = JSON.parse(bytes.toString("utf8")) as {
        candidate_count: number;
        candidates: Array<{ lifecycle_candidate_id: string }>;
        reviewer_assignments: Record<string, string | boolean>;
        execution_contract: Record<string, boolean>;
      };
      expect(manifest.candidate_count).toBeGreaterThanOrEqual(20);
      expect(manifest.candidate_count).toBeLessThanOrEqual(50);
      expect(manifest.candidates).toHaveLength(entry.candidate_count);
      expect(new Set([
        manifest.reviewer_assignments.primary_reviewer,
        manifest.reviewer_assignments.required_independent_reviewer,
        manifest.reviewer_assignments.clean_room_adjudicator,
      ]).size).toBe(3);
      expect(manifest.execution_contract).toEqual(expect.objectContaining({
        action_alone_authorizes_lifecycle: false,
        silence_authorizes_current_state: false,
        latest_row_wins: false,
        valid_and_document_time_separate: true,
      }));
      assigned.push(...manifest.candidates.map((row) => row.lifecycle_candidate_id));
      manifestPins.push(`${entry.batch_id}|${entry.sha256}`);
    }
    expect(assigned.sort()).toEqual(rows.map((row) => row.lifecycle_candidate_id).sort());
    expect(new Set(assigned).size).toBe(104);
    expect(portfolio.manifest_partition_sha256).toBe(sha256(manifestPins.sort().join("\n")));
    expect(canonical(JSON.parse(canonical(portfolio)))).toBe(canonical(portfolio));
  });
});
