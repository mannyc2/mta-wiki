import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  MEMBER_EXTENT_ABSENCE_CONTRACT_ID,
  buildMemberExtentLedgers,
  loadMemberExtentAbsenceReceipts,
  loadMemberExtentDecisions,
  writeMemberExtentLedgerArtifacts,
  type MemberExtentAbsenceReceipt,
} from "../../src/quality/member-extent-ledger";
import {
  MEMBER_GRAIN_DECISION_CONTRACT_ID,
  loadMemberGrainDecisions,
  parseMemberGrainDecision,
} from "../../src/quality/member-grain-decisions";
import type {
  MemberExtentDecision,
  MemberExtentRow,
} from "../../src/quality/study-readiness-v1";
import type { ScheduleDiffDossier } from "../../src/reference/schedule-diff";

function row(id: string, route = "Q1", extent: MemberExtentRow["extent"] = "unresolved"): MemberExtentRow {
  const positive = extent !== "unresolved";
  return {
    schema_version: 1,
    contract_id: "operational-occurrence-member-extent-v1",
    extent_id: `extent-${id}`,
    occurrence_id: `occurrence-${id}`,
    occurrence_review_decision_id: `occurrence-review-${id}`,
    route_record_id: `route-${route.toLowerCase()}`,
    gtfs_route_id: route,
    treatment_record_id: `treatment-${id}`,
    treatment_family: "service_pattern",
    extent,
    components: positive ? [{
      component_kind: "route",
      identity_namespace: "canonical_record",
      identifiers: [`route-${route.toLowerCase()}`],
      description: "Reviewed whole-route extent.",
    }] : [],
    evidence_bindings: positive ? [{
      role: "extent_classification",
      record_id: `treatment-${id}`,
      source_id: "source",
      evidence_id: "source#block",
    }] : [],
    missing_roles: positive ? [] : ["reviewed_extent_decision"],
    decision_id: positive ? `existing-${id}` : null,
    rationale: positive ? "Existing reviewed extent." : "Awaiting reviewed extent.",
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

function positiveDecision(target: MemberExtentRow): MemberExtentDecision {
  return {
    decision_id: `decision-${target.extent_id}`,
    occurrence_id: target.occurrence_id,
    route_record_id: target.route_record_id,
    treatment_record_id: target.treatment_record_id,
    resolution: "bounded_segment",
    components: [{
      component_kind: "segment",
      identity_namespace: "source_literal_v1",
      identifiers: ["stop-a", "stop-b"],
      description: "Reviewed schedule segment.",
    }],
    evidence_bindings: [{
      role: "reference_snapshot",
      record_id: target.treatment_record_id,
      source_id: "snapshot-source",
      evidence_id: "snapshot-source#manifest",
    }],
    missing_roles: [],
    rationale: "Exact segment is bound to the staged schedule snapshot.",
    reviewed_at: "2026-07-23",
    reviewed_by: "fixture-reviewer",
  };
}

function absence(target: MemberExtentRow): MemberExtentAbsenceReceipt {
  return {
    schema_version: 1,
    contract_id: MEMBER_EXTENT_ABSENCE_CONTRACT_ID,
    receipt_id: `receipt-${target.extent_id}`,
    surfaces: ["member_extent", "member_grain"],
    extent_keys: [{
      occurrence_id: target.occurrence_id,
      route_record_id: target.route_record_id,
      treatment_record_id: target.treatment_record_id,
    }],
    exact_searches: [`${target.gtfs_route_id} exact member extent`],
    urls_inspected: ["https://example.test/official"],
    rationale: "Exact official targets were inspected without the required binding.",
    reviewed_at: "2026-07-23",
    reviewed_by: "fixture-reviewer",
    authorizes_study: false,
    authorizes_cross_product: false,
  };
}

function grainDecision(target: MemberExtentRow, extentDecisionId: string | null = null) {
  return {
    schema_version: 1,
    contract_id: MEMBER_GRAIN_DECISION_CONTRACT_ID,
    decision_id: `grain-${target.extent_id}`,
    occurrence_id: target.occurrence_id,
    route_record_id: target.route_record_id,
    gtfs_route_id: target.gtfs_route_id,
    treatment_record_id: target.treatment_record_id,
    member_extent_decision_id: extentDecisionId,
    service_scope: { kind: "periods", periods: ["am_peak"], directions: ["N"], pattern_ids: [] },
    lineage_segments: [],
    evidence_bindings: [{
      role: "reference_snapshot",
      record_id: target.treatment_record_id,
      source_id: "snapshot-source",
      evidence_id: "snapshot-source#manifest",
    }],
    rationale: "The structured selector captures the reviewed morning scope.",
    reviewed_at: "2026-07-23",
    reviewed_by: "fixture-reviewer",
  };
}

function occurrence(target: MemberExtentRow) {
  return {
    occurrence_id: target.occurrence_id,
    routes: [{ route_record_id: target.route_record_id }],
    treatment: {
      kind: "atomic",
      member: { treatment_record_id: target.treatment_record_id },
    },
  };
}

describe("member extent and grain ledgers", () => {
  it("preserves the exact companion denominator and overlays only reviewed terminal evidence", () => {
    const unresolved = row("atomic");
    const bundleOne = row("bundle-a", "Q2");
    const bundleTwo = row("bundle-b", "Q2");
    const multiRoute = row("multi-route", "Q3");
    const existing = row("existing", "Q4", "route_wide");
    const decision = positiveDecision(unresolved);
    const result = buildMemberExtentLedgers({
      companionRows: [bundleTwo, existing, multiRoute, unresolved, bundleOne],
      extentDecisions: [decision],
      grainDecisions: [parseMemberGrainDecision(grainDecision(unresolved, decision.decision_id))],
      absenceReceipts: [absence(bundleOne)],
    });
    expect(result.extentRows).toHaveLength(5);
    expect(result.grainRows).toHaveLength(5);
    expect(result.extentRows.find((entry) => entry.treatment_record_id === unresolved.treatment_record_id))
      .toMatchObject({ current_extent_kind: "bounded_segment", verdict: "resolved:bounded_segment" });
    expect(result.extentRows.find((entry) => entry.treatment_record_id === existing.treatment_record_id))
      .toMatchObject({ verdict: "resolved:route_wide", verdict_basis: "review:existing-existing" });
    expect(result.extentRows.find((entry) => entry.treatment_record_id === bundleOne.treatment_record_id))
      .toMatchObject({ verdict: "absent_in_source", receipt_ids: ["receipt-extent-bundle-a"] });
    expect(result.grainRows.find((entry) => entry.treatment_record_id === unresolved.treatment_record_id)?.verdict)
      .toBe("resolved");
  });

  it("fails closed for conflicting, orphan, and authority-bearing absence receipts", () => {
    const target = row("target");
    expect(() => buildMemberExtentLedgers({
      companionRows: [target],
      extentDecisions: [positiveDecision(target)],
      absenceReceipts: [absence(target)],
    })).toThrow("conflicts");
    const orphan = row("orphan");
    expect(() => buildMemberExtentLedgers({
      companionRows: [target],
      absenceReceipts: [absence(orphan)],
    })).toThrow("orphan extent key");

    const dir = mkdtempSync(join(tmpdir(), "member-receipts-"));
    const invalid = { ...absence(target), authorizes_study: true };
    writeFileSync(join(dir, "invalid.json"), JSON.stringify(invalid));
    expect(() => loadMemberExtentAbsenceReceipts([dir])).toThrow("cannot authorize");
    writeFileSync(join(dir, "invalid.json"), JSON.stringify({
      ...absence(target),
      exact_searches: [],
    }));
    expect(() => loadMemberExtentAbsenceReceipts([dir])).toThrow("non-empty array");
  });

  it("loads single, array, and decisions-wrapper packages and rejects duplicate keys", () => {
    const targetA = row("a");
    const targetB = row("b");
    const targetC = row("c");
    const dir = mkdtempSync(join(tmpdir(), "member-decisions-"));
    writeFileSync(join(dir, "single.json"), JSON.stringify(positiveDecision(targetA)));
    writeFileSync(join(dir, "array.json"), JSON.stringify([positiveDecision(targetB)]));
    writeFileSync(join(dir, "batch.json"), JSON.stringify({ decisions: [positiveDecision(targetC)] }));
    expect(loadMemberExtentDecisions([dir])).toHaveLength(3);
    writeFileSync(join(dir, "duplicate.json"), JSON.stringify(positiveDecision(targetA)));
    expect(() => loadMemberExtentDecisions([dir])).toThrow("duplicate extent decision");
  });

  it("requires structured service modality and lineage instead of prose fallbacks", () => {
    const target = row("grain");
    expect(() => parseMemberGrainDecision({
      ...grainDecision(target),
      service_scope: { kind: "not_applicable" },
      rationale: "AM peak frequency only.",
    })).toThrow("only in prose");
    expect(() => parseMemberGrainDecision({
      ...grainDecision(target),
      service_scope: { kind: "not_applicable" },
      rationale: "The predecessor Q15 route is replaced.",
    })).toThrow("only in prose");
    expect(() => parseMemberGrainDecision({
      ...grainDecision(target),
      authorizes_study: true,
    })).toThrow("unknown field");
    expect(() => parseMemberGrainDecision({
      ...grainDecision(target),
      evidence_bindings: [],
    })).toThrow("require exact evidence");
  });

  it("requires terminal grain decisions to name a matching positive spatial decision", () => {
    const unresolved = row("grain-unresolved");
    expect(() => buildMemberExtentLedgers({
      companionRows: [unresolved],
      grainDecisions: [parseMemberGrainDecision(grainDecision(unresolved))],
    })).toThrow("requires a positive spatial decision");

    const existing = row("grain-existing", "Q4", "route_wide");
    expect(() => buildMemberExtentLedgers({
      companionRows: [existing],
      grainDecisions: [parseMemberGrainDecision(grainDecision(existing))],
    })).toThrow("must name its positive spatial decision");
    expect(() => buildMemberExtentLedgers({
      companionRows: [existing],
      grainDecisions: [parseMemberGrainDecision({
        ...grainDecision(existing),
        service_scope: { kind: "not_applicable" },
        rationale: "This member has no separate service-grain selector.",
      })],
    })).toThrow("must name its positive spatial decision");
    expect(buildMemberExtentLedgers({
      companionRows: [existing],
      grainDecisions: [
        parseMemberGrainDecision(grainDecision(existing, existing.decision_id)),
      ],
    }).grainRows[0]?.verdict).toBe("resolved");

    const blocked = parseMemberGrainDecision({
      ...grainDecision(unresolved),
      service_scope: { kind: "unresolved", missing_roles: ["pattern_identity"] },
      rationale: "The exact structured grain is not yet evidence-bound.",
    });
    expect(buildMemberExtentLedgers({
      companionRows: [unresolved],
      grainDecisions: [blocked],
    }).grainRows[0]?.verdict).toBe("blocked_upstream:pattern_identity");
  });

  it("rejects a stale companion that omits a current occurrence member", () => {
    const existing = row("denominator-existing");
    const generated = row("denominator-generated", "Q99");
    expect(() => buildMemberExtentLedgers({
      companionRows: [existing],
      expectedMemberKeys: [existing, generated],
    })).toThrow("does not match current occurrence denominator");
    expect(buildMemberExtentLedgers({
      companionRows: [existing, generated],
      expectedMemberKeys: [generated, existing],
    }).extentRows).toHaveLength(2);
  });

  it("attaches Q61, QM44, and QM64 dossier facts only as nonexclusive route context", () => {
    const q61 = { ...row("q61", "Q61"), missing_roles: ["bounded_scope_identity"] } as MemberExtentRow;
    const qm44 = { ...row("qm44", "QM44"), missing_roles: ["stop_identity"] } as MemberExtentRow;
    const qm64 = { ...row("qm64", "QM64"), missing_roles: ["scope_modality"] } as MemberExtentRow;
    const dossier = (routeId: string): ScheduleDiffDossier => ({
      route_id: routeId,
      query_receipts: [{ snapshot_id: "snapshot", path: "receipt.json", sha256: "a".repeat(64) }],
      direction_diffs: [{
        direction: "N",
        timepoint_stops_added: [{ stop_id: "B", stop_name: "B" }],
        timepoint_stops_removed: [{ stop_id: "A", stop_name: "A" }],
        trips_per_period_before: [{ period: "am_peak", trip_count: 1, mean_headway_minutes: null }],
        trips_per_period_after: [{ period: "am_peak", trip_count: 2, mean_headway_minutes: null }],
      }],
      correspondence_segments: [{
        old_route_id: "Q15",
        direction: "N",
        predecessor_shape_id: "old",
        successor_shape_id: "new",
        predecessor_service_date: "2025-06-28",
        boundary_stops: [{ stop_id: "A", stop_name: "A" }, { stop_id: "B", stop_name: "B" }],
        shared_timepoint_stop_ids: ["A", "B"],
        miles: 1,
      }],
      new_route_remainder: [],
    } as unknown as ScheduleDiffDossier);
    const result = buildMemberExtentLedgers({
      companionRows: [q61, qm44, qm64],
      dossierArtifacts: ["Q61", "QM44", "QM64"].map((routeId) => ({
        artifact: `${routeId}.json`,
        dossier: dossier(routeId),
      })),
    });
    expect(result.extentRows.find((entry) => entry.gtfs_route_id === "Q61")?.dossier_refs[0])
      .toMatchObject({
        fact_kind: "bounded_scope_identity",
        evidence_scope: "route_context_only_nonexclusive",
        satisfies_missing_role: false,
        limitations: [
          "nonexclusive_route_context",
          "not_treatment_aligned",
          "timepoint_only_nonexhaustive",
        ],
      });
    expect(result.extentRows.find((entry) => entry.gtfs_route_id === "QM44")?.dossier_refs
      .every((ref) =>
        ref.fact_kind === "stop_identity" &&
        ref.satisfies_missing_role === false &&
        ref.limitations.includes("timepoint_only_nonexhaustive"))).toBe(true);
    expect(result.extentRows.find((entry) => entry.gtfs_route_id === "QM64")?.dossier_refs[0])
      .toMatchObject({
        fact_kind: "scope_modality",
        satisfies_missing_role: false,
        limitations: [
          "may_include_non_revenue_trips",
          "nonexclusive_route_context",
          "not_treatment_aligned",
        ],
      });
  });

  it("writes byte-stable outputs on replay", () => {
    const root = mkdtempSync(join(tmpdir(), "member-ledger-"));
    const companion = join(root, "companion.jsonl");
    const occurrences = join(root, "occurrences.jsonl");
    const dossierDir = join(root, "dossiers");
    mkdirSync(dossierDir);
    writeFileSync(companion, `${stableJson(row("stable") as unknown as JsonValue)}\n`);
    writeFileSync(
      occurrences,
      `${stableJson(occurrence(row("stable")) as unknown as JsonValue)}\n`,
    );
    const options = {
      rootDir: root,
      companionPath: companion,
      occurrencesPath: occurrences,
      extentDecisionDirs: [join(root, "extent-decisions")],
      grainDecisionDirs: [join(root, "grain-decisions")],
      absenceReceiptDirs: [join(root, "receipts")],
      dossierDir,
      packetPath: join(root, "packets.jsonl"),
      extentOutputPath: join(root, "extent.jsonl"),
      grainOutputPath: join(root, "grain.jsonl"),
    };
    writeMemberExtentLedgerArtifacts(options);
    const first = [readFileSync(options.extentOutputPath), readFileSync(options.grainOutputPath)];
    writeMemberExtentLedgerArtifacts(options);
    expect(readFileSync(options.extentOutputPath)).toEqual(first[0]);
    expect(readFileSync(options.grainOutputPath)).toEqual(first[1]);
  });

  it("loads grain packages from every accelerated artifact shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "grain-decisions-"));
    const a = grainDecision(row("grain-a"));
    const b = grainDecision(row("grain-b"));
    const c = grainDecision(row("grain-c"));
    writeFileSync(join(dir, "single.json"), JSON.stringify(a));
    writeFileSync(join(dir, "array.json"), JSON.stringify([b]));
    writeFileSync(join(dir, "batch.json"), JSON.stringify({ decisions: [c] }));
    expect(loadMemberGrainDecisions([dir])).toHaveLength(3);
  });
});
