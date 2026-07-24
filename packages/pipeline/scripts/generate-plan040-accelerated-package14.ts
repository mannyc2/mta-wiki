import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
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
  PLAN040_PACKAGE_14_CANDIDATE_COUNT,
  PLAN040_PACKAGE_14_BASE_CHECKPOINT_COMMIT,
  PLAN040_PACKAGE_14_DISCOVERY_SHA256,
  PLAN040_PACKAGE_14_EXACT_ABSENCE_COUNT,
  PLAN040_PACKAGE_14_POSITIVE_COUNT,
  PLAN040_PACKAGE_14_SOURCE_GAP_COUNT,
  buildPlan040Package14Evidence,
  plan040Package14RowHash,
  validatePlan040Package14Discovery,
  writePlan040Package14ImmutableNormalFile,
  type Plan040Package14Candidate,
  type Plan040Package14Discovery,
  type Plan040Package14Partition,
} from "../src/quality/plan040-accelerated-package14.js";
import {
  PLAN040_PACKAGE_14_ACCEPTANCE_SHA256,
  PLAN040_PACKAGE_14_COMPARISON_SHA256,
  PLAN040_PACKAGE_14_EXTENT_DECISIONS_SHA256,
  PLAN040_PACKAGE_14_FROZEN_DRAFT_SHA256,
  PLAN040_PACKAGE_14_FROZEN_EVIDENCE_SHA256,
  PLAN040_PACKAGE_14_GATE_SHA256,
  PLAN040_PACKAGE_14_GRAIN_DECISIONS_SHA256,
  PLAN040_PACKAGE_14_PERSISTENCE_EVIDENCE_SHA256,
  PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS,
  PLAN040_PACKAGE_14_SOURCE_GAP_BLOCK_SHA256,
  PLAN040_PACKAGE_14_SOURCE_GAP_OVERLAY_SHA256,
} from "../src/quality/plan040-accelerated-package14-closeout.js";
import { loadMemberSourceGapOverlays } from
  "../src/quality/member-extent-ledger.js";

const checkOnly = process.argv.includes("--check");
const receiptRoot =
  "data/quality/acquisition/receipts/member-extent-evidence";
const riskRoot =
  "data/quality/operational-reference/member-extent-risk";
