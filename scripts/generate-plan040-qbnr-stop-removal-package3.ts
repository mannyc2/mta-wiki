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
import { parseCsv as parseCsvRows } from "../packages/db/src/import-gtfs";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  buildPlan040Package3Draft,
  PLAN040_PACKAGE_3_ROUTE_ORDER,
  PLAN040_PHASE_2_INITIAL_BUSCO_SHA1,
  PLAN040_PHASE_2_LATER_BUSCO_SHA1,
  PLAN040_PHASE_2_PRE_BUSCO_SHA1,
  PLAN040_Q67_CORRECTION_SHA1,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256,
  plan040Package3ReplayHash,
  type Plan040Package3CandidateEvidence,
  type Plan040Package3RouteId,
  type Plan040Package3ScheduleSlice,
  type Plan040Package3StopListBlock,
} from "../packages/pipeline/src/quality/plan040-qbnr-stop-removal-package3";
import type {
  Plan040AcquisitionCandidate,
} from "../packages/pipeline/src/quality/plan040-qbnr-stop-removal-acquisition";
import { parseCsv as parseGtfsRecords } from "../packages/pipeline/src/reference/gtfs-static";
import { extentDecisionKey } from "../packages/pipeline/src/quality/study-readiness-v1";

const PACKAGE1_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-acquisition-manifest-v1.json";
const ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-3-acquisition-v1.json";
const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-3-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-3-evidence-draft-v1.json";
const SCHEDULE_SOURCE_ID = "mta_bus_schedules_2025_candidate_windows";
const SERVICE_CHANGE_SOURCE_ID =
  "mta_queens_bus_network_redesign_service_changes";

type Package1Manifest = {
  candidates: Plan040AcquisitionCandidate[];
};

type StopListReceipt = {
  schema_version: 1;
  receipt_id: string;
  route_ids: string[];
  source_id: string;
  source_url: string;
  final_url: string;
  retrieved_at: string;
  content_type: string;
  content_disposition: string | null;
  pdf_bytes: number;
  pdf_sha256: string;
  text_bytes: number;
  text_sha256: string;
  page_count: number;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

type GtfsReceipt = {
  schema_version: 1;
  source_id: string;
  snapshot_id: string;
  retrieved_at: string;
  official_origin_url: string;
  archive_transport_url: string;
  archive_timestamp: string;
  provenance_urls: string[];
  zip_bytes: number;
  zip_sha1: string;
  zip_sha256: string;
  service_window: { start: string; end: string };
  members: Array<{
    member: string;
    bytes: number;
    rows: number;
    sha256: string;
  }>;
};

type SourceBlock = {
  source_id: string;
  block_id: string;
  page_number: number;
  raw_text: string;
  normalized_text: string;
  raw_text_sha256: string;
};

type ScheduleSpec = {
  scheduleDate: string;
  routeId: Plan040Package3RouteId;
  operator: "NYCT" | "MTA Bus";
};

type PreInventory = Plan040Package3CandidateEvidence["pre_inventory"];

const sha = (
  algorithm: "sha1" | "sha256",
  value: Uint8Array | string,
): string => createHash(algorithm).update(value).digest("hex");
const sha256 = (value: Uint8Array | string): string => sha("sha256", value);
const read = (path: string): string =>
  readFileSync(resolve(repoRoot, path), "utf8");
const absolute = (path: string): string => resolve(repoRoot, path);
const stableBytes = (value: unknown): string =>
  `${stableJson(value as JsonValue)}\n`;
const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values.filter(Boolean))].sort();

function parseJsonl<T>(path: string): T[] {
  const text = read(path).trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as T) : [];
}

function sourceIdForRoutes(routeIds: readonly string[]): string {
  return `mta_qbnr_2025_${routeIds
    .map((routeId) => routeId.toLowerCase())
    .join("_")}_stop_list`;
}

function sourceIdForRoute(routeId: Plan040Package3RouteId): string {
  return routeId === "Q33" || routeId === "Q47"
    ? sourceIdForRoutes(["Q33", "Q47"])
    : sourceIdForRoutes([routeId]);
}

