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

const RUN_ID = "2026-07-13_codex_express-bus-trip-additions-june-2024";
const ANNOUNCEMENT_SOURCE_ID = "mta_express_bus_service_increases_june30_2024";
const RETROSPECTIVE_SOURCE_ID = "meeting_doc_146846";
const PROJECT_ID = "project_summer-2024-express-bus-service-additions";
const EVENT_ID = "event_express-bus-service-increases-begin-june-30-2024";
const TREATMENT_ID = "treatment_weekday-express-bus-trip-additions-summer-2024";

const projectLocalId = "project_summer_2024_express_bus_service_additions";
const eventLocalId = "event_express_bus_service_increases_begin_june_30_2024";
const treatmentLocalId = "treatment_weekday_express_bus_trip_additions_summer_2024";

const routeSpecs = [
  {
    label: "BM2",
    recordId: "route_bm2-brt-south-brooklyn-2017",
    localId: "route_bm2_express_summer_2024_realized",
    blockId: "p002_c0013",
  },
  {
    label: "BM5",
    recordId: "route_bm5-brt-south-brooklyn-2017",
    localId: "route_bm5_express_summer_2024_realized",
    blockId: "p002_c0013",
  },
  {
    label: "SIM1C",
    recordId: "route_sim1c-meeting-doc-138456",
    localId: "route_sim1c_express_summer_2024_realized",
    blockId: "p002_c0013",
  },
  {
    label: "SIM4C",
    recordId: "route_sim4c-meeting-doc-138456",
    localId: "route_sim4c_express_summer_2024_realized",
    blockId: "p002_c0013",
  },
  {
    label: "SIM23",
    recordId: "route_sim23-madison-ave-cb6-jun2025",
    localId: "route_sim23_express_summer_2024_realized",
    blockId: "p003_c0004",
  },
  {
    label: "SIM24",
    recordId: "route_sim24-madison-ave-cb6-jun2025",
    localId: "route_sim24_express_summer_2024_realized",
    blockId: "p003_c0004",
  },
] as const;

