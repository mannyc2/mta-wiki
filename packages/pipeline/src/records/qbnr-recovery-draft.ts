import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type { JsonValue, MtaCanonicalRecord, StagedSourceBlock } from "@mta-wiki/db/types";
import type { RouteAnchorRow } from "@mta-wiki/pipeline/materialize/route-anchors";
import { readCanonicalRecordsFromDbFile } from "@mta-wiki/pipeline/materialize/canonical-read";
import { loadOperationalCoverageArtifacts } from "@mta-wiki/pipeline/quality/operational-coverage-artifacts";
import {
  operationalRecoveryBlockResolver,
  operationalRecoveryProposalRoot,
  validateOperationalRecoveryProposal,
  validateOperationalRecoveryProposalTree,
  type OperationalRecoveryObservationBundleProposal,
} from "@mta-wiki/pipeline/records/operational-recovery-proposals";
import {
  QBNR_SERVICE_CHANGES_SOURCE_ID,
  expandQbnrRecoveryBatch,
  type QbnrClause,
  type QbnrContextClause,
  type QbnrRecoveryBatchSpec,
  type QbnrRecoveryUnitSpec,
  type QbnrRouteResolution,
  type QbnrStudyDisposition,
  type QbnrTreatmentClause,
} from "@mta-wiki/pipeline/records/qbnr-recovery-expander";

export type QbnrRecoveryDraftOptions = {
  rootDir?: string | undefined;
  records?: readonly MtaCanonicalRecord[] | undefined;
  blocks?: readonly StagedSourceBlock[] | undefined;
  routeAnchors?: readonly RouteAnchorRow[] | undefined;
  currentCorpusFingerprint?: string | undefined;
  knownGapIds?: ReadonlySet<string> | undefined;
};

export type QbnrRecoveryDraftResult = {
  output_path: string;
  proposal: OperationalRecoveryObservationBundleProposal;
  content: string;
};

