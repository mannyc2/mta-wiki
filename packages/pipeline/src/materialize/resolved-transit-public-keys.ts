import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import { assertSlug } from "../consumer/public-contract.js";

export const PUBLIC_KEY_CONTRACT_ID = "resolved-transit-public-key-registry-v1" as const;
export type PublicKeyKind =
  | "route"
  | "treatment_family"
  | "source"
  | "intervention_component"
  | "placement";

export type PublicKeyOperation = {
  schema_version: 1;
  operation: "establish_public_key";
  operation_id: string;
  key_kind: PublicKeyKind;
  subject_id: string;
  owner_intervention_id: string | null;
  public_key: string;
  establishment_method: "lossless_migration" | "accepted_review";
  decision_id: string | null;
  proposal_basis: Record<string, string>;
};

export type PublicKeyProposal = Omit<PublicKeyOperation, "operation_id" | "schema_version" | "operation">;

export type PublicKeyMigration = {
  schema_version: 1;
  contract_id: typeof PUBLIC_KEY_CONTRACT_ID;
  generator_commit: string;
  as_of_date: string;
  registry_head: string;
  input_fingerprint: string;
  eligible_subject_count: number;
  existing_live_key_count: number;
  newly_established_losslessly: number;
  newly_established_from_accepted_review: number;
  requires_review_count: number;
  proposed_operations: PublicKeyOperation[];
  requires_review: Array<{ key_kind: PublicKeyKind; subject_id: string; reason: string }>;
  receipt_id: string;
};

const paths = {
  episodes: "data/resolved-transit/operator/v1/interventions/episodes.jsonl",
  applications: "data/resolved-transit/operator/v1/interventions/applications.jsonl",
  placements: "data/resolved-transit/operator/v1/placements/registry.jsonl",
  families: "data/resolved-transit-public/treatment-family-display-v1.json",
  routes: "data/canonical/routes.jsonl",
  treatments: "data/canonical/treatment_components.jsonl",
  sources: "data/canonical/sources.jsonl",
};

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function jsonl(path: string): Array<Record<string, any>> {
  const text = readFileSync(path, "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as Record<string, any>) : [];
}
function slug(value: string): string {
  const result = value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/\+/gu, "-sbs").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")
    .replace(/-{2,}/gu, "-");
  assertSlug(result, "proposed public key");
  return result;
}
function operationId(row: PublicKeyProposal): string {
  return `public-key-op:${sha(stableJson(row as unknown as JsonValue)).slice(0, 24)}`;
}
function op(row: PublicKeyProposal): PublicKeyOperation {
  return { schema_version: 1, operation: "establish_public_key", operation_id: operationId(row), ...row };
}
function registryDir(root = repoRoot): string {
  return join(root, "data", "resolved-transit-public", "public-key-operations", "v1");
}
export function readPublicKeyOperations(root = repoRoot): PublicKeyOperation[] {
  const path = join(registryDir(root), "operations.jsonl");
  if (!existsSync(path)) return [];
  return jsonl(path) as PublicKeyOperation[];
}
function registryHead(operations: readonly PublicKeyOperation[]): string {
  return sha(operations.map((row) => stableJson(row as unknown as JsonValue)).join("\n"));
}
function gitCommit(root: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}
export function assertCleanGenerator(root = repoRoot): string {
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
  if (dirty) throw new Error("public-key prepare requires a clean generator worktree");
  return gitCommit(root);
}

