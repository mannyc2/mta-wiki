import { describe, expect, it } from "bun:test";
import { corpusDescribe } from "../support/local-test-profile";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";
import {
  buildPlan040QbnrStopRemovalAcquisitionManifest,
  plan040QbnrAcquisitionReplayHash,
  validatePlan040QbnrStopRemovalPackage1Acceptance,
} from "../../src/quality/plan040-qbnr-stop-removal-acquisition";

const read = (path: string) => readFileSync(`${repoRoot}/${path}`, "utf8");
const ACQUISITION_TIME_LEDGER_FIXTURE =
  "packages/pipeline/test/quality/fixtures/" +
  "plan040-qbnr-stop-removal-member-extent-ledger-1da72b0c.jsonl";
const ACQUISITION_TIME_LEDGER_SHA256 =
  "18f340c70bc5dcc14382fa86682f5f6099236f4b74af9cca42f7818d77264ebd";

function immutableAcquisitionTimeLedgerJsonl(): string {
  const ledgerJsonl = read(ACQUISITION_TIME_LEDGER_FIXTURE);
  const actualSha256 = createHash("sha256").update(ledgerJsonl).digest("hex");
  if (actualSha256 !== ACQUISITION_TIME_LEDGER_SHA256) {
    throw new Error(
      `Plan 040 Package 1 acquisition-time ledger fixture drifted: ${actualSha256}`,
    );
  }
  return ledgerJsonl;
}

const snapshot = (sourceId: string) => {
  const base = `raw/sources/${sourceId}`;
  return {
    receiptJson: read(`${base}/receipt.json`),
    tripsCsv: read(`${base}/extracted/trips.txt`),
    calendarCsv: read(`${base}/extracted/calendar.txt`),
    calendarDatesCsv: read(`${base}/extracted/calendar_dates.txt`),
  };
};

function currentInputs() {
  return {
    ledgerJsonl: immutableAcquisitionTimeLedgerJsonl(),
    treatmentJsonl: read("data/canonical/treatment_components.jsonl"),
    routeTreatmentScopesJsonl: read("data/exports/releases/v1-rc26/route_treatment_scopes.jsonl"),
    sourceBlocksJsonl: read(
      "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
    ),
    sourceHtml: read("raw/sources/mta_queens_bus_network_redesign_service_changes/source.html"),
    sourceMetadata: JSON.parse(read(
      "raw/sources/mta_queens_bus_network_redesign_service_changes/metadata.json",
    )) as unknown,
    inventorySnapshots: {
      phase_1_queens_pre: snapshot("gtfs_static_20250615_queens_pre_qbnr"),
      phase_1_busco_pre: snapshot("gtfs_static_20250625_busco_pre_qbnr"),
      phase_1_queens_post: snapshot("gtfs_static_20250626_queens_post_qbnr"),
      phase_1_busco_post: snapshot("gtfs_static_20250626_busco_post_qbnr"),
    },
    scheduleSourceMetadataJson: read(
      "raw/sources/mta_bus_schedules_2025_candidate_windows/metadata.json",
    ),
    scheduleSourceAcquisitionReceiptJson: read(
      "raw/sources/mta_bus_schedules_2025_candidate_windows/receipt.json",
    ),
    scheduleX64MetadataJson: read(
      "raw/sources/mta_bus_schedules_2025_x64_predecessor_2026_07_23/metadata.json",
    ),
    scheduleX64AcquisitionReceiptJson: read(
      "raw/sources/mta_bus_schedules_2025_x64_predecessor_2026_07_23/receipt.json",
    ),
    scheduleSensitivityReceipt: JSON.parse(read(
      "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-schedule-trip-type-sensitivity-v1.json",
    )) as unknown,
  };
}

function currentManifest() {
  return buildPlan040QbnrStopRemovalAcquisitionManifest({
    ...currentInputs(),
  });
}

const describeCorpus = corpusDescribe;

