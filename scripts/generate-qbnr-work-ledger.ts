import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { parseGtfsTable } from "../packages/db/src/import-gtfs";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, StagedSourceBlock } from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import { loadOperationalOccurrenceAcceptedDecisions } from "../packages/pipeline/src/materialize/operational-occurrence-review";
import {
  computeRouteAnchors,
  readRouteAnchorOverrides,
  type GtfsRoute,
} from "../packages/pipeline/src/materialize/route-anchors";
import {
  summarizeQbnrWorkLedger,
  type QbnrWorkStatus,
} from "../packages/pipeline/src/records/qbnr-work-ledger";
import {
  applyQbnrTerminalServiceEndDecisions,
  loadQbnrTerminalServiceEndDecisionStore,
} from "../packages/pipeline/src/records/qbnr-terminal-service-end-decisions";

const SOURCE_ID = "mta_queens_bus_network_redesign_service_changes";
const OUTPUT_DIR = join(
  repoRoot,
  "data",
  "operational-anchor-review",
  "work-orders",
  "qbnr-2025",
);

type EventKind = "no_change" | "route_rename" | "service_change" | "service_end" | "service_start";
type SourceRow = {
  block: StagedSourceBlock;
  route_label: string;
  event_text: string;
  content_cells: string[];
  event_kind: EventKind;
  effective_date: string | null;
};

type WorkUnit = {
  schema_version: 1;
  unit_id: string;
  source_id: typeof SOURCE_ID;
  source_block_ids: string[];
  source_block_sha256s: string[];
  source_route_labels: string[];
  route_label: string;
  event_kind: EventKind;
  effective_date: string | null;
  work_status: QbnrWorkStatus;
  canonical_route_record_id: string | null;
  canonical_event_record_id?: string | undefined;
  terminal_service_end_decision_id?: string | undefined;
  identity_exception_record_id: string | null;
  gtfs_route_id: string | null;
  occurrence_id: string | null;
  notes: string[];
};

const monthNumbers: Record<string, string> = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12",
};

function parseDate(text: string): string {
  const match = text.match(/\b([A-Z][a-z]+) (\d{1,2}), (20\d{2})\b/u);
  if (!match) throw new Error(`QBNR event text has no exact date: ${text}`);
  const month = monthNumbers[match[1]!];
  if (!month) throw new Error(`QBNR event text has unsupported month: ${text}`);
  return `${match[3]}-${month}-${match[2]!.padStart(2, "0")}`;
}

function eventKind(eventText: string): { event_kind: EventKind; effective_date: string | null } {
  if (/^There are no changes to the /u.test(eventText)) {
    return { event_kind: "no_change", effective_date: null };
  }
  const effectiveDate = parseDate(eventText);
  if (/^Changes to the .+ took effect /u.test(eventText)) {
    return { event_kind: "service_change", effective_date: effectiveDate };
  }
  if (/ service started /u.test(eventText)) {
    return { event_kind: "service_start", effective_date: effectiveDate };
  }
  if (/ service ended /u.test(eventText)) {
    return { event_kind: "service_end", effective_date: effectiveDate };
  }
  if (/^The .+ became the .+ on /u.test(eventText)) {
    return { event_kind: "route_rename", effective_date: effectiveDate };
  }
  throw new Error(`Unsupported QBNR event grammar: ${eventText}`);
}

function sourceRows(): SourceRow[] {
  const path = join(repoRoot, "raw", "sources", SOURCE_ID, "blocks.jsonl");
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as StagedSourceBlock)
    .filter((block) => /^p001_b\d{4}$/u.test(block.block_id) && block.reading_order >= 3 && block.reading_order <= 135)
    .map((block) => {
      if (!block.raw_text || !block.raw_text_sha256) {
        throw new Error(`${SOURCE_ID}#${block.block_id} is missing raw evidence text/hash`);
      }
      const cells = block.raw_text.split(" | ");
      if (cells.length < 3 || !cells[0] || !cells[1] || !cells[2]) {
        throw new Error(`${SOURCE_ID}#${block.block_id} is not a route-table row`);
      }
      return {
        block,
        route_label: cells[0],
        event_text: cells[1],
        content_cells: cells.slice(2),
        ...eventKind(cells[1]),
      };
    })
    .sort((left, right) => left.block.reading_order - right.block.reading_order);
}

