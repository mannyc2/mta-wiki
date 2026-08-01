import { createHash } from "node:crypto";
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
  assertCleanGenerator,
  preparePublicKeyMigration,
  publicKeyEstablishOperation,
  readPublicKeyOperations,
  replayPublicKeyOperations,
  type PublicKeyOperation,
} from "../packages/pipeline/src/materialize/resolved-transit-public-keys";

const asOfDate = "2026-07-27";
const acceptedAt = "2026-08-01T00:00:00Z";
const decisionId = "plan-054:placement-public-key-collision-review-v1";
const campaign = "data/intervention-placements/campaigns/plan-054";
const registryDir = "data/resolved-transit-public/public-key-operations/v1";
const operationsRelative = `${registryDir}/operations.jsonl`;
const manifestRelative = `${registryDir}/manifest.json`;
const integrationRelative =
  `${campaign}/accepted/public-key-review-integration-v1.json`;
const baselineHead =
  "ab00ce5bcb7f9db576eab3e6152ff5f6de6b160c74cd0bf4f0c29581cf9d724d";
const baselineInputFingerprint =
  "b1dc46454df561432bb742bd2736f00a6c0c2b5ee56238511d7b45d74d8914dd";

const authorityPaths = [
  `${campaign}/accepted/integration-receipt.json`,
  `${campaign}/accepted/completion-receipt.json`,
  `${campaign}/reviews/adjudication/recommendations.jsonl`,
] as const;

const reviewedPlacements = [
  {
    subject_id: "placement:e171147f0ba04761362b65cc",
    public_key:
      "m79-sbs-fare-collection-component-3ac61802e4f4b02f4bcb8f3c",
    conflicting_distinct_placement_id: "placement:cea101769e5a500ec41db6a2",
    placement_identity_decision_id:
      "plan-054-placement-af8e8fd2b9f812a20422e95d",
  },
  {
    subject_id: "placement:7093265d8a351b63817241ef",
    public_key:
      "m34a-sbs-fare-collection-component-ba1de677d698b4a6a726a489",
    conflicting_distinct_placement_id: "placement:3b6ccfa69b3d52bff8af121c",
    placement_identity_decision_id:
      "plan-054-placement-c3dbef5ac4b8b943712b6a34",
  },
  {
    subject_id: "placement:39035f0bf14355357f1c16c9",
    public_key:
      "m34-select-bus-service-fare-collection-component-b75a8247d4f3287f2b0b87f0",
    conflicting_distinct_placement_id: "placement:63831dd6c60468c1e354642e",
    placement_identity_decision_id:
      "plan-054-placement-cc580f07cb4c01b70f35557c",
  },
] as const;

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
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

function placementRows(): Map<string, Record<string, unknown>> {
  const path = absolute(
    "data/resolved-transit/operator/v1/placements/registry.jsonl",
  );
  return new Map(
    readFileSync(path, "utf8").trim().split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .map((row) => [String(row.placement_id), row]),
  );
}

function reviewedOperations(): PublicKeyOperation[] {
  const placements = placementRows();
  return reviewedPlacements.map((review) => {
    const placement = placements.get(review.subject_id);
    const conflicting = placements.get(review.conflicting_distinct_placement_id);
    if (!placement || !conflicting) {
      throw new Error(`${review.subject_id}: reviewed collision pair is missing`);
    }
    const aliases = placement.aliases as string[];
    const decisions = placement.identity_decision_ids as string[];
    const foundingKey = `application-public-key:${review.public_key}`;
    if (
      placement.registry_state !== "live_identity" ||
      placement.founding_key !== foundingKey ||
      !aliases.includes(review.public_key) ||
      !decisions.includes(review.placement_identity_decision_id) ||
      conflicting.registry_state !== "live_identity"
    ) {
      throw new Error(`${review.subject_id}: accepted placement authority drifted`);
    }
    if (
      review.public_key.includes("unknown") ||
      /(?:^|-)(?:add|modify|remove|suspend|resume|retain|route-wide|active|inactive|current)(?:-|$)/u
        .test(review.public_key)
    ) {
      throw new Error(`${review.subject_id}: mutable semantics leaked into public key`);
    }
    return publicKeyEstablishOperation({
      key_kind: "placement",
      subject_id: review.subject_id,
      owner_intervention_id: null,
      public_key: review.public_key,
      establishment_method: "accepted_review",
      decision_id: decisionId,
      proposal_basis: {
        conflicting_distinct_placement_id:
          review.conflicting_distinct_placement_id,
        immutable_founding_application_public_key: review.public_key,
        placement_founding_key: foundingKey,
        placement_identity_decision_id:
          review.placement_identity_decision_id,
      },
    });
  });
}

