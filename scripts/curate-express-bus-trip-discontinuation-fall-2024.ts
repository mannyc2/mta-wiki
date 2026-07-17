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

const RUN_ID = "2026-07-13_codex_express-bus-trip-discontinuation-fall-2024";
const SCHEDULE_SOURCE_ID = "ny_open_data_mta_bus_schedule_boundaries_2024";
const RETROSPECTIVE_SOURCE_ID = "meeting_doc_160441";
const PROJECT_ID = "project_fall-2024-express-bus-trip-readjustment";
const EVENT_ID = "event_express-bus-schedule-readjustment-effective-2024-09-01";
const TREATMENT_ID = "treatment_weekday-express-bus-trip-discontinuation-fall-2024";

const projectLocalId = "project_fall_2024_express_bus_trip_readjustment";
const eventLocalId = "event_express_bus_schedule_readjustment_effective_2024_09_01";
const treatmentLocalId = "treatment_weekday_express_bus_trip_discontinuation_fall_2024";

const routeSpecs = [
  {
    label: "BM2",
    recordId: "route_bm2-brt-south-brooklyn-2017",
    localId: "route_bm2_express_fall_2024_discontinuation",
    beforeBlockIds: ["p001_b0043"],
    afterBlockIds: ["p001_b0055"],
  },
  {
    label: "BM5",
    recordId: "route_bm5-brt-south-brooklyn-2017",
    localId: "route_bm5_express_fall_2024_discontinuation",
    beforeBlockIds: ["p001_b0044"],
    afterBlockIds: ["p001_b0056"],
  },
  {
    label: "SIM1C",
    recordId: "route_sim1c-meeting-doc-138456",
    localId: "route_sim1c_express_fall_2024_discontinuation",
    beforeBlockIds: ["p001_b0046"],
    afterBlockIds: ["p001_b0058"],
  },
  {
    label: "SIM4C",
    recordId: "route_sim4c-meeting-doc-138456",
    localId: "route_sim4c_express_fall_2024_discontinuation",
    beforeBlockIds: ["p001_b0053"],
    afterBlockIds: ["p001_b0065"],
  },
  {
    label: "SIM23",
    recordId: "route_sim23-madison-ave-cb6-jun2025",
    localId: "route_sim23_express_fall_2024_discontinuation",
    beforeBlockIds: ["p001_b0048", "p001_b0049"],
    afterBlockIds: ["p001_b0060", "p001_b0061"],
  },
  {
    label: "SIM24",
    recordId: "route_sim24-madison-ave-cb6-jun2025",
    localId: "route_sim24_express_fall_2024_discontinuation",
    beforeBlockIds: ["p001_b0050", "p001_b0051"],
    afterBlockIds: ["p001_b0062", "p001_b0063"],
  },
] as const;

