import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord, MtaEvidenceSubmissionRef, MtaSubmitObservationInput } from "../packages/db/src/types";
import { normalizeSubmitInput, validateSubmitInput } from "../packages/pipeline/src/records/submissions";

const CONTRACT_ROOT = join(repoRoot, "data/contracts/relationships/v1");
const REVIEW_PATH = join(CONTRACT_ROOT, "semantic-review-shards/part-1.json");
const OUTPUT_PATH = join(CONTRACT_ROOT, "semantic-remediation-shards/part-1.json");
const CANONICAL_DIR = join(repoRoot, "data/canonical");
const RELATIONS_PATH = join(CANONICAL_DIR, "relations.jsonl");
const CORRECTIONS_PATH = join(repoRoot, "data/semantic-corrections/corrections.jsonl");
const SUPERSESSIONS_PATH = join(repoRoot, "data/semantic-corrections/supersessions-v1.json");
const SUBMISSIONS_DIR = join(repoRoot, "data/submissions");
const REVIEWED_AT = "2026-07-16T00:00:00.000Z";
const REVIEWED_BY = "Codex executable semantic-remediation review / part-1";

type JsonRecord = Record<string, JsonValue | undefined>;
type CanonicalIdentity = {
  record_id: string;
  record_kind: string;
  display_name: string;
  source_id: string;
};
type Guards = {
  family: string;
  kind: string;
  subject_id: string;
  object_id: string;
};
type ActionName =
  | "retract_unsupported"
  | "replace_endpoint"
  | "patch_relation"
  | "resolved_by_identity_campaign"
  | "resolved_by_generator_fix"
  | "replace_with_submissions";
type Seed = {
  terminal_action: ActionName;
  action: JsonRecord;
  rationale: string;
  supported_claims: string[];
  unsupported_claims: string[];
  investigation_finding: string;
};
type SemanticReview = {
  schema_version: number;
  shard_id: string;
  projection: JsonRecord;
  summary: JsonRecord;
  decisions: Array<{
    tuple_index: number;
    decision: string;
    remediation_actions: Array<{
      relation_id: string;
      evidence_ids: string[];
      action_category: string;
      defect: string;
      bounded_remediation: string;
    }>;
  }>;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

function logicalSha256(value: unknown): string {
  return sha256(stableJson(value as JsonValue));
}

function idsSha256(ids: string[]): string {
  return logicalSha256([...ids].sort());
}

function parseJsonl(path: string): unknown[] {
  const content = readFileSync(path, "utf8").trim();
  return content ? content.split("\n").map((line) => JSON.parse(line)) : [];
}

function cleanInput(input: MtaSubmitObservationInput): MtaSubmitObservationInput {
  return JSON.parse(JSON.stringify(normalizeSubmitInput(input))) as MtaSubmitObservationInput;
}

function relationFamily(record: MtaCanonicalRecord): string {
  const value = record.payload.relation_family;
  return typeof value === "string" && value.trim() ? value : "other";
}

function relationKind(record: MtaCanonicalRecord): string {
  const value = record.payload.relation_kind;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${record.record_id} has no relation_kind`);
  return value;
}

function endpoint(record: MtaCanonicalRecord, field: "subject_id" | "object_id"): string {
  const value = record.payload[field];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${record.record_id} has no ${field}`);
  return value;
}

function guards(record: MtaCanonicalRecord): Guards {
  return {
    family: relationFamily(record),
    kind: relationKind(record),
    subject_id: endpoint(record, "subject_id"),
    object_id: endpoint(record, "object_id"),
  };
}

function stableFileSet(paths: string[]): { file_count: number; file_set_sha256: string } {
  const rows = [...paths].sort().map((path) => ({
    path: relative(repoRoot, path),
    file_sha256: fileSha256(path),
  }));
  return { file_count: rows.length, file_set_sha256: logicalSha256(rows) };
}

const reviewRaw = readFileSync(REVIEW_PATH, "utf8");
const review = JSON.parse(reviewRaw) as SemanticReview;
const sourceActions = new Map<string, {
  tuple_index: number;
  action: SemanticReview["decisions"][number]["remediation_actions"][number];
}>();
for (const decision of review.decisions) {
  for (const action of decision.remediation_actions) {
    if (sourceActions.has(action.relation_id)) throw new Error(`Duplicate source remediation action ${action.relation_id}`);
    sourceActions.set(action.relation_id, { tuple_index: decision.tuple_index, action });
  }
}
if (sourceActions.size !== 128) throw new Error(`Expected 128 source actions, found ${sourceActions.size}`);

const canonicalFiles = readdirSync(CANONICAL_DIR)
  .filter((name) => name.endsWith(".jsonl"))
  .sort()
  .map((name) => join(CANONICAL_DIR, name));
const canonicalIdentities = new Map<string, CanonicalIdentity>();
const canonicalLogicalHash = createHash("sha256");
let canonicalRecordCount = 0;
for (const path of canonicalFiles) {
  const content = readFileSync(path, "utf8").trim();
  if (!content) continue;
  for (const line of content.split("\n")) {
    const record = JSON.parse(line) as MtaCanonicalRecord;
    canonicalRecordCount += 1;
    canonicalLogicalHash.update(stableJson(record as unknown as JsonValue));
    canonicalLogicalHash.update("\n");
    canonicalIdentities.set(record.record_id, {
      record_id: record.record_id,
      record_kind: record.record_kind,
      display_name: record.display_name,
      source_id: record.source_id,
    });
  }
}

const relations = new Map<string, MtaCanonicalRecord>();
for (const record of parseJsonl(RELATIONS_PATH) as MtaCanonicalRecord[]) {
  if (sourceActions.has(record.record_id)) relations.set(record.record_id, record);
}
if (relations.size !== sourceActions.size) {
  const missing = [...sourceActions.keys()].filter((id) => !relations.has(id));
  throw new Error(`Canonical relations missing ${missing.join(", ")}`);
}

const sourceBlockFiles = new Set<string>();
const sourceBlocks = new Map<string, Record<string, JsonValue>>();
function sourceBlock(evidenceId: string): Record<string, JsonValue> {
  const separator = evidenceId.indexOf("#");
  if (separator < 1) throw new Error(`Invalid evidence id ${evidenceId}`);
  const sourceId = evidenceId.slice(0, separator);
  const blockId = evidenceId.slice(separator + 1);
  const key = `${sourceId}#${blockId}`;
  const cached = sourceBlocks.get(key);
  if (cached) return cached;
  const path = join(repoRoot, "raw/sources", sourceId, "blocks.jsonl");
  sourceBlockFiles.add(path);
  const content = readFileSync(path, "utf8").trim();
  for (const line of content.split("\n")) {
    const block = JSON.parse(line) as Record<string, JsonValue>;
    if (block.block_id === blockId) {
      sourceBlocks.set(key, block);
      return block;
    }
  }
  throw new Error(`Evidence block ${evidenceId} not found`);
}

function proposalEvidence(evidenceIds: string[], role: string): MtaEvidenceSubmissionRef[] {
  return [...new Set(evidenceIds)].sort().map((evidenceId) => {
    const block = sourceBlock(evidenceId);
    const sourceId = String(block.source_id);
    const blockId = String(block.block_id);
    const textSha = block.raw_text_sha256;
    return {
      source_id: sourceId,
      evidence_id: evidenceId,
      block_id: blockId,
      page_number: typeof block.page_number === "number" ? block.page_number : undefined,
      text_sha256: typeof textSha === "string" ? textSha : undefined,
      text_source: "raw_text",
      role,
    };
  });
}

function observation(
  sourceId: string,
  kind: MtaSubmitObservationInput["observation_kind"],
  localId: string,
  label: string,
  payload: JsonRecord,
  evidenceIds: string[],
  role: string,
): MtaSubmitObservationInput {
  return cleanInput({
    source_id: sourceId,
    observation_kind: kind,
    local_observation_id: localId,
    create_new: true,
    label,
    payload,
    evidence_refs: proposalEvidence(evidenceIds, role),
  });
}

function relationObservation(
  sourceId: string,
  localId: string,
  label: string,
  relationKindValue: string,
  relationFamilyValue: string,
  endpoints: { subject_id?: string; object_id?: string; subject_local_observation_id?: string; object_local_observation_id?: string },
  evidenceIds: string[],
  description: string,
): MtaSubmitObservationInput {
  return observation(sourceId, "relation", localId, label, {
    relation_kind: relationKindValue,
    relation_family: relationFamilyValue,
    ...endpoints,
    description,
    assertion_status: "source_stated",
  }, evidenceIds, "establishes_relationship");
}

const seeds = new Map<string, Seed>();
function addSeed(relationId: string, seed: Seed): void {
  if (!sourceActions.has(relationId)) throw new Error(`Seed names non-suspect relation ${relationId}`);
  if (seeds.has(relationId)) throw new Error(`Duplicate seed ${relationId}`);
  seeds.set(relationId, seed);
}

function replaceEndpointSeed(
  relationId: string,
  field: "subject_id" | "object_id",
  toRecordId: string,
  supported: string,
  unsupported: string,
  rationale: string,
): void {
  addSeed(relationId, {
    terminal_action: "replace_endpoint",
    action: { field, to_record_id: toRecordId },
    rationale,
    supported_claims: [supported],
    unsupported_claims: [unsupported],
    investigation_finding: `The cited authoritative block supports ${supported} Canonical registry inspection resolves the exact replacement as ${toRecordId}.`,
  });
}

function patchSeed(
  relationId: string,
  set: Partial<{ relation_family: string; relation_kind: string; subject_id: string; object_id: string }>,
  supported: string,
  unsupported: string,
  rationale: string,
): void {
  addSeed(relationId, {
    terminal_action: "patch_relation",
    action: { set: set as unknown as JsonValue },
    rationale,
    supported_claims: [supported],
    unsupported_claims: [unsupported],
    investigation_finding: `The exact source context supports ${supported} The replacement tuple is fully specified and every replacement endpoint is an existing canonical record.`,
  });
}

function retractSeed(
  relationId: string,
  replacementRelationIds: string[],
  supported: string,
  unsupported: string,
  rationale: string,
): void {
  addSeed(relationId, {
    terminal_action: "retract_unsupported",
    action: { replacement_relation_ids: [...replacementRelationIds].sort() },
    rationale,
    supported_claims: [supported],
    unsupported_claims: [unsupported],
    investigation_finding: replacementRelationIds.length > 0
      ? `The malformed edge is not repairable without changing its asserted fact. The narrower supported fact is already represented by ${replacementRelationIds.join(", ")}.`
      : "No exact relationship between the current endpoints survives the cited evidence. The source-backed fact remains in the endpoint payload or source record and does not require a replacement edge.",
  });
}

function replacementSeed(
  relationId: string,
  submissions: MtaSubmitObservationInput[],
  supported: string[],
  unsupported: string[],
  rationale: string,
): void {
  addSeed(relationId, {
    terminal_action: "replace_with_submissions",
    action: { retire_relation: true, submissions: submissions as unknown as JsonValue },
    rationale,
    supported_claims: supported,
    unsupported_claims: unsupported,
    investigation_finding: "The current endpoint surrogate cannot preserve the supported physical, contract, report, or event fact. The replacement bundle uses only exact cited blocks, existing canonical ids, and source-local records explicitly named by those blocks.",
  });
}

function identitySeed(
  relationId: string,
  identitySubmissionIds: string[],
  expectedSubjectId: string,
  expectedObjectId: string,
  supported: string,
): void {
  addSeed(relationId, {
    terminal_action: "resolved_by_identity_campaign",
    action: {
      identity_submission_ids: [...identitySubmissionIds].sort(),
      expected_subject_id: expectedSubjectId,
      expected_object_id: expectedObjectId,
    },
    rationale: "The relation predicate and evidence are sound, but a source-local umbrella MTA identity was deterministically collapsed into NYCT. Repair the named identity submissions centrally and let endpoint resolution reproduce the exact edge.",
    supported_claims: [supported],
    unsupported_claims: ["The source does not attribute this MTA-wide action to New York City Transit."],
    investigation_finding: `The original source-local identity submissions name Metropolitan Transportation Authority, and the expected canonical organization is ${expectedSubjectId}; the object remains ${expectedObjectId}.`,
  });
}

