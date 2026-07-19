import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { identityKeysForRecord, isGlobalRecordKind } from "@mta-wiki/db/identity";
import { canonicalDbPath, openCanonicalDb } from "@mta-wiki/db/canonical-db";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import {
  evidenceBlockIndexEntry,
  readEvidenceBlockIndex,
  type EvidenceBlockIndexEntry,
} from "@mta-wiki/pipeline/sources/evidence-block-index";
import {
  identityDoNotMergeOverrideIssueSuppressed,
  validateIdentityOverrideArtifacts,
  validateIdentityReviewAcceptedArtifacts,
} from "@mta-wiki/pipeline/identity/identity-review-apply";
import {
  readCanonicalRecordsFromDbFile,
} from "@mta-wiki/pipeline/materialize/canonical-read";
import {
  extractWriterRegion,
  parseBlockPrimitives,
  parseInlinePrimitives,
  type BlockPrimitive,
  type InlinePrimitive,
} from "@mta-wiki/pipeline/materialize/primitives";
import { relationEndpointShapeIssue } from "@mta-wiki/pipeline/records/relations";
import { evidenceId, readStagedSourceBlocks, sourceBlockById, sourceBlocksRelativePath } from "@mta-wiki/pipeline/sources/source-prep";
import { validateSubmissionRetirementOverrides } from "@mta-wiki/pipeline/records/submission-overrides";
import { validateSemanticCorrections } from "@mta-wiki/pipeline/records/semantic-corrections";
import { validateOperationalRecoveryProposalTree } from "@mta-wiki/pipeline/records/operational-recovery-proposals";
import { auditRelationshipGraph } from "@mta-wiki/pipeline/records/relationship-integrity";
import type { RelationshipGraphAudit } from "@mta-wiki/pipeline/records/relationship-integrity";
import {
  loadRelationshipContract,
  relationshipContractValidationMode,
  type RelationshipValidationMode,
} from "@mta-wiki/db/relationship-contract";
import type { MtaValidationIssue, MtaValidationReport } from "@mta-wiki/db/types";

function walkMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const paths: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...walkMarkdown(path));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      paths.push(path);
    }
  }

  return paths.sort();
}

function validateRequiredPaths(issues: MtaValidationIssue[]) {
  const requiredPaths = ["package.json", "harness.config.json", "docs/mta-llm-wiki-spec.md"];
  for (const relativePath of requiredPaths) {
    if (!existsSync(join(repoRoot, relativePath))) {
      issues.push({
        code: "missing_required_path",
        message: `Missing required path: ${relativePath}`,
        path: relativePath,
      });
    }
  }

  return requiredPaths.length;
}

export function validateReleasePointer(
  issues: MtaValidationIssue[],
  rootDir = repoRoot,
): void {
  const releasesDir = join(rootDir, "data", "exports", "releases");
  const latestPath = join(releasesDir, "LATEST");
  if (!existsSync(latestPath)) return;

  const releaseId = readFileSync(latestPath, "utf8").trim();
  const safeReleaseId = (
    releaseId.length > 0 &&
    releaseId !== "." &&
    releaseId !== ".." &&
    !releaseId.includes("/") &&
    !releaseId.includes("\\")
  );
  const manifestPath = safeReleaseId
    ? join(releasesDir, releaseId, "manifest.json")
    : "";
  if (safeReleaseId && existsSync(manifestPath)) return;

  // This intentionally checks filesystem existence, not git trackedness. A fresh
  // checkout gate is what catches a committed pointer to an untracked canary.
  issues.push({
    code: "dangling_release_pointer",
    path: "data/exports/releases/LATEST",
    message: `LATEST names ${releaseId || "(empty)"}, but data/exports/releases/${releaseId || "(empty)"}/manifest.json does not exist.`,
  });
}