function proposals(root: string): { proposals: PublicKeyProposal[]; fingerprint: string } {
  const full = Object.fromEntries(Object.entries(paths).map(([key, path]) => {
    const absolute = join(root, path);
    if (!existsSync(absolute)) throw new Error(`missing addressed public-key input: ${path}`);
    return [key, { path, bytes: readFileSync(absolute, "utf8") }];
  }));
  const episodes = jsonl(join(root, paths.episodes));
  const applications = jsonl(join(root, paths.applications));
  const placements = jsonl(join(root, paths.placements));
  const routes = jsonl(join(root, paths.routes));
  const treatments = jsonl(join(root, paths.treatments));
  const sources = jsonl(join(root, paths.sources));
  const familyContract = JSON.parse(full.families!.bytes) as {
    families: Array<{ family: string; key: string; label: string }>;
  };
  const routeById = new Map(routes.map((row) => [row.record_id, row]));
  const treatmentById = new Map(treatments.map((row) => [row.record_id, row]));
  const sourceById = new Map(sources.map((row) => [row.source_id, row]));
  const familyByName = new Map(familyContract.families.map((row) => [row.family, row]));
  const result: PublicKeyProposal[] = [];
  const routePairs = new Map<string, { record: string; gtfs: string }>();
  for (const application of applications) {
    const key = `${application.route_record_id}|${application.gtfs_route_id}`;
    routePairs.set(key, { record: application.route_record_id, gtfs: application.gtfs_route_id });
  }
  for (const route of [...routePairs.values()].sort((a, b) => a.gtfs.localeCompare(b.gtfs))) {
    const canonical = routeById.get(route.record);
    if (!canonical) throw new Error(`missing addressed route display row: ${route.record}`);
    result.push({
      key_kind: "route", subject_id: route.record, owner_intervention_id: null,
      public_key: slug(route.gtfs), establishment_method: "lossless_migration",
      decision_id: null,
      proposal_basis: {
        gtfs_route_id: route.gtfs,
        route_display_name: String(canonical.display_name),
      },
    });
  }
  for (const family of [...new Set(applications.map((row) => String(row.treatment_family)))].sort()) {
    const display = familyByName.get(family);
    if (!display) throw new Error(`missing treatment family display: ${family}`);
    result.push({
      key_kind: "treatment_family", subject_id: family, owner_intervention_id: null,
      public_key: display.key, establishment_method: "lossless_migration",
      decision_id: null, proposal_basis: { family, label: display.label },
    });
  }
  const sourceIds = [...new Set(episodes.flatMap((row) => row.source_ids as string[]))].sort();
  for (const sourceId of sourceIds) {
    const source = sourceById.get(sourceId);
    if (!source) throw new Error(`missing addressed source display row: ${sourceId}`);
    result.push({
      key_kind: "source", subject_id: sourceId, owner_intervention_id: null,
      public_key: slug(sourceId), establishment_method: "lossless_migration",
      decision_id: null, proposal_basis: { source_id: sourceId, title: String(source.display_name) },
    });
  }
  const routeKey = new Map(result.filter((row) => row.key_kind === "route").map((row) => [row.subject_id, row.public_key]));
  const familyKey = new Map(result.filter((row) => row.key_kind === "treatment_family").map((row) => [row.subject_id, row.public_key]));
  for (const application of applications.sort((a, b) => String(a.application_id).localeCompare(String(b.application_id)))) {
    const treatment = treatmentById.get(application.treatment_record_id);
    if (!treatment) throw new Error(`missing addressed treatment display row: ${application.treatment_record_id}`);
    const scope = application.extent as { kind: string; record_ids: string[] };
    const component = [
      routeKey.get(application.route_record_id),
      familyKey.get(application.treatment_family),
      application.action,
      slug(String(treatment.display_name)),
      scope.kind,
      ...(scope.record_ids ?? []).map(String).map(slug),
    ].filter(Boolean).join("-");
    result.push({
      key_kind: "intervention_component", subject_id: application.application_id,
      owner_intervention_id: application.occurrence_id, public_key: slug(component),
      establishment_method: "lossless_migration", decision_id: null,
      proposal_basis: {
        route_key: routeKey.get(application.route_record_id)!,
        treatment_family_key: familyKey.get(application.treatment_family)!,
        action: application.action,
        treatment_display_name: String(treatment.display_name),
        scope_kind: scope.kind,
        scope_record_ids: (scope.record_ids ?? []).join(","),
      },
    });
  }
  for (const placement of placements.sort((a, b) => String(a.placement_id).localeCompare(String(b.placement_id)))) {
    const claim = placement.current_claim;
    result.push({
      key_kind: "placement", subject_id: placement.placement_id, owner_intervention_id: null,
      public_key: slug([
        routeKey.get(claim.route_record_id), familyKey.get(claim.treatment_family),
        claim.scope.kind, ...(claim.scope.record_ids ?? []).map(String).map(slug),
      ].filter(Boolean).join("-")),
      establishment_method: "lossless_migration", decision_id: null,
      proposal_basis: {
        route_key: routeKey.get(claim.route_record_id)!,
        treatment_family_key: familyKey.get(claim.treatment_family)!,
        scope_kind: claim.scope.kind,
      },
    });
  }
  return {
    proposals: result,
    fingerprint: sha(Object.values(full).map((row) => `${row.path}\0${sha(row.bytes)}`).sort().join("\n")),
  };
}

export function preparePublicKeyMigration(input: {
  rootDir?: string;
  asOfDate: string;
  generatorCommit: string;
}): PublicKeyMigration {
  const root = input.rootDir ?? repoRoot;
  const existing = readPublicKeyOperations(root);
  const existingBySubject = new Map(existing.map((row) => [`${row.key_kind}|${row.subject_id}`, row]));
  const proposed = proposals(root);
  for (const proposal of proposed.proposals) {
    const prior = existingBySubject.get(`${proposal.key_kind}|${proposal.subject_id}`);
    if (!prior) continue;
    if (prior.public_key !== proposal.public_key ||
        prior.owner_intervention_id !== proposal.owner_intervention_id ||
        stableJson(prior.proposal_basis as unknown as JsonValue) !==
          stableJson(proposal.proposal_basis as unknown as JsonValue) ||
        prior.establishment_method !== proposal.establishment_method) {
      throw new Error(`public-key operation no longer reproduces losslessly: ${prior.operation_id}`);
    }
  }
  const pending = proposed.proposals.filter((row) => !existingBySubject.has(`${row.key_kind}|${row.subject_id}`));
  const operations = pending.map(op).sort((a, b) => a.operation_id.localeCompare(b.operation_id));
  const review: PublicKeyMigration["requires_review"] = [];
  const ownership = new Map<string, string>();
  for (const row of [...existing, ...operations]) {
    const ownershipKey = row.key_kind === "intervention_component"
      ? `${row.key_kind}|${row.owner_intervention_id}|${row.public_key}`
      : `${row.key_kind}|${row.public_key}`;
    const prior = ownership.get(ownershipKey);
    if (prior && prior !== row.subject_id) {
      review.push({ key_kind: row.key_kind, subject_id: row.subject_id, reason: "public_key_collision" });
    } else ownership.set(ownershipKey, row.subject_id);
  }
  const withoutReceipt = {
    schema_version: 1 as const,
    contract_id: PUBLIC_KEY_CONTRACT_ID,
    generator_commit: input.generatorCommit,
    as_of_date: input.asOfDate,
    registry_head: registryHead(existing),
    input_fingerprint: proposed.fingerprint,
    eligible_subject_count: proposed.proposals.length,
    existing_live_key_count: existing.length,
    newly_established_losslessly: operations.length,
    newly_established_from_accepted_review: 0,
    requires_review_count: review.length,
    proposed_operations: operations,
    requires_review: review,
  };
  return {
    ...withoutReceipt,
    receipt_id: `public-key-migration:${sha(stableJson(withoutReceipt as unknown as JsonValue))}`,
  };
}

