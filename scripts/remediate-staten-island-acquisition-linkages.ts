import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { PAYLOAD_SCHEMA_VERSION } from "../packages/db/src/kind-registry";
import { canonicalRecordIdForInput } from "../packages/db/src/identity";
import { stableHash, stableJson } from "../packages/db/src/stable-json";
import type {
  JsonObject,
  JsonValue,
  MtaCanonicalRecord,
  MtaEvidenceRef,
  MtaSubmissionEntry,
  MtaSubmitObservationInput,
  StagedSourceBlock,
} from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import { normalizeSubmitInput } from "../packages/pipeline/src/records/submissions";

const RUN_ID = "2026-07-15T21-00-00-000Z_staten-island-acquisition-linkage-remediation";
const REVIEWED_AT = "2026-07-15T21:00:00.000Z";
const JOURNAL_PATH = join(repoRoot, "data", "submissions", `${RUN_ID}.jsonl`);
const SHARD_ROOT = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "staten-island",
);
const ARTIFACT_ROOT = join(SHARD_ROOT, "linkage-remediation");
const ACTIONS_PATH = join(ARTIFACT_ROOT, "candidate-actions.json");
const SUMMARY_PATH = join(ARTIFACT_ROOT, "summary.json");
const SOURCE_VERIFICATION_PATH = join(ARTIFACT_ROOT, "source-verification.json");
const REPORT_PATH = join(ARTIFACT_ROOT, "report.md");
const MANIFEST_PATH = join(ARTIFACT_ROOT, "manifest.json");
const SUPPORTED_CANDIDATES_PATH = join(SHARD_ROOT, "supported-linkage-candidates.jsonl");
const PHYSICAL_SCOPE_JOURNAL_PATH = join(
  repoRoot,
  "data",
  "submissions",
  "2026-07-15T20-00-00-000Z_bus-lane-treatment-physical-scope-remediation.jsonl",
);

const BETTER_BUSES_SOURCE = "better_buses_action_plan_2019";
const HYLAN_SOURCE = "hylan_cb_july_2020";
const SUPPORTED_CANDIDATES_SHA256 = "71d39ca53c4816671da2cd0e6905bb359d81660ba14622c50e005c5595cfe2cc";
const PHYSICAL_SCOPE_JOURNAL_SHA256 = "c4ea1ac8afcdd31c2499f00df4fdd32a6ad5909fd37aabad78084ff1c2b50983";

const IDS = {
  batteryProject: "project_05-battery-pl",
  batteryTreatment: "treatment_proposed-westbound-bus-lane-battery-pl",
  batteryCorridor: "corridor_battery-pl-manhattan",
  madisonProject: "project_03-madison-ave",
  madisonTreatment: "treatment_madison-ave-double-bus-lane",
  madisonCorridor: "corridor_madison-avenue",
  hylanProject: "project_hylan-blvd-transportation-improvement-study",
  hylanTreatment: "treatment_bus-lanes-hylan-blvd-2012-03",
  hylanCorridor: "corridor_hylan-boulevard-brt",
} as const;

type CorridorGroup = "Battery Place" | "Hylan Boulevard" | "Madison Avenue";
type RouteBindingAction = "added" | "verified_existing";

type BindingSpec = {
  candidateId: string;
  routeId: string;
  canonicalGtfsRouteId: string;
  corridorGroup: CorridorGroup;
  projectId: string;
  treatmentId: string;
  corridorId: string;
  sourceId: string;
  action: RouteBindingAction;
  routeRecordId: string;
  existingRelationId?: string;
  routeLocalId?: string;
  relationLocalId?: string;
  routeBlockId?: string;
  routeQuote?: string;
  routeType: "express" | "local" | "select_bus_service";
};

