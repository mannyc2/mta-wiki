import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { MemberGrainDecision } from
  "../src/quality/member-grain-decisions.js";
import type {
  MemberExtentLedgerRow,
  MemberGrainLedgerRow,
} from "../src/quality/member-extent-ledger.js";
import {
  PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12,
  PLAN040_PACKAGE_12_CANDIDATES,
  PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_12_GLOBAL_PINS,
  PLAN040_PACKAGE_12_TREATMENT_RECORD_ID,
  buildPlan040Package12Draft,
  type Plan040Package12CandidateEvidence,
} from "../src/quality/plan040-flatbush-physical-grain-package12.js";
import type {
  ExactEvidenceBinding,
  MemberExtentDecision,
} from "../src/quality/study-readiness-v1.js";
import {
  PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS,
} from
  "../src/quality/plan040-qbnr-service-grain-package11-closeout.js";
import { PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS } from
  "../src/quality/plan040-accelerated-package14-closeout.js";

const evidenceRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-flatbush-physical-grain-package-12-evidence-v1.json";
const draftRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-flatbush-physical-grain-package-12-evidence-draft-v1.json";
const checkOnly = process.argv.includes("--check");
const sourceJournalRelative =
  "data/submissions/" +
  "2026-07-13_codex_flatbush-phase1-installation-september-2025.jsonl";
const absentRawSourceRelative =
  "raw/sources/nyc_dot_flatbush_installation_begins_2025";

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const stableBytes = (value: JsonValue): string => `${stableJson(value)}\n`;
const rowSha256 = (value: unknown): string =>
  sha256(`${stableJson(value as JsonValue)}\n`);
const readJson = <T>(relative: string): T =>
  JSON.parse(readFileSync(join(repoRoot, relative), "utf8")) as T;
const readJsonlWithHashes = <T>(relative: string): Array<{
  row: T;
  sha256: string;
}> => readFileSync(join(repoRoot, relative), "utf8").trim().split("\n")
  .filter(Boolean).map((line) => ({
    row: JSON.parse(line) as T,
    sha256: sha256(`${line}\n`),
  }));
