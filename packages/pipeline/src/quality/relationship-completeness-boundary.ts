import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  loadRelationshipContract,
  type LoadedRelationshipContract,
  type RelationshipContract,
} from "@mta-wiki/db/relationship-contract";
import { sha256, stableJson } from "@mta-wiki/db/stable-json";
import type { CanonicalRelationshipCompletenessMirror } from "@mta-wiki/db/canonical-db";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { FILE_BY_KIND } from "@mta-wiki/pipeline/materialize/canonical-read";
import {
  DEFAULT_RELATIONSHIP_COMPLETENESS_OUTPUT_DIR,
  RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
  relationshipCompletenessDbMirror,
  type BusLaneTreatmentCompletenessRow,
  type OccurrenceTreatmentPhysicalityCompletenessRow,
  type LoadedRelationshipCompletenessArtifacts,
  type OccurrenceCompletenessRow,
  type OperationalEventCompletenessRow,
  type RouteIdentityCompletenessRow,
  type RelationshipCompletenessArtifactManifest,
  type RelationshipCompletenessInputPin,
  type RelationshipCompletenessSummary,
} from "@mta-wiki/pipeline/quality/relationship-completeness";
import {
  readRelationshipDispositionFile,
  validateRelationshipDispositionLedger,
  type RelationshipDispositionDecision,
} from "@mta-wiki/pipeline/quality/relationship-dispositions";

export const RELATIONSHIP_COMPLETENESS_SNAPSHOT_STALE_CODE =
  "RC_COMPLETENESS_CANONICAL_SNAPSHOT_STALE" as const;
export const RELATIONSHIP_COMPLETENESS_SNAPSHOT_EXACT_CODE =
  "RC_COMPLETENESS_CANONICAL_SNAPSHOT_EXACT" as const;

export type RelationshipCompletenessSnapshotMismatch = {
  file: string;
  reason: "missing_input_pin" | "sha256_mismatch" | "bytes_mismatch" | "row_count_mismatch";
  expected_sha256: string | null;
  actual_sha256: string;
  expected_bytes: number | null;
  actual_bytes: number;
  expected_row_count: number | null;
  actual_row_count: number;
};

export type RelationshipCompletenessMaterializationBoundary = {
  contract_status: RelationshipContract["contract_status"];
  mode: "warning" | "enforce";
  exact_canonical_snapshot: boolean;
  snapshot_mismatches: RelationshipCompletenessSnapshotMismatch[];
  warning_finding_count: number;
  mirror: CanonicalRelationshipCompletenessMirror;
};

function canonicalJsonl(records: readonly MtaCanonicalRecord[]): string {
  const rows = [...records].sort((left, right) => left.record_id.localeCompare(right.record_id));
  return rows.map((record) => stableJson(record as unknown as JsonValue)).join("\n") +
    (rows.length > 0 ? "\n" : "");
}