function generatorSeed(relationId: string, supported: string): void {
  addSeed(relationId, {
    terminal_action: "resolved_by_generator_fix",
    action: {
      rule_id: "entity-publisher",
      change: "Do not derive published_by from an entity payload.publisher field. Emit publication edges only when the subject is a source or explicit report artifact and the cited block states the publisher role; retract existing entity-publisher outputs before regenerating.",
      expected_relation_disposition: "retracted_without_replacement",
    },
    rationale: "The deterministic entity-publisher rule treated an entity's agency/employer-style publisher field as documentary authorship and merged unrelated provenance into one false publication edge.",
    supported_claims: [supported],
    unsupported_claims: ["No cited block supports the current entity-to-entity published_by assertion."],
    investigation_finding: "The relation payload is marked derived_relation=true with derivation_rule=entity-publisher; its accumulated submissions/evidence span unrelated documents, proving generator-level rather than one-record corruption.",
  });
}

// Physical location and route-scope repairs.
replaceEndpointSeed(
  "relation_ada-broadway-junction-nyct",
  "object_id",
  "entity_broadway-junction-subway-station-192226",
  "the ADA contract physically applies to the Broadway Junction subway complex.",
  "An operating-agency surrogate is not the location affected by the contract.",
  "Retain the project and predicate while replacing the NYCT surrogate with the existing physical Broadway Junction station record.",
);

const escalatorStationEvidence = ["meeting_doc_129101#p099_c0009"];
const escalatorStations = [
  ["entity_escalator_51_street_station_meeting_doc_129101", "51st Street Station"],
  ["entity_escalator_high_street_station_meeting_doc_129101", "High Street Station"],
  ["entity_escalator_franklin_avenue_station_meeting_doc_129101", "Franklin Avenue Station"],
  ["entity_escalator_park_place_station_meeting_doc_129101", "Park Place Station"],
  ["entity_escalator_21_street_queensbridge_station_meeting_doc_129101", "21st Street–Queensbridge Station"],
  ["entity_escalator_lexington_avenue_63_street_station_meeting_doc_129101", "Lexington Avenue/63rd Street Station"],
] as const;
replacementSeed(
  "relation_escalator-6-stations-nyct",
  [
    ...escalatorStations.map(([localId, name]) => observation(
      "meeting_doc_129101", "entity", localId, name,
      { entity_name: name, entity_type: "transit_station" },
      escalatorStationEvidence, "identifies_facility",
    )),
    ...escalatorStations.map(([localId, name]) => relationObservation(
      "meeting_doc_129101",
      `relation_escalator_replacement_applies_to_${localId.replace(/^entity_/, "")}`,
      `Escalator replacement applies to ${name}`,
      "applies_to_facility", "location_scope",
      { subject_id: "project_escalator-replacement-6-stations", object_local_observation_id: localId },
      escalatorStationEvidence,
      `The contract replaces escalators at ${name}.`,
    )),
  ],
  ["The contract replaces 21 escalators at six individually named subway stations."],
  ["The evidence does not support treating NYCT itself as the physical facility affected."],
  "Retire the agency-surrogate edge and materialize the six exact station facilities and six applies_to_facility relations named in the contract block.",
);

replacementSeed(
  "relation_lirr-south-12th-st-elimination",
  [
    observation(
      "meeting_doc_91576", "entity", "entity_south_12th_street_grade_crossing_meeting_doc_91576",
      "South 12th Street grade crossing",
      { entity_name: "South 12th Street grade crossing", entity_type: "rail_grade_crossing" },
      ["meeting_doc_91576#p030_c0011"], "identifies_facility",
    ),
    relationObservation(
      "meeting_doc_91576", "relation_south_12th_street_project_applies_to_grade_crossing",
      "South 12th Street project applies to grade crossing", "applies_to_facility", "location_scope",
      { subject_id: "project_south-12th-st-grade-crossing-elimination", object_local_observation_id: "entity_south_12th_street_grade_crossing_meeting_doc_91576" },
      ["meeting_doc_91576#p030_c0011"],
      "The project permanently closes and redirects traffic at the South 12th Street grade crossing.",
    ),
  ],
  ["Vehicular traffic at the South 12th Street grade crossing will be permanently closed and redirected."],
  ["The block does not establish that the LIRR organization is the physical object affected."],
  "Replace the LIRR agency surrogate with a source-local physical grade-crossing record and exact facility relation.",
);

const railroadEscalatorEvidence = ["meeting_doc_26926#p032_c0009"];
const whitePlainsEscalatorEntity = observation(
  "meeting_doc_26926", "entity", "entity_white_plains_station_escalators_meeting_doc_26926",
  "White Plains Station", { entity_name: "White Plains Station", entity_type: "rail_station" },
  railroadEscalatorEvidence, "identifies_facility",
);
replacementSeed(
  "relation_mnr-lirr-escalator-rfp",
  [
    whitePlainsEscalatorEntity,
    relationObservation(
      "meeting_doc_26926", "relation_mnr_lirr_escalator_services_apply_to_grand_central_terminal",
      "Escalator services apply to Grand Central Terminal", "applies_to_facility", "location_scope",
      { subject_id: "project_mnr-lirr-escalator-maintenance", object_id: "entity_grand-central-terminal" },
      railroadEscalatorEvidence, "The maintenance scope includes 15 escalators at Grand Central Terminal.",
    ),
    relationObservation(
      "meeting_doc_26926", "relation_mnr_lirr_escalator_services_apply_to_white_plains_station",
      "Escalator services apply to White Plains Station", "applies_to_facility", "location_scope",
      { subject_id: "project_mnr-lirr-escalator-maintenance", object_local_observation_id: "entity_white_plains_station_escalators_meeting_doc_26926" },
      railroadEscalatorEvidence, "The maintenance scope includes two escalators at White Plains Station.",
    ),
    relationObservation(
      "meeting_doc_26926", "relation_mnr_lirr_escalator_services_apply_to_penn_station",
      "Escalator services apply to Penn Station", "applies_to_facility", "location_scope",
      { subject_id: "project_mnr-lirr-escalator-maintenance", object_id: "entity_penn-station-127546" },
      railroadEscalatorEvidence, "The maintenance scope includes 16 LIRR escalators at Penn Station.",
    ),
  ],
  ["The procurement covers named escalators at Grand Central Terminal, White Plains Station, and Penn Station, plus other LIRR stations not individually named."],
  ["MNR is a procuring railroad, not a physical facility affected by this location-scope predicate; unnamed commuter stations cannot be linked individually."],
  "Retire the agency-surrogate edge and retain only the three facilities whose identities are exact in the cited block.",
);

retractSeed(
  "relation_webster-bridge-lirr",
  ["relation_serves-route-project-webster-ave-bridge-replacement-route-lirr-port-washington-branch-2023_766da80009"],
  "the Webster Avenue Bridge spans and protects operations on the LIRR Port Washington Branch.",
  "The LIRR agency is not the physical location target of affects/location_scope.",
  "The exact route-scope fact already exists on the canonical Port Washington Branch relation, so the agency-surrogate duplicate must be retired.",
);

const bridgeFacilityEvidenceA = ["meeting_doc_26821#p063_c0003"];
const bridgeFacilityEvidenceB = ["meeting_doc_26821#p062_c0008"];
replacementSeed(
  "relation_meeting-doc-26821-bw39-rk60-at-bxw-rfk",
  [
    relationObservation(
      "meeting_doc_26821", "relation_bw39_rk60_applies_to_bronx_whitestone_bridge",
      "BW-39/RK-60 applies to Bronx-Whitestone Bridge", "applies_to_facility", "location_scope",
      { subject_id: "project_meeting-doc-26821-bw-39-rk-60-monitoring-detection", object_id: "entity_bronx-whitestone-bridge" },
      bridgeFacilityEvidenceA, "The monitoring and detection systems project is at the Bronx-Whitestone Bridge.",
    ),
    relationObservation(
      "meeting_doc_26821", "relation_bw39_rk60_applies_to_rfk_bridge",
      "BW-39/RK-60 applies to RFK Bridge", "applies_to_facility", "location_scope",
      { subject_id: "project_meeting-doc-26821-bw-39-rk-60-monitoring-detection", object_id: "entity_rfk-bridge" },
      bridgeFacilityEvidenceA, "The monitoring and detection systems project is at the Robert F. Kennedy Bridge.",
    ),
  ],
  ["The BW-39/RK-60 project applies to both the Bronx-Whitestone and Robert F. Kennedy bridges."],
  ["MTA Bridges and Tunnels is the operator, not either physical facility."],
  "One agency surrogate cannot encode the two exact facilities; replace it with two facility edges.",
);
replacementSeed(
  "relation_meeting-doc-26821-hc30-qm91-at-hugh-carey-qmt",
  [
    relationObservation(
      "meeting_doc_26821", "relation_hc30_qm91_applies_to_hugh_l_carey_tunnel",
      "HC-30/QM-91 applies to Hugh L. Carey Tunnel", "applies_to_facility", "location_scope",
      { subject_id: "project_meeting-doc-26821-hc-30-qm-91-smoke-detection", object_id: "entity_hugh-l-carey-tunnel" },
      bridgeFacilityEvidenceA, "The smoke detection/alarm project is in the Hugh L. Carey Tunnel.",
    ),
    relationObservation(
      "meeting_doc_26821", "relation_hc30_qm91_applies_to_queens_midtown_tunnel",
      "HC-30/QM-91 applies to Queens Midtown Tunnel", "applies_to_facility", "location_scope",
      { subject_id: "project_meeting-doc-26821-hc-30-qm-91-smoke-detection", object_id: "entity_queens-midtown-tunnel" },
      bridgeFacilityEvidenceA, "The smoke detection/alarm project is in the Queens Midtown Tunnel.",
    ),
  ],
  ["The HC-30/QM-91 project applies to both the Hugh L. Carey and Queens Midtown tunnels."],
  ["MTA Bridges and Tunnels is the operator, not either physical tunnel."],
  "One agency surrogate cannot encode the two exact tunnels; replace it with two facility edges.",
);
for (const [relationId, targetId, supported] of [
  ["relation_meeting-doc-26821-hh-89-at-henry-hudson", "entity_henry-hudson-bridge", "the HH-89 skewback retrofit applies to the Henry Hudson Bridge."],
  ["relation_meeting-doc-26821-qm-81-at-qmt", "entity_queens-midtown-tunnel", "the QM-81 systems rehabilitation applies to the Queens Midtown Tunnel."],
  ["relation_meeting-doc-26821-rk-23c-at-rfk", "entity_rfk-bridge", "the RK-23C ramp project applies to the RFK Bridge."],
  ["relation_meeting-doc-26821-rk-75-at-rfk", "entity_rfk-bridge", "the RK-75 deck rehabilitation applies to the RFK Bridge."],
  ["relation_meeting-doc-26821-vn-x1-at-verrazzano", "entity_verrazzano-narrows-bridge", "the VN-X1 tolling project applies to the Verrazzano-Narrows Bridge."],
] as const) {
  replaceEndpointSeed(
    relationId, "object_id", targetId, supported,
    "MTA Bridges and Tunnels is an operating agency, not the named physical facility.",
    "Keep the exact project and predicate and replace only the agency surrogate with the named canonical bridge or tunnel.",
  );
}

