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

const RUN_ID = "2026-07-13_codex_express-bus-service-enhancements-march-2025";
const PLANNING_SOURCE_ID = "meeting_doc_160441";
const RETROSPECTIVE_SOURCE_ID = "meeting_doc_171141";
const PROJECT_ID = "project_spring-2025-express-bus-service-enhancements";
const PLANNING_EVENT_ID = "event_meeting-doc-160441-express-spring-2025";
const EVENT_ID = "event_express-bus-service-enhancements-took-effect-march-2025";
const TREATMENT_ID = "treatment_weekday-express-bus-trip-additions-spring-2025";

const projectLocalId = "project_spring_2025_express_bus_service_enhancements";
const eventLocalId = "event_express_bus_service_enhancements_took_effect_march_2025";
const treatmentLocalId = "treatment_weekday_express_bus_trip_additions_spring_2025";
const planningProjectLocalId = "project_spring_2025_express_bus_service_enhancements_planning_scope";
const planningTreatmentLocalId = "treatment_weekday_express_bus_trip_additions_spring_2025_planning_scope";

const routeSpecs = [
  { label: "BM2", recordId: "route_bm2-brt-south-brooklyn-2017" },
  { label: "BM5", recordId: "route_bm5-brt-south-brooklyn-2017" },
  { label: "SIM1C", recordId: "route_sim1c-meeting-doc-138456" },
  { label: "SIM4C", recordId: "route_sim4c-meeting-doc-138456" },
  { label: "SIM23", recordId: "route_sim23-madison-ave-cb6-jun2025" },
  { label: "SIM24", recordId: "route_sim24-madison-ave-cb6-jun2025" },
  { label: "X27", recordId: "route_meeting-doc-160441-x27" },
  { label: "QM15", recordId: "route_qm15-qbb-study" },
] as const;

