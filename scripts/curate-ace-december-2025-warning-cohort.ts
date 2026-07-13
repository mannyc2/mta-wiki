import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { canonicalRecordIdForInput } from "../packages/db/src/identity.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type {
  JsonValue,
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
import {
  readSemanticCorrections,
  semanticCorrectionsPath,
  withSemanticCorrections,
  type SemanticCorrectionEntry,
} from "../packages/pipeline/src/records/semantic-corrections.js";

const RUN_ID = "2026-07-13_codex_ace-december-2025-warning-cohort-curation";
const FIXED_SUBMITTED_AT = "2026-07-13T22:30:00.000Z";
const REVIEWED_AT = "2026-07-13T22:30:00Z";
const SOURCE_DECISION = "scripts/curate-ace-december-2025-warning-cohort.ts#semantic-corrections";
const RETIRED_COVERAGE_DECISION_ID = "non-study-ace-program-expansion-dec2025-timeline-subject-not-applicable";
const RETIRED_COVERAGE_DECISION_SHA256 = "c89594a8ccb5896cfc1798b336aa64b45de04c966817beea8edd45627aa4fe70";
const RETIRED_COVERAGE_DECISION_PATH = join(
  repoRoot,
  "data/operational-anchor-review/ledger-decisions/decisions",
  `${RETIRED_COVERAGE_DECISION_ID}.json`,
);
const COVERAGE_DECISION_RETIREMENT_PATH = join(
  repoRoot,
  "data/operational-anchor-review/ledger-decisions/retired",
  `${RETIRED_COVERAGE_DECISION_ID}.json`,
);

const SOURCE_ID = "nyct_key_performance_metrics_doc194001";
const PROGRAM_PROJECT_ID = "project_ace-automated-camera-enforcement";
const PROGRAM_LOCAL_ID = "project_automated_camera_enforcement_ace";
const EVENT_ID = "event_ace-program-expansion-dec2025";
const EVENT_LOCAL_ID = "event_ace_program_expansion_dec2025";
const EVENT_DATE = "2025-12-08";
const EVENT_DATE_LITERAL = "December 8";
const EXPECTED_OCCURRENCE_ID = "occurrence:1ed365a241353614f72f025e";
const SUCCESSOR_ROUTE_GAP_ID = "operational-coverage:cb81df5ab159c18671171291";
const SUCCESSOR_TREATMENT_GAP_ID = "operational-coverage:64381715a1777d38c32034f4";
const SUCCESSOR_ROUTE_DECISION_ID =
  "ace-b60-b68-m57-warning-phase-2025-12-08-route-gap-superseded-by-approved-occurrence";
const SUCCESSOR_TREATMENT_DECISION_ID =
  "ace-b60-b68-m57-warning-phase-2025-12-08-treatment-gap-superseded-by-approved-occurrence";

const ROUTE_ANCHOR_PATH = "data/exports/releases/v1-rc18/route_anchors.jsonl";
const ROUTE_ANCHOR_SHA256 = "517b8f74a89e70ec4791d0bf327da6224bb9a6b2ea44eaf8162d704721659239";
const ACQUISITION_RECEIPT_PATH =
  "data/quality/acquisition/receipts/ace-b60-b68-m57-warning-phase-december-8-2025.json";
const ACQUISITION_RECEIPT_SHA256 = "7b9d63000090cf22821949db5087d2b2b5611ada41059cc5069aaf356c159fdb";

const COHORT_PROJECT_LOCAL_ID = "project_ace_b60_b68_m57_warning_cohort_2025_12_08";
const TREATMENT_LOCAL_ID = "treatment_ace_b60_b68_m57_warning_phase_2025_12_08";
const TIMELINE_RELATION_LOCAL_ID = "relation_ace_b60_b68_m57_warning_has_activation_2025_12_08";
const TREATMENT_RELATION_LOCAL_ID = "relation_ace_b60_b68_m57_warning_has_treatment_2025_12_08";
const PROGRAM_RELATION_LOCAL_ID = "relation_ace_b60_b68_m57_warning_part_of_program";

