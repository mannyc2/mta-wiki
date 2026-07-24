import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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
  PLAN040_PACKAGE_11_CANDIDATES,
  PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_11_GLOBAL_PINS,
  PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_11_Q45_PATTERN_IDS,
  PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_11_Q82_PATTERN_IDS,
  PLAN040_PACKAGE_11_Q86_PATTERN_IDS,
  PLAN040_PACKAGE_11_QM68_COMPARISON_IDS,
  PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11,
  buildPlan040Package11Draft,
  type Plan040Package11CandidateEvidence,
  type Plan040Package11Exclusion,
} from "../src/quality/plan040-qbnr-service-grain-package11.js";
import type {
  ExactEvidenceBinding,
  MemberExtentDecision,
} from "../src/quality/study-readiness-v1.js";

const riskRoot = join(
  repoRoot,
  "data/quality/operational-reference/member-extent-risk",
);
const evidenceRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-grain-package-11-evidence-v1.json";
const draftRelative =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-grain-package-11-evidence-draft-v1.json";
const checkOnly = process.argv.includes("--check");

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
const assertPinned = (relative: string, expected: string): void => {
  const actual = sha256(readFileSync(join(repoRoot, relative)));
  if (actual !== expected) {
    throw new Error(`${relative}: expected ${expected}, got ${actual}`);
  }
};
const assertLargePinned = (relative: string, expected: string): void => {
  const result = spawnSync("sha256sum", [join(repoRoot, relative)], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`sha256sum failed for ${relative}: ${result.stderr}`);
  }
  const actual = result.stdout.trim().split(/\s+/u)[0];
  if (actual !== expected) {
    throw new Error(`${relative}: expected ${expected}, got ${actual}`);
  }
};

const pinnedFiles: Array<[string, string]> = [
  [
    "data/quality/operational-reference/member-extent-ledger.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.extent_ledger,
  ],
  [
    "data/quality/operational-reference/member-grain-ledger.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.grain_ledger,
  ],
  [
    "data/quality/study-readiness/v1/bridge-ledger.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.bridge_ledger,
  ],
  [
    "data/quality/study-readiness/v1/manifest.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.study_manifest,
  ],
  [
    "data/contracts/operational-occurrence-member-extent/v1/" +
      "operational_occurrence_member_extents.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.member_extent_contract,
  ],
  [
    "data/contracts/operational-occurrence-member-extent/v1/manifest.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.member_extent_manifest,
  ],
  [
    "data/exports/releases/v1-rc26/" +
      "operational_occurrence_review_decisions.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.occurrence_decisions,
  ],
  [
    "data/canonical/treatment_components.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.treatment_components,
  ],
  ["data/canonical/routes.jsonl", PLAN040_PACKAGE_11_GLOBAL_PINS.routes],
  ["data/canonical/events.jsonl", PLAN040_PACKAGE_11_GLOBAL_PINS.events],
  [
    "raw/sources/mta_queens_bus_network_redesign_service_changes/source.html",
    PLAN040_PACKAGE_11_GLOBAL_PINS.service_change_html,
  ],
  [
    "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.service_change_blocks,
  ],
  [
    "raw/sources/mta_bus_schedules_2025_candidate_windows/receipt.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.schedule_receipt,
  ],
  [
    "raw/sources/mta_bus_schedules_2025_candidate_windows/blocks.jsonl",
    PLAN040_PACKAGE_11_GLOBAL_PINS.schedule_blocks,
  ],
  [
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-10b-evidence-v1.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.package_10b_evidence,
  ],
  [
    "data/quality/acquisition/receipts/member-extent-evidence/" +
      "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.package_10b_full_stop_receipt,
  ],
  [
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-9-evidence-v1.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.package_9_evidence,
  ],
  [
    "raw/sources/gtfs_static_20250615_queens_pre_qbnr/receipt.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.queens_pre_receipt,
  ],
  [
    "raw/sources/gtfs_static_20250626_queens_post_qbnr/receipt.json",
    PLAN040_PACKAGE_11_GLOBAL_PINS.queens_post_receipt,
  ],
];
pinnedFiles.forEach(([path, hash]) => assertPinned(path, hash));
assertLargePinned(
  "raw/sources/mta_bus_schedules_2025_candidate_windows/source.csv",
  PLAN040_PACKAGE_11_GLOBAL_PINS.schedule_csv,
);

