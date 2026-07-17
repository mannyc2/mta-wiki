import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { canonicalRecordIdForInput } from "../packages/db/src/identity";
import { PAYLOAD_SCHEMA_VERSION } from "../packages/db/src/kind-registry";
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

const RUN_ID = "2026-07-15T22-00-00-000Z_bronx-acquisition-linkage-remediation";
const REVIEWED_AT = "2026-07-15T22:00:00.000Z";
const JOURNAL_PATH = join(repoRoot, "data", "submissions", `${RUN_ID}.jsonl`);
const SHARD_ROOT = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "bronx",
);
const ARTIFACT_ROOT = join(SHARD_ROOT, "linkage-remediation");
const ACTIONS_PATH = join(ARTIFACT_ROOT, "candidate-actions.json");
const SUMMARY_PATH = join(ARTIFACT_ROOT, "summary.json");
const SOURCE_VERIFICATION_PATH = join(ARTIFACT_ROOT, "source-verification.json");
const REPORT_PATH = join(ARTIFACT_ROOT, "report.md");
const MANIFEST_PATH = join(ARTIFACT_ROOT, "manifest.json");
const SUPPORTED_CANDIDATES_PATH = join(SHARD_ROOT, "supported-linkage-candidates.jsonl");
const ACQUISITION_SUMMARY_PATH = join(SHARD_ROOT, "summary.json");
const ACQUISITION_EXCLUSIONS_PATH = join(SHARD_ROOT, "registry-projection-exclusions.jsonl");
const PHYSICAL_SCOPE_JOURNAL_PATH = join(
  repoRoot,
  "data",
  "submissions",
  "2026-07-15T20-00-00-000Z_bus-lane-treatment-physical-scope-remediation.jsonl",
);

const PRIOR_SUPPORTED_CANDIDATES_SHA256 = "79e478d383e917ae0583ebd3a4d8af04935304e6f38e43b76a8c98359bc7ec90";
const SUPPORTED_CANDIDATES_SHA256 = "86e6f394d302e0f0e5d10bd68900d1bc62881ea976c5746974a4cd6b1598ff35";
const PHYSICAL_SCOPE_JOURNAL_SHA256 = "c4ea1ac8afcdd31c2499f00df4fdd32a6ad5909fd37aabad78084ff1c2b50983";
const BX12_LOCAL_VARIANT_CANDIDATE_ID = "study-event-v2:4f20a93956a3af9db4bad8c1";

const SOURCES = {
  e149: "e149_cb1",
  cb5: "bx_cb5_projects_dec032019",
  parkway: "pelham_parkway_completion",
  bay: "pelham_bay_completion",
  w178: "w178_cb12",
} as const;

const IDS = {
  cb5Source: "source_bx-cb5-projects-dec032019",
  betterBusesProject: "project_better-buses-action-plan",
  e149Corridor: "corridor_east-149-st",
  universityCorridor: "corridor_university-ave",
  washingtonCorridor: "corridor_washington-bridge",
  pelhamBayCorridor: "corridor_pelham-bay-station",
  universitySouthTreatment: "treatment_university-south-tremont",
  universityNorthTreatment: "treatment_university-north-tremont",
  washingtonTreatment: "treatment_washington-bridge-bus-lanes",
  pelhamBayContraflowTreatment: "treatment_pelham-bay-bus-contraflow-lane",
  bx2: "route_bx2-ace",
  bx17: "route_bx17",
  bx35: "route_bx35",
  bx13: "route_bx13",
  bx11: "route_bx11",
  bx3: "route_bx3",
  bx36: "route_bx36",
  bx12Sbs: "route_bx12-plus",
  bx24: "route_bx24-oct2022",
  bx23: "route_meeting-doc-129371-bx23",
  bx7: "route_bx7-ace",
} as const;

const LOCAL_IDS = {
  e149Source: `source_${SOURCES.e149}`,
  e149Project: "project_east_149th_street_bus_priority_improvements_2020",
  e149Treatment: "treatment_east_149th_street_bus_lanes_2020_proposal",
  parkwaySource: `source_${SOURCES.parkway}`,
  parkwayProject: "project_pelham_parkway_reconstruction_boston_road_stillwell_avenue",
  parkwayCorridor: "corridor_pelham_parkway_boston_road_stillwell_avenue",
  parkwayTreatment: "treatment_pelham_parkway_dedicated_bus_lanes_2023",
  baySource: `source_${SOURCES.bay}`,
  bayProject: "project_pelham_bay_park_station_improvements_2023",
  bayWilkinsonTreatment: "treatment_wilkinson_avenue_bus_lane_pelham_bay_2023",
  w178Source: `source_${SOURCES.w178}`,
  w178Project: "project_west_178th_street_improvements_2020",
  w178Corridor: "corridor_west_178th_street_fort_washington_wadsworth",
  w178Treatment: "treatment_west_178th_street_bus_only_lane_2020_proposal",
  bx4: "route_bx4",
  bx29: "route_bx29",
} as const;

type CorridorGroup =
  | "CB5 University Avenue"
  | "CB5 Washington Bridge"
  | "East 149th Street"
  | "Pelham Bay"
  | "Pelham Parkway"
  | "West 178th Street";
type RouteCorridorAction = "added" | "verified_existing";

type BindingSpec = {
  candidateId: string;
  registryRouteId: string;
  canonicalGtfsRouteId: string;
  routeRecordId: string;
  routeLocalId?: string;
  group: CorridorGroup;
  sourceId: string;
  routeCorridorAction: RouteCorridorAction;
  existingRouteCorridorRelationId?: string;
  routeCorridorLocalId?: string;
  projectServesLocalId: string;
};