const EXPECTED_RECORD_IDS = {
  project: "project_ace-b60-b68-m57-warning-cohort-2025-12-08",
  event: EVENT_ID,
  treatment: "treatment_ace-b60-b68-m57-warning-phase-2025-12-08",
  timelineRelation: "relation_ace-b60-b68-m57-warning-has-activation-2025-12-08",
  treatmentRelation: "relation_ace-b60-b68-m57-warning-has-treatment-2025-12-08",
  programRelation: "relation_ace-b60-b68-m57-warning-part-of-program",
  routeRelations: {
    B60: "relation_ace-b60-b68-m57-2025-12-08-affects-b60",
    B68: "relation_ace-b60-b68-m57-2025-12-08-affects-b68",
    M57: "relation_ace-b60-b68-m57-2025-12-08-affects-m57",
  },
} as const;

const SOURCE_ARTIFACT_SHA256: Record<string, string> = {
  "metadata.json": "641b84213f03daa8591e9fbc9f1d7325eea12daed2d55770448fe87173fa35d0",
  "source.pdf": "61b015b7778c176b182d4d81422aaf27c06f0ee6ad2953cb494cbff9453b2f19",
  "text.txt": "94e7d39757e0cb7c39f580341d8fdb990c2637be87c7ece9bee55a83a83bd68e",
  "blocks.jsonl": "068d54b750065e0a05d2b1b696d64eaf5171763908626207115060c5bf7f7ee7",
};

