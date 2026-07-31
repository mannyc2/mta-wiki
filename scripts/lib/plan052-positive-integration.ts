import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../../packages/core/src/paths";
import { stableJson } from "../../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../../packages/db/src/types";
import { readCanonicalRecords } from "../../packages/pipeline/src/materialize/canonical-read";
import { parseOperationalEpisodeAcceptedMapping } from "../../packages/pipeline/src/materialize/operational-episode-adapters";
import { deterministicOperationalOccurrenceId } from "../../packages/pipeline/src/materialize/operational-occurrence-identity";
import {
  loadOperationalOccurrenceIdentityOperations,
  operationalOccurrenceIdentityRegistryV2Jsonl,
  parseOperationalOccurrenceIdentityOperation,
  replayOperationalOccurrenceIdentityOperations,
  type OperationalOccurrenceIdentityOperation,
} from "../../packages/pipeline/src/materialize/operational-occurrence-identity-operations";
import {
  operationalOccurrenceCurrentReviewMembershipFingerprint,
  parseOperationalOccurrenceAcceptedDecisionV3,
  type OperationalOccurrenceAcceptedDecisionV3,
} from "../../packages/pipeline/src/materialize/operational-occurrence-resolution";
import type { OperationalOccurrenceReviewV1EvidenceBinding } from "../../packages/pipeline/src/materialize/operational-occurrence-review";
import { resolvedInterventionDurableApplicationIdentity } from "../../packages/pipeline/src/materialize/resolved-intervention-applications";

type FrozenCandidate = {
  candidate_id: string;
  candidate_key: string;
  disposition: string;
  evidence_bindings: Array<{
    record_id: string;
    source_id: string;
    evidence_id: string;
  }>;
  observation_event_record_ids: string[];
  observation_relation_record_ids: string[];
};
export type Plan052ApplicationSpec = {
  route_record_id: string;
  gtfs_route_id: string;
  route_evidence_id: string;
  treatment_record_id: string;
  treatment_evidence_id: string;
};
export type Plan052PositiveSpec = {
  batch_id: string;
  candidate_id: string;
  event_id: string;
  event_evidence_id: string;
  onset: {
    date: string;
    precision: "day" | "month" | "year" | "season" | "upper_bound_day";
  };
  applications: Plan052ApplicationSpec[];
  rationale: string;
};
export type Plan052AliasSpec = {
  batch_id: string;
  candidate_id: string;
  canonical_candidate_id: string;
  rationale: string;
};
export type Plan052InsufficientSpec = {
  batch_id: string;
  candidate_id: string;
  rationale: string;
  known_facts: string[];
  prohibited_inferences: string[];
};
export type Plan052PositiveIntegrationConfig = {
  integration_id: string;
  accepted_at: string;
  issued_at_prefix: string;
  positives: Plan052PositiveSpec[];
  aliases?: Plan052AliasSpec[];
  insufficient?: Plan052InsufficientSpec[];
  extra_authority_paths?: string[];
};

const campaign = "data/operational-episode-resolution/campaigns/plan-052";
const frozenCandidatesRelative = `${campaign}/frozen-frontier/candidate_ledger.jsonl`;
const reviewDir = "data/operational-occurrence-review/accepted-current/decisions";
const terminalDecisionDir =
  "data/operational-episode-resolution/decisions/accepted-current";
const mappingDir =
  "data/operational-episode-resolution/adapters/accepted-current";
const identityMigrationDir =
  "data/operational-occurrence-identities/operations";
const identityAcceptedDir =
  "data/operational-occurrence-identities/accepted-current/operations";
const identityReceiptDir =
  "data/operational-occurrence-identities/accepted-current/receipts";
