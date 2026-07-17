import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type {
  JsonObject,
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
  type SemanticCorrectionEntry,
} from "../packages/pipeline/src/records/semantic-corrections.js";

const RUN_ID = "2026-07-13_codex_tremont-queue-jump-fall-2024";
const FIXED_TIMESTAMP = "2026-07-13T20:15:00.000Z";
const SOURCE_ID = "tremont_ave_bus_priority_cb5_nov2024";
const PROJECT_ID = "project_tremont-av-bus-priority";
const EVENT_ID = "event_queue-jump-implementation-fall2024";
const TREATMENT_ID = "treatment_queue-jump-grand-concourse";
const ROUTE_ID = "route_bx36";
const RECEIPT_RELATIVE_PATH =
  "data/quality/acquisition/receipts/tremont-queue-jump-fall-2024-curation.json";
const RECEIPT_PATH = join(repoRoot, RECEIPT_RELATIVE_PATH);
const RECEIPT_SHA256 = "300eba2ab2fdc7f58a2955678e7b62bac6ea4bf2061409fd8694c37759b4cbae";
const CORRECTION_ID = "core-coverage-tremont-queue-jump-fall2024-installed-20260713";

const projectLocalId = "project_tremont_av_bus_priority";
const eventLocalId = "event_queue_jump_implementation_fall2024";
const treatmentLocalId = "treatment_queue_jump_grand_concourse";
const routeLocalId = "route_bx36_tremont_cb5";

const sourcePins = {
  artifacts: {
    "metadata.json": "1c016f83d36fbc4fc3a8261c4f27a204c74dd52a21e830641793b6421f044124",
    "source.pdf": "0f16201c3c442d289fbbbdb3bae4846eb74e1829c6bafff9a9111a85ffa6c5b8",
    "blocks.jsonl": "ff2b47fe400f12ae868c9c082a8b3bf71702aa0e3927215f09ed9913add48e59",
  },
  blocks: {
    project: {
      blockId: "p001_c0001",
      sha256: "sha256:18a3ed9f03eee93c2d4c85648707c46396fb26ad84165254a893d56677749bd0",
      literals: ["Tremont Av Bus Priority Project"],
    },
    documentDate: {
      blockId: "p001_c0003",
      sha256: "sha256:e1a5703d13805d830555a54e906af23dec630f8683b735a9118b9ded01902a6e",
      literals: ["November 4, 2024"],
    },
    routeScope: {
      blockId: "p004_c0002",
      sha256: "sha256:fa3355ea01e96cf64ae231e0168e561c5fc7c7caac2a948f5abe31dc8917483e",
      literals: ["University Av to Bronx River Pkwy", "Bx36 carries 34,000 bus riders per day"],
    },
    timeline: {
      blockId: "p013_c0002",
      sha256: "sha256:89250d7256e1892cef2c0f1b1f565d889859e277a61dde9c56efd7a34c912f5f",
      literals: ["Fall 2024: Bus Queue Jump Signals at Tremont Av & Grand Concourse"],
    },
    installed: {
      blockId: "p014_c0002",
      sha256: "sha256:0a4ec72360eebd23c2a834ffaa3db0af1de71fb2f58fa03265ca42c2feaf5bea",
      literals: [
        "Installed at Grand Concourse & Tremont Av to provide immediate benefit",
        "No change to signal timing",
      ],
    },
  },
} as const;

