import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { parseCsv as parseCsvRows } from "../packages/db/src/import-gtfs";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  buildPlan040Package6Draft,
  PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES,
  PLAN040_PACKAGE_6_CANDIDATES,
  PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_6_NON_SUBSTITUTE_POST_BUSCO_SHA1,
  PLAN040_PACKAGE_6_PRE_BUSCO_SHA1,
  PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1,
  PLAN040_PACKAGE_6_WAVES,
  plan040Package6ReplayHash,
  type Plan040Package6CandidateEvidence,
  type Plan040Package6RouteId,
  type Plan040Package6WaveId,
} from "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package6";
import { extentDecisionKey } from "../packages/pipeline/src/quality/study-readiness-v1";
import { parseCsv as parseGtfsRecords } from "../packages/pipeline/src/reference/gtfs-static";

const ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-service-pattern-package-6-acquisition-v1.json";
const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-6-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-6-evidence-draft-v1.json";
const PACKAGE_2_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json";
const PACKAGE_3_ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-3-acquisition-v1.json";
const PACKAGE_3_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-3-evidence-v1.json";
const PACKAGE_3_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-3-evidence-draft-v1.json";
const PACKAGE_4_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-4-evidence-draft-v1.json";
const PACKAGE_5_ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-5-acquisition-v1.json";
const PACKAGE_5_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-5-evidence-v1.json";
const PACKAGE_5_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-5-evidence-draft-v1.json";
const PACKAGE_5_RECEIPT_PATH =
  "data/quality/acquisition/receipts/member-extent/" +
  "plan-040-qbnr-stop-removal-package-5-reviewed-absence-v1.json";
const EXTENT_LEDGER_PATH =
  "data/quality/operational-reference/member-extent-ledger.jsonl";
const GRAIN_LEDGER_PATH =
  "data/quality/operational-reference/member-grain-ledger.jsonl";
const TREATMENT_PATH = "data/canonical/treatment_components.jsonl";
const SERVICE_CHANGE_SOURCE_ID =
  "mta_queens_bus_network_redesign_service_changes";
const SERVICE_CHANGE_HTML_PATH =
  `raw/sources/${SERVICE_CHANGE_SOURCE_ID}/source.html`;
const SERVICE_CHANGE_BLOCKS_PATH =
  `raw/sources/${SERVICE_CHANGE_SOURCE_ID}/blocks.jsonl`;
const SERVICE_CHANGE_HTML_SHA256 =
  "4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d";
const SCHEDULE_SOURCE_ID =
  "mta_bus_schedules_2025_candidate_windows";
const PRE_SOURCE_ID = "gtfs_static_20250626_busco_post_qbnr";

const PACKAGE_3_PINS = {
  acquisition:
    "7417deb4c56f12d98a9ec61f486cad9b0caeb7121819b1824e874643454f697e",
  evidence:
    "149809f528571fc3e49808a61ee83670121db536e691ffae88b70579e8e9ccf8",
  draft:
    "1a3f446553955e75c373831ea282b1b4c0a2ceda2bfaec5f00a737d270b5fdbd",
} as const;
const PACKAGE_5_PINS = {
  acquisition:
    "bb7c89669ed6b106cf37fe099b626116c4e5022f8ff909915cf68430853cb44c",
  evidence:
    "a8a54fc2e5554d9517b9b65d5726141d4cccd1e8c16072ae2260f76bb64eb6ba",
  draft:
    "6506f12da89d3925b66a5f4a6003bd6b79929295c222ad18509459447e037179",
  receipt:
    "5001fb8be406ce9f5abc90490635d22e2f6fad28944400b8eecb4342bfa1c0d2",
} as const;

const ROUTE_ORDER = [
  ...new Set(PLAN040_PACKAGE_6_CANDIDATES.map(([, routeId]) => routeId)),
] as Plan040Package6RouteId[];
const REUSED_ROUTE_IDS = ROUTE_ORDER.filter((routeId) =>
  !["Q102", "QM16", "QM17"].includes(routeId));
