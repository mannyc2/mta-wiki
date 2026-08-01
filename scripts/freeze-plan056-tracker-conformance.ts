import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import { buildResolvedTransitPublicPack } from "../packages/pipeline/src/materialize/resolved-transit-public";

const TRACKER_ROOT = process.env.PLAN056_TRACKER_ROOT ?? "/mnt/models/dev/bus-reliability-tracker";
const ACCEPTED_AT = "2026-08-01";
const ACCEPTED_BY = "project-owner";
const OWNER_RECEIPT = "plan-056-owner-approval:2026-08-01";
const expected = {
  audit: "7637387d5f3a4c8d8db90a699113fbce5809b585e141cc1412f8d6b284cc3d91",
  global: "7099990178f733538fdf96a73f5d42afe46f010cb852e6b79fefe6a1bedbc7f8",
  routePartition: "509ca14fd773275fc72fb90468bce582c6cd8fc34f0d063a079a8501f628811f",
} as const;

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
function lines(rows: readonly unknown[]): string {
  return rows.map((row) => stableJson(row as JsonValue)).join("\n") + "\n";
}
function partition(values: readonly string[]): string {
  return sha([...values].sort().join("\n"));
}

const auditPath = join(TRACKER_ROOT, "data/artifacts/quality/intervention-episode-resolution.json");
const globalPath = join(TRACKER_ROOT, "data/artifacts/studio/v2/interventions/public-episodes.json");
const auditContent = readFileSync(auditPath, "utf8");
const globalContent = readFileSync(globalPath, "utf8");
if (sha(auditContent) !== expected.audit || sha(globalContent) !== expected.global) {
  throw new Error("Tracker black-box source bytes drifted");
}
const audit = JSON.parse(auditContent) as Record<string, any>;
const global = JSON.parse(globalContent) as Record<string, any>;
const globalById = new Map((global.episodes as Array<Record<string, any>>).map((row) => [row.episodeId, row]));
if (globalById.size !== 204 || (audit.audits as unknown[]).length !== 204) throw new Error("Tracker episode denominator drifted");

const globalRouteMemberships = new Set<string>();
for (const episode of global.episodes as Array<Record<string, any>>) {
  for (const route of episode.routes as Array<Record<string, any>>) {
    globalRouteMemberships.add(`${route.slug}|${episode.episodeId}`);
  }
}
if (globalRouteMemberships.size !== 243 || new Set([...globalRouteMemberships].map((value) => value.split("|")[1])).size !== 204) {
  throw new Error("Tracker route/global membership denominator drifted");
}

