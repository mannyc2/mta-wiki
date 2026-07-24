import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  PLAN040_PACKAGE_8_CANDIDATES,
  PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS,
  PLAN040_PACKAGE_8_SERVICE_CHANGE_HTML_SHA256,
  PLAN040_PACKAGE_8_WAVES,
  buildPlan040Package8Draft,
  plan040Package8ReplayHash,
  type Plan040Package8BoundaryInventory,
  type Plan040Package8CandidateEvidence,
  type Plan040Package8RouteId,
} from "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package8";
import { extentDecisionKey } from "../packages/pipeline/src/quality/study-readiness-v1";
import {
  fullStopPatternsForDate,
} from "../packages/pipeline/src/reference/historical-full-stop";
import {
  loadGtfsStaticSnapshot,
  type GtfsStaticSnapshot,
} from "../packages/pipeline/src/reference/gtfs-static";
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
const P7_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-7-evidence-draft-v1.json";
const EXEMPLAR_PATH =
  "data/quality/operational-reference/member-extent-ledger-decisions/" +
  "plan-040-exemplar-v1.json";
const EXTENT_LEDGER_PATH =
  "data/quality/operational-reference/member-extent-ledger.jsonl";
const GRAIN_LEDGER_PATH =
  "data/quality/operational-reference/member-grain-ledger.jsonl";
const SERVICE_HTML_PATH =
  "raw/sources/mta_queens_bus_network_redesign_service_changes/source.html";
const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-8-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-8-evidence-draft-v1.json";
const check = process.argv.includes("--check");

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
  decision_id?: string | null;
  updated_at: string | null;
  verdict_basis: string | null;
  authorizes_study: boolean;
  authorizes_cross_product: boolean;
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
  }>;
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
  pre_patterns: Array<{
    shape_ids: string[];
  }>;
  post_patterns: Array<{
    shape_ids: string[];
  }>;
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

for (const [path, expected, label] of [
  [
    P2_ACQUISITION_PATH,
    PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_2.acquisition,
    "Package 2 acquisition",
  ],
  [
    P2_EVIDENCE_PATH,
    PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_2.evidence,
    "Package 2 evidence",
  ],
  [
    P2_DRAFT_PATH,
    PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_2.draft,
    "Package 2 draft",
  ],
  [
    P4_ACQUISITION_PATH,
    PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_4.acquisition,
    "Package 4 acquisition",
  ],
  [
    P4_EVIDENCE_PATH,
    PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_4.evidence,
    "Package 4 evidence",
  ],
  [
    P4_DRAFT_PATH,
    PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_4.draft,
    "Package 4 draft",
  ],
  [
    P7_DRAFT_PATH,
    PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_7_draft,
    "Package 7 draft",
  ],
  [
    EXTENT_LEDGER_PATH,
    PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.extent_ledger,
    "current extent ledger",
  ],
  [
    GRAIN_LEDGER_PATH,
    PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.grain_ledger,
    "current grain ledger",
  ],
] as const) {
  pin(path, expected, label);
}

const p2Evidence = JSON.parse(read(P2_EVIDENCE_PATH)) as PriorEvidence;
const p4Evidence = JSON.parse(read(P4_EVIDENCE_PATH)) as PriorEvidence;
const p2Acquisition =
  JSON.parse(read(P2_ACQUISITION_PATH)) as PriorAcquisition;
const p4Acquisition =
  JSON.parse(read(P4_ACQUISITION_PATH)) as PriorAcquisition;
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
    PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_2.evidence,
  ],
  [
    "package_4",
    P4_EVIDENCE_PATH,
    p4Evidence,
    PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_4.evidence,
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
  throw new Error("Package 8 requires the four accepted launch feed identities");
}
const feedBySource = new Map(feedIdentities.map((feed) => [
  feed.source_id,
  feed,
]));
const feedByFamilyBoundary = new Map(feedIdentities.map((feed) => [
  `${feed.family}\0${feed.boundary}`,
  feed,
]));