// Governance, contract, and award repairs.
const monseyLicenseEvidence = [
  "meeting_doc_167331#p001_c0003",
  "meeting_doc_167331#p001_c0005",
  "meeting_doc_167331#p001_c0007",
];
function monseyLicenseProject(): MtaSubmitObservationInput {
  return observation(
    "meeting_doc_167331", "project", "project_monsey_developers_mnr_license_agreement_2025",
    "MNR–Monsey Developers Commerce Street license agreement",
    {
      project_name: "MNR–Monsey Developers Commerce Street license agreement",
      project_type: "license_agreement",
      status: "authorization_requested",
      location: "Commerce Street between South Myrtle Avenue and West Street, Spring Valley, New York",
    },
    monseyLicenseEvidence, "identifies_agreement",
  );
}
for (const [relationId, eventId, localSuffix, supported] of [
  ["relation_meeting-doc-167331-board-approval", "event_meeting-doc-167331-board-meeting", "board", "the license agreement was an approval item for the March 26, 2025 Board meeting."],
  ["relation_meeting-doc-167331-finance-committee-approval", "event_meeting-doc-167331-finance-committee", "finance_committee", "the license agreement was an approval item for the March 24, 2025 Finance Committee meeting."],
] as const) {
  replacementSeed(
    relationId,
    [
      monseyLicenseProject(),
      relationObservation(
        "meeting_doc_167331", `relation_monsey_license_has_${localSuffix}_approval_event`,
        `Monsey license has ${localSuffix.replaceAll("_", " ")} approval event`,
        "has_timeline_event", "timeline_context",
        { subject_local_observation_id: "project_monsey_developers_mnr_license_agreement_2025", object_id: eventId },
        monseyLicenseEvidence, supported,
      ),
    ],
    [supported],
    ["The meeting event did not approve the MNR organization itself."],
    "Materialize the named license agreement and relate it to the exact approval event rather than treating an agency as the approved object.",
  );
}

retractSeed(
  "relation_meeting-doc-179556-mta-board-approves",
  ["relation_meeting-doc-179556-board-approval-timeline"],
  "the MTA Board adopted the New Haven Line fare-increase resolution.",
  "The umbrella MTA organization is not the approving body endpoint stored by approved_by.",
  "The exact Board-adoption event is already linked to the New Haven Line, so retire the organization-surrogate duplicate.",
);

const pmisEvidence = ["meeting_doc_179671#p001_c0007"];
replacementSeed(
  "relation_rel-meeting-doc-179671-enstoa-pmis-contract",
  [
    observation(
      "meeting_doc_179671", "project", "project_enstoa_pmis_contract_600000000036586",
      "PMIS implementation and integration contract 600000000036586",
      {
        project_name: "PMIS implementation and integration contract 600000000036586",
        project_type: "procurement_contract",
        status: "awarded",
        contract_number: "600000000036586",
      },
      pmisEvidence, "identifies_contract",
    ),
    relationObservation(
      "meeting_doc_179671", "relation_pmis_contract_600000000036586_awarded_to_enstoa",
      "PMIS contract awarded to Enstoa", "awarded_to", "funding_award",
      { subject_local_observation_id: "project_enstoa_pmis_contract_600000000036586", object_id: "entity_meeting-doc-179671-enstoa" },
      pmisEvidence, "Contract 600000000036586 was awarded to Enstoa, Inc.",
    ),
    relationObservation(
      "meeting_doc_179671", "relation_pmis_contract_600000000036586_has_total_amount",
      "PMIS contract has total amount", "has_metric", "metric_context",
      { subject_local_observation_id: "project_enstoa_pmis_contract_600000000036586", object_id: "metric_meeting-doc-179671-pmis-total" },
      pmisEvidence, "The PMIS contract total is $7,257,988.",
    ),
  ],
  ["Contract 600000000036586 was awarded to Enstoa for PMIS implementation/integration at a stated total of $7,257,988."],
  ["A dollar metric is not the contract object awarded by the vendor."],
  "Replace the vendor-to-metric edge with an explicit contract project, awardee edge, and amount edge.",
);

patchSeed(
  "relation_meppi-m7-propulsion-contract-award",
  { subject_id: "project_m7-propulsion-system-upgrade" },
  "the M7 Propulsion System Equipment Upgrade purchase agreement was awarded to MEPPI.",
  "A contract-term claim is not the contract awarded to the vendor.",
  "Retarget the award subject to the existing canonical M7 propulsion upgrade procurement project.",
);
patchSeed(
  "relation_meppi-replacement-parts-contract-award",
  { subject_id: "project_oem-replacement-parts-meppi-meeting-doc-133401" },
  "the five-year OEM replacement-parts contract was awarded to MEPPI.",
  "A contract-term claim is not the contract awarded to the vendor.",
  "Retarget the award subject to the existing canonical OEM replacement-parts procurement project.",
);

const sasEvidence = ["meeting_doc_146956#p014_c0004"];
replacementSeed(
  "relation_meeting-doc-146956-sas2-mnr-125",
  [
    observation(
      "meeting_doc_146956", "entity", "entity_lexington_avenue_subway_line_meeting_doc_146956",
      "Lexington Avenue Subway Line", { entity_name: "Lexington Avenue Subway Line", entity_type: "subway_line" },
      sasEvidence, "identifies_connection",
    ),
    relationObservation(
      "meeting_doc_146956", "relation_sas2_connects_to_lexington_avenue_line",
      "SAS2 connects to Lexington Avenue Line", "connects_to", "dependency_or_reference",
      { subject_id: "project_annual-2021-second-ave-subway-phase2", object_local_observation_id: "entity_lexington_avenue_subway_line_meeting_doc_146956" },
      sasEvidence, "SAS2 will connect to the Lexington Avenue Line (4, 5, 6).",
    ),
    relationObservation(
      "meeting_doc_146956", "relation_sas2_connects_to_metro_north_at_125_street",
      "SAS2 connects to Metro-North at 125 Street", "connects_to", "dependency_or_reference",
      { subject_id: "project_annual-2021-second-ave-subway-phase2", object_id: "entity_meeting-doc-124881-mnr" },
      sasEvidence, "SAS2 will connect to Metro-North Railroad at 125 Street.",
    ),
  ],
  ["SAS2 will connect to the Lexington Avenue Line and Metro-North Railroad at 125 Street."],
  ["The cited title block does not support a connection to MTA Construction & Development."],
  "Retire the C&D surrogate edge and submit the two connections from the exact substantive source block.",
);

replacementSeed(
  "relation_b82-connects-subway-b82-cb18-jun2017",
  [
    relationObservation(
      "brt_south_brooklyn_b82_cb18_jun2017", "relation_b82_local_related_to_b44_sbs_cb18_jun2017",
      "B82 Local connects with B44 SBS", "related_route", "route_scope",
      { subject_id: "route_b82-local", object_id: "route_b44-sbs" },
      ["brt_south_brooklyn_b82_cb18_jun2017#p003_c0003"], "The B82 corridor connects with B44 Nostrand SBS.",
    ),
    relationObservation(
      "brt_south_brooklyn_b82_cb18_jun2017", "relation_b82_local_related_to_b46_sbs_cb18_jun2017",
      "B82 Local connects with B46 SBS", "related_route", "route_scope",
      { subject_id: "route_b82-local", object_id: "route_utica-ave-sbs" },
      ["brt_south_brooklyn_b82_cb18_jun2017#p003_c0003"], "The B82 corridor connects with B46 Utica SBS.",
    ),
  ],
  ["The B82 route connects to B44 Nostrand SBS and B46 Utica SBS among the named connecting services."],
  ["The block does not state that B82 Local connects to the B82 SBS record itself."],
  "Replace the self-family route surrogate with the two specifically named SBS route connections.",
);
patchSeed(
  "relation_bx6-connects-to-subway-bus",
  { relation_kind: "related_route", relation_family: "route_scope", object_id: "route_webster-ave-sbs" },
  "Bx6 connects with Bx41 SBS among its named bus connections.",
  "The cited block does not make Bx6 Local connect to the Bx6 SBS record itself.",
  "Retarget the object to the exact Bx41/Webster Avenue SBS route and use the reviewed related_route predicate.",
);

patchSeed(
  "relation_meeting-doc-138616-rail-flaw-sperry",
  {
    relation_kind: "awarded_to",
    relation_family: "funding_award",
    subject_id: "project_rail-flaw-testing-joint-bar-inspection-138251",
    object_id: "entity_sperry-rail",
  },
  "the five-year rail-flaw testing and joint-bar inspection contract was awarded to Sperry Rail for LIRR/MNR.",
  "A dollar metric cannot contract with LIRR, and LIRR is not the named vendor.",
  "Use the existing canonical contract project and Sperry Rail entity while retaining the exact procurement block.",
);

// Funding, participation, and report-role repairs.
replaceEndpointSeed(
  "relation_bt-distributes-to-mta", "object_id", "entity_mta-entity-update-2025",
  "MTA Bridges and Tunnels distributes surplus income to the Metropolitan Transportation Authority.",
  "The Bridges and Tunnels operating entity is not the umbrella MTA recipient and cannot be its own recipient.",
  "Replace the collapsed self-loop with the canonical umbrella MTA organization.",
);

const fairFaresEvidence = ["meeting_doc_194166#p002_c0009"];
replacementSeed(
  "relation_rel-meeting-doc-194166-fair-fares-fine-waiver",
  [
    observation(
      "meeting_doc_194166", "claim", "claim_fair_fares_enrollment_fine_waiver_meeting_doc_194166",
      "Fair Fares enrollment fine-waiver policy",
      {
        claim_text: "A Transit Adjudication Bureau pilot allows eligible riders to have a first summons waived upon enrollment in Fair Fares.",
        claim_type: "policy_eligibility",
      }, fairFaresEvidence, "states_policy",
    ),
    relationObservation(
      "meeting_doc_194166", "relation_fair_fares_has_enrollment_fine_waiver_claim",
      "Fair Fares has enrollment fine-waiver claim", "has_claim", "claim_context",
      { subject_id: "entity_meeting-doc-135736-fair-fares", object_local_observation_id: "claim_fair_fares_enrollment_fine_waiver_meeting_doc_194166" },
      fairFaresEvidence, "The waiver is conditioned on eligible enrollment in Fair Fares.",
    ),
    relationObservation(
      "meeting_doc_194166", "relation_tab_has_fair_fares_fine_waiver_claim",
      "Transit Adjudication Bureau has Fair Fares fine-waiver claim", "has_claim", "claim_context",
      { subject_id: "entity_transit-adjudication-bureau", object_local_observation_id: "claim_fair_fares_enrollment_fine_waiver_meeting_doc_194166" },
      fairFaresEvidence, "The Transit Adjudication Bureau administers the described pilot waiver.",
    ),
  ],
  ["Eligible first-time summons recipients may receive a waiver by enrolling in Fair Fares under the described pilot."],
  ["Fair Fares is not itself eligible_for the Transit Adjudication Bureau."],
  "Represent the conditional policy as a claim linked to both named programs rather than as an entity-eligibility edge.",
);

replaceEndpointSeed(
  "relation_jaibala-patel-cfo-of-mta", "object_id", "entity_mta-entity-update-2025",
  "Jaibala Patel is identified as the MTA Deputy Chief Financial Officer.",
  "The title is MTA-wide and is not an employment assertion specific to NYCT.",
  "Retarget the employee_of edge to the canonical umbrella MTA organization.",
);
patchSeed(
  "relation_bellerose-ladder-enables-elmont-service",
  { relation_kind: "has_claim", relation_family: "claim_context", object_id: "claim_bellerose-ladder-enables-elmont-fulltime" },
  "the Bellerose ladder-track project is asserted to enable full-time Elmont service.",
  "The LIRR organization is not the enabled service outcome object.",
  "Use the existing source-backed claim that preserves the qualified service outcome.",
);
retractSeed(
  "relation_deloitte-external-auditor", ["relation_190056-deloitte-auditor-mta"],
  "the Audit Committee reviewed and recommended Deloitte's reappointment, and a separate exact auditor relation already represents the supported engagement.",
  "These cited blocks do not prove a second distinct MTA-to-Deloitte engagement edge.",
  "Retire the duplicate broad edge without losing the independently evidenced auditor relationship.",
);
replaceEndpointSeed(
  "relation_meeting-doc-111756-sirtoa-nyc-funding", "object_id", "entity_201203-brt-34th-cac6-city-of-ny",
  "the City of New York provides the cited funding to Staten Island Railway.",
  "The railway cannot be both funding recipient and funding source in this cited table.",
  "Replace the merged self-loop object with the canonical City of New York entity.",
);