const identityCurrentRegistry =
  "data/operational-occurrence-identities/registry-current.jsonl";

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}
function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}
function pointer(relativePath: string): { path: string; sha256: string } {
  return { path: relativePath, sha256: sha256(readFileSync(absolute(relativePath))) };
}
function pointerFromFiles(
  relativePath: string,
  files: ReadonlyMap<string, string>,
): { path: string; sha256: string } {
  const bytes = files.get(relativePath);
  if (bytes === undefined) throw new Error(`missing generated ${relativePath}`);
  return { path: relativePath, sha256: sha256(bytes) };
}
function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(absolute(relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
function binding(
  records: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
  evidenceId: string,
  role: OperationalOccurrenceReviewV1EvidenceBinding["role"],
): OperationalOccurrenceReviewV1EvidenceBinding {
  const record = records.get(recordId);
  const refs = record?.evidence_refs.filter((ref) => ref.evidence_id === evidenceId) ?? [];
  const sources = [...new Set(refs.map((ref) => ref.source_id))];
  if (
    !record ||
    record.truth_status !== "source_stated" ||
    record.review_state === "quarantined" ||
    refs.length === 0 ||
    sources.length !== 1
  ) {
    throw new Error(`${recordId} lacks exact eligible evidence ${evidenceId}`);
  }
  return { role, record_id: recordId, source_id: sources[0]!, evidence_id: evidenceId };
}
function uniqueBindings(
  values: readonly OperationalOccurrenceReviewV1EvidenceBinding[],
): OperationalOccurrenceReviewV1EvidenceBinding[] {
  return [...new Map(values.map((value) => [
    [value.role, value.record_id, value.source_id, value.evidence_id].join("|"),
    value,
  ])).values()].sort((left, right) =>
    [left.role, left.record_id, left.source_id, left.evidence_id].join("|")
      .localeCompare([right.role, right.record_id, right.source_id, right.evidence_id].join("|"))
  );
}
function plainEvidence(
  values: readonly OperationalOccurrenceReviewV1EvidenceBinding[],
): Array<{ record_id: string; source_id: string; evidence_id: string }> {
  return [...new Map(values.map((value) => [
    [value.record_id, value.source_id, value.evidence_id].join("|"),
    {
      record_id: value.record_id,
      source_id: value.source_id,
      evidence_id: value.evidence_id,
    },
  ])).values()].sort((left, right) =>
    [left.record_id, left.source_id, left.evidence_id].join("|")
      .localeCompare([right.record_id, right.source_id, right.evidence_id].join("|"))
  );
}
function authorityPaths(batchId: string): string[] {
  const base = `${campaign}/proposed-review-receipts/${batchId}`;
  const cleanIndependent = `${base}/independent-clean.json`;
  const standardAdjudication = `${base}/adjudication-independent.json`;
  const alternateAdjudication = `${base}/blind-adjudication.json`;
  return [
    `${campaign}/batches/${batchId}.json`,
    `${base}/primary.json`,
    existsSync(absolute(cleanIndependent)) ? cleanIndependent : `${base}/independent.json`,
    existsSync(absolute(standardAdjudication))
      ? standardAdjudication
      : alternateAdjudication,
  ];
}
function decisionFor(
  config: Plan052PositiveIntegrationConfig,
  spec: Plan052PositiveSpec,
  frozen: FrozenCandidate,
  records: ReadonlyMap<string, MtaCanonicalRecord>,
): OperationalOccurrenceAcceptedDecisionV3 {
  const occurrenceId = deterministicOperationalOccurrenceId(frozen.candidate_key);
  const onsetBinding = binding(records, spec.event_id, spec.event_evidence_id, "event_date");
  const routeRows = [...new Map(spec.applications.map((application) => [
    application.route_record_id,
    application,
  ])).values()].map((application) => ({
    route_record_id: application.route_record_id,
    gtfs_route_id: application.gtfs_route_id,
    evidence_bindings: [
      binding(records, application.route_record_id, application.route_evidence_id, "route_identity"),
    ],
  })).sort((left, right) => left.route_record_id.localeCompare(right.route_record_id));
  const treatmentRows = [...new Map(spec.applications.map((application) => [
    application.treatment_record_id,
    application,
  ])).values()].map((application) => {
    const record = records.get(application.treatment_record_id);
    const family = record?.payload.treatment_family;
    if (typeof family !== "string" || !family) {
      throw new Error(`${application.treatment_record_id} lacks treatment_family`);
    }
    return {
      treatment_record_id: application.treatment_record_id,
      treatment_family: family,
      evidence_bindings: [
        binding(
          records,
          application.treatment_record_id,
          application.treatment_evidence_id,
          "treatment_definition",
        ),
      ],
    };
  }).sort((left, right) => left.treatment_record_id.localeCompare(right.treatment_record_id));
  const routeById = new Map(routeRows.map((row) => [row.route_record_id, row]));
  const treatmentById = new Map(treatmentRows.map((row) => [row.treatment_record_id, row]));
  const applications = spec.applications.map((application) => {
    const evidence = uniqueBindings([
      onsetBinding,
      ...routeById.get(application.route_record_id)!.evidence_bindings,
      ...treatmentById.get(application.treatment_record_id)!.evidence_bindings,
    ]);
    return {
      application_id: resolvedInterventionDurableApplicationIdentity({
        occurrence_id: occurrenceId,
        route_record_id: application.route_record_id,
        treatment_record_id: application.treatment_record_id,
        phase_record_id: spec.event_id,
      }),
      route_record_id: application.route_record_id,
      gtfs_route_id: application.gtfs_route_id,
      treatment_record_id: application.treatment_record_id,
      phase_record_id: spec.event_id,
      action: "unknown" as const,
      physical_scope_record_ids: [],
      extent: { kind: "unknown" as const, record_ids: [], description: null },
      evidence_bindings: evidence,
    };
  }).sort((left, right) =>
    [left.route_record_id, left.treatment_record_id, left.phase_record_id].join("|")
      .localeCompare([right.route_record_id, right.treatment_record_id, right.phase_record_id].join("|"))
  );
  const incidence = applications.map((row) =>
    [row.route_record_id, row.treatment_record_id, row.phase_record_id].join("|")
  );
  if (incidence.length === 0 || new Set(incidence).size !== incidence.length) {
    throw new Error(`${spec.candidate_id} has invalid explicit incidence`);
  }
  const allEvidence = uniqueBindings([
    onsetBinding,
    ...routeRows.flatMap((row) => row.evidence_bindings),
    ...treatmentRows.flatMap((row) => row.evidence_bindings),
  ]);
  const withoutFingerprint = {
    schema_version: 3 as const,
    decision_id:
      `plan-052-${config.integration_id}-${spec.candidate_id.replace("candidate:", "")}`,
    review_state: "approved" as const,
    occurrence_id: occurrenceId,
    founding_key: frozen.candidate_key,
    anchor_review_decision_ids: [],
    observation_event_record_ids: frozen.observation_event_record_ids,
    observation_relation_record_ids: [...frozen.observation_relation_record_ids].sort(),
    resolution_cluster_id: null,
    phase_record_ids: [spec.event_id],
    phase_relation_record_ids: [],
    physical_scope_record_ids: [],
    physical_scope_relation_record_ids: [],
    resolved_onset: { ...spec.onset, evidence_bindings: [onsetBinding] },
    routes: routeRows,
    treatment: treatmentRows.length === 1
      ? { kind: "atomic" as const, member: treatmentRows[0]! }
      : {
          kind: "bundle" as const,
          bundle_family: null,
          bundle_family_evidence_bindings: [],
          members: treatmentRows,
        },
    applications,
    evidence_bindings: allEvidence,
    reviewers: [
      `plan-052-${spec.batch_id}-primary-reviewer`,
      `plan-052-${spec.batch_id}-independent-reviewer`,
      "plan-052-blind-adjudicator",
      "plan-052-single-frontier-integrator",
    ],
    accepted_at: config.accepted_at,
    rationale: spec.rationale,
    operation: "establish_current_resolution" as const,
    supersedes_decision_id: null,
    supersedes_membership_fingerprint: null,
    review_scope: "full_episode_application" as const,
  };
  return parseOperationalOccurrenceAcceptedDecisionV3({
    ...withoutFingerprint,
    membership_fingerprint:
      operationalOccurrenceCurrentReviewMembershipFingerprint(withoutFingerprint),
  });
}
function operationFor(
  config: Plan052PositiveIntegrationConfig,
  frozen: FrozenCandidate,
  decision: OperationalOccurrenceAcceptedDecisionV3,
  index: number,
): OperationalOccurrenceIdentityOperation {
  return parseOperationalOccurrenceIdentityOperation({
    schema_version: 1,
    operation_id: `establish:${decision.occurrence_id}`,
    kind: "establish",
    issued_at: `${config.issued_at_prefix}${String(index).padStart(2, "0")}.000Z`,
    reviewer: `plan-052-${config.integration_id}-review-board`,
    decision_id: decision.decision_id,
    rationale: decision.rationale,
    affected_founding_event_record_ids: frozen.observation_event_record_ids,
    occurrence_id: decision.occurrence_id,
    founding_key: frozen.candidate_key,
    founding_event_record_ids: frozen.observation_event_record_ids,
    resolution_cluster_id: null,
  });
}
function expectedFiles(config: Plan052PositiveIntegrationConfig): Map<string, string> {
  if (!/^[a-z0-9-]+$/u.test(config.integration_id)) {
    throw new Error("integration_id must be lowercase kebab-case");
  }
  const aliases = config.aliases ?? [];
  const insufficient = config.insufficient ?? [];
  const allCandidateIds = [
    ...config.positives.map((row) => row.candidate_id),
    ...aliases.map((row) => row.candidate_id),
    ...insufficient.map((row) => row.candidate_id),
  ];
  if (new Set(allCandidateIds).size !== allCandidateIds.length) {
    throw new Error("integration repeats a candidate");
  }
  const frozenRows = readJsonl<FrozenCandidate>(frozenCandidatesRelative);
  const frozenById = new Map(frozenRows.map((row) => [row.candidate_id, row]));
  const records = new Map(readCanonicalRecords().map((record) => [record.record_id, record]));
  const files = new Map<string, string>();
  const decisions = config.positives.map((spec) => {
    const frozen = frozenById.get(spec.candidate_id);
    if (
      !frozen ||
      frozen.disposition !== "pending_review" ||
      frozen.observation_event_record_ids.length !== 1 ||
      frozen.observation_event_record_ids[0] !== spec.event_id
    ) {
      throw new Error(`${spec.candidate_id} frozen membership drifted`);
    }
    return decisionFor(config, spec, frozen, records);
  });
  const operations = config.positives.map((spec, index) =>
    operationFor(config, frozenById.get(spec.candidate_id)!, decisions[index]!, index)
  );
  for (const [index, spec] of config.positives.entries()) {
    const frozen = frozenById.get(spec.candidate_id)!;
    const decision = decisions[index]!;
    const operation = operations[index]!;
    const mapping = parseOperationalEpisodeAcceptedMapping({
      schema_version: 1,
      mapping_id: `mapping:${decision.occurrence_id}`,
      adapter_id: "accepted_mapping_v1",
      observation_event_record_ids: frozen.observation_event_record_ids,
      observation_relation_record_ids: frozen.observation_relation_record_ids,
      candidate_keys: [frozen.candidate_key],
      occurrence_id: decision.occurrence_id,
      evidence_bindings: plainEvidence(decision.evidence_bindings),
      decision_id: decision.decision_id,
      reviewer: `plan-052-${config.integration_id}-review-board`,
      reviewed_at: config.accepted_at,
      rationale: spec.rationale,
    });
    files.set(`${reviewDir}/${decision.decision_id}.json`, json(decision));
    files.set(`${mappingDir}/${mapping.mapping_id}.json`, json(mapping));
    files.set(`${identityAcceptedDir}/${operation.operation_id}.json`, json(operation));
  }
  const terminalArtifacts: Array<Record<string, unknown>> = [];
  for (const spec of aliases) {
    const frozen = frozenById.get(spec.candidate_id);
    const target = frozenById.get(spec.canonical_candidate_id);
    if (!frozen || !target || frozen.disposition !== "pending_review") {
      throw new Error(`${spec.candidate_id} alias membership drifted`);
    }
    const suffix = spec.candidate_id.replace("candidate:", "");
    const decisionId = `plan-052-${config.integration_id}-alias-${suffix}`;
    const decisionRelative = `${terminalDecisionDir}/${decisionId}.json`;
    const mappingRelative =
      `${mappingDir}/plan-052-${config.integration_id}-alias-mapping-${suffix}.json`;
    files.set(decisionRelative, json({
      schema_version: 1,
      decision_id: decisionId,
      candidate_key: frozen.candidate_key,
      disposition: "duplicate_alias",
      canonical_candidate_key: target.candidate_key,
      successor_occurrence_ids: [],
      reviewer: `plan-052-${config.integration_id}-review-board`,
      decided_at: config.accepted_at,
      rationale: spec.rationale,
      evidence_bindings: frozen.evidence_bindings,
    }));
    files.set(mappingRelative, json({
      schema_version: 1,
      mapping_id: `plan-052-${config.integration_id}-alias-mapping-${suffix}`,
      adapter_id: "accepted_mapping_v1",
      observation_event_record_ids: frozen.observation_event_record_ids,
      observation_relation_record_ids: frozen.observation_relation_record_ids,
      candidate_keys: [frozen.candidate_key],
      occurrence_id: null,
      evidence_bindings: frozen.evidence_bindings,
      decision_id: decisionId,
      reviewer: "plan-052-single-frontier-integrator",
      reviewed_at: config.accepted_at,
      rationale: spec.rationale,
    }));
    terminalArtifacts.push({
      candidate_id: spec.candidate_id,
      disposition: "duplicate_alias",
      canonical_candidate_id: spec.canonical_candidate_id,
      decision_path: decisionRelative,
      mapping_path: mappingRelative,
    });
  }
  for (const spec of insufficient) {
    const frozen = frozenById.get(spec.candidate_id);
    if (!frozen || frozen.disposition !== "pending_review") {
      throw new Error(`${spec.candidate_id} insufficient membership drifted`);
    }
    const suffix = spec.candidate_id.replace("candidate:", "");
    const gapRelative =
      `${campaign}/evidence-gap-receipts/${config.integration_id}/${suffix}.json`;
    const decisionId = `plan-052-${config.integration_id}-insufficient-${suffix}`;
    const decisionRelative = `${terminalDecisionDir}/${decisionId}.json`;
    const mappingRelative =
      `${mappingDir}/plan-052-${config.integration_id}-insufficient-mapping-${suffix}.json`;
    const authorityPointers = authorityPaths(spec.batch_id).map(pointer);
    const gapBytes = json({
      schema_version: 1,
      contract_id: "plan-052-evidence-gap-receipt-v1",
      plan_id: "plan-052",
      batch_id: spec.batch_id,
      candidate_id: spec.candidate_id,
      candidate_key: frozen.candidate_key,
      disposition: "insufficient_evidence",
      evidence_bindings: frozen.evidence_bindings,
      known_facts: spec.known_facts,
      prohibited_inferences: spec.prohibited_inferences,
      manifest: authorityPointers[0],
      review_receipts: authorityPointers.slice(1),
      recorded_at: config.accepted_at,
    });
    files.set(gapRelative, gapBytes);
    files.set(decisionRelative, json({
      schema_version: 1,
      decision_id: decisionId,
      candidate_key: frozen.candidate_key,
      disposition: "insufficient_evidence",
      canonical_candidate_key: null,
      successor_occurrence_ids: [],
      reviewer: `plan-052-${config.integration_id}-review-board`,
      decided_at: config.accepted_at,
      rationale: spec.rationale,
      evidence_bindings: frozen.evidence_bindings,
      evidence_gap_receipt_path: gapRelative,
      evidence_gap_receipt_sha256: sha256(gapBytes),
    }));
    files.set(mappingRelative, json({
      schema_version: 1,
      mapping_id: `plan-052-${config.integration_id}-insufficient-mapping-${suffix}`,
      adapter_id: "accepted_mapping_v1",
      observation_event_record_ids: frozen.observation_event_record_ids,
      observation_relation_record_ids: frozen.observation_relation_record_ids,
      candidate_keys: [frozen.candidate_key],
      occurrence_id: null,
      evidence_bindings: frozen.evidence_bindings,
      decision_id: decisionId,
      reviewer: "plan-052-single-frontier-integrator",
      reviewed_at: config.accepted_at,
      rationale: spec.rationale,
    }));
    terminalArtifacts.push({
      candidate_id: spec.candidate_id,
      disposition: "insufficient_evidence",
      evidence_gap_path: gapRelative,
      decision_path: decisionRelative,
      mapping_path: mappingRelative,
    });
  }
  const migration = loadOperationalOccurrenceIdentityOperations(absolute(identityMigrationDir));
  const existingAccepted = existsSync(absolute(identityAcceptedDir))
    ? loadOperationalOccurrenceIdentityOperations(absolute(identityAcceptedDir))
    : [];
  const managedIds = new Set(operations.map((operation) => operation.operation_id));
  const ordered = [
    ...existingAccepted.filter((operation) => !managedIds.has(operation.operation_id)),
    ...operations,
  ].sort((left, right) =>
    left.issued_at.localeCompare(right.issued_at) ||
    left.operation_id.localeCompare(right.operation_id)
  );
  let priorRegistry = operationalOccurrenceIdentityRegistryV2Jsonl(
    replayOperationalOccurrenceIdentityOperations(migration),
  );
  const applied: OperationalOccurrenceIdentityOperation[] = [];
  for (const operation of ordered) {
    applied.push(operation);
    const resultRegistry = operationalOccurrenceIdentityRegistryV2Jsonl(
      replayOperationalOccurrenceIdentityOperations([...migration, ...applied]),
    );
    if (managedIds.has(operation.operation_id)) {
      const decision = decisions.find((row) => row.decision_id === operation.decision_id)!;
      const spec = config.positives.find((row) =>
        deterministicOperationalOccurrenceId(
          frozenById.get(row.candidate_id)!.candidate_key,
        ) === operation.occurrence_id
      )!;
      const operationRelative = `${identityAcceptedDir}/${operation.operation_id}.json`;
      const operationBytes =
        files.get(operationRelative) ?? readFileSync(absolute(operationRelative), "utf8");
      files.set(`${identityReceiptDir}/${operation.operation_id}.json`, json({
        schema_version: 1,
        operation_id: operation.operation_id,
        batch_id: spec.batch_id,
        batch_manifest_path: `${campaign}/batches/${spec.batch_id}.json`,
        batch_manifest_sha256:
          pointer(`${campaign}/batches/${spec.batch_id}.json`).sha256,
        primary_reviewer: "plan-052-batch-primary-reviewer",
        independent_reviewer: "plan-052-batch-independent-reviewer",
        evidence_bindings: plainEvidence(decision.evidence_bindings),
        basis_registry_sha256: sha256(priorRegistry),
        operation_sha256: sha256(operationBytes),
        result_registry_sha256: sha256(resultRegistry),
      }));
    }
    priorRegistry = resultRegistry;
  }
  files.set(identityCurrentRegistry, priorRegistry);
  const batchIds = [...new Set([
    ...config.positives.map((row) => row.batch_id),
    ...aliases.map((row) => row.batch_id),
    ...insufficient.map((row) => row.batch_id),
  ])].sort();
  const authorities = [
    ...batchIds.flatMap(authorityPaths),
    ...(config.extra_authority_paths ?? []),
  ].map(pointer);
  const positiveArtifacts = config.positives.map((spec, index) => {
    const decision = decisions[index]!;
    const operation = operations[index]!;
    return {
      batch_id: spec.batch_id,
      candidate_id: spec.candidate_id,
      occurrence_id: decision.occurrence_id,
      review_decision: pointerFromFiles(`${reviewDir}/${decision.decision_id}.json`, files),
      identity_operation:
        pointerFromFiles(`${identityAcceptedDir}/${operation.operation_id}.json`, files),
      identity_receipt:
        pointerFromFiles(`${identityReceiptDir}/${operation.operation_id}.json`, files),
      mapping:
        pointerFromFiles(`${mappingDir}/mapping:${decision.occurrence_id}.json`, files),
      exact_application_incidence: decision.applications.map((application) =>
        [
          application.route_record_id,
          application.gtfs_route_id,
          application.treatment_record_id,
          application.phase_record_id,
        ].join("|")
      ),
      reviewed_action_extent_deferred_to_plan053:
        decision.applications.every((application) =>
          application.action === "unknown" && application.extent.kind === "unknown"
        ),
    };
  });
  const integrationRelative =
    `${campaign}/integration-receipts/${config.integration_id}-v1.json`;
  const reconciliationRelative =
    `${campaign}/reconciliation-receipts/${config.integration_id}-v1.json`;
  const integrationBytes = json({
    schema_version: 1,
    contract_id: "plan-052-reviewed-positive-integration-v1",
    plan_id: "plan-052",
    integration_id: config.integration_id,
    integrated_at: config.accepted_at,
    integrator: "plan-052-single-frontier-integrator",
    authorities,
    positive_artifacts: positiveArtifacts,
    terminal_artifacts: terminalArtifacts.map((artifact) => {
      const paths = Object.entries(artifact)
        .filter(([key, value]) => key.endsWith("_path") && typeof value === "string")
        .map(([key, value]) => [key.replace(/_path$/u, ""), pointerFromFiles(String(value), files)]);
      return {
        ...Object.fromEntries(
          Object.entries(artifact).filter(([key]) => !key.endsWith("_path")),
        ),
        ...Object.fromEntries(paths),
      };
    }),
    exact_arithmetic: {
      published_candidates: positiveArtifacts.length,
      duplicate_alias_candidates: aliases.length,
      insufficient_evidence_candidates: insufficient.length,
      accounted_candidates: allCandidateIds.length,
      accounted_observations: allCandidateIds.reduce(
        (sum, candidateId) =>
          sum + frozenById.get(candidateId)!.observation_event_record_ids.length,
        0,
      ),
      application_count: positiveArtifacts.reduce(
        (sum, artifact) => sum + artifact.exact_application_incidence.length,
        0,
      ),
    },
    historical_migration_files_changed: false,
    canonical_observations_changed: false,
    publication_or_release_authorized: false,
    provider_usage: {
      request_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
    },
  });
  files.set(integrationRelative, integrationBytes);
  files.set(reconciliationRelative, json({
    schema_version: 1,
    contract_id: "plan-052-reviewed-positive-reconciliation-v1",
    plan_id: "plan-052",
    integration_id: config.integration_id,
    reconciled_at: config.accepted_at,
    reconciler: "plan-052-single-frontier-integrator",
    authorities,
    positive_candidate_ids: config.positives.map((row) => row.candidate_id).sort(),
    duplicate_aliases: aliases,
    insufficient_evidence: insufficient,
    integration_receipt: {
      path: integrationRelative,
      sha256: sha256(integrationBytes),
    },
  }));
  return files;
}

export function runPlan052PositiveIntegration(
  config: Plan052PositiveIntegrationConfig,
  mode: "--write" | "--check" | "--repair-unaccepted",
): void {
  const files = expectedFiles(config);
  if (mode === "--write") {
    const collisions = [...files.keys()].filter((relativePath) =>
      relativePath !== identityCurrentRegistry && existsSync(absolute(relativePath))
    );
    if (collisions.length > 0) {
      throw new Error(`Plan 052 artifacts already exist; no files written:\n${collisions.join("\n")}`);
    }
  }
  if (mode === "--repair-unaccepted") {
    const repairRelative =
      `${campaign}/integration-receipts/${config.integration_id}-unaccepted-repair-v1.json`;
    if (existsSync(absolute(repairRelative))) {
      throw new Error(`Plan 052 repair receipt already exists: ${repairRelative}`);
    }
    const changed = [...files].flatMap(([relativePath, content]) => {
      if (!existsSync(absolute(relativePath))) {
        throw new Error(`unaccepted repair target is missing: ${relativePath}`);
      }
      const previous = readFileSync(absolute(relativePath));
      const previousSha256 = sha256(previous);
      const replacementSha256 = sha256(content);
      return previousSha256 === replacementSha256
        ? []
        : [{
            path: relativePath,
            previous_sha256: previousSha256,
            replacement_sha256: replacementSha256,
          }];
    });
    if (changed.length === 0) {
      throw new Error(`${config.integration_id} has no unaccepted drift to repair`);
    }
    mkdirSync(dirname(absolute(repairRelative)), { recursive: true });
    writeFileSync(absolute(repairRelative), json({
      schema_version: 1,
      contract_id: "plan-052-unaccepted-integration-repair-v1",
      plan_id: "plan-052",
      integration_id: config.integration_id,
      repaired_at: config.accepted_at,
      integrator: "plan-052-single-frontier-integrator",
      reason:
        "The first authoritative frontier replay rejected the generated evidence-gap receipt's unsupported review_authorities field before any accepted frontier checkpoint. This append-only receipt preserves every replaced byte hash while the same semantic ruling is regenerated with the strict manifest and review_receipts fields.",
      accepted_checkpoint_preceded_repair: false,
      changed_files: changed,
    }), "utf8");
  }
  for (const [relativePath, content] of files) {
    const target = absolute(relativePath);
    if (mode === "--write" || mode === "--repair-unaccepted") {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    } else if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      throw new Error(`Plan 052 artifact is stale: ${relativePath}`);
    }
  }
  if (mode === "--check") {
    const frozenById = new Map(
      readJsonl<FrozenCandidate>(frozenCandidatesRelative)
        .map((row) => [row.candidate_id, row]),
    );
    const operationIds = new Set(config.positives.map((spec) =>
      `establish:${deterministicOperationalOccurrenceId(
        frozenById.get(spec.candidate_id)!.candidate_key,
      )}`
    ));
    const managed = readdirSync(absolute(identityAcceptedDir))
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(
        readFileSync(join(absolute(identityAcceptedDir), name), "utf8"),
      ) as { operation_id: string })
      .filter((row) => operationIds.has(row.operation_id));
    if (managed.length !== operationIds.size) {
      throw new Error(`${config.integration_id} identity operation membership drifted`);
    }
  }
}
