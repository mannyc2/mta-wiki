import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import { buildCanonicalizeValidationContext, validateCanonicalizeEnvelope } from "@mta-wiki/agents/canonicalize";
import { applyCanonicalizeDecisions } from "@mta-wiki/pipeline/records/canonicalize-apply";
import { canonicalizeDir } from "@mta-wiki/agents/canonicalize";
import type { CanonicalizeDecision, CanonicalizePacket } from "@mta-wiki/pipeline/records/canonicalize-packets";
import { generateCrossSourceRelationCandidates } from "@mta-wiki/pipeline/identity/cross-source-candidates";
import type { MtaCanonicalRecord, StagedSourceBlock } from "@mta-wiki/db/types";

const sourceId = "test_canonicalize_source";
const blockText = "The M86 Select Bus Service operates on 86th Street in Manhattan.";

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fixtureBlock(block_id: string, raw_text: string): StagedSourceBlock {
  return {
    source_id: sourceId,
    block_id,
    page_number: 1,
    reading_order: 1,
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

function record(recordId: string, kind: MtaCanonicalRecord["record_kind"], overrides: Partial<MtaCanonicalRecord> = {}): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: kind,
    source_id: sourceId,
    source_ids: [sourceId],
    local_observation_id: recordId,
    display_name: recordId,
    payload: {},
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-09T00:00:00.000Z",
    ...overrides,
  };
}

function identityPacket(): CanonicalizePacket {
  return {
    packet_id: "route-identity",
    packet_kind: "identity",
    run_id: "test-run",
    kind: "route",
    observation_count: 2,
    observations: [
      {
        submission_id: "sub_1",
        local_observation_id: "route_m86_obs",
        observation_kind: "route",
        source_id: sourceId,
        base_record_id: "route_m86-sbs-new",
        label: "M86 SBS",
        payload: {},
        evidence_quotes: [],
        evidence_refs: [],
      },
      {
        submission_id: "sub_2",
        local_observation_id: "route_uncovered_obs",
        observation_kind: "route",
        source_id: sourceId,
        base_record_id: "route_q44",
        label: "Q44",
        payload: {},
        evidence_quotes: [],
        evidence_refs: [],
      },
    ],
    registry_mode: "full",
    registry_cards: [],
    do_not_merge_pairs: [],
    existing_relation_keys: [],
  };
}

const sourceDir = join(repoRoot, "raw", "sources", sourceId);

beforeAll(() => {
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(sourceDir, "blocks.jsonl"), `${JSON.stringify(fixtureBlock("p001_c0001", blockText))}\n`, "utf8");
  writeFileSync(join(sourceDir, "metadata.json"), `${JSON.stringify({ sourceId })}\n`, "utf8");
});

afterAll(() => {
  rmSync(sourceDir, { recursive: true, force: true });
  rmSync(canonicalizeDir("test-canonicalize-apply-run"), { recursive: true, force: true });
});

