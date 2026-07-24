import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import type { JsonValue } from "../../../db/src/types";
import {
  PLAN040_PACKAGE_12_CANDIDATES,
  PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_12_GLOBAL_PINS,
  PLAN040_PACKAGE_12_TREATMENT_RECORD_ID,
  buildPlan040Package12Draft,
  plan040Package12ReplayHash,
  type Plan040Package12CandidateEvidence,
  type Plan040Package12Draft,
} from "../../src/quality/plan040-flatbush-physical-grain-package12";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-flatbush-physical-grain-package-12-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-flatbush-physical-grain-package-12-evidence-draft-v1.json`;
const EVIDENCE_SHA256 =
  "4134a3afc2ce8c2f6fcecd9b12f941c1967511f1401132620b3750d916bc7736";
const DRAFT_SHA256 =
  "60095cd79d13f3174961a93aec1cfae5f5e481f6373914a2075502a7a8a7c23b";

type Package12Evidence = {
  candidate_count: 2;
  route_count: 2;
  candidate_key_sha256: string;
  candidates: Plan040Package12CandidateEvidence[];
  immutable_inputs: typeof PLAN040_PACKAGE_12_GLOBAL_PINS;
  source_packet_state: {
    raw_source_path: string;
    raw_source_packet_present: false;
    accepted_submission_journal_frozen: true;
    canonical_evidence_ref_frozen: true;
    source_gap_requires_dual_independent_review: true;
  };
  evidence_verdict_distribution: {
    positive_grain_not_applicable_proposed: 2;
  };
  proposed_grain_distribution: { not_applicable: 2 };
  preservation_contract: {
    occurrence_bytes_changed: false;
    extent_bytes_changed: false;
    ontology_bytes_changed: false;
    treatment_bytes_changed: false;
  };
  review_protocol: {
    independent_review_required: true;
    dual_independent_review_required: true;
    owner_gate_created: false;
    owner_acceptance_created: false;
    persistence_performed: false;
  };
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
const inputFor = (
  evidence: Package12Evidence,
  candidates = evidence.candidates,
) => ({
  evidenceManifestPath:
    "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-flatbush-physical-grain-package-12-evidence-v1.json",
  evidenceManifestSha256: EVIDENCE_SHA256,
  candidates,
});

describe("Plan 040 Package 12 Flatbush physical-treatment grain freeze", () => {
  const evidenceBytes = readFileSync(evidencePath);
  const draftBytes = readFileSync(draftPath);
  const evidence = JSON.parse(
    evidenceBytes.toString("utf8"),
  ) as Package12Evidence;
  const draft = JSON.parse(
    draftBytes.toString("utf8"),
  ) as Plan040Package12Draft;

  it("freezes the exact B41/B67 candidate scope and deterministic draft", () => {
    expect(sha256(evidenceBytes)).toBe(EVIDENCE_SHA256);
    expect(sha256(draftBytes)).toBe(DRAFT_SHA256);
    expect(evidence.candidate_count).toBe(2);
    expect(evidence.route_count).toBe(2);
    expect(sortedHash(evidence.candidates.map((row) =>
      row.candidate_key))).toBe(PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256);
    expect(evidence.candidates.map((row) => [
      row.gtfs_route_id,
      row.route_record_id,
      row.proposed_grain_decision.member_extent_decision_id,
    ])).toEqual([...PLAN040_PACKAGE_12_CANDIDATES]);
    expect(buildPlan040Package12Draft(inputFor(evidence))).toEqual(draft);
    expect(plan040Package12ReplayHash(
      draft as unknown as JsonValue,
    )).toBe(sha256(draftBytes));
  });

  it("proposes not_applicable grain with no invented service selector", () => {
    expect(evidence.candidates.every((row) =>
      row.treatment_record_id === PLAN040_PACKAGE_12_TREATMENT_RECORD_ID &&
      row.proposed_extent_decision === null &&
      row.proposed_grain_decision.service_scope.kind === "not_applicable" &&
      row.proposed_grain_decision.lineage_segments.length === 0 &&
      !JSON.stringify(row.proposed_grain_decision).includes(
        '"kind":"all_service"',
      ) &&
      !JSON.stringify(row.proposed_grain_decision).includes('"pattern_ids"') &&
      !JSON.stringify(row.proposed_grain_decision).includes('"periods"')
    )).toBe(true);
    expect(evidence.evidence_verdict_distribution).toEqual({
      positive_grain_not_applicable_proposed: 2,
    });
    expect(evidence.proposed_grain_distribution).toEqual({
      not_applicable: 2,
    });
  });

  it("binds each proposal to the exact existing bounded extent decision", () => {
    for (const candidate of evidence.candidates) {
      expect(candidate.prior_ledger_state.extent_row.verdict).toBe(
        "resolved:bounded_segment",
      );
      expect(candidate.prior_ledger_state.grain_row.verdict).toBe("unreviewed");
      expect(candidate.prior_ledger_state.grain_row.service_scope).toBeNull();
      expect(candidate.immutable_candidate_rows.extent_review_decision
        .decision_id).toBe(
        candidate.proposed_grain_decision.member_extent_decision_id,
      );
      expect(candidate.proposed_grain_decision.evidence_bindings.some(
        (binding) =>
          binding.role === "existing_extent_decision" &&
          binding.record_id ===
            candidate.proposed_grain_decision.member_extent_decision_id,
      )).toBe(true);
    }
  });

  it("freezes the source gap and exact substitute evidence bytes", () => {
    expect(existsSync(
      `${repoRoot}/${evidence.source_packet_state.raw_source_path}`,
    )).toBe(false);
    expect(evidence.source_packet_state).toEqual({
      raw_source_path:
        "raw/sources/nyc_dot_flatbush_installation_begins_2025",
      raw_source_packet_present: false,
      accepted_submission_journal_frozen: true,
      canonical_evidence_ref_frozen: true,
      source_gap_requires_dual_independent_review: true,
    });
    expect(evidence.immutable_inputs).toEqual(PLAN040_PACKAGE_12_GLOBAL_PINS);
    expect(evidence.candidates.every((row) =>
      row.source_binding.evidence_id ===
        "nyc_dot_flatbush_installation_begins_2025#p001_b0019" &&
      row.source_binding.block_sha256 ===
        "sha256:30013ba6828a02a6e555ca70f1e04b4ea1a417a91797600a3df13fb8e2b3180a" &&
      row.source_binding.submission_id === "sub_f2926644a2bc184a" &&
      !row.source_binding.raw_source_packet_present &&
      row.source_binding.canonical_and_submission_evidence_frozen
    )).toBe(true);
  });

  it("requires dual independent review and preserves every authority boundary", () => {
    expect(evidence.review_protocol).toMatchObject({
      independent_review_required: true,
      dual_independent_review_required: true,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    });
    expect(evidence.preservation_contract).toEqual({
      occurrence_bytes_changed: false,
      extent_bytes_changed: false,
      ontology_bytes_changed: false,
      treatment_bytes_changed: false,
    });
    expect(evidence.candidates.every((row) =>
      row.persisted_extent_decision === null &&
      row.persisted_grain_decision === null &&
      !row.authorizes_occurrence &&
      !row.authorizes_study &&
      !row.authorizes_cross_product &&
      !row.authorizes_decision_persistence
    )).toBe(true);
    expect(evidence.external_acquisition_performed).toBe(false);
    expect(evidence.authorizes_occurrence).toBe(false);
    expect(evidence.authorizes_study).toBe(false);
    expect(evidence.authorizes_cross_product).toBe(false);
    expect(evidence.authorizes_decision_persistence).toBe(false);
  });

  it("fails closed on service-scope, extent-link, or authority drift", () => {
    const serviceTamper = clone(evidence.candidates);
    (serviceTamper[0]!.proposed_grain_decision.service_scope as {
      kind: string;
    }).kind = "all_service";
    expect(() => buildPlan040Package12Draft(inputFor(
      evidence,
      serviceTamper,
    ))).toThrow();

    const extentTamper = clone(evidence.candidates);
    extentTamper[0]!.proposed_grain_decision.member_extent_decision_id =
      extentTamper[1]!.proposed_grain_decision.member_extent_decision_id;
    expect(() => buildPlan040Package12Draft(inputFor(
      evidence,
      extentTamper,
    ))).toThrow("Package 12 evidence drifted");

    const authorityTamper = clone(evidence.candidates);
    (authorityTamper[0] as unknown as { authorizes_study: boolean })
      .authorizes_study = true;
    expect(() => buildPlan040Package12Draft(inputFor(
      evidence,
      authorityTamper,
    ))).toThrow("Package 12 evidence drifted");
  });
});
