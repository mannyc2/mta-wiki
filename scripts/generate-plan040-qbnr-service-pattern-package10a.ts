import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { repoRoot } from "../packages/core/src/paths";
import { parseCsv } from "../packages/db/src/import-gtfs";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import type {
  MemberExtentLedgerRow,
  MemberGrainLedgerRow,
} from "../packages/pipeline/src/quality/member-extent-ledger";
import {
  PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS,
  PLAN040_PACKAGE_10A_CANDIDATES,
  PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_10A_EXCLUSION_SCOPES,
  PLAN040_PACKAGE_10A_EXACT_STATEMENTS,
  PLAN040_PACKAGE_10A_POST_P9_PINS,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A,
  buildPlan040Package10aDraft,
  plan040Package10aReplayHash,
  type Plan040Package10aCalendarExpansion,
  type Plan040Package10aCandidateEvidence,
  type Plan040Package10aExclusion,
  type Plan040Package10aInventorySlice,
  type Plan040Package10aPostPattern,
  type Plan040Package10aRouteId,
} from "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package10a";
import type { Plan040Package8VersionSeparation } from "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package8";

const EXTENT_LEDGER_PATH =
  "data/quality/operational-reference/member-extent-ledger.jsonl";
const GRAIN_LEDGER_PATH =
  "data/quality/operational-reference/member-grain-ledger.jsonl";
const BRIDGE_PATH =
  "data/quality/study-readiness/v1/bridge-ledger.jsonl";
const STUDY_MANIFEST_PATH =
  "data/quality/study-readiness/v1/manifest.json";
const SERVICE_HTML_PATH =
  "raw/sources/mta_queens_bus_network_redesign_service_changes/source.html";
const TREATMENT_COMPONENTS_PATH =
  "data/canonical/treatment_components.jsonl";
const SCHEDULE_SOURCE_PATH =
  "raw/sources/mta_bus_schedules_2025_candidate_windows/source.csv";
const PACKAGE_8_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-8-evidence-v1.json";
const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10a-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-10a-evidence-draft-v1.json";
const PRE_ROOT = "raw/sources/gtfs_static_20250625_busco_pre_qbnr";
const POST_ROOT = "raw/sources/gtfs_static_20250626_busco_post_qbnr";
const check = process.argv.includes("--check");

type CsvRow = Record<string, string>;
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
type Package8Evidence = {
  immutable_reuse: {
    accepted_launch_feed_identities: Array<{
      boundary: string;
      family: string;
      source_id: string;
      receipt_path: string;
      receipt_sha256: string;
      zip_sha1: string;
      zip_sha256: string;
    }>;
  };
  version_separation: Plan040Package8VersionSeparation;
};
type FrozenEvidence = {
  candidates: Plan040Package10aCandidateEvidence[];
  exclusions: Plan040Package10aExclusion[];
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sha1 = (value: Uint8Array | string): string =>
  createHash("sha1").update(value).digest("hex");
const absolute = (path: string): string => resolve(repoRoot, path);
const read = (path: string): string => readFileSync(absolute(path), "utf8");
const stableBytes = (value: unknown): string =>
  `${stableJson(value as JsonValue)}\n`;
const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values.filter(Boolean))].sort();
const keyHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const orderedHash = (values: readonly string[]): string =>
  sha256(`${values.join("\n")}\n`);
const parseJsonl = <T>(path: string): T[] => {
  const value = read(path).trim();
  return value ? value.split("\n").map((line) => JSON.parse(line) as T) : [];
};
const candidateKey = (
  occurrenceId: string,
  routeRecordId: string,
  treatmentId: string,
): string => [occurrenceId, routeRecordId, treatmentId].join("\0");
const frozen = check && existsSync(absolute(EVIDENCE_PATH))
  ? JSON.parse(read(EVIDENCE_PATH)) as FrozenEvidence
  : null;
const frozenByTreatment = new Map(
  (frozen?.candidates ?? []).map((candidate) => [
    candidate.treatment_record_id,
    candidate,
  ]),
);

function pin(path: string, expected: string, label: string): void {
  const actual = sha256(readFileSync(absolute(path)));
  if (actual !== expected) {
    throw new Error(`${label}: immutable input drifted (${actual})`);
  }
}