function assertOwnedOutput(output: string, ownedRoot: string): void {
  const root = resolve(ownedRoot);
  const target = resolve(output);
  if (target === root || !target.startsWith(`${root}/`)) throw new Error("output escapes owned root");
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink() ||
        (!lstatSync(target).isDirectory()) ||
        readdirSync(target).length > 0) {
      throw new Error("public-key prepare output must not exist or must be empty");
    }
  }
  let cursor = dirname(target);
  while (cursor.startsWith(root) && cursor !== root) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error("owned output ancestry contains symlink");
    cursor = dirname(cursor);
  }
}

export function writePublicKeyMigration(
  migration: PublicKeyMigration,
  output: string,
  ownedRoot: string,
): string {
  assertOwnedOutput(output, ownedRoot);
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "migration-receipt.json"), `${JSON.stringify(migration, null, 2)}\n`);
  writeFileSync(join(output, "proposed-operations.jsonl"),
    migration.proposed_operations.map((row) => stableJson(row as unknown as JsonValue)).join("\n") +
    (migration.proposed_operations.length ? "\n" : ""));
  writeFileSync(join(output, "reconciliation.jsonl"),
    migration.requires_review.map((row) => stableJson(row as unknown as JsonValue)).join("\n") +
    (migration.requires_review.length ? "\n" : ""));
  return join(output, "migration-receipt.json");
}

export function applyPublicKeyMigration(receiptPath: string, root = repoRoot): PublicKeyMigration {
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as PublicKeyMigration;
  if (receipt.generator_commit !== gitCommit(root)) throw new Error("migration generator commit drift");
  const replay = preparePublicKeyMigration({
    rootDir: root, asOfDate: receipt.as_of_date, generatorCommit: receipt.generator_commit,
  });
  if (stableJson(replay as unknown as JsonValue) !== stableJson(receipt as unknown as JsonValue)) {
    throw new Error("migration receipt/input/registry drift");
  }
  if (receipt.requires_review_count !== 0) throw new Error("migration has unresolved review rows");
  const current = readPublicKeyOperations(root);
  const updated = [...current, ...receipt.proposed_operations];
  const dir = registryDir(root);
  mkdirSync(join(dir, "migration-receipts"), { recursive: true });
  const operationsPath = join(dir, "operations.jsonl");
  const building = `${operationsPath}.building`;
  writeFileSync(building, updated.map((row) => stableJson(row as unknown as JsonValue)).join("\n") + "\n");
  renameSync(building, operationsPath);
  const receiptHash = receipt.receipt_id.split(":")[1]!;
  writeFileSync(join(dir, "migration-receipts", `${receiptHash}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify({
    schema_version: 1,
    contract_id: PUBLIC_KEY_CONTRACT_ID,
    head: registryHead(updated),
    operation_count: updated.length,
    receipt_id: receipt.receipt_id,
    generator_commit: receipt.generator_commit,
  }, null, 2)}\n`);
  return receipt;
}

export function checkPublicKeyRegistry(asOfDate: string, root = repoRoot): {
  eligible: number; live: number; head: string;
} {
  const operations = readPublicKeyOperations(root);
  const migration = preparePublicKeyMigration({
    rootDir: root, asOfDate, generatorCommit: gitCommit(root),
  });
  if (migration.proposed_operations.length || migration.requires_review_count) {
    throw new Error("public-key registry is incomplete");
  }
  const manifest = JSON.parse(readFileSync(join(registryDir(root), "manifest.json"), "utf8")) as {
    head: string; operation_count: number;
  };
  if (manifest.head !== registryHead(operations) || manifest.operation_count !== operations.length ||
      operations.length !== migration.eligible_subject_count) {
    throw new Error("public-key registry manifest/eligible subject drift");
  }
  return { eligible: migration.eligible_subject_count, live: operations.length, head: manifest.head };
}
