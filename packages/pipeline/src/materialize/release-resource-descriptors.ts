import type { ReleaseManifestFile } from "./export-release.js";

export const RELEASE_RESOURCE_LAYERS = [
  "canonical_observation",
  "resolution_operator",
  "resolved_public",
  "release_envelope",
  "quality_nonauthorizing",
] as const;
export const RELEASE_RESOURCE_AUTHORITIES = [
  "documentary",
  "reviewed_resolution",
  "derived_public_projection",
  "reconciliation_only",
  "envelope_only",
  "quality_only",
] as const;
export const RELEASE_IDENTITY_CONTRACTS = [
  "canonical_record_id",
  "source_id_v1",
  "occurrence_id_v2",
  "episode_candidate_fingerprint_v1",
  "application_id_v1",
  "placement_id_v1",
  "placement_candidate_fingerprint_v1",
  "lifecycle_assertion_id_v1",
  "public_intervention_id_v1",
  "public_component_key_v1",
  "public_placement_key_v1",
  "public_route_key_v1",
  "public_source_key_v1",
  "public_treatment_family_key_v1",
  "not_applicable",
] as const;
export const RELEASE_JOIN_POLICIES = [
  "no_join",
  "canonical_record_reference_v1",
  "occurrence_application_v1",
  "application_placement_transition_v1",
  "placement_state_v1",
  "public_episode_component_v1",
  "public_route_component_v1",
  "public_placement_footprint_v1",
  "public_source_citation_v1",
  "identity_lineage_v1",
  "strict_submanifest_v1",
] as const;

export type ReleaseResourceDescriptor = {
  contract_id: string;
  contract_version: number;
  path: string;
  layer: typeof RELEASE_RESOURCE_LAYERS[number];
  authority: typeof RELEASE_RESOURCE_AUTHORITIES[number];
  identity_contract_id: typeof RELEASE_IDENTITY_CONTRACTS[number];
  completeness_profile: "complete" | "partial" | "not_applicable";
  join_policy_ids: Array<typeof RELEASE_JOIN_POLICIES[number]>;
  depends_on: string[];
  authorizes_occurrence: boolean;
  authorizes_current_state: boolean;
  authorizes_cross_product: boolean;
  authorizes_study: boolean;
};

const combinations = new Set([
  "canonical_observation/documentary",
  "resolution_operator/reviewed_resolution",
  "resolution_operator/reconciliation_only",
  "resolved_public/derived_public_projection",
  "release_envelope/envelope_only",
  "quality_nonauthorizing/quality_only",
]);
const layers = new Set<string>(RELEASE_RESOURCE_LAYERS);
const authorities = new Set<string>(RELEASE_RESOURCE_AUTHORITIES);
const identities = new Set<string>(RELEASE_IDENTITY_CONTRACTS);
const joins = new Set<string>(RELEASE_JOIN_POLICIES);

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

