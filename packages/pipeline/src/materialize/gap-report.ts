// D1 / S2.8 gap-report (docs/step-2-implementation-plan.md §S2.8): the queue that proves what we
// don't know. One command consuming every prior phase — generator-emitted views + the S2.4 dangling
// feed — into a single classified gaps.jsonl + per-class summary. This report IS the D2 work order;
// building agents against it is out of scope here. Read-only over the live DB; deterministic output.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { repoRoot } from "@mta-wiki/core/paths";
import { canonicalDbPath, openCanonicalDb, readCanonicalRecordsFromDb } from "@mta-wiki/db/canonical-db";
import { danglingReferences } from "@mta-wiki/pipeline/records/derived-relations";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

export type GapSeverity = "high" | "medium" | "low";

export type GapRow = {
  gap_class: string;
  severity: GapSeverity;
  record_ids: string[];
  detail: string;
  resolving_evidence: string;
};

function rows<T>(db: Database, sql: string, ...params: unknown[]): T[] {
  return db.query(sql).all(...(params as never[])) as T[];
}

/** Every gap class, deterministically ordered. Each row names the records involved, a severity, and
 *  what evidence would resolve it. */
export function collectGaps(db: Database): GapRow[] {
  const gaps: GapRow[] = [];
  const push = (gap: GapRow) => gaps.push(gap);

  // orphan_record (S2.4 residue) — metric_claim/claim weigh heaviest.
  for (const r of rows<{ record_id: string; record_kind: string }>(db, "SELECT record_id, record_kind FROM orphan_records ORDER BY record_id")) {
    push({
      gap_class: "orphan_record",
      severity: r.record_kind === "metric_claim" || r.record_kind === "claim" ? "high" : "medium",
      record_ids: [r.record_id],
      detail: `${r.record_kind} is not an endpoint of any relation`,
      resolving_evidence: "a derived or reviewed relation to a canonical route/project/treatment/entity",
    });
  }

  // source_undated (S2.2) — sources missing a normalized publication date.
  for (const r of rows<{ record_id: string; source_id: string }>(db, "SELECT s.record_id, r.primary_source_id source_id FROM sources s JOIN records r ON r.record_id = s.record_id WHERE s.published_date_normalized IS NULL ORDER BY s.record_id")) {
    push({ gap_class: "source_undated", severity: "medium", record_ids: [r.record_id], detail: `source ${r.source_id} has no normalized publication date`, resolving_evidence: "a reviewed date in data/source-date-overrides.json or staged metadata documentDate" });
  }

  // date_unnormalized (S2.6) — events with a date literal that did not parse.
  for (const r of rows<{ record_id: string }>(db, "SELECT record_id FROM date_unnormalized ORDER BY record_id")) {
    push({ gap_class: "date_unnormalized", severity: "low", record_ids: [r.record_id], detail: "event carries a date literal that failed to normalize", resolving_evidence: "a normalizer-parseable date or a reviewed correction" });
  }

  // registry_uncovered (S2.5) — both coverage directions (empty until a GTFS feed is staged).
  for (const r of rows<{ route_id: string }>(db, "SELECT route_id FROM gtfs_routes_uncovered ORDER BY route_id")) {
    push({ gap_class: "registry_uncovered", severity: "low", record_ids: [], detail: `GTFS route ${r.route_id} has no canonical route record`, resolving_evidence: "ingest a source mentioning the route, or confirm it is out of scope" });
  }
  for (const r of rows<{ record_id: string; route_id: string }>(db, "SELECT record_id, route_id FROM canonical_routes_uncovered ORDER BY record_id")) {
    push({ gap_class: "registry_uncovered", severity: "low", record_ids: [r.record_id], detail: `canonical route ${r.route_id} matches no GTFS route (historical/renamed/error?)`, resolving_evidence: "a GTFS match or a reviewed historical-route note" });
  }

  // single_source_fact (S2.7) — substantive facts resting on a single source.
  for (const r of rows<{ record_id: string; record_kind: string }>(db, "SELECT record_id, record_kind FROM corroboration WHERE source_count = 1 AND record_kind IN ('metric_claim','claim','event') ORDER BY record_id")) {
    push({ gap_class: "single_source_fact", severity: "low", record_ids: [r.record_id], detail: `${r.record_kind} is attested by a single source`, resolving_evidence: "an independent corroborating source" });
  }

  // value_conflict (existing payload_value_conflicts) — a record whose merged sources disagree.
  for (const r of rows<{ record_id: string; fields: string }>(db, "SELECT record_id, GROUP_CONCAT(DISTINCT field) fields FROM payload_value_conflicts GROUP BY record_id ORDER BY record_id")) {
    push({ gap_class: "value_conflict", severity: "medium", record_ids: [r.record_id], detail: `sources disagree on field(s): ${r.fields}`, resolving_evidence: "a canonicalizer decision selecting the authoritative value" });
  }

  // contradiction_candidate (S2.6 status-fold + S2.7 metric) — a credible phase dated before an
  // earlier phase, or comparable metrics spanning multiple sources (potential value disagreement).
  for (const r of rows<{ subject_record_id: string }>(db,
    `SELECT DISTINCT a.subject_record_id FROM lifecycle_entries a JOIN lifecycle_entries b ON a.subject_record_id = b.subject_record_id
     WHERE a.lifecycle_phase = 'completed' AND b.lifecycle_phase = 'construction'
       AND a.date_normalized IS NOT NULL AND b.date_normalized IS NOT NULL AND a.date_normalized < b.date_normalized
     ORDER BY a.subject_record_id`)) {
    push({ gap_class: "contradiction_candidate", severity: "high", record_ids: [r.subject_record_id], detail: "a 'completed' phase is dated before a 'construction' phase", resolving_evidence: "a reviewed phase/date correction" });
  }

  // dangling_reference (S2.4) — a relation-context label that did not resolve to an edge.
  for (const d of danglingReferences(readCanonicalRecordsFromDb(db))) {
    push({
      gap_class: "dangling_reference",
      severity: d.reason === "ambiguous" ? "medium" : "low",
      record_ids: [d.origin_record_id, ...d.candidate_ids],
      detail: `${d.origin_kind}.${d.field} "${d.value}" → ${d.relation_kind} is ${d.reason}${d.candidate_ids.length ? ` (${d.candidate_ids.length} candidates)` : ""}`,
      resolving_evidence: d.reason === "ambiguous" ? "a canonicalizer dedup/disambiguation of the candidate records" : "a canonical endpoint for the referenced label",
    });
  }

  // unresolved_source_gap (existing source_gap records).
  for (const r of rows<{ record_id: string }>(db, "SELECT record_id FROM records WHERE record_kind = 'source_gap' ORDER BY record_id")) {
    push({ gap_class: "unresolved_source_gap", severity: "low", record_ids: [r.record_id], detail: "a source-flagged caveat with no resolving evidence", resolving_evidence: "a source-backed resolution decision" });
  }

  // lifecycle_unanchored (C6 checker) — a timeline event with no normalized date can't be placed.
  for (const r of rows<{ event_record_id: string }>(db, "SELECT DISTINCT event_record_id FROM lifecycle_entries WHERE date_normalized IS NULL ORDER BY event_record_id")) {
    push({ gap_class: "lifecycle_unanchored", severity: "low", record_ids: [r.event_record_id], detail: "lifecycle event has no normalized date", resolving_evidence: "a parseable event date" });
  }

  // lifecycle_incomplete — a subject with timeline events but no credible (non-other) resolved phase.
  for (const r of rows<{ subject_record_id: string }>(db,
    `SELECT DISTINCT le.subject_record_id FROM lifecycle_entries le
     LEFT JOIN resolved_status rs ON rs.subject_record_id = le.subject_record_id
     WHERE rs.subject_record_id IS NULL ORDER BY le.subject_record_id`)) {
    push({ gap_class: "lifecycle_incomplete", severity: "low", record_ids: [r.subject_record_id], detail: "subject has timeline events but no credible lifecycle phase", resolving_evidence: "a phase-bearing event (proposed/…/completed)" });
  }

  // treatment_gap — a treatment proposed/deferred/excluded with no delivered assertion on any edge.
  for (const r of rows<{ object_id: string }>(db,
    `SELECT DISTINCT rel.object_id FROM relations rel JOIN records o ON o.record_id = rel.object_id AND o.record_kind = 'treatment_component'
     WHERE rel.assertion_status IN ('proposed','deferred','excluded')
       AND rel.object_id NOT IN (SELECT object_id FROM relations WHERE assertion_status = 'delivered')
     ORDER BY rel.object_id`)) {
    push({ gap_class: "treatment_gap", severity: "medium", record_ids: [r.object_id], detail: "treatment is proposed/deferred/excluded with no delivered assertion", resolving_evidence: "a monitoring source confirming delivery or permanent exclusion" });
  }

  return gaps;
}

