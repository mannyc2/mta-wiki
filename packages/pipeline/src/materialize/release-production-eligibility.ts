import { readFileSync } from "node:fs";
import { join } from "node:path";

export const productionReasonCodes = [
  "production_profile_required",
  "publish_check_required",
  "episode_frontier_incomplete",
  "application_semantics_incomplete",
  "placement_frontier_incomplete",
  "lifecycle_coverage_incomplete",
  "strict_public_contract_incomplete",
  "public_display_incomplete",
  "tracker_conformance_incomplete",
  "clean_generator_required",
  "semantic_input_receipts_incomplete",
  "independent_recut_not_verified",
] as const;
export type ProductionIneligibilityReason = typeof productionReasonCodes[number];

export type ProductionGateEvidence = {
  episode_frontier_complete: boolean;
  application_semantics_complete: boolean;
  placement_frontier_complete: boolean;
  lifecycle_coverage_complete: boolean;
  strict_public_contract_complete: boolean;
  public_display_complete: boolean;
  tracker_conformance_complete: boolean;
  independent_recut_verified: boolean;
};

function json(root: string, path: string): Record<string, any> {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as Record<string, any>;
}

function exactCountSum(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const counts = Object.values(value as Record<string, unknown>);
  return counts.every((count) => Number.isInteger(count) && (count as number) >= 0)
    ? (counts as number[]).reduce((sum, count) => sum + count, 0)
    : null;
}

export function isEpisodeFrontierComplete(
  frontier: Record<string, any>,
  interventions: Record<string, any>,
): boolean {
  const candidateDispositions = frontier.counts_by_candidate_disposition;
  const observationDispositions = frontier.counts_by_observation_disposition;
  return frontier.schema_version === 1 &&
    frontier.completeness_profile === "complete" &&
    frontier.pending_count === 0 &&
    frontier.invalid_count === 0 &&
    candidateDispositions?.pending_review === 0 &&
    candidateDispositions?.invalid === 0 &&
    observationDispositions?.pending_segmentation === 0 &&
    observationDispositions?.invalid_record === 0 &&
    frontier.unresolved_active_identity_ids === 0 &&
    frontier.pending_review_distinct_unresolved_identity_ids === 0 &&
    frontier.zero_unexplained_loss === true &&
    frontier.cohort_observations === 1366 &&
    frontier.observation_ledger_rows === frontier.cohort_observations &&
    frontier.candidate_bearing_observations + frontier.non_candidate_observations ===
      frontier.cohort_observations &&
    exactCountSum(observationDispositions) === frontier.cohort_observations &&
    frontier.candidate_ledger_rows === 766 &&
    frontier.adapter_candidate_count === frontier.candidate_ledger_rows &&
    exactCountSum(candidateDispositions) === frontier.candidate_ledger_rows &&
    frontier.publishable_reviewed_occurrence_ids === 157 &&
    frontier.published_distinct_occurrence_ids === frontier.publishable_reviewed_occurrence_ids &&
    candidateDispositions?.published === frontier.publishable_reviewed_occurrence_ids &&
    interventions.episode_count === frontier.publishable_reviewed_occurrence_ids &&
    interventions.published_candidate_count === interventions.episode_count;
}

