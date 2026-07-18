import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import {
  parseGtfsSnapshotManifestV2,
  verifyGtfsSnapshotDirectory,
} from "@mta-wiki/db/gtfs-snapshot";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

import {
  buildRouteBindingAcceptance,
  type AcceptedArtifactMetadata,
  type AcceptedRouteBindingDecisionV1,
  type AcceptedRouteBindingProjectionRowV1,
  type RouteBindingAcceptanceV1,
} from "./route-binding-acceptance.js";
import {
  parseRouteInventoryJsonl,
  parseRouteIdentitySnapshotV1,
  serializeGtfsSnapshotManifestV2,
  serializeRouteIdentityRecordBindingsJsonl,
  serializeRouteIdentitySnapshotV1,
  serializeRouteInventoryJsonl,
  type RouteIdentityRecordBindingCommonV1,
  type RouteIdentityRecordBindingV1,
  type RouteIdentitySnapshotV1,
} from "./route-identity-contract.js";
import { projectRouteAnchorsFromIdentitySnapshot } from "./route-identities.js";
import { routeAnchorsJsonl, type RouteAnchorRow } from "./route-anchors.js";

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const ACCEPTANCE_PATH = "data/route-identity/accepted/v1/acceptance.json";

export type BuiltRouteIdentityReleaseProjection = {
  snapshotId: string;
  snapshot: RouteIdentitySnapshotV1;
  snapshotBytes: string;
  snapshotSha256: string;
  routeAnchors: RouteAnchorRow[];
  routeAnchorsBytes: string;
};

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(path + ": expected object");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  const unexpected = Object.keys(value).filter((key) => !keys.includes(key));
  if (missing.length || unexpected.length) throw new Error(path + ": strict keys mismatch; missing=[" + missing.sort() + "] unexpected=[" + unexpected.sort() + "]");
}

function nonempty(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(path + ": expected non-empty string");
  return value;
}

function digest(value: unknown, path: string): string {
  const result = nonempty(value, path);
  if (!SHA256.test(result)) throw new Error(path + ": expected lowercase SHA-256");
  return result;
}

function count(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(path + ": expected nonnegative integer");
  return value as number;
}

function artifact(value: unknown, path: string): AcceptedArtifactMetadata {
  const row = object(value, path);
  exactKeys(row, ["path", "sha256", "bytes", "rows"], path);
  return {
    path: nonempty(row.path, path + ".path"),
    sha256: digest(row.sha256, path + ".sha256"),
    bytes: count(row.bytes, path + ".bytes"),
    rows: count(row.rows, path + ".rows"),
  };
}

