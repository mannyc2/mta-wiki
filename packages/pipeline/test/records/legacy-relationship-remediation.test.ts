import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { repoRoot } from "../../../core/src/paths";
import { canonicalRecordIdForInput } from "../../../db/src/identity";
import { stableHash } from "../../../db/src/stable-json";
import type { MtaCanonicalRecord, MtaEvidenceRef, MtaSubmitObservationInput } from "../../../db/src/types";
import { entriesToRecords } from "../../src/materialize/materialize";
import { directCanonicalRelationEndpointIssues, relationEndpointIssues } from "../../src/records/submissions";
import {
  correctedFamily,
  deterministicSubmissionEntry,
  evidenceRefFromBlock,
  exactSemanticKey,
  isAssignedFamilyShapeSuspect,
} from "../../../../scripts/remediate-legacy-relationship-integrity";

const sourceId = "legacy_relationship_integrity_fixture";
const rawText = "NYC Transit requested approval for a $291.7 million bus procurement.";
const rawSourceDir = join(repoRoot, "raw", "sources", sourceId);

beforeAll(() => {
  rmSync(rawSourceDir, { recursive: true, force: true });
  mkdirSync(rawSourceDir, { recursive: true });
  writeFileSync(join(rawSourceDir, "blocks.jsonl"), `${JSON.stringify({
    source_id: sourceId,
    block_id: "p001_b0001",
    page_number: 1,
    reading_order: 1,
    source_surface: "ocr_text",
    block_kind: "text",
    raw_source_path: `raw/sources/${sourceId}/text.txt`,
    raw_start_char: 0,
    raw_end_char: rawText.length,
    raw_text: rawText,
    normalized_text: rawText,
    raw_text_sha256: `sha256:${createHash("sha256").update(rawText).digest("hex")}`,
    normalized_text_sha256: `sha256:${createHash("sha256").update(rawText).digest("hex")}`,
  })}\n`, "utf8");
});

afterAll(() => {
  rmSync(rawSourceDir, { recursive: true, force: true });
});

function evidence(blockId = "p001_b0001"): MtaEvidenceRef {
  return evidenceRefFromBlock({
    source_id: sourceId,
    block_id: blockId,
    page_number: 1,
    raw_text: rawText,
    raw_text_sha256: `sha256:${createHash("sha256").update(rawText).digest("hex")}`,
  });
}

function canonicalRelation(overrides: Partial<MtaCanonicalRecord> = {}): MtaCanonicalRecord {
  return {
    record_id: "relation_fixture",
    record_kind: "relation",
    source_id: sourceId,
    source_ids: [sourceId],
    local_observation_id: "relation_fixture",
    display_name: "fixture relation",
    payload: {
      relation_kind: "presented_to",
      relation_family: "claim_context",
      subject_id: "project_fixture",
      object_id: "entity_fixture",
      assertion_status: "delivered",
      as_of_date: "2026-01-01",
    },
    evidence_refs: [evidence()],
    submission_ids: ["sub_fixture"],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-15T12:00:00.000Z",
    ...overrides,
  };
}

function input(kind: MtaSubmitObservationInput["observation_kind"], localId: string, payload: Record<string, unknown>): MtaSubmitObservationInput {
  return {
    source_id: sourceId,
    observation_kind: kind,
    local_observation_id: localId,
    create_new: true,
    label: localId,
    payload,
    evidence_refs: [evidence()],
  } as MtaSubmitObservationInput;
}

