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

const JOURNAL_PATH = join(
  repoRoot,
  "data",
  "submissions",
  "2026-07-15T18-00-00-000Z_queens-acquisition-linkage-remediation.jsonl",
);
const ARTIFACT_DIR = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "queens",
  "linkage-remediation",
);

type CandidateAction = {
  candidate_id: string;
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

describe("Queens acquisition linkage remediation", () => {
  it("persists a deterministic, accepted correction journal without inventing candidate occurrences", () => {
    const journalText = readFileSync(JOURNAL_PATH, "utf8");
    const entries = readJournal();
    const summary = readJson<{
      submission_count: number;
      source_record_additions: number;
      treatment_record_additions: number;
      canonical_record_updates: number;
      relation_additions: number;
      unique_candidate_relevant_relation_additions: number;
      operational_occurrence_additions: number;
      explicit_phase_additions: number;
      candidate_segment_bindings_added: number;
      journal_sha256: string;
    }>("summary.json");

    expect(entries).toHaveLength(26);
    expect(entries.every((entry) => entry.validation.state === "accepted" && entry.validation.issues.length === 0)).toBe(true);
    expect(new Set(entries.map((entry) => entry.submission_id)).size).toBe(26);
    for (const entry of entries) {
      const hash = stableHash(entry.tool_args as unknown as Record<string, unknown>);
      expect(entry.submission_id).toBe(`sub_${hash.slice(0, 16)}`);
      expect(entry.tool_args_sha256).toBe(`sha256:${hash}`);
    }
    expect(createHash("sha256").update(journalText).digest("hex")).toBe(summary.journal_sha256);
    expect(summary).toMatchObject({
      submission_count: 26,
      source_record_additions: 2,
      treatment_record_additions: 1,
      canonical_record_updates: 2,
      relation_additions: 21,
      unique_candidate_relevant_relation_additions: 21,
      operational_occurrence_additions: 0,
      explicit_phase_additions: 0,
      candidate_segment_bindings_added: 0,
    });
    expect(entries.some((entry) => entry.tool_args.observation_kind === "event")).toBe(false);
    expect(entries.some((entry) => ["operational_occurrence", "phase_id", "segment_id"].some((key) => key in entry.tool_args.payload))).toBe(false);
  });

  it("materializes 21 evidence-backed, endpoint-valid, type-valid relations and no shadow treatment", () => {
    const generated = entriesToRecords(readJournal());
    const generatedByKind = (kind: MtaCanonicalRecord["record_kind"]) => generated.filter((record) => record.record_kind === kind);
    expect(generated).toHaveLength(26);
    expect(generatedByKind("source")).toHaveLength(2);
    expect(generatedByKind("project")).toHaveLength(1);
    expect(generatedByKind("route")).toHaveLength(1);
    expect(generatedByKind("treatment_component").map((record) => record.record_id)).toEqual([
      "treatment_hillside-avenue-bus-lanes-2025",
    ]);
    expect(generated.some((record) => record.record_id === "treatment_21st-street-bus-lanes-completion-2022")).toBe(false);

    const relations = generatedByKind("relation");
    expect(relations).toHaveLength(21);
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
      expect(relationEndpointShapeIssue(String(relation.payload.relation_kind), subject?.record_kind, object?.record_kind)).toBeUndefined();
      expect(relation.evidence_refs.length).toBeGreaterThan(0);
      expect(relation.evidence_refs.every((ref) => Boolean(ref.block_id) && /^sha256:[0-9a-f]{64}$/u.test(ref.text_sha256 ?? ""))).toBe(true);
      expect(relation.evidence_refs.every((ref) => !String(ref.block_id).includes(".."))).toBe(true);
      const triple = `${String(relation.payload.relation_kind)}\0${endpointId(relation, "subject")}\0${endpointId(relation, "object")}`;
      expect((baselineTripleIds.get(triple) ?? []).filter((recordId) => recordId !== relation.record_id)).toEqual([]);
    }
  });

  it("reconciles the five receipts to exactly the 21 journaled links while retaining exclusion", () => {
    const actions = readJson<{ schema_version: 1; candidates: CandidateAction[] }>("candidate-actions.json").candidates;
    const summary = readJson<{ canonical_relation_ids: string[] }>("summary.json");
    expect(actions).toHaveLength(5);
    expect(new Set(actions.map((action) => action.candidate_id)).size).toBe(5);
    expect(actions.every((action) => !action.study_projection_eligible && action.remaining_unsupported_claims.length === 3)).toBe(true);
    const actionLinks = [...new Set(actions.flatMap((action) => action.canonical_links_added))].sort();
    expect(actionLinks).toHaveLength(21);
    expect(actionLinks).toEqual(summary.canonical_relation_ids);

    const materializedLinkIds = new Set(
      entriesToRecords(readJournal())
        .filter((record) => record.record_kind === "relation")
        .map((record) => record.record_id),
    );
    expect(actionLinks.every((recordId) => materializedLinkIds.has(recordId))).toBe(true);
    const q103 = actions.find((action) => action.candidate_id === "study-event-v2:2903c93577f1e07b34fa218c")!;
    expect(q103.canonical_records_added).toEqual(["source_nyc-dot-21st-street-bus-priority-completion-2022"]);
    expect(q103.canonical_records_updated).toEqual(["project_21st-street-bus-priority"]);
    const q1 = actions.find((action) => action.candidate_id === "study-event-v2:d1cc616281e5031091c4b8e9")!;
    expect(q1.canonical_records_added).toEqual([
      "source_mta-q1-hillside-route-profile-2025",
      "treatment_hillside-avenue-bus-lanes-2025",
    ]);
    expect(q1.canonical_records_updated).toEqual(["route_q1-queens"]);
  });
});