function fail(message: string): never {
  throw new Error(`Cannot draft QBNR recovery proposal: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const extra = Object.keys(value).filter((field) => !allowedSet.has(field)).sort();
  if (extra.length > 0) fail(`${path} has unknown field(s): ${extra.join(", ")}`);
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) fail(`${path} must be a non-empty string`);
  return value.trim();
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : string(value, path);
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) fail(`${path} must be a non-empty string array`);
  return value.map((item, index) => string(item, `${path}[${index}]`));
}

function uniqueStrings(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) fail(`${path} must not contain duplicates`);
}

function routeResolution(value: unknown, path: string): QbnrRouteResolution {
  const parsed = object(value, path);
  const mode = string(parsed.mode, `${path}.mode`);
  if (mode === "create") {
    exactFields(parsed, ["mode"], path);
    return { mode };
  }
  if (mode === "target") {
    exactFields(parsed, ["mode", "target_record_id"], path);
    return { mode, target_record_id: string(parsed.target_record_id, `${path}.target_record_id`) };
  }
  return fail(`${path}.mode must be create or target`);
}

function studyDisposition(value: unknown, path: string): QbnrStudyDisposition {
  const parsed = object(value, path);
  const status = string(parsed.status, `${path}.status`);
  if (status === "projectable") {
    exactFields(parsed, ["status", "gtfs_route_id"], path);
    return { status, gtfs_route_id: string(parsed.gtfs_route_id, `${path}.gtfs_route_id`) };
  }
  if (status === "excluded") {
    exactFields(parsed, ["status", "reason", "gtfs_route_id"], path);
    const gtfsRouteId = optionalString(parsed.gtfs_route_id, `${path}.gtfs_route_id`);
    return {
      status,
      reason: string(parsed.reason, `${path}.reason`),
      ...(gtfsRouteId ? { gtfs_route_id: gtfsRouteId } : {}),
    };
  }
  return fail(`${path}.status must be projectable or excluded`);
}

function clause(value: unknown, path: string): QbnrClause {
  const parsed = object(value, path);
  const kind = string(parsed.clause_kind, `${path}.clause_kind`);
  if (kind === "context") {
    exactFields(parsed, ["clause_kind", "source_quote", "review_rationale"], path);
    return {
      clause_kind: kind,
      source_quote: string(parsed.source_quote, `${path}.source_quote`),
      review_rationale: string(parsed.review_rationale, `${path}.review_rationale`),
    } satisfies QbnrContextClause;
  }
  if (kind === "treatment") {
    exactFields(parsed, [
      "clause_kind",
      "id",
      "label",
      "source_quote",
      "treatment_kind",
      "expected_treatment_family",
      "description",
      "location_text",
      "relation_label",
      "relation_description",
    ], path);
    const locationText = optionalString(parsed.location_text, `${path}.location_text`);
    const relationLabel = optionalString(parsed.relation_label, `${path}.relation_label`);
    const relationDescription = optionalString(parsed.relation_description, `${path}.relation_description`);
    return {
      clause_kind: kind,
      id: string(parsed.id, `${path}.id`),
      label: string(parsed.label, `${path}.label`),
      source_quote: string(parsed.source_quote, `${path}.source_quote`),
      treatment_kind: string(parsed.treatment_kind, `${path}.treatment_kind`),
      expected_treatment_family: string(parsed.expected_treatment_family, `${path}.expected_treatment_family`),
      description: string(parsed.description, `${path}.description`),
      ...(locationText ? { location_text: locationText } : {}),
      ...(relationLabel ? { relation_label: relationLabel } : {}),
      ...(relationDescription ? { relation_description: relationDescription } : {}),
    } satisfies QbnrTreatmentClause;
  }
  return fail(`${path}.clause_kind must be context or treatment`);
}

function unit(value: unknown, path: string): QbnrRecoveryUnitSpec {
  const parsed = object(value, path);
  exactFields(parsed, [
    "source_block_ids",
    "source_block_sha256s",
    "source_route_labels",
    "route_label",
    "route_resolution",
    "study_disposition",
    "event_kind",
    "occurrence_shape",
    "clauses",
  ], path);
  const eventKind = string(parsed.event_kind, `${path}.event_kind`);
  if (!["service_change", "start", "end", "rename"].includes(eventKind)) fail(`${path}.event_kind is unsupported`);
  const occurrenceShape = string(parsed.occurrence_shape, `${path}.occurrence_shape`);
  if (occurrenceShape !== "atomic" && occurrenceShape !== "bundle") fail(`${path}.occurrence_shape is unsupported`);
  if (!Array.isArray(parsed.clauses) || parsed.clauses.length === 0) fail(`${path}.clauses must be a non-empty array`);
  const sourceBlockIds = strings(parsed.source_block_ids, `${path}.source_block_ids`);
  const sourceBlockSha256s = strings(parsed.source_block_sha256s, `${path}.source_block_sha256s`);
  const sourceRouteLabels = strings(parsed.source_route_labels, `${path}.source_route_labels`);
  uniqueStrings(sourceBlockIds, `${path}.source_block_ids`);
  return {
    source_block_ids: sourceBlockIds,
    source_block_sha256s: sourceBlockSha256s,
    source_route_labels: sourceRouteLabels,
    route_label: string(parsed.route_label, `${path}.route_label`),
    route_resolution: routeResolution(parsed.route_resolution, `${path}.route_resolution`),
    study_disposition: studyDisposition(parsed.study_disposition, `${path}.study_disposition`),
    event_kind: eventKind as QbnrRecoveryUnitSpec["event_kind"],
    occurrence_shape: occurrenceShape,
    clauses: parsed.clauses.map((item, index) => clause(item, `${path}.clauses[${index}]`)),
  };
}

export function parseQbnrRecoveryBatchSpec(value: unknown, path = "QBNR recovery batch spec"): QbnrRecoveryBatchSpec {
  const parsed = object(value, path);
  exactFields(parsed, [
    "proposal_id",
    "corpus_fingerprint",
    "gap_ids",
    "project_record_id",
    "project_label",
    "drafted_by",
    "drafted_at",
    "rationale",
    "units",
  ], path);
  if (!Array.isArray(parsed.units) || parsed.units.length === 0) fail(`${path}.units must be a non-empty array`);
  const gapIds = strings(parsed.gap_ids, `${path}.gap_ids`);
  uniqueStrings(gapIds, `${path}.gap_ids`);
  return {
    proposal_id: string(parsed.proposal_id, `${path}.proposal_id`),
    corpus_fingerprint: string(parsed.corpus_fingerprint, `${path}.corpus_fingerprint`),
    gap_ids: gapIds,
    project_record_id: string(parsed.project_record_id, `${path}.project_record_id`),
    project_label: string(parsed.project_label, `${path}.project_label`),
    drafted_by: string(parsed.drafted_by, `${path}.drafted_by`),
    drafted_at: string(parsed.drafted_at, `${path}.drafted_at`),
    rationale: string(parsed.rationale, `${path}.rationale`),
    units: parsed.units.map((item, index) => unit(item, `${path}.units[${index}]`)),
  };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    fail(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) fail(`required input is missing: ${path}`);
  return readFileSync(path, "utf8").split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line) as T];
    } catch (error) {
      fail(`${path}:${index + 1} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? jsonFiles(path) : entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
  }).sort((left, right) => left.localeCompare(right));
}

