import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";
import type { InterventionLifecycleAssertion } from "./intervention-lifecycle.js";

const CAMPAIGN = join("data", "intervention-lifecycle", "campaigns", "plan-055");
const EXPECTED_CANDIDATE_PARTITION =
  "6c5daf5222ce48a00c69c267b1f49460a2ea804f02bffff765fbb826fa507b02";
const EXPECTED_AS_OF_DATE = "2026-07-27";
const EXPECTED_INTEGRATION_RECEIPT_ID =
  "plan-055-integration:3e5bdf966480542cd9075096ef8b0807b3ba99e94c73280cbb183ce4746ee877";
const EXPECTED_COMPLETION_RECEIPT_ID =
  "plan-055-completion:347736366cc08cb774290c4b96df5c2c8ae63a38ff176a7873177d6c4a051de1";

type ObjectValue = Record<string, unknown>;

function object(value: unknown, path: string): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as ObjectValue;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.length) throw new Error(`${path} must be a string`);
  return value;
}

function number(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${path} must be a non-negative integer`);
  }
  return value as number;
}

function canonical(value: unknown): string {
  return stableJson(value as JsonValue);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonl(values: readonly unknown[]): string {
  return values.length ? `${values.map(canonical).join("\n")}\n` : "";
}

function contentPartition(values: readonly unknown[]): string {
  return sha256(jsonl([...values].sort((a, b) => canonical(a).localeCompare(canonical(b)))));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function readJsonl(path: string): unknown[] {
  const content = readFileSync(path, "utf8").trim();
  return content ? content.split("\n").map((line) => JSON.parse(line) as unknown) : [];
}

function without(value: ObjectValue, field: string): ObjectValue {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function pick(value: ObjectValue, fields: readonly string[], path: string): ObjectValue {
  for (const field of fields) {
    if (!(field in value)) throw new Error(`${path}.${field} is missing`);
  }
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

function requireEqual(actual: unknown, expected: unknown, path: string): void {
  if (canonical(actual) !== canonical(expected)) throw new Error(`${path} mismatch`);
}

/**
 * Verifies that production lifecycle assertions remain attached to the exact
 * Plan 055 dual-review campaign, terminal decision receipts, adjudications,
 * and dated snapshot portfolio that authorized them.
 */
export function validatePlan055LifecycleReviewProvenance(
  rootDir: string,
  assertions: readonly InterventionLifecycleAssertion[],
): { completion_receipt_id: string; assertion_partition_sha256: string } {
  const campaign = join(rootDir, CAMPAIGN);
  const accepted = join(campaign, "accepted");
  const completionPath = join(accepted, "completion-receipt.json");
  const integrationPath = join(accepted, "integration-receipt.json");
  const completion = object(readJson(completionPath), completionPath);
  const integration = object(readJson(integrationPath), integrationPath);

  requireEqual(completion.contract_id, "plan-055-lifecycle-completion-receipt-v1", "completion contract");
  requireEqual(completion.plan_id, "plan-055", "completion plan");
  requireEqual(completion.production_as_of_date, EXPECTED_AS_OF_DATE, "production as-of date");
  requireEqual(completion.publication_authorized_or_performed, false, "Plan 055 publication authority");
  requireEqual(integration.contract_id, "plan-055-lifecycle-integration-receipt-v1", "integration contract");
  requireEqual(integration.plan_id, "plan-055", "integration plan");
  requireEqual(integration.canonical_observations_edited, false, "canonical observation immutability");
  requireEqual(integration.immutable_spec_edited, false, "immutable spec immutability");

  const integrationReceiptId = string(integration.receipt_id, "integration receipt id");
  requireEqual(integrationReceiptId, EXPECTED_INTEGRATION_RECEIPT_ID, "frozen integration receipt id");
  requireEqual(
    integrationReceiptId,
    `plan-055-integration:${sha256(canonical(without(integration, "receipt_id")))}`,
    "integration receipt id",
  );
  const completionReceiptId = string(completion.receipt_id, "completion receipt id");
  requireEqual(completionReceiptId, EXPECTED_COMPLETION_RECEIPT_ID, "frozen completion receipt id");
  requireEqual(
    completionReceiptId,
    `plan-055-completion:${sha256(canonical(without(completion, "receipt_id")))}`,
    "completion receipt id",
  );
  const integrationReceipt = object(completion.integration_receipt, "completion.integration_receipt");
  requireEqual(integrationReceipt.path, `${CAMPAIGN}/accepted/integration-receipt.json`, "integration receipt path");
  requireEqual(integrationReceipt.receipt_id, integrationReceiptId, "integration receipt reference");
  requireEqual(
    integrationReceipt.sha256,
    sha256(readFileSync(integrationPath, "utf8")),
    "integration receipt hash",
  );

  const terminal = object(completion.terminal_lifecycle_partition, "terminal lifecycle partition");
  requireEqual(terminal, {
    accepted: 101,
    candidate_count: 104,
    candidate_id_partition_sha256: EXPECTED_CANDIDATE_PARTITION,
    conflicted: 0,
    pending: 0,
    rejected_or_explicit_negative: 3,
  }, "terminal lifecycle partition");
  requireEqual(completion.production_footprint_partition, {
    confirmed_current: 0,
    placements: 104,
    reconciliation: 104,
    unexplained_loss: 0,
  }, "production footprint partition");

  const reviewArtifacts = object(integration.review_artifacts, "integration review artifacts");
  requireEqual(Object.keys(reviewArtifacts).sort(), [
    "independent", "independent_summary", "primary", "primary_summary",
  ], "review artifact set");
  for (const [name, rawArtifact] of Object.entries(reviewArtifacts)) {
    const artifact = object(rawArtifact, `review artifact ${name}`);
    const relativePath = string(artifact.path, `review artifact ${name}.path`);
    const expectedPrefix = `${CAMPAIGN}/reviews/`;
    if (!relativePath.startsWith(expectedPrefix) || relativePath.includes("..")) {
      throw new Error(`review artifact ${name} has an unsafe path`);
    }
    requireEqual(
      artifact.sha256,
      sha256(readFileSync(join(rootDir, relativePath), "utf8")),
      `review artifact ${name} hash`,
    );
  }

  const decisions = readJsonl(join(accepted, "decisions.jsonl")).map((row, index) =>
    object(row, `lifecycle decision[${index}]`)
  );
  const campaignAssertions = readJsonl(join(accepted, "assertions.jsonl"));
  const receiptDir = join(accepted, "receipts");
  const receipts = readdirSync(receiptDir).filter((name) => name.endsWith(".json")).sort()
    .map((name) => object(readJson(join(receiptDir, name)), join(receiptDir, name)));
  const adjudications = readJsonl(join(campaign, "reviews", "adjudication", "decisions.jsonl"));
  const snapshotIndex = object(readJson(join(accepted, "snapshot-index.json")), "snapshot index");
  const snapshots = array(snapshotIndex.snapshots, "snapshot index snapshots");
  if (decisions.length !== 104 || campaignAssertions.length !== 104 || receipts.length !== 104 ||
      adjudications.length !== 6 || snapshots.length !== 10) {
    throw new Error("Plan 055 campaign denominator drifted");
  }
  requireEqual(campaignAssertions, assertions, "accepted lifecycle assertion journal");

  const partitions = object(integration.partitions, "integration partitions");
  requireEqual(partitions.decisions_sha256, contentPartition(decisions), "decision partition");
  requireEqual(partitions.assertions_sha256, contentPartition(campaignAssertions), "assertion partition");
  requireEqual(partitions.decision_receipts_sha256, contentPartition(receipts), "receipt partition");
  requireEqual(partitions.adjudications_sha256, contentPartition(adjudications), "adjudication partition");
  requireEqual(partitions.snapshots_sha256, contentPartition(snapshots), "snapshot partition");
  requireEqual(snapshotIndex.snapshot_partition_sha256, partitions.snapshots_sha256, "snapshot index partition");
  requireEqual(snapshotIndex.production_as_of_date, EXPECTED_AS_OF_DATE, "snapshot production date");

  const decisionBasisFields = [
    "plan_id", "lifecycle_candidate_id", "candidate_sha256", "placement_id",
    "batch_id", "batch_manifest_sha256", "primary_reviewer", "independent_reviewer",
    "primary_row_sha256", "independent_row_sha256", "terminal_disposition", "state",
    "valid_time", "document_time", "evidence_bindings", "adjudication_ids",
  ] as const;

  const assertionsById = new Map(assertions.map((row) => [row.assertion_id, row]));
  const decisionsById = new Map<string, ObjectValue>();
  for (const decision of decisions) {
    const decisionId = string(decision.decision_id, "decision id");
    const assertionId = string(decision.assertion_id, `${decisionId}.assertion_id`);
    if (decisionsById.has(decisionId)) throw new Error(`duplicate lifecycle decision ${decisionId}`);
    decisionsById.set(decisionId, decision);
    requireEqual(
      decisionId,
      `plan-055-lifecycle-decision:${sha256(canonical(pick(decision, decisionBasisFields, decisionId)))}`,
      `${decisionId} content address`,
    );
    const assertion = assertionsById.get(assertionId);
    if (!assertion || assertion.decision_id !== decisionId ||
        assertion.review_state !== decision.assertion_review_state) {
      throw new Error(`${decisionId}: assertion decision provenance mismatch`);
    }
    if (decision.primary_reviewer === decision.independent_reviewer) {
      throw new Error(`${decisionId}: lifecycle reviewers must be distinct`);
    }
    const usage = object(decision.provider_usage, `${decisionId}.provider_usage`);
    requireEqual(usage.provider_requests, 0, `${decisionId} provider requests`);
    requireEqual(usage.actual_cost_usd, 0, `${decisionId} provider cost`);
  }

  const receiptedDecisions = new Set<string>();
  for (const receipt of receipts) {
    requireEqual(receipt.contract_id, "plan-055-lifecycle-decision-receipt-v1", "decision receipt contract");
    const decisionId = string(receipt.decision_id, "receipt decision id");
    const decision = decisionsById.get(decisionId);
    if (!decision || receiptedDecisions.has(decisionId)) {
      throw new Error(`${decisionId}: missing or duplicate lifecycle decision receipt`);
    }
    receiptedDecisions.add(decisionId);
    requireEqual(receipt.assertion_id, decision.assertion_id, `${decisionId} receipt assertion`);
    requireEqual(receipt.assertion_review_state, decision.assertion_review_state, `${decisionId} receipt review state`);
    const receiptId = string(receipt.receipt_id, `${decisionId}.receipt_id`);
    requireEqual(
      receiptId,
      `plan-055-lifecycle-receipt:${sha256(canonical(without(receipt, "receipt_id")))}`,
      `${decisionId} receipt id`,
    );
    const usage = object(receipt.provider_usage, `${decisionId}.receipt provider_usage`);
    requireEqual(usage.provider_requests, 0, `${decisionId} receipt provider requests`);
    requireEqual(usage.actual_cost_usd, 0, `${decisionId} receipt provider cost`);
  }
  if (receiptedDecisions.size !== decisionsById.size) {
    throw new Error("Plan 055 decision receipt partition is incomplete");
  }

  const adjudicationIds = new Set<string>();
  for (const [index, rawAdjudication] of adjudications.entries()) {
    const adjudication = object(rawAdjudication, `adjudication[${index}]`);
    const adjudicationId = string(adjudication.adjudication_id, `adjudication[${index}].id`);
    if (adjudicationIds.has(adjudicationId)) throw new Error(`duplicate adjudication ${adjudicationId}`);
    adjudicationIds.add(adjudicationId);
    requireEqual(
      adjudicationId,
      `plan-055-adjudication:${sha256(canonical(without(adjudication, "adjudication_id")))}`,
      `${adjudicationId} content address`,
    );
  }
  for (const decision of decisions) {
    for (const adjudicationId of array(decision.adjudication_ids, "decision adjudication ids")) {
      if (!adjudicationIds.has(string(adjudicationId, "decision adjudication id"))) {
        throw new Error(`${decision.decision_id}: missing adjudication ${String(adjudicationId)}`);
      }
    }
  }

  const snapshotDates = new Set<string>();
  for (const [index, rawSnapshot] of snapshots.entries()) {
    const snapshot = object(rawSnapshot, `snapshot[${index}]`);
    const asOfDate = string(snapshot.as_of_date, `snapshot[${index}].as_of_date`);
    if (snapshotDates.has(asOfDate)) throw new Error(`duplicate lifecycle snapshot ${asOfDate}`);
    snapshotDates.add(asOfDate);
    const relativePath = string(snapshot.path, `snapshot[${index}].path`);
    const expectedPath = `${CAMPAIGN}/accepted/snapshots/${asOfDate}/snapshot-manifest.json`;
    requireEqual(relativePath, expectedPath, `${asOfDate} snapshot path`);
    const manifestPath = join(rootDir, relativePath);
    const manifestContent = readFileSync(manifestPath, "utf8");
    requireEqual(snapshot.sha256, sha256(manifestContent), `${asOfDate} snapshot manifest hash`);
    requireEqual(snapshot.bytes, Buffer.byteLength(manifestContent), `${asOfDate} snapshot manifest bytes`);
    const manifest = object(JSON.parse(manifestContent) as unknown, `${asOfDate} snapshot manifest`);
    requireEqual(manifest.contract_id, "plan-055-lifecycle-state-snapshot-v1", `${asOfDate} snapshot contract`);
    requireEqual(manifest.plan_id, "plan-055", `${asOfDate} snapshot plan`);
    requireEqual(manifest.as_of_date, asOfDate, `${asOfDate} snapshot date`);
    requireEqual(manifest.assertion_partition_sha256, partitions.assertions_sha256, `${asOfDate} assertion partition`);
    requireEqual(manifest.counts_by_state, snapshot.counts_by_state, `${asOfDate} state counts`);
    requireEqual(manifest.confirmed_active_count, snapshot.confirmed_active_count, `${asOfDate} confirmed active`);
    requireEqual(manifest.reconciliation_count, snapshot.reconciliation_count, `${asOfDate} reconciliation`);
    requireEqual(manifest.positive_plus_reconciliation_equals_all_placements, true, `${asOfDate} balance declaration`);
    const artifacts = array(manifest.artifacts, `${asOfDate} artifacts`);
    if (artifacts.length !== 6) throw new Error(`${asOfDate}: snapshot artifact denominator drifted`);
    for (const [artifactIndex, rawArtifact] of artifacts.entries()) {
      const artifact = object(rawArtifact, `${asOfDate} artifact[${artifactIndex}]`);
      const artifactPath = string(artifact.path, `${asOfDate} artifact path`);
      const expectedPrefix = `${CAMPAIGN}/accepted/snapshots/${asOfDate}/`;
      if (!artifactPath.startsWith(expectedPrefix) || artifactPath.includes("..")) {
        throw new Error(`${asOfDate}: unsafe snapshot artifact path`);
      }
      const content = readFileSync(join(rootDir, artifactPath), "utf8");
      requireEqual(artifact.sha256, sha256(content), `${artifactPath} hash`);
      requireEqual(artifact.bytes, Buffer.byteLength(content), `${artifactPath} bytes`);
    }
  }
  requireEqual([...snapshotDates].sort(), [
    "2025-06-28", "2025-06-29", "2025-06-30", "2025-12-07", "2025-12-08",
    "2025-12-09", "2026-06-09", "2026-06-10", "2026-06-11", "2026-07-27",
  ], "lifecycle snapshot dates");

  const providerUsage = object(integration.provider_usage, "integration provider usage");
  requireEqual(providerUsage.provider_requests, 0, "integration provider requests");
  requireEqual(providerUsage.actual_cost_usd, 0, "integration provider cost");
  const counts = object(integration.counts, "integration counts");
  requireEqual(number(counts.lifecycle_candidates, "integration lifecycle candidates"), 104, "integration lifecycle candidates");
  requireEqual(number(counts.pending_assertions, "integration pending assertions"), 0, "integration pending assertions");
  requireEqual(number(counts.conflicted_assertions, "integration conflicted assertions"), 0, "integration conflicted assertions");

  return {
    completion_receipt_id: completionReceiptId,
    assertion_partition_sha256: string(partitions.assertions_sha256, "assertion partition"),
  };
}
