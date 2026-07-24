import { createHash } from "node:crypto";
import { parseGtfsTable } from "@mta-wiki/db/import-gtfs";
import type { JsonValue } from "@mta-wiki/db/types";
import { stableJson } from "@mta-wiki/db/stable-json";
import { extentDecisionKey } from "./study-readiness-v1.js";

export const PLAN040_QBNR_STOP_REMOVAL_ACQUISITION_CONTRACT =
  "plan-040-qbnr-stop-removal-acquisition-v1" as const;
export const PLAN040_QBNR_STOP_REMOVAL_PACKAGE =
  "plan-040-qbnr-generic-stop-removal-risk-v1" as const;

const SOURCE_ID = "mta_queens_bus_network_redesign_service_changes";
const SOURCE_URL = "https://www.mta.info/project/queens-bus-network-redesign/service-changes";
const TARGET_RAW_TEXT = new Set([
  "Some stops have been removed.",
  "Some stops have been removed from this route.",
]);
const DATE_MAP = new Map([
  ["June 29, 2025", { implementation_date: "2025-06-29", implementation_phase: "phase_1" }],
  ["June 30, 2025", { implementation_date: "2025-06-30", implementation_phase: "phase_1" }],
  ["August 31, 2025", { implementation_date: "2025-08-31", implementation_phase: "phase_2" }],
  ["September 2, 2025", { implementation_date: "2025-09-02", implementation_phase: "phase_2" }],
] as const);

type JsonObject = Record<string, unknown>;