const B_ROUTE_BOUNDARIES: Record<string, {
  family: "queens" | "busco";
  preDate: "2025-06-27" | "2025-06-28";
  postDate: "2025-06-29" | "2025-06-30";
}> = {
  Q4: { family: "queens", preDate: "2025-06-28", postDate: "2025-06-29" },
  Q5: { family: "queens", preDate: "2025-06-28", postDate: "2025-06-29" },
  Q13: { family: "queens", preDate: "2025-06-28", postDate: "2025-06-29" },
  Q36: { family: "queens", preDate: "2025-06-28", postDate: "2025-06-29" },
  Q46: { family: "queens", preDate: "2025-06-28", postDate: "2025-06-29" },
  Q85: { family: "queens", preDate: "2025-06-28", postDate: "2025-06-29" },
  Q113: { family: "busco", preDate: "2025-06-28", postDate: "2025-06-29" },
  QM6: { family: "busco", preDate: "2025-06-27", postDate: "2025-06-30" },
  QM10: { family: "busco", preDate: "2025-06-27", postDate: "2025-06-30" },
  QM11: { family: "busco", preDate: "2025-06-27", postDate: "2025-06-30" },
};

const routeIdsBySource = new Map<string, Set<string>>();
function addRoute(sourceId: string, routeId: string): void {
  const values = routeIdsBySource.get(sourceId) ?? new Set<string>();
  values.add(routeId);
  routeIdsBySource.set(sourceId, values);
}
for (const [waveId, routeId] of PLAN040_PACKAGE_8_CANDIDATES) {
  if (waveId === "P8-A") {
    const prior = priorCandidateByRoute.get(routeId)?.candidate;
    if (!prior) throw new Error(`${routeId}: immutable P2/P4 evidence missing`);
    addRoute(prior.pre_source_id, prior.pre_gtfs_route_id);
    addRoute(prior.post_source_id, prior.post_gtfs_route_id);
  } else {
    const spec = B_ROUTE_BOUNDARIES[routeId];
    if (!spec) throw new Error(`${routeId}: Package 8 B boundary mapping missing`);
    const pre = feedByFamilyBoundary.get(`${spec.family}\0pre`)!;
    const post = feedByFamilyBoundary.get(`${spec.family}\0post`)!;
    addRoute(pre.source_id, routeId);
    addRoute(post.source_id, routeId);
  }
}

