import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type { MtaObservationKind } from "@mta-wiki/db/types";

export const RELATIONSHIP_FAMILY_REVIEW_RELATIVE_PATH =
  "data/review_notes/codex-relationship-family-warning-review-2026-07-17.json";

export const RELATIONSHIP_FAMILY_REVIEW_SHA256 =
  "3ff8f9c9d35ce8f1928c2e3d7ea03d0b6bdece1f25065171799d696f7d12d56f";

const REVIEW_ID = "codex-relationship-family-warning-review-2026-07-17";
const CONTRACT_ID = "relationship-contract-v1";
const VALID_DISPOSITIONS = new Set([
  "reviewed_valid_narrow_shape",
  "reviewed_valid_after_identity_remediation",
]);

type ExpectedReviewedDecision = {
  decisionId: string;
  recordId: string;
  primaryDisposition:
    | "reviewed_valid_narrow_shape"
    | "reviewed_valid_after_identity_remediation";
  relationKind: string;
  relationFamily: string;
  subjectId: string;
  objectId: string;
  subjectKind: MtaObservationKind;
  objectKind: MtaObservationKind;
  semanticDecisionIds: readonly string[];
  evidence: readonly { evidenceId: string; textSha256: string }[];
};

const EXPECTED_REVIEWED_DECISIONS = [
  {
    decisionId: "m86-route-succession-narrow-shape",
    recordId: "relation_rel-m86-local-replaced-by-m86-sbs",
    primaryDisposition: "reviewed_valid_narrow_shape",
    relationKind: "replaced_by",
    relationFamily: "timeline_context",
    subjectId: "route_m86-local",
    objectId: "route_m86-sbs",
    subjectKind: "route",
    objectKind: "route",
    semanticDecisionIds: ["relationship-tuple-review-v1:0938"],
    evidence: [
      {
        evidenceId: "m86_sbs_progress_report_2017#p006_c0005",
        textSha256:
          "sha256:57fac219b06bcddd3aaf8f124a17eeb88bef33ee30911325ac25e85c781663b6",
      },
      {
        evidenceId: "m86_sbs_progress_report_2017#p008_c0008",
        textSha256:
          "sha256:ceb0835506f88894e52e69f0ec8f5fc1fb37348ddc68b17ac1756e91b0a8db3e",
      },
    ],
  },
  {
    decisionId: "mets-willets-physical-rail-line-shape",
    recordId: "relation_mets-willets-on-flushing-line-208006",
    primaryDisposition: "reviewed_valid_narrow_shape",
    relationKind: "located_on",
    relationFamily: "corridor_scope",
    subjectId: "project_mets-willets-station-sog-208006",
    objectId: "route_irt-flushing-line-7-208006",
    subjectKind: "project",
    objectKind: "route",
    semanticDecisionIds: ["relationship-tuple-review-v1:0653"],
    evidence: [
      {
        evidenceId: "meeting_doc_208006#p044_c0007",
        textSha256:
          "sha256:dcd1fdef924d8393e87a9db8e6c8f9229726a95d62205e7f00edad0e02edef30",
      },
    ],
  },
  {
    decisionId: "mta-launches-data-analytics-blog",
    recordId: "relation_rel-mta-launches-data-analytics-blog",
    primaryDisposition: "reviewed_valid_after_identity_remediation",
    relationKind: "launches",
    relationFamily: "timeline_context",
    subjectId: "entity_mta-entity-update-2025",
    objectId: "entity_mta-data-analytics-blog",
    subjectKind: "entity",
    objectKind: "entity",
    semanticDecisionIds: [
      "relationship-tuple-review-v1:0616",
      "relationship-semantic-remediation-v1/part-1/relation_rel-mta-launches-data-analytics-blog",
    ],
    evidence: [
      {
        evidenceId: "open_data_plan_2024_update#p004_c0006",
        textSha256:
          "sha256:2f67a6f63538ba0cd8570c21afb855c7d6e1e77045fcfe63747cc59d5b7e1a23",
      },
    ],
  },
] as const satisfies readonly ExpectedReviewedDecision[];

const EXPECTED_BY_DECISION_ID: ReadonlyMap<
  string,
  ExpectedReviewedDecision
