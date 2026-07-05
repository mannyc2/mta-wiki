import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rebuildCanonicalDb } from "@mta-wiki/db/canonical-db";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import { exportSite } from "@mta-wiki/pipeline/site/export-site";

function record(id: string, kind: MtaCanonicalRecord["record_kind"], payload: MtaCanonicalRecord["payload"] = {}): MtaCanonicalRecord {
  return {
    record_id: id,
    record_kind: kind,
    source_id: kind === "source" ? id : "source_a",
    local_observation_id: id,
    display_name: id,
    payload,
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-03T00:00:00.000Z",
  };
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
      rebuildCanonicalDb([source, route, metric, corridor, project], { path: join(root, "data", "canonical.db") });

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
      expect(sourceHtml).toContain("showing first 1000000 bytes");
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
      rebuildCanonicalDb([source, route], { path: join(root, "data", "canonical.db") });
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
      rebuildCanonicalDb([source], { path: join(root, "data", "canonical.db") });
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
      rebuildCanonicalDb([source, route], { path: join(root, "data", "canonical.db") });
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
      rebuildCanonicalDb([source, route], { path: join(root, "data", "canonical.db") });
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
      rebuildCanonicalDb([source, routeTop, routeZzz, routeAaa], { path: join(root, "data", "canonical.db") });
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
      rebuildCanonicalDb([source, route, metric], { path: join(root, "data", "canonical.db") });
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
      rebuildCanonicalDb([source], { path: join(root, "data", "canonical.db") });
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
      rebuildCanonicalDb([source, route], { path: join(root, "data", "canonical.db") });
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
});
