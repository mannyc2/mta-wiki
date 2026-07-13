import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import type { MtaEvidenceSubmissionRef, MtaSubmitObservationInput } from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import {
  appendSubmission,
  createSubmissionEntry,
  readSubmissionEntries,
} from "../packages/pipeline/src/records/submissions.js";

const RUN_ID = "2026-07-13_codex_broadway-q70-delivered-status";
const DOT_SOURCE_ID = "nyc_dot_current_projects_july_2026";
const MAYOR_SOURCE_ID = "nyc_mayor_broadway_created_june_2026";
const PROJECT_ID = "project_broadway-bus-priority-2026";
const PROJECT_ALIAS_ID = "project_broadway-69th-roosevelt-queens";
const ROUTE_ID = "route_q70-sbs";
const TREATMENT_ID = "treatment_broadway-center-running-bus-lane";
const EVENT_ID = "event_broadway-center-running-bus-lane-installation-confirmed";

const sourcePins = {
  [DOT_SOURCE_ID]: {
    sourceHtmlSha256: "c91cd30a3c94050f9b224fcc2437d47dc8bb2645a1bea172a6f02fae20ddcf5a",
    textSha256: "db4f22845842423aeffd124497b9774b77f49c5fc7142902fbb95dfca2f119d9",
    blocksSha256: "8b0ba3705694660a8c5557f4622bc31804d63c8edadaed519f9e369f8ecc111f",
    blocks: {
      p001_b0001: {
        sha256: "sha256:03d99e2a43b611a5d82c111d2db4d30fe9e4d7ee731edfeaaf06e6ade598dbc0",
        literal: "NYC DOT - Current Projects",
      },
      p001_b0630: {
        sha256: "sha256:ca2a3ccdc61bdab00f912680c942d69ec317be148425c978e99f2a6508f138a4",
        literal: "Broadway, 69th Street to Roosevelt Avenue",
      },
      p001_b0631: {
        sha256: "sha256:ba1026d7e34c7d25733c60ffe77287249bd0a9f7ea1ebb79ccad274115142166",
        literal: "recently installed an eastbound center-running bus lane",
      },
    },
  },
  [MAYOR_SOURCE_ID]: {
    sourceHtmlSha256: "d3db84bb93a5789b5b5f5ab640760eacbc91757611ed12530db4a1e86dd4868a",
    textSha256: "8da7922cdb2f9650860d3652d1ee2508d2565347583ef07b62d55f50adb8b817",
    blocksSha256: "25899eadd73812edd54a83375ad90c542a6f6e1b4a252eca57355c41be09483a",
    blocks: {
      p001_b0001: {
        sha256: "sha256:c56d75b903bc4c8f0041bdaec05a0dd4fe37e816ce21dfeef43369d1ff494f80",
        literal: "Mayor Mamdani: The World Cup Belongs to New Yorkers",
      },
      p001_b0070: {
        sha256: "sha256:421db028d3653cc97c86906823bf5995a4c6967ba3ce156447094fbcf2eb084d",
        literal: "June 10, 2026",
      },
      p001_b0114: {
        sha256: "sha256:740dee6d1b381c8c2611ddba3c14e47b5a7c9f487b3a30684db48225b5cd6de3",
        literal: "Created a new dedicated, center-running eastbound bus lane",
      },
    },
  },
} as const;