function assertPinnedTargetAnchors(spec: QbnrRecoveryBatchSpec, routeAnchors: readonly RouteAnchorRow[]): void {
  for (const [index, candidate] of spec.units.entries()) {
    if (candidate.route_resolution.mode !== "target" || candidate.study_disposition.status !== "projectable") continue;
    const gtfsRouteId = candidate.study_disposition.gtfs_route_id;
    const targetRecordId = candidate.route_resolution.target_record_id;
    const gtfsMatches = routeAnchors.filter((row) => row.gtfs_route_id === gtfsRouteId);
    if (gtfsMatches.length !== 1) {
      fail(`units[${index}] GTFS route ${gtfsRouteId} must have exactly one row in the pinned route-anchor release; found ${gtfsMatches.length}`);
    }
    const anchor = gtfsMatches[0]!;
    if (anchor.disposition !== "true_route" || !anchor.canonical_route_record_id) {
      fail(`units[${index}] GTFS route ${gtfsRouteId} is not a canonical true-route anchor in the pinned release`);
    }
    if (anchor.canonical_route_record_id !== targetRecordId) {
      fail(
        `units[${index}] target ${targetRecordId} does not match pinned ${gtfsRouteId} anchor ${anchor.canonical_route_record_id}`,
      );
    }
    const targetMatches = routeAnchors.filter(
      (row) => row.disposition === "true_route" && row.canonical_route_record_id === targetRecordId,
    );
    if (targetMatches.length !== 1 || targetMatches[0]!.gtfs_route_id !== gtfsRouteId) {
      fail(
        `units[${index}] target ${targetRecordId} is not uniquely anchored to GTFS route ${gtfsRouteId}`,
      );
    }
  }
}

function resolveSpecPath(specPath: string): string {
  const path = resolve(specPath);
  if (!existsSync(path) || !statSync(path).isFile()) fail(`spec file does not exist: ${path}`);
  if (!path.endsWith(".json")) fail(`spec file must use a .json extension: ${path}`);
  return path;
}

