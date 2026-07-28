import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  loadOperationalOccurrenceIdentityRegistry,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity";
import {
  migrateOperationalOccurrenceIdentityV1Operations,
  operationalOccurrenceIdentityRegistryV2Jsonl,
  replayOperationalOccurrenceIdentityOperations,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity-operations";
import {
  migrateOperationalOccurrenceReviewDecisionV2,
  parseOperationalOccurrenceReviewSnapshot,
} from "../packages/pipeline/src/materialize/operational-occurrence-review";
import {
  parseOperationalOccurrencesJsonl,
} from "../packages/pipeline/src/materialize/operational-occurrences";
import {
  loadOperationalProjectionRetirements,
} from "../packages/pipeline/src/materialize/operational-projection-retirements";

const RELEASE_DIR = "data/exports/releases/v1-rc28";
const OPERATIONS_DIR = "data/operational-occurrence-identities/operations";
const REGISTRY_V2_PATH =
  "data/operational-occurrence-identities/registry-v2.jsonl";
const ACCEPTED_V2_DIR =
  "data/operational-occurrence-review/accepted-v2/decisions";
const MIGRATION_DIR =
  "data/operational-occurrence-review/migrations/v1-to-v2";
const UNRESOLVED_DIR = `${MIGRATION_DIR}/unresolved`;
const SUMMARY_PATH = `${MIGRATION_DIR}/summary.json`;
const RECEIPT_PATH = `${MIGRATION_DIR}/receipt.json`;

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: JsonValue): string {
  return `${stableJson(value)}\n`;
}

function pin(path: string) {
  const bytes = readFileSync(join(repoRoot, path));
  return { path, sha256: sha256(bytes), bytes: bytes.length };
}

