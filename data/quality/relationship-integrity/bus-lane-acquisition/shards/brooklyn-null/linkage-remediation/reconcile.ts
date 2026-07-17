import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../../../../../../../packages/core/src/paths";
import { canonicalRecordIdForInput } from "../../../../../../../packages/db/src/identity";
import { PAYLOAD_SCHEMA_VERSION } from "../../../../../../../packages/db/src/kind-registry";
import { stableHash, stableJson } from "../../../../../../../packages/db/src/stable-json";
import type {
  JsonObject,
  MtaCanonicalRecord,
  MtaEvidenceRef,
  MtaSubmissionEntry,
  MtaSubmitObservationInput,
  StagedSourceBlock,
} from "../../../../../../../packages/db/src/types";
import { entriesToRecords } from "../../../../../../../packages/pipeline/src/materialize/materialize";
import { computeRouteAnchors } from "../../../../../../../packages/pipeline/src/materialize/route-anchors";
import { readCanonicalRecordsFromJsonl } from "../../../../../../../packages/pipeline/src/materialize/canonical-read";
import { relationEndpointShapeIssue } from "../../../../../../../packages/pipeline/src/records/relations";
import { normalizeSubmitInput } from "../../../../../../../packages/pipeline/src/records/submissions";

export const BROOKLYN_LINKAGE_CAMPAIGN_ID = "brooklyn-null-supported-linkage-reconciliation-v1" as const;
export const BROOKLYN_LINKAGE_RUN_ID = "2026-07-15T20-30-00-000Z_brooklyn-null-acquisition-linkage-remediation" as const;
export const B54_SOURCE_ID = "jay_street_busway_camera_2021" as const;
export const B54_ROUTE_ID = "route_b54" as const;
export const B54_CORRIDOR_ID = "corridor_jay-st-busway" as const;
export const B54_RELATION_LOCAL_ID = "relation_b54_operates_on_jay_street_busway_2021" as const;

const REVIEWED_AT = "2026-07-15T20:30:00.000Z";
const CANDIDATE_SET_ID = "candidate-set-v2:24080902f508b55a0033df32";
const CANDIDATE_SET_SHA256 = "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba";
const B54_CANDIDATE_ID = "study-event-v2:d7958c3a07e9ba179ab9ac61";
const B54_SOURCE_URL = "https://www.nyc.gov/html/dot/html/pr2021/pr21-009.shtml";
const B54_PREVIOUS_RECEIPT_SOURCE_SHA256 = "58bbda016aca84ff021d11620a50876b03dbf6c817f30ae7efef4cbe3003e8f7";
const B54_SOURCE_HTML_SHA256 = "a5140a5eb87deff5b4a72a892e7bf3600c413bf114c063c34867d5faa8db2c6f";
const B54_ROUTE_BLOCK_ID = "p001_b0016";
const B54_ROUTE_BLOCK_SHA256 = "sha256:e7463df53ebc2c7410e746d21920537d7ce085bed0b19fe15be1855222f04f06";
const B54_ROUTE_QUOTE = "Jay Street between Livingston Street and Tillary Street hosts seven bus routes (B26, B54, B57, B61,B62, B65, and B67)";
const B54_DATE_BLOCK_ID = "p001_b0011";
const B54_DATE_BLOCK_SHA256 = "sha256:f509842d2bad081dabcc40e7c12665daf4ac47d6b277881a61d19d4184ef189b";
const B54_TITLE_BLOCK_ID = "p001_b0013";
const B54_TITLE_BLOCK_SHA256 = "sha256:a07ada55af71266809bd60e79177f906fd2d90495cad0f37f984cdcbacc97d9e";

const ARTIFACT_DIR = import.meta.dir;
const SHARD_DIR = dirname(ARTIFACT_DIR);
const RECEIPTS_PATH = join(SHARD_DIR, "receipts.jsonl");
const ACQUIRED_SOURCE_CHECKS_PATH = join(SHARD_DIR, "acquired-source-checks.json");
const JOURNAL_PATH = join(repoRoot, "data", "submissions", `${BROOKLYN_LINKAGE_RUN_ID}.jsonl`);
const DECISIONS_PATH = join(ARTIFACT_DIR, "decisions.jsonl");
const SUMMARY_PATH = join(ARTIFACT_DIR, "summary.json");
const SOURCE_VERIFICATION_PATH = join(ARTIFACT_DIR, "source-verification.json");
const REPORT_PATH = join(ARTIFACT_DIR, "report.md");
const MANIFEST_PATH = join(ARTIFACT_DIR, "manifest.json");
const RC20_ROUTE_ANCHORS_PATH = join(repoRoot, "data", "exports", "releases", "v1-rc20", "route_anchors.jsonl");
const SOURCE_HTML_PATH = join(repoRoot, "raw", "sources", B54_SOURCE_ID, "source.html");
const SOURCE_BLOCKS_PATH = join(repoRoot, "raw", "sources", B54_SOURCE_ID, "blocks.jsonl");