function parseJson<T>(content: string, path: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`${path}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseJsonl<T>(content: string, path: string): T[] {
  return content.split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line) as T];
    } catch (error) {
      throw new Error(`${path}:${index + 1}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function assertPin(path: string, content: string, pin: RelationshipCompletenessInputPin): void {
  const actualSha = sha256(content);
  const actualBytes = Buffer.byteLength(content);
  const actualRows = path.endsWith(".jsonl")
    ? (content.trim() ? content.trimEnd().split(/\r?\n/u).length : 0)
    : undefined;
  if (
    actualSha !== pin.sha256 ||
    actualBytes !== pin.bytes ||
    (pin.row_count !== undefined && actualRows !== pin.row_count)
  ) {
    throw new Error(
      `${path}: completeness pin mismatch; expected ${pin.sha256}/${pin.bytes}/${String(pin.row_count)}, ` +
        `found ${actualSha}/${actualBytes}/${String(actualRows)}`,
    );
  }
}

/** Read the immutable, self-addressed completeness artifact set exactly as reviewed. This is
 * intentionally distinct from recomputing against mutable disposition inputs: warning-first
 * materialization must restore the pinned mirror and explicitly call out snapshot drift. */
function readPinnedRelationshipCompletenessArtifacts(): LoadedRelationshipCompletenessArtifacts {
  const outputDir = resolve(repoRoot, DEFAULT_RELATIONSHIP_COMPLETENESS_OUTPUT_DIR);
  const manifestPath = join(outputDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`relationship completeness manifest is missing: ${manifestPath}`);
  const manifestContent = readFileSync(manifestPath, "utf8");
  const manifest = parseJson<RelationshipCompletenessArtifactManifest>(manifestContent, manifestPath);
  if (manifest.schema_version !== RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION || manifest.mode !== "warning") {
    throw new Error(`unsupported relationship completeness artifact schema/mode at ${manifestPath}`);
  }

  const contents: Record<string, string> = { "manifest.json": manifestContent };
  for (const [name, pin] of Object.entries(manifest.files).sort(([left], [right]) => left.localeCompare(right))) {
    if (name !== basename(name) || pin.path !== name) {
      throw new Error(`${manifestPath}: unsafe or inconsistent artifact path ${name}/${pin.path}`);
    }
    const path = join(outputDir, name);
    if (!existsSync(path)) throw new Error(`relationship completeness artifact is missing: ${path}`);
    const content = readFileSync(path, "utf8");
    assertPin(path, content, pin);
    contents[name] = content;
  }

  const expectedInputFingerprint = sha256(stableJson({
    schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
    release_id: manifest.release_id,
    input_pins: [...manifest.input_pins].sort((left, right) => left.path.localeCompare(right.path)),
  } as unknown as JsonValue));
  if (manifest.input_fingerprint !== expectedInputFingerprint) {
    throw new Error(`${manifestPath}: input_fingerprint mismatch`);
  }
  const expectedAuditFingerprint = sha256(stableJson({
    schema_version: RELATIONSHIP_COMPLETENESS_SCHEMA_VERSION,
    input_fingerprint: manifest.input_fingerprint,
    files: manifest.files,
  } as unknown as JsonValue));
  if (manifest.audit_fingerprint !== expectedAuditFingerprint) {
    throw new Error(`${manifestPath}: audit_fingerprint mismatch`);
  }

  const rootPrefix = repoRoot.endsWith(sep) ? repoRoot : `${repoRoot}${sep}`;
  const dispositions: RelationshipDispositionDecision[] = [];
  for (const pin of manifest.input_pins) {
    const path = resolve(repoRoot, pin.path);
    if (!path.startsWith(rootPrefix)) throw new Error(`${manifestPath}: input pin escapes repository root: ${pin.path}`);
    if (!existsSync(path)) throw new Error(`relationship completeness pinned input is missing: ${path}`);
    const content = readFileSync(path, "utf8");
    assertPin(path, content, pin);
    if (
      pin.path.startsWith("data/relationship-integrity/dispositions/") &&
      pin.path.endsWith("/review.jsonl")
    ) {
      dispositions.push(...readRelationshipDispositionFile(path));
    }
  }

  const summary = parseJson<RelationshipCompletenessSummary>(contents["summary.json"]!, join(outputDir, "summary.json"));
  if (
    summary.schema_version !== manifest.schema_version ||
    summary.release_id !== manifest.release_id ||
    summary.input_fingerprint !== manifest.input_fingerprint ||
    stableJson(summary.input_pins as unknown as JsonValue) !== stableJson(manifest.input_pins as unknown as JsonValue)
  ) {
    throw new Error(`${manifestPath}: summary identity/input pins do not match manifest`);
  }
  return {
    occurrenceRows: parseJsonl<OccurrenceCompletenessRow>(
      contents["occurrence-completeness.jsonl"]!,
      join(outputDir, "occurrence-completeness.jsonl"),
    ),
    treatmentRows: parseJsonl<OccurrenceTreatmentPhysicalityCompletenessRow>(
      contents["occurrence-treatment-physicality.jsonl"]!,
      join(outputDir, "occurrence-treatment-physicality.jsonl"),
    ),
    busLaneTreatmentRows: parseJsonl<BusLaneTreatmentCompletenessRow>(
      contents["bus-lane-treatment-completeness.jsonl"]!,
      join(outputDir, "bus-lane-treatment-completeness.jsonl"),
    ),
    eventRows: parseJsonl<OperationalEventCompletenessRow>(
      contents["operational-event-completeness.jsonl"]!,
      join(outputDir, "operational-event-completeness.jsonl"),
    ),
    routeRows: parseJsonl<RouteIdentityCompletenessRow>(
      contents["route-identity-completeness.jsonl"]!,
      join(outputDir, "route-identity-completeness.jsonl"),
    ),
    summary,
    manifest,
    contents,
    outputDir,
    relationshipDispositions: dispositions.sort((left, right) => left.decision_id.localeCompare(right.decision_id)),
  };
}

/** Release-format pins for the exact in-memory canonical snapshot. The completeness audit's
 * immutable release inputs use stable JSON rather than the materializer's incidental object-key
 * order, so these hashes are directly comparable to its manifest pins before any file write. */
export function relationshipCompletenessCanonicalSnapshotPins(
  records: readonly MtaCanonicalRecord[],
): RelationshipCompletenessInputPin[] {
  const knownKinds = new Set(FILE_BY_KIND.keys());
  const unknownKinds = [...new Set(records
    .map((record) => record.record_kind)
    .filter((kind) => !knownKinds.has(kind)))].sort();
  if (unknownKinds.length > 0) {
    throw new Error(`relationship completeness snapshot has unregistered canonical kind(s): ${unknownKinds.join(", ")}`);
  }

  return [...FILE_BY_KIND.entries()]
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([kind, file]) => {
      const kindRecords = records.filter((record) => record.record_kind === kind);
      const content = canonicalJsonl(kindRecords);
      return {
        path: file,
        bytes: Buffer.byteLength(content),
        sha256: sha256(content),
        row_count: kindRecords.length,
      };
    });
}

