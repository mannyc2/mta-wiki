import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  loadOperationalAnchorReviewDecisions,
  type OperationalAnchorReviewDecision,
} from "@mta-wiki/pipeline/materialize/operational-anchor-review";
import { readCanonicalRecordsFromDbFile } from "@mta-wiki/pipeline/materialize/canonical-read";
import {
  computeOperationalAnchorProjection,
  countOperationalFamilyEvents,
  summarizeOperationalAnchors,
  type OperationalAnchorSummary,
} from "@mta-wiki/pipeline/materialize/operational-anchors";
import {
  loadOperationalOccurrenceIdentityRegistry,
  type OperationalOccurrenceIdentityEntry,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-identity";
import {
  loadOperationalOccurrenceAcceptedDecisions,
  type OperationalOccurrenceAcceptedDecision,
} from "@mta-wiki/pipeline/materialize/operational-occurrence-review";
import { computeOperationalOccurrences } from "@mta-wiki/pipeline/materialize/operational-occurrences";
import type { RouteAnchorRow } from "@mta-wiki/pipeline/materialize/route-anchors";
import {
  DEFAULT_OPERATIONAL_STUDY_WINDOW,
  OPERATIONAL_COVERAGE_SCHEMA_VERSION,
  buildOperationalCoverageLedger,
  parseOperationalCoverageAcceptedDecision,
  parseOperationalCoverageSearchReceipt,
  type OperationalCoverageAcceptedDecision,
  type OperationalCoverageDateInterval,
  type OperationalCoverageGap,
  type OperationalCoverageLedger,
  type OperationalCoverageQueueRow,
  type OperationalCoverageSearchReceipt,
  type OperationalCoverageSummary,
} from "@mta-wiki/pipeline/quality/operational-coverage";

export const DEFAULT_OPERATIONAL_COVERAGE_ROUTE_ANCHORS = "data/exports/releases/v1-rc5/route_anchors.jsonl";
export const DEFAULT_OPERATIONAL_COVERAGE_OUTPUT_DIR = "data/quality/operational-coverage";
export const DEFAULT_OPERATIONAL_COVERAGE_DECISION_DIR = "data/operational-anchor-review/ledger-decisions/decisions";
export const DEFAULT_OPERATIONAL_COVERAGE_SEARCH_RECEIPT_DIR =
  "data/operational-anchor-review/ledger-decisions/search-receipts";

export type OperationalCoverageMatrix = {
  schema_version: typeof OPERATIONAL_COVERAGE_SCHEMA_VERSION;
  input_fingerprint: string;
  corpus_fingerprint: string;
  study_window: OperationalCoverageDateInterval;
  anchor_summary: OperationalAnchorSummary;
  operational_coverage: OperationalCoverageSummary;
  downstream: OperationalCoverageDownstreamLayer;
};

export type OperationalCoverageDownstreamLayer = {
  status: "pin_missing" | "pinned_release_not_present" | "verified";
  consumer: string | null;
  release_id: string | null;
  manifest_sha256: string | null;
  pinned_at: string | null;
  operational_anchor_summary: JsonValue | null;
  operational_occurrence_summary: JsonValue | null;
};

export type OperationalCoverageArtifactMetadata = {
  bytes: number;
  sha256: string;
  row_count?: number | undefined;
};

export type OperationalCoverageArtifactManifest = {
  schema_version: typeof OPERATIONAL_COVERAGE_SCHEMA_VERSION;
  input_fingerprint: string;
  corpus_fingerprint: string;
  canonical_record_count: number;
  route_anchor_path: string;
  route_anchor_release_id: string | null;
  route_anchor_sha256: string;
  route_anchor_count: number;
  anchor_review_decision_count: number;
  occurrence_review_decision_count: number;
  occurrence_identity_count: number;
  ledger_decision_count: number;
  search_receipt_count: number;
  files: Record<string, OperationalCoverageArtifactMetadata>;
};

export type OperationalCoverageRouteAnchorPin = {
  path: string;
  release_id: string | null;
  sha256: string;
};

export type OperationalCoverageArtifactBuild = {
  ledger: OperationalCoverageLedger;
  matrix: OperationalCoverageMatrix;
  manifest: OperationalCoverageArtifactManifest;
  contents: Record<string, string>;
};

export type BuildOperationalCoverageArtifactsInput = {
  records: readonly MtaCanonicalRecord[];
  routeAnchors: readonly RouteAnchorRow[];
  anchorReviewDecisions: readonly OperationalAnchorReviewDecision[];
  occurrenceReviewDecisions: readonly OperationalOccurrenceAcceptedDecision[];
  occurrenceIdentityRegistry: readonly OperationalOccurrenceIdentityEntry[];
  ledgerDecisions?: readonly OperationalCoverageAcceptedDecision[] | undefined;
  searchReceipts?: readonly OperationalCoverageSearchReceipt[] | undefined;
  routeAnchorPath?: string | undefined;
  routeAnchorReleaseId?: string | null | undefined;
  routeAnchorSha256?: string | undefined;
  studyWindow?: OperationalCoverageDateInterval | undefined;
  downstream?: OperationalCoverageDownstreamLayer | undefined;
};

export type WriteOperationalCoverageArtifactsOptions = {
  rootDir?: string | undefined;
  routeAnchorPath?: string | undefined;
  outputDir?: string | undefined;
  decisionDir?: string | undefined;
  searchReceiptDir?: string | undefined;
  studyWindow?: OperationalCoverageDateInterval | undefined;
};

export type WriteOperationalCoverageArtifactsResult = {
  outputDir: string;
  ledger: OperationalCoverageLedger;
  matrix: OperationalCoverageMatrix;
  manifest: OperationalCoverageArtifactManifest;
};

export type LoadOperationalCoverageArtifactsResult = {
  outputDir: string;
  build: OperationalCoverageArtifactBuild;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function slashPath(value: string): string {
  return value.split(sep).join("/");
}

function releaseIdForRouteAnchorPath(path: string): string | null {
  return /^data\/exports\/releases\/([^/]+)\/route_anchors\.jsonl$/u.exec(path)?.[1] ?? null;
}

function normalizedRepositoryPath(path: string, label: string): string {
  if (isAbsolute(path)) throw new Error(`${label} must be repository-relative: ${path}`);
  const normalized = slashPath(normalize(path));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized !== path.replace(/\\/gu, "/")) {
    throw new Error(`${label} is not a normalized repository-relative path: ${path}`);
  }
  return normalized;
}

function routeAnchorPin(
  path: string,
  content: string,
  releaseId = releaseIdForRouteAnchorPath(path),
): OperationalCoverageRouteAnchorPin {
  return { path, release_id: releaseId, sha256: sha256(content) };
}

export function sameOperationalCoverageRouteAnchorPin(
  left: OperationalCoverageRouteAnchorPin,
  right: OperationalCoverageRouteAnchorPin,
): boolean {
  return left.path === right.path && left.release_id === right.release_id && left.sha256 === right.sha256;
}

/**
 * Reads the persisted coverage manifest as the authority for its route-anchor
 * input and verifies that exact immutable artifact before a downstream action.
 */
export function loadOperationalCoverageRouteAnchorPin(options: {
  rootDir?: string | undefined;
  outputDir?: string | undefined;
} = {}): {
  pin: OperationalCoverageRouteAnchorPin;
  routeAnchors: RouteAnchorRow[];
  corpusFingerprint: string;
  inputFingerprint: string;
} {
  const rootDir = resolve(options.rootDir ?? repoRoot);
  const outputDir = resolve(rootDir, options.outputDir ?? DEFAULT_OPERATIONAL_COVERAGE_OUTPUT_DIR);
  const manifestPath = join(outputDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Required operational coverage manifest is missing: ${manifestPath}`);
  let manifest: Record<string, unknown>;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("expected an object");
    manifest = parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${manifestPath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof manifest.route_anchor_path !== "string" || !manifest.route_anchor_path) {
    throw new Error(`${manifestPath}: missing route_anchor_path pin`);
  }
  const path = normalizedRepositoryPath(manifest.route_anchor_path, `${manifestPath}: route_anchor_path`);
  const expectedReleaseId = releaseIdForRouteAnchorPath(path);
  if (manifest.route_anchor_release_id !== expectedReleaseId) {
    throw new Error(
      `${manifestPath}: route_anchor_release_id does not match route_anchor_path ` +
        `(expected ${expectedReleaseId ?? "null"}, found ${String(manifest.route_anchor_release_id)})`,
    );
  }
  if (typeof manifest.route_anchor_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(manifest.route_anchor_sha256)) {
    throw new Error(`${manifestPath}: missing or invalid route_anchor_sha256 pin`);
  }
  if (typeof manifest.corpus_fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(manifest.corpus_fingerprint)) {
    throw new Error(`${manifestPath}: missing or invalid corpus_fingerprint`);
  }
  if (typeof manifest.input_fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(manifest.input_fingerprint)) {
    throw new Error(`${manifestPath}: missing or invalid input_fingerprint`);
  }
  const absolutePath = resolve(rootDir, path);
  const rootPrefix = rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`;
  if (absolutePath !== rootDir && !absolutePath.startsWith(rootPrefix)) {
    throw new Error(`${manifestPath}: route_anchor_path escapes the repository root`);
  }
  if (!existsSync(absolutePath)) throw new Error(`Manifest-pinned route-anchor artifact is missing: ${absolutePath}`);
  const content = readFileSync(absolutePath, "utf8");
  const actual = routeAnchorPin(path, content, expectedReleaseId);
  if (actual.sha256 !== manifest.route_anchor_sha256) {
    throw new Error(
      `${manifestPath}: route_anchor_sha256 mismatch for ${path}; expected ${manifest.route_anchor_sha256}, found ${actual.sha256}`,
    );
  }
  const routeAnchors = readJsonl<RouteAnchorRow>(absolutePath);
  if (!Number.isInteger(manifest.route_anchor_count) || manifest.route_anchor_count !== routeAnchors.length) {
    throw new Error(
      `${manifestPath}: route_anchor_count mismatch for ${path}; expected ${String(manifest.route_anchor_count)}, found ${routeAnchors.length}`,
    );
  }
  return {
    pin: actual,
    routeAnchors,
    corpusFingerprint: manifest.corpus_fingerprint,
    inputFingerprint: manifest.input_fingerprint,
  };
}

function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}

function jsonl<T>(rows: readonly T[]): string {
  return rows.map((row) => stableJson(row as JsonValue)).join("\n") + (rows.length > 0 ? "\n" : "");
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) throw new Error(`Required operational coverage input is missing: ${path}`);
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error) {
        throw new Error(`${path}:${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
}

function readCoverageCanonicalRecords(rootDir: string): MtaCanonicalRecord[] {
  const path = join(rootDir, "data", "canonical.db");
  const records = readCanonicalRecordsFromDbFile(path);
  if (!records) throw new Error(`Required canonical database is missing or unreadable: ${path}`);
  return records;
}

function loadLedgerDecisions(dir: string): OperationalCoverageAcceptedDecision[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const path = join(dir, name);
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      } catch (error) {
        throw new Error(`${path}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      const decision = parseOperationalCoverageAcceptedDecision(parsed, path);
      if (`${decision.decision_id}.json` !== name) {
        throw new Error(`${path}: decision_id must match the file name`);
      }
      return decision;
    });
}

