import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { repoRoot } from "../packages/core/src/paths";
import { parseCsv } from "../packages/db/src/import-gtfs";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  PLAN040_PACKAGE_9_CANDIDATES,
  PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_9_EXPECTED_OUTCOMES,
  PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS,
  PLAN040_PACKAGE_9_INVENTORY_TRANSITIONS,
  PLAN040_PACKAGE_9_LINEAGE_SPECS,
  PLAN040_PACKAGE_9_Q61_OWNER_WARNING,
  PLAN040_PACKAGE_9_WAVES,
  PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9,
  buildPlan040Package9Draft,
  plan040Package9ReplayHash,
  type Plan040Package9CandidateEvidence,
  type Plan040Package9FeedFamily,
  type Plan040Package9RouteId,
  type Plan040Package9ServiceSpanSlice,
} from "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package9";
import type { Plan040Package8VersionSeparation } from "../packages/pipeline/src/quality/plan040-qbnr-service-pattern-package8";
import {
  MEMBER_GRAIN_DECISION_CONTRACT_ID,
  MEMBER_GRAIN_SCHEMA_VERSION,
  parseMemberGrainDecision,
  type MemberGrainDecision,
} from "../packages/pipeline/src/quality/member-grain-decisions";
import {
  extentDecisionKey,
  validateMemberExtentDecision,
  type ExactEvidenceBinding,
  type MemberExtentDecision,
} from "../packages/pipeline/src/quality/study-readiness-v1";

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
const P8_EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-8-evidence-v1.json";
const P8_DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-8-evidence-draft-v1.json";
const EXEMPLAR_PATH =
  "data/quality/operational-reference/member-extent-ledger-decisions/" +
  "plan-040-exemplar-v1.json";
const EXTENT_LEDGER_PATH =
  "data/quality/operational-reference/member-extent-ledger.jsonl";
const GRAIN_LEDGER_PATH =
  "data/quality/operational-reference/member-grain-ledger.jsonl";
const SERVICE_HTML_PATH =
  "raw/sources/mta_queens_bus_network_redesign_service_changes/source.html";
const TREATMENT_COMPONENTS_PATH =
  "data/canonical/treatment_components.jsonl";
const MAIN_SCHEDULE_SOURCE_ID =
  "mta_bus_schedules_2025_candidate_windows";
const MAIN_SCHEDULE_SOURCE_PATH =
  `raw/sources/${MAIN_SCHEDULE_SOURCE_ID}/source.csv`;
const X63_X68_SOURCE_ID =
  "mta_bus_schedules_2025_x63_x68_predecessors_2026_07_24";
const X63_X68_ROOT = `raw/sources/${X63_X68_SOURCE_ID}`;
const Q61_LINEAGE_PATH =
  "data/quality/operational-reference/historical-full-stop/q61_lineage.json";
const EVIDENCE_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-9-evidence-v1.json";
const DRAFT_PATH =
  "data/quality/operational-reference/member-extent-risk/" +
  "plan-040-qbnr-service-pattern-package-9-evidence-draft-v1.json";
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
  pre_source_id: string;
  post_source_id: string;
  pre_gtfs_route_id: string;
  post_gtfs_route_id: string;
  pre_target_date: string;
  post_target_date: string;
  pre_schedule_slice: Record<string, JsonValue>;
  post_schedule_slice: Record<string, JsonValue>;
  pre_patterns: Array<Record<string, JsonValue>>;
  post_patterns: Array<Record<string, JsonValue>>;
  comparisons: Array<Record<string, JsonValue>>;
};

type PriorEvidence = {
  candidates: PriorCandidate[];
};

type Package8Evidence = {
  immutable_reuse: {
    accepted_launch_feed_identities: Array<Record<string, JsonValue>>;
  };
  version_separation: Plan040Package8VersionSeparation;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const absolute = (path: string): string => resolve(repoRoot, path);
const read = (path: string): string =>
  readFileSync(absolute(path), "utf8");
const stableBytes = (value: unknown): string =>
  `${stableJson(value as JsonValue)}\n`;
const sameJson = (left: unknown, right: unknown): boolean =>
  stableJson(left as JsonValue) === stableJson(right as JsonValue);
const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values.filter(Boolean))].sort();
const parseJsonl = <T>(path: string): T[] => {
  const text = read(path).trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as T) : [];
};

function pin(path: string, expected: string, label: string): void {
  const actual = sha256(readFileSync(absolute(path)));
  if (actual !== expected) {
    throw new Error(`${label}: immutable input drifted (${actual})`);
  }
}

