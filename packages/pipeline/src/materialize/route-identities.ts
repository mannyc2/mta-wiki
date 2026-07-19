import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import { parseRouteAnchorsJsonl, routeAnchorsJsonl, type RouteAnchorRow } from "./route-anchors.js";
import { SERVICE_MODES, parseRouteIdentitySnapshotV1, routeFamilyId, type RouteIdentitySnapshotV1, type RouteInventoryRow, type RouteRecordBinding, type ServiceMode } from "./route-identity-contract.js";

export type RouteBindingProposal = Omit<RouteRecordBinding, "presentation_primary"> & {
  proposal_status: "deterministic_exact" | "review_required";
  review_reason: "none" | "no_exact_identity" | "unknown_service_variant" | "temporal_scope_review" | "service_class_review" | "presentation_primary_review";
  proposed_only: true;
};
export type RouteIdentityAudit = {
  schema_version: 1; contract_id: "route-identity-audit-proposal-v1"; snapshot_id: string;
  route_record_count: number; exact_binding_count: number; review_required_count: number;
  proposals: RouteBindingProposal[];
};

function text(value: JsonValue | undefined): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function evidenceIds(record: MtaCanonicalRecord): string[] { return [...new Set(record.evidence_refs.map((ref) => ref.evidence_id).filter((id): id is string => Boolean(id)))].sort(); }
export function canonicalRouteRecordFingerprint(record: MtaCanonicalRecord): string {
  const pinned = { record_id: record.record_id, route_id: text(record.payload.route_id), internal_route_id: text(record.payload.internal_route_id), route_id_authority: text(record.payload.route_id_authority), service_variant: text(record.payload.service_variant), route_record_scope: text(record.payload.route_record_scope), evidence_ids: evidenceIds(record) };
  return createHash("sha256").update(stableJson(pinned)).digest("hex");
}
function serviceVariant(record: MtaCanonicalRecord): ServiceMode | null {
  const value = text(record.payload.service_variant); return value && SERVICE_MODES.includes(value as ServiceMode) ? value as ServiceMode : null;
}

export function proposeRouteBindings(records: MtaCanonicalRecord[], inventory: RouteInventoryRow[]): RouteBindingProposal[] {
  const routes = records.filter((record) => record.record_kind === "route").sort((a, b) => a.record_id.localeCompare(b.record_id));
  const byExactId = new Map<string, RouteInventoryRow>();
  for (const identity of inventory) { if (identity.source_route_id !== identity.gtfs_route_id) throw new Error(`${identity.source_route_id}: compatibility identity is not injective`); if (byExactId.has(identity.gtfs_route_id)) throw new Error(`${identity.gtfs_route_id}: exported exact identity collision`); byExactId.set(identity.gtfs_route_id, identity); }
  return routes.map((record) => {
    const internal = text(record.payload.internal_route_id); const authority = text(record.payload.route_id_authority);
    const source = text(record.payload.route_id); const authoritative = internal && authority === "mta_internal" ? internal : null;
    const targetId = authoritative && byExactId.has(authoritative) ? authoritative : source && byExactId.has(source) ? source : null;
    const identity = targetId ? byExactId.get(targetId)! : null; const variant = serviceVariant(record);
    const knownVariant = text(record.payload.service_variant) === null || variant !== null;
    const deterministic = Boolean(identity && knownVariant);
    return {
      route_record_id: record.record_id, route_family_id: identity ? identity.route_family_id : source ? routeFamilyId(source) : null,
      dataset_id: identity?.dataset_id ?? null, component_feed_ids: identity?.component_feed_ids ?? [],
      source_route_id: identity?.source_route_id ?? null, gtfs_route_id: identity?.gtfs_route_id ?? null,
      service_variant: variant, identity_scope: identity ? "exact_service" : "unresolved", service_class: "undetermined",
      record_temporal_scope: "undetermined", projectable: false,
      derivation: identity ? authoritative === targetId ? "authoritative_internal_route_id_exact_v1" : "source_route_id_exact_case_sensitive_v1" : "no_exact_case_sensitive_identity_v1",
      evidence_ids: evidenceIds(record), canonical_record_fingerprint: canonicalRouteRecordFingerprint(record),
      proposal_status: deterministic ? "deterministic_exact" : "review_required",
      review_reason: !identity ? "no_exact_identity" : !knownVariant ? "unknown_service_variant" : "temporal_scope_review",
      proposed_only: true,
    } satisfies RouteBindingProposal;
  });
}

export function buildRouteIdentityAudit(snapshotId: string, records: MtaCanonicalRecord[], inventory: RouteInventoryRow[]): RouteIdentityAudit {
  const proposals = proposeRouteBindings(records, inventory); const exact = proposals.filter((row) => row.identity_scope === "exact_service").length;
  return { schema_version: 1, contract_id: "route-identity-audit-proposal-v1", snapshot_id: snapshotId, route_record_count: proposals.length, exact_binding_count: exact, review_required_count: proposals.length - exact, proposals };
}
export function routeIdentityAuditBytes(audit: RouteIdentityAudit): string { return `${stableJson(audit)}\n`; }
export function routeIdentityAuditSha256(audit: RouteIdentityAudit): string { return createHash("sha256").update(routeIdentityAuditBytes(audit)).digest("hex"); }
export function routeIdentityReviewMarkdown(audit: RouteIdentityAudit): string {
  const lines = [`# Route identity proposal: ${audit.snapshot_id}`, "", `Proposal SHA-256: \`${routeIdentityAuditSha256(audit)}\``, "", `Routes: ${audit.route_record_count}; exact identities: ${audit.exact_binding_count}; review required: ${audit.review_required_count}.`, "", "This packet is proposed only. It is not an accepted route-binding decision.", "", "| Route record | Proposed exact ID | Derivation | Review reason |", "|---|---|---|---|"];
  for (const row of audit.proposals) lines.push(`| ${row.route_record_id} | ${row.gtfs_route_id ?? "—"} | ${row.derivation} | ${row.review_reason} |`);
  return `${lines.join("\n")}\n`;
}

