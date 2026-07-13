import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import type {
  MtaCanonicalRecord,
  MtaEvidenceSubmissionRef,
  MtaSubmitObservationInput,
} from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import {
  appendSubmission,
  createSubmissionEntry,
  readSubmissionEntries,
} from "../packages/pipeline/src/records/submissions.js";

const RUN_ID = "2026-07-13_codex_flatbush-phase1-installation-september-2025";
const START_SOURCE_ID = "nyc_dot_flatbush_installation_begins_2025";
const RETROSPECTIVE_SOURCE_ID = "flatbush_ave_bus_priority_mtp_briefing_apr2026";

const UMBRELLA_PROJECT_ID = "project_flatbush-avenue-bus-priority-brooklyn";
const PHASE_PROJECT_ID = "project_flatbush-phase1-center-running-bus-lanes-livingston-state";
const START_EVENT_ID = "event_flatbush-phase1-installation-start-sep2025";
const COMPLETION_EVENT_ID = "event_flatbush-av-phase1-installed-fall2025";
const TREATMENT_ID = "treatment_flatbush-phase1-center-running-bus-lanes-livingston-state";
const B41_ROUTE_ID = "route_b41-ace";
const B67_ROUTE_ID = "route_b67-flatbush-ave-apr2026";

const phaseProjectLocalId = "project_flatbush_phase1_center_running_bus_lanes_livingston_state";
const startEventLocalId = "event_flatbush_phase1_installation_start_sep2025";
const completionEventLocalId = "event_flatbush_av_phase1_installed_fall2025";
const treatmentLocalId = "treatment_flatbush_phase1_center_running_bus_lanes_livingston_state";
const b41LocalId = "route_b41_flatbush_phase1_sep2025";
const b67LocalId = "route_b67_flatbush_ave_apr2026";