function expectedMigrationFiles(): Map<string, string> {
  const files = new Map<string, string>();
  const identities = loadOperationalOccurrenceIdentityRegistry();
  if (identities.length !== 135) {
    throw new Error(`Plan 045 migration requires exactly 135 v1 identities; found ${identities.length}`);
  }
  const operations = migrateOperationalOccurrenceIdentityV1Operations(identities);
  const registryV2 = replayOperationalOccurrenceIdentityOperations(operations);
  if (
    registryV2.map((entry) => entry.occurrence_id).join("\n") !==
    identities.map((entry) => entry.occurrence_id).join("\n")
  ) {
    throw new Error("Plan 045 migration changed the durable occurrence id set");
  }
  for (const operation of operations) {
    files.set(
      `${OPERATIONS_DIR}/${operation.operation_id}.json`,
      json(operation as unknown as JsonValue),
    );
  }
  files.set(REGISTRY_V2_PATH, operationalOccurrenceIdentityRegistryV2Jsonl(registryV2));

  const occurrencePath = `${RELEASE_DIR}/operational_occurrences.jsonl`;
  const reviewPath =
    `${RELEASE_DIR}/operational_occurrence_review_decisions.json`;
  const rows = parseOperationalOccurrencesJsonl(
    readFileSync(join(repoRoot, occurrencePath), "utf8"),
  );
  const legacySnapshot = parseOperationalOccurrenceReviewSnapshot(
    JSON.parse(readFileSync(join(repoRoot, reviewPath), "utf8")) as unknown,
  );
  const legacyByOccurrence = new Map(
    legacySnapshot.decisions.map((decision) => [decision.occurrence_id, decision]),
  );
  const originalDecisionDir =
    "data/operational-occurrence-review/accepted/decisions";
  const originalDecisionPaths = new Map(
    readdirSync(join(repoRoot, originalDecisionDir))
      .filter((name) => name.endsWith(".json"))
      .map((name) => [
        basename(name, ".json"),
        `${originalDecisionDir}/${name}`,
      ]),
  );

  const migratedIds: string[] = [];
  const unresolvedPackets = new Map<string, JsonValue>();
  const decisionReceipts: JsonValue[] = [];
  for (const row of rows) {
    const legacy = legacyByOccurrence.get(row.occurrence_id);
    if (!legacy) throw new Error(`release occurrence ${row.occurrence_id} has no legacy review`);
    try {
      const decision = migrateOperationalOccurrenceReviewDecisionV2(row, legacy);
      const outputPath = `${ACCEPTED_V2_DIR}/${decision.decision_id}.json`;
      files.set(outputPath, json(decision as unknown as JsonValue));
      migratedIds.push(row.occurrence_id);
      const originalPath = originalDecisionPaths.get(decision.decision_id);
      decisionReceipts.push({
        occurrence_id: row.occurrence_id,
        decision_id: decision.decision_id,
        output_path: outputPath,
        output_sha256: sha256(files.get(outputPath)!),
        original_source: originalPath
          ? pin(originalPath)
          : {
              ...pin(reviewPath),
              decision_id: decision.decision_id,
              source_kind: "released_review_projection",
            },
      } as unknown as JsonValue);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("requires explicit phase application review")) throw error;
      unresolvedPackets.set(row.occurrence_id, {
        schema_version: 1,
        packet_id: `occurrence-review-packet:${row.occurrence_id}`,
        occurrence_id: row.occurrence_id,
        identity_state: "active",
        reason_code: "phase_application_ambiguous",
        rationale:
          "The released occurrence has multiple reviewed phase records, but no accepted artifact assigns one exact phase to each route-treatment application.",
        founding_key: row.founding_key,
        source_decision_id: legacy.decision_id,
        phase_record_ids: row.phase_record_ids,
        route_record_ids: row.routes.map((route) => route.route_record_id).sort(),
        treatment_record_ids:
          row.treatment.kind === "atomic"
            ? [row.treatment.member.treatment_record_id]
            : row.treatment.members.map((member) => member.treatment_record_id).sort(),
        required_review_scope: "full_episode_application",
        source_pins: [pin(occurrencePath), pin(reviewPath)],
      } as unknown as JsonValue);
    }
  }

  const rowIds = new Set(rows.map((row) => row.occurrence_id));
  const retirements = loadOperationalProjectionRetirements(repoRoot);
  const retirementByOccurrence = new Map(
    retirements.flatMap((retirement) =>
      retirement.occurrence_review_decisions.map((decision) => [
        decision.occurrence_id,
        {
          retirement_id: retirement.retirement_id,
          reason_code: decision.reason_code,
          rationale: retirement.rationale,
          artifact_path: retirement.artifact_path,
          source_sha256: retirement.source_sha256,
        },
      ] as const)
    ),
  );
  for (const identity of registryV2) {
    if (rowIds.has(identity.occurrence_id)) continue;
    const retirement = retirementByOccurrence.get(identity.occurrence_id);
    if (!retirement) {
      throw new Error(
        `active identity ${identity.occurrence_id} is absent from the release and has no accepted retirement packet`,
      );
    }
    unresolvedPackets.set(identity.occurrence_id, {
      schema_version: 1,
      packet_id: `occurrence-review-packet:${identity.occurrence_id}`,
      occurrence_id: identity.occurrence_id,
      identity_state: "active",
      reason_code: "active_v1_projection_retired",
      rationale: retirement.rationale,
      founding_key: identity.current_founding_key,
      source_decision_id: identity.decision_id,
      required_review_scope: "full_episode_application",
      accepted_retirement: retirement,
    } as unknown as JsonValue);
  }

  for (const [occurrenceId, packet] of [...unresolvedPackets.entries()].sort()) {
    files.set(`${UNRESOLVED_DIR}/${occurrenceId}.json`, json(packet));
  }
  const publishableIds = [...migratedIds].sort();
  const unresolvedIds = [...unresolvedPackets.keys()].sort();
  const activeIds = registryV2
    .filter((entry) => entry.state === "active")
    .map((entry) => entry.occurrence_id)
    .sort();
  if (
    new Set([...publishableIds, ...unresolvedIds]).size !== activeIds.length ||
    [...publishableIds, ...unresolvedIds].sort().join("\n") !== activeIds.join("\n")
  ) {
    throw new Error("active identity partition is not disjoint and exhaustive");
  }
  const summary = {
    schema_version: 1,
    migration_id: "operational-occurrence-v1-to-v2",
    source_release_id: "v1-rc28",
    active_v1_identity_count: activeIds.length,
    preserved_identity_count: registryV2.length,
    migrated_losslessly_count: publishableIds.length,
    requires_review_count: unresolvedIds.length,
    invented_merge_operation_count: 0,
    invented_split_operation_count: 0,
    unsafe_cross_product_count: 0,
    publishable_reviewed_occurrence_ids: publishableIds,
    unresolved_active_identity_ids: unresolvedIds,
  };
  files.set(SUMMARY_PATH, json(summary as unknown as JsonValue));

  const receipt = {
    schema_version: 1,
    receipt_id: "operational-occurrence-v1-to-v2",
    review_method: "lossless_v1_migration",
    source_pins: [
      pin("data/operational-occurrence-identities/registry.jsonl"),
      pin(occurrencePath),
      pin(reviewPath),
    ],
    operation_count: operations.length,
    registry_v2_sha256: sha256(files.get(REGISTRY_V2_PATH)!),
    migrated_decision_count: publishableIds.length,
    unresolved_packet_count: unresolvedIds.length,
    summary_sha256: sha256(files.get(SUMMARY_PATH)!),
    decision_receipts: decisionReceipts.sort((left, right) =>
      String((left as Record<string, JsonValue>).occurrence_id).localeCompare(
        String((right as Record<string, JsonValue>).occurrence_id),
      )
    ),
  };
  files.set(RECEIPT_PATH, json(receipt as unknown as JsonValue));
  return files;
}