function officialAliases(identity: RouteInventoryRow | undefined): string[] {
  if (!identity) return [];
  return [...new Set([identity.display_label, identity.route_short_name, identity.source_route_id].filter((value): value is string => typeof value === "string" && value.length > 0))].sort();
}

function nonProjectableDisposition(binding: RouteRecordBinding): string {
  if (binding.identity_scope === "aggregate_context") return "aggregate_label";
  if (binding.identity_scope === "route_family_context") return "corridor_service_label";
  if (binding.service_class === "external") return "external_bus_service";
  if (binding.service_class === "non_bus") return "non_bus_service";
  if (binding.service_class === "temporary") return "temporary_service";
  if (binding.service_class === "proposal" || binding.record_temporal_scope === "future_description") return "proposal";
  if (binding.record_temporal_scope === "historical_description") return "historical_service_identity";
  if (binding.identity_scope === "exact_service") return "current_ineligible_exact_service";
  throw new Error(binding.route_record_id + ": reviewed nonprojectable binding has no compatibility disposition");
}

export function projectRouteAnchorsFromIdentitySnapshot(input: RouteIdentitySnapshotV1): RouteAnchorRow[] {
  const snapshot = parseRouteIdentitySnapshotV1(input);
  const identityByKey = new Map(snapshot.service_identities.map((identity) => [
    identity.dataset_id + "\0" + identity.source_route_id,
    identity,
  ]));
  const bindingsByIdentity = new Map<string, RouteRecordBinding[]>();
  for (const binding of snapshot.record_bindings) {
    if (binding.identity_scope !== "exact_service") continue;
    const key = String(binding.dataset_id) + "\0" + String(binding.source_route_id);
    const group = bindingsByIdentity.get(key);
    if (group) group.push(binding);
    else bindingsByIdentity.set(key, [binding]);
  }

  const rows: RouteAnchorRow[] = [];
  for (const identity of snapshot.service_identities) {
    const key = identity.dataset_id + "\0" + identity.source_route_id;
    const projectable = (bindingsByIdentity.get(key) ?? []).filter((binding) => binding.projectable);
    const primaries = projectable.filter((binding) => binding.presentation_primary);
    if (projectable.length > 0 && primaries.length !== 1) {
      throw new Error(key + ": compatibility projection requires exactly one presentation primary");
    }
    const primary = primaries[0];
    rows.push({
      gtfs_route_id: identity.gtfs_route_id,
      canonical_route_record_id: primary?.route_record_id ?? null,
      variant_record_ids: projectable.filter((binding) => binding !== primary).map((binding) => binding.route_record_id).sort(),
      aliases: officialAliases(identity),
      disposition: primary ? "exact_service" : "no_wiki_coverage",
      anchor_reason: primary ? "route_identity_snapshot_v1" : null,
    });
  }

  for (const binding of snapshot.record_bindings.filter((candidate) => !candidate.projectable)) {
    const identity = binding.dataset_id && binding.source_route_id
      ? identityByKey.get(binding.dataset_id + "\0" + binding.source_route_id)
      : undefined;
    rows.push({
      gtfs_route_id: null,
      canonical_route_record_id: binding.route_record_id,
      variant_record_ids: [],
      aliases: officialAliases(identity),
      disposition: nonProjectableDisposition(binding),
      anchor_reason: "route_identity_snapshot_v1:" + binding.identity_scope + ":" + binding.service_class + ":" + binding.record_temporal_scope,
    });
  }

  const sorted = rows.sort((left, right) => {
    if (left.gtfs_route_id && right.gtfs_route_id) return left.gtfs_route_id.localeCompare(right.gtfs_route_id);
    if (left.gtfs_route_id) return -1;
    if (right.gtfs_route_id) return 1;
    return String(left.canonical_route_record_id).localeCompare(String(right.canonical_route_record_id));
  });
  const accounting = new Map<string, number>();
  for (const row of sorted) {
    for (const recordId of [row.canonical_route_record_id, ...row.variant_record_ids]) {
      if (recordId) accounting.set(recordId, (accounting.get(recordId) ?? 0) + 1);
    }
  }
  const invalid = snapshot.record_bindings
    .map((binding) => [binding.route_record_id, accounting.get(binding.route_record_id) ?? 0] as const)
    .filter(([, count]) => count !== 1);
  if (invalid.length > 0) throw new Error("route compatibility accounting violation: " + invalid.map(([id, count]) => id + "=" + count).join(", "));
  if (sorted.length !== snapshot.service_identities.length + snapshot.record_bindings.filter((binding) => !binding.projectable).length) {
    throw new Error("route compatibility row-count invariant failed");
  }
  return parseRouteAnchorsJsonl(routeAnchorsJsonl(sorted));
}
