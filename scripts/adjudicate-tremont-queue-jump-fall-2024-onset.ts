import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type { JsonValue } from "../packages/db/src/types.js";
import { loadOperationalAnchorReviewDecisions } from "../packages/pipeline/src/materialize/operational-anchor-review.js";
import { readCanonicalRecordsFromDbFile } from "../packages/pipeline/src/materialize/canonical-read.js";
import { loadOperationalOccurrenceIdentityRegistry } from "../packages/pipeline/src/materialize/operational-occurrence-identity.js";
import { loadOperationalOccurrenceAcceptedDecisions } from "../packages/pipeline/src/materialize/operational-occurrence-review.js";
import type { RouteAnchorRow } from "../packages/pipeline/src/materialize/route-anchors.js";
import {
  DEFAULT_OPERATIONAL_STUDY_WINDOW,
  parseOperationalCoverageAcceptedDecision,
  parseOperationalCoverageSearchReceipt,
  type OperationalCoverageAcceptedDecision,
  type OperationalCoverageSearchReceipt,
} from "../packages/pipeline/src/quality/operational-coverage.js";

const EVENT_ID = "event_queue-jump-implementation-fall2024";
const GAP_ID = "operational-coverage:e2a8d437c3dab6ad27820394";
const RECEIPT_ID = "tremont-queue-jump-fall-2024-exact-onset-search";
const DECISION_ID = "tremont-queue-jump-fall-2024-exact-onset-absent";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const EXISTING_RECEIPT_IDS = [
  "broadway-center-running-lane-exact-onset-search",
  "dekalb-lafayette-summer-2024-temp-lanes-exact-onset-search",
] as const;
const REQUIRED_SEARCH_SOURCE_IDS = [
  "2012_10_brt_webster_cac3_meeting_summary",
  "2012_11_sbs_webster_cac4_summary",
  "2013_03_sbs_webster_bx_cb5",
  "2014_03_20_brt_webste_cb5",
  "ace_routes_dataset_dictionary",
  "bus_lane_camera_report_2024",
  "busway_tremontavenue",
  "bx_cb5_projects_dec032019",
  "meeting_doc_113986",
  "meeting_doc_37081",
  "meeting_doc_98311",
  "mta_automated_camera_enforcement",
  "soundview_bus_priority_press_release_2021",
  "tremont_ave_bus_priority_cab4_mar2025",
  "tremont_ave_bus_priority_cb5_jun2024",
  "tremont_ave_bus_priority_cb5_mar2024",
  "tremont_ave_bus_priority_cb5_nov2024",
  "tremont_ave_bus_priority_cb6_feb2024",
  "tremont_ave_bus_priority_cb6_feb2025",
  "tremont_ave_bus_priority_cb6_jul2024",
  "tremont_ave_bus_priority_cb6_jun2024",
  "tremont_ave_bus_priority_cb6_nov2024",
  "tremont_ave_busway",
  "tremont_ave_busway_es",
] as const;

type CoverageManifest = {
  route_anchor_path: string;
};