type Receipt = {
  schema_version: number;
  shard: string;
  receipt_id: string;
  researched_on: string;
  candidate: {
    candidate_id: string;
    candidate_set_id: string;
    candidate_set_sha256: string;
    identity: string;
    route_id: string;
    normalized_route_id: string;
    corridor: string;
    implementation_date: string;
    date_precision: string;
  };
  claim_results: {
    exact_route_treatment_binding_proved: boolean;
    exact_segment_binding_proved: boolean;
    explicit_phase_identity_proved: boolean;
    date_and_phase_proved: boolean;
    operational_occurrence_identity_proved: boolean;
    exact_route_binding_evidence: Array<{
      evidence_kind: string;
      source_id: string;
      source_sha256: string;
      official_routes?: string[];
      supported_claim: string;
    }>;
  };
  canonical_actions: {
    existing_canonical_links_verified?: string[];
    canonical_links_added?: string[];
    operational_occurrence_added_or_updated: boolean;
  };
  outcome: {
    registry_projection_excluded: boolean;
    still_unresolved: boolean;
    study_projection_eligible: boolean;
  };
};

type ExpectedCandidate = {
  candidateId: string;
  normalizedRouteId: string;
  relationIds: string[];
  action: "verified_existing_canonical" | "implemented_by_accepted_submission";
};

const EXPECTED_CANDIDATES: ExpectedCandidate[] = [
  {
    candidateId: "study-event-v2:2d2be03b8437c8af3bf6ddef",
    normalizedRouteId: "B35",
    relationIds: ["relation_project-serves-b35"],
    action: "verified_existing_canonical",
  },
  {
    candidateId: "study-event-v2:9abe8a89e65262770fe5df60",
    normalizedRouteId: "B46",
    relationIds: ["relation_b46-sbs-operates-on-malcolm-x"],
    action: "verified_existing_canonical",
  },
  {
    candidateId: "study-event-v2:b12bca67da912c6dc9b71b80",
    normalizedRouteId: "B82",
    relationIds: ["relation_route-b82-sbs-on-kings-highway", "relation_project-has-treatment-bus-lanes_9"],
    action: "verified_existing_canonical",
  },
  {
    candidateId: "study-event-v2:bc870a23ee602a9ea28d9160",
    normalizedRouteId: "B67",
    relationIds: ["relation_flatbush-phase1-serves-b67"],
    action: "verified_existing_canonical",
  },
  {
    candidateId: B54_CANDIDATE_ID,
    normalizedRouteId: "B54",
    relationIds: [],
    action: "implemented_by_accepted_submission",
  },
  {
    candidateId: "study-event-v2:e1d437f15fa4caee51760675",
    normalizedRouteId: "B41",
    relationIds: ["relation_flatbush-phase1-serves-b41"],
    action: "verified_existing_canonical",
  },
  {
    candidateId: "study-event-v2:e2f62a46ac9f1b1a54f713bc",
    normalizedRouteId: "X27",
    relationIds: ["relation_serves-route-project-05-battery-pl-route-meeting-doc-160441-x27_c3374c2ec8"],
    action: "verified_existing_canonical",
  },
  {
    candidateId: "study-event-v2:ea0ab416262ceed4e7184116",
    normalizedRouteId: "X28",
    relationIds: ["relation_serves-route-project-05-battery-pl-route-x28-cb11-jun2025_07a5d5a355"],
    action: "verified_existing_canonical",
  },
];

type RelationProof = {
  relation_id: string;
  record_status: "canonical_existing" | "accepted_pending_submission";
  record_sha256: string;
  relation_kind: string;
  relation_family: string;
  subject_id: string;
  subject_kind: string;
  object_id: string;
  object_kind: string;
  endpoint_type_valid: true;
  endpoint_records_resolve: true;
  local_observation_only_endpoint: false;
  evidence_valid: true;
  evidence_refs: Array<{
    source_id: string;
    evidence_id: string;
    text_sha256: string;
  }>;
};

type AuthoritativeLinkageEvidence = {
  source_id: string;
  source_sha256: string;
  source_url: string;
  retrieved_on: string;
  evidence_kind: string;
  official_routes: string[];
  supported_claim: string;
};

export type BrooklynLinkageDecision = {
  schema_version: 1;
  campaign_id: typeof BROOKLYN_LINKAGE_CAMPAIGN_ID;
  candidate_id: string;
  receipt_id: string;
  identity: string;
  route_id: string;
  normalized_route_id: string;
  corridor_literal: string;
  exclusive_action: ExpectedCandidate["action"];
  implemented_or_verified: true;
  relation_proofs: RelationProof[];
  authoritative_linkage_evidence: AuthoritativeLinkageEvidence[];
  canonical_route_endpoint_ids: string[];
  canonical_context_endpoint_ids: string[];
  route_binding_supported: true;
  route_binding_precision: "generic_authoritative_route_project_or_corridor_link_only";
  exact_candidate_segment_binding_proved: boolean;
  candidate_date_and_phase_proved: false;
  canonical_operational_occurrence_identity_proved: false;
  operational_occurrence_added_or_updated: false;
  registry_candidate_day_inherited: false;
  phase_created: false;
  study_projection_eligible: false;
  registry_projection_excluded: true;
  still_unresolved: true;
};

export type BrooklynLinkageCampaign = {
  journal: MtaSubmissionEntry[];
  decisions: BrooklynLinkageDecision[];
  summary: Record<string, unknown>;
  sourceVerification: Record<string, unknown>;
  report: string;
  manifest: Record<string, unknown>;
};

