import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "../../../core/src/paths";
import { loadRelationshipContract } from "../../../db/src/relationship-contract";
import { stableHash } from "../../../db/src/stable-json";
import type { MtaCanonicalRecord, MtaSubmissionEntry } from "../../../db/src/types";
import { entriesToRecords } from "../../src/materialize/materialize";
import { readCanonicalRecordsFromJsonl } from "../../src/materialize/canonical-read";
import { relationEndpointShapeIssue } from "../../src/records/relations";

const JOURNAL_PATH = join(
  repoRoot,
  "data",
  "submissions",
  "2026-07-15T21-00-00-000Z_manhattan-third-avenue-linkage-remediation.jsonl",
);
const ARTIFACT_DIR = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "manhattan",
  "linkage-remediation",
);
const EXCLUSIONS_PATH = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "manhattan",
  "registry-projection-exclusions.jsonl",
);

type CandidateAction = {
  candidate_id: string;
  route_id: "M98" | "M101" | "M102" | "M103";
  generic_route_binding_implemented: true;
  canonical_links_added: string[];
  canonical_records_added: string[];
  canonical_records_updated: string[];
  staged_source_ids: string[];
  study_projection_eligible: false;
  remaining_unsupported_claims: string[];
};

function readJournal(): MtaSubmissionEntry[] {
  return readFileSync(JOURNAL_PATH, "utf8")
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line) as MtaSubmissionEntry);
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(ARTIFACT_DIR, name), "utf8")) as T;
}