type SourceBlock = {
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

type RouteAnchorRow = {
  aliases: string[];
  anchor_reason: string | null;
  canonical_route_record_id: string | null;
  disposition: string;
  gtfs_route_id: string;
  variant_record_ids: string[];
};

type RouteSpec = {
  literal: "B60" | "B68" | "M57";
  borough: "Brooklyn" | "Manhattan";
  targetRecordId: string;
  localId: string;
  relationLocalId: string;
};

const routes: RouteSpec[] = [
  {
    literal: "B60",
    borough: "Brooklyn",
    targetRecordId: "route_b60",
    localId: "route_ace_dec2025_b60",
    relationLocalId: "relation_ace_b60_b68_m57_2025_12_08_affects_b60",
  },
  {
    literal: "B68",
    borough: "Brooklyn",
    targetRecordId: "route_b68-nyct-2025",
    localId: "route_ace_dec2025_b68",
    relationLocalId: "relation_ace_b60_b68_m57_2025_12_08_affects_b68",
  },
  {
    literal: "M57",
    borough: "Manhattan",
    targetRecordId: "route_m57-nyct-2025",
    localId: "route_ace_dec2025_m57",
    relationLocalId: "relation_ace_b60_b68_m57_2025_12_08_affects_m57",
  },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const originalCoverageDecision = {
  schema_version: 1,
  decision_id: RETIRED_COVERAGE_DECISION_ID,
  gap_id: "operational-coverage:ee9721813dc1e45e440d0589",
  prior_verdict: "unreviewed",
  verdict: "not_applicable",
  reviewer: "codex-corpus-completion-2026-07-13",
  decided_at: "2026-07-13T08:20:00.000Z",
  rationale:
    "This record describes routes entering ACE warning periods, not the later start of violation issuance. A warning-period program expansion is not a realized enforcement onset for the speed study; any later activation must be recovered as a separate route-atomic occurrence from retrospective evidence.",
  proposal_ids: [],
  evidence_refs: [
    {
      record_id: "event_ace-program-expansion-dec2025",
      source_id: "nyct_key_performance_metrics_doc194001",
      evidence_id: "nyct_key_performance_metrics_doc194001#p010_c0011",
      block_id: "p010_c0011",
    },
  ],
  search_receipt_ids: [],
} as const;

assert(
  sha256(prettyJson(originalCoverageDecision)) === RETIRED_COVERAGE_DECISION_SHA256,
  "Pinned prior coverage decision serialization changed",
);

const coverageDecisionRetirement = {
  schema_version: 1,
  retirement_id: "retire-ace-dec2025-warning-cohort-non-study-decision-20260713",
  retired_decision_id: RETIRED_COVERAGE_DECISION_ID,
  retired_decision_sha256: RETIRED_COVERAGE_DECISION_SHA256,
  retired_at: REVIEWED_AT,
  reason:
    "The prior decision treated warning-phase activation as non-study. The existing accepted September 2025 ACE occurrence and the bounded December source establish warning-phase activation as the operational treatment onset, while still forbidding inference of later fine-bearing enforcement. Linking the exact B60/B68/M57 cohort structurally removes the old timeline-subject gap, so the now-unknown decision is retired rather than silently dropped.",
  replacement_context: {
    event_record_id: EVENT_ID,
    event_date: EVENT_DATE,
    route_record_ids: routes.map((route) => route.targetRecordId),
    treatment_record_id: EXPECTED_RECORD_IDS.treatment,
    timeline_relation_record_id: EXPECTED_RECORD_IDS.timelineRelation,
    occurrence_id: EXPECTED_OCCURRENCE_ID,
    successor_gap_ids: [SUCCESSOR_ROUTE_GAP_ID, SUCCESSOR_TREATMENT_GAP_ID],
    successor_decision_ids: [SUCCESSOR_ROUTE_DECISION_ID, SUCCESSOR_TREATMENT_DECISION_ID],
    explicit_non_claim: "No fine-bearing enforcement onset is inferred.",
  },
  original_decision: originalCoverageDecision,
} as const;

const activeCoverageDecisionExists = existsSync(RETIRED_COVERAGE_DECISION_PATH);
const retirementRecordExists = existsSync(COVERAGE_DECISION_RETIREMENT_PATH);
assert(
  activeCoverageDecisionExists || retirementRecordExists,
  `Missing both active and retired forms of ${RETIRED_COVERAGE_DECISION_ID}`,
);
if (activeCoverageDecisionExists) {
  assert(
    sha256(readFileSync(RETIRED_COVERAGE_DECISION_PATH)) === RETIRED_COVERAGE_DECISION_SHA256,
    `${RETIRED_COVERAGE_DECISION_ID} changed before retirement`,
  );
}
if (retirementRecordExists) {
  assert(
    readFileSync(COVERAGE_DECISION_RETIREMENT_PATH, "utf8") === prettyJson(coverageDecisionRetirement),
    `${COVERAGE_DECISION_RETIREMENT_PATH} changed`,
  );
}

for (const [filename, expectedSha256] of Object.entries(SOURCE_ARTIFACT_SHA256)) {
  const path = join(repoRoot, "raw", "sources", SOURCE_ID, filename);
  assert(sha256(readFileSync(path)) === expectedSha256, `${SOURCE_ID}/${filename} changed`);
}

assert(
  sha256(readFileSync(join(repoRoot, ACQUISITION_RECEIPT_PATH))) === ACQUISITION_RECEIPT_SHA256,
  `${ACQUISITION_RECEIPT_PATH} changed`,
);

const sourceBlocks = new Map(
  readJsonl<SourceBlock>(join(repoRoot, "raw", "sources", SOURCE_ID, "blocks.jsonl")).map((block) => [
    block.block_id,
    block,
  ]),
);

function pinnedBlock(blockId: string, expectedSha256: string, literals: string[]): SourceBlock {
  const block = sourceBlocks.get(blockId);
  assert(block, `Missing ${SOURCE_ID}#${blockId}`);
  assert(block.raw_text_sha256 === expectedSha256, `${SOURCE_ID}#${blockId} hash changed`);
  for (const literal of literals) {
    assert(block.raw_text.includes(literal), `${SOURCE_ID}#${blockId} lost ${JSON.stringify(literal)}`);
  }
  return block;
}

const reportMonthBlock = pinnedBlock(
  "p001_c0002",
  "sha256:1c2e7d7242d4937bffeb7ae2ac5b4071b084298424eb1637e9c216f6f292d64f",
  ["December 2025"],
);
const reportDateBlock = pinnedBlock(
  "p003_c0003",
  "sha256:da018863a9eae42e35f1a801fc448de9d224d07d24d389b5c264e09564cfb624",
  ["December 15, 2025"],
);
const activationBlock = pinnedBlock(
  "p010_c0011",
  "sha256:e147dfa103fac9d1499e269c62864619e13cdfd4b3540e71e98ebfb706cd1a42",
  [
    "expanded the Automated Camera Enforcement (ACE) program to three additional bus routes",
    "On December 8",
    "the B68 and B60 in Brooklyn and the M57 in Manhattan entered a 60-day warning phase",
  ],
);
const warningDefinitionBlock = pinnedBlock(
  "p011_c0009",
  "sha256:2d2318454276de1fad6ef39bbd54826456515f6b382b2a9e95ab426545adf858",
  [
    "lanes, bus stops, or double-parked received warning notices",
    "These routes joined 51 already covered by ACE",
  ],
);

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

const activationEvidence = evidence(
  activationBlock,
  "warning_phase_activation",
  "On December 8, the B68 and B60 in Brooklyn and the M57 in Manhattan entered a 60-day warning phase",
);
const warningDefinitionEvidence = evidence(
  warningDefinitionBlock,
  "warning_phase_definition",
  "lanes, bus stops, or double-parked received warning notices",
);
const reportMonthEvidence = evidence(reportMonthBlock, "report_month_context", "December 2025");
const reportDateEvidence = evidence(reportDateBlock, "report_date_context", "December 15, 2025");
const commonEvidence = [
  activationEvidence,
  warningDefinitionEvidence,
  reportMonthEvidence,
  reportDateEvidence,
];

const routeAnchorBytes = readFileSync(join(repoRoot, ROUTE_ANCHOR_PATH));
assert(sha256(routeAnchorBytes) === ROUTE_ANCHOR_SHA256, `${ROUTE_ANCHOR_PATH} hash changed`);
const routeAnchors = readJsonl<RouteAnchorRow>(join(repoRoot, ROUTE_ANCHOR_PATH));
for (const route of routes) {
  const anchor = routeAnchors.find((row) => row.gtfs_route_id === route.literal);
  assert(anchor, `${ROUTE_ANCHOR_PATH} lost GTFS route ${route.literal}`);
  assert(anchor.disposition === "true_route", `${route.literal} is no longer a true-route rc18 anchor`);
  assert(
    anchor.canonical_route_record_id === route.targetRecordId,
    `${route.literal} rc18 anchor changed from ${route.targetRecordId} to ${anchor.canonical_route_record_id ?? "null"}`,
  );
  assert(anchor.variant_record_ids.length === 0, `${route.literal} rc18 anchor unexpectedly gained variants`);
}

const sourceText = `${activationBlock.raw_text} ${warningDefinitionBlock.raw_text}`;
const routeText = routes.map((route) => route.literal).join(", ");

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: SOURCE_ID,
    observation_kind: "project",
    local_observation_id: COHORT_PROJECT_LOCAL_ID,
    create_new: true,
    label: "B60/B68/M57 ACE warning-phase cohort — December 8, 2025",
    raw_text: sourceText,
    payload: {
      project_name: "B60/B68/M57 ACE warning-phase cohort — December 8, 2025",
      project_type: "bounded ACE warning-phase activation cohort",
      project_family: "enforcement_program",
      status: "implemented",
      document_time_status: "implemented",
      implementation_date: EVENT_DATE,
      description:
        "Bounded ACE cohort for B60, B68, and M57 beginning with the official 60-day warning-phase activation on December 8, 2025; it does not assert a fine-bearing start date.",
    },
    evidence_refs: commonEvidence,
  },
  ...routes.map<MtaSubmitObservationInput>((route) => ({
    source_id: SOURCE_ID,
    observation_kind: "route",
    local_observation_id: route.localId,
    target_record_id: route.targetRecordId,
    label: route.literal,
    raw_text: route.literal,
    payload: {
      route_id: route.literal,
      route_label: route.literal,
      route_type: "bus",
      borough: route.borough,
    },
    evidence_refs: [evidence(activationBlock, "route_identity", route.literal)],
  })),
  {
    source_id: SOURCE_ID,
    observation_kind: "treatment_component",
    local_observation_id: TREATMENT_LOCAL_ID,
    create_new: true,
    label: "B60/B68/M57 ACE 60-day warning-phase activation",
    raw_text: sourceText,
    payload: {
      treatment_kind: "Automated Camera Enforcement (ACE) 60-day warning-phase activation",
      treatment_family: "automated_bus_lane_enforcement",
      location_text: "B60, B68, and M57",
      implementation_date: EVENT_DATE,
      description:
        "One atomic ACE warning-phase treatment activated on B60, B68, and M57 on December 8, 2025, issuing warnings for blocked bus lanes, blocked bus stops, and double parking; this record does not claim that fines began that day.",
    },
    evidence_refs: commonEvidence,
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: TIMELINE_RELATION_LOCAL_ID,
    label: "B60/B68/M57 ACE warning cohort has December 8 activation",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: COHORT_PROJECT_LOCAL_ID,
      object_local_observation_id: EVENT_LOCAL_ID,
      assertion_status: "delivered",
      as_of_date: EVENT_DATE,
      description: "The bounded B60/B68/M57 cohort entered its 60-day ACE warning phase on December 8, 2025.",
    },
    evidence_refs: commonEvidence,
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: TREATMENT_RELATION_LOCAL_ID,
    label: "B60/B68/M57 ACE warning cohort has warning-phase treatment",
    payload: {
      relation_kind: "has_treatment",
      relation_family: "treatment_scope",
      subject_local_observation_id: COHORT_PROJECT_LOCAL_ID,
      object_local_observation_id: TREATMENT_LOCAL_ID,
      assertion_status: "delivered",
      as_of_date: EVENT_DATE,
      description: "The bounded cohort has one atomic Automated Camera Enforcement 60-day warning-phase treatment.",
    },
    evidence_refs: commonEvidence,
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: PROGRAM_RELATION_LOCAL_ID,
    label: "B60/B68/M57 warning cohort is part of ACE",
    payload: {
      relation_kind: "part_of_program",
      relation_family: "program_project_scope",
      subject_local_observation_id: COHORT_PROJECT_LOCAL_ID,
      object_local_observation_id: PROGRAM_LOCAL_ID,
      assertion_status: "delivered",
      as_of_date: EVENT_DATE,
      description: "The bounded B60/B68/M57 warning-phase cohort is part of the Automated Camera Enforcement program.",
    },
    evidence_refs: commonEvidence,
  },
  ...routes.map<MtaSubmitObservationInput>((route) => ({
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: route.relationLocalId,
    label: `B60/B68/M57 ACE warning cohort affects ${route.literal}`,
    payload: {
      relation_kind: "affects_route",
      relation_family: "route_scope",
      subject_local_observation_id: COHORT_PROJECT_LOCAL_ID,
      object_local_observation_id: route.localId,
      assertion_status: "delivered",
      as_of_date: EVENT_DATE,
      description: `${route.literal} entered the 60-day ACE warning phase on December 8, 2025 as part of this bounded cohort.`,
    },
    evidence_refs: [
      evidence(activationBlock, "route_scope", route.literal),
      warningDefinitionEvidence,
      reportMonthEvidence,
      reportDateEvidence,
    ],
  })),
];