function loadSearchReceipts(dir: string): OperationalCoverageSearchReceipt[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const path = join(dir, name);
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      } catch (error) {
        throw new Error(`${path}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      const receipt = parseOperationalCoverageSearchReceipt(parsed, path);
      if (`${receipt.receipt_id}.json` !== name) {
        throw new Error(`${path}: receipt_id must match the file name`);
      }
      return receipt;
    });
}

function safeReleasePointer(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) throw new Error(`Invalid downstream release pointer ${field}`);
  return value;
}

function loadDownstreamLayer(rootDir: string): OperationalCoverageDownstreamLayer {
  const pinPath = join(rootDir, "data", "quality", "downstream-pin.json");
  if (!existsSync(pinPath)) {
    return {
      status: "pin_missing",
      consumer: null,
      release_id: null,
      manifest_sha256: null,
      pinned_at: null,
      operational_anchor_summary: null,
      operational_occurrence_summary: null,
    };
  }
  const pin = JSON.parse(readFileSync(pinPath, "utf8")) as Record<string, unknown>;
  const consumer = typeof pin.consumer === "string" && pin.consumer.trim() ? pin.consumer.trim() : null;
  const releaseId = typeof pin.release_id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(pin.release_id)
    ? pin.release_id
    : null;
  const manifestSha = typeof pin.manifest_sha256 === "string" && /^[a-f0-9]{64}$/u.test(pin.manifest_sha256)
    ? pin.manifest_sha256
    : null;
  const pinnedAt = typeof pin.pinned_at === "string" && pin.pinned_at.trim() ? pin.pinned_at.trim() : null;
  if (!consumer || !releaseId || !manifestSha || !pinnedAt) {
    throw new Error(`${pinPath}: invalid downstream pin identity fields`);
  }
  const releaseDir = join(rootDir, "data", "exports", "releases", releaseId);
  const manifestPath = join(releaseDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      status: "pinned_release_not_present",
      consumer,
      release_id: releaseId,
      manifest_sha256: manifestSha,
      pinned_at: pinnedAt,
      operational_anchor_summary: null,
      operational_occurrence_summary: null,
    };
  }
  const manifestContent = readFileSync(manifestPath, "utf8");
  if (sha256(manifestContent) !== manifestSha) {
    throw new Error(`${manifestPath}: SHA-256 does not match data/quality/downstream-pin.json`);
  }
  const manifest = JSON.parse(manifestContent) as Record<string, unknown>;
  const pointers = manifest.pointers;
  if (!pointers || typeof pointers !== "object" || Array.isArray(pointers)) {
    throw new Error(`${manifestPath}: missing pointers object`);
  }
  const pointerObject = pointers as Record<string, unknown>;
  const anchorPointer = safeReleasePointer(pointerObject.operational_anchor_summary, "operational_anchor_summary");
  const occurrencePointer = safeReleasePointer(pointerObject.operational_occurrence_summary, "operational_occurrence_summary");
  const readPointer = (pointer: string | null): JsonValue | null => {
    if (!pointer) return null;
    const path = join(releaseDir, pointer);
    if (!existsSync(path)) throw new Error(`${manifestPath}: missing addressed file ${pointer}`);
    return JSON.parse(readFileSync(path, "utf8")) as JsonValue;
  };
  return {
    status: "verified",
    consumer,
    release_id: releaseId,
    manifest_sha256: manifestSha,
    pinned_at: pinnedAt,
    operational_anchor_summary: readPointer(anchorPointer),
    operational_occurrence_summary: readPointer(occurrencePointer),
  };
}

function validateLedgerDecisionEvidence(
  decisions: readonly OperationalCoverageAcceptedDecision[],
  records: readonly MtaCanonicalRecord[],
): void {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  for (const decision of decisions) {
    for (const binding of decision.evidence_refs) {
      const record = recordsById.get(binding.record_id);
      if (!record) {
        throw new Error(`Operational coverage decision ${decision.decision_id} references missing record ${binding.record_id}`);
      }
      const exact = record.evidence_refs.some(
        (ref) =>
          ref.source_id === binding.source_id &&
          ref.evidence_id === binding.evidence_id &&
          (binding.block_id === null || ref.block_id === binding.block_id),
      );
      if (!exact) {
        throw new Error(
          `Operational coverage decision ${decision.decision_id} has non-exact evidence ${binding.source_id}#${binding.evidence_id}`,
        );
      }
    }
  }
}

