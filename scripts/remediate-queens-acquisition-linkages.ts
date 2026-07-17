import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

const RUN_ID = "2026-07-15T18-00-00-000Z_queens-acquisition-linkage-remediation";
const REVIEWED_AT = "2026-07-15T18:00:00.000Z";
const JOURNAL_PATH = join(repoRoot, "data", "submissions", `${RUN_ID}.jsonl`);
const ARTIFACT_ROOT = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "queens",
  "linkage-remediation",
);
const SUMMARY_PATH = join(ARTIFACT_ROOT, "summary.json");
const ACTIONS_PATH = join(ARTIFACT_ROOT, "candidate-actions.json");
const SOURCE_VERIFICATION_PATH = join(ARTIFACT_ROOT, "source-verification.json");

const DOT_21ST_SOURCE = "nyc_dot_21st_street_bus_priority_completion_2022";
const Q1_SOURCE = "mta_q1_hillside_route_profile_2025";
const ROCKAWAY_SOURCE = "rockaway_beach_blvd_jun2019";
const STREETS_SOURCE = "streets_plan_update_2026";

const IDS = {
  project21st: "project_21st-street-bus-priority",
  treatment21st: "treatment_21st-st-bus-lane",
  corridor21st: "corridor_21st-street-queens",
  routeQ103: "route_q103-reroute-20250821",
  projectHillside: "project_hillside-ave-bus-lanes",
  corridorHillside: "corridor_hillside-ave-queens",
  routeQ1: "route_q1-queens",
  projectRockaway: "project_18-rockaway-beach-blvd",
  corridorRockaway: "corridor_rockaway-beach-blvd",
  routeQ22: "route_q22-queens",
  routeQ52: "route_q52-sbs-queens",
  routeQ53: "route_q53-sbs-ace",
  rockawayTreatments: [
    "treatment_rockaway-2-bus-lane-24-7",
    "treatment_rockaway-3-bus-lane-peak",
    "treatment_rockaway-5-bus-lane-24-7",
    "treatment_rockaway-6-sb-bus-lane",
  ],
} as const;

const CANDIDATES = {
  q103: "study-event-v2:2903c93577f1e07b34fa218c",
  q22: "study-event-v2:8483f8b099d292e9d6883859",
  q53: "study-event-v2:a1e55641545033df387b70b1",
  q1: "study-event-v2:d1cc616281e5031091c4b8e9",
  q52: "study-event-v2:df8bb7f9438c48166f1ff8b9",
} as const;

export type CandidateAction = {
  candidate_id: string;
  canonical_links_added: string[];
  canonical_records_added: string[];
  canonical_records_updated: string[];
  staged_source_ids: string[];
  study_projection_eligible: false;
  remaining_unsupported_claims: string[];
};

type Campaign = {
  submissions: MtaSubmissionEntry[];
  candidateActions: CandidateAction[];
  summary: JsonObject;
  sourceVerification: JsonObject;
};