const expectedRecordIdByLocalId = new Map<string, string>([
  [COHORT_PROJECT_LOCAL_ID, EXPECTED_RECORD_IDS.project],
  [TREATMENT_LOCAL_ID, EXPECTED_RECORD_IDS.treatment],
  [TIMELINE_RELATION_LOCAL_ID, EXPECTED_RECORD_IDS.timelineRelation],
  [TREATMENT_RELATION_LOCAL_ID, EXPECTED_RECORD_IDS.treatmentRelation],
  [PROGRAM_RELATION_LOCAL_ID, EXPECTED_RECORD_IDS.programRelation],
  ...routes.map((route) => [route.localId, route.targetRecordId] as const),
  ...routes.map((route) => [route.relationLocalId, EXPECTED_RECORD_IDS.routeRelations[route.literal]] as const),
]);
for (const observation of observations) {
  const expectedRecordId = expectedRecordIdByLocalId.get(observation.local_observation_id);
  assert(expectedRecordId, `Missing expected record id for ${observation.local_observation_id}`);
  assert(
    canonicalRecordIdForInput(observation) === expectedRecordId,
    `${observation.local_observation_id} no longer maps to ${expectedRecordId}`,
  );
}

const correctedEventDescription =
  "ACE expanded to B60, B68, and M57 when the three routes entered a 60-day warning phase on December 8, 2025; the source does not establish the later fine-bearing start date.";
