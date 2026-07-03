// S3.6a readiness-sweep contract: source_id-level ingested detection, quarantine-not-skip, the
// row/summary shape, and the wave-source list. The health check is injected so the classification
// is tested deterministically without staged fixtures on disk (incl. a planted not_pdf and a
// capped/missing-page source — both surface as quarantined with a reason).

import { describe, expect, it } from "bun:test";
import { checkSourceReadiness, summarize, waveSourceList, type ReadinessRow } from "@mta-wiki/pipeline/campaign/campaign-readiness";

const ingested = new Set(["already-ingested-src"]);

// A planted health check: one ready PDF, one capped-page failure, one misnamed-Excel (not a real PDF).
const fakeCheck = (id: string): { hasPdf: boolean; blockCount: number } => {
  if (id === "capped-pages-src") throw new Error("PDF source evidence blocks are required before ingest for capped-pages-src. missing pages: 3, 4");
  if (id === "misnamed-excel-src") throw new Error("Chandra OCR is required before ingest for misnamed-excel-src. source.pdf=present pages=unknown");
  return { hasPdf: true, blockCount: 42 };
};

describe("readiness sweep classification (S3.6a)", () => {
  it("marks a healthy source ready with stats", () => {
    const row = checkSourceReadiness("healthy-src", ingested, fakeCheck);
    expect(row).toEqual({ source_id: "healthy-src", ready: true, ingested: false, has_pdf: true, block_count: 42 });
  });

  it("quarantines a capped/missing-page source with the thrown reason (never silently skipped)", () => {
    const row = checkSourceReadiness("capped-pages-src", ingested, fakeCheck);
    expect(row.ready).toBe(false);
    expect(row.reason).toContain("missing pages");
  });

  it("quarantines a misnamed-Excel source (real-PDF check fails)", () => {
    const row = checkSourceReadiness("misnamed-excel-src", ingested, fakeCheck);
    expect(row.ready).toBe(false);
    expect(row.reason).toContain("Chandra OCR is required");
  });

  it("flags ingested at source_id granularity", () => {
    expect(checkSourceReadiness("already-ingested-src", ingested, fakeCheck).ingested).toBe(true);
    expect(checkSourceReadiness("healthy-src", ingested, fakeCheck).ingested).toBe(false);
  });
});

describe("summary + wave list", () => {
  const rows: ReadinessRow[] = [
    { source_id: "a", ready: true, ingested: false, has_pdf: true, block_count: 10 },
    { source_id: "b", ready: true, ingested: true, has_pdf: true, block_count: 5 },
    { source_id: "c", ready: false, ingested: false, reason: "missing pages" },
  ];

  it("summarizes ready/not-ready/ingested/ready-never-ingested/quarantined", () => {
    expect(summarize(rows)).toEqual({
      total: 3, ready: 2, not_ready: 1, ingested: 1, ready_never_ingested: 1, quarantined: 1,
    });
  });

  it("the wave list is ready AND not-yet-ingested only", () => {
    expect(waveSourceList(rows)).toEqual(["a"]);
  });
});
