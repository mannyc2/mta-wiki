import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord, MtaEvidenceRef } from "../packages/db/src/types";
import { entriesToRecords } from "../packages/pipeline/src/materialize/materialize";
import { retiredSubmissionIds } from "../packages/pipeline/src/records/submission-overrides";
import { readSubmissionEntries } from "../packages/pipeline/src/records/submissions";
import {
  readSemanticCorrections,
  readSemanticCorrectionSupersessions,
  withSemanticCorrections,
} from "../packages/pipeline/src/records/semantic-corrections";
import { sourceBlockById, sourceBlocksRelativePath } from "../packages/pipeline/src/sources/source-prep";

const CONTRACT_DIR = join(repoRoot, "data/contracts/relationships/v1");
const REVIEW_PATH = join(CONTRACT_DIR, "semantic-review-shards/part-0.json");
const OUTPUT_PATH = join(CONTRACT_DIR, "semantic-remediation-shards/part-0.json");
const MATRIX_PATH = join(CONTRACT_DIR, "allowed-endpoint-types.json");
const CORRECTIONS_PATH = join(repoRoot, "data/semantic-corrections/corrections.jsonl");
const SUPERSESSIONS_PATH = join(repoRoot, "data/semantic-corrections/supersessions-v1.json");
const RETIRED_PATH = join(repoRoot, "data/submission-overrides/retired.json");
const IDENTITY_REVIEW_PATH = join(
  repoRoot,
  "data/quality/relationship-integrity/entity-identity/mta-nyct-target-reviewed-decisions.json",
);
const REVIEWED_AT = "2026-07-16T00:00:00.000Z";
const REVIEWED_BY = "Codex relationship-integrity semantic remediation / part-0";

type ReviewDecision = {
  tuple_index: number;
  semantic_rationale: string;
  remediation_proposal: string | null;
  suspect_relation_ids: string[];
};

type ReviewArtifact = {
  projection: {
    authoritative_submission_records_sha256: string;
    post_correction_records_sha256: string;
  };
  decisions: ReviewDecision[];
};

type Guards = {
  family: string;
  kind: string;
  subject_id: string;
  object_id: string;
};

type PatchSet = {
  relation_family: string;
  relation_kind: string;
  subject_id: string;
  object_id: string;
};

type EndpointMatrix = {
  contract_id: string;
  rules: Array<{
    relation_kind: string;
    allowed_family_shapes: Array<{
      relation_family: string;
      subject_kind: string;
      object_kind: string;
    }>;
  }>;
};

type ActionSpec =
  | { action_type: "retract_unsupported"; replacement_relation_ids: string[] }
  | { action_type: "replace_endpoint"; field: "subject_id" | "object_id"; to_record_id: string }
  | { action_type: "patch_relation"; set: PatchSet }
  | {
      action_type: "resolved_by_identity_campaign";
      identity_submission_ids: string[];
      expected_subject_id: string;
      expected_object_id: string;
      additional_patch?: Partial<PatchSet>;
    }
  | {
      action_type: "resolved_by_generator_fix";
      rule_id: string;
      change: string;
      expected_relation_disposition: string;
    };