const globalRouteIdentity = new Map<string, string>();
for (const episode of global.episodes as Array<Record<string, any>>) {
  for (const route of episode.routes as Array<Record<string, any>>) {
    const prior = globalRouteIdentity.get(route.slug);
    if (prior && prior !== route.routeId) throw new Error(`Tracker route identity conflict: ${route.slug}`);
    globalRouteIdentity.set(route.slug, route.routeId);
  }
}
const routeSurface = [...globalRouteIdentity].sort(([left], [right]) => left.localeCompare(right)).map(([routeKey, routeId]) => {
  const path = join(TRACKER_ROOT, "data", "artifacts", "studio", "v2", "routes", routeKey, "intervention-history.json");
  const content = readFileSync(path, "utf8");
  const artifact = JSON.parse(content) as Record<string, any>;
  if (artifact.artifactKind !== "bp.studio.route_intervention_history.v1" || artifact.schemaVersion !== 1 ||
      artifact.releaseId !== global.release.releaseId || artifact.route?.slug !== routeKey || artifact.route?.routeId !== routeId ||
      !Array.isArray(artifact.episodes)) {
    throw new Error(`Tracker route artifact identity/schema drifted: ${routeKey}`);
  }
  const episodeMemberships = (artifact.episodes as Array<Record<string, any>>).map((episode) => {
    const globalEpisode = globalById.get(episode.episodeId);
    if (!globalEpisode || stableJson(episode as JsonValue) !== stableJson(globalEpisode as JsonValue)) {
      throw new Error(`Tracker Route History/global episode mismatch: ${routeKey}/${episode.episodeId}`);
    }
    return { tracker_episode_id: episode.episodeId, episode_sha256: sha(stableJson(episode as JsonValue)) };
  }).sort((left, right) => left.tracker_episode_id.localeCompare(right.tracker_episode_id));
  if (new Set(episodeMemberships.map((row) => row.tracker_episode_id)).size !== episodeMemberships.length) {
    throw new Error(`Tracker route artifact has duplicate episode identity: ${routeKey}`);
  }
  return {
    schema_version: 1,
    tracker_route_id: routeId,
    tracker_route_key: routeKey,
    route_artifact_sha256: sha(content),
    episode_memberships: episodeMemberships,
  };
});
const routeMemberships = new Set(routeSurface.flatMap((route) =>
  route.episode_memberships.map((episode) => `${route.tracker_route_key}|${episode.tracker_episode_id}`)
));
if (routeSurface.length !== 179 || routeMemberships.size !== 243 ||
    JSON.stringify([...routeMemberships].sort()) !== JSON.stringify([...globalRouteMemberships].sort())) {
  throw new Error("Tracker Route History/global membership multiset drifted");
}
const routeSurfaceContent = lines(routeSurface);
const routeArtifactPartition = partition(routeSurface.map((row) => `${row.tracker_route_key}\t${row.route_artifact_sha256}`));

const baseline = (audit.audits as Array<Record<string, any>>).map((row) => {
  const episode = globalById.get(row.episodeId);
  if (!episode) throw new Error(`Tracker audit/global join missing: ${row.episodeId}`);
  return {
    schema_version: 1,
    tracker_episode_id: row.episodeId,
    tracker_origin: row.decisionKind,
    origin_ids: [...new Set([...(row.decisionIds as string[]), ...(row.sourceEventIds as string[])])].sort(),
    producer_intervention_id: row.occurrenceId,
    tracker_date: { value: episode.date.start, precision: episode.date.precision },
    tracker_route_ids: (episode.routes as Array<Record<string, any>>).map((route) => String(route.routeId)).sort(),
    tracker_route_keys: (episode.routes as Array<Record<string, any>>).map((route) => String(route.slug)).sort(),
    global_episode_sha256: sha(stableJson(episode as JsonValue)),
  };
}).sort((a, b) => a.tracker_episode_id.localeCompare(b.tracker_episode_id));