function managedFiles(): string[] {
  const roots = [
    OPERATIONS_DIR,
    ACCEPTED_V2_DIR,
    MIGRATION_DIR,
  ];
  const result = [REGISTRY_V2_PATH].filter((path) => existsSync(join(repoRoot, path)));
  const visit = (relativeDir: string) => {
    const dir = join(repoRoot, relativeDir);
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = `${relativeDir}/${name.name}`;
      if (name.isDirectory()) visit(path);
      else if (name.isFile()) result.push(path);
      else throw new Error(`migration output contains unsupported entry: ${path}`);
    }
  };
  for (const root of roots) visit(root);
  return result.sort();
}

export function migrateOperationalOccurrenceIdentityV2(
  mode: "write" | "check",
): { file_count: number; migrated_count: number; unresolved_count: number } {
  const expected = expectedMigrationFiles();
  if (mode === "write") {
    const existing = managedFiles();
    if (existing.length > 0) {
      throw new Error(`migration outputs already exist; use --check:\n${existing.join("\n")}`);
    }
    for (const [path, content] of expected) {
      const absolute = join(repoRoot, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content, "utf8");
    }
  } else {
    const actual = managedFiles();
    const expectedPaths = [...expected.keys()].sort();
    if (actual.join("\n") !== expectedPaths.join("\n")) {
      throw new Error("occurrence identity migration output set is stale");
    }
    for (const [path, content] of expected) {
      if (readFileSync(join(repoRoot, path), "utf8") !== content) {
        throw new Error(`occurrence identity migration output is stale: ${path}`);
      }
    }
  }
  const summary = JSON.parse(expected.get(SUMMARY_PATH)!) as {
    migrated_losslessly_count: number;
    requires_review_count: number;
  };
  return {
    file_count: expected.size,
    migrated_count: summary.migrated_losslessly_count,
    unresolved_count: summary.requires_review_count,
  };
}

if (import.meta.main) {
  const write = process.argv.includes("--write");
  const check = process.argv.includes("--check");
  if (Number(write) + Number(check) !== 1) {
    throw new Error("Choose exactly one of --write and --check");
  }
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--write" && arg !== "--check");
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  const result = migrateOperationalOccurrenceIdentityV2(write ? "write" : "check");
  console.log(
    `Occurrence identity v2 migration ${write ? "written" : "verified"}: ` +
      `${result.migrated_count} publishable, ${result.unresolved_count} unresolved, ` +
      `${result.file_count} files.`,
  );
}
