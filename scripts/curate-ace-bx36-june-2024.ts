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

const RUN_ID = "2026-07-13_codex_ace-bx36-june-2024";
const SOURCE_ID = "tremont_ave_bus_priority_cb6_nov2024";
const PROJECT_ID = "project_ace-automated-camera-enforcement";
const ROUTE_ID = "route_bx36";
const EVENT_ID = "event_tremont-ace-cameras-operative";
const TREATMENT_ID = "treatment_bx36-ace-activation-tremont-avenue";

const projectLocalId = "project_ace_bx36_activation_2024";
const routeLocalId = "route_bx36_ace_activation_2024";
const existingEventLocalId = "event_tremont_ace_cameras_operative";
const treatmentLocalId = "treatment_bx36_ace_activation_tremont_avenue";

const sourcePins = {
  artifacts: {
    "metadata.json": "8572ea57178f9787e66f255e9f91481e6a81d48e62782ba06d841462f6179613",
    "source.pdf": "2ec4f90aedaf642034466263dcbc124f2525774bad9a61529b4488b11caf1c6d",
    "blocks.jsonl": "9796447d6649d53ca5ae6c8c7fb46407e0490abff4b1312e1be66d37785a1834",
  },
  publication: {
    blockId: "p001_c0003",
    sha256: "sha256:44107b4ca4a67a4b07495e7f47adcb755f778c1df41f5525a95eccf7d76462a4",
    literal: "November 14, 2024",
  },
  activation: {
    blockId: "p026_c0002",
    sha256: "sha256:628378b1a7db2a7e622d1f0e79ca61e6f1593f096a1e9732e5adaff5c05adfc2",
    literals: [
      "ACE on-bus and fixed-location cameras",
      "ACE cameras in effect on Tremont Av (Bx36 route) since 6/20/24",
      "After activation, cameras issue warnings only for the first 60 days",
    ],
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
const publicationBlock = blocks.get(sourcePins.publication.blockId);
const activationBlock = blocks.get(sourcePins.activation.blockId);
assert(publicationBlock, `Missing ${SOURCE_ID}#${sourcePins.publication.blockId}`);
assert(activationBlock, `Missing ${SOURCE_ID}#${sourcePins.activation.blockId}`);
assert(publicationBlock.raw_text_sha256 === sourcePins.publication.sha256, "Publication block hash changed");
assert(publicationBlock.raw_text.includes(sourcePins.publication.literal), "Publication date literal changed");
assert(activationBlock.raw_text_sha256 === sourcePins.activation.sha256, "Activation block hash changed");
for (const literal of sourcePins.activation.literals) {
  assert(activationBlock.raw_text.includes(literal), `Activation block lost ${JSON.stringify(literal)}`);
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

const exactActivationQuote = "ACE cameras in effect on Tremont Av (Bx36 route) since 6/20/24";

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: SOURCE_ID,
    observation_kind: "project",
    local_observation_id: projectLocalId,
    target_record_id: PROJECT_ID,
    label: "Automated Camera Enforcement (ACE) Bx36 activation",
    raw_text: activationBlock.raw_text,
    payload: {
      project_name: "Automated Camera Enforcement (ACE)",
      project_type: "automated camera enforcement",
      status: "active",
      document_time_status: "implemented",
      project_family: "enforcement_program",
      description: "ACE camera enforcement was in effect on Tremont Avenue on the Bx36 route since June 20, 2024.",
    },
    evidence_refs: [
      evidence(activationBlock, "delivered_project_status", exactActivationQuote),
      evidence(publicationBlock, "retrospective_document_date", "November 14, 2024"),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "route",
    local_observation_id: routeLocalId,
    target_record_id: ROUTE_ID,
    label: "Bx36",
    raw_text: "Bx36 route",
    payload: {
      route_id: "Bx36",
      route_label: "Bx36",
      route_type: "bus",
    },
    evidence_refs: [evidence(activationBlock, "delivered_route_identity", "Bx36 route")],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: treatmentLocalId,
    create_new: true,
    label: "Bx36 ACE activation on Tremont Avenue",
    raw_text: activationBlock.raw_text,
    payload: {
      treatment_kind: "Automated Camera Enforcement (ACE) activation",
      treatment_family: "automated_bus_lane_enforcement",
      description: "Activation of ACE on-bus and fixed-location camera enforcement on Tremont Avenue for the Bx36 route.",
      location_text: "Tremont Avenue (Bx36 route)",
    },
    evidence_refs: [
      evidence(
        activationBlock,
        "delivered_treatment_definition",
        "ACE on-bus and fixed-location cameras enforce illegal parking in bus stops, double parking, and violations of required turns on the busway",
      ),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_ace_bx36_has_june_20_2024_activation",
    label: "ACE has Bx36 activation on June 20, 2024",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: existingEventLocalId,
      subject_id: PROJECT_ID,
      object_id: EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2024-11-14",
      description: "The retrospective official presentation states that ACE cameras had been in effect on Tremont Avenue for the Bx36 route since June 20, 2024.",
    },
    evidence_refs: [evidence(activationBlock, "delivered_timeline_status", exactActivationQuote)],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_ace_bx36_activation_affects_bx36",
    label: "Bx36 ACE activation affects Bx36",
    payload: {
      relation_kind: "affects_route",
      relation_family: "route_scope",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: routeLocalId,
      assertion_status: "delivered",
      as_of_date: "2024-11-14",
      description: "The official presentation explicitly scopes the June 20, 2024 ACE activation to the Bx36 route on Tremont Avenue.",
    },
    evidence_refs: [evidence(activationBlock, "delivered_route_scope", exactActivationQuote)],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_ace_bx36_activation_has_camera_enforcement",
    label: "Bx36 ACE activation has automated camera enforcement treatment",
    payload: {
      relation_kind: "has_treatment",
      relation_family: "treatment_scope",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: treatmentLocalId,
      assertion_status: "delivered",
      as_of_date: "2024-11-14",
      description: "The source binds the Bx36 Tremont Avenue activation to ACE on-bus and fixed-location camera enforcement.",
    },
    evidence_refs: [evidence(activationBlock, "delivered_treatment_scope", exactActivationQuote)],
  },
];

const recordsById = new Map(readCanonicalRecordsFromJsonl().map((record) => [record.record_id, record]));
for (const [recordId, kind] of [
  [PROJECT_ID, "project"],
  [ROUTE_ID, "route"],
  [EVENT_ID, "event"],
] as const) {
  const record = recordsById.get(recordId);
  assert(record?.record_kind === kind, `Missing ${kind} target ${recordId}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
}
const existingEvent = recordsById.get(EVENT_ID);
assert(existingEvent?.local_observation_ids?.includes(existingEventLocalId), `${EVENT_ID} local identity changed`);
assert(
  existingEvent.evidence_refs.some(
    (ref) => ref.source_id === SOURCE_ID && ref.evidence_id === `${SOURCE_ID}#${sourcePins.activation.blockId}`,
  ),
  `${EVENT_ID} lost its exact primary evidence`,
);
const existingTreatment = recordsById.get(TREATMENT_ID);
if (existingTreatment) assert(existingTreatment.record_kind === "treatment_component", `${TREATMENT_ID} changed kind`);

const existingSubmissionIds = new Set(readSubmissionEntries().map((entry) => entry.submission_id));
const previews = observations.map((observation) =>
  createSubmissionEntry(RUN_ID, observation, "2026-07-13T13:00:00.000Z"),
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
    const preview = createSubmissionEntry(RUN_ID, observation, "2026-07-13T13:00:00.000Z");
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
  primary_source_id: SOURCE_ID,
  submission_ids: previews.map((entry) => entry.submission_id),
}, null, 2)}\n`);