const correctedEventPayload = {
  event_kind: "ACE warning-phase activation",
  event_date: EVENT_DATE_LITERAL,
  description: correctedEventDescription,
  event_date_normalized: {
    raw_text: EVENT_DATE_LITERAL,
    normalized_date: EVENT_DATE,
    precision: "day",
    confidence: "parsed_text",
  },
  event_family: "implementation",
  lifecycle_phase: "expanded",
  date_normalized: EVENT_DATE,
  date_precision: "day",
  date_resolution_basis:
    "The event sentence states December 8; the official report cover says December 2025 and its report-date block says December 15, 2025, establishing the year without rewriting the source literal.",
} as const;

const corrections: SemanticCorrectionEntry[] = [
  {
    correction_id: "core-coverage-ace-dec2025-01-warning-event-semantics-20260713",
    op: "patch_payload",
    record_id: EVENT_ID,
    guards: {
      payload: {
        event_kind: "program_expansion",
        event_date: "December 8, 2025",
        description: "Automated Camera Enforcement (ACE) program expanded to three additional bus routes",
        event_date_normalized: {
          raw_text: "December 8, 2025",
          normalized_date: EVENT_DATE,
          precision: "day",
          confidence: "parsed_text",
        },
        event_family: "implementation",
        lifecycle_phase: "expanded",
        date_normalized: EVENT_DATE,
        date_precision: "day",
      },
    },
    patch: { set: correctedEventPayload },
    cascade: [],
    reason:
      "The source literal is only 'December 8'; 2025 is resolved from the official December 2025 report context. The source specifically records entry into a 60-day warning phase, not the later start of fine-bearing enforcement.",
    source_decision: SOURCE_DECISION,
    reviewed_at: REVIEWED_AT,
    provenance: "human",
  },
  {
    correction_id: "core-coverage-ace-dec2025-02-recite-warning-event-evidence-20260713",
    op: "recite_evidence",
    record_id: EVENT_ID,
    guards: { payload: correctedEventPayload },
    patch: { evidence_refs: commonEvidence as unknown as JsonValue },
    cascade: [],
    reason:
      "The existing event cites the activation sentence but not its continuation or the official report blocks that resolve the year. Recite the exact local blocks so warning semantics and date resolution remain independently auditable.",
    source_decision: SOURCE_DECISION,
    reviewed_at: REVIEWED_AT,
    provenance: "human",
  },
  ...routes.map<SemanticCorrectionEntry>((route) => ({
    correction_id: `core-coverage-ace-dec2025-10-retract-umbrella-covers-${route.literal.toLowerCase()}-20260713`,
    op: "retract_record",
    record_id: `relation_ace-covers-${route.literal.toLowerCase()}`,
    guards: {
      payload: {
        relation_kind: "covers_route",
        subject_local_observation_id: PROGRAM_LOCAL_ID,
        object_local_observation_id:
          route.literal === "B60"
            ? "route_b60_nyct_update_2025"
            : route.literal === "B68"
              ? "route_b68_nyct_2025"
              : "route_m57_nyct_2025",
        relation_family: "route_scope",
        subject_id: PROGRAM_PROJECT_ID,
        object_id: route.targetRecordId,
        assertion_status: "delivered",
        as_of_date: "2025-12",
      },
    },
    patch: {},
    cascade: [],
    reason:
      `The source-backed ${route.literal} fact is now preserved on an exact-day affects_route edge for the bounded December 8 warning cohort, plus a part_of_program edge to ACE. Retract the malformed umbrella covers_route edge rather than guessing a new endpoint or allowing umbrella scope to contaminate an occurrence.`,
    source_decision: SOURCE_DECISION,
    reviewed_at: REVIEWED_AT,
    provenance: "human",
  })),
];

