import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import type { MtaEvidenceSubmissionRef, MtaSubmitObservationInput } from "../packages/db/src/types.js";
import {
  appendSubmission,
  createSubmissionEntry,
  readSubmissionEntries,
} from "../packages/pipeline/src/records/submissions.js";

const RUN_ID = "2026-07-12_codex_q7-redesign-bundle-members-2025-curation";
const SOURCE_ID = "mta_queens_bus_network_redesign_service_changes";
const BLOCK_ID = "p001_b0009";
const BLOCK_SHA256 = "sha256:2034193e6dcbff745b93bfa0c0863408f3adeb3d1c1a58fe756fd065011ddda5";
const STATUS_AS_OF = "2026-06-07";
const PROJECT_LOCAL_ID = "project_qbnr_q110_effective_2025";

type SourceBlock = {
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

const block = readFileSync(
  join(repoRoot, "raw", "sources", SOURCE_ID, "blocks.jsonl"),
  "utf8",
)
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line) as SourceBlock)
  .find((candidate) => candidate.block_id === BLOCK_ID);
if (!block || block.raw_text_sha256 !== BLOCK_SHA256) {
  throw new Error(`Pinned ${SOURCE_ID} Q7 evidence changed; review before curating`);
}

const literals = {
  western:
    "The Q7 will be rerouted on its western end to provide new service along Rockaway Blvd between Liberty and Jamaica Avs.",
  discontinued:
    "Current Q7 service to East New York along Sutter and Pitkin Avs will be discontinued and replaced by the Q112 .",
  eastern:
    "On its eastern end, the Q7 will be shortened to the JFK Travel Plaza. Service to JFK Cargo Area C will be provided by Port Authority shuttles and the Q3 .",
} as const;
for (const literal of Object.values(literals)) {
  if (!block.raw_text.includes(literal)) throw new Error(`Pinned Q7 evidence lost ${JSON.stringify(literal)}`);
}

function evidence(role: string, sourceQuote: string): MtaEvidenceSubmissionRef {
  return {
    source_id: SOURCE_ID,
    evidence_id: `${SOURCE_ID}#${BLOCK_ID}`,
    source_path: `raw/sources/${SOURCE_ID}/blocks.jsonl`,
    page_number: block!.page_number,
    block_id: BLOCK_ID,
    text_sha256: BLOCK_SHA256,
    text_source: "raw_text",
    role,
    source_quote: sourceQuote,
  };
}

const members = [
  {
    key: "western-reroute",
    localId: "treatment_q7_western_reroute_2025",
    relationLocalId: "relation_qbnr_2025_has_q7_western_reroute",
    label: "Q7 western-end reroute",
    treatmentKind: "route rerouting",
    rawText: literals.western,
    description:
      "Q7 was rerouted on its western end to provide new service on Rockaway Boulevard between Liberty and Jamaica Avenues.",
    locationText: "Rockaway Boulevard between Liberty and Jamaica Avenues",
  },
  {
    key: "sutter-pitkin-discontinuation",
    localId: "treatment_q7_sutter_pitkin_discontinuation_2025",
    relationLocalId: "relation_qbnr_2025_has_q7_sutter_pitkin_discontinuation",
    label: "Q7 Sutter/Pitkin segment discontinuation and Q112 replacement",
    treatmentKind: "route segment discontinuation and replacement",
    rawText: literals.discontinued,
    description:
      "Q7 service to East New York on Sutter and Pitkin Avenues was discontinued and replaced by Q112 service.",
    locationText: "Sutter and Pitkin Avenues to East New York",
  },
  {
    key: "jfk-shortening",
    localId: "treatment_q7_jfk_shortening_2025",
    relationLocalId: "relation_qbnr_2025_has_q7_jfk_shortening",
    label: "Q7 eastern-end shortening and JFK Cargo replacement service",
    treatmentKind: "route shortening",
    rawText: literals.eastern,
    description:
      "Q7 was shortened to the JFK Travel Plaza; JFK Cargo Area C service was reassigned to Port Authority shuttles and Q3.",
    locationText: "JFK Travel Plaza and JFK Cargo Area C",
  },
] as const;

const observations: MtaSubmitObservationInput[] = [
  ...members.map(
    (member): MtaSubmitObservationInput => ({
      source_id: SOURCE_ID,
      observation_kind: "treatment_component",
      local_observation_id: member.localId,
      create_new: true,
      label: member.label,
      raw_text: member.rawText,
      payload: {
        treatment_kind: member.treatmentKind,
        description: member.description,
        location_text: member.locationText,
      },
      evidence_refs: [evidence("treatment_definition", member.rawText)],
    }),
  ),
  ...members.map(
    (member): MtaSubmitObservationInput => ({
      source_id: SOURCE_ID,
      observation_kind: "relation",
      local_observation_id: member.relationLocalId,
      label: `Queens redesign includes ${member.label}`,
      payload: {
        relation_kind: "has_treatment",
        subject_local_observation_id: PROJECT_LOCAL_ID,
        object_local_observation_id: member.localId,
        assertion_status: "delivered",
        as_of_date: STATUS_AS_OF,
        description: `The implemented Q7 redesign includes the source-stated ${member.label}.`,
      },
      evidence_refs: [evidence("treatment_scope", member.rawText)],
    }),
  ),
];

const existingEntries = readSubmissionEntries();
if (
  !existingEntries.some(
    (entry) =>
      entry.validation.state === "accepted" &&
      entry.tool_args.source_id === SOURCE_ID &&
      entry.tool_args.local_observation_id === PROJECT_LOCAL_ID,
  )
) {
  throw new Error(`Accepted shared project observation ${SOURCE_ID}:${PROJECT_LOCAL_ID} is missing`);
}

const existingIds = new Set(existingEntries.map((entry) => entry.submission_id));
const previews = observations.map((observation) =>
  createSubmissionEntry(RUN_ID, observation, "2026-07-12T00:00:00.000Z"),
);
for (const preview of previews) {
  if (preview.validation.state !== "accepted") {
    throw new Error(`${preview.submission_id} rejected: ${preview.validation.issues.join("; ")}`);
  }
  if (
    preview.tool_args.observation_kind === "treatment_component" &&
    preview.tool_args.payload.treatment_family !== "service_pattern"
  ) {
    throw new Error(
      `${preview.submission_id} normalized to ${String(preview.tool_args.payload.treatment_family)} instead of service_pattern`,
    );
  }
}

const pending = new Set(
  previews.filter((preview) => !existingIds.has(preview.submission_id)).map((preview) => preview.submission_id),
);
const apply = process.argv.includes("--apply");
if (apply) {
  for (const observation of observations) {
    const preview = createSubmissionEntry(RUN_ID, observation, "2026-07-12T00:00:00.000Z");
    if (!pending.has(preview.submission_id)) continue;
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
      mode: apply ? "apply" : "dry_run",
      observation_count: observations.length,
      already_present_count: observations.length - pending.size,
      written_count: apply ? pending.size : 0,
      pending_count: apply ? 0 : pending.size,
      normalized_treatment_families: previews
        .filter((preview) => preview.tool_args.observation_kind === "treatment_component")
        .map((preview) => preview.tool_args.payload.treatment_family),
      submission_ids: previews.map((preview) => preview.submission_id),
    },
    null,
    2,
  ),
);