const actionCartingEvidence = [
  "meeting_doc_135381#p006_c0003",
  "meeting_doc_135381#p006_c0006",
  "meeting_doc_135381#p007_c0006",
];
replacementSeed(
  "relation_meeting-doc-135381-funding-source",
  [
    observation(
      "meeting_doc_135381", "project", "project_action_carting_refuse_removal_extension_600000000022916",
      "Action Carting refuse-removal contract extension 600000000022916",
      {
        project_name: "Action Carting refuse-removal and recycling contract extension 600000000022916",
        project_type: "procurement_contract",
        status: "proposed_for_board_approval",
        contract_number: "600000000022916",
        date_start: "2024-05-01",
        date_end: "2026-04-30",
      }, actionCartingEvidence, "identifies_contract",
    ),
    observation(
      "meeting_doc_135381", "claim", "claim_action_carting_extension_funded_by_nyct_operating_budget",
      "Action Carting extension funded by NYCT operating budget",
      { claim_text: "The Action Carting contract extension is funded by the MTA New York City Transit operating budget.", claim_type: "funding_source" },
      ["meeting_doc_135381#p007_c0006"], "states_funding_source",
    ),
    relationObservation(
      "meeting_doc_135381", "relation_action_carting_extension_awarded_to_action_carting",
      "Action Carting extension awarded to Action Carting", "awarded_to", "funding_award",
      { subject_local_observation_id: "project_action_carting_refuse_removal_extension_600000000022916", object_id: "entity_action-carting-environmental-services" },
      ["meeting_doc_135381#p006_c0003", "meeting_doc_135381#p006_c0006"],
      "The existing refuse-removal contract was awarded to Action Carting and the item seeks a two-year extension.",
    ),
    relationObservation(
      "meeting_doc_135381", "relation_action_carting_extension_has_funding_claim",
      "Action Carting extension has operating-budget funding claim", "has_claim", "claim_context",
      { subject_local_observation_id: "project_action_carting_refuse_removal_extension_600000000022916", object_local_observation_id: "claim_action_carting_extension_funded_by_nyct_operating_budget" },
      ["meeting_doc_135381#p007_c0006"], "The extension is funded by the MTA NYC Transit operating budget.",
    ),
  ],
  ["The proposed two-year Action Carting extension is for refuse-removal services and is funded by the MTA NYC Transit operating budget."],
  ["A committee-members aggregate is not a funding source, and Action Carting is not the funder."],
  "Use an explicit contract, vendor edge, and qualified funding claim instead of a vendor-to-committee funding edge.",
);

patchSeed(
  "relation_crz-tolling-funds-capital-projects",
  { subject_id: "project_annual-2021-cbdtp", object_id: "project_2020-2024-capital-program-meeting-doc-152166" },
  "the Central Business District Tolling Program generates revenue for MTA capital investments.",
  "A program-commencement event does not fund a Board-meeting event.",
  "Retarget both endpoints from event surrogates to the canonical tolling program and capital program.",
);
replaceEndpointSeed(
  "relation_meeting-doc-192281-crz-funds-mta-capital", "object_id", "project_2020-2024-capital-program-meeting-doc-152166",
  "the Central Business District Tolling Program funds the MTA capital program described by the resolution.",
  "The umbrella MTA organization is not the capital-program object of the funding claim.",
  "Retarget the object to the canonical 2020–2024 Capital Program.",
);

const psaLicenseEvidence = ["meeting_doc_133361#p005_c0008"];
replacementSeed(
  "relation_meeting-doc-133361-mta-psa-licenses",
  [
    relationObservation(
      "meeting_doc_133361", "relation_mta_has_license_with_1776_eastchester_condominium",
      "MTA has license with 1776 Eastchester Condominium", "has_contract_with", "funding_award",
      { subject_id: "entity_mta-entity-update-2025", object_id: "entity_board-of-managers-1776-eastchester-condo" },
      psaLicenseEvidence, "The MTA has a license with the Board of Managers of 1776 Eastchester Condominium for preliminary Penn Station Access work.",
    ),
    relationObservation(
      "meeting_doc_133361", "relation_mta_has_license_with_rlf_ii_bassett",
      "MTA has license with RLF II Bassett", "has_contract_with", "funding_award",
      { subject_id: "entity_mta-entity-update-2025", object_id: "entity_rlf-ii-bassett-llc" },
      psaLicenseEvidence, "The MTA has a license with RLF II Bassett, LLC for preliminary Penn Station Access work.",
    ),
  ],
  ["The block identifies two MTA licenses with two specifically named counterparties for preliminary Penn Station Access work."],
  ["Penn Station Access is the project context, not the counterparty to an MTA agreement."],
  "Replace the project-surrogate agreement with the two exact counterparties named in the source.",
);
patchSeed(
  "relation_rel-corys-simulator-east-side-access", { object_id: "project_annual-2021-east-side-access", relation_kind: "funded_by" },
  "the Corys simulator procurement is funded from the East Side Access project budget.",
  "The Moynihan Train Hall opening event is unrelated to this stated funding source.",
  "Retarget the funding-source object to the canonical East Side Access project.",
);

for (const relationId of [
  "relation_iec-monitors-bus-contracts",
  "relation_iec-reviews-lirr-m9",
  "relation_iec-reviews-r211",
  "relation_iec-reviews-sc42",
]) {
  patchSeed(
    relationId, { relation_kind: "monitors", relation_family: "agency_role" },
    "the Independent Engineering Consultant monitors or reviews the named capital procurement/project.",
    "The project does not have the consultant as an intrinsic component; this is an oversight role.",
    "Use the directional monitors predicate from consultant to project.",
  );
}
for (const relationId of [
  "relation_lirr-committee-east-hampton-lease",
  "relation_mnr-committee-markys-lease",
]) {
  patchSeed(
    relationId, { relation_kind: "has_claim", relation_family: "claim_context" },
    "the committee event carries the cited lease-award claim.",
    "A claim record is not a participant in an event.",
    "Preserve event-to-claim context with the reviewed has_claim predicate.",
  );
}
patchSeed(
  "relation_document-informs-li-committee", { relation_kind: "prepared_for", relation_family: "publication_role" },
  "the agenda/source document was prepared for the Long Island Committee.",
  "A source document is not a participant that informs an organization as an event actor.",
  "Represent the document-audience role as prepared_for.",
);
patchSeed(
  "relation_recurring-committee", { relation_kind: "prepared_for", relation_family: "publication_role" },
  "the recurring Metro-North Committee agenda/source was prepared for that committee.",
  "The source artifact is not an event participant.",
  "Represent the document-audience role as prepared_for.",
);
patchSeed(
  "relation_steven-weiss-financial-liaison-mnr_3", { relation_kind: "prepared_by", relation_family: "publication_role" },
  "the source header identifies Steven Weiss as Financial Liaison for the Metro-North Committee material.",
  "A person is not a participant in a source artifact.",
  "Use a qualified document-preparation role for the named liaison.",
);

const mrtEvidence = ["meeting_doc_30001#p047_c0007", "meeting_doc_30001#p048_c0007"];
replacementSeed(
  "relation_mrt-payments-treasury",
  [
    observation(
      "meeting_doc_30001", "event", "event_mrt2_escalator_payment_authorization_fy2020",
      "MRT-2 escalator payment authorization",
      { event_name: "MRT-2 escalator payment authorization", event_kind: "board_authorization", event_type: "board_authorization", date_precision: "fiscal_year", fiscal_year: "2020" },
      mrtEvidence, "identifies_authorization",
    ),
    relationObservation(
      "meeting_doc_30001", "relation_mrt2_authorization_has_escalator_payment_total",
      "MRT-2 authorization has escalator payment total", "has_metric", "metric_context",
      { subject_local_observation_id: "event_mrt2_escalator_payment_authorization_fy2020", object_id: "metric_mrt-escalator-total-fy2020" },
      mrtEvidence, "The requested Board authorization covers escalator payments totaling $8,334,346.53 to Dutchess, Orange and Rockland counties.",
    ),
  ],
  ["The item seeks authorization for $8,334,346.53 in MRT-2 escalator payments to three named counties."],
  ["The metric total is not a partner of MTA treasury or the umbrella MTA organization."],
  "Materialize the authorization event and link it to the existing amount metric.",
);

const brucknerEvidence = [
  "meeting_doc_208146#p013_c0003",
  "meeting_doc_208146#p013_c0007",
  "meeting_doc_208146#p013_c0009",
  "meeting_doc_208146#p013_c0012",
];
replacementSeed(
  "relation_psa-bruckner-blvd-property",
  [relationObservation(
    "meeting_doc_208146", "relation_penn_station_access_uses_bruckner_boulevard_property_segment",
    "Penn Station Access uses Bruckner Boulevard property segment", "uses_corridor", "corridor_scope",
    { subject_id: "project_annual-2021-penn-station-access", object_id: "corridor_bruckner-blvd-psa-may2026" },
    brucknerEvidence,
    "Penn Station Access requires an 8,544± square-foot Bruckner Boulevard right-of-way parcel between Southern Boulevard and East 144th Street for an electric-power substation.",
  )],
  ["Penn Station Access uses a specifically bounded Bruckner Boulevard right-of-way parcel for an electric-power substation."],
  ["A physical corridor does not perform a real-estate action on a project."],
  "Reverse the surrogate tuple and retain the exact bounded physical corridor as project scope.",
);

const coneyEvidence = ["meeting_doc_104701#p071_c0003", "meeting_doc_104701#p071_c0006"];
replacementSeed(
  "relation_coney-island-contract-modification",
  [
    observation(
      "meeting_doc_104701", "claim", "claim_coney_island_plc_signal_cable_modification",
      "Coney Island Yard PLC signal-cable modification",
      {
        claim_text: "The proposed Coney Island Yard flood-mitigation contract modification replaces the functionality of 11 damaged signal cables using the new PLC system for $1,309,000 and adds 104 excusable-delay days.",
        claim_type: "contract_modification",
      }, coneyEvidence, "states_modification",
    ),
    relationObservation(
      "meeting_doc_104701", "relation_coney_island_flood_mitigation_has_plc_signal_cable_claim",
      "Coney Island flood mitigation has PLC signal-cable modification claim", "has_claim", "claim_context",
      { subject_id: "project_coney-island-yard-flood-mitigation", object_local_observation_id: "claim_coney_island_plc_signal_cable_modification" },
      coneyEvidence, "The contract modification adds PLC-based replacement functionality for 11 damaged signal cables.",
    ),
  ],
  ["The proposed flood-mitigation contract modification replaces functionality for 11 damaged signal cables using a PLC system and extends completion by 104 days."],
  ["A source-gap record is not a related contract and cannot be the object of has_related_contract."],
  "Replace the gap surrogate with an exact qualified contract-modification claim.",
);
retractSeed(
  "relation_meeting-doc-135731-safety-subtheme", [],
  "the source separately describes a safety-and-respect theme and a 72nd Street/Second Avenue exit item.",
  "The cited blocks do not state that the exit item is a subtheme of the safety-and-respect claim.",
  "Retire the invented claim-to-claim hierarchy; both source-backed claims remain independently canonical.",
);

