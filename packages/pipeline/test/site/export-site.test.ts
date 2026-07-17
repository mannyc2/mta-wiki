import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rebuildCanonicalDb,
  type CanonicalEvidenceBlockRegistryEntry,
} from "@mta-wiki/db/canonical-db";
import type { MtaCanonicalRecord, MtaEvidenceRef } from "@mta-wiki/db/types";
import { exportSite } from "@mta-wiki/pipeline/site/export-site";

const FIXTURE_EVIDENCE_SHA256 = `sha256:${"a".repeat(64)}`;

function record(id: string, kind: MtaCanonicalRecord["record_kind"], payload: MtaCanonicalRecord["payload"] = {}): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: kind === "source" ? id : "source_a",
    local_observation_id: id,
    display_name: id,
    payload,
    evidence_refs: kind === "relation" ? [{
      source_id: "source_a",
      evidence_id: "source_a#p001_c0001",
      source_path: "raw/sources/source_a/blocks.jsonl",
      page_number: 1,
      block_id: "p001_c0001",
      text_sha256: FIXTURE_EVIDENCE_SHA256,
      role: "fixture",
    }] : [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-03T00:00:00.000Z",
  };
}

function rebuildFixtureCanonicalDb(records: readonly MtaCanonicalRecord[], path: string) {
  const evidenceRegistry = new Map<string, CanonicalEvidenceBlockRegistryEntry>();
  const normalizedRecords = records.map((fixtureRecord) => ({
    ...fixtureRecord,
    evidence_refs: fixtureRecord.evidence_refs.map((ref): MtaEvidenceRef => {
      if (!ref.source_id || !ref.block_id) {
        throw new Error(`Fixture evidence on ${fixtureRecord.record_id} must identify source_id and block_id`);
      }
      const normalized = {
        ...ref,
        evidence_id: `${ref.source_id}#${ref.block_id}`,
        source_path: `raw/sources/${ref.source_id}/blocks.jsonl`,
        page_number: ref.page_number ?? 1,
        text_sha256: ref.text_sha256 ?? FIXTURE_EVIDENCE_SHA256,
      };
      const key = `${ref.source_id}\0${ref.block_id}`;
      const entry: CanonicalEvidenceBlockRegistryEntry = {
        source_id: ref.source_id,
        block_id: ref.block_id,
        resolved_block_id: ref.block_id,
        page_number: normalized.page_number,
        source_path: normalized.source_path,
        raw_text_sha256: normalized.text_sha256,
      };
      const previous = evidenceRegistry.get(key);
      if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) {
        throw new Error(`Conflicting fixture evidence registry entry ${ref.source_id}#${ref.block_id}`);
      }
      evidenceRegistry.set(key, entry);
      return normalized;
    }),
  }));
  return rebuildCanonicalDb(normalizedRecords, {
    path,
    evidenceRegistry: {
      provenance: "test_fixture",
      entries: [...evidenceRegistry.values()],
    },
  });
}

function writePage(root: string, path: string, body: string) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body, "utf8");
}

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "mta-site-test-"));
  mkdirSync(join(root, "wiki", "routes"), { recursive: true });
  mkdirSync(join(root, "wiki", "corridors"), { recursive: true });
  mkdirSync(join(root, "wiki", "projects"), { recursive: true });
  mkdirSync(join(root, "wiki", "sources"), { recursive: true });
  return root;
}

