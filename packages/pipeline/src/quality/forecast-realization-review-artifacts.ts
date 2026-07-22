import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { readCanonicalRecordsFromDbFile } from "@mta-wiki/pipeline/materialize/canonical-read";
import type { ForecastRealizationTargetList } from "@mta-wiki/pipeline/quality/forecast-realization-frontier";
import {
  buildForecastRealizationReviewedOverlay,
  parseForecastRealizationReviewDecision,
  type ForecastRealizationReviewDecision,
  type ForecastRealizationReviewedOverlay,
} from "@mta-wiki/pipeline/quality/forecast-realization-review";

export const DEFAULT_FORECAST_REALIZATION_REVIEW_DIR = "data/quality/acquisition/reviews/v1";
export const FORECAST_REALIZATION_REVIEW_JSONL_FILE = "reviewed-overlay.jsonl";
export const FORECAST_REALIZATION_REVIEW_MANIFEST_FILE = "manifest.json";
export const FORECAST_REALIZATION_REVIEW_FOLLOW_UP_FILE = "follow-up.md";

export type ForecastRealizationReviewManifest = Omit<ForecastRealizationReviewedOverlay, "decisions"> & {
  overlay_sha256: string;
  artifact_fingerprint: string;
};

export type ForecastRealizationReviewArtifactBuild = {
  overlay: ForecastRealizationReviewedOverlay;
  manifest: ForecastRealizationReviewManifest;
  contents: Record<
    typeof FORECAST_REALIZATION_REVIEW_MANIFEST_FILE | typeof FORECAST_REALIZATION_REVIEW_FOLLOW_UP_FILE,
    string
  >;
  hashes: Record<
    | typeof FORECAST_REALIZATION_REVIEW_JSONL_FILE
    | typeof FORECAST_REALIZATION_REVIEW_MANIFEST_FILE
    | typeof FORECAST_REALIZATION_REVIEW_FOLLOW_UP_FILE,
    string
  >;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseForecastRealizationReviewJsonl(
  bytes: string,
  path = FORECAST_REALIZATION_REVIEW_JSONL_FILE,
): ForecastRealizationReviewDecision[] {
  return bytes.split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      throw new Error(`${path}:${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return [parseForecastRealizationReviewDecision(parsed, `${path}:${index + 1}`)];
  });
}

function followUpMarkdown(overlay: ForecastRealizationReviewedOverlay): string {
  const summary = overlay.summary;
  const open = overlay.decisions
    .filter((decision) => summary.open_follow_up_target_ids.includes(decision.target_id))
    .map((decision) =>
      `| ${decision.forecast_event_record_id} | ${decision.disposition} | ` +
      `${decision.candidate_reviews.flatMap((review) => review.candidate_event_record_ids).join(", ")} |`,
    );
  return [
    "# Forecast → realized reviewed overlay follow-up",
    "",
    `Frontier as of: ${overlay.frontier_as_of}`,
    `Grace period: ${overlay.frontier_grace_days} days`,
    `Frontier artifact fingerprint: \`${overlay.frontier_artifact_fingerprint}\``,
    "",
    "This reviewed overlay is advisory and append-only. It does not mutate historical forecasts, operational occurrences, or study authority.",
    "",
    "## Complete denominator",
    "",
    `- Candidate-bearing targets: ${summary.candidate_bearing_target_denominator}`,
    `- Reviewed targets: ${summary.reviewed_target_count}`,
    `- Reviewed candidate pairs: ${summary.reviewed_candidate_pair_count}`,
    `- Missing target reviews: ${summary.missing_target_ids.length}`,
    `- Exact realizations: ${summary.counts_by_disposition.exact_realization}`,
    `- Later-plan replacements: ${summary.counts_by_disposition.later_plan_replacement}`,
    `- Reviewed nonmatches: ${summary.counts_by_disposition.reviewed_nonmatch}`,
    `- Still open: ${summary.counts_by_disposition.still_open}`,
    "",
    "## Open follow-up",
    "",
    "| Forecast event | Review disposition | Reviewed candidates |",
    "| --- | --- | --- |",
    ...open,
    "",
    "All open rows require new exact realization evidence or a later append-only review. Shared subject identity alone is insufficient.",
    "",
  ].join("\n");
}

export function buildForecastRealizationReviewArtifacts(input: {
  targetList: ForecastRealizationTargetList;
  decisions: readonly ForecastRealizationReviewDecision[];
  records: Parameters<typeof buildForecastRealizationReviewedOverlay>[0]["records"];
  overlayBytes: string;
}): ForecastRealizationReviewArtifactBuild {
  const overlay = buildForecastRealizationReviewedOverlay(input);
  const overlaySha256 = sha256(input.overlayBytes);
  const { decisions: _decisions, ...overlaySummary } = overlay;
  const withoutArtifactFingerprint = {
    ...overlaySummary,
    overlay_sha256: overlaySha256,
  };
  const manifest: ForecastRealizationReviewManifest = {
    ...withoutArtifactFingerprint,
    artifact_fingerprint: sha256(stableJson(withoutArtifactFingerprint as unknown as JsonValue)),
  };
  const contents = {
    [FORECAST_REALIZATION_REVIEW_MANIFEST_FILE]: `${stableJson(manifest as unknown as JsonValue)}\n`,
    [FORECAST_REALIZATION_REVIEW_FOLLOW_UP_FILE]: followUpMarkdown(overlay),
  };
  return {
    overlay,
    manifest,
    contents,
    hashes: {
      [FORECAST_REALIZATION_REVIEW_JSONL_FILE]: overlaySha256,
      [FORECAST_REALIZATION_REVIEW_MANIFEST_FILE]: sha256(contents[FORECAST_REALIZATION_REVIEW_MANIFEST_FILE]),
      [FORECAST_REALIZATION_REVIEW_FOLLOW_UP_FILE]: sha256(contents[FORECAST_REALIZATION_REVIEW_FOLLOW_UP_FILE]),
    },
  };
}

export function writeForecastRealizationReviewArtifacts(options: {
  rootDir?: string | undefined;
  targetListPath?: string | undefined;
  reviewDir?: string | undefined;
} = {}): ForecastRealizationReviewArtifactBuild & { outputDir: string } {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  const targetListPath = resolve(
    rootDir,
    options.targetListPath ?? "data/quality/acquisition/target-list.json",
  );
  const outputDir = resolve(rootDir, options.reviewDir ?? DEFAULT_FORECAST_REALIZATION_REVIEW_DIR);
  const overlayPath = join(outputDir, FORECAST_REALIZATION_REVIEW_JSONL_FILE);
  const overlayBytes = readFileSync(overlayPath, "utf8");
  const targetList = JSON.parse(readFileSync(targetListPath, "utf8")) as ForecastRealizationTargetList;
  const records = readCanonicalRecordsFromDbFile(join(rootDir, "data", "canonical.db"));
  if (!records) throw new Error(`Required canonical database is missing or unreadable: ${join(rootDir, "data", "canonical.db")}`);
  const build = buildForecastRealizationReviewArtifacts({
    targetList,
    decisions: parseForecastRealizationReviewJsonl(overlayBytes, overlayPath),
    records,
    overlayBytes,
  });
  mkdirSync(dirname(join(outputDir, FORECAST_REALIZATION_REVIEW_MANIFEST_FILE)), { recursive: true });
  for (const [name, content] of Object.entries(build.contents).sort(([left], [right]) => left.localeCompare(right))) {
    writeFileSync(join(outputDir, name), content, "utf8");
  }
  return { ...build, outputDir };
}
