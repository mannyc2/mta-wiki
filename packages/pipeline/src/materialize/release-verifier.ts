import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { FILE_BY_KIND } from "./canonical-read.js";
import { parseReleaseManifest, type ReleaseManifest } from "./export-release.js";
import {
  assertOperationalOccurrenceReviewDecisions,
  loadOperationalOccurrenceAcceptedDecisions,
  operationalOccurrenceReviewAcceptedDir,
  operationalOccurrenceReviewDecisions,
  operationalOccurrenceReviewSnapshotJson,
  parseOperationalOccurrenceAcceptedDecision,
  parseOperationalOccurrenceReviewSnapshot,
  proveOperationalOccurrenceV2ReviewProjection,
} from "./operational-occurrence-review.js";
import { parseOperationalOccurrenceSummary, parseOperationalOccurrencesJsonl } from "./operational-occurrences.js";
import { parseRelationshipReleaseBundleDescriptor, verifyStagedRelationshipReleaseBundle } from "./relationship-release-bundle.js";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { readReleaseStatus } from "./release-status.js";
import { parseOperationalAnchorSummary, parseOperationalAnchorsJsonl } from "./operational-anchors.js";
import {
  assertOperationalAnchorReviewDecisions,
  loadOperationalAnchorReviewDecisions,
  operationalAnchorReviewAcceptedDir,
  operationalAnchorReviewSnapshotJson,
  parseOperationalAnchorReviewSnapshot,
} from "./operational-anchor-review.js";
import {
  assertOperationalProjectionRetirementsAgainstRouteIdentity,
  loadOperationalProjectionRetirements,
  parseOperationalProjectionRetirementV1,
  projectOperationalAnchorReviewRetirements,
  projectOperationalOccurrenceReviewRetirements,
  serializeOperationalProjectionRetirementV1,
  type LoadedOperationalProjectionRetirementV1,
} from "./operational-projection-retirements.js";
import { parseRouteAnchorsJsonl } from "./route-anchors.js";
import { routeAnchorsJsonl } from "./route-anchors.js";
import { parseRouteIdentitySnapshotV1 } from "./route-identity-contract.js";
import { canonicalRouteRecordFingerprint, projectRouteAnchorsFromIdentitySnapshot } from "./route-identities.js";
import { loadRouteIdentityReleaseProjection } from "./route-identity-release.js";
import { parseTaxonomy } from "./export-taxonomy.js";
import {
  assertTreatmentVocabularyReconciled,
  collectTreatmentVocabulary,
  parseTreatmentSemanticContract,
  treatmentSemanticContractBytes,
  treatmentSemanticReviewQueueJsonl,
  treatmentVocabularyInventoryJson,
  treatmentVocabularyReconciliationJson,
} from "./treatment-semantics.js";
import {
  buildRouteTreatmentScopeProjection,
  routeTreatmentScopeReconciliationJsonl,
  routeTreatmentScopesJsonl,
  routeTreatmentScopeSummaryJson,
} from "./route-treatment-scopes.js";
import {
  BUS_LANE_IDENTITY_VERDICT_SCHEMA_VERSION,
  FRONTIER_EXCEPTIONS_SOURCE_PATH,
  IDENTITY_VERDICT_MANIFEST,
  IDENTITY_VERDICT_ROOT,
  MEMBER_GRAIN_MANIFEST,
  MEMBER_GRAIN_ROOT,
  MEMBER_EXTENT_MANIFEST,
  OPERATIONAL_OCCURRENCE_MEMBER_EXTENT_SCHEMA_VERSION,
  OPERATIONAL_OCCURRENCE_MEMBER_GRAIN_SCHEMA_VERSION,
  RELEASE_QUALITY_PROVENANCE_SCHEMA_VERSION,
  closureReleasePath,
  memberExtentReleasePath,
} from "./release-companions.js";
import {
  parseBusLaneIdentityVerdicts,
} from "../quality/bus-lane-identity-companion.js";
import {
  STUDY_READINESS_V2_DISPOSITIONS,
  parseStudyReadinessV2Rows,
} from "../quality/study-readiness-v2.js";
import {
  memberExtentProjectionSha256,
  parseMemberGrainCompanion,
} from "../quality/member-grain-companion.js";
import type { MemberExtentRow } from "../quality/study-readiness-v1.js";
import { parseReleaseBuildReceipt } from "./release-build-receipt.js";
import { runResolvedPackReferenceAdapter } from "../consumer/reference-adapter.js";
import { verifyPublicPackDirectory } from "./resolved-transit-pack.js";
import { assertPublicSafe } from "../consumer/public-contract.js";

