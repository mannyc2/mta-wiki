import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import type { JsonObject, MtaCanonicalRecord, StagedSourceBlock } from "@mta-wiki/db/types";
import { parseOperationalRecoveryProposal } from "@mta-wiki/pipeline/records/operational-recovery-proposals";
import {
  QBNR_SERVICE_CHANGES_SOURCE_ID,
  expandQbnrRecoveryBatch,
  type QbnrRecoveryBatchSpec,
  type QbnrRecoveryUnitSpec,
} from "@mta-wiki/pipeline/records/qbnr-recovery-expander";

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function block(blockId: string, rawText: string): StagedSourceBlock {
  const hash = sha256(rawText);
  return {
    source_id: QBNR_SERVICE_CHANGES_SOURCE_ID,
    block_id: blockId,
    page_number: 1,
    reading_order: Number(blockId.replace(/\D/gu, "")) || 1,
    source_surface: "ocr_text",
    block_kind: "text",
    raw_source_path: `raw/sources/${QBNR_SERVICE_CHANGES_SOURCE_ID}/text.txt`,
    raw_start_char: 0,
    raw_end_char: rawText.length,
    raw_text: rawText,
    normalized_text: rawText,
    raw_text_sha256: hash,
    normalized_text_sha256: hash,
  };
}

function record(recordId: string, recordKind: MtaCanonicalRecord["record_kind"], payload: JsonObject, displayName = recordId): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: "fixture_source",
    source_ids: ["fixture_source"],
    local_observation_id: `local_${recordId}`,
    local_observation_ids: [`local_${recordId}`],
    display_name: displayName,
    payload,
    evidence_refs: [],
    submission_ids: [`sub_${recordId}`],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-12T00:00:00.000Z",
  };
}

const q3Text = "Q3 | Changes to the Q3 took effect June 29, 2025. | The Q3 will keep its current routing, but some stops have been removed. View the full list of stops. | Get more details on Q3 service. | View the new Q3 timetable.";
const q3Block = block("p001_b0005", q3Text);

function atomicQ3Unit(): QbnrRecoveryUnitSpec {
  return {
    source_block_ids: [q3Block.block_id],
    source_block_sha256s: [q3Block.raw_text_sha256],
    source_route_labels: ["Q3"],
    route_label: "Q3",
    route_resolution: { mode: "target", target_record_id: "route_q3" },
    study_disposition: { status: "projectable", gtfs_route_id: "Q3" },
    event_kind: "service_change",
    occurrence_shape: "atomic",
    clauses: [{
      clause_kind: "treatment",
      id: "stop_removal",
      label: "Q3 stop removals",
      source_quote: "The Q3 will keep its current routing, but some stops have been removed.",
      treatment_kind: "stop removal",
      expected_treatment_family: "bus_stop_or_boarding",
      description: "Q3 retained its routing while some stops were removed.",
      relation_label: "Queens redesign includes Q3 stop removals",
      relation_description: "The implemented redesign removed some Q3 stops.",
    }, {
      clause_kind: "context",
      source_quote: "View the full list of stops.",
      review_rationale: "Navigation text is source context, not a treatment.",
    }, {
      clause_kind: "context",
      source_quote: "Get more details on Q3 service.",
      review_rationale: "Navigation text is source context, not a treatment.",
    }, {
      clause_kind: "context",
      source_quote: "View the new Q3 timetable.",
      review_rationale: "Navigation text is source context, not a treatment.",
    }],
  };
}

function spec(unit = atomicQ3Unit()): QbnrRecoveryBatchSpec {
  return {
    proposal_id: "orp_qbnr_fixture",
    corpus_fingerprint: "a".repeat(64),
    gap_ids: ["operational-coverage:fixture"],
    project_record_id: "project_qbnr",
    project_label: "Queens redesign",
    drafted_by: "fixture-curator",
    drafted_at: "2026-07-12T00:00:00.000Z",
    rationale: "Exact route-row recovery fixture.",
    units: [unit],
  };
}

function records(...routes: MtaCanonicalRecord[]): MtaCanonicalRecord[] {
  return [record("project_qbnr", "project", { project_name: "Queens Bus Network Redesign" }), ...routes];
}

const q3Route = record("route_q3", "route", { route_id: "Q3", route_name: "Q3" }, "A display name that is not used for identity");