const EXPRESS_ROUTE_IDS = new Set(["QM15", "QM16", "QM17", "QM24", "QM25"]);
const NEW_SOURCE_BY_ROUTE: Record<string, string> = {
  Q102: "mta_qbnr_2025_q102_profile_timetable",
  QM16: "mta_qbnr_2025_qm16_qm17_profile_timetable",
  QM17: "mta_qbnr_2025_qm16_qm17_profile_timetable",
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

type LedgerRow = {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  treatment_family: string;
  gtfs_route_id: string;
  current_extent_kind: string;
  verdict: string;
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
  raw_text_sha256: string;
  normalized_text: string;
};

type ScheduleSlice = {
  source_id: typeof SCHEDULE_SOURCE_ID;
  schedule_date: string;
  route_id: Plan040Package6RouteId;
  operator: "MTA Bus";
  row_count: number;
  trip_type_rows: Record<string, number>;
  passenger_row_count: number;
  excluded_nonrevenue_row_count: number;
  ambiguous_shape_ids: string[];
  passenger_shape_ids: string[];
  nonrevenue_shape_ids: string[];
  shape_trip_type_rows: Array<{
    shape_id: string;
    trip_type_rows: Record<string, number>;
  }>;
};

type NormalizedDocument = {
  source_id: string;
  source_url: string;
  source_origin:
    | "reused_immutable_package_3_or_5_document"
    | "package_6_new_exact_candidate_timetable";
  binding_status:
    Plan040Package6CandidateEvidence["candidate_document"]["binding_status"];
  route_ids: string[];
  shared_document: boolean;
  nonexclusive_context: boolean;
  document_is_full_stop_chain: boolean;
  receipt_path: string;
  receipt_sha256: string;
  pdf_sha256: string;
  layout_text_sha256: string;
  raw_text_sha256: string;
  blocks_sha256: string;
  supporting_statement_blocks:
    Plan040Package6CandidateEvidence["candidate_document"]["supporting_statement_blocks"];
};

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

function pinFile(path: string, expected: string, label: string): string {
  const actual = sha256(readFileSync(absolute(path)));
  if (actual !== expected) {
    throw new Error(`${label} pin drifted: ${actual}`);
  }
  return actual;
}

for (const [path, expected, label] of [
  [PACKAGE_3_ACQUISITION_PATH, PACKAGE_3_PINS.acquisition, "Package 3 acquisition"],
  [PACKAGE_3_EVIDENCE_PATH, PACKAGE_3_PINS.evidence, "Package 3 evidence"],
  [PACKAGE_3_DRAFT_PATH, PACKAGE_3_PINS.draft, "Package 3 draft"],
  [PACKAGE_5_ACQUISITION_PATH, PACKAGE_5_PINS.acquisition, "Package 5 acquisition"],
  [PACKAGE_5_EVIDENCE_PATH, PACKAGE_5_PINS.evidence, "Package 5 evidence"],
  [PACKAGE_5_DRAFT_PATH, PACKAGE_5_PINS.draft, "Package 5 draft"],
  [PACKAGE_5_RECEIPT_PATH, PACKAGE_5_PINS.receipt, "Package 5 receipt"],
] as const) {
  pinFile(path, expected, label);
}

const extentRows = parseJsonl<LedgerRow>(EXTENT_LEDGER_PATH);
const grainRows = parseJsonl<LedgerRow>(GRAIN_LEDGER_PATH);
const expectedTreatments = new Set(
  PLAN040_PACKAGE_6_CANDIDATES.map(([, , treatmentId]) => treatmentId),
);
const selectedExtent = extentRows.filter((row) =>
  expectedTreatments.has(row.treatment_record_id));
const selectedGrain = grainRows.filter((row) =>
  expectedTreatments.has(row.treatment_record_id));
const extentByTreatment = new Map(selectedExtent.map((row) => [
  row.treatment_record_id,
  row,
]));
const grainByTreatment = new Map(selectedGrain.map((row) => [
  row.treatment_record_id,
  row,
]));
if (
  selectedExtent.length !== 29 ||
  selectedGrain.length !== 29 ||
  extentByTreatment.size !== 29 ||
  grainByTreatment.size !== 29
) {
  throw new Error("Package 6 ledger scope is not exact 29-by-29");
}
for (const [, routeId, treatmentId] of PLAN040_PACKAGE_6_CANDIDATES) {
  const extent = extentByTreatment.get(treatmentId)!;
  const grain = grainByTreatment.get(treatmentId)!;
  if (
    extent.gtfs_route_id !== routeId ||
    grain.gtfs_route_id !== routeId ||
    extentDecisionKey(extent) !== extentDecisionKey(grain) ||
    extent.treatment_family !== "service_pattern" ||
    grain.treatment_family !== "service_pattern" ||
    extent.current_extent_kind !== "unresolved" ||
    grain.current_extent_kind !== "unresolved" ||
    extent.verdict !== "unreviewed" ||
    grain.verdict !== "unreviewed" ||
    extent.receipt_ids.length !== 0 ||
    grain.receipt_ids.length !== 0 ||
    extent.packet_id !== null ||
    grain.packet_id !== null ||
    extent.updated_at !== null ||
    grain.updated_at !== null ||
    extent.verdict_basis !== null ||
    grain.verdict_basis !== null ||
    grain.member_extent_decision_id !== null ||
    (grain.evidence_bindings?.length ?? 0) !== 0 ||
    extent.authorizes_study ||
    extent.authorizes_cross_product ||
    grain.authorizes_study ||
    grain.authorizes_cross_product
  ) {
    throw new Error(`${treatmentId}: Package 6 ledger row is not pristine`);
  }
}
const candidateKeys = selectedExtent.map(extentDecisionKey).sort();
if (
  sha256(`${candidateKeys.join("\n")}\n`) !==
  PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256
) {
  throw new Error("Package 6 candidate-key hash drifted");
}

const package2 = JSON.parse(read(PACKAGE_2_DRAFT_PATH)) as {
  candidates: Array<{ candidate_key: string }>;
};
const package4 = JSON.parse(read(PACKAGE_4_DRAFT_PATH)) as {
  candidates: Array<{ candidate_key: string }>;
};
const package5 = JSON.parse(read(PACKAGE_5_DRAFT_PATH)) as {
  candidates: Array<{
    candidate_key: string;
    gtfs_route_id: string;
    candidate_document: {
      source_id: string;
      source_url: string;
      anchor_relation: string;
      receipt_sha256: string;
      pdf_sha256: string;
      layout_text_sha256: string;
      raw_text_sha256: string;
      blocks_sha256: string;
      statement_blocks: NormalizedDocument["supporting_statement_blocks"];
    };
  }>;
};
const priorPackages = [
  {
    package_id: "plan040-package2",
    path: PACKAGE_2_DRAFT_PATH,
    sha256: sha256(read(PACKAGE_2_DRAFT_PATH)),
    candidate_keys: package2.candidates.map((candidate) =>
      candidate.candidate_key),
  },
  {
    package_id: "plan040-package4",
    path: PACKAGE_4_DRAFT_PATH,
    sha256: sha256(read(PACKAGE_4_DRAFT_PATH)),
    candidate_keys: package4.candidates.map((candidate) =>
      candidate.candidate_key),
  },
  {
    package_id: "plan040-package5",
    path: PACKAGE_5_DRAFT_PATH,
    sha256: PACKAGE_5_PINS.draft,
    candidate_keys: package5.candidates.map((candidate) =>
      candidate.candidate_key),
  },
].map((entry) => ({
  package_id: entry.package_id,
  path: entry.path,
  sha256: entry.sha256,
  candidate_count: entry.candidate_keys.length,
  overlap_count: candidateKeys.filter((key) =>
    entry.candidate_keys.includes(key)).length,
}));
if (priorPackages.some((entry) => entry.overlap_count !== 0)) {
  throw new Error("Package 6 overlaps Package 2, 4, or 5");
}

const fileHash = (path: string): string =>
  sha256(readFileSync(absolute(path)));
const package5ByRoute = new Map(package5.candidates.map((candidate) => [
  candidate.gtfs_route_id,
  candidate,
]));

function bindingStatus(
  routeId: string,
  anchorRelation: string,
): NormalizedDocument["binding_status"] {
  if (routeId === "Q10") {
    return "candidate_route_document_nonexclusive_q10_q80";
  }
  if (routeId === "Q33" || routeId === "Q47") {
    return "shared_q33_q47_document_nonexclusive";
  }
  if (routeId === "QM16" || routeId === "QM17") {
    return "shared_qm16_qm17_timetable_nonexclusive";
  }
  if (anchorRelation.includes("timetable")) {
    return "candidate_timetable_nonexhaustive_timepoints";
  }
  return "candidate_route_document_exact_non_authorizing";
}

function reusedDocument(routeId: string): NormalizedDocument {
  const prior = package5ByRoute.get(routeId);
  if (!prior) {
    throw new Error(`${routeId}: Package 5 document binding missing`);
  }
  const document = prior.candidate_document;
  const base = `raw/sources/${document.source_id}`;
  const receiptPath = `${base}/receipt.json`;
  const receipt = JSON.parse(read(receiptPath)) as {
    route_ids?: string[];
  };
  for (const [path, expected, label] of [
    [receiptPath, document.receipt_sha256, "receipt"],
    [`${base}/source.pdf`, document.pdf_sha256, "PDF"],
    [`${base}/text.txt`, document.layout_text_sha256, "layout text"],
    [`${base}/text_raw.txt`, document.raw_text_sha256, "raw text"],
    [`${base}/blocks.jsonl`, document.blocks_sha256, "blocks"],
  ] as const) {
    if (fileHash(path) !== expected) {
      throw new Error(`${routeId}: reused ${label} bytes drifted`);
    }
  }
  const routeIds = receipt.route_ids ?? [routeId];
  return {
    source_id: document.source_id,
    source_url: document.source_url,
    source_origin: "reused_immutable_package_3_or_5_document",
    binding_status: bindingStatus(routeId, document.anchor_relation),
    route_ids: routeIds,
    shared_document: routeIds.length > 1,
    nonexclusive_context:
      routeId === "Q10" || routeId === "Q33" || routeId === "Q47",
    document_is_full_stop_chain:
      !document.anchor_relation.includes("timetable"),
    receipt_path: receiptPath,
    receipt_sha256: document.receipt_sha256,
    pdf_sha256: document.pdf_sha256,
    layout_text_sha256: document.layout_text_sha256,
    raw_text_sha256: document.raw_text_sha256,
    blocks_sha256: document.blocks_sha256,
    supporting_statement_blocks: document.statement_blocks,
  };
}

function newlyAcquiredDocument(routeId: string): NormalizedDocument {
  const sourceId = NEW_SOURCE_BY_ROUTE[routeId];
  if (!sourceId) throw new Error(`${routeId}: new source mapping missing`);
  const base = `raw/sources/${sourceId}`;
  const receiptPath = `${base}/receipt.json`;
  const receiptText = read(receiptPath);
  const receipt = JSON.parse(receiptText) as {
    source_id: string;
    source_url: string;
    route_ids: string[];
    pdf_sha256: string;
    text_sha256: string;
    shared_document: boolean;
    nonexclusive_context: boolean;
    document_is_full_stop_chain: false;
    source_row_anchor_derivations: Array<{
      route_id: string;
      timetable_href: string;
      service_change_source_html_sha256: string;
    }>;
    transport_receipt: {
      redirect_status: 301;
      final_status: 200;
      response_content_length: number;
    };
  };
  const pdfPath = `${base}/source.pdf`;
  const layoutPath = `${base}/text.txt`;
  const rawPath = `${base}/text_raw.txt`;
  const blocksPath = `${base}/blocks.jsonl`;
  const blocks = parseJsonl<SourceBlock>(blocksPath);
  if (
    receipt.source_id !== sourceId ||
    !receipt.route_ids.includes(routeId) ||
    receipt.source_row_anchor_derivations.some((anchor) =>
      anchor.service_change_source_html_sha256 !==
        SERVICE_CHANGE_HTML_SHA256 ||
      anchor.timetable_href !== receipt.source_url) ||
    receipt.transport_receipt.redirect_status !== 301 ||
    receipt.transport_receipt.final_status !== 200 ||
    receipt.transport_receipt.response_content_length !==
      statSync(absolute(pdfPath)).size ||
    fileHash(pdfPath) !== receipt.pdf_sha256 ||
    fileHash(layoutPath) !== receipt.text_sha256
  ) {
    throw new Error(`${routeId}: new exact candidate document drifted`);
  }
  const routePattern = routeId === "QM16" || routeId === "QM17"
    ? /QM16|QM17/iu
    : new RegExp(routeId, "iu");
  const supportingBlocks = blocks
    .filter((block) => routePattern.test(block.normalized_text))
    .slice(0, 16)
    .map((block) => ({
      evidence_id: `${sourceId}#${block.block_id}`,
      page_number: block.page_number,
      raw_text_sha256: block.raw_text_sha256.replace(/^sha256:/u, ""),
      normalized_text: block.normalized_text,
    }));
  if (supportingBlocks.length === 0) {
    throw new Error(`${routeId}: new document has no route blocks`);
  }
  return {
    source_id: sourceId,
    source_url: receipt.source_url,
    source_origin: "package_6_new_exact_candidate_timetable",
    binding_status: bindingStatus(routeId, "candidate_timetable_profile"),
    route_ids: receipt.route_ids,
    shared_document: receipt.shared_document,
    nonexclusive_context: receipt.nonexclusive_context,
    document_is_full_stop_chain: receipt.document_is_full_stop_chain,
    receipt_path: receiptPath,
    receipt_sha256: sha256(receiptText),
    pdf_sha256: receipt.pdf_sha256,
    layout_text_sha256: receipt.text_sha256,
    raw_text_sha256: fileHash(rawPath),
    blocks_sha256: fileHash(blocksPath),
    supporting_statement_blocks: supportingBlocks,
  };
}

const documentByRoute = new Map<string, NormalizedDocument>(
  ROUTE_ORDER.map((routeId) => [
    routeId,
    NEW_SOURCE_BY_ROUTE[routeId]
      ? newlyAcquiredDocument(routeId)
      : reusedDocument(routeId),
  ]),
);
if (
  REUSED_ROUTE_IDS.length !== 17 ||
  new Set([...documentByRoute.values()].map((document) =>
    document.source_id)).size !== 18
) {
  throw new Error("Package 6 requires 17 reused routes and 18 unique documents total");
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

const serviceHtml = read(SERVICE_CHANGE_HTML_PATH);
if (sha256(serviceHtml) !== SERVICE_CHANGE_HTML_SHA256) {
  throw new Error("Phase 2 service-change HTML drifted");
}
const settingsMatch = serviceHtml.match(
  /<script type="application\/json" data-drupal-selector="drupal-settings-json">([\s\S]*?)<\/script>/u,
);
if (!settingsMatch) throw new Error("Phase 2 route table settings missing");
const settings = JSON.parse(settingsMatch[1]!) as {
  mtaDatatable: {
    "21": {
      csvData: {
        data: Array<Record<string, { value: string }>>;
      };
    };
  };
};
const serviceRows = settings.mtaDatatable["21"].csvData.data;
const sourceRowByRoute = new Map(ROUTE_ORDER.map((routeId) => {
  const row = serviceRows.find((candidate) =>
    candidate.Route?.value === routeId);
  if (!row) throw new Error(`${routeId}: Phase 2 source row missing`);
  const cells = ["P1", "P2", "P3", "P4", "P5", "P6"]
    .map((key) => row[key]?.value ?? "");
  const rowAnchors = cells.flatMap(anchors);
  const document = documentByRoute.get(routeId)!;
  if (!rowAnchors.some((anchor) =>
    anchor.href === document.source_url)) {
    throw new Error(`${routeId}: document is not derived from exact source row`);
  }
  return [routeId, {
    source_id: SERVICE_CHANGE_SOURCE_ID as const,
    source_html_sha256: SERVICE_CHANGE_HTML_SHA256,
    route_row: routeId,
    row_sha256: sha256(stableBytes({ route: routeId, cells })),
    implementation_statement: stripHtml(cells[0] ?? ""),
    candidate_change_context: cells.slice(1, 4)
      .map(stripHtml).filter(Boolean),
    anchors: rowAnchors,
  }];
}));

const preReceiptPath = `raw/sources/${PRE_SOURCE_ID}/receipt.json`;
const preReceiptText = read(preReceiptPath);
const preReceipt = JSON.parse(preReceiptText) as {
  source_id: string;
  zip_sha1: string;
  zip_sha256: string;
  zip_bytes: number;
  service_window: { start: string; end: string };
};
const preZipPath = `raw/sources/${PRE_SOURCE_ID}/source.zip`;
const preZip = readFileSync(absolute(preZipPath));
if (
  preReceipt.source_id !== PRE_SOURCE_ID ||
  preReceipt.zip_sha1 !== PLAN040_PACKAGE_6_PRE_BUSCO_SHA1 ||
  preReceipt.zip_bytes !== preZip.byteLength ||
  preReceipt.zip_sha1 !== sha("sha1", preZip) ||
  preReceipt.zip_sha256 !== sha256(preZip)
) {
  throw new Error("Package 6 accepted pre feed drifted");
}
const gtfsBase = `raw/sources/${PRE_SOURCE_ID}/extracted`;
const calendar = parseGtfsRecords(read(`${gtfsBase}/calendar.txt`));
const calendarDates = parseGtfsRecords(read(`${gtfsBase}/calendar_dates.txt`));
const trips = parseGtfsRecords(read(`${gtfsBase}/trips.txt`));
const routes = parseGtfsRecords(read(`${gtfsBase}/routes.txt`));

function activeServiceIds(date: string): string[] {
  const compact = date.replaceAll("-", "");
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
    calendar.filter((row) =>
      compact >= (row.start_date ?? "") &&
      compact <= (row.end_date ?? "") &&
      row[weekday] === "1")
      .map((row) => row.service_id ?? "").filter(Boolean),
  );
  for (const exception of calendarDates) {
    if (exception.date !== compact || !exception.service_id) continue;
    if (exception.exception_type === "1") active.add(exception.service_id);
    if (exception.exception_type === "2") active.delete(exception.service_id);
  }
  return [...active].sort();
}

const preInventoryByRoute = new Map<
  string,
  Plan040Package6CandidateEvidence["pre_inventory"]
>();
for (const routeId of ROUTE_ORDER) {
  const targetDate = EXPRESS_ROUTE_IDS.has(routeId)
    ? "2025-08-29" as const
    : "2025-08-30" as const;
  const serviceIds = activeServiceIds(targetDate);
  const active = new Set(serviceIds);
  const routeRows = routes.filter((route) => route.route_id === routeId);
  const routeTrips = trips.filter((trip) => trip.route_id === routeId);
  const activeTrips = routeTrips.filter((trip) =>
    active.has(trip.service_id ?? ""));
  if (
    routeRows.length !== 1 ||
    routeTrips.length === 0 ||
    activeTrips.length === 0
  ) {
    throw new Error(`${routeId}: exact pre active inventory missing`);
  }
  preInventoryByRoute.set(routeId, {
    source_id: PRE_SOURCE_ID,
    zip_sha1: PLAN040_PACKAGE_6_PRE_BUSCO_SHA1,
    zip_sha256: preReceipt.zip_sha256,
    target_date: targetDate,
    service_window: preReceipt.service_window,
    active_service_ids: serviceIds,
    active_service_id_sha256: sha256(`${serviceIds.join("\n")}\n`),
    route_row_count: 1,
    route_trip_row_count: routeTrips.length,
    active_trip_count: activeTrips.length,
    active_shape_ids: uniqueSorted(activeTrips.map((trip) =>
      trip.shape_id ?? "")),
    route_row_presence_is_not_trip_inventory: true,
  });
}

async function scanScheduleSource(): Promise<{
  input: {
    source_id: typeof SCHEDULE_SOURCE_ID;
    source_path: string;
    source_csv_sha256: string;
    source_bytes: number;
    receipt_path: string;
    receipt_sha256: string;
    blocks_path: string;
    blocks_sha256: string;
  };
  slices: ScheduleSlice[];
}> {
  const sourcePath = `raw/sources/${SCHEDULE_SOURCE_ID}/source.csv`;
  const receiptPath = `raw/sources/${SCHEDULE_SOURCE_ID}/receipt.json`;
  const blocksPath = `raw/sources/${SCHEDULE_SOURCE_ID}/blocks.jsonl`;
  const receiptText = read(receiptPath);
  const receipt = JSON.parse(receiptText) as {
    source_id?: string;
    merged_sha256: string;
  };
  const specs = ROUTE_ORDER.flatMap((routeId) => [
    {
      scheduleDate: EXPRESS_ROUTE_IDS.has(routeId)
        ? "2025-08-29"
        : "2025-08-30",
      routeId,
    },
    {
      scheduleDate: EXPRESS_ROUTE_IDS.has(routeId)
        ? "2025-09-02"
        : "2025-08-31",
      routeId,
    },
  ]);
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
  const hash = createHash("sha256");
  const stream = createReadStream(absolute(sourcePath));
  stream.on("data", (chunk) => hash.update(chunk));
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | undefined;
  for await (const line of lines) {
    if (!header) {
      header = parseCsvRows(`${line}\n`)[0];
      if (!header || header[0] !== "schedule_date" || header[8] !== "route_id") {
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
  const slices = [...accumulators.values()].map((accumulator) => {
    if (
      accumulator.operators.size > 1 ||
      (accumulator.operators.size === 1 &&
        !accumulator.operators.has("MTA Bus"))
    ) {
      throw new Error(
        `${accumulator.spec.routeId}: unexpected schedule operator`,
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
    const tripTypeRows = Object.fromEntries(
      [...accumulator.tripTypes.entries()].sort(([left], [right]) =>
        left.localeCompare(right)),
    );
    return {
      source_id: SCHEDULE_SOURCE_ID,
      schedule_date: accumulator.spec.scheduleDate,
      route_id: accumulator.spec.routeId,
      operator: "MTA Bus",
      row_count: accumulator.rowCount,
      trip_type_rows: tripTypeRows,
      passenger_row_count: Object.entries(tripTypeRows)
        .filter(([type]) => !["2", "3", "4"].includes(type))
        .reduce((sum, [, count]) => sum + count, 0),
      excluded_nonrevenue_row_count: Object.entries(tripTypeRows)
        .filter(([type]) => ["2", "3", "4"].includes(type))
        .reduce((sum, [, count]) => sum + count, 0),
      ambiguous_shape_ids: ambiguous.sort(),
      passenger_shape_ids: passenger.sort(),
      nonrevenue_shape_ids: nonrevenue.sort(),
      shape_trip_type_rows: shapeTripTypeRows,
    } satisfies ScheduleSlice;
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
      receipt_path: receiptPath,
      receipt_sha256: sha256(receiptText),
      blocks_path: blocksPath,
      blocks_sha256: fileHash(blocksPath),
    },
    slices,
  };
}

const schedule = await scanScheduleSource();
const scheduleByKey = new Map(schedule.slices.map((slice) => [
  `${slice.schedule_date}\u0000${slice.route_id}`,
  slice,
]));
const scheduleFor = (
  routeId: Plan040Package6RouteId,
  side: "pre" | "post",
): ScheduleSlice => {
  const date = side === "pre"
    ? EXPRESS_ROUTE_IDS.has(routeId) ? "2025-08-29" : "2025-08-30"
    : EXPRESS_ROUTE_IDS.has(routeId) ? "2025-09-02" : "2025-08-31";
  const slice = scheduleByKey.get(`${date}\u0000${routeId}`);
  if (!slice) throw new Error(`${routeId} ${date}: schedule slice missing`);
  return slice;
};

const treatments = parseJsonl<TreatmentRecord>(TREATMENT_PATH);
const treatmentById = new Map(treatments.map((record) => [
  record.record_id,
  record,
]));
const serviceBlocks = parseJsonl<SourceBlock>(SERVICE_CHANGE_BLOCKS_PATH);
const serviceBlockByEvidence = new Map(serviceBlocks.map((block) => [
  `${block.source_id}#${block.block_id}`,
  block,
]));

function riskFlags(
  waveId: Plan040Package6WaveId,
  routeId: string,
  treatmentId: string,
): string[] {
  const flags = [
    "current_evidence_not_positive_eligible",
    "future_positive_requires_new_e1c52_exact_post_full_stop_bytes_and_reviewed_stop_id_equivalence",
    "independent_risk_review_required_before_any_gate",
  ];
  if (waveId === "P6-A") {
    flags.push("direct_route_geometry_requires_bounded_extent_review");
  }
  if (waveId === "P6-B") {
    flags.push("route_variant_or_cross_route_lineage_requires_review");
  }
  if (waveId === "P6-C") {
    flags.push("heterogeneous_branch_segment_and_trip_subset_grain");
  }
  if (waveId === "P6-D") {
    flags.push("whole_route_spatial_extent_with_temporal_service_scope");
  }
  if (waveId === "P6-E") {
    flags.push("source_gap_or_source_discrepancy_requires_separate_review");
  }
  if (routeId === "Q10") flags.push("q10_q80_combined_timetable_context");
  if (routeId === "Q11") flags.push("q21_combination_lineage");
  if (routeId === "Q22") flags.push("q22_branch_specific_service");
  if (routeId === "Q33" || routeId === "Q47") {
    flags.push("q33_q47_shared_document_and_terminal_a_replacement_context");
  }
  if (routeId === "Q69") {
    flags.push("q69_pre_schedule_vs_gtfs_shape_discrepancy");
  }
  if (routeId === "QM16" || routeId === "QM17") {
    flags.push("qm16_qm17_shared_timetable_and_absent_schedule_slices");
  }
  if (routeId === "QM15") {
    flags.push("unrelated_qm15_spring_occurrence_excluded");
  }
  if (treatmentId.includes("bayswater")) {
    flags.push("two_trip_subset_scope");
  }
  return uniqueSorted(flags);
}

const candidates: Plan040Package6CandidateEvidence[] =
  PLAN040_PACKAGE_6_CANDIDATES.map(([waveId, routeId, treatmentId]) => {
    const extent = extentByTreatment.get(treatmentId)!;
    const grain = grainByTreatment.get(treatmentId)!;
    const treatment = treatmentById.get(treatmentId);
    if (
      !treatment ||
      treatment.source_id !== SERVICE_CHANGE_SOURCE_ID ||
      treatment.payload.treatment_family !== "service_pattern" ||
      treatment.evidence_refs.length !== 1
    ) {
      throw new Error(`${treatmentId}: exact treatment evidence missing`);
    }
    const ref = treatment.evidence_refs[0]!;
    const block = serviceBlockByEvidence.get(ref.evidence_id);
    if (
      !block ||
      block.raw_text_sha256.replace(/^sha256:/u, "") !==
        ref.text_sha256.replace(/^sha256:/u, "") ||
      !block.normalized_text.includes(ref.source_quote)
    ) {
      throw new Error(`${treatmentId}: source block binding drifted`);
    }
    const preInventory = preInventoryByRoute.get(routeId)!;
    const pre = scheduleFor(routeId, "pre");
    const post = scheduleFor(routeId, "post");
    const activeShapes = new Set(preInventory.active_shape_ids);
    const matchedPassenger = pre.passenger_shape_ids.filter((shapeId) =>
      activeShapes.has(shapeId));
    const unmatchedPassenger = pre.passenger_shape_ids.filter((shapeId) =>
      !activeShapes.has(shapeId));
    const activeAbsentFromSchedule = preInventory.active_shape_ids.filter(
      (shapeId) => !pre.passenger_shape_ids.includes(shapeId),
    );
    const preStatus = pre.row_count === 0
      ? "reviewed_unresolved_schedule_slice_absent"
      : unmatchedPassenger.length > 0 ||
          activeAbsentFromSchedule.length > 0 ||
          pre.ambiguous_shape_ids.length > 0
        ? "reviewed_unresolved_unmatched_or_ambiguous"
        : "matched_no_unresolved_shapes";
    const gaps = [
      "exact_post_gtfs_zip_bytes_unavailable",
      "exact_post_member_bytes_unavailable",
      "post_calendar_expansion_not_computed",
      "ordered_full_stop_diff_not_computed",
      "schedule_to_post_gtfs_binding_unresolved",
      "positive_eligibility_requires_new_exact_post_full_stop_and_id_equivalence_evidence_plus_review",
      ...(documentByRoute.get(routeId)!.document_is_full_stop_chain
        ? []
        : ["candidate_document_timepoints_nonexhaustive_not_full_stop_chain"]),
      ...(documentByRoute.get(routeId)!.nonexclusive_context
        ? ["candidate_document_contains_nonexclusive_shared_context"]
        : []),
      ...(pre.row_count === 0
        ? ["pre_schedule_slice_absent_reviewed_unresolved"]
        : []),
      ...(post.row_count === 0
        ? ["post_schedule_slice_absent_reviewed_unresolved"]
        : []),
      ...(unmatchedPassenger.length > 0
        ? ["pre_schedule_passenger_shape_unmatched_to_active_gtfs"]
        : []),
      ...(activeAbsentFromSchedule.length > 0
        ? ["active_gtfs_shape_absent_from_pre_schedule"]
        : []),
      ...(pre.ambiguous_shape_ids.length > 0
        ? ["pre_schedule_trip_type_mixed_shape_ambiguous"]
        : []),
      ...(routeId === "Q69"
        ? ["q69_schedule_gtfs_shape_discrepancy"]
        : []),
      ...(routeId === "QM16" || routeId === "QM17"
        ? ["shared_timetable_route_variant_binding_unresolved"]
        : []),
      ...(waveId === "P6-C"
        ? ["heterogeneous_q22_grain_requires_separate_review"]
        : []),
      ...(waveId === "P6-D"
        ? ["temporal_service_scope_not_yet_structured"]
        : []),
    ];
    return {
      candidate_key: extentDecisionKey(extent),
      occurrence_id: extent.occurrence_id,
      route_record_id: extent.route_record_id,
      treatment_record_id: treatmentId,
      treatment_family: "service_pattern",
      gtfs_route_id: routeId,
      implementation_date: EXPRESS_ROUTE_IDS.has(routeId)
        ? "2025-09-02"
        : "2025-08-31",
      risk_wave_id: waveId,
      risk_flags: riskFlags(waveId, routeId, treatmentId),
      source_row: sourceRowByRoute.get(routeId)!,
      service_change_evidence: {
        evidence_id: ref.evidence_id,
        block_sha256: ref.text_sha256.replace(/^sha256:/u, ""),
        captured_statement: ref.source_quote,
        treatment_kind: treatment.payload.treatment_kind,
      },
      candidate_document: documentByRoute.get(routeId)!,
      pre_inventory: preInventory,
      required_post_inventory: {
        role: "phase_2_initial_busco_service_pattern_inventory",
        target_date: EXPRESS_ROUTE_IDS.has(routeId)
          ? "2025-09-02"
          : "2025-08-31",
        version_sha1: PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1,
        zip_sha256: null,
        exact_member_metadata: POST_MEMBER_METADATA.map((member) => ({
          ...member,
        })),
        bounded_acquisition_search_repeated: false,
        zip_bytes_status: "blocked_whole_zip_bytes_unavailable",
        member_bytes_status:
          "blocked_no_verified_required_member_matches",
        calendar_expansion_status:
          "not_computed_required_member_bytes_unavailable",
        ordered_stop_comparison_status:
          "not_computed_required_member_bytes_unavailable",
      },
      schedule_validation: {
        pre: pre as unknown as Record<string, JsonValue>,
        post: post as unknown as Record<string, JsonValue>,
        revenue_policy: {
          passenger: "any_trip_type_except_2_3_4",
          excluded_nonrevenue_trip_types: ["2", "3", "4"],
          mixed_shape_policy: "reviewed_unresolved",
          unmatched_shape_policy: "reviewed_unresolved",
        },
        pre_binding: {
          matched_passenger_shape_ids: matchedPassenger,
          unmatched_passenger_shape_ids: unmatchedPassenger,
          active_gtfs_shapes_absent_from_schedule: activeAbsentFromSchedule,
          excluded_nonrevenue_shape_ids: pre.nonrevenue_shape_ids,
          ambiguous_shape_ids: pre.ambiguous_shape_ids,
          status: preStatus,
        } as unknown as Record<string, JsonValue>,
        post_binding: {
          unmatched_passenger_shape_ids: post.passenger_shape_ids,
          excluded_nonrevenue_shape_ids: post.nonrevenue_shape_ids,
          ambiguous_shape_ids: post.ambiguous_shape_ids,
          status:
            "reviewed_unresolved_exact_post_gtfs_members_unavailable",
        } as unknown as Record<string, JsonValue>,
      },
      ledger_snapshot: {
        extent_verdict: "unreviewed",
        grain_verdict: "unreviewed",
        current_extent_kind: "unresolved",
        extent_receipt_ids: [],
        grain_receipt_ids: [],
        extent_decision_id: null,
        grain_decision_id: grain.member_extent_decision_id,
      },
      unresolved_gap_codes: uniqueSorted(gaps),
      evidence_verdict: "receipt_terminal_unresolved",
      proposed_extent_decision: null,
      proposed_grain_decision: null,
      persisted_extent_decision: null,
      persisted_grain_decision: null,
      current_evidence_positive_eligible: false,
      positive_eligibility_requires_new_exact_post_full_stop_and_id_equivalence_evidence_plus_review:
        true,
      independent_audit_completed: true,
      review_outcome_state:
        "audited_current_evidence_terminal_absence",
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
    };
  });

const reusedEvidence = REUSED_ROUTE_IDS.map((routeId) => ({
  route_id: routeId,
  ...documentByRoute.get(routeId)!,
  reacquisition_performed: false,
  source_bytes_recomputed: false,
}));
const newEvidenceBySource = [
  ...new Map(["Q102", "QM16", "QM17"].map((routeId) => {
    const document = documentByRoute.get(routeId)!;
    const sourceReceipt = JSON.parse(read(document.receipt_path)) as {
      binding_scope: string;
      content_disposition: string;
      page_count: number;
      pdf_bytes: number;
      retrieved_at: string;
      source_row_anchor_derivations: unknown[];
      transport_receipt: unknown;
    };
    return [document.source_id, {
      source_id: document.source_id,
      route_ids: document.route_ids,
      source_url: document.source_url,
      receipt_path: document.receipt_path,
      receipt_sha256: document.receipt_sha256,
      pdf_sha256: document.pdf_sha256,
      layout_text_sha256: document.layout_text_sha256,
      raw_text_sha256: document.raw_text_sha256,
      blocks_sha256: document.blocks_sha256,
      shared_document: document.shared_document,
      nonexclusive_context: document.nonexclusive_context,
      document_is_full_stop_chain: document.document_is_full_stop_chain,
      binding_scope: sourceReceipt.binding_scope,
      content_disposition: sourceReceipt.content_disposition,
      page_count: sourceReceipt.page_count,
      pdf_bytes: sourceReceipt.pdf_bytes,
      retrieved_at: sourceReceipt.retrieved_at,
      source_row_anchor_derivations:
        sourceReceipt.source_row_anchor_derivations,
      transport_receipt: sourceReceipt.transport_receipt,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_decision_persistence: false,
    }];
  })).values(),
];
const schedulePresent = schedule.slices.filter((slice) =>
  slice.row_count > 0).length;
const acquisition = {
  schema_version: 1,
  receipt_id:
    "plan-040-qbnr-service-pattern-package-6-acquisition-v1",
  candidate_count: 29,
  route_count: 20,
  candidate_key_sha256: PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256,
  risk_wave_partition: PLAN040_PACKAGE_6_WAVES,
  pristine_ledger_inputs: {
    extent: {
      path: EXTENT_LEDGER_PATH,
      sha256: sha256(read(EXTENT_LEDGER_PATH)),
      candidate_count: 29,
      verdict_distribution: { unreviewed: 29 },
    },
    grain: {
      path: GRAIN_LEDGER_PATH,
      sha256: sha256(read(GRAIN_LEDGER_PATH)),
      candidate_count: 29,
      verdict_distribution: { unreviewed: 29 },
    },
  },
  immutable_prior_evidence: {
    package_3: {
      acquisition: {
        path: PACKAGE_3_ACQUISITION_PATH,
        sha256: PACKAGE_3_PINS.acquisition,
      },
      evidence: {
        path: PACKAGE_3_EVIDENCE_PATH,
        sha256: PACKAGE_3_PINS.evidence,
      },
      draft: {
        path: PACKAGE_3_DRAFT_PATH,
        sha256: PACKAGE_3_PINS.draft,
      },
    },
    package_5: {
      acquisition: {
        path: PACKAGE_5_ACQUISITION_PATH,
        sha256: PACKAGE_5_PINS.acquisition,
      },
      evidence: {
        path: PACKAGE_5_EVIDENCE_PATH,
        sha256: PACKAGE_5_PINS.evidence,
      },
      draft: {
        path: PACKAGE_5_DRAFT_PATH,
        sha256: PACKAGE_5_PINS.draft,
      },
      reviewed_absence_receipt: {
        path: PACKAGE_5_RECEIPT_PATH,
        sha256: PACKAGE_5_PINS.receipt,
      },
    },
    reused_route_binding_count: 17,
    reused_unique_document_count:
      new Set(reusedEvidence.map((entry) => entry.source_id)).size,
    reused_route_evidence: reusedEvidence,
    reacquisition_performed: false,
    source_bytes_recomputed: false,
  },
  exact_new_candidate_documents: {
    acquired_route_count: 3,
    acquired_unique_document_count: 2,
    documents: newEvidenceBySource,
  },
  service_change_input: {
    source_id: SERVICE_CHANGE_SOURCE_ID,
    html_path: SERVICE_CHANGE_HTML_PATH,
    html_sha256: SERVICE_CHANGE_HTML_SHA256,
    blocks_path: SERVICE_CHANGE_BLOCKS_PATH,
    blocks_sha256: fileHash(SERVICE_CHANGE_BLOCKS_PATH),
    exact_candidate_route_rows_verified: 20,
  },
  accepted_pre_feed: {
    source_id: PRE_SOURCE_ID,
    receipt_path: preReceiptPath,
    receipt_sha256: sha256(preReceiptText),
    zip_path: preZipPath,
    zip_bytes: preReceipt.zip_bytes,
    zip_sha1: preReceipt.zip_sha1,
    zip_sha256: preReceipt.zip_sha256,
    service_window: preReceipt.service_window,
    calendar_expansion: {
      local_date: "2025-08-30",
      express_date: "2025-08-29",
      route_inventory_audit: ROUTE_ORDER.map((routeId) => ({
        route_id: routeId,
        ...preInventoryByRoute.get(routeId)!,
      })),
    },
    route_row_presence_policy:
      "route-row presence is never promoted to active trip inventory",
  },
  required_exact_post_feed: {
    role: "phase_2_initial_busco_service_pattern_inventory",
    version_sha1: PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1,
    zip_sha256: null,
    exact_member_metadata: POST_MEMBER_METADATA,
    zip_bytes_status: "blocked_whole_zip_bytes_unavailable",
    member_bytes_status: "blocked_no_verified_required_member_matches",
    target_calendar_expansion_status:
      "not_computed_required_member_bytes_unavailable",
    ordered_full_stop_chain_status:
      "not_computed_required_member_bytes_unavailable",
    bounded_acquisition_search_repeated: false,
    prior_search_reference: {
      path: PACKAGE_5_ACQUISITION_PATH,
      sha256: PACKAGE_5_PINS.acquisition,
    },
  },
  non_substitute_later_post_feed: {
    version_sha1: PLAN040_PACKAGE_6_NON_SUBSTITUTE_POST_BUSCO_SHA1,
    substitution_status:
      "prohibited_not_the_required_initial_phase_2_identity",
  },
  schedule_input: {
    ...schedule.input,
    requested_slice_count: 40,
    present_slice_count: schedulePresent,
    absent_slice_count: 40 - schedulePresent,
    absent_slices: schedule.slices.filter((slice) =>
      slice.row_count === 0).map((slice) => ({
        route_id: slice.route_id,
        schedule_date: slice.schedule_date,
      })),
    passenger_policy: "any_trip_type_except_2_3_4",
    nonrevenue_excluded: ["2", "3", "4"],
  },
  prior_package_overlap: priorPackages,
  excluded_related_occurrence: {
    route_id: "QM15",
    occurrence_id: "occurrence:833f69866045c25967353373",
    treatment_record_id:
      "treatment_weekday-express-bus-trip-additions-spring-2025",
    reason: "different_occurrence_source_and_time_context",
    excluded_from_candidate_scope: true,
  },
  authority_state:
    "evidence_only_no_gate_no_acceptance_no_persistence",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const acquisitionBytes = stableBytes(acquisition);
const acquisitionSha256 = sha256(acquisitionBytes);

const evidence = {
  schema_version: 1,
  manifest_id: "plan-040-qbnr-service-pattern-package-6-evidence-v1",
  candidate_count: 29,
  route_count: 20,
  candidate_key_sha256: PLAN040_PACKAGE_6_CANDIDATE_KEY_SHA256,
  risk_wave_partition: PLAN040_PACKAGE_6_WAVES,
  audited_current_outcomes:
    PLAN040_PACKAGE_6_AUDITED_CURRENT_OUTCOMES,
  candidate_document_binding_count: 29,
  unique_document_count: 18,
  reused_route_document_count: 17,
  newly_acquired_route_document_count: 3,
  evidence_verdict_distribution: {
    receipt_terminal_unresolved: 29,
  },
  proposed_extent_decision_count: 0,
  persisted_extent_decision_count: 0,
  proposed_grain_decision_count: 0,
  persisted_grain_decision_count: 0,
  prior_package_overlap: priorPackages,
  candidates,
  source_gap_summary: {
    exact_initial_post_feed_members_unavailable: 29,
    q69_schedule_gtfs_shape_discrepancy: 1,
    qm16_qm17_missing_schedule_route_date_slices: 4,
    timetable_documents_nonexhaustive: candidates.filter((candidate) =>
      !candidate.candidate_document.document_is_full_stop_chain).length,
  },
  review_protocol: {
    package_owner_gate_allowed: false,
    independent_risk_waves_required: 5,
    current_positive_extent_or_service_scope_possible: false,
    reviewed_terminal_absence_allowed: true,
    review_alone_can_authorize_positive: false,
    future_positive_requires_new_exact_post_full_stop_member_bytes: true,
    future_positive_requires_reviewed_stop_id_equivalence: true,
    future_positive_requires_independent_review_after_new_evidence: true,
  },
  future_positive_prerequisites: {
    exact_post_feed_version_sha1:
      PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1,
    new_exact_post_full_stop_member_bytes_required: true,
    reviewed_stop_id_equivalence_required: true,
    independent_review_required_after_new_evidence: true,
    review_alone_sufficient: false,
  },
  version_separation: {
    pre_busco_sha1: PLAN040_PACKAGE_6_PRE_BUSCO_SHA1,
    required_initial_post_busco_sha1:
      PLAN040_PACKAGE_6_REQUIRED_POST_BUSCO_SHA1,
    later_non_substitute_busco_sha1:
      PLAN040_PACKAGE_6_NON_SUBSTITUTE_POST_BUSCO_SHA1,
    later_version_is_not_substitute: true,
    bounded_post_feed_search_repeated: false,
  },
  equivalence_policy: {
    automatic_equivalence: "identical_identifier_only",
    route_name_coordinate_or_proximity_equivalence: false,
    occurrence_inference_from_route_schedule_or_document_presence: false,
  },
  authorization_state:
    "evidence_only_no_gate_no_acceptance_no_persistence",
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const evidenceBytes = stableBytes(evidence);
const evidenceSha256 = sha256(evidenceBytes);

const draft = buildPlan040Package6Draft({
  acquisitionReceiptPath: ACQUISITION_PATH,
  acquisitionReceiptSha256: acquisitionSha256,
  evidenceManifestPath: EVIDENCE_PATH,
  evidenceManifestSha256: evidenceSha256,
  candidates,
  package2CandidateKeys: package2.candidates.map((candidate) =>
    candidate.candidate_key),
  package4CandidateKeys: package4.candidates.map((candidate) =>
    candidate.candidate_key),
  package5CandidateKeys: package5.candidates.map((candidate) =>
    candidate.candidate_key),
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
      throw new Error(`${path}: frozen Package 6 artifact is stale`);
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
    sha256: draftSha256,
  },
  replay_sha256: plan040Package6ReplayHash(
    draft as unknown as JsonValue,
  ),
  candidate_count: draft.candidate_count,
  route_count: draft.route_count,
  candidate_key_sha256: draft.candidate_key_sha256,
  risk_wave_partition: draft.wave_partition,
  evidence_verdict_distribution: draft.evidence_verdict_distribution,
  proposed_decision_count: draft.proposed_decision_count,
  persisted_decision_count: draft.persisted_decision_count,
  proposed_grain_decision_count: draft.proposed_grain_decision_count,
  persisted_grain_decision_count: draft.persisted_grain_decision_count,
  authorization_state: draft.authorization_state,
  freeze_readiness: draft.freeze_readiness,
}));
