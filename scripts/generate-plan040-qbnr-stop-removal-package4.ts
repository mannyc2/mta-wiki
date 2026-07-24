import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { repoRoot } from "../packages/core/src/paths";
import { parseCsv } from "../packages/db/src/import-gtfs";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import type { Plan040AcquisitionCandidate } from "../packages/pipeline/src/quality/plan040-qbnr-stop-removal-acquisition";
import {
  buildPlan040Package4CandidateEvidence,
  buildPlan040Package4Draft,
  PLAN040_PACKAGE_4_ROUTE_ORDER,
  plan040Package4ReplayHash,
  type Plan040Package4BoundaryClass,
  type Plan040Package4CandidateEvidence,
  type Plan040Package4RouteId,
} from "../packages/pipeline/src/quality/plan040-qbnr-stop-removal-package4";
import type {
  Plan040Package2ScheduleSlice,
} from "../packages/pipeline/src/quality/plan040-qbnr-stop-removal-package2";
import { extentDecisionKey } from "../packages/pipeline/src/quality/study-readiness-v1";
import {
  loadGtfsStaticSnapshot,
  type GtfsStaticSnapshot,
} from "../packages/pipeline/src/reference/gtfs-static";
import { fullStopPatternsForDate } from "../packages/pipeline/src/reference/historical-full-stop";
import {
  loadOperationalSnapshotRegistry,
  snapshotById,
} from "../packages/pipeline/src/reference/snapshot-registry";

const EXTENT_LEDGER_PATH =
  "data/contracts/operational-occurrence-member-extent/v1/" +
  "operational_occurrence_member_extents.jsonl";
const GRAIN_LEDGER_PATH =
  "data/quality/operational-reference/member-grain-ledger.jsonl";
const PACKAGE2_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json";
const PACKAGE3_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-3-evidence-draft-v1.json";
const ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-4-acquisition-v1.json";
const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json";
const SERVICE_CHANGE_SOURCE_ID =
  "mta_queens_bus_network_redesign_service_changes";
const SCHEDULE_SOURCE_ID = "mta_bus_schedules_2025_candidate_windows";

const FEEDS = [
  {
    sourceId: "gtfs_static_20250615_queens_pre_qbnr",
    snapshotId: "gtfs-static-20250615-queens-pre-qbnr",
    family: "queens",
    boundary: "pre",
    zipSha1: "c96466458c55036cd6feeadc291bf5951d6c3274",
  },
  {
    sourceId: "gtfs_static_20250625_busco_pre_qbnr",
    snapshotId: "gtfs-static-20250625-busco-pre-qbnr",
    family: "busco",
    boundary: "pre",
    zipSha1: "a52f278150cd9bc03082f76fccd57f1c8c331d3c",
  },
  {
    sourceId: "gtfs_static_20250626_queens_post_qbnr",
    snapshotId: "gtfs-static-20250626-queens-post-qbnr",
    family: "queens",
    boundary: "post",
    zipSha1: "c868290ddcd79c69712d809ece96d96dbad2c613",
  },
  {
    sourceId: "gtfs_static_20250626_busco_post_qbnr",
    snapshotId: "gtfs-static-20250626-busco-post-qbnr",
    family: "busco",
    boundary: "post",
    zipSha1: "54653b3fafb5fabc5ab1c941780b871343138440",
  },
] as const;

const WEEKDAY_ONLY = new Set<Plan040Package4RouteId>([
  "Q42",
  "QM21",
  "QM32",
  "QM35",
]);
const CROSS_FAMILY_INCOMPLETE = new Set<Plan040Package4RouteId>([
  "Q29",
  "Q39",
]);
const PRE_INVENTORY_ABSENT = new Set<Plan040Package4RouteId>(["Q58"]);
const BOTH_INVENTORIES_ABSENT = new Set<Plan040Package4RouteId>([
  "Q54",
  "Q55",
  "Q59",
]);

type ExtentRow = {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  gtfs_route_id: string;
  extent: string;
  decision_id: string | null;
  missing_roles: string[];
};

type GrainRow = {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  gtfs_route_id: string;
  current_extent_kind: string;
  member_extent_decision_id: string | null;
  verdict: string;
  spatial_verdict: string;
};

type SourceBlock = {
  source_id: string;
  block_id: string;
  normalized_text: string;
  raw_text_sha256: string;
};

