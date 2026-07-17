import { validateRepo, type MtaValidationReport } from "@mta-wiki/agents";
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
    if (report.issues.length > 0) process.exitCode = 1;
  },
} satisfies Record<string, CommandHandler>;
