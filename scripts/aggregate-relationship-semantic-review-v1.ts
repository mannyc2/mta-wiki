import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableHash, stableJson } from "../packages/db/src/stable-json";
import type { JsonObject, JsonValue, MtaObservationKind } from "../packages/db/src/types";

const CONTRACT_ID = "relationship-contract-v1";
const REMEDIATION_CONTRACT_ID = "relationship-semantic-remediation-v1";
const CONTRACT_ROOT = join(repoRoot, "data/contracts/relationships/v1");
const QUALITY_ROOT = join(repoRoot, "data/quality/relationship-integrity/semantic-review");
const INVENTORY_PATH = join(CONTRACT_ROOT, "baseline-tuple-review-inventory.json");
const AGGREGATE_PATH = join(CONTRACT_ROOT, "baseline-tuple-semantic-review.json");
const REMEDIATION_PLAN_PATH = join(CONTRACT_ROOT, "semantic-remediation-plan.json");
const TUPLE_JSONL_PATH = join(QUALITY_ROOT, "tuple-decisions.jsonl");
const REMEDIATION_JSONL_PATH = join(QUALITY_ROOT, "relation-remediation-decisions.jsonl");
const SUMMARY_PATH = join(QUALITY_ROOT, "summary.json");
const REPORT_PATH = join(QUALITY_ROOT, "report.md");
const MANIFEST_PATH = join(QUALITY_ROOT, "manifest.json");

const REVIEW_SHARD_PATHS = [0, 1, 2].map((part) =>
  join(CONTRACT_ROOT, `semantic-review-shards/part-${part}.json`));
const REMEDIATION_SHARD_PATHS = [0, 1, 2].map((part) =>
  join(CONTRACT_ROOT, `semantic-remediation-shards/part-${part}.json`));

type BaselineTuple = {
  relation_kind: string;
  relation_family: string;
  subject_kind: MtaObservationKind;
  object_kind: MtaObservationKind;
  rule_review_basis: "existing_exact_rule" | "frozen_observed_shape";
  observed_relation_count: number;
  observed_relation_record_ids_sha256: string;
};

type BaselineInventory = {
  schema_version: 1;
  inventory_id: string;
  contract_id: string;
  tuple_count: number;
  relation_assignment_count: number;
  tuples: BaselineTuple[];
};

type TupleDecision = {
  tuple_index: number;
  relation_kind: string;
  relation_family: string;
  subject_kind: MtaObservationKind;
  object_kind: MtaObservationKind;
  decision: "approved" | "rejected" | "needs_remediation";
  baseline_observed_relation_count: number;
  baseline_observed_relation_ids_sha256: string;
  post_correction_relation_count: number;
  reviewed_relation_ids_sha256: string;
  semantic_rationale: string;
  suspect_relation_ids: string[];
  remediated_or_retyped_baseline_relation_ids: string[];
};

type ReviewShard = {
  schema_version: 1;
  contract_id: string;
  shard_id: string;
  review_status: string;
  reviewed_at: string;
  reviewed_by: string;
  partition: {
    inventory_path: string;
    inventory_sha256: string;
    index_modulus: number;
    index_remainder: number;
  };
  projection: JsonObject;
  summary: JsonObject;
  decisions: TupleDecision[];
};

type RemediationDecision = {
  relation_id: string;
  tuple_indices: number[];
  current_snapshot: JsonObject;
  terminal_action:
    | "retract_unsupported"
    | "replace_endpoint"
    | "patch_relation"
    | "resolved_by_identity_campaign"
    | "resolved_by_generator_fix"
    | "replace_with_submissions";
  rationale: string;
  supported_claims: string[];
  unsupported_claims: string[];
  investigation: JsonValue;
  action: JsonObject;
  reviewed_at: string;
  reviewed_by: string;
};

