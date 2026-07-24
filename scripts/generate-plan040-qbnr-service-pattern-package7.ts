import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  MEMBER_GRAIN_DECISION_CONTRACT_ID,
  MEMBER_GRAIN_SCHEMA_VERSION,
  parseMemberGrainDecision,
  type MemberGrainDecision,
} from "../packages/pipeline/src/quality/member-grain-decisions";
import {
  PLAN040_PACKAGE_7_CANDIDATES,
  PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS,
  PLAN040_PACKAGE_7_WAVES,
  buildPlan040Package7Draft,
  plan040Package7ReplayHash,
  type Plan040Package7BoundaryInventory,
  type Plan040Package7CandidateEvidence,
  type Plan040Package7ChangedRegion,
  type Plan040Package7Outcome,
  type Plan040Package7RouteId,
  type Plan040Package7WaveId,
} from "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package7";
import {
  extentDecisionKey,
  validateMemberExtentDecision,
  type ExactEvidenceBinding,
  type MemberExtentDecision,
} from "../packages/pipeline/src/quality/study-readiness-v1";
import {
  loadGtfsStaticSnapshot,
  type GtfsStaticSnapshot,
} from "../packages/pipeline/src/reference/gtfs-static";
import {
  fullStopPatternsForDate,
} from "../packages/pipeline/src/reference/historical-full-stop";
import {
  loadOperationalSnapshotRegistry,
  snapshotById,
} from "../packages/pipeline/src/reference/snapshot-registry";

const P2_ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-2-stop-lists-v1.json";
const P2_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-2-evidence-v1.json";
const P2_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json";
const P4_ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-4-acquisition-v1.json";
const P4_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-evidence-v1.json";
const P4_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json";
const P5_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-5-evidence-draft-v1.json";
const P6_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-6-evidence-draft-v1.json";
const EXEMPLAR_PATH =
  "data/quality/operational-reference/member-extent-ledger-decisions/" +
  "plan-040-exemplar-v1.json";
const EXTENT_LEDGER_PATH =
  "data/quality/operational-reference/member-extent-ledger.jsonl";
const GRAIN_LEDGER_PATH =
  "data/quality/operational-reference/member-grain-ledger.jsonl";
const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-7-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-7-evidence-draft-v1.json";

type LedgerRow = {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  treatment_family: string;
  gtfs_route_id: string;
  current_extent_kind: string;
  verdict: string;
  spatial_verdict?: string;
  receipt_ids: string[];
  member_extent_decision_id?: string | null;
};

type TreatmentRecord = {
  record_id: string;
  source_id: string;
  raw_text: string;
  payload: {
    treatment_family: string;
    treatment_kind: string;
  };
  evidence_refs: Array<{
    source_id: string;
    evidence_id: string;
    block_id: string;
    text_sha256: string;
    source_quote: string;
  }>;
};

type Pattern = {
  pattern_id: string;
  snapshot_id: string;
  service_date: string;
  route_id: string;
  direction_id: string;
  trip_count: number;
  shape_ids: string[];
  headsigns: string[];
  stops: Array<{ stop_id: string; stop_name: string }>;
  period_trip_counts: Array<{ period: string; trip_count: number }>;
  schedule_validation: {
    status: string;
    passenger_shape_ids: string[];
    nonrevenue_shape_ids: string[];
    unmatched_shape_ids: string[];
    ambiguous_shape_ids: string[];
  };
};

type Comparison = {
  comparison_id: string;
  before_pattern_id: string;
  after_pattern_id: string;
  direction_id: string;
  shared_stop_ids: string[];
  accepted: boolean;
};

type PriorCandidate = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  gtfs_route_id: string;
  pre_gtfs_route_id: string;
  post_gtfs_route_id: string;
  pre_source_id: string;
  post_source_id: string;
  pre_target_date: string;
  post_target_date: string;
  stop_list_source_id: string;
  stop_list_url: string;
  stop_list_pdf_sha256: string;
  stop_list_layout_text_sha256: string;
  stop_list_text_raw_sha256: string;
  pre_schedule_slice: Record<string, JsonValue>;
  post_schedule_slice: Record<string, JsonValue>;
  pre_patterns: Pattern[];
  post_patterns: Pattern[];
  comparisons: Comparison[];
  nonexclusive_context_codes: string[];
};

type PriorEvidence = {
  candidates: PriorCandidate[];
};

type StopListSource = {
  route_id: string;
  source_id: string;
  source_url: string;
  receipt_sha256: string;
  pdf_sha256: string;
  layout_text_sha256: string;
  raw_text_sha256: string;
};

type FeedIdentity = {
  boundary: "pre" | "post";
  family: "queens" | "busco";
  receipt_path: string;
  receipt_sha256: string;
  snapshot_id: string;
  source_id: string;
  zip_sha1: string;
  zip_sha256: string;
};

type PriorAcquisition = {
  sources?: StopListSource[];
  stop_list_sources?: StopListSource[];
  accepted_launch_feeds?: FeedIdentity[];
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const absolute = (path: string): string => resolve(repoRoot, path);
const read = (path: string): string =>
  readFileSync(absolute(path), "utf8");
const stableBytes = (value: unknown): string =>
  `${stableJson(value as JsonValue)}\n`;
const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values.filter(Boolean))].sort();
const parseJsonl = <T>(path: string): T[] => {
  const text = read(path).trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as T) : [];
};

function pin(path: string, expected: string, label: string): string {
  const actual = sha256(readFileSync(absolute(path)));
  if (actual !== expected) {
    throw new Error(`${label}: immutable input drifted (${actual})`);
  }
  return actual;
}

