import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonValue } from "@mta-wiki/db/types";

export const RC19_RECONCILIATION_PINS = {
  tracker_audit_commit: "12c9a53b69186baa3a125bc9d0b251a40e5e821f",
  candidate_set_id: "candidate-set-v2:24080902f508b55a0033df32",
  candidate_set_sha256: "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba",
  reconciliation_sha256: "8b5f77c9391970223aaa1fee8c3833a2d00c90e1755b80267c76ffbfb95c522c",
  audit_sha256: "7b0241a4a9e9de27eb3dcf1b71ead532718e9f05be357af91212351120d6fe00",
  hard_gate_sha256: "dec178065b02bbd61bd63a3be2b61a1fe8b7ea33266afcaf161bf93606f7b86c",
  deep_review_sha256: "cb7e2f7f74191a798ca075245f9a66996aa643ee71e615b0cfba8e1809629691",
  rc19_manifest_sha256: "c5d4563d37815d330b37898774a027fb07563335163fcfccbaeebfc3da81720f",
  rc19_generator_commit: "35984e9d75ee00849ee5a580a45064976122e4bb",
  rc19_occurrence_artifact_sha256: "424ee1ceed24bc8c8af77d49e328c0f6bb7859e88a619bbb79a0c13ac7ed5399",
  candidate_count: 489,
  rejected_count: 473,
  approved_recommendation_count: 16,
  hard_reject_count: 434,
  deep_review_input_count: 55,
  deep_reject_count: 39,
  mechanical_spine_only_count: 219,
  mechanical_spine_calendar_count: 152,
  mechanical_calendar_only_count: 63,
} as const;

export type Rc19ReconciliationPaths = {
  candidateSetPath: string;
  reconciliationPath: string;
  auditPath: string;
  hardGatePath: string;
  deepReviewPath: string;
  rc19ManifestPath: string;
};

export type Rc19ReconciliationExpectations = {
  candidateSetId: string;
  candidateSetSha256: string;
  reconciliationSha256: string;
  auditSha256: string;
  hardGateSha256: string;
  deepReviewSha256: string;
  manifestSha256: string;
  generatorCommit: string;
  occurrenceArtifactSha256: string;
  candidateCount: number;
  rejectedCount: number;
  approvedRecommendationCount: number;
  hardRejectCount: number;
  deepReviewInputCount: number;
  deepRejectCount: number;
  mechanicalSpineOnlyCount: number;
  mechanicalSpineCalendarCount: number;
  mechanicalCalendarOnlyCount: number;
  assertRc19DeepComposition?: boolean;
  sourceFixCandidateIds?: readonly string[];
};

export const DEFAULT_RC19_RECONCILIATION_EXPECTATIONS: Rc19ReconciliationExpectations = {
  candidateSetId: RC19_RECONCILIATION_PINS.candidate_set_id,
  candidateSetSha256: RC19_RECONCILIATION_PINS.candidate_set_sha256,
  reconciliationSha256: RC19_RECONCILIATION_PINS.reconciliation_sha256,
  auditSha256: RC19_RECONCILIATION_PINS.audit_sha256,
  hardGateSha256: RC19_RECONCILIATION_PINS.hard_gate_sha256,
  deepReviewSha256: RC19_RECONCILIATION_PINS.deep_review_sha256,
  manifestSha256: RC19_RECONCILIATION_PINS.rc19_manifest_sha256,
  generatorCommit: RC19_RECONCILIATION_PINS.rc19_generator_commit,
  occurrenceArtifactSha256: RC19_RECONCILIATION_PINS.rc19_occurrence_artifact_sha256,
  candidateCount: RC19_RECONCILIATION_PINS.candidate_count,
  rejectedCount: RC19_RECONCILIATION_PINS.rejected_count,
  approvedRecommendationCount: RC19_RECONCILIATION_PINS.approved_recommendation_count,
  hardRejectCount: RC19_RECONCILIATION_PINS.hard_reject_count,
  deepReviewInputCount: RC19_RECONCILIATION_PINS.deep_review_input_count,
  deepRejectCount: RC19_RECONCILIATION_PINS.deep_reject_count,
  mechanicalSpineOnlyCount: RC19_RECONCILIATION_PINS.mechanical_spine_only_count,
  mechanicalSpineCalendarCount: RC19_RECONCILIATION_PINS.mechanical_spine_calendar_count,
  mechanicalCalendarOnlyCount: RC19_RECONCILIATION_PINS.mechanical_calendar_only_count,
  assertRc19DeepComposition: true,
  sourceFixCandidateIds: [
    "study-event-v2:06559cef3f03e1672b7dd685",
    "study-event-v2:8759b24539a59fc715b1dff3",
  ],
};

type EvidenceBinding = {
  role?: string | undefined;
  record_id?: string | undefined;
  source_id?: string | undefined;
  evidence_id?: string | undefined;
};

type CandidateProvenance = {
  sourceKind: string;
  sourceId: string;
  sourceEventId: string;
  releaseId?: string | null | undefined;
  manifestSha256?: string | null | undefined;
  artifactSha256?: string | null | undefined;
  occurrenceId?: string | null | undefined;
  occurrenceReviewDecisionId?: string | null | undefined;
  gtfsRouteId?: string | null | undefined;
  analysisRouteId?: string | null | undefined;
  routeEvidenceBindings?: EvidenceBinding[] | undefined;
  treatmentEvidenceBindings?: EvidenceBinding[] | undefined;
};

type Candidate = {
  candidateId: string;
  routeId: string;
  treatmentFamily: string;
  implementationDate: string;
  implementationMonth: string;
  datePrecision: string;
  occurrenceId: string | null;
  confounderGroupId: string | null;
  treatmentScopeKind: string;
  componentTreatmentFamilies: string[];
  provenance: CandidateProvenance[];
  conflictState: string;
};

type GateName = "evidenceScope" | "date" | "spine" | "outcome" | "conflict" | "confounder";
const GATE_NAMES: readonly GateName[] = ["evidenceScope", "date", "spine", "outcome", "conflict", "confounder"];

type Recommendation = {
  sourceBatchId: string;
  authorization: string;
  candidateId: string;
  identity: string;
  routeId: string;
  treatmentFamily: string;
  implementationDate: string;
  recommendation: string;
  rationale: string;
  gates: Record<GateName, string>;
};

type HardDecision = {
  candidateId: string;
  identity: string;
  recommendation: string;
  hardGateFacts: {
    spineReadiness: string;
    spineReasons: string[];
    preMonthCount: number;
    postMonthCount: number;
    calendarMinimumFourPerSide: boolean;
  };
};

type DeepCandidate = { candidateId: string; identity: string };

export type Rc19ReasonCode =
  | "mta_evidence_acquisition_gap"
  | "mta_route_or_treatment_scope_binding_gap"
  | "mta_date_phase_occurrence_identity_gap"
  | "producer_contract_or_projection_gap"
  | "tracker_exact_lane_overlap_spine_gap"
  | "tracker_route_pattern_grouping_gap"
  | "outcome_window_time_bound_gap"
  | "overlap_confounder_causal_design_rejection"
  | "intentionally_invalid_or_duplicate_phase"
  | "human_authority_required";

const ALL_REASONS: readonly Rc19ReasonCode[] = [
  "mta_evidence_acquisition_gap",
  "mta_route_or_treatment_scope_binding_gap",
  "mta_date_phase_occurrence_identity_gap",
  "producer_contract_or_projection_gap",
  "tracker_exact_lane_overlap_spine_gap",
  "tracker_route_pattern_grouping_gap",
  "outcome_window_time_bound_gap",
  "overlap_confounder_causal_design_rejection",
  "intentionally_invalid_or_duplicate_phase",
  "human_authority_required",
];

