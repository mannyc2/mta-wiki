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

const RUN_ID = "2026-07-12_codex_q110-redesign-2025-curation";
const SOURCE_ID = "mta_queens_bus_network_redesign_service_changes";
const SOURCE_BLOCK_ID = "p001_b0001";
const SOURCE_BLOCK_SHA256 = "sha256:e298ec216ad62d96267f9bf2ee4ffb6d4bafddc36d91cd58b6ee88972db08f73";
const Q110_BLOCK_ID = "p001_b0094";
const Q110_BLOCK_SHA256 = "sha256:7492d56be36ac3097b070326bdd8b818a42801d072ec061ab7bf6ba26a385518";

type SourceBlock = {
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

const blocksPath = join(repoRoot, "raw", "sources", SOURCE_ID, "blocks.jsonl");
const blocks = new Map(
  readFileSync(blocksPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SourceBlock)
    .map((block) => [block.block_id, block]),
);
const sourceBlock = blocks.get(SOURCE_BLOCK_ID);
const q110Block = blocks.get(Q110_BLOCK_ID);
if (!sourceBlock || sourceBlock.raw_text_sha256 !== SOURCE_BLOCK_SHA256) {
  throw new Error(`Pinned ${SOURCE_ID} source-page evidence changed; review before curating`);
}
if (!q110Block || q110Block.raw_text_sha256 !== Q110_BLOCK_SHA256) {
  throw new Error(`Pinned ${SOURCE_ID} Q110 row changed; review before curating`);
}
for (const literal of [
  "Changes to the Q110 took effect June 29, 2025.",
  "Q110 will be rerouted and extended along Jamaica Av/Jericho Tpke",
]) {
  if (!q110Block.raw_text.includes(literal)) {
    throw new Error(`Pinned ${SOURCE_ID} Q110 row no longer contains ${JSON.stringify(literal)}`);
  }
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

const projectLocalId = "project_qbnr_q110_effective_2025";
const routeLocalId = "route_q110_qbnr_effective_2025";
const treatmentLocalId = "treatment_q110_route_redesign_2025";
const eventLocalId = "event_q110_route_redesign_effective_2025_06_29";

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: SOURCE_ID,
    observation_kind: "source",
    local_observation_id: `source_${SOURCE_ID}`,
    label: "MTA Queens Bus Network Redesign service changes",
    raw_text: "Queens Bus Network Redesign service changes",
    payload: {
      title: "Queens Bus Network Redesign service changes",
      publisher: "MTA",
      content_type: "official project webpage",
      description: "Official route-by-route service changes for the implemented Queens Bus Network Redesign.",
      source_url: "https://www.mta.info/project/queens-bus-network-redesign/service-changes",
    },
    evidence_refs: [evidence(sourceBlock, "source_page", "Queens Bus Network Redesign service changes")],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "project",
    local_observation_id: projectLocalId,
    target_record_id: "project_queens-bus-network-redesign",
    label: "Queens Bus Network Redesign",
    raw_text: q110Block.raw_text,
    payload: {
      project_name: "Queens Bus Network Redesign",
      project_type: "bus network redesign",
      status: "implemented",
      description: "Route-by-route Queens bus service changes took effect in summer 2025.",
    },
    evidence_refs: [evidence(sourceBlock, "project_context", "Changes were made to Queens bus service in summer 2025")],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "route",
    local_observation_id: routeLocalId,
    target_record_id: "route_q110-queens",
    label: "Q110",
    raw_text: "Q110",
    payload: {
      route_id: "Q110",
      route_label: "Q110",
      route_type: "bus",
    },
    evidence_refs: [evidence(q110Block, "route_identity", "Q110")],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: treatmentLocalId,
    create_new: true,
    label: "Q110 route redesign",
    raw_text: "The Q110 will be rerouted and extended along Jamaica Av/Jericho Tpke to the existing Q36 terminal in Queens.",
    payload: {
      treatment_kind: "route rerouting and extension",
      treatment_family: "route_redesign",
      description: "Q110 was rerouted and extended along Jamaica Avenue/Jericho Turnpike to the existing Q36 terminal in Queens.",
      location_text: "Jamaica Avenue/Jericho Turnpike to the existing Q36 terminal in Queens",
    },
    evidence_refs: [
      evidence(
        q110Block,
        "treatment_definition",
        "Q110 will be rerouted and extended along Jamaica Av/Jericho Tpke",
      ),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "event",
    local_observation_id: eventLocalId,
    create_new: true,
    label: "Q110 redesign took effect June 29, 2025",
    raw_text: "Changes to the Q110 took effect June 29, 2025.",
    payload: {
      event_kind: "implementation",
      event_family: "implementation",
      lifecycle_phase: "implemented",
      date_text: "June 29, 2025",
      description: "The Q110 route redesign took effect June 29, 2025.",
    },
    evidence_refs: [evidence(q110Block, "event_date", "Changes to the Q110 took effect June 29, 2025.")],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_qbnr_has_q110_2025_effective_event",
    label: "Queens redesign has Q110 effective-date event",
    payload: {
      relation_kind: "has_timeline_event",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: eventLocalId,
      assertion_status: "delivered",
      as_of_date: "2025-06-29",
      description: "The Q110 redesign took effect June 29, 2025.",
    },
    evidence_refs: [evidence(q110Block, "timeline_relation", "Changes to the Q110 took effect June 29, 2025.")],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_qbnr_2025_affects_q110",
    label: "Queens redesign affects Q110",
    payload: {
      relation_kind: "affects_route",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: routeLocalId,
      assertion_status: "delivered",
      as_of_date: "2025-06-29",
      description: "The implemented redesign rerouted and extended Q110.",
    },
    evidence_refs: [evidence(q110Block, "route_scope", "Q110")],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_qbnr_2025_has_q110_route_redesign",
    label: "Queens redesign has Q110 route-redesign treatment",
    payload: {
      relation_kind: "has_treatment",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: treatmentLocalId,
      assertion_status: "delivered",
      as_of_date: "2025-06-29",
      description: "The redesign rerouted and extended Q110 effective June 29, 2025.",
    },
    evidence_refs: [
      evidence(
        q110Block,
        "treatment_scope",
        "Q110 will be rerouted and extended along Jamaica Av/Jericho Tpke",
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
const pendingIds = new Set(
  dryRunEntries
    .filter((entry) => !existingSubmissionIds.has(entry.submission_id))
    .map((entry) => entry.submission_id),
);
if (apply) {
  for (const observation of observations) {
    const preview = createSubmissionEntry(RUN_ID, observation, "2026-07-12T00:00:00.000Z");
    if (!pendingIds.has(preview.submission_id)) continue;
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
      already_present_count: observations.length - pendingIds.size,
      written_count: apply ? pendingIds.size : 0,
      pending_count: apply ? 0 : pendingIds.size,
      submission_ids: dryRunEntries.map((entry) => entry.submission_id),
    },
    null,
    2,
  ),
);