pin(
  P2_ACQUISITION_PATH,
  PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_2.acquisition,
  "Package 2 acquisition",
);
pin(
  P2_EVIDENCE_PATH,
  PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_2.evidence,
  "Package 2 evidence",
);
pin(
  P2_DRAFT_PATH,
  PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_2.draft,
  "Package 2 draft",
);
pin(
  P4_ACQUISITION_PATH,
  PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_4.acquisition,
  "Package 4 acquisition",
);
pin(
  P4_EVIDENCE_PATH,
  PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_4.evidence,
  "Package 4 evidence",
);
pin(
  P4_DRAFT_PATH,
  PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_4.draft,
  "Package 4 draft",
);

const p2Evidence = JSON.parse(read(P2_EVIDENCE_PATH)) as PriorEvidence;
const p4Evidence = JSON.parse(read(P4_EVIDENCE_PATH)) as PriorEvidence;
const p2Acquisition = JSON.parse(read(P2_ACQUISITION_PATH)) as PriorAcquisition;
const p4Acquisition = JSON.parse(read(P4_ACQUISITION_PATH)) as PriorAcquisition;
const extentLedger = parseJsonl<LedgerRow>(EXTENT_LEDGER_PATH);
const grainLedger = parseJsonl<LedgerRow>(GRAIN_LEDGER_PATH);
const treatments = new Map(
  parseJsonl<TreatmentRecord>("data/canonical/treatment_components.jsonl")
    .map((record) => [record.record_id, record]),
);

const priorCandidateByRoute = new Map<string, {
  origin: "package_2" | "package_4";
  path: string;
  sha256: string;
  candidate: PriorCandidate;
}>();
for (const [origin, path, evidence, evidenceSha] of [
  [
    "package_2",
    P2_EVIDENCE_PATH,
    p2Evidence,
    PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_2.evidence,
  ],
  [
    "package_4",
    P4_EVIDENCE_PATH,
    p4Evidence,
    PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_4.evidence,
  ],
] as const) {
  for (const candidate of evidence.candidates) {
    if (!priorCandidateByRoute.has(candidate.gtfs_route_id)) {
      priorCandidateByRoute.set(candidate.gtfs_route_id, {
        origin,
        path,
        sha256: evidenceSha,
        candidate,
      });
    }
  }
}

const stopListByRoute = new Map<string, StopListSource>();
for (const source of [
  ...(p2Acquisition.sources ?? []),
  ...(p4Acquisition.stop_list_sources ?? []),
]) {
  stopListByRoute.set(source.route_id, source);
}

const feedIdentities = p4Acquisition.accepted_launch_feeds ?? [];
if (
  feedIdentities.length !== 4 ||
  new Set(feedIdentities.map((feed) =>
    `${feed.family}\0${feed.boundary}`)).size !== 4
) {
  throw new Error("Package 7 requires the four accepted launch feed identities");
}
const feedBySource = new Map(feedIdentities.map((feed) => [
  feed.source_id,
  feed,
]));

const selectedRouteIds = uniqueSorted(
  PLAN040_PACKAGE_7_CANDIDATES.map(([, routeId]) => routeId),
);
const routeIdsBySource = new Map<string, Set<string>>();
for (const routeId of selectedRouteIds) {
  const prior = priorCandidateByRoute.get(routeId)?.candidate;
  if (!prior) throw new Error(`${routeId}: immutable P2/P4 evidence is missing`);
  for (const [sourceId, gtfsRouteId] of [
    [prior.pre_source_id, prior.pre_gtfs_route_id],
    [prior.post_source_id, prior.post_gtfs_route_id],
  ]) {
    const values = routeIdsBySource.get(sourceId) ?? new Set<string>();
    values.add(gtfsRouteId);
    routeIdsBySource.set(sourceId, values);
  }
}

const snapshotIds: Record<string, string> = Object.fromEntries(
  feedIdentities.map((feed) => [feed.source_id, feed.snapshot_id]),
);
const registry = loadOperationalSnapshotRegistry();
const snapshots = new Map<string, GtfsStaticSnapshot>();
for (const [sourceId, routeIds] of [...routeIdsBySource.entries()].sort()) {
  snapshots.set(
    sourceId,
    loadGtfsStaticSnapshot(
      snapshotById(registry, snapshotIds[sourceId]!),
      ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
      repoRoot,
      routeIds,
    ),
  );
}

function compactDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new Error(`invalid service date ${date}`);
  }
  return date.replaceAll("-", "");
}

function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function activeServiceIds(
  snapshot: GtfsStaticSnapshot,
  date: string,
): string[] {
  const compact = compactDate(date);
  const weekday = weekdayIndex(date);
  const active = new Set(
    snapshot.calendar
      .filter((row) =>
        compact >= row.start_date &&
        compact <= row.end_date &&
        row.weekdays[weekday])
      .map((row) => row.service_id),
  );
  for (const exception of snapshot.calendar_dates) {
    if (exception.date !== compact || !exception.service_id) continue;
    if (exception.exception_type === "1") active.add(exception.service_id);
    if (exception.exception_type === "2") active.delete(exception.service_id);
  }
  return [...active].sort();
}

function strippedPattern(pattern: Pattern | Record<string, unknown>) {
  const {
    schedule_validation: _scheduleValidation,
    trip_ids: _TripIds,
    ...rest
  } = pattern as Pattern & { trip_ids?: string[] };
  return rest;
}