export type Rc19RejectLedgerRow = {
  schema_version: 1;
  candidate_set_id: string;
  candidate_set_sha256: string;
  candidate_id: string;
  identity: string;
  route_id: string;
  treatment_family: string;
  implementation_date: string;
  date_precision: string;
  occurrence_id_at_rc19: string | null;
  review_batch_id: string;
  authorization: string;
  input_hashes: Record<string, string>;
  current_hard_failures: Array<{ gate: GateName; finding: string }>;
  current_followups: Array<{ gate: GateName; finding: string }>;
  source_evidence: CandidateProvenance[];
  source_evidence_container_sha256: string;
  source_evidence_hashes: string[];
  root_cause: Rc19ReasonCode;
  owning_system: string;
  source_fixable: boolean;
  proposed_action: string;
  action_status: string;
  remaining_blocker: string;
  exclusive_primary_disposition: Rc19ReasonCode;
  nonexclusive_reasons_at_rc19: Rc19ReasonCode[];
  nonexclusive_reasons_after_mta_actions: Rc19ReasonCode[];
  mechanical_partition: "spine_only" | "spine_plus_calendar" | "calendar_only" | "deep_review";
  source_fix: GunHillSourceFix | null;
};

export type GunHillSourceFix = {
  status: "source_scope_and_completion_phase_repaired_not_projectable";
  occurrence_id: null;
  source_id: "nyc_dot_gun_hill_road_completion_2023";
  supporting_source_ids: readonly ["nyc_dot_gun_hill_road_completion_2023", "meeting_doc_127471"];
  source_url: "https://www.nyc.gov/html/dot/html/pr2023/east-gun-hill-road-redesign.shtml";
  source_artifact_sha256s: Record<string, string>;
  evidence: readonly { evidence_id: string; text_sha256: string; role: string }[];
  resolved_route_treatment_scope: string;
  resolved_completion_phase_date: "2023-10-31";
  first_operational_onset: null;
  unresolved: readonly ["phase_preserving_standard_occurrence_projection_contract", "exact_treated_lane_overlap_outcome_spine", "human_candidate_set_bound_replay"];
};

const GUN_HILL_FIX_BASE = {
  status: "source_scope_and_completion_phase_repaired_not_projectable",
  occurrence_id: null,
  source_id: "nyc_dot_gun_hill_road_completion_2023",
  supporting_source_ids: ["nyc_dot_gun_hill_road_completion_2023", "meeting_doc_127471"],
  source_url: "https://www.nyc.gov/html/dot/html/pr2023/east-gun-hill-road-redesign.shtml",
  source_artifact_sha256s: {
    "metadata.json": "bb26f2761fbdf79d94ae0df62e24551ce10391595e66f0da8066f216f9ff439c",
    "source.html": "66d8005f4c919f2dc65edc8acc0d926c213df833486ee857e38586ecc3937a99",
    "text.txt": "4f23cbc0937b5857b95b15e274379e1a4e2ec66f7b3dac75b2f6cebfcb66ee54",
    "blocks.jsonl": "bbfd1504126dc2d83d47d6e1c4335e4fb98457b9785dadfaf6aa35d4a617e905",
    "meeting_doc_127471/metadata.json": "3abae4c00097503d301593a61dd79537542cb80fb66fbf4fb64cb28c0c1c1df2",
    "meeting_doc_127471/source.pdf": "5d3a82851efed1316ff8b65540eaa7e33c7fe9d21221192740476002f50d51ce",
    "meeting_doc_127471/blocks.jsonl": "e3ee6c7214ec37ea01ecfa906cc26e8ba62b7ea5da30f56fcb312f42ef2e959a",
  },
  evidence: [
    { evidence_id: "nyc_dot_gun_hill_road_completion_2023#p001_b0010", text_sha256: "sha256:7bae7d6be36d5f4483b724271d610c3c269daf05d14487e9e679a6979beff5b0", role: "publication_and_status_as_of_date_not_physical_onset" },
    { evidence_id: "nyc_dot_gun_hill_road_completion_2023#p001_b0015", text_sha256: "sha256:5b2746623424ff7c40cc1ab19533e670e32b4a9ec5c4e498ff2e93ae1f267f37", role: "substantial_completion_status_as_of_publication" },
    { evidence_id: "nyc_dot_gun_hill_road_completion_2023#p001_b0021", text_sha256: "sha256:f2d50c0df7d117ee3f132cf6496b5e1c9f938e889b2a9f2b323178d6a1a77a86", role: "exact_route_scope" },
    { evidence_id: "nyc_dot_gun_hill_road_completion_2023#p001_b0024", text_sha256: "sha256:568131f4328fad9b16fd248365b3b7c573f5e5a5a158fce4f112cb1bbe682834", role: "bounded_treatment_segment" },
    { evidence_id: "meeting_doc_127471#p001_c0002", text_sha256: "sha256:e69c0d0941613a92d310b2b015f10809eea1561b1567a4752340b6747677fe1b", role: "report_year_context" },
    { evidence_id: "meeting_doc_127471#p015_c0011", text_sha256: "sha256:5d341caabe6b1c4265e38f291b8b527ffc02e724a0b5329fdf5167134f302cbf", role: "exact_completion_phase_date_not_first_operational_onset" },
  ],
  resolved_completion_phase_date: "2023-10-31",
  first_operational_onset: null,
  unresolved: ["phase_preserving_standard_occurrence_projection_contract", "exact_treated_lane_overlap_outcome_spine", "human_candidate_set_bound_replay"],
} as const;

export type AcePhaseIdentityRow = {
  schema_version: 1;
  candidate_id: string;
  identity: string;
  route_id: string;
  later_phase_date: string;
  prior_able_onset: string;
  phase_role: "later_ace_expansion_after_first_able_onset";
  independent_first_onset_candidate: false;
  mechanical_partition: Rc19RejectLedgerRow["mechanical_partition"];
  source_evidence: CandidateProvenance[];
  action: "preserve_as_context_do_not_treat_as_independent_first_onset";
};