for (const [path, expected, label] of [
  [
    P2_ACQUISITION_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_2.acquisition,
    "Package 2 acquisition",
  ],
  [
    P2_EVIDENCE_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_2.evidence,
    "Package 2 evidence",
  ],
  [
    P2_DRAFT_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_2.draft,
    "Package 2 draft",
  ],
  [
    P4_ACQUISITION_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_4.acquisition,
    "Package 4 acquisition",
  ],
  [
    P4_EVIDENCE_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_4.evidence,
    "Package 4 evidence",
  ],
  [
    P4_DRAFT_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_4.draft,
    "Package 4 draft",
  ],
  [
    P8_EVIDENCE_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_8.evidence,
    "Package 8 evidence",
  ],
  [
    P8_DRAFT_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_8.draft,
    "Package 8 draft",
  ],
  [
    SERVICE_HTML_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.service_change_html,
    "service-change HTML",
  ],
  [
    TREATMENT_COMPONENTS_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.treatment_components,
    "canonical treatment components",
  ],
  [
    `${X63_X68_ROOT}/receipt.json`,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.x63_x68_schedule.receipt,
    "X63/X68 schedule receipt",
  ],
  [
    `${X63_X68_ROOT}/source.csv`,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.x63_x68_schedule.source,
    "X63/X68 schedule source",
  ],
  [
    `${X63_X68_ROOT}/blocks.jsonl`,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.x63_x68_schedule.blocks,
    "X63/X68 schedule blocks",
  ],
  [
    Q61_LINEAGE_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.q61_lineage,
    "Q61 reviewed lineage dossier",
  ],
  [
    EXTENT_LEDGER_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.extent_ledger,
    "post-P8 extent ledger",
  ],
  [
    GRAIN_LEDGER_PATH,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.grain_ledger,
    "post-P8 grain ledger",
  ],
] as const) {
  pin(path, expected, label);
}

