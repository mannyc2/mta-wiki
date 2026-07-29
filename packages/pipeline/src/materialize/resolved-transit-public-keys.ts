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

export type EstablishPublicKeyOperation = {
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

export type RedirectPublicKeySubjectOperation = {
  schema_version: 1;
  operation: "redirect_public_key_subject";
  operation_id: string;
  key_kind: PublicKeyKind;
  subject_id: string;
  redirect_subject_id: string;
  decision_id: string;
  issued_at: string;
  rationale: string;
};

export type SupersedePublicKeyOperation = {
  schema_version: 1;
  operation: "supersede_public_key";
  operation_id: string;
  key_kind: PublicKeyKind;
  subject_id: string;
  prior_public_key: string;
  public_key: string;
  decision_id: string;
  issued_at: string;
  rationale: string;
};

export type PublicKeyOperation =
  | EstablishPublicKeyOperation
  | SupersedePublicKeyOperation
  | RedirectPublicKeySubjectOperation;

export type PublicKeyProposal = Omit<
  EstablishPublicKeyOperation,
  "operation_id" | "schema_version" | "operation"
>;

export type PublicKeyRegistryEntry = {
  key_kind: PublicKeyKind;
  subject_id: string;
  registry_state: "live" | "redirect";
  public_key: string;
  owner_intervention_id: string | null;
  redirect_subject_id: string | null;
  public_key_aliases: string[];
  operation_ids: string[];
  establishment: EstablishPublicKeyOperation;
};

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
  proposed_operations: EstablishPublicKeyOperation[];
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
export function publicKeyEstablishOperation(
  row: PublicKeyProposal,
): EstablishPublicKeyOperation {
  return { schema_version: 1, operation: "establish_public_key", operation_id: operationId(row), ...row };
}
function registryDir(root = repoRoot): string {
  return join(root, "data", "resolved-transit-public", "public-key-operations", "v1");
}

const establishFields = new Set([
  "decision_id",
  "establishment_method",
  "key_kind",
  "operation",
  "operation_id",
  "owner_intervention_id",
  "proposal_basis",
  "public_key",
  "schema_version",
  "subject_id",
]);
const redirectFields = new Set([
  "decision_id",
  "issued_at",
  "key_kind",
  "operation",
  "operation_id",
  "rationale",
  "redirect_subject_id",
  "schema_version",
  "subject_id",
]);
const supersedeKeyFields = new Set([
  "decision_id",
  "issued_at",
  "key_kind",
  "operation",
  "operation_id",
  "prior_public_key",
  "public_key",
  "rationale",
  "schema_version",
  "subject_id",
]);
const keyKinds = new Set<PublicKeyKind>([
  "route",
  "treatment_family",
  "source",
  "intervention_component",
  "placement",
]);

function strictObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function strictFields(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
  path: string,
): void {
  const extras = Object.keys(value).filter((field) => !expected.has(field)).sort();
  const missing = [...expected].filter((field) => !(field in value)).sort();
  if (extras.length > 0 || missing.length > 0) {
    throw new Error(
      `${path}: exact fields required; unknown=${extras.join(",")}; missing=${missing.join(",")}`,
    );
  }
}

function strictString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function strictLiteralString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`${path} must be a string`);
  return value;
}

function strictKeyKind(value: unknown, path: string): PublicKeyKind {
  const result = strictString(value, path);
  if (!keyKinds.has(result as PublicKeyKind)) {
    throw new Error(`${path} is unsupported: ${result}`);
  }
  return result as PublicKeyKind;
}

function redirectOperationId(
  row: Omit<RedirectPublicKeySubjectOperation, "operation_id" | "schema_version" | "operation">,
): string {
  return `public-key-op:${sha(stableJson(row as unknown as JsonValue)).slice(0, 24)}`;
}

export function publicKeyRedirectOperation(
  row: Omit<RedirectPublicKeySubjectOperation, "operation_id" | "schema_version" | "operation">,
): RedirectPublicKeySubjectOperation {
  return {
    schema_version: 1,
    operation: "redirect_public_key_subject",
    operation_id: redirectOperationId(row),
    ...row,
  };
}

function supersedeKeyOperationId(
  row: Omit<SupersedePublicKeyOperation, "operation_id" | "schema_version" | "operation">,
): string {
  return `public-key-op:${sha(stableJson(row as unknown as JsonValue)).slice(0, 24)}`;
}