> = new Map(
  EXPECTED_REVIEWED_DECISIONS.map((decision) => [
    decision.decisionId,
    decision,
  ]),
);
const EXPECTED_BY_RECORD_ID: ReadonlyMap<
  string,
  ExpectedReviewedDecision
> = new Map(
  EXPECTED_REVIEWED_DECISIONS.map((decision) => [
    decision.recordId,
    decision,
  ]),
);

export type ReviewedRelationshipFamilyDecision = {
  decision_id: string;
  record_id: string;
  primary_disposition:
    | "reviewed_valid_narrow_shape"
    | "reviewed_valid_after_identity_remediation";
  relation_kind: string;
  relation_family: string;
  subject_id: string;
  object_id: string;
  subject_kind: MtaObservationKind;
  object_kind: MtaObservationKind;
  semantic_decision_ids: string[];
  evidence: Array<{ evidence_id: string; text_sha256: string }>;
};

export type LoadedRelationshipFamilyReview = {
  review_id: typeof REVIEW_ID;
  contract_id: typeof CONTRACT_ID;
  reviewed_at: string;
  reviewed_by: string;
  ledger_path: typeof RELATIONSHIP_FAMILY_REVIEW_RELATIVE_PATH;
  ledger_sha256: typeof RELATIONSHIP_FAMILY_REVIEW_SHA256;
  reviewed_by_record_id: ReadonlyMap<
    string,
    ReviewedRelationshipFamilyDecision
  >;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const values = value.map((entry, index) =>
    string(entry, `${label}[${index}]`)
  );
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicate values`);
  }
  return values;
}

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function reviewedDecision(
  value: Record<string, unknown>,
  index: number,
): ReviewedRelationshipFamilyDecision | undefined {
  const label = `relationship family review decisions[${index}]`;
  const decisionId = string(value.decision_id, `${label}.decision_id`);
  const recordId = string(value.record_id, `${label}.record_id`);
  const disposition = string(
    value.primary_disposition,
    `${label}.primary_disposition`,
  );
  if (!VALID_DISPOSITIONS.has(disposition)) return undefined;

  const expected = EXPECTED_BY_DECISION_ID.get(decisionId);
  if (!expected || expected.recordId !== recordId) {
    throw new Error(
      `relationship family review contains unknown reviewed relation ${recordId} (${decisionId})`,
    );
  }
  const expectedForRecord = EXPECTED_BY_RECORD_ID.get(recordId);
  if (expectedForRecord?.decisionId !== decisionId) {
    throw new Error(
      `relationship family review decision/record mapping drifted for ${recordId}`,
    );
  }

  const semanticDecisionIds = value.semantic_decision_ids === undefined
    ? [
        string(
          value.semantic_decision_id,
          `${label}.semantic_decision_id`,
        ),
      ]
    : stringArray(
        value.semantic_decision_ids,
        `${label}.semantic_decision_ids`,
      );
  const evidenceIds = stringArray(value.evidence_ids, `${label}.evidence_ids`);
  const exactFields =
    disposition === expected.primaryDisposition &&
    value.relation_kind === expected.relationKind &&
    value.relation_family === expected.relationFamily &&
    value.subject_id === expected.subjectId &&
    value.object_id === expected.objectId &&
    value.subject_kind === expected.subjectKind &&
    value.object_kind === expected.objectKind &&
    equalStrings(semanticDecisionIds, expected.semanticDecisionIds) &&
    equalStrings(
      evidenceIds,
      expected.evidence.map((entry) => entry.evidenceId),
    );
  if (!exactFields) {
    throw new Error(
      `relationship family review decision drifted from its pinned adjudication: ${decisionId}`,
    );
  }

  return {
    decision_id: decisionId,
    record_id: recordId,
    primary_disposition: disposition as ReviewedRelationshipFamilyDecision["primary_disposition"],
    relation_kind: expected.relationKind,
    relation_family: expected.relationFamily,
    subject_id: expected.subjectId,
    object_id: expected.objectId,
    subject_kind: expected.subjectKind,
    object_kind: expected.objectKind,
    semantic_decision_ids: [...semanticDecisionIds],
    evidence: expected.evidence.map((entry) => ({
      evidence_id: entry.evidenceId,
      text_sha256: entry.textSha256,
    })),
  };
}

export function parseRelationshipFamilyReviewLedger(
  text: string,
): LoadedRelationshipFamilyReview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `relationship family review ledger is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const root = object(parsed, "relationship family review ledger");
  if (
    root.schema_version !== 1 ||
    root.review_id !== REVIEW_ID ||
    root.contract_id !== CONTRACT_ID
  ) {
    throw new Error("unsupported relationship family review ledger header");
  }
  const reviewedAt = string(root.reviewed_at, "family review reviewed_at");
  const reviewedBy = string(root.reviewed_by, "family review reviewed_by");
  const scope = object(root.scope, "relationship family review scope");
  if (
    scope.finding_code !== "REL_FAMILY_TYPE_SUSPECT" ||
    scope.input_finding_count !== 4
  ) {
    throw new Error("relationship family review scope drifted");
  }
  if (!Array.isArray(root.decisions)) {
    throw new Error("relationship family review decisions must be an array");
  }

  const decisions = root.decisions.map((entry, index) =>
    object(entry, `relationship family review decisions[${index}]`)
  );
  const decisionIds = decisions.map((entry, index) =>
    string(entry.decision_id, `relationship family review decisions[${index}].decision_id`)
  );
  const recordIds = decisions.map((entry, index) =>
    string(entry.record_id, `relationship family review decisions[${index}].record_id`)
  );
  if (new Set(decisionIds).size !== decisionIds.length) {
    throw new Error("relationship family review contains duplicate decision ids");
  }
  if (new Set(recordIds).size !== recordIds.length) {
    throw new Error("relationship family review contains duplicate record decisions");
  }

  const reviewed = decisions
    .map(reviewedDecision)
    .filter(
      (decision): decision is ReviewedRelationshipFamilyDecision =>
        decision !== undefined,
    );
  if (
    reviewed.length !== EXPECTED_REVIEWED_DECISIONS.length ||
    reviewed.some(
      (decision) =>
        !EXPECTED_BY_DECISION_ID.has(decision.decision_id) ||
        !EXPECTED_BY_RECORD_ID.has(decision.record_id),
    )
  ) {
    throw new Error(
      "relationship family review does not contain exactly the three pinned reviewed advisories",
    );
  }

  const remediation = decisions.filter(
    (decision) =>
      decision.primary_disposition ===
      "endpoint_precision_remediation_required",
  );
  if (
    remediation.length !== 1 ||
    remediation[0]?.decision_id !== "moodys-rating-event-precision" ||
    remediation[0]?.record_id !== "relation_moodys-upgraded-mta-trb"
  ) {
    throw new Error(
      "relationship family review remediation decision drifted",
    );
  }
  if (decisions.length !== reviewed.length + remediation.length) {
    throw new Error(
      "relationship family review contains an unknown disposition",
    );
  }

  const summary = object(root.summary, "relationship family review summary");
  if (
    summary.reviewed_valid_narrow_shape_count !== 3 ||
    summary.remediation_required_count !== 1 ||
    summary.silent_exception_count !== 0
  ) {
    throw new Error("relationship family review summary does not reconcile");
  }

  const actualSha256 = sha256(text);
  if (actualSha256 !== RELATIONSHIP_FAMILY_REVIEW_SHA256) {
    throw new Error(
      `relationship family review ledger hash mismatch: expected ${RELATIONSHIP_FAMILY_REVIEW_SHA256}, found ${actualSha256}`,
    );
  }

  return {
    review_id: REVIEW_ID,
    contract_id: CONTRACT_ID,
    reviewed_at: reviewedAt,
    reviewed_by: reviewedBy,
    ledger_path: RELATIONSHIP_FAMILY_REVIEW_RELATIVE_PATH,
    ledger_sha256: RELATIONSHIP_FAMILY_REVIEW_SHA256,
    reviewed_by_record_id: new Map(
      reviewed.map((decision) => [decision.record_id, decision]),
    ),
  };
}

export function loadRelationshipFamilyReviewLedger(): LoadedRelationshipFamilyReview {
  return parseRelationshipFamilyReviewLedger(
    readFileSync(
      join(repoRoot, RELATIONSHIP_FAMILY_REVIEW_RELATIVE_PATH),
      "utf8",
    ),
  );
}
