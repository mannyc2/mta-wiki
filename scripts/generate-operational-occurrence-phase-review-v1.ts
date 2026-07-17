import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { sha256, stableHash, stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import { entriesToRecords } from "../packages/pipeline/src/materialize/materialize";
import { loadOperationalAnchorReviewDecisions } from "../packages/pipeline/src/materialize/operational-anchor-review";
import { loadOperationalOccurrenceIdentityRegistry } from "../packages/pipeline/src/materialize/operational-occurrence-identity";
import { loadOperationalOccurrenceAcceptedDecisions } from "../packages/pipeline/src/materialize/operational-occurrence-review";
import {
  computeOperationalOccurrences,
  OPERATIONAL_OCCURRENCE_PHASE_RELATION_ALLOWLIST,
} from "../packages/pipeline/src/materialize/operational-occurrences";
import type { RouteAnchorRow } from "../packages/pipeline/src/materialize/route-anchors";
import {
  buildOperationalOccurrencePhaseReview,
  OPERATIONAL_OCCURRENCE_PHASE_REVIEW_CONTRACT_ID,
  OPERATIONAL_OCCURRENCE_PHASE_REVIEW_LEDGER_ID,
  OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION,
  OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_AT,
  OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_BY,
} from "../packages/pipeline/src/quality/operational-occurrence-phases";
import { retiredSubmissionIds } from "../packages/pipeline/src/records/submission-overrides";
import {
  readSemanticCorrections,
  readSemanticCorrectionSupersessions,
  withSemanticCorrections,
} from "../packages/pipeline/src/records/semantic-corrections";
import { readSubmissionEntries } from "../packages/pipeline/src/records/submissions";

const RC20_MANIFEST_SHA256 =
  "a2e9147fbb3db3b27a48df27f9550a8b31ab28bc85e30b7166d75b46b54e1a08";
const DEFAULT_ROUTE_ANCHOR_RELEASE_DIR = join(repoRoot, "data", "exports", "releases", "v1-rc20");
const CONTRACT_DIR = join(repoRoot, "data", "contracts", "operational-occurrence-phases", "v1");
const QUALITY_DIR = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "operational-occurrence-phases",
);

type Arguments = {
  check: boolean;
  routeAnchorReleaseDir: string;
};

type FilePin = {
  path: string;
  bytes: number;
  sha256: string;
  row_count?: number | undefined;
};

type AggregatePin = {
  file_count: number;
  bytes: number;
  sha256: string;
  path_roots: string[];
};

type ReleaseManifest = {
  release_id: string;
  files: Record<string, { bytes: number; sha256: string }>;
};

