import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import {
  memberGrainDecisionKey,
  parseMemberGrainDecision,
} from "./member-grain-decisions.js";

export const MEMBER_GRAIN_BLOCK_RECEIPT_CONTRACT_ID =
  "member-grain-block-receipt-v1" as const;
export const DEFAULT_MEMBER_GRAIN_BLOCK_RECEIPT =
  "data/quality/acquisition/receipts/member-grain/plan-040-package-11-reviewed-blocks-v1.json";

export type MemberGrainBlockBinding = {
  occurrence_id: string;
  route_record_id: string;
  gtfs_route_id: string;
  treatment_record_id: string;
  member_extent_decision_id: string;
  member_grain_decision_id: string;
  missing_roles: string[];
};

export type MemberGrainBlockReceipt = {
  schema_version: 1;
  contract_id: typeof MEMBER_GRAIN_BLOCK_RECEIPT_CONTRACT_ID;
  receipt_id: string;
  bindings: MemberGrainBlockBinding[];
  artifacts: {
    role: "dual_review_gate" | "grain_decisions" | "owner_acceptance";
    path: string;
    bytes: number;
    sha256: string;
  }[];
  rationale: string;
  reviewed_at: string;
  reviewed_by: string;
  authorizes_study: false;
  authorizes_cross_product: false;
  authorizes_occurrence: false;
  authorizes_decision_persistence: false;
};

const rootFields = new Set([
  "artifacts", "authorizes_cross_product", "authorizes_decision_persistence",
  "authorizes_occurrence", "authorizes_study", "bindings", "contract_id",
  "rationale", "receipt_id", "reviewed_at", "reviewed_by", "schema_version",
]);
const bindingFields = new Set([
  "gtfs_route_id", "member_extent_decision_id", "member_grain_decision_id",
  "missing_roles", "occurrence_id", "route_record_id", "treatment_record_id",
]);
const artifactFields = new Set(["bytes", "path", "role", "sha256"]);

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
  path: string,
): void {
  const extras = Object.keys(value).filter((field) => !fields.has(field)).sort();
  const missing = [...fields].filter((field) => !(field in value)).sort();
  if (extras.length > 0) throw new Error(`${path}: unknown field(s): ${extras.join(", ")}`);
  if (missing.length > 0) throw new Error(`${path}: missing field(s): ${missing.join(", ")}`);
}

function nonempty(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path}: expected non-empty string`);
  }
  return value;
}

function sortedStrings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path}: expected non-empty array`);
  }
  const values = value.map((entry, index) => nonempty(entry, `${path}[${index}]`));
  if (
    new Set(values).size !== values.length ||
    stableJson(values as JsonValue) !== stableJson([...values].sort() as JsonValue)
  ) {
    throw new Error(`${path}: values must be sorted and unique`);
  }
  return values;
}

export function memberGrainBlockKey(value: {
  occurrence_id: string;
  route_record_id: string;
  treatment_record_id: string;
}): string {
  return `${value.occurrence_id}\0${value.route_record_id}\0${value.treatment_record_id}`;
}

