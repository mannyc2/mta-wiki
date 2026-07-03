// C1 / S2.5 — GTFS reference registry import + load (docs/step-2-implementation-plan.md §S2.5).
//
// `importGtfs` stages the official MTA static bus GTFS (routes.txt + agency.txt) under
// data/reference/gtfs/ with a journaled manifest (feed date, file sha256s, row counts) — a small
// tracked reference artifact. `loadGtfsRefTables` fills ref_gtfs_routes + ref_agencies from the
// staged feed at materialize time, deterministically (same feed → byte-identical tables).
// These are reference rows, clearly segregated from canonical records (decision: never canonical).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { repoRoot } from "@mta-wiki/core/paths";
import { sha256 } from "./stable-json.js";

export function gtfsStageDir(): string {
  return join(repoRoot, "data", "reference", "gtfs");
}

export type GtfsManifest = {
  feed_date: string;
  imported_from: string;
  files: Record<string, { sha256: string; rows: number }>;
};

/** Minimal RFC-4180-ish CSV parser (quoted fields, doubled quotes, CRLF) — enough for GTFS text. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0]!.trim().length > 0));
}

/** Parse a GTFS CSV into header-keyed records. */
export function parseGtfsTable(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim().replace(/^﻿/u, ""));
  return rows.slice(1).map((cells) => Object.fromEntries(header.map((key, index) => [key, (cells[index] ?? "").trim()])));
}

/** Borough from an MTA bus route id/short name prefix (Bx → Bronx, B → Brooklyn, M → Manhattan,
 *  Q → Queens, S/SIM → Staten Island, BM/BxM/QM/X → express). Undefined when unrecognized. */
export function gtfsBorough(routeId: string): string | undefined {
  const id = routeId.trim().toUpperCase();
  if (/^BX/u.test(id)) return "Bronx";
  if (/^(SIM|S)/u.test(id)) return "Staten Island";
  if (/^Q/u.test(id)) return "Queens";
  if (/^BM/u.test(id)) return "Brooklyn"; // express from Brooklyn
  if (/^B/u.test(id)) return "Brooklyn";
  if (/^M/u.test(id)) return "Manhattan";
  return undefined;
}

function feedDate(feedInfo: Array<Record<string, string>>): string {
  const info = feedInfo[0];
  return info?.feed_version || info?.feed_start_date || "unknown";
}

/** Stage a GTFS feed directory (must contain routes.txt + agency.txt) and write the journaled
 *  manifest. Returns the manifest. Idempotent: same feed → same staged bytes + manifest. */
export function importGtfs(feedDir: string, stageDir: string = gtfsStageDir()): GtfsManifest {
  const read = (name: string) => {
    const path = join(feedDir, name);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  };
  const routesText = read("routes.txt");
  const agencyText = read("agency.txt");
  if (!routesText) throw new Error(`GTFS feed at ${feedDir} is missing routes.txt`);
  const feedInfoText = read("feed_info.txt");

  const stage = stageDir;
  mkdirSync(stage, { recursive: true });
  const files: GtfsManifest["files"] = {};
  for (const [name, text] of [["routes.txt", routesText], ["agency.txt", agencyText], ["feed_info.txt", feedInfoText]] as const) {
    if (!text) continue;
    writeFileSync(join(stage, name), text, "utf8");
    files[name] = { sha256: sha256(text), rows: Math.max(0, parseCsv(text).length - 1) };
  }
  const manifest: GtfsManifest = {
    feed_date: feedDate(parseGtfsTable(feedInfoText)),
    imported_from: feedDir,
    files,
  };
  writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export function readGtfsManifest(stageDir: string = gtfsStageDir()): GtfsManifest | undefined {
  const path = join(stageDir, "manifest.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as GtfsManifest;
  } catch {
    return undefined;
  }
}

/** Fill ref_gtfs_routes + ref_agencies from the staged feed inside the rebuild transaction.
 *  No staged feed → no-op (empty tables, as after S2.1). Deterministic: sorted inserts. */
export function loadGtfsRefTables(db: Database, stageDir: string = gtfsStageDir()): { routes: number; agencies: number } {
  const manifest = readGtfsManifest(stageDir);
  if (!manifest) return { routes: 0, agencies: 0 };
  const stage = stageDir;
  const readStaged = (name: string) => {
    const path = join(stage, name);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  };

  const agencies = parseGtfsTable(readStaged("agency.txt"))
    .filter((row) => row.agency_id || row.agency_name)
    .sort((a, b) => (a.agency_id ?? "").localeCompare(b.agency_id ?? ""));
  const insertAgency = db.prepare(`INSERT OR IGNORE INTO ref_agencies (agency_id, name, kind, source) VALUES (?, ?, ?, ?)`);
  for (const row of agencies) {
    insertAgency.run(row.agency_id || row.agency_name || "", row.agency_name || null, "transit_agency", "mta_gtfs_static_bus");
  }

  const routes = parseGtfsTable(readStaged("routes.txt"))
    .filter((row) => row.route_id)
    .sort((a, b) => (a.route_id ?? "").localeCompare(b.route_id ?? ""));
  const insertRoute = db.prepare(`INSERT OR IGNORE INTO ref_gtfs_routes (route_id, short_name, long_name, agency_id, borough, gtfs_feed_date) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const row of routes) {
    const routeId = row.route_id ?? "";
    const shortName = row.route_short_name || routeId;
    insertRoute.run(routeId, row.route_short_name || null, row.route_long_name || null, row.agency_id || null, gtfsBorough(shortName) ?? null, manifest.feed_date);
  }

  return { routes: routes.length, agencies: agencies.length };
}
