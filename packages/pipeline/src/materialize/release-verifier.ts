import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { FILE_BY_KIND } from "./canonical-read.js";
import { parseReleaseManifest, type ReleaseManifest } from "./export-release.js";
import { assertOperationalOccurrenceReviewDecisions, parseOperationalOccurrenceReviewSnapshot, proveOperationalOccurrenceV2ReviewProjection } from "./operational-occurrence-review.js";
import { parseOperationalOccurrenceSummary, parseOperationalOccurrencesJsonl } from "./operational-occurrences.js";
import { parseRelationshipReleaseBundleDescriptor, verifyStagedRelationshipReleaseBundle } from "./relationship-release-bundle.js";
import type { MtaCanonicalRecord } from "@mta-wiki/db/types";
import { readReleaseStatus } from "./release-status.js";
import { parseOperationalAnchorSummary, parseOperationalAnchorsJsonl } from "./operational-anchors.js";
import { parseOperationalAnchorReviewSnapshot } from "./operational-anchor-review.js";
import { parseRouteAnchorsJsonl } from "./route-anchors.js";
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

export const RELEASE_CONTRACT_REGISTRY: Readonly<Record<string, Readonly<Record<number, Decoder>>>> = {
  operational_anchors: { 1: (bytes) => parseOperationalAnchorsJsonl(bytes.toString("utf8")) },
  operational_anchor_review_decisions: { 1: (bytes, path) => parseOperationalAnchorReviewSnapshot(json(bytes, path)) },
  operational_occurrences: { 1: (bytes, path) => occurrencesAtVersion(bytes, path, 1), 2: (bytes, path) => occurrencesAtVersion(bytes, path, 2) },
  operational_occurrence_review_decisions: { 1: (bytes, path) => parseOperationalOccurrenceReviewSnapshot(json(bytes, path)) },
  relationship_integrity_bundle: { 1: relationshipBundleV1 },
};
const pointers: Readonly<Record<string, keyof ReleaseManifest["pointers"]>> = { operational_anchors: "operational_anchors", operational_anchor_review_decisions: "operational_anchor_review_decisions", operational_occurrences: "operational_occurrences", operational_occurrence_review_decisions: "operational_occurrence_review_decisions", relationship_integrity_bundle: "relationship_integrity_bundle" };
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

export function verifyReleaseDirectory(releaseDir: string, expectedReleaseId = basename(resolve(releaseDir)), options: { allowQuarantined?: boolean } = {}): ReleaseVerificationResult {
  const manifestPath = safeFile(releaseDir, "manifest.json");
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) throw new Error(`Release manifest is missing: ${manifestPath}`);
  const manifestBytes = readFileSync(manifestPath); const manifest = parseReleaseManifest(json(manifestBytes, "manifest.json"));
  if (expectedReleaseId !== manifest.release_id) throw new Error(`manifest release_id ${manifest.release_id} does not match expected release ${expectedReleaseId}`);
  const rootDir = resolve(releaseDir, "../../../..");
  const status = readReleaseStatus(rootDir, manifest.release_id);
  const files = new Map<string, Buffer>();
  for (const [name, metadata] of Object.entries(manifest.files)) { const path = safeFile(releaseDir, name); if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`manifest file is missing: ${name}`); const bytes = readFileSync(path); if (bytes.length !== metadata.bytes) throw new Error(`${name}: bytes mismatch; expected ${metadata.bytes}, got ${bytes.length}`); const digest = sha256(bytes); if (digest !== metadata.sha256) throw new Error(`${name}: SHA-256 mismatch; expected ${metadata.sha256}, got ${digest}`); files.set(name, bytes); }
  if (status) {
    const expectedReleasePath = relative(rootDir, resolve(releaseDir)).split(sep).join("/");
    if (status.release_path !== expectedReleasePath) throw new Error(`Release ${manifest.release_id} quarantine release_path mismatch`);
    if (status.manifest_sha256 !== sha256(manifestBytes)) throw new Error(`Release ${manifest.release_id} quarantine manifest SHA-256 mismatch`);
    const contractVersion = manifest.contract_versions[status.failing_artifact.contract as keyof ReleaseManifest["contract_versions"]];
    if (contractVersion !== status.failing_artifact.declared_version) throw new Error(`Release ${manifest.release_id} quarantine contract version mismatch`);
    const pointerKey = pointers[status.failing_artifact.contract];
    const pointer = pointerKey ? manifest.pointers[pointerKey] : undefined;
    if (pointer !== status.failing_artifact.path) throw new Error(`Release ${manifest.release_id} quarantine artifact pointer mismatch`);
    const metadata = manifest.files[status.failing_artifact.path];
    if (!metadata || metadata.bytes !== status.failing_artifact.bytes || metadata.sha256 !== status.failing_artifact.sha256) {
      throw new Error(`Release ${manifest.release_id} quarantine artifact metadata mismatch`);
    }
    if (!options.allowQuarantined) throw new Error(`Release ${manifest.release_id} is ${status.status}: ${status.reason_code}: ${status.reason}; ${status.failing_artifact.decoder_error}`);
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
  if (routeAnchorPointer) {
    const bytes = files.get(routeAnchorPointer);
    if (!bytes) throw new Error(`route-anchor payload is not addressed by manifest files: ${routeAnchorPointer}`);
    parseRouteAnchorsJsonl(bytes.toString("utf8"), routeAnchorPointer);
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
  const bundle = decoded.get("relationship_integrity_bundle") as ReturnType<typeof parseRelationshipReleaseBundleDescriptor> | undefined;
  if (bundle) for (const artifact of bundle.artifacts) { const path = `relationship-integrity/${artifact.source_path}`; const bytes = files.get(path); if (!bytes) throw new Error(`relationship bundle artifact is not content-addressed by manifest: ${path}`); if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) throw new Error(`relationship bundle artifact metadata mismatch: ${path}`); }
  if (bundle) verifyStagedRelationshipReleaseBundle(releaseDir, bundle);
  return { release_id: manifest.release_id, manifest_version: manifest.manifest_version, manifest_sha256: sha256(manifestBytes), verified_file_count: files.size, verified_record_count: recordCount, contract_versions: manifest.contract_versions };
}
