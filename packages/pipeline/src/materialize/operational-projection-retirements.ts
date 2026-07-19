import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  serializeRouteIdentitySnapshotV1,
  type RouteIdentitySnapshotV1,
} from "@mta-wiki/pipeline/materialize/route-identity-contract";

export const OPERATIONAL_PROJECTION_RETIREMENT_SCHEMA_VERSION = 1 as const;
export const OPERATIONAL_PROJECTION_RETIREMENT_CONTRACT_ID =
  "operational-review-projection-retirement-v1" as const;
export const OPERATIONAL_REVIEW_RETIREMENT_PROJECTION_SCHEMA_VERSION = 1 as const;

export type OperationalProjectionRetirementSourceArtifact = {
  artifact_path: string;
  bytes: number;
  sha256: string;
};

export type OperationalProjectionRetirementBinding = {
  route_record_id: string;
  route_binding_decision_id: string;
  route_binding_sha256: string;
  dataset_id: string;
  source_route_id: string;
  gtfs_route_id: string;
  projectable: false;
  ineligibility_reasons: string[];
};

export type OperationalProjectionAnchorRetirementTarget = {
  review_contract: "operational-anchor-review-v1";
  decision_id: string;
  projection_state: "retired";
  reason_code: "route_binding_nonprojectable";
  original_artifact: OperationalProjectionRetirementSourceArtifact;
};

export type OperationalProjectionOccurrenceRetirementTarget = {
  review_contract: "operational-occurrence-review-v1";
  decision_id: string;
  occurrence_id: string;
  founding_key: string;
  pinned_gtfs_route_ids: string[];
  projection_state: "retired";
  reason_code: "route_binding_nonprojectable";
  original_artifact: OperationalProjectionRetirementSourceArtifact;
};

export type OperationalProjectionRetirementV1 = {
  schema_version: typeof OPERATIONAL_PROJECTION_RETIREMENT_SCHEMA_VERSION;
  contract_id: typeof OPERATIONAL_PROJECTION_RETIREMENT_CONTRACT_ID;
  retirement_id: string;
  state: "accepted";
  accepted_by: string;
  accepted_at: string;
  rationale: string;
  route_identity_snapshot_id: string;
  route_identity_snapshot_sha256: string;
  binding: OperationalProjectionRetirementBinding;
  anchor_review_decisions: OperationalProjectionAnchorRetirementTarget[];
  occurrence_review_decisions: OperationalProjectionOccurrenceRetirementTarget[];
};

export type LoadedOperationalProjectionRetirementV1 = OperationalProjectionRetirementV1 & {
  artifact_path: string;
  source_bytes: number;
  source_sha256: string;
};

export type OperationalProjectionReleaseArtifact = {
  release_path: string;
  bytes: number;
  sha256: string;
};

type ReviewRetirementProjectionCommon = {
  retirement_id: string;
  retirement_source: OperationalProjectionReleaseArtifact;
  accepted_by: string;
  accepted_at: string;
  rationale: string;
  route_identity_snapshot_id: string;
  route_identity_snapshot_sha256: string;
  binding: OperationalProjectionRetirementBinding;
};

export type OperationalAnchorReviewRetirementProjectionV1 = ReviewRetirementProjectionCommon & {
  target: Omit<OperationalProjectionAnchorRetirementTarget, "original_artifact"> & {
    original_artifact: OperationalProjectionReleaseArtifact;
  };
};

export type OperationalOccurrenceReviewRetirementProjectionV1 = ReviewRetirementProjectionCommon & {
  target: Omit<OperationalProjectionOccurrenceRetirementTarget, "original_artifact"> & {
    original_artifact: OperationalProjectionReleaseArtifact;
  };
};

type ReviewDecision = {
  decision_id: string;
  artifact_path?: string | undefined;
};
type AnchorReviewDecision = ReviewDecision & { route_record_id: string };
type OccurrenceReviewDecision = ReviewDecision & {
  occurrence_id: string;
  founding_key: string;
  routes: readonly { route_record_id: string; gtfs_route_id: string }[];
};

