import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
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

export type ReleaseVerificationResult = { release_id: string; manifest_version: number; manifest_sha256: string; verified_file_count: number; verified_record_count: number; contract_versions: ReleaseManifest["contract_versions"] };
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
  relationship_integrity_bundle: { 1: relationshipBundleV1 },
  route_anchors: { 1: (bytes, path) => parseRouteAnchorsJsonl(bytes.toString("utf8"), path) },
  route_identity_snapshot: { 1: (bytes, path) => parseRouteIdentitySnapshotV1(json(bytes, path)) },
};
const pointers: Readonly<Record<string, keyof ReleaseManifest["pointers"]>> = { operational_anchors: "operational_anchors", operational_anchor_review_decisions: "operational_anchor_review_decisions", operational_occurrences: "operational_occurrences", operational_occurrence_review_decisions: "operational_occurrence_review_decisions", relationship_integrity_bundle: "relationship_integrity_bundle", route_anchors: "route_anchors", route_identity_snapshot: "route_identity_snapshot" };
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

export function verifyReleaseDirectory(releaseDir: string, expectedReleaseId = basename(resolve(releaseDir)), options: { allowQuarantined?: boolean; sourceRootDir?: string } = {}): ReleaseVerificationResult {
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
  const bundle = decoded.get("relationship_integrity_bundle") as ReturnType<typeof parseRelationshipReleaseBundleDescriptor> | undefined;
  if (bundle) for (const artifact of bundle.artifacts) { const path = `relationship-integrity/${artifact.source_path}`; const bytes = files.get(path); if (!bytes) throw new Error(`relationship bundle artifact is not content-addressed by manifest: ${path}`); if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) throw new Error(`relationship bundle artifact metadata mismatch: ${path}`); }
  if (bundle) verifyStagedRelationshipReleaseBundle(releaseDir, bundle);
  return { release_id: manifest.release_id, manifest_version: manifest.manifest_version, manifest_sha256: sha256(manifestBytes), verified_file_count: files.size, verified_record_count: recordCount, contract_versions: manifest.contract_versions };
}
