import { validateRepo, type MtaValidationReport } from "@mta-wiki/agents";
import type { CommandHandler } from "./shared.js";

function printValidationReport(report: MtaValidationReport) {
  console.log("MTA wiki validation report");
  console.log(`Required paths checked: ${report.requiredPathCount}`);
  console.log(`Submissions: ${report.submissionCount}`);
  console.log(`Canonical records: ${report.canonicalRecordCount}`);
  console.log(`Wiki pages: ${report.wikiPageCount}`);

  if (report.issues.length === 0) {
    console.log("Issues: 0");
    return;
  }

  console.log(`Issues: ${report.issues.length}`);
  for (const issue of report.issues.slice(0, 20)) {
    const location = [issue.path, issue.recordId].filter(Boolean).join(" ");
    console.log(`- ${issue.code}${location ? ` ${location}` : ""}: ${issue.message}`);
  }
}

export const validateCommands = {
  validate: () => {
    const report = validateRepo();
    printValidationReport(report);
    if (report.issues.length > 0) process.exitCode = 1;
  },
} satisfies Record<string, CommandHandler>;
