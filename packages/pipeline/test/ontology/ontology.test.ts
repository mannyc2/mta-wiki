import { describe, expect, it } from "bun:test";
import { normalizedCompanionsAdded, ontologyGuide, ontologyGuideMarkdown, ontologyWarningsForPayload } from "@mta-wiki/pipeline/ontology/ontology";

describe("ontology guide", () => {
  it("exposes data-backed preferred raw fields and relation-context fields", () => {
    const [metricGuide] = ontologyGuide("metric_claim");

    expect(metricGuide?.preferred_fields).toContain("unit");
    expect(metricGuide?.alias_fields.find((field) => field.field === "units")?.reason).toContain("dominant raw field");
    expect(metricGuide?.runner_companions.map((field) => field.companion).join(" ")).toContain("direction_normalized");
    expect(metricGuide?.relation_context_fields.map((field) => field.field)).toContain("source_system");
    expect(ontologyGuideMarkdown("route")).toContain("Relation-context fields: program");
    expect(ontologyGuideMarkdown("claim")).toContain("data_type_normalized/change_type_normalized");
  });

  it("warns without rejecting when sparse aliases or relation-context fields are submitted", () => {
    const warnings = ontologyWarningsForPayload(
      "metric_claim",
      {
        metric_name: "Average Speed",
        raw_value_text: "8",
        value: 8,
        units: "miles_per_hour",
        source_system: "MTA ABLE program",
      },
      {
        metric_name: "Average Speed",
        raw_value_text: "8",
        value: 8,
        unit: "miles_per_hour",
        units: "miles_per_hour",
        unit_normalized: {
          raw_text: "miles_per_hour",
          normalized_unit: "mph",
          unit_family: "speed",
        },
        source_system: "MTA ABLE program",
      },
    );

    expect(warnings.some((warning) => warning.includes("prefer unit"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("source_system is relation context"))).toBe(true);
  });

  it("warns on runner-owned companions and mixed route borough shape", () => {
    const warnings = ontologyWarningsForPayload("route", {
      route_id: "B44",
      borough: ["Brooklyn", "Manhattan"],
      route_type_normalized: "select_bus_service",
      program: "ABLE",
    });

    expect(warnings.some((warning) => warning.includes("route.route_type_normalized is runner-owned"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("use borough for one borough and boroughs for arrays"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("route.program is relation context"))).toBe(true);
  });

  it("reports normalized companions added by the runner", () => {
    expect(
      normalizedCompanionsAdded(
        { unit: "mph" },
        {
          unit: "mph",
          unit_normalized: {
            raw_text: "mph",
            normalized_unit: "mph",
            unit_family: "speed",
          },
        },
      ),
    ).toEqual(["unit_normalized"]);
  });
});