const canonicalRecords = readCanonicalRecordsFromJsonl();
const canonicalById = new Map(canonicalRecords.map((record) => [record.record_id, record]));
for (const recordId of [PROGRAM_PROJECT_ID, EVENT_ID, ...routes.map((route) => route.targetRecordId)]) {
  assert(canonicalById.has(recordId), `Missing canonical dependency ${recordId}`);
}

const existingCorrections = readSemanticCorrections();
const existingCorrectionById = new Map(existingCorrections.map((correction) => [correction.correction_id, correction]));
for (const correction of corrections) {
  const existing = existingCorrectionById.get(correction.correction_id);
  if (!existing) continue;
  assert(
    stableJson(existing as unknown as JsonValue) === stableJson(correction as unknown as JsonValue),
    `Semantic correction ${correction.correction_id} already exists with different content`,
  );
}
const pendingCorrections = corrections.filter(
  (correction) => !existingCorrectionById.has(correction.correction_id),
);

function assertAuditedCanonicalTarget(record: MtaCanonicalRecord, expectedLocalId: string): void {
  assert(record.source_ids.includes(SOURCE_ID), `${record.record_id} lost source ${SOURCE_ID}`);
  assert(record.local_observation_ids.includes(expectedLocalId), `${record.record_id} lost local id ${expectedLocalId}`);
  assert(
    record.evidence_refs.some(
      (ref) =>
        ref.evidence_id === `${SOURCE_ID}#${activationBlock.block_id}` &&
        ref.text_sha256 === activationBlock.raw_text_sha256,
    ),
    `${record.record_id} lost its pinned activation evidence`,
  );
}