const ENDPOINT_REPLACEMENTS = new Map<string, { field: "subject_id" | "object_id"; to_record_id: string }>([
  ["relation_a-rockaways-lirr-partnership", { field: "object_id", to_record_id: "entity_annual-report-2021-lirr" }],
  ["relation_data-analytics-manages-open-data", { field: "object_id", to_record_id: "project_mta-open-data-program" }],
  ["relation_jaibala-cfo-mta", { field: "object_id", to_record_id: "entity_mta-entity-update-2025" }],
  ["relation_lirr-operating-budget-funds-projects", { field: "object_id", to_record_id: "entity_mta-capital-program" }],
  ["relation_meeting-doc-128961-nyct-division-subways", { field: "object_id", to_record_id: "entity_nyct-dept-of-subways" }],
  ["relation_meeting-doc-133361-lirr-license-vpct", { field: "object_id", to_record_id: "entity_vpct-realty-llc" }],
  ["relation_meeting-doc-171141-lirr-penn-ticket-checks", { field: "object_id", to_record_id: "entity_penn-station-127546" }],
  ["relation_meeting-doc-192191-halmar-pav", { field: "object_id", to_record_id: "entity_halmar-international-meeting-doc-115231" }],
  ["relation_meeting164941-funding-2020-2024-capital", { field: "object_id", to_record_id: "project_2020-2024-capital-program-meeting-doc-152166" }],
  ["relation_mnrr-mta-parent", { field: "object_id", to_record_id: "entity_mta-entity-update-2025" }],
  ["relation_nhl-pilot-funded-by-ctdot", { field: "object_id", to_record_id: "entity_cdot-meeting-doc-104741" }],
  ["relation_nypd-enforces-bus-lanes_2", { field: "object_id", to_record_id: "claim_bus-lane-enforcement-methods" }],
  ["relation_project-part-of-brt-phase2", { field: "object_id", to_record_id: "project_brt-phase-ii-study" }],
  ["relation_project-uses-amtrak-hell-gate-meeting-doc-205586", { field: "object_id", to_record_id: "corridor_hell-gate-line-amtrak" }],
  ["relation_rel-greystone-mta-real-estate", { field: "object_id", to_record_id: "entity_mta-real-estate" }],
  ["relation_rel-jamaica-depot-skanska-hotline", { field: "object_id", to_record_id: "entity_skanska-meeting-doc-196836" }],
  ["relation_rel-mercer-consultant-caremark", { field: "object_id", to_record_id: "entity_mta-entity-update-2025" }],
  ["relation_rel-mta-fsa-contract-pa", { field: "subject_id", to_record_id: "entity_mta-entity-update-2025" }],
  ["relation_rel-mta-greystone-contract", { field: "subject_id", to_record_id: "entity_mta-entity-update-2025" }],
  ["relation_rel-mta-pbm-contract-caremark", { field: "subject_id", to_record_id: "entity_mta-entity-update-2025" }],
  ["relation_rel-omny-ch2m-support", { field: "object_id", to_record_id: "entity_ch2m-hill-new-york" }],
  ["relation_robert-foran-cfo-mta_2", { field: "object_id", to_record_id: "entity_mta-entity-update-2025" }],
]);