const registry = loadOperationalSnapshotRegistry();
const snapshots = new Map<string, GtfsStaticSnapshot>();
for (const [sourceId, routeIds] of [...routeIdsBySource.entries()].sort()) {
  const feed = feedBySource.get(sourceId);
  if (!feed) throw new Error(`${sourceId}: accepted feed identity missing`);
  snapshots.set(
    sourceId,
    loadGtfsStaticSnapshot(
      snapshotById(registry, feed.snapshot_id),
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

function boundaryInventory(
  sourceId: string,
  routeId: string,
  targetDate: string,
): Plan040Package8BoundaryInventory {
  const snapshot = snapshots.get(sourceId);
  const feed = feedBySource.get(sourceId);
  if (!snapshot || !feed) {
    throw new Error(`${sourceId}: accepted feed or snapshot missing`);
  }
  const active = activeServiceIds(snapshot, targetDate);
  const activeSet = new Set(active);
  const routeRows = snapshot.routes.filter((route) =>
    route.route_id === routeId ||
    route.route_short_name === routeId ||
    route.route_short_name.replace(/-SBS$/u, "") === routeId);
  if (routeRows.length !== 1) {
    throw new Error(`${routeId} ${sourceId}: expected one exact route row`);
  }
  const routeTrips = snapshot.trips.filter((trip) =>
    trip.route_id === routeRows[0]!.route_id);
  const activeTrips = routeTrips.filter((trip) =>
    activeSet.has(trip.service_id));
  const activeShapes = uniqueSorted(activeTrips.map((trip) => trip.shape_id));
  const patterns = fullStopPatternsForDate(snapshot, targetDate, routeId);
  const patternShapes = uniqueSorted(patterns.flatMap((pattern) =>
    pattern.shape_ids));
  if (
    activeTrips.length === 0 ||
    activeShapes.length === 0 ||
    patterns.length === 0
  ) {
    throw new Error(`${routeId} ${targetDate}: active boundary is incomplete`);
  }
  return {
    source_id: sourceId,
    snapshot_id: feed.snapshot_id,
    feed_family: feed.family,
    target_date:
      targetDate as Plan040Package8BoundaryInventory["target_date"],
    calendar_and_calendar_dates_expanded: true,
    active_service_ids: active,
    active_service_id_sha256: sha256(`${active.join("\n")}\n`),
    route_row_count: 1,
    route_trip_row_count: routeTrips.length,
    active_route_trip_count: activeTrips.length,
    active_shape_ids: activeShapes,
    active_shape_id_sha256: sha256(`${activeShapes.join("\n")}\n`),
    ordered_full_stop_pattern_count: patterns.length,
    ordered_full_stop_pattern_shape_ids: patternShapes,
    receipt_path: feed.receipt_path,
    receipt_sha256: feed.receipt_sha256,
    zip_sha1: feed.zip_sha1,
    zip_sha256: feed.zip_sha256,
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&#039;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/\s+/gu, " ")
    .trim();
}

function anchors(value: string): Array<{ text: string; href: string }> {
  return [...value.matchAll(
    /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu,
  )].map((match) => ({
    text: stripHtml(match[2] ?? ""),
    href: match[1] ?? "",
  })).filter((anchor) => anchor.href);
}

const serviceHtml = read(SERVICE_HTML_PATH);
if (sha256(serviceHtml) !== PLAN040_PACKAGE_8_SERVICE_CHANGE_HTML_SHA256) {
  throw new Error("Package 8 service-change HTML drifted");
}
const settingsMatch = serviceHtml.match(
  /<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/u,
);
if (!settingsMatch) throw new Error("Package 8 route-table settings missing");
const settings = JSON.parse(settingsMatch[1]!) as {
  mtaDatatable: Record<string, {
    csvData: {
      data: Array<Record<string, { value: string }>>;
    };
  }>;
};
const serviceRows = settings.mtaDatatable["21"]?.csvData.data;
if (!serviceRows) throw new Error("Package 8 route table 21 missing");
const selectedRoutes = uniqueSorted(PLAN040_PACKAGE_8_CANDIDATES.map(
  ([, routeId]) => routeId,
));
const sourceRowByRoute = new Map(selectedRoutes.map((routeId) => {
  const row = serviceRows.find((candidate) =>
    candidate.Route?.value === routeId);
  if (!row) throw new Error(`${routeId}: service-change row missing`);
  const cells = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"]
    .map((key) => row[key]?.value ?? "");
  return [routeId, {
    source_html_sha256: PLAN040_PACKAGE_8_SERVICE_CHANGE_HTML_SHA256,
    route_row: routeId as Plan040Package8RouteId,
    row_sha256: sha256(stableBytes({ route: routeId, cells })),
    implementation_statement: stripHtml(cells[0] ?? ""),
    candidate_change_context: cells.slice(1)
      .map(stripHtml).filter(Boolean),
    anchors: cells.flatMap(anchors),
  }];
}));

const stagedSourceIdsByExactUrl = new Map<string, string[]>();
let stagedMetadataCount = 0;
for (const directory of readdirSync(absolute("raw/sources")).sort()) {
  const metadataPath = `raw/sources/${directory}/metadata.json`;
  if (!existsSync(absolute(metadataPath))) continue;
  let metadata: {
    sourceId?: string;
    sourceUrl?: string;
    finalUrl?: string;
  };
  try {
    metadata = JSON.parse(read(metadataPath)) as typeof metadata;
  } catch {
    continue;
  }
  stagedMetadataCount += 1;
  for (const url of uniqueSorted([
    metadata.sourceUrl ?? "",
    metadata.finalUrl ?? "",
  ])) {
    const values = stagedSourceIdsByExactUrl.get(url) ?? [];
    if (metadata.sourceId) values.push(metadata.sourceId);
    stagedSourceIdsByExactUrl.set(url, uniqueSorted(values));
  }
}

function ledgerSnapshot(
  occurrenceId: string,
  routeRecordId: string,
  treatmentId: string,
) {
  const extent = extentLedger.find((row) =>
    row.occurrence_id === occurrenceId &&
    row.route_record_id === routeRecordId &&
    row.treatment_record_id === treatmentId);
  const grain = grainLedger.find((row) =>
    row.occurrence_id === occurrenceId &&
    row.route_record_id === routeRecordId &&
    row.treatment_record_id === treatmentId);
  if (
    !extent ||
    !grain ||
    extent.verdict !== "unreviewed" ||
    grain.verdict !== "unreviewed" ||
    grain.spatial_verdict !== "unreviewed" ||
    extent.current_extent_kind !== "unresolved" ||
    grain.current_extent_kind !== "unresolved" ||
    extent.receipt_ids.length !== 0 ||
    grain.receipt_ids.length !== 0 ||
    extent.updated_at !== null ||
    grain.updated_at !== null ||
    extent.verdict_basis !== null ||
    grain.verdict_basis !== null ||
    grain.member_extent_decision_id !== null ||
    extent.authorizes_study ||
    extent.authorizes_cross_product ||
    grain.authorizes_study ||
    grain.authorizes_cross_product
  ) {
    throw new Error(`${treatmentId}: Package 8 ledger input is not pristine`);
  }
  return {
    extent_verdict: "unreviewed" as const,
    grain_verdict: "unreviewed" as const,
    grain_spatial_verdict: "unreviewed" as const,
    current_extent_kind: "unresolved" as const,
    extent_receipt_ids: [] as [],
    grain_receipt_ids: [] as [],
    extent_decision_id: null,
    grain_decision_id: null,
    extent_updated_at: null,
    grain_updated_at: null,
  };
}

function shapeComparison(
  slice: Record<string, JsonValue>,
  patterns: Array<{ shape_ids: string[] }>,
) {
  const schedule = uniqueSorted(
    (slice.passenger_shape_ids as string[] | undefined) ?? [],
  );
  const gtfs = uniqueSorted(patterns.flatMap((pattern) => pattern.shape_ids));
  const scheduleSet = new Set(schedule);
  const gtfsSet = new Set(gtfs);
  return {
    schedule_date: String(slice.schedule_date ?? ""),
    schedule_passenger_shape_ids: schedule,
    gtfs_full_stop_shape_ids: gtfs,
    schedule_only_shape_ids: schedule.filter((id) => !gtfsSet.has(id)),
    gtfs_only_shape_ids: gtfs.filter((id) => !scheduleSet.has(id)),
    schedule_slice_sha256: sha256(stableBytes(slice)),
  };
}

const candidates = PLAN040_PACKAGE_8_CANDIDATES.map(
  ([waveId, routeId, treatmentId]) => {
    const extent = extentLedger.find((row) =>
      row.gtfs_route_id === routeId &&
      row.treatment_record_id === treatmentId);
    const treatment = treatments.get(treatmentId);
    const sourceRow = sourceRowByRoute.get(routeId);
    if (!extent || !treatment || !sourceRow) {
      throw new Error(`${treatmentId}: source or ledger binding missing`);
    }
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

    let preInventory: Plan040Package8BoundaryInventory;
    let postInventory: Plan040Package8BoundaryInventory;
    let immutableContext:
      Plan040Package8CandidateEvidence["immutable_p2_p4_context"] = null;
    let shapeGap:
      Plan040Package8CandidateEvidence["schedule_to_gtfs_shape_gap"] = null;
    let documentGap:
      Plan040Package8CandidateEvidence["candidate_document_gap"] = null;
    const unresolvedGapCodes: string[] = [];
    const roleSearches: string[] = [];

    if (waveId === "P8-A") {
      const immutable = priorCandidateByRoute.get(routeId);
      const document = stopListByRoute.get(routeId);
      if (!immutable || !document) {
        throw new Error(`${routeId}: exact P2/P4 document context missing`);
      }
      const prior = immutable.candidate;
      if (
        prior.stop_list_source_id !== document.source_id ||
        prior.stop_list_url !== document.source_url ||
        !sourceRow.anchors.some((anchor) =>
          anchor.href === document.source_url)
      ) {
        throw new Error(`${routeId}: exact P2/P4 source-row binding drifted`);
      }
      preInventory = boundaryInventory(
        prior.pre_source_id,
        prior.pre_gtfs_route_id,
        prior.pre_target_date,
      );
      postInventory = boundaryInventory(
        prior.post_source_id,
        prior.post_gtfs_route_id,
        prior.post_target_date,
      );
      const pre = shapeComparison(
        prior.pre_schedule_slice,
        prior.pre_patterns,
      );
      const post = shapeComparison(
        prior.post_schedule_slice,
        prior.post_patterns,
      );
      if (
        stableJson(
          pre.gtfs_full_stop_shape_ids as unknown as JsonValue,
        ) !== stableJson(
          preInventory.ordered_full_stop_pattern_shape_ids as unknown as JsonValue,
        ) ||
        stableJson(
          post.gtfs_full_stop_shape_ids as unknown as JsonValue,
        ) !== stableJson(
          postInventory.ordered_full_stop_pattern_shape_ids as unknown as JsonValue,
        ) ||
        pre.schedule_only_shape_ids.length !== 0 ||
        pre.gtfs_only_shape_ids.length !== 0 ||
        post.schedule_only_shape_ids.length === 0 ||
        post.gtfs_only_shape_ids.length === 0
      ) {
        throw new Error(`${routeId}: exact schedule/GTFS mismatch drifted`);
      }
      immutableContext = {
        origin: immutable.origin,
        evidence_path: immutable.path,
        evidence_sha256: immutable.sha256,
        stop_removal_candidate_key: prior.candidate_key,
        candidate_document: {
          source_id: document.source_id,
          source_url: document.source_url,
          receipt_sha256: document.receipt_sha256,
          pdf_sha256: document.pdf_sha256,
          layout_text_sha256: document.layout_text_sha256,
          raw_text_sha256: document.raw_text_sha256,
          document_is_full_stop_chain: false,
          nonexclusive_context: true,
        },
      };
      shapeGap = {
        schedule_source_id: "mta_bus_schedules_2025_candidate_windows",
        passenger_policy: "any_trip_type_except_2_3_4",
        excluded_nonrevenue_trip_types: ["2", "3", "4"],
        pre,
        post,
        pre_shape_sets_match: true,
        post_shape_sets_match: false,
        binding_status:
          "blocked_post_schedule_gtfs_shape_identity_mismatch",
      };
      unresolvedGapCodes.push(
        "post_schedule_gtfs_shape_identity_mismatch",
        "candidate_specific_shape_binding_not_authorized",
        "candidate_route_document_nonexclusive_context",
      );
      roleSearches.push(
        `candidate_document_url=${document.source_url} immutable_origin=${immutable.origin}`,
        `post_schedule_only_shape_ids=${post.schedule_only_shape_ids.join(",")}`,
        `post_gtfs_only_shape_ids=${post.gtfs_only_shape_ids.join(",")}`,
      );
    } else {
      const boundary = B_ROUTE_BOUNDARIES[routeId]!;
      const preFeed =
        feedByFamilyBoundary.get(`${boundary.family}\0pre`)!;
      const postFeed =
        feedByFamilyBoundary.get(`${boundary.family}\0post`)!;
      preInventory = boundaryInventory(
        preFeed.source_id,
        routeId,
        boundary.preDate,
      );
      postInventory = boundaryInventory(
        postFeed.source_id,
        routeId,
        boundary.postDate,
      );
      const detail = sourceRow.anchors.find((anchor) =>
        /(?:get more details|learn more).*service/iu.test(anchor.text));
      const timetable = sourceRow.anchors.find((anchor) =>
        /timetable/iu.test(anchor.text));
      if (!detail || !timetable) {
        throw new Error(`${routeId}: exact candidate document anchors missing`);
      }
      const exactUrlSearches = [
        {
          source_role: "candidate_specific_service_detail" as const,
          source_url: detail.href,
          matched_staged_source_ids:
            stagedSourceIdsByExactUrl.get(detail.href) ?? [],
        },
        {
          source_role:
            "candidate_specific_schedule_or_timetable" as const,
          source_url: timetable.href,
          matched_staged_source_ids:
            stagedSourceIdsByExactUrl.get(timetable.href) ?? [],
        },
      ];
      if (exactUrlSearches.some((search) =>
        search.matched_staged_source_ids.length !== 0)) {
        throw new Error(`${routeId}: candidate document is no longer missing`);
      }
      documentGap = {
        required_source_roles: [
          "candidate_specific_service_detail",
          "candidate_specific_schedule_or_timetable",
        ],
        exact_url_searches: exactUrlSearches.map((search) => ({
          ...search,
          matched_staged_source_ids: [] as [],
        })),
        source_role_gap_codes: [
          "candidate_specific_service_detail_not_staged",
          "candidate_specific_schedule_or_timetable_not_staged",
        ],
        binding_status: "blocked_missing_staged_candidate_document",
        external_acquisition_performed: false,
      };
      unresolvedGapCodes.push(
        "candidate_specific_service_detail_not_staged",
        "candidate_specific_schedule_or_timetable_not_staged",
        "active_boundary_inventory_is_nonauthorizing_without_candidate_document",
      );
      roleSearches.push(
        `source_role=candidate_specific_service_detail exact_url=${detail.href} staged_match_count=0`,
        `source_role=candidate_specific_schedule_or_timetable exact_url=${timetable.href} staged_match_count=0`,
      );
    }

    if (
      preInventory.feed_family !== postInventory.feed_family ||
      preInventory.active_route_trip_count === 0 ||
      postInventory.active_route_trip_count === 0
    ) {
      throw new Error(`${routeId}: same-family active inventory drifted`);
    }
    return {
      candidate_key: extentDecisionKey(extent),
      occurrence_id: extent.occurrence_id,
      route_record_id: extent.route_record_id,
      treatment_record_id: treatmentId,
      treatment_family: "service_pattern",
      gtfs_route_id: routeId,
      risk_wave_id: waveId,
      source_statement: {
        source_id: treatment.source_id,
        evidence_id: evidenceRef.evidence_id,
        block_id: evidenceRef.block_id,
        block_sha256: evidenceRef.text_sha256,
        treatment_kind: treatment.payload.treatment_kind,
        raw_text: treatment.raw_text,
      },
      source_row: sourceRow,
      exact_candidate_searches: uniqueSorted([
        `occurrence_id=${extent.occurrence_id} treatment_record_id=${treatmentId}`,
        `route=${routeId} exact_statement=${JSON.stringify(treatment.raw_text)}`,
        `source_id=${treatment.source_id} evidence_id=${evidenceRef.evidence_id}`,
        ...roleSearches,
      ]),
      immutable_p2_p4_context: immutableContext,
      boundary_inventory: {
        pre: preInventory,
        post: postInventory,
        same_feed_family: true,
        both_boundaries_active: true,
      },
      schedule_to_gtfs_shape_gap: shapeGap,
      candidate_document_gap: documentGap,
      ledger_snapshot: ledgerSnapshot(
        extent.occurrence_id,
        extent.route_record_id,
        treatmentId,
      ),
      unresolved_gap_codes: uniqueSorted(unresolvedGapCodes),
      evidence_verdict: "receipt_terminal_unresolved",
      proposed_extent_decision: null,
      proposed_grain_decision: null,
      persisted_extent_decision: null,
      persisted_grain_decision: null,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
    } satisfies Plan040Package8CandidateEvidence;
  },
);

const keys = candidates.map((candidate) => candidate.candidate_key).sort();
if (
  sha256(`${keys.join("\n")}\n`) !==
    PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256
) {
  throw new Error("Package 8 exact candidate hash drifted");
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
  package_7: priorKeys(P7_DRAFT_PATH),
  exemplar: priorKeys(EXEMPLAR_PATH),
};

const evidence = {
  schema_version: 1,
  manifest_id: "plan-040-qbnr-service-pattern-package-8-evidence-v1",
  immutable_reuse: {
    package_2: {
      acquisition: {
        path: P2_ACQUISITION_PATH,
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_2.acquisition,
      },
      evidence: {
        path: P2_EVIDENCE_PATH,
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_2.evidence,
      },
      draft: {
        path: P2_DRAFT_PATH,
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_2.draft,
      },
    },
    package_4: {
      acquisition: {
        path: P4_ACQUISITION_PATH,
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_4.acquisition,
      },
      evidence: {
        path: P4_EVIDENCE_PATH,
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_4.evidence,
      },
      draft: {
        path: P4_DRAFT_PATH,
        sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.package_4.draft,
      },
    },
    accepted_launch_feed_identities: feedIdentities,
    source_bytes_recomputed: false,
    external_acquisition_performed: false,
  },
  service_change_source: {
    source_id: "mta_queens_bus_network_redesign_service_changes",
    source_html_path: SERVICE_HTML_PATH,
    source_html_sha256: PLAN040_PACKAGE_8_SERVICE_CHANGE_HTML_SHA256,
  },
  candidate_count: 30,
  route_count: 18,
  candidate_key_sha256: PLAN040_PACKAGE_8_CANDIDATE_KEY_SHA256,
  wave_partition: PLAN040_PACKAGE_8_WAVES,
  scope_reconciliation: {
    prior_wave_b_estimate: 16,
    exact_wave_b_count: 15,
    reconciliation:
      "reconciled_to_exact_ledger_rows_no_one_boundary_route_added",
    guessed_candidate_count: 0,
    forced_one_boundary_route_count: 0,
  },
  current_outcome_distribution: {
    receipt_terminal_unresolved: 30,
  },
  pristine_ledger_inputs: {
    extent: {
      path: EXTENT_LEDGER_PATH,
      sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.extent_ledger,
      candidate_count: 30,
      verdict_distribution: { unreviewed: 30 },
    },
    grain: {
      path: GRAIN_LEDGER_PATH,
      sha256: PLAN040_PACKAGE_8_IMMUTABLE_INPUT_PINS.grain_ledger,
      candidate_count: 30,
      verdict_distribution: { unreviewed: 30 },
      spatial_verdict_distribution: { unreviewed: 30 },
    },
  },
  staged_candidate_document_search: {
    metadata_file_count: stagedMetadataCount,
    exact_url_match_count: 0,
    external_acquisition_performed: false,
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
  evidence_policy: {
    occurrence_inference_from_route_or_schedule_presence: false,
    cross_route_or_predecessor_lineage_inference: false,
    active_inventory_without_candidate_document_is_nonauthorizing: true,
    schedule_shape_mismatch_is_terminal_until_new_exact_binding_evidence: true,
  },
  candidates,
  review_protocol: {
    risk_review_reason: "source_gaps",
    dual_independent_review_required: true,
    owner_gate_allowed_before_dual_review: false,
    persistence_allowed_before_owner_gate: false,
  },
  authorization_state:
    "evidence_draft_pending_dual_independent_source_gap_review_no_gate_no_acceptance_no_persistence",
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const evidenceBytes = stableBytes(evidence);
const evidenceSha256 = sha256(evidenceBytes);
const draft = buildPlan040Package8Draft({
  evidenceManifestPath: EVIDENCE_PATH,
  evidenceManifestSha256: evidenceSha256,
  candidates,
  priorCandidateKeys,
});
const draftBytes = stableBytes(draft);

for (const [path, bytes] of [
  [EVIDENCE_PATH, evidenceBytes],
  [DRAFT_PATH, draftBytes],
] as const) {
  if (check) {
    if (!existsSync(absolute(path)) || read(path) !== bytes) {
      throw new Error(`${path}: frozen Package 8 artifact is stale`);
    }
  } else {
    writeFileSync(absolute(path), bytes);
  }
}

console.log(JSON.stringify({
  status: check ? "checked" : "generated",
  evidence_manifest: { path: EVIDENCE_PATH, sha256: evidenceSha256 },
  decision_draft: { path: DRAFT_PATH, sha256: sha256(draftBytes) },
  replay_sha256: plan040Package8ReplayHash(draft as unknown as JsonValue),
  candidate_count: draft.candidate_count,
  route_count: draft.route_count,
  candidate_key_sha256: draft.candidate_key_sha256,
  evidence_verdict_distribution: draft.evidence_verdict_distribution,
  scope_reconciliation: draft.scope_reconciliation,
  authorization_state: draft.authorization_state,
}));