describeCorpus("Plan 040 QBNR generic stop-removal acquisition manifest", () => {
  it("freezes exactly 37 denominator keys with exact MTA route blocks and document URLs", () => {
    expect(createHash("sha256")
      .update(immutableAcquisitionTimeLedgerJsonl())
      .digest("hex")).toBe(ACQUISITION_TIME_LEDGER_SHA256);
    const manifest = currentManifest();
    expect(manifest.candidate_count).toBe(37);
    expect(manifest.key_count).toBe(37);
    expect(manifest.decision_count).toBe(0);
    expect(manifest.raw_text_distribution).toEqual({
      "Some stops have been removed.": 23,
      "Some stops have been removed from this route.": 14,
    });
    expect(manifest.candidates.every((candidate) =>
      candidate.official_stop_list_url.startsWith("https://www.mta.info/document/") &&
      candidate.service_change_evidence_id.startsWith(
        "mta_queens_bus_network_redesign_service_changes#",
      ) &&
      candidate.requires_candidate_specific_stop_id_equivalence &&
      !candidate.authorizes_occurrence &&
      !candidate.authorizes_study &&
      !candidate.authorizes_cross_product)).toBe(true);
  });

  it("pins the five special Phase-1 lineages and exact trip-row counts", () => {
    const manifest = currentManifest();
    const byRoute = new Map(manifest.candidates.map((candidate) =>
      [candidate.gtfs_route_id, candidate]));
    expect(byRoute.get("Q26")).toMatchObject({
      pre_feed_family: "queens",
      pre_gtfs_route_id: "Q26",
      pre_trip_row_count: 136,
      post_feed_family: "busco",
      post_gtfs_route_id: "Q26",
      post_trip_row_count: 632,
      inventory_group: "phase_1_operator_transfer_complete",
      inventory_status: "accepted_reused",
    });
    expect(byRoute.get("Q38")).toMatchObject({
      pre_feed_family: "busco",
      pre_gtfs_route_id: "Q38",
      pre_trip_row_count: 437,
      post_feed_family: "queens",
      post_gtfs_route_id: "Q38",
      post_trip_row_count: 456,
      inventory_group: "phase_1_operator_transfer_complete",
      inventory_status: "accepted_reused",
    });
    expect(byRoute.get("Q67")).toMatchObject({
      pre_feed_family: "busco",
      pre_gtfs_route_id: "Q67",
      pre_trip_row_count: 266,
      post_feed_family: "queens",
      post_gtfs_route_id: "Q67",
      post_source_id: null,
      post_inspected_source_id: "gtfs_static_20250626_queens_post_qbnr",
      post_required_acquisition_role:
        "exact_queens_first_week_correction_6db867de2ce30f47ae0ee763f422dc34fb7a9f9f_bytes_for_q67_non_authorizing_sensitivity",
      post_trip_row_count: 0,
      post_active_trip_count: 0,
      inventory_group: "phase_1_operator_transfer_incomplete",
      inventory_status: "incomplete_requires_later_queens_post_inventory",
    });
    expect(byRoute.get("QM63")).toMatchObject({
      pre_feed_family: "queens",
      pre_gtfs_route_id: "X63",
      pre_trip_row_count: 50,
      post_feed_family: "queens",
      post_gtfs_route_id: "QM63",
      post_trip_row_count: 48,
      inventory_group: "phase_1_queens_route_rename",
      inventory_status: "accepted_reused",
    });
    expect(byRoute.get("QM68")).toMatchObject({
      pre_feed_family: "queens",
      pre_gtfs_route_id: "X68",
      pre_trip_row_count: 44,
      post_feed_family: "queens",
      post_gtfs_route_id: "QM68",
      post_trip_row_count: 42,
      inventory_group: "phase_1_queens_route_rename",
      inventory_status: "accepted_reused",
    });
    expect(["Q26", "Q38", "Q67", "QM63", "QM68"].every((routeId) =>
      (byRoute.get(routeId)?.pre_active_trip_count ?? 0) > 0)).toBe(true);
    expect(["Q26", "Q38", "QM63", "QM68"].every((routeId) =>
      (byRoute.get(routeId)?.post_active_trip_count ?? 0) > 0)).toBe(true);
  });

  it("derives aggregate parity and keeps all Phase-2 post inventories unaccepted", () => {
    const manifest = currentManifest();
    expect(manifest.inventory_group_distribution).toEqual({
      phase_1_same_family_busco: 11,
      phase_1_same_family_queens: 9,
      phase_1_queens_route_rename: 2,
      phase_1_operator_transfer_complete: 2,
      phase_1_operator_transfer_incomplete: 1,
      phase_2_busco_pre_only: 12,
    });
    expect(manifest.inventory_status_distribution).toEqual({
      accepted_reused: 24,
      incomplete_requires_later_queens_post_inventory: 1,
      required_not_yet_accepted: 12,
    });
    expect(Object.values(manifest.inventory_group_distribution)
      .reduce((sum, count) => sum + count, 0)).toBe(37);
    const phase2 = manifest.candidates.filter((candidate) =>
      candidate.implementation_phase === "phase_2");
    expect(phase2).toHaveLength(12);
    expect(phase2.every((candidate) =>
      candidate.pre_feed_family === "busco" &&
      candidate.pre_source_id === "gtfs_static_20250626_busco_post_qbnr" &&
      candidate.pre_trip_row_count > 0 &&
      candidate.pre_active_trip_count > 0 &&
      candidate.post_source_id === null &&
      candidate.post_required_acquisition_role?.includes("full_sha1_sha256_provenance") &&
      candidate.inventory_status === "required_not_yet_accepted")).toBe(true);
    expect(manifest.trip_count_method.snapshot_inputs).toHaveLength(4);
    expect(manifest.trip_count_method.snapshot_inputs.every((snapshotInput) =>
      snapshotInput.receipt_sha256.length === 64 &&
      snapshotInput.zip_sha1.length === 40 &&
      snapshotInput.zip_sha256.length === 64 &&
      snapshotInput.trips_txt_sha256.length === 64 &&
      snapshotInput.calendar_txt_sha256.length === 64 &&
      snapshotInput.calendar_dates_txt_sha256.length === 64)).toBe(true);
    expect(manifest.trip_count_method.classification_scope)
      .toBe("calendar_resolved_gtfs_trip_presence_not_fully_schedule_classified_revenue");
    expect(manifest.publication_version_semantics.launch_published_initial_post)
      .toMatchObject({
        queens: {
          zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613",
          acceptance_status: "accepted_immutable_bytes",
        },
        busco: {
          zip_sha1: "54653b3fafb5fabc5ab1c941780b871343138440",
          acceptance_status: "accepted_immutable_bytes",
        },
      });
    expect(manifest.publication_version_semantics.accepted_four_feed_launch_inputs)
      .toMatchObject({
        queens_pre: { zip_sha1: "c96466458c55036cd6feeadc291bf5951d6c3274" },
        queens_post: { zip_sha1: "c868290ddcd79c69712d809ece96d96dbad2c613" },
        busco_pre: { zip_sha1: "a52f278150cd9bc03082f76fccd57f1c8c331d3c" },
        busco_post: { zip_sha1: "54653b3fafb5fabc5ab1c941780b871343138440" },
      });
    expect(manifest.publication_version_semantics.first_week_corrections)
      .toMatchObject({
        queens: {
          version_sha1: "6db867de2ce30f47ae0ee763f422dc34fb7a9f9f",
          zip_sha256: null,
          q67_check_status: "blocked_correction_bytes_unavailable",
        },
        busco: {
          version_sha1: "a35da13d0a8c311de05d3558e9e80d2a472c21d2",
          zip_sha256: null,
          trip_count: 28419,
          stop_time_count: 803149,
        },
        authority: "non_authorizing_sensitivity_only",
        correction_sensitive_candidate_route_ids: ["Q67"],
      });
    expect(manifest.schedule_trip_type_sensitivity).toMatchObject({
      status: "schedule_corroborated_ordered_stop_correction_pending",
      source_csv_sha256: "c592686da8a1cabdc8b559db4d4ae15d5a663adbe08f332e196215fd377be7c5",
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
        "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-schedule-trip-type-sensitivity-v1.json",
      accepted_exemplar_shape_sensitivity: {
        status: "no_selected_pattern_impact",
        scope: "selected_accepted_pattern_shapes_only",
        unmatched_or_other_shapes: "excluded_reviewed_unresolved",
        accepted_decision_effect: "no_amendment_required",
      },
      required_exclusions: {
        pull_out_trip_type: 2,
        pull_in_trip_type: 3,
        deadhead_trip_type: 4,
      },
      unmatched_schedule_gtfs_rows: "reviewed_unresolved",
      authority: "non_authorizing_sensitivity_only",
    });
    expect(manifest.equivalence_policy).toEqual({
      accepted_equivalence: "identical_stop_id_or_separately_cited_first_party_crosswalk_only",
      name_or_coordinate_inference: false,
    });
  });

  it("rejects a previously accepted route when its pinned post trip inventory is zero", () => {
    const inputs = currentInputs();
    const post = inputs.inventorySnapshots.phase_1_queens_post;
    const lines = post.tripsCsv.split("\n");
    const driftedTrips = [
      lines[0],
      ...lines.slice(1).filter((line) => !line.startsWith("Q38,")),
    ].join("\n");
    const receipt = JSON.parse(post.receiptJson) as {
      members: Array<{ member: string; rows: number; sha256: string }>;
    };
    const member = receipt.members.find((value) => value.member === "trips.txt");
    expect(member).toBeDefined();
    member!.rows = driftedTrips.split("\n").filter((line) => line.length > 0).length - 1;
    member!.sha256 = createHash("sha256").update(driftedTrips).digest("hex");
    expect(() => buildPlan040QbnrStopRemovalAcquisitionManifest({
      ...inputs,
      inventorySnapshots: {
        ...inputs.inventorySnapshots,
        phase_1_queens_post: {
          ...post,
          receiptJson: JSON.stringify(receipt),
          tripsCsv: driftedTrips,
        },
      },
    })).toThrow("Q38: Phase-1 post inventory has no trip rows");
  });

  it("fails closed on schedule date, route, operator, trip_type, count, shape, and byte drift", () => {
    const inputs = currentInputs();
    const mutations: Array<(receipt: any) => void> = [
      (receipt) => { receipt.filter.schedule_date = "2025-07-01"; },
      (receipt) => { receipt.filter.route_id = "Q66"; },
      (receipt) => { receipt.filter.operator = "MTA Bus"; },
      (receipt) => { receipt.trip_type_distribution.revenue = 614; },
      (receipt) => { receipt.timepoint_row_count = 722; },
      (receipt) => { receipt.source_csv_sha256 = "0".repeat(64); },
      (receipt) => { receipt.slices[1].selected_shapes[0].shape_id = "Q610999"; },
    ];
    for (const mutate of mutations) {
      const receipt = structuredClone(inputs.scheduleSensitivityReceipt);
      mutate(receipt);
      expect(() => buildPlan040QbnrStopRemovalAcquisitionManifest({
        ...inputs,
        scheduleSensitivityReceipt: receipt,
      })).toThrow();
    }
  });

  it("fails closed when any of the four accepted launch ZIP identities drifts", () => {
    const inputs = currentInputs();
    for (const snapshotKey of [
      "phase_1_queens_pre",
      "phase_1_queens_post",
      "phase_1_busco_pre",
      "phase_1_busco_post",
    ] as const) {
      const snapshotInput = inputs.inventorySnapshots[snapshotKey];
      const receipt = JSON.parse(snapshotInput.receiptJson) as Record<string, unknown>;
      receipt.zip_sha1 = "0".repeat(40);
      expect(() => buildPlan040QbnrStopRemovalAcquisitionManifest({
        ...inputs,
        inventorySnapshots: {
          ...inputs.inventorySnapshots,
          [snapshotKey]: {
            ...snapshotInput,
            receiptJson: JSON.stringify(receipt),
          },
        },
      })).toThrow("one of the four launch feed identities drifted");
    }
  });

  it("pins all derivation inputs and replays to the exact checked-in bytes and key set", () => {
    const first = currentManifest();
    const second = currentManifest();
    expect(plan040QbnrAcquisitionReplayHash(second))
      .toBe(plan040QbnrAcquisitionReplayHash(first));
    expect(Object.values(first.derivation_inputs).every((digest) =>
      /^[0-9a-f]{64}$/u.test(digest))).toBe(true);
    expect(first.source_capture.source_html_sha256).toMatch(/^[0-9a-f]{64}$/u);
    const checkedBytes = read(
      "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-qbnr-stop-removal-acquisition-manifest-v1.json",
    );
    expect(checkedBytes).toBe(`${stableJson(first as unknown as JsonValue)}\n`);
    expect(first.candidate_key_sha256)
      .toBe("0a9896feebea7617c745ab62492ad3cc66c2727eed6689eff0e70e3f2b01bf7e");
    expect(plan040QbnrAcquisitionReplayHash(first))
      .toBe("43a17a230eb70e9b7c322d2125b0db99910f035e688652624d4ce0e97a08a1d4");
    expect(createHash("sha256").update(checkedBytes).digest("hex"))
      .toBe("43a17a230eb70e9b7c322d2125b0db99910f035e688652624d4ce0e97a08a1d4");
    const sensitivityBytes = read(
      "data/quality/operational-reference/member-extent-risk/" +
        "plan-040-schedule-trip-type-sensitivity-v1.json",
    );
    expect(createHash("sha256").update(sensitivityBytes).digest("hex"))
      .toBe("b0fb4cacab4d3c9460684841792253ae360183a635484c5efcef17599366dd7b");
  });

  it("binds dual approval and owner acceptance to Package 1 evidence acquisition only", () => {
    const acceptanceInputs = {
      manifestJson: read(
        "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-qbnr-stop-removal-acquisition-manifest-v1.json",
      ),
      scheduleSensitivityJson: read(
        "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-schedule-trip-type-sensitivity-v1.json",
      ),
      gateJson: read(
        "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-qbnr-stop-removal-package-1-dual-review-gate-v1.json",
      ),
      ownerAcceptanceJson: read(
        "data/quality/operational-reference/member-extent-risk/" +
          "plan-040-qbnr-stop-removal-package-1-owner-acceptance-v1.json",
      ),
    };
    expect(validatePlan040QbnrStopRemovalPackage1Acceptance(acceptanceInputs)).toEqual({
      gate_sha256: "f1bac2d3c05e844cd3a880c1a2441f27b69702262dc36fd242382aac6137891c",
      owner_acceptance_sha256:
        "ec2085023d53fda66072b34bc612249f33d02a23a8d4636d1671cca9168f1cd1",
    });

    const overAuthorized = JSON.parse(acceptanceInputs.ownerAcceptanceJson) as Record<
      string,
      unknown
    >;
    overAuthorized.authorizes_decision_persistence = true;
    expect(() => validatePlan040QbnrStopRemovalPackage1Acceptance({
      ...acceptanceInputs,
      ownerAcceptanceJson: JSON.stringify(overAuthorized),
    })).toThrow("stale or over-authorizing");
  });

  it("fails closed on denominator, URL, and source-byte drift", () => {
    const inputs = currentInputs();
    const sourceHtml = read(
      "raw/sources/mta_queens_bus_network_redesign_service_changes/source.html",
    );
    const metadata = JSON.parse(read(
      "raw/sources/mta_queens_bus_network_redesign_service_changes/metadata.json",
    )) as Record<string, unknown>;
    expect(() => buildPlan040QbnrStopRemovalAcquisitionManifest({
      ...inputs,
      ledgerJsonl: inputs.ledgerJsonl
        .split("\n")
        .filter((line) => !line.includes("\"treatment_record_id\":\"treatment_q27-stop-removal-2025\""))
        .join("\n"),
      sourceHtml,
      sourceMetadata: metadata,
    })).toThrow("expected exact 37-key package");

    const driftedHtml = sourceHtml.replace(
      /https:\\\/\\\/www\.mta\.info\\\/document\\\/81901/u,
      "https:\\/\\/example.test\\/not-mta",
    );
    expect(() => buildPlan040QbnrStopRemovalAcquisitionManifest({
      ...inputs,
      sourceHtml: driftedHtml,
      sourceMetadata: {
        ...metadata,
        sha256: `sha256:${createHash("sha256").update(driftedHtml).digest("hex")}`,
      },
    })).toThrow("first-party MTA document URL");
  });
});