export function collectProductionGateEvidence(
  root: string,
  asOfDate: string,
  options: { strictPublicContractComplete: boolean; independentRecutVerified: boolean },
): ProductionGateEvidence {
  const episodeFrontier = json(root, "data/quality/operational-episode-frontier/v1/summary.json");
  const interventions = json(root, "data/resolved-transit/operator/v1/interventions/summary.json");
  const applicationReceipt = json(root, "data/operational-application-semantics/campaigns/plan-053/accepted/integration-receipt.json");
  const applicationCompletion = json(root, "data/operational-application-semantics/campaigns/plan-053/accepted/completion-receipt.json");
  const placementCompletion = json(root, "data/intervention-placements/campaigns/plan-054/accepted/completion-receipt.json");
  const lifecycleCompletion = json(root, "data/intervention-lifecycle/campaigns/plan-055/accepted/completion-receipt.json");
  const placements = json(root, "data/resolved-transit/operator/v1/placements/summary.json");
  const lifecycle = json(root, "data/resolved-transit/operator/v1/lifecycle/summary.json");
  const display = json(root, "data/resolved-transit/operator/v1/public-display/summary.json");
  const tracker = json(root, "data/resolved-transit/operator/v1/tracker-conformance/summary.json");
  return {
    episode_frontier_complete:
      isEpisodeFrontierComplete(episodeFrontier, interventions) &&
      interventions.pending_identity_candidate_count === 0 &&
      interventions.application_count === 343 &&
      interventions.zero_unexplained_identity_loss === true,
    application_semantics_complete:
      applicationReceipt.current_application_count === interventions.application_count &&
      applicationReceipt.current_episode_head_count === interventions.episode_count &&
      applicationReceipt.reviewed_application_count === applicationReceipt.current_application_count &&
      applicationCompletion.receipt_id === "plan-053-completion:ad0a80ce5eb239140639d62a1f391831674a404c021e6605208f438363974a03" &&
      applicationCompletion.accepted_unknown_action_count === 5 &&
      applicationCompletion.accepted_unknown_extent_count === 138 &&
      applicationReceipt.provider_usage?.provider_requests === 0,
    placement_frontier_complete:
      placements.counts_by_candidate_disposition?.pending_review === 0 &&
      placements.counts_by_candidate_disposition?.invalid === 0 &&
      placements.placement_registry_count === placements.transition_count &&
      placements.candidate_ledger_rows === 1773 &&
      placements.placement_registry_count === 104 &&
      placements.transition_reconciliation_count === 239 &&
      placementCompletion.receipt_id === "plan-054-completion:5ceaccde359a9980eded2c5eca86cecd660af2137f855ebe35725d8b909323ec" &&
      placements.zero_unexplained_loss === true,
    lifecycle_coverage_complete:
      lifecycle.as_of_date === asOfDate &&
      lifecycle.resolved_placement_count === placements.placement_registry_count &&
      lifecycle.state_count === lifecycle.resolved_placement_count &&
      lifecycle.placements_without_assertions === 0 &&
      lifecycle.pending_assertion_count === 0 &&
      lifecycle.conflicted_assertion_count === 0 &&
      lifecycle.assertion_count === 104 &&
      lifecycle.accepted_assertion_count === 101 &&
      lifecycle.rejected_assertion_count === 3 &&
      lifecycleCompletion.receipt_id === "plan-055-completion:347736366cc08cb774290c4b96df5c2c8ae63a38ff176a7873177d6c4a051de1" &&
      lifecycle.zero_unexplained_loss === true,
    strict_public_contract_complete: options.strictPublicContractComplete,
    public_display_complete:
      display.episode_count === interventions.episode_count &&
      display.component_count === interventions.application_count &&
      display.placement_count === placements.placement_registry_count &&
      display.reconciliation?.requires_review === 0 &&
      display.reconciliation?.not_public === 0,
    tracker_conformance_complete:
      tracker.black_box_surface_parity?.status === "pass" &&
      tracker.black_box_surface_parity?.identity_or_content_mismatch_count === 0 &&
      tracker.accepted_result?.producer_episodes === interventions.episode_count &&
      tracker.accepted_result?.exact_components === interventions.application_count &&
      tracker.tracker_counts?.episodes === 204 &&
      tracker.tracker_counts?.routes === 179 &&
      tracker.tracker_counts?.episode_route_memberships === 243 &&
      tracker.accepted_result?.mapped_producer_truth === 131 &&
      tracker.accepted_result?.tracker_enrichment_only === 65 &&
      tracker.accepted_result?.justified_exclusions === 8 &&
      tracker.accepted_result?.producer_additions === 26 &&
      tracker.acceptance_receipt_id === "plan-056-owner-approval:2026-08-01" &&
      tracker.provider_usage?.provider_requests === 0,
    independent_recut_verified: options.independentRecutVerified,
  };
}

export function productionIneligibilityReasons(input: {
  profile: string;
  publishCheck: boolean;
  trackedDirty: boolean;
  semanticInputsReceipted: boolean;
  evidence: ProductionGateEvidence;
}): ProductionIneligibilityReason[] {
  const reasons: ProductionIneligibilityReason[] = [];
  if (input.profile !== "resolved-pack-v1-production") reasons.push("production_profile_required");
  if (!input.publishCheck) reasons.push("publish_check_required");
  if (!input.evidence.episode_frontier_complete) reasons.push("episode_frontier_incomplete");
  if (!input.evidence.application_semantics_complete) reasons.push("application_semantics_incomplete");
  if (!input.evidence.placement_frontier_complete) reasons.push("placement_frontier_incomplete");
  if (!input.evidence.lifecycle_coverage_complete) reasons.push("lifecycle_coverage_incomplete");
  if (!input.evidence.strict_public_contract_complete) reasons.push("strict_public_contract_incomplete");
  if (!input.evidence.public_display_complete) reasons.push("public_display_incomplete");
  if (!input.evidence.tracker_conformance_complete) reasons.push("tracker_conformance_incomplete");
  if (input.trackedDirty) reasons.push("clean_generator_required");
  if (!input.semanticInputsReceipted) reasons.push("semantic_input_receipts_incomplete");
  if (!input.evidence.independent_recut_verified) reasons.push("independent_recut_not_verified");
  return reasons;
}