pin(
  PACKAGE_8_EVIDENCE_PATH,
  PLAN040_PACKAGE_10A_POST_P9_PINS.package_8_feed_identity_artifact,
  "Package 8 accepted launch feed identity artifact",
);
pin(
  SERVICE_HTML_PATH,
  PLAN040_PACKAGE_10A_POST_P9_PINS.service_change_html,
  "service-change HTML",
);
pin(
  TREATMENT_COMPONENTS_PATH,
  PLAN040_PACKAGE_10A_POST_P9_PINS.treatment_components,
  "treatment components",
);
for (const [path, expected, label] of [
  [
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-9-evidence-v1.json",
    PLAN040_PACKAGE_10A_POST_P9_PINS.package_9.evidence,
    "Package 9 evidence",
  ],
  [
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-9-evidence-draft-v1.json",
    PLAN040_PACKAGE_10A_POST_P9_PINS.package_9.draft,
    "Package 9 draft",
  ],
  [
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-9-dual-review-gate-v1.json",
    PLAN040_PACKAGE_10A_POST_P9_PINS.package_9.gate,
    "Package 9 gate",
  ],
  [
    "data/quality/operational-reference/member-extent-risk/" +
      "plan-040-qbnr-service-pattern-package-9-owner-acceptance-v1.json",
    PLAN040_PACKAGE_10A_POST_P9_PINS.package_9.acceptance,
    "Package 9 acceptance",
  ],
  [
    "data/quality/operational-reference/member-extent-ledger-decisions/" +
      "plan-040-qbnr-service-pattern-package-9-v1.json",
    PLAN040_PACKAGE_10A_POST_P9_PINS.package_9.extent_decisions,
    "Package 9 extent decisions",
  ],
  [
    "data/quality/operational-reference/member-grain-decisions/" +
      "plan-040-qbnr-service-pattern-package-9-v1.json",
    PLAN040_PACKAGE_10A_POST_P9_PINS.package_9.grain_decisions,
    "Package 9 grain decisions",
  ],
  [
    "data/quality/acquisition/receipts/member-extent/" +
      "plan-040-qbnr-service-pattern-package-9-reviewed-absence-v1.json",
    PLAN040_PACKAGE_10A_POST_P9_PINS.package_9.absence_receipt,
    "Package 9 reviewed-absence receipt",
  ],
] as const) {
  pin(path, expected, label);
}
if (!frozen) {
  for (const [path, expected, label] of [
    [
      EXTENT_LEDGER_PATH,
      PLAN040_PACKAGE_10A_POST_P9_PINS.extent_ledger,
      "post-P9 extent ledger",
    ],
    [
      GRAIN_LEDGER_PATH,
      PLAN040_PACKAGE_10A_POST_P9_PINS.grain_ledger,
      "post-P9 grain ledger",
    ],
    [BRIDGE_PATH, PLAN040_PACKAGE_10A_POST_P9_PINS.bridge, "post-P9 bridge"],
    [
      STUDY_MANIFEST_PATH,
      PLAN040_PACKAGE_10A_POST_P9_PINS.study_manifest,
      "post-P9 study manifest",
    ],
  ] as const) {
    pin(path, expected, label);
  }
}

const package8 = JSON.parse(read(PACKAGE_8_EVIDENCE_PATH)) as Package8Evidence;
const acceptedBusco = package8.immutable_reuse.accepted_launch_feed_identities
  .filter((identity) => identity.family === "busco")
  .sort((left, right) => left.boundary.localeCompare(right.boundary));
const expectedBusco = [
  PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.post,
  PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS.pre,
];
if (
  acceptedBusco.length !== 2 ||
  acceptedBusco.some((identity, index) => {
    const expected = expectedBusco[index]!;
    return identity.boundary !== expected.boundary ||
      identity.source_id !== expected.source_id ||
      identity.receipt_path !== expected.receipt_path ||
      identity.receipt_sha256 !== expected.receipt_sha256 ||
      identity.zip_sha1 !== expected.zip_sha1 ||
      identity.zip_sha256 !== expected.zip_sha256;
  })
) {
  throw new Error("Accepted BusCo feed identity artifact drifted");
}
for (const identity of Object.values(
  PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS,
)) {
  pin(identity.receipt_path, identity.receipt_sha256, identity.boundary);
  const root = identity.boundary === "pre" ? PRE_ROOT : POST_ROOT;
  const zip = readFileSync(absolute(`${root}/source.zip`));
  if (
    sha1(zip) !== identity.zip_sha1 ||
    sha256(zip) !== identity.zip_sha256
  ) {
    throw new Error(`${identity.boundary}: accepted BusCo ZIP drifted`);
  }
}

const treatments = new Map(
  parseJsonl<TreatmentRecord>(TREATMENT_COMPONENTS_PATH)
    .map((record) => [record.record_id, record]),
);
const extentLedger = parseJsonl<MemberExtentLedgerRow>(EXTENT_LEDGER_PATH);
const grainLedger = parseJsonl<MemberGrainLedgerRow>(GRAIN_LEDGER_PATH);

function readCsv(path: string): CsvRow[] {
  const rows = parseCsv(read(path));
  const header = rows[0] ?? [];
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row) =>
    Object.fromEntries(
      header.map((name, index) => [name, row[index] ?? ""]),
    )
  );
}

type FeedData = {
  root: string;
  routes: CsvRow[];
  trips: CsvRow[];
  calendar: CsvRow[];
  calendarDates: CsvRow[];
  memberSha256: Record<string, string>;
};

