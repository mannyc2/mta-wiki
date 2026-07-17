import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

const RUN_ID = "2026-07-15T21-00-00-000Z_manhattan-third-avenue-linkage-remediation";
const REVIEWED_AT = "2026-07-15T21:00:00.000Z";
const JOURNAL_PATH = join(repoRoot, "data", "submissions", `${RUN_ID}.jsonl`);
const ARTIFACT_ROOT = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "bus-lane-acquisition",
  "shards",
  "manhattan",
  "linkage-remediation",
);
const SUMMARY_PATH = join(ARTIFACT_ROOT, "summary.json");
const ACTIONS_PATH = join(ARTIFACT_ROOT, "candidate-actions.json");
const SOURCE_VERIFICATION_PATH = join(ARTIFACT_ROOT, "source-verification.json");

const MIDTOWN_SOURCE = "nyc_dot_third_avenue_midtown_extension_cb6_jun2025";
const UPPER_SOURCE = "nyc_dot_third_avenue_upper_extension_cb11_jan2025";

const IDS = {
  routeM98: "route_m98-washington-heights-upper-east-side-ltd",
  routeM101: "route_m101",
  routeM102: "route_m102",
  routeM103: "route_m103-segment-speed",
} as const;

const LOCAL_IDS = {
  midtownSource: `source_${MIDTOWN_SOURCE}`,
  midtownProject: "project_third_avenue_complete_street_east_24th_59th_2025",
  midtownTreatment: "treatment_third_avenue_continuous_bus_lane_east_26th_59th_2025",
  midtownCorridor: "corridor_third_avenue_east_24th_59th",
  upperSource: `source_${UPPER_SOURCE}`,
  upperProject: "project_third_avenue_complete_street_east_96th_128th_2025",
  upperTreatment: "treatment_third_avenue_offset_bus_lane_east_96th_128th_2025",
  upperCorridor: "corridor_third_avenue_east_96th_128th",
} as const;

const CANDIDATES = {
  m103: "study-event-v2:17dced7b33f61eb49e6fff59",
  m98: "study-event-v2:2954b9c6483f74e7ca7ee209",
  m101: "study-event-v2:a863d72fae32caeacb91125d",
  m102: "study-event-v2:f113d0e26ca8e84dad903f4c",
} as const;

export type CandidateAction = {
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

function stagedBlocks(sourceId: string): StagedSourceBlock[] {
  const path = join(repoRoot, "raw", "sources", sourceId, "blocks.jsonl");
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StagedSourceBlock);
}

function stagedBlock(sourceId: string, blockId: string): StagedSourceBlock {
  const block = stagedBlocks(sourceId).find((entry) => entry.block_id === blockId);
  if (!block) throw new Error(`missing staged source block ${sourceId}#${blockId}`);
  return block;
}

