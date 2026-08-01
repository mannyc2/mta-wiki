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
import type { JsonValue } from "../packages/db/src/types";
import {
  interventionApplicationFingerprint,
  parseApplicationPlacementTransition,
  validateApplicationPlacementTransitionManifests,
  validateApplicationPlacementTransitions,
  type ApplicationPlacementTransition,
} from "../packages/pipeline/src/materialize/application-placement-transitions";
import {
  parseAcceptedPlacementCandidateDisposition,
  placementCandidateDispositionId,
  placementCandidateInputFingerprint,
  validateAcceptedPlacementCandidateDispositionManifests,
  validatePlacementDecisionProvenance,
  type AcceptedPlacementCandidateDisposition,
} from "../packages/pipeline/src/materialize/intervention-placement-candidate-dispositions";
import type { PlacementCandidateRow } from "../packages/pipeline/src/materialize/intervention-placement-frontier";
import {
  interventionPlacementRegistryPartition,
  parseInterventionPlacementIdentityOperation,
  replayInterventionPlacementIdentityOperations,
  validateInterventionPlacementIdentityOperationManifests,
  type InterventionPlacementFoundingClaim,
  type InterventionPlacementIdentityOperation,
} from "../packages/pipeline/src/materialize/intervention-placements";
import type { ResolvedInterventionApplication } from "../packages/pipeline/src/materialize/resolved-intervention-applications";

type Mode = "--write" | "--check";

const CAMPAIGN = "data/intervention-placements/campaigns/plan-054";
const BATCH_ROOT = `${CAMPAIGN}/batches`;
const COHORT_PATH = `${CAMPAIGN}/frozen-cohort/cohort.jsonl`;
const APPLICATIONS_PATH = `${CAMPAIGN}/frozen-cohort/applications.jsonl`;
const GLOBAL_ACCEPTED = "data/intervention-placements/accepted";
const ACCEPTED_AT = "2026-08-01T00:00:00Z";
const INTEGRATOR_ID = "plan-054-single-placement-integrator";
const EXPECTED_CANDIDATES = 1_773;
const EXPECTED_PLACEMENTS = 104;
const EXPECTED_AMBIGUITIES = 239;
const EXPECTED_NOT_PLACEMENTS = 1_430;
const EXPECTED_AGREEMENTS = 502;
const EXPECTED_ADJUDICATIONS = 1_271;

const FROZEN = {
  candidate_partition_sha256: "50e7343f0280fee884928742b1cc3e460cc62165642d70107b7274c3c9dca3e1",
  cohort_sha256: "357916356880d40d682252fe321370543efe2ebd693c2f89e16cd3f2cc6a30ce",
  cohort_input_sha256: "3b6b693bcc07acf42c085c2de3f5bb72dd5705dafc6d38ac24032a36814b3b5c",
  manifest_partition_sha256: "a16369cf468fa80cb1fcbfa61e8f8452d24738fda629b1de59cc193154d82b83",
  portfolio_sha256: "fa276f7c9da065e3a8ea67aeb382b1bd84443630416095dfd96b871121adbdde",
  public_key_replay_head: "ab00ce5bcb7f9db576eab3e6152ff5f6de6b160c74cd0bf4f0c29581cf9d724d",
} as const;