type RemediationShard = {
  schema_version: 1;
  contract_id: string;
  shard_id: string;
  review_status: string;
  pinned_inputs: JsonObject;
  summary: JsonObject;
  decisions: RemediationDecision[];
};

type OutputFile = {
  path: string;
  content: string;
  rows?: number;
};

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function contentSha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new Error(`missing input ${relative(repoRoot, path)}`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(
    uniqueSorted(values).map((value) => [value, values.filter((candidate) => candidate === value).length]),
  ) as Record<T, number>;
}

function tupleKey(tuple: Pick<BaselineTuple, "relation_kind" | "relation_family" | "subject_kind" | "object_kind">): string {
  return `${tuple.relation_kind}\0${tuple.relation_family}\0${tuple.subject_kind}\0${tuple.object_kind}`;
}

function assertSha(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} must be SHA-256`);
}

function assertReviewShard(shard: ReviewShard, part: number, inventory: BaselineInventory): void {
  if (
    shard.schema_version !== 1
    || shard.contract_id !== CONTRACT_ID
    || shard.review_status !== "completed_with_remediation_required"
    || shard.partition.index_modulus !== 3
    || shard.partition.index_remainder !== part
  ) {
    throw new Error(`semantic review part-${part} has an invalid envelope`);
  }
  if (shard.partition.inventory_path !== relative(repoRoot, INVENTORY_PATH)) {
    throw new Error(`semantic review part-${part} points to a different tuple inventory`);
  }
  assertSha(shard.partition.inventory_sha256, `semantic review part-${part} inventory hash`);
  const expectedIndices = Array.from({ length: inventory.tuple_count }, (_, index) => index)
    .filter((index) => index % 3 === part);
  const actualIndices = shard.decisions.map((decision) => decision.tuple_index);
  if (stableJson(actualIndices) !== stableJson(expectedIndices)) {
    throw new Error(`semantic review part-${part} does not exhaust its deterministic tuple partition`);
  }
  for (const decision of shard.decisions) {
    const baseline = inventory.tuples[decision.tuple_index];
    if (!baseline || tupleKey(decision) !== tupleKey(baseline)) {
      throw new Error(`semantic review tuple ${decision.tuple_index} does not match the baseline inventory`);
    }
    if (
      decision.baseline_observed_relation_count !== baseline.observed_relation_count
      || decision.baseline_observed_relation_ids_sha256 !== baseline.observed_relation_record_ids_sha256
    ) {
      throw new Error(`semantic review tuple ${decision.tuple_index} changed its frozen observation population`);
    }
    assertSha(decision.reviewed_relation_ids_sha256, `tuple ${decision.tuple_index} reviewed relation hash`);
    if (!decision.semantic_rationale.trim()) throw new Error(`tuple ${decision.tuple_index} lacks semantic rationale`);
    if (decision.decision === "approved" && decision.suspect_relation_ids.length !== 0) {
      throw new Error(`approved tuple ${decision.tuple_index} has suspect relations`);
    }
    if (
      decision.decision === "rejected"
      && (decision.post_correction_relation_count !== 0 || decision.suspect_relation_ids.length !== 0)
    ) {
      throw new Error(`rejected tuple ${decision.tuple_index} must be obsolete after correction replay`);
    }
    if (decision.decision === "needs_remediation" && decision.suspect_relation_ids.length === 0) {
      throw new Error(`tuple ${decision.tuple_index} requires remediation but names no exact relation`);
    }
  }
}

function assertRemediationDecision(
  decision: RemediationDecision,
  reviewDecisionByIndex: Map<number, TupleDecision>,
): void {
  if (
    !decision.relation_id.trim()
    || decision.tuple_indices.length === 0
    || !decision.rationale.trim()
    || !decision.reviewed_at.trim()
    || !decision.reviewed_by.trim()
  ) {
    throw new Error(`remediation decision ${decision.relation_id || "<blank>"} lacks required review fields`);
  }
  if (
    decision.investigation === null
    || (typeof decision.investigation === "string" && !decision.investigation.trim())
    || (typeof decision.investigation === "object" && Object.keys(decision.investigation).length === 0)
  ) {
    throw new Error(`remediation decision ${decision.relation_id} lacks a substantive investigation`);
  }
  if (!decision.current_snapshot || typeof decision.current_snapshot !== "object") {
    throw new Error(`remediation decision ${decision.relation_id} lacks a current snapshot`);
  }
  if (decision.current_snapshot.record_kind !== "relation") {
    throw new Error(`remediation decision ${decision.relation_id} snapshot is not a relation`);
  }
  for (const field of ["payload_sha256", "evidence_bindings_sha256"] as const) {
    assertSha(decision.current_snapshot[field], `${decision.relation_id} ${field}`);
  }
  const snapshotEvidence = decision.current_snapshot.evidence_ids;
  if (!Array.isArray(snapshotEvidence) || snapshotEvidence.length === 0 ||
      snapshotEvidence.some((id) => typeof id !== "string" || !id.includes("#"))) {
    throw new Error(`remediation decision ${decision.relation_id} lacks exact snapshot evidence ids`);
  }
  const actionType = decision.action.action_type;
  if (actionType !== undefined && actionType !== decision.terminal_action) {
    throw new Error(`remediation decision ${decision.relation_id} action discriminants disagree`);
  }
  assertActionShape(decision);
  for (const tupleIndex of decision.tuple_indices) {
    const tuple = reviewDecisionByIndex.get(tupleIndex);
    if (!tuple || tuple.decision !== "needs_remediation" || !tuple.suspect_relation_ids.includes(decision.relation_id)) {
      throw new Error(`remediation ${decision.relation_id} is not assigned by tuple ${tupleIndex}`);
    }
  }
}

function nonEmptyString(value: JsonValue | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function objectValue(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function stringArray(value: JsonValue | undefined, allowEmpty = false): value is string[] {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function assertReplacementSubmission(relationId: string, value: JsonValue, index: number): void {
  const input = objectValue(value);
  if (!input) throw new Error(`${relationId} replacement submission ${index} is not an object`);
  for (const field of ["source_id", "observation_kind", "local_observation_id", "label"] as const) {
    if (!nonEmptyString(input[field])) throw new Error(`${relationId} replacement submission ${index} lacks ${field}`);
  }
  if (!objectValue(input.payload)) throw new Error(`${relationId} replacement submission ${index} lacks payload`);
  if (!Array.isArray(input.evidence_refs) || input.evidence_refs.length === 0) {
    throw new Error(`${relationId} replacement submission ${index} lacks evidence refs`);
  }
  for (const [refIndex, rawRef] of input.evidence_refs.entries()) {
    const ref = objectValue(rawRef);
    if (!ref) throw new Error(`${relationId} replacement evidence ${index}/${refIndex} is not an object`);
    for (const field of ["source_id", "evidence_id", "source_path", "block_id", "text_sha256"] as const) {
      if (!nonEmptyString(ref[field])) {
        throw new Error(`${relationId} replacement evidence ${index}/${refIndex} lacks ${field}`);
      }
    }
    if (!String(ref.evidence_id).includes("#")) {
      throw new Error(`${relationId} replacement evidence ${index}/${refIndex} lacks a block identity`);
    }
    const hash = String(ref.text_sha256).replace(/^sha256:/u, "");
    assertSha(hash, `${relationId} replacement evidence ${index}/${refIndex} hash`);
  }
}

function assertActionShape(decision: RemediationDecision): void {
  const action = decision.action;
  const guards = action.guards;
  if (guards !== undefined && !objectValue(guards)) {
    throw new Error(`${decision.relation_id} action guards must be an object`);
  }
  switch (decision.terminal_action) {
    case "retract_unsupported":
      if (!stringArray(action.replacement_relation_ids, true)) {
        throw new Error(`${decision.relation_id} retraction replacement ids must be a string array`);
      }
      break;
    case "replace_endpoint":
      if ((action.field !== "subject_id" && action.field !== "object_id") || !nonEmptyString(action.to_record_id)) {
        throw new Error(`${decision.relation_id} endpoint replacement is not executable`);
      }
      if (!objectValue(guards)) throw new Error(`${decision.relation_id} endpoint replacement lacks guards`);
      break;
    case "patch_relation": {
      const set = objectValue(action.set);
      if (!set || Object.keys(set).length === 0) throw new Error(`${decision.relation_id} relation patch is empty`);
      if (!objectValue(guards)) throw new Error(`${decision.relation_id} relation patch lacks guards`);
      break;
    }
    case "resolved_by_identity_campaign":
      if (!stringArray(action.identity_submission_ids) ||
          !nonEmptyString(action.expected_subject_id) || !nonEmptyString(action.expected_object_id)) {
        throw new Error(`${decision.relation_id} identity campaign action is not executable`);
      }
      break;
    case "resolved_by_generator_fix":
      if (!nonEmptyString(action.rule_id) || !nonEmptyString(action.change) ||
          !nonEmptyString(action.expected_relation_disposition)) {
        throw new Error(`${decision.relation_id} generator fix lacks an exact rule or disposition`);
      }
      break;
    case "replace_with_submissions":
      if (action.retire_relation !== true || !Array.isArray(action.submissions) || action.submissions.length === 0) {
        throw new Error(`${decision.relation_id} replacement submissions action is incomplete`);
      }
      action.submissions.forEach((input, index) => assertReplacementSubmission(decision.relation_id, input, index));
      break;
  }
}

function assertRemediationShard(
  shard: RemediationShard,
  part: number,
  expectedRelationIds: string[],
  reviewDecisionByIndex: Map<number, TupleDecision>,
): void {
  if (
    shard.schema_version !== 1
    || shard.contract_id !== REMEDIATION_CONTRACT_ID
    || shard.review_status !== "complete"
    || shard.shard_id !== `part-${part}`
  ) {
    throw new Error(`semantic remediation part-${part} has an invalid envelope`);
  }
  const relationIds = shard.decisions.map((decision) => decision.relation_id);
  if (stableJson(relationIds) !== stableJson([...relationIds].sort())) {
    throw new Error(`semantic remediation part-${part} decisions are not sorted by relation id`);
  }
  if (stableJson(relationIds) !== stableJson(expectedRelationIds)) {
    throw new Error(`semantic remediation part-${part} does not cover its exact suspect relation set`);
  }
  for (const decision of shard.decisions) assertRemediationDecision(decision, reviewDecisionByIndex);
  if (shard.summary.zero_unreviewed !== true) throw new Error(`semantic remediation part-${part} is not exhaustive`);
}

function renderReport(summary: JsonObject): string {
  const decisions = summary.tuple_decision_counts as Record<string, number>;
  const actions = summary.terminal_action_counts as Record<string, number>;
  return [
    "# Relationship semantic review and remediation plan",
    "",
    "This review is exhaustive over the pinned 1,136-tuple legacy endpoint matrix. It distinguishes structural resolvability from semantic validity; observed legacy tuples are not grandfathered merely because their endpoints exist.",
    "",
    "## Tuple review",
    "",
    "| Exclusive disposition | Tuple count |",
    "|---|---:|",
    `| Approved at stored precision | ${decisions.approved} |`,
    `| Obsolete after prior correction replay | ${decisions.rejected} |`,
    `| Requires exact relation remediation | ${decisions.needs_remediation} |`,
    "",
    `The tuple partition covers ${summary.tuple_count} tuples and ${summary.baseline_relation_assignment_count} frozen relation assignments. ${summary.semantic_remediation_relation_count} exact surviving relations received source-specific remediation decisions.`,
    "",
    "## Exact remediation actions",
    "",
    "| Terminal action | Relation count |",
    "|---|---:|",
    ...Object.entries(actions).sort(([left], [right]) => left.localeCompare(right))
      .map(([action, count]) => `| \`${action}\` | ${count} |`),
    "",
    "## Enforcement status",
    "",
    "Endpoint-type enforcement remains gated until the remediation plan has been applied, the resulting graph has been replayed, and every surviving post-remediation tuple has an explicit approved review decision. This artifact is evidence of completed review and an executable plan, not a waiver or allowlist.",
    "",
    "Every relation action is exclusive. Supported facts are retained only at the precision established by cited authoritative evidence; unsupported route, facility, contract, date, phase, and agency claims are retracted rather than inferred.",
  ].join("\n");
}