function boundaryInventory(
  sourceId: string,
  routeId: string,
  targetDate: string,
  frozenPatterns: Pattern[],
): Plan040Package7BoundaryInventory {
  const snapshot = snapshots.get(sourceId);
  const feed = feedBySource.get(sourceId);
  if (!snapshot || !feed) {
    throw new Error(`${sourceId}: accepted feed or loaded snapshot missing`);
  }
  const rederived = fullStopPatternsForDate(snapshot, targetDate, routeId);
  if (
    stableJson(
      rederived.map(strippedPattern) as unknown as JsonValue,
    ) !==
      stableJson(
        frozenPatterns.map(strippedPattern) as unknown as JsonValue,
      )
  ) {
    throw new Error(
      `${routeId} ${targetDate}: immutable ordered full-stop evidence replay drifted`,
    );
  }
  const active = activeServiceIds(snapshot, targetDate);
  const activeSet = new Set(active);
  const routeRows = snapshot.routes.filter((route) =>
    route.route_id === routeId ||
    route.route_short_name === routeId ||
    route.route_short_name.replace(/-SBS$/u, "") === routeId);
  const routeTrips = snapshot.trips.filter((trip) =>
    trip.route_id === routeRows[0]?.route_id);
  if (routeRows.length !== 1) {
    throw new Error(`${routeId} ${sourceId}: expected one exact route row`);
  }
  return {
    source_id: sourceId,
    snapshot_id: feed.snapshot_id,
    feed_family: feed.family,
    target_date: targetDate as Plan040Package7BoundaryInventory["target_date"],
    calendar_and_calendar_dates_expanded: true,
    active_service_ids: active,
    active_service_id_sha256: sha256(`${active.join("\n")}\n`),
    route_row_count: 1,
    route_trip_row_count: routeTrips.length,
    active_route_trip_count: routeTrips.filter((trip) =>
      activeSet.has(trip.service_id)).length,
    ordered_full_stop_pattern_count: rederived.length,
    ordered_full_stop_pattern_trip_count: rederived.reduce(
      (sum, pattern) => sum + pattern.trip_count,
      0,
    ),
    receipt_path: feed.receipt_path,
    receipt_sha256: feed.receipt_sha256,
    zip_sha1: feed.zip_sha1,
    zip_sha256: feed.zip_sha256,
  };
}

function changedRegions(candidate: PriorCandidate): Plan040Package7ChangedRegion[] {
  const patterns = new Map(
    [...candidate.pre_patterns, ...candidate.post_patterns].map((pattern) => [
      pattern.pattern_id,
      pattern,
    ]),
  );
  const output: Plan040Package7ChangedRegion[] = [];
  for (const comparison of candidate.comparisons.filter((item) =>
    item.accepted)) {
    const before = patterns.get(comparison.before_pattern_id);
    const after = patterns.get(comparison.after_pattern_id);
    if (!before || !after) {
      throw new Error(`${comparison.comparison_id}: pattern binding missing`);
    }
    let beforeIndex = 0;
    let afterIndex = 0;
    for (let index = 0; index <= comparison.shared_stop_ids.length; index += 1) {
      const right = comparison.shared_stop_ids[index] ?? null;
      const beforeRight = right
        ? before.stops.findIndex((stop, stopIndex) =>
          stopIndex >= beforeIndex && stop.stop_id === right)
        : before.stops.length;
      const afterRight = right
        ? after.stops.findIndex((stop, stopIndex) =>
          stopIndex >= afterIndex && stop.stop_id === right)
        : after.stops.length;
      if (beforeRight < 0 || afterRight < 0) {
        throw new Error(
          `${comparison.comparison_id}: shared stop order is not preserved`,
        );
      }
      const beforeStops = before.stops.slice(beforeIndex, beforeRight);
      const afterStops = after.stops.slice(afterIndex, afterRight);
      if (beforeStops.length > 0 || afterStops.length > 0) {
        output.push({
          comparison_id: comparison.comparison_id,
          direction_id: comparison.direction_id,
          before_pattern_id: comparison.before_pattern_id,
          after_pattern_id: comparison.after_pattern_id,
          left_shared_stop_id:
            comparison.shared_stop_ids[index - 1] ?? null,
          right_shared_stop_id: right,
          before_stops: beforeStops,
          after_stops: afterStops,
        });
      }
      beforeIndex = beforeRight + 1;
      afterIndex = afterRight + 1;
    }
  }
  return output;
}

function regionText(region: Plan040Package7ChangedRegion): string {
  return [...region.before_stops, ...region.after_stops]
    .map((stop) => stop.stop_name.toUpperCase())
    .join("\n");
}

