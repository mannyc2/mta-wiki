import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { readCanonicalRecordsFromDbFile } from "@mta-wiki/pipeline/materialize/canonical-read";
import {
  loadPinnedOperationalCoverageArtifacts,
  DEFAULT_OPERATIONAL_COVERAGE_OUTPUT_DIR,
} from "@mta-wiki/pipeline/quality/operational-coverage-artifacts";
import {
  buildForecastRealizationFrontier,
  type ForecastRealizationTargetList,
} from "@mta-wiki/pipeline/quality/forecast-realization-frontier";

export const DEFAULT_FORECAST_REALIZATION_OUTPUT_DIR = "data/quality/acquisition";
export const FORECAST_REALIZATION_JSON_FILE = "target-list.json";
export const FORECAST_REALIZATION_MARKDOWN_FILE = "target-list.md";

export type ForecastRealizationArtifactBuild = {
  targetList: ForecastRealizationTargetList;
  contents: Record<typeof FORECAST_REALIZATION_JSON_FILE | typeof FORECAST_REALIZATION_MARKDOWN_FILE, string>;
  hashes: Record<typeof FORECAST_REALIZATION_JSON_FILE | typeof FORECAST_REALIZATION_MARKDOWN_FILE, string>;
};

export type WriteForecastRealizationArtifactsOptions = {
  asOf: string;
  graceDays: number;
  rootDir?: string | undefined;
  outputDir?: string | undefined;
  operationalCoverageDir?: string | undefined;
};

export type WriteForecastRealizationArtifactsResult = {
  outputDir: string;
  targetList: ForecastRealizationTargetList;
  hashes: ForecastRealizationArtifactBuild["hashes"];
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/[\r\n]+/gu, " ");
}

function targetDateLabel(target: ForecastRealizationTargetList["targets"][number]): string {
  const interval = target.forecast_date.interval;
  if (!interval) return target.forecast_date.raw ?? target.forecast_date.normalized ?? "unresolved";
  if (interval.start === interval.end) return interval.start;
  return `${interval.start}–${interval.end}`;
}

export function forecastRealizationMarkdown(targetList: ForecastRealizationTargetList): string {
  const summary = targetList.summary;
  const rows = targetList.targets.map((target) => {
    const candidates = target.realized_candidates.map((candidate) => candidate.event_record_id).join(", ") || "none";
    return (
      `| ${escapeTableCell(target.forecast_event_record_id)} ` +
      `| ${escapeTableCell(target.action)} ` +
      `| ${escapeTableCell(targetDateLabel(target))} ` +
      `| ${target.forecast_date.grace_deadline ?? "unresolved"} ` +
      `| ${target.operational_diagnostics.length} (${target.operational_diagnostic_state}) ` +
      `| ${escapeTableCell(candidates)} |`
    );
  });
  return [
    "# Forecast → realized acquisition frontier",
    "",
    `As of: ${targetList.as_of}`,
    `Grace period: ${targetList.grace_days} day(s) after the forecast interval ends`,
    `Frontier basis fingerprint: \`${targetList.frontier_basis_fingerprint}\``,
    `Artifact fingerprint: \`${targetList.artifact_fingerprint}\``,
    "",
    "Same-subject realized events are review candidates only. Their presence never closes a target.",
    "Operational-coverage verdicts remain a separate diagnostic layer and never close this acquisition frontier.",
    `Date interval policy: ${targetList.date_interval_policy}.`,
    "",
    "## Summary",
    "",
    `- Planned implementation/launch events inspected: ${summary.planned_operational_event_count}`,
    `- Priority acquisition targets: ${summary.acquisition_target_count}`,
    `- Excluded non-priority plans: ${summary.excluded_nonpriority_planned_event_count}`,
    `- Referenced operational diagnostics: ${summary.operational_diagnostic_row_count}`,
    `- Terminal operational diagnostics: ${summary.operational_terminal_diagnostic_row_count}`,
    `- Due targets: ${summary.targets_due_for_acquisition_count}`,
    `- Not-yet-due targets: ${summary.targets_not_due_count}`,
    `- Targets with unresolved dates: ${summary.targets_with_unresolved_date_count}`,
    `- Targets with realized candidates requiring review: ${summary.targets_with_realized_candidates_count}`,
    "",
    "## Targets",
    "",
    "| Forecast event | Action | Forecast interval | Grace deadline | Operational diagnostics | Realized candidates |",
    "| --- | --- | --- | --- | ---: | --- |",
    ...rows,
    "",
  ].join("\n");
}

export function buildForecastRealizationArtifacts(
  targetList: ForecastRealizationTargetList,
): ForecastRealizationArtifactBuild {
  const contents = {
    [FORECAST_REALIZATION_JSON_FILE]: `${stableJson(targetList as unknown as JsonValue)}\n`,
    [FORECAST_REALIZATION_MARKDOWN_FILE]: forecastRealizationMarkdown(targetList),
  };
  return {
    targetList,
    contents,
    hashes: {
      [FORECAST_REALIZATION_JSON_FILE]: sha256(contents[FORECAST_REALIZATION_JSON_FILE]),
      [FORECAST_REALIZATION_MARKDOWN_FILE]: sha256(contents[FORECAST_REALIZATION_MARKDOWN_FILE]),
    },
  };
}

export function writeForecastRealizationArtifacts(
  options: WriteForecastRealizationArtifactsOptions,
): WriteForecastRealizationArtifactsResult {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  const coverage = loadPinnedOperationalCoverageArtifacts({
    rootDir,
    outputDir: options.operationalCoverageDir ?? DEFAULT_OPERATIONAL_COVERAGE_OUTPUT_DIR,
  });
  const canonicalPath = join(rootDir, "data", "canonical.db");
  const records = readCanonicalRecordsFromDbFile(canonicalPath);
  if (!records) throw new Error(`Required canonical database is missing or unreadable: ${canonicalPath}`);
  const targetList = buildForecastRealizationFrontier({
    records,
    priorityQueue: coverage.build.ledger.queue,
    asOf: options.asOf,
    graceDays: options.graceDays,
    corpusFingerprint: coverage.build.manifest.corpus_fingerprint,
    operationalCoverageInputFingerprint: coverage.build.manifest.input_fingerprint,
  });
  const artifacts = buildForecastRealizationArtifacts(targetList);
  const outputDir = resolve(rootDir, options.outputDir ?? DEFAULT_FORECAST_REALIZATION_OUTPUT_DIR);
  mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of Object.entries(artifacts.contents).sort(([left], [right]) => left.localeCompare(right))) {
    writeFileSync(join(outputDir, name), content, "utf8");
  }
  return { outputDir, targetList, hashes: artifacts.hashes };
}