function verifyStopListSource(
  sourceId: string,
  expectedRouteIds: readonly string[],
): {
  receipt: StopListReceipt;
  receipt_path: string;
  receipt_sha256: string;
  pdf_path: string;
  pdf_sha256: string;
  pdf_bytes: number;
  layout_text_path: string;
  layout_text_sha256: string;
  raw_text_path: string;
  raw_text_sha256: string;
  blocks_path: string;
  blocks_sha256: string;
  page_count: number;
  removed_statement_blocks: Plan040Package3StopListBlock[];
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
} {
  const base = `raw/sources/${sourceId}`;
  const receiptPath = `${base}/receipt.json`;
  const pdfPath = `${base}/source.pdf`;
  const layoutTextPath = `${base}/text.txt`;
  const rawTextPath = `${base}/text_raw.txt`;
  const blocksPath = `${base}/blocks.jsonl`;
  const receiptText = read(receiptPath);
  const receipt = JSON.parse(receiptText) as StopListReceipt;
  const pdf = readFileSync(absolute(pdfPath));
  const layoutText = readFileSync(absolute(layoutTextPath));
  const rawText = readFileSync(absolute(rawTextPath));
  const blocksText = read(blocksPath);
  const blocks = parseJsonl<SourceBlock>(blocksPath);
  const routeParity =
    stableJson(receipt.route_ids as JsonValue) ===
      stableJson([...expectedRouteIds] as JsonValue);
  if (
    receipt.schema_version !== 1 ||
    !routeParity ||
    receipt.source_id !== sourceId ||
    receipt.content_type !== "application/pdf" ||
    receipt.pdf_bytes !== pdf.byteLength ||
    receipt.pdf_sha256 !== sha256(pdf) ||
    receipt.text_bytes !== layoutText.byteLength ||
    receipt.text_sha256 !== sha256(layoutText) ||
    blocks.length === 0 ||
    receipt.authorizes_occurrence !== false ||
    receipt.authorizes_study !== false ||
    receipt.authorizes_cross_product !== false
  ) {
    throw new Error(`${sourceId}: exact stop-list source or receipt drifted`);
  }
  const removedStatementBlocks = blocks
    .filter((block) => /\bremoved\b/iu.test(block.normalized_text))
    .map((block) => ({
      evidence_id: `${sourceId}#${block.block_id}`,
      block_id: block.block_id,
      page_number: block.page_number,
      raw_text_sha256: block.raw_text_sha256.replace(/^sha256:/u, ""),
      normalized_text: block.normalized_text,
    }));
  if (removedStatementBlocks.length === 0) {
    throw new Error(`${sourceId}: no exact removed-statement blocks recovered`);
  }
  return {
    receipt,
    receipt_path: receiptPath,
    receipt_sha256: sha256(receiptText),
    pdf_path: pdfPath,
    pdf_sha256: receipt.pdf_sha256,
    pdf_bytes: receipt.pdf_bytes,
    layout_text_path: layoutTextPath,
    layout_text_sha256: receipt.text_sha256,
    raw_text_path: rawTextPath,
    raw_text_sha256: sha256(rawText),
    blocks_path: blocksPath,
    blocks_sha256: sha256(blocksText),
    page_count: receipt.page_count,
    removed_statement_blocks: removedStatementBlocks,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  };
}

function serviceDateCompact(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new Error(`Invalid GTFS service date ${date}`);
  }
  return date.replaceAll("-", "");
}

function activeServiceIds(
  sourceId: string,
  date: string,
): string[] {
  const base = `raw/sources/${sourceId}/extracted`;
  const calendar = parseGtfsRecords(read(`${base}/calendar.txt`));
  const calendarDates = parseGtfsRecords(read(`${base}/calendar_dates.txt`));
  const compact = serviceDateCompact(date);
  const weekday = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][new Date(`${date}T00:00:00Z`).getUTCDay()]!;
  const active = new Set(
    calendar
      .filter((row) =>
        compact >= (row.start_date ?? "") &&
        compact <= (row.end_date ?? "") &&
        row[weekday] === "1")
      .map((row) => row.service_id ?? "")
      .filter(Boolean),
  );
  for (const exception of calendarDates) {
    if (exception.date !== compact || !exception.service_id) continue;
    if (exception.exception_type === "1") active.add(exception.service_id);
    if (exception.exception_type === "2") active.delete(exception.service_id);
  }
  return [...active].sort();
}