export function draftQbnrRecoveryProposalFromFile(
  specPath: string,
  options: QbnrRecoveryDraftOptions = {},
): QbnrRecoveryDraftResult {
  const rootDir = options.rootDir ?? repoRoot;
  const resolvedSpecPath = resolveSpecPath(specPath);
  const spec = parseQbnrRecoveryBatchSpec(readJson(resolvedSpecPath), resolvedSpecPath);

  const needsCoverage = options.currentCorpusFingerprint === undefined ||
    options.knownGapIds === undefined || options.routeAnchors === undefined;
  const coverage = needsCoverage ? loadOperationalCoverageArtifacts({ rootDir }) : undefined;
  const currentCorpusFingerprint = options.currentCorpusFingerprint ?? coverage!.build.matrix.corpus_fingerprint;
  const knownGapIds = options.knownGapIds ?? new Set(coverage!.build.ledger.gaps.map((gap) => gap.gap_id));
  const routeAnchors = options.routeAnchors ?? readJsonl<RouteAnchorRow>(
    resolve(rootDir, coverage!.build.manifest.route_anchor_path),
  );
  const records = options.records ?? readCanonicalRecordsFromDbFile(join(rootDir, "data", "canonical.db"));
  if (!records) fail(`canonical database is missing or unreadable: ${join(rootDir, "data", "canonical.db")}`);
  const blocks = options.blocks ?? readJsonl<StagedSourceBlock>(
    join(rootDir, "raw", "sources", QBNR_SERVICE_CHANGES_SOURCE_ID, "blocks.jsonl"),
  );

  if (spec.corpus_fingerprint !== currentCorpusFingerprint) {
    fail(`stale corpus_fingerprint ${spec.corpus_fingerprint}; current fingerprint is ${currentCorpusFingerprint}`);
  }
  for (const gapId of spec.gap_ids) {
    if (!knownGapIds.has(gapId)) fail(`unknown operational coverage gap ${gapId}`);
  }
  assertPinnedTargetAnchors(spec, routeAnchors);

  const proposalRoot = operationalRecoveryProposalRoot(rootDir);
  const duplicatePaths = jsonFiles(proposalRoot).filter((path) => basename(path) === `${spec.proposal_id}.json`);
  if (duplicatePaths.length > 0) {
    fail(`proposal ${spec.proposal_id} already exists at ${duplicatePaths.map((path) => relative(rootDir, path)).join(", ")}`);
  }

  const resolveBlock = operationalRecoveryBlockResolver(rootDir);
  const existing = validateOperationalRecoveryProposalTree({
    rootDir,
    records,
    currentCorpusFingerprint,
    knownGapIds,
    resolveBlock,
  });
  if (existing.issues.length > 0) {
    fail(`existing recovery proposal tree is invalid: ${existing.issues.map((issue) => issue.message).join("; ")}`);
  }

  const proposal = expandQbnrRecoveryBatch(spec, { blocks, records });
  const reasons = validateOperationalRecoveryProposal(proposal, {
    records,
    stage: "pending",
    current_corpus_fingerprint: currentCorpusFingerprint,
    known_gap_ids: knownGapIds,
    resolve_block: resolveBlock,
  });
  if (reasons.length > 0) fail(`expanded proposal is invalid: ${reasons.join("; ")}`);

  const content = `${JSON.stringify(proposal as unknown as JsonValue, null, 2)}\n`;
  const outputPath = join(proposalRoot, "observations", `${proposal.proposal_id}.json`);
  mkdirSync(join(proposalRoot, "observations"), { recursive: true });
  try {
    writeFileSync(outputPath, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    fail(`refusing to overwrite ${outputPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const complete = validateOperationalRecoveryProposalTree({
    rootDir,
    records,
    currentCorpusFingerprint,
    knownGapIds,
    resolveBlock,
  });
  if (complete.issues.length > 0) {
    // The file is new and exclusively created above, so removing only this failed draft is safe.
    unlinkSync(outputPath);
    fail(`draft would make the recovery proposal tree invalid: ${complete.issues.map((issue) => issue.message).join("; ")}`);
  }
  return { output_path: outputPath, proposal, content };
}
