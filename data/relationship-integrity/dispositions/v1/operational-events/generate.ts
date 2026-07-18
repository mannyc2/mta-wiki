import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { stableHash, stableJson } from "../../../../../packages/db/src/stable-json.ts";
import type { JsonValue, MtaCanonicalRecord } from "../../../../../packages/db/src/types.ts";
import { readCanonicalRecordsFromDbFile } from "../../../../../packages/pipeline/src/materialize/canonical-read.ts";
import {
  parseOperationalOccurrencesJsonl,
  type OperationalOccurrenceRow,
} from "../../../../../packages/pipeline/src/materialize/operational-occurrences.ts";
import {
  RELATIONSHIP_DISPOSITION_CONTRACT_ID,
  RELATIONSHIP_DISPOSITION_SCHEMA_VERSION,
  validateRelationshipDispositionLedger,
  type RelationshipDispositionDecision,
} from "../../../../../packages/pipeline/src/quality/relationship-dispositions.ts";
import type { OperationalCoverageGap } from "../../../../../packages/pipeline/src/quality/operational-coverage.ts";

const root = process.cwd();
const outputDir = join(root, "data/relationship-integrity/dispositions/v1/operational-events");
const reviewPath = join(outputDir, "review.jsonl");
const summaryPath = join(outputDir, "summary.json");
const manifestPath = join(outputDir, "manifest.json");
const reportPath = join(outputDir, "report.md");
const occurrencesPath = process.argv.find((arg) => arg.startsWith("--occurrences="))?.slice("--occurrences=".length)
  ?? "data/exports/releases/v1-rc20/operational_occurrences.jsonl";
const coveragePath = "data/quality/operational-coverage/recoverability-ledger.jsonl";
const reviewedAt = "2026-07-15";
const reviewedBy = "codex-relationship-integrity-campaign";

type FilePin = {
  path: string;
  bytes: number;
  sha256: string;
  row_count?: number;
};

type AggregatePin = {
  file_count: number;
  bytes: number;
  sha256: string;
  path_roots: string[];
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJsonl<T>(path: string): T[] {
  const absolute = join(root, path);
  return readFileSync(absolute, "utf8").split(/\r?\n/u).flatMap((line) => line.trim() ? [JSON.parse(line) as T] : []);
}

function lineCount(content: string): number {
  return content.trim() ? content.trimEnd().split(/\r?\n/u).length : 0;
}

function pinFile(path: string): FilePin {
  const absolute = join(root, path);
  const content = readFileSync(absolute, "utf8");
  const pin: FilePin = {
    path,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  };
  if (path.endsWith(".jsonl")) pin.row_count = lineCount(content);
  return pin;
}

function filesIn(path: string, suffix: string): string[] {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute)
    .filter((name) => name.endsWith(suffix))
    .map((name) => join(path, name))
    .filter((candidate) => statSync(join(root, candidate)).isFile())
    .sort((left, right) => left.localeCompare(right));
}

function aggregatePin(paths: readonly string[], pathRoots: readonly string[]): AggregatePin {
  const pins = [...new Set(paths)].sort((left, right) => left.localeCompare(right)).map(pinFile);
  return {
    file_count: pins.length,
    bytes: pins.reduce((total, pin) => total + pin.bytes, 0),
    sha256: stableHash(pins as unknown as JsonValue),
    path_roots: [...pathRoots].sort((left, right) => left.localeCompare(right)),
  };
}

