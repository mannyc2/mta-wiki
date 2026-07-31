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
  publicKeyRedirectOperation,
  publicKeySupersedeOperation,
  readPublicKeyOperations,
  replayPublicKeyOperations,
  type PublicKeyOperation,
} from "../packages/pipeline/src/materialize/resolved-transit-public-keys";

const batchId = "w2-bus-priority-pending-01";
const decisionId =
  "plan-052:w2-bus-priority-pending-01:route-subject-continuity-v1";
const registryDir =
  "data/resolved-transit-public/public-key-operations/v1";
const operationsRelative = `${registryDir}/operations.jsonl`;
const manifestRelative = `${registryDir}/manifest.json`;
const receiptRelative =
  `${registryDir}/continuity-receipts/plan-052-bus01-route-subject-continuity-v1.json`;
const integrationRelative =
  "data/operational-episode-resolution/campaigns/plan-052/integration-receipts/w2-bus-priority-pending-01-positive-occurrences-v1.json";
const supplementRelative =
  "data/operational-episode-resolution/campaigns/plan-052/evidence-supplements/w2-bus01-schema-resolution-v1.json";

const continuities = [
  {
    prior_subject_id: "route_q52-sbs-queens",
    subject_id: "route_q52-ltd-woodhaven-2014",
    public_key: "q52-sbs",
    temporary_key: "q52-sbs-plan052-transition",
    gtfs_route_id: "Q52+",
    route_display_name: "Q52 Limited",
  },
  {
    prior_subject_id: "route_q53-sbs-ace",
    subject_id: "route_q53-ltd-woodhaven-2014",
    public_key: "q53-sbs",
    temporary_key: "q53-sbs-plan052-transition",
    gtfs_route_id: "Q53+",
    route_display_name: "Q53 Limited",
  },
  {
    prior_subject_id: "route_m34-local-2011",
    subject_id: "route_m34-sbs",
    public_key: "m34-sbs",
    temporary_key: "m34-sbs-plan052-transition",
    gtfs_route_id: "M34+",
    route_display_name: "M34 SBS",
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
  const priorRegistry = replayPublicKeyOperations(prior);
  const liveBySubject = new Map(
    priorRegistry
      .filter((entry) => entry.registry_state === "live")
      .map((entry) => [`${entry.key_kind}|${entry.subject_id}`, entry]),
  );
  const additions: PublicKeyOperation[] = [];
  for (const [index, continuity] of continuities.entries()) {
    const priorEntry = liveBySubject.get(
      `route|${continuity.prior_subject_id}`,
    );
    if (!priorEntry || priorEntry.public_key !== continuity.public_key) {
      throw new Error(
        `stale prior route public-key owner: ${continuity.prior_subject_id}`,
      );
    }
    if (liveBySubject.has(`route|${continuity.subject_id}`)) {
      throw new Error(
        `replacement route public-key subject already exists: ${continuity.subject_id}`,
      );
    }
    additions.push(
      publicKeyEstablishOperation({
        key_kind: "route",
        subject_id: continuity.subject_id,
        owner_intervention_id: null,
        public_key: continuity.temporary_key,
        establishment_method: "accepted_review",
        decision_id: decisionId,
        proposal_basis: {
          continuity_from_subject_id: continuity.prior_subject_id,
          gtfs_route_id: continuity.gtfs_route_id,
          route_display_name: continuity.route_display_name,
        },
      }),
      publicKeyRedirectOperation({
        key_kind: "route",
        subject_id: continuity.prior_subject_id,
        redirect_subject_id: continuity.subject_id,
        decision_id: decisionId,
        issued_at: `2026-07-30T19:0${index}:01.000Z`,
        rationale:
          "Preserve the established route public lookup while moving ownership to the exact durable route subject used by the accepted Plan 052 occurrence.",
      }),
      publicKeySupersedeOperation({
        key_kind: "route",
        subject_id: continuity.subject_id,
        prior_public_key: continuity.temporary_key,
        public_key: continuity.public_key,
        decision_id: decisionId,
        issued_at: `2026-07-30T19:0${index}:02.000Z`,
        rationale:
          "Restore the established public route slug on the replacement durable subject after the verified subject redirect.",
      }),
    );
  }
  const updated = [...prior, ...additions];
  replayPublicKeyOperations(updated);
  const operations = operationsJsonl(updated);
  const head = registryHead(updated);
  const authorityPaths = [integrationRelative, supplementRelative];
  const receipt = json({
    schema_version: 1,
    contract_id: "plan-052-public-key-subject-continuity-v1",
    plan_id: "plan-052",
    batch_id: batchId,
    decision_id: decisionId,
    applied_at: "2026-07-30T19:05:00.000Z",
    integrator: "plan-052-single-frontier-integrator",
    authorities: authorityPaths.map((path) => ({
      path,
      sha256: sha256(readFileSync(absolute(path))),
    })),
    prior_registry: {
      operation_count: prior.length,
      head: registryHead(prior),
    },
    continuities: continuities.map((continuity, index) => ({
      ...continuity,
      establish_operation_id: additions[index * 3]!.operation_id,
      redirect_operation_id: additions[index * 3 + 1]!.operation_id,
      supersede_operation_id: additions[index * 3 + 2]!.operation_id,
      stable_public_lookup_preserved: true,
    })),
    result_registry: {
      operation_count: updated.length,
      head,
    },
    canonical_observations_changed: false,
    historical_public_key_operations_changed: false,
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
  return { prior, additions, operations, manifest, receipt };
}

function write(): void {
  if (existsSync(absolute(receiptRelative))) {
    throw new Error(`continuity receipt already exists: ${receiptRelative}`);
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
    throw new Error(`continuity receipt is missing: ${receiptRelative}`);
  }
  const all = readPublicKeyOperations(repoRoot);
  const receipt = JSON.parse(
    readFileSync(absolute(receiptRelative), "utf8"),
  ) as {
    prior_registry: { operation_count: number };
  };
  const prior = all.slice(0, receipt.prior_registry.operation_count);
  const additions = all.slice(receipt.prior_registry.operation_count);
  const currentOperations = readFileSync(absolute(operationsRelative), "utf8");
  const expectedResult = expected(prior);
  if (
    stableJson(additions as unknown as JsonValue) !==
      stableJson(expectedResult.additions as unknown as JsonValue) ||
    currentOperations !== expectedResult.operations ||
    readFileSync(absolute(receiptRelative), "utf8") !== expectedResult.receipt
  ) {
    throw new Error("Plan 052 Bus01 route public-key continuity drifted");
  }
  const manifest = JSON.parse(
    readFileSync(absolute(manifestRelative), "utf8"),
  ) as { head: string; operation_count: number };
  if (
    manifest.head !== registryHead(all) ||
    manifest.operation_count !== all.length
  ) {
    throw new Error("Plan 052 Bus01 route public-key manifest drifted");
  }
  replayPublicKeyOperations(all);
}

const mode = process.argv[2];
if (
  (mode !== "--write" && mode !== "--check") ||
  process.argv.length !== 3
) {
  throw new Error(
    "usage: bun scripts/apply-plan052-bus01-route-public-key-continuity.ts --write|--check",
  );
}
if (mode === "--write") write();
else check();
console.log(
  `Plan 052 Bus01 route public-key continuity ${
    mode === "--write" ? "applied" : "verified"
  }: ${continuities.length} redirects, ${continuities.length} stable public slugs.`,
);
