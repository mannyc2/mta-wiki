import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import { readCanonicalRecords } from "../packages/pipeline/src/materialize/canonical-read";
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
import {
  parseOperationalEpisodeAcceptedMapping,
} from "../packages/pipeline/src/materialize/operational-episode-adapters";

type PlainEvidence = {
  record_id: string;
  source_id: string;
  evidence_id: string;
};

type RouteSpec = {
  record_id: string;
  public_id: string;
  evidence: Array<[record_id: string, evidence_id: string]>;
};

type PositiveSpec = {
  candidate_id: string;
  candidate_key: string;
  event_id: string;
  onset: {
    date: string;
    precision: "day" | "season" | "upper_bound_day";
    evidence: Array<[record_id: string, evidence_id: string]>;
  };
  routes: RouteSpec[];
  treatment_id: string;
  treatment_family: string;
  treatment_evidence: Array<[record_id: string, evidence_id: string]>;
  corridor_id: string;
  corridor_description: string;
  corridor_evidence: Array<[record_id: string, evidence_id: string]>;
  observation_relation_ids: string[];
  phase_relation_ids: string[];
  physical_scope_relation_ids: string[];
  additional_evidence: Array<[record_id: string, evidence_id: string]>;
  rationale: string;
  authority: "dual_review_agreement" | "owner_adjudication";
};

const batchId = "w1-characterization";
const acceptedAt = "2026-07-30T12:30:00.000Z";
const campaign =
  "data/operational-episode-resolution/campaigns/plan-052";
const manifestRelative = `${campaign}/batches/${batchId}.json`;
const primaryRelative =
  `${campaign}/review-receipts/${batchId}/primary.json`;
const independentRelative =
  `${campaign}/review-receipts/${batchId}/independent.json`;
const adjudicationRelative =
  `${campaign}/review-receipts/${batchId}/fresh-independent-adjudication.json`;
const reconciliationRelative =
  `${campaign}/reconciliation-receipts/wave-1-owner-adjudication-v1.json`;
const supplementRelative =
  `${campaign}/evidence-supplements/w1-broadway-q70-installed-v1.json`;
const frozenCandidateRelative =
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
  `${campaign}/integration-receipts/wave-1-positive-occurrences.json`;
const representationRepairRelative =
  `${campaign}/reconciliation-receipts/wave-1-representation-repair-v1.json`;

