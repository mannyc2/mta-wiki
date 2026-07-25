import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  fullStopPatternsForDate,
  type HistoricalFullStopPattern,
} from "../src/reference/historical-full-stop.js";
import { loadGtfsStaticSnapshot } from "../src/reference/gtfs-static.js";
import {
  loadOperationalSnapshotRegistry,
  snapshotById,
} from "../src/reference/snapshot-registry.js";
import {
  PLAN040_PACKAGE_15_BASE_CHECKPOINT_COMMIT,
  PLAN040_PACKAGE_15_CANDIDATE_COUNT,
  PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_15_DISCOVERY_SHA256,
  PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT,
  PLAN040_PACKAGE_15_PARTITIONS,
  PLAN040_PACKAGE_15_POSITIVE_COUNT,
  PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256,
  PLAN040_PACKAGE_15_Q89_AFFIRM_POSITIVE_KEY_SHA256,
  PLAN040_PACKAGE_15_Q89_AFFIRM_SOURCE_GAP_KEY_SHA256,
  PLAN040_PACKAGE_15_Q89_CANDIDATE_KEY,
  PLAN040_PACKAGE_15_SOURCE_GAP_COUNT,
  PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256,
  PLAN040_PACKAGE_15_SOURCE_REPORT_SHA256,
  buildPlan040Package15Evidence,
  plan040Package15RowHash,
  plan040Package15SortedHash,
  validatePlan040Package15Discovery,
  writePlan040Package15ImmutableNormalFile,
  type Plan040Package15Candidate,
  type Plan040Package15Discovery,
  type Plan040Package15Partition,
} from "../src/quality/plan040-accelerated-package15.js";

const checkOnly = process.argv.includes("--check");
const seedPathArgument = process.argv.find((argument) =>
  argument.startsWith("--seed-discovery=")
)?.slice("--seed-discovery=".length);
const outputRootArgument = process.argv.find((argument) =>
  argument.startsWith("--output-root=")
)?.slice("--output-root=".length);
const artifactRoot =
  outputRootArgument === undefined ? repoRoot : resolve(outputRootArgument);
const receiptRoot =
  "data/quality/acquisition/receipts/member-extent-evidence";
const riskRoot =
  "data/quality/operational-reference/member-extent-risk";
const paths = {
  discovery:
    `${receiptRoot}/plan-040-accelerated-package-15-discovery-receipt-v1.json`,
  program:
    `${receiptRoot}/plan-040-accelerated-package-15-program-applicability-15-v1.json`,
  exactChains:
    `${receiptRoot}/plan-040-accelerated-package-15-qbnr-exact-chain-2-v1.json`,
  fullStopChains:
    `${receiptRoot}/plan-040-accelerated-package-15-qbnr-full-stop-chains-v1.json`,
  inventoryGaps:
    `${receiptRoot}/plan-040-accelerated-package-15-inventory-source-gap-12-v1.json`,
  sourceGaps:
    `${receiptRoot}/plan-040-accelerated-package-15-source-gap-overlays-v1.json`,
  currentFreeze:
    `${receiptRoot}/plan-040-accelerated-package-15-current-freeze-state-v1.json`,
  evidence:
    `${riskRoot}/plan-040-accelerated-package-15-evidence-v1.json`,
  draft:
    `${riskRoot}/plan-040-accelerated-package-15-evidence-draft-v1.json`,
} as const;
const trackedInputs = {
  extentLedger:
    "data/quality/operational-reference/member-extent-ledger.jsonl",
  grainLedger:
    "data/quality/operational-reference/member-grain-ledger.jsonl",
  routes: "data/canonical/routes.jsonl",
  treatments: "data/canonical/treatment_components.jsonl",
  occurrenceDecisions:
    "data/exports/releases/v1-rc26/operational_occurrence_review_decisions.json",
  physicalityDecisions:
    "data/contracts/occurrence-treatment-physicality/v1/releases/v1-rc26/review-ledger.jsonl",
  snapshotRegistry: "data/reference/operational/snapshots.json",
  historicalAcquisition:
    "data/quality/operational-reference/historical-full-stop/acquisition-manifest.json",
  package10bEvidence:
    "data/quality/operational-reference/member-extent-risk/plan-040-qbnr-service-pattern-package-10b-evidence-v1.json",
  package11PositivePatterns:
    "data/quality/acquisition/receipts/member-extent-evidence/plan-040-qbnr-service-grain-package-11-positive-patterns-v1.json",
  package13Evidence:
    "data/quality/operational-reference/member-extent-risk/plan-040-qbnr-bus-stop-package-13-evidence-v1.json",
  acePriorReceipt:
    "data/quality/acquisition/receipts/ace-may2025-two-cohort-implementation.json",
} as const;

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const stableBytes = (value: JsonValue): string => `${stableJson(value)}\n`;
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as T;
const readJsonl = (path: string): JsonValue[] =>
  readFileSync(join(repoRoot, path), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonValue);
const record = (value: JsonValue): Record<string, JsonValue> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object");
  }
  return value as Record<string, JsonValue>;
};
const keyForLedgerRow = (value: JsonValue): string => {
  const row = record(value);
  return `${String(row.occurrence_id)}\0${String(row.route_record_id)}\0${
    String(row.treatment_record_id)
  }`;
};
const recordId = (value: JsonValue): string =>
  String(record(value).record_id);
const artifactPath = (path: string): string => join(artifactRoot, path);
const ensureParent = (path: string): void =>
  mkdirSync(dirname(artifactPath(path)), { recursive: true });