const paths = {
  discovery:
    `${receiptRoot}/plan-040-accelerated-package-14-discovery-receipt-v1.json`,
  qbnr6:
    `${receiptRoot}/plan-040-accelerated-package-14-qbnr6-evidence-v1.json`,
  q110Chains:
    `${receiptRoot}/plan-040-accelerated-package-14-q110-full-stop-chains-v1.json`,
  express20:
    `${receiptRoot}/plan-040-accelerated-package-14-express20-source-gaps-v1.json`,
  ace7:
    `${receiptRoot}/plan-040-accelerated-package-14-ace7-evidence-v1.json`,
  legacySbs3:
    `${receiptRoot}/plan-040-accelerated-package-14-legacy-sbs3-evidence-v1.json`,
  sourceGaps:
    `${receiptRoot}/plan-040-accelerated-package-14-source-gap-overlays-v1.json`,
  currentFreeze:
    `${receiptRoot}/plan-040-accelerated-package-14-current-freeze-state-v1.json`,
  evidence:
    `${riskRoot}/plan-040-accelerated-package-14-evidence-v1.json`,
  draft:
    `${riskRoot}/plan-040-accelerated-package-14-evidence-draft-v1.json`,
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
  snapshotRegistry: "data/reference/operational/snapshots.json",
  historicalAcquisition:
    "data/quality/operational-reference/historical-full-stop/acquisition-manifest.json",
  sourceGapLoader:
    "packages/pipeline/src/quality/member-extent-ledger.ts",
  package13Checkpoint:
    "data/quality/operational-reference/member-extent-risk/plan-040-package-13-checkpoint-v1.json",
} as const;
const postPersistenceArtifacts = {
  gate:
    `${riskRoot}/plan-040-accelerated-package-14-dual-review-gate-v1.json`,
  comparison:
    `${receiptRoot}/plan-040-accelerated-package-14-persistence-comparisons-v1.json`,
  sourceGapBlock:
    `${receiptRoot}/plan-040-accelerated-package-14-source-gap-blocks-v1.json`,
  persistenceEvidence:
    `${riskRoot}/plan-040-accelerated-package-14-persistence-evidence-v1.json`,
  acceptance:
    `${riskRoot}/plan-040-accelerated-package-14-owner-acceptance-v2.json`,
  extentDecisions:
    "data/quality/operational-reference/member-extent-ledger-decisions/" +
    "plan-040-accelerated-package-14-v1.json",
  grainDecisions:
    "data/quality/operational-reference/member-grain-decisions/" +
    "plan-040-accelerated-package-14-v1.json",
  sourceGapOverlay:
    "data/quality/operational-reference/member-source-gap-overlays/" +
    "plan-040-accelerated-package-14-v1.json",
} as const;
const frozenArtifactPins = {
  [paths.qbnr6]:
    "03512b4002d7609adb9a1e9e0e2c52fc10da10f4cca1344047d3572b4e8ea370",
  [paths.q110Chains]:
    "e2d6b67a9543aae16c3f27efad570b2ecfb9975f6d3605aec5a850a1ca44b525",
  [paths.express20]:
    "9783bcec6b4e1edc45f929fb5daca7b69cbe62683b792f38fbdcd9939a780b89",
  [paths.ace7]:
    "b562800f6dfea2ff1ef10324889a924f781a63ce235ad7aebc573ddc811f8214",
  [paths.legacySbs3]:
    "6d3c0bfcc6c3d51ce88af81b652fd5f368399a11f4262fa05e8045a6b3d516c4",
  [paths.sourceGaps]:
    "f8ac25362481b5d69a435555a0c429b9dfd627e832245c8a70119e6c0ce847af",
  [paths.currentFreeze]:
    "fccd862125882bae3a53b2862bb38bb04c2b0abea08d550c2689202d89fe266a",
  [paths.evidence]: PLAN040_PACKAGE_14_FROZEN_EVIDENCE_SHA256,
  [paths.draft]: PLAN040_PACKAGE_14_FROZEN_DRAFT_SHA256,
} as const;
const postPersistenceArtifactPins = {
  [postPersistenceArtifacts.gate]: PLAN040_PACKAGE_14_GATE_SHA256,
  [postPersistenceArtifacts.comparison]: PLAN040_PACKAGE_14_COMPARISON_SHA256,
  [postPersistenceArtifacts.sourceGapBlock]:
    PLAN040_PACKAGE_14_SOURCE_GAP_BLOCK_SHA256,
  [postPersistenceArtifacts.persistenceEvidence]:
    PLAN040_PACKAGE_14_PERSISTENCE_EVIDENCE_SHA256,
  [postPersistenceArtifacts.acceptance]:
    PLAN040_PACKAGE_14_ACCEPTANCE_SHA256,
  [postPersistenceArtifacts.extentDecisions]:
    PLAN040_PACKAGE_14_EXTENT_DECISIONS_SHA256,
  [postPersistenceArtifacts.grainDecisions]:
    PLAN040_PACKAGE_14_GRAIN_DECISIONS_SHA256,
  [postPersistenceArtifacts.sourceGapOverlay]:
    PLAN040_PACKAGE_14_SOURCE_GAP_OVERLAY_SHA256,
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
const assertNormalFile = (path: string): void => {
  const stat = lstatSync(join(repoRoot, path));
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${path}: expected immutable normal file`);
  }
};
const assertPinnedNormalFile = (path: string, expected: string): void => {
  assertNormalFile(path);
  const actual = sha256(readFileSync(join(repoRoot, path)));
  if (actual !== expected) {
    throw new Error(
      `${path}: pinned SHA-256 drifted; expected ${expected}, got ${actual}`,
    );
  }
};
const writeStable = (path: string, value: JsonValue): void => {
  const absolute = join(repoRoot, path);
  const bytes = stableBytes(value);
  if (checkOnly) {
    if (!existsSync(absolute) || readFileSync(absolute, "utf8") !== bytes) {
      throw new Error(`Deterministic replay drifted: ${path}`);
    }
    return;
  }
  writeFileSync(absolute, bytes);
};
const writeImmutableReceipt = (path: string, value: JsonValue): void =>
  writePlan040Package14ImmutableNormalFile(
    join(repoRoot, path),
    value,
    checkOnly,
  );
const acquireSourceRoot = process.argv.find((argument) =>
  argument.startsWith("--acquire-q110-chains-root=")
)?.slice("--acquire-q110-chains-root=".length);

assertNormalFile(paths.discovery);
const discoveryBytes = readFileSync(join(repoRoot, paths.discovery));
if (sha256(discoveryBytes) !== PLAN040_PACKAGE_14_DISCOVERY_SHA256) {
  throw new Error("Package 14 discovery receipt SHA drifted");
}
const discovery = JSON.parse(
  discoveryBytes.toString("utf8"),
) as Plan040Package14Discovery;
writeImmutableReceipt(
  paths.discovery,
  discovery as unknown as JsonValue,
);
validatePlan040Package14Discovery(discovery);

const q110Summary = discovery.q110_positive_rederivation as {
  pre_snapshot_id: string;
  post_snapshot_id: string;
  pre_service_date: string;
  post_service_date: string;
  pre_patterns: Array<{
    pattern_id: string;
    stop_count: number;
    stop_chain_sha256: string;
  }>;
  post_patterns: Array<{
    pattern_id: string;
    stop_count: number;
    stop_chain_sha256: string;
  }>;
};
const patternInventory = (pattern: HistoricalFullStopPattern): JsonValue => ({
  pattern_id: pattern.pattern_id,
  snapshot_id: pattern.snapshot_id,
  service_date: pattern.service_date,
  route_id: pattern.route_id,
  direction_id: pattern.direction_id,
  trip_count: pattern.trip_count,
  trip_id_sha256: sha256(`${[...pattern.trip_ids].sort().join("\n")}\n`),
  shape_ids: pattern.shape_ids,
  headsigns: pattern.headsigns,
  period_trip_counts: pattern.period_trip_counts,
  stop_count: pattern.stops.length,
  stop_ids: pattern.stops.map((stop) => stop.stop_id),
  stops: pattern.stops,
  stop_chain_sha256:
    sha256(`${pattern.stops.map((stop) => stop.stop_id).join("\n")}\n`),
});
if (acquireSourceRoot !== undefined) {
  if (checkOnly) {
    throw new Error("--check cannot be combined with Q110 chain acquisition");
  }
  const registry = loadOperationalSnapshotRegistry();
  const loadPatterns = (
    snapshotId: string,
    serviceDate: string,
  ): HistoricalFullStopPattern[] => {
    const snapshot = loadGtfsStaticSnapshot(
      snapshotById(registry, snapshotId),
      ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
      acquireSourceRoot,
      new Set(["Q110"]),
    );
    return fullStopPatternsForDate(snapshot, serviceDate, "Q110");
  };
  const select = (
    patterns: HistoricalFullStopPattern[],
    expected: Array<{ pattern_id: string }>,
  ): HistoricalFullStopPattern[] => {
    const byId = new Map(patterns.map((pattern) => [pattern.pattern_id, pattern]));
    return expected.map((row) => {
      const pattern = byId.get(row.pattern_id);
      if (pattern === undefined) {
        throw new Error(`Q110 expected full-stop pattern missing: ${row.pattern_id}`);
      }
      return pattern;
    });
  };
  const prePatterns = select(
    loadPatterns(q110Summary.pre_snapshot_id, q110Summary.pre_service_date),
    q110Summary.pre_patterns,
  );
  const postPatterns = select(
    loadPatterns(q110Summary.post_snapshot_id, q110Summary.post_service_date),
    q110Summary.post_patterns,
  );
  writeImmutableReceipt(paths.q110Chains, {
    schema_version: 1,
    receipt_id: "plan-040-accelerated-package-14-q110-full-stop-chains-v1",
    candidate_key:
      "occurrence:6a6f8f8e85979d872ba2bdd7\u0000route_q110-queens\u0000treatment_q110-route-redesign-2025",
    derivation: {
      source_root_not_persisted: true,
      route_id: "Q110",
      calendar_policy: "calendar_plus_calendar_dates",
      revenue_filter: "retained_schedule_trip_type_1_shapes_only",
      exact_identifier_policy:
        "identical_stop_id_only_no_name_coordinate_or_proximity_equivalence",
    },
    pre_snapshot_id: q110Summary.pre_snapshot_id,
    pre_service_date: q110Summary.pre_service_date,
    pre_patterns: prePatterns.map(patternInventory),
    post_snapshot_id: q110Summary.post_snapshot_id,
    post_service_date: q110Summary.post_service_date,
    post_patterns: postPatterns.map(patternInventory),
    version_role: "published_launch_diff",
    corrected_first_week_diff_used: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  });
}
assertNormalFile(paths.q110Chains);
const q110Chains = readJson<{
  pre_patterns: Array<{
    pattern_id: string;
    stop_count: number;
    stop_ids: string[];
    stop_chain_sha256: string;
  }>;
  post_patterns: Array<{
    pattern_id: string;
    stop_count: number;
    stop_ids: string[];
    stop_chain_sha256: string;
  }>;
  corrected_first_week_diff_used: false;
}>(paths.q110Chains);
writeImmutableReceipt(
  paths.q110Chains,
  q110Chains as unknown as JsonValue,
);
for (const [actual, expected] of [
  [q110Chains.pre_patterns, q110Summary.pre_patterns],
  [q110Chains.post_patterns, q110Summary.post_patterns],
] as const) {
  if (actual.length !== expected.length) {
    throw new Error("Q110 selected full-stop chain count drifted");
  }
  const expectedById = new Map(expected.map((row) => [row.pattern_id, row]));
  for (const pattern of actual) {
    const summary = expectedById.get(pattern.pattern_id);
    if (
      summary === undefined ||
      pattern.stop_ids.length !== pattern.stop_count ||
      pattern.stop_count !== summary.stop_count ||
      pattern.stop_chain_sha256 !== summary.stop_chain_sha256 ||
      sha256(`${pattern.stop_ids.join("\n")}\n`) !== pattern.stop_chain_sha256
    ) {
      throw new Error(`${pattern.pattern_id}: Q110 full-stop chain drifted`);
    }
  }
}
if (q110Chains.corrected_first_week_diff_used) {
  throw new Error("Q110 correction feed was silently mixed into Package 14");
}

const persistenceMarkers = [
  postPersistenceArtifacts.extentDecisions,
  postPersistenceArtifacts.grainDecisions,
  postPersistenceArtifacts.sourceGapOverlay,
] as const;
const materializedMarkerCount = persistenceMarkers.filter((path) =>
  existsSync(join(repoRoot, path))
).length;
if (checkOnly && materializedMarkerCount > 0) {
  if (materializedMarkerCount !== persistenceMarkers.length) {
    throw new Error(
      "Package 14 post-persistence replay requires all three exact " +
        "decision/overlay artifacts",
    );
  }
  assertPinnedNormalFile(
    paths.discovery,
    PLAN040_PACKAGE_14_DISCOVERY_SHA256,
  );
  for (const [path, expected] of Object.entries(frozenArtifactPins)) {
    assertPinnedNormalFile(path, expected);
  }
  for (
    const [path, expected] of Object.entries(postPersistenceArtifactPins)
  ) {
    assertPinnedNormalFile(path, expected);
  }
  const postProjectionPins: Record<string, string> = {
    [trackedInputs.extentLedger]:
      PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.extent_ledger,
    [trackedInputs.grainLedger]:
      PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.grain_ledger,
    "data/quality/study-readiness/v1/bridge-ledger.jsonl":
      PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.bridge_ledger,
    "data/quality/study-readiness/v1/bridge-summary.json":
      PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.bridge_summary,
    "data/quality/study-readiness/v1/consumer-priority-manifest.json":
      PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.consumer_priority_manifest,
    "data/quality/study-readiness/v1/manifest.json":
      PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.study_manifest,
    ["data/contracts/operational-occurrence-member-extent/v1/" +
      "operational_occurrence_member_extents.jsonl"]:
        PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.member_extent_contract,
    "data/contracts/operational-occurrence-member-extent/v1/manifest.json":
      PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.member_extent_manifest,
    "data/contracts/operational-occurrence-member-extent/v1/review-ledger.jsonl":
      PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.member_extent_review_ledger,
    "data/contracts/operational-occurrence-member-extent/v1/summary.json":
      PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.member_extent_summary,
    "data/exports/releases/v1-rc26/operational_occurrences.jsonl":
      PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.operational_occurrences,
    ["data/exports/releases/v1-rc26/" +
      "operational_occurrence_review_decisions.json"]:
        PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS
          .operational_occurrence_decisions,
    [trackedInputs.treatments]:
      PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS.treatment_components,
    ["data/quality/study-readiness/v1/research/" +
      "reviewed-candidate-packets.jsonl"]:
        PLAN040_PACKAGE_14_POST_PERSISTENCE_PINS
          .reviewed_candidate_packets,
  };
  for (const [path, expected] of Object.entries(postProjectionPins)) {
    assertPinnedNormalFile(path, expected);
  }

  type AcceptedExtentDecision = {
    decision_id: string;
    occurrence_id: string;
    route_record_id: string;
    treatment_record_id: string;
    resolution: string;
  };
  type AcceptedGrainDecision = {
    decision_id: string;
    occurrence_id: string;
    route_record_id: string;
    treatment_record_id: string;
    member_extent_decision_id: string;
    service_scope: { kind: string };
  };
  const acceptedExtent = readJson<{ decisions: AcceptedExtentDecision[] }>(
    postPersistenceArtifacts.extentDecisions,
  ).decisions;
  const acceptedGrain = readJson<{ decisions: AcceptedGrainDecision[] }>(
    postPersistenceArtifacts.grainDecisions,
  ).decisions;
  if (acceptedExtent.length !== 8 || acceptedGrain.length !== 8) {
    throw new Error("Package 14 accepted decision count drifted");
  }
  const extentDecisionByKey = new Map(acceptedExtent.map((row) => [
    `${row.occurrence_id}\0${row.route_record_id}\0${row.treatment_record_id}`,
    row,
  ]));
  const grainDecisionByKey = new Map(acceptedGrain.map((row) => [
    `${row.occurrence_id}\0${row.route_record_id}\0${row.treatment_record_id}`,
    row,
  ]));
  const liveExtentByKey = new Map(
    readJsonl(trackedInputs.extentLedger)
      .map((row) => [keyForLedgerRow(row), row]),
  );
  const liveGrainByKey = new Map(
    readJsonl(trackedInputs.grainLedger)
      .map((row) => [keyForLedgerRow(row), row]),
  );
  const liveRouteById = new Map(
    readJsonl(trackedInputs.routes).map((row) => [recordId(row), row]),
  );
  const liveTreatmentById = new Map(
    readJsonl(trackedInputs.treatments).map((row) => [recordId(row), row]),
  );
  for (const candidate of discovery.candidate_details) {
    const [, routeId, treatmentId] = candidate.candidate_key.split("\0");
    const extentRow = liveExtentByKey.get(candidate.candidate_key);
    const grainRow = liveGrainByKey.get(candidate.candidate_key);
    const routeRow = liveRouteById.get(routeId);
    const treatmentRow = liveTreatmentById.get(treatmentId);
    if (
      extentRow === undefined ||
      grainRow === undefined ||
      routeRow === undefined ||
      treatmentRow === undefined ||
      plan040Package14RowHash(routeRow) !==
        candidate.canonical_route_row_sha256 ||
      plan040Package14RowHash(treatmentRow) !==
        candidate.canonical_treatment_row_sha256
    ) {
      throw new Error(
        `${candidate.candidate_key}: post-persistence canonical binding drifted`,
      );
    }
    const extentRecord = record(extentRow);
    const grainRecord = record(grainRow);
    if (
      extentRecord.authorizes_study !== false ||
      extentRecord.authorizes_cross_product !== false ||
      grainRecord.authorizes_study !== false ||
      grainRecord.authorizes_cross_product !== false
    ) {
      throw new Error(
        `${candidate.candidate_key}: post-persistence row gained authority`,
      );
    }
    if (candidate.proposed_verdict === "positive_extent_and_grain") {
      const extentDecision = extentDecisionByKey.get(candidate.candidate_key);
      const grainDecision = grainDecisionByKey.get(candidate.candidate_key);
      const proposal = record(candidate.proposed_positive_decisions!);
      const proposalGrain = record(proposal.grain_scope);
      if (
        extentDecision === undefined ||
        grainDecision === undefined ||
        extentRecord.verdict !==
          `resolved:${extentDecision.resolution}` ||
        extentRecord.verdict_basis !==
          `review:${extentDecision.decision_id}` ||
        grainRecord.verdict !== "resolved" &&
          grainRecord.verdict !== "not_applicable" ||
        grainRecord.verdict_basis !==
          `review:${grainDecision.decision_id}` ||
        grainDecision.member_extent_decision_id !==
          extentDecision.decision_id ||
        extentDecision.resolution !== proposal.extent_resolution ||
        grainDecision.service_scope.kind !== proposalGrain.kind
      ) {
        throw new Error(
          `${candidate.candidate_key}: accepted positive projection drifted`,
        );
      }
    } else {
      const proposedOverlay = record(candidate.proposed_source_gap_overlay!);
      const expectedVerdict = String(proposedOverlay.verdict);
      if (
        extentDecisionByKey.has(candidate.candidate_key) ||
        grainDecisionByKey.has(candidate.candidate_key) ||
        extentRecord.verdict !== expectedVerdict ||
        grainRecord.verdict !== expectedVerdict ||
        extentRecord.verdict_basis !==
          "receipt:plan-040-accelerated-package-14-source-gap-blocks-v1" ||
        grainRecord.verdict_basis !==
          "receipt:plan-040-accelerated-package-14-source-gap-blocks-v1"
      ) {
        throw new Error(
          `${candidate.candidate_key}: source-gap projection drifted`,
        );
      }
    }
  }
  for (const sibling of discovery.preservation.same_occurrence_siblings) {
    const extentRow = liveExtentByKey.get(sibling.candidate_key);
    const grainRow = liveGrainByKey.get(sibling.candidate_key);
    if (
      extentRow === undefined ||
      grainRow === undefined ||
      plan040Package14RowHash(extentRow) !== sibling.extent_row_sha256 ||
      plan040Package14RowHash(grainRow) !== sibling.grain_row_sha256
    ) {
      throw new Error(
        `${sibling.candidate_key}: preserved sibling changed after persistence`,
      );
    }
  }
  const overlays = loadMemberSourceGapOverlays([
    join(
      repoRoot,
      "data/quality/operational-reference/member-source-gap-overlays",
    ),
  ]);
  const package14Overlay = overlays.find((overlay) =>
    overlay.overlay_id ===
      "plan-040-accelerated-package-14-source-gap-overlay-v1"
  );
  if (
    package14Overlay === undefined ||
    package14Overlay.entries.length !== PLAN040_PACKAGE_14_SOURCE_GAP_COUNT ||
    package14Overlay.entries.some((entry) =>
      entry.blocked_surfaces.join(",") !== "member_extent,member_grain"
    )
  ) {
    throw new Error("Package 14 strict source-gap overlay replay drifted");
  }
  console.log(
    "checked Plan 040 accelerated Package 14 post-persistence replay: " +
      "36 candidates, 8 positive, 28 blocked source gaps",
  );
  process.exit(0);
}

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

for (const candidate of discovery.candidate_details) {
  const [occurrenceId, routeId, treatmentId] = candidate.candidate_key.split("\0");
  const extentRow = extentRows.get(candidate.candidate_key);
  const grainRow = grainRows.get(candidate.candidate_key);
  const routeRow = routeRows.get(routeId);
  const treatmentRow = treatmentRows.get(treatmentId);
  if (
    occurrenceId === undefined ||
    routeId === undefined ||
    treatmentId === undefined ||
    extentRow === undefined ||
    grainRow === undefined ||
    routeRow === undefined ||
    treatmentRow === undefined
  ) {
    throw new Error(`${candidate.candidate_key}: current input row missing`);
  }
  if (
    plan040Package14RowHash(extentRow) !== candidate.current_extent_row_sha256 ||
    plan040Package14RowHash(grainRow) !== candidate.current_grain_row_sha256 ||
    plan040Package14RowHash(routeRow) !== candidate.canonical_route_row_sha256 ||
    plan040Package14RowHash(treatmentRow) !==
      candidate.canonical_treatment_row_sha256
  ) {
    throw new Error(`${candidate.candidate_key}: current immutable row drifted`);
  }
}
for (const sibling of discovery.preservation.same_occurrence_siblings) {
  const extentRow = extentRows.get(sibling.candidate_key);
  const grainRow = grainRows.get(sibling.candidate_key);
  if (
    extentRow === undefined ||
    grainRow === undefined ||
    plan040Package14RowHash(extentRow) !== sibling.extent_row_sha256 ||
    plan040Package14RowHash(grainRow) !== sibling.grain_row_sha256
  ) {
    throw new Error(`${sibling.candidate_key}: preserved sibling drifted`);
  }
}

const makePartitionReceipt = (
  partition: Plan040Package14Partition,
  candidates: Plan040Package14Candidate[],
): JsonValue => ({
  schema_version: 1,
  receipt_id: `plan-040-accelerated-package-14-${partition}-evidence-v1`,
  partition,
  candidate_count: candidates.length,
  source_gap_count: candidates.filter((row) =>
    row.proposed_verdict === "source_gap_blocked_extent_and_grain"
  ).length,
  positive_count: candidates.filter((row) =>
    row.proposed_verdict === "positive_extent_and_grain"
  ).length,
  candidates: candidates.map((row) => ({
    candidate_key: row.candidate_key,
    proposed_verdict: row.proposed_verdict,
    occurrence_decision_id: row.occurrence_decision_id,
    occurrence_decision_row_sha256: row.occurrence_decision_row_sha256,
    canonical_route_row_sha256: row.canonical_route_row_sha256,
    canonical_treatment_row_sha256: row.canonical_treatment_row_sha256,
    current_extent_row_sha256: row.current_extent_row_sha256,
    current_grain_row_sha256: row.current_grain_row_sha256,
    exact_route_bindings: row.exact_route_bindings,
    exact_treatment_evidence_refs: row.exact_treatment_evidence_refs,
    proposed_positive_decisions: row.proposed_positive_decisions,
    proposed_source_gap_overlay: row.proposed_source_gap_overlay,
  })),
  q110_positive_rederivation:
    partition === "qbnr6" ? discovery.q110_positive_rederivation : null,
  q110_complete_ordered_full_stop_chains:
    partition === "qbnr6"
      ? {
        path: paths.q110Chains,
        sha256: sha256(readFileSync(join(repoRoot, paths.q110Chains))),
      }
      : null,
  exact_absence_count: 0,
  absent_in_source_projection_permitted: false,
  persisted_decision_count: 0,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
});
const byPartition = (
  partition: Plan040Package14Partition,
): Plan040Package14Candidate[] =>
  discovery.candidate_details.filter((row) => row.partition === partition);

const receipts: Record<string, JsonValue> = {
  qbnr6: makePartitionReceipt("qbnr6", byPartition("qbnr6")),
  express20: makePartitionReceipt("express20", byPartition("express20")),
  ace7: makePartitionReceipt("ace7", byPartition("ace7")),
  legacySbs3: makePartitionReceipt(
    "legacySbs3",
    byPartition("legacySbs3"),
  ),
};
const sourceGapCandidates = discovery.candidate_details.filter(
  (row) => row.proposed_verdict === "source_gap_blocked_extent_and_grain",
);
receipts.sourceGaps = {
  schema_version: 1,
  receipt_id: "plan-040-accelerated-package-14-source-gap-overlays-v1",
  overlay_contract: "member-source-gap-overlay-v1",
  candidate_count: sourceGapCandidates.length,
  blocked_surfaces: ["member_extent", "member_grain"],
  semantic_verdict: "blocked_upstream",
  literal_absence_count: 0,
  absent_in_source_projection_permitted: false,
  candidates: sourceGapCandidates.map((row) => ({
    candidate_key: row.candidate_key,
    partition: row.partition,
    exact_treatment_evidence_refs: row.exact_treatment_evidence_refs,
    exact_route_bindings: row.exact_route_bindings,
    source_gap_overlay: row.proposed_source_gap_overlay,
    current_extent_row_sha256: row.current_extent_row_sha256,
    current_grain_row_sha256: row.current_grain_row_sha256,
  })),
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
receipts.currentFreeze = {
  schema_version: 1,
  receipt_id: "plan-040-accelerated-package-14-current-freeze-state-v1",
  observed_commit: PLAN040_PACKAGE_14_BASE_CHECKPOINT_COMMIT,
  supersedes_historical_discovery_observed_commit: discovery.observed_commit,
  historical_discovery_receipt: {
    path: paths.discovery,
    sha256: PLAN040_PACKAGE_14_DISCOVERY_SHA256,
    classification: "historical_discovery_snapshot_only",
  },
  current_whole_file_pins: Object.fromEntries(
    Object.entries(trackedInputs).map(([name, path]) => [
      name,
      {
        path,
        sha256: sha256(readFileSync(join(repoRoot, path))),
        size_bytes: readFileSync(join(repoRoot, path)).byteLength,
      },
    ]),
  ),
  candidate_current_state: discovery.candidate_details.map((row) => ({
    candidate_key: row.candidate_key,
    current_extent_row_sha256: row.current_extent_row_sha256,
    current_grain_row_sha256: row.current_grain_row_sha256,
    canonical_route_row_sha256: row.canonical_route_row_sha256,
    canonical_treatment_row_sha256: row.canonical_treatment_row_sha256,
    occurrence_decision_id: row.occurrence_decision_id,
    occurrence_decision_row_sha256: row.occurrence_decision_row_sha256,
  })),
  preserved_sibling_state:
    discovery.preservation.same_occurrence_siblings.map((row) => ({
      candidate_key: row.candidate_key,
      extent_row_sha256: row.extent_row_sha256,
      grain_row_sha256: row.grain_row_sha256,
    })),
  candidate_count: discovery.candidate_details.length,
  candidate_key_sha256: discovery.exact_scope.candidate_key_sha256,
  preserved_sibling_count:
    discovery.preservation.same_occurrence_sibling_count,
  current_state_verified: true,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};

writeImmutableReceipt(paths.qbnr6, receipts.qbnr6);
writeImmutableReceipt(paths.express20, receipts.express20);
writeImmutableReceipt(paths.ace7, receipts.ace7);
writeImmutableReceipt(paths.legacySbs3, receipts.legacySbs3);
writeImmutableReceipt(paths.sourceGaps, receipts.sourceGaps);
writeImmutableReceipt(paths.currentFreeze, receipts.currentFreeze);

const receiptRefs: Record<string, { path: string; sha256: string }> = {
  discovery: {
    path: paths.discovery,
    sha256: PLAN040_PACKAGE_14_DISCOVERY_SHA256,
  },
};
for (const name of [
  "qbnr6",
  "express20",
  "ace7",
  "legacySbs3",
  "sourceGaps",
  "currentFreeze",
] as const) {
  receiptRefs[name] = {
    path: paths[name],
    sha256: sha256(stableBytes(receipts[name])),
  };
}
receiptRefs.q110Chains = {
  path: paths.q110Chains,
  sha256: sha256(readFileSync(join(repoRoot, paths.q110Chains))),
};
const evidence = buildPlan040Package14Evidence(discovery, receiptRefs);
writeStable(paths.evidence, evidence);
const draft: JsonValue = {
  schema_version: 1,
  manifest_id: "plan-040-accelerated-package-14-evidence-draft-v1",
  package_id: "plan-040-accelerated-package-14-evidence-only-v1",
  evidence_manifest: {
    path: paths.evidence,
    sha256: sha256(stableBytes(evidence)),
  },
  candidate_count: PLAN040_PACKAGE_14_CANDIDATE_COUNT,
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
  positive_extent_and_grain_count: PLAN040_PACKAGE_14_POSITIVE_COUNT,
  source_gap_blocked_extent_and_grain_count:
    PLAN040_PACKAGE_14_SOURCE_GAP_COUNT,
  exact_absence_count: PLAN040_PACKAGE_14_EXACT_ABSENCE_COUNT,
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
  `${checkOnly ? "checked" : "wrote"} Plan 040 accelerated Package 14: ` +
    `${PLAN040_PACKAGE_14_CANDIDATE_COUNT} candidates, ` +
    `${PLAN040_PACKAGE_14_POSITIVE_COUNT} positive, ` +
    `${PLAN040_PACKAGE_14_SOURCE_GAP_COUNT} blocked source gaps`,
);