export function validateSourceRegistryForRecords(
  records: readonly MtaCanonicalRecord[],
  issues: MtaValidationIssue[],
): void {
  const sourceRecords = records
    .filter((record) => record.record_kind === "source")
    .sort((left, right) => left.record_id.localeCompare(right.record_id));
  const sourceRecordsById = new Map<string, MtaCanonicalRecord[]>();
  for (const record of sourceRecords) {
    const matches = sourceRecordsById.get(record.source_id) ?? [];
    matches.push(record);
    sourceRecordsById.set(record.source_id, matches);
    if (/_\d+$/u.test(record.record_id)) {
      issues.push({
        code: "source_record_collision_suffix",
        path: "data/canonical/sources.jsonl",
        recordId: record.record_id,
        message: `Source record ${record.record_id} has a generated collision suffix; one source_id must materialize to one stable source record.`,
      });
    }
  }

  for (const [sourceId, matchingRecords] of [...sourceRecordsById].sort(([left], [right]) => left.localeCompare(right))) {
    if (matchingRecords.length < 2) continue;
    issues.push({
      code: "duplicate_source_id",
      path: "data/canonical/sources.jsonl",
      message: `Source id ${sourceId} is claimed by ${matchingRecords.length} source records: ${matchingRecords.map((record) => record.record_id).join(", ")}.`,
    });
  }

  const sourceIds = new Set(sourceRecordsById.keys());
  const citingRecordsByMissingSource = new Map<string, Set<string>>();
  for (const record of records) {
    const referencedSourceIds = new Set([
      record.source_id,
      ...(record.source_ids ?? []),
    ]);
    for (const sourceId of referencedSourceIds) {
      if (sourceIds.has(sourceId)) continue;
      const citingRecords = citingRecordsByMissingSource.get(sourceId) ?? new Set<string>();
      citingRecords.add(record.record_id);
      citingRecordsByMissingSource.set(sourceId, citingRecords);
    }
  }

  for (const [sourceId, citingRecords] of [...citingRecordsByMissingSource].sort(([left], [right]) => left.localeCompare(right))) {
    issues.push({
      code: "unresolved_source_reference",
      path: "data/canonical/sources.jsonl",
      message: `Source id ${sourceId} has no source registry row and is referenced by ${citingRecords.size} citing record${citingRecords.size === 1 ? "" : "s"}.`,
    });
  }
}

function validatePages(pagePaths: string[], issues: MtaValidationIssue[]) {
  for (const path of pagePaths) {
    if (path === join(repoRoot, "wiki", "index.md")) continue;
    const content = readFileSync(path, "utf8");
    if (path.startsWith(join(repoRoot, "wiki", "sources"))) {
      if (!content.startsWith("---\n")) {
        issues.push({
          code: "missing_frontmatter",
          message: "Source document page should start with generated YAML frontmatter.",
          path,
        });
      }
      if (!content.includes('record_kind: "source"')) {
        issues.push({
          code: "invalid_source_frontmatter",
          message: "Source document page frontmatter should identify record_kind: source.",
          path,
        });
      }
      if (!content.includes("citation: cite block ids exactly as shown in square brackets")) {
        issues.push({
          code: "invalid_source_doc",
          message: "Source document page is missing source block citation guidance.",
          path,
        });
      }
      if (content.includes("<!-- mta-wiki:writer:start -->") || content.includes("<!-- mta-wiki:writer:end -->")) {
        issues.push({
          code: "source_doc_has_writer_region",
          message: "Source document pages should not have writer-owned region markers.",
          path,
        });
      }
      continue;
    }
    if (!content.startsWith("---\n")) {
      issues.push({
        code: "missing_frontmatter",
        message: "Wiki page does not start with YAML frontmatter.",
        path,
      });
    }
    if (!content.includes("<!-- mta-wiki:writer:start -->") || !content.includes("<!-- mta-wiki:writer:end -->")) {
      issues.push({
        code: "missing_writer_region",
        message: "Wiki page is missing writer-owned region markers.",
        path,
      });
    }
    if (content.includes("<!-- mta-wiki:generated:start -->") || content.includes("<!-- mta-wiki:generated:end -->")) {
      issues.push({
        code: "unexpected_generated_region",
        message: "Wiki page should keep generated structured data in frontmatter, not a generated Markdown body section.",
        path,
      });
    }
  }
}

const RECORD_KIND_BY_PRIMITIVE = {
  route: "route",
  corridor: "corridor",
  project: "project",
  entity: "entity",
  metric: "metric_claim",
} as const;

export type WriterPrimitiveValidationContext = {
  recordKindsById: Map<string, MtaCanonicalRecord["record_kind"]>;
  sourceIds: Set<string>;
  blockExists: (sourceId: string, blockId: string) => boolean;
  strictWriterCitations?: boolean | undefined;
};

