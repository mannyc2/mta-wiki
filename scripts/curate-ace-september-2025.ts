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

const RUN_ID = "2026-07-12_codex_ace-september-2025-curation";
const SOURCE_ID = "meeting_doc_186616";
const EVENT_BLOCK_ID = "p011_c0010";
const EVENT_EVIDENCE_ID = `${SOURCE_ID}#${EVENT_BLOCK_ID}`;
const EVENT_TEXT_SHA256 = "sha256:94f2bd4451ebb0cab2547064ae8c8f887aa47d99c673cd60f8aca040dbd13e54";
const PUBLICATION_BLOCK_ID = "p001_c0002";

type SourceBlock = {
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

function sourceBlocks(): Map<string, SourceBlock> {
  const path = join(repoRoot, "raw", "sources", SOURCE_ID, "blocks.jsonl");
  const blocks = readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SourceBlock);
  return new Map(blocks.map((block) => [block.block_id, block]));
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

const blocks = sourceBlocks();
const eventBlock = blocks.get(EVENT_BLOCK_ID);
const publicationBlock = blocks.get(PUBLICATION_BLOCK_ID);
if (!eventBlock || !publicationBlock) {
  throw new Error(`Required ${SOURCE_ID} evidence blocks are missing`);
}
if (eventBlock.raw_text_sha256 !== EVENT_TEXT_SHA256 || `${SOURCE_ID}#${eventBlock.block_id}` !== EVENT_EVIDENCE_ID) {
  throw new Error(`Pinned ${EVENT_EVIDENCE_ID} evidence changed; review before curating`);
}
for (const literal of [
  "four additional Automated Camera Enforcement (ACE) routes",
  "Q6, Bx20, Bx3, and Bx7",
  "activated on September 15",
]) {
  if (!eventBlock.raw_text.includes(literal)) {
    throw new Error(`Pinned ${EVENT_EVIDENCE_ID} no longer contains ${JSON.stringify(literal)}`);
  }
}
if (!publicationBlock.raw_text.includes("September 2025")) {
  throw new Error(`Pinned ${SOURCE_ID} publication context no longer establishes the event year`);
}

const projectLocalId = "project_meeting_doc_186616_ace_sep15_activation";
const treatmentLocalId = "treatment_meeting_doc_186616_ace_route_activation";
const eventLocalId = "event_meeting_doc_186616_ace_routes_activated_sep15_2025";

const routes = [
  { literal: "Q6", localId: "route_meeting_doc_186616_q6_ace", targetId: "route_q6-ace" },
  { literal: "Bx20", localId: "route_meeting_doc_186616_bx20_ace", targetId: "route_bx20-ace" },
  { literal: "Bx3", localId: "route_meeting_doc_186616_bx3_ace", targetId: "route_bx3" },
  { literal: "Bx7", localId: "route_meeting_doc_186616_bx7_ace", targetId: "route_bx7-ace" },
] as const;

const sharedEventEvidence = evidence(eventBlock, "event_and_scope");
const publicationEvidence = evidence(publicationBlock, "publication_date_context", "September 2025");

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: SOURCE_ID,
    observation_kind: "project",
    local_observation_id: projectLocalId,
    target_record_id: "project_ace-automated-camera-enforcement",
    label: "Automated Camera Enforcement (ACE) September 2025 route activation",
    raw_text: eventBlock.raw_text,
    payload: {
      project_name: "Automated Camera Enforcement (ACE)",
      project_type: "automated camera enforcement",
      status: "active",
      document_time_status: "implemented",
      project_family: "enforcement_program",
      description: "Four additional ACE routes—Q6, Bx20, Bx3, and Bx7—were activated on September 15, 2025 under a 60-day warning period.",
    },
    evidence_refs: [sharedEventEvidence, publicationEvidence],
  },
  ...routes.map<MtaSubmitObservationInput>((route) => ({
    source_id: SOURCE_ID,
    observation_kind: "route",
    local_observation_id: route.localId,
    target_record_id: route.targetId,
    label: route.literal,
    raw_text: route.literal,
    payload: {
      route_id: route.literal,
      route_label: route.literal,
      route_type: "bus",
    },
    evidence_refs: [evidence(eventBlock, "route_identity", route.literal)],
  })),
  {
    source_id: SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: treatmentLocalId,
    create_new: true,
    label: "Automated Camera Enforcement (ACE) route activation",
    raw_text: "deployment of four additional Automated Camera Enforcement (ACE) routes",
    payload: {
      treatment_kind: "Automated Camera Enforcement (ACE) route deployment",
      treatment_family: "automated_bus_lane_enforcement",
      description: "Deployment and activation of ACE on Q6, Bx20, Bx3, and Bx7 under a 60-day warning period.",
      location_text: "Q6, Bx20, Bx3, and Bx7",
    },
    evidence_refs: [
      evidence(
        eventBlock,
        "treatment_definition",
        "deployment of four additional Automated Camera Enforcement (ACE) routes",
      ),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "event",
    local_observation_id: eventLocalId,
    create_new: true,
    label: "Four ACE routes activated September 15, 2025",
    raw_text: "These routes were activated on September 15 under a 60-day warning period.",
    payload: {
      event_kind: "route activation",
      event_family: "implementation",
      lifecycle_phase: "launched",
      date_text: "September 15",
      date_normalized: "2025-09-15",
      date_precision: "day",
      description: "ACE was activated on Q6, Bx20, Bx3, and Bx7 under a 60-day warning period.",
      date_resolution_basis: "The source is the September 2025 MTA performance report.",
    },
    evidence_refs: [
      evidence(eventBlock, "event_date", "activated on September 15"),
      publicationEvidence,
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_meeting_doc_186616_ace_has_sep15_activation",
    label: "ACE has September 15, 2025 route activation",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: eventLocalId,
      assertion_status: "delivered",
      as_of_date: "2025-09-29",
      description: "The four additional ACE routes were activated on September 15, 2025.",
    },
    evidence_refs: [evidence(eventBlock, "timeline_relation", "These routes were activated on September 15")],
  },
  ...routes.map<MtaSubmitObservationInput>((route) => ({
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: `relation_meeting_doc_186616_ace_affects_${route.literal.toLowerCase()}`,
    label: `ACE activation affects ${route.literal}`,
    payload: {
      relation_kind: "affects_route",
      relation_family: "route_scope",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: route.localId,
      assertion_status: "delivered",
      as_of_date: "2025-09-29",
      description: `${route.literal} was one of four additional ACE routes activated on September 15, 2025.`,
    },
    evidence_refs: [evidence(eventBlock, "route_scope", route.literal)],
  })),
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_meeting_doc_186616_ace_has_route_activation_treatment",
    label: "ACE has automated camera enforcement treatment",
    payload: {
      relation_kind: "has_treatment",
      relation_family: "treatment_scope",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: treatmentLocalId,
      assertion_status: "delivered",
      as_of_date: "2025-09-29",
      description: "The September 15 activation deployed Automated Camera Enforcement on four named routes.",
    },
    evidence_refs: [
      evidence(
        eventBlock,
        "treatment_scope",
        "deployment of four additional Automated Camera Enforcement (ACE) routes",
      ),
    ],
  },
];