const SHA256 = /^[0-9a-f]{64}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const SOURCE_FIELDS = [
  "accepted_at", "accepted_by", "anchor_review_decisions", "binding", "contract_id",
  "occurrence_review_decisions", "rationale", "retirement_id", "route_identity_snapshot_id",
  "route_identity_snapshot_sha256", "schema_version", "state",
] as const;
const BINDING_FIELDS = [
  "dataset_id", "gtfs_route_id", "ineligibility_reasons", "projectable",
  "route_binding_decision_id", "route_binding_sha256", "route_record_id", "source_route_id",
] as const;
const SOURCE_ARTIFACT_FIELDS = ["artifact_path", "bytes", "sha256"] as const;
const RELEASE_ARTIFACT_FIELDS = ["bytes", "release_path", "sha256"] as const;
const ANCHOR_TARGET_FIELDS = [
  "decision_id", "original_artifact", "projection_state", "reason_code", "review_contract",
] as const;
const OCCURRENCE_TARGET_FIELDS = [
  "decision_id", "founding_key", "occurrence_id", "original_artifact", "pinned_gtfs_route_ids",
  "projection_state", "reason_code", "review_contract",
] as const;
const PROJECTION_FIELDS = [
  "accepted_at", "accepted_by", "binding", "rationale", "retirement_id", "retirement_source",
  "route_identity_snapshot_id", "route_identity_snapshot_sha256", "target",
] as const;

const sha256 = (bytes: string | Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, fields: readonly string[], path: string): void {
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  const unexpected = Object.keys(value).filter((field) => !fields.includes(field));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${path}: strict keys mismatch; missing=[${missing.sort().join(", ")}] unexpected=[${unexpected.sort().join(", ")}]`,
    );
  }
}

function nonempty(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path}: expected non-empty string`);
  return value;
}

function safeId(value: unknown, path: string): string {
  const result = nonempty(value, path);
  if (!SAFE_ID.test(result)) throw new Error(`${path}: expected safe id`);
  return result;
}

function digest(value: unknown, path: string): string {
  const result = nonempty(value, path);
  if (!SHA256.test(result)) throw new Error(`${path}: expected lowercase SHA-256`);
  return result;
}