function writerPrimitiveIssue(path: string, primitive: InlinePrimitive | BlockPrimitive, reason: string): MtaValidationIssue {
  return {
    code: "dangling_writer_primitive",
    path,
    message: `${reason}: ${primitive.raw.replace(/\s+/gu, " ").slice(0, 240)}`,
  };
}

function validateRecordPrimitive(path: string, primitive: InlinePrimitive | BlockPrimitive, context: WriterPrimitiveValidationContext): MtaValidationIssue | undefined {
  if (primitive.kind === "cite") return undefined;
  if (primitive.kind !== "route" && primitive.kind !== "corridor" && primitive.kind !== "project" && primitive.kind !== "entity" && primitive.kind !== "metric") {
    return writerPrimitiveIssue(path, primitive, "kind_mismatch");
  }
  if ("blockId" in primitive && primitive.blockId) return writerPrimitiveIssue(path, primitive, "kind_mismatch");
  if (!primitive.id) return writerPrimitiveIssue(path, primitive, "unknown_record");
  const actualKind = context.recordKindsById.get(primitive.id);
  if (!actualKind) return writerPrimitiveIssue(path, primitive, "unknown_record");
  const expectedKind = RECORD_KIND_BY_PRIMITIVE[primitive.kind];
  if (actualKind !== expectedKind) return writerPrimitiveIssue(path, primitive, "kind_mismatch");
  return undefined;
}

function validateCitationPrimitive(path: string, primitive: InlinePrimitive, context: WriterPrimitiveValidationContext): MtaValidationIssue | undefined {
  if (!context.sourceIds.has(primitive.id)) return writerPrimitiveIssue(path, primitive, "unknown_source");
  if (primitive.blockId && !context.blockExists(primitive.id, primitive.blockId)) return writerPrimitiveIssue(path, primitive, "unknown_block");
  return undefined;
}

function validateStrictWriterCitations(path: string, writerText: string): MtaValidationIssue[] {
  const issues: MtaValidationIssue[] = [];
  for (const [index, paragraph] of writerText.split(/\n\s*\n/u).entries()) {
    if (!paragraph.trim()) continue;
    if (parseInlinePrimitives(paragraph).some((primitive) => primitive.kind === "cite")) continue;
    issues.push({
      code: "uncited_writer_paragraph",
      path,
      message: `strict writer citation check: paragraph ${index + 1} has no cite primitive.`,
    });
  }
  return issues;
}

function validateWriterInlinePrimitiveSyntax(path: string, writerText: string): MtaValidationIssue[] {
  const issues: MtaValidationIssue[] = [];
  const parsedRanges = new Set(parseInlinePrimitives(writerText).map((primitive) => `${primitive.offset}:${primitive.raw.length}`));

  for (const match of writerText.matchAll(/\[\[[\s\S]*?\]\]/gu)) {
    const raw = match[0]!;
    const offset = match.index ?? 0;
    if (parsedRanges.has(`${offset}:${raw.length}`)) continue;
    issues.push({
      code: "invalid_writer_primitive_syntax",
      path,
      message: `unsupported writer primitive syntax: ${raw.replace(/\s+/gu, " ").slice(0, 240)}`,
    });
  }

  return issues;
}

export function validateWriterPrimitivesInPage(path: string, markdown: string, context: WriterPrimitiveValidationContext): MtaValidationIssue[] {
  const writerText = extractWriterRegion(markdown);
  if (writerText === null || !writerText.trim()) return [];

  const issues: MtaValidationIssue[] = [];
  issues.push(...validateWriterInlinePrimitiveSyntax(path, writerText));
  for (const primitive of parseInlinePrimitives(writerText)) {
    const issue = primitive.kind === "cite" ? validateCitationPrimitive(path, primitive, context) : validateRecordPrimitive(path, primitive, context);
    if (issue) issues.push(issue);
  }
  for (const primitive of parseBlockPrimitives(writerText)) {
    if (primitive.error) {
      issues.push(writerPrimitiveIssue(path, primitive, primitive.error === "unknown_kind" ? "kind_mismatch" : "invalid_block_json"));
      continue;
    }
    const issue = validateRecordPrimitive(path, primitive, context);
    if (issue) issues.push(issue);
  }
  if (context.strictWriterCitations) issues.push(...validateStrictWriterCitations(path, writerText));
  return issues;
}

