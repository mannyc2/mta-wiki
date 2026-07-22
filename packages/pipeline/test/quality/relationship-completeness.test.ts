import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { repoRoot } from "@mta-wiki/core/paths";
import {
  rebuildCanonicalDb,
  type CanonicalEvidenceBlockRegistryEntry,
} from "@mta-wiki/db/canonical-db";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";
import type { OperationalOccurrenceRow } from "@mta-wiki/pipeline/materialize/operational-occurrences";
import type { RouteAnchorReview, RouteAnchorRow } from "@mta-wiki/pipeline/materialize/route-anchors";
import type { OperationalCoverageGap } from "@mta-wiki/pipeline/quality/operational-coverage";
import {
  validateRelationshipDispositionLedger,
  type RelationshipDispositionDecision,
} from "@mta-wiki/pipeline/quality/relationship-dispositions";
import {
  DEFAULT_RELATIONSHIP_COMPLETENESS_RELEASE_MANIFEST_SHA256,
  buildRelationshipCompletenessAudit,
  loadOccurrenceTreatmentPhysicalityContract,
  loadRelationshipCompletenessArtifacts,
  relationshipCompletenessDbMirror,
  validateRelationshipDispositionLedgerForRelease,
  type BuildRelationshipCompletenessAuditInput,
} from "@mta-wiki/pipeline/quality/relationship-completeness";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function record(
  recordId: string,
  recordKind: MtaCanonicalRecord["record_kind"],
  payload: JsonObject = {},
  displayName = recordId,
): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: recordKind,
    source_id: "fixture_source",
    local_observation_id: recordId,
    display_name: displayName,
    payload,
    evidence_refs: [],
    submission_ids: [],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-07-15T00:00:00.000Z",
  };
}

function routeReview(
  routeCount = 0,
  nonGtfsDispositions: RouteAnchorReview["non_gtfs_dispositions"] = {},
): RouteAnchorReview {
  return {
    schema_version: 1,
    contract_id: "route-identity-dispositions-v1",
    gtfs_feed: { feed_date: "fixture", route_count: routeCount, routes_sha256: "a".repeat(64) },
    sbs_plus_successor_rule: {
      rule_id: "unique-sbs-plus-successor-v1",
      description: "Fixture exact-terminal-plus rule.",
    },
    overrides: {},
    non_gtfs_dispositions: nonGtfsDispositions,
  };
}

function routeRecord(recordId: string, routeId: string): MtaCanonicalRecord {
  const value = record(recordId, "route", { route_id: routeId, route_record_scope: "true_route" });
  value.evidence_refs = [{
    source_id: "fixture_source",
    evidence_id: `fixture_source#${recordId}`,
    block_id: recordId,
    page_number: 1,
    source_path: "raw/sources/fixture_source/blocks.jsonl",
    text_sha256: `sha256:${"a".repeat(64)}`,
  }];
  return value;
}

function treatmentRecord(
  recordId: string,
  treatmentFamily = "service_pattern",
  treatmentKind = "route change",
): MtaCanonicalRecord {
  const value = record(recordId, "treatment_component", {
    treatment_family: treatmentFamily,
    treatment_kind: treatmentKind,
  });
  value.evidence_refs = [{
    source_id: "fixture_source",
    evidence_id: `fixture_source#${recordId}`,
    block_id: recordId,
    page_number: 1,
    source_path: "raw/sources/fixture_source/blocks.jsonl",
    text_sha256: `sha256:${"a".repeat(64)}`,
  }];
  return value;
}

function fixtureEvidenceRegistry(
  records: readonly MtaCanonicalRecord[],
): { provenance: "test_fixture"; entries: CanonicalEvidenceBlockRegistryEntry[] } {
  const entries = new Map<string, CanonicalEvidenceBlockRegistryEntry>();
  for (const fixtureRecord of records) {
    for (const ref of fixtureRecord.evidence_refs) {
      if (!ref.block_id || ref.page_number === undefined || !ref.source_path || !ref.text_sha256) {
        throw new Error(`Incomplete fixture evidence on ${fixtureRecord.record_id}`);
      }
      entries.set(`${ref.source_id}\0${ref.block_id}`, {
        source_id: ref.source_id,
        block_id: ref.block_id,
        resolved_block_id: ref.block_id,
        page_number: ref.page_number,
        source_path: ref.source_path,
        raw_text_sha256: ref.text_sha256,
      });
    }
  }
  return { provenance: "test_fixture", entries: [...entries.values()] };
}

function relation(recordId: string, subjectId: string, objectId: string): MtaCanonicalRecord {
  const value = record(recordId, "relation", {
    subject_id: subjectId,
    object_id: objectId,
    relation_kind: "has_treatment",
    relation_family: "treatment_context",
    assertion_status: "delivered",
  });
  value.evidence_refs = [{
    source_id: "fixture_source",
    evidence_id: `fixture_source#${recordId}`,
    block_id: recordId,
    text_sha256: `sha256:${"a".repeat(64)}`,
  }];
  return value;
}

function scopedRelation(
  recordId: string,
  subjectId: string,
  objectId: string,
  relationKind: string,
  relationFamily: string,
): MtaCanonicalRecord {
  const value = relation(recordId, subjectId, objectId);
  value.payload = {
    ...value.payload,
    relation_kind: relationKind,
    relation_family: relationFamily,
  };
  return value;
}

function physicalScopeDisposition(
  relatedRecordIds: string[],
  graphRecordIds = ["treatment_physical", ...relatedRecordIds],
): RelationshipDispositionDecision {
  return {
    schema_version: 1,
    contract_id: "relationship-dispositions-v1",
    decision_id: "relationship-disposition-v1:treatment_physical",
    selector: "bus_lane_family_treatment",
    record_id: "treatment_physical",
    record_kind: "treatment_component",
    primary_disposition: "physical_scope_satisfied",
    study_projectable: false,
    waiver: false,
    reviewed_at: "2026-07-15",
    reviewed_by: "fixture-reviewer",
    reason: "Exact source-backed physical scope fixture.",
    reason_codes: ["exact_direct_scope"],
    evidence_ids: ["fixture_source#treatment_physical"],
    related_record_ids: [...relatedRecordIds].sort(),
    occurrence_ids: [],
    required_roles_satisfied: ["physical_scope"],
    required_roles_missing: [],
    investigation: {
      method: "canonical_graph_and_bound_source_review",
      source_ids_checked: ["fixture_source"],
      graph_record_ids_checked: [...graphRecordIds].sort(),
      gap_ids_checked: [],
      acquisition_receipt_ids: [],
      exact_supported_claims: [
        "evidence_backed_canonical_physical_scope",
        "physical_scope",
      ],
      exact_unsupported_claims: [],
    },
  };
}

function physicalScopeInventoryDecision(): NonNullable<
  BuildRelationshipCompletenessAuditInput["busLaneTreatmentScope"]
>["decisions"][number] {
  return {
    schema_version: 1,
    contract_id: "bus-lane-treatment-physical-scope-v1",
    decision_id: "bus-lane-treatment-physical-scope-v1:treatment_physical",
    treatment_id: "treatment_physical",
    treatment_family: "bus_lane",
    treatment_kind: "center-running bus lanes",
    canonical_status: "materialized",
    exclusive_decision: "physical_scope_satisfied",
    physical_scope_requirement_satisfied: true,
    evidence_refs: [{
      source_id: "fixture_source",
      evidence_id: "fixture_source#treatment_physical",
    }],
    scope_bindings: [{
      corridor_id: "corridor_fixture",
      relation_id: "relation_direct",
      relation_kind: "has_treatment",
      evidence_refs: [{
        source_id: "fixture_source",
        evidence_id: "fixture_source#relation_direct",
      }],
    }],
    source_ids: ["fixture_source"],
    study_eligible: null,
    study_eligibility_effect: "not_determined_by_physical_scope_contract",
    reason: "Exact fixture scope binding; physical scope alone does not create study eligibility.",
  };
}

