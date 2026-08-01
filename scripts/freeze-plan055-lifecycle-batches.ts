import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import type { ApplicationPlacementTransition } from "../packages/pipeline/src/materialize/application-placement-transitions";
import type { InterventionLifecycleAssertion } from "../packages/pipeline/src/materialize/intervention-lifecycle";
import type { InterventionPlacementRegistryEntry } from "../packages/pipeline/src/materialize/intervention-placements";
import type { ResolvedInterventionApplication } from "../packages/pipeline/src/materialize/resolved-intervention-applications";
import type { ResolvedInterventionEpisode } from "../packages/pipeline/src/materialize/resolved-interventions";

const PLAN_ID = "plan-055";
const STARTING_COMMIT = "81f895417a47e36214b00aab483d482742f80099";
const CAMPAIGN = "data/intervention-lifecycle/campaigns/plan-055";
const FROZEN = `${CAMPAIGN}/frozen-cohort`;
const BATCHES = `${CAMPAIGN}/batches`;
const PORTFOLIO = `${CAMPAIGN}/portfolio.json`;
const PRODUCTION_AS_OF = "2026-07-27";
const REPRESENTATIVE_DATES = [
  "2025-06-28",
  "2025-06-29",
  "2025-06-30",
  PRODUCTION_AS_OF,
] as const;
const CONTRACT_VERSION = "intervention-lifecycle-review-v1";

type Artifact = { path: string; bytes: number; sha256: string };
type EvidenceBinding = {
  record_id: string;
  source_id: string;
  evidence_id: string;
  role: string;
  canonical_record_sha256: string;
  evidence_text_sha256: string;
};
type LifecycleCandidate = {
  schema_version: 1;
  lifecycle_candidate_id: string;
  placement_id: string;
  registry_entry_sha256: string;
  placement_head: {
    founding_key: string;
    identity_decision_ids: string[];
    operation_ids: string[];
  };
  transition_id: string;
  transition_sha256: string;
  application_id: string;
  application_sha256: string;
  application_action: string;
  occurrence_id: string;
  episode_sha256: string;
  resolved_onset: ResolvedInterventionEpisode["resolved_onset"];
  evidence_bindings: EvidenceBinding[];
  document_source_id: string;
  document_time_source_values: {
    published_date_normalized: string | null;
    published_date_precision: string | null;
    retrieved_date_normalized: string | null;
    retrieval_provenance: string | null;
  };
  document_time_candidate: InterventionLifecycleAssertion["document_time"];
  valid_time_candidate: InterventionLifecycleAssertion["valid_time"];
  phase_semantics: {
    lifecycle_phase: string | null;
    lifecycle_phase_other: string | null;
    event_kind: string | null;
    raw_text: string | null;
  };
  risk_classes: string[];
  candidate_sha256: string;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function canonical(value: unknown): string {
  return stableJson(value as JsonValue);
}
function json(value: unknown): string {
  return `${canonical(value)}\n`;
}
function jsonl(values: readonly unknown[]): string {
  return values.length ? `${values.map(canonical).join("\n")}\n` : "";
}
function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}
function startingBytes(relativePath: string): Buffer {
  return execFileSync("git", ["show", `${STARTING_COMMIT}:${relativePath}`], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 512 * 1024 * 1024,
  });
}
function startingJson<T>(relativePath: string): T {
  return JSON.parse(startingBytes(relativePath).toString("utf8")) as T;
}
function startingJsonl<T>(relativePath: string): T[] {
  const value = startingBytes(relativePath).toString("utf8").trim();
  return value ? value.split("\n").map((line) => JSON.parse(line) as T) : [];
}
function startingArtifact(relativePath: string): Artifact {
  const value = startingBytes(relativePath);
  return { path: relativePath, bytes: value.length, sha256: sha256(value) };
}
function contentArtifact(path: string, content: string): Artifact {
  return { path, bytes: Buffer.byteLength(content), sha256: sha256(content) };
}
function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function partialDate(value: unknown): string | null {
  const result = text(value);
  return result && /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/u.test(result) ? result : null;
}