const sourcePins = {
  [SCHEDULE_SOURCE_ID]: {
    artifacts: {
      "source.json": "ff672cb577395ebfbf127c4e88bbfd66face8ce62ec1efaabf24f05a147693b1",
      "bundle-boundaries.json": "5d58d9c572a5b8105c98d6c1132d303ace682262fb88d82ae3ce593eaf269665",
      "dataset-metadata.json": "0d9a369c8c37f87e82e0b194373661e6f88eda5780523dc084d14a1357a862f7",
      "text.txt": "d41ecdf1d1b5682ed33e4b773b61386587be83fcb3a8d74481ffd22a97b29317",
      "blocks.jsonl": "1b3ab902b79eb4d9a108455a917fe6b84b3d31b172418f7c728c9f3e48866dd2",
    },
    blocks: {
      p001_b0001: {
        sha256: "sha256:1d158bd1c605799e42e485698b947b8fbdbcac5e0603f9ac1abbff2a33965cdd",
        literal: "MTA Bus Schedules: 2024",
      },
      p001_b0002: {
        sha256: "sha256:c7358293214cf81fcaa900f4028f44d2cd5ac6e9a3bad8e0bbd77d6ffb2f0c65",
        literal: "udt9-hvjq",
      },
      p001_b0003: {
        sha256: "sha256:944e1fb5e5ad211d7a85a2063ed0b0066272a083436a279c2441fd540e1f7947",
        literal: "Metropolitan Transportation Authority",
      },
      p001_b0004: {
        sha256: "sha256:152003839d8d4e167e4834dedddef73367ef4a486f6a7cedc773f2c9195a763c",
        literal: "rows for each scheduled timepoint stop",
      },
      p001_b0005: {
        sha256: "sha256:8add51996d2ea1c670291e4cacd57587923184e6114e5d8abe73548251c310e7",
        literal: "date for the beginning of schedule trips",
      },
      p001_b0006: {
        sha256: "sha256:a9714f61b2d2d7f40174580ecf7807702a996df48c4f9f4c52fa1f5f631f281b",
        literal: "13 = Express service",
      },
      p001_b0007: {
        sha256: "sha256:d596c016822730ebf5b5fcabf099582952a836e26cc6a1a873efe8cff11dd611",
        literal: "origin (1)",
      },
      p001_b0008: {
        sha256: "sha256:b0f36fbdb5416c0aba35c32468c5099721b5e9778efa411c5e02a5b6308cd165",
        literal: "type of day",
      },
      p001_b0011: {
        sha256: "sha256:a5f2a6e75bf591a5bdadedc49b1c9e051736fee111c65bd2664e6b540fa72c2f",
        literal: "Name of bundle in effect",
      },
      p001_b0012: {
        sha256: "sha256:5818763fc14a1d7d2957287999958e53a40640e6bcec4e992136038e37508f86",
        literal: "Bundle-boundary query",
      },
      p001_b0015: {
        sha256: "sha256:540feb4d73aa7e73b7f6bb0df233a3cf6c0e52b41d724ee644236800a3037e84",
        literal: "2024-08-31T00:00:00.000 | bundle=2024Jun",
      },
      p001_b0016: {
        sha256: "sha256:528c591be4aec4254ec77f84d47801b2f7fbacd4fbd2dc9fe9a34d9dcdbcc4e0",
        literal: "2024-09-01T00:00:00.000 | bundle=2024Sep",
      },
      p001_b0017: {
        sha256: "sha256:ce61508c290bf1a0ed60f8a66d87c1c73fe01dbe9f3416213b931e4934128ac4",
        literal: "Weekday-count query",
      },
      p001_b0043: {
        sha256: "sha256:3d51967f75d4936ce0e87096728d779a43ac9c7440c98a59f9e1eef7e1451709",
        literal: "route_id=BM2 | direction=W | bundle=2024Jun | trip_count=21",
      },
      p001_b0044: {
        sha256: "sha256:f5038a8f474e8de70db20a0436f86d27ed9ebba191632f38cc2ee10d9ae0a22f",
        literal: "route_id=BM5 | direction=E | bundle=2024Jun | trip_count=18",
      },
      p001_b0046: {
        sha256: "sha256:a7b8fcb2095e4ff894789ea538996bbed38b1010e6a559a17481a7ea7da2229e",
        literal: "route_id=SIM1C | direction=N | bundle=2024Jun | trip_count=56",
      },
      p001_b0048: {
        sha256: "sha256:ab2d70e5d32905478b06a5c39d9583ad9da64bebf5c1b2bcf5c74b425583ab95",
        literal: "route_id=SIM23 | direction=N | bundle=2024Jun | trip_count=7",
      },
      p001_b0049: {
        sha256: "sha256:0fa0f2c411281374ce5c069aef9a0d4de72a69dd3711a8e1b4a241e9aa4cef9b",
        literal: "route_id=SIM23 | direction=S | bundle=2024Jun | trip_count=7",
      },
      p001_b0050: {
        sha256: "sha256:b1d4411524489551f4ba272a7f249ef624a94d73110abf4ec4c44c2128679740",
        literal: "route_id=SIM24 | direction=N | bundle=2024Jun | trip_count=7",
      },
      p001_b0051: {
        sha256: "sha256:78c9b7288ab7c0f9d8c653c6bbaba6bf8053543dbb08fd0a2bc7376d096212a8",
        literal: "route_id=SIM24 | direction=S | bundle=2024Jun | trip_count=7",
      },
      p001_b0053: {
        sha256: "sha256:facf4aa8c10e2ea378b898768f5058d81e1d4e9dae540fcde688615d228565ed",
        literal: "route_id=SIM4C | direction=S | bundle=2024Jun | trip_count=30",
      },
      p001_b0055: {
        sha256: "sha256:f7bdef98453a57f190a2f4e72e3664a831d929d6977cfe3578396a51b06da1bf",
        literal: "route_id=BM2 | direction=W | bundle=2024Sep | trip_count=20",
      },
      p001_b0056: {
        sha256: "sha256:ccc0e467d92ce87c0da3e7196822c660580d203a1aa580ad0bf07b220bc74370",
        literal: "route_id=BM5 | direction=E | bundle=2024Sep | trip_count=17",
      },
      p001_b0058: {
        sha256: "sha256:9e672afe30912979d2d0a384c01d645a5f383777a9117b2571b507aaafa5c3b4",
        literal: "route_id=SIM1C | direction=N | bundle=2024Sep | trip_count=55",
      },
      p001_b0060: {
        sha256: "sha256:8b85c178f187bbb2ecd573a72b011c3fee94abbdf5e304b4fc2ff1f797e5385d",
        literal: "route_id=SIM23 | direction=N | bundle=2024Sep | trip_count=6",
      },
      p001_b0061: {
        sha256: "sha256:1154c6fd8d3773822db25337bd43f3c1585e38e13e74f3e187c6dc749da5e9a5",
        literal: "route_id=SIM23 | direction=S | bundle=2024Sep | trip_count=6",
      },
      p001_b0062: {
        sha256: "sha256:7d512fdf1d0427150cdf52a11430f9af413d9f2dfe8de1f310575d5ffe02ba9f",
        literal: "route_id=SIM24 | direction=N | bundle=2024Sep | trip_count=6",
      },
      p001_b0063: {
        sha256: "sha256:508c3f912bb438e7ec53bf859f80cf61103b03f4553cba4fa8a37ee565c5b7fa",
        literal: "route_id=SIM24 | direction=S | bundle=2024Sep | trip_count=6",
      },
      p001_b0065: {
        sha256: "sha256:58a6d1fcc178cedd2791b860e9352efeae2376616a87ced191524b40e780d21f",
        literal: "route_id=SIM4C | direction=S | bundle=2024Sep | trip_count=29",
      },
    },
  },
  [RETROSPECTIVE_SOURCE_ID]: {
    artifacts: {
      "source.pdf": "2cbb8ac03d1b52681982b1bd4d994c17b2f6e6995c1d4806bdf34b0ee8f754b8",
      "blocks.jsonl": "a8e8b7a9a66145447444633e8c96e24afa195d39a8170f6f653c0786fc71efde",
    },
    blocks: {
      p003_c0004: {
        sha256: "sha256:730a088e5bef117b4b219c33d1ed4a5918f303f53260c116cf651770b2dfedb9",
        literal: "removed in fall 2024",
      },
      p003_c0005: {
        sha256: "sha256:a1cb3550e548ba0e4cc902da5e264574b62e2318fcfe0a6f5418eb28d04373de",
        literal: "BM2 (MTA Bus)",
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
  [SCHEDULE_SOURCE_ID, loadBlocks(SCHEDULE_SOURCE_ID)],
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

function routeScheduleEvidence(
  route: (typeof routeSpecs)[number],
  rolePrefix: string,
): MtaEvidenceSubmissionRef[] {
  return [
    ...route.beforeBlockIds.map((blockId) => evidence(SCHEDULE_SOURCE_ID, blockId, `${rolePrefix}_before_weekday_count`)),
    ...route.afterBlockIds.map((blockId) => evidence(SCHEDULE_SOURCE_ID, blockId, `${rolePrefix}_after_weekday_count`)),
  ];
}

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: SCHEDULE_SOURCE_ID,
    observation_kind: "source",
    local_observation_id: `source_${SCHEDULE_SOURCE_ID}`,
    label: "MTA Bus Schedules 2024 six-route boundary and weekday-count query",
    raw_text: block(SCHEDULE_SOURCE_ID, "p001_b0001").raw_text,
    payload: {
      title: "MTA Bus Schedules: 2024 — six-route summer and fall schedule boundary query",
      publisher: "Metropolitan Transportation Authority",
      content_type: "official structured dataset query",
      // Preserve the accepted append-only journal byte-for-byte. A reviewed semantic correction
      // fixes this historical press/express normalizer false positive in canonical output.
      authority_tier: "press_release",
      retrieved_at: "2026-07-13T10:25:43Z",
      source_url: "https://data.ny.gov/Transportation/MTA-Bus-Schedules-2024/udt9-hvjq/about_data",
      description: "Hash-pinned official schedule-bundle boundaries and weekday express-trip origin counts for BM2, BM5, SIM1C, SIM4C, SIM23, and SIM24.",
    },
    evidence_refs: [
      evidence(SCHEDULE_SOURCE_ID, "p001_b0001", "source_title"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0002", "dataset_identifier"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0003", "publisher"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0004", "dataset_scope"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0005", "schedule_date_definition"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0006", "express_trip_filter_definition"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0007", "trip_origin_filter_definition"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0008", "weekday_service_filter_definition"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0011", "bundle_definition"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0012", "bundle_boundary_query"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0017", "weekday_count_query"),
    ],
  },
  {
    source_id: SCHEDULE_SOURCE_ID,
    observation_kind: "event",
    local_observation_id: eventLocalId,
    create_new: true,
    label: "Fall 2024 express bus schedule readjustment effective September 1, 2024",
    raw_text: block(SCHEDULE_SOURCE_ID, "p001_b0016").raw_text,
    payload: {
      event_kind: "schedule adjustment",
      event_family: "implementation",
      lifecycle_phase: "modified",
      date_text: "2024-09-01",
      description: "For the official schedule dataset, the bundle in effect changes from 2024Jun on August 31 to 2024Sep on September 1, 2024.",
    },
    evidence_refs: [
      evidence(SCHEDULE_SOURCE_ID, "p001_b0011", "bundle_definition", "Name of bundle in effect"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0012", "boundary_query_definition"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0015", "prior_bundle_boundary"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0016", "effective_bundle_boundary"),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "project",
    local_observation_id: projectLocalId,
    label: "Fall 2024 Express Bus Trip Readjustment",
    raw_text: block(RETROSPECTIVE_SOURCE_ID, "p003_c0004").raw_text,
    payload: {
      project_name: "Fall 2024 Express Bus Trip Readjustment",
      project_type: "bus service change",
      status: "implemented",
      description: "Fall 2024 removal of the weekday trips added in summer 2024 on BM2, BM5, SIM1C, SIM4C, SIM23, and SIM24.",
      agency: "MTA",
    },
    evidence_refs: [
      evidence(RETROSPECTIVE_SOURCE_ID, "p003_c0004", "implemented_project_status", "removed in fall 2024"),
      evidence(RETROSPECTIVE_SOURCE_ID, "p003_c0005", "project_route_and_trip_scope"),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: treatmentLocalId,
    create_new: true,
    label: "Weekday express-bus trip discontinuation",
    raw_text: block(RETROSPECTIVE_SOURCE_ID, "p003_c0004").raw_text,
    payload: {
      treatment_kind: "weekday express-bus trip discontinuation",
      treatment_family: "service_pattern",
      description: "Removal of the specific weekday express-bus trips that had been added on six routes in summer 2024.",
    },
    evidence_refs: [
      evidence(RETROSPECTIVE_SOURCE_ID, "p003_c0004", "delivered_treatment_definition", "removed in fall 2024"),
      evidence(RETROSPECTIVE_SOURCE_ID, "p003_c0005", "treatment_trip_and_route_scope"),
    ],
  },
  ...routeSpecs.map<MtaSubmitObservationInput>((route) => ({
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "route",
    local_observation_id: route.localId,
    target_record_id: route.recordId,
    label: route.label,
    raw_text: block(RETROSPECTIVE_SOURCE_ID, "p003_c0005").raw_text,
    payload: {
      route_id: route.label,
      route_label: route.label,
      route_type: "express",
    },
    evidence_refs: [
      evidence(RETROSPECTIVE_SOURCE_ID, "p003_c0005", "retrospective_route_identity_and_trip_pattern", route.label),
    ],
  })),
  ...routeSpecs.map<MtaSubmitObservationInput>((route) => ({
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: `relation_fall_2024_express_readjustment_affect_${route.label.toLowerCase()}`,
    label: `Fall 2024 express bus readjustment affects ${route.label}`,
    payload: {
      relation_kind: "affects_route",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: route.localId,
      assertion_status: "delivered",
      as_of_date: "2024-12-10",
      description: `The official retrospective identifies ${route.label} within the six-route summer package removed in fall, and the schedule query shows its added weekday trip count absent after the September boundary.`,
    },
    evidence_refs: [
      evidence(RETROSPECTIVE_SOURCE_ID, "p003_c0004", "retrospective_delivered_route_scope", "removed in fall 2024"),
      evidence(RETROSPECTIVE_SOURCE_ID, "p003_c0005", "retrospective_route_scope", route.label),
      ...routeScheduleEvidence(route, "structured_feed_route_scope"),
    ],
  })),
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_fall_2024_express_readjustment_has_weekday_trip_discontinuation",
    label: "Fall 2024 express bus readjustment has weekday trip-discontinuation treatment",
    payload: {
      relation_kind: "has_treatment",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: treatmentLocalId,
      assertion_status: "delivered",
      as_of_date: "2024-12-10",
      description: "The December retrospective confirms that the six summer frequency increases were removed in fall 2024.",
    },
    evidence_refs: [
      evidence(RETROSPECTIVE_SOURCE_ID, "p003_c0004", "delivered_treatment_scope", "removed in fall 2024"),
      evidence(RETROSPECTIVE_SOURCE_ID, "p003_c0005", "treatment_trip_and_route_scope"),
    ],
  },
  {
    source_id: RETROSPECTIVE_SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_fall_2024_express_readjustment_has_september_1_schedule_adjustment",
    label: "Fall 2024 express bus readjustment has September 1 schedule-adjustment event",
    payload: {
      relation_kind: "has_timeline_event",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: eventLocalId,
      subject_id: PROJECT_ID,
      object_id: EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2024-12-10",
      description: "The December retrospective confirms the fall removal, while the official schedule dataset supplies the September 1 boundary at which the 2024Sep bundle replaces 2024Jun.",
    },
    evidence_refs: [
      evidence(RETROSPECTIVE_SOURCE_ID, "p003_c0004", "retrospective_delivered_timeline_status", "removed in fall 2024"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0015", "prior_bundle_boundary"),
      evidence(SCHEDULE_SOURCE_ID, "p001_b0016", "effective_bundle_boundary"),
    ],
  },
];

const recordsById = new Map(readCanonicalRecordsFromJsonl().map((record) => [record.record_id, record]));
for (const route of routeSpecs) {
  const record = recordsById.get(route.recordId);
  assert(record?.record_kind === "route", `Missing route target ${route.recordId}`);
  assert(record.truth_status === "source_stated" && record.review_state !== "quarantined", `${route.recordId} is not usable`);
}
const summerAddition = recordsById.get("event_express-bus-service-increases-begin-june-30-2024");
assert(summerAddition?.record_kind === "event", "Missing paired summer 2024 addition event");
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
  createSubmissionEntry(RUN_ID, observation, "2026-07-13T11:00:00.000Z"),
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
    const preview = createSubmissionEntry(RUN_ID, observation, "2026-07-13T11:00:00.000Z");
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
  source_ids: [SCHEDULE_SOURCE_ID, RETROSPECTIVE_SOURCE_ID],
  submission_ids: previews.map((entry) => entry.submission_id),
}, null, 2)}\n`);
