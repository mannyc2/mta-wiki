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

const RUN_ID = "2026-07-12_codex_q7-redesign-2025-curation";
const SOURCE_ID = "mta_queens_bus_network_redesign_service_changes";
const SOURCE_BLOCK_ID = "p001_b0001";
const SOURCE_BLOCK_SHA256 = "sha256:e298ec216ad62d96267f9bf2ee4ffb6d4bafddc36d91cd58b6ee88972db08f73";
const Q7_BLOCK_ID = "p001_b0009";
const Q7_BLOCK_SHA256 = "sha256:2034193e6dcbff745b93bfa0c0863408f3adeb3d1c1a58fe756fd065011ddda5";
const SOURCE_ARTIFACT_SHA256 = "sha256:4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d";
const SOURCE_URL = "https://www.mta.info/project/queens-bus-network-redesign/service-changes";
const RETRIEVED_AT = "2026-06-07T01:03:14.507Z";
const STATUS_AS_OF = "2026-06-07";

type SourceBlock = {
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

type SourceMetadata = {
  sourceId?: unknown;
  sourceUrl?: unknown;
  retrievedAt?: unknown;
  sha256?: unknown;
};

const sourceDir = join(repoRoot, "raw", "sources", SOURCE_ID);
const metadata = JSON.parse(readFileSync(join(sourceDir, "metadata.json"), "utf8")) as SourceMetadata;
if (
  metadata.sourceId !== SOURCE_ID ||
  metadata.sourceUrl !== SOURCE_URL ||
  metadata.retrievedAt !== RETRIEVED_AT ||
  metadata.sha256 !== SOURCE_ARTIFACT_SHA256
) {
  throw new Error(`Pinned ${SOURCE_ID} metadata changed; review before curating`);
}

const blocks = new Map(
  readFileSync(join(sourceDir, "blocks.jsonl"), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SourceBlock)
    .map((block) => [block.block_id, block]),
);
const sourceBlock = blocks.get(SOURCE_BLOCK_ID);
const q7Block = blocks.get(Q7_BLOCK_ID);
if (!sourceBlock || sourceBlock.raw_text_sha256 !== SOURCE_BLOCK_SHA256) {
  throw new Error(`Pinned ${SOURCE_ID} source-page evidence changed; review before curating`);
}
if (!q7Block || q7Block.raw_text_sha256 !== Q7_BLOCK_SHA256) {
  throw new Error(`Pinned ${SOURCE_ID} Q7 row changed; review before curating`);
}
for (const literal of [
  "Changes to the Q7 took effect August 31, 2025.",
  "The Q7 will be rerouted on its western end to provide new service along Rockaway Blvd between Liberty and Jamaica Avs.",
  "Current Q7 service to East New York along Sutter and Pitkin Avs will be discontinued and replaced by the Q112",
  "the Q7 will be shortened to the JFK Travel Plaza",
  "Service to JFK Cargo Area C will be provided by Port Authority shuttles and the Q3",
]) {
  if (!q7Block.raw_text.includes(literal)) {
    throw new Error(`Pinned ${SOURCE_ID} Q7 row no longer contains ${JSON.stringify(literal)}`);
  }
}
for (const literal of [
  "Changes were made to Queens bus service in summer 2025.",
  "Phase 2: August 31, 2025",
]) {
  if (!sourceBlock.raw_text.includes(literal)) {
    throw new Error(`Pinned ${SOURCE_ID} source page no longer contains ${JSON.stringify(literal)}`);
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

// This accepted observation was applied by the Q110 curation and targets the
// shared canonical Queens Bus Network Redesign project. Reuse it rather than
// submitting a second, potentially divergent project payload.
const projectLocalId = "project_qbnr_q110_effective_2025";
const routeLocalId = "route_q7_qbnr_effective_2025";
const treatmentLocalId = "treatment_q7_route_redesign_2025";
const eventLocalId = "event_q7_route_redesign_effective_2025_08_31";

const existingEntries = readSubmissionEntries();
const sharedProjectEntry = existingEntries.find(
  (entry) =>
    entry.validation.state === "accepted" &&
    entry.tool_args.source_id === SOURCE_ID &&
    entry.tool_args.observation_kind === "project" &&
    entry.tool_args.local_observation_id === projectLocalId &&
    entry.tool_args.target_record_id === "project_queens-bus-network-redesign",
);
if (!sharedProjectEntry) {
  throw new Error(`Accepted shared project observation ${SOURCE_ID}:${projectLocalId} is missing`);
}

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: SOURCE_ID,
    observation_kind: "route",
    local_observation_id: routeLocalId,
    target_record_id: "route_q7-queens",
    label: "Q7",
    raw_text: "Q7",
    payload: {
      route_id: "Q7",
      route_label: "Q7",
      route_type: "bus",
    },
    evidence_refs: [evidence(q7Block, "route_identity", "Q7")],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: treatmentLocalId,
    create_new: true,
    label: "Q7 route-redesign routing package",
    raw_text: q7Block.raw_text,
    payload: {
      treatment_kind: "Q7 routing-change package",
      treatment_family: "route_redesign",
      description:
        "Q7 was rerouted on its western end to serve Rockaway Boulevard between Liberty and Jamaica Avenues; its Sutter/Pitkin Avenue segment to East New York was discontinued and replaced by Q112; and its eastern end was shortened to the JFK Travel Plaza, with Cargo Area C served by Port Authority shuttles and Q3.",
      location_text: "Q7 route between East New York, Rockaway Boulevard, and the JFK Travel Plaza",
    },
    evidence_refs: [evidence(q7Block, "treatment_definition")],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "event",
    local_observation_id: eventLocalId,
    create_new: true,
    label: "Q7 redesign took effect August 31, 2025",
    raw_text: "Changes to the Q7 took effect August 31, 2025.",
    payload: {
      event_kind: "route redesign service change",
      date_text: "August 31, 2025",
      description: "The Q7 route-redesign routing package took effect August 31, 2025.",
    },
    evidence_refs: [evidence(q7Block, "event_date", "Changes to the Q7 took effect August 31, 2025.")],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_qbnr_has_q7_2025_effective_event",
    label: "Queens redesign has Q7 effective-date event",
    payload: {
      relation_kind: "has_timeline_event",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: eventLocalId,
      assertion_status: "delivered",
      as_of_date: STATUS_AS_OF,
      description: `The captured official page states that the Q7 changes took effect August 31, 2025; delivery is established as of its ${STATUS_AS_OF} retrieval.`,
    },
    evidence_refs: [
      evidence(q7Block, "timeline_relation", "Changes to the Q7 took effect August 31, 2025."),
      evidence(sourceBlock, "retrieved_project_context", "Changes were made to Queens bus service in summer 2025."),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_qbnr_2025_affects_q7",
    label: "Queens redesign affects Q7",
    payload: {
      relation_kind: "affects_route",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: routeLocalId,
      assertion_status: "delivered",
      as_of_date: STATUS_AS_OF,
      description: "The implemented Queens Bus Network Redesign changed Q7 routing.",
    },
    evidence_refs: [evidence(q7Block, "route_scope", "Q7")],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_qbnr_2025_has_q7_route_redesign",
    label: "Queens redesign has Q7 route-redesign treatment",
    payload: {
      relation_kind: "has_treatment",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: treatmentLocalId,
      assertion_status: "delivered",
      as_of_date: STATUS_AS_OF,
      description: "The implemented redesign delivered the source-stated Q7 routing-change package.",
    },
    evidence_refs: [evidence(q7Block, "treatment_scope")],
  },
];

const canonicalIds = new Set(readCanonicalRecordsFromJsonl().map((record) => record.record_id));
for (const requiredId of ["project_queens-bus-network-redesign", "route_q7-queens"]) {
  if (!canonicalIds.has(requiredId)) throw new Error(`Missing canonical target ${requiredId}`);
}

const existingSubmissionIds = new Set(existingEntries.map((entry) => entry.submission_id));
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
      warnings: dryRunEntries.flatMap((entry) =>
        (entry.validation.warnings ?? []).map((warning) => ({ submission_id: entry.submission_id, warning })),
      ),
    },
    null,
    2,
  ),
);