function verifyGtfsReceipt(sourceId: string): {
  receipt: GtfsReceipt;
  receipt_path: string;
  receipt_sha256: string;
  zip_path: string;
  members: Array<{
    member: string;
    bytes: number;
    rows: number;
    sha1: string;
    sha256: string;
  }>;
} {
  const base = `raw/sources/${sourceId}`;
  const receiptPath = `${base}/receipt.json`;
  const zipPath = `${base}/source.zip`;
  const receiptText = read(receiptPath);
  const receipt = JSON.parse(receiptText) as GtfsReceipt;
  const zip = readFileSync(absolute(zipPath));
  if (
    receipt.source_id !== sourceId ||
    receipt.zip_bytes !== zip.byteLength ||
    receipt.zip_sha1 !== sha("sha1", zip) ||
    receipt.zip_sha256 !== sha256(zip)
  ) {
    throw new Error(`${sourceId}: exact GTFS ZIP or receipt drifted`);
  }
  const members = receipt.members.map((member) => {
    const path = `${base}/extracted/${member.member}`;
    const bytes = readFileSync(absolute(path));
    if (
      member.bytes !== bytes.byteLength ||
      member.sha256 !== sha256(bytes)
    ) {
      throw new Error(`${sourceId}/${member.member}: GTFS member drifted`);
    }
    return {
      ...member,
      sha1: sha("sha1", bytes),
    };
  });
  return {
    receipt,
    receipt_path: receiptPath,
    receipt_sha256: sha256(receiptText),
    zip_path: zipPath,
    members,
  };
}

function buildPreInventory(
  candidate: Plan040AcquisitionCandidate,
  feed: ReturnType<typeof verifyGtfsReceipt>,
): PreInventory {
  const activeServices = activeServiceIds(
    candidate.pre_source_id,
    candidate.pre_target_date,
  );
  const active = new Set(activeServices);
  const trips = parseGtfsRecords(
    read(`raw/sources/${candidate.pre_source_id}/extracted/trips.txt`),
  ).filter((trip) => trip.route_id === candidate.pre_gtfs_route_id);
  const activeTrips = trips.filter((trip) => active.has(trip.service_id ?? ""));
  if (
    trips.length !== candidate.pre_trip_row_count ||
    activeTrips.length !== candidate.pre_active_trip_count
  ) {
    throw new Error(
      `${candidate.gtfs_route_id}: Package 1 pre-trip counts do not replay`,
    );
  }
  return {
    source_id: candidate.pre_source_id,
    zip_sha1: feed.receipt.zip_sha1,
    zip_sha256: feed.receipt.zip_sha256,
    target_date: candidate.pre_target_date,
    service_window: feed.receipt.service_window,
    active_service_ids: activeServices,
    active_service_id_sha256: sha256(`${activeServices.join("\n")}\n`),
    route_trip_row_count: trips.length,
    active_trip_count: activeTrips.length,
    active_shape_ids: uniqueSorted(
      activeTrips.map((trip) => trip.shape_id ?? ""),
    ),
  };
}

function scheduleSpecs(
  candidates: readonly Plan040AcquisitionCandidate[],
): ScheduleSpec[] {
  return candidates.flatMap((candidate) => {
    const routeId = candidate.gtfs_route_id as Plan040Package3RouteId;
    if (routeId === "Q67") {
      return [
        { scheduleDate: "2025-06-28", routeId, operator: "MTA Bus" as const },
        { scheduleDate: "2025-06-30", routeId, operator: "NYCT" as const },
      ];
    }
    return [
      { scheduleDate: "2025-08-30", routeId, operator: "MTA Bus" as const },
      { scheduleDate: "2025-08-31", routeId, operator: "MTA Bus" as const },
    ];
  });
}