function canonicalInputPins(loaded: LoadedRelationshipCompletenessArtifacts): Map<string, RelationshipCompletenessInputPin> {
  const canonicalFiles = new Set(FILE_BY_KIND.values());
  const byFile = new Map<string, RelationshipCompletenessInputPin>();
  for (const pin of loaded.summary.input_pins) {
    const file = basename(pin.path);
    if (!canonicalFiles.has(file)) continue;
    if (byFile.has(file)) throw new Error(`relationship completeness has duplicate canonical input pin for ${file}`);
    byFile.set(file, pin);
  }
  return byFile;
}

export function relationshipCompletenessSnapshotMismatches(
  records: readonly MtaCanonicalRecord[],
  loaded: LoadedRelationshipCompletenessArtifacts,
): RelationshipCompletenessSnapshotMismatch[] {
  const expectedByFile = canonicalInputPins(loaded);
  const mismatches: RelationshipCompletenessSnapshotMismatch[] = [];
  for (const actual of relationshipCompletenessCanonicalSnapshotPins(records)) {
    const expected = expectedByFile.get(actual.path);
    if (!expected) {
      mismatches.push({
        file: actual.path,
        reason: "missing_input_pin",
        expected_sha256: null,
        actual_sha256: actual.sha256,
        expected_bytes: null,
        actual_bytes: actual.bytes,
        expected_row_count: null,
        actual_row_count: actual.row_count ?? 0,
      });
      continue;
    }
    const reason = expected.sha256 !== actual.sha256
      ? "sha256_mismatch" as const
      : expected.bytes !== actual.bytes
        ? "bytes_mismatch" as const
        : expected.row_count !== actual.row_count
          ? "row_count_mismatch" as const
          : null;
    if (!reason) continue;
    mismatches.push({
      file: actual.path,
      reason,
      expected_sha256: expected.sha256,
      actual_sha256: actual.sha256,
      expected_bytes: expected.bytes,
      actual_bytes: actual.bytes,
      expected_row_count: expected.row_count ?? null,
      actual_row_count: actual.row_count ?? 0,
    });
  }
  return mismatches.sort((left, right) => left.file.localeCompare(right.file));
}

function assertMirrorReferencesResolve(
  records: readonly MtaCanonicalRecord[],
  loaded: LoadedRelationshipCompletenessArtifacts,
  mirror: CanonicalRelationshipCompletenessMirror,
): void {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const dispositionIssues = validateRelationshipDispositionLedger(records, {
    decisions: loaded.relationshipDispositions,
    byRecordId: new Map(loaded.relationshipDispositions.map((decision) => [decision.record_id, decision])),
  });
  const mirrorIssues: string[] = [];
  for (const disposition of mirror.dispositions) {
    const target = recordsById.get(disposition.recordId);
    if (!target || target.record_kind !== disposition.recordKind) {
      mirrorIssues.push(
        `${disposition.selector}/${disposition.decisionId} targets invalid ${disposition.recordKind} ${disposition.recordId}`,
      );
      continue;
    }
    const evidence = new Set(target.evidence_refs
      .map((ref) => ref.evidence_id)
      .filter((id): id is string => Boolean(id)));
    const missingEvidence = disposition.evidenceIds.filter((evidenceId) => !evidence.has(evidenceId));
    if (missingEvidence.length > 0) {
      mirrorIssues.push(
        `${disposition.selector}/${disposition.decisionId} cites evidence not bound to ${disposition.recordId}: ` +
        missingEvidence.join(", "),
      );
    }
  }
  for (const subject of mirror.subjects) {
    if (subject.canonicalRecordId && !recordsById.has(subject.canonicalRecordId)) {
      mirrorIssues.push(`${subject.selector}/${subject.subjectId} targets missing ${subject.canonicalRecordId}`);
    }
    for (const role of subject.roles) {
      const unresolved = role.recordIds.filter((recordId) => !recordsById.has(recordId));
      if (unresolved.length > 0) {
        mirrorIssues.push(`${subject.selector}/${subject.subjectId}/${role.role} references missing ${unresolved.join(", ")}`);
      }
    }
  }
  const issues = [...dispositionIssues, ...mirrorIssues].sort();
  if (issues.length > 0) {
    throw new Error(`relationship completeness mirror is incompatible with the materialization snapshot:\n${issues.join("\n")}`);
  }
}