describe("validateCanonicalizeEnvelope", () => {
  const records = [
    record("route_m86-sbs", "route"),
    record("route_m86-sbs-new", "route"),
    record("project_demo", "project"),
    record("metric_demo", "metric_claim"),
    record("entity_collide", "entity"),
    record("entity_collide_2", "entity"),
  ];
  const context = buildCanonicalizeValidationContext(records);

  it("validates a link decision with evidence and quarantines unknown targets and uncovered observations", () => {
    const envelope = {
      packet_id: "route-identity",
      decisions: [
        {
          decision_id: "d1",
          local_observation_id: "route_m86_obs",
          decision: "link",
          target_record_id: "route_m86-sbs",
          rationale: "same route variant",
          evidence_refs: [{ source_id: sourceId, block_id: "p001_c0001", source_quote: "M86 Select Bus Service" }],
        },
      ],
    };
    const { validated, quarantined } = validateCanonicalizeEnvelope(identityPacket(), envelope, context);
    expect(validated).toHaveLength(1);
    expect(validated[0]?.base_record_id).toBe("route_m86-sbs-new");
    expect(validated[0]?.submission_id).toBe("sub_1");
    // route_uncovered_obs got no decision -> implicit uncertain quarantine row.
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]?.local_observation_id).toBe("route_uncovered_obs");
  });

  it("quarantines link decisions whose evidence quote is not in the block", () => {
    const envelope = {
      packet_id: "route-identity",
      decisions: [
        {
          decision_id: "d1",
          local_observation_id: "route_m86_obs",
          decision: "link",
          target_record_id: "route_m86-sbs",
          rationale: "same route",
          evidence_refs: [{ source_id: sourceId, block_id: "p001_c0001", source_quote: "B44 corridor" }],
        },
      ],
    };
    const { validated, quarantined } = validateCanonicalizeEnvelope(identityPacket(), envelope, context);
    expect(validated).toHaveLength(0);
    expect(JSON.stringify(quarantined)).toContain("not present in block");
  });

  it("rejects unknown targets, kind mismatches, and disallowed decision types", () => {
    const envelope = {
      packet_id: "route-identity",
      decisions: [
        { decision_id: "d1", local_observation_id: "route_m86_obs", decision: "link", target_record_id: "route_missing", rationale: "x" },
        { decision_id: "d2", local_observation_id: "route_uncovered_obs", decision: "relate", rationale: "x" },
      ],
    };
    const { validated, quarantined } = validateCanonicalizeEnvelope(identityPacket(), envelope, context);
    expect(validated).toHaveLength(0);
    const issues = JSON.stringify(quarantined);
    expect(issues).toContain("does not exist");
    expect(issues).toContain("route_missing");
    expect(issues).toContain("decision must be one of link, new, uncertain");
  });

  it("flags base-id collisions so a bare-base alias cannot merge two identities", () => {
    const packet: CanonicalizePacket = {
      ...identityPacket(),
      packet_id: "entity-identity",
      kind: "entity",
      observation_count: 1,
      observations: [
        {
          submission_id: "sub_3",
          local_observation_id: "entity_obs",
          observation_kind: "entity",
          source_id: sourceId,
          base_record_id: "entity_collide",
          payload: {},
          evidence_quotes: [],
          evidence_refs: [],
        },
      ],
    };
    const envelope = {
      packet_id: "entity-identity",
      decisions: [
        {
          decision_id: "d1",
          local_observation_id: "entity_obs",
          decision: "link",
          target_record_id: "project_demo",
          rationale: "x",
          evidence_refs: [{ source_id: sourceId, block_id: "p001_c0001" }],
        },
      ],
    };
    const { validated, quarantined } = validateCanonicalizeEnvelope(packet, envelope, context);
    expect(validated).toHaveLength(0);
    const issues = JSON.stringify(quarantined);
    expect(issues).toContain("maps to multiple materialized identities");
    expect(issues).toContain("is project, not entity");
  });

  it("validates relate decisions with endpoint shape checks", () => {
    const packet: CanonicalizePacket = {
      ...identityPacket(),
      packet_id: "relation-linker",
      packet_kind: "relation_linker",
      kind: "relation_linker",
      observation_count: 1,
      observations: [
        {
          submission_id: "sub_4",
          local_observation_id: "metric_obs",
          observation_kind: "metric_claim",
          source_id: sourceId,
          base_record_id: "metric_demo",
          record_id: "metric_demo",
          payload: {},
          evidence_quotes: [],
          evidence_refs: [],
        },
      ],
    };
    const good = {
      packet_id: "relation-linker",
      decisions: [
        {
          decision_id: "d1",
          local_observation_id: "metric_obs",
          decision: "relate",
          rationale: "stated",
          proposed_relations: [
            {
              relation_kind: "has_metric",
              subject_id: "project_demo",
              object_id: "metric_demo",
              evidence_refs: [{ source_id: sourceId, block_id: "p001_c0001", source_quote: "86th Street" }],
            },
          ],
        },
      ],
    };
    expect(validateCanonicalizeEnvelope(packet, good, context).validated).toHaveLength(1);

    const badShape = JSON.parse(JSON.stringify(good)) as typeof good;
    badShape.decisions[0]!.proposed_relations[0]!.subject_id = "metric_demo";
    badShape.decisions[0]!.proposed_relations[0]!.object_id = "project_demo";
    const { validated, quarantined } = validateCanonicalizeEnvelope(packet, badShape, context);
    expect(validated).toHaveLength(0);
    expect(JSON.stringify(quarantined)).toContain("has_metric expects");
  });
});