function selectCandidateRegions(
  treatmentId: string,
  candidate: PriorCandidate,
): Plan040Package7ChangedRegion[] {
  const all = changedRegions(candidate);
  const patterns = new Map(
    [...candidate.pre_patterns, ...candidate.post_patterns].map((pattern) => [
      pattern.pattern_id,
      pattern,
    ]),
  );
  const selected = all.filter((region) => {
    const text = regionText(region);
    if (treatmentId === "treatment_q1-western-extension-2025") {
      return text.includes("SUTPHIN BLVD") &&
        (region.left_shared_stop_id === null ||
          region.right_shared_stop_id === null);
    }
    if (treatmentId === "treatment_q12-western-reroute-2025") {
      return text.includes("SANFORD AV") &&
        text.includes("NORTHERN BLVD");
    }
    if (treatmentId ===
      "treatment_q16-francis-lewis-discontinuation-2025") {
      const before = patterns.get(region.before_pattern_id);
      return Boolean(
        before?.headsigns.some((headsign) =>
          headsign.toUpperCase().includes("FRANCIS LEWIS")) &&
        text.includes("FRANCIS LEWIS BLVD") &&
        text.includes("UTOPIA PKWY"),
      );
    }
    if (treatmentId === "treatment_q30-jamaica-minor-change-2025") {
      return text.includes("JAMAICA AV") &&
        region.after_stops.length > 0;
    }
    if (
      treatmentId === "treatment_q31-bay-terrace-terminal-2025" ||
      treatmentId === "treatment_q31-bell-boulevard-reroute-2025"
    ) {
      return text.includes("BAY TERRACE SHOPPING CENTER") ||
        (
          text.includes("BELL BLVD/24 AV") &&
          text.includes("FRANCIS LEWIS BLVD/27 AV")
        );
    }
    if (treatmentId ===
      "treatment_q77-springfield-147-extension-2025") {
      return region.after_stops.some((stop) =>
        stop.stop_name.toUpperCase().includes("147 AV"));
    }
    if (treatmentId === "treatment_q88-elmhurst-turnaround-2025") {
      return text.includes("94 ST/58 AV") &&
        text.includes("JUNCTION BLVD");
    }
    if (treatmentId === "treatment_q114-jamaica-minor-change-2025") {
      return text.includes("HILLSIDE AV/153 ST") &&
        region.right_shared_stop_id === null;
    }
    if (
      treatmentId === "treatment_qm12-metropolitan-shortening-2025" ||
      treatmentId === "treatment_qm42-metropolitan-shortening-2025"
    ) {
      return (
        text.includes("UNION TPKE/CRESCENT APARTMENTS") &&
        text.includes("METROPOLITAN AV/71")
      );
    }
    return false;
  });
  return [...selected].sort((left, right) =>
    `${left.direction_id}\0${left.comparison_id}\0${left.left_shared_stop_id ?? ""}`
      .localeCompare(
        `${right.direction_id}\0${right.comparison_id}\0${right.left_shared_stop_id ?? ""}`,
      ));
}

function evidenceBindings(
  candidate: PriorCandidate,
  treatment: TreatmentRecord,
  regions: readonly Plan040Package7ChangedRegion[],
): ExactEvidenceBinding[] {
  const ref = treatment.evidence_refs.find((item) =>
    item.source_id === treatment.source_id);
  if (!ref) throw new Error(`${treatment.record_id}: source evidence missing`);
  const bindings: ExactEvidenceBinding[] = [
    {
      role: "candidate_service_change_statement",
      record_id: treatment.record_id,
      source_id: ref.source_id,
      evidence_id: ref.evidence_id,
    },
    {
      role: "pre_reference_snapshot",
      record_id: treatment.record_id,
      source_id: candidate.pre_source_id,
      evidence_id: `${candidate.pre_source_id}#p001_b0001`,
    },
    {
      role: "post_reference_snapshot",
      record_id: treatment.record_id,
      source_id: candidate.post_source_id,
      evidence_id: `${candidate.post_source_id}#p001_b0001`,
    },
    {
      role: "schedule_trip_type_validation",
      record_id: treatment.record_id,
      source_id: "mta_bus_schedules_2025_candidate_windows",
      evidence_id: "mta_bus_schedules_2025_candidate_windows#p001_b0001",
    },
    ...uniqueSorted(regions.map((region) => region.comparison_id)).map(
      (comparisonId) => ({
        role: "ordered_full_stop_chain",
        record_id: treatment.record_id,
        source_id: candidate.post_source_id,
        evidence_id: `${candidate.post_source_id}#${comparisonId}`,
      }),
    ),
  ];
  return bindings.sort((left, right) =>
    [
      left.role,
      left.record_id,
      left.source_id,
      left.evidence_id,
    ].join("\0").localeCompare(
      [
        right.role,
        right.record_id,
        right.source_id,
        right.evidence_id,
      ].join("\0"),
    ));
}

const FREQUENCY_SCOPES: Record<string, {
  periods: string[];
  directions: string[];
}> = {
  "treatment_qm12-frequency-decrease-2025": {
    periods: ["am_peak", "pm_peak"],
    directions: ["0", "1"],
  },
  "treatment_qm20-frequency-decrease-2025": {
    periods: ["am_peak", "midday", "pm_peak"],
    directions: ["0", "1"],
  },
  "treatment_qm21-frequency-decrease-2025": {
    periods: ["am_peak", "pm_peak"],
    directions: ["0", "1"],
  },
};

