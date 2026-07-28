import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { canonicalDbPath } from "@mta-wiki/db/canonical-db";
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
    expect(sha256(overlayBytes)).toBe("8eff909088863a86d936df5a679ae954334007240bf8f4b924edc929dbb4d053");
    expect(sha256(manifestBytes)).toBe("670e8c8aeef8c329a6adbcdb7d487aa8e44f155adcbdfa064fbbe5d51527203a");
    expect(sha256(followUpBytes)).toBe("12009c43d48f650d4f4e3632db557e5af69b8b2a566fc17f9aa24fddc169ffaa");

    const targetList = JSON.parse(
      readFileSync(join(repoRoot, "data/quality/acquisition/target-list.json"), "utf8"),
    ) as ForecastRealizationTargetList;
    const records = readCanonicalRecordsFromDbFile(canonicalDbPath());
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
