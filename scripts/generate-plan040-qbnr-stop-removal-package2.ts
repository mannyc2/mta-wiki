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
import {
  buildPlan040Package2CandidateEvidence,
  buildPlan040Package2Draft,
  PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256,
  plan040Package2ReplayHash,
  type Plan040Package2ScheduleSlice,
} from "../packages/pipeline/src/quality/plan040-qbnr-stop-removal-package2";
import type {
  Plan040AcquisitionCandidate,
} from "../packages/pipeline/src/quality/plan040-qbnr-stop-removal-acquisition";
import { loadGtfsStaticSnapshot } from "../packages/pipeline/src/reference/gtfs-static";
import { fullStopPatternsForDate } from "../packages/pipeline/src/reference/historical-full-stop";
import {
  loadOperationalSnapshotRegistry,
  snapshotById,
} from "../packages/pipeline/src/reference/snapshot-registry";

const PACKAGE1_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-acquisition-manifest-v1.json";
const ACQUISITION_PATH =
  "data/quality/acquisition/receipts/" +
  "plan-040-qbnr-stop-removal-package-2-stop-lists-v1.json";
const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-2-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-stop-removal-package-2-decision-draft-v1.json";
const MAIN_SCHEDULE_ID = "mta_bus_schedules_2025_candidate_windows";
const PREDECESSOR_SCHEDULE_ID =
  "mta_bus_schedules_2025_x63_x68_predecessors_2026_07_24";

type Package1Manifest = {
  candidates: Plan040AcquisitionCandidate[];
};