const pack = buildResolvedTransitPublicPack("2026-07-27", repoRoot);
const producerById = new Map(pack.episodes.map((row) => [row.intervention_id, row]));
const producerRouteByKey = new Map(pack.routes.map((row) => [row.route_key, row]));
const mappedIds = new Set<string>();
const ledger = baseline.map((row) => {
  if (row.tracker_origin === "reviewed_occurrence") {
    const producer = row.producer_intervention_id ? producerById.get(row.producer_intervention_id) : undefined;
    if (!producer) throw new Error(`mapped Tracker occurrence is absent from producer: ${row.tracker_episode_id}`);
    mappedIds.add(producer.intervention_id);
    if (JSON.stringify(row.tracker_route_keys) !== JSON.stringify(producer.route_keys)) {
      throw new Error(`mapped Tracker/producer route identity differs: ${row.tracker_episode_id}`);
    }
    const sameTypedPeriod = row.tracker_date.precision === producer.onset.precision && (
      row.tracker_date.value === producer.onset.date ||
      (producer.onset.precision === "month" && row.tracker_date.value === `${producer.onset.date}-01`) ||
      (producer.onset.precision === "year" && row.tracker_date.value === `${producer.onset.date}-01-01`)
    );
    const representationDiffers = sameTypedPeriod && row.tracker_date.value !== producer.onset.date;
    const onsetDiffers = !sameTypedPeriod;
    return {
      schema_version: 1, row_kind: "tracker_episode", tracker_episode_id: row.tracker_episode_id,
      tracker_origin: row.tracker_origin, origin_ids: row.origin_ids,
      classification: "mta_wiki_owned_producer_truth", consumer_disposition: "use_producer_identity",
      producer_intervention_ids: [producer.intervention_id],
      tracker_route_ids: row.tracker_route_ids, tracker_route_keys: row.tracker_route_keys,
      producer_route_keys: producer.route_keys,
      tracker_date: row.tracker_date, producer_onset: producer.onset,
      field_diffs: [...(onsetDiffers ? ["onset"] : []), ...(representationDiffers ? ["date_representation"] : []), "episode_identity", "presentation_copy"].sort(),
      reason_code: "final_producer_occurrence_supersedes_tracker_local_projection",
      accepted_at: ACCEPTED_AT, accepted_by: ACCEPTED_BY, acceptance_receipt_id: OWNER_RECEIPT,
    };
  }
  const enrichment = row.tracker_origin === "ace_registry";
  return {
    schema_version: 1, row_kind: "tracker_episode", tracker_episode_id: row.tracker_episode_id,
    tracker_origin: row.tracker_origin, origin_ids: row.origin_ids,
    classification: enrichment ? "tracker_owned_enrichment" : "explicitly_justified_exclusion",
    consumer_disposition: enrichment ? "enrichment_only" : "drop_legacy_episode",
    producer_intervention_ids: [],
    tracker_route_ids: row.tracker_route_ids, tracker_route_keys: row.tracker_route_keys,
    producer_route_keys: [], tracker_date: row.tracker_date, producer_onset: null,
    field_diffs: ["episode_identity", "presentation_copy", "producer_episode_absent"],
    reason_code: enrichment
      ? "ace_registry_event_remains_tracker_enrichment_without_local_episode_identity"
      : "bounded_local_demo_identity_is_stale_against_final_producer_review",
    accepted_at: ACCEPTED_AT, accepted_by: ACCEPTED_BY, acceptance_receipt_id: OWNER_RECEIPT,
  };
});
for (const producer of pack.episodes.filter((row) => !mappedIds.has(row.intervention_id))) {
  ledger.push({
    schema_version: 1, row_kind: "producer_addition", tracker_episode_id: null,
    tracker_origin: null, origin_ids: [], classification: "mta_wiki_owned_producer_truth",
    consumer_disposition: "add_producer_episode", producer_intervention_ids: [producer.intervention_id],
    tracker_route_ids: [], tracker_route_keys: [], producer_route_keys: producer.route_keys,
    tracker_date: null, producer_onset: producer.onset, field_diffs: ["tracker_episode_absent"],
    reason_code: "final_producer_episode_missing_from_legacy_tracker_projection",
    accepted_at: ACCEPTED_AT, accepted_by: ACCEPTED_BY, acceptance_receipt_id: OWNER_RECEIPT,
  });
}
ledger.sort((a, b) => `${a.row_kind}|${a.tracker_episode_id ?? a.producer_intervention_ids[0]}`
  .localeCompare(`${b.row_kind}|${b.tracker_episode_id ?? b.producer_intervention_ids[0]}`));

