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

const RUN_ID = "2026-07-21_codex_flatbush-phase1-operational-opening-2025-10-02";
const FIXED_TIMESTAMP = "2026-07-21T02:30:00.000Z";
const SOURCE_ID = "nyc_dot_bus_lanes_flatbush_phase1_opening_2025";
const START_SOURCE_ID = "nyc_dot_flatbush_installation_begins_2025";
const PROJECT_ID = "project_flatbush-phase1-center-running-bus-lanes-livingston-state";
const START_EVENT_ID = "event_flatbush-phase1-installation-start-sep2025";
const OPENING_EVENT_ID = "event_flatbush-phase1-operational-opening-2025-10-02";
const OPENING_TIMELINE_RELATION_ID =
  "relation_flatbush-phase1-has-operational-opening-2025-10-02";
const PHASE_RELATION_ID =
  "relation_flatbush-phase1-installation-precedes-opening-2025-10-02";

const sourcePins = {
  artifacts: {
    "metadata.json": "1b1fc88b7222827c1548e2059239bac0ca4b7f1b3157285c6bcc2a991a59f33d",
    "text.txt": "9e5bb13ddc9b8bc1bf680544d1b1224ccd9ecc4a9aeed5c97bc172d6c5eeb7d6",
    "blocks.jsonl": "7c1b6f0059e114795a3e62a2175fff32d001e4d016790c39fbabe45fcc0e4ad8",
    "bus-lanes-view-metadata.json": "33cd64b3ac584603a66e52375bf7ceb7e6c6db49d40202ecf9940f89ee92e2ea",
    "bus-lanes-columns.json": "f495f728925b7b807dec228987cfbcb4e9e55279dd1d4edda79c20f3baa7cefe",
    "bus-lanes-selected.json": "a741b434f60f0fbb85a582c44c0c166133f9188386c6000f61d4df2a93f2297d",
    "lion-selected-segments.json": "46c7fd07197f5cf30fa1f9f77b3970c357dc7b2f77f36a22ad1764dcec10beff",
    "lion-adjoining-nodes.json": "7e3f301a6b4a39a6be8efe1ab440a855c819f9be897ef16e82697b7c0bbb50e7",
  },
  blocks: {
    agency: ["p001_b0003", "sha256:c3e999240fbcd8ceab533453ab18c0e9908cfaca4937c2a8a7535a858b0f9cef", "Department of Transportation (DOT)"],
    description: ["p001_b0004", "sha256:2f063455514a278fd0998786733fa765e8eb4241b474b46e546535e2f0f687cd", "Each record represents a segment of a bus lane based on the LION geographic base file"],
    updated: ["p001_b0005", "sha256:0ff832f4e5b628f4b6d369db72e884a9efd7dffa8e3f5f6bc832b2b956b3f709", "2026-04-06T15:44:03Z"],
    openDefinition: ["p001_b0021", "sha256:53c56e6b944ea96baa1fdfdb1271b00e16d340971a9e38670073a6f3bd1133f8", "Year bus lane opened"],
    effectDefinition: ["p001_b0024", "sha256:beeb03436da20f7c7f9599a09d6348d4a73870a16d658a4da0f522d2a153d36a", "The year the bus lanes went into effect"],
    queryHash: ["p001_b0026", "sha256:a9efa305f871209c2dfd30b9ae08c9087d8f90613481f9f5902c0bdb6cfff993", "a741b434f60f0fbb85a582c44c0c166133f9188386c6000f61d4df2a93f2297d"],
    segment0022938: ["p001_b0027", "sha256:a98b9356003fcb4a3c52d6658c4518e1e5323692432737244ccc6a7a3ec629af", '"segmentid":"0022938"'],
    segment0022942: ["p001_b0028", "sha256:81780e7550e51d762fefc52baf8efaadc7ce462b433899495e2a9a9d2a8dd6a1", '"segmentid":"0022942"'],
    segment0028973: ["p001_b0029", "sha256:efd922654cc276bc2d0f9b351a1a65ae37357ffdd2d9158bbfb2e094a0bb49f6", '"segmentid":"0028973"'],
    segment0118635: ["p001_b0031", "sha256:9221c9d571be7bb52caf5b596b3c4988b3cd4e21db4cccdd66f6d51e6db67bab", '"segmentid":"0118635"'],
    segment0118636: ["p001_b0033", "sha256:9b300066af9c66bd2d427c2d0b7337874649290b983a645a53a4758388103fa3", '"segmentid":"0118636"'],
    lion0022938: ["p001_b0036", "sha256:9cc6edac18436093cb067e1d237b570c072813a56a8473483132ec66b2093c2c", '"SegmentID":"0022938"'],
    lion0022942: ["p001_b0037", "sha256:b8400e13855e28a066c95cd535c17c15b3ee75a89c5a97439efc14db5e7d9577", '"SegmentID":"0022942"'],
    lion0028973: ["p001_b0038", "sha256:2df9d47e9614914eb5211647e9c5f8fbcbf658b65f15fd4e8ae58e386c56d77d", '"SegmentID":"0028973"'],
    lion0118635: ["p001_b0039", "sha256:206aec3b8beab1f43beba80db097631e4c40dd013f689a29183529d151bbd9bc", '"SegmentID":"0118635"'],
    lion0118636: ["p001_b0040", "sha256:a3a145049bb07b9c37f422a2a6f99a4d916dd2a0760d57e37271e823135422a7", '"SegmentID":"0118636"'],
    livingston: ["p001_b0042", "sha256:411346e11e8811c49f567f474ccfb9ac463038e97f7c48079e6697bc2318490d", '"Street":"LIVINGSTON STREET"'],
    state: ["p001_b0043", "sha256:a5c8fb8f547553c4f64890270b8dff1d160ef9efbfb375eb3ff76c90e0b40a67", '"Street":"STATE STREET"'],
    provenance: ["p001_b0044", "sha256:fdec54b57f0c113c4ffef34b1dbf5cf6e159949d728ca28a6aca55d201003d49", "bus-lanes-selected.json SHA-256 a741b434f60f0fbb85a582c44c0c166133f9188386c6000f61d4df2a93f2297d"],
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

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
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

function pinnedBlock(key: keyof typeof sourcePins.blocks): SourceBlock {
  const [blockId, expectedHash, literal] = sourcePins.blocks[key];
  const block = blocks.get(blockId);
  assert(block, `Missing ${SOURCE_ID}#${blockId}`);
  assert(block.raw_text_sha256 === expectedHash, `${SOURCE_ID}#${blockId} hash changed`);
  assert(block.raw_text.includes(literal), `${SOURCE_ID}#${blockId} lost ${JSON.stringify(literal)}`);
  return block;
}

const selected = Object.fromEntries(
  Object.keys(sourcePins.blocks).map((key) => [key, pinnedBlock(key as keyof typeof sourcePins.blocks)]),
) as Record<keyof typeof sourcePins.blocks, SourceBlock>;

const startBlocks = new Map(
  readFileSync(join(repoRoot, "raw", "sources", START_SOURCE_ID, "blocks.jsonl"), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SourceBlock)
    .map((block) => [block.block_id, block]),
);
const startBlock = startBlocks.get("p001_b0016");
const startScopeBlock = startBlocks.get("p001_b0019");
assert(startBlock?.raw_text_sha256 === "sha256:7c79ef32ed8ded041b89c331891e98770b5a811e6220ce1f756c75cf6c833273", "Installation-start evidence changed");
assert(startScopeBlock?.raw_text_sha256 === "sha256:30013ba6828a02a6e555ca70f1e04b4ea1a417a91797600a3df13fb8e2b3180a", "Installation-scope evidence changed");

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

const openScopeKeys = [
  "openDefinition",
  "effectDefinition",
  "queryHash",
  "segment0022938",
  "segment0022942",
  "segment0028973",
  "segment0118635",
  "segment0118636",
  "lion0022938",
  "lion0022942",
  "lion0028973",
  "lion0118635",
  "lion0118636",
  "livingston",
  "state",
  "provenance",
] as const;

const openScopeEvidence = (role: string) => openScopeKeys.map((key) => evidence(SOURCE_ID, selected[key], role));

const openingLocalId = "event_flatbush_phase1_operational_opening_2025_10_02";
const observations: MtaSubmitObservationInput[] = [
  {
    source_id: SOURCE_ID,
    observation_kind: "source",
    local_observation_id: `source_${SOURCE_ID}`,
    label: "Bus Lanes - Local Streets: Flatbush Avenue Phase 1 opening rows",
    raw_text: [selected.description.raw_text, selected.openDefinition.raw_text, selected.updated.raw_text].join("\n\n"),
    payload: {
      title: "Bus Lanes - Local Streets: Flatbush Avenue Phase 1 opening rows",
      publisher: "New York City Department of Transportation (NYC DOT)",
      content_type: "official open-data API capture",
      authority_tier: "dataset_documentation",
      dataset_id: "ycrg-ses3",
      dataset_rows_updated_at: "2026-04-06T15:44:03Z",
      retrieved_at: "2026-07-21T02:08:00Z",
      source_url: "https://data.cityofnewyork.us/Transportation/Bus-Lanes-Local-Streets/ycrg-ses3",
      response_sha256: sourcePins.artifacts["bus-lanes-selected.json"],
      row_count: 9,
      distinct_segment_count: 5,
      description: "Pinned official NYC DOT bus-lane rows and schema, with official DCP LION segment context, for the Flatbush Avenue center-running bus lanes bounded by Livingston Street and State Street.",
    },
    evidence_refs: [
      evidence(SOURCE_ID, selected.agency, "publisher", "Department of Transportation (DOT)"),
      evidence(SOURCE_ID, selected.description, "dataset_scope"),
      evidence(SOURCE_ID, selected.updated, "dataset_update", "2026-04-06T15:44:03Z"),
      evidence(SOURCE_ID, selected.provenance, "capture_hashes"),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "event",
    local_observation_id: openingLocalId,
    create_new: true,
    label: "Flatbush Phase 1 center-running bus lanes open October 2, 2025",
    raw_text: [selected.openDefinition.raw_text, ...openScopeKeys.slice(3, 8).map((key) => selected[key].raw_text)].join("\n\n"),
    payload: {
      event_kind: "operational opening",
      event_family: "launch",
      lifecycle_phase: "launched",
      date_text: "10/2/2025",
      date_normalized: "2025-10-02",
      date_precision: "day",
      location_text: "Flatbush Avenue between Livingston Street and State Street",
      description: "NYC DOT's official bus-lane data records October 2, 2025 as the opening date for the five-segment, center-running, 24-hour, seven-day-a-week Flatbush Avenue bus-lane chain bounded by Livingston Street and State Street.",
    },
    evidence_refs: openScopeEvidence("operational_opening_and_physical_scope"),
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_flatbush_phase1_has_operational_opening_2025_10_02",
    label: "Flatbush Phase 1 has October 2, 2025 operational opening",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_id: PROJECT_ID,
      object_local_observation_id: openingLocalId,
      object_id: OPENING_EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2026-04-06",
      description: "The official DOT opening rows and DCP LION node chain bind the October 2, 2025 operational opening to the same bounded Livingston Street-to-State Street Flatbush Phase 1 project.",
    },
    evidence_refs: openScopeEvidence("project_opening_timeline_and_scope"),
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_flatbush_phase1_installation_precedes_opening_2025_10_02",
    label: "Flatbush Phase 1 installation commencement precedes operational opening",
    payload: {
      relation_kind: "precedes_event",
      relation_family: "timeline_context",
      subject_id: START_EVENT_ID,
      object_local_observation_id: openingLocalId,
      object_id: OPENING_EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2026-04-06",
      description: "The existing September 2025 installation-commencement event precedes the official October 2, 2025 opening of the same Livingston Street-to-State Street Phase 1 segment chain; the two records are related phases of one intervention, not competing onset candidates.",
    },
    evidence_refs: [
      evidence(START_SOURCE_ID, startBlock, "installation_commencement", "work will start this week"),
      evidence(
        START_SOURCE_ID,
        startScopeBlock,
        "installation_physical_scope",
        "begin installing center-running bus lanes on Flatbush Avenue between Livingston Street and State Street",
      ),
      ...openScopeEvidence("opening_phase_and_same_physical_scope"),
    ],
  },
];

const recordsById = new Map(readCanonicalRecordsFromJsonl().map((record) => [record.record_id, record]));
function requiredRecord(recordId: string, kind: MtaCanonicalRecord["record_kind"]): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  assert(record?.record_kind === kind, `Missing ${kind} ${recordId}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${recordId} is not usable`);
  return record;
}
requiredRecord(PROJECT_ID, "project");
requiredRecord(START_EVENT_ID, "event");
for (const [recordId, kind] of [
  [OPENING_EVENT_ID, "event"],
  [OPENING_TIMELINE_RELATION_ID, "relation"],
  [PHASE_RELATION_ID, "relation"],
] as const) {
  const existing = recordsById.get(recordId);
  if (existing) assert(existing.record_kind === kind, `${recordId} changed kind`);
}

const existingSubmissionIds = new Set(
  readSubmissionEntries()
    .filter((entry) => entry.validation.state === "accepted")
    .map((entry) => entry.submission_id),
);
const previews = observations.map((observation) => createSubmissionEntry(RUN_ID, observation, FIXED_TIMESTAMP));
for (const entry of previews) {
  assert(entry.validation.state === "accepted", `${entry.submission_id} rejected: ${entry.validation.issues.join("; ")}`);
}
const pendingIds = new Set(
  previews.filter((entry) => !existingSubmissionIds.has(entry.submission_id)).map((entry) => entry.submission_id),
);

const apply = process.argv.includes("--apply");
if (apply) {
  for (const observation of observations) {
    const preview = createSubmissionEntry(RUN_ID, observation, FIXED_TIMESTAMP);
    if (!pendingIds.has(preview.submission_id)) continue;
    const written = appendSubmission(RUN_ID, observation);
    assert(written.validation.state === "accepted", `${written.submission_id} rejected while applying: ${written.validation.issues.join("; ")}`);
  }
}

process.stdout.write(`${JSON.stringify({
  run_id: RUN_ID,
  mode: apply ? "apply" : "dry_run",
  observation_count: observations.length,
  already_present_count: observations.length - pendingIds.size,
  written_count: apply ? pendingIds.size : 0,
  pending_count: apply ? 0 : pendingIds.size,
  source_id: SOURCE_ID,
  project_id: PROJECT_ID,
  start_event_id: START_EVENT_ID,
  opening_event_id: OPENING_EVENT_ID,
  opening_timeline_relation_id: OPENING_TIMELINE_RELATION_ID,
  phase_relation_id: PHASE_RELATION_ID,
  submission_ids: previews.map((entry) => entry.submission_id),
}, null, 2)}\n`);