describe("exportSite", () => {
  it("resolves primitives, citations, caps source text, and is deterministic", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source", { title: "Source A", publisher: "NYC DOT", published_date_normalized: "2026-01-01" });
      source.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];
      const route = record("route_m1", "route", { route_id: "M1" });
      route.evidence_refs = Array.from({ length: 250 }, (_entry, index) => ({
        source_id: "source_a",
        block_id: `p001_c${String(index + 1).padStart(4, "0")}`,
        source_quote: index === 0 ? "M1 speed was 10 mph." : `quote ${index + 1}`,
      }));
      const metric = record("metric_speed", "metric_claim", { metric_name: "bus_speed", value: 10, unit: "mph" });
      metric.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];
      const corridor = record("corridor_a", "corridor");
      const project = record("project_a", "project");
      rebuildFixtureCanonicalDb([source, route, metric, corridor, project], join(root, "data", "canonical.db"));

      writePage(root, "wiki/routes/route_m1.md", `---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\n# Route\nSee [[route:route_m1|M1]] and [[cite:source_a#p001_c0001|source]].\n\n\`\`\`mta:metric\n{"id":"metric_speed","value":999}\n\`\`\`\n\n${"x".repeat(2_100_000)}\n<!-- mta-wiki:writer:end -->\n`);
      writePage(root, "wiki/corridors/corridor_a.md", "---\nrecord_id: corridor_a\n---\n<!-- mta-wiki:writer:start -->\n[[wiki/routes/route_m1|Legacy route]]\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/projects/project_a.md", "---\nrecord_id: project_a\n---\n<!-- mta-wiki:writer:start -->\nProject.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", `---\nsource_id: source_a\n---\n[p001_c0001]\n${"source text ".repeat(120000)}`);

      const first = exportSite({ rootDir: root });
      const routeHtml = await Bun.file(join(root, "dist", "site", "routes", "route_m1.html")).text();
      const sourceHtml = await Bun.file(join(root, "dist", "site", "sources", "source_a.html")).text();
      expect(first.pages.routes).toBe(1);
      expect(first.pages.sources).toBe(1);
      expect(first.oversizedPages).toEqual([]);
      expect(routeHtml).toContain("href=\"../sources/source_a.html#p001_c0001\"");
      expect(routeHtml).toContain("10 <span>mph</span>");
      expect(routeHtml).not.toContain("999");
      expect(routeHtml).toContain("showing 200 of 250");
      expect(routeHtml).toContain("github.com/mannyc2/mta-wiki/blob/main/wiki/routes/route_m1.md");
      expect(routeHtml).toContain("quote 200");
      expect(routeHtml).not.toContain("quote 201");
      expect(routeHtml).toContain('<details class="panel"><summary>Structured data');
      expect(routeHtml).toContain("Citations (250)");
      expect(routeHtml).toContain('<details class="panel" data-pagefind-ignore>');
      expect(sourceHtml).toContain("showing first 1000000");
      expect(sourceHtml).toContain("full data in the repository");
      expect(sourceHtml).toContain("id=\"p001_c0001\"");
      const searchHtml = await Bun.file(join(root, "dist", "site", "search.html")).text();
      const sitemapXmlText = await Bun.file(join(root, "dist", "site", "sitemap.xml")).text();
      const indexHtml = await Bun.file(join(root, "dist", "site", "index.html")).text();
      exportSite({ rootDir: root });
      const after = await Bun.file(join(root, "dist", "site", "routes", "route_m1.html")).text();
      expect(after).toBe(routeHtml);
      const searchAfter = await Bun.file(join(root, "dist", "site", "search.html")).text();
      const sitemapAfter = await Bun.file(join(root, "dist", "site", "sitemap.xml")).text();
      const indexAfter = await Bun.file(join(root, "dist", "site", "index.html")).text();
      expect(searchAfter).toBe(searchHtml);
      expect(sitemapAfter).toBe(sitemapXmlText);
      expect(indexAfter).toBe(indexHtml);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders shared chrome: search form, meta tags, footer, pagefind filters, and index filter", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source", { title: "Source A" });
      const route = record("route_m1", "route", { route_id: "M1" });
      route.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];
      rebuildFixtureCanonicalDb([source, route], join(root, "data", "canonical.db"));
      writePage(root, "wiki/routes/route_m1.md", "---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\nRoute prose.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\n[p001_c0001] source text\n");

      exportSite({ rootDir: root });
      const routeHtml = await Bun.file(join(root, "dist", "site", "routes", "route_m1.html")).text();
      const routesIndexHtml = await Bun.file(join(root, "dist", "site", "routes.html")).text();

      expect(routeHtml).toContain("data-pagefind-body");
      expect(routeHtml).toContain('action="../search.html"');
      expect(routeHtml).toContain('name="description"');
      expect(routeHtml).toContain("rel=\"canonical\"");
      expect(routeHtml).toContain("Built from public NYC/MTA government records");
      expect(routeHtml).toContain('data-pagefind-filter="kind"');
      expect(routesIndexHtml).toContain('action="search.html"');
      expect(routesIndexHtml).toContain("index-filter");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes a working search page wired to pagefind", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source");
      rebuildFixtureCanonicalDb([source], join(root, "data", "canonical.db"));
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const searchHtml = await Bun.file(join(root, "dist", "site", "search.html")).text();
      expect(searchHtml).toContain("pagefind/pagefind-ui.js");
      expect(searchHtml).toContain("pagefind/pagefind-ui.css");
      expect(searchHtml).toContain('id="search"');
      expect(searchHtml).toContain("triggerSearch");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes sitemap.xml and robots.txt with absolute urls, excluding 404", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source");
      const route = record("route_m1", "route", { route_id: "M1" });
      rebuildFixtureCanonicalDb([source, route], join(root, "data", "canonical.db"));
      writePage(root, "wiki/routes/route_m1.md", "---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\nRoute.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const sitemap = await Bun.file(join(root, "dist", "site", "sitemap.xml")).text();
      const robots = await Bun.file(join(root, "dist", "site", "robots.txt")).text();

      expect(sitemap).toContain("<loc>https://mannyc2.github.io/mta-wiki/routes/route_m1.html</loc>");
      expect(sitemap).toContain("<loc>https://mannyc2.github.io/mta-wiki/search.html</loc>");
      expect(sitemap).not.toContain("404.html");
      expect(robots).toContain("Sitemap: https://mannyc2.github.io/mta-wiki/sitemap.xml");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders unresolved citations as plain text, not dead links", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source");
      const route = record("route_m1", "route", { route_id: "M1" });
      rebuildFixtureCanonicalDb([source, route], join(root, "data", "canonical.db"));
      writePage(
        root,
        "wiki/routes/route_m1.md",
        "---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\nSee [[cite:missing_src#p001_c0001|dead cite]].\n<!-- mta-wiki:writer:end -->\n",
      );
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const routeHtml = await Bun.file(join(root, "dist", "site", "routes", "route_m1.html")).text();
      expect(routeHtml).toContain("citation-unresolved");
      expect(routeHtml).toContain("dead cite");
      expect(routeHtml).not.toContain("missing_src.html");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("features routes ranked by evidence count, ties broken by record_id", async () => {
    const root = fixtureRoot();
    try {
      const routeTop = record("route_top", "route", { route_id: "TOP" });
      routeTop.display_name = "Top Route";
      routeTop.evidence_refs = Array.from({ length: 5 }, (_entry, index) => ({
        source_id: "source_a",
        block_id: `p001_c${String(index + 1).padStart(4, "0")}`,
      }));
      const routeZzz = record("route_zzz", "route", { route_id: "ZZZ" });
      routeZzz.display_name = "Zzz Route";
      routeZzz.evidence_refs = [
        { source_id: "source_a", block_id: "p001_c0010" },
        { source_id: "source_a", block_id: "p001_c0011" },
      ];
      const routeAaa = record("route_aaa", "route", { route_id: "AAA" });
      routeAaa.display_name = "Aaa Route";
      routeAaa.evidence_refs = [
        { source_id: "source_a", block_id: "p001_c0020" },
        { source_id: "source_a", block_id: "p001_c0021" },
      ];
      const source = record("source_a", "source");
      rebuildFixtureCanonicalDb([source, routeTop, routeZzz, routeAaa], join(root, "data", "canonical.db"));
      writePage(root, "wiki/routes/route_top.md", "---\nrecord_id: route_top\n---\n<!-- mta-wiki:writer:start -->\nTop.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/routes/route_zzz.md", "---\nrecord_id: route_zzz\n---\n<!-- mta-wiki:writer:start -->\nZzz.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/routes/route_aaa.md", "---\nrecord_id: route_aaa\n---\n<!-- mta-wiki:writer:start -->\nAaa.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const homeHtml = await Bun.file(join(root, "dist", "site", "index.html")).text();

      const topIndex = homeHtml.indexOf("Top Route");
      const aaaIndex = homeHtml.indexOf("Aaa Route");
      const zzzIndex = homeHtml.indexOf("Zzz Route");
      expect(topIndex).toBeGreaterThan(-1);
      expect(aaaIndex).toBeGreaterThan(-1);
      expect(zzzIndex).toBeGreaterThan(-1);
      expect(topIndex).toBeLessThan(aaaIndex);
      expect(aaaIndex).toBeLessThan(zzzIndex);
      expect(homeHtml).toContain("5 citations");
      expect(homeHtml).toContain("2 citations");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("computes the corpus stats strip from fixture records, comma-formatting large counts", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source");
      const route = record("route_m1", "route", { route_id: "M1" });
      route.evidence_refs = Array.from({ length: 1234 }, (_entry, index) => ({
        source_id: "source_a",
        block_id: `p001_c${String((index % 9999) + 1).padStart(4, "0")}`,
      }));
      const metric = record("metric_speed", "metric_claim", { metric_name: "bus_speed", value: 10, unit: "mph" });
      rebuildFixtureCanonicalDb([source, route, metric], join(root, "data", "canonical.db"));
      writePage(root, "wiki/routes/route_m1.md", "---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\nRoute.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const homeHtml = await Bun.file(join(root, "dist", "site", "index.html")).text();

      expect(homeHtml).toContain("<strong>3</strong><span>canonical records</span>");
      expect(homeHtml).toContain(`<strong>${(1234).toLocaleString("en-US")}</strong><span>evidence citations</span>`);
      expect(homeHtml).toContain("<strong>1</strong><span>metric claims</span>");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("homepage surfaces search, all six browse tiles, and the provenance section", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source");
      rebuildFixtureCanonicalDb([source], join(root, "data", "canonical.db"));
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const homeHtml = await Bun.file(join(root, "dist", "site", "index.html")).text();

      expect(homeHtml).toContain('action="search.html"');
      expect(homeHtml).toContain('href="routes.html"');
      expect(homeHtml).toContain('href="corridors.html"');
      expect(homeHtml).toContain('href="projects.html"');
      expect(homeHtml).toContain('href="sources.html"');
      expect(homeHtml).toContain('href="graph.html"');
      expect(homeHtml).toContain('href="primitives.html"');
      expect(homeHtml).toContain("Where this data comes from");
      expect(homeHtml).toContain("https://github.com/mannyc2/mta-wiki/issues");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("truncates a long description into a blurb ending with an ellipsis", async () => {
    const root = fixtureRoot();
    try {
      const descriptionBase =
        "Bus priority corridor improvements reduce travel time and improve reliability for riders across the borough near major transit hubs and intersections throughout the corridor length with additional signal timing upgrades and dedicated lanes. ";
      const longDescription = (descriptionBase + descriptionBase).slice(0, 400);
      const source = record("source_a", "source");
      const route = record("route_m1", "route", { route_id: "M1", description: longDescription });
      rebuildFixtureCanonicalDb([source, route], join(root, "data", "canonical.db"));
      writePage(root, "wiki/routes/route_m1.md", "---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\nRoute.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const homeHtml = await Bun.file(join(root, "dist", "site", "index.html")).text();

      const blurbMatch = homeHtml.match(/<a href="routes\/route_m1\.html">route_m1<\/a><span class="featured-evidence">\d+ citations<\/span><p>([^<]*)<\/p>/u);
      expect(blurbMatch).not.toBeNull();
      const blurb = blurbMatch![1]!;
      expect(blurb.endsWith("…")).toBe(true);
      expect(blurb.length).toBeLessThanOrEqual(161);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders a compact metadata header with chips, meta grid, and cite line", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source", { title: "Source A" });
      const route = record("route_m1", "route", { route_id: "M1", borough_normalized: "Manhattan", route_type_normalized: "sbs" });
      route.evidence_refs = [
        { source_id: "source_a", block_id: "p001_c0001" },
        { source_id: "source_a", block_id: "p001_c0002" },
        { source_id: "source_a", block_id: "p001_c0003" },
      ];
      rebuildFixtureCanonicalDb([source, route], join(root, "data", "canonical.db"));
      writePage(root, "wiki/routes/route_m1.md", "---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\nRoute.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const routeHtml = await Bun.file(join(root, "dist", "site", "routes", "route_m1.html")).text();

      expect(routeHtml).toContain("<dt>route_id</dt><dd>M1</dd>");
      expect(routeHtml).toContain('<span class="chip">source_stated</span>');
      expect(routeHtml).toContain('<span class="chip">unreviewed</span>');
      expect(routeHtml).toContain("Cited from 1 sources · 3 citations");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("links related pages in both directions across a relation edge", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source");
      const route = record("route_m1", "route", { route_id: "M1" });
      const corridor = record("corridor_a", "corridor");
      const relation = record("rel_1", "relation", {
        subject_id: "route_m1",
        object_id: "corridor_a",
        relation_kind: "operates_on_corridor",
        relation_family: "corridor_scope",
      });
      rebuildFixtureCanonicalDb([source, route, corridor, relation], join(root, "data", "canonical.db"));
      writePage(root, "wiki/routes/route_m1.md", "---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\nRoute.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/corridors/corridor_a.md", "---\nrecord_id: corridor_a\n---\n<!-- mta-wiki:writer:start -->\nCorridor.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const routeHtml = await Bun.file(join(root, "dist", "site", "routes", "route_m1.html")).text();
      const corridorHtml = await Bun.file(join(root, "dist", "site", "corridors", "corridor_a.html")).text();

      expect(routeHtml).toContain("Related pages");
      expect(routeHtml).toContain('href="../corridors/corridor_a.html"');
      expect(corridorHtml).toContain("Related pages");
      expect(corridorHtml).toContain('href="../routes/route_m1.html"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("counts linked records by kind in the cite line without listing non-page-bearing partners", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source");
      const route = record("route_m1", "route", { route_id: "M1" });
      const metric = record("metric_speed", "metric_claim", { metric_name: "bus_speed", value: 10, unit: "mph" });
      const relation = record("rel_2", "relation", {
        subject_id: "route_m1",
        object_id: "metric_speed",
        relation_kind: "has_metric",
        relation_family: "metric_context",
      });
      rebuildFixtureCanonicalDb([source, route, metric, relation], join(root, "data", "canonical.db"));
      writePage(root, "wiki/routes/route_m1.md", "---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\nRoute.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const routeHtml = await Bun.file(join(root, "dist", "site", "routes", "route_m1.html")).text();

      expect(routeHtml).toContain("linked records: 1 metric claim");
      expect(routeHtml).not.toContain("Related pages");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders a source chip linking to the cited source page", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source", { title: "Source A" });
      const route = record("route_m1", "route", { route_id: "M1" });
      route.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];
      rebuildFixtureCanonicalDb([source, route], join(root, "data", "canonical.db"));
      writePage(root, "wiki/routes/route_m1.md", "---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\nRoute.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const routeHtml = await Bun.file(join(root, "dist", "site", "routes", "route_m1.html")).text();

      expect(routeHtml).toContain('class="source-chips"');
      expect(routeHtml).toContain('href="../sources/source_a.html"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders breadcrumbs and a per-record meta description", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source");
      const route = record("route_m1", "route", { route_id: "M1" });
      route.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];
      rebuildFixtureCanonicalDb([source, route], join(root, "data", "canonical.db"));
      writePage(root, "wiki/routes/route_m1.md", "---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\nRoute.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\ntext\n");

      exportSite({ rootDir: root });
      const routeHtml = await Bun.file(join(root, "dist", "site", "routes", "route_m1.html")).text();

      expect(routeHtml).toContain('class="crumbs"');
      expect(routeHtml).toContain(">Home<");
      expect(routeHtml).toContain('<a href="../routes.html">Routes</a>');
      expect(routeHtml).not.toContain("Routess");
      expect(routeHtml).toMatch(/name="description" content="[^"]*citations from[^"]*"/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders a block-structured source page: anchors, duplicate ids, metadata, and an original-document link", async () => {
    const root = fixtureRoot();
    try {
      const sourceB = record("source_b", "source", {
        title: "Source B",
        publisher: "NYC DOT",
        content_type: "meeting book",
        authority_tier: "board_material",
        source_url: "https://example.com/doc.pdf",
      });
      const sourceC = record("source_c", "source", { title: "Source C", source_url: "javascript:alert(1)" });
      rebuildFixtureCanonicalDb([sourceB, sourceC], join(root, "data", "canonical.db"));
      writePage(
        root,
        "wiki/sources/source_b.md",
        "---\nsource_id: source_b\n---\nintro preamble line\n[p001_c0001] first block text with <b>tag</b> & symbol\n[p001_b0002] legacy-id block text\n[p001_c0001] duplicate marker text\n",
      );
      writePage(root, "wiki/sources/source_c.md", "---\nsource_id: source_c\n---\n[p001_c0001] block text\n");

      const first = exportSite({ rootDir: root });
      const sourceBHtml = await Bun.file(join(root, "dist", "site", "sources", "source_b.html")).text();
      const sourceCHtml = await Bun.file(join(root, "dist", "site", "sources", "source_c.html")).text();
      expect(first.pages.sources).toBe(2);

      expect(sourceBHtml).toContain('class="src-block" id="p001_c0001"');
      expect(sourceBHtml).toContain('id="p001_b0002"');
      expect(sourceBHtml).toContain('class="source-text"');
      expect(sourceBHtml).toContain("intro preamble line");
      expect(sourceBHtml).toContain("first block text with &lt;b&gt;tag&lt;/b&gt; &amp; symbol");
      expect(sourceBHtml).toContain("legacy-id block text");
      expect(sourceBHtml).toContain("duplicate marker text");
      expect(sourceBHtml.split('id="p001_c0001"').length).toBe(2);
      expect(sourceBHtml).toContain('<span class="block-ref">[p001_c0001]</span>');
      expect(sourceBHtml).toContain("Original document ↗");
      expect(sourceBHtml).toContain('rel="noopener"');
      expect(sourceBHtml).toContain("board material");
      expect(sourceBHtml).toContain("meeting book");
      expect(sourceBHtml).toContain("Wiki markdown on GitHub");

      expect(sourceCHtml).not.toContain("Original document");
      expect(sourceCHtml).not.toContain("javascript:alert(1)");
      expect(sourceCHtml).toContain("Wiki markdown on GitHub");

      exportSite({ rootDir: root });
      const sourceBAfter = await Bun.file(join(root, "dist", "site", "sources", "source_b.html")).text();
      expect(sourceBAfter).toBe(sourceBHtml);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("shows per-block cited-by info and a distinct-record total in the header cite line", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_a", "source", { title: "Source A" });
      const route = record("route_m1", "route", { route_id: "M1" });
      route.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];
      const metric = record("metric_speed", "metric_claim", { metric_name: "bus_speed", value: 10, unit: "mph" });
      metric.evidence_refs = [{ source_id: "source_a", block_id: "p001_c0001" }];
      rebuildFixtureCanonicalDb([source, route, metric], join(root, "data", "canonical.db"));
      writePage(root, "wiki/routes/route_m1.md", "---\nrecord_id: route_m1\n---\n<!-- mta-wiki:writer:start -->\nRoute.\n<!-- mta-wiki:writer:end -->\n");
      writePage(root, "wiki/sources/source_a.md", "---\nsource_id: source_a\n---\n[p001_c0001] block text\n");

      exportSite({ rootDir: root });
      const sourceHtml = await Bun.file(join(root, "dist", "site", "sources", "source_a.html")).text();

      expect(sourceHtml).toContain("Cited by 2 records · 1 blocks cited");
      expect(sourceHtml).toContain("Cited by 2 records");
      expect(sourceHtml).toContain('href="../routes/route_m1.html"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to the legacy plain-text rendering when there are no block markers", async () => {
    const root = fixtureRoot();
    try {
      const source = record("source_d", "source", { title: "Source D" });
      rebuildFixtureCanonicalDb([source], join(root, "data", "canonical.db"));
      writePage(root, "wiki/sources/source_d.md", "---\nsource_id: source_d\n---\nplain text with no block markers at all.\n");

      exportSite({ rootDir: root });
      const sourceHtml = await Bun.file(join(root, "dist", "site", "sources", "source_d.html")).text();

      expect(sourceHtml).toContain('class="source-text"');
      expect(sourceHtml).not.toContain("src-block");
      expect(sourceHtml).toContain("plain text with no block markers at all.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
