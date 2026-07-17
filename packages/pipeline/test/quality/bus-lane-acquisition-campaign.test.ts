import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import {
  BUS_LANE_ACQUISITION_CAMPAIGN_ID,
  BUS_LANE_ACQUISITION_CANDIDATE_SET_ID,
  BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256,
  BUS_LANE_ACQUISITION_SHARDS,
  NONEXCLUSIVE_REASON_CODES,
  REQUIRED_ACQUISITION_CATEGORIES,
  buildBusLaneAcquisitionCampaign,
  candidateOwnershipCollisions,
  nonexclusiveReasonCodes,
  type CampaignRow,
} from "../../../../scripts/aggregate-bus-lane-acquisition-campaign-v1";

const OUTPUT_DIR = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
);

type Totals = {
  researched: number;
  source_acquired: number;
  authoritative_route_treatment_binding_proved: number;
  exact_segment_binding_proved: number;
  date_and_phase_proved: number;
  operational_occurrence_added_or_updated: number;
  explicitly_excluded: number;
  still_unresolved: number;
};

type Summary = {
  schema_version: number;
  campaign_id: string;
  candidate_set_id: string;
  candidate_set_sha256: string;
  reconciliation_ledger_sha256: string;
  candidate_ids_sha256: string;
  shard_manifest_set_sha256: string;
  campaign_jsonl_sha256: string;
  totals: Totals;
  exclusive_primary_disposition_counts: Record<string, number>;
  nonexclusive_reason_counts: Record<string, number>;
  shard_counts: Record<string, Totals>;
  coverage_assertions: Record<string, number | boolean>;
  input_shards: Array<{
    shard: string;
    manifest_path: string;
    manifest_sha256: string;
    candidate_count: number;
  }>;
};