function parseArguments(argv: readonly string[]): Arguments {
  let check = false;
  let routeAnchorReleaseDir = DEFAULT_ROUTE_ANCHOR_RELEASE_DIR;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg === "--route-anchor-release-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error("--route-anchor-release-dir requires a path");
      routeAnchorReleaseDir = isAbsolute(value) ? value : resolve(repoRoot, value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { check, routeAnchorReleaseDir };
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonl<T>(rows: readonly T[]): string {
  return rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n") +
    (rows.length > 0 ? "\n" : "");
}

function lineCount(content: string): number {
  return content.trim() ? content.trimEnd().split(/\r?\n/u).length : 0;
}

function pinContent(path: string, content: string): FilePin {
  const result: FilePin = {
    path: relative(repoRoot, path).split("\\").join("/"),
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  };
  if (path.endsWith(".jsonl")) result.row_count = lineCount(content);
  return result;
}

function pinFile(path: string): FilePin {
  return pinContent(path, readFileSync(path, "utf8"));
}

function compareOrWrite(path: string, content: string, check: boolean): void {
  if (check) {
    if (!existsSync(path)) throw new Error(`Generated phase-review artifact is missing: ${relative(repoRoot, path)}`);
    if (readFileSync(path, "utf8") !== content) {
      throw new Error(`Generated phase-review artifact is stale: ${relative(repoRoot, path)}`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function filesIn(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
    .sort((left, right) => left.localeCompare(right));
}

function aggregatePin(paths: readonly string[], pathRoots: readonly string[]): AggregatePin {
  const pins = [...new Set(paths)].sort((left, right) => left.localeCompare(right)).map(pinFile);
  return {
    file_count: pins.length,
    bytes: pins.reduce((total, pin) => total + pin.bytes, 0),
    sha256: stableHash(pins as unknown as JsonValue),
    path_roots: [...pathRoots].sort(),
  };
}

function readVerifiedRouteAnchors(releaseDir: string): {
  rows: RouteAnchorRow[];
  manifest: ReleaseManifest;
  manifestPin: FilePin;
  routeAnchorsPin: FilePin;
  operationalOccurrences: JsonValue[];
  operationalOccurrencesPin: FilePin;
} {
  const manifestPath = join(releaseDir, "manifest.json");
  const routeAnchorsPath = join(releaseDir, "route_anchors.jsonl");
  const operationalOccurrencesPath = join(releaseDir, "operational_occurrences.jsonl");
  const manifestPin = pinFile(manifestPath);
  if (releaseDir === DEFAULT_ROUTE_ANCHOR_RELEASE_DIR && manifestPin.sha256 !== RC20_MANIFEST_SHA256) {
    throw new Error(
      `v1-rc20 manifest hash mismatch: expected ${RC20_MANIFEST_SHA256}, got ${manifestPin.sha256}`,
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ReleaseManifest;
  const routeAnchorsPin = pinFile(routeAnchorsPath);
  const expected = manifest.files["route_anchors.jsonl"];
  if (!expected || expected.bytes !== routeAnchorsPin.bytes || expected.sha256 !== routeAnchorsPin.sha256) {
    throw new Error(`${relative(repoRoot, routeAnchorsPath)} does not match its immutable release manifest`);
  }
  const rows = readFileSync(routeAnchorsPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as RouteAnchorRow;
      } catch (error) {
        throw new Error(`${routeAnchorsPath}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  const operationalOccurrencesPin = pinFile(operationalOccurrencesPath);
  const expectedOperationalOccurrences = manifest.files["operational_occurrences.jsonl"];
  if (
    !expectedOperationalOccurrences ||
    expectedOperationalOccurrences.bytes !== operationalOccurrencesPin.bytes ||
    expectedOperationalOccurrences.sha256 !== operationalOccurrencesPin.sha256
  ) {
    throw new Error(
      `${relative(repoRoot, operationalOccurrencesPath)} does not match its immutable release manifest`,
    );
  }
  const operationalOccurrences = readFileSync(operationalOccurrencesPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as JsonValue;
      } catch (error) {
        throw new Error(
          `${operationalOccurrencesPath}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  return {
    rows,
    manifest,
    manifestPin,
    routeAnchorsPin,
    operationalOccurrences,
    operationalOccurrencesPin,
  };
}

function currentCanonicalRecords(): MtaCanonicalRecord[] {
  const records = entriesToRecords(readSubmissionEntries(), {
    retiredSubmissionIds: retiredSubmissionIds(),
  });
  const corrected = withSemanticCorrections(
    records,
    readSemanticCorrections(),
    readSemanticCorrectionSupersessions(),
  );
  if (corrected.issues.length > 0) {
    throw new Error(
      `Current canonical materialization has ${corrected.issues.length} semantic-correction issue(s): ` +
        corrected.issues.slice(0, 8).map((issue) => `${issue.code} ${issue.recordId ?? issue.path ?? ""}: ${issue.message}`).join("; "),
    );
  }
  return corrected.records;
}

function canonicalPhaseProjection(records: readonly MtaCanonicalRecord[], recordIds: ReadonlySet<string>): JsonValue[] {
  return records
    .filter((record) => recordIds.has(record.record_id))
    .sort((left, right) => left.record_id.localeCompare(right.record_id))
    .map((record) => ({
      record_id: record.record_id,
      record_kind: record.record_kind,
      payload: record.payload,
      evidence_refs: record.evidence_refs,
      truth_status: record.truth_status,
      review_state: record.review_state,
    } as unknown as JsonValue));
}

function evidenceSourcePaths(records: readonly MtaCanonicalRecord[], recordIds: ReadonlySet<string>): string[] {
  return [...new Set(records
    .filter((record) => recordIds.has(record.record_id))
    .flatMap((record) => record.evidence_refs.flatMap((ref) => ref.source_path ? [ref.source_path] : []))
    .map((path) => isAbsolute(path) ? path : resolve(repoRoot, path))
    .filter((path) => existsSync(path) && statSync(path).isFile()))]
    .sort((left, right) => left.localeCompare(right));
}

function contractJson(): Record<string, unknown> {
  return {
    schema_version: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION,
    contract_id: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_CONTRACT_ID,
    ledger_id: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_LEDGER_ID,
    reviewed_at: OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_AT,
    reviewed_by: OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_BY,
    authority: {
      phase_identity: "canonical source_stated event records selected by accepted operational-occurrence or operational-anchor review",
      phase_relation: "canonical source_stated event-to-event relations explicitly selected by accepted occurrence review",
      evidence: "exact canonical evidence_id tuples on the selected event or relation",
    },
    endpoint_type_matrix: [{
      role: "earlier_or_later_phase",
      subject_kind: "event",
      object_kind: "event",
      distinct_endpoints_required: true,
      both_endpoints_must_be_occurrence_phases: true,
    }],
    allowed_phase_relation_semantics: OPERATIONAL_OCCURRENCE_PHASE_RELATION_ALLOWLIST,
    dispositions: {
      single_observed_phase_no_related_phase_asserted: {
        occurrence_schema_value: "single_phase",
        requirements: [
          "exactly_one_source_stated_canonical_event",
          "exact_event_evidence_ids",
          "zero_projected_phase_relations",
          "accepted_review_basis",
        ],
        semantic_limit: "No earlier/later relation is asserted inside this occurrence; this does not assert that the parent project has no other phases.",
      },
      evidence_bound_related_phases: {
        occurrence_schema_value: "related_phases",
        requirements: [
          "at_least_two_source_stated_canonical_events",
          "connected_allowlisted_event_relation_graph",
          "exact_event_and_relation_evidence_ids",
          "accepted_occurrence_review_selected_every_projected_relation",
        ],
      },
      review_required: {
        study_eligibility_effect: "must_not_be_used_to_satisfy_phase_completeness_enforcement",
      },
    },
    candidate_inventory: {
      universe: "every canonical relation whose endpoints both resolve to events and at least one endpoint is a reviewed occurrence phase",
      external_event_policy: "inventory_only_unless_the_accepted_occurrence_review_selects_the_other_event_and_exact_relation",
      non_allowlisted_policy: "inventory_as_non_phase_semantics_and_never_infer_temporal_order",
      same_occurrence_unselected_temporal_policy: "review_required",
    },
    prohibited_inferences: [
      "chronological_order_from_event_dates_alone",
      "shared_project_or_source_as_phase_membership",
      "street_name_or_route_similarity_as_phase_membership",
      "external_event_relation_as_cross_occurrence_phase_membership_without_accepted_review",
    ],
    enforcement_criteria: {
      endpoint_and_type_hard_error: "zero phase identity/relation endpoint, type, review-state, or exact-evidence findings",
      completeness_hard_error: "every occurrence has one reviewed no-related-phase disposition or a connected evidence-bound related-phase graph",
      candidate_reconciliation: "zero unprojected allowlisted temporal relations between events already selected in the same occurrence",
    },
  };
}

function reportMarkdown(input: {
  summary: ReturnType<typeof buildOperationalOccurrencePhaseReview>["summary"];
  releaseId: string;
  canonicalRecordCount: number;
  manifestSha256: string;
  operationalOccurrencesSha256: string;
  canonicalPhaseProjectionSha256: string;
  reproductionCommand: string;
}): string {
  const summary = input.summary;
  const dispositionLines = Object.entries(summary.counts_by_primary_disposition)
    .map(([name, count]) => `| ${name} | ${count} |`).join("\n");
  const candidateLines = Object.entries(summary.counts_by_candidate_disposition)
    .map(([name, count]) => `| ${name} | ${count} |`).join("\n");
  return `# Operational occurrence phase review v1\n\n` +
    `This deterministic review covers all ${summary.occurrence_count} current schema-v2 operational occurrences ` +
    `(${summary.eligible_occurrence_count} study-projectable and ${summary.ineligible_occurrence_count} ineligible). ` +
    `It treats canonical event records as physical phase identities and never derives earlier/later order from dates, labels, routes, or shared projects.\n\n` +
    `## Result\n\n` +
    `- Phase identity memberships: ${summary.phase_identity_membership_count}\n` +
    `- Unique canonical phase events: ${summary.unique_phase_event_count}\n` +
    `- Projected evidence-backed phase relations: ${summary.projected_phase_relation_count}\n` +
    `- Event-to-event candidates explicitly checked: ${summary.checked_event_event_candidate_count}\n` +
    `- Findings requiring review: ${Object.values(summary.finding_counts).reduce((total, count) => total + count, 0)}\n` +
    `- Phase hard-mode ready: ${summary.hard_mode_ready}\n\n` +
    `| Primary disposition | Count |\n| --- | ---: |\n${dispositionLines}\n\n` +
    `| Candidate disposition | Count |\n| --- | ---: |\n${candidateLines}\n\n` +
    `The single-phase disposition means only that the accepted occurrence review selected one evidenced event and asserted no earlier/later edge inside that occurrence. It is not a claim that the broader project has no other phases.\n\n` +
    `## Reproduction pins\n\n` +
    `- Route-anchor release: ${input.releaseId}\n` +
    `- Route-anchor release manifest SHA-256: \`${input.manifestSha256}\`\n` +
    `- Current canonical record count: ${input.canonicalRecordCount}\n` +
    `- Schema-v2 occurrence projection SHA-256: \`${input.operationalOccurrencesSha256}\`\n` +
    `- Canonical phase/event-relation projection SHA-256: \`${input.canonicalPhaseProjectionSha256}\`\n\n` +
    `Reproduce or verify with:\n\n` +
    "```bash\n" +
    `${input.reproductionCommand}\n` +
    "bun test packages/pipeline/test/quality/operational-occurrence-phases.test.ts\n" +
    "```\n";
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  const routeAnchorInput = readVerifiedRouteAnchors(args.routeAnchorReleaseDir);
  const routeAnchorReleasePath = relative(repoRoot, args.routeAnchorReleaseDir).split("\\").join("/");
  const reproductionCommand =
    `bun scripts/generate-operational-occurrence-phase-review-v1.ts --check --route-anchor-release-dir ${routeAnchorReleasePath}`;
  const records = currentCanonicalRecords();
  const occurrences = computeOperationalOccurrences(records, routeAnchorInput.rows, {
    reviewDecisions: loadOperationalAnchorReviewDecisions(),
    occurrenceReviewDecisions: loadOperationalOccurrenceAcceptedDecisions(),
    identityRegistry: loadOperationalOccurrenceIdentityRegistry(),
  });
  if (
    stableJson(occurrences as unknown as JsonValue) !==
    stableJson(routeAnchorInput.operationalOccurrences as unknown as JsonValue)
  ) {
    throw new Error(
      `Current schema-v2 occurrence projection does not exactly match immutable release ${routeAnchorInput.manifest.release_id}`,
    );
  }
  const build = buildOperationalOccurrencePhaseReview({ occurrences, records });

  const contractPath = join(CONTRACT_DIR, "contract.json");
  const ledgerPath = join(CONTRACT_DIR, "review-ledger.jsonl");
  const candidatesPath = join(QUALITY_DIR, "event-event-candidates.jsonl");
  const findingsPath = join(QUALITY_DIR, "findings.jsonl");
  const summaryPath = join(QUALITY_DIR, "summary.json");
  const reportPath = join(QUALITY_DIR, "report.md");
  const manifestPath = join(QUALITY_DIR, "manifest.json");

  const contractContent = json(contractJson());
  const ledgerContent = jsonl(build.decisions);
  const candidatesContent = jsonl(build.candidates);
  const findingsContent = jsonl(build.findings);

  const relevantRecordIds = new Set([
    ...build.decisions.flatMap((decision) => [
      ...decision.phase_record_ids,
      ...decision.phase_relation_record_ids,
    ]),
    ...build.candidates.map((candidate) => candidate.relation_record_id),
  ]);
  const canonicalProjection = canonicalPhaseProjection(records, relevantRecordIds);
  const operationalOccurrencesSha256 = stableHash(occurrences as unknown as JsonValue);
  const canonicalPhaseProjectionSha256 = stableHash(canonicalProjection as unknown as JsonValue);
  const missingEvidenceCodes = new Set([
    "OOPHASE_PHASE_EVENT_EVIDENCE_MISSING",
    "OOPHASE_PHASE_RELATION_EVIDENCE_MISSING",
    "OOPHASE_PHASE_RELATION_EVIDENCE_BINDING_MISMATCH",
  ]);
  const ambiguousPhaseCodes = new Set([
    "OOPHASE_PHASE_IDENTITY_DUPLICATE",
    "OOPHASE_PHASE_RELATION_DUPLICATE",
    "OOPHASE_UNPROJECTED_SAME_OCCURRENCE_TEMPORAL_RELATION",
  ]);
  const artifactSummary = {
    ...build.summary,
    ledger_id: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_LEDGER_ID,
    release_id: routeAnchorInput.manifest.release_id,
    reviewed_occurrence_count: build.decisions.filter((decision) => decision.review_state === "reviewed").length,
    single_observed_phase_count: build.decisions.filter((decision) =>
      decision.primary_disposition === "single_observed_phase_no_related_phase_asserted").length,
    related_phase_count: build.decisions.filter((decision) =>
      decision.primary_disposition === "evidence_bound_related_phases").length,
    unresolved_phase_count: build.decisions.filter((decision) => decision.review_state === "review_required").length,
    missing_evidence_count: build.findings.filter((finding) => missingEvidenceCodes.has(finding.code)).length,
    ambiguous_phase_count: build.findings.filter((finding) => ambiguousPhaseCodes.has(finding.code)).length,
    review_complete: build.decisions.length === occurrences.length &&
      build.decisions.every((decision) => decision.review_state === "reviewed"),
    violation_count: build.findings.length,
    content_hashes: {
      review_ledger_sha256: sha256(ledgerContent),
      event_event_candidates_sha256: sha256(candidatesContent),
      findings_sha256: sha256(findingsContent),
      operational_occurrences_sha256: operationalOccurrencesSha256,
      canonical_phase_projection_sha256: canonicalPhaseProjectionSha256,
    },
  };
  const summaryContent = json(artifactSummary);
  const reportContent = reportMarkdown({
    summary: build.summary,
    releaseId: routeAnchorInput.manifest.release_id,
    canonicalRecordCount: records.length,
    manifestSha256: routeAnchorInput.manifestPin.sha256,
    operationalOccurrencesSha256,
    canonicalPhaseProjectionSha256,
    reproductionCommand,
  });

  const submissionFiles = filesIn(join(repoRoot, "data", "submissions"), ".jsonl");
  const occurrenceDecisionFiles = filesIn(
    join(repoRoot, "data", "operational-occurrence-review", "accepted", "decisions"),
    ".json",
  );
  const anchorDecisionFiles = filesIn(
    join(repoRoot, "data", "operational-anchor-review", "accepted", "decisions"),
    ".json",
  );
  const controlFiles = [
    join(repoRoot, "data", "submission-overrides", "retired.json"),
    join(repoRoot, "data", "identity-overrides", "merges.json"),
    join(repoRoot, "data", "semantic-corrections", "corrections.jsonl"),
    join(repoRoot, "data", "semantic-corrections", "supersessions-v1.json"),
    join(repoRoot, "data", "operational-occurrence-identities", "registry.jsonl"),
  ].filter((path) => existsSync(path));
  const sourceEvidenceFiles = evidenceSourcePaths(records, relevantRecordIds);

  const outputContents = new Map<string, string>([
    [contractPath, contractContent],
    [ledgerPath, ledgerContent],
    [candidatesPath, candidatesContent],
    [findingsPath, findingsContent],
    [summaryPath, summaryContent],
    [reportPath, reportContent],
  ]);
  const outputPins = Object.fromEntries([...outputContents.entries()]
    .map(([path, content]) => [relative(repoRoot, path).split("\\").join("/"), pinContent(path, content)]));
  const manifestContent = json({
    schema_version: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_SCHEMA_VERSION,
    contract_id: OPERATIONAL_OCCURRENCE_PHASE_REVIEW_CONTRACT_ID,
    generated_at: OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_AT,
    generated_by: OPERATIONAL_OCCURRENCE_PHASE_REVIEWED_BY,
    route_anchor_release: {
      release_id: routeAnchorInput.manifest.release_id,
      manifest: routeAnchorInput.manifestPin,
      route_anchors: routeAnchorInput.routeAnchorsPin,
      operational_occurrences: routeAnchorInput.operationalOccurrencesPin,
    },
    input_aggregates: {
      submission_journals: aggregatePin(submissionFiles, ["data/submissions/*.jsonl"]),
      materialization_controls: aggregatePin(controlFiles, [
        "data/submission-overrides/retired.json",
        "data/identity-overrides/merges.json",
        "data/semantic-corrections/*",
        "data/operational-occurrence-identities/registry.jsonl",
      ]),
      occurrence_review_decisions: aggregatePin(occurrenceDecisionFiles, [
        "data/operational-occurrence-review/accepted/decisions/*.json",
      ]),
      anchor_review_decisions: aggregatePin(anchorDecisionFiles, [
        "data/operational-anchor-review/accepted/decisions/*.json",
      ]),
      exact_source_evidence_files: aggregatePin(sourceEvidenceFiles, [
        "canonical phase-event and event-event relation evidence source_path values",
      ]),
    },
    derived_inputs: {
      canonical_record_count: records.length,
      operational_occurrence_count: occurrences.length,
      operational_occurrences_sha256: operationalOccurrencesSha256,
      relevant_canonical_record_count: canonicalProjection.length,
      canonical_phase_projection_sha256: canonicalPhaseProjectionSha256,
    },
    outputs: outputPins,
    reproduction_command: reproductionCommand,
  });

  for (const [path, content] of outputContents) compareOrWrite(path, content, args.check);
  compareOrWrite(manifestPath, manifestContent, args.check);

  console.log(JSON.stringify({
    check: args.check,
    occurrence_count: build.summary.occurrence_count,
    eligible_occurrence_count: build.summary.eligible_occurrence_count,
    phase_identity_membership_count: build.summary.phase_identity_membership_count,
    projected_phase_relation_count: build.summary.projected_phase_relation_count,
    checked_event_event_candidate_count: build.summary.checked_event_event_candidate_count,
    finding_count: build.findings.length,
    hard_mode_ready: build.summary.hard_mode_ready,
    operational_occurrences_sha256: operationalOccurrencesSha256,
    canonical_phase_projection_sha256: canonicalPhaseProjectionSha256,
  }, null, 2));
}

main();