function endpointId(record: MtaCanonicalRecord, side: "subject" | "object"): string {
  const value = record.payload[`${side}_id`];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${record.record_id} lacks ${side}_id`);
  return value;
}

describe("Manhattan Third Avenue acquisition linkage remediation", () => {
  it("persists 22 deterministic accepted submissions without candidate onset, phase, segment, or occurrence claims", () => {
    const journalText = readFileSync(JOURNAL_PATH, "utf8");
    const entries = readJournal();
    const summary = readJson<{
      candidate_count: number;
      submission_count: number;
      source_record_additions: number;
      project_record_additions: number;
      corridor_record_additions: number;
      treatment_record_additions: number;
      canonical_record_updates: number;
      relation_additions: number;
      unique_candidate_relevant_relation_additions: number;
      generic_route_bindings_implemented: number;
      operational_occurrence_additions: number;
      explicit_phase_additions: number;
      candidate_onset_bindings_added: number;
      candidate_segment_bindings_added: number;
      journal_sha256: string;
    }>("summary.json");

    expect(entries).toHaveLength(22);
    expect(entries.every((entry) => entry.validation.state === "accepted" && entry.validation.issues.length === 0)).toBe(true);
    expect(new Set(entries.map((entry) => entry.submission_id)).size).toBe(22);
    for (const entry of entries) {
      const hash = stableHash(entry.tool_args as unknown as Record<string, unknown>);
      expect(entry.submission_id).toBe(`sub_${hash.slice(0, 16)}`);
      expect(entry.tool_args_sha256).toBe(`sha256:${hash}`);
    }
    expect(createHash("sha256").update(journalText).digest("hex")).toBe(summary.journal_sha256);
    expect(summary).toMatchObject({
      candidate_count: 4,
      submission_count: 22,
      source_record_additions: 2,
      project_record_additions: 2,
      corridor_record_additions: 2,
      treatment_record_additions: 2,
      canonical_record_updates: 0,
      relation_additions: 14,
      unique_candidate_relevant_relation_additions: 14,
      generic_route_bindings_implemented: 4,
      operational_occurrence_additions: 0,
      explicit_phase_additions: 0,
      candidate_onset_bindings_added: 0,
      candidate_segment_bindings_added: 0,
    });
    expect(entries.some((entry) => entry.tool_args.observation_kind === "event")).toBe(false);
    expect(entries.some((entry) => [
      "operational_occurrence",
      "phase_id",
      "phase_identity",
      "segment_id",
      "implementation_date",
      "onset_date",
    ].some((key) => key in entry.tool_args.payload))).toBe(false);
  });

  it("materializes two physical proposal scopes and 14 evidence-backed, endpoint-valid, type-valid relations", () => {
    const generated = entriesToRecords(readJournal());
    const byKind = (kind: MtaCanonicalRecord["record_kind"]) => generated.filter((record) => record.record_kind === kind);
    expect(generated).toHaveLength(22);
    expect(byKind("source")).toHaveLength(2);
    expect(byKind("project").map((record) => record.record_id).sort()).toEqual([
      "project_third-avenue-complete-street-east-24th-59th-2025",
      "project_third-avenue-complete-street-east-96th-128th-2025",
    ]);
    expect(byKind("corridor").map((record) => record.record_id).sort()).toEqual([
      "corridor_third-avenue-east-24th-59th",
      "corridor_third-avenue-east-96th-128th",
    ]);
    expect(byKind("treatment_component").map((record) => record.record_id).sort()).toEqual([
      "treatment_third-avenue-continuous-bus-lane-east-26th-59th-2025",
      "treatment_third-avenue-offset-bus-lane-east-96th-128th-2025",
    ]);

    const relations = byKind("relation");
    expect(relations).toHaveLength(14);
    const relationshipContract = loadRelationshipContract();
    const baseline = readCanonicalRecordsFromJsonl();
    const recordsById = new Map<string, MtaCanonicalRecord>();
    for (const record of [...baseline, ...generated]) recordsById.set(record.record_id, record);
    const baselineTripleIds = new Map<string, string[]>();
    for (const relation of baseline.filter((record) => record.record_kind === "relation")) {
      const key = `${String(relation.payload.relation_kind)}\0${String(relation.payload.subject_id)}\0${String(relation.payload.object_id)}`;
      baselineTripleIds.set(key, [...(baselineTripleIds.get(key) ?? []), relation.record_id]);
    }
    for (const relation of relations) {
      const subject = recordsById.get(endpointId(relation, "subject"));
      const object = recordsById.get(endpointId(relation, "object"));
      expect(subject, `${relation.record_id} subject must resolve`).toBeDefined();
      expect(object, `${relation.record_id} object must resolve`).toBeDefined();
      expect(
        relationEndpointShapeIssue(String(relation.payload.relation_kind), subject?.record_kind, object?.record_kind),
      ).toBeUndefined();
      const contractRule = relationshipContract.rulesByKind.get(String(relation.payload.relation_kind));
      expect(contractRule, `${relation.record_id} relation kind must be contract-listed`).toBeDefined();
      expect(contractRule?.allowed_shapes).toContainEqual({
        subject_kind: subject?.record_kind,
        object_kind: object?.record_kind,
      });
      expect(relation.payload.assertion_status).toBe("proposed");
      expect(relation.evidence_refs.length).toBeGreaterThan(0);
      expect(relation.evidence_refs.every((ref) => Boolean(ref.block_id) && /^sha256:[0-9a-f]{64}$/u.test(ref.text_sha256 ?? ""))).toBe(true);
      const triple = `${String(relation.payload.relation_kind)}\0${endpointId(relation, "subject")}\0${endpointId(relation, "object")}`;
      expect((baselineTripleIds.get(triple) ?? []).filter((recordId) => recordId !== relation.record_id)).toEqual([]);
    }

    const routeIds = new Set([
      "route_m98-washington-heights-upper-east-side-ltd",
      "route_m101",
      "route_m102",
      "route_m103-segment-speed",
    ]);
    const routeScoped = relations.filter((relation) => ["serves_route", "operates_on_corridor"].includes(String(relation.payload.relation_kind)));
    expect(routeScoped).toHaveLength(8);
    expect(routeScoped.every((relation) => routeIds.has(endpointId(relation, relation.payload.relation_kind === "serves_route" ? "object" : "subject")))).toBe(true);
  });

  it("reconciles exactly the four generic route gaps while retaining all four registry exclusions", () => {
    const actions = readJson<{ schema_version: 1; candidates: CandidateAction[] }>("candidate-actions.json").candidates;
    const summary = readJson<{ canonical_relation_ids: string[] }>("summary.json");
    expect(actions).toHaveLength(4);
    expect(actions.map((action) => action.route_id).sort()).toEqual(["M101", "M102", "M103", "M98"]);
    expect(new Set(actions.map((action) => action.candidate_id)).size).toBe(4);
    expect(actions.every((action) => action.generic_route_binding_implemented && !action.study_projection_eligible)).toBe(true);
    expect(actions.every((action) => action.canonical_links_added.length === 5)).toBe(true);
    expect(actions.every((action) => action.remaining_unsupported_claims.length === 3)).toBe(true);

    const actionLinks = [...new Set(actions.flatMap((action) => action.canonical_links_added))].sort();
    expect(actionLinks).toHaveLength(14);
    expect(actionLinks).toEqual(summary.canonical_relation_ids);
    const materializedLinkIds = new Set(
      entriesToRecords(readJournal())
        .filter((record) => record.record_kind === "relation")
        .map((record) => record.record_id),
    );
    expect(actionLinks.every((recordId) => materializedLinkIds.has(recordId))).toBe(true);

    const exclusions = readFileSync(EXCLUSIONS_PATH, "utf8")
      .trim()
      .split(/\r?\n/u)
      .map((line) => JSON.parse(line) as { candidate_id: string; study_projection_eligible: boolean; phase_identity_proved: boolean });
    const actionIds = new Set(actions.map((action) => action.candidate_id));
    const matchingExclusions = exclusions.filter((exclusion) => actionIds.has(exclusion.candidate_id));
    expect(matchingExclusions).toHaveLength(4);
    expect(matchingExclusions.every((exclusion) => !exclusion.study_projection_eligible && !exclusion.phase_identity_proved)).toBe(true);
  });

  it("pins both ignored staged source packets to acquisition and block hashes", () => {
    const verification = readJson<{
      sources: Array<{
        source_id: string;
        receipt_acquisition_sha256: string;
        staged_byte_sha256: string;
        staged_byte_length: number;
        staged_blocks_sha256: string;
        staged_block_count: number;
      }>;
    }>("source-verification.json");
    expect(verification.sources).toHaveLength(2);
    for (const source of verification.sources) {
      const sourceDir = join(repoRoot, "raw", "sources", source.source_id);
      const pdf = readFileSync(join(sourceDir, "source.pdf"));
      const blocks = readFileSync(join(sourceDir, "blocks.jsonl"));
      expect(createHash("sha256").update(pdf).digest("hex")).toBe(source.receipt_acquisition_sha256);
      expect(source.staged_byte_sha256).toBe(source.receipt_acquisition_sha256);
      expect(pdf.byteLength).toBe(source.staged_byte_length);
      expect(createHash("sha256").update(blocks).digest("hex")).toBe(source.staged_blocks_sha256);
      expect(blocks.toString("utf8").trim().split(/\r?\n/u)).toHaveLength(source.staged_block_count);
    }
  });
});
