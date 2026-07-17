import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import type { MtaCanonicalRecord, MtaEvidenceSubmissionRef, MtaSubmitObservationInput } from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import { appendSubmission, createSubmissionEntry, readSubmissionEntries } from "../packages/pipeline/src/records/submissions.js";

const RUN_ID = "2026-07-14_codex_gun-hill-road-completion-2023";
const SOURCE_ID = "nyc_dot_gun_hill_road_completion_2023";
const MTA_COMPLETION_SOURCE_ID = "meeting_doc_127471";
const PROJECT_ID = "project_gun-hill-road-bus-lanes";
const EVENT_ID = "event_gun-hill-road-substantial-completion-announcement-2023-10-31";
const COMPLETION_EVENT_ID = "event_gun-hill-road-bus-lanes-completed-2023-10-31";
const TREATMENT_ID = "treatment_gun-hill-road-bus-lanes-bainbridge-bartow";
const BX28_ROUTE_ID = "route_bx28-addendum-update";
const BX38_ROUTE_ID = "route_bx38-ace";
const TIMELINE_RELATION_ID = "relation_gun-hill-road-bus-lanes-has-completion-announcement-2023-10-31";
const COMPLETION_RELATION_ID = "relation_gun-hill-road-bus-lanes-has-completion-2023-10-31";
const COMPLETION_BX28_RELATION_ID = "relation_gun-hill-completion-affects-bx28";
const COMPLETION_BX38_RELATION_ID = "relation_gun-hill-completion-affects-bx38";
const TREATMENT_COMPLETION_RELATION_ID = "relation_gun-hill-bainbridge-bartow-lanes-has-completion-2023-10-31";
const BX28_EXISTING_RELATION_ID = "relation_gun-hill-project-serves-routes";
const BX28_RELATION_ID = "relation_gun-hill-project-serves-bx28-dot-2023";
const BX38_RELATION_ID = "relation_gun-hill-road-bus-lanes-serves-bx38";
const TREATMENT_RELATION_ID = "relation_gun-hill-road-project-has-bainbridge-bartow-bus-lanes";

const sourcePins = {
  artifacts: {
    "metadata.json": "bb26f2761fbdf79d94ae0df62e24551ce10391595e66f0da8066f216f9ff439c",
    "source.html": "66d8005f4c919f2dc65edc8acc0d926c213df833486ee857e38586ecc3937a99",
    "text.txt": "4f23cbc0937b5857b95b15e274379e1a4e2ec66f7b3dac75b2f6cebfcb66ee54",
    "blocks.jsonl": "bbfd1504126dc2d83d47d6e1c4335e4fb98457b9785dadfaf6aa35d4a617e905",
  },
  blocks: {
    date: {
      blockId: "p001_b0010",
      sha256: "sha256:7bae7d6be36d5f4483b724271d610c3c269daf05d14487e9e679a6979beff5b0",
      literals: ["October 31, 2023"],
    },
    completion: {
      blockId: "p001_b0015",
      sha256: "sha256:5b2746623424ff7c40cc1ab19533e670e32b4a9ec5c4e498ff2e93ae1f267f37",
      literals: ["substantial completion", "East Gun Hill Road Bus Priority and Safety project"],
    },
    routeScope: {
      blockId: "p001_b0021",
      sha256: "sha256:f2d50c0df7d117ee3f132cf6496b5e1c9f938e889b2a9f2b323178d6a1a77a86",
      literals: ["Bx28 and Bx38 routes", "New bus-only lanes"],
    },
    segmentScope: {
      blockId: "p001_b0024",
      sha256: "sha256:568131f4328fad9b16fd248365b3b7c573f5e5a5a158fce4f112cb1bbe682834",
      literals: ["from Bainbridge Avenue to Bartow Avenue", "3.1 miles", "offset", "center-running", "curbside bus lanes"],
    },
  },
} as const;