function sha256Bytes(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function quoteInText(quote: string, text: string): boolean {
  const normalized = (value: string) => value.replace(/\s+/gu, " ").trim();
  return normalized(text).includes(normalized(quote));
}

function stagedBlock(sourceId: string, blockId: string): StagedSourceBlock {
  const path = join(repoRoot, "raw", "sources", sourceId, "blocks.jsonl");
  const block = readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StagedSourceBlock)
    .find((entry) => entry.block_id === blockId);
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

function publicSourceBlock(sourceId: string, blockId: string): string {
  const path = join(repoRoot, "wiki", "sources", `${sourceId}.md`);
  const line = readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .find((candidate) => candidate.includes(`[${blockId}]`));
  if (!line) throw new Error(`missing public source block ${sourceId}#${blockId}`);
  const marker = line.indexOf(`[${blockId}]`);
  return line.slice(marker + blockId.length + 2).trim();
}

function publicEvidence(
  sourceId: string,
  blockId: string,
  pageNumber: number,
  expectedHash: string,
  role: string,
  quote?: string,
): MtaEvidenceRef {
  const rawText = publicSourceBlock(sourceId, blockId);
  const actualHash = `sha256:${createHash("sha256").update(rawText).digest("hex")}`;
  if (actualHash !== expectedHash) {
    throw new Error(`public source block hash mismatch for ${sourceId}#${blockId}: expected ${expectedHash}, found ${actualHash}`);
  }
  if (quote && !quoteInText(quote, rawText)) throw new Error(`quote missing from ${sourceId}#${blockId}`);
  return {
    source_id: sourceId,
    evidence_id: `${sourceId}#${blockId}`,
    source_path: `raw/sources/${sourceId}/blocks.jsonl`,
    page_number: pageNumber,
    block_id: blockId,
    text_sha256: expectedHash,
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

function relationRecordId(localObservationId: string, submissions: MtaSubmissionEntry[]): string {
  const entry = submissions.find((candidate) => candidate.tool_args.local_observation_id === localObservationId);
  if (!entry) throw new Error(`missing generated relation ${localObservationId}`);
  return canonicalRecordIdForInput(entry.tool_args);
}

function assertCanonicalInputs(): void {
  const records = readCanonicalRecordsFromJsonl();
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const expected: Array<[string, MtaCanonicalRecord["record_kind"]]> = [
    [IDS.project21st, "project"],
    [IDS.treatment21st, "treatment_component"],
    [IDS.corridor21st, "corridor"],
    [IDS.routeQ103, "route"],
    [IDS.projectHillside, "project"],
    [IDS.corridorHillside, "corridor"],
    [IDS.routeQ1, "route"],
    [IDS.projectRockaway, "project"],
    [IDS.corridorRockaway, "corridor"],
    [IDS.routeQ22, "route"],
    [IDS.routeQ52, "route"],
    [IDS.routeQ53, "route"],
    ...IDS.rockawayTreatments.map((id) => [id, "treatment_component"] as [string, "treatment_component"]),
  ];
  for (const [id, kind] of expected) {
    const record = byId.get(id);
    if (!record) throw new Error(`missing required canonical endpoint ${id}`);
    if (record.record_kind !== kind) throw new Error(`canonical endpoint ${id} is ${record.record_kind}, expected ${kind}`);
  }
}

function buildInputs(): MtaSubmitObservationInput[] {
  const dotTitle = stagedEvidence(
    DOT_21ST_SOURCE,
    "p001_b0012",
    "title",
    "Buses For Queens: DOT and MTA Announce Completion of Major Bus-Priority Project in Long Island City and Astoria",
  );
  const dotDate = stagedEvidence(DOT_21ST_SOURCE, "p001_b0010", "publication_date", "September 29, 2022");
  const dotLanes = stagedEvidence(DOT_21ST_SOURCE, "p001_b0015", "treatment_scope", "new bus lanes along 21st Street in western Queens");
  const dotRoutes = stagedEvidence(
    DOT_21ST_SOURCE,
    "p001_b0023",
    "route_scope",
    "the Q102 and Q103 run on 21st Street for one block each",
  );
  const q1Identity = stagedEvidence(Q1_SOURCE, "p001_p0002", "route_identity", "Q1");
  const q1Effective = stagedEvidence(Q1_SOURCE, "p001_p0004", "effective_date", "CHANGES TAKE EFFECT JUNE 29, 2025");
  const q1Hillside = stagedEvidence(Q1_SOURCE, "p001_p0005", "corridor_scope", "The Q1 will be extended west along Hillside Av to Sutphin Blvd.");
  const streetsHillside = publicEvidence(
    STREETS_SOURCE,
    "p002_c0006",
    2,
    "sha256:5fdeec76f018e8abdc28619fa5ff9ff41448d74c039607aafb8773d4ccd863e7",
    "treatment_scope",
    "bus lanes on Hillside Avenue in eastern Queens",
  );
  const rockawayTitle = publicEvidence(
    ROCKAWAY_SOURCE,
    "p001_c0002",
    1,
    "sha256:4a61e05662a4c0076ed6ca0ebfe7a4ae6865a633e8ef319bbbeb89f73ebfad08",
    "project_identity",
    "Rockaway Beach Boulevard Improvements",
  );
  const rockawayCorridor = publicEvidence(
    ROCKAWAY_SOURCE,
    "p005_c0002",
    5,
    "sha256:a6838d4336d194e58c98e8fb6a912bc6d85caff9986c48967914032e69ce6675",
    "corridor_scope",
    "Rockaway Beach Blvd services the primary east-west transit connections in the Rockaways",
  );
  const rockawayRoutes = publicEvidence(
    ROCKAWAY_SOURCE,
    "p010_c0005",
    10,
    "sha256:21788a5bb648c805ee0633933cc87d38026b965fee2f84403874402e3505ece5",
    "route_scope",
    "Q22, Q52 SBS, Q53 SBS, QM16, QM17",
  );
  const rockawayTreatmentEvidence = [
    publicEvidence(ROCKAWAY_SOURCE, "p015_c0004", 15, "sha256:41cf7be450c79817a3220582d40bf70e4e90493aa40eee66f9d174ac072c9b13", "treatment_scope", "Add eastbound bus lane (24/7)"),
    publicEvidence(ROCKAWAY_SOURCE, "p020_c0006", 20, "sha256:d36061f4a3ac49d00a9e5fb169b38b76d9e5c75a0a4ec44d20a580da477b7342", "treatment_scope", "Add eastbound bus lane"),
    publicEvidence(ROCKAWAY_SOURCE, "p026_c0003", 26, "sha256:41cf7be450c79817a3220582d40bf70e4e90493aa40eee66f9d174ac072c9b13", "treatment_scope", "Add eastbound bus lane (24/7)"),
    publicEvidence(ROCKAWAY_SOURCE, "p029_c0004", 29, "sha256:d815d03eedfec3583f7520b7e2bb0a52f0ae0d921cb445dd5b21257aa0bf6703", "treatment_scope", "Add southbound bus lane (24/7)"),
  ];

  const inputs: MtaSubmitObservationInput[] = [
    input(DOT_21ST_SOURCE, "source", `source_${DOT_21ST_SOURCE}`, "NYC DOT 21st Street Bus Priority completion release", {
      title: "Buses For Queens: DOT and MTA Announce Completion of Major Bus-Priority Project in Long Island City and Astoria",
      publisher: "NYC Department of Transportation",
      content_type: "press release",
      source_url: "https://www.nyc.gov/html/dot/html/pr2022/buses-for-queens.shtml",
      date_text: "September 29, 2022",
      description: "Official completion release for the 21st Street Bus Priority Project in Queens.",
      authority_tier: "agency_report",
    }, [dotTitle, dotDate]),
    input(Q1_SOURCE, "source", `source_${Q1_SOURCE}`, "MTA Q1 Hillside Avenue route profile", {
      title: "Queens Bus Network Redesign Q1 Hillside Avenue Route Profile",
      publisher: "Metropolitan Transportation Authority",
      content_type: "route profile",
      source_url: "https://www.mta.info/document/81901",
      description: "Official MTA Q1 route profile; the page states that route changes take effect June 29, 2025.",
      authority_tier: "agency_report",
    }, [q1Identity, q1Effective]),
    input(DOT_21ST_SOURCE, "project", "project_21st_street_bus_priority_completion_2022", "21st Street Bus Priority Project", {
      project_name: "21st Street Bus Priority Project",
      project_type: "bus priority",
      status: "completed",
      document_time_status: "implemented",
      project_family: "bus_priority",
      borough: "Queens",
      date_text: "September 29, 2022",
      description: "NYC DOT announced completion of new bus lanes along 21st Street from Long Island City to Astoria.",
    }, [dotTitle, dotLanes], { targetRecordId: IDS.project21st }),
    input(Q1_SOURCE, "route", "route_q1_hillside_profile_2025", "Q1 Hillside Avenue", {
      route_id: "Q1",
      route_name: "Q1",
      route_type_normalized: "bus",
      service_variant: "local",
      borough: "Queens",
      description: "Q1 route profile identifying service on Hillside Avenue.",
    }, [q1Identity, q1Hillside], { targetRecordId: IDS.routeQ1 }),
    input(STREETS_SOURCE, "treatment_component", "treatment_hillside_avenue_bus_lanes_2025", "Hillside Avenue bus lanes", {
      treatment_kind: "bus lanes",
      treatment_family: "bus_lane",
      location_text: "Hillside Avenue in eastern Queens",
      date_text: "2025",
      description: "Bus lanes on Hillside Avenue in eastern Queens, completed in 2025.",
    }, [streetsHillside]),
  ];

  const hillsideTreatmentLocal = "treatment_hillside_avenue_bus_lanes_2025";
  inputs.push(
    relation(STREETS_SOURCE, "relation_hillside_project_has_bus_lane_treatment_2025", "Hillside Avenue project has bus-lane treatment", "has_treatment", "treatment_context", { id: IDS.projectHillside }, { localId: hillsideTreatmentLocal }, "delivered", "2025", "The completed Hillside Avenue project includes bus lanes.", [streetsHillside]),
    relation(STREETS_SOURCE, "relation_hillside_bus_lane_treatment_located_on_corridor_2025", "Hillside Avenue bus lanes located on Hillside Avenue corridor", "located_on_corridor", "corridor_scope", { localId: hillsideTreatmentLocal }, { id: IDS.corridorHillside }, "delivered", "2025", "The bus-lane treatment is located on Hillside Avenue in eastern Queens.", [streetsHillside]),
    relation(Q1_SOURCE, "relation_q1_operates_on_hillside_corridor_2025", "Q1 operates on Hillside Avenue", "operates_on_corridor", "corridor_scope", { id: IDS.routeQ1 }, { id: IDS.corridorHillside }, "delivered", "2025-06-29", "The official Q1 profile identifies Hillside Avenue service and a westward extension along Hillside Avenue.", [q1Identity, q1Hillside, q1Effective]),
    relation(DOT_21ST_SOURCE, "relation_21st_project_has_bus_lane_treatment_completion_2022", "21st Street project has bus-lane treatment", "has_treatment", "treatment_context", { id: IDS.project21st }, { id: IDS.treatment21st }, "delivered", "2022-09-29", "The completed 21st Street Bus Priority Project includes new bus lanes.", [dotTitle, dotLanes]),
    relation(DOT_21ST_SOURCE, "relation_21st_bus_lane_treatment_located_on_corridor_2022", "21st Street bus lanes located on 21st Street corridor", "located_on_corridor", "corridor_scope", { id: IDS.treatment21st }, { id: IDS.corridor21st }, "delivered", "2022-09-29", "The new bus lanes are located along 21st Street in western Queens.", [dotLanes]),
    relation(DOT_21ST_SOURCE, "relation_21st_project_serves_q103_2022", "21st Street Bus Priority Project serves Q103", "serves_route", "route_scope", { id: IDS.project21st }, { id: IDS.routeQ103 }, "delivered", "2022-09-29", "The completed bus-priority corridor includes one block used by Q103.", [dotTitle, dotRoutes]),
    relation(DOT_21ST_SOURCE, "relation_q103_operates_on_21st_street_corridor_2022", "Q103 operates on one block of 21st Street", "operates_on_corridor", "corridor_scope", { id: IDS.routeQ103 }, { id: IDS.corridor21st }, "delivered", "2022-09-29", "The Q103 runs on 21st Street for one block.", [dotRoutes]),
    relation(ROCKAWAY_SOURCE, "relation_rockaway_project_uses_rockaway_beach_corridor_2019", "Rockaway Beach Boulevard Improvements uses Rockaway Beach Boulevard corridor", "uses_corridor", "corridor_scope", { id: IDS.projectRockaway }, { id: IDS.corridorRockaway }, "proposed", "2019-06-03", "The improvement project is scoped to Rockaway Beach Boulevard.", [rockawayTitle, rockawayCorridor]),
  );

  for (const [index, treatmentId] of IDS.rockawayTreatments.entries()) {
    const suffix = ["b108-b102", "b102-b94", "b73-b67", "b59"][index]!;
    const treatmentEvidence = rockawayTreatmentEvidence[index]!;
    inputs.push(
      relation(ROCKAWAY_SOURCE, `relation_rockaway_project_has_bus_lane_${suffix}_2019`, `Rockaway project has ${suffix} bus-lane treatment`, "has_treatment", "treatment_context", { id: IDS.projectRockaway }, { id: treatmentId }, "proposed", "2019-06-03", "The Rockaway Beach Boulevard presentation includes this proposed bus-lane component.", [rockawayTitle, treatmentEvidence]),
      relation(ROCKAWAY_SOURCE, `relation_rockaway_bus_lane_${suffix}_located_on_corridor_2019`, `Rockaway ${suffix} bus lane located on corridor`, "located_on_corridor", "corridor_scope", { id: treatmentId }, { id: IDS.corridorRockaway }, "proposed", "2019-06-03", "The bus-lane component is located on Rockaway Beach Boulevard.", [rockawayCorridor, treatmentEvidence]),
    );
  }

  for (const [routeLabel, routeId] of [["q52", IDS.routeQ52], ["q53", IDS.routeQ53]] as const) {
    inputs.push(
      relation(ROCKAWAY_SOURCE, `relation_rockaway_project_serves_${routeLabel}_2019`, `Rockaway project serves ${routeLabel.toUpperCase()}`, "serves_route", "route_scope", { id: IDS.projectRockaway }, { id: routeId }, "proposed", "2019-06-03", `The presentation lists ${routeLabel.toUpperCase()} SBS among routes operating on the corridor.`, [rockawayTitle, rockawayRoutes]),
    );
  }
  for (const [routeLabel, routeId] of [["q22", IDS.routeQ22], ["q52", IDS.routeQ52], ["q53", IDS.routeQ53]] as const) {
    inputs.push(
      relation(ROCKAWAY_SOURCE, `relation_${routeLabel}_operates_on_rockaway_beach_corridor_2019`, `${routeLabel.toUpperCase()} operates on Rockaway Beach Boulevard`, "operates_on_corridor", "corridor_scope", { id: routeId }, { id: IDS.corridorRockaway }, "delivered", "2019-06-03", `The presentation lists ${routeLabel.toUpperCase()} among routes operating on sections of Rockaway Beach Boulevard.`, [rockawayCorridor, rockawayRoutes]),
    );
  }
  return inputs;
}

function buildCampaign(): Campaign {
  assertCanonicalInputs();
  const submissions = buildInputs().map(deterministicEntry);
  const relationIds = new Map(
    submissions
      .filter((entry) => entry.tool_args.observation_kind === "relation")
      .map((entry) => [entry.tool_args.local_observation_id, canonicalRecordIdForInput(entry.tool_args)]),
  );
  const relationId = (localId: string) => relationIds.get(localId) ?? relationRecordId(localId, submissions);
  const hillsideTreatmentEntry = submissions.find(
    (entry) => entry.tool_args.local_observation_id === "treatment_hillside_avenue_bus_lanes_2025",
  );
  if (!hillsideTreatmentEntry) throw new Error("missing projected Hillside treatment input");
  const hillsideTreatmentId = canonicalRecordIdForInput(hillsideTreatmentEntry.tool_args);
  const dotSourceEntry = submissions.find(
    (entry) => entry.tool_args.local_observation_id === `source_${DOT_21ST_SOURCE}`,
  );
  const q1SourceEntry = submissions.find(
    (entry) => entry.tool_args.local_observation_id === `source_${Q1_SOURCE}`,
  );
  if (!dotSourceEntry || !q1SourceEntry) throw new Error("missing projected Queens source inputs");
  const dotSourceRecordId = canonicalRecordIdForInput(dotSourceEntry.tool_args);
  const q1SourceRecordId = canonicalRecordIdForInput(q1SourceEntry.tool_args);

  const rockawayShared = [
    relationId("relation_rockaway_project_uses_rockaway_beach_corridor_2019"),
    ...["b108-b102", "b102-b94", "b73-b67", "b59"].flatMap((suffix) => [
      relationId(`relation_rockaway_project_has_bus_lane_${suffix}_2019`),
      relationId(`relation_rockaway_bus_lane_${suffix}_located_on_corridor_2019`),
    ]),
  ].sort();
  const unsupported = [
    "The candidate's historical matched-segment identifiers remain unpinned.",
    "No stable candidate phase identity or onset-versus-extension resolution was proved.",
    "No canonical operational-occurrence identity was proved.",
  ];
  const candidateActions: CandidateAction[] = [
    {
      candidate_id: CANDIDATES.q103,
      canonical_links_added: [
        relationId("relation_21st_project_has_bus_lane_treatment_completion_2022"),
        relationId("relation_21st_bus_lane_treatment_located_on_corridor_2022"),
        relationId("relation_21st_project_serves_q103_2022"),
        relationId("relation_q103_operates_on_21st_street_corridor_2022"),
      ].sort(),
      canonical_records_added: [dotSourceRecordId],
      canonical_records_updated: [IDS.project21st],
      staged_source_ids: [DOT_21ST_SOURCE],
      study_projection_eligible: false,
      remaining_unsupported_claims: unsupported,
    },
    {
      candidate_id: CANDIDATES.q22,
      canonical_links_added: [...rockawayShared, relationId("relation_q22_operates_on_rockaway_beach_corridor_2019")].sort(),
      canonical_records_added: [],
      canonical_records_updated: [],
      staged_source_ids: [ROCKAWAY_SOURCE],
      study_projection_eligible: false,
      remaining_unsupported_claims: unsupported,
    },
    {
      candidate_id: CANDIDATES.q53,
      canonical_links_added: [...rockawayShared, relationId("relation_rockaway_project_serves_q53_2019"), relationId("relation_q53_operates_on_rockaway_beach_corridor_2019")].sort(),
      canonical_records_added: [],
      canonical_records_updated: [],
      staged_source_ids: [ROCKAWAY_SOURCE],
      study_projection_eligible: false,
      remaining_unsupported_claims: unsupported,
    },
    {
      candidate_id: CANDIDATES.q1,
      canonical_links_added: [
        relationId("relation_hillside_project_has_bus_lane_treatment_2025"),
        relationId("relation_hillside_bus_lane_treatment_located_on_corridor_2025"),
        relationId("relation_q1_operates_on_hillside_corridor_2025"),
      ].sort(),
      canonical_records_added: [q1SourceRecordId, hillsideTreatmentId],
      canonical_records_updated: [IDS.routeQ1],
      staged_source_ids: [Q1_SOURCE, STREETS_SOURCE],
      study_projection_eligible: false,
      remaining_unsupported_claims: unsupported,
    },
    {
      candidate_id: CANDIDATES.q52,
      canonical_links_added: [...rockawayShared, relationId("relation_rockaway_project_serves_q52_2019"), relationId("relation_q52_operates_on_rockaway_beach_corridor_2019")].sort(),
      canonical_records_added: [],
      canonical_records_updated: [],
      staged_source_ids: [ROCKAWAY_SOURCE],
      study_projection_eligible: false,
      remaining_unsupported_claims: unsupported,
    },
  ].sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));

  const uniqueLinks = [...new Set(candidateActions.flatMap((action) => action.canonical_links_added))].sort();
  const sourceVerification: JsonObject = {
    schema_version: 1,
    verified_at: REVIEWED_AT,
    sources: [
      {
        source_id: DOT_21ST_SOURCE,
        status: "staged_dynamic_official_html_snapshot",
        url: "https://www.nyc.gov/html/dot/html/pr2022/buses-for-queens.shtml",
        receipt_acquisition_sha256: "d30b4bde2bb965c16542b28f0ce4a190202d55af99e5d43f9f89f215edf925f1",
        staged_byte_sha256: sha256Bytes(join(repoRoot, "raw", "sources", DOT_21ST_SOURCE, "source.html")),
        staged_byte_length: readFileSync(join(repoRoot, "raw", "sources", DOT_21ST_SOURCE, "source.html")).byteLength,
        note: "The official HTML changes between retrievals; both hashes are retained. Canonical evidence is pinned to staged block hashes.",
      },
      {
        source_id: Q1_SOURCE,
        status: "staged_identical_to_acquisition",
        url: "https://www.mta.info/document/81901",
        receipt_acquisition_sha256: "8769e5d98be8b37f6961f1cd046bbfc16c6410a6813c3ef488e74e3b5afe92d6",
        staged_byte_sha256: sha256Bytes(join(repoRoot, "raw", "sources", Q1_SOURCE, "source.pdf")),
        staged_byte_length: readFileSync(join(repoRoot, "raw", "sources", Q1_SOURCE, "source.pdf")).byteLength,
      },
      {
        source_id: ROCKAWAY_SOURCE,
        status: "reused_existing_canonical_source_verified_against_official_bytes",
        url: "https://www.nyc.gov/html/dot/downloads/pdf/rockaway-beach-blvd-jun2019.pdf",
        receipt_acquisition_sha256: "af9b8556af462f4fbe0c38737cb481f4359ca46268850d455ee8791ace4dacf2",
        verified_official_byte_sha256: "af9b8556af462f4fbe0c38737cb481f4359ca46268850d455ee8791ace4dacf2",
        verified_official_byte_length: 8525969,
      },
    ],
  };
  const summary: JsonObject = {
    schema_version: 1,
    run_id: RUN_ID,
    reviewed_at: REVIEWED_AT,
    candidate_count: candidateActions.length,
    submission_count: submissions.length,
    source_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "source").length,
    treatment_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "treatment_component" && !entry.tool_args.target_record_id).length,
    canonical_record_updates: submissions.filter((entry) => Boolean(entry.tool_args.target_record_id)).length,
    relation_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "relation").length,
    unique_candidate_relevant_relation_additions: uniqueLinks.length,
    canonical_relation_ids: uniqueLinks,
    all_candidates_study_projection_eligible: false,
    operational_occurrence_additions: 0,
    explicit_phase_additions: 0,
    candidate_segment_bindings_added: 0,
    journal_sha256: createHash("sha256").update(submissions.map((entry) => JSON.stringify(entry)).join("\n") + "\n").digest("hex"),
  };
  return { submissions, candidateActions, summary, sourceVerification };
}

function exactContent(campaign: Campaign): Record<string, string> {
  return {
    [JOURNAL_PATH]: `${campaign.submissions.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    [ACTIONS_PATH]: `${JSON.stringify({ schema_version: 1, run_id: RUN_ID, candidates: campaign.candidateActions }, null, 2)}\n`,
    [SUMMARY_PATH]: `${JSON.stringify(campaign.summary, null, 2)}\n`,
    [SOURCE_VERIFICATION_PATH]: `${JSON.stringify(campaign.sourceVerification, null, 2)}\n`,
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

export function buildQueensAcquisitionLinkageCampaign(): Campaign {
  return buildCampaign();
}

export function queensAcquisitionCandidateActions(): CandidateAction[] {
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
    relations: campaign.summary.relation_additions as JsonValue,
    journal_sha256: campaign.summary.journal_sha256 as JsonValue,
  })}\n`);
}