export function publicKeySupersedeOperation(
  row: Omit<SupersedePublicKeyOperation, "operation_id" | "schema_version" | "operation">,
): SupersedePublicKeyOperation {
  return {
    schema_version: 1,
    operation: "supersede_public_key",
    operation_id: supersedeKeyOperationId(row),
    ...row,
  };
}

export function parsePublicKeyOperation(
  value: unknown,
  path = "public key operation",
): PublicKeyOperation {
  const input = strictObject(value, path);
  if (input.operation === "establish_public_key") {
    strictFields(input, establishFields, path);
    if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
    const basisInput = strictObject(input.proposal_basis, `${path}.proposal_basis`);
    const proposalBasis = Object.fromEntries(
      Object.entries(basisInput).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [
          key,
          strictLiteralString(entry, `${path}.proposal_basis.${key}`),
        ]),
    );
    const method = strictString(input.establishment_method, `${path}.establishment_method`);
    if (method !== "lossless_migration" && method !== "accepted_review") {
      throw new Error(`${path}.establishment_method is unsupported: ${method}`);
    }
    const decisionId = input.decision_id === null
      ? null
      : strictString(input.decision_id, `${path}.decision_id`);
    if (
      (method === "lossless_migration" && decisionId !== null) ||
      (method === "accepted_review" && decisionId === null)
    ) {
      throw new Error(`${path}: establishment method and decision_id disagree`);
    }
    const proposal: PublicKeyProposal = {
      key_kind: strictKeyKind(input.key_kind, `${path}.key_kind`),
      subject_id: strictString(input.subject_id, `${path}.subject_id`),
      owner_intervention_id: input.owner_intervention_id === null
        ? null
        : strictString(input.owner_intervention_id, `${path}.owner_intervention_id`),
      public_key: strictString(input.public_key, `${path}.public_key`),
      establishment_method: method,
      decision_id: decisionId,
      proposal_basis: proposalBasis,
    };
    assertSlug(proposal.public_key, `${path}.public_key`);
    const operation: EstablishPublicKeyOperation = {
      schema_version: 1,
      operation: "establish_public_key",
      operation_id: strictString(input.operation_id, `${path}.operation_id`),
      ...proposal,
    };
    if (operation.operation_id !== operationId(proposal)) {
      throw new Error(`${path}.operation_id is stale`);
    }
    return operation;
  }
  if (input.operation === "supersede_public_key") {
    strictFields(input, supersedeKeyFields, path);
    if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
    const withoutId = {
      key_kind: strictKeyKind(input.key_kind, `${path}.key_kind`),
      subject_id: strictString(input.subject_id, `${path}.subject_id`),
      prior_public_key: strictString(
        input.prior_public_key,
        `${path}.prior_public_key`,
      ),
      public_key: strictString(input.public_key, `${path}.public_key`),
      decision_id: strictString(input.decision_id, `${path}.decision_id`),
      issued_at: strictString(input.issued_at, `${path}.issued_at`),
      rationale: strictString(input.rationale, `${path}.rationale`),
    };
    assertSlug(withoutId.prior_public_key, `${path}.prior_public_key`);
    assertSlug(withoutId.public_key, `${path}.public_key`);
    if (withoutId.prior_public_key === withoutId.public_key) {
      throw new Error(`${path}: superseded public keys must differ`);
    }
    const operation: SupersedePublicKeyOperation = {
      schema_version: 1,
      operation: "supersede_public_key",
      operation_id: strictString(input.operation_id, `${path}.operation_id`),
      ...withoutId,
    };
    if (operation.operation_id !== supersedeKeyOperationId(withoutId)) {
      throw new Error(`${path}.operation_id is stale`);
    }
    return operation;
  }
  if (input.operation === "redirect_public_key_subject") {
    strictFields(input, redirectFields, path);
    if (input.schema_version !== 1) throw new Error(`${path}.schema_version must be 1`);
    const withoutId = {
      key_kind: strictKeyKind(input.key_kind, `${path}.key_kind`),
      subject_id: strictString(input.subject_id, `${path}.subject_id`),
      redirect_subject_id: strictString(
        input.redirect_subject_id,
        `${path}.redirect_subject_id`,
      ),
      decision_id: strictString(input.decision_id, `${path}.decision_id`),
      issued_at: strictString(input.issued_at, `${path}.issued_at`),
      rationale: strictString(input.rationale, `${path}.rationale`),
    };
    const operation: RedirectPublicKeySubjectOperation = {
      schema_version: 1,
      operation: "redirect_public_key_subject",
      operation_id: strictString(input.operation_id, `${path}.operation_id`),
      ...withoutId,
    };
    if (operation.operation_id !== redirectOperationId(withoutId)) {
      throw new Error(`${path}.operation_id is stale`);
    }
    return operation;
  }
  throw new Error(`${path}.operation is unsupported: ${String(input.operation)}`);
}

