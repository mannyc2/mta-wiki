import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  loadAcceptedInterventionLifecycleAssertions,
} from "@mta-wiki/pipeline/materialize/intervention-lifecycle";
import {
  validatePlan055LifecycleReviewProvenance,
} from "@mta-wiki/pipeline/materialize/intervention-lifecycle-review-provenance";
import { join } from "node:path";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";

function assertions() {
  return loadAcceptedInterventionLifecycleAssertions(join(
    repoRoot,
    "data",
    "intervention-lifecycle",
    "accepted",
  ));
}

function withCampaignCopy(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "plan-055-provenance-"));
  try {
    const target = join(root, "data", "intervention-lifecycle", "campaigns", "plan-055");
    mkdirSync(join(root, "data", "intervention-lifecycle", "campaigns"), { recursive: true });
    cpSync(join(repoRoot, "data", "intervention-lifecycle", "campaigns", "plan-055"), target, {
      recursive: true,
    });
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("Plan 055 lifecycle review provenance", () => {
  it("binds the production assertion journal to the terminal reviewed campaign", () => {
    expect(validatePlan055LifecycleReviewProvenance(repoRoot, assertions())).toEqual({
      completion_receipt_id:
        "plan-055-completion:347736366cc08cb774290c4b96df5c2c8ae63a38ff176a7873177d6c4a051de1",
      assertion_partition_sha256:
        "9c474127bcae1949e342b03743e1b2fa69e080f9317ff7d40c165314b3dc5fba",
    });
  });

  it("rejects a drifted assertion partition", () => {
    expect(() => validatePlan055LifecycleReviewProvenance(repoRoot, assertions().slice(1)))
      .toThrow("accepted lifecycle assertion journal mismatch");
  });

  it("rejects drift in an exact frozen reviewer artifact", () => {
    withCampaignCopy((root) => {
      appendFileSync(join(
        root,
        "data",
        "intervention-lifecycle",
        "campaigns",
        "plan-055",
        "reviews",
        "primary",
        "proposals.jsonl",
      ), "\n");
      expect(() => validatePlan055LifecycleReviewProvenance(root, assertions()))
        .toThrow("review artifact primary hash mismatch");
    });
  });

  it("rejects drift in a referenced dated snapshot artifact", () => {
    withCampaignCopy((root) => {
      appendFileSync(join(
        root,
        "data",
        "intervention-lifecycle",
        "campaigns",
        "plan-055",
        "accepted",
        "snapshots",
        "2026-07-27",
        "summary.json",
      ), "\n");
      expect(() => validatePlan055LifecycleReviewProvenance(root, assertions()))
        .toThrow("summary.json hash mismatch");
    });
  });
});