function validateSearchReceiptSources(
  receipts: readonly OperationalCoverageSearchReceipt[],
  records: readonly MtaCanonicalRecord[],
): void {
  const canonicalSourceIds = new Set(records.flatMap((record) => [record.source_id, ...(record.source_ids ?? [])]));
  for (const receipt of receipts) {
    const referencedSourceIds = [
      ...receipt.source_searches.map((search) => search.source_id),
      ...receipt.registry_search.matched_source_ids,
    ];
    const missingSourceId = referencedSourceIds.find((sourceId) => !canonicalSourceIds.has(sourceId));
    if (missingSourceId) {
      throw new Error(
        `Operational coverage search receipt ${receipt.receipt_id} references unknown source ${missingSourceId}`,
      );
    }
  }
}

function artifactMetadata(content: string, rowCount?: number): OperationalCoverageArtifactMetadata {
  return {
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
    ...(rowCount === undefined ? {} : { row_count: rowCount }),
  };
}

function coverageMatrixMarkdown(matrix: OperationalCoverageMatrix): string {
  const population = matrix.operational_coverage.population;
  const completion = matrix.operational_coverage.completion;
  return [
    "# Operational coverage matrix",
    "",
    `Input fingerprint: \`${matrix.input_fingerprint}\``,
    `Corpus fingerprint: \`${matrix.corpus_fingerprint}\``,
    `Study window: ${matrix.study_window.start} through ${matrix.study_window.end}`,
    "",
    "## Canonical event population",
    "",
    `- Operational-family events: ${population.canonical_operational_events}`,
    `- In-window events: ${population.canonical_events_in_study_window}`,
    `- Pre-window events: ${population.canonical_events_before_study_window}`,
    `- Undated events: ${population.canonical_events_undated}`,
    `- Timeline-linked distinct events: ${population.distinct_timeline_linked_events}`,
    `- Unlinked operational events: ${population.unlinked_operational_events}`,
    "",
    "## Projection rows (diagnostic, not event counts)",
    "",
    `- Broad rows: ${population.broad_anchor_rows}`,
    `- Reviewed overlay rows: ${population.reviewed_overlay_rows}`,
    `- Duplicate reviewed overlay rows: ${population.duplicate_reviewed_overlay_rows}`,
    "",
    "## Resolved occurrences and downstream projection",
    "",
    `- Distinct occurrences: ${population.distinct_occurrences}`,
    `- Eligible occurrences: ${population.eligible_occurrences}`,
    `- Bundle occurrences: ${population.bundle_occurrences}`,
    `- Eligible occurrence-route pairs: ${population.eligible_occurrence_route_pairs}`,
    `- Unique eligible GTFS routes: ${population.unique_eligible_gtfs_routes}`,
    "",
    "## Completion ledger",
    "",
    `- Gap rows: ${completion.gap_rows}`,
    `- Priority gap denominator: ${completion.priority_gap_rows}`,
    `- Priority open: ${completion.priority_open_rows}`,
    `- Priority adjudicated/recoverable: ${completion.priority_adjudicated_recoverable_rows}`,
    `- Priority terminal: ${completion.priority_terminal_rows}`,
    `- Sequential route-resolved treatment gaps: ${
      matrix.anchor_summary.broad_funnel.resolved_route_scope -
      matrix.anchor_summary.broad_funnel.resolved_treatment_scope
    }`,
    "",
    "## Downstream-served layer",
    "",
    `- Status: ${matrix.downstream.status}`,
    `- Consumer: ${matrix.downstream.consumer ?? "not configured"}`,
    `- Pinned release: ${matrix.downstream.release_id ?? "not configured"}`,
    "",
    "Exclusion and gap histograms overlap; they are not additive funnel attrition.",
    "",
  ].join("\n");
}