function onsetBounds(
  onset: ResolvedInterventionEpisode["resolved_onset"],
): InterventionLifecycleAssertion["valid_time"] {
  if (onset.precision === "day") {
    return {
      coverage_kind: "point",
      start_earliest: onset.date,
      start_latest: onset.date,
      end_earliest: null,
      end_latest: null,
      precision: "day",
    };
  }
  if (onset.precision === "month") {
    const [year, month] = onset.date.split("-").map(Number);
    const last = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
    return {
      coverage_kind: "point",
      start_earliest: `${onset.date}-01`,
      start_latest: `${onset.date}-${String(last).padStart(2, "0")}`,
      end_earliest: null,
      end_latest: null,
      precision: "month",
    };
  }
  if (onset.precision === "upper_bound_day") {
    return {
      coverage_kind: "point",
      start_earliest: "0001-01-01",
      start_latest: onset.date,
      end_earliest: null,
      end_latest: null,
      precision: "range",
    };
  }
  if (onset.precision !== "season") {
    throw new Error(`Plan 055 unsupported onset precision: ${onset.precision}`);
  }
  const [year, season] = onset.date.split("-");
  const seasonBounds: Record<string, [string, string]> = {
    winter: ["01-01", "03-31"],
    spring: ["04-01", "06-30"],
    summer: ["07-01", "09-30"],
    fall: ["10-01", "12-31"],
  };
  const bounds = seasonBounds[season!];
  if (!bounds) throw new Error(`Plan 055 unsupported onset season: ${onset.date}`);
  return {
    coverage_kind: "point",
    start_earliest: `${year}-${bounds[0]}`,
    start_latest: `${year}-${bounds[1]}`,
    end_earliest: null,
    end_latest: null,
    precision: "range",
  };
}

function canonicalRecords(): MtaCanonicalRecord[] {
  return [
    "sources",
    "entities",
    "projects",
    "corridors",
    "events",
    "routes",
    "treatment_components",
    "claims",
    "metric_claims",
    "source_gaps",
    "relations",
  ].flatMap((kind) => startingJsonl<MtaCanonicalRecord>(`data/canonical/${kind}.jsonl`));
}

function evidenceBinding(
  binding: { record_id: string; source_id: string; evidence_id: string; role: string },
  records: ReadonlyMap<string, MtaCanonicalRecord>,
): EvidenceBinding {
  const record = records.get(binding.record_id);
  if (!record || record.truth_status !== "source_stated" || record.review_state === "quarantined") {
    throw new Error(`Plan 055 evidence record is unavailable: ${binding.record_id}`);
  }
  const evidence = record.evidence_refs.find((ref) =>
    ref.source_id === binding.source_id && ref.evidence_id === binding.evidence_id
  );
  const evidenceTextSha = evidence?.text_sha256?.replace(/^sha256:/u, "");
  if (!evidence || !evidenceTextSha) {
    throw new Error(`Plan 055 evidence binding is stale: ${binding.evidence_id}`);
  }
  return {
    ...binding,
    canonical_record_sha256: sha256(canonical(record)),
    evidence_text_sha256: evidenceTextSha,
  };
}

