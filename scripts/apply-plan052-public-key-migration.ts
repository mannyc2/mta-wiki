import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  applyPublicKeyMigration,
  checkPublicKeyRegistry,
  preparePublicKeyMigration,
} from "../packages/pipeline/src/materialize/resolved-transit-public-keys";

const campaign =
  "data/operational-episode-resolution/campaigns/plan-052";
const campaignReceiptDir = `${campaign}/public-key-migrations`;
const integrationRelative =
  `${campaign}/integration-receipts/final-public-key-migration-v1.json`;
const registryReceiptDir =
  "data/resolved-transit-public/public-key-operations/v1/migration-receipts";
const asOfDate = "2026-07-27";

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}
function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}
function generatorCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}
function write(): void {
  if (existsSync(absolute(integrationRelative))) {
    throw new Error(`Plan 052 public-key migration already integrated: ${integrationRelative}`);
  }
  const migration = preparePublicKeyMigration({
    asOfDate,
    generatorCommit: generatorCommit(),
  });
  if (
    migration.proposed_operations.length === 0 ||
    migration.requires_review_count !== 0
  ) {
    throw new Error(
      `Plan 052 public-key migration must be nonempty and review-free; ` +
        `proposed=${migration.proposed_operations.length}, review=${migration.requires_review_count}`,
    );
  }
  const receiptHash = migration.receipt_id.split(":")[1];
  if (!receiptHash) throw new Error("public-key migration receipt id lacks hash");
  const campaignReceiptRelative =
    `${campaignReceiptDir}/${receiptHash}.json`;
  const registryReceiptRelative =
    `${registryReceiptDir}/${receiptHash}.json`;
  if (
    existsSync(absolute(campaignReceiptRelative)) ||
    existsSync(absolute(registryReceiptRelative))
  ) {
    throw new Error("Plan 052 public-key migration receipt collision");
  }
  mkdirSync(dirname(absolute(campaignReceiptRelative)), { recursive: true });
  writeFileSync(
    absolute(campaignReceiptRelative),
    `${JSON.stringify(migration, null, 2)}\n`,
    "utf8",
  );
  const applied = applyPublicKeyMigration(absolute(campaignReceiptRelative));
  if (applied.receipt_id !== migration.receipt_id) {
    throw new Error("applied public-key migration receipt drifted");
  }
  const result = checkPublicKeyRegistry(asOfDate);
  const campaignReceiptBytes = readFileSync(absolute(campaignReceiptRelative));
  const registryReceiptBytes = readFileSync(absolute(registryReceiptRelative));
  if (sha256(campaignReceiptBytes) !== sha256(registryReceiptBytes)) {
    throw new Error("campaign and registry public-key receipts differ");
  }
  mkdirSync(dirname(absolute(integrationRelative)), { recursive: true });
  writeFileSync(absolute(integrationRelative), json({
    schema_version: 1,
    contract_id: "plan-052-public-key-migration-integration-v1",
    plan_id: "plan-052",
    applied_at: "2026-07-30T22:00:00.000Z",
    integrator: "plan-052-single-frontier-integrator",
    as_of_date: asOfDate,
    generator_commit: migration.generator_commit,
    registry_head_before: migration.registry_head,
    existing_live_key_count: migration.existing_live_key_count,
    newly_established_losslessly:
      migration.newly_established_losslessly,
    newly_established_from_accepted_review:
      migration.newly_established_from_accepted_review,
    requires_review_count: migration.requires_review_count,
    eligible_subject_count: migration.eligible_subject_count,
    campaign_receipt: {
      path: campaignReceiptRelative,
      sha256: sha256(campaignReceiptBytes),
    },
    registry_receipt: {
      path: registryReceiptRelative,
      sha256: sha256(registryReceiptBytes),
    },
    result_registry: result,
    provider_usage: {
      request_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
    },
    publication_or_release_authorized: false,
  }), "utf8");
}
function check(): void {
  if (!existsSync(absolute(integrationRelative))) {
    throw new Error(`missing Plan 052 public-key integration receipt: ${integrationRelative}`);
  }
  const integration = JSON.parse(
    readFileSync(absolute(integrationRelative), "utf8"),
  ) as {
    contract_id: string;
    as_of_date: string;
    campaign_receipt: { path: string; sha256: string };
    registry_receipt: { path: string; sha256: string };
    newly_established_losslessly: number;
    requires_review_count: number;
    result_registry: { eligible: number; live: number; head: string };
  };
  if (
    integration.contract_id !==
      "plan-052-public-key-migration-integration-v1" ||
    integration.as_of_date !== asOfDate ||
    integration.newly_established_losslessly <= 0 ||
    integration.requires_review_count !== 0
  ) {
    throw new Error("Plan 052 public-key integration receipt is invalid");
  }
  for (const receipt of [
    integration.campaign_receipt,
    integration.registry_receipt,
  ]) {
    if (
      !existsSync(absolute(receipt.path)) ||
      sha256(readFileSync(absolute(receipt.path))) !== receipt.sha256
    ) {
      throw new Error(`Plan 052 public-key receipt drifted: ${receipt.path}`);
    }
  }
  if (
    readFileSync(absolute(integration.campaign_receipt.path), "utf8") !==
      readFileSync(absolute(integration.registry_receipt.path), "utf8")
  ) {
    throw new Error("campaign and registry public-key receipt bytes differ");
  }
  const result = checkPublicKeyRegistry(asOfDate);
  if (
    result.eligible !== integration.result_registry.eligible ||
    result.live !== integration.result_registry.live ||
    result.head !== integration.result_registry.head
  ) {
    throw new Error("Plan 052 public-key registry result drifted");
  }
  const matchingReceipts = readdirSync(absolute(registryReceiptDir))
    .filter((name) => name.endsWith(".json"))
    .filter((name) =>
      join(registryReceiptDir, name) === integration.registry_receipt.path
    );
  if (matchingReceipts.length !== 1) {
    throw new Error("Plan 052 registry migration receipt membership drifted");
  }
}

const mode = process.argv[2];
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error(
    "usage: bun scripts/apply-plan052-public-key-migration.ts --write|--check",
  );
}
if (mode === "--write") write();
else check();
console.log(
  `Plan 052 public-key migration ${mode === "--write" ? "applied" : "verified"}.`,
);
