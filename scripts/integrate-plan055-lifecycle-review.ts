import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import type { ApplicationPlacementTransition } from "../packages/pipeline/src/materialize/application-placement-transitions";
import {
  parseInterventionLifecycleAssertion,
  validateAcceptedInterventionLifecycleAssertions,
  type InterventionLifecycleAssertion,
} from "../packages/pipeline/src/materialize/intervention-lifecycle";
import {
  buildInterventionLifecycleProjection,
  interventionLifecycleContents,
} from "../packages/pipeline/src/materialize/current-intervention-footprint";
import type { InterventionPlacementRegistryEntry } from "../packages/pipeline/src/materialize/intervention-placements";
import type { ResolvedInterventionApplication } from "../packages/pipeline/src/materialize/resolved-intervention-applications";
import type { ResolvedInterventionEpisode } from "../packages/pipeline/src/materialize/resolved-interventions";

type Mode = "--write" | "--check";

const PLAN_ID = "plan-055";
const CAMPAIGN = "data/intervention-lifecycle/campaigns/plan-055";
const COHORT_PATH = `${CAMPAIGN}/frozen-cohort/cohort.jsonl`;
const BATCH_ROOT = `${CAMPAIGN}/batches`;
const GLOBAL_ACCEPTED = "data/intervention-lifecycle/accepted";
const ACCEPTED_AT = "2026-08-01T00:00:00Z";
const INTEGRATOR_ID = "plan-055-single-lifecycle-integrator";
const EXPECTED_CANDIDATES = 104;
const EXPECTED_ACTIVE = 95;
const EXPECTED_PLANNED = 6;
const EXPECTED_NEGATIVE = 3;
const PRODUCTION_AS_OF = "2026-07-27";
const SNAPSHOT_DATES = [
  "2025-06-28",
  "2025-06-29",
  "2025-06-30",
  "2025-12-07",
  "2025-12-08",
  "2025-12-09",
  "2026-06-09",
  "2026-06-10",
  "2026-06-11",
  PRODUCTION_AS_OF,
] as const;

const FROZEN = {
  starting_commit_sha: "81f895417a47e36214b00aab483d482742f80099",
  candidate_id_partition_sha256: "6c5daf5222ce48a00c69c267b1f49460a2ea804f02bffff765fbb826fa507b02",
  cohort_sha256: "04284344463870931f56296c989759388aff29738ff3fc1cddd1cd9e06bd8ced",
  cohort_input_sha256: "33ca8a8992a61dd071159208424c02d2dfec15b9fb1cff7a02d787cbefce4e92",
  manifest_partition_sha256: "11948134a291d9029fa93d1df86b198e1e0c32240c62d35ec99ccf2786204de6",
} as const;

const REVIEW_ARTIFACTS = {
  primary: {
    source: "/tmp/plan055-primary-review-frozen.jsonl",
    target: `${CAMPAIGN}/reviews/primary/proposals.jsonl`,
    sha256: "fbabc39f15700f6a5e869d7d3e8c721002ce47ae1341ce16d5d78468402a940f",
  },
  primary_summary: {
    source: "/tmp/plan055-primary-review-frozen-summary.json",
    target: `${CAMPAIGN}/reviews/primary/summary.json`,
    sha256: "e38fd2b7d8ddd89061a84b818d4b56cba75f8ae6822fdd2c843cea2821ea2785",
  },
  independent: {
    source: "/tmp/plan055-independent-review.jsonl",
    target: `${CAMPAIGN}/reviews/independent/proposals.jsonl`,
    sha256: "bb9db2e627e1de2e7c1d32784558ab135639cc9997b570dbea3dc6d20d4d0aee",
  },
  independent_summary: {
    source: "/tmp/plan055-independent-review-summary.json",
    target: `${CAMPAIGN}/reviews/independent/summary.json`,
    sha256: "8321523ddf61fa29d0cc272c2a252cd49ace8b6692bdaf7a037b288d08bdcdbb",
  },
} as const;

const SPECIAL = {
  fulton: "lifecycle-candidate:495a84892239d3bdfd3fdee2",
  m16Installation: "lifecycle-candidate:5b6f697e7dd11b2434e09073",
  m34Installation: "lifecycle-candidate:96b8402585253d97e1654253",
  qmNegative: new Set([
    "lifecycle-candidate:7a8bf6c774b96cff140f1dd2",
    "lifecycle-candidate:80a10faf303c63bf8febec7d",
    "lifecycle-candidate:fc5a063edb10cd62eb1ad63b",
  ]),
} as const;

type EvidenceBinding = {
  record_id: string;
  source_id: string;
  evidence_id: string;
};