type AcquiredSourceChecks = {
  schema_version: number;
  shard: string;
  candidate_set_id: string;
  candidate_set_sha256: string;
  sources: Array<{
    id: string;
    url: string;
    retrieval_status: string;
    retrieved_on: string;
    content_sha256: string | null;
  }>;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJsonl(rows: unknown[]): string {
  return `${rows.map((row) => stableJson(row as never)).join("\n")}\n`;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function rawRecordHashes(path: string): Map<string, string> {
  return new Map(readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const value = JSON.parse(line) as { record_id: string };
      return [value.record_id, sha256(line)];
    }));
}

function stagedBlock(sourceId: string, blockId: string): StagedSourceBlock {
  const path = join(repoRoot, "raw", "sources", sourceId, "blocks.jsonl");
  const block = readJsonl<StagedSourceBlock>(path).find((candidate) => candidate.block_id === blockId);
  invariant(block, `missing staged evidence ${sourceId}#${blockId}`);
  return block;
}

function normalizedText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function evidence(sourceId: string, blockId: string, expectedHash: string, role: string, quote?: string): MtaEvidenceRef {
  const block = stagedBlock(sourceId, blockId);
  invariant(block.raw_text_sha256 === expectedHash, `${sourceId}#${blockId} hash mismatch`);
  if (quote) invariant(normalizedText(block.raw_text).includes(normalizedText(quote)), `${sourceId}#${blockId} lacks expected quote`);
  return {
    source_id: sourceId,
    evidence_id: `${sourceId}#${blockId}`,
    source_path: `raw/sources/${sourceId}/blocks.jsonl`,
    page_number: block.page_number,
    block_id: block.block_id,
    text_sha256: block.raw_text_sha256,
    text_source: "raw_text",
    role,
    ...(quote ? { source_quote: quote } : {}),
  };
}

function input(
  kind: MtaSubmitObservationInput["observation_kind"],
  localId: string,
  label: string,
  payload: JsonObject,
  evidenceRefs: MtaEvidenceRef[],
): MtaSubmitObservationInput {
  return {
    source_id: B54_SOURCE_ID,
    observation_kind: kind,
    local_observation_id: localId,
    create_new: true,
    label,
    payload,
    evidence_refs: evidenceRefs,
  };
}

function deterministicEntry(rawInput: MtaSubmitObservationInput): MtaSubmissionEntry {
  const toolArgs = normalizeSubmitInput(rawInput);
  const hash = stableHash(toolArgs as unknown as JsonObject);
  return {
    submission_id: `sub_${hash.slice(0, 16)}`,
    run_id: BROOKLYN_LINKAGE_RUN_ID,
    submitted_at: REVIEWED_AT,
    tool_args_sha256: `sha256:${hash}`,
    schema_version: PAYLOAD_SCHEMA_VERSION,
    tool_args: toolArgs,
    validation: { state: "accepted", issues: [] },
  };
}

function buildJournal(): MtaSubmissionEntry[] {
  const title = evidence(B54_SOURCE_ID, B54_TITLE_BLOCK_ID, B54_TITLE_BLOCK_SHA256, "title");
  const date = evidence(B54_SOURCE_ID, B54_DATE_BLOCK_ID, B54_DATE_BLOCK_SHA256, "publication_date", "Tuesday, March 2, 2021");
  const routeScope = evidence(B54_SOURCE_ID, B54_ROUTE_BLOCK_ID, B54_ROUTE_BLOCK_SHA256, "route_corridor_scope", B54_ROUTE_QUOTE);
  const sourceInput = input("source", `source_${B54_SOURCE_ID}`, "NYC DOT Jay Street Busway camera-enforcement release", {
    title: "DOT to Begin Issuing Bus Lane Camera Violations Along Jay Street Busway",
    publisher: "NYC Department of Transportation",
    content_type: "press release",
    source_url: B54_SOURCE_URL,
    date_text: "March 2, 2021",
    description: "Official NYC DOT release identifying the Jay Street Busway extent and the seven bus routes it hosts.",
    authority_tier: "agency_report",
  }, [title, date]);
  const routeInput = input("route", "route_b54", "B54", {
    route_id: "B54",
    route_name: "B54",
    route_label: "B54",
    route_type_normalized: "bus",
    service_variant: "local",
    borough: "Brooklyn",
    route_record_scope: "true_route",
    route_record_scope_reason: "default_true_route",
    description: "NYC DOT identifies B54 as one of the seven routes hosted on the Jay Street Busway as of March 2, 2021.",
  }, [routeScope]);
  const normalizedRoute = normalizeSubmitInput(routeInput);
  invariant(canonicalRecordIdForInput(normalizedRoute) === B54_ROUTE_ID, "B54 route canonical identity changed");
  const relationInput = input("relation", B54_RELATION_LOCAL_ID, "B54 operates on the Jay Street Busway", {
    relation_kind: "operates_on_corridor",
    relation_family: "corridor_scope",
    subject_id: B54_ROUTE_ID,
    object_id: B54_CORRIDOR_ID,
    assertion_status: "delivered",
    as_of_date: "2021-03-02",
    description: "The NYC DOT release lists B54 among the seven routes hosted on the 0.8-mile Jay Street Busway between Livingston Street and Tillary Street as of March 2, 2021.",
  }, [routeScope, date]);
  return [sourceInput, routeInput, relationInput].map(deterministicEntry);
}