export type Rc19ReconciliationResult = {
  ledger: Rc19RejectLedgerRow[];
  summary: Record<string, unknown>;
  workPackets: Record<string, unknown>;
  acePhaseIdentities: AcePhaseIdentityRow[];
  reportData: Record<string, unknown>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function string(value: unknown, label: string): string {
  assert(typeof value === "string", `${label} must be a string`);
  return value;
}

function number(value: unknown, label: string): number {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be a number`);
  return value;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readPinnedJson(path: string, expectedSha256: string, label: string): Record<string, unknown> {
  const bytes = readFileSync(path);
  const actual = sha256(bytes);
  assert(actual === expectedSha256, `${label} SHA-256 mismatch: expected ${expectedSha256}, got ${actual}`);
  return object(JSON.parse(bytes.toString("utf8")), label);
}

function uniqueById<T extends { candidateId: string }>(rows: readonly T[], label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    assert(!result.has(row.candidateId), `${label} duplicates ${row.candidateId}`);
    result.set(row.candidateId, row);
  }
  return result;
}

function parseProvenance(value: unknown, label: string): CandidateProvenance[] {
  return array(value, label).map((entry, index) => {
    const row = object(entry, `${label}[${index}]`);
    return {
      sourceKind: string(row.sourceKind, `${label}[${index}].sourceKind`),
      sourceId: string(row.sourceId, `${label}[${index}].sourceId`),
      sourceEventId: string(row.sourceEventId, `${label}[${index}].sourceEventId`),
      releaseId: typeof row.releaseId === "string" ? row.releaseId : null,
      manifestSha256: typeof row.manifestSha256 === "string" ? row.manifestSha256 : null,
      artifactSha256: typeof row.artifactSha256 === "string" ? row.artifactSha256 : null,
      occurrenceId: typeof row.occurrenceId === "string" ? row.occurrenceId : null,
      occurrenceReviewDecisionId: typeof row.occurrenceReviewDecisionId === "string" ? row.occurrenceReviewDecisionId : null,
      gtfsRouteId: typeof row.gtfsRouteId === "string" ? row.gtfsRouteId : null,
      analysisRouteId: typeof row.analysisRouteId === "string" ? row.analysisRouteId : null,
      routeEvidenceBindings: Array.isArray(row.routeEvidenceBindings) ? row.routeEvidenceBindings as EvidenceBinding[] : [],
      treatmentEvidenceBindings: Array.isArray(row.treatmentEvidenceBindings) ? row.treatmentEvidenceBindings as EvidenceBinding[] : [],
    };
  });
}

function parseCandidate(value: unknown, label: string): Candidate {
  const row = object(value, label);
  return {
    candidateId: string(row.candidateId, `${label}.candidateId`),
    routeId: string(row.routeId, `${label}.routeId`),
    treatmentFamily: string(row.treatmentFamily, `${label}.treatmentFamily`),
    implementationDate: string(row.implementationDate, `${label}.implementationDate`),
    implementationMonth: string(row.implementationMonth, `${label}.implementationMonth`),
    datePrecision: string(row.datePrecision, `${label}.datePrecision`),
    occurrenceId: typeof row.occurrenceId === "string" ? row.occurrenceId : null,
    confounderGroupId: typeof row.confounderGroupId === "string" ? row.confounderGroupId : null,
    treatmentScopeKind: string(row.treatmentScopeKind, `${label}.treatmentScopeKind`),
    componentTreatmentFamilies: array(row.componentTreatmentFamilies, `${label}.componentTreatmentFamilies`).map((item) => string(item, label)),
    provenance: parseProvenance(row.provenance, `${label}.provenance`),
    conflictState: string(row.conflictState, `${label}.conflictState`),
  };
}

function parseRecommendation(value: unknown, label: string): Recommendation {
  const row = object(value, label);
  const gates = object(row.gates, `${label}.gates`);
  const parsedGates = {} as Record<GateName, string>;
  for (const gate of GATE_NAMES) parsedGates[gate] = string(gates[gate], `${label}.gates.${gate}`);
  return {
    sourceBatchId: string(row.sourceBatchId, `${label}.sourceBatchId`),
    authorization: string(row.authorization, `${label}.authorization`),
    candidateId: string(row.candidateId, `${label}.candidateId`),
    identity: string(row.identity, `${label}.identity`),
    routeId: string(row.routeId, `${label}.routeId`),
    treatmentFamily: string(row.treatmentFamily, `${label}.treatmentFamily`),
    implementationDate: string(row.implementationDate, `${label}.implementationDate`),
    recommendation: string(row.recommendation, `${label}.recommendation`),
    rationale: string(row.rationale, `${label}.rationale`),
    gates: parsedGates,
  };
}

function parseHardDecision(value: unknown, label: string): HardDecision {
  const row = object(value, label);
  const facts = object(row.hardGateFacts, `${label}.hardGateFacts`);
  return {
    candidateId: string(row.candidateId, `${label}.candidateId`),
    identity: string(row.identity, `${label}.identity`),
    recommendation: string(row.recommendation, `${label}.recommendation`),
    hardGateFacts: {
      spineReadiness: string(facts.spineReadiness, `${label}.hardGateFacts.spineReadiness`),
      spineReasons: array(facts.spineReasons, `${label}.hardGateFacts.spineReasons`).map((item) => string(item, label)),
      preMonthCount: number(facts.preMonthCount, `${label}.hardGateFacts.preMonthCount`),
      postMonthCount: number(facts.postMonthCount, `${label}.hardGateFacts.postMonthCount`),
      calendarMinimumFourPerSide: facts.calendarMinimumFourPerSide === true,
    },
  };
}

function identity(candidate: Candidate): string {
  return `${candidate.routeId}|${candidate.treatmentFamily}|${candidate.implementationDate}|${candidate.datePrecision}`;
}

function isFailure(value: string): boolean {
  return value.startsWith("fail") || value.startsWith("unresolved:");
}

function isFollowup(value: string): boolean {
  return value.startsWith("needs_followup") || value.startsWith("requires_") || value.startsWith("flagged:");
}

function isLaterAce(recommendation: Recommendation): boolean {
  return recommendation.treatmentFamily === "automated_bus_lane_enforcement"
    && /later.+phase|prior same-family ABLE/iu.test(recommendation.gates.evidenceScope);
}

function priorAbleOnset(recommendation: Recommendation): string {
  const snake = /prior_able_onset_(\d{4})_(\d{2})_(\d{2})/iu.exec(recommendation.gates.evidenceScope);
  if (snake) return `${snake[1]}-${snake[2]}-${snake[3]}`;
  const prose = /prior same-family ABLE onset on (\d{4}-\d{2}-\d{2})/iu.exec(recommendation.gates.evidenceScope);
  assert(prose?.[1], `Cannot parse prior ABLE onset for ${recommendation.candidateId}`);
  return prose[1];
}

function reasonsAtRc19(candidate: Candidate, recommendation: Recommendation, hard: HardDecision): Rc19ReasonCode[] {
  const reasons = new Set<Rc19ReasonCode>();
  const proximity = recommendation.gates.evidenceScope.startsWith("fail_proximity_only");
  if (proximity) {
    reasons.add("mta_evidence_acquisition_gap");
    reasons.add("mta_route_or_treatment_scope_binding_gap");
    reasons.add("producer_contract_or_projection_gap");
  }
  if (isFailure(recommendation.gates.date) || isFollowup(recommendation.gates.date)) reasons.add("mta_date_phase_occurrence_identity_gap");
  if (candidate.treatmentFamily === "bus_lane" && recommendation.gates.spine.includes("exact_lane_overlap_spine_missing")) {
    reasons.add("tracker_exact_lane_overlap_spine_gap");
  }
  if (hard.hardGateFacts.spineReadiness === "needs_pattern_review") reasons.add("tracker_route_pattern_grouping_gap");
  if (!hard.hardGateFacts.calendarMinimumFourPerSide) reasons.add("outcome_window_time_bound_gap");
  if (recommendation.gates.conflict.startsWith("fail") || recommendation.gates.confounder.startsWith("fail")) {
    reasons.add("overlap_confounder_causal_design_rejection");
  }
  if (isLaterAce(recommendation)) {
    reasons.add("mta_date_phase_occurrence_identity_gap");
    reasons.add("intentionally_invalid_or_duplicate_phase");
  }
  reasons.add("human_authority_required");
  return ALL_REASONS.filter((reason) => reasons.has(reason));
}

function partition(hard: HardDecision): Rc19RejectLedgerRow["mechanical_partition"] {
  const spine = hard.hardGateFacts.spineReadiness === "needs_pattern_review";
  const calendar = !hard.hardGateFacts.calendarMinimumFourPerSide;
  if (spine && calendar) return "spine_plus_calendar";
  if (spine) return "spine_only";
  if (calendar) return "calendar_only";
  return "deep_review";
}

function sourceFix(candidate: Candidate, sourceFixIds: ReadonlySet<string>): GunHillSourceFix | null {
  if (!sourceFixIds.has(candidate.candidateId)) return null;
  assert(candidate.routeId === "BX28" || candidate.routeId === "BX38", `Unexpected source-fix route ${candidate.routeId}`);
  assert(candidate.treatmentFamily === "bus_lane" && candidate.implementationDate === "2023-10-31" && candidate.datePrecision === "day", `Unexpected source-fix identity ${identity(candidate)}`);
  return {
    ...GUN_HILL_FIX_BASE,
    resolved_route_treatment_scope: `${candidate.routeId}|bus_lane|East Gun Hill Road|Bainbridge Avenue to Bartow Avenue`,
  };
}

function exclusiveDisposition(
  candidate: Candidate,
  recommendation: Recommendation,
  hard: HardDecision,
  fix: GunHillSourceFix | null,
): Rc19ReasonCode {
  if (recommendation.gates.evidenceScope.startsWith("fail_proximity_only") && !fix) return "mta_route_or_treatment_scope_binding_gap";
  if (recommendation.gates.date.startsWith("needs_followup")) return "mta_date_phase_occurrence_identity_gap";
  if (isLaterAce(recommendation)) return "intentionally_invalid_or_duplicate_phase";
  if (recommendation.gates.conflict.startsWith("fail") || recommendation.gates.confounder.startsWith("fail")) return "overlap_confounder_causal_design_rejection";
  if (fix) return "tracker_exact_lane_overlap_spine_gap";
  if (hard.hardGateFacts.spineReadiness === "needs_pattern_review") return "tracker_route_pattern_grouping_gap";
  if (!hard.hardGateFacts.calendarMinimumFourPerSide) return "outcome_window_time_bound_gap";
  throw new Error(`No exclusive disposition for deep reject ${candidate.candidateId}`);
}

function ownership(disposition: Rc19ReasonCode): string {
  switch (disposition) {
    case "tracker_route_pattern_grouping_gap": return "bus_reliability_tracker_spine";
    case "tracker_exact_lane_overlap_spine_gap": return "bus_reliability_tracker_lane_spine";
    case "outcome_window_time_bound_gap": return "bus_reliability_tracker_outcome_corpus_clock";
    case "overlap_confounder_causal_design_rejection": return "bus_reliability_tracker_causal_design_and_human_review";
    case "intentionally_invalid_or_duplicate_phase": return "bus_reliability_tracker_candidate_phase_identity";
    case "mta_date_phase_occurrence_identity_gap": return "mta_wiki_evidence_plus_human_estimand_authority";
    case "mta_evidence_acquisition_gap": return "mta_wiki_acquisition_then_tracker_projection";
    case "mta_route_or_treatment_scope_binding_gap": return "mta_wiki_route_treatment_binding";
    case "producer_contract_or_projection_gap": return "bus_reliability_tracker_candidate_producer";
    case "human_authority_required": return "human_candidate_set_approval_authority";
  }
}

function actionFor(disposition: Rc19ReasonCode, fix: GunHillSourceFix | null): Pick<Rc19RejectLedgerRow, "source_fixable" | "proposed_action" | "action_status" | "remaining_blocker"> {
  if (fix) return {
    source_fixable: false,
    proposed_action: "Preserve the repaired exact route/treatment/segment scope and the authoritative October 31 completion-phase date. Add a phase-preserving producer contract without relabeling completion as first operational onset, build an exact treated-lane overlap spine, and require a pinned human-reviewed replay.",
    action_status: "source_scope_and_completion_phase_repaired_not_projectable",
    remaining_blocker: "The completion phase is proved, but the standard occurrence contract cannot preserve completion-phase versus first-operation semantics; Tracker also lacks an exact outcome spine clipped to the treated segment.",
  };
  switch (disposition) {
    case "tracker_route_pattern_grouping_gap": return { source_fixable: false, proposed_action: "Resolve raw-key route variants into a reviewed pattern-grouped outcome spine without relabeling the MTA evidence.", action_status: "downstream_handoff_ready", remaining_blocker: "Pinned Tracker spine is needs_pattern_review." };
    case "outcome_window_time_bound_gap": return { source_fixable: false, proposed_action: "Wait for or acquire independent outcome months; do not manufacture calendar coverage.", action_status: "downstream_handoff_ready", remaining_blocker: "Fewer than four independent outcome months exist on at least one side of onset." };
    case "overlap_confounder_causal_design_rejection": return { source_fixable: false, proposed_action: "Keep rejected unless a human-approved estimand and causal design handles the competing same-route intervention.", action_status: "retained_non_authorizing_reject", remaining_blocker: "Competing intervention or unresolved confounder overlaps the study window." };
    case "intentionally_invalid_or_duplicate_phase": return { source_fixable: false, proposed_action: "Preserve the later ACE phase as context; do not treat it as a new first onset of the collapsed ACE/ABLE family.", action_status: "retained_context_not_independent_intervention", remaining_blocker: "The route has an earlier ABLE first onset." };
    case "mta_date_phase_occurrence_identity_gap": return { source_fixable: false, proposed_action: "Retain source-stated month precision and installation-commencement phase until authoritative operational-onset evidence and human estimand authority exist.", action_status: "blocked_by_evidence_and_authority", remaining_blocker: "No truthful exact operational day or independent phase onset is established." };
    case "mta_evidence_acquisition_gap": return { source_fixable: false, proposed_action: "Do not promote proximity. Acquire an authoritative exact route/treatment/segment binding or exclude the unsupported registry projection downstream.", action_status: "blocked_no_authoritative_binding", remaining_blocker: "Pinned evidence establishes proximity only, not exact route treatment overlap." };
    case "mta_route_or_treatment_scope_binding_gap": return { source_fixable: false, proposed_action: "Do not promote proximity. Acquire an authoritative exact route/treatment/segment binding or exclude the unsupported registry projection downstream.", action_status: "blocked_no_authoritative_binding", remaining_blocker: "Pinned evidence establishes proximity only, not exact route treatment overlap." };
    default: return { source_fixable: false, proposed_action: "Retain the non-authorizing rejection and route to the named owner.", action_status: "downstream_handoff_ready", remaining_blocker: disposition };
  }
}

function counts<T extends string>(values: readonly T[], all: readonly T[]): Record<T, number> {
  const result = Object.fromEntries(all.map((value) => [value, 0])) as Record<T, number>;
  for (const value of values) result[value] += 1;
  return result;
}

function sourceHashes(candidate: Candidate, fix: GunHillSourceFix | null, candidateSetSha256: string): string[] {
  const hashes = new Set<string>([candidateSetSha256]);
  for (const item of candidate.provenance) {
    if (item.manifestSha256) hashes.add(item.manifestSha256);
    if (item.artifactSha256) hashes.add(item.artifactSha256);
  }
  if (fix) {
    for (const hash of Object.values(fix.source_artifact_sha256s)) hashes.add(hash);
    for (const item of fix.evidence) hashes.add(item.text_sha256);
  }
  return [...hashes].sort();
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function rootBefore(path: string, marker: string): string {
  const index = path.lastIndexOf(marker);
  return index >= 0 ? path.slice(0, index) || "." : ".";
}

export function buildRc19RejectReconciliation(
  paths: Rc19ReconciliationPaths,
  expected: Rc19ReconciliationExpectations = DEFAULT_RC19_RECONCILIATION_EXPECTATIONS,
): Rc19ReconciliationResult {
  const candidateJson = readPinnedJson(paths.candidateSetPath, expected.candidateSetSha256, "candidate set");
  const reconciliationJson = readPinnedJson(paths.reconciliationPath, expected.reconciliationSha256, "review reconciliation");
  const auditJson = readPinnedJson(paths.auditPath, expected.auditSha256, "audit report");
  const hardJson = readPinnedJson(paths.hardGatePath, expected.hardGateSha256, "hard-gate triage");
  const deepJson = readPinnedJson(paths.deepReviewPath, expected.deepReviewSha256, "deep-review input");
  const manifestJson = readPinnedJson(paths.rc19ManifestPath, expected.manifestSha256, "rc19 manifest");

  assert(candidateJson.candidateSetId === expected.candidateSetId, "Candidate-set id changed");
  assert(reconciliationJson.candidateSetId === expected.candidateSetId, "Reconciliation candidate-set id changed");
  assert(hardJson.candidateSetId === expected.candidateSetId, "Hard-gate candidate-set id changed");
  assert(deepJson.candidateSetId === expected.candidateSetId, "Deep-review candidate-set id changed");
  assert(hardJson.candidateSetSha256 === expected.candidateSetSha256, "Hard-gate candidate hash changed");
  assert(deepJson.candidateSetSha256 === expected.candidateSetSha256, "Deep-review candidate hash changed");
  assert(manifestJson.release_id === "v1-rc19", "Manifest is not v1-rc19");
  assert(manifestJson.generator_commit === expected.generatorCommit, "rc19 generator commit changed");
  const manifestFiles = object(manifestJson.files, "manifest.files");
  assert(object(manifestFiles["operational_occurrences.jsonl"], "manifest operational occurrence file").sha256 === expected.occurrenceArtifactSha256, "Manifest occurrence artifact hash changed");
  assert(object(auditJson.inputHashes, "audit.inputHashes").candidateSet === expected.candidateSetSha256, "Audit candidate hash changed");
  assert(object(auditJson.inputHashes, "audit.inputHashes").reviewReconciliation === expected.reconciliationSha256, "Audit reconciliation hash changed");
  assert(object(auditJson.inputHashes, "audit.inputHashes").wikiManifest === expected.manifestSha256, "Audit manifest hash changed");
  assert(object(auditJson.inputHashes, "audit.inputHashes").occurrenceSource === expected.occurrenceArtifactSha256, "Audit occurrence hash changed");
  const auditRelease = object(auditJson.release, "audit.release");
  assert(auditRelease.generatorCommit === expected.generatorCommit && auditRelease.selectedViaLatest === false && auditRelease.promotedAtAuditTime === false, "Audit release-selection doctrine changed");

  const candidates = array(candidateJson.candidates, "candidateSet.candidates").map((row, index) => parseCandidate(row, `candidate[${index}]`));
  const recommendations = array(reconciliationJson.recommendations, "reconciliation.recommendations").map((row, index) => parseRecommendation(row, `recommendation[${index}]`));
  const hardDecisions = array(hardJson.decisions, "hardGate.decisions").map((row, index) => parseHardDecision(row, `hardDecision[${index}]`));
  const deepCandidates = array(deepJson.candidates, "deepReview.candidates").map((row, index): DeepCandidate => {
    const item = object(row, `deepCandidate[${index}]`);
    return { candidateId: string(item.candidateId, `deepCandidate[${index}].candidateId`), identity: string(item.identity, `deepCandidate[${index}].identity`) };
  });
  assert(candidates.length === expected.candidateCount, `Expected ${expected.candidateCount} candidates, got ${candidates.length}`);
  assert(recommendations.length === expected.candidateCount, `Expected ${expected.candidateCount} recommendations, got ${recommendations.length}`);
  assert(hardDecisions.length === expected.candidateCount, `Expected ${expected.candidateCount} hard decisions, got ${hardDecisions.length}`);
  assert(deepCandidates.length === expected.deepReviewInputCount, `Expected ${expected.deepReviewInputCount} deep inputs, got ${deepCandidates.length}`);

  const candidateById = uniqueById(candidates, "candidate set");
  const recommendationById = uniqueById(recommendations, "reconciliation");
  const hardById = uniqueById(hardDecisions, "hard-gate triage");
  const deepById = uniqueById(deepCandidates, "deep-review input");
  for (const candidate of candidates) {
    const recommendation = recommendationById.get(candidate.candidateId);
    const hard = hardById.get(candidate.candidateId);
    assert(recommendation && hard, `Missing joined review row for ${candidate.candidateId}`);
    const expectedIdentity = identity(candidate);
    assert(recommendation.identity === expectedIdentity && hard.identity === expectedIdentity, `Identity mismatch for ${candidate.candidateId}`);
    assert(recommendation.routeId === candidate.routeId && recommendation.treatmentFamily === candidate.treatmentFamily && recommendation.implementationDate === candidate.implementationDate, `Review fields mismatch for ${candidate.candidateId}`);
    assert(recommendation.authorization === "non_authorizing_recommendation_only", `Authorization changed for ${candidate.candidateId}`);
    const inDeep = deepById.has(candidate.candidateId);
    assert((hard.recommendation === "deep_review_required") === inDeep, `Hard/deep partition mismatch for ${candidate.candidateId}`);
    if (inDeep) assert(deepById.get(candidate.candidateId)!.identity === expectedIdentity, `Deep identity mismatch for ${candidate.candidateId}`);
  }
  assert(candidateById.size === recommendationById.size && candidateById.size === hardById.size, "Candidate joins are not one-for-one");

  const rejected = recommendations.filter((row) => row.recommendation === "recommend_reject");
  const approved = recommendations.filter((row) => row.recommendation === "recommend_approve");
  assert(rejected.length === expected.rejectedCount, `Expected ${expected.rejectedCount} rejects, got ${rejected.length}`);
  assert(approved.length === expected.approvedRecommendationCount, `Expected ${expected.approvedRecommendationCount} approvals, got ${approved.length}`);
  assert(rejected.length + approved.length === recommendations.length, "Unexpected recommendation value");
  const hardRejectIds = new Set(hardDecisions.filter((row) => row.recommendation === "recommend_reject").map((row) => row.candidateId));
  assert(hardRejectIds.size === expected.hardRejectCount, `Expected ${expected.hardRejectCount} hard rejects, got ${hardRejectIds.size}`);
  assert(rejected.filter((row) => deepById.has(row.candidateId)).length === expected.deepRejectCount, `Expected ${expected.deepRejectCount} deep rejects`);

  const sourceFixIds = new Set(expected.sourceFixCandidateIds ?? []);
  const inputHashes = {
    candidate_set_sha256: expected.candidateSetSha256,
    reconciliation_sha256: expected.reconciliationSha256,
    audit_sha256: expected.auditSha256,
    hard_gate_sha256: expected.hardGateSha256,
    deep_review_sha256: expected.deepReviewSha256,
    rc19_manifest_sha256: expected.manifestSha256,
  };
  const ledger = rejected.map((recommendation): Rc19RejectLedgerRow => {
    const candidate = candidateById.get(recommendation.candidateId)!;
    const hard = hardById.get(recommendation.candidateId)!;
    const fix = sourceFix(candidate, sourceFixIds);
    const currentReasons = reasonsAtRc19(candidate, recommendation, hard);
    const afterReasonSet = new Set(currentReasons.filter((reason) => !(fix && ["mta_evidence_acquisition_gap", "mta_route_or_treatment_scope_binding_gap"].includes(reason))));
    const afterReasons = ALL_REASONS.filter((reason) => afterReasonSet.has(reason));
    const disposition = exclusiveDisposition(candidate, recommendation, hard, fix);
    const action = actionFor(disposition, fix);
    return {
      schema_version: 1,
      candidate_set_id: expected.candidateSetId,
      candidate_set_sha256: expected.candidateSetSha256,
      candidate_id: candidate.candidateId,
      identity: identity(candidate),
      route_id: candidate.routeId,
      treatment_family: candidate.treatmentFamily,
      implementation_date: candidate.implementationDate,
      date_precision: candidate.datePrecision,
      occurrence_id_at_rc19: candidate.occurrenceId,
      review_batch_id: recommendation.sourceBatchId,
      authorization: recommendation.authorization,
      input_hashes: inputHashes,
      current_hard_failures: GATE_NAMES.filter((gate) => isFailure(recommendation.gates[gate])).map((gate) => ({ gate, finding: recommendation.gates[gate] })),
      current_followups: GATE_NAMES.filter((gate) => isFollowup(recommendation.gates[gate])).map((gate) => ({ gate, finding: recommendation.gates[gate] })),
      source_evidence: candidate.provenance,
      source_evidence_container_sha256: expected.candidateSetSha256,
      source_evidence_hashes: sourceHashes(candidate, fix, expected.candidateSetSha256),
      root_cause: disposition,
      owning_system: ownership(disposition),
      ...action,
      exclusive_primary_disposition: disposition,
      nonexclusive_reasons_at_rc19: currentReasons,
      nonexclusive_reasons_after_mta_actions: afterReasons,
      mechanical_partition: partition(hard),
      source_fix: fix,
    };
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  assert(new Set(ledger.map((row) => row.candidate_id)).size === expected.rejectedCount, "Ledger is not one row per rejected candidate");
  assert(ledger.every((row) => row.source_evidence_hashes.length > 0), "Every ledger row must have a content-addressed source-evidence container");

  const mechanicalCounts = counts(ledger.map((row) => row.mechanical_partition), ["spine_only", "spine_plus_calendar", "calendar_only", "deep_review"] as const);
  assert(mechanicalCounts.spine_only === expected.mechanicalSpineOnlyCount, `Spine-only partition is ${mechanicalCounts.spine_only}`);
  assert(mechanicalCounts.spine_plus_calendar === expected.mechanicalSpineCalendarCount, `Spine+calendar partition is ${mechanicalCounts.spine_plus_calendar}`);
  assert(mechanicalCounts.calendar_only === expected.mechanicalCalendarOnlyCount, `Calendar-only partition is ${mechanicalCounts.calendar_only}`);
  assert(mechanicalCounts.deep_review === expected.deepRejectCount, `Deep partition is ${mechanicalCounts.deep_review}`);

  const deepRows = ledger.filter((row) => row.mechanical_partition === "deep_review");
  if (expected.assertRc19DeepComposition) {
    const deepBus = deepRows.filter((row) => row.treatment_family === "bus_lane");
    const deepAce = deepRows.filter((row) => row.treatment_family === "automated_bus_lane_enforcement");
    assert(deepBus.length === 32 && deepAce.length === 7, "Deep-review family partition changed");
    const deepProximityBus = deepBus.filter((row) => row.nonexclusive_reasons_at_rc19.includes("mta_route_or_treatment_scope_binding_gap"));
    assert(deepProximityBus.filter((row) => !row.current_hard_failures.some((failure) => failure.gate === "conflict")).length === 29, "Deep proximity-only bus-lane count changed");
    assert(deepProximityBus.filter((row) => row.current_hard_failures.some((failure) => failure.gate === "conflict")).length === 2, "Deep competing proximity bus-lane count changed");
    assert(deepBus.filter((row) => row.identity === "B67|bus_lane|2025-09|month").length === 1, "B67 month row changed");
    assert(deepBus.filter((row) => row.source_fix !== null).length === 2, "Gun Hill fixed-row count changed");
    assert(deepBus.filter((row) => row.current_hard_failures.some((failure) => failure.gate === "conflict")).length === 3, "Deep bus-lane conflict count changed");
    assert(deepAce.filter((row) => row.nonexclusive_reasons_at_rc19.includes("intentionally_invalid_or_duplicate_phase")).length === 6, "Deep later-ACE count changed");
    assert(deepAce.filter((row) => !row.nonexclusive_reasons_at_rc19.includes("intentionally_invalid_or_duplicate_phase") && row.nonexclusive_reasons_at_rc19.includes("overlap_confounder_causal_design_rejection")).length === 1, "Deep M96 ACE overlap count changed");
  }

  const exclusiveCounts = counts(ledger.map((row) => row.exclusive_primary_disposition), ALL_REASONS);
  const nonexclusiveAtRc19 = counts(ledger.flatMap((row) => row.nonexclusive_reasons_at_rc19), ALL_REASONS);
  const nonexclusiveAfter = counts(ledger.flatMap((row) => row.nonexclusive_reasons_after_mta_actions), ALL_REASONS);
  const sourceRepairedRows = ledger.filter((row) => row.source_fix !== null);
  assert(sourceRepairedRows.length === sourceFixIds.size, `Expected ${sourceFixIds.size} source-scope-repaired rows, got ${sourceRepairedRows.length}`);
  if (expected.assertRc19DeepComposition) {
    const expectedExclusive: Partial<Record<Rc19ReasonCode, number>> = {
      mta_route_or_treatment_scope_binding_gap: 321,
      mta_date_phase_occurrence_identity_gap: 2,
      tracker_exact_lane_overlap_spine_gap: 2,
      intentionally_invalid_or_duplicate_phase: 20,
      overlap_confounder_causal_design_rejection: 8,
      tracker_route_pattern_grouping_gap: 112,
      outcome_window_time_bound_gap: 8,
    };
    for (const [reason, expectedCount] of Object.entries(expectedExclusive)) {
      assert(exclusiveCounts[reason as Rc19ReasonCode] === expectedCount, `Exclusive ${reason} count changed: ${exclusiveCounts[reason as Rc19ReasonCode]}`);
    }
    const expectedAtRc19: Record<Rc19ReasonCode, number> = {
      mta_evidence_acquisition_gap: 323,
      mta_route_or_treatment_scope_binding_gap: 323,
      mta_date_phase_occurrence_identity_gap: 28,
      producer_contract_or_projection_gap: 323,
      tracker_exact_lane_overlap_spine_gap: 325,
      tracker_route_pattern_grouping_gap: 371,
      outcome_window_time_bound_gap: 215,
      overlap_confounder_causal_design_rejection: 46,
      intentionally_invalid_or_duplicate_phase: 20,
      human_authority_required: 473,
    };
    const expectedAfter = { ...expectedAtRc19, mta_evidence_acquisition_gap: 321, mta_route_or_treatment_scope_binding_gap: 321 };
    for (const reason of ALL_REASONS) {
      assert(nonexclusiveAtRc19[reason] === expectedAtRc19[reason], `Nonexclusive rc19 ${reason} count changed: ${nonexclusiveAtRc19[reason]}`);
      assert(nonexclusiveAfter[reason] === expectedAfter[reason], `Nonexclusive post-action ${reason} count changed: ${nonexclusiveAfter[reason]}`);
    }
  }
  const laterAceRows = ledger.filter((row) => row.nonexclusive_reasons_at_rc19.includes("intentionally_invalid_or_duplicate_phase"));
  if (expected.assertRc19DeepComposition) {
    assert(laterAceRows.length === 20, `Expected 20 later ACE rows, got ${laterAceRows.length}`);
    assert(laterAceRows.filter((row) => row.mechanical_partition === "deep_review").length === 6, "Later ACE mechanical/deep partition changed");
  }
  const acePhaseIdentities = laterAceRows.map((row): AcePhaseIdentityRow => {
    const recommendation = recommendationById.get(row.candidate_id)!;
    return {
      schema_version: 1,
      candidate_id: row.candidate_id,
      identity: row.identity,
      route_id: row.route_id,
      later_phase_date: row.implementation_date,
      prior_able_onset: priorAbleOnset(recommendation),
      phase_role: "later_ace_expansion_after_first_able_onset",
      independent_first_onset_candidate: false,
      mechanical_partition: row.mechanical_partition,
      source_evidence: row.source_evidence,
      action: "preserve_as_context_do_not_treat_as_independent_first_onset",
    };
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));

  const idsFor = (predicate: (row: Rc19RejectLedgerRow) => boolean) => ledger.filter(predicate).map((row) => row.candidate_id);
  const workPackets = {
    schema_version: 1,
    candidate_set_id: expected.candidateSetId,
    non_authorizing: true,
    packets: [
      { owner: "bus_reliability_tracker_spine", blocker: "route_pattern_grouping", count: nonexclusiveAfter.tracker_route_pattern_grouping_gap, candidate_ids: idsFor((row) => row.nonexclusive_reasons_after_mta_actions.includes("tracker_route_pattern_grouping_gap")), required_action: "Build reviewed pattern-grouped route spines from raw-key variants; do not alter MTA route evidence." },
      { owner: "bus_reliability_tracker_lane_spine", blocker: "exact_treated_lane_overlap_spine", count: nonexclusiveAfter.tracker_exact_lane_overlap_spine_gap, candidate_ids: idsFor((row) => row.nonexclusive_reasons_after_mta_actions.includes("tracker_exact_lane_overlap_spine_gap")), source_bound_after_mta_actions: idsFor((row) => row.treatment_family === "bus_lane" && !row.nonexclusive_reasons_after_mta_actions.includes("mta_route_or_treatment_scope_binding_gap")), required_action: "Intersect authoritative treated segments with exact route geometry and construct outcome spines for only the proved overlap; route-level spines are insufficient." },
      { owner: "mta_wiki_acquisition_then_tracker_projection", blocker: "missing_authoritative_route_treatment_binding", count: nonexclusiveAfter.mta_route_or_treatment_scope_binding_gap, candidate_ids: idsFor((row) => row.nonexclusive_reasons_after_mta_actions.includes("mta_route_or_treatment_scope_binding_gap")), required_action: "Acquire exact primary-source route/treatment/segment proof where it exists; otherwise Tracker must exclude the unsupported proximity projection." },
      { owner: "mta_wiki_evidence_plus_tracker_occurrence_projection", blocker: "phase_preserving_standard_occurrence_projection", count: sourceRepairedRows.length, candidate_ids: sourceRepairedRows.map((row) => row.candidate_id), required_action: "Preserve the authoritative Gun Hill scope graph and exact completion-phase date, but do not relabel completion as first operational onset. Define a conservative phase-preserving consumer contract, then replay with human authority." },
      { owner: "mta_wiki_evidence_and_human_estimand_authority", blocker: "date_phase_occurrence_identity", count: nonexclusiveAfter.mta_date_phase_occurrence_identity_gap, candidate_ids: idsFor((row) => row.nonexclusive_reasons_after_mta_actions.includes("mta_date_phase_occurrence_identity_gap")), required_action: "Retain literal date precision and phase semantics; resolve only with authoritative onset evidence and candidate-set-bound human estimand authority." },
      { owner: "bus_reliability_tracker_candidate_producer", blocker: "projection_contract", count: nonexclusiveAfter.producer_contract_or_projection_gap, candidate_ids: idsFor((row) => row.nonexclusive_reasons_after_mta_actions.includes("producer_contract_or_projection_gap")), unsupported_proximity_candidate_ids: idsFor((row) => row.nonexclusive_reasons_after_mta_actions.includes("mta_route_or_treatment_scope_binding_gap") && row.nonexclusive_reasons_after_mta_actions.includes("producer_contract_or_projection_gap")), source_bound_but_unprojected_candidate_ids: sourceRepairedRows.map((row) => row.candidate_id), required_actions: { unsupported_proximity: "Exclude proximity-only candidates unless authoritative exact route/treatment binding is supplied.", source_bound_but_unprojected: "Do not discard the authoritative scope graph or completion-phase date and do not relabel it as first operational onset; add or approve a phase-preserving projection contract before replay." } },
      { owner: "outcome_corpus_clock", blocker: "calendar_time_bound", count: nonexclusiveAfter.outcome_window_time_bound_gap, candidate_ids: idsFor((row) => row.nonexclusive_reasons_after_mta_actions.includes("outcome_window_time_bound_gap")), required_action: "Acquire or await independent outcome months; never manufacture calendar coverage." },
      { owner: "bus_reliability_tracker_causal_design_and_human_review", blocker: "overlap_or_confounder", count: nonexclusiveAfter.overlap_confounder_causal_design_rejection, candidate_ids: idsFor((row) => row.nonexclusive_reasons_after_mta_actions.includes("overlap_confounder_causal_design_rejection")), required_action: "Specify and approve an estimand/design that handles competing interventions, or retain rejection." },
      { owner: "bus_reliability_tracker_candidate_phase_identity", blocker: "later_ace_after_first_able_onset", count: nonexclusiveAfter.intentionally_invalid_or_duplicate_phase, candidate_ids: idsFor((row) => row.nonexclusive_reasons_after_mta_actions.includes("intentionally_invalid_or_duplicate_phase")), required_action: "Preserve later ACE phases as context, not independent first-onset interventions." },
      { owner: "human_candidate_set_approval_authority", blocker: "candidate_set_bound_approval", count: expected.rejectedCount, candidate_ids: ledger.map((row) => row.candidate_id), required_action: "Any reconsideration requires a new pinned replay and explicit candidate-set-bound human approval; this ledger authorizes no run or publication." },
    ],
  };
  const summary = {
    schema_version: 1,
    candidate_set_id: expected.candidateSetId,
    rejected_candidate_count: ledger.length,
    source_scope_repaired_count: sourceRepairedRows.length,
    source_scope_repaired_candidate_ids: sourceRepairedRows.map((row) => row.candidate_id),
    fully_source_fixed_count: 0,
    mechanical_partition: mechanicalCounts,
    exclusive_primary_disposition_counts_after_mta_actions: exclusiveCounts,
    nonexclusive_reason_counts_at_rc19: nonexclusiveAtRc19,
    nonexclusive_reason_counts_after_mta_actions: nonexclusiveAfter,
    later_ace_phase_count: acePhaseIdentities.length,
    later_ace_phase_mechanical_count: acePhaseIdentities.filter((row) => row.mechanical_partition !== "deep_review").length,
    later_ace_phase_deep_count: acePhaseIdentities.filter((row) => row.mechanical_partition === "deep_review").length,
    authorization: "non_authorizing_recommendation_only",
  };
  const reportData = {
    schema_version: 1,
    doctrine: {
      evidence_not_outcome: "MTA Wiki establishes what happened, where, and when; it does not supply an independent outcome estimate.",
      rejection_semantics: "A true intervention can remain non-estimable.",
      authorization: "This reconciliation authorizes no study run, approval, promotion, deployment, or publication.",
    },
    consumed_inputs: { ...inputHashes, tracker_audit_commit: RC19_RECONCILIATION_PINS.tracker_audit_commit, rc19_generator_commit: expected.generatorCommit, occurrence_artifact_sha256: expected.occurrenceArtifactSha256 },
    reproduction_commands: {
      verify_input_hashes: `printf '%s\n' ${shellQuote([[expected.candidateSetSha256, paths.candidateSetPath], [expected.reconciliationSha256, paths.reconciliationPath], [expected.auditSha256, paths.auditPath], [expected.hardGateSha256, paths.hardGatePath], [expected.deepReviewSha256, paths.deepReviewPath], [expected.manifestSha256, paths.rc19ManifestPath]].map(([hash, path]) => `${hash}  ${path}`).join("\n"))} | sha256sum -c -`,
      verify_tracker_commit: `test "$(git -C ${shellQuote(rootBefore(paths.candidateSetPath, "/docs/research/artifacts/"))} rev-parse HEAD)" = "${RC19_RECONCILIATION_PINS.tracker_audit_commit}"`,
      verify_release_selection: `test "$(cat ${shellQuote(join(rootBefore(paths.rc19ManifestPath, "/data/exports/releases/"), "data/exports/releases/LATEST"))})" = "v1-rc5" && test "$(git -C ${shellQuote(rootBefore(paths.rc19ManifestPath, "/data/exports/releases/"))} rev-parse ${expected.generatorCommit}^{commit})" = "${expected.generatorCommit}"`,
      regenerate_ledger: `bun scripts/reconcile-tracker-rc19-rejects.ts --candidate-set ${shellQuote(paths.candidateSetPath)} --reconciliation ${shellQuote(paths.reconciliationPath)} --audit ${shellQuote(paths.auditPath)} --hard-gate ${shellQuote(paths.hardGatePath)} --deep-review ${shellQuote(paths.deepReviewPath)} --rc19-manifest ${shellQuote(paths.rc19ManifestPath)} --output-dir '<new-empty-output-dir>'`,
      later_release_replay_operator_step: "After an immutable next release exists, an operator may run Tracker read-only against that explicitly pinned manifest and a temporary output root; do not use LATEST and do not modify Tracker receipts, studies, databases, approvals, or publication state.",
    },
    verified_partition: mechanicalCounts,
    before_after: {
      source_scope_repaired: sourceRepairedRows.length,
      fully_source_fixed: 0,
      changed_identities: sourceRepairedRows.map((row) => ({ candidate_id: row.candidate_id, identity: row.identity, new_occurrence_id: null, repaired_scope: row.source_fix!.resolved_route_treatment_scope, completion_phase_date: row.source_fix!.resolved_completion_phase_date, first_operational_onset: null, remaining_blockers: row.source_fix!.unresolved })),
      exclusive_remaining: exclusiveCounts,
      nonexclusive_remaining: nonexclusiveAfter,
      anticipated_tracker_effect: {
        status: "inference_pending_pinned_tracker_replay",
        expected_new_exact_source_bindings: sourceRepairedRows.length,
        expected_reject_recommendation_change_without_new_lane_spines: 0,
        expected_standard_occurrence_projection_change: 0,
        reason: "The scope and completion-phase handoff is authoritative, but the standard occurrence contract cannot preserve completion versus first-operation semantics; both identities also lack an exact treated-lane overlap outcome spine.",
      },
    },
    summary,
  };
  return { ledger, summary, workPackets, acePhaseIdentities, reportData };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${stableJson(value as JsonValue)}\n`, "utf8");
}

