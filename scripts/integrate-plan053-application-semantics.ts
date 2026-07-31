import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  loadPlan053BatchManifest,
  parsePlan053ApplicationSemanticProposal,
  reconcilePlan053Proposals,
  type Plan053ApplicationSemanticClaim,
  type Plan053ApplicationSemanticProposal,
  type Plan053BatchManifest,
} from "../packages/pipeline/src/materialize/application-semantic-review";
import {
  loadOperationalOccurrenceAcceptedDecisionsV2,
  type OperationalOccurrenceAcceptedDecisionV2,
} from "../packages/pipeline/src/materialize/operational-occurrence-review";
import {
  loadOperationalOccurrenceAcceptedDecisionsV3,
  operationalOccurrenceApplicationSemanticReviewReceipt,
  operationalOccurrenceCurrentReviewMembershipFingerprint,
  parseOperationalOccurrenceAcceptedDecisionV3,
  replayOperationalOccurrenceCurrentReviews,
  type OperationalOccurrenceAcceptedDecisionV3,
  type OperationalOccurrenceApplicationSemanticReview,
  type OperationalOccurrenceCurrentReviewApplication,
  type OperationalOccurrenceCurrentReviewDecision,
} from "../packages/pipeline/src/materialize/operational-occurrence-resolution";
import type { OperationalOccurrenceEvidenceBinding } from "../packages/pipeline/src/materialize/operational-occurrences";
import type { ResolvedInterventionApplication } from "../packages/pipeline/src/materialize/resolved-intervention-applications";
import {
  interventionComponentPublicKey,
  publicKeySupersedeOperation,
  readPublicKeyOperations,
  replayPublicKeyOperations,
  type PublicKeyOperation,
} from "../packages/pipeline/src/materialize/resolved-transit-public-keys";

const CAMPAIGN_ROOT =
  "data/operational-application-semantics/campaigns/plan-053";
const PORTFOLIO_PATH = `${CAMPAIGN_ROOT}/portfolio.json`;
const DECISION_ROOT =
  "data/operational-occurrence-review/accepted-current/decisions";
const PUBLIC_KEY_ROOT =
  "data/resolved-transit-public/public-key-operations/v1";
const EXPECTED_STARTING_APPLICATIONS = 343;
const EXPECTED_STARTING_EPISODES = 157;
const EXPECTED_STARTING_PUBLIC_KEY_OPERATIONS = 577;
const ACCEPTED_AT = "2026-07-31T16:00:00Z";

type Mode = "--write" | "--check";

type Portfolio = {
  application_count: number;
  episode_count: number;
  application_partition_sha256: string;
  incidence_partition_sha256: string;
  ordered_portfolio_sha256: string;
  manifests: Array<{
    batch_id: string;
    path: string;
    sha256: string;
  }>;
};

type FrozenApplication = ResolvedInterventionApplication & {
  evidence_bindings: OperationalOccurrenceEvidenceBinding[];
};

type AcceptedBatch = {
  manifest: Plan053BatchManifest;
  manifestPath: string;
  manifestSha256: string;
  primary: Plan053ApplicationSemanticProposal;
  independent: Plan053ApplicationSemanticProposal;
  adjudicator: Plan053ApplicationSemanticProposal | null;
  claims: Plan053ApplicationSemanticClaim[];
  disagreementCount: number;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}

function jsonl(values: readonly unknown[]): string {
  return values.length > 0
    ? `${values.map((value) => stableJson(value as JsonValue)).join("\n")}\n`
    : "";
}

function absolute(path: string): string {
  return join(repoRoot, path);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(absolute(path), "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  const text = readFileSync(absolute(path), "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as T) : [];
}

function artifactPin(path: string): { path: string; sha256: string } {
  return { path, sha256: sha256(readFileSync(absolute(path))) };
}

