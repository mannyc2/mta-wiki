import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { repoRoot } from "../../../core/src/paths";
import { stableJson } from "../../../db/src/stable-json";
import type { JsonValue } from "../../../db/src/types";
import type {
  MemberExtentLedgerRow,
  MemberGrainLedgerRow,
} from "../../src/quality/member-extent-ledger";
import {
  PLAN040_PACKAGE_10B_CANDIDATES,
  PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
  PLAN040_PACKAGE_10B_EXCLUSION_HASHES,
  PLAN040_PACKAGE_10B_PATTERN_IDS,
  PLAN040_PACKAGE_10B_POST_10A_PINS,
  buildPlan040Package10bDraft,
  plan040Package10bReplayHash,
  type Plan040Package10bCandidateEvidence,
  type Plan040Package10bDraft,
  type Plan040Package10bExclusion,
  type Plan040Package10bPreservedPackage8,
} from "../../src/quality/plan040-qbnr-service-pattern-package10b";
import type { Plan040Package8VersionSeparation } from
  "../../src/quality/plan040-qbnr-service-pattern-package8";

const riskRoot =
  `${repoRoot}/data/quality/operational-reference/member-extent-risk`;
const evidencePath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-10b-evidence-v1.json`;
const draftPath =
  `${riskRoot}/plan-040-qbnr-service-pattern-package-10b-evidence-draft-v1.json`;
const EVIDENCE_SHA256 =
  "3f2a59a5fbf93bd49a0124483d2bb3af8baa3218868fc0f92ccc1ddabf8385f8";
const DRAFT_SHA256 =
  "5fc0a7330bd9a8a78e118d2afd3cd5f45eec8a81255224cf32906e21088414c3";

type Package10bEvidence = {
  candidate_count: 4;
  route_count: 2;
  candidate_key_sha256: string;
  candidates: Plan040Package10bCandidateEvidence[];
  exclusions: Plan040Package10bExclusion[];
  prior_package_overlap_count: 0;
  preserved_package_8_predecessor_rows: Plan040Package10bPreservedPackage8;
  immutable_inputs: {
    post_10a_pins: typeof PLAN040_PACKAGE_10B_POST_10A_PINS;
    source_artifacts: Record<string, { path: string; sha256: string }>;
  };
  version_separation: Plan040Package8VersionSeparation;
  evidence_verdict_distribution: {
    positive_extent_and_grain_proposed: 3;
    receipt_terminal_unresolved_preserved: 1;
  };
  proposed_extent_distribution: {
    route_wide: 1;
    bounded_segment: 2;
    unresolved: 1;
  };
  proposed_grain_distribution: {
    trip_subset: 3;
    unresolved: 1;
  };
  authorization_state: string;
  proposed_extent_decision_count: 3;
  proposed_grain_decision_count: 3;
  persisted_extent_decision_count: 0;
  persisted_grain_decision_count: 0;
  external_acquisition_performed: false;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_decision_persistence: false;
};

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");
const sortedHash = (values: readonly string[]): string =>
  sha256(`${[...values].sort().join("\n")}\n`);
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const readJsonl = <T>(path: string): T[] =>
  readFileSync(path, "utf8").trim().split("\n")
    .filter(Boolean).map((line) => JSON.parse(line) as T);
const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const inputFor = (
  evidence: Package10bEvidence,
  candidates = evidence.candidates,
  exclusions = evidence.exclusions,
  preservedPackage8 = evidence.preserved_package_8_predecessor_rows,
) => ({
  evidenceManifestPath:
    "data/quality/operational-reference/member-extent-risk/" +
    "plan-040-qbnr-service-pattern-package-10b-evidence-v1.json",
  evidenceManifestSha256: EVIDENCE_SHA256,
  candidates,
  exclusions,
  preservedPackage8,
  priorCandidateKeys: [] as string[],
  versionSeparation: evidence.version_separation,
});

type CsvRow = Record<string, string>;
const csvRows = (path: string): CsvRow[] => {
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/u);
  const fields = lines.shift()!.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(fields.map((field, index) => [
      field,
      values[index] ?? "",
    ]));
  });
};

const activeServiceIds = (
  root: string,
  date: string,
  weekday: string,
): string[] => {
  const calendar = csvRows(`${root}/calendar.txt`);
  const exceptions = csvRows(`${root}/calendar_dates.txt`);
  const active = new Set(calendar.filter((row) =>
    row[weekday] === "1" &&
    row.start_date! <= date &&
    row.end_date! >= date
  ).map((row) => row.service_id!));
  for (const row of exceptions.filter((row) => row.date === date)) {
    if (row.exception_type === "1") active.add(row.service_id!);
    if (row.exception_type === "2") active.delete(row.service_id!);
  }
  return [...active].sort();
};

const routeInventory = (
  root: string,
  routeId: string,
  date: string,
  weekday: string,
) => {
  const services = activeServiceIds(root, date, weekday);
  const trips = csvRows(`${root}/trips.txt`).filter((row) =>
    row.route_id === routeId && services.includes(row.service_id!)
  );
  return {
    services,
    trips,
    directionCounts: Object.fromEntries(["0", "1"].map((direction) => [
      direction,
      trips.filter((row) => row.direction_id === direction).length,
    ])),
    shapes: [...new Set(trips.map((row) => row.shape_id!))].sort(),
  };
};

const scheduleSlices = async () => {
  const target = new Map([
    ["2025-06-29T00:00:00.000\0Q82", [] as string[][]],
    ["2025-06-29T00:00:00.000\0Q89", [] as string[][]],
    ["2025-06-28T00:00:00.000\0Q110", [] as string[][]],
    ["2025-06-28T00:00:00.000\0Q36", [] as string[][]],
  ]);
  const path =
    `${repoRoot}/raw/sources/mta_bus_schedules_2025_candidate_windows/source.csv`;
  const hasher = createHash("sha256");
  const reader = Bun.file(path).stream().getReader();
  const decoder = new TextDecoder();
  let carry = "";
  let headerSeen = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value);
    const text = carry + decoder.decode(value, { stream: true });
    const lines = text.split("\n");
    carry = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.replace(/\r$/u, "");
      if (!headerSeen) {
        headerSeen = true;
        continue;
      }
      const values = line.split(",");
      target.get(`${values[0]}\0${values[8]}`)?.push(values);
    }
  }
  const tail = (carry + decoder.decode()).replace(/\r$/u, "");
  if (tail) {
    const values = tail.split(",");
    target.get(`${values[0]}\0${values[8]}`)?.push(values);
  }
  return { sha256: hasher.digest("hex"), target };
};

describe("Plan 040 QBNR Package 10B mixed-risk evidence freeze", () => {
  it("freezes the exact four-key scope and deterministically rebuilds the draft", () => {
    const evidenceBytes = readFileSync(evidencePath);
    const draftBytes = readFileSync(draftPath);
    const evidence = JSON.parse(
      evidenceBytes.toString("utf8"),
    ) as Package10bEvidence;
    const draft = JSON.parse(
      draftBytes.toString("utf8"),
    ) as Plan040Package10bDraft;
    expect(sha256(evidenceBytes)).toBe(EVIDENCE_SHA256);
    expect(sha256(draftBytes)).toBe(DRAFT_SHA256);
    expect(plan040Package10bReplayHash(
      draft as unknown as JsonValue,
    )).toBe(DRAFT_SHA256);
    expect(evidence.candidate_count).toBe(4);
    expect(evidence.route_count).toBe(2);
    expect(evidence.candidate_key_sha256).toBe(
      PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256,
    );
    expect(sortedHash(evidence.candidates.map((row) =>
      row.candidate_key))).toBe(PLAN040_PACKAGE_10B_CANDIDATE_KEY_SHA256);
    expect(evidence.candidates.map((candidate) => [
      candidate.gtfs_route_id,
      candidate.treatment_record_id,
    ])).toEqual(PLAN040_PACKAGE_10B_CANDIDATES);
    const rebuilt = buildPlan040Package10bDraft(inputFor(evidence));
    expect(rebuilt).toEqual(draft);
    expect(plan040Package10bReplayHash(
      rebuilt as unknown as JsonValue,
    )).toBe(DRAFT_SHA256);
  });

  it("pins the accepted source, feed, schedule, and prior-ledger bytes", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    for (const [name, artifact] of Object.entries(
      evidence.immutable_inputs.source_artifacts,
    )) {
      if (name === "schedule_csv") continue;
      expect(sha256(readFileSync(`${repoRoot}/${artifact.path}`))).toBe(
        artifact.sha256,
      );
    }
    expect(sha256(readFileSync(
      `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`,
    ))).toBe(PLAN040_PACKAGE_10B_POST_10A_PINS.extent_ledger);
    expect(sha256(readFileSync(
      `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`,
    ))).toBe(PLAN040_PACKAGE_10B_POST_10A_PINS.grain_ledger);
    const blocks = readJsonl<{
      block_id: string;
      raw_text_sha256: string;
      raw_text: string;
    }>(
      `${repoRoot}/raw/sources/` +
        "mta_queens_bus_network_redesign_service_changes/blocks.jsonl",
    );
    expect(blocks.find((row) => row.block_id === "p001_b0079")).toEqual(
      expect.objectContaining({
        raw_text_sha256:
          "sha256:b0ab037f3bdf260561c984b18c873bfa743e84c64c2cf0df8d9834403b1100c4",
        raw_text: expect.stringContaining(
          "replacing Q110 service on Hempstead Av and Q36 service on 212 St/212 Pl.",
        ),
      }),
    );
    expect(blocks.find((row) => row.block_id === "p001_b0086")).toEqual(
      expect.objectContaining({
        raw_text_sha256:
          "sha256:0ce6db6806027c9aad26d3da3cd566c85b3986127ed6984db62927bb55a25eec",
        raw_text: expect.stringContaining(
          "replace the existing Q85 Green Acres branch",
        ),
      }),
    );
  });

  it("recomputes accepted initial GTFS inventories and exact Q82 chains", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    const queensPost =
      `${repoRoot}/raw/sources/gtfs_static_20250626_queens_post_qbnr/extracted`;
    const q82 = routeInventory(queensPost, "Q82", "20250629", "sunday");
    const q89 = routeInventory(queensPost, "Q89", "20250629", "sunday");
    expect(sortedHash(q82.services)).toBe(
      "813619a6d363ab72fdd0cb45bfd96d6606349584e15854b0978a7a55631f78fd",
    );
    expect(q82.trips).toHaveLength(102);
    expect(q82.directionCounts).toEqual({ "0": 51, "1": 51 });
    expect(q82.shapes).toEqual(["Q820026", "Q820032"]);
    expect(sortedHash(q82.trips.map((row) => row.trip_id!))).toBe(
      "f199027fee425aa9c72bda60e8a29afdcbc496ba72b86b0f88a66670555f59e2",
    );
    expect(q89.trips).toHaveLength(78);
    expect(q89.shapes).toEqual(["Q890011", "Q890016"]);

    const q82Candidate = evidence.candidates[0]!;
    const accepted = q82Candidate.accepted_evidence as {
      full_stop_chains: Array<{
        direction_id: string;
        shape_id: string;
        trip_count: number;
        trip_id_sha256: string;
        stop_ids: string[];
        stop_chain_sha256: string;
        pattern_id: string;
      }>;
    };
    const activeTripIds = new Set(q82.trips.map((row) => row.trip_id!));
    const stopTimes = csvRows(`${queensPost}/stop_times.txt`).filter((row) =>
      activeTripIds.has(row.trip_id!)
    );
    for (const chain of accepted.full_stop_chains) {
      const trips = q82.trips.filter((row) => row.shape_id === chain.shape_id);
      const exemplar = trips[0]!.trip_id!;
      const stops = stopTimes.filter((row) => row.trip_id === exemplar)
        .sort((left, right) =>
          Number(left.stop_sequence) - Number(right.stop_sequence))
        .map((row) => row.stop_id!);
      expect(trips).toHaveLength(chain.trip_count);
      expect(sortedHash(trips.map((row) => row.trip_id!))).toBe(
        chain.trip_id_sha256,
      );
      expect(stops).toEqual(chain.stop_ids);
      expect(sha256(`${stops.join("\n")}\n`)).toBe(
        chain.stop_chain_sha256,
      );
      expect(chain.pattern_id).toBe(
        PLAN040_PACKAGE_10B_PATTERN_IDS[
          chain.direction_id === "0" ? "direction_0" : "direction_1"
        ],
      );
    }
  });

  it("recomputes the four exact schedule slices and passenger shape sets", async () => {
    const { sha256: sourceSha, target } = await scheduleSlices();
    expect(sourceSha).toBe(PLAN040_PACKAGE_10B_POST_10A_PINS.schedule_csv);
    const expected = {
      "2025-06-29T00:00:00.000\0Q82": [
        578,
        { "1": 510, "2": 34, "3": 34 },
        ["Q820026", "Q820032"],
      ],
      "2025-06-29T00:00:00.000\0Q89": [
        669,
        null,
        ["Q890020", "Q890021"],
      ],
      "2025-06-28T00:00:00.000\0Q110": [
        1166,
        null,
        ["Q1100159", "Q1100175"],
      ],
      "2025-06-28T00:00:00.000\0Q36": [
        1277,
        null,
        ["Q360175", "Q360181"],
      ],
    } as const;
    for (const [key, [count, types, passengerShapes]] of Object.entries(
      expected,
    )) {
      const rows = target.get(key)!;
      expect(rows).toHaveLength(count);
      if (types) {
        expect(Object.fromEntries(
          [...new Set(rows.map((row) => row[7]!))].sort().map((type) => [
            type,
            rows.filter((row) => row[7] === type).length,
          ]),
        )).toEqual(types);
      }
      expect([...new Set(rows.filter((row) =>
        !["2", "3", "4"].includes(row[7]!)).map((row) => row[6]!))]
        .sort()).toEqual(passengerShapes);
    }
  }, 30_000);

  it("proposes one route-wide and two bounded Q82 decisions without identifier inference", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    const q82 = evidence.candidates.filter((candidate) =>
      candidate.gtfs_route_id === "Q82"
    );
    expect(q82.map((candidate) =>
      candidate.proposed_extent_decision!.resolution)).toEqual([
      "route_wide",
      "bounded_segment",
      "bounded_segment",
    ]);
    for (const candidate of q82) {
      const grain = candidate.proposed_grain_decision!;
      expect(grain.service_scope).toEqual({
        kind: "trip_subset",
        periods: ["weekend"],
        directions: ["0", "1"],
        pattern_ids: Object.values(PLAN040_PACKAGE_10B_PATTERN_IDS).sort(),
        description:
          "Only the exact accepted initial-post Q82 passenger patterns on the implementation-date weekend slice.",
      });
      expect(candidate.persisted_extent_decision).toBeNull();
      expect(candidate.persisted_grain_decision).toBeNull();
    }
    expect(q82[0]!.proposed_grain_decision!.lineage_segments).toEqual([]);
    expect(q82[1]!.proposed_grain_decision!.lineage_segments).toEqual([
      {
        predecessor_gtfs_route_id: "Q110",
        successor_gtfs_route_id: "Q82",
        direction: "0",
        boundary_stop_ids: ["500122", "552248"],
        shared_stop_ids: ["500122", "505131", "552248", "552249"],
      },
      {
        predecessor_gtfs_route_id: "Q110",
        successor_gtfs_route_id: "Q82",
        direction: "1",
        boundary_stop_ids: ["500123", "552252"],
        shared_stop_ids: ["500123", "500125", "552252"],
      },
    ]);
    const rejected = q82.flatMap((candidate) =>
      (candidate.accepted_evidence as {
        rejected_identifier_inferences: string[];
      }).rejected_identifier_inferences);
    expect(rejected).toContain(
      "500120_or_500121_is_not_equivalent_to_701055",
    );
    expect(rejected).toContain("552250_is_not_equivalent_to_552727");
    expect(rejected).toContain("500071_is_not_equivalent_to_500072");
    expect(rejected).toContain("skipped_local_stops_are_not_inferred");
  });

  it("preserves Q89 and the accepted P8 Q110/Q36 absence rows exactly", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    const q89 = evidence.candidates[3]!;
    expect(q89.prior_ledger_state.extent_row).toEqual(
      readJsonl<MemberExtentLedgerRow>(
        `${repoRoot}/data/quality/operational-reference/member-extent-ledger.jsonl`,
      ).find((row) =>
        row.treatment_record_id === q89.treatment_record_id),
    );
    expect(q89.prior_ledger_state.grain_row).toEqual(
      readJsonl<MemberGrainLedgerRow>(
        `${repoRoot}/data/quality/operational-reference/member-grain-ledger.jsonl`,
      ).find((row) =>
        row.treatment_record_id === q89.treatment_record_id),
    );
    expect(q89.prior_ledger_state.extent_row).toEqual(
      expect.objectContaining({
        ledger_id: "member-extent-ledger:06d3feaca1f812078748a979",
        packet_id: "study-readiness-review:ea9e0f1db4ffbcd5d34356ed",
        current_extent_kind: "unresolved",
      }),
    );
    expect(q89.prior_ledger_state.grain_row).toEqual(
      expect.objectContaining({
        ledger_id: "member-grain-ledger:06d3feaca1f812078748a979",
        member_extent_decision_id:
          "member-extent-review:53b053d72d04f18923d31522",
        service_scope: null,
        lineage_segments: [],
      }),
    );
    expect(q89.proposed_extent_decision).toBeNull();
    expect(q89.proposed_grain_decision).toBeNull();
    expect(q89.unresolved_gap_codes).toEqual([
      "bounded_scope_identity_missing",
      "prior_reviewed_member_extent_unresolved_preserved",
      "post_schedule_gtfs_shape_identity_mismatch",
      "initial_shape_mismatch_may_be_correction_sensitive",
      "corrected_first_week_diff_blocked_not_run",
      "candidate_specific_service_detail_not_staged",
      "candidate_specific_schedule_or_timetable_not_staged",
      "candidate_scope_not_bound_to_exact_versioned_member_extent",
    ]);

    const preserved = evidence.preserved_package_8_predecessor_rows;
    expect(sha256(readFileSync(
      `${repoRoot}/${preserved.evidence_artifact.path}`,
    ))).toBe(preserved.evidence_artifact.sha256);
    expect(sha256(readFileSync(
      `${repoRoot}/${preserved.absence_receipt.path}`,
    ))).toBe(preserved.absence_receipt.sha256);
    expect(preserved.predecessor_context_changes_rows).toBe(false);
    expect([...preserved.extent_rows, ...preserved.grain_rows].every((row) =>
      row.verdict === "absent_in_source" &&
      row.receipt_ids[0] ===
        "plan-040-qbnr-service-pattern-package-8-reviewed-absence-v1"
    )).toBe(true);
  });

  it("pins all exclusions, comparison roles, and draft-only authority", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);
    const draft = readJson<Plan040Package10bDraft>(draftPath);
    expect(Object.fromEntries(evidence.exclusions.map((row) => [
      row.scope_id,
      row.candidate_key_sha256,
    ]))).toEqual(PLAN040_PACKAGE_10B_EXCLUSION_HASHES);
    expect(evidence.exclusions.every((row) =>
      row.overlap_count === 0 &&
      sortedHash(row.candidate_keys) === row.candidate_key_sha256
    )).toBe(true);
    expect(evidence.version_separation.published_launch_diff).toEqual(
      expect.objectContaining({
        status: "completed_from_accepted_initial_feed_bytes",
        comparison_role: "published_launch_diff",
        correction_bytes_used: false,
        correction_version_sha1s_used: [],
      }),
    );
    expect(evidence.version_separation.corrected_first_week_diff).toEqual(
      expect.objectContaining({
        status: "blocked_not_run",
        comparison_role: "corrected_first_week_diff",
        comparison_run: false,
        correction_bytes_used: false,
        corrected_diff_used: false,
        published_launch_outcomes_reclassified: false,
      }),
    );
    expect(draft.evidence_verdict_distribution).toEqual({
      positive_extent_and_grain_proposed: 3,
      receipt_terminal_unresolved_preserved: 1,
    });
    expect(draft.proposed_extent_distribution).toEqual({
      route_wide: 1,
      bounded_segment: 2,
      unresolved: 1,
    });
    expect(draft.proposed_grain_distribution).toEqual({
      trip_subset: 3,
      unresolved: 1,
    });
    expect(draft.review_protocol).toEqual({
      review_mode:
        "dual_independent_mixed_positive_and_source_gap_risk_review",
      independent_review_required: true,
      dual_independent_review_required: true,
      owner_gate_created: false,
      owner_acceptance_created: false,
      persistence_performed: false,
    });
    expect(draft.authorization_state).toBe(
      "evidence_draft_pending_dual_independent_review_no_gate_no_acceptance_no_persistence",
    );
    expect(draft.persisted_extent_decision_count).toBe(0);
    expect(draft.persisted_grain_decision_count).toBe(0);
    expect(draft.authorizes_occurrence).toBe(false);
    expect(draft.authorizes_decision_persistence).toBe(false);
    expect(existsSync(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-10b-dual-review-gate-v1.json`,
    )).toBe(false);
    expect(existsSync(
      `${riskRoot}/plan-040-qbnr-service-pattern-package-10b-owner-acceptance-v1.json`,
    )).toBe(false);
  });

  it("fails closed on chain, Q89 preservation, P8, and exclusion drift", () => {
    const evidence = readJson<Package10bEvidence>(evidencePath);

    const chain = clone(evidence.candidates);
    (chain[0]!.accepted_evidence as {
      full_stop_chains: Array<{ stop_ids: string[] }>;
    }).full_stop_chains[0]!.stop_ids.reverse();
    expect(() =>
      buildPlan040Package10bDraft(
        inputFor(evidence, chain),
      )
    ).toThrow(/Q82 evidence/u);

    const q89 = clone(evidence.candidates);
    q89[3]!.proposed_extent_decision =
      clone(q89[0]!.proposed_extent_decision);
    expect(() =>
      buildPlan040Package10bDraft(
        inputFor(evidence, q89),
      )
    ).toThrow(/Q89 preservation/u);

    const p8 = clone(evidence.preserved_package_8_predecessor_rows);
    p8.extent_rows[0]!.verdict = "unreviewed";
    expect(() =>
      buildPlan040Package10bDraft(
        inputFor(evidence, evidence.candidates, evidence.exclusions, p8),
      )
    ).toThrow(/P8 predecessor/u);

    const exclusions = clone(evidence.exclusions);
    exclusions[0]!.candidate_keys.pop();
    expect(() =>
      buildPlan040Package10bDraft(
        inputFor(evidence, evidence.candidates, exclusions),
      )
    ).toThrow(/exclusion/u);
  });
});