function occurrence(
  occurrenceId: string,
  eventId: string,
  overrides: Record<string, unknown> = {},
): OperationalOccurrenceRow {
  const routeId = `route_${occurrenceId}`;
  const treatmentId = `treatment_${occurrenceId}`;
  const timelineRelationId = `relation_timeline_${occurrenceId}`;
  const value = {
    schema_version: 1,
    occurrence_id: occurrenceId,
    occurrence_aliases: [],
    occurrence_review_decision_id: `review_${occurrenceId}`,
    founding_key: `event:${eventId}`,
    resolution_cluster_id: null,
    observations: [],
    resolved_status: "realized",
    resolved_onset: {
      date: "2025-06-01",
      precision: "day",
      resolver_ids: ["fixture_resolver"],
      publication_dates: [],
      retrieval_dates: ["2026-07-15"],
      evidence_bindings: [
        { role: "event_date", record_id: eventId, source_id: "fixture_source", evidence_id: "fixture#date" },
        {
          role: "timeline_relation",
          record_id: timelineRelationId,
          source_id: "fixture_source",
          evidence_id: "fixture#timeline",
        },
      ],
    },
    routes: [{
      route_record_id: routeId,
      gtfs_route_id: "B1",
      evidence_bindings: [
        { role: "route_identity", record_id: routeId, source_id: "fixture_source", evidence_id: "fixture#route" },
        {
          role: "route_scope",
          record_id: `relation_route_${occurrenceId}`,
          source_id: "fixture_source",
          evidence_id: "fixture#route-scope",
        },
      ],
    }],
    treatment: {
      kind: "atomic",
      member: {
        treatment_record_id: treatmentId,
        treatment_family: "service_pattern",
        evidence_bindings: [
          {
            role: "treatment_definition",
            record_id: treatmentId,
            source_id: "fixture_source",
            evidence_id: "fixture#treatment",
          },
          {
            role: "treatment_scope",
            record_id: `relation_treatment_${occurrenceId}`,
            source_id: "fixture_source",
            evidence_id: "fixture#treatment-scope",
          },
        ],
      },
    },
    source_ids: ["fixture_source"],
    evidence_bindings: [],
    exclusion_reasons: [],
    review_state: "approved",
    study_projection_eligible: true,
    provenance: {
      anchor_review_decision_ids: [],
      event_record_ids: [eventId],
      relation_record_ids: [timelineRelationId],
      route_record_ids: [routeId],
      treatment_record_ids: [treatmentId],
    },
    phase_record_id: `phase_${occurrenceId}`,
    phase_relation_disposition: "single_phase",
    corridor_record_ids: [`corridor_${occurrenceId}`],
    ...overrides,
  };
  return value as unknown as OperationalOccurrenceRow;
}

function gap(
  gapId: string,
  eventId: string,
  verdict: OperationalCoverageGap["verdict"],
  dimension: OperationalCoverageGap["dimension"] = "route",
): OperationalCoverageGap {
  return {
    schema_version: 1,
    gap_id: gapId,
    event_record_id: eventId,
    event_display_name: eventId,
    event_family: "implementation",
    dimension,
    priority: false,
    priority_basis: [],
    priority_families: [],
    anchor_ids: [],
    resolved_occurrence_ids: [],
    source_ids: [],
    required_search_source_ids: [],
    context_record_ids: [],
    candidate_record_ids: [],
    candidate_date_intervals: [],
    route_record_ids: [],
    gtfs_route_ids: [],
    treatment_record_ids: [],
    treatment_families: [],
    verdict,
    verdict_basis: null,
    decision_ids: [],
    proposal_ids: [],
    evidence_refs: [],
    search_receipt_ids: [],
    updated_at: null,
  };
}

function fixtureInput(): BuildRelationshipCompletenessAuditInput {
  const goodOccurrence = occurrence("occurrence_good", "event_good");
  const incompleteOccurrence = occurrence("occurrence_incomplete", "event_open", {
    routes: [],
    treatment: {
      kind: "bundle",
      bundle_family: null,
      bundle_family_evidence_bindings: [],
      members: [],
    },
    resolved_onset: undefined,
    phase_record_id: undefined,
    phase_relation_disposition: undefined,
    corridor_record_ids: undefined,
  });
  const physicalTreatment = treatmentRecord(
    "treatment_physical",
    "bus_lane",
    "center-running bus lanes",
  );
  const enforcementTreatment = treatmentRecord(
    "treatment_enforcement",
    "automated_bus_lane_enforcement",
    "Automated Camera Enforcement (ACE) activation",
  );
  const project = record("project_fixture", "project");
  const corridor = record("corridor_fixture", "corridor");
  return {
    releaseId: "fixture-release",
    occurrences: [goodOccurrence, incompleteOccurrence],
    treatments: [
      treatmentRecord("treatment_occurrence_good"),
      physicalTreatment,
      enforcementTreatment,
      record("treatment_other", "treatment_component", { treatment_family: "signal_priority" }),
    ],
    events: [
      record("event_good", "event", { event_family: "implementation" }),
      record("event_open", "event", { event_family: "implementation" }),
      record("event_terminal", "event", { event_family: "launch" }),
      record("event_outside", "event", { event_family: "other" }),
    ],
    projects: [project],
    corridors: [corridor],
    routes: [],
    routeAnchors: [],
    routeAnchorReview: routeReview(),
    relations: [
      relation("relation_direct", corridor.record_id, physicalTreatment.record_id),
      relation("relation_project_treatment", project.record_id, physicalTreatment.record_id),
      scopedRelation("relation_project_corridor", project.record_id, corridor.record_id, "located_on_corridor", "corridor_scope"),
    ],
    coverageGaps: [
      gap("gap_good", "event_good", "unreviewed"),
      gap("gap_open", "event_open", "unreviewed", "treatment"),
      gap("gap_terminal", "event_terminal", "not_applicable"),
    ],
    relationshipDispositions: [physicalScopeDisposition(["corridor_fixture", "relation_direct"])],
    busLaneTreatmentScope: {
      decisions: [physicalScopeInventoryDecision()],
      inputPins: [],
    },
    inputPins: [
      { path: "z.jsonl", bytes: 2, sha256: "z".repeat(64), row_count: 1 },
      { path: "a.jsonl", bytes: 2, sha256: "a".repeat(64), row_count: 1 },
    ],
  };
}