const canonicalIds = new Set(readCanonicalRecordsFromJsonl().map((record) => record.record_id));
for (const observation of observations) {
  if (observation.target_record_id && !canonicalIds.has(observation.target_record_id)) {
    throw new Error(`Missing target_record_id ${observation.target_record_id}`);
  }
}

const existingSubmissionIds = new Set(readSubmissionEntries().map((entry) => entry.submission_id));
const dryRunEntries = observations.map((observation) =>
  createSubmissionEntry(RUN_ID, observation, "2026-07-12T00:00:00.000Z"),
);
for (const entry of dryRunEntries) {
  if (entry.validation.state !== "accepted") {
    throw new Error(`${entry.submission_id} rejected: ${entry.validation.issues.join("; ")}`);
  }
}

const apply = process.argv.includes("--apply");
const pending = dryRunEntries.filter((entry) => !existingSubmissionIds.has(entry.submission_id));
if (apply) {
  for (const entry of pending) {
    const observation = observations.find(
      (candidate) =>
        createSubmissionEntry(RUN_ID, candidate, "2026-07-12T00:00:00.000Z").submission_id ===
        entry.submission_id,
    );
    if (!observation) throw new Error(`Lost pending observation ${entry.submission_id}`);
    const written = appendSubmission(RUN_ID, observation);
    if (written.validation.state !== "accepted") {
      throw new Error(`${written.submission_id} rejected while applying: ${written.validation.issues.join("; ")}`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      run_id: RUN_ID,
      source_id: SOURCE_ID,
      mode: apply ? "apply" : "dry_run",
      observation_count: observations.length,
      already_present_count: observations.length - pending.length,
      written_count: apply ? pending.length : 0,
      pending_count: apply ? 0 : pending.length,
      submission_ids: dryRunEntries.map((entry) => entry.submission_id),
    },
    null,
    2,
  ),
);
