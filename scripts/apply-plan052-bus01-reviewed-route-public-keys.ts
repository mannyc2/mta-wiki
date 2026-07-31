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
  publicKeyEstablishOperation,
  readPublicKeyOperations,
  replayPublicKeyOperations,
  type PublicKeyOperation,
} from "../packages/pipeline/src/materialize/resolved-transit-public-keys";

const registryDir =
  "data/resolved-transit-public/public-key-operations/v1";
const operationsRelative = `${registryDir}/operations.jsonl`;
const manifestRelative = `${registryDir}/manifest.json`;
const receiptRelative =
  `${registryDir}/review-receipts/plan-052-bus01-distinct-route-public-keys-v1.json`;
const integrationRelative =
  "data/operational-episode-resolution/campaigns/plan-052/integration-receipts/w2-bus-priority-pending-01-positive-occurrences-v1.json";
const supplementRelative =
  "data/operational-episode-resolution/campaigns/plan-052/evidence-supplements/w2-bus01-schema-resolution-v1.json";
const repairRelative =
  `${registryDir}/continuity-receipts/plan-052-bus01-route-subject-continuity-rejected-repair-v1.json`;
const decisionId =
  "plan-052:w2-bus-priority-pending-01:distinct-route-public-keys-v1";

const reviewedRoutes = [
  {
    subject_id: "route_q52-ltd-woodhaven-2014",
    public_key: "q52-limited",
    gtfs_route_id: "Q52+",
    route_display_name: "Q52 LTD",
    distinction:
      "Historical limited-stop route subject; distinct from the later Q52 SBS subject that retains q52-sbs.",
  },
  {
    subject_id: "route_q53-ltd-woodhaven-2014",
    public_key: "q53-limited",
    gtfs_route_id: "Q53+",
    route_display_name: "Q53 LTD",
    distinction:
      "Historical limited-stop route subject; distinct from the later Q53 SBS subject that retains q53-sbs.",
  },
  {
    subject_id: "route_m34-sbs",
    public_key: "m34-select-bus-service",
    gtfs_route_id: "M34+",
    route_display_name: "M34 SBS",
    distinction:
      "Select Bus Service route subject; distinct from the October 2011 pre-renaming M34 historical subject whose established lookup remains unchanged.",
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
  return operations
    .map((operation) => stableJson(operation as unknown as JsonValue))
    .join("\n") + "\n";
}

function registryHead(operations: readonly PublicKeyOperation[]): string {
  return sha256(
    operations
      .map((operation) => stableJson(operation as unknown as JsonValue))
      .join("\n"),
  );
}

function expected(priorInput?: readonly PublicKeyOperation[]): {
  prior: PublicKeyOperation[];
  additions: PublicKeyOperation[];
  operations: string;
  manifest: string;
  receipt: string;
} {
  const prior = priorInput
    ? [...priorInput]
    : readPublicKeyOperations(repoRoot);
  const additions = reviewedRoutes.map((route) =>
    publicKeyEstablishOperation({
      key_kind: "route",
      subject_id: route.subject_id,
      owner_intervention_id: null,
      public_key: route.public_key,
      establishment_method: "accepted_review",
      decision_id: decisionId,
      proposal_basis: {
        distinction: route.distinction,
        gtfs_route_id: route.gtfs_route_id,
        route_display_name: route.route_display_name,
      },
    })
  );
  const updated = [...prior, ...additions];
  replayPublicKeyOperations(updated);
  const head = registryHead(updated);
  const authorityPaths = [
    integrationRelative,
    supplementRelative,
    repairRelative,
  ];
  const receipt = json({
    schema_version: 1,
    contract_id: "plan-052-reviewed-public-key-establishment-v1",
    plan_id: "plan-052",
    batch_id: "w2-bus-priority-pending-01",
    decision_id: decisionId,
    accepted_at: "2026-07-30T19:15:00.000Z",
    integrator: "plan-052-single-frontier-integrator",
    authorities: authorityPaths.map((path) => ({
      path,
      sha256: sha256(readFileSync(absolute(path))),
    })),
    prior_registry: {
      operation_count: prior.length,
      head: registryHead(prior),
    },
    establishments: reviewedRoutes.map((route, index) => ({
      ...route,
      operation_id: additions[index]!.operation_id,
      public_key_contains_mutable_action_or_extent_claim: false,
    })),
    result_registry: {
      operation_count: updated.length,
      head,
    },
    existing_public_lookups_changed: false,
    canonical_observations_changed: false,
    publication_or_release_authorized: false,
  });
  const manifest = `${JSON.stringify({
    schema_version: 1,
    contract_id: "resolved-transit-public-key-registry-v1",
    head,
    operation_count: updated.length,
    receipt_id: decisionId,
    generator_commit: "0a0fb2c1ee09f661b77aaa854fe9b75581203722",
  }, null, 2)}\n`;
  return {
    prior,
    additions,
    operations: operationsJsonl(updated),
    manifest,
    receipt,
  };
}

function write(): void {
  if (existsSync(absolute(receiptRelative))) {
    throw new Error(`review receipt already exists: ${receiptRelative}`);
  }
  const result = expected();
  const building = `${absolute(operationsRelative)}.building`;
  writeFileSync(building, result.operations, "utf8");
  renameSync(building, absolute(operationsRelative));
  mkdirSync(dirname(absolute(receiptRelative)), { recursive: true });
  writeFileSync(absolute(receiptRelative), result.receipt, "utf8");
  writeFileSync(absolute(manifestRelative), result.manifest, "utf8");
}

function check(): void {
  if (!existsSync(absolute(receiptRelative))) {
    throw new Error(`review receipt is missing: ${receiptRelative}`);
  }
  const all = readPublicKeyOperations(repoRoot);
  const receipt = JSON.parse(
    readFileSync(absolute(receiptRelative), "utf8"),
  ) as { prior_registry: { operation_count: number } };
  const prior = all.slice(0, receipt.prior_registry.operation_count);
  const additions = all.slice(receipt.prior_registry.operation_count);
  const expectedResult = expected(prior);
  if (
    stableJson(additions as unknown as JsonValue) !==
      stableJson(expectedResult.additions as unknown as JsonValue) ||
    readFileSync(absolute(operationsRelative), "utf8") !==
      expectedResult.operations ||
    readFileSync(absolute(receiptRelative), "utf8") !== expectedResult.receipt ||
    readFileSync(absolute(manifestRelative), "utf8") !==
      expectedResult.manifest
  ) {
    throw new Error("Plan 052 Bus01 reviewed route public keys drifted");
  }
}

const mode = process.argv[2];
if (
  (mode !== "--write" && mode !== "--check") ||
  process.argv.length !== 3
) {
  throw new Error(
    "usage: bun scripts/apply-plan052-bus01-reviewed-route-public-keys.ts --write|--check",
  );
}
if (mode === "--write") write();
else check();
console.log(
  `Plan 052 Bus01 reviewed route public keys ${
    mode === "--write" ? "applied" : "verified"
  }: ${reviewedRoutes.length} distinct route subjects.`,
);