for (const relationId of [
  "relation_lirr-fare-proposals",
  "relation_metronorth-fare-proposals",
  "relation_nyct-fare-proposals",
]) {
  patchSeed(
    relationId, { relation_kind: "has_metric", relation_family: "metric_context" },
    "the named operating agency has the cited fare-proposal metric.",
    "A numeric fare metric is not an intervention implemented by the agency.",
    "Preserve the agency-to-metric association with has_metric.",
  );
}
for (const relationId of ["relation_lirr-implements-item1", "relation_mnr-implements-item1"]) {
  replaceEndpointSeed(
    relationId, "object_id", "project_m7-propulsion-system-upgrade",
    "the named railroad implements the M7 propulsion-system upgrade procurement item.",
    "The procurement value metric is not the intervention implemented by the railroad.",
    "Retarget the implementation edge to the existing canonical M7 propulsion upgrade project.",
  );
}
for (const [relationId, agencyId, agencyName] of [
  ["relation_lirr-implements-item2", "entity_annual-report-2021-lirr", "LIRR"],
  ["relation_mnr-implements-item2", "entity_meeting-doc-124881-mnr", "Metro-North"],
  ["relation_nyct-implements-item2", "entity_mta-nyct", "NYCT"],
] as const) {
  patchSeed(
    relationId,
    { subject_id: "project_oem-replacement-parts-meppi-meeting-doc-133401", object_id: agencyId, relation_kind: "procured_for", relation_family: "agency_role" },
    `the OEM replacement-parts procurement is for ${agencyName}.`,
    "A dollar-value metric is not an intervention implemented by an agency.",
    "Use the canonical procurement project as subject and the named operating agency as the procured_for object.",
  );
}
for (const relationId of [
  "relation_batch024-metro-north-implements-blue-lighting-pilot",
  "relation_batch024-nyct-implements-blue-lighting-pilot",
]) {
  replaceEndpointSeed(
    relationId, "object_id", "project_meeting-doc-108036-blue-lighting",
    "the named operating agency participates in the blue-lighting pilot project described in the item.",
    "The LIRR-specific treatment record is not the shared cross-agency project implemented by each agency.",
    "Retarget the agency role to the existing cross-agency blue-lighting pilot project.",
  );
}

patchSeed(
  "relation_committee-informed-of-projects",
  { subject_id: "source_meeting-doc-201576", object_id: "entity_long-island-committee", relation_kind: "prepared_for", relation_family: "publication_role" },
  "the meeting document provides project material for the Long Island Committee.",
  "The committee is not an actor informing one arbitrarily selected project.",
  "Represent the document audience exactly as source prepared_for committee.",
);
for (const relationId of [
  "relation_lirr-agency-subject-to-lease-country-road",
  "relation_lirr-agency-subject-to-lease-daso",
  "relation_lirr-agency-subject-to-lease-marsah",
]) {
  patchSeed(
    relationId, { relation_kind: "lessor_to", relation_family: "funding_award" },
    "the named private entity is the lessor/counterparty to LIRR under the cited lease item.",
    "The private entity is not an agency for LIRR.",
    "Preserve the existing directional endpoints and use the exact lessor role.",
  );
}
patchSeed(
  "relation_mnr-agency-subject-to-tmha-disposition", { relation_kind: "recipient_of", relation_family: "funding_award" },
  "Tarrytown Municipal Housing Authority is the recipient of the Metro-North property disposition described in the item.",
  "TMHA is not an agency for Metro-North.",
  "Use the supported recipient/counterparty role while preserving the exact entities.",
);
retractSeed(
  "relation_mta-agency-for-transit-museum-lease", ["relation_meeting-doc-190031-real-estate-bush-terminal"],
  "the cited real-estate item concerns an MTA Transit Museum archival lease, already represented by an exact real-estate relation.",
  "The umbrella MTA organization cannot be an agency for itself.",
  "Retire the collapsed self-loop and retain the existing exact museum/real-estate relation.",
);
retractSeed(
  "relation_meeting-doc-192191-jts-mtacd", ["relation_jamie-torres-springer-cd"],
  "Jamie Torres-Springer is identified as President of MTA Construction & Development in the corpus's exact person-to-department relation.",
  "The cited source-local collapse produced a C&D-to-MTA employee edge rather than the named person's role.",
  "Retire the malformed surrogate; the correct person-to-C&D relation already exists.",
);

identitySeed(
  "relation_rel-mta-launches-data-analytics-blog",
  ["sub_5349270c43b264c0", "sub_63abfdafb5da4ff3"],
  "entity_mta-entity-update-2025", "entity_mta-data-analytics-blog",
  "the Metropolitan Transportation Authority launched the MTA Data & Analytics blog.",
);
const jamaicaQueensEvidence = ["nyct_key_performance_metrics_june2025#p024_c0003"];
replacementSeed(
  "relation_rel-jamaica-bus-depot-queens",
  [
    observation(
      "nyct_key_performance_metrics_june2025", "entity", "entity_queens_borough_semantic_remediation_part_1",
      "Queens", { entity_name: "Queens", entity_type: "borough", description: "New York City borough named as the physical location of the Jamaica Bus Depot rebuild." },
      jamaicaQueensEvidence, "exact_borough_location",
    ),
    relationObservation(
      "nyct_key_performance_metrics_june2025", "relation_jamaica_bus_depot_located_in_queens_semantic_remediation_part_1",
      "Jamaica Bus Depot reconstruction is located in Queens", "located_in", "location_scope",
      { subject_id: "project_jamaica-bus-depot-reconstruction", object_local_observation_id: "entity_queens_borough_semantic_remediation_part_1" },
      jamaicaQueensEvidence, "The official project report states that the Jamaica Bus Depot is being rebuilt and expanded in Queens.",
    ),
  ],
  ["The Jamaica Bus Depot rebuild and expansion is located in Queens."],
  ["Donovan Richards is a person, not the Queens physical-location endpoint of the depot."],
  "Retire the wrong-person endpoint and materialize the exact borough identity and location relation from the neighboring substantive block.",
);
replaceEndpointSeed(
  "relation_project-has-department-key", "object_id", "entity_mta-real-estate-tod",
  "the cited Grand Central train-shed rehabilitation item identifies the Transit-Oriented Development/real-estate department role.",
  "The umbrella MTA organization is not the specifically named department endpoint.",
  "Retarget the managed_by_department edge to the canonical MTA TOD department.",
);
replaceEndpointSeed(
  "relation_meeting-doc-79461-penn-station-access-cd", "object_id", "project_annual-2021-penn-station-access",
  "MTA Construction & Development manages the Penn Station Access project.",
  "A descriptive claim about Penn Station Access is not the project managed by C&D.",
  "Retarget the agency-role edge to the canonical Penn Station Access project.",
);

replaceEndpointSeed(
  "relation_hearing-organized-by-mta", "object_id", "entity_mta-entity-update-2025",
  "the cited capital-projects public hearing was organized by the Metropolitan Transportation Authority.",
  "A source document is evidence for the event, not its organizing actor.",
  "Retarget organized_by to the canonical umbrella MTA organization.",
);
const operationsMeetingEvidence = ["meeting_doc_131546#p001_c0001"];
replacementSeed(
  "relation_meeting-doc-131546-event-organized-by-mta",
  [
    observation(
      "meeting_doc_131546", "entity", "entity_joint_operations_committee_meeting_doc_131546",
      "Joint NYCT, MaBSTOA, SIRTOA, and MTA Bus Committee on Operations",
      {
        entity_name: "Joint Committee on Operations of NYCTA, MaBSTOA, SIRTOA, and MTA Bus Company",
        entity_type: "committee",
      }, operationsMeetingEvidence, "identifies_organizer",
    ),
    relationObservation(
      "meeting_doc_131546", "relation_december_2023_operations_meeting_organized_by_joint_committee",
      "December 2023 operations meeting organized by joint operations committee", "organized_by", "partnership_engagement",
      { subject_id: "event_meeting-doc-131546-committee-ops-meeting", object_local_observation_id: "entity_joint_operations_committee_meeting_doc_131546" },
      operationsMeetingEvidence, "The document is the minutes of the regular meeting of the joint Committee on Operations for NYCTA, MaBSTOA, SIRTOA, and MTA Bus Company.",
    ),
  ],
  ["The event is a regular meeting of the specifically named joint Committee on Operations."],
  ["The source artifact is not the meeting organizer."],
  "Materialize the exact committee named in the title and use it as the event organizer.",
);

for (const relationId of [
  "relation_95001-lirr-part-of-mta",
  "relation_95001-mnr-part-of-mta",
  "relation_95001-mta-bus-part-of-mta",
  "relation_95001-nyct-part-of-mta",
  "relation_95001-sir-part-of-mta",
  "relation_lirr-implemented-by-mta_2",
  "relation_meeting-doc-68251-bt-part-of-mta",
  "relation_meeting-doc-68251-cd-part-of-mta",
  "relation_meeting-doc-68251-lirr-part-of-mta",
  "relation_meeting-doc-68251-mnr-part-of-mta",
  "relation_meeting-doc-68251-mta-bus-part-of-mta",
  "relation_meeting-doc-68251-nyct-part-of-mta",
  "relation_meeting-doc-68251-sir-part-of-mta",
  "relation_metro-north-part-of-mta_3",
]) {
  replaceEndpointSeed(
    relationId, "object_id", "entity_mta-entity-update-2025",
    "the named operating agency/component is part of the Metropolitan Transportation Authority.",
    "A performance-table aggregate or Access-A-Ride program record is not the parent MTA organization.",
    "Replace the collapsed surrogate parent with the canonical umbrella MTA identity.",
  );
}
retractSeed(
  "relation_meeting-doc-127496-gallo-dept-subways",
  ["relation_part-of-agency-entity-meeting-doc-111756-dominick-gallo-entity-dept-of-subways-crichlow_bb4398a21f"],
  "Dominick Gallo is associated with the Department of Subways in the existing exact agency-role relation.",
  "A person cannot be part_of himself.",
  "Retire the identity-collapsed self-loop and retain the exact person-to-department relation.",
);
const myAarEvidence = ["meeting_doc_177266#p004_c0004", "meeting_doc_177266#p007_c0003"];
replacementSeed(
  "relation_rel-meeting-doc-177266-my-aar-part-of-aar",
  [
    observation(
      "meeting_doc_177266", "entity", "entity_my_aar_app_meeting_doc_177266",
      "MY AAR app", { entity_name: "MY AAR app", entity_type: "software_application" },
      myAarEvidence, "identifies_application",
    ),
    relationObservation(
      "meeting_doc_177266", "relation_my_aar_app_part_of_access_a_ride",
      "MY AAR app is part of Access-A-Ride", "part_of", "organization_hierarchy",
      { subject_local_observation_id: "entity_my_aar_app_meeting_doc_177266", object_id: "entity_meeting-doc-154986-aar" },
      myAarEvidence, "The MY AAR app is the application used to book Access-A-Ride trips in the cited workflow.",
    ),
  ],
  ["MY AAR is the app used for booking Access-A-Ride trips."],
  ["Access-A-Ride is not part_of itself."],
  "Separate the MY AAR application from the Access-A-Ride program and preserve their relationship.",
);
identitySeed(
  "relation_mta-odt-part-of-mta",
  ["sub_96904c1925ca9909", "sub_7a01d96c79e5e8f2"],
  "entity_mta-open-data-team", "entity_mta-entity-update-2025",
  "the MTA Open Data Team is part of the Metropolitan Transportation Authority.",
);

const financeOrderEvidence = ["meeting_doc_160251#p001_c0004"];
replacementSeed(
  "relation_meeting-doc-160251-board-agenda",
  [
    observation(
      "meeting_doc_160251", "event", "event_finance_committee_meeting_2024_12_16_meeting_doc_160251",
      "MTA Finance Committee action on December 16, 2024",
      { event_name: "MTA Finance Committee action", event_kind: "committee_action", event_type: "committee_action", date: "2024-12-16", date_precision: "day" },
      financeOrderEvidence, "states_action_order",
    ),
    relationObservation(
      "meeting_doc_160251", "relation_finance_committee_action_precedes_board_action_2024_12",
      "Finance Committee action precedes Board action", "precedes", "dependency_or_reference",
      { subject_local_observation_id: "event_finance_committee_meeting_2024_12_16_meeting_doc_160251", object_id: "event_meeting-doc-160251-board-meeting" },
      financeOrderEvidence, "The action-order table places Finance Committee action on December 16 before Board action on December 18, 2024.",
    ),
  ],
  ["The action-order table places Finance Committee action on December 16 before Board action on December 18, 2024."],
  ["A standing Finance Department entity is not an event that can temporally precede a Board event."],
  "Create the dated committee action and preserve the exact temporal ordering.",
);
patchSeed(
  "relation_meeting-doc-135386-corp-compliance",
  { subject_id: "claim_meeting-doc-135386-personal-property", relation_kind: "prepared_by", relation_family: "publication_role" },
  "the proposed 2024 Personal Property Disposition Guidelines were prepared by MTA Corporate Compliance in consultation with agency procurement departments.",
  "MTA Corporate Compliance did not prepare the umbrella MTA organization.",
  "Reverse the surrogate roles by using the existing guidelines claim as subject and Corporate Compliance as preparer.",
);

