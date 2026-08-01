import { describe, expect, it } from "bun:test";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { buildReleaseReceipt, parseReleaseBuildReceipt } from "../../src/materialize/release-build-receipt.js";
import {
  buildReleaseResourceDescriptors,
  parseReleaseResourceDescriptors,
} from "../../src/materialize/release-resource-descriptors.js";

const hash = "a".repeat(64);
const files = {
  "sources.jsonl": { bytes: 1, sha256: hash },
  "resolved-pack/operator/interventions/episodes.jsonl": { bytes: 2, sha256: hash },
  "resolved-pack/operator/interventions/application_reconciliation.jsonl": { bytes: 3, sha256: hash },
  "resolved-pack/public/public_intervention_episodes.jsonl": { bytes: 4, sha256: hash },
  "build_receipt.json": { bytes: 5, sha256: hash },
};

describe("manifest-v7 semantic envelope", () => {
  it("classifies every addressed resource exactly once with closed identities and joins", () => {
    const descriptors = buildReleaseResourceDescriptors(files);
    expect(parseReleaseResourceDescriptors(descriptors, files)).toEqual(descriptors);
    expect(descriptors).toHaveLength(Object.keys(files).length);
  });

  it("rejects orphan ownership, authority escalation, unknown joins, and dependency cycles", () => {
    const descriptors = buildReleaseResourceDescriptors(files);
    expect(() => parseReleaseResourceDescriptors(descriptors.slice(1), files)).toThrow("orphan addressed file");
    const escalated = structuredClone(descriptors);
    escalated.find((row) => row.path === "sources.jsonl")!.authorizes_occurrence = true;
    expect(() => parseReleaseResourceDescriptors(escalated, files)).toThrow("non-authorizing authority");
    const unknownJoin = structuredClone(descriptors);
    unknownJoin[0]!.join_policy_ids = ["bogus" as never];
    expect(() => parseReleaseResourceDescriptors(unknownJoin, files)).toThrow("unknown or empty");
    const cyclic = structuredClone(descriptors);
    cyclic[0]!.depends_on = [cyclic[1]!.contract_id];
    cyclic[1]!.depends_on = [cyclic[0]!.contract_id];
    expect(() => parseReleaseResourceDescriptors(cyclic, files)).toThrow("dependency cycle");
  });

  it("binds options, code/config, semantic inputs, and output resources into the build id", () => {
    const base = {
      generatorCommit: "b".repeat(40),
      trackedDirty: false,
      profile: "resolved-pack-v1-production" as const,
      asOfDate: "2026-07-27",
      publishCheck: true,
      semanticInputs: [
        { path: "package.json", bytes: 10, sha256: hash, tracked: true },
        { path: "data/canonical/sources.jsonl", bytes: 20, sha256: "c".repeat(64), tracked: true },
        { path: "data/operational-episode-resolution/campaigns/plan-052/frozen-frontier/summary.json", bytes: 1, sha256: hash, tracked: true },
        { path: "data/operational-episode-resolution/campaigns/plan-052/portfolio.json", bytes: 1, sha256: hash, tracked: true },
        { path: "data/operational-episode-resolution/campaigns/plan-052/integration-receipts/final-public-key-migration-v1.json", bytes: 1, sha256: hash, tracked: true },
        { path: "data/quality/operational-episode-frontier/v1/summary.json", bytes: 1, sha256: hash, tracked: true },
        { path: "data/contracts/relationships/v1/enforcement-source-refresh-receipts/2eab6a56d169953542988a7a4e7efc3d56608aa27324d8808693a8f7afe13a90.json", bytes: 1, sha256: hash, tracked: true },
        { path: "data/operational-application-semantics/campaigns/plan-053/accepted/completion-receipt.json", bytes: 1, sha256: hash, tracked: true },
        { path: "data/operational-application-semantics/campaigns/plan-053/accepted/integration-receipt.json", bytes: 1, sha256: hash, tracked: true },
        { path: "data/intervention-placements/campaigns/plan-054/accepted/completion-receipt.json", bytes: 1, sha256: hash, tracked: true },
        { path: "data/intervention-lifecycle/campaigns/plan-055/accepted/completion-receipt.json", bytes: 1, sha256: hash, tracked: true },
        { path: "data/resolved-transit/operator/v1/tracker-conformance/accepted-ledger-receipt.json", bytes: 1, sha256: hash, tracked: true },
      ],
      codeConfigPaths: ["package.json"],
      outputResources: { "sources.jsonl": files["sources.jsonl"] },
      productionGateEvidence: {
        episode_frontier_complete: true,
        application_semantics_complete: true,
        placement_frontier_complete: true,
        lifecycle_coverage_complete: true,
        strict_public_contract_complete: true,
        public_display_complete: true,
        tracker_conformance_complete: true,
        independent_recut_verified: true,
      },
    };
    const receipt = buildReleaseReceipt(base);
    expect(receipt.verification_candidate_eligible).toBe(true);
    expect(receipt.production_eligible).toBe(true);
    expect(receipt.publication_eligible).toBe(true);
    expect(parseReleaseBuildReceipt(receipt)).toEqual(receipt);
    expect(parseReleaseBuildReceipt(JSON.parse(stableJson(receipt as unknown as JsonValue)))).toEqual(receipt);
    expect(buildReleaseReceipt({ ...base, asOfDate: "2026-07-28" }).build_id).not.toBe(receipt.build_id);
    expect(buildReleaseReceipt({
      ...base,
      semanticInputs: base.semanticInputs.map((row, index) => index ? { ...row, sha256: "d".repeat(64) } : row),
    }).build_id).not.toBe(receipt.build_id);
    expect(buildReleaseReceipt({ ...base, trackedDirty: true }).production_ineligibility_reasons).toContain("clean_generator_required");
    expect(buildReleaseReceipt({
      ...base,
      semanticInputs: base.semanticInputs.map((row, index) => index ? { ...row, tracked: false } : row),
    }).verification_candidate_eligible).toBe(false);
    expect(buildReleaseReceipt({ ...base, profile: "resolved-pack-v1-verification" }).production_ineligibility_reasons)
      .toEqual(["production_profile_required"]);
    const preHandoff = buildReleaseReceipt({
      ...base,
      productionGateEvidence: { ...base.productionGateEvidence, independent_recut_verified: false },
    });
    expect(preHandoff.production_content_eligible).toBe(true);
    expect(preHandoff.production_eligible).toBe(false);
    expect(preHandoff.production_ineligibility_reasons).toEqual(["independent_recut_not_verified"]);
    expect(buildReleaseReceipt({
      ...base,
      semanticInputs: base.semanticInputs.filter((row) => row.path !== "data/operational-episode-resolution/campaigns/plan-052/portfolio.json"),
    }).production_ineligibility_reasons).toContain("semantic_input_receipts_incomplete");
    expect(buildReleaseReceipt({
      ...base,
      semanticInputs: base.semanticInputs.filter((row) => !row.path.includes("2eab6a56d169953542988a7a4e7efc3d56608aa27324d8808693a8f7afe13a90")),
    }).production_ineligibility_reasons).toContain("semantic_input_receipts_incomplete");
    const malformed = structuredClone(receipt) as any;
    malformed.production_gate_evidence.episode_frontier_complete = "true";
    expect(() => parseReleaseBuildReceipt(malformed)).toThrow("exact booleans");
    expect(() => parseReleaseBuildReceipt(buildReleaseReceipt({ ...base, asOfDate: "2026-02-30" })))
      .toThrow("calendar as-of date");
    const reordered = structuredClone(receipt);
    reordered.semantic_inputs.reverse();
    expect(() => parseReleaseBuildReceipt(reordered)).toThrow("duplicate or unsorted input path");
    const punctuationOrdered = buildReleaseReceipt({
      ...base,
      semanticInputs: [
        ...base.semanticInputs,
        { path: "data/current_intervention_footprint_reconciliation.jsonl", bytes: 1, sha256: hash, tracked: true },
        { path: "data/current_intervention_footprint.jsonl", bytes: 1, sha256: hash, tracked: true },
      ],
    });
    expect(punctuationOrdered.semantic_inputs.filter((entry) =>
      entry.path.startsWith("data/current_intervention_footprint")
    ).map((entry) => entry.path)).toEqual([
      "data/current_intervention_footprint.jsonl",
      "data/current_intervention_footprint_reconciliation.jsonl",
    ]);
    expect(parseReleaseBuildReceipt(punctuationOrdered)).toEqual(punctuationOrdered);
  });
});