type CanonicalRow = Record<string, unknown> & {
  record_id: string;
  payload?: { treatment_family?: string };
};
type SourceBlock = {
  source_id: string;
  block_id: string;
  raw_text: string;
  raw_text_sha256: string;
};
type OccurrenceDecision = Record<string, unknown> & {
  occurrence_id: string;
  resolved_onset?: {
    date?: string;
    evidence_bindings?: Array<{ role: string; record_id: string }>;
  };
};
type Package9Comparison = {
  comparison_id: string;
  before_route_id: string;
  after_route_id: string;
  direction_id: string;
  boundary_stop_ids: [string, string];
  shared_stop_ids: string[];
};

const extentRows = readJsonlWithHashes<MemberExtentLedgerRow>(
  "data/quality/operational-reference/member-extent-ledger.jsonl",
);
const grainRows = readJsonlWithHashes<MemberGrainLedgerRow>(
  "data/quality/operational-reference/member-grain-ledger.jsonl",
);
const treatmentRows = readJsonlWithHashes<CanonicalRow>(
  "data/canonical/treatment_components.jsonl",
);
const routeRows = readJsonlWithHashes<CanonicalRow>("data/canonical/routes.jsonl");
const eventRows = readJsonlWithHashes<CanonicalRow>("data/canonical/events.jsonl");
const sourceBlocks = readJsonlWithHashes<SourceBlock>(
  "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
);
const occurrenceRoot = readJson<JsonValue>(
  "data/exports/releases/v1-rc26/operational_occurrence_review_decisions.json",
);
const package10b = readJson<{
  candidates: Array<{ candidate_key: string; treatment_record_id: string }>;
}>(
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-10b-evidence-v1.json",
);
const package9 = readJson<{
  candidates: Array<{
    treatment_record_id: string;
    ordered_full_stop_evidence?: {
      comparisons: Package9Comparison[];
    };
  }>;
}>(
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-9-evidence-v1.json",
);

function occurrenceDecisions(value: JsonValue): OccurrenceDecision[] {
  if (Array.isArray(value)) return value.flatMap(occurrenceDecisions);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, JsonValue>;
  return [
    ...(
      typeof object.occurrence_id === "string" &&
      typeof object.review_state === "string"
        ? [object as unknown as OccurrenceDecision]
        : []
    ),
    ...Object.values(object).flatMap(occurrenceDecisions),
  ];
}
const occurrenceRows = occurrenceDecisions(occurrenceRoot);
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
const occurrenceOne = (occurrenceId: string) => {
  const matches = occurrenceRows.filter(
    (row) => row.occurrence_id === occurrenceId,
  );
  if (matches.length !== 1) {
    throw new Error(`${occurrenceId}: expected one occurrence decision`);
  }
  const row = matches[0]!;
  return { row, sha256: rowSha256(row) };
};
const sortedBindings = (
  values: ExactEvidenceBinding[],
): ExactEvidenceBinding[] => values.sort((left, right) => [
  left.role, left.record_id, left.source_id, left.evidence_id,
].join("\0").localeCompare([
  right.role, right.record_id, right.source_id, right.evidence_id,
].join("\0")));
const sortedStrings = (values: readonly string[]): string[] =>
  [...values].sort();
const candidateKey = (row: {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
}): string => [
  row.occurrence_id,
  row.route_record_id,
  row.treatment_record_id,
].join("\0");

const metadata = {
  "treatment_q82-limited-stops-2025": {
    block: "p001_b0079",
    verdict: "positive_extent_and_grain_proposed",
  },
  "treatment_q45-all-day-frequent-service-2025": {
    block: "p001_b0050",
    verdict: "positive_grain_only_proposed",
  },
  "treatment_q45-direct-connection-2025": {
    block: "p001_b0050",
    verdict: "positive_grain_only_proposed",
  },
  "treatment_q63-limited-stops-2025": {
    block: "p001_b0066",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q63-northern-boulevard-connection-2025": {
    block: "p001_b0066",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q80-frequency-overnight-service-2025": {
    block: "p001_b0078",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q80-q10-limited-branch-replacement-2025": {
    block: "p001_b0078",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q86-limited-stops-2025": {
    block: "p001_b0083",
    verdict: "positive_grain_only_proposed",
  },
  "treatment_q86-q5-q85-branch-combination-2025": {
    block: "p001_b0083",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q87-limited-stops-2025": {
    block: "p001_b0084",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_q87-q5-green-acres-replacement-2025": {
    block: "p001_b0084",
    verdict: "structured_unresolved_grain_proposed",
  },
  "treatment_qm68-route-rename-2025": {
    block: "p001_b0135",
    verdict: "positive_grain_only_proposed",
  },
} as const;