const REVIEW_ARTIFACTS = {
  primary: {
    source: "/tmp/plan054-primary-review.jsonl",
    target: `${CAMPAIGN}/reviews/primary/proposals.jsonl`,
    sha256: "92c71c00eca44cff49ab46a95e670f77cc5cdeb385035af7cfba170b20c29846",
  },
  primary_summary: {
    source: "/tmp/plan054-primary-review-summary.json",
    target: `${CAMPAIGN}/reviews/primary/summary.json`,
    sha256: "3992ace155c850632534d43c9dabee34b609320d075db71184d76828fdafaeec",
  },
  primary_audit: {
    source: "/tmp/plan054-primary-audit.json",
    target: `${CAMPAIGN}/reviews/primary/audit.json`,
    sha256: "83f3bd1cb1d582455405195bf9078da68e6c6a24713989ec2f45d377ea69faee",
  },
  independent: {
    source: "/tmp/plan054-independent-review.jsonl",
    target: `${CAMPAIGN}/reviews/independent/proposals.jsonl`,
    sha256: "50d3cf6bd647a0241bb514943f3a19c2d3c44d0687af9b25bb599e692ab8d374",
  },
  independent_summary: {
    source: "/tmp/plan054-independent-review-summary.json",
    target: `${CAMPAIGN}/reviews/independent/summary.json`,
    sha256: "a7ed666f4849cbed270eada9260a5d03c1fd1b94552f24adfcd128d150810454",
  },
  adjudication: {
    source: "/tmp/plan054-adjudication.jsonl",
    target: `${CAMPAIGN}/reviews/adjudication/recommendations.jsonl`,
    sha256: "d69a3db3276e41f4d4105ad12103801c98acaee550db3e7138dd74e329d2a537",
  },
  adjudication_summary: {
    source: "/tmp/plan054-adjudication-summary.json",
    target: `${CAMPAIGN}/reviews/adjudication/summary.json`,
    sha256: "6c2f06909e3b8f91a51a1db83766311372ecc3acb1f19b319b6abf2126f5fe13",
  },
} as const;

type FrozenCohortRow = {
  schema_version: 1;
  candidate: PlacementCandidateRow;
  application: null | {
    action: ResolvedInterventionApplication["action"];
    application_fingerprint: string;
    application_id: string;
    extent_kind: string;
    public_key: string;
    public_key_aliases: string[];
  };
  cohort_row_sha256: string;
};

type PrimaryReviewRow = {
  candidate_id: string;
  batch_id: string;
  decision_id: string;
  reviewer_id: string;
  proposed_terminal_placement_disposition: string;
};

type NegativeDisposition = {
  reason_code: string;
};

type PositiveIdentity = {
  placement_id: string;
  founding_key: string;
  claim: InterventionPlacementFoundingClaim;
  placement_aliases_registered?: string[];
};

type PositiveOperation = {
  operation: "establish";
  founding_key: string;
  claim: InterventionPlacementFoundingClaim;
  aliases: string[];
  placement_id: string;
  public_identity_redirect: null;
};

type PositiveTransition = {
  action: ResolvedInterventionApplication["action"];
  disposition: string;
  evidence_bindings: ResolvedInterventionApplication["evidence_bindings"];
  target_placement_ids: string[];
  result_placement_ids: string[];
};

type FinalRecommendation = {
  terminal_disposition: "resolved_placement" | "ambiguous" | "not_a_placement";
  placement_identity: PositiveIdentity | null;
  identity_operation: PositiveOperation | null;
  application_transition: PositiveTransition | null;
  explicit_negative_disposition: NegativeDisposition | null;
  reason_code: string;
  rationale: string;
};

type IndependentReviewRow = {
  candidate_id: string;
  batch_id: string;
  origin: PlacementCandidateRow["origin"];
  reviewer_id: string;
  terminal_disposition: FinalRecommendation["terminal_disposition"];
  supported_identity: PositiveIdentity | null;
  supported_operation: PositiveOperation | null;
  application_transition: PositiveTransition | null;
  explicit_negative_disposition: NegativeDisposition | null;
  reasoning: string;
  frozen_pins: {
    application_fingerprint: string | null;
    cohort_row_sha256: string;
    manifest_sha256: string;
  };
};

type AdjudicationRow = {
  candidate_id: string;
  batch_id: string;
  adjudicator_id: string;
  primary_decision_id: string;
  adjudicated_recommendation: FinalRecommendation;
  frozen_hash_pins: {
    application_fingerprint: string | null;
    cohort_row_sha256: string;
    batch_manifest_sha256: string;
    primary_review_sha256: string;
    independent_review_sha256: string;
  };
};

type BatchManifest = {
  batch_id: string;
  reviewer_assignments: {
    primary_reviewer: string;
    required_independent_reviewer: string;
    clean_room_adjudicator: string;
    single_writer_integrator: string;
  };
};