function positiveDecisions(
  treatmentId: string,
  candidate: PriorCandidate,
  treatment: TreatmentRecord,
  regions: Plan040Package7ChangedRegion[],
): {
  extent: MemberExtentDecision;
  grain: MemberGrainDecision;
} {
  const bindings = evidenceBindings(candidate, treatment, regions);
  const suffix = treatmentId
    .replace(/^treatment_/u, "")
    .replace(/-2025$/u, "");
  const extentDecisionId = `member-extent-review:plan040-package7-${suffix}`;
  const frequency = FREQUENCY_SCOPES[treatmentId];
  let extent: MemberExtentDecision;
  let grain: MemberGrainDecision;
  if (frequency) {
    const patterns = [...candidate.pre_patterns, ...candidate.post_patterns]
      .filter((pattern) =>
        frequency.directions.includes(pattern.direction_id) &&
        pattern.period_trip_counts.some((period) =>
          frequency.periods.includes(period.period)));
    const patternIds = uniqueSorted(patterns.map((pattern) =>
      pattern.pattern_id));
    if (patternIds.length === 0) {
      throw new Error(`${treatmentId}: structured frequency patterns missing`);
    }
    extent = {
      decision_id: extentDecisionId,
      occurrence_id: candidate.occurrence_id,
      route_record_id: candidate.route_record_id,
      treatment_record_id: treatmentId,
      resolution: "route_wide",
      components: [{
        component_kind: "route",
        identity_namespace: "canonical_record",
        identifiers: [candidate.route_record_id],
        description:
          `${candidate.gtfs_route_id} route member named by the candidate-specific frequency statement.`,
      }],
      evidence_bindings: bindings,
      missing_roles: [],
      rationale:
        "The candidate-specific first-party statement applies the frequency change to the named route, while the receipt-pinned launch-boundary passenger schedules bind the exact affected periods. No spatial change or occurrence is inferred from schedule presence.",
      reviewed_at: "1970-01-01T00:00:00Z",
      reviewed_by: "pending-plan-040-package-7-dual-risk-review",
    };
    grain = parseMemberGrainDecision({
      schema_version: MEMBER_GRAIN_SCHEMA_VERSION,
      contract_id: MEMBER_GRAIN_DECISION_CONTRACT_ID,
      decision_id: `member-grain-review:plan040-package7-${suffix}`,
      occurrence_id: candidate.occurrence_id,
      route_record_id: candidate.route_record_id,
      gtfs_route_id: candidate.gtfs_route_id,
      treatment_record_id: treatmentId,
      member_extent_decision_id: extentDecisionId,
      service_scope: {
        kind: "periods",
        periods: frequency.periods,
        directions: frequency.directions,
        pattern_ids: patternIds,
      },
      lineage_segments: [],
      evidence_bindings: bindings,
      rationale:
        "The structured period, direction, and pattern selectors are limited to the exact passenger schedule slices and first-party frequency statement. The draft does not promote this scope to all service.",
      reviewed_at: "1970-01-01T00:00:00Z",
      reviewed_by: "pending-plan-040-package-7-dual-risk-review",
    });
  } else {
    if (regions.length === 0) {
      throw new Error(`${treatmentId}: exact candidate geometry is missing`);
    }
    const componentsByExactObject = new Map<
      string,
      MemberExtentDecision["components"][number]
    >();
    for (const region of regions) {
      const component = {
        component_kind: "segment" as const,
        identity_namespace: "source_literal_v1" as const,
        identifiers: uniqueSorted([
          region.left_shared_stop_id ?? "",
          region.right_shared_stop_id ?? "",
          ...region.before_stops.map((stop) => stop.stop_id),
          ...region.after_stops.map((stop) => stop.stop_id),
        ]),
        description:
          `Direction ${region.direction_id} exact launch-boundary changed region ` +
          `${region.left_shared_stop_id ?? "route-start"} to ` +
          `${region.right_shared_stop_id ?? "route-end"}; pre/post identifiers remain distinct.`,
      };
      const key = stableJson(component);
      if (!componentsByExactObject.has(key)) {
        componentsByExactObject.set(key, component);
      }
    }
    const components = [...componentsByExactObject.values()].sort(
      (left, right) => left.description.localeCompare(right.description),
    );
    const selectedComparisonIds = new Set(regions.map((region) =>
      region.comparison_id));
    const selectedComparisons = candidate.comparisons.filter((comparison) =>
      selectedComparisonIds.has(comparison.comparison_id));
    const patternIds = uniqueSorted(selectedComparisons.flatMap((comparison) => [
      comparison.before_pattern_id,
      comparison.after_pattern_id,
    ]));
    const selectedPatterns = [...candidate.pre_patterns, ...candidate.post_patterns]
      .filter((pattern) => patternIds.includes(pattern.pattern_id));
    const periods = uniqueSorted(selectedPatterns.flatMap((pattern) =>
      pattern.period_trip_counts.map((period) => period.period)));
    const directions = uniqueSorted(regions.map((region) =>
      region.direction_id));
    extent = {
      decision_id: extentDecisionId,
      occurrence_id: candidate.occurrence_id,
      route_record_id: candidate.route_record_id,
      treatment_record_id: treatmentId,
      resolution: "bounded_segment",
      components,
      evidence_bindings: bindings,
      missing_roles: [],
      rationale:
        "The candidate-specific first-party route-change statement is bound only to matching changed regions in receipt-pinned ordered passenger stop chains. Stop identifiers are carried exactly; changed IDs are not treated as equivalent.",
      reviewed_at: "1970-01-01T00:00:00Z",
      reviewed_by: "pending-plan-040-package-7-dual-risk-review",
    };
    grain = parseMemberGrainDecision({
      schema_version: MEMBER_GRAIN_SCHEMA_VERSION,
      contract_id: MEMBER_GRAIN_DECISION_CONTRACT_ID,
      decision_id: `member-grain-review:plan040-package7-${suffix}`,
      occurrence_id: candidate.occurrence_id,
      route_record_id: candidate.route_record_id,
      gtfs_route_id: candidate.gtfs_route_id,
      treatment_record_id: treatmentId,
      member_extent_decision_id: extentDecisionId,
      service_scope: {
        kind: "trip_subset",
        periods,
        directions,
        pattern_ids: patternIds,
        description:
          "Only the receipt-pinned passenger patterns whose ordered chains contain the candidate-specific changed region.",
      },
      lineage_segments: [],
      evidence_bindings: bindings,
      rationale:
        "The structured selectors preserve the exact launch-boundary route variants observed in the candidate-specific changed regions. No all-service coverage or cross-route transfer is inferred.",
      reviewed_at: "1970-01-01T00:00:00Z",
      reviewed_by: "pending-plan-040-package-7-dual-risk-review",
    });
  }
  validateMemberExtentDecision(extent);
  return { extent, grain };
}

