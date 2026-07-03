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
      exportSite({ rootDir: root });
      const after = await Bun.file(join(root, "dist", "site", "routes", "route_m1.html")).text();
      expect(after).toBe(routeHtml);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