type SourceBlock = {
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function sourcePath(sourceId: string, filename: string): string {
  return join(repoRoot, "raw", "sources", sourceId, filename);
}

function loadBlocks(sourceId: keyof typeof sourcePins): Map<string, SourceBlock> {
  const pin = sourcePins[sourceId];
  const sourceHtml = readFileSync(sourcePath(sourceId, "source.html"));
  const text = readFileSync(sourcePath(sourceId, "text.txt"));
  const blockContent = readFileSync(sourcePath(sourceId, "blocks.jsonl"));
  assert(sha256(sourceHtml) === pin.sourceHtmlSha256, `${sourceId} source.html changed`);
  assert(sha256(text) === pin.textSha256, `${sourceId} text.txt changed`);
  assert(sha256(blockContent) === pin.blocksSha256, `${sourceId} blocks.jsonl changed`);
  const blocks = new Map(
    blockContent
      .toString("utf8")
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as SourceBlock)
      .map((block) => [block.block_id, block]),
  );
  for (const [blockId, blockPin] of Object.entries(pin.blocks)) {
    const block = blocks.get(blockId);
    assert(block, `Missing ${sourceId}#${blockId}`);
    assert(block.raw_text_sha256 === blockPin.sha256, `${sourceId}#${blockId} hash changed`);
    assert(block.raw_text.includes(blockPin.literal), `${sourceId}#${blockId} lost pinned literal`);
  }
  return blocks;
}

const blocksBySource = new Map([
  [DOT_SOURCE_ID, loadBlocks(DOT_SOURCE_ID)],
  [MAYOR_SOURCE_ID, loadBlocks(MAYOR_SOURCE_ID)],
]);

function block(sourceId: string, blockId: string): SourceBlock {
  const value = blocksBySource.get(sourceId)?.get(blockId);
  assert(value, `Missing staged block ${sourceId}#${blockId}`);
  return value;
}

function evidence(sourceId: string, blockId: string, role: string, sourceQuote?: string): MtaEvidenceSubmissionRef {
  const value = block(sourceId, blockId);
  return {
    source_id: sourceId,
    evidence_id: `${sourceId}#${blockId}`,
    source_path: `raw/sources/${sourceId}/blocks.jsonl`,
    page_number: value.page_number,
    block_id: blockId,
    text_sha256: value.raw_text_sha256,
    text_source: "raw_text",
    role,
    ...(sourceQuote ? { source_quote: sourceQuote } : {}),
  };
}