describe("legacy relationship integrity remediation", () => {
  it("classifies the assigned family-shape rule and selects the evidence-supported family", () => {
    const record = canonicalRelation();
    const kinds = new Map([
      [record.record_id, "relation"],
      ["project_fixture", "project"],
      ["entity_fixture", "entity"],
    ]);
    expect(isAssignedFamilyShapeSuspect(record, kinds)).toBe(true);
    expect(correctedFamily(record, kinds)).toBe("partnership_engagement");
  });

  it("keeps source-literal variants distinct without changing their evidence identity", () => {
    const first = canonicalRelation();
    const second = canonicalRelation({ record_id: "relation_fixture_2", local_observation_id: "relation_fixture_2" });
    expect(exactSemanticKey(first)).toBe(exactSemanticKey(second));
    first.payload.relationship_variant_key = "service_phase:limited_stop_predecessor";
    second.payload.relationship_variant_key = "service_phase:select_bus_service_successor";
    expect(exactSemanticKey(first, true)).not.toBe(exactSemanticKey(second, true));
  });

  it("builds evidence and submission identities deterministically", () => {
    const ref = evidence();
    expect(ref).toMatchObject({
      evidence_id: `${sourceId}#p001_b0001`,
      source_path: `raw/sources/${sourceId}/blocks.jsonl`,
      page_number: 1,
      text_source: "raw_text",
    });
    const observation = input("source", "source_fixture", { title: "Fixture", publisher: "MTA", content_type: "report" });
    const first = deterministicSubmissionEntry(observation);
    const second = deterministicSubmissionEntry(observation);
    expect(first).toEqual(second);
    const hash = stableHash(first.tool_args as unknown as Record<string, unknown>);
    expect(first.submission_id).toBe(`sub_${hash.slice(0, 16)}`);
    expect(first.tool_args_sha256).toBe(`sha256:${hash}`);
  });

  it("materializes claim and metric relations as two edges when local identities are unique", () => {
    const entries = [
      deterministicSubmissionEntry(input("source", "source_fixture", { title: "Fixture source", publisher: "MTA", content_type: "board item" })),
      deterministicSubmissionEntry(input("entity", "entity_nyct", { entity_name: "NYC Transit", entity_type: "transit agency" })),
      deterministicSubmissionEntry(input("claim", "claim_budget", { claim_text: "Board approval was requested." })),
      deterministicSubmissionEntry(input("metric_claim", "metric_procurement", { metric_name: "procurement_value", raw_value_text: "$291.7 million", value: 291700000, unit: "USD" })),
      deterministicSubmissionEntry(input("relation", "relation_procurement_claim", {
        relation_kind: "has_claim",
        relation_family: "claim_context",
        subject_local_observation_id: "entity_nyct",
        object_local_observation_id: "claim_budget",
      })),
      deterministicSubmissionEntry(input("relation", "relation_procurement_metric_split", {
        relation_kind: "has_metric",
        relation_family: "metric_context",
        subject_local_observation_id: "entity_nyct",
        object_local_observation_id: "metric_procurement",
      })),
    ];
    const relations = entriesToRecords(entries).filter((record) => record.record_kind === "relation");
    expect(relations).toHaveLength(2);
    expect(relations.map((record) => record.payload.relation_kind).sort()).toEqual(["has_claim", "has_metric"]);
    expect(new Set(relations.map((record) => record.record_id)).size).toBe(2);
  });

  it("materializes ontology-supported project and treatment physical-scope edges to a bounded corridor", () => {
    const entries = [
      deterministicSubmissionEntry(input("project", "project_phase", { project_name: "Bounded Phase", status: "implemented" })),
      deterministicSubmissionEntry(input("treatment_component", "treatment_phase", { treatment_kind: "center-running bus lanes", location_text: "Main Street between A Street and B Street" })),
      deterministicSubmissionEntry(input("corridor", "corridor_bounded", { corridor_name: "Main Street between A Street and B Street", limits: "A Street to B Street" })),
      deterministicSubmissionEntry(input("relation", "relation_project_corridor", {
        relation_kind: "uses_corridor",
        relation_family: "corridor_scope",
        subject_local_observation_id: "project_phase",
        object_local_observation_id: "corridor_bounded",
      })),
      deterministicSubmissionEntry(input("relation", "relation_treatment_corridor", {
        relation_kind: "located_on_corridor",
        relation_family: "corridor_scope",
        subject_local_observation_id: "treatment_phase",
        object_local_observation_id: "corridor_bounded",
      })),
    ];
    const records = entriesToRecords(entries);
    const corridor = records.find((record) => record.record_kind === "corridor")!;
    const relations = records.filter((record) => record.record_kind === "relation");
    expect(relations).toHaveLength(2);
    expect(relations.map((record) => record.payload.relation_kind).sort()).toEqual(["located_on_corridor", "uses_corridor"]);
    expect(relations.every((record) => record.payload.object_id === corridor.record_id)).toBe(true);

    const contract = JSON.parse(readFileSync(join(repoRoot, "data", "contracts", "relationships", "v1", "allowed-endpoint-types.json"), "utf8")) as {
      rules: Array<{ relation_kind: string; allowed_shapes: Array<{ subject_kind: string; object_kind: string }> }>;
    };
    const supports = (kind: string, subject: string) => contract.rules.some((rule) =>
      rule.relation_kind === kind && rule.allowed_shapes.some((shape) => shape.subject_kind === subject && shape.object_kind === "corridor"));
    expect(supports("uses_corridor", "project")).toBe(true);
    expect(supports("located_on_corridor", "treatment_component")).toBe(true);
  });

  it("persists the exclusive 216-item ledger, exact typed repairs, and 22-entry journal", () => {
    const ledgerPath = join(repoRoot, "data", "quality", "relationship-integrity", "legacy-remediation", "ledger.jsonl");
    const ledger = readFileSync(ledgerPath, "utf8").trim().split(/\r?\n/u).map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(ledger).toHaveLength(216);
    expect(new Set(ledger.map((entry) => entry.item_id)).size).toBe(216);
    expect(ledger.every((entry) => typeof entry.primary_disposition === "string" && (entry.primary_disposition as string).length > 0)).toBe(true);

    const journalPath = join(repoRoot, "data", "submissions", "2026-07-15T12-00-00-000Z_legacy-relationship-integrity-remediation.jsonl");
    const journal = readFileSync(journalPath, "utf8").trim().split(/\r?\n/u).map((line) => JSON.parse(line) as ReturnType<typeof deterministicSubmissionEntry>);
    expect(journal).toHaveLength(22);
    expect(journal.filter((entry) => entry.tool_args.observation_kind === "source")).toHaveLength(5);
    expect(journal.filter((entry) => entry.tool_args.observation_kind === "corridor")).toHaveLength(3);
    expect(journal.filter((entry) => entry.tool_args.observation_kind === "project")).toHaveLength(3);
    expect(journal.filter((entry) => entry.tool_args.observation_kind === "entity")).toHaveLength(2);
    expect(journal.filter((entry) => entry.tool_args.observation_kind === "relation")).toHaveLength(9);
    for (const entry of journal) {
      const hash = stableHash(entry.tool_args as unknown as Record<string, unknown>);
      expect(entry.submission_id).toBe(`sub_${hash.slice(0, 16)}`);
      expect(entry.tool_args_sha256).toBe(`sha256:${hash}`);
    }

    const eastRiver = journal.find((entry) => entry.tool_args.local_observation_id === "corridor_east_river_tunnels_meeting_doc_171496")!;
    expect(canonicalRecordIdForInput(eastRiver.tool_args)).toBe("corridor_east-river-tunnels-meeting-doc-171496");
    expect(eastRiver.tool_args.evidence_refs?.[0]).toMatchObject({
      evidence_id: "meeting_doc_171496#p002_c0001",
      text_sha256: "sha256:74b4dfcde0ba2bfeb7cfe008f3add411e224dac1f20640ffa32cff47058dd718",
    });

    const eastRiverRelationIds = [
      "relation_meeting-doc-171496-amtrak-operator",
      "relation_meeting-doc-171496-lirr-operator",
      "relation_meeting-doc-171496-njtransit-operator",
    ];
    const corrections = readFileSync(join(repoRoot, "data", "semantic-corrections", "corrections.jsonl"), "utf8")
      .trim().split(/\r?\n/u).map((line) => JSON.parse(line) as Record<string, unknown>);
    const campaignCorrections = corrections.filter((entry) => String(entry.correction_id).startsWith("relationship-integrity-legacy-"));
    expect(campaignCorrections).toHaveLength(242);
    for (const relationId of eastRiverRelationIds) {
      const item = ledger.find((entry) => entry.item_id === `family-shape:${relationId}`)!;
      expect(item.primary_disposition).toBe("corrected_canonical_endpoint");
      expect(item.record_ids).toContain("corridor_east-river-tunnels-meeting-doc-171496");
      expect(item.submission_ids).toContain(eastRiver.submission_id);
      expect(item.evidence_bindings).toContainEqual({
        evidence_id: "meeting_doc_171496#p002_c0001",
        text_sha256: "sha256:74b4dfcde0ba2bfeb7cfe008f3add411e224dac1f20640ffa32cff47058dd718",
      });
      const ids = item.correction_ids as string[];
      expect(ids).toHaveLength(3);
      expect(ids.every((id) => campaignCorrections.some((entry) => entry.correction_id === id && entry.record_id === relationId))).toBe(true);
      expect(campaignCorrections.some((entry) => {
        const patch = entry.patch as { set?: { relation_kind?: string; relation_family?: string } } | undefined;
        return entry.record_id === relationId && patch?.set?.relation_kind === "operates_on_corridor" && patch.set.relation_family === "corridor_scope";
      })).toBe(true);
    }

    const flatbush = journal.find((entry) => entry.tool_args.local_observation_id === "corridor_flatbush_phase1_livingston_state")!;
    expect(canonicalRecordIdForInput(flatbush.tool_args)).toBe("corridor_flatbush-phase1-livingston-state");
    expect(flatbush.tool_args.evidence_refs?.[0]).toMatchObject({
      evidence_id: "flatbush_ave_bus_priority_mtp_briefing_apr2026#p004_c0002",
      text_sha256: "sha256:04e364443480c8b2cda313fd5461a4e0c68f70b891b2d9d39735d13513839e29",
    });
    const flatbushRelations = journal.filter((entry) => [
      "relation_flatbush_phase1_uses_bounded_corridor_livingston_state_20260715",
      "relation_flatbush_phase1_treatment_on_bounded_corridor_livingston_state_20260715",
    ].includes(entry.tool_args.local_observation_id));
    expect(flatbushRelations.map((entry) => entry.tool_args.payload.relation_kind).sort()).toEqual(["located_on_corridor", "uses_corridor"]);
    expect(flatbushRelations.every((entry) => entry.tool_args.payload.object_local_observation_id === "corridor_flatbush_phase1_livingston_state")).toBe(true);
    expect(flatbushRelations.map((entry) => entry.tool_args.payload.subject_id).sort()).toEqual([
      "project_flatbush-phase1-center-running-bus-lanes-livingston-state",
      "treatment_flatbush-phase1-center-running-bus-lanes-livingston-state",
    ]);
    expect(flatbushRelations.every((entry) => entry.tool_args.payload.object_id === undefined)).toBe(true);
    const knownFlatbushLocals = new Set(
      journal
        .filter((entry) => entry.validation.state === "accepted" && entry.tool_args.source_id === "flatbush_ave_bus_priority_mtp_briefing_apr2026")
        .map((entry) => entry.tool_args.local_observation_id),
    );
    for (const entry of flatbushRelations) {
      expect(relationEndpointIssues(entry.tool_args, knownFlatbushLocals)).toEqual([]);
      expect(directCanonicalRelationEndpointIssues(entry.tool_args)).toEqual([]);
    }

    const formerModelingGaps = [
      "relation_crichlow-department-head",
      "relation_meeting-doc-128921-open-stroller-buses",
      "relation_ossining-event-location",
      "relation_paratransit-ev-pilot",
      "relation_ptm-second-queens-facility",
      "relation_rel-jamaica-bus-depot-in-queens",
      "relation_sharp-dos-program",
      "relation_webster-bridge-on-port-washington-branch",
    ];
    for (const relationId of formerModelingGaps) {
      const item = ledger.find((entry) => entry.item_id === `family-shape:${relationId}`)!;
      expect(item.primary_disposition).not.toBe("investigated_endpoint_modeling_gap");
      expect((item.correction_ids as string[]).length).toBeGreaterThan(0);
    }
    expect(ledger.filter((entry) => entry.primary_disposition === "modeled_typed_counterpart")).toHaveLength(6);
    expect(ledger.filter((entry) => entry.primary_disposition === "retracted_evidence_invalid_relation")).toHaveLength(1);
    const typedAdditionLocals = new Set([
      "entity_ossining_station_2024",
      "project_paratransit_ev_bus_pilot_2024",
      "project_ptm_second_queens_facility_2025",
      "entity_queens_borough",
      "project_dos_sharp_safety_hazards_risk_prevention",
      "corridor_lirr_port_washington_branch",
    ]);
    expect(journal.filter((entry) => typedAdditionLocals.has(entry.tool_args.local_observation_id))).toHaveLength(6);

    const summary = JSON.parse(readFileSync(join(repoRoot, "data", "quality", "relationship-integrity", "legacy-remediation", "summary.json"), "utf8")) as {
      remediation: { canonical_additions: Array<{ record_id: string; subject_id?: string; object_id?: string }> };
    };
    const materializedRelations = summary.remediation.canonical_additions.filter((entry) => entry.record_id.startsWith("relation_flatbush-phase1-"));
    expect(materializedRelations.map((entry) => entry.object_id)).toEqual([
      "corridor_flatbush-phase1-livingston-state",
      "corridor_flatbush-phase1-livingston-state",
    ]);
  });
});