function receiptWithoutId(input: {
  generatorCommit: string;
  baselineMigrationReceipt: string;
  prior: readonly PublicKeyOperation[];
  additions: readonly PublicKeyOperation[];
}): Record<string, unknown> {
  const updated = [...input.prior, ...input.additions];
  return {
    schema_version: 1,
    contract_id: "plan-054-reviewed-placement-public-key-establishment-v1",
    plan_id: "plan-054",
    decision_id: decisionId,
    accepted_at: acceptedAt,
    as_of_date: asOfDate,
    generator_commit: input.generatorCommit,
    primary_reviewer: "plan-054-primary-application-fare-collection-01",
    independent_reviewer:
      "plan-054-independent-application-fare-collection-01",
    adjudicator: "plan-054-adjudicator-application-fare-collection-01",
    integrator: "plan-054-single-placement-integrator",
    owner_authorization: {
      semantic_acceptance_approved: true,
      public_identity_establishments_approved: true,
      public_identity_redirects_approved: true,
      authorization_basis:
        "Owner explicitly granted all approvals for Plans 054-057 on 2026-08-01.",
    },
    authorities: authorityPaths.map((path) => ({
      path,
      sha256: sha256(readFileSync(absolute(path))),
    })),
    baseline_prepare: {
      registry_head: baselineHead,
      receipt_id: input.baselineMigrationReceipt,
      input_fingerprint: baselineInputFingerprint,
      eligible_subject_count: 681,
      existing_live_key_count: 577,
      proposed_operation_count: 104,
      requires_review_count: 3,
    },
    prior_registry: {
      operation_count: input.prior.length,
      live_count: replayPublicKeyOperations(input.prior).filter((row) =>
        row.registry_state === "live"
      ).length,
      head: registryHead(input.prior),
    },
    establishments: reviewedPlacements.map((review, index) => ({
      ...review,
      operation_id: input.additions[index]!.operation_id,
      key_kind: "placement",
      immutable_founding_application_public_key: review.public_key,
      placement_founding_key:
        `application-public-key:${review.public_key}`,
      public_key_contains_mutable_action_extent_or_current_state: false,
      rationale:
        "The accepted Plan 054 placement is distinct from the collision peer and retains its immutable founding application public key as its typed placement key.",
    })),
    result_registry_prefix: {
      operation_count: updated.length,
      live_count: replayPublicKeyOperations(updated).filter((row) =>
        row.registry_state === "live"
      ).length,
      head: registryHead(updated),
    },
    existing_public_lookups_changed: false,
    public_identity_redirects: [],
    public_identity_supersessions: [],
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
}

function receipt(input: {
  generatorCommit: string;
  baselineMigrationReceipt: string;
  prior: readonly PublicKeyOperation[];
  additions: readonly PublicKeyOperation[];
}): Record<string, unknown> {
  const withoutId = receiptWithoutId(input);
  return {
    ...withoutId,
    receipt_id: `plan-054-public-key-review:${sha256(
      stableJson(withoutId as JsonValue),
    )}`,
  };
}

function write(): void {
  if (existsSync(absolute(integrationRelative))) {
    throw new Error(`review integration already exists: ${integrationRelative}`);
  }
  const generatorCommit = assertCleanGenerator();
  const baseline = preparePublicKeyMigration({
    asOfDate,
    generatorCommit,
  });
  const reviewSubjects = new Set(reviewedPlacements.map((row) => row.subject_id));
  if (
    baseline.input_fingerprint !== baselineInputFingerprint ||
    baseline.registry_head !== baselineHead ||
    baseline.eligible_subject_count !== 681 ||
    baseline.existing_live_key_count !== 577 ||
    baseline.proposed_operations.length !== 104 ||
    baseline.requires_review_count !== 3 ||
    baseline.requires_review.some((row) =>
      row.key_kind !== "placement" ||
      row.reason !== "public_key_collision" ||
      !reviewSubjects.has(row.subject_id)
    )
  ) {
    throw new Error("Plan 054 public-key collision manifest drifted");
  }
  const prior = readPublicKeyOperations();
  if (prior.length !== 920 || registryHead(prior) !== baselineHead) {
    throw new Error("Plan 053 public-key registry baseline drifted");
  }
  const additions = reviewedOperations();
  const updated = [...prior, ...additions];
  replayPublicKeyOperations(updated);
  const acceptedReceipt = receipt({
    generatorCommit,
    baselineMigrationReceipt: baseline.receipt_id,
    prior,
    additions,
  });
  const receiptId = String(acceptedReceipt.receipt_id);
  const receiptHash = receiptId.split(":")[1];
  if (!receiptHash) throw new Error("review receipt id lacks hash");
  const registryReceiptRelative =
    `${registryDir}/review-receipts/${receiptHash}.json`;
  const campaignReceiptRelative =
    `${campaign}/accepted/public-key-review-receipts/${receiptHash}.json`;
  const receiptBytes = json(acceptedReceipt);
  const building = `${absolute(operationsRelative)}.building`;
  writeFileSync(building, operationsJsonl(updated), "utf8");
  renameSync(building, absolute(operationsRelative));
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
    generator_commit: generatorCommit,
  }, null, 2)}\n`, "utf8");
  const integrationWithoutId = {
    schema_version: 1,
    contract_id: "plan-054-public-key-review-integration-v1",
    plan_id: "plan-054",
    decision_id: decisionId,
    generator_commit: generatorCommit,
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
    result_registry_prefix: {
      operation_count: updated.length,
      head: registryHead(updated),
    },
    accepted_review_establishment_count: additions.length,
    public_identity_redirect_count: 0,
    baseline_migration_receipt_id: baseline.receipt_id,
  };
  const integration = {
    ...integrationWithoutId,
    receipt_id: `plan-054-public-key-review-integration:${sha256(
      stableJson(integrationWithoutId as JsonValue),
    )}`,
  };
  mkdirSync(dirname(absolute(integrationRelative)), { recursive: true });
  writeFileSync(absolute(integrationRelative), json(integration), "utf8");
}

function check(): void {
  if (!existsSync(absolute(integrationRelative))) {
    throw new Error(`review integration is missing: ${integrationRelative}`);
  }
  const integration = JSON.parse(
    readFileSync(absolute(integrationRelative), "utf8"),
  ) as {
    contract_id: string;
    generator_commit: string;
    registry_receipt: { path: string; sha256: string };
    campaign_receipt: { path: string; sha256: string };
    prior_registry: { operation_count: number; head: string };
    result_registry_prefix: { operation_count: number; head: string };
    accepted_review_establishment_count: number;
    public_identity_redirect_count: number;
    baseline_migration_receipt_id: string;
  };
  if (
    integration.contract_id !==
      "plan-054-public-key-review-integration-v1" ||
    integration.prior_registry.operation_count !== 920 ||
    integration.prior_registry.head !== baselineHead ||
    integration.accepted_review_establishment_count !== 3 ||
    integration.public_identity_redirect_count !== 0 ||
    !integration.baseline_migration_receipt_id.startsWith(
      "public-key-migration:",
    )
  ) {
    throw new Error("Plan 054 public-key review integration is invalid");
  }
  const operations = readPublicKeyOperations();
  const prior = operations.slice(0, integration.prior_registry.operation_count);
  const additions = operations.slice(
    integration.prior_registry.operation_count,
    integration.result_registry_prefix.operation_count,
  );
  const expectedAdditions = reviewedOperations();
  if (
    registryHead(prior) !== integration.prior_registry.head ||
    additions.length !== 3 ||
    stableJson(additions as unknown as JsonValue) !==
      stableJson(expectedAdditions as unknown as JsonValue) ||
    registryHead([...prior, ...additions]) !==
      integration.result_registry_prefix.head
  ) {
    throw new Error("Plan 054 reviewed public-key operation prefix drifted");
  }
  const expectedReceipt = receipt({
    generatorCommit: integration.generator_commit,
    baselineMigrationReceipt: integration.baseline_migration_receipt_id,
    prior,
    additions,
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
      throw new Error(`Plan 054 reviewed public-key receipt drifted: ${addressed.path}`);
    }
  }
  replayPublicKeyOperations(operations);
}

const mode = process.argv[2];
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error(
    "usage: bun scripts/apply-plan054-reviewed-placement-public-keys.ts --write|--check",
  );
}
if (mode === "--write") write();
else check();
console.log(
  `Plan 054 reviewed placement public keys ${
    mode === "--write" ? "applied" : "verified"
  }: 3 accepted distinct placement keys.`,
);