const dotProjectLocalId = "project_broadway_q70_delivered_dot_2026";
const dotRouteLocalId = "route_q70_sbs_delivered_dot_2026";
const dotTreatmentLocalId = "treatment_broadway_center_running_lane_delivered_dot_2026";
const mayorProjectLocalId = "project_broadway_q70_delivered_mayor_2026";
const mayorTreatmentLocalId = "treatment_broadway_center_running_lane_delivered_mayor_2026";
const mayorEventLocalId = "event_broadway_center_running_bus_lane_installation_confirmed";

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: DOT_SOURCE_ID,
    observation_kind: "source",
    local_observation_id: `source_${DOT_SOURCE_ID}`,
    label: "NYC DOT Current Projects",
    raw_text: "NYC DOT - Current Projects",
    payload: {
      title: "NYC DOT Current Projects",
      publisher: "NYC DOT",
      content_type: "official project webpage",
      retrieved_at: "2026-07-13T09:04:28.781Z",
      source_url: "https://www.nyc.gov/html/dot/html/about/current-projects.shtml",
      description: "NYC DOT's current-project registry, captured after the Broadway Q70 bus lane was installed.",
    },
    evidence_refs: [evidence(DOT_SOURCE_ID, "p001_b0001", "source_title", "NYC DOT - Current Projects")],
  },
  {
    source_id: DOT_SOURCE_ID,
    observation_kind: "project",
    local_observation_id: dotProjectLocalId,
    target_record_id: PROJECT_ID,
    label: "Broadway Bus Priority",
    raw_text: block(DOT_SOURCE_ID, "p001_b0631").raw_text,
    payload: {
      project_name: "Broadway Bus Priority",
      project_type: "bus priority",
      borough: "Queens",
      status: "implemented",
      description: "An eastbound center-running bus lane was installed on Broadway between 69th Street and Roosevelt Avenue for Q70 SBS service.",
      location: "Broadway, 69th Street to Roosevelt Avenue, Queens",
    },
    evidence_refs: [
      evidence(DOT_SOURCE_ID, "p001_b0630", "project_heading"),
      evidence(DOT_SOURCE_ID, "p001_b0631", "implemented_project_status"),
    ],
  },
  {
    source_id: DOT_SOURCE_ID,
    observation_kind: "route",
    local_observation_id: dotRouteLocalId,
    target_record_id: ROUTE_ID,
    label: "Q70 SBS",
    raw_text: "Q70 SBS",
    payload: {
      route_id: "Q70",
      route_label: "Q70 SBS",
      route_name: "Q70 SBS",
      route_type: "select_bus_service",
      borough: "Queens",
    },
    evidence_refs: [evidence(DOT_SOURCE_ID, "p001_b0631", "route_identity", "Q70 SBS")],
  },
  {
    source_id: DOT_SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: dotTreatmentLocalId,
    target_record_id: TREATMENT_ID,
    label: "Eastbound center-running bus lane",
    raw_text: "recently installed an eastbound center-running bus lane",
    payload: {
      treatment_kind: "center-running bus lane",
      treatment_family: "bus_lane",
      description: "Installed eastbound center-running bus lane on Broadway in Queens between 69th Street and Roosevelt Avenue.",
      location_text: "Broadway between 69th Street and Roosevelt Avenue, Queens",
    },
    evidence_refs: [
      evidence(
        DOT_SOURCE_ID,
        "p001_b0631",
        "delivered_treatment",
        "recently installed an eastbound center-running bus lane",
      ),
    ],
  },
  {
    source_id: DOT_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_broadway_delivered_serves_q70_as_of_2026_07_13",
    label: "Installed Broadway bus lane serves Q70 SBS",
    payload: {
      relation_kind: "serves_route",
      subject_local_observation_id: dotProjectLocalId,
      object_local_observation_id: dotRouteLocalId,
      assertion_status: "delivered",
      as_of_date: "2026-07-13",
      description: "At capture time, NYC DOT described the installed Broadway bus lane as serving Q70 SBS riders.",
    },
    evidence_refs: [evidence(DOT_SOURCE_ID, "p001_b0631", "delivered_route_scope")],
  },
  {
    source_id: DOT_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_broadway_has_delivered_center_running_lane_as_of_2026_07_13",
    label: "Broadway project has installed center-running bus lane",
    payload: {
      relation_kind: "has_treatment",
      subject_local_observation_id: dotProjectLocalId,
      object_local_observation_id: dotTreatmentLocalId,
      assertion_status: "delivered",
      as_of_date: "2026-07-13",
      description: "At capture time, NYC DOT described the eastbound center-running Broadway bus lane as installed.",
    },
    evidence_refs: [evidence(DOT_SOURCE_ID, "p001_b0631", "delivered_treatment_scope")],
  },
  {
    source_id: DOT_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_q70_uses_broadway_center_running_lane_as_of_2026_07_13",
    label: "Q70 SBS uses installed Broadway center-running bus lane",
    payload: {
      relation_kind: "has_treatment",
      subject_local_observation_id: dotRouteLocalId,
      object_local_observation_id: dotTreatmentLocalId,
      assertion_status: "delivered",
      as_of_date: "2026-07-13",
      description: "At capture time, NYC DOT directly tied Q70 SBS service to the installed Broadway center-running bus lane.",
    },
    evidence_refs: [evidence(DOT_SOURCE_ID, "p001_b0631", "direct_route_treatment_scope")],
  },
  {
    source_id: MAYOR_SOURCE_ID,
    observation_kind: "source",
    local_observation_id: `source_${MAYOR_SOURCE_ID}`,
    label: "Mayor Mamdani: The World Cup Belongs to New Yorkers",
    raw_text: "Mayor Mamdani: The World Cup Belongs to New Yorkers",
    payload: {
      title: "Mayor Mamdani: The World Cup Belongs to New Yorkers",
      publisher: "NYC Mayor's Office",
      content_type: "official press release",
      publication_date: "June 10, 2026",
      retrieved_at: "2026-07-13T09:05:18.135Z",
      source_url: "https://www.nyc.gov/mayors-office/news/2026/06/mayor-mamdani--the-world-cup-belongs-to-new-yorkers",
      description: "Official retrospective listing permanent transportation improvements delivered before the 2026 World Cup.",
    },
    evidence_refs: [
      evidence(MAYOR_SOURCE_ID, "p001_b0001", "source_title"),
      evidence(MAYOR_SOURCE_ID, "p001_b0070", "publication_date", "June 10, 2026"),
    ],
  },
  {
    source_id: MAYOR_SOURCE_ID,
    observation_kind: "project",
    local_observation_id: mayorProjectLocalId,
    target_record_id: PROJECT_ID,
    label: "Broadway Bus Priority",
    raw_text: block(MAYOR_SOURCE_ID, "p001_b0114").raw_text,
    payload: {
      project_name: "Broadway Bus Priority",
      project_type: "bus priority",
      borough: "Queens",
      status: "implemented",
      description: "A dedicated center-running eastbound bus lane was created on Broadway in Queens to improve travel to LaGuardia Airport.",
    },
    evidence_refs: [evidence(MAYOR_SOURCE_ID, "p001_b0114", "implemented_project_status")],
  },
  {
    source_id: MAYOR_SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: mayorTreatmentLocalId,
    target_record_id: TREATMENT_ID,
    label: "Center-running eastbound bus lane",
    raw_text: block(MAYOR_SOURCE_ID, "p001_b0114").raw_text,
    payload: {
      treatment_kind: "center-running bus lane",
      treatment_family: "bus_lane",
      description: "Dedicated center-running eastbound bus lane on Broadway in Queens.",
      location_text: "Broadway in Queens",
    },
    evidence_refs: [evidence(MAYOR_SOURCE_ID, "p001_b0114", "delivered_treatment")],
  },
  {
    source_id: MAYOR_SOURCE_ID,
    observation_kind: "event",
    local_observation_id: mayorEventLocalId,
    create_new: true,
    label: "Broadway center-running bus lane installation confirmed",
    raw_text: block(MAYOR_SOURCE_ID, "p001_b0114").raw_text,
    payload: {
      event_kind: "installation",
      event_family: "implementation",
      lifecycle_phase: "installed",
      description: "The official June 10 retrospective confirms that the dedicated center-running eastbound Broadway bus lane had been created, without stating its physical activation date.",
    },
    evidence_refs: [evidence(MAYOR_SOURCE_ID, "p001_b0114", "delivered_status")],
  },
  {
    source_id: MAYOR_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_broadway_installation_confirmed_by_2026_06_10",
    label: "Broadway installation confirmed by June 10, 2026",
    payload: {
      relation_kind: "has_timeline_event",
      subject_local_observation_id: mayorProjectLocalId,
      object_local_observation_id: mayorEventLocalId,
      assertion_status: "delivered",
      as_of_date: "2026-06-10",
      description: "The dated June 10 retrospective establishes installed status by publication, not an exact operational onset on June 10.",
    },
    evidence_refs: [
      evidence(MAYOR_SOURCE_ID, "p001_b0070", "status_as_of_date", "June 10, 2026"),
      evidence(MAYOR_SOURCE_ID, "p001_b0114", "delivered_timeline_status"),
    ],
  },
  {
    source_id: MAYOR_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_broadway_center_running_lane_installation_confirmed_by_2026_06_10",
    label: "Center-running Broadway lane installation confirmed by June 10, 2026",
    payload: {
      relation_kind: "has_timeline_event",
      subject_local_observation_id: mayorTreatmentLocalId,
      object_local_observation_id: mayorEventLocalId,
      assertion_status: "delivered",
      as_of_date: "2026-06-10",
      description: "The dated retrospective directly establishes installed status for the center-running lane by publication, without asserting that June 10 was its onset.",
    },
    evidence_refs: [
      evidence(MAYOR_SOURCE_ID, "p001_b0070", "status_as_of_date", "June 10, 2026"),
      evidence(MAYOR_SOURCE_ID, "p001_b0114", "direct_treatment_timeline_status"),
    ],
  },
  {
    source_id: MAYOR_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_broadway_has_delivered_center_running_lane_as_of_2026_06_10",
    label: "Broadway project had center-running bus lane by June 10, 2026",
    payload: {
      relation_kind: "has_treatment",
      subject_local_observation_id: mayorProjectLocalId,
      object_local_observation_id: mayorTreatmentLocalId,
      assertion_status: "delivered",
      as_of_date: "2026-06-10",
      description: "The June 10 retrospective lists the dedicated center-running eastbound Broadway bus lane as created.",
    },
    evidence_refs: [
      evidence(MAYOR_SOURCE_ID, "p001_b0070", "status_as_of_date", "June 10, 2026"),
      evidence(MAYOR_SOURCE_ID, "p001_b0114", "delivered_treatment_scope"),
    ],
  },
];