const PATCHES = new Map<string, PatchSet>([
  ["relation_197041-psa-easements", {
    relation_family: "funding_award",
    relation_kind: "acquires_easement_from",
    subject_id: "entity_mta-entity-update-2025",
    object_id: "entity_con-edison",
  }],
  ["relation_bos-operated-by-etech", {
    relation_family: "funding_award",
    relation_kind: "contracted_by",
    subject_id: "project_bos-procurement-2025",
    object_id: "entity_meeting-doc-167236-etech-simulation",
  }],
  ["relation_congestion-relief-2nd-3rd-ave", {
    relation_family: "dependency_or_reference",
    relation_kind: "complementary_project",
    subject_id: "project_annual-2021-cbdtp",
    object_id: "project_2nd-3rd-ave-protected-lanes",
  }],
  ["relation_crz-metrics-fund-project", {
    relation_family: "metric_context",
    relation_kind: "has_metric",
    subject_id: "project_annual-2021-cbdtp",
    object_id: "metric_crz-net-revenue-411m",
  }],
  ["relation_ddcr-goals-for-contract", {
    relation_family: "governance_legal",
    relation_kind: "established_goals_for",
    subject_id: "entity_meeting-doc-ddcr",
    object_id: "project_partial-demolition-lirr-building-alphapointe",
  }],
  ["relation_dob-clever-devices-192241", {
    relation_family: "agency_role",
    relation_kind: "requested_by",
    subject_id: "event_clever-devices-contract-award-192241",
    object_id: "entity_department-of-buses",
  }],
  ["relation_dob-new-flyer-192241", {
    relation_family: "agency_role",
    relation_kind: "requested_by",
    subject_id: "event_new-flyer-modification-192241",
    object_id: "entity_department-of-buses",
  }],
  ["relation_dos-standard-steel-192241", {
    relation_family: "agency_role",
    relation_kind: "requested_by",
    subject_id: "event_standard-steel-ratification-192241",
    object_id: "entity_dept-of-subways-crichlow",
  }],
  ["relation_hall-interlocking-part-of-jci2", {
    relation_family: "program_project_scope",
    relation_kind: "part_of_program",
    subject_id: "project_hall-interlocking-expansion",
    object_id: "project_jamaica-capacity-improvements",
  }],
  ["relation_libla-license-to-lirr", {
    relation_family: "funding_award",
    relation_kind: "licensee_of",
    subject_id: "entity_meeting-doc-192221-libla-realty",
    object_id: "entity_annual-report-2021-lirr",
  }],
  ["relation_meeting-doc-127476-procurement-prevost", {
    relation_family: "funding_award",
    relation_kind: "awarded_to",
    subject_id: "event_meeting-doc-127476-prevost-procurement",
    object_id: "entity_prevost-car-us",
  }],
  ["relation_meeting-doc-174011-mta-treasury", {
    relation_family: "agency_role",
    relation_kind: "reports_to",
    subject_id: "entity_meeting-doc-111901-mta-treasury",
    object_id: "entity_kevin-willens-140486",
  }],
  ["relation_meeting-doc-199151-dept-subways-oss-rwp-manual", {
    relation_family: "publication_role",
    relation_kind: "prepared_by",
    subject_id: "claim_meeting-doc-199151-rwp-manual-fta",
    object_id: "entity_dept-of-subways-crichlow",
  }],
  ["relation_meeting-doc-nyct-organized-by-compton", {
    relation_family: "publication_role",
    relation_kind: "authored_by",
    subject_id: "source_meeting-doc-105956",
    object_id: "entity_meeting-doc-james-compton",
  }],
  ["relation_moa-signed-by-margaret-connor", {
    relation_family: "governance_legal",
    relation_kind: "signed_by",
    subject_id: "event_moa-execution-nov2002",
    object_id: "entity_margaret-connor-mta-hr",
  }],
  ["relation_moa-signed-by-raymond-gruber", {
    relation_family: "governance_legal",
    relation_kind: "signed_by",
    subject_id: "event_moa-execution-nov2002",
    object_id: "entity_raymond-gruber-pba",
  }],
  ["relation_mta-congestion-relief-zone", {
    relation_family: "metric_context",
    relation_kind: "has_metric",
    subject_id: "project_annual-2021-cbdtp",
    object_id: "metric_congestion-relief-traffic-reduction",
  }],
  ["relation_mta-operates-bus-lane-cameras", {
    relation_family: "agency_role",
    relation_kind: "operates",
    subject_id: "entity_mta-entity-update-2025",
    object_id: "claim_bus-lane-enforcement-methods",
  }],
  ["relation_oss-generated-ptasp-nyct", {
    relation_family: "publication_role",
    relation_kind: "prepared_by",
    subject_id: "claim_oss-generated-2023-ptasp",
    object_id: "entity_office-of-system-safety-133161",
  }],
  ["relation_meeting-doc-98321-ch2m-supports-omny-v2", {
    relation_family: "dependency_or_reference",
    relation_kind: "supports",
    subject_id: "entity_ch2m-hill-new-york",
    object_id: "project_omny",
  }],
  ["relation_siemens-operator-cdot-option", {
    relation_family: "funding_award",
    relation_kind: "contracted_by",
    subject_id: "project_cdot-dual-mode-locomotive-option",
    object_id: "entity_meeting-doc-113916-siemens",
  }],
]);