const UNRESOLVED_GAPS: Record<string, string[]> = {
  "treatment_q31-bay-terrace-terminal-2025": [
    "candidate_geometry_nonexclusive_with_bell_boulevard_reroute",
    "named_terminal_is_inside_ordered_turn_loop_not_chain_endpoint",
  ],
  "treatment_qm12-metropolitan-shortening-2025": [
    "changed_id_endpoint_equivalence_forbidden",
    "opposite_direction_endpoint_literal_mismatch_71_av_vs_71_rd",
  ],
  "treatment_qm42-metropolitan-shortening-2025": [
    "changed_id_endpoint_equivalence_forbidden",
    "opposite_direction_endpoint_literal_mismatch_71_av_vs_71_rd",
  ],
  "treatment_q43-limited-discontinuation-2025": [
    "full_route_launch_diff_nonexclusive_with_other_route_changes",
    "limited_variant_not_present_as_distinct_schedule_validated_pattern",
    "weekend_boundary_does_not_bind_limited_service_selector",
  ],
  "treatment_qm2-frequency-decrease-2025": [
    "source_period_selector_missing",
    "weekend_boundary_uses_nonlike_day_comparison",
  ],
  "treatment_qm8-span-adjustment-2025": [
    "exact_service_span_boundary_times_missing",
    "period_reclassification_is_not_exact_span_identity",
  ],
  "treatment_qm32-frequency-span-adjustment-2025": [
    "combined_frequency_and_span_candidate_not_partially_terminalized",
    "exact_service_span_boundary_times_missing",
  ],
  "treatment_qm36-frequency-span-adjustment-2025": [
    "combined_frequency_and_span_candidate_not_partially_terminalized",
    "exact_service_span_boundary_times_missing",
  ],
  "treatment_qm42-frequency-span-adjustment-2025": [
    "combined_frequency_and_span_candidate_not_partially_terminalized",
    "exact_service_span_boundary_times_missing",
    "frequency_delta_nonexclusive_with_shortening",
  ],
};

function ledgerSnapshot(
  candidate: PriorCandidate,
  treatmentId: string,
) {
  const extent = extentLedger.find((row) =>
    row.occurrence_id === candidate.occurrence_id &&
    row.route_record_id === candidate.route_record_id &&
    row.treatment_record_id === treatmentId);
  const grain = grainLedger.find((row) =>
    row.occurrence_id === candidate.occurrence_id &&
    row.route_record_id === candidate.route_record_id &&
    row.treatment_record_id === treatmentId);
  if (
    !extent ||
    !grain ||
    extent.verdict !== "unreviewed" ||
    grain.verdict !== "unreviewed" ||
    extent.current_extent_kind !== "unresolved" ||
    extent.receipt_ids.length !== 0 ||
    grain.receipt_ids.length !== 0
  ) {
    throw new Error(`${treatmentId}: Package 7 ledger input is not pristine`);
  }
  return {
    extent_verdict: "unreviewed" as const,
    grain_verdict: "unreviewed" as const,
    current_extent_kind: "unresolved" as const,
    extent_receipt_ids: [] as [],
    grain_receipt_ids: [] as [],
    extent_decision_id: null,
    grain_decision_id: null,
  };
}