const sourcePins = {
  [ANNOUNCEMENT_SOURCE_ID]: {
    artifacts: {
      "source.html": "c29212414313be791e3da367507080bd163c614824f8b2732233ad313d6f71c9",
      "text.txt": "b79df3e2aa81c9795e775cefd9541c8e2ac5494c9470674c3a236898d96cd637",
      "blocks.jsonl": "1898c0bec5714e0e395900ae6f1ab2032b7ab8ab091846fc577ad07fa897b037",
    },
    blocks: {
      p001_b0043: {
        sha256: "sha256:59b74d0a70b335cb9dc297283674267df99f47cf0a6d141980bdbc63d0b5cf9f",
        literal: "MTA Approves Commuter Rail Discounts",
      },
      p001_b0046: {
        sha256: "sha256:1d4acead94f50a5a08cfa2148435a64af964f4d19e7b37a654710587c4ee3fb6",
        literal: "Updated Apr 30, 2024",
      },
      p001_b0050: {
        sha256: "sha256:bdae9d7af51a302e039dc31027f8d01aad5041d1fb01644bf165b08682f6ce5b",
        literal: "will begin on June 30",
      },
    },
  },
  [RETROSPECTIVE_SOURCE_ID]: {
    artifacts: {
      "source.pdf": "4964f5e1a274a0366b8135b1171fdc70cd0a84e416474810acf0097271c9fde1",
      "blocks.jsonl": "49cb90ac8f6cc6bee372c39a79147467009df580eda4854344d947a60dbce3e3",
    },
    blocks: {
      p001_c0002: {
        sha256: "sha256:9040c20f1ddf6eabd43d88e51411511f685d6746876d81a37da0060dda003e76",
        literal: "Fall 2024 Readjustment of Express Bus Trips",
      },
      p001_c0005: {
        sha256: "sha256:d555d7d98db0b044c261c93f7957c834d15522b467a61ad7041ee9c3e71bf671",
        literal: "Certain weekday trips were added",
      },
      p002_c0013: {
        sha256: "sha256:5f01e56329716c49b27e65e1edf1dbaf0ded2ee45f8a411a6dd0a7235b4905bb",
        literal: "BM2 (MTA Bus)",
      },
      p003_c0004: {
        sha256: "sha256:2d5b66f5689e30fff6dd3a72d0505bf2fa133db542c47e06fe21cc437bd3718c",
        literal: "SIM23 (NYCT)",
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
  for (const [filename, expected] of Object.entries(pin.artifacts)) {
    assert(sha256(readFileSync(sourcePath(sourceId, filename))) === expected, `${sourceId}/${filename} changed`);
  }
  const content = readFileSync(sourcePath(sourceId, "blocks.jsonl"), "utf8");
  const blocks = new Map(
    content
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as SourceBlock)
      .map((block) => [block.block_id, block]),
  );
  for (const [blockId, blockPin] of Object.entries(pin.blocks)) {
    const value = blocks.get(blockId);
    assert(value, `Missing ${sourceId}#${blockId}`);
    assert(value.raw_text_sha256 === blockPin.sha256, `${sourceId}#${blockId} hash changed`);
    assert(value.raw_text.includes(blockPin.literal), `${sourceId}#${blockId} lost pinned literal`);
  }
  return blocks;
}

const blocksBySource = new Map([
  [ANNOUNCEMENT_SOURCE_ID, loadBlocks(ANNOUNCEMENT_SOURCE_ID)],
  [RETROSPECTIVE_SOURCE_ID, loadBlocks(RETROSPECTIVE_SOURCE_ID)],
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

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: ANNOUNCEMENT_SOURCE_ID,
    observation_kind: "source",
    local_observation_id: `source_${ANNOUNCEMENT_SOURCE_ID}`,
    label: "MTA approves more express bus service for Brooklyn and Staten Island",
    raw_text: block(ANNOUNCEMENT_SOURCE_ID, "p001_b0043").raw_text,
    payload: {
      title: "MTA Approves Commuter Rail Discounts for the Bronx and Queens and More Express Bus Service for Brooklyn and Staten Island",
      publisher: "MTA",
      content_type: "official press release",
      publication_date: "April 30, 2024",
      retrieved_at: "2026-07-13T10:04:06.025Z",
      source_url: "https://www.mta.info/press-release/mta-approves-commuter-rail-discounts-bronx-and-queens-and-more-express-bus-service",
      description: "Official MTA announcement of the exact June 30 start date for six express-bus service increases.",
    },
    evidence_refs: [
      evidence(ANNOUNCEMENT_SOURCE_ID, "p001_b0043", "source_title"),
      evidence(ANNOUNCEMENT_SOURCE_ID, "p001_b0046", "publication_date", "Updated Apr 30, 2024 12:45 p.m."),
    ],
  },
  {
    source_id: ANNOUNCEMENT_SOURCE_ID,
    observation_kind: "event",
    local_observation_id: eventLocalId,
    create_new: true,
    label: "Six-route express bus service increases begin June 30, 2024",
    raw_text: block(ANNOUNCEMENT_SOURCE_ID, "p001_b0050").raw_text,
    payload: {
      event_kind: "service expansion start",
      event_family: "implementation",
      lifecycle_phase: "planned",
      date_text: "June 30",
      description: "MTA announced that peak-period service increases on BM2, BM5, SIM1C, SIM4C, SIM23, and SIM24 would begin June 30; a later official staff summary confirms the trips were added.",
    },
    evidence_refs: [
      evidence(
        ANNOUNCEMENT_SOURCE_ID,
        "p001_b0050",
        "announced_exact_start_date_and_route_scope",
        "The express bus route service increases will begin on June 30",
      ),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "project",
    local_observation_id: projectLocalId,
    label: "Summer 2024 Express Bus Service Additions",
    raw_text: block(RETROSPECTIVE_SOURCE_ID, "p001_c0005").raw_text,
    payload: {
      project_name: "Summer 2024 Express Bus Service Additions",
      project_type: "bus service change",
      status: "implemented",
      description: "Weekday peak-period trips added to BM2, BM5, SIM1C, SIM4C, SIM23, and SIM24 in summer 2024.",
      agency: "MTA New York City Transit",
    },
    evidence_refs: [evidence(RETROSPECTIVE_SOURCE_ID, "p001_c0005", "implemented_project_status")],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: treatmentLocalId,
    create_new: true,
    label: "Weekday express bus trip additions",
    raw_text: block(RETROSPECTIVE_SOURCE_ID, "p001_c0005").raw_text,
    payload: {
      treatment_kind: "weekday trip additions",
      treatment_family: "service_pattern",
      description: "Additional weekday peak-period trips on six express bus routes.",
    },
    evidence_refs: [evidence(RETROSPECTIVE_SOURCE_ID, "p001_c0005", "delivered_treatment_definition")],
  },
  ...routeSpecs.map<MtaSubmitObservationInput>((route) => ({
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "route",
    local_observation_id: route.localId,
    target_record_id: route.recordId,
    label: route.label,
    raw_text: block(RETROSPECTIVE_SOURCE_ID, route.blockId).raw_text,
    payload: {
      route_id: route.label,
      route_label: route.label,
      route_type: "express",
    },
    evidence_refs: [
      evidence(RETROSPECTIVE_SOURCE_ID, route.blockId, "delivered_route_identity_and_trip_pattern", route.label),
    ],
  })),
  ...routeSpecs.map<MtaSubmitObservationInput>((route) => ({
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: `relation_summer_2024_express_additions_affect_${route.label.toLowerCase()}`,
    label: `Summer 2024 express bus additions affect ${route.label}`,
    payload: {
      relation_kind: "affects_route",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: route.localId,
      assertion_status: "delivered",
      as_of_date: "2024-07-16",
      description: `The July retrospective confirms that the added weekday trip pattern was delivered on ${route.label}.`,
    },
    evidence_refs: [evidence(RETROSPECTIVE_SOURCE_ID, route.blockId, "delivered_route_scope", route.label)],
  })),
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_summer_2024_express_additions_has_weekday_trip_additions",
    label: "Summer 2024 express bus additions have weekday trip-addition treatment",
    payload: {
      relation_kind: "has_treatment",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: treatmentLocalId,
      assertion_status: "delivered",
      as_of_date: "2024-07-16",
      description: "The July retrospective confirms that weekday trips had been added on the six express routes.",
    },
    evidence_refs: [evidence(RETROSPECTIVE_SOURCE_ID, "p001_c0005", "delivered_treatment_scope")],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_summer_2024_express_additions_has_june_30_start",
    label: "Summer 2024 express bus additions have June 30 start event",
    payload: {
      relation_kind: "has_timeline_event",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: eventLocalId,
      subject_id: PROJECT_ID,
      object_id: EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2024-07-16",
      description: "The July retrospective confirms delivery of the six-route trip additions that the official April announcement scheduled to begin June 30.",
    },
    evidence_refs: [evidence(RETROSPECTIVE_SOURCE_ID, "p001_c0005", "retrospective_delivered_timeline_status")],
  },
];

const recordsById = new Map(readCanonicalRecordsFromJsonl().map((record) => [record.record_id, record]));
for (const route of routeSpecs) {
  const record = recordsById.get(route.recordId);
  assert(record?.record_kind === "route", `Missing route target ${route.recordId}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${route.recordId} is not usable`);
}
const priorMonthEvent = recordsById.get("event_express-bus-additions-june2024");
assert(priorMonthEvent?.record_kind === "event", "Missing prior June 2024 planning event");
assert(priorMonthEvent.payload.date_normalized === "2024-06", "Prior planning event date changed");
for (const [recordId, kind] of [
  [PROJECT_ID, "project"],
  [EVENT_ID, "event"],
  [TREATMENT_ID, "treatment_component"],
] as const) {
  const record = recordsById.get(recordId);
  if (record) assert(record.record_kind === kind, `${recordId} changed kind`);
}

const existingSubmissionIds = new Set(readSubmissionEntries().map((entry) => entry.submission_id));
const previews = observations.map((observation) =>
  createSubmissionEntry(RUN_ID, observation, "2026-07-13T10:15:00.000Z"),
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
    const preview = createSubmissionEntry(RUN_ID, observation, "2026-07-13T10:15:00.000Z");
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
  project_id: PROJECT_ID,
  event_id: EVENT_ID,
  treatment_id: TREATMENT_ID,
  route_record_ids: routeSpecs.map((route) => route.recordId),
  source_ids: [ANNOUNCEMENT_SOURCE_ID, RETROSPECTIVE_SOURCE_ID],
  submission_ids: previews.map((entry) => entry.submission_id),
}, null, 2)}\n`);