const verifiedReleaseBrand: unique symbol = Symbol("VerifiedReleaseBundle");
export type ReleaseVerificationResult = {
  release_id: string;
  manifest_version: number;
  manifest_sha256: string;
  verified_file_count: number;
  verified_record_count: number;
  contract_versions: ReleaseManifest["contract_versions"];
};
export type VerifiedReleaseBundle = ReleaseVerificationResult & {
  readonly [verifiedReleaseBrand]: true;
  readonly manifest: ReleaseManifest;
  readonly release_dir: string;
  readAddressed(path: string): Buffer;
};
export function verificationSummary(bundle: VerifiedReleaseBundle): ReleaseVerificationResult {
  return {
    release_id: bundle.release_id,
    manifest_version: bundle.manifest_version,
    manifest_sha256: bundle.manifest_sha256,
    verified_file_count: bundle.verified_file_count,
    verified_record_count: bundle.verified_record_count,
    contract_versions: bundle.contract_versions,
  };
}
type Decoder = (bytes: Buffer, path: string) => unknown;
function json(bytes: Buffer, path: string): unknown { try { return JSON.parse(bytes.toString("utf8")) as unknown; } catch (error) { throw new Error(`${path}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`); } }
function object(value: unknown, path: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path}: expected object`); return value as Record<string, unknown>; }
function jsonlV1(bytes: Buffer, path: string): unknown[] { return bytes.toString("utf8").split(/\r?\n/u).filter(Boolean).map((line, index) => { const row = object(json(Buffer.from(line), `${path}:${index + 1}`), `${path}:${index + 1}`); if (row.schema_version !== 1) throw new Error(`${path}:${index + 1}.schema_version: expected 1`); return row; }); }
function reviewV1(bytes: Buffer, path: string): unknown { const value = object(json(bytes, path), path); const extras = Object.keys(value).filter((key) => !["snapshot_version", "decision_schema_version", "decision_count", "decisions"].includes(key)); if (extras.length) throw new Error(`${path}: unexpected ${extras.sort().join(", ")}`); if (value.snapshot_version !== 1 || value.decision_schema_version !== 1) throw new Error(`${path}: expected snapshot and decision schema version 1`); if (!Array.isArray(value.decisions) || value.decision_count !== value.decisions.length) throw new Error(`${path}: decision_count must equal decisions length`); return value; }
function relationshipBundleV1(bytes: Buffer, path: string): ReturnType<typeof parseRelationshipReleaseBundleDescriptor> {
  const value = object(json(bytes, path), path);
  const extras = Object.keys(value).filter((key) => !["schema_version", "bundle_id", "contract_id", "validation_mode", "descriptor", "artifact_count", "artifacts"].includes(key));
  if (extras.length) throw new Error(`${path}: unexpected ${extras.sort().join(", ")}`);
  if (!Array.isArray(value.artifacts) || value.artifact_count !== value.artifacts.length) throw new Error(`${path}: artifact_count must equal artifacts length`);
  const artifacts = value.artifacts.map((entry, index) => { const artifact = object(entry, `${path}.artifacts[${index}]`); const releasePath = artifact.release_path; if (releasePath !== `relationship-integrity/${String(artifact.source_path)}`) throw new Error(`${path}.artifacts[${index}].release_path does not match source_path`); const { release_path: _, ...descriptorArtifact } = artifact; return descriptorArtifact; });
  return parseRelationshipReleaseBundleDescriptor({ schema_version: value.schema_version, bundle_id: value.bundle_id, contract_id: value.contract_id, validation_mode: value.validation_mode, artifacts });
}
type AddressedArtifact = { path: string; bytes: number; sha256: string; row_count?: number };
type MemberExtentManifestV1 = {
  schema_version: 1;
  contract_id: string;
  input_pins: AddressedArtifact[];
  files: AddressedArtifact[];
};
function addressedArtifacts(value: unknown, path: string): AddressedArtifact[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  return value.map((entry, index) => {
    const artifact = object(entry, `${path}[${index}]`);
    const allowed = ["path", "bytes", "sha256", "row_count"];
    const extras = Object.keys(artifact).filter((key) => !allowed.includes(key));
    if (extras.length) throw new Error(`${path}[${index}]: unexpected ${extras.sort().join(", ")}`);
    if (typeof artifact.path !== "string" || !artifact.path) throw new Error(`${path}[${index}].path: expected string`);
    if (typeof artifact.bytes !== "number" || !Number.isInteger(artifact.bytes) || artifact.bytes < 0) throw new Error(`${path}[${index}].bytes: expected non-negative integer`);
    if (typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(artifact.sha256)) throw new Error(`${path}[${index}].sha256: expected SHA-256`);
    if (artifact.row_count !== undefined && (typeof artifact.row_count !== "number" || !Number.isInteger(artifact.row_count) || artifact.row_count < 0)) throw new Error(`${path}[${index}].row_count: expected non-negative integer`);
    return {
      path: artifact.path,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      ...(artifact.row_count === undefined ? {} : { row_count: artifact.row_count }),
    };
  });
}
function memberExtentManifestV1(bytes: Buffer, path: string): MemberExtentManifestV1 {
  const value = object(json(bytes, path), path);
  const extras = Object.keys(value).filter((key) => !["schema_version", "contract_id", "input_pins", "files"].includes(key));
  if (extras.length) throw new Error(`${path}: unexpected ${extras.sort().join(", ")}`);
  if (value.schema_version !== OPERATIONAL_OCCURRENCE_MEMBER_EXTENT_SCHEMA_VERSION) throw new Error(`${path}.schema_version: expected 1`);
  if (value.contract_id !== "operational-occurrence-member-extent-v1") throw new Error(`${path}.contract_id: unexpected contract`);
  return {
    schema_version: 1,
    contract_id: value.contract_id,
    input_pins: addressedArtifacts(value.input_pins, `${path}.input_pins`),
    files: addressedArtifacts(value.files, `${path}.files`),
  };
}
type ClosureCompanionManifestV1 = {
  schema_version: 1;
  contract_id: string;
  count: number;
  projection: AddressedArtifact;
  fixture: AddressedArtifact;
  histogram: Record<string, number>;
  member_extent_projection?: AddressedArtifact;
};
function closureManifestV1(
  bytes: Buffer,
  path: string,
  kind: "identity" | "grain",
): ClosureCompanionManifestV1 {
  const value = object(json(bytes, path), path);
  const expected = kind === "identity"
    ? [
        "authorizes_cross_product", "authorizes_study", "candidate_count",
        "contract_id", "fixture", "projection", "schema_version",
        "verdict_histogram",
      ]
    : [
        "authorizes_cross_product", "authorizes_study", "contract_id",
        "fixture", "member_count", "member_extent_projection", "projection",
        "schema_version", "terminal_disposition_histogram",
      ];
  const extras = Object.keys(value).filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !(key in value));
  if (extras.length || missing.length) {
    throw new Error(`${path}: exact manifest fields required`);
  }
  if (
    value.schema_version !== 1 ||
    value.authorizes_study !== false ||
    value.authorizes_cross_product !== false
  ) {
    throw new Error(`${path}: invalid non-authorizing manifest`);
  }
  const contractId = kind === "identity"
    ? "bus-lane-identity-verdict-manifest-v1"
    : "operational-occurrence-member-grain-manifest-v1";
  if (value.contract_id !== contractId) {
    throw new Error(`${path}.contract_id: unexpected contract`);
  }
  const count = value[kind === "identity" ? "candidate_count" : "member_count"];
  if (!Number.isInteger(count) || (count as number) < 1) {
    throw new Error(`${path}: expected positive denominator count`);
  }
  const projection = addressedArtifacts([value.projection], `${path}.projection`)[0]!;
  const fixture = addressedArtifacts([value.fixture], `${path}.fixture`)[0]!;
  const memberExtentProjection = kind === "grain"
    ? addressedArtifacts(
        [value.member_extent_projection],
        `${path}.member_extent_projection`,
      )[0]!
    : undefined;
  const histogramField = kind === "identity"
    ? "verdict_histogram"
    : "terminal_disposition_histogram";
  const rawHistogram = object(value[histogramField], `${path}.${histogramField}`);
  const histogram: Record<string, number> = {};
  for (const [key, countValue] of Object.entries(rawHistogram).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (!Number.isInteger(countValue) || (countValue as number) < 1) {
      throw new Error(`${path}.${histogramField}.${key}: expected positive integer`);
    }
    histogram[key] = countValue as number;
  }
  if (
    Object.values(histogram).reduce((sum, countValue) => sum + countValue, 0) !==
      count
  ) {
    throw new Error(`${path}.${histogramField}: count mismatch`);
  }
  return {
    schema_version: 1,
    contract_id: contractId,
    count: count as number,
    projection,
    fixture,
    histogram,
    ...(memberExtentProjection
      ? { member_extent_projection: memberExtentProjection }
      : {}),
  };
}
function occurrencesAtVersion(bytes: Buffer, path: string, version: 1 | 2): unknown {
  rows(bytes).forEach((line, index) => { const raw = object(json(Buffer.from(line), `${path}:${index + 1}`), `${path}:${index + 1}`); if (raw.schema_version !== version) throw new Error(`${path}:${index + 1}.schema_version: declared contract requires ${version}`); });
  return parseOperationalOccurrencesJsonl(bytes.toString("utf8"));
}
function anchorReviewAtVersion(bytes: Buffer, path: string, version: 1 | 2): unknown {
  const parsed = parseOperationalAnchorReviewSnapshot(json(bytes, path));
  if (parsed.snapshot_version !== version) throw new Error(`${path}.snapshot_version: declared contract requires ${version}`);
  return parsed;
}
function occurrenceReviewAtVersion(bytes: Buffer, path: string, version: 1 | 2): unknown {
  const parsed = parseOperationalOccurrenceReviewSnapshot(json(bytes, path));
  if (parsed.snapshot_version !== version) throw new Error(`${path}.snapshot_version: declared contract requires ${version}`);
  return parsed;
}

export const RELEASE_CONTRACT_REGISTRY: Readonly<Record<string, Readonly<Record<number, Decoder>>>> = {
  operational_anchors: { 1: (bytes) => parseOperationalAnchorsJsonl(bytes.toString("utf8")) },
  operational_anchor_review_decisions: {
    1: (bytes, path) => anchorReviewAtVersion(bytes, path, 1),
    2: (bytes, path) => anchorReviewAtVersion(bytes, path, 2),
  },
  operational_occurrences: { 1: (bytes, path) => occurrencesAtVersion(bytes, path, 1), 2: (bytes, path) => occurrencesAtVersion(bytes, path, 2) },
  operational_occurrence_review_decisions: {
    1: (bytes, path) => occurrenceReviewAtVersion(bytes, path, 1),
    2: (bytes, path) => occurrenceReviewAtVersion(bytes, path, 2),
  },
  operational_occurrence_member_extents: { 1: memberExtentManifestV1 },
  bus_lane_identity_verdicts: {
    [BUS_LANE_IDENTITY_VERDICT_SCHEMA_VERSION]: (bytes, path) =>
      closureManifestV1(bytes, path, "identity"),
  },
  operational_occurrence_member_grain: {
    [OPERATIONAL_OCCURRENCE_MEMBER_GRAIN_SCHEMA_VERSION]: (bytes, path) =>
      closureManifestV1(bytes, path, "grain"),
  },
  relationship_integrity_bundle: { 1: relationshipBundleV1 },
  route_anchors: { 1: (bytes, path) => parseRouteAnchorsJsonl(bytes.toString("utf8"), path) },
  route_identity_snapshot: { 1: (bytes, path) => parseRouteIdentitySnapshotV1(json(bytes, path)) },
};
const pointers: Readonly<Record<string, keyof ReleaseManifest["pointers"]>> = { operational_anchors: "operational_anchors", operational_anchor_review_decisions: "operational_anchor_review_decisions", operational_occurrences: "operational_occurrences", operational_occurrence_review_decisions: "operational_occurrence_review_decisions", operational_occurrence_member_extents: "operational_occurrence_member_extents", bus_lane_identity_verdicts: "bus_lane_identity_verdicts", operational_occurrence_member_grain: "operational_occurrence_member_grain", relationship_integrity_bundle: "relationship_integrity_bundle", route_anchors: "route_anchors", route_identity_snapshot: "route_identity_snapshot" };
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function safeFile(dir: string, relativePath: string): string {
  const root = realpathSync(resolve(dir));
  const path = resolve(root, relativePath);
  if (path === root || !path.startsWith(`${root}${sep}`)) throw new Error(`release pointer escapes release directory: ${relativePath}`);
  let cursor = root;
  for (const segment of relativePath.split("/")) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) break;
    const metadata = lstatSync(cursor);
    if (metadata.isSymbolicLink()) throw new Error(`release pointer traverses symbolic link: ${relativePath}`);
    const actual = realpathSync(cursor);
    if (actual !== root && !actual.startsWith(`${root}${sep}`)) throw new Error(`release pointer escapes release directory: ${relativePath}`);
  }
  return path;
}
const rows = (bytes: Buffer) => bytes.toString("utf8").split(/\r?\n/u).filter(Boolean);
const TREATMENT_RELEASE_ARTIFACTS = [
  "treatment_semantics.json",
  "treatment_vocabulary_inventory.json",
  "treatment_vocabulary_reconciliation.json",
  "treatment_semantic_review_queue.jsonl",
  "route_treatment_scopes.jsonl",
  "route_treatment_scope_reconciliation.jsonl",
  "route_treatment_scope_summary.json",
] as const;

function assertReleaseArtifactBytes(
  files: ReadonlyMap<string, Buffer>,
  path: string,
  expected: string,
): void {
  const actual = files.get(path);
  if (!actual) throw new Error(`release treatment contract artifact is missing: ${path}`);
  if (actual.toString("utf8") !== expected) {
    throw new Error(`${path}: deterministic treatment contract bytes differ from canonical inputs`);
  }
}

function assertPinnedBytes(
  files: ReadonlyMap<string, Buffer>,
  releasePath: string,
  artifact: AddressedArtifact,
): Buffer {
  const bytes = files.get(releasePath);
  if (!bytes) throw new Error(`release companion artifact is missing: ${releasePath}`);
  if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) {
    throw new Error(`${releasePath}: release companion pin mismatch`);
  }
  if (artifact.row_count !== undefined && rows(bytes).length !== artifact.row_count) {
    throw new Error(`${releasePath}: row_count mismatch; expected ${artifact.row_count}, got ${rows(bytes).length}`);
  }
  return bytes;
}

function occurrenceMemberKeys(rawOccurrences: unknown[]): {
  all: Set<string>;
  eligible: Set<string>;
  occurrenceIds: Set<string>;
  routeRecordIds: Set<string>;
  treatmentRecordIds: Set<string>;
} {
  const all = new Set<string>();
  const eligible = new Set<string>();
  const occurrenceIds = new Set<string>();
  const routeRecordIds = new Set<string>();
  const treatmentRecordIds = new Set<string>();
  for (const [index, raw] of rawOccurrences.entries()) {
    const occurrence = object(raw, `operational_occurrences[${index}]`);
    if (typeof occurrence.occurrence_id !== "string" || !Array.isArray(occurrence.routes)) {
      throw new Error(`operational_occurrences[${index}]: member-extent identity fields are missing`);
    }
    occurrenceIds.add(occurrence.occurrence_id);
    const treatment = object(occurrence.treatment, `operational_occurrences[${index}].treatment`);
    const rawMembers = treatment.kind === "atomic" ? [treatment.member] : treatment.members;
    if (!Array.isArray(rawMembers)) throw new Error(`operational_occurrences[${index}].treatment: expected members`);
    const members = rawMembers.map((rawMember, memberIndex) => {
      const member = object(rawMember, `operational_occurrences[${index}].treatment.members[${memberIndex}]`);
      if (typeof member.treatment_record_id !== "string") throw new Error(`operational_occurrences[${index}].treatment member id is missing`);
      treatmentRecordIds.add(member.treatment_record_id);
      return member.treatment_record_id;
    });
    for (const [routeIndex, rawRoute] of occurrence.routes.entries()) {
      const route = object(rawRoute, `operational_occurrences[${index}].routes[${routeIndex}]`);
      if (typeof route.route_record_id !== "string") throw new Error(`operational_occurrences[${index}].route id is missing`);
      routeRecordIds.add(route.route_record_id);
      for (const treatmentRecordId of members) {
        const key = `${occurrence.occurrence_id}\0${route.route_record_id}\0${treatmentRecordId}`;
        all.add(key);
        if (occurrence.study_projection_eligible === true) eligible.add(key);
      }
    }
  }
  return { all, eligible, occurrenceIds, routeRecordIds, treatmentRecordIds };
}

function assertMemberExtentCompanion(
  files: ReadonlyMap<string, Buffer>,
  manifest: MemberExtentManifestV1,
  rawOccurrences: unknown[],
): void {
  const expectedMemberPaths = new Set<string>([memberExtentReleasePath(MEMBER_EXTENT_MANIFEST)]);
  for (const artifact of manifest.files) {
    const releasePath = memberExtentReleasePath(artifact.path);
    expectedMemberPaths.add(releasePath);
    assertPinnedBytes(files, releasePath, artifact);
  }
  for (const artifact of manifest.input_pins) {
    const releasePath = artifact.path.endsWith("/operational_occurrences.jsonl")
      ? "operational_occurrences.jsonl"
      : memberExtentReleasePath(artifact.path);
    if (releasePath.startsWith("member-extent/")) expectedMemberPaths.add(releasePath);
    assertPinnedBytes(files, releasePath, artifact);
  }
  const actualMemberPaths = [...files.keys()].filter((path) => path.startsWith("member-extent/")).sort();
  if (actualMemberPaths.join("\n") !== [...expectedMemberPaths].sort().join("\n")) {
    throw new Error("member-extent release artifacts must exactly match the companion manifest and input pins");
  }

  const rowArtifact = manifest.files.find((artifact) => artifact.path.endsWith("operational_occurrence_member_extents.jsonl"));
  const summaryArtifact = manifest.files.find((artifact) => artifact.path.endsWith("summary.json"));
  const ledgerArtifact = manifest.files.find((artifact) => artifact.path.endsWith("review-ledger.jsonl"));
  if (!rowArtifact || !summaryArtifact || !ledgerArtifact) throw new Error("member-extent companion manifest is incomplete");
  const extentRows = jsonlV1(
    files.get(memberExtentReleasePath(rowArtifact.path))!,
    memberExtentReleasePath(rowArtifact.path),
  );
  const expected = occurrenceMemberKeys(rawOccurrences);
  const seen = new Set<string>();
  const extentCounts: Record<string, number> = {};
  let evidenceComplete = 0;
  for (const [index, raw] of extentRows.entries()) {
    const row = object(raw, `member-extents[${index}]`);
    if (row.contract_id !== manifest.contract_id) throw new Error(`member-extents[${index}].contract_id mismatch`);
    if (row.authorizes_study !== false || row.authorizes_cross_product !== false) throw new Error(`member-extents[${index}] must deny study and cross-product authority`);
    if (typeof row.occurrence_id !== "string" || typeof row.route_record_id !== "string" || typeof row.treatment_record_id !== "string") throw new Error(`member-extents[${index}]: invalid grain`);
    const key = `${row.occurrence_id}\0${row.route_record_id}\0${row.treatment_record_id}`;
    if (seen.has(key)) throw new Error(`member-extents[${index}]: duplicate occurrence/route/treatment grain`);
    seen.add(key);
    if (!expected.all.has(key)) throw new Error(`member-extents[${index}]: grain does not exist in operational occurrences`);
    if (typeof row.extent !== "string" || !["route_wide", "bounded_segment", "stop_set", "mixed", "unresolved"].includes(row.extent)) throw new Error(`member-extents[${index}].extent: invalid disposition`);
    extentCounts[row.extent] = (extentCounts[row.extent] ?? 0) + 1;
    if (row.extent !== "unresolved") evidenceComplete += 1;
  }
  if (seen.size !== expected.all.size || [...expected.all].some((key) => !seen.has(key))) {
    throw new Error("member-extents do not cover every operational occurrence/route/treatment member exactly once");
  }
  const summaryPath = memberExtentReleasePath(summaryArtifact.path);
  const summary = object(json(files.get(summaryPath)!, summaryPath), summaryPath);
  const doctrine = object(summary.doctrine, `${summaryPath}.doctrine`);
  if (doctrine.authorizes_study !== false || doctrine.authorizes_cross_product !== false) throw new Error(`${summaryPath}: doctrine must deny study and cross-product authority`);
  if (summary.occurrence_count !== rawOccurrences.length || summary.member_extent_row_count !== extentRows.length || summary.eligible_member_extent_row_count !== expected.eligible.size || summary.evidence_complete_row_count !== evidenceComplete || summary.unresolved_row_count !== (extentCounts.unresolved ?? 0)) throw new Error(`${summaryPath}: member-extent summary counts do not match verified rows`);
  const declaredCounts = object(summary.extent_counts, `${summaryPath}.extent_counts`);
  for (const extent of ["route_wide", "bounded_segment", "stop_set", "mixed", "unresolved"]) {
    if (declaredCounts[extent] !== (extentCounts[extent] ?? 0)) throw new Error(`${summaryPath}.extent_counts.${extent}: mismatch`);
  }
  if (rows(files.get(memberExtentReleasePath(ledgerArtifact.path))!).length !== summary.reviewed_decision_count) {
    throw new Error(`${summaryPath}: reviewed decision count does not match review ledger`);
  }
}

function assertClosureCompanions(
  files: ReadonlyMap<string, Buffer>,
  manifest: ReleaseManifest,
  identityManifest: ClosureCompanionManifestV1,
  grainManifest: ClosureCompanionManifestV1,
): void {
  const identityPointer = manifest.pointers.bus_lane_identity_verdicts;
  const grainPointer = manifest.pointers.operational_occurrence_member_grain;
  if (
    identityPointer !== closureReleasePath(IDENTITY_VERDICT_MANIFEST) ||
    grainPointer !== closureReleasePath(MEMBER_GRAIN_MANIFEST)
  ) {
    throw new Error("manifest-v6 closure companion pointers must address versioned manifests");
  }
  const identityProjectionPath = join(
    dirname(identityPointer),
    identityManifest.projection.path,
  );
  const identityBytes = assertPinnedBytes(
    files,
    identityProjectionPath,
    identityManifest.projection,
  );
  const identityRows = parseBusLaneIdentityVerdicts(
    identityBytes.toString("utf8"),
    identityProjectionPath,
  );
  if (
    identityManifest.count !== 321 ||
    identityRows.length !== identityManifest.count
  ) {
    throw new Error("identity-verdict companion must cover the exact 321-row denominator");
  }
  const actualIdentityHistogram = Object.fromEntries(
    [...new Set(identityRows.map((row) => row.verdict))].sort().map(
      (verdict) => [
        verdict,
        identityRows.filter((row) => row.verdict === verdict).length,
      ],
    ),
  );
  if (
    stableJson(actualIdentityHistogram as JsonValue) !==
      stableJson(identityManifest.histogram as JsonValue)
  ) {
    throw new Error("identity-verdict companion histogram mismatch");
  }
  const identityFixturePath = join(
    dirname(identityPointer),
    identityManifest.fixture.path,
  );
  const identityFixture = assertPinnedBytes(
    files,
    identityFixturePath,
    identityManifest.fixture,
  );
  if (parseBusLaneIdentityVerdicts(
    identityFixture.toString("utf8"),
    identityFixturePath,
  ).length !== 1) {
    throw new Error("identity-verdict fixture must contain exactly one strict row");
  }

  const extentProjection = grainManifest.member_extent_projection;
  if (!extentProjection) throw new Error("member-grain manifest lacks extent projection pin");
  const extentReleasePath = memberExtentReleasePath(extentProjection.path);
  const extentBytes = assertPinnedBytes(files, extentReleasePath, extentProjection);
  if (memberExtentProjectionSha256(extentBytes) !== extentProjection.sha256) {
    throw new Error("member-grain companion member-extent SHA mismatch");
  }
  const extentRows = rows(extentBytes).map((line) =>
    JSON.parse(line) as MemberExtentRow
  );
  const grainProjectionPath = join(
    dirname(grainPointer),
    grainManifest.projection.path,
  );
  const grainBytes = assertPinnedBytes(
    files,
    grainProjectionPath,
    grainManifest.projection,
  );
  const grainRows = parseMemberGrainCompanion(
    grainBytes.toString("utf8"),
    extentProjection.sha256,
    extentProjection.sha256,
    grainProjectionPath,
    extentRows,
  );
  if (grainManifest.count !== 308 || grainRows.length !== grainManifest.count) {
    throw new Error("member-grain companion must cover the exact 308-row denominator");
  }
  const actualGrainHistogram = Object.fromEntries(
    [...new Set(grainRows.map((row) => row.terminal_disposition))].sort().map(
      (disposition) => [
        disposition,
        grainRows.filter((row) => row.terminal_disposition === disposition)
          .length,
      ],
    ),
  );
  if (
    stableJson(actualGrainHistogram as JsonValue) !==
      stableJson(grainManifest.histogram as JsonValue)
  ) {
    throw new Error("member-grain companion histogram mismatch");
  }
  const grainFixturePath = join(
    dirname(grainPointer),
    grainManifest.fixture.path,
  );
  const grainFixture = assertPinnedBytes(
    files,
    grainFixturePath,
    grainManifest.fixture,
  );
  if (parseMemberGrainCompanion(
    grainFixture.toString("utf8"),
    undefined,
    undefined,
    grainFixturePath,
  ).length !== 1) {
    throw new Error("member-grain fixture must contain exactly one strict row");
  }

  const v2Pointer = manifest.pointers.study_readiness_v2;
  if (!v2Pointer) throw new Error("manifest-v6 lacks study-readiness-v2 pointer");
  const v2Manifest = object(json(files.get(v2Pointer)!, v2Pointer), v2Pointer);
  const v2Fields = [
    "authorizes_cross_product", "authorizes_study", "candidate_count",
    "contract_id", "files", "schema_version", "source_fixable_count",
  ];
  if (
    Object.keys(v2Manifest).some((key) => !v2Fields.includes(key)) ||
    v2Fields.some((key) => !(key in v2Manifest)) ||
    v2Manifest.schema_version !== 2 ||
    v2Manifest.contract_id !== "study-readiness-v2-manifest" ||
    v2Manifest.candidate_count !== 484 ||
    v2Manifest.source_fixable_count !== 0 ||
    v2Manifest.authorizes_study !== false ||
    v2Manifest.authorizes_cross_product !== false
  ) {
    throw new Error(`${v2Pointer}: invalid closure bridge manifest`);
  }
  const v2Artifacts = addressedArtifacts(v2Manifest.files, `${v2Pointer}.files`);
  if (
    stableJson(v2Artifacts.map((artifact) => artifact.path).sort() as JsonValue) !==
      stableJson(["bridge-ledger.jsonl", "bridge-summary.json"] as JsonValue)
  ) {
    throw new Error(`${v2Pointer}: exact bridge artifact set required`);
  }
  const v2LedgerArtifact = v2Artifacts.find((artifact) =>
    artifact.path === "bridge-ledger.jsonl"
  );
  if (!v2LedgerArtifact) throw new Error(`${v2Pointer}: bridge ledger pin missing`);
  for (const artifact of v2Artifacts) {
    assertPinnedBytes(
      files,
      join(dirname(v2Pointer), artifact.path),
      artifact,
    );
  }
  const v2LedgerPath = join(dirname(v2Pointer), v2LedgerArtifact.path);
  const v2Ledger = files.get(v2LedgerPath)!;
  const v2Rows = parseStudyReadinessV2Rows(
    v2Ledger.toString("utf8"),
    v2LedgerPath,
  );
  if (
    v2Rows.length !== 484 ||
    new Set(v2Rows.map((row) => row.candidate_id)).size !== 484
  ) {
    throw new Error(`${v2LedgerPath}: bridge must be exact, unique, and terminal`);
  }
  const v2ByCandidate = new Map(v2Rows.map((row) => [row.candidate_id, row]));
  for (const identity of identityRows) {
    const bridge = v2ByCandidate.get(identity.candidate_id);
    const actual = bridge?.closing_artifacts.identity_verdict;
    const expected = {
      verdict: identity.verdict,
      decision_id: identity.decision_id,
      occurrence_id: identity.occurrence_id,
      receipt_ids: identity.acquisition_receipt_ids,
    };
    if (
      !actual ||
      stableJson(actual as unknown as JsonValue) !==
        stableJson(expected as unknown as JsonValue)
    ) {
      throw new Error(`${identity.candidate_id}: bridge identity closure mismatch`);
    }
  }
  const bridgeExtentIds = v2Rows.flatMap((row) =>
    row.closing_artifacts.member_extents.map((extent) => extent.extent_id)
  );
  const grainExtentIds = new Set(grainRows.map((row) => row.extent_id));
  if (
    new Set(bridgeExtentIds).size !== bridgeExtentIds.length ||
    bridgeExtentIds.some((extentId) => !grainExtentIds.has(extentId))
  ) {
    throw new Error(`${v2LedgerPath}: bridge member extents must be an exact unique subset of member grain`);
  }
  const summaryArtifact = v2Artifacts.find((artifact) =>
    artifact.path === "bridge-summary.json"
  )!;
  const summaryPath = join(dirname(v2Pointer), summaryArtifact.path);
  const summary = object(json(files.get(summaryPath)!, summaryPath), summaryPath);
  const summaryFields = [
    "authorizes_cross_product", "authorizes_study", "candidate_count",
    "contract_id", "disposition_histogram", "frontier_exception_count",
    "schema_version", "source_fixable_count",
  ];
  if (
    stableJson(Object.keys(summary).sort() as JsonValue) !==
      stableJson(summaryFields.sort() as JsonValue) ||
    summary.schema_version !== 2 ||
    summary.contract_id !== "study-readiness-bridge-v2" ||
    summary.candidate_count !== 484 ||
    summary.source_fixable_count !== 0 ||
    summary.frontier_exception_count !== 0 ||
    summary.authorizes_study !== false ||
    summary.authorizes_cross_product !== false
  ) {
    throw new Error(`${summaryPath}: invalid bridge summary`);
  }
  const actualV2Histogram = Object.fromEntries(
    STUDY_READINESS_V2_DISPOSITIONS.flatMap((disposition) => {
      const countValue = v2Rows.filter((row) =>
        row.downstream_disposition === disposition
      ).length;
      return countValue > 0 ? [[disposition, countValue]] : [];
    }),
  );
  if (
    stableJson(summary.disposition_histogram as JsonValue) !==
      stableJson(actualV2Histogram as JsonValue)
  ) {
    throw new Error(`${summaryPath}: disposition histogram mismatch`);
  }

  const exceptionsPointer = manifest.pointers.frontier_exceptions;
  if (!exceptionsPointer) throw new Error("manifest-v6 lacks frontier exceptions stamp");
  const exceptionBytes = files.get(exceptionsPointer);
  if (!exceptionBytes) throw new Error(`${exceptionsPointer}: exception stamp is not addressed`);
  const exceptions = object(
    json(exceptionBytes, exceptionsPointer),
    exceptionsPointer,
  );
  const exceptionFields = ["exceptions", "schema_version"];
  if (
    Object.keys(exceptions).some((key) => !exceptionFields.includes(key)) ||
    exceptionFields.some((key) => !(key in exceptions)) ||
    exceptions.schema_version !== 1 ||
    !Array.isArray(exceptions.exceptions)
  ) {
    throw new Error(`${exceptionsPointer}: invalid frontier exception stamp`);
  }
  const provenancePointer = manifest.pointers.quality_provenance;
  if (!provenancePointer) {
    throw new Error("manifest-v6 lacks quality provenance pointer");
  }
  const provenanceBytes = files.get(provenancePointer);
  if (!provenanceBytes) {
    throw new Error(`${provenancePointer}: quality provenance is not addressed`);
  }
  const provenance = object(json(provenanceBytes, provenancePointer), provenancePointer);
  const semanticDelta = object(
    provenance.semantic_delta,
    `${provenancePointer}.semantic_delta`,
  );
  const frontierGate = object(
    semanticDelta.frontier_gate,
    `${provenancePointer}.semantic_delta.frontier_gate`,
  );
  const exceptionCount = exceptions.exceptions.length;
  if (
    (frontierGate.status === "closed" && exceptionCount !== 0) ||
    (frontierGate.status === "bypassed" && exceptionCount === 0) ||
    (frontierGate.status !== "closed" && frontierGate.status !== "bypassed")
  ) {
    throw new Error(
      `${exceptionsPointer}: frontier gate status and exception stamp disagree`,
    );
  }
}

function assertQualityProvenance(
  files: ReadonlyMap<string, Buffer>,
  pointer: string,
  releaseId: string,
  generatorCommit: string,
  canonicalRecords: MtaCanonicalRecord[],
  rawOccurrences: unknown[],
): void {
  const value = object(json(files.get(pointer)!, pointer), pointer);
  if (value.schema_version !== RELEASE_QUALITY_PROVENANCE_SCHEMA_VERSION || value.release_id !== releaseId || value.generator_commit !== generatorCommit) throw new Error(`${pointer}: release identity or generator pin mismatch`);
  if (value.layer !== "quality_provenance" || value.authorizes_study !== false || value.authorizes_cross_product !== false) throw new Error(`${pointer}: must be a non-authorizing quality/provenance layer`);
  if (!Array.isArray(value.artifacts)) throw new Error(`${pointer}.artifacts: expected array`);
  const addressed = new Set<string>([pointer]);
  for (const [index, rawArtifact] of value.artifacts.entries()) {
    const artifact = object(rawArtifact, `${pointer}.artifacts[${index}]`);
    if (typeof artifact.source_path !== "string" || typeof artifact.release_path !== "string" || typeof artifact.bytes !== "number" || typeof artifact.sha256 !== "string") throw new Error(`${pointer}.artifacts[${index}]: invalid pin`);
    let expectedPath: string;
    if (
      artifact.source_path.startsWith("data/quality/acquisition/target-list") ||
      artifact.source_path.startsWith("data/quality/acquisition/reviews/")
    ) {
      expectedPath = `quality-provenance/${artifact.source_path}`;
    } else if (
      artifact.source_path === FRONTIER_EXCEPTIONS_SOURCE_PATH ||
      artifact.source_path === "generated:frontier-exceptions-v1"
    ) {
      expectedPath = "quality-provenance/frontier-exceptions.json";
    } else if (
      artifact.source_path.startsWith(`${IDENTITY_VERDICT_ROOT}/`) ||
      artifact.source_path.startsWith(`${MEMBER_GRAIN_ROOT}/`) ||
      artifact.source_path.startsWith("data/quality/study-readiness/v2/")
    ) {
      expectedPath = closureReleasePath(artifact.source_path);
    } else {
      expectedPath = memberExtentReleasePath(artifact.source_path);
    }
    if (artifact.release_path !== expectedPath) throw new Error(`${pointer}.artifacts[${index}]: source/release path mapping mismatch`);
    const pin: AddressedArtifact = { path: artifact.source_path, bytes: artifact.bytes, sha256: artifact.sha256 };
    if (typeof artifact.row_count === "number") pin.row_count = artifact.row_count;
    assertPinnedBytes(files, artifact.release_path, pin);
    addressed.add(artifact.release_path);
  }
  const actualQualityPaths = [...files.keys()].filter((path) => path.startsWith("quality-provenance/")).sort();
  const expectedQualityPaths = [...addressed].filter((path) => path.startsWith("quality-provenance/")).sort();
  if (actualQualityPaths.join("\n") !== expectedQualityPaths.join("\n")) throw new Error("quality-provenance artifacts are not represented exactly once by its manifest");

  const semanticDelta = object(value.semantic_delta, `${pointer}.semantic_delta`);
  if (semanticDelta.canonical_record_count !== canonicalRecords.length) throw new Error(`${pointer}: canonical record count mismatch`);
  const occurrenceDelta = object(semanticDelta.operational_occurrences, `${pointer}.semantic_delta.operational_occurrences`);
  const currentOccurrence = object(occurrenceDelta.current, `${pointer}.semantic_delta.operational_occurrences.current`);
  const occurrenceBytes = files.get("operational_occurrences.jsonl")!;
  if (currentOccurrence.bytes !== occurrenceBytes.length || currentOccurrence.sha256 !== sha256(occurrenceBytes) || currentOccurrence.row_count !== rawOccurrences.length) throw new Error(`${pointer}: operational occurrence delta pin mismatch`);

  const overlayManifestPath = "quality-provenance/data/quality/acquisition/reviews/v1/manifest.json";
  const overlayPath = "quality-provenance/data/quality/acquisition/reviews/v1/reviewed-overlay.jsonl";
  const overlayManifest = object(json(files.get(overlayManifestPath)!, overlayManifestPath), overlayManifestPath);
  if (overlayManifest.authorizes_study !== false || overlayManifest.authorizes_cross_product !== false) throw new Error(`${overlayManifestPath}: overlay must deny study and cross-product authority`);
  const overlayRows = jsonlV1(files.get(overlayPath)!, overlayPath);
  const eventIds = new Set(canonicalRecords.filter((record) => record.record_kind === "event").map((record) => record.record_id));
  const targetIds = new Set<string>();
  const dispositionCounts: Record<string, number> = {};
  let candidatePairCount = 0;
  for (const [index, raw] of overlayRows.entries()) {
    const row = object(raw, `${overlayPath}:${index + 1}`);
    if (row.authorizes_study !== false || row.authorizes_cross_product !== false) throw new Error(`${overlayPath}:${index + 1}: must deny study and cross-product authority`);
    if (typeof row.target_id !== "string" || targetIds.has(row.target_id)) throw new Error(`${overlayPath}:${index + 1}: duplicate or missing target identity`);
    targetIds.add(row.target_id);
    if (typeof row.forecast_event_record_id !== "string" || !eventIds.has(row.forecast_event_record_id)) throw new Error(`${overlayPath}:${index + 1}: forecast event is not canonical`);
    if (row.bound_realized_event_id !== null && (typeof row.bound_realized_event_id !== "string" || !eventIds.has(row.bound_realized_event_id))) throw new Error(`${overlayPath}:${index + 1}: bound realized event is not canonical`);
    if (typeof row.disposition !== "string") throw new Error(`${overlayPath}:${index + 1}: disposition is missing`);
    dispositionCounts[row.disposition] = (dispositionCounts[row.disposition] ?? 0) + 1;
    if (!Array.isArray(row.candidate_reviews)) throw new Error(`${overlayPath}:${index + 1}: candidate reviews are missing`);
    for (const candidateReview of row.candidate_reviews) {
      const review = object(candidateReview, `${overlayPath}:${index + 1}.candidate_reviews`);
      if (!Array.isArray(review.candidate_event_record_ids)) throw new Error(`${overlayPath}:${index + 1}: candidate event ids are missing`);
      candidatePairCount += review.candidate_event_record_ids.length;
    }
  }
  const summary = object(overlayManifest.summary, `${overlayManifestPath}.summary`);
  const declaredDispositions = object(summary.counts_by_disposition, `${overlayManifestPath}.summary.counts_by_disposition`);
  if (summary.reviewed_target_count !== overlayRows.length || summary.candidate_bearing_target_denominator !== overlayRows.length || summary.reviewed_candidate_pair_count !== candidatePairCount) throw new Error(`${overlayManifestPath}: overlay denominator mismatch`);
  for (const disposition of ["exact_realization", "later_plan_replacement", "reviewed_nonmatch", "still_open"]) {
    if (declaredDispositions[disposition] !== (dispositionCounts[disposition] ?? 0)) throw new Error(`${overlayManifestPath}: ${disposition} count mismatch`);
  }
  if (overlayManifest.overlay_sha256 !== sha256(files.get(overlayPath)!)) throw new Error(`${overlayManifestPath}: overlay SHA-256 mismatch`);
}

export function verifyReleaseDirectory(releaseDir: string, expectedReleaseId = basename(resolve(releaseDir)), options: { allowQuarantined?: boolean; sourceRootDir?: string } = {}): VerifiedReleaseBundle {
  const manifestPath = safeFile(releaseDir, "manifest.json");
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) throw new Error(`Release manifest is missing: ${manifestPath}`);
  const manifestBytes = readFileSync(manifestPath); const manifest = parseReleaseManifest(json(manifestBytes, "manifest.json"));
  if (expectedReleaseId !== manifest.release_id) throw new Error(`manifest release_id ${manifest.release_id} does not match expected release ${expectedReleaseId}`);
  const rootDir = options.sourceRootDir ?? resolve(releaseDir, "../../../..");
  const status = readReleaseStatus(rootDir, manifest.release_id);
  const files = new Map<string, Buffer>();
  for (const [name, metadata] of Object.entries(manifest.files)) { const path = safeFile(releaseDir, name); if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`manifest file is missing: ${name}`); const bytes = readFileSync(path); if (bytes.length !== metadata.bytes) throw new Error(`${name}: bytes mismatch; expected ${metadata.bytes}, got ${bytes.length}`); const digest = sha256(bytes); if (digest !== metadata.sha256) throw new Error(`${name}: SHA-256 mismatch; expected ${metadata.sha256}, got ${digest}`); files.set(name, bytes); }
  if (status) {
    const expectedReleasePath = relative(rootDir, resolve(releaseDir)).split(sep).join("/");
    if (status.release_path !== expectedReleasePath) throw new Error(`Release ${manifest.release_id} quarantine release_path mismatch`);
    if (status.manifest_sha256 !== sha256(manifestBytes)) throw new Error(`Release ${manifest.release_id} quarantine manifest SHA-256 mismatch`);
    if (status.schema_version === 1) {
      const contractVersion = manifest.contract_versions[status.failing_artifact.contract as keyof ReleaseManifest["contract_versions"]];
      if (contractVersion !== status.failing_artifact.declared_version) throw new Error("Release " + manifest.release_id + " quarantine contract version mismatch");
      const pointerKey = pointers[status.failing_artifact.contract];
      const pointer = pointerKey ? manifest.pointers[pointerKey] : undefined;
      if (pointer !== status.failing_artifact.path) throw new Error("Release " + manifest.release_id + " quarantine artifact pointer mismatch");
    } else if (status.failing_artifact.declared_contract_version !== null) {
      throw new Error("Release " + manifest.release_id + " v2 quarantine cannot claim a version for its unversioned legacy artifact");
    }
    const metadata = manifest.files[status.failing_artifact.path];
    if (!metadata || metadata.bytes !== status.failing_artifact.bytes || metadata.sha256 !== status.failing_artifact.sha256) throw new Error("Release " + manifest.release_id + " quarantine artifact metadata mismatch");
    const diagnostic = status.schema_version === 1 ? status.failing_artifact.decoder_error : status.failing_artifact.verifier_error;
    if (!options.allowQuarantined) throw new Error("Release " + manifest.release_id + " is " + status.status + ": " + status.reason_code + ": " + status.reason + "; " + diagnostic);
  }
  let recordCount = 0;
  for (const [kind, filename] of FILE_BY_KIND) { const bytes = files.get(filename); if (!bytes) throw new Error(`record payload missing from manifest: ${filename}`); const lines = rows(bytes); const expected = manifest.record_counts[kind]; if (expected === undefined) throw new Error(`manifest record_counts.${kind} is missing`); if (lines.length !== expected) throw new Error(`${filename}: row-count mismatch; expected ${expected}, got ${lines.length}`); lines.forEach((line, index) => { const record = object(json(Buffer.from(line), `${filename}:${index + 1}`), `${filename}:${index + 1}`); if (record.record_kind !== kind) throw new Error(`${filename}:${index + 1}.record_kind: expected ${kind}`); }); recordCount += lines.length; }
  const canonicalRecords = [...FILE_BY_KIND.entries()].flatMap(([_, filename]) => rows(files.get(filename)!).map((line) => json(Buffer.from(line), filename) as MtaCanonicalRecord));
  const anchorSummaryPointer = manifest.pointers.operational_anchor_summary;
  if (anchorSummaryPointer) {
    const bytes = files.get(anchorSummaryPointer);
    if (!bytes) throw new Error(`anchor summary is not addressed: ${anchorSummaryPointer}`);
    parseOperationalAnchorSummary(json(bytes, anchorSummaryPointer), anchorSummaryPointer);
  }
  const routeAnchorPointer = manifest.pointers.route_anchors;
  let routeAnchors: ReturnType<typeof parseRouteAnchorsJsonl> | undefined;
  if (routeAnchorPointer) {
    const bytes = files.get(routeAnchorPointer);
    if (!bytes) throw new Error(`route-anchor payload is not addressed by manifest files: ${routeAnchorPointer}`);
    routeAnchors = parseRouteAnchorsJsonl(bytes.toString("utf8"), routeAnchorPointer);
  }
  if (status?.schema_version === 2 && routeAnchors) {
    const confirmed = status.affected_identities.every((identity) => {
      if (identity.identity_type !== "route" || identity.route_record_id === null) return false;
      const intended = routeAnchors.find((row) => row.gtfs_route_id === identity.gtfs_route_id);
      const misplaced = routeAnchors.find((row) =>
        row.gtfs_route_id !== identity.gtfs_route_id &&
        (row.canonical_route_record_id === identity.route_record_id ||
          row.variant_record_ids.includes(identity.route_record_id!)),
      );
      return intended?.canonical_route_record_id !== identity.route_record_id &&
        !intended?.variant_record_ids.includes(identity.route_record_id) &&
        misplaced !== undefined;
    });
    if (confirmed) throw new Error(status.failing_artifact.verifier_error);
  }
  const taxonomyPointer = manifest.pointers.taxonomy;
  if (taxonomyPointer) {
    const bytes = files.get(taxonomyPointer);
    if (!bytes) throw new Error(`taxonomy payload is not addressed by manifest files: ${taxonomyPointer}`);
    const value = json(bytes, taxonomyPointer);
    if (manifest.manifest_version >= 3) parseTaxonomy(value, taxonomyPointer);
    else object(value, taxonomyPointer);
  }
  const decoded = new Map<string, unknown>();
  for (const [contract, version] of Object.entries(manifest.contract_versions)) { if (version === undefined) continue; const decoder = RELEASE_CONTRACT_REGISTRY[contract]?.[version]; if (!decoder) throw new Error(`manifest declares unregistered contract ${contract}@${version}`); const pointerKey = pointers[contract]; if (!pointerKey) throw new Error(`manifest contract ${contract}@${version} has no registered pointer`); const pointer = manifest.pointers[pointerKey]; if (typeof pointer !== "string") throw new Error(`manifest contract ${contract}@${version} has no addressed payload`); const bytes = files.get(pointer); if (!bytes) throw new Error(`manifest contract ${contract}@${version} points to unaddressed file ${pointer}`); try { decoded.set(contract, decoder(bytes, `${pointer} (${contract}@${version})`)); } catch (error) { throw new Error(`release contract ${contract}@${version} failed strict decode at ${pointer}: ${error instanceof Error ? error.message : String(error)}`); } }
  const occurrencePointer = manifest.pointers.operational_occurrences;
  if (occurrencePointer && manifest.contract_versions.operational_occurrences === 2) decoded.set("operational_occurrences", parseOperationalOccurrencesJsonl(files.get(occurrencePointer)!.toString("utf8"), canonicalRecords));
  const occurrences = decoded.get("operational_occurrences"); const review = decoded.get("operational_occurrence_review_decisions");
  if (Array.isArray(occurrences) && review && typeof review === "object" && Array.isArray((review as { decisions?: unknown }).decisions)) { const proof = manifest.contract_versions.operational_occurrences === 2 ? proveOperationalOccurrenceV2ReviewProjection(occurrences as Parameters<typeof assertOperationalOccurrenceReviewDecisions>[1], canonicalRecords) : undefined; assertOperationalOccurrenceReviewDecisions((review as { decisions: Parameters<typeof assertOperationalOccurrenceReviewDecisions>[0] }).decisions, occurrences as Parameters<typeof assertOperationalOccurrenceReviewDecisions>[1], proof); const pointer = manifest.pointers.operational_occurrence_summary; if (pointer) { const bytes = files.get(pointer); if (!bytes) throw new Error(`occurrence summary is not addressed: ${pointer}`); const summary = parseOperationalOccurrenceSummary(json(bytes, pointer)); if (summary.occurrence_count !== occurrences.length) throw new Error(`${pointer}: occurrence_count mismatch; expected ${occurrences.length}, got ${summary.occurrence_count}`); } }
  const routeSnapshot = decoded.get("route_identity_snapshot") as ReturnType<typeof parseRouteIdentitySnapshotV1> | undefined;
  const treatmentArtifactPresence = TREATMENT_RELEASE_ARTIFACTS.filter((path) => files.has(path));
  if (treatmentArtifactPresence.length !== 0 && treatmentArtifactPresence.length !== TREATMENT_RELEASE_ARTIFACTS.length) {
    const missing = TREATMENT_RELEASE_ARTIFACTS.filter((path) => !files.has(path));
    throw new Error(`release treatment contract artifact set is incomplete: ${missing.join(", ")}`);
  }
  if (treatmentArtifactPresence.length === TREATMENT_RELEASE_ARTIFACTS.length) {
    if (!routeSnapshot || !Array.isArray(occurrences)) {
      throw new Error("release treatment contract requires decoded manifest-v5 route identities and occurrences");
    }
    const treatmentContract = parseTreatmentSemanticContract(
      json(files.get("treatment_semantics.json")!, "treatment_semantics.json"),
      "treatment_semantics.json",
    );
    const treatmentInventory = collectTreatmentVocabulary(canonicalRecords);
    const treatmentReconciliation = assertTreatmentVocabularyReconciled(
      treatmentInventory,
      treatmentContract,
    );
    const routeTreatmentProjection = buildRouteTreatmentScopeProjection(
      canonicalRecords,
      routeSnapshot,
      occurrences as Parameters<typeof buildRouteTreatmentScopeProjection>[2],
    );
    assertReleaseArtifactBytes(files, "treatment_semantics.json", treatmentSemanticContractBytes(treatmentContract));
    assertReleaseArtifactBytes(files, "treatment_vocabulary_inventory.json", treatmentVocabularyInventoryJson(treatmentInventory));
    assertReleaseArtifactBytes(
      files,
      "treatment_vocabulary_reconciliation.json",
      treatmentVocabularyReconciliationJson(treatmentReconciliation),
    );
    assertReleaseArtifactBytes(
      files,
      "treatment_semantic_review_queue.jsonl",
      treatmentSemanticReviewQueueJsonl(treatmentContract),
    );
    assertReleaseArtifactBytes(files, "route_treatment_scopes.jsonl", routeTreatmentScopesJsonl(routeTreatmentProjection.scopes));
    assertReleaseArtifactBytes(
      files,
      "route_treatment_scope_reconciliation.jsonl",
      routeTreatmentScopeReconciliationJsonl(routeTreatmentProjection.reconciliation),
    );
    assertReleaseArtifactBytes(
      files,
      "route_treatment_scope_summary.json",
      routeTreatmentScopeSummaryJson(routeTreatmentProjection.summary),
    );
  }
  if (routeSnapshot) {
    const routeAnchorBytes = files.get(manifest.pointers.route_anchors!);
    if (!routeAnchorBytes) throw new Error("manifest-v5 route_anchors payload is missing");
    const projectedRouteAnchorBytes = routeAnchorsJsonl(projectRouteAnchorsFromIdentitySnapshot(routeSnapshot));
    if (routeAnchorBytes.toString("utf8") !== projectedRouteAnchorBytes) throw new Error("route identity snapshot compatibility projection bytes differ from route_anchors");
    if (routeSnapshot.expected_route_anchors_sha256 !== sha256(routeAnchorBytes)) throw new Error("route identity snapshot compatibility projection SHA-256 mismatch");
    if (routeSnapshot.expected_route_anchors_count !== rows(routeAnchorBytes).length) throw new Error("route identity snapshot compatibility projection row-count mismatch");
    const canonicalRoutes = canonicalRecords.filter((record) => record.record_kind === "route").sort((left, right) => left.record_id.localeCompare(right.record_id));
    const routeRecordIds = canonicalRoutes.map((record) => record.record_id);
    const bindingIds = routeSnapshot.record_bindings.map((binding) => binding.route_record_id).sort();
    if (JSON.stringify(routeRecordIds) !== JSON.stringify(bindingIds)) throw new Error("route identity snapshot must bind every canonical route record exactly once");
    const canonicalById = new Map(canonicalRoutes.map((record) => [record.record_id, record]));
    for (const binding of routeSnapshot.record_bindings) {
      const canonical = canonicalById.get(binding.route_record_id);
      if (!canonical || canonicalRouteRecordFingerprint(canonical) !== binding.canonical_record_fingerprint) throw new Error(binding.route_record_id + ": route identity snapshot canonical fingerprint is stale");
    }
    const serviceKeys = routeSnapshot.service_identities.map((identity) => identity.dataset_id + "\0" + identity.source_route_id);
    if (new Set(serviceKeys).size !== serviceKeys.length) throw new Error("route identity snapshot contains duplicate exact service identity");

    const bindingByRecordId = new Map(routeSnapshot.record_bindings.map((binding) => [binding.route_record_id, binding]));
    const operationalAnchors = decoded.get("operational_anchors");
    if (!Array.isArray(operationalAnchors)) throw new Error("manifest-v5 operational anchors did not decode to rows");
    const anchorReviewSnapshot = decoded.get("operational_anchor_review_decisions") as ReturnType<typeof parseOperationalAnchorReviewSnapshot>;
    const occurrenceReviewSnapshot = decoded.get("operational_occurrence_review_decisions") as ReturnType<typeof parseOperationalOccurrenceReviewSnapshot>;
    if (
      (anchorReviewSnapshot.snapshot_version === 2) !==
      (occurrenceReviewSnapshot.snapshot_version === 2)
    ) {
      throw new Error("manifest-v5 operational review contracts must both be v1 or both be v2");
    }
    const releaseRetirementSources = new Map<string, LoadedOperationalProjectionRetirementV1>();
    const loadReleaseRetirementSource = (projection: {
      retirement_id: string;
      retirement_source: { release_path: string; bytes: number; sha256: string };
    }): LoadedOperationalProjectionRetirementV1 => {
      const prior = releaseRetirementSources.get(projection.retirement_source.release_path);
      if (prior) return prior;
      const bytes = files.get(projection.retirement_source.release_path);
      if (
        !bytes || bytes.length !== projection.retirement_source.bytes ||
        sha256(bytes) !== projection.retirement_source.sha256
      ) {
        throw new Error(`${projection.retirement_id}: retirement source is not exactly manifest-addressed`);
      }
      const source = parseOperationalProjectionRetirementV1(
        json(bytes, projection.retirement_source.release_path),
        projection.retirement_source.release_path,
      );
      if (serializeOperationalProjectionRetirementV1(source) !== bytes.toString("utf8")) {
        throw new Error(`${projection.retirement_id}: retirement source must use canonical stable JSON bytes followed by LF`);
      }
      if (source.retirement_id !== projection.retirement_id) {
        throw new Error(`${projection.retirement_id}: retirement source id mismatch`);
      }
      const loaded: LoadedOperationalProjectionRetirementV1 = {
        ...source,
        artifact_path: projection.retirement_source.release_path,
        source_bytes: bytes.length,
        source_sha256: sha256(bytes),
      };
      releaseRetirementSources.set(projection.retirement_source.release_path, loaded);
      return loaded;
    };
    const verifyArchivedArtifact = (
      artifact: { release_path: string; bytes: number; sha256: string },
    ): Buffer => {
      const bytes = files.get(artifact.release_path);
      if (!bytes || bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) {
        throw new Error(`${artifact.release_path}: retired original is not exactly manifest-addressed`);
      }
      return bytes;
    };
    const seenRetirementTargets = new Map<string, Set<string>>();
    if (anchorReviewSnapshot.snapshot_version === 2) {
      for (const projection of anchorReviewSnapshot.retirements) {
        const source = loadReleaseRetirementSource(projection);
        const expected = projectOperationalAnchorReviewRetirements([source]).find(
          (entry) => entry.target.decision_id === projection.target.decision_id,
        );
        if (
          !expected ||
          stableJson(expected as unknown as JsonValue) !== stableJson(projection as unknown as JsonValue)
        ) {
          throw new Error(`${projection.target.decision_id}: anchor retirement differs from its source receipt`);
        }
        const archived = verifyArchivedArtifact(projection.target.original_artifact);
        const archivedSnapshot = parseOperationalAnchorReviewSnapshot({
          snapshot_version: 1,
          decision_schema_version: 1,
          decision_count: 1,
          decisions: [json(archived, projection.target.original_artifact.release_path)],
        });
        const archivedDecision = archivedSnapshot.decisions[0]!;
        if (
          archivedDecision.decision_id !== projection.target.decision_id ||
          archivedDecision.route_record_id !== projection.binding.route_record_id
        ) {
          throw new Error(`${projection.target.decision_id}: archived anchor decision does not match its retirement target`);
        }
        if (operationalAnchors.some((rawAnchor) =>
          object(rawAnchor, "retired anchor search").anchor_id === `operational-reviewed:${projection.target.decision_id}`)) {
          throw new Error(`${projection.target.decision_id}: retired anchor still appears in operational projection`);
        }
        const seen = seenRetirementTargets.get(projection.retirement_source.release_path) ?? new Set<string>();
        seen.add(`anchor:${projection.target.decision_id}`);
        seenRetirementTargets.set(projection.retirement_source.release_path, seen);
      }
    }
    if (occurrenceReviewSnapshot.snapshot_version === 2) {
      for (const projection of occurrenceReviewSnapshot.retirements) {
        const source = loadReleaseRetirementSource(projection);
        const expected = projectOperationalOccurrenceReviewRetirements([source]).find(
          (entry) => entry.target.decision_id === projection.target.decision_id,
        );
        if (
          !expected ||
          stableJson(expected as unknown as JsonValue) !== stableJson(projection as unknown as JsonValue)
        ) {
          throw new Error(`${projection.target.decision_id}: occurrence retirement differs from its source receipt`);
        }
        const archived = verifyArchivedArtifact(projection.target.original_artifact);
        const archivedDecision = parseOperationalOccurrenceAcceptedDecision(
          json(archived, projection.target.original_artifact.release_path),
          projection.target.original_artifact.release_path,
        );
        const archivedGtfsRouteIds = archivedDecision.routes
          .filter((route) => route.route_record_id === projection.binding.route_record_id)
          .map((route) => route.gtfs_route_id)
          .sort();
        if (
          archivedDecision.decision_id !== projection.target.decision_id ||
          archivedDecision.occurrence_id !== projection.target.occurrence_id ||
          archivedDecision.founding_key !== projection.target.founding_key ||
          stableJson(archivedGtfsRouteIds as unknown as JsonValue) !==
            stableJson(projection.target.pinned_gtfs_route_ids as unknown as JsonValue) ||
          projection.target.pinned_gtfs_route_ids.length !== 1 ||
          projection.target.pinned_gtfs_route_ids[0] !== projection.binding.gtfs_route_id
        ) {
          throw new Error(`${projection.target.decision_id}: archived occurrence decision does not match its retirement target`);
        }
        if (
          Array.isArray(occurrences) &&
          occurrences.some((rawOccurrence) =>
            object(rawOccurrence, "retired occurrence search").occurrence_id === projection.target.occurrence_id)
        ) {
          throw new Error(`${projection.target.occurrence_id}: retired occurrence still appears in operational projection`);
        }
        if (occurrenceReviewSnapshot.decisions.some(
          (decision) => decision.occurrence_id === projection.target.occurrence_id,
        )) {
          throw new Error(`${projection.target.occurrence_id}: retired occurrence identity is reused by an active review decision`);
        }
        const seen = seenRetirementTargets.get(projection.retirement_source.release_path) ?? new Set<string>();
        seen.add(`occurrence:${projection.target.decision_id}`);
        seenRetirementTargets.set(projection.retirement_source.release_path, seen);
      }
    }
    for (const [releasePath, source] of releaseRetirementSources) {
      const expectedTargets = [
        ...source.anchor_review_decisions.map((target) => `anchor:${target.decision_id}`),
        ...source.occurrence_review_decisions.map((target) => `occurrence:${target.decision_id}`),
      ].sort();
      const actualTargets = [...(seenRetirementTargets.get(releasePath) ?? [])].sort();
      if (expectedTargets.join("\n") !== actualTargets.join("\n")) {
        throw new Error(`${source.retirement_id}: review snapshots do not account for every retirement target exactly once`);
      }
    }
    const retirements = [...releaseRetirementSources.values()]
      .sort((left, right) => left.retirement_id.localeCompare(right.retirement_id));
    if (anchorReviewSnapshot.snapshot_version === 2 && retirements.length === 0) {
      throw new Error("manifest-v5 review-v2 contracts require at least one manifest-addressed retirement receipt");
    }
    assertOperationalProjectionRetirementsAgainstRouteIdentity(retirements, routeSnapshot);
    const expectedRetirementPaths = new Set<string>();
    if (anchorReviewSnapshot.snapshot_version === 2) {
      for (const projection of anchorReviewSnapshot.retirements) {
        expectedRetirementPaths.add(projection.retirement_source.release_path);
        expectedRetirementPaths.add(projection.target.original_artifact.release_path);
      }
    }
    if (occurrenceReviewSnapshot.snapshot_version === 2) {
      for (const projection of occurrenceReviewSnapshot.retirements) {
        expectedRetirementPaths.add(projection.retirement_source.release_path);
        expectedRetirementPaths.add(projection.target.original_artifact.release_path);
      }
    }
    const actualRetirementPaths = [...files.keys()]
      .filter((path) => path.startsWith("review-retirements/"))
      .sort();
    if (
      actualRetirementPaths.join("\n") !==
      [...expectedRetirementPaths].sort().join("\n")
    ) {
      throw new Error("manifest review-retirement artifacts must be represented exactly once by the review snapshots");
    }

    const activeAnchorReviews = assertOperationalAnchorReviewDecisions(
      anchorReviewSnapshot.decisions,
      canonicalRecords,
    );
    const activeAnchorDecisionIds = new Set(activeAnchorReviews.map((decision) => decision.decision_id));
    const reviewedAnchorDecisionIds = operationalAnchors
      .map((rawAnchor, index) => object(rawAnchor, `operational_anchors[${index}]`))
      .map((anchor) => typeof anchor.anchor_id === "string" ? anchor.anchor_id : "")
      .filter((anchorId) => anchorId.startsWith("operational-reviewed:"))
      .map((anchorId) => anchorId.slice("operational-reviewed:".length));
    if (
      new Set(reviewedAnchorDecisionIds).size !== reviewedAnchorDecisionIds.length ||
      [...activeAnchorDecisionIds].sort().join("\n") !== reviewedAnchorDecisionIds.sort().join("\n")
    ) {
      throw new Error("operational reviewed anchors must represent every active anchor review decision exactly once");
    }

    if (options.sourceRootDir !== undefined) {
      const sourceRetirements = loadOperationalProjectionRetirements(rootDir);
      const sourceActiveAnchorReviews = assertOperationalAnchorReviewDecisions(
        loadOperationalAnchorReviewDecisions(operationalAnchorReviewAcceptedDir(rootDir), {
          rootDir,
          retirements: sourceRetirements,
        }),
        canonicalRecords,
      );
      const anchorReviewPointer = manifest.pointers.operational_anchor_review_decisions!;
      const anchorReviewBytes = files.get(anchorReviewPointer)!;
      if (
        anchorReviewBytes.toString("utf8") !==
        operationalAnchorReviewSnapshotJson(sourceActiveAnchorReviews, sourceRetirements)
      ) {
        throw new Error("operational anchor review snapshot is not the exact active accepted source projection");
      }
    }
    for (const [index, rawAnchor] of operationalAnchors.entries()) {
      const anchor = object(rawAnchor, "operational_anchors[" + String(index) + "]");
      if (!Array.isArray(anchor.route_record_ids) || !Array.isArray(anchor.unmatched_route_record_ids) || !Array.isArray(anchor.gtfs_route_ids)) throw new Error("operational_anchors[" + String(index) + "]: expected route identity arrays");
      const expectedGtfs = new Set<string>();
      const expectedUnmatched: string[] = [];
      for (const routeRecordId of anchor.route_record_ids) {
        if (typeof routeRecordId !== "string") throw new Error("operational_anchors[" + String(index) + "].route_record_ids: expected strings");
        const binding = bindingByRecordId.get(routeRecordId);
        if (!binding) throw new Error(routeRecordId + ": operational anchor has no exact release binding");
        if (binding.projectable) expectedGtfs.add(binding.gtfs_route_id!);
        else expectedUnmatched.push(routeRecordId);
      }
      const actualGtfs = (anchor.gtfs_route_ids as unknown[]).map((value) => String(value)).sort();
      const actualUnmatched = (anchor.unmatched_route_record_ids as unknown[]).map((value) => String(value)).sort();
      if (JSON.stringify(actualGtfs) !== JSON.stringify([...expectedGtfs].sort()) || JSON.stringify(actualUnmatched) !== JSON.stringify(expectedUnmatched.sort())) throw new Error("operational_anchors[" + String(index) + "]: route binding/GTFS parity mismatch");
    }
    if (Array.isArray(occurrences)) {
      if (options.sourceRootDir !== undefined) {
        const sourceRetirements = loadOperationalProjectionRetirements(rootDir);
        const sourceActiveAnchorReviews = assertOperationalAnchorReviewDecisions(
          loadOperationalAnchorReviewDecisions(operationalAnchorReviewAcceptedDir(rootDir), {
            rootDir,
            retirements: sourceRetirements,
          }),
          canonicalRecords,
        );
        const activeOccurrenceReviews = loadOperationalOccurrenceAcceptedDecisions(
          operationalOccurrenceReviewAcceptedDir(rootDir),
          { rootDir, retirements: sourceRetirements },
        );
        const occurrenceProof = proveOperationalOccurrenceV2ReviewProjection(
          occurrences as Parameters<typeof assertOperationalOccurrenceReviewDecisions>[1],
          canonicalRecords,
        );
        const rebuiltOccurrenceReviews = assertOperationalOccurrenceReviewDecisions(
          operationalOccurrenceReviewDecisions(
            occurrences as Parameters<typeof assertOperationalOccurrenceReviewDecisions>[1],
            sourceActiveAnchorReviews,
            activeOccurrenceReviews,
            occurrenceProof,
          ),
          occurrences as Parameters<typeof assertOperationalOccurrenceReviewDecisions>[1],
          occurrenceProof,
        );
        const occurrenceReviewPointer = manifest.pointers.operational_occurrence_review_decisions!;
        const occurrenceReviewBytes = files.get(occurrenceReviewPointer)!;
        if (
          occurrenceReviewBytes.toString("utf8") !==
          operationalOccurrenceReviewSnapshotJson(rebuiltOccurrenceReviews, sourceRetirements)
        ) {
          throw new Error("operational occurrence review snapshot is not the exact active accepted source projection");
        }
      }
      for (const [occurrenceIndex, rawOccurrence] of occurrences.entries()) {
        const occurrence = object(rawOccurrence, "operational_occurrences[" + String(occurrenceIndex) + "]");
        if (!Array.isArray(occurrence.routes)) throw new Error("operational_occurrences[" + String(occurrenceIndex) + "].routes: expected array");
        for (const [routeIndex, rawRoute] of occurrence.routes.entries()) {
          const route = object(rawRoute, "operational_occurrences[" + String(occurrenceIndex) + "].routes[" + String(routeIndex) + "]");
          const routeRecordId = typeof route.route_record_id === "string" ? route.route_record_id : "";
          const binding = bindingByRecordId.get(routeRecordId);
          if (!binding?.projectable || route.gtfs_route_id !== binding.gtfs_route_id) throw new Error("operational_occurrences[" + String(occurrenceIndex) + "].routes[" + String(routeIndex) + "]: exact binding parity mismatch");
        }
      }
    }

    if (options.sourceRootDir !== undefined) {
      const rebuilt = loadRouteIdentityReleaseProjection({ rootDir, records: canonicalRecords, snapshotId: routeSnapshot.gtfs_snapshot_id });
      const snapshotPointer = manifest.pointers.route_identity_snapshot!;
      const snapshotBytes = files.get(snapshotPointer)!;
      if (!rebuilt || rebuilt.snapshotBytes !== snapshotBytes.toString("utf8")) throw new Error("route identity snapshot is not the exact rebuilt projection of the verified GTFS snapshot and accepted decision files");
    }
  }
  const memberExtentManifest = decoded.get("operational_occurrence_member_extents") as MemberExtentManifestV1 | undefined;
  if (memberExtentManifest) {
    if (!Array.isArray(occurrences)) throw new Error("member-extent companion requires decoded operational occurrences");
    if (manifest.pointers.operational_occurrence_member_extents !== memberExtentReleasePath(MEMBER_EXTENT_MANIFEST)) {
      throw new Error("member-extent companion pointer must address the versioned source manifest");
    }
    assertMemberExtentCompanion(files, memberExtentManifest, occurrences);
  }
  if (manifest.manifest_version >= 6) {
    const identityManifest = decoded.get(
      "bus_lane_identity_verdicts",
    ) as ClosureCompanionManifestV1 | undefined;
    const grainManifest = decoded.get(
      "operational_occurrence_member_grain",
    ) as ClosureCompanionManifestV1 | undefined;
    if (!identityManifest || !grainManifest) {
      throw new Error("manifest-v6 closure companions did not strict-decode");
    }
    assertClosureCompanions(
      files,
      manifest,
      identityManifest,
      grainManifest,
    );
  }
  if (manifest.pointers.quality_provenance) {
    if (!Array.isArray(occurrences)) throw new Error("quality provenance requires decoded operational occurrences");
    assertQualityProvenance(
      files,
      manifest.pointers.quality_provenance,
      manifest.release_id,
      manifest.generator_commit,
      canonicalRecords,
      occurrences,
    );
  }
  const bundle = decoded.get("relationship_integrity_bundle") as ReturnType<typeof parseRelationshipReleaseBundleDescriptor> | undefined;
  if (bundle) for (const artifact of bundle.artifacts) { const path = `relationship-integrity/${artifact.source_path}`; const bytes = files.get(path); if (!bytes) throw new Error(`relationship bundle artifact is not content-addressed by manifest: ${path}`); if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) throw new Error(`relationship bundle artifact metadata mismatch: ${path}`); }
  if (bundle) verifyStagedRelationshipReleaseBundle(releaseDir, bundle);
  if (manifest.manifest_version === 7) {
    if (manifest.export_profile !== "resolved-pack-v1" || !manifest.as_of_date) {
      throw new Error("manifest-v7 requires the resolved-pack-v1 profile and explicit as-of date");
    }
    const receiptPath = manifest.build_receipt;
    if (!receiptPath) throw new Error("manifest-v7 build receipt pointer is missing");
    const receiptBytes = files.get(receiptPath);
    if (!receiptBytes) throw new Error("manifest-v7 build receipt is not addressed");
    const receipt = parseReleaseBuildReceipt(json(receiptBytes, receiptPath));
    if (receipt.generator_commit !== manifest.generator_commit ||
        receipt.export_options.as_of_date !== manifest.as_of_date) {
      throw new Error("manifest-v7 build receipt does not bind generator/as-of");
    }
    for (const [path, expected] of Object.entries(receipt.output_resources)) {
      const actual = manifest.files[path];
      if (!actual || actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
        throw new Error(`manifest-v7 build receipt output mismatch: ${path}`);
      }
    }
    const expectedOutputPaths = Object.keys(manifest.files).filter((path) => path !== receiptPath).sort();
    if (JSON.stringify(Object.keys(receipt.output_resources).sort()) !== JSON.stringify(expectedOutputPaths)) {
      throw new Error("manifest-v7 build receipt output resource set mismatch");
    }
    const publicRoot = join(releaseDir, "resolved-pack", "public");
    const publicPack = verifyPublicPackDirectory(publicRoot);
    assertPublicSafe(publicPack);
    const adapter = runResolvedPackReferenceAdapter(publicRoot);
    if (adapter.episodes_by_route.length !== publicPack.routes.length) {
      throw new Error("manifest-v7 reference adapter route denominator mismatch");
    }
    const manifestSummary = publicPack.manifest as unknown as Record<string, unknown>;
    if (manifestSummary.as_of_date !== manifest.as_of_date) {
      throw new Error("manifest-v7 public pack as-of mismatch");
    }
    const required = [
      "resolved-pack/operator/interventions/episodes.jsonl",
      "resolved-pack/operator/interventions/applications.jsonl",
      "resolved-pack/operator/interventions/application_reconciliation.jsonl",
      "resolved-pack/operator/placements/candidate_ledger.jsonl",
      "resolved-pack/operator/placements/transitions.jsonl",
      "resolved-pack/operator/lifecycle/intervention_placement_state_as_of.jsonl",
      "resolved-pack/operator/lifecycle/current_intervention_footprint.jsonl",
      "resolved-pack/operator/public-display/public_keys.jsonl",
      "resolved-pack/public/public_intervention_episodes.jsonl",
      "resolved-pack/public/public_intervention_components.jsonl",
      "resolved-pack/public/public_network_summary.json",
    ];
    for (const path of required) if (!files.has(path)) throw new Error(`manifest-v7 incomplete resolved resource set: ${path}`);
  }
  const result: VerifiedReleaseBundle = {
    release_id: manifest.release_id,
    manifest_version: manifest.manifest_version,
    manifest_sha256: sha256(manifestBytes),
    verified_file_count: files.size,
    verified_record_count: recordCount,
    contract_versions: manifest.contract_versions,
    manifest,
    release_dir: resolve(releaseDir),
    readAddressed(path: string) {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`release resource is not addressed: ${path}`);
      return Buffer.from(bytes);
    },
    [verifiedReleaseBrand]: true,
  };
  return Object.freeze(result);
}