type StopListReceipt = {
  schema_version: 1;
  route_id: string;
  source_id: string;
  source_url: string;
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

type SliceSpec = {
  sourceId: string;
  scheduleDate: string;
  routeId: string;
  operator: "NYCT" | "MTA Bus";
};

type ScheduleInput = {
  source_id: string;
  source_path: string;
  source_csv_sha256: string;
  source_bytes: number;
  acquisition_receipt_path: string;
  acquisition_receipt_sha256: string;
  blocks_path: string;
  blocks_sha256: string;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const read = (path: string): string => readFileSync(resolve(repoRoot, path), "utf8");
const absolute = (path: string): string => resolve(repoRoot, path);
const stableBytes = (value: unknown): string =>
  `${stableJson(value as JsonValue)}\n`;

function sourceIdForRoute(routeId: string): string {
  return `mta_qbnr_2025_${routeId.toLowerCase()}_stop_list`;
}

function snapshotIdForSource(sourceId: string): string {
  const ids: Record<string, string> = {
    gtfs_static_20250615_queens_pre_qbnr:
      "gtfs-static-20250615-queens-pre-qbnr",
    gtfs_static_20250625_busco_pre_qbnr:
      "gtfs-static-20250625-busco-pre-qbnr",
    gtfs_static_20250626_queens_post_qbnr:
      "gtfs-static-20250626-queens-post-qbnr",
    gtfs_static_20250626_busco_post_qbnr:
      "gtfs-static-20250626-busco-post-qbnr",
  };
  const id = ids[sourceId];
  if (!id) throw new Error(`No launch-boundary snapshot mapping for ${sourceId}`);
  return id;
}

function expectedOperator(sourceId: string): "NYCT" | "MTA Bus" {
  return sourceId.includes("busco") ? "MTA Bus" : "NYCT";
}

function scheduleSourceId(routeId: string): string {
  return routeId === "X63" || routeId === "X68"
    ? PREDECESSOR_SCHEDULE_ID
    : MAIN_SCHEDULE_ID;
}

function scheduleSpecs(candidates: readonly Plan040AcquisitionCandidate[]): SliceSpec[] {
  const byKey = new Map<string, SliceSpec>();
  for (const candidate of candidates) {
    for (const boundary of [
      {
        sourceId: candidate.pre_source_id,
        scheduleDate: candidate.pre_target_date,
        routeId: candidate.pre_gtfs_route_id,
      },
      {
        sourceId: candidate.post_source_id!,
        scheduleDate: candidate.post_target_date,
        routeId: candidate.post_gtfs_route_id,
      },
    ]) {
      const spec: SliceSpec = {
        sourceId: scheduleSourceId(boundary.routeId),
        scheduleDate: boundary.scheduleDate,
        routeId: boundary.routeId,
        operator: expectedOperator(boundary.sourceId),
      };
      const key = `${spec.sourceId}\u0000${spec.scheduleDate}\u0000${spec.routeId}`;
      const prior = byKey.get(key);
      if (prior && prior.operator !== spec.operator) {
        throw new Error(`${key}: conflicting expected operators`);
      }
      byKey.set(key, spec);
    }
  }
  return [...byKey.values()].sort((left, right) =>
    `${left.sourceId}\u0000${left.scheduleDate}\u0000${left.routeId}`.localeCompare(
      `${right.sourceId}\u0000${right.scheduleDate}\u0000${right.routeId}`,
    ));
}

async function scanScheduleSource(
  sourceId: string,
  specs: readonly SliceSpec[],
): Promise<{ input: ScheduleInput; slices: Plan040Package2ScheduleSlice[] }> {
  const sourcePath =
    `raw/sources/${sourceId}/source.csv`;
  const receiptPath = `raw/sources/${sourceId}/receipt.json`;
  const blocksPath = `raw/sources/${sourceId}/blocks.jsonl`;
  const sourceAbsolute = absolute(sourcePath);
  const receiptJson = read(receiptPath);
  const receipt = JSON.parse(receiptJson) as {
    source_id?: string;
    merged_sha256: string;
  };
  const hash = createHash("sha256");
  const stream = createReadStream(sourceAbsolute);
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
        throw new Error(`${sourceId}: schedule header drifted`);
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
    const shapeTypes = accumulator.shapes.get(shapeId) ?? new Map<string, number>();
    shapeTypes.set(tripType, (shapeTypes.get(tripType) ?? 0) + 1);
    accumulator.shapes.set(shapeId, shapeTypes);
  }
  const sourceCsvSha256 = hash.digest("hex");
  if (receipt.merged_sha256 !== sourceCsvSha256) {
    throw new Error(`${sourceId}: schedule source differs from its acquisition receipt`);
  }
  if (receipt.source_id && receipt.source_id !== sourceId) {
    throw new Error(`${sourceId}: schedule receipt source ID drifted`);
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
        const hasPassenger = [...types.keys()].some((type) =>
          !["2", "3", "4"].includes(type));
        const hasNonrevenue = [...types.keys()].some((type) =>
          ["2", "3", "4"].includes(type));
        if (hasPassenger && hasNonrevenue) ambiguous.push(shapeId);
        else if (hasPassenger) passenger.push(shapeId);
        else nonrevenue.push(shapeId);
        return {
          shape_id: shapeId,
          trip_type_rows: Object.fromEntries([...types.entries()].sort(
            ([left], [right]) => left.localeCompare(right),
          )),
        };
      });
    return {
      source_id: sourceId,
      schedule_date: accumulator.spec.scheduleDate,
      route_id: accumulator.spec.routeId,
      operator: accumulator.spec.operator,
      row_count: accumulator.rowCount,
      trip_type_rows: Object.fromEntries([...accumulator.tripTypes.entries()].sort(
        ([left], [right]) => left.localeCompare(right),
      )),
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
      source_id: sourceId,
      source_path: sourcePath,
      source_csv_sha256: sourceCsvSha256,
      source_bytes: statSync(sourceAbsolute).size,
      acquisition_receipt_path: receiptPath,
      acquisition_receipt_sha256: sha256(receiptJson),
      blocks_path: blocksPath,
      blocks_sha256: sha256(read(blocksPath)),
    },
    slices,
  };
}

