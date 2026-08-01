import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import {
  collectProductionGateEvidence,
  productionIneligibilityReasons,
} from "../../src/materialize/release-production-eligibility.js";

const repoRoot = resolve(import.meta.dir, "../../../..");

describe("resolved-pack production eligibility", () => {
  it("proves every Plan 052-056 substantive gate from the frozen repository evidence", () => {
    const evidence = collectProductionGateEvidence(repoRoot, "2026-07-27", {
      strictPublicContractComplete: true,
      independentRecutVerified: true,
    });
    expect(evidence).toEqual({
      episode_frontier_complete: true,
      application_semantics_complete: true,
      placement_frontier_complete: true,
      lifecycle_coverage_complete: true,
      strict_public_contract_complete: true,
      public_display_complete: true,
      tracker_conformance_complete: true,
      independent_recut_verified: true,
    });
    expect(productionIneligibilityReasons({
      profile: "resolved-pack-v1-production",
      publishCheck: true,
      trackedDirty: false,
      semanticInputsReceipted: true,
      evidence,
    })).toEqual([]);
  });

  it("uses a closed deterministic reason order", () => {
    expect(productionIneligibilityReasons({
      profile: "resolved-pack-v1-verification",
      publishCheck: true,
      trackedDirty: false,
      semanticInputsReceipted: false,
      evidence: {
        episode_frontier_complete: false,
        application_semantics_complete: false,
        placement_frontier_complete: false,
        lifecycle_coverage_complete: false,
        strict_public_contract_complete: false,
        public_display_complete: false,
        tracker_conformance_complete: false,
        independent_recut_verified: true,
      },
    })).toEqual([
      "production_profile_required",
      "episode_frontier_incomplete",
      "application_semantics_incomplete",
      "placement_frontier_incomplete",
      "lifecycle_coverage_incomplete",
      "strict_public_contract_incomplete",
      "public_display_incomplete",
      "tracker_conformance_incomplete",
      "semantic_input_receipts_incomplete",
    ]);
  });
});