const pmtResolutionEvidence = ["meeting_doc_33876#p001_c0002"];
replacementSeed(
  "relation_meeting-doc-33876-mta-finance-prepared-by",
  [
    observation(
      "meeting_doc_33876", "claim", "claim_tbta_payroll_mobility_tax_obligation_resolution_meeting_doc_33876",
      "TBTA Payroll Mobility Tax Obligation Resolution",
      { claim_text: "The item seeks approval of the TBTA Payroll Mobility Tax Obligation Resolution authorizing issuance of bonds and notes for approved capital-program transit and commuter projects.", claim_type: "board_resolution" },
      pmtResolutionEvidence, "identifies_resolution",
    ),
    relationObservation(
      "meeting_doc_33876", "relation_tbta_pmt_obligation_resolution_prepared_by_finance",
      "TBTA PMT obligation resolution prepared by Finance", "prepared_by", "publication_role",
      { subject_local_observation_id: "claim_tbta_payroll_mobility_tax_obligation_resolution_meeting_doc_33876", object_id: "entity_meeting-doc-111901-mta-finance" },
      pmtResolutionEvidence, "The item header identifies Finance as the department responsible for the TBTA Payroll Mobility Tax Obligation Resolution.",
    ),
  ],
  ["Finance is the named department for the TBTA Payroll Mobility Tax Obligation Resolution item."],
  ["MTA Bridges and Tunnels is not a report prepared by Finance."],
  "Use an explicit resolution claim as the prepared artifact.",
);
for (const relationId of [
  "relation_mtabus-report-prepared-by-patel",
  "relation_nyct-report-prepared-by-patel",
  "relation_sir-report-prepared-by-patel",
]) {
  retractSeed(
    relationId, [],
    "the source page header names Jaibala Patel in a finance role and separately reports agency financial material.",
    "The operating agency entity itself is not a report prepared by Jaibala Patel.",
    "Retire the agency-as-document edge; source/report and finance-role records preserve the supported facts.",
  );
}
for (const relationId of [
  "relation_meeting-doc-164901-torres-springer-presents",
  "relation_meeting-doc-37086-mccoy-presented-vrd",
]) {
  patchSeed(
    relationId, { relation_kind: "presented_at", relation_family: "timeline_context" },
    "the named person presented material at the cited committee/Board event.",
    "With a person subject and event object, presented_by reverses the grammatical roles.",
    "Use the directional presented_at predicate from presenter to event.",
  );
}
replaceEndpointSeed(
  "relation_meeting-doc-201516-cd-president-cpc", "object_id", "entity_mta-board-open-data-plan",
  "Jamie Torres-Springer presented the C&D update to the MTA Board.",
  "The source document is evidence for the presentation, not its audience.",
  "Retarget presents_to to the canonical MTA Board governing body.",
);
retractSeed(
  "relation_nyct-procurement-responsible", [],
  "the cited procurement status blocks state that no noncompetitive or competitive procurement actions were presented.",
  "The blocks do not identify the Department of Paratransit as the procuring body for NYCT.",
  "Retire the unsupported agency-to-department procurement edge.",
);

patchSeed(
  "relation_mnr-committee-published-by-mta_3",
  { subject_id: "source_meeting-doc-176341", object_id: "entity_mta-entity-update-2025", relation_kind: "published_by", relation_family: "publication_role" },
  "the Metro-North Committee source document is published by the Metropolitan Transportation Authority.",
  "A committee entity is not itself the published document.",
  "Use the canonical source artifact as publication subject.",
);
for (const [relationId, sourceId, agencyId, agencyName] of [
  ["relation_mta-publishes-mtabus-report", "source_meeting-doc-121071", "entity_mta-bus-company", "MTA Bus Company"],
  ["relation_mta-publishes-nyct-report", "source_meeting-doc-121071", "entity_mta-nyct", "New York City Transit"],
  ["relation_mta-publishes-sir-report", "source_meeting-doc-121071", "entity_meeting-doc-100241-staten-island-railway", "Staten Island Railway"],
  ["relation_mtabus-report-published-by-mta", "source_meeting-doc-113951", "entity_mta-bus-company", "MTA Bus Company"],
  ["relation_nyct-report-published-by-mta", "source_meeting-doc-113951", "entity_mta-nyct", "New York City Transit"],
  ["relation_sir-report-published-by-mta", "source_meeting-doc-113951", "entity_meeting-doc-100241-staten-island-railway", "Staten Island Railway"],
] as const) {
  patchSeed(
    relationId, { subject_id: sourceId, object_id: agencyId, relation_kind: "about", relation_family: "publication_role" },
    `the cited source contains financial/report material about ${agencyName}.`,
    "An operating-agency entity is not itself a report published by another entity in the cited header.",
    "Use the canonical source artifact and an about relation to the exact agency.",
  );
}
retractSeed(
  "relation_patel-published-by-mta", [],
  "the source header identifies Jaibala Patel's finance title.",
  "It does not state that the person was published by NYCT or MTA.",
  "Retire the person-as-publication edge.",
);
generatorSeed(
  "relation_published-by-entity-annual-report-2021-lirr-entity-lirr-equal-opportunity-division_883b1f5bcc",
  "the underlying records preserve LIRR and Equal Opportunity Division identities, but neither entity is a document published by the other.",
);
generatorSeed(
  "relation_published-by-entity-meeting-doc-105931-craig-cipriano-entity-mta-bus-company_49bb0f84e0",
  "the underlying records preserve Craig Cipriano and MTA Bus Company roles, but the person is not a publication issued by the company.",
);
identitySeed(
  "relation_mta-publishes-open-data-plan",
  ["sub_a768d3f90ce81e87", "sub_5393556fcadccc4e"],
  "entity_mta-entity-update-2025", "project_open-data-plan-2022",
  "the Metropolitan Transportation Authority published the 2022 MTA Open Data Plan.",
);

replaceEndpointSeed(
  "relation_meeting-doc-100241-cdot-metro-north-subsidy", "object_id", "entity_cdot-meeting-doc-104741",
  "Metro-North receives the cited subsidy from the Connecticut Department of Transportation.",
  "The umbrella MTA organization is not CDOT, the named subsidy source.",
  "Retarget the funding-source endpoint to canonical CDOT.",
);
for (const relationId of [
  "relation_meeting-doc-100241-mta-bus-city-subsidy",
  "relation_meeting-doc-100241-sir-city-subsidy",
]) {
  replaceEndpointSeed(
    relationId, "object_id", "entity_201203-brt-34th-cac6-city-of-ny",
    "the named operating agency receives the cited subsidy from the City of New York.",
    "The umbrella MTA organization is not the City funding source in the table.",
    "Retarget the funding-source endpoint to canonical City of New York.",
  );
}
replaceEndpointSeed(
  "relation_meeting-doc-111751-metro-north-mta-subsidies", "object_id", "entity_mta-entity-update-2025",
  "Metro-North receives the cited MTA subsidy from the Metropolitan Transportation Authority.",
  "NYCT is not the umbrella MTA subsidy source in this row.",
  "Retarget the collapsed NYCT surrogate to canonical umbrella MTA.",
);
replaceEndpointSeed(
  "relation_meeting-doc-189891-tmha-grantee", "object_id", "entity_meeting-doc-124881-mnr",
  "Tarrytown Municipal Housing Authority is the recipient/grantee of the Metro-North property disposition.",
  "MTA Real Estate administers the item but is not the property grantor identified by the disposition.",
  "Retarget recipient_of to Metro-North, the exact disposing railroad.",
);
patchSeed(
  "relation_diversity-charter-to-board",
  { subject_id: "entity_corporate-governance-committee-charter", object_id: "claim_diversity-charter-accessibility", relation_kind: "submits_for_board_approval", relation_family: "governance_legal" },
  "the Corporate Governance Committee item submits the proposed Diversity Committee Charter accessibility revision for Board approval.",
  "The October 2025 committee meeting event is the setting and cannot serve as the entity to which a claim is recommended.",
  "Use the canonical Corporate Governance Committee as submitter and the existing charter-revision claim as the approval object.",
);

patchSeed(
  "relation_mark-roche-requests-approval",
  { subject_id: "project_omny", object_id: "entity_mark-roche-feb2024", relation_kind: "has_procurement_representative", relation_family: "agency_role" },
  "Mark Roche is the named procurement/requesting representative for the OMNY item.",
  "The source does not state that Mark Roche personally requests approval of the OMNY project as an approval body.",
  "Reverse the surrogate roles and preserve the exact procurement representative relationship.",
);

function authorizationClaimReplacement(
  relationId: string,
  sourceId: string,
  localStem: string,
  label: string,
  claimText: string,
  evidenceIds: string[],
): void {
  const claimLocalId = `claim_${localStem}`;
  replacementSeed(
    relationId,
    [
      observation(
        sourceId, "claim", claimLocalId, label,
        { claim_text: claimText, claim_type: "authorization_request" },
        evidenceIds, "states_authorization_request",
      ),
      relationObservation(
        sourceId, `relation_mta_real_estate_has_${localStem}`,
        `MTA Real Estate has ${label}`, "has_claim", "claim_context",
        { subject_id: "entity_mta-real-estate", object_local_observation_id: claimLocalId },
        evidenceIds, claimText,
      ),
    ],
    [claimText],
    ["A counterparty or operating agency is not itself the transaction for which authorization is requested."],
    "Represent the authorization request as an exact claim; separately reviewed counterparty, lease, and disposition edges preserve the supported entity roles.",
  );
}

authorizationClaimReplacement(
  "relation_meeting-doc-167331-mta-real-estate-requesting-authorization",
  "meeting_doc_167331", "monsey_license_authorization_request_meeting_doc_167331",
  "Monsey license authorization request",
  "MTA Real Estate requests authorization to enter a license agreement on behalf of Metro-North with Monsey Developers and Builders Inc.",
  ["meeting_doc_167331#p002_c0009"],
);
authorizationClaimReplacement(
  "relation_mta-real-estate-requests-lirr-daso-lease",
  "meeting_doc_190011", "daso_lease_renewal_authorization_request_meeting_doc_190011",
  "DASO lease-renewal authorization request",
  "MTA Real Estate requests authorization to enter a lease-renewal agreement on behalf of LIRR with DASO, LLC.",
  ["meeting_doc_190011#p011_c0007"],
);
authorizationClaimReplacement(
  "relation_mta-real-estate-requests-lirr-marsah-lease",
  "meeting_doc_190011", "marsah_lease_renewal_authorization_request_meeting_doc_190011",
  "Marsah lease-renewal authorization request",
  "MTA Real Estate requests authorization to enter a lease-renewal agreement on behalf of LIRR with Marsah Properties LLC.",
  ["meeting_doc_190011#p007_c0009"],
);
authorizationClaimReplacement(
  "relation_mta-real-estate-requests-mnr-tmha-disposition",
  "meeting_doc_190011", "tmha_disposition_authorization_request_meeting_doc_190011",
  "TMHA disposition authorization request",
  "MTA Real Estate requests authorization to dispose of the premises to TMHA for future nonprofit affordable-housing redevelopment for Tarrytown residents at less than fair market value under PAL § 2897(7)(a)(iii).",
  ["meeting_doc_190011#p016_c0008"],
);
authorizationClaimReplacement(
  "relation_mta-real-estate-requests-transit-museum-lease",
  "meeting_doc_190011", "transit_museum_archives_lease_amendment_authorization_request_meeting_doc_190011",
  "Transit Museum Archives lease-amendment authorization request",
  "MTA Real Estate requests authorization to enter a lease-amendment agreement on behalf of the MTA/New York City Transit Museum Archives with 1-10 Bush Terminal Owner LP.",
  ["meeting_doc_190011#p004_c0009"],
);