const specs: PositiveSpec[] = [
  {
    candidate_id: "candidate:00a57691fb4583cceadb9be0",
    candidate_key: "event:event_q52-q53-sbs-launch-nov2017_2",
    event_id: "event_q52-q53-sbs-launch-nov2017_2",
    onset: {
      date: "2017-11-12",
      precision: "day",
      evidence: [[
        "event_q52-q53-sbs-launch-nov2017_2",
        "brt_woodhaven_after_fall2018#p002_c0002",
      ]],
    },
    routes: [
      {
        record_id: "route_q52-sbs-queens",
        public_id: "Q52+",
        evidence: [[
          "route_q52-sbs-queens",
          "brt_woodhaven_after_fall2018#p002_c0002",
        ]],
      },
      {
        record_id: "route_q53-sbs-ace",
        public_id: "Q53+",
        evidence: [[
          "route_q53-sbs-ace",
          "brt_woodhaven_after_fall2018#p002_c0002",
        ]],
      },
    ],
    treatment_id: "treatment_off-board-fare-collection_4",
    treatment_family: "fare_collection",
    treatment_evidence: [[
      "treatment_off-board-fare-collection_4",
      "brt_woodhaven_after_fall2018#p022_c0002",
    ]],
    corridor_id: "corridor_woodhaven-cross-bay-blvds",
    corridor_description:
      "Woodhaven and Cross Bay Boulevards SBS corridor from Woodside to the Rockaways.",
    corridor_evidence: [[
      "corridor_woodhaven-cross-bay-blvds",
      "brt_woodhaven_after_fall2018#p002_c0002",
    ]],
    observation_relation_ids: [
      "relation_project-has-launch-event_5",
      "relation_project-has-off-board-fare_3",
      "relation_project-serves-q52_8",
      "relation_project-serves-q53_4",
      "relation_project-uses-corridor_4",
      "relation_q52-operates-on-corridor",
      "relation_q53-operates-on-corridor_5",
    ],
    phase_relation_ids: ["relation_project-has-launch-event_5"],
    physical_scope_relation_ids: [
      "relation_project-uses-corridor_4",
      "relation_q52-operates-on-corridor",
      "relation_q53-operates-on-corridor_5",
    ],
    additional_evidence: [
      [
        "relation_project-serves-q52_8",
        "brt_woodhaven_after_fall2018#p002_c0002",
      ],
      [
        "relation_project-serves-q53_4",
        "brt_woodhaven_after_fall2018#p002_c0002",
      ],
      [
        "relation_project-has-off-board-fare_3",
        "brt_woodhaven_after_fall2018#p022_c0002",
      ],
      [
        "relation_project-has-launch-event_5",
        "brt_woodhaven_after_fall2018#p011_c0002",
      ],
      [
        "relation_project-uses-corridor_4",
        "brt_woodhaven_after_fall2018#p002_c0002",
      ],
      [
        "relation_q52-operates-on-corridor",
        "brt_woodhaven_after_fall2018#p002_c0002",
      ],
      [
        "relation_q53-operates-on-corridor_5",
        "brt_woodhaven_after_fall2018#p002_c0002",
      ],
    ],
    rationale:
      "Both Wave 1 reviewers independently accepted the exact Q52+ and Q53+ launch incidence with one shared off-board fare-collection treatment. The two explicit routes × one treatment produce exactly two applications and no plural-treatment cross-product.",
    authority: "dual_review_agreement",
  },
  {
    candidate_id: "candidate:0065d35d05693332aeb8b1ef",
    candidate_key: "event:event_bus-lane-implementation-fall-2015",
    event_id: "event_bus-lane-implementation-fall-2015",
    onset: {
      date: "2015-fall",
      precision: "season",
      evidence: [[
        "event_bus-lane-implementation-fall-2015",
        "brt_uticaave_winter_spring_newsletter_2016#p002_c0003",
      ]],
    },
    routes: [{
      record_id: "route_b46-local-2012",
      public_id: "B46",
      evidence: [
        [
          "relation_project-uses-corridor-utica-ave",
          "brt_uticaave_winter_spring_newsletter_2016#p001_c0002",
        ],
        [
          "route_b46-local-2012",
          "brt_uticaave_winter_spring_newsletter_2016#p004_c0005",
        ],
      ],
    }],
    treatment_id: "treatment_dedicated-bus-lanes-utica-2015",
    treatment_family: "bus_lane",
    treatment_evidence: [[
      "treatment_dedicated-bus-lanes-utica-2015",
      "brt_uticaave_winter_spring_newsletter_2016#p002_c0004",
    ]],
    corridor_id: "corridor_utica-ave-st-johns-pl-church-ave-2013",
    corridor_description:
      "Utica Avenue from St. Johns Place to Church Avenue.",
    corridor_evidence: [[
      "corridor_utica-ave-st-johns-pl-church-ave-2013",
      "brt_uticaave_winter_spring_newsletter_2016#p003_c0012",
    ]],
    observation_relation_ids: [
      "relation_local-route-operates-on-corridor_2",
      "relation_project-has-dedicated-bus-lanes",
      "relation_project-serves-b46-local-route",
      "relation_project-timeline-bus-lanes",
      "relation_project-uses-corridor-utica-ave",
    ],
    phase_relation_ids: ["relation_project-timeline-bus-lanes"],
    physical_scope_relation_ids: [
      "relation_local-route-operates-on-corridor_2",
      "relation_project-uses-corridor-utica-ave",
    ],
    additional_evidence: [
      [
        "relation_project-has-dedicated-bus-lanes",
        "brt_uticaave_winter_spring_newsletter_2016#p002_c0004",
      ],
      [
        "relation_project-timeline-bus-lanes",
        "brt_uticaave_winter_spring_newsletter_2016#p002_c0003",
      ],
      [
        "relation_project-uses-corridor-utica-ave",
        "brt_uticaave_winter_spring_newsletter_2016#p003_c0012",
      ],
    ],
    rationale:
      "Owner-adjudicated canonical evidence says B46 | Utica Avenue, Completed Fall 2015, identifies dedicated B46 lanes, and bounds the installed segment from St. Johns Place to Church Avenue. This is not merged with the later Spring 2016 SBS launch or its treatments.",
    authority: "owner_adjudication",
  },
  {
    candidate_id: "candidate:002e8ac7107b222e82e03c82",
    candidate_key: "event:event_machine-installation-oct4-2011",
    event_id: "event_machine-installation-oct4-2011",
    onset: {
      date: "2011-10-04",
      precision: "day",
      evidence: [[
        "event_machine-installation-oct4-2011",
        "201110_brt_34th_open_house_slides#p036_c0002",
      ]],
    },
    routes: [
      {
        record_id: "route_m34-local-2011",
        public_id: "M34+",
        evidence: [[
          "route_m34-local-2011",
          "20110314_34th_cac4_slides#p007_c0002",
        ]],
      },
      {
        record_id: "route_m16-mentioned",
        public_id: "M16",
        evidence: [
          [
            "route_m16-mentioned",
            "201110_brt_34th_open_house_slides#p028_c0002",
          ],
          [
            "relation_m16-renamed-to-m34a",
            "201110_brt_34th_cac5#p030_c0002",
          ],
        ],
      },
    ],
    treatment_id: "treatment_off-board-fare-collection-34th",
    treatment_family: "fare_collection",
    treatment_evidence: [[
      "treatment_off-board-fare-collection-34th",
      "201110_brt_34th_open_house_slides#p005_c0002",
    ]],
    corridor_id: "corridor_34th-st-busway",
    corridor_description:
      "34th Street fare-machine installation corridor from Twelfth Avenue to First Avenue.",
    corridor_evidence: [[
      "corridor_34th-st-busway",
      "201110_brt_34th_open_house_slides#p006_c0002",
    ]],
    observation_relation_ids: [
      "relation_m16-renamed-to-m34a",
      "relation_project-has-event-machine-install",
    ],
    phase_relation_ids: ["relation_project-has-event-machine-install"],
    physical_scope_relation_ids: [],
    additional_evidence: [
      [
        "relation_project-has-event-machine-install",
        "201110_brt_34th_open_house_slides#p036_c0002",
      ],
      [
        "relation_m16-renamed-to-m34a",
        "201110_brt_34th_cac5#p030_c0002",
      ],
    ],
    rationale:
      "Owner adjudication preserves the historically correct October 4 machine-installation incidence for durable M34 and historical M16/pre-M34A subjects. M16 is retained as the historical public label, and the explicit canonical M16-to-M34A successor relation is part of review membership; the November 13 M34A+ designation is not backdated.",
    authority: "owner_adjudication",
  },
  {
    candidate_id: "candidate:089c5dca117ab12f156ec032",
    candidate_key:
      "event:event_broadway-center-running-bus-lane-installation-confirmed",
    event_id:
      "event_broadway-center-running-bus-lane-installation-confirmed",
    onset: {
      date: "2026-06-10",
      precision: "upper_bound_day",
      evidence: [
        [
          "relation_broadway-center-running-lane-installation-confirmed-by-2026-06-10",
          "nyc_mayor_broadway_created_june_2026#p001_b0070",
        ],
        [
          "event_broadway-center-running-bus-lane-installation-confirmed",
          "nyc_mayor_broadway_created_june_2026#p001_b0114",
        ],
      ],
    },
    routes: [{
      record_id: "route_q70-sbs",
      public_id: "Q70+",
      evidence: [[
        "route_q70-sbs",
        "nyc_dot_current_projects_july_2026#p001_b0631",
      ]],
    }],
    treatment_id: "treatment_broadway-center-running-bus-lane",
    treatment_family: "bus_lane",
    treatment_evidence: [[
      "treatment_broadway-center-running-bus-lane",
      "nyc_dot_current_projects_july_2026#p001_b0631",
    ]],
    corridor_id: "corridor_broadway-queens",
    corridor_description:
      "Broadway in Queens between 69th Street and Roosevelt Avenue.",
    corridor_evidence: [[
      "corridor_broadway-queens",
      "better_buses#p001_b0001",
    ]],
    observation_relation_ids: [
      "relation_broadway-center-running-lane-installation-confirmed-by-2026-06-10",
      "relation_broadway-delivered-serves-q70-as-of-2026-07-13",
      "relation_broadway-has-delivered-center-running-lane-as-of-2026-07-13",
      "relation_broadway-installation-confirmed-by-2026-06-10",
      "relation_project-uses-corridor-broadway_2",
      "relation_q70-uses-broadway-center-running-lane-as-of-2026-07-13",
      "relation_route-operates-on-corridor-broadway",
    ],
    phase_relation_ids: [
      "relation_broadway-center-running-lane-installation-confirmed-by-2026-06-10",
      "relation_broadway-installation-confirmed-by-2026-06-10",
    ],
    physical_scope_relation_ids: [
      "relation_project-uses-corridor-broadway_2",
      "relation_route-operates-on-corridor-broadway",
    ],
    additional_evidence: [
      [
        "relation_broadway-delivered-serves-q70-as-of-2026-07-13",
        "nyc_dot_current_projects_july_2026#p001_b0631",
      ],
      [
        "relation_broadway-has-delivered-center-running-lane-as-of-2026-07-13",
        "nyc_dot_current_projects_july_2026#p001_b0631",
      ],
      [
        "relation_q70-uses-broadway-center-running-lane-as-of-2026-07-13",
        "nyc_dot_current_projects_july_2026#p001_b0631",
      ],
      [
        "relation_route-operates-on-corridor-broadway",
        "broadway_69_st_roosevelt_ave_may2026#p004_c0003",
      ],
      [
        "relation_project-uses-corridor-broadway_2",
        "broadway_69_st_roosevelt_ave_may2026#p007_c0002",
      ],
    ],
    rationale:
      "The owner-authorized, hash-pinned local evidence supplement proves exactly Q70+ × the installed Broadway center-running bus lane. The June 10 mayor source proves installed status by that date, not exact onset; the bounded corridor is Broadway from 69th Street to Roosevelt Avenue. No additional route is inferred.",
    authority: "owner_adjudication",
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

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readJsonl(relativePath: string): Record<string, unknown>[] {
  return readFileSync(absolute(relativePath), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) =>
      object(JSON.parse(line) as unknown, `${relativePath}:${index + 1}`)
    );
}

function roleFor(recordId: string): OperationalOccurrenceReviewV1EvidenceBinding["role"] {
  if (recordId.startsWith("route_")) return "route_identity";
  if (recordId.startsWith("treatment_")) return "treatment_definition";
  if (recordId.startsWith("corridor_")) return "treatment_scope";
  if (recordId.startsWith("relation_")) return "route_treatment_event_bridge";
  return "event_date";
}

function sortEvidence(
  values: readonly OperationalOccurrenceReviewV1EvidenceBinding[],
): OperationalOccurrenceReviewV1EvidenceBinding[] {
  return [...new Map(values.map((value) => [
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
  values: readonly OperationalOccurrenceReviewV1EvidenceBinding[],
): PlainEvidence[] {
  return [...new Map(values.map((value) => [
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

function canonicalBinding(
  records: ReadonlyMap<string, MtaCanonicalRecord>,
  recordId: string,
  evidenceId: string,
  role = roleFor(recordId),
): OperationalOccurrenceReviewV1EvidenceBinding {
  const record = records.get(recordId);
  if (!record) throw new Error(`missing canonical record ${recordId}`);
  if (
    record.truth_status !== "source_stated" ||
    record.review_state === "quarantined"
  ) {
    throw new Error(`${recordId} is not eligible source-stated evidence`);
  }
  const matches = record.evidence_refs.filter((ref) =>
    ref.evidence_id === evidenceId && typeof ref.source_id === "string"
  );
  const sourceIds = [...new Set(matches.map((match) => match.source_id))];
  if (matches.length === 0 || sourceIds.length !== 1) {
    throw new Error(
      `${recordId} expected one unambiguous canonical ${evidenceId}; found ` +
      `${matches.length} refs across ${sourceIds.length} sources`,
    );
  }
  return {
    role,
    record_id: recordId,
    source_id: sourceIds[0]!,
    evidence_id: evidenceId,
  };
}

function evidenceList(
  records: ReadonlyMap<string, MtaCanonicalRecord>,
  values: Array<[string, string]>,
  forcedRole?: OperationalOccurrenceReviewV1EvidenceBinding["role"],
): OperationalOccurrenceReviewV1EvidenceBinding[] {
  return values.map(([recordId, evidenceId]) =>
    canonicalBinding(records, recordId, evidenceId, forcedRole)
  );
}

function reviewDecision(
  spec: PositiveSpec,
  records: ReadonlyMap<string, MtaCanonicalRecord>,
): OperationalOccurrenceAcceptedDecisionV3 {
  const occurrenceId = deterministicOperationalOccurrenceId(spec.candidate_key);
  const onsetEvidence = evidenceList(
    records,
    spec.onset.evidence,
    "event_date",
  );
  const routeEvidence = new Map(spec.routes.map((route) => [
    route.record_id,
    evidenceList(records, route.evidence, "route_identity"),
  ]));
  const treatmentEvidence = evidenceList(
    records,
    spec.treatment_evidence,
    "treatment_definition",
  );
  const corridorEvidence = evidenceList(
    records,
    spec.corridor_evidence,
    "treatment_scope",
  );
  const additionalEvidence = evidenceList(records, spec.additional_evidence);
  const allEvidence = sortEvidence([
    ...onsetEvidence,
    ...[...routeEvidence.values()].flat(),
    ...treatmentEvidence,
    ...corridorEvidence,
    ...additionalEvidence,
  ]);
  const applications = spec.routes.map((route) => ({
    application_id: resolvedInterventionDurableApplicationIdentity({
      occurrence_id: occurrenceId,
      route_record_id: route.record_id,
      treatment_record_id: spec.treatment_id,
      phase_record_id: spec.event_id,
    }),
    route_record_id: route.record_id,
    gtfs_route_id: route.public_id,
    treatment_record_id: spec.treatment_id,
    phase_record_id: spec.event_id,
    action: "add" as const,
    physical_scope_record_ids: [spec.corridor_id],
    extent: {
      kind: "bounded_segment" as const,
      record_ids: [spec.corridor_id],
      description: spec.corridor_description,
    },
    evidence_bindings: sortEvidence([
      ...onsetEvidence,
      ...(routeEvidence.get(route.record_id) ?? []),
      ...treatmentEvidence,
      ...corridorEvidence,
      ...additionalEvidence,
    ]),
  })).sort((left, right) =>
    left.route_record_id.localeCompare(right.route_record_id)
  );
  const withoutFingerprint = {
    schema_version: 3 as const,
    decision_id:
      `plan-052-w1-current-${spec.candidate_id.replace("candidate:", "")}`,
    review_state: "approved" as const,
    occurrence_id: occurrenceId,
    founding_key: spec.candidate_key,
    anchor_review_decision_ids: [],
    observation_event_record_ids: [spec.event_id],
    observation_relation_record_ids:
      [...spec.observation_relation_ids].sort(),
    resolution_cluster_id: null,
    phase_record_ids: [spec.event_id],
    phase_relation_record_ids: [...spec.phase_relation_ids].sort(),
    physical_scope_record_ids: [spec.corridor_id],
    physical_scope_relation_record_ids:
      [...spec.physical_scope_relation_ids].sort(),
    resolved_onset: {
      date: spec.onset.date,
      precision: spec.onset.precision,
      evidence_bindings: onsetEvidence,
    },
    routes: spec.routes.map((route) => ({
      route_record_id: route.record_id,
      gtfs_route_id: route.public_id,
      evidence_bindings: routeEvidence.get(route.record_id)!,
    })).sort((left, right) =>
      left.route_record_id.localeCompare(right.route_record_id)
    ),
    treatment: {
      kind: "atomic" as const,
      member: {
        treatment_record_id: spec.treatment_id,
        treatment_family: spec.treatment_family,
        evidence_bindings: treatmentEvidence,
      },
    },
    applications,
    evidence_bindings: allEvidence,
    reviewers: spec.authority === "owner_adjudication"
      ? [
          "plan-052-wave1-fresh-independent-adjudicator",
          "plan-052-wave1-owner-adjudication",
        ]
      : [
          "plan-052-wave1-independent-reviewer",
          "plan-052-wave1-primary-reviewer",
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

function identityOperation(
  spec: PositiveSpec,
  decision: OperationalOccurrenceAcceptedDecisionV3,
  index: number,
): OperationalOccurrenceIdentityOperation {
  return parseOperationalOccurrenceIdentityOperation({
    schema_version: 1,
    operation_id: `establish:${decision.occurrence_id}`,
    kind: "establish",
    issued_at:
      `2026-07-30T12:29:${String(index).padStart(2, "0")}.000Z`,
    reviewer: "plan-052-wave1-reconciled-review-board",
    decision_id: decision.decision_id,
    rationale: spec.rationale,
    affected_founding_event_record_ids: [spec.event_id],
    occurrence_id: decision.occurrence_id,
    founding_key: spec.candidate_key,
    founding_event_record_ids: [spec.event_id],
    resolution_cluster_id: null,
  });
}

function mappingFor(
  spec: PositiveSpec,
  decision: OperationalOccurrenceAcceptedDecisionV3,
) {
  return parseOperationalEpisodeAcceptedMapping({
    schema_version: 1,
    mapping_id: `mapping:${decision.occurrence_id}`,
    adapter_id: "accepted_mapping_v1",
    observation_event_record_ids: [spec.event_id],
    observation_relation_record_ids:
      [...spec.observation_relation_ids].sort(),
    candidate_keys: [spec.candidate_key],
    occurrence_id: decision.occurrence_id,
    evidence_bindings: plainEvidence(decision.evidence_bindings),
    decision_id: decision.decision_id,
    reviewer: "plan-052-wave1-reconciled-review-board",
    reviewed_at: acceptedAt,
    rationale: spec.rationale,
  });
}

function verifyAuthorities(): {
  manifest: { path: string; sha256: string };
  authorities: Array<{ path: string; sha256: string }>;
} {
  const manifest = pointer(manifestRelative);
  if (
    manifest.sha256 !==
      "b96adbd4878a5abfae2cd9523c3534239195ea876dc0877fffc5abc8a99fbe7e"
  ) {
    throw new Error("Wave 1 frozen manifest hash drifted");
  }
  const authorities = [
    pointer(primaryRelative),
    pointer(independentRelative),
    pointer(adjudicationRelative),
    pointer(reconciliationRelative),
    pointer(supplementRelative),
  ];
  const frozen = new Map(readJsonl(frozenCandidateRelative).map((row) => [
    String(row.candidate_id),
    row,
  ]));
  for (const spec of specs) {
    const row = frozen.get(spec.candidate_id);
    if (
      !row ||
      row.candidate_key !== spec.candidate_key ||
      row.disposition !== "pending_review" ||
      stableJson(row.observation_event_record_ids as JsonValue) !==
        stableJson([spec.event_id] as JsonValue)
    ) {
      throw new Error(`${spec.candidate_id} frozen membership drifted`);
    }
  }
  const primary = object(
    JSON.parse(readFileSync(absolute(primaryRelative), "utf8")) as unknown,
    primaryRelative,
  );
  const independent = object(
    JSON.parse(readFileSync(absolute(independentRelative), "utf8")) as unknown,
    independentRelative,
  );
  const primaryById = new Map(
    (primary.findings as unknown[]).map((value, index) => {
      const finding = object(value, `${primaryRelative}.findings[${index}]`);
      return [String(finding.candidate_id), finding];
    }),
  );
  const independentById = new Map(
    (independent.findings as unknown[]).map((value, index) => {
      const finding = object(value, `${independentRelative}.findings[${index}]`);
      return [String(finding.candidate_id), finding];
    }),
  );
  const agreement = specs.find((spec) =>
    spec.authority === "dual_review_agreement"
  )!;
  if (
    primaryById.get(agreement.candidate_id)?.recommended_disposition !==
      "published" ||
    independentById.get(agreement.candidate_id)?.recommended_disposition !==
      "published"
  ) {
    throw new Error("Wave 1 Q52/Q53 publication agreement drifted");
  }
  return { manifest, authorities };
}

function expectedSemanticFiles(): {
  files: Map<string, string>;
  operations: OperationalOccurrenceIdentityOperation[];
  decisions: OperationalOccurrenceAcceptedDecisionV3[];
  manifest: { path: string; sha256: string };
  authorities: Array<{ path: string; sha256: string }>;
} {
  const { manifest, authorities } = verifyAuthorities();
  const records = new Map(readCanonicalRecords().map((record) => [
    record.record_id,
    record,
  ]));
  const files = new Map<string, string>();
  const decisions = specs.map((spec) => reviewDecision(spec, records));
  const operations = specs.map((spec, index) =>
    identityOperation(spec, decisions[index]!, index)
  );
  for (const [index, spec] of specs.entries()) {
    const decision = decisions[index]!;
    const operation = operations[index]!;
    const mapping = mappingFor(spec, decision);
    files.set(
      `${reviewDir}/${decision.decision_id}.json`,
      json(decision),
    );
    files.set(
      `${mappingDir}/${mapping.mapping_id}.json`,
      json(mapping),
    );
    files.set(
      `${identityAcceptedDir}/${operation.operation_id}.json`,
      json(operation),
    );
  }
  return { files, operations, decisions, manifest, authorities };
}

function expectedIdentityFiles(
  semantic: ReturnType<typeof expectedSemanticFiles>,
): void {
  const migration = loadOperationalOccurrenceIdentityOperations(
    absolute(identityMigrationDir),
  );
  const acceptedOperations = existsSync(absolute(identityAcceptedDir))
    ? loadOperationalOccurrenceIdentityOperations(
        absolute(identityAcceptedDir),
      )
    : semantic.operations;
  const ordered = [...acceptedOperations].sort((left, right) =>
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
      semantic.files.get(operationRelative) ??
      readFileSync(absolute(operationRelative), "utf8");
    const resultRegistry = operationalOccurrenceIdentityRegistryV2Jsonl(
      replayOperationalOccurrenceIdentityOperations([
        ...migration,
        ...applied,
      ]),
    );
    const managed = semantic.operations.some((candidate) =>
      candidate.operation_id === operation.operation_id
    );
    if (managed) {
      const decision = semantic.decisions.find((candidate) =>
        candidate.decision_id === operation.decision_id
      )!;
      semantic.files.set(
        `${identityReceiptDir}/${operation.operation_id}.json`,
        json({
          schema_version: 1,
          operation_id: operation.operation_id,
          batch_id: batchId,
          batch_manifest_path: semantic.manifest.path,
          batch_manifest_sha256: semantic.manifest.sha256,
          primary_reviewer: "plan-052-wave1-primary-reviewer",
          independent_reviewer:
            "plan-052-wave1-fresh-independent-adjudicator",
          evidence_bindings: plainEvidence(decision.evidence_bindings),
          basis_registry_sha256: sha256(priorRegistry),
          operation_sha256: sha256(operationBytes),
          result_registry_sha256: sha256(resultRegistry),
        }),
      );
    }
    priorRegistry = resultRegistry;
  }
  semantic.files.set(identityCurrentRegistry, priorRegistry);
}

function semanticReceipt(
  semantic: ReturnType<typeof expectedSemanticFiles>,
): string {
  const artifacts = specs.map((spec, index) => {
    const decision = semantic.decisions[index]!;
    const operation = semantic.operations[index]!;
    const mappingRelative =
      `${mappingDir}/mapping:${decision.occurrence_id}.json`;
    return {
      candidate_id: spec.candidate_id,
      candidate_key: spec.candidate_key,
      authority: spec.authority,
      occurrence_id: decision.occurrence_id,
      review_decision: {
        path: `${reviewDir}/${decision.decision_id}.json`,
        sha256: sha256(semantic.files.get(
          `${reviewDir}/${decision.decision_id}.json`,
        )!),
      },
      identity_operation: {
        path: `${identityAcceptedDir}/${operation.operation_id}.json`,
        sha256: sha256(semantic.files.get(
          `${identityAcceptedDir}/${operation.operation_id}.json`,
        )!),
      },
      identity_receipt: {
        path: `${identityReceiptDir}/${operation.operation_id}.json`,
        sha256: sha256(semantic.files.get(
          `${identityReceiptDir}/${operation.operation_id}.json`,
        )!),
      },
      accepted_mapping: {
        path: mappingRelative,
        sha256: sha256(semantic.files.get(mappingRelative)!),
      },
      exact_application_incidence: decision.applications.map((application) =>
        [
          application.route_record_id,
          application.gtfs_route_id,
          application.treatment_record_id,
          application.phase_record_id,
          application.extent.kind,
        ].join("|")
      ),
      onset: decision.resolved_onset,
    };
  });
  return json({
    schema_version: 1,
    contract_id: "plan-052-wave1-positive-integration-receipt-v1",
    plan_id: "plan-052",
    batch_id: batchId,
    integrated_at: acceptedAt,
    manifest: semantic.manifest,
    authorities: semantic.authorities,
    append_only_semantic_artifacts: artifacts,
    candidate_count: artifacts.length,
    application_count: artifacts.reduce(
      (sum, artifact) => sum + artifact.exact_application_incidence.length,
      0,
    ),
    historical_migration_files_changed: false,
    frozen_manifest_changed: false,
    canonical_observations_changed: false,
    representation_repairs: [
      "source-stated season onset",
      "installed-by upper-bound onset",
      "historical M16 route label with explicit canonical M34A successor continuity",
    ],
    prohibited_inferences: [
      "No Broadway route other than Q70+.",
      "No Utica treatment from the later Spring 2016 SBS launch.",
      "No backdating of the M34A+ public designation to October 4.",
      "No Q52/Q53 plural-treatment cross-product.",
    ],
    provider_usage: {
      request_count: 0,
      actual_cost_usd: 0,
      aggregate_ceiling_usd: 1,
    },
  });
}

function writeFiles(files: ReadonlyMap<string, string>): void {
  for (const [relativePath, content] of files) {
    mkdirSync(dirname(absolute(relativePath)), { recursive: true });
    writeFileSync(absolute(relativePath), content, "utf8");
  }
}

function checkFiles(files: ReadonlyMap<string, string>): void {
  for (const [relativePath, content] of files) {
    if (
      !existsSync(absolute(relativePath)) ||
      readFileSync(absolute(relativePath), "utf8") !== content
    ) {
      throw new Error(`${relativePath} is missing or stale`);
    }
  }
  const managedOperationIds = new Set(specs.map((spec) =>
    `establish:${deterministicOperationalOccurrenceId(spec.candidate_key)}`
  ));
  if (existsSync(absolute(identityAcceptedDir))) {
    const duplicateFiles = readdirSync(absolute(identityAcceptedDir))
      .filter((name) => name.endsWith(".json"))
      .filter((name) => {
        const operation = parseOperationalOccurrenceIdentityOperation(
          JSON.parse(readFileSync(join(absolute(identityAcceptedDir), name), "utf8")) as unknown,
        );
        return managedOperationIds.has(operation.operation_id) &&
          `${operation.operation_id}.json` !== basename(name);
      });
    if (duplicateFiles.length > 0) {
      throw new Error(`managed identity operation filename drift: ${duplicateFiles.join(", ")}`);
    }
  }
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== "--write" && mode !== "--check") {
    throw new Error(
      "usage: bun scripts/integrate-plan052-wave1-positive-occurrences.ts --write|--check",
    );
  }
  if (process.argv.length !== 3) {
    throw new Error(`unknown argument(s): ${process.argv.slice(3).join(", ")}`);
  }
  const semantic = expectedSemanticFiles();
  if (mode === "--write") {
    writeFiles(semantic.files);
  }
  expectedIdentityFiles(semantic);
  semantic.files.set(
    integrationReceiptRelative,
    semanticReceipt(semantic),
  );
  semantic.files.set(
    representationRepairRelative,
    json({
      schema_version: 1,
      contract_id: "plan-052-wave1-representation-repair-v1",
      plan_id: "plan-052",
      batch_id: batchId,
      recorded_at: acceptedAt,
      historical_stop_receipt: pointer(reconciliationRelative),
      historical_independent_adjudication: pointer(adjudicationRelative),
      positive_integration_receipt: {
        path: integrationReceiptRelative,
        sha256: sha256(semantic.files.get(integrationReceiptRelative)!),
      },
      resolution: {
        factual_contradiction_found: false,
        frozen_denominator_changed: false,
        canonical_observations_changed: false,
        representation_gap_repaired_in_scope: true,
        historical_route_continuity_preserved: true,
        integration_permitted: true,
        wave_2_permitted: true,
      },
      accepted_representation: {
        onset_precisions: [
          "day",
          "month",
          "year",
          "season",
          "upper_bound_day",
        ],
        historical_route_subject:
          "route_m16-mentioned with historical public label M16",
        successor_continuity_relation: "relation_m16-renamed-to-m34a",
        successor_route_subject: "route_m34a-sbs",
      },
      owner_scope_preserved: {
        plan_052_only: true,
        plan_053_or_later_authorized: false,
        publication_authorized: false,
        push_merge_deploy_authorized: false,
      },
    }),
  );
  if (mode === "--write") writeFiles(semantic.files);
  checkFiles(semantic.files);
  console.log(JSON.stringify({
    status: mode === "--write" ? "written" : "verified",
    batch_id: batchId,
    candidate_count: specs.length,
    occurrence_ids: semantic.decisions.map((decision) => decision.occurrence_id),
    application_count: semantic.decisions.reduce(
      (sum, decision) => sum + decision.applications.length,
      0,
    ),
    identity_registry_sha256:
      sha256(semantic.files.get(identityCurrentRegistry)!),
    provider_cost_usd: 0,
  }, null, 2));
}

main();