for (const correction of pendingCorrections) {
  const target = canonicalById.get(correction.record_id);
  assert(target, `Pending correction target ${correction.record_id} is missing`);
  assertAuditedCanonicalTarget(
    target,
    correction.record_id === EVENT_ID
      ? EVENT_LOCAL_ID
      : `relation_ace_covers_${correction.record_id.slice("relation_ace-covers-".length)}`,
  );
}

if (pendingCorrections.length > 0) {
  const correctionPreflight = withSemanticCorrections(canonicalRecords, pendingCorrections);
  assert(
    correctionPreflight.summary.applied === pendingCorrections.length &&
      correctionPreflight.summary.skipped === 0 &&
      correctionPreflight.issues.length === 0,
    `Semantic-correction preflight failed: ${correctionPreflight.issues.map((issue) => issue.message).join("; ")}`,
  );
}

const dryRunEntries = observations.map((observation) =>
  createSubmissionEntry(RUN_ID, observation, FIXED_SUBMITTED_AT),
);
for (const entry of dryRunEntries) {
  assert(
    entry.validation.state === "accepted",
    `${entry.submission_id} rejected: ${entry.validation.issues.join("; ")}`,
  );
}

const existingSubmissionIds = new Set(readSubmissionEntries().map((entry) => entry.submission_id));
const pendingEntries = dryRunEntries.filter((entry) => !existingSubmissionIds.has(entry.submission_id));
const apply = process.argv.includes("--apply");

