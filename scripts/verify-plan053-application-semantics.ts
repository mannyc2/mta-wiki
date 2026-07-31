import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  loadOperationalOccurrenceCurrentReviewDecisions,
} from "../packages/pipeline/src/materialize/operational-occurrence-resolution";
import type { ResolvedInterventionApplication } from "../packages/pipeline/src/materialize/resolved-intervention-applications";
import {
  readPublicKeyOperations,
  replayPublicKeyOperations,
} from "../packages/pipeline/src/materialize/resolved-transit-public-keys";

const CAMPAIGN = "data/operational-application-semantics/campaigns/plan-053";
const COMPLETION = `${CAMPAIGN}/accepted/completion-receipt.json`;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function absolute(path: string): string {
  return join(repoRoot, path);
}

function bytes(path: string): Uint8Array {
  return readFileSync(absolute(path));
}

function artifact(path: string): { path: string; bytes: number; sha256: string } {
  const value = bytes(path);
  return { path, bytes: value.length, sha256: sha256(value) };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(absolute(path), "utf8")) as T;
}

function readJsonl<T>(path: string): T[] {
  const text = readFileSync(absolute(path), "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line) as T) : [];
}

function incidence(application: ResolvedInterventionApplication): string {
  return [
    application.occurrence_id,
    application.route_record_id,
    application.treatment_record_id,
    application.phase_record_id ?? "",
  ].join("|");
}

function histogram(values: readonly string[], universe: readonly string[]): Record<string, number> {
  return Object.fromEntries(universe.map((value) => [
    value,
    values.filter((entry) => entry === value).length,
  ]));
}

const mode = process.argv[2];
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error("usage: bun scripts/verify-plan053-application-semantics.ts --write|--check");
}

const frozenApplicationsPath = `${CAMPAIGN}/frozen-cohort/applications.jsonl`;
const currentApplicationsPath =
  "data/resolved-transit/operator/v1/interventions/applications.jsonl";
const frozenCandidatePath = `${CAMPAIGN}/frozen-cohort/candidate_ledger.jsonl`;
const currentCandidatePath =
  "data/resolved-transit/operator/v1/placements/candidate_ledger.jsonl";
const frozen = readJsonl<ResolvedInterventionApplication>(frozenApplicationsPath)
  .sort((left, right) => left.application_id.localeCompare(right.application_id));
const current = readJsonl<ResolvedInterventionApplication>(currentApplicationsPath)
  .sort((left, right) => left.application_id.localeCompare(right.application_id));
const frozenIds = frozen.map((row) => row.application_id);
const currentIds = current.map((row) => row.application_id);
const frozenIncidence = frozen.map(incidence).sort();
const currentIncidence = current.map(incidence).sort();
if (
  frozen.length !== 343 || current.length !== 343 ||
  frozenIds.join("\n") !== currentIds.join("\n") ||
  frozenIncidence.join("\n") !== currentIncidence.join("\n")
) {
  throw new Error("Plan 053 durable application/incidence continuity failed");
}

const heads = loadOperationalOccurrenceCurrentReviewDecisions(repoRoot);
const semanticReviews = heads.flatMap((head) =>
  head.schema_version === 3
    ? head.applications.flatMap((application) =>
        application.semantic_review ? [application.semantic_review] : []
      )
    : []
);
if (
  heads.length !== 157 || semanticReviews.length !== 343 ||
  new Set(semanticReviews.map((review) => review.application_id)).size !== 343 ||
  heads.some((head) => head.schema_version !== 3 || head.operation !== "supersede_current_resolution")
) {
  throw new Error("Plan 053 current semantic head partition failed");
}
const currentById = new Map(current.map((row) => [row.application_id, row]));
for (const review of semanticReviews) {
  const application = currentById.get(review.application_id);
  if (!application) throw new Error(`missing reviewed application: ${review.application_id}`);
  if (
    (application.action === "unknown") !== (review.action_disposition === "accepted_unknown") ||
    (application.extent.kind === "unknown") !== (review.extent_disposition === "accepted_unknown") ||
    review.provider_usage.actual_cost_usd !== 0 ||
    review.provider_usage.provider_requests !== 0
  ) {
    throw new Error(`unreviewed or paid Plan 053 semantic head: ${review.application_id}`);
  }
}

const operations = readPublicKeyOperations(repoRoot);
const publicRegistry = replayPublicKeyOperations(operations);
const live = publicRegistry.filter((row) => row.registry_state === "live");
const components = live.filter((row) => row.key_kind === "intervention_component");
if (
  operations.length !== 920 || live.length !== 577 || components.length !== 343 ||
  components.some((row) => row.public_key.includes("unknown")) ||
  components.some((row) => row.public_key_aliases.length === 0) ||
  components.some((row) => !currentById.has(row.subject_id))
) {
  throw new Error("Plan 053 stable public-key continuity failed");
}

type PlacementCandidate = { candidate_id: string; disposition: string };
const beforeCandidates = readJsonl<PlacementCandidate>(frozenCandidatePath)
  .sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
const afterCandidates = readJsonl<PlacementCandidate>(currentCandidatePath)
  .sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