const BINDINGS: BindingSpec[] = [
  {
    candidateId: "study-event-v2:2dd76c9b799ab1165b237330",
    registryRouteId: "BX2",
    canonicalGtfsRouteId: "BX2",
    routeRecordId: IDS.bx2,
    group: "East 149th Street",
    sourceId: SOURCES.e149,
    routeCorridorAction: "verified_existing",
    existingRouteCorridorRelationId: "relation_operates-on-corridor-route-bx2-ace-corridor-east-149-st_c8733902ce",
    projectServesLocalId: "relation_bronx_e149_project_serves_bx2",
  },
  {
    candidateId: "study-event-v2:3134629ede9faeff4c6f54b5",
    registryRouteId: "BX35",
    canonicalGtfsRouteId: "BX35",
    routeRecordId: IDS.bx35,
    group: "CB5 Washington Bridge",
    sourceId: SOURCES.cb5,
    routeCorridorAction: "added",
    routeCorridorLocalId: "relation_bronx_bx35_operates_washington_bridge",
    projectServesLocalId: "relation_bronx_cb5_project_serves_bx35",
  },
  {
    candidateId: "study-event-v2:37447319d0697677f54ec0db",
    registryRouteId: "BX13",
    canonicalGtfsRouteId: "BX13",
    routeRecordId: IDS.bx13,
    group: "CB5 Washington Bridge",
    sourceId: SOURCES.cb5,
    routeCorridorAction: "verified_existing",
    existingRouteCorridorRelationId: "relation_operates-on-corridor-route-bx13-corridor-washington-bridge_2d306086af",
    projectServesLocalId: "relation_bronx_cb5_project_serves_bx13",
  },
  {
    candidateId: "study-event-v2:3a7457be7847b8857c79fc68",
    registryRouteId: "BX4",
    canonicalGtfsRouteId: "BX4",
    routeRecordId: "route_bx4",
    routeLocalId: LOCAL_IDS.bx4,
    group: "East 149th Street",
    sourceId: SOURCES.e149,
    routeCorridorAction: "added",
    routeCorridorLocalId: "relation_bronx_bx4_operates_e149",
    projectServesLocalId: "relation_bronx_e149_project_serves_bx4",
  },
  {
    candidateId: "study-event-v2:3f2f3824ccf3987f4fac2f73",
    registryRouteId: "BX11",
    canonicalGtfsRouteId: "BX11",
    routeRecordId: IDS.bx11,
    group: "CB5 Washington Bridge",
    sourceId: SOURCES.cb5,
    routeCorridorAction: "verified_existing",
    existingRouteCorridorRelationId: "relation_operates-on-corridor-route-bx11-corridor-washington-bridge_a66cb89fa5",
    projectServesLocalId: "relation_bronx_cb5_project_serves_bx11",
  },
  {
    candidateId: "study-event-v2:452901b4951f8fd3f5105e3e",
    registryRouteId: "BX12+",
    canonicalGtfsRouteId: "BX12+",
    routeRecordId: IDS.bx12Sbs,
    group: "Pelham Parkway",
    sourceId: SOURCES.parkway,
    routeCorridorAction: "added",
    routeCorridorLocalId: "relation_bronx_bx12_sbs_operates_pelham_parkway_reconstruction_corridor",
    projectServesLocalId: "relation_bronx_pelham_parkway_project_serves_bx12_sbs",
  },
  {
    candidateId: "study-event-v2:531b37f7c6e156178c51707a",
    registryRouteId: "BX3",
    canonicalGtfsRouteId: "BX3",
    routeRecordId: IDS.bx3,
    group: "CB5 University Avenue",
    sourceId: SOURCES.cb5,
    routeCorridorAction: "verified_existing",
    existingRouteCorridorRelationId: "relation_operates-on-corridor-route-bx3-corridor-university-ave_d112da0c95",
    projectServesLocalId: "relation_bronx_cb5_project_serves_bx3",
  },
  {
    candidateId: "study-event-v2:62d9b1d8b5d7ede06fa8ba6a",
    registryRouteId: "BX29",
    canonicalGtfsRouteId: "BX29",
    routeRecordId: "route_bx29",
    routeLocalId: LOCAL_IDS.bx29,
    group: "Pelham Bay",
    sourceId: SOURCES.bay,
    routeCorridorAction: "added",
    routeCorridorLocalId: "relation_bronx_bx29_operates_pelham_bay_station",
    projectServesLocalId: "relation_bronx_pelham_bay_project_serves_bx29",
  },
  {
    candidateId: "study-event-v2:74303954f2450436e58eadaf",
    registryRouteId: "BX17",
    canonicalGtfsRouteId: "BX17",
    routeRecordId: IDS.bx17,
    group: "East 149th Street",
    sourceId: SOURCES.e149,
    routeCorridorAction: "added",
    routeCorridorLocalId: "relation_bronx_bx17_operates_e149",
    projectServesLocalId: "relation_bronx_e149_project_serves_bx17",
  },
  {
    candidateId: "study-event-v2:90af3c526dedca40f0e7fb28",
    registryRouteId: "BX7",
    canonicalGtfsRouteId: "BX7",
    routeRecordId: IDS.bx7,
    group: "West 178th Street",
    sourceId: SOURCES.w178,
    routeCorridorAction: "added",
    routeCorridorLocalId: "relation_bronx_bx7_operates_west_178th",
    projectServesLocalId: "relation_bronx_west_178th_project_serves_bx7",
  },
  {
    candidateId: "study-event-v2:aa65fa96dffcaf26e7f07c85",
    registryRouteId: "BX24",
    canonicalGtfsRouteId: "BX24",
    routeRecordId: IDS.bx24,
    group: "Pelham Bay",
    sourceId: SOURCES.bay,
    routeCorridorAction: "verified_existing",
    existingRouteCorridorRelationId: "relation_operates-on-corridor-route-bx24-oct2022-corridor-pelham-bay-station_d3b0dea51b",
    projectServesLocalId: "relation_bronx_pelham_bay_project_serves_bx24",
  },
  {
    candidateId: "study-event-v2:b8621d718aca1a1bf4d5b0d6",
    registryRouteId: "BX23",
    canonicalGtfsRouteId: "BX23",
    routeRecordId: IDS.bx23,
    group: "Pelham Bay",
    sourceId: SOURCES.bay,
    routeCorridorAction: "added",
    routeCorridorLocalId: "relation_bronx_bx23_operates_pelham_bay_station",
    projectServesLocalId: "relation_bronx_pelham_bay_project_serves_bx23",
  },
  {
    candidateId: "study-event-v2:c725655aeb19bb344c1ce990",
    registryRouteId: "BX36",
    canonicalGtfsRouteId: "BX36",
    routeRecordId: IDS.bx36,
    group: "CB5 University Avenue",
    sourceId: SOURCES.cb5,
    routeCorridorAction: "verified_existing",
    existingRouteCorridorRelationId: "relation_bx36-operates-university",
    projectServesLocalId: "relation_bronx_cb5_project_serves_bx36",
  },
].sort((left, right) => left.candidateId.localeCompare(right.candidateId));

const GROUP_SCOPE_LOCALS: Record<CorridorGroup, string[]> = {
  "East 149th Street": [
    "relation_bronx_e149_project_uses_corridor",
    "relation_bronx_e149_project_has_bus_lanes",
    "relation_bronx_e149_bus_lanes_located_on_corridor",
  ],
  "CB5 University Avenue": [
    "relation_bronx_cb5_project_has_university_south_bus_lane",
    "relation_bronx_cb5_project_has_university_north_bus_lane",
  ],
  "CB5 Washington Bridge": ["relation_bronx_cb5_project_has_washington_bridge_bus_lanes"],
  "Pelham Parkway": [
    "relation_bronx_pelham_parkway_project_uses_corridor",
    "relation_bronx_pelham_parkway_project_has_bus_lanes",
    "relation_bronx_pelham_parkway_bus_lanes_located_on_corridor",
  ],
  "Pelham Bay": [
    "relation_bronx_pelham_bay_project_uses_station_corridor",
    "relation_bronx_pelham_bay_project_has_westchester_contraflow_lane",
    "relation_bronx_pelham_bay_project_has_wilkinson_bus_lane",
    "relation_bronx_pelham_bay_westchester_lane_located_on_station_corridor",
    "relation_bronx_pelham_bay_wilkinson_lane_located_on_station_corridor",
  ],
  "West 178th Street": [
    "relation_bronx_west_178th_project_uses_corridor",
    "relation_bronx_west_178th_project_has_bus_only_lane",
    "relation_bronx_west_178th_bus_only_lane_located_on_corridor",
  ],
};

const GROUP_VERIFIED_RELATIONS: Record<CorridorGroup, string[]> = {
  "East 149th Street": [],
  "CB5 University Avenue": ["relation_project-has-corridor-university"],
  "CB5 Washington Bridge": ["relation_project-has-corridor-washington-bridge"],
  "Pelham Parkway": [],
  "Pelham Bay": [],
  "West 178th Street": [],
};

const UNSUPPORTED_CLAIMS = [
  "The candidate's exact historical registry segment identity remains unpinned.",
  "No stable candidate phase identity was proved.",
  "The candidate-specific operational onset was not proved.",
  "No canonical operational-occurrence identity was proved.",
] as const;

export type BronxCandidateAction = {
  candidate_id: string;
  registry_route_id: string;
  canonical_gtfs_route_id: string;
  canonical_route_record_id: string;
  corridor_group: CorridorGroup;
  project_id: string;
  treatment_ids: string[];
  corridor_id: string;
  route_corridor_action: RouteCorridorAction;
  generic_linkage_reconciled: true;
  canonical_links_added: string[];
  canonical_links_verified_existing: string[];
  coordinated_physical_scope_relation_ids: string[];
  canonical_records_added: string[];
  staged_source_ids: string[];
  study_projection_eligible: false;
  remaining_unsupported_claims: string[];
};