if (apply) {
  const observationBySubmissionId = new Map(
    observations.map((observation) => [
      createSubmissionEntry(RUN_ID, observation, FIXED_SUBMITTED_AT).submission_id,
      observation,
    ]),
  );
  for (const entry of pendingEntries) {
    const observation = observationBySubmissionId.get(entry.submission_id);
    assert(observation, `Lost pending observation ${entry.submission_id}`);
    const written = appendSubmission(RUN_ID, observation);
    assert(
      written.validation.state === "accepted",
      `${written.submission_id} rejected while applying: ${written.validation.issues.join("; ")}`,
    );
  }

  if (pendingCorrections.length > 0) {
    const correctionPath = semanticCorrectionsPath();
    if (existsSync(correctionPath)) {
      const currentBytes = readFileSync(correctionPath, "utf8");
      assert(
        currentBytes.length === 0 || currentBytes.endsWith("\n"),
        `${correctionPath} must end with a newline before appending`,
      );
    }
    appendFileSync(
      correctionPath,
      `${pendingCorrections.map((correction) => JSON.stringify(correction)).join("\n")}\n`,
      "utf8",
    );
  }

  if (activeCoverageDecisionExists) {
    mkdirSync(join(repoRoot, "data/operational-anchor-review/ledger-decisions/retired"), { recursive: true });
    if (!retirementRecordExists) {
      writeFileSync(COVERAGE_DECISION_RETIREMENT_PATH, prettyJson(coverageDecisionRetirement), "utf8");
    }
    unlinkSync(RETIRED_COVERAGE_DECISION_PATH);
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      run_id: RUN_ID,
      source_id: SOURCE_ID,
      mode: apply ? "apply" : "dry_run",
      event_date: EVENT_DATE,
      event_record_id: EVENT_ID,
      expected_record_ids: EXPECTED_RECORD_IDS,
      route_anchor_path: ROUTE_ANCHOR_PATH,
      route_anchor_sha256: ROUTE_ANCHOR_SHA256,
      acquisition_receipt_path: ACQUISITION_RECEIPT_PATH,
      acquisition_receipt_sha256: ACQUISITION_RECEIPT_SHA256,
      route_anchors: routes.map((route) => ({
        gtfs_route_id: route.literal,
        canonical_route_record_id: route.targetRecordId,
      })),
      observation_count: observations.length,
      already_present_submission_count: observations.length - pendingEntries.length,
      written_submission_count: apply ? pendingEntries.length : 0,
      pending_submission_count: apply ? 0 : pendingEntries.length,
      semantic_correction_ids: corrections.map((correction) => correction.correction_id),
      already_present_correction_count: corrections.length - pendingCorrections.length,
      written_correction_count: apply ? pendingCorrections.length : 0,
      pending_correction_count: apply ? 0 : pendingCorrections.length,
      retired_coverage_decision: {
        decision_id: RETIRED_COVERAGE_DECISION_ID,
        prior_gap_id: originalCoverageDecision.gap_id,
        retirement_path: "data/operational-anchor-review/ledger-decisions/retired/non-study-ace-program-expansion-dec2025-timeline-subject-not-applicable.json",
        pending_before_apply: activeCoverageDecisionExists,
        retired_on_apply: apply && activeCoverageDecisionExists,
      },
      submission_ids: dryRunEntries.map((entry) => entry.submission_id),
      explicit_non_claim:
        "December 8, 2025 is the 60-day warning-phase activation; this curation does not infer the later fine-bearing start date.",
      bounded_route_scope: routeText,
    },
    null,
    2,
  )}\n`,
);