export function buildOperationalCoverageArtifacts(
  input: BuildOperationalCoverageArtifactsInput,
): OperationalCoverageArtifactBuild {
  const records = [...input.records].sort((left, right) => left.record_id.localeCompare(right.record_id));
  const routeAnchors = [...input.routeAnchors].sort((left, right) =>
    `${left.gtfs_route_id ?? ""}|${left.canonical_route_record_id ?? ""}`.localeCompare(
      `${right.gtfs_route_id ?? ""}|${right.canonical_route_record_id ?? ""}`,
    ),
  );
  const anchorReviewDecisions = [...input.anchorReviewDecisions].sort((left, right) =>
    left.decision_id.localeCompare(right.decision_id),
  );
  const occurrenceReviewDecisions = [...input.occurrenceReviewDecisions].sort((left, right) =>
    left.decision_id.localeCompare(right.decision_id),
  );
  const occurrenceIdentityRegistry = [...input.occurrenceIdentityRegistry].sort((left, right) =>
    left.occurrence_id.localeCompare(right.occurrence_id),
  );
  const ledgerDecisions = [...(input.ledgerDecisions ?? [])].sort(
    (left, right) => left.decided_at.localeCompare(right.decided_at) || left.decision_id.localeCompare(right.decision_id),
  );
  const searchReceipts = [...(input.searchReceipts ?? [])].sort((left, right) =>
    left.receipt_id.localeCompare(right.receipt_id),
  );
  const studyWindow = input.studyWindow ?? DEFAULT_OPERATIONAL_STUDY_WINDOW;
  const routeAnchorPath = input.routeAnchorPath ?? DEFAULT_OPERATIONAL_COVERAGE_ROUTE_ANCHORS;
  const routeAnchorReleaseId = input.routeAnchorReleaseId === undefined
    ? releaseIdForRouteAnchorPath(routeAnchorPath)
    : input.routeAnchorReleaseId;
  const routeAnchorSha256 = input.routeAnchorSha256 ?? sha256(jsonl(routeAnchors));
  const corpusFingerprint = sha256(stableJson({
    records,
    route_anchors: routeAnchors,
    anchor_review_decisions: anchorReviewDecisions,
    occurrence_review_decisions: occurrenceReviewDecisions,
    occurrence_identity_registry: occurrenceIdentityRegistry,
    study_window: studyWindow,
  } as unknown as JsonValue));
  const projection = computeOperationalAnchorProjection(records, routeAnchors, {
    reviewDecisions: anchorReviewDecisions,
  });
  const occurrences = computeOperationalOccurrences(records, routeAnchors, {
    reviewDecisions: anchorReviewDecisions,
    occurrenceReviewDecisions,
    identityRegistry: occurrenceIdentityRegistry,
  });
  const ledger = buildOperationalCoverageLedger({
    canonical_records: records,
    operational_anchor_rows: projection.rows,
    operational_occurrence_rows: occurrences,
    accepted_ledger_decisions: ledgerDecisions,
    accepted_search_receipts: searchReceipts,
    corpus_fingerprint: corpusFingerprint,
    study_window: studyWindow,
  });
  const anchorSummary = summarizeOperationalAnchors(projection.rows, {
    canonicalEventCount: records.filter((record) => record.record_kind === "event").length,
    operationalFamilyEventCount: countOperationalFamilyEvents(records),
    entryGate: projection.entry_gate,
  });
  const inputFingerprint = sha256(stableJson({
    records,
    route_anchors: routeAnchors,
    route_anchor_pin: {
      path: routeAnchorPath,
      release_id: routeAnchorReleaseId,
      sha256: routeAnchorSha256,
    },
    anchor_review_decisions: anchorReviewDecisions,
    occurrence_review_decisions: occurrenceReviewDecisions,
    occurrence_identity_registry: occurrenceIdentityRegistry,
    ledger_decisions: ledgerDecisions,
    search_receipts: searchReceipts,
    corpus_fingerprint: corpusFingerprint,
    downstream: input.downstream ?? null,
    study_window: ledger.study_window,
  } as unknown as JsonValue));
  const matrix: OperationalCoverageMatrix = {
    schema_version: OPERATIONAL_COVERAGE_SCHEMA_VERSION,
    input_fingerprint: inputFingerprint,
    corpus_fingerprint: corpusFingerprint,
    study_window: ledger.study_window,
    anchor_summary: anchorSummary,
    operational_coverage: ledger.summary,
    downstream: input.downstream ?? {
      status: "pin_missing",
      consumer: null,
      release_id: null,
      manifest_sha256: null,
      pinned_at: null,
      operational_anchor_summary: null,
      operational_occurrence_summary: null,
    },
  };
  const unlinked = ledger.gaps.filter((gap) => gap.dimension === "timeline_subject");
  const sequentialRouteResolvedEventIds = new Set(
    projection.rows.filter(
      (row) =>
        row.anchor_id.startsWith("operational:") &&
        row.temporal_role === "realized_operational" &&
        (row.candidate_operational_date_precision === "day" || row.candidate_operational_date_precision === "month") &&
        row.gtfs_route_ids.length === 1 &&
        row.unmatched_route_record_ids.length === 0 &&
        (row.route_scope_resolution === "direct" || row.route_scope_resolution === "reviewed_inherited"),
    ).map((row) => row.event_record_id),
  );
  const treatmentRouteResolved = ledger.gaps.filter(
    (gap) => gap.dimension === "treatment" && sequentialRouteResolvedEventIds.has(gap.event_record_id),
  );
  const dateRefinement = ledger.gaps.filter((gap) => gap.dimension === "date_precision");
  const contents: Record<string, string> = {
    "coverage-matrix.json": json(matrix),
    "coverage-matrix.md": coverageMatrixMarkdown(matrix),
    "recoverability-ledger.jsonl": jsonl(ledger.gaps),
    "priority-queue.jsonl": jsonl(ledger.queue),
    "unlinked-operational-events.jsonl": jsonl(unlinked),
    "treatment-gap-route-resolved.jsonl": jsonl(treatmentRouteResolved),
    "date-refinement-candidates.jsonl": jsonl(dateRefinement),
  };
  const rowCounts: Record<string, number | undefined> = {
    "recoverability-ledger.jsonl": ledger.gaps.length,
    "priority-queue.jsonl": ledger.queue.length,
    "unlinked-operational-events.jsonl": unlinked.length,
    "treatment-gap-route-resolved.jsonl": treatmentRouteResolved.length,
    "date-refinement-candidates.jsonl": dateRefinement.length,
  };
  const manifest: OperationalCoverageArtifactManifest = {
    schema_version: OPERATIONAL_COVERAGE_SCHEMA_VERSION,
    input_fingerprint: inputFingerprint,
    corpus_fingerprint: corpusFingerprint,
    canonical_record_count: records.length,
    route_anchor_path: routeAnchorPath,
    route_anchor_release_id: routeAnchorReleaseId,
    route_anchor_sha256: routeAnchorSha256,
    route_anchor_count: routeAnchors.length,
    anchor_review_decision_count: anchorReviewDecisions.length,
    occurrence_review_decision_count: occurrenceReviewDecisions.length,
    occurrence_identity_count: occurrenceIdentityRegistry.length,
    ledger_decision_count: ledgerDecisions.length,
    search_receipt_count: searchReceipts.length,
    files: Object.fromEntries(
      Object.entries(contents).sort(([left], [right]) => left.localeCompare(right)).map(([name, content]) => [
        name,
        artifactMetadata(content, rowCounts[name]),
      ]),
    ),
  };
  contents["manifest.json"] = json(manifest);
  return { ledger, matrix, manifest, contents };
}