export function readPublicKeyOperations(root = repoRoot): PublicKeyOperation[] {
  const path = join(registryDir(root), "operations.jsonl");
  if (!existsSync(path)) return [];
  return jsonl(path).map((row, index) =>
    parsePublicKeyOperation(row, `${path}:${index + 1}`)
  );
}

function publicKeyOwnership(input: {
  key_kind: PublicKeyKind;
  owner_intervention_id: string | null;
  public_key: string;
}): string {
  return input.key_kind === "intervention_component"
    ? `${input.key_kind}|${input.owner_intervention_id}|${input.public_key}`
    : `${input.key_kind}|${input.public_key}`;
}

export function replayPublicKeyOperations(
  values: readonly PublicKeyOperation[],
): PublicKeyRegistryEntry[] {
  const operations = values.map((value, index) =>
    parsePublicKeyOperation(value, `public key operation[${index}]`)
  );
  if (new Set(operations.map((row) => row.operation_id)).size !== operations.length) {
    throw new Error("duplicate public key operation_id");
  }
  const registry = new Map<string, PublicKeyRegistryEntry>();
  const ownership = new Map<string, string>();
  for (const operation of operations) {
    const subjectKey = `${operation.key_kind}|${operation.subject_id}`;
    if (operation.operation === "establish_public_key") {
      if (registry.has(subjectKey)) {
        throw new Error(`${operation.operation_id}: duplicate public key subject owner`);
      }
      const entry: PublicKeyRegistryEntry = {
        key_kind: operation.key_kind,
        subject_id: operation.subject_id,
        registry_state: "live",
        public_key: operation.public_key,
        owner_intervention_id: operation.owner_intervention_id,
        redirect_subject_id: null,
        public_key_aliases: [],
        operation_ids: [operation.operation_id],
        establishment: operation,
      };
      const ownershipKey = publicKeyOwnership(entry);
      const prior = ownership.get(ownershipKey);
      if (prior) {
        throw new Error(
          `${operation.operation_id}: duplicate public key owner conflicts with ${prior}`,
        );
      }
      ownership.set(ownershipKey, subjectKey);
      registry.set(subjectKey, entry);
      continue;
    }

    const source = registry.get(subjectKey);
    if (operation.operation === "supersede_public_key") {
      if (!source || source.registry_state !== "live") {
        throw new Error(`${operation.operation_id}: key supersession references non-live subject`);
      }
      if (source.public_key !== operation.prior_public_key) {
        throw new Error(`${operation.operation_id}: stale prior public key`);
      }
      const newOwnershipKey = publicKeyOwnership({
        ...source,
        public_key: operation.public_key,
      });
      const prior = ownership.get(newOwnershipKey);
      if (prior && prior !== subjectKey) {
        throw new Error(
          `${operation.operation_id}: duplicate public key owner conflicts with ${prior}`,
        );
      }
      source.public_key_aliases = [...new Set([
        ...source.public_key_aliases,
        source.public_key,
      ])].sort();
      source.public_key = operation.public_key;
      source.operation_ids.push(operation.operation_id);
      ownership.set(newOwnershipKey, subjectKey);
      continue;
    }

    const targetKey = `${operation.key_kind}|${operation.redirect_subject_id}`;
    const target = registry.get(targetKey);
    if (!source || !target) {
      throw new Error(`${operation.operation_id}: redirect references missing subject`);
    }
    if (source.registry_state !== "live") {
      throw new Error(`${operation.operation_id}: cyclic or duplicate redirect source`);
    }
    if (target.registry_state !== "live") {
      throw new Error(`${operation.operation_id}: cyclic redirect target`);
    }
    if (
      operation.key_kind === "intervention_component" &&
      source.owner_intervention_id !== target.owner_intervention_id
    ) {
      throw new Error(`${operation.operation_id}: component redirect changes owner`);
    }
    source.registry_state = "redirect";
    source.redirect_subject_id = target.subject_id;
    source.operation_ids.push(operation.operation_id);
    target.public_key_aliases = [...new Set([
      ...target.public_key_aliases,
      ...source.public_key_aliases,
      source.public_key,
    ])].filter((key) => key !== target.public_key).sort();
    for (const alias of [source.public_key, ...source.public_key_aliases]) {
      ownership.set(publicKeyOwnership({
        ...target,
        public_key: alias,
      }), targetKey);
    }
    target.operation_ids.push(operation.operation_id);
  }
  return [...registry.values()].sort((left, right) =>
    `${left.key_kind}|${left.subject_id}`.localeCompare(
      `${right.key_kind}|${right.subject_id}`,
    )
  );
}