const BINDINGS: BindingSpec[] = [
  {
    candidateId: "study-event-v2:b6072a8190833425317d1ddc",
    routeId: "SIM1",
    canonicalGtfsRouteId: "SIM1",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "added",
    routeRecordId: "route_sim1",
    routeLocalId: "route_sim1",
    relationLocalId: "relation_battery_place_project_serves_sim1_2019",
    routeBlockId: "p028_p0038",
    routeQuote: "QM8, QM11, QM25, SIM1, SIM1c, SIM2, SIM3c,",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:955adb3a7cb228ff39810821",
    routeId: "SIM15",
    canonicalGtfsRouteId: "SIM15",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "added",
    routeRecordId: "route_sim15",
    routeLocalId: "route_sim15",
    relationLocalId: "relation_battery_place_project_serves_sim15_2019",
    routeBlockId: "p028_p0039",
    routeQuote: "SIM4, SIM4c, SIM4x, SIM5, SIM15, SIM32,",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:03cf27aac5906110d05d23d8",
    routeId: "SIM1C",
    canonicalGtfsRouteId: "SIM1C",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "verified_existing",
    routeRecordId: "route_sim1c-meeting-doc-138456",
    existingRelationId: "relation_serves-route-project-05-battery-pl-route-sim1c-meeting-doc-138456_03f16bc090",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:94506aa18ba41d7470163cad",
    routeId: "SIM2",
    canonicalGtfsRouteId: "SIM2",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "added",
    routeRecordId: "route_sim2",
    routeLocalId: "route_sim2",
    relationLocalId: "relation_battery_place_project_serves_sim2_2019",
    routeBlockId: "p028_p0038",
    routeQuote: "QM8, QM11, QM25, SIM1, SIM1c, SIM2, SIM3c,",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:c99e29584b799c943a5dda53",
    routeId: "SIM32",
    canonicalGtfsRouteId: "SIM32",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "added",
    routeRecordId: "route_sim32",
    routeLocalId: "route_sim32",
    relationLocalId: "relation_battery_place_project_serves_sim32_2019",
    routeBlockId: "p028_p0039",
    routeQuote: "SIM4, SIM4c, SIM4x, SIM5, SIM15, SIM32,",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:69ff2b25bf71bb7f1dd41962",
    routeId: "SIM33C",
    canonicalGtfsRouteId: "SIM33C",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "added",
    routeRecordId: "route_sim33c",
    routeLocalId: "route_sim33c",
    relationLocalId: "relation_battery_place_project_serves_sim33c_2019",
    routeBlockId: "p028_p0040",
    routeQuote: "SIM33c,",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:88a4ef98d281f791f9e4d4c5",
    routeId: "SIM34",
    canonicalGtfsRouteId: "SIM34",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "added",
    routeRecordId: "route_sim34",
    routeLocalId: "route_sim34",
    relationLocalId: "relation_battery_place_project_serves_sim34_2019",
    routeBlockId: "p028_p0043",
    routeQuote: "SIM34, SIM35, X27, X28",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:c910351a6970ad67a85ba290",
    routeId: "SIM35",
    canonicalGtfsRouteId: "SIM35",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "added",
    routeRecordId: "route_sim35",
    routeLocalId: "route_sim35",
    relationLocalId: "relation_battery_place_project_serves_sim35_2019",
    routeBlockId: "p028_p0043",
    routeQuote: "SIM34, SIM35, X27, X28",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:402e35b93b2e18dd50b8bf4d",
    routeId: "SIM3C",
    canonicalGtfsRouteId: "SIM3C",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "added",
    routeRecordId: "route_sim3c",
    routeLocalId: "route_sim3c",
    relationLocalId: "relation_battery_place_project_serves_sim3c_2019",
    routeBlockId: "p028_p0038",
    routeQuote: "QM8, QM11, QM25, SIM1, SIM1c, SIM2, SIM3c,",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:c5669d0023b64203e23f1af6",
    routeId: "SIM4",
    canonicalGtfsRouteId: "SIM4",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "verified_existing",
    routeRecordId: "route_sim4-meeting-doc-176441",
    existingRelationId: "relation_serves-route-project-05-battery-pl-route-sim4-meeting-doc-176441_38a98eebd7",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:7ee4d4a1161ff7b0902bd182",
    routeId: "SIM4C",
    canonicalGtfsRouteId: "SIM4C",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "verified_existing",
    routeRecordId: "route_sim4c-meeting-doc-138456",
    existingRelationId: "relation_serves-route-project-05-battery-pl-route-sim4c-meeting-doc-138456_a2d0a85b97",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:b81faee767193778423c95fc",
    routeId: "SIM5",
    canonicalGtfsRouteId: "SIM5",
    corridorGroup: "Battery Place",
    projectId: IDS.batteryProject,
    treatmentId: IDS.batteryTreatment,
    corridorId: IDS.batteryCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "added",
    routeRecordId: "route_sim5",
    routeLocalId: "route_sim5",
    relationLocalId: "relation_battery_place_project_serves_sim5_2019",
    routeBlockId: "p028_p0039",
    routeQuote: "SIM4, SIM4c, SIM4x, SIM5, SIM15, SIM32,",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:b6b1da71abbf2c610a3ff0e0",
    routeId: "S57",
    canonicalGtfsRouteId: "S57",
    corridorGroup: "Hylan Boulevard",
    projectId: IDS.hylanProject,
    treatmentId: IDS.hylanTreatment,
    corridorId: IDS.hylanCorridor,
    sourceId: HYLAN_SOURCE,
    action: "added",
    routeRecordId: "route_s57",
    routeLocalId: "route_s57",
    relationLocalId: "relation_hylan_project_serves_s57_2020",
    routeBlockId: "p031_p0002",
    routeQuote: "S 57",
    routeType: "local",
  },
  {
    candidateId: "study-event-v2:35b924de75751e620ff5cd1b",
    routeId: "S78",
    canonicalGtfsRouteId: "S78",
    corridorGroup: "Hylan Boulevard",
    projectId: IDS.hylanProject,
    treatmentId: IDS.hylanTreatment,
    corridorId: IDS.hylanCorridor,
    sourceId: HYLAN_SOURCE,
    action: "verified_existing",
    routeRecordId: "route_s78-hylan-2010",
    existingRelationId: "relation_hylan-study-serves-s78",
    routeType: "local",
  },
  {
    candidateId: "study-event-v2:5c3f4b6828ca4b76c035fffb",
    routeId: "S79",
    canonicalGtfsRouteId: "S79+",
    corridorGroup: "Hylan Boulevard",
    projectId: IDS.hylanProject,
    treatmentId: IDS.hylanTreatment,
    corridorId: IDS.hylanCorridor,
    sourceId: HYLAN_SOURCE,
    action: "verified_existing",
    routeRecordId: "route_able-s79-sbs",
    existingRelationId: "relation_project-serves-s79-sbs-winter-2012",
    routeType: "select_bus_service",
  },
  {
    candidateId: "study-event-v2:5ac3f393233f205c142914c2",
    routeId: "SIM7",
    canonicalGtfsRouteId: "SIM7",
    corridorGroup: "Hylan Boulevard",
    projectId: IDS.hylanProject,
    treatmentId: IDS.hylanTreatment,
    corridorId: IDS.hylanCorridor,
    sourceId: HYLAN_SOURCE,
    action: "added",
    routeRecordId: "route_sim7",
    routeLocalId: "route_sim7",
    relationLocalId: "relation_hylan_project_serves_sim7_2020",
    routeBlockId: "p031_p0008",
    routeQuote: "SIM 7",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:fbc625c00e4811450ce3dab9",
    routeId: "SIM9",
    canonicalGtfsRouteId: "SIM9",
    corridorGroup: "Hylan Boulevard",
    projectId: IDS.hylanProject,
    treatmentId: IDS.hylanTreatment,
    corridorId: IDS.hylanCorridor,
    sourceId: HYLAN_SOURCE,
    action: "added",
    routeRecordId: "route_sim9",
    routeLocalId: "route_sim9",
    relationLocalId: "relation_hylan_project_serves_sim9_2020",
    routeBlockId: "p031_p0009",
    routeQuote: "SIM 9",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:c6bd93155bbffd9856470732",
    routeId: "SIM22",
    canonicalGtfsRouteId: "SIM22",
    corridorGroup: "Madison Avenue",
    projectId: IDS.madisonProject,
    treatmentId: IDS.madisonTreatment,
    corridorId: IDS.madisonCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "verified_existing",
    routeRecordId: "route_sim22-42nd-st",
    existingRelationId: "relation_serves-route-project-03-madison-ave-route-sim22-42nd-st_ab04281425",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:c4c39b0f3c90371b46c73fa6",
    routeId: "SIM25",
    canonicalGtfsRouteId: "SIM25",
    corridorGroup: "Madison Avenue",
    projectId: IDS.madisonProject,
    treatmentId: IDS.madisonTreatment,
    corridorId: IDS.madisonCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "verified_existing",
    routeRecordId: "route_sim25-42nd-st",
    existingRelationId: "relation_serves-route-project-03-madison-ave-route-sim25-42nd-st_097dcbb41f",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:56144ad13c89a760eca742f1",
    routeId: "SIM26",
    canonicalGtfsRouteId: "SIM26",
    corridorGroup: "Madison Avenue",
    projectId: IDS.madisonProject,
    treatmentId: IDS.madisonTreatment,
    corridorId: IDS.madisonCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "verified_existing",
    routeRecordId: "route_sim26-42nd-st",
    existingRelationId: "relation_serves-route-project-03-madison-ave-route-sim26-42nd-st_e500e37c2d",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:c224f7cd66538358313fa2c2",
    routeId: "SIM30",
    canonicalGtfsRouteId: "SIM30",
    corridorGroup: "Madison Avenue",
    projectId: IDS.madisonProject,
    treatmentId: IDS.madisonTreatment,
    corridorId: IDS.madisonCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "verified_existing",
    routeRecordId: "route_sim30-42nd-st",
    existingRelationId: "relation_serves-route-project-03-madison-ave-route-sim30-42nd-st_7f869c0db8",
    routeType: "express",
  },
  {
    candidateId: "study-event-v2:56a19ae37a156ba38aefa748",
    routeId: "SIM8",
    canonicalGtfsRouteId: "SIM8",
    corridorGroup: "Madison Avenue",
    projectId: IDS.madisonProject,
    treatmentId: IDS.madisonTreatment,
    corridorId: IDS.madisonCorridor,
    sourceId: BETTER_BUSES_SOURCE,
    action: "verified_existing",
    routeRecordId: "route_sim8-42nd-st",
    existingRelationId: "relation_serves-route-project-03-madison-ave-route-sim8-42nd-st_ef772633d0",
    routeType: "express",
  },
].sort((left, right) => left.candidateId.localeCompare(right.candidateId));