function writeJsonl(path: string, rows: readonly unknown[]): void {
  writeFileSync(path, rows.length > 0 ? `${rows.map((row) => stableJson(row as JsonValue)).join("\n")}\n` : "", "utf8");
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderRc19ReconciliationReport(result: Rc19ReconciliationResult): string {
  const first = result.ledger[0];
  assert(first, "Cannot render an empty reconciliation ledger");
  const sourceRepaired = result.ledger.filter((row) => row.source_fix !== null);
  const mechanical = counts(
    result.ledger.map((row) => row.mechanical_partition),
    ["spine_only", "spine_plus_calendar", "calendar_only", "deep_review"] as const,
  );
  const exclusive = counts(result.ledger.map((row) => row.exclusive_primary_disposition), ALL_REASONS);
  const before = counts(result.ledger.flatMap((row) => row.nonexclusive_reasons_at_rc19), ALL_REASONS);
  const after = counts(result.ledger.flatMap((row) => row.nonexclusive_reasons_after_mta_actions), ALL_REASONS);
  const reportData = object(result.reportData, "report data");
  const reproduction = object(reportData.reproduction_commands, "report data reproduction commands");

  const lines = [
    "# Tracker rc19 reject reconciliation",
    "",
    "Status: **non-authorizing operator handoff**. This report reconciles every rejected candidate identity one-for-one; it does not approve a candidate, authorize a study, or weaken a gate.",
    "",
    "## Outcome",
    "",
    `- Rejected candidate identities reconciled: **${result.ledger.length}**`,
    `- Candidate identities with authoritative route/treatment/segment scope and completion-phase date repaired: **${sourceRepaired.length}**`,
    "- Candidate identities fully unblocked or made authorizing by MTA Wiki changes: **0**",
    `- Candidate identities that remain non-authorizing: **${result.ledger.length}**`,
    "- Anticipated Tracker recommendation change without new exact treated-lane spines, a phase-aware consumer decision, a pinned replay, and human approval: **0**. This is an inference until a pinned Tracker replay verifies it.",
    "",
    "The MTA Wiki changes add authoritative scope context and confirm an exact completion-phase date. They do not prove the first operational onset, create an independent outcome estimate, or turn a route-level outcome spine into an exact treated-lane-overlap spine. No standard occurrence is emitted because that contract cannot preserve completion-phase versus first-operation semantics.",
    "",
    "Release boundary: rc19 remains immutable and unpromoted. This reconciliation does not mutate `LATEST`; the expected observed value remains `v1-rc5`. No release is promoted, deployed, pushed, or published by this workflow.",
    "",
    "## Verified rc19 partition",
    "",
    "| Partition | Count |",
    "| --- | ---: |",
    `| Mechanical: spine only | ${mechanical.spine_only} |`,
    `| Mechanical: spine plus calendar | ${mechanical.spine_plus_calendar} |`,
    `| Mechanical: calendar only | ${mechanical.calendar_only} |`,
    `| Deep-review rejects | ${mechanical.deep_review} |`,
    `| **Total** | **${result.ledger.length}** |`,
    "",
    "## Changed candidate identities",
    "",
    "| Candidate ID | rc19 identity | Repaired scope and phase | Remaining blocker |",
    "| --- | --- | --- | --- |",
    ...sourceRepaired.map((row) => `| ${markdownCell(row.candidate_id)} | ${markdownCell(row.identity)} | ${markdownCell(row.source_fix!.resolved_route_treatment_scope)}; completion phase ${row.source_fix!.resolved_completion_phase_date} | Phase-preserving producer projection contract, exact treated-lane outcome spine, pinned replay, and human approval |`),
    "",
    "No occurrence identity or candidate implementation date was changed. The MTA report proves that the 3.1 miles were completed on October 31, 2023; the first operational onset remains unknown. The separate DOT page is retained as a publication/status-as-of event, not used alone as onset proof.",
    "",
    "## Exclusive primary disposition after MTA actions",
    "",
    "These counts are mutually exclusive and sum to the rejected-candidate total.",
    "",
    "| Primary disposition | Count |",
    "| --- | ---: |",
    ...ALL_REASONS.map((reason) => `| ${reason} | ${exclusive[reason]} |`),
    `| **Total** | **${Object.values(exclusive).reduce((sum, value) => sum + value, 0)}** |`,
    "",
    "## Non-exclusive reason counts",
    "",
    "A candidate may have several gate reasons, so these columns do not sum to 473.",
    "",
    "| Reason | At rc19 | After MTA actions |",
    "| --- | ---: | ---: |",
    ...ALL_REASONS.map((reason) => `| ${reason} | ${before[reason]} | ${after[reason]} |`),
    "",
    "## Pinned inputs",
    "",
    `- Tracker audit commit: \`${RC19_RECONCILIATION_PINS.tracker_audit_commit}\``,
    `- Candidate set: \`${first.candidate_set_id}\``,
    `- Candidate artifact SHA-256: \`${first.candidate_set_sha256}\``,
    `- Reconciliation SHA-256: \`${first.input_hashes.reconciliation_sha256}\``,
    `- Audit SHA-256: \`${first.input_hashes.audit_sha256}\``,
    `- Hard-gate SHA-256: \`${first.input_hashes.hard_gate_sha256}\``,
    `- Deep-review SHA-256: \`${first.input_hashes.deep_review_sha256}\``,
    `- rc19 manifest SHA-256: \`${first.input_hashes.rc19_manifest_sha256}\``,
    `- rc19 generator commit: \`${RC19_RECONCILIATION_PINS.rc19_generator_commit}\``,
    `- rc19 occurrence artifact SHA-256: \`${RC19_RECONCILIATION_PINS.rc19_occurrence_artifact_sha256}\``,
    "",
    "## Reproduction commands",
    "",
    ...Object.entries(reproduction).sort(([left], [right]) => left.localeCompare(right)).flatMap(([name, command]) => {
      assert(typeof command === "string", `Reproduction command ${name} must be a string`);
      return [`### ${name}`, "", "```sh", command, "```", ""];
    }),
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

export function writeRc19RejectReconciliation(outputDir: string, result: Rc19ReconciliationResult): Record<string, string> {
  mkdirSync(outputDir, { recursive: true });
  const artifactPaths = {
    ledger: join(outputDir, "rc19-reject-ledger.jsonl"),
    summary: join(outputDir, "summary.json"),
    work_packets: join(outputDir, "tracker-work-packets.json"),
    ace_phase_identities: join(outputDir, "ace-phase-identities.jsonl"),
    report_data: join(outputDir, "report-data.json"),
    report: join(outputDir, "report.md"),
  };
  writeJsonl(artifactPaths.ledger, result.ledger);
  writeJson(artifactPaths.summary, result.summary);
  writeJson(artifactPaths.work_packets, result.workPackets);
  writeJsonl(artifactPaths.ace_phase_identities, result.acePhaseIdentities);
  writeJson(artifactPaths.report_data, result.reportData);
  writeFileSync(artifactPaths.report, renderRc19ReconciliationReport(result), "utf8");
  const files = Object.fromEntries(Object.entries(artifactPaths).sort(([left], [right]) => left.localeCompare(right)).map(([key, path]) => {
    const bytes = readFileSync(path);
    return [key, { file: path.slice(outputDir.length + 1), bytes: bytes.byteLength, sha256: sha256(bytes) }];
  }));
  const first = result.ledger[0];
  assert(first, "Cannot manifest an empty reconciliation ledger");
  const manifestPath = join(outputDir, "manifest.json");
  writeJson(manifestPath, {
    schema_version: 1,
    artifact_kind: "mta_wiki_tracker_rc19_reject_reconciliation",
    candidate_set_id: first.candidate_set_id,
    candidate_set_sha256: first.candidate_set_sha256,
    rejected_candidate_count: result.ledger.length,
    source_scope_repaired_count: result.ledger.filter((row) => row.source_fix !== null).length,
    fully_source_fixed_count: 0,
    files,
  });
  return { ...artifactPaths, manifest: manifestPath };
}