patchSeed(
  "relation_meeting-doc-160251-mta-finance-tbta",
  { object_id: "entity_meeting-doc-160261-tbta-board", relation_kind: "seeks_ratification_from" },
  "the MTA Finance Department seeks ratification of the special-obligation resolution from the TBTA Board.",
  "The operating agency is not interchangeable with its governing Board for a ratification request.",
  "Retarget the object to the canonical TBTA Board and use the exact ratification predicate.",
);
patchSeed(
  "relation_meeting-doc-192281-mta-finance-seeks-tbta",
  { subject_id: "entity_meeting-doc-111901-mta-finance", object_id: "entity_meeting-doc-160261-tbta-board", relation_kind: "seeks_ratification_from" },
  "the MTA Finance Department seeks TBTA Board ratification of the CRZ Toll Revenue Obligation Resolution.",
  "The umbrella MTA organization and the TBTA operating entity are surrogates for the named department and governing Board.",
  "Use the exact Finance Department and TBTA Board canonical identities.",
);
replaceEndpointSeed(
  "relation_mta-finance-tbta-crz-resolution", "object_id", "entity_meeting-doc-160261-tbta-board",
  "the MTA Finance Department seeks ratification of the CRZ resolution from the TBTA Board.",
  "The TBTA operating entity is not the governing Board asked to ratify the resolution.",
  "Retarget the approval-recipient endpoint to the canonical TBTA Board.",
);
patchSeed(
  "relation_pav-serves-grand-central",
  { object_id: "entity_grand-central-terminal", relation_kind: "serves_facility", relation_family: "location_scope" },
  "the Park Avenue Viaduct project serves and supports access to Grand Central Terminal.",
  "The Grand Central Madison full-service opening event is not the physical facility served by the viaduct.",
  "Retarget the object to the canonical physical terminal and use serves_facility.",
);
retractSeed(
  "relation_meeting-doc-176326-workplan-describes-events", [],
  "the source is a Long Island Committee work-plan/agenda artifact.",
  "The cited heading does not state that the source structures the committee entity as a publication relationship.",
  "Retire the unsupported source-to-committee structures edge.",
);
identitySeed(
  "relation_mta-submits-data-to-nys-portal",
  ["sub_fa43a8a5e4d7cd5b", "sub_1e92f3abf9614118"],
  "entity_mta-entity-update-2025", "entity_ny-state-open-data-portal",
  "the Metropolitan Transportation Authority submits data to the New York State Open Data Portal.",
);

const mtapdPremisesEvidence = ["meeting_doc_135386#p006_c0008"];
replacementSeed(
  "relation_meeting-doc-135386-mtapd-uses-3030",
  [
    observation(
      "meeting_doc_135386", "entity", "entity_30_30_northern_boulevard_sixth_seventh_floors_meeting_doc_135386",
      "30-30 Northern Boulevard sixth and seventh floors",
      {
        entity_name: "30-30 Northern Boulevard sixth and seventh floors",
        entity_type: "leased_premises",
        address: "30-30 Northern Boulevard, Queens, New York",
        extent: "Entire sixth and seventh floors; 53,381 rentable square feet",
      }, mtapdPremisesEvidence, "identifies_facility",
    ),
    relationObservation(
      "meeting_doc_135386", "relation_mtapd_uses_30_30_northern_boulevard_training_premises",
      "MTAPD uses 30-30 Northern Boulevard training premises", "uses_facility", "location_scope",
      { subject_id: "entity_annual-report-2021-mtapd", object_local_observation_id: "entity_30_30_northern_boulevard_sixth_seventh_floors_meeting_doc_135386" },
      mtapdPremisesEvidence, "The sixth and seventh floors at 30-30 Northern Boulevard are to be used as an MTAPD academy and training facility.",
    ),
  ],
  ["MTAPD uses the specifically bounded sixth- and seventh-floor premises at 30-30 Northern Boulevard as an academy and training facility."],
  ["3030 Equities, LLC is the lessor, not the physical facility used by MTAPD."],
  "Create the exact leased premises as a physical facility while leaving lessor identity to contract-role relations.",
);
retractSeed(
  "relation_rel-route-b44-has-type-local", [],
  "the B44 canonical route payload already preserves its Local service variant classification.",
  "A route-type label is not a physical or operational treatment used by the route.",
  "Retire the classification-as-treatment edge without losing the route variant.",
);
retractSeed(
  "relation_john-mueller-works-for-mtapd", ["relation_john-mueller-mtapd"],
  "John Mueller's MTAPD role is already represented by the exact canonical person-to-agency relation.",
  "The MTAPD organization cannot work for itself.",
  "Retire the identity-collapsed self-loop and retain the exact existing relation.",
);

// Build, validate, and deterministically serialize the terminal proposal artifact.
if (seeds.size !== sourceActions.size) {
  const missing = [...sourceActions.keys()].filter((id) => !seeds.has(id)).sort();
  const extra = [...seeds.keys()].filter((id) => !sourceActions.has(id)).sort();
  throw new Error(`Seed coverage mismatch: ${seeds.size}/${sourceActions.size}; missing=${missing.join(",")}; extra=${extra.join(",")}`);
}

type EndpointRule = {
  relation_kind: string;
  allowed_family_shapes: Array<{
    relation_family: string;
    subject_kind: string;
    object_kind: string;
  }>;
};
type EndpointMatrix = {
  schema_version: number;
  contract_id: string;
  rules: EndpointRule[];
};

const endpointMatrixPath = join(CONTRACT_ROOT, "allowed-endpoint-types.json");
const endpointMatrix = JSON.parse(readFileSync(endpointMatrixPath, "utf8")) as EndpointMatrix;
const endpointRules = new Map(endpointMatrix.rules.map((rule) => [rule.relation_kind, rule]));

function canonicalIdentity(recordId: string): CanonicalIdentity {
  const identity = canonicalIdentities.get(recordId);
  if (!identity) throw new Error(`Proposal references noncanonical record ${recordId}`);
  return identity;
}

