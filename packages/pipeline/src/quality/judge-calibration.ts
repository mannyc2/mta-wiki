import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { THRESHOLDS } from "@mta-wiki/pipeline/quality/release-quality";

export type JudgeVerdict = "supported" | "partially_supported" | "unsupported" | "wrong";

export type HumanReviewFixtureRow = {
  record_id: string;
  sample_group: string;
  judge_verdict: JudgeVerdict;
  reviewer_decision: "agree" | "disagree";
  reviewer_verdict: JudgeVerdict;
  reviewer_note: string;
};

export type CalibrationScoreSection = {
  status: "PASS" | "FAIL";
  threshold: number;
  value: number;
  total: number;
  passed: number;
  missing: number;
};

export type JudgeCalibrationScore = {
  run_id: string;
  verdicts_path: string;
  human_agreement: CalibrationScoreSection;
  seeded_recall: {
    status: "PASS" | "FAIL";
    overall: CalibrationScoreSection;
    critical: CalibrationScoreSection;
    by_class: Record<string, CalibrationScoreSection>;
    control_false_flag: CalibrationScoreSection;
  };
  verdict_distribution: {
    baseline: Record<JudgeVerdict, number>;
    actual: Record<string, number>;
  };
  output_json_path: string;
  output_markdown_path: string;
};

type VerdictRow = {
  record_id: string;
  verdict: string;
};

type SeededFixtureRow = {
  record_id: string;
  defect_class: string;
  expected_verdict: JudgeVerdict | "unsupported_or_wrong";
};

const BASELINE_DISTRIBUTION: Record<JudgeVerdict, number> = {
  supported: 197,
  partially_supported: 73,
  unsupported: 26,
  wrong: 4,
};

export function calibrationFixtureDir(rootDir = repoRoot): string {
  return join(rootDir, "data/quality/fixtures/v1-rc5-calibration");
}

export function seededDefectsFixturePath(rootDir = repoRoot): string {
  return join(rootDir, "data/quality/fixtures/seeded-defects-v1/fixtures.jsonl");
}

export function calibrationOutputDir(rootDir = repoRoot): string {
  return join(rootDir, "data/quality/calibration");
}