if (
  beforeCandidates.length !== 1773 || afterCandidates.length !== 1773 ||
  beforeCandidates.map((row) => row.candidate_id).join("\n") !==
    afterCandidates.map((row) => row.candidate_id).join("\n") ||
  beforeCandidates.some((row) => row.disposition !== "pending_review") ||
  afterCandidates.some((row) => row.disposition !== "pending_review")
) {
  throw new Error("Plan 053 placement-candidate boundary changed");
}
const placementSummary = readJson<{
  placement_registry_count: number;
  transition_count: number;
  candidate_ledger_rows: number;
}>("data/resolved-transit/operator/v1/placements/summary.json");
const lifecycleSummary = readJson<{
  assertion_count: number;
  confirmed_active_count: number;
}>("data/resolved-transit/operator/v1/lifecycle/summary.json");
const displaySummary = readJson<{
  episode_count: number;
  component_count: number;
  route_count: number;
  placement_count: number;
}>("data/resolved-transit/operator/v1/public-display/summary.json");
if (
  placementSummary.placement_registry_count !== 0 ||
  placementSummary.transition_count !== 0 ||
  placementSummary.candidate_ledger_rows !== 1773 ||
  lifecycleSummary.assertion_count !== 0 ||
  lifecycleSummary.confirmed_active_count !== 0 ||
  displaySummary.episode_count !== 157 ||
  displaySummary.component_count !== 343 ||
  displaySummary.route_count !== 170 ||
  displaySummary.placement_count !== 0
) {
  throw new Error("Plan 053 derived display/placement arithmetic failed");
}

const actions = histogram(current.map((row) => row.action), [
  "add", "modify", "remove", "suspend", "resume", "retain", "unknown",
]);
const extents = histogram(current.map((row) => row.extent.kind), [
  "route_wide", "bounded_segment", "stop_set", "service_pattern", "unknown",
]);
const integration = readJson<{
  receipt_id: string;
  disagreement_count: number;
  accepted_review_receipt_partition_sha256: string;
}>(`${CAMPAIGN}/accepted/integration-receipt.json`);
const withoutReceipt = {
  schema_version: 1,
  contract_id: "plan-053-application-semantics-completion-v1",
  verified_at: "2026-07-31T18:00:00Z",
  frozen_application_count: frozen.length,
  current_application_count: current.length,
  current_episode_count: heads.length,
  stable_application_id_partition_sha256: sha256(currentIds.join("\n")),
  stable_incidence_partition_sha256: sha256(currentIncidence.join("\n")),
  current_application_projection_sha256: sha256(
    current.map((row) => stableJson(row as unknown as JsonValue)).join("\n"),
  ),
  current_semantic_receipt_partition_sha256:
    integration.accepted_review_receipt_partition_sha256,
  action_arithmetic: actions,
  extent_arithmetic: extents,
  accepted_unknown_action_count: actions.unknown,
  accepted_unknown_extent_count: extents.unknown,
  disagreement_count: integration.disagreement_count,
  public_key_arithmetic: {
    operation_count: operations.length,
    live_subject_count: live.length,
    component_count: components.length,
    component_alias_count: components.reduce(
      (total, row) => total + row.public_key_aliases.length,
      0,
    ),
    live_unknown_key_count: 0,
  },
  display_arithmetic: displaySummary,
  placement_before: {
    candidate_count: beforeCandidates.length,
    pending_count: beforeCandidates.length,
    placement_count: 0,
    transition_count: 0,
    candidate_id_partition_sha256: sha256(
      beforeCandidates.map((row) => row.candidate_id).join("\n"),
    ),
  },
  placement_after: {
    candidate_count: afterCandidates.length,
    pending_count: afterCandidates.length,
    placement_count: placementSummary.placement_registry_count,
    transition_count: placementSummary.transition_count,
    lifecycle_assertion_count: lifecycleSummary.assertion_count,
    confirmed_active_count: lifecycleSummary.confirmed_active_count,
    candidate_id_partition_sha256: sha256(
      afterCandidates.map((row) => row.candidate_id).join("\n"),
    ),
  },
  artifacts: [
    artifact(`${CAMPAIGN}/portfolio.json`),
    artifact(`${CAMPAIGN}/accepted/integration-receipt.json`),
    artifact(currentApplicationsPath),
    artifact(currentCandidatePath),
    artifact("data/resolved-transit/operator/v1/public-display/public_keys.jsonl"),
    artifact("data/resolved-transit/operator/v1/public-display/summary.json"),
    artifact("data/resolved-transit-public/public-key-operations/v1/operations.jsonl"),
  ],
  integration_receipt_id: integration.receipt_id,
  provider_usage: {
    provider_requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    committed_cost_usd: 0,
    actual_cost_usd: 0,
  },
  placement_truth_reviewed: false,
  plan_054_started: false,
};
const receipt = {
  ...withoutReceipt,
  receipt_id: `plan-053-completion:${sha256(stableJson(withoutReceipt as unknown as JsonValue))}`,
};
const content = `${stableJson(receipt as unknown as JsonValue)}\n`;
if (mode === "--write") {
  if (existsSync(absolute(COMPLETION)) && readFileSync(absolute(COMPLETION), "utf8") !== content) {
    throw new Error("refusing to overwrite differing Plan 053 completion receipt");
  }
  mkdirSync(dirname(absolute(COMPLETION)), { recursive: true });
  writeFileSync(absolute(COMPLETION), content);
} else if (!existsSync(absolute(COMPLETION)) || readFileSync(absolute(COMPLETION), "utf8") !== content) {
  throw new Error("Plan 053 completion receipt drift");
}
console.log(JSON.stringify({
  mode,
  receipt_id: receipt.receipt_id,
  applications: current.length,
  episodes: heads.length,
  actions,
  extents,
  public_keys: `${live.length}/${live.length}`,
  placement_candidates: afterCandidates.length,
  provider_usage_usd: 0,
}));