function verifyStopList(candidate: Plan040AcquisitionCandidate) {
  const sourceId = sourceIdForRoute(candidate.gtfs_route_id);
  const base = `raw/sources/${sourceId}`;
  const receiptPath = `${base}/receipt.json`;
  const pdfPath = `${base}/source.pdf`;
  const textPath = `${base}/text.txt`;
  const rawTextPath = `${base}/text_raw.txt`;
  const blocksPath = `${base}/blocks.jsonl`;
  const receiptJson = read(receiptPath);
  const receipt = JSON.parse(receiptJson) as StopListReceipt;
  const pdf = readFileSync(absolute(pdfPath));
  const text = readFileSync(absolute(textPath));
  const rawText = readFileSync(absolute(rawTextPath));
  const blocks = readFileSync(absolute(blocksPath));
  if (
    receipt.schema_version !== 1 ||
    receipt.route_id !== candidate.gtfs_route_id ||
    receipt.source_id !== sourceId ||
    receipt.source_url !== candidate.official_stop_list_url ||
    receipt.pdf_bytes !== pdf.byteLength ||
    receipt.pdf_sha256 !== sha256(pdf) ||
    receipt.text_bytes !== text.byteLength ||
    receipt.text_sha256 !== sha256(text) ||
    receipt.page_count !== rawText.toString("utf8").split("\f").length - 1 ||
    blocks.byteLength === 0 ||
    receipt.authorizes_occurrence !== false ||
    receipt.authorizes_study !== false ||
    receipt.authorizes_cross_product !== false
  ) {
    throw new Error(`${candidate.gtfs_route_id}: stop-list receipt drifted`);
  }
  return {
    route_id: candidate.gtfs_route_id,
    source_id: sourceId,
    source_url: receipt.source_url,
    retrieved_at: receipt.retrieved_at,
    receipt_path: receiptPath,
    receipt_sha256: sha256(receiptJson),
    pdf_path: pdfPath,
    pdf_sha256: receipt.pdf_sha256,
    pdf_bytes: receipt.pdf_bytes,
    page_count: receipt.page_count,
    layout_text_path: textPath,
    layout_text_sha256: receipt.text_sha256,
    raw_text_path: rawTextPath,
    raw_text_sha256: sha256(rawText),
    raw_text_bytes: rawText.byteLength,
    blocks_path: blocksPath,
    blocks_sha256: sha256(blocks),
    blocks_bytes: blocks.byteLength,
    layout_text: text.toString("utf8"),
    raw_text: rawText.toString("utf8"),
    authorizes_occurrence: false as const,
    authorizes_study: false as const,
    authorizes_cross_product: false as const,
    authorizes_decision_persistence: false as const,
  };
}

const package1Bytes = read(PACKAGE1_PATH);
if (sha256(package1Bytes) !== PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256) {
  throw new Error("Plan 040 Package 1 manifest pin drifted");
}
const package1 = JSON.parse(package1Bytes) as Package1Manifest;
const candidates = package1.candidates
  .filter((candidate) => candidate.inventory_status === "accepted_reused")
  .sort((left, right) => left.gtfs_route_id.localeCompare(right.gtfs_route_id));
if (candidates.length !== 24) {
  throw new Error(`Plan 040 Package 2 requires exact 24 candidates, got ${candidates.length}`);
}

const stopLists = candidates.map(verifyStopList);
const specs = scheduleSpecs(candidates);
const scheduleResults = [];
for (const sourceId of [MAIN_SCHEDULE_ID, PREDECESSOR_SCHEDULE_ID]) {
  scheduleResults.push(await scanScheduleSource(
    sourceId,
    specs.filter((spec) => spec.sourceId === sourceId),
  ));
}
const scheduleInputs = scheduleResults.map((result) => result.input);
const slices = scheduleResults.flatMap((result) => result.slices);
const slicesByKey = new Map(slices.map((slice) => [
  `${slice.source_id}\u0000${slice.schedule_date}\u0000${slice.route_id}`,
  slice,
]));
const sliceFor = (date: string, routeId: string): Plan040Package2ScheduleSlice => {
  const sourceId = scheduleSourceId(routeId);
  const slice = slicesByKey.get(`${sourceId}\u0000${date}\u0000${routeId}`);
  if (!slice) throw new Error(`${date} ${routeId}: schedule slice missing`);
  return slice;
};

const acquisition = {
  schema_version: 1,
  receipt_id: "plan-040-qbnr-stop-removal-package-2-stop-lists-v1",
  package_1_manifest: {
    path: PACKAGE1_PATH,
    sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256,
  },
  candidate_count: 24,
  source_count: stopLists.length,
  total_pdf_bytes: stopLists.reduce((sum, source) => sum + source.pdf_bytes, 0),
  sources: stopLists.map(({
    layout_text: _layoutText,
    raw_text: _rawText,
    ...source
  }) => source),
  schedule_inputs: scheduleInputs,
  schedule_slice_count: slices.length,
  schedule_slices: slices,
  schedule_trip_type_policy: {
    passenger: "any trip_type other than 2, 3, or 4",
    nonrevenue_excluded: ["2", "3", "4"],
    mixed_passenger_and_nonrevenue: "reviewed_unresolved_ambiguous_trip_type",
    gtfs_shape_absent_from_exact_slice: "reviewed_unresolved_unmatched_shape",
  },
  correction_version_semantics: {
    published_launch_diff: "authoritative_for_this_draft",
    corrected_first_week_diff: "separate_non_authorizing_not_computed",
  },
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};
const acquisitionBytes = stableBytes(acquisition);
const acquisitionSha256 = sha256(acquisitionBytes);

