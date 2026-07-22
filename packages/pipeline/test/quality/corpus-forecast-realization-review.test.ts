import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { readCanonicalRecordsFromDbFile } from "@mta-wiki/pipeline/materialize/canonical-read";
import type { ForecastRealizationTargetList } from "@mta-wiki/pipeline/quality/forecast-realization-frontier";
import {
  buildForecastRealizationReviewArtifacts,
  FORECAST_REALIZATION_REVIEW_FOLLOW_UP_FILE,
  FORECAST_REALIZATION_REVIEW_JSONL_FILE,
  FORECAST_REALIZATION_REVIEW_MANIFEST_FILE,
  parseForecastRealizationReviewJsonl,
} from "@mta-wiki/pipeline/quality/forecast-realization-review-artifacts";
import { describe, expect, it } from "bun:test";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("current forecast realization reviewed overlay", () => {
  it("validates every candidate-bearing target and regenerates byte-identically", () => {
    const reviewDir = join(repoRoot, "data/quality/acquisition/reviews/v1");
    const overlayBytes = readFileSync(join(reviewDir, FORECAST_REALIZATION_REVIEW_JSONL_FILE), "utf8");
    const manifestBytes = readFileSync(join(reviewDir, FORECAST_REALIZATION_REVIEW_MANIFEST_FILE), "utf8");
    const followUpBytes = readFileSync(join(reviewDir, FORECAST_REALIZATION_REVIEW_FOLLOW_UP_FILE), "utf8");
    expect(sha256(overlayBytes)).toBe("ebbec691ffd5cdadaf7fbbbad6aa3b070b219a190bcdfafcc3fd164e75f36609");
    expect(sha256(manifestBytes)).toBe("3d5d59fe236b0e9226f9c9a7fef5c60d0cf0ba12060233ab1a6f8f906daf742b");
    expect(sha256(followUpBytes)).toBe("55cd3403cbbcca03dad504580e3653a7b3721f87901b20ad482fbc75b34d0f61");

    const targetList = JSON.parse(
      readFileSync(join(repoRoot, "data/quality/acquisition/target-list.json"), "utf8"),
    ) as ForecastRealizationTargetList;
    const records = readCanonicalRecordsFromDbFile(join(repoRoot, "data/canonical.db"));
    expect(records).not.toBeNull();
    const rebuilt = buildForecastRealizationReviewArtifacts({
      targetList,
      decisions: parseForecastRealizationReviewJsonl(overlayBytes),
      records: records!,
      overlayBytes,
    });
    expect(rebuilt.contents[FORECAST_REALIZATION_REVIEW_MANIFEST_FILE]).toBe(manifestBytes);
    expect(rebuilt.contents[FORECAST_REALIZATION_REVIEW_FOLLOW_UP_FILE]).toBe(followUpBytes);
    expect(rebuilt.overlay.authorizes_study).toBeFalse();
    expect(rebuilt.overlay.authorizes_cross_product).toBeFalse();
    expect(rebuilt.overlay.summary).toEqual({
      candidate_bearing_target_denominator: 21,
      reviewed_target_count: 21,
      reviewed_candidate_pair_count: 57,
      missing_target_ids: [],
      open_follow_up_target_ids: expect.any(Array),
      counts_by_disposition: {
        exact_realization: 4,
        later_plan_replacement: 2,
        reviewed_nonmatch: 13,
        still_open: 2,
      },
    });
    expect(rebuilt.overlay.summary.open_follow_up_target_ids).toHaveLength(15);
  }, 30_000);
});