type FrozenCandidate = {
  schema_version: 1;
  lifecycle_candidate_id: string;
  candidate_sha256: string;
  placement_id: string;
  evidence_bindings: Array<EvidenceBinding & {
    role: string;
    canonical_record_sha256: string;
    evidence_text_sha256: string;
  }>;
  document_time_candidate: InterventionLifecycleAssertion["document_time"];
  valid_time_candidate: InterventionLifecycleAssertion["valid_time"];
  phase_semantics: {
    lifecycle_phase: string | null;
    lifecycle_phase_other: string | null;
    event_kind: string | null;
    raw_text: string | null;
  };
};

type PrimaryReviewRow = {
  schema_version: 1;
  lifecycle_candidate_id: string;
  candidate_sha256: string;
  batch_id: string;
  reviewer_id: string;
  terminal_disposition: "accepted" | "negative";
  proposed_assertion: InterventionLifecycleAssertion | null;
  frozen_candidate: FrozenCandidate;
  frozen_hash_pins: {
    starting_commit_sha: string;
    candidate_sha256: string;
    frozen_candidate_id_partition_sha256: string;
    frozen_cohort_sha256: string;
    cohort_input_sha256: string;
    manifest_partition_sha256: string;
    batch_manifest_sha256: string;
    batch_candidate_partition_sha256: string;
  };
  reasoning: string;
};

type IndependentReviewRow = {
  schema_version: 1;
  lifecycle_candidate_id: string;
  candidate_sha256: string;
  placement_id: string;
  batch_id: string;
  reviewer_id: string;
  proposed_review_state: "accepted" | "rejected";
  proposed_state: "active" | "planned" | null;
  proposed_truth_status: string;
  proposed_assertion_evidence_bindings: EvidenceBinding[];
  valid_time: InterventionLifecycleAssertion["valid_time"];
  document_time: {
    source_published_at: string | null;
    source_retrieved_at: string | null;
    assertion_as_of: string | null;
    source_id: string;
    published_precision: string | null;
  };
  source_document_times: unknown[];
  review_outcome: string;
  rationale: string;
  frozen_cohort_sha256: string;
  cohort_input_sha256: string;
  batch_manifest_sha256: string;
  batch_candidate_partition_sha256: string;
};

type BatchManifest = {
  batch_id: string;
  batch_candidate_partition_sha256: string;
  frozen_candidate_partition_sha256: string;
  frozen_cohort_sha256: string;
  cohort_input_sha256: string;
  candidates: Array<{
    lifecycle_candidate_id: string;
    candidate_sha256: string;
    placement_id: string;
  }>;
  reviewer_assignments: {
    primary_reviewer: string;
    required_independent_reviewer: string;
    clean_room_adjudicator: string;
    single_writer_integrator: string;
    distinct_reviewer_ids: boolean;
  };
};