function buildCandidates(): LifecycleCandidate[] {
  const registry = startingJsonl<InterventionPlacementRegistryEntry>(
    "data/resolved-transit/operator/v1/placements/registry.jsonl",
  );
  const transitions = startingJsonl<ApplicationPlacementTransition>(
    "data/resolved-transit/operator/v1/placements/transitions.jsonl",
  );
  const applications = startingJsonl<ResolvedInterventionApplication>(
    "data/resolved-transit/operator/v1/interventions/applications.jsonl",
  );
  const episodes = startingJsonl<ResolvedInterventionEpisode>(
    "data/resolved-transit/operator/v1/interventions/episodes.jsonl",
  );
  const records = canonicalRecords();
  const recordsById = new Map(records.map((row) => [row.record_id, row]));
  const sourcesBySourceId = new Map(records
    .filter((row) => row.record_kind === "source")
    .map((row) => [row.source_id, row]));
  const transitionsByPlacement = new Map<string, ApplicationPlacementTransition>();
  for (const transition of transitions) {
    for (const placementId of transition.result_placement_ids) {
      if (transitionsByPlacement.has(placementId)) {
        throw new Error(`Plan 055 placement has multiple founding transitions: ${placementId}`);
      }
      transitionsByPlacement.set(placementId, transition);
    }
  }
  const applicationsById = new Map(applications.map((row) => [row.application_id, row]));
  const episodesById = new Map(episodes.map((row) => [row.occurrence_id, row]));
  const live = registry.filter((row) => row.registry_state === "live_identity")
    .sort((left, right) => left.placement_id.localeCompare(right.placement_id));
  if (live.length !== 104 || transitionsByPlacement.size !== 104) {
    throw new Error(
      `Plan 055 dependency drift: live=${live.length}; founding=${transitionsByPlacement.size}`,
    );
  }

  return live.map((placement): LifecycleCandidate => {
    const transition = transitionsByPlacement.get(placement.placement_id);
    if (!transition || transition.action !== "add" || transition.target_placement_ids.length !== 0 ||
        transition.result_placement_ids.length !== 1) {
      throw new Error(`Plan 055 founding transition is not an exact add: ${placement.placement_id}`);
    }
    const application = applicationsById.get(transition.application_id);
    const episode = application ? episodesById.get(application.occurrence_id) : undefined;
    if (!application || !episode || application.action !== "add" ||
        !episode.phase_record_ids.includes(application.phase_record_id)) {
      throw new Error(`Plan 055 founding application drift: ${placement.placement_id}`);
    }
    const phaseRecord = recordsById.get(application.phase_record_id);
    if (!phaseRecord || phaseRecord.record_kind !== "event" ||
        phaseRecord.truth_status !== "source_stated" || phaseRecord.review_state === "quarantined") {
      throw new Error(`Plan 055 phase evidence is unavailable: ${application.phase_record_id}`);
    }
    const phaseBindings = episode.evidence_bindings.filter((binding) =>
      binding.record_id === application.phase_record_id
    );
    if (phaseBindings.length === 0) {
      throw new Error(`Plan 055 phase has no exact episode evidence: ${application.phase_record_id}`);
    }
    const rawBindings = [
      ...transition.evidence_bindings,
      ...phaseBindings,
    ];
    const byIdentity = new Map<string, typeof rawBindings[number]>();
    for (const binding of rawBindings) {
      const key = `${binding.record_id}|${binding.source_id}|${binding.evidence_id}`;
      const existing = byIdentity.get(key);
      byIdentity.set(key, existing ? { ...binding, role: sortedUnique([existing.role, binding.role]).join("+") } : binding);
    }
    const evidence = [...byIdentity.values()].map((binding) => evidenceBinding(binding, recordsById))
      .sort((left, right) => canonical(left).localeCompare(canonical(right)));
    const documentSourceId = phaseRecord.source_id;
    const sourceRecord = sourcesBySourceId.get(documentSourceId);
    if (!sourceRecord) throw new Error(`Plan 055 source record is unavailable: ${documentSourceId}`);
    const sourcePublishedAt = partialDate(sourceRecord.payload.published_date_normalized);
    const sourceRetrievedAt = partialDate(sourceRecord.payload.retrieved_date_normalized);
    const documentTimeSourceValues = {
      published_date_normalized: text(sourceRecord.payload.published_date_normalized),
      published_date_precision: text(sourceRecord.payload.published_date_precision),
      retrieved_date_normalized: text(sourceRecord.payload.retrieved_date_normalized),
      retrieval_provenance: text(sourceRecord.payload.retrieval_provenance),
    };
    const lifecycleCandidateId = `lifecycle-candidate:${sha256(canonical({
      placement_id: placement.placement_id,
      transition_id: transition.transition_id,
      application_id: application.application_id,
      occurrence_id: episode.occurrence_id,
    })).slice(0, 24)}`;
    const documentTimeCandidate = {
      source_published_at: sourcePublishedAt,
      source_retrieved_at: sourceRetrievedAt,
      assertion_as_of: partialDate(phaseRecord.payload.as_of_date),
    };
    const validTimeCandidate = onsetBounds(episode.resolved_onset);
    const phaseSemantics = {
      lifecycle_phase: text(phaseRecord.payload.lifecycle_phase),
      lifecycle_phase_other: text(phaseRecord.payload.lifecycle_phase_other),
      event_kind: text(phaseRecord.payload.event_kind),
      raw_text: text(phaseRecord.raw_text),
    };
    const riskClasses = sortedUnique([
      "lifecycle_semantic_acceptance",
      "historical_point_not_current",
      "valid_document_time_separation",
      ...(episode.resolved_onset.precision === "day" ? [] : ["uncertain_valid_time_bounds"]),
      ...(new Set(evidence.map((row) => row.source_id)).size > 1 ? ["cross_source_continuity"] : []),
      ...(sourcePublishedAt === null && sourceRetrievedAt === null
        ? ["document_time_literal_not_iso_representable"]
        : []),
    ]);
    const withoutHash = {
      schema_version: 1 as const,
      lifecycle_candidate_id: lifecycleCandidateId,
      placement_id: placement.placement_id,
      registry_entry_sha256: sha256(canonical(placement)),
      placement_head: {
        founding_key: placement.founding_key,
        identity_decision_ids: placement.identity_decision_ids,
        operation_ids: placement.operation_ids,
      },
      transition_id: transition.transition_id,
      transition_sha256: sha256(canonical(transition)),
      application_id: application.application_id,
      application_sha256: sha256(canonical(application)),
      application_action: application.action,
      occurrence_id: episode.occurrence_id,
      episode_sha256: sha256(canonical(episode)),
      resolved_onset: episode.resolved_onset,
      evidence_bindings: evidence,
      document_source_id: documentSourceId,
      document_time_source_values: documentTimeSourceValues,
      document_time_candidate: documentTimeCandidate,
      valid_time_candidate: validTimeCandidate,
      phase_semantics: phaseSemantics,
      risk_classes: riskClasses,
    };
    return {
      ...withoutHash,
      candidate_sha256: sha256(canonical(withoutHash)),
    };
  });
}

