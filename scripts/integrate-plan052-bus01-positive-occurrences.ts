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
import {
  parseOperationalEpisodeAcceptedMapping,
} from "../packages/pipeline/src/materialize/operational-episode-adapters";
import {
  deterministicOperationalOccurrenceId,
} from "../packages/pipeline/src/materialize/operational-occurrence-identity";
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
import type {
  OperationalOccurrenceReviewV1EvidenceBinding,
} from "../packages/pipeline/src/materialize/operational-occurrence-review";
import {
  resolvedInterventionDurableApplicationIdentity,
} from "../packages/pipeline/src/materialize/resolved-intervention-applications";

type PlainEvidence = {
  record_id: string;
  source_id: string;
  evidence_id: string;
};
type FrozenCandidate = {
  candidate_id: string;
  candidate_key: string;
  disposition: string;
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
  candidate_id: string;
  candidate_key: string;
  event_id: string;
  event_evidence_id: string;
  onset: {
    date: string;
    precision: "day" | "month" | "season";
  };
  applications: ApplicationSpec[];
  rationale: string;
  supplement_ids: string[];
};

const batchId = "w2-bus-priority-pending-01";
const acceptedAt = "2026-07-30T18:30:00.000Z";
const campaign = "data/operational-episode-resolution/campaigns/plan-052";
const manifestRelative = `${campaign}/batches/${batchId}.json`;
const primaryRelative =
  `${campaign}/proposed-review-receipts/${batchId}/primary.json`;
const independentRelative =
  `${campaign}/proposed-review-receipts/${batchId}/independent.json`;
const adjudicationRelative =
  `${campaign}/proposed-review-receipts/${batchId}/adjudication-independent.json`;
const reconciliationRelative =
  `${campaign}/reconciliation-receipts/${batchId}-blind-adjudication-v2.json`;
const schemaSupplementRelative =
  `${campaign}/evidence-supplements/w2-bus01-schema-resolution-v1.json`;
const frozenCandidatesRelative =
  `${campaign}/frozen-frontier/candidate_ledger.jsonl`;
const reviewDir =
  "data/operational-occurrence-review/accepted-current/decisions";
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
const integrationReceiptRelative =
  `${campaign}/integration-receipts/${batchId}-positive-occurrences-v1.json`;