export function parseReleaseResourceDescriptors(
  value: unknown,
  files: Readonly<Record<string, ReleaseManifestFile>>,
): ReleaseResourceDescriptor[] {
  if (!Array.isArray(value)) throw new Error("resource_descriptors: expected array");
  const allowed = [
    "contract_id", "contract_version", "path", "layer", "authority",
    "identity_contract_id", "completeness_profile", "join_policy_ids",
    "depends_on", "authorizes_occurrence", "authorizes_current_state",
    "authorizes_cross_product", "authorizes_study",
  ];
  const descriptors = value.map((entry, index) => {
    const row = object(entry, `resource_descriptors[${index}]`);
    const extras = Object.keys(row).filter((key) => !allowed.includes(key));
    if (extras.length) throw new Error(`resource_descriptors[${index}]: unexpected ${extras.sort().join(", ")}`);
    for (const key of allowed) {
      if (!(key in row)) throw new Error(`resource_descriptors[${index}].${key}: missing`);
    }
    if (typeof row.contract_id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/u.test(row.contract_id)) {
      throw new Error(`resource_descriptors[${index}].contract_id: invalid`);
    }
    if (!Number.isInteger(row.contract_version) || (row.contract_version as number) < 1) {
      throw new Error(`resource_descriptors[${index}].contract_version: invalid`);
    }
    if (typeof row.path !== "string" || !Object.hasOwn(files, row.path)) {
      throw new Error(`resource_descriptors[${index}].path: not manifest-addressed`);
    }
    if (!layers.has(String(row.layer)) || !authorities.has(String(row.authority))) {
      throw new Error(`resource_descriptors[${index}]: unknown layer or authority`);
    }
    if (!combinations.has(`${String(row.layer)}/${String(row.authority)}`)) {
      throw new Error(`resource_descriptors[${index}]: forbidden layer/authority combination`);
    }
    if (!identities.has(String(row.identity_contract_id))) {
      throw new Error(`resource_descriptors[${index}].identity_contract_id: unknown`);
    }
    if (!["complete", "partial", "not_applicable"].includes(String(row.completeness_profile))) {
      throw new Error(`resource_descriptors[${index}].completeness_profile: invalid`);
    }
    if (!Array.isArray(row.join_policy_ids) || row.join_policy_ids.length < 1 ||
        row.join_policy_ids.some((join) => !joins.has(String(join)))) {
      throw new Error(`resource_descriptors[${index}].join_policy_ids: unknown or empty`);
    }
    if (!Array.isArray(row.depends_on) || row.depends_on.some((dependency) => typeof dependency !== "string")) {
      throw new Error(`resource_descriptors[${index}].depends_on: invalid`);
    }
    for (const key of ["authorizes_occurrence", "authorizes_current_state", "authorizes_cross_product", "authorizes_study"]) {
      if (typeof row[key] !== "boolean") throw new Error(`resource_descriptors[${index}].${key}: expected boolean`);
    }
    if (
      ["documentary", "reconciliation_only", "envelope_only", "quality_only"].includes(String(row.authority)) &&
      [row.authorizes_occurrence, row.authorizes_current_state, row.authorizes_cross_product, row.authorizes_study].some(Boolean)
    ) {
      throw new Error(`resource_descriptors[${index}]: non-authorizing authority grants authority`);
    }
    if (row.authority === "derived_public_projection" && row.authorizes_study === true) {
      throw new Error(`resource_descriptors[${index}]: public projection cannot authorize study`);
    }
    return row as unknown as ReleaseResourceDescriptor;
  });
  const byPath = new Map<string, ReleaseResourceDescriptor>();
  const byId = new Map<string, ReleaseResourceDescriptor>();
  for (const descriptor of descriptors) {
    if (byPath.has(descriptor.path)) throw new Error(`overlapping descriptor ownership: ${descriptor.path}`);
    if (byId.has(descriptor.contract_id)) throw new Error(`duplicate resource descriptor id: ${descriptor.contract_id}`);
    byPath.set(descriptor.path, descriptor);
    byId.set(descriptor.contract_id, descriptor);
  }
  const orphan = Object.keys(files).filter((path) => !byPath.has(path));
  if (orphan.length) throw new Error(`orphan addressed file: ${orphan.sort()[0]}`);
  for (const descriptor of descriptors) {
    for (const dependency of descriptor.depends_on) {
      if (!byId.has(dependency)) throw new Error(`${descriptor.contract_id}: unaddressed dependency ${dependency}`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`resource descriptor dependency cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)!.depends_on) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  const sorted = [...descriptors].sort((a, b) => a.contract_id.localeCompare(b.contract_id));
  if (JSON.stringify(descriptors) !== JSON.stringify(sorted)) {
    throw new Error("resource_descriptors: expected stable contract_id ordering");
  }
  return descriptors;
}

function contractId(path: string): string {
  return `resource-${path.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}`;
}

export function buildReleaseResourceDescriptors(
  files: Readonly<Record<string, ReleaseManifestFile>>,
): ReleaseResourceDescriptor[] {
  return Object.keys(files).map((path): ReleaseResourceDescriptor => {
    const canonical = new Set([
      "sources.jsonl", "entities.jsonl", "projects.jsonl", "corridors.jsonl",
      "routes.jsonl", "treatment_components.jsonl", "events.jsonl",
      "claims.jsonl", "metric_claims.jsonl", "tables.jsonl",
      "source_gaps.jsonl", "relations.jsonl",
    ]).has(path);
    const publicResource = path.startsWith("resolved-pack/public/");
    const envelope = path === "build_receipt.json";
    const reconciliation = /reconciliation|candidate_ledger|cohort|source_observation_ledger/u.test(path);
    const operator = path.startsWith("resolved-pack/operator/");
    const layer = canonical ? "canonical_observation"
      : publicResource ? "resolved_public"
      : envelope ? "release_envelope"
      : operator ? "resolution_operator"
      : "quality_nonauthorizing";
    const authority = canonical ? "documentary"
      : publicResource ? "derived_public_projection"
      : envelope ? "envelope_only"
      : operator && !reconciliation ? "reviewed_resolution"
      : operator ? "reconciliation_only"
      : "quality_only";
    const identity = path.includes("public_intervention_components") ? "public_component_key_v1"
      : path.includes("public_intervention_placements") || path.includes("public_current_footprint") ? "public_placement_key_v1"
      : path.includes("public_routes") ? "public_route_key_v1"
      : path.includes("public_sources") ? "public_source_key_v1"
      : path.includes("public_treatment_families") ? "public_treatment_family_key_v1"
      : path.includes("public_intervention") ? "public_intervention_id_v1"
      : canonical ? "canonical_record_id"
      : "not_applicable";
    return {
      contract_id: contractId(path),
      contract_version: 1,
      path,
      layer,
      authority,
      identity_contract_id: identity,
      completeness_profile: envelope ? "not_applicable" : reconciliation ? "partial" : "complete",
      join_policy_ids: [publicResource ? "public_episode_component_v1" : canonical ? "canonical_record_reference_v1" : "no_join"],
      depends_on: [],
      authorizes_occurrence: authority === "reviewed_resolution" && path.includes("/interventions/"),
      authorizes_current_state: authority === "reviewed_resolution" && (
        path.includes("state_as_of") || path.includes("current_intervention_footprint")
      ),
      authorizes_cross_product: false,
      authorizes_study: false,
    };
  }).sort((a, b) => a.contract_id.localeCompare(b.contract_id));
}