function expectedFiles(): Map<string, string> {
  const candidates = buildCandidates();
  const day = candidates.filter((row) => row.resolved_onset.precision === "day");
  const imprecise = candidates.filter((row) => row.resolved_onset.precision !== "day");
  if (day.length !== 84 || imprecise.length !== 20) {
    throw new Error(`Plan 055 precision partition drift: day=${day.length}; imprecise=${imprecise.length}`);
  }
  const specs = [
    { batch_id: "historical-active-point-day-01", evidence_shape: "exact_day_historical_active_point", rows: day.slice(0, 42) },
    { batch_id: "historical-active-point-day-02", evidence_shape: "exact_day_historical_active_point", rows: day.slice(42) },
    { batch_id: "historical-active-point-imprecise-01", evidence_shape: "bounded_or_upper_bound_historical_active_point", rows: imprecise },
  ];
  const cohortContent = jsonl(candidates);
  const cohortSha = sha256(cohortContent);
  const candidateIds = candidates.map((row) => row.lifecycle_candidate_id).sort();
  const candidatePartitionSha = sha256(candidateIds.join("\n"));
  const dependencyPaths = [
    "data/intervention-placements/campaigns/plan-054/portfolio.json",
    "data/intervention-placements/campaigns/plan-054/accepted/integration-receipt.json",
    "data/intervention-placements/campaigns/plan-054/accepted/completion-receipt.json",
    "data/resolved-transit/operator/v1/placements/registry.jsonl",
    "data/resolved-transit/operator/v1/placements/transitions.jsonl",
    "data/resolved-transit/operator/v1/interventions/applications.jsonl",
    "data/resolved-transit/operator/v1/interventions/episodes.jsonl",
  ];
  const codePaths = [
    "packages/pipeline/src/materialize/intervention-lifecycle.ts",
    "packages/pipeline/src/materialize/intervention-state-as-of.ts",
    "packages/pipeline/src/materialize/current-intervention-footprint.ts",
    "packages/pipeline/src/materialize/intervention-placement-build.ts",
  ];
  const canonicalPaths = [
    "data/canonical/sources.jsonl",
    "data/canonical/entities.jsonl",
    "data/canonical/projects.jsonl",
    "data/canonical/corridors.jsonl",
    "data/canonical/events.jsonl",
    "data/canonical/routes.jsonl",
    "data/canonical/treatment_components.jsonl",
    "data/canonical/claims.jsonl",
    "data/canonical/metric_claims.jsonl",
    "data/canonical/source_gaps.jsonl",
    "data/canonical/relations.jsonl",
  ];
  const dependencyArtifacts = dependencyPaths.map(startingArtifact);
  const codeArtifacts = codePaths.map(startingArtifact);
  const canonicalArtifacts = canonicalPaths.map(startingArtifact);
  const cohortInputSha = sha256(canonical({
    starting_commit_sha: STARTING_COMMIT,
    contract_version: CONTRACT_VERSION,
    production_as_of_date: PRODUCTION_AS_OF,
    representative_dates: REPRESENTATIVE_DATES,
    dependency_artifacts: dependencyArtifacts,
    contract_code_artifacts: codeArtifacts,
    canonical_evidence_artifacts: canonicalArtifacts,
  }));
  const files = new Map<string, string>();
  files.set(`${FROZEN}/cohort.jsonl`, cohortContent);
  files.set(`${FROZEN}/summary.json`, json({
    schema_version: 1,
    contract_id: "plan-055-lifecycle-frozen-cohort-v1",
    plan_id: PLAN_ID,
    starting_commit_sha: STARTING_COMMIT,
    contract_version: CONTRACT_VERSION,
    production_as_of_date: PRODUCTION_AS_OF,
    representative_dates: REPRESENTATIVE_DATES,
    candidate_count: candidates.length,
    candidate_id_partition_sha256: candidatePartitionSha,
    cohort_sha256: cohortSha,
    cohort_input_sha256: cohortInputSha,
    counts_by_precision: {
      day: day.length,
      month: candidates.filter((row) => row.resolved_onset.precision === "month").length,
      season: candidates.filter((row) => row.resolved_onset.precision === "season").length,
      upper_bound_day: candidates.filter((row) => row.resolved_onset.precision === "upper_bound_day").length,
    },
    dependency_artifacts: dependencyArtifacts,
    contract_code_artifacts: codeArtifacts,
    canonical_evidence_artifacts: canonicalArtifacts,
    provider_usage: {
      provider_requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      actual_cost_usd: 0,
    },
  }));
  const cohortArtifact = contentArtifact(`${FROZEN}/cohort.jsonl`, cohortContent);
  const manifests = specs.map((spec) => {
    if (spec.rows.length < 20 || spec.rows.length > 50) {
      throw new Error(`Plan 055 batch size is outside 20-50: ${spec.batch_id}`);
    }
    const primary = `plan-055-primary-${spec.batch_id}`;
    const independent = `plan-055-independent-${spec.batch_id}`;
    const adjudicator = `plan-055-adjudicator-${spec.batch_id}`;
    const batchPartition = sha256(spec.rows.map((row) => row.lifecycle_candidate_id).sort().join("\n"));
    const manifest = {
      schema_version: 1,
      contract_id: "plan-055-lifecycle-batch-manifest-v1",
      plan_id: PLAN_ID,
      batch_id: spec.batch_id,
      starting_commit_sha: STARTING_COMMIT,
      contract_version: CONTRACT_VERSION,
      evidence_shape: spec.evidence_shape,
      candidate_count: spec.rows.length,
      batch_candidate_partition_sha256: batchPartition,
      frozen_candidate_partition_sha256: candidatePartitionSha,
      frozen_cohort_sha256: cohortSha,
      cohort_input_sha256: cohortInputSha,
      production_as_of_date: PRODUCTION_AS_OF,
      representative_dates: REPRESENTATIVE_DATES,
      input_artifacts: [cohortArtifact, ...dependencyArtifacts, ...codeArtifacts, ...canonicalArtifacts],
      candidates: spec.rows.map((row) => ({
        lifecycle_candidate_id: row.lifecycle_candidate_id,
        candidate_sha256: row.candidate_sha256,
        placement_id: row.placement_id,
        phase_semantics: row.phase_semantics,
        risk_classes: row.risk_classes,
      })),
      reviewer_assignments: {
        primary_reviewer: primary,
        required_independent_reviewer: independent,
        clean_room_adjudicator: adjudicator,
        single_writer_integrator: "plan-055-single-lifecycle-integrator",
        independence_required: true,
        distinct_reviewer_ids: new Set([primary, independent, adjudicator]).size === 3,
      },
      execution_contract: {
        append_only_proposals: true,
        append_only_acceptance: true,
        canonical_observations_mutable: false,
        action_alone_authorizes_lifecycle: false,
        silence_authorizes_current_state: false,
        latest_row_wins: false,
        valid_and_document_time_separate: true,
        provider_or_llm_execution_authorized: false,
      },
      allowed_terminal_dispositions: ["accepted", "conflicted", "rejected", "negative"],
    };
    const path = `${BATCHES}/${spec.batch_id}.json`;
    const content = json(manifest);
    files.set(path, content);
    return {
      batch_id: spec.batch_id,
      path,
      sha256: sha256(content),
      candidate_count: spec.rows.length,
      evidence_shape: spec.evidence_shape,
      primary_reviewer: primary,
      required_independent_reviewer: independent,
      clean_room_adjudicator: adjudicator,
    };
  });
  const manifestPartitionSha = sha256(
    manifests.map((row) => `${row.batch_id}|${row.sha256}`).sort().join("\n"),
  );
  files.set(PORTFOLIO, json({
    schema_version: 1,
    contract_id: "plan-055-lifecycle-batch-portfolio-v1",
    plan_id: PLAN_ID,
    starting_commit_sha: STARTING_COMMIT,
    contract_version: CONTRACT_VERSION,
    production_as_of_date: PRODUCTION_AS_OF,
    representative_dates: REPRESENTATIVE_DATES,
    candidate_count: candidates.length,
    batch_count: manifests.length,
    candidate_id_partition_sha256: candidatePartitionSha,
    cohort_sha256: cohortSha,
    cohort_input_sha256: cohortInputSha,
    manifest_partition_sha256: manifestPartitionSha,
    manifests,
    provider_usage: {
      provider_requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      actual_cost_usd: 0,
    },
    owner_gate: {
      status: "approved",
      approval_text: "I give full permission for all approvals, get it done",
      approved_scope: [
        "frozen_batch_manifests",
        "lifecycle_semantic_acceptance",
        "conflict_resolution",
        "production_as_of_2026-07-27",
      ],
      publication_authority: false,
    },
  }));
  return files;
}

const mode = process.argv[2];
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error("usage: bun scripts/freeze-plan055-lifecycle-batches.ts --write|--check");
}
const files = expectedFiles();
for (const [relativePath, content] of files) {
  const path = absolute(relativePath);
  if (mode === "--write") {
    if (existsSync(path) && readFileSync(path, "utf8") !== content) {
      throw new Error(`refusing to rewrite frozen Plan 055 artifact: ${relativePath}`);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  } else if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
    throw new Error(`Plan 055 frozen artifact is missing or stale: ${relativePath}`);
  }
}
const portfolio = JSON.parse(readFileSync(absolute(PORTFOLIO), "utf8")) as {
  batch_count: number;
  candidate_count: number;
  candidate_id_partition_sha256: string;
  cohort_sha256: string;
  manifest_partition_sha256: string;
};
console.log(JSON.stringify({
  mode,
  batch_count: portfolio.batch_count,
  candidate_count: portfolio.candidate_count,
  candidate_id_partition_sha256: portfolio.candidate_id_partition_sha256,
  cohort_sha256: portfolio.cohort_sha256,
  manifest_partition_sha256: portfolio.manifest_partition_sha256,
}));