function validateStagedSourceBlocks(issues: MtaValidationIssue[]) {
  const sourcesDir = join(repoRoot, "raw", "sources");
  if (!existsSync(sourcesDir)) return;

  for (const entry of readdirSync(sourcesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(sourcesDir, entry.name, "blocks.jsonl");
    if (!existsSync(path)) {
      issues.push({
        code: "missing_source_blocks",
        message: `Staged source is missing required blocks.jsonl: ${entry.name}`,
        path,
      });
    }
  }
}

function validateEvidence(records: MtaCanonicalRecord[], issues: MtaValidationIssue[]) {
  const publicEvidenceIndex = readEvidenceBlockIndex();
  for (const record of records) {
    for (const [index, ref] of record.evidence_refs.entries()) {
      const sourceDir = join(repoRoot, "raw", "sources", ref.source_id);
      const indexedBlock = ref.block_id ? evidenceBlockIndexEntry(publicEvidenceIndex, ref.source_id, ref.block_id) : undefined;
      const sourceAvailable = existsSync(sourceDir) || publicEvidenceIndex?.sourceIds.has(ref.source_id);
      if (!sourceAvailable) {
        issues.push({
          code: "missing_evidence_source",
          message: `Evidence ref ${index} points to an unstaged source: ${ref.source_id}`,
          recordId: record.record_id,
        });
      }

      if (!ref.block_id) {
        issues.push({
          code: "missing_evidence_block",
          message: `Evidence ref ${index} is missing a block_id.`,
          recordId: record.record_id,
        });
        continue;
      }

      if (ref.source_path !== sourceBlocksRelativePath(ref.source_id)) {
        issues.push({
          code: "invalid_evidence_source_path",
          message: `Evidence ref ${index} should cite blocks.jsonl, not ${ref.source_path ?? "(missing)"}.`,
          path: ref.source_path,
          recordId: record.record_id,
        });
        continue;
      }

      // Resolve via sourceBlockById so same-page ranges (p018_c0012..p018_c0025) and alias ids
      // resolve like they do for the agent, instead of a raw exact-match that misses ranges.
      let block: { block_id: string; page_number: number; raw_text_sha256: string } | EvidenceBlockIndexEntry | undefined;
      let stagedBlocksError: unknown;
      try {
        readStagedSourceBlocks(ref.source_id);
        block = sourceBlockById(ref.source_id, ref.block_id);
      } catch (error) {
        stagedBlocksError = error;
        block = indexedBlock;
      }

      if (!block) {
        if (stagedBlocksError && !indexedBlock) {
          issues.push({
            code: "missing_evidence_blocks",
            message: `Evidence source blocks are unavailable for ${ref.source_id}: ${String(stagedBlocksError instanceof Error ? stagedBlocksError.message : stagedBlocksError)}`,
            recordId: record.record_id,
          });
          continue;
        }
        issues.push({
          code: "missing_evidence_block",
          message: `Evidence ref ${index} points to a missing source block: ${ref.block_id}`,
          recordId: record.record_id,
        });
        continue;
      }

      if (ref.evidence_id !== evidenceId(ref.source_id, ref.block_id)) {
        issues.push({
          code: "evidence_id_mismatch",
          message: `Evidence id mismatch for ${record.record_id}`,
          recordId: record.record_id,
        });
      }

      if (ref.page_number !== block.page_number) {
        issues.push({
          code: "evidence_page_mismatch",
          message: `Evidence page mismatch for ${record.record_id}`,
          recordId: record.record_id,
        });
      }

      if (ref.text_sha256 !== block.raw_text_sha256) {
        issues.push({
          code: "evidence_hash_mismatch",
          message: `Evidence hash mismatch for ${record.record_id}`,
          path: ref.source_path,
          recordId: record.record_id,
        });
      }
    }
  }
}

function validateRelations(records: MtaCanonicalRecord[], issues: MtaValidationIssue[]) {
  const ids = new Set(records.map((record) => record.record_id));
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const localObservationIds = new Set(records.flatMap((record) => [record.local_observation_id, ...(record.local_observation_ids ?? [])]));

  for (const record of records) {
    if (record.record_kind !== "relation") continue;
    const relationKind = typeof record.payload.relation_kind === "string" ? record.payload.relation_kind.trim() : undefined;
    if (typeof record.payload.text === "string") {
      issues.push({
        code: "invalid_relation_payload",
        message: "Relation payload must be structured fields, not an unparsed text payload.",
        recordId: record.record_id,
      });
    }
    if (!relationKind) {
      issues.push({
        code: "missing_relation_kind",
        message: `Relation ${record.record_id} is missing payload.relation_kind.`,
        recordId: record.record_id,
      });
    }
    for (const field of ["subject_id", "object_id"]) {
      const value = record.payload[field];
      if (typeof value !== "string" || ids.has(value)) continue;
      issues.push({
        code: "missing_relation_target",
        message: `Relation ${record.record_id} references missing ${field}: ${value}`,
        recordId: record.record_id,
      });
    }
    for (const field of ["subject_local_observation_id", "object_local_observation_id"]) {
      const value = record.payload[field];
      if (typeof value !== "string" || !value.trim()) {
        issues.push({
          code: "missing_relation_local_observation_target",
          message: `Relation ${record.record_id} is missing payload.${field}.`,
          recordId: record.record_id,
        });
        continue;
      }
      if (typeof value !== "string" || localObservationIds.has(value)) continue;
      issues.push({
        code: "missing_relation_local_observation_target",
        message: `Relation ${record.record_id} references missing ${field}: ${value}. Submit an observation with local_observation_id "${value}" before submitting this relation.`,
        recordId: record.record_id,
      });
    }

    const subjectId = typeof record.payload.subject_id === "string" ? record.payload.subject_id : undefined;
    const objectId = typeof record.payload.object_id === "string" ? record.payload.object_id : undefined;
    const shapeIssue = relationKind
      ? relationEndpointShapeIssue(relationKind, subjectId ? byId.get(subjectId)?.record_kind : undefined, objectId ? byId.get(objectId)?.record_kind : undefined)
      : undefined;
    if (shapeIssue) {
      issues.push({
        code: "unexpected_relation_endpoint_shape",
        message: `${shapeIssue.message} Relation ${record.record_id}.`,
        recordId: record.record_id,
      });
    }
  }
}

export function validateSemanticInvariantsForRecords(records: MtaCanonicalRecord[]): MtaValidationIssue[] {
  const issues: MtaValidationIssue[] = [];
  for (const record of records) {
    if (record.review_state === "quarantined") continue;
    if (record.record_kind === "relation") {
      const subjectId = typeof record.payload.subject_id === "string" ? record.payload.subject_id : undefined;
      const objectId = typeof record.payload.object_id === "string" ? record.payload.object_id : undefined;
      if (subjectId && subjectId === objectId) {
        issues.push({
          code: "relation_self_loop",
          message: `Relation ${record.record_id} has identical subject_id and object_id: ${subjectId}`,
          recordId: record.record_id,
        });
      }
    }
    if (record.record_kind === "event") {
      const eventKind = typeof record.payload.event_kind === "string" ? record.payload.event_kind.toLowerCase() : "";
      const lifecyclePhase = typeof record.payload.lifecycle_phase === "string" ? record.payload.lifecycle_phase : "";
      if (eventKind.includes("target") && lifecyclePhase === "completed") {
        issues.push({
          code: "event_completion_target_completed",
          message: `Event ${record.record_id} is a target event but has lifecycle_phase completed.`,
          recordId: record.record_id,
        });
      }
    }
  }
  return issues;
}

function validateSemanticInvariants(records: MtaCanonicalRecord[], issues: MtaValidationIssue[]) {
  issues.push(...validateSemanticInvariantsForRecords(records));
}

function validateGlobalIdentities(records: MtaCanonicalRecord[], issues: MtaValidationIssue[]) {
  const keys = new Map<string, string>();

  for (const record of records) {
    if (!isGlobalRecordKind(record.record_kind)) continue;

    if (/_\d+$/u.test(record.record_id)) {
      issues.push({
        code: "global_record_has_collision_suffix",
        message: `Global ${record.record_kind} record has a generated collision suffix; resolve it to an existing canonical record or add an identity override.`,
        recordId: record.record_id,
      });
    }

    for (const key of identityKeysForRecord(record)) {
      const previous = keys.get(`${record.record_kind}\0${key}`);
      if (!previous || previous === record.record_id) {
        keys.set(`${record.record_kind}\0${key}`, record.record_id);
        continue;
      }

      if (identityDoNotMergeOverrideIssueSuppressed(record.record_kind, previous, record.record_id)) continue;

      issues.push({
        code: "duplicate_global_identity",
        message: `Global ${record.record_kind} records ${previous} and ${record.record_id} share identity key ${key}.`,
        recordId: record.record_id,
      });
    }
  }
}

function validateMetricPayloads(records: MtaCanonicalRecord[], issues: MtaValidationIssue[]) {
  for (const record of records) {
    if (record.record_kind !== "metric_claim") continue;
    if (record.payload.value !== undefined && typeof record.payload.value !== "number") {
      issues.push({
        code: "invalid_metric_value",
        message: `Metric ${record.record_id} has non-numeric payload.value; use numeric value or value_min/value_max with raw_value_text.`,
        recordId: record.record_id,
      });
    }
    if (record.payload.raw_value_text !== undefined) {
      const hasScalarValue = typeof record.payload.value === "number";
      const hasRange = typeof record.payload.value_min === "number" && typeof record.payload.value_max === "number";
      if (!hasScalarValue && !hasRange) {
        issues.push({
          code: "missing_normalized_metric_value",
          message: `Metric ${record.record_id} preserves raw_value_text but is missing normalized numeric value fields.`,
          recordId: record.record_id,
        });
      }
    }
  }
}

function sourcePagePath(sourceId: string) {
  return join(repoRoot, "wiki", "sources", `${sourceId}.md`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function sourcePageHasBlock(sourceId: string, blockId: string): boolean {
  const path = sourcePagePath(sourceId);
  if (!existsSync(path)) return false;
  const content = readFileSync(path, "utf8");
  const hasExact = (id: string) => new RegExp(`\\[${escapeRegExp(id)}\\]`, "u").test(content);
  const [start, end, ...rest] = blockId.split("..");
  if (start && end && rest.length === 0) return hasExact(start) && hasExact(end);
  return hasExact(blockId);
}

export function buildWriterPrimitiveValidationContext(records: MtaCanonicalRecord[]): WriterPrimitiveValidationContext {
  const publicEvidenceIndex = readEvidenceBlockIndex();
  const recordKindsById = new Map(records.map((record) => [record.record_id, record.record_kind]));
  const sourceIds = new Set(records.filter((record) => record.record_kind === "source").map((record) => record.source_id));
  for (const sourceId of publicEvidenceIndex?.sourceIds ?? []) sourceIds.add(sourceId);
  return {
    recordKindsById,
    sourceIds,
    blockExists: (sourceId, blockId) => {
      try {
        sourceBlockById(sourceId, blockId);
        return true;
      } catch {
        return evidenceBlockIndexEntry(publicEvidenceIndex, sourceId, blockId) !== undefined || sourcePageHasBlock(sourceId, blockId);
      }
    },
  };
}

function validateWriterPrimitives(pagePaths: string[], records: MtaCanonicalRecord[], issues: MtaValidationIssue[]) {
  const context = buildWriterPrimitiveValidationContext(records);
  for (const path of pagePaths) {
    if (path === join(repoRoot, "wiki", "index.md") || path.startsWith(join(repoRoot, "wiki", "sources"))) continue;
    issues.push(...validateWriterPrimitivesInPage(path, readFileSync(path, "utf8"), context));
  }
}

function validateRelationshipProjectionParity(audit: RelationshipGraphAudit, issues: MtaValidationIssue[]) {
  if (!existsSync(canonicalDbPath())) return;
  let db: ReturnType<typeof openCanonicalDb> | undefined;
  try {
    db = openCanonicalDb(canonicalDbPath(), { readonly: true });
    const sqlFindings = db.query(
      "SELECT finding_id, code, record_id FROM relationship_validation_findings ORDER BY finding_id",
    ).all() as Array<{ finding_id: string; code: string; record_id: string | null }>;
    const repositoryFindings = audit.findings.map((finding) => ({
      finding_id: finding.finding_id,
      code: finding.code,
      record_id: finding.record_id ?? null,
    }));
    if (stableJson(sqlFindings as unknown as import("@mta-wiki/db/types").JsonValue) !== stableJson(repositoryFindings as unknown as import("@mta-wiki/db/types").JsonValue)) {
      issues.push({
        code: "relationship_projection_mismatch",
        path: "data/canonical.db",
        message: `Repository relationship findings (${repositoryFindings.length}) do not match the SQLite finding ledger (${sqlFindings.length}); rebuild canonical.db from the same authoritative JSONL.`,
      });
    }

    const count = (view: string) => Number((db!.query(`SELECT COUNT(*) AS count FROM ${view}`).get() as { count: number }).count);
    const expected = {
      relationship_endpoint_violations: audit.findings.filter((finding) => finding.code === "REL_ENDPOINT_DANGLING").length,
      relationship_type_violations: audit.findings.filter((finding) => finding.code === "REL_ENDPOINT_TYPE_INVALID" || finding.code === "REL_CONTRACT_RULE_MISSING").length,
      relationship_evidence_violations: new Set(audit.findings.filter((finding) => finding.code === "REL_EVIDENCE_MISSING" || finding.code === "REL_EVIDENCE_UNRESOLVED").map((finding) => finding.record_id)).size,
      relationship_identity_ambiguities: audit.findings.filter((finding) => finding.code === "REL_ALIAS_AMBIGUOUS").length,
    };
    for (const [view, expectedCount] of Object.entries(expected)) {
      const actualCount = count(view);
      if (actualCount === expectedCount) continue;
      issues.push({
        code: "relationship_sql_diagnostic_mismatch",
        path: "data/canonical.db",
        message: `${view} reports ${actualCount} row(s), but the repository validator reports ${expectedCount} corresponding finding(s).`,
      });
    }
  } catch (error) {
    issues.push({
      code: "relationship_projection_unreadable",
      path: "data/canonical.db",
      message: `Unable to verify the SQLite relationship diagnostic mirror: ${error instanceof Error ? error.message : String(error)}`,
    });
  } finally {
    db?.close();
  }
}

function validateRelationshipCompletenessWarnings(
  warnings: MtaValidationIssue[],
  issues: MtaValidationIssue[],
  mode: RelationshipValidationMode,
) {
  if (!existsSync(canonicalDbPath())) return;
  let db: ReturnType<typeof openCanonicalDb> | undefined;
  try {
    db = openCanonicalDb(canonicalDbPath(), { readonly: true });
    const state = db.query(
      `SELECT mode, hard_mode_ready, input_fingerprint
       FROM relationship_enforcement_state
       WHERE contract_id = 'relationship-completeness-v1'`,
    ).get() as { mode: "warning" | "enforce"; hard_mode_ready: number; input_fingerprint: string } | null;
    if (!state) {
      issues.push({
        code: "relationship_enforcement_state_mismatch",
        path: "data/canonical.db",
        message: "SQLite relationship completeness enforcement state is missing.",
      });
    } else if (state.mode !== (mode === "enforce" ? "enforce" : "warning")) {
      issues.push({
        code: "relationship_enforcement_state_mismatch",
        path: "data/canonical.db",
        message: `SQLite completeness mode ${state.mode} does not match relationship contract mode ${mode}.`,
      });
    }
    if (mode === "enforce" && !Boolean(state?.hard_mode_ready)) {
      issues.push({
        code: "relationship_completeness_enforcement_not_ready",
        path: "data/canonical.db",
        message: "SQLite relationship completeness hard-mode criteria are not satisfied.",
      });
    }

    const sink = mode === "enforce" ? issues : warnings;
    const findingRows = db.query(
      `SELECT code, selector, subject_id, detail_json
       FROM relationship_completeness_findings
       ORDER BY finding_id`,
    ).all() as Array<{ code: string; selector: string; subject_id: string; detail_json: string }>;
    for (const finding of findingRows) {
      let detail = `${finding.selector}/${finding.subject_id}`;
      try {
        const parsed = JSON.parse(finding.detail_json) as {
          row?: { reasons?: unknown };
        };
        if (Array.isArray(parsed.row?.reasons)) detail = `${detail}: ${parsed.row.reasons.join(", ")}`;
      } catch {
        detail = `${detail}: invalid SQLite detail_json`;
      }
      sink.push({
        code: finding.code,
        recordId: finding.subject_id,
        path: "data/canonical.db",
        message: detail,
      });
    }
    for (const view of [
      "relationship_disposition_evidence_violations",
      "relationship_completeness_selector_violations",
    ]) {
      const count = Number((db.query(`SELECT COUNT(*) AS count FROM ${view}`).get() as { count: number }).count);
      if (count === 0) continue;
      issues.push({
        code: "relationship_completeness_sql_diagnostic_mismatch",
        path: "data/canonical.db",
        message: `${view} reports ${count} violation row(s).`,
      });
    }
  } catch (error) {
    issues.push({
      code: "relationship_completeness_unreadable",
      path: "data/canonical.db",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    db?.close();
  }
}

export function validateRepo(options: {
  strictWriterCitations?: boolean | undefined;
  relationshipMode?: RelationshipValidationMode | undefined;
} = {}): MtaValidationReport {
  const issues: MtaValidationIssue[] = [];
  const warnings: MtaValidationIssue[] = [];
  const relationshipContract = loadRelationshipContract();
  const contractRelationshipMode = relationshipContractValidationMode(relationshipContract);
  if (options.relationshipMode !== undefined && options.relationshipMode !== contractRelationshipMode) {
    throw new Error(
      `relationship validation mode is locked by the checked-in contract (${contractRelationshipMode}); ` +
      `refusing requested downgrade/override ${options.relationshipMode}`,
    );
  }
  const relationshipMode = contractRelationshipMode;
  const requiredPathCount = validateRequiredPaths(issues);
  validateReleasePointer(issues);
  const dbRecords = readCanonicalRecordsFromDbFile();
  if (!dbRecords) {
    issues.push({
      code: "missing_canonical_db",
      path: "data/canonical.db",
      message: "canonical.db is missing or has an incompatible schema; re-run materialize.",
    });
  }
  const records = dbRecords ?? [];
  const submissionIds = [...new Set(records.flatMap((record) => record.submission_ids))].sort();
  const pagePaths = walkMarkdown(join(repoRoot, "wiki"));

  validateSourceRegistryForRecords(records, issues);
  validatePages(pagePaths, issues);
  validateStagedSourceBlocks(issues);
  validateEvidence(records, issues);
  validateRelations(records, issues);
  validateSemanticInvariants(records, issues);
  validateGlobalIdentities(records, issues);
  validateMetricPayloads(records, issues);
  validateWriterPrimitives(pagePaths, records, issues);
  if (options.strictWriterCitations) {
    const strictContext = { ...buildWriterPrimitiveValidationContext(records), strictWriterCitations: true };
    for (const path of pagePaths) {
      if (path === join(repoRoot, "wiki", "index.md") || path.startsWith(join(repoRoot, "wiki", "sources"))) continue;
      issues.push(...validateWriterPrimitivesInPage(path, readFileSync(path, "utf8"), strictContext).filter((issue) => issue.code === "uncited_writer_paragraph"));
    }
  }
  issues.push(...validateIdentityReviewAcceptedArtifacts().issues);
  issues.push(...validateIdentityOverrideArtifacts());
  // Ordinary validation is a canonical.db consumer. Producer-journal/correction application is
  // fail-closed in materializeWiki before authoritative JSONL and SQLite are written; here we
  // validate the immutable override/correction artifact schemas without rematerializing inputs.
  issues.push(...validateSubmissionRetirementOverrides());
  issues.push(...validateSemanticCorrections());
  issues.push(...validateOperationalRecoveryProposalTree({ records }).issues);

  const relationshipAudit = auditRelationshipGraph(records, {
    mode: relationshipMode,
    contract: relationshipContract,
    includeOrphans: false,
  });
  validateRelationshipProjectionParity(relationshipAudit, issues);
  for (const finding of relationshipAudit.findings) {
    const issue: MtaValidationIssue = {
      code: finding.code,
      message: `${finding.detail} [${finding.finding_id}]`,
      recordId: finding.record_id,
      path: finding.record_id ? undefined : "data/contracts/relationships/v1/contract.json",
    };
    if (finding.severity === "error") issues.push(issue);
    else if (finding.severity === "warning") warnings.push(issue);
  }
  validateRelationshipCompletenessWarnings(warnings, issues, relationshipMode);

  return {
    requiredPathCount,
    submissionCount: submissionIds.length,
    canonicalRecordCount: records.length,
    wikiPageCount: pagePaths.length,
    issues,
    warnings,
  };
}