export function parseHumanReviewMarkdown(markdown: string): HumanReviewFixtureRow[] {
  const rows: HumanReviewFixtureRow[] = [];
  const sections = markdown.split(/\n(?=## \d+\. )/u).filter((section) => /^## \d+\. /u.test(section));
  for (const section of sections) {
    const heading = /^## \d+\. ([^/]+?) \/ ([a-z_]+)/u.exec(section);
    const recordId = field(section, "Record");
    const decisionLine = line(section, "Reviewer decision");
    const note = field(section, "Reviewer note") ?? "";
    if (!heading || !recordId || !decisionLine) continue;
    const reviewerDecision = decisionLine.includes("[x] disagree") ? "disagree" : "agree";
    const judgeVerdict = heading[2] as JudgeVerdict;
    rows.push({
      record_id: recordId,
      sample_group: heading[1]!.trim(),
      judge_verdict: judgeVerdict,
      reviewer_decision: reviewerDecision,
      reviewer_verdict: reviewerDecision === "agree" ? judgeVerdict : "unsupported",
      reviewer_note: note,
    });
  }
  return rows;
}

export function writeV1CalibrationFixtures(rootDir = repoRoot): { dir: string; judgedPath: string; humanPath: string; readmePath: string; humanRows: number } {
  const dir = calibrationFixtureDir(rootDir);
  mkdirSync(dir, { recursive: true });
  const sourceDir = join(rootDir, "data/quality/v1-rc5");
  const judged = readFileSync(join(sourceDir, "sample-audit.jsonl"), "utf8");
  const humanMarkdown = readFileSync(join(sourceDir, "human-review.md"), "utf8");
  const humanRows = parseHumanReviewMarkdown(humanMarkdown);

  const judgedPath = join(dir, "judged-300.jsonl");
  const humanPath = join(dir, "human-50.jsonl");
  const readmePath = join(dir, "README.md");
  writeFileSync(judgedPath, judged.endsWith("\n") ? judged : `${judged}\n`, "utf8");
  writeJsonl(humanPath, humanRows);
  writeFileSync(
    readmePath,
    [
      "# v1-rc5 Calibration Fixture",
      "",
      "This directory freezes the v1-rc5 evidence-support audit for future judge calibration.",
      "",
      "- Release: v1-rc5",
      "- Source verdicts: data/quality/v1-rc5/sample-audit.jsonl",
      "- Human review: data/quality/v1-rc5/human-review.md",
      "- Human-reviewed rows: 50",
      "- Agreement: 47 agree / 3 disagree (94.00%)",
      "- Review standard: records were judged against only their cited evidence blocks. Adjacent page titles/captions were treated as follow-up evidence when they were not included in the record's cited refs.",
      "",
    ].join("\n"),
    "utf8",
  );
  return { dir, judgedPath, humanPath, readmePath, humanRows: humanRows.length };
}

export function scoreJudgeCalibration(verdictsPath: string, options: { rootDir?: string | undefined; runId?: string | undefined } = {}): JudgeCalibrationScore {
  const rootDir = options.rootDir ?? repoRoot;
  const verdictRows = readJsonl<VerdictRow>(verdictsPath);
  const verdicts = new Map(verdictRows.map((row) => [row.record_id, row.verdict]));
  const runId = options.runId ?? `calibration-${shortHash(readFileSync(verdictsPath, "utf8"))}`;

  const humanRows = readJsonl<HumanReviewFixtureRow>(join(calibrationFixtureDir(rootDir), "human-50.jsonl"));
  const human = scoreExpected(humanRows.map((row) => ({ record_id: row.record_id, expected: [row.reviewer_verdict] })), verdicts, THRESHOLDS.judgeHumanAgreementMin);

  const seededRows = existsSync(seededDefectsFixturePath(rootDir)) ? readJsonl<SeededFixtureRow>(seededDefectsFixturePath(rootDir)) : [];
  const defectRows = seededRows.filter((row) => row.defect_class !== "control");
  const criticalRows = defectRows.filter((row) => row.defect_class === "value_perturbation" || row.defect_class === "endpoint_sibling_swap");
  const controlRows = seededRows.filter((row) => row.defect_class === "control");
  const overall = scoreExpected(defectRows.map((row) => ({ record_id: row.record_id, expected: ["unsupported", "wrong"] as JudgeVerdict[] })), verdicts, THRESHOLDS.seededRecallOverallMin);
  const critical = scoreExpected(criticalRows.map((row) => ({ record_id: row.record_id, expected: ["unsupported", "wrong"] as JudgeVerdict[] })), verdicts, THRESHOLDS.seededRecallCriticalMin);
  const controlFalseFlag = scoreFalseFlag(controlRows, verdicts, THRESHOLDS.controlFalseFlagMax);
  const byClass = Object.fromEntries(
    [...new Set(defectRows.map((row) => row.defect_class))]
      .sort()
      .map((klass) => [
        klass,
        scoreExpected(
          defectRows.filter((row) => row.defect_class === klass).map((row) => ({ record_id: row.record_id, expected: ["unsupported", "wrong"] as JudgeVerdict[] })),
          verdicts,
          klass === "value_perturbation" || klass === "endpoint_sibling_swap" ? THRESHOLDS.seededRecallCriticalMin : THRESHOLDS.seededRecallOverallMin,
        ),
      ]),
  );
  const seededStatus = [overall, critical, controlFalseFlag, ...Object.values(byClass)].every((section) => section.status === "PASS") ? "PASS" : "FAIL";

  const outputDir = calibrationOutputDir(rootDir);
  mkdirSync(outputDir, { recursive: true });
  const outputJsonPath = join(outputDir, `${runId}.json`);
  const outputMarkdownPath = join(outputDir, `${runId}.md`);
  const score: JudgeCalibrationScore = {
    run_id: runId,
    verdicts_path: relative(rootDir, verdictsPath),
    human_agreement: human,
    seeded_recall: {
      status: seededStatus,
      overall,
      critical,
      by_class: byClass,
      control_false_flag: controlFalseFlag,
    },
    verdict_distribution: {
      baseline: BASELINE_DISTRIBUTION,
      actual: countBy(verdictRows.map((row) => row.verdict)),
    },
    output_json_path: relative(rootDir, outputJsonPath),
    output_markdown_path: relative(rootDir, outputMarkdownPath),
  };
  writeFileSync(outputJsonPath, `${stableJson(score as unknown as JsonValue)}\n`, "utf8");
  writeFileSync(outputMarkdownPath, calibrationMarkdown(score), "utf8");
  return score;
}

export function calibrationMarkdown(score: JudgeCalibrationScore): string {
  const lines = [
    `# Judge Calibration ${score.run_id}`,
    "",
    `Verdicts: \`${score.verdicts_path}\``,
    "",
    `- Human agreement: ${pct(score.human_agreement.value)} (${score.human_agreement.passed}/${score.human_agreement.total}, missing ${score.human_agreement.missing}) ${score.human_agreement.status}`,
    `- Seeded recall overall: ${pct(score.seeded_recall.overall.value)} (${score.seeded_recall.overall.passed}/${score.seeded_recall.overall.total}, missing ${score.seeded_recall.overall.missing}) ${score.seeded_recall.overall.status}`,
    `- Seeded critical recall: ${pct(score.seeded_recall.critical.value)} (${score.seeded_recall.critical.passed}/${score.seeded_recall.critical.total}, missing ${score.seeded_recall.critical.missing}) ${score.seeded_recall.critical.status}`,
    `- Control false-flag: ${pct(score.seeded_recall.control_false_flag.value)} (${score.seeded_recall.control_false_flag.passed}/${score.seeded_recall.control_false_flag.total}, missing ${score.seeded_recall.control_false_flag.missing}) ${score.seeded_recall.control_false_flag.status}`,
    "",
    "## By Class",
    "",
    ...Object.entries(score.seeded_recall.by_class).map(([klass, section]) => `- ${klass}: ${pct(section.value)} (${section.passed}/${section.total}, missing ${section.missing}) ${section.status}`),
    "",
    "## Verdict Distribution",
    "",
    `- Baseline: ${formatCounts(score.verdict_distribution.baseline)}`,
    `- Actual: ${formatCounts(score.verdict_distribution.actual)}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function scoreExpected(rows: Array<{ record_id: string; expected: JudgeVerdict[] }>, verdicts: Map<string, string>, threshold: number): CalibrationScoreSection {
  let passed = 0;
  let missing = 0;
  for (const row of rows) {
    const verdict = verdicts.get(row.record_id);
    if (!verdict) {
      missing += 1;
      continue;
    }
    if (row.expected.includes(verdict as JudgeVerdict)) passed += 1;
  }
  const value = rows.length === 0 ? 1 : passed / rows.length;
  return { status: value >= threshold && missing === 0 ? "PASS" : "FAIL", threshold, value, total: rows.length, passed, missing };
}

function scoreFalseFlag(rows: SeededFixtureRow[], verdicts: Map<string, string>, threshold: number): CalibrationScoreSection {
  let falseFlags = 0;
  let missing = 0;
  for (const row of rows) {
    const verdict = verdicts.get(row.record_id);
    if (!verdict) {
      missing += 1;
      continue;
    }
    if (verdict === "unsupported" || verdict === "wrong") falseFlags += 1;
  }
  const value = rows.length === 0 ? 0 : falseFlags / rows.length;
  return { status: value <= threshold && missing === 0 ? "PASS" : "FAIL", threshold, value, total: rows.length, passed: rows.length - falseFlags - missing, missing };
}

function line(section: string, label: string): string | undefined {
  const match = new RegExp(`^- ${escapeRegExp(label)}: (.+)$`, "mu").exec(section);
  return match?.[1]?.trim();
}

function field(section: string, label: string): string | undefined {
  const value = line(section, label);
  if (!value) return undefined;
  const ticked = /^`(.+)`$/u.exec(value);
  return ticked?.[1] ?? value;
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function writeJsonl(path: string, rows: unknown[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((row) => stableJson(row as JsonValue)).join("\n") + (rows.length ? "\n" : ""), "utf8");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function shortHash(value: string) {
  return createHash("sha256").update(`${basename(value)}\n${value}`).digest("hex").slice(0, 12);
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function pct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
}