const sourcePins = {
  [PLANNING_SOURCE_ID]: {
    artifacts: {
      "source.pdf": "2cbb8ac03d1b52681982b1bd4d994c17b2f6e6995c1d4806bdf34b0ee8f754b8",
      "blocks.jsonl": "a8e8b7a9a66145447444633e8c96e24afa195d39a8170f6f653c0786fc71efde",
    },
    blocks: {
      p001_c0002: {
        sha256: "sha256:ff0a521477d03db048fa84047ef86ab3512869202e8e6c347a844e1322378179",
        literal: "Service Changes: Bus Service Enhancements",
      },
      p001_c0007: {
        sha256: "sha256:40acfcafc415e14cee2debc1ef57b16bbacd39b8cd13aa03ff0f35bec9fc81ea",
        literal: "eight express bus routes",
      },
      p001_c0012: {
        sha256: "sha256:01e72dd6a057bc1690b0d360ab8a6a68668a346a33dd6fe6de718ebd46e09995",
        literal: "Express bus routes: Spring 2025",
      },
      p002_c0005: {
        sha256: "sha256:9f0ebbb72e351ca1ef2ab2434ccd52c0118885848a4dbe4b127d05dc256bac03",
        literal: "Date December 10, 2024",
      },
      p003_c0004: {
        sha256: "sha256:730a088e5bef117b4b219c33d1ed4a5918f303f53260c116cf651770b2dfedb9",
        literal: "added to the spring 2025 schedules",
      },
      p003_c0005: {
        sha256: "sha256:a1cb3550e548ba0e4cc902da5e264574b62e2318fcfe0a6f5418eb28d04373de",
        literal: "8. QM15 (MTABC)",
      },
    },
  },
  [RETROSPECTIVE_SOURCE_ID]: {
    artifacts: {
      "source.pdf": "51da3489ccb15a3fdf6b2fdbbd8603808cff8fd439215afaf1d5057ca4839d8a",
      "blocks.jsonl": "25919e028d70731b69d171dc15e4d35bbdb5b18e2cbb84b1b84e08036e6fc1af",
    },
    blocks: {
      p001_c0002: {
        sha256: "sha256:e1c50c337a2004c82a5395d5fabda1fba30570da008fbb679c60b747d7bc73ec",
        literal: "Progress Report on Fare and Toll Collection",
      },
      p001_c0003: {
        sha256: "sha256:80aa190c5d97a47a5acde989e25d4d3cfbe123dce4a1d4b36ce74a1efe63058f",
        literal: "April 28, 2025",
      },
      p005_c0003: {
        sha256: "sha256:db189e9145a8c754be91933d52adbc9aaa176fd33d9ceb6ebc781642dde94f80",
        literal: "8 express bus routes took effect in March",
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
      .map((value) => [value.block_id, value]),
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
  [PLANNING_SOURCE_ID, loadBlocks(PLANNING_SOURCE_ID)],
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
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "project",
    local_observation_id: projectLocalId,
    create_new: true,
    label: "Spring 2025 Express Bus Service Enhancements",
    raw_text: block(RETROSPECTIVE_SOURCE_ID, "p005_c0003").raw_text,
    payload: {
      project_name: "Spring 2025 Express Bus Service Enhancements",
      project_type: "bus service change",
      status: "implemented",
      description: "Weekday trip additions on BM2, BM5, SIM1C, SIM4C, SIM23, SIM24, X27, and QM15 took effect in March 2025.",
      agency: "MTA New York City Transit and MTA Bus Company",
      document_time_status: "implemented",
    },
    evidence_refs: [
      evidence(PLANNING_SOURCE_ID, "p001_c0007", "approved_package_definition"),
      evidence(PLANNING_SOURCE_ID, "p003_c0005", "planned_route_and_trip_scope"),
      evidence(RETROSPECTIVE_SOURCE_ID, "p005_c0003", "implemented_project_status", "8 express bus routes took effect in March"),
      evidence(RETROSPECTIVE_SOURCE_ID, "p001_c0003", "status_report_date", "April 28, 2025"),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "event",
    local_observation_id: eventLocalId,
    create_new: true,
    label: "Eight express-bus service enhancements took effect in March 2025",
    raw_text: "8 express bus routes took effect in March",
    payload: {
      event_kind: "express bus service expansion took effect",
      event_family: "implementation",
      lifecycle_phase: "expanded",
      date_text: "March",
      date_normalized: "2025-03",
      date_precision: "month",
      description: "Weekday trip additions on eight express bus routes took effect in March 2025.",
      date_resolution_basis: "The official report is dated April 28, 2025 and retrospectively states that the eight express routes took effect in March.",
    },
    evidence_refs: [
      evidence(RETROSPECTIVE_SOURCE_ID, "p005_c0003", "event_date", "8 express bus routes took effect in March"),
      evidence(RETROSPECTIVE_SOURCE_ID, "p001_c0003", "event_year_context", "April 28, 2025"),
    ],
  },
  {
    source_id: PLANNING_SOURCE_ID,
    observation_kind: "project",
    local_observation_id: planningProjectLocalId,
    target_record_id: PROJECT_ID,
    label: "Spring 2025 Express Bus Service Enhancements",
    raw_text: block(PLANNING_SOURCE_ID, "p001_c0007").raw_text,
    payload: {
      project_name: "Spring 2025 Express Bus Service Enhancements",
      project_type: "bus service change",
      status: "planned",
      description: "The December 2024 staff summary recommends frequency increases and running-time adjustments for eight express routes in the Spring 2025 schedules.",
      agency: "MTA New York City Transit and MTA Bus Company",
      document_time_status: "planned",
    },
    evidence_refs: [
      evidence(PLANNING_SOURCE_ID, "p001_c0007", "planned_package_definition"),
      evidence(PLANNING_SOURCE_ID, "p001_c0012", "prospective_implementation_window", "Express bus routes: Spring 2025"),
      evidence(PLANNING_SOURCE_ID, "p003_c0005", "planned_route_and_trip_scope"),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: treatmentLocalId,
    create_new: true,
    label: "Spring 2025 weekday express-bus trip additions",
    raw_text: block(PLANNING_SOURCE_ID, "p003_c0005").raw_text,
    payload: {
      treatment_kind: "weekday express-bus trip additions",
      treatment_family: "service_pattern",
      description: "Additional weekday peak-period trips on eight express bus routes.",
      location_text: "BM2, BM5, SIM1C, SIM4C, SIM23, SIM24, X27, and QM15",
    },
    evidence_refs: [
      evidence(PLANNING_SOURCE_ID, "p003_c0004", "treatment_definition"),
      evidence(PLANNING_SOURCE_ID, "p003_c0005", "treatment_trip_and_route_scope"),
      evidence(RETROSPECTIVE_SOURCE_ID, "p005_c0003", "retrospective_delivery_status", "8 express bus routes took effect in March"),
    ],
  },
  {
    // Treatment components are source-scoped, so target_record_id cannot perform a
    // global identity merge here. Preserve the planning-source observation as its
    // own journal fact; the guarded semantic correction performs the reviewed fold
    // and carries both records' provenance into the durable survivor.
    source_id: PLANNING_SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: planningTreatmentLocalId,
    create_new: true,
    label: "Spring 2025 weekday express-bus trip additions",
    raw_text: block(PLANNING_SOURCE_ID, "p003_c0005").raw_text,
    payload: {
      treatment_kind: "weekday express-bus trip additions",
      treatment_family: "service_pattern",
      description: "Additional weekday peak-period trips on eight express bus routes.",
      location_text: "BM2, BM5, SIM1C, SIM4C, SIM23, SIM24, X27, and QM15",
    },
    evidence_refs: [
      evidence(PLANNING_SOURCE_ID, "p003_c0004", "treatment_definition"),
      evidence(PLANNING_SOURCE_ID, "p003_c0005", "treatment_trip_and_route_scope"),
    ],
  },
  ...routeSpecs.map<MtaSubmitObservationInput>((route) => ({
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: `relation_spring_2025_express_enhancements_affect_${route.label.toLowerCase()}`,
    label: `Spring 2025 express-bus enhancements affect ${route.label}`,
    payload: {
      relation_kind: "affects_route",
      subject_local_observation_id: projectLocalId,
      subject_id: PROJECT_ID,
      object_id: route.recordId,
      assertion_status: "delivered",
      as_of_date: "2025-04-28",
      description: `The approved eight-route package identifies ${route.label}; the April retrospective confirms that the eight express-route changes took effect in March 2025.`,
    },
    evidence_refs: [
      evidence(PLANNING_SOURCE_ID, "p003_c0005", "route_identity_and_planned_scope", route.label),
      evidence(RETROSPECTIVE_SOURCE_ID, "p005_c0003", "delivered_route_package_scope", "8 express bus routes took effect in March"),
    ],
  })),
  {
    source_id: PLANNING_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_spring_2025_express_enhancements_has_spring_plan",
    label: "Spring 2025 express-bus enhancements have a prospective Spring 2025 implementation milestone",
    payload: {
      relation_kind: "has_timeline_event",
      subject_id: PROJECT_ID,
      object_id: PLANNING_EVENT_ID,
      assertion_status: "planned",
      as_of_date: "2024-12-10",
      description: "The December 10, 2024 staff summary recommends the eight-route package for implementation in the Spring 2025 schedules.",
    },
    evidence_refs: [
      evidence(PLANNING_SOURCE_ID, "p002_c0005", "planning_document_date", "Date December 10, 2024"),
      evidence(PLANNING_SOURCE_ID, "p001_c0007", "planned_package_definition"),
      evidence(PLANNING_SOURCE_ID, "p001_c0012", "prospective_implementation_window", "Express bus routes: Spring 2025"),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_spring_2025_express_enhancements_has_weekday_trip_additions",
    label: "Spring 2025 express-bus enhancements have weekday trip-addition treatment",
    payload: {
      relation_kind: "has_treatment",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: treatmentLocalId,
      subject_id: PROJECT_ID,
      object_id: TREATMENT_ID,
      assertion_status: "delivered",
      as_of_date: "2025-04-28",
      description: "The eight-route weekday trip-addition package took effect in March 2025.",
    },
    evidence_refs: [
      evidence(PLANNING_SOURCE_ID, "p003_c0004", "treatment_scope"),
      evidence(PLANNING_SOURCE_ID, "p003_c0005", "treatment_route_scope"),
      evidence(RETROSPECTIVE_SOURCE_ID, "p005_c0003", "delivered_treatment_scope", "8 express bus routes took effect in March"),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_spring_2025_express_enhancements_has_march_onset",
    label: "Spring 2025 express-bus enhancements have March 2025 onset",
    payload: {
      relation_kind: "has_timeline_event",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: eventLocalId,
      subject_id: PROJECT_ID,
      object_id: EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2025-04-28",
      description: "The April 28, 2025 official report states that the eight express-bus route enhancements took effect in March.",
    },
    evidence_refs: [
      evidence(RETROSPECTIVE_SOURCE_ID, "p005_c0003", "timeline_relation", "8 express bus routes took effect in March"),
      evidence(RETROSPECTIVE_SOURCE_ID, "p001_c0003", "timeline_year_context", "April 28, 2025"),
    ],
  },
];

const recordsById = new Map(readCanonicalRecordsFromJsonl().map((record) => [record.record_id, record]));
for (const route of routeSpecs) {
  const record = recordsById.get(route.recordId);
  assert(record?.record_kind === "route", `Missing route target ${route.recordId}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${route.recordId} is not usable`);
  assert(record.payload.route_id === route.label, `${route.recordId} no longer resolves ${route.label}`);
  assert(
    record.evidence_refs.some((ref) => ref.evidence_id === `${PLANNING_SOURCE_ID}#p003_c0005`),
    `${route.recordId} lacks the pinned eight-route planning table`,
  );
}
const planningEvent = recordsById.get(PLANNING_EVENT_ID);
assert(planningEvent?.record_kind === "event", "Missing Spring 2025 planning event");
assert(planningEvent.payload.date_precision === "season", "Planning event no longer preserves season precision");
assert(
  planningEvent.payload.lifecycle_phase === "other" || planningEvent.payload.lifecycle_phase === "planned",
  "Planning event lifecycle no longer matches its guarded prospective correction",
);
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
  createSubmissionEntry(RUN_ID, observation, "2026-07-13T15:45:00.000Z"),
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
    const preview = createSubmissionEntry(RUN_ID, observation, "2026-07-13T15:45:00.000Z");
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
  source_ids: [PLANNING_SOURCE_ID, RETROSPECTIVE_SOURCE_ID],
  submission_ids: previews.map((entry) => entry.submission_id),
}, null, 2)}\n`);
