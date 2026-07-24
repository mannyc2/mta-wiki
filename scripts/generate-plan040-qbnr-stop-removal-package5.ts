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
  buildPlan040Package5Draft,
  PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_5_NEW_SOURCE_ROUTES,
  PLAN040_PACKAGE_5_NON_SUBSTITUTE_POST_BUSCO_SHA1,
  PLAN040_PACKAGE_5_PACKAGE_3_CARRY_FORWARD_ROUTES,
  PLAN040_PACKAGE_5_PACKAGE_3_PINS,
  PLAN040_PACKAGE_5_PRE_BUSCO_SHA1,
  PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1,
  PLAN040_PACKAGE_5_ROUTE_ORDER,
  plan040Package5ReplayHash,
  type Plan040Package5CandidateEvidence,
  type Plan040Package5RouteId,
  type Plan040Package5ScheduleSlice,
} from "../packages/pipeline/src/quality/plan040-qbnr-stop-removal-package5";
import { parseCsv as parseGtfsRecords } from "../packages/pipeline/src/reference/gtfs-static";
import { extentDecisionKey } from "../packages/pipeline/src/quality/study-readiness-v1";

const ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-5-acquisition-v1.json";
const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-5-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-5-evidence-draft-v1.json";
const PACKAGE_3_ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-3-acquisition-v1.json";
const PACKAGE_3_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-3-evidence-v1.json";
const PACKAGE_3_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-3-evidence-draft-v1.json";
const PACKAGE_2_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json";
const PACKAGE_4_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json";
const EXTENT_LEDGER_PATH =
  "data/quality/operational-reference/member-extent-ledger.jsonl";
const GRAIN_LEDGER_PATH =
  "data/quality/operational-reference/member-grain-ledger.jsonl";
const TREATMENT_PATH = "data/canonical/treatment_components.jsonl";
const SERVICE_CHANGE_SOURCE_ID =
  "mta_queens_bus_network_redesign_service_changes";
const SCHEDULE_SOURCE_ID =
  "mta_bus_schedules_2025_candidate_windows";
const PRE_SOURCE_ID = "gtfs_static_20250626_busco_post_qbnr";

type LedgerRow = {
  ledger_id: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  treatment_family: string;
  gtfs_route_id: string;
  verdict: string;
  current_extent_kind: string;
  missing_roles: string[];
  receipt_ids: string[];
  packet_id: null;
  updated_at: null;
  verdict_basis: null;
  authorizes_study: false;
  authorizes_cross_product: false;
  member_extent_decision_id?: null;
  evidence_bindings?: unknown[];
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

type SourceBlock = {
  source_id: string;
  block_id: string;
  page_number: number;
  raw_text: string;
  normalized_text: string;
  raw_text_sha256: string;
};

type CandidateDocumentReceipt = {
  schema_version: 1;
  source_id: string;
  source_url: string;
  final_url: string;
  transport_url: string;
  route_ids: string[];
  retrieved_at: string;
  content_type: "application/pdf";
  content_disposition: string;
  pdf_bytes: number;
  pdf_sha256: string;
  text_bytes: number;
  text_sha256: string;
  page_count: number;
  anchor_href: string;
  anchor_text: string;
  anchor_relation:
    | "candidate_row_full_stop_list"
    | "candidate_timetable_profile";
  service_change_source_id: typeof SERVICE_CHANGE_SOURCE_ID;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

type PreGtfsReceipt = {
  schema_version: 1;
  source_id: typeof PRE_SOURCE_ID;
  snapshot_id: string;
  retrieved_at: string;
  official_origin_url: string;
  archive_transport_url: string;
  archive_timestamp: string;
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

type Package3Candidate = {
  candidate_key: string;
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  gtfs_route_id: string;
  implementation_date: string;
  service_change_evidence: {
    evidence_id: string;
    block_sha256: string;
    captured_stop_statement: string;
  };
  stop_list: {
    source_id: string;
    source_url: string;
    receipt_sha256: string;
    pdf_sha256: string;
    layout_text_sha256: string;
    raw_text_sha256: string;
    blocks_sha256: string;
    removed_statement_blocks: Array<{
      evidence_id: string;
      page_number: number;
      raw_text_sha256: string;
      normalized_text: string;
    }>;
  };
  pre_inventory: Omit<
    Plan040Package5CandidateEvidence["pre_inventory"],
    "route_row_presence_is_not_trip_inventory"
  >;
  schedule_validation: {
    pre: {
      source_id: typeof SCHEDULE_SOURCE_ID;
      schedule_date: string;
      route_id: string;
      operator: "MTA Bus";
      row_count: number;
      trip_type_rows: Record<string, number>;
      passenger_shape_ids: string[];
      nonrevenue_shape_ids: string[];
      ambiguous_shape_ids: string[];
      shape_trip_type_rows: Array<{
        shape_id: string;
        trip_type_rows: Record<string, number>;
      }>;
    };
    post: Package3Candidate["schedule_validation"]["pre"];
    pre_binding: {
      matched_passenger_shape_ids: string[];
      unmatched_passenger_shape_ids: string[];
      excluded_nonrevenue_shape_ids: string[];
      ambiguous_shape_ids: string[];
      status: string;
    };
    post_binding: {
      unmatched_passenger_shape_ids: string[];
      excluded_nonrevenue_shape_ids: string[];
      ambiguous_shape_ids: string[];
    };
  };
  unresolved_gap_codes: string[];
};

type NewSourceSpec = {
  routeId: (typeof PLAN040_PACKAGE_5_NEW_SOURCE_ROUTES)[number];
  sourceId: string;
  documentId: string;
  anchorRelation:
    | "candidate_row_full_stop_list"
    | "candidate_timetable_profile";
};

const NEW_SOURCE_SPECS: readonly NewSourceSpec[] = [
  {
    routeId: "Q10",
    sourceId: "mta_qbnr_2025_q10_profile_timetable",
    documentId: "181866",
    anchorRelation: "candidate_timetable_profile",
  },
  {
    routeId: "Q100",
    sourceId: "mta_qbnr_2025_q100_profile_timetable",
    documentId: "181971",
    anchorRelation: "candidate_timetable_profile",
  },
  {
    routeId: "Q104",
    sourceId: "mta_qbnr_2025_q104_stop_list",
    documentId: "82271",
    anchorRelation: "candidate_row_full_stop_list",
  },
  {
    routeId: "Q19",
    sourceId: "mta_qbnr_2025_q19_stop_list",
    documentId: "82151",
    anchorRelation: "candidate_row_full_stop_list",
  },
  {
    routeId: "Q35",
    sourceId: "mta_qbnr_2025_q35_profile_timetable",
    documentId: "181906",
    anchorRelation: "candidate_timetable_profile",
  },
  {
    routeId: "Q40",
    sourceId: "mta_qbnr_2025_q40_profile_timetable",
    documentId: "181916",
    anchorRelation: "candidate_timetable_profile",
  },
  {
    routeId: "Q49",
    sourceId: "mta_qbnr_2025_q49_profile_timetable",
    documentId: "181931",
    anchorRelation: "candidate_timetable_profile",
  },
  {
    routeId: "Q72",
    sourceId: "mta_qbnr_2025_q72_stop_list",
    documentId: "82796",
    anchorRelation: "candidate_row_full_stop_list",
  },
  {
    routeId: "QM15",
    sourceId: "mta_qbnr_2025_qm15_stop_list",
    documentId: "83001",
    anchorRelation: "candidate_row_full_stop_list",
  },
  {
    routeId: "QM18",
    sourceId: "mta_qbnr_2025_qm18_stop_list",
    documentId: "83031",
    anchorRelation: "candidate_row_full_stop_list",
  },
  {
    routeId: "QM24",
    sourceId: "mta_qbnr_2025_qm24_stop_list",
    documentId: "83111",
    anchorRelation: "candidate_row_full_stop_list",
  },
  {
    routeId: "QM25",
    sourceId: "mta_qbnr_2025_qm25_stop_list",
    documentId: "83121",
    anchorRelation: "candidate_row_full_stop_list",
  },
] as const;

const IMPLEMENTATION_DATES = Object.fromEntries(
  PLAN040_PACKAGE_5_ROUTE_ORDER.map((routeId) => [
    routeId,
    routeId.startsWith("QM") ? "2025-09-02" : "2025-08-31",
  ]),
) as Record<Plan040Package5RouteId, "2025-08-31" | "2025-09-02">;

const PRE_TARGET_DATES: Record<
  (typeof PLAN040_PACKAGE_5_NEW_SOURCE_ROUTES)[number],
  string
> = {
  Q10: "2025-08-30",
  Q100: "2025-08-30",
  Q104: "2025-08-30",
  Q19: "2025-08-30",
  Q35: "2025-08-30",
  Q40: "2025-08-30",
  Q49: "2025-08-30",
  Q72: "2025-08-30",
  QM15: "2025-08-30",
  QM18: "2025-08-29",
  QM24: "2025-08-29",
  QM25: "2025-08-29",
};

const POST_MEMBER_METADATA = [
  {
    member: "calendar.txt",
    rows: 32,
    sha1: "8ef559e10f82b267b39e86a22f8bcaaf14304c5d",
  },
  {
    member: "calendar_dates.txt",
    rows: 274,
    sha1: "9939b0e8589bd5e1e7e43c82246587aca6b4aed7",
  },
  {
    member: "routes.txt",
    rows: 92,
    sha1: "1cb2b8d4e64e1d1221f0d978e66c8156dc1997d1",
  },
  {
    member: "stop_times.txt",
    rows: 1074297,
    sha1: "9f1a325655e2c52ec2740afabecc4ff48596ad5d",
  },
  {
    member: "stops.txt",
    rows: 2760,
    sha1: "2ff7b942a055ff5b3b05ddcc8800a04aed18e6f1",
  },
  {
    member: "trips.txt",
    rows: 45401,
    sha1: "47ade1af05e1267eb5a3a1b618fcf5aba22af94b",
  },
] as const;

const sha = (
  algorithm: "sha1" | "sha256",
  value: Uint8Array | string,
): string => createHash(algorithm).update(value).digest("hex");
const sha256 = (value: Uint8Array | string): string =>
  sha("sha256", value);
const absolute = (path: string): string => resolve(repoRoot, path);
const read = (path: string): string =>
  readFileSync(absolute(path), "utf8");
const stableBytes = (value: unknown): string =>
  `${stableJson(value as JsonValue)}\n`;
const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values.filter(Boolean))].sort();

function parseJsonl<T>(path: string): T[] {
  const text = read(path).trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as T) : [];
}

