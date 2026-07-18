import { validateRepo, type MtaValidationReport } from "@mta-wiki/agents";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { readReleaseStatus } from "@mta-wiki/pipeline/materialize/release-status";
import { verifyReleaseDirectory } from "@mta-wiki/pipeline/materialize/release-verifier";
import type { CommandHandler } from "./shared.js";

function printValidationReport(report: MtaValidationReport) {
  console.log("MTA wiki validation report");
  console.log(`Required paths checked: ${report.requiredPathCount}`);
  console.log(`Submissions: ${report.submissionCount}`);
  console.log(`Canonical records: ${report.canonicalRecordCount}`);
  console.log(`Wiki pages: ${report.wikiPageCount}`);

  console.log(`Issues: ${report.issues.length}`);
  for (const issue of report.issues.slice(0, 20)) {
    const location = [issue.path, issue.recordId].filter(Boolean).join(" ");
    console.log(`- ${issue.code}${location ? ` ${location}` : ""}: ${issue.message}`);
  }
  console.log(`Warnings: ${report.warnings.length}`);
  for (const warning of report.warnings.slice(0, 20)) {
    const location = [warning.path, warning.recordId].filter(Boolean).join(" ");
    console.log(`- ${warning.code}${location ? ` ${location}` : ""}: ${warning.message}`);
  }
}

function validateReleaseContracts(): string[] {
  const issues: string[] = [];
  const releasesDir = join(repoRoot, "data", "exports", "releases");
  const latest = readFileSync(join(releasesDir, "LATEST"), "utf8").trim();
  try {
    verifyReleaseDirectory(join(releasesDir, latest), latest);
  } catch (error) {
    issues.push(`LATEST ${latest}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const index = JSON.parse(readFileSync(join(repoRoot, "data", "exports", "release-status", "index.json"), "utf8")) as {
    records?: Array<{ release_id?: unknown }>;
  };
  for (const entry of index.records ?? []) {
    if (typeof entry.release_id !== "string") {
      issues.push("release-status index contains a non-string release_id");
      continue;
    }
    const status = readReleaseStatus(repoRoot, entry.release_id);
    if (!status) {
      issues.push(`release-status index cannot resolve ${entry.release_id}`);
      continue;
    }
    try {
      verifyReleaseDirectory(join(releasesDir, entry.release_id), entry.release_id, { allowQuarantined: true });
      issues.push(`quarantined release ${entry.release_id} unexpectedly passes strict verification`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes(status.failing_artifact.decoder_error)) {
        issues.push(`quarantined release ${entry.release_id} fails differently than recorded: ${message}`);
      }
    }
  }
  return issues;
}

export const validateCommands = {
  validate: () => {
    if (process.argv.includes("--relationship-enforce") && process.argv.includes("--relationship-warn")) {
      throw new Error("Choose only one relationship mode: --relationship-enforce or --relationship-warn");
    }
    const rawMode = process.argv.includes("--relationship-enforce")
      ? "enforce" as const
      : process.argv.includes("--relationship-warn")
        ? "warn" as const
        : undefined;
    const report = validateRepo({
      strictWriterCitations: process.argv.includes("--strict-writer-citations"),
      relationshipMode: rawMode,
    });
    printValidationReport(report);
    const releaseIssues = validateReleaseContracts();
    console.log(`Release contract issues: ${releaseIssues.length}`);
    for (const issue of releaseIssues) console.log(`- RELEASE_CONTRACT: ${issue}`);
    if (report.issues.length > 0 || releaseIssues.length > 0) process.exitCode = 1;
  },
} satisfies Record<string, CommandHandler>;