function criteriaWithSnapshotDiagnostic(
  mirror: CanonicalRelationshipCompletenessMirror,
  loaded: LoadedRelationshipCompletenessArtifacts,
  mismatches: readonly RelationshipCompletenessSnapshotMismatch[],
): JsonValue {
  const current = mirror.enforcement.criteriaJson;
  const base = current && typeof current === "object" && !Array.isArray(current)
    ? current as Record<string, JsonValue>
    : { artifact_criteria: current };
  return {
    ...base,
    materialization_snapshot: {
      diagnostic_code: mismatches.length === 0
        ? RELATIONSHIP_COMPLETENESS_SNAPSHOT_EXACT_CODE
        : RELATIONSHIP_COMPLETENESS_SNAPSHOT_STALE_CODE,
      status: mismatches.length === 0 ? "exact" : "stale",
      audited_release_id: loaded.summary.release_id,
      audited_input_fingerprint: loaded.summary.input_fingerprint,
      mismatch_count: mismatches.length,
      mismatches: mismatches as unknown as JsonValue,
    },
  };
}

/** Pure fail-closed decision used by tests and by the repository-loading wrapper below. */
export function prepareRelationshipCompletenessMaterializationBoundary(
  records: readonly MtaCanonicalRecord[],
  loaded: LoadedRelationshipCompletenessArtifacts,
  contractStatus: RelationshipContract["contract_status"],
): RelationshipCompletenessMaterializationBoundary {
  const mode = contractStatus === "enforced" ? "enforce" : "warning";
  const snapshotMismatches = relationshipCompletenessSnapshotMismatches(records, loaded);
  const mirror = relationshipCompletenessDbMirror(loaded, mode);
  assertMirrorReferencesResolve(records, loaded, mirror);

  const enforcementIssues: string[] = [];
  if (mode === "enforce") {
    if (!loaded.summary.enforcement_migration.hard_mode_ready) {
      enforcementIssues.push("artifact hard_mode_ready=false");
    }
    if (snapshotMismatches.length > 0) {
      enforcementIssues.push(`canonical snapshot is stale (${snapshotMismatches.map((item) => item.file).join(", ")})`);
    }
    if (mirror.findings.length > 0) {
      enforcementIssues.push(`completeness warning backlog=${mirror.findings.length}`);
    }
    for (const selector of mirror.selectorContracts) {
      if (!selector.enforcementEligible) enforcementIssues.push(`${selector.selector} enforcement_eligible=false`);
      if (selector.expectedCount !== selector.actualCount) {
        enforcementIssues.push(`${selector.selector} expected=${selector.expectedCount} actual=${selector.actualCount}`);
      }
    }
  }
  if (enforcementIssues.length > 0) {
    throw new Error(`relationship completeness rejected authoritative materialization: ${enforcementIssues.join("; ")}`);
  }

  const exactSnapshot = snapshotMismatches.length === 0;
  mirror.enforcement = {
    ...mirror.enforcement,
    hardModeReady: mirror.enforcement.hardModeReady && exactSnapshot && mirror.findings.length === 0,
    criteriaJson: criteriaWithSnapshotDiagnostic(mirror, loaded, snapshotMismatches),
  };
  return {
    contract_status: contractStatus,
    mode,
    exact_canonical_snapshot: exactSnapshot,
    snapshot_mismatches: snapshotMismatches,
    warning_finding_count: mirror.findings.length,
    mirror,
  };
}

/** No mode option is accepted: the checked-in relationship contract always decides whether
 * legacy warnings are mirrored or hard completeness enforcement is active. */
export function relationshipCompletenessForMaterialization(
  records: readonly MtaCanonicalRecord[],
  relationshipContract: LoadedRelationshipContract = loadRelationshipContract(),
): RelationshipCompletenessMaterializationBoundary {
  const loaded = readPinnedRelationshipCompletenessArtifacts();
  return prepareRelationshipCompletenessMaterializationBoundary(
    records,
    loaded,
    relationshipContract.contract.contract_status,
  );
}
