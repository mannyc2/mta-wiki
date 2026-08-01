import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  applyPublicKeyMigration,
  assertCleanGenerator,
  checkPublicKeyRegistry,
  preparePublicKeyMigration,
  readPublicKeyOperations,
} from "../packages/pipeline/src/materialize/resolved-transit-public-keys";

const asOfDate = "2026-07-27";
const campaign = "data/intervention-placements/campaigns/plan-054";
const campaignReceiptDir = `${campaign}/accepted/public-key-migrations`;
const integrationRelative =
  `${campaign}/accepted/public-key-migration-integration-v1.json`;
const reviewIntegrationRelative =
  `${campaign}/accepted/public-key-review-integration-v1.json`;
const registryReceiptDir =
  "data/resolved-transit-public/public-key-operations/v1/migration-receipts";

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}

function registryHead(operations: ReturnType<typeof readPublicKeyOperations>): string {
  return sha256(
    operations.map((operation) =>
      stableJson(operation as unknown as JsonValue)
    ).join("\n"),
  );
}

function write(): void {
  if (existsSync(absolute(integrationRelative))) {
    throw new Error(`migration integration already exists: ${integrationRelative}`);
  }
  const reviewIntegrationBytes = readFileSync(
    absolute(reviewIntegrationRelative),
  );
  const reviewIntegration = JSON.parse(
    reviewIntegrationBytes.toString("utf8"),
  ) as {
    contract_id: string;
    result_registry_prefix: { operation_count: number; head: string };
    accepted_review_establishment_count: number;
  };
  if (
    reviewIntegration.contract_id !==
      "plan-054-public-key-review-integration-v1" ||
    reviewIntegration.result_registry_prefix.operation_count !== 923 ||
    reviewIntegration.accepted_review_establishment_count !== 3
  ) {
    throw new Error("reviewed placement public-key checkpoint is invalid");
  }
  const generatorCommit = assertCleanGenerator();
  const migration = preparePublicKeyMigration({
    asOfDate,
    generatorCommit,
  });
  if (
    migration.registry_head !== reviewIntegration.result_registry_prefix.head ||
    migration.eligible_subject_count !== 681 ||
    migration.existing_live_key_count !== 580 ||
    migration.newly_established_losslessly !== 101 ||
    migration.newly_established_from_accepted_review !== 0 ||
    migration.requires_review_count !== 0 ||
    migration.proposed_operations.length !== 101 ||
    migration.proposed_operations.some((row) =>
      row.establishment_method !== "lossless_migration" ||
      row.decision_id !== null ||
      row.key_kind !== "placement"
    )
  ) {
    throw new Error("Plan 054 lossless public-key migration arithmetic drifted");
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
    throw new Error("Plan 054 public-key migration receipt collision");
  }
  mkdirSync(dirname(absolute(campaignReceiptRelative)), { recursive: true });
  writeFileSync(
    absolute(campaignReceiptRelative),
    `${JSON.stringify(migration, null, 2)}\n`,
    "utf8",
  );
  const applied = applyPublicKeyMigration(absolute(campaignReceiptRelative));
  if (applied.receipt_id !== migration.receipt_id) {
    throw new Error("applied Plan 054 public-key migration drifted");
  }
  const result = checkPublicKeyRegistry(asOfDate);
  const campaignReceiptBytes = readFileSync(absolute(campaignReceiptRelative));
  const registryReceiptBytes = readFileSync(absolute(registryReceiptRelative));
  if (sha256(campaignReceiptBytes) !== sha256(registryReceiptBytes)) {
    throw new Error("campaign and registry public-key receipts differ");
  }
  const operations = readPublicKeyOperations();
  const integrationWithoutId = {
    schema_version: 1,
    contract_id: "plan-054-public-key-migration-integration-v1",
    plan_id: "plan-054",
    applied_at: "2026-08-01T00:00:00Z",
    integrator: "plan-054-single-placement-integrator",
    as_of_date: asOfDate,
    generator_commit: migration.generator_commit,
    preceding_review_integration: {
      path: reviewIntegrationRelative,
      sha256: sha256(reviewIntegrationBytes),
      accepted_review_establishment_count: 3,
    },
    registry_head_before: migration.registry_head,
    existing_live_key_count: migration.existing_live_key_count,
    newly_established_losslessly: migration.newly_established_losslessly,
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
    result_registry: {
      ...result,
      operation_count: operations.length,
    },
    provider_usage: {
      request_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
    },
    public_identity_redirect_count: 0,
    canonical_observations_changed: false,
    publication_or_release_authorized: false,
  };
  const integration = {
    ...integrationWithoutId,
    receipt_id: `plan-054-public-key-migration-integration:${sha256(
      stableJson(integrationWithoutId as JsonValue),
    )}`,
  };
  mkdirSync(dirname(absolute(integrationRelative)), { recursive: true });
  writeFileSync(absolute(integrationRelative), json(integration), "utf8");
}