export function resolvePublicKeySubject(
  registry: readonly PublicKeyRegistryEntry[],
  keyKind: PublicKeyKind,
  subjectId: string,
): PublicKeyRegistryEntry | null {
  const bySubject = new Map(
    registry.map((entry) => [`${entry.key_kind}|${entry.subject_id}`, entry]),
  );
  let entry = bySubject.get(`${keyKind}|${subjectId}`);
  const seen = new Set<string>();
  while (entry?.registry_state === "redirect") {
    const key = `${entry.key_kind}|${entry.subject_id}`;
    if (seen.has(key)) throw new Error(`cyclic public key redirect at ${key}`);
    seen.add(key);
    entry = bySubject.get(`${keyKind}|${entry.redirect_subject_id}`);
  }
  return entry ?? null;
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

export function reconcilePublicKeyMigration(input: {
  existing_operations: readonly PublicKeyOperation[];
  proposals: readonly PublicKeyProposal[];
  input_fingerprint: string;
  asOfDate: string;
  generatorCommit: string;
}): PublicKeyMigration {
  const existing = [...input.existing_operations];
  const registry = replayPublicKeyOperations(existing);
  const existingBySubject = new Map(
    registry.map((row) => [`${row.key_kind}|${row.subject_id}`, row]),
  );
  const eligibleSubjects = new Set(
    input.proposals.map((row) => `${row.key_kind}|${row.subject_id}`),
  );
  const orphanedLiveSubjects = registry
    .filter((entry) =>
      entry.registry_state === "live" &&
      !eligibleSubjects.has(`${entry.key_kind}|${entry.subject_id}`)
    );
  if (orphanedLiveSubjects.length > 0) {
    throw new Error(
      "public-key registry has live subjects absent the current eligible set; " +
      "append an accepted subject redirect before changing the subject set: " +
      orphanedLiveSubjects.map((entry) =>
        `${entry.key_kind}|${entry.subject_id}`
      ).join(", "),
    );
  }
  for (const proposal of input.proposals) {
    const prior = existingBySubject.get(`${proposal.key_kind}|${proposal.subject_id}`);
    if (!prior) continue;
    if (prior.registry_state !== "live") {
      throw new Error(
        `eligible public-key subject is redirected: ${proposal.key_kind}|${proposal.subject_id}`,
      );
    }
    if (prior.owner_intervention_id !== proposal.owner_intervention_id) {
      throw new Error(
        `public-key subject owner changed without an accepted redirect: ` +
        `${proposal.key_kind}|${proposal.subject_id}`,
      );
    }
  }
  const pending = input.proposals.filter((row) =>
    !existingBySubject.has(`${row.key_kind}|${row.subject_id}`)
  );
  const operations = pending.map(publicKeyEstablishOperation)
    .sort((a, b) => a.operation_id.localeCompare(b.operation_id));
  const review: PublicKeyMigration["requires_review"] = [];
  const ownership = new Map<string, string>();
  for (const row of [
    ...registry.filter((entry) => entry.registry_state === "live").map((entry) =>
      entry.establishment
    ),
    ...operations,
  ]) {
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
    input_fingerprint: input.input_fingerprint,
    eligible_subject_count: input.proposals.length,
    existing_live_key_count:
      registry.filter((entry) => entry.registry_state === "live").length,
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

export function preparePublicKeyMigration(input: {
  rootDir?: string;
  asOfDate: string;
  generatorCommit: string;
}): PublicKeyMigration {
  const root = input.rootDir ?? repoRoot;
  const proposed = proposals(root);
  return reconcilePublicKeyMigration({
    existing_operations: readPublicKeyOperations(root),
    proposals: proposed.proposals,
    input_fingerprint: proposed.fingerprint,
    asOfDate: input.asOfDate,
    generatorCommit: input.generatorCommit,
  });
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
  const registry = replayPublicKeyOperations(operations);
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
      registry.filter((entry) => entry.registry_state === "live").length !==
        migration.eligible_subject_count) {
    throw new Error("public-key registry manifest/eligible subject drift");
  }
  return {
    eligible: migration.eligible_subject_count,
    live: registry.filter((entry) => entry.registry_state === "live").length,
    head: manifest.head,
  };
}