const trackerRouteIds = new Set(baseline.flatMap((row) => row.tracker_route_ids));
const producerGtfsIds = new Set(pack.routes.map((row) => row.gtfs_route_id));
const summary = {
  schema_version: 1,
  contract_id: "plan-056-tracker-conformance-freeze-v1",
  tracker_repository_head: "292d2bd0934e6c8ebfd5637a8bf31b351b7fcb02",
  tracker_worktree_state: "dirty_read_only_black_box",
  source_artifacts: {
    tracker_global_source_commit: "49368520b390025c1f0563b5422f4fd598a963ec",
    tracker_global_git_blob: "767f5a31ccd1924c11af0db009cb5ca89daf165b",
    tracker_resolution_audit_sha256: expected.audit,
    tracker_global_episodes_sha256: expected.global,
    independently_audited_tracker_route_history_partition_sha256: expected.routePartition,
    frozen_tracker_route_artifact_partition_sha256: routeArtifactPartition,
    frozen_tracker_route_surface_manifest_sha256: sha(routeSurfaceContent),
  },
  tracker_counts: {
    episodes: baseline.length, routes: new Set(baseline.flatMap((row) => row.tracker_route_keys)).size, episode_route_memberships: routeMemberships.size,
    reviewed_occurrence: baseline.filter((row) => row.tracker_origin === "reviewed_occurrence").length,
    reviewed_reconciliation: baseline.filter((row) => row.tracker_origin === "reviewed_reconciliation").length,
    ace_registry: baseline.filter((row) => row.tracker_origin === "ace_registry").length,
    ace_registry_events: audit.scope.registryEventCount,
    ace_registry_attached_events: audit.scope.registryAttachedEventCount,
    reconciliation_decisions: audit.scope.reconciliationDecisionCount,
    local_display_overrides: 2,
  },
  accepted_result: {
    producer_episodes: pack.episodes.length, exact_components: pack.components.length,
    producer_route_keys: pack.routes.length, producer_unique_gtfs_routes: producerGtfsIds.size,
    mapped_producer_truth: ledger.filter((row) => row.row_kind === "tracker_episode" && row.classification === "mta_wiki_owned_producer_truth").length,
    tracker_enrichment_only: ledger.filter((row) => row.classification === "tracker_owned_enrichment").length,
    justified_exclusions: ledger.filter((row) => row.classification === "explicitly_justified_exclusion").length,
    producer_additions: ledger.filter((row) => row.row_kind === "producer_addition").length,
    onset_differences: ledger.filter((row) => row.field_diffs.includes("onset")).length,
    date_representation_differences: ledger.filter((row) => row.field_diffs.includes("date_representation")).length,
  },
  route_differences: {
    intersection_gtfs_routes: [...trackerRouteIds].filter((id) => producerGtfsIds.has(id)).length,
    tracker_only_gtfs_routes: [...trackerRouteIds].filter((id) => !producerGtfsIds.has(id)).sort(),
    producer_only_gtfs_routes: [...producerGtfsIds].filter((id) => !trackerRouteIds.has(id)).sort(),
    producer_duplicate_gtfs_route_keys: [...producerGtfsIds].map((id) => ({ id, keys: pack.routes.filter((route) => route.gtfs_route_id === id).map((route) => route.route_key).sort() })).filter((row) => row.keys.length > 1),
  },
  downstream_ownership: {
    tracker_retained: ["ace_registry_events", "studies", "findings", "proposals", "editorial_copy", "network_buildout_presentation", "ui_composition"],
    producer_owned: ["episode_identity", "component_identity", "route_identity", "treatment_family", "onset", "action", "extent", "placement", "current_footprint", "sources"],
    required_tracker_cutover: "Plan 106 must remove local episode minting and the alternate legacy Route History identity fallback before activation.",
  },
  black_box_surface_parity: { status: "pass", global_episode_count: 204, route_artifact_count: 179, membership_count: 243, identity_or_content_mismatch_count: 0 },
  provider_usage: { provider_requests: 0, actual_cost_usd: 0 },
  accepted_at: ACCEPTED_AT,
  accepted_by: ACCEPTED_BY,
  acceptance_receipt_id: OWNER_RECEIPT,
};