function rowGroups(rows: readonly SourceRow[]): SourceRow[][] {
  const groups = new Map<string, SourceRow[]>();
  for (const row of rows) {
    const key = row.event_kind === "route_rename"
      ? `rename\0${row.event_text}\0${row.content_cells.join("\0")}`
      : row.block.block_id;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (left, right) => left[0]!.block.reading_order - right[0]!.block.reading_order,
  );
}

function currentRouteLabel(group: readonly SourceRow[]): string {
  const first = group[0]!;
  if (first.event_kind !== "route_rename") return first.route_label;
  if (group.length !== 2) throw new Error(`Rename event must have exactly two source rows: ${first.event_text}`);
  const match = first.event_text.match(/^The ([A-Z0-9]+) became the ([A-Z0-9]+) on /u);
  if (!match) throw new Error(`Unsupported QBNR rename grammar: ${first.event_text}`);
  const sourceLabels = new Set(group.map((row) => row.route_label));
  if (!sourceLabels.has(match[1]!) || !sourceLabels.has(match[2]!)) {
    throw new Error(`Rename row labels do not match event text: ${first.event_text}`);
  }
  if (new Set(group.map((row) => `${row.event_text}\0${row.content_cells.join("\0")}`)).size !== 1) {
    throw new Error(`Rename pair cells differ: ${first.event_text}`);
  }
  return match[2]!;
}

function normalizedRouteLabel(value: string): string {
  return value.trim().toUpperCase();
}

