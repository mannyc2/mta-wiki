import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import {
  interventionApplicationFingerprint,
} from "../packages/pipeline/src/materialize/application-placement-transitions";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import type { PlacementCandidateRow } from "../packages/pipeline/src/materialize/intervention-placement-frontier";
import type { ResolvedInterventionApplication } from "../packages/pipeline/src/materialize/resolved-intervention-applications";
import {
  type PublicKeyOperation,
  replayPublicKeyOperations,
} from "../packages/pipeline/src/materialize/resolved-transit-public-keys";

const PLAN_ID = "plan-054";
const STARTING_COMMIT = "d270fa492aaa53226ec1e32915ad4e2e01d2d615";
const CAMPAIGN = "data/intervention-placements/campaigns/plan-054";
const FROZEN = `${CAMPAIGN}/frozen-cohort`;
const BATCHES = `${CAMPAIGN}/batches`;
const PORTFOLIO = `${CAMPAIGN}/portfolio.json`;
const ADAPTER_VERSION = "intervention-placement-frontier-v1";
const DEPENDENCY_INPUTS = [
  "data/operational-application-semantics/campaigns/plan-053/portfolio.json",
  "data/operational-application-semantics/campaigns/plan-053/accepted/integration-receipt.json",
  "data/operational-application-semantics/campaigns/plan-053/accepted/completion-receipt.json",
  "data/resolved-transit-public/public-key-operations/v1/manifest.json",
  "data/resolved-transit-public/public-key-operations/v1/operations.jsonl",
] as const;
const CONTRACT_CODE_INPUTS = [
  "packages/pipeline/src/materialize/intervention-placements.ts",
  "packages/pipeline/src/materialize/application-placement-transitions.ts",
  "packages/pipeline/src/materialize/intervention-placement-frontier.ts",
  "packages/pipeline/src/materialize/intervention-placement-build.ts",
] as const;

const BASELINE_INPUTS = {
  applications: {
    source: "data/resolved-transit/operator/v1/interventions/applications.jsonl",
    target: `${FROZEN}/applications.jsonl`,
  },
  candidate_ledger: {
    source: "data/resolved-transit/operator/v1/placements/candidate_ledger.jsonl",
    target: `${FROZEN}/candidate_ledger.jsonl`,
  },
  placement_cohort: {
    source: "data/resolved-transit/operator/v1/placements/cohort.json",
    target: `${FROZEN}/placement_cohort.json`,
  },
  registry: {
    source: "data/resolved-transit/operator/v1/placements/registry.jsonl",
    target: `${FROZEN}/registry.jsonl`,
  },
  source_observation_ledger: {
    source: "data/resolved-transit/operator/v1/placements/source_observation_ledger.jsonl",
    target: `${FROZEN}/source_observation_ledger.jsonl`,
  },
  summary: {
    source: "data/resolved-transit/operator/v1/placements/summary.json",
    target: `${FROZEN}/placement_summary.json`,
  },
  transition_reconciliation: {
    source: "data/resolved-transit/operator/v1/placements/transition_reconciliation.jsonl",
    target: `${FROZEN}/transition_reconciliation.jsonl`,
  },
  transitions: {
    source: "data/resolved-transit/operator/v1/placements/transitions.jsonl",
    target: `${FROZEN}/transitions.jsonl`,
  },
} as const;

type Artifact = { path: string; bytes: number; sha256: string };
type PublicKeyReplayRow = ReturnType<typeof replayPublicKeyOperations>[number];
type EvidencePin = {
  evidence_id: string;
  source_id: string;
  source_path: string;
  block_text_sha256: string;
};
type ObservationPin = {
  record_id: string;
  record_kind: string;
  canonical_record_sha256: string;
  evidence_pins: EvidencePin[];
};
type CohortRow = {
  schema_version: 1;
  candidate: PlacementCandidateRow;
  application: null | {
    application_id: string;
    application_fingerprint: string;
    action: ResolvedInterventionApplication["action"];
    extent_kind: ResolvedInterventionApplication["extent"]["kind"];
    public_key: string;
    public_key_aliases: string[];
  };
  documentary_lifecycle_phase: string | null;
  source_observation_pins: ObservationPin[];
  risk_classes: string[];
  cohort_row_sha256: string;
};
type BatchSpec = {
  batch_id: string;
  origin: PlacementCandidateRow["origin"];
  evidence_shape: string;
  rows: CohortRow[];
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

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(absolute(relativePath), "utf8")) as T;
}