function check(): void {
  if (!existsSync(absolute(integrationRelative))) {
    throw new Error(`migration integration is missing: ${integrationRelative}`);
  }
  const integration = JSON.parse(
    readFileSync(absolute(integrationRelative), "utf8"),
  ) as {
    contract_id: string;
    as_of_date: string;
    preceding_review_integration: {
      path: string;
      sha256: string;
      accepted_review_establishment_count: number;
    };
    existing_live_key_count: number;
    newly_established_losslessly: number;
    newly_established_from_accepted_review: number;
    requires_review_count: number;
    eligible_subject_count: number;
    campaign_receipt: { path: string; sha256: string };
    registry_receipt: { path: string; sha256: string };
    result_registry: {
      eligible: number;
      live: number;
      head: string;
      operation_count: number;
    };
    public_identity_redirect_count: number;
  };
  if (
    integration.contract_id !==
      "plan-054-public-key-migration-integration-v1" ||
    integration.as_of_date !== asOfDate ||
    integration.preceding_review_integration.accepted_review_establishment_count !== 3 ||
    integration.existing_live_key_count !== 580 ||
    integration.newly_established_losslessly !== 101 ||
    integration.newly_established_from_accepted_review !== 0 ||
    integration.requires_review_count !== 0 ||
    integration.eligible_subject_count !== 681 ||
    integration.result_registry.operation_count !== 1024 ||
    integration.public_identity_redirect_count !== 0
  ) {
    throw new Error("Plan 054 public-key migration integration is invalid");
  }
  if (
    sha256(readFileSync(absolute(integration.preceding_review_integration.path))) !==
      integration.preceding_review_integration.sha256
  ) {
    throw new Error("preceding reviewed public-key checkpoint drifted");
  }
  for (const addressed of [
    integration.campaign_receipt,
    integration.registry_receipt,
  ]) {
    if (
      !existsSync(absolute(addressed.path)) ||
      sha256(readFileSync(absolute(addressed.path))) !== addressed.sha256
    ) {
      throw new Error(`Plan 054 public-key receipt drifted: ${addressed.path}`);
    }
  }
  if (
    readFileSync(absolute(integration.campaign_receipt.path), "utf8") !==
    readFileSync(absolute(integration.registry_receipt.path), "utf8")
  ) {
    throw new Error("Plan 054 public-key receipt copies differ");
  }
  const result = checkPublicKeyRegistry(asOfDate);
  const operations = readPublicKeyOperations();
  const migrationPrefix = operations.slice(
    0,
    integration.result_registry.operation_count,
  );
  if (
    migrationPrefix.length !== integration.result_registry.operation_count ||
    registryHead(migrationPrefix) !== integration.result_registry.head ||
    result.eligible !== 681 ||
    result.live !== 681 ||
    operations.length < integration.result_registry.operation_count
  ) {
    throw new Error("Plan 054 public-key migration checkpoint drifted");
  }
}

const mode = process.argv[2];
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error(
    "usage: bun scripts/apply-plan054-public-key-migration.ts --write|--check",
  );
}
if (mode === "--write") write();
else check();
console.log(
  `Plan 054 public-key migration ${
    mode === "--write" ? "applied" : "verified"
  }.`,
);