function readFeed(root: string): FeedData {
  const memberSha256: Record<string, string> = {};
  for (
    const member of [
      "routes.txt",
      "trips.txt",
      "calendar.txt",
      "calendar_dates.txt",
      "stop_times.txt",
    ]
  ) {
    memberSha256[member] = sha256(
      readFileSync(absolute(`${root}/extracted/${member}`)),
    );
  }
  return {
    root,
    routes: readCsv(`${root}/extracted/routes.txt`),
    trips: readCsv(`${root}/extracted/trips.txt`),
    calendar: readCsv(`${root}/extracted/calendar.txt`),
    calendarDates: readCsv(`${root}/extracted/calendar_dates.txt`),
    memberSha256,
  };
}

const preFeed = readFeed(PRE_ROOT);
const postFeed = readFeed(POST_ROOT);
const weekdayFields = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function calendarExpansion(
  feed: FeedData,
  date: string,
): Plan040Package10aCalendarExpansion {
  const compactDate = date.replaceAll("-", "");
  const weekday = weekdayFields[
    new Date(`${date}T00:00:00Z`).getUTCDay()
  ]!;
  const base = feed.calendar
    .filter((row) =>
      row.start_date <= compactDate &&
      row.end_date >= compactDate &&
      row[weekday] === "1"
    )
    .map((row) => row.service_id);
  const added = feed.calendarDates
    .filter((row) =>
      row.date === compactDate && row.exception_type === "1"
    )
    .map((row) => row.service_id);
  const removed = feed.calendarDates
    .filter((row) =>
      row.date === compactDate && row.exception_type === "2"
    )
    .map((row) => row.service_id);
  const active = new Set([...base, ...added]);
  for (const serviceId of removed) active.delete(serviceId);
  const activeServiceIds = [...active].sort();
  return {
    policy: "calendar_plus_calendar_dates",
    service_date: date,
    weekday,
    base_service_ids: uniqueSorted(base),
    exception_added_service_ids: uniqueSorted(added),
    exception_removed_service_ids: uniqueSorted(removed),
    active_service_ids: activeServiceIds,
    active_service_id_sha256: keyHash(activeServiceIds),
  };
}

type ActiveTrip = {
  trip_id: string;
  direction_id: string;
  shape_id: string;
};
const activeTripsByRoute = new Map<
  Plan040Package10aRouteId,
  ActiveTrip[]
>();

function inventory(
  boundary: "pre" | "post",
  routeId: Plan040Package10aRouteId,
  targetDate: string,
): Plan040Package10aInventorySlice {
  const feed = boundary === "pre" ? preFeed : postFeed;
  const identity = PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS[boundary];
  const routeRows = feed.routes.filter((row) =>
    row.route_id === routeId && row.route_short_name === routeId
  );
  const allRouteTrips = feed.trips.filter((row) => row.route_id === routeId);
  const expansion = calendarExpansion(feed, targetDate);
  const activeServices = new Set(expansion.active_service_ids);
  const activeTrips = allRouteTrips.filter((row) =>
    activeServices.has(row.service_id)
  ).map((row) => ({
    trip_id: row.trip_id,
    direction_id: row.direction_id,
    shape_id: row.shape_id,
  }));
  if (boundary === "post") activeTripsByRoute.set(routeId, activeTrips);
  const directionCounts: Record<string, number> = {};
  for (const trip of activeTrips) {
    directionCounts[trip.direction_id] =
      (directionCounts[trip.direction_id] ?? 0) + 1;
  }
  const shapeIds = uniqueSorted(activeTrips.map((trip) => trip.shape_id));
  return {
    boundary,
    feed_family: "busco",
    source_id: identity.source_id,
    receipt_path: identity.receipt_path,
    receipt_sha256: identity.receipt_sha256,
    zip_sha1: identity.zip_sha1,
    source_zip_sha256: identity.zip_sha256,
    target_date: targetDate,
    route_id: routeId,
    route_row_count: routeRows.length,
    all_route_trip_count: allRouteTrips.length,
    calendar_expansion: expansion,
    active_route_trip_count: activeTrips.length,
    active_direction_counts: Object.fromEntries(
      Object.entries(directionCounts).sort(([left], [right]) =>
        left.localeCompare(right)
      ),
    ),
    active_shape_ids: shapeIds,
    active_shape_count: shapeIds.length,
    active_trip_id_sha256: keyHash(
      activeTrips.map((trip) => trip.trip_id),
    ),
  };
}

const dates = {
  Q51: { pre: "2025-06-28", post: "2025-06-29" },
  Q74: { pre: "2025-06-28", post: "2025-06-29" },
  Q115: { pre: "2025-06-28", post: "2025-06-29" },
  QM65: { pre: "2025-06-27", post: "2025-06-30" },
} as const;
const inventories = new Map<
  Plan040Package10aRouteId,
  { pre: Plan040Package10aInventorySlice; post: Plan040Package10aInventorySlice }
