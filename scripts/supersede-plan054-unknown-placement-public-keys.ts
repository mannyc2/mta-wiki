import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  publicKeySupersedeOperation,
  readPublicKeyOperations,
  replayPublicKeyOperations,
  type PublicKeyOperation,
  type SupersedePublicKeyOperation,
} from "../packages/pipeline/src/materialize/resolved-transit-public-keys";

const campaign = "data/intervention-placements/campaigns/plan-054";
const registryDir = "data/resolved-transit-public/public-key-operations/v1";
const operationsRelative = `${registryDir}/operations.jsonl`;
const manifestRelative = `${registryDir}/manifest.json`;
const integrationRelative =
  `${campaign}/accepted/public-key-unknown-supersession-integration-v1.json`;
const decisionId =
  "plan-054:remove-unknown-placement-public-keys-v1";
const issuedAt = "2026-08-01T00:00:00Z";
const priorHead =
  "d58eb308bdfd913f86c21a7838f41bae077fe27e181840d03582402d52b81864";

type PlacementRow = {
  placement_id: string;
  founding_key: string;
  aliases: string[];
  identity_decision_ids: string[];
  operation_ids: string[];
};

type IdentityOperationRow = {
  decision_id: string;
  operation_id: string;
  founding_key: string;
  primary_reviewer: string;
  independent_reviewer: string;
  adjudicator: string | null;
  review_outcome: string;
  batch_id: string;
  manifest_sha256: string;
};

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}