export function loadOperationalCoverageArtifacts(
  options: WriteOperationalCoverageArtifactsOptions = {},
): LoadOperationalCoverageArtifactsResult {
  const rootDir = options.rootDir ?? repoRoot;
  const routeAnchorInputPath = options.routeAnchorPath ?? DEFAULT_OPERATIONAL_COVERAGE_ROUTE_ANCHORS;
  const routeAnchorPath = resolve(rootDir, routeAnchorInputPath);
  const outputDir = resolve(rootDir, options.outputDir ?? DEFAULT_OPERATIONAL_COVERAGE_OUTPUT_DIR);
  const decisionDir = resolve(rootDir, options.decisionDir ?? DEFAULT_OPERATIONAL_COVERAGE_DECISION_DIR);
  const searchReceiptDir = resolve(
    rootDir,
    options.searchReceiptDir ?? DEFAULT_OPERATIONAL_COVERAGE_SEARCH_RECEIPT_DIR,
  );
  const records = readCoverageCanonicalRecords(rootDir);
  const routeAnchorContent = readFileSync(routeAnchorPath, "utf8");
  const routeAnchors = readJsonl<RouteAnchorRow>(routeAnchorPath);
  const anchorReviewDecisions = loadOperationalAnchorReviewDecisions(
    join(rootDir, "data", "operational-anchor-review", "accepted", "decisions"),
  );
  const occurrenceReviewDecisions = loadOperationalOccurrenceAcceptedDecisions(
    join(rootDir, "data", "operational-occurrence-review", "accepted", "decisions"),
  );
  const occurrenceIdentityRegistry = loadOperationalOccurrenceIdentityRegistry(
    join(rootDir, "data", "operational-occurrence-identities", "registry.jsonl"),
  );
  const ledgerDecisions = loadLedgerDecisions(decisionDir);
  const searchReceipts = loadSearchReceipts(searchReceiptDir);
  const downstream = loadDownstreamLayer(rootDir);
  validateLedgerDecisionEvidence(ledgerDecisions, records);
  validateSearchReceiptSources(searchReceipts, records);
  const routeAnchorRelativePath = slashPath(relative(rootDir, routeAnchorPath));
  const build = buildOperationalCoverageArtifacts({
    records,
    routeAnchors,
    anchorReviewDecisions,
    occurrenceReviewDecisions,
    occurrenceIdentityRegistry,
    ledgerDecisions,
    searchReceipts,
    downstream,
    routeAnchorPath: routeAnchorRelativePath,
    routeAnchorReleaseId: releaseIdForRouteAnchorPath(routeAnchorRelativePath),
    routeAnchorSha256: sha256(routeAnchorContent),
    ...(options.studyWindow ? { studyWindow: options.studyWindow } : {}),
  });

  return { outputDir, build };
}

