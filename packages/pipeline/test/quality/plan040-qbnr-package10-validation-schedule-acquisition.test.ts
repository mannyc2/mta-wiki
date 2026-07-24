import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { parseCsv } from "../../../db/src/import-gtfs";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";
import { BUS_SCHEDULE_COLUMNS } from "../../src/reference/bus-schedules";

const SOURCE_ID =
  "mta_bus_schedules_2025_plan040_p10_validation_2026_07_24";
const SOURCE_ROOT = `${repoRoot}/raw/sources/${SOURCE_ID}`;
const DURABLE_RECEIPT =
  `${repoRoot}/data/quality/acquisition/receipts/` +
  "plan-040-qbnr-package-10-validation-schedules-v1.json";
const SOURCE_SHA256 =
  "af9e368d93c8fe879e1cd42145ff116a815a6e9464436bb1244fa350c9ffb1fa";
const METADATA_SHA256 =
  "65275876ca77f10619768bd4a334fc5138869aec3d7024c85710999d3ba1e87b";
const BLOCKS_SHA256 =
  "bbaa8fc50ce2598e7e00b97dd7ecdb8c4400ecf3d43168cfd09fc3fe95cbdbde";
const RECEIPT_SHA256 =
  "f40140d24c7edeef113a793982b376f603957f6922d9b94137f3679acf12f0e0";

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

const receipt = () =>
  JSON.parse(readFileSync(DURABLE_RECEIPT, "utf8")) as {
    source_id: string;
    authorizes_occurrence: boolean;
    authorizes_study: boolean;
    authorizes_cross_product: boolean;
    authorizes_member_extent_or_grain_decision: boolean;
    row_count: number;
    route_row_counts: Record<string, number>;
    input_artifacts: Record<
      string,
      { path: string; bytes: number; sha256: string }
    >;
    output_artifacts: {
      source_csv: {
        path: string;
        bytes: number;
        row_count: number;
        sha256: string;
      };
      metadata: { path: string; bytes: number; sha256: string };
      blocks: {
        path: string;
        bytes: number;
        block_count: number;
        sha256: string;
      };
    };
    extraction: {
      duckdb_version: string;
      input_schema: {
        column_count: number;
        output_columns: string[];
        source_columns: string[];
      };
      query: string;
      where: string;
      order_by: string;
      row_selection_uses_trip_type: boolean;
      row_exclusion_count: number;
      requested_slices_exhaustive: boolean;
    };
    schedule_slices: Array<{
      schedule_date: string;
      route_id: string;
      operator: string;
      row_count: number;
      trip_type_rows: Record<string, number>;
      passenger_shape_ids: string[];
      shape_trip_type_rows: Array<{
        shape_id: string;
        trip_type: string;
        row_count: number;
      }>;
    }>;
    trip_type_preservation: {
      passenger_diagnostic_policy: string;
      classification_is_downstream_only: boolean;
      extraction_includes_every_trip_type: boolean;
      shape_trip_type_counts_pinned: boolean;
    };
  };

