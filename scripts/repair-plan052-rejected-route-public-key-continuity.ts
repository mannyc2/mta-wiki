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
  readPublicKeyOperations,
  replayPublicKeyOperations,
  type PublicKeyOperation,
} from "../packages/pipeline/src/materialize/resolved-transit-public-keys";

const registryDir =
  "data/resolved-transit-public/public-key-operations/v1";
const operationsRelative = `${registryDir}/operations.jsonl`;
const manifestRelative = `${registryDir}/manifest.json`;
const rejectedReceiptRelative =
  `${registryDir}/continuity-receipts/plan-052-bus01-route-subject-continuity-v1.json`;
const repairReceiptRelative =
  `${registryDir}/continuity-receipts/plan-052-bus01-route-subject-continuity-rejected-repair-v1.json`;
const priorMigrationReceiptRelative =
  `${registryDir}/migration-receipts/2ab19719140929e8aaa1cf907a92bb9b48c0d35e80fd043a2a824b358bf4bf0a.json`;

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

function expected(): {
  priorOperations: PublicKeyOperation[];
  restoredOperations: string;
  restoredManifest: string;
  repairReceipt: string;
} {
  const rejectedReceiptBytes = readFileSync(
    absolute(rejectedReceiptRelative),
  );
  const rejectedReceipt = JSON.parse(rejectedReceiptBytes.toString("utf8")) as {
    decision_id: string;
    prior_registry: { operation_count: number; head: string };
    result_registry: { operation_count: number; head: string };
  };
  const currentOperations = readPublicKeyOperations(repoRoot);
  if (
    currentOperations.length !== rejectedReceipt.result_registry.operation_count ||
    registryHead(currentOperations) !== rejectedReceipt.result_registry.head
  ) {
    throw new Error("rejected continuity operation state drifted");
  }
  const priorOperations = currentOperations.slice(
    0,
    rejectedReceipt.prior_registry.operation_count,
  );
  const rejectedOperations = currentOperations.slice(
    rejectedReceipt.prior_registry.operation_count,
  );
  if (
    registryHead(priorOperations) !== rejectedReceipt.prior_registry.head ||
    rejectedOperations.length === 0
  ) {
    throw new Error("rejected continuity prior partition drifted");
  }
  replayPublicKeyOperations(priorOperations);
  const priorMigrationReceiptBytes = readFileSync(
    absolute(priorMigrationReceiptRelative),
  );
  const priorMigrationReceipt = JSON.parse(
    priorMigrationReceiptBytes.toString("utf8"),
  ) as { receipt_id: string; generator_commit: string };
  const restoredOperations = operationsJsonl(priorOperations);
  const restoredManifest = `${JSON.stringify({
    schema_version: 1,
    contract_id: "resolved-transit-public-key-registry-v1",
    head: rejectedReceipt.prior_registry.head,
    operation_count: priorOperations.length,
    receipt_id: priorMigrationReceipt.receipt_id,
    generator_commit: priorMigrationReceipt.generator_commit,
  }, null, 2)}\n`;
  const currentOperationsBytes = readFileSync(absolute(operationsRelative));
  const currentManifestBytes = readFileSync(absolute(manifestRelative));
  const repairReceipt = json({
    schema_version: 1,
    contract_id: "plan-052-rejected-public-key-operation-repair-v1",
    plan_id: "plan-052",
    batch_id: "w2-bus-priority-pending-01",
    repaired_at: "2026-07-30T19:12:00.000Z",
    integrator: "plan-052-single-frontier-integrator",
    rejected_decision_id: rejectedReceipt.decision_id,
    rejected_receipt: {
      path: rejectedReceiptRelative,
      sha256: sha256(rejectedReceiptBytes),
    },
    prior_migration_receipt: {
      path: priorMigrationReceiptRelative,
      sha256: sha256(priorMigrationReceiptBytes),
    },
    authoritative_rejection:
      "preparePublicKeyMigration rejected the operation result before public display or a verified registry checkpoint because route_m34-local-2011 remained an eligible historical subject and had been redirected. The same eligibility defect also applies to the Q52 and Q53 historical/current route pairs.",
    rejected_state: {
      operations_sha256: sha256(currentOperationsBytes),
      manifest_sha256: sha256(currentManifestBytes),
      operation_count: currentOperations.length,
      head: registryHead(currentOperations),
      appended_operations: rejectedOperations.map((operation) => ({
        operation_id: operation.operation_id,
        operation_sha256: sha256(
          stableJson(operation as unknown as JsonValue),
        ),
      })),
    },
    restored_preaccept_state: {
      operations_sha256: sha256(restoredOperations),
      manifest_sha256: sha256(restoredManifest),
      operation_count: priorOperations.length,
      head: registryHead(priorOperations),
    },
    accepted_checkpoint_preceded_repair: false,
    historical_accepted_operation_bytes_changed: false,
    canonical_observations_changed: false,
    publication_or_release_authorized: false,
  });
  return {
    priorOperations,
    restoredOperations,
    restoredManifest,
    repairReceipt,
  };
}

function write(): void {
  if (existsSync(absolute(repairReceiptRelative))) {
    throw new Error(`repair receipt already exists: ${repairReceiptRelative}`);
  }
  const result = expected();
  mkdirSync(dirname(absolute(repairReceiptRelative)), { recursive: true });
  writeFileSync(absolute(repairReceiptRelative), result.repairReceipt, "utf8");
  const building = `${absolute(operationsRelative)}.building`;
  writeFileSync(building, result.restoredOperations, "utf8");
  renameSync(building, absolute(operationsRelative));
  writeFileSync(absolute(manifestRelative), result.restoredManifest, "utf8");
}

const mode = process.argv[2];
if (mode !== "--write" || process.argv.length !== 3) {
  throw new Error(
    "usage: bun scripts/repair-plan052-rejected-route-public-key-continuity.ts --write",
  );
}
write();
console.log(
  "Restored the verified preaccept public-key registry after preserving the rejected Plan 052 route-continuity operation hashes.",
);
