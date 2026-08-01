import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedTransitPublicPack } from "../consumer/public-contract.js";

const ROOT = "data/resolved-transit/operator/v1/tracker-conformance";
const BASELINE = `${ROOT}/tracker-baseline.jsonl`;
const LEDGER = `${ROOT}/accepted-diff-ledger.jsonl`;
const ROUTE_SURFACE = `${ROOT}/tracker-route-surface.jsonl`;
const SUMMARY = `${ROOT}/summary.json`;
const RECEIPT = `${ROOT}/accepted-ledger-receipt.json`;
const fields = {
  baseline: ["global_episode_sha256", "origin_ids", "producer_intervention_id", "schema_version", "tracker_date", "tracker_episode_id", "tracker_origin", "tracker_route_ids", "tracker_route_keys"],
  ledger: ["acceptance_receipt_id", "accepted_at", "accepted_by", "classification", "consumer_disposition", "field_diffs", "origin_ids", "producer_intervention_ids", "producer_onset", "producer_route_keys", "reason_code", "row_kind", "schema_version", "tracker_date", "tracker_episode_id", "tracker_origin", "tracker_route_ids", "tracker_route_keys"],
  routeSurface: ["episode_memberships", "route_artifact_sha256", "schema_version", "tracker_route_id", "tracker_route_key"],
  routeMembership: ["episode_sha256", "tracker_episode_id"],
} as const;

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
function object(value: unknown, path: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as Record<string, any>;
}
function exact(row: Record<string, any>, expected: readonly string[], path: string): void {
  if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${path}: exact fields drifted`);
}
function nonempty(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path}: expected nonempty string`);
  return value;
}
function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) throw new Error(`${path}: expected string array`);
  const result = value as string[];
  if (new Set(result).size !== result.length || JSON.stringify([...result].sort()) !== JSON.stringify(result)) throw new Error(`${path}: expected unique sorted array`);
  return result;
}
function rows(content: string, path: string): Array<Record<string, any>> {
  const text = content.trim();
  return text ? text.split("\n").map((line, index) => object(JSON.parse(line) as unknown, `${path}:${index + 1}`)) : [];
}
function count(rows: readonly Record<string, any>[], predicate: (row: Record<string, any>) => boolean): number {
  return rows.filter(predicate).length;
}
function partition(values: readonly string[]): string {
  return sha([...values].sort().join("\n"));
}
function sameSet(left: Iterable<string>, right: Iterable<string>, path: string): void {
  if (JSON.stringify([...left].sort()) !== JSON.stringify([...right].sort())) throw new Error(`${path}: exact set mismatch`);
}