const sourcePins = {
  [START_SOURCE_ID]: {
    artifacts: {
      "metadata.json": "03f92386d2e6de2facff88444745e2e278ea235cdfdab28c31c4935e3a7257f3",
      "source.html": "42e3fce8811426b7d9e25aa0006410cdd8cfa3cd5acd0802e5801e778cc4ceef",
      "blocks.jsonl": "2812da6393c39a0c16dc4123730c2875a2f468d98e6cbb75bd4141966e0d303b",
    },
    blocks: {
      date: {
        blockId: "p001_b0010",
        sha256: "sha256:4fef80e1db0fa85209905b3c4a19a99c88d1a6daee024e17f8756ace80490109",
        literals: ["September 25, 2025"],
      },
      start: {
        blockId: "p001_b0016",
        sha256: "sha256:7c79ef32ed8ded041b89c331891e98770b5a811e6220ce1f756c75cf6c833273",
        literals: ["work will start this week", "center-running bus lanes"],
      },
      phaseScope: {
        blockId: "p001_b0019",
        sha256: "sha256:30013ba6828a02a6e555ca70f1e04b4ea1a417a91797600a3df13fb8e2b3180a",
        literals: ["between Livingston Street and State Street", "remaining work to be completed next year"],
      },
      b41: {
        blockId: "p001_b0021",
        sha256: "sha256:b1dba41e356e7d7c3c9b1c3de4a953e710a554b1445cd38d292406e96eada3ac",
        literals: ["B41", "serves nearly the entire eight-mile Flatbush Avenue corridor"],
      },
      completionForecast: {
        blockId: "p001_b0030",
        sha256: "sha256:9dd1c4270b6411aa26140a6c4d1912c4e24960c57b24b8a987f8a363a2a4ee7c",
        literals: ["first two blocks of bus lanes", "should be completed within two weeks"],
      },
    },
  },
  [RETROSPECTIVE_SOURCE_ID]: {
    artifacts: {
      "metadata.json": "7de89144dcb896ad64ae3b14f29df6d8ae4fe29ca530ebfa8615cfd2f1d456a7",
      "source.pdf": "1041b579d5a32ed1be7bb247a0ead5384d7d67119a88adab4f985e9fd93ae5f6",
      "blocks.jsonl": "4a13c7a218c0f16f7ceb483a1117a5703caaee83c64b8e6b315d32a3312072b6",
    },
    blocks: {
      deliveredPhase: {
        blockId: "p004_c0002",
        sha256: "sha256:04e364443480c8b2cda313fd5461a4e0c68f70b891b2d9d39735d13513839e29",
        literals: [
          "split implementation of the design into two phases",
          "Last fall, DOT installed center-running bus lanes between Livingston St and State St",
        ],
      },
      routeScope: {
        blockId: "p012_c0003",
        sha256: "sha256:a09c92b214644314aa222043296bc4de95d621c270347d9c1800af0f664410aa",
        literals: ["B41 and B67 buses traveling straight in the bus lanes along Flatbush Av"],
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

for (const [sourceId, pin] of Object.entries(sourcePins)) {
  for (const [filename, expected] of Object.entries(pin.artifacts)) {
    assert(sha256(readFileSync(sourcePath(sourceId, filename))) === expected, `${sourceId}/${filename} changed`);
  }
}

const sourceBlocks = new Map<string, Map<string, SourceBlock>>();
for (const sourceId of Object.keys(sourcePins)) {
  sourceBlocks.set(
    sourceId,
    new Map(
      readFileSync(sourcePath(sourceId, "blocks.jsonl"), "utf8")
        .split(/\r?\n/u)
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as SourceBlock)
        .map((block) => [block.block_id, block]),
    ),
  );
}

function pinnedBlock(
  sourceId: keyof typeof sourcePins,
  key: keyof (typeof sourcePins)[typeof sourceId]["blocks"],
): SourceBlock {
  const pin = sourcePins[sourceId].blocks[key] as { blockId: string; sha256: string; literals: readonly string[] };
  const block = sourceBlocks.get(sourceId)?.get(pin.blockId);
  assert(block, `Missing ${sourceId}#${pin.blockId}`);
  assert(block.raw_text_sha256 === pin.sha256, `${sourceId}#${pin.blockId} hash changed`);
  for (const literal of pin.literals) {
    assert(block.raw_text.includes(literal), `${sourceId}#${pin.blockId} lost ${JSON.stringify(literal)}`);
  }
  return block;
}

const dateBlock = pinnedBlock(START_SOURCE_ID, "date");
const startBlock = pinnedBlock(START_SOURCE_ID, "start");
const phaseScopeBlock = pinnedBlock(START_SOURCE_ID, "phaseScope");
const b41Block = pinnedBlock(START_SOURCE_ID, "b41");
const completionForecastBlock = pinnedBlock(START_SOURCE_ID, "completionForecast");
const deliveredPhaseBlock = pinnedBlock(RETROSPECTIVE_SOURCE_ID, "deliveredPhase");
const routeScopeBlock = pinnedBlock(RETROSPECTIVE_SOURCE_ID, "routeScope");

function evidence(sourceId: string, block: SourceBlock, role: string, sourceQuote?: string): MtaEvidenceSubmissionRef {
  return {
    source_id: sourceId,
    evidence_id: `${sourceId}#${block.block_id}`,
    source_path: `raw/sources/${sourceId}/blocks.jsonl`,
    page_number: block.page_number,
    block_id: block.block_id,
    text_sha256: block.raw_text_sha256,
    text_source: "raw_text",
    role,
    ...(sourceQuote ? { source_quote: sourceQuote } : {}),
  };
}

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: START_SOURCE_ID,
    observation_kind: "source",
    local_observation_id: `source_${START_SOURCE_ID}`,
    label: "Transformative Flatbush Avenue Bus Lane Installation Begins This Week",
    raw_text: [dateBlock.raw_text, startBlock.raw_text].join("\n\n"),
    payload: {
      title: "Transformative Flatbush Avenue Bus Lane Installation Begins This Week",
      publisher: "New York City Department of Transportation (NYC DOT)",
      content_type: "official press release webpage",
      authority_tier: "press_release",
      date_text: "September 25, 2025",
      source_url: "https://www.nyc.gov/html/dot/html/pr2025/nyc-dot-flatbush-ave.shtml",
      retrieved_at: "2026-07-13T14:14:21Z",
      description: "Official NYC DOT installation-start announcement for the bounded first phase of the Flatbush Avenue center-running bus-lane project.",
    },
    evidence_refs: [
      evidence(START_SOURCE_ID, dateBlock, "publication_date", "September 25, 2025"),
      evidence(START_SOURCE_ID, startBlock, "source_scope", "work will start this week"),
    ],
  },
  {
    source_id: START_SOURCE_ID,
    observation_kind: "project",
    local_observation_id: phaseProjectLocalId,
    create_new: true,
    label: "Flatbush Avenue Phase 1 Center-Running Bus Lanes",
    raw_text: [startBlock.raw_text, phaseScopeBlock.raw_text].join("\n\n"),
    payload: {
      project_name: "Flatbush Avenue Phase 1 Center-Running Bus Lanes",
      project_family: "bus_priority",
      project_type: "center-running bus lanes",
      status: "under construction",
      document_time_status: "planned",
      borough: "Brooklyn",
      lead_agency: "New York City Department of Transportation (NYC DOT)",
      partner_agency: "Metropolitan Transportation Authority (MTA)",
      geography: "Flatbush Avenue between Livingston Street and State Street",
      description: "Bounded Phase 1 implementation unit for center-running bus lanes on the first two blocks of the wider Flatbush Avenue bus-priority project.",
    },
    evidence_refs: [
      evidence(START_SOURCE_ID, startBlock, "phase1_start_announcement", "work will start this week"),
      evidence(
        START_SOURCE_ID,
        phaseScopeBlock,
        "phase1_geography",
        "center-running bus lanes on Flatbush Avenue between Livingston Street and State Street",
      ),
      evidence(START_SOURCE_ID, completionForecastBlock, "phase1_two_block_scope", "first two blocks of bus lanes"),
    ],
  },
  {
    source_id: START_SOURCE_ID,
    observation_kind: "route",
    local_observation_id: b41LocalId,
    target_record_id: B41_ROUTE_ID,
    label: "B41",
    raw_text: b41Block.raw_text,
    payload: {
      route_id: "B41",
    },
    evidence_refs: [
      evidence(
        START_SOURCE_ID,
        b41Block,
        "route_identity",
        "the B41, which serves nearly the entire eight-mile Flatbush Avenue corridor",
      ),
    ],
  },
  {
    source_id: START_SOURCE_ID,
    observation_kind: "event",
    local_observation_id: startEventLocalId,
    create_new: true,
    label: "Flatbush Phase 1 installation starts in September 2025",
    raw_text: [dateBlock.raw_text, startBlock.raw_text, phaseScopeBlock.raw_text].join("\n\n"),
    payload: {
      event_kind: "installation start",
      event_family: "implementation",
      lifecycle_phase: "planned",
      date_text: "week of September 25, 2025",
      date_normalized: "2025-09",
      date_precision: "month",
      description: "NYC DOT announced that installation of Phase 1 center-running bus lanes between Livingston Street and State Street would start during the week of September 25, 2025.",
    },
    evidence_refs: [
      evidence(START_SOURCE_ID, dateBlock, "source_publication_date", "September 25, 2025"),
      evidence(START_SOURCE_ID, startBlock, "installation_start_month", "work will start this week"),
      evidence(
        START_SOURCE_ID,
        phaseScopeBlock,
        "installation_start_treatment_scope",
        "begin installing center-running bus lanes on Flatbush Avenue between Livingston Street and State Street",
      ),
    ],
  },
  {
    source_id: START_SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: treatmentLocalId,
    create_new: true,
    label: "Phase 1 center-running bus lanes, Livingston Street to State Street",
    raw_text: phaseScopeBlock.raw_text,
    payload: {
      treatment_kind: "center-running bus lanes",
      treatment_family: "bus_lane",
      location_text: "Flatbush Avenue between Livingston Street and State Street",
      date_text: "September 2025",
      description: "Phase 1 center-running bus lanes limited to the two-block segment between Livingston Street and State Street; excludes the later State Street-to-Grand Army Plaza treatment bundle.",
    },
    evidence_refs: [
      evidence(
        START_SOURCE_ID,
        phaseScopeBlock,
        "atomic_treatment_definition",
        "center-running bus lanes on Flatbush Avenue between Livingston Street and State Street",
      ),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_flatbush_phase1_has_start_event_sep2025",
    label: "Flatbush Phase 1 has September 2025 installation-start event",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: phaseProjectLocalId,
      object_local_observation_id: startEventLocalId,
      subject_id: PHASE_PROJECT_ID,
      object_id: START_EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2026-04",
      description: "The April 2026 official retrospective confirms that the two-block Phase 1 installation announced for September 2025 was installed during Fall 2025.",
    },
    evidence_refs: [
      evidence(
        RETROSPECTIVE_SOURCE_ID,
        deliveredPhaseBlock,
        "retrospective_delivery_confirmation",
        "Last fall, DOT installed center-running bus lanes between Livingston St and State St",
      ),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_flatbush_phase1_has_completion_event_fall2025",
    label: "Flatbush Phase 1 has Fall 2025 installation-completion event",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: phaseProjectLocalId,
      object_local_observation_id: completionEventLocalId,
      subject_id: PHASE_PROJECT_ID,
      object_id: COMPLETION_EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2026-04",
      description: "The official retrospective directly binds the bounded Phase 1 implementation unit to the Fall 2025 installation-completion record.",
    },
    evidence_refs: [
      evidence(
        RETROSPECTIVE_SOURCE_ID,
        deliveredPhaseBlock,
        "phase1_completion_timeline",
        "Last fall, DOT installed center-running bus lanes between Livingston St and State St",
      ),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_flatbush_phase1_serves_b41",
    label: "Flatbush Phase 1 serves B41",
    payload: {
      relation_kind: "serves_route",
      relation_family: "route_scope",
      subject_local_observation_id: phaseProjectLocalId,
      object_local_observation_id: "route_b41_flatbush_ave_apr2026",
      subject_id: PHASE_PROJECT_ID,
      object_id: B41_ROUTE_ID,
      assertion_status: "delivered",
      as_of_date: "2026-04",
      description: "The official retrospective identifies B41 as traveling straight in the Flatbush Avenue bus lanes; this relation is limited to the bounded Phase 1 project unit.",
    },
    evidence_refs: [
      evidence(RETROSPECTIVE_SOURCE_ID, deliveredPhaseBlock, "delivered_phase1_route_context"),
      evidence(
        RETROSPECTIVE_SOURCE_ID,
        routeScopeBlock,
        "route_scope",
        "B41 and B67 buses traveling straight in the bus lanes along Flatbush Av",
      ),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_flatbush_phase1_serves_b67",
    label: "Flatbush Phase 1 serves B67",
    payload: {
      relation_kind: "serves_route",
      relation_family: "route_scope",
      subject_local_observation_id: phaseProjectLocalId,
      object_local_observation_id: b67LocalId,
      subject_id: PHASE_PROJECT_ID,
      object_id: B67_ROUTE_ID,
      assertion_status: "delivered",
      as_of_date: "2026-04",
      description: "The official retrospective identifies B67 as traveling straight in the Flatbush Avenue bus lanes; this relation is limited to the bounded Phase 1 project unit.",
    },
    evidence_refs: [
      evidence(RETROSPECTIVE_SOURCE_ID, deliveredPhaseBlock, "delivered_phase1_route_context"),
      evidence(
        RETROSPECTIVE_SOURCE_ID,
        routeScopeBlock,
        "route_scope",
        "B41 and B67 buses traveling straight in the bus lanes along Flatbush Av",
      ),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_flatbush_phase1_has_center_running_bus_lanes",
    label: "Flatbush Phase 1 has two-block center-running bus lanes",
    payload: {
      relation_kind: "has_treatment",
      relation_family: "treatment_context",
      subject_local_observation_id: phaseProjectLocalId,
      object_local_observation_id: treatmentLocalId,
      subject_id: PHASE_PROJECT_ID,
      object_id: TREATMENT_ID,
      assertion_status: "delivered",
      as_of_date: "2026-04",
      description: "The official retrospective confirms that the bounded Phase 1 treatment was the center-running bus-lane installation between Livingston Street and State Street.",
    },
    evidence_refs: [
      evidence(
        RETROSPECTIVE_SOURCE_ID,
        deliveredPhaseBlock,
        "treatment_scope",
        "Last fall, DOT installed center-running bus lanes between Livingston St and State St",
      ),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_flatbush_phase1_part_of_flatbush_bus_priority",
    label: "Flatbush Phase 1 is part of the wider Flatbush Avenue bus-priority project",
    payload: {
      relation_kind: "part_of_program",
      relation_family: "program_project_scope",
      subject_local_observation_id: phaseProjectLocalId,
      object_local_observation_id: "project_flatbush_ave_bus_priority_phase2_apr2026",
      subject_id: PHASE_PROJECT_ID,
      object_id: UMBRELLA_PROJECT_ID,
      assertion_status: "delivered",
      as_of_date: "2026-04",
      description: "Phase 1 is the first implementation part of the wider multi-phased Flatbush Avenue bus-priority effort.",
    },
    evidence_refs: [
      evidence(
        RETROSPECTIVE_SOURCE_ID,
        deliveredPhaseBlock,
        "phase_project_hierarchy",
        "Project is first part of multi-phased effort to improve bus service on entirety of Flatbush Avenue",
      ),
    ],
  },
];

function requiredRecord(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
  kind: MtaCanonicalRecord["record_kind"],
): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  assert(record?.record_kind === kind, `Missing ${kind} target ${recordId}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
  return record;
}

const recordsById = new Map(readCanonicalRecordsFromJsonl().map((record) => [record.record_id, record]));
const umbrellaProject = requiredRecord(recordsById, UMBRELLA_PROJECT_ID, "project");
const completionEvent = requiredRecord(recordsById, COMPLETION_EVENT_ID, "event");
const b41 = requiredRecord(recordsById, B41_ROUTE_ID, "route");
const b67 = requiredRecord(recordsById, B67_ROUTE_ID, "route");
assert(umbrellaProject.local_observation_ids?.includes("project_flatbush_ave_bus_priority_phase2_apr2026"), "Umbrella Flatbush project identity changed");
assert(completionEvent.local_observation_ids?.includes(completionEventLocalId), "Phase 1 completion event identity changed");
assert(completionEvent.payload.date_normalized === "2025-fall", "Phase 1 completion season changed");
assert(completionEvent.payload.date_precision === "season", "Phase 1 completion precision changed");
assert(b41.payload.route_id === "B41", "B41 route identity changed");
assert(b67.payload.route_id === "B67", "B67 route identity changed");

for (const [recordId, kind] of [
  [PHASE_PROJECT_ID, "project"],
  [START_EVENT_ID, "event"],
  [TREATMENT_ID, "treatment_component"],
] as const) {
  const existing = recordsById.get(recordId);
  if (existing) assert(existing.record_kind === kind, `${recordId} changed kind`);
}

const existingSubmissionIds = new Set(readSubmissionEntries().map((entry) => entry.submission_id));
const fixedTimestamp = "2026-07-13T18:30:00.000Z";
const previews = observations.map((observation) => createSubmissionEntry(RUN_ID, observation, fixedTimestamp));
for (const entry of previews) {
  if (entry.validation.state !== "accepted") {
    throw new Error(`${entry.submission_id} rejected: ${entry.validation.issues.join("; ")}`);
  }
}
const pendingIds = new Set(
  previews.filter((entry) => !existingSubmissionIds.has(entry.submission_id)).map((entry) => entry.submission_id),
);

const apply = process.argv.includes("--apply");
if (apply) {
  for (const observation of observations) {
    const preview = createSubmissionEntry(RUN_ID, observation, fixedTimestamp);
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
  phase_project_id: PHASE_PROJECT_ID,
  start_event_id: START_EVENT_ID,
  completion_event_id: COMPLETION_EVENT_ID,
  treatment_id: TREATMENT_ID,
  route_record_ids: [B41_ROUTE_ID, B67_ROUTE_ID],
  gtfs_route_ids: ["B41", "B67"],
  source_ids: [START_SOURCE_ID, RETROSPECTIVE_SOURCE_ID],
  submission_ids: previews.map((entry) => entry.submission_id),
}, null, 2)}\n`);