const recordsById = new Map(readCanonicalRecordsFromJsonl().map((record) => [record.record_id, record]));
for (const [recordId, expectedKind] of [
  [PROJECT_ID, "project"],
  [ROUTE_ID, "route"],
  [TREATMENT_ID, "treatment_component"],
] as const) {
  const record = recordsById.get(recordId);
  assert(record?.record_kind === expectedKind, `Missing ${expectedKind} target ${recordId}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
}
const projectAlias = recordsById.get(PROJECT_ALIAS_ID);
if (projectAlias) {
  assert(projectAlias.record_kind === "project", `${PROJECT_ALIAS_ID} is not a project`);
  assert(projectAlias.payload.status === "proposed", `${PROJECT_ALIAS_ID} baseline status changed`);
}
const existingEvent = recordsById.get(EVENT_ID);
if (existingEvent) {
  assert(existingEvent.record_kind === "event", `${EVENT_ID} changed kind`);
  assert(existingEvent.payload.lifecycle_phase === "installed", `${EVENT_ID} lifecycle changed`);
  assert(existingEvent.payload.date_normalized === undefined, `${EVENT_ID} acquired an unsupported onset date`);
}

const existingSubmissionIds = new Set(readSubmissionEntries().map((entry) => entry.submission_id));
const previews = observations.map((observation) =>
  createSubmissionEntry(RUN_ID, observation, "2026-07-13T09:15:00.000Z"),
);
for (const entry of previews) {
  if (entry.validation.state !== "accepted") {
    throw new Error(`${entry.submission_id} rejected: ${entry.validation.issues.join("; ")}`);
  }
}
const pendingIds = new Set(
  previews
    .filter((entry) => !existingSubmissionIds.has(entry.submission_id))
    .map((entry) => entry.submission_id),
);

const apply = process.argv.includes("--apply");
if (apply) {
  for (const observation of observations) {
    const preview = createSubmissionEntry(RUN_ID, observation, "2026-07-13T09:15:00.000Z");
    if (!pendingIds.has(preview.submission_id)) continue;
    const written = appendSubmission(RUN_ID, observation);
    if (written.validation.state !== "accepted") {
      throw new Error(`${written.submission_id} rejected while applying: ${written.validation.issues.join("; ")}`);
    }
  }
}

process.stdout.write(`${JSON.stringify({
  run_id: RUN_ID,
  mode: apply ? "apply" : "dry_run",
  observation_count: observations.length,
  already_present_count: observations.length - pendingIds.size,
  written_count: apply ? pendingIds.size : 0,
  pending_count: apply ? 0 : pendingIds.size,
  target_event_id: EVENT_ID,
  preserved_planning_event_id: "event_bus-lanes-operational-mid-june-2026",
  source_ids: [MAYOR_SOURCE_ID, DOT_SOURCE_ID],
  submission_ids: previews.map((entry) => entry.submission_id),
}, null, 2)}\n`);