type Manifest = {
  manifest_payload_sha256: string;
  artifacts: Array<{ path: string; sha256: string; bytes: number }>;
  input_shards: Array<{ manifest_path: string; manifest_sha256: string }>;
  [key: string]: unknown;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function lineIndex(path: string, candidateId: (value: Record<string, unknown>) => string): Map<string, string> {
  return new Map(readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((raw) => {
      const value = JSON.parse(raw) as Record<string, unknown>;
      return [candidateId(value), raw];
    }));
}

describe("registry-only bus-lane acquisition campaign v1", () => {
  it("reconciles the exact 321-candidate funnel and exclusive dispositions", () => {
    const campaign = buildBusLaneAcquisitionCampaign();
    const summary = campaign.summary as unknown as Summary;
    const generatedRows = readJsonl<CampaignRow>(join(OUTPUT_DIR, "campaign.jsonl"));

    expect(campaign.rows).toHaveLength(321);
    expect(generatedRows).toEqual(campaign.rows);
    expect(new Set(campaign.rows.map((row) => row.candidate.candidate_id)).size).toBe(321);
    expect(new Set(campaign.rows.map((row) => row.candidate.identity)).size).toBe(321);
    expect(new Set(campaign.rows.map((row) => row.acquisition.receipt_id)).size).toBe(321);
    expect(campaign.rows.every((row) => row.schema_version === 1)).toBe(true);
    expect(campaign.rows.every((row) => row.campaign_id === BUS_LANE_ACQUISITION_CAMPAIGN_ID)).toBe(true);
    expect(campaign.rows.every((row) => row.candidate_set_id === BUS_LANE_ACQUISITION_CANDIDATE_SET_ID)).toBe(true);
    expect(campaign.rows.every((row) => row.candidate_set_sha256 === BUS_LANE_ACQUISITION_CANDIDATE_SET_SHA256)).toBe(true);

    expect(summary.totals).toEqual({
      researched: 321,
      source_acquired: 321,
      authoritative_route_treatment_binding_proved: 54,
      exact_segment_binding_proved: 1,
      date_and_phase_proved: 0,
      operational_occurrence_added_or_updated: 0,
      explicitly_excluded: 321,
      still_unresolved: 321,
    });
    expect(summary.exclusive_primary_disposition_counts).toEqual({
      completed_search_route_linkage_unresolved: 267,
      linkage_supported_phase_unresolved: 54,
    });
    expect(Object.values(summary.exclusive_primary_disposition_counts).reduce((sum, count) => sum + count, 0)).toBe(321);
    expect(campaign.rows.every((row) => row.outcome.registry_projection_excluded)).toBe(true);
    expect(campaign.rows.every((row) => !row.outcome.study_projection_eligible && row.outcome.still_unresolved)).toBe(true);
    expect(campaign.rows.every((row) => row.relationship_proof.route_binding_precision.includes("not_exact_candidate_segment_day_phase_or_occurrence"))).toBe(true);
  });

  it("records the complete non-exclusive reason taxonomy and four-channel research coverage", () => {
    const campaign = buildBusLaneAcquisitionCampaign();
    const summary = campaign.summary as unknown as Summary;
    expect(summary.nonexclusive_reason_counts).toEqual({
      authoritative_route_treatment_binding_unproved: 267,
      exact_candidate_segment_binding_unproved: 320,
      explicit_phase_identity_unproved: 321,
      candidate_date_and_phase_unproved: 321,
      canonical_operational_occurrence_identity_unproved: 321,
      operational_occurrence_not_added_or_updated: 321,
    });
    expect(campaign.rows.every((row) =>
      row.acquisition.required_source_categories_checked.length === REQUIRED_ACQUISITION_CATEGORIES.length
      && new Set(row.acquisition.required_source_categories_checked).size === REQUIRED_ACQUISITION_CATEGORIES.length
      && REQUIRED_ACQUISITION_CATEGORIES.every((category) => row.acquisition.required_source_categories_checked.includes(category))
    )).toBe(true);
    expect(summary.coverage_assertions.four_channel_receipt_count).toBe(321);
    expect(summary.coverage_assertions.all_assertions_passed).toBe(true);
    const bx12Local = campaign.rows.find((row) =>
      row.candidate.candidate_id === "study-event-v2:4f20a93956a3af9db4bad8c1");
    expect(bx12Local?.relationship_proof.authoritative_route_treatment_binding_proved).toBe(false);
    expect(bx12Local?.outcome.exclusive_primary_disposition).toBe("completed_search_route_linkage_unresolved");
    expect(bx12Local?.outcome.unsupported_claims.join("\n")).toContain(
      "BX12 Select Bus Service (BX12+), not the distinct BX12 local candidate",
    );
    for (const [name, value] of Object.entries(summary.coverage_assertions)) {
      if (name.endsWith("collision_count") || name.startsWith("missing_") || name.startsWith("extra_") || name.includes("_without_")) {
        expect(value, name).toBe(0);
      }
    }

    const allFalse = {
      authoritative_route_treatment_binding_proved: false,
      exact_candidate_segment_binding_proved: false,
      explicit_phase_identity_proved: false,
      candidate_date_and_phase_proved: false,
      canonical_operational_occurrence_identity_proved: false,
      operational_occurrence_added_or_updated: false,
    };
    expect(nonexclusiveReasonCodes(allFalse)).toEqual([...NONEXCLUSIVE_REASON_CODES]);
    expect(nonexclusiveReasonCodes(Object.fromEntries(Object.keys(allFalse).map((key) => [key, true])) as typeof allFalse)).toEqual([]);
    expect(candidateOwnershipCollisions([
      { candidate_id: "candidate-a", shard: "bronx" },
      { candidate_id: "candidate-a", shard: "queens" },
      { candidate_id: "candidate-b", shard: "queens" },
    ])).toEqual([{ candidate_id: "candidate-a", shards: ["bronx", "queens"], row_count: 2 }]);
  });

  it("binds every normalized row to the exact shard and reconciliation inputs by hash", () => {
    const campaign = buildBusLaneAcquisitionCampaign();
    const summary = campaign.summary as unknown as Summary;
    const ledgerPath = join(repoRoot, "data", "quality", "rc19-reject-reconciliation", "rc19-reject-ledger.jsonl");
    expect(sha256(readFileSync(ledgerPath))).toBe(summary.reconciliation_ledger_sha256);
    expect(sha256(readFileSync(join(OUTPUT_DIR, "campaign.jsonl")))).toBe(summary.campaign_jsonl_sha256);
    expect(summary.input_shards.map((input) => input.shard)).toEqual([...BUS_LANE_ACQUISITION_SHARDS]);
    expect(summary.input_shards.reduce((sum, input) => sum + input.candidate_count, 0)).toBe(321);

    const lineIndexes = new Map<string, Map<string, string>>();
    for (const shard of BUS_LANE_ACQUISITION_SHARDS) {
      const base = join(OUTPUT_DIR, "shards", shard);
      lineIndexes.set(`${shard}:partition`, lineIndex(join(base, "partition.jsonl"), (row) => String(row.candidate_id)));
      lineIndexes.set(`${shard}:receipt`, lineIndex(join(base, "receipts.jsonl"), (row) => String((row.candidate as Record<string, unknown>).candidate_id)));
      lineIndexes.set(`${shard}:exclusion`, lineIndex(join(base, "registry-projection-exclusions.jsonl"), (row) => String(row.candidate_id)));
    }
    const ledgerLines = lineIndex(ledgerPath, (row) => String(row.candidate_id));
    for (const row of campaign.rows) {
      const id = row.candidate.candidate_id;
      expect(sha256(lineIndexes.get(`${row.shard}:partition`)!.get(id)!)).toBe(row.provenance.partition_row_sha256);
      expect(sha256(lineIndexes.get(`${row.shard}:receipt`)!.get(id)!)).toBe(row.provenance.receipt_row_sha256);
      expect(sha256(lineIndexes.get(`${row.shard}:exclusion`)!.get(id)!)).toBe(row.provenance.exclusion_row_sha256);
      expect(sha256(ledgerLines.get(id)!)).toBe(row.provenance.reconciliation_ledger_row_sha256);
      expect(sha256(readFileSync(join(repoRoot, row.provenance.shard_manifest_path)))).toBe(row.provenance.shard_manifest_sha256);
    }
  });

  it("pins generated artifacts and all five verified shard manifests", () => {
    const manifestPath = join(OUTPUT_DIR, "manifest.json");
    const manifest = readJson<Manifest>(manifestPath);
    const { manifest_payload_sha256: payloadHash, ...payload } = manifest;
    expect(sha256(stableJson(payload as never))).toBe(payloadHash);
    for (const artifact of manifest.artifacts) {
      const bytes = readFileSync(join(OUTPUT_DIR, artifact.path));
      expect(bytes.byteLength, artifact.path).toBe(artifact.bytes);
      expect(sha256(bytes), artifact.path).toBe(artifact.sha256);
    }
    expect(manifest.input_shards).toHaveLength(5);
    for (const input of manifest.input_shards) {
      expect(sha256(readFileSync(join(repoRoot, input.manifest_path))), input.manifest_path).toBe(input.manifest_sha256);
    }
  });
});
