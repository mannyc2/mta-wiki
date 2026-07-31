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
import { readCanonicalRecords } from "../packages/pipeline/src/materialize/canonical-read";
import { parseOperationalEpisodeAcceptedMapping } from "../packages/pipeline/src/materialize/operational-episode-adapters";
import { deterministicOperationalOccurrenceId } from "../packages/pipeline/src/materialize/operational-occurrence-identity";
import {
  loadOperationalOccurrenceIdentityOperations,
  operationalOccurrenceIdentityRegistryV2Jsonl,
  parseOperationalOccurrenceIdentityOperation,
  replayOperationalOccurrenceIdentityOperations,
  type OperationalOccurrenceIdentityOperation,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity-operations";
import {
  operationalOccurrenceCurrentReviewMembershipFingerprint,
  parseOperationalOccurrenceAcceptedDecisionV3,
  type OperationalOccurrenceAcceptedDecisionV3,
} from "../packages/pipeline/src/materialize/operational-occurrence-resolution";
import type { OperationalOccurrenceReviewV1EvidenceBinding } from "../packages/pipeline/src/materialize/operational-occurrence-review";
import { resolvedInterventionDurableApplicationIdentity } from "../packages/pipeline/src/materialize/resolved-intervention-applications";

type FrozenCandidate = {
  candidate_id: string;
  candidate_key: string;
  disposition: string;
  evidence_bindings: Array<{
    record_id: string;
    source_id: string;
    evidence_id: string;
  }>;
  observation_event_record_ids: string[];
  observation_relation_record_ids: string[];
};
type ApplicationSpec = {
  route_record_id: string;
  gtfs_route_id: string;
  route_evidence_id: string;
  treatment_record_id: string;
  treatment_evidence_id: string;
};
type PositiveSpec = {
  batch_id: string;
  candidate_id: string;
  event_id: string;
  event_evidence_id: string;
  onset: {
    date: string;
    precision: "day" | "month" | "season";
  };
  applications: ApplicationSpec[];
  rationale: string;
};
type AliasSpec = {
  batch_id: string;
  candidate_id: string;
  canonical_candidate_id: string;
  rationale: string;
};

const campaign = "data/operational-episode-resolution/campaigns/plan-052";
const frozenCandidatesRelative = `${campaign}/frozen-frontier/candidate_ledger.jsonl`;
const reviewDir = "data/operational-occurrence-review/accepted-current/decisions";
const terminalDecisionDir =
  "data/operational-episode-resolution/decisions/accepted-current";
const mappingDir =
  "data/operational-episode-resolution/adapters/accepted-current";
const identityMigrationDir =
  "data/operational-occurrence-identities/operations";
const identityAcceptedDir =
  "data/operational-occurrence-identities/accepted-current/operations";
const identityReceiptDir =
  "data/operational-occurrence-identities/accepted-current/receipts";
const identityCurrentRegistry =
  "data/operational-occurrence-identities/registry-current.jsonl";
const acceptedAt = "2026-07-30T19:00:00.000Z";
const integrationReceiptRelative =
  `${campaign}/integration-receipts/reviewed-positive-heads-v1.json`;
const reconciliationReceiptRelative =
  `${campaign}/reconciliation-receipts/reviewed-positive-heads-v1.json`;

const positives: PositiveSpec[] = [
  {
    batch_id: "w2-bus-priority-pending-01",
    candidate_id: "candidate:224b78d76ee4b98eba139b0f",
    event_id: "event_m60-sbs-launch-2014-05-25_2",
    event_evidence_id: "2015_01_08_brt_125th_cb9#p008_c0002",
    onset: { date: "2014-05-25", precision: "day" },
    applications: [{
      route_record_id: "route_125th-laguardia-sbs",
      gtfs_route_id: "M60+",
      route_evidence_id: "brt_route_index#p001_b0001",
      treatment_record_id: "treatment_125th-features",
      treatment_evidence_id: "brt_route_index#p001_b0001",
    }],
    rationale:
      "Primary and independent review select this already-owned M60 canonical head. Exact canonical evidence proves the M60 SBS route and aggregate feature package, while the candidate evidence proves the May 25, 2014 launch. Incoming duplicate aliases remain stable and no component-level onset is inferred.",
  },
  {
    batch_id: "w2-bus-priority-pending-01",
    candidate_id: "candidate:225c1d8841c8ff1c951b9c68",
    event_id: "event_utica-bus-priority-improvements-aug2014",
    event_evidence_id: "2014_11_brt_utica_workshopsummary#p003_c0002",
    onset: { date: "2014-08", precision: "month" },
    applications: [{
      route_record_id: "route_b46-local-2012",
      gtfs_route_id: "B46",
      route_evidence_id: "2014_11_brt_utica_workshopsummary#p003_c0002",
      treatment_record_id: "treatment_bus-lanes-utica-2014",
      treatment_evidence_id: "2014_11_brt_utica_workshopsummary#p003_c0002",
    }],
    rationale:
      "The common primary/independent incidence is exactly B46 local × the August 2014 Utica bus-lane component. The single shared evidence block proves route, treatment, bounded project context, and month; left-turn and loading-zone treatments are not inferred.",
  },
  {
    batch_id: "w2-bus-priority-pending-02",
    candidate_id: "candidate:374fb39566efdd50f59642e3",
    event_id: "event_m79-sbs-launch-may2017",
    event_evidence_id: "brt_m79_cb7_nov2018#p004_c0001",
    onset: { date: "2017-05", precision: "month" },
    applications: [{
      route_record_id: "route_m79-sbs",
      gtfs_route_id: "M79+",
      route_evidence_id: "brt_m79_cb7_nov2018#p001_c0001",
      treatment_record_id: "treatment_off-board-fare-collection-m79",
      treatment_evidence_id: "brt_m79_cb7_nov2018#p004_c0002",
    }],
    rationale:
      "The accepted alias graph already selects this retrospective M79 launch observation as the canonical head. Its own pinned source proves May 2017 and exactly joins M79 SBS to off-board fare collection; day precision from an alias is not silently substituted.",
  },
  {
    batch_id: "w2-bus-priority-pending-02",
    candidate_id: "candidate:443c8f021b1a09d7a1046587",
    event_id: "event_fare-prepayment-begins-nov13-2011",
    event_evidence_id: "201110_brt_34th_open_house_slides#p036_c0002",
    onset: { date: "2011-11-13", precision: "day" },
    applications: [
      {
        route_record_id: "route_m34-sbs",
        gtfs_route_id: "M34+",
        route_evidence_id: "201110_brt_34th_open_house_slides#p028_c0002",
        treatment_record_id: "treatment_off-board-fare-collection-34th",
        treatment_evidence_id: "201110_brt_34th_open_house_slides#p005_c0002",
      },
      {
        route_record_id: "route_m34a-sbs",
        gtfs_route_id: "M34A+",
        route_evidence_id: "201110_brt_34th_open_house_slides#p028_c0002",
        treatment_record_id: "treatment_off-board-fare-collection-34th",
        treatment_evidence_id: "201110_brt_34th_open_house_slides#p005_c0002",
      },
    ],
    rationale:
      "All three reviews prove November 13 fare prepayment on exactly M34 and M34A. The two explicit applications preserve the source incidence and do not fan out any other 34th Street treatment.",
  },
  {
    batch_id: "w2-bus-priority-pending-02",
    candidate_id: "candidate:4dee197d1c666bdcd24f77f3",
    event_id: "event_first-second-ave-sbs-start",
    event_evidence_id: "brt_route_index#p001_b0001",
    onset: { date: "2010-10", precision: "month" },
    applications: [{
      route_record_id: "route_m15-sbs",
      gtfs_route_id: "M15+",
      route_evidence_id: "brt_route_index#p001_b0001",
      treatment_record_id: "treatment_first-second-ave-bus-lanes",
      treatment_evidence_id: "brt_route_index#p001_b0001",
    }],
    rationale:
      "All three reviews prove one M15 SBS route and its canonical combined First/Second Avenue bus-lane component at the October 2010 start. The combined component is not split into invented sub-applications.",
  },
  {
    batch_id: "w2-bus-priority-pending-02",
    candidate_id: "candidate:6598e41cd21efb8735aa3f39",
    event_id: "event_b44-sbs-launch-2013",
    event_evidence_id: "brt_nostrand_progress_report_june2016#p023_c0003",
    onset: { date: "2013-11-17", precision: "day" },
    applications: [{
      route_record_id: "route_b44-sbs",
      gtfs_route_id: "B44+",
      route_evidence_id: "brt_nostrand_progress_report_june2016#p005_c0004",
      treatment_record_id: "treatment_bus-lanes-b44-sbs-2016",
      treatment_evidence_id: "brt_nostrand_progress_report_june2016#p018_c0005",
    }],
    rationale:
      "All three reviews prove the November 17, 2013 B44 SBS launch and exactly one delivered 9.6-mile bus-lane application. Other project treatments are not inferred.",
  },
];

const aliases: AliasSpec[] = [{
  batch_id: "w2-bus-priority-pending-02",
  candidate_id: "candidate:5d6fe616d005014e4feb5061",
  canonical_candidate_id: "candidate:224b78d76ee4b98eba139b0f",
  rationale:
    "Cross-batch reconciliation proves the route-index M60 launch is the same May 25, 2014 route × feature-package occurrence as the already-owned Bus-01 canonical head. Publishing both would create duplicate producer identities, so this observation is terminally accounted for as an alias without changing the selected head.",
}];

function absolute(relativePath: string): string {
  return join(repoRoot, relativePath);
}
function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}
function pointer(relativePath: string): { path: string; sha256: string } {
  return { path: relativePath, sha256: sha256(readFileSync(absolute(relativePath))) };
}
function readJsonl<T>(relativePath: string): T[] {
  return readFileSync(absolute(relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
function binding(
  records: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
  evidenceId: string,
  role: OperationalOccurrenceReviewV1EvidenceBinding["role"],
): OperationalOccurrenceReviewV1EvidenceBinding {
  const record = records.get(recordId);
  const refs = record?.evidence_refs.filter((ref) => ref.evidence_id === evidenceId) ?? [];
  const sources = [...new Set(refs.map((ref) => ref.source_id))];
  if (
    !record ||
    record.truth_status !== "source_stated" ||
    record.review_state === "quarantined" ||
    refs.length === 0 ||
    sources.length !== 1
  ) {
    throw new Error(`${recordId} lacks exact eligible evidence ${evidenceId}`);
  }
  return { role, record_id: recordId, source_id: sources[0]!, evidence_id: evidenceId };
}
function uniqueBindings(
  values: readonly OperationalOccurrenceReviewV1EvidenceBinding[],
): OperationalOccurrenceReviewV1EvidenceBinding[] {
  return [...new Map(values.map((value) => [
    [value.role, value.record_id, value.source_id, value.evidence_id].join("|"),
    value,
  ])).values()].sort((left, right) =>
    [left.role, left.record_id, left.source_id, left.evidence_id].join("|")
      .localeCompare([right.role, right.record_id, right.source_id, right.evidence_id].join("|"))
  );
}
function plainEvidence(
  values: readonly OperationalOccurrenceReviewV1EvidenceBinding[],
): Array<{ record_id: string; source_id: string; evidence_id: string }> {
  return [...new Map(values.map((value) => [
    [value.record_id, value.source_id, value.evidence_id].join("|"),
    {
      record_id: value.record_id,
      source_id: value.source_id,
      evidence_id: value.evidence_id,
    },
  ])).values()].sort((left, right) =>
    [left.record_id, left.source_id, left.evidence_id].join("|")
      .localeCompare([right.record_id, right.source_id, right.evidence_id].join("|"))
  );
}
function authoritiesFor(batchId: string): Array<{ path: string; sha256: string }> {
  const base = `${campaign}/proposed-review-receipts/${batchId}`;
  const adjudication = batchId === "w2-bus-priority-pending-01"
    ? `${base}/alias-head-adjudication-independent.json`
    : `${base}/adjudication-independent.json`;
  return [
    pointer(`${campaign}/batches/${batchId}.json`),
    pointer(`${base}/primary.json`),
    pointer(`${base}/independent.json`),
    pointer(adjudication),
  ];
}
function decisionFor(
  spec: PositiveSpec,
  frozen: FrozenCandidate,
  records: ReadonlyMap<string, MtaCanonicalRecord>,
): OperationalOccurrenceAcceptedDecisionV3 {
  const occurrenceId = deterministicOperationalOccurrenceId(frozen.candidate_key);
  const onsetBinding = binding(records, spec.event_id, spec.event_evidence_id, "event_date");
  const routeRows = [...new Map(spec.applications.map((application) => [
    application.route_record_id,
    application,
  ])).values()].map((application) => ({
    route_record_id: application.route_record_id,
    gtfs_route_id: application.gtfs_route_id,
    evidence_bindings: [
      binding(records, application.route_record_id, application.route_evidence_id, "route_identity"),
    ],
  })).sort((left, right) => left.route_record_id.localeCompare(right.route_record_id));
  const treatmentRows = [...new Map(spec.applications.map((application) => [
    application.treatment_record_id,
    application,
  ])).values()].map((application) => {
    const record = records.get(application.treatment_record_id);
    const family = record?.payload.treatment_family;
    if (typeof family !== "string" || !family) {
      throw new Error(`${application.treatment_record_id} lacks treatment_family`);
    }
    return {
      treatment_record_id: application.treatment_record_id,
      treatment_family: family,
      evidence_bindings: [
        binding(
          records,
          application.treatment_record_id,
          application.treatment_evidence_id,
          "treatment_definition",
        ),
      ],
    };
  }).sort((left, right) => left.treatment_record_id.localeCompare(right.treatment_record_id));
  const routeById = new Map(routeRows.map((row) => [row.route_record_id, row]));
  const treatmentById = new Map(treatmentRows.map((row) => [row.treatment_record_id, row]));
  const applications = spec.applications.map((application) => {
    const evidence = uniqueBindings([
      onsetBinding,
      ...routeById.get(application.route_record_id)!.evidence_bindings,
      ...treatmentById.get(application.treatment_record_id)!.evidence_bindings,
    ]);
    return {
      application_id: resolvedInterventionDurableApplicationIdentity({
        occurrence_id: occurrenceId,
        route_record_id: application.route_record_id,
        treatment_record_id: application.treatment_record_id,
        phase_record_id: spec.event_id,
      }),
      route_record_id: application.route_record_id,
      gtfs_route_id: application.gtfs_route_id,
      treatment_record_id: application.treatment_record_id,
      phase_record_id: spec.event_id,
      action: "unknown" as const,
      physical_scope_record_ids: [],
      extent: { kind: "unknown" as const, record_ids: [], description: null },
      evidence_bindings: evidence,
    };
  }).sort((left, right) =>
    [left.route_record_id, left.treatment_record_id, left.phase_record_id].join("|")
      .localeCompare([right.route_record_id, right.treatment_record_id, right.phase_record_id].join("|"))
  );
  const incidence = applications.map((row) =>
    [row.route_record_id, row.treatment_record_id, row.phase_record_id].join("|")
  );
  if (new Set(incidence).size !== incidence.length || incidence.length === 0) {
    throw new Error(`${spec.candidate_id} has invalid explicit incidence`);
  }
  const allEvidence = uniqueBindings([
    onsetBinding,
    ...routeRows.flatMap((row) => row.evidence_bindings),
    ...treatmentRows.flatMap((row) => row.evidence_bindings),
  ]);
  const withoutFingerprint = {
    schema_version: 3 as const,
    decision_id: `plan-052-reviewed-head-${spec.candidate_id.replace("candidate:", "")}`,
    review_state: "approved" as const,
    occurrence_id: occurrenceId,
    founding_key: frozen.candidate_key,
    anchor_review_decision_ids: [],
    observation_event_record_ids: frozen.observation_event_record_ids,
    observation_relation_record_ids: [...frozen.observation_relation_record_ids].sort(),
    resolution_cluster_id: null,
    phase_record_ids: [spec.event_id],
    phase_relation_record_ids: [],
    physical_scope_record_ids: [],
    physical_scope_relation_record_ids: [],
    resolved_onset: { ...spec.onset, evidence_bindings: [onsetBinding] },
    routes: routeRows,
    treatment: treatmentRows.length === 1
      ? { kind: "atomic" as const, member: treatmentRows[0]! }
      : {
          kind: "bundle" as const,
          bundle_family: null,
          bundle_family_evidence_bindings: [],
          members: treatmentRows,
        },
    applications,
    evidence_bindings: allEvidence,
    reviewers: [
      `plan-052-${spec.batch_id}-primary-reviewer`,
      `plan-052-${spec.batch_id}-independent-reviewer`,
      "plan-052-blind-adjudicator",
      "plan-052-single-frontier-integrator",
    ],
    accepted_at: acceptedAt,
    rationale: spec.rationale,
    operation: "establish_current_resolution" as const,
    supersedes_decision_id: null,
    supersedes_membership_fingerprint: null,
    review_scope: "full_episode_application" as const,
  };
  return parseOperationalOccurrenceAcceptedDecisionV3({
    ...withoutFingerprint,
    membership_fingerprint:
      operationalOccurrenceCurrentReviewMembershipFingerprint(withoutFingerprint),
  });
}
function operationFor(
  frozen: FrozenCandidate,
  decision: OperationalOccurrenceAcceptedDecisionV3,
  index: number,
): OperationalOccurrenceIdentityOperation {
  return parseOperationalOccurrenceIdentityOperation({
    schema_version: 1,
    operation_id: `establish:${decision.occurrence_id}`,
    kind: "establish",
    issued_at: `2026-07-30T18:59:${String(index).padStart(2, "0")}.000Z`,
    reviewer: "plan-052-reviewed-positive-head-board",
    decision_id: decision.decision_id,
    rationale: decision.rationale,
    affected_founding_event_record_ids: frozen.observation_event_record_ids,
    occurrence_id: decision.occurrence_id,
    founding_key: frozen.candidate_key,
    founding_event_record_ids: frozen.observation_event_record_ids,
    resolution_cluster_id: null,
  });
}
function expectedFiles(): Map<string, string> {
  const frozenRows = readJsonl<FrozenCandidate>(frozenCandidatesRelative);
  const frozenById = new Map(frozenRows.map((row) => [row.candidate_id, row]));
  const records = new Map(readCanonicalRecords().map((record) => [record.record_id, record]));
  const files = new Map<string, string>();
  const decisions = positives.map((spec) => {
    const frozen = frozenById.get(spec.candidate_id);
    if (
      !frozen ||
      frozen.disposition !== "pending_review" ||
      frozen.observation_event_record_ids.length !== 1 ||
      frozen.observation_event_record_ids[0] !== spec.event_id
    ) {
      throw new Error(`${spec.candidate_id} frozen membership drifted`);
    }
    return decisionFor(spec, frozen, records);
  });
  const operations = positives.map((spec, index) =>
    operationFor(frozenById.get(spec.candidate_id)!, decisions[index]!, index)
  );
  for (const [index, spec] of positives.entries()) {
    const frozen = frozenById.get(spec.candidate_id)!;
    const decision = decisions[index]!;
    const operation = operations[index]!;
    const mapping = parseOperationalEpisodeAcceptedMapping({
      schema_version: 1,
      mapping_id: `mapping:${decision.occurrence_id}`,
      adapter_id: "accepted_mapping_v1",
      observation_event_record_ids: frozen.observation_event_record_ids,
      observation_relation_record_ids: frozen.observation_relation_record_ids,
      candidate_keys: [frozen.candidate_key],
      occurrence_id: decision.occurrence_id,
      evidence_bindings: plainEvidence(decision.evidence_bindings),
      decision_id: decision.decision_id,
      reviewer: "plan-052-reviewed-positive-head-board",
      reviewed_at: acceptedAt,
      rationale: spec.rationale,
    });
    files.set(`${reviewDir}/${decision.decision_id}.json`, json(decision));
    files.set(`${mappingDir}/${mapping.mapping_id}.json`, json(mapping));
    files.set(`${identityAcceptedDir}/${operation.operation_id}.json`, json(operation));
  }
  for (const spec of aliases) {
    const frozen = frozenById.get(spec.candidate_id);
    const target = frozenById.get(spec.canonical_candidate_id);
    if (!frozen || !target || frozen.disposition !== "pending_review") {
      throw new Error(`${spec.candidate_id} alias membership drifted`);
    }
    const suffix = spec.candidate_id.replace("candidate:", "");
    const decisionId = `plan-052-reviewed-head-alias-${suffix}`;
    files.set(`${terminalDecisionDir}/${decisionId}.json`, json({
      schema_version: 1,
      decision_id: decisionId,
      candidate_key: frozen.candidate_key,
      disposition: "duplicate_alias",
      canonical_candidate_key: target.candidate_key,
      successor_occurrence_ids: [],
      reviewer: "plan-052-reviewed-positive-head-board",
      decided_at: acceptedAt,
      rationale: spec.rationale,
      evidence_bindings: frozen.evidence_bindings,
    }));
    files.set(`${mappingDir}/plan-052-reviewed-head-alias-mapping-${suffix}.json`, json({
      schema_version: 1,
      mapping_id: `plan-052-reviewed-head-alias-mapping-${suffix}`,
      adapter_id: "accepted_mapping_v1",
      observation_event_record_ids: frozen.observation_event_record_ids,
      observation_relation_record_ids: frozen.observation_relation_record_ids,
      candidate_keys: [frozen.candidate_key],
      occurrence_id: null,
      evidence_bindings: frozen.evidence_bindings,
      decision_id: decisionId,
      reviewer: "plan-052-single-frontier-integrator",
      reviewed_at: acceptedAt,
      rationale: spec.rationale,
    }));
  }
  const migration = loadOperationalOccurrenceIdentityOperations(absolute(identityMigrationDir));
  const existingAccepted = existsSync(absolute(identityAcceptedDir))
    ? loadOperationalOccurrenceIdentityOperations(absolute(identityAcceptedDir))
    : [];
  const managedIds = new Set(operations.map((operation) => operation.operation_id));
  const ordered = [
    ...existingAccepted.filter((operation) => !managedIds.has(operation.operation_id)),
    ...operations,
  ].sort((left, right) =>
    left.issued_at.localeCompare(right.issued_at) ||
    left.operation_id.localeCompare(right.operation_id)
  );
  let priorRegistry = operationalOccurrenceIdentityRegistryV2Jsonl(
    replayOperationalOccurrenceIdentityOperations(migration),
  );
  const applied: OperationalOccurrenceIdentityOperation[] = [];
  for (const operation of ordered) {
    applied.push(operation);
    const resultRegistry = operationalOccurrenceIdentityRegistryV2Jsonl(
      replayOperationalOccurrenceIdentityOperations([...migration, ...applied]),
    );
    if (managedIds.has(operation.operation_id)) {
      const decision = decisions.find((row) => row.decision_id === operation.decision_id)!;
      const operationRelative = `${identityAcceptedDir}/${operation.operation_id}.json`;
      const operationBytes =
        files.get(operationRelative) ?? readFileSync(absolute(operationRelative), "utf8");
      files.set(`${identityReceiptDir}/${operation.operation_id}.json`, json({
        schema_version: 1,
        operation_id: operation.operation_id,
        batch_id: positives.find((row) =>
          deterministicOperationalOccurrenceId(
            frozenById.get(row.candidate_id)!.candidate_key,
          ) === operation.occurrence_id
        )!.batch_id,
        batch_manifest_path:
          `${campaign}/batches/${positives.find((row) =>
            deterministicOperationalOccurrenceId(
              frozenById.get(row.candidate_id)!.candidate_key,
            ) === operation.occurrence_id
          )!.batch_id}.json`,
        batch_manifest_sha256: pointer(
          `${campaign}/batches/${positives.find((row) =>
            deterministicOperationalOccurrenceId(
              frozenById.get(row.candidate_id)!.candidate_key,
            ) === operation.occurrence_id
          )!.batch_id}.json`,
        ).sha256,
        primary_reviewer: "plan-052-batch-primary-reviewer",
        independent_reviewer: "plan-052-batch-independent-reviewer",
        evidence_bindings: plainEvidence(decision.evidence_bindings),
        basis_registry_sha256: sha256(priorRegistry),
        operation_sha256: sha256(operationBytes),
        result_registry_sha256: sha256(resultRegistry),
      }));
    }
    priorRegistry = resultRegistry;
  }
  files.set(identityCurrentRegistry, priorRegistry);
  const authorityBatches = [...new Set([
    ...positives.map((row) => row.batch_id),
    ...aliases.map((row) => row.batch_id),
  ])].sort();
  const authorities = authorityBatches.flatMap(authoritiesFor);
  const positiveArtifacts = positives.map((spec, index) => {
    const decision = decisions[index]!;
    const operation = operations[index]!;
    return {
      batch_id: spec.batch_id,
      candidate_id: spec.candidate_id,
      occurrence_id: decision.occurrence_id,
      review_decision: pointerFromFiles(
        `${reviewDir}/${decision.decision_id}.json`,
        files,
      ),
      identity_operation: pointerFromFiles(
        `${identityAcceptedDir}/${operation.operation_id}.json`,
        files,
      ),
      identity_receipt: pointerFromFiles(
        `${identityReceiptDir}/${operation.operation_id}.json`,
        files,
      ),
      mapping: pointerFromFiles(
        `${mappingDir}/mapping:${decision.occurrence_id}.json`,
        files,
      ),
      exact_application_incidence: decision.applications.map((application) =>
        [
          application.route_record_id,
          application.gtfs_route_id,
          application.treatment_record_id,
          application.phase_record_id,
        ].join("|")
      ),
      reviewed_action_extent_deferred_to_plan053:
        decision.applications.every((application) =>
          application.action === "unknown" && application.extent.kind === "unknown"
        ),
    };
  });
  const aliasArtifacts = aliases.map((spec) => {
    const suffix = spec.candidate_id.replace("candidate:", "");
    return {
      batch_id: spec.batch_id,
      candidate_id: spec.candidate_id,
      canonical_candidate_id: spec.canonical_candidate_id,
      decision: pointerFromFiles(
        `${terminalDecisionDir}/plan-052-reviewed-head-alias-${suffix}.json`,
        files,
      ),
      mapping: pointerFromFiles(
        `${mappingDir}/plan-052-reviewed-head-alias-mapping-${suffix}.json`,
        files,
      ),
    };
  });
  const integrationBytes = json({
    schema_version: 1,
    contract_id: "plan-052-reviewed-positive-head-integration-v1",
    plan_id: "plan-052",
    integrated_at: acceptedAt,
    integrator: "plan-052-single-frontier-integrator",
    authorities,
    positive_artifacts: positiveArtifacts,
    alias_artifacts: aliasArtifacts,
    exact_arithmetic: {
      published_candidates: positiveArtifacts.length,
      duplicate_alias_candidates: aliasArtifacts.length,
      accounted_candidates: positiveArtifacts.length + aliasArtifacts.length,
      accounted_observations:
        positives.reduce((sum, spec) =>
          sum + frozenById.get(spec.candidate_id)!.observation_event_record_ids.length, 0) +
        aliases.reduce((sum, spec) =>
          sum + frozenById.get(spec.candidate_id)!.observation_event_record_ids.length, 0),
      application_count: positiveArtifacts.reduce(
        (sum, artifact) => sum + artifact.exact_application_incidence.length,
        0,
      ),
    },
    historical_migration_files_changed: false,
    canonical_observations_changed: false,
    publication_or_release_authorized: false,
    provider_usage: {
      request_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      actual_cost_usd: 0,
    },
  });
  files.set(integrationReceiptRelative, integrationBytes);
  files.set(reconciliationReceiptRelative, json({
    schema_version: 1,
    contract_id: "plan-052-reviewed-positive-head-reconciliation-v1",
    plan_id: "plan-052",
    reconciled_at: acceptedAt,
    reconciler: "plan-052-single-frontier-integrator",
    authorities,
    canonical_head_rules: [
      "Preserve an already-selected canonical head when accepted aliases point to it.",
      "Do not publish a second candidate for the same exact route, treatment package, and onset.",
      "Publish only explicit route × treatment × phase incidence; never synthesize a plural cross-product.",
      "Defer action and extent semantics beyond incidence to Plan 053.",
    ],
    positive_candidate_ids: positives.map((row) => row.candidate_id).sort(),
    duplicate_aliases: aliases.map((row) => ({
      candidate_id: row.candidate_id,
      canonical_candidate_id: row.canonical_candidate_id,
      rationale: row.rationale,
    })),
    integration_receipt: {
      path: integrationReceiptRelative,
      sha256: sha256(integrationBytes),
    },
  }));
  return files;
}
function pointerFromFiles(
  relativePath: string,
  files: ReadonlyMap<string, string>,
): { path: string; sha256: string } {
  const bytes = files.get(relativePath);
  if (bytes === undefined) throw new Error(`missing generated ${relativePath}`);
  return { path: relativePath, sha256: sha256(bytes) };
}
function writeOrCheck(mode: "--write" | "--check", files: ReadonlyMap<string, string>): void {
  if (mode === "--write") {
    const collisions = [...files.keys()].filter((relativePath) =>
      relativePath !== identityCurrentRegistry && existsSync(absolute(relativePath))
    );
    if (collisions.length > 0) {
      throw new Error(`Plan 052 artifacts already exist; no files written:\n${collisions.join("\n")}`);
    }
  }
  for (const [relativePath, content] of files) {
    const target = absolute(relativePath);
    if (mode === "--write") {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    } else if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      throw new Error(`Plan 052 artifact is stale: ${relativePath}`);
    }
  }
  if (mode === "--check") {
    const operationIds = new Set(positives.map((spec) =>
      `establish:${deterministicOperationalOccurrenceId(
        readJsonl<FrozenCandidate>(frozenCandidatesRelative)
          .find((row) => row.candidate_id === spec.candidate_id)!.candidate_key,
      )}`
    ));
    const managed = readdirSync(absolute(identityAcceptedDir))
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(
        readFileSync(join(absolute(identityAcceptedDir), name), "utf8"),
      ) as { operation_id: string })
      .filter((row) => operationIds.has(row.operation_id));
    if (managed.length !== operationIds.size) {
      throw new Error("reviewed positive identity operation membership drifted");
    }
  }
}

const mode = process.argv[2];
if ((mode !== "--write" && mode !== "--check") || process.argv.length !== 3) {
  throw new Error(
    "usage: bun scripts/integrate-plan052-reviewed-positive-heads.ts --write|--check",
  );
}
const files = expectedFiles();
writeOrCheck(mode, files);
console.log(
  `Plan 052 reviewed positive heads ${mode === "--write" ? "applied" : "verified"}: ` +
    `${positives.length} published, ${aliases.length} duplicate alias, ` +
    `${positives.reduce((sum, row) => sum + row.applications.length, 0)} applications.`,
);
