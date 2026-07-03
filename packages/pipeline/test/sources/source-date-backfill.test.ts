// S2.2 source-date backfill (docs/step-2-implementation-plan.md §S2.2, §5): filename-prefix parse,
// override precedence, and the don't-touch-a-payload-date invariant. Filesystem inputs (staged
// metadata) are covered by the live-corpus measurement, not here; overrides are injected.

import { describe, expect, it } from "bun:test";
import { dateFromSourceIdPrefix, withSourceDateBackfill, type SourceDateOverride } from "@mta-wiki/pipeline/sources/source-date-backfill";
import type { JsonObject, MtaCanonicalRecord } from "@mta-wiki/db/types";

function sourceRecord(sourceId: string, payload: JsonObject): MtaCanonicalRecord {
  return {
    record_id: sourceId,
    record_kind: "source",
    source_id: sourceId,
    source_ids: [sourceId],
    local_observation_id: "obs",
    local_observation_ids: ["obs"],
    display_name: sourceId,
    payload,
    evidence_refs: [],
    submission_ids: ["sub"],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-10T00:00:00.000Z",
  };
}

describe("dateFromSourceIdPrefix", () => {
  it("parses a plausible YYMMDD_ prefix to an ISO day", () => {
    expect(dateFromSourceIdPrefix("100503_brt_cb5")).toMatchObject({ normalized_date: "2010-05-03", precision: "day", provenance: "filename_pattern" });
    expect(dateFromSourceIdPrefix("080421-foo")).toMatchObject({ normalized_date: "2008-04-21" });
  });

  it("rejects implausible prefixes (bad month/day, far-future year, no delimiter)", () => {
    expect(dateFromSourceIdPrefix("100013_x")).toBeUndefined(); // month 00
    expect(dateFromSourceIdPrefix("103299_x")).toBeUndefined(); // month 32
    expect(dateFromSourceIdPrefix("991231_x")).toBeUndefined(); // year 2099 > 2030 bound
    expect(dateFromSourceIdPrefix("100503brt")).toBeUndefined(); // no delimiter
    expect(dateFromSourceIdPrefix("better_buses")).toBeUndefined();
  });
});

describe("withSourceDateBackfill precedence", () => {
  it("a reviewed override wins even over an existing payload date", () => {
    const records = [sourceRecord("s1", { published_date_normalized: "2018", published_date_precision: "year" })];
    const overrides: Record<string, SourceDateOverride> = { s1: { date: "2019-10", precision: "month", note: "n", reviewed_at: "2026-06-10" } };
    withSourceDateBackfill(records, overrides);
    expect(records[0]!.payload.published_date_normalized).toBe("2019-10");
    expect(records[0]!.payload.published_date_precision).toBe("month");
    expect(records[0]!.payload.published_date_provenance).toBe("reviewed_override");
  });

  it("leaves an S2.1 payload date untouched when there is no override", () => {
    const records = [sourceRecord("s2", { published_date_normalized: "2020-06", published_date_precision: "month" })];
    withSourceDateBackfill(records, {});
    expect(records[0]!.payload.published_date_normalized).toBe("2020-06");
    expect(records[0]!.payload.published_date_provenance).toBeUndefined(); // payload pass, no fold marker
  });

  it("falls back to the filename prefix when no payload date and no override", () => {
    const records = [sourceRecord("100503_brt_cb5", {})];
    withSourceDateBackfill(records, {});
    expect(records[0]!.payload.published_date_normalized).toBe("2010-05-03");
    expect(records[0]!.payload.published_date_provenance).toBe("filename_pattern");
  });

  it("leaves a genuinely undated source undated (the source_undated residue)", () => {
    const records = [sourceRecord("capital_dashboard", {})];
    withSourceDateBackfill(records, {});
    expect(records[0]!.payload.published_date_normalized).toBeUndefined();
  });
});
