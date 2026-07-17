import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { evidenceId, readStagedSourceBlocks, sourceBlockById, sourceBlocksRelativePath } from "@mta-wiki/pipeline/sources/source-prep";
import {
  createSubmissionEntry,
  directCanonicalRelationEndpointIssues,
  relationEndpointIssues,
} from "@mta-wiki/pipeline/records/submissions";
import type { MtaSubmitObservationInput, StagedSourceBlock } from "@mta-wiki/db/types";

const sourceId = "test_submission_chandra_source";

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fixtureBlock(block_id: string, raw_text: string, reading_order: number): StagedSourceBlock {
  return {
    source_id: sourceId,
    block_id,
    page_number: 1,
    reading_order,
    source_surface: "chandra_ocr",
    block_kind: "text",
    raw_source_path: `raw/sources/${sourceId}/chandra/pages/p001.json`,
    raw_start_char: 0,
    raw_end_char: raw_text.length,
    raw_text,
    normalized_text: raw_text,
    raw_text_sha256: sha256(raw_text),
    normalized_text_sha256: sha256(raw_text),
  };
}

beforeAll(() => {
  const sourceDir = join(repoRoot, "raw", "sources", sourceId);
  rmSync(sourceDir, { recursive: true, force: true });
  mkdirSync(sourceDir, { recursive: true });
  const blocks = [
    fixtureBlock("p001_c0001", "M86 SBS launched in July 2015.", 1),
    fixtureBlock("p001_c0002", "Queue jump lanes were implemented on July 13, 2015.", 2),
  ];
  writeFileSync(join(sourceDir, "blocks.jsonl"), `${blocks.map((block) => JSON.stringify(block)).join("\n")}\n`, "utf8");
});

afterAll(() => {
  rmSync(join(repoRoot, "raw", "sources", sourceId), { recursive: true, force: true });
});

function citationBlocks() {
  const blocks = readStagedSourceBlocks(sourceId)
    .filter((candidate) => !candidate.child_block_ids?.length && candidate.block_kind !== "discard")
    .sort((a, b) => a.page_number - b.page_number || a.reading_order - b.reading_order);
  const rawBlocks = blocks.filter((candidate) => candidate.source_surface === "chandra_ocr");
  return rawBlocks.length > 0 ? rawBlocks : blocks;
}

function firstBlock() {
  const block = citationBlocks()[0] ?? readStagedSourceBlocks(sourceId)[0];
  if (!block) throw new Error("Expected test source block fixture");
  return block;
}

function firstSamePageAtomicRange() {
  const blocks = citationBlocks();
  for (let index = 0; index < blocks.length - 1; index += 1) {
    const start = blocks[index]!;
    const end = blocks[index + 1]!;
    if (start.page_number === end.page_number) return { start, end, blockRange: `${start.block_id}..${end.block_id}` };
  }
  throw new Error("Expected adjacent same-page source blocks for range fixture");
}

function evidenceRef(role = "date") {
  const block = firstBlock();
  return {
    source_id: sourceId,
    evidence_id: evidenceId(sourceId, block.block_id),
    block_id: block.block_id,
    role,
  };
}

function observationInput(): MtaSubmitObservationInput {
  return {
    source_id: sourceId,
    observation_kind: "event",
    local_observation_id: "event_m86_sbs_launch_2015_07",
    label: "M86 SBS launches",
    payload: {
      event_kind: "launch",
      date_text: "July 2015",
    },
    evidence_refs: [evidenceRef()],
  };
}

