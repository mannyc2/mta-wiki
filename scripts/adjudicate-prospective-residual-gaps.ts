import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type {
  JsonValue,
  MtaCanonicalRecord,
} from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import { loadOperationalOccurrenceIdentityRegistry } from "../packages/pipeline/src/materialize/operational-occurrence-identity.js";
import { loadOperationalOccurrenceAcceptedDecisions } from "../packages/pipeline/src/materialize/operational-occurrence-review.js";
import {
  parseOperationalCoverageAcceptedDecision,
  type OperationalCoverageAcceptedDecision,
  type OperationalCoverageDecisionEvidenceRef,
  type OperationalCoverageDimension,
} from "../packages/pipeline/src/quality/operational-coverage.js";

const REVIEWER = "codex-corpus-completion-2026-07-13";
const DECIDED_AT = "2026-07-13T20:40:00.000Z";
const EXCLUDED_EVENT_ID = "event_queue-jump-implementation-fall2024";
const EXCLUDED_GAP_ID = "operational-coverage:1421a4564c24ec04c9a70638";

// Covers the exact 32 event records and 24 incoming timeline relations, including
// identities, endpoints, statuses, source ids, dates, and evidence refs/hashes.
// lifecycle_phase is deliberately excluded because this script is sequenced after
// the separate lifecycle correction that changes every target event to `planned`.
const TARGET_PROSPECTIVE_CONTEXT_FINGERPRINT =
  "cbf95358329b59d336be638eabab68168e2f5dba80b678b6d205050273413ed3";

// Covers the exact 104 queue rows while excluding mutable review-state fields.
const TARGET_QUEUE_CONTEXT_FINGERPRINT =
  "c1d29a70df5716e66274fd9c06a09c2bd0110e3bcf8ed20c48dc5b3dac6decd6";

const queuePath = join(
  repoRoot,
  "data/quality/operational-coverage/priority-queue.jsonl",
);
const decisionDir = join(
  repoRoot,
  "data/operational-anchor-review/ledger-decisions/decisions",
);

const fullDimensions = [
  "date_precision",
  "delivered_status",
  "route",
  "treatment",
] as const;
const allDimensions = [...fullDimensions, "timeline_subject"] as const;

type FullDimension = (typeof fullDimensions)[number];
type ContextMode = "incoming_relation" | "explicit_source_context";

type FullGaps = Record<FullDimension, string>;

type EventSpec = {
  eventId: string;
  sourceId: string;
  queueSourceIds: string[];
  dateText: string;
  dateNormalized: string | null;
  datePrecision: string;
  contextMode: ContextMode;
  contextFragment: string | null;
  gaps: Partial<Record<OperationalCoverageDimension, string>>;
};

type GapSpec = {
  event: EventSpec;
  gapId: string;
  dimension: OperationalCoverageDimension;
  decisionId: string;
};

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: OperationalCoverageDimension;
  priority: boolean;
  priority_families: string[];
  source_ids: string[];
  status: "open" | "ready_for_review" | "terminal";
  verdict: string;
  decision_ids: string[];
  resolved_occurrence_ids: string[];
  context_record_ids: string[];
  required_search_source_ids: string[];
};

function fourGapEvent(
  eventId: string,
  sourceId: string,
  dateText: string,
  dateNormalized: string | null,
  datePrecision: string,
  gaps: FullGaps,
  queueSourceIds: string[] = [sourceId],
): EventSpec {
  return {
    eventId,
    sourceId,
    queueSourceIds,
    dateText,
    dateNormalized,
    datePrecision,
    contextMode: "incoming_relation",
    contextFragment: null,
    gaps,
  };
}

function timelineSubjectEvent(
  eventId: string,
  sourceId: string,
  dateText: string,
  dateNormalized: string | null,
  datePrecision: string,
  gapId: string,
  contextFragment: string,
): EventSpec {
  return {
    eventId,
    sourceId,
    queueSourceIds: [sourceId],
    dateText,
    dateNormalized,
    datePrecision,
    contextMode: "explicit_source_context",
    contextFragment,
    gaps: { timeline_subject: gapId },
  };
}