const scheduleContext: Record<string, JsonValue> = {
  Q45: {
    accepted_snapshot_date: "2025-06-29",
    retained_trip_types: ["1"],
    excluded_trip_types: ["2", "3", "4"],
    passenger_schedule_rows: [
      { direction_id: "0", shape_id: "Q450028", trip_count: 288 },
      { direction_id: "1", shape_id: "Q450023", trip_count: 300 },
    ],
    pattern_ids: [...PLAN040_PACKAGE_11_Q45_PATTERN_IDS],
  },
  Q63: {
    source_statement_date: "2025-06-29",
    accepted_initial_post_pattern_count: 0,
    corrected_version_sha1:
      "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f",
    corrected_bytes_status: "blocked_unavailable",
    published_launch_conflict_resolution_required: true,
  },
  Q80: {
    source_statement_date: "2025-08-31",
    accepted_schedule_window_end: "2025-08-30",
    later_inventory_required: true,
    later_schedule_required: true,
    later_lineage_required: true,
  },
  Q82: {
    accepted_snapshot_date: "2025-06-29",
    retained_trip_types: ["1"],
    excluded_trip_types: ["2", "3", "4"],
    pattern_ids: [...PLAN040_PACKAGE_11_Q82_PATTERN_IDS],
    reused_full_stop_receipt_sha256:
      PLAN040_PACKAGE_11_GLOBAL_PINS.package_10b_full_stop_receipt,
  },
  Q86: {
    accepted_snapshot_date: "2025-06-29",
    retained_trip_types: ["1"],
    excluded_trip_types: ["2", "3", "4"],
    passenger_schedule_rows: [
      { direction_id: "0", shape_id: "Q860045", trip_count: 324 },
      { direction_id: "1", shape_id: "Q860044", trip_count: 296 },
    ],
    pattern_ids: [...PLAN040_PACKAGE_11_Q86_PATTERN_IDS],
  },
  Q87: {
    source_statement_date: "2025-06-30",
    initial_feed_date: "2025-06-29",
    accepted_feed_date: "2025-06-30",
    initial_pattern_ids: [
      "historical-full-stop-pattern:2ad2f4998674028bd63e541e",
      "historical-full-stop-pattern:8b3b53300bc316f042cca929",
    ],
    accepted_pattern_ids: [
      "historical-full-stop-pattern:882b57b4b88f082b419419c7",
      "historical-full-stop-pattern:efeade8f209d99093e94540b",
    ],
    date_version_review_required: true,
  },
  QM68: {
    accepted_snapshot_date: "2025-06-30",
    predecessor_route_id: "X68",
    successor_route_id: "QM68",
    predecessor_pattern_count: 4,
    successor_pattern_count: 2,
    identical_stop_id_lineage_only: true,
  },
};

const qm68Package9 = package9.candidates.find((row) =>
  row.treatment_record_id ===
    "treatment_qm68-avenue-service-discontinuation-2025");
const qm68Comparisons = qm68Package9?.ordered_full_stop_evidence?.comparisons
  .filter((row) =>
    PLAN040_PACKAGE_11_QM68_COMPARISON_IDS.includes(
      row.comparison_id as typeof PLAN040_PACKAGE_11_QM68_COMPARISON_IDS[number],
    ));