const p2Evidence = JSON.parse(read(P2_EVIDENCE_PATH)) as PriorEvidence;
const p4Evidence = JSON.parse(read(P4_EVIDENCE_PATH)) as PriorEvidence;
const p8Evidence = JSON.parse(read(P8_EVIDENCE_PATH)) as Package8Evidence;
const feedFamilyBySource = new Map<string, Plan040Package9FeedFamily>();
for (
  const identity of
    p8Evidence.immutable_reuse.accepted_launch_feed_identities
) {
  const sourceId = identity.source_id;
  const family = identity.family;
  if (
    typeof sourceId !== "string" ||
    (family !== "queens" && family !== "busco")
  ) {
    throw new Error("Package 9 accepted launch-feed identity is malformed");
  }
  feedFamilyBySource.set(sourceId, family);
}
const extentLedger = parseJsonl<LedgerRow>(EXTENT_LEDGER_PATH);
const grainLedger = parseJsonl<LedgerRow>(GRAIN_LEDGER_PATH);
const treatments = new Map(
  parseJsonl<TreatmentRecord>(TREATMENT_COMPONENTS_PATH)
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
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_2.evidence,
  ],
  [
    "package_4",
    P4_EVIDENCE_PATH,
    p4Evidence,
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_4.evidence,
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
if (!settingsMatch) {
  throw new Error("Plan 040 Package 9 route-table settings missing");
}
const settings = JSON.parse(settingsMatch[1]!) as {
  mtaDatatable: Record<string, {
    csvData: {
      data: Array<Record<string, { value: string }>>;
    };
  }>;
};
const serviceRows = settings.mtaDatatable["21"]?.csvData.data;
if (!serviceRows) {
  throw new Error("Plan 040 Package 9 route table 21 missing");
}
const selectedRoutes = uniqueSorted(PLAN040_PACKAGE_9_CANDIDATES.map(
  ([, routeId]) => routeId,
));
const sourceRowByRoute = new Map(selectedRoutes.map((routeId) => {
  const row = serviceRows.find((candidate) =>
    candidate.Route?.value === routeId);
  if (!row) {
    throw new Error(`${routeId}: service-change row missing`);
  }
  const cells = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"]
    .map((key) => row[key]?.value ?? "");
  return [routeId, {
    source_html_sha256:
      PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.service_change_html,
    route_row: routeId as Plan040Package9RouteId,
    row_sha256: sha256(stableBytes({ route: routeId, cells })),
    implementation_statement: stripHtml(cells[0] ?? ""),
    candidate_change_context: cells.slice(1)
      .map(stripHtml).filter(Boolean),
  }];
}));

function projectPattern(
  pattern: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const projected = { ...pattern };
  delete projected.trip_ids;
  return projected;
}

function unmatchedPatternCount(
  patterns: Array<Record<string, JsonValue>>,
): number {
  return patterns.filter((pattern) => {
    const validation = pattern.schedule_validation;
    return validation && typeof validation === "object" &&
      !Array.isArray(validation) &&
      validation.status === "reviewed_unresolved_unmatched_shape";
  }).length;
}

async function exactServiceSpan(input: {
  sourceId: string;
  sourcePath: string;
  expectedSha256: string;
  routeId: string;
  scheduleDate: string;
}): Promise<Plan040Package9ServiceSpanSlice> {
  const stream = createReadStream(absolute(input.sourcePath));
  const hash = createHash("sha256");
  stream.on("data", (chunk) => hash.update(chunk));
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | undefined;
  const departures = new Map<string, Map<string, string>>();
  const unquote = (value: string | undefined): string =>
    value?.replace(/^"|"$/gu, "") ?? "";
  for await (const line of lines) {
    if (!header) {
      header = parseCsv(`${line}\n`)[0];
      continue;
    }
    if (!line) continue;
    const first = line.split(",", 24);
    if (
      unquote(first[0]) !== `${input.scheduleDate}T00:00:00.000` ||
      unquote(first[8]) !== input.routeId ||
      unquote(first[13]) !== "1" ||
      ["2", "3", "4"].includes(unquote(first[7]))
    ) {
      continue;
    }
    const cells = parseCsv(`${line}\n`)[0]!;
    const row = Object.fromEntries(
      header.map((name, index) => [name, cells[index] ?? ""]),
    );
    const direction = row.direction!;
    const tripId = row.block_id!;
    const departure = row.schedule_time!;
    if (!direction || !tripId || !departure) {
      throw new Error(
        `${input.routeId}: exact passenger departure row is incomplete`,
      );
    }
    const byTrip = departures.get(direction) ?? new Map<string, string>();
    const prior = byTrip.get(tripId);
    if (prior && prior !== departure) {
      throw new Error(
        `${input.routeId}: duplicate origin departure for trip ${tripId}`,
      );
    }
    byTrip.set(tripId, departure);
    departures.set(direction, byTrip);
  }
  const sourceSha256 = hash.digest("hex");
  if (sourceSha256 !== input.expectedSha256) {
    throw new Error(
      `${input.sourceId}: schedule source drifted (${sourceSha256})`,
    );
  }
  const byDirection = [...departures.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([direction, byTrip]) => {
      const times = [...byTrip.values()].sort();
      if (times.length === 0) {
        throw new Error(`${input.routeId} ${direction}: no departures`);
      }
      return {
        direction,
        first_departure: times[0]!,
        last_departure: times.at(-1)!,
        trip_count: times.length,
        departure_time_sha256: sha256(`${times.join("\n")}\n`),
      };
    });
  if (byDirection.length !== 2) {
    throw new Error(`${input.routeId}: expected two passenger directions`);
  }
  return {
    source_id: input.sourceId,
    source_csv_sha256: sourceSha256,
    route_id: input.routeId,
    schedule_date: input.scheduleDate,
    passenger_policy: "any_trip_type_except_2_3_4",
    by_direction: byDirection,
  };
}

const qm63PreSpan = await exactServiceSpan({
  sourceId: X63_X68_SOURCE_ID,
  sourcePath: `${X63_X68_ROOT}/source.csv`,
  expectedSha256:
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.x63_x68_schedule.source,
  routeId: "X63",
  scheduleDate: "2025-06-27",
});
const qm63PostSpan = await exactServiceSpan({
  sourceId: MAIN_SCHEDULE_SOURCE_ID,
  sourcePath: MAIN_SCHEDULE_SOURCE_PATH,
  expectedSha256:
    PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.main_schedule_source,
  routeId: "QM63",
  scheduleDate: "2025-06-30",
});

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
    extent.authorizes_study ||
    extent.authorizes_cross_product ||
    grain.authorizes_study ||
    grain.authorizes_cross_product
  ) {
    throw new Error(`${treatmentId}: Package 9 ledger input is not pristine`);
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

const GAP_CODES: Record<
  (typeof PLAN040_PACKAGE_9_CANDIDATES)[number][2],
  string[]
> = {
  "treatment_q15-154-street-replacement-2025": [
    "q61_lineage_owner_warning_former_q15_q34_new_route_attribution_not_ready_made",
    "candidate_route_to_successor_member_binding_unresolved",
  ],
  "treatment_q15-q15a-routing-2025": [
    "q15a_predecessor_routing_not_reviewed_as_q15_member_identity",
    "candidate_changed_region_not_bound_to_one_ordered_chain",
  ],
  "treatment_q112-east-new-york-extension-2025": [
    "q7_current_routing_does_not_authorize_q112_same_member_identity",
    "cross_route_extension_correspondence_not_candidate_bound",
  ],
  "treatment_q1-springfield-service-replacement-2025": [
    "q36_replacement_does_not_authorize_q1_same_member_lineage",
    "replacement_segment_identity_not_candidate_bound",
  ],
  "treatment_q12-sanford-service-replacement-2025": [
    "multiple_successors_q13_q65_are_nonexclusive",
    "replacement_segment_identity_not_candidate_bound",
  ],
  "treatment_q30-q75-terminal-replacement-2025": [
    "q75_terminal_service_does_not_authorize_q30_same_member_lineage",
    "terminal_trip_subset_not_candidate_bound",
  ],
  "treatment_q65-college-point-segment-replacement-2025": [
    "q26_successor_presence_does_not_authorize_q65_same_member_lineage",
    "replacement_segment_identity_not_candidate_bound",
  ],
  "treatment_q65-flushing-reroute-2025": [
    "candidate_region_nonexclusive_with_q65_shortening_and_replacements",
    "post_schedule_unmatched_shape_rows_review_required",
  ],
  "treatment_q65-flushing-shortening-2025": [
    "candidate_region_nonexclusive_with_q65_reroute_and_replacements",
    "post_schedule_unmatched_shape_rows_review_required",
  ],
  "treatment_q65-limited-discontinuation-2025": [
    "limited_variant_not_bound_to_one_schedule_validated_pattern",
    "post_schedule_unmatched_shape_rows_review_required",
  ],
  "treatment_q65-q12-service-replacement-2025": [
    "q12_predecessor_presence_does_not_authorize_q65_same_member_lineage",
    "post_schedule_unmatched_shape_rows_review_required",
  ],
  "treatment_qm63-avenue-service-discontinuation-2025": [
    "reviewed_x63_qm63_lineage_does_not_bind_avenue_segment_extent",
    "avenue_segment_identity_not_candidate_bound",
  ],
  "treatment_qm63-frequency-span-adjustment-2025": [],
  "treatment_qm63-queens-reroute-2025": [
    "reviewed_x63_qm63_lineage_does_not_bind_249_st_changed_region",
    "candidate_changed_region_not_bound_to_one_ordered_chain",
  ],
  "treatment_qm63-route-rename-2025": [],
  "treatment_q26-college-point-extension-2025": [
    "candidate_region_nonexclusive_with_q26_replacement_and_reroute",
    "post_schedule_unmatched_shape_rows_review_required",
  ],
  "treatment_q26-flushing-reroute-2025": [
    "candidate_region_nonexclusive_with_q26_extension_and_replacement",
    "post_schedule_unmatched_shape_rows_review_required",
  ],
  "treatment_q26-frequency-span-adjustment-2025": [
    "combined_frequency_and_span_candidate_not_partially_terminalized",
    "overnight_trip_subset_not_candidate_bound",
    "post_schedule_unmatched_shape_rows_review_required",
  ],
  "treatment_q26-q65-service-replacement-2025": [
    "q65_predecessor_presence_does_not_authorize_q26_same_member_lineage",
    "post_schedule_unmatched_shape_rows_review_required",
  ],
  "treatment_q38-northern-segment-replacement-2025": [
    "q14_successor_presence_does_not_authorize_q38_same_member_lineage",
    "northern_half_identity_not_candidate_bound",
  ],
  "treatment_q38-route-split-2025": [
    "q38_q14_split_components_not_candidate_bound",
    "route_split_does_not_authorize_cross_route_identity",
  ],
  "treatment_qm68-avenue-service-discontinuation-2025": [
    "reviewed_x68_qm68_lineage_does_not_bind_avenue_segment_extent",
    "avenue_segment_identity_not_candidate_bound",
  ],
};

function evidenceBindings(
  candidate: PriorCandidate,
  treatment: TreatmentRecord,
  renameTreatment: TreatmentRecord | null,
): ExactEvidenceBinding[] {
  const candidateRef = treatment.evidence_refs.find((ref) =>
    ref.source_id === treatment.source_id);
  if (!candidateRef) {
    throw new Error(`${treatment.record_id}: candidate evidence missing`);
  }
  const bindings: ExactEvidenceBinding[] = [
    {
      role: "candidate_service_change_statement",
      record_id: treatment.record_id,
      source_id: candidateRef.source_id,
      evidence_id: candidateRef.evidence_id,
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
      role: "pre_schedule_trip_type_and_span_validation",
      record_id: treatment.record_id,
      source_id: X63_X68_SOURCE_ID,
      evidence_id: `${X63_X68_SOURCE_ID}#p001_b0001`,
    },
    {
      role: "post_schedule_trip_type_and_span_validation",
      record_id: treatment.record_id,
      source_id: MAIN_SCHEDULE_SOURCE_ID,
      evidence_id: `${MAIN_SCHEDULE_SOURCE_ID}#p001_b0001`,
    },
    ...candidate.comparisons.map((comparison) => ({
      role: "ordered_full_stop_lineage",
      record_id: treatment.record_id,
      source_id: candidate.post_source_id,
      evidence_id:
        `${candidate.post_source_id}#${String(comparison.comparison_id)}`,
    })),
  ];
  if (renameTreatment && renameTreatment.record_id !== treatment.record_id) {
    const renameRef = renameTreatment.evidence_refs.find((ref) =>
      ref.source_id === renameTreatment.source_id);
    if (!renameRef) {
      throw new Error(
        `${renameTreatment.record_id}: explicit rename evidence missing`,
      );
    }
    bindings.push({
      role: "explicit_predecessor_successor_route_rename",
      record_id: renameTreatment.record_id,
      source_id: renameRef.source_id,
      evidence_id: renameRef.evidence_id,
    });
  }
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

function lineageSegments(
  candidate: PriorCandidate,
): MemberGrainDecision["lineage_segments"] {
  return candidate.comparisons.map((comparison, index) => {
    const beforeRouteId = comparison.before_route_id;
    const afterRouteId = comparison.after_route_id;
    const direction = comparison.direction_id;
    const boundary = comparison.boundary_stop_ids;
    const shared = comparison.shared_stop_ids;
    if (
      comparison.accepted !== true ||
      beforeRouteId !== "X63" ||
      afterRouteId !== "QM63" ||
      typeof direction !== "string" ||
      !Array.isArray(boundary) ||
      boundary.length !== 2 ||
      boundary.some((stopId) =>
        typeof stopId !== "string" || !stopId.trim()) ||
      !Array.isArray(shared) ||
      shared.some((stopId) =>
        typeof stopId !== "string" || !stopId.trim())
    ) {
      throw new Error(
        `QM63 comparison ${index}: reviewed predecessor lineage is incomplete`,
      );
    }
    return {
      predecessor_gtfs_route_id: beforeRouteId,
      successor_gtfs_route_id: afterRouteId,
      direction,
      boundary_stop_ids: [...boundary].sort() as [string, string],
      shared_stop_ids: uniqueSorted(shared as string[]),
    };
  }).sort((left, right) =>
    stableJson(left as unknown as JsonValue).localeCompare(
      stableJson(right as unknown as JsonValue),
    ));
}

function positiveAssessment(input: {
  candidate: PriorCandidate;
  treatment: TreatmentRecord;
}): {
  extent: MemberExtentDecision;
  grain: MemberGrainDecision;
  modality: Plan040Package9CandidateEvidence[
    "service_modality_assessment"
  ];
} {
  const { candidate, treatment } = input;
  const renameTreatment = treatments.get(
    "treatment_qm63-route-rename-2025",
  );
  if (!renameTreatment) {
    throw new Error("QM63 explicit route-rename treatment is missing");
  }
  const isRename =
    treatment.record_id === "treatment_qm63-route-rename-2025";
  const isFrequencySpan =
    treatment.record_id ===
      "treatment_qm63-frequency-span-adjustment-2025";
  if (!isRename && !isFrequencySpan) {
    throw new Error(`${treatment.record_id}: no positive assessment rule`);
  }
  const bindings = evidenceBindings(
    candidate,
    treatment,
    renameTreatment,
  );
  const suffix = treatment.record_id
    .replace(/^treatment_/u, "")
    .replace(/-2025$/u, "");
  const extentDecisionId =
    `member-extent-review:plan040-package9-${suffix}`;
  const extent: MemberExtentDecision = {
    decision_id: extentDecisionId,
    occurrence_id: candidate.occurrence_id,
    route_record_id: candidate.route_record_id,
    treatment_record_id: treatment.record_id,
    resolution: "route_wide",
    components: [{
      component_kind: "route",
      identity_namespace: "canonical_record",
      identifiers: [candidate.route_record_id],
      description: isRename
        ? "QM63 route member explicitly named as the renamed successor to X63."
        : "QM63 route member named by the candidate-specific peak-frequency and service-span statement.",
    }],
    evidence_bindings: bindings,
    missing_roles: [],
    rationale: isRename
      ? "The first-party statement explicitly renames X63 as QM63, and the receipt-pinned passenger schedules plus identical-stop comparisons preserve the reviewed predecessor/successor lineage. This candidate-specific review does not create automatic route-ID equivalence."
      : "The candidate-specific first-party statement applies peak-frequency and service-span changes to the named QM63 route. The explicit X63-to-QM63 rename, exact passenger trip counts, exact first/last departures, and structured launch-boundary periods bind the route-wide scope without requiring spatial stop-ID equivalence.",
    reviewed_at: "1970-01-01T00:00:00Z",
    reviewed_by: "pending-plan-040-package-9-dual-risk-review",
  };
  validateMemberExtentDecision(extent);
  const patternIds = uniqueSorted([
    ...candidate.pre_patterns,
    ...candidate.post_patterns,
  ].map((pattern) => String(pattern.pattern_id)));
  const grain = parseMemberGrainDecision({
    schema_version: MEMBER_GRAIN_SCHEMA_VERSION,
    contract_id: MEMBER_GRAIN_DECISION_CONTRACT_ID,
    decision_id: `member-grain-review:plan040-package9-${suffix}`,
    occurrence_id: candidate.occurrence_id,
    route_record_id: candidate.route_record_id,
    gtfs_route_id: "QM63",
    treatment_record_id: treatment.record_id,
    member_extent_decision_id: extentDecisionId,
    service_scope: isRename
      ? { kind: "all_service" }
      : {
        kind: "periods",
        periods: ["am_peak", "evening", "off_period", "pm_peak"],
        directions: ["0", "1"],
        pattern_ids: patternIds,
      },
    lineage_segments: lineageSegments(candidate),
    evidence_bindings: bindings,
    rationale: isRename
      ? "The explicit rename applies to the route as a whole; the two reviewed direction-specific lineage segments remain structured evidence rather than automatic ID equivalence."
      : "The structured periods cover the exact peak-frequency and first/last-departure changes observed across both passenger directions. Reviewed X63-to-QM63 lineage is carried explicitly and no cross-product beyond these patterns is inferred.",
    reviewed_at: "1970-01-01T00:00:00Z",
    reviewed_by: "pending-plan-040-package-9-dual-risk-review",
  });
  return {
    extent,
    grain,
    modality: isRename
      ? {
        assessment_status: "complete_route_wide_all_service",
        positive_basis_codes: [
          "explicit_first_party_x63_to_qm63_route_rename",
          "reviewed_two_direction_identical_stop_lineage",
          "receipt_pinned_passenger_schedule_presence_both_boundaries",
        ],
        blocking_gap_codes: [],
        structured_periods: [],
        structured_directions: [],
        structured_pattern_ids: [],
        exact_pre_span: null,
        exact_post_span: null,
      }
      : {
        assessment_status: "complete_route_wide_structured_periods",
        positive_basis_codes: [
          "explicit_first_party_peak_frequency_and_span_statement",
          "explicit_first_party_x63_to_qm63_route_rename",
          "peak_passenger_trip_counts_decrease_both_directions",
          "exact_first_or_last_passenger_departure_changes_both_directions",
          "reviewed_two_direction_identical_stop_lineage",
        ],
        blocking_gap_codes: [],
        structured_periods: [
          "am_peak",
          "evening",
          "off_period",
          "pm_peak",
        ],
        structured_directions: ["0", "1"],
        structured_pattern_ids: patternIds,
        exact_pre_span: qm63PreSpan,
        exact_post_span: qm63PostSpan,
      },
  };
}

const candidates: Plan040Package9CandidateEvidence[] =
  PLAN040_PACKAGE_9_CANDIDATES.map(
    ([waveId, routeId, treatmentId]) => {
      const prior = priorCandidateByRoute.get(routeId);
      const treatment = treatments.get(treatmentId);
      const extent = extentLedger.find((row) =>
        row.gtfs_route_id === routeId &&
        row.treatment_record_id === treatmentId);
      const sourceRow = sourceRowByRoute.get(routeId);
      if (!prior || !treatment || !extent || !sourceRow) {
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
        throw new Error(`${treatmentId}: source statement drifted`);
      }
      const candidate = prior.candidate;
      if (
        candidate.occurrence_id !== extent.occurrence_id ||
        candidate.route_record_id !== extent.route_record_id
      ) {
        throw new Error(`${treatmentId}: prior candidate identity drifted`);
      }
      const prePatterns = candidate.pre_patterns.map(projectPattern);
      const postPatterns = candidate.post_patterns.map(projectPattern);
      const expectedTransition =
        PLAN040_PACKAGE_9_INVENTORY_TRANSITIONS[routeId];
      const preFeedFamily = feedFamilyBySource.get(candidate.pre_source_id);
      const postFeedFamily = feedFamilyBySource.get(candidate.post_source_id);
      if (
        !preFeedFamily ||
        !postFeedFamily ||
        !sameJson(
          {
            pre_feed_family: preFeedFamily,
            post_feed_family: postFeedFamily,
            pre_route_id: candidate.pre_gtfs_route_id,
            post_route_id: candidate.post_gtfs_route_id,
            classification: expectedTransition.classification,
          },
          expectedTransition,
        )
      ) {
        throw new Error(`${treatmentId}: inventory transition drifted`);
      }
      const predecessorRouteChanged =
        expectedTransition.classification ===
          "same_family_predecessor_route_rename";
      if (
        predecessorRouteChanged &&
        ![candidate.pre_schedule_slice.source_id].includes(X63_X68_SOURCE_ID)
      ) {
        throw new Error(`${treatmentId}: X63/X68 schedule binding missing`);
      }
      const lineage = PLAN040_PACKAGE_9_LINEAGE_SPECS[treatmentId];
      const explicitRenameTreatment = predecessorRouteChanged
        ? treatments.get(
          routeId === "QM63"
            ? "treatment_qm63-route-rename-2025"
            : "treatment_qm68-route-rename-2025",
        )
        : null;
      const explicitRenameRef = explicitRenameTreatment?.evidence_refs.find(
        (ref) => ref.source_id === explicitRenameTreatment.source_id,
      );
      if (
        predecessorRouteChanged &&
        (!explicitRenameTreatment || !explicitRenameRef)
      ) {
        throw new Error(`${treatmentId}: explicit rename evidence missing`);
      }
      const outcome = PLAN040_PACKAGE_9_EXPECTED_OUTCOMES[treatmentId];
      const positive = outcome === "positive"
        ? positiveAssessment({ candidate, treatment })
        : null;
      const gaps = uniqueSorted(GAP_CODES[treatmentId]);
      const exactSearches = [
        `candidate_key=${extentDecisionKey(extent as never)}`,
        `source_statement=${evidenceRef.evidence_id}`,
        `route_row=${routeId} row_sha256=${sourceRow.row_sha256}`,
        `pre_patterns=${prePatterns.map((pattern) =>
          String(pattern.pattern_id)).sort().join(",")}`,
        `post_patterns=${postPatterns.map((pattern) =>
          String(pattern.pattern_id)).sort().join(",")}`,
        `lineage=${lineage.named_from_routes.join("+")}->${
          lineage.named_to_routes.join("+")
        }`,
        `inventory_transition=${preFeedFamily}:${candidate.pre_gtfs_route_id}->${postFeedFamily}:${candidate.post_gtfs_route_id} classification=${expectedTransition.classification}`,
        "automatic_equivalence=identical_stop_id_only",
        "published_launch_diff=initial_accepted_bytes corrected_first_week_diff=blocked_not_run",
      ];
      return {
        candidate_key: extentDecisionKey(extent as never),
        occurrence_id: extent.occurrence_id,
        route_record_id: extent.route_record_id,
        treatment_record_id: treatmentId,
        treatment_family: "service_pattern",
        gtfs_route_id: routeId,
        risk_wave_id: waveId,
        source_statement: {
          source_id: "mta_queens_bus_network_redesign_service_changes",
          evidence_id: evidenceRef.evidence_id,
          block_id: evidenceRef.block_id,
          block_sha256: evidenceRef.text_sha256,
          treatment_kind: treatment.payload.treatment_kind,
          raw_text: treatment.raw_text,
        },
        source_row: sourceRow,
        immutable_candidate_context: {
          origin: prior.origin,
          evidence_path: prior.path,
          evidence_sha256: prior.sha256,
          stop_removal_candidate_key: candidate.candidate_key,
          prior_candidate_sha256: sha256(stableBytes(candidate)),
          pre_source_id: candidate.pre_source_id,
          post_source_id: candidate.post_source_id,
          pre_gtfs_route_id: candidate.pre_gtfs_route_id,
          post_gtfs_route_id: candidate.post_gtfs_route_id,
          pre_target_date: candidate.pre_target_date,
          post_target_date: candidate.post_target_date,
        },
        inventory_transition: {
          ...expectedTransition,
          evidence_basis: "accepted_launch_feed_inventory",
          same_feed_family_is_identity: false,
          same_route_id_is_identity: false,
          cross_feed_family_equivalence_authorized: false,
          automatic_predecessor_route_id_equivalence_authorized: false,
          explicit_route_rename_statement:
            explicitRenameTreatment && explicitRenameRef
              ? {
                treatment_record_id:
                  explicitRenameTreatment.record_id as
                    | "treatment_qm63-route-rename-2025"
                    | "treatment_qm68-route-rename-2025",
                evidence_id: explicitRenameRef.evidence_id,
                raw_text: explicitRenameTreatment.raw_text,
              }
              : null,
          reviewed_predecessor_successor_lineage_authorized:
            predecessorRouteChanged,
        },
        schedule_trip_type_validation: {
          passenger_policy: "any_trip_type_except_2_3_4",
          excluded_nonrevenue_trip_types: ["2", "3", "4"],
          pre: candidate.pre_schedule_slice,
          post: candidate.post_schedule_slice,
          pre_unmatched_pattern_count: unmatchedPatternCount(prePatterns),
          post_unmatched_pattern_count: unmatchedPatternCount(postPatterns),
          unmatched_patterns_retained_for_review: true,
          x63_x68_supplemental_source_used: predecessorRouteChanged,
        },
        ordered_full_stop_evidence: {
          calendar_and_calendar_dates_expanded: true,
          automatic_equivalence: "identical_stop_id_only",
          name_coordinate_or_proximity_equivalence: false,
          pre_patterns: prePatterns,
          post_patterns: postPatterns,
          comparisons: candidate.comparisons,
          complete_ordered_stop_chains: true,
          candidate_route_context_is_nonexclusive: true,
        },
        lineage_review: {
          ...lineage,
          candidate_statement_bound_separately: true,
          same_member_lineage_authorized: predecessorRouteChanged,
          automatic_route_id_equivalence_authorized: false,
          review_status: predecessorRouteChanged
            ? "reviewed_candidate_specific_lineage_authorized"
            : "reviewed_unresolved",
          q61_owner_warning:
            treatmentId === "treatment_q15-154-street-replacement-2025"
              ? PLAN040_PACKAGE_9_Q61_OWNER_WARNING
              : null,
        },
        service_modality_assessment: positive?.modality ?? {
          assessment_status: "blocked",
          positive_basis_codes: [],
          blocking_gap_codes: gaps,
          structured_periods: [],
          structured_directions: [],
          structured_pattern_ids: [],
          exact_pre_span: null,
          exact_post_span: null,
        },
        exact_candidate_searches: exactSearches,
        ledger_snapshot: ledgerSnapshot(
          extent.occurrence_id,
          extent.route_record_id,
          treatmentId,
        ),
        unresolved_gap_codes: gaps,
        evidence_verdict: positive
          ? "evidence_complete_positive_draft"
          : "receipt_terminal_unresolved",
        proposed_extent_decision: positive?.extent ?? null,
        proposed_grain_decision: positive?.grain ?? null,
        persisted_extent_decision: null,
        persisted_grain_decision: null,
        authorizes_occurrence: false,
        authorizes_study: false,
        authorizes_cross_product: false,
        authorizes_decision_persistence: false,
      };
    },
  );

function priorKeys(path: string): string[] {
  const parsed = JSON.parse(read(path)) as {
    candidates?: Array<{ candidate_key: string }>;
    decisions?: Array<{
      occurrence_id: string;
      route_record_id: string;
      treatment_record_id: string;
    }>;
  };
  return parsed.candidates?.map((candidate) => candidate.candidate_key) ??
    parsed.decisions?.map((decision) => extentDecisionKey(decision)) ??
    [];
}

const priorCandidateKeys = {
  exemplar: priorKeys(EXEMPLAR_PATH),
  package_2: priorKeys(P2_DRAFT_PATH),
  package_4: priorKeys(P4_DRAFT_PATH),
  package_5: priorKeys(P5_DRAFT_PATH),
  package_6: priorKeys(P6_DRAFT_PATH),
  package_7: priorKeys(P7_DRAFT_PATH),
  package_8: priorKeys(P8_DRAFT_PATH),
};
const candidateKeys = new Set(candidates.map((candidate) =>
  candidate.candidate_key));
const exclusionChecks = Object.fromEntries(
  Object.entries(priorCandidateKeys).map(([name, keys]) => [
    name,
    {
      prior_candidate_count: keys.length,
      overlap_count: keys.filter((key) => candidateKeys.has(key)).length,
    },
  ]),
);

const evidenceManifest = {
  schema_version: 1,
  manifest_id: PLAN040_QBNR_SERVICE_PATTERN_PACKAGE_9,
  candidate_count: 22,
  route_count: 10,
  candidate_key_sha256: PLAN040_PACKAGE_9_CANDIDATE_KEY_SHA256,
  wave_partition: PLAN040_PACKAGE_9_WAVES,
  current_outcome_distribution: {
    evidence_complete_positive_draft: 2,
    receipt_terminal_unresolved: 20,
  },
  immutable_inputs: {
    package_2: {
      acquisition: {
        path: P2_ACQUISITION_PATH,
        sha256:
          PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_2.acquisition,
      },
      evidence: {
        path: P2_EVIDENCE_PATH,
        sha256: PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_2.evidence,
      },
      draft: {
        path: P2_DRAFT_PATH,
        sha256: PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_2.draft,
      },
    },
    package_4: {
      acquisition: {
        path: P4_ACQUISITION_PATH,
        sha256:
          PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_4.acquisition,
      },
      evidence: {
        path: P4_EVIDENCE_PATH,
        sha256: PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_4.evidence,
      },
      draft: {
        path: P4_DRAFT_PATH,
        sha256: PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_4.draft,
      },
    },
    package_8: {
      evidence: {
        path: P8_EVIDENCE_PATH,
        sha256: PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_8.evidence,
      },
      draft: {
        path: P8_DRAFT_PATH,
        sha256: PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.package_8.draft,
      },
    },
    service_change_source: {
      path: SERVICE_HTML_PATH,
      sha256: PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.service_change_html,
    },
    treatment_components: {
      path: TREATMENT_COMPONENTS_PATH,
      sha256:
        PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.treatment_components,
    },
    x63_x68_schedule: {
      source_id: X63_X68_SOURCE_ID,
      receipt: {
        path: `${X63_X68_ROOT}/receipt.json`,
        sha256:
          PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.x63_x68_schedule.receipt,
      },
      source: {
        path: `${X63_X68_ROOT}/source.csv`,
        sha256:
          PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.x63_x68_schedule.source,
      },
      blocks: {
        path: `${X63_X68_ROOT}/blocks.jsonl`,
        sha256:
          PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.x63_x68_schedule.blocks,
      },
    },
    main_schedule_source: {
      source_id: MAIN_SCHEDULE_SOURCE_ID,
      path: MAIN_SCHEDULE_SOURCE_PATH,
      sha256:
        PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.main_schedule_source,
    },
    q61_reviewed_lineage: {
      path: Q61_LINEAGE_PATH,
      sha256: PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.q61_lineage,
      owner_warning: PLAN040_PACKAGE_9_Q61_OWNER_WARNING,
    },
    post_package_8_ledgers: {
      extent: {
        path: EXTENT_LEDGER_PATH,
        sha256: PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.extent_ledger,
      },
      grain: {
        path: GRAIN_LEDGER_PATH,
        sha256: PLAN040_PACKAGE_9_IMMUTABLE_INPUT_PINS.grain_ledger,
      },
    },
    accepted_launch_feeds:
      p8Evidence.immutable_reuse.accepted_launch_feed_identities,
    external_acquisition_performed: false,
  },
  evidence_policy: {
    calendar_and_calendar_dates_expanded: true,
    schedule_passenger_policy: "any_trip_type_except_2_3_4",
    excluded_nonrevenue_trip_types: ["2", "3", "4"],
    unmatched_schedule_rows: "retained_for_review",
    ordered_stop_chains: "complete_candidate_route_chains",
    automatic_equivalence: "identical_stop_id_only",
    name_coordinate_or_proximity_equivalence: false,
    same_place_changed_id_equivalence: false,
    cross_route_presence_is_identity: false,
    route_rename_is_automatic_id_equivalence: false,
    explicit_route_rename_may_authorize_candidate_specific_lineage: true,
    feed_family_or_same_route_id_is_identity: false,
    source_statement_binding: "one_candidate_statement_at_a_time",
    occurrence_inference: false,
  },
  version_separation: p8Evidence.version_separation,
  exclusion_checks: exclusionChecks,
  candidates,
  review_protocol: {
    review_waves: ["P9-A", "P9-B"],
    dual_independent_review_required: true,
    owner_gate_created: false,
    owner_acceptance_created: false,
    persistence_performed: false,
  },
  authorization_state:
    "evidence_and_decision_draft_pending_dual_independent_lineage_review_no_gate_no_acceptance_no_persistence",
  external_acquisition_performed: false,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
};

const evidenceBytes = stableBytes(evidenceManifest);
const evidenceSha256 = sha256(evidenceBytes);
const draft = buildPlan040Package9Draft({
  evidenceManifestPath: EVIDENCE_PATH,
  evidenceManifestSha256: evidenceSha256,
  candidates,
  versionSeparation: p8Evidence.version_separation,
  priorCandidateKeys,
});
const draftBytes = stableBytes(draft);

for (const [path, bytes] of [
  [EVIDENCE_PATH, evidenceBytes],
  [DRAFT_PATH, draftBytes],
] as const) {
  const target = absolute(path);
  if (check) {
    if (!existsSync(target) || readFileSync(target, "utf8") !== bytes) {
      throw new Error(`${path}: generated content is stale`);
    }
  } else {
    writeFileSync(target, bytes);
  }
}

console.log(JSON.stringify({
  status: check ? "checked" : "generated",
  evidence: {
    path: EVIDENCE_PATH,
    sha256: evidenceSha256,
  },
  draft: {
    path: DRAFT_PATH,
    sha256: plan040Package9ReplayHash(draft as unknown as JsonValue),
  },
  candidate_count: 22,
  route_count: 10,
  wave_distribution: {
    "P9-A": 11,
    "P9-B": 11,
  },
  verdict_distribution: {
    evidence_complete_positive_draft: 2,
    receipt_terminal_unresolved: 20,
  },
  authorization_state: draft.authorization_state,
  authorizes_occurrence: false,
  authorizes_study: false,
  authorizes_cross_product: false,
  authorizes_decision_persistence: false,
  reviewer_result: "PENDING/PENDING",
}));