function safePinnedPath(root: string, path: string): string {
  if (
    isAbsolute(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`${path}: expected canonical repository-relative path`);
  }
  const rootReal = realpathSync(root);
  const target = resolve(root, path);
  if (!target.startsWith(`${resolve(root)}${sep}`)) {
    throw new Error(`${path}: escapes repository root`);
  }
  if (!existsSync(target)) throw new Error(`${path}: pinned artifact is missing`);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${path}: pinned artifact must be a normal file`);
  }
  const targetReal = realpathSync(target);
  if (!targetReal.startsWith(`${rootReal}${sep}`)) {
    throw new Error(`${path}: pinned artifact resolves outside repository root`);
  }
  return target;
}

export function parseMemberGrainBlockReceipt(
  value: unknown,
  path = "member-grain-block-receipt",
): MemberGrainBlockReceipt {
  const parsed = object(value, path);
  exactKeys(parsed, rootFields, path);
  if (
    parsed.schema_version !== 1 ||
    parsed.contract_id !== MEMBER_GRAIN_BLOCK_RECEIPT_CONTRACT_ID ||
    parsed.authorizes_study !== false ||
    parsed.authorizes_cross_product !== false ||
    parsed.authorizes_occurrence !== false ||
    parsed.authorizes_decision_persistence !== false
  ) {
    throw new Error(`${path}: invalid non-authorizing contract header`);
  }
  if (!Array.isArray(parsed.bindings) || parsed.bindings.length !== 7) {
    throw new Error(`${path}.bindings: expected exactly seven Package-11 rows`);
  }
  const bindings = parsed.bindings.map((entry, index) => {
    const itemPath = `${path}.bindings[${index}]`;
    const item = object(entry, itemPath);
    exactKeys(item, bindingFields, itemPath);
    return {
      occurrence_id: nonempty(item.occurrence_id, `${itemPath}.occurrence_id`),
      route_record_id: nonempty(item.route_record_id, `${itemPath}.route_record_id`),
      gtfs_route_id: nonempty(item.gtfs_route_id, `${itemPath}.gtfs_route_id`),
      treatment_record_id: nonempty(item.treatment_record_id, `${itemPath}.treatment_record_id`),
      member_extent_decision_id: nonempty(
        item.member_extent_decision_id,
        `${itemPath}.member_extent_decision_id`,
      ),
      member_grain_decision_id: nonempty(
        item.member_grain_decision_id,
        `${itemPath}.member_grain_decision_id`,
      ),
      missing_roles: sortedStrings(item.missing_roles, `${itemPath}.missing_roles`),
    };
  });
  const keys = bindings.map(memberGrainBlockKey);
  if (
    new Set(keys).size !== keys.length ||
    stableJson(keys as JsonValue) !== stableJson([...keys].sort() as JsonValue)
  ) {
    throw new Error(`${path}.bindings: keys must be sorted and unique`);
  }
  if (!Array.isArray(parsed.artifacts) || parsed.artifacts.length !== 3) {
    throw new Error(`${path}.artifacts: expected exactly three pins`);
  }
  const roles = ["dual_review_gate", "grain_decisions", "owner_acceptance"] as const;
  const artifacts = parsed.artifacts.map((entry, index) => {
    const itemPath = `${path}.artifacts[${index}]`;
    const item = object(entry, itemPath);
    exactKeys(item, artifactFields, itemPath);
    const role = nonempty(item.role, `${itemPath}.role`);
    if (!roles.includes(role as typeof roles[number])) {
      throw new Error(`${itemPath}.role: unsupported role`);
    }
    if (!Number.isInteger(item.bytes) || (item.bytes as number) < 1) {
      throw new Error(`${itemPath}.bytes: expected positive integer`);
    }
    const sha256 = nonempty(item.sha256, `${itemPath}.sha256`);
    if (!/^[0-9a-f]{64}$/u.test(sha256)) {
      throw new Error(`${itemPath}.sha256: expected lowercase SHA-256`);
    }
    return {
      role: role as typeof roles[number],
      path: nonempty(item.path, `${itemPath}.path`),
      bytes: item.bytes as number,
      sha256,
    };
  });
  if (
    stableJson(artifacts.map((artifact) => artifact.role) as JsonValue) !==
      stableJson([...roles] as JsonValue)
  ) {
    throw new Error(`${path}.artifacts: roles must be sorted and unique`);
  }
  return {
    schema_version: 1,
    contract_id: MEMBER_GRAIN_BLOCK_RECEIPT_CONTRACT_ID,
    receipt_id: nonempty(parsed.receipt_id, `${path}.receipt_id`),
    bindings,
    artifacts,
    rationale: nonempty(parsed.rationale, `${path}.rationale`),
    reviewed_at: nonempty(parsed.reviewed_at, `${path}.reviewed_at`),
    reviewed_by: nonempty(parsed.reviewed_by, `${path}.reviewed_by`),
    authorizes_study: false,
    authorizes_cross_product: false,
    authorizes_occurrence: false,
    authorizes_decision_persistence: false,
  };
}

export function loadMemberGrainBlockReceipt(
  receiptPath = DEFAULT_MEMBER_GRAIN_BLOCK_RECEIPT,
  rootDir = repoRoot,
): MemberGrainBlockReceipt {
  const absoluteReceipt = safePinnedPath(rootDir, receiptPath);
  const receipt = parseMemberGrainBlockReceipt(
    JSON.parse(readFileSync(absoluteReceipt, "utf8")) as unknown,
    receiptPath,
  );
  for (const artifact of receipt.artifacts) {
    const target = safePinnedPath(rootDir, artifact.path);
    const bytes = readFileSync(target);
    if (
      bytes.length !== artifact.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== artifact.sha256
    ) {
      throw new Error(`${receiptPath}: ${artifact.role} pin mismatch`);
    }
  }
  const decisionArtifact = receipt.artifacts.find((artifact) =>
    artifact.role === "grain_decisions"
  )!;
  const decisionValue = JSON.parse(
    readFileSync(resolve(rootDir, decisionArtifact.path), "utf8"),
  ) as unknown;
  const decisionEnvelope = object(
    decisionValue,
    `${receiptPath}.artifacts.grain_decisions`,
  );
  exactKeys(
    decisionEnvelope,
    new Set(["decisions"]),
    `${receiptPath}.artifacts.grain_decisions`,
  );
  if (!Array.isArray(decisionEnvelope.decisions)) {
    throw new Error(`${receiptPath}.artifacts.grain_decisions.decisions: expected array`);
  }
  const decisions = decisionEnvelope.decisions.map((decision, index) =>
    parseMemberGrainDecision(
      decision,
      `${receiptPath}.artifacts.grain_decisions.decisions[${index}]`,
    )
  );
  const unresolved = decisions.filter((decision) =>
    decision.service_scope.kind === "unresolved"
  );
  const byKey = new Map(unresolved.map((decision) => [
    memberGrainDecisionKey(decision),
    decision,
  ]));
  if (byKey.size !== receipt.bindings.length) {
    throw new Error(`${receiptPath}: unresolved Package-11 denominator mismatch`);
  }
  for (const binding of receipt.bindings) {
    const decision = byKey.get(memberGrainBlockKey(binding));
    if (
      !decision ||
      decision.decision_id !== binding.member_grain_decision_id ||
      decision.member_extent_decision_id !== binding.member_extent_decision_id ||
      decision.gtfs_route_id !== binding.gtfs_route_id ||
      stableJson(decision.service_scope.kind === "unresolved"
        ? decision.service_scope.missing_roles as JsonValue
        : [] as JsonValue) !== stableJson(binding.missing_roles as JsonValue)
    ) {
      throw new Error(
        `${receiptPath}: binding does not exactly match accepted Package-11 decision ${memberGrainBlockKey(binding)}`,
      );
    }
  }
  return receipt;
}