if (!qm68Comparisons || qm68Comparisons.length !== 4) {
  throw new Error("Package 11 QM68 comparison evidence drifted");
}
const comparisonById = new Map(qm68Comparisons.map((row) => [
  row.comparison_id,
  row,
]));
const selectedLineage = [
  comparisonById.get(PLAN040_PACKAGE_11_QM68_COMPARISON_IDS[1])!,
  comparisonById.get(PLAN040_PACKAGE_11_QM68_COMPARISON_IDS[2])!,
  comparisonById.get(PLAN040_PACKAGE_11_QM68_COMPARISON_IDS[0])!,
].map((row) => ({
  predecessor_gtfs_route_id: row.before_route_id,
  successor_gtfs_route_id: row.after_route_id,
  direction: row.direction_id,
  boundary_stop_ids: sortedStrings(row.boundary_stop_ids) as [string, string],
  shared_stop_ids: sortedStrings(row.shared_stop_ids),
})).sort((left, right) =>
  stableJson(left as unknown as JsonValue)
    .localeCompare(stableJson(right as unknown as JsonValue)));

const sourceBinding = (
  treatmentId: string,
  block: SourceBlock,
): ExactEvidenceBinding => ({
  role: "source_statement",
  record_id: treatmentId,
  source_id: block.source_id,
  evidence_id: `${block.source_id}#${block.block_id}`,
});
const scheduleBinding = (): ExactEvidenceBinding => ({
  role: "schedule_validation",
  record_id: "mta_bus_schedules_2025_candidate_windows",
  source_id: "mta_bus_schedules_2025_candidate_windows",
  evidence_id: "mta_bus_schedules_2025_candidate_windows#blocks",
});
const grainDecision = (
  extent: MemberExtentLedgerRow,
  block: SourceBlock,
): MemberGrainDecision => {
  const treatment = extent.treatment_record_id;
  const common = {
    schema_version: 1 as const,
    contract_id: "member-grain-decision-v1" as const,
    decision_id: `member-grain-review:plan040-package11-${treatment}`,
    occurrence_id: extent.occurrence_id,
    route_record_id: extent.route_record_id,
    gtfs_route_id: extent.gtfs_route_id,
    treatment_record_id: treatment,
    member_extent_decision_id: extent.verdict_basis?.replace(/^review:/u, "") ??
      null,
    evidence_bindings: sortedBindings([
      sourceBinding(treatment, block),
      scheduleBinding(),
    ]),
    reviewed_at: "2026-07-24T00:00:00.000Z",
    reviewed_by: "codex-plan-040-package-11-evidence-proposal",
  };
  if (treatment === "treatment_q82-limited-stops-2025") {
    return {
      ...common,
      member_extent_decision_id:
        "member-extent-review:plan040-package11-q82-limited-stops",
      service_scope: {
        kind: "trip_subset",
        periods: ["weekend"],
        directions: ["0", "1"],
        pattern_ids: [...PLAN040_PACKAGE_11_Q82_PATTERN_IDS],
        description:
          "Weekend passenger trips on both accepted initial Q82 patterns.",
      },
      lineage_segments: [],
      rationale:
        "The route-specific source statement and accepted launch artifacts bind the weekend passenger subset.",
    };
  }
  if (treatment === "treatment_q45-all-day-frequent-service-2025") {
    return {
      ...common,
      service_scope: {
        kind: "periods",
        periods: ["all_day"],
        directions: ["0", "1"],
        pattern_ids: [...PLAN040_PACKAGE_11_Q45_PATTERN_IDS],
      },
      lineage_segments: [],
      rationale:
        "The route-specific source statement expressly binds the all-day service period.",
    };
  }
  if (treatment === "treatment_q45-direct-connection-2025") {
    return {
      ...common,
      service_scope: {
        kind: "trip_subset",
        periods: ["weekend"],
        directions: ["0", "1"],
        pattern_ids: [...PLAN040_PACKAGE_11_Q45_PATTERN_IDS],
        description:
          "Weekend passenger trips on both accepted initial Q45 patterns.",
      },
      lineage_segments: [],
      rationale:
        "The accepted initial artifacts bind the source-stated connection to the weekend passenger subset.",
    };
  }
  if (treatment === "treatment_q86-limited-stops-2025") {
    return {
      ...common,
      service_scope: {
        kind: "trip_subset",
        periods: ["weekend"],
        directions: ["0", "1"],
        pattern_ids: [...PLAN040_PACKAGE_11_Q86_PATTERN_IDS],
        description:
          "Weekend passenger trips on both accepted initial Q86 patterns.",
      },
      lineage_segments: [],
      rationale:
        "The route-specific source statement and accepted launch artifacts bind the weekend passenger subset.",
    };
  }
  if (treatment === "treatment_qm68-route-rename-2025") {
    return {
      ...common,
      evidence_bindings: sortedBindings([
        sourceBinding(treatment, block),
        ...qm68Comparisons.map((row) => ({
          role: "lineage_comparison",
          record_id: row.comparison_id,
          source_id: "plan_040_qbnr_service_pattern_package_9",
          evidence_id: row.comparison_id,
        })),
      ]),
      service_scope: { kind: "all_service" },
      lineage_segments: selectedLineage,
      rationale:
        "The route rename applies to the complete successor service and three unique identical-ID lineage segments bind all four comparisons.",
    };
  }
  const missingRoles = treatment.startsWith("treatment_q63-")
    ? [
      "corrected_initial_feed_bytes",
      "published_launch_conflict_resolution",
    ]
    : treatment.startsWith("treatment_q80-")
      ? [
        "effective_date_inventory",
        "later_feed_lineage",
        "later_schedule_trip_type_validation",
      ]
      : treatment.startsWith("treatment_q87-")
        ? ["accepted_date_resolution", "feed_version_resolution"]
        : ["branch_mapping", "direction_mapping"];
  return {
    ...common,
    service_scope: {
      kind: "unresolved",
      missing_roles: sortedStrings(missingRoles),
    },
    lineage_segments: [],
    rationale:
      "The required published artifacts conflict or do not cover the source-stated effective state.",
  };
};