const assertPinned = (relative: string, expected: string): void => {
  const actual = sha256(readFileSync(join(repoRoot, relative)));
  if (actual !== expected) {
    throw new Error(`${relative}: expected ${expected}, got ${actual}`);
  }
};
const assertOneOfPinned = (
  relative: string,
  expected: readonly string[],
): void => {
  const actual = sha256(readFileSync(join(repoRoot, relative)));
  if (!expected.includes(actual)) {
    throw new Error(
      `${relative}: expected one of ${expected.join(", ")}, got ${actual}`,
    );
  }
};
const writeStable = (relative: string, value: JsonValue): void => {
  const path = join(repoRoot, relative);
  const bytes = stableBytes(value);
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== bytes) {
      throw new Error(`Deterministic replay drifted: ${relative}`);
    }
    return;
  }
  writeFileSync(path, bytes);
};
const one = <T>(
  rows: Array<{ row: T; sha256: string }>,
  predicate: (row: T) => boolean,
  label: string,
) => {
  const matches = rows.filter(({ row }) => predicate(row));
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one row, got ${matches.length}`);
  }
  return matches[0]!;
};
const candidateKey = (row: {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
}): string => [
  row.occurrence_id,
  row.route_record_id,
  row.treatment_record_id,
].join("\0");
const sortedBindings = (
  values: ExactEvidenceBinding[],
): ExactEvidenceBinding[] => values.sort((left, right) => [
  left.role, left.record_id, left.source_id, left.evidence_id,
].join("\0").localeCompare([
  right.role, right.record_id, right.source_id, right.evidence_id,
].join("\0")));

const pins: Array<[string, string]> = [
  [
    "data/quality/operational-reference/member-extent-ledger.jsonl",
    PLAN040_PACKAGE_12_GLOBAL_PINS.extent_ledger,
  ],
  [
    "data/quality/operational-reference/member-grain-ledger.jsonl",
    PLAN040_PACKAGE_12_GLOBAL_PINS.grain_ledger,
  ],
  [
    "data/quality/study-readiness/v1/bridge-ledger.jsonl",
    PLAN040_PACKAGE_12_GLOBAL_PINS.bridge_ledger,
  ],
  [
    "data/quality/study-readiness/v1/manifest.json",
    PLAN040_PACKAGE_12_GLOBAL_PINS.study_manifest,
  ],
  [
    "data/contracts/operational-occurrence-member-extent/v1/" +
      "operational_occurrence_member_extents.jsonl",
    PLAN040_PACKAGE_12_GLOBAL_PINS.member_extent_contract,
  ],
  [
    "data/contracts/operational-occurrence-member-extent/v1/manifest.json",
    PLAN040_PACKAGE_12_GLOBAL_PINS.member_extent_manifest,
  ],
  [
    "data/contracts/operational-occurrence-member-extent/v1/review-ledger.jsonl",
    PLAN040_PACKAGE_12_GLOBAL_PINS.member_extent_review_ledger,
  ],
  [
    "data/exports/releases/v1-rc26/" +
      "operational_occurrence_review_decisions.json",
    PLAN040_PACKAGE_12_GLOBAL_PINS.occurrence_decisions,
  ],
  [
    "data/canonical/treatment_components.jsonl",
    PLAN040_PACKAGE_12_GLOBAL_PINS.treatment_components,
  ],
  ["data/canonical/routes.jsonl", PLAN040_PACKAGE_12_GLOBAL_PINS.routes],
  [
    "data/quality/study-readiness/v1/tracker-rc26-input.json",
    PLAN040_PACKAGE_12_GLOBAL_PINS.tracker_input,
  ],
  [
    sourceJournalRelative,
    PLAN040_PACKAGE_12_GLOBAL_PINS.source_submission_journal,
  ],
];
const mutablePostPins: Record<string, string> = {
  "data/quality/operational-reference/member-extent-ledger.jsonl":
    PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.extent_ledger,
  "data/quality/operational-reference/member-grain-ledger.jsonl":
    PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.grain_ledger,
  "data/quality/study-readiness/v1/bridge-ledger.jsonl":
    PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.bridge_ledger,
  "data/quality/study-readiness/v1/manifest.json":
    PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.study_manifest,
  [
    "data/contracts/operational-occurrence-member-extent/v1/" +
      "operational_occurrence_member_extents.jsonl"
  ]: PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.member_extent_contract,
  "data/contracts/operational-occurrence-member-extent/v1/manifest.json":
    PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.member_extent_manifest,
  "data/contracts/operational-occurrence-member-extent/v1/review-ledger.jsonl":
    PLAN040_PACKAGE_11_POST_PERSISTENCE_PINS.member_extent_review_ledger,
};
const package14Pins: Record<string, string> = {
  "data/quality/operational-reference/member-extent-ledger.jsonl":
    PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.extent_ledger,
  "data/quality/operational-reference/member-grain-ledger.jsonl":
    PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.grain_ledger,
  "data/quality/study-readiness/v1/bridge-ledger.jsonl":
    PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.bridge_ledger,
  "data/quality/study-readiness/v1/manifest.json":
    PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.study_manifest,
  [
    "data/contracts/operational-occurrence-member-extent/v1/" +
      "operational_occurrence_member_extents.jsonl"
  ]: PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.member_extent_contract,
  "data/contracts/operational-occurrence-member-extent/v1/manifest.json":
    PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.member_extent_manifest,
  "data/contracts/operational-occurrence-member-extent/v1/review-ledger.jsonl":
    PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.member_extent_review_ledger,
};
pins.forEach(([path, hash]) => {
  const postPin = mutablePostPins[path];
  const package14Pin = package14Pins[path];
  if (postPin) {
    assertOneOfPinned(path, [
      hash,
      postPin,
      ...(package14Pin ? [package14Pin] : []),
    ]);
  }
  else assertPinned(path, hash);
});
if (existsSync(join(repoRoot, absentRawSourceRelative))) {
  throw new Error(
    "Package 12 raw source packet unexpectedly appeared; evidence must be reviewed",
  );
}

type CanonicalRow = Record<string, unknown> & {
  record_id: string;
  source_id?: string;
  raw_text?: string;
  payload?: { treatment_family?: string };
  evidence_refs?: Array<{
    evidence_id: string;
    text_sha256: string;
    source_quote?: string;
  }>;
};
type OccurrenceDecision = Record<string, unknown> & {
  occurrence_id: string;
  decision_id: string;
  review_state: string;
};
type SubmissionRow = Record<string, unknown> & {
  submission_id: string;
  tool_args: {
    observation_kind: string;
    local_observation_id: string;
    evidence_refs: Array<{
      evidence_id: string;
      text_sha256: string;
      source_quote?: string;
    }>;
  };
};
type ProjectedExtentRow = Record<string, unknown> & {
  decision_id: string;
};

const extentRows = readJsonlWithHashes<MemberExtentLedgerRow>(
  "data/quality/operational-reference/member-extent-ledger.jsonl",
);
const grainRows = readJsonlWithHashes<MemberGrainLedgerRow>(
  "data/quality/operational-reference/member-grain-ledger.jsonl",
);
const treatments = readJsonlWithHashes<CanonicalRow>(
  "data/canonical/treatment_components.jsonl",
);
const routes = readJsonlWithHashes<CanonicalRow>("data/canonical/routes.jsonl");
const extentDecisions = readJsonlWithHashes<MemberExtentDecision>(
  "data/contracts/operational-occurrence-member-extent/v1/review-ledger.jsonl",
);
const projectedExtentRows = readJsonlWithHashes<ProjectedExtentRow>(
  "data/contracts/operational-occurrence-member-extent/v1/" +
    "operational_occurrence_member_extents.jsonl",
);
const submissions = readJsonlWithHashes<SubmissionRow>(sourceJournalRelative);

function occurrenceDecisions(value: JsonValue): OccurrenceDecision[] {
  if (Array.isArray(value)) return value.flatMap(occurrenceDecisions);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, JsonValue>;
  return [
    ...(
      typeof object.occurrence_id === "string" &&
      typeof object.review_state === "string" &&
      typeof object.decision_id === "string"
        ? [object as unknown as OccurrenceDecision]
        : []
    ),
    ...Object.values(object).flatMap(occurrenceDecisions),
  ];
}
const occurrence = (() => {
  const rows = occurrenceDecisions(readJson<JsonValue>(
    "data/exports/releases/v1-rc26/" +
      "operational_occurrence_review_decisions.json",
  )).filter((row) =>
    row.occurrence_id === "occurrence:8c987704152b459014217d44");
  if (rows.length !== 1 || rows[0]!.review_state !== "approved") {
    throw new Error("Package 12 occurrence decision drifted");
  }
  return { row: rows[0]!, sha256: rowSha256(rows[0]!) };
})();
const treatment = one(
  treatments,
  (row) => row.record_id === PLAN040_PACKAGE_12_TREATMENT_RECORD_ID,
  "Package 12 treatment",
);
const submission = one(
  submissions,
  (row) => row.submission_id === "sub_f2926644a2bc184a",
  "Package 12 accepted treatment submission",
);
const sourceRef = treatment.row.evidence_refs?.find((ref) =>
  ref.evidence_id ===
    "nyc_dot_flatbush_installation_begins_2025#p001_b0019");
const submissionRef = submission.row.tool_args.evidence_refs.find((ref) =>
  ref.evidence_id ===
    "nyc_dot_flatbush_installation_begins_2025#p001_b0019");
if (
  treatment.row.source_id !== "nyc_dot_flatbush_installation_begins_2025" ||
  treatment.row.payload?.treatment_family !== "bus_lane" ||
  sourceRef?.text_sha256 !==
    "sha256:30013ba6828a02a6e555ca70f1e04b4ea1a417a91797600a3df13fb8e2b3180a" ||
  submissionRef?.text_sha256 !== sourceRef.text_sha256
) {
  throw new Error("Package 12 canonical/submission source binding drifted");
}

const frozenCandidateByRoute = existsSync(join(repoRoot, evidenceRelative))
  ? new Map(readJson<{
    candidates: Plan040Package12CandidateEvidence[];
  }>(evidenceRelative).candidates.map((candidate) => [
    candidate.gtfs_route_id,
    candidate,
  ]))
  : null;
const candidates = PLAN040_PACKAGE_12_CANDIDATES.map(
  ([routeId, routeRecordId, extentDecisionId]):
    Plan040Package12CandidateEvidence => {
    const currentExtent = one(
      extentRows,
      (row) =>
        row.occurrence_id === "occurrence:8c987704152b459014217d44" &&
        row.route_record_id === routeRecordId &&
        row.treatment_record_id === PLAN040_PACKAGE_12_TREATMENT_RECORD_ID,
      `${routeId} extent ledger`,
    );
    const currentGrain = one(
      grainRows,
      (row) =>
        row.occurrence_id === "occurrence:8c987704152b459014217d44" &&
        row.route_record_id === routeRecordId &&
        row.treatment_record_id === PLAN040_PACKAGE_12_TREATMENT_RECORD_ID,
      `${routeId} grain ledger`,
    );
    const frozenCandidate = frozenCandidateByRoute?.get(routeId);
    const extent = frozenCandidate
      ? {
        row: frozenCandidate.prior_ledger_state.extent_row,
        sha256:
          frozenCandidate.immutable_candidate_rows.extent_ledger_row_sha256,
      }
      : currentExtent;
    const grain = frozenCandidate
      ? {
        row: frozenCandidate.prior_ledger_state.grain_row,
        sha256:
          frozenCandidate.immutable_candidate_rows.grain_ledger_row_sha256,
      }
      : currentGrain;
    if (
      candidateKey(currentExtent.row) !== candidateKey(extent.row) ||
      candidateKey(currentGrain.row) !== candidateKey(grain.row)
    ) {
      throw new Error(`${routeId}: persisted ledger identity drifted`);
    }
    const route = one(
      routes,
      (row) => row.record_id === routeRecordId,
      `${routeId} route`,
    );
    const extentDecision = one(
      extentDecisions,
      (row) => row.decision_id === extentDecisionId,
      `${routeId} extent decision`,
    );
    const projectedExtent = one(
      projectedExtentRows,
      (row) => row.decision_id === extentDecisionId,
      `${routeId} projected extent`,
    );
    const physicalTreatmentBinding: ExactEvidenceBinding = {
      role: "physical_treatment_definition",
      record_id: PLAN040_PACKAGE_12_TREATMENT_RECORD_ID,
      source_id: "nyc_dot_flatbush_installation_begins_2025",
      evidence_id:
        "nyc_dot_flatbush_installation_begins_2025#p001_b0019",
    };
    const proposedGrain: MemberGrainDecision = {
      schema_version: 1,
      contract_id: "member-grain-decision-v1",
      decision_id:
        `member-grain-review:plan040-package12-${routeId.toLowerCase()}`,
      occurrence_id: extent.row.occurrence_id,
      route_record_id: routeRecordId,
      gtfs_route_id: routeId,
      treatment_record_id: PLAN040_PACKAGE_12_TREATMENT_RECORD_ID,
      member_extent_decision_id: extentDecisionId,
      service_scope: { kind: "not_applicable" },
      lineage_segments: [],
      evidence_bindings: sortedBindings([
        {
          role: "existing_extent_decision",
          record_id: extentDecisionId,
          source_id:
            "operational-occurrence-member-extent-v1-review-ledger",
          evidence_id: extentDecisionId,
        },
        physicalTreatmentBinding,
      ]),
      rationale:
        "Physical lane installation has no distinct service selector.",
      reviewed_at: "2026-07-24T00:00:00.000Z",
      reviewed_by: "codex-plan-040-package-12-evidence-proposal",
    };
    return {
      candidate_key: candidateKey(extent.row),
      occurrence_id: "occurrence:8c987704152b459014217d44",
      gtfs_route_id: routeId,
      route_record_id: routeRecordId,
      treatment_record_id: PLAN040_PACKAGE_12_TREATMENT_RECORD_ID,
      treatment_family: "bus_lane",
      source_binding: {
        source_id: "nyc_dot_flatbush_installation_begins_2025",
        evidence_id:
          "nyc_dot_flatbush_installation_begins_2025#p001_b0019",
        block_sha256:
          "sha256:30013ba6828a02a6e555ca70f1e04b4ea1a417a91797600a3df13fb8e2b3180a",
        source_quote: sourceRef.source_quote ??
          treatment.row.raw_text ?? "",
        submission_id: "sub_f2926644a2bc184a",
        raw_source_packet_present: false,
        canonical_and_submission_evidence_frozen: true,
      },
      immutable_candidate_rows: {
        occurrence_decision: occurrence.row as unknown as JsonValue,
        occurrence_row_sha256: occurrence.sha256,
        accepted_submission: submission.row as unknown as JsonValue,
        accepted_submission_row_sha256: submission.sha256,
        treatment_component: treatment.row as unknown as JsonValue,
        treatment_row_sha256: treatment.sha256,
        route_record: route.row as unknown as JsonValue,
        route_row_sha256: route.sha256,
        extent_review_decision: extentDecision.row,
        extent_review_row_sha256: extentDecision.sha256,
        projected_extent_contract_row:
          projectedExtent.row as unknown as JsonValue,
        projected_extent_row_sha256: projectedExtent.sha256,
        extent_ledger_row_sha256: extent.sha256,
        grain_ledger_row_sha256: grain.sha256,
      },
      prior_ledger_state: {
        extent_row: extent.row,
        grain_row: grain.row,
      },
      exact_candidate_searches: [
        "occurrence_id=occurrence:8c987704152b459014217d44",
        `gtfs_route_id=${routeId}`,
        `route_record_id=${routeRecordId}`,
        `treatment_record_id=${PLAN040_PACKAGE_12_TREATMENT_RECORD_ID}`,
        `extent_decision_id=${extentDecisionId}`,
        `extent_ledger_id=${extent.row.ledger_id}`,
        `grain_ledger_id=${grain.row.ledger_id}`,
        "source_id=nyc_dot_flatbush_installation_begins_2025",
        "source_block=p001_b0019",
        "submission_id=sub_f2926644a2bc184a",
        `occurrence_row_sha256=${occurrence.sha256}`,
        `treatment_row_sha256=${treatment.sha256}`,
      ],
      evidence_verdict: "positive_grain_not_applicable_proposed",
      proposed_extent_decision: null,
      proposed_grain_decision: proposedGrain,
      persisted_extent_decision: null,
      persisted_grain_decision: null,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
    };
  },
);
if (
  sortedHash(candidates.map((row) => row.candidate_key)) !==
    PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256
) {
  throw new Error("Package 12 exact candidate scope drifted");
}

const evidence = {
  schema_version: 1,
  manifest_id: PLAN040_FLATBUSH_PHYSICAL_GRAIN_PACKAGE_12,
  candidate_count: 2,
  route_count: 2,
  candidate_key_sha256: PLAN040_PACKAGE_12_CANDIDATE_KEY_SHA256,
  candidates,
  immutable_inputs: PLAN040_PACKAGE_12_GLOBAL_PINS,
  source_packet_state: {
    raw_source_path: absentRawSourceRelative,
    raw_source_packet_present: false,
    accepted_submission_journal_frozen: true,
    canonical_evidence_ref_frozen: true,
    source_gap_requires_dual_independent_review: true,
  },
  evidence_verdict_distribution: {
    positive_grain_not_applicable_proposed: 2,
  },
  proposed_grain_distribution: { not_applicable: 2 },
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
  external_acquisition_performed: false,
  authorization_state:
    "evidence_only_no_gate_no_acceptance_no_persistence",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
} satisfies JsonValue;

writeStable(evidenceRelative, evidence);
const evidenceSha256 = sha256(stableBytes(evidence));
const draft = buildPlan040Package12Draft({
  evidenceManifestPath: evidenceRelative,
  evidenceManifestSha256: evidenceSha256,
  candidates,
});
writeStable(draftRelative, draft as unknown as JsonValue);

console.log(JSON.stringify({
  evidence: evidenceRelative,
  evidence_sha256: evidenceSha256,
  draft: draftRelative,
  draft_sha256: sha256(stableBytes(draft as unknown as JsonValue)),
  check_only: checkOnly,
}));