const baselineContent = lines(baseline);
const ledgerContent = lines(ledger);
const summaryContent = `${stableJson(summary as unknown as JsonValue)}\n`;
const artifactContents = [
  ["data/resolved-transit/operator/v1/tracker-conformance/tracker-baseline.jsonl", baselineContent],
  ["data/resolved-transit/operator/v1/tracker-conformance/accepted-diff-ledger.jsonl", ledgerContent],
  ["data/resolved-transit/operator/v1/tracker-conformance/tracker-route-surface.jsonl", routeSurfaceContent],
  ["data/resolved-transit/operator/v1/tracker-conformance/summary.json", summaryContent],
] as const;
const receiptSeed = artifactContents.map(([, content]) => sha(content)).join("\n");
const receipt = {
  schema_version: 1,
  contract_id: "plan-056-tracker-diff-acceptance-v1",
  as_of_date: "2026-07-27",
  artifacts: artifactContents.map(([path, content]) => ({ path, bytes: Buffer.byteLength(content), sha256: sha(content) })),
  counts: {
    tracker_baseline_episodes: 204, tracker_baseline_routes: 179, tracker_baseline_route_memberships: 243,
    mapped_producer_truth: 131, tracker_enrichment_only: 65, justified_exclusions: 8,
    accepted_diff_rows: ledger.length, producer_additions: 26, producer_episodes: pack.episodes.length,
    producer_route_keys: pack.routes.length, producer_unique_gtfs_routes: producerGtfsIds.size,
  },
  partitions: {
    baseline_episode_ids_sha256: partition(baseline.map((row) => row.tracker_episode_id)),
    ledger_decision_keys_sha256: partition(ledger.map((row) => row.row_kind === "tracker_episode" ? row.tracker_episode_id! : row.producer_intervention_ids[0]!)),
    mapped_tracker_producer_pairs_sha256: partition(ledger.filter((row) => row.row_kind === "tracker_episode" && row.classification === "mta_wiki_owned_producer_truth").map((row) => `${row.tracker_episode_id}\t${row.producer_intervention_ids[0]}`)),
    producer_addition_ids_sha256: partition(ledger.filter((row) => row.row_kind === "producer_addition").map((row) => row.producer_intervention_ids[0]!)),
    route_surface_memberships_sha256: partition(routeSurface.flatMap((route) => route.episode_memberships.map((episode) => `${route.tracker_route_key}\t${episode.tracker_episode_id}\t${episode.episode_sha256}`))),
  },
  provider_usage: { provider_requests: 0, actual_cost_usd: 0 },
  acceptance: {
    accepted_at: ACCEPTED_AT, accepted_by: ACCEPTED_BY,
    decision: "Approve the Plan 056 display contract and exact Tracker diff ledger under the owner's explicit all-approvals authorization.",
    receipt_id: OWNER_RECEIPT,
  },
  receipt_id: `plan-056-tracker-diff-acceptance:${sha(`plan-056-tracker-diff-acceptance-v1\n${receiptSeed}`)}`,
};
const receiptContent = `${stableJson(receipt as unknown as JsonValue)}\n`;

const mode = process.argv[2];
if (mode === "baseline") process.stdout.write(baselineContent);
else if (mode === "ledger") process.stdout.write(ledgerContent);
else if (mode === "routes") process.stdout.write(routeSurfaceContent);
else if (mode === "summary") process.stdout.write(summaryContent);
else if (mode === "receipt") process.stdout.write(receiptContent);
else if (mode === "write") {
  const outputRoot = join(repoRoot, "data", "resolved-transit", "operator", "v1", "tracker-conformance");
  mkdirSync(outputRoot, { recursive: true });
  for (const [path, content] of [...artifactContents, ["data/resolved-transit/operator/v1/tracker-conformance/accepted-ledger-receipt.json", receiptContent] as const]) {
    writeFileSync(join(repoRoot, path), content);
  }
  console.log(`Wrote ${artifactContents.length + 1} Plan 056 Tracker conformance artifacts to ${outputRoot}`);
} else throw new Error("usage: bun scripts/freeze-plan056-tracker-conformance.ts baseline|ledger|routes|summary|receipt|write");