function assertAllowedTuple(
  context: string,
  relationKindValue: string,
  relationFamilyValue: string,
  subjectKind: string,
  objectKind: string,
): void {
  const rule = endpointRules.get(relationKindValue);
  if (!rule) throw new Error(`${context}: relation kind ${relationKindValue} is absent from ${endpointMatrix.contract_id}`);
  const allowed = rule.allowed_family_shapes.some((shape) =>
    shape.relation_family === relationFamilyValue &&
    shape.subject_kind === subjectKind &&
    shape.object_kind === objectKind);
  if (!allowed) {
    throw new Error(`${context}: disallowed tuple ${relationKindValue}/${relationFamilyValue}/${subjectKind}->${objectKind}`);
  }
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizedSubmissionBundle(relationId: string, rawSubmissions: unknown): MtaSubmitObservationInput[] {
  if (!Array.isArray(rawSubmissions) || rawSubmissions.length === 0) {
    throw new Error(`${relationId}: replace_with_submissions requires a nonempty submissions array`);
  }
  const submissions = rawSubmissions.map((raw) => cleanInput(raw as MtaSubmitObservationInput));
  const locals = new Map<string, MtaSubmitObservationInput>();
  for (const input of submissions) {
    if (locals.has(input.local_observation_id)) throw new Error(`${relationId}: duplicate local id ${input.local_observation_id}`);
    locals.set(input.local_observation_id, input);
    const issues = validateSubmitInput(input);
    if (issues.length > 0) throw new Error(`${relationId}/${input.local_observation_id}: ${issues.join("; ")}`);
    const renormalized = cleanInput(input);
    if (stableJson(renormalized as unknown as JsonValue) !== stableJson(input as unknown as JsonValue)) {
      throw new Error(`${relationId}/${input.local_observation_id}: submission normalization is not idempotent`);
    }
  }
  for (const input of submissions) {
    if (input.observation_kind !== "relation") continue;
    const payload = input.payload ?? {};
    const directSubject = typeof payload.subject_id === "string" ? canonicalIdentity(payload.subject_id).record_kind : undefined;
    const directObject = typeof payload.object_id === "string" ? canonicalIdentity(payload.object_id).record_kind : undefined;
    const localSubject = typeof payload.subject_local_observation_id === "string"
      ? locals.get(payload.subject_local_observation_id)
      : undefined;
    const localObject = typeof payload.object_local_observation_id === "string"
      ? locals.get(payload.object_local_observation_id)
      : undefined;
    if (typeof payload.subject_local_observation_id === "string" && !localSubject) {
      throw new Error(`${relationId}/${input.local_observation_id}: missing local subject ${payload.subject_local_observation_id}`);
    }
    if (typeof payload.object_local_observation_id === "string" && !localObject) {
      throw new Error(`${relationId}/${input.local_observation_id}: missing local object ${payload.object_local_observation_id}`);
    }
    const subjectKind = directSubject ?? localSubject?.observation_kind;
    const objectKind = directObject ?? localObject?.observation_kind;
    const relationKindValue = typeof payload.relation_kind === "string" ? payload.relation_kind : "";
    const relationFamilyValue = typeof payload.relation_family === "string" ? payload.relation_family : "";
    if (!subjectKind || !objectKind) throw new Error(`${relationId}/${input.local_observation_id}: unresolved proposal endpoint kind`);
    assertAllowedTuple(`${relationId}/${input.local_observation_id}`, relationKindValue, relationFamilyValue, subjectKind, objectKind);
  }
  return submissions;
}

const requiredIdentitySubmissionIds = sortedUnique(
  [...seeds.values()].flatMap((seed) => {
    const ids = seed.action.identity_submission_ids;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  }),
);
const submissionFiles = readdirSync(SUBMISSIONS_DIR)
  .filter((name) => name.endsWith(".jsonl"))
  .sort()
  .map((name) => join(SUBMISSIONS_DIR, name));
const identitySubmissionEntries = new Map<string, JsonRecord>();
for (const path of submissionFiles) {
  for (const entry of parseJsonl(path) as JsonRecord[]) {
    const id = entry.submission_id;
    if (typeof id !== "string" || !requiredIdentitySubmissionIds.includes(id)) continue;
    if (identitySubmissionEntries.has(id)) throw new Error(`Identity submission id ${id} occurs in more than one journal row`);
    const validation = entry.validation as JsonRecord | undefined;
    if (validation?.state !== "accepted") throw new Error(`Identity submission ${id} is not accepted`);
    const toolArgs = entry.tool_args as JsonRecord | undefined;
    if (toolArgs?.observation_kind !== "entity") throw new Error(`Identity submission ${id} is not an entity submission`);
    identitySubmissionEntries.set(id, entry);
  }
}
const missingIdentitySubmissions = requiredIdentitySubmissionIds.filter((id) => !identitySubmissionEntries.has(id));
if (missingIdentitySubmissions.length > 0) {
  throw new Error(`Missing identity submissions: ${missingIdentitySubmissions.join(", ")}`);
}

function evidenceRefs(record: MtaCanonicalRecord): MtaEvidenceSubmissionRef[] {
  return [...(record.evidence_refs ?? [])]
    .map((ref) => JSON.parse(JSON.stringify(ref)) as MtaEvidenceSubmissionRef)
    .sort((a, b) => stableJson(a as unknown as JsonValue).localeCompare(stableJson(b as unknown as JsonValue)));
}

function identityChecksForAction(record: MtaCanonicalRecord, action: JsonRecord): CanonicalIdentity[] {
  const ids = new Set<string>([endpoint(record, "subject_id"), endpoint(record, "object_id")]);
  for (const key of ["to_record_id", "expected_subject_id", "expected_object_id"] as const) {
    const value = action[key];
    if (typeof value === "string") ids.add(value);
  }
  const set = action.set;
  if (set && typeof set === "object" && !Array.isArray(set)) {
    for (const key of ["subject_id", "object_id"] as const) {
      const value = (set as JsonRecord)[key];
      if (typeof value === "string") ids.add(value);
    }
  }
  const submissions = action.submissions;
  if (Array.isArray(submissions)) {
    for (const input of submissions as unknown as MtaSubmitObservationInput[]) {
      for (const key of ["subject_id", "object_id"] as const) {
        const value = input.payload?.[key];
        if (typeof value === "string") ids.add(value);
      }
    }
  }
  return [...ids].sort().map(canonicalIdentity);
}

function terminalAction(seed: Seed, record: MtaCanonicalRecord): JsonRecord {
  const value = JSON.parse(JSON.stringify(seed.action)) as JsonRecord;
  value.action_type = seed.terminal_action;
  const currentGuards = guards(record) as unknown as JsonValue;
  if (seed.terminal_action === "replace_endpoint") {
    if (value.field !== "subject_id" && value.field !== "object_id") throw new Error(`${record.record_id}: invalid endpoint field`);
    if (typeof value.to_record_id !== "string") throw new Error(`${record.record_id}: replacement endpoint missing`);
    canonicalIdentity(value.to_record_id);
    value.guards = currentGuards;
  } else if (seed.terminal_action === "patch_relation") {
    const rawSet = value.set as JsonRecord | undefined;
    if (!rawSet) throw new Error(`${record.record_id}: patch set missing`);
    value.set = {
      relation_family: typeof rawSet.relation_family === "string" ? rawSet.relation_family : relationFamily(record),
      relation_kind: typeof rawSet.relation_kind === "string" ? rawSet.relation_kind : relationKind(record),
      subject_id: typeof rawSet.subject_id === "string" ? rawSet.subject_id : endpoint(record, "subject_id"),
      object_id: typeof rawSet.object_id === "string" ? rawSet.object_id : endpoint(record, "object_id"),
    };
    value.guards = currentGuards;
  } else if (seed.terminal_action === "replace_with_submissions") {
    if (value.retire_relation !== true) throw new Error(`${record.record_id}: replacement must retire current relation`);
    value.submissions = normalizedSubmissionBundle(record.record_id, value.submissions) as unknown as JsonValue;
    value.guards = currentGuards;
  } else if (seed.terminal_action === "retract_unsupported") {
    if (!Array.isArray(value.replacement_relation_ids)) throw new Error(`${record.record_id}: replacement relation ids missing`);
    for (const relationId of value.replacement_relation_ids) {
      if (typeof relationId !== "string") throw new Error(`${record.record_id}: non-string replacement relation id`);
      const replacement = canonicalIdentity(relationId);
      if (replacement.record_kind !== "relation") throw new Error(`${record.record_id}: replacement ${relationId} is not a relation`);
      if (relationId === record.record_id) throw new Error(`${record.record_id}: relation cannot replace itself`);
    }
    value.guards = currentGuards;
  } else if (seed.terminal_action === "resolved_by_identity_campaign") {
    if (!Array.isArray(value.identity_submission_ids) || value.identity_submission_ids.length === 0) {
      throw new Error(`${record.record_id}: identity submission ids missing`);
    }
    if (typeof value.expected_subject_id !== "string" || typeof value.expected_object_id !== "string") {
      throw new Error(`${record.record_id}: expected identity endpoints missing`);
    }
    canonicalIdentity(value.expected_subject_id);
    canonicalIdentity(value.expected_object_id);
    value.guards = currentGuards;
  } else if (seed.terminal_action === "resolved_by_generator_fix") {
    if (typeof value.rule_id !== "string" || typeof value.change !== "string") {
      throw new Error(`${record.record_id}: generator rule/change missing`);
    }
    value.guards = currentGuards;
  }

  let finalFamily: string | undefined;
  let finalKind: string | undefined;
  let finalSubject: string | undefined;
  let finalObject: string | undefined;
  if (seed.terminal_action === "replace_endpoint") {
    finalFamily = relationFamily(record);
    finalKind = relationKind(record);
    finalSubject = value.field === "subject_id" ? String(value.to_record_id) : endpoint(record, "subject_id");
    finalObject = value.field === "object_id" ? String(value.to_record_id) : endpoint(record, "object_id");
  } else if (seed.terminal_action === "patch_relation") {
    const set = value.set as JsonRecord;
    finalFamily = String(set.relation_family);
    finalKind = String(set.relation_kind);
    finalSubject = String(set.subject_id);
    finalObject = String(set.object_id);
  } else if (seed.terminal_action === "resolved_by_identity_campaign") {
    finalFamily = relationFamily(record);
    finalKind = relationKind(record);
    finalSubject = String(value.expected_subject_id);
    finalObject = String(value.expected_object_id);
  }
  if (finalFamily && finalKind && finalSubject && finalObject) {
    const subject = canonicalIdentity(finalSubject);
    const object = canonicalIdentity(finalObject);
    assertAllowedTuple(record.record_id, finalKind, finalFamily, subject.record_kind, object.record_kind);
  }
  return value;
}

const decisions = [...sourceActions.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([relationId, sourceAction]) => {
  const record = relations.get(relationId)!;
  const seed = seeds.get(relationId)!;
  const refs = evidenceRefs(record);
  const evidenceIds = sortedUnique(refs.map((ref) => ref.evidence_id).filter((id): id is string => typeof id === "string"));
  const action = terminalAction(seed, record);
  return {
    relation_id: relationId,
    tuple_indices: [sourceAction.tuple_index],
    current_snapshot: {
      record_kind: record.record_kind,
      relation_family: relationFamily(record),
      relation_kind: relationKind(record),
      subject_id: endpoint(record, "subject_id"),
      object_id: endpoint(record, "object_id"),
      payload_sha256: logicalSha256(record.payload),
      evidence_ids: evidenceIds,
      evidence_bindings_sha256: logicalSha256(refs),
    },
    terminal_action: seed.terminal_action,
    rationale: seed.rationale,
    supported_claims: seed.supported_claims,
    unsupported_claims: seed.unsupported_claims,
    investigation: {
      method: "Reviewed the exact canonical relation tuple and every bound authoritative source block in the pinned semantic-review shard; checked current and replacement identities against the canonical physical-record registry; checked every surviving/replacement tuple against relationship-contract-v1.",
      source_ids: sortedUnique(refs.map((ref) => ref.source_id).filter((id): id is string => typeof id === "string")),
      evidence_ids: evidenceIds,
      evidence_text_sha256s: sortedUnique(refs.map((ref) => ref.text_sha256).filter((hash): hash is string => typeof hash === "string")),
      evidence_context_sha256: logicalSha256(refs.map((ref) => ({
        evidence_id: ref.evidence_id,
        block_id: ref.block_id,
        page_number: ref.page_number,
        text_sha256: ref.text_sha256,
        role: ref.role,
      }))),
      canonical_identity_checks: identityChecksForAction(record, action),
      finding: seed.investigation_finding,
    },
    action,
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
  };
});

const actionCounts = Object.fromEntries(
  [...new Set(decisions.map((decision) => decision.terminal_action))].sort().map((action) => [
    action,
    decisions.filter((decision) => decision.terminal_action === action).length,
  ]),
);
const reviewedRelationIds = decisions.map((decision) => decision.relation_id);
const reviewedEvidenceIds = sortedUnique(decisions.flatMap((decision) => decision.current_snapshot.evidence_ids));
const reviewedEvidenceBindings = decisions.map((decision) => ({
  relation_id: decision.relation_id,
  evidence_bindings_sha256: decision.current_snapshot.evidence_bindings_sha256,
}));
const replacementSubmissionCount = decisions.reduce((sum, decision) => {
  const submissions = decision.action.submissions;
  return sum + (Array.isArray(submissions) ? submissions.length : 0);
}, 0);
const canonicalLogicalSha256 = canonicalLogicalHash.digest("hex");

const artifact = {
  schema_version: 1,
  contract_id: "relationship-semantic-remediation-v1",
  shard_id: "part-1",
  review_status: "complete",
  pinned_inputs: {
    semantic_review: {
      path: relative(repoRoot, REVIEW_PATH),
      file_sha256: sha256(reviewRaw),
      logical_sha256: logicalSha256(review),
    },
    canonical_records: {
      record_count: canonicalRecordCount,
      logical_sha256: canonicalLogicalSha256,
      ...stableFileSet(canonicalFiles),
    },
    relationship_endpoint_matrix: {
      path: relative(repoRoot, endpointMatrixPath),
      contract_id: endpointMatrix.contract_id,
      file_sha256: fileSha256(endpointMatrixPath),
      logical_sha256: logicalSha256(endpointMatrix),
    },
    semantic_corrections: {
      path: relative(repoRoot, CORRECTIONS_PATH),
      file_sha256: fileSha256(CORRECTIONS_PATH),
      logical_sha256: logicalSha256(parseJsonl(CORRECTIONS_PATH)),
    },
    supersessions: {
      path: relative(repoRoot, SUPERSESSIONS_PATH),
      file_sha256: fileSha256(SUPERSESSIONS_PATH),
      logical_sha256: logicalSha256(JSON.parse(readFileSync(SUPERSESSIONS_PATH, "utf8"))),
    },
    identity_submission_journals: {
      required_submission_count: requiredIdentitySubmissionIds.length,
      required_submission_ids_sha256: idsSha256(requiredIdentitySubmissionIds),
      required_submission_entries_sha256: logicalSha256(requiredIdentitySubmissionIds.map((id) => identitySubmissionEntries.get(id)!)),
      ...stableFileSet(submissionFiles),
    },
    proposal_source_blocks: stableFileSet([...sourceBlockFiles]),
  },
  summary: {
    relation_count: decisions.length,
    relation_ids_sha256: idsSha256(reviewedRelationIds),
    reviewed_relation_count: decisions.length,
    reviewed_relation_ids_sha256: idsSha256(reviewedRelationIds),
    reviewed_tuple_count: new Set(decisions.flatMap((decision) => decision.tuple_indices)).size,
    reviewed_tuple_indices_sha256: logicalSha256(sortedUnique(decisions.flatMap((decision) => decision.tuple_indices).map(String))),
    evidence_id_count: reviewedEvidenceIds.length,
    evidence_ids_sha256: idsSha256(reviewedEvidenceIds),
    reviewed_evidence_id_count: reviewedEvidenceIds.length,
    reviewed_evidence_ids_sha256: idsSha256(reviewedEvidenceIds),
    reviewed_evidence_bindings_sha256: logicalSha256(reviewedEvidenceBindings),
    terminal_action_counts: actionCounts,
    replacement_submission_count: replacementSubmissionCount,
    unreviewed_relation_count: 0,
    zero_unreviewed: true,
  },
  decisions,
  reproduction: {
    apply: "bun scripts/generate-relationship-semantic-remediation-part-1.ts --apply",
    check: "bun scripts/generate-relationship-semantic-remediation-part-1.ts --check",
  },
};

if (artifact.summary.reviewed_relation_count !== 128 || artifact.summary.unreviewed_relation_count !== 0 || !artifact.summary.zero_unreviewed) {
  throw new Error("Terminal proposal completeness invariant failed");
}
const output = `${JSON.stringify(artifact, null, 2)}\n`;
const mode = process.argv[2];
if (mode === "--apply") {
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, output, "utf8");
  console.log(`wrote ${relative(repoRoot, OUTPUT_PATH)} (${decisions.length} decisions)`);
} else if (mode === "--check") {
  const existing = readFileSync(OUTPUT_PATH, "utf8");
  if (existing !== output) throw new Error(`${relative(repoRoot, OUTPUT_PATH)} is stale; run with --apply`);
  console.log(`verified ${relative(repoRoot, OUTPUT_PATH)} (${decisions.length} decisions)`);
} else {
  throw new Error("Usage: bun scripts/generate-relationship-semantic-remediation-part-1.ts --apply|--check");
}