function jsonl<T>(relativePath: string): T[] {
  const text = readFileSync(absolute(relativePath), "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as T) : [];
}

function operationsJsonl(operations: readonly PublicKeyOperation[]): string {
  return operations.map((operation) =>
    stableJson(operation as unknown as JsonValue)
  ).join("\n") + "\n";
}

function registryHead(operations: readonly PublicKeyOperation[]): string {
  return sha256(
    operations.map((operation) =>
      stableJson(operation as unknown as JsonValue)
    ).join("\n"),
  );
}

function generatorCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function expectedSupersessions(
  prior: readonly PublicKeyOperation[],
): {
  operations: SupersedePublicKeyOperation[];
  reviewRows: Array<Record<string, unknown>>;
} {
  const registry = replayPublicKeyOperations(prior);
  const unknown = registry.filter((entry) =>
    entry.registry_state === "live" &&
    entry.key_kind === "placement" &&
    entry.public_key.split("-").includes("unknown")
  ).sort((left, right) => left.subject_id.localeCompare(right.subject_id));
  if (unknown.length !== 29) {
    throw new Error(`expected 29 live unknown placement keys, found ${unknown.length}`);
  }
  const placements = new Map(
    jsonl<PlacementRow>(
      "data/resolved-transit/operator/v1/placements/registry.jsonl",
    ).map((row) => [row.placement_id, row]),
  );
  const identityOperations = new Map(
    jsonl<IdentityOperationRow>(
      `${campaign}/accepted/identity-operations.jsonl`,
    ).map((row) => [row.operation_id, row]),
  );
  const desiredKeys = new Set<string>();
  const reviewRows: Array<Record<string, unknown>> = [];
  const operations = unknown.map((entry) => {
    const placement = placements.get(entry.subject_id);
    if (!placement) throw new Error(`${entry.subject_id}: placement is missing`);
    const desiredKey = placement.founding_key.replace(
      /^application-public-key:/u,
      "",
    );
    const identityOperation = identityOperations.get(placement.operation_ids[0]!);
    if (
      !desiredKey || desiredKey.includes("unknown") ||
      !placement.aliases.includes(desiredKey) ||
      placement.identity_decision_ids.length !== 1 ||
      placement.operation_ids.length !== 1 ||
      !identityOperation ||
      identityOperation.decision_id !== placement.identity_decision_ids[0] ||
      identityOperation.founding_key !== placement.founding_key
    ) {
      throw new Error(`${entry.subject_id}: immutable founding-key authority drifted`);
    }
    if (desiredKeys.has(desiredKey)) {
      throw new Error(`${entry.subject_id}: duplicate reviewed replacement key`);
    }
    desiredKeys.add(desiredKey);
    const operation = publicKeySupersedeOperation({
      key_kind: "placement",
      subject_id: entry.subject_id,
      prior_public_key: entry.public_key,
      public_key: desiredKey,
      decision_id: decisionId,
      issued_at: issuedAt,
      rationale:
        "Replace the mutable unknown-scope presentation key with the placement's immutable accepted founding application key while retaining the prior key as an alias.",
    });
    reviewRows.push({
      placement_id: entry.subject_id,
      placement_identity_decision_id: identityOperation.decision_id,
      placement_identity_operation_id: identityOperation.operation_id,
      placement_batch_id: identityOperation.batch_id,
      placement_manifest_sha256: identityOperation.manifest_sha256,
      primary_reviewer: identityOperation.primary_reviewer,
      independent_reviewer: identityOperation.independent_reviewer,
      adjudicator: identityOperation.adjudicator,
      review_outcome: identityOperation.review_outcome,
      prior_public_key: entry.public_key,
      immutable_founding_application_public_key: desiredKey,
      supersession_operation_id: operation.operation_id,
    });
    return operation;
  });
  const updated = [...prior, ...operations];
  const result = replayPublicKeyOperations(updated);
  const livePlacements = result.filter((entry) =>
    entry.registry_state === "live" && entry.key_kind === "placement"
  );
  if (
    result.filter((entry) => entry.registry_state === "live").length !== 681 ||
    result.some((entry) => entry.registry_state === "redirect") ||
    livePlacements.length !== 104 ||
    livePlacements.some((entry) => entry.public_key.includes("unknown")) ||
    operations.some((operation) => {
      const entry = livePlacements.find((row) =>
        row.subject_id === operation.subject_id
      );
      return !entry ||
        entry.public_key !== operation.public_key ||
        !entry.public_key_aliases.includes(operation.prior_public_key);
    })
  ) {
    throw new Error("reviewed unknown-key supersession replay is invalid");
  }
  return { operations, reviewRows };
}

function reviewReceipt(input: {
  generatorCommit: string;
  prior: readonly PublicKeyOperation[];
  operations: readonly SupersedePublicKeyOperation[];
  reviewRows: readonly Record<string, unknown>[];
}): Record<string, unknown> {
  const updated = [...input.prior, ...input.operations];
  const withoutId = {
    schema_version: 1,
    contract_id: "plan-054-reviewed-unknown-placement-public-key-supersession-v1",
    plan_id: "plan-054",
    decision_id: decisionId,
    issued_at: issuedAt,
    generator_commit: input.generatorCommit,
    integrator: "plan-054-single-placement-integrator",
    independent_public_key_auditor: "plan-054-final-independent-auditor",
    owner_authorization: {
      semantic_acceptance_approved: true,
      public_identity_supersessions_approved: true,
      authorization_basis:
        "Owner explicitly granted all approvals for Plans 054-057 on 2026-08-01.",
    },
    authorities: [
      `${campaign}/accepted/integration-receipt.json`,
      `${campaign}/accepted/completion-receipt.json`,
      `${campaign}/accepted/identity-operations.jsonl`,
      `${campaign}/accepted/public-key-migration-integration-v1.json`,
      "data/resolved-transit/operator/v1/placements/registry.jsonl",
    ].map((path) => ({
      path,
      sha256: sha256(readFileSync(absolute(path))),
    })),
    prior_registry: {
      operation_count: input.prior.length,
      head: registryHead(input.prior),
      live_count: replayPublicKeyOperations(input.prior).filter((entry) =>
        entry.registry_state === "live"
      ).length,
      live_unknown_placement_key_count: 29,
    },
    supersessions: input.reviewRows,
    result_registry: {
      operation_count: updated.length,
      head: registryHead(updated),
      live_count: replayPublicKeyOperations(updated).filter((entry) =>
        entry.registry_state === "live"
      ).length,
      redirect_count: replayPublicKeyOperations(updated).filter((entry) =>
        entry.registry_state === "redirect"
      ).length,
      live_unknown_placement_key_count: 0,
    },
    old_public_keys_retained_as_aliases: true,
    existing_subject_lookups_changed: false,
    public_identity_redirect_count: 0,
    canonical_observations_changed: false,
    provider_usage: {
      request_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
    },
    publication_or_release_authorized: false,
  };
  return {
    ...withoutId,
    receipt_id: `plan-054-public-key-supersession:${sha256(
      stableJson(withoutId as JsonValue),
    )}`,
  };
}

function write(): void {
  if (existsSync(absolute(integrationRelative))) {
    throw new Error(`supersession integration already exists: ${integrationRelative}`);
  }
  const prior = readPublicKeyOperations();
  if (prior.length !== 1024 || registryHead(prior) !== priorHead) {
    throw new Error("Plan 054 public-key migration checkpoint drifted");
  }
  const expected = expectedSupersessions(prior);
  const generator = generatorCommit();
  const receipt = reviewReceipt({
    generatorCommit: generator,
    prior,
    operations: expected.operations,
    reviewRows: expected.reviewRows,
  });
  const receiptId = String(receipt.receipt_id);
  const receiptHash = receiptId.split(":")[1];
  if (!receiptHash) throw new Error("supersession receipt id lacks hash");
  const registryReceiptRelative =
    `${registryDir}/review-receipts/${receiptHash}.json`;
  const campaignReceiptRelative =
    `${campaign}/accepted/public-key-review-receipts/${receiptHash}.json`;
  if (
    existsSync(absolute(registryReceiptRelative)) ||
    existsSync(absolute(campaignReceiptRelative))
  ) {
    throw new Error("Plan 054 supersession receipt collision");
  }
  const updated = [...prior, ...expected.operations];
  const building = `${absolute(operationsRelative)}.building`;
  writeFileSync(building, operationsJsonl(updated), "utf8");
  renameSync(building, absolute(operationsRelative));
  const receiptBytes = json(receipt);
  for (const path of [registryReceiptRelative, campaignReceiptRelative]) {
    mkdirSync(dirname(absolute(path)), { recursive: true });
    writeFileSync(absolute(path), receiptBytes, "utf8");
  }
  writeFileSync(absolute(manifestRelative), `${JSON.stringify({
    schema_version: 1,
    contract_id: "resolved-transit-public-key-registry-v1",
    head: registryHead(updated),
    operation_count: updated.length,
    receipt_id: receiptId,
    generator_commit: generator,
  }, null, 2)}\n`, "utf8");
  const integrationWithoutId = {
    schema_version: 1,
    contract_id: "plan-054-unknown-placement-public-key-supersession-integration-v1",
    plan_id: "plan-054",
    decision_id: decisionId,
    generator_commit: generator,
    registry_receipt: {
      path: registryReceiptRelative,
      sha256: sha256(receiptBytes),
    },
    campaign_receipt: {
      path: campaignReceiptRelative,
      sha256: sha256(receiptBytes),
    },
    prior_registry: {
      operation_count: prior.length,
      head: registryHead(prior),
    },
    result_registry: {
      operation_count: updated.length,
      head: registryHead(updated),
      live_count: 681,
      redirect_count: 0,
      live_unknown_placement_key_count: 0,
    },
    supersession_count: expected.operations.length,
  };
  const integration = {
    ...integrationWithoutId,
    receipt_id: `plan-054-public-key-supersession-integration:${sha256(
      stableJson(integrationWithoutId as JsonValue),
    )}`,
  };
  mkdirSync(dirname(absolute(integrationRelative)), { recursive: true });
  writeFileSync(absolute(integrationRelative), json(integration), "utf8");
}

function check(): void {
  if (!existsSync(absolute(integrationRelative))) {
    throw new Error(`supersession integration is missing: ${integrationRelative}`);
  }
  const integration = JSON.parse(
    readFileSync(absolute(integrationRelative), "utf8"),
  ) as {
    contract_id: string;
    generator_commit: string;
    registry_receipt: { path: string; sha256: string };
    campaign_receipt: { path: string; sha256: string };
    prior_registry: { operation_count: number; head: string };
    result_registry: {
      operation_count: number;
      head: string;
      live_count: number;
      redirect_count: number;
      live_unknown_placement_key_count: number;
    };
    supersession_count: number;
  };
  if (
    integration.contract_id !==
      "plan-054-unknown-placement-public-key-supersession-integration-v1" ||
    integration.prior_registry.operation_count !== 1024 ||
    integration.prior_registry.head !== priorHead ||
    integration.result_registry.operation_count !== 1053 ||
    integration.result_registry.live_count !== 681 ||
    integration.result_registry.redirect_count !== 0 ||
    integration.result_registry.live_unknown_placement_key_count !== 0 ||
    integration.supersession_count !== 29
  ) {
    throw new Error("Plan 054 unknown-key supersession integration is invalid");
  }
  const operations = readPublicKeyOperations();
  const prior = operations.slice(0, integration.prior_registry.operation_count);
  const additions = operations.slice(
    integration.prior_registry.operation_count,
    integration.result_registry.operation_count,
  );
  const expected = expectedSupersessions(prior);
  if (
    registryHead(prior) !== integration.prior_registry.head ||
    stableJson(additions as unknown as JsonValue) !==
      stableJson(expected.operations as unknown as JsonValue) ||
    registryHead([...prior, ...additions]) !== integration.result_registry.head
  ) {
    throw new Error("Plan 054 unknown-key supersession operation prefix drifted");
  }
  const expectedReceipt = reviewReceipt({
    generatorCommit: integration.generator_commit,
    prior,
    operations: expected.operations,
    reviewRows: expected.reviewRows,
  });
  const expectedBytes = json(expectedReceipt);
  for (const addressed of [
    integration.registry_receipt,
    integration.campaign_receipt,
  ]) {
    if (
      !existsSync(absolute(addressed.path)) ||
      sha256(readFileSync(absolute(addressed.path))) !== addressed.sha256 ||
      readFileSync(absolute(addressed.path), "utf8") !== expectedBytes
    ) {
      throw new Error(`Plan 054 supersession receipt drifted: ${addressed.path}`);
    }
  }
  if (
    readFileSync(absolute(integration.registry_receipt.path), "utf8") !==
    readFileSync(absolute(integration.campaign_receipt.path), "utf8")
  ) {
    throw new Error("Plan 054 supersession receipt copies differ");
  }
  const registry = replayPublicKeyOperations(operations);
  if (
    operations.length !== integration.result_registry.operation_count ||
    registryHead(operations) !== integration.result_registry.head ||
    registry.filter((entry) => entry.registry_state === "live").length !== 681 ||
    registry.some((entry) =>
      entry.registry_state === "live" && entry.public_key.includes("unknown")
    )
  ) {
    throw new Error("Plan 054 final public-key registry drifted");
  }
}

const mode = process.argv[2];
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error(
    "usage: bun scripts/supersede-plan054-unknown-placement-public-keys.ts --write|--check",
  );
}
if (mode === "--write") write();
else check();
console.log(
  `Plan 054 unknown placement public keys ${
    mode === "--write" ? "superseded" : "verified"
  }: 29 reviewed same-subject key updates.`,
);
