import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import type { JsonValue } from "../packages/db/src/types.js";
import {
  loadOperationalAnchorReviewDecisions,
} from "../packages/pipeline/src/materialize/operational-anchor-review.js";
import { readCanonicalRecordsFromDbFile } from "../packages/pipeline/src/materialize/canonical-read.js";
import {
  loadOperationalOccurrenceIdentityRegistry,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity.js";
import {
  loadOperationalOccurrenceAcceptedDecisions,
} from "../packages/pipeline/src/materialize/operational-occurrence-review.js";
import type { RouteAnchorRow } from "../packages/pipeline/src/materialize/route-anchors.js";
import {
  DEFAULT_OPERATIONAL_STUDY_WINDOW,
  parseOperationalCoverageAcceptedDecision,
  parseOperationalCoverageSearchReceipt,
  type OperationalCoverageAcceptedDecision,
  type OperationalCoverageSearchReceipt,
} from "../packages/pipeline/src/quality/operational-coverage.js";

const EVENT_ID = "event_dekalb-lafayette-summer2024-temp-lanes";
const GAP_ID = "operational-coverage:c6cc3949e83530c9121f0b38";
const RECEIPT_ID = "dekalb-lafayette-summer-2024-temp-lanes-exact-onset-search";
const DECISION_ID = "dekalb-lafayette-summer-2024-temp-lanes-exact-onset-absent";
const BROADWAY_RECEIPT_ID = "broadway-center-running-lane-exact-onset-search";
const REVIEWER = "codex-corpus-completion-2026-07-13";
const REQUIRED_SEARCH_SOURCE_IDS = [
  "better_buses",
  "brooklyn_bus_network_draft_plan_without_route_profiles",
  "dekalb_lafayette_cb2_dec2024",
  "dekalb_lafayette_cb3_dec2024",
  "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024",
  "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024",
  "grand_ave_metropolitan_ave_queens_blvd_nov2024",
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
const persistedRequiredSearchSourceIds = queueRow.required_search_source_ids.join("|");
assert(
  persistedRequiredSearchSourceIds === REQUIRED_SEARCH_SOURCE_IDS.join("|") ||
    persistedRequiredSearchSourceIds === ["dekalb_lafayette_cb2_dec2024", "dekalb_lafayette_cb3_dec2024"].join("|"),
  "Pinned exact-date search source set changed",
);
assert(
  queueRow.verdict === "unreviewed" ||
    (queueRow.verdict === "absent_in_source" && queueRow.decision_ids.includes(DECISION_ID)),
  `Pinned date gap has incompatible verdict ${queueRow.verdict}`,
);

const exactOnsetQueries = [
  "temporary bus lanes AND (opened on OR activated on OR went into effect on)",
  "DeKalb Lafayette B38 AND (exact installation date OR lane activation date)",
];
const searchReceipt = parseOperationalCoverageSearchReceipt({
  schema_version: 1,
  receipt_id: RECEIPT_ID,
  gap_id: GAP_ID,
  reviewer: REVIEWER,
  searched_at: "2026-07-13T14:20:00.000Z",
  rationale: "Searched every source required by the event gap, both duplicate official NYC DOT decks, and the full captured artifact-tree registry for a day- or month-level physical activation date. The captured project corpus contains only the two already-staged decks, which state Summer 2024. Separate official MTA G Train shutdown pages state shuttle-service dates but do not explicitly date physical lane activation; they were not staged and August 12 was not inferred as the lane onset.",
  corpus_fingerprint: corpusFingerprint,
  source_searches: REQUIRED_SEARCH_SOURCE_IDS.map((sourceId) => ({
    source_id: sourceId,
    queries: exactOnsetQueries,
    matching_block_ids: [],
  })),
  registry_search: {
    queries: [
      "DeKalb Lafayette temporary bus lanes B38 exact opening activation date",
      "Summer 2024 G Train shutdown temporary lane installation date",
    ],
    title_filters: ["DeKalb", "Lafayette", "B38", "G Train shutdown"],
    publisher_filters: ["NYC DOT", "Metropolitan Transportation Authority"],
    matched_source_ids: [
      "dekalb_lafayette_cb2_dec2024",
      "dekalb_lafayette_cb3_dec2024",
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
  decided_at: "2026-07-13T14:25:00.000Z",
  rationale: "The bounded staged-corpus and full captured-artifact-tree search found no official statement of the temporary lanes' exact physical activation date. The official decks support only Summer 2024. G Train shuttle service dates, including August 12, are not lane-onset evidence, so the event remains season-precision and the exact-date gap is terminal.",
  proposal_ids: [],
  evidence_refs: [],
  search_receipt_ids: [RECEIPT_ID],
}, DECISION_ID);

const receiptDir = join(repoRoot, "data", "operational-anchor-review", "ledger-decisions", "search-receipts");
const decisionDir = join(repoRoot, "data", "operational-anchor-review", "ledger-decisions", "decisions");
const receiptPath = join(receiptDir, `${RECEIPT_ID}.json`);
const decisionPath = join(decisionDir, `${DECISION_ID}.json`);
const broadwayReceiptPath = join(receiptDir, `${BROADWAY_RECEIPT_ID}.json`);
const broadwayReceipt = readJson<OperationalCoverageSearchReceipt>(broadwayReceiptPath);
parseOperationalCoverageSearchReceipt(broadwayReceipt, BROADWAY_RECEIPT_ID);
const refreshedBroadwayReceipt: OperationalCoverageSearchReceipt = {
  ...broadwayReceipt,
  rationale: "Revalidated every source connected to the Broadway/Q70 occurrence and the staged source registry against the current corpus fingerprint for retrospective language that states an exact physical activation date. The May presentation supplies only a forecast, while the later official sources establish delivered status by an as-of date without stating when the lane physically opened. The DeKalb/Lafayette, March express, and B12 graph additions are unrelated to Broadway and do not change the registry matches.",
  corpus_fingerprint: corpusFingerprint,
};

const outputs: Array<[string, OperationalCoverageSearchReceipt | OperationalCoverageAcceptedDecision]> = [
  [broadwayReceiptPath, refreshedBroadwayReceipt],
  [receiptPath, searchReceipt],
  [decisionPath, decision],
];
const pending = outputs.filter(([path, value]) => !existsSync(path) || readFileSync(path, "utf8") !== json(value));
const apply = process.argv.includes("--apply");
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
  output_count: outputs.length,
  pending_count: apply ? 0 : pending.length,
  written_count: apply ? pending.length : 0,
  preserved_date_normalized: "2024-summer",
  preserved_date_precision: "season",
}, null, 2)}\n`);
