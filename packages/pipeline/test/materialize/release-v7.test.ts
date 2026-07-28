import { describe, expect, it } from "bun:test";
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
      asOfDate: "2026-07-27",
      publishCheck: true,
      semanticInputs: [
        { path: "package.json", bytes: 10, sha256: hash, tracked: true },
        { path: "data/canonical/sources.jsonl", bytes: 20, sha256: "c".repeat(64), tracked: true },
      ],
      codeConfigPaths: ["package.json"],
      outputResources: { "sources.jsonl": files["sources.jsonl"] },
    };
    const receipt = buildReleaseReceipt(base);
    expect(receipt.publication_eligible).toBe(true);
    expect(parseReleaseBuildReceipt(receipt)).toEqual(receipt);
    expect(buildReleaseReceipt({ ...base, asOfDate: "2026-07-28" }).build_id).not.toBe(receipt.build_id);
    expect(buildReleaseReceipt({
      ...base,
      semanticInputs: base.semanticInputs.map((row, index) => index ? { ...row, sha256: "d".repeat(64) } : row),
    }).build_id).not.toBe(receipt.build_id);
    expect(buildReleaseReceipt({ ...base, trackedDirty: true }).publication_eligible).toBe(false);
    expect(buildReleaseReceipt({
      ...base,
      semanticInputs: base.semanticInputs.map((row, index) => index ? { ...row, tracked: false } : row),
    }).publication_eligible).toBe(false);
  });
});