function routeBase(value: string): string {
  return value.toUpperCase().replace(/(?:SELECT BUS SERVICE|SBS)$/u, "").replace(/[^A-Z0-9]/gu, "");
}

function recordRouteId(record: MtaCanonicalRecord): string | undefined {
  for (const key of ["route_id", "route_label", "route_name"] as const) {
    const value = record.payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function verifyEvidenceRefs(record: MtaCanonicalRecord): Array<{ source_id: string; evidence_id: string; text_sha256: string }> {
  invariant(record.evidence_refs.length > 0, `${record.record_id} has no evidence`);
  return record.evidence_refs.map((ref) => {
    invariant(ref.block_id, `${record.record_id}/${ref.evidence_id} has no block id`);
    invariant(ref.text_sha256, `${record.record_id}/${ref.evidence_id} has no evidence hash`);
    const block = stagedBlock(ref.source_id, ref.block_id);
    invariant(block.raw_text_sha256 === ref.text_sha256, `${record.record_id}/${ref.evidence_id} evidence hash mismatch`);
    if (ref.source_quote) {
      invariant(normalizedText(block.raw_text).includes(normalizedText(ref.source_quote)), `${record.record_id}/${ref.evidence_id} quote mismatch`);
    }
    return { source_id: ref.source_id, evidence_id: ref.evidence_id, text_sha256: ref.text_sha256 };
  });
}

function relationProof(
  relation: MtaCanonicalRecord,
  status: RelationProof["record_status"],
  recordsById: Map<string, MtaCanonicalRecord>,
  canonicalRelationHashes: Map<string, string>,
): RelationProof {
  invariant(relation.record_kind === "relation", `${relation.record_id} is not a relation`);
  const relationKind = relation.payload.relation_kind;
  const relationFamily = relation.payload.relation_family;
  const subjectId = relation.payload.subject_id;
  const objectId = relation.payload.object_id;
  invariant(typeof relationKind === "string" && relationKind.length > 0, `${relation.record_id} lacks relation_kind`);
  invariant(typeof relationFamily === "string" && relationFamily.length > 0, `${relation.record_id} lacks relation_family`);
  invariant(typeof subjectId === "string" && subjectId.length > 0, `${relation.record_id} lacks canonical subject_id`);
  invariant(typeof objectId === "string" && objectId.length > 0, `${relation.record_id} lacks canonical object_id`);
  const subject = recordsById.get(subjectId);
  const object = recordsById.get(objectId);
  invariant(subject, `${relation.record_id} subject does not resolve: ${subjectId}`);
  invariant(object, `${relation.record_id} object does not resolve: ${objectId}`);
  const shapeIssue = relationEndpointShapeIssue(relationKind, subject.record_kind, object.record_kind);
  invariant(!shapeIssue, `${relation.record_id} endpoint type invalid: ${shapeIssue?.message ?? "unknown"}`);
  const evidenceRefs = verifyEvidenceRefs(relation);
  const recordSha256 = status === "canonical_existing"
    ? canonicalRelationHashes.get(relation.record_id)
    : sha256(stableJson(relation as never));
  invariant(recordSha256, `${relation.record_id} relation hash missing`);
  return {
    relation_id: relation.record_id,
    record_status: status,
    record_sha256: recordSha256,
    relation_kind: relationKind,
    relation_family: relationFamily,
    subject_id: subjectId,
    subject_kind: subject.record_kind,
    object_id: objectId,
    object_kind: object.record_kind,
    endpoint_type_valid: true,
    endpoint_records_resolve: true,
    local_observation_only_endpoint: false,
    evidence_valid: true,
    evidence_refs: evidenceRefs,
  };
}

function buildReport(summary: Record<string, unknown>): string {
  const rows = summary.candidate_actions as Record<string, number>;
  return `# Brooklyn/null supported-linkage reconciliation v1\n\n` +
    `- Supported acquisition rows reviewed: **${summary.supported_candidate_count}**\n` +
    `- Already verified in canonical data: **${rows.verified_existing_canonical} candidates / ${summary.existing_canonical_relation_count} relations**\n` +
    `- Implemented through accepted evidence-backed submission: **${rows.implemented_by_accepted_submission} candidate**\n` +
    `- Implemented or verified total: **${summary.implemented_or_verified_candidate_count} / 8**\n\n` +
    `## B54 / Jay Street remediation\n\n` +
    `The gap was real: v1-rc20 anchored GTFS route \`B54\` as \`no_wiki_coverage\`, and the canonical corpus contained neither a B54 route record nor a B54-to-Jay-Street relationship. The current NYC DOT March 2, 2021 release was reacquired and staged as \`${B54_SOURCE_ID}\`. Its exact route/corridor block states that the Jay Street busway hosts B54. The accepted journal adds a canonical \`route_b54\` record and one generic \`operates_on_corridor\` relation to \`${B54_CORRIDOR_ID}\`.\n\n` +
    `The source supports the route/corridor relationship as of the report date only. This campaign does not inherit the registry candidate's August 31 day, select a physical DOT segment, create a phase, or create/update an operational occurrence. All eight registry candidates remain excluded and non-projectable.\n\n` +
    `## Exact counts\n\n` +
    `- Existing canonical relations verified: ${summary.existing_canonical_relation_count}\n` +
    `- Exact authoritative linkage evidence receipts pinned: ${summary.authoritative_linkage_evidence_count}\n` +
    `- Accepted pending route records: ${summary.accepted_pending_route_count}\n` +
    `- Accepted pending relations: ${summary.accepted_pending_relation_count}\n` +
    `- Registry day claims inherited: ${summary.registry_day_inherited_count}\n` +
    `- Phase records added: ${summary.phase_addition_count}\n` +
    `- Operational occurrences added or updated: ${summary.operational_occurrence_addition_or_update_count}\n` +
    `- Study-projectable rows: ${summary.study_projection_eligible_count}\n\n` +
    `## Reproduce\n\n\`\`\`bash\n` +
    `bun data/quality/relationship-integrity/bus-lane-acquisition/shards/brooklyn-null/linkage-remediation/reconcile.ts --check\n` +
    `bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/brooklyn-null/linkage-remediation/reconcile.test.ts\n` +
    `\`\`\`\n`;
}

export function buildBrooklynLinkageCampaign(): BrooklynLinkageCampaign {
  invariant(fileSha256(SOURCE_HTML_PATH) === B54_SOURCE_HTML_SHA256, "reacquired Jay Street HTML hash mismatch");
  const routeBlock = stagedBlock(B54_SOURCE_ID, B54_ROUTE_BLOCK_ID);
  invariant(routeBlock.raw_text_sha256 === B54_ROUTE_BLOCK_SHA256, "Jay Street B54 evidence block hash mismatch");
  invariant(normalizedText(routeBlock.raw_text).includes(normalizedText(B54_ROUTE_QUOTE)), "Jay Street B54 evidence quote missing");

  const receipts = readJsonl<Receipt>(RECEIPTS_PATH)
    .filter((receipt) => receipt.claim_results.exact_route_treatment_binding_proved)
    .sort((left, right) => compareStrings(left.candidate.candidate_id, right.candidate.candidate_id));
  invariant(receipts.length === 8, `expected 8 supported Brooklyn/null rows, found ${receipts.length}`);
  const receiptByCandidate = new Map(receipts.map((receipt) => [receipt.candidate.candidate_id, receipt]));
  invariant(receiptByCandidate.size === receipts.length, "supported receipt candidate collision");
  invariant(
    stableJson([...receiptByCandidate.keys()].sort(compareStrings) as never)
      === stableJson(EXPECTED_CANDIDATES.map((candidate) => candidate.candidateId).sort(compareStrings) as never),
    "supported candidate inventory changed",
  );
  const acquiredSourceChecks = JSON.parse(readFileSync(ACQUIRED_SOURCE_CHECKS_PATH, "utf8")) as AcquiredSourceChecks;
  invariant(acquiredSourceChecks.schema_version === 1 && acquiredSourceChecks.shard === "brooklyn-null", "acquired-source inventory identity mismatch");
  invariant(acquiredSourceChecks.candidate_set_id === CANDIDATE_SET_ID, "acquired-source candidate-set mismatch");
  invariant(acquiredSourceChecks.candidate_set_sha256 === CANDIDATE_SET_SHA256, "acquired-source candidate-set hash mismatch");
  const acquiredSourceById = new Map(acquiredSourceChecks.sources.map((source) => [source.id, source]));
  invariant(acquiredSourceById.size === acquiredSourceChecks.sources.length, "acquired-source id collision");
  for (const receipt of receipts) {
    invariant(receipt.schema_version === 1 && receipt.shard === "brooklyn-null", `${receipt.receipt_id} identity mismatch`);
    invariant(receipt.candidate.candidate_set_id === CANDIDATE_SET_ID, `${receipt.receipt_id} candidate-set mismatch`);
    invariant(receipt.candidate.candidate_set_sha256 === CANDIDATE_SET_SHA256, `${receipt.receipt_id} candidate-set hash mismatch`);
    invariant(!receipt.claim_results.explicit_phase_identity_proved, `${receipt.receipt_id} unexpectedly proves a phase`);
    invariant(!receipt.claim_results.date_and_phase_proved, `${receipt.receipt_id} unexpectedly proves date and phase`);
    invariant(!receipt.claim_results.operational_occurrence_identity_proved, `${receipt.receipt_id} unexpectedly proves occurrence identity`);
    invariant(!receipt.canonical_actions.operational_occurrence_added_or_updated, `${receipt.receipt_id} unexpectedly mutates an occurrence`);
    invariant(receipt.outcome.registry_projection_excluded && receipt.outcome.still_unresolved, `${receipt.receipt_id} exclusion mismatch`);
    invariant(!receipt.outcome.study_projection_eligible, `${receipt.receipt_id} unexpectedly study eligible`);
  }

  const canonicalRecords = readCanonicalRecordsFromJsonl();
  const canonicalById = new Map(canonicalRecords.map((record) => [record.record_id, record]));
  invariant(canonicalById.has(B54_CORRIDOR_ID), `missing canonical Jay Street corridor ${B54_CORRIDOR_ID}`);
  const canonicalRelationHashes = rawRecordHashes(join(repoRoot, "data", "canonical", "relations.jsonl"));
  const journal = buildJournal();
  const projectedRecords = entriesToRecords(journal);
  invariant(projectedRecords.length === journal.length, "B54 journal failed the materializer intake gate");
  const projectedById = new Map(projectedRecords.map((record) => [record.record_id, record]));
  const projectedRoute = projectedById.get(B54_ROUTE_ID);
  invariant(projectedRoute?.record_kind === "route", `accepted journal does not project ${B54_ROUTE_ID}`);
  const projectedRelation = projectedRecords.find((record) => record.record_kind === "relation");
  invariant(projectedRelation, "accepted journal does not project the B54 relation");
  const combinedById = new Map(canonicalById);
  for (const record of projectedRecords) combinedById.set(record.record_id, record);

  const rc20B54Lines = readFileSync(RC20_ROUTE_ANCHORS_PATH, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .filter((line) => (JSON.parse(line) as { gtfs_route_id: string | null }).gtfs_route_id === "B54");
  invariant(rc20B54Lines.length === 1, "rc20 B54 anchor row missing or duplicated");
  const rc20B54 = JSON.parse(rc20B54Lines[0]!) as {
    gtfs_route_id: string;
    canonical_route_record_id: string | null;
    disposition: string;
  };
  invariant(rc20B54.canonical_route_record_id === null && rc20B54.disposition === "no_wiki_coverage", "rc20 B54 baseline changed");
  const projectedAnchor = computeRouteAnchors(
    [projectedRoute],
    [{ route_id: "B54", short_name: "B54", long_name: "Downtown Brooklyn - Ridgewood", borough: "Brooklyn" }],
  );
  invariant(projectedAnchor.length === 1, "projected B54 anchor count mismatch");
  invariant(projectedAnchor[0]!.canonical_route_record_id === B54_ROUTE_ID, "B54 route does not exact-match the GTFS anchor");

  const decisions: BrooklynLinkageDecision[] = [];
  for (const expected of EXPECTED_CANDIDATES) {
    const receipt = receiptByCandidate.get(expected.candidateId)!;
    invariant(receipt.candidate.normalized_route_id === expected.normalizedRouteId, `${expected.candidateId} route inventory mismatch`);
    const relationRecords = expected.action === "verified_existing_canonical"
      ? expected.relationIds.map((relationId) => {
        const record = canonicalById.get(relationId);
        invariant(record, `missing expected canonical relation ${relationId}`);
        return { record, status: "canonical_existing" as const };
      })
      : [{ record: projectedRelation, status: "accepted_pending_submission" as const }];
    if (expected.action === "verified_existing_canonical") {
      const receiptIds = receipt.canonical_actions.existing_canonical_links_verified ?? [];
      invariant(
        stableJson([...receiptIds].sort(compareStrings) as never) === stableJson([...expected.relationIds].sort(compareStrings) as never),
        `${expected.candidateId} receipt/canonical relation inventory mismatch`,
      );
    }
    const proofs = relationRecords.map(({ record, status }) => relationProof(record, status, combinedById, canonicalRelationHashes));
    const authoritativeLinkageEvidence = receipt.claim_results.exact_route_binding_evidence
      .filter((item) => typeof item.supported_claim === "string" && item.supported_claim.length > 0)
      .map((item): AuthoritativeLinkageEvidence => {
        const acquiredSource = acquiredSourceById.get(item.source_id);
        invariant(acquiredSource, `${expected.candidateId} linkage source is absent from acquired-source inventory: ${item.source_id}`);
        invariant(acquiredSource.retrieval_status === "acquired", `${item.source_id} was not acquired`);
        invariant(acquiredSource.content_sha256 === item.source_sha256, `${item.source_id} acquisition hash mismatch`);
        const officialRoutes = item.official_routes ?? [];
        invariant(
          officialRoutes.some((route) => routeBase(route) === routeBase(expected.normalizedRouteId)),
          `${item.source_id} does not explicitly identify ${expected.normalizedRouteId}`,
        );
        return {
          source_id: item.source_id,
          source_sha256: item.source_sha256,
          source_url: acquiredSource.url,
          retrieved_on: acquiredSource.retrieved_on,
          evidence_kind: item.evidence_kind,
          official_routes: [...officialRoutes],
          supported_claim: item.supported_claim,
        };
      });
    invariant(authoritativeLinkageEvidence.length > 0, `${expected.candidateId} lacks exact authoritative linkage evidence`);
    const endpointIds = proofs.flatMap((proof) => [proof.subject_id, proof.object_id]);
    const routeEndpointIds = [...new Set(endpointIds.filter((id) => combinedById.get(id)?.record_kind === "route"))].sort(compareStrings);
    const contextEndpointIds = [...new Set(endpointIds.filter((id) => combinedById.get(id)?.record_kind !== "route"))].sort(compareStrings);
    invariant(routeEndpointIds.length > 0, `${expected.candidateId} has no canonical route endpoint`);
    invariant(contextEndpointIds.length > 0, `${expected.candidateId} has no project/treatment/corridor context endpoint`);
    invariant(routeEndpointIds.some((id) => {
      const route = combinedById.get(id)!;
      const routeId = recordRouteId(route);
      return routeId !== undefined && routeBase(routeId) === routeBase(expected.normalizedRouteId);
    }), `${expected.candidateId} canonical route endpoint does not match ${expected.normalizedRouteId}`);
    decisions.push({
      schema_version: 1,
      campaign_id: BROOKLYN_LINKAGE_CAMPAIGN_ID,
      candidate_id: expected.candidateId,
      receipt_id: receipt.receipt_id,
      identity: receipt.candidate.identity,
      route_id: receipt.candidate.route_id,
      normalized_route_id: receipt.candidate.normalized_route_id,
      corridor_literal: receipt.candidate.corridor,
      exclusive_action: expected.action,
      implemented_or_verified: true,
      relation_proofs: proofs,
      authoritative_linkage_evidence: authoritativeLinkageEvidence,
      canonical_route_endpoint_ids: routeEndpointIds,
      canonical_context_endpoint_ids: contextEndpointIds,
      route_binding_supported: true,
      route_binding_precision: "generic_authoritative_route_project_or_corridor_link_only",
      exact_candidate_segment_binding_proved: receipt.claim_results.exact_segment_binding_proved,
      candidate_date_and_phase_proved: false,
      canonical_operational_occurrence_identity_proved: false,
      operational_occurrence_added_or_updated: false,
      registry_candidate_day_inherited: false,
      phase_created: false,
      study_projection_eligible: false,
      registry_projection_excluded: true,
      still_unresolved: true,
    });
  }
  decisions.sort((left, right) => compareStrings(left.candidate_id, right.candidate_id));

  const b54Receipt = receiptByCandidate.get(B54_CANDIDATE_ID)!;
  const b54ReceiptEvidence = b54Receipt.claim_results.exact_route_binding_evidence.find((item) => item.source_id === "jay_launch_press");
  invariant(b54ReceiptEvidence?.source_sha256 === B54_PREVIOUS_RECEIPT_SOURCE_SHA256, "B54 receipt source hash changed");
  const sourceVerification: Record<string, unknown> = {
    schema_version: 1,
    campaign_id: BROOKLYN_LINKAGE_CAMPAIGN_ID,
    candidate_id: B54_CANDIDATE_ID,
    source_id: B54_SOURCE_ID,
    source_url: B54_SOURCE_URL,
    retrieval_date: "2026-07-15",
    retrieval_status: "reacquired_and_staged",
    previous_shard_source_id: "jay_launch_press",
    previous_shard_source_sha256: B54_PREVIOUS_RECEIPT_SOURCE_SHA256,
    current_source_html_sha256: B54_SOURCE_HTML_SHA256,
    source_content_changed_since_shard_acquisition: B54_PREVIOUS_RECEIPT_SOURCE_SHA256 !== B54_SOURCE_HTML_SHA256,
    exact_supported_claim_persists: true,
    route_corridor_evidence: {
      block_id: B54_ROUTE_BLOCK_ID,
      text_sha256: B54_ROUTE_BLOCK_SHA256,
      source_quote: B54_ROUTE_QUOTE,
      supported_claim: "B54 is one of the seven routes hosted on the Jay Street Busway between Livingston Street and Tillary Street as of the March 2, 2021 release.",
    },
    unsupported_claims: [
      "The source does not prove the registry candidate day 2020-08-31.",
      "The source does not identify which registry-matched DOT segment generated the candidate.",
      "The source does not assign a stable candidate-specific phase identity.",
      "The source does not establish a canonical operational-occurrence identity for the registry projection.",
    ],
  };
  const actionCounts = {
    verified_existing_canonical: decisions.filter((decision) => decision.exclusive_action === "verified_existing_canonical").length,
    implemented_by_accepted_submission: decisions.filter((decision) => decision.exclusive_action === "implemented_by_accepted_submission").length,
  };
  const journalContent = stableJsonl(journal);
  const decisionsContent = stableJsonl(decisions);
  const selectedCanonicalRecords = decisions
    .flatMap((decision) => decision.relation_proofs.filter((proof) => proof.record_status === "canonical_existing"))
    .map((proof) => ({ relation_id: proof.relation_id, record_sha256: proof.record_sha256 }))
    .sort((left, right) => compareStrings(left.relation_id, right.relation_id));
  const summary: Record<string, unknown> = {
    schema_version: 1,
    campaign_id: BROOKLYN_LINKAGE_CAMPAIGN_ID,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    supported_candidate_count: decisions.length,
    implemented_or_verified_candidate_count: decisions.filter((decision) => decision.implemented_or_verified).length,
    authoritative_linkage_evidence_count: decisions.reduce((count, decision) => count + decision.authoritative_linkage_evidence.length, 0),
    candidate_actions: actionCounts,
    existing_canonical_relation_count: selectedCanonicalRecords.length,
    accepted_pending_source_count: 1,
    accepted_pending_route_count: 1,
    accepted_pending_relation_count: 1,
    journal_submission_count: journal.length,
    exact_candidate_segment_binding_proved_count: decisions.filter((decision) => decision.exact_candidate_segment_binding_proved).length,
    registry_day_inherited_count: 0,
    phase_addition_count: 0,
    operational_occurrence_addition_or_update_count: 0,
    study_projection_eligible_count: 0,
    registry_projection_excluded_count: decisions.filter((decision) => decision.registry_projection_excluded).length,
    still_unresolved_count: decisions.filter((decision) => decision.still_unresolved).length,
    existing_canonical_records_sha256: sha256(stableJson(selectedCanonicalRecords as never)),
    receipts_sha256: fileSha256(RECEIPTS_PATH),
    acquired_source_checks_sha256: fileSha256(ACQUIRED_SOURCE_CHECKS_PATH),
    source_html_sha256: fileSha256(SOURCE_HTML_PATH),
    source_blocks_sha256: fileSha256(SOURCE_BLOCKS_PATH),
    rc20_route_anchors_sha256: fileSha256(RC20_ROUTE_ANCHORS_PATH),
    rc20_b54_anchor_row_sha256: sha256(rc20B54Lines[0]!),
    projected_b54_gtfs_anchor: projectedAnchor[0],
    remediation_journal_path: relative(repoRoot, JOURNAL_PATH),
    remediation_journal_sha256: sha256(journalContent),
    decisions_sha256: sha256(decisionsContent),
    authorization: "non_authorizing_canonical_linkage_remediation",
  };
  const report = buildReport(summary);
  const artifactContents = [
    { path: "decisions.jsonl", content: decisionsContent },
    { path: "summary.json", content: `${stableJson(summary as never)}\n` },
    { path: "source-verification.json", content: `${stableJson(sourceVerification as never)}\n` },
    { path: "report.md", content: report },
    { path: relative(ARTIFACT_DIR, JOURNAL_PATH), content: journalContent },
  ];
  const manifestPayload: Record<string, unknown> = {
    schema_version: 1,
    campaign_id: BROOKLYN_LINKAGE_CAMPAIGN_ID,
    generated_on: "2026-07-15",
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    candidate_count: decisions.length,
    inputs: {
      shard_receipts: { path: relative(repoRoot, RECEIPTS_PATH), sha256: fileSha256(RECEIPTS_PATH) },
      acquired_source_checks: { path: relative(repoRoot, ACQUIRED_SOURCE_CHECKS_PATH), sha256: fileSha256(ACQUIRED_SOURCE_CHECKS_PATH) },
      staged_source_html: { path: relative(repoRoot, SOURCE_HTML_PATH), sha256: fileSha256(SOURCE_HTML_PATH) },
      staged_source_blocks: { path: relative(repoRoot, SOURCE_BLOCKS_PATH), sha256: fileSha256(SOURCE_BLOCKS_PATH) },
      rc20_route_anchors: { path: relative(repoRoot, RC20_ROUTE_ANCHORS_PATH), sha256: fileSha256(RC20_ROUTE_ANCHORS_PATH) },
      selected_canonical_records_sha256: summary.existing_canonical_records_sha256,
    },
    artifacts: artifactContents.map((artifact) => ({
      path: artifact.path,
      sha256: sha256(artifact.content),
      bytes: Buffer.byteLength(artifact.content),
    })),
  };
  const manifest = {
    ...manifestPayload,
    manifest_payload_sha256: sha256(stableJson(manifestPayload as never)),
  };
  return { journal, decisions, summary, sourceVerification, report, manifest };
}

function contents(campaign: BrooklynLinkageCampaign): Record<string, string> {
  return {
    [JOURNAL_PATH]: stableJsonl(campaign.journal),
    [DECISIONS_PATH]: stableJsonl(campaign.decisions),
    [SUMMARY_PATH]: `${stableJson(campaign.summary as never)}\n`,
    [SOURCE_VERIFICATION_PATH]: `${stableJson(campaign.sourceVerification as never)}\n`,
    [REPORT_PATH]: campaign.report,
    [MANIFEST_PATH]: `${stableJson(campaign.manifest as never)}\n`,
  };
}

function applyCampaign(campaign: BrooklynLinkageCampaign): void {
  for (const [path, content] of Object.entries(contents(campaign))) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) writeFileSync(path, content, "utf8");
  }
}

function checkCampaign(campaign: BrooklynLinkageCampaign): void {
  for (const [path, expected] of Object.entries(contents(campaign))) {
    invariant(existsSync(path), `missing generated artifact ${relative(repoRoot, path)}; run --apply`);
    invariant(readFileSync(path, "utf8") === expected, `generated artifact differs: ${relative(repoRoot, path)}; run --apply`);
  }
}

if (import.meta.main) {
  const apply = process.argv.includes("--apply");
  invariant(!(apply && process.argv.includes("--check")), "choose one of --apply or --check");
  const campaign = buildBrooklynLinkageCampaign();
  if (apply) applyCampaign(campaign);
  else checkCampaign(campaign);
  process.stdout.write(`${stableJson({
    mode: apply ? "apply" : "check",
    supported_candidates: campaign.decisions.length,
    candidate_actions: campaign.summary.candidate_actions,
    existing_canonical_relations: campaign.summary.existing_canonical_relation_count,
    accepted_pending_relations: campaign.summary.accepted_pending_relation_count,
    journal_sha256: campaign.summary.remediation_journal_sha256,
    manifest_payload_sha256: campaign.manifest.manifest_payload_sha256,
  } as never)}\n`);
}
