import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import {
  parseOperationalCoverageAcceptedDecision,
  type OperationalCoverageAcceptedDecision,
  type OperationalCoverageDecisionEvidenceRef,
  type OperationalCoverageDimension,
} from "../packages/pipeline/src/quality/operational-coverage.js";

const OCCURRENCE_DECISION_ID = "flatbush-phase1-center-running-bus-lanes-2025-09";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const DECIDED_AT = "2026-07-13T18:50:00.000Z";
const queuePath = join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl");
const decisionDir = join(repoRoot, "data/operational-anchor-review/ledger-decisions/decisions");

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: OperationalCoverageDimension;
  priority: boolean;
  status: "open" | "ready_for_review" | "terminal";
  verdict: string;
  decision_ids: string[];
  resolved_occurrence_ids: string[];
};

type GapSpec = {
  gapId: string;
  dimension: OperationalCoverageDimension;
};

type EventSpec = {
  eventId: string;
  expectedLifecycle: string;
  disposition: "approved_start" | "completion_milestone" | "planning_surface";
  gaps: GapSpec[];
};

function gaps(entries: Record<string, string>): GapSpec[] {
  return Object.entries(entries).map(([dimension, gapId]) => ({
    dimension: dimension as OperationalCoverageDimension,
    gapId,
  }));
}

