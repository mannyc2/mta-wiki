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

const RUN_ID = "2026-07-13_codex_dekalb-lafayette-summer-2024-temp-lanes";
const SOURCE_ID = "dekalb_lafayette_cb2_dec2024";
const EVENT_ID = "event_dekalb-lafayette-summer2024-temp-lanes";
const ROUTE_ID = "route_b38";
const TREATMENT_ID = "treatment_temp-bus-lanes-summer2024";

const eventLocalId = "event_dekalb_lafayette_summer2024_temp_lanes";
const routeLocalId = "route_b38_summer2024_temp_lanes";
const treatmentLocalId = "treatment_temp_bus_lanes_summer2024_delivered_scope";

const sourcePins = {
  artifacts: {
    "metadata.json": "17cf5a663bd0aca3543e087e1ffe9c68798dd15bf414d4605da06ed373966ac8",
    "source.pdf": "412db03c4b2a3391e9486ac2a092a82e52bf81854eb631369b1b618a37225540",
    "blocks.jsonl": "51c9f53b970baab069da9ab3835ec3b44334bdb31d45d06ac465f0c1e93463c3",
  },
  deliveredScope: {
    blockId: "p026_c0002",
    sha256: "sha256:c054459a74d1d0e28e1399d6a1e160f99ce9d454d90ce0c157b9d7a3cc2e8f19",
    literals: [
      "Temporary bus lanes installed during the Summer 2024 G Train shutdown",
      "Bus lanes on the corridor also improved B38 service",
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
const deliveredScopeBlock = blocks.get(sourcePins.deliveredScope.blockId);
assert(deliveredScopeBlock, `Missing ${SOURCE_ID}#${sourcePins.deliveredScope.blockId}`);
assert(deliveredScopeBlock.raw_text_sha256 === sourcePins.deliveredScope.sha256, "Delivered-scope block hash changed");
for (const literal of sourcePins.deliveredScope.literals) {
  assert(deliveredScopeBlock.raw_text.includes(literal), `Delivered-scope block lost ${JSON.stringify(literal)}`);
}

function evidence(role: string, sourceQuote: string): MtaEvidenceSubmissionRef {
  return {
    source_id: SOURCE_ID,
    evidence_id: `${SOURCE_ID}#${deliveredScopeBlock.block_id}`,
    source_path: `raw/sources/${SOURCE_ID}/blocks.jsonl`,
    page_number: deliveredScopeBlock.page_number,
    block_id: deliveredScopeBlock.block_id,
    text_sha256: deliveredScopeBlock.raw_text_sha256,
    text_source: "raw_text",
    role,
    source_quote: sourceQuote,
  };
}

const routeQuote = "Bus lanes on the corridor also improved B38 service";
const treatmentQuote = "Temporary bus lanes installed during the Summer 2024 G Train shutdown for shuttles along portions of DeKalb and Lafayette Aves";

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: SOURCE_ID,
    observation_kind: "route",
    local_observation_id: routeLocalId,
    target_record_id: ROUTE_ID,
    label: "B38",
    raw_text: routeQuote,
    payload: {
      route_id: "B38",
    },
    evidence_refs: [evidence("delivered_route_identity", routeQuote)],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: treatmentLocalId,
    target_record_id: TREATMENT_ID,
    label: "Summer 2024 Temporary Bus Lanes",
    raw_text: treatmentQuote,
    payload: {
      treatment_kind: "temporary bus lane",
      treatment_family: "bus_lane",
      location_text: "portions of DeKalb and Lafayette Aves",
      date_text: "Summer 2024",
      description: treatmentQuote,
    },
    evidence_refs: [evidence("delivered_treatment_definition", treatmentQuote)],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_b38_has_summer2024_temp_lane_event",
    label: "B38 has Summer 2024 temporary bus lane event",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: routeLocalId,
      object_local_observation_id: eventLocalId,
      subject_id: ROUTE_ID,
      object_id: EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2024-12-19",
      description: "The retrospective NYC DOT presentation directly binds B38 to the temporary bus lanes installed during the Summer 2024 G Train shutdown.",
    },
    evidence_refs: [evidence("delivered_route_timeline_scope", routeQuote)],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_temp_bus_lanes_has_summer2024_event",
    label: "Temporary bus lanes have Summer 2024 installation event",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: treatmentLocalId,
      object_local_observation_id: eventLocalId,
      subject_id: TREATMENT_ID,
      object_id: EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2024-12-19",
      description: "The retrospective NYC DOT presentation states that these temporary bus lanes were installed during the Summer 2024 G Train shutdown.",
    },
    evidence_refs: [evidence("delivered_treatment_timeline_scope", treatmentQuote)],
  },
];

const recordsById = new Map(readCanonicalRecordsFromJsonl().map((record) => [record.record_id, record]));
for (const [recordId, kind] of [
  [EVENT_ID, "event"],
  [ROUTE_ID, "route"],
  [TREATMENT_ID, "treatment_component"],
] as const) {
  const record = recordsById.get(recordId);
  assert(record?.record_kind === kind, `Missing ${kind} target ${recordId}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
}
const event = recordsById.get(EVENT_ID)!;
assert(event.local_observation_ids?.includes(eventLocalId), `${EVENT_ID} local identity changed`);
assert(event.payload.date_normalized === "2024-summer", `${EVENT_ID} season changed`);
assert(event.payload.date_precision === "season", `${EVENT_ID} precision changed`);
assert(event.payload.lifecycle_phase === "installed", `${EVENT_ID} lifecycle changed`);

const existingSubmissionIds = new Set(readSubmissionEntries().map((entry) => entry.submission_id));
const previews = observations.map((observation) =>
  createSubmissionEntry(RUN_ID, observation, "2026-07-13T14:00:00.000Z"),
);
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
    const preview = createSubmissionEntry(RUN_ID, observation, "2026-07-13T14:00:00.000Z");
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
  event_id: EVENT_ID,
  route_id: ROUTE_ID,
  treatment_id: TREATMENT_ID,
  preserved_date_normalized: "2024-summer",
  preserved_date_precision: "season",
  primary_source_id: SOURCE_ID,
  submission_ids: previews.map((entry) => entry.submission_id),
}, null, 2)}\n`);