export function validateTrackerConformance(
  pack: ResolvedTransitPublicPack,
  repoDir: string,
  artifactRoot = ROOT,
): void {
  const contents = new Map([BASELINE, LEDGER, ROUTE_SURFACE, SUMMARY, RECEIPT].map((path) =>
    [path, readFileSync(join(repoDir, artifactRoot, path.slice(ROOT.length + 1)), "utf8")]
  ));
  const baseline = rows(contents.get(BASELINE)!, BASELINE);
  const ledger = rows(contents.get(LEDGER)!, LEDGER);
  const routeSurface = rows(contents.get(ROUTE_SURFACE)!, ROUTE_SURFACE);
  const summary = object(JSON.parse(contents.get(SUMMARY)!) as unknown, SUMMARY);
  const receipt = object(JSON.parse(contents.get(RECEIPT)!) as unknown, RECEIPT);
  for (const [index, row] of baseline.entries()) {
    exact(row, fields.baseline, `${BASELINE}:${index + 1}`);
    if (row.schema_version !== 1 || !["reviewed_occurrence", "reviewed_reconciliation", "ace_registry"].includes(row.tracker_origin)) throw new Error("Tracker baseline schema/origin drifted");
    nonempty(row.tracker_episode_id, "tracker_episode_id");
    strings(row.origin_ids, "origin_ids"); strings(row.tracker_route_ids, "tracker_route_ids"); strings(row.tracker_route_keys, "tracker_route_keys");
    if (row.tracker_origin === "reviewed_occurrence" && !/^occurrence:[a-f0-9]{24}$/u.test(String(row.producer_intervention_id))) throw new Error("reviewed occurrence mapping missing");
    if (row.tracker_origin !== "reviewed_occurrence" && row.producer_intervention_id !== null) throw new Error("local Tracker identity claims producer ownership");
    if (!/^[a-f0-9]{64}$/u.test(String(row.global_episode_sha256))) throw new Error("Tracker baseline episode hash is invalid");
  }
  for (const [index, row] of ledger.entries()) {
    exact(row, fields.ledger, `${LEDGER}:${index + 1}`);
    if (row.schema_version !== 1 || row.accepted_at !== "2026-08-01" || row.accepted_by !== "project-owner" || row.acceptance_receipt_id !== "plan-056-owner-approval:2026-08-01") throw new Error("Tracker diff decision is not owner-accepted");
    strings(row.origin_ids, "origin_ids"); strings(row.producer_intervention_ids, "producer_intervention_ids"); strings(row.tracker_route_ids, "tracker_route_ids"); strings(row.tracker_route_keys, "tracker_route_keys"); strings(row.producer_route_keys, "producer_route_keys"); strings(row.field_diffs, "field_diffs");
    nonempty(row.reason_code, "reason_code");
  }
  const routeSurfaceMemberships: Array<{ routeId: string; routeKey: string; episodeId: string; episodeSha: string }> = [];
  for (const [index, row] of routeSurface.entries()) {
    exact(row, fields.routeSurface, `${ROUTE_SURFACE}:${index + 1}`);
    if (row.schema_version !== 1 || !/^[a-f0-9]{64}$/u.test(String(row.route_artifact_sha256))) throw new Error("Tracker route-surface schema/hash drifted");
    const routeId = nonempty(row.tracker_route_id, "tracker_route_id");
    const routeKey = nonempty(row.tracker_route_key, "tracker_route_key");
    if (!Array.isArray(row.episode_memberships) || row.episode_memberships.length === 0) throw new Error("Tracker route-surface membership list is empty");
    const episodeIds: string[] = [];
    for (const [membershipIndex, value] of row.episode_memberships.entries()) {
      const membership = object(value, `${ROUTE_SURFACE}:${index + 1}.episode_memberships[${membershipIndex}]`);
      exact(membership, fields.routeMembership, `${ROUTE_SURFACE}:${index + 1}.episode_memberships[${membershipIndex}]`);
      const episodeId = nonempty(membership.tracker_episode_id, "tracker_episode_id");
      const episodeSha = nonempty(membership.episode_sha256, "episode_sha256");
      if (!/^[a-f0-9]{64}$/u.test(episodeSha)) throw new Error("Tracker route-surface episode hash is invalid");
      episodeIds.push(episodeId);
      routeSurfaceMemberships.push({ routeId, routeKey, episodeId, episodeSha });
    }
    if (new Set(episodeIds).size !== episodeIds.length || JSON.stringify([...episodeIds].sort()) !== JSON.stringify(episodeIds)) throw new Error("Tracker route-surface episodes must be unique and sorted");
  }
  if (baseline.length !== 204 || ledger.length !== 230 || new Set(baseline.map((row) => row.tracker_episode_id)).size !== 204) throw new Error("Tracker conformance denominator drifted");
  if (count(baseline, (row) => row.tracker_origin === "reviewed_occurrence") !== 131 || count(baseline, (row) => row.tracker_origin === "reviewed_reconciliation") !== 8 || count(baseline, (row) => row.tracker_origin === "ace_registry") !== 65) throw new Error("Tracker origin partition drifted");
  const trackerRows = ledger.filter((row) => row.row_kind === "tracker_episode");
  const additions = ledger.filter((row) => row.row_kind === "producer_addition");
  sameSet(trackerRows.map((row) => row.tracker_episode_id), baseline.map((row) => row.tracker_episode_id), "Tracker ledger coverage");
  if (additions.length !== 26 || count(trackerRows, (row) => row.classification === "mta_wiki_owned_producer_truth" && row.consumer_disposition === "use_producer_identity") !== 131 || count(trackerRows, (row) => row.classification === "tracker_owned_enrichment" && row.consumer_disposition === "enrichment_only") !== 65 || count(trackerRows, (row) => row.classification === "explicitly_justified_exclusion" && row.consumer_disposition === "drop_legacy_episode") !== 8) throw new Error("accepted Tracker classification arithmetic drifted");
  const producerById = new Map(pack.episodes.map((row) => [row.intervention_id, row]));
  const baselineById = new Map(baseline.map((row) => [row.tracker_episode_id, row]));
  if (routeSurface.length !== 179 || new Set(routeSurface.map((row) => row.tracker_route_key)).size !== 179 ||
      new Set(routeSurface.map((row) => row.tracker_route_id)).size !== 179 || routeSurfaceMemberships.length !== 243 ||
      new Set(routeSurfaceMemberships.map((row) => `${row.routeKey}|${row.episodeId}`)).size !== 243) {
    throw new Error("Tracker route-surface denominator/identity drifted");
  }
  for (const baselineRow of baseline) {
    const memberships = routeSurfaceMemberships.filter((row) => row.episodeId === baselineRow.tracker_episode_id);
    sameSet(memberships.map((row) => row.routeKey), baselineRow.tracker_route_keys, `${baselineRow.tracker_episode_id} Route History keys`);
    sameSet(memberships.map((row) => row.routeId), baselineRow.tracker_route_ids, `${baselineRow.tracker_episode_id} Route History ids`);
    if (memberships.some((row) => row.episodeSha !== baselineRow.global_episode_sha256)) throw new Error("Tracker Route History/global episode content drifted");
  }
  const acceptedProducerIds: string[] = [];
  for (const row of trackerRows) {
    const source = baselineById.get(row.tracker_episode_id);
    if (!source || source.tracker_origin !== row.tracker_origin || JSON.stringify(source.origin_ids) !== JSON.stringify(row.origin_ids) || JSON.stringify(source.tracker_route_keys) !== JSON.stringify(row.tracker_route_keys)) throw new Error("Tracker ledger/baseline join drifted");
    if (row.classification === "mta_wiki_owned_producer_truth") {
      const id = row.producer_intervention_ids[0];
      const producer = producerById.get(id);
      if (row.producer_intervention_ids.length !== 1 || !producer || source.producer_intervention_id !== id || JSON.stringify(row.producer_route_keys) !== JSON.stringify(producer.route_keys)) throw new Error("Tracker mapped producer truth drifted");
      acceptedProducerIds.push(id);
    } else if (row.producer_intervention_ids.length !== 0 || row.producer_route_keys.length !== 0) throw new Error("Tracker-only row claims producer identity");
  }
  for (const row of additions) {
    const id = row.producer_intervention_ids[0];
    const producer = producerById.get(id);
    if (row.tracker_episode_id !== null || row.tracker_origin !== null || row.classification !== "mta_wiki_owned_producer_truth" || row.consumer_disposition !== "add_producer_episode" || row.producer_intervention_ids.length !== 1 || !producer || JSON.stringify(row.producer_route_keys) !== JSON.stringify(producer.route_keys)) throw new Error("producer addition drifted");
    acceptedProducerIds.push(id);
  }
  sameSet(acceptedProducerIds, pack.episodes.map((row) => row.intervention_id), "accepted final producer episodes");
  if (count(ledger, (row) => row.field_diffs.includes("onset")) !== 1 || !ledger.some((row) => row.producer_intervention_ids.includes("occurrence:8c987704152b459014217d44") && row.field_diffs.includes("onset"))) throw new Error("accepted onset delta drifted");
  const trackerGtfs = new Set(baseline.flatMap((row) => row.tracker_route_ids));
  const producerGtfs = new Set(pack.routes.map((row) => row.gtfs_route_id));
  sameSet(summary.route_differences.tracker_only_gtfs_routes, [...trackerGtfs].filter((id) => !producerGtfs.has(id)), "Tracker-only routes");
  sameSet(summary.route_differences.producer_only_gtfs_routes, [...producerGtfs].filter((id) => !trackerGtfs.has(id)), "producer-only routes");
  if (summary.tracker_counts.episodes !== 204 || summary.tracker_counts.routes !== 179 || summary.tracker_counts.episode_route_memberships !== 243 || summary.tracker_counts.ace_registry_events !== 78 || summary.tracker_counts.ace_registry_attached_events !== 13 || summary.tracker_counts.reconciliation_decisions !== 9 || summary.accepted_result.producer_episodes !== pack.episodes.length || summary.accepted_result.exact_components !== pack.components.length || summary.accepted_result.producer_route_keys !== pack.routes.length || summary.black_box_surface_parity.status !== "pass" || summary.black_box_surface_parity.identity_or_content_mismatch_count !== 0 || summary.provider_usage.provider_requests !== 0 || summary.provider_usage.actual_cost_usd !== 0) throw new Error("Tracker conformance summary drifted");
  const descriptors = receipt.artifacts as Array<Record<string, any>>;
  sameSet(descriptors.map((row) => row.path), [BASELINE, LEDGER, ROUTE_SURFACE, SUMMARY], "Tracker conformance receipt artifact coverage");
  for (const descriptor of descriptors) {
    const content = contents.get(descriptor.path);
    if (content === undefined || Buffer.byteLength(content) !== descriptor.bytes || sha(content) !== descriptor.sha256) throw new Error(`Tracker conformance artifact receipt mismatch: ${descriptor.path}`);
  }
  if (receipt.contract_id !== "plan-056-tracker-diff-acceptance-v1" || receipt.as_of_date !== pack.manifest.as_of_date || receipt.counts.accepted_diff_rows !== ledger.length || receipt.counts.producer_episodes !== pack.episodes.length || receipt.counts.producer_route_keys !== pack.routes.length || receipt.provider_usage.provider_requests !== 0 || receipt.provider_usage.actual_cost_usd !== 0) throw new Error("Tracker accepted-ledger receipt drifted");
  const partitions = receipt.partitions;
  if (partitions.baseline_episode_ids_sha256 !== partition(baseline.map((row) => row.tracker_episode_id)) || partitions.ledger_decision_keys_sha256 !== partition(ledger.map((row) => row.row_kind === "tracker_episode" ? row.tracker_episode_id : row.producer_intervention_ids[0])) || partitions.mapped_tracker_producer_pairs_sha256 !== partition(trackerRows.filter((row) => row.classification === "mta_wiki_owned_producer_truth").map((row) => `${row.tracker_episode_id}\t${row.producer_intervention_ids[0]}`)) || partitions.producer_addition_ids_sha256 !== partition(additions.map((row) => row.producer_intervention_ids[0])) || partitions.route_surface_memberships_sha256 !== partition(routeSurfaceMemberships.map((row) => `${row.routeKey}\t${row.episodeId}\t${row.episodeSha}`))) throw new Error("Tracker conformance partition receipt drifted");
  const receiptHash = sha(`plan-056-tracker-diff-acceptance-v1\n${[BASELINE, LEDGER, ROUTE_SURFACE, SUMMARY].map((path) => sha(contents.get(path)!)).join("\n")}`);
  if (receipt.receipt_id !== `plan-056-tracker-diff-acceptance:${receiptHash}`) throw new Error("Tracker accepted-ledger receipt id drifted");
}

export function trackerConformanceArtifactContents(repoDir: string): Record<string, string> {
  return Object.fromEntries([BASELINE, LEDGER, ROUTE_SURFACE, SUMMARY, RECEIPT].map((path) =>
    [path.slice(ROOT.length + 1), readFileSync(join(repoDir, path), "utf8")]
  ));
}
