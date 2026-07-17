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
  "2026-07-15T22-00-00-000Z_bronx-acquisition-linkage-remediation.jsonl",
);
const PHYSICAL_SCOPE_JOURNAL_PATH = join(
  repoRoot,
  "data",
  "submissions",
  "2026-07-15T20-00-00-000Z_bus-lane-treatment-physical-scope-remediation.jsonl",
);
const SHARD_DIR = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "bronx",
);
const ARTIFACT_DIR = join(SHARD_DIR, "linkage-remediation");
const SUPPORTED_PATH = join(SHARD_DIR, "supported-linkage-candidates.jsonl");
const EXCLUSIONS_PATH = join(SHARD_DIR, "registry-projection-exclusions.jsonl");
const BX12_LOCAL_VARIANT_CANDIDATE_ID = "study-event-v2:4f20a93956a3af9db4bad8c1";

type CandidateAction = {
  candidate_id: string;
  registry_route_id: string;
  canonical_gtfs_route_id: string;
  canonical_route_record_id: string;
  corridor_group: string;
  project_id: string;
  treatment_ids: string[];
  corridor_id: string;
  route_corridor_action: "added" | "verified_existing";
  generic_linkage_reconciled: true;
  canonical_links_added: string[];
  canonical_links_verified_existing: string[];
  coordinated_physical_scope_relation_ids: string[];
  canonical_records_added: string[];
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

describe("Bronx acquisition linkage remediation", () => {
  it("persists 53 deterministic accepted submissions without candidate occurrence, segment, phase, or onset claims", () => {
    const journalText = readFileSync(JOURNAL_PATH, "utf8");
    const entries = readJsonl<MtaSubmissionEntry>(JOURNAL_PATH);
    const summary = readJson<{
      acquisition_supported_before_precision_correction: number;
      acquisition_supported_after_precision_correction: number;
      exact_supported_candidate_count: number;
      generic_linkages_reconciled: number;
      route_corridor_binding_counts: { verified_existing: number; added: number; after_reconciliation: number };
      submission_count: number;
      source_record_additions: number;
      project_record_additions: number;
      corridor_record_additions: number;
      treatment_record_additions: number;
      route_record_additions: number;
      relation_additions: number;
      operational_occurrence_additions: number;
      candidate_segment_bindings_added: number;
      candidate_phase_additions: number;
      candidate_onset_additions: number;
      journal_sha256: string;
    }>("summary.json");

    expect(entries).toHaveLength(53);
    expect(entries.every((entry) => entry.validation.state === "accepted" && entry.validation.issues.length === 0)).toBe(true);
    expect(new Set(entries.map((entry) => entry.submission_id)).size).toBe(53);
    for (const entry of entries) {
      const hash = stableHash(entry.tool_args as unknown as Record<string, unknown>);
      expect(entry.submission_id).toBe(`sub_${hash.slice(0, 16)}`);
      expect(entry.tool_args_sha256).toBe(`sha256:${hash}`);
    }
    expect(createHash("sha256").update(journalText).digest("hex")).toBe(summary.journal_sha256);
    expect(summary).toMatchObject({
      acquisition_supported_before_precision_correction: 14,
      acquisition_supported_after_precision_correction: 13,
      exact_supported_candidate_count: 13,
      generic_linkages_reconciled: 13,
      route_corridor_binding_counts: { verified_existing: 6, added: 7, after_reconciliation: 13 },
      submission_count: 53,
      source_record_additions: 4,
      project_record_additions: 4,
      corridor_record_additions: 2,
      treatment_record_additions: 4,
      route_record_additions: 2,
      relation_additions: 37,
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
      "phase_identity",
      "implementation_date",
      "onset_date",
    ].some((key) => key in entry.tool_args.payload))).toBe(false);
  });

  it("materializes 16 physical records and 37 evidence-backed, endpoint-valid, type-valid relations", () => {
    const generated = entriesToRecords(readJsonl<MtaSubmissionEntry>(JOURNAL_PATH));
    const byKind = (kind: MtaCanonicalRecord["record_kind"]) => generated.filter((record) => record.record_kind === kind);
    expect(generated).toHaveLength(53);
    expect(byKind("source").map((record) => record.record_id).sort()).toEqual([
      "source_e149-cb1",
      "source_pelham-bay-completion",
      "source_pelham-parkway-completion",
      "source_w178-cb12",
    ]);
    expect(byKind("project")).toHaveLength(4);
    expect(byKind("corridor")).toHaveLength(2);
    expect(byKind("treatment_component")).toHaveLength(4);
    expect(byKind("route").map((record) => record.record_id).sort()).toEqual(["route_bx29", "route_bx4"]);

    const relations = byKind("relation");
    expect(relations).toHaveLength(37);
    const baseline = readCanonicalRecordsFromJsonl();
    const recordsById = new Map<string, MtaCanonicalRecord>();
    for (const record of [...baseline, ...generated]) recordsById.set(record.record_id, record);
    const baselineTripleIds = new Map<string, string[]>();
    for (const relation of baseline.filter((record) => record.record_kind === "relation")) {
      baselineTripleIds.set(
        relationKey(relation),
        [...(baselineTripleIds.get(relationKey(relation)) ?? []), relation.record_id],
      );
    }
    const contract = loadRelationshipContract();
    for (const relation of relations) {
      const subject = recordsById.get(endpointId(relation, "subject"));
      const object = recordsById.get(endpointId(relation, "object"));
      expect(subject, `${relation.record_id} subject must resolve`).toBeDefined();
      expect(object, `${relation.record_id} object must resolve`).toBeDefined();
      expect(
        relationEndpointShapeIssue(String(relation.payload.relation_kind), subject?.record_kind, object?.record_kind),
      ).toBeUndefined();
      expect(contract.rulesByKind.get(String(relation.payload.relation_kind))?.allowed_shapes).toContainEqual({
        subject_kind: subject?.record_kind,
        object_kind: object?.record_kind,
      });
      expect(relation.evidence_refs.length).toBeGreaterThan(0);
      expect(relation.evidence_refs.every((ref) => Boolean(ref.block_id))).toBe(true);
      expect(relation.evidence_refs.every((ref) => /^sha256:[0-9a-f]{64}$/u.test(ref.text_sha256 ?? ""))).toBe(true);
      expect(relation.evidence_refs.every((ref) => Boolean(ref.source_quote))).toBe(true);
      expect((baselineTripleIds.get(relationKey(relation)) ?? []).filter((id) => id !== relation.record_id)).toEqual([]);
    }
  });

  it("reconciles all 13 exact supports to route-project-treatment-corridor paths and rejects BX12 local", () => {
    const actions = readJson<{ schema_version: 1; candidates: CandidateAction[] }>("candidate-actions.json").candidates;
    const supported = readJsonl<{ candidate_id: string; route_id: string }>(SUPPORTED_PATH);
    const exclusions = readJsonl<{
      candidate_id: string;
      exact_route_treatment_binding_proved: boolean;
      reason: string;
      study_projection_eligible: boolean;
    }>(EXCLUSIONS_PATH);
    const ownGenerated = entriesToRecords(readJsonl<MtaSubmissionEntry>(JOURNAL_PATH));
    const physicalGenerated = entriesToRecords(readJsonl<MtaSubmissionEntry>(PHYSICAL_SCOPE_JOURNAL_PATH));
    const allRecords = [...readCanonicalRecordsFromJsonl(), ...physicalGenerated, ...ownGenerated];
    const byId = new Map(allRecords.map((record) => [record.record_id, record]));
    const relations = allRecords.filter((record) => record.record_kind === "relation");
    const triples = new Set(relations.map(relationKey));
    const relationIds = new Set(relations.map((relation) => relation.record_id));

    expect(actions).toHaveLength(13);
    expect(new Set(actions.map((action) => action.candidate_id)).size).toBe(13);
    expect(actions.map((action) => `${action.candidate_id}\0${action.registry_route_id}`).sort()).toEqual(
      supported.map((row) => `${row.candidate_id}\0${row.route_id}`).sort(),
    );
    expect(actions.some((action) => action.candidate_id === BX12_LOCAL_VARIANT_CANDIDATE_ID)).toBe(false);
    expect(actions.every((action) => action.generic_linkage_reconciled && !action.study_projection_eligible)).toBe(true);
    expect(actions.every((action) => action.remaining_unsupported_claims.length === 4)).toBe(true);
    expect(actions.filter((action) => action.route_corridor_action === "added")).toHaveLength(7);
    expect(actions.filter((action) => action.route_corridor_action === "verified_existing")).toHaveLength(6);

    for (const action of actions) {
      expect(byId.get(action.canonical_route_record_id)?.record_kind).toBe("route");
      expect(byId.get(action.project_id)?.record_kind).toBe("project");
      expect(byId.get(action.corridor_id)?.record_kind).toBe("corridor");
      expect(triples.has(`serves_route\0${action.project_id}\0${action.canonical_route_record_id}`)).toBe(true);
      expect(triples.has(`uses_corridor\0${action.project_id}\0${action.corridor_id}`)).toBe(true);
      expect(triples.has(`operates_on_corridor\0${action.canonical_route_record_id}\0${action.corridor_id}`)).toBe(true);
      for (const treatmentId of action.treatment_ids) {
        expect(byId.get(treatmentId)?.record_kind).toBe("treatment_component");
        expect(triples.has(`has_treatment\0${action.project_id}\0${treatmentId}`)).toBe(true);
        expect(triples.has(`located_on_corridor\0${treatmentId}\0${action.corridor_id}`)).toBe(true);
      }
      expect([
        ...action.canonical_links_added,
        ...action.canonical_links_verified_existing,
        ...action.coordinated_physical_scope_relation_ids,
      ].every((id) => relationIds.has(id))).toBe(true);
    }

    const bx12Local = exclusions.find((row) => row.candidate_id === BX12_LOCAL_VARIANT_CANDIDATE_ID);
    expect(bx12Local).toMatchObject({ exact_route_treatment_binding_proved: false, study_projection_eligible: false });
    expect(bx12Local?.reason).toContain("BX12 Select Bus Service (BX12+) only");
    expect(triples.has("serves_route\0project_pelham-parkway-reconstruction-boston-road-stillwell-avenue\0route_bx12-local-2015-webster-map")).toBe(false);
  });

  it("retains frozen and current official-source hashes and reuses the exact staged CB5 source", () => {
    const verification = readJson<{
      supported_candidates: {
        prior_sha256: string;
        corrected_sha256: string;
        prior_row_count: number;
        corrected_row_count: number;
        rejected_route_variant_candidate_id: string;
      };
      sources: Array<{
        source_id: string;
        acquisition_source_id: string;
        status: string;
        acquisition_sha256: string;
        acquisition_byte_length: number;
        staged_byte_sha256: string;
        staged_byte_length: number;
        staged_metadata_sha256: string;
        staged_blocks_sha256: string;
        staged_block_count: number;
      }>;
    }>("source-verification.json");
    expect(verification.supported_candidates).toEqual({
      prior_sha256: "79e478d383e917ae0583ebd3a4d8af04935304e6f38e43b76a8c98359bc7ec90",
      corrected_sha256: "86e6f394d302e0f0e5d10bd68900d1bc62881ea976c5746974a4cd6b1598ff35",
      prior_row_count: 14,
      corrected_row_count: 13,
      rejected_route_variant_candidate_id: BX12_LOCAL_VARIANT_CANDIDATE_ID,
      path: "data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/supported-linkage-candidates.jsonl",
    });
    expect(verification.sources).toHaveLength(5);
    for (const source of verification.sources) {
      const sourceDir = join(repoRoot, "raw", "sources", source.source_id);
      const binaryName = source.source_id === "pelham_parkway_completion" || source.source_id === "pelham_bay_completion"
        ? "source.html"
        : "source.pdf";
      const binary = readFileSync(join(sourceDir, binaryName));
      const blocks = readFileSync(join(sourceDir, "blocks.jsonl"));
      const metadata = readFileSync(join(sourceDir, "metadata.json"));
      expect(createHash("sha256").update(binary).digest("hex")).toBe(source.staged_byte_sha256);
      expect(binary.byteLength).toBe(source.staged_byte_length);
      expect(createHash("sha256").update(blocks).digest("hex")).toBe(source.staged_blocks_sha256);
      expect(createHash("sha256").update(metadata).digest("hex")).toBe(source.staged_metadata_sha256);
      expect(blocks.toString("utf8").trim().split(/\r?\n/u)).toHaveLength(source.staged_block_count);
    }
    const dynamic = verification.sources.filter((source) => source.status.startsWith("dynamic_official_html"));
    expect(dynamic).toHaveLength(2);
    expect(dynamic.every((source) => source.acquisition_sha256 !== source.staged_byte_sha256)).toBe(true);
    const stable = verification.sources.filter((source) => !source.status.startsWith("dynamic_official_html"));
    expect(stable).toHaveLength(3);
    expect(stable.every((source) => source.acquisition_sha256 === source.staged_byte_sha256)).toBe(true);
    expect(verification.sources.find((source) => source.source_id === "bx_cb5_projects_dec032019")).toMatchObject({
      acquisition_source_id: "bronx_cb5_priority_2019",
      status: "reused_existing_staged_source_identical_to_acquisition",
    });
  });

  it("hashes every generated artifact and proves BX4/BX29 existed in rc20 without Wiki coverage", () => {
    const manifest = readJson<{
      files: Array<{ path: string; bytes: number; sha256: string }>;
    }>("manifest.json");
    expect(manifest.files).toHaveLength(5);
    for (const file of manifest.files) {
      const content = readFileSync(join(repoRoot, file.path));
      expect(content.byteLength).toBe(file.bytes);
      expect(createHash("sha256").update(content).digest("hex")).toBe(file.sha256);
    }

    const anchors = readJsonl<{
      gtfs_route_id: string | null;
      canonical_route_record_id: string | null;
      disposition: string;
    }>(join(repoRoot, "data", "exports", "releases", "v1-rc20", "route_anchors.jsonl"));
    expect(anchors.filter((anchor) => anchor.gtfs_route_id === "BX4" || anchor.gtfs_route_id === "BX29")).toEqual([
      { aliases: [], anchor_reason: null, canonical_route_record_id: null, disposition: "no_wiki_coverage", gtfs_route_id: "BX29", variant_record_ids: [] },
      { aliases: [], anchor_reason: null, canonical_route_record_id: null, disposition: "no_wiki_coverage", gtfs_route_id: "BX4", variant_record_ids: [] },
    ]);
  });
});
