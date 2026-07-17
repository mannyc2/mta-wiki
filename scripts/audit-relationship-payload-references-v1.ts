import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { shortHash, stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import { entriesToRecords } from "../packages/pipeline/src/materialize/materialize";
import {
  auditRelationshipPayloadReferences,
  normalizeRelationshipReferenceValue,
  reviewRelationshipReferenceGroups,
  type RelationshipReferenceAudit,
} from "../packages/pipeline/src/quality/relationship-reference-audit";
import {
  RELATIONSHIP_REFERENCE_CONTRACT_ID,
  RELATIONSHIP_REFERENCE_RULES_V1,
  parseRelationshipReferenceReviewDecision,
  relationshipReferenceContractPath,
  relationshipReferenceReviewLedgerPath,
  type LoadedRelationshipReferenceContract,
  type RelationshipReferenceContract,
  type RelationshipReferenceReviewDecision,
} from "../packages/pipeline/src/quality/relationship-reference-contract";
import {
  readSemanticCorrections,
  readSemanticCorrectionSupersessions,
  withSemanticCorrections,
} from "../packages/pipeline/src/records/semantic-corrections";
import { retiredSubmissionIds } from "../packages/pipeline/src/records/submission-overrides";
import { readSubmissionEntries } from "../packages/pipeline/src/records/submissions";
import {
  readEvidenceBlockIndex,
  type EvidenceBlockIndexEntry,
  type EvidenceBlockIndex,
} from "../packages/pipeline/src/sources/evidence-block-index";
import {
  sourceBlockById,
  sourceBlocksRelativePath,
} from "../packages/pipeline/src/sources/source-prep";

const CONTRACT_PATH = relationshipReferenceContractPath();
const LEDGER_PATH = relationshipReferenceReviewLedgerPath();
const OUTPUT_ROOT = join(
  repoRoot,
  "data",
  "quality",
  "relationship-integrity",
  "payload-references",
);
const REVIEWED_AT = "2026-07-16";
const REVIEWED_BY = "codex-payload-reference-integrity-campaign";

const Q20_HISTORICAL_SCOPE_RECEIPT =
  "data/quality/acquisition/receipts/q20-historical-metric-scope-2014-2025.json";
const Q20_HISTORICAL_METRIC_IDS = [
  "metric_q20-corridor-ridership-share-2014",
  "metric_q20-peak-frequency-2014",
  "metric_q20-ridership-2014",
  "metric_q20-weekday-ridership-2014",
] as const;

type Artifact = {
  path: string;
  content: string;
  rows?: number | undefined;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: JsonValue): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonl(values: readonly JsonValue[]): string {
  return values.length > 0 ? `${values.map((value) => stableJson(value)).join("\n")}\n` : "";
}

function repoPath(path: string): string {
  return relative(repoRoot, path).split("\\").join("/");
}

function corpusHash(records: readonly MtaCanonicalRecord[]): string {
  const hash = createHash("sha256");
  for (const record of [...records].sort((left, right) => left.record_id.localeCompare(right.record_id))) {
    hash.update(stableJson(record as unknown as JsonValue));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function requiredRecord(
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
): MtaCanonicalRecord {
  const record = recordsById.get(recordId);
  if (!record) throw new Error(`required reviewed relationship-reference record is missing: ${recordId}`);
  return record;
}

function decisionEvidence(record: MtaCanonicalRecord): { sourceIds: string[]; evidenceIds: string[] } {
  const sourceIds = sortedUnique(record.evidence_refs.map((ref) => ref.source_id));
  const evidenceIds = sortedUnique(record.evidence_refs.map((ref) => {
    if (ref.evidence_id?.trim()) return ref.evidence_id.trim();
    if (ref.source_id && ref.block_id) return `${ref.source_id}#${ref.block_id}`;
    return "";
  }).filter(Boolean));
  if (sourceIds.length === 0 || evidenceIds.length === 0) {
    throw new Error(`reviewed relationship-reference record lacks exact evidence: ${record.record_id}`);
  }
  return { sourceIds, evidenceIds };
}

/** Exact resolved references that authoritative review proves must not become edges. These are
 * deliberately fixed to the reviewed origin set: a new row cannot silently inherit the decision. */
function reviewedResolvedNonEdges(records: readonly MtaCanonicalRecord[]): RelationshipReferenceReviewDecision[] {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const decisions: RelationshipReferenceReviewDecision[] = [];

  for (const spec of [
    {
      originRecordId: "project_annual-2021-east-side-access",
      expectedLiteral: "East Side Access",
      reviewBasis: [
        "semantic-correction:zz-relationship-semantic-v1-9de3c3338e693d9f",
        "data/quality/relationship-integrity/semantic-remediation/ledger.jsonl#relationship-semantic-remediation-v1/part-0/relation_part-of-program-project-annual-2021-east-side-access-project-annual-2021-east-side-access_7abcbc950c",
      ],
    },
    {
      originRecordId: "project_fuel-hedge-program-2022",
      expectedLiteral: "Fuel Hedge Program",
      reviewBasis: [
        "semantic-correction:relationship-integrity-legacy-0215-relation-part-of-program-project-fuel-hedge-program-2022-project-fuel-hedge-program-2022-2362d3ba6a",
        "data/quality/relationship-integrity/legacy-remediation/ledger.jsonl",
      ],
    },
  ] as const) {
    const origin = requiredRecord(recordsById, spec.originRecordId);
    if (origin.record_kind !== "project" || origin.payload.program !== spec.expectedLiteral) {
      throw new Error(
        `reviewed project-program self-reference changed for ${origin.record_id}; expected ${JSON.stringify(spec.expectedLiteral)}`,
      );
    }
    const evidence = decisionEvidence(origin);
    const identity = {
      rule_id: "project-program",
      field: "program",
      normalized_value: normalizeRelationshipReferenceValue(spec.expectedLiteral),
      native_resolution: "resolved_self_reference" as const,
    };
    decisions.push({
      schema_version: 1,
      ledger_id: "relationship-reference-review-v1",
      decision_id: `relationship-reference-review-v1:${shortHash(identity as unknown as JsonValue, 24)}`,
      ...identity,
      primary_disposition: "reviewed_non_authoritative_self_reference",
      proposed_target_record_id: null,
      reviewed_at: REVIEWED_AT,
      reviewed_by: REVIEWED_BY,
      reason: "The payload program literal resolves to the origin project itself. Prior evidence and semantic review prove that this is descriptive project context, not a containing-program endpoint; a part_of_program self-loop is forbidden and no replacement endpoint is proved.",
      reason_codes: ["canonical_self_loop_forbidden", "containing_program_not_proved", "source_literal_preserved"],
      origin_record_ids: [origin.record_id],
      source_ids_checked: evidence.sourceIds,
      evidence_ids_checked: evidence.evidenceIds,
      canonical_candidate_ids_checked: [origin.record_id],
      exact_supported_claims: sortedUnique([
        `payload_literal:${spec.expectedLiteral}`,
        ...spec.reviewBasis.map((basis) => `review_basis:${basis}`),
      ]),
      exact_unsupported_claims: [`part_of_program:${origin.record_id}->${origin.record_id}`],
    });
  }

  const q20Metrics = Q20_HISTORICAL_METRIC_IDS.map((recordId) => requiredRecord(recordsById, recordId));
  for (const metric of q20Metrics) {
    if (metric.record_kind !== "metric_claim" || metric.payload.route !== "Q20") {
      throw new Error(`reviewed historical Q20 metric scope changed for ${metric.record_id}`);
    }
  }
  const currentQ20 = requiredRecord(recordsById, "route_q20-qbnr-2025");
  if (currentQ20.record_kind !== "route") {
    throw new Error("reviewed current Q20 lifecycle endpoint is not a canonical route");
  }
  const q20Identity = {
    rule_id: "metric-route-has-metric",
    field: "route",
    normalized_value: normalizeRelationshipReferenceValue("Q20"),
    native_resolution: "resolved_temporal_scope_mismatch" as const,
  };
  decisions.push({
    schema_version: 1,
    ledger_id: "relationship-reference-review-v1",
    decision_id: `relationship-reference-review-v1:${shortHash(q20Identity as unknown as JsonValue, 24)}`,
    ...q20Identity,
    primary_disposition: "reviewed_temporal_scope_mismatch",
    proposed_target_record_id: null,
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
    reason: "Official 2014 evidence defines the abbreviated Q20 metric scope as the historical Q20A/B aggregate. Official lifecycle evidence starts the distinct current Q20 route in 2025, so the four mechanical has_metric edges are temporally and identically invalid.",
    reason_codes: ["current_route_lifecycle_begins_2025", "historical_q20a_b_aggregate", "temporal_identity_mismatch"],
    origin_record_ids: [...Q20_HISTORICAL_METRIC_IDS],
    source_ids_checked: sortedUnique(q20Metrics.flatMap((record) => decisionEvidence(record).sourceIds)),
    evidence_ids_checked: sortedUnique(q20Metrics.flatMap((record) => decisionEvidence(record).evidenceIds)),
    canonical_candidate_ids_checked: [currentQ20.record_id],
    exact_supported_claims: [
      `review_basis:${Q20_HISTORICAL_SCOPE_RECEIPT}`,
      "source_scope:historical_q20a_b_aggregate",
    ],
    exact_unsupported_claims: Q20_HISTORICAL_METRIC_IDS.map(
      (recordId) => `has_metric:${currentQ20.record_id}->${recordId}`,
    ).sort((left, right) => left.localeCompare(right)),
  });

  return decisions.sort(
    (left, right) =>
      left.rule_id.localeCompare(right.rule_id) ||
      left.field.localeCompare(right.field) ||
      left.normalized_value.localeCompare(right.normalized_value) ||
      left.native_resolution.localeCompare(right.native_resolution),
  );
}

function projectedRecords(): MtaCanonicalRecord[] {
  const submissions = readSubmissionEntries();
  const mechanical = entriesToRecords(submissions, {
    retiredSubmissionIds: retiredSubmissionIds(),
  });
  const corrected = withSemanticCorrections(
    mechanical,
    readSemanticCorrections(),
    readSemanticCorrectionSupersessions(),
  );
  if (corrected.issues.length > 0) {
    throw new Error(
      `semantic replay has ${corrected.issues.length} issue(s); refusing payload-reference audit: ` +
      corrected.issues.slice(0, 8).map((issue) => `${issue.code} ${issue.recordId ?? issue.path ?? ""}: ${issue.message}`).join("; "),
    );
  }
  return [...corrected.records].sort((left, right) => left.record_id.localeCompare(right.record_id));
}

function evidenceIndex(records: readonly MtaCanonicalRecord[]): {
  index: EvidenceBlockIndex;
  entriesSha256: string;
  entryCount: number;
} {
  const prior = readEvidenceBlockIndex();
  const requested = new Map<string, { sourceId: string; blockId: string }>();
  for (const record of records) {
    for (const ref of record.evidence_refs) {
      if (!ref.source_id || !ref.block_id) continue;
      requested.set(`${ref.source_id}\0${ref.block_id}`, {
        sourceId: ref.source_id,
        blockId: ref.block_id,
      });
    }
  }
  const entries: EvidenceBlockIndexEntry[] = [];
  for (const [key, requestedRef] of [...requested.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    try {
      const block = sourceBlockById(requestedRef.sourceId, requestedRef.blockId);
      entries.push({
        source_id: requestedRef.sourceId,
        block_id: requestedRef.blockId,
        resolved_block_id: block.block_id,
        page_number: block.page_number,
        source_path: sourceBlocksRelativePath(requestedRef.sourceId),
        raw_text_sha256: block.raw_text_sha256,
        source_surface: block.source_surface,
        block_kind: block.block_kind,
        child_block_ids: block.child_block_ids,
      });
    } catch {
      const fallback = prior?.byRef.get(key);
      if (fallback) entries.push(fallback);
    }
  }
  const content = jsonl(entries as unknown as JsonValue[]);
  return {
    index: {
      byRef: new Map(entries.map((entry) => [`${entry.source_id}\0${entry.block_id}`, entry])),
      sourceIds: new Set(entries.map((entry) => entry.source_id)),
    },
    entriesSha256: sha256(content),
    entryCount: entries.length,
  };
}

function makeContract(
  decisionsContent: string,
  decisions: readonly RelationshipReferenceReviewDecision[],
): RelationshipReferenceContract {
  return {
    schema_version: 1,
    contract_id: RELATIONSHIP_REFERENCE_CONTRACT_ID,
    contract_status: "warning",
    description: "Versioned policy for every relationship-like payload field consumed by deterministic derived-relation materialization. Exact canonical resolutions may become evidence-bound edges; unresolved or ambiguous legacy values require immutable group review; unseen values fail closed in enforcement mode.",
    rules: RELATIONSHIP_REFERENCE_RULES_V1.map((rule) => ({
      ...rule,
      fields: [...rule.fields],
      context_literal_fields: [...rule.context_literal_fields],
      target_kinds: [...rule.target_kinds],
    })),
    review_ledger: {
      path: repoPath(LEDGER_PATH),
      sha256: sha256(decisionsContent),
      row_count: decisions.length,
    },
    enforcement_criteria: {
      unreviewed_reference_count: 0,
      invalid_value_count: 0,
      evidence_invalid_count: 0,
      supportable_resolution_pending_count: 0,
      policy_rule_drift_count: 0,
      native_coverage_mismatch_count: 0,
    },
  };
}

function loaded(
  contract: RelationshipReferenceContract,
  decisions: readonly RelationshipReferenceReviewDecision[],
): LoadedRelationshipReferenceContract {
  return {
    contract,
    decisions: [...decisions],
    decisions_by_key: new Map(decisions.map((decision) => [
      `${decision.rule_id}\0${decision.field}\0${decision.normalized_value}\0${decision.native_resolution}`,
      decision,
    ])),
    rules_by_id: new Map(contract.rules.map((rule) => [rule.rule_id, rule])),
    contract_path: CONTRACT_PATH,
    review_ledger_path: LEDGER_PATH,
  };
}

function countBy<T>(values: readonly T[], key: (value: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    const bucket = key(value);
    result[bucket] = (result[bucket] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function summary(
  warningAudit: RelationshipReferenceAudit,
  enforcementAudit: RelationshipReferenceAudit,
): JsonValue {
  return {
    schema_version: 1,
    contract_id: RELATIONSHIP_REFERENCE_CONTRACT_ID,
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
    warning: warningAudit.summary,
    enforcement: enforcementAudit.summary,
    group_dispositions: countBy(
      warningAudit.groups,
      (group) => group.review_primary_disposition ?? "unreviewed",
    ),
    coverage_by_rule_field: warningAudit.coverage,
  };
}

function report(
  warningAudit: RelationshipReferenceAudit,
  enforcementAudit: RelationshipReferenceAudit,
): string {
  const top = warningAudit.groups.slice(0, 30);
  const warning = warningAudit.summary;
  const enforce = enforcementAudit.summary;
  return [
    "# Relationship-like payload-reference integrity audit",
    "",
    `Contract: \`${RELATIONSHIP_REFERENCE_CONTRACT_ID}\` (warning-first).`,
    "",
    `Projected corpus: ${warning.canonical_record_count.toLocaleString("en-US")} canonical records.`,
    "",
    `Exhaustive payload inventory: ${warning.valid_string_value_count.toLocaleString("en-US")} valid string values and ${warning.invalid_value_count.toLocaleString("en-US")} invalid values across ${warning.policy_rule_count} rules / ${warning.policy_field_count} fields.`,
    "",
    "## Exclusive primary dispositions",
    "",
    `- Origin-attributed derived edges: ${warning.exact_resolved_derived_edge_count.toLocaleString("en-US")}.`,
    `- Already-present canonical edges: ${warning.already_present_edge_count.toLocaleString("en-US")}.`,
    `- Native supportable missing edges: ${warning.supportable_missing_edge_count.toLocaleString("en-US")}.`,
    `- Explicit self skips: ${warning.skipped_self_count.toLocaleString("en-US")}.`,
    `- Reviewed supportable canonicalizations still missing an edge: ${warning.reviewed_supportable_resolution_count.toLocaleString("en-US")}.`,
    `- Reviewed supportable canonicalizations with an existing edge: ${warning.reviewed_supportable_existing_edge_count.toLocaleString("en-US")}.`,
    `- Reviewed non-authoritative context literals: ${warning.reviewed_context_literal_count.toLocaleString("en-US")}.`,
    `- Reviewed forbidden self references: ${warning.reviewed_self_reference_count.toLocaleString("en-US")}.`,
    `- Reviewed temporal-scope mismatches: ${warning.reviewed_temporal_scope_mismatch_count.toLocaleString("en-US")}.`,
    `- Reviewed unresolved claims: ${warning.reviewed_unresolved_count.toLocaleString("en-US")}.`,
    `- Reviewed ambiguous claims: ${warning.reviewed_ambiguous_count.toLocaleString("en-US")}.`,
    `- Unreviewed unresolved/ambiguous claims: ${(warning.unreviewed_unresolved_count + warning.unreviewed_ambiguous_count).toLocaleString("en-US")}.`,
    "",
    `Native generator reconciliation: ${warning.policy_rule_drift_count} rule-field drift and ${warning.native_coverage_mismatch_count} count mismatches.`,
    "",
    `Proposed evidence-preserving remediations: ${warning.proposed_remediation_count.toLocaleString("en-US")}. These are proposals only and are never auto-applied.`,
    "",
    `Enforcement-mode hard failures: ${enforce.hard_failure_count.toLocaleString("en-US")}. Reviewed legacy unresolved/ambiguous/context rows remain explicit warnings; unseen or stale review surfaces, invalid values, evidence failures, policy drift, and pending supportable links fail closed.`,
    "",
    "## Highest-volume review groups",
    "",
    "| Rule / field | Normalized value | Native state | References | Review disposition | Candidates |",
    "|---|---|---:|---:|---|---:|",
    ...top.map((group) =>
      `| \`${group.rule_id}.${group.field}\` | \`${group.normalized_value.replaceAll("|", "\\|")}\` | ${group.native_resolution} | ${group.reference_count.toLocaleString("en-US")} | \`${group.review_primary_disposition ?? "unreviewed"}\` | ${group.canonical_candidate_ids_checked.length} |`
    ),
    "",
    "Every audit row retains the origin record's exact evidence refs. Group decisions pin the exact origin-record, source, evidence, and canonical-candidate sets reviewed; adding a new row to an existing normalized group makes the decision stale instead of silently inheriting a waiver.",
    "",
    "Non-route literals in generalized route fields are classified as context only when they contain no NYC bus-route identity surface. Generic route bases that could mean local, limited, or SBS variants remain ambiguous and are never guessed.",
  ].join("\n") + "\n";
}

function generatedArtifacts(): {
  artifacts: Artifact[];
  warningAudit: RelationshipReferenceAudit;
  enforcementAudit: RelationshipReferenceAudit;
} {
  const records = projectedRecords();
  const evidence = evidenceIndex(records);
  const resolvedNonEdgeDecisions = reviewedResolvedNonEdges(records).map((decision, index) =>
    parseRelationshipReferenceReviewDecision(
      decision,
      `reviewed resolved non-edge decision ${index + 1}`,
    )
  );
  const bootstrapDecisionsContent = jsonl(resolvedNonEdgeDecisions as unknown as JsonValue[]);
  const bootstrapContract = makeContract(bootstrapDecisionsContent, resolvedNonEdgeDecisions);

  const bootstrapAudit = auditRelationshipPayloadReferences(
    records,
    loaded(bootstrapContract, resolvedNonEdgeDecisions),
    { mode: "warn", evidenceIndex: evidence.index, checkNativeCoverage: true },
  );
  const decisions = [
    ...reviewRelationshipReferenceGroups(bootstrapAudit.groups),
    ...resolvedNonEdgeDecisions,
  ].sort(
    (left, right) =>
      left.rule_id.localeCompare(right.rule_id) ||
      left.field.localeCompare(right.field) ||
      left.normalized_value.localeCompare(right.normalized_value) ||
      left.native_resolution.localeCompare(right.native_resolution),
  ).map((decision, index) =>
    parseRelationshipReferenceReviewDecision(
      decision,
      `generated relationship reference review decision ${index + 1}`,
    )
  );
  const decisionsContent = jsonl(decisions as unknown as JsonValue[]);
  const contract = makeContract(decisionsContent, decisions);
  const finalLoaded = loaded(contract, decisions);
  const warningAudit = auditRelationshipPayloadReferences(
    records,
    finalLoaded,
    { mode: "warn", evidenceIndex: evidence.index, checkNativeCoverage: true },
  );
  const enforcementAudit = auditRelationshipPayloadReferences(
    records,
    finalLoaded,
    { mode: "enforce", evidenceIndex: evidence.index, checkNativeCoverage: true },
  );
  const decisionsById = new Map(decisions.map((decision) => [decision.decision_id, decision]));
  const investigations = warningAudit.groups.map((group) => {
    const decision = group.review_decision_id
      ? decisionsById.get(group.review_decision_id)
      : undefined;
    return {
      schema_version: 1,
      contract_id: RELATIONSHIP_REFERENCE_CONTRACT_ID,
      investigation_id: `relationship-reference-investigation-v1:${group.group_id.split(":").at(-1)}`,
      group_id: group.group_id,
      rule_id: group.rule_id,
      field: group.field,
      normalized_value: group.normalized_value,
      literal_queries_checked: group.literal_values,
      methods_checked: [
        "exact_canonical_id_display_alias_and_payload_surface_lookup",
        "allowed_target_kind_filter",
        "route_base_and_service_variant_resolution",
        "long_name_parenthetical_acronym_concordance",
        "origin_evidence_binding_inventory",
      ],
      native_resolution: group.native_resolution,
      reference_count: group.reference_count,
      canonical_candidate_ids_checked: group.canonical_candidate_ids_checked,
      origin_record_ids_checked: group.origin_record_ids,
      source_ids_checked: group.source_ids_checked,
      evidence_ids_checked: group.evidence_ids_checked,
      primary_disposition: decision?.primary_disposition ?? "unreviewed_evidence_or_policy_failure",
      proposed_target_record_id: decision?.proposed_target_record_id ?? null,
      exact_supported_claims: decision?.exact_supported_claims ?? [],
      exact_unsupported_claims: decision?.exact_unsupported_claims ?? ["immutable_evidence_linked_review_decision"],
      next_action: decision?.primary_disposition === "reviewed_supportable_canonical_target"
        ? "Review and apply the proposed evidence-preserving canonical correction, then regenerate."
        : decision
          ? "Retain the explicit reviewed disposition unless new authoritative evidence or canonical identity data changes the result."
          : "Repair evidence or policy coverage before enforcement; this group cannot inherit a waiver.",
    };
  });

  const artifacts: Artifact[] = [
    { path: LEDGER_PATH, content: decisionsContent, rows: decisions.length },
    { path: CONTRACT_PATH, content: json(contract as unknown as JsonValue) },
    {
      path: join(OUTPUT_ROOT, "reference-audit.jsonl"),
      content: jsonl(warningAudit.rows as unknown as JsonValue[]),
      rows: warningAudit.rows.length,
    },
    {
      path: join(OUTPUT_ROOT, "group-inventory.jsonl"),
      content: jsonl(warningAudit.groups as unknown as JsonValue[]),
      rows: warningAudit.groups.length,
    },
    {
      path: join(OUTPUT_ROOT, "investigations.jsonl"),
      content: jsonl(investigations as unknown as JsonValue[]),
      rows: investigations.length,
    },
    {
      path: join(OUTPUT_ROOT, "reviewed-unsupported.jsonl"),
      content: jsonl(decisions.filter((decision) =>
        decision.primary_disposition !== "reviewed_supportable_canonical_target"
      ) as unknown as JsonValue[]),
      rows: decisions.filter((decision) =>
        decision.primary_disposition !== "reviewed_supportable_canonical_target"
      ).length,
    },
    {
      path: join(OUTPUT_ROOT, "proposed-remediations.jsonl"),
      content: jsonl(warningAudit.proposed_remediations as unknown as JsonValue[]),
      rows: warningAudit.proposed_remediations.length,
    },
    {
      path: join(OUTPUT_ROOT, "findings-warning.jsonl"),
      content: jsonl(warningAudit.findings as unknown as JsonValue[]),
      rows: warningAudit.findings.length,
    },
    {
      path: join(OUTPUT_ROOT, "findings-enforcement.jsonl"),
      content: jsonl(enforcementAudit.findings as unknown as JsonValue[]),
      rows: enforcementAudit.findings.length,
    },
    {
      path: join(OUTPUT_ROOT, "coverage.json"),
      content: json({
        policy: warningAudit.coverage,
        native: warningAudit.native_coverage,
      }),
    },
    {
      path: join(OUTPUT_ROOT, "summary.json"),
      content: json(summary(warningAudit, enforcementAudit)),
    },
    {
      path: join(OUTPUT_ROOT, "report.md"),
      content: report(warningAudit, enforcementAudit),
    },
  ];

  const outputArtifacts = artifacts
    .filter((artifact) => artifact.path.startsWith(OUTPUT_ROOT))
    .map((artifact) => ({
      path: repoPath(artifact.path),
      sha256: sha256(artifact.content),
      ...(artifact.rows === undefined ? {} : { rows: artifact.rows }),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const contractContent = artifacts.find((artifact) => artifact.path === CONTRACT_PATH)!.content;
  const manifest = {
    schema_version: 1,
    contract_id: RELATIONSHIP_REFERENCE_CONTRACT_ID,
    generated_at: REVIEWED_AT,
    generated_by: REVIEWED_BY,
    projected_corpus_sha256: corpusHash(records),
    projected_record_count: records.length,
    evidence_block_index_sha256: evidence.entriesSha256,
    evidence_block_index_entry_count: evidence.entryCount,
    contract_sha256: sha256(contractContent),
    review_ledger_sha256: sha256(decisionsContent),
    review_ledger_row_count: decisions.length,
    warning_summary_sha256: sha256(stableJson(warningAudit.summary as unknown as JsonValue)),
    enforcement_summary_sha256: sha256(stableJson(enforcementAudit.summary as unknown as JsonValue)),
    artifacts: outputArtifacts,
    reproduction_commands: [
      "bun scripts/audit-relationship-payload-references-v1.ts --check",
      "bun run typecheck",
      "bun test packages/pipeline/test/quality/relationship-reference-audit.test.ts",
    ],
  };
  artifacts.push({
    path: join(OUTPUT_ROOT, "manifest.json"),
    content: json(manifest as unknown as JsonValue),
  });
  return { artifacts, warningAudit, enforcementAudit };
}

function writeArtifacts(artifacts: readonly Artifact[]): void {
  for (const artifact of artifacts) {
    mkdirSync(dirname(artifact.path), { recursive: true });
    writeFileSync(artifact.path, artifact.content, "utf8");
  }
}

function checkArtifacts(artifacts: readonly Artifact[]): void {
  const mismatches: string[] = [];
  for (const artifact of artifacts) {
    const path = repoPath(artifact.path);
    if (!existsSync(artifact.path)) {
      mismatches.push(`${path}: missing`);
      continue;
    }
    const actual = readFileSync(artifact.path, "utf8");
    if (actual !== artifact.content) {
      mismatches.push(`${path}: expected ${sha256(artifact.content)}, found ${sha256(actual)}`);
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`relationship payload-reference artifacts are stale:\n${mismatches.join("\n")}`);
  }
}

function main(): void {
  const check = process.argv.includes("--check");
  const result = generatedArtifacts();
  if (check) checkArtifacts(result.artifacts);
  else writeArtifacts(result.artifacts);
  const warning = result.warningAudit.summary;
  const enforce = result.enforcementAudit.summary;
  console.log([
    `payload reference rows: ${warning.reference_row_count}`,
    `resolved edges: ${warning.exact_resolved_derived_edge_count + warning.already_present_edge_count}`,
    `reviewed unresolved/ambiguous/context/self/temporal: ${warning.reviewed_unresolved_count}/${warning.reviewed_ambiguous_count}/${warning.reviewed_context_literal_count}/${warning.reviewed_self_reference_count}/${warning.reviewed_temporal_scope_mismatch_count}`,
    `unreviewed unresolved/ambiguous: ${warning.unreviewed_unresolved_count}/${warning.unreviewed_ambiguous_count}`,
    `proposed remediations: ${warning.proposed_remediation_count}`,
    `native reconciliation drift/mismatches: ${warning.policy_rule_drift_count}/${warning.native_coverage_mismatch_count}`,
    `enforcement hard failures: ${enforce.hard_failure_count}`,
    check ? "artifacts: deterministic" : `artifacts: ${repoPath(OUTPUT_ROOT)}`,
  ].join("\n"));
}

if (import.meta.main) main();
