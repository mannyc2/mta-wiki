import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import type { MtaCanonicalRecord, MtaEvidenceSubmissionRef, MtaSubmitObservationInput } from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import {
  appendSubmission,
  createSubmissionEntry,
  readSubmissionEntries,
} from "../packages/pipeline/src/records/submissions.js";

const RUN_ID = "2026-07-13_codex_b12-route-improvement-initiative-january-2024";
const SOURCE_ID = "meeting_doc_143341";
const PROJECT_ID = "project_dob-route-improvement-initiative";
const ROUTE_ID = "route_b12-ace";
const EVENT_ID = "event_route-improvement-initiative-start";
const TREATMENT_ID = "treatment_b12-deliberate-proactive-service-management";
const TIMELINE_RELATION_ID = "relation_rii-has-timeline-event-launch";
const ROUTE_RELATION_ID = "relation_rii-serves-b12";

const projectLocalId = "project_dob_route_improvement_initiative_b12_management";
const routeLocalId = "route_b12_transit_all_stars_b12_management";
const treatmentLocalId = "treatment_b12_deliberate_proactive_service_management";
const treatmentRelationLocalId = "relation_rii_b12_has_deliberate_proactive_service_management";

const sourcePins = {
  artifacts: {
    "metadata.json": "feccd263adc23b6ffe733936c178c25615f2cfa8d47fda17da6abef9b7409ac2",
    "source.pdf": "1695a37fe9c8aa7990bc0c52db0ffbe600e90e828a2aa12f8fe58559d07a24d5",
    "blocks.jsonl": "c9fec17bd49d215cb61d46f046e3514dd7405e4cc1bc6ff225bf5451c769be71",
  },
  routeProgram: {
    blockId: "p003_c0005",
    sha256: "sha256:d4f212c84e28586aaa5c1efdf39ad1bd2e9bceefe59f3c41a65a8eb24a5ef308",
    literals: ["improving service on the B12", "DOB's Route Improvement Initiative"],
  },
  onsetAndRoute: {
    blockId: "p003_c0006",
    sha256: "sha256:e87e796834a61be41b21c38fbf6927232956bc72fc86b3270db2fe4fbb99a8da",
    literals: [
      "The B12's 4.3-mile route runs from Prospect Lefferts Gardens to East New York",
      "Since the program's inception in January 2024",
      "service delivery on the B12 has improved",
    ],
  },
  treatmentDefinition: {
    blockId: "p003_c0007",
    sha256: "sha256:d0b1bda9e8de2057087c8ee8d95f01c7b7088e4c55757309ee79dbbead030441",
    literal: "Deliberate and proactive service management, from the road to Bus Command, is a key contributor to these improvements.",
  },
  terminalManagement: {
    blockId: "p003_c0011",
    sha256: "sha256:70c9b0ecb1b5799d9ed3a74181d6dac9d5039c044bc900136a8a0c0f87b1ee30",
    literals: ["managing meal reliefs", "ensuring schedule compliance", "regulating departures"],
  },
  routeManagement: {
    blockId: "p004_c0011",
    sha256: "sha256:1c29eca33f75f2e5d6dda24095e2605d4b4787abf300943c611a099e502ce9ca",
    literals: ["reducing bunching", "improving performance at timepoints", "schedule adherence"],
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

function sourcePath(filename: string): string {
  return join(repoRoot, "raw", "sources", SOURCE_ID, filename);
}

for (const [filename, expected] of Object.entries(sourcePins.artifacts)) {
  assert(sha256(readFileSync(sourcePath(filename))) === expected, `${SOURCE_ID}/${filename} changed`);
}

const blocks = new Map(
  readFileSync(sourcePath("blocks.jsonl"), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SourceBlock)
    .map((block) => [block.block_id, block]),
);

function pinnedBlock(pin: { blockId: string; sha256: string }): SourceBlock {
  const block = blocks.get(pin.blockId);
  assert(block, `Missing ${SOURCE_ID}#${pin.blockId}`);
  assert(block.raw_text_sha256 === pin.sha256, `${SOURCE_ID}#${pin.blockId} hash changed`);
  return block;
}

const routeProgramBlock = pinnedBlock(sourcePins.routeProgram);
const onsetAndRouteBlock = pinnedBlock(sourcePins.onsetAndRoute);
const treatmentDefinitionBlock = pinnedBlock(sourcePins.treatmentDefinition);
const terminalManagementBlock = pinnedBlock(sourcePins.terminalManagement);
const routeManagementBlock = pinnedBlock(sourcePins.routeManagement);

for (const literal of sourcePins.routeProgram.literals) {
  assert(routeProgramBlock.raw_text.includes(literal), `Route/program evidence lost ${JSON.stringify(literal)}`);
}
for (const literal of sourcePins.onsetAndRoute.literals) {
  assert(onsetAndRouteBlock.raw_text.includes(literal), `Onset/route evidence lost ${JSON.stringify(literal)}`);
}
assert(
  treatmentDefinitionBlock.raw_text.includes(sourcePins.treatmentDefinition.literal),
  "Treatment definition literal changed",
);
for (const literal of sourcePins.terminalManagement.literals) {
  assert(terminalManagementBlock.raw_text.includes(literal), `Terminal-management evidence lost ${JSON.stringify(literal)}`);
}
for (const literal of sourcePins.routeManagement.literals) {
  assert(routeManagementBlock.raw_text.includes(literal), `Route-management evidence lost ${JSON.stringify(literal)}`);
}

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

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: SOURCE_ID,
    observation_kind: "project",
    local_observation_id: projectLocalId,
    target_record_id: PROJECT_ID,
    label: "B12 Route Improvement Initiative",
    raw_text: [
      routeProgramBlock.raw_text,
      onsetAndRouteBlock.raw_text,
      treatmentDefinitionBlock.raw_text,
      terminalManagementBlock.raw_text,
      routeManagementBlock.raw_text,
    ].join("\n\n"),
    payload: {
      project_name: "Route Improvement Initiative",
      program: "Department of Buses Route Improvement Initiative",
      status: "active",
      document_time_status: "implemented",
      project_family: "service_change",
      implementing_agency: "NYCT Department of Buses",
      description: "The Department of Buses' Route Improvement Initiative was active on the B12 from January 2024 and used deliberate, proactive service management to improve service delivery and reliability.",
    },
    evidence_refs: [
      evidence(routeProgramBlock, "delivered_project_route_scope", "improving service on the B12"),
      evidence(onsetAndRouteBlock, "delivered_program_onset", "Since the program's inception in January 2024"),
      evidence(
        treatmentDefinitionBlock,
        "delivered_management_description",
        sourcePins.treatmentDefinition.literal,
      ),
      evidence(terminalManagementBlock, "delivered_terminal_management"),
      evidence(routeManagementBlock, "delivered_route_management"),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "route",
    local_observation_id: routeLocalId,
    target_record_id: ROUTE_ID,
    label: "B12",
    raw_text: onsetAndRouteBlock.raw_text,
    payload: {
      route_id: "B12",
      route_name: "B12",
      route_label: "B12",
      route_type: "local",
      borough: "Brooklyn",
      description: "The 4.3-mile B12 runs from Prospect Lefferts Gardens to East New York.",
    },
    evidence_refs: [
      evidence(routeProgramBlock, "delivered_route_identity", "improving service on the B12"),
      evidence(
        onsetAndRouteBlock,
        "delivered_route_description",
        "The B12's 4.3-mile route runs from Prospect Lefferts Gardens to East New York",
      ),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: treatmentLocalId,
    create_new: true,
    label: "B12 deliberate and proactive service management",
    raw_text: treatmentDefinitionBlock.raw_text,
    payload: {
      treatment_kind: "Deliberate and proactive service management",
      treatment_family: "service_pattern",
      description: "B12 service management from the road to Bus Command, including meal-relief management, schedule-compliance work, regulated terminal departures, bunching reduction, timepoint management, and operator schedule adherence.",
      location_text: "B12 route from Prospect Lefferts Gardens to East New York",
    },
    evidence_refs: [
      evidence(
        treatmentDefinitionBlock,
        "delivered_treatment_definition",
        sourcePins.treatmentDefinition.literal,
      ),
      evidence(terminalManagementBlock, "delivered_treatment_strategy"),
      evidence(routeManagementBlock, "delivered_treatment_strategy"),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: treatmentRelationLocalId,
    label: "B12 Route Improvement Initiative has deliberate and proactive service management",
    payload: {
      relation_kind: "has_treatment",
      relation_family: "treatment_scope",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: treatmentLocalId,
      subject_id: PROJECT_ID,
      object_id: TREATMENT_ID,
      assertion_status: "delivered",
      as_of_date: "2024-06",
      description: "The official June 2024 retrospective directly binds the active B12 Route Improvement Initiative to deliberate and proactive service management from the road to Bus Command.",
    },
    evidence_refs: [
      evidence(
        treatmentDefinitionBlock,
        "delivered_treatment_scope",
        sourcePins.treatmentDefinition.literal,
      ),
      evidence(terminalManagementBlock, "delivered_treatment_scope_support"),
      evidence(routeManagementBlock, "delivered_treatment_scope_support"),
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

function assertDeliveredRelation(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
  relationKind: string,
  objectId: string,
): void {
  const relation = requiredRecord(recordsById, recordId, "relation");
  assert(relation.payload.relation_kind === relationKind, `${recordId} relation kind changed`);
  assert(relation.payload.subject_id === PROJECT_ID, `${recordId} subject changed`);
  assert(relation.payload.object_id === objectId, `${recordId} object changed`);
  assert(relation.payload.assertion_status === "delivered", `${recordId} is not delivered`);
}

const recordsById = new Map(readCanonicalRecordsFromJsonl().map((record) => [record.record_id, record]));
const project = requiredRecord(recordsById, PROJECT_ID, "project");
const route = requiredRecord(recordsById, ROUTE_ID, "route");
const event = requiredRecord(recordsById, EVENT_ID, "event");
assert(project.local_observation_ids?.includes("project_dob_route_improvement_initiative"), `${PROJECT_ID} local identity changed`);
assert(route.local_observation_ids?.includes("route_b12_transit_all_stars"), `${ROUTE_ID} lost its source-local B12 identity`);
assert(event.local_observation_ids?.includes("event_route_improvement_initiative_start"), `${EVENT_ID} local identity changed`);
assert(event.payload.event_family === "launch", `${EVENT_ID} family changed`);
assert(event.payload.lifecycle_phase === "launched", `${EVENT_ID} lifecycle changed`);
assert(event.payload.date_normalized === "2024-01" && event.payload.date_precision === "month", `${EVENT_ID} onset changed`);
assert(
  event.evidence_refs.some(
    (ref) => ref.source_id === SOURCE_ID && ref.evidence_id === `${SOURCE_ID}#${sourcePins.onsetAndRoute.blockId}`,
  ),
  `${EVENT_ID} lost its exact onset evidence`,
);
assertDeliveredRelation(recordsById, TIMELINE_RELATION_ID, "has_timeline_event", EVENT_ID);
assertDeliveredRelation(recordsById, ROUTE_RELATION_ID, "serves_route", ROUTE_ID);

const existingTreatment = recordsById.get(TREATMENT_ID);
if (existingTreatment) {
  assert(existingTreatment.record_kind === "treatment_component", `${TREATMENT_ID} changed kind`);
  assert(existingTreatment.payload.treatment_family === "service_pattern", `${TREATMENT_ID} family changed`);
}

const existingSubmissionIds = new Set(readSubmissionEntries().map((entry) => entry.submission_id));
const fixedTimestamp = "2026-07-13T14:00:00.000Z";
const previews = observations.map((observation) => createSubmissionEntry(RUN_ID, observation, fixedTimestamp));
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
  project_id: PROJECT_ID,
  route_id: ROUTE_ID,
  reused_event_id: EVENT_ID,
  treatment_id: TREATMENT_ID,
  reused_relation_ids: [TIMELINE_RELATION_ID, ROUTE_RELATION_ID],
  primary_source_id: SOURCE_ID,
  submission_ids: previews.map((entry) => entry.submission_id),
}, null, 2)}\n`);
