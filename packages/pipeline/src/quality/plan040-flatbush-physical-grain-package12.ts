import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  parseMemberGrainDecision,
  type MemberGrainDecision,
} from "./member-grain-decisions.js";
import type {
  MemberExtentLedgerRow,
  MemberGrainLedgerRow,
} from "./member-extent-ledger.js";
import type { MemberExtentDecision } from "./study-readiness-v1.js";

export const PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12 =
  "plan-040-flatbush-physical-grain-package-12-evidence-only-v1" as const;
export const PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256 =
  "1cc0e2cf3731d36b2667c5da68c55001bb7f023e4a8cc21c7cc14d27e4af273d" as const;
export const PLAN040_PACKAGE_12_TREATMENT_RECORD_ID =
  "treatment_flatbush-phase1-center-running-bus-lanes-livingston-state" as const;
export const PLAN040_PACKAGE_12_CANDIDATES = [
  [
    "B41",
    "route_b41-ace",
    "member-extent-review:facb2149774e62edc913fcab",
  ],
  [
    "B67",
    "route_b67-flatbush-ave-apr2026",
    "member-extent-review:9b58300e4c2713e272ea9e8b",
  ],
] as const;

export const PLAN040_PACKAGE_12_GLOBAL_PINS = {
  extent_ledger:
    "677586944219a59e1d6d74b7bf7c6b39150a99a0a84dce6bdc4fac11cf9057e9",
  grain_ledger:
    "bb6c5aca8bff36494e6c1e0857d2a6e722c3fb523cd2aca2ee8b17f3fa2730cf",
  bridge_ledger:
    "6c82b4a37067e6c7de563e373c7187c75a15610118da6fa3c64cdb70133e755b",
  study_manifest:
    "2aca7fc78f36440a89db0b85a23baf69d421bc93ebe22e32514285670f7dd882",
  member_extent_contract:
    "2898c276271722374ce81b23d02d2110ddef198055cdfcb81e1d6c29094144c4",
  member_extent_manifest:
    "51ad2e7d37f751f9278bf695342a0497803601efe0ad0ada3c49ad85e8cd8158",
  member_extent_review_ledger:
    "8f1a0f4d7e1df6df77c9c65a68dad3501d350f23f92a6fef1ab36412808d6a08",
  occurrence_decisions:
    "80e530c9953e59a767afcb2f0d61202d9a9209469075f41f993fe7469ee45883",
  treatment_components:
    "a9b76c3b7121fc87d0f190a44fb00f182229d8d309968d3ba00a8c27a1492bae",
  routes:
    "8ea0278c7acae7585cbe0c85e3fa9407d8ca49b1ca12327b60318b676122a5c0",
  tracker_input:
    "1d96eda711a30f651628b64adf8ae4f71cd7acd99bff09d6735bfeea265965cf",
  source_submission_journal:
    "c9e800992ff8ef2b2a745c56a334a5b12e7e8f3dc7baa61111c4ea3496232b94",
} as const;

