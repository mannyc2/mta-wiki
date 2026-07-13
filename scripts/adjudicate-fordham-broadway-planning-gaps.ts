import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import {
  parseOperationalCoverageAcceptedDecision,
  type OperationalCoverageAcceptedDecision,
  type OperationalCoverageDecisionEvidenceRef,
  type OperationalCoverageDimension,
} from "../packages/pipeline/src/quality/operational-coverage";

const BASELINE_PRIORITY_QUEUE_SHA256 = "a04a9db6e2a1a5cdb6107b10b68b26c5b4069ced6090d39507770e0b09d4e079";
const TARGET_EVENT_FINGERPRINT = "71230d7981c1166ed5061ce8220ee6a8943f786131d1786b0efa24a93567eda6";
const TARGET_GAP_FINGERPRINT = "1787d9489001250d36329bad9eaf50f70355d8f63b78c6748c45c9590b2599d0";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const DECIDED_AT = "2026-07-13T09:25:00.000Z";

const queuePath = join(repoRoot, "data/quality/operational-coverage/priority-queue.jsonl");
const decisionDir = join(repoRoot, "data/operational-anchor-review/ledger-decisions/decisions");

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: OperationalCoverageDimension;
  priority: boolean;
  status: "open" | "ready_for_review" | "terminal";
  verdict: string;
  resolved_occurrence_ids: string[];
};

type GapSpec = {
  gapId: string;
  dimension: OperationalCoverageDimension;
  decisionId: string;
  rationale: string;
};

type EventSpec = {
  eventId: string;
  sourceId: string;
  expectedLifecycle: string;
  gaps: GapSpec[];
};