describe("relationship completeness audit", () => {
  it("keeps core, physical-scope, and schema-migration occurrence roles separately accountable", () => {
    const build = buildRelationshipCompletenessAudit(fixtureInput());
    const good = build.occurrenceRows.find((row) => row.occurrence_id === "occurrence_good");
    const incomplete = build.occurrenceRows.find((row) => row.occurrence_id === "occurrence_incomplete");

    expect(good?.primary_disposition).toBe("contract_roles_complete");
    expect(good?.warning_codes).toEqual([]);
    expect(incomplete?.primary_disposition).toBe("contract_roles_incomplete");
    expect(incomplete?.warning_codes).toEqual(expect.arrayContaining([
      "RC_OCCURRENCE_ROUTE_MISSING",
      "RC_OCCURRENCE_TREATMENT_MISSING",
      "RC_OCCURRENCE_TREATMENT_BUNDLE_IDENTITY_MISSING",
      "RC_OCCURRENCE_TREATMENT_BUNDLE_EVIDENCE_MISSING",
      "RC_OCCURRENCE_ONSET_MISSING",
      "RC_OCCURRENCE_ONSET_PRECISION_INVALID",
      "RC_OCCURRENCE_PHASE_IDENTITY_MISSING",
      "RC_OCCURRENCE_PHASE_RELATION_MISSING",
    ]));
  });

  it("uses the exact eligible-occurrence treatment denominator and exclusive event dispositions", () => {
    const build = buildRelationshipCompletenessAudit(fixtureInput());
    expect(build.summary.occurrence_treatment_physicality).toMatchObject({
      denominator_count: 1,
      occurrence_membership_count: 1,
      classification_counts: {
        physical_corridor_or_segment_intervention: 0,
        nonphysical_service_operations_policy_control: 1,
        point_or_stop_physical_intervention: 0,
        review_required: 0,
      },
      review_ledger_complete: true,
    });
    expect(build.treatmentRows.map((row) => row.treatment_record_id))
      .toEqual(["treatment_occurrence_good"]);
    expect(build.treatmentRows[0]?.study_projectable).toBe(false);
    expect(build.treatmentRows[0]?.reasons)
      .toContain("physicality_decision_does_not_create_study_eligibility");
    expect(build.summary.operational_events.counts_by_primary_disposition).toEqual({
      eligible_occurrence_present: 2,
      legacy_terminal_gap_dispositions_only: 1,
      completeness_review_open: 0,
      versioned_non_projectable_disposition: 0,
    });
    expect(build.eventRows.find((row) => row.event_record_id === "event_good")).toMatchObject({
      primary_disposition: "eligible_occurrence_present",
      study_projectable: true,
      warning_codes: [],
    });
    expect(build.eventRows.find((row) => row.event_record_id === "event_good")?.reasons)
      .toContain("eligible_realized_occurrence_reconciles_event_coverage_without_waiver");
    expect(build.eventRows.find((row) => row.event_record_id === "event_terminal")?.warning_codes)
      .toEqual(["RC_OPERATIONAL_EVENT_VERSIONED_DISPOSITION_REQUIRED"]);
    expect(build.summary.bus_lane_treatments).toEqual({
      denominator_count: 1,
      audited_treatment_count: 1,
      materialized_treatment_count: 1,
      accepted_pending_addition_count: 0,
      counts_by_primary_disposition: {
        physical_scope_satisfied: 1,
        non_physical_enforcement_or_control: 0,
        non_lane_supporting_feature: 0,
        aggregate_or_unbounded_treatment: 0,
        reviewed_non_projectable_physical_scope_unproven: 0,
        review_required: 0,
      },
      physical_scope_satisfied_count: 1,
      reviewed_non_projectable_count: 0,
      exact_evidence_bound_count: 1,
      omitted_treatment_count: 0,
      warning_treatment_count: 0,
      review_complete: true,
    });
    expect(build.busLaneTreatmentRows[0]).toMatchObject({
      treatment_record_id: "treatment_physical",
      primary_disposition: "physical_scope_satisfied",
      physical_scope_record_ids: ["corridor_fixture"],
      physical_scope_relation_record_ids: ["relation_direct"],
      study_projectable: false,
      waiver: false,
      warning_codes: [],
    });
  });

  it("adds a realized eligible occurrence event outside the legacy family denominator without a waiver", () => {
    const input = fixtureInput();
    const renameEvent = record("event_rename", "event", {
      event_family: "other",
      event_kind: "route rename",
    });
    input.events = [...input.events, renameEvent];
    input.occurrences = [...input.occurrences, occurrence("occurrence_rename", renameEvent.record_id)];
    const build = buildRelationshipCompletenessAudit(input);
    const row = build.eventRows.find((candidate) => candidate.event_record_id === renameEvent.record_id);

    expect(row).toMatchObject({
      event_family: "other",
      denominator_basis: ["eligible_realized_occurrence_event"],
      primary_disposition: "eligible_occurrence_present",
      disposition_decision_id: null,
      study_projectable: true,
      warning_codes: [],
    });
    expect(row?.reasons).toContain("eligible_realized_occurrence_is_projectable_basis_no_waiver");
    expect(input.relationshipDispositions?.some((decision) => decision.record_id === renameEvent.record_id)).toBe(false);
  });

  it("fails the full bus-lane selector closed when the immutable disposition is omitted", () => {
    const input = fixtureInput();
    input.relationshipDispositions = [];
    const build = buildRelationshipCompletenessAudit(input);
    const row = build.busLaneTreatmentRows[0];
    expect(row?.primary_disposition).toBe("review_required");
    expect(row?.warning_codes).toEqual(expect.arrayContaining([
      "RC_BUS_LANE_TREATMENT_SELECTOR_ACCOUNTING_REQUIRED",
      "RC_BUS_LANE_TREATMENT_SCOPE_OR_DISPOSITION_REQUIRED",
      "RC_BUS_LANE_TREATMENT_EVIDENCE_MISSING",
    ]));
    expect(build.summary.bus_lane_treatments).toMatchObject({
      denominator_count: 1,
      audited_treatment_count: 1,
      omitted_treatment_count: 0,
      warning_treatment_count: 1,
      review_complete: false,
    });
    expect(build.summary.enforcement_migration.bus_lane_treatment_completeness_ready).toBe(false);
  });

  it("accepts an evidence-bound reviewed non-projectable bus-lane scope disposition without granting eligibility", () => {
    const input = fixtureInput();
    const inventory = structuredClone(input.busLaneTreatmentScope!.decisions[0]!);
    inventory.exclusive_decision = "reviewed_non_projectable_physical_scope_unproven";
    inventory.physical_scope_requirement_satisfied = false;
    inventory.scope_bindings = [];
    inventory.study_eligible = false;
    inventory.study_eligibility_effect = "excluded_by_physical_scope_contract";
    const disposition = structuredClone(input.relationshipDispositions![0]!);
    disposition.primary_disposition = "reviewed_non_projectable_physical_scope_unproven";
    disposition.waiver = true;
    disposition.related_record_ids = [];
    disposition.required_roles_satisfied = ["typed_non_projectable_disposition"];
    disposition.required_roles_missing = ["physical_scope"];
    disposition.investigation.graph_record_ids_checked = ["treatment_physical"];
    input.busLaneTreatmentScope = { decisions: [inventory], inputPins: [] };
    input.relationshipDispositions = [disposition];

    const build = buildRelationshipCompletenessAudit(input);
    expect(build.busLaneTreatmentRows[0]).toMatchObject({
      primary_disposition: "reviewed_non_projectable_physical_scope_unproven",
      physical_scope_satisfied: false,
      study_projectable: false,
      waiver: true,
      warning_codes: [],
    });
    expect(build.busLaneTreatmentRows[0]?.reasons)
      .toContain("waiver_cannot_confer_study_eligibility");
    expect(build.summary.enforcement_migration.bus_lane_treatment_completeness_ready).toBe(true);
  });

  it("fails closed when the immutable physicality contract or review-ledger pin drifts", () => {
    const contractPath = "data/contracts/occurrence-treatment-physicality/v1/contract.json";
    const releaseId = "v1-rc27";
    const namedReleaseDir = "data/exports/releases/v1-rc27";
    const candidateReleaseDir = existsSync(join(repoRoot, namedReleaseDir))
      ? namedReleaseDir
      : "data/exports/releases/.v1-rc27-completeness-input.treatment-semantics-v1/v1-rc27";
    const loaded = loadOccurrenceTreatmentPhysicalityContract({
      rootDir: repoRoot,
      contractPath,
      releaseId,
      releaseSnapshotSourceDir: join(repoRoot, candidateReleaseDir),
    });
    expect(loaded).toMatchObject({
      contract_status: "reviewed_final",
      final_post_semantic_release_guard_status: "verified",
    });
    expect(loaded.decisions).toHaveLength(269);
    expect(() => loadOccurrenceTreatmentPhysicalityContract({
      rootDir: repoRoot,
      contractPath,
      releaseId: "v1-rc26",
      releaseSnapshotSourceDir: join(repoRoot, candidateReleaseDir),
    })).toThrow("does not match completeness release v1-rc26");
    expect(loadOccurrenceTreatmentPhysicalityContract({
      rootDir: repoRoot,
      contractPath,
      releaseId: "v1-rc26",
      releaseSnapshotSourceDir: join(repoRoot, candidateReleaseDir),
      allowByteIdenticalReviewedReleaseAlias: true,
    })).toMatchObject({ contract_status: "reviewed_final" });

    const work = mkdtempSync(join(tmpdir(), "occurrence-treatment-physicality-contract-"));
    const relativeDir = "data/contracts/occurrence-treatment-physicality/v1";
    const destinationDir = join(work, relativeDir);
    mkdirSync(destinationDir, { recursive: true });
    try {
      for (const name of [
        "contract.json",
        "policy.json",
        "review-ledger.jsonl",
        "retired-review-ledger.jsonl",
        "review-retirement-receipt.json",
      ]) {
        writeFileSync(
          join(destinationDir, name),
          readFileSync(join(repoRoot, relativeDir, name), "utf8"),
          "utf8",
        );
      }
      const releaseSourceDir = "candidate-release";
      mkdirSync(join(work, releaseSourceDir, "review-retirements", "source"), { recursive: true });
      for (const name of [
        "operational_occurrences.jsonl",
        "treatment_components.jsonl",
        "relations.jsonl",
        "corridors.jsonl",
      ]) {
        copyFileSync(
          join(repoRoot, candidateReleaseDir, name),
          join(work, releaseSourceDir, name),
        );
      }
      for (const name of [
        "q6-q06-current-ineligible-2026-07-18.json",
        "q7-q07-current-ineligible-2026-07-18.json",
        "q8-q08-current-ineligible-2026-07-18.json",
        "q9-q09-current-ineligible-2026-07-18.json",
      ]) {
        copyFileSync(
          join(repoRoot, candidateReleaseDir, "review-retirements", "source", name),
          join(work, releaseSourceDir, "review-retirements", "source", name),
        );
      }
      writeFileSync(
        join(destinationDir, "review-ledger.jsonl"),
        `${readFileSync(join(destinationDir, "review-ledger.jsonl"), "utf8")}\n`,
        "utf8",
      );
      expect(() => loadOccurrenceTreatmentPhysicalityContract({
        rootDir: work,
        contractPath,
        releaseId,
        releaseSnapshotSourceDir: join(work, releaseSourceDir),
      })).toThrow("review_ledger immutable pin mismatch");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("requires an exact direct evidence-bound scope relation for a reviewed physical treatment", () => {
    const positive = fixtureInput();
    positive.occurrences = [occurrence("occurrence_physical", "event_good", {
      treatment: {
        kind: "atomic",
        member: {
          treatment_record_id: "treatment_physical",
          treatment_family: "bus_lane",
          evidence_bindings: [
            {
              role: "treatment_definition",
              record_id: "treatment_physical",
              source_id: "fixture_source",
              evidence_id: "fixture_source#treatment_physical",
            },
            {
              role: "treatment_scope",
              record_id: "relation_direct",
              source_id: "fixture_source",
              evidence_id: "fixture_source#relation_direct",
            },
          ],
        },
      },
      physical_scope_record_ids: ["corridor_fixture"],
      physical_scope_relation_record_ids: ["relation_direct"],
      physical_scope_evidence_bindings: [{
        role: "physical_scope",
        record_id: "relation_direct",
        source_id: "fixture_source",
        evidence_id: "fixture_source#relation_direct",
      }],
    })];
    const accepted = buildRelationshipCompletenessAudit(positive);
    expect(accepted.treatmentRows[0]?.primary_disposition)
      .toBe("reviewed_physical_corridor_or_segment");
    expect(accepted.occurrenceRows[0]?.physical_scope_requirement)
      .toBe("corridor_or_segment_required");
    expect(accepted.occurrenceRows[0]?.warning_codes).not.toContain(
      "RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_INVALID",
    );

    const adversarial = fixtureInput();
    adversarial.occurrences = [occurrence("occurrence_physical", "event_good", {
      treatment: (positive.occurrences[0] as OperationalOccurrenceRow).treatment,
      physical_scope_record_ids: ["corridor_fixture"],
      physical_scope_relation_record_ids: ["relation_irrelevant_treatment"],
      physical_scope_evidence_bindings: [{
        role: "physical_scope",
        record_id: "relation_irrelevant_treatment",
        source_id: "fixture_source",
        evidence_id: "fixture_source#relation_irrelevant_treatment",
      }],
    })];
    adversarial.relations = [
      scopedRelation(
        "relation_irrelevant_treatment",
        "project_fixture",
        "treatment_physical",
        "proposes_treatment",
        "treatment_context",
      ),
      scopedRelation(
        "relation_irrelevant_corridor",
        "corridor_fixture",
        "project_fixture",
        "has_real_estate_action",
        "ownership_role",
      ),
    ];
    const rejected = buildRelationshipCompletenessAudit(adversarial);
    expect(rejected.treatmentRows[0]?.warning_codes).toEqual([]);
    expect(rejected.occurrenceRows[0]?.warning_codes)
      .toContain("RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_INVALID");
  });

  it("projects later disposition graph references out of a pinned release without relaxing current enforcement", () => {
    const input = fixtureInput();
    const treatment = structuredClone(input.treatments.find((row) =>
      row.record_id === "treatment_physical")!);
    treatment.evidence_refs = [{
      source_id: "fixture_source",
      evidence_id: "fixture_source#treatment_physical",
      block_id: "treatment",
      text_sha256: `sha256:${"a".repeat(64)}`,
    }];
    const releaseRecords = [
      treatment,
      ...input.projects,
      ...input.corridors,
      ...input.events,
      ...input.routes,
      ...input.relations,
    ];
    const decision = physicalScopeDisposition([
      "corridor_fixture",
      "relation_pending_current_corpus_scope",
    ]);

    expect(validateRelationshipDispositionLedgerForRelease(releaseRecords, [decision])).toEqual([]);
    expect(validateRelationshipDispositionLedger(releaseRecords, {
      decisions: [decision],
      byRecordId: new Map([[decision.record_id, decision]]),
    })).toEqual(expect.arrayContaining([
      expect.stringContaining("relation_pending_current_corpus_scope"),
    ]));

    const futureDecision = {
      ...decision,
      decision_id: "relationship-disposition-v1:treatment_future",
      record_id: "treatment_future",
    };
    expect(validateRelationshipDispositionLedgerForRelease(releaseRecords, [futureDecision])).toEqual([]);
    expect(validateRelationshipDispositionLedger(releaseRecords, {
      decisions: [futureDecision],
      byRecordId: new Map([[futureDecision.record_id, futureDecision]]),
    })).toEqual(expect.arrayContaining([
      expect.stringContaining("targets missing canonical record treatment_future"),
    ]));
  });

  it("warns when two eligible rows claim the same occurrence alias", () => {
    const input = fixtureInput();
    const left = occurrence("occurrence_alias_left", "event_good", { occurrence_aliases: ["occurrence:legacy"] });
    const right = occurrence("occurrence_alias_right", "event_open", { occurrence_aliases: ["occurrence:legacy"] });
    const build = buildRelationshipCompletenessAudit({ ...input, occurrences: [left, right] });

    expect(build.occurrenceRows).toHaveLength(2);
    expect(build.occurrenceRows.every((row) =>
      row.warning_codes.includes("RC_OCCURRENCE_IDENTITY_AMBIGUOUS"))).toBe(true);
  });

  it("requires projectable event dispositions to name exactly the eligible occurrence set", () => {
    const input = fixtureInput();
    input.relationshipDispositions = [{
      schema_version: 1,
      contract_id: "relationship-dispositions-v1",
      decision_id: "relationship-disposition-v1:event_good",
      selector: "operational_event",
      record_id: "event_good",
      record_kind: "event",
      primary_disposition: "eligible_occurrence_present",
      study_projectable: true,
      waiver: false,
      reviewed_at: "2026-07-15",
      reviewed_by: "fixture-reviewer",
      reason: "Fixture disposition with an extraneous occurrence id.",
      reason_codes: ["eligible_occurrence_present"],
      evidence_ids: ["fixture_source#event"],
      related_record_ids: [],
      occurrence_ids: ["bogus", "occurrence_good"],
      required_roles_satisfied: ["canonical_event_identity"],
      required_roles_missing: [],
      investigation: {
        method: "canonical_graph_and_bound_source_review",
        source_ids_checked: ["fixture_source"],
        graph_record_ids_checked: ["event_good"],
        gap_ids_checked: [],
        acquisition_receipt_ids: [],
        exact_supported_claims: ["eligible_occurrence_present"],
        exact_unsupported_claims: [],
      },
    }];
    const row = buildRelationshipCompletenessAudit(input).eventRows.find((candidate) =>
      candidate.event_record_id === "event_good");
    expect(row?.warning_codes).toContain("RC_OPERATIONAL_EVENT_REVIEW_OR_DISPOSITION_REQUIRED");
  });

  it("accounts every route as exactly one GTFS identity or reviewed typed non-projectable disposition", () => {
    const input = fixtureInput();
    const anchor = routeRecord("route_q1_anchor", "Q1");
    const variant = routeRecord("route_q1_variant", "Q1");
    const proposal = routeRecord("route_q99_proposal", "Q99");
    const routeAnchors: RouteAnchorRow[] = [{
      gtfs_route_id: "Q1",
      canonical_route_record_id: anchor.record_id,
      variant_record_ids: [variant.record_id],
      aliases: ["Q1"],
      disposition: "true_route",
      anchor_reason: "fixture",
    }];
    const proposalEvidence = `fixture_source#${proposal.record_id}`;
    input.routes = [proposal, variant, anchor];
    input.routeAnchors = routeAnchors;
    input.routeAnchorReview = routeReview(1, {
      [proposal.record_id]: {
        decision_id: `route-disposition-v1:${proposal.record_id}`,
        evidence_ids: [proposalEvidence],
        reviewed_at: "2026-07-15",
        review_state: "approved",
        disposition: "proposal",
        reason: "Fixture route is a proposal, not a current GTFS-backed operating identity.",
        expected_route_id: "Q99",
        study_projectable: false,
      },
    });
    input.occurrences = [];
    input.treatments = [];
    input.busLaneTreatmentScope = { decisions: [], inputPins: [] };
    input.relationshipDispositions = [];
    input.events = [];
    input.projects = [];
    input.corridors = [];
    input.relations = [];
    input.coverageGaps = [];

    const build = buildRelationshipCompletenessAudit(input);
    expect(build.routeRows.map((row) => [row.route_record_id, row.primary_disposition])).toEqual([
      ["route_q1_anchor", "canonical_gtfs_anchor"],
      ["route_q1_variant", "canonical_gtfs_variant"],
      ["route_q99_proposal", "reviewed_non_projectable_disposition"],
    ]);
    expect(build.summary.route_identities).toMatchObject({
      denominator_count: 3,
      audited_route_count: 3,
      gtfs_bound_route_record_count: 2,
      reviewed_non_projectable_route_record_count: 1,
    });
    expect(build.summary.enforcement_migration.route_identity_completeness_ready).toBe(true);
    const mirror = relationshipCompletenessDbMirror({
      ...build,
      outputDir: "fixture",
      relationshipDispositions: [],
    });
    expect(mirror.selectorContracts.find((contract) => contract.selector === "route_identity")).toMatchObject({
      expectedCount: 3,
      actualCount: 3,
      enforcementEligible: true,
    });
    expect(mirror.dispositions).toContainEqual(expect.objectContaining({
      decisionId: `route-disposition-v1:${proposal.record_id}`,
      selector: "route_identity",
      recordId: proposal.record_id,
      recordKind: "route",
      primaryDisposition: "proposal",
      studyProjectable: false,
      waiver: true,
      evidenceIds: [proposalEvidence],
    }));
    const work = mkdtempSync(join(tmpdir(), "route-completeness-mirror-"));
    try {
      expect(() => rebuildCanonicalDb([anchor, variant, proposal], {
        path: join(work, "canonical.db"),
        relationshipCompleteness: mirror,
        evidenceRegistry: fixtureEvidenceRegistry([anchor, variant, proposal]),
      })).not.toThrow();
    } finally {
      rmSync(work, { recursive: true, force: true });
    }

    input.routeAnchorReview = routeReview(1);
    expect(() => buildRelationshipCompletenessAudit(input)).toThrow(
      "neither a GTFS anchor/variant nor a reviewed non-projectable disposition",
    );
  });

  it("warns on a GTFS-accounted route whose canonical identity has no evidence", () => {
    const route = record("route_q1_without_evidence", "route", {
      route_id: "Q1",
      route_record_scope: "true_route",
    });
    const input = fixtureInput();
    input.occurrences = [];
    input.treatments = [];
    input.busLaneTreatmentScope = { decisions: [], inputPins: [] };
    input.relationshipDispositions = [];
    input.events = [];
    input.projects = [];
    input.corridors = [];
    input.relations = [];
    input.coverageGaps = [];
    input.routes = [route];
    input.routeAnchors = [{
      gtfs_route_id: "Q1",
      canonical_route_record_id: route.record_id,
      variant_record_ids: [],
      aliases: ["Q1"],
      disposition: "true_route",
      anchor_reason: "fixture",
    }];
    input.routeAnchorReview = routeReview(1);

    const build = buildRelationshipCompletenessAudit(input);
    expect(build.routeRows[0]?.warning_codes).toEqual(["RC_ROUTE_IDENTITY_EVIDENCE_MISSING"]);
    expect(build.summary.enforcement_migration.route_identity_completeness_ready).toBe(false);
    expect(build.summary.enforcement_migration.hard_mode_ready).toBe(false);
  });

  it("is byte-deterministic across input order", () => {
    const input = fixtureInput();
    const forward = buildRelationshipCompletenessAudit(input);
    const reversed = buildRelationshipCompletenessAudit({
      ...input,
      occurrences: [...input.occurrences].reverse(),
      treatments: [...input.treatments].reverse(),
      events: [...input.events].reverse(),
      projects: [...input.projects].reverse(),
      corridors: [...input.corridors].reverse(),
      relations: [...input.relations].reverse(),
      coverageGaps: [...input.coverageGaps].reverse(),
      inputPins: [...(input.inputPins ?? [])].reverse(),
    });
    expect(reversed.contents).toEqual(forward.contents);
    expect(reversed.manifest.audit_fingerprint).toBe(forward.manifest.audit_fingerprint);
  });

  it("binds every satisfied production mirror role to concrete canonical records", () => {
    const build = buildRelationshipCompletenessAudit(fixtureInput());
    const mirror = relationshipCompletenessDbMirror({
      ...build,
      outputDir: "fixture",
      relationshipDispositions: [],
    });
    const good = mirror.subjects.find((subject) => subject.subjectId === "occurrence_good");
    expect(good).toBeDefined();
    for (const subject of mirror.subjects) {
      for (const item of subject.roles) {
        expect(item.bindingCount).toBe(item.recordIds.length);
        if (item.status === "satisfied") expect(item.bindingCount).toBeGreaterThan(0);
        else expect(item.recordIds).toEqual([]);
      }
    }

    const recordsById = new Map<string, MtaCanonicalRecord>();
    for (const subject of mirror.subjects) {
      if (!subject.canonicalRecordId) continue;
      const kind = subject.subjectKind === "treatment_component" ? "treatment_component" : "event";
      recordsById.set(subject.canonicalRecordId, record(subject.canonicalRecordId, kind));
    }
    for (const subject of mirror.subjects) {
      for (const item of subject.roles) {
        for (const recordId of item.recordIds) {
          if (!recordsById.has(recordId)) recordsById.set(recordId, record(recordId, "entity"));
        }
      }
    }
    const work = mkdtempSync(join(tmpdir(), "relationship-completeness-mirror-"));
    try {
      expect(() => rebuildCanonicalDb([...recordsById.values()], {
        path: join(work, "canonical.db"),
        relationshipCompleteness: mirror,
        evidenceRegistry: { provenance: "test_fixture", entries: [] },
      })).not.toThrow();
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("reconstructs an SBS anchor from its canonical route id before a historical base-route variant alias", () => {
    const input = fixtureInput();
    const canonical = routeRecord("route_q52_sbs", "Q52-SBS");
    canonical.payload.route_label = "Q52-SBS";
    canonical.source_ids = ["fixture_source", "fixture_source_2"];
    const historicalVariant = routeRecord("route_q52_ltd", "Q52");
    input.routes = [historicalVariant, canonical];
    input.routeAnchors = [{
      gtfs_route_id: "Q52+",
      canonical_route_record_id: canonical.record_id,
      variant_record_ids: [historicalVariant.record_id],
      aliases: ["Q52", "Q52-SBS"],
      disposition: "true_route",
      anchor_reason: "label_matches_gtfs_short_name",
    }];
    input.routeAnchorReview = routeReview(1);
    input.occurrences = [];
    input.treatments = [];
    input.busLaneTreatmentScope = { decisions: [], inputPins: [] };
    input.relationshipDispositions = [];
    input.events = [];
    input.projects = [];
    input.corridors = [];
    input.relations = [];
    input.coverageGaps = [];

    expect(buildRelationshipCompletenessAudit(input).routeRows.map((row) => [
      row.route_record_id,
      row.primary_disposition,
      row.gtfs_route_id,
    ])).toEqual([
      ["route_q52_ltd", "canonical_gtfs_variant", "Q52+"],
      ["route_q52_sbs", "canonical_gtfs_anchor", "Q52+"],
    ]);
  });

  it("requires an explicit default-boundary migration before replacing pinned rc20 disposition inputs", () => {
    const work = mkdtempSync(join(tmpdir(), "relationship-completeness-pin-migration-"));
    const defaultOutputDir = "data/quality/relationship-integrity/completeness";
    const baselineOutputDir =
      "data/quality/relationship-integrity/campaign-comparison/v1/pre-remediation-rc20/completeness";
    const dispositionReviewPaths = new Set([
      "data/relationship-integrity/dispositions/v1/bus-lane-treatments/review.jsonl",
      "data/relationship-integrity/dispositions/v1/operational-events/review.jsonl",
    ]);
    try {
      mkdirSync(join(work, "data"), { recursive: true });
      for (const name of ["exports", "relationship-integrity", "submissions"]) {
        symlinkSync(join(repoRoot, "data", name), join(work, "data", name), "dir");
      }
      const physicalityDir = "data/contracts/occurrence-treatment-physicality/v1";
      mkdirSync(join(work, physicalityDir), { recursive: true });
      copyFileSync(
        join(repoRoot, physicalityDir, "policy.json"),
        join(work, physicalityDir, "policy.json"),
      );
      const readReviewRows = (path: string): Record<string, unknown>[] =>
        readFileSync(path, "utf8").trimEnd().split(/\r?\n/gu)
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Record<string, unknown>);
      const legacyReviewRows = [
        ...readReviewRows(join(repoRoot, physicalityDir, "review-ledger.jsonl")),
        ...readReviewRows(join(repoRoot, physicalityDir, "retired-review-ledger.jsonl")),
      ].sort((left, right) =>
        String(left.treatment_record_id).localeCompare(String(right.treatment_record_id))
      );
      const legacyReviewContent = `${legacyReviewRows
        .map((row) => stableJson(row as unknown as JsonValue))
        .join("\n")}\n`;
      writeFileSync(
        join(work, physicalityDir, "review-ledger.jsonl"),
        legacyReviewContent,
        "utf8",
      );
      const finalPhysicalityContract = JSON.parse(
        readFileSync(join(repoRoot, physicalityDir, "contract.json"), "utf8"),
      ) as {
        contract_status: string;
        review_snapshot: Record<string, unknown>;
        final_post_semantic_release_guard: Record<string, unknown>;
        [key: string]: unknown;
      };
      const rc20ReleaseDir = "data/exports/releases/v1-rc20";
      const rc20PhysicalityInputs = [
        "manifest.json",
        "operational_occurrences.jsonl",
        "treatment_components.jsonl",
        "relations.jsonl",
        "corridors.jsonl",
      ].map((name) => {
        const path = `${rc20ReleaseDir}/${name}`;
        const content = readFileSync(join(repoRoot, path), "utf8");
        return {
          path,
          bytes: Buffer.byteLength(content),
          sha256: sha256(content),
          ...(name.endsWith(".jsonl")
            ? { row_count: content.trimEnd().split(/\r?\n/gu).length }
            : {}),
        };
      });
      const { review_retirements: _retirements, ...legacyPhysicalityContract } =
        finalPhysicalityContract;
      const provisionalPhysicalityContract = {
        ...legacyPhysicalityContract,
        contract_status: "warning_first",
        review_ledger: {
          ...(finalPhysicalityContract.review_ledger as Record<string, unknown>),
          bytes: Buffer.byteLength(legacyReviewContent),
          sha256: sha256(legacyReviewContent),
          row_count: legacyReviewRows.length,
          logical_sha256: sha256(stableJson(legacyReviewRows as unknown as JsonValue)),
        },
        review_snapshot: {
          ...finalPhysicalityContract.review_snapshot,
          stage: "provisional_rc20",
          release_id: "v1-rc20",
          release_dir: rc20ReleaseDir,
          input_pins: rc20PhysicalityInputs,
          eligible_occurrence_count: 134,
          unique_treatment_count: legacyReviewRows.length,
          treatment_membership_count: legacyReviewRows.length,
        },
        final_post_semantic_release_guard: {
          ...finalPhysicalityContract.final_post_semantic_release_guard,
          status: "pending",
        },
      };
      writeFileSync(
        join(work, physicalityDir, "contract.json"),
        `${JSON.stringify(provisionalPhysicalityContract, null, 2)}\n`,
        "utf8",
      );
      mkdirSync(join(work, "data", "quality"), { recursive: true });
      symlinkSync(
        join(repoRoot, "data", "quality", "operational-coverage"),
        join(work, "data", "quality", "operational-coverage"),
        "dir",
      );
      const outputDir = join(work, defaultOutputDir);
      mkdirSync(outputDir, { recursive: true });
      const staleManifest = JSON.parse(
        readFileSync(join(repoRoot, baselineOutputDir, "manifest.json"), "utf8"),
      ) as {
        schema_version: number;
        mode: "warning";
        release_id: string;
        input_fingerprint: string;
        audit_fingerprint: string;
        input_pins: Array<{
          path: string;
          sha256: string;
          bytes: number;
          row_count?: number | undefined;
        }>;
        files: Record<string, {
          path: string;
          sha256: string;
          bytes: number;
          row_count?: number | undefined;
        }>;
      };
      for (const name of Object.keys(staleManifest.files)) {
        copyFileSync(join(repoRoot, baselineOutputDir, name), join(outputDir, name));
      }
      let replacedPinCount = 0;
      staleManifest.input_pins = staleManifest.input_pins.map((pin) => {
        if (!dispositionReviewPaths.has(pin.path)) return pin;
        replacedPinCount += 1;
        return { ...pin, sha256: "0".repeat(64) };
      });
      expect(replacedPinCount).toBe(2);
      staleManifest.input_fingerprint = sha256(stableJson({
        schema_version: staleManifest.schema_version,
        release_id: staleManifest.release_id,
        input_pins: [...staleManifest.input_pins]
          .sort((left, right) => left.path.localeCompare(right.path)),
      } as unknown as JsonValue));
      const staleSummary = JSON.parse(readFileSync(join(outputDir, "summary.json"), "utf8")) as {
        schema_version: number;
        mode: "warning";
        release_id: string;
        input_fingerprint: string;
        input_pins: typeof staleManifest.input_pins;
        [key: string]: unknown;
      };
      staleSummary.input_fingerprint = staleManifest.input_fingerprint;
      staleSummary.input_pins = structuredClone(staleManifest.input_pins);
      const staleSummaryContent = `${stableJson(staleSummary as unknown as JsonValue)}\n`;
      writeFileSync(join(outputDir, "summary.json"), staleSummaryContent, "utf8");
      staleManifest.files["summary.json"] = {
        path: "summary.json",
        sha256: sha256(staleSummaryContent),
        bytes: Buffer.byteLength(staleSummaryContent),
      };
      staleManifest.audit_fingerprint = sha256(stableJson({
        schema_version: staleManifest.schema_version,
        input_fingerprint: staleManifest.input_fingerprint,
        files: staleManifest.files,
      } as unknown as JsonValue));
      const staleManifestContent = `${stableJson(staleManifest as unknown as JsonValue)}\n`;
      writeFileSync(join(outputDir, "manifest.json"), staleManifestContent, "utf8");

      expect(() => loadRelationshipCompletenessArtifacts({ rootDir: work })).toThrow(
        "pinned disposition input changed",
      );

      const migrated = loadRelationshipCompletenessArtifacts({
        rootDir: work,
        reviewedCurrentCorpusMigration: true,
      });
      for (const path of dispositionReviewPaths) {
        const content = readFileSync(join(work, path), "utf8");
        expect(migrated.summary.input_pins.find((pin) => pin.path === path)).toEqual({
          path,
          sha256: sha256(content),
          bytes: Buffer.byteLength(content),
          row_count: content.trimEnd().split(/\r?\n/gu).length,
        });
      }
      expect(migrated.contents["report.md"]).toContain(
        "bun packages/cli/src/cli.ts relationship-completeness " +
          "--reviewed-current-corpus-migration --no-sync-db",
      );

      expect(() => loadRelationshipCompletenessArtifacts({
        rootDir: work,
        reviewedCurrentCorpusMigration: true,
        expectedReleaseManifestSha256: "0".repeat(64),
      })).toThrow("manifest SHA-256 mismatch");
      expect(() => loadRelationshipCompletenessArtifacts({
        rootDir: work,
        outputDir: "data/quality/relationship-integrity/not-the-default-boundary",
        reviewedCurrentCorpusMigration: true,
      })).toThrow(
        "--reviewed-current-corpus-migration is restricted to the default rc20 release/completeness output boundary",
      );

      const reportPath = join(outputDir, "report.md");
      const reportContent = readFileSync(reportPath, "utf8");
      writeFileSync(reportPath, `${reportContent}\nself-tampered\n`, "utf8");
      expect(() => loadRelationshipCompletenessArtifacts({
        rootDir: work,
        reviewedCurrentCorpusMigration: true,
      })).toThrow("existing completeness artifact pin mismatch");
      writeFileSync(reportPath, reportContent, "utf8");

      writeFileSync(
        join(outputDir, "manifest.json"),
        `${stableJson({ ...staleManifest, audit_fingerprint: "f".repeat(64) } as unknown as JsonValue)}\n`,
        "utf8",
      );
      expect(() => loadRelationshipCompletenessArtifacts({
        rootDir: work,
        reviewedCurrentCorpusMigration: true,
      })).toThrow("existing completeness audit_fingerprint mismatch");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("reproduces the current rc27 zero-warning completeness and retirement-closed physicality review", () => {
    const namedReleaseDir = "data/exports/releases/v1-rc27";
    const releaseSourceDir = existsSync(join(repoRoot, namedReleaseDir))
      ? namedReleaseDir
      : "data/exports/releases/.v1-rc27-completeness-input.treatment-semantics-v1/v1-rc27";
    const build = loadRelationshipCompletenessArtifacts({
      releaseDir: namedReleaseDir,
      ...(releaseSourceDir === namedReleaseDir ? {} : { releaseSourceDir }),
    });
    expect(build.summary.occurrences).toMatchObject({
      release_occurrence_count: 131,
      eligible_occurrence_count: 130,
      audited_occurrence_count: 130,
      counts_by_primary_disposition: {
        contract_roles_incomplete: 0,
        contract_roles_complete_migration_required: 0,
        contract_roles_complete: 130,
      },
      core_role_warning_occurrence_count: 0,
      contract_warning_occurrence_count: 0,
      schema_migration_warning_occurrence_count: 0,
      physical_scope_required_occurrence_count: 1,
      physical_scope_not_applicable_occurrence_count: 129,
      physicality_review_required_occurrence_count: 0,
      eligible_event_ids_in_operational_denominator: 131,
      eligible_event_ids_outside_operational_denominator: 0,
    });
    expect(build.summary.occurrence_treatment_physicality).toEqual({
      denominator_count: 269,
      occurrence_membership_count: 269,
      classification_counts: {
        physical_corridor_or_segment_intervention: 1,
        nonphysical_service_operations_policy_control: 268,
        point_or_stop_physical_intervention: 0,
        review_required: 0,
      },
      scope_requirement_counts: {
        corridor_or_segment_required: 1,
        not_applicable: 268,
        point_or_stop_required: 0,
        review_required: 0,
      },
      counts_by_primary_disposition: {
        reviewed_physical_corridor_or_segment: 1,
        reviewed_nonphysical: 268,
        reviewed_point_or_stop_physical: 0,
        review_required: 0,
      },
      occurrence_scope_disposition_counts: {
        physical_scope_satisfied: 1,
        physical_scope_missing: 0,
        physical_scope_relation_missing: 0,
        physical_scope_evidence_missing: 0,
        physical_scope_relation_invalid: 0,
        physicality_review_required: 0,
        physical_scope_not_applicable: 129,
      },
      finding_counts: {},
      policy_rule_count: 26,
      review_ledger_row_count: 269,
      contract_status: "reviewed_final",
      final_post_semantic_release_guard_status: "verified",
      review_ledger_complete: true,
      physical_scope_complete: true,
    });
    expect(build.summary.bus_lane_treatments).toEqual({
      denominator_count: 669,
      audited_treatment_count: 669,
      materialized_treatment_count: 669,
      accepted_pending_addition_count: 0,
      counts_by_primary_disposition: {
        physical_scope_satisfied: 163,
        non_physical_enforcement_or_control: 42,
        non_lane_supporting_feature: 17,
        aggregate_or_unbounded_treatment: 110,
        reviewed_non_projectable_physical_scope_unproven: 337,
        review_required: 0,
      },
      physical_scope_satisfied_count: 163,
      reviewed_non_projectable_count: 506,
      exact_evidence_bound_count: 669,
      omitted_treatment_count: 0,
      warning_treatment_count: 0,
      review_complete: true,
    });
    expect(build.summary.operational_events).toEqual({
      denominator_count: 1366,
      counts_by_primary_disposition: {
        eligible_occurrence_present: 131,
        legacy_terminal_gap_dispositions_only: 0,
        completeness_review_open: 0,
        versioned_non_projectable_disposition: 1235,
      },
      coverage_gap_row_count: 2931,
      coverage_gap_counts_by_verdict: {
        absent_in_source: 3,
        not_applicable: 492,
        unreviewed: 2436,
      },
      events_with_unreviewed_gap_count: 1142,
      eligible_occurrence_coverage_conflict_count: 0,
      ineligible_occurrence_event_count: 1,
    });
    const qbnrRenameEventIds = [
      "event_qm63-qbnr-rename-2025-06-30",
      "event_qm64-qbnr-rename-2025-06-30",
      "event_qm68-qbnr-rename-2025-06-30",
    ];
    expect(build.eventRows.filter((row) => qbnrRenameEventIds.includes(row.event_record_id))).toEqual(
      qbnrRenameEventIds.map((eventId) => expect.objectContaining({
        event_record_id: eventId,
        event_family: "other",
        denominator_basis: ["eligible_realized_occurrence_event"],
        primary_disposition: "eligible_occurrence_present",
        disposition_decision_id: null,
        study_projectable: true,
        warning_codes: [],
        reasons: expect.arrayContaining(["eligible_realized_occurrence_is_projectable_basis_no_waiver"]),
      })),
    );
    expect(build.summary.route_identities).toEqual({
      denominator_count: 395,
      audited_route_count: 395,
      counts_by_primary_disposition: {
        canonical_gtfs_anchor: 274,
        canonical_gtfs_variant: 25,
        reviewed_non_projectable_disposition: 96,
        route_identity_review_required: 0,
      },
      gtfs_bound_route_record_count: 299,
      reviewed_non_projectable_route_record_count: 96,
      disposition_counts: {
        aggregate_context: 10,
        external_service: 4,
        future_description: 12,
        historical_description: 16,
        non_bus_service: 47,
        route_family_context: 5,
        temporary_service: 2,
      },
    });
    expect(build.summary.warning_instances_by_code).toMatchObject({
      RC_OCCURRENCE_ROUTE_MISSING: 0,
      RC_OCCURRENCE_TREATMENT_MISSING: 0,
      RC_OCCURRENCE_ONSET_MISSING: 0,
      RC_OCCURRENCE_PHASE_IDENTITY_MISSING: 0,
      RC_OCCURRENCE_PHASE_RELATION_MISSING: 0,
      RC_OCCURRENCE_PHYSICAL_SCOPE_MISSING: 0,
      RC_OCCURRENCE_PHYSICALITY_REVIEW_REQUIRED: 0,
      RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_MISSING: 0,
      RC_OCCURRENCE_PHYSICAL_SCOPE_EVIDENCE_MISSING: 0,
      RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_INVALID: 0,
      RC_OCCURRENCE_POINT_SCOPE_CONTRACT_REQUIRED: 0,
      RC_TREATMENT_PHYSICALITY_REVIEW_REQUIRED: 0,
      RC_BUS_LANE_TREATMENT_SELECTOR_ACCOUNTING_REQUIRED: 0,
      RC_BUS_LANE_TREATMENT_SCOPE_OR_DISPOSITION_REQUIRED: 0,
      RC_BUS_LANE_TREATMENT_EVIDENCE_MISSING: 0,
      RC_OPERATIONAL_EVENT_REVIEW_OR_DISPOSITION_REQUIRED: 0,
      RC_OPERATIONAL_EVENT_VERSIONED_DISPOSITION_REQUIRED: 0,
      RC_OPERATIONAL_EVENT_OCCURRENCE_COVERAGE_CONFLICT: 0,
      RC_ROUTE_IDENTITY_ACCOUNTING_REQUIRED: 0,
      RC_ROUTE_IDENTITY_EVIDENCE_MISSING: 0,
    });
    expect(build.summary.enforcement_migration).toMatchObject({
      eligible_occurrence_core_roles_ready: true,
      phase_contract_ready: true,
      physical_scope_contract_ready: true,
      treatment_physicality_contract_ready: true,
      treatment_physicality_final_release_guard_ready: true,
      bus_lane_treatment_completeness_ready: true,
      operational_event_completeness_ready: true,
      route_identity_completeness_ready: true,
      hard_mode_ready: true,
    });
    const mirror = relationshipCompletenessDbMirror(build);
    const physicalitySubjects = mirror.subjects.filter((subject) =>
      subject.selector === "eligible_occurrence_treatment_physicality");
    expect(physicalitySubjects).toHaveLength(269);
    expect(physicalitySubjects.every((subject) =>
      subject.subjectKind === "treatment_component" &&
      subject.studyProjectable === false &&
      subject.roles.length === 1 &&
      subject.roles[0]?.role === "immutable_treatment_physicality_decision" &&
      subject.roles[0]?.status === "satisfied")).toBe(true);
    expect(mirror.selectorContracts.find((contract) =>
      contract.selector === "eligible_occurrence_treatment_physicality")).toEqual({
      contractId: "relationship-completeness-v1",
      selector: "eligible_occurrence_treatment_physicality",
      selectorClass: "reviewed_full_denominator",
      expectedCount: 269,
      actualCount: 269,
      enforcementEligible: true,
      promotionCriterion:
        "RC_TREATMENT_PHYSICALITY_REVIEW_REQUIRED: Every eligible-occurrence treatment has one immutable exact evidence-bound physicality decision with no drift.",
    });
    const busLaneSubjects = mirror.subjects.filter((subject) =>
      subject.selector === "bus_lane_family_treatment");
    expect(busLaneSubjects).toHaveLength(669);
    expect(busLaneSubjects.every((subject) =>
      subject.subjectKind === "treatment_component" &&
      subject.studyProjectable === false &&
      subject.warningCodes.length === 0 &&
      subject.roles.length === 3 &&
      subject.roles.every((role) => role.status === "satisfied"))).toBe(true);
    expect(mirror.selectorContracts.find((contract) =>
      contract.selector === "bus_lane_family_treatment")).toEqual({
        contractId: "relationship-completeness-v1",
        selector: "bus_lane_family_treatment",
        selectorClass: "reviewed_full_denominator",
        expectedCount: 669,
        actualCount: 669,
        enforcementEligible: true,
        promotionCriterion:
          "RC_BUS_LANE_TREATMENT_SELECTOR_ACCOUNTING_REQUIRED: Every row in the immutable bus-lane treatment inventory is represented exactly once in the completeness selector. " +
          "RC_BUS_LANE_TREATMENT_SCOPE_OR_DISPOSITION_REQUIRED: Every in-scope bus-lane treatment has canonical physical scope or an explicit reviewed non-projectable physical-scope disposition. " +
          "RC_BUS_LANE_TREATMENT_EVIDENCE_MISSING: Every bus-lane scope or non-projectable disposition is bound to exact evidence on the reviewed treatment identity.",
      });
    expect(mirror.selectorContracts.find((contract) =>
      contract.selector === "operational_event_family")).toMatchObject({
        expectedCount: 1366,
        actualCount: 1366,
        enforcementEligible: true,
      });
    const occurrenceSubjects = mirror.subjects.filter((subject) =>
      subject.selector === "eligible_operational_occurrence");
    expect(occurrenceSubjects).toHaveLength(130);
    expect(occurrenceSubjects.filter((subject) =>
      subject.roles.some((role) => role.role === "physical_scope" && role.status === "missing")))
      .toEqual([]);
    expect(occurrenceSubjects.filter((subject) =>
      subject.roles.some((role) => role.role === "physical_scope" && role.status === "satisfied")))
      .toHaveLength(1);
    expect(occurrenceSubjects.filter((subject) =>
      subject.roles.some((role) => role.role === "physical_scope" && role.status === "not_applicable")))
      .toHaveLength(129);
    expect(mirror.findings).toEqual([]);
    expect(mirror.enforcement).toMatchObject({
      mode: "warning",
      hardModeReady: true,
      criteriaJson: {
        eligible_occurrence_core_roles_ready: true,
        phase_contract_ready: true,
        physical_scope_contract_ready: true,
        treatment_physicality_contract_ready: true,
        treatment_physicality_final_release_guard_ready: true,
      },
    });
    expect(build.summary.input_pins.some((pin) =>
      pin.path === "data/exports/releases/v1-rc27/manifest.json")).toBe(false);
    expect(build.summary.input_pins.filter((pin) =>
      pin.path.startsWith("data/contracts/occurrence-treatment-physicality/v1/")))
      .toEqual([
        {
          path: "data/contracts/occurrence-treatment-physicality/v1/contract.json",
          bytes: 3881,
          sha256: "7e29d28c614483b6f6c2ad1833584defc6ec2ef55371546e1d57121bc81c4b03",
        },
        {
          path: "data/contracts/occurrence-treatment-physicality/v1/policy.json",
          bytes: 16189,
          sha256: "4b664726e353e7b1d823409b054fe3ecd931bf87da63eb8ffcd9c0ecda913ed5",
        },
        {
          path: "data/contracts/occurrence-treatment-physicality/v1/retired-review-ledger.jsonl",
          bytes: 12721,
          sha256: "d8c5be24a0d68e2ec6b0b3b33b0c18bb8d83c0d55a98ed3f10b126988fd9a54a",
          row_count: 7,
        },
        {
          path: "data/contracts/occurrence-treatment-physicality/v1/review-ledger.jsonl",
          bytes: 492080,
          sha256: "937259630ea1aa981b84f1cb1cc709bd897753774580f2bb128575d78b84b433",
          row_count: 269,
        },
        {
          path: "data/contracts/occurrence-treatment-physicality/v1/review-retirement-receipt.json",
          bytes: 3616,
          sha256: "cee8560fafd0cdffba24e73976303e8dc1a0a1bd2255c7a4ed05b9aa1718709b",
        },
      ]);
    for (const [name, metadata] of Object.entries(build.manifest.files)) {
      expect(sha256(build.contents[name]!)).toBe(metadata.sha256);
      expect(Buffer.byteLength(build.contents[name]!)).toBe(metadata.bytes);
    }
  });
});