function parseAcceptance(bytes: string): RouteBindingAcceptanceV1 {
  const row = object(JSON.parse(bytes), "route binding acceptance");
  exactKeys(row, [
    "schema_version", "contract_id", "snapshot_id", "snapshot_manifest_sha256", "proposal",
    "legacy_route_completeness", "legacy_route_review", "decisions", "projection_input",
    "decision_set_sha256", "accepted_by", "accepted_at", "rationale", "acceptance_scope",
    "route_record_count", "exact_binding_count", "projectable_count", "historical_description_count",
    "family_or_aggregate_count", "current_ineligible_count", "status",
  ], "route binding acceptance");
  if (row.schema_version !== 1 || row.contract_id !== "route-binding-acceptance-v1") throw new Error("route binding acceptance: unsupported contract");
  if (row.acceptance_scope !== "owner_approved_complete_route_adjudication_v1" || row.status !== "accepted") throw new Error("route binding acceptance: not accepted for the complete route denominator");
  const acceptedAt = nonempty(row.accepted_at, "route binding acceptance.accepted_at");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(acceptedAt) || Number.isNaN(Date.parse(acceptedAt))) throw new Error("route binding acceptance.accepted_at: expected UTC ISO-8601 instant");
  const result: RouteBindingAcceptanceV1 = {
    schema_version: 1,
    contract_id: "route-binding-acceptance-v1",
    snapshot_id: nonempty(row.snapshot_id, "route binding acceptance.snapshot_id"),
    snapshot_manifest_sha256: digest(row.snapshot_manifest_sha256, "route binding acceptance.snapshot_manifest_sha256"),
    proposal: artifact(row.proposal, "route binding acceptance.proposal"),
    legacy_route_completeness: artifact(row.legacy_route_completeness, "route binding acceptance.legacy_route_completeness"),
    legacy_route_review: artifact(row.legacy_route_review, "route binding acceptance.legacy_route_review"),
    decisions: artifact(row.decisions, "route binding acceptance.decisions"),
    projection_input: artifact(row.projection_input, "route binding acceptance.projection_input"),
    decision_set_sha256: digest(row.decision_set_sha256, "route binding acceptance.decision_set_sha256"),
    accepted_by: nonempty(row.accepted_by, "route binding acceptance.accepted_by"),
    accepted_at: acceptedAt,
    rationale: nonempty(row.rationale, "route binding acceptance.rationale"),
    acceptance_scope: "owner_approved_complete_route_adjudication_v1",
    route_record_count: count(row.route_record_count, "route binding acceptance.route_record_count"),
    exact_binding_count: count(row.exact_binding_count, "route binding acceptance.exact_binding_count"),
    projectable_count: count(row.projectable_count, "route binding acceptance.projectable_count"),
    historical_description_count: count(row.historical_description_count, "route binding acceptance.historical_description_count"),
    family_or_aggregate_count: count(row.family_or_aggregate_count, "route binding acceptance.family_or_aggregate_count"),
    current_ineligible_count: count(row.current_ineligible_count, "route binding acceptance.current_ineligible_count"),
    status: "accepted",
  };
  if (
    result.legacy_route_completeness.path !==
      "data/route-identity/accepted/v1/legacy-route-identity-completeness.jsonl"
  ) {
    throw new Error(
      "route binding acceptance: legacy completeness input must use the immutable accepted archive",
    );
  }
  if (result.decision_set_sha256 !== result.decisions.sha256) throw new Error("route binding acceptance: decision-set digest differs from decisions artifact");
  if (stableJson(result as unknown as JsonValue) + "\n" !== bytes) throw new Error("route binding acceptance: expected canonical serialized bytes");
  return result;
}