const q82ExtentDecision = (
  extent: MemberExtentLedgerRow,
  block: SourceBlock,
): MemberExtentDecision => ({
  decision_id: "member-extent-review:plan040-package11-q82-limited-stops",
  occurrence_id: extent.occurrence_id,
  route_record_id: extent.route_record_id,
  treatment_record_id: extent.treatment_record_id,
  resolution: "bounded_segment",
  components: [
    {
      component_kind: "segment",
      identity_namespace: "source_literal_v1",
      identifiers: [
        "500018", "500022", "501908", "503965", "503984", "505096",
      ],
      description:
        "Direction 0 Hillside Avenue limited-stop segment, ordered in the evidence receipt as 503984, 501908, 505096, 500018, 503965, 500022.",
    },
    {
      component_kind: "segment",
      identity_namespace: "source_literal_v1",
      identifiers: ["500072", "500074", "500080", "501414"],
      description:
        "Direction 1 Hillside Avenue limited-stop segment, ordered in the evidence receipt as 500072, 500074, 500080, 501414.",
    },
  ],
  evidence_bindings: sortedBindings([
    {
      ...sourceBinding(extent.treatment_record_id, block),
      role: "scope_evidence",
    },
    {
      role: "full_stop_receipt",
      record_id:
        "plan-040-qbnr-service-pattern-package-10b-full-stop-equivalence-v1",
      source_id:
        "plan_040_qbnr_service_pattern_package_10b_full_stop_equivalence",
      evidence_id: PLAN040_PACKAGE_11_GLOBAL_PINS.package_10b_full_stop_receipt,
    },
  ]),
  missing_roles: [],
  rationale:
    "The source names Hillside Avenue and the reused exact-stop receipt resolves the two directional segment members.",
  reviewed_at: "2026-07-24T00:00:00.000Z",
  reviewed_by: "codex-plan-040-package-11-evidence-proposal",
});