export function buildRelationshipSemanticReviewAggregate(): {
  outputs: OutputFile[];
  summary: JsonObject;
} {
  const inventory = readJson<BaselineInventory>(INVENTORY_PATH);
  if (inventory.schema_version !== 1 || inventory.contract_id !== CONTRACT_ID || inventory.tuple_count !== 1136) {
    throw new Error("unsupported relationship baseline tuple inventory");
  }
  if (inventory.tuples.length !== inventory.tuple_count) throw new Error("baseline tuple inventory count mismatch");
  const inventoryLogicalSha256 = stableHash(inventory as unknown as JsonObject);
  const inventoryFileSha256 = fileSha256(INVENTORY_PATH);

  const reviewShards = REVIEW_SHARD_PATHS.map((path, part) => {
    const shard = readJson<ReviewShard>(path);
    assertReviewShard(shard, part, inventory);
    return shard;
  });
  const tupleDecisions = reviewShards.flatMap((shard) => shard.decisions)
    .sort((left, right) => left.tuple_index - right.tuple_index);
  if (
    tupleDecisions.length !== inventory.tuple_count
    || tupleDecisions.some((decision, index) => decision.tuple_index !== index)
  ) {
    throw new Error("semantic tuple review does not cover every baseline tuple exactly once");
  }
  const reviewDecisionByIndex = new Map(tupleDecisions.map((decision) => [decision.tuple_index, decision]));

  const suspectIdsByPart = reviewShards.map((shard) =>
    uniqueSorted(shard.decisions.flatMap((decision) => decision.suspect_relation_ids)));
  const remediationShards = REMEDIATION_SHARD_PATHS.map((path, part) => {
    const shard = readJson<RemediationShard>(path);
    assertRemediationShard(shard, part, suspectIdsByPart[part]!, reviewDecisionByIndex);
    return shard;
  });
  const remediationDecisions = remediationShards.flatMap((shard) => shard.decisions)
    .sort((left, right) => left.relation_id < right.relation_id ? -1 : left.relation_id > right.relation_id ? 1 : 0);
  if (new Set(remediationDecisions.map((decision) => decision.relation_id)).size !== remediationDecisions.length) {
    throw new Error("semantic remediation assigns a relation to more than one shard");
  }
  const allSuspectIds = uniqueSorted(tupleDecisions.flatMap((decision) => decision.suspect_relation_ids));
  if (stableJson(remediationDecisions.map((decision) => decision.relation_id)) !== stableJson(allSuspectIds)) {
    throw new Error("semantic remediation does not reconcile to the global suspect relation population");
  }

  const tupleRows = tupleDecisions.map((decision) => ({
    decision_id: `relationship-tuple-review-v1:${String(decision.tuple_index).padStart(4, "0")}`,
    tuple_index: decision.tuple_index,
    relation_kind: decision.relation_kind,
    relation_family: decision.relation_family,
    subject_kind: decision.subject_kind,
    object_kind: decision.object_kind,
    primary_disposition: decision.decision === "approved"
      ? "approved_at_stored_precision"
      : decision.decision === "rejected"
        ? "obsolete_after_prior_correction_replay"
        : "exact_relation_remediation_required",
    baseline_observed_relation_count: decision.baseline_observed_relation_count,
    baseline_observed_relation_ids_sha256: decision.baseline_observed_relation_ids_sha256,
    post_correction_relation_count: decision.post_correction_relation_count,
    reviewed_relation_ids_sha256: decision.reviewed_relation_ids_sha256,
    semantic_rationale: decision.semantic_rationale,
    suspect_relation_ids: [...decision.suspect_relation_ids].sort(),
    remediated_or_retyped_baseline_relation_ids: [...decision.remediated_or_retyped_baseline_relation_ids].sort(),
    source_shard: `part-${decision.tuple_index % 3}`,
  }));
  const remediationRows = remediationDecisions.map((decision) => ({
    ...decision,
    source_shard: remediationShards.find((shard) =>
      shard.decisions.some((candidate) => candidate.relation_id === decision.relation_id))!.shard_id,
    primary_disposition: decision.terminal_action,
  }));
  const tupleDecisionCounts = countBy(tupleDecisions.map((decision) => decision.decision));
  const terminalActionCounts = countBy(remediationDecisions.map((decision) => decision.terminal_action));
  const evidenceIds = uniqueSorted(remediationDecisions.flatMap((decision) => {
    const value = decision.current_snapshot.evidence_ids;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  }));
  const summary: JsonObject = {
    contract_id: CONTRACT_ID,
    review_id: "relationship-contract-v1-baseline-semantic-review",
    review_status: "complete",
    enforcement_eligible: false,
    enforcement_gate: "apply exact remediation plan and review every surviving post-remediation tuple",
    tuple_count: tupleRows.length,
    baseline_relation_assignment_count: inventory.relation_assignment_count,
    tuple_decision_counts: tupleDecisionCounts,
    semantic_remediation_relation_count: remediationRows.length,
    semantic_remediation_relation_ids_sha256: stableHash(
      remediationRows.map((row) => row.relation_id) as unknown as JsonValue,
    ),
    terminal_action_counts: terminalActionCounts,
    reviewed_remediation_evidence_id_count: evidenceIds.length,
    reviewed_remediation_evidence_ids_sha256: stableHash(evidenceIds as unknown as JsonValue),
    zero_unreviewed_tuples: tupleRows.length === inventory.tuple_count,
    zero_unplanned_suspect_relations: remediationRows.length === allSuspectIds.length,
  };
  if (
    tupleRows.length !== 1136
    || remediationRows.length !== 399
    || tupleDecisionCounts.approved !== 913
    || tupleDecisionCounts.rejected !== 43
    || tupleDecisionCounts.needs_remediation !== 180
  ) {
    throw new Error(`semantic review campaign counts drifted: ${stableJson(summary as JsonValue)}`);
  }

  const pinnedInputs = {
    baseline_inventory: {
      path: relative(repoRoot, INVENTORY_PATH),
      file_sha256: inventoryFileSha256,
      logical_sha256: inventoryLogicalSha256,
    },
    semantic_review_shards: REVIEW_SHARD_PATHS.map((path) => ({
      path: relative(repoRoot, path),
      file_sha256: fileSha256(path),
      logical_sha256: stableHash(readJson<JsonObject>(path)),
    })),
    semantic_remediation_shards: REMEDIATION_SHARD_PATHS.map((path) => ({
      path: relative(repoRoot, path),
      file_sha256: fileSha256(path),
      logical_sha256: stableHash(readJson<JsonObject>(path)),
    })),
  };
  const aggregate = {
    schema_version: 1,
    review_id: "relationship-contract-v1-baseline-semantic-review",
    contract_id: CONTRACT_ID,
    review_status: "complete",
    reviewed_at: "2026-07-16T00:00:00.000Z",
    reviewed_by: "Codex relationship-integrity adversarial semantic review",
    statement: "Every frozen baseline endpoint tuple received an explicit semantic decision. Approval is tuple- and evidence-specific; needs-remediation tuples are not permitted by enforcement until every exact suspect relation is remediated and the resulting tuple is re-reviewed.",
    pinned_inputs: pinnedInputs,
    summary,
    tuple_decisions: tupleRows,
  };
  const remediationPlan = {
    schema_version: 1,
    plan_id: "relationship-semantic-remediation-v1",
    contract_id: CONTRACT_ID,
    review_status: "complete",
    application_status: "pending_central_replay",
    reviewed_at: "2026-07-16T00:00:00.000Z",
    reviewed_by: "Codex relationship-integrity remediation workers",
    pinned_inputs: pinnedInputs,
    summary: {
      relation_count: remediationRows.length,
      relation_ids_sha256: summary.semantic_remediation_relation_ids_sha256,
      terminal_action_counts: terminalActionCounts,
      evidence_id_count: evidenceIds.length,
      evidence_ids_sha256: summary.reviewed_remediation_evidence_ids_sha256,
      zero_unreviewed: true,
    },
    decisions: remediationRows,
  };
  const tupleJsonl = `${tupleRows.map((row) => stableJson(row as unknown as JsonValue)).join("\n")}\n`;
  const remediationJsonl = `${remediationRows.map((row) => stableJson(row as unknown as JsonValue)).join("\n")}\n`;
  const report = `${renderReport(summary)}\n`;

  const initialOutputs: OutputFile[] = [
    { path: AGGREGATE_PATH, content: `${JSON.stringify(aggregate, null, 2)}\n` },
    { path: REMEDIATION_PLAN_PATH, content: `${JSON.stringify(remediationPlan, null, 2)}\n` },
    { path: TUPLE_JSONL_PATH, content: tupleJsonl, rows: tupleRows.length },
    { path: REMEDIATION_JSONL_PATH, content: remediationJsonl, rows: remediationRows.length },
    { path: SUMMARY_PATH, content: `${JSON.stringify(summary, null, 2)}\n` },
    { path: REPORT_PATH, content: report },
  ];
  const manifest = {
    schema_version: 1,
    manifest_id: "relationship-semantic-review-manifest-v1",
    contract_id: CONTRACT_ID,
    input_fingerprint: stableHash(pinnedInputs as unknown as JsonObject),
    artifacts: initialOutputs.map((output) => ({
      path: relative(repoRoot, output.path),
      sha256: contentSha256(output.content),
      bytes: Buffer.byteLength(output.content),
      ...(output.rows === undefined ? {} : { rows: output.rows }),
    })).sort((left, right) => left.path.localeCompare(right.path)),
    reproduction_commands: [
      "bun scripts/aggregate-relationship-semantic-review-v1.ts --check",
      "bun test packages/pipeline/test/quality/relationship-semantic-review.test.ts",
    ],
  };
  const outputs = [
    ...initialOutputs,
    { path: MANIFEST_PATH, content: `${JSON.stringify(manifest, null, 2)}\n` },
  ];
  return { outputs, summary };
}

function writeOrCheck(outputs: OutputFile[], check: boolean): void {
  for (const output of outputs) {
    if (check) {
      if (!existsSync(output.path) || readFileSync(output.path, "utf8") !== output.content) {
        throw new Error(`generated semantic review artifact drifted: ${relative(repoRoot, output.path)}`);
      }
      continue;
    }
    mkdirSync(dirname(output.path), { recursive: true });
    writeFileSync(output.path, output.content, "utf8");
  }
}

function main(): void {
  const check = process.argv.includes("--check");
  const build = buildRelationshipSemanticReviewAggregate();
  writeOrCheck(build.outputs, check);
  process.stdout.write(`${stableJson({
    mode: check ? "check" : "write",
    outputs: build.outputs.map((output) => relative(repoRoot, output.path)),
    summary: build.summary,
  } as unknown as JsonValue)}\n`);
}

if (import.meta.main) main();