function stagedEvidence(sourceId: string, blockId: string, role: string, quote?: string): MtaEvidenceRef {
  const block = stagedBlock(sourceId, blockId);
  if (quote && !quoteInText(quote, block.raw_text)) {
    throw new Error(`quote missing from ${sourceId}#${blockId}`);
  }
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
    assertion_status: "proposed",
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

function assertCanonicalInputs(): void {
  const byId = new Map(readCanonicalRecordsFromJsonl().map((record) => [record.record_id, record]));
  for (const id of Object.values(IDS)) {
    const record = byId.get(id);
    if (!record) throw new Error(`missing required canonical endpoint ${id}`);
    if (record.record_kind !== "route") {
      throw new Error(`canonical endpoint ${id} is ${record.record_kind}, expected route`);
    }
  }
}

function buildInputs(): MtaSubmitObservationInput[] {
  const midtownExtent = stagedEvidence(MIDTOWN_SOURCE, "p001_p0001", "project_extent", "3rd Ave, E 24th St to E 59th St");
  const midtownProposal = stagedEvidence(MIDTOWN_SOURCE, "p001_p0002", "document_status", "Complete Street Proposal");
  const midtownDate = stagedEvidence(MIDTOWN_SOURCE, "p001_p0003", "presentation_date", "Presented to Manhattan Community Board 6 on June 2, 2025");
  const midtownRoutes = stagedEvidence(MIDTOWN_SOURCE, "p004_p0014", "route_scope", "Average speeds (M101, 102, 103 )");
  const midtownBusContext = stagedEvidence(MIDTOWN_SOURCE, "p004_p0011", "corridor_bus_context", "64,000 daily riders use MTA buses along 3rd Ave");
  const midtownTreatment = stagedEvidence(MIDTOWN_SOURCE, "p014_p0002", "treatment_scope", "Repurpose travel lanes to include continuous bus lane and new protected bike lane");
  const midtownTreatmentExtent = stagedEvidence(MIDTOWN_SOURCE, "p014_p0001", "treatment_extent", "Proposed – 26th St to 59th St");

  const upperExtent = stagedEvidence(UPPER_SOURCE, "p001_p0001", "project_extent", "3rd Ave, E 96th St to E 128th St");
  const upperProposal = stagedEvidence(UPPER_SOURCE, "p001_p0002", "document_status", "Complete Street Proposal");
  const upperDate = stagedEvidence(UPPER_SOURCE, "p001_p0003", "presentation_date", "Presented to Manhattan Community Board 11 on January 16, 2025");
  const upperRoutes = stagedEvidence(UPPER_SOURCE, "p004_p0002", "route_scope", "Served by M98, M101, M102, M103 local bus routes as");
  const upperTreatment = stagedEvidence(UPPER_SOURCE, "p011_p0004", "treatment_scope", "Offset bus lane");
  const upperTreatmentContext = stagedEvidence(UPPER_SOURCE, "p011_p0001", "document_status", "Proposed");

  const inputs: MtaSubmitObservationInput[] = [
    input(MIDTOWN_SOURCE, "source", LOCAL_IDS.midtownSource, "NYC DOT Third Avenue East 24th–59th Street proposal", {
      title: "3rd Ave, E 24th St to E 59th St Complete Street Proposal",
      publisher: "New York City Department of Transportation",
      content_type: "community board presentation",
      source_url: "https://www.nyc.gov/html/dot/downloads/pdf/3rd-ave-24-st-59-st-jun2025.pdf",
      date_text: "June 2, 2025",
      description: "Official NYC DOT proposal presented to Manhattan Community Board 6.",
      authority_tier: "agency_report",
    }, [midtownExtent, midtownProposal, midtownDate]),
    input(MIDTOWN_SOURCE, "project", LOCAL_IDS.midtownProject, "Third Avenue Complete Street: East 24th–59th Street", {
      project_name: "Third Avenue Complete Street: East 24th Street to East 59th Street",
      project_type: "complete street",
      project_family: "bus_priority",
      status: "proposed",
      document_time_status: "proposed",
      borough: "Manhattan",
      location_text: "Third Avenue from East 24th Street to East 59th Street",
      date_text: "June 2, 2025 proposal",
      description: "NYC DOT's proposed complete-street extension on Third Avenue between East 24th and East 59th Streets.",
    }, [midtownExtent, midtownProposal, midtownDate]),
    input(MIDTOWN_SOURCE, "corridor", LOCAL_IDS.midtownCorridor, "Third Avenue, East 24th–59th Street", {
      corridor_name: "Third Avenue, East 24th Street to East 59th Street",
      street: "Third Avenue",
      limits: "East 24th Street to East 59th Street",
      from: "East 24th Street",
      to: "East 59th Street",
      borough: "Manhattan",
      description: "The physical Third Avenue project corridor identified in the June 2025 NYC DOT proposal.",
    }, [midtownExtent]),
    input(MIDTOWN_SOURCE, "treatment_component", LOCAL_IDS.midtownTreatment, "Third Avenue continuous bus lane, East 26th–59th Street", {
      treatment_kind: "continuous bus lane",
      treatment_family: "bus_lane",
      location_text: "Third Avenue from East 26th Street to East 59th Street",
      date_text: "June 2, 2025 proposal",
      description: "Proposed continuous bus lane on Third Avenue between East 26th and East 59th Streets.",
    }, [midtownTreatmentExtent, midtownTreatment]),
    input(UPPER_SOURCE, "source", LOCAL_IDS.upperSource, "NYC DOT Third Avenue East 96th–128th Street proposal", {
      title: "3rd Ave, E 96th St to E 128th St Complete Street Proposal",
      publisher: "New York City Department of Transportation",
      content_type: "community board presentation",
      source_url: "https://www.nyc.gov/html/dot/downloads/pdf/3rd-ave-96-st-128-st-jan2025.pdf",
      date_text: "January 16, 2025",
      description: "Official NYC DOT proposal presented to Manhattan Community Board 11.",
      authority_tier: "agency_report",
    }, [upperExtent, upperProposal, upperDate]),
    input(UPPER_SOURCE, "project", LOCAL_IDS.upperProject, "Third Avenue Complete Street: East 96th–128th Street", {
      project_name: "Third Avenue Complete Street: East 96th Street to East 128th Street",
      project_type: "complete street",
      project_family: "bus_priority",
      status: "proposed",
      document_time_status: "proposed",
      borough: "Manhattan",
      location_text: "Third Avenue from East 96th Street to East 128th Street",
      date_text: "January 16, 2025 proposal",
      description: "NYC DOT's proposed complete-street extension on Third Avenue between East 96th and East 128th Streets.",
    }, [upperExtent, upperProposal, upperDate]),
    input(UPPER_SOURCE, "corridor", LOCAL_IDS.upperCorridor, "Third Avenue, East 96th–128th Street", {
      corridor_name: "Third Avenue, East 96th Street to East 128th Street",
      street: "Third Avenue",
      limits: "East 96th Street to East 128th Street",
      from: "East 96th Street",
      to: "East 128th Street",
      borough: "Manhattan",
      description: "The physical Third Avenue project corridor identified in the January 2025 NYC DOT proposal.",
    }, [upperExtent]),
    input(UPPER_SOURCE, "treatment_component", LOCAL_IDS.upperTreatment, "Third Avenue offset bus lane, East 96th–128th Street", {
      treatment_kind: "offset bus lane",
      treatment_family: "bus_lane",
      location_text: "Third Avenue from East 96th Street to East 128th Street",
      date_text: "January 16, 2025 proposal",
      description: "Proposed offset bus lane within the Third Avenue East 96th-to-128th Street project.",
    }, [upperExtent, upperTreatmentContext, upperTreatment]),
  ];

  const proposalRelations = (
    sourceId: string,
    prefix: string,
    projectLocalId: string,
    treatmentLocalId: string,
    corridorLocalId: string,
    date: string,
    sharedEvidence: MtaEvidenceRef[],
    treatmentEvidence: MtaEvidenceRef[],
  ) => [
    relation(sourceId, `relation_${prefix}_project_uses_corridor`, `${prefix} project uses Third Avenue corridor`, "uses_corridor", "corridor_scope", { localId: projectLocalId }, { localId: corridorLocalId }, date, "The proposal's project extent is the bounded Third Avenue corridor.", sharedEvidence),
    relation(sourceId, `relation_${prefix}_project_has_bus_lane`, `${prefix} project has bus-lane treatment`, "has_treatment", "treatment_context", { localId: projectLocalId }, { localId: treatmentLocalId }, date, "The proposed complete-street project includes a bus-lane treatment.", treatmentEvidence),
    relation(sourceId, `relation_${prefix}_bus_lane_located_on_corridor`, `${prefix} bus lane located on Third Avenue corridor`, "located_on_corridor", "corridor_scope", { localId: treatmentLocalId }, { localId: corridorLocalId }, date, "The proposed bus-lane treatment is physically scoped within the proposal's Third Avenue corridor.", [...sharedEvidence, ...treatmentEvidence]),
  ];

  inputs.push(
    ...proposalRelations(MIDTOWN_SOURCE, "third_avenue_midtown_2025", LOCAL_IDS.midtownProject, LOCAL_IDS.midtownTreatment, LOCAL_IDS.midtownCorridor, "2025-06-02", [midtownExtent, midtownProposal], [midtownTreatmentExtent, midtownTreatment]),
    ...proposalRelations(UPPER_SOURCE, "third_avenue_upper_2025", LOCAL_IDS.upperProject, LOCAL_IDS.upperTreatment, LOCAL_IDS.upperCorridor, "2025-01-16", [upperExtent, upperProposal], [upperTreatmentContext, upperTreatment]),
  );

  for (const [label, routeId] of [
    ["m101", IDS.routeM101],
    ["m102", IDS.routeM102],
    ["m103", IDS.routeM103],
  ] as const) {
    inputs.push(
      relation(MIDTOWN_SOURCE, `relation_third_avenue_midtown_project_serves_${label}_2025`, `Third Avenue midtown proposal serves ${label.toUpperCase()}`, "serves_route", "route_scope", { localId: LOCAL_IDS.midtownProject }, { id: routeId }, "2025-06-02", `The proposal identifies ${label.toUpperCase()} service in the Third Avenue project context.`, [midtownExtent, midtownBusContext, midtownRoutes]),
      relation(MIDTOWN_SOURCE, `relation_${label}_operates_on_third_avenue_midtown_corridor_2025`, `${label.toUpperCase()} operates on the Third Avenue midtown corridor`, "operates_on_corridor", "corridor_scope", { id: routeId }, { localId: LOCAL_IDS.midtownCorridor }, "2025-06-02", `The proposal identifies ${label.toUpperCase()} in its Third Avenue bus-service context.`, [midtownExtent, midtownBusContext, midtownRoutes]),
    );
  }

  inputs.push(
    relation(UPPER_SOURCE, "relation_third_avenue_upper_project_serves_m98_2025", "Third Avenue upper proposal serves M98", "serves_route", "route_scope", { localId: LOCAL_IDS.upperProject }, { id: IDS.routeM98 }, "2025-01-16", "The proposal explicitly lists M98 among the local bus routes serving the Third Avenue project corridor.", [upperExtent, upperRoutes]),
    relation(UPPER_SOURCE, "relation_m98_operates_on_third_avenue_upper_corridor_2025", "M98 operates on the Third Avenue upper corridor", "operates_on_corridor", "corridor_scope", { id: IDS.routeM98 }, { localId: LOCAL_IDS.upperCorridor }, "2025-01-16", "The proposal explicitly lists M98 among the local bus routes serving the Third Avenue project corridor.", [upperExtent, upperRoutes]),
  );

  return inputs;
}

function buildCampaign(): Campaign {
  assertCanonicalInputs();
  const submissions = buildInputs().map(deterministicEntry);
  const recordIdByLocalId = new Map(
    submissions.map((entry) => [entry.tool_args.local_observation_id, canonicalRecordIdForInput(entry.tool_args)]),
  );
  const recordId = (localId: string) => {
    const id = recordIdByLocalId.get(localId);
    if (!id) throw new Error(`missing generated record ${localId}`);
    return id;
  };
  const relationIds = (localIds: string[]) => localIds.map(recordId).sort();
  const midtownShared = relationIds([
    "relation_third_avenue_midtown_2025_project_uses_corridor",
    "relation_third_avenue_midtown_2025_project_has_bus_lane",
    "relation_third_avenue_midtown_2025_bus_lane_located_on_corridor",
  ]);
  const upperShared = relationIds([
    "relation_third_avenue_upper_2025_project_uses_corridor",
    "relation_third_avenue_upper_2025_project_has_bus_lane",
    "relation_third_avenue_upper_2025_bus_lane_located_on_corridor",
  ]);
  const unsupported = [
    "The candidate's historical matched-segment identifiers remain unpinned.",
    "The candidate's registry implementation date and stable phase identity remain unproved.",
    "No canonical operational-occurrence identity was proved; the generic proposal linkage is not an onset claim.",
  ];
  const midtownRecords = [
    recordId(LOCAL_IDS.midtownSource),
    recordId(LOCAL_IDS.midtownProject),
    recordId(LOCAL_IDS.midtownTreatment),
    recordId(LOCAL_IDS.midtownCorridor),
  ].sort();
  const upperRecords = [
    recordId(LOCAL_IDS.upperSource),
    recordId(LOCAL_IDS.upperProject),
    recordId(LOCAL_IDS.upperTreatment),
    recordId(LOCAL_IDS.upperCorridor),
  ].sort();
  const midtownAction = (
    candidateId: string,
    routeId: "M101" | "M102" | "M103",
  ): CandidateAction => {
    const label = routeId.toLowerCase();
    return {
      candidate_id: candidateId,
      route_id: routeId,
      generic_route_binding_implemented: true,
      canonical_links_added: [...midtownShared, ...relationIds([
        `relation_third_avenue_midtown_project_serves_${label}_2025`,
        `relation_${label}_operates_on_third_avenue_midtown_corridor_2025`,
      ])].sort(),
      canonical_records_added: midtownRecords,
      canonical_records_updated: [],
      staged_source_ids: [MIDTOWN_SOURCE],
      study_projection_eligible: false,
      remaining_unsupported_claims: unsupported,
    };
  };
  const candidateActions: CandidateAction[] = [
    midtownAction(CANDIDATES.m101, "M101"),
    midtownAction(CANDIDATES.m102, "M102"),
    midtownAction(CANDIDATES.m103, "M103"),
    {
      candidate_id: CANDIDATES.m98,
      route_id: "M98",
      generic_route_binding_implemented: true,
      canonical_links_added: [...upperShared, ...relationIds([
        "relation_third_avenue_upper_project_serves_m98_2025",
        "relation_m98_operates_on_third_avenue_upper_corridor_2025",
      ])].sort(),
      canonical_records_added: upperRecords,
      canonical_records_updated: [],
      staged_source_ids: [UPPER_SOURCE],
      study_projection_eligible: false,
      remaining_unsupported_claims: unsupported,
    },
  ].sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));

  const uniqueLinks = [...new Set(candidateActions.flatMap((action) => action.canonical_links_added))].sort();
  const sourceVerification: JsonObject = {
    schema_version: 1,
    verified_at: REVIEWED_AT,
    sources: [MIDTOWN_SOURCE, UPPER_SOURCE].map((sourceId) => {
      const sourceDir = join(repoRoot, "raw", "sources", sourceId);
      const sourcePath = join(sourceDir, "source.pdf");
      const blocksPath = join(sourceDir, "blocks.jsonl");
      return {
        source_id: sourceId,
        status: "staged_identical_to_acquisition",
        url: sourceId === MIDTOWN_SOURCE
          ? "https://www.nyc.gov/html/dot/downloads/pdf/3rd-ave-24-st-59-st-jun2025.pdf"
          : "https://www.nyc.gov/html/dot/downloads/pdf/3rd-ave-96-st-128-st-jan2025.pdf",
        receipt_acquisition_sha256: sourceId === MIDTOWN_SOURCE
          ? "a7233db02e759f66397c0700f1b7d3a50fc4a80fe918ea62603de9e9a6eb5105"
          : "c2666b453a8fb4f040640571198cfd13e834a511a58a88af925ea0d7febd6e7f",
        staged_byte_sha256: sha256Bytes(sourcePath),
        staged_byte_length: readFileSync(sourcePath).byteLength,
        staged_blocks_sha256: sha256Bytes(blocksPath),
        staged_block_count: stagedBlocks(sourceId).length,
      };
    }),
  };
  for (const source of sourceVerification.sources as JsonObject[]) {
    if (source.receipt_acquisition_sha256 !== source.staged_byte_sha256) {
      throw new Error(`staged source hash differs from acquisition: ${String(source.source_id)}`);
    }
  }
  const journalText = `${submissions.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  const summary: JsonObject = {
    schema_version: 1,
    run_id: RUN_ID,
    reviewed_at: REVIEWED_AT,
    candidate_count: candidateActions.length,
    candidate_ids: candidateActions.map((action) => action.candidate_id),
    route_ids: candidateActions.map((action) => action.route_id).sort(),
    submission_count: submissions.length,
    source_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "source").length,
    project_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "project").length,
    corridor_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "corridor").length,
    treatment_record_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "treatment_component").length,
    canonical_record_updates: submissions.filter((entry) => Boolean(entry.tool_args.target_record_id)).length,
    relation_additions: submissions.filter((entry) => entry.tool_args.observation_kind === "relation").length,
    unique_candidate_relevant_relation_additions: uniqueLinks.length,
    canonical_relation_ids: uniqueLinks,
    generic_route_bindings_implemented: candidateActions.length,
    all_candidates_study_projection_eligible: false,
    operational_occurrence_additions: 0,
    explicit_phase_additions: 0,
    candidate_onset_bindings_added: 0,
    candidate_segment_bindings_added: 0,
    journal_sha256: createHash("sha256").update(journalText).digest("hex"),
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

export function buildManhattanThirdAvenueLinkageCampaign(): Campaign {
  return buildCampaign();
}

export function manhattanThirdAvenueCandidateActions(): CandidateAction[] {
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