function count(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${path}: expected nonnegative integer`);
  return value as number;
}

function sortedUniqueStrings(value: unknown, path: string, allowEmpty = false): string[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  const result = value.map((entry, index) => nonempty(entry, `${path}[${index}]`));
  if (!allowEmpty && result.length === 0) throw new Error(`${path}: expected nonempty array`);
  if (new Set(result).size !== result.length || result.join("\n") !== [...result].sort().join("\n")) {
    throw new Error(`${path}: expected sorted unique strings`);
  }
  return result;
}

function safeRelativePath(value: unknown, path: string): string {
  const result = nonempty(value, path);
  if (
    result.startsWith("/") || result.includes("\\") || result.includes("\0") ||
    result.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`${path}: expected safe relative path`);
  }
  return result;
}

function sourceArtifact(
  value: unknown,
  path: string,
  prefix: string,
  decisionId: string,
): OperationalProjectionRetirementSourceArtifact {
  const row = object(value, path);
  exactKeys(row, SOURCE_ARTIFACT_FIELDS, path);
  const artifactPath = safeRelativePath(row.artifact_path, `${path}.artifact_path`);
  if (artifactPath !== `${prefix}${decisionId}.json`) {
    throw new Error(`${path}.artifact_path: expected exact accepted decision path`);
  }
  return {
    artifact_path: artifactPath,
    bytes: count(row.bytes, `${path}.bytes`),
    sha256: digest(row.sha256, `${path}.sha256`),
  };
}

function releaseArtifact(
  value: unknown,
  path: string,
  expectedPath: string,
): OperationalProjectionReleaseArtifact {
  const row = object(value, path);
  exactKeys(row, RELEASE_ARTIFACT_FIELDS, path);
  const releasePath = safeRelativePath(row.release_path, `${path}.release_path`);
  if (releasePath !== expectedPath) throw new Error(`${path}.release_path: unexpected retirement archive path`);
  return {
    release_path: releasePath,
    bytes: count(row.bytes, `${path}.bytes`),
    sha256: digest(row.sha256, `${path}.sha256`),
  };
}

function parseBinding(value: unknown, path: string): OperationalProjectionRetirementBinding {
  const row = object(value, path);
  exactKeys(row, BINDING_FIELDS, path);
  if (row.projectable !== false) throw new Error(`${path}.projectable: expected false`);
  const reasons = sortedUniqueStrings(row.ineligibility_reasons, `${path}.ineligibility_reasons`);
  if (!reasons.includes("catalog_not_in_effect")) {
    throw new Error(`${path}.ineligibility_reasons: expected catalog_not_in_effect`);
  }
  return {
    route_record_id: safeId(row.route_record_id, `${path}.route_record_id`),
    route_binding_decision_id: safeId(row.route_binding_decision_id, `${path}.route_binding_decision_id`),
    route_binding_sha256: digest(row.route_binding_sha256, `${path}.route_binding_sha256`),
    dataset_id: safeId(row.dataset_id, `${path}.dataset_id`),
    source_route_id: nonempty(row.source_route_id, `${path}.source_route_id`),
    gtfs_route_id: nonempty(row.gtfs_route_id, `${path}.gtfs_route_id`),
    projectable: false,
    ineligibility_reasons: reasons,
  };
}

function parseAnchorTarget(
  value: unknown,
  path: string,
  artifactKind: "source" | "release",
): OperationalProjectionAnchorRetirementTarget | OperationalAnchorReviewRetirementProjectionV1["target"] {
  const row = object(value, path);
  exactKeys(row, ANCHOR_TARGET_FIELDS, path);
  if (
    row.review_contract !== "operational-anchor-review-v1" ||
    row.projection_state !== "retired" ||
    row.reason_code !== "route_binding_nonprojectable"
  ) {
    throw new Error(`${path}: unsupported anchor retirement target`);
  }
  const decisionId = safeId(row.decision_id, `${path}.decision_id`);
  const originalArtifact = artifactKind === "source"
    ? sourceArtifact(
        row.original_artifact,
        `${path}.original_artifact`,
        "data/operational-anchor-review/accepted/decisions/",
        decisionId,
      )
    : releaseArtifact(
        row.original_artifact,
        `${path}.original_artifact`,
        `review-retirements/operational-anchor/${decisionId}.json`,
      );
  return {
    review_contract: "operational-anchor-review-v1",
    decision_id: decisionId,
    projection_state: "retired",
    reason_code: "route_binding_nonprojectable",
    original_artifact: originalArtifact,
  } as OperationalProjectionAnchorRetirementTarget | OperationalAnchorReviewRetirementProjectionV1["target"];
}

function parseOccurrenceTarget(
  value: unknown,
  path: string,
  artifactKind: "source" | "release",
): OperationalProjectionOccurrenceRetirementTarget | OperationalOccurrenceReviewRetirementProjectionV1["target"] {
  const row = object(value, path);
  exactKeys(row, OCCURRENCE_TARGET_FIELDS, path);
  if (
    row.review_contract !== "operational-occurrence-review-v1" ||
    row.projection_state !== "retired" ||
    row.reason_code !== "route_binding_nonprojectable"
  ) {
    throw new Error(`${path}: unsupported occurrence retirement target`);
  }
  const decisionId = safeId(row.decision_id, `${path}.decision_id`);
  const originalArtifact = artifactKind === "source"
    ? sourceArtifact(
        row.original_artifact,
        `${path}.original_artifact`,
        "data/operational-occurrence-review/accepted/decisions/",
        decisionId,
      )
    : releaseArtifact(
        row.original_artifact,
        `${path}.original_artifact`,
        `review-retirements/operational-occurrence/${decisionId}.json`,
      );
  return {
    review_contract: "operational-occurrence-review-v1",
    decision_id: decisionId,
    occurrence_id: safeId(row.occurrence_id, `${path}.occurrence_id`),
    founding_key: nonempty(row.founding_key, `${path}.founding_key`),
    pinned_gtfs_route_ids: sortedUniqueStrings(row.pinned_gtfs_route_ids, `${path}.pinned_gtfs_route_ids`),
    projection_state: "retired",
    reason_code: "route_binding_nonprojectable",
    original_artifact: originalArtifact,
  } as OperationalProjectionOccurrenceRetirementTarget | OperationalOccurrenceReviewRetirementProjectionV1["target"];
}

function sortedUniqueBy<T>(rows: T[], key: (row: T) => string, path: string): T[] {
  const keys = rows.map(key);
  if (new Set(keys).size !== keys.length || keys.join("\n") !== [...keys].sort().join("\n")) {
    throw new Error(`${path}: expected rows sorted uniquely by decision_id`);
  }
  return rows;
}

export function parseOperationalProjectionRetirementV1(
  value: unknown,
  path = "operational projection retirement",
): OperationalProjectionRetirementV1 {
  const row = object(value, path);
  exactKeys(row, SOURCE_FIELDS, path);
  if (
    row.schema_version !== OPERATIONAL_PROJECTION_RETIREMENT_SCHEMA_VERSION ||
    row.contract_id !== OPERATIONAL_PROJECTION_RETIREMENT_CONTRACT_ID ||
    row.state !== "accepted"
  ) {
    throw new Error(`${path}: unsupported or unaccepted contract`);
  }
  const acceptedAt = nonempty(row.accepted_at, `${path}.accepted_at`);
  if (!ISO_INSTANT.test(acceptedAt) || Number.isNaN(Date.parse(acceptedAt))) {
    throw new Error(`${path}.accepted_at: expected UTC ISO-8601 instant`);
  }
  if (!Array.isArray(row.anchor_review_decisions) || !Array.isArray(row.occurrence_review_decisions)) {
    throw new Error(`${path}: review retirement target collections must be arrays`);
  }
  const anchors = sortedUniqueBy(
    row.anchor_review_decisions.map((entry, index) =>
      parseAnchorTarget(entry, `${path}.anchor_review_decisions[${index}]`, "source") as OperationalProjectionAnchorRetirementTarget),
    (entry) => entry.decision_id,
    `${path}.anchor_review_decisions`,
  );
  const occurrences = sortedUniqueBy(
    row.occurrence_review_decisions.map((entry, index) =>
      parseOccurrenceTarget(entry, `${path}.occurrence_review_decisions[${index}]`, "source") as OperationalProjectionOccurrenceRetirementTarget),
    (entry) => entry.decision_id,
    `${path}.occurrence_review_decisions`,
  );
  if (anchors.length + occurrences.length === 0) {
    throw new Error(`${path}: expected at least one retirement target`);
  }
  return {
    schema_version: 1,
    contract_id: OPERATIONAL_PROJECTION_RETIREMENT_CONTRACT_ID,
    retirement_id: safeId(row.retirement_id, `${path}.retirement_id`),
    state: "accepted",
    accepted_by: nonempty(row.accepted_by, `${path}.accepted_by`),
    accepted_at: acceptedAt,
    rationale: nonempty(row.rationale, `${path}.rationale`),
    route_identity_snapshot_id: safeId(row.route_identity_snapshot_id, `${path}.route_identity_snapshot_id`),
    route_identity_snapshot_sha256: digest(
      row.route_identity_snapshot_sha256,
      `${path}.route_identity_snapshot_sha256`,
    ),
    binding: parseBinding(row.binding, `${path}.binding`),
    anchor_review_decisions: anchors,
    occurrence_review_decisions: occurrences,
  };
}

function sourceValue(retirement: OperationalProjectionRetirementV1): OperationalProjectionRetirementV1 {
  return {
    schema_version: retirement.schema_version,
    contract_id: retirement.contract_id,
    retirement_id: retirement.retirement_id,
    state: retirement.state,
    accepted_by: retirement.accepted_by,
    accepted_at: retirement.accepted_at,
    rationale: retirement.rationale,
    route_identity_snapshot_id: retirement.route_identity_snapshot_id,
    route_identity_snapshot_sha256: retirement.route_identity_snapshot_sha256,
    binding: { ...retirement.binding, ineligibility_reasons: [...retirement.binding.ineligibility_reasons] },
    anchor_review_decisions: retirement.anchor_review_decisions.map((entry) => ({
      ...entry,
      original_artifact: { ...entry.original_artifact },
    })),
    occurrence_review_decisions: retirement.occurrence_review_decisions.map((entry) => ({
      ...entry,
      pinned_gtfs_route_ids: [...entry.pinned_gtfs_route_ids],
      original_artifact: { ...entry.original_artifact },
    })),
  };
}

export function serializeOperationalProjectionRetirementV1(
  retirement: OperationalProjectionRetirementV1,
): string {
  const parsed = parseOperationalProjectionRetirementV1(sourceValue(retirement));
  return `${stableJson(parsed as unknown as JsonValue)}\n`;
}

function safeRepoFile(rootDir: string, artifactPath: string): string {
  const root = realpathSync(resolve(rootDir));
  const candidate = resolve(root, ...artifactPath.split("/"));
  if (relative(root, candidate).split(sep).join("/") !== artifactPath) {
    throw new Error(`operational projection retirement path escapes repository: ${artifactPath}`);
  }
  let cursor = root;
  for (const segment of artifactPath.split("/")) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) throw new Error(`retirement artifact is missing: ${artifactPath}`);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`retirement artifact traverses symlink: ${artifactPath}`);
  }
  if (!statSync(candidate).isFile()) throw new Error(`retirement artifact is not a file: ${artifactPath}`);
  return candidate;
}

function verifySourceArtifact(rootDir: string, artifact: OperationalProjectionRetirementSourceArtifact): void {
  const bytes = readFileSync(safeRepoFile(rootDir, artifact.artifact_path));
  if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) {
    throw new Error(`${artifact.artifact_path}: retirement source bytes/hash changed`);
  }
}

function verifyRouteBindingDecision(rootDir: string, binding: OperationalProjectionRetirementBinding): void {
  const path = safeRepoFile(rootDir, "data/route-identity/accepted/v1/decisions.jsonl");
  const rows = readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean);
  const matches = rows.filter((line) => {
    const value = JSON.parse(line) as { decision_id?: unknown };
    return value.decision_id === binding.route_binding_decision_id;
  });
  if (matches.length !== 1 || sha256(`${matches[0]}\n`) !== binding.route_binding_sha256) {
    throw new Error(`${binding.route_binding_decision_id}: route-binding decision receipt is missing or stale`);
  }
}

export function operationalProjectionRetirementDir(rootDir = repoRoot): string {
  return join(rootDir, "data", "route-identity", "operational-projection-retirements", "v1");
}

export function loadOperationalProjectionRetirements(
  rootDir = repoRoot,
): LoadedOperationalProjectionRetirementV1[] {
  const dir = operationalProjectionRetirementDir(rootDir);
  if (!existsSync(dir)) return [];
  if (lstatSync(dir).isSymbolicLink() || !statSync(dir).isDirectory()) {
    throw new Error("operational projection retirement directory must be a real directory");
  }
  const names = readdirSync(dir).sort((left, right) => left.localeCompare(right));
  const unsupported = names.filter((name) => !name.endsWith(".json"));
  if (unsupported.length > 0) {
    throw new Error(`operational projection retirement directory contains unsupported entries: ${unsupported.join(", ")}`);
  }
  const retirements = names.map((name): LoadedOperationalProjectionRetirementV1 => {
    const artifactPath = `data/route-identity/operational-projection-retirements/v1/${name}`;
    const path = safeRepoFile(rootDir, artifactPath);
    const bytes = readFileSync(path, "utf8");
    const parsed = parseOperationalProjectionRetirementV1(JSON.parse(bytes) as unknown, name);
    if (`${parsed.retirement_id}.json` !== basename(path)) throw new Error(`${name}: retirement_id must match file name`);
    if (serializeOperationalProjectionRetirementV1(parsed) !== bytes) {
      throw new Error(`${name}: expected canonical stable JSON bytes followed by LF`);
    }
    for (const target of [...parsed.anchor_review_decisions, ...parsed.occurrence_review_decisions]) {
      verifySourceArtifact(rootDir, target.original_artifact);
    }
    verifyRouteBindingDecision(rootDir, parsed.binding);
    return {
      ...parsed,
      artifact_path: artifactPath,
      source_bytes: Buffer.byteLength(bytes),
      source_sha256: sha256(bytes),
    };
  });
  const ids = retirements.map((entry) => entry.retirement_id);
  if (new Set(ids).size !== ids.length) throw new Error("operational projection retirement ids must be unique");
  const targets = retirements.flatMap((entry) => [
    ...entry.anchor_review_decisions.map((target) => `anchor:${target.decision_id}`),
    ...entry.occurrence_review_decisions.map((target) => `occurrence:${target.decision_id}`),
  ]);
  if (new Set(targets).size !== targets.length) throw new Error("accepted review decisions cannot be retired twice");
  return retirements;
}

function projectionCommon(
  retirement: LoadedOperationalProjectionRetirementV1,
): ReviewRetirementProjectionCommon {
  return {
    retirement_id: retirement.retirement_id,
    retirement_source: {
      release_path: `review-retirements/source/${retirement.retirement_id}.json`,
      bytes: retirement.source_bytes,
      sha256: retirement.source_sha256,
    },
    accepted_by: retirement.accepted_by,
    accepted_at: retirement.accepted_at,
    rationale: retirement.rationale,
    route_identity_snapshot_id: retirement.route_identity_snapshot_id,
    route_identity_snapshot_sha256: retirement.route_identity_snapshot_sha256,
    binding: { ...retirement.binding, ineligibility_reasons: [...retirement.binding.ineligibility_reasons] },
  };
}

export function projectOperationalAnchorReviewRetirements(
  retirements: readonly LoadedOperationalProjectionRetirementV1[],
): OperationalAnchorReviewRetirementProjectionV1[] {
  return retirements.flatMap((retirement) => retirement.anchor_review_decisions.map((target) => ({
    ...projectionCommon(retirement),
    target: {
      ...target,
      original_artifact: {
        release_path: `review-retirements/operational-anchor/${target.decision_id}.json`,
        bytes: target.original_artifact.bytes,
        sha256: target.original_artifact.sha256,
      },
    },
  }))).sort((left, right) => left.target.decision_id.localeCompare(right.target.decision_id));
}

export function projectOperationalOccurrenceReviewRetirements(
  retirements: readonly LoadedOperationalProjectionRetirementV1[],
): OperationalOccurrenceReviewRetirementProjectionV1[] {
  return retirements.flatMap((retirement) => retirement.occurrence_review_decisions.map((target) => ({
    ...projectionCommon(retirement),
    target: {
      ...target,
      pinned_gtfs_route_ids: [...target.pinned_gtfs_route_ids],
      original_artifact: {
        release_path: `review-retirements/operational-occurrence/${target.decision_id}.json`,
        bytes: target.original_artifact.bytes,
        sha256: target.original_artifact.sha256,
      },
    },
  }))).sort((left, right) => left.target.decision_id.localeCompare(right.target.decision_id));
}

function parseProjectionCommon(value: unknown, path: string): {
  row: Record<string, unknown>;
  common: ReviewRetirementProjectionCommon;
} {
  const row = object(value, path);
  exactKeys(row, PROJECTION_FIELDS, path);
  const retirementId = safeId(row.retirement_id, `${path}.retirement_id`);
  const acceptedAt = nonempty(row.accepted_at, `${path}.accepted_at`);
  if (!ISO_INSTANT.test(acceptedAt) || Number.isNaN(Date.parse(acceptedAt))) {
    throw new Error(`${path}.accepted_at: expected UTC ISO-8601 instant`);
  }
  return {
    row,
    common: {
      retirement_id: retirementId,
      retirement_source: releaseArtifact(
        row.retirement_source,
        `${path}.retirement_source`,
        `review-retirements/source/${retirementId}.json`,
      ),
      accepted_by: nonempty(row.accepted_by, `${path}.accepted_by`),
      accepted_at: acceptedAt,
      rationale: nonempty(row.rationale, `${path}.rationale`),
      route_identity_snapshot_id: safeId(row.route_identity_snapshot_id, `${path}.route_identity_snapshot_id`),
      route_identity_snapshot_sha256: digest(
        row.route_identity_snapshot_sha256,
        `${path}.route_identity_snapshot_sha256`,
      ),
      binding: parseBinding(row.binding, `${path}.binding`),
    },
  };
}

export function parseOperationalAnchorReviewRetirementProjectionV1(
  value: unknown,
  path = "operational anchor review retirement",
): OperationalAnchorReviewRetirementProjectionV1 {
  const { row, common } = parseProjectionCommon(value, path);
  return {
    ...common,
    target: parseAnchorTarget(row.target, `${path}.target`, "release") as OperationalAnchorReviewRetirementProjectionV1["target"],
  };
}

export function parseOperationalOccurrenceReviewRetirementProjectionV1(
  value: unknown,
  path = "operational occurrence review retirement",
): OperationalOccurrenceReviewRetirementProjectionV1 {
  const { row, common } = parseProjectionCommon(value, path);
  return {
    ...common,
    target: parseOccurrenceTarget(row.target, `${path}.target`, "release") as OperationalOccurrenceReviewRetirementProjectionV1["target"],
  };
}

function applyTargets<T extends ReviewDecision>(
  decisions: readonly T[],
  targets: readonly { decision_id: string; original_artifact: OperationalProjectionRetirementSourceArtifact }[],
  label: string,
): T[] {
  const byId = new Map(decisions.map((decision) => [decision.decision_id, decision]));
  if (byId.size !== decisions.length) throw new Error(`${label} accepted decisions contain duplicate decision_id`);
  const retired = new Set<string>();
  for (const target of targets) {
    const decision = byId.get(target.decision_id);
    if (!decision) throw new Error(`${label} retirement references missing accepted decision ${target.decision_id}`);
    if (decision.artifact_path !== target.original_artifact.artifact_path) {
      throw new Error(`${label} retirement artifact path differs for ${target.decision_id}`);
    }
    retired.add(target.decision_id);
  }
  return decisions.filter((decision) => !retired.has(decision.decision_id));
}

export function applyOperationalAnchorReviewRetirements<T extends AnchorReviewDecision>(
  decisions: readonly T[],
  retirements: readonly OperationalProjectionRetirementV1[],
): T[] {
  const byId = new Map(decisions.map((decision) => [decision.decision_id, decision]));
  for (const retirement of retirements) {
    for (const target of retirement.anchor_review_decisions) {
      if (byId.get(target.decision_id)?.route_record_id !== retirement.binding.route_record_id) {
        throw new Error(`operational-anchor retirement ${target.decision_id} does not bind ${retirement.binding.route_record_id}`);
      }
    }
  }
  return applyTargets(
    decisions,
    retirements.flatMap((entry) => entry.anchor_review_decisions),
    "operational-anchor review",
  );
}

export function applyOperationalOccurrenceReviewRetirements<T extends OccurrenceReviewDecision>(
  decisions: readonly T[],
  retirements: readonly OperationalProjectionRetirementV1[],
): T[] {
  const byId = new Map(decisions.map((decision) => [decision.decision_id, decision]));
  for (const retirement of retirements) {
    for (const target of retirement.occurrence_review_decisions) {
      const decision = byId.get(target.decision_id);
      const gtfsIds = decision?.routes
        .filter((route) => route.route_record_id === retirement.binding.route_record_id)
        .map((route) => route.gtfs_route_id)
        .sort();
      if (
        decision?.occurrence_id !== target.occurrence_id ||
        decision?.founding_key !== target.founding_key ||
        stableJson((gtfsIds ?? []) as unknown as JsonValue) !== stableJson(target.pinned_gtfs_route_ids as unknown as JsonValue)
      ) {
        throw new Error(`operational-occurrence retirement ${target.decision_id} does not bind the declared occurrence and route`);
      }
    }
  }
  return applyTargets(
    decisions,
    retirements.flatMap((entry) => entry.occurrence_review_decisions),
    "operational-occurrence review",
  );
}

export function assertOperationalProjectionRetirementsAgainstRouteIdentity(
  retirements: readonly OperationalProjectionRetirementV1[],
  snapshot: RouteIdentitySnapshotV1,
): void {
  const snapshotSha256 = sha256(serializeRouteIdentitySnapshotV1(snapshot));
  const bindings = new Map(snapshot.record_bindings.map((binding) => [binding.route_record_id, binding]));
  for (const retirement of retirements) {
    if (
      retirement.route_identity_snapshot_id !== snapshot.gtfs_snapshot_id ||
      retirement.route_identity_snapshot_sha256 !== snapshotSha256
    ) {
      throw new Error(`${retirement.retirement_id}: retirement addresses another route-identity snapshot`);
    }
    const actual = bindings.get(retirement.binding.route_record_id);
    const expected = retirement.binding;
    if (
      !actual || actual.decision_id !== expected.route_binding_decision_id ||
      actual.dataset_id !== expected.dataset_id || actual.source_route_id !== expected.source_route_id ||
      actual.gtfs_route_id !== expected.gtfs_route_id || actual.projectable !== false ||
      actual.decision_kind !== "current_ineligible" ||
      stableJson(actual.ineligibility_reasons as unknown as JsonValue) !==
        stableJson(expected.ineligibility_reasons as unknown as JsonValue)
    ) {
      throw new Error(`${retirement.retirement_id}: retirement binding differs from accepted nonprojectable route`);
    }
  }
}

export function stageOperationalReviewRetirementArtifacts(
  rootDir: string,
  releaseDir: string,
  retirements: readonly LoadedOperationalProjectionRetirementV1[],
): OperationalProjectionReleaseArtifact[] {
  const staged = new Map<string, OperationalProjectionReleaseArtifact>();
  const copy = (sourcePath: string, releasePath: string, expected: { bytes: number; sha256: string }): void => {
    const source = safeRepoFile(rootDir, sourcePath);
    const target = join(releaseDir, ...releasePath.split("/"));
    const prior = staged.get(releasePath);
    if (prior) {
      if (prior.bytes !== expected.bytes || prior.sha256 !== expected.sha256) {
        throw new Error(`retirement release path has conflicting bytes: ${releasePath}`);
      }
      return;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    const bytes = readFileSync(target);
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`staged retirement artifact bytes/hash mismatch: ${releasePath}`);
    }
    staged.set(releasePath, { release_path: releasePath, bytes: bytes.length, sha256: sha256(bytes) });
  };
  for (const retirement of retirements) {
    copy(
      retirement.artifact_path,
      `review-retirements/source/${retirement.retirement_id}.json`,
      { bytes: retirement.source_bytes, sha256: retirement.source_sha256 },
    );
    for (const target of retirement.anchor_review_decisions) {
      copy(
        target.original_artifact.artifact_path,
        `review-retirements/operational-anchor/${target.decision_id}.json`,
        target.original_artifact,
      );
    }
    for (const target of retirement.occurrence_review_decisions) {
      copy(
        target.original_artifact.artifact_path,
        `review-retirements/operational-occurrence/${target.decision_id}.json`,
        target.original_artifact,
      );
    }
  }
  return [...staged.values()].sort((left, right) => left.release_path.localeCompare(right.release_path));
}