describe("createSubmissionEntry", () => {
  it("uses tool args, not run id or timestamp, for submission identity", () => {
    const input = observationInput();
    const first = createSubmissionEntry("run_a", input, "2026-06-07T00:00:00.000Z");
    const second = createSubmissionEntry("run_b", input, "2026-06-08T00:00:00.000Z");

    expect(first.submission_id).toBe(second.submission_id);
    expect(first.tool_args_sha256).toBe(second.tool_args_sha256);
    expect(first.run_id).not.toBe(second.run_id);
  });

  it("rejects evidence refs without a block", () => {
    const input = observationInput();
    const entry = createSubmissionEntry("run", {
      ...input,
      evidence_refs: [{ source_id: input.source_id }],
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain("block_id is required");
  });

  it("rejects observations without evidence refs", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      evidence_refs: [],
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain("evidence_refs must include at least one source block");
  });

  it("computes raw hashes for block evidence refs", () => {
    const block = firstBlock();
    const input = observationInput();
    const entry = createSubmissionEntry("run", input);

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.evidence_refs?.[0]).toEqual({
      source_id: sourceId,
      evidence_id: evidenceId(sourceId, block.block_id),
      source_path: sourceBlocksRelativePath(sourceId),
      page_number: block.page_number,
      block_id: block.block_id,
      role: "date",
      text_sha256: block.raw_text_sha256,
      text_source: "raw_text",
    });
  });

  it("ignores model-supplied hashes and recomputes them from blocks", () => {
    const block = firstBlock();
    const input = observationInput();
    const entry = createSubmissionEntry("run", {
      ...input,
      evidence_refs: [
        {
          ...input.evidence_refs![0],
          text_sha256: "sha256:bad",
        },
      ],
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.evidence_refs?.[0]?.text_sha256).toBe(block.raw_text_sha256);
    expect(entry.tool_args.evidence_refs?.[0]?.text_source).toBe("raw_text");
  });

  it("normalizes same-page block ranges into citeable evidence refs", () => {
    const { start, end, blockRange } = firstSamePageAtomicRange();
    const rangeBlock = sourceBlockById(sourceId, blockRange);
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      evidence_refs: [
        {
          source_id: sourceId,
          block_range: blockRange,
          role: "section_context",
        },
      ],
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.evidence_refs?.[0]).toMatchObject({
      source_id: sourceId,
      evidence_id: evidenceId(sourceId, blockRange),
      source_path: sourceBlocksRelativePath(sourceId),
      page_number: start.page_number,
      block_id: blockRange,
      block_range: blockRange,
      child_block_ids: [start.block_id, end.block_id],
      role: "section_context",
      text_sha256: rangeBlock.raw_text_sha256,
      text_source: "raw_text",
    });
  });

  it("accepts agent-visible source block aliases and optional source quotes", () => {
    const block = firstBlock();
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      evidence_refs: [
        {
          source_id: sourceId,
          evidence_id: evidenceId(sourceId, "p001_b0001"),
          block_id: "p001_b0001",
          source_quote: "M86 SBS launched",
        },
      ],
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.evidence_refs?.[0]).toMatchObject({
      source_id: sourceId,
      evidence_id: evidenceId(sourceId, block.block_id),
      block_id: block.block_id,
      source_quote: "M86 SBS launched",
      text_sha256: block.raw_text_sha256,
    });
  });

  it("rejects source quotes that are not present in the cited block", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      evidence_refs: [
        {
          source_id: sourceId,
          block_id: "p001_b0001",
          source_quote: "not in this block",
        },
      ],
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain("source_quote is not present");
  });

  it("rejects exact text evidence refs without a block handle", () => {
    const input = observationInput();
    const entry = createSubmissionEntry("run", {
      ...input,
      evidence_refs: [
        {
          source_id: input.source_id,
          text: "M86 Select Bus Service",
          role: "title",
        } as never,
      ],
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain("block_id is required");
  });

  it("normalizes stringified JSON payloads into objects", () => {
    const input = observationInput();
    const entry = createSubmissionEntry("run", {
      ...input,
      payload: "{\"event_kind\":\"launch\",\"date_text\":\"July 2015\"}" as never,
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.payload).toMatchObject({
      event_kind: "launch",
      date_text: "July 2015",
      date_text_normalized: {
        normalized_date: "2015-07",
        precision: "month",
      },
    });
  });

  it("flags relation endpoints that do not point to known local observations", () => {
    const input = observationInput();
    const issues = relationEndpointIssues(
      {
        ...input,
        observation_kind: "relation",
        local_observation_id: "rel_project_has_launch_event",
        payload: {
          relation_kind: "has_timeline_event",
          subject_local_observation_id: "project_m86_sbs_conversion",
          object_local_observation_id: "event_m86_sbs_launch",
        },
      },
      new Set(["project_m86_sbs_conversion"]),
    );

    expect(issues.join("\n")).toContain('object_local_observation_id references missing local observation id "event_m86_sbs_launch"');
  });

  it("rejects relation payloads that normalize to unparsed text", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "relation",
      local_observation_id: "rel_project_has_launch_event",
      payload: '{"relation_kind": has_timeline_event, "subject_local_observation_id": "project_m86_sbs", "object_local_observation_id": "event_m86_sbs_launch"}' as never,
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain("relation payload must be structured JSON");
  });

  it("keeps affects_route as a distinct relation kind", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "relation",
      local_observation_id: "rel_project_affects_route",
      payload: {
        relation_kind: "affects_route",
        subject_local_observation_id: "project_m86_sbs",
        object_local_observation_id: "route_m86_sbs",
      },
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.payload).toMatchObject({
      relation_kind: "affects_route",
    });
  });

  it("accepts direct canonical relation endpoints with an allowed typed shape", () => {
    const issues = directCanonicalRelationEndpointIssues({
      ...observationInput(),
      observation_kind: "relation",
      local_observation_id: "rel_qbnr_affects_b57",
      payload: {
        relation_kind: "affects_route",
        relation_family: "route_scope",
        subject_id: "project_queens-bus-network-redesign",
        object_id: "route_b57-grand-ave-2024",
      },
    });

    expect(issues).toEqual([]);
  });

  it("fails closed for dangling, alias, and wrong-type direct relation endpoints", () => {
    const dangling = directCanonicalRelationEndpointIssues({
      ...observationInput(),
      observation_kind: "relation",
      local_observation_id: "rel_dangling",
      payload: {
        relation_kind: "affects_route",
        relation_family: "route_scope",
        subject_id: "project_does_not_exist",
        object_id: "route_b57-grand-ave-2024",
      },
    });
    const alias = directCanonicalRelationEndpointIssues({
      ...observationInput(),
      observation_kind: "relation",
      local_observation_id: "rel_ambiguous",
      payload: {
        relation_kind: "affects_route",
        relation_family: "route_scope",
        subject_id: "project_queens-bus-network-redesign",
        object_id: "route_q48",
      },
    });
    const wrongType = directCanonicalRelationEndpointIssues({
      ...observationInput(),
      observation_kind: "relation",
      local_observation_id: "rel_wrong_type",
      payload: {
        relation_kind: "affects_route",
        relation_family: "route_scope",
        subject_id: "route_b57-grand-ave-2024",
        object_id: "route_b57-grand-ave-2024",
      },
    });
    const wrongFamilyTuple = directCanonicalRelationEndpointIssues({
      ...observationInput(),
      observation_kind: "relation",
      local_observation_id: "rel_wrong_family_tuple",
      payload: {
        relation_kind: "affects_route",
        relation_family: "agency_role",
        subject_id: "project_queens-bus-network-redesign",
        object_id: "route_b57-grand-ave-2024",
      },
    });

    expect(dangling.join("\n")).toContain("missing canonical physical record project_does_not_exist");
    expect(alias.join("\n")).toContain(
      "alias id route_q48; rewrite it to canonical physical record route_q48-glen-oaks-2025",
    );
    expect(wrongType.join("\n")).toContain("family/endpoint tuple route_scope/route->route is not allowed");
    expect(wrongFamilyTuple.join("\n")).toContain("family/endpoint tuple agency_role/project->route is not allowed");
  });

  it("normalizes metric string values into numeric payload fields", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "metric_claim",
      local_observation_id: "metric_travel_time_reduction",
      payload: {
        metric_name: "travel_time_reduction",
        value: "8-11",
        unit: "percent",
      },
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.payload).toMatchObject({
      metric_name: "travel_time_reduction",
      value_min: 8,
      value_max: 11,
      raw_value_text: "8-11",
      unit: "percent",
    });
    expect(entry.tool_args.payload?.value).toBeUndefined();
  });

  it("adds normalized unit companions while preserving metric unit literals", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "metric_claim",
      local_observation_id: "metric_average_speed",
      payload: {
        metric_name: "Average Speed",
        raw_value_text: "8",
        value: 8,
        units: "miles_per_hour",
        direction: "NB",
      },
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.payload).toMatchObject({
      unit: "miles_per_hour",
      units: "miles_per_hour",
      unit_normalized: {
        raw_text: "miles_per_hour",
        normalized_unit: "mph",
        unit_family: "speed",
      },
      direction_normalized: {
        raw_text: "NB",
        normalized_value: "northbound",
      },
    });
    expect(entry.validation.warnings?.some((warning) => warning.includes("prefer unit"))).toBe(true);
  });

  it("aliases metric value_unit to unit when the preferred unit field is absent", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "metric_claim",
      local_observation_id: "metric_same_stop_riders",
      payload: {
        metric_name: "Same-stop riders",
        value: 44,
        value_unit: "percent",
      },
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.payload).toMatchObject({
      unit: "percent",
      value_unit: "percent",
      unit_normalized: {
        raw_text: "percent",
        normalized_unit: "percent",
        unit_family: "percentage",
      },
    });
    expect(entry.validation.warnings?.some((warning) => warning.includes("prefer unit"))).toBe(true);
  });

  it("maps reviewed metric unit literals out of the other bucket", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "metric_claim",
      local_observation_id: "metric_capital_budget",
      payload: {
        metric_name: "Capital budget",
        value: 12,
        unit: "million_dollars",
      },
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.payload?.unit_normalized).toEqual({
      raw_text: "million_dollars",
      normalized_unit: "dollars",
      unit_family: "money",
      scale: 1_000_000,
    });

    for (const [unit, scale] of [
      ["$ in millions", 1_000_000],
      ["million USD", 1_000_000],
      ["millions of dollars", 1_000_000],
      ["$M", 1_000_000],
      ["USD millions", 1_000_000],
      ["thousands of dollars", 1_000],
      ["billion USD", 1_000_000_000],
      ["billion dollars", 1_000_000_000],
      ["$ (millions)", 1_000_000],
      ["thousand USD", 1_000],
      ["dollars_millions", 1_000_000],
      ["dollars in millions", 1_000_000],
      ["USD M", 1_000_000],
      ["$B", 1_000_000_000],
      ["$ B", 1_000_000_000],
      ["$ in billions", 1_000_000_000],
      ["USD million", 1_000_000],
      ["$ billions", 1_000_000_000],
      ["millions USD", 1_000_000],
      ["thousands USD", 1_000],
      ["USD $M", 1_000_000],
      ["USD billion", 1_000_000_000],
    ] as const) {
      const scaledMoneyEntry = createSubmissionEntry("run", {
        ...observationInput(),
        observation_kind: "metric_claim",
        local_observation_id: `metric_money_${unit.replace(/\W+/g, "_").toLowerCase() || "dollars"}`,
        payload: {
          metric_name: "Capital budget",
          value: 12,
          unit,
        },
      });

      expect(scaledMoneyEntry.validation.state).toBe("accepted");
      expect(scaledMoneyEntry.tool_args.payload?.unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: "dollars",
        unit_family: "money",
        scale,
      });
    }

    for (const [unit, normalizedUnit] of [
      ["USD per gallon", "dollars_per_gallon"],
      ["dollars per gallon", "dollars_per_gallon"],
      ["USD per passenger", "dollars_per_passenger"],
      ["$ per passenger", "dollars_per_passenger"],
      ["USD/year", "dollars_per_year"],
      ["dollars_per_gallon", "dollars_per_gallon"],
      ["USD/gallon", "dollars_per_gallon"],
      ["dollars per passenger", "dollars_per_passenger"],
      ["USD per square foot", "dollars_per_square_foot"],
      ["USD/hour", "dollars_per_hour"],
      ["$/gallon", "dollars_per_gallon"],
      ["$/passenger", "dollars_per_passenger"],
      ["dollars per square foot", "dollars_per_square_foot"],
      ["USD per vehicle", "dollars_per_vehicle"],
      ["USD per hour", "dollars_per_hour"],
    ] as const) {
      const moneyRateEntry = createSubmissionEntry("run", {
        ...observationInput(),
        observation_kind: "metric_claim",
        local_observation_id: `metric_money_rate_${unit.replace(/\W+/g, "_").toLowerCase() || "dollars"}`,
        payload: {
          metric_name: "Unit cost",
          value: 12,
          unit,
        },
      });

      expect(moneyRateEntry.validation.state).toBe("accepted");
      expect(moneyRateEntry.tool_args.payload?.unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: "money_rate",
      });
    }

    const countEntry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "metric_claim",
      local_observation_id: "metric_major_felonies",
      payload: {
        metric_name: "Major felonies",
        value: 114,
        unit: "count",
      },
    });

    expect(countEntry.validation.state).toBe("accepted");
    expect(countEntry.tool_args.payload?.unit_normalized).toEqual({
      raw_text: "count",
      normalized_unit: "count",
      unit_family: "count",
    });

    for (const [unit, normalizedUnit] of [
      ["employees", "employees"],
      ["positions", "positions"],
      ["full-time equivalents", "full_time_equivalents"],
      ["Full-Time Equivalents", "full_time_equivalents"],
      ["FTE", "full_time_equivalents"],
      ["full-time equivalents (FTE)", "full_time_equivalents"],
      ["full-time positions", "positions"],
      ["full-time and full-time equivalent positions", "positions"],
    ] as const) {
      const workforceEntry = createSubmissionEntry("run", {
        ...observationInput(),
        observation_kind: "metric_claim",
        local_observation_id: `metric_workforce_${unit.replace(/\W+/g, "_").toLowerCase()}`,
        payload: {
          metric_name: "Total positions",
          value: 12,
          unit,
        },
      });

      expect(workforceEntry.validation.state).toBe("accepted");
      expect(workforceEntry.tool_args.payload?.unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: "workforce",
      });
    }

    for (const [unit, normalizedUnit, family, scale] of [
      ["million passengers", "riders", "ridership", 1_000_000],
      ["million rides", "rides", "ridership", 1_000_000],
      ["million trips", "trips", "ridership", 1_000_000],
      ["million customers", "riders", "ridership", 1_000_000],
      ["million vehicles", "vehicles", "count", 1_000_000],
      ["million crossings", "crossings", "count", 1_000_000],
      ["millions of vehicles", "vehicles", "count", 1_000_000],
    ] as const) {
      const scaledCountEntry = createSubmissionEntry("run", {
        ...observationInput(),
        observation_kind: "metric_claim",
        local_observation_id: `metric_scaled_${unit.replace(/\W+/g, "_").toLowerCase()}`,
        payload: {
          metric_name: "Ridership or traffic volume",
          value: 12,
          unit,
        },
      });

      expect(scaledCountEntry.validation.state).toBe("accepted");
      expect(scaledCountEntry.tool_args.payload?.unit_normalized).toEqual({
        raw_text: unit,
        normalized_unit: normalizedUnit,
        unit_family: family,
        scale,
      });
    }

    const boardingsEntry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "metric_claim",
      local_observation_id: "metric_boardings",
      payload: {
        metric_name: "Weekday bus boardings",
        value: 32630,
        unit: "boardings",
      },
    });

    expect(boardingsEntry.validation.state).toBe("accepted");
    expect(boardingsEntry.tool_args.payload?.unit_normalized).toEqual({
      raw_text: "boardings",
      normalized_unit: "boardings",
      unit_family: "ridership",
    });
  });

  it("adds normalized companions for open claim type labels", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "claim",
      local_observation_id: "claim_service_change",
      payload: {
        claim_text: "The route would be changed.",
        data_type: "survey result",
        change_type: "Route Change",
      },
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.payload).toMatchObject({
      data_type_normalized: {
        raw_text: "survey result",
        normalized_value: "survey_result",
      },
      change_type_normalized: {
        raw_text: "Route Change",
        normalized_value: "route_change",
      },
    });
  });

  it("records MTA internal authority for plus-suffixed route ids", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "route",
      local_observation_id: "route_b44_plus",
      label: "B44+",
      payload: {
        route_id: "B44+",
        route_type: "select_bus_service",
      },
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.payload).toMatchObject({
      route_id: "B44+",
      internal_route_id: "B44+",
      route_id_authority: "mta_internal",
      source_route_surface: "mta_route_id",
      route_type_normalized: "select_bus_service",
      service_variant: "sbs",
    });
  });

  it("rejects targeting an SBS route with a local-service route payload", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "route",
      local_observation_id: "route_m86_local",
      target_record_id: "route_m86-sbs",
      label: "M86 Local",
      payload: {
        route_id: "M86",
        route_label: "M86 Local",
        route_type: "Local",
      },
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain('target_record_id route_m86-sbs implies service_variant "sbs"');
    expect(entry.validation.issues.join("\n")).toContain('payload implies "local"');
  });

  it("rejects targeting a local-limited bundle with a limited-only route payload", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "route",
      local_observation_id: "route_m15_limited",
      target_record_id: "route_m15-local-limited",
      label: "M15 Limited",
      payload: {
        route_id: "M15",
        route_label: "M15 Limited",
        route_type: "Limited",
      },
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain('target_record_id route_m15-local-limited implies service_variant "local_limited"');
    expect(entry.validation.issues.join("\n")).toContain('payload implies "limited_stop"');
  });

  it("rejects slash-combined route service variants as one route identity", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "route",
      local_observation_id: "route_bx12_sbs_local",
      target_record_id: "route_bx12-plus",
      label: "Bx12 SBS/Local",
      payload: {
        route_id: "Bx12",
        route_name: "Bx12 SBS/Local",
        route_type: "select_bus_service",
      },
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain("combined service variant");
  });

  it("rejects local-limited route bundles as one pure route variant", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "route",
      local_observation_id: "route_m15_local_limited",
      label: "M15 Local/Limited",
      payload: {
        route_id: "M15",
        source_route_type_phrase: "Local/Limited",
        route_type: "limited",
      },
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain("combined service variant");
  });

  it("rejects generic S shuttle routes without route-name disambiguation", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "route",
      local_observation_id: "route_s_shuttle",
      label: "S Shuttle",
      payload: {
        route_id: "S",
        route_type: "shuttle",
      },
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain('route_id "S" and shuttle type must include a disambiguating');
  });

  it("accepts ordinary SBS route labels as one SBS route identity", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "route",
      local_observation_id: "route_bx12_sbs",
      target_record_id: "route_bx12-plus",
      label: "Bx12-SBS",
      payload: {
        route_id: "Bx12-SBS",
        route_label: "Bx12-SBS",
      },
    });

    expect(entry.validation.state).toBe("accepted");
  });

  it("rejects slash-delimited contact lists as person entities", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "entity",
      local_observation_id: "entity_scott_gastel_alana_morales",
      label: "Scott Gastel/Alana Morales, DOT Press Contacts",
      payload: {
        entity_name: "Scott Gastel/Alana Morales",
        entity_type: "person",
        description: "DOT press contacts",
      },
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain("multiple slash-delimited people");
  });

  it("adds broad normalized companions for project, event, treatment, and borough fields", () => {
    const project = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "project",
      local_observation_id: "project_test_busway",
      payload: {
        project_name: "Test Busway",
        project_type: "busway pilot",
        status: "scheduled for implementation summer 2025",
        borough: "the Bronx",
      },
    });
    const event = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "event",
      local_observation_id: "event_dataset_release",
      payload: {
        event_kind: "dataset_release",
        date_text: "2025",
      },
    });
    const treatment = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "treatment_component",
      local_observation_id: "treatment_bus_lane",
      payload: {
        treatment_kind: "protected_bus_lane",
        description: "Protected bus lane",
      },
    });

    expect(project.validation.state).toBe("accepted");
    expect(project.tool_args.payload).toMatchObject({
      document_time_status: "planned",
      project_family: "busway",
      borough_normalized: "bronx",
    });
    expect(event.validation.state).toBe("accepted");
    expect(event.tool_args.payload?.event_family).toBe("data_release");
    expect(treatment.validation.state).toBe("accepted");
    expect(treatment.tool_args.payload?.treatment_family).toBe("bus_lane");
  });

  it("rejects table submissions because source table content should be cited directly", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "table",
      local_observation_id: "table_route_speeds",
      payload: {
        table_title: "Route speeds",
      },
    });

    expect(entry.validation.state).toBe("rejected");
    expect(entry.validation.issues.join("\n")).toContain("table observation_kind is deprecated");
  });

  it("adds normalized companion fields for date and street-like location text", () => {
    const entry = createSubmissionEntry("run", {
      ...observationInput(),
      observation_kind: "treatment_component",
      local_observation_id: "treatment_queue_jump_lanes",
      payload: {
        implementation_date: "July 13, 2015",
        locations: ["E 86th Street westbound approach to 5th Avenue"],
      },
    });

    expect(entry.validation.state).toBe("accepted");
    expect(entry.tool_args.payload?.implementation_date_normalized).toMatchObject({
      normalized_date: "2015-07-13",
      precision: "day",
    });
    expect(entry.tool_args.payload?.locations_normalized).toEqual([
      {
        raw_text: "E 86th Street westbound approach to 5th Avenue",
        direction: "westbound",
        street: "East 86th Street",
        cross_street: "Fifth Avenue",
      },
    ]);
  });
});