const eventSpecs: EventSpec[] = [
  {
    eventId: "event_bus-lanes-operational-latesummer2026",
    sourceId: "fordham_rd_sedgwick_ave_bronx_river_pkwy_cb5_may2026",
    expectedLifecycle: "planned",
    gaps: [
      {
        gapId: "operational-coverage:f0cde4b6c6605307b280fd71",
        dimension: "date_precision",
        decisionId: "fordham-cb5-expected-bus-lanes-date-not-applicable",
        rationale: "The CB5 timeline says only 'Late Summer/Fall' and explicitly describes the bus lanes as expected to be operational. This is an imprecise future forecast, not a realized onset whose day or month can be refined.",
      },
      {
        gapId: "operational-coverage:7835982c16269e3bd3cb5073",
        dimension: "delivered_status",
        decisionId: "fordham-cb5-expected-bus-lanes-delivered-not-applicable",
        rationale: "The exact source statement is prospective ('expected to be operational'), the canonical lifecycle is planned, and the timeline edge is proposed. It cannot support delivered status for this planning event.",
      },
      {
        gapId: "operational-coverage:c291f796a3861c1fe9c814ff",
        dimension: "route",
        decisionId: "fordham-cb5-expected-bus-lanes-route-not-applicable",
        rationale: "Bx12 is valid project context, but this forecast is not a delivered route-level occurrence. Assigning project routes to the planning milestone would create unsupported operational scope.",
      },
      {
        gapId: "operational-coverage:72b1837fbaa677d1a8e6d6b4",
        dimension: "treatment",
        decisionId: "fordham-cb5-expected-bus-lanes-treatment-not-applicable",
        rationale: "The source presents multiple proposed designs alongside existing ACE context. It does not bind one delivered treatment to this prospective milestone, so projecting candidate components would create an unsupported cross-product.",
      },
    ],
  },
  {
    eventId: "event_bus-lanes-operational-mid-june-2026",
    sourceId: "broadway_69_st_roosevelt_ave_may2026",
    expectedLifecycle: "planned",
    gaps: [
      {
        gapId: "operational-coverage:4aca4d6ac43acbf2b540cfba",
        dimension: "date_precision",
        decisionId: "broadway-mid-june-expected-bus-lanes-date-not-applicable",
        rationale: "'Mid June' is a forecast from the May 19 planning deck, not a realized physical activation date. Later official evidence is represented by a separate status-as-of event and does not convert this forecast into onset evidence.",
      },
      {
        gapId: "operational-coverage:880b7121c2e7da122341bea3",
        dimension: "delivered_status",
        decisionId: "broadway-mid-june-expected-bus-lanes-delivered-not-applicable",
        rationale: "This exact event says the bus lanes were expected to be operational and its timeline edge is proposed. Delivered status belongs to the separate retrospective installation-confirmed record, not to this planning assertion.",
      },
      {
        gapId: "operational-coverage:1d0e84da419d82fdc05b91a2",
        dimension: "route",
        decisionId: "broadway-mid-june-expected-bus-lanes-route-not-applicable",
        rationale: "Q70 SBS is valid project context, but the forecast event itself is not a delivered occurrence. The separately captured NYC DOT status evidence owns delivered route scope, so this planning record must remain unscoped.",
      },
      {
        gapId: "operational-coverage:89c748cb36f55647d3f9aaa4",
        dimension: "treatment",
        decisionId: "broadway-mid-june-expected-bus-lanes-treatment-not-applicable",
        rationale: "The May project bundle contains six components with different semantics and timelines. Later retrospective evidence proves only the center-running lane and is represented separately; it does not retroactively bind the entire proposed bundle to this forecast event.",
      },
    ],
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

function expectedDecision(event: MtaCanonicalRecord, gap: GapSpec): OperationalCoverageAcceptedDecision {
  return parseOperationalCoverageAcceptedDecision(
    {
      schema_version: 1,
      decision_id: gap.decisionId,
      gap_id: gap.gapId,
      prior_verdict: "unreviewed",
      verdict: "not_applicable",
      reviewer: REVIEWER,
      decided_at: DECIDED_AT,
      rationale: gap.rationale,
      proposal_ids: [],
      evidence_refs: evidenceRefs(event),
      search_receipt_ids: [],
    },
    gap.decisionId,
  );
}

const targetEventIds = new Set(eventSpecs.map((spec) => spec.eventId));
const events = readCanonicalRecordsFromJsonl()
  .filter((record) => targetEventIds.has(record.record_id))
  .sort((left, right) => left.record_id.localeCompare(right.record_id));
assert(events.length === 2, `Expected two target events, found ${events.length}`);
assert(
  sha256(stableJson(events as unknown as JsonValue)) === TARGET_EVENT_FINGERPRINT,
  "Target planning-event evidence changed before adjudication",
);
const eventsById = new Map(events.map((event) => [event.record_id, event]));
for (const spec of eventSpecs) {
  const event = eventsById.get(spec.eventId);
  assert(event?.record_kind === "event", `Missing event ${spec.eventId}`);
  assert(event.source_ids?.includes(spec.sourceId) ?? event.source_id === spec.sourceId, `${spec.eventId} source changed`);
  assert(event.payload.lifecycle_phase === spec.expectedLifecycle, `${spec.eventId} is no longer planned`);
  assert(event.evidence_refs.length > 0, `${spec.eventId} lost source evidence`);
}

const queueContent = readFileSync(queuePath);
const queue = readJsonl<QueueRow>(queuePath);
const expectedGaps = new Map(
  eventSpecs.flatMap((event) => event.gaps.map((gap) => [gap.gapId, { event, gap }] as const)),
);
assert(expectedGaps.size === 8, `Expected eight unique target gaps, found ${expectedGaps.size}`);
const targetRows = queue.filter((row) => expectedGaps.has(row.gap_id));
assert(targetRows.length === 8, `Expected eight target queue rows, found ${targetRows.length}`);
const gapInventory = targetRows
  .map((row) => ({ gap_id: row.gap_id, event_record_id: row.event_record_id, dimension: row.dimension }))
  .sort((left, right) => left.gap_id.localeCompare(right.gap_id));
assert(
  sha256(stableJson(gapInventory as unknown as JsonValue)) === TARGET_GAP_FINGERPRINT,
  "Target planning-gap inventory changed",
);
for (const row of targetRows) {
  const expected = expectedGaps.get(row.gap_id);
  assert(expected, `Unexpected target gap ${row.gap_id}`);
  assert(row.event_record_id === expected.event.eventId, `${row.gap_id} event changed`);
  assert(row.dimension === expected.gap.dimension, `${row.gap_id} dimension changed`);
  assert(row.priority, `${row.gap_id} is no longer priority`);
  assert(row.resolved_occurrence_ids.length === 0, `${row.gap_id} unexpectedly resolves to an occurrence`);
}
const pre = targetRows.every((row) => row.status === "open" && row.verdict === "unreviewed");
const post = targetRows.every((row) => row.status === "terminal" && row.verdict === "not_applicable");
assert(pre || post, "Target planning gaps are in a mixed or unexpected state");
if (pre) {
  assert(sha256(queueContent) === BASELINE_PRIORITY_QUEUE_SHA256, "Priority queue changed before planning-gap adjudication");
}

mkdirSync(decisionDir, { recursive: true });
for (const spec of eventSpecs) {
  const event = eventsById.get(spec.eventId)!;
  for (const gap of spec.gaps) {
    const decision = expectedDecision(event, gap);
    const path = join(decisionDir, `${decision.decision_id}.json`);
    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, "utf8")) as JsonValue;
      assert(stableJson(existing) === stableJson(decision as unknown as JsonValue), `${path} conflicts with generated decision`);
      continue;
    }
    assert(pre, `${path} is missing after the adjudication baseline changed`);
    writeFileSync(path, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
  }
}

process.stdout.write(`${pre ? "Generated" : "Verified"} eight evidence-scoped Fordham/Broadway planning decisions.\n`);