describe("applyCanonicalizeDecisions (dry run)", () => {
  const runId = "test-canonicalize-apply-run";

  function decision(overrides: Partial<CanonicalizeDecision>): CanonicalizeDecision {
    return {
      decision_id: "d1",
      run_id: runId,
      packet_id: "route-identity",
      packet_kind: "identity",
      kind: "route",
      submission_id: "sub_1",
      local_observation_id: "obs_1",
      source_id: sourceId,
      base_record_id: "route_test-canon-base",
      decision: "link",
      target_record_id: "route_test-canon-target",
      proposed_relations: [],
      rationale: "test",
      evidence_refs: [],
      ...overrides,
    };
  }

  it("plans alias additions for link+pass, do-not-merge for fail, quarantine for unsure", () => {
    const dir = canonicalizeDir(runId);
    mkdirSync(dir, { recursive: true });
    const decisions = [
      decision({ decision_id: "d-pass" }),
      decision({ decision_id: "d-fail", base_record_id: "route_test-canon-fail" }),
      decision({ decision_id: "d-unsure", base_record_id: "route_test-canon-unsure" }),
      decision({ decision_id: "d-uncertain", decision: "uncertain", target_record_id: undefined }),
    ];
    writeFileSync(join(dir, "decisions.jsonl"), `${decisions.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
    const verdicts = [
      { decision_id: "d-pass", verdict: "pass", evidence_checked: [] },
      { decision_id: "d-fail", verdict: "fail", failure_reason: "genuinely different routes", evidence_checked: [] },
      { decision_id: "d-unsure", verdict: "unsure", evidence_checked: [] },
    ];
    writeFileSync(join(dir, "verdicts.jsonl"), `${verdicts.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");

    const report = applyCanonicalizeDecisions(runId);
    expect(report.dry_run).toBe(true);
    expect(report.wrote).toBe(false);
    expect(report.alias_additions).toHaveLength(1);
    expect(report.alias_additions[0]).toMatchObject({ kind: "route", alias: "route_test-canon-base", target: "route_test-canon-target" });
    expect(report.do_not_merge_additions).toHaveLength(1);
    expect(report.do_not_merge_additions[0]?.reason).toBe("genuinely different routes");
    expect(report.quarantined).toBe(2);
    expect(report.conflicts).toHaveLength(0);
    expect(existsSync(join(dir, "apply-report.json"))).toBe(true);
  });
});

describe("generateCrossSourceRelationCandidates", () => {
  it("finds verbatim cross-source mentions and skips same-source or already-linked pairs", () => {
    const records: MtaCanonicalRecord[] = [
      record("project_busway", "project", {
        source_id: "source_a",
        source_ids: ["source_a"],
        raw_text: "The busway expands Select Bus Service along the Fordham Road corridor.",
        display_name: "Busway Project",
      }),
      record("corridor_fordham-road", "corridor", {
        source_id: "source_b",
        source_ids: ["source_b"],
        display_name: "Fordham Road",
      }),
      record("corridor_same-source", "corridor", {
        source_id: "source_a",
        source_ids: ["source_a"],
        display_name: "Fordham Road corridor",
      }),
    ];

    const candidates = generateCrossSourceRelationCandidates(records);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      mentioning_record_id: "project_busway",
      mentioned_record_id: "corridor_fordham-road",
      mentioned_name: "Fordham Road",
    });

    const withEdge = [
      ...records,
      record("relation_existing", "relation", {
        payload: { relation_kind: "uses_corridor", subject_id: "project_busway", object_id: "corridor_fordham-road" },
      }),
    ];
    expect(generateCrossSourceRelationCandidates(withEdge)).toHaveLength(0);
  });
});