async function scanScheduleSource(
  specs: readonly ScheduleSpec[],
): Promise<{
  input: {
    source_id: typeof SCHEDULE_SOURCE_ID;
    source_path: string;
    source_csv_sha256: string;
    source_bytes: number;
    acquisition_receipt_path: string;
    acquisition_receipt_sha256: string;
    blocks_path: string;
    blocks_sha256: string;
  };
  slices: Plan040Package3ScheduleSlice[];
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
      header = parseCsvRows(`${line}\n`)[0];
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
    const cells = parseCsvRows(`${line}\n`)[0]!;
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
      (accumulator.operators.size === 1 &&
        !accumulator.operators.has(accumulator.spec.operator))
    ) {
      throw new Error(
        `${accumulator.spec.routeId} ${accumulator.spec.scheduleDate}: ` +
          `expected ${accumulator.spec.operator} schedule operator`,
      );
    }
    const passenger: string[] = [];
    const nonrevenue: string[] = [];
    const ambiguous: string[] = [];
    const shapeTripTypeRows = [...accumulator.shapes.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([shapeId, types]) => {
        const hasPassenger = [...types.keys()].some(
          (type) => !["2", "3", "4"].includes(type),
        );
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
    } satisfies Plan040Package3ScheduleSlice;
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

const package1Text = read(PACKAGE1_PATH);
if (
  sha256(package1Text) !==
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256
) {
  throw new Error("Plan 040 Package 1 manifest pin drifted");
}
const package1 = JSON.parse(package1Text) as Package1Manifest;
const package1ByRoute = new Map(
  package1.candidates.map((candidate) => [
    candidate.gtfs_route_id,
    candidate,
  ]),
);
const candidates = PLAN040_PACKAGE_3_ROUTE_ORDER.map((routeId) => {
  const candidate = package1ByRoute.get(routeId);
  if (!candidate) throw new Error(`${routeId}: Package 1 candidate missing`);
  const expectedStatus =
    routeId === "Q67"
      ? "incomplete_requires_later_queens_post_inventory"
      : "required_not_yet_accepted";
  if (candidate.inventory_status !== expectedStatus) {
    throw new Error(`${routeId}: Package 3 inventory status drifted`);
  }
  return candidate;
});

const stopSourceIds = uniqueSorted(
  candidates.map((candidate) =>
    sourceIdForRoute(candidate.gtfs_route_id as Plan040Package3RouteId)),
);
const stopSources = stopSourceIds.map((sourceId) =>
  verifyStopListSource(
    sourceId,
    sourceId === sourceIdForRoutes(["Q33", "Q47"])
      ? ["Q33", "Q47"]
      : [sourceId.match(/_q(\d+)_stop_list$/u)?.[1]]
          .filter(Boolean)
          .map((digits) => `Q${digits}`),
  ));
if (stopSources.length !== 12) {
  throw new Error(`Plan 040 Package 3 expected 12 stop-list sources`);
}
const stopSourceById = new Map(
  stopSources.map((source) => [source.receipt.source_id, source]),
);

const serviceChangeBlocks = parseJsonl<SourceBlock>(
  `raw/sources/${SERVICE_CHANGE_SOURCE_ID}/blocks.jsonl`,
);
const serviceChangeBlockByEvidenceId = new Map(
  serviceChangeBlocks.map((block) => [
    `${block.source_id}#${block.block_id}`,
    block,
  ]),
);
for (const candidate of candidates) {
  const block = serviceChangeBlockByEvidenceId.get(
    candidate.service_change_evidence_id,
  );
  if (
    !block ||
    block.raw_text_sha256.replace(/^sha256:/u, "") !==
      candidate.service_change_block_sha256 ||
    !block.normalized_text.includes(candidate.captured_stop_statement)
  ) {
    throw new Error(
      `${candidate.gtfs_route_id}: exact service-change block drifted`,
    );
  }
}

const q67PreFeed = verifyGtfsReceipt(
  "gtfs_static_20250625_busco_pre_qbnr",
);
const phase2PreFeed = verifyGtfsReceipt(
  "gtfs_static_20250626_busco_post_qbnr",
);
if (phase2PreFeed.receipt.zip_sha1 !== PLAN040_PHASE_2_PRE_BUSCO_SHA1) {
  throw new Error("Plan 040 Package 3 Phase 2 pre-feed SHA-1 drifted");
}
const preFeedBySource = new Map([
  [q67PreFeed.receipt.source_id, q67PreFeed],
  [phase2PreFeed.receipt.source_id, phase2PreFeed],
]);
const preInventories = new Map(
  candidates.map((candidate) => [
    candidate.gtfs_route_id,
    buildPreInventory(
      candidate,
      preFeedBySource.get(candidate.pre_source_id)!,
    ),
  ]),
);

const schedule = await scanScheduleSource(scheduleSpecs(candidates));
const scheduleByKey = new Map(
  schedule.slices.map((slice) => [
    `${slice.schedule_date}\u0000${slice.route_id}`,
    slice,
  ]),
);
const scheduleFor = (
  date: string,
  routeId: Plan040Package3RouteId,
): Plan040Package3ScheduleSlice => {
  const slice = scheduleByKey.get(`${date}\u0000${routeId}`);
  if (!slice) throw new Error(`${routeId} ${date}: schedule slice missing`);
  return slice;
};

const acceptedPreFeeds = [q67PreFeed, phase2PreFeed].map((feed) => ({
  source_id: feed.receipt.source_id,
  snapshot_id: feed.receipt.snapshot_id,
  temporal_role:
    feed.receipt.zip_sha1 === PLAN040_PHASE_2_PRE_BUSCO_SHA1
      ? "launch_initial_and_phase_2_pre"
      : "q67_phase_1_pre",
  receipt_path: feed.receipt_path,
  receipt_sha256: feed.receipt_sha256,
  zip_path: feed.zip_path,
  zip_bytes: feed.receipt.zip_bytes,
  zip_sha1: feed.receipt.zip_sha1,
  zip_sha256: feed.receipt.zip_sha256,
  service_window: feed.receipt.service_window,
  official_origin_url: feed.receipt.official_origin_url,
  archive_transport_url: feed.receipt.archive_transport_url,
  archive_timestamp: feed.receipt.archive_timestamp,
  retrieved_at: feed.receipt.retrieved_at,
  members: feed.members,
}));

const acquisition = {
  schema_version: 1,
  receipt_id: "plan-040-qbnr-stop-removal-package-3-acquisition-v1",
  package_1_manifest: {
    path: PACKAGE1_PATH,
    sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256,
  },
  candidate_count: 13,
  source_count: 12,
  route_order: [...PLAN040_PACKAGE_3_ROUTE_ORDER],
  stop_list_sources: stopSources.map((source) => ({
    route_ids: source.receipt.route_ids,
    source_id: source.receipt.source_id,
    source_url: source.receipt.source_url,
    final_url: source.receipt.final_url,
    retrieved_at: source.receipt.retrieved_at,
    receipt_path: source.receipt_path,
    receipt_sha256: source.receipt_sha256,
    pdf_path: source.pdf_path,
    pdf_sha256: source.pdf_sha256,
    pdf_bytes: source.pdf_bytes,
    page_count: source.page_count,
    layout_text_path: source.layout_text_path,
    layout_text_sha256: source.layout_text_sha256,
    raw_text_path: source.raw_text_path,
    raw_text_sha256: source.raw_text_sha256,
    blocks_path: source.blocks_path,
    blocks_sha256: source.blocks_sha256,
    removed_statement_blocks: source.removed_statement_blocks,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  })),
  total_pdf_bytes: stopSources.reduce(
    (sum, source) => sum + source.pdf_bytes,
    0,
  ),
  accepted_pre_feeds: acceptedPreFeeds,
  required_exact_post_versions: {
    q67_first_week_correction: {
      version_role: "q67_exact_first_week_correction",
      feed_family: "queens",
      version_sha1: PLAN040_Q67_CORRECTION_SHA1,
      zip_sha256: null,
      metadata_url:
        "https://www.transit.land/feeds/f-dr5x-mtanyctbusqueens/versions/" +
        PLAN040_Q67_CORRECTION_SHA1,
      fetched_at: "2025-06-30T15:46:28.558891Z",
      service_window: { start: "2025-06-28", end: "2025-08-30" },
      route_count: 269,
      stop_count: 1391,
      trip_count: 24721,
      stop_time_count: 652139,
      members: [
        {
          member: "calendar.txt",
          sha1: "91183ad2187f37991e266ca1f549774384614726",
          sha256: null,
        },
        {
          member: "calendar_dates.txt",
          sha1: "2cad2b1716cc4b899bc6a208307131cf44279dd8",
          sha256: null,
        },
        {
          member: "stop_times.txt",
          sha1: "00c4676204737f35524627514a0e11f8f6ad65a7",
          sha256: null,
        },
        {
          member: "stops.txt",
          sha1: "bd9d9f4d48ae4472d689c3dce8bbcb85421cb475",
          sha256: null,
        },
        {
          member: "trips.txt",
          sha1: "08d77fa5c44ba2d052cb8151765f47b13c573848",
          sha256: null,
        },
      ],
      exact_bytes_status: "blocked_exact_bytes_unavailable",
      calendar_expansion_status: "not_computed_exact_bytes_unavailable",
      ordered_stop_comparison_status: "not_computed_exact_bytes_unavailable",
    },
    phase_2_initial_busco: {
      version_role: "phase_2_initial_busco_full_stop_inventory",
      feed_family: "busco",
      version_sha1: PLAN040_PHASE_2_INITIAL_BUSCO_SHA1,
      zip_sha256: null,
      metadata_url:
        "https://www.transit.land/feeds/f-dr5r-mtabc/versions/" +
        PLAN040_PHASE_2_INITIAL_BUSCO_SHA1,
      official_origin_url:
        "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip",
      official_preview_url:
        "https://rrgtfsfeeds.s3.us-east-1.amazonaws.com/" +
        "qbnr-phase-2-gtfs-busco-preview.zip",
      fetched_at: "2025-08-25T15:55:54.819392Z",
      service_window: { start: "2025-08-31", end: "2026-01-03" },
      route_count: 92,
      stop_count: 2760,
      trip_count: 45401,
      stop_time_count: 1074297,
      members: [
        {
          member: "calendar.txt",
          rows: 32,
          sha1: "8ef559e10f82b267b39e86a22f8bcaaf14304c5d",
          sha256: null,
        },
        {
          member: "calendar_dates.txt",
          rows: 274,
          sha1: "9939b0e8589bd5e1e7e43c82246587aca6b4aed7",
          sha256: null,
        },
        {
          member: "routes.txt",
          rows: 92,
          sha1: "1cb2b8d4e64e1d1221f0d978e66c8156dc1997d1",
          sha256: null,
        },
        {
          member: "stop_times.txt",
          rows: 1074297,
          sha1: "9f1a325655e2c52ec2740afabecc4ff48596ad5d",
          sha256: null,
        },
        {
          member: "stops.txt",
          rows: 2760,
          sha1: "2ff7b942a055ff5b3b05ddcc8800a04aed18e6f1",
          sha256: null,
        },
        {
          member: "trips.txt",
          rows: 45401,
          sha1: "47ade1af05e1267eb5a3a1b618fcf5aba22af94b",
          sha256: null,
        },
      ],
      exact_bytes_status: "blocked_exact_bytes_unavailable",
      calendar_expansion_status: "not_computed_exact_bytes_unavailable",
      ordered_stop_comparison_status: "not_computed_exact_bytes_unavailable",
    },
  },
  explicitly_separate_non_substitute_versions: {
    phase_2_later_busco: {
      version_sha1: PLAN040_PHASE_2_LATER_BUSCO_SHA1,
      metadata_url:
        "https://www.transit.land/feeds/f-dr5r-mtabc/versions/" +
        PLAN040_PHASE_2_LATER_BUSCO_SHA1,
      fetched_at: "2025-09-15",
      service_window: { start: "2025-08-31", end: "2026-01-03" },
      route_count: 92,
      stop_count: 2758,
      substitution_status:
        "not_accepted_as_phase_2_initial_version_or_q67_correction",
    },
  },
  bounded_acquisition_searches: [
    {
      target_sha1: PLAN040_Q67_CORRECTION_SHA1,
      surfaces: [
        "bounded existing workspace captures",
        "Transitland public metadata",
        "Internet Archive CDX exact origin URL",
        "Common Crawl exact origin URL",
      ],
      outcome:
        "metadata_identity_found_but_no_exact_zip_or_member_bytes_accepted",
    },
    {
      target_sha1: PLAN040_PHASE_2_INITIAL_BUSCO_SHA1,
      surfaces: [
        "bounded existing workspace captures",
        "MTA developer notice and exact official preview URL",
        "Transitland public metadata",
        "Internet Archive CDX exact preview and origin URLs",
        "Common Crawl 2025-33 and 2025-38 exact preview URL",
      ],
      outcome:
        "metadata_identity_found_but_no_exact_zip_or_member_bytes_accepted",
      official_developer_notice_url:
        "https://groups.google.com/g/mtadeveloperresources/c/QK6wlq4EaWE",
      official_developer_notice_published_on: "2025-08-12",
      normal_portal_publication_on: "2025-08-27",
      preview_available_through: "2025-09-01",
      current_preview_response_on_2026_07_24: "403_forbidden",
      common_crawl_exact_url_result: "no_captures_found",
    },
    {
      surface: "NYC Transit Data Archive public S3 static GTFS holdings",
      outcome: "not_applicable_holdings_end_in_2016_no_2025_coverage",
    },
  ],
  archive_access_state: {
    bounded_local_roots_searched: [
      "/mnt/models/dev/mta-wiki/raw/sources",
      "/mnt/models/dev/bus-reliability-tracker/data/artifacts/docs",
    ],
    transitland_api_key: "absent",
    mobility_database_api_key: "absent",
    unauthenticated_metadata_does_not_substitute_for_exact_bytes: true,
  },
  schedule_input: schedule.input,
  schedule_slice_count: schedule.slices.length,
  schedule_slices: schedule.slices,
  schedule_trip_type_policy: {
    passenger: "any trip_type other than 2, 3, or 4",
    nonrevenue_excluded: ["2", "3", "4"],
    mixed_passenger_and_nonrevenue:
      "reviewed_unresolved_ambiguous_trip_type",
    schedule_shape_absent_from_exact_gtfs:
      "reviewed_unresolved_unmatched_shape",
  },
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const acquisitionBytes = stableBytes(acquisition);
const acquisitionSha256 = sha256(acquisitionBytes);

const evidenceCandidates: Plan040Package3CandidateEvidence[] =
  candidates.map((candidate) => {
    const routeId = candidate.gtfs_route_id as Plan040Package3RouteId;
    const stopSource = stopSourceById.get(sourceIdForRoute(routeId))!;
    const preInventory = preInventories.get(routeId)!;
    const preSchedule = scheduleFor(
      routeId === "Q67" ? "2025-06-28" : "2025-08-30",
      routeId,
    );
    const postSchedule = scheduleFor(
      routeId === "Q67" ? "2025-06-30" : "2025-08-31",
      routeId,
    );
    const activeShapes = new Set(preInventory.active_shape_ids);
    const matchedPassenger = preSchedule.passenger_shape_ids.filter((shapeId) =>
      activeShapes.has(shapeId));
    const unmatchedPassenger =
      preSchedule.passenger_shape_ids.filter(
        (shapeId) => !activeShapes.has(shapeId),
      );
    const preStatus =
      unmatchedPassenger.length > 0 ||
        preSchedule.ambiguous_shape_ids.length > 0
        ? matchedPassenger.length > 0
          ? "matched_with_unresolved_exclusions"
          : "reviewed_unresolved_unmatched_or_ambiguous"
        : "matched_no_unresolved_shapes";
    const unresolvedGapCodes = [
      "exact_post_gtfs_zip_bytes_unavailable",
      "post_calendar_and_calendar_dates_expansion_not_computed",
      "ordered_full_stop_diff_not_computed",
      "schedule_to_post_gtfs_binding_unresolved",
      ...(unmatchedPassenger.length > 0
        ? ["pre_schedule_shape_unmatched_to_active_gtfs"]
        : []),
      ...(preSchedule.ambiguous_shape_ids.length > 0
        ? ["pre_schedule_trip_type_mixed_shape_ambiguous"]
        : []),
      ...(postSchedule.ambiguous_shape_ids.length > 0
        ? ["post_schedule_trip_type_mixed_shape_ambiguous"]
        : []),
      ...(routeId === "Q33"
        ? ["shared_q47_profile_q33_route_variant_ambiguity"]
        : []),
    ];
    const postRole =
      routeId === "Q67"
        ? "q67_exact_first_week_correction"
        : "phase_2_initial_busco_full_stop_inventory";
    return {
      candidate_key: extentDecisionKey(candidate),
      occurrence_id: candidate.occurrence_id,
      route_record_id: candidate.route_record_id,
      treatment_record_id: candidate.treatment_record_id,
      gtfs_route_id: routeId,
      implementation_date: candidate.implementation_date,
      implementation_phase: candidate.implementation_phase,
      service_change_evidence: {
        evidence_id: candidate.service_change_evidence_id,
        block_sha256: candidate.service_change_block_sha256,
        captured_stop_statement: candidate.captured_stop_statement,
      },
      stop_list: {
        source_id: stopSource.receipt.source_id,
        source_url: stopSource.receipt.source_url,
        receipt_sha256: stopSource.receipt_sha256,
        pdf_sha256: stopSource.pdf_sha256,
        layout_text_sha256: stopSource.layout_text_sha256,
        raw_text_sha256: stopSource.raw_text_sha256,
        blocks_sha256: stopSource.blocks_sha256,
        removed_statement_blocks: stopSource.removed_statement_blocks,
        binding_status:
          routeId === "Q33"
            ? "shared_q47_profile_q33_route_variant_ambiguous"
            : "candidate_route_stop_list_exact",
      },
      pre_inventory: preInventory,
      required_post_inventory: {
        role: postRole,
        target_date:
          routeId === "Q67" ? "2025-06-29" : "2025-08-31",
        version_sha1:
          routeId === "Q67"
            ? PLAN040_Q67_CORRECTION_SHA1
            : PLAN040_PHASE_2_INITIAL_BUSCO_SHA1,
        zip_sha256: null,
        exact_bytes_status: "blocked_exact_bytes_unavailable",
        calendar_expansion_status:
          "not_computed_exact_bytes_unavailable",
        ordered_stop_comparison_status:
          "not_computed_exact_bytes_unavailable",
      },
      schedule_validation: {
        pre: preSchedule,
        post: postSchedule,
        pre_binding: {
          matched_passenger_shape_ids: matchedPassenger,
          unmatched_passenger_shape_ids: unmatchedPassenger,
          excluded_nonrevenue_shape_ids:
            preSchedule.nonrevenue_shape_ids,
          ambiguous_shape_ids: preSchedule.ambiguous_shape_ids,
          status: preStatus,
        },
        post_binding: {
          status: "blocked_post_gtfs_bytes_unavailable",
          passenger_shape_ids_unmatched_pending_exact_gtfs:
            postSchedule.passenger_shape_ids,
          excluded_nonrevenue_shape_ids:
            postSchedule.nonrevenue_shape_ids,
          ambiguous_shape_ids: postSchedule.ambiguous_shape_ids,
        },
      },
      unresolved_gap_codes: uniqueSorted(unresolvedGapCodes),
      evidence_verdict: "acquisition_blocked_no_terminalization",
      proposed_extent_decision: null,
      proposed_grain_decision: null,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
    };
  });

const candidateKeys = evidenceCandidates
  .map((candidate) => candidate.candidate_key)
  .sort();
const candidateKeySha256 = sha256(`${candidateKeys.join("\n")}\n`);
const evidence = {
  schema_version: 1,
  manifest_id: "plan-040-qbnr-stop-removal-package-3-evidence-v1",
  package_1_manifest: {
    path: PACKAGE1_PATH,
    sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256,
  },
  acquisition_receipt: {
    path: ACQUISITION_PATH,
    sha256: acquisitionSha256,
  },
  candidate_count: 13,
  source_count: 12,
  candidate_key_sha256: candidateKeySha256,
  candidates: evidenceCandidates,
  evidence_verdict_distribution: {
    acquisition_blocked_no_terminalization: 13,
  },
  exact_search_rule:
    "candidate-specific official stop-list and service-change blocks; no guessed paths; unavailable GTFS bytes never represented as accepted",
  version_separation: {
    launch_initial_pre_phase_2_sha1: PLAN040_PHASE_2_PRE_BUSCO_SHA1,
    q67_correction_sha1: PLAN040_Q67_CORRECTION_SHA1,
    phase_2_initial_sha1: PLAN040_PHASE_2_INITIAL_BUSCO_SHA1,
    phase_2_later_sha1: PLAN040_PHASE_2_LATER_BUSCO_SHA1,
    later_phase_2_version_is_not_substitute: true,
  },
  equivalence_policy: {
    automatic_equivalence: "identical_stop_id_only",
    changed_id_name_coordinate_or_proximity_equivalence: false,
    q61_lineage_inference: false,
  },
  authorization_state: "evidence_only_no_gate_no_persistence",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const evidenceBytes = stableBytes(evidence);
const evidenceSha256 = sha256(evidenceBytes);
const draft = buildPlan040Package3Draft({
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
      throw new Error(`${path}: frozen Package 3 artifact is stale`);
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
  evidence_draft: {
    path: DRAFT_PATH,
    sha256: sha256(draftBytes),
  },
  replay_sha256: plan040Package3ReplayHash(
    draft as unknown as JsonValue,
  ),
  candidate_count: draft.candidate_count,
  source_count: draft.source_count,
  candidate_key_sha256: draft.candidate_key_sha256,
  evidence_verdict_distribution: draft.evidence_verdict_distribution,
  proposed_decision_count: draft.proposed_decision_count,
  persisted_decision_count: draft.persisted_decision_count,
  proposed_grain_decision_count:
    draft.proposed_grain_decision_count,
  persisted_grain_decision_count:
    draft.persisted_grain_decision_count,
  authorization_state: draft.authorization_state,
  freeze_readiness: draft.freeze_readiness,
}));