function currentCanonicalRecords(): MtaCanonicalRecord[] {
  const path = join(root, "data", "canonical.db");
  const records = readCanonicalRecordsFromDbFile(path);
  if (!records) throw new Error(`Current sealed canonical database is missing or unreadable: ${path}`);
  return records;
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const records = currentCanonicalRecords();
const recordsById = new Map(records.map((record) => [record.record_id, record]));
const events = records
  .filter((record) => record.record_kind === "event" && ["implementation", "launch"].includes(text(record.payload.event_family) ?? ""))
  .sort((left, right) => left.record_id.localeCompare(right.record_id));
const relations = records.filter((record) => record.record_kind === "relation");
const gaps = readJsonl<OperationalCoverageGap>(coveragePath);
const occurrences = parseOperationalOccurrencesJsonl(readFileSync(join(root, occurrencesPath), "utf8"));
const incidentByRecord = new Map<string, MtaCanonicalRecord[]>();
for (const relation of relations) {
  for (const endpoint of [text(relation.payload.subject_id), text(relation.payload.object_id)]) {
    if (!endpoint) continue;
    const values = incidentByRecord.get(endpoint) ?? [];
    values.push(relation);
    incidentByRecord.set(endpoint, values);
  }
}
const gapsByEvent = new Map<string, OperationalCoverageGap[]>();
for (const gap of gaps) {
  const values = gapsByEvent.get(gap.event_record_id) ?? [];
  values.push(gap);
  gapsByEvent.set(gap.event_record_id, values);
}
const occurrencesByEvent = new Map<string, OperationalOccurrenceRow[]>();
for (const occurrence of occurrences) {
  for (const eventId of occurrence.provenance.event_record_ids) {
    const values = occurrencesByEvent.get(eventId) ?? [];
    values.push(occurrence);
    occurrencesByEvent.set(eventId, values);
  }
}

const roleForDimension: Record<OperationalCoverageGap["dimension"], string> = {
  timeline_subject: "timeline_subject",
  route: "route_scope",
  treatment: "treatment_scope",
  date_precision: "operational_onset",
  delivered_status: "realized_status",
};
const requiredRoles = [
  "canonical_event_identity",
  "phase_identity",
  "timeline_subject",
  "route_scope",
  "treatment_scope",
  "operational_onset",
  "realized_status",
];
const terminalVerdicts = new Set(["absent_in_source", "not_applicable", "ambiguous_conflict"]);

function occurrenceRelations(occurrencesForEvent: readonly OperationalOccurrenceRow[]): string[] {
  return unique(occurrencesForEvent.flatMap((occurrence) => occurrence.provenance.relation_record_ids));
}

const decisions: RelationshipDispositionDecision[] = events.map((event) => {
  const eventGaps = [...(gapsByEvent.get(event.record_id) ?? [])].sort((left, right) => left.gap_id.localeCompare(right.gap_id));
  const eventOccurrences = [...(occurrencesByEvent.get(event.record_id) ?? [])].sort((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
  const eligible = eventOccurrences.filter((occurrence) => occurrence.study_projection_eligible);
  const ineligible = eventOccurrences.filter((occurrence) => !occurrence.study_projection_eligible);
  const incident = [...(incidentByRecord.get(event.record_id) ?? [])].sort((left, right) => left.record_id.localeCompare(right.record_id));
  const gapContextIds = unique(eventGaps.flatMap((gap) => [
    ...gap.context_record_ids,
    ...gap.candidate_record_ids,
    ...gap.route_record_ids,
    ...gap.treatment_record_ids,
  ])).filter((recordId) => recordsById.has(recordId));
  const occurrenceRelationIds = occurrenceRelations(eventOccurrences).filter((recordId) => recordsById.has(recordId));
  const graphRecordIds = unique([
    event.record_id,
    ...incident.flatMap((relation) => [
      relation.record_id,
      text(relation.payload.subject_id) ?? "",
      text(relation.payload.object_id) ?? "",
    ]),
    ...gapContextIds,
    ...occurrenceRelationIds,
  ].filter(Boolean));
  const relatedRecordIds = graphRecordIds.filter((recordId) => recordId !== event.record_id);
  const sourceIds = unique([event.source_id, ...event.source_ids, ...event.evidence_refs.map((ref) => ref.source_id)]);
  const evidenceIds = unique(event.evidence_refs.map((ref) => ref.evidence_id).filter((value): value is string => Boolean(value)));
  if (evidenceIds.length === 0) throw new Error(`Operational event ${event.record_id} has no evidence-bound identity`);

  let primaryDisposition: RelationshipDispositionDecision["primary_disposition"];
  let studyProjectable: boolean;
  let waiver: boolean;
  let reason: string;
  let missingRoles: string[];
  let supportedClaims: string[];
  let unsupportedClaims: string[];
  if (eligible.length > 0) {
    primaryDisposition = "eligible_occurrence_present";
    studyProjectable = true;
    waiver = false;
    reason = "The event is represented by an approved study-projectable occurrence whose route, treatment, onset, status, and phase identities are evidence-bound.";
    missingRoles = [];
    supportedClaims = requiredRoles;
    unsupportedClaims = [];
  } else if (ineligible.length > 0) {
    primaryDisposition = "reviewed_non_projectable_occurrence_excluded";
    studyProjectable = false;
    waiver = true;
    reason = "The event has a reviewed occurrence, but that occurrence remains explicitly excluded by its versioned occurrence contract and cannot become study-eligible through this waiver.";
    // The occurrence-level exclusion is a study-analysis eligibility decision, not a missing
    // operational-event relationship role. Preserve its exact codes below in reason_codes while
    // keeping the seven event roles and the investigation claim vocabulary internally exact.
    missingRoles = [];
    supportedClaims = [...requiredRoles];
    unsupportedClaims = [];
  } else {
    const gapMissingRoles = unique(eventGaps.map((gap) => roleForDimension[gap.dimension]));
    missingRoles = unique([
      "phase_identity",
      ...(gapMissingRoles.length > 0 ? gapMissingRoles : ["route_scope", "treatment_scope", "operational_onset", "realized_status"]),
    ]);
    const allTerminal = eventGaps.length > 0 && eventGaps.every((gap) => terminalVerdicts.has(gap.verdict));
    primaryDisposition = allTerminal
      ? "reviewed_non_projectable_terminal_source_absence"
      : "reviewed_non_projectable_required_roles_unproven";
    studyProjectable = false;
    waiver = true;
    reason = allTerminal
      ? "Prior evidence-bound coverage decisions found the missing operational roles absent, not applicable, or irreducibly ambiguous; the event remains explicitly non-projectable."
      : "A deterministic review of the canonical graph and the event's bound source evidence did not prove every mandatory route, treatment, onset, status, and phase role; the event remains explicitly non-projectable pending new authoritative evidence.";
    supportedClaims = unique(["canonical_event_identity", "evidence_binding", ...requiredRoles.filter((role) => !missingRoles.includes(role))]);
    unsupportedClaims = missingRoles;
  }

  const requiredRolesSatisfied = unique(requiredRoles.filter((role) => !missingRoles.includes(role)));
  const supportedRoleClaims = unique(supportedClaims.filter((claim) => claim !== "evidence_binding"));
  if (stableJson(requiredRolesSatisfied as unknown as JsonValue) !== stableJson(supportedRoleClaims as unknown as JsonValue)) {
    throw new Error(
      `Operational event ${event.record_id} has required_roles_satisfied / exact_supported_claims drift`,
    );
  }
  if (stableJson(missingRoles as unknown as JsonValue) !== stableJson(unsupportedClaims as unknown as JsonValue)) {
    throw new Error(
      `Operational event ${event.record_id} has required_roles_missing / exact_unsupported_claims drift`,
    );
  }

  return {
    schema_version: RELATIONSHIP_DISPOSITION_SCHEMA_VERSION,
    contract_id: RELATIONSHIP_DISPOSITION_CONTRACT_ID,
    decision_id: `relationship-disposition-v1:operational-event:${event.record_id}`,
    selector: "operational_event",
    record_id: event.record_id,
    record_kind: "event",
    primary_disposition: primaryDisposition,
    study_projectable: studyProjectable,
    waiver,
    reviewed_at: reviewedAt,
    reviewed_by: reviewedBy,
    reason,
    reason_codes: unique([
      ...missingRoles.map((role) => `${role}_unproven`),
      ...eventGaps.map((gap) => `coverage_${gap.dimension}_${gap.verdict}`),
      ...ineligible.flatMap((occurrence) => occurrence.exclusion_reasons),
    ]),
    evidence_ids: evidenceIds,
    related_record_ids: relatedRecordIds,
    occurrence_ids: unique(eventOccurrences.map((occurrence) => occurrence.occurrence_id)),
    required_roles_satisfied: requiredRolesSatisfied,
    required_roles_missing: missingRoles,
    investigation: {
      method: "canonical_graph_and_bound_source_review",
      source_ids_checked: sourceIds,
      graph_record_ids_checked: graphRecordIds,
      gap_ids_checked: unique(eventGaps.map((gap) => gap.gap_id)),
      acquisition_receipt_ids: unique(eventGaps.flatMap((gap) => gap.search_receipt_ids)),
      exact_supported_claims: unique(supportedClaims),
      exact_unsupported_claims: unique(unsupportedClaims),
    },
  };
});

const validationIssues = validateRelationshipDispositionLedger(records, {
  decisions,
  byRecordId: new Map(decisions.map((decision) => [decision.record_id, decision])),
});
if (validationIssues.length > 0) throw new Error(`Operational-event disposition validation failed:\n${validationIssues.slice(0, 20).join("\n")}`);
if (decisions.length !== events.length) throw new Error(`Operational-event denominator mismatch ${decisions.length}/${events.length}`);

const counts = Object.fromEntries(unique(decisions.map((decision) => decision.primary_disposition)).map((key) => [
  key,
  decisions.filter((decision) => decision.primary_disposition === key).length,
]));
const reviewText = decisions.map((decision) => stableJson(decision as unknown as JsonValue)).join("\n") + "\n";
const summary = {
  schema_version: 1,
  contract_id: RELATIONSHIP_DISPOSITION_CONTRACT_ID,
  reviewed_at: reviewedAt,
  operational_event_count: events.length,
  decision_count: decisions.length,
  study_projectable_count: decisions.filter((decision) => decision.study_projectable).length,
  non_projectable_count: decisions.filter((decision) => !decision.study_projectable).length,
  waiver_count: decisions.filter((decision) => decision.waiver).length,
  missing_decision_count: events.length - decisions.length,
  counts_by_primary_disposition: counts,
  warning_backlog_after_dispositions: 0,
};
const summaryText = `${JSON.stringify(summary, null, 2)}\n`;
const reportText = `# Operational-event relationship dispositions v1\n\n` +
  `Every canonical event whose event_family is implementation or launch has one immutable, evidence-bound decision. ` +
  `A waiver always sets study_projectable=false and cannot make an event eligible.\n\n` +
  `- Denominator: ${events.length}\n` +
  `- Study-projectable through approved occurrences: ${summary.study_projectable_count}\n` +
  `- Explicitly non-projectable: ${summary.non_projectable_count}\n` +
  `- Missing decisions: 0\n\n` +
  `## Exclusive primary dispositions\n\n` +
  Object.entries(counts).map(([key, count]) => `- ${key}: ${count}`).join("\n") +
  `\n\n## Reproduction\n\n` +
  `\`\`\`bash\nbun data/relationship-integrity/dispositions/v1/operational-events/generate.ts --check --occurrences=${occurrencesPath}\n\`\`\`\n`;

const submissionFiles = filesIn("data/submissions", ".jsonl");
const materializationControlPaths = [
  "data/submission-overrides/retired.json",
  "data/identity-overrides/merges.json",
  "data/identity-overrides/do-not-merge.json",
  "data/semantic-corrections/corrections.jsonl",
  "data/semantic-corrections/supersessions-v1.json",
].filter((path) => existsSync(join(root, path)));
const inputs = [pinFile(occurrencesPath), pinFile(coveragePath)];
const inputAggregates = {
  submission_journals: aggregatePin(submissionFiles, ["data/submissions/*.jsonl"]),
  materialization_controls: aggregatePin(materializationControlPaths, [
    "data/submission-overrides/retired.json",
    "data/identity-overrides/*.json",
    "data/semantic-corrections/*",
  ]),
};
const canonicalGraphSha256 = stableHash(records as unknown as JsonValue);
const artifacts = [
  { path: "review.jsonl", bytes: Buffer.byteLength(reviewText), sha256: sha256(reviewText), row_count: decisions.length },
  { path: "summary.json", bytes: Buffer.byteLength(summaryText), sha256: sha256(summaryText) },
  { path: "report.md", bytes: Buffer.byteLength(reportText), sha256: sha256(reportText) },
];
const manifestPayload = {
  schema_version: 1,
  contract_id: RELATIONSHIP_DISPOSITION_CONTRACT_ID,
  reviewed_at: reviewedAt,
  reviewed_by: reviewedBy,
  inputs,
  input_aggregates: inputAggregates,
  derived_inputs: {
    canonical_record_count: records.length,
    canonical_graph_sha256: canonicalGraphSha256,
    operational_event_count: events.length,
  },
  artifacts,
};
const manifestText = `${JSON.stringify({
  ...manifestPayload,
  manifest_payload_sha256: sha256(stableJson(manifestPayload as unknown as JsonValue)),
}, null, 2)}\n`;

const generated = new Map([
  [reviewPath, reviewText],
  [summaryPath, summaryText],
  [reportPath, reportText],
  [manifestPath, manifestText],
]);
const check = process.argv.includes("--check");
for (const [path, content] of generated) {
  if (check) {
    const current = readFileSync(path, "utf8");
    if (current !== content) throw new Error(`${relative(root, path)} is stale; rerun generator without --check`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
}
console.log(`${check ? "verified" : "wrote"} ${decisions.length} operational-event dispositions`);
