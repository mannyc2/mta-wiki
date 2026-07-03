// S2.2 / C2.6 — source publication-date backfill (docs/step-2-implementation-plan.md §S2.2).
//
// A materialize-time fold over source records. S2.1's normalizer already promotes
// published_date_normalized from the submission payload (publication_date/date/…); this second pass
// fills the remainder from inputs the normalizer cannot see — the immutable staged source metadata
// and a reviewed-override file — without ever writing back to the submission journals (the
// pure-function invariant of §2 decision 4; raw/sources/ is a legitimate materialize input per
// decision 6).
//
// Precedence (highest first):
//   1. reviewed override   — data/source-date-overrides.json (a human-reviewed correction; wins even
//                            over a payload date, so a wrong payload date can be corrected here).
//   2. payload date        — already set by the S2.1 normalizer (left untouched).
//   3. staged metadata.json `documentDate`.
//   4. filename YYMMDD_ prefix on the source id.
// Anything still unresolved is the `source_undated` gap (S2.8). The fix for the residue is a reviewed
// override, never a looser date heuristic (the "Backfill temptation" risk in the plan).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { normalizeDateText } from "@mta-wiki/pipeline/ontology/normalizers";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";

export type SourceDateProvenance = "reviewed_override" | "staged_metadata" | "filename_pattern";

export type SourceDateFold = { normalized_date: string; precision: string; provenance: SourceDateProvenance };

export type SourceDateOverride = { date: string; precision?: string; note?: string; reviewed_at?: string };

export function sourceDateOverridesPath(): string {
  return join(repoRoot, "data", "source-date-overrides.json");
}

/** Read the reviewed-correction file. Shape: { overrides: { <source_id>: { date, precision?, note?,
 *  reviewed_at? } } }. Absent/unreadable file → no overrides (graceful; tests need no fixture). */
export function readSourceDateOverrides(path: string = sourceDateOverridesPath()): Record<string, SourceDateOverride> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { overrides?: Record<string, SourceDateOverride> };
    const overrides = parsed.overrides;
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return {};
    const result: Record<string, SourceDateOverride> = {};
    for (const [sourceId, value] of Object.entries(overrides)) {
      if (value && typeof value === "object" && !Array.isArray(value) && typeof value.date === "string" && value.date.trim()) {
        result[sourceId] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** A YYMMDD_ (or YYMMDD-) date prefix on a source id, e.g. `100503_brt_…` → 2010-05-03. Trusted only
 *  when it is a plausible 21st-century calendar date (month 1-12, day 1-31, year ≤ 2030). */
export function dateFromSourceIdPrefix(sourceId: string): SourceDateFold | undefined {
  const match = /^(\d{2})(\d{2})(\d{2})[_-]/u.exec(sourceId);
  if (!match) return undefined;
  const [, yy, mm, dd] = match;
  const month = Number(mm);
  const day = Number(dd);
  const year = 2000 + Number(yy);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year > 2030) return undefined;
  return { normalized_date: `${year}-${mm}-${dd}`, precision: "day", provenance: "filename_pattern" };
}

/** documentDate from the staged metadata, then the filename prefix. Reads immutable staged artifacts
 *  only; never the submission journals. */
export function sourceDateFromStaged(sourceId: string): SourceDateFold | undefined {
  const metaPath = join(repoRoot, "raw", "sources", sourceId, "metadata.json");
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { documentDate?: unknown };
      if (typeof meta.documentDate === "string" && meta.documentDate.trim()) {
        const normalized = normalizeDateText(meta.documentDate);
        if (typeof normalized.normalized_date === "string") {
          return { normalized_date: normalized.normalized_date, precision: String(normalized.precision), provenance: "staged_metadata" };
        }
      }
    } catch {
      // fall through to the filename prefix
    }
  }
  return dateFromSourceIdPrefix(sourceId);
}

/** Resolve the published date for one source id, applying the precedence above. Returns undefined
 *  when the payload date already won (caller leaves it) and there is no override. */
function resolveSourceDate(sourceId: string, payload: JsonObject, overrides: Record<string, SourceDateOverride>): SourceDateFold | undefined {
  const override = overrides[sourceId];
  if (override) {
    const normalized = normalizeDateText(override.date);
    const normalizedDate = typeof normalized.normalized_date === "string" ? normalized.normalized_date : override.date.trim();
    const precision = override.precision ?? String(normalized.precision);
    return { normalized_date: normalizedDate, precision, provenance: "reviewed_override" };
  }
  if (typeof payload.published_date_normalized === "string") return undefined; // S2.1 payload pass won
  return sourceDateFromStaged(sourceId);
}

/** Fold staged/override dates into source records in place. Idempotent and deterministic over the
 *  immutable staged inputs, so a rebuild-from-DB reproduces the same payloads. Overrides are read
 *  from disk by default; injectable for tests. */
export function withSourceDateBackfill(
  records: MtaCanonicalRecord[],
  overrides: Record<string, SourceDateOverride> = readSourceDateOverrides(),
): MtaCanonicalRecord[] {
  for (const record of records) {
    if (record.record_kind !== "source") continue;
    const fold = resolveSourceDate(record.source_id, record.payload, overrides);
    if (!fold) continue;
    record.payload = {
      ...record.payload,
      published_date_normalized: fold.normalized_date,
      published_date_precision: fold.precision,
      published_date_provenance: fold.provenance,
    };
  }
  return records;
}