const mtaCompletionPins = {
  artifacts: {
    "metadata.json": "3abae4c00097503d301593a61dd79537542cb80fb66fbf4fb64cb28c0c1c1df2",
    "source.pdf": "5d3a82851efed1316ff8b65540eaa7e33c7fe9d21221192740476002f50d51ce",
    "blocks.jsonl": "e3ee6c7214ec37ea01ecfa906cc26e8ba62b7ea5da30f56fcb312f42ef2e959a",
  },
  reportMonth: {
    blockId: "p001_c0002",
    sha256: "sha256:e69c0d0941613a92d310b2b015f10809eea1561b1567a4752340b6747677fe1b",
    literal: "November 2023",
  },
  completion: {
    blockId: "p015_c0011",
    sha256: "sha256:5d341caabe6b1c4265e38f291b8b527ffc02e724a0b5329fdf5167134f302cbf",
    literal: "3.1 miles of bus lanes on Gun Hill Road (completed on October 31st)",
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

for (const [filename, expected] of Object.entries(sourcePins.artifacts)) {
  assert(sha256(readFileSync(sourcePath(SOURCE_ID, filename))) === expected, `${SOURCE_ID}/${filename} changed`);
}
for (const [filename, expected] of Object.entries(mtaCompletionPins.artifacts)) {
  assert(
    sha256(readFileSync(sourcePath(MTA_COMPLETION_SOURCE_ID, filename))) === expected,
    `${MTA_COMPLETION_SOURCE_ID}/${filename} changed`,
  );
}

const blocks = new Map(
  readFileSync(sourcePath(SOURCE_ID, "blocks.jsonl"), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SourceBlock)
    .map((block) => [block.block_id, block]),
);

const mtaBlocks = new Map(
  readFileSync(sourcePath(MTA_COMPLETION_SOURCE_ID, "blocks.jsonl"), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SourceBlock)
    .map((block) => [block.block_id, block]),
);

function pinnedBlock(key: keyof typeof sourcePins.blocks): SourceBlock {
  const pin = sourcePins.blocks[key];
  const block = blocks.get(pin.blockId);
  assert(block, `Missing ${SOURCE_ID}#${pin.blockId}`);
  assert(block.raw_text_sha256 === pin.sha256, `${SOURCE_ID}#${pin.blockId} hash changed`);
  for (const literal of pin.literals) {
    assert(block.raw_text.includes(literal), `${SOURCE_ID}#${pin.blockId} lost ${JSON.stringify(literal)}`);
  }
  return block;
}

const dateBlock = pinnedBlock("date");
const completionBlock = pinnedBlock("completion");
const routeScopeBlock = pinnedBlock("routeScope");
const segmentScopeBlock = pinnedBlock("segmentScope");

function pinnedMtaBlock(key: "reportMonth" | "completion"): SourceBlock {
  const pin = mtaCompletionPins[key];
  const block = mtaBlocks.get(pin.blockId);
  assert(block, `Missing ${MTA_COMPLETION_SOURCE_ID}#${pin.blockId}`);
  assert(block.raw_text_sha256 === pin.sha256, `${MTA_COMPLETION_SOURCE_ID}#${pin.blockId} hash changed`);
  assert(block.raw_text.includes(pin.literal), `${MTA_COMPLETION_SOURCE_ID}#${pin.blockId} lost ${JSON.stringify(pin.literal)}`);
  return block;
}

const mtaReportMonthBlock = pinnedMtaBlock("reportMonth");
const mtaCompletionBlock = pinnedMtaBlock("completion");

function evidence(block: SourceBlock, role: string, sourceQuote?: string): MtaEvidenceSubmissionRef {
  return {
    source_id: SOURCE_ID,
    evidence_id: `${SOURCE_ID}#${block.block_id}`,
    source_path: `raw/sources/${SOURCE_ID}/blocks.jsonl`,
    page_number: block.page_number,
    block_id: block.block_id,
    text_sha256: block.raw_text_sha256,
    text_source: "raw_text",
    role,
    ...(sourceQuote ? { source_quote: sourceQuote } : {}),
  };
}

function mtaEvidence(block: SourceBlock, role: string, sourceQuote?: string): MtaEvidenceSubmissionRef {
  return {
    source_id: MTA_COMPLETION_SOURCE_ID,
    evidence_id: `${MTA_COMPLETION_SOURCE_ID}#${block.block_id}`,
    source_path: `raw/sources/${MTA_COMPLETION_SOURCE_ID}/blocks.jsonl`,
    page_number: block.page_number,
    block_id: block.block_id,
    text_sha256: block.raw_text_sha256,
    text_source: "raw_text",
    role,
    ...(sourceQuote ? { source_quote: sourceQuote } : {}),
  };
}

const projectLocalId = "project_gun_hill_road_bus_lanes_dot_completion_2023";
const eventLocalId = "event_gun_hill_road_substantial_completion_announcement_2023_10_31";
const completionEventLocalId = "event_gun_hill_road_bus_lanes_completed_2023_10_31";
const mtaTreatmentLocalId = "treatment_meeting_doc_127471_gun_hill_road_bus_lanes_completion";
const treatmentLocalId = "treatment_gun_hill_road_bus_lanes_bainbridge_bartow";
const bx28LocalId = "route_bx28_gun_hill_completion_2023";
const bx38LocalId = "route_bx38_gun_hill_completion_2023";

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: SOURCE_ID,
    observation_kind: "source",
    local_observation_id: `source_${SOURCE_ID}`,
    label: "NYC DOT Celebrates Completion of East Gun Hill Road Redesign",
    raw_text: [dateBlock.raw_text, completionBlock.raw_text].join("\n\n"),
    payload: {
      title: "NYC DOT Celebrates Completion of East Gun Hill Road Redesign",
      publisher: "New York City Department of Transportation (NYC DOT)",
      content_type: "official press release webpage",
      authority_tier: "press_release",
      date_text: "October 31, 2023",
      source_url: "https://www.nyc.gov/html/dot/html/pr2023/east-gun-hill-road-redesign.shtml",
      retrieved_at: "2026-07-14T22:29:28Z",
      description: "Official NYC DOT completion announcement with exact Gun Hill Road route scope and bounded bus-lane segment.",
    },
    evidence_refs: [
      evidence(dateBlock, "publication_date", "October 31, 2023"),
      evidence(completionBlock, "source_scope", "substantial completion of the East Gun Hill Road Bus Priority and Safety project"),
    ],
  },
  {
    source_id: MTA_COMPLETION_SOURCE_ID,
    observation_kind: "event",
    local_observation_id: completionEventLocalId,
    create_new: true,
    label: "Gun Hill Road bus lanes completed October 31, 2023",
    raw_text: [mtaReportMonthBlock.raw_text, mtaCompletionBlock.raw_text].join("\n\n"),
    payload: {
      event_kind: "bus lane completion",
      event_family: "implementation",
      lifecycle_phase: "completed",
      date_text: "October 31st",
      date_normalized: "2023-10-31",
      date_precision: "day",
      description: "MTA reported that 3.1 miles of Gun Hill Road bus lanes were completed on October 31, 2023. This is a completion-phase date, not an assertion about the first day any portion became operational.",
      date_resolution_basis: "The exact October 31st completion literal appears in the official November 2023 MTA report; the official NYC DOT release on October 31, 2023 corroborates the year and substantial-completion context.",
    },
    evidence_refs: [
      mtaEvidence(mtaCompletionBlock, "completion_phase_date", "completed on October 31st"),
      mtaEvidence(mtaReportMonthBlock, "completion_year_context", "November 2023"),
      evidence(dateBlock, "corroborating_publication_date", "October 31, 2023"),
      evidence(completionBlock, "corroborating_completion_status", "substantial completion"),
    ],
  },
  {
    source_id: MTA_COMPLETION_SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: mtaTreatmentLocalId,
    target_record_id: TREATMENT_ID,
    label: "3.1 miles of Gun Hill Road bus lanes",
    raw_text: mtaCompletionBlock.raw_text,
    payload: {
      treatment_kind: "3.1 miles of bus lanes",
      description: "The MTA completion report identifies the delivered treatment as 3.1 miles of Gun Hill Road bus lanes; the DOT source separately bounds the segment and lane designs.",
    },
    evidence_refs: [
      mtaEvidence(mtaCompletionBlock, "completed_treatment_definition", "3.1 miles of bus lanes on Gun Hill Road"),
      evidence(segmentScopeBlock, "bounded_treatment_segment", "from Bainbridge Avenue to Bartow Avenue"),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "project",
    local_observation_id: projectLocalId,
    target_record_id: PROJECT_ID,
    label: "East Gun Hill Road Bus Priority and Safety project",
    raw_text: [completionBlock.raw_text, routeScopeBlock.raw_text, segmentScopeBlock.raw_text].join("\n\n"),
    payload: {
      project_name: "East Gun Hill Road Bus Priority and Safety project",
      project_type: "bus lane and street safety redesign",
      status: "substantially complete",
      borough: "Bronx",
      geography: "East Gun Hill Road from Bainbridge Avenue to Bartow Avenue",
      description: "Substantially completed 3.1-mile bus-priority and safety project with mixed offset, center-running, and curbside bus lanes.",
    },
    evidence_refs: [
      evidence(completionBlock, "delivered_project_status", "substantial completion"),
      evidence(segmentScopeBlock, "bounded_project_geography", "from Bainbridge Avenue to Bartow Avenue"),
    ],
  },
  ...[
    { localId: bx28LocalId, recordId: BX28_ROUTE_ID, routeId: "Bx28" },
    { localId: bx38LocalId, recordId: BX38_ROUTE_ID, routeId: "Bx38" },
  ].map(({ localId, recordId, routeId }): MtaSubmitObservationInput => ({
    source_id: SOURCE_ID,
    observation_kind: "route",
    local_observation_id: localId,
    target_record_id: recordId,
    label: routeId,
    raw_text: routeScopeBlock.raw_text,
    payload: { route_id: routeId },
    evidence_refs: [evidence(routeScopeBlock, "route_identity", "Bx28 and Bx38 routes")],
  })),
  {
    source_id: SOURCE_ID,
    observation_kind: "event",
    local_observation_id: eventLocalId,
    create_new: true,
    label: "East Gun Hill Road substantial-completion announcement",
    raw_text: [dateBlock.raw_text, completionBlock.raw_text].join("\n\n"),
    payload: {
      event_kind: "press release",
      date_text: "October 31, 2023",
      description: "NYC DOT announced on October 31, 2023 that the East Gun Hill Road Bus Priority and Safety project was substantially complete. The publication date is not asserted as the exact first physical completion or operational-onset day.",
    },
    evidence_refs: [
      evidence(dateBlock, "publication_date", "October 31, 2023"),
      evidence(completionBlock, "completion_status_as_of_publication", "substantial completion"),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: treatmentLocalId,
    create_new: true,
    label: "East Gun Hill Road bus lanes, Bainbridge Avenue to Bartow Avenue",
    raw_text: segmentScopeBlock.raw_text,
    payload: {
      treatment_kind: "mixed offset, center-running, and curbside bus lanes",
      treatment_family: "bus_lane",
      location_text: "East Gun Hill Road from Bainbridge Avenue to Bartow Avenue",
      description: "3.1 miles of bus lanes bounded to East Gun Hill Road from Bainbridge Avenue to Bartow Avenue; lane designs include offset, center-running, and curbside segments.",
    },
    evidence_refs: [
      evidence(segmentScopeBlock, "atomic_treatment_definition", "from Bainbridge Avenue to Bartow Avenue"),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_gun_hill_road_bus_lanes_has_completion_announcement_2023_10_31",
    create_new: true,
    label: "Gun Hill Road bus lanes have October 31, 2023 substantial-completion announcement",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: eventLocalId,
      subject_id: PROJECT_ID,
      object_id: EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2023-10-31",
      description: "The official release establishes that the bounded project was substantially complete as of its October 31, 2023 publication; it does not establish the exact first physical completion day.",
    },
    evidence_refs: [evidence(completionBlock, "completion_status_as_of_publication", "substantial completion")],
  },
  {
    source_id: MTA_COMPLETION_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_gun_hill_road_bus_lanes_has_completion_2023_10_31",
    create_new: true,
    label: "Gun Hill Road bus lanes have October 31, 2023 completion phase",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: "project_gun_hill_road_bus_lanes",
      object_local_observation_id: completionEventLocalId,
      subject_id: PROJECT_ID,
      object_id: COMPLETION_EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2023-10-31",
      description: "MTA identifies October 31, 2023 as the completion phase for 3.1 miles of Gun Hill Road bus lanes; the relation does not assert first operational onset.",
    },
    evidence_refs: [
      mtaEvidence(mtaCompletionBlock, "timeline_relation", "completed on October 31st"),
      mtaEvidence(mtaReportMonthBlock, "completion_year_context", "November 2023"),
    ],
  },
  ...[
    {
      localId: "relation_gun_hill_completion_affects_bx28",
      routeLocalId: "route_meeting_doc_127471_bx28",
      routeRecordId: BX28_ROUTE_ID,
      routeId: "Bx28",
    },
    {
      localId: "relation_gun_hill_completion_affects_bx38",
      routeLocalId: "route_meeting_doc_127471_bx38",
      routeRecordId: BX38_ROUTE_ID,
      routeId: "Bx38",
    },
  ].map(({ localId, routeLocalId, routeRecordId, routeId }): MtaSubmitObservationInput => ({
    source_id: MTA_COMPLETION_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: localId,
    create_new: true,
    label: `Gun Hill Road completion affects ${routeId}`,
    payload: {
      relation_kind: "affects_route",
      relation_family: "route_scope",
      subject_local_observation_id: completionEventLocalId,
      object_local_observation_id: routeLocalId,
      subject_id: COMPLETION_EVENT_ID,
      object_id: routeRecordId,
      assertion_status: "delivered",
      as_of_date: "2023-10-31",
      description: `The October 31 completion phase covers ${routeId}: MTA proves the completion phase and NYC DOT directly binds the completed bounded bus-lane project to ${routeId}.`,
    },
    evidence_refs: [
      mtaEvidence(mtaCompletionBlock, "completion_phase", "completed on October 31st"),
      evidence(routeScopeBlock, "route_scope", "Bx28 and Bx38 routes"),
      evidence(segmentScopeBlock, "treated_segment_scope", "from Bainbridge Avenue to Bartow Avenue"),
    ],
  })),
  {
    source_id: MTA_COMPLETION_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_gun_hill_bainbridge_bartow_lanes_has_completion_2023_10_31",
    create_new: true,
    label: "Bounded Gun Hill Road bus lanes have October 31, 2023 completion phase",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: mtaTreatmentLocalId,
      object_local_observation_id: completionEventLocalId,
      subject_id: TREATMENT_ID,
      object_id: COMPLETION_EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2023-10-31",
      description: "The 3.1-mile Gun Hill Road bus-lane treatment has the exact October 31, 2023 completion phase; this does not assert first operational onset.",
    },
    evidence_refs: [
      mtaEvidence(mtaCompletionBlock, "timeline_relation", "completed on October 31st"),
      mtaEvidence(mtaReportMonthBlock, "completion_year_context", "November 2023"),
      evidence(segmentScopeBlock, "bounded_treatment_segment", "from Bainbridge Avenue to Bartow Avenue"),
    ],
  },
  ...[
    { localId: "relation_gun_hill_project_serves_bx28_dot_2023", targetId: BX28_EXISTING_RELATION_ID, routeLocalId: bx28LocalId, routeRecordId: BX28_ROUTE_ID, routeId: "Bx28" },
    { localId: "relation_gun_hill_road_bus_lanes_serves_bx38", targetId: null, routeLocalId: bx38LocalId, routeRecordId: BX38_ROUTE_ID, routeId: "Bx38" },
  ].map(({ localId, targetId, routeLocalId, routeRecordId, routeId }): MtaSubmitObservationInput => ({
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: localId,
    ...(targetId ? { target_record_id: targetId } : { create_new: true }),
    label: `East Gun Hill Road bus lanes serve ${routeId}`,
    payload: {
      relation_kind: "serves_route",
      relation_family: "route_scope",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: routeLocalId,
      subject_id: PROJECT_ID,
      object_id: routeRecordId,
      assertion_status: "delivered",
      as_of_date: "2023-10-31",
      description: `The official completion release explicitly identifies ${routeId} as served by the bounded East Gun Hill Road bus-lane project.`,
    },
    evidence_refs: [
      evidence(routeScopeBlock, "route_scope", `Bx28 and Bx38 routes`),
      evidence(segmentScopeBlock, "treated_segment_scope", "from Bainbridge Avenue to Bartow Avenue"),
    ],
  })),
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_gun_hill_road_project_has_bainbridge_bartow_bus_lanes",
    create_new: true,
    label: "Gun Hill Road project has bounded mixed-design bus lanes",
    payload: {
      relation_kind: "has_treatment",
      relation_family: "treatment_context",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: treatmentLocalId,
      subject_id: PROJECT_ID,
      object_id: TREATMENT_ID,
      assertion_status: "delivered",
      as_of_date: "2023-10-31",
      description: "The official release binds the project to 3.1 miles of mixed-design bus lanes between Bainbridge and Bartow avenues.",
    },
    evidence_refs: [evidence(segmentScopeBlock, "treatment_scope", "from Bainbridge Avenue to Bartow Avenue")],
  },
];