const eventSpecs: EventSpec[] = [
  fourGapEvent(
    "event_busway-implementation-summer-fall-2025",
    "34th_st_enhanced_bus_priority_cb6_jun2025",
    "Summer/Fall 2025",
    "2025-fall",
    "season",
    {
      date_precision: "operational-coverage:f58124a1bef7320d86d5862f",
      delivered_status: "operational-coverage:976783897d3609a291ac10e4",
      route: "operational-coverage:1c6f6d235301419c6c92011a",
      treatment: "operational-coverage:3591df8f069724d9374226c3",
    },
  ),
  fourGapEvent(
    "event_curb-regulations-refine-2026_3",
    "lexington_ave_60_st_52_st_sept2025",
    "2026",
    "2026",
    "year",
    {
      date_precision: "operational-coverage:3bf6ea8b822f420eafa6d92b",
      delivered_status: "operational-coverage:bb3a1918c2535d5538b46b45",
      route: "operational-coverage:7c86d0295c0dd6e07fd032e8",
      treatment: "operational-coverage:e0c728a6584b0137d04f138d",
    },
  ),
  fourGapEvent(
    "event_fall2025-implementation",
    "lexington_ave_60_st_52_st_sept2025",
    "Fall 2025",
    "2025-fall",
    "season",
    {
      date_precision: "operational-coverage:3ea94670bf85e94779dcf7e9",
      delivered_status: "operational-coverage:60e2bd52d4d3e145264c4fd3",
      route: "operational-coverage:3bf6c287e07c630a56688e33",
      treatment: "operational-coverage:9f0dc8652a5d43dc3a3b4871",
    },
  ),
  fourGapEvent(
    "event_implementation-begins-late-may-2026",
    "broadway_69_st_roosevelt_ave_may2026",
    "Late May/Early June",
    "2026",
    "year",
    {
      date_precision: "operational-coverage:272b709ec1a9c7f6a0764e2b",
      delivered_status: "operational-coverage:48a6559eff600fe71dcbf5b7",
      route: "operational-coverage:7417c87957c7a7c414d8d2e2",
      treatment: "operational-coverage:d1d936a88cfa92b37c4dd16a",
    },
    [
      "broadway_69_st_roosevelt_ave_may2026",
      "nyc_dot_current_projects_july_2026",
      "nyc_mayor_broadway_created_june_2026",
    ],
  ),
  fourGapEvent(
    "event_implementation-fall2025-spring2026",
    "lexington_ave_60_st_52_st_oct2025",
    "Fall 2025/Spring 2026",
    "2025-fall",
    "season",
    {
      date_precision: "operational-coverage:7fef430ccb23c4cf6d8b80d3",
      delivered_status: "operational-coverage:d84b0a654ac15681180691f0",
      route: "operational-coverage:100057591aea2e415fc9bf54",
      treatment: "operational-coverage:ba82c440df53b842d535b15d",
    },
  ),
  fourGapEvent(
    "event_implementation-late2025-or-2026",
    "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024",
    "late 2025 or 2026",
    null,
    "unknown",
    {
      date_precision: "operational-coverage:a80af8adcedb7b2abf689cc9",
      delivered_status: "operational-coverage:c5842fe52615ee0fa08e6b02",
      route: "operational-coverage:687fedff0cc13a5382988ea4",
      treatment: "operational-coverage:b3eba8e0e718920d6547e5d0",
    },
  ),
  fourGapEvent(
    "event_implementation-summer-2025_3",
    "116_st_morningside_ave_pleasant_ave_cb9_jun2025",
    "Summer 2025",
    "2025-summer",
    "season",
    {
      date_precision: "operational-coverage:6d5d3c741e406b97409936b9",
      delivered_status: "operational-coverage:a2f9bd153333cfcd439fc2cd",
      route: "operational-coverage:d920939c8f933d87de5ac2c1",
      treatment: "operational-coverage:6b1a47caf413511af5edd95c",
    },
  ),
  fourGapEvent(
    "event_implementation-summer-2025_4",
    "34th_st_enhanced_bus_priority_cb4_jan2025",
    "Summer 2025",
    "2025-summer",
    "season",
    {
      date_precision: "operational-coverage:22a8f71bbc9503b17845a89b",
      delivered_status: "operational-coverage:0be7b2e6792ce84c817bdc9d",
      route: "operational-coverage:6af007d76a362f65f335776b",
      treatment: "operational-coverage:3ea3c2eb95142a7242854ac6",
    },
  ),
  fourGapEvent(
    "event_implementation-summer-fall-2025",
    "116_st_morningside_ave_pleasant_ave_cb9_feb2025",
    "Summer/Fall 2025",
    "2025-fall",
    "season",
    {
      date_precision: "operational-coverage:2561c3c9da79f9e6b3ef8e97",
      delivered_status: "operational-coverage:fd43bfeb05a4072a3cc9f2b3",
      route: "operational-coverage:48d11f18aeb135d8aad84a86",
      treatment: "operational-coverage:d8c84fb8df0bf4a65dcaf7ec",
    },
  ),
  fourGapEvent(
    "event_implementation-summer-fall-2025_2",
    "34th_st_enhanced_bus_priority_cb4_may2025",
    "Summer/Fall 2025",
    "2025-fall",
    "season",
    {
      date_precision: "operational-coverage:d5f4c62b0dafe20c46a5a9e9",
      delivered_status: "operational-coverage:cead77e7e1771332ad809fe8",
      route: "operational-coverage:cfc6c8fcd8e5b919996fa9d6",
      treatment: "operational-coverage:a632028caee237c3c647e3f7",
    },
  ),
  fourGapEvent(
    "event_implementation-summer-fall-2025_3",
    "34th_st_enhanced_bus_priority_cb5_may2025",
    "Summer/Fall 2025",
    "2025-fall",
    "season",
    {
      date_precision: "operational-coverage:2bd680d4533aa05b46882463",
      delivered_status: "operational-coverage:fb7cead7b5a06afaeeb2b309",
      route: "operational-coverage:ab0b012e958df9ec75f7d6f7",
      treatment: "operational-coverage:0e94ebd7e894672a1f1f804b",
    },
  ),
  fourGapEvent(
    "event_implementation-tentative-summer2025-cb11-jun2025",
    "116_st_morningside_ave_pleasant_ave_cb11_jun2025",
    "Summer 2025",
    "2025-summer",
    "season",
    {
      date_precision: "operational-coverage:24dc6f2456ca293b01f1a338",
      delivered_status: "operational-coverage:4ddc11c947e4112d69f72d2e",
      route: "operational-coverage:20634498f6986c29664144cd",
      treatment: "operational-coverage:4502240d207f560fb76bd0a5",
    },
  ),
  fourGapEvent(
    "event_implementation-timeline-fall2025-spring2026",
    "lexington_ave_60_st_52_st_cb8_oct2025",
    "Fall 2025/Spring 2026",
    "2025-fall",
    "season",
    {
      date_precision: "operational-coverage:dfcb16ae39adfcb79bb50c39",
      delivered_status: "operational-coverage:aec7d4174a64dd10ef284726",
      route: "operational-coverage:3f1e0f1b48a7ea42cac24c1d",
      treatment: "operational-coverage:6308548cc06f8c6b88a49730",
    },
  ),
  fourGapEvent(
    "event_planned-implementation-fall2023",
    "fordham_rd_inwood_cab_may2023",
    "Fall 2023",
    "2023-fall",
    "season",
    {
      date_precision: "operational-coverage:0e6a838de09e3609672377bd",
      delivered_status: "operational-coverage:aa26ffbb0d34f047984c00bc",
      route: "operational-coverage:d10febd0285e1858bec35e74",
      treatment: "operational-coverage:02d40e85bbbe2a9df56f272c",
    },
  ),
  fourGapEvent(
    "event_planned-implementation-fall2023_2",
    "fordham_rd_inwood_cb7_jun2023",
    "Fall 2023",
    "2023-fall",
    "season",
    {
      date_precision: "operational-coverage:a08d7bf7a3e51c36e8bf3ec3",
      delivered_status: "operational-coverage:bf60972251e9c06f1cb87859",
      route: "operational-coverage:415f789795e3687615766b8c",
      treatment: "operational-coverage:35e1dc4de06a2936e6203e18",
    },
  ),
  fourGapEvent(
    "event_planned-implementation-fall2023_3",
    "fordham_rd_inwood_cb11_jun2023",
    "Fall 2023",
    "2023-fall",
    "season",
    {
      date_precision: "operational-coverage:f4506a6d38694d25b3cbeb2e",
      delivered_status: "operational-coverage:1f5cb4f1cee10f934c0badb7",
      route: "operational-coverage:3304b9fb100760bb2d8fe3b5",
      treatment: "operational-coverage:8b84407212d7de8bd8464e22",
    },
  ),
  fourGapEvent(
    "event_planned-implementation-fall2023_4",
    "fordham_rd_inwood_cb5_jun2023",
    "Fall 2023",
    "2023-fall",
    "season",
    {
      date_precision: "operational-coverage:34f267fed1a5e36396978eb4",
      delivered_status: "operational-coverage:154b88eccf4b573026bc8630",
      route: "operational-coverage:2470105e5fe085435411aed2",
      treatment: "operational-coverage:3cbbd7ccca7383d53574bef8",
    },
  ),
  fourGapEvent(
    "event_planned-implementation-summer-2025",
    "madison_ave_e23_st_e42_st_cb6_jun2025",
    "Summer 2025",
    "2025-summer",
    "season",
    {
      date_precision: "operational-coverage:942ffaaa5cbc0259520869ab",
      delivered_status: "operational-coverage:269a5b883faffb8bcc07f11c",
      route: "operational-coverage:cd03eb734f481414eee6f897",
      treatment: "operational-coverage:78cc13abc5464b07214fbc84",
    },
  ),
  fourGapEvent(
    "event_planned-implementation-summer2025",
    "madison_ave_e23_st_e42_st_cb5_may2025",
    "Summer 2025",
    "2025-summer",
    "season",
    {
      date_precision: "operational-coverage:fd7fe73fe2c4764ce89683e1",
      delivered_status: "operational-coverage:99a751574d058d6595054d8e",
      route: "operational-coverage:6d78bafbf794089507327fb3",
      treatment: "operational-coverage:3851292b6cc4abca43e0d9c8",
    },
  ),
  fourGapEvent(
    "event_potential-implementation-summer-fall-2025_2",
    "116_st_morningside_ave_pleasant_ave_cb11_mar2025",
    "Summer/Fall 2025",
    "2025-fall",
    "season",
    {
      date_precision: "operational-coverage:7f3615a2038efac4ef808401",
      delivered_status: "operational-coverage:0b968de4f4d427e55930cba5",
      route: "operational-coverage:7f51d29f85403271303b8a25",
      treatment: "operational-coverage:607a8b001d480a7a99c818a0",
    },
  ),
  fourGapEvent(
    "event_proposed-implementation-cb12-jun2025",
    "bay_pkwy_cropsey_ave_cb12_jun2025",
    "Late 2025 or 2026",
    null,
    "unknown",
    {
      date_precision: "operational-coverage:37f1c5d5c424cd2a7af380ad",
      delivered_status: "operational-coverage:0e01f2dee2db05ffc3e5c415",
      route: "operational-coverage:bf94437c83429d714e343554",
      treatment: "operational-coverage:ca5f7c2098c5d3453e5f6a20",
    },
  ),
  fourGapEvent(
    "event_summer-2025-implementation-feb2025",
    "34th_st_enhanced_bus_priority_cb6_feb2025",
    "Summer 2025",
    "2025-summer",
    "season",
    {
      date_precision: "operational-coverage:9707df0cd1aae21eb49dc16c",
      delivered_status: "operational-coverage:748b56eb490a32c344155198",
      route: "operational-coverage:ae2192b31f54ad28ef44eee7",
      treatment: "operational-coverage:3f587b4d395817eeb8c970a1",
    },
  ),
  fourGapEvent(
    "event_summer-fall-2025-implementation",
    "dekalb_lafayette_cb3_dec2024",
    "Summer/Fall 2025",
    "2025-fall",
    "season",
    {
      date_precision: "operational-coverage:488252945cf4dca4b2c2f6ab",
      delivered_status: "operational-coverage:01558e640a39305d65882e3a",
      route: "operational-coverage:102a6ffe2a9fadc681d86d8e",
      treatment: "operational-coverage:676f779df57dbe063df0a4e8",
    },
  ),
  fourGapEvent(
    "event_summer2025-tentative-implementation-may2025",
    "116_st_morningside_ave_pleasant_ave_cb10_may2025",
    "Summer 2025",
    "2025-summer",
    "season",
    {
      date_precision: "operational-coverage:46239d953ced217105aa335e",
      delivered_status: "operational-coverage:d6321e9d66c8f469596b4bd7",
      route: "operational-coverage:bb1e231c9ca4cbd2bcc88024",
      treatment: "operational-coverage:a94b39319dcd7fb3235dfcf9",
    },
  ),
  timelineSubjectEvent(
    "event_bus-service-increase-summer-2025",
    "meeting_doc_174141",
    "Summer 2025",
    "2025-summer",
    "season",
    "operational-coverage:c9f6d63b832b05de1f4776d0",
    "will increase",
  ),
  timelineSubjectEvent(
    "event_busway-implementation-spring2025",
    "tremont_ave_bus_priority_cb5_nov2024",
    "Spring 2025",
    "2025-spring",
    "season",
    "operational-coverage:b91bd73f8e16fcfe5d919e90",
    "Implement Busway Spring 2025",
  ),
  timelineSubjectEvent(
    "event_busway-launch-spring2025",
    "tremont_ave_bus_priority_cb6_feb2025",
    "Spring 2025",
    "2025-spring",
    "season",
    "operational-coverage:7aa90f3201c8a1747ee7ee9f",
    "Busway Launch",
  ),
  timelineSubjectEvent(
    "event_implementation-spring2025",
    "tremont_ave_bus_priority_cb6_feb2025",
    "late March/April 2025",
    "2025-04",
    "month",
    "operational-coverage:6099d6cceaa37227434054bb",
    "Begin Implementation",
  ),
  timelineSubjectEvent(
    "event_meeting-doc-160441-local-summer-2025",
    "meeting_doc_160441",
    "Summer 2025",
    "2025-summer",
    "season",
    "operational-coverage:5b8855aed38468d65664d126",
    "Summer 2025",
  ),
  timelineSubjectEvent(
    "event_tremont-busway-impl-spring2025",
    "tremont_ave_bus_priority_cab4_mar2025",
    "late March/April 2025",
    "2025-04",
    "month",
    "operational-coverage:c4e69a1fe45ef795dcd560e3",
    "Begin Implementation",
  ),
  timelineSubjectEvent(
    "event_tremont-busway-implementation-spring2025",
    "tremont_ave_bus_priority_cb6_nov2024",
    "Spring 2025",
    "2025-spring",
    "season",
    "operational-coverage:0744be23601592f4e162c4ba",
    "Implement Busway Spring 2025",
  ),
  timelineSubjectEvent(
    "event_tremont-busway-launch-spring2025",
    "tremont_ave_bus_priority_cab4_mar2025",
    "Spring 2025",
    "2025-spring",
    "season",
    "operational-coverage:8963575d53e644f4fa34ca5f",
    "Busway Launch",
  ),
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function recordEvidenceSnapshot(
  record: MtaCanonicalRecord,
): Record<string, JsonValue> {
  return {
    record_id: record.record_id,
    source_id: record.source_id,
    source_ids: sorted(record.source_ids ?? []),
    evidence_refs: record.evidence_refs
      .map((ref) => ({
        source_id: ref.source_id,
        evidence_id: ref.evidence_id,
        block_id: ref.block_id ?? null,
        page_number: ref.page_number ?? null,
        text_sha256: ref.text_sha256 ?? null,
        source_quote: ref.source_quote ?? null,
      }))
      .sort((left, right) =>
        String(left.evidence_id).localeCompare(String(right.evidence_id)),
      ),
  };
}

function prospectiveContextFingerprint(
  events: readonly MtaCanonicalRecord[],
  incomingRelations: readonly MtaCanonicalRecord[],
): string {
  const snapshot = {
    events: events
      .map((event) => ({
        ...recordEvidenceSnapshot(event),
        record_id: event.record_id,
        date_text: (event.payload.date_text ?? null) as JsonValue,
        date_normalized: (event.payload.date_normalized ?? null) as JsonValue,
        date_precision: (event.payload.date_precision ?? null) as JsonValue,
      }))
      .sort((left, right) =>
        String(left.record_id).localeCompare(String(right.record_id)),
      ),
    incoming_relations: incomingRelations
      .map((relation) => ({
        ...recordEvidenceSnapshot(relation),
        record_id: relation.record_id,
        relation_kind: (relation.payload.relation_kind ?? null) as JsonValue,
        subject_id: (relation.payload.subject_id ?? null) as JsonValue,
        object_id: (relation.payload.object_id ?? null) as JsonValue,
        assertion_status: (relation.payload.assertion_status ??
          null) as JsonValue,
      }))
      .sort((left, right) =>
        String(left.record_id).localeCompare(String(right.record_id)),
      ),
  };
  return sha256(stableJson(snapshot as unknown as JsonValue));
}

function queueContextFingerprint(rows: readonly QueueRow[]): string {
  const snapshot = rows
    .map((row) => ({
      gap_id: row.gap_id,
      event_record_id: row.event_record_id,
      dimension: row.dimension,
      priority: row.priority,
      priority_families: sorted(row.priority_families),
      source_ids: sorted(row.source_ids),
      context_record_ids: sorted(row.context_record_ids),
      required_search_source_ids: sorted(row.required_search_source_ids),
    }))
    .sort((left, right) => left.gap_id.localeCompare(right.gap_id));
  return sha256(stableJson(snapshot as unknown as JsonValue));
}

function decisionSlug(eventId: string): string {
  return eventId
    .replace(/^event_/u, "")
    .replaceAll("_", "-")
    .replace(/[^a-zA-Z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
}

function decisionId(
  eventId: string,
  dimension: OperationalCoverageDimension,
): string {
  return `prospective-residual-${decisionSlug(eventId)}-${dimension.replaceAll("_", "-")}-not-applicable`;
}

const gapSpecs: GapSpec[] = eventSpecs.flatMap((event) =>
  allDimensions.flatMap((dimension) => {
    const gapId = event.gaps[dimension];
    return gapId
      ? [
          {
            event,
            gapId,
            dimension,
            decisionId: decisionId(event.eventId, dimension),
          },
        ]
      : [];
  }),
);

function requiredRecord(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
  kind: MtaCanonicalRecord["record_kind"],
): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  assert(
    record,
    `Missing canonical ${kind} ${recordId}; run the lifecycle pass and materialize first`,
  );
  assert(
    record.record_kind === kind,
    `${recordId} is ${record.record_kind}, expected ${kind}`,
  );
  assert(
    record.truth_status === "source_stated",
    `${recordId} is not source-stated`,
  );
  assert(record.review_state !== "quarantined", `${recordId} is quarantined`);
  assert(record.evidence_refs.length > 0, `${recordId} lost source evidence`);
  for (const ref of record.evidence_refs) {
    assert(ref.evidence_id, `${recordId} has evidence without evidence_id`);
    assert(ref.source_id, `${recordId} has evidence without source_id`);
    assert(
      /^sha256:[a-f0-9]{64}$/u.test(ref.text_sha256 ?? ""),
      `${recordId}/${ref.evidence_id} lost its evidence hash`,
    );
  }
  return record;
}

function assertCanonicalContext(records: readonly MtaCanonicalRecord[]): {
  recordsById: Map<string, MtaCanonicalRecord>;
  eventsById: Map<string, MtaCanonicalRecord>;
  incomingByEvent: Map<string, MtaCanonicalRecord[]>;
} {
  const recordsById = new Map(
    records.map((record) => [record.record_id, record]),
  );
  const targetEventIds = new Set(eventSpecs.map((spec) => spec.eventId));
  const events = eventSpecs
    .map((spec) => requiredRecord(recordsById, spec.eventId, "event"))
    .sort((left, right) => left.record_id.localeCompare(right.record_id));
  const eventsById = new Map(events.map((event) => [event.record_id, event]));
  const incomingRelations = records
    .filter(
      (record) =>
        record.record_kind === "relation" &&
        typeof record.payload.object_id === "string" &&
        targetEventIds.has(record.payload.object_id),
    )
    .sort((left, right) => left.record_id.localeCompare(right.record_id));
  const incomingByEvent = new Map<string, MtaCanonicalRecord[]>();
  for (const relation of incomingRelations) {
    const eventId = relation.payload.object_id as string;
    incomingByEvent.set(eventId, [
      ...(incomingByEvent.get(eventId) ?? []),
      relation,
    ]);
  }

  assert(
    events.length === 32,
    `Expected exactly 32 prospective events, found ${events.length}`,
  );
  assert(
    incomingRelations.length === 24,
    `Expected exactly 24 incoming prospective timeline relations, found ${incomingRelations.length}`,
  );
  assert(
    prospectiveContextFingerprint(events, incomingRelations) ===
      TARGET_PROSPECTIVE_CONTEXT_FINGERPRINT,
    "Prospective event/relation identities or evidence changed",
  );

  for (const spec of eventSpecs) {
    const event = eventsById.get(spec.eventId)!;
    assert(event.source_id === spec.sourceId, `${spec.eventId} source changed`);
    assert(
      stableJson(sorted(event.source_ids ?? []) as unknown as JsonValue) ===
        stableJson([spec.sourceId] as unknown as JsonValue),
      `${spec.eventId} source inventory changed`,
    );
    assert(
      event.payload.lifecycle_phase === "planned",
      `${spec.eventId} must be lifecycle_phase=planned before adjudication`,
    );
    assert(
      event.payload.date_text === spec.dateText,
      `${spec.eventId} date_text changed`,
    );
    assert(
      (event.payload.date_normalized ?? null) === spec.dateNormalized,
      `${spec.eventId} normalized date changed`,
    );
    assert(
      event.payload.date_precision === spec.datePrecision,
      `${spec.eventId} date precision changed`,
    );

    const incoming = incomingByEvent.get(spec.eventId) ?? [];
    if (spec.contextMode === "incoming_relation") {
      assert(
        incoming.length === 1,
        `${spec.eventId} must have exactly one incoming timeline relation`,
      );
      const relation = incoming[0]!;
      requiredRecord(recordsById, relation.record_id, "relation");
      assert(
        relation.payload.relation_kind === "has_timeline_event",
        `${relation.record_id} relation kind changed`,
      );
      assert(
        relation.payload.object_id === spec.eventId,
        `${relation.record_id} event endpoint changed`,
      );
      assert(
        relation.payload.assertion_status === "planned" ||
          relation.payload.assertion_status === "proposed",
        `${relation.record_id} is no longer planned/proposed`,
      );
    } else {
      assert(
        incoming.length === 0,
        `${spec.eventId} unexpectedly gained an incoming relation`,
      );
      assert(
        spec.contextFragment,
        `${spec.eventId} lacks an explicit prospective context fragment`,
      );
      const context = [
        event.raw_text,
        event.payload.date_text,
        event.payload.description,
        event.display_name,
      ]
        .filter((value): value is string => typeof value === "string")
        .join(" | ");
      assert(
        context.includes(spec.contextFragment),
        `${spec.eventId} prospective source context changed`,
      );
    }
  }
  return { recordsById, eventsById, incomingByEvent };
}

function assertNoOccurrences(targetEventIds: ReadonlySet<string>): void {
  const accepted = loadOperationalOccurrenceAcceptedDecisions();
  const identities = loadOperationalOccurrenceIdentityRegistry();
  const occurrenceDecision = accepted.find((decision) =>
    decision.observation_event_record_ids.some((eventId) =>
      targetEventIds.has(eventId),
    ),
  );
  assert(
    !occurrenceDecision,
    `${occurrenceDecision?.decision_id} unexpectedly promotes a prospective event`,
  );
  const identity = identities.find((entry) =>
    entry.founding_event_record_ids.some((eventId) =>
      targetEventIds.has(eventId),
    ),
  );
  assert(
    !identity,
    `${identity?.occurrence_id} unexpectedly gives a prospective event persistent occurrence identity`,
  );
}

function stateCounts(queue: readonly QueueRow[]): {
  total: number;
  open: number;
  terminal: number;
  ready: number;
} {
  return {
    total: queue.length,
    open: queue.filter((row) => row.status === "open").length,
    terminal: queue.filter((row) => row.status === "terminal").length,
    ready: queue.filter((row) => row.status === "ready_for_review").length,
  };
}

function assertQueueInventory(queue: readonly QueueRow[]): {
  state: "pre" | "post";
  rowsByGap: Map<string, QueueRow>;
} {
  const expectedByGap = new Map(gapSpecs.map((spec) => [spec.gapId, spec]));
  const targetEventIds = new Set(eventSpecs.map((spec) => spec.eventId));
  assert(
    expectedByGap.size === 104,
    `Expected 104 unique target gaps, found ${expectedByGap.size}`,
  );
  const targetRows = queue.filter((row) => expectedByGap.has(row.gap_id));
  const targetEventRows = queue.filter((row) =>
    targetEventIds.has(row.event_record_id),
  );
  assert(
    targetRows.length === 104,
    `Expected 104 target rows, found ${targetRows.length}`,
  );
  assert(
    targetEventRows.length === 104,
    `Target events now own ${targetEventRows.length} rows instead of exactly 104`,
  );
  assert(
    targetEventRows.every((row) => expectedByGap.has(row.gap_id)),
    `Unexpected gap(s) on target events: ${targetEventRows
      .filter((row) => !expectedByGap.has(row.gap_id))
      .map((row) => row.gap_id)
      .join(", ")}`,
  );
  assert(
    queueContextFingerprint(targetRows) === TARGET_QUEUE_CONTEXT_FINGERPRINT,
    "Target queue context/evidence inventory changed",
  );

  const rowsByGap = new Map(targetRows.map((row) => [row.gap_id, row]));
  for (const spec of gapSpecs) {
    const row = rowsByGap.get(spec.gapId);
    assert(row, `Missing target gap ${spec.gapId}`);
    assert(
      row.event_record_id === spec.event.eventId,
      `${spec.gapId} event identity changed`,
    );
    assert(row.dimension === spec.dimension, `${spec.gapId} dimension changed`);
    assert(row.priority, `${spec.gapId} is no longer priority`);
    assert(
      stableJson(sorted(row.source_ids) as unknown as JsonValue) ===
        stableJson(sorted(spec.event.queueSourceIds) as unknown as JsonValue),
      `${spec.gapId} source inventory changed`,
    );
    assert(
      row.resolved_occurrence_ids.length === 0,
      `${spec.gapId} unexpectedly resolves to an occurrence`,
    );
  }

  const pre = targetRows.every(
    (row) =>
      row.status === "open" &&
      row.verdict === "unreviewed" &&
      row.decision_ids.length === 0,
  );
  const post = targetRows.every((row) => {
    const spec = expectedByGap.get(row.gap_id)!;
    return (
      row.status === "terminal" &&
      row.verdict === "not_applicable" &&
      stableJson(row.decision_ids as unknown as JsonValue) ===
        stableJson([spec.decisionId] as unknown as JsonValue)
    );
  });
  assert(
    pre || post,
    "The 104 target gaps are in a mixed or unexpected review state",
  );

  const excluded = queue.find((row) => row.gap_id === EXCLUDED_GAP_ID);
  assert(excluded, `Missing explicitly excluded gap ${EXCLUDED_GAP_ID}`);
  assert(
    excluded.event_record_id === EXCLUDED_EVENT_ID,
    `${EXCLUDED_GAP_ID} event changed`,
  );
  assert(
    excluded.dimension === "timeline_subject",
    `${EXCLUDED_GAP_ID} dimension changed`,
  );
  assert(excluded.priority, `${EXCLUDED_GAP_ID} is no longer priority`);
  assert(
    excluded.status === "open" && excluded.verdict === "unreviewed",
    `${EXCLUDED_GAP_ID} must remain the sole open gap`,
  );
  assert(
    excluded.decision_ids.length === 0,
    `${EXCLUDED_GAP_ID} unexpectedly has a decision`,
  );
  assert(
    excluded.resolved_occurrence_ids.length === 0,
    `${EXCLUDED_GAP_ID} unexpectedly resolves to an occurrence`,
  );

  const counts = stateCounts(queue);
  const expectedCounts = pre
    ? { total: 488, open: 105, terminal: 383, ready: 0 }
    : { total: 488, open: 1, terminal: 487, ready: 0 };
  assert(
    stableJson(counts as unknown as JsonValue) ===
      stableJson(expectedCounts as unknown as JsonValue),
    `Priority queue counts changed: ${JSON.stringify(counts)}`,
  );
  const openGapIds = sorted(
    queue.filter((row) => row.status === "open").map((row) => row.gap_id),
  );
  const expectedOpenGapIds = pre
    ? sorted([...expectedByGap.keys(), EXCLUDED_GAP_ID])
    : [EXCLUDED_GAP_ID];
  assert(
    stableJson(openGapIds as unknown as JsonValue) ===
      stableJson(expectedOpenGapIds as unknown as JsonValue),
    "Open-gap inventory changed outside the explicit 104+1 partition",
  );
  return { state: pre ? "pre" : "post", rowsByGap };
}

function decisionEvidence(
  spec: GapSpec,
  eventsById: ReadonlyMap<string, MtaCanonicalRecord>,
  incomingByEvent: ReadonlyMap<string, readonly MtaCanonicalRecord[]>,
  row: QueueRow,
): OperationalCoverageDecisionEvidenceRef[] {
  const event = eventsById.get(spec.event.eventId);
  assert(event, `Missing event evidence for ${spec.event.eventId}`);
  const records = [event, ...(incomingByEvent.get(spec.event.eventId) ?? [])];
  const refs = records.flatMap((record) =>
    record.evidence_refs.map((ref) => {
      assert(ref.evidence_id, `${record.record_id} evidence lost evidence_id`);
      const result: OperationalCoverageDecisionEvidenceRef = {
        record_id: record.record_id,
        source_id: ref.source_id,
        evidence_id: ref.evidence_id,
        block_id: ref.block_id ?? ref.evidence_id.split("#")[1] ?? null,
      };
      assert(
        row.context_record_ids.includes(result.record_id),
        `${result.record_id} left ${spec.gapId} context`,
      );
      assert(
        row.required_search_source_ids.includes(result.source_id),
        `${result.source_id} left ${spec.gapId} source context`,
      );
      return result;
    }),
  );
  const unique = new Map(
    refs.map((ref) => [
      `${ref.record_id}|${ref.source_id}|${ref.evidence_id}`,
      ref,
    ]),
  );
  assert(unique.size > 0, `${spec.gapId} has no decision evidence`);
  return [...unique.values()].sort((left, right) =>
    `${left.record_id}|${left.source_id}|${left.evidence_id}`.localeCompare(
      `${right.record_id}|${right.source_id}|${right.evidence_id}`,
    ),
  );
}

function rationale(spec: GapSpec): string {
  const relationContext =
    spec.event.contextMode === "incoming_relation"
      ? "Its sole incoming has_timeline_event relation is explicitly planned or proposed."
      : "It has no incoming timeline subject, and its own cited event text is an explicitly prospective planning surface.";
  if (spec.dimension === "date_precision") {
    return `${spec.event.eventId} records the prospective target ${JSON.stringify(spec.event.dateText)}, not a realized physical or service onset. ${relationContext} Refining that forecast into a study date would substitute a planning target for operational evidence, so date recovery is not applicable.`;
  }
  if (spec.dimension === "delivered_status") {
    return `${spec.event.eventId} is lifecycle_phase=planned and the cited source does not report this exact milestone as delivered. ${relationContext} Later project history must be represented by a separate retrospective event rather than retroactively converting this forecast, so delivered-status recovery is not applicable.`;
  }
  if (spec.dimension === "route") {
    return `${spec.event.eventId} is a prospective planning milestone, not a realized route-level occurrence. ${relationContext} Project or corridor route candidates are context only; assigning them to this forecast would create unsupported operational scope, so route recovery is not applicable.`;
  }
  if (spec.dimension === "treatment") {
    return `${spec.event.eventId} is a prospective planning milestone, not a realized treatment occurrence. ${relationContext} Proposed project components cannot be cross-joined into delivered treatment scope, so treatment recovery is not applicable.`;
  }
  return `${spec.event.eventId} is retained as source-backed prospective history, but it has no incoming timeline subject and no reviewed occurrence. Its cited forecast must not be attached to a project merely to manufacture operational scope; timeline-subject recovery for the study queue is therefore not applicable.`;
}

function expectedDecision(
  spec: GapSpec,
  eventsById: ReadonlyMap<string, MtaCanonicalRecord>,
  incomingByEvent: ReadonlyMap<string, readonly MtaCanonicalRecord[]>,
  row: QueueRow,
): OperationalCoverageAcceptedDecision {
  return parseOperationalCoverageAcceptedDecision(
    {
      schema_version: 1,
      decision_id: spec.decisionId,
      gap_id: spec.gapId,
      prior_verdict: "unreviewed",
      verdict: "not_applicable",
      reviewer: REVIEWER,
      decided_at: DECIDED_AT,
      rationale: rationale(spec),
      proposal_ids: [],
      evidence_refs: decisionEvidence(spec, eventsById, incomingByEvent, row),
      search_receipt_ids: [],
    },
    spec.decisionId,
  );
}

function writeOrVerifyDecisions(
  specs: readonly GapSpec[],
  eventsById: ReadonlyMap<string, MtaCanonicalRecord>,
  incomingByEvent: ReadonlyMap<string, readonly MtaCanonicalRecord[]>,
  rowsByGap: ReadonlyMap<string, QueueRow>,
  state: "pre" | "post",
  apply: boolean,
): {
  written: number;
  verified: number;
  pending: number;
  decisions: OperationalCoverageAcceptedDecision[];
} {
  if (apply) mkdirSync(decisionDir, { recursive: true });
  const decisions = specs.map((spec) => {
    const row = rowsByGap.get(spec.gapId);
    assert(row, `Missing row for ${spec.gapId}`);
    return expectedDecision(spec, eventsById, incomingByEvent, row);
  });
  let written = 0;
  let verified = 0;
  let pending = 0;
  for (const decision of decisions) {
    const path = join(decisionDir, `${decision.decision_id}.json`);
    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, "utf8")) as JsonValue;
      assert(
        stableJson(existing) === stableJson(decision as unknown as JsonValue),
        `${path} conflicts with the generated decision`,
      );
      verified += 1;
      continue;
    }
    assert(
      state === "pre",
      `${path} is missing after the queue reached post-adjudication state`,
    );
    if (apply) {
      writeFileSync(path, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
      written += 1;
    } else {
      pending += 1;
    }
  }
  return { written, verified, pending, decisions };
}

