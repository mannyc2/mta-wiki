import { entriesToRecords } from "../../src/materialize/materialize";
import { readCanonicalRecordsFromJsonl } from "../../src/materialize/canonical-read";
import { retiredSubmissionIds } from "../../src/records/submission-overrides";
import {
  readSemanticCorrections,
  readSemanticCorrectionSupersessions,
  withSemanticCorrections,
} from "../../src/records/semantic-corrections";
import { readSubmissionEntries } from "../../src/records/submissions";
import {
  readRelationshipDispositionLedger,
  validateRelationshipDispositionLedger,
} from "../../src/quality/relationship-dispositions";

export function runAuthoringAudit(): string[] {
  const corrected = withSemanticCorrections(
    entriesToRecords(readSubmissionEntries(), { retiredSubmissionIds: retiredSubmissionIds() }),
    readSemanticCorrections(),
    readSemanticCorrectionSupersessions(),
  );
  const failures = corrected.issues.map((issue) => `semantic correction: ${issue}`);
  if (corrected.records.length === 0) failures.push("journal replay produced zero canonical records");
  failures.push(...validateRelationshipDispositionLedger(corrected.records, readRelationshipDispositionLedger()));

  const tracked = readCanonicalRecordsFromJsonl();
  if (corrected.records.length !== tracked.length) {
    failures.push(`journal replay record count ${corrected.records.length} differs from tracked snapshot ${tracked.length}`);
  }
  return [...new Set(failures)].sort();
}