type Campaign = {
  submissions: MtaSubmissionEntry[];
  candidateActions: BronxCandidateAction[];
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

function stagedBlocks(sourceId: string): StagedSourceBlock[] {
  return readJsonl<StagedSourceBlock>(join(repoRoot, "raw", "sources", sourceId, "blocks.jsonl"));
}

function stagedEvidence(sourceId: string, blockId: string, role: string, quote?: string): MtaEvidenceRef {
  const block = stagedBlocks(sourceId).find((entry) => entry.block_id === blockId);
  if (!block) throw new Error(`missing staged source block ${sourceId}#${blockId}`);
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
): MtaSubmitObservationInput {
  return {
    source_id: sourceId,
    observation_kind: kind,
    local_observation_id: localId,
    create_new: true,
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
  assertionStatus: "delivered" | "proposed",
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

function endpointId(record: MtaCanonicalRecord, side: "subject" | "object"): string | undefined {
  const value = record.payload[`${side}_id`];
  return typeof value === "string" ? value : undefined;
}

function routeId(record: MtaCanonicalRecord): string | undefined {
  const value = record.payload.route_id ?? record.payload.route_label;
  return typeof value === "string" ? value.toUpperCase() : undefined;
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

function readPhysicalScopeRelations(): Map<string, { relationId: string; objectId: string }> {
  if (sha256Bytes(PHYSICAL_SCOPE_JOURNAL_PATH) !== PHYSICAL_SCOPE_JOURNAL_SHA256) {
    throw new Error("coordinated physical-scope journal hash changed; re-audit Bronx linkage remediation");
  }
  const expected = new Map<string, string>([
    [IDS.universitySouthTreatment, IDS.universityCorridor],
    [IDS.universityNorthTreatment, IDS.universityCorridor],
    [IDS.washingtonTreatment, IDS.washingtonCorridor],
  ]);
  const result = new Map<string, { relationId: string; objectId: string }>();
  for (const entry of readJsonl<MtaSubmissionEntry>(PHYSICAL_SCOPE_JOURNAL_PATH)) {
    const args = entry.tool_args;
    if (args.observation_kind !== "relation" || args.payload.relation_kind !== "located_on_corridor") continue;
    const subjectId = args.payload.subject_id;
    const objectId = args.payload.object_id;
    if (typeof subjectId !== "string" || typeof objectId !== "string" || expected.get(subjectId) !== objectId) continue;
    if (entry.validation.state !== "accepted" || entry.validation.issues.length > 0) {
      throw new Error(`coordinated physical-scope entry ${entry.submission_id} is not accepted`);
    }
    result.set(subjectId, { relationId: canonicalRecordIdForInput(args), objectId });
  }
  for (const [subjectId] of expected) {
    if (!result.has(subjectId)) throw new Error(`missing coordinated physical-scope relation for ${subjectId}`);
  }
  return result;
}

function assertCanonicalInputs(): void {
  if (sha256Bytes(SUPPORTED_CANDIDATES_PATH) !== SUPPORTED_CANDIDATES_SHA256) {
    throw new Error("supported Bronx candidate set hash changed; re-audit linkage remediation");
  }
  const supported = readJsonl<{ candidate_id: string; route_id: string }>(SUPPORTED_CANDIDATES_PATH);
  const expectedRows = BINDINGS.map((binding) => `${binding.candidateId}\0${binding.registryRouteId}`).sort();
  const actualRows = supported.map((row) => `${row.candidate_id}\0${row.route_id}`).sort();
  if (JSON.stringify(actualRows) !== JSON.stringify(expectedRows)) {
    throw new Error("supported Bronx candidate inventory no longer matches the audited 13-row plan");
  }
  if (supported.some((row) => row.candidate_id === BX12_LOCAL_VARIANT_CANDIDATE_ID)) {
    throw new Error("BX12 local precision-defect row must not remain in supported linkage candidates");
  }

  const acquisitionSummary = JSON.parse(readFileSync(ACQUISITION_SUMMARY_PATH, "utf8")) as {
    exact_route_binding_proved_count: number;
    route_variant_precision_rejected_candidate_ids: string[];
    supported_linkages_sha256: string;
  };
  if (
    acquisitionSummary.exact_route_binding_proved_count !== 13
    || acquisitionSummary.supported_linkages_sha256 !== SUPPORTED_CANDIDATES_SHA256
    || !acquisitionSummary.route_variant_precision_rejected_candidate_ids.includes(BX12_LOCAL_VARIANT_CANDIDATE_ID)
  ) {
    throw new Error("Bronx acquisition summary does not preserve the BX12 local precision correction");
  }
  const bx12LocalExclusion = readJsonl<{
    candidate_id: string;
    exact_route_treatment_binding_proved: boolean;
    reason: string;
  }>(ACQUISITION_EXCLUSIONS_PATH).find((row) => row.candidate_id === BX12_LOCAL_VARIANT_CANDIDATE_ID);
  if (
    !bx12LocalExclusion
    || bx12LocalExclusion.exact_route_treatment_binding_proved
    || !bx12LocalExclusion.reason.includes("BX12 Select Bus Service (BX12+) only")
  ) {
    throw new Error("BX12 local exclusion no longer records the exact route-variant precision defect");
  }

  const records = readCanonicalRecordsFromJsonl();
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const required: Array<[string, MtaCanonicalRecord["record_kind"]]> = [
    [IDS.cb5Source, "source"],
    [IDS.betterBusesProject, "project"],
    [IDS.e149Corridor, "corridor"],
    [IDS.universityCorridor, "corridor"],
    [IDS.washingtonCorridor, "corridor"],
    [IDS.pelhamBayCorridor, "corridor"],
    [IDS.universitySouthTreatment, "treatment_component"],
    [IDS.universityNorthTreatment, "treatment_component"],
    [IDS.washingtonTreatment, "treatment_component"],
    [IDS.pelhamBayContraflowTreatment, "treatment_component"],
    [IDS.bx2, "route"],
    [IDS.bx17, "route"],
    [IDS.bx35, "route"],
    [IDS.bx13, "route"],
    [IDS.bx11, "route"],
    [IDS.bx3, "route"],
    [IDS.bx36, "route"],
    [IDS.bx12Sbs, "route"],
    [IDS.bx24, "route"],
    [IDS.bx23, "route"],
    [IDS.bx7, "route"],
  ];
  for (const [id, kind] of required) {
    const record = byId.get(id);
    if (!record) throw new Error(`missing required canonical endpoint ${id}`);
    if (record.record_kind !== kind) throw new Error(`canonical endpoint ${id} is ${record.record_kind}, expected ${kind}`);
  }

  assertRelation(byId, "relation_project-has-corridor-university", "uses_corridor", IDS.betterBusesProject, IDS.universityCorridor);
  assertRelation(byId, "relation_project-has-corridor-washington-bridge", "uses_corridor", IDS.betterBusesProject, IDS.washingtonCorridor);
  for (const binding of BINDINGS.filter((entry) => entry.routeCorridorAction === "verified_existing")) {
    const corridorId = binding.group === "East 149th Street"
      ? IDS.e149Corridor
      : binding.group === "CB5 University Avenue"
        ? IDS.universityCorridor
        : binding.group === "CB5 Washington Bridge"
          ? IDS.washingtonCorridor
          : IDS.pelhamBayCorridor;
    assertRelation(
      byId,
      binding.existingRouteCorridorRelationId!,
      "operates_on_corridor",
      binding.routeRecordId,
      corridorId,
    );
  }

  for (const binding of BINDINGS.filter((entry) => entry.routeLocalId)) {
    const conflicts = records.filter(
      (record) => record.record_kind === "route"
        && routeId(record) === binding.canonicalGtfsRouteId
        && record.record_id !== binding.routeRecordId,
    );
    if (conflicts.length > 0) {
      throw new Error(`route ${binding.canonicalGtfsRouteId} gained conflicting endpoints: ${conflicts.map((r) => r.record_id).join(", ")}`);
    }
  }
  readPhysicalScopeRelations();
}

function buildInputs(): MtaSubmitObservationInput[] {
  const e149Title = stagedEvidence(SOURCES.e149, "p001_p0001", "project_identity", "East 149th St Bus Priority Improvements");
  const e149Date = stagedEvidence(SOURCES.e149, "p001_p0002", "presentation_date", "Bronx Community Board 1 – June 25th, 2020");
  const e149Routes = stagedEvidence(SOURCES.e149, "p004_p0003", "route_scope", "Bx2, Bx4, Bx17, Bx19");
  const e149TreatmentHeader = stagedEvidence(SOURCES.e149, "p013_p0001", "treatment_scope", "Proposed Treatments");
  const e149BusLanes = stagedEvidence(SOURCES.e149, "p013_p0002", "treatment_scope", "Bus Lanes");

  const cb5Title = stagedEvidence(SOURCES.cb5, "p001_c0001", "project_identity", "2020 Bus Priority Improvements");
  const cb5Date = stagedEvidence(SOURCES.cb5, "p001_c0002", "presentation_date", "December 3, 2019");
  const universityExtent = stagedEvidence(SOURCES.cb5, "p013_c0002", "corridor_scope", "Kingsbridge Rd to Washington Bridge");
  const universityRoutes = stagedEvidence(SOURCES.cb5, "p013_c0003", "route_scope", "Bx3, Bx36");
  const universitySouth = stagedEvidence(SOURCES.cb5, "p015_c0006", "treatment_scope", "10.5' Bus Lane");
  const universityNorth = stagedEvidence(SOURCES.cb5, "p016_c0006", "treatment_scope", "11' Shared Bike/Bus Lane");
  const washingtonExtent = stagedEvidence(SOURCES.cb5, "p020_c0002", "corridor_scope", "Amsterdam Ave to University Ave");
  const washingtonRoutes = stagedEvidence(SOURCES.cb5, "p020_c0003", "route_scope", "Bx3, Bx11, Bx13, Bx35, and Bx36");
  const washingtonTreatment = stagedEvidence(SOURCES.cb5, "p023_c0006", "treatment_scope", "Proposed: Bus Lanes on Washington Bridge");

  const parkwayTitle = stagedEvidence(SOURCES.parkway, "p001_b0018", "project_identity", "City Completes Second Phase of Pelham Parkway Reconstruction in the Bronx");
  const parkwayCompletion = stagedEvidence(SOURCES.parkway, "p001_b0023", "treatment_scope", "1.7 miles of new dedicated bus lanes");
  const parkwayExtent = stagedEvidence(SOURCES.parkway, "p001_b0027", "corridor_scope", "rebuilt 1.8 miles of Pelham Parkway from Boston Road to Stillwell Avenue");
  const parkwayRoute = stagedEvidence(SOURCES.parkway, "p001_b0028", "route_scope", "1.7 miles of new bus lanes primarily serve the BX12 Select Bus Service route");

  const bayDate = stagedEvidence(SOURCES.bay, "p001_b0010", "publication_date", "January 23, 2023");
  const bayTitle = stagedEvidence(SOURCES.bay, "p001_b0012", "project_identity", "NYC DOT and MTA Announce Major Improvements for Pedestrians and Bus Riders Completed at Pelham Bay Park Station in The Bronx");
  const bayCompletion = stagedEvidence(SOURCES.bay, "p001_b0016", "project_scope", "major transit improvements at the Pelham Bay Park subway station");
  const bayTreatments = stagedEvidence(SOURCES.bay, "p001_b0019", "treatment_scope", "eastbound contraflow bus-only lane (with 6,800 sq. ft. of red paint) on Westchester Avenue and a new bus lane on Wilkinson Avenue");
  const bayRoutes = stagedEvidence(SOURCES.bay, "p001_b0025", "route_scope", "Bx5, Bx23, Bx24, Bx29 and Q50");

  const w178Title = stagedEvidence(SOURCES.w178, "p001_p0001", "project_identity", "W 178 St (Ft Washington Ave to Wadsworth Ave)");
  const w178Date = stagedEvidence(SOURCES.w178, "p001_p0002", "presentation_date", "March 2020");
  const w178ExtentStart = stagedEvidence(SOURCES.w178, "p002_p0002", "corridor_scope", "Project limits: W 178th St, from");
  const w178ExtentMiddle = stagedEvidence(SOURCES.w178, "p002_p0003", "corridor_scope", "Ft Washington Ave to");
  const w178ExtentEnd = stagedEvidence(SOURCES.w178, "p002_p0004", "corridor_scope", "Wadsworth Ave; 0.2 miles");
  const w178RoutesStart = stagedEvidence(SOURCES.w178, "p002_p0012", "route_scope", "Bx3, Bx7, Bx11, Bx13");
  const w178RoutesEnd = stagedEvidence(SOURCES.w178, "p002_p0013", "route_scope", "Bx36, M5, M98, and M100");
  const w178LaneStart = stagedEvidence(SOURCES.w178, "p009_p0016", "treatment_scope", "Bus Only Lane on W 178th");
  const w178LaneMiddle = stagedEvidence(SOURCES.w178, "p009_p0017", "treatment_scope", "St between Ft Washington");
  const w178LaneEnd = stagedEvidence(SOURCES.w178, "p009_p0019", "treatment_scope", "Ave to Wadsworth Ave");

  const inputs: MtaSubmitObservationInput[] = [
    input(SOURCES.e149, "source", LOCAL_IDS.e149Source, "East 149th Street Bus Priority Improvements presentation", {
      title: "East 149th Street Bus Priority Improvements",
      publisher: "New York City Department of Transportation",
      source_type: "presentation",
      content_type: "community board presentation",
      date_text: "June 25, 2020",
      source_url: "https://www.nyc.gov/html/brt/downloads/pdf/e149th-st-cb1-jun2020.pdf",
      authority_tier: "agency_report",
    }, [e149Title, e149Date]),
    input(SOURCES.e149, "project", LOCAL_IDS.e149Project, "East 149th Street Bus Priority Improvements", {
      project_name: "East 149th Street Bus Priority Improvements",
      project_type: "bus priority and safety improvements",
      project_family: "bus_priority",
      status: "proposed",
      document_time_status: "proposed",
      borough: "Bronx",
      location_text: "East 149th Street",
      description: "NYC DOT's June 2020 East 149th Street bus-priority proposal.",
    }, [e149Title, e149Date, e149TreatmentHeader]),
    input(SOURCES.e149, "treatment_component", LOCAL_IDS.e149Treatment, "East 149th Street proposed bus lanes", {
      treatment_kind: "bus lane",
      treatment_family: "bus_lane",
      location_text: "East 149th Street",
      description: "Bus lanes proposed as part of the East 149th Street Bus Priority Improvements presentation.",
    }, [e149Title, e149TreatmentHeader, e149BusLanes]),
    input(SOURCES.e149, "route", LOCAL_IDS.bx4, "Bx4", {
      route_id: "BX4",
      route_label: "Bx4",
      route_name: "Bx4",
      route_type: "local",
      service_variant: "local",
      borough: "Bronx",
      description: "Bx4 is explicitly listed in the East 149th Street project bus-service overview.",
    }, [e149Routes]),

    input(SOURCES.parkway, "source", LOCAL_IDS.parkwaySource, "Pelham Parkway reconstruction completion release", {
      title: "City Completes Second Phase of Pelham Parkway Reconstruction in the Bronx",
      publisher: "New York City Department of Design and Construction",
      source_type: "press_release",
      content_type: "press release",
      date_text: "December 27, 2023",
      source_url: "https://www.nyc.gov/site/ddc/about/press-releases/2023/pr-122723-Pelham.page",
      authority_tier: "agency_report",
    }, [parkwayTitle, parkwayCompletion]),
    input(SOURCES.parkway, "project", LOCAL_IDS.parkwayProject, "Pelham Parkway reconstruction, Boston Road–Stillwell Avenue", {
      project_name: "Pelham Parkway Reconstruction, Boston Road to Stillwell Avenue",
      project_type: "roadway reconstruction",
      project_family: "bus_priority",
      status: "completed",
      document_time_status: "implemented",
      borough: "Bronx",
      location_text: "Pelham Parkway from Boston Road to Stillwell Avenue",
      description: "Completed Pelham Parkway reconstruction with dedicated bus lanes and infrastructure improvements.",
    }, [parkwayTitle, parkwayCompletion, parkwayExtent]),
    input(SOURCES.parkway, "corridor", LOCAL_IDS.parkwayCorridor, "Pelham Parkway, Boston Road–Stillwell Avenue", {
      corridor_name: "Pelham Parkway, Boston Road to Stillwell Avenue",
      street: "Pelham Parkway",
      limits: "Boston Road to Stillwell Avenue",
      from: "Boston Road",
      to: "Stillwell Avenue",
      corridor_length_mi: 1.8,
      borough: "Bronx",
      description: "The bounded Pelham Parkway reconstruction corridor stated in the completion release.",
    }, [parkwayExtent]),
    input(SOURCES.parkway, "treatment_component", LOCAL_IDS.parkwayTreatment, "Pelham Parkway dedicated bus lanes", {
      treatment_kind: "dedicated bus lane",
      treatment_family: "bus_lane",
      location_text: "Pelham Parkway reconstruction corridor",
      description: "The completion release reports 1.7 miles of new dedicated bus lanes within the Pelham Parkway reconstruction.",
    }, [parkwayCompletion, parkwayRoute]),

    input(SOURCES.bay, "source", LOCAL_IDS.baySource, "Pelham Bay Park Station improvements completion release", {
      title: "NYC DOT and MTA Announce Major Improvements for Pedestrians and Bus Riders Completed at Pelham Bay Park Station in The Bronx",
      publisher: "New York City Department of Transportation",
      source_type: "press_release",
      content_type: "press release",
      date_text: "January 23, 2023",
      source_url: "https://www.nyc.gov/html/dot/html/pr2023/pelham-bay-station-improvements.shtml",
      authority_tier: "agency_report",
    }, [bayDate, bayTitle]),
    input(SOURCES.bay, "project", LOCAL_IDS.bayProject, "Pelham Bay Park Station Improvements", {
      project_name: "Pelham Bay Park Station Improvements",
      project_type: "bus station area improvements",
      project_family: "bus_priority",
      status: "completed",
      document_time_status: "implemented",
      borough: "Bronx",
      location_text: "Pelham Bay Park Station, Westchester Avenue and Wilkinson Avenue",
      description: "Completed pedestrian and bus-priority improvements at Pelham Bay Park Station.",
    }, [bayTitle, bayCompletion, bayTreatments]),
    input(SOURCES.bay, "treatment_component", LOCAL_IDS.bayWilkinsonTreatment, "Wilkinson Avenue bus lane at Pelham Bay Park Station", {
      treatment_kind: "bus lane",
      treatment_family: "bus_lane",
      location_text: "Wilkinson Avenue at Pelham Bay Park Station",
      description: "New bus lane on Wilkinson Avenue included in the Pelham Bay Park Station project.",
    }, [bayTreatments]),
    input(SOURCES.bay, "route", LOCAL_IDS.bx29, "Bx29", {
      route_id: "BX29",
      route_label: "Bx29",
      route_name: "Bx29",
      route_type: "local",
      service_variant: "local",
      borough: "Bronx",
      description: "Bx29 is explicitly listed among the routes serving Pelham Bay Park Station.",
    }, [bayRoutes]),

    input(SOURCES.w178, "source", LOCAL_IDS.w178Source, "West 178th Street project presentation", {
      title: "W 178 St (Ft Washington Ave to Wadsworth Ave)",
      publisher: "New York City Department of Transportation",
      source_type: "presentation",
      content_type: "community board presentation",
      date_text: "March 2020",
      source_url: "https://www.nyc.gov/html/dot/downloads/pdf/w178-st-ft-washington-ave-wadsworth-ave-cb12-mar2020.pdf",
      authority_tier: "agency_report",
    }, [w178Title, w178Date]),
    input(SOURCES.w178, "project", LOCAL_IDS.w178Project, "West 178th Street Improvements", {
      project_name: "West 178th Street Improvements",
      project_type: "street safety and bus access improvements",
      project_family: "bus_priority",
      status: "proposed",
      document_time_status: "proposed",
      borough: "Manhattan",
      location_text: "West 178th Street from Fort Washington Avenue to Wadsworth Avenue",
      description: "NYC DOT proposal for intersection, pedestrian, and bus-access improvements on West 178th Street.",
    }, [w178Title, w178Date, w178ExtentStart, w178ExtentMiddle, w178ExtentEnd]),
    input(SOURCES.w178, "corridor", LOCAL_IDS.w178Corridor, "West 178th Street, Fort Washington–Wadsworth Avenue", {
      corridor_name: "West 178th Street, Fort Washington Avenue to Wadsworth Avenue",
      street: "West 178th Street",
      limits: "Fort Washington Avenue to Wadsworth Avenue",
      from: "Fort Washington Avenue",
      to: "Wadsworth Avenue",
      corridor_length_mi: 0.2,
      borough: "Manhattan",
      description: "The bounded project corridor stated in the March 2020 NYC DOT presentation.",
    }, [w178ExtentStart, w178ExtentMiddle, w178ExtentEnd]),
    input(SOURCES.w178, "treatment_component", LOCAL_IDS.w178Treatment, "West 178th Street proposed bus-only lane", {
      treatment_kind: "bus-only lane",
      treatment_family: "bus_lane",
      location_text: "West 178th Street between Fort Washington Avenue and Wadsworth Avenue",
      description: "Proposed bus-only lane to formalize layover space and provide safe access to bus stops.",
    }, [w178LaneStart, w178LaneMiddle, w178LaneEnd]),
  ];

  inputs.push(
    relation(SOURCES.e149, GROUP_SCOPE_LOCALS["East 149th Street"][0]!, "East 149th Street project uses East 149th Street corridor", "uses_corridor", "corridor_scope", { localId: LOCAL_IDS.e149Project }, { id: IDS.e149Corridor }, "proposed", "2020-06-25", "The project is explicitly identified as the East 149th Street bus-priority project.", [e149Title, e149Routes]),
    relation(SOURCES.e149, GROUP_SCOPE_LOCALS["East 149th Street"][1]!, "East 149th Street project has proposed bus lanes", "has_treatment", "treatment_context", { localId: LOCAL_IDS.e149Project }, { localId: LOCAL_IDS.e149Treatment }, "proposed", "2020-06-25", "The project presentation lists bus lanes among its proposed treatments.", [e149Title, e149TreatmentHeader, e149BusLanes]),
    relation(SOURCES.e149, GROUP_SCOPE_LOCALS["East 149th Street"][2]!, "East 149th Street bus lanes located on East 149th Street corridor", "located_on_corridor", "corridor_scope", { localId: LOCAL_IDS.e149Treatment }, { id: IDS.e149Corridor }, "proposed", "2020-06-25", "The proposed bus-lane treatment is located within the East 149th Street project corridor.", [e149Title, e149TreatmentHeader, e149BusLanes]),

    relation(SOURCES.cb5, GROUP_SCOPE_LOCALS["CB5 University Avenue"][0]!, "Better Buses project has University Avenue south bus-lane study", "has_treatment", "treatment_context", { id: IDS.betterBusesProject }, { id: IDS.universitySouthTreatment }, "proposed", "2019-12-03", "The CB5 Better Buses presentation studies a bus-lane treatment on University Avenue south of Tremont Avenue.", [cb5Title, cb5Date, universityExtent, universitySouth]),
    relation(SOURCES.cb5, GROUP_SCOPE_LOCALS["CB5 University Avenue"][1]!, "Better Buses project has University Avenue north bus-lane study", "has_treatment", "treatment_context", { id: IDS.betterBusesProject }, { id: IDS.universityNorthTreatment }, "proposed", "2019-12-03", "The CB5 Better Buses presentation studies a shared bike/bus-lane treatment on University Avenue north of Tremont Avenue.", [cb5Title, cb5Date, universityExtent, universityNorth]),
    relation(SOURCES.cb5, GROUP_SCOPE_LOCALS["CB5 Washington Bridge"][0]!, "Better Buses project has Washington Bridge bus-lane study", "has_treatment", "treatment_context", { id: IDS.betterBusesProject }, { id: IDS.washingtonTreatment }, "proposed", "2019-12-03", "The CB5 Better Buses presentation studies bus lanes on Washington Bridge.", [cb5Title, cb5Date, washingtonExtent, washingtonTreatment]),

    relation(SOURCES.parkway, GROUP_SCOPE_LOCALS["Pelham Parkway"][0]!, "Pelham Parkway reconstruction uses Boston Road–Stillwell Avenue corridor", "uses_corridor", "corridor_scope", { localId: LOCAL_IDS.parkwayProject }, { localId: LOCAL_IDS.parkwayCorridor }, "delivered", "2023-12-27", "The completion release bounds the rebuilt Pelham Parkway corridor from Boston Road to Stillwell Avenue.", [parkwayTitle, parkwayExtent]),
    relation(SOURCES.parkway, GROUP_SCOPE_LOCALS["Pelham Parkway"][1]!, "Pelham Parkway reconstruction has dedicated bus lanes", "has_treatment", "treatment_context", { localId: LOCAL_IDS.parkwayProject }, { localId: LOCAL_IDS.parkwayTreatment }, "delivered", "2023-12-27", "The completion release reports 1.7 miles of new dedicated bus lanes.", [parkwayCompletion, parkwayRoute]),
    relation(SOURCES.parkway, GROUP_SCOPE_LOCALS["Pelham Parkway"][2]!, "Pelham Parkway dedicated bus lanes located on reconstruction corridor", "located_on_corridor", "corridor_scope", { localId: LOCAL_IDS.parkwayTreatment }, { localId: LOCAL_IDS.parkwayCorridor }, "delivered", "2023-12-27", "The bus lanes are located within the bounded Pelham Parkway reconstruction corridor; this relation does not assert lane endpoints equal the full project limits.", [parkwayExtent, parkwayCompletion, parkwayRoute]),

    relation(SOURCES.bay, GROUP_SCOPE_LOCALS["Pelham Bay"][0]!, "Pelham Bay project uses station-area corridor", "uses_corridor", "corridor_scope", { localId: LOCAL_IDS.bayProject }, { id: IDS.pelhamBayCorridor }, "delivered", "2023-01-23", "The improvements are explicitly located at Pelham Bay Park Station on Westchester and Wilkinson Avenues.", [bayTitle, bayCompletion, bayTreatments]),
    relation(SOURCES.bay, GROUP_SCOPE_LOCALS["Pelham Bay"][1]!, "Pelham Bay project has Westchester Avenue contraflow bus lane", "has_treatment", "treatment_context", { localId: LOCAL_IDS.bayProject }, { id: IDS.pelhamBayContraflowTreatment }, "delivered", "2023-01-23", "The completed project includes an eastbound contraflow bus-only lane on Westchester Avenue.", [bayTreatments]),
    relation(SOURCES.bay, GROUP_SCOPE_LOCALS["Pelham Bay"][2]!, "Pelham Bay project has Wilkinson Avenue bus lane", "has_treatment", "treatment_context", { localId: LOCAL_IDS.bayProject }, { localId: LOCAL_IDS.bayWilkinsonTreatment }, "delivered", "2023-01-23", "The completed project includes a new bus lane on Wilkinson Avenue.", [bayTreatments]),
    relation(SOURCES.bay, GROUP_SCOPE_LOCALS["Pelham Bay"][3]!, "Westchester Avenue contraflow lane located on Pelham Bay station corridor", "located_on_corridor", "corridor_scope", { id: IDS.pelhamBayContraflowTreatment }, { id: IDS.pelhamBayCorridor }, "delivered", "2023-01-23", "The Westchester Avenue contraflow lane is a treatment within the Pelham Bay Park Station project area.", [bayTitle, bayCompletion, bayTreatments]),
    relation(SOURCES.bay, GROUP_SCOPE_LOCALS["Pelham Bay"][4]!, "Wilkinson Avenue bus lane located on Pelham Bay station corridor", "located_on_corridor", "corridor_scope", { localId: LOCAL_IDS.bayWilkinsonTreatment }, { id: IDS.pelhamBayCorridor }, "delivered", "2023-01-23", "The Wilkinson Avenue bus lane is a treatment within the Pelham Bay Park Station project area.", [bayTitle, bayCompletion, bayTreatments]),

    relation(SOURCES.w178, GROUP_SCOPE_LOCALS["West 178th Street"][0]!, "West 178th Street project uses bounded project corridor", "uses_corridor", "corridor_scope", { localId: LOCAL_IDS.w178Project }, { localId: LOCAL_IDS.w178Corridor }, "proposed", "2020-03", "The presentation bounds the project to West 178th Street from Fort Washington Avenue to Wadsworth Avenue.", [w178Title, w178ExtentStart, w178ExtentMiddle, w178ExtentEnd]),
    relation(SOURCES.w178, GROUP_SCOPE_LOCALS["West 178th Street"][1]!, "West 178th Street project has proposed bus-only lane", "has_treatment", "treatment_context", { localId: LOCAL_IDS.w178Project }, { localId: LOCAL_IDS.w178Treatment }, "proposed", "2020-03", "The project proposes a bus-only lane across the bounded West 178th Street corridor.", [w178Title, w178LaneStart, w178LaneMiddle, w178LaneEnd]),
    relation(SOURCES.w178, GROUP_SCOPE_LOCALS["West 178th Street"][2]!, "West 178th Street bus-only lane located on bounded corridor", "located_on_corridor", "corridor_scope", { localId: LOCAL_IDS.w178Treatment }, { localId: LOCAL_IDS.w178Corridor }, "proposed", "2020-03", "The presentation explicitly locates the bus-only lane between Fort Washington Avenue and Wadsworth Avenue.", [w178ExtentStart, w178ExtentMiddle, w178ExtentEnd, w178LaneStart, w178LaneMiddle, w178LaneEnd]),
  );

  const groupProject = (group: CorridorGroup): { id?: string; localId?: string } => {
    if (group.startsWith("CB5")) return { id: IDS.betterBusesProject };
    if (group === "East 149th Street") return { localId: LOCAL_IDS.e149Project };
    if (group === "Pelham Parkway") return { localId: LOCAL_IDS.parkwayProject };
    if (group === "Pelham Bay") return { localId: LOCAL_IDS.bayProject };
    return { localId: LOCAL_IDS.w178Project };
  };
  const groupCorridor = (group: CorridorGroup): { id?: string; localId?: string } => {
    if (group === "CB5 University Avenue") return { id: IDS.universityCorridor };
    if (group === "CB5 Washington Bridge") return { id: IDS.washingtonCorridor };
    if (group === "East 149th Street") return { id: IDS.e149Corridor };
    if (group === "Pelham Parkway") return { localId: LOCAL_IDS.parkwayCorridor };
    if (group === "Pelham Bay") return { id: IDS.pelhamBayCorridor };
    return { localId: LOCAL_IDS.w178Corridor };
  };
  const groupDate = (group: CorridorGroup): string => {
    if (group.startsWith("CB5")) return "2019-12-03";
    if (group === "East 149th Street") return "2020-06-25";
    if (group === "Pelham Parkway") return "2023-12-27";
    if (group === "Pelham Bay") return "2023-01-23";
    return "2020-03";
  };
  const groupStatus = (group: CorridorGroup): "delivered" | "proposed" =>
    group === "Pelham Parkway" || group === "Pelham Bay" ? "delivered" : "proposed";
  const routeEvidence = (binding: BindingSpec): MtaEvidenceRef[] => {
    if (binding.group === "East 149th Street") return [e149Title, e149Routes];
    if (binding.group === "CB5 University Avenue") return [cb5Title, cb5Date, universityExtent, universityRoutes];
    if (binding.group === "CB5 Washington Bridge") return [cb5Title, cb5Date, washingtonExtent, washingtonRoutes, washingtonTreatment];
    if (binding.group === "Pelham Parkway") return [parkwayExtent, parkwayRoute];
    if (binding.group === "Pelham Bay") return [bayTitle, bayCompletion, bayRoutes];
    return [w178Title, w178ExtentStart, w178ExtentMiddle, w178ExtentEnd, w178RoutesStart, w178RoutesEnd];
  };

  for (const binding of BINDINGS) {
    const routeEndpoint = binding.routeLocalId ? { localId: binding.routeLocalId } : { id: binding.routeRecordId };
    inputs.push(relation(
      binding.sourceId,
      binding.projectServesLocalId,
      `${binding.group} project serves ${binding.registryRouteId}`,
      "serves_route",
      "route_scope",
      groupProject(binding.group),
      routeEndpoint,
      groupStatus(binding.group),
      groupDate(binding.group),
      `The official source explicitly identifies ${binding.registryRouteId} in the ${binding.group} project or station context.`,
      routeEvidence(binding),
    ));
    if (binding.routeCorridorAction === "added") {
      inputs.push(relation(
        binding.sourceId,
        binding.routeCorridorLocalId!,
        `${binding.registryRouteId} operates on ${binding.group} corridor`,
        "operates_on_corridor",
        "corridor_scope",
        routeEndpoint,
        groupCorridor(binding.group),
        groupStatus(binding.group),
        groupDate(binding.group),
        `The official source explicitly places ${binding.registryRouteId} in the bounded ${binding.group} corridor context.`,
        routeEvidence(binding),
      ));
    }
  }
  return inputs;
}

function buildCampaign(): Campaign {
  assertCanonicalInputs();
  const submissions = buildInputs().map(deterministicEntry);
  const recordIdByLocal = new Map(
    submissions.map((entry) => [entry.tool_args.local_observation_id, canonicalRecordIdForInput(entry.tool_args)]),
  );
  const recordId = (localId: string): string => {
    const id = recordIdByLocal.get(localId);
    if (!id) throw new Error(`missing generated record ${localId}`);
    return id;
  };
  const relationIds = (locals: string[]): string[] => locals.map(recordId).sort();
  const physicalScope = readPhysicalScopeRelations();

  const groupEndpoints = (group: CorridorGroup): {
    projectId: string;
    treatmentIds: string[];
    corridorId: string;
    recordsAdded: string[];
    stagedSourceIds: string[];
    coordinatedPhysical: string[];
  } => {
    if (group === "East 149th Street") return {
      projectId: recordId(LOCAL_IDS.e149Project),
      treatmentIds: [recordId(LOCAL_IDS.e149Treatment)],
      corridorId: IDS.e149Corridor,
      recordsAdded: [recordId(LOCAL_IDS.e149Source), recordId(LOCAL_IDS.e149Project), recordId(LOCAL_IDS.e149Treatment)],
      stagedSourceIds: [SOURCES.e149],
      coordinatedPhysical: [],
    };
    if (group === "CB5 University Avenue") return {
      projectId: IDS.betterBusesProject,
      treatmentIds: [IDS.universityNorthTreatment, IDS.universitySouthTreatment].sort(),
      corridorId: IDS.universityCorridor,
      recordsAdded: [],
      stagedSourceIds: [SOURCES.cb5],
      coordinatedPhysical: [
        physicalScope.get(IDS.universityNorthTreatment)!.relationId,
        physicalScope.get(IDS.universitySouthTreatment)!.relationId,
      ].sort(),
    };
    if (group === "CB5 Washington Bridge") return {
      projectId: IDS.betterBusesProject,
      treatmentIds: [IDS.washingtonTreatment],
      corridorId: IDS.washingtonCorridor,
      recordsAdded: [],
      stagedSourceIds: [SOURCES.cb5],
      coordinatedPhysical: [physicalScope.get(IDS.washingtonTreatment)!.relationId],
    };
    if (group === "Pelham Parkway") return {
      projectId: recordId(LOCAL_IDS.parkwayProject),
      treatmentIds: [recordId(LOCAL_IDS.parkwayTreatment)],
      corridorId: recordId(LOCAL_IDS.parkwayCorridor),
      recordsAdded: [
        recordId(LOCAL_IDS.parkwaySource), recordId(LOCAL_IDS.parkwayProject),
        recordId(LOCAL_IDS.parkwayTreatment), recordId(LOCAL_IDS.parkwayCorridor),
      ],
      stagedSourceIds: [SOURCES.parkway],
      coordinatedPhysical: [],
    };
    if (group === "Pelham Bay") return {
      projectId: recordId(LOCAL_IDS.bayProject),
      treatmentIds: [IDS.pelhamBayContraflowTreatment, recordId(LOCAL_IDS.bayWilkinsonTreatment)].sort(),
      corridorId: IDS.pelhamBayCorridor,
      recordsAdded: [recordId(LOCAL_IDS.baySource), recordId(LOCAL_IDS.bayProject), recordId(LOCAL_IDS.bayWilkinsonTreatment)],
      stagedSourceIds: [SOURCES.bay],
      coordinatedPhysical: [],
    };
    return {
      projectId: recordId(LOCAL_IDS.w178Project),
      treatmentIds: [recordId(LOCAL_IDS.w178Treatment)],
      corridorId: recordId(LOCAL_IDS.w178Corridor),
      recordsAdded: [
        recordId(LOCAL_IDS.w178Source), recordId(LOCAL_IDS.w178Project),
        recordId(LOCAL_IDS.w178Treatment), recordId(LOCAL_IDS.w178Corridor),
      ],
      stagedSourceIds: [SOURCES.w178],
      coordinatedPhysical: [],
    };
  };

  const candidateActions: BronxCandidateAction[] = BINDINGS.map((binding) => {
    const group = groupEndpoints(binding.group);
    const added = [
      ...relationIds(GROUP_SCOPE_LOCALS[binding.group]),
      recordId(binding.projectServesLocalId),
      ...(binding.routeCorridorAction === "added" ? [recordId(binding.routeCorridorLocalId!)] : []),
    ].sort();
    const verified = [
      ...GROUP_VERIFIED_RELATIONS[binding.group],
      ...(binding.existingRouteCorridorRelationId ? [binding.existingRouteCorridorRelationId] : []),
    ].sort();
    return {
      candidate_id: binding.candidateId,
      registry_route_id: binding.registryRouteId,
      canonical_gtfs_route_id: binding.canonicalGtfsRouteId,
      canonical_route_record_id: binding.routeRecordId,
      corridor_group: binding.group,
      project_id: group.projectId,
      treatment_ids: group.treatmentIds,
      corridor_id: group.corridorId,
      route_corridor_action: binding.routeCorridorAction,
      generic_linkage_reconciled: true,
      canonical_links_added: added,
      canonical_links_verified_existing: verified,
      coordinated_physical_scope_relation_ids: group.coordinatedPhysical,
      canonical_records_added: [
        ...group.recordsAdded,
        ...(binding.routeLocalId ? [recordId(binding.routeLocalId)] : []),
      ].sort(),
      staged_source_ids: group.stagedSourceIds,
      study_projection_eligible: false,
      remaining_unsupported_claims: [...UNSUPPORTED_CLAIMS],
    };
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));

  const uniqueAddedLinks = [...new Set(candidateActions.flatMap((action) => action.canonical_links_added))].sort();
  const uniqueVerifiedLinks = [...new Set(candidateActions.flatMap((action) => action.canonical_links_verified_existing))].sort();
  const uniqueCoordinatedLinks = [
    ...new Set(candidateActions.flatMap((action) => action.coordinated_physical_scope_relation_ids)),
  ].sort();
  const journalText = `${submissions.map((entry) => JSON.stringify(entry)).join("\n")}\n`;

  const sourceSpecs = [
    {
      sourceId: SOURCES.e149,
      acquisitionId: "e149_cb1",
      fileName: "source.pdf",
      url: "https://www.nyc.gov/html/brt/downloads/pdf/e149th-st-cb1-jun2020.pdf",
      acquisitionSha256: "80072ca715d6f60900a3fe851128458162f8730565f9c38a82357a0006622d02",
      acquisitionBytes: 41_291_476,
      status: "staged_identical_to_acquisition",
      cited: ["p001_p0001", "p001_p0002", "p004_p0003", "p013_p0001", "p013_p0002"],
    },
    {
      sourceId: SOURCES.cb5,
      acquisitionId: "bronx_cb5_priority_2019",
      fileName: "source.pdf",
      url: "https://www.nyc.gov/html/brt/downloads/pdf/bx-cb5-projects-dec032019.pdf",
      acquisitionSha256: "0e43255dc5a37106de9c7805e7eb1db80289141bb3937870a3d31264fcb552bc",
      acquisitionBytes: 5_088_842,
      status: "reused_existing_staged_source_identical_to_acquisition",
      cited: [
        "p001_c0001", "p001_c0002", "p013_c0002", "p013_c0003", "p015_c0006", "p016_c0006",
        "p020_c0002", "p020_c0003", "p023_c0006",
      ],
    },
    {
      sourceId: SOURCES.parkway,
      acquisitionId: "pelham_parkway_completion",
      fileName: "source.html",
      url: "https://www.nyc.gov/site/ddc/about/press-releases/2023/pr-122723-Pelham.page",
      acquisitionSha256: "9a0811b58f4755a8638e8cb3e1bf5531e488f5fc05ef157ef16d7fee1246943e",
      acquisitionBytes: 33_178,
      status: "dynamic_official_html_reacquired_and_staged_with_both_hashes_retained",
      cited: ["p001_b0018", "p001_b0023", "p001_b0027", "p001_b0028"],
    },
    {
      sourceId: SOURCES.bay,
      acquisitionId: "pelham_bay_completion",
      fileName: "source.html",
      url: "https://www.nyc.gov/html/dot/html/pr2023/pelham-bay-station-improvements.shtml",
      acquisitionSha256: "cfdaa4b25d03f9057419906d820af31e011924799c731e6557f9124752303d98",
      acquisitionBytes: 26_838,
      status: "dynamic_official_html_reacquired_and_staged_with_both_hashes_retained",
      cited: ["p001_b0010", "p001_b0012", "p001_b0016", "p001_b0019", "p001_b0025"],
    },
    {
      sourceId: SOURCES.w178,
      acquisitionId: "w178_cb12",
      fileName: "source.pdf",
      url: "https://www.nyc.gov/html/dot/downloads/pdf/w178-st-ft-washington-ave-wadsworth-ave-cb12-mar2020.pdf",
      acquisitionSha256: "431fe0b4105561eb4ce0c241245a276ee56b07c6bf810be5cd7a6eee36a94209",
      acquisitionBytes: 4_455_944,
      status: "staged_identical_to_acquisition",
      cited: [
        "p001_p0001", "p001_p0002", "p002_p0002", "p002_p0003", "p002_p0004",
        "p002_p0012", "p002_p0013", "p009_p0016", "p009_p0017", "p009_p0019",
      ],
    },
  ];
  const sourceVerification: JsonObject = {
    schema_version: 1,
    verified_at: REVIEWED_AT,
    supported_candidates: {
      path: relative(repoRoot, SUPPORTED_CANDIDATES_PATH),
      prior_sha256: PRIOR_SUPPORTED_CANDIDATES_SHA256,
      corrected_sha256: SUPPORTED_CANDIDATES_SHA256,
      prior_row_count: 14,
      corrected_row_count: 13,
      rejected_route_variant_candidate_id: BX12_LOCAL_VARIANT_CANDIDATE_ID,
    },
    sources: sourceSpecs.map((spec) => {
      const sourceDir = join(repoRoot, "raw", "sources", spec.sourceId);
      const sourcePath = join(sourceDir, spec.fileName);
      const blocksPath = join(sourceDir, "blocks.jsonl");
      const metadataPath = join(sourceDir, "metadata.json");
      return {
        source_id: spec.sourceId,
        acquisition_source_id: spec.acquisitionId,
        canonical_staged_source_id: spec.sourceId,
        status: spec.status,
        url: spec.url,
        acquisition_sha256: spec.acquisitionSha256,
        acquisition_byte_length: spec.acquisitionBytes,
        staged_byte_sha256: sha256Bytes(sourcePath),
        staged_byte_length: readFileSync(sourcePath).byteLength,
        staged_metadata_sha256: sha256Bytes(metadataPath),
        staged_blocks_sha256: sha256Bytes(blocksPath),
        staged_block_count: stagedBlocks(spec.sourceId).length,
        cited_block_ids: spec.cited,
      };
    }),
    coordinated_physical_scope_journal: {
      path: relative(repoRoot, PHYSICAL_SCOPE_JOURNAL_PATH),
      sha256: PHYSICAL_SCOPE_JOURNAL_SHA256,
      relation_ids: uniqueCoordinatedLinks,
      note: "Read-only coordination dependency; accepted CB5 treatment-to-corridor entries are referenced and not duplicated.",
    },
  };

  const summary: JsonObject = {
    schema_version: 1,
    run_id: RUN_ID,
    reviewed_at: REVIEWED_AT,
    acquisition_supported_before_precision_correction: 14,
    acquisition_supported_after_precision_correction: 13,
    exact_supported_candidate_count: candidateActions.length,
    exact_supported_candidate_ids: candidateActions.map((action) => action.candidate_id),
    route_variant_precision_rejected_count: 1,
    route_variant_precision_rejected_candidate_ids: [BX12_LOCAL_VARIANT_CANDIDATE_ID],
    generic_linkages_reconciled: candidateActions.length,
    route_corridor_binding_counts: {
      verified_existing: candidateActions.filter((action) => action.route_corridor_action === "verified_existing").length,
      added: candidateActions.filter((action) => action.route_corridor_action === "added").length,
      after_reconciliation: candidateActions.length,
    },
    submission_count: submissions.length,
    source_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "source").length,
    project_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "project").length,
    corridor_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "corridor").length,
    treatment_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "treatment_component").length,
    route_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "route").length,
    relation_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "relation").length,
    canonical_relation_ids_added: uniqueAddedLinks,
    canonical_relation_ids_verified_existing: uniqueVerifiedLinks,
    coordinated_physical_scope_relation_ids: uniqueCoordinatedLinks,
    operational_occurrence_additions: 0,
    candidate_segment_bindings_added: 0,
    candidate_phase_additions: 0,
    candidate_onset_additions: 0,
    all_candidates_study_projection_eligible: false,
    journal_sha256: sha256Text(journalText),
  };

  const report = [
    "# Bronx supported-linkage remediation",
    "",
    `Run: \`${RUN_ID}\``,
    "",
    "The acquisition evidence was rechecked at exact route-variant precision before canonical submission. The official Pelham Parkway release names BX12 Select Bus Service (BX12+), so the distinct BX12 local registry row was removed from the supported set and retained as completed-search route-linkage-unresolved.",
    "",
    "## Exact outcome",
    "",
    `- Frozen supports before precision correction: ${summary.acquisition_supported_before_precision_correction}`,
    `- Exact supports after correction: ${summary.acquisition_supported_after_precision_correction}`,
    `- Exact generic linkages implemented or verified: ${summary.generic_linkages_reconciled}`,
    `- Route–corridor links added: ${(summary.route_corridor_binding_counts as JsonObject).added}`,
    `- Route–corridor links verified existing: ${(summary.route_corridor_binding_counts as JsonObject).verified_existing}`,
    `- Canonical submissions: ${summary.submission_count} (${summary.relation_additions} relations)`,
    `- Operational occurrences, candidate phases, candidate onsets, or registry segment bindings added: 0`,
    "",
    "## Candidate actions",
    "",
    "| Candidate | Route | Corridor group | Route–corridor action |",
    "|---|---|---|---|",
    ...candidateActions.map((action) => `| \`${action.candidate_id}\` | ${action.registry_route_id} | ${action.corridor_group} | ${action.route_corridor_action} |`),
    "",
    "The rejected BX12-local row remains non-projectable. All 13 linked rows also remain non-projectable because exact historical segment, stable phase, candidate onset, and canonical occurrence identity are still unsupported.",
    "",
    "## Reproduction",
    "",
    "```bash",
    "bun data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquire.ts --check",
    "bun scripts/remediate-bronx-acquisition-linkages.ts",
    "bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquire.test.ts packages/pipeline/test/records/bronx-acquisition-linkage-remediation.test.ts",
    "```",
    "",
  ].join("\n");
  return { submissions, candidateActions, summary, sourceVerification, report };
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
    if (readFileSync(path, "utf8") !== expected) throw new Error(`generated artifact differs: ${path}; run with --apply`);
  }
}

export function buildBronxAcquisitionLinkageCampaign(): Campaign {
  return buildCampaign();
}

export function bronxAcquisitionCandidateActions(): BronxCandidateAction[] {
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
    exact_candidates: campaign.candidateActions.length,
    route_bindings_added: (campaign.summary.route_corridor_binding_counts as JsonObject).added as JsonValue,
    route_bindings_verified_existing: (campaign.summary.route_corridor_binding_counts as JsonObject).verified_existing as JsonValue,
    journal_sha256: campaign.summary.journal_sha256 as JsonValue,
  })}\n`);
}