function writeOwned(path: string, content: string, mode: Mode): void {
  const target = absolute(path);
  if (mode === "--check") {
    if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      throw new Error(`Plan 053 integrated artifact drift: ${path}`);
    }
    return;
  }
  if (existsSync(target)) {
    if (readFileSync(target, "utf8") !== content) {
      throw new Error(`refusing to overwrite differing Plan 053 artifact: ${path}`);
    }
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function loadProposal(path: string): Plan053ApplicationSemanticProposal {
  if (!existsSync(absolute(path))) throw new Error(`missing Plan 053 proposal: ${path}`);
  return parsePlan053ApplicationSemanticProposal(readJson(path), path);
}

function loadAcceptedBatches(portfolio: Portfolio): AcceptedBatch[] {
  return portfolio.manifests.map((pin) => {
    const loaded = loadPlan053BatchManifest(pin.path);
    if (loaded.sha256 !== pin.sha256) {
      throw new Error(`Plan 053 frozen manifest hash drift: ${pin.path}`);
    }
    const reviewRoot = `${CAMPAIGN_ROOT}/reviews/${pin.batch_id}`;
    const primaryPath = existsSync(absolute(`${reviewRoot}/primary-final-02.json`))
      ? `${reviewRoot}/primary-final-02.json`
      : existsSync(absolute(`${reviewRoot}/primary-final.json`))
        ? `${reviewRoot}/primary-final.json`
      : `${reviewRoot}/primary.json`;
    const independentPath = existsSync(absolute(`${reviewRoot}/independent-final-02.json`))
      ? `${reviewRoot}/independent-final-02.json`
      : existsSync(absolute(`${reviewRoot}/independent-final.json`))
        ? `${reviewRoot}/independent-final.json`
      : `${reviewRoot}/independent.json`;
    const primary = loadProposal(primaryPath);
    const independent = loadProposal(independentPath);
    const adjudicatorPath = existsSync(absolute(`${reviewRoot}/adjudicator-final.json`))
      ? `${reviewRoot}/adjudicator-final.json`
      : `${reviewRoot}/adjudicator.json`;
    const adjudicator = existsSync(absolute(adjudicatorPath))
      ? loadProposal(adjudicatorPath)
      : null;
    const reconciled = reconcilePlan053Proposals({
      manifest: loaded.manifest,
      manifestPath: pin.path,
      manifestSha256: pin.sha256,
      primary,
      independent,
      ...(adjudicator ? { adjudicator } : {}),
    });
    return {
      manifest: loaded.manifest,
      manifestPath: pin.path,
      manifestSha256: pin.sha256,
      primary,
      independent,
      adjudicator,
      claims: reconciled.claims,
      disagreementCount: reconciled.disagreement_count,
    };
  });
}

function incidence(application: Pick<
  FrozenApplication,
  "occurrence_id" | "route_record_id" | "treatment_record_id" | "phase_record_id"
>): string {
  return [
    application.occurrence_id,
    application.route_record_id,
    application.treatment_record_id,
    application.phase_record_id ?? "",
  ].join("|");
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function semanticReview(input: {
  batch: AcceptedBatch;
  applicationId: string;
  predecessorDecisionId: string;
  predecessorFingerprint: string;
  claim: Plan053ApplicationSemanticClaim;
}): OperationalOccurrenceApplicationSemanticReview {
  const proposalRoot = `${CAMPAIGN_ROOT}/reviews/${input.batch.manifest.batch_id}`;
  const primaryPath = existsSync(absolute(`${proposalRoot}/primary-final-02.json`))
    ? `${proposalRoot}/primary-final-02.json`
    : existsSync(absolute(`${proposalRoot}/primary-final.json`))
      ? `${proposalRoot}/primary-final.json`
    : `${proposalRoot}/primary.json`;
  const independentPath = existsSync(absolute(`${proposalRoot}/independent-final-02.json`))
    ? `${proposalRoot}/independent-final-02.json`
    : existsSync(absolute(`${proposalRoot}/independent-final.json`))
      ? `${proposalRoot}/independent-final.json`
    : `${proposalRoot}/independent.json`;
  const adjudicatorPath = existsSync(absolute(`${proposalRoot}/adjudicator-final.json`))
    ? `${proposalRoot}/adjudicator-final.json`
    : `${proposalRoot}/adjudicator.json`;
  return operationalOccurrenceApplicationSemanticReviewReceipt({
    schema_version: 1,
    contract_id: "plan-053-application-semantic-review-v1",
    application_id: input.applicationId,
    batch_id: input.batch.manifest.batch_id,
    batch_manifest: {
      path: input.batch.manifestPath,
      sha256: input.batch.manifestSha256,
    },
    predecessor_decision_id: input.predecessorDecisionId,
    predecessor_membership_fingerprint: input.predecessorFingerprint,
    action_disposition: input.claim.action === "unknown"
      ? "accepted_unknown"
      : "resolved",
    action_reason_code: input.claim.action_reason_code,
    action_evidence_bindings: input.claim.action_evidence_bindings,
    extent_disposition: input.claim.extent.kind === "unknown"
      ? "accepted_unknown"
      : "resolved",
    extent_reason_code: input.claim.extent_reason_code,
    extent_evidence_bindings: input.claim.extent_evidence_bindings,
    reviewers: {
      primary: input.batch.primary.reviewer_id,
      independent: input.batch.independent.reviewer_id,
      adjudicator: input.batch.adjudicator?.reviewer_id ?? null,
    },
    proposal_receipts: {
      primary: artifactPin(primaryPath),
      independent: artifactPin(independentPath),
      adjudicator: input.batch.adjudicator
        ? artifactPin(adjudicatorPath)
        : null,
    },
    accepted_at: ACCEPTED_AT,
    rationale: input.claim.rationale,
    provider_usage: {
      provider_requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      committed_cost_usd: 0,
      actual_cost_usd: 0,
      provider: null,
      model: null,
      profile: null,
    },
  });
}

function predecessorHeads(): Map<string, OperationalOccurrenceCurrentReviewDecision> {
  const historical = loadOperationalOccurrenceAcceptedDecisionsV2(
    absolute("data/operational-occurrence-review/accepted-v2/decisions"),
  );
  const establishments = loadOperationalOccurrenceAcceptedDecisionsV3(
    absolute(DECISION_ROOT),
  ).filter((decision) => decision.operation === "establish_current_resolution");
  return new Map<OperationalOccurrenceCurrentReviewDecision["decision_id"], OperationalOccurrenceCurrentReviewDecision>(
    [...historical, ...establishments].map((decision) => [decision.decision_id, decision]),
  );
}

function buildDecisions(input: {
  frozen: FrozenApplication[];
  batches: AcceptedBatch[];
  mode: Mode;
}): {
  decisions: OperationalOccurrenceAcceptedDecisionV3[];
  reviews: OperationalOccurrenceApplicationSemanticReview[];
} {
  const claimOwners = new Map<string, { claim: Plan053ApplicationSemanticClaim; batch: AcceptedBatch }>();
  for (const batch of input.batches) {
    for (const claim of batch.claims) {
      if (claimOwners.has(claim.application_id)) {
        throw new Error(`duplicate accepted application owner: ${claim.application_id}`);
      }
      claimOwners.set(claim.application_id, { claim, batch });
    }
  }
  if (
    claimOwners.size !== EXPECTED_STARTING_APPLICATIONS ||
    input.frozen.length !== EXPECTED_STARTING_APPLICATIONS
  ) {
    throw new Error(
      `Plan 053 denominator drift: claims=${claimOwners.size}, frozen=${input.frozen.length}`,
    );
  }
  const heads = predecessorHeads();
  const frozenByPredecessor = new Map<string, FrozenApplication[]>();
  const cohort = readJsonl<Array<Record<string, unknown>>[number]>(
    `${CAMPAIGN_ROOT}/frozen-cohort/cohort.jsonl`,
  );
  const predecessorByApplication = new Map(cohort.map((row) => [
    String(row.application_id),
    row.predecessor as { decision_id: string; membership_fingerprint: string },
  ]));
  for (const application of input.frozen) {
    const predecessor = predecessorByApplication.get(application.application_id);
    if (!predecessor) throw new Error(`missing frozen predecessor: ${application.application_id}`);
    const rows = frozenByPredecessor.get(predecessor.decision_id) ?? [];
    rows.push(application);
    frozenByPredecessor.set(predecessor.decision_id, rows);
  }
  if (frozenByPredecessor.size !== EXPECTED_STARTING_EPISODES) {
    throw new Error(`Plan 053 predecessor episode drift: ${frozenByPredecessor.size}`);
  }

  const acceptedReviews: OperationalOccurrenceApplicationSemanticReview[] = [];
  const decisions: OperationalOccurrenceAcceptedDecisionV3[] = [];
  for (const [predecessorId, applications] of [...frozenByPredecessor.entries()]
    .sort(([left], [right]) => left.localeCompare(right))) {
    const predecessor = heads.get(predecessorId);
    if (!predecessor) throw new Error(`missing exact predecessor head: ${predecessorId}`);
    const expectedFingerprint = predecessor.membership_fingerprint;
    const reviewedApplications: OperationalOccurrenceCurrentReviewApplication[] = applications
      .map((application) => {
        const owner = claimOwners.get(application.application_id);
        if (!owner) throw new Error(`missing accepted claim: ${application.application_id}`);
        const frozenPredecessor = predecessorByApplication.get(application.application_id)!;
        if (
          frozenPredecessor.decision_id !== predecessorId ||
          frozenPredecessor.membership_fingerprint !== expectedFingerprint
        ) {
          throw new Error(`stale frozen predecessor: ${application.application_id}`);
        }
        const review = semanticReview({
          batch: owner.batch,
          applicationId: application.application_id,
          predecessorDecisionId: predecessorId,
          predecessorFingerprint: expectedFingerprint,
          claim: owner.claim,
        });
        acceptedReviews.push(review);
        writeOwned(review.receipt_path, json(review), input.mode);
        return {
          application_id: application.application_id,
          route_record_id: application.route_record_id,
          gtfs_route_id: application.gtfs_route_id,
          treatment_record_id: application.treatment_record_id,
          phase_record_id: application.phase_record_id,
          action: owner.claim.action,
          physical_scope_record_ids: owner.claim.extent.record_ids,
          extent: owner.claim.extent,
          evidence_bindings: application.evidence_bindings,
          semantic_review: review,
        };
      })
      .sort((left, right) => incidence({
        ...left,
        occurrence_id: predecessor.occurrence_id,
      } as FrozenApplication).localeCompare(incidence({
        ...right,
        occurrence_id: predecessor.occurrence_id,
      } as FrozenApplication)));
    const receiptHash = sha256(reviewedApplications.map((application) =>
      application.semantic_review!.receipt_id
    ).sort().join("\n"));
    const decisionId = `plan-053-application-refinement-${receiptHash.slice(0, 24)}`;
    const withoutFingerprint = {
      ...predecessor,
      schema_version: 3 as const,
      decision_id: decisionId,
      operation: "supersede_current_resolution" as const,
      supersedes_decision_id: predecessor.decision_id,
      supersedes_membership_fingerprint: predecessor.membership_fingerprint,
      review_scope: "application_resolution_refinement" as const,
      applications: reviewedApplications,
      physical_scope_record_ids: sortedUnique(reviewedApplications.flatMap((row) =>
        row.extent.record_ids
      )),
      reviewers: sortedUnique([
        ...predecessor.reviewers,
        "plan-053-single-writer-integrator",
      ]),
      accepted_at: ACCEPTED_AT,
      rationale:
        "Plan 053 append-only exact application action/extent review; durable incidence and application identity retained. Placement, lifecycle, and current state were not adjudicated.",
    };
    const { membership_fingerprint: _priorFingerprint, ...projection } = withoutFingerprint;
    const parsed = parseOperationalOccurrenceAcceptedDecisionV3({
      ...projection,
      membership_fingerprint:
        operationalOccurrenceCurrentReviewMembershipFingerprint(projection),
    }, decisionId);
    decisions.push(parsed);
  }
  return {
    decisions: decisions.sort((left, right) => left.decision_id.localeCompare(right.decision_id)),
    reviews: acceptedReviews.sort((left, right) =>
      left.application_id.localeCompare(right.application_id)
    ),
  };
}

function writeDecisions(
  decisions: readonly OperationalOccurrenceAcceptedDecisionV3[],
  mode: Mode,
): void {
  for (const decision of decisions) {
    writeOwned(`${DECISION_ROOT}/${decision.decision_id}.json`, json(decision), mode);
  }
  const historical = loadOperationalOccurrenceAcceptedDecisionsV2(
    absolute("data/operational-occurrence-review/accepted-v2/decisions"),
  );
  const establishments = loadOperationalOccurrenceAcceptedDecisionsV3(
    absolute(DECISION_ROOT),
  ).filter((decision) => decision.operation === "establish_current_resolution");
  const replay = replayOperationalOccurrenceCurrentReviews(
    historical,
    [...establishments, ...decisions],
  );
  if (replay.length !== EXPECTED_STARTING_EPISODES) {
    throw new Error(`Plan 053 current head replay drift: ${replay.length}`);
  }
}

function integratePublicKeys(input: {
  frozen: FrozenApplication[];
  reviews: OperationalOccurrenceApplicationSemanticReview[];
  mode: Mode;
}): { receipt: Record<string, unknown>; operations: PublicKeyOperation[] } {
  const existing = readPublicKeyOperations(repoRoot);
  const baseline = existing.filter((operation) => operation.operation === "establish_public_key");
  if (baseline.length !== EXPECTED_STARTING_PUBLIC_KEY_OPERATIONS) {
    throw new Error(`Plan 053 public-key baseline drift: ${baseline.length}`);
  }
  const baselineRegistry = replayPublicKeyOperations(baseline);
  const registryBySubject = new Map(baselineRegistry.map((entry) => [
    `${entry.key_kind}|${entry.subject_id}`,
    entry,
  ]));
  const reviewByApplication = new Map(input.reviews.map((review) => [
    review.application_id,
    review,
  ]));
  const supersessions = input.frozen.map((application) => {
    const component = registryBySubject.get(
      `intervention_component|${application.application_id}`,
    );
    const route = registryBySubject.get(`route|${application.route_record_id}`);
    const family = registryBySubject.get(
      `treatment_family|${application.treatment_family}`,
    );
    const review = reviewByApplication.get(application.application_id);
    if (!component || !route || !family || !review) {
      throw new Error(`missing stable public-key basis: ${application.application_id}`);
    }
    if (component.owner_intervention_id !== application.occurrence_id) {
      throw new Error(`component public-key owner drift: ${application.application_id}`);
    }
    return publicKeySupersedeOperation({
      key_kind: "intervention_component",
      subject_id: application.application_id,
      prior_public_key: component.public_key,
      public_key: interventionComponentPublicKey({
        route_key: route.public_key,
        treatment_family_key: family.public_key,
        application_id: application.application_id,
      }),
      decision_id: review.receipt_id,
      issued_at: ACCEPTED_AT,
      rationale:
        "Plan 053 replaces a mutable action/extent-derived presentation key with a durable incidence-bound key while preserving the prior key as an alias.",
    });
  }).sort((left, right) => left.subject_id.localeCompare(right.subject_id));
  const expected = [...baseline, ...supersessions];
  const replay = replayPublicKeyOperations(expected);
  const live = replay.filter((entry) => entry.registry_state === "live");
  const components = live.filter((entry) => entry.key_kind === "intervention_component");
  if (
    live.length !== EXPECTED_STARTING_PUBLIC_KEY_OPERATIONS ||
    components.length !== EXPECTED_STARTING_APPLICATIONS ||
    components.some((entry) => entry.public_key.includes("unknown")) ||
    components.some((entry) => entry.public_key_aliases.length === 0)
  ) {
    throw new Error("Plan 053 public-key continuity arithmetic failed");
  }
  const operationsContent = jsonl(expected);
  const operationsPath = `${PUBLIC_KEY_ROOT}/operations.jsonl`;
  if (input.mode === "--write") {
    const currentContent = readFileSync(absolute(operationsPath), "utf8");
    if (currentContent !== jsonl(baseline) && currentContent !== operationsContent) {
      throw new Error("refusing to rewrite a non-baseline public-key operation journal");
    }
    if (currentContent !== operationsContent) writeFileSync(absolute(operationsPath), operationsContent);
  } else if (readFileSync(absolute(operationsPath), "utf8") !== operationsContent) {
    throw new Error("Plan 053 public-key operation journal drift");
  }
  const withoutReceipt = {
    schema_version: 1,
    contract_id: "plan-053-immutable-component-public-key-review-v1",
    accepted_at: ACCEPTED_AT,
    prior_operation_count: baseline.length,
    appended_operation_count: supersessions.length,
    current_operation_count: expected.length,
    live_subject_count: live.length,
    live_component_count: components.length,
    legacy_alias_count: components.reduce(
      (total, entry) => total + entry.public_key_aliases.length,
      0,
    ),
    live_unknown_key_count: components.filter((entry) =>
      entry.public_key.includes("unknown")
    ).length,
    before_head: sha256(baseline.map((row) => stableJson(row as unknown as JsonValue)).join("\n")),
    after_head: sha256(expected.map((row) => stableJson(row as unknown as JsonValue)).join("\n")),
    operation_ids_sha256: sha256(supersessions.map((row) => row.operation_id).join("\n")),
    reviewer: "plan-053-single-writer-integrator",
    provider_usage_usd: 0,
  };
  const receipt = {
    ...withoutReceipt,
    receipt_id: `plan-053-public-key-review:${sha256(stableJson(withoutReceipt as unknown as JsonValue))}`,
  };
  const receiptPath = `${PUBLIC_KEY_ROOT}/review-receipts/${receipt.receipt_id.split(":")[1]}.json`;
  writeOwned(receiptPath, json(receipt), input.mode);
  const manifest = {
    schema_version: 1,
    contract_id: "resolved-transit-public-key-registry-v1",
    head: withoutReceipt.after_head,
    operation_count: expected.length,
    receipt_id: receipt.receipt_id,
    generator_commit: "f29cc5e3ee27dd4411405693e3474af4fb2c217e",
  };
  if (input.mode === "--write") {
    writeFileSync(absolute(`${PUBLIC_KEY_ROOT}/manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  } else if (
    readFileSync(absolute(`${PUBLIC_KEY_ROOT}/manifest.json`), "utf8") !==
      `${JSON.stringify(manifest, null, 2)}\n`
  ) {
    throw new Error("Plan 053 public-key manifest drift");
  }
  return { receipt: { ...receipt, path: receiptPath }, operations: expected };
}

const mode = process.argv.includes("--write")
  ? "--write"
  : process.argv.includes("--check")
    ? "--check"
    : null;
if (!mode || (process.argv.includes("--write") && process.argv.includes("--check"))) {
  throw new Error("Plan 053 integration requires exactly one of --write or --check");
}
const portfolio = readJson<Portfolio>(PORTFOLIO_PATH);
if (
  portfolio.application_count !== EXPECTED_STARTING_APPLICATIONS ||
  portfolio.episode_count !== EXPECTED_STARTING_EPISODES ||
  portfolio.manifests.length !== 9
) {
  throw new Error("Plan 053 frozen portfolio denominator drift");
}
const frozen = readJsonl<FrozenApplication>(
  `${CAMPAIGN_ROOT}/frozen-cohort/applications.jsonl`,
).sort((left, right) => left.application_id.localeCompare(right.application_id));
if (
  frozen.length !== EXPECTED_STARTING_APPLICATIONS ||
  new Set(frozen.map((row) => row.application_id)).size !== frozen.length ||
  new Set(frozen.map(incidence)).size !== frozen.length
) {
  throw new Error("Plan 053 frozen application/incidence partition drift");
}
const batches = loadAcceptedBatches(portfolio);
const built = buildDecisions({ frozen, batches, mode });
writeDecisions(built.decisions, mode);
const publicKeys = integratePublicKeys({ frozen, reviews: built.reviews, mode });
const actions = Object.fromEntries([
  "add", "modify", "remove", "suspend", "resume", "retain", "unknown",
].map((action) => [action, batches.flatMap((batch) => batch.claims)
  .filter((claim) => claim.action === action).length]));
const extents = Object.fromEntries([
  "route_wide", "bounded_segment", "stop_set", "service_pattern", "unknown",
].map((extent) => [extent, batches.flatMap((batch) => batch.claims)
  .filter((claim) => claim.extent.kind === extent).length]));
const unknownReasons = Object.fromEntries([
  ...new Set(batches.flatMap((batch) => batch.claims).flatMap((claim) => [
    ...(claim.action === "unknown" ? [claim.action_reason_code] : []),
    ...(claim.extent.kind === "unknown" ? [claim.extent_reason_code] : []),
  ])),
].sort().map((reason) => [reason, batches.flatMap((batch) => batch.claims)
  .filter((claim) =>
    (claim.action === "unknown" && claim.action_reason_code === reason) ||
    (claim.extent.kind === "unknown" && claim.extent_reason_code === reason)
  ).length]));
const decisionsPortfolio = built.decisions.map((decision) => ({
  decision_id: decision.decision_id,
  occurrence_id: decision.occurrence_id,
  predecessor_decision_id: decision.supersedes_decision_id,
  predecessor_membership_fingerprint: decision.supersedes_membership_fingerprint,
  membership_fingerprint: decision.membership_fingerprint,
  path: `${DECISION_ROOT}/${decision.decision_id}.json`,
  sha256: sha256(json(decision)),
}));
const integrationWithoutReceipt = {
  schema_version: 1,
  contract_id: "plan-053-application-semantic-integration-v1",
  accepted_at: ACCEPTED_AT,
  starting_application_count: portfolio.application_count,
  current_application_count: built.reviews.length,
  starting_episode_count: portfolio.episode_count,
  current_episode_head_count: built.decisions.length,
  application_partition_sha256: portfolio.application_partition_sha256,
  incidence_partition_sha256: portfolio.incidence_partition_sha256,
  ordered_portfolio_sha256: portfolio.ordered_portfolio_sha256,
  accepted_review_receipt_partition_sha256: sha256(
    built.reviews.map((review) => review.receipt_id).join("\n"),
  ),
  current_decision_partition_sha256: sha256(
    decisionsPortfolio.map((row) => row.membership_fingerprint).sort().join("\n"),
  ),
  actions,
  extents,
  unknown_reasons: unknownReasons,
  reviewed_application_count: built.reviews.length,
  accepted_unknown_action_count: Number(actions.unknown),
  accepted_unknown_extent_count: Number(extents.unknown),
  disagreement_count: batches.reduce(
    (total, batch) => total + batch.disagreementCount,
    0,
  ),
  adjudicated_batch_count: batches.filter((batch) => batch.adjudicator).length,
  decisions: decisionsPortfolio,
  public_key_review: publicKeys.receipt,
  provider_usage: {
    provider_requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    committed_cost_usd: 0,
    actual_cost_usd: 0,
  },
  placement_truth_reviewed: false,
};
const integration = {
  ...integrationWithoutReceipt,
  receipt_id: `plan-053-integration:${sha256(stableJson(integrationWithoutReceipt as unknown as JsonValue))}`,
};
writeOwned(`${CAMPAIGN_ROOT}/accepted/integration-receipt.json`, json(integration), mode);
console.log(JSON.stringify({
  mode,
  applications: built.reviews.length,
  episodes: built.decisions.length,
  actions,
  extents,
  unknown_reasons: unknownReasons,
  disagreements: integrationWithoutReceipt.disagreement_count,
  public_key_operations: publicKeys.operations.length,
  public_key_head: publicKeys.receipt.after_head,
  receipt_id: integration.receipt_id,
  provider_usage_usd: 0,
}));