export type Plan040AcquisitionCandidate = {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
  gtfs_route_id: string;
  implementation_date: string;
  implementation_phase: "phase_1" | "phase_2";
  pre_feed_family: "queens" | "busco";
  pre_gtfs_route_id: string;
  pre_source_id: string;
  pre_target_date: string;
  pre_trip_row_count: number;
  pre_active_trip_count: number;
  post_feed_family: "queens" | "busco";
  post_gtfs_route_id: string;
  post_source_id: string | null;
  post_inspected_source_id: string | null;
  post_required_acquisition_role: string | null;
  post_target_date: string;
  post_trip_row_count: number | null;
  post_active_trip_count: number | null;
  inventory_group:
    | "phase_1_same_family_busco"
    | "phase_1_same_family_queens"
    | "phase_1_queens_route_rename"
    | "phase_1_operator_transfer_complete"
    | "phase_1_operator_transfer_incomplete"
    | "phase_2_busco_pre_only";
  inventory_status:
    | "accepted_reused"
    | "incomplete_requires_later_queens_post_inventory"
    | "required_not_yet_accepted";
  service_change_evidence_id: string;
  service_change_block_sha256: string;
  official_stop_list_url: string;
  captured_stop_statement: string;
  exact_bindings: {
    route_table_row: string;
    stop_list_anchor_text: "View the full list of stops.";
    treatment_record_id: string;
  };
  requires_candidate_specific_stop_id_equivalence: true;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type Plan040GtfsSnapshotInput = {
  receiptJson: string;
  tripsCsv: string;
  calendarCsv: string;
  calendarDatesCsv: string;
};

export type Plan040GtfsSnapshotKey =
  | "phase_1_queens_pre"
  | "phase_1_busco_pre"
  | "phase_1_queens_post"
  | "phase_1_busco_post";

export type Plan040Q67ScheduleSensitivityReceipt = {
  schema_version: 1;
  receipt_id: "plan-040-schedule-trip-type-sensitivity-v1";
  source_id: "mta_bus_schedules_2025_candidate_windows";
  source_url: "https://data.ny.gov/resource/t4bz-xqa9";
  source_csv_sha256: string;
  source_row_count: number;
  source_acquisition_receipt_sha256: string;
  filter: {
    schedule_date: "2025-06-30";
    operator: "NYCT";
    route_id: "Q67";
  };
  timepoint_row_count: number;
  trip_type_distribution: {
    revenue: number;
    pull_out: number;
    pull_in: number;
    deadhead: number;
  };
  source_inputs: Array<{
    source_id: string;
    source_csv_sha256: string;
    source_row_count: number;
    source_acquisition_receipt_sha256: string;
  }>;
  slices: Array<{
    source_id: string;
    schedule_date: string;
    route_id: string;
    operator: string;
    trip_type_rows: Record<string, number>;
    nonrevenue_passenger_headsign_rows: number;
    selected_shapes: Array<{
      shape_id: string;
      passenger_trip_type: string;
      timepoint_row_count: number;
    }>;
    nonrevenue_shape_ids: string[];
    selected_shape_sensitivity:
      | "no_selected_pattern_impact"
      | "not_applicable_q67_correction_archive_pending";
  }>;
  accepted_exemplar_shape_sensitivity: {
    status: "no_selected_pattern_impact";
    scope: "selected_accepted_pattern_shapes_only";
    unmatched_or_other_shapes: "excluded_reviewed_unresolved";
    accepted_decision_effect: "no_amendment_required";
  };
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

export type Plan040QbnrStopRemovalAcquisitionManifest = {
  schema_version: 1;
  contract_id: typeof PLAN040_QBNR_STOP_REMOVAL_ACQUISITION_CONTRACT;
  package_id: typeof PLAN040_QBNR_STOP_REMOVAL_PACKAGE;
  source_capture: {
    source_id: typeof SOURCE_ID;
    source_url: typeof SOURCE_URL;
    source_html_sha256: string;
  };
  derivation_inputs: {
    member_extent_ledger_sha256: string;
    treatment_registry_sha256: string;
    route_treatment_scopes_sha256: string;
    source_blocks_registry_sha256: string;
    schedule_sensitivity_metadata_sha256: string;
    schedule_sensitivity_receipt_sha256: string;
    schedule_sensitivity_extraction_sha256: string;
    schedule_x64_metadata_sha256: string;
    schedule_x64_receipt_sha256: string;
  };
  candidate_count: 37;
  key_count: 37;
  candidate_key_sha256: string;
  raw_text_distribution: {
    "Some stops have been removed.": number;
    "Some stops have been removed from this route.": number;
  };
  phase_feed_distribution: {
    phase_1: { busco: number; queens: number };
    phase_2: { busco: number; queens: number };
  };
  inventory_group_distribution: {
    phase_1_same_family_busco: number;
    phase_1_same_family_queens: number;
    phase_1_queens_route_rename: number;
    phase_1_operator_transfer_complete: number;
    phase_1_operator_transfer_incomplete: number;
    phase_2_busco_pre_only: number;
  };
  inventory_status_distribution: {
    accepted_reused: number;
    incomplete_requires_later_queens_post_inventory: number;
    required_not_yet_accepted: number;
  };
  trip_count_method: {
    method_id: "receipt_pinned_exact_route_trip_rows_and_active_service_v1";
    rule: string;
    snapshot_inputs: Array<{
      snapshot_key: Plan040GtfsSnapshotKey;
      source_id: string;
      feed_family: "queens" | "busco";
      temporal_role: string;
      receipt_sha256: string;
      zip_sha1: string;
      zip_sha256: string;
      trips_txt_sha256: string;
      calendar_txt_sha256: string;
      calendar_dates_txt_sha256: string;
      service_window: { start: string; end: string };
    }>;
    classification_scope:
      "calendar_resolved_gtfs_trip_presence_not_fully_schedule_classified_revenue";
  };
  publication_version_semantics: {
    accepted_four_feed_launch_inputs: {
      queens_pre: {
        source_id: "gtfs_static_20250615_queens_pre_qbnr";
        zip_sha1: "c96466458c55036cd6feeadc291bf5951d6c3274";
        zip_sha256: string;
      };
      queens_post: {
        source_id: "gtfs_static_20250626_queens_post_qbnr";
        zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613";
        zip_sha256: string;
      };
      busco_pre: {
        source_id: "gtfs_static_20250625_busco_pre_qbnr";
        zip_sha1: "a52f278150cd9bc03082f76fccd57f1c8c331d3c";
        zip_sha256: string;
      };
      busco_post: {
        source_id: "gtfs_static_20250626_busco_post_qbnr";
        zip_sha1: "54653b3fafb5fabc5ab1c941780b871343138440";
        zip_sha256: string;
      };
    };
    launch_published_initial_post: {
      queens: {
        source_id: "gtfs_static_20250626_queens_post_qbnr";
        zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613";
        zip_sha256: string;
        acceptance_status: "accepted_immutable_bytes";
      };
      busco: {
        source_id: "gtfs_static_20250626_busco_post_qbnr";
        zip_sha1: "54653b3fafb5fabc5ab1c941780b871343138440";
        zip_sha256: string;
        acceptance_status: "accepted_immutable_bytes";
      };
    };
    first_week_corrections: {
      queens: {
        version_sha1: "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f";
        zip_sha256: null;
        acquisition_status: "full_sha1_observed_bytes_not_accepted";
        metadata_url: string;
        fetched_at: "2025-06-30T15:46:28.558891Z";
        service_window: { start: "2025-06-28"; end: "2025-08-30" };
        route_count: 269;
        stop_count: 1391;
        trip_count: 24721;
        stop_time_count: 652139;
        file_sha1s: {
          calendar_txt: "91183ad2187f37991e266ca1f549774384614726";
          calendar_dates_txt: "2cad2b1716cc4b899bc6a208307131cf44279dd8";
          trips_txt: "08d77fa5c44ba2d052cb8151765f47b13c573848";
          stop_times_txt: "00c4676204737f35524627514a0e11f8f6ad65a7";
          stops_txt: "bd9d9f4d48ae4472d689c3dce8bbcb85421cb475";
        };
        q67_check_status: "blocked_correction_bytes_unavailable";
        acquisition_gap: string;
      };
      busco: {
        version_sha1: "a35da13d0a8c311de05d3558e9e80d2a472c21d2";
        zip_sha256: null;
        acquisition_status: "full_sha1_observed_bytes_not_accepted";
        fetched_at: "2025-07-03";
        service_window: { start: "2025-06-29"; end: "2025-08-30" };
        route_count: 92;
        stop_count: 3163;
        trip_count: 28419;
        stop_time_count: 803149;
        file_sha1s: {
          calendar_txt: "05cea37704c833bf6ae2789bc0a92c4b293f51a6";
          calendar_dates_txt: "1630be2890679c5136fe298e811caeba5d90f1d6";
          trips_txt: "486c9a4acccbcaa4f73bbbc9bbd848258c1dad87";
          stop_times_txt: "f714c895c98e82c37bbd37deb6a67abd7bcd7f71";
          stops_txt: "3d77f6acb9d2a0f580c985934acdd58f1322a187";
        };
      };
      authority: "non_authorizing_sensitivity_only";
      correction_sensitive_candidate_route_ids: ["Q67"];
      comparison_model: {
        published_launch_diff: "frozen_from_accepted_launch_bytes";
        corrected_first_week_diff: "pending_exact_correction_bytes_and_candidate_review";
      };
    };
  };
  schedule_trip_type_sensitivity: {
    status: "schedule_corroborated_ordered_stop_correction_pending";
    source_role: "mta_bus_schedules_2025_timepoint_only_validation";
    source_id: "mta_bus_schedules_2025_candidate_windows";
    source_url: "https://data.ny.gov/resource/t4bz-xqa9";
    source_csv_sha256: "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5";
    source_receipt_sha256: "82cc442de9b9c0356965f678c8491a78a093eea8eca06bac29d67747355a58c3";
    q67_filter: {
      schedule_date: "2025-06-30";
      operator: "NYCT";
      route_id: "Q67";
    };
    q67_timepoint_row_count: 723;
    q67_trip_type_distribution: {
      revenue: 615;
      pull_out: 54;
      pull_in: 54;
      deadhead: 0;
    };
    detailed_receipt_path:
      "data/quality/operational-reference/member-extent-risk/plan-040-schedule-trip-type-sensitivity-v1.json";
    detailed_receipt_sha256: string;
    accepted_exemplar_shape_sensitivity: {
      status: "no_selected_pattern_impact";
      scope: "selected_accepted_pattern_shapes_only";
      unmatched_or_other_shapes: "excluded_reviewed_unresolved";
      accepted_decision_effect: "no_amendment_required";
    };
    interpretation:
      "first_week_operational_service_corroborated_but_full_ordered_stop_chain_unavailable";
    required_exclusions: {
      pull_out_trip_type: 2;
      pull_in_trip_type: 3;
      deadhead_trip_type: 4;
    };
    unmatched_schedule_gtfs_rows: "reviewed_unresolved";
    accepted_exemplar_effect: "no_automatic_invalidation";
    authority: "non_authorizing_sensitivity_only";
  };
  equivalence_policy: {
    accepted_equivalence:
      "identical_stop_id_or_separately_cited_first_party_crosswalk_only";
    name_or_coordinate_inference: false;
  };
  candidates: Plan040AcquisitionCandidate[];
  decision_count: 0;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

function object(value: unknown, path: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as JsonObject;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path}: expected non-empty string`);
  }
  return value.trim();
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonl(value: string, path: string): JsonObject[] {
  return value.split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    return [object(JSON.parse(line) as unknown, `${path}:${index + 1}`)];
  });
}

function drupalRows(sourceHtml: string): Map<string, JsonObject> {
  const match = sourceHtml.match(
    /<script\b[^>]*data-drupal-selector=["']drupal-settings-json["'][^>]*>([\s\S]*?)<\/script>/iu,
  );
  if (!match?.[1]) throw new Error("source HTML lacks the Drupal settings JSON");
  const settings = object(JSON.parse(match[1]) as unknown, "drupal settings");
  const tables = object(settings.mtaDatatable, "drupal settings.mtaDatatable");
  const output = new Map<string, JsonObject>();
  for (const [tableId, tableValue] of Object.entries(tables)) {
    const table = object(tableValue, `mtaDatatable.${tableId}`);
    const csvData = object(table.csvData, `mtaDatatable.${tableId}.csvData`);
    if (!Array.isArray(csvData.data)) throw new Error(`mtaDatatable.${tableId}.csvData.data: expected array`);
    for (const [index, rowValue] of csvData.data.entries()) {
      const row = object(rowValue, `mtaDatatable.${tableId}.csvData.data[${index}]`);
      const route = object(row.Route, `route row ${index}.Route`);
      const routeId = string(route.value, `route row ${index}.Route.value`).toUpperCase();
      if (output.has(routeId)) throw new Error(`duplicate Drupal route row ${routeId}`);
      output.set(routeId, row);
    }
  }
  return output;
}

function cellValues(row: JsonObject): string[] {
  return Object.entries(row)
    .filter(([key]) => key !== "Route")
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .flatMap(([, value], index) => {
      const raw = object(value, `cell ${index}`).value;
      return typeof raw === "string" && raw.trim().length > 0 ? [raw.trim()] : [];
    });
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&#039;/gu, "'")
    .replace(/&quot;/gu, "\"")
    .replace(/\s+/gu, " ")
    .trim();
}

function exactStopListUrl(routeId: string, cells: readonly string[]): string {
  const matches = cells.flatMap((cell) => [...cell.matchAll(
    /<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>\s*View the full list of stops\.\s*<\/a>/giu,
  )].map((match) => match[1]!));
  if (matches.length !== 1) {
    throw new Error(`${routeId}: expected exactly one official full-stop-list URL, received ${matches.length}`);
  }
  const url = matches[0]!.replace(/^http:\/\/mta\.info\//u, "https://www.mta.info/");
  if (!/^https:\/\/(?:www\.)?mta\.info\/document\/\d+$/u.test(url)) {
    throw new Error(`${routeId}: stop-list URL is not an exact first-party MTA document URL`);
  }
  return url;
}

function implementation(routeId: string, cells: readonly string[]) {
  const text = cells.map(plainText).join(" | ");
  const matches = [...DATE_MAP.keys()].filter((date) => text.includes(date));
  if (matches.length !== 1) {
    throw new Error(`${routeId}: expected one supported implementation date, received ${matches.length}`);
  }
  return DATE_MAP.get(matches[0]!)!;
}

function sourceBlockId(evidenceId: string): string {
  const prefix = `${SOURCE_ID}#`;
  if (!evidenceId.startsWith(prefix)) throw new Error(`${evidenceId}: wrong source evidence`);
  return evidenceId.slice(prefix.length);
}

function postFeedFamily(scope: JsonObject, treatmentId: string): "queens" | "busco" {
  const identity = object(scope.route_identity, `${treatmentId}.route_identity`);
  const dataset = string(identity.dataset_id, `${treatmentId}.route_identity.dataset_id`);
  if (dataset === "mta-nyct-bus") return "queens";
  if (dataset === "mta-bus-company") return "busco";
  throw new Error(`${treatmentId}: unsupported route dataset ${dataset}`);
}

const SNAPSHOT_SPECS = {
  phase_1_queens_pre: {
    source_id: "gtfs_static_20250615_queens_pre_qbnr",
    feed_family: "queens",
    temporal_role: "phase_1_pre",
  },
  phase_1_busco_pre: {
    source_id: "gtfs_static_20250625_busco_pre_qbnr",
    feed_family: "busco",
    temporal_role: "phase_1_pre",
  },
  phase_1_queens_post: {
    source_id: "gtfs_static_20250626_queens_post_qbnr",
    feed_family: "queens",
    temporal_role: "phase_1_post",
  },
  phase_1_busco_post: {
    source_id: "gtfs_static_20250626_busco_post_qbnr",
    feed_family: "busco",
    temporal_role: "phase_1_post_and_phase_2_pre",
  },
} as const satisfies Record<Plan040GtfsSnapshotKey, {
  source_id: string;
  feed_family: "queens" | "busco";
  temporal_role: string;
}>;

type LoadedSnapshot = {
  sourceId: string;
  feedFamily: "queens" | "busco";
  serviceWindow: { start: string; end: string };
  tripRowCount(routeId: string): number;
  activeTripCount(routeId: string, date: string): number;
  inputPin: Plan040QbnrStopRemovalAcquisitionManifest["trip_count_method"]["snapshot_inputs"][number];
};

function receiptMember(receipt: JsonObject, memberName: string): JsonObject {
  if (!Array.isArray(receipt.members)) throw new Error(`${receipt.source_id}: receipt.members missing`);
  const matches = receipt.members.filter((value) =>
    object(value, `${receipt.source_id}.members`).member === memberName);
  if (matches.length !== 1) throw new Error(`${receipt.source_id}: expected one ${memberName} receipt member`);
  return object(matches[0], `${receipt.source_id}.${memberName}`);
}

function loadSnapshot(
  snapshotKey: Plan040GtfsSnapshotKey,
  input: Plan040GtfsSnapshotInput,
): LoadedSnapshot {
  const spec = SNAPSHOT_SPECS[snapshotKey];
  const receipt = object(JSON.parse(input.receiptJson) as unknown, `${snapshotKey}.receipt`);
  if (receipt.source_id !== spec.source_id) {
    throw new Error(`${snapshotKey}: receipt source_id drifted from ${spec.source_id}`);
  }
  const serviceWindowValue = object(receipt.service_window, `${snapshotKey}.service_window`);
  const serviceWindow = {
    start: string(serviceWindowValue.start, `${snapshotKey}.service_window.start`),
    end: string(serviceWindowValue.end, `${snapshotKey}.service_window.end`),
  };
  const zipSha1 = string(receipt.zip_sha1, `${snapshotKey}.zip_sha1`);
  const zipSha256 = string(receipt.zip_sha256, `${snapshotKey}.zip_sha256`);
  if (!/^[0-9a-f]{40}$/u.test(zipSha1) || !/^[0-9a-f]{64}$/u.test(zipSha256)) {
    throw new Error(`${snapshotKey}: receipt lacks full accepted ZIP identities`);
  }
  const fileInputs = [
    ["trips.txt", input.tripsCsv],
    ["calendar.txt", input.calendarCsv],
    ["calendar_dates.txt", input.calendarDatesCsv],
  ] as const;
  for (const [memberName, bytes] of fileInputs) {
    const member = receiptMember(receipt, memberName);
    if (sha256(bytes) !== string(member.sha256, `${snapshotKey}.${memberName}.sha256`)) {
      throw new Error(`${snapshotKey}: ${memberName} bytes do not match the accepted receipt`);
    }
    if (parseGtfsTable(bytes).length !== Number(member.rows)) {
      throw new Error(`${snapshotKey}: ${memberName} row count does not match the accepted receipt`);
    }
  }
  const trips = parseGtfsTable(input.tripsCsv);
  const calendar = parseGtfsTable(input.calendarCsv);
  const calendarDates = parseGtfsTable(input.calendarDatesCsv);
  const activeServiceCache = new Map<string, Set<string>>();
  const activeServices = (date: string): Set<string> => {
    const cached = activeServiceCache.get(date);
    if (cached) return cached;
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || date < serviceWindow.start || date > serviceWindow.end) {
      throw new Error(`${snapshotKey}: target date ${date} is outside the pinned service window`);
    }
    const compact = date.replaceAll("-", "");
    const parsed = new Date(`${date}T00:00:00Z`);
    const weekday = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ][parsed.getUTCDay()]!;
    const active = new Set(calendar.filter((row) => {
      const startDate = row.start_date;
      const endDate = row.end_date;
      return (
        startDate !== undefined &&
        endDate !== undefined &&
        startDate <= compact &&
        endDate >= compact &&
        row[weekday] === "1"
      );
    }).map((row) => row.service_id!));
    for (const exception of calendarDates.filter((row) => row.date === compact)) {
      if (exception.exception_type === "1") active.add(exception.service_id!);
      else if (exception.exception_type === "2") active.delete(exception.service_id!);
      else throw new Error(`${snapshotKey}: unsupported calendar exception type`);
    }
    activeServiceCache.set(date, active);
    return active;
  };
  return {
    sourceId: spec.source_id,
    feedFamily: spec.feed_family,
    serviceWindow,
    tripRowCount: (routeId) => trips.filter((trip) => trip.route_id === routeId).length,
    activeTripCount: (routeId, date) => {
      const services = activeServices(date);
      return trips.filter((trip) =>
        trip.route_id === routeId && services.has(trip.service_id!)).length;
    },
    inputPin: {
      snapshot_key: snapshotKey,
      source_id: spec.source_id,
      feed_family: spec.feed_family,
      temporal_role: spec.temporal_role,
      receipt_sha256: sha256(input.receiptJson),
      zip_sha1: zipSha1,
      zip_sha256: zipSha256,
      trips_txt_sha256: sha256(input.tripsCsv),
      calendar_txt_sha256: sha256(input.calendarCsv),
      calendar_dates_txt_sha256: sha256(input.calendarDatesCsv),
      service_window: serviceWindow,
    },
  };
}