const candidates = PLAN040_PACKAGE_7_CANDIDATES.map(
  ([waveId, routeId, treatmentId, outcome]) => {
    const immutable = priorCandidateByRoute.get(routeId);
    const treatment = treatments.get(treatmentId);
    const document = stopListByRoute.get(routeId);
    if (!immutable || !treatment || !document) {
      throw new Error(`${treatmentId}: immutable evidence binding is incomplete`);
    }
    const prior = immutable.candidate;
    const evidenceRef = treatment.evidence_refs.find((ref) =>
      ref.source_id === treatment.source_id);
    if (
      treatment.source_id !==
        "mta_queens_bus_network_redesign_service_changes" ||
      treatment.payload.treatment_family !== "service_pattern" ||
      !evidenceRef
    ) {
      throw new Error(`${treatmentId}: candidate source statement drifted`);
    }
    const prePatterns = prior.pre_patterns;
    const postPatterns = prior.post_patterns;
    const allPatterns = [...prePatterns, ...postPatterns];
    if (
      allPatterns.some((pattern) =>
        pattern.schedule_validation.status !== "accepted_passenger_shape" ||
        pattern.schedule_validation.ambiguous_shape_ids.length !== 0 ||
        pattern.schedule_validation.unmatched_shape_ids.length !== 0)
    ) {
      throw new Error(
        `${treatmentId}: selected clean scope gained an unresolved schedule shape`,
      );
    }
    for (const [patterns, slice] of [
      [prePatterns, prior.pre_schedule_slice],
      [postPatterns, prior.post_schedule_slice],
    ] as const) {
      const passengerShapeIds = new Set(
        slice.passenger_shape_ids as string[],
      );
      if (
        patterns.some((pattern) =>
          pattern.shape_ids.some((shapeId) =>
            !passengerShapeIds.has(shapeId)))
      ) {
        throw new Error(`${treatmentId}: schedule-to-GTFS passenger binding drifted`);
      }
    }
    const regions = selectCandidateRegions(treatmentId, prior);
    if (
      waveId !== "P7-D" &&
      waveId !== "P7-C" &&
      regions.length === 0
    ) {
      throw new Error(`${treatmentId}: candidate geometry search is empty`);
    }
    const decisions = outcome === "positive"
      ? positiveDecisions(treatmentId, prior, treatment, regions)
      : null;
    const unresolved = outcome === "unresolved"
      ? UNRESOLVED_GAPS[treatmentId]
      : [];
    if (outcome === "unresolved" && (!unresolved || unresolved.length === 0)) {
      throw new Error(`${treatmentId}: unresolved gap inventory is missing`);
    }
    return {
      candidate_key: extentDecisionKey({
        occurrence_id: prior.occurrence_id,
        route_record_id: prior.route_record_id,
        treatment_record_id: treatmentId,
      }),
      occurrence_id: prior.occurrence_id,
      route_record_id: prior.route_record_id,
      treatment_record_id: treatmentId,
      treatment_family: "service_pattern",
      gtfs_route_id: routeId,
      risk_wave_id: waveId,
      expected_outcome: outcome,
      immutable_evidence_origin: immutable.origin,
      immutable_candidate_ref: {
        path: immutable.path,
        sha256: immutable.sha256,
        stop_removal_candidate_key: prior.candidate_key,
      },
      source_statement: {
        source_id: treatment.source_id,
        evidence_id: evidenceRef.evidence_id,
        block_id: evidenceRef.block_id,
        block_sha256: evidenceRef.text_sha256,
        treatment_kind: treatment.payload.treatment_kind,
        raw_text: treatment.raw_text,
      },
      exact_candidate_searches: uniqueSorted([
        `occurrence_id=${prior.occurrence_id} treatment_record_id=${treatmentId}`,
        `route=${routeId} exact_statement=${JSON.stringify(treatment.raw_text)}`,
        `source_id=${treatment.source_id} evidence_id=${evidenceRef.evidence_id}`,
      ]),
      candidate_document: {
        source_id: document.source_id,
        source_url: document.source_url,
        receipt_sha256: document.receipt_sha256,
        pdf_sha256: document.pdf_sha256,
        layout_text_sha256: document.layout_text_sha256,
        raw_text_sha256: document.raw_text_sha256,
        binding_status: "candidate_route_document_exact_nonexclusive",
        document_is_full_stop_chain: false,
        nonexclusive_context: true,
      },
      boundary_inventory: {
        pre: boundaryInventory(
          prior.pre_source_id,
          prior.pre_gtfs_route_id,
          prior.pre_target_date,
          prePatterns,
        ),
        post: boundaryInventory(
          prior.post_source_id,
          prior.post_gtfs_route_id,
          prior.post_target_date,
          postPatterns,
        ),
      },
      schedule_validation: {
        passenger_policy: "any_trip_type_except_2_3_4",
        excluded_nonrevenue_trip_types: ["2", "3", "4"],
        pre: prior.pre_schedule_slice,
        post: prior.post_schedule_slice,
        every_selected_pattern_is_schedule_validated_passenger: true,
      },
      ordered_full_stop_evidence: {
        equivalence_basis: "identical_stop_id_only",
        pre_patterns: prePatterns as unknown as Array<Record<string, JsonValue>>,
        post_patterns: postPatterns as unknown as Array<Record<string, JsonValue>>,
        comparisons: prior.comparisons as unknown as Array<Record<string, JsonValue>>,
        candidate_changed_regions: regions,
        nonexclusive_full_route_context: true,
      },
      ledger_snapshot: ledgerSnapshot(prior, treatmentId),
      unresolved_gap_codes: uniqueSorted(unresolved ?? []),
      nonexclusive_context_codes: uniqueSorted([
        ...prior.nonexclusive_context_codes,
        "candidate_route_document_is_nonexclusive_context",
        "full_route_launch_diff_contains_other_service_changes",
      ]),
      evidence_verdict: outcome === "positive"
        ? "evidence_complete_positive_draft"
        : "receipt_terminal_unresolved",
      proposed_extent_decision: decisions?.extent ?? null,
      proposed_grain_decision: decisions?.grain ?? null,
      persisted_extent_decision: null,
      persisted_grain_decision: null,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
    } satisfies Plan040Package7CandidateEvidence;
  },
);

const keys = candidates.map((candidate) => candidate.candidate_key).sort();
if (
  sha256(`${keys.join("\n")}\n`) !==
    PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256
) {
  throw new Error("Package 7 exact candidate hash drifted");
}

const selectedOccurrences = new Set(candidates.map((candidate) =>
  candidate.occurrence_id));
const terminalContext = extentLedger.filter((row) =>
  selectedOccurrences.has(row.occurrence_id) &&
  row.treatment_record_id.endsWith("-stop-removal-2025") &&
  row.verdict !== "unreviewed");
const existingPhase1AbsenceKeys = terminalContext
  .filter((row) => row.verdict === "absent_in_source")
  .map(extentDecisionKey)
  .sort();
const reusedPositiveStopRemovalKeys = terminalContext
  .filter((row) => row.verdict.startsWith("resolved:"))
  .map(extentDecisionKey)
  .sort();
if (
  existingPhase1AbsenceKeys.length !== 16 ||
  reusedPositiveStopRemovalKeys.length !== 1
) {
  throw new Error("Package 7 prior Phase 1 terminal context drifted");
}

