// C1 / S2.5 GTFS reference registry (docs/step-2-implementation-plan.md §S2.5, §5): import
// idempotence, deterministic load, coverage views, borough derivation. Uses a synthetic feed in a
// temp dir (no network; the production stage dir is untouched).

import { afterAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA_DDL } from "../src/schema-ddl.js";
import { gtfsBorough, importGtfs, loadGtfsRefTables, parseGtfsTable } from "../src/import-gtfs.js";

const work = mkdtempSync(join(tmpdir(), "gtfs-test-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function makeFeed(): string {
  const feed = join(work, "feed");
  mkdirSync(feed, { recursive: true });
  writeFileSync(
    join(feed, "routes.txt"),
    "route_id,agency_id,route_short_name,route_long_name,route_type\nMTA NYCT_M86+,MTA NYCT,M86-SBS,86th Street Select Bus,3\nMTA NYCT_BX12,MTA NYCT,Bx12,Fordham Rd,3\nMTA NYCT_Q70,MTABC,Q70,LaGuardia Link,3\n",
  );
  writeFileSync(join(feed, "agency.txt"), "agency_id,agency_name,agency_url\nMTA NYCT,MTA New York City Transit,https://mta.info\nMTABC,MTA Bus Company,https://mta.info\n");
  writeFileSync(join(feed, "feed_info.txt"), "feed_publisher_name,feed_version\nMTA,2026-05-01\n");
  return feed;
}

function freshDb(): Database {
  const db = new Database(":memory:");
  for (const stmt of SCHEMA_DDL) db.exec(stmt);
  return db;
}

describe("gtfsBorough", () => {
  it("derives borough from the route prefix", () => {
    expect(gtfsBorough("M86")).toBe("Manhattan");
    expect(gtfsBorough("Bx12")).toBe("Bronx");
    expect(gtfsBorough("B44")).toBe("Brooklyn");
    expect(gtfsBorough("Q70")).toBe("Queens");
    expect(gtfsBorough("SIM4")).toBe("Staten Island");
  });
});

describe("importGtfs + loadGtfsRefTables", () => {
  it("stages a feed and loads ref tables deterministically (rerun byte-identical)", () => {
    const stage = join(work, "stage");
    const manifest = importGtfs(makeFeed(), stage);
    expect(manifest.feed_date).toBe("2026-05-01");
    expect(manifest.files["routes.txt"]!.rows).toBe(3);

    const dump = (db: Database) =>
      JSON.stringify({
        routes: db.query("SELECT * FROM ref_gtfs_routes ORDER BY route_id").all(),
        agencies: db.query("SELECT * FROM ref_agencies ORDER BY agency_id").all(),
      });

    const a = freshDb();
    const counts = loadGtfsRefTables(a, stage);
    expect(counts).toEqual({ routes: 3, agencies: 2 });
    const b = freshDb();
    loadGtfsRefTables(b, stage);
    expect(dump(a)).toBe(dump(b)); // same staged feed → byte-identical tables

    const bx12 = a.query("SELECT borough, gtfs_feed_date FROM ref_gtfs_routes WHERE short_name = 'Bx12'").get() as { borough: string; gtfs_feed_date: string };
    expect(bx12.borough).toBe("Bronx");
    expect(bx12.gtfs_feed_date).toBe("2026-05-01");
    a.close();
    b.close();
  });

  it("coverage views return rows for uncovered routes on both sides", () => {
    const stage = join(work, "stage2");
    importGtfs(makeFeed(), stage);
    const db = freshDb();
    loadGtfsRefTables(db, stage);
    // One canonical route that matches a GTFS short_name, one that does not.
    db.exec("INSERT INTO records (record_id, record_kind, display_name, local_observation_id, primary_source_id, payload, truth_status, review_state, generated_at) VALUES " +
      "('route_bx12','route','Bx12','o','s','{}','source_stated','unreviewed','t'),('route_zz9','route','ZZ9','o','s','{}','source_stated','unreviewed','t')");
    db.exec("INSERT INTO routes (record_id, route_id) VALUES ('route_bx12','Bx12'),('route_zz9','ZZ9')");

    const gtfsUncovered = db.query("SELECT short_name FROM gtfs_routes_uncovered ORDER BY short_name").all() as Array<{ short_name: string }>;
    expect(gtfsUncovered.map((r) => r.short_name)).toEqual(["M86-SBS", "Q70"]); // Bx12 is covered
    const canonUncovered = db.query("SELECT route_id FROM canonical_routes_uncovered").all() as Array<{ route_id: string }>;
    expect(canonUncovered.map((r) => r.route_id)).toEqual(["ZZ9"]);
    db.close();
  });
});

describe("parseGtfsTable", () => {
  it("parses quoted CSV fields and a BOM header", () => {
    const rows = parseGtfsTable('﻿route_id,route_long_name\nA,"Long, name with comma"\n');
    expect(rows[0]).toEqual({ route_id: "A", route_long_name: "Long, name with comma" });
  });
});