function phase1Lineage(postRouteId: string, postFamily: "queens" | "busco"): {
  preRouteId: string;
  preFamily: "queens" | "busco";
} {
  if (postRouteId === "Q26") return { preRouteId: "Q26", preFamily: "queens" };
  if (postRouteId === "Q38" || postRouteId === "Q67") {
    return { preRouteId: postRouteId, preFamily: "busco" };
  }
  if (postRouteId === "QM63") return { preRouteId: "X63", preFamily: "queens" };
  if (postRouteId === "QM68") return { preRouteId: "X68", preFamily: "queens" };
  return { preRouteId: postRouteId, preFamily: postFamily };
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function nearestActiveSlice(
  snapshot: LoadedSnapshot,
  routeId: string,
  boundaryDate: string,
  direction: -1 | 1,
): { date: string; activeTripCount: number } {
  for (let offset = 0; offset <= 14; offset += 1) {
    const date = shiftDate(boundaryDate, offset * direction);
    if (date < snapshot.serviceWindow.start || date > snapshot.serviceWindow.end) continue;
    const activeTripCount = snapshot.activeTripCount(routeId, date);
    if (activeTripCount > 0) return { date, activeTripCount };
  }
  throw new Error(`${routeId}: no active route trips near ${boundaryDate} in ${snapshot.sourceId}`);
}

type InventoryBinding = Pick<
  Plan040AcquisitionCandidate,
  | "pre_feed_family"
  | "pre_gtfs_route_id"
  | "pre_source_id"
  | "pre_target_date"
  | "pre_trip_row_count"
  | "pre_active_trip_count"
  | "post_feed_family"
  | "post_gtfs_route_id"
  | "post_source_id"
  | "post_inspected_source_id"
  | "post_required_acquisition_role"
  | "post_target_date"
  | "post_trip_row_count"
  | "post_active_trip_count"
  | "inventory_group"
  | "inventory_status"
>;

function inventoryBinding(input: {
  routeId: string;
  implementationDate: string;
  implementationPhase: "phase_1" | "phase_2";
  postFamily: "queens" | "busco";
  snapshots: Record<Plan040GtfsSnapshotKey, LoadedSnapshot>;
}): InventoryBinding {
  if (input.implementationPhase === "phase_2") {
    if (input.postFamily !== "busco" || input.implementationDate !== "2025-08-31") {
      throw new Error(`${input.routeId}: unsupported Phase-2 inventory lineage`);
    }
    const pre = input.snapshots.phase_1_busco_post;
    const preTripRows = pre.tripRowCount(input.routeId);
    const preActiveTrips = pre.activeTripCount(input.routeId, "2025-08-30");
    if (preTripRows === 0 || preActiveTrips === 0) {
      throw new Error(`${input.routeId}: Phase-2 BusCo pre inventory has no active target-slice trips`);
    }
    return {
      pre_feed_family: "busco",
      pre_gtfs_route_id: input.routeId,
      pre_source_id: pre.sourceId,
      pre_target_date: "2025-08-30",
      pre_trip_row_count: preTripRows,
      pre_active_trip_count: preActiveTrips,
      post_feed_family: "busco",
      post_gtfs_route_id: input.routeId,
      post_source_id: null,
      post_inspected_source_id: null,
      post_required_acquisition_role:
        "authoritative_busco_full_stop_inventory_effective_2025-08-31_with_full_sha1_sha256_provenance_and_service_window",
      post_target_date: "2025-08-31",
      post_trip_row_count: null,
      post_active_trip_count: null,
      inventory_group: "phase_2_busco_pre_only",
      inventory_status: "required_not_yet_accepted",
    };
  }

  const lineage = phase1Lineage(input.routeId, input.postFamily);
  const preKey = lineage.preFamily === "queens" ? "phase_1_queens_pre" : "phase_1_busco_pre";
  const postKey = input.postFamily === "queens" ? "phase_1_queens_post" : "phase_1_busco_post";
  const pre = input.snapshots[preKey];
  const post = input.snapshots[postKey];
  const preBoundaryDate = shiftDate(input.implementationDate, -1);
  const preTripRows = pre.tripRowCount(lineage.preRouteId);
  const preSlice = nearestActiveSlice(pre, lineage.preRouteId, preBoundaryDate, -1);
  const postTripRows = post.tripRowCount(input.routeId);
  if (input.routeId !== "Q67" && postTripRows === 0) {
    throw new Error(`${input.routeId}: Phase-1 post inventory has no trip rows`);
  }
  const postSlice = input.routeId === "Q67"
    ? { date: input.implementationDate, activeTripCount: 0 }
    : nearestActiveSlice(post, input.routeId, input.implementationDate, 1);
  if (preTripRows === 0 || preSlice.activeTripCount === 0) {
    throw new Error(`${input.routeId}: Phase-1 pre inventory has no active target-slice trips`);
  }

  if (input.routeId === "Q67") {
    if (
      lineage.preFamily !== "busco" ||
      input.postFamily !== "queens" ||
      preTripRows !== 266 ||
      postTripRows !== 0 ||
      postSlice.activeTripCount !== 0
    ) {
      throw new Error("Q67: expected the pinned BusCo-to-Queens zero-post-trip gap");
    }
    return {
      pre_feed_family: lineage.preFamily,
      pre_gtfs_route_id: lineage.preRouteId,
      pre_source_id: pre.sourceId,
      pre_target_date: preSlice.date,
      pre_trip_row_count: preTripRows,
      pre_active_trip_count: preSlice.activeTripCount,
      post_feed_family: input.postFamily,
      post_gtfs_route_id: input.routeId,
      post_source_id: null,
      post_inspected_source_id: post.sourceId,
      post_required_acquisition_role:
        "exact_queens_first_week_correction_6db867de2ce30f47ae0ee763f422dc34fb7a9f9f_bytes_for_q67_non_authorizing_sensitivity",
      post_target_date: input.implementationDate,
      post_trip_row_count: 0,
      post_active_trip_count: 0,
      inventory_group: "phase_1_operator_transfer_incomplete",
      inventory_status: "incomplete_requires_later_queens_post_inventory",
    };
  }

  if (postTripRows === 0 || postSlice.activeTripCount === 0) {
    throw new Error(`${input.routeId}: Phase-1 post inventory has no active target-slice trips`);
  }
  const inventoryGroup = lineage.preRouteId !== input.routeId
    ? "phase_1_queens_route_rename"
    : lineage.preFamily !== input.postFamily
      ? "phase_1_operator_transfer_complete"
      : input.postFamily === "busco"
        ? "phase_1_same_family_busco"
        : "phase_1_same_family_queens";
  return {
    pre_feed_family: lineage.preFamily,
    pre_gtfs_route_id: lineage.preRouteId,
    pre_source_id: pre.sourceId,
    pre_target_date: preSlice.date,
    pre_trip_row_count: preTripRows,
    pre_active_trip_count: preSlice.activeTripCount,
    post_feed_family: input.postFamily,
    post_gtfs_route_id: input.routeId,
    post_source_id: post.sourceId,
    post_inspected_source_id: post.sourceId,
    post_required_acquisition_role: null,
    post_target_date: postSlice.date,
    post_trip_row_count: postTripRows,
    post_active_trip_count: postSlice.activeTripCount,
    inventory_group: inventoryGroup,
    inventory_status: "accepted_reused",
  };
}

export function buildPlan040QbnrStopRemovalAcquisitionManifest(input: {
  ledgerJsonl: string;
  treatmentJsonl: string;
  routeTreatmentScopesJsonl: string;
  sourceBlocksJsonl: string;
  sourceHtml: string;
  sourceMetadata: unknown;
  inventorySnapshots: Record<Plan040GtfsSnapshotKey, Plan040GtfsSnapshotInput>;
  scheduleSourceMetadataJson: string;
  scheduleSourceAcquisitionReceiptJson: string;
  scheduleX64MetadataJson: string;
  scheduleX64AcquisitionReceiptJson: string;
  scheduleSensitivityReceipt: unknown;
}): Plan040QbnrStopRemovalAcquisitionManifest {
  const ledger = jsonl(input.ledgerJsonl, "member extent ledger");
  const treatments = new Map(
    jsonl(input.treatmentJsonl, "treatments").map((record) => [
      string(record.record_id, "treatment.record_id"),
      record,
    ]),
  );
  const scopes = new Map(
    jsonl(input.routeTreatmentScopesJsonl, "route treatment scopes").map((record) => [
      string(record.treatment_record_id, "scope.treatment_record_id"),
      record,
    ]),
  );
  const blocks = new Map(
    jsonl(input.sourceBlocksJsonl, "source blocks").map((record) => [
      string(record.block_id, "block.block_id"),
      record,
    ]),
  );
  const metadata = object(input.sourceMetadata, "source metadata");
  if (metadata.sourceId !== SOURCE_ID || metadata.sourceUrl !== SOURCE_URL) {
    throw new Error("source metadata does not identify the frozen QBNR service-change page");
  }
  const expectedSourceHash = string(metadata.sha256, "source metadata.sha256").replace(/^sha256:/u, "");
  const actualSourceHash = sha256(input.sourceHtml);
  if (actualSourceHash !== expectedSourceHash) throw new Error("source HTML hash does not match metadata");
  const scheduleMetadata = object(
    JSON.parse(input.scheduleSourceMetadataJson) as unknown,
    "schedule sensitivity metadata",
  );
  const scheduleAcquisitionReceipt = object(
    JSON.parse(input.scheduleSourceAcquisitionReceiptJson) as unknown,
    "schedule source acquisition receipt",
  );
  const scheduleSensitivity = object(
    input.scheduleSensitivityReceipt,
    "Q67 schedule sensitivity extraction receipt",
  );
  const scheduleX64Metadata = object(
    JSON.parse(input.scheduleX64MetadataJson) as unknown,
    "X64 schedule sensitivity metadata",
  );
  const scheduleX64Receipt = object(
    JSON.parse(input.scheduleX64AcquisitionReceiptJson) as unknown,
    "X64 schedule source acquisition receipt",
  );
  const scheduleFilter = object(scheduleSensitivity.filter, "Q67 schedule sensitivity filter");
  const scheduleDistribution = object(
    scheduleSensitivity.trip_type_distribution,
    "Q67 schedule trip_type distribution",
  );
  if (
    scheduleMetadata.sourceId !== "mta_bus_schedules_2025_candidate_windows" ||
    scheduleMetadata.sourceUrl !== "https://data.ny.gov/resource/t4bz-xqa9" ||
    scheduleMetadata.sha256 !== "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5" ||
    scheduleAcquisitionReceipt.source_id !== scheduleMetadata.sourceId ||
    scheduleAcquisitionReceipt.source_url !== scheduleMetadata.sourceUrl ||
    scheduleAcquisitionReceipt.merged_sha256 !== scheduleMetadata.sha256 ||
    scheduleAcquisitionReceipt.merged_row_count !== 7_110_460 ||
    scheduleAcquisitionReceipt.requests_complete !== true ||
    sha256(input.scheduleSourceAcquisitionReceiptJson) !==
      "82cc442de9b9c0356965f678c8491a78a093eea8eca06bac29d67747355a58c3" ||
    scheduleX64Metadata.sourceId !== "mta_bus_schedules_2025_x64_predecessor_2026_07_23" ||
    scheduleX64Metadata.sourceUrl !== scheduleMetadata.sourceUrl ||
    scheduleX64Metadata.sha256 !== "ca945aab20f4a2b8198ad9555cd2bdd28597b56422a45cc2f73da4e9cef6cff7" ||
    scheduleX64Receipt.source_id !== scheduleX64Metadata.sourceId ||
    scheduleX64Receipt.source_url !== scheduleX64Metadata.sourceUrl ||
    scheduleX64Receipt.merged_sha256 !== scheduleX64Metadata.sha256 ||
    scheduleX64Receipt.merged_row_count !== 2_960 ||
    scheduleX64Receipt.requests_complete !== true ||
    sha256(input.scheduleX64AcquisitionReceiptJson) !==
      "d76fd412c308597af40378e30283e607363d3ab344037a888b2d74cc993b5032" ||
    scheduleSensitivity.receipt_id !== "plan-040-schedule-trip-type-sensitivity-v1" ||
    scheduleSensitivity.source_id !== scheduleMetadata.sourceId ||
    scheduleSensitivity.source_url !== scheduleMetadata.sourceUrl ||
    scheduleSensitivity.source_csv_sha256 !== scheduleMetadata.sha256 ||
    scheduleSensitivity.source_row_count !== scheduleAcquisitionReceipt.merged_row_count ||
    scheduleSensitivity.source_acquisition_receipt_sha256 !==
      "82cc442de9b9c0356965f678c8491a78a093eea8eca06bac29d67747355a58c3" ||
    scheduleFilter.schedule_date !== "2025-06-30" ||
    scheduleFilter.operator !== "NYCT" ||
    scheduleFilter.route_id !== "Q67" ||
    scheduleSensitivity.timepoint_row_count !== 723 ||
    scheduleDistribution.revenue !== 615 ||
    scheduleDistribution.pull_out !== 54 ||
    scheduleDistribution.pull_in !== 54 ||
    scheduleDistribution.deadhead !== 0 ||
    scheduleSensitivity.authorizes_occurrence !== false ||
    scheduleSensitivity.authorizes_study !== false ||
    scheduleSensitivity.authorizes_cross_product !== false
  ) {
    throw new Error("Q67 schedule sensitivity source, filter, trip_type count, or receipt identity drifted");
  }
  if (!Array.isArray(scheduleSensitivity.source_inputs) || !Array.isArray(scheduleSensitivity.slices)) {
    throw new Error("schedule sensitivity extraction lacks pinned sources or route/date slices");
  }
  const expectedScheduleSources = [
    {
      source_id: "mta_bus_schedules_2025_candidate_windows",
      source_csv_sha256: "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5",
      source_row_count: 7_110_460,
      source_acquisition_receipt_sha256:
        "82cc442de9b9c0356965f678c8491a78a093eea8eca06bac29d67747355a58c3",
    },
    {
      source_id: "mta_bus_schedules_2025_x64_predecessor_2026_07_23",
      source_csv_sha256: "ca945aab20f4a2b8198ad9555cd2bdd28597b56422a45cc2f73da4e9cef6cff7",
      source_row_count: 2_960,
      source_acquisition_receipt_sha256:
        "d76fd412c308597af40378e30283e607363d3ab344037a888b2d74cc993b5032",
    },
  ];
  if (
    stableJson(scheduleSensitivity.source_inputs as JsonValue) !==
    stableJson(expectedScheduleSources as unknown as JsonValue)
  ) {
    throw new Error("schedule sensitivity extraction source.csv identity or row count drifted");
  }
  const expectedSlices = [
    {
      key: "2025-06-30/Q67",
      operator: "NYCT",
      source_id: "mta_bus_schedules_2025_candidate_windows",
      trip_type_rows: { "1": 615, "2": 54, "3": 54 },
      nonrevenue_passenger_headsign_rows: 108,
      selected_shapes: {},
      selected_shape_sensitivity: "not_applicable_q67_correction_archive_pending",
    },
    {
      key: "2025-06-30/Q61",
      operator: "NYCT",
      source_id: "mta_bus_schedules_2025_candidate_windows",
      trip_type_rows: { "12": 762, "2": 24, "3": 24, "4": 8 },
      nonrevenue_passenger_headsign_rows: 56,
      selected_shapes: { Q610024: 332, Q610025: 430 },
      selected_shape_sensitivity: "no_selected_pattern_impact",
    },
    {
      key: "2025-06-27/QM44",
      operator: "MTA Bus",
      source_id: "mta_bus_schedules_2025_candidate_windows",
      trip_type_rows: { "13": 51, "2": 16, "3": 12, "4": 6 },
      nonrevenue_passenger_headsign_rows: 0,
      selected_shapes: { QM440062: 35, QM440063: 16 },
      selected_shape_sensitivity: "no_selected_pattern_impact",
    },
    {
      key: "2025-06-30/QM44",
      operator: "MTA Bus",
      source_id: "mta_bus_schedules_2025_candidate_windows",
      trip_type_rows: { "13": 46, "2": 14, "3": 14, "4": 6 },
      nonrevenue_passenger_headsign_rows: 6,
      selected_shapes: { QM440060: 16, QM440064: 30 },
      selected_shape_sensitivity: "no_selected_pattern_impact",
    },
    {
      key: "2025-06-30/QM64",
      operator: "NYCT",
      source_id: "mta_bus_schedules_2025_candidate_windows",
      trip_type_rows: { "13": 92, "2": 26, "3": 24, "4": 16 },
      nonrevenue_passenger_headsign_rows: 66,
      selected_shapes: { QM640034: 56, QM640035: 36 },
      selected_shape_sensitivity: "no_selected_pattern_impact",
    },
    {
      key: "2025-06-27/X64",
      operator: "NYCT",
      source_id: "mta_bus_schedules_2025_x64_predecessor_2026_07_23",
      trip_type_rows: { "13": 84, "2": 28, "3": 28, "4": 8 },
      nonrevenue_passenger_headsign_rows: 64,
      selected_shapes: { X640016: 36, X640017: 48 },
      selected_shape_sensitivity: "no_selected_pattern_impact",
    },
  ];
  const scheduleSlices = scheduleSensitivity.slices.map((value, index) =>
    object(value, `schedule sensitivity slice ${index}`));
  if (scheduleSlices.length !== expectedSlices.length) {
    throw new Error("schedule sensitivity extraction slice count drifted");
  }
  for (const expected of expectedSlices) {
    const [date, routeId] = expected.key.split("/");
    const matches = scheduleSlices.filter((slice) =>
      slice.schedule_date === date && slice.route_id === routeId);
    if (matches.length !== 1) throw new Error(`${expected.key}: schedule sensitivity slice missing`);
    const slice = matches[0]!;
    if (
      slice.source_id !== expected.source_id ||
      slice.operator !== expected.operator ||
      slice.nonrevenue_passenger_headsign_rows !== expected.nonrevenue_passenger_headsign_rows ||
      slice.selected_shape_sensitivity !== expected.selected_shape_sensitivity ||
      stableJson(slice.trip_type_rows as JsonValue) !==
        stableJson(expected.trip_type_rows as unknown as JsonValue)
    ) {
      throw new Error(`${expected.key}: schedule sensitivity trip_type/headsign result drifted`);
    }
    const selectedShapes = slice.selected_shapes;
    const nonrevenueShapeIds = slice.nonrevenue_shape_ids;
    if (!Array.isArray(selectedShapes) || !Array.isArray(nonrevenueShapeIds)) {
      throw new Error(`${expected.key}: schedule sensitivity shape sets missing`);
    }
    const selected = Object.fromEntries(selectedShapes.map((value) => {
      const shape = object(value, `${expected.key}.selected shape`);
      const shapeId = string(shape.shape_id, `${expected.key}.shape_id`);
      const count = Number(shape.timepoint_row_count);
      if (nonrevenueShapeIds.includes(shapeId)) {
        throw new Error(`${expected.key}: accepted shape overlaps a nonrevenue shape`);
      }
      return [shapeId, count];
    }));
    if (
      stableJson(selected as unknown as JsonValue) !==
      stableJson(expected.selected_shapes as unknown as JsonValue)
    ) {
      throw new Error(`${expected.key}: accepted selected-shape count drifted`);
    }
  }
  const exemplarSensitivity = object(
    scheduleSensitivity.accepted_exemplar_shape_sensitivity,
    "accepted exemplar shape sensitivity",
  );
  if (
    exemplarSensitivity.status !== "no_selected_pattern_impact" ||
    exemplarSensitivity.scope !== "selected_accepted_pattern_shapes_only" ||
    exemplarSensitivity.unmatched_or_other_shapes !== "excluded_reviewed_unresolved" ||
    exemplarSensitivity.accepted_decision_effect !== "no_amendment_required"
  ) {
    throw new Error("accepted exemplar selected-shape sensitivity result drifted");
  }
  const rows = drupalRows(input.sourceHtml);
  const snapshots: Record<Plan040GtfsSnapshotKey, LoadedSnapshot> = {
    phase_1_queens_pre: loadSnapshot(
      "phase_1_queens_pre",
      input.inventorySnapshots.phase_1_queens_pre,
    ),
    phase_1_busco_pre: loadSnapshot(
      "phase_1_busco_pre",
      input.inventorySnapshots.phase_1_busco_pre,
    ),
    phase_1_queens_post: loadSnapshot(
      "phase_1_queens_post",
      input.inventorySnapshots.phase_1_queens_post,
    ),
    phase_1_busco_post: loadSnapshot(
      "phase_1_busco_post",
      input.inventorySnapshots.phase_1_busco_post,
    ),
  };

  const candidates = ledger.flatMap((ledgerRow): Plan040AcquisitionCandidate[] => {
    if (ledgerRow.verdict !== "unreviewed") return [];
    const treatmentId = string(ledgerRow.treatment_record_id, "ledger.treatment_record_id");
    const treatment = treatments.get(treatmentId);
    if (!treatment || treatment.source_id !== SOURCE_ID || !TARGET_RAW_TEXT.has(treatment.raw_text as string)) {
      return [];
    }
    const routeId = string(ledgerRow.gtfs_route_id, `${treatmentId}.gtfs_route_id`).toUpperCase();
    const row = rows.get(routeId);
    if (!row) throw new Error(`${routeId}: missing Drupal route row`);
    const cells = cellValues(row);
    const treatmentRawText = string(treatment.raw_text, `${treatmentId}.raw_text`);
    if (!cells.map(plainText).some((cell) => cell.includes(treatmentRawText))) {
      throw new Error(`${treatmentId}: captured route row does not contain the exact treatment statement`);
    }
    if (!Array.isArray(treatment.evidence_refs) || treatment.evidence_refs.length !== 1) {
      throw new Error(`${treatmentId}: expected one exact service-change evidence binding`);
    }
    const evidence = object(treatment.evidence_refs[0], `${treatmentId}.evidence_refs[0]`);
    const evidenceId = string(evidence.evidence_id, `${treatmentId}.evidence_id`);
    const block = blocks.get(sourceBlockId(evidenceId));
    if (!block) throw new Error(`${treatmentId}: evidence block is absent`);
    const blockText = string(block.raw_text, `${treatmentId}.block.raw_text`);
    if (!blockText.includes(routeId) || !blockText.includes(treatmentRawText)) {
      throw new Error(`${treatmentId}: evidence block does not bind the route and treatment statement`);
    }
    const scope = scopes.get(treatmentId);
    if (!scope) throw new Error(`${treatmentId}: exact route-treatment scope is absent`);
    const exactKey = {
      occurrence_id: string(ledgerRow.occurrence_id, `${treatmentId}.occurrence_id`),
      route_record_id: string(ledgerRow.route_record_id, `${treatmentId}.route_record_id`),
      treatment_record_id: treatmentId,
    };
    const timing = implementation(routeId, cells);
    const postFamily = postFeedFamily(scope, treatmentId);
    return [{
      ...exactKey,
      gtfs_route_id: routeId,
      ...timing,
      ...inventoryBinding({
        routeId,
        implementationDate: timing.implementation_date,
        implementationPhase: timing.implementation_phase,
        postFamily,
        snapshots,
      }),
      service_change_evidence_id: evidenceId,
      service_change_block_sha256: string(block.raw_text_sha256, `${treatmentId}.block.raw_text_sha256`)
        .replace(/^sha256:/u, ""),
      official_stop_list_url: exactStopListUrl(routeId, cells),
      captured_stop_statement: treatmentRawText,
      exact_bindings: {
        route_table_row: routeId,
        stop_list_anchor_text: "View the full list of stops.",
        treatment_record_id: treatmentId,
      },
      requires_candidate_specific_stop_id_equivalence: true,
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
    }];
  }).sort((left, right) => extentDecisionKey(left)
    .localeCompare(extentDecisionKey(right)));

  const keys = candidates.map((candidate) => extentDecisionKey(candidate));
  if (candidates.length !== 37 || new Set(keys).size !== 37) {
    throw new Error(`expected exact 37-key package, received candidates=${candidates.length}, keys=${new Set(keys).size}`);
  }
  if (new Set(candidates.map((candidate) => candidate.gtfs_route_id)).size !== 37) {
    throw new Error("expected one exact candidate per route");
  }

  const count = (phase: "phase_1" | "phase_2", feed: "queens" | "busco") =>
    candidates.filter((candidate) =>
      candidate.implementation_phase === phase && candidate.post_feed_family === feed).length;
  const rawCount = (raw: string) =>
    candidates.filter((candidate) => candidate.captured_stop_statement === raw).length;
  const phaseFeedDistribution = {
    phase_1: { busco: count("phase_1", "busco"), queens: count("phase_1", "queens") },
    phase_2: { busco: count("phase_2", "busco"), queens: count("phase_2", "queens") },
  };
  const inventoryGroupDistribution = {
    phase_1_same_family_busco: candidates.filter((candidate) =>
      candidate.inventory_group === "phase_1_same_family_busco").length,
    phase_1_same_family_queens: candidates.filter((candidate) =>
      candidate.inventory_group === "phase_1_same_family_queens").length,
    phase_1_queens_route_rename: candidates.filter((candidate) =>
      candidate.inventory_group === "phase_1_queens_route_rename").length,
    phase_1_operator_transfer_complete: candidates.filter((candidate) =>
      candidate.inventory_group === "phase_1_operator_transfer_complete").length,
    phase_1_operator_transfer_incomplete: candidates.filter((candidate) =>
      candidate.inventory_group === "phase_1_operator_transfer_incomplete").length,
    phase_2_busco_pre_only: candidates.filter((candidate) =>
      candidate.inventory_group === "phase_2_busco_pre_only").length,
  };
  const inventoryStatusDistribution = {
    accepted_reused: candidates.filter((candidate) =>
      candidate.inventory_status === "accepted_reused").length,
    incomplete_requires_later_queens_post_inventory: candidates.filter((candidate) =>
      candidate.inventory_status === "incomplete_requires_later_queens_post_inventory").length,
    required_not_yet_accepted: candidates.filter((candidate) =>
      candidate.inventory_status === "required_not_yet_accepted").length,
  };
  const expectedGroups = {
    phase_1_same_family_busco: 11,
    phase_1_same_family_queens: 9,
    phase_1_queens_route_rename: 2,
    phase_1_operator_transfer_complete: 2,
    phase_1_operator_transfer_incomplete: 1,
    phase_2_busco_pre_only: 12,
  };
  if (
    stableJson(inventoryGroupDistribution as unknown as JsonValue) !==
    stableJson(expectedGroups as unknown as JsonValue)
  ) {
    throw new Error("candidate-level inventory group distribution drifted from the frozen package");
  }
  if (
    inventoryStatusDistribution.accepted_reused !== 24 ||
    inventoryStatusDistribution.incomplete_requires_later_queens_post_inventory !== 1 ||
    inventoryStatusDistribution.required_not_yet_accepted !== 12
  ) {
    throw new Error("candidate-level inventory status distribution drifted from 24/1/12");
  }
  if (
    snapshots.phase_1_queens_pre.inputPin.zip_sha1 !==
      "c96466458c55036cd6feeadc291bf5951d6c3274" ||
    snapshots.phase_1_queens_post.inputPin.zip_sha1 !==
      "c868290ddcd79c69712d809ece96d96dbad2c613" ||
    snapshots.phase_1_busco_pre.inputPin.zip_sha1 !==
      "a52f278150cd9bc03082f76fccd57f1c8c331d3c" ||
    snapshots.phase_1_busco_post.inputPin.zip_sha1 !==
      "54653b3fafb5fabc5ab1c941780b871343138440"
  ) {
    throw new Error("one of the four launch feed identities drifted from the accepted Step2A bytes");
  }
  const manifest: Plan040QbnrStopRemovalAcquisitionManifest = {
    schema_version: 1,
    contract_id: PLAN040_QBNR_STOP_REMOVAL_ACQUISITION_CONTRACT,
    package_id: PLAN040_QBNR_STOP_REMOVAL_PACKAGE,
    source_capture: {
      source_id: SOURCE_ID,
      source_url: SOURCE_URL,
      source_html_sha256: actualSourceHash,
    },
    derivation_inputs: {
      member_extent_ledger_sha256: sha256(input.ledgerJsonl),
      treatment_registry_sha256: sha256(input.treatmentJsonl),
      route_treatment_scopes_sha256: sha256(input.routeTreatmentScopesJsonl),
      source_blocks_registry_sha256: sha256(input.sourceBlocksJsonl),
      schedule_sensitivity_metadata_sha256: sha256(input.scheduleSourceMetadataJson),
      schedule_sensitivity_receipt_sha256: sha256(input.scheduleSourceAcquisitionReceiptJson),
      schedule_sensitivity_extraction_sha256: sha256(
        `${stableJson(scheduleSensitivity as unknown as JsonValue)}\n`,
      ),
      schedule_x64_metadata_sha256: sha256(input.scheduleX64MetadataJson),
      schedule_x64_receipt_sha256: sha256(input.scheduleX64AcquisitionReceiptJson),
    },
    candidate_count: 37,
    key_count: 37,
    candidate_key_sha256: sha256(`${keys.join("\n")}\n`),
    raw_text_distribution: {
      "Some stops have been removed.": rawCount("Some stops have been removed."),
      "Some stops have been removed from this route.":
        rawCount("Some stops have been removed from this route."),
    },
    phase_feed_distribution: phaseFeedDistribution,
    inventory_group_distribution: inventoryGroupDistribution,
    inventory_status_distribution: inventoryStatusDistribution,
    trip_count_method: {
      method_id: "receipt_pinned_exact_route_trip_rows_and_active_service_v1",
      rule:
        "Trip-row count is the exact number of receipt-pinned trips.txt data rows whose route_id " +
        "equals the candidate-side GTFS route ID. Active-trip count further restricts those rows " +
        "to service_ids active on the candidate-side target date under pinned calendar.txt and " +
        "calendar_dates.txt. A routes.txt row alone never establishes inventory coverage.",
      snapshot_inputs: [
        snapshots.phase_1_queens_pre.inputPin,
        snapshots.phase_1_busco_pre.inputPin,
        snapshots.phase_1_queens_post.inputPin,
        snapshots.phase_1_busco_post.inputPin,
      ],
      classification_scope:
        "calendar_resolved_gtfs_trip_presence_not_fully_schedule_classified_revenue",
    },
    publication_version_semantics: {
      accepted_four_feed_launch_inputs: {
        queens_pre: {
          source_id: "gtfs_static_20250615_queens_pre_qbnr",
          zip_sha1: "c96466458c55036cd6feeadc291bf5951d6c3274",
          zip_sha256: snapshots.phase_1_queens_pre.inputPin.zip_sha256,
        },
        queens_post: {
          source_id: "gtfs_static_20250626_queens_post_qbnr",
          zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613",
          zip_sha256: snapshots.phase_1_queens_post.inputPin.zip_sha256,
        },
        busco_pre: {
          source_id: "gtfs_static_20250625_busco_pre_qbnr",
          zip_sha1: "a52f278150cd9bc03082f76fccd57f1c8c331d3c",
          zip_sha256: snapshots.phase_1_busco_pre.inputPin.zip_sha256,
        },
        busco_post: {
          source_id: "gtfs_static_20250626_busco_post_qbnr",
          zip_sha1: "54653b3fafb5fabc5ab1c941780b871343138440",
          zip_sha256: snapshots.phase_1_busco_post.inputPin.zip_sha256,
        },
      },
      launch_published_initial_post: {
        queens: {
          source_id: "gtfs_static_20250626_queens_post_qbnr",
          zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613",
          zip_sha256: snapshots.phase_1_queens_post.inputPin.zip_sha256,
          acceptance_status: "accepted_immutable_bytes",
        },
        busco: {
          source_id: "gtfs_static_20250626_busco_post_qbnr",
          zip_sha1: "54653b3fafb5fabc5ab1c941780b871343138440",
          zip_sha256: snapshots.phase_1_busco_post.inputPin.zip_sha256,
          acceptance_status: "accepted_immutable_bytes",
        },
      },
      first_week_corrections: {
        queens: {
          version_sha1: "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f",
          zip_sha256: null,
          acquisition_status: "full_sha1_observed_bytes_not_accepted",
          metadata_url:
            "https://www.transit.land/feeds/f-dr5x-mtanyctbusqueens/versions/" +
            "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f",
          fetched_at: "2025-06-30T15:46:28.558891Z",
          service_window: { start: "2025-06-28", end: "2025-08-30" },
          route_count: 269,
          stop_count: 1391,
          trip_count: 24721,
          stop_time_count: 652139,
          file_sha1s: {
            calendar_txt: "91183ad2187f37991e266ca1f549774384614726",
            calendar_dates_txt: "2cad2b1716cc4b899bc6a208307131cf44279dd8",
            trips_txt: "08d77fa5c44ba2d052cb8151765f47b13c573848",
            stop_times_txt: "00c4676204737f35524627514a0e11f8f6ad65a7",
            stops_txt: "bd9d9f4d48ae4472d689c3dce8bbcb85421cb475",
          },
          q67_check_status: "blocked_correction_bytes_unavailable",
          acquisition_gap:
            "Transitland exposes the exact full SHA-1 and member identities but historical ZIP " +
            "download requires authenticated archive access; Internet Archive has no matching " +
            "June 30 correction capture. No ZIP SHA-256, calendar expansion, or ordered-stop " +
            "comparison may be claimed until the exact bytes are acquired.",
        },
        busco: {
          version_sha1: "a35da13d0a8c311de05d3558e9e80d2a472c21d2",
          zip_sha256: null,
          acquisition_status: "full_sha1_observed_bytes_not_accepted",
          fetched_at: "2025-07-03",
          service_window: { start: "2025-06-29", end: "2025-08-30" },
          route_count: 92,
          stop_count: 3163,
          trip_count: 28419,
          stop_time_count: 803149,
          file_sha1s: {
            calendar_txt: "05cea37704c833bf6ae2789bc0a92c4b293f51a6",
            calendar_dates_txt: "1630be2890679c5136fe298e811caeba5d90f1d6",
            trips_txt: "486c9a4acccbcaa4f73bbbc9bbd848258c1dad87",
            stop_times_txt: "f714c895c98e82c37bbd37deb6a67abd7bcd7f71",
            stops_txt: "3d77f6acb9d2a0f580c985934acdd58f1322a187",
          },
        },
        authority: "non_authorizing_sensitivity_only",
        correction_sensitive_candidate_route_ids: ["Q67"],
        comparison_model: {
          published_launch_diff: "frozen_from_accepted_launch_bytes",
          corrected_first_week_diff: "pending_exact_correction_bytes_and_candidate_review",
        },
      },
    },
    schedule_trip_type_sensitivity: {
      status: "schedule_corroborated_ordered_stop_correction_pending",
      source_role: "mta_bus_schedules_2025_timepoint_only_validation",
      source_id: "mta_bus_schedules_2025_candidate_windows",
      source_url: "https://data.ny.gov/resource/t4bz-xqa9",
      source_csv_sha256: "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5",
      source_receipt_sha256: "82cc442de9b9c0356965f678c8491a78a093eea8eca06bac29d67747355a58c3",
      q67_filter: {
        schedule_date: "2025-06-30",
        operator: "NYCT",
        route_id: "Q67",
      },
      q67_timepoint_row_count: 723,
      q67_trip_type_distribution: {
        revenue: 615,
        pull_out: 54,
        pull_in: 54,
        deadhead: 0,
      },
      detailed_receipt_path:
        "data/quality/operational-reference/member-extent-risk/plan-040-schedule-trip-type-sensitivity-v1.json",
      detailed_receipt_sha256: sha256(
        `${stableJson(scheduleSensitivity as unknown as JsonValue)}\n`,
      ),
      accepted_exemplar_shape_sensitivity: {
        status: "no_selected_pattern_impact",
        scope: "selected_accepted_pattern_shapes_only",
        unmatched_or_other_shapes: "excluded_reviewed_unresolved",
        accepted_decision_effect: "no_amendment_required",
      },
      interpretation:
        "first_week_operational_service_corroborated_but_full_ordered_stop_chain_unavailable",
      required_exclusions: {
        pull_out_trip_type: 2,
        pull_in_trip_type: 3,
        deadhead_trip_type: 4,
      },
      unmatched_schedule_gtfs_rows: "reviewed_unresolved",
      accepted_exemplar_effect: "no_automatic_invalidation",
      authority: "non_authorizing_sensitivity_only",
    },
    equivalence_policy: {
      accepted_equivalence:
        "identical_stop_id_or_separately_cited_first_party_crosswalk_only",
      name_or_coordinate_inference: false,
    },
    candidates,
    decision_count: 0,
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  JSON.parse(stableJson(manifest as unknown as JsonValue));
  return manifest;
}

export function plan040QbnrAcquisitionReplayHash(
  manifest: Plan040QbnrStopRemovalAcquisitionManifest,
): string {
  return sha256(`${stableJson(manifest as unknown as JsonValue)}\n`);
}