>();
for (const [routeId] of PLAN040_PACKAGE_10A_CANDIDATES) {
  inventories.set(routeId, {
    pre: inventory("pre", routeId, dates[routeId].pre),
    post: inventory("post", routeId, dates[routeId].post),
  });
}

const tripLookup = new Map<string, {
  routeId: Plan040Package10aRouteId;
  directionId: string;
  shapeId: string;
}>();
for (const [routeId, trips] of activeTripsByRoute) {
  for (const trip of trips) {
    tripLookup.set(trip.trip_id, {
      routeId,
      directionId: trip.direction_id,
      shapeId: trip.shape_id,
    });
  }
}
const stopsByTrip = new Map<string, Array<{
  sequence: number;
  stopId: string;
}>>();
{
  const lines = createInterface({
    input: createReadStream(absolute(`${POST_ROOT}/extracted/stop_times.txt`)),
    crlfDelay: Infinity,
  });
  let first = true;
  for await (const line of lines) {
    if (first) {
      first = false;
      continue;
    }
    if (!line) continue;
    const cells = line.replace(/\r$/u, "").split(",");
    const tripId = cells[0] ?? "";
    if (!tripLookup.has(tripId)) continue;
    const sequence = Number(cells[4]);
    const stopId = cells[3] ?? "";
    if (!Number.isInteger(sequence) || !stopId) {
      throw new Error(`${tripId}: incomplete post stop-time chain`);
    }
    const chain = stopsByTrip.get(tripId) ?? [];
    chain.push({ sequence, stopId });
    stopsByTrip.set(tripId, chain);
  }
}

function postPatterns(
  routeId: Plan040Package10aRouteId,
): Plan040Package10aPostPattern[] {
  const trips = activeTripsByRoute.get(routeId) ?? [];
  const groups = new Map<string, {
    directionId: string;
    stopIds: string[];
    shapeIds: string[];
    tripIds: string[];
  }>();
  for (const trip of trips) {
    const chain = (stopsByTrip.get(trip.trip_id) ?? [])
      .sort((left, right) => left.sequence - right.sequence)
      .map((row) => row.stopId);
    if (chain.length === 0) {
      throw new Error(`${routeId}/${trip.trip_id}: post chain missing`);
    }
    const groupKey = stableJson([trip.direction_id, chain] as JsonValue);
    const group = groups.get(groupKey) ?? {
      directionId: trip.direction_id,
      stopIds: chain,
      shapeIds: [],
      tripIds: [],
    };
    group.shapeIds.push(trip.shape_id);
    group.tripIds.push(trip.trip_id);
    groups.set(groupKey, group);
  }
  return [...groups.values()].map((group) => {
    const tripIds = uniqueSorted(group.tripIds);
    const stopChainSha256 = orderedHash(group.stopIds);
    return {
      pattern_id:
        `historical-full-stop-pattern:plan040-p10a-${routeId.toLowerCase()}-` +
        `${stopChainSha256.slice(0, 16)}`,
      direction_id: group.directionId,
      shape_ids: uniqueSorted(group.shapeIds),
      trip_count: tripIds.length,
      trip_id_sha256: keyHash(tripIds),
      stop_count: group.stopIds.length,
      stop_ids: group.stopIds,
      stop_chain_sha256: stopChainSha256,
    };
  }).sort((left, right) =>
    [left.direction_id, left.stop_chain_sha256].join("\0").localeCompare(
      [right.direction_id, right.stop_chain_sha256].join("\0"),
    )
  );
}

const patternsByRoute = new Map(
  PLAN040_PACKAGE_10A_CANDIDATES.map(([routeId]) => [
    routeId,
    postPatterns(routeId),
  ]),
);