export type Plan040Package12CandidateEvidence = {
  candidate_key: string;
  occurrence_id: "occurrence:8c987704152b459014217d44";
  gtfs_route_id: "B41" | "B67";
  route_record_id: "route_b41-ace" | "route_b67-flatbush-ave-apr2026";
  treatment_record_id: typeof PLAN040_PACKAGE_12_TREATMENT_RECORD_ID;
  treatment_family: "bus_lane";
  source_binding: {
    source_id: "nyc_dot_flatbush_installation_begins_2025";
    evidence_id:
      "nyc_dot_flatbush_installation_begins_2025#p001_b0019";
    block_sha256:
      "sha256:30013ba6828a02a6e555ca70f1e04b4ea1a417a91797600a3df13fb8e2b3180a";
    source_quote: string;
    submission_id: "sub_f2926644a2bc184a";
    raw_source_packet_present: false;
    canonical_and_submission_evidence_frozen: true;
  };
  immutable_candidate_rows: {
    occurrence_decision: JsonValue;
    occurrence_row_sha256: string;
    accepted_submission: JsonValue;
    accepted_submission_row_sha256: string;
    treatment_component: JsonValue;
    treatment_row_sha256: string;
    route_record: JsonValue;
    route_row_sha256: string;
    extent_review_decision: MemberExtentDecision;
    extent_review_row_sha256: string;
    projected_extent_contract_row: JsonValue;
    projected_extent_row_sha256: string;
    extent_ledger_row_sha256: string;
    grain_ledger_row_sha256: string;
  };
  prior_ledger_state: {
    extent_row: MemberExtentLedgerRow;
    grain_row: MemberGrainLedgerRow;
  };
  exact_candidate_searches: string[];
  evidence_verdict: "positive_grain_not_applicable_proposed";
  proposed_extent_decision: null;
  proposed_grain_decision: MemberGrainDecision;
  persisted_extent_decision: null;
  persisted_grain_decision: null;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

export type Plan040Package12Draft = {
  schema_version: 1;
  package_id: typeof PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12;
  evidence_manifest: { path: string; sha256: string };
  candidate_count: 2;
  route_count: 2;
  candidate_key_sha256: typeof PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256;
  evidence_verdict_distribution: {
    positive_grain_not_applicable_proposed: 2;
  };
  proposed_extent_decision_count: 0;
  proposed_grain_distribution: { not_applicable: 2 };
  candidates: Plan040Package12CandidateEvidence[];
  immutable_inputs: typeof PLAN040_PACKAGE_12_GLOBAL_PINS;
  source_packet_state: {
    raw_source_packet_present: false;
    accepted_submission_journal_frozen: true;
    canonical_evidence_ref_frozen: true;
  };
  preservation_contract: {
    occurrence_bytes_changed: false;
    extent_bytes_changed: false;
    ontology_bytes_changed: false;
    treatment_bytes_changed: false;
  };
  review_protocol: {
    review_mode:
      "dual_independent_physical_treatment_grain_source_gap_review";
    independent_review_required: true;
    dual_independent_review_required: true;
    owner_gate_created: false;
    owner_acceptance_created: false;
    persistence_performed: false;
  };
  authorization_state:
    "evidence_draft_pending_independent_review_no_gate_no_acceptance_no_persistence";
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);

export function plan040Package12ReplayHash(value: JsonValue): string {
  return sha256(`${stableJson(value)}\n`);
}

function validateCandidate(candidate: Plan040Package12CandidateEvidence): void {
  const expected = PLAN040_PACKAGE_12_CANDIDATES.find(
    ([route]) => route === candidate.gtfs_route_id,
  );
  const grain = parseMemberGrainDecision(
    candidate.proposed_grain_decision,
    `${candidate.gtfs_route_id}.grain`,
  );
  if (
    !expected ||
    candidate.route_record_id !== expected[1] ||
    candidate.treatment_record_id !== PLAN040_PACKAGE_12_TREATMENT_RECORD_ID ||
    candidate.candidate_key !== [
      candidate.occurrence_id,
      candidate.route_record_id,
      candidate.treatment_record_id,
    ].join("\0") ||
    candidate.prior_ledger_state.extent_row.verdict !==
      "resolved:bounded_segment" ||
    candidate.prior_ledger_state.grain_row.verdict !== "unreviewed" ||
    candidate.prior_ledger_state.grain_row.service_scope !== null ||
    candidate.proposed_extent_decision !== null ||
    candidate.evidence_verdict !==
      "positive_grain_not_applicable_proposed" ||
    grain.member_extent_decision_id !== expected[2] ||
    grain.service_scope.kind !== "not_applicable" ||
    grain.lineage_segments.length !== 0 ||
    !grain.evidence_bindings.some((binding) =>
      binding.role === "existing_extent_decision" &&
      binding.record_id === expected[2]) ||
    candidate.source_binding.raw_source_packet_present ||
    !candidate.source_binding.canonical_and_submission_evidence_frozen ||
    candidate.exact_candidate_searches.length < 10 ||
    candidate.persisted_extent_decision !== null ||
    candidate.persisted_grain_decision !== null ||
    candidate.authorizes_occurrence ||
    candidate.authorizes_study ||
    candidate.authorizes_cross_product ||
    candidate.authorizes_decision_persistence
  ) {
    throw new Error(`${candidate.gtfs_route_id}: Package 12 evidence drifted`);
  }
  const serialized = stableJson(candidate as unknown as JsonValue);
  if (
    serialized.includes('"kind":"all_service"') ||
    serialized.includes('"pattern_ids"') ||
    serialized.includes('"periods"')
  ) {
    throw new Error(`${candidate.gtfs_route_id}: service selector invented`);
  }
}

export function buildPlan040Package12Draft(input: {
  evidenceManifestPath: string;
  evidenceManifestSha256: string;
  candidates: Plan040Package12CandidateEvidence[];
}): Plan040Package12Draft {
  const byRoute = new Map(input.candidates.map((candidate) => [
    candidate.gtfs_route_id,
    candidate,
  ]));
  const candidates = PLAN040_PACKAGE_12_CANDIDATES.map(
    ([route]) => byRoute.get(route)!,
  );
  if (
    candidates.some((candidate) => !candidate) ||
    byRoute.size !== 2 ||
    sortedHash(candidates.map((candidate) => candidate.candidate_key)) !==
      PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256
  ) {
    throw new Error("Plan 040 Package 12 candidate scope drifted");
  }
  candidates.forEach(validateCandidate);
  return {
    schema_version: 1,
    package_id: PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12,
    evidence_manifest: {
      path: input.evidenceManifestPath,
      sha256: input.evidenceManifestSha256,
    },
    candidate_count: 2,
    route_count: 2,
    candidate_key_sha256: PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256,
    evidence_verdict_distribution: {
      positive_grain_not_applicable_proposed: 2,
    },
    proposed_extent_decision_count: 0,
    proposed_grain_distribution: { not_applicable: 2 },
    candidates,
    immutable_inputs: PLAN040_PACKAGE_12_GLOBAL_PINS,
    source_packet_state: {
      raw_source_packet_present: false,
      accepted_submission_journal_frozen: true,
      canonical_evidence_ref_frozen: true,
    },
    preservation_contract: {
      occurrence_bytes_changed: false,
      extent_bytes_changed: false,
      ontology_bytes_changed: false,
      treatment_bytes_changed: false,
    },
    review_protocol: {
      review_mode:
        "dual_independent_physical_treatment_grain_source_gap_review",
      independent_review_required: true,
      dual_independent_review_required: true,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    },
    authorization_state:
      "evidence_draft_pending_independent_review_no_gate_no_acceptance_no_persistence",
    persisted_extent_decision_count: 0,
    persisted_grain_decision_count: 0,
    external_acquisition_performed: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}
