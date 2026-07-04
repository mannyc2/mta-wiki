import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "bun:test";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  parseHumanReviewMarkdown,
  scoreJudgeCalibration,
  type HumanReviewFixtureRow,
} from "@mta-wiki/pipeline/quality/judge-calibration";
import { buildSeededDefectFixtures } from "@mta-wiki/pipeline/quality/seeded-defects";

const work = join(tmpdir(), `mta-semantic-eval-test-${process.pid}`);
afterAll(() => rmSync(work, { recursive: true, force: true }));

function writeJsonl(path: string, rows: unknown[]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((row) => stableJson(row as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : ""), "utf8");
}

describe("judge calibration fixtures", () => {
  it("parses the frozen human review packet as 47 agree / 3 disagree", () => {
    const markdown = Bun.file("data/quality/v1-rc5/human-review.md").text();
    return markdown.then((text) => {
      const rows = parseHumanReviewMarkdown(text);
      expect(rows).toHaveLength(50);
      expect(rows.filter((row) => row.reviewer_decision === "agree")).toHaveLength(47);
      expect(rows.filter((row) => row.reviewer_decision === "disagree")).toHaveLength(3);
      expect(rows.filter((row) => row.reviewer_decision === "disagree").every((row) => row.reviewer_verdict === "unsupported")).toBe(true);
    });
  });

  it("scores PASS and FAIL verdict files with known arithmetic", () => {
    const root = join(work, "calibration");
    const fixtureDir = join(root, "data", "quality", "fixtures", "v1-rc5-calibration");
    const seededDir = join(root, "data", "quality", "fixtures", "seeded-defects-v1");
    mkdirSync(fixtureDir, { recursive: true });
    mkdirSync(seededDir, { recursive: true });
    const human: HumanReviewFixtureRow[] = [
      { record_id: "real_a", sample_group: "event", judge_verdict: "supported", reviewer_decision: "agree", reviewer_verdict: "supported", reviewer_note: "" },
      { record_id: "real_b", sample_group: "event", judge_verdict: "supported", reviewer_decision: "disagree", reviewer_verdict: "unsupported", reviewer_note: "" },
      { record_id: "real_c", sample_group: "metric_claim", judge_verdict: "wrong", reviewer_decision: "agree", reviewer_verdict: "wrong", reviewer_note: "" },
    ];
    writeJsonl(join(fixtureDir, "human-50.jsonl"), human);
    writeJsonl(join(seededDir, "fixtures.jsonl"), [
      { record_id: "seed_value", defect_class: "value_perturbation", expected_verdict: "unsupported_or_wrong" },
      { record_id: "seed_endpoint", defect_class: "endpoint_sibling_swap", expected_verdict: "unsupported_or_wrong" },
      { record_id: "seed_control", defect_class: "control", expected_verdict: "supported" },
    ]);
    const passPath = join(root, "pass.jsonl");
    writeJsonl(passPath, [
      { record_id: "real_a", verdict: "supported" },
      { record_id: "real_b", verdict: "unsupported" },
      { record_id: "real_c", verdict: "wrong" },
      { record_id: "seed_value", verdict: "unsupported" },
      { record_id: "seed_endpoint", verdict: "wrong" },
      { record_id: "seed_control", verdict: "supported" },
    ]);
    const pass = scoreJudgeCalibration(passPath, { rootDir: root, runId: "pass" });
    expect(pass.human_agreement.status).toBe("PASS");
    expect(pass.seeded_recall.status).toBe("PASS");

    const failPath = join(root, "fail.jsonl");
    writeJsonl(failPath, [
      { record_id: "real_a", verdict: "supported" },
      { record_id: "real_b", verdict: "supported" },
      { record_id: "real_c", verdict: "wrong" },
      { record_id: "seed_value", verdict: "supported" },
      { record_id: "seed_endpoint", verdict: "supported" },
      { record_id: "seed_control", verdict: "wrong" },
    ]);
    const fail = scoreJudgeCalibration(failPath, { rootDir: root, runId: "fail" });
    expect(fail.human_agreement.status).toBe("FAIL");
    expect(fail.seeded_recall.status).toBe("FAIL");
  });
});

describe("seeded defect generator", () => {
  it("builds deterministic fixture rows with all defect classes and controls", () => {
    const first = buildSeededDefectFixtures({ seed: "semqa-v1" });
    const second = buildSeededDefectFixtures({ seed: "semqa-v1" });
    expect(first).toEqual(second);
    const counts = new Map<string, number>();
    for (const row of first) counts.set(row.defect_class, (counts.get(row.defect_class) ?? 0) + 1);
    expect(counts.get("control")).toBe(50);
    for (const klass of ["value_perturbation", "unit_swap", "endpoint_sibling_swap", "lifecycle_flip", "period_shift", "wrong_block_recite"]) {
      expect(counts.get(klass)).toBeGreaterThanOrEqual(1);
    }
    const value = first.find((row) => row.defect_class === "value_perturbation");
    expect(value?.record_id).toContain("__seeded-value_perturbation-");
    expect(value?.expected_verdict).toBe("unsupported_or_wrong");
    const control = first.find((row) => row.defect_class === "control");
    expect(control?.record_id).toContain("__seeded-control-");
    expect(control?.expected_verdict === "supported" || control?.expected_verdict === "partially_supported").toBe(true);
  });
});