export function loadPinnedOperationalCoverageArtifacts(
  options: Omit<WriteOperationalCoverageArtifactsOptions, "routeAnchorPath"> = {},
): LoadOperationalCoverageArtifactsResult & { routeAnchorPin: OperationalCoverageRouteAnchorPin } {
  const persisted = loadOperationalCoverageRouteAnchorPin(options);
  const loaded = loadOperationalCoverageArtifacts({ ...options, routeAnchorPath: persisted.pin.path });
  if (persisted.corpusFingerprint !== loaded.build.manifest.corpus_fingerprint) {
    throw new Error(
      `Operational coverage manifest has stale corpus_fingerprint ${persisted.corpusFingerprint}; ` +
        `current fingerprint is ${loaded.build.manifest.corpus_fingerprint}`,
    );
  }
  if (persisted.inputFingerprint !== loaded.build.manifest.input_fingerprint) {
    throw new Error(
      `Operational coverage manifest has stale input_fingerprint ${persisted.inputFingerprint}; ` +
        `current fingerprint is ${loaded.build.manifest.input_fingerprint}`,
    );
  }
  const builtPin: OperationalCoverageRouteAnchorPin = {
    path: loaded.build.manifest.route_anchor_path,
    release_id: loaded.build.manifest.route_anchor_release_id,
    sha256: loaded.build.manifest.route_anchor_sha256,
  };
  if (!sameOperationalCoverageRouteAnchorPin(persisted.pin, builtPin)) {
    throw new Error("Operational coverage route-anchor pin changed while reloading current coverage");
  }
  return { ...loaded, routeAnchorPin: persisted.pin };
}

export function writeOperationalCoverageArtifacts(
  options: WriteOperationalCoverageArtifactsOptions = {},
): WriteOperationalCoverageArtifactsResult {
  const loaded = loadOperationalCoverageArtifacts(options);

  mkdirSync(loaded.outputDir, { recursive: true });
  for (const [name, content] of Object.entries(loaded.build.contents).sort(([left], [right]) => left.localeCompare(right))) {
    writeFileSync(join(loaded.outputDir, name), content, "utf8");
  }
  return {
    outputDir: loaded.outputDir,
    ledger: loaded.build.ledger,
    matrix: loaded.build.matrix,
    manifest: loaded.build.manifest,
  };
}