type Adjudication = {
  schema_version: 1;
  contract_id: "plan-055-lifecycle-clean-room-adjudication-v1";
  adjudication_id: string;
  lifecycle_candidate_id: string;
  placement_id: string;
  batch_id: string;
  adjudicator_id: string;
  issue_kind:
    | "negative_treatment_lifecycle_binding"
    | "physical_installation_activity_boundary"
    | "valid_time_range_correction";
  review_row_sha256: { primary: string; independent: string };
  resolution: string;
  accepted_valid_time: InterventionLifecycleAssertion["valid_time"] | null;
  semantic_limits: string[];
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
function absolute(path: string): string {
  return path.startsWith("/") ? path : join(repoRoot, path);
}
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(absolute(path), "utf8")) as T;
}
function readJsonl<T>(path: string): T[] {
  const value = readFileSync(absolute(path), "utf8").trim();
  return value ? value.split("\n").map((line) => JSON.parse(line) as T) : [];
}
function partition(values: readonly string[]): string {
  return sha256([...values].sort((a, b) => a.localeCompare(b)).join("\n"));
}
function contentPartition(values: readonly unknown[]): string {
  return sha256(jsonl([...values].sort((a, b) => canonical(a).localeCompare(canonical(b)))));
}
function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (canonical(actual) !== canonical(expected)) throw new Error(`${label} mismatch`);
}
function requireCount(actual: number, expected: number, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
function assertUnique(values: readonly string[], label: string): void {
  if (values.length !== new Set(values).size) throw new Error(`${label} must be unique`);
}
function normalizedEvidence(values: readonly EvidenceBinding[]): EvidenceBinding[] {
  return values.map(({ record_id, source_id, evidence_id }) => ({
    record_id,
    source_id,
    evidence_id,
  })).sort((a, b) =>
    `${a.record_id}|${a.source_id}|${a.evidence_id}`.localeCompare(
      `${b.record_id}|${b.source_id}|${b.evidence_id}`,
    )
  );
}
function writeOwned(path: string, content: string, mode: Mode): void {
  const target = absolute(path);
  if (mode === "--check") {
    if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      throw new Error(`Plan 055 integrated artifact missing or stale: ${path}`);
    }
    return;
  }
  if (existsSync(target)) {
    if (readFileSync(target, "utf8") !== content) {
      throw new Error(`refusing to overwrite differing Plan 055 artifact: ${path}`);
    }
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function loadOrCopyReviews(mode: Mode): void {
  for (const artifact of Object.values(REVIEW_ARTIFACTS)) {
    if (existsSync(absolute(artifact.target))) {
      if (sha256(readFileSync(absolute(artifact.target))) !== artifact.sha256) {
        throw new Error(`frozen review artifact drifted: ${artifact.target}`);
      }
      continue;
    }
    if (mode === "--check") throw new Error(`missing frozen review artifact: ${artifact.target}`);
    if (!existsSync(artifact.source)) throw new Error(`missing authorized review input: ${artifact.source}`);
    const content = readFileSync(artifact.source);
    if (sha256(content) !== artifact.sha256) {
      throw new Error(`authorized review input hash mismatch: ${artifact.source}`);
    }
    writeOwned(artifact.target, content.toString("utf8"), mode);
  }
}
function assertionId(input: Omit<InterventionLifecycleAssertion, "schema_version" | "assertion_id" |
  "document_time" | "truth_status" | "review_state" | "supersedes_assertion_ids">): string {
  return `assertion:${sha256(canonical({
    subject: input.subject,
    state: input.state,
    valid_time: input.valid_time,
    evidence_bindings: input.evidence_bindings,
    decision_id: input.decision_id,
  })).slice(0, 24)}`;
}
function adjudication(input: Omit<Adjudication, "adjudication_id">): Adjudication {
  return {
    ...input,
    adjudication_id: `plan-055-adjudication:${sha256(canonical(input))}`,
  };
}

const mode = process.argv[2] as Mode | undefined;
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error("usage: bun scripts/integrate-plan055-lifecycle-review.ts --write|--check");
}

if (sha256(readFileSync(absolute(COHORT_PATH))) !== FROZEN.cohort_sha256) {
  throw new Error("Plan 055 frozen cohort hash drifted");
}
loadOrCopyReviews(mode);

const cohort = readJsonl<FrozenCandidate>(COHORT_PATH);
const primary = readJsonl<PrimaryReviewRow>(REVIEW_ARTIFACTS.primary.target);
const independent = readJsonl<IndependentReviewRow>(REVIEW_ARTIFACTS.independent.target);
requireCount(cohort.length, EXPECTED_CANDIDATES, "frozen lifecycle candidates");
requireCount(primary.length, EXPECTED_CANDIDATES, "primary lifecycle reviews");
requireCount(independent.length, EXPECTED_CANDIDATES, "independent lifecycle reviews");
assertUnique(cohort.map((row) => row.lifecycle_candidate_id), "frozen lifecycle candidate ids");
assertUnique(primary.map((row) => row.lifecycle_candidate_id), "primary lifecycle candidate ids");
assertUnique(independent.map((row) => row.lifecycle_candidate_id), "independent lifecycle candidate ids");
if (partition(cohort.map((row) => row.lifecycle_candidate_id)) !== FROZEN.candidate_id_partition_sha256) {
  throw new Error("Plan 055 candidate identity partition drifted");
}

const cohortById = new Map(cohort.map((row) => [row.lifecycle_candidate_id, row]));
const primaryById = new Map(primary.map((row) => [row.lifecycle_candidate_id, row]));
const independentById = new Map(independent.map((row) => [row.lifecycle_candidate_id, row]));
const manifestByBatch = new Map<string, { manifest: BatchManifest; sha256: string }>();
for (const name of readdirSync(absolute(BATCH_ROOT)).filter((value) => value.endsWith(".json")).sort()) {
  const path = `${BATCH_ROOT}/${name}`;
  const content = readFileSync(absolute(path));
  const manifest = JSON.parse(content.toString("utf8")) as BatchManifest;
  manifestByBatch.set(manifest.batch_id, { manifest, sha256: sha256(content) });
}
requireCount(manifestByBatch.size, 3, "Plan 055 batch manifests");

const adjudications: Adjudication[] = [];
const decisions: unknown[] = [];
const assertions: InterventionLifecycleAssertion[] = [];
const receipts: unknown[] = [];
let validTimeDisagreements = 0;

for (const candidate of cohort) {
  const primaryRow = primaryById.get(candidate.lifecycle_candidate_id);
  const independentRow = independentById.get(candidate.lifecycle_candidate_id);
  if (!primaryRow || !independentRow) {
    throw new Error(`${candidate.lifecycle_candidate_id}: incomplete dual review`);
  }
  const batch = manifestByBatch.get(primaryRow.batch_id);
  if (!batch || independentRow.batch_id !== primaryRow.batch_id) {
    throw new Error(`${candidate.lifecycle_candidate_id}: review batch mismatch`);
  }
  const assignment = batch.manifest.reviewer_assignments;
  if (assignment.primary_reviewer !== primaryRow.reviewer_id ||
      assignment.required_independent_reviewer !== independentRow.reviewer_id ||
      assignment.clean_room_adjudicator === primaryRow.reviewer_id ||
      assignment.clean_room_adjudicator === independentRow.reviewer_id ||
      primaryRow.reviewer_id === independentRow.reviewer_id ||
      assignment.single_writer_integrator !== INTEGRATOR_ID || !assignment.distinct_reviewer_ids) {
    throw new Error(`${candidate.lifecycle_candidate_id}: reviewer independence drifted`);
  }
  const manifestCandidate = batch.manifest.candidates.find((row) =>
    row.lifecycle_candidate_id === candidate.lifecycle_candidate_id
  );
  if (!manifestCandidate || manifestCandidate.candidate_sha256 !== candidate.candidate_sha256 ||
      manifestCandidate.placement_id !== candidate.placement_id ||
      primaryRow.candidate_sha256 !== candidate.candidate_sha256 ||
      independentRow.candidate_sha256 !== candidate.candidate_sha256 ||
      independentRow.placement_id !== candidate.placement_id ||
      primaryRow.frozen_candidate.candidate_sha256 !== candidate.candidate_sha256 ||
      canonical(primaryRow.frozen_candidate) !== canonical(candidate)) {
    throw new Error(`${candidate.lifecycle_candidate_id}: frozen candidate binding drifted`);
  }
  const pins = primaryRow.frozen_hash_pins;
  if (pins.starting_commit_sha !== FROZEN.starting_commit_sha ||
      pins.frozen_candidate_id_partition_sha256 !== FROZEN.candidate_id_partition_sha256 ||
      pins.frozen_cohort_sha256 !== FROZEN.cohort_sha256 ||
      pins.cohort_input_sha256 !== FROZEN.cohort_input_sha256 ||
      pins.manifest_partition_sha256 !== FROZEN.manifest_partition_sha256 ||
      pins.batch_manifest_sha256 !== batch.sha256 ||
      pins.batch_candidate_partition_sha256 !== batch.manifest.batch_candidate_partition_sha256 ||
      independentRow.frozen_cohort_sha256 !== FROZEN.cohort_sha256 ||
      independentRow.cohort_input_sha256 !== FROZEN.cohort_input_sha256 ||
      independentRow.batch_manifest_sha256 !== batch.sha256 ||
      independentRow.batch_candidate_partition_sha256 !== batch.manifest.batch_candidate_partition_sha256) {
    throw new Error(`${candidate.lifecycle_candidate_id}: frozen review pins drifted`);
  }
  if (canonical(normalizedEvidence(candidate.evidence_bindings)) !==
      canonical(normalizedEvidence(independentRow.proposed_assertion_evidence_bindings))) {
    throw new Error(`${candidate.lifecycle_candidate_id}: exact evidence binding disagreement`);
  }

  const accepted = primaryRow.terminal_disposition === "accepted";
  if (accepted !== (independentRow.proposed_review_state === "accepted") ||
      (accepted && primaryRow.proposed_assertion?.state !== independentRow.proposed_state) ||
      (!accepted && (primaryRow.proposed_assertion !== null || independentRow.proposed_state !== null))) {
    throw new Error(`${candidate.lifecycle_candidate_id}: terminal lifecycle disagreement`);
  }
  if (accepted && canonical(primaryRow.proposed_assertion?.document_time) !==
      canonical(candidate.document_time_candidate)) {
    throw new Error(`${candidate.lifecycle_candidate_id}: primary document-time binding drifted`);
  }

  const primaryRowSha = sha256(canonical(primaryRow));
  const independentRowSha = sha256(canonical(independentRow));
  const candidateAdjudications: Adjudication[] = [];
  if (SPECIAL.qmNegative.has(candidate.lifecycle_candidate_id)) {
    candidateAdjudications.push(adjudication({
      schema_version: 1,
      contract_id: "plan-055-lifecycle-clean-room-adjudication-v1",
      lifecycle_candidate_id: candidate.lifecycle_candidate_id,
      placement_id: candidate.placement_id,
      batch_id: primaryRow.batch_id,
      adjudicator_id: assignment.clean_room_adjudicator,
      issue_kind: "negative_treatment_lifecycle_binding",
      review_row_sha256: { primary: primaryRowSha, independent: independentRowSha },
      resolution: "The route-rename event establishes route identity only; future-tense stop-addition language and the accepted add transition do not establish lifecycle state for the exact treatment placement.",
      accepted_valid_time: null,
      semantic_limits: [
        "does_not_assert_active",
        "does_not_assert_inactive",
        "does_not_infer_lifecycle_from_action",
        "placement_state_remains_unknown",
      ],
    }));
  }
  if (candidate.lifecycle_candidate_id === SPECIAL.m16Installation ||
      candidate.lifecycle_candidate_id === SPECIAL.m34Installation) {
    candidateAdjudications.push(adjudication({
      schema_version: 1,
      contract_id: "plan-055-lifecycle-clean-room-adjudication-v1",
      lifecycle_candidate_id: candidate.lifecycle_candidate_id,
      placement_id: candidate.placement_id,
      batch_id: primaryRow.batch_id,
      adjudicator_id: assignment.clean_room_adjudicator,
      issue_kind: "physical_installation_activity_boundary",
      review_row_sha256: { primary: primaryRowSha, independent: independentRowSha },
      resolution: "Accept active only as physical machine-installation activity/existence at the bounded 2011-10-04 point.",
      accepted_valid_time: independentRow.valid_time,
      semantic_limits: [
        "does_not_assert_operational_off_board_fare_collection",
        "does_not_assert_service_activation",
        "does_not_assert_persistence_after_2011_10_04",
        "does_not_assert_current_operation",
      ],
    }));
  }
  if (accepted && canonical(primaryRow.proposed_assertion?.valid_time) !==
      canonical(independentRow.valid_time)) {
    validTimeDisagreements += 1;
    if (candidate.lifecycle_candidate_id !== SPECIAL.fulton) {
      throw new Error(`${candidate.lifecycle_candidate_id}: unadjudicated valid-time disagreement`);
    }
    requireEqual(independentRow.valid_time, {
      coverage_kind: "point",
      start_earliest: "2019-07-01",
      start_latest: "2019-12-31",
      end_earliest: null,
      end_latest: null,
      precision: "range",
    }, "Fulton evidence-preserving bounds");
    candidateAdjudications.push(adjudication({
      schema_version: 1,
      contract_id: "plan-055-lifecycle-clean-room-adjudication-v1",
      lifecycle_candidate_id: candidate.lifecycle_candidate_id,
      placement_id: candidate.placement_id,
      batch_id: primaryRow.batch_id,
      adjudicator_id: assignment.clean_room_adjudicator,
      issue_kind: "valid_time_range_correction",
      review_row_sha256: { primary: primaryRowSha, independent: independentRowSha },
      resolution: "Preserve the exact source-stated July–December 2019 uncertainty range instead of compressing the valid-time point to December.",
      accepted_valid_time: independentRow.valid_time,
      semantic_limits: [
        "range_is_valid_time_not_document_time",
        "does_not_assert_continuity_after_2019_12_31",
      ],
    }));
  }
  adjudications.push(...candidateAdjudications);

  const state = accepted ? independentRow.proposed_state! : "active";
  const validTime = independentRow.valid_time;
  const evidenceBindings = normalizedEvidence(independentRow.proposed_assertion_evidence_bindings);
  const decisionBasis = {
    plan_id: PLAN_ID,
    lifecycle_candidate_id: candidate.lifecycle_candidate_id,
    candidate_sha256: candidate.candidate_sha256,
    placement_id: candidate.placement_id,
    batch_id: primaryRow.batch_id,
    batch_manifest_sha256: batch.sha256,
    primary_reviewer: primaryRow.reviewer_id,
    independent_reviewer: independentRow.reviewer_id,
    primary_row_sha256: primaryRowSha,
    independent_row_sha256: independentRowSha,
    terminal_disposition: accepted ? "accepted_assertion" : "explicit_negative_rejected_assertion",
    state,
    valid_time: validTime,
    document_time: candidate.document_time_candidate,
    evidence_bindings: evidenceBindings,
    adjudication_ids: candidateAdjudications.map((row) => row.adjudication_id).sort(),
  };
  const decisionId = `plan-055-lifecycle-decision:${sha256(canonical(decisionBasis))}`;
  const assertionWithoutId = {
    subject: { kind: "placement" as const, placement_id: candidate.placement_id },
    state,
    valid_time: validTime,
    evidence_bindings: evidenceBindings,
    decision_id: decisionId,
  };
  const assertion = parseInterventionLifecycleAssertion({
    schema_version: 1,
    assertion_id: assertionId(assertionWithoutId),
    ...assertionWithoutId,
    document_time: candidate.document_time_candidate,
    truth_status: independentRow.proposed_truth_status,
    review_state: accepted ? "accepted" : "rejected",
    supersedes_assertion_ids: [],
  }, `Plan 055 accepted decision ${decisionId}`);
  assertions.push(assertion);
  const decision = {
    schema_version: 1,
    contract_id: "plan-055-lifecycle-accepted-decision-v1",
    decision_id: decisionId,
    ...decisionBasis,
    assertion_id: assertion.assertion_id,
    assertion_review_state: assertion.review_state,
    integrated_at: ACCEPTED_AT,
    integrator_id: INTEGRATOR_ID,
    rationale: independentRow.rationale,
    independent_source_document_times: independentRow.source_document_times,
    provider_usage: {
      provider_requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      actual_cost_usd: 0,
    },
  };
  decisions.push(decision);
  const receiptWithoutId = {
    schema_version: 1,
    contract_id: "plan-055-lifecycle-decision-receipt-v1",
    plan_id: PLAN_ID,
    lifecycle_candidate_id: candidate.lifecycle_candidate_id,
    decision_id: decisionId,
    assertion_id: assertion.assertion_id,
    assertion_review_state: assertion.review_state,
    review_rows: { primary_sha256: primaryRowSha, independent_sha256: independentRowSha },
    adjudication_ids: candidateAdjudications.map((row) => row.adjudication_id).sort(),
    integrator_id: INTEGRATOR_ID,
    accepted_at: ACCEPTED_AT,
    provider_usage: { provider_requests: 0, actual_cost_usd: 0 },
  };
  receipts.push({
    ...receiptWithoutId,
    receipt_id: `plan-055-lifecycle-receipt:${sha256(canonical(receiptWithoutId))}`,
  });
}

adjudications.sort((a, b) => a.adjudication_id.localeCompare(b.adjudication_id));
decisions.sort((a, b) => canonical(a).localeCompare(canonical(b)));
assertions.sort((a, b) => a.assertion_id.localeCompare(b.assertion_id));
receipts.sort((a, b) => canonical(a).localeCompare(canonical(b)));
requireCount(adjudications.length, 6, "clean-room adjudications and risk resolutions");
requireCount(validTimeDisagreements, 1, "valid-time disagreements");
requireCount(decisions.length, EXPECTED_CANDIDATES, "accepted lifecycle decisions");
requireCount(assertions.length, EXPECTED_CANDIDATES, "terminal lifecycle assertion candidates");
requireCount(receipts.length, EXPECTED_CANDIDATES, "lifecycle decision receipts");
requireEqual(countBy(assertions.map((row) => `${row.review_state}:${row.state}`)), {
  "accepted:active": EXPECTED_ACTIVE,
  "accepted:planned": EXPECTED_PLANNED,
  "rejected:active": EXPECTED_NEGATIVE,
}, "terminal lifecycle assertion arithmetic");
assertUnique(assertions.map((row) => row.assertion_id), "lifecycle assertion ids");
assertUnique(decisions.map((row) => (row as { decision_id: string }).decision_id), "lifecycle decision ids");

const records: MtaCanonicalRecord[] = [
  "sources", "entities", "projects", "corridors", "events", "routes",
  "treatment_components", "claims", "metric_claims", "source_gaps", "relations",
].flatMap((kind) => readJsonl<MtaCanonicalRecord>(`data/canonical/${kind}.jsonl`));
const placements = readJsonl<InterventionPlacementRegistryEntry>(
  "data/resolved-transit/operator/v1/placements/registry.jsonl",
);
const transitions = readJsonl<ApplicationPlacementTransition>(
  "data/resolved-transit/operator/v1/placements/transitions.jsonl",
);
const applications = readJsonl<ResolvedInterventionApplication>(
  "data/resolved-transit/operator/v1/interventions/applications.jsonl",
);
const episodes = readJsonl<ResolvedInterventionEpisode>(
  "data/resolved-transit/operator/v1/interventions/episodes.jsonl",
);
const validatedAssertions = validateAcceptedInterventionLifecycleAssertions(assertions, {
  placements,
  episodes,
  applications,
  canonical_records: records,
});

const snapshotArtifacts: Array<{
  as_of_date: string;
  path: string;
  sha256: string;
  bytes: number;
  counts_by_state: Record<string, number>;
  confirmed_active_count: number;
  reconciliation_count: number;
}> = [];
for (const asOfDate of SNAPSHOT_DATES) {
  const projection = buildInterventionLifecycleProjection({
    placements,
    transitions,
    assertions: validatedAssertions,
    as_of_date: asOfDate,
  });
  if (projection.summary.resolved_placement_count !== EXPECTED_CANDIDATES ||
      projection.summary.state_count !== EXPECTED_CANDIDATES ||
      projection.summary.confirmed_active_count + projection.summary.reconciliation_count !==
        EXPECTED_CANDIDATES) {
    throw new Error(`${asOfDate}: lifecycle footprint partition is unbalanced`);
  }
  const root = `${CAMPAIGN}/accepted/snapshots/${asOfDate}`;
  const contents = interventionLifecycleContents(projection);
  for (const [name, content] of Object.entries(contents)) {
    writeOwned(`${root}/${name}`, content, mode);
  }
  const manifestContent = json({
    schema_version: 1,
    contract_id: "plan-055-lifecycle-state-snapshot-v1",
    plan_id: PLAN_ID,
    as_of_date: asOfDate,
    assertion_partition_sha256: contentPartition(validatedAssertions),
    state_count: projection.summary.state_count,
    counts_by_state: projection.summary.counts_by_state,
    confirmed_active_count: projection.summary.confirmed_active_count,
    reconciliation_count: projection.summary.reconciliation_count,
    positive_plus_reconciliation_equals_all_placements: true,
    artifacts: Object.entries(contents).map(([name, content]) => ({
      path: `${root}/${name}`,
      bytes: Buffer.byteLength(content),
      sha256: sha256(content),
    })),
  });
  const path = `${root}/snapshot-manifest.json`;
  writeOwned(path, manifestContent, mode);
  snapshotArtifacts.push({
    as_of_date: asOfDate,
    path,
    sha256: sha256(manifestContent),
    bytes: Buffer.byteLength(manifestContent),
    counts_by_state: projection.summary.counts_by_state,
    confirmed_active_count: projection.summary.confirmed_active_count,
    reconciliation_count: projection.summary.reconciliation_count,
  });
}
const production = snapshotArtifacts.find((row) => row.as_of_date === PRODUCTION_AS_OF)!;
requireEqual(production.counts_by_state, {
  confirmed_active: 0,
  confirmed_inactive: 0,
  conflicted: 0,
  last_confirmed_active: 95,
  planned: 0,
  suspended: 0,
  unknown: 9,
}, "production lifecycle state partition");
requireCount(production.confirmed_active_count, 0, "production confirmed-current footprint");
requireCount(production.reconciliation_count, EXPECTED_CANDIDATES, "production footprint reconciliation");

for (const row of assertions) {
  writeOwned(`${GLOBAL_ACCEPTED}/${row.assertion_id}.json`, json(row), mode);
}
for (const row of receipts) {
  const receiptId = (row as { receipt_id: string }).receipt_id;
  writeOwned(`${CAMPAIGN}/accepted/receipts/${receiptId.split(":").at(-1)!}.json`, json(row), mode);
}
writeOwned(`${CAMPAIGN}/reviews/adjudication/decisions.jsonl`, jsonl(adjudications), mode);
writeOwned(`${CAMPAIGN}/reviews/adjudication/summary.json`, json({
  schema_version: 1,
  contract_id: "plan-055-lifecycle-clean-room-adjudication-summary-v1",
  plan_id: PLAN_ID,
  adjudication_count: adjudications.length,
  counts_by_issue: countBy(adjudications.map((row) => row.issue_kind)),
  adjudication_partition_sha256: contentPartition(adjudications),
  valid_time_disagreement_count: validTimeDisagreements,
}), mode);
writeOwned(`${CAMPAIGN}/accepted/decisions.jsonl`, jsonl(decisions), mode);
writeOwned(`${CAMPAIGN}/accepted/assertions.jsonl`, jsonl(assertions), mode);
writeOwned(`${CAMPAIGN}/accepted/snapshot-index.json`, json({
  schema_version: 1,
  contract_id: "plan-055-lifecycle-snapshot-index-v1",
  plan_id: PLAN_ID,
  production_as_of_date: PRODUCTION_AS_OF,
  snapshots: snapshotArtifacts,
  snapshot_partition_sha256: contentPartition(snapshotArtifacts),
}), mode);

const decisionPartition = contentPartition(decisions);
const assertionPartition = contentPartition(assertions);
const receiptPartition = contentPartition(receipts);
const adjudicationPartition = contentPartition(adjudications);
const snapshotPartition = contentPartition(snapshotArtifacts);
const integrationWithoutId = {
  schema_version: 1,
  contract_id: "plan-055-lifecycle-integration-receipt-v1",
  plan_id: PLAN_ID,
  owner_authorization: {
    batch_manifests_approved: true,
    lifecycle_semantic_acceptance_approved: true,
    conflict_resolutions_approved: true,
    production_as_of_date_approved: PRODUCTION_AS_OF,
    publication_authorized: false,
  },
  frozen_portfolio: FROZEN,
  review_artifacts: Object.fromEntries(Object.entries(REVIEW_ARTIFACTS).map(([key, value]) => [key, {
    path: value.target,
    sha256: value.sha256,
  }])),
  reviewer_results: {
    terminal_disposition_and_state_agreements: EXPECTED_CANDIDATES,
    valid_time_disagreements: validTimeDisagreements,
    clean_room_adjudications_and_risk_resolutions: adjudications.length,
    negative_semantic_adjudications: EXPECTED_NEGATIVE,
    bounded_installation_risk_resolutions: 2,
    valid_time_range_corrections: 1,
  },
  counts: {
    lifecycle_candidates: EXPECTED_CANDIDATES,
    accepted_active_assertions: EXPECTED_ACTIVE,
    accepted_planned_assertions: EXPECTED_PLANNED,
    rejected_negative_assertions: EXPECTED_NEGATIVE,
    accepted_assertions: EXPECTED_ACTIVE + EXPECTED_PLANNED,
    rejected_assertions: EXPECTED_NEGATIVE,
    pending_assertions: 0,
    conflicted_assertions: 0,
    decision_receipts: receipts.length,
    snapshots: snapshotArtifacts.length,
    production_confirmed_current: production.confirmed_active_count,
    production_reconciliation: production.reconciliation_count,
  },
  partitions: {
    decisions_sha256: decisionPartition,
    assertions_sha256: assertionPartition,
    decision_receipts_sha256: receiptPartition,
    adjudications_sha256: adjudicationPartition,
    snapshots_sha256: snapshotPartition,
  },
  production_state_counts: production.counts_by_state,
  canonical_observations_edited: false,
  immutable_spec_edited: false,
  accepted_at: ACCEPTED_AT,
  integrator_id: INTEGRATOR_ID,
  provider_usage: {
    provider_requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    committed_cost_usd: 0,
    actual_cost_usd: 0,
  },
};
const integration = {
  ...integrationWithoutId,
  receipt_id: `plan-055-integration:${sha256(canonical(integrationWithoutId))}`,
};
writeOwned(`${CAMPAIGN}/accepted/integration-receipt.json`, json(integration), mode);
const completionWithoutId = {
  schema_version: 1,
  contract_id: "plan-055-lifecycle-completion-receipt-v1",
  plan_id: PLAN_ID,
  integration_receipt: {
    path: `${CAMPAIGN}/accepted/integration-receipt.json`,
    sha256: sha256(json(integration)),
    receipt_id: integration.receipt_id,
  },
  terminal_lifecycle_partition: {
    candidate_count: EXPECTED_CANDIDATES,
    candidate_id_partition_sha256: FROZEN.candidate_id_partition_sha256,
    accepted: EXPECTED_ACTIVE + EXPECTED_PLANNED,
    rejected_or_explicit_negative: EXPECTED_NEGATIVE,
    conflicted: 0,
    pending: 0,
  },
  production_as_of_date: PRODUCTION_AS_OF,
  production_footprint_partition: {
    placements: EXPECTED_CANDIDATES,
    confirmed_current: production.confirmed_active_count,
    reconciliation: production.reconciliation_count,
    unexplained_loss: 0,
  },
  publication_authorized_or_performed: false,
  accepted_at: ACCEPTED_AT,
};
const completion = {
  ...completionWithoutId,
  receipt_id: `plan-055-completion:${sha256(canonical(completionWithoutId))}`,
};
writeOwned(`${CAMPAIGN}/accepted/completion-receipt.json`, json(completion), mode);

requireCount(
  readdirSync(absolute(GLOBAL_ACCEPTED)).filter((name) => name.endsWith(".json")).length,
  EXPECTED_CANDIDATES,
  "global accepted lifecycle assertion file count",
);

console.log(canonical({
  mode,
  completion_receipt_id: completion.receipt_id,
  integration_receipt_id: integration.receipt_id,
  candidate_count: EXPECTED_CANDIDATES,
  accepted_active: EXPECTED_ACTIVE,
  accepted_planned: EXPECTED_PLANNED,
  rejected_negative: EXPECTED_NEGATIVE,
  terminal_agreements: EXPECTED_CANDIDATES,
  valid_time_disagreements: validTimeDisagreements,
  adjudications_and_risk_resolutions: adjudications.length,
  decision_partition_sha256: decisionPartition,
  assertion_partition_sha256: assertionPartition,
  receipt_partition_sha256: receiptPartition,
  adjudication_partition_sha256: adjudicationPartition,
  snapshot_partition_sha256: snapshotPartition,
  production_state_counts: production.counts_by_state,
  provider_requests: 0,
  actual_cost_usd: 0,
}));