const priorKeys = (path: string): string[] => {
  const parsed = JSON.parse(read(path)) as {
    candidates?: Array<{ candidate_key: string }>;
    decisions?: Array<{
      occurrence_id: string;
      route_record_id: string;
      treatment_record_id: string;
    }>;
  };
  return (
    parsed.candidates?.map((candidate) => candidate.candidate_key) ??
      parsed.decisions?.map(extentDecisionKey) ??
      []
  ).sort();
};

const priorCandidateKeys = {
  package_2: priorKeys(P2_DRAFT_PATH),
  package_4: priorKeys(P4_DRAFT_PATH),
  package_5: priorKeys(P5_DRAFT_PATH),
  package_6: priorKeys(P6_DRAFT_PATH),
  exemplar: priorKeys(EXEMPLAR_PATH),
};

const evidence = {
  schema_version: 1,
  manifest_id: "plan-040-qbnr-service-pattern-package-7-evidence-v1",
  immutable_reuse: {
    package_2: {
      acquisition: {
        path: P2_ACQUISITION_PATH,
        sha256: PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_2.acquisition,
      },
      evidence: {
        path: P2_EVIDENCE_PATH,
        sha256: PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_2.evidence,
      },
      draft: {
        path: P2_DRAFT_PATH,
        sha256: PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_2.draft,
      },
    },
    package_4: {
      acquisition: {
        path: P4_ACQUISITION_PATH,
        sha256: PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_4.acquisition,
      },
      evidence: {
        path: P4_EVIDENCE_PATH,
        sha256: PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_4.evidence,
      },
      draft: {
        path: P4_DRAFT_PATH,
        sha256: PLAN040_PACKAGE_7_IMMUTABLE_INPUT_PINS.package_4.draft,
      },
    },
    reacquisition_performed: false,
    source_bytes_recomputed: false,
  },
  accepted_launch_feed_identities: feedIdentities,
  candidate_count: 20,
  route_count: 17,
  candidate_key_sha256: PLAN040_PACKAGE_7_CANDIDATE_KEY_SHA256,
  wave_partition: PLAN040_PACKAGE_7_WAVES,
  current_outcome_distribution: {
    evidence_complete_positive_draft: 11,
    receipt_terminal_unresolved: 9,
  },
  pristine_ledger_inputs: {
    extent: {
      path: EXTENT_LEDGER_PATH,
      sha256: sha256(readFileSync(absolute(EXTENT_LEDGER_PATH))),
    },
    grain: {
      path: GRAIN_LEDGER_PATH,
      sha256: sha256(readFileSync(absolute(GRAIN_LEDGER_PATH))),
    },
  },
  existing_phase_1_terminal_context: {
    absence_decision_count: 16,
    absence_decision_keys: existingPhase1AbsenceKeys,
    reused_positive_stop_removal_context_count: 1,
    reused_positive_stop_removal_keys: reusedPositiveStopRemovalKeys,
    candidate_key_overlap_count: 0,
  },
  exclusion_checks: Object.fromEntries(
    Object.entries(priorCandidateKeys).map(([name, prior]) => [
      name,
      {
        prior_candidate_count: prior.length,
        overlap_count: prior.filter((key) => keys.includes(key)).length,
      },
    ]),
  ),
  calendar_policy: {
    exact_pairs: ["2025-06-27→2025-06-30", "2025-06-28→2025-06-29"],
    calendar_and_calendar_dates_expansion_required: true,
  },
  schedule_trip_type_policy: {
    passenger: "any trip_type other than 2, 3, or 4",
    nonrevenue_excluded: ["2", "3", "4"],
    mixed_shape: "reviewed_unresolved",
    unmatched_shape: "reviewed_unresolved",
  },
  equivalence_policy: {
    automatic_equivalence: "identical_stop_id_only",
    changed_id_name_coordinate_or_proximity_equivalence: false,
    route_document_or_schedule_presence_can_infer_occurrence: false,
  },
  candidates,
  authorization_state:
    "evidence_and_decision_draft_pending_dual_independent_wave_review_no_gate_no_acceptance_no_persistence",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const evidenceBytes = stableBytes(evidence);
const evidenceSha256 = sha256(evidenceBytes);
const draft = buildPlan040Package7Draft({
  evidenceManifestPath: EVIDENCE_PATH,
  evidenceManifestSha256: evidenceSha256,
  candidates,
  priorCandidateKeys,
  existingPhase1AbsenceKeys,
  reusedPositiveStopRemovalKeys,
});
const draftBytes = stableBytes(draft);

const outputs = [
  [EVIDENCE_PATH, evidenceBytes],
  [DRAFT_PATH, draftBytes],
] as const;
const check = process.argv.includes("--check");
for (const [path, bytes] of outputs) {
  if (check) {
    if (!existsSync(absolute(path)) || read(path) !== bytes) {
      throw new Error(`${path}: frozen Package 7 artifact is stale`);
    }
  } else {
    writeFileSync(absolute(path), bytes);
  }
}

console.log(JSON.stringify({
  status: check ? "checked" : "generated",
  evidence_manifest: { path: EVIDENCE_PATH, sha256: evidenceSha256 },
  decision_draft: { path: DRAFT_PATH, sha256: sha256(draftBytes) },
  replay_sha256: plan040Package7ReplayHash(
    draft as unknown as JsonValue,
  ),
  candidate_count: draft.candidate_count,
  route_count: draft.route_count,
  candidate_key_sha256: draft.candidate_key_sha256,
  evidence_verdict_distribution: draft.evidence_verdict_distribution,
  proposed_extent_distribution: draft.proposed_extent_distribution,
  proposed_grain_distribution: draft.proposed_grain_distribution,
  authorization_state: draft.authorization_state,
}));