function gtfsRoutes(): GtfsRoute[] {
  const rows = parseGtfsTable(readFileSync(join(repoRoot, "data", "reference", "gtfs", "routes.txt"), "utf8"));
  return rows.map((row) => ({
    route_id: row.route_id!,
    short_name: row.route_short_name || null,
    long_name: row.route_long_name || null,
    agency_id: row.agency_id || null,
  }));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

const records = readCanonicalRecordsFromJsonl();
const gtfs = gtfsRoutes();
const gtfsById = new Map(gtfs.map((route) => [route.route_id, route]));
const gtfsByShortName = new Map(
  gtfs
    .filter((route) => route.short_name)
    .map((route) => [normalizedRouteLabel(route.short_name!), route]),
);
const routeAnchors = new Map(
  computeRouteAnchors(records, gtfs, readRouteAnchorOverrides())
    .filter((row) => row.gtfs_route_id)
    .map((row) => [row.gtfs_route_id!, row]),
);

const q52Exception = {
  route_label: "Q52",
  gtfs_route_id: "Q52+",
  candidate_record_id: "route_q52-sbs-queens",
};

const occurrenceByRouteLabel = new Map<string, string>();
for (const decision of loadOperationalOccurrenceAcceptedDecisions()) {
  const isQbnr = decision.resolved_onset.evidence_bindings.some((binding) => binding.source_id === SOURCE_ID);
  if (!isQbnr) continue;
  for (const route of decision.routes) {
    const shortName = gtfsById.get(route.gtfs_route_id)?.short_name ?? route.gtfs_route_id;
    const label = normalizedRouteLabel(
      route.gtfs_route_id === q52Exception.gtfs_route_id ? q52Exception.route_label : shortName,
    );
    const existing = occurrenceByRouteLabel.get(label);
    if (existing && existing !== decision.occurrence_id) {
      throw new Error(`Multiple QBNR occurrences already resolve ${label}`);
    }
    occurrenceByRouteLabel.set(label, decision.occurrence_id);
  }
}

const incompleteOccurrenceReasons: Record<string, string> = {};

const generatedUnits: WorkUnit[] = rowGroups(sourceRows()).map((group) => {
  const first = group[0]!;
  const routeLabel = currentRouteLabel(group);
  const directGtfs = gtfsByShortName.get(normalizedRouteLabel(routeLabel));
  const identityException = routeLabel === q52Exception.route_label
    ? q52Exception
    : undefined;
  const gtfsRouteId = directGtfs?.route_id ?? identityException?.gtfs_route_id ?? null;
  const anchor = gtfsRouteId ? routeAnchors.get(gtfsRouteId) : undefined;
  const occurrenceId = occurrenceByRouteLabel.get(normalizedRouteLabel(routeLabel)) ?? null;
  let workStatus: QbnrWorkStatus;
  const notes: string[] = [];
  if (first.event_kind === "no_change") {
    workStatus = "terminal_no_change";
    notes.push("Official source explicitly states that the route has no redesign change.");
  } else if (occurrenceId && incompleteOccurrenceReasons[routeLabel]) {
    workStatus = "partial_occurrence_needs_enrichment";
    notes.push(incompleteOccurrenceReasons[routeLabel]!);
  } else if (occurrenceId) {
    workStatus = "completed_occurrence";
  } else if (identityException) {
    workStatus = "pending_identity_exception";
    notes.push("Q52-SBS GTFS/canonical spelling needs a reviewed anchor resolution before projection.");
  } else if (!directGtfs) {
    if (first.event_kind !== "service_end") {
      throw new Error(`Current-route QBNR unit has no exact GTFS short-name match: ${routeLabel}`);
    }
    workStatus = "pending_canonical_then_terminal";
    notes.push("Ended route has no current GTFS route; curate the source row, then record a terminal study disposition.");
  } else if (anchor?.canonical_route_record_id) {
    workStatus = "pending_existing_anchor";
  } else {
    workStatus = "pending_create_route";
  }
  if (first.event_kind === "route_rename") {
    notes.push(`Duplicate old/new source rows collapse to successor route ${routeLabel}; predecessor labels remain evidence only.`);
  }
  const datePart = first.effective_date ?? "no-change";
  return {
    schema_version: 1,
    unit_id: `${slug(routeLabel)}-${datePart}`,
    source_id: SOURCE_ID,
    source_block_ids: group.map((row) => row.block.block_id),
    source_block_sha256s: group.map((row) => row.block.raw_text_sha256!),
    source_route_labels: group.map((row) => row.route_label),
    route_label: routeLabel,
    event_kind: first.event_kind,
    effective_date: first.effective_date,
    work_status: workStatus,
    canonical_route_record_id: anchor?.canonical_route_record_id ?? null,
    identity_exception_record_id: identityException?.candidate_record_id ?? null,
    gtfs_route_id: gtfsRouteId,
    occurrence_id: occurrenceId,
    notes,
  };
});

const terminalServiceEndDecisionStore = loadQbnrTerminalServiceEndDecisionStore();
const units = applyQbnrTerminalServiceEndDecisions(
  generatedUnits,
  terminalServiceEndDecisionStore.decisions,
  records,
);

const ledgerBytes = units.map((unit) => stableJson(unit as unknown as JsonValue)).join("\n") + "\n";
const accounting = summarizeQbnrWorkLedger(units);
const summary = {
  schema_version: 1,
  source_id: SOURCE_ID,
  source_row_count: sourceRows().length,
  deduplicated_unit_count: units.length,
  ...accounting,
  ledger_sha256: createHash("sha256").update(ledgerBytes).digest("hex"),
};

if (
  summary.source_row_count !== 133 ||
  summary.deduplicated_unit_count !== 130 ||
  summary.actionable_change_unit_count !== 127 ||
  summary.explicit_no_change_unit_count !== 3
) {
  throw new Error(`QBNR source denominator drifted: ${JSON.stringify(summary)}`);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, "route-units.jsonl"), ledgerBytes, "utf8");
writeFileSync(join(OUTPUT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`QBNR work ledger: ${units.length} units (${summary.remaining_change_unit_count} change units remaining)`);