describe("Plan 040 Package 10 local validation-schedule acquisition", () => {
  it("pins the authoritative partition, manifest, and both metadata captures", () => {
    const value = receipt();
    expect(sha256(readFileSync(DURABLE_RECEIPT))).toBe(RECEIPT_SHA256);
    expect(value.input_artifacts).toEqual({
      partition: {
        path:
          "/mnt/models/dev/bus-reliability-tracker/data/raw/" +
          "socrata-partitioned/bus_schedules_2025/schedule-2025/chunks/" +
          "schedule_date-2025-06-01-to-2025-07-01/rows.csv",
        bytes: 2_560_376_947,
        sha256:
          "03f9b289512658133225bbda03aad00ceb5a405aa4ae24a50a39dd11b8a8df55",
      },
      partition_manifest: {
        path:
          "/mnt/models/dev/bus-reliability-tracker/data/raw/" +
          "socrata-partitioned/bus_schedules_2025/schedule-2025/" +
          "partition-manifest.json",
        bytes: 5_183,
        sha256:
          "23df32e0d6b7d744cf3076f8a1535ca06bfc4d724000465b779607bbe403adb0",
      },
      source_metadata: {
        path:
          "/mnt/models/dev/bus-reliability-tracker/knowledge/raw/metadata/" +
          "bus_schedules_2025.json",
        bytes: 99_859,
        sha256:
          "14fb6e55305fe15aa9a79301ebdcbf44097cb8958c5716514b22952856b12cba",
      },
      dataset_metadata: {
        path:
          "/mnt/models/dev/bus-reliability-tracker/knowledge/raw/metadata/" +
          "t4bz-xqa9.json",
        bytes: 50_016,
        sha256:
          "4546d6e11a7014cfe0463fb1f18f31a4927a73bccf2e09b127d5b0d22af6c7cc",
      },
    });
  });

  it("pins the official 25-column query and excludes no selected source rows", () => {
    const value = receipt();
    expect(value.extraction.input_schema.column_count).toBe(25);
    expect(value.extraction.input_schema.output_columns).toEqual([
      ...BUS_SCHEDULE_COLUMNS,
    ]);
    expect(value.extraction.input_schema.source_columns).toEqual([
      "Schedule Day",
      "Day Type",
      "Borough",
      "Operator",
      "Service ID",
      "Direction",
      "Shape ID",
      "Trip Type",
      "Route ID",
      "Stop Sequence",
      "Stop ID",
      "Stop Name",
      "Schedule Time",
      "Origin",
      "Destination",
      "School",
      "Revenue Stop",
      "Timepoint",
      "Boarding",
      "Alighting",
      "Distance from Start",
      "Trip Headsign",
      "Block ID",
      "Depot Code",
      "Bundle",
    ]);
    expect(value.extraction.where).toBe(
      `(("Schedule Day" = '06/27/2025' AND ` +
        `"Route ID" IN ('Q20A','Q20B')) OR ` +
        `("Schedule Day" = '06/29/2025' AND ` +
        `"Route ID" IN ('Q14','Q90','Q98')))`,
    );
    expect(value.extraction.order_by).toBe(
      "schedule_date, route_id, direction, service_id, block_id, shape_id, " +
        "CAST(stop_sequence AS INTEGER), schedule_time, stop_id",
    );
    expect(value.extraction.query).toContain(
      `FROM read_csv('/mnt/models/dev/bus-reliability-tracker/data/raw/` +
        "socrata-partitioned/bus_schedules_2025/schedule-2025/chunks/" +
        "schedule_date-2025-06-01-to-2025-07-01/rows.csv', " +
        "header=true, all_varchar=true)",
    );
    expect(value.extraction.duckdb_version)
      .toBe("v1.5.2 (Variegata) 8a5851971f");
    expect(value.extraction.row_selection_uses_trip_type).toBe(false);
    expect(value.extraction.row_exclusion_count).toBe(0);
    expect(value.extraction.requested_slices_exhaustive).toBe(true);
  });

  it("stages exact source, metadata, blocks, and matching raw receipt bytes", () => {
    const value = receipt();
    const source = readFileSync(`${SOURCE_ROOT}/source.csv`);
    const metadata = readFileSync(`${SOURCE_ROOT}/metadata.json`);
    const blocks = readFileSync(`${SOURCE_ROOT}/blocks.jsonl`);
    const rawReceipt = readFileSync(`${SOURCE_ROOT}/receipt.json`);
    const durableReceipt = readFileSync(DURABLE_RECEIPT);
    expect(source.byteLength).toBe(890_047);
    expect(sha256(source)).toBe(SOURCE_SHA256);
    expect(sha256(metadata)).toBe(METADATA_SHA256);
    expect(sha256(blocks)).toBe(BLOCKS_SHA256);
    expect(sha256(rawReceipt)).toBe(RECEIPT_SHA256);
    expect(rawReceipt.equals(durableReceipt)).toBe(true);
    expect(value.output_artifacts).toEqual({
      source_csv: {
        path: `raw/sources/${SOURCE_ID}/source.csv`,
        bytes: 890_047,
        row_count: 3_727,
        sha256: SOURCE_SHA256,
      },
      metadata: {
        path: `raw/sources/${SOURCE_ID}/metadata.json`,
        bytes: 496,
        sha256: METADATA_SHA256,
      },
      blocks: {
        path: `raw/sources/${SOURCE_ID}/blocks.jsonl`,
        bytes: 2_712,
        block_count: 4,
        sha256: BLOCKS_SHA256,
      },
    });
  });

  it("preserves all 3,727 rows and exact trip-type and passenger-shape diagnostics", () => {
    const value = receipt();
    expect(value.source_id).toBe(SOURCE_ID);
    expect(value.row_count).toBe(3_727);
    expect(value.route_row_counts).toEqual({
      Q14: 844,
      Q20A: 1_032,
      Q20B: 845,
      Q90: 358,
      Q98: 648,
    });
    expect(value.schedule_slices.map((slice) => ({
      schedule_date: slice.schedule_date,
      route_id: slice.route_id,
      row_count: slice.row_count,
      trip_type_rows: slice.trip_type_rows,
      passenger_shape_ids: slice.passenger_shape_ids,
    }))).toEqual([
      {
        schedule_date: "2025-06-27",
        route_id: "Q20A",
        row_count: 1_032,
        trip_type_rows: { "1": 946, "2": 40, "3": 44, "4": 2 },
        passenger_shape_ids: ["Q20A0071", "Q20A0087"],
      },
      {
        schedule_date: "2025-06-27",
        route_id: "Q20B",
        row_count: 845,
        trip_type_rows: { "1": 773, "2": 38, "3": 34 },
        passenger_shape_ids: ["Q20B0057", "Q20B0068"],
      },
      {
        schedule_date: "2025-06-29",
        route_id: "Q14",
        row_count: 844,
        trip_type_rows: { "1": 680, "2": 82, "3": 82 },
        passenger_shape_ids: ["Q140008", "Q140009"],
      },
      {
        schedule_date: "2025-06-29",
        route_id: "Q90",
        row_count: 358,
        trip_type_rows: { "12": 338, "2": 10, "3": 10 },
        passenger_shape_ids: ["Q901243", "Q901247", "Q901249"],
      },
      {
        schedule_date: "2025-06-29",
        route_id: "Q98",
        row_count: 648,
        trip_type_rows: { "12": 512, "2": 68, "3": 68 },
        passenger_shape_ids: ["Q980041", "Q980045"],
      },
    ]);
    expect(value.schedule_slices.every((slice) =>
      slice.operator === "NYCT" &&
      slice.shape_trip_type_rows.reduce(
          (sum, group) => sum + group.row_count,
          0,
        ) === slice.row_count
    )).toBe(true);
    expect(value.trip_type_preservation).toEqual({
      passenger_diagnostic_policy: "any_trip_type_except_2_3_4",
      classification_is_downstream_only: true,
      extraction_includes_every_trip_type: true,
      shape_trip_type_counts_pinned: true,
    });
  });

  it("keeps the acquisition wholly nonauthorizing", () => {
    const value = receipt();
    expect({
      authorizes_occurrence: value.authorizes_occurrence,
      authorizes_study: value.authorizes_study,
      authorizes_cross_product: value.authorizes_cross_product,
      authorizes_member_extent_or_grain_decision:
        value.authorizes_member_extent_or_grain_decision,
    }).toEqual({
      authorizes_occurrence: false,
      authorizes_study: false,
      authorizes_cross_product: false,
      authorizes_member_extent_or_grain_decision: false,
    });

    const rows = parseCsv(readFileSync(`${SOURCE_ROOT}/source.csv`, "utf8"));
    expect(rows.shift()).toEqual([...BUS_SCHEDULE_COLUMNS]);
    expect(rows).toHaveLength(3_727);
    expect(stableJson(
      [...new Set(rows.map((cells) => cells[8]))].sort() as unknown as JsonValue,
    )).toBe(stableJson(
      ["Q14", "Q20A", "Q20B", "Q90", "Q98"] as unknown as JsonValue,
    ));
  });
});
