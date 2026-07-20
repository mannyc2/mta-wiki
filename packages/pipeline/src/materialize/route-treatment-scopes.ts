import { createHash } from "node:crypto";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { OperationalOccurrenceRow } from "./operational-occurrences.js";
import type {
  RouteIdentityRecordBindingV1,
  RouteIdentitySnapshotV1,
} from "./route-identity-contract.js";
import { TREATMENT_ROUTE_DIRECT_RELATION_ALLOWLIST } from "./treatment-semantics.js";

export const ROUTE_TREATMENT_SCOPE_SCHEMA_VERSION = 1 as const;
export const ROUTE_TREATMENT_SCOPE_CONTRACT_ID = "route-treatment-scope-v1" as const;

export type RouteTreatmentScopeEvidenceRole =
  | "direct_relation"
  | "route_identity"
  | "route_scope"
  | "treatment_definition"
  | "treatment_scope";

export type RouteTreatmentScopeEvidenceBinding = {
  role: RouteTreatmentScopeEvidenceRole;
  record_id: string;
  source_id: string;
  evidence_id: string;
};

export type RouteTreatmentScopeRow = {
  schema_version: typeof ROUTE_TREATMENT_SCOPE_SCHEMA_VERSION;
  contract_id: typeof ROUTE_TREATMENT_SCOPE_CONTRACT_ID;
  scope_id: string;
  treatment_record_id: string;
  raw_treatment_kind: string;
  normalized_treatment_family: string | null;
  route_record_id: string;
  route_identity: {
    dataset_id: string;
    source_route_id: string;
    gtfs_route_id: string;
  };
  authorization: {
    kinds: Array<"direct_relation" | "operational_occurrence">;
    relation_record_ids: string[];
    occurrence_ids: string[];
  };
  source_ids: string[];
  evidence_bindings: RouteTreatmentScopeEvidenceBinding[];
};

export type RouteTreatmentScopeReconciliationRow = {
  schema_version: typeof ROUTE_TREATMENT_SCOPE_SCHEMA_VERSION;
  contract_id: typeof ROUTE_TREATMENT_SCOPE_CONTRACT_ID;
  treatment_record_id: string;
  raw_treatment_kind: string;
  source_ids: string[];
  reconciliation_state: "documented_unresolved";
  reason_code: "no_exact_route_treatment_scope" | "route_binding_nonprojectable";
  route_record_ids: string[];
  relation_record_ids: string[];
  project_context_relation_ids: string[];
  evidence_ids: string[];
};

export type RouteTreatmentScopeSummary = {
  schema_version: typeof ROUTE_TREATMENT_SCOPE_SCHEMA_VERSION;
  contract_id: typeof ROUTE_TREATMENT_SCOPE_CONTRACT_ID;
  treatment_record_count: number;
  scoped_treatment_record_count: number;
  unresolved_treatment_record_count: number;
  route_treatment_scope_count: number;
  direct_relation_scope_count: number;
  operational_occurrence_scope_count: number;
  project_treatment_context_relation_count: number;
  project_membership_authorized_scope_count: 0;
  reconciliation_count: number;
  zero_unexplained_loss: boolean;
};

export type RouteTreatmentScopeProjection = {
  scopes: RouteTreatmentScopeRow[];
  reconciliation: RouteTreatmentScopeReconciliationRow[];
  summary: RouteTreatmentScopeSummary;
};

