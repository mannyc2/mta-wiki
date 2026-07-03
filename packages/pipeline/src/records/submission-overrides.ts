import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";
import type { MtaValidationIssue } from "@mta-wiki/db/types";

export interface SubmissionRetirementEntry {
  submission_id: string;
  reason: string;
  source_decision: string;
  reviewed_at: string;
}

export interface SubmissionRetirementOverrides {
  version: 1;
  retired: SubmissionRetirementEntry[];
}

const RETIREMENTS_PATH = join(repoRoot, "data/submission-overrides/retired.json");

export function submissionRetirementsPath(): string {
  return RETIREMENTS_PATH;
}

export function emptySubmissionRetirements(): SubmissionRetirementOverrides {
  return { version: 1, retired: [] };
}

export function readSubmissionRetirements(): SubmissionRetirementOverrides {
  if (!existsSync(RETIREMENTS_PATH)) {
    return emptySubmissionRetirements();
  }

  const parsed = JSON.parse(readFileSync(RETIREMENTS_PATH, "utf8")) as SubmissionRetirementOverrides;
  return parsed;
}

export function writeSubmissionRetirements(overrides: SubmissionRetirementOverrides): void {
  mkdirSync(dirname(RETIREMENTS_PATH), { recursive: true });
  writeFileSync(RETIREMENTS_PATH, `${JSON.stringify(overrides, null, 2)}\n`);
}

export function retiredSubmissionIds(): Set<string> {
  return new Set(readSubmissionRetirements().retired.map((entry) => entry.submission_id));
}

export function validateSubmissionRetirementOverrides(options: {
  knownSubmissionIds?: Set<string>;
} = {}): MtaValidationIssue[] {
  const issues: MtaValidationIssue[] = [];
  if (!existsSync(RETIREMENTS_PATH)) {
    return issues;
  }

  const path = relative(repoRoot, RETIREMENTS_PATH);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(RETIREMENTS_PATH, "utf8"));
  } catch (error) {
    issues.push({
      code: "invalid_submission_retirement_override",
      path,
      message: `submission retirement overrides must be valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    return issues;
  }

  if (!isRecord(parsed)) {
    issues.push({ code: "invalid_submission_retirement_override", path, message: "submission retirement overrides must be a JSON object" });
    return issues;
  }

  if (parsed.version !== 1) {
    issues.push({ code: "invalid_submission_retirement_override", path, message: "submission retirement overrides version must be 1" });
  }

  if (!Array.isArray(parsed.retired)) {
    issues.push({ code: "invalid_submission_retirement_override", path, message: "submission retirement overrides retired field must be an array" });
    return issues;
  }

  const seen = new Set<string>();
  parsed.retired.forEach((entry, index) => {
    const entryPath = `${path}#/retired/${index}`;
    if (!isRecord(entry)) {
      issues.push({ code: "invalid_submission_retirement_override", path: entryPath, message: "retirement entry must be a JSON object" });
      return;
    }

    const submissionId = stringField(entry, "submission_id");
    if (!submissionId) {
      issues.push({
        code: "invalid_submission_retirement_override",
        path: entryPath,
        message: "retirement entry submission_id must be a non-empty string",
      });
    } else {
      if (seen.has(submissionId)) {
        issues.push({
          code: "invalid_submission_retirement_override",
          path: entryPath,
          message: `duplicate retired submission_id ${submissionId}`,
        });
      }
      seen.add(submissionId);
      if (options.knownSubmissionIds && !options.knownSubmissionIds.has(submissionId)) {
        issues.push({
          code: "invalid_submission_retirement_override",
          path: entryPath,
          message: `retired submission_id ${submissionId} does not exist in submissions`,
        });
      }
    }

    for (const field of ["reason", "source_decision", "reviewed_at"] as const) {
      if (!stringField(entry, field)) {
        issues.push({
          code: "invalid_submission_retirement_override",
          path: entryPath,
          message: `retirement entry ${field} must be a non-empty string`,
        });
      }
    }
  });

  return issues;
}

export function currentSubmissionIdSet(): Set<string> {
  return new Set(readSubmissionEntries().map((entry) => entry.submission_id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value : undefined;
}
