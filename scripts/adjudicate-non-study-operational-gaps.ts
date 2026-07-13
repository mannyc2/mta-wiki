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

const BASELINE_PRIORITY_QUEUE_SHA256 = "e23363c300a7f8c022c07c1e0cec93b737437cc5731f134719669807cde6338e";
const TARGET_EVENT_FINGERPRINT = "838c404fcb571f520ba98e3d440ce12591dd3712660f295677e323fe81f1616e";
const TARGET_GAP_FINGERPRINT = "d1635830bd066fd5524e39b32052dab40d658d6ecb9d590ef458f0fdee00cfe2";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const DECIDED_AT = "2026-07-13T08:20:00.000Z";

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
  dimension: OperationalCoverageDimension;
  gapId: string;
};

type EventSpec = {
  eventId: string;
  rationale: string;
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
    eventId: "event_ace-program-expansion-dec2025",
    rationale: "This record describes routes entering ACE warning periods, not the later start of violation issuance. A warning-period program expansion is not a realized enforcement onset for the speed study; any later activation must be recovered as a separate route-atomic occurrence from retrospective evidence.",
    gaps: gaps({ timeline_subject: "operational-coverage:ee9721813dc1e45e440d0589" }),
  },
  {
    eventId: "event_all-door-boarding-2023",
    rationale: "The 2021 Bronx Bus Network Redesign addendum forecasts all-door boarding for 2023 and makes it contingent on MetroCard retirement and full OMNY implementation. It does not prove a realized 2023 launch, so this prospective milestone cannot found a study occurrence.",
    gaps: gaps({ timeline_subject: "operational-coverage:e87a7dc0f7227e99e34d61a7" }),
  },
  {
    eventId: "event_bus-only-signals-install-summer2024",
    rationale: "The Flatbush Avenue presentation gives a planned Summer 2024 installation milestone. It does not report that the bus-only signals became operational, so candidate routes and signal treatments must not be projected onto this planning record.",
    gaps: gaps({ timeline_subject: "operational-coverage:e12864c57480bb1737284191" }),
  },
  {
    eventId: "event_late-summer-fall2026-bus-lanes-operational",
    rationale: "The Fordham Road presentation says the proposed bus lanes are expected to be operational in late Summer or Fall 2026. That future expectation is not delivered-status evidence and cannot serve as an operational onset.",
    gaps: gaps({ timeline_subject: "operational-coverage:eed2f459bc5750785f2f69ee" }),
  },
  {
    eventId: "event_proposed-implementation-spring-summer-2025",
    rationale: "This is explicitly a proposed Spring/Summer 2025 implementation milestone in a Flatbush Avenue planning presentation. It does not prove a realized treatment or route onset.",
    gaps: gaps({ timeline_subject: "operational-coverage:6eebf3852de516069338ac2c" }),
  },
  {
    eventId: "event_implementation-late-2024-or-2025",
    rationale: "This Tremont Avenue record is a planning target of late 2024 or 2025, not a retrospective delivery statement. Candidate project routes and designs cannot be promoted into a realized occurrence from this milestone.",
    gaps: gaps({ timeline_subject: "operational-coverage:4d16cf0331bec9279a3e8b03" }),
  },
  {
    eventId: "event_implementation-late2024-2025",
    rationale: "This Tremont Avenue record is a prospective late-2024/2025 implementation target. The source does not establish that a particular route-treatment configuration was delivered.",
    gaps: gaps({ timeline_subject: "operational-coverage:60c26e38695e9a3162ed0a79" }),
  },
  {
    eventId: "event_implementation-late2024-or-2025",
    rationale: "This Tremont Avenue record is a projected implementation window from a planning presentation, not evidence of operational delivery. Candidate routes and toolkit options must remain contextual.",
    gaps: gaps({ timeline_subject: "operational-coverage:d52850216082a267c34fa45b" }),
  },
  {
    eventId: "event_implementation-tentative",
    rationale: "The source labels this Tremont Avenue implementation timing tentative. It neither selects a treatment configuration nor proves a delivered route-level onset.",
    gaps: gaps({ timeline_subject: "operational-coverage:b54f12764517a423e06bd21b" }),
  },
  {
    eventId: "event_install-bus-lane-markings-fall2025",
    rationale: "The Flatbush Avenue presentation supplies projected Fall 2025 implementation phasing. It does not retrospectively confirm that the markings or related candidate treatments became operational, so this planning milestone is not a study occurrence.",
    gaps: gaps({ timeline_subject: "operational-coverage:c7cbfcb9d485b736b26d1e89" }),
  },
  {
    eventId: "event_mdoc124881-fare-increase-aug2023",
    rationale: "This event is a fare-price policy change, not a bus speed intervention. Its exact date can be useful as confounder context, but route-treatment scope is not applicable for the operational anchor study.",
    gaps: gaps({ timeline_subject: "operational-coverage:d08e1960251695a24df6cf7b" }),
  },
  {
    eventId: "event_meeting-151656-ace-phase2-warning",
    rationale: "This event starts an ACE warning period, during which violations are not yet issued. It is not an enforcement activation; later violation issuance must be represented by a separate evidence-backed occurrence.",
    gaps: gaps({ timeline_subject: "operational-coverage:334927c08f23185d29e2848d" }),
  },
  {
    eventId: "event_meeting-151656-ace-phase3-warning",
    rationale: "This event starts an ACE warning period, not the later enforcement phase. Treating the warning date as activation would move the intervention onset earlier than the source supports.",
    gaps: gaps({ timeline_subject: "operational-coverage:06cd6e0ad04b0b0a15252054" }),
  },
  {
    eventId: "event_meeting-151656-bus-fare-enforcement-launch",
    rationale: "This is a fare-evasion enforcement initiative rather than a bus-priority or service-design treatment. It belongs in policy/confounder context and does not require study route-treatment scope.",
    gaps: gaps({ timeline_subject: "operational-coverage:65b97f3119af3dae7300ad73" }),
  },
  {
    eventId: "event_meeting-doc-115391-fare-effective-date",
    rationale: "This record is a proposed fare-change effective date, not a bus operational treatment onset. It is potentially useful as pricing context but is outside the study occurrence universe.",
    gaps: gaps({ timeline_subject: "operational-coverage:fce9095a6a385f7963ff738d" }),
  },
  {
    eventId: "event_meeting-doc-194166-fine-structure-change",
    rationale: "This event changes the fine structure for fare evasion. It is an enforcement-policy confounder, not a route-scoped bus speed treatment, so study occurrence recovery is not applicable.",
    gaps: gaps({ timeline_subject: "operational-coverage:bca3cda7d73b8c93ce066416" }),
  },
  {
    eventId: "event_meeting135266-omny-hudson-rail-link",
    rationale: "This is an OMNY fare-payment expansion on the Hudson Rail Link connecting service, not an NYCT bus-priority or route-redesign occurrence in the study universe.",
    gaps: gaps({ timeline_subject: "operational-coverage:6feaead97b2ebffa99e332f0" }),
  },
  {
    eventId: "event_meeting91591-nova-delivery-completion",
    rationale: "The source anticipates completion of a five-bus procurement delivery. It does not prove an operational route deployment or a route-level treatment onset, so this fleet forecast is not a study occurrence.",
    gaps: gaps({ timeline_subject: "operational-coverage:0c5d00d58e1cf9d0e1b1e6d7" }),
  },
  {
    eventId: "event_metro-north-service-restoration-sep29-2023",
    rationale: "This is an emergency Metro-North rail-service restoration with temporary bus bridging. It is outside the NYCT bus operational-treatment universe and should remain contextual rather than become a bus study anchor.",
    gaps: gaps({ timeline_subject: "operational-coverage:365dec2206a0a147f9a82e4a" }),
  },
  {
    eventId: "event_newburgh-beacon-shuttle-expansion",
    rationale: "The Newburgh-Beacon Bridge Shuttle is a cross-Hudson connecting service outside the NYCT bus outcome universe. Its expansion is therefore not applicable as a study anchor, independent of the separate normalized-date defect on this record.",
    gaps: gaps({ timeline_subject: "operational-coverage:555f5fe1f58c4d9689a02945" }),
  },
  {
    eventId: "event_bus-lane-enforcement-task-force-start",
    rationale: "This record marks the planned start of an organizational task force, not delivery of a bus-lane treatment on any route. Route, treatment, and delivered-status recovery are therefore not applicable.",
    gaps: gaps({
      delivered_status: "operational-coverage:964c8908a91502f062cccbf8",
      route: "operational-coverage:f18cae3de12d1aefd43a4e1e",
      treatment: "operational-coverage:a5a45bbca1dd0951d1a6e49a",
    }),
  },
  {
    eventId: "event_meeting-doc-174076-transfer-policy-launch",
    rationale: "This Board item proposes a promotional transfer policy aligned with QBNR Phase 1. It is a fare-policy measure, not an independent route-redesign occurrence; the delivered QBNR route changes are already represented by source-complete route-atomic occurrences.",
    gaps: gaps({
      delivered_status: "operational-coverage:b15c7958c6913dfa79b2dcfe",
      route: "operational-coverage:9136a8a9b970d32f47d31dd0",
      treatment: "operational-coverage:10e40a631feba82245978d60",
    }),
  },
  {
    eventId: "event_meeting-doc-133291-implementation-april2024",
    rationale: "This record gives a proposed April 2024 implementation date for a multi-route schedule-change package. The source does not retrospectively confirm delivery or bind each candidate route to a treatment, so the coarse proposal cannot be promoted as an occurrence.",
    gaps: gaps({
      delivered_status: "operational-coverage:145487634fb8ded0762a6065",
      route: "operational-coverage:56d27b4303f8c9caef318eb9",
      treatment: "operational-coverage:06f39b32e67e7db8f5e63a76",
    }),
  },
  {
    eventId: "event_meeting-doc-205546-bus-simulators",
    rationale: "The event concerns workforce-training simulators at facilities, not an on-street bus treatment. Facility candidates must not be interpreted as route scope, and treatment recovery is not applicable.",
    gaps: gaps({
      route: "operational-coverage:60a509fe2a048a2e06d4c7c4",
      treatment: "operational-coverage:1f141c6c10607d2b66619062",
    }),
  },
  {
    eventId: "event_meeting-doc-86471-470-electric-buses",
    rationale: "This is a 2025-26 fleet procurement/deployment plan with no exact operational date, delivered confirmation, route assignment, or speed-treatment scope. Refining it into a study occurrence would require unsupported assumptions and is not applicable.",
    gaps: gaps({
      date_precision: "operational-coverage:6b2d0e74ea4775f023a0cbf4",
      delivered_status: "operational-coverage:5533686165509ca6550109a4",
      route: "operational-coverage:66155acb35dfb44684ee960f",
      treatment: "operational-coverage:147f84fab99614d51851f50e",
    }),
  },
  {
    eventId: "event_montauk-bridge-track-maintenance-oct5-6-2024",
    rationale: "This is temporary LIRR track work with replacement buses, not an NYCT bus-priority or service-redesign intervention. Date, status, route, and treatment recovery are outside the operational study universe.",
    gaps: gaps({
      date_precision: "operational-coverage:6c362b371c41256185ba94df",
      delivered_status: "operational-coverage:77b9d6fa1eba6603030dd3cf",
      route: "operational-coverage:36bbf99a06e37a522725d9f8",
      treatment: "operational-coverage:daf9c39d626a2726367f0930",
    }),
  },
  {
    eventId: "event_st-albans-ada-oct26-27-2024",
    rationale: "This is temporary LIRR track work and replacement-bus service for a rail-station rehabilitation, not a route-level NYCT bus treatment. Operational-anchor recovery is not applicable.",
    gaps: gaps({
      date_precision: "operational-coverage:fb48190623720cad5df56a67",
      delivered_status: "operational-coverage:50b9b29235bcbc8fd92fce93",
      route: "operational-coverage:da7a22411e94dd6ec100b134",
      treatment: "operational-coverage:2ec413da6319494ce454e639",
    }),
  },
  {
    eventId: "event_switch-installation-jamaica-2023",
    rationale: "This is LIRR track work with temporary replacement buses, not an NYCT bus-priority or route-redesign treatment. Its range-date parsing and bus-replacement details do not need recovery for the bounded study corpus.",
    gaps: gaps({
      date_precision: "operational-coverage:af08ec48449589ae1b088e76",
      delivered_status: "operational-coverage:2c39759ce4fe7332f1038635",
      route: "operational-coverage:686db4efaef145f0a69d1f0b",
      treatment: "operational-coverage:fc7842cefb27c9ebced092be",
    }),
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

function slug(value: string): string {
  return value.replace(/^event_/u, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function decisionId(eventId: string, dimension: OperationalCoverageDimension): string {
  return `non-study-${slug(eventId)}-${dimension.replaceAll("_", "-")}-not-applicable`;
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

function expectedDecision(event: MtaCanonicalRecord, spec: EventSpec, gap: GapSpec): OperationalCoverageAcceptedDecision {
  const id = decisionId(spec.eventId, gap.dimension);
  return parseOperationalCoverageAcceptedDecision({
    schema_version: 1,
    decision_id: id,
    gap_id: gap.gapId,
    prior_verdict: "unreviewed",
    verdict: "not_applicable",
    reviewer: REVIEWER,
    decided_at: DECIDED_AT,
    rationale: spec.rationale,
    proposal_ids: [],
    evidence_refs: evidenceRefs(event),
    search_receipt_ids: [],
  }, id);
}

function assertCanonicalInventory(): Map<string, MtaCanonicalRecord> {
  const targetIds = new Set(eventSpecs.map((spec) => spec.eventId));
  const events = readCanonicalRecordsFromJsonl()
    .filter((record) => targetIds.has(record.record_id))
    .sort((left, right) => left.record_id.localeCompare(right.record_id));
  assert(events.length === 28, `Expected 28 target events, found ${events.length}`);
  assert(sha256(stableJson(events as unknown as JsonValue)) === TARGET_EVENT_FINGERPRINT, "Target canonical event evidence changed before adjudication");
  for (const event of events) {
    assert(event.record_kind === "event", `${event.record_id} is no longer an event`);
    assert(event.truth_status === "source_stated" && event.review_state !== "quarantined", `${event.record_id} is not usable`);
    assert(event.evidence_refs.length > 0, `${event.record_id} has no source evidence`);
  }
  return new Map(events.map((event) => [event.record_id, event]));
}

function stateCounts(queue: QueueRow[]): { total: number; open: number; terminal: number; ready: number } {
  return {
    total: queue.length,
    open: queue.filter((row) => row.status === "open").length,
    terminal: queue.filter((row) => row.status === "terminal").length,
    ready: queue.filter((row) => row.status === "ready_for_review").length,
  };
}

function assertQueueInventory(queue: QueueRow[]): "pre" | "post" {
  const expectedByGap = new Map(eventSpecs.flatMap((event) => event.gaps.map((gap) => [gap.gapId, { event, gap }] as const)));
  assert(expectedByGap.size === 47, `Expected 47 unique target gaps, found ${expectedByGap.size}`);
  const targetRows = queue.filter((row) => expectedByGap.has(row.gap_id));
  assert(targetRows.length === 47, `Expected 47 target queue rows, found ${targetRows.length}`);
  const inventory = targetRows
    .map((row) => ({ gap_id: row.gap_id, event_record_id: row.event_record_id, dimension: row.dimension }))
    .sort((left, right) => left.gap_id.localeCompare(right.gap_id));
  assert(sha256(stableJson(inventory as unknown as JsonValue)) === TARGET_GAP_FINGERPRINT, "Target gap inventory changed");
  for (const row of targetRows) {
    const expected = expectedByGap.get(row.gap_id);
    assert(expected, `Unexpected target gap ${row.gap_id}`);
    assert(row.event_record_id === expected.event.eventId, `${row.gap_id} event changed`);
    assert(row.dimension === expected.gap.dimension, `${row.gap_id} dimension changed`);
    assert(row.priority, `${row.gap_id} is no longer priority`);
    assert(row.resolved_occurrence_ids.length === 0, `${row.gap_id} unexpectedly resolves to an occurrence`);
  }
  const pre = targetRows.every((row) => row.status === "open" && row.verdict === "unreviewed");
  const post = targetRows.every((row) => row.status === "terminal" && row.verdict === "not_applicable");
  assert(pre || post, "Target gaps are in a mixed or unexpected review state");
  const counts = stateCounts(queue);
  const expectedCounts = pre
    ? { total: 501, open: 221, terminal: 280, ready: 0 }
    : { total: 501, open: 174, terminal: 327, ready: 0 };
  assert(stableJson(counts as unknown as JsonValue) === stableJson(expectedCounts as unknown as JsonValue), `Priority queue counts changed: ${JSON.stringify(counts)}`);
  return pre ? "pre" : "post";
}

function writeOrVerifyDecisions(eventsById: ReadonlyMap<string, MtaCanonicalRecord>, allowWrite: boolean): void {
  mkdirSync(decisionDir, { recursive: true });
  for (const spec of eventSpecs) {
    const event = eventsById.get(spec.eventId);
    assert(event, `Missing canonical event ${spec.eventId}`);
    for (const gap of spec.gaps) {
      const decision = expectedDecision(event, spec, gap);
      const path = join(decisionDir, `${decision.decision_id}.json`);
      if (existsSync(path)) {
        const existing = JSON.parse(readFileSync(path, "utf8")) as JsonValue;
        assert(stableJson(existing) === stableJson(decision as unknown as JsonValue), `${path} conflicts with the generated decision`);
        continue;
      }
      assert(allowWrite, `${path} is missing after the adjudication baseline changed`);
      writeFileSync(path, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
    }
  }
}

assert(eventSpecs.length === 28 && new Set(eventSpecs.map((spec) => spec.eventId)).size === 28, "Target event inventory drifted");
const queueContent = readFileSync(queuePath);
const queue = readJsonl<QueueRow>(queuePath);
const state = assertQueueInventory(queue);
if (state === "pre") {
  assert(sha256(queueContent) === BASELINE_PRIORITY_QUEUE_SHA256, "Priority queue changed before non-study adjudication");
}
const eventsById = assertCanonicalInventory();
writeOrVerifyDecisions(eventsById, state === "pre");

process.stdout.write(`${state === "pre" ? "Generated" : "Verified"} 47 evidence-scoped non-study decisions across 28 events.\n`);