function safeRepoPath(rootDir: string, relativePath: string, expected: "file" | "directory"): string {
  if (relativePath.startsWith("/") || relativePath.includes("\\") || relativePath.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("unsafe repository-relative path: " + relativePath);
  const root = realpathSync(resolve(rootDir));
  const candidate = resolve(root, ...relativePath.split("/"));
  if (relative(root, candidate).split(sep).join("/") !== relativePath) throw new Error("repository path escapes root: " + relativePath);
  let cursor = root;
  for (const part of relativePath.split("/")) {
    cursor = join(cursor, part);
    if (!existsSync(cursor)) throw new Error("required repository path is missing: " + relativePath);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error("repository path traverses symbolic link: " + relativePath);
  }
  const metadata = statSync(candidate);
  if (expected === "file" ? !metadata.isFile() : !metadata.isDirectory()) throw new Error("repository path has wrong type: " + relativePath);
  const actual = realpathSync(candidate);
  if (actual !== root && !actual.startsWith(root + sep)) throw new Error("repository path resolves outside root: " + relativePath);
  return candidate;
}

function readAcceptedArtifact(rootDir: string, metadata: AcceptedArtifactMetadata): string {
  const path = safeRepoPath(rootDir, metadata.path, "file");
  const bytes = readFileSync(path);
  const rowCount = metadata.path.endsWith(".jsonl") ? bytes.toString("utf8").split(/\r?\n/u).filter(Boolean).length : 1;
  if (bytes.length !== metadata.bytes || sha256(bytes) !== metadata.sha256 || rowCount !== metadata.rows) throw new Error(metadata.path + ": accepted artifact bytes/hash/count mismatch");
  return bytes.toString("utf8");
}

function selectedSnapshotId(rootDir: string, explicitSnapshotId?: string): string | null {
  if (explicitSnapshotId !== undefined) {
    if (!SAFE_ID.test(explicitSnapshotId)) throw new Error("GTFS snapshot id must be a safe single path segment");
    return explicitSnapshotId;
  }
  const pointer = join(rootDir, "data", "reference", "gtfs", "SELECTED");
  if (!existsSync(pointer)) return null;
  const safePointer = safeRepoPath(rootDir, "data/reference/gtfs/SELECTED", "file");
  const bytes = readFileSync(safePointer, "utf8");
  const snapshotId = bytes.endsWith("\n") ? bytes.slice(0, -1) : "";
  if (!SAFE_ID.test(snapshotId) || bytes !== snapshotId + "\n") throw new Error("data/reference/gtfs/SELECTED: expected exact safe snapshot id followed by newline");
  return snapshotId;
}

function projectionBinding(row: AcceptedRouteBindingProjectionRowV1 | AcceptedRouteBindingDecisionV1): RouteIdentityRecordBindingCommonV1 {
  return {
    route_record_id: row.route_record_id,
    route_family_id: row.route_family_id,
    dataset_id: row.dataset_id,
    component_feed_ids: [...row.component_feed_ids],
    source_route_id: row.source_route_id,
    gtfs_route_id: row.gtfs_route_id,
    service_variant: row.service_variant,
    identity_scope: row.identity_scope,
    service_class: row.service_class,
    record_temporal_scope: row.record_temporal_scope,
    projectable: row.projectable,
    presentation_primary: row.presentation_primary,
    derivation: row.derivation,
    evidence_ids: [...row.evidence_ids],
    canonical_record_fingerprint: row.canonical_record_fingerprint,
    identity_basis: row.identity_basis,
    expected_gtfs_identity_fingerprint: row.expected_gtfs_identity_fingerprint,
    decision_kind: row.decision_kind,
    ineligibility_reasons: [...row.ineligibility_reasons],
  };
}

function mergeReviewedAttribution(
  projection: AcceptedRouteBindingProjectionRowV1[],
  decisions: AcceptedRouteBindingDecisionV1[],
): RouteIdentityRecordBindingV1[] {
  const byDecisionId = new Map(decisions.map((decision) => [decision.decision_id, decision]));
  if (byDecisionId.size !== decisions.length) throw new Error("accepted route-binding decision ids are not unique");
  const used = new Set<string>();
  const rows = projection.map((row): RouteIdentityRecordBindingV1 => {
    const common = projectionBinding(row);
    if (row.decision_id === null) {
      if (row.identity_basis !== "deterministic_exact") throw new Error(row.route_record_id + ": deterministic binding has a non-deterministic identity basis");
      return common;
    }
    const decision = byDecisionId.get(row.decision_id);
    if (!decision || decision.route_record_id !== row.route_record_id) throw new Error(row.route_record_id + ": reviewed decision is missing or addresses another record");
    if (stableJson(common as unknown as JsonValue) !== stableJson(projectionBinding(decision) as unknown as JsonValue)) throw new Error(row.route_record_id + ": decision/projection binding fields differ");
    if (decision.reviewed_axes.length === 0) throw new Error(row.route_record_id + ": reviewed decision has no reviewed axes");
    used.add(decision.decision_id);
    return {
      ...common,
      decision_id: decision.decision_id,
      accepted_by: decision.accepted_by,
      accepted_at: decision.accepted_at,
      rationale: decision.rationale,
      reviewed_axes: [...decision.reviewed_axes],
    };
  });
  if (used.size !== decisions.length) throw new Error("accepted decision ledger contains an unreferenced reviewed decision");
  return rows;
}

export function loadRouteIdentityReleaseProjection(input: {
  rootDir: string;
  records: MtaCanonicalRecord[];
  snapshotId?: string | undefined;
}): BuiltRouteIdentityReleaseProjection | null {
  const snapshotId = selectedSnapshotId(input.rootDir, input.snapshotId);
  if (snapshotId === null) return null;
  const snapshotRelative = "data/reference/gtfs/snapshots/" + snapshotId;
  const snapshotDirectory = safeRepoPath(input.rootDir, snapshotRelative, "directory");
  const verified = verifyGtfsSnapshotDirectory(snapshotDirectory);
  if (verified.snapshot_id !== snapshotId) throw new Error(snapshotId + ": verified GTFS snapshot id mismatch");
  const manifestBytes = readFileSync(join(snapshotDirectory, "manifest.json"), "utf8");
  const manifest = parseGtfsSnapshotManifestV2(JSON.parse(manifestBytes));
  if (manifestBytes !== serializeGtfsSnapshotManifestV2(manifest) || sha256(manifestBytes) !== verified.manifest_sha256) throw new Error(snapshotId + ": verified GTFS manifest canonical bytes changed during load");
  const inventoryBytes = readFileSync(join(snapshotDirectory, "route_inventory.jsonl"), "utf8");
  const inventory = parseRouteInventoryJsonl(inventoryBytes);

  const acceptancePath = safeRepoPath(input.rootDir, ACCEPTANCE_PATH, "file");
  const acceptanceBytes = readFileSync(acceptancePath, "utf8");
  const acceptance = parseAcceptance(acceptanceBytes);
  if (acceptance.snapshot_id !== snapshotId || acceptance.snapshot_manifest_sha256 !== verified.manifest_sha256) throw new Error(snapshotId + ": accepted route bindings address another GTFS snapshot or manifest");
  const proposalBytes = readAcceptedArtifact(input.rootDir, acceptance.proposal);
  const legacyCompletenessBytes = readAcceptedArtifact(input.rootDir, acceptance.legacy_route_completeness);
  const legacyReviewBytes = readAcceptedArtifact(input.rootDir, acceptance.legacy_route_review);
  const decisionsBytes = readAcceptedArtifact(input.rootDir, acceptance.decisions);
  const projectionInputBytes = readAcceptedArtifact(input.rootDir, acceptance.projection_input);
  const rebuilt = buildRouteBindingAcceptance({
    proposalBytes,
    expectedProposalSha256: acceptance.proposal.sha256,
    snapshotManifestBytes: manifestBytes,
    snapshotManifestSha256: verified.manifest_sha256,
    records: input.records,
    inventory,
    legacyCompletenessBytes,
    legacyCompletenessPath: acceptance.legacy_route_completeness.path,
    legacyReviewBytes,
    legacyReviewPath: acceptance.legacy_route_review.path,
    acceptedBy: acceptance.accepted_by,
    acceptedAt: acceptance.accepted_at,
    rationale: acceptance.rationale,
    proposalPath: acceptance.proposal.path,
    decisionsPath: acceptance.decisions.path,
    projectionInputPath: acceptance.projection_input.path,
  });
  if (rebuilt.acceptanceBytes !== acceptanceBytes || rebuilt.decisionsBytes !== decisionsBytes || rebuilt.projectionInputBytes !== projectionInputBytes) throw new Error("accepted route-binding bytes are stale against current records, proposal, legacy review, or verified GTFS inputs");

  const recordBindings = mergeReviewedAttribution(rebuilt.projectionInput, rebuilt.decisions);
  const serviceIdentitiesBytes = serializeRouteInventoryJsonl(inventory);
  const recordBindingsBytes = serializeRouteIdentityRecordBindingsJsonl(recordBindings);
  const provisional: RouteIdentitySnapshotV1 = {
    schema_version: 1,
    contract_id: "route-identity-snapshot-v1",
    gtfs_snapshot_id: snapshotId,
    gtfs_snapshot: manifest,
    gtfs_snapshot_sha256: verified.manifest_sha256,
    reviewed_decision_sha256: acceptance.decision_set_sha256,
    current_catalog: manifest.current_catalog,
    service_identity_count: inventory.length,
    service_identities_sha256: sha256(serviceIdentitiesBytes),
    service_identities: inventory,
    record_binding_count: recordBindings.length,
    record_bindings_sha256: sha256(recordBindingsBytes),
    record_bindings: recordBindings,
    expected_route_anchors_count: 0,
    expected_route_anchors_sha256: "0".repeat(64),
  };
  const routeAnchors = projectRouteAnchorsFromIdentitySnapshot(provisional);
  const routeAnchorsBytes = routeAnchorsJsonl(routeAnchors);
  const snapshot = parseRouteIdentitySnapshotV1({
    ...provisional,
    expected_route_anchors_count: routeAnchors.length,
    expected_route_anchors_sha256: sha256(routeAnchorsBytes),
  });
  const snapshotBytes = serializeRouteIdentitySnapshotV1(snapshot);
  return {
    snapshotId,
    snapshot,
    snapshotBytes,
    snapshotSha256: sha256(snapshotBytes),
    routeAnchors,
    routeAnchorsBytes,
  };
}