const IDENTITY_RESOLVED = new Set([
  "relation_rel-mta-publishes-user-personas",
  "relation_rel-mta-releases-20yr-needs-datasets",
  "relation_rel-mta-releases-hourly-ridership-datasets",
  "relation_rel-mta-releases-sir-datasets",
]);

const GENERATOR_FIXES = new Set([
  "relation_operated-by-project-34th-street-busway-entity-nyc-dot_47763c917b",
  "relation_operated-by-project-better-buses-entity-nyc-dot_ae754aa8c4",
  "relation_operated-by-project-gct-fire-standpipe-phase2-entity-meeting-doc-124881-mnr_51b40c26c7",
  "relation_operated-by-project-haverstraw-ferry-terminal-entity-meeting-doc-160166-ny-waterway_7a4d812ace",
  "relation_operated-by-project-jamaica-temporary-bus-terminal-gjdc-entity-mta-bus-company_d5f3735c59",
  "relation_operated-by-project-lirr-lic-flood-wall-entity-annual-report-2021-lirr_d0e8fa8e24",
  "relation_operated-by-project-lirr-station-spruce-up-entity-annual-report-2021-lirr_df7995792c",
  "relation_operated-by-project-meeting-doc-131491-bus-radio-system-entity-mta-bus-company_7a82fc5383",
  "relation_operated-by-project-mnr-nextgen-tvm-rollout-entity-meeting-doc-124881-mnr_4399aa53d0",
  "relation_operated-by-project-mnr-sc42-locomotive-entity-meeting-doc-124881-mnr_8befb3b6cc",
  "relation_operated-by-project-rail-flaw-testing-joint-bar-inspection-138251-entity-annual-report-2021-lirr_6e2bca88e4",
  "relation_operated-by-project-southeast-station-parking-garage-dec2023-entity-meeting-doc-124881-mnr_b57715b539",
  "relation_operated-by-project-stationary-camera-program-entity-nyc-dot_b8bdee302d",
]);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

function idsSha256(ids: readonly string[]): string {
  return sha256(stableJson([...ids].sort() as unknown as JsonValue));
}

function recordsSha256(records: readonly MtaCanonicalRecord[]): string {
  const hash = createHash("sha256");
  hash.update("[");
  for (const [index, record] of records.entries()) {
    if (index > 0) hash.update(",");
    hash.update(stableJson(record as unknown as JsonValue));
  }
  hash.update("]");
  return hash.digest("hex");
}