const candidates = PLAN040_PACKAGE_11_CANDIDATES.map(
  ([routeId, treatmentId]): Plan040Package11CandidateEvidence => {
    const extent = one(
      extentRows,
      (row) => row.treatment_record_id === treatmentId,
      `${treatmentId} extent ledger`,
    );
    const grain = one(
      grainRows,
      (row) => row.treatment_record_id === treatmentId,
      `${treatmentId} grain ledger`,
    );
    const treatment = one(
      treatmentRows,
      (row) => row.record_id === treatmentId,
      `${treatmentId} treatment`,
    );
    const block = one(
      sourceBlocks,
      (row) => row.block_id === metadata[treatmentId].block,
      `${treatmentId} source block`,
    ).row;
    const occurrence = occurrenceOne(extent.row.occurrence_id);
    const route = one(
      routeRows,
      (row) => row.record_id === extent.row.route_record_id,
      `${treatmentId} route`,
    );
    const eventId = occurrence.row.resolved_onset?.evidence_bindings?.find(
      (binding) => binding.role === "event_date",
    )?.record_id;
    const event = eventId
      ? one(eventRows, (row) => row.record_id === eventId, `${treatmentId} event`)
      : null;
    const proposedGrain = grainDecision(extent.row, block);
    const proposedExtent = treatmentId ===
        "treatment_q82-limited-stops-2025"
      ? q82ExtentDecision(extent.row, block)
      : null;
    const unresolvedGapCodes =
      proposedGrain.service_scope.kind === "unresolved"
        ? proposedGrain.service_scope.missing_roles
        : [];
    const acceptedEvidence: Record<string, JsonValue> = {
      canonical_context: {
        route_record_id: route.row.record_id,
        route_row_sha256: route.sha256,
        event_record_id: event?.row.record_id ?? null,
        event_row_sha256: event?.sha256 ?? null,
      },
      schedule_and_pattern_context: scheduleContext[routeId]!,
      schedule_policy: {
        retained_trip_types: ["1"],
        excluded_trip_types: ["2", "3", "4"],
        trip_type_13_retained_for_express_passenger_service: routeId === "QM68",
      },
      ledger_unchanged_now: true,
    };
    if (treatmentId === "treatment_q82-limited-stops-2025") {
      acceptedEvidence.q82_scope_review = {
        predecessor_route_selected: null,
        local_service_routes_are_context_only: ["Q1", "Q3", "Q76"],
        direction_0_stop_ids: [
          "503984", "501908", "505096", "500018", "503965", "500022",
        ],
        direction_1_stop_ids: ["500072", "500074", "500080", "501414"],
        package_10b_sibling_decisions_changed: false,
        q89_residual_exclusion_changed: false,
      };
    }
    if (treatmentId === "treatment_qm68-route-rename-2025") {
      acceptedEvidence.qm68_lineage_review = {
        comparison_ids: sortedStrings(PLAN040_PACKAGE_11_QM68_COMPARISON_IDS),
        comparison_summaries: qm68Comparisons.map((row) => ({
          comparison_id: row.comparison_id,
          direction_id: row.direction_id,
          boundary_stop_ids: row.boundary_stop_ids,
          shared_stop_ids: row.shared_stop_ids,
          comparison_row_sha256: rowSha256(row),
        })).sort((left, right) =>
          left.comparison_id.localeCompare(right.comparison_id)),
        unique_lineage_segment_count: 3,
        all_four_comparisons_bound: true,
        midtown_stop_additions_in_scope: false,
      };
    }
    if (unresolvedGapCodes.length > 0) {
      acceptedEvidence.post_acceptance_disposition = {
        prospective_ledger_verdict: "blocked_upstream",
        current_ledger_changed: false,
      };
    }
    return {
      candidate_key: candidateKey(extent.row),
      occurrence_id: extent.row.occurrence_id,
      route_record_id: extent.row.route_record_id,
      gtfs_route_id: routeId,
      treatment_record_id: treatmentId,
      treatment_family: extent.row.treatment_family,
      source_statement: {
        source_id: block.source_id as
          "mta_queens_bus_network_redesign_service_changes",
        evidence_id: `${block.source_id}#${block.block_id}`,
        block_id: block.block_id,
        block_sha256: block.raw_text_sha256,
        source_quote: block.raw_text,
      },
      immutable_candidate_rows: {
        occurrence_decision: occurrence.row as unknown as JsonValue,
        occurrence_row_sha256: occurrence.sha256,
        treatment_component: treatment.row as unknown as JsonValue,
        treatment_row_sha256: treatment.sha256,
        extent_ledger_row_sha256: extent.sha256,
        grain_ledger_row_sha256: grain.sha256,
      },
      prior_ledger_state: {
        extent_row: extent.row,
        grain_row: grain.row,
      },
      accepted_evidence: acceptedEvidence,
      exact_candidate_searches: [
        `occurrence_id=${extent.row.occurrence_id}`,
        `route_record_id=${extent.row.route_record_id}`,
        `gtfs_route_id=${routeId}`,
        `treatment_record_id=${treatmentId}`,
        `source_block=${block.block_id}`,
        `source_hash=${block.raw_text_sha256}`,
        `extent_ledger_id=${extent.row.ledger_id}`,
        `grain_ledger_id=${grain.row.ledger_id}`,
        `extent_verdict=${extent.row.verdict}`,
        `grain_verdict=${grain.row.verdict}`,
        `schedule_csv_sha256=${PLAN040_PACKAGE_11_GLOBAL_PINS.schedule_csv}`,
        `occurrence_row_sha256=${occurrence.sha256}`,
      ],
      unresolved_gap_codes: unresolvedGapCodes,
      evidence_verdict: metadata[treatmentId].verdict,
      proposed_extent_decision: proposedExtent,
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

const candidateKeys = candidates.map((row) => row.candidate_key);
if (
  sortedHash(candidateKeys) !== PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256 ||
  sortedHash(candidateKeys.slice(0, 1)) !==
    PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256 ||
  sortedHash(candidateKeys.slice(1)) !==
    PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256
) {
  throw new Error("Package 11 corrected candidate discovery drifted");
}

const exclusionKey = (treatmentId: string): string => candidateKey(one(
  extentRows,
  (row) => row.treatment_record_id === treatmentId,
  `${treatmentId} exclusion`,
).row);
const exclusions: Plan040Package11Exclusion[] = [
  {
    scope_id: "q89_residual_limited_stop",
    candidate_keys: [exclusionKey(
      "treatment_q89-q85-green-acres-replacement-2025",
    )],
    candidate_key_sha256: sortedHash([exclusionKey(
      "treatment_q89-q85-green-acres-replacement-2025",
    )]),
    unchanged: true,
  },
  {
    scope_id: "qm68_midtown_stop_additions",
    candidate_keys: [exclusionKey(
      "treatment_qm68-midtown-stop-additions-2025",
    )],
    candidate_key_sha256: sortedHash([exclusionKey(
      "treatment_qm68-midtown-stop-additions-2025",
    )]),
    unchanged: true,
  },
  {
    scope_id: "package_10b_accepted_sibling_decisions",
    candidate_keys: package10b.candidates.map((row) => row.candidate_key).sort(),
    candidate_key_sha256: sortedHash(
      package10b.candidates.map((row) => row.candidate_key),
    ),
    unchanged: true,
  },
];

const evidence = {
  schema_version: 1,
  manifest_id: PLAN040_QBNR_SERVICE_GRAIN_PACKAGE_11,
  candidate_count: 12,
  route_count: 7,
  candidate_key_sha256: PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
  candidate_scope_discovery: {
    q82_candidate_key_sha256:
      PLAN040_PACKAGE_11_Q82_CANDIDATE_KEY_SHA256,
    grain_only_11_candidate_key_sha256:
      PLAN040_PACKAGE_11_GRAIN_ONLY_CANDIDATE_KEY_SHA256,
    combined_12_candidate_key_sha256:
      PLAN040_PACKAGE_11_CANDIDATE_KEY_SHA256,
    rejected_supplied_discovery_sha256_prefix: "b8929342",
    rejected_hash_is_authoritative: false,
  },
  candidates,
  exclusions,
  immutable_inputs: PLAN040_PACKAGE_11_GLOBAL_PINS,
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 1,
    positive_grain_only_proposed: 4,
    structured_unresolved_grain_proposed: 7,
  },
  proposed_extent_distribution: { bounded_segment: 1 },
  proposed_grain_distribution: {
    periods: 1,
    trip_subset: 3,
    all_service: 1,
    unresolved: 7,
  },
  review_protocol: {
    review_mode: "dual_independent_residual_service_grain_review",
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
const draft = buildPlan040Package11Draft({
  evidenceManifestPath: evidenceRelative,
  evidenceManifestSha256: evidenceSha256,
  candidates,
  exclusions,
});
writeStable(draftRelative, draft as unknown as JsonValue);

console.log(JSON.stringify({
  evidence: evidenceRelative,
  evidence_sha256: evidenceSha256,
  draft: draftRelative,
  draft_sha256: sha256(stableBytes(draft as unknown as JsonValue)),
  check_only: checkOnly,
}));
