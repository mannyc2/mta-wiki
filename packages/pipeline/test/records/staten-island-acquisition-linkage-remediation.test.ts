import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "../../../core/src/paths";
import { stableHash } from "../../../db/src/stable-json";
import type { MtaCanonicalRecord, MtaSubmissionEntry } from "../../../db/src/types";
import { entriesToRecords } from "../../src/materialize/materialize";
import { readCanonicalRecordsFromJsonl } from "../../src/materialize/canonical-read";
import { relationEndpointShapeIssue } from "../../src/records/relations";
import { retiredSubmissionIds } from "../../src/records/submission-overrides";

const JOURNAL_PATH = join(
  repoRoot,
  "data",
  "submissions",
  "2026-07-15T21-00-00-000Z_staten-island-acquisition-linkage-remediation.jsonl",
);
const PHYSICAL_SCOPE_JOURNAL_PATH = join(
  repoRoot,
  "data",
  "submissions",
  "2026-07-15T20-00-00-000Z_bus-lane-treatment-physical-scope-remediation.jsonl",
);
const EVIDENCE_REBLOCKING_JOURNAL_PATH = join(
  repoRoot,
  "data",
  "submissions",
  "2026-07-16T01-30-00-000Z_staten-island-evidence-reblocking-remediation.jsonl",
);
const ARTIFACT_DIR = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "staten-island",
  "linkage-remediation",
);
const EVIDENCE_REBLOCKING_ARTIFACT_PATH = join(
  ARTIFACT_DIR,
  "evidence-reblocking",
  "remediation.json",
);
const SUPPORTED_PATH = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "staten-island",
  "supported-linkage-candidates.jsonl",
);

type CandidateAction = {
  candidate_id: string;
  route_id: string;
  canonical_gtfs_route_id: string;
  corridor_group: "Battery Place" | "Hylan Boulevard" | "Madison Avenue";
  route_binding_action: "added" | "verified_existing";
  project_id: string;
  treatment_id: string;
  corridor_id: string;
  route_record_id: string;
  canonical_links_verified_existing: string[];
  canonical_links_added: string[];
  coordinated_physical_scope_relation_id: string;
  staged_source_ids: string[];
  study_projection_eligible: false;
  remaining_unsupported_claims: string[];
};

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(ARTIFACT_DIR, name), "utf8")) as T;
}