export type GapReportResult = { dir: string; total: number; by_class: Record<string, number> };

export function generateGapReport(timestamp: string): GapReportResult {
  const db = openCanonicalDb(canonicalDbPath(), { readonly: true });
  try {
    const gaps = collectGaps(db);
    const byClass: Record<string, number> = {};
    for (const gap of gaps) byClass[gap.gap_class] = (byClass[gap.gap_class] ?? 0) + 1;

    const dir = join(repoRoot, "data", "gap-report", timestamp);
    mkdirSync(dir, { recursive: true });
    const ordered = [...gaps].sort((a, b) => a.gap_class.localeCompare(b.gap_class) || (a.record_ids[0] ?? "").localeCompare(b.record_ids[0] ?? "") || a.detail.localeCompare(b.detail));
    writeFileSync(join(dir, "gaps.jsonl"), ordered.map((g) => stableJson(g as unknown as JsonValue)).join("\n") + (ordered.length ? "\n" : ""), "utf8");
    const summary = { generated_at: timestamp, total: gaps.length, by_class: Object.fromEntries(Object.entries(byClass).sort(([a], [b]) => a.localeCompare(b))) };
    writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    return { dir, total: gaps.length, by_class: summary.by_class };
  } finally {
    db.close();
  }
}

/** Per-class counts for pipeline-report (wave-over-wave trends are one diff). */
export function gapCountsByClass(db: Database): Record<string, number> {
  const byClass: Record<string, number> = {};
  for (const gap of collectGaps(db)) byClass[gap.gap_class] = (byClass[gap.gap_class] ?? 0) + 1;
  return byClass;
}