type QueueRow = {
  gap_id: string;
  event_record_id: string;
  dimension: string;
  verdict: string;
  decision_ids: string[];
  required_search_source_ids: string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const args = process.argv.slice(2);
assert(
  args.length <= 1 && args.every((arg) => arg === "--apply"),
  "Usage: bun scripts/adjudicate-tremont-queue-jump-fall-2024-onset.ts [--apply]",
);
const apply = args.includes("--apply");

const manifestPath = join(repoRoot, "data", "quality", "operational-coverage", "manifest.json");
const manifest = readJson<CoverageManifest>(manifestPath);
assert(manifest.route_anchor_path.startsWith("data/exports/releases/"), "Coverage route-anchor pin changed");
const routeAnchors = readJsonl<RouteAnchorRow>(join(repoRoot, manifest.route_anchor_path)).sort((left, right) =>
  `${left.gtfs_route_id ?? ""}|${left.canonical_route_record_id ?? ""}`.localeCompare(
    `${right.gtfs_route_id ?? ""}|${right.canonical_route_record_id ?? ""}`,
  ),
);
const records = readCanonicalRecordsFromDbFile(join(repoRoot, "data", "canonical.db"));
assert(records, "Canonical database is missing or unreadable");
records.sort((left, right) => left.record_id.localeCompare(right.record_id));
const anchorReviewDecisions = loadOperationalAnchorReviewDecisions().sort((left, right) =>
  left.decision_id.localeCompare(right.decision_id),
);
const occurrenceReviewDecisions = loadOperationalOccurrenceAcceptedDecisions().sort((left, right) =>
  left.decision_id.localeCompare(right.decision_id),
);
const occurrenceIdentityRegistry = loadOperationalOccurrenceIdentityRegistry().sort((left, right) =>
  left.occurrence_id.localeCompare(right.occurrence_id),
);
const corpusFingerprint = sha256(stableJson({
  records,
  route_anchors: routeAnchors,
  anchor_review_decisions: anchorReviewDecisions,
  occurrence_review_decisions: occurrenceReviewDecisions,
  occurrence_identity_registry: occurrenceIdentityRegistry,
  study_window: DEFAULT_OPERATIONAL_STUDY_WINDOW,
} as unknown as JsonValue));

const queuePath = join(repoRoot, "data", "quality", "operational-coverage", "priority-queue.jsonl");
const queueRow = readJsonl<QueueRow>(queuePath).find((row) => row.gap_id === GAP_ID);
assert(queueRow, `Missing pinned date gap ${GAP_ID}`);
assert(queueRow.event_record_id === EVENT_ID && queueRow.dimension === "date_precision", "Pinned date gap identity changed");
assert(
  queueRow.required_search_source_ids.join("|") === REQUIRED_SEARCH_SOURCE_IDS.join("|"),
  "Pinned exact-date search source set changed",
);
assert(
  queueRow.verdict === "unreviewed" ||
    (queueRow.verdict === "absent_in_source" && queueRow.decision_ids.includes(DECISION_ID)),
  `Pinned date gap has incompatible verdict ${queueRow.verdict}`,
);

const exactOnsetQueries = [
  "Bx36 queue jump AND (exact installation date OR activation date)",
  "Grand Concourse Tremont queue jump AND (installed on OR activated on OR went into effect on)",
];
const searchReceipt = parseOperationalCoverageSearchReceipt({
  schema_version: 1,
  receipt_id: RECEIPT_ID,
  gap_id: GAP_ID,
  reviewer: REVIEWER,
  searched_at: "2026-07-13T21:10:00.000Z",
  rationale: "Searched every source required by the event gap, both duplicate November 2024 NYC DOT decks, the full captured artifact-tree registry, and the official NYC DOT/MTA web surfaces for a day- or month-level physical activation date. The November decks say only Fall 2024 and installed; earlier project materials are prospective, while later materials do not backfill an exact queue-jump onset. November 4 is the presentation/status-as-of date and was not inferred as activation.",
  corpus_fingerprint: corpusFingerprint,
  source_searches: REQUIRED_SEARCH_SOURCE_IDS.map((sourceId) => ({
    source_id: sourceId,
    queries: exactOnsetQueries,
    matching_block_ids: [],
  })),
  registry_search: {
    queries: [
      "Fall 2024 Bx36 queue jump signal installed",
      "Tremont Avenue Grand Concourse queue jump exact activation date",
    ],
    title_filters: ["Bx36", "Fall 2024", "Grand Concourse", "Tremont Avenue", "queue jump"],
    publisher_filters: ["Metropolitan Transportation Authority", "NYC DOT"],
    matched_source_ids: [
      "tremont_ave_bus_priority_cb5_nov2024",
      "tremont_ave_bus_priority_cb6_nov2024",
    ],
  },
}, RECEIPT_ID);

const decision = parseOperationalCoverageAcceptedDecision({
  schema_version: 1,
  decision_id: DECISION_ID,
  gap_id: GAP_ID,
  prior_verdict: "unreviewed",
  verdict: "absent_in_source",
  reviewer: REVIEWER,
  decided_at: "2026-07-13T21:15:00.000Z",
  rationale: "The exhaustive staged-corpus, captured-registry, and official-web search found no official statement of the Grand Concourse queue-jump signal's exact physical activation date. The official evidence proves Bx36 scope, the queue-jump treatment, delivered installation status, and only a Fall 2024 season. The event remains season-precision and its exact-onset gap is terminal; the November 4 presentation date is not an operational onset.",
  proposal_ids: [],
  evidence_refs: [],
  search_receipt_ids: [RECEIPT_ID],
}, DECISION_ID);

const receiptDir = join(repoRoot, "data", "operational-anchor-review", "ledger-decisions", "search-receipts");
const decisionDir = join(repoRoot, "data", "operational-anchor-review", "ledger-decisions", "decisions");
const receiptPath = join(receiptDir, `${RECEIPT_ID}.json`);
const decisionPath = join(decisionDir, `${DECISION_ID}.json`);

const refreshedExistingReceipts = EXISTING_RECEIPT_IDS.map((receiptId) => {
  const path = join(receiptDir, `${receiptId}.json`);
  const existing = readJson<OperationalCoverageSearchReceipt>(path);
  parseOperationalCoverageSearchReceipt(existing, receiptId);
  const rationale = receiptId === "broadway-center-running-lane-exact-onset-search"
    ? "Revalidated every persisted Broadway/Q70 source search and registry match against the current corpus fingerprint for retrospective language stating an exact physical activation date. The May presentation remains only a forecast, while later official sources establish delivered status by an as-of date without stating when the lane physically opened. Current corpus changes outside this event add no source-connected Broadway onset evidence."
    : "Revalidated every persisted DeKalb/Lafayette source search and registry match against the current corpus fingerprint for a day- or month-level physical lane activation date. The two official decks continue to state only Summer 2024; current corpus changes outside this event add no source-connected exact onset evidence, and G Train shuttle-service dates remain non-equivalent to lane activation. August 12 was not inferred as the physical lane activation date.";
  const refreshed = parseOperationalCoverageSearchReceipt({
    ...existing,
    rationale,
    corpus_fingerprint: corpusFingerprint,
  }, receiptId);
  return [path, refreshed] as const;
});

const outputs: Array<readonly [string, OperationalCoverageSearchReceipt | OperationalCoverageAcceptedDecision]> = [
  ...refreshedExistingReceipts,
  [receiptPath, searchReceipt],
  [decisionPath, decision],
];
const pending = outputs.filter(([path, value]) => !existsSync(path) || readFileSync(path, "utf8") !== json(value));
if (apply) {
  for (const [path, value] of pending) writeFileSync(path, json(value), "utf8");
}

process.stdout.write(`${JSON.stringify({
  mode: apply ? "apply" : "dry_run",
  event_id: EVENT_ID,
  gap_id: GAP_ID,
  corpus_fingerprint: corpusFingerprint,
  receipt_id: RECEIPT_ID,
  decision_id: DECISION_ID,
  refreshed_existing_receipt_count: refreshedExistingReceipts.length,
  output_count: outputs.length,
  pending_count: apply ? 0 : pending.length,
  written_count: apply ? pending.length : 0,
  preserved_date_text: "Fall 2024",
  preserved_date_normalized: "2024-fall",
  preserved_date_precision: "season",
}, null, 2)}\n`);