describe("QBNR recovery batch expander", () => {
  it("expands one exact atomic row into the current deterministic proposal contract", () => {
    const proposal = expandQbnrRecoveryBatch(spec(), { blocks: [q3Block], records: records(q3Route) });

    expect(parseOperationalRecoveryProposal(proposal)).toEqual(proposal);
    expect(proposal).toMatchObject({
      schema_version: 1,
      proposal_kind: "observation_bundle",
      source_id: QBNR_SERVICE_CHANGES_SOURCE_ID,
      review_state: "proposed",
      provenance: { method: "qbnr_batch_spec_expansion" },
    });
    expect(proposal.observations).toHaveLength(3);
    expect(proposal.observations[0]).toMatchObject({
      expected_record_id: "route_q3",
      target_record_id: "route_q3",
      local_observation_id: "route_q3_qbnr_2025",
      payload: { route_id: "Q3", route_name: "Q3", gtfs_route_id: "Q3" },
    });
    expect(proposal.observations[1]).toMatchObject({
      expected_record_id: "event_q3-qbnr-service-change-2025-06-29",
      payload: { date_text: "June 29, 2025", date_normalized: "2025-06-29", date_precision: "day" },
    });
    expect(proposal.observations[2]).toMatchObject({
      expected_record_id: "treatment_q3-stop-removal-2025",
      raw_text: "The Q3 will keep its current routing, but some stops have been removed.",
    });
    expect(proposal.relations.map((relation) => relation.relation_kind)).toEqual([
      "affects_route",
      "has_timeline_event",
      "has_treatment",
    ]);
    expect(proposal.relations[2]).toMatchObject({
      label: "Queens redesign includes Q3 stop removals",
      description: "The implemented redesign removed some Q3 stops.",
    });
    expect(proposal.relations.every((relation) => relation.evidence_bindings.some((binding) => binding.role === "relationship"))).toBe(true);
    expect(JSON.stringify(proposal)).not.toContain("Navigation text is source context");
  });

  it("uses only canonical payload route fields to validate a target identity", () => {
    const wrongPayload = record("route_q3", "route", { route_id: "Q2", route_name: "Q2" }, "Q3");
    expect(() => expandQbnrRecoveryBatch(spec(), { blocks: [q3Block], records: records(wrongPayload) }))
      .toThrow("payload route fields do not identify Q3");
  });

  it("requires a GTFS route id for every projectable unit", () => {
    const unit = atomicQ3Unit();
    unit.study_disposition = { status: "projectable", gtfs_route_id: "" };
    expect(() => expandQbnrRecoveryBatch(spec(unit), { blocks: [q3Block], records: records(q3Route) }))
      .toThrow("gtfs_route_id must be a non-empty string");
  });

  it("rejects gaps, reordering, and surplus clauses in the exact description-cell partition", () => {
    const gap = atomicQ3Unit();
    gap.clauses[0]!.source_quote = "Some stops have been removed.";
    expect(() => expandQbnrRecoveryBatch(spec(gap), { blocks: [q3Block], records: records(q3Route) }))
      .toThrow("does not exactly partition description cell");

    const surplus = atomicQ3Unit();
    surplus.clauses.push({ clause_kind: "context", source_quote: "Absent text.", review_rationale: "Fixture." });
    expect(() => expandQbnrRecoveryBatch(spec(surplus), { blocks: [q3Block], records: records(q3Route) }))
      .toThrow("clause(s) outside the source description cells");
  });

  it("accounts for every substantive Q110-shaped cell and emits exactly one route, one timeline, and N treatment relations", () => {
    const q110Text = "Q110 | Changes to the Q110 took effect June 29, 2025. | The Q110 will be rerouted and extended along Jamaica Av/Jericho Tpke to the existing Q36 terminal in Queens. Q110 service along Hempstead Av will be discontinued and replaced by the new Q82 . | Some stops have been removed from this route. View the full list of stops. | Get more details on Q110 service. | View the new Q110 timetable.";
    const q110Block = block("p001_b0094", q110Text);
    const q110: QbnrRecoveryUnitSpec = {
      source_block_ids: [q110Block.block_id],
      source_block_sha256s: [q110Block.raw_text_sha256],
      source_route_labels: ["Q110"],
      route_label: "Q110",
      route_resolution: { mode: "target", target_record_id: "route_q110" },
      study_disposition: { status: "projectable", gtfs_route_id: "Q110" },
      event_kind: "service_change",
      occurrence_shape: "bundle",
      clauses: [{
        clause_kind: "treatment",
        id: "jamaica_extension",
        label: "Q110 Jamaica Avenue extension",
        source_quote: "The Q110 will be rerouted and extended along Jamaica Av/Jericho Tpke to the existing Q36 terminal in Queens.",
        treatment_kind: "service expansion",
        expected_treatment_family: "service_pattern",
        description: "Q110 was rerouted and extended along Jamaica Avenue/Jericho Turnpike.",
      }, {
        clause_kind: "treatment",
        id: "hempstead_replacement",
        label: "Q110 Hempstead Avenue replacement",
        source_quote: "Q110 service along Hempstead Av will be discontinued and replaced by the new Q82 .",
        treatment_kind: "route change",
        expected_treatment_family: "service_pattern",
        description: "Q110 Hempstead Avenue service was discontinued and replaced by Q82.",
      }, {
        clause_kind: "treatment",
        id: "stop_removal",
        label: "Q110 stop removals",
        source_quote: "Some stops have been removed from this route.",
        treatment_kind: "stop removal",
        expected_treatment_family: "bus_stop_or_boarding",
        description: "Some Q110 stops were removed.",
      }, {
        clause_kind: "context",
        source_quote: "View the full list of stops.",
        review_rationale: "Navigation text.",
      }, {
        clause_kind: "context",
        source_quote: "Get more details on Q110 service.",
        review_rationale: "Navigation text.",
      }, {
        clause_kind: "context",
        source_quote: "View the new Q110 timetable.",
        review_rationale: "Navigation text.",
      }],
    };
    const q110Route = record("route_q110", "route", { route_id: "Q110" });
    const partial = structuredClone(q110);
    partial.clauses.splice(2, 2);
    expect(() => expandQbnrRecoveryBatch(spec(partial), { blocks: [q110Block], records: records(q110Route) }))
      .toThrow("does not exactly partition description cell 1");

    const proposal = expandQbnrRecoveryBatch(spec(q110), { blocks: [q110Block], records: records(q110Route) });
    expect(proposal.observations.map((observation) => observation.observation_kind)).toEqual([
      "route",
      "event",
      "treatment_component",
      "treatment_component",
      "treatment_component",
    ]);
    expect(proposal.relations.map((relation) => relation.relation_kind)).toEqual([
      "affects_route",
      "has_timeline_event",
      "has_treatment",
      "has_treatment",
      "has_treatment",
    ]);
  });

  it("rejects duplicate treatment ids and a treatment-family normalization mismatch", () => {
    const duplicate = atomicQ3Unit();
    duplicate.occurrence_shape = "bundle";
    duplicate.clauses = [{
      ...duplicate.clauses[0]!,
      clause_kind: "treatment",
      source_quote: "The Q3 will keep its current routing,",
    }, {
      ...duplicate.clauses[0]!,
      clause_kind: "treatment",
      source_quote: "but some stops have been removed.",
    }, ...duplicate.clauses.slice(1)];
    expect(() => expandQbnrRecoveryBatch(spec(duplicate), { blocks: [q3Block], records: records(q3Route) }))
      .toThrow("duplicate treatment clause id");

    const family = atomicQ3Unit();
    const treatment = family.clauses[0]!;
    if (treatment.clause_kind !== "treatment") throw new Error("fixture setup failed");
    treatment.expected_treatment_family = "service_pattern";
    expect(() => expandQbnrRecoveryBatch(spec(family), { blocks: [q3Block], records: records(q3Route) }))
      .toThrow("normalizes to treatment_family bus_stop_or_boarding, expected service_pattern");
  });

  it("pins block hashes and rejects stale or mismatched source rows", () => {
    const staleHash = atomicQ3Unit();
    staleHash.source_block_sha256s = [`sha256:${"0".repeat(64)}`];
    expect(() => expandQbnrRecoveryBatch(spec(staleHash), { blocks: [q3Block], records: records(q3Route) }))
      .toThrow("does not match pinned raw_text_sha256");

    const wrongLabel = atomicQ3Unit();
    wrongLabel.source_route_labels = ["Q8"];
    expect(() => expandQbnrRecoveryBatch(spec(wrongLabel), { blocks: [q3Block], records: records(q3Route) }))
      .toThrow("row label Q3 does not equal declared Q8");

    const corrupt = { ...q3Block, raw_text: `${q3Block.raw_text} changed` };
    expect(() => expandQbnrRecoveryBatch(spec(), { blocks: [corrupt], records: records(q3Route) }))
      .toThrow("does not match pinned raw_text_sha256");
  });

  it("requires identical paired rename rows and selects the current route row for every evidence binding", () => {
    const event = "The X63 became the QM63 on June 30, 2025.";
    const description = "The X63 will be renamed the QM63.";
    const oldBlock = block("p001_b0129", `X63 | ${event} | ${description} | Get more details on QM63 service. | View the new QM63 timetable.`);
    const currentBlock = block("p001_b0130", `QM63 | ${event} | ${description} | Get more details on QM63 service. | View the new QM63 timetable.`);
    const rename: QbnrRecoveryUnitSpec = {
      source_block_ids: [oldBlock.block_id, currentBlock.block_id],
      source_block_sha256s: [oldBlock.raw_text_sha256, currentBlock.raw_text_sha256],
      source_route_labels: ["X63", "QM63"],
      route_label: "QM63",
      route_resolution: { mode: "target", target_record_id: "route_qm63" },
      study_disposition: { status: "projectable", gtfs_route_id: "QM63" },
      event_kind: "rename",
      occurrence_shape: "atomic",
      clauses: [{
        clause_kind: "treatment",
        id: "route_rename",
        label: "X63 to QM63 rename",
        source_quote: description,
        treatment_kind: "route change",
        expected_treatment_family: "service_pattern",
        description: "X63 service was renamed QM63.",
      }, {
        clause_kind: "context",
        source_quote: "Get more details on QM63 service.",
        review_rationale: "Navigation text.",
      }, {
        clause_kind: "context",
        source_quote: "View the new QM63 timetable.",
        review_rationale: "Navigation text.",
      }],
    };
    const qm63 = record("route_qm63", "route", { route_id: "QM63", route_name: "QM63" });
    const proposal = expandQbnrRecoveryBatch(spec(rename), { blocks: [oldBlock, currentBlock], records: records(qm63) });
    const bindings = [
      ...proposal.observations.flatMap((observation) => observation.evidence_bindings),
      ...proposal.relations.flatMap((relation) => relation.evidence_bindings),
    ];
    expect(new Set(bindings.map((binding) => binding.block_id))).toEqual(new Set([currentBlock.block_id]));
    expect(proposal.relations).toHaveLength(3);
    const relationTriples = new Set(
      proposal.relations.map((relation) => `${relation.relation_kind}|${JSON.stringify(relation.subject)}|${JSON.stringify(relation.object)}`),
    );
    expect(relationTriples.size).toBe(proposal.relations.length);

    const changedCurrent = block(currentBlock.block_id, currentBlock.raw_text.replace(description, `${description} Extra context.`));
    const changedSpec = structuredClone(rename);
    changedSpec.source_block_sha256s[1] = changedCurrent.raw_text_sha256;
    expect(() => expandQbnrRecoveryBatch(spec(changedSpec), { blocks: [oldBlock, changedCurrent], records: records(qm63) }))
      .toThrow("paired rename description cells differ");

    const changedEvent = block(currentBlock.block_id, currentBlock.raw_text.replace(event, "The X63 became the QM63 on July 1, 2025."));
    const changedEventSpec = structuredClone(rename);
    changedEventSpec.source_block_sha256s[1] = changedEvent.raw_text_sha256;
    expect(() => expandQbnrRecoveryBatch(spec(changedEventSpec), { blocks: [oldBlock, changedEvent], records: records(qm63) }))
      .toThrow("paired rename event cells differ");
  });

  it("enforces atomic/bundle treatment cardinality and strict create-or-target resolution", () => {
    const atomic = atomicQ3Unit();
    atomic.occurrence_shape = "bundle";
    expect(() => expandQbnrRecoveryBatch(spec(atomic), { blocks: [q3Block], records: records(q3Route) }))
      .toThrow("bundle occurrence must have at least two treatment clauses");

    const create = atomicQ3Unit();
    create.route_resolution = { mode: "create" };
    const created = expandQbnrRecoveryBatch(spec(create), { blocks: [q3Block], records: records() });
    expect(created.observations[0]).toMatchObject({ expected_record_id: "route_q3-qbnr-2025" });
    expect(created.observations[0]?.target_record_id).toBeUndefined();
    expect(() => expandQbnrRecoveryBatch(spec(create), { blocks: [q3Block], records: records(q3Route) }))
      .toThrow("requests route creation but canonical route route_q3 already identifies Q3");
  });
});