function text(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function evidenceKey(binding: RouteTreatmentScopeEvidenceBinding): string {
  return [binding.role, binding.record_id, binding.source_id, binding.evidence_id].join("\0");
}

function uniqueEvidence(
  values: Iterable<RouteTreatmentScopeEvidenceBinding>,
): RouteTreatmentScopeEvidenceBinding[] {
  return [...new Map([...values].map((value) => [evidenceKey(value), value])).values()].sort(
    (left, right) => evidenceKey(left).localeCompare(evidenceKey(right)),
  );
}

function relationEndpoints(
  relation: MtaCanonicalRecord,
  recordsById: ReadonlyMap<string, MtaCanonicalRecord>,
): { treatment: MtaCanonicalRecord; route: MtaCanonicalRecord } | null {
  if (relation.record_kind !== "relation") return null;
  const subjectId = text(relation.payload.subject_id);
  const objectId = text(relation.payload.object_id);
  if (!subjectId || !objectId) return null;
  const subject = recordsById.get(subjectId);
  const object = recordsById.get(objectId);
  if (subject?.record_kind === "treatment_component" && object?.record_kind === "route") {
    return { treatment: subject, route: object };
  }
  if (object?.record_kind === "treatment_component" && subject?.record_kind === "route") {
    return { treatment: object, route: subject };
  }
  return null;
}

function directRelationAllowed(
  relation: MtaCanonicalRecord,
  endpoints: { treatment: MtaCanonicalRecord; route: MtaCanonicalRecord },
): boolean {
  const subjectId = text(relation.payload.subject_id);
  const subjectKind = subjectId === endpoints.treatment.record_id ? "treatment_component" : "route";
  const objectKind = subjectKind === "treatment_component" ? "route" : "treatment_component";
  return TREATMENT_ROUTE_DIRECT_RELATION_ALLOWLIST.some((entry) =>
    entry.relation_kind === text(relation.payload.relation_kind) &&
    entry.relation_family === text(relation.payload.relation_family) &&
    entry.subject_kind === subjectKind &&
    entry.object_kind === objectKind,
  );
}

function exactBinding(
  binding: RouteIdentityRecordBindingV1 | undefined,
): binding is RouteIdentityRecordBindingV1 & {
  dataset_id: string;
  source_route_id: string;
  gtfs_route_id: string;
} {
  return Boolean(
    binding?.projectable &&
      binding.identity_scope === "exact_service" &&
      binding.dataset_id &&
      binding.source_route_id &&
      binding.gtfs_route_id,
  );
}

function relationEvidence(
  relation: MtaCanonicalRecord,
): RouteTreatmentScopeEvidenceBinding[] {
  return relation.evidence_refs.flatMap((ref) =>
    ref.evidence_id
      ? [{
          role: "direct_relation" as const,
          record_id: relation.record_id,
          source_id: ref.source_id,
          evidence_id: ref.evidence_id,
        }]
      : [],
  );
}

function recordSourceIds(record: MtaCanonicalRecord): string[] {
  return uniqueSorted([
    ...(record.source_id ? [record.source_id] : []),
    ...(record.source_ids ?? []),
    ...record.evidence_refs.map((ref) => ref.source_id),
  ]);
}

function recordEvidenceIds(record: MtaCanonicalRecord): string[] {
  return uniqueSorted(record.evidence_refs.flatMap((ref) => (ref.evidence_id ? [ref.evidence_id] : [])));
}

function rawTreatmentKind(record: MtaCanonicalRecord): string {
  const value = text(record.payload.treatment_kind) ?? text(record.payload.component_kind);
  if (!value) throw new Error(`${record.record_id}: treatment component lacks a raw treatment kind`);
  return value;
}

type ScopeAccumulator = {
  treatment: MtaCanonicalRecord;
  binding: RouteIdentityRecordBindingV1 & {
    dataset_id: string;
    source_route_id: string;
    gtfs_route_id: string;
  };
  kinds: Set<"direct_relation" | "operational_occurrence">;
  relationRecordIds: Set<string>;
  occurrenceIds: Set<string>;
  evidenceBindings: RouteTreatmentScopeEvidenceBinding[];
};

function scopePairKey(treatmentRecordId: string, routeRecordId: string): string {
  return `${treatmentRecordId}\0${routeRecordId}`;
}

function scopeId(treatmentRecordId: string, routeRecordId: string): string {
  const digest = createHash("sha256")
    .update(stableJson([ROUTE_TREATMENT_SCOPE_CONTRACT_ID, treatmentRecordId, routeRecordId]))
    .digest("hex")
    .slice(0, 24);
  return `route-treatment-scope:${digest}`;
}

function occurrenceMembers(row: OperationalOccurrenceRow) {
  return row.treatment.kind === "atomic" ? [row.treatment.member] : row.treatment.members;
}

/**
 * Builds an exact route-treatment projection. Shared project membership is intentionally absent
 * from the authorization inputs: a project may remain route context, but it cannot prove that each
 * treatment attached to that project applies to every project route.
 */
export function buildRouteTreatmentScopeProjection(
  records: readonly MtaCanonicalRecord[],
  routeIdentitySnapshot: RouteIdentitySnapshotV1,
  occurrences: readonly OperationalOccurrenceRow[],
): RouteTreatmentScopeProjection {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  const treatmentRecords = records
    .filter((record) => record.record_kind === "treatment_component")
    .sort((left, right) => left.record_id.localeCompare(right.record_id));
  const treatmentIds = new Set(treatmentRecords.map((record) => record.record_id));
  const bindingsByRouteId = new Map(
    routeIdentitySnapshot.record_bindings.map((binding) => [binding.route_record_id, binding]),
  );
  const scopes = new Map<string, ScopeAccumulator>();
  const rejectedDirectRelations = new Map<
    string,
    { routeRecordIds: Set<string>; relationRecordIds: Set<string>; evidenceIds: Set<string> }
  >();
  const projectContextRelations = new Map<string, Set<string>>();
  let projectTreatmentContextRelationCount = 0;

  const addScope = (input: {
    treatment: MtaCanonicalRecord;
    routeRecordId: string;
    binding: ScopeAccumulator["binding"];
    kind: "direct_relation" | "operational_occurrence";
    relationRecordIds: readonly string[];
    occurrenceId?: string;
    evidenceBindings: readonly RouteTreatmentScopeEvidenceBinding[];
  }) => {
    const key = scopePairKey(input.treatment.record_id, input.routeRecordId);
    const current = scopes.get(key) ?? {
      treatment: input.treatment,
      binding: input.binding,
      kinds: new Set<"direct_relation" | "operational_occurrence">(),
      relationRecordIds: new Set<string>(),
      occurrenceIds: new Set<string>(),
      evidenceBindings: [],
    };
    if (
      current.binding.dataset_id !== input.binding.dataset_id ||
      current.binding.source_route_id !== input.binding.source_route_id ||
      current.binding.gtfs_route_id !== input.binding.gtfs_route_id
    ) {
      throw new Error(`${key}: exact route identity changed across scope authorities`);
    }
    current.kinds.add(input.kind);
    input.relationRecordIds.forEach((recordId) => current.relationRecordIds.add(recordId));
    if (input.occurrenceId) current.occurrenceIds.add(input.occurrenceId);
    current.evidenceBindings.push(...input.evidenceBindings);
    scopes.set(key, current);
  };

  for (const relation of records.filter((record) => record.record_kind === "relation")) {
    const family = text(relation.payload.relation_family);
    const subject = text(relation.payload.subject_id);
    const object = text(relation.payload.object_id);
    const subjectRecord = subject ? recordsById.get(subject) : undefined;
    const objectRecord = object ? recordsById.get(object) : undefined;
    if (
      family === "treatment_context" &&
      ((subjectRecord?.record_kind === "project" && objectRecord?.record_kind === "treatment_component") ||
        (objectRecord?.record_kind === "project" && subjectRecord?.record_kind === "treatment_component"))
    ) {
      const treatment = subjectRecord?.record_kind === "treatment_component" ? subjectRecord : objectRecord!;
      projectTreatmentContextRelationCount += 1;
      const ids = projectContextRelations.get(treatment.record_id) ?? new Set<string>();
      ids.add(relation.record_id);
      projectContextRelations.set(treatment.record_id, ids);
    }

    const endpoints = relationEndpoints(relation, recordsById);
    if (!endpoints || !directRelationAllowed(relation, endpoints)) continue;
    if (relation.truth_status !== "source_stated" || relation.review_state === "quarantined") continue;
    const binding = bindingsByRouteId.get(endpoints.route.record_id);
    if (!exactBinding(binding)) {
      const rejected = rejectedDirectRelations.get(endpoints.treatment.record_id) ?? {
        routeRecordIds: new Set<string>(),
        relationRecordIds: new Set<string>(),
        evidenceIds: new Set<string>(),
      };
      rejected.routeRecordIds.add(endpoints.route.record_id);
      rejected.relationRecordIds.add(relation.record_id);
      recordEvidenceIds(relation).forEach((id) => rejected.evidenceIds.add(id));
      rejectedDirectRelations.set(endpoints.treatment.record_id, rejected);
      continue;
    }
    const evidence = relationEvidence(relation);
    if (evidence.length === 0) {
      throw new Error(`${relation.record_id}: direct route-treatment scope requires evidence`);
    }
    addScope({
      treatment: endpoints.treatment,
      routeRecordId: endpoints.route.record_id,
      binding,
      kind: "direct_relation",
      relationRecordIds: [relation.record_id],
      evidenceBindings: evidence,
    });
  }

  for (const occurrence of occurrences) {
    if (occurrence.routes.length > 1 && occurrence.treatment.kind === "bundle") {
      throw new Error(
        `${occurrence.occurrence_id}: multi-route bundles require an explicit route/member pair contract before scope projection`,
      );
    }
    for (const route of occurrence.routes) {
      const binding = bindingsByRouteId.get(route.route_record_id);
      if (!exactBinding(binding) || binding.gtfs_route_id !== route.gtfs_route_id) {
        throw new Error(
          `${occurrence.occurrence_id}: occurrence route ${route.route_record_id}/${route.gtfs_route_id} lacks exact projectable identity parity`,
        );
      }
      for (const member of occurrenceMembers(occurrence)) {
        const treatment = recordsById.get(member.treatment_record_id);
        if (!treatment || treatment.record_kind !== "treatment_component") {
          throw new Error(
            `${occurrence.occurrence_id}: occurrence treatment ${member.treatment_record_id} is not canonical`,
          );
        }
        const evidence = uniqueEvidence([
          ...route.evidence_bindings.flatMap((item) =>
            item.role === "route_identity" || item.role === "route_scope"
              ? [{ ...item, role: item.role } as RouteTreatmentScopeEvidenceBinding]
              : [],
          ),
          ...member.evidence_bindings.flatMap((item) =>
            item.role === "treatment_definition" || item.role === "treatment_scope"
              ? [{ ...item, role: item.role } as RouteTreatmentScopeEvidenceBinding]
              : [],
          ),
        ]);
        if (evidence.length === 0) {
          throw new Error(`${occurrence.occurrence_id}: route-treatment member pair lost evidence`);
        }
        addScope({
          treatment,
          routeRecordId: route.route_record_id,
          binding,
          kind: "operational_occurrence",
          relationRecordIds: occurrence.provenance.relation_record_ids,
          occurrenceId: occurrence.occurrence_id,
          evidenceBindings: evidence,
        });
      }
    }
  }

  const scopeRows = [...scopes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, scope]) => {
      const routeRecordId = key.slice(key.indexOf("\0") + 1);
      const evidenceBindings = uniqueEvidence(scope.evidenceBindings);
      return {
        schema_version: ROUTE_TREATMENT_SCOPE_SCHEMA_VERSION,
        contract_id: ROUTE_TREATMENT_SCOPE_CONTRACT_ID,
        scope_id: scopeId(scope.treatment.record_id, routeRecordId),
        treatment_record_id: scope.treatment.record_id,
        raw_treatment_kind: rawTreatmentKind(scope.treatment),
        normalized_treatment_family: text(scope.treatment.payload.treatment_family),
        route_record_id: routeRecordId,
        route_identity: {
          dataset_id: scope.binding.dataset_id,
          source_route_id: scope.binding.source_route_id,
          gtfs_route_id: scope.binding.gtfs_route_id,
        },
        authorization: {
          kinds: [...scope.kinds].sort(),
          relation_record_ids: uniqueSorted(scope.relationRecordIds),
          occurrence_ids: uniqueSorted(scope.occurrenceIds),
        },
        source_ids: uniqueSorted(evidenceBindings.map((binding) => binding.source_id)),
        evidence_bindings: evidenceBindings,
      } satisfies RouteTreatmentScopeRow;
    });

  const scopedTreatmentIds = new Set(scopeRows.map((row) => row.treatment_record_id));
  const reconciliation = treatmentRecords.flatMap((treatment) => {
    const rejected = rejectedDirectRelations.get(treatment.record_id);
    if (scopedTreatmentIds.has(treatment.record_id) && !rejected) return [];
    const projectRelations = uniqueSorted(projectContextRelations.get(treatment.record_id) ?? []);
    const sourceIds = recordSourceIds(treatment);
    const evidenceIds = new Set(recordEvidenceIds(treatment));
    rejected?.evidenceIds.forEach((id) => evidenceIds.add(id));
    return [{
      schema_version: ROUTE_TREATMENT_SCOPE_SCHEMA_VERSION,
      contract_id: ROUTE_TREATMENT_SCOPE_CONTRACT_ID,
      treatment_record_id: treatment.record_id,
      raw_treatment_kind: rawTreatmentKind(treatment),
      source_ids: sourceIds,
      reconciliation_state: "documented_unresolved" as const,
      reason_code: rejected ? "route_binding_nonprojectable" as const : "no_exact_route_treatment_scope" as const,
      route_record_ids: uniqueSorted(rejected?.routeRecordIds ?? []),
      relation_record_ids: uniqueSorted(rejected?.relationRecordIds ?? []),
      project_context_relation_ids: projectRelations,
      evidence_ids: uniqueSorted(evidenceIds),
    } satisfies RouteTreatmentScopeReconciliationRow];
  });

  const fullyScopedTreatmentIds = new Set(
    treatmentRecords
      .map((record) => record.record_id)
      .filter((recordId) => scopedTreatmentIds.has(recordId) && !rejectedDirectRelations.has(recordId)),
  );
  const summary: RouteTreatmentScopeSummary = {
    schema_version: ROUTE_TREATMENT_SCOPE_SCHEMA_VERSION,
    contract_id: ROUTE_TREATMENT_SCOPE_CONTRACT_ID,
    treatment_record_count: treatmentRecords.length,
    scoped_treatment_record_count: fullyScopedTreatmentIds.size,
    unresolved_treatment_record_count: treatmentRecords.length - fullyScopedTreatmentIds.size,
    route_treatment_scope_count: scopeRows.length,
    direct_relation_scope_count: scopeRows.filter((row) => row.authorization.kinds.includes("direct_relation")).length,
    operational_occurrence_scope_count: scopeRows.filter((row) => row.authorization.kinds.includes("operational_occurrence")).length,
    project_treatment_context_relation_count: projectTreatmentContextRelationCount,
    project_membership_authorized_scope_count: 0,
    reconciliation_count: reconciliation.length,
    zero_unexplained_loss:
      fullyScopedTreatmentIds.size + reconciliation.length === treatmentRecords.length,
  };
  if (!summary.zero_unexplained_loss) {
    throw new Error("route-treatment scope projection failed zero-loss reconciliation");
  }
  if ([...scopedTreatmentIds].some((recordId) => !treatmentIds.has(recordId))) {
    throw new Error("route-treatment scope projection contains an unknown treatment record");
  }
  return { scopes: scopeRows, reconciliation, summary };
}

export function routeTreatmentScopesJsonl(rows: readonly RouteTreatmentScopeRow[]): string {
  return rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n") + (rows.length ? "\n" : "");
}

export function routeTreatmentScopeReconciliationJsonl(
  rows: readonly RouteTreatmentScopeReconciliationRow[],
): string {
  return rows.map((row) => stableJson(row as unknown as JsonValue)).join("\n") + (rows.length ? "\n" : "");
}

export function routeTreatmentScopeSummaryJson(summary: RouteTreatmentScopeSummary): string {
  return `${stableJson(summary as unknown as JsonValue)}\n`;
}
