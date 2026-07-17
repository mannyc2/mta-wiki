import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import {
  buildLinkageReconciliationCampaign,
  LINKAGE_RECONCILIATION_EXPECTED_COUNT,
  LINKAGE_RECONCILIATION_EXPECTED_STATUS_COUNTS,
  type LinkageReconciliationRow,
} from "./reconcile";

const outputDir = import.meta.dir;
const campaign = buildLinkageReconciliationCampaign();

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function generatedRows(): LinkageReconciliationRow[] {
  return readFileSync(join(outputDir, "reconciliation.jsonl"), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LinkageReconciliationRow);
}

function canonicalRelationHashes(): Map<string, string> {
  return new Map(
    readFileSync(
      join(
        outputDir,
        "../../../../canonical/relations.jsonl",
      ),
      "utf8",
    )
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        const row = JSON.parse(line) as { record_id: string };
        return [row.record_id, sha256(line)] as const;
      }),
  );
}

describe("bus-lane supported-linkage reconciliation", () => {
  it("reconciles the truth-correct 54-row gate with exact exclusive statuses", () => {
    expect(campaign.rows).toEqual(generatedRows());
    expect(campaign.rows).toHaveLength(LINKAGE_RECONCILIATION_EXPECTED_COUNT);
    expect(new Set(campaign.rows.map((row) => row.candidate_id)).size).toBe(LINKAGE_RECONCILIATION_EXPECTED_COUNT);
    expect(campaign.summary.exclusive_primary_status_counts).toEqual(LINKAGE_RECONCILIATION_EXPECTED_STATUS_COUNTS);
    expect(campaign.summary.shard_counts).toEqual({
      bronx: { candidate_count: 13, implemented_pending: 7, verified_existing: 6 },
      "brooklyn-null": { candidate_count: 8, implemented_pending: 1, verified_existing: 7 },
      manhattan: { candidate_count: 6, implemented_pending: 4, verified_existing: 2 },
      queens: { candidate_count: 5, implemented_pending: 5, verified_existing: 0 },
      "staten-island": { candidate_count: 22, implemented_pending: 12, verified_existing: 10 },
    });
  });

  it("proves endpoint, type, evidence, and raw-byte identity against current canonical records", () => {
    const rawHashes = canonicalRelationHashes();
    for (const row of campaign.rows) {
      expect(row.relation_proof.endpoints_resolve).toBe(true);
      expect(row.relation_proof.endpoint_type_valid).toBe(true);
      expect(row.relation_proof.local_observation_only_endpoint).toBe(false);
      expect(row.relation_proof.relation_evidence_hash_valid).toBe(true);
      expect(row.relation_proof.current_canonical_materialization).toBe(
        true,
      );
      expect(row.relation_proof.relation_evidence_refs.length).toBeGreaterThan(0);
      expect(row.relation_proof.route_variant_exact).toBe(true);
      expect(row.relation_proof.record_sha256).toBe(
        rawHashes.get(row.relation_proof.relation_id),
      );
      expect(row.authoritative_linkage_evidence.source_sha256).toMatch(/^[0-9a-f]{64}$/u);
      if (row.exclusive_primary_status === "implemented_pending") {
        expect(row.relation_proof.record_status).toBe("accepted_pending_submission");
        expect(row.relation_proof.pending_journal_path).toMatch(/^data\/submissions\/.+\.jsonl$/u);
        expect(row.relation_proof.pending_submission_ids.length).toBeGreaterThan(0);
      } else {
        expect(row.relation_proof.record_status).toBe("canonical_existing");
        expect(row.relation_proof.pending_journal_path).toBeNull();
        expect(row.relation_proof.pending_submission_ids).toEqual([]);
        expect(row.relation_proof.supersession).toBeNull();
      }
    }
    expect(
      campaign.rows.find(
        (row) =>
          row.candidate_id ===
          "study-event-v2:2d2be03b8437c8af3bf6ddef",
      )?.relation_proof.relation_id,
    ).toBe("relation_project-serves-b35_2");
  });

  it("follows the live Staten Island retirement ledger to the effective replacement relations", () => {
    const originalPath =
      "data/submissions/2026-07-15T21-00-00-000Z_staten-island-acquisition-linkage-remediation.jsonl";
    const replacementPath =
      "data/submissions/2026-07-16T01-30-00-000Z_staten-island-evidence-reblocking-remediation.jsonl";
    const superseded = campaign.rows.filter((row) => row.relation_proof.supersession !== null);
    const unaffectedOriginal = campaign.rows.filter((row) =>
      row.shard === "staten-island" &&
      row.exclusive_primary_status === "implemented_pending" &&
      row.relation_proof.pending_journal_path === originalPath);

    expect(superseded).toHaveLength(9);
    expect(superseded.map((row) => row.route_id).sort()).toEqual([
      "SIM1",
      "SIM15",
      "SIM2",
      "SIM32",
      "SIM33C",
      "SIM34",
      "SIM35",
      "SIM3C",
      "SIM5",
    ]);
    expect(unaffectedOriginal.map((row) => row.route_id).sort()).toEqual(["S57", "SIM7", "SIM9"]);
    for (const row of superseded) {
      const proof = row.relation_proof;
      const lineage = proof.supersession!;
      expect(proof.pending_journal_path).toBe(replacementPath);
      expect(proof.pending_submission_ids).toEqual([lineage.replacement_submission_id]);
      expect(lineage.original_journal_path).toBe(originalPath);
      expect(lineage.original_journal_sha256).toBe("9e0ade44c8f28f6684bbe6b57d496730d0ce360a4a84e6d9fc541ef8b0458a4b");
      expect(lineage.replacement_journal_path).toBe(replacementPath);
      expect(lineage.replacement_journal_sha256).toBe("7c91ba7c95ec523cf200179239c1f25aea5a4b317439be4a3b9d7fa81f5c36f2");
      expect(lineage.remediation_sha256).toBe("30d1c4642eee937bab95b10fd2f00f84449a61f719f9dff125b0ba3e713e19a6");
      expect(lineage.current_primary_blocks_sha256).toBe("487b4b779b210ed48c836b10a647567cc20f4ea18c95a58abc4334744e262a28");
      expect(proof.relation_evidence_refs.map((ref) => ref.evidence_id).sort()).toEqual([
        "better_buses_action_plan_2019#p028_c0001",
        "better_buses_action_plan_2019#p028_c0007",
      ]);
      expect(proof.relation_evidence_refs.every((ref) =>
        ref.verification_surface === "staged_blocks" && /^p028_c\d{4}$/u.test(ref.block_id))).toBe(true);
    }
  });

  it("proves every active pending submission materializes and no selected proof cites obsolete evidence", () => {
    expect(campaign.summary.pending_materialization).toEqual({
      active_submission_count: 131,
      active_submission_materialization_failure_count: 0,
      projected_record_count: 131,
      retired_submission_count: 20,
    });
    expect(campaign.summary.obsolete_relation_evidence_reference_count).toBe(0);
    expect(campaign.summary.selected_staten_island_superseded_proof_count).toBe(9);
    expect(campaign.summary.selected_staten_island_original_journal_proof_count).toBe(3);
    expect(campaign.summary.staten_island_selected_proof_migration).toEqual({
      selected_candidate_proof_count: 12,
      affected_relation_proof_count: 9,
      unaffected_relation_proof_count: 3,
      before: {
        original_journal_proof_count: 12,
        replacement_journal_proof_count: 0,
        obsolete_evidence_reference_count: 27,
        current_primary_evidence_reference_count: 0,
      },
      after: {
        original_journal_proof_count: 3,
        replacement_journal_proof_count: 9,
        obsolete_evidence_reference_count: 0,
        current_primary_evidence_reference_count: 18,
      },
      relation_identity_change_count: 0,
      candidate_conclusion_change_count: 0,
    });
    const manifest = campaign.manifest as {
      schema_version: number;
      inputs: {
        staten_island_evidence_reblocking: {
          original_journal: { accepted_submission_count: number; active_submission_count: number; retired_submission_count: number };
          superseding_journal: { accepted_submission_count: number; active_submission_count: number };
          retirement_ledger: { campaign_retirement_count: number; sha256: string };
          obsolete_evidence_id_count: number;
        };
        pending_journals: Array<{
          accepted_submission_count: number;
          active_submission_count: number;
          retired_submission_count: number;
          materialized_submission_count: number;
          projected_record_count: number;
        }>;
      };
    };
    expect(manifest.schema_version).toBe(2);
    expect(manifest.inputs.staten_island_evidence_reblocking).toMatchObject({
      original_journal: { accepted_submission_count: 27, active_submission_count: 7, retired_submission_count: 20 },
      superseding_journal: { accepted_submission_count: 20, active_submission_count: 20 },
      retirement_ledger: { campaign_retirement_count: 20 },
      obsolete_evidence_id_count: 11,
    });
    expect(manifest.inputs.pending_journals.reduce((total, journal) => total + journal.active_submission_count, 0)).toBe(131);
    expect(manifest.inputs.pending_journals.reduce((total, journal) => total + journal.retired_submission_count, 0)).toBe(20);
    expect(manifest.inputs.pending_journals.every((journal) =>
      journal.active_submission_count === journal.materialized_submission_count &&
      journal.active_submission_count === journal.projected_record_count)).toBe(true);
    expect(campaign.rows.flatMap((row) => row.relation_proof.relation_evidence_refs)
      .some((ref) => /better_buses_action_plan_2019#p0(?:26|28)_p/u.test(ref.evidence_id))).toBe(false);
  });

  it("keeps all eight plus/SBS identities exact and distinguishes BX12+ from BX12 local", () => {
    const plusRows = campaign.rows.filter((row) => row.route_variant === "sbs_plus");
    expect(plusRows.map((row) => row.route_id).sort()).toEqual(["B46+", "B82+", "BX12+", "M15+", "M60+", "Q52+", "Q53+", "S79+"]);
    expect(campaign.rows.some((row) => row.route_id === "BX12")).toBe(false);
    expect(campaign.rows.find((row) => row.route_id === "M60+")?.relation_proof.relation_id).toBe("relation_route-m60-sbs-on-corridor-125th");
    expect(campaign.rows.find((row) => row.route_id === "M15+")?.relation_proof.relation_id).toBe("relation_route-sbs-operates-on-second-ave");
    for (const routeId of ["Q52+", "Q53+"]) {
      const row = campaign.rows.find((candidate) => candidate.route_id === routeId)!;
      expect(row.authoritative_linkage_evidence.route_variant_confirmation).toBe("staged_source_sbs_block");
      expect(row.authoritative_linkage_evidence.route_variant_block?.staged_source_id).toBe("rockaway_beach_blvd_jun2019");
    }
  });

  it("retains all 54 as explicitly excluded and nonprojectable without phase/date/occurrence proof", () => {
    expect(campaign.summary.nonexclusive_reason_counts).toEqual({
      candidate_date_and_phase_unproved: 54,
      canonical_operational_occurrence_identity_unproved: 54,
      exact_candidate_segment_binding_unproved: 53,
      explicit_phase_identity_unproved: 54,
      operational_occurrence_not_added_or_updated: 54,
    });
    expect(campaign.rows.filter((row) => row.exact_candidate_segment_binding_proved)).toHaveLength(1);
    expect(campaign.rows.find((row) => row.route_id === "B82+")?.exact_candidate_segment_binding_proved).toBe(true);
    for (const row of campaign.rows) {
      expect(row.explicit_phase_identity_proved).toBe(false);
      expect(row.candidate_date_and_phase_proved).toBe(false);
      expect(row.canonical_operational_occurrence_identity_proved).toBe(false);
      expect(row.operational_occurrence_added_or_updated).toBe(false);
      expect(row.registry_projection_excluded).toBe(true);
      expect(row.still_unresolved).toBe(true);
      expect(row.study_projection_eligible).toBe(false);
    }
  });

  it("pins all five shard action formats and hashes every generated artifact", () => {
    expect(campaign.summary.action_format_counts).toEqual({
      bronx_candidate_actions_v1: 13,
      brooklyn_decisions_jsonl_v1: 8,
      manhattan_existing_plus_routes_v1: 2,
      manhattan_gap_candidate_actions_v1: 4,
      queens_candidate_actions_v1: 5,
      staten_island_candidate_actions_v1: 22,
    });
    const manifest = campaign.manifest as {
      candidate_count: number;
      artifacts: Array<{ path: string; sha256: string; bytes: number }>;
    };
    expect(manifest.candidate_count).toBe(54);
    expect(manifest.artifacts.map((artifact) => artifact.path)).toEqual(["reconciliation.jsonl", "summary.json", "report.md"]);
    for (const artifact of manifest.artifacts) {
      const content = readFileSync(join(outputDir, artifact.path));
      expect(sha256(content)).toBe(artifact.sha256);
      expect(content.byteLength).toBe(artifact.bytes);
    }
  });
});