type ScheduleCounts = {
  routeRowCount: number;
  launchDateRowCount: number;
  laterDateRowCount: number;
};
const scheduleCounts = new Map<Plan040Package10aRouteId, ScheduleCounts>(
  PLAN040_PACKAGE_10A_CANDIDATES.map(([routeId]) => [
    routeId,
    { routeRowCount: 0, launchDateRowCount: 0, laterDateRowCount: 0 },
  ]),
);
{
  const stream = createReadStream(absolute(SCHEDULE_SOURCE_PATH));
  const sourceHash = createHash("sha256");
  stream.on("data", (chunk) => sourceHash.update(chunk));
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let first = true;
  const routeIds = new Set(scheduleCounts.keys());
  const unquote = (value: string | undefined): string =>
    value?.replace(/^"|"$/gu, "") ?? "";
  for await (const line of lines) {
    if (first) {
      first = false;
      continue;
    }
    if (!line) continue;
    const cells = line.split(",", 10);
    const routeId = unquote(cells[8]) as Plan040Package10aRouteId;
    if (!routeIds.has(routeId)) continue;
    const date = unquote(cells[0]).slice(0, 10);
    const counts = scheduleCounts.get(routeId)!;
    counts.routeRowCount += 1;
    if (date === dates[routeId].post) counts.launchDateRowCount += 1;
    if (date > dates[routeId].post) counts.laterDateRowCount += 1;
  }
  const actual = sourceHash.digest("hex");
  if (actual !== PLAN040_PACKAGE_10A_POST_P9_PINS.main_schedule_source) {
    throw new Error(`main schedule source drifted (${actual})`);
  }
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

const serviceHtml = read(SERVICE_HTML_PATH);
const settingsMatch = serviceHtml.match(
  /<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/u,
);
if (!settingsMatch) throw new Error("service-change Drupal settings missing");
const settings = JSON.parse(settingsMatch[1]!) as {
  mtaDatatable: Record<string, {
    csvData: { data: Array<Record<string, { value: string }>> };
  }>;
};
const serviceRows = settings.mtaDatatable["21"]?.csvData.data;
if (!serviceRows) throw new Error("service-change route table 21 missing");
const sourceRows = new Map(
  PLAN040_PACKAGE_10A_CANDIDATES.map(([routeId]) => {
    const row = serviceRows.find((item) => item.Route?.value === routeId);
    if (!row) throw new Error(`${routeId}: service-change row missing`);
    const cells = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"]
      .map((key) => row[key]?.value ?? "");
    return [routeId, {
      source_html_sha256:
        PLAN040_PACKAGE_10A_POST_P9_PINS.service_change_html,
      route_row: routeId,
      row_sha256: sha256(stableBytes({ route: routeId, cells })),
      implementation_statement: stripHtml(cells[0] ?? ""),
      candidate_change_context: cells.slice(1).map(stripHtml).filter(Boolean),
    }] as const;
  }),
);

const detailUrls = {
  Q51:
    "https://www.mta.info/project/queens-bus-network-redesign/routes/q51-limited",
  Q74:
    "https://www.mta.info/project/queens-bus-network-redesign/routes/q74-limited",
  Q115:
    "https://www.mta.info/project/queens-bus-network-redesign/routes/q115-local",
  QM65:
    "https://www.mta.info/project/queens-bus-network-redesign/routes/qm65-express",
} as const;
const metadataUrls: string[] = [];
const sourceRoot = absolute("raw/sources");
for (const name of readdirSync(sourceRoot)) {
  const path = `${sourceRoot}/${name}/metadata.json`;
  if (!existsSync(path)) continue;
  try {
    const metadata = JSON.parse(readFileSync(path, "utf8")) as {
      sourceUrl?: string;
      finalUrl?: string;
      url?: string;
    };
    metadataUrls.push(
      ...[metadata.sourceUrl, metadata.finalUrl, metadata.url]
        .filter((value): value is string => typeof value === "string"),
    );
  } catch {
    // Non-JSON metadata is outside this exact URL search surface.
  }
}

function priorLedger(
  occurrenceId: string,
  routeRecordId: string,
  treatmentId: string,
): { extent_row: MemberExtentLedgerRow; grain_row: MemberGrainLedgerRow } {
  const frozenCandidate = frozenByTreatment.get(
    treatmentId as Plan040Package10aCandidateEvidence["treatment_record_id"],
  );
  if (frozenCandidate) return frozenCandidate.prior_ledger_state;
  const extent = extentLedger.find((row) =>
    row.occurrence_id === occurrenceId &&
    row.route_record_id === routeRecordId &&
    row.treatment_record_id === treatmentId
  );
  const grain = grainLedger.find((row) =>
    row.occurrence_id === occurrenceId &&
    row.route_record_id === routeRecordId &&
    row.treatment_record_id === treatmentId
  );
  if (!extent || !grain) {
    throw new Error(`${treatmentId}: exact prior ledger rows missing`);
  }
  return { extent_row: extent, grain_row: grain };
}

const candidates = PLAN040_PACKAGE_10A_CANDIDATES.map(
  ([routeId, treatmentId]): Plan040Package10aCandidateEvidence => {
    const treatment = treatments.get(treatmentId);
    if (
      !treatment ||
      treatment.source_id !==
        "mta_queens_bus_network_redesign_service_changes" ||
      treatment.payload.treatment_family !== "service_pattern"
    ) {
      throw new Error(`${treatmentId}: canonical treatment missing`);
    }
    const expectedStatement = PLAN040_PACKAGE_10A_EXACT_STATEMENTS[treatmentId];
    const evidenceRef = treatment.evidence_refs.find((ref) =>
      ref.source_id === treatment.source_id
    );
    if (
      !evidenceRef ||
      evidenceRef.evidence_id !== expectedStatement.evidence_id ||
      evidenceRef.block_id !== expectedStatement.block_id ||
      evidenceRef.text_sha256 !== expectedStatement.block_sha256 ||
      treatment.raw_text !== expectedStatement.raw_text
    ) {
      throw new Error(`${treatmentId}: exact canonical statement drifted`);
    }
    const extent = extentLedger.find((row) =>
      row.treatment_record_id === treatmentId
    );
    const frozenCandidate = frozenByTreatment.get(treatmentId);
    const occurrenceId = extent?.occurrence_id ??
      frozenCandidate?.occurrence_id ?? "";
    const routeRecordId = extent?.route_record_id ??
      frozenCandidate?.route_record_id ?? "";
    if (!occurrenceId || !routeRecordId) {
      throw new Error(`${treatmentId}: candidate identity missing`);
    }
    const prior = priorLedger(occurrenceId, routeRecordId, treatmentId);
    const routeInventory = inventories.get(routeId)!;
    const patterns = patternsByRoute.get(routeId)!;
    const counts = scheduleCounts.get(routeId)!;
    const detailUrl = detailUrls[routeId];
    const detailMatches = metadataUrls.filter((url) =>
      url.replace(/\/$/u, "") === detailUrl
    ).length;
    const exactSearches = [
      `candidate_key=${candidateKey(occurrenceId, routeRecordId, treatmentId)}`,
      `canonical_statement evidence_id=${evidenceRef.evidence_id} text_sha256=${evidenceRef.text_sha256} raw_text=${JSON.stringify(treatment.raw_text)}`,
      `service_change_route_row=${routeId} row_sha256=${sourceRows.get(routeId)!.row_sha256}`,
      `accepted_pre source_id=${routeInventory.pre.source_id} date=${routeInventory.pre.target_date} route_rows=${routeInventory.pre.route_row_count} all_route_trips=${routeInventory.pre.all_route_trip_count} active_route_trips=${routeInventory.pre.active_route_trip_count}`,
      `accepted_post source_id=${routeInventory.post.source_id} date=${routeInventory.post.target_date} route_rows=${routeInventory.post.route_row_count} all_route_trips=${routeInventory.post.all_route_trip_count} active_route_trips=${routeInventory.post.active_route_trip_count}`,
      `calendar_plus_calendar_dates pre_active_sha256=${routeInventory.pre.calendar_expansion.active_service_id_sha256} post_active_sha256=${routeInventory.post.calendar_expansion.active_service_id_sha256}`,
      `post_full_stop_chains pattern_count=${patterns.length} pattern_ids=${patterns.map((pattern) => pattern.pattern_id).join(",")} complete_trip_count=${routeInventory.post.active_route_trip_count}`,
      `candidate_detail_url=${detailUrl} exact_staged_metadata_matches=${detailMatches}`,
      `main_schedule route=${routeId} all_rows=${counts.routeRowCount} launch_date=${dates[routeId].post} launch_rows=${counts.launchDateRowCount} later_rows=${counts.laterDateRowCount}`,
      `predecessor_route_named=false exact_statement_binding=${evidenceRef.evidence_id}`,
      "exact_positive_policy=post_only_presence_does_not_authorize_occurrence_extent_or_lineage",
    ];
    return {
      candidate_key: candidateKey(
        occurrenceId,
        routeRecordId,
        treatmentId,
      ),
      occurrence_id: occurrenceId,
      route_record_id: routeRecordId,
      treatment_record_id: treatmentId,
      treatment_family: "service_pattern",
      gtfs_route_id: routeId,
      source_statement: {
        source_id: "mta_queens_bus_network_redesign_service_changes",
        evidence_id: evidenceRef.evidence_id,
        block_id: evidenceRef.block_id,
        block_sha256: evidenceRef.text_sha256,
        raw_text: treatment.raw_text,
        names_predecessor_route: false,
      },
      source_row: sourceRows.get(routeId)!,
      prior_ledger_state: prior,
      accepted_launch_inventory: {
        pre: routeInventory.pre,
        post: routeInventory.post,
        zero_active_pre_inventory: true,
        positive_active_post_inventory: true,
        post_only_presence_is_member_identity: false,
        post_only_presence_authorizes_occurrence: false,
        post_only_presence_authorizes_extent: false,
        predecessor_lineage_authorized: false,
      },
      post_full_stop_chains: {
        source_id: "gtfs_static_20250626_busco_post_qbnr",
        target_date: dates[routeId].post,
        complete_active_trip_coverage: true,
        active_trip_count: routeInventory.post.active_route_trip_count,
        covered_trip_count: patterns.reduce(
          (sum, pattern) => sum + pattern.trip_count,
          0,
        ),
        patterns,
        candidate_treatment_binding_authorized: false,
        post_chain_presence_authorizes_extent: false,
      },
      candidate_detail_source_gap: {
        exact_url: detailUrl,
        staged_metadata_matches: detailMatches as 0,
        status: "missing_exact_candidate_detail_source",
      },
      schedule_detail_gap: {
        source_id: "mta_bus_schedules_2025_candidate_windows",
        source_sha256:
          PLAN040_PACKAGE_10A_POST_P9_PINS.main_schedule_source,
        route_row_count: counts.routeRowCount,
        launch_date_row_count: counts.launchDateRowCount as 0,
        status: "missing_exact_launch_date_schedule_binding",
        later_nonlaunch_rows_are_nonauthorizing: true,
      },
      exact_candidate_searches: exactSearches,
      unresolved_gap_codes: [
        "zero_active_pre_inventory_no_predecessor_lineage",
        "post_only_inventory_is_nonauthorizing",
        "candidate_detail_source_missing",
        "exact_launch_date_schedule_binding_missing",
        "candidate_scope_not_bound_to_exact_versioned_member_extent",
      ],
      evidence_verdict: "receipt_terminal_unresolved",
      proposed_extent_decision: null,
      proposed_grain_decision: null,
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
  candidates.some((candidate) =>
    candidate.candidate_detail_source_gap.staged_metadata_matches !== 0 ||
    candidate.schedule_detail_gap.launch_date_row_count !== 0
  )
) {
  throw new Error(
    "Package 10A exact candidate detail or launch schedule gap changed",
  );
}
if (
  keyHash(candidates.map((candidate) => candidate.candidate_key)) !==
    PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256
) {
  throw new Error("Package 10A candidate-key scope drifted");
}

const ledgerCandidateKeys = extentLedger.map((row) => ({
  key: candidateKey(
    row.occurrence_id,
    row.route_record_id,
    row.treatment_record_id,
  ),
  routeId: row.gtfs_route_id,
}));
const risk12TreatmentIds = new Set(
  PLAN040_PACKAGE_10A_EXCLUSION_SCOPES.risk_12.treatment_ids,
);
const q67TreatmentIds = new Set(
  PLAN040_PACKAGE_10A_EXCLUSION_SCOPES.q67.treatment_ids,
);
const q48Q75TreatmentIds = new Set(
  PLAN040_PACKAGE_10A_EXCLUSION_SCOPES.q48_q75.treatment_ids,
);
const risk12Keys = extentLedger
  .filter((row) => risk12TreatmentIds.has(
    row.treatment_record_id as
      (typeof PLAN040_PACKAGE_10A_EXCLUSION_SCOPES.risk_12.treatment_ids)[number],
  ))
  .map((row) =>
    candidateKey(
      row.occurrence_id,
      row.route_record_id,
      row.treatment_record_id,
    )
  )
  .sort();
const q67Keys = ledgerCandidateKeys
  .filter((row) => {
    const treatmentId = row.key.split("\0")[2] ?? "";
    return q67TreatmentIds.has(
      treatmentId as
        (typeof PLAN040_PACKAGE_10A_EXCLUSION_SCOPES.q67.treatment_ids)[number],
    );
  })
  .map((row) => row.key)
  .sort();
const q48Q75Keys = ledgerCandidateKeys
  .filter((row) => {
    const treatmentId = row.key.split("\0")[2] ?? "";
    return q48Q75TreatmentIds.has(
      treatmentId as
        (typeof PLAN040_PACKAGE_10A_EXCLUSION_SCOPES.q48_q75.treatment_ids)[number],
    );
  })
  .map((row) => row.key)
  .sort();
const packageKeys = new Set(candidates.map((candidate) =>
  candidate.candidate_key
));
function exclusion(
  scopeId: Plan040Package10aExclusion["scope_id"],
  keys: string[],
  sourceArtifact: Plan040Package10aExclusion["source_artifact"],
): Plan040Package10aExclusion {
  return {
    scope_id: scopeId,
    source_artifact: sourceArtifact,
    candidate_count: keys.length,
    candidate_keys: keys,
    candidate_key_sha256: keyHash(keys),
    overlap_count: keys.filter((key) => packageKeys.has(key)).length as 0,
  };
}
const exclusions = frozen?.exclusions ?? [
  exclusion("risk_12", risk12Keys, {
    path: EXTENT_LEDGER_PATH,
    sha256: PLAN040_PACKAGE_10A_POST_P9_PINS.extent_ledger,
  }),
  exclusion("q67", q67Keys, {
    path: EXTENT_LEDGER_PATH,
    sha256: PLAN040_PACKAGE_10A_POST_P9_PINS.extent_ledger,
  }),
  exclusion("q48_q75", q48Q75Keys, {
    path: EXTENT_LEDGER_PATH,
    sha256: PLAN040_PACKAGE_10A_POST_P9_PINS.extent_ledger,
  }),
];

const priorArtifactPaths = [
  "data/quality/operational-reference/member-extent-ledger-decisions/" +
    "plan-040-exemplar-v1.json",
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json",
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-stop-removal-package-3-evidence-draft-v1.json",
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json",
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-stop-removal-package-5-evidence-draft-v1.json",
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-6-evidence-draft-v1.json",
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-7-evidence-draft-v1.json",
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-8-evidence-draft-v1.json",
  "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-9-evidence-draft-v1.json",
];
function collectCandidateKeys(value: unknown, target: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectCandidateKeys(item, target);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "candidate_key" && typeof child === "string") {
      target.add(child);
    } else {
      collectCandidateKeys(child, target);
    }
  }
}
const priorCandidateKeySet = new Set<string>();
for (const path of priorArtifactPaths) {
  collectCandidateKeys(JSON.parse(read(path)), priorCandidateKeySet);
}
const priorCandidateKeys = [...priorCandidateKeySet].sort();

const evidence = {
  schema_version: 1,
  manifest_id:
    "plan-040-qbnr-service-pattern-package-10a-evidence-v1",
  package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A,
  candidate_count: 4,
  route_count: 4,
  candidate_key_sha256: PLAN040_PACKAGE_10A_CANDIDATE_KEY_SHA256,
  candidates,
  exclusions,
  prior_package_overlap_count: candidates.filter((candidate) =>
    priorCandidateKeySet.has(candidate.candidate_key)
  ).length,
  immutable_inputs: {
    post_p9_pins: PLAN040_PACKAGE_10A_POST_P9_PINS,
    package_8_feed_identity_artifact: {
      path: PACKAGE_8_EVIDENCE_PATH,
      sha256:
        PLAN040_PACKAGE_10A_POST_P9_PINS.package_8_feed_identity_artifact,
    },
    accepted_busco_feed_identities:
      PLAN040_PACKAGE_10A_ACCEPTED_BUSCO_FEEDS,
    extracted_member_sha256: {
      pre: preFeed.memberSha256,
      post: postFeed.memberSha256,
    },
  },
  exact_positive_policy: {
    exact_candidate_specific_positive_required: true,
    zero_active_pre_plus_positive_post_is_nonauthorizing: true,
    post_full_stop_chain_is_nonauthorizing_without_candidate_binding: true,
    occurrence_inference_from_post_only_presence: false,
    routewide_extent_inference_from_post_only_presence: false,
    lineage_inference_without_named_predecessor: false,
  },
  source_gap_policy: {
    missing_exact_candidate_detail_is_terminal: true,
    missing_exact_launch_date_schedule_binding_is_terminal: true,
    later_schedule_rows_are_nonauthorizing_for_launch_binding: true,
  },
  version_separation: package8.version_separation,
  evidence_verdict_distribution: { receipt_terminal_unresolved: 4 },
  proposed_extent_distribution: { unresolved: 4 },
  proposed_grain_distribution: { unresolved: 4 },
  review_protocol: {
    review_mode:
      "one_independent_review_plus_automated_fail_closed_tests",
    independent_review_required: true,
    dual_independent_review_required: false,
    owner_gate_created: false,
    owner_acceptance_created: false,
    persistence_performed: false,
  },
  authorization_state:
    "evidence_freeze_pending_one_independent_review_no_gate_no_acceptance_no_persistence",
  proposed_extent_decision_count: 0,
  proposed_grain_decision_count: 0,
  persisted_extent_decision_count: 0,
  persisted_grain_decision_count: 0,
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
if (evidence.prior_package_overlap_count !== 0) {
  throw new Error("Package 10A overlaps a prior package");
}
const evidenceBytes = stableBytes(evidence);
const evidenceSha256 = sha256(evidenceBytes);
const draft = buildPlan040Package10aDraft({
  evidenceManifestPath: EVIDENCE_PATH,
  evidenceManifestSha256: evidenceSha256,
  candidates,
  exclusions,
  priorCandidateKeys,
  versionSeparation: package8.version_separation,
});
const draftBytes = stableBytes(draft);
const replaySha256 = plan040Package10aReplayHash(
  draft as unknown as JsonValue,
);
if (replaySha256 !== sha256(draftBytes)) {
  throw new Error("Package 10A draft replay hash drifted");
}

for (const [path, bytes] of [
  [EVIDENCE_PATH, evidenceBytes],
  [DRAFT_PATH, draftBytes],
] as const) {
  if (check) {
    if (!existsSync(absolute(path)) || read(path) !== bytes) {
      throw new Error(`${path}: deterministic replay drifted`);
    }
  } else {
    writeFileSync(absolute(path), bytes);
  }
}

console.log(stableJson({
  package_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_10A,
  mode: check ? "check" : "write",
  candidate_count: 4,
  evidence_sha256: evidenceSha256,
  draft_sha256: sha256(draftBytes),
  replay_sha256: replaySha256,
  exclusion_counts: Object.fromEntries(exclusions.map((row) => [
    row.scope_id,
    row.candidate_count,
  ])),
  authorization_state: draft.authorization_state,
} as JsonValue));