function requiredRecord(recordsById: ReadonlyMap<string, MtaCanonicalRecord>, recordId: string, kind: MtaCanonicalRecord["record_kind"]): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  assert(record?.record_kind === kind, `Missing ${kind} target ${recordId}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
  return record;
}

const recordsById = new Map(readCanonicalRecordsFromJsonl().map((record) => [record.record_id, record]));
assert(requiredRecord(recordsById, PROJECT_ID, "project").payload.completion_status_as_of === "2023-10-31", `${PROJECT_ID} status-as-of date changed`);
assert(requiredRecord(recordsById, BX28_ROUTE_ID, "route").payload.route_id === "Bx28", "Bx28 route identity changed");
assert(requiredRecord(recordsById, BX38_ROUTE_ID, "route").payload.route_id === "Bx38", "Bx38 route identity changed");
assert(requiredRecord(recordsById, BX28_EXISTING_RELATION_ID, "relation").payload.object_id === BX28_ROUTE_ID, "Existing Bx28 relation changed");
for (const [recordId, kind] of [[EVENT_ID, "event"], [COMPLETION_EVENT_ID, "event"], [TREATMENT_ID, "treatment_component"], [TIMELINE_RELATION_ID, "relation"], [COMPLETION_RELATION_ID, "relation"], [COMPLETION_BX28_RELATION_ID, "relation"], [COMPLETION_BX38_RELATION_ID, "relation"], [TREATMENT_COMPLETION_RELATION_ID, "relation"], [BX38_RELATION_ID, "relation"], [TREATMENT_RELATION_ID, "relation"]] as const) {
  const record = recordsById.get(recordId);
  if (record) assert(record.record_kind === kind, `${recordId} changed kind`);
}

const fixedTimestamp = "2026-07-14T22:45:00.000Z";
const existingSubmissionIds = new Set(readSubmissionEntries().map((entry) => entry.submission_id));
const previews = observations.map((observation) => createSubmissionEntry(RUN_ID, observation, fixedTimestamp));
for (const entry of previews) {
  assert(entry.validation.state === "accepted", `${entry.submission_id} rejected: ${entry.validation.issues.join("; ")}`);
}
const pendingIds = new Set(previews.filter((entry) => !existingSubmissionIds.has(entry.submission_id)).map((entry) => entry.submission_id));
const apply = process.argv.includes("--apply");
if (apply) {
  for (const observation of observations) {
    const preview = createSubmissionEntry(RUN_ID, observation, fixedTimestamp);
    if (!pendingIds.has(preview.submission_id)) continue;
    const written = appendSubmission(RUN_ID, observation);
    assert(written.validation.state === "accepted", `${written.submission_id} rejected while applying: ${written.validation.issues.join("; ")}`);
  }
}

process.stdout.write(`${JSON.stringify({
  run_id: RUN_ID,
  mode: apply ? "apply" : "dry_run",
  observation_count: observations.length,
  already_present_count: observations.length - pendingIds.size,
  written_count: apply ? pendingIds.size : 0,
  source_id: SOURCE_ID,
  project_id: PROJECT_ID,
  event_id: EVENT_ID,
  completion_event_id: COMPLETION_EVENT_ID,
  treatment_id: TREATMENT_ID,
  route_record_ids: [BX28_ROUTE_ID, BX38_ROUTE_ID],
  gtfs_route_ids: ["BX28", "BX38"],
  relation_record_ids: [TIMELINE_RELATION_ID, COMPLETION_RELATION_ID, COMPLETION_BX28_RELATION_ID, COMPLETION_BX38_RELATION_ID, TREATMENT_COMPLETION_RELATION_ID, BX28_RELATION_ID, BX38_RELATION_ID, TREATMENT_RELATION_ID],
  submission_ids: previews.map((entry) => entry.submission_id),
}, null, 2)}\n`);
