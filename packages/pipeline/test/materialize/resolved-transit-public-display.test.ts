import { describe, expect, it } from "bun:test";
import {
  buildOperatorPublicDisplayDictionary,
} from "@mta-wiki/pipeline/materialize/resolved-transit-public-display";
import { assertPublicSafe, parsePublicSource } from "@mta-wiki/pipeline/consumer/public-contract";

describe("resolved transit operator public display", () => {
  it("resolves every addressed presentation subject with immutable public keys", () => {
    const first = buildOperatorPublicDisplayDictionary("2026-07-27");
    const second = buildOperatorPublicDisplayDictionary("2026-07-27");
    const componentScopes = first.scopes.filter((row) =>
      typeof row.application_id === "string"
    );
    const placementScopes = first.scopes.filter((row) =>
      typeof row.placement_id === "string"
    );
    expect(second).toEqual(first);
    expect(first.summary).toMatchObject({
      episode_count: first.episodes.length,
      component_count: componentScopes.length,
      placement_count: placementScopes.length,
      route_count: first.routes.length,
      source_count: first.sources.length,
      treatment_family_count: first.treatment_families.length,
      reconciliation: {
        resolved: 838,
        requires_review: 0,
        not_public: 0,
      },
    });
    expect(componentScopes).toHaveLength(343);
    expect(placementScopes).toHaveLength(104);
    expect(first.scopes).toHaveLength(447);
    expect(first.episodes.length).toBeGreaterThanOrEqual(130);
    expect(first.episodes.every((row) => typeof row.display_name === "string" && row.display_name.length > 0))
      .toBe(true);
    expect(first.episodes.every((row) => !/_/u.test(String(row.display_name)) && String(row.display_name).length <= 120))
      .toBe(true);
    expect(componentScopes.every((row) =>
      typeof row.treatment_family_label === "string" && row.treatment_family_label.length > 0 &&
      typeof row.treatment_display_name === "string" && row.treatment_display_name.length > 0 &&
      typeof row.action_label === "string" && row.action_label.length > 0 &&
      typeof row.extent?.label === "string" && row.extent.label.length > 0 &&
      Array.isArray(row.caveats)
    )).toBe(true);
    const uncertainComponents = componentScopes.filter((row) =>
      row.action_label === "Action not established" || row.extent?.label === "Exact extent not established"
    );
    expect(uncertainComponents).toHaveLength(139);
    expect(uncertainComponents.every((row) => row.caveats.length > 0)).toBe(true);
    expect(uncertainComponents.flatMap((row) => row.caveats)
      .some((caveat) => /[a-z]+_[a-z]+/u.test(caveat))).toBe(false);
    expect(first.sources.map(({ source_id: _sourceId, ...row }) => parsePublicSource(row)))
      .toHaveLength(first.sources.length);
    expect(first.sources.some((row) => row.url_status === "source_provided")).toBe(true);
    expect(first.sources.some((row) => row.url_status === "unavailable" && row.url === null)).toBe(true);
  });

  it("recursively rejects operator-only keys and internal values", () => {
    expect(() => assertPublicSafe({ nested: { reviewer: "person" } })).toThrow();
    expect(() => assertPublicSafe({ route_record_id: "route_one" })).toThrow();
    expect(() => assertPublicSafe({ value: "application:abc" })).toThrow();
    expect(() => assertPublicSafe({ value: "data/canonical/routes.jsonl" })).toThrow();
    expect(() => assertPublicSafe({ value: "a".repeat(64) })).toThrow();
    expect(() => assertPublicSafe({
      intervention_id: "occurrence:0123456789abcdef01234567",
      source_refs: [{ source_key: "source-one" }],
    })).not.toThrow();
  });
});