const SHARED_SCOPE = {
  "Battery Place": {
    verified: ["relation_project-has-treatment-proposed-design", "relation_battery-pl-project-uses-corridor"],
    addedLocals: [],
    physicalTreatment: IDS.batteryTreatment,
  },
  "Hylan Boulevard": {
    verified: ["relation_hylan-study-has-bus-lane-hylan", "relation_hylan-study-on-corridor"],
    addedLocals: [],
    physicalTreatment: IDS.hylanTreatment,
  },
  "Madison Avenue": {
    verified: [],
    addedLocals: [
      "relation_staten_acquisition_madison_project_has_double_bus_lane_2019",
      "relation_staten_acquisition_madison_project_uses_corridor_2019",
    ],
    physicalTreatment: IDS.madisonTreatment,
  },
} as const satisfies Record<
  CorridorGroup,
  { verified: readonly string[]; addedLocals: readonly string[]; physicalTreatment: string }
>;

const UNSUPPORTED_CLAIMS = [
  "The candidate's exact historical registry segment identity remains unpinned.",
  "No stable candidate phase identity was proved.",
  "The candidate-specific operational onset was not proved.",
  "No canonical operational-occurrence identity was proved.",
] as const;

export type StatenCandidateAction = {
  candidate_id: string;
  route_id: string;
  canonical_gtfs_route_id: string;
  corridor_group: CorridorGroup;
  route_binding_action: RouteBindingAction;
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

type Campaign = {
  submissions: MtaSubmissionEntry[];
  candidateActions: StatenCandidateAction[];
  summary: JsonObject;
  sourceVerification: JsonObject;
  report: string;
};

function sha256Bytes(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function quoteInText(quote: string, text: string): boolean {
  const normalized = (value: string) => value.replace(/\s+/gu, " ").trim();
  return normalized(text).includes(normalized(quote));
}

function stagedBlock(sourceId: string, blockId: string): StagedSourceBlock {
  const path = join(repoRoot, "raw", "sources", sourceId, "blocks.jsonl");
  const block = readJsonl<StagedSourceBlock>(path).find((entry) => entry.block_id === blockId);
  if (!block) throw new Error(`missing staged source block ${sourceId}#${blockId}`);
  return block;
}

function stagedEvidence(sourceId: string, blockId: string, role: string, quote?: string): MtaEvidenceRef {
  const block = stagedBlock(sourceId, blockId);
  if (quote && !quoteInText(quote, block.raw_text)) throw new Error(`quote missing from ${sourceId}#${blockId}`);
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
  sourceId: string,
  kind: MtaSubmitObservationInput["observation_kind"],
  localId: string,
  label: string,
  payload: JsonObject,
  evidenceRefs: MtaEvidenceRef[],
  options: { targetRecordId?: string; createNew?: boolean } = {},
): MtaSubmitObservationInput {
  return {
    source_id: sourceId,
    observation_kind: kind,
    local_observation_id: localId,
    ...(options.targetRecordId ? { target_record_id: options.targetRecordId } : {}),
    create_new: options.createNew ?? !options.targetRecordId,
    label,
    payload,
    evidence_refs: evidenceRefs,
  };
}

function relation(
  sourceId: string,
  localId: string,
  label: string,
  relationKind: string,
  relationFamily: string,
  subject: { id?: string; localId?: string },
  object: { id?: string; localId?: string },
  assertionStatus: string,
  asOfDate: string,
  description: string,
  evidenceRefs: MtaEvidenceRef[],
): MtaSubmitObservationInput {
  return input(sourceId, "relation", localId, label, {
    relation_kind: relationKind,
    relation_family: relationFamily,
    ...(subject.id ? { subject_id: subject.id } : {}),
    ...(subject.localId ? { subject_local_observation_id: subject.localId } : {}),
    ...(object.id ? { object_id: object.id } : {}),
    ...(object.localId ? { object_local_observation_id: object.localId } : {}),
    assertion_status: assertionStatus,
    as_of_date: asOfDate,
    description,
  }, evidenceRefs);
}

function deterministicEntry(rawInput: MtaSubmitObservationInput): MtaSubmissionEntry {
  const toolArgs = normalizeSubmitInput(rawInput);
  const hash = stableHash(toolArgs as unknown as JsonObject);
  return {
    submission_id: `sub_${hash.slice(0, 16)}`,
    run_id: RUN_ID,
    submitted_at: REVIEWED_AT,
    tool_args_sha256: `sha256:${hash}`,
    schema_version: PAYLOAD_SCHEMA_VERSION,
    tool_args: toolArgs,
    validation: { state: "accepted", issues: [] },
  };
}

function routeId(record: MtaCanonicalRecord): string | undefined {
  const value = record.payload.route_id ?? record.payload.route_label;
  return typeof value === "string" ? value.toUpperCase() : undefined;
}

function endpointId(record: MtaCanonicalRecord, side: "subject" | "object"): string | undefined {
  const value = record.payload[`${side}_id`];
  return typeof value === "string" ? value : undefined;
}

function assertRelation(
  byId: Map<string, MtaCanonicalRecord>,
  relationId: string,
  kind: string,
  subjectId: string,
  objectId: string,
): void {
  const record = byId.get(relationId);
  if (!record || record.record_kind !== "relation") throw new Error(`missing canonical relation ${relationId}`);
  if (
    record.payload.relation_kind !== kind
    || endpointId(record, "subject") !== subjectId
    || endpointId(record, "object") !== objectId
  ) {
    throw new Error(`canonical relation ${relationId} no longer matches ${kind} ${subjectId} -> ${objectId}`);
  }
  if (record.evidence_refs.length === 0) throw new Error(`canonical relation ${relationId} lacks evidence`);
}

function readPhysicalScopeRelations(): Map<string, { relationId: string; subjectId: string; objectId: string }> {
  if (sha256Bytes(PHYSICAL_SCOPE_JOURNAL_PATH) !== PHYSICAL_SCOPE_JOURNAL_SHA256) {
    throw new Error("coordinated physical-scope journal hash changed; re-audit before applying Staten linkage remediation");
  }
  const expected = new Map<string, string>([
    [IDS.batteryTreatment, IDS.batteryCorridor],
    [IDS.hylanTreatment, IDS.hylanCorridor],
    [IDS.madisonTreatment, IDS.madisonCorridor],
  ]);
  const result = new Map<string, { relationId: string; subjectId: string; objectId: string }>();
  for (const entry of readJsonl<MtaSubmissionEntry>(PHYSICAL_SCOPE_JOURNAL_PATH)) {
    const args = entry.tool_args;
    if (args.observation_kind !== "relation" || args.payload.relation_kind !== "located_on_corridor") continue;
    const subjectId = args.payload.subject_id;
    const objectId = args.payload.object_id;
    if (typeof subjectId !== "string" || typeof objectId !== "string" || expected.get(subjectId) !== objectId) continue;
    if (entry.validation.state !== "accepted" || entry.validation.issues.length > 0) {
      throw new Error(`coordinated physical-scope entry ${entry.submission_id} is not accepted`);
    }
    result.set(subjectId, { relationId: canonicalRecordIdForInput(args), subjectId, objectId });
  }
  for (const [subjectId] of expected) {
    if (!result.has(subjectId)) throw new Error(`missing coordinated physical-scope relation for ${subjectId}`);
  }
  return result;
}

function assertCanonicalInputs(): void {
  if (sha256Bytes(SUPPORTED_CANDIDATES_PATH) !== SUPPORTED_CANDIDATES_SHA256) {
    throw new Error("supported Staten candidate set hash changed; re-audit before applying remediation");
  }
  const supported = readJsonl<{ candidate_id: string; normalized_route_id: string }>(SUPPORTED_CANDIDATES_PATH);
  const expectedCandidates = BINDINGS.map((binding) => `${binding.candidateId}\0${binding.routeId}`).sort();
  const actualCandidates = supported.map((row) => `${row.candidate_id}\0${row.normalized_route_id}`).sort();
  if (JSON.stringify(actualCandidates) !== JSON.stringify(expectedCandidates)) {
    throw new Error("supported Staten candidate inventory no longer matches the audited 22-row binding plan");
  }

  const records = readCanonicalRecordsFromJsonl();
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const required: Array<[string, MtaCanonicalRecord["record_kind"]]> = [
    [IDS.batteryProject, "project"],
    [IDS.batteryTreatment, "treatment_component"],
    [IDS.batteryCorridor, "corridor"],
    [IDS.madisonProject, "project"],
    [IDS.madisonTreatment, "treatment_component"],
    [IDS.madisonCorridor, "corridor"],
    [IDS.hylanProject, "project"],
    [IDS.hylanTreatment, "treatment_component"],
    [IDS.hylanCorridor, "corridor"],
  ];
  for (const [id, kind] of required) {
    const record = byId.get(id);
    if (!record) throw new Error(`missing required canonical endpoint ${id}`);
    if (record.record_kind !== kind) throw new Error(`canonical endpoint ${id} is ${record.record_kind}, expected ${kind}`);
  }

  assertRelation(byId, "relation_project-has-treatment-proposed-design", "has_treatment", IDS.batteryProject, IDS.batteryTreatment);
  assertRelation(byId, "relation_battery-pl-project-uses-corridor", "uses_corridor", IDS.batteryProject, IDS.batteryCorridor);
  assertRelation(byId, "relation_hylan-study-has-bus-lane-hylan", "has_treatment", IDS.hylanProject, IDS.hylanTreatment);
  assertRelation(byId, "relation_hylan-study-on-corridor", "uses_corridor", IDS.hylanProject, IDS.hylanCorridor);

  for (const binding of BINDINGS) {
    const route = byId.get(binding.routeRecordId);
    if (binding.action === "verified_existing") {
      if (!route || route.record_kind !== "route") throw new Error(`missing audited route endpoint ${binding.routeRecordId}`);
      const acceptedRouteIds = new Set([binding.routeId, binding.canonicalGtfsRouteId].map((value) => value.toUpperCase()));
      if (!routeId(route) || !acceptedRouteIds.has(routeId(route)!)) {
        throw new Error(`route endpoint ${binding.routeRecordId} no longer identifies ${binding.routeId}`);
      }
      assertRelation(byId, binding.existingRelationId!, "serves_route", binding.projectId, binding.routeRecordId);
      continue;
    }
    const conflicts = records.filter(
      (record) => record.record_kind === "route"
        && routeId(record) === binding.canonicalGtfsRouteId.toUpperCase()
        && record.record_id !== binding.routeRecordId,
    );
    if (conflicts.length > 0) {
      throw new Error(`route ${binding.routeId} gained a conflicting canonical endpoint: ${conflicts.map((record) => record.record_id).join(", ")}`);
    }
  }
  readPhysicalScopeRelations();
}

function buildInputs(): MtaSubmitObservationInput[] {
  const hylanProject = stagedEvidence(HYLAN_SOURCE, "p002_p0004", "project_identity", "Hylan Blvd – 2020 Project");
  const hylanLaneFrom = stagedEvidence(HYLAN_SOURCE, "p022_p0002", "treatment_scope", "lane from Lincoln Ave to");
  const hylanLaneTo = stagedEvidence(HYLAN_SOURCE, "p022_p0003", "treatment_scope", "Nelson Ave");
  const hylanLaneLength = stagedEvidence(HYLAN_SOURCE, "p022_p0004", "treatment_scope", "3.3 miles of bus lane");
  const hylanRouteHeader = stagedEvidence(HYLAN_SOURCE, "p031_p0001", "route_table_header", "Route");
  const batteryProject = stagedEvidence(BETTER_BUSES_SOURCE, "p028_p0003", "project_identity", "Battery Pl, West St to Broadway");
  const batteryRouteHeader = stagedEvidence(BETTER_BUSES_SOURCE, "p028_p0037", "route_scope", "Routes served");
  const madisonProject = stagedEvidence(BETTER_BUSES_SOURCE, "p026_p0001", "project_identity", "Madison Ave, 60th St to 42nd St");
  const madisonExistingLanes = stagedEvidence(BETTER_BUSES_SOURCE, "p026_p0011", "treatment_scope", "double bus lanes on Madison Ave");
  const madisonUpgradeStart = stagedEvidence(BETTER_BUSES_SOURCE, "p026_p0020", "treatment_scope", "This project continues 2018 work to");
  const madisonUpgradeFinish = stagedEvidence(BETTER_BUSES_SOURCE, "p026_p0021", "treatment_scope", "upgrade the bus lanes to red-painted lanes");
  const madisonLength = stagedEvidence(BETTER_BUSES_SOURCE, "p026_p0022", "corridor_scope", "Corridor length: 0.9 miles");

  const inputs: MtaSubmitObservationInput[] = [
    input(HYLAN_SOURCE, "source", `source_${HYLAN_SOURCE}`, "Hylan Boulevard Bus Priority Improvements: Lincoln Avenue to Nelson Avenue", {
      title: "Hylan Boulevard Bus Priority Improvements: Lincoln Avenue to Nelson Avenue",
      publisher: "New York City Department of Transportation",
      source_type: "presentation",
      content_type: "presentation",
      date_text: "July 2020",
      source_url: "https://www.nyc.gov/html/dot/downloads/pdf/hylan-blvd-lincoln-ave-nelson-ave-cab-jul2020.pdf",
      description: "Official NYC DOT community advisory board presentation for Hylan Boulevard bus-priority improvements.",
      authority_tier: "agency_report",
    }, [hylanProject, hylanLaneFrom, hylanLaneTo, hylanLaneLength]),
  ];

  for (const binding of BINDINGS.filter((candidate) => candidate.action === "added")) {
    const routeEvidence = stagedEvidence(binding.sourceId, binding.routeBlockId!, "route_identity", binding.routeQuote);
    const description = binding.corridorGroup === "Battery Place"
      ? `${binding.routeId} is listed among the routes served by the Battery Place project.`
      : `${binding.routeId} is listed in the official Hylan Boulevard project route table.`;
    inputs.push(input(binding.sourceId, "route", binding.routeLocalId!, binding.routeId, {
      route_id: binding.canonicalGtfsRouteId,
      route_label: binding.routeId,
      route_name: binding.routeId,
      route_type: binding.routeType === "select_bus_service" ? "SBS" : binding.routeType,
      service_variant: binding.routeType,
      borough: "Staten Island",
      description,
    }, [routeEvidence]));
  }

  inputs.push(
    relation(
      BETTER_BUSES_SOURCE,
      "relation_staten_acquisition_madison_project_has_double_bus_lane_2019",
      "Madison Avenue 2019 project has the Madison Avenue double bus lane treatment",
      "has_treatment",
      "treatment_context",
      { id: IDS.madisonProject },
      { id: IDS.madisonTreatment },
      "proposed",
      "2019-04",
      "The 2019 project upgrades the existing Madison Avenue double bus lanes with red paint and signage.",
      [madisonProject, madisonExistingLanes, madisonUpgradeStart, madisonUpgradeFinish],
    ),
    relation(
      BETTER_BUSES_SOURCE,
      "relation_staten_acquisition_madison_project_uses_corridor_2019",
      "Madison Avenue 2019 project uses the canonical Madison Avenue corridor",
      "uses_corridor",
      "corridor_scope",
      { id: IDS.madisonProject },
      { id: IDS.madisonCorridor },
      "proposed",
      "2019-04",
      "The source scopes the project to Madison Avenue from 60th Street to 42nd Street and identifies a 0.9-mile corridor.",
      [madisonProject, madisonLength],
    ),
  );

  for (const binding of BINDINGS.filter((candidate) => candidate.action === "added")) {
    const routeEvidence = stagedEvidence(binding.sourceId, binding.routeBlockId!, "route_scope", binding.routeQuote);
    if (binding.corridorGroup === "Battery Place") {
      inputs.push(relation(
        binding.sourceId,
        binding.relationLocalId!,
        `Battery Place project serves ${binding.routeId}`,
        "serves_route",
        "route_scope",
        { id: binding.projectId },
        { localId: binding.routeLocalId! },
        "proposed",
        "2019-04",
        `The Better Buses Action Plan lists ${binding.routeId} among the routes served by the Battery Place project.`,
        [batteryProject, batteryRouteHeader, routeEvidence],
      ));
    } else {
      inputs.push(relation(
        binding.sourceId,
        binding.relationLocalId!,
        `Hylan Boulevard project serves ${binding.routeId}`,
        "serves_route",
        "route_scope",
        { id: binding.projectId },
        { localId: binding.routeLocalId! },
        "proposed",
        "2020-07",
        `The official Hylan Boulevard project analysis lists ${binding.routeId} in its route table.`,
        [hylanProject, hylanLaneFrom, hylanLaneTo, hylanLaneLength, hylanRouteHeader, routeEvidence],
      ));
    }
  }
  return inputs;
}

function relationIdsByLocal(submissions: MtaSubmissionEntry[]): Map<string, string> {
  return new Map(
    submissions
      .filter((entry) => entry.tool_args.observation_kind === "relation")
      .map((entry) => [entry.tool_args.local_observation_id, canonicalRecordIdForInput(entry.tool_args)]),
  );
}

function buildReport(summary: JsonObject, actions: StatenCandidateAction[]): string {
  const routeCounts = summary.route_binding_counts as JsonObject;
  const lines = [
    "# Staten Island supported-linkage remediation",
    "",
    `Run: \`${RUN_ID}\``,
    "",
    "This reconciliation covers the 22 evidence-supported Staten Island acquisition rows without creating registry occurrences, candidate phases, candidate dates, or candidate segment bindings. Direct physical treatment-to-corridor relations are owned by the coordinated physical-scope journal and are referenced here rather than duplicated.",
    "",
    "## Exact outcome",
    "",
    `- Supported candidates: ${summary.candidate_count}`,
    `- Route bindings verified in canonical-before: ${routeCounts.verified_existing}`,
    `- Route bindings added: ${routeCounts.added}`,
    `- Compact canonical route records added: ${summary.route_record_additions}`,
    `- Shared Madison project scope relations added: ${summary.shared_scope_relation_additions}`,
    `- Coordinated treatment-to-corridor relations: ${summary.coordinated_physical_scope_relation_count}`,
    `- Operational occurrences added: ${summary.operational_occurrence_additions}`,
    "",
    "## Candidate actions",
    "",
    "| Candidate | Route | Corridor | Route action | Route record |",
    "|---|---|---|---|---|",
    ...actions.map((action) => `| \`${action.candidate_id}\` | ${action.route_id} | ${action.corridor_group} | ${action.route_binding_action} | \`${action.route_record_id}\` |`),
    "",
    "All 22 rows remain non-projectable because exact historical segment identity, stable phase identity, candidate-specific onset, and canonical operational-occurrence identity remain unsupported.",
    "",
    "## Reproduction",
    "",
    "```bash",
    "bun scripts/remediate-staten-island-acquisition-linkages.ts",
    "bun test packages/pipeline/test/records/staten-island-acquisition-linkage-remediation.test.ts",
    "```",
    "",
  ];
  return lines.join("\n");
}

function buildCampaign(): Campaign {
  assertCanonicalInputs();
  const submissions = buildInputs().map(deterministicEntry);
  const relationIds = relationIdsByLocal(submissions);
  const physicalScope = readPhysicalScopeRelations();
  const hylanSourceEntry = submissions.find((entry) => entry.tool_args.local_observation_id === `source_${HYLAN_SOURCE}`);
  if (!hylanSourceEntry) throw new Error("missing Hylan source input");
  const hylanSourceRecordId = canonicalRecordIdForInput(hylanSourceEntry.tool_args);

  const candidateActions: StatenCandidateAction[] = BINDINGS.map((binding) => {
    const shared = SHARED_SCOPE[binding.corridorGroup];
    const addedSharedIds = shared.addedLocals.map((localId) => {
      const id = relationIds.get(localId);
      if (!id) throw new Error(`missing generated shared scope relation ${localId}`);
      return id;
    });
    const addedRouteRelation = binding.action === "added" ? relationIds.get(binding.relationLocalId!) : undefined;
    if (binding.action === "added" && !addedRouteRelation) throw new Error(`missing generated route relation ${binding.relationLocalId}`);
    const coordinated = physicalScope.get(shared.physicalTreatment);
    if (!coordinated) throw new Error(`missing coordinated physical scope for ${shared.physicalTreatment}`);
    return {
      candidate_id: binding.candidateId,
      route_id: binding.routeId,
      canonical_gtfs_route_id: binding.canonicalGtfsRouteId,
      corridor_group: binding.corridorGroup,
      route_binding_action: binding.action,
      project_id: binding.projectId,
      treatment_id: binding.treatmentId,
      corridor_id: binding.corridorId,
      route_record_id: binding.routeRecordId,
      canonical_links_verified_existing: [
        ...(binding.existingRelationId ? [binding.existingRelationId] : []),
        ...shared.verified,
      ].sort(),
      canonical_links_added: [...(addedRouteRelation ? [addedRouteRelation] : []), ...addedSharedIds].sort(),
      coordinated_physical_scope_relation_id: coordinated.relationId,
      staged_source_ids: [binding.sourceId],
      study_projection_eligible: false,
      remaining_unsupported_claims: [...UNSUPPORTED_CLAIMS],
    };
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));

  const uniqueAddedLinks = [...new Set(candidateActions.flatMap((action) => action.canonical_links_added))].sort();
  const uniqueVerifiedLinks = [...new Set(candidateActions.flatMap((action) => action.canonical_links_verified_existing))].sort();
  const uniquePhysicalScope = [...new Set(candidateActions.map((action) => action.coordinated_physical_scope_relation_id))].sort();
  const journalText = `${submissions.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  const sourceVerification: JsonObject = {
    schema_version: 1,
    verified_at: REVIEWED_AT,
    supported_candidates: {
      path: relative(repoRoot, SUPPORTED_CANDIDATES_PATH),
      sha256: SUPPORTED_CANDIDATES_SHA256,
      row_count: BINDINGS.length,
    },
    canonical_before: {
      relations_jsonl_sha256: "c2480fb9da78b339a9381ff6e5756f6496f87791f79b5cf3f2bc8e2f6b99bbf7",
      relations_count: 21247,
      routes_jsonl_sha256: "f33105d99dda293f352d7caa17b0141523bd307b3cc8097106401d46e756e4ab",
      routes_count: 376,
      note: "Pinned audit inputs; these hashes intentionally describe canonical-before and are not rewritten after coordinated materialization.",
    },
    sources: [
      {
        source_id: BETTER_BUSES_SOURCE,
        status: "staged_identical_to_acquisition",
        url: "https://www.nyc.gov/html/brt/downloads/pdf/better-buses-action-plan-2019.pdf",
        acquisition_sha256: "68ac9e1aaf17a033577688e241e586ac101581ef0e2ba0cc3854196f9323f1c1",
        staged_pdf_sha256: sha256Bytes(join(repoRoot, "raw", "sources", BETTER_BUSES_SOURCE, "source.pdf")),
        staged_pdf_byte_length: readFileSync(join(repoRoot, "raw", "sources", BETTER_BUSES_SOURCE, "source.pdf")).byteLength,
        staged_blocks_sha256: sha256Bytes(join(repoRoot, "raw", "sources", BETTER_BUSES_SOURCE, "blocks.jsonl")),
        staged_block_count: readJsonl<StagedSourceBlock>(join(repoRoot, "raw", "sources", BETTER_BUSES_SOURCE, "blocks.jsonl")).length,
        cited_block_ids: [
          "p026_p0001", "p026_p0011", "p026_p0020", "p026_p0021", "p026_p0022",
          "p028_p0003", "p028_p0037", "p028_p0038", "p028_p0039", "p028_p0040", "p028_p0043",
        ],
      },
      {
        source_id: HYLAN_SOURCE,
        status: "staged_identical_to_acquisition",
        url: "https://www.nyc.gov/html/dot/downloads/pdf/hylan-blvd-lincoln-ave-nelson-ave-cab-jul2020.pdf",
        acquisition_sha256: "dd1e1bb0dce3d7b956dcfc01d0c96c67ffe0b7e3cb19e017659fa78faa0e4296",
        staged_pdf_sha256: sha256Bytes(join(repoRoot, "raw", "sources", HYLAN_SOURCE, "source.pdf")),
        staged_pdf_byte_length: readFileSync(join(repoRoot, "raw", "sources", HYLAN_SOURCE, "source.pdf")).byteLength,
        staged_blocks_sha256: sha256Bytes(join(repoRoot, "raw", "sources", HYLAN_SOURCE, "blocks.jsonl")),
        staged_block_count: readJsonl<StagedSourceBlock>(join(repoRoot, "raw", "sources", HYLAN_SOURCE, "blocks.jsonl")).length,
        cited_block_ids: [
          "p002_p0004", "p022_p0002", "p022_p0003", "p022_p0004",
          "p031_p0001", "p031_p0002", "p031_p0008", "p031_p0009",
        ],
      },
    ],
    coordinated_physical_scope_journal: {
      path: relative(repoRoot, PHYSICAL_SCOPE_JOURNAL_PATH),
      sha256: PHYSICAL_SCOPE_JOURNAL_SHA256,
      relation_ids: uniquePhysicalScope,
      note: "Read-only coordination dependency; these accepted treatment-to-corridor entries are not duplicated in this journal.",
    },
  };
  const summary: JsonObject = {
    schema_version: 1,
    run_id: RUN_ID,
    reviewed_at: REVIEWED_AT,
    candidate_count: candidateActions.length,
    candidate_counts_by_corridor: Object.fromEntries(
      (["Battery Place", "Hylan Boulevard", "Madison Avenue"] as CorridorGroup[]).map((group) => [group, candidateActions.filter((action) => action.corridor_group === group).length]),
    ),
    route_binding_counts: {
      verified_existing: candidateActions.filter((action) => action.route_binding_action === "verified_existing").length,
      added: candidateActions.filter((action) => action.route_binding_action === "added").length,
      after_reconciliation: candidateActions.length,
    },
    submission_count: submissions.length,
    source_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "source").length,
    source_record_ids_added: [hylanSourceRecordId],
    route_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "route").length,
    route_record_ids_added: BINDINGS.filter((binding) => binding.action === "added").map((binding) => binding.routeRecordId).sort(),
    relation_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "relation").length,
    route_relation_additions: BINDINGS.filter((binding) => binding.action === "added").length,
    shared_scope_relation_additions: SHARED_SCOPE["Madison Avenue"].addedLocals.length,
    canonical_relation_ids_added: uniqueAddedLinks,
    canonical_relation_ids_verified_existing: uniqueVerifiedLinks,
    coordinated_physical_scope_relation_count: uniquePhysicalScope.length,
    coordinated_physical_scope_relation_ids: uniquePhysicalScope,
    operational_occurrence_additions: 0,
    candidate_segment_bindings_added: 0,
    candidate_phase_additions: 0,
    candidate_onset_additions: 0,
    all_candidates_study_projection_eligible: false,
    journal_sha256: sha256Text(journalText),
  };
  return {
    submissions,
    candidateActions,
    summary,
    sourceVerification,
    report: buildReport(summary, candidateActions),
  };
}

function baseContent(campaign: Campaign): Record<string, string> {
  return {
    [JOURNAL_PATH]: `${campaign.submissions.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    [ACTIONS_PATH]: `${JSON.stringify({ schema_version: 1, run_id: RUN_ID, candidates: campaign.candidateActions }, null, 2)}\n`,
    [SUMMARY_PATH]: `${JSON.stringify(campaign.summary, null, 2)}\n`,
    [SOURCE_VERIFICATION_PATH]: `${JSON.stringify(campaign.sourceVerification, null, 2)}\n`,
    [REPORT_PATH]: campaign.report,
  };
}

function exactContent(campaign: Campaign): Record<string, string> {
  const base = baseContent(campaign);
  const files = Object.entries(base)
    .map(([path, content]) => ({
      path: relative(repoRoot, path),
      bytes: Buffer.byteLength(content),
      sha256: sha256Text(content),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    ...base,
    [MANIFEST_PATH]: `${JSON.stringify({ schema_version: 1, run_id: RUN_ID, files }, null, 2)}\n`,
  };
}

function applyCampaign(campaign: Campaign): void {
  for (const [path, content] of Object.entries(exactContent(campaign))) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) writeFileSync(path, content, "utf8");
  }
}

function checkCampaign(campaign: Campaign): void {
  for (const [path, expected] of Object.entries(exactContent(campaign))) {
    if (!existsSync(path)) throw new Error(`missing generated artifact ${path}; run with --apply`);
    const actual = readFileSync(path, "utf8");
    if (actual !== expected) throw new Error(`generated artifact differs: ${path}; run with --apply`);
  }
}

export function buildStatenIslandAcquisitionLinkageCampaign(): Campaign {
  return buildCampaign();
}

export function statenIslandAcquisitionCandidateActions(): StatenCandidateAction[] {
  return buildCampaign().candidateActions;
}

if (import.meta.main) {
  const campaign = buildCampaign();
  const apply = process.argv.includes("--apply");
  if (apply) applyCampaign(campaign);
  else checkCampaign(campaign);
  process.stdout.write(`${stableJson({
    mode: apply ? "apply" : "check",
    submissions: campaign.submissions.length,
    candidates: campaign.candidateActions.length,
    route_bindings_added: (campaign.summary.route_binding_counts as JsonObject).added as JsonValue,
    route_bindings_verified_existing: (campaign.summary.route_binding_counts as JsonObject).verified_existing as JsonValue,
    journal_sha256: campaign.summary.journal_sha256 as JsonValue,
  })}\n`);
}