type DecisionReceipt = {
  schema_version: 1;
  contract_id: "plan-054-placement-decision-receipt-v1";
  receipt_id: string;
  decision_id: string;
  candidate_id: string;
  batch_id: string;
  review_outcome: "agreement" | "adjudicated";
  review_rows: {
    primary_sha256: string;
    independent_sha256: string;
    adjudication_sha256: string | null;
  };
  accepted_outputs: {
    candidate_disposition_id: string;
    identity_operation_ids: string[];
    transition_ids: string[];
  };
  integrator_id: typeof INTEGRATOR_ID;
  accepted_at: typeof ACCEPTED_AT;
  provider_usage: {
    provider_requests: 0;
    input_tokens: 0;
    output_tokens: 0;
    actual_cost_usd: 0;
  };
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
  const content = readFileSync(absolute(path), "utf8").trim();
  return content ? content.split("\n").map((line) => JSON.parse(line) as T) : [];
}

function countBy(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function partition(values: readonly string[]): string {
  return sha256([...values].sort((left, right) => left.localeCompare(right)).join("\n"));
}

function contentPartition(values: readonly unknown[]): string {
  return sha256(jsonl([...values].sort((left, right) => canonical(left).localeCompare(canonical(right)))));
}

function requireCount(actual: number, expected: number, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (canonical(actual) !== canonical(expected)) throw new Error(`${label} mismatch`);
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`);
}

function writeOwned(path: string, content: string, mode: Mode): void {
  const target = absolute(path);
  if (mode === "--check") {
    if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      throw new Error(`Plan 054 integrated artifact missing or stale: ${path}`);
    }
    return;
  }
  if (existsSync(target)) {
    if (readFileSync(target, "utf8") !== content) {
      throw new Error(`refusing to overwrite differing Plan 054 artifact: ${path}`);
    }
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function loadOrCopyReviews(mode: Mode): void {
  for (const artifact of Object.values(REVIEW_ARTIFACTS)) {
    const target = absolute(artifact.target);
    if (existsSync(target)) {
      const content = readFileSync(target);
      if (sha256(content) !== artifact.sha256) {
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

function loadBatch(batchId: string): { manifest: BatchManifest; sha256: string } {
  const path = `${BATCH_ROOT}/${batchId}.json`;
  const content = readFileSync(absolute(path), "utf8");
  const manifest = JSON.parse(content) as BatchManifest;
  if (manifest.batch_id !== batchId) throw new Error(`${path}: batch id mismatch`);
  return { manifest, sha256: sha256(content) };
}

function placementId(foundingKey: string): string {
  return `placement:${sha256(`intervention-placement-v1\0${foundingKey}`).slice(0, 24)}`;
}

function decisionId(input: {
  candidate_id: string;
  batch_id: string;
  final: FinalRecommendation;
  review_outcome: "agreement" | "adjudicated";
  primary_row_sha256: string;
  independent_row_sha256: string;
  adjudication_row_sha256: string | null;
}): string {
  return `plan-054-placement-${sha256(canonical(input)).slice(0, 24)}`;
}

function operationId(input: {
  decision_id: string;
  candidate_id: string;
  founding_key: string;
  claim: InterventionPlacementFoundingClaim;
  aliases: string[];
}): string {
  return `placement-operation:${sha256(canonical(input)).slice(0, 24)}`;
}

function transitionId(input: {
  application_id: string;
  decision_id: string;
  result_placement_ids: string[];
  target_placement_ids: string[];
}): string {
  return `transition:${sha256(canonical(input)).slice(0, 24)}`;
}

function receipt(input: Omit<DecisionReceipt, "receipt_id">): DecisionReceipt {
  return {
    ...input,
    receipt_id: `plan-054-placement-receipt:${sha256(canonical(input))}`,
  };
}

const mode = process.argv[2] as Mode | undefined;
if (mode !== "--write" && mode !== "--check") {
  throw new Error("usage: bun scripts/integrate-plan054-placement-review.ts --write|--check");
}

if (sha256(readFileSync(absolute(COHORT_PATH))) !== FROZEN.cohort_sha256) {
  throw new Error("Plan 054 frozen cohort hash drifted");
}
if (sha256(readFileSync(absolute(`${CAMPAIGN}/portfolio.json`))) !== FROZEN.portfolio_sha256) {
  throw new Error("Plan 054 frozen portfolio hash drifted");
}

loadOrCopyReviews(mode);

const cohort = readJsonl<FrozenCohortRow>(COHORT_PATH);
const applications = readJsonl<ResolvedInterventionApplication>(APPLICATIONS_PATH);
const primary = readJsonl<PrimaryReviewRow>(REVIEW_ARTIFACTS.primary.target);
const independent = readJsonl<IndependentReviewRow>(REVIEW_ARTIFACTS.independent.target);
const adjudications = readJsonl<AdjudicationRow>(REVIEW_ARTIFACTS.adjudication.target);

requireCount(cohort.length, EXPECTED_CANDIDATES, "frozen candidate count");
requireCount(primary.length, EXPECTED_CANDIDATES, "primary review count");
requireCount(independent.length, EXPECTED_CANDIDATES, "independent review count");
requireCount(adjudications.length, EXPECTED_ADJUDICATIONS, "adjudication count");
requireCount(applications.length, 343, "application count");
assertUnique(cohort.map((row) => row.candidate.candidate_id), "frozen candidate ids");
assertUnique(primary.map((row) => row.candidate_id), "primary candidate ids");
assertUnique(independent.map((row) => row.candidate_id), "independent candidate ids");
assertUnique(adjudications.map((row) => row.candidate_id), "adjudicated candidate ids");
if (partition(cohort.map((row) => row.candidate.candidate_id)) !== FROZEN.candidate_partition_sha256) {
  throw new Error("Plan 054 candidate identity partition drifted");
}

const cohortByCandidate = new Map(cohort.map((row) => [row.candidate.candidate_id, row]));
const primaryByCandidate = new Map(primary.map((row) => [row.candidate_id, row]));
const independentByCandidate = new Map(independent.map((row) => [row.candidate_id, row]));
const adjudicationByCandidate = new Map(adjudications.map((row) => [row.candidate_id, row]));
const applicationsById = new Map(applications.map((row) => [row.application_id, row]));

const candidateDispositions: AcceptedPlacementCandidateDisposition[] = [];
const identityOperations: InterventionPlacementIdentityOperation[] = [];
const transitions: ApplicationPlacementTransition[] = [];
const receipts: DecisionReceipt[] = [];

for (const frozen of cohort) {
  const candidate = frozen.candidate;
  const primaryRow = primaryByCandidate.get(candidate.candidate_id);
  const independentRow = independentByCandidate.get(candidate.candidate_id);
  const adjudicationRow = adjudicationByCandidate.get(candidate.candidate_id) ?? null;
  if (!primaryRow || !independentRow) throw new Error(`${candidate.candidate_id}: incomplete dual review`);
  if (primaryRow.batch_id !== independentRow.batch_id || primaryRow.batch_id !== adjudicationRow?.batch_id && adjudicationRow) {
    throw new Error(`${candidate.candidate_id}: review batch mismatch`);
  }
  const batch = loadBatch(primaryRow.batch_id);
  if (independentRow.frozen_pins.manifest_sha256 !== batch.sha256 ||
      independentRow.frozen_pins.cohort_row_sha256 !== frozen.cohort_row_sha256 ||
      independentRow.frozen_pins.application_fingerprint !==
        (frozen.application?.application_fingerprint ?? null)) {
    throw new Error(`${candidate.candidate_id}: independent frozen pins drifted`);
  }
  if (primaryRow.reviewer_id !== batch.manifest.reviewer_assignments.primary_reviewer ||
      independentRow.reviewer_id !== batch.manifest.reviewer_assignments.required_independent_reviewer ||
      batch.manifest.reviewer_assignments.single_writer_integrator !== INTEGRATOR_ID) {
    throw new Error(`${candidate.candidate_id}: frozen reviewer assignments drifted`);
  }

  let final: FinalRecommendation;
  let reviewOutcome: "agreement" | "adjudicated";
  let adjudicator: string | null;
  if (adjudicationRow) {
    if (adjudicationRow.adjudicator_id !== batch.manifest.reviewer_assignments.clean_room_adjudicator ||
        adjudicationRow.primary_decision_id !== primaryRow.decision_id ||
        adjudicationRow.frozen_hash_pins.batch_manifest_sha256 !== batch.sha256 ||
        adjudicationRow.frozen_hash_pins.cohort_row_sha256 !== frozen.cohort_row_sha256 ||
        adjudicationRow.frozen_hash_pins.application_fingerprint !==
          (frozen.application?.application_fingerprint ?? null) ||
        adjudicationRow.frozen_hash_pins.primary_review_sha256 !== REVIEW_ARTIFACTS.primary.sha256 ||
        adjudicationRow.frozen_hash_pins.independent_review_sha256 !== REVIEW_ARTIFACTS.independent.sha256) {
      throw new Error(`${candidate.candidate_id}: adjudication pins drifted`);
    }
    final = adjudicationRow.adjudicated_recommendation;
    reviewOutcome = "adjudicated";
    adjudicator = adjudicationRow.adjudicator_id;
  } else {
    if (primaryRow.proposed_terminal_placement_disposition !== independentRow.terminal_disposition) {
      throw new Error(`${candidate.candidate_id}: disagreement lacks clean-room adjudication`);
    }
    final = {
      terminal_disposition: independentRow.terminal_disposition,
      placement_identity: independentRow.supported_identity,
      identity_operation: independentRow.supported_operation,
      application_transition: independentRow.application_transition,
      explicit_negative_disposition: independentRow.explicit_negative_disposition,
      reason_code: independentRow.explicit_negative_disposition?.reason_code ?? "dual_review_agreement",
      rationale: independentRow.reasoning,
    };
    reviewOutcome = "agreement";
    adjudicator = null;
  }

  const primaryRowSha = sha256(canonical(primaryRow));
  const independentRowSha = sha256(canonical(independentRow));
  const adjudicationRowSha = adjudicationRow ? sha256(canonical(adjudicationRow)) : null;
  const acceptedDecisionId = decisionId({
    candidate_id: candidate.candidate_id,
    batch_id: primaryRow.batch_id,
    final,
    review_outcome: reviewOutcome,
    primary_row_sha256: primaryRowSha,
    independent_row_sha256: independentRowSha,
    adjudication_row_sha256: adjudicationRowSha,
  });

  let placementIds: string[] = [];
  let transitionIds: string[] = [];
  let transitionDisposition: AcceptedPlacementCandidateDisposition["transition_disposition"] = "not_applicable";
  let operationIds: string[] = [];
  if (final.terminal_disposition === "resolved_placement") {
    if (!candidate.application_id || !frozen.application || !final.identity_operation ||
        !final.placement_identity || !final.application_transition) {
      throw new Error(`${candidate.candidate_id}: resolved placement lacks exact accepted bindings`);
    }
    const application = applicationsById.get(candidate.application_id);
    if (!application || application.action !== "add" || final.application_transition.action !== "add") {
      throw new Error(`${candidate.candidate_id}: only exact reviewed additions may establish`);
    }
    if (interventionApplicationFingerprint(application) !== frozen.application.application_fingerprint) {
      throw new Error(`${candidate.candidate_id}: frozen application fingerprint drifted`);
    }
    const operation = final.identity_operation;
    const expectedPlacementId = placementId(operation.founding_key);
    if (operation.placement_id !== expectedPlacementId || final.placement_identity.placement_id !== expectedPlacementId ||
        operation.founding_key !== `application-public-key:${frozen.application.public_key}` ||
        !operation.aliases.includes(frozen.application.public_key) || operation.public_identity_redirect !== null) {
      throw new Error(`${candidate.candidate_id}: stable public-key placement anchor drifted`);
    }
    const acceptedOperationId = operationId({
      decision_id: acceptedDecisionId,
      candidate_id: candidate.candidate_id,
      founding_key: operation.founding_key,
      claim: operation.claim,
      aliases: operation.aliases,
    });
    const acceptedOperation = parseInterventionPlacementIdentityOperation({
      schema_version: 1,
      operation_id: acceptedOperationId,
      decision_id: acceptedDecisionId,
      candidate_ids: [candidate.candidate_id],
      issued_at: ACCEPTED_AT,
      batch_id: primaryRow.batch_id,
      manifest_sha256: batch.sha256,
      primary_reviewer: primaryRow.reviewer_id,
      independent_reviewer: independentRow.reviewer_id,
      review_outcome: reviewOutcome,
      adjudicator,
      integrator_id: INTEGRATOR_ID,
      rationale: final.rationale,
      operation: "establish",
      founding_key: operation.founding_key,
      claim: operation.claim,
      aliases: operation.aliases,
    });
    identityOperations.push(acceptedOperation);
    operationIds = [acceptedOperationId];

    const acceptedTransitionId = transitionId({
      application_id: application.application_id,
      decision_id: acceptedDecisionId,
      result_placement_ids: [expectedPlacementId],
      target_placement_ids: [],
    });
    const acceptedTransition = parseApplicationPlacementTransition({
      schema_version: 1,
      transition_id: acceptedTransitionId,
      application_id: application.application_id,
      application_fingerprint: frozen.application.application_fingerprint,
      action: application.action,
      target_placement_ids: [],
      result_placement_ids: [expectedPlacementId],
      decision_id: acceptedDecisionId,
      evidence_bindings: application.evidence_bindings,
      batch_id: primaryRow.batch_id,
      manifest_sha256: batch.sha256,
      primary_reviewer: primaryRow.reviewer_id,
      independent_reviewer: independentRow.reviewer_id,
      review_outcome: reviewOutcome,
      adjudicator,
      integrator_id: INTEGRATOR_ID,
      accepted_at: ACCEPTED_AT,
      rationale: final.rationale,
    });
    transitions.push(acceptedTransition);
    placementIds = [expectedPlacementId];
    transitionIds = [acceptedTransitionId];
    transitionDisposition = "accepted_transition";
  } else if (candidate.application_id) {
    if (final.terminal_disposition !== "ambiguous" || final.identity_operation ||
        final.placement_identity || final.application_transition) {
      throw new Error(`${candidate.candidate_id}: negative application disposition is authorizing`);
    }
    transitionDisposition = "accepted_negative_transition";
  } else if (final.terminal_disposition !== "not_a_placement" || final.identity_operation ||
      final.placement_identity || final.application_transition) {
    throw new Error(`${candidate.candidate_id}: documentary candidate disposition is authorizing`);
  }

  const dispositionWithoutId = {
    schema_version: 1 as const,
    candidate_id: candidate.candidate_id,
    candidate_input_fingerprint: placementCandidateInputFingerprint(candidate),
    application_id: candidate.application_id,
    disposition: final.terminal_disposition,
    placement_ids: placementIds,
    transition_ids: transitionIds,
    transition_disposition: transitionDisposition,
    decision_id: acceptedDecisionId,
    batch_id: primaryRow.batch_id,
    manifest_sha256: batch.sha256,
    primary_reviewer: primaryRow.reviewer_id,
    independent_reviewer: independentRow.reviewer_id,
    review_outcome: reviewOutcome,
    adjudicator,
    integrator_id: INTEGRATOR_ID,
    accepted_at: ACCEPTED_AT,
    reason_code: final.reason_code,
    rationale: final.rationale,
  };
  const disposition = parseAcceptedPlacementCandidateDisposition({
    ...dispositionWithoutId,
    disposition_id: placementCandidateDispositionId(dispositionWithoutId),
  });
  candidateDispositions.push(disposition);
  receipts.push(receipt({
    schema_version: 1,
    contract_id: "plan-054-placement-decision-receipt-v1",
    decision_id: acceptedDecisionId,
    candidate_id: candidate.candidate_id,
    batch_id: primaryRow.batch_id,
    review_outcome: reviewOutcome,
    review_rows: {
      primary_sha256: primaryRowSha,
      independent_sha256: independentRowSha,
      adjudication_sha256: adjudicationRowSha,
    },
    accepted_outputs: {
      candidate_disposition_id: disposition.disposition_id,
      identity_operation_ids: operationIds,
      transition_ids: transitionIds,
    },
    integrator_id: INTEGRATOR_ID,
    accepted_at: ACCEPTED_AT,
    provider_usage: {
      provider_requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      actual_cost_usd: 0,
    },
  }));
}

candidateDispositions.sort((left, right) => left.decision_id.localeCompare(right.decision_id));
identityOperations.sort((left, right) => left.operation_id.localeCompare(right.operation_id));
transitions.sort((left, right) => left.transition_id.localeCompare(right.transition_id));
receipts.sort((left, right) => left.receipt_id.localeCompare(right.receipt_id));

requireCount(candidateDispositions.length, EXPECTED_CANDIDATES, "accepted candidate dispositions");
requireCount(identityOperations.length, EXPECTED_PLACEMENTS, "identity establishments");
requireCount(transitions.length, EXPECTED_PLACEMENTS, "positive application transitions");
requireCount(receipts.length, EXPECTED_CANDIDATES, "decision receipts");
requireEqual(countBy(candidateDispositions.map((row) => row.disposition)), {
  ambiguous: EXPECTED_AMBIGUITIES,
  not_a_placement: EXPECTED_NOT_PLACEMENTS,
  resolved_placement: EXPECTED_PLACEMENTS,
}, "terminal disposition arithmetic");
requireEqual(countBy(candidateDispositions.map((row) => row.review_outcome)), {
  adjudicated: EXPECTED_ADJUDICATIONS,
  agreement: EXPECTED_AGREEMENTS,
}, "review outcome arithmetic");
requireEqual(countBy(candidateDispositions.map((row) => row.transition_disposition)), {
  accepted_negative_transition: EXPECTED_AMBIGUITIES,
  accepted_transition: EXPECTED_PLACEMENTS,
  not_applicable: EXPECTED_NOT_PLACEMENTS,
}, "transition disposition arithmetic");
assertUnique(identityOperations.flatMap((row) => row.operation === "establish" ? row.aliases : []), "placement aliases");
requireCount(identityOperations.flatMap((row) => row.operation === "establish" ? row.aliases : []).length, 104, "stable placement aliases");

const validatedDispositions = validateAcceptedPlacementCandidateDispositionManifests(
  candidateDispositions,
  absolute(BATCH_ROOT),
  applications,
);
const validatedOperations = validateInterventionPlacementIdentityOperationManifests(
  identityOperations,
  absolute(BATCH_ROOT),
);
const registry = replayInterventionPlacementIdentityOperations(validatedOperations);
const registryPartition = interventionPlacementRegistryPartition(registry);
requireEqual(registryPartition, {
  registry_count: 104,
  live_count: 104,
  redirect_count: 0,
  retired_count: 0,
}, "placement registry partition");
const validatedTransitions = validateApplicationPlacementTransitions(
  validateApplicationPlacementTransitionManifests(
    transitions,
    absolute(BATCH_ROOT),
  ),
  applications,
  registry,
);
validatePlacementDecisionProvenance({
  candidate_dispositions: validatedDispositions,
  candidate_ledger: cohort.map((row) => row.candidate),
  identity_operations: validatedOperations,
  registry,
  transitions: validatedTransitions,
});

const dispositionPartition = contentPartition(candidateDispositions);
const operationPartition = contentPartition(identityOperations);
const transitionPartition = contentPartition(transitions);
const registryContentPartition = contentPartition(registry);
const receiptPartition = contentPartition(receipts);

for (const row of candidateDispositions) {
  writeOwned(`${GLOBAL_ACCEPTED}/candidate-dispositions/${row.decision_id}.json`, json(row), mode);
}
for (const row of identityOperations) {
  writeOwned(`${GLOBAL_ACCEPTED}/identity-operations/${row.operation_id}.json`, json(row), mode);
}
for (const row of transitions) {
  writeOwned(`${GLOBAL_ACCEPTED}/transitions/${row.decision_id}.json`, json(row), mode);
}
for (const row of receipts) {
  const hash = row.receipt_id.split(":").at(-1)!;
  writeOwned(`${CAMPAIGN}/accepted/receipts/${hash}.json`, json(row), mode);
}

writeOwned(`${CAMPAIGN}/accepted/candidate-dispositions.jsonl`, jsonl(candidateDispositions), mode);
writeOwned(`${CAMPAIGN}/accepted/identity-operations.jsonl`, jsonl(identityOperations), mode);
writeOwned(`${CAMPAIGN}/accepted/transitions.jsonl`, jsonl(transitions), mode);
writeOwned(`${CAMPAIGN}/accepted/registry.jsonl`, jsonl(registry), mode);

const integrationWithoutId = {
  schema_version: 1,
  contract_id: "plan-054-placement-integration-receipt-v1",
  plan_id: "plan-054",
  owner_authorization: {
    batch_manifests_approved: true,
    semantic_acceptance_approved: true,
    public_identity_redirects_approved: false,
    paid_provider_execution_approved: false,
  },
  frozen_portfolio: FROZEN,
  review_artifacts: Object.fromEntries(Object.entries(REVIEW_ARTIFACTS).map(([key, value]) => [key, {
    path: value.target,
    sha256: value.sha256,
  }])),
  accepted_at: ACCEPTED_AT,
  integrator_id: INTEGRATOR_ID,
  counts: {
    candidates: candidateDispositions.length,
    agreements: EXPECTED_AGREEMENTS,
    adjudications: EXPECTED_ADJUDICATIONS,
    resolved_placements: EXPECTED_PLACEMENTS,
    accepted_ambiguities: EXPECTED_AMBIGUITIES,
    not_a_placement: EXPECTED_NOT_PLACEMENTS,
    identity_operations: identityOperations.length,
    establish_operations: identityOperations.length,
    alias_operations: 0,
    public_identity_redirects: 0,
    positive_transitions: transitions.length,
    accepted_negative_transitions: EXPECTED_AMBIGUITIES,
    decision_receipts: receipts.length,
  },
  partitions: {
    candidate_dispositions_sha256: dispositionPartition,
    identity_operations_sha256: operationPartition,
    transitions_sha256: transitionPartition,
    registry_sha256: registryContentPartition,
    decision_receipts_sha256: receiptPartition,
  },
  registry_partition: registryPartition,
  lifecycle_assertions_written: 0,
  confirmed_current_footprint_rows_written: 0,
  canonical_observations_edited: false,
  immutable_spec_edited: false,
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
  receipt_id: `plan-054-integration:${sha256(canonical(integrationWithoutId))}`,
};
writeOwned(`${CAMPAIGN}/accepted/integration-receipt.json`, json(integration), mode);

const completionWithoutId = {
  schema_version: 1,
  contract_id: "plan-054-placement-completion-receipt-v1",
  plan_id: "plan-054",
  integration_receipt: {
    path: `${CAMPAIGN}/accepted/integration-receipt.json`,
    sha256: sha256(json(integration)),
    receipt_id: integration.receipt_id,
  },
  terminal_candidate_partition: {
    candidate_count: candidateDispositions.length,
    candidate_id_partition_sha256: partition(candidateDispositions.map((row) => row.candidate_id)),
    pending: 0,
    invalid: 0,
  },
  registry_partition: registryPartition,
  transition_partition: {
    applications: applications.length,
    positive_transitions: transitions.length,
    accepted_negative_transitions: EXPECTED_AMBIGUITIES,
    unreconciled: 0,
  },
  later_lifecycle_work_authorized_or_performed: false,
  publication_authorized_or_performed: false,
  accepted_at: ACCEPTED_AT,
};
const completion = {
  ...completionWithoutId,
  receipt_id: `plan-054-completion:${sha256(canonical(completionWithoutId))}`,
};
writeOwned(`${CAMPAIGN}/accepted/completion-receipt.json`, json(completion), mode);

const globalCounts = {
  candidate_dispositions: readdirSync(absolute(`${GLOBAL_ACCEPTED}/candidate-dispositions`))
    .filter((name) => name.endsWith(".json")).length,
  identity_operations: readdirSync(absolute(`${GLOBAL_ACCEPTED}/identity-operations`))
    .filter((name) => name.endsWith(".json")).length,
  transitions: readdirSync(absolute(`${GLOBAL_ACCEPTED}/transitions`))
    .filter((name) => name.endsWith(".json")).length,
};
requireEqual(globalCounts, {
  candidate_dispositions: EXPECTED_CANDIDATES,
  identity_operations: EXPECTED_PLACEMENTS,
  transitions: EXPECTED_PLACEMENTS,
}, "accepted journal exact file counts");

console.log(canonical({
  mode,
  completion_receipt_id: completion.receipt_id,
  integration_receipt_id: integration.receipt_id,
  candidate_count: candidateDispositions.length,
  candidate_disposition_partition_sha256: dispositionPartition,
  identity_operation_count: identityOperations.length,
  identity_operation_partition_sha256: operationPartition,
  registry_count: registry.length,
  registry_partition_sha256: registryContentPartition,
  transition_count: transitions.length,
  transition_partition_sha256: transitionPartition,
  decision_receipt_count: receipts.length,
  decision_receipt_partition_sha256: receiptPartition,
  provider_requests: 0,
  actual_cost_usd: 0,
}));