const specs: PositiveSpec[] = [
  {
    candidate_id: "candidate:09aa3e427256f35744c0b148",
    candidate_key: "event:event_m34-sbs-launch",
    event_id: "event_m34-sbs-launch",
    event_evidence_id: "brt_routes_fullreport#p012_c0028",
    onset: { date: "2011-11", precision: "month" },
    applications: [
      {
        route_record_id: "route_m34-sbs",
        gtfs_route_id: "M34+",
        route_evidence_id:
          "201110_brt_34th_open_house_slides#p028_c0002",
        treatment_record_id:
          "treatment_tc-201203-34th-sbs-off-board-fare",
        treatment_evidence_id: "201203_brt_34th_cac6#p003_c0002",
      },
      {
        route_record_id: "route_m34a-sbs",
        gtfs_route_id: "M34A+",
        route_evidence_id:
          "201110_brt_34th_open_house_slides#p028_c0002",
        treatment_record_id:
          "treatment_tc-201203-34th-sbs-off-board-fare",
        treatment_evidence_id: "201203_brt_34th_cac6#p003_c0002",
      },
    ],
    rationale:
      "Blind adjudication proves the November 2011 M34 and M34A SBS launch with one shared off-board-fare treatment. The immutable route-identity snapshot and append-only local evidence supplement resolve the three representation blockers without changing canonical observations.",
    supplement_ids: ["w2-bus01-schema-resolution-v1"],
  },
  {
    candidate_id: "candidate:2248ba6cf9879d8dfad25e1e",
    candidate_key: "event:event_offset-bus-lane-conversion-fall-2014",
    event_id: "event_offset-bus-lane-conversion-fall-2014",
    event_evidence_id:
      "2014_12_01_brt_thirdave_cb6_presentation#p002_c0002",
    onset: { date: "2014-fall", precision: "season" },
    applications: [
      {
        route_record_id: "route_m101",
        gtfs_route_id: "M101",
        route_evidence_id:
          "2014_12_01_brt_thirdave_cb6_presentation#p002_c0002",
        treatment_record_id:
          "treatment_offset-bus-lane-third-ave-36th-to-56th",
        treatment_evidence_id:
          "2014_12_01_brt_thirdave_cb6_presentation#p002_c0002",
      },
      {
        route_record_id: "route_m102",
        gtfs_route_id: "M102",
        route_evidence_id:
          "2014_12_01_brt_thirdave_cb6_presentation#p002_c0002",
        treatment_record_id:
          "treatment_offset-bus-lane-third-ave-36th-to-56th",
        treatment_evidence_id:
          "2014_12_01_brt_thirdave_cb6_presentation#p002_c0002",
      },
      {
        route_record_id: "route_m103-segment-speed",
        gtfs_route_id: "M103",
        route_evidence_id:
          "2014_12_01_brt_thirdave_cb6_presentation#p002_c0002",
        treatment_record_id:
          "treatment_offset-bus-lane-third-ave-36th-to-56th",
        treatment_evidence_id:
          "2014_12_01_brt_thirdave_cb6_presentation#p002_c0002",
      },
    ],
    rationale:
      "Blind adjudication proves one bounded Third Avenue offset bus-lane conversion applied exactly to M101, M102, and M103. The immutable route-identity snapshot already resolves M101 as exact service.",
    supplement_ids: ["w2-bus01-schema-resolution-v1"],
  },
  {
    candidate_id: "candidate:24d400232f2d9cadd443db6f",
    candidate_key: "event:event_bus-queue-jump-signal-installed-79th-5th",
    event_id: "event_bus-queue-jump-signal-installed-79th-5th",
    event_evidence_id: "brt_m79_cb8_nov2018#p011_c0002",
    onset: { date: "2018-11-05", precision: "day" },
    applications: [{
      route_record_id: "route_m79-sbs",
      gtfs_route_id: "M79+",
      route_evidence_id: "brt_m79_cb8_nov2018#p001_c0001",
      treatment_record_id: "treatment_bus-queue-jump-signal-79th-5th",
      treatment_evidence_id: "brt_m79_cb8_nov2018#p011_c0002",
    }],
    rationale:
      "Blind adjudication proves one M79+ queue-jump signal installation at the exact westbound 79th Street/Fifth Avenue location.",
    supplement_ids: [],
  },
  {
    candidate_id: "candidate:2737ce60eff9ea2b8ce19134",
    candidate_key: "event:event_b44-sbs-launch_2",
    event_id: "event_b44-sbs-launch_2",
    event_evidence_id: "b44_sbs_progress_report_2016#p023_c0003",
    onset: { date: "2013-11-17", precision: "day" },
    applications: [{
      route_record_id: "route_b44-sbs",
      gtfs_route_id: "B44+",
      route_evidence_id: "b44_sbs_progress_report_2016#p005_c0003",
      treatment_record_id: "treatment_off-board-fare_2",
      treatment_evidence_id: "b44_sbs_progress_report_2016#p018_c0010",
    }],
    rationale:
      "Blind adjudication proves one B44+ launch application for the exact off-board-fare treatment.",
    supplement_ids: [],
  },
  {
    candidate_id: "candidate:2e77b209d463d19590fc438b",
    candidate_key: "event:event_m79-sbs-launch-may2017_2",
    event_id: "event_m79-sbs-launch-may2017_2",
    event_evidence_id: "brt_m79_after_report_feb2020#p002_c0003",
    onset: { date: "2017-05-21", precision: "day" },
    applications: [{
      route_record_id: "route_m79-sbs",
      gtfs_route_id: "M79+",
      route_evidence_id: "brt_m79_after_report_feb2020#p002_c0003",
      treatment_record_id: "treatment_off-board-fare-79th-st",
      treatment_evidence_id: "brt_m79_after_report_feb2020#p012_c0002",
    }],
    rationale:
      "Blind adjudication proves one M79+ launch application for the exact route-wide off-board-fare treatment.",
    supplement_ids: [],
  },
  {
    candidate_id: "candidate:2ec2e964735ea8681ff39463",
    candidate_key: "event:event_bx6-sbs-launch-2017",
    event_id: "event_bx6-sbs-launch-2017",
    event_evidence_id: "brt_bx6_cb12_may2022#p004_c0002",
    onset: { date: "2017-09-03", precision: "day" },
    applications: [{
      route_record_id: "route_bx6-sbs",
      gtfs_route_id: "BX6+",
      route_evidence_id: "brt_bx6_cb12_may2022#p004_c0002",
      treatment_record_id:
        "treatment_fare-machines-brt-bx6-cb12-may2022",
      treatment_evidence_id: "brt_bx6_cb12_may2022#p005_c0003",
    }],
    rationale:
      "Blind adjudication proves one Bx6+ launch application for the exact fare-machine treatment; no corridor extent is inferred.",
    supplement_ids: [],
  },
  {
    candidate_id: "candidate:31087989c62ad4667d44ad7b",
    candidate_key: "event:event_bus-lanes-installed-aug-2015",
    event_id: "event_bus-lanes-installed-aug-2015",
    event_evidence_id: "2015_12_01_brt_woodhaven_cb5#p001_c0012",
    onset: { date: "2015-08", precision: "month" },
    applications: [
      {
        route_record_id: "route_q52-ltd-woodhaven-2014",
        gtfs_route_id: "Q52+",
        route_evidence_id: "brt_woodhaven_cb9_jan2016#p008_c0002",
        treatment_record_id: "treatment_bus-lanes-woodhaven-2015",
        treatment_evidence_id:
          "2015_12_01_brt_woodhaven_cb5#p001_c0012",
      },
      {
        route_record_id: "route_q53-ltd-woodhaven-2014",
        gtfs_route_id: "Q53+",
        route_evidence_id: "brt_woodhaven_cb9_jan2016#p008_c0002",
        treatment_record_id: "treatment_bus-lanes-woodhaven-2015",
        treatment_evidence_id:
          "2015_12_01_brt_woodhaven_cb5#p001_c0012",
      },
    ],
    rationale:
      "Blind adjudication proves the August 2015 Woodhaven bus-only lane against the two explicitly named historical Q52/Q53 Limited subjects. Durable Q52+/Q53+ public continuity does not backdate the later SBS designation.",
    supplement_ids: [],
  },
  {
    candidate_id: "candidate:34d408b4c685ffec2d79dda7",
    candidate_key: "event:event_bx41-sbs-launch-2013-06-30_3",
    event_id: "event_bx41-sbs-launch-2013-06-30_3",
    event_evidence_id: "2014_03_06_brt_webster_cb6#p004_c0002",
    onset: { date: "2013-06-30", precision: "day" },
    applications: [{
      route_record_id: "route_webster-ave-sbs",
      gtfs_route_id: "BX41+",
      route_evidence_id: "2014_03_06_brt_webster_cb6#p004_c0002",
      treatment_record_id: "treatment_off-board-fare-webster-2013_3",
      treatment_evidence_id: "2013_02_sbs_webster_bx_cb1#p011_c0002",
    }],
    rationale:
      "Blind adjudication proves one Bx41+ launch application for the exact off-board-fare treatment.",
    supplement_ids: [],
  },
];

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
  return {
    path: relativePath,
    sha256: sha256(readFileSync(absolute(relativePath))),
  };
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
  if (!record) throw new Error(`missing canonical record ${recordId}`);
  const refs = record.evidence_refs.filter((ref) =>
    ref.evidence_id === evidenceId
  );
  const sources = [...new Set(refs.map((ref) => ref.source_id))];
  if (
    record.truth_status !== "source_stated" ||
    record.review_state === "quarantined" ||
    refs.length === 0 ||
    sources.length !== 1
  ) {
    throw new Error(`${recordId} lacks exact eligible evidence ${evidenceId}`);
  }
  return {
    role,
    record_id: recordId,
    source_id: sources[0]!,
    evidence_id: evidenceId,
  };
}
function uniqueBindings(
  bindings: readonly OperationalOccurrenceReviewV1EvidenceBinding[],
): OperationalOccurrenceReviewV1EvidenceBinding[] {
  return [...new Map(bindings.map((value) => [
    [value.role, value.record_id, value.source_id, value.evidence_id].join("|"),
    value,
  ])).values()].sort((left, right) =>
    [left.role, left.record_id, left.source_id, left.evidence_id].join("|")
      .localeCompare(
        [right.role, right.record_id, right.source_id, right.evidence_id].join("|"),
      )
  );
}
function plainEvidence(
  bindings: readonly OperationalOccurrenceReviewV1EvidenceBinding[],
): PlainEvidence[] {
  return [...new Map(bindings.map((value) => [
    [value.record_id, value.source_id, value.evidence_id].join("|"),
    {
      record_id: value.record_id,
      source_id: value.source_id,
      evidence_id: value.evidence_id,
    },
  ])).values()].sort((left, right) =>
    [left.record_id, left.source_id, left.evidence_id].join("|")
      .localeCompare(
        [right.record_id, right.source_id, right.evidence_id].join("|"),
      )
  );
}
function decisionFor(
  spec: PositiveSpec,
  records: ReadonlyMap<string, MtaCanonicalRecord>,
  frozen: FrozenCandidate,
): OperationalOccurrenceAcceptedDecisionV3 {
  const occurrenceId = deterministicOperationalOccurrenceId(spec.candidate_key);
  const onsetBinding = binding(
    records,
    spec.event_id,
    spec.event_evidence_id,
    "event_date",
  );
  const routeSpecs = [...new Map(spec.applications.map((application) => [
    application.route_record_id,
    application,
  ])).values()];
  const treatmentSpecs = [...new Map(spec.applications.map((application) => [
    application.treatment_record_id,
    application,
  ])).values()];
  const routes = routeSpecs.map((route) => ({
    route_record_id: route.route_record_id,
    gtfs_route_id: route.gtfs_route_id,
    evidence_bindings: [binding(
      records,
      route.route_record_id,
      route.route_evidence_id,
      "route_identity",
    )],
  })).sort((left, right) =>
    left.route_record_id.localeCompare(right.route_record_id)
  );
  const members = treatmentSpecs.map((treatment) => {
    const record = records.get(treatment.treatment_record_id)!;
    const family = record?.payload.treatment_family;
    if (typeof family !== "string" || !family) {
      throw new Error(`${treatment.treatment_record_id} lacks treatment family`);
    }
    return {
      treatment_record_id: treatment.treatment_record_id,
      treatment_family: family,
      evidence_bindings: [binding(
        records,
        treatment.treatment_record_id,
        treatment.treatment_evidence_id,
        "treatment_definition",
      )],
    };
  }).sort((left, right) =>
    left.treatment_record_id.localeCompare(right.treatment_record_id)
  );
  const routeById = new Map(routes.map((route) => [
    route.route_record_id,
    route,
  ]));
  const memberById = new Map(members.map((member) => [
    member.treatment_record_id,
    member,
  ]));
  const applications = spec.applications.map((application) => {
    const evidence = uniqueBindings([
      onsetBinding,
      ...routeById.get(application.route_record_id)!.evidence_bindings,
      ...memberById.get(application.treatment_record_id)!.evidence_bindings,
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
      extent: {
        kind: "unknown" as const,
        record_ids: [],
        description: null,
      },
      evidence_bindings: evidence,
    };
  }).sort((left, right) =>
    [
      left.route_record_id,
      left.treatment_record_id,
      left.phase_record_id,
    ].join("|").localeCompare([
      right.route_record_id,
      right.treatment_record_id,
      right.phase_record_id,
    ].join("|"))
  );
  const allEvidence = uniqueBindings([
    onsetBinding,
    ...routes.flatMap((route) => route.evidence_bindings),
    ...members.flatMap((member) => member.evidence_bindings),
  ]);
  const withoutFingerprint = {
    schema_version: 3 as const,
    decision_id:
      `plan-052-${batchId}-current-${spec.candidate_id.replace("candidate:", "")}`,
    review_state: "approved" as const,
    occurrence_id: occurrenceId,
    founding_key: spec.candidate_key,
    anchor_review_decision_ids: [],
    observation_event_record_ids: frozen.observation_event_record_ids,
    observation_relation_record_ids:
      [...frozen.observation_relation_record_ids].sort(),
    resolution_cluster_id: null,
    phase_record_ids: [spec.event_id],
    phase_relation_record_ids: [],
    physical_scope_record_ids: [],
    physical_scope_relation_record_ids: [],
    resolved_onset: {
      ...spec.onset,
      evidence_bindings: [onsetBinding],
    },
    routes,
    treatment:
      members.length === 1
        ? { kind: "atomic" as const, member: members[0]! }
        : {
            kind: "bundle" as const,
            bundle_family: null,
            bundle_family_evidence_bindings: [],
            members,
          },
    applications,
    evidence_bindings: allEvidence,
    reviewers: [
      "plan-052-bus01-primary-reviewer",
      "plan-052-bus01-independent-reviewer",
      "plan-052-bus01-blind-adjudicator",
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
      operationalOccurrenceCurrentReviewMembershipFingerprint(
        withoutFingerprint,
      ),
  });
}
function operationFor(
  spec: PositiveSpec,
  decision: OperationalOccurrenceAcceptedDecisionV3,
  index: number,
): OperationalOccurrenceIdentityOperation {
  return parseOperationalOccurrenceIdentityOperation({
    schema_version: 1,
    operation_id: `establish:${decision.occurrence_id}`,
    kind: "establish",
    issued_at:
      `2026-07-30T18:29:${String(index).padStart(2, "0")}.000Z`,
    reviewer: "plan-052-bus01-reconciled-review-board",
    decision_id: decision.decision_id,
    rationale: spec.rationale,
    affected_founding_event_record_ids: [spec.event_id],
    occurrence_id: decision.occurrence_id,
    founding_key: spec.candidate_key,
    founding_event_record_ids: [spec.event_id],
    resolution_cluster_id: null,
  });
}
function expectedFiles(): Map<string, string> {
  const authorities = [
    pointer(manifestRelative),
    pointer(primaryRelative),
    pointer(independentRelative),
    pointer(adjudicationRelative),
    pointer(reconciliationRelative),
    pointer(schemaSupplementRelative),
  ];
  const frozen = new Map(
    readJsonl<FrozenCandidate>(frozenCandidatesRelative).map((row) => [
      row.candidate_id,
      row,
    ]),
  );
  const records = new Map(readCanonicalRecords().map((record) => [
    record.record_id,
    record,
  ]));
  const files = new Map<string, string>();
  const decisions = specs.map((spec) => {
    const row = frozen.get(spec.candidate_id);
    if (
      !row ||
      row.disposition !== "pending_review" ||
      row.candidate_key !== spec.candidate_key ||
      row.observation_event_record_ids.length !== 1 ||
      row.observation_event_record_ids[0] !== spec.event_id
    ) {
      throw new Error(`${spec.candidate_id} frozen membership drifted`);
    }
    return decisionFor(spec, records, row);
  });
  const operations = specs.map((spec, index) =>
    operationFor(spec, decisions[index]!, index)
  );
  for (const [index, spec] of specs.entries()) {
    const decision = decisions[index]!;
    const operation = operations[index]!;
    const frozenRow = frozen.get(spec.candidate_id)!;
    const mapping = parseOperationalEpisodeAcceptedMapping({
      schema_version: 1,
      mapping_id: `mapping:${decision.occurrence_id}`,
      adapter_id: "accepted_mapping_v1",
      observation_event_record_ids: frozenRow.observation_event_record_ids,
      observation_relation_record_ids:
        frozenRow.observation_relation_record_ids,
      candidate_keys: [spec.candidate_key],
      occurrence_id: decision.occurrence_id,
      evidence_bindings: plainEvidence(decision.evidence_bindings),
      decision_id: decision.decision_id,
      reviewer: "plan-052-bus01-reconciled-review-board",
      reviewed_at: acceptedAt,
      rationale: spec.rationale,
    });
    files.set(`${reviewDir}/${decision.decision_id}.json`, json(decision));
    files.set(`${mappingDir}/${mapping.mapping_id}.json`, json(mapping));
    files.set(
      `${identityAcceptedDir}/${operation.operation_id}.json`,
      json(operation),
    );
  }
  const migration = loadOperationalOccurrenceIdentityOperations(
    absolute(identityMigrationDir),
  );
  const existingAccepted = existsSync(absolute(identityAcceptedDir))
    ? loadOperationalOccurrenceIdentityOperations(absolute(identityAcceptedDir))
    : [];
  const managedIds = new Set(operations.map((operation) =>
    operation.operation_id
  ));
  const ordered = [
    ...existingAccepted.filter((operation) =>
      !managedIds.has(operation.operation_id)
    ),
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
    const operationRelative =
      `${identityAcceptedDir}/${operation.operation_id}.json`;
    const operationBytes =
      files.get(operationRelative) ??
      readFileSync(absolute(operationRelative), "utf8");
    const resultRegistry = operationalOccurrenceIdentityRegistryV2Jsonl(
      replayOperationalOccurrenceIdentityOperations([...migration, ...applied]),
    );
    if (managedIds.has(operation.operation_id)) {
      const decision = decisions.find((row) =>
        row.decision_id === operation.decision_id
      )!;
      files.set(
        `${identityReceiptDir}/${operation.operation_id}.json`,
        json({
          schema_version: 1,
          operation_id: operation.operation_id,
          batch_id: batchId,
          batch_manifest_path: manifestRelative,
          batch_manifest_sha256: authorities[0]!.sha256,
          primary_reviewer: "plan-052-bus01-primary-reviewer",
          independent_reviewer: "plan-052-bus01-independent-reviewer",
          evidence_bindings: plainEvidence(decision.evidence_bindings),
          basis_registry_sha256: sha256(priorRegistry),
          operation_sha256: sha256(operationBytes),
          result_registry_sha256: sha256(resultRegistry),
        }),
      );
    }
    priorRegistry = resultRegistry;
  }
  files.set(identityCurrentRegistry, priorRegistry);
  const artifacts = specs.map((spec, index) => {
    const decision = decisions[index]!;
    const operation = operations[index]!;
    const mappingRelative = `${mappingDir}/mapping:${decision.occurrence_id}.json`;
    return {
      candidate_id: spec.candidate_id,
      occurrence_id: decision.occurrence_id,
      supplement_ids: spec.supplement_ids,
      review_decision: {
        path: `${reviewDir}/${decision.decision_id}.json`,
        sha256: sha256(files.get(`${reviewDir}/${decision.decision_id}.json`)!),
      },
      identity_operation: {
        path: `${identityAcceptedDir}/${operation.operation_id}.json`,
        sha256: sha256(files.get(
          `${identityAcceptedDir}/${operation.operation_id}.json`,
        )!),
      },
      identity_receipt: {
        path: `${identityReceiptDir}/${operation.operation_id}.json`,
        sha256: sha256(files.get(
          `${identityReceiptDir}/${operation.operation_id}.json`,
        )!),
      },
      mapping: {
        path: mappingRelative,
        sha256: sha256(files.get(mappingRelative)!),
      },
      exact_application_incidence: decision.applications.map((application) =>
        [
          application.route_record_id,
          application.gtfs_route_id,
          application.treatment_record_id,
          application.phase_record_id,
        ].join("|")
      ),
      reviewed_action_extent_deferred_to_plan053: decision.applications.every(
        (application) =>
          application.action === "unknown" &&
          application.extent.kind === "unknown",
      ),
    };
  });
  files.set(integrationReceiptRelative, json({
    schema_version: 1,
    contract_id: "plan-052-positive-integration-receipt-v1",
    plan_id: "plan-052",
    batch_id: batchId,
    integrated_at: acceptedAt,
    integrator: "plan-052-single-frontier-integrator",
    authorities,
    artifacts,
    exact_arithmetic: {
      candidate_count: artifacts.length,
      observation_count: artifacts.length,
      application_count: artifacts.reduce(
        (sum, artifact) =>
          sum + artifact.exact_application_incidence.length,
        0,
      ),
    },
    historical_migration_files_changed: false,
    canonical_observations_changed: false,
    publication_or_release_authorized: false,
  }));
  return files;
}
function writeOrCheck(
  mode: "--write" | "--check" | "--repair-unaccepted",
  files: ReadonlyMap<string, string>,
): void {
  if (mode === "--write") {
    const collisions = [...files.keys()].filter((relativePath) =>
      relativePath !== identityCurrentRegistry &&
      existsSync(absolute(relativePath))
    );
    if (collisions.length > 0) {
      throw new Error(
        `Plan 052 artifacts already exist; no files were written:\n${
          collisions.join("\n")
        }`,
      );
    }
  }
  if (mode === "--repair-unaccepted") {
    let repairVersion = 1;
    let repairRelative =
      `${campaign}/integration-receipts/${batchId}-positive-unaccepted-partial-write-repair-v${repairVersion}.json`;
    while (existsSync(absolute(repairRelative))) {
      repairVersion += 1;
      repairRelative =
        `${campaign}/integration-receipts/${batchId}-positive-unaccepted-partial-write-repair-v${repairVersion}.json`;
    }
    const fileStates = [...files].map(([relativePath, content]) => {
      const target = absolute(relativePath);
      if (!existsSync(target)) {
        return {
          path: relativePath,
          repair_action: "created",
          previous_sha256: null,
          expected_sha256: sha256(content),
        };
      }
      const previous = readFileSync(target);
      const previousSha256 = sha256(previous);
      const expectedSha256 = sha256(content);
      return {
        path: relativePath,
        repair_action: previousSha256 === expectedSha256
          ? "preserved"
          : "replaced",
        previous_sha256: previousSha256,
        expected_sha256: expectedSha256,
      };
    });
    const createdCount = fileStates.filter((row) =>
      row.repair_action === "created"
    ).length;
    const preservedCount = fileStates.filter((row) =>
      row.repair_action === "preserved"
    ).length;
    const replacedCount = fileStates.filter((row) =>
      row.repair_action === "replaced"
    ).length;
    if (
      preservedCount === 0 ||
      (repairVersion === 1 ? createdCount === 0 : replacedCount === 0)
    ) {
      throw new Error(
        "Bus-01 repair is only valid for the observed partial-write state",
      );
    }
    mkdirSync(dirname(absolute(repairRelative)), { recursive: true });
    writeFileSync(absolute(repairRelative), json({
      schema_version: 1,
      contract_id: "plan-052-unaccepted-partial-write-repair-v1",
      plan_id: "plan-052",
      batch_id: batchId,
      repaired_at: "2026-07-30T18:45:00.000Z",
      integrator: "plan-052-single-frontier-integrator",
      reason: repairVersion === 1
        ? "The initial deterministic write created the eight per-occurrence decisions, mappings, identity operations, and identity receipts before rejecting the pre-existing shared current registry. No replay, frontier regeneration, or accepted integration receipt had occurred. This append-only receipt preserves the exact partial-state hashes before completing the same deterministic integration."
        : "The completed deterministic write passed its script-local byte check, but the first authoritative frontier replay rejected the identity receipts because blind_adjudicator is not part of the strict accepted-current receipt schema. No frontier regeneration or accepted checkpoint occurred. This append-only receipt preserves every rejected byte hash before removing only that unsupported provenance field; the adjudicator remains pinned by the batch reconciliation authority.",
      accepted_checkpoint_preceded_repair: false,
      historical_migration_files_changed: false,
      canonical_observations_changed: false,
      file_states: fileStates,
    }), "utf8");
  }
  for (const [relativePath, content] of files) {
    const target = absolute(relativePath);
    if (mode === "--write") {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    } else if (mode === "--repair-unaccepted") {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    } else if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      throw new Error(`Plan 052 artifact is stale: ${relativePath}`);
    }
  }
  if (mode === "--check") {
    const managed = new Set(specs.map((spec) =>
      `establish:${deterministicOperationalOccurrenceId(spec.candidate_key)}`
    ));
    const duplicates = readdirSync(absolute(identityAcceptedDir))
      .filter((name) => name.endsWith(".json"))
      .map((name) =>
        JSON.parse(readFileSync(join(absolute(identityAcceptedDir), name), "utf8")) as {
          operation_id: string;
        }
      )
      .filter((operation) => managed.has(operation.operation_id));
    if (duplicates.length !== managed.size) {
      throw new Error("managed Bus-01 identity operation membership drifted");
    }
  }
}

const mode = process.argv[2];
if (
  (mode !== "--write" &&
    mode !== "--check" &&
    mode !== "--repair-unaccepted") ||
  process.argv.length !== 3
) {
  throw new Error(
    "usage: bun scripts/integrate-plan052-bus01-positive-occurrences.ts --write|--check|--repair-unaccepted",
  );
}
const files = expectedFiles();
writeOrCheck(mode, files);
console.log(
  `Plan 052 Bus-01 positive occurrences ${
    mode === "--write"
      ? "applied"
      : mode === "--repair-unaccepted"
      ? "repaired before acceptance"
      : "verified"
  }: ${specs.length} episodes, ${
    specs.reduce((sum, spec) => sum + spec.applications.length, 0)
  } applications.`,
);
