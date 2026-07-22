import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { readCanonicalRecordsFromDbFile } from "@mta-wiki/pipeline/materialize/canonical-read";
import {
  buildForecastRealizationArtifacts,
  FORECAST_REALIZATION_JSON_FILE,
  FORECAST_REALIZATION_MARKDOWN_FILE,
} from "@mta-wiki/pipeline/quality/forecast-realization-artifacts";
import {
  buildForecastRealizationFrontier,
  type ForecastRealizationTargetList,
} from "@mta-wiki/pipeline/quality/forecast-realization-frontier";
import {
  DEFAULT_OPERATIONAL_COVERAGE_OUTPUT_DIR,
  loadPinnedOperationalCoverageArtifacts,
} from "@mta-wiki/pipeline/quality/operational-coverage-artifacts";
import { describe, expect, it } from "bun:test";

const jsonPath = join(repoRoot, "data/quality/acquisition", FORECAST_REALIZATION_JSON_FILE);
const markdownPath = join(repoRoot, "data/quality/acquisition", FORECAST_REALIZATION_MARKDOWN_FILE);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("current forecast-realization acquisition frontier", () => {
  it("recomputes byte-identically and keeps acquisition state independent from terminal study diagnostics", () => {
    const jsonBytes = readFileSync(jsonPath, "utf8");
    const markdownBytes = readFileSync(markdownPath, "utf8");
    expect(sha256(jsonBytes)).toBe("5178b2a9e7e5db2a8a5c247226d2c7a6c935e0edd69ec0902c3bc07be29a4627");
    expect(sha256(markdownBytes)).toBe("51126d9ed84d5aa5adb80e604a5705530f11bbd4fc2168dfe39dc81df1720604");

    const targetList = JSON.parse(jsonBytes) as ForecastRealizationTargetList;
    expect(targetList.as_of).toBe("2026-07-22");
    expect(targetList.grace_days).toBe(90);
    const records = readCanonicalRecordsFromDbFile(join(repoRoot, "data/canonical.db"));
    expect(records).not.toBeNull();
    const coverage = loadPinnedOperationalCoverageArtifacts({
      rootDir: repoRoot,
      outputDir: DEFAULT_OPERATIONAL_COVERAGE_OUTPUT_DIR,
    });
    const rebuilt = buildForecastRealizationFrontier({
      records: records!,
      priorityQueue: coverage.build.ledger.queue,
      asOf: targetList.as_of,
      graceDays: targetList.grace_days,
      corpusFingerprint: coverage.build.manifest.corpus_fingerprint,
      operationalCoverageInputFingerprint: coverage.build.manifest.input_fingerprint,
    });
    expect(rebuilt).toEqual(targetList);

    const artifacts = buildForecastRealizationArtifacts(rebuilt);
    expect(artifacts.contents[FORECAST_REALIZATION_JSON_FILE]).toBe(jsonBytes);
    expect(artifacts.contents[FORECAST_REALIZATION_MARKDOWN_FILE]).toBe(markdownBytes);

    expect(targetList.summary).toMatchObject({
      planned_operational_event_count: 53,
      acquisition_target_count: 47,
      excluded_nonpriority_planned_event_count: 6,
      operational_diagnostic_row_count: 148,
      operational_terminal_diagnostic_row_count: 148,
      targets_due_for_acquisition_count: 39,
      targets_not_due_count: 5,
      targets_with_unresolved_date_count: 3,
      targets_with_realized_candidates_count: 21,
    });
    expect(targetList.targets).toHaveLength(targetList.summary.acquisition_target_count);
    expect(targetList.targets.every((target) => target.frontier_state === "open")).toBeTrue();
    expect(
      targetList.targets.every((target) => target.operational_diagnostic_state === "all_terminal"),
    ).toBeTrue();
    expect(
      targetList.targets
        .filter((target) => target.realized_candidates.length > 0)
        .every((target) => target.action === "review_realized_candidate" && target.frontier_state === "open"),
    ).toBeTrue();
    expect(
      targetList.targets.reduce((sum, target) => sum + target.operational_diagnostics.length, 0),
    ).toBe(targetList.summary.operational_diagnostic_row_count);
  }, 30_000);
});