const registry = loadOperationalSnapshotRegistry();
const loadedSnapshots = new Map<string, ReturnType<typeof loadGtfsStaticSnapshot>>();
for (const sourceId of [...new Set(candidates.flatMap((candidate) => [
  candidate.pre_source_id,
  candidate.post_source_id!,
]))].sort()) {
  const routeIds = new Set(candidates.flatMap((candidate) => [
    candidate.pre_source_id === sourceId ? candidate.pre_gtfs_route_id : "",
    candidate.post_source_id === sourceId ? candidate.post_gtfs_route_id : "",
  ]).filter(Boolean));
  loadedSnapshots.set(
    sourceId,
    loadGtfsStaticSnapshot(
      snapshotById(registry, snapshotIdForSource(sourceId)),
      ["calendar", "calendar_dates", "routes", "stops", "stop_times", "trips"],
      repoRoot,
      routeIds,
    ),
  );
}

const evidenceCandidates = candidates.map((candidate) => {
  const stopList = stopLists.find((entry) => entry.route_id === candidate.gtfs_route_id)!;
  const preSnapshot = loadedSnapshots.get(candidate.pre_source_id)!;
  const postSnapshot = loadedSnapshots.get(candidate.post_source_id!)!;
  return buildPlan040Package2CandidateEvidence({
    candidate,
    stopListSourceId: stopList.source_id,
    stopListPdfSha256: stopList.pdf_sha256,
    stopListLayoutTextSha256: stopList.layout_text_sha256,
    stopListRawTextSha256: stopList.raw_text_sha256,
    stopListText: stopList.layout_text,
    prePatterns: fullStopPatternsForDate(
      preSnapshot,
      candidate.pre_target_date,
      candidate.pre_gtfs_route_id,
    ),
    postPatterns: fullStopPatternsForDate(
      postSnapshot,
      candidate.post_target_date,
      candidate.post_gtfs_route_id,
    ),
    preScheduleSlice: sliceFor(candidate.pre_target_date, candidate.pre_gtfs_route_id),
    postScheduleSlice: sliceFor(candidate.post_target_date, candidate.post_gtfs_route_id),
  });
});
const evidence = {
  schema_version: 1,
  manifest_id: "plan-040-qbnr-stop-removal-package-2-evidence-v1",
  package_1_manifest: {
    path: PACKAGE1_PATH,
    sha256: PLAN040_QBNR_STOP_REMOVAL_PACKAGE_1_MANIFEST_SHA256,
  },
  acquisition_receipt: { path: ACQUISITION_PATH, sha256: acquisitionSha256 },
  candidate_count: 24,
  candidate_key_sha256: sha256(
    `${evidenceCandidates.map((candidate) => candidate.candidate_key).sort().join("\n")}\n`,
  ),
  candidates: evidenceCandidates,
  equivalence_policy: {
    automatic_equivalence: "identical_stop_id_only",
    changed_id_name_coordinate_or_proximity_equivalence: false,
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
const draft = buildPlan040Package2Draft({
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
    if (!existsSync(absolute(path)) || read(absolute(path)) !== bytes) {
      throw new Error(`${path}: frozen Package 2 artifact is stale`);
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
  evidence_manifest: { path: EVIDENCE_PATH, sha256: evidenceSha256 },
  decision_draft: { path: DRAFT_PATH, sha256: sha256(draftBytes) },
  replay_sha256: plan040Package2ReplayHash(draft as unknown as JsonValue),
  candidate_count: draft.candidate_count,
  candidate_key_sha256: draft.candidate_key_sha256,
  evidence_verdict_distribution: draft.evidence_verdict_distribution,
  proposed_extent_distribution: draft.proposed_extent_distribution,
  proposed_decision_count: draft.proposed_decision_count,
  persisted_decision_count: draft.persisted_decision_count,
  proposed_grain_distribution: draft.proposed_grain_distribution,
  proposed_grain_decision_count: draft.proposed_grain_decision_count,
  persisted_grain_decision_count: draft.persisted_grain_decision_count,
  authorization_state: draft.authorization_state,
}));