function serviceDateCompact(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new Error(`Invalid GTFS service date ${date}`);
  }
  return date.replaceAll("-", "");
}

function activeServiceIds(sourceId: string, date: string): string[] {
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
      .filter(
        (row) =>
          compact >= (row.start_date ?? "") &&
          compact <= (row.end_date ?? "") &&
          row[weekday] === "1",
      )
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

function verifyPreFeed(): {
  receipt: PreGtfsReceipt;
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
  const base = `raw/sources/${PRE_SOURCE_ID}`;
  const receiptPath = `${base}/receipt.json`;
  const zipPath = `${base}/source.zip`;
  const receiptText = read(receiptPath);
  const receipt = JSON.parse(receiptText) as PreGtfsReceipt;
  const zip = readFileSync(absolute(zipPath));
  if (
    receipt.source_id !== PRE_SOURCE_ID ||
    receipt.zip_sha1 !== PLAN040_PACKAGE_5_PRE_BUSCO_SHA1 ||
    receipt.zip_bytes !== zip.byteLength ||
    receipt.zip_sha1 !== sha("sha1", zip) ||
    receipt.zip_sha256 !== sha256(zip)
  ) {
    throw new Error("Plan 040 Package 5 exact pre BusCo feed drifted");
  }
  const members = receipt.members.map((member) => {
    const bytes = readFileSync(
      absolute(`${base}/extracted/${member.member}`),
    );
    if (
      member.bytes !== bytes.byteLength ||
      member.sha256 !== sha256(bytes)
    ) {
      throw new Error(`${PRE_SOURCE_ID}/${member.member}: member drifted`);
    }
    return { ...member, sha1: sha("sha1", bytes) };
  });
  return {
    receipt,
    receipt_path: receiptPath,
    receipt_sha256: sha256(receiptText),
    zip_path: zipPath,
    members,
  };
}

function buildNewCandidateDocuments() {
  return NEW_SOURCE_SPECS.map((spec) => {
    const base = `raw/sources/${spec.sourceId}`;
    const receiptPath = `${base}/receipt.json`;
    const pdfPath = `${base}/source.pdf`;
    const layoutPath = `${base}/text.txt`;
    const rawPath = `${base}/text_raw.txt`;
    const blocksPath = `${base}/blocks.jsonl`;
    const receiptText = read(receiptPath);
    const receipt = JSON.parse(receiptText) as CandidateDocumentReceipt;
    const pdf = readFileSync(absolute(pdfPath));
    const layout = readFileSync(absolute(layoutPath));
    const raw = readFileSync(absolute(rawPath));
    const blocksText = read(blocksPath);
    const blocks = parseJsonl<SourceBlock>(blocksPath);
    const expectedUrl =
      `https://www.mta.info/document/${spec.documentId}`;
    if (
      receipt.schema_version !== 1 ||
      receipt.source_id !== spec.sourceId ||
      receipt.source_url !== expectedUrl ||
      receipt.final_url !== expectedUrl ||
      receipt.transport_url !==
        `https://new.mta.info/document/${spec.documentId}` ||
      receipt.anchor_href !== expectedUrl ||
      receipt.anchor_relation !== spec.anchorRelation ||
      stableJson(receipt.route_ids as JsonValue) !==
        stableJson([spec.routeId] as JsonValue) ||
      receipt.content_type !== "application/pdf" ||
      receipt.pdf_bytes !== pdf.byteLength ||
      receipt.pdf_sha256 !== sha256(pdf) ||
      receipt.text_bytes !== layout.byteLength ||
      receipt.text_sha256 !== sha256(layout) ||
      receipt.authorizes_occurrence ||
      receipt.authorizes_study ||
      receipt.authorizes_cross_product ||
      blocks.length === 0
    ) {
      throw new Error(
        `${spec.routeId}: exact Package 5 candidate document drifted`,
      );
    }
    const statementPattern =
      spec.anchorRelation === "candidate_timetable_profile"
        ? new RegExp(
          `${spec.routeId}|Operated by MTA Bus Company|Effective August 31, 2025`,
          "iu",
        )
        : /\b(?:removed|added|changed|limited stops?)\b/iu;
    const statementBlocks = blocks
      .filter((block) => statementPattern.test(block.normalized_text))
      .slice(0, 40)
      .map((block) => ({
        evidence_id: `${spec.sourceId}#${block.block_id}`,
        page_number: block.page_number,
        raw_text_sha256: block.raw_text_sha256.replace(/^sha256:/u, ""),
        normalized_text: block.normalized_text,
      }));
    if (statementBlocks.length === 0) {
      throw new Error(
        `${spec.routeId}: candidate document has no auditable statement blocks`,
      );
    }
    return {
      ...spec,
      receipt,
      receipt_path: receiptPath,
      receipt_sha256: sha256(receiptText),
      pdf_path: pdfPath,
      pdf_sha256: receipt.pdf_sha256,
      pdf_bytes: receipt.pdf_bytes,
      layout_text_path: layoutPath,
      layout_text_sha256: receipt.text_sha256,
      raw_text_path: rawPath,
      raw_text_sha256: sha256(raw),
      blocks_path: blocksPath,
      blocks_sha256: sha256(blocksText),
      statement_blocks: statementBlocks,
      authorizes_occurrence: false as const,
      authorizes_study: false as const,
      authorizes_cross_product: false as const,
      authorizes_decision_persistence: false as const,
    };
  });
}

function package3SliceToPackage5(
  slice: Package3Candidate["schedule_validation"]["pre"],
): Plan040Package5ScheduleSlice {
  const passengerRowCount = Object.entries(slice.trip_type_rows)
    .filter(([type]) => !["2", "3", "4"].includes(type))
    .reduce((sum, [, count]) => sum + count, 0);
  const excludedRows = Object.entries(slice.trip_type_rows)
    .filter(([type]) => ["2", "3", "4"].includes(type))
    .reduce((sum, [, count]) => sum + count, 0);
  return {
    ...slice,
    route_id: slice.route_id as Plan040Package5RouteId,
    passenger_row_count: passengerRowCount,
    excluded_nonrevenue_row_count: excludedRows,
  };
}

async function scanScheduleSource(
  specs: readonly Array<{
    scheduleDate: string;
    routeId: (typeof PLAN040_PACKAGE_5_NEW_SOURCE_ROUTES)[number];
  }>,
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
  slices: Plan040Package5ScheduleSlice[];
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
  const accumulators = new Map(
    specs.map((spec) => [
      `${spec.scheduleDate}T00:00:00.000\u0000${spec.routeId}`,
      {
        spec,
        rowCount: 0,
        operators: new Set<string>(),
        tripTypes: new Map<string, number>(),
        shapes: new Map<string, Map<string, number>>(),
      },
    ]),
  );
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
    throw new Error(`${SCHEDULE_SOURCE_ID}: receipt drifted`);
  }

  const slices = [...accumulators.values()]
    .map((accumulator) => {
      if (
        accumulator.operators.size > 1 ||
        (accumulator.operators.size === 1 &&
          !accumulator.operators.has("MTA Bus"))
      ) {
        throw new Error(
          `${accumulator.spec.routeId} ${accumulator.spec.scheduleDate}: ` +
            "unexpected schedule operator",
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
            ["2", "3", "4"].includes(type),
          );
          if (hasPassenger && hasNonrevenue) ambiguous.push(shapeId);
          else if (hasPassenger) passenger.push(shapeId);
          else nonrevenue.push(shapeId);
          return {
            shape_id: shapeId,
            trip_type_rows: Object.fromEntries(
              [...types.entries()].sort(([left], [right]) =>
                left.localeCompare(right),
              ),
            ),
          };
        });
      const tripTypeRows = Object.fromEntries(
        [...accumulator.tripTypes.entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
      const passengerRowCount = Object.entries(tripTypeRows)
        .filter(([type]) => !["2", "3", "4"].includes(type))
        .reduce((sum, [, count]) => sum + count, 0);
      const excludedRows = Object.entries(tripTypeRows)
        .filter(([type]) => ["2", "3", "4"].includes(type))
        .reduce((sum, [, count]) => sum + count, 0);
      return {
        source_id: SCHEDULE_SOURCE_ID,
        schedule_date: accumulator.spec.scheduleDate,
        route_id: accumulator.spec.routeId,
        operator: "MTA Bus",
        row_count: accumulator.rowCount,
        trip_type_rows: tripTypeRows,
        passenger_row_count: passengerRowCount,
        excluded_nonrevenue_row_count: excludedRows,
        passenger_shape_ids: passenger,
        nonrevenue_shape_ids: nonrevenue,
        ambiguous_shape_ids: ambiguous,
        shape_trip_type_rows: shapeTripTypeRows,
      } satisfies Plan040Package5ScheduleSlice;
    })
    .sort((left, right) =>
      `${left.schedule_date}\u0000${left.route_id}`.localeCompare(
        `${right.schedule_date}\u0000${right.route_id}`,
      ),
    );
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

for (const [path, expected] of [
  [PACKAGE_3_ACQUISITION_PATH, PLAN040_PACKAGE_5_PACKAGE_3_PINS.acquisition],
  [PACKAGE_3_EVIDENCE_PATH, PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence],
  [PACKAGE_3_DRAFT_PATH, PLAN040_PACKAGE_5_PACKAGE_3_PINS.draft],
] as const) {
  if (sha256(read(path)) !== expected) {
    throw new Error(`${path}: immutable Package 3 pin drifted`);
  }
}

const package3Acquisition = JSON.parse(
  read(PACKAGE_3_ACQUISITION_PATH),
) as {
  required_exact_post_versions: {
    phase_2_initial_busco: {
      version_sha1: string;
      members: Array<{
        member: string;
        metadata_rows: number;
        metadata_sha1: string;
      }>;
      zip_bytes_status: string;
      member_bytes_status: string;
      calendar_expansion_status: string;
      ordered_stop_comparison_status: string;
    };
  };
};
const package3Evidence = JSON.parse(read(PACKAGE_3_EVIDENCE_PATH)) as {
  candidates: Package3Candidate[];
};
const package3Draft = JSON.parse(read(PACKAGE_3_DRAFT_PATH)) as {
  candidates: Package3Candidate[];
};
if (
  package3Acquisition.required_exact_post_versions.phase_2_initial_busco
    .version_sha1 !== PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1 ||
  stableJson(
    package3Acquisition.required_exact_post_versions.phase_2_initial_busco
      .members.map((member) => ({
        member: member.member,
        rows: member.metadata_rows,
        sha1: member.metadata_sha1,
      })) as JsonValue,
  ) !== stableJson(POST_MEMBER_METADATA as unknown as JsonValue) ||
  stableJson(package3Evidence.candidates as unknown as JsonValue) !==
    stableJson(package3Draft.candidates as unknown as JsonValue)
) {
  throw new Error(
    "Plan 040 Package 5 required post identity or immutable Package 3 evidence drifted",
  );
}

const extentLedgerText = read(EXTENT_LEDGER_PATH);
const grainLedgerText = read(GRAIN_LEDGER_PATH);
const extentRows = parseJsonl<LedgerRow>(EXTENT_LEDGER_PATH).filter(
  (row) =>
    row.treatment_family === "bus_stop_or_boarding" &&
    (PLAN040_PACKAGE_5_ROUTE_ORDER as readonly string[]).includes(
      row.gtfs_route_id,
    ),
);
const grainRows = parseJsonl<LedgerRow>(GRAIN_LEDGER_PATH).filter(
  (row) =>
    row.treatment_family === "bus_stop_or_boarding" &&
    (PLAN040_PACKAGE_5_ROUTE_ORDER as readonly string[]).includes(
      row.gtfs_route_id,
    ),
);
const extentByRoute = new Map(
  extentRows.map((row) => [row.gtfs_route_id, row]),
);
const grainByRoute = new Map(
  grainRows.map((row) => [row.gtfs_route_id, row]),
);
if (
  extentRows.length !== 24 ||
  grainRows.length !== 24 ||
  extentByRoute.size !== 24 ||
  grainByRoute.size !== 24
) {
  throw new Error("Plan 040 Package 5 ledger scope is not exact 24-by-24");
}
for (const routeId of PLAN040_PACKAGE_5_ROUTE_ORDER) {
  const extent = extentByRoute.get(routeId)!;
  const grain = grainByRoute.get(routeId)!;
  const keysMatch =
    extentDecisionKey(extent) === extentDecisionKey(grain);
  if (
    !keysMatch ||
    extent.verdict !== "unreviewed" ||
    grain.verdict !== "unreviewed" ||
    extent.current_extent_kind !== "unresolved" ||
    grain.current_extent_kind !== "unresolved" ||
    extent.packet_id !== null ||
    grain.packet_id !== null ||
    extent.updated_at !== null ||
    grain.updated_at !== null ||
    extent.verdict_basis !== null ||
    grain.verdict_basis !== null ||
    extent.receipt_ids.length !== 0 ||
    grain.receipt_ids.length !== 0 ||
    grain.member_extent_decision_id !== null ||
    extent.authorizes_study ||
    extent.authorizes_cross_product ||
    grain.authorizes_study ||
    grain.authorizes_cross_product
  ) {
    throw new Error(`${routeId}: Package 5 ledger row is not untouched`);
  }
}
const ledgerKeys = extentRows.map(extentDecisionKey).sort();
if (
  sha256(`${ledgerKeys.join("\n")}\n`) !==
  PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256
) {
  throw new Error("Plan 040 Package 5 exact ledger-key hash drifted");
}

const treatmentRecords = parseJsonl<TreatmentRecord>(TREATMENT_PATH);
const treatmentById = new Map(
  treatmentRecords.map((record) => [record.record_id, record]),
);
const serviceChangeBlocks = parseJsonl<SourceBlock>(
  `raw/sources/${SERVICE_CHANGE_SOURCE_ID}/blocks.jsonl`,
);
const serviceChangeByEvidenceId = new Map(
  serviceChangeBlocks.map((block) => [
    `${block.source_id}#${block.block_id}`,
    block,
  ]),
);
const serviceChangeHtmlPath =
  `raw/sources/${SERVICE_CHANGE_SOURCE_ID}/source.html`;
const serviceChangeHtml = read(serviceChangeHtmlPath);

const documents = buildNewCandidateDocuments();
const documentByRoute = new Map(
  documents.map((document) => [document.routeId, document]),
);
if (documentByRoute.size !== 12) {
  throw new Error("Plan 040 Package 5 requires exact 12 new documents");
}
for (const document of documents) {
  if (
    !serviceChangeHtml.includes(
      document.receipt.anchor_href.replaceAll("/", "\\/"),
    ) &&
    !serviceChangeHtml.includes(document.receipt.anchor_href)
  ) {
    throw new Error(
      `${document.routeId}: candidate-document anchor not derived from Phase 2 HTML`,
    );
  }
}

const preFeed = verifyPreFeed();
const allPreTrips = parseGtfsRecords(
  read(`raw/sources/${PRE_SOURCE_ID}/extracted/trips.txt`),
);
const allPreRoutes = parseGtfsRecords(
  read(`raw/sources/${PRE_SOURCE_ID}/extracted/routes.txt`),
);
const preInventoryByRoute = new Map<
  string,
  Plan040Package5CandidateEvidence["pre_inventory"]
>();
const preRouteAudits = [];
for (const routeId of PLAN040_PACKAGE_5_NEW_SOURCE_ROUTES) {
  const targetDate = PRE_TARGET_DATES[routeId];
  const activeServices = activeServiceIds(PRE_SOURCE_ID, targetDate);
  const active = new Set(activeServices);
  const routeTrips = allPreTrips.filter(
    (trip) => trip.route_id === routeId,
  );
  const activeTrips = routeTrips.filter((trip) =>
    active.has(trip.service_id ?? ""),
  );
  const routeRows = allPreRoutes.filter((route) =>
    route.route_id === routeId
  );
  if (
    routeRows.length === 0 ||
    routeTrips.length === 0 ||
    activeTrips.length === 0
  ) {
    throw new Error(
      `${routeId}: route-row presence did not replay with active trip inventory`,
    );
  }
  preInventoryByRoute.set(routeId, {
    source_id: PRE_SOURCE_ID,
    zip_sha1: PLAN040_PACKAGE_5_PRE_BUSCO_SHA1,
    zip_sha256: preFeed.receipt.zip_sha256,
    target_date: targetDate,
    service_window: preFeed.receipt.service_window,
    active_service_ids: activeServices,
    active_service_id_sha256: sha256(
      `${activeServices.join("\n")}\n`,
    ),
    route_trip_row_count: routeTrips.length,
    active_trip_count: activeTrips.length,
    active_shape_ids: uniqueSorted(
      activeTrips.map((trip) => trip.shape_id ?? ""),
    ),
    route_row_presence_is_not_trip_inventory: true,
  });
  preRouteAudits.push({
    route_id: routeId,
    target_date: targetDate,
    route_row_count: routeRows.length,
    route_trip_row_count: routeTrips.length,
    active_trip_count: activeTrips.length,
    inventory_status:
      "validated_from_active_trips_not_route_row_presence",
  });
}

const newScheduleSpecs = PLAN040_PACKAGE_5_NEW_SOURCE_ROUTES.flatMap(
  (routeId) => [
    { scheduleDate: PRE_TARGET_DATES[routeId], routeId },
    { scheduleDate: IMPLEMENTATION_DATES[routeId], routeId },
  ],
);
const schedule = await scanScheduleSource(newScheduleSpecs);
const scheduleByKey = new Map(
  schedule.slices.map((slice) => [
    `${slice.schedule_date}\u0000${slice.route_id}`,
    slice,
  ]),
);
const scheduleFor = (
  date: string,
  routeId: (typeof PLAN040_PACKAGE_5_NEW_SOURCE_ROUTES)[number],
): Plan040Package5ScheduleSlice => {
  const slice = scheduleByKey.get(`${date}\u0000${routeId}`);
  if (!slice) {
    throw new Error(`${routeId} ${date}: schedule slice missing`);
  }
  return slice;
};

const package3ByRoute = new Map(
  package3Evidence.candidates.map((candidate) => [
    candidate.gtfs_route_id,
    candidate,
  ]),
);
const carryRoutes = new Set<string>(
  PLAN040_PACKAGE_5_PACKAGE_3_CARRY_FORWARD_ROUTES,
);

const candidates: Plan040Package5CandidateEvidence[] =
  PLAN040_PACKAGE_5_ROUTE_ORDER.map((routeId) => {
    const extent = extentByRoute.get(routeId)!;
    const candidateKey = extentDecisionKey(extent);
    const implementationDate = IMPLEMENTATION_DATES[routeId];
    const commonRequiredPost = {
      role: "phase_2_initial_busco_full_stop_inventory" as const,
      target_date: implementationDate,
      version_sha1: PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1,
      zip_sha256: null,
      exact_member_metadata: POST_MEMBER_METADATA.map((member) => ({
        ...member,
      })),
      zip_bytes_status: "blocked_whole_zip_bytes_unavailable" as const,
      member_bytes_status:
        "blocked_no_verified_required_member_matches" as const,
      calendar_expansion_status:
        "not_computed_required_member_bytes_unavailable" as const,
      ordered_stop_comparison_status:
        "not_computed_required_member_bytes_unavailable" as const,
    };
    const revenuePolicy = {
      passenger: "any_trip_type_except_2_3_4" as const,
      excluded_nonrevenue_trip_types: ["2", "3", "4"] as [
        "2",
        "3",
        "4",
      ],
      mixed_shape_policy: "reviewed_unresolved" as const,
      unmatched_shape_policy: "reviewed_unresolved" as const,
    };

    if (carryRoutes.has(routeId)) {
      const prior = package3ByRoute.get(routeId);
      if (
        !prior ||
        prior.candidate_key !== candidateKey ||
        prior.implementation_date !== implementationDate
      ) {
        throw new Error(`${routeId}: immutable Package 3 carry ref drifted`);
      }
      const pre = package3SliceToPackage5(
        prior.schedule_validation.pre,
      );
      const post = package3SliceToPackage5(
        prior.schedule_validation.post,
      );
      const preStatus =
        prior.schedule_validation.pre_binding.status ===
          "matched_no_unresolved_shapes"
          ? "matched_no_unresolved_shapes"
          : prior.schedule_validation.pre_binding
              .matched_passenger_shape_ids.length > 0
            ? "matched_with_reviewed_unresolved_shapes"
            : "reviewed_unresolved_unmatched_or_ambiguous";
      return {
        candidate_key: candidateKey,
        occurrence_id: extent.occurrence_id,
        route_record_id: extent.route_record_id,
        treatment_record_id: extent.treatment_record_id,
        treatment_family: "bus_stop_or_boarding",
        gtfs_route_id: routeId,
        implementation_date: implementationDate,
        evidence_origin: "immutable_package_3_carry_forward",
        immutable_package_3_ref: {
          evidence_manifest_sha256:
            PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence,
          candidate_sha256: sha256(
            stableBytes(prior),
          ),
        },
        service_change_evidence: {
          evidence_id: prior.service_change_evidence.evidence_id,
          block_sha256: prior.service_change_evidence.block_sha256,
          captured_statement:
            prior.service_change_evidence.captured_stop_statement,
        },
        candidate_document: {
          source_id: prior.stop_list.source_id,
          source_url: prior.stop_list.source_url,
          anchor_relation: "immutable_package_3_stop_list",
          receipt_sha256: prior.stop_list.receipt_sha256,
          pdf_sha256: prior.stop_list.pdf_sha256,
          layout_text_sha256: prior.stop_list.layout_text_sha256,
          raw_text_sha256: prior.stop_list.raw_text_sha256,
          blocks_sha256: prior.stop_list.blocks_sha256,
          statement_blocks:
            prior.stop_list.removed_statement_blocks.map((block) => ({
              evidence_id: block.evidence_id,
              page_number: block.page_number,
              raw_text_sha256: block.raw_text_sha256,
              normalized_text: block.normalized_text,
            })),
          binding_status: "immutable_package_3_candidate_binding",
        },
        pre_inventory: {
          ...prior.pre_inventory,
          source_id: PRE_SOURCE_ID,
          zip_sha1: PLAN040_PACKAGE_5_PRE_BUSCO_SHA1,
          route_row_presence_is_not_trip_inventory: true,
        },
        required_post_inventory: commonRequiredPost,
        schedule_validation: {
          pre,
          post,
          revenue_policy: revenuePolicy,
          pre_binding: {
            ...prior.schedule_validation.pre_binding,
            status: preStatus,
          },
          post_binding: {
            ...prior.schedule_validation.post_binding,
            status:
              "reviewed_unresolved_exact_post_gtfs_members_unavailable",
          },
        },
        unresolved_gap_codes: uniqueSorted([
          ...prior.unresolved_gap_codes,
          "exact_post_gtfs_zip_bytes_unavailable",
          "exact_post_member_bytes_unavailable",
          "post_calendar_expansion_not_computed",
          "ordered_full_stop_diff_not_computed",
          "schedule_to_post_gtfs_binding_unresolved",
          "immutable_package_3_nonterminal_carry_forward",
        ]),
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
    }

    const newRouteId =
      routeId as (typeof PLAN040_PACKAGE_5_NEW_SOURCE_ROUTES)[number];
    const treatment = treatmentById.get(extent.treatment_record_id);
    const document = documentByRoute.get(newRouteId);
    if (
      !treatment ||
      !document ||
      treatment.source_id !== SERVICE_CHANGE_SOURCE_ID ||
      treatment.payload.treatment_family !== "bus_stop_or_boarding" ||
      treatment.evidence_refs.length !== 1
    ) {
      throw new Error(`${routeId}: exact new treatment evidence missing`);
    }
    const evidenceRef = treatment.evidence_refs[0]!;
    const serviceBlock = serviceChangeByEvidenceId.get(
      evidenceRef.evidence_id,
    );
    if (
      !serviceBlock ||
      serviceBlock.raw_text_sha256.replace(/^sha256:/u, "") !==
        evidenceRef.text_sha256.replace(/^sha256:/u, "") ||
      !serviceBlock.normalized_text.includes(evidenceRef.source_quote)
    ) {
      throw new Error(`${routeId}: service-change block drifted`);
    }
    const preInventory = preInventoryByRoute.get(newRouteId)!;
    const pre = scheduleFor(PRE_TARGET_DATES[newRouteId], newRouteId);
    const post = scheduleFor(implementationDate, newRouteId);
    const activeShapes = new Set(preInventory.active_shape_ids);
    const matched = pre.passenger_shape_ids.filter((shapeId) =>
      activeShapes.has(shapeId),
    );
    const unmatched = pre.passenger_shape_ids.filter(
      (shapeId) => !activeShapes.has(shapeId),
    );
    const preStatus =
      pre.row_count === 0
        ? "reviewed_unresolved_unmatched_or_ambiguous"
        : unmatched.length === 0 && pre.ambiguous_shape_ids.length === 0
        ? "matched_no_unresolved_shapes"
        : matched.length > 0
          ? "matched_with_reviewed_unresolved_shapes"
          : "reviewed_unresolved_unmatched_or_ambiguous";
    const semanticGaps = [
      ...(treatment.payload.treatment_kind === "limited stops"
        ? ["limited_stop_pattern_ids_unresolved"]
        : []),
      ...(extent.treatment_record_id.includes("addition")
        ? ["added_stop_ids_unresolved"]
        : []),
      ...(extent.treatment_record_id.includes("change")
        ? ["changed_stop_id_equivalence_unresolved"]
        : []),
      ...(extent.treatment_record_id.includes("removal") ||
        extent.treatment_record_id.includes("change")
        ? ["removed_stop_ids_unresolved"]
        : []),
      ...(document.anchorRelation === "candidate_timetable_profile"
        ? ["candidate_document_does_not_supply_full_ordered_stop_chain"]
        : []),
      ...(routeId === "Q10"
        ? ["q10_profile_timetable_includes_q80_nonexclusive_context"]
        : []),
      ...(routeId === "Q49"
        ? ["q49_full_stop_list_anchor_misbound_to_q47_profile"]
        : []),
      ...(routeId === "Q104"
        ? ["q104_timetable_anchor_label_mismatch_q103"]
        : []),
      ...(unmatched.length > 0
        ? ["pre_schedule_shape_unmatched_to_active_gtfs"]
        : []),
      ...(pre.ambiguous_shape_ids.length > 0
        ? ["pre_schedule_trip_type_mixed_shape_ambiguous"]
        : []),
      ...(post.ambiguous_shape_ids.length > 0
        ? ["post_schedule_trip_type_mixed_shape_ambiguous"]
        : []),
      ...(pre.row_count === 0
        ? ["pre_schedule_slice_absent_reviewed_unresolved"]
        : []),
      ...(post.row_count === 0
        ? ["post_schedule_slice_absent_reviewed_unresolved"]
        : []),
    ];
    return {
      candidate_key: candidateKey,
      occurrence_id: extent.occurrence_id,
      route_record_id: extent.route_record_id,
      treatment_record_id: extent.treatment_record_id,
      treatment_family: "bus_stop_or_boarding",
      gtfs_route_id: routeId,
      implementation_date: implementationDate,
      evidence_origin: "package_5_exact_candidate_document",
      immutable_package_3_ref: null,
      service_change_evidence: {
        evidence_id: evidenceRef.evidence_id,
        block_sha256: evidenceRef.text_sha256.replace(/^sha256:/u, ""),
        captured_statement: evidenceRef.source_quote,
      },
      candidate_document: {
        source_id: document.sourceId,
        source_url: document.receipt.source_url,
        anchor_relation: document.anchorRelation,
        receipt_sha256: document.receipt_sha256,
        pdf_sha256: document.pdf_sha256,
        layout_text_sha256: document.layout_text_sha256,
        raw_text_sha256: document.raw_text_sha256,
        blocks_sha256: document.blocks_sha256,
        statement_blocks: document.statement_blocks,
        binding_status:
          routeId === "Q10"
            ? "candidate_route_document_nonexclusive_q10_q80"
            : "candidate_route_document_exact",
      },
      pre_inventory: preInventory,
      required_post_inventory: commonRequiredPost,
      schedule_validation: {
        pre,
        post,
        revenue_policy: revenuePolicy,
        pre_binding: {
          matched_passenger_shape_ids: matched,
          unmatched_passenger_shape_ids: unmatched,
          excluded_nonrevenue_shape_ids: pre.nonrevenue_shape_ids,
          ambiguous_shape_ids: pre.ambiguous_shape_ids,
          status: preStatus,
        },
        post_binding: {
          unmatched_passenger_shape_ids: post.passenger_shape_ids,
          excluded_nonrevenue_shape_ids: post.nonrevenue_shape_ids,
          ambiguous_shape_ids: post.ambiguous_shape_ids,
          status:
            "reviewed_unresolved_exact_post_gtfs_members_unavailable",
        },
      },
      unresolved_gap_codes: uniqueSorted([
        "exact_post_gtfs_zip_bytes_unavailable",
        "exact_post_member_bytes_unavailable",
        "post_calendar_expansion_not_computed",
        "ordered_full_stop_diff_not_computed",
        "schedule_to_post_gtfs_binding_unresolved",
        ...semanticGaps,
      ]),
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
  });

const package2Text = read(PACKAGE_2_DRAFT_PATH);
const package4Text = read(PACKAGE_4_DRAFT_PATH);
const package2 = JSON.parse(package2Text) as {
  candidates: Array<{ candidate_key: string }>;
};
const package4 = JSON.parse(package4Text) as {
  candidates: Array<{ candidate_key: string }>;
};
const package2Keys = package2.candidates
  .map((candidate) => candidate.candidate_key)
  .sort();
const package4Keys = package4.candidates
  .map((candidate) => candidate.candidate_key)
  .sort();
const package5Keys = candidates
  .map((candidate) => candidate.candidate_key)
  .sort();
if (
  package5Keys.some((key) => package2Keys.includes(key)) ||
  package5Keys.some((key) => package4Keys.includes(key))
) {
  throw new Error("Plan 040 Package 5 overlaps Package 2 or Package 4");
}

const acquisition = {
  schema_version: 1,
  receipt_id: "plan-040-qbnr-stop-removal-package-5-acquisition-v1",
  candidate_count: 24,
  new_candidate_document_count: 12,
  immutable_package_3_carry_forward_candidate_count: 12,
  route_order: [...PLAN040_PACKAGE_5_ROUTE_ORDER],
  candidate_key_sha256: PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256,
  ledger_inputs: {
    extent: {
      path: EXTENT_LEDGER_PATH,
      sha256: sha256(extentLedgerText),
      candidate_count: 24,
    },
    grain: {
      path: GRAIN_LEDGER_PATH,
      sha256: sha256(grainLedgerText),
      candidate_count: 24,
    },
  },
  immutable_package_3_pins: {
    acquisition: {
      path: PACKAGE_3_ACQUISITION_PATH,
      sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.acquisition,
    },
    evidence: {
      path: PACKAGE_3_EVIDENCE_PATH,
      sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.evidence,
    },
    draft: {
      path: PACKAGE_3_DRAFT_PATH,
      sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.draft,
    },
    carried_routes: [
      ...PLAN040_PACKAGE_5_PACKAGE_3_CARRY_FORWARD_ROUTES,
    ],
    reacquisition_performed: false,
    accepted_source_evidence_recomputed: false,
  },
  exact_new_candidate_documents: documents.map((document) => ({
    route_id: document.routeId,
    anchor_relation: document.anchorRelation,
    anchor_derivation:
      "exact candidate row in Phase 2 service-change HTML",
    source_id: document.sourceId,
    source_url: document.receipt.source_url,
    transport_url: document.receipt.transport_url,
    retrieved_at: document.receipt.retrieved_at,
    receipt_path: document.receipt_path,
    receipt_sha256: document.receipt_sha256,
    pdf_path: document.pdf_path,
    pdf_sha256: document.pdf_sha256,
    pdf_bytes: document.pdf_bytes,
    page_count: document.receipt.page_count,
    layout_text_path: document.layout_text_path,
    layout_text_sha256: document.layout_text_sha256,
    raw_text_path: document.raw_text_path,
    raw_text_sha256: document.raw_text_sha256,
    blocks_path: document.blocks_path,
    blocks_sha256: document.blocks_sha256,
    statement_blocks: document.statement_blocks,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_decision_persistence: false,
  })),
  service_change_input: {
    source_id: SERVICE_CHANGE_SOURCE_ID,
    html_path: serviceChangeHtmlPath,
    html_sha256: sha256(serviceChangeHtml),
    blocks_path:
      `raw/sources/${SERVICE_CHANGE_SOURCE_ID}/blocks.jsonl`,
    blocks_sha256: sha256(
      read(`raw/sources/${SERVICE_CHANGE_SOURCE_ID}/blocks.jsonl`),
    ),
    anchor_derivation_status:
      "all_12_exact_candidate_document_anchors_verified",
    known_anchor_anomalies: [
      {
        route_id: "Q49",
        anomaly:
          "full-stop-list document 82496 is the shared Q33/Q47 profile and does not bind Q49",
        fallback:
          "exact candidate timetable/profile anchor document 181931",
      },
      {
        route_id: "Q104",
        anomaly:
          "candidate timetable link label says Q103",
        retained_source:
          "exact candidate full-stop-list anchor document 82271",
      },
    ],
  },
  accepted_pre_feed: {
    source_id: PRE_SOURCE_ID,
    receipt_path: preFeed.receipt_path,
    receipt_sha256: preFeed.receipt_sha256,
    zip_path: preFeed.zip_path,
    zip_bytes: preFeed.receipt.zip_bytes,
    zip_sha1: preFeed.receipt.zip_sha1,
    zip_sha256: preFeed.receipt.zip_sha256,
    service_window: preFeed.receipt.service_window,
    members: preFeed.members,
    route_inventory_audit: preRouteAudits,
    route_row_presence_policy:
      "route-row presence is never promoted to trip inventory",
  },
  required_exact_post_feed: {
    role: "phase_2_initial_busco_full_stop_inventory",
    version_sha1: PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1,
    zip_sha256: null,
    exact_member_metadata: POST_MEMBER_METADATA,
    metadata_inherited_from:
      "immutable Package 3 acquisition receipt",
    zip_bytes_status: "blocked_whole_zip_bytes_unavailable",
    member_bytes_status: "blocked_no_verified_required_member_matches",
    target_calendar_expansion_status:
      "not_computed_required_member_bytes_unavailable",
    ordered_full_stop_chain_status:
      "not_computed_required_member_bytes_unavailable",
  },
  non_substitute_later_post_feed: {
    version_sha1: PLAN040_PACKAGE_5_NON_SUBSTITUTE_POST_BUSCO_SHA1,
    substitution_status:
      "prohibited_not_the_required_initial_phase_2_identity",
  },
  schedule_input: schedule.input,
  new_schedule_slice_count: schedule.slices.length,
  new_schedule_slices: schedule.slices,
  immutable_package_3_schedule_slices_reused: true,
  schedule_trip_type_policy: {
    passenger: "any trip_type other than 2, 3, or 4",
    nonrevenue_excluded: ["2", "3", "4"],
    mixed_passenger_and_nonrevenue:
      "reviewed_unresolved_ambiguous_trip_type",
    schedule_shape_absent_from_exact_gtfs:
      "reviewed_unresolved_unmatched_shape",
  },
  prior_package_overlap: {
    package_2: {
      path: PACKAGE_2_DRAFT_PATH,
      sha256: sha256(package2Text),
      candidate_key_sha256: sha256(`${package2Keys.join("\n")}\n`),
      overlap_count: 0,
    },
    package_4: {
      path: PACKAGE_4_DRAFT_PATH,
      sha256: sha256(package4Text),
      candidate_key_sha256: sha256(`${package4Keys.join("\n")}\n`),
      overlap_count: 0,
    },
    package_3: {
      path: PACKAGE_3_DRAFT_PATH,
      sha256: PLAN040_PACKAGE_5_PACKAGE_3_PINS.draft,
      intentional_nonterminal_carry_forward_count: 12,
      carry_forward_route_order: [
        ...PLAN040_PACKAGE_5_PACKAGE_3_CARRY_FORWARD_ROUTES,
      ],
    },
  },
  authority_state: "evidence_only_no_gate_no_acceptance_no_persistence",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const acquisitionBytes = stableBytes(acquisition);
const acquisitionSha256 = sha256(acquisitionBytes);

const evidence = {
  schema_version: 1,
  manifest_id:
    "plan-040-qbnr-stop-removal-package-5-evidence-v1",
  acquisition_receipt: {
    path: ACQUISITION_PATH,
    sha256: acquisitionSha256,
  },
  candidate_count: 24,
  new_candidate_document_count: 12,
  immutable_package_3_carry_forward_candidate_count: 12,
  candidate_key_sha256: PLAN040_PACKAGE_5_CANDIDATE_KEY_SHA256,
  candidates,
  evidence_verdict_distribution: {
    receipt_terminal_unresolved: 24,
  },
  proposed_decision_count: 0,
  persisted_decision_count: 0,
  proposed_grain_decision_count: 0,
  persisted_grain_decision_count: 0,
  exact_search_rule:
    "candidate-specific official Phase 2 anchors and documents; exact initial post GTFS bytes required; no route-row, name, coordinate, proximity, or schedule-only occurrence inference",
  equivalence_policy: {
    automatic_equivalence: "identical_stop_id_only",
    changed_id_name_coordinate_or_proximity_equivalence: false,
    occurrence_inference_from_route_or_schedule_presence: false,
  },
  version_separation: {
    pre_busco_sha1: PLAN040_PACKAGE_5_PRE_BUSCO_SHA1,
    required_initial_post_busco_sha1:
      PLAN040_PACKAGE_5_REQUIRED_POST_BUSCO_SHA1,
    later_non_substitute_busco_sha1:
      PLAN040_PACKAGE_5_NON_SUBSTITUTE_POST_BUSCO_SHA1,
    later_version_is_not_substitute: true,
  },
  authority_state: "evidence_only_no_gate_no_acceptance_no_persistence",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const evidenceBytes = stableBytes(evidence);
const evidenceSha256 = sha256(evidenceBytes);
const draft = buildPlan040Package5Draft({
  acquisitionReceiptPath: ACQUISITION_PATH,
  acquisitionReceiptSha256: acquisitionSha256,
  evidenceManifestPath: EVIDENCE_PATH,
  evidenceManifestSha256: evidenceSha256,
  candidates,
  package2CandidateKeys: package2Keys,
  package4CandidateKeys: package4Keys,
});
const draftBytes = stableBytes(draft);
const draftSha256 = sha256(draftBytes);

const outputs = [
  [ACQUISITION_PATH, acquisitionBytes],
  [EVIDENCE_PATH, evidenceBytes],
  [DRAFT_PATH, draftBytes],
] as const;
const check = process.argv.includes("--check");
for (const [path, bytes] of outputs) {
  if (check) {
    if (!existsSync(absolute(path)) || read(path) !== bytes) {
      throw new Error(`${path}: frozen Package 5 artifact is stale`);
    }
  } else {
    writeFileSync(absolute(path), bytes);
  }
}

console.log(
  JSON.stringify({
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
      sha256: draftSha256,
    },
    replay_sha256: plan040Package5ReplayHash(
      draft as unknown as JsonValue,
    ),
    candidate_count: draft.candidate_count,
    new_source_candidate_count: draft.new_source_candidate_count,
    package_3_carry_forward_candidate_count:
      draft.package_3_carry_forward_candidate_count,
    candidate_key_sha256: draft.candidate_key_sha256,
    evidence_verdict_distribution:
      draft.evidence_verdict_distribution,
    proposed_decision_count: draft.proposed_decision_count,
    persisted_decision_count: draft.persisted_decision_count,
    proposed_grain_decision_count:
      draft.proposed_grain_decision_count,
    persisted_grain_decision_count:
      draft.persisted_grain_decision_count,
    authorization_state: draft.authorization_state,
    freeze_readiness: draft.freeze_readiness,
  }),
);
