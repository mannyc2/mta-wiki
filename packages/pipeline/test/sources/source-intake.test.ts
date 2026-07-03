import { describe, expect, it } from "bun:test";
import { compactSourceId } from "@mta-wiki/pipeline/sources/source-intake";

describe("compactSourceId", () => {
  it("removes old corpus prefixes and pdf suffixes", () => {
    expect(compactSourceId("nyc_dot_m86_sbs_progress_report_2017_pdf")).toBe("m86_sbs_progress_report_2017");
    expect(compactSourceId("nyc_dot_busway_pdf_jay_street_pilot_overview")).toBe("jay_street_pilot_overview");
    expect(compactSourceId("mta_fare_free_bus_pilot_evaluation_pdf")).toBe("fare_free_bus_pilot_evaluation");
  });

  it("keeps enough domain context for generic page ids", () => {
    expect(compactSourceId("nyc_dot_busway_page_34thstreet")).toBe("busway_34thstreet");
    expect(compactSourceId("nyc_dot_bus_priority_page_jamaica")).toBe("jamaica");
  });

  it("falls back to the title if the upstream id collapses too far", () => {
    expect(compactSourceId("mta_pdf", "Useful Source Title")).toBe("useful_source_title");
  });
});
