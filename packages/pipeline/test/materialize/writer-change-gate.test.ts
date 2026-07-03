import { describe, expect, it } from "bun:test";
import { extractWriterCitations, verifyWriterCitations, writerRegionOnlyChanged, writerRegionPresent } from "@mta-wiki/pipeline/materialize/writer-change-gate";

const base = `---
record_id: project_test
---

<!-- mta-wiki:writer:start -->
old text
<!-- mta-wiki:writer:end -->
`;

describe("writerRegionOnlyChanged", () => {
  it("allows edits confined to the writer region", () => {
    const next = base.replace("old text", "new context\n\nwith details");
    expect(writerRegionOnlyChanged(base, next)).toEqual({ ok: true });
  });

  it("rejects frontmatter changes", () => {
    const next = base.replace("project_test", "project_changed");
    const result = writerRegionOnlyChanged(base, next);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("outside");
  });

  it("rejects files without writer regions", () => {
    const result = writerRegionOnlyChanged("plain", base);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("baseline");
  });
});

describe("writerRegionPresent", () => {
  it("accepts one writer region", () => {
    expect(writerRegionPresent(base)).toEqual({ ok: true });
  });

  it("rejects missing writer regions", () => {
    const result = writerRegionPresent("plain markdown");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("no writer region");
  });

  it("rejects duplicate writer regions", () => {
    const result = writerRegionPresent(`${base}\n${base}`);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("multiple");
  });
});

describe("extractWriterCitations", () => {
  it("extracts source block handles from the writer region only", () => {
    const page = `${base.replace("old text", "M86 context. [m86_sbs_progress_report_2017#p002_c0004]\\nRange context. [source_a#p001_c0001..p001_c0003]")}

Outside region [ignored_source#p999_c9999]
`;

    expect(extractWriterCitations(page)).toEqual([
      { source_id: "m86_sbs_progress_report_2017", block_id: "p002_c0004" },
      { source_id: "source_a", block_id: "p001_c0001..p001_c0003" },
    ]);
  });
});

describe("verifyWriterCitations", () => {
  it("requires explicit paths", () => {
    const result = verifyWriterCitations([]);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("missing_scope_paths");
  });
});