const writeStable = (path: string, value: JsonValue): void => {
  const absolute = artifactPath(path);
  const bytes = stableBytes(value);
  if (checkOnly) {
    if (!existsSync(absolute) || readFileSync(absolute, "utf8") !== bytes) {
      throw new Error(`Deterministic replay drifted: ${path}`);
    }
    return;
  }
  ensureParent(path);
  writeFileSync(absolute, bytes);
};
const writeImmutable = (path: string, value: JsonValue): void => {
  ensureParent(path);
  writePlan040Package15ImmutableNormalFile(
    artifactPath(path),
    value,
    checkOnly,
  );
};
const assertNormalFile = (path: string): void => {
  const stat = lstatSync(artifactPath(path));
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${path}: expected immutable normal file`);
  }
};
const filePin = (path: string): JsonValue => {
  const bytes = readFileSync(join(repoRoot, path));
  return { path, sha256: sha256(bytes), size_bytes: bytes.byteLength };
};

type SourceReportCandidate = {
  candidate_key: string;
  gtfs_route_id: string;
  extent_row_sha256: string;
  grain_row_sha256: string;
  proposed_extent?: JsonValue;
  proposed_grain?: JsonValue;
  terminal_verdict?: string;
  [key: string]: JsonValue | undefined;
};
type SourceReportPartition = {
  name: string;
  candidate_count: number;
  candidate_key_sha256: string;
  candidates: SourceReportCandidate[];
  [key: string]: JsonValue;
};
type SourceReport = {
  schema_version: number;
  report_id: string;
  scope_reconciliation: {
    final_residual_29: {
      candidate_count: number;
      candidate_key_sha256: string;
    };
  };
  proposed_distribution: JsonValue;
  subpartitions: SourceReportPartition[];
  authority: JsonValue;
};

const extentRows = new Map(
  readJsonl(trackedInputs.extentLedger).map((row) => [keyForLedgerRow(row), row]),
);
const grainRows = new Map(
  readJsonl(trackedInputs.grainLedger).map((row) => [keyForLedgerRow(row), row]),
);
const routeRows = new Map(
  readJsonl(trackedInputs.routes).map((row) => [recordId(row), row]),
);
const treatmentRows = new Map(
  readJsonl(trackedInputs.treatments).map((row) => [recordId(row), row]),
);
const occurrenceExport = readJson<{
  decisions: JsonValue[];
}>(trackedInputs.occurrenceDecisions);
const occurrenceRows = new Map(
  occurrenceExport.decisions.map((row) => [
    String(record(row).occurrence_id),
    row,
  ]),
);
const physicalityRows = new Map(
  readJsonl(trackedInputs.physicalityDecisions).map((row) => [
    String(record(row).treatment_record_id),
    row,
  ]),
);

const partitionName = (reportName: string): Plan040Package15Partition => {
  for (const [name, expected] of Object.entries(
    PLAN040_PACKAGE_15_PARTITIONS,
  )) {
    if (expected.report_name === reportName) {
      return name as Plan040Package15Partition;
    }
  }
  throw new Error(`Unknown Package 15 source partition ${reportName}`);
};
const exactRouteBindings = (
  occurrenceDecision: JsonValue,
  routeRecordId: string,
): JsonValue[] => {
  const routes = record(occurrenceDecision).routes;
  if (!Array.isArray(routes)) return [];
  const route = routes.find((value) => {
    const candidate = record(value);
    return String(candidate.route_record_id) === routeRecordId;
  });
  if (route === undefined) return [];
  const bindings = record(route).evidence_bindings;
  return Array.isArray(bindings) ? bindings : [];
};
const missingRolesForGap = (terminalVerdict: string): string[] => {
  const code = terminalVerdict.replace(/^blocked_upstream:/u, "");
  const explicit: Record<string, string[]> = {
    missing_staged_source_bytes_mta_ace_routes_may2025_cut: [
      "staged_source_bytes",
      "candidate_specific_source_replay",
    ],
    q14_exact_q23_q38_segment_attribution_and_schedule_validation_unavailable: [
      "exact_predecessor_segment_attribution",
      "schedule_trip_type_validation",
    ],
    q39_candidate_schedule_trip_type_validation_unavailable: [
      "schedule_trip_type_validation",
    ],
    q58_exact_limited_variant_and_schedule_validation_unavailable: [
      "exact_limited_variant_identity",
      "schedule_trip_type_validation",
    ],
    q67_corrected_first_week_full_stop_inventory_unavailable: [
      "corrected_first_week_full_stop_inventory",
      "corrected_first_week_diff",
    ],
    q67_corrected_first_week_full_stop_and_stop_id_equivalence_unavailable: [
      "corrected_first_week_full_stop_inventory",
      "exact_stop_id_equivalence",
      "corrected_first_week_diff",
    ],
    qm34_onset_outside_pinned_feed_window_and_peak_schedule_inventory_unavailable: [
      "effective_date_full_stop_inventory",
      "peak_schedule_inventory",
    ],
    qm34_onset_outside_pinned_feed_window_and_stop_id_equivalence_unavailable: [
      "effective_date_full_stop_inventory",
      "exact_stop_id_equivalence",
    ],
  };
  return explicit[code] ?? [code];
};

const positiveProposal = (
  partition: Plan040Package15Partition,
  source: SourceReportCandidate,
): JsonValue => {
  if (partition === "programApplicability15") {
    const [, , treatmentId] = source.candidate_key.split("\0");
    const b12 =
      treatmentId ===
        "treatment_b12-deliberate-proactive-service-management";
    return {
      extent_resolution: "route_wide",
      extent_components: [{
        identity_namespace: "gtfs_route_id",
        identifiers: [source.gtfs_route_id],
      }],
      grain_scope: { kind: b12 ? "not_applicable" : "all_service" },
      positive_basis: b12
        ? [
          "accepted_occurrence_route_member",
          "accepted_nonphysical_service_management_classification",
          "no_distinct_trip_selector",
        ]
        : [
          "accepted_occurrence_route_member",
          "source_stated_selected_pilot_routes",
          "whole_route_fare_policy_applicability",
        ],
    };
  }
  if (
    source.proposed_extent === undefined ||
    source.proposed_grain === undefined
  ) {
    throw new Error(`${source.candidate_key}: exact-chain proposal missing`);
  }
  return {
    extent: source.proposed_extent,
    grain_scope: source.proposed_grain,
    positive_basis: source.gtfs_route_id === "Q89"
      ? [
        "candidate_specific_source_statement",
        "published_launch_complete_ordered_full_stop_chains",
        "route_level_passenger_schedule_validation_with_explicit_shape_mismatch",
        "dual_review_required_before_acceptance",
      ]
      : [
        "candidate_specific_source_statement",
        "published_launch_complete_ordered_full_stop_chain",
        "exact_schedule_shape_and_trip_type_validation",
      ],
  };
};

const buildCandidate = (
  partition: Plan040Package15Partition,
  source: SourceReportCandidate,
): Plan040Package15Candidate => {
  const [occurrenceId, routeId, treatmentId] =
    source.candidate_key.split("\0");
  if (
    occurrenceId === undefined ||
    routeId === undefined ||
    treatmentId === undefined
  ) {
    throw new Error(`${source.candidate_key}: invalid candidate key`);
  }
  const extentRow = extentRows.get(source.candidate_key);
  const grainRow = grainRows.get(source.candidate_key);
  const routeRow = routeRows.get(routeId);
  const treatmentRow = treatmentRows.get(treatmentId);
  const occurrenceDecision = occurrenceRows.get(occurrenceId);
  const physicalityDecision = physicalityRows.get(treatmentId) ?? null;
  if (
    extentRow === undefined ||
    grainRow === undefined ||
    routeRow === undefined ||
    treatmentRow === undefined ||
    occurrenceDecision === undefined
  ) {
    throw new Error(`${source.candidate_key}: immutable input missing`);
  }
  if (
    plan040Package15RowHash(extentRow) !== source.extent_row_sha256 ||
    plan040Package15RowHash(grainRow) !== source.grain_row_sha256
  ) {
    throw new Error(`${source.candidate_key}: discovery ledger hash drifted`);
  }
  if (
    String(record(extentRow).verdict) !== "unreviewed" ||
    String(record(grainRow).verdict) !== "unreviewed"
  ) {
    throw new Error(
      `${source.candidate_key}: Package 15 candidate is no longer unreviewed on both ledgers`,
    );
  }
  const q89ConservativeBlock =
    source.candidate_key === PLAN040_PACKAGE_15_Q89_CANDIDATE_KEY;
  const positive =
    partition !== "inventorySourceGap12" && !q89ConservativeBlock;
  const treatmentEvidence = record(treatmentRow).evidence_refs;
  const terminalVerdict = source.terminal_verdict;
  return {
    candidate_key: source.candidate_key,
    gtfs_route_id: source.gtfs_route_id,
    partition,
    proposed_verdict: positive
      ? "positive_extent_and_grain"
      : "source_gap_blocked_extent_and_grain",
    canonical_route: routeRow,
    canonical_route_row_sha256: plan040Package15RowHash(routeRow),
    canonical_treatment: treatmentRow,
    canonical_treatment_row_sha256:
      plan040Package15RowHash(treatmentRow),
    current_extent_row: extentRow,
    current_extent_row_sha256: source.extent_row_sha256,
    current_grain_row: grainRow,
    current_grain_row_sha256: source.grain_row_sha256,
    occurrence_decision: occurrenceDecision,
    occurrence_decision_id:
      String(record(occurrenceDecision).decision_id),
    occurrence_decision_row_sha256:
      plan040Package15RowHash(occurrenceDecision),
    physicality_decision: physicalityDecision,
    physicality_decision_row_sha256:
      physicalityDecision === null
        ? null
        : plan040Package15RowHash(physicalityDecision),
    exact_route_bindings:
      exactRouteBindings(occurrenceDecision, routeId),
    exact_treatment_evidence_refs:
      Array.isArray(treatmentEvidence) ? treatmentEvidence : [],
    proposed_positive_decisions:
      positive ? positiveProposal(partition, source) : null,
    proposed_source_gap_overlay: positive
      ? null
      : q89ConservativeBlock
      ? {
        contract_id: "member-source-gap-overlay-v1",
        candidate_key: source.candidate_key,
        blocked_surfaces: ["member_extent", "member_grain"],
        missing_roles: [
          "exact_schedule_to_gtfs_shape_identity",
          "exact_candidate_pattern_revenue_trip_validation",
        ],
        verdict:
          "blocked_upstream:exact_schedule_to_gtfs_shape_identity+exact_candidate_pattern_revenue_trip_validation",
        rationale:
          "The accepted GTFS bytes prove two complete same-trip stop chains, but passenger schedule shapes Q890020/Q890021 do not join GTFS shapes Q890011/Q890016. Route-level passenger counts and headsigns cannot substitute for a candidate-specific schedule-to-GTFS passenger-trip join under the exact-positive requirement.",
      }
      : {
          contract_id: "member-source-gap-overlay-v1",
          candidate_key: source.candidate_key,
          blocked_surfaces: ["member_extent", "member_grain"],
          missing_roles: missingRolesForGap(String(terminalVerdict)),
          verdict: terminalVerdict,
          rationale:
            "Candidate-specific evidence exists, but the exact-positive prerequisite remains unsatisfied; preserve a terminal nonabsence block.",
      },
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
};

const buildDiscovery = (sourceReport: SourceReport): Plan040Package15Discovery => {
  if (
    sourceReport.scope_reconciliation.final_residual_29.candidate_count !==
      PLAN040_PACKAGE_15_CANDIDATE_COUNT ||
    sourceReport.scope_reconciliation.final_residual_29
        .candidate_key_sha256 !== PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256
  ) {
    throw new Error("Source discovery report residual scope drifted");
  }
  const candidates: Plan040Package15Candidate[] = [];
  const partitions = {} as Plan040Package15Discovery["exact_scope"]["partitions"];
  for (const sourcePartition of sourceReport.subpartitions) {
    const partition = partitionName(sourcePartition.name);
    const expected = PLAN040_PACKAGE_15_PARTITIONS[partition];
    const partitionCandidates = sourcePartition.candidates.map((candidate) =>
      buildCandidate(partition, candidate)
    );
    if (
      sourcePartition.candidate_count !== expected.count ||
      sourcePartition.candidate_key_sha256 !== expected.key_sha256 ||
      plan040Package15SortedHash(
          partitionCandidates.map((row) => row.candidate_key),
        ) !== expected.key_sha256
    ) {
      throw new Error(`${partition}: source report partition drifted`);
    }
    candidates.push(...partitionCandidates);
    partitions[partition] = {
      candidate_count: expected.count,
      candidate_key_sha256: expected.key_sha256,
      candidate_keys: partitionCandidates.map((row) => row.candidate_key),
      positive_count: expected.positive_count,
      source_gap_count: expected.source_gap_count,
    };
  }
  const positives = candidates.filter((row) =>
    row.proposed_verdict === "positive_extent_and_grain"
  );
  const sourceGaps = candidates.filter((row) =>
    row.proposed_verdict === "source_gap_blocked_extent_and_grain"
  );
  const exactChain = sourceReport.subpartitions.find((row) =>
    row.name === "qbnr-exact-chain-2"
  );
  const inventoryGaps = sourceReport.subpartitions.find((row) =>
    row.name === "inventory-source-gap-12"
  );
  if (exactChain === undefined || inventoryGaps === undefined) {
    throw new Error("Source report lacks Package 15 risk partitions");
  }
  return {
    schema_version: 1,
    report_id: "plan-040-accelerated-package-15-discovery-receipt-v1",
    source_report: {
      path_not_persisted: "/tmp/plan040-final-residual29-discovery-report.json",
      sha256: PLAN040_PACKAGE_15_SOURCE_REPORT_SHA256,
      report_id: sourceReport.report_id,
      classification:
        "independent_read_only_discovery_ingested_once_then_frozen_as_normal_file",
    },
    base_checkpoint_commit: PLAN040_PACKAGE_15_BASE_CHECKPOINT_COMMIT,
    exact_scope: {
      candidate_count: candidates.length,
      candidate_key_sha256:
        plan040Package15SortedHash(candidates.map((row) => row.candidate_key)),
      candidate_keys: candidates.map((row) => row.candidate_key),
      positive_candidate_count: positives.length,
      positive_candidate_key_sha256:
        plan040Package15SortedHash(positives.map((row) => row.candidate_key)),
      terminal_source_gap_count: sourceGaps.length,
      terminal_source_gap_key_sha256:
        plan040Package15SortedHash(sourceGaps.map((row) => row.candidate_key)),
      actual_absence_count: 0,
      partitions,
    },
    candidate_details: candidates,
    qbnr_exact_chain_findings: exactChain as unknown as JsonValue,
    inventory_source_gap_findings: inventoryGaps as unknown as JsonValue,
    q89_review_outcome_matrix: {
      selected_outcome: "downgrade_only_q89_to_blocked_upstream",
      candidate_specific_schedule_gtfs_passenger_join_proven: false,
      unchanged_scope: {
        candidate_count: PLAN040_PACKAGE_15_CANDIDATE_COUNT,
        candidate_key_sha256: PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
      },
      affirm_positive: {
        reviewer_verdict:
          "counterfactual_requires_new_candidate_specific_schedule_gtfs_passenger_join",
        condition_met_in_frozen_evidence: false,
        changed_candidate_key: PLAN040_PACKAGE_15_Q89_CANDIDATE_KEY,
        positive_count: 17,
        source_gap_count: 12,
        exact_absence_count: 0,
        positive_key_sha256:
          PLAN040_PACKAGE_15_Q89_AFFIRM_POSITIVE_KEY_SHA256,
        source_gap_key_sha256:
          PLAN040_PACKAGE_15_Q89_AFFIRM_SOURCE_GAP_KEY_SHA256,
        required_finding:
          "New frozen evidence proves a candidate-specific passenger-trip join between the schedule and the exact GTFS patterns without shape or route inference.",
      },
      downgrade_only_q89: {
        reviewer_verdict:
          "schedule_to_gtfs_shape_mismatch_prevents_exact_revenue_trip_validation",
        changed_candidate_key: PLAN040_PACKAGE_15_Q89_CANDIDATE_KEY,
        condition_met_in_frozen_evidence: true,
        positive_count: PLAN040_PACKAGE_15_POSITIVE_COUNT,
        source_gap_count: PLAN040_PACKAGE_15_SOURCE_GAP_COUNT,
        exact_absence_count: 0,
        positive_key_sha256: PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256,
        source_gap_key_sha256: PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256,
        proposed_source_gap_overlay: {
          contract_id: "member-source-gap-overlay-v1",
          candidate_key: PLAN040_PACKAGE_15_Q89_CANDIDATE_KEY,
          blocked_surfaces: ["member_extent", "member_grain"],
          missing_roles: [
            "exact_schedule_to_gtfs_shape_identity",
            "exact_candidate_pattern_revenue_trip_validation",
          ],
          verdict:
            "blocked_upstream:exact_schedule_to_gtfs_shape_identity+exact_candidate_pattern_revenue_trip_validation",
          rationale:
            "The frozen GTFS bytes prove complete same-trip chains, but the passenger schedule shapes do not join those GTFS shapes. Route-level passenger counts and headsigns are nonauthorizing under the exact-positive requirement, so Q89 remains blocked.",
        },
      },
    },
    immutable_inputs: Object.fromEntries(
      Object.entries(trackedInputs).map(([name, path]) => [name, filePin(path)]),
    ),
    semantic_corrections: {
      required_projection:
        "member-source-gap-overlay-v1 with blocked_upstream verdict on both surfaces",
      prohibited_projection:
        "absent_in_source or inferred positive extent/grain for a terminal source gap",
      terminal_receipts_are_not_actual_absences: true,
      q89_schedule_shape_mismatch_requires_explicit_review: true,
    },
    version_separation: {
      published_launch_diff: {
        queens_pre_sha1: "c96466458c55036cd6feeadc291bf5951d6c3274",
        queens_post_initial_sha1:
          "c868290ddcd79c69712d809ece96d96dbad2c613",
        busco_pre_sha1: "a52f278150cd9bc03082f76fccd57f1c8c331d3c",
        busco_post_initial_sha1:
          "54653b3fafb5fabc5ab1c941780b871343138440",
      },
      corrected_first_week_diff: {
        queens_correction_sha1:
          "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f",
        busco_correction_sha1:
          "a35da13d0a8c311de05d3558e9e80d2a472c21d2",
        correction_bytes_used: false,
        comparison_run: false,
        published_launch_outcomes_reclassified: false,
      },
      q67_correction_sensitivity:
        record(inventoryGaps as unknown as JsonValue).q67_correction_sensitivity ??
          null,
    },
    review_protocol: {
      mode: "dual_independent_risk_review_one_frozen_29_candidate_package",
      reasons: [
        "Q89 unmatched schedule-to-GTFS shapes",
        "Q67 correction sensitivity",
        "candidate-specific source gaps",
        "exact stop-set and bounded-segment proposals",
      ],
      one_owner_acceptance_after_dual_approve: true,
    },
    authority: {
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
    },
  };
};

if (!existsSync(artifactPath(paths.discovery))) {
  if (checkOnly || seedPathArgument === undefined) {
    throw new Error(
      "Package 15 discovery receipt missing; provide --seed-discovery=<verified report>",
    );
  }
  const seedPath = resolve(seedPathArgument);
  const seedBytes = readFileSync(seedPath);
  if (sha256(seedBytes) !== PLAN040_PACKAGE_15_SOURCE_REPORT_SHA256) {
    throw new Error("Package 15 source discovery report SHA drifted");
  }
  const sourceReport = JSON.parse(seedBytes.toString("utf8")) as SourceReport;
  writeImmutable(
    paths.discovery,
    buildDiscovery(sourceReport) as unknown as JsonValue,
  );
}
assertNormalFile(paths.discovery);
const discoveryBytes = readFileSync(artifactPath(paths.discovery));
if (
  PLAN040_PACKAGE_15_DISCOVERY_SHA256 !==
    "PENDING_POST_PACKAGE_14_REPIN" &&
  sha256(discoveryBytes) !== PLAN040_PACKAGE_15_DISCOVERY_SHA256
) {
  throw new Error("Package 15 discovery receipt SHA drifted");
}
const discovery = JSON.parse(
  discoveryBytes.toString("utf8"),
) as Plan040Package15Discovery;
validatePlan040Package15Discovery(discovery);
writeImmutable(paths.discovery, discovery as unknown as JsonValue);

const registry = loadOperationalSnapshotRegistry();
const postSnapshot = loadGtfsStaticSnapshot(
  snapshotById(registry, "gtfs-static-20250626-queens-post-qbnr"),
  ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
  repoRoot,
  new Set(["Q89", "QM68", "Q67"]),
);
const q89Patterns = fullStopPatternsForDate(
  postSnapshot,
  "2025-06-29",
  "Q89",
);
const qm68Patterns = fullStopPatternsForDate(
  postSnapshot,
  "2025-06-30",
  "QM68",
);
const q67June29 = fullStopPatternsForDate(
  postSnapshot,
  "2025-06-29",
  "Q67",
);
const q67June30 = fullStopPatternsForDate(
  postSnapshot,
  "2025-06-30",
  "Q67",
);
const patternInventory = (pattern: HistoricalFullStopPattern): JsonValue => ({
  pattern_id: pattern.pattern_id,
  snapshot_id: pattern.snapshot_id,
  service_date: pattern.service_date,
  route_id: pattern.route_id,
  direction_id: pattern.direction_id,
  trip_count: pattern.trip_count,
  trip_ids_sha256:
    sha256(`${[...pattern.trip_ids].sort().join("\n")}\n`),
  shape_ids: pattern.shape_ids,
  headsigns: pattern.headsigns,
  period_trip_counts: pattern.period_trip_counts,
  stop_count: pattern.stops.length,
  stop_ids: pattern.stops.map((stop) => stop.stop_id),
  stops: pattern.stops,
  stop_chain_sha256:
    sha256(`${pattern.stops.map((stop) => stop.stop_id).join("\n")}\n`),
});
const fullStopChains: JsonValue = {
  schema_version: 1,
  receipt_id:
    "plan-040-accelerated-package-15-qbnr-full-stop-chains-v1",
  snapshot_id: "gtfs-static-20250626-queens-post-qbnr",
  source_id: "gtfs_static_20250626_queens_post_qbnr",
  source_zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613",
  version_role: "published_launch_diff",
  calendar_policy: "calendar_plus_calendar_dates",
  exact_identifier_policy:
    "identical_stop_id_within_published_launch_feed_no_name_coordinate_or_proximity_equivalence",
  revenue_validation_policy:
    "exclude_schedule_trip_type_2_3_4; unmatched_schedule_to_gtfs_shapes_remain_explicit_review_risk",
  q89: {
    service_date: "2025-06-29",
    same_trip_chain_evidence: {
      construction:
        "calendar-expanded active GTFS trips grouped by exact trip_id; each trip's stop_times are ordered by stop_sequence, and only identical complete chains are collapsed into a pattern",
      exact_gtfs_trip_id_join: true,
      schedule_trip_id_or_shape_join: false,
      direction_0_trip_count: 39,
      direction_1_trip_count: 39,
      evidentiary_role:
        "authoritative complete ordered stop-chain evidence independent of schedule validation",
    },
    patterns: q89Patterns.map(patternInventory),
    required_pattern_ids: [
      "historical-full-stop-pattern:56794d8fd80ba7587fd75ac2",
      "historical-full-stop-pattern:00fc45f5cac25a0b59b8c526",
    ],
    source_bounded_segment_stop_ids: {
      direction_0: ["500507", "500509", "500512", "504462", "500430"],
      direction_1: ["500369", "500372", "505313", "500454", "500543"],
    },
    schedule_validation: {
      source_id: "mta_bus_schedules_2025_candidate_windows",
      source_sha256:
        "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5",
      route_row_count: 669,
      retained_trip_types: ["1"],
      retained_stop_time_row_count: 585,
      retained_trip_start_count: 78,
      passenger_shape_ids: ["Q890020", "Q890021"],
      passenger_shape_rows: [
        { shape_id: "Q890020", stop_time_row_count: 312, trip_start_count: 39 },
        { shape_id: "Q890021", stop_time_row_count: 273, trip_start_count: 39 },
      ],
      excluded_trip_types: ["2", "3"],
      excluded_stop_time_row_counts: { "2": 42, "3": 42 },
      gtfs_shape_ids: ["Q890011", "Q890016"],
      shape_identity_matches: false,
      trip_count_matches_at_route_level: true,
      review_disposition:
        "route-level passenger validation only; exact GTFS chain proposal requires explicit dual-review approval",
    },
    acceptable_reviewer_outcomes:
      discovery.q89_review_outcome_matrix,
  },
  qm68: {
    service_date: "2025-06-30",
    patterns: qm68Patterns.map(patternInventory),
    required_pattern_id:
      "historical-full-stop-pattern:35a96e78cae2946e256c8fff",
    exact_midtown_stop_ids: [
      "402144",
      "402146",
      "404295",
      "404877",
      "404297",
      "404298",
      "450041",
      "404300",
      "904045",
    ],
    schedule_validation: {
      source_id: "mta_bus_schedules_2025_candidate_windows",
      shape_id: "QM680040",
      trip_type: "13",
      trip_start_count: 11,
      stop_time_row_count: 55,
      retained_trip_types: ["13"],
      retained_stop_time_row_count: 105,
      retained_trip_start_count: 21,
      excluded_trip_types: ["2", "3", "4"],
      excluded_stop_time_row_counts: { "2": 38, "3": 42, "4": 20 },
      shape_identity_matches: true,
    },
  },
  q67_published_launch_sensitivity: {
    service_date_2025_06_29_pattern_count: q67June29.length,
    service_date_2025_06_30_pattern_count: q67June30.length,
    initial_post_positive_inventory: false,
    correction_bytes_used: false,
    correction_comparison_run: false,
  },
  corrected_first_week_diff_used: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const q89 = record(record(fullStopChains).q89 as JsonValue);
const q89PatternRows = q89.patterns;
if (
  !Array.isArray(q89PatternRows) ||
  plan040Package15SortedHash(
      q89PatternRows.map((row) => String(record(row).pattern_id)),
    ) !== plan040Package15SortedHash([
    "historical-full-stop-pattern:56794d8fd80ba7587fd75ac2",
    "historical-full-stop-pattern:00fc45f5cac25a0b59b8c526",
  ])
) {
  throw new Error("Q89 complete ordered full-stop inventory drifted");
}
if (
  q67June29.length !== 0 ||
  q67June30.length !== 0 ||
  qm68Patterns.length !== 2 ||
  !qm68Patterns.some((pattern) =>
    pattern.pattern_id ===
      "historical-full-stop-pattern:35a96e78cae2946e256c8fff"
  )
) {
  throw new Error("Package 15 QBNR exact-chain/sensitivity evidence drifted");
}
writeImmutable(paths.fullStopChains, fullStopChains);

const makePartitionReceipt = (
  partition: Plan040Package15Partition,
): JsonValue => {
  const candidates = discovery.candidate_details.filter((row) =>
    row.partition === partition
  );
  return {
    schema_version: 1,
    receipt_id: `plan-040-accelerated-package-15-${partition}-v1`,
    partition,
    candidate_count: candidates.length,
    candidate_key_sha256:
      plan040Package15SortedHash(candidates.map((row) => row.candidate_key)),
    positive_count: candidates.filter((row) =>
      row.proposed_verdict === "positive_extent_and_grain"
    ).length,
    source_gap_count: candidates.filter((row) =>
      row.proposed_verdict === "source_gap_blocked_extent_and_grain"
    ).length,
    exact_absence_count: 0,
    candidates: candidates.map((row) => ({
      candidate_key: row.candidate_key,
      gtfs_route_id: row.gtfs_route_id,
      proposed_verdict: row.proposed_verdict,
      occurrence_decision_id: row.occurrence_decision_id,
      occurrence_decision_row_sha256: row.occurrence_decision_row_sha256,
      physicality_decision_row_sha256:
        row.physicality_decision_row_sha256,
      canonical_route_row_sha256: row.canonical_route_row_sha256,
      canonical_treatment_row_sha256:
        row.canonical_treatment_row_sha256,
      current_extent_row_sha256: row.current_extent_row_sha256,
      current_grain_row_sha256: row.current_grain_row_sha256,
      exact_route_bindings: row.exact_route_bindings,
      exact_treatment_evidence_refs: row.exact_treatment_evidence_refs,
      exact_candidate_searches: [
        `candidate_key=${row.candidate_key}`,
        `occurrence_decision_id=${row.occurrence_decision_id} row_sha256=${row.occurrence_decision_row_sha256}`,
        `canonical_route_row_sha256=${row.canonical_route_row_sha256}`,
        `canonical_treatment_row_sha256=${row.canonical_treatment_row_sha256}`,
        `current_extent_row_sha256=${row.current_extent_row_sha256}`,
        `current_grain_row_sha256=${row.current_grain_row_sha256}`,
        ...row.exact_route_bindings.map((binding) =>
          `route_evidence_id=${String(record(binding).evidence_id)}`
        ),
        ...row.exact_treatment_evidence_refs.map((binding) =>
          `treatment_evidence_id=${String(record(binding).evidence_id)}`
        ),
      ],
      proposed_positive_decisions: row.proposed_positive_decisions,
      proposed_source_gap_overlay: row.proposed_source_gap_overlay,
    })),
    full_stop_chain_receipt:
      partition === "qbnrExactChain2"
        ? {
          path: paths.fullStopChains,
          sha256: sha256(stableBytes(fullStopChains)),
        }
        : null,
    review_outcome_matrix:
      partition === "qbnrExactChain2"
        ? discovery.q89_review_outcome_matrix
        : null,
    semantic_guardrail:
      partition === "programApplicability15"
        ? {
          physicality_scope_requirement:
            "The pinned physicality review's not_applicable result forbids physical-corridor inference; it does not erase source-stated whole-route fare-policy applicability.",
          fare_grain:
            "all_service means all service on the exact accepted route member, with no stop, branch, period, or cross-product inference.",
          b12_grain:
            "not_applicable because the accepted service-management program has no distinct trip selector.",
        }
        : null,
    absent_in_source_projection_permitted: false,
    persisted_decision_count: 0,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
};
const programReceipt = makePartitionReceipt("programApplicability15");
const exactChainReceipt = makePartitionReceipt("qbnrExactChain2");
const inventoryGapReceipt = {
  ...record(makePartitionReceipt("inventorySourceGap12")),
  ace_missing_source_bytes: {
    path: "raw/sources/mta_ace_routes_may2025_cut",
    exists: existsSync(
      join(repoRoot, "raw/sources/mta_ace_routes_may2025_cut"),
    ),
    prior_receipt: filePin(trackedInputs.acePriorReceipt),
  },
  q67_correction_sensitivity:
    record(discovery.version_separation).q67_correction_sensitivity ?? null,
};
if (
  record(inventoryGapReceipt.ace_missing_source_bytes as JsonValue).exists !==
    false
) {
  throw new Error(
    "Package 15 ACE missing-source finding changed; stop for reviewed reclassification",
  );
}
const sourceGapCandidates = discovery.candidate_details.filter((row) =>
  row.proposed_verdict === "source_gap_blocked_extent_and_grain"
);
const sourceGapReceipt: JsonValue = {
  schema_version: 1,
  receipt_id: "plan-040-accelerated-package-15-source-gap-overlays-v1",
  overlay_contract: "member-source-gap-overlay-v1",
  candidate_count: sourceGapCandidates.length,
  candidate_key_sha256:
    plan040Package15SortedHash(
      sourceGapCandidates.map((row) => row.candidate_key),
    ),
  blocked_surfaces: ["member_extent", "member_grain"],
  semantic_verdict: "blocked_upstream",
  literal_absence_count: 0,
  absent_in_source_projection_permitted: false,
  candidates: sourceGapCandidates.map((row) => ({
    candidate_key: row.candidate_key,
    exact_route_bindings: row.exact_route_bindings,
    exact_treatment_evidence_refs: row.exact_treatment_evidence_refs,
    source_gap_overlay: row.proposed_source_gap_overlay,
    current_extent_row_sha256: row.current_extent_row_sha256,
    current_grain_row_sha256: row.current_grain_row_sha256,
  })),
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};

writeImmutable(paths.program, programReceipt);
writeImmutable(paths.exactChains, exactChainReceipt);
writeImmutable(
  paths.inventoryGaps,
  inventoryGapReceipt as unknown as JsonValue,
);
writeImmutable(paths.sourceGaps, sourceGapReceipt);

const packageKeys = new Set(discovery.exact_scope.candidate_keys);
const outsideExtentUnreviewed = [...extentRows.entries()]
  .filter(([key, row]) =>
    !packageKeys.has(key) && String(record(row).verdict) === "unreviewed"
  )
  .map(([key]) => key);
const outsideGrainUnreviewed = [...grainRows.entries()]
  .filter(([key, row]) =>
    !packageKeys.has(key) && String(record(row).verdict) === "unreviewed"
  )
  .map(([key]) => key);
const currentFreeze: JsonValue = {
  schema_version: 1,
  receipt_id: "plan-040-accelerated-package-15-current-freeze-state-v1",
  observed_commit: PLAN040_PACKAGE_15_BASE_CHECKPOINT_COMMIT,
  discovery_receipt: {
    path: paths.discovery,
    sha256: sha256(discoveryBytes),
  },
  current_whole_file_pins: Object.fromEntries(
    Object.entries(trackedInputs).map(([name, path]) => [name, filePin(path)]),
  ),
  candidate_current_state: discovery.candidate_details.map((row) => ({
    candidate_key: row.candidate_key,
    current_extent_row_sha256: row.current_extent_row_sha256,
    current_grain_row_sha256: row.current_grain_row_sha256,
    canonical_route_row_sha256: row.canonical_route_row_sha256,
    canonical_treatment_row_sha256:
      row.canonical_treatment_row_sha256,
    occurrence_decision_id: row.occurrence_decision_id,
    occurrence_decision_row_sha256: row.occurrence_decision_row_sha256,
    physicality_decision_row_sha256:
      row.physicality_decision_row_sha256,
  })),
  candidate_count: discovery.candidate_details.length,
  candidate_key_sha256: discovery.exact_scope.candidate_key_sha256,
  candidate_extent_unreviewed_count:
    discovery.candidate_details.filter((row) =>
      String(record(row.current_extent_row).verdict) === "unreviewed"
    ).length,
  candidate_grain_unreviewed_count:
    discovery.candidate_details.filter((row) =>
      String(record(row.current_grain_row).verdict) === "unreviewed"
    ).length,
  outside_package_extent_unreviewed_count: outsideExtentUnreviewed.length,
  outside_package_extent_unreviewed_key_sha256:
    outsideExtentUnreviewed.length === 0
      ? null
      : plan040Package15SortedHash(outsideExtentUnreviewed),
  outside_package_grain_unreviewed_count: outsideGrainUnreviewed.length,
  outside_package_grain_unreviewed_key_sha256:
    outsideGrainUnreviewed.length === 0
      ? null
      : plan040Package15SortedHash(outsideGrainUnreviewed),
  prefinal_repin_required: outputRootArgument !== undefined,
  current_state_verified: true,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
writeImmutable(paths.currentFreeze, currentFreeze);

const refs: Record<string, { path: string; sha256: string }> = {
  discovery: {
    path: paths.discovery,
    sha256: sha256(discoveryBytes),
  },
  program: {
    path: paths.program,
    sha256: sha256(stableBytes(programReceipt)),
  },
  exactChains: {
    path: paths.exactChains,
    sha256: sha256(stableBytes(exactChainReceipt)),
  },
  fullStopChains: {
    path: paths.fullStopChains,
    sha256: sha256(stableBytes(fullStopChains)),
  },
  inventoryGaps: {
    path: paths.inventoryGaps,
    sha256:
      sha256(stableBytes(inventoryGapReceipt as unknown as JsonValue)),
  },
  sourceGaps: {
    path: paths.sourceGaps,
    sha256: sha256(stableBytes(sourceGapReceipt)),
  },
  currentFreeze: {
    path: paths.currentFreeze,
    sha256: sha256(stableBytes(currentFreeze)),
  },
};
const evidence = buildPlan040Package15Evidence(discovery, refs);
writeStable(paths.evidence, evidence);
const draft: JsonValue = {
  schema_version: 1,
  manifest_id: "plan-040-accelerated-package-15-evidence-draft-v1",
  package_id:
    "plan-040-accelerated-package-15-final-residual-evidence-only-v1",
  evidence_manifest: {
    path: paths.evidence,
    sha256: sha256(stableBytes(evidence)),
  },
  candidate_count: PLAN040_PACKAGE_15_CANDIDATE_COUNT,
  candidate_key_sha256: PLAN040_PACKAGE_15_CANDIDATE_KEY_SHA256,
  positive_extent_and_grain_count: PLAN040_PACKAGE_15_POSITIVE_COUNT,
  positive_extent_and_grain_key_sha256:
    PLAN040_PACKAGE_15_POSITIVE_KEY_SHA256,
  source_gap_blocked_extent_and_grain_count:
    PLAN040_PACKAGE_15_SOURCE_GAP_COUNT,
  source_gap_key_sha256: PLAN040_PACKAGE_15_SOURCE_GAP_KEY_SHA256,
  exact_absence_count: PLAN040_PACKAGE_15_EXACT_ABSENCE_COUNT,
  positive_extent_decisions: discovery.candidate_details.flatMap((row) =>
    row.proposed_positive_decisions === null
      ? []
      : [{
        candidate_key: row.candidate_key,
        partition: row.partition,
        proposal: row.proposed_positive_decisions,
      }]
  ),
  positive_grain_decisions: discovery.candidate_details.flatMap((row) =>
    row.proposed_positive_decisions === null
      ? []
      : [{
        candidate_key: row.candidate_key,
        partition: row.partition,
        proposal: row.proposed_positive_decisions,
      }]
  ),
  source_gap_overlays: sourceGapCandidates.map((row) => ({
    candidate_key: row.candidate_key,
    partition: row.partition,
    overlay: row.proposed_source_gap_overlay,
  })),
  q89_review_condition:
    "Q89 is conservatively blocked: exact same-trip GTFS chains do not replace the missing candidate-specific passenger schedule-to-GTFS join. A future positive requires new frozen evidence, not route-level inference.",
  q89_review_outcome_matrix: discovery.q89_review_outcome_matrix,
  persisted_extent_decision_count: 0,
  persisted_grain_decision_count: 0,
  gate_created: false,
  owner_acceptance_created: false,
  persistence_performed: false,
  authorization_state:
    "evidence_frozen_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
writeStable(paths.draft, draft);

console.log(
  `${checkOnly ? "checked" : "wrote"} Plan 040 accelerated Package 15: ` +
    `${PLAN040_PACKAGE_15_CANDIDATE_COUNT} candidates, ` +
    `${PLAN040_PACKAGE_15_POSITIVE_COUNT} proposed positive, ` +
    `${PLAN040_PACKAGE_15_SOURCE_GAP_COUNT} blocked source gaps, ` +
    `${outsideExtentUnreviewed.length}/${outsideGrainUnreviewed.length} ` +
    `outside-package extent/grain unreviewed`,
);