type SourceBlock = {
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

type Receipt = {
  schema_version: 1;
  receipt_id: string;
  status: string;
  operator: string;
  reviewed_at: string;
  acquisition_method: string;
  source: {
    source_id: string;
    document_date: string;
  };
  decision: {
    project_record_id: string;
    event_record_id: string;
    treatment_record_id: string;
    route_record_id: string;
    gtfs_route_id: string;
    relation_observation_count: number;
    relation_kinds: string[];
    semantic_correction_id: string;
    prior_lifecycle_phase: string;
    corrected_lifecycle_phase: string;
    preserved_date_text: string;
    preserved_date_normalized: string;
    preserved_date_precision: string;
    projection_disposition: string;
  };
  reproducibility: {
    work_order_script: string;
    semantic_corrections_path: string;
    apply_flag: string;
    applied: boolean;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return stableJson(left as JsonValue) === stableJson(right as JsonValue);
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
  const pin = sourcePins.blocks[key];
  const block = blocks.get(pin.blockId);
  assert(block, `Missing ${SOURCE_ID}#${pin.blockId}`);
  assert(block.raw_text_sha256 === pin.sha256, `${SOURCE_ID}#${pin.blockId} hash changed`);
  for (const literal of pin.literals) {
    assert(block.raw_text.includes(literal), `${SOURCE_ID}#${pin.blockId} lost ${JSON.stringify(literal)}`);
  }
  return block;
}

const projectBlock = pinnedBlock("project");
const documentDateBlock = pinnedBlock("documentDate");
const routeScopeBlock = pinnedBlock("routeScope");
const timelineBlock = pinnedBlock("timeline");
const installedBlock = pinnedBlock("installed");

function readReceipt(): Receipt {
  const content = readFileSync(RECEIPT_PATH);
  assert(sha256(content) === RECEIPT_SHA256, `${RECEIPT_RELATIVE_PATH} changed`);
  const receipt = JSON.parse(content.toString("utf8")) as Receipt;
  assert(receipt.schema_version === 1, "Receipt schema_version changed");
  assert(receipt.receipt_id === "tremont-queue-jump-fall-2024-curation", "Receipt id changed");
  assert(receipt.status === "reviewed_work_order_not_applied", "Receipt status changed");
  assert(receipt.operator === "codex-corpus-completion-2026-07-13", "Receipt operator changed");
  assert(receipt.reviewed_at === "2026-07-13T20:15:00Z", "Receipt review timestamp changed");
  assert(receipt.acquisition_method === "existing_staged_official_source_only", "Receipt method changed");
  assert(receipt.source.source_id === SOURCE_ID, "Receipt source changed");
  assert(receipt.source.document_date === "2024-11-04", "Receipt document date changed");
  assert(receipt.decision.project_record_id === PROJECT_ID, "Receipt project changed");
  assert(receipt.decision.event_record_id === EVENT_ID, "Receipt event changed");
  assert(receipt.decision.treatment_record_id === TREATMENT_ID, "Receipt treatment changed");
  assert(receipt.decision.route_record_id === ROUTE_ID, "Receipt route changed");
  assert(receipt.decision.gtfs_route_id === "BX36", "Receipt GTFS route changed");
  assert(receipt.decision.relation_observation_count === 5, "Receipt relation count changed");
  assert(
    jsonEqual(receipt.decision.relation_kinds, ["has_timeline_event", "has_treatment", "serves_route"]),
    "Receipt relation inventory changed",
  );
  assert(receipt.decision.semantic_correction_id === CORRECTION_ID, "Receipt correction changed");
  assert(receipt.decision.prior_lifecycle_phase === "other", "Receipt prior lifecycle changed");
  assert(receipt.decision.corrected_lifecycle_phase === "installed", "Receipt corrected lifecycle changed");
  assert(receipt.decision.preserved_date_text === "Fall 2024", "Receipt date text changed");
  assert(receipt.decision.preserved_date_normalized === "2024-fall", "Receipt normalized date changed");
  assert(receipt.decision.preserved_date_precision === "season", "Receipt date precision changed");
  assert(receipt.decision.projection_disposition === "realized_but_date_ineligible", "Receipt disposition changed");
  assert(receipt.reproducibility.work_order_script === "scripts/curate-tremont-queue-jump-fall-2024.ts", "Receipt script changed");
  assert(receipt.reproducibility.semantic_corrections_path === "data/semantic-corrections/corrections.jsonl", "Receipt correction path changed");
  assert(receipt.reproducibility.apply_flag === "--apply", "Receipt apply flag changed");
  assert(receipt.reproducibility.applied === false, "Receipt must remain an unapplied work-order record");
  return receipt;
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

const timelineQuote = "Fall 2024: Bus Queue Jump Signals at Tremont Av & Grand Concourse";
const installedQuote = "Installed at Grand Concourse & Tremont Av to provide immediate benefit";

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_tremont_queue_jump_has_fall2024_installation",
    label: "Tremont Av Bus Priority Project has Fall 2024 queue-jump installation",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: eventLocalId,
      subject_id: PROJECT_ID,
      object_id: EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2024-11-04",
      description:
        "The November 4, 2024 NYC DOT presentation places the Grand Concourse queue-jump signal in the Tremont Av Bus Priority Project's Fall 2024 implementation timeline and states that it was installed.",
    },
    evidence_refs: [
      evidence(projectBlock, "timeline_subject_identity", "Tremont Av Bus Priority Project"),
      evidence(documentDateBlock, "retrospective_document_date", "November 4, 2024"),
      evidence(timelineBlock, "season_precision_timeline", timelineQuote),
      evidence(installedBlock, "delivered_timeline_status", installedQuote),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_bx36_has_fall2024_queue_jump_installation",
    label: "Bx36 has Fall 2024 Grand Concourse queue-jump installation",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: routeLocalId,
      object_local_observation_id: eventLocalId,
      subject_id: ROUTE_ID,
      object_id: EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2024-11-04",
      description:
        "The official Tremont Avenue project presentation identifies Bx36 as the route on the project corridor, places the Grand Concourse queue-jump signal in the Fall 2024 implementation timeline, and states that it was installed.",
    },
    evidence_refs: [
      evidence(routeScopeBlock, "direct_route_identity", "Bx36 carries 34,000 bus riders per day"),
      evidence(timelineBlock, "direct_route_timeline_scope", timelineQuote),
      evidence(installedBlock, "delivered_route_timeline_status", installedQuote),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_queue_jump_signal_has_fall2024_installation",
    label: "Grand Concourse queue-jump signal has Fall 2024 installation event",
    payload: {
      relation_kind: "has_timeline_event",
      relation_family: "timeline_context",
      subject_local_observation_id: treatmentLocalId,
      object_local_observation_id: eventLocalId,
      subject_id: TREATMENT_ID,
      object_id: EVENT_ID,
      assertion_status: "delivered",
      as_of_date: "2024-11-04",
      description:
        "The official presentation directly identifies the Fall 2024 event as the Grand Concourse and Tremont Avenue bus queue-jump signal and states on the following slide that it was installed.",
    },
    evidence_refs: [
      evidence(timelineBlock, "direct_treatment_timeline_scope", timelineQuote),
      evidence(installedBlock, "delivered_treatment_timeline_status", installedQuote),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_tremont_queue_jump_has_queue_jump_signal",
    label: "Tremont Av Bus Priority Project has Grand Concourse queue-jump signal",
    payload: {
      relation_kind: "has_treatment",
      relation_family: "treatment_scope",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: treatmentLocalId,
      subject_id: PROJECT_ID,
      object_id: TREATMENT_ID,
      assertion_status: "delivered",
      as_of_date: "2024-11-04",
      description:
        "The updated Tremont Av Bus Priority proposal identifies the Fall 2024 intervention as a bus queue-jump signal at Grand Concourse and Tremont Avenue and the following slide states that it was installed there.",
    },
    evidence_refs: [
      evidence(projectBlock, "treatment_subject_identity", "Tremont Av Bus Priority Project"),
      evidence(timelineBlock, "treatment_timeline_scope", timelineQuote),
      evidence(installedBlock, "delivered_treatment_scope", installedQuote),
    ],
  },
  {
    source_id: SOURCE_ID,
    observation_kind: "relation",
    local_observation_id: "relation_tremont_queue_jump_serves_bx36",
    label: "Tremont Av Bus Priority Project serves Bx36",
    payload: {
      relation_kind: "serves_route",
      relation_family: "route_scope",
      subject_local_observation_id: projectLocalId,
      object_local_observation_id: routeLocalId,
      subject_id: PROJECT_ID,
      object_id: ROUTE_ID,
      assertion_status: "delivered",
      as_of_date: "2024-11-04",
      description:
        "The same official project presentation identifies Bx36 as the bus route on the Tremont Avenue project corridor; this relation supplies the explicit route scope for the installed queue-jump event.",
    },
    evidence_refs: [
      evidence(projectBlock, "route_subject_identity", "Tremont Av Bus Priority Project"),
      evidence(routeScopeBlock, "route_scope", "Bx36 carries 34,000 bus riders per day"),
      evidence(installedBlock, "delivered_project_context", installedQuote),
    ],
  },
];

const priorEventPayload: JsonObject = {
  event_kind: "implementation",
  description: "Bus Queue Jump Signal installation at Tremont Av & Grand Concourse",
  date_text: "Fall 2024",
  event_family: "implementation",
  lifecycle_phase: "other",
  lifecycle_phase_other: "implementation",
  date_normalized: "2024-fall",
  date_precision: "season",
  date_text_normalized: {
    raw_text: "Fall 2024",
    normalized_date: "2024-fall",
    precision: "season",
    confidence: "parsed_text",
  },
};

const installedEventPayload: JsonObject = {
  ...priorEventPayload,
  lifecycle_phase: "installed",
};

const correction: SemanticCorrectionEntry = {
  correction_id: CORRECTION_ID,
  op: "patch_payload",
  record_id: EVENT_ID,
  guards: { payload: priorEventPayload },
  patch: { set: { lifecycle_phase: "installed" } },
  cascade: [],
  reason:
    "The November 4, 2024 official presentation labels the queue-jump signal as a Fall 2024 implementation and explicitly says it was installed at Grand Concourse and Tremont Avenue. Correct only lifecycle_phase from other to installed; preserve the source's season-precision date and do not infer an operational month or day.",
  source_decision: RECEIPT_RELATIVE_PATH,
  reviewed_at: "2026-07-13T20:15:00Z",
  provenance: "human",
};

function requiredRecord(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
  kind: MtaCanonicalRecord["record_kind"],
): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  assert(record?.record_kind === kind, `Missing ${kind} target ${recordId}`);
  assert(record.truth_status === "source_stated", `${recordId} truth_status changed`);
  assert(record.review_state !== "quarantined" && record.review_state !== "retracted", `${recordId} is not usable`);
  return record;
}

function assertEvidence(record: MtaCanonicalRecord, block: SourceBlock): void {
  const expectedEvidenceId = `${SOURCE_ID}#${block.block_id}`;
  const ref = record.evidence_refs.find((candidate) => candidate.evidence_id === expectedEvidenceId);
  assert(ref, `${record.record_id} lost ${expectedEvidenceId}`);
  assert(ref.text_sha256 === block.raw_text_sha256, `${record.record_id} evidence hash changed for ${expectedEvidenceId}`);
}

function assertCanonicalTargets(recordsById: ReadonlyMap<string, MtaCanonicalRecord>): MtaCanonicalRecord {
  const project = requiredRecord(recordsById, PROJECT_ID, "project");
  const event = requiredRecord(recordsById, EVENT_ID, "event");
  const treatment = requiredRecord(recordsById, TREATMENT_ID, "treatment_component");
  const route = requiredRecord(recordsById, ROUTE_ID, "route");

  assert(project.local_observation_ids?.includes(projectLocalId), `${PROJECT_ID} local identity changed`);
  assert((project.source_ids ?? [project.source_id]).includes(SOURCE_ID), `${PROJECT_ID} lost ${SOURCE_ID}`);
  assertEvidence(project, projectBlock);
  assertEvidence(project, timelineBlock);

  assert(event.local_observation_ids?.includes(eventLocalId), `${EVENT_ID} local identity changed`);
  assert(
    jsonEqual(event.payload, priorEventPayload) || jsonEqual(event.payload, installedEventPayload),
    `${EVENT_ID} payload changed outside the guarded lifecycle transition`,
  );
  assertEvidence(event, timelineBlock);

  assert(treatment.local_observation_ids?.includes(treatmentLocalId), `${TREATMENT_ID} local identity changed`);
  assert(treatment.payload.treatment_family === "signal_priority", `${TREATMENT_ID} family changed`);
  assertEvidence(treatment, timelineBlock);
  assertEvidence(treatment, installedBlock);

  assert(route.local_observation_ids?.includes(routeLocalId), `${ROUTE_ID} source-local identity changed`);
  assert(String(route.payload.route_id).toUpperCase() === "BX36", `${ROUTE_ID} no longer resolves BX36`);
  assertEvidence(route, routeScopeBlock);

  return event;
}

function correctionState(event: MtaCanonicalRecord): { existing: boolean; pending: boolean } {
  const corrections = readSemanticCorrections();
  const matches = corrections.filter((candidate) => candidate.correction_id === CORRECTION_ID);
  assert(matches.length <= 1, `Duplicate semantic correction ${CORRECTION_ID}`);

  const foreignLifecycleCorrections = corrections.filter((candidate) => {
    if (candidate.record_id !== EVENT_ID || candidate.correction_id === CORRECTION_ID) return false;
    if (candidate.op !== "patch_payload") return false;
    const set = candidate.patch.set;
    return typeof set === "object" && set !== null && !Array.isArray(set) && "lifecycle_phase" in set;
  });
  assert(
    foreignLifecycleCorrections.length === 0,
    `Conflicting lifecycle correction(s) target ${EVENT_ID}: ${foreignLifecycleCorrections
      .map((candidate) => candidate.correction_id)
      .sort()
      .join(", ")}`,
  );

  if (matches.length === 1) {
    assert(jsonEqual(matches[0], correction), `Existing ${CORRECTION_ID} conflicts with this work order`);
    assert(
      jsonEqual(event.payload, priorEventPayload) || jsonEqual(event.payload, installedEventPayload),
      `${EVENT_ID} no longer matches the correction's before/after states`,
    );
    return { existing: true, pending: false };
  }

  assert(jsonEqual(event.payload, priorEventPayload), `${EVENT_ID} is already changed without ${CORRECTION_ID}`);
  return { existing: false, pending: true };
}

function appendCorrection(): void {
  const path = semanticCorrectionsPath();
  const content = readFileSync(path, "utf8");
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  appendFileSync(path, `${separator}${JSON.stringify(correction)}\n`, "utf8");
  const matches = readSemanticCorrections().filter((candidate) => candidate.correction_id === CORRECTION_ID);
  assert(matches.length === 1, `Failed to append exactly one ${CORRECTION_ID}`);
  assert(jsonEqual(matches[0], correction), `Appended ${CORRECTION_ID} changed`);
}

const args = process.argv.slice(2);
assert(
  args.length <= 1 && args.every((arg) => arg === "--apply"),
  "Usage: bun scripts/curate-tremont-queue-jump-fall-2024.ts [--apply]",
);
const apply = args.includes("--apply");
const receipt = readReceipt();
const records = readCanonicalRecordsFromJsonl();
const recordsById = new Map(records.map((record) => [record.record_id, record]));
const event = assertCanonicalTargets(recordsById);
const semanticState = correctionState(event);

const existingSubmissionIds = new Set(readSubmissionEntries().map((entry) => entry.submission_id));
const previews = observations.map((observation) => createSubmissionEntry(RUN_ID, observation, FIXED_TIMESTAMP));
for (const preview of previews) {
  if (preview.validation.state !== "accepted") {
    throw new Error(`${preview.submission_id} rejected: ${preview.validation.issues.join("; ")}`);
  }
}
const pendingSubmissionIds = new Set(
  previews.filter((preview) => !existingSubmissionIds.has(preview.submission_id)).map((preview) => preview.submission_id),
);

if (apply) {
  for (const observation of observations) {
    const preview = createSubmissionEntry(RUN_ID, observation, FIXED_TIMESTAMP);
    if (!pendingSubmissionIds.has(preview.submission_id)) continue;
    const written = appendSubmission(RUN_ID, observation);
    if (written.validation.state !== "accepted") {
      throw new Error(`${written.submission_id} rejected while applying: ${written.validation.issues.join("; ")}`);
    }
  }
  if (semanticState.pending) appendCorrection();
}

process.stdout.write(`${JSON.stringify({
  run_id: RUN_ID,
  mode: apply ? "apply" : "dry_run",
  receipt_id: receipt.receipt_id,
  relation_observation_count: observations.length,
  relation_already_present_count: observations.length - pendingSubmissionIds.size,
  relation_pending_before_apply_count: pendingSubmissionIds.size,
  relation_written_count: apply ? pendingSubmissionIds.size : 0,
  semantic_correction_count: 1,
  semantic_correction_already_present_count: semanticState.existing ? 1 : 0,
  semantic_correction_pending_before_apply_count: semanticState.pending ? 1 : 0,
  semantic_correction_appended_count: apply && semanticState.pending ? 1 : 0,
  project_id: PROJECT_ID,
  event_id: EVENT_ID,
  treatment_id: TREATMENT_ID,
  route_id: ROUTE_ID,
  gtfs_route_id: "BX36",
  lifecycle_transition: "other -> installed",
  preserved_date_text: "Fall 2024",
  preserved_date_normalized: "2024-fall",
  preserved_date_precision: "season",
  projection_disposition: "realized_but_date_ineligible",
  source_ids: [SOURCE_ID],
  submission_ids: previews.map((preview) => preview.submission_id),
  semantic_correction_id: CORRECTION_ID,
}, null, 2)}\n`);