function readJsonl<T>(relativePath: string): T[] {
  const text = readFileSync(absolute(relativePath), "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as T) : [];
}

function artifact(relativePath: string): Artifact {
  const value = readFileSync(absolute(relativePath));
  return { path: relativePath, bytes: value.length, sha256: sha256(value) };
}

function startingCommitArtifact(relativePath: string): Artifact {
  const value = startingCommitBytes(relativePath);
  return { path: relativePath, bytes: value.length, sha256: sha256(value) };
}

function startingCommitBytes(relativePath: string): Buffer {
  return execFileSync(
    "git",
    ["show", `${STARTING_COMMIT}:${relativePath}`],
    { cwd: repoRoot, encoding: "buffer" },
  );
}

function startingCommitJson<T>(relativePath: string): T {
  return JSON.parse(startingCommitBytes(relativePath).toString("utf8")) as T;
}

function startingCommitJsonl<T>(relativePath: string): T[] {
  const text = startingCommitBytes(relativePath).toString("utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as T) : [];
}

function contentArtifact(relativePath: string, content: string): Artifact {
  return {
    path: relativePath,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  };
}

function freezeBaseline(mode: "--write" | "--check"): void {
  for (const input of Object.values(BASELINE_INPUTS)) {
    const source = readFileSync(absolute(input.source));
    if (mode === "--write") {
      if (existsSync(absolute(input.target))) {
        if (!readFileSync(absolute(input.target)).equals(source)) {
          throw new Error(`refusing to rewrite frozen Plan 054 input: ${input.target}`);
        }
      } else {
        mkdirSync(dirname(absolute(input.target)), { recursive: true });
        writeFileSync(absolute(input.target), source);
      }
    } else if (!existsSync(absolute(input.target))) {
      throw new Error(`Plan 054 frozen input is missing: ${input.target}`);
    }
  }
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function observationPin(record: MtaCanonicalRecord): ObservationPin {
  const evidencePins = record.evidence_refs.map((ref): EvidencePin => {
    if (!ref.text_sha256) {
      throw new Error(`missing text hash for Plan 054 observation ${record.record_id}`);
    }
    return {
      evidence_id: ref.evidence_id,
      source_id: ref.source_id,
      source_path: ref.source_path,
      block_text_sha256: ref.text_sha256.replace(/^sha256:/u, ""),
    };
  }).sort((left, right) => canonical(left).localeCompare(canonical(right)));
  if (evidencePins.length === 0) {
    throw new Error(`Plan 054 candidate observation lacks evidence: ${record.record_id}`);
  }
  return {
    record_id: record.record_id,
    record_kind: record.record_kind,
    canonical_record_sha256: sha256(canonical(record)),
    evidence_pins: evidencePins,
  };
}

function risks(
  candidate: PlacementCandidateRow,
  application: ResolvedInterventionApplication | undefined,
  phase: string | null,
): string[] {
  const values = ["identity", "semantic_acceptance", "stable_public_identity"];
  if (application) {
    values.push("application_transition", `action_${application.action}`);
    if (application.action === "modify") values.push("modify_continuity");
    if (application.action === "remove" || application.action === "suspend") {
      values.push("removal_target", "must_not_establish");
    }
    if (application.action === "unknown") values.push("nonauthorizing_unknown");
    if (application.extent.kind === "unknown") values.push("scope_ambiguity");
    if (candidate.observation_record_ids.length > 3) values.push("plural_evidence_membership");
  } else {
    values.push("independent_lifecycle_evidence", "documentary_not_current_authority");
    if (phase) values.push(`documentary_phase_${phase}`);
    if (phase === "cancelled" || phase === "suspended") values.push("removal_target");
  }
  return sortedUnique(values);
}

function buildCohortRows(): CohortRow[] {
  const candidates = readJsonl<PlacementCandidateRow>(
    BASELINE_INPUTS.candidate_ledger.target,
  ).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  const applications = readJsonl<ResolvedInterventionApplication>(
    BASELINE_INPUTS.applications.target,
  );
  const applicationsById = new Map(applications.map((row) => [row.application_id, row]));
  const recordsById = new Map(readCanonicalRecordsFromJsonl().map((row) => [row.record_id, row]));
  const publicKeys = replayPublicKeyOperations(startingCommitJsonl<PublicKeyOperation>(
    "data/resolved-transit-public/public-key-operations/v1/operations.jsonl",
  ));
  const publicKeyBySubject = new Map(
    publicKeys
      .filter((row) => row.registry_state === "live" && row.key_kind === "intervention_component")
      .map((row) => [row.subject_id, row]),
  );

  if (candidates.length !== 1773 || applications.length !== 343) {
    throw new Error(
      `Plan 054 denominator drift: candidates=${candidates.length}, applications=${applications.length}`,
    );
  }
  if (candidates.some((row) => row.disposition !== "pending_review")) {
    throw new Error("Plan 054 freeze requires every starting candidate to be pending_review");
  }

  return candidates.map((candidate): CohortRow => {
    const application = candidate.application_id
      ? applicationsById.get(candidate.application_id)
      : undefined;
    if ((candidate.origin === "application") !== Boolean(application)) {
      throw new Error(`Plan 054 application binding drift: ${candidate.candidate_id}`);
    }
    const observations = candidate.observation_record_ids.map((recordId) => {
      const record = recordsById.get(recordId);
      if (!record) throw new Error(`missing Plan 054 observation: ${recordId}`);
      return record;
    });
    const phase = candidate.origin === "later_lifecycle"
      ? String(observations[0]?.payload.lifecycle_phase ?? "") || null
      : null;
    const publicKey: PublicKeyReplayRow | undefined = application
      ? publicKeyBySubject.get(application.application_id)
      : undefined;
    if (application && !publicKey) {
      throw new Error(`missing public component lookup: ${application.application_id}`);
    }
    const withoutHash = {
      schema_version: 1 as const,
      candidate,
      application: application && publicKey ? {
        application_id: application.application_id,
        application_fingerprint: interventionApplicationFingerprint(application),
        action: application.action,
        extent_kind: application.extent.kind,
        public_key: publicKey.public_key,
        public_key_aliases: publicKey.public_key_aliases,
      } : null,
      documentary_lifecycle_phase: phase,
      source_observation_pins: observations.map(observationPin)
        .sort((left, right) => left.record_id.localeCompare(right.record_id)),
      risk_classes: risks(candidate, application, phase),
    };
    return {
      ...withoutHash,
      cohort_row_sha256: sha256(canonical(withoutHash)),
    };
  });
}

function balancedChunks<T>(values: readonly T[], maximum = 50): T[][] {
  if (values.length === 0) return [];
  const count = Math.ceil(values.length / maximum);
  const base = Math.floor(values.length / count);
  const remainder = values.length % count;
  const result: T[][] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    result.push(values.slice(cursor, cursor + size));
    cursor += size;
  }
  return result;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function batchSpecs(rows: readonly CohortRow[]): BatchSpec[] {
  const specs: BatchSpec[] = [];
  const add = (
    prefix: string,
    origin: PlacementCandidateRow["origin"],
    evidenceShape: string,
    values: readonly CohortRow[],
  ) => {
    balancedChunks(values).forEach((chunk, index, chunks) => {
      specs.push({
        batch_id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
        origin,
        evidence_shape: evidenceShape,
        rows: chunk,
      });
      if (chunks.length === 0) throw new Error("unreachable empty Plan 054 chunk set");
    });
  };

  const applicationRows = rows.filter((row) => row.candidate.origin === "application");
  const applicationRowsById = new Map(
    applicationRows.map((row) => [row.application?.application_id, row]),
  );
  const plan053Portfolio = startingCommitJson<{
    manifests: Array<{ batch_id: string; path: string }>;
  }>("data/operational-application-semantics/campaigns/plan-053/portfolio.json");
  for (const priorBatch of plan053Portfolio.manifests) {
    const priorManifest = startingCommitJson<{
      application_ids: string[];
      evidence_shape: string;
    }>(priorBatch.path);
    const batchRows = priorManifest.application_ids.map((applicationId) => {
      const row = applicationRowsById.get(applicationId);
      if (!row) throw new Error(`missing Plan 054 application candidate: ${applicationId}`);
      return row;
    });
    specs.push({
      batch_id: `application-${priorBatch.batch_id}`,
      origin: "application",
      evidence_shape: `plan_053_${priorManifest.evidence_shape}`,
      rows: batchRows,
    });
  }

  const lifecycleRows = rows.filter((row) => row.candidate.origin === "later_lifecycle");
  const phases = sortedUnique(lifecycleRows.map((row) => {
    if (!row.documentary_lifecycle_phase) {
      throw new Error(`later-lifecycle candidate lacks phase: ${row.candidate.candidate_id}`);
    }
    return row.documentary_lifecycle_phase;
  }));
  const exceptionalTargetPhases = new Set(["cancelled", "resumed", "suspended"]);
  const preoperationalContextPhases = new Set(["funded", "studied"]);
  add(
    "lifecycle-exceptional-target",
    "later_lifecycle",
    "canonical_event_exceptional_target_phase",
    lifecycleRows.filter((row) =>
      exceptionalTargetPhases.has(row.documentary_lifecycle_phase ?? "")
    ),
  );
  add(
    "lifecycle-preoperational-context",
    "later_lifecycle",
    "canonical_event_preoperational_context_phase",
    lifecycleRows.filter((row) =>
      preoperationalContextPhases.has(row.documentary_lifecycle_phase ?? "")
    ),
  );
  for (const phase of phases.filter((phase) =>
    !exceptionalTargetPhases.has(phase) && !preoperationalContextPhases.has(phase)
  )) {
    add(
      `lifecycle-${slug(phase)}`,
      "later_lifecycle",
      `canonical_event_lifecycle_phase_${phase}`,
      lifecycleRows.filter((row) => row.documentary_lifecycle_phase === phase),
    );
  }

  const assigned = specs.flatMap((spec) => spec.rows.map((row) => row.candidate.candidate_id));
  const expected = rows.map((row) => row.candidate.candidate_id).sort();
  if (assigned.length !== expected.length || new Set(assigned).size !== expected.length ||
      [...assigned].sort().join("\n") !== expected.join("\n")) {
    throw new Error("Plan 054 batch specs do not exactly partition the frozen candidate cohort");
  }
  if (specs.some((spec) => spec.rows.length < 20 || spec.rows.length > 50)) {
    throw new Error("Plan 054 batch size must be 20-50 candidates");
  }
  return specs;
}

function expectedFiles(): Map<string, string> {
  const rows = buildCohortRows();
  const cohortContent = jsonl(rows);
  const specs = batchSpecs(rows);
  const frozenArtifacts = Object.values(BASELINE_INPUTS).map((input) => artifact(input.target));
  const evidenceIndex = artifact("data/evidence-block-index.jsonl");
  const dependencyArtifacts = DEPENDENCY_INPUTS.map(startingCommitArtifact);
  const contractCodeArtifacts = CONTRACT_CODE_INPUTS.map(startingCommitArtifact);
  const publicKeyManifest = startingCommitJson<{ head: string; operation_count: number }>(
    "data/resolved-transit-public/public-key-operations/v1/manifest.json",
  );
  const candidateIds = rows.map((row) => row.candidate.candidate_id).sort();
  const candidatePartitionSha256 = sha256(candidateIds.join("\n"));
  const cohortInputSha256 = sha256(canonical({
    adapter_version: ADAPTER_VERSION,
    frozen_artifacts: frozenArtifacts,
    evidence_block_index: evidenceIndex,
    dependency_artifacts: dependencyArtifacts,
    contract_code_artifacts: contractCodeArtifacts,
    public_key_head: publicKeyManifest.head,
    public_key_operation_count: publicKeyManifest.operation_count,
    starting_commit_sha: STARTING_COMMIT,
  }));
  const cohortSha256 = sha256(cohortContent);
  const files = new Map<string, string>();
  files.set(`${FROZEN}/cohort.jsonl`, cohortContent);
  files.set(`${FROZEN}/cohort-summary.json`, json({
    schema_version: 1,
    contract_id: "plan-054-placement-frozen-cohort-v1",
    plan_id: PLAN_ID,
    starting_commit_sha: STARTING_COMMIT,
    adapter_version: ADAPTER_VERSION,
    candidate_count: rows.length,
    candidate_id_partition_sha256: candidatePartitionSha256,
    cohort_sha256: cohortSha256,
    cohort_input_sha256: cohortInputSha256,
    placement_frontier_fingerprint: readJson<{ frontier_fingerprint: string }>(
      BASELINE_INPUTS.summary.target,
    ).frontier_fingerprint,
    counts_by_origin: Object.fromEntries(
      ["application", "independent_inventory", "later_lifecycle"].map((origin) => [
        origin,
        rows.filter((row) => row.candidate.origin === origin).length,
      ]),
    ),
    public_key_replay_head: publicKeyManifest.head,
    prior_placement_head: {
      identity_operation_count: 0,
      registry_count: 0,
      transition_count: 0,
      identity_operation_partition_sha256: sha256(""),
      registry_partition_sha256: sha256(""),
      transition_partition_sha256: sha256(""),
    },
    frozen_artifacts: frozenArtifacts,
    evidence_block_index: evidenceIndex,
    dependency_artifacts: dependencyArtifacts,
    contract_code_artifacts: contractCodeArtifacts,
    provider_usage: {
      paid_execution_authorized: false,
      provider_requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      committed_cost_usd: 0,
      actual_cost_usd: 0,
    },
    semantic_acceptance_status: "awaiting_owner_batch_manifest_approval",
  }));

  const cohortArtifact = contentArtifact(`${FROZEN}/cohort.jsonl`, cohortContent);
  const manifests = specs.map((spec) => {
    const batchCandidateIds = spec.rows.map((row) => row.candidate.candidate_id).sort();
    const primary = `plan-054-primary-${spec.batch_id}`;
    const independent = `plan-054-independent-${spec.batch_id}`;
    const adjudicator = `plan-054-adjudicator-${spec.batch_id}`;
    const manifest = {
      schema_version: 1,
      contract_id: "plan-054-placement-batch-manifest-v1",
      plan_id: PLAN_ID,
      batch_id: spec.batch_id,
      starting_commit_sha: STARTING_COMMIT,
      adapter_version: ADAPTER_VERSION,
      origin: spec.origin,
      evidence_shape: spec.evidence_shape,
      frozen_cohort_sha256: cohortSha256,
      cohort_input_sha256: cohortInputSha256,
      frozen_candidate_partition_sha256: candidatePartitionSha256,
      batch_candidate_partition_sha256: sha256(batchCandidateIds.join("\n")),
      prior_placement_head: {
        identity_operation_count: 0,
        registry_count: 0,
        transition_count: 0,
        identity_operation_partition_sha256: sha256(""),
        registry_partition_sha256: sha256(""),
        transition_partition_sha256: sha256(""),
      },
      public_key_replay_head: publicKeyManifest.head,
      input_artifacts: [
        cohortArtifact,
        ...frozenArtifacts,
        evidenceIndex,
        ...dependencyArtifacts,
        ...contractCodeArtifacts,
      ],
      candidate_count: spec.rows.length,
      candidates: spec.rows.map((row) => ({
        candidate_id: row.candidate.candidate_id,
        cohort_row_sha256: row.cohort_row_sha256,
        application_id: row.application?.application_id ?? null,
        application_fingerprint: row.application?.application_fingerprint ?? null,
        documentary_lifecycle_phase: row.documentary_lifecycle_phase,
        source_observation_pins: row.source_observation_pins,
        risk_classes: row.risk_classes,
      })),
      reviewer_assignments: {
        primary_reviewer: primary,
        required_independent_reviewer: independent,
        clean_room_adjudicator: adjudicator,
        single_writer_integrator: "plan-054-single-placement-integrator",
        independence_required: true,
        distinct_reviewer_ids: new Set([primary, independent, adjudicator]).size === 3,
      },
      allowed_terminal_dispositions: [
        "resolved_placement",
        "duplicate_alias",
        "not_a_placement",
        "ambiguous",
      ],
      execution_contract: {
        append_only_proposals: true,
        append_only_acceptance: true,
        canonical_observations_mutable: false,
        application_action_alone_authorizes_placement: false,
        remove_or_suspend_may_establish: false,
        semantic_acceptance_requires_owner_approval: true,
        public_identity_redirect_requires_owner_approval: true,
        provider_or_llm_execution_authorized: false,
      },
    };
    const path = `${BATCHES}/${spec.batch_id}.json`;
    const content = json(manifest);
    files.set(path, content);
    return {
      batch_id: spec.batch_id,
      path,
      sha256: sha256(content),
      candidate_count: spec.rows.length,
      origin: spec.origin,
      evidence_shape: spec.evidence_shape,
      primary_reviewer: primary,
      required_independent_reviewer: independent,
      clean_room_adjudicator: adjudicator,
    };
  });
  const manifestPartitionSha256 = sha256(
    manifests.map((row) => `${row.batch_id}|${row.sha256}`).sort().join("\n"),
  );
  files.set(PORTFOLIO, json({
    schema_version: 1,
    contract_id: "plan-054-placement-batch-portfolio-v1",
    plan_id: PLAN_ID,
    starting_commit_sha: STARTING_COMMIT,
    adapter_version: ADAPTER_VERSION,
    candidate_count: rows.length,
    application_candidate_count: rows.filter((row) => row.candidate.origin === "application").length,
    independent_inventory_candidate_count: rows.filter((row) =>
      row.candidate.origin === "independent_inventory"
    ).length,
    later_lifecycle_candidate_count: rows.filter((row) =>
      row.candidate.origin === "later_lifecycle"
    ).length,
    batch_count: manifests.length,
    candidate_id_partition_sha256: candidatePartitionSha256,
    cohort_sha256: cohortSha256,
    cohort_input_sha256: cohortInputSha256,
    manifest_partition_sha256: manifestPartitionSha256,
    public_key_replay_head: publicKeyManifest.head,
    manifests,
    provider_usage: {
      paid_execution_authorized: false,
      provider_requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      committed_cost_usd: 0,
      actual_cost_usd: 0,
    },
    owner_gate: {
      status: "awaiting_approval",
      requested_decision: "approve_or_reject_frozen_plan_054_batch_manifest_portfolio",
      semantic_review_started: false,
      semantic_acceptance_started: false,
    },
  }));
  return files;
}

const mode = process.argv[2];
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error("usage: bun scripts/freeze-plan054-placement-batches.ts --write|--check");
}

freezeBaseline(mode);
const files = expectedFiles();
for (const [relativePath, content] of files) {
  const path = absolute(relativePath);
  if (mode === "--write") {
    if (existsSync(path) && readFileSync(path, "utf8") !== content) {
      throw new Error(`refusing to rewrite differing frozen Plan 054 artifact: ${relativePath}`);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  } else if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
    throw new Error(`Plan 054 frozen artifact is missing or stale: ${relativePath}`);
  }
}

const portfolio = readJson<{
  batch_count: number;
  candidate_count: number;
  candidate_id_partition_sha256: string;
  cohort_sha256: string;
  manifest_partition_sha256: string;
}>(PORTFOLIO);
console.log(JSON.stringify({
  mode,
  batch_count: portfolio.batch_count,
  candidate_count: portfolio.candidate_count,
  candidate_id_partition_sha256: portfolio.candidate_id_partition_sha256,
  cohort_sha256: portfolio.cohort_sha256,
  manifest_partition_sha256: portfolio.manifest_partition_sha256,
}));