assert(
  eventSpecs.length === 32,
  `Expected 32 target events, found ${eventSpecs.length}`,
);
assert(
  new Set(eventSpecs.map((spec) => spec.eventId)).size === 32,
  "Target event ids are not unique",
);
assert(
  eventSpecs.filter((spec) => spec.contextMode === "incoming_relation")
    .length === 24,
  "Expected 24 four-gap events",
);
assert(
  eventSpecs.filter((spec) => spec.contextMode === "explicit_source_context")
    .length === 8,
  "Expected 8 timeline-subject events",
);
assert(
  gapSpecs.length === 104,
  `Expected 104 gap specs, found ${gapSpecs.length}`,
);
assert(
  new Set(gapSpecs.map((spec) => spec.gapId)).size === 104,
  "Target gap ids are not unique",
);
assert(
  new Set(gapSpecs.map((spec) => spec.decisionId)).size === 104,
  "Generated decision ids are not unique",
);
assert(
  !gapSpecs.some((spec) => spec.gapId === EXCLUDED_GAP_ID),
  "The queue-jump gap must remain excluded",
);

const records = readCanonicalRecordsFromJsonl();
const { eventsById, incomingByEvent } = assertCanonicalContext(records);
const targetEventIds = new Set(eventSpecs.map((spec) => spec.eventId));
assertNoOccurrences(targetEventIds);
const queue = readJsonl<QueueRow>(queuePath);
const { state, rowsByGap } = assertQueueInventory(queue);
const apply = process.argv.includes("--apply");
const verifyPost = process.argv.includes("--verify-post");
assert(
  !(apply && verifyPost),
  "Use --apply before refresh and --verify-post after refresh, not together",
);
if (verifyPost)
  assert(
    state === "post",
    "--verify-post requires a refreshed 488/1/487 coverage queue",
  );
const result = writeOrVerifyDecisions(
  gapSpecs,
  eventsById,
  incomingByEvent,
  rowsByGap,
  state,
  apply,
);

process.stdout.write(
  `${JSON.stringify(
    {
      mode: apply ? "apply" : verifyPost ? "verify_post" : "dry_run",
      state,
      target_event_count: eventSpecs.length,
      incoming_relation_event_count: eventSpecs.filter(
        (spec) => spec.contextMode === "incoming_relation",
      ).length,
      explicit_context_event_count: eventSpecs.filter(
        (spec) => spec.contextMode === "explicit_source_context",
      ).length,
      gap_count: result.decisions.length,
      excluded_gap_id: EXCLUDED_GAP_ID,
      written_count: result.written,
      verified_existing_count: result.verified,
      pending_count: result.pending,
      expected_pre_counts: { total: 488, open: 105, terminal: 383, ready: 0 },
      expected_post_refresh_counts: {
        total: 488,
        open: 1,
        terminal: 487,
        ready: 0,
      },
      refresh_required_after_apply: state === "pre" && apply,
      decision_ids: result.decisions.map((decision) => decision.decision_id),
    },
    null,
    2,
  )}\n`,
);