type PriorDraft = {
  candidate_count: number;
  candidates: Array<{ candidate_key: string }>;
};

type StopListReceipt = {
  schema_version: 1;
  receipt_id: string;
  route_ids: string[];
  source_id: string;
  source_url: string;
  source_url_derivation: {
    source_id: string;
    source_html_sha256: string;
    route_row: string;
    anchor_text: string;
  };
  retrieved_at: string;
  pdf_bytes: number;
  pdf_sha256: string;
  text_bytes: number;
  text_sha256: string;
  page_count: number;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

type ScheduleSpec = {
  scheduleDate: string;
  routeId: Plan040Package4RouteId;
  operator: "NYCT" | "MTA Bus";
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const absolute = (path: string): string => resolve(repoRoot, path);
const read = (path: string): string => readFileSync(absolute(path), "utf8");
const stableBytes = (value: unknown): string =>
  `${stableJson(value as JsonValue)}\n`;
const parseJsonl = <T>(path: string): T[] => {
  const text = read(path).trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as T) : [];
};

function sourceIdForRoute(routeId: string): string {
  return `mta_qbnr_2025_${routeId.toLowerCase()}_stop_list`;
}

function routeRows(snapshot: GtfsStaticSnapshot, routeId: string) {
  return snapshot.routes.filter((route) =>
    route.route_id === routeId ||
    route.route_short_name === routeId ||
    route.route_short_name.replace(/-SBS$/u, "") === routeId);
}

function routeTripRows(snapshot: GtfsStaticSnapshot, routeId: string) {
  const ids = new Set(routeRows(snapshot, routeId).map((route) => route.route_id));
  return snapshot.trips.filter((trip) => ids.has(trip.route_id));
}

function datesFor(routeId: Plan040Package4RouteId): {
  pre: string;
  post: string;
} {
  return WEEKDAY_ONLY.has(routeId)
    ? { pre: "2025-06-27", post: "2025-06-30" }
    : { pre: "2025-06-28", post: "2025-06-29" };
}

function boundaryClass(routeId: Plan040Package4RouteId):
  Plan040Package4BoundaryClass {
  if (CROSS_FAMILY_INCOMPLETE.has(routeId)) {
    return "cross_family_transfer_incomplete";
  }
  if (PRE_INVENTORY_ABSENT.has(routeId)) return "pre_inventory_absent";
  if (BOTH_INVENTORIES_ABSENT.has(routeId)) {
    return "both_boundary_inventories_absent";
  }
  return WEEKDAY_ONLY.has(routeId)
    ? "complete_weekday_launch_boundary"
    : "complete_weekend_launch_boundary";
}

function verifyStopList(routeId: Plan040Package4RouteId) {
  const sourceId = sourceIdForRoute(routeId);
  const base = `raw/sources/${sourceId}`;
  const receiptPath = `${base}/receipt.json`;
  const pdfPath = `${base}/source.pdf`;
  const textPath = `${base}/text.txt`;
  const rawTextPath = `${base}/text_raw.txt`;
  const blocksPath = `${base}/blocks.jsonl`;
  const receiptText = read(receiptPath);
  const receipt = JSON.parse(receiptText) as StopListReceipt;
  const pdf = readFileSync(absolute(pdfPath));
  const text = readFileSync(absolute(textPath));
  const rawText = readFileSync(absolute(rawTextPath));
  const blocks = readFileSync(absolute(blocksPath));
  if (
    receipt.schema_version !== 1 ||
    stableJson(receipt.route_ids as unknown as JsonValue) !==
      stableJson([routeId] as unknown as JsonValue) ||
    receipt.source_id !== sourceId ||
    receipt.source_url_derivation.source_id !== SERVICE_CHANGE_SOURCE_ID ||
    receipt.source_url_derivation.route_row !== routeId ||
    receipt.source_url_derivation.anchor_text !==
      "View the full list of stops." ||
    receipt.pdf_bytes !== pdf.byteLength ||
    receipt.pdf_sha256 !== sha256(pdf) ||
    receipt.text_bytes !== text.byteLength ||
    receipt.text_sha256 !== sha256(text) ||
    receipt.authorizes_occurrence !== false ||
    receipt.authorizes_study !== false ||
    receipt.authorizes_cross_product !== false ||
    blocks.byteLength === 0
  ) {
    throw new Error(`${routeId}: stop-list source or receipt drifted`);
  }
  return {
    route_id: routeId,
    source_id: sourceId,
    source_url: receipt.source_url,
    source_url_derivation: receipt.source_url_derivation,
    retrieved_at: receipt.retrieved_at,
    receipt_path: receiptPath,
    receipt_sha256: sha256(receiptText),
    pdf_path: pdfPath,
    pdf_sha256: receipt.pdf_sha256,
    pdf_bytes: receipt.pdf_bytes,
    page_count: receipt.page_count,
    layout_text_path: textPath,
    layout_text_sha256: receipt.text_sha256,
    raw_text_path: rawTextPath,
    raw_text_sha256: sha256(rawText),
    blocks_path: blocksPath,
    blocks_sha256: sha256(blocks),
    blocks_jsonl: blocks.toString("utf8"),
    layout_text: text.toString("utf8"),
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
    authorizes_decision_persistence: false as const,
  };
}

async function scanSchedule(
  specs: readonly ScheduleSpec[],
): Promise<{
  input: {
    source_id: string;
    source_path: string;
    source_csv_sha256: string;
    source_bytes: number;
    acquisition_receipt_path: string;
    acquisition_receipt_sha256: string;
    blocks_path: string;
    blocks_sha256: string;
  };
  slices: Plan040Package2ScheduleSlice[];
}> {
  const sourcePath = `raw/sources/${SCHEDULE_SOURCE_ID}/source.csv`;
  const receiptPath = `raw/sources/${SCHEDULE_SOURCE_ID}/receipt.json`;
  const blocksPath = `raw/sources/${SCHEDULE_SOURCE_ID}/blocks.jsonl`;
  const receiptText = read(receiptPath);
  const receipt = JSON.parse(receiptText) as {
    source_id?: string;
    merged_sha256: string;
  };
  const hash = createHash("sha256");
  const stream = createReadStream(absolute(sourcePath));
  stream.on("data", (chunk) => hash.update(chunk));
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | undefined;
  const accumulators = new Map(specs.map((spec) => [
    `${spec.scheduleDate}T00:00:00.000\u0000${spec.routeId}`,
    {
      spec,
      rowCount: 0,
      operators: new Set<string>(),
      tripTypes: new Map<string, number>(),
      shapes: new Map<string, Map<string, number>>(),
    },
  ]));
  for await (const line of lines) {
    if (!header) {
      header = parseCsv(`${line}\n`)[0];
      if (
        !header ||
        header[0] !== "schedule_date" ||
        header[3] !== "operator" ||
        header[6] !== "shape_id" ||
        header[7] !== "trip_type" ||
        header[8] !== "route_id"
      ) {
        throw new Error(`${SCHEDULE_SOURCE_ID}: schedule header drifted`);
      }
      continue;
    }
    if (!line) continue;
    const first = line.split(",", 9);
    const unquote = (value: string | undefined): string =>
      value?.replace(/^"|"$/gu, "") ?? "";
    const accumulator = accumulators.get(
      `${unquote(first[0])}\u0000${unquote(first[8])}`,
    );
    if (!accumulator) continue;
    const cells = parseCsv(`${line}\n`)[0]!;
    const row = Object.fromEntries(
      header.map((name, index) => [name, cells[index] ?? ""]),
    );
    const shapeId = row.shape_id!;
    const tripType = row.trip_type!;
    accumulator.rowCount += 1;
    accumulator.operators.add(row.operator!);
    accumulator.tripTypes.set(
      tripType,
      (accumulator.tripTypes.get(tripType) ?? 0) + 1,
    );
    const shapeTypes =
      accumulator.shapes.get(shapeId) ?? new Map<string, number>();
    shapeTypes.set(tripType, (shapeTypes.get(tripType) ?? 0) + 1);
    accumulator.shapes.set(shapeId, shapeTypes);
  }
  const sourceCsvSha256 = hash.digest("hex");
  if (
    receipt.merged_sha256 !== sourceCsvSha256 ||
    (receipt.source_id && receipt.source_id !== SCHEDULE_SOURCE_ID)
  ) {
    throw new Error(`${SCHEDULE_SOURCE_ID}: schedule receipt drifted`);
  }
  const slices = [...accumulators.values()].map((accumulator) => {
    if (
      accumulator.operators.size > 1 ||
      (
        accumulator.operators.size === 1 &&
        !accumulator.operators.has(accumulator.spec.operator)
      )
    ) {
      throw new Error(
        `${accumulator.spec.routeId} ${accumulator.spec.scheduleDate}: ` +
        `expected ${accumulator.spec.operator}; observed ` +
        `${[...accumulator.operators].join(",")}`,
      );
    }
    const passenger: string[] = [];
    const nonrevenue: string[] = [];
    const ambiguous: string[] = [];
    const shapeTripTypeRows = [...accumulator.shapes.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([shapeId, types]) => {
        const hasPassenger = [...types.keys()].some((type) =>
          !["2", "3", "4"].includes(type));
        const hasNonrevenue = [...types.keys()].some((type) =>
          ["2", "3", "4"].includes(type));
        if (hasPassenger && hasNonrevenue) ambiguous.push(shapeId);
        else if (hasPassenger) passenger.push(shapeId);
        else nonrevenue.push(shapeId);
        return {
          shape_id: shapeId,
          trip_type_rows: Object.fromEntries(
            [...types.entries()].sort(([left], [right]) =>
              left.localeCompare(right)),
          ),
        };
      });
    return {
      source_id: SCHEDULE_SOURCE_ID,
      schedule_date: accumulator.spec.scheduleDate,
      route_id: accumulator.spec.routeId,
      operator: accumulator.spec.operator,
      row_count: accumulator.rowCount,
      trip_type_rows: Object.fromEntries(
        [...accumulator.tripTypes.entries()].sort(([left], [right]) =>
          left.localeCompare(right)),
      ),
      passenger_shape_ids: passenger,
      nonrevenue_shape_ids: nonrevenue,
      ambiguous_shape_ids: ambiguous,
      shape_trip_type_rows: shapeTripTypeRows,
    } satisfies Plan040Package2ScheduleSlice;
  }).sort((left, right) =>
    `${left.schedule_date}\u0000${left.route_id}`.localeCompare(
      `${right.schedule_date}\u0000${right.route_id}`,
    ));
  return {
    input: {
      source_id: SCHEDULE_SOURCE_ID,
      source_path: sourcePath,
      source_csv_sha256: sourceCsvSha256,
      source_bytes: statSync(absolute(sourcePath)).size,
      acquisition_receipt_path: receiptPath,
      acquisition_receipt_sha256: sha256(receiptText),
      blocks_path: blocksPath,
      blocks_sha256: sha256(read(blocksPath)),
    },
    slices,
  };
}

const extentLedgerText = read(EXTENT_LEDGER_PATH);
const grainLedgerText = read(GRAIN_LEDGER_PATH);
const extentRows = parseJsonl<ExtentRow>(EXTENT_LEDGER_PATH);
const grainRows = parseJsonl<GrainRow>(GRAIN_LEDGER_PATH);
const serviceBlocks = parseJsonl<SourceBlock>(
  `raw/sources/${SERVICE_CHANGE_SOURCE_ID}/blocks.jsonl`,
);
const expectedRoutes = new Set<string>(PLAN040_PACKAGE_4_ROUTE_ORDER);
const selectedExtentRows = extentRows.filter((row) =>
  expectedRoutes.has(row.gtfs_route_id) &&
  row.treatment_record_id ===
    `treatment_${row.gtfs_route_id.toLowerCase()}-stop-removal-2025`);
if (selectedExtentRows.length !== 23) {
  throw new Error(
    `Package 4 expected exact 23 extent rows, got ${selectedExtentRows.length}`,
  );
}
const extentByRoute = new Map(selectedExtentRows.map((row) => [
  row.gtfs_route_id as Plan040Package4RouteId,
  row,
]));
for (const routeId of PLAN040_PACKAGE_4_ROUTE_ORDER) {
  const extent = extentByRoute.get(routeId);
  if (
    !extent ||
    extent.extent !== "unresolved" ||
    extent.decision_id !== null ||
    stableJson(extent.missing_roles as unknown as JsonValue) !==
      stableJson(["reviewed_extent_decision"] as unknown as JsonValue)
  ) {
    throw new Error(`${routeId}: extent ledger is not unresolved`);
  }
  const matchingGrain = grainRows.filter((row) =>
    row.occurrence_id === extent.occurrence_id &&
    row.route_record_id === extent.route_record_id &&
    row.treatment_record_id === extent.treatment_record_id);
  if (
    matchingGrain.length !== 1 ||
    matchingGrain[0]!.current_extent_kind !== "unresolved" ||
    matchingGrain[0]!.member_extent_decision_id !== null ||
    matchingGrain[0]!.verdict !== "unreviewed" ||
    matchingGrain[0]!.spatial_verdict !== "unreviewed"
  ) {
    throw new Error(`${routeId}: grain ledger parity is not unresolved`);
  }
}

const package2Text = read(PACKAGE2_PATH);
const package3Text = read(PACKAGE3_PATH);
const package2 = JSON.parse(package2Text) as PriorDraft;
const package3 = JSON.parse(package3Text) as PriorDraft;
const package4Keys = new Set(selectedExtentRows.map((row) =>
  extentDecisionKey(row)));
const overlap = (prior: PriorDraft): number =>
  prior.candidates.filter((candidate) =>
    package4Keys.has(candidate.candidate_key)).length;
if (overlap(package2) !== 0 || overlap(package3) !== 0) {
  throw new Error("Package 4 overlaps Package 2 or Package 3");
}

const registry = loadOperationalSnapshotRegistry();
const routeIds = new Set<string>(PLAN040_PACKAGE_4_ROUTE_ORDER);
const loadedFeeds = new Map<string, GtfsStaticSnapshot>();
const feedInputs = FEEDS.map((feed) => {
  const receiptPath = `raw/sources/${feed.sourceId}/receipt.json`;
  const receiptText = read(receiptPath);
  const receipt = JSON.parse(receiptText) as {
    source_id: string;
    snapshot_id: string;
    zip_sha1: string;
    zip_sha256: string;
    zip_bytes: number;
    service_window: { start: string; end: string };
  };
  if (
    receipt.source_id !== feed.sourceId ||
    receipt.snapshot_id !== feed.snapshotId ||
    receipt.zip_sha1 !== feed.zipSha1
  ) {
    throw new Error(`${feed.sourceId}: accepted feed identity drifted`);
  }
  loadedFeeds.set(
    feed.sourceId,
    loadGtfsStaticSnapshot(
      snapshotById(registry, feed.snapshotId),
      ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
      repoRoot,
      routeIds,
    ),
  );
  return {
    source_id: feed.sourceId,
    snapshot_id: feed.snapshotId,
    family: feed.family,
    boundary: feed.boundary,
    receipt_path: receiptPath,
    receipt_sha256: sha256(receiptText),
    zip_sha1: receipt.zip_sha1,
    zip_sha256: receipt.zip_sha256,
    zip_bytes: receipt.zip_bytes,
    service_window: receipt.service_window,
  };
});

function selectedFeed(
  routeId: Plan040Package4RouteId,
  side: "pre" | "post",
) {
  const candidates = FEEDS.filter((feed) => feed.boundary === side).map((feed) => {
    const snapshot = loadedFeeds.get(feed.sourceId)!;
    return {
      ...feed,
      routeRowCount: routeRows(snapshot, routeId).length,
      routeTripRowCount: routeTripRows(snapshot, routeId).length,
    };
  });
  const withTrips = candidates.filter((candidate) =>
    candidate.routeTripRowCount > 0);
  if (withTrips.length === 1) return withTrips[0]!;
  if (withTrips.length > 1) {
    throw new Error(`${routeId} ${side}: ambiguous feed-family trip inventory`);
  }
  const withRoute = candidates.filter((candidate) =>
    candidate.routeRowCount > 0);
  if (withRoute.length !== 1) {
    throw new Error(`${routeId} ${side}: no unique route-row feed family`);
  }
  return withRoute[0]!;
}

const stopLists = PLAN040_PACKAGE_4_ROUTE_ORDER.map(verifyStopList);
const candidateInputs = PLAN040_PACKAGE_4_ROUTE_ORDER.map((routeId) => {
  const extent = extentByRoute.get(routeId)!;
  const dates = datesFor(routeId);
  const preFeed = selectedFeed(routeId, "pre");
  const postFeed = selectedFeed(routeId, "post");
  const preSnapshot = loadedFeeds.get(preFeed.sourceId)!;
  const postSnapshot = loadedFeeds.get(postFeed.sourceId)!;
  const prePatterns = fullStopPatternsForDate(preSnapshot, dates.pre, routeId);
  const postPatterns = fullStopPatternsForDate(postSnapshot, dates.post, routeId);
  const preActiveTripCount = prePatterns.reduce(
    (sum, pattern) => sum + pattern.trip_count,
    0,
  );
  const postActiveTripCount = postPatterns.reduce(
    (sum, pattern) => sum + pattern.trip_count,
    0,
  );
  const classification = boundaryClass(routeId);
  const expectedComplete = classification.startsWith("complete_");
  if (
    expectedComplete !==
      (preActiveTripCount > 0 && postActiveTripCount > 0)
  ) {
    throw new Error(`${routeId}: expected boundary classification drifted`);
  }
  if (
    CROSS_FAMILY_INCOMPLETE.has(routeId) &&
    !(preFeed.family === "busco" && postFeed.family === "queens")
  ) {
    throw new Error(`${routeId}: cross-family transfer binding drifted`);
  }
  const block = serviceBlocks.find((candidate) =>
    candidate.normalized_text.startsWith(`${routeId} | Changes`));
  if (!block) throw new Error(`${routeId}: service-change block missing`);
  const dateMatch = block.normalized_text.match(
    /took effect (June 29|June 30), 2025\./u,
  );
  if (!dateMatch) throw new Error(`${routeId}: implementation date missing`);
  const implementationDate = dateMatch[1] === "June 29"
    ? "2025-06-29"
    : "2025-06-30";
  const stopMatch = block.normalized_text.match(
    /(?:Some|Two|Three)[^.|]*stops[^.|]*have been removed(?: from this route)?\./iu,
  );
  if (!stopMatch) throw new Error(`${routeId}: stop-removal statement missing`);
  const stopList = stopLists.find((source) => source.route_id === routeId)!;
  const candidate: Plan040AcquisitionCandidate = {
    occurrence_id: extent.occurrence_id,
    route_record_id: extent.route_record_id,
    treatment_record_id: extent.treatment_record_id,
    gtfs_route_id: routeId,
    implementation_date: implementationDate,
    implementation_phase: "phase_1",
    pre_feed_family: preFeed.family,
    pre_gtfs_route_id: routeId,
    pre_source_id: preFeed.sourceId,
    pre_target_date: dates.pre,
    pre_trip_row_count: preFeed.routeTripRowCount,
    pre_active_trip_count: preActiveTripCount,
    post_feed_family: postFeed.family,
    post_gtfs_route_id: routeId,
    post_source_id: postFeed.sourceId,
    post_inspected_source_id: postFeed.sourceId,
    post_required_acquisition_role: null,
    post_target_date: dates.post,
    post_trip_row_count: postFeed.routeTripRowCount,
    post_active_trip_count: postActiveTripCount,
    inventory_group: CROSS_FAMILY_INCOMPLETE.has(routeId)
      ? "phase_1_operator_transfer_incomplete"
      : preFeed.family === "busco"
        ? "phase_1_same_family_busco"
        : "phase_1_same_family_queens",
    inventory_status: expectedComplete
      ? "accepted_reused"
      : CROSS_FAMILY_INCOMPLETE.has(routeId)
        ? "incomplete_requires_later_queens_post_inventory"
        : "required_not_yet_accepted",
    service_change_evidence_id:
      `${SERVICE_CHANGE_SOURCE_ID}#${block.block_id}`,
    service_change_block_sha256:
      block.raw_text_sha256.replace(/^sha256:/u, ""),
    official_stop_list_url: stopList.source_url,
    captured_stop_statement: stopMatch[0],
    exact_bindings: {
      route_table_row: routeId,
      stop_list_anchor_text: "View the full list of stops.",
      treatment_record_id: extent.treatment_record_id,
    },
    requires_candidate_specific_stop_id_equivalence: true,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  const boundary: Plan040Package4CandidateEvidence["boundary_evidence"] = {
    boundary_class: classification,
    complete_active_trip_boundary: expectedComplete,
    pre_feed_family: preFeed.family,
    post_feed_family: postFeed.family,
    pre_route_row_count: preFeed.routeRowCount,
    pre_route_trip_row_count: preFeed.routeTripRowCount,
    pre_active_trip_count: preActiveTripCount,
    post_route_row_count: postFeed.routeRowCount,
    post_route_trip_row_count: postFeed.routeTripRowCount,
    post_active_trip_count: postActiveTripCount,
    route_row_presence_is_not_trip_inventory: true,
    cross_family_context: CROSS_FAMILY_INCOMPLETE.has(routeId),
  };
  return { candidate, boundary, prePatterns, postPatterns, stopList };
});

const scheduleSpecs = candidateInputs.flatMap((entry) => {
  const operator = (side: "pre" | "post"): "NYCT" | "MTA Bus" => {
    const family = side === "pre"
      ? entry.candidate.pre_feed_family
      : entry.candidate.post_feed_family;
    return family === "busco" ? "MTA Bus" : "NYCT";
  };
  return [
    {
      scheduleDate: entry.candidate.pre_target_date,
      routeId: entry.candidate.gtfs_route_id as Plan040Package4RouteId,
      operator: operator("pre"),
    },
    {
      scheduleDate: entry.candidate.post_target_date,
      routeId: entry.candidate.gtfs_route_id as Plan040Package4RouteId,
      operator: operator("post"),
    },
  ];
});
const schedule = await scanSchedule(scheduleSpecs);
const sliceByKey = new Map(schedule.slices.map((slice) => [
  `${slice.schedule_date}\u0000${slice.route_id}`,
  slice,
]));
const sliceFor = (
  date: string,
  routeId: Plan040Package4RouteId,
): Plan040Package2ScheduleSlice => {
  const slice = sliceByKey.get(`${date}\u0000${routeId}`);
  if (!slice) throw new Error(`${routeId} ${date}: schedule slice missing`);
  return slice;
};

const priorPackages = [
  {
    package_id: "plan040-package2" as const,
    path: PACKAGE2_PATH,
    sha256: sha256(package2Text),
    candidate_count: package2.candidate_count,
    overlap_count: 0 as const,
  },
  {
    package_id: "plan040-package3" as const,
    path: PACKAGE3_PATH,
    sha256: sha256(package3Text),
    candidate_count: package3.candidate_count,
    overlap_count: 0 as const,
  },
];
const acquisition = {
  schema_version: 1,
  receipt_id: "plan-040-qbnr-stop-removal-package-4-acquisition-v1",
  extent_ledger: {
    path: EXTENT_LEDGER_PATH,
    sha256: sha256(extentLedgerText),
  },
  grain_ledger: {
    path: GRAIN_LEDGER_PATH,
    sha256: sha256(grainLedgerText),
  },
  prior_packages: priorPackages,
  candidate_count: 23,
  candidate_key_sha256: sha256(
    `${[...package4Keys].sort().join("\n")}\n`,
  ),
  candidate_route_order: [...PLAN040_PACKAGE_4_ROUTE_ORDER],
  candidate_parity: candidateInputs.map(({ candidate, boundary }) => ({
    candidate_key: extentDecisionKey(candidate),
    occurrence_id: candidate.occurrence_id,
    route_record_id: candidate.route_record_id,
    treatment_record_id: candidate.treatment_record_id,
    gtfs_route_id: candidate.gtfs_route_id,
    implementation_date: candidate.implementation_date,
    pre_source_id: candidate.pre_source_id,
    pre_target_date: candidate.pre_target_date,
    pre_route_trip_row_count: boundary.pre_route_trip_row_count,
    pre_active_trip_count: boundary.pre_active_trip_count,
    post_source_id: candidate.post_source_id,
    post_target_date: candidate.post_target_date,
    post_route_trip_row_count: boundary.post_route_trip_row_count,
    post_active_trip_count: boundary.post_active_trip_count,
    boundary_class: boundary.boundary_class,
    complete_active_trip_boundary: boundary.complete_active_trip_boundary,
    route_row_presence_is_not_trip_inventory: true,
  })),
  accepted_launch_feeds: feedInputs,
  stop_list_source_count: 23,
  stop_list_sources: stopLists.map(({
    layout_text: _layoutText,
    blocks_jsonl: _blocksJsonl,
    ...source
  }) => source),
  total_pdf_bytes: stopLists.reduce((sum, source) =>
    sum + source.pdf_bytes, 0),
  schedule_input: schedule.input,
  schedule_slice_count: schedule.slices.length,
  schedule_slices: schedule.slices,
  schedule_trip_type_policy: {
    passenger: "any trip_type other than 2, 3, or 4",
    nonrevenue_excluded: ["2", "3", "4"],
    mixed_passenger_and_nonrevenue:
      "reviewed_unresolved_ambiguous_trip_type",
    gtfs_shape_absent_from_exact_slice:
      "reviewed_unresolved_unmatched_shape",
  },
  correction_version_semantics: {
    accepted_launch_feeds_only: true,
    corrections_are_separate_non_authorizing_context: true,
  },
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const acquisitionBytes = stableBytes(acquisition);
const acquisitionSha256 = sha256(acquisitionBytes);

const evidenceCandidates = candidateInputs.map((entry) =>
  buildPlan040Package4CandidateEvidence({
    candidate: entry.candidate,
    boundary: entry.boundary,
    stopListSourceId: entry.stopList.source_id,
    stopListPdfSha256: entry.stopList.pdf_sha256,
    stopListLayoutTextSha256: entry.stopList.layout_text_sha256,
    stopListRawTextSha256: entry.stopList.raw_text_sha256,
    stopListText: entry.stopList.layout_text,
    stopListBlocksJsonl: entry.stopList.blocks_jsonl,
    prePatterns: entry.prePatterns,
    postPatterns: entry.postPatterns,
    preScheduleSlice: sliceFor(
      entry.candidate.pre_target_date,
      entry.candidate.gtfs_route_id as Plan040Package4RouteId,
    ),
    postScheduleSlice: sliceFor(
      entry.candidate.post_target_date,
      entry.candidate.gtfs_route_id as Plan040Package4RouteId,
    ),
  }));
const evidence = {
  schema_version: 1,
  manifest_id: "plan-040-qbnr-stop-removal-package-4-evidence-v1",
  acquisition_receipt: {
    path: ACQUISITION_PATH,
    sha256: acquisitionSha256,
  },
  candidate_count: 23,
  candidate_key_sha256: acquisition.candidate_key_sha256,
  candidates: evidenceCandidates,
  equivalence_policy: {
    automatic_equivalence: "identical_stop_id_only",
    changed_id_name_coordinate_or_proximity_equivalence: false,
    route_row_presence_is_trip_inventory: false,
  },
  correction_version_semantics: acquisition.correction_version_semantics,
  authorization_state: "evidence_only_draft_not_reviewed_or_accepted",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const evidenceBytes = stableBytes(evidence);
const evidenceSha256 = sha256(evidenceBytes);
const draft = buildPlan040Package4Draft({
  extentLedger: acquisition.extent_ledger,
  grainLedger: acquisition.grain_ledger,
  priorPackages,
  acquisitionReceiptPath: ACQUISITION_PATH,
  acquisitionReceiptSha256: acquisitionSha256,
  evidenceManifestPath: EVIDENCE_PATH,
  evidenceManifestSha256: evidenceSha256,
  candidates: evidenceCandidates,
});
const draftBytes = stableBytes(draft);

const outputs = [
  [ACQUISITION_PATH, acquisitionBytes],
  [EVIDENCE_PATH, evidenceBytes],
  [DRAFT_PATH, draftBytes],
] as const;
const check = process.argv.includes("--check");
for (const [path, bytes] of outputs) {
  if (check) {
    if (!existsSync(absolute(path)) || read(path) !== bytes) {
      throw new Error(`${path}: frozen Package 4 artifact is stale`);
    }
  } else {
    writeFileSync(absolute(path), bytes);
  }
}

console.log(JSON.stringify({
  status: check ? "checked" : "generated",
  acquisition_receipt: {
    path: ACQUISITION_PATH,
    sha256: acquisitionSha256,
  },
  evidence_manifest: {
    path: EVIDENCE_PATH,
    sha256: evidenceSha256,
  },
  decision_draft: {
    path: DRAFT_PATH,
    sha256: sha256(draftBytes),
  },
  replay_sha256: plan040Package4ReplayHash(
    draft as unknown as JsonValue,
  ),
  candidate_count: draft.candidate_count,
  candidate_key_sha256: draft.candidate_key_sha256,
  boundary_distribution: draft.boundary_distribution,
  evidence_verdict_distribution: draft.evidence_verdict_distribution,
  proposed_extent_distribution: draft.proposed_extent_distribution,
  proposed_decision_count: draft.proposed_decision_count,
  persisted_decision_count: draft.persisted_decision_count,
  proposed_grain_distribution: draft.proposed_grain_distribution,
  proposed_grain_decision_count: draft.proposed_grain_decision_count,
  persisted_grain_decision_count: draft.persisted_grain_decision_count,
  authorization_state: draft.authorization_state,
}));