function text(value: JsonValue | undefined, label: string, recordId: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${recordId} lacks ${label}`);
  return value.trim();
}

function narrative(record: MtaCanonicalRecord): string {
  const description = record.payload.description;
  if (typeof description === "string" && description.trim()) return description.trim();
  if (record.raw_text?.trim()) return record.raw_text.trim();
  return record.display_name;
}

function guards(record: MtaCanonicalRecord): Guards {
  return {
    family: text(record.payload.relation_family, "relation_family", record.record_id),
    kind: text(record.payload.relation_kind, "relation_kind", record.record_id),
    subject_id: text(record.payload.subject_id, "subject_id", record.record_id),
    object_id: text(record.payload.object_id, "object_id", record.record_id),
  };
}

function evidenceBinding(ref: MtaEvidenceRef, relationId: string) {
  if (!ref.evidence_id || !ref.block_id || !ref.source_path || !ref.text_sha256) {
    throw new Error(`${relationId} has an incomplete evidence binding`);
  }
  const expectedPath = sourceBlocksRelativePath(ref.source_id);
  if (ref.source_path !== expectedPath) {
    throw new Error(`${relationId} evidence ${ref.evidence_id} has source_path ${ref.source_path}, expected ${expectedPath}`);
  }
  const block = sourceBlockById(ref.source_id, ref.block_id);
  const expectedHash = ref.text_source === "normalized_text"
    ? block.normalized_text_sha256
    : block.raw_text_sha256;
  if (ref.text_sha256 !== expectedHash) {
    throw new Error(`${relationId} evidence ${ref.evidence_id} hash does not match staged source block`);
  }
  if (ref.page_number !== undefined && ref.page_number !== block.page_number) {
    throw new Error(`${relationId} evidence ${ref.evidence_id} page does not match staged source block`);
  }
  return {
    evidence_id: ref.evidence_id,
    source_id: ref.source_id,
    source_path: ref.source_path,
    block_id: ref.block_id,
    ...(ref.block_range ? { block_range: ref.block_range } : {}),
    page_number: ref.page_number ?? block.page_number,
    text_sha256: ref.text_sha256,
    text_source: ref.text_source ?? "raw_text",
  };
}

function correctedCorpus() {
  const corrections = readSemanticCorrections();
  const supersessions = readSemanticCorrectionSupersessions();
  const mechanicalRecords = entriesToRecords(readSubmissionEntries(), {
    retiredSubmissionIds: retiredSubmissionIds(),
  });
  const replay = withSemanticCorrections(mechanicalRecords, corrections, supersessions);
  return { corrections, supersessions, mechanicalRecords, replay };
}

function actionFor(record: MtaCanonicalRecord): ActionSpec {
  const endpoint = ENDPOINT_REPLACEMENTS.get(record.record_id);
  if (endpoint) return { action_type: "replace_endpoint", ...endpoint };
  const patch = PATCHES.get(record.record_id);
  if (patch) return { action_type: "patch_relation", set: patch };
  if (IDENTITY_RESOLVED.has(record.record_id)) {
    return {
      action_type: "resolved_by_identity_campaign",
      identity_submission_ids: ["sub_5349270c43b264c0"],
      expected_subject_id: "entity_mta-entity-update-2025",
      expected_object_id: guards(record).object_id,
    };
  }
  if (GENERATOR_FIXES.has(record.record_id)) {
    return {
      action_type: "resolved_by_generator_fix",
      rule_id: "derived-operated-by-requires-exact-operator-v1",
      change: "Do not derive operated_by from publisher, MTA Connection, or general agency-scope metadata; emit the edge only when exact cited evidence names the operator.",
      expected_relation_disposition: "retracted",
    };
  }
  return { action_type: "retract_unsupported", replacement_relation_ids: [] };
}

function actionWithGuards(action: ActionSpec, current: Guards) {
  if (action.action_type === "replace_endpoint" || action.action_type === "patch_relation") {
    return { ...action, guards: current };
  }
  return action;
}

function proposedSet(action: ActionSpec, current: Guards): PatchSet | undefined {
  if (action.action_type === "patch_relation") return action.set;
  if (action.action_type === "replace_endpoint") {
    return {
      relation_family: current.family,
      relation_kind: current.kind,
      subject_id: action.field === "subject_id" ? action.to_record_id : current.subject_id,
      object_id: action.field === "object_id" ? action.to_record_id : current.object_id,
    };
  }
  if (action.action_type === "resolved_by_identity_campaign") {
    return {
      relation_family: action.additional_patch?.relation_family ?? current.family,
      relation_kind: action.additional_patch?.relation_kind ?? current.kind,
      subject_id: action.expected_subject_id,
      object_id: action.expected_object_id,
    };
  }
  return undefined;
}

function supportedClaims(record: MtaCanonicalRecord, action: ActionSpec): string[] {
  const description = narrative(record);
  switch (action.action_type) {
    case "replace_endpoint":
      return [`The exact cited evidence supports the relation narrative after ${action.field} is resolved to ${action.to_record_id}: ${description}`];
    case "patch_relation":
      return [`The exact cited evidence supports ${action.set.subject_id} ${action.set.relation_kind} ${action.set.object_id}: ${description}`];
    case "resolved_by_identity_campaign":
      return [`The evidence attributes the publication action to umbrella MTA, resolved by ${action.identity_submission_ids.join(", ")}, rather than NYCT: ${description}`];
    case "resolved_by_generator_fix":
      return [`The cited source supports the underlying project and organization context recorded by the source observation: ${description}`];
    case "retract_unsupported":
      return [`The cited evidence preserves this source-level narrative for possible remodeling without preserving the invalid tuple: ${description}`];
  }
}

function unsupportedClaims(record: MtaCanonicalRecord, action: ActionSpec, semanticRationale: string): string[] {
  if (action.action_type === "resolved_by_generator_fix") {
    return ["Publisher, MTA Connection, or general agency scope does not prove that the named organization operated the project."];
  }
  if (action.action_type === "resolved_by_identity_campaign") {
    return ["The cited Open Data evidence does not support narrowing the publishing organization to NYCT."];
  }
  if (action.action_type === "retract_unsupported") return [semanticRationale];
  return [`The current guarded tuple ${guards(record).subject_id} ${guards(record).kind} ${guards(record).object_id} is not supported at the cited precision.`];
}

function rationaleFor(action: ActionSpec, semanticRationale: string): string {
  switch (action.action_type) {
    case "replace_endpoint":
      return `${semanticRationale} A canonical replacement endpoint already exists, so a guarded one-field replacement preserves the evidence and removes the surrogate endpoint.`;
    case "patch_relation":
      return `${semanticRationale} The existing canonical registry contains the exact evidence-supported actors/artifacts, allowing a guarded tuple rewrite without inventing a record.`;
    case "resolved_by_identity_campaign":
      return `${semanticRationale} The separately reviewed identity submission resolves the umbrella MTA actor and is pinned here rather than duplicating identity work.`;
    case "resolved_by_generator_fix":
      return `${semanticRationale} This edge is deterministic generator output, so the durable fix belongs in the derivation rule and retracts the unsupported generated edge.`;
    case "retract_unsupported":
      return `${semanticRationale} Exact source and registry review did not establish a canonical replacement tuple at the claimed precision; retraction preserves truth and avoids a surrogate endpoint.`;
  }
}

const check = process.argv.includes("--check");
const apply = process.argv.includes("--apply");
if (check === apply) throw new Error("Pass exactly one of --check or --apply");

const review = JSON.parse(readFileSync(REVIEW_PATH, "utf8")) as ReviewArtifact;
const suspectRows = review.decisions.flatMap((decision) => decision.suspect_relation_ids.map((relationId) => ({
  relation_id: relationId,
  tuple_index: decision.tuple_index,
  semantic_rationale: decision.semantic_rationale,
  remediation_proposal: decision.remediation_proposal,
})));
const duplicateSuspects = suspectRows.filter((row, index) => suspectRows.findIndex((other) => other.relation_id === row.relation_id) !== index);
if (duplicateSuspects.length > 0) throw new Error(`Duplicate suspect relation ids: ${duplicateSuspects.map(({ relation_id }) => relation_id).join(", ")}`);
if (suspectRows.length !== 100) throw new Error(`Part-0 review must contain exactly 100 suspects, found ${suspectRows.length}`);

const corpus = correctedCorpus();
const recordById = new Map(corpus.replay.records.map((record) => [record.record_id, record]));
const canonicalIds = new Set(recordById.keys());
const aliasIds = new Set(corpus.replay.records.flatMap((record) => record.record_aliases ?? []));
const endpointMatrix = JSON.parse(readFileSync(MATRIX_PATH, "utf8")) as EndpointMatrix;

const decisions = suspectRows.map((row) => {
  const record = recordById.get(row.relation_id);
  if (!record || record.record_kind !== "relation") throw new Error(`Suspect relation ${row.relation_id} is absent from authoritative replay`);
  const current = guards(record);
  const bindings = record.evidence_refs.map((ref) => evidenceBinding(ref, record.record_id)).sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
  const action = actionFor(record);
  if (action.action_type === "replace_endpoint") {
    if (!canonicalIds.has(action.to_record_id) || aliasIds.has(action.to_record_id)) {
      throw new Error(`${record.record_id} replacement target ${action.to_record_id} is not a canonical physical record id`);
    }
  }
  if (action.action_type === "patch_relation") {
    for (const endpoint of [action.set.subject_id, action.set.object_id]) {
      if (!canonicalIds.has(endpoint) || aliasIds.has(endpoint)) {
        throw new Error(`${record.record_id} patch target ${endpoint} is not a canonical physical record id`);
      }
    }
    if (action.set.subject_id === action.set.object_id) throw new Error(`${record.record_id} patch retains a self-loop`);
  }
  const proposed = proposedSet(action, current);
  const proposedSubject = proposed ? recordById.get(proposed.subject_id) : undefined;
  const proposedObject = proposed ? recordById.get(proposed.object_id) : undefined;
  const currentContractShapeAllowed = proposed
    ? endpointMatrix.rules.some((rule) => rule.relation_kind === proposed.relation_kind && rule.allowed_family_shapes.some((shape) => (
      shape.relation_family === proposed.relation_family
      && shape.subject_kind === proposedSubject?.record_kind
      && shape.object_kind === proposedObject?.record_kind
    )))
    : undefined;
  return {
    relation_id: record.record_id,
    tuple_indices: [row.tuple_index],
    current_snapshot: {
      record_kind: record.record_kind,
      family: current.family,
      kind: current.kind,
      subject_id: current.subject_id,
      object_id: current.object_id,
      payload_sha256: sha256(stableJson(record.payload as unknown as JsonValue)),
      evidence_ids: bindings.map(({ evidence_id }) => evidence_id),
      evidence_bindings_sha256: sha256(stableJson(bindings as unknown as JsonValue)),
    },
    terminal_action: action.action_type,
    rationale: rationaleFor(action, row.semantic_rationale),
    supported_claims: supportedClaims(record, action),
    unsupported_claims: unsupportedClaims(record, action, row.semantic_rationale),
    investigation: {
      method: "Rebuilt accepted submissions with retirement overrides, replayed the complete non-superseded semantic-correction journal, resolved both endpoints against the canonical registry, and verified every evidence id/hash/page against its staged source block.",
      evidence_ids_reviewed: bindings.map(({ evidence_id }) => evidence_id),
      current_description: narrative(record),
      prior_remediation_proposal: row.remediation_proposal,
      canonical_endpoint_targets_checked: action.action_type === "replace_endpoint"
        ? [action.to_record_id]
        : action.action_type === "patch_relation"
          ? [action.set.subject_id, action.set.object_id]
          : [],
      ...(proposed ? {
        proposed_endpoint_shape: {
          relation_family: proposed.relation_family,
          relation_kind: proposed.relation_kind,
          subject_kind: proposedSubject?.record_kind,
          object_kind: proposedObject?.record_kind,
          current_contract_shape_allowed: currentContractShapeAllowed,
        },
      } : {}),
    },
    action: actionWithGuards(action, current),
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
  };
}).sort((a, b) => a.relation_id.localeCompare(b.relation_id));

const allKnownActionIds = new Set([...ENDPOINT_REPLACEMENTS.keys(), ...PATCHES.keys(), ...IDENTITY_RESOLVED, ...GENERATOR_FIXES]);
for (const relationId of allKnownActionIds) {
  if (!decisions.some((decision) => decision.relation_id === relationId)) {
    throw new Error(`Action mapping ${relationId} is not owned by part-0`);
  }
}

const evidenceIds = [...new Set(decisions.flatMap((decision) => decision.current_snapshot.evidence_ids))].sort();
const shapeExpansionIds = decisions.filter((decision) => (
  decision.investigation.proposed_endpoint_shape?.current_contract_shape_allowed === false
)).map(({ relation_id }) => relation_id);
const actionCounts = Object.fromEntries([...new Set(decisions.map((decision) => decision.terminal_action))]
  .sort()
  .map((actionType) => [actionType, decisions.filter((decision) => decision.terminal_action === actionType).length]));
const output = {
  schema_version: 1,
  contract_id: "relationship-semantic-remediation-v1",
  shard_id: "part-0",
  review_status: "complete",
  pinned_inputs: {
    semantic_review: {
      path: relative(repoRoot, REVIEW_PATH),
      sha256: fileSha256(REVIEW_PATH),
    },
    endpoint_type_matrix: {
      path: relative(repoRoot, MATRIX_PATH),
      sha256: fileSha256(MATRIX_PATH),
      contract_id: endpointMatrix.contract_id,
    },
    accepted_submission_projection: {
      method: "entriesToRecords(readSubmissionEntries(), retiredSubmissionIds)",
      record_count: corpus.mechanicalRecords.length,
      records_sha256: recordsSha256(corpus.mechanicalRecords),
      expected_review_records_sha256: review.projection.authoritative_submission_records_sha256,
    },
    semantic_corrections: {
      path: relative(repoRoot, CORRECTIONS_PATH),
      file_sha256: fileSha256(CORRECTIONS_PATH),
      logical_sha256: sha256(stableJson(corpus.corrections as unknown as JsonValue)),
    },
    semantic_correction_supersessions: {
      path: relative(repoRoot, SUPERSESSIONS_PATH),
      file_sha256: fileSha256(SUPERSESSIONS_PATH),
      logical_sha256: sha256(stableJson(corpus.supersessions as unknown as JsonValue)),
    },
    retired_submissions: {
      path: relative(repoRoot, RETIRED_PATH),
      sha256: fileSha256(RETIRED_PATH),
    },
    post_correction_projection: {
      method: "withSemanticCorrections(mechanicalRecords, corrections, supersessions)",
      record_count: corpus.replay.records.length,
      records_sha256: recordsSha256(corpus.replay.records),
      expected_review_records_sha256: review.projection.post_correction_records_sha256,
      replay_issue_count: corpus.replay.issues.length,
      replay_issue_record_ids: [...new Set(corpus.replay.issues.flatMap((issue) => issue.recordId ? [issue.recordId] : []))].sort(),
      applied_correction_count: corpus.replay.summary.applied,
      superseded_correction_count: corpus.replay.summary.superseded,
      skipped_correction_count: corpus.replay.summary.skipped,
    },
    identity_campaign: {
      path: relative(repoRoot, IDENTITY_REVIEW_PATH),
      sha256: fileSha256(IDENTITY_REVIEW_PATH),
      pinned_submission_ids: ["sub_5349270c43b264c0"],
    },
  },
  summary: {
    relation_count: decisions.length,
    relation_ids_sha256: idsSha256(decisions.map(({ relation_id }) => relation_id)),
    evidence_id_count: evidenceIds.length,
    evidence_ids_sha256: idsSha256(evidenceIds),
    terminal_action_counts: actionCounts,
    current_contract_shape_expansion_required_count: shapeExpansionIds.length,
    current_contract_shape_expansion_required_relation_ids: shapeExpansionIds,
    current_contract_shape_expansion_required_relation_ids_sha256: idsSha256(shapeExpansionIds),
    zero_unreviewed: true,
  },
  decisions,
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
const rendered = `${JSON.stringify(output, null, 2)}\n`;
if (check) {
  const existing = readFileSync(OUTPUT_PATH, "utf8");
  if (existing !== rendered) throw new Error(`${relative(repoRoot, OUTPUT_PATH)} is stale; rerun with --apply`);
  console.log(JSON.stringify({
    artifact: relative(repoRoot, OUTPUT_PATH),
    sha256: sha256(rendered),
    ...output.summary,
    status: "deterministic-and-source-verified",
  }, null, 2));
} else {
  writeFileSync(OUTPUT_PATH, rendered, "utf8");
}