const eventSpecs: EventSpec[] = [
  {
    eventId: "event_flatbush-phase1-installation-start-sep2025",
    expectedLifecycle: "installed",
    disposition: "approved_start",
    gaps: gaps({
      route: "operational-coverage:e0c9c9b7b7c619e70aedbde6",
      treatment: "operational-coverage:a6df05338567003389519e37",
    }),
  },
  {
    eventId: "event_flatbush-av-phase1-installed-fall2025",
    expectedLifecycle: "installed",
    disposition: "completion_milestone",
    gaps: gaps({
      date_precision: "operational-coverage:41c398638898c7778fc112cc",
      route: "operational-coverage:07d8a7bf72ccb8d305fb69e6",
      treatment: "operational-coverage:5c3159495805bb294b526c65",
    }),
  },
  {
    eventId: "event_flatbush-av-bus-lanes-open-late-fall2026",
    expectedLifecycle: "planned",
    disposition: "planning_surface",
    gaps: gaps({
      date_precision: "operational-coverage:b83200075aee38b2c6a60350",
      delivered_status: "operational-coverage:4d78f1c4768a9e8059ffb5a7",
      route: "operational-coverage:edaac8116070785d7eb21dc1",
      treatment: "operational-coverage:67b565708cbf8630f8f787e4",
    }),
  },
  {
    eventId: "event_goal-implement-2025",
    expectedLifecycle: "planned",
    disposition: "planning_surface",
    gaps: gaps({
      date_precision: "operational-coverage:3ddf8e098dedf57932d0793d",
      delivered_status: "operational-coverage:d526c161bff73549b550f449",
      route: "operational-coverage:c2567aa52339f0b35dd5ba07",
      treatment: "operational-coverage:203c60939e6dfbc0cfed81f9",
    }),
  },
  {
    eventId: "event_proposed-implementation-spring-summer2025",
    expectedLifecycle: "planned",
    disposition: "planning_surface",
    gaps: gaps({
      date_precision: "operational-coverage:1cddf1c00a4ef6ecbc59fa90",
      delivered_status: "operational-coverage:a52089f1f6aa91b66e7d2e9c",
      route: "operational-coverage:d4632d24fb7b5f77171868af",
      treatment: "operational-coverage:ed43124cd46496c3c1d693b8",
    }),
  },
  {
    eventId: "event_install-bus-lane-markings-fall2025_2",
    expectedLifecycle: "planned",
    disposition: "planning_surface",
    gaps: gaps({
      date_precision: "operational-coverage:19b4c15098798c1185bafefb",
      delivered_status: "operational-coverage:0405b9aed3e400aec1795232",
      route: "operational-coverage:3dcf0362f1e140463937924a",
      treatment: "operational-coverage:2b059b5bf5d9fd4dfb994df5",
    }),
  },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function slug(value: string): string {
  return value.replace(/^event_/u, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function decisionId(spec: EventSpec, dimension: OperationalCoverageDimension): string {
  const eventSlug = slug(spec.eventId).replace(/^flatbush-/u, "");
  return `flatbush-${eventSlug}-${dimension.replaceAll("_", "-")}-not-applicable`;
}

function evidenceRefs(event: MtaCanonicalRecord): OperationalCoverageDecisionEvidenceRef[] {
  return event.evidence_refs
    .map((ref) => ({
      record_id: event.record_id,
      source_id: ref.source_id,
      evidence_id: ref.evidence_id,
      block_id: ref.block_id ?? ref.evidence_id.split("#")[1] ?? null,
    }))
    .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
}

function rationale(spec: EventSpec, dimension: OperationalCoverageDimension, occurrenceId: string): string {
  if (spec.disposition === "approved_start") {
    return `Approved occurrence ${occurrenceId} resolves the September 2025 Phase 1 installation start through the bounded project's delivered B41/B67 relations and its single atomic center-running-bus-lane relation. The broad raw ${dimension} diagnostic is superseded and must not import scope from the umbrella Flatbush project.`;
  }
  if (spec.disposition === "completion_milestone") {
    return dimension === "date_precision"
      ? `The April 2026 retrospective supports only Fall 2025 season precision for completion. Approved occurrence ${occurrenceId} already represents the same bounded two-block implementation at its source-backed September commencement month, so refining or projecting this completion milestone would double count one treatment delivery.`
      : `This Fall 2025 completion milestone describes the same bounded two-block implementation as approved occurrence ${occurrenceId}. Its route and treatment context remain canonical history, but the raw ${dimension} diagnostic is not a second occurrence and is therefore not applicable.`;
  }
  return dimension === "date_precision"
    ? "This event is an explicitly prospective Flatbush implementation goal or forecast. Its year/season wording is faithful planning history, not a realized onset whose date should be refined."
    : dimension === "delivered_status"
      ? "This event is explicitly prospective and remains planned after duplicate reconciliation. It cannot establish delivered status for a study occurrence."
      : `This planned milestone does not independently bind delivered ${dimension} scope. Inheriting candidate scope from the wider Flatbush project would create an unsupported planning cross-product and could duplicate the separately approved Phase 1 occurrence.`;
}

const occurrenceDecisionPath = join(
  repoRoot,
  "data/operational-occurrence-review/accepted/decisions",
  `${OCCURRENCE_DECISION_ID}.json`,
);
assert(existsSync(occurrenceDecisionPath), `Apply ${OCCURRENCE_DECISION_ID} before adjudicating its residual gaps`);
const occurrenceDecision = JSON.parse(readFileSync(occurrenceDecisionPath, "utf8")) as {
  occurrence_id?: unknown;
  review_state?: unknown;
};
assert(occurrenceDecision.review_state === "approved", `${OCCURRENCE_DECISION_ID} is not approved`);
assert(typeof occurrenceDecision.occurrence_id === "string", `${OCCURRENCE_DECISION_ID} lacks occurrence_id`);
const occurrenceId = occurrenceDecision.occurrence_id;

const targetEventIds = new Set(eventSpecs.map((spec) => spec.eventId));
const eventsById = new Map(
  readCanonicalRecordsFromJsonl()
    .filter((record) => targetEventIds.has(record.record_id))
    .map((record) => [record.record_id, record]),
);
assert(eventsById.size === eventSpecs.length, `Expected ${eventSpecs.length} target events, found ${eventsById.size}`);
for (const spec of eventSpecs) {
  const event = eventsById.get(spec.eventId);
  assert(event?.record_kind === "event", `Missing event ${spec.eventId}`);
  assert(event.payload.lifecycle_phase === spec.expectedLifecycle, `${spec.eventId} lifecycle changed`);
  assert(event.evidence_refs.length > 0, `${spec.eventId} lost source evidence`);
}

const queue = readJsonl<QueueRow>(queuePath);
const expectedGaps = new Map(eventSpecs.flatMap((spec) => spec.gaps.map((gap) => [gap.gapId, { spec, gap }] as const)));
assert(expectedGaps.size === 21, `Expected 21 unique residual gaps, found ${expectedGaps.size}`);
const targetRows = queue.filter((row) => expectedGaps.has(row.gap_id));
assert(targetRows.length === expectedGaps.size, `Expected ${expectedGaps.size} target rows, found ${targetRows.length}`);
for (const row of targetRows) {
  const expected = expectedGaps.get(row.gap_id);
  assert(expected, `Unexpected target gap ${row.gap_id}`);
  assert(row.event_record_id === expected.spec.eventId, `${row.gap_id} event changed`);
  assert(row.dimension === expected.gap.dimension, `${row.gap_id} dimension changed`);
  assert(row.priority, `${row.gap_id} is no longer a priority gap`);
  const expectedId = decisionId(expected.spec, expected.gap.dimension);
  if (row.status === "terminal") {
    assert(row.verdict === "not_applicable" && row.decision_ids.includes(expectedId), `${row.gap_id} terminal state changed`);
  } else {
    assert(row.status === "open" && row.verdict === "unreviewed", `${row.gap_id} is not open/unreviewed`);
  }
  if (expected.spec.disposition === "approved_start") {
    assert(row.resolved_occurrence_ids.includes(occurrenceId), `${row.gap_id} does not resolve to ${occurrenceId}`);
  }
}

const decisions: OperationalCoverageAcceptedDecision[] = eventSpecs.flatMap((spec) => {
  const event = eventsById.get(spec.eventId)!;
  return spec.gaps.map((gap) => {
    const id = decisionId(spec, gap.dimension);
    return parseOperationalCoverageAcceptedDecision({
      schema_version: 1,
      decision_id: id,
      gap_id: gap.gapId,
      prior_verdict: "unreviewed",
      verdict: "not_applicable",
      reviewer: REVIEWER,
      decided_at: DECIDED_AT,
      rationale: rationale(spec, gap.dimension, occurrenceId),
      proposal_ids: [],
      evidence_refs: evidenceRefs(event),
      search_receipt_ids: [],
    }, id);
  });
});

const apply = process.argv.includes("--apply");
mkdirSync(decisionDir, { recursive: true });
let written = 0;
let verifiedExisting = 0;
for (const decision of decisions) {
  const path = join(decisionDir, `${decision.decision_id}.json`);
  const bytes = `${JSON.stringify(decision, null, 2)}\n`;
  if (existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, "utf8")) as JsonValue;
    assert(stableJson(existing) === stableJson(decision as unknown as JsonValue), `${path} conflicts with generated decision`);
    verifiedExisting += 1;
    continue;
  }
  if (apply) {
    writeFileSync(path, bytes, "utf8");
    written += 1;
  }
}

process.stdout.write(`${JSON.stringify({
  mode: apply ? "apply" : "dry_run",
  occurrence_id: occurrenceId,
  event_count: eventSpecs.length,
  gap_count: decisions.length,
  written_count: written,
  verified_existing_count: verifiedExisting,
  pending_count: apply ? 0 : decisions.length - verifiedExisting,
  decision_ids: decisions.map((decision) => decision.decision_id),
}, null, 2)}\n`);