function endpointId(record: MtaCanonicalRecord, side: "subject" | "object"): string {
  const value = record.payload[`${side}_id`];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${record.record_id} lacks ${side}_id`);
  return value;
}

function relationKey(record: MtaCanonicalRecord): string {
  return `${String(record.payload.relation_kind)}\0${endpointId(record, "subject")}\0${endpointId(record, "object")}`;
}

function currentStatenIslandLinkageRecords(): MtaCanonicalRecord[] {
  return entriesToRecords([
    ...readJsonl<MtaSubmissionEntry>(JOURNAL_PATH),
    ...readJsonl<MtaSubmissionEntry>(EVIDENCE_REBLOCKING_JOURNAL_PATH),
  ], { retiredSubmissionIds: retiredSubmissionIds() });
}

describe("Staten Island acquisition linkage remediation", () => {
  it("persists an exact accepted journal and adds no candidate occurrence, segment, phase, or onset", () => {
    const journalText = readFileSync(JOURNAL_PATH, "utf8");
    const entries = readJsonl<MtaSubmissionEntry>(JOURNAL_PATH);
    const summary = readJson<{
      candidate_count: number;
      route_binding_counts: { verified_existing: number; added: number; after_reconciliation: number };
      submission_count: number;
      source_record_additions: number;
      route_record_additions: number;
      relation_additions: number;
      route_relation_additions: number;
      shared_scope_relation_additions: number;
      coordinated_physical_scope_relation_count: number;
      operational_occurrence_additions: number;
      candidate_segment_bindings_added: number;
      candidate_phase_additions: number;
      candidate_onset_additions: number;
      journal_sha256: string;
    }>("summary.json");

    expect(entries).toHaveLength(27);
    expect(entries.every((entry) => entry.validation.state === "accepted" && entry.validation.issues.length === 0)).toBe(true);
    expect(new Set(entries.map((entry) => entry.submission_id)).size).toBe(27);
    for (const entry of entries) {
      const hash = stableHash(entry.tool_args as unknown as Record<string, unknown>);
      expect(entry.submission_id).toBe(`sub_${hash.slice(0, 16)}`);
      expect(entry.tool_args_sha256).toBe(`sha256:${hash}`);
    }
    expect(createHash("sha256").update(journalText).digest("hex")).toBe(summary.journal_sha256);
    expect(summary).toMatchObject({
      candidate_count: 22,
      route_binding_counts: { verified_existing: 10, added: 12, after_reconciliation: 22 },
      submission_count: 27,
      source_record_additions: 1,
      route_record_additions: 12,
      relation_additions: 14,
      route_relation_additions: 12,
      shared_scope_relation_additions: 2,
      coordinated_physical_scope_relation_count: 3,
      operational_occurrence_additions: 0,
      candidate_segment_bindings_added: 0,
      candidate_phase_additions: 0,
      candidate_onset_additions: 0,
    });
    expect(entries.some((entry) => entry.tool_args.observation_kind === "event")).toBe(false);
    expect(entries.some((entry) => [
      "operational_occurrence",
      "segment_id",
      "phase_id",
      "implementation_date",
      "onset_date",
    ].some((key) => key in entry.tool_args.payload))).toBe(false);
  });

  it("materializes 12 compact route endpoints and 14 evidence-backed, endpoint-valid, type-valid relations", () => {
    const replacements = readJsonl<MtaSubmissionEntry>(EVIDENCE_REBLOCKING_JOURNAL_PATH);
    const generated = currentStatenIslandLinkageRecords();
    const generatedByKind = (kind: MtaCanonicalRecord["record_kind"]) => generated.filter((record) => record.record_kind === kind);
    expect(replacements).toHaveLength(20);
    expect(replacements.every((entry) =>
      entry.validation.state === "accepted" &&
      entry.validation.issues.length === 0 &&
      entry.tool_args.evidence_refs.every((ref) =>
        ref.source_id !== "better_buses_action_plan_2019" || /^p0(?:26|28)_c\d{4}$/u.test(ref.block_id ?? "")),
    )).toBe(true);
    expect(generated).toHaveLength(27);
    expect(generatedByKind("source").map((record) => record.record_id)).toEqual(["source_hylan-cb-july-2020"]);
    expect(generatedByKind("route").map((record) => record.record_id).sort()).toEqual([
      "route_s57",
      "route_sim1",
      "route_sim15",
      "route_sim2",
      "route_sim32",
      "route_sim33c",
      "route_sim34",
      "route_sim35",
      "route_sim3c",
      "route_sim5",
      "route_sim7",
      "route_sim9",
    ]);

    const relations = generatedByKind("relation");
    expect(relations).toHaveLength(14);
    const baseline = readCanonicalRecordsFromJsonl();
    const recordsById = new Map<string, MtaCanonicalRecord>();
    for (const record of [...baseline, ...generated]) recordsById.set(record.record_id, record);
    const baselineTripleIds = new Map<string, string[]>();
    for (const relation of baseline.filter((record) => record.record_kind === "relation")) {
      baselineTripleIds.set(relationKey(relation), [...(baselineTripleIds.get(relationKey(relation)) ?? []), relation.record_id]);
    }
    for (const relation of relations) {
      const subject = recordsById.get(endpointId(relation, "subject"));
      const object = recordsById.get(endpointId(relation, "object"));
      expect(subject, `${relation.record_id} subject must resolve`).toBeDefined();
      expect(object, `${relation.record_id} object must resolve`).toBeDefined();
      expect(relationEndpointShapeIssue(String(relation.payload.relation_kind), subject?.record_kind, object?.record_kind)).toBeUndefined();
      expect(relation.evidence_refs.length).toBeGreaterThan(0);
      expect(relation.evidence_refs.every((ref) => Boolean(ref.block_id) && /^sha256:[0-9a-f]{64}$/u.test(ref.text_sha256 ?? ""))).toBe(true);
      expect(relation.evidence_refs.every((ref) => !String(ref.block_id).includes(".."))).toBe(true);
      expect((baselineTripleIds.get(relationKey(relation)) ?? []).filter((recordId) => recordId !== relation.record_id)).toEqual([]);
    }
  });

  it("reconciles all 22 supported rows to a complete route-project-treatment-corridor path", () => {
    const actions = readJson<{ schema_version: 1; candidates: CandidateAction[] }>("candidate-actions.json").candidates;
    const summary = readJson<{ canonical_relation_ids_added: string[] }>("summary.json");
    const supported = readJsonl<{ candidate_id: string; normalized_route_id: string }>(SUPPORTED_PATH);
    const ownGenerated = currentStatenIslandLinkageRecords();
    const physicalGenerated = entriesToRecords(readJsonl<MtaSubmissionEntry>(PHYSICAL_SCOPE_JOURNAL_PATH));
    const baseline = readCanonicalRecordsFromJsonl();
    const allRecords = [...baseline, ...physicalGenerated, ...ownGenerated];
    const byId = new Map(allRecords.map((record) => [record.record_id, record]));
    const relations = allRecords.filter((record) => record.record_kind === "relation");
    const triples = new Set(relations.map(relationKey));

    expect(actions).toHaveLength(22);
    expect(new Set(actions.map((action) => action.candidate_id)).size).toBe(22);
    expect(actions.filter((action) => action.route_binding_action === "verified_existing")).toHaveLength(10);
    expect(actions.filter((action) => action.route_binding_action === "added")).toHaveLength(12);
    expect(actions.every((action) => !action.study_projection_eligible && action.remaining_unsupported_claims.length === 4)).toBe(true);
    expect(actions.map((action) => `${action.candidate_id}\0${action.route_id}`).sort()).toEqual(
      supported.map((row) => `${row.candidate_id}\0${row.normalized_route_id}`).sort(),
    );
    const addedLinkIds = [...new Set(actions.flatMap((action) => action.canonical_links_added))].sort();
    expect(addedLinkIds).toHaveLength(14);
    expect(addedLinkIds).toEqual(summary.canonical_relation_ids_added);

    for (const action of actions) {
      expect(byId.get(action.route_record_id)?.record_kind).toBe("route");
      expect(byId.get(action.project_id)?.record_kind).toBe("project");
      expect(byId.get(action.treatment_id)?.record_kind).toBe("treatment_component");
      expect(byId.get(action.corridor_id)?.record_kind).toBe("corridor");
      expect(triples.has(`serves_route\0${action.project_id}\0${action.route_record_id}`)).toBe(true);
      expect(triples.has(`has_treatment\0${action.project_id}\0${action.treatment_id}`)).toBe(true);
      expect(triples.has(`uses_corridor\0${action.project_id}\0${action.corridor_id}`)).toBe(true);
      expect(triples.has(`located_on_corridor\0${action.treatment_id}\0${action.corridor_id}`)).toBe(true);
      const physical = byId.get(action.coordinated_physical_scope_relation_id);
      expect(physical?.record_kind).toBe("relation");
      expect(physical?.evidence_refs.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("pins unchanged official source bytes, records the evidence reblocking, and proves all 12 new routes existed in immutable rc20 GTFS", () => {
    const sourceVerification = readJson<{
      supported_candidates: { sha256: string; row_count: number };
      sources: Array<{
        source_id: string;
        acquisition_sha256: string;
        staged_pdf_sha256: string;
        staged_pdf_byte_length: number;
        staged_blocks_sha256: string;
        staged_block_count: number;
      }>;
    }>("source-verification.json");
    expect(sourceVerification.supported_candidates).toEqual({
      path: "data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/supported-linkage-candidates.jsonl",
      sha256: "71d39ca53c4816671da2cd0e6905bb359d81660ba14622c50e005c5595cfe2cc",
      row_count: 22,
    });
    expect(sourceVerification.sources.map((source) => ({
      id: source.source_id,
      same: source.acquisition_sha256 === source.staged_pdf_sha256,
      bytes: source.staged_pdf_byte_length,
      blocks: source.staged_block_count,
      blocksHash: source.staged_blocks_sha256,
    }))).toEqual([
      {
        id: "better_buses_action_plan_2019",
        same: true,
        bytes: 8330907,
        blocks: 2215,
        blocksHash: "f1d61e8f63cbd43f54aa35f85754108d6a526d76491aaeb7e76c55470597c9ec",
      },
      {
        id: "hylan_cb_july_2020",
        same: true,
        bytes: 4075616,
        blocks: 272,
        blocksHash: "f046ca227f515ef68ec670413375985c27b952c0732bed6e863920f174d7061f",
      },
    ]);

    const reblocking = JSON.parse(readFileSync(EVIDENCE_REBLOCKING_ARTIFACT_PATH, "utf8")) as {
      status: string;
      pinned_inputs: {
        official_source_pdf_sha256: string;
        current_primary_blocks_path: string;
        current_primary_blocks_sha256: string;
      };
      summary: {
        affected_submission_count: number;
        replacement_submission_count: number;
        retired_original_submission_count: number;
        projected_record_count: number;
        unresolved_reblocked_submission_count: number;
      };
    };
    expect(reblocking.status).toBe("applied");
    expect(reblocking.pinned_inputs.official_source_pdf_sha256).toBe(
      sourceVerification.sources.find((source) => source.source_id === "better_buses_action_plan_2019")?.staged_pdf_sha256,
    );
    const currentBlocks = readFileSync(join(repoRoot, reblocking.pinned_inputs.current_primary_blocks_path));
    expect(createHash("sha256").update(currentBlocks).digest("hex")).toBe(
      reblocking.pinned_inputs.current_primary_blocks_sha256,
    );
    expect(reblocking.pinned_inputs.current_primary_blocks_sha256).not.toBe(
      sourceVerification.sources.find((source) => source.source_id === "better_buses_action_plan_2019")?.staged_blocks_sha256,
    );
    expect(reblocking.summary).toMatchObject({
      affected_submission_count: 20,
      replacement_submission_count: 20,
      retired_original_submission_count: 20,
      projected_record_count: 27,
      unresolved_reblocked_submission_count: 0,
    });

    const actions = readJson<{ candidates: CandidateAction[] }>("candidate-actions.json").candidates;
    const newGtfsIds = new Set(
      actions.filter((action) => action.route_binding_action === "added").map((action) => action.canonical_gtfs_route_id),
    );
    const rc20Anchors = readJsonl<{
      gtfs_route_id: string | null;
      canonical_route_record_id: string | null;
      disposition: string;
    }>(join(repoRoot, "data", "exports", "releases", "v1-rc20", "route_anchors.jsonl"));
    const rc20NoWikiCoverage = rc20Anchors
      .filter((anchor) => anchor.gtfs_route_id && newGtfsIds.has(anchor.gtfs_route_id))
      .map((anchor) => ({ id: anchor.gtfs_route_id, canonical: anchor.canonical_route_record_id, disposition: anchor.disposition }))
      .sort((left, right) => left.id!.localeCompare(right.id!));
    expect(rc20NoWikiCoverage).toHaveLength(12);
    expect(rc20NoWikiCoverage.every((anchor) => anchor.canonical === null && anchor.disposition === "no_wiki_coverage")).toBe(true);
  });
});
