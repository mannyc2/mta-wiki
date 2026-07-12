import { describe, expect, it } from "bun:test";
import {
  findRelationCandidates,
  normalizeRelationFamily,
  normalizeRelationKind,
  normalizeRelationPayload,
  possibleRelationCandidatesForSource,
  relationEndpointShapeIssue,
} from "@mta-wiki/pipeline/records/relations";
import type { JsonObject, MtaCanonicalRecord, MtaObservationKind, MtaSubmissionEntry } from "@mta-wiki/db/types";

const sourceId = "test_relation_candidates_source";

function entry(kind: MtaObservationKind, localId: string, payload: JsonObject = {}, label = localId): MtaSubmissionEntry {
  return {
    submission_id: `sub_${localId}`,
    run_id: "test_run",
    submitted_at: "2026-06-08T00:00:00.000Z",
    tool_args_sha256: `sha256:${localId}`,
    tool_args: {
      source_id: sourceId,
      observation_kind: kind,
      local_observation_id: localId,
      label,
      payload,
      evidence_refs: [],
    },
    validation: {
      state: "accepted",
      issues: [],
    },
  };
}

function record(recordId: string, kind: MtaObservationKind, payload: JsonObject = {}): MtaCanonicalRecord {
  return {
    record_id: recordId,
    record_kind: kind,
    source_id: sourceId,
    source_ids: [sourceId],
    local_observation_id: recordId.replace(/-/gu, "_"),
    local_observation_ids: [recordId.replace(/-/gu, "_")],
    display_name: recordId,
    payload,
    evidence_refs: [],
    submission_ids: [`sub_${recordId}`],
    truth_status: "source_stated",
    review_state: "unreviewed",
    generated_at: "2026-06-08T00:00:00.000Z",
  };
}

describe("relation helpers", () => {
  it("accepts expected endpoint shapes and reports unexpected known shapes", () => {
    expect(relationEndpointShapeIssue("serves_route", "project", "route")).toBeUndefined();
    expect(relationEndpointShapeIssue("affects_route", "event", "route")).toBeUndefined();
    expect(relationEndpointShapeIssue("has_timeline_event", "entity", "event")).toBeUndefined();
    expect(relationEndpointShapeIssue("has_timeline_event", "source", "event")).toBeUndefined();
    expect(relationEndpointShapeIssue("has_timeline_event", "event", "event")).toBeUndefined();
    expect(relationEndpointShapeIssue("has_timeline_event", "treatment_component", "event")).toBeUndefined();
    expect(relationEndpointShapeIssue("has_metric_claim", "project", "metric_claim")).toBeUndefined();
    expect(relationEndpointShapeIssue("has_metric", "event", "metric_claim")).toBeUndefined();
    expect(relationEndpointShapeIssue("has_metric", "claim", "metric_claim")).toBeUndefined();
    expect(relationEndpointShapeIssue("has_claim", "event", "claim")).toBeUndefined();
    expect(relationEndpointShapeIssue("has_claim", "treatment_component", "claim")).toBeUndefined();
    expect(relationEndpointShapeIssue("has_treatment", "route", "treatment_component")).toBeUndefined();
    expect(relationEndpointShapeIssue("operates_on_corridor", "entity", "corridor")).toBeUndefined();
    expect(relationEndpointShapeIssue("implemented_by", "project", "entity")).toBeUndefined();
    expect(relationEndpointShapeIssue("operated_by", "corridor", "entity")).toBeUndefined();
    expect(relationEndpointShapeIssue("owned_by", "corridor", "entity")).toBeUndefined();

    // W0 ontology decision (data/ontology-decisions/W0-corridor-serves-route-decision.md): corridor
    // admitted as a legal serves_route subject, so the expected-subject set is project|corridor.
    expect(relationEndpointShapeIssue("serves_route", "corridor", "route")).toBeUndefined();
    expect(relationEndpointShapeIssue("has_timeline_event", "source", "entity")?.message).toContain(
      "expects project|route|corridor|entity|source|event|treatment_component -> event",
    );
    expect(relationEndpointShapeIssue("has_metric", "source", "claim")?.message).toContain(
      "expects project|route|corridor|entity|event|claim -> metric_claim",
    );
    expect(relationEndpointShapeIssue("has_claim", "claim", "claim")?.message).toContain(
      "expects project|route|corridor|entity|source|event|treatment_component -> claim",
    );
    expect(relationEndpointShapeIssue("has_claim", "metric_claim", "claim")?.message).toContain(
      "expects project|route|corridor|entity|source|event|treatment_component -> claim",
    );
    expect(relationEndpointShapeIssue("has_claim", "treatment_component", "metric_claim")?.message).toContain(
      "expects project|route|corridor|entity|source|event|treatment_component -> claim",
    );
    expect(relationEndpointShapeIssue("has_treatment", "claim", "treatment_component")?.message).toContain(
      "expects project|corridor|route -> treatment_component",
    );
    expect(relationEndpointShapeIssue("has_treatment", "event", "treatment_component")?.message).toContain(
      "expects project|corridor|route -> treatment_component",
    );
    expect(relationEndpointShapeIssue("has_treatment", "entity", "metric_claim")?.message).toContain(
      "expects project|corridor|route -> treatment_component",
    );
    expect(relationEndpointShapeIssue("has_treatment", "source", "treatment_component")?.message).toContain(
      "expects project|corridor|route -> treatment_component",
    );
    expect(relationEndpointShapeIssue("has_treatment", "treatment_component", "treatment_component")?.message).toContain(
      "expects project|corridor|route -> treatment_component",
    );
    expect(relationEndpointShapeIssue("has_treatment", "route", "metric_claim")?.message).toContain(
      "expects project|corridor|route -> treatment_component",
    );
    expect(relationEndpointShapeIssue("operates_on_corridor", "project", "corridor")?.message).toContain(
      "expects route|entity -> corridor",
    );
    expect(relationEndpointShapeIssue("operates_on_corridor", "project", "entity")?.message).toContain("expects route|entity -> corridor");
    expect(relationEndpointShapeIssue("operates_on_corridor", "entity", "entity")?.message).toContain("expects route|entity -> corridor");
    expect(relationEndpointShapeIssue("operates_on_corridor", "source", "corridor")?.message).toContain("expects route|entity -> corridor");
    expect(relationEndpointShapeIssue("operates_on_corridor", "claim", "corridor")?.message).toContain("expects route|entity -> corridor");
    expect(relationEndpointShapeIssue("operates_on_corridor", "event", "corridor")?.message).toContain("expects route|entity -> corridor");
    expect(relationEndpointShapeIssue("operated_by", "entity", "entity")?.message).toContain("expects project|route|corridor -> entity");
    expect(relationEndpointShapeIssue("operated_by", "treatment_component", "entity")?.message).toContain("expects project|route|corridor -> entity");
    expect(relationEndpointShapeIssue("owned_by", "event", "entity")?.message).toContain("expects entity|project|corridor -> entity");
    expect(relationEndpointShapeIssue("owned_by", "source", "entity")?.message).toContain("expects entity|project|corridor -> entity");
    const issue = relationEndpointShapeIssue("serves_route", "route", "project");
    expect(issue?.message).toContain("expects project|corridor -> route");
  });

  it("normalizes exact relation-kind aliases only when direction is preserved", () => {
    expect(normalizeRelationKind("has_metric_claim")).toBe("has_metric");
    expect(normalizeRelationKind("has_implementing_entity")).toBe("implemented_by");
    expect(normalizeRelationKind("implementing_agency")).toBe("implemented_by");
    expect(normalizeRelationKind("lead_agency")).toBe("lead_agency");
  });

  it("adds bounded relation families while preserving raw relation kind labels", () => {
    expect(normalizeRelationFamily("has_metric_claim")).toBe("metric_context");
    expect(normalizeRelationFamily("has_agenda_item")).toBe("timeline_context");
    expect(normalizeRelationFamily("subject_of_agenda_item")).toBe("timeline_context");
    expect(normalizeRelationFamily("discussed_at")).toBe("timeline_context");
    expect(normalizeRelationFamily("operates_route")).toBe("route_scope");
    expect(normalizeRelationFamily("applies_to_route")).toBe("route_scope");
    expect(normalizeRelationFamily("identifies_corridor")).toBe("corridor_scope");
    expect(normalizeRelationFamily("located_at")).toBe("location_scope");
    expect(normalizeRelationFamily("adjacent_to")).toBe("location_scope");
    expect(normalizeRelationFamily("implements_treatment")).toBe("treatment_context");
    expect(normalizeRelationFamily("proposes_treatment")).toBe("treatment_context");
    expect(normalizeRelationFamily("has_lead_agency")).toBe("agency_role");
    expect(normalizeRelationFamily("lead_agency")).toBe("agency_role");
    expect(normalizeRelationFamily("employed_by")).toBe("agency_role");
    expect(normalizeRelationFamily("works_for")).toBe("agency_role");
    expect(normalizeRelationFamily("president_of")).toBe("agency_role");
    expect(normalizeRelationFamily("reports_to")).toBe("agency_role");
    expect(normalizeRelationFamily("presented_by")).toBe("agency_role");
    expect(normalizeRelationFamily("oversees")).toBe("agency_role");
    expect(normalizeRelationFamily("acts_on_behalf_of")).toBe("agency_role");
    expect(normalizeRelationFamily("presents_to")).toBe("agency_role");
    expect(normalizeRelationFamily("is_president_of")).toBe("agency_role");
    expect(normalizeRelationFamily("parent_organization")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("has_agency")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("member_of")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("has_subsidiary")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("parent_subsidiary")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("parent_agency")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("is_subsidiary_of")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("subsidiary")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("subsidiary_of")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("prepared_by")).toBe("publication_role");
    expect(normalizeRelationFamily("about")).toBe("publication_role");
    expect(normalizeRelationFamily("covers_entity")).toBe("publication_role");
    expect(normalizeRelationFamily("authored_by")).toBe("publication_role");
    expect(normalizeRelationFamily("funded_by")).toBe("funding_award");
    expect(normalizeRelationFamily("leases_to")).toBe("funding_award");
    expect(normalizeRelationFamily("has_counterparty")).toBe("funding_award");
    expect(normalizeRelationFamily("awarded_to")).toBe("funding_award");
    expect(normalizeRelationFamily("has_contractor")).toBe("funding_award");
    expect(normalizeRelationFamily("organized_by")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("has_participant")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("coordinates_with")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("approved_by")).toBe("governance_legal");
    expect(normalizeRelationFamily("reviewed_by")).toBe("governance_legal");
    expect(normalizeRelationFamily("submitted_to")).toBe("governance_legal");
    expect(normalizeRelationFamily("transfers_funds_to")).toBe("funding_award");
    expect(normalizeRelationFamily("license_agreement")).toBe("funding_award");
    expect(normalizeRelationFamily("procures_from")).toBe("funding_award");
    expect(normalizeRelationFamily("procures")).toBe("funding_award");
    expect(normalizeRelationFamily("implements_project")).toBe("program_project_scope");
    expect(normalizeRelationFamily("supports_project")).toBe("program_project_scope");
    expect(normalizeRelationFamily("has_gap")).toBe("claim_context");
    expect(normalizeRelationFamily("has_recurring_agenda_item")).toBe("claim_context");
    expect(normalizeRelationFamily("precedes")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("presented_at")).toBe("timeline_context");
    expect(normalizeRelationFamily("has_event")).toBe("timeline_context");
    expect(normalizeRelationFamily("requires_approval_from")).toBe("governance_legal");
    expect(normalizeRelationFamily("board_approves")).toBe("governance_legal");
    expect(normalizeRelationFamily("license_agreement_with")).toBe("funding_award");
    expect(normalizeRelationFamily("beneficiary_of_agreement")).toBe("funding_award");
    expect(normalizeRelationFamily("chairs")).toBe("agency_role");
    expect(normalizeRelationFamily("general_counsel_of")).toBe("agency_role");
    expect(normalizeRelationFamily("project_partner")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("participates_in")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("is_about")).toBe("publication_role");
    expect(normalizeRelationFamily("includes_section")).toBe("publication_role");
    expect(normalizeRelationFamily("has_section")).toBe("publication_role");
    expect(normalizeRelationFamily("contains_project")).toBe("program_project_scope");
    expect(normalizeRelationFamily("implements_on_route")).toBe("program_project_scope");
    expect(normalizeRelationFamily("has_project_feature")).toBe("program_project_scope");
    expect(normalizeRelationFamily("has_project_scope")).toBe("program_project_scope");
    expect(normalizeRelationFamily("affects_corridor")).toBe("corridor_scope");
    expect(normalizeRelationFamily("examined_corridor")).toBe("corridor_scope");
    expect(normalizeRelationFamily("serves_stop")).toBe("treatment_context");
    expect(normalizeRelationFamily("has_subunit")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("aggregates")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("is_component_unit_of")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("accountable_for")).toBe("agency_role");
    expect(normalizeRelationFamily("has_project_manager")).toBe("agency_role");
    expect(normalizeRelationFamily("provides_audit_services_to")).toBe("agency_role");
    expect(normalizeRelationFamily("implements_for")).toBe("agency_role");
    expect(normalizeRelationFamily("operated_on")).toBe("agency_role");
    expect(normalizeRelationFamily("works_at")).toBe("agency_role");
    expect(normalizeRelationFamily("developed_scenarios_for")).toBe("agency_role");
    expect(normalizeRelationFamily("developed")).toBe("agency_role");
    expect(normalizeRelationFamily("issues_novis")).toBe("agency_role");
    expect(normalizeRelationFamily("maintains_equipment_at")).toBe("agency_role");
    expect(normalizeRelationFamily("performs_work_for")).toBe("agency_role");
    expect(normalizeRelationFamily("provided_valuation_for")).toBe("agency_role");
    expect(normalizeRelationFamily("receives_services_from")).toBe("agency_role");
    expect(normalizeRelationFamily("selected_by")).toBe("agency_role");
    expect(normalizeRelationFamily("supported_by")).toBe("agency_role");
    expect(normalizeRelationFamily("provides_service_to")).toBe("agency_role");
    expect(normalizeRelationFamily("provides_service_for")).toBe("agency_role");
    expect(normalizeRelationFamily("provides_service")).toBe("agency_role");
    expect(normalizeRelationFamily("provides_services_for")).toBe("agency_role");
    expect(normalizeRelationFamily("provides_security_for")).toBe("agency_role");
    expect(normalizeRelationFamily("performs_audit")).toBe("agency_role");
    expect(normalizeRelationFamily("performed_services_for")).toBe("agency_role");
    expect(normalizeRelationFamily("proposed_by")).toBe("agency_role");
    expect(normalizeRelationFamily("proposed_as")).toBe("agency_role");
    expect(normalizeRelationFamily("agency_for")).toBe("agency_role");
    expect(normalizeRelationFamily("covers_agency")).toBe("agency_role");
    expect(normalizeRelationFamily("acting_for")).toBe("agency_role");
    expect(normalizeRelationFamily("operates_for")).toBe("agency_role");
    expect(normalizeRelationFamily("procured_for")).toBe("agency_role");
    expect(normalizeRelationFamily("holds_position")).toBe("agency_role");
    expect(normalizeRelationFamily("has_transaction_manager")).toBe("agency_role");
    expect(normalizeRelationFamily("accountable_executive_for")).toBe("agency_role");
    expect(normalizeRelationFamily("has_oversight")).toBe("agency_role");
    expect(normalizeRelationFamily("delegates_to")).toBe("agency_role");
    expect(normalizeRelationFamily("has_procurement_representative")).toBe("agency_role");
    expect(normalizeRelationFamily("chief_safety_officer_for")).toBe("agency_role");
    expect(normalizeRelationFamily("has_author")).toBe("publication_role");
    expect(normalizeRelationFamily("sourced_from")).toBe("publication_role");
    expect(normalizeRelationFamily("contributes_to")).toBe("program_project_scope");
    expect(normalizeRelationFamily("studies_corridor")).toBe("corridor_scope");
    expect(normalizeRelationFamily("replaces_route")).toBe("route_scope");
    expect(normalizeRelationFamily("extends_route")).toBe("route_scope");
    expect(normalizeRelationFamily("discontinues_route")).toBe("route_scope");
    expect(normalizeRelationFamily("enforces_on_route")).toBe("route_scope");
    expect(normalizeRelationFamily("has_route_adjustment")).toBe("route_scope");
    expect(normalizeRelationFamily("has_planned_change")).toBe("route_scope");
    expect(normalizeRelationFamily("has_mitigation")).toBe("route_scope");
    expect(normalizeRelationFamily("implements_service")).toBe("route_scope");
    expect(normalizeRelationFamily("includes_service")).toBe("program_project_scope");
    expect(normalizeRelationFamily("organized")).toBe("timeline_context");
    expect(normalizeRelationFamily("organized_meeting")).toBe("timeline_context");
    expect(normalizeRelationFamily("partnered_with")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("co_presented")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("advisory_services")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("implements_with")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("operates_with")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("partner_of")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("provides_consulting")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("provides_guidance")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("provides_information_to")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("requests_approval")).toBe("governance_legal");
    expect(normalizeRelationFamily("requests_authorization")).toBe("governance_legal");
    expect(normalizeRelationFamily("established_goals_for")).toBe("governance_legal");
    expect(normalizeRelationFamily("has_approval_body")).toBe("governance_legal");
    expect(normalizeRelationFamily("has_requirement")).toBe("governance_legal");
    expect(normalizeRelationFamily("recommended")).toBe("governance_legal");
    expect(normalizeRelationFamily("resolved_in_favor_of")).toBe("governance_legal");
    expect(normalizeRelationFamily("regulates")).toBe("governance_legal");
    expect(normalizeRelationFamily("review_for")).toBe("governance_legal");
    expect(normalizeRelationFamily("subject_to_assessment")).toBe("governance_legal");
    expect(normalizeRelationFamily("manages_lease_with")).toBe("funding_award");
    expect(normalizeRelationFamily("provides_funding")).toBe("funding_award");
    expect(normalizeRelationFamily("supplies")).toBe("funding_award");
    expect(normalizeRelationFamily("contracted_vendor")).toBe("funding_award");
    expect(normalizeRelationFamily("subcontracted_by")).toBe("funding_award");
    expect(normalizeRelationFamily("service_provider")).toBe("funding_award");
    expect(normalizeRelationFamily("has_service_provider")).toBe("funding_award");
    expect(normalizeRelationFamily("engaged_as")).toBe("funding_award");
    expect(normalizeRelationFamily("provides_funding_for")).toBe("funding_award");
    expect(normalizeRelationFamily("has_funding_source")).toBe("funding_award");
    expect(normalizeRelationFamily("finances")).toBe("funding_award");
    expect(normalizeRelationFamily("has_new_need")).toBe("funding_award");
    expect(normalizeRelationFamily("access_agreement")).toBe("funding_award");
    expect(normalizeRelationFamily("funder")).toBe("funding_award");
    expect(normalizeRelationFamily("funding_transfer")).toBe("funding_award");
    expect(normalizeRelationFamily("provided_funding")).toBe("funding_award");
    expect(normalizeRelationFamily("receives_reports_from")).toBe("agency_role");
    expect(normalizeRelationFamily("grants_easement_to")).toBe("funding_award");
    expect(normalizeRelationFamily("contractor")).toBe("funding_award");
    expect(normalizeRelationFamily("contract_vendor")).toBe("funding_award");
    expect(normalizeRelationFamily("purchased_by")).toBe("funding_award");
    expect(normalizeRelationFamily("license_agreement_amendment")).toBe("funding_award");
    expect(normalizeRelationFamily("easement_agreement")).toBe("funding_award");
    expect(normalizeRelationFamily("has_competing_bidder")).toBe("funding_award");
    expect(normalizeRelationFamily("has_lease_term")).toBe("funding_award");
    expect(normalizeRelationFamily("engaged")).toBe("funding_award");
    expect(normalizeRelationFamily("issued_procurement_for")).toBe("funding_award");
    expect(normalizeRelationFamily("lead_contractor_for")).toBe("funding_award");
    expect(normalizeRelationFamily("leases")).toBe("funding_award");
    expect(normalizeRelationFamily("licensee_to")).toBe("funding_award");
    expect(normalizeRelationFamily("licenses")).toBe("funding_award");
    expect(normalizeRelationFamily("licenses_to")).toBe("funding_award");
    expect(normalizeRelationFamily("manufactured_by")).toBe("funding_award");
    expect(normalizeRelationFamily("results_in_savings_for")).toBe("funding_award");
    expect(normalizeRelationFamily("retains")).toBe("funding_award");
    expect(normalizeRelationFamily("subcontracts")).toBe("funding_award");
    expect(normalizeRelationFamily("has_related_contract")).toBe("funding_award");
    expect(normalizeRelationFamily("authorized_by")).toBe("governance_legal");
    expect(normalizeRelationFamily("authorizes")).toBe("governance_legal");
    expect(normalizeRelationFamily("certifies")).toBe("governance_legal");
    expect(normalizeRelationFamily("certified_by")).toBe("governance_legal");
    expect(normalizeRelationFamily("has_legal_approval")).toBe("governance_legal");
    expect(normalizeRelationFamily("has_legal_name")).toBe("governance_legal");
    expect(normalizeRelationFamily("filed_with")).toBe("governance_legal");
    expect(normalizeRelationFamily("issued_by")).toBe("governance_legal");
    expect(normalizeRelationFamily("permittee")).toBe("governance_legal");
    expect(normalizeRelationFamily("permittee_for")).toBe("governance_legal");
    expect(normalizeRelationFamily("approved_at")).toBe("timeline_context");
    expect(normalizeRelationFamily("related_event")).toBe("timeline_context");
    expect(normalizeRelationFamily("launched_by")).toBe("timeline_context");
    expect(normalizeRelationFamily("has_minutes")).toBe("timeline_context");
    expect(normalizeRelationFamily("held_timeline_event")).toBe("timeline_context");
    expect(normalizeRelationFamily("held_meeting")).toBe("timeline_context");
    expect(normalizeRelationFamily("precedes_event")).toBe("timeline_context");
    expect(normalizeRelationFamily("agenda_item")).toBe("timeline_context");
    expect(normalizeRelationFamily("has_planned_event")).toBe("timeline_context");
    expect(normalizeRelationFamily("hosted_at")).toBe("timeline_context");
    expect(normalizeRelationFamily("operates_program")).toBe("program_project_scope");
    expect(normalizeRelationFamily("has_subproject")).toBe("program_project_scope");
    expect(normalizeRelationFamily("includes_subproject")).toBe("program_project_scope");
    expect(normalizeRelationFamily("has_project_component")).toBe("program_project_scope");
    expect(normalizeRelationFamily("has_associated_metric")).toBe("metric_context");
    expect(normalizeRelationFamily("assigned_rating")).toBe("metric_context");
    expect(normalizeRelationFamily("assigned_rating_to")).toBe("metric_context");
    expect(normalizeRelationFamily("has_position_allocation")).toBe("metric_context");
    expect(normalizeRelationFamily("has_safety_designation")).toBe("claim_context");
    expect(normalizeRelationFamily("has_board_item")).toBe("claim_context");
    expect(normalizeRelationFamily("has_status")).toBe("claim_context");
    expect(normalizeRelationFamily("has_subtheme")).toBe("claim_context");
    expect(normalizeRelationFamily("has_related_work")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("depends_on")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("contingent_on")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("used_by")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("uses_infrastructure")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("owns")).toBe("ownership_role");
    expect(normalizeRelationFamily("owns_project")).toBe("ownership_role");
    expect(normalizeRelationFamily("owns_property")).toBe("ownership_role");
    expect(normalizeRelationFamily("has_real_estate_action")).toBe("ownership_role");
    expect(normalizeRelationFamily("briefed_to")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("provides_input_to")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("requires_coordination_with")).toBe("partnership_engagement");
    expect(normalizeRelationFamily("has_award")).toBe("funding_award");
    expect(normalizeRelationFamily("has_funding_partner")).toBe("funding_award");
    expect(normalizeRelationFamily("includes_expenses_of")).toBe("funding_award");
    expect(normalizeRelationFamily("distributes_to")).toBe("funding_award");
    expect(normalizeRelationFamily("has_joint_procurement")).toBe("funding_award");
    expect(normalizeRelationFamily("critical_for")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("has_qualification")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("succeeded")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("same_as")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("also_known_as")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("replaced")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("child_of")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("formed")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("has_division")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("headed_by")).toBe("organization_hierarchy");
    expect(normalizeRelationFamily("commissioned_by")).toBe("agency_role");
    expect(normalizeRelationFamily("formerly_employed_by")).toBe("agency_role");
    expect(normalizeRelationFamily("acted_on_behalf_of")).toBe("agency_role");
    expect(normalizeRelationFamily("agency_of")).toBe("agency_role");
    expect(normalizeRelationFamily("appointed_as")).toBe("agency_role");
    expect(normalizeRelationFamily("audits")).toBe("agency_role");
    expect(normalizeRelationFamily("conducted_investigation_on")).toBe("agency_role");
    expect(normalizeRelationFamily("developer")).toBe("agency_role");
    expect(normalizeRelationFamily("enforces_for")).toBe("agency_role");
    expect(normalizeRelationFamily("has_requesting_department")).toBe("agency_role");
    expect(normalizeRelationFamily("has_independent_engineering_consultant")).toBe("agency_role");
    expect(normalizeRelationFamily("independent_engineering_consultant_for")).toBe("agency_role");
    expect(normalizeRelationFamily("is_department_head_of")).toBe("agency_role");
    expect(normalizeRelationFamily("is_employee_of")).toBe("agency_role");
    expect(normalizeRelationFamily("is_executive_vice_president_of")).toBe("agency_role");
    expect(normalizeRelationFamily("is_financial_liaison_for")).toBe("agency_role");
    expect(normalizeRelationFamily("is_interim_president_of")).toBe("agency_role");
    expect(normalizeRelationFamily("is_liaison_for")).toBe("agency_role");
    expect(normalizeRelationFamily("is_principal_of")).toBe("agency_role");
    expect(normalizeRelationFamily("lead_by")).toBe("agency_role");
    expect(normalizeRelationFamily("managed_by_department")).toBe("agency_role");
    expect(normalizeRelationFamily("manages_portfolios_for")).toBe("agency_role");
    expect(normalizeRelationFamily("manages_program")).toBe("agency_role");
    expect(normalizeRelationFamily("manages_projects_for")).toBe("agency_role");
    expect(normalizeRelationFamily("on_behalf_of")).toBe("agency_role");
    expect(normalizeRelationFamily("overseen_by")).toBe("agency_role");
    expect(normalizeRelationFamily("oversees_project")).toBe("agency_role");
    expect(normalizeRelationFamily("planned_by")).toBe("agency_role");
    expect(normalizeRelationFamily("primary_policing_agency_for")).toBe("agency_role");
    expect(normalizeRelationFamily("has_presence_in")).toBe("agency_role");
    expect(normalizeRelationFamily("serves_agency")).toBe("agency_role");
    expect(normalizeRelationFamily("serves_entity")).toBe("agency_role");
    expect(normalizeRelationFamily("provides_services_to")).toBe("agency_role");
    expect(normalizeRelationFamily("provides_support_to")).toBe("agency_role");
    expect(normalizeRelationFamily("delivered_presentation")).toBe("agency_role");
    expect(normalizeRelationFamily("senior_vice_president_of")).toBe("agency_role");
    expect(normalizeRelationFamily("supervises")).toBe("agency_role");
    expect(normalizeRelationFamily("transaction_manager_for")).toBe("agency_role");
    expect(normalizeRelationFamily("under_direction_of")).toBe("agency_role");
    expect(normalizeRelationFamily("addresses_entity")).toBe("publication_role");
    expect(normalizeRelationFamily("has_subject")).toBe("publication_role");
    expect(normalizeRelationFamily("has_workplan")).toBe("publication_role");
    expect(normalizeRelationFamily("is_subject_of")).toBe("publication_role");
    expect(normalizeRelationFamily("is_work_plan_of")).toBe("publication_role");
    expect(normalizeRelationFamily("report_subject")).toBe("publication_role");
    expect(normalizeRelationFamily("publishes_data_to")).toBe("data_reporting");
    expect(normalizeRelationFamily("source_data_provider")).toBe("data_reporting");
    expect(normalizeRelationFamily("uses_data_source")).toBe("data_reporting");
    expect(normalizeRelationFamily("ratified")).toBe("governance_legal");
    expect(normalizeRelationFamily("regulatory_authority_over")).toBe("governance_legal");
    expect(normalizeRelationFamily("submits_for_board_approval")).toBe("governance_legal");
    expect(normalizeRelationFamily("voted_to_recommend")).toBe("governance_legal");
    expect(normalizeRelationFamily("seller")).toBe("funding_award");
    expect(normalizeRelationFamily("seller_to")).toBe("funding_award");
    expect(normalizeRelationFamily("sells_to")).toBe("funding_award");
    expect(normalizeRelationFamily("subcontractor_of")).toBe("funding_award");
    expect(normalizeRelationFamily("supplied_by")).toBe("funding_award");
    expect(normalizeRelationFamily("transfers_surplus_to")).toBe("funding_award");
    expect(normalizeRelationFamily("has_facility")).toBe("location_scope");
    expect(normalizeRelationFamily("near_station")).toBe("location_scope");
    expect(normalizeRelationFamily("acquired")).toBe("ownership_role");
    expect(normalizeRelationFamily("adjacent_property_owner")).toBe("ownership_role");
    expect(normalizeRelationFamily("supports_event")).toBe("timeline_context");
    expect(normalizeRelationFamily("uses_treatment")).toBe("treatment_context");
    expect(normalizeRelationFamily("aligned_with")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("challenges")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("due_to")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("enables")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("is_related_to")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("related_entity")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("result_of")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("source_of")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("supplements")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("uses_infrastructure_of")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("will_use")).toBe("dependency_or_reference");
    expect(normalizeRelationFamily("presented")).toBe("other");
    expect(normalizeRelationFamily("prepared")).toBe("other");
    expect(normalizeRelationFamily("unreviewed source literal")).toBe("other");

    expect(
      normalizeRelationPayload({
        relation_kind: "supports",
        relation_family: "dependency_or_reference",
        subject_id: "event_subcommittee-approvals-feb26-2024",
        object_id: "claim_m7-propulsion-contract-term",
        description:
          "Replacement for malformed has_timeline_event claim->event relation; the subcommittee approval event provides timeline context for the M7 contract-term claim.",
      }).relation_family,
    ).toBe("timeline_context");
    expect(
      normalizeRelationPayload({
        relation_kind: "supports",
        relation_family: "dependency_or_reference",
        subject_id: "event_mta-board-feb2024",
        object_id: "metric_bt-2023-operating-surplus",
        description:
          "Replacement for malformed has_timeline_event metric_claim -> event relation; the February 28, 2024 MTA Board event provides timeline context for the 2023 TBTA operating-surplus metric claim.",
      }).relation_family,
    ).toBe("timeline_context");
    expect(
      normalizeRelationPayload({
        relation_kind: "supports",
        subject_id: "project_test",
        object_id: "project_other",
        description: "Project support dependency.",
      }).relation_family,
    ).toBe("dependency_or_reference");
	    expect(
	      normalizeRelationPayload({
	        relation_kind: "supports",
	        relation_family: "dependency_or_reference",
	        subject_id: "event_test",
	        object_id: "claim_test",
	        description: "The event supports the claim.",
	      }).relation_family,
	    ).toBe("dependency_or_reference");
    expect(
      normalizeRelationPayload({
        relation_kind: "supports",
        relation_family: "dependency_or_reference",
        subject_id: "claim_test",
        object_id: "event_test",
        description:
          "Replacement for malformed has_timeline_event claim->event relation; the subcommittee approval event provides timeline context for the M7 contract-term claim.",
      }).relation_family,
    ).toBe("dependency_or_reference");
    expect(
      normalizeRelationPayload({
        relation_kind: "supports",
        relation_family: "dependency_or_reference",
        subject_id: "event_test",
        object_id: "entity_test",
        description:
          "Replacement for malformed has_timeline_event claim->event relation; the subcommittee approval event provides timeline context for the M7 contract-term claim.",
      }).relation_family,
    ).toBe("dependency_or_reference");

	    expect(normalizeRelationPayload({ relation_kind: "has_corridor" })).toEqual({
      raw_relation_kind: "has_corridor",
      relation_kind: "uses_corridor",
      relation_family: "corridor_scope",
    });
    expect(normalizeRelationPayload({ relation_kind: "lead_agency" })).toEqual({
      relation_kind: "lead_agency",
      relation_family: "agency_role",
    });
    expect(
      normalizeRelationPayload({
        relation_kind: "has_treatment",
        relation_family: "treatment_scope",
      }),
    ).toEqual({
      relation_kind: "has_treatment",
      relation_family: "treatment_context",
    });
    expect(
      normalizeRelationPayload({
        relation_kind: "parent_subsidiary",
        relation_family: "other",
      }),
    ).toEqual({
      relation_kind: "parent_subsidiary",
      relation_family: "organization_hierarchy",
    });
    expect(
      normalizeRelationPayload({
        relation_kind: "funded_by",
        relation_family: "other",
      }),
    ).toEqual({
      relation_kind: "funded_by",
        relation_family: "funding_award",
      });
    expect(
      normalizeRelationPayload({
        relation_kind: "includes_expenses_of",
        relation_family: "other",
      }),
    ).toEqual({
      relation_kind: "includes_expenses_of",
      relation_family: "funding_award",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
        },
        { subject_kind: "event", object_kind: "route" },
      ),
    ).toEqual({
      relation_kind: "affects",
        relation_family: "route_scope",
      });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_grand-central-madison",
          object_id: "entity_annual-report-2021-lirr",
          description: "Grand Central Madison serves LIRR with full GCM schedule increasing overall LIRR service by 41%",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "agency_role",
      subject_id: "project_grand-central-madison",
      object_id: "entity_annual-report-2021-lirr",
      description: "Grand Central Madison serves LIRR with full GCM schedule increasing overall LIRR service by 41%",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "entity_grand-central-madison-127546",
          object_id: "entity_annual-report-2021-lirr",
        },
        { subject_kind: "entity", object_kind: "entity" },
        { raw_text: "LIRR customers continue to take advantage of the GCM service reaching 1,510,784 customers." },
      ).relation_family,
    ).toBe("agency_role");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "entity_grand-central-madison-127546",
          object_id: "entity_meeting-doc-124881-mnr",
          description: "GCM service connects Metro-North Railroad customers.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
          subject_id: "project_mnr-lirr-service-planning",
          object_id: "entity_meeting-doc-124881-mnr",
          description: "MNR and LIRR service planning project affects both railroads",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "replaces",
          relation_family: "other",
        },
        { subject_kind: "route", object_kind: "route" },
      ),
    ).toEqual({
      relation_kind: "replaces",
      relation_family: "route_scope",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "connects_to",
          relation_family: "other",
          description: "Connects to Lexington Avenue Line and Metro-North Railroad at 125 St.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "connects_to",
      relation_family: "dependency_or_reference",
      description: "Connects to Lexington Avenue Line and Metro-North Railroad at 125 St.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "connects_to",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "connects_to",
      relation_family: "other",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to_corridor",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "corridor" },
      ),
    ).toEqual({
      relation_kind: "applies_to_corridor",
      relation_family: "corridor_scope",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to",
          relation_family: "other",
          description: "Graffiti removal on Hudson and Harlem lines",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "applies_to",
      relation_family: "location_scope",
      description: "Graffiti removal on Hudson and Harlem lines",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to",
          relation_family: "other",
          description: "Grade crossing safety inspections throughout LIRR and MNR territories",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "applies_to",
      relation_family: "location_scope",
      description: "Grade crossing safety inspections throughout LIRR and MNR territories",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to",
          relation_family: "other",
          description: "ACE program expanded to M2, M4, M42, M100, and Bx5 routes",
          routes: ["M2", "M4", "M42", "M100", "Bx5"],
        },
        { subject_kind: "entity", object_kind: "project" },
      ),
    ).toEqual({
      relation_kind: "applies_to",
      relation_family: "route_scope",
      description: "ACE program expanded to M2, M4, M42, M100, and Bx5 routes",
      routes: ["M2", "M4", "M42", "M100", "Bx5"],
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to",
          relation_family: "other",
          description: "ACE program expanded to five new bus routes",
          routes_affected: ["M2", "M4", "M42", "M100", "Bx5"],
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "applies_to",
      relation_family: "route_scope",
      description: "ACE program expanded to five new bus routes",
      routes_affected: ["M2", "M4", "M42", "M100", "Bx5"],
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to",
          relation_family: "other",
          description: "ACE program expanded to M2, M4, M42, M100, and Bx5 routes",
        },
        { subject_kind: "entity", object_kind: "project" },
      ),
    ).toEqual({
      relation_kind: "applies_to",
      relation_family: "other",
      description: "ACE program expanded to M2, M4, M42, M100, and Bx5 routes",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
        relation_kind: "applies_to",
        relation_family: "other",
      });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to",
          relation_family: "other",
          description: "2023 PTASP DOB applies to Department of Buses.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "applies_to",
      relation_family: "governance_legal",
      description: "2023 PTASP DOB applies to Department of Buses.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to",
          relation_family: "other",
          subject_id: "project_meeting-doc-133286-ptasp-dob-2023",
          object_id: "entity_department-of-buses",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "applies_to",
      relation_family: "governance_legal",
      subject_id: "project_meeting-doc-133286-ptasp-dob-2023",
      object_id: "entity_department-of-buses",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to",
          relation_family: "other",
          description: "Project applies to the operating agency.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "applies_to",
      relation_family: "other",
      description: "Project applies to the operating agency.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "eligible_for",
          relation_family: "other",
          subject_id: "entity_meeting-doc-135736-fair-fares",
          object_id: "entity_transit-adjudication-bureau",
          description: "Individuals in Tier 2 and 3 who are eligible for Fair Fares NYC but not enrolled can get fine waived by enrolling between violation issuance date and hearing date",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "eligible_for",
      relation_family: "governance_legal",
      subject_id: "entity_meeting-doc-135736-fair-fares",
      object_id: "entity_transit-adjudication-bureau",
      description: "Individuals in Tier 2 and 3 who are eligible for Fair Fares NYC but not enrolled can get fine waived by enrolling between violation issuance date and hearing date",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "eligible_for",
          relation_family: "other",
          subject_id: "entity_meeting-doc-135736-fair-fares",
          object_id: "entity_transit-adjudication-bureau",
          description: "Riders are eligible for Fair Fares NYC discounts.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "eligible_for",
          relation_family: "other",
          subject_id: "entity_meeting-doc-135736-fair-fares",
          object_id: "entity_mta-nyct",
          description: "Individuals eligible for Fair Fares NYC can get fine waived by enrolling before a hearing.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_associated_entity",
          relation_family: "other",
          description: "Lease with Gail Lloyd Enterprises for swing space at 168-25 Jamaica Avenue.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_associated_entity",
      relation_family: "funding_award",
      description: "Lease with Gail Lloyd Enterprises for swing space at 168-25 Jamaica Avenue.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_associated_entity",
          relation_family: "other",
          description: "Contract extension, tenant management and accounting services to the MTA.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_associated_entity",
      relation_family: "funding_award",
      description: "Contract extension, tenant management and accounting services to the MTA.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_associated_entity",
          relation_family: "other",
          description: "Penn Station Access Project involves MTA Metro-North Railroad",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_associated_entity",
      relation_family: "program_project_scope",
      description: "Penn Station Access Project involves MTA Metro-North Railroad",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_associated_entity",
          relation_family: "other",
          description: "NYCTA Pharmacy Benefits Manager",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_associated_entity",
      relation_family: "funding_award",
      description: "NYCTA Pharmacy Benefits Manager",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_associated_entity",
          relation_family: "other",
          description: "Administrative & Record keeping Services for MTA FSA benefits",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_associated_entity",
      relation_family: "funding_award",
      description: "Administrative & Record keeping Services for MTA FSA benefits",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_associated_entity",
          relation_family: "other",
          description: "Penn Station Access Project involves MTA Metro-North Railroad",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_associated_entity",
      relation_family: "program_project_scope",
      description: "Penn Station Access Project involves MTA Metro-North Railroad",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "Lease renewal for LIRR Office of Health Services at 300 Old Country Road.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "funding_award",
      description: "Lease renewal for LIRR Office of Health Services at 300 Old Country Road.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "Grand Central Terminal serves Metro-North Railroad.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
        description: "Grand Central Terminal serves Metro-North Railroad.",
      });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "entity_grand-central-terminal",
          object_id: "entity_metro-north-railroad",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ).relation_family,
    ).toBe("location_scope");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "entity_168th-interim-terminal",
          object_id: "entity_168th-interim-terminal",
          description: "168th St Interim Terminal serves 10 MTA bus routes and 5 NICE bus routes.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          object_id: "entity_meeting-doc-189861-elmont-ubs-arena",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "location_scope",
      object_id: "entity_meeting-doc-189861-elmont-ubs-arena",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "entity_168th-interim-terminal",
          object_id: "entity_168th-interim-terminal",
          description: "168th St Interim Terminal serves 10 MTA bus routes and 5 NICE bus routes.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
      subject_id: "entity_168th-interim-terminal",
      object_id: "entity_168th-interim-terminal",
      description: "168th St Interim Terminal serves 10 MTA bus routes and 5 NICE bus routes.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "entity_meeting-doc-121701-customer-services",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "agency_role",
      subject_id: "entity_meeting-doc-121701-customer-services",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "Keep customers informed about real time and planned service changes for commuter rail systems",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "agency_role",
      description: "Keep customers informed about real time and planned service changes for commuter rail systems",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "entity_grand-central-terminal",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
        subject_id: "entity_grand-central-terminal",
      });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "DIRAD Technologies expanding Contact Center as a Service to NYCT's Paratransit Dept.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "funding_award",
      description: "DIRAD Technologies expanding Contact Center as a Service to NYCT's Paratransit Dept.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "CVS Health provides pharmacy benefit management services for NYC Transit.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "funding_award",
      description: "CVS Health provides pharmacy benefit management services for NYC Transit.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "The terminal serves routes and riders.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
      description: "The terminal serves routes and riders.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "The MTA Capital Construction Company (MTACC) undertakes capital projects on behalf of Metro-North.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "agency_role",
      description: "The MTA Capital Construction Company (MTACC) undertakes capital projects on behalf of Metro-North.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "The entity acts on behalf of Metro-North.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
      description: "The entity acts on behalf of Metro-North.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "The entity undertakes capital projects across the network.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
      description: "The entity undertakes capital projects across the network.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "Grand Central Terminal serves Metro-North Railroad.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
      description: "Grand Central Terminal serves Metro-North Railroad.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "Contract provides for upgrade of NYC Transit fare payment system.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "funding_award",
      description: "Contract provides for upgrade of NYC Transit fare payment system.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "Scheidt & Bachmann ticket selling system maintenance services Metro-North Railroad and Long Island Rail Road.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "funding_award",
      description: "Scheidt & Bachmann ticket selling system maintenance services Metro-North Railroad and Long Island Rail Road.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "Clifton Shops serves as headquarters for SIR division of NYC Transit.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "location_scope",
      description: "Clifton Shops serves as headquarters for SIR division of NYC Transit.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "The program serves NYC Transit customers.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
      description: "The program serves NYC Transit customers.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_rr-nfps-meeting-doc-170976",
          object_id: "entity_mta-nyct",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "Railroad New Fare Payment System ... replacement ... at both the Long Island Rail Road (LIRR) and Metro-North Railroad (MNR)" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "agency_role",
      subject_id: "project_rr-nfps-meeting-doc-170976",
      object_id: "entity_mta-nyct",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_rr-nfps-meeting-doc-170976",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "New fare payment system serving customers." },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "Parking facility for Upper Harlem Metro-North customers near Croton Falls station.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "location_scope",
      description: "Parking facility for Upper Harlem Metro-North customers near Croton Falls station.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "Parking program for Metro-North customers.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
      description: "Parking program for Metro-North customers.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "The ITSP system is being procured for use by MTA Bus Company.",
        },
        { subject_kind: "treatment_component", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "treatment_context",
      description: "The ITSP system is being procured for use by MTA Bus Company.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "The ITSP system is being procured for use by MTA Bus Company.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
      description: "The ITSP system is being procured for use by MTA Bus Company.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          description: "NYCT Medical Benefits Program provides coverage for NYC Transit employees.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
      description: "NYCT Medical Benefits Program provides coverage for NYC Transit employees.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "operates_at",
          relation_family: "other",
          description: "LIRR performs daily weekday ticket checks at Penn Station",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "operates_at",
      relation_family: "location_scope",
      description: "LIRR performs daily weekday ticket checks at Penn Station",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "operates_at",
          relation_family: "other",
          description: "LIRR performs daily weekday ticket checks",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "operates_at",
      relation_family: "other",
      description: "LIRR performs daily weekday ticket checks",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "includes",
          relation_family: "other",
        },
        { subject_kind: "source", object_kind: "metric_claim" },
      ),
    ).toEqual({
      relation_kind: "includes",
      relation_family: "metric_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "includes",
          relation_family: "other",
          description: "Operating ratios include expenses associated with the Grand Central Madison Operating Company.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "includes",
      relation_family: "funding_award",
      description: "Operating ratios include expenses associated with the Grand Central Madison Operating Company.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "includes",
          relation_family: "other",
          description: "The program includes service planning context.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "includes",
      relation_family: "other",
      description: "The program includes service planning context.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "connects_to",
          relation_family: "other",
        },
        { subject_kind: "route", object_kind: "claim" },
      ),
    ).toEqual({
      relation_kind: "connects_to",
      relation_family: "claim_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "provides",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "claim" },
      ),
    ).toEqual({
      relation_kind: "provides",
      relation_family: "claim_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_location",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "claim" },
      ),
    ).toEqual({
      relation_kind: "has_location",
      relation_family: "claim_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
        },
        { subject_kind: "claim", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "affects",
      relation_family: "claim_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "affects",
      relation_family: "other",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
          description: "The South 12th Street grade crossing crosses LIRR tracks.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "affects",
      relation_family: "location_scope",
      description: "The South 12th Street grade crossing crosses LIRR tracks.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "Webster Avenue Bridge spans the Long Island Rail Road Port Washington Branch in Manhasset, NY" },
      ),
    ).toEqual({
      relation_kind: "affects",
      relation_family: "location_scope",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_affected_entity",
          relation_family: "other",
          description: "MNR's Harlem and New Haven lines, trackage, equipment, and 24/7 access are at the MTA Property adjacent to the Project.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_affected_entity",
      relation_family: "location_scope",
      description: "MNR's Harlem and New Haven lines, trackage, equipment, and 24/7 access are at the MTA Property adjacent to the Project.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
          description: "MNR and LIRR escalator maintenance RFP project affects both railroads.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "affects",
      relation_family: "other",
      description: "MNR and LIRR escalator maintenance RFP project affects both railroads.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
          subject_id: "project_omny",
          object_id: "entity_annual-report-2021-lirr",
          description: "OMNY CVM deployment and enhancements for Metro-North and LIRR.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "affects",
      relation_family: "agency_role",
      subject_id: "project_omny",
      object_id: "entity_annual-report-2021-lirr",
      description: "OMNY CVM deployment and enhancements for Metro-North and LIRR.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
          subject_id: "project_omny",
          object_id: "entity_meeting-doc-124881-mnr",
          description: "OMNY deployment discussion for Metro-North Railroad.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "ADA improvements at Broadway Junction Station in the Borough of Brooklyn - NYCT station" },
      ),
    ).toEqual({
      relation_kind: "affects",
      relation_family: "location_scope",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "Replacement of escalators at six NYCT stations" },
      ),
    ).toEqual({
      relation_kind: "affects",
      relation_family: "location_scope",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "Station planning and general program coordination" },
      ),
    ).toEqual({
      relation_kind: "affects",
      relation_family: "other",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "connects_to",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "The project will also provide a connection to the Lexington Avenue Line (4,5,6) and Metro-North Railroad at 125 St." },
      ),
    ).toEqual({
      relation_kind: "connects_to",
      relation_family: "dependency_or_reference",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "connects_to",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "connects_to",
      relation_family: "other",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_related_project",
          relation_family: "other",
        },
        { subject_kind: "claim", object_kind: "project" },
      ),
    ).toEqual({
      relation_kind: "has_related_project",
      relation_family: "program_project_scope",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_related_project",
          relation_family: "other",
          description: "PSA requires permanent subsurface easements from Consolidated Edison.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_related_project",
      relation_family: "funding_award",
      description: "PSA requires permanent subsurface easements from Consolidated Edison.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_related_project",
          relation_family: "other",
          description: "Tibbets Brook Daylighting Project is implemented by NYC DEP using MNR property.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_related_project",
      relation_family: "agency_role",
      description: "Tibbets Brook Daylighting Project is implemented by NYC DEP using MNR property.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_related_project",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_related_project",
      relation_family: "other",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_description",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "corridor" },
      ),
    ).toEqual({
      relation_kind: "has_description",
      relation_family: "corridor_scope",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_description",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "claim" },
      ),
    ).toEqual({
      relation_kind: "has_description",
      relation_family: "other",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "included_in",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "included_in",
      relation_family: "dependency_or_reference",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "included_in",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "source" },
      ),
    ).toEqual({
      relation_kind: "included_in",
      relation_family: "publication_role",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_entity",
          relation_family: "other",
          description: "BDG Gotham Plaza, LLC is the vendor/landlord for the SAS Phase II field office lease letter agreement.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_entity",
      relation_family: "funding_award",
      description: "BDG Gotham Plaza, LLC is the vendor/landlord for the SAS Phase II field office lease letter agreement.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_entity",
          relation_family: "other",
          description: "Project involves an agency partner for project coordination.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_entity",
      relation_family: "other",
      description: "Project involves an agency partner for project coordination.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "uses",
          relation_family: "other",
          object_id: "entity_ny-state-open-data-portal",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "uses",
      relation_family: "data_reporting",
      object_id: "entity_ny-state-open-data-portal",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "uses",
          relation_family: "other",
          object_id: "entity_ny-open-data-portal",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "uses",
      relation_family: "data_reporting",
      object_id: "entity_ny-open-data-portal",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "uses",
          relation_family: "other",
          object_id: "entity_justiceone",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "uses",
      relation_family: "dependency_or_reference",
      object_id: "entity_justiceone",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "uses",
          relation_family: "other",
          description: "License agreement for ingress/egress points through MNR property.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "uses",
      relation_family: "funding_award",
      description: "License agreement for ingress/egress points through MNR property.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "uses",
          relation_family: "other",
          description: "Eagle Team uses an e-Citation system.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "uses",
      relation_family: "other",
      description: "Eagle Team uses an e-Citation system.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "presented",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "metric_claim" },
      ),
    ).toEqual({
      relation_kind: "presented",
      relation_family: "metric_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "proposes",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "metric_claim" },
      ),
    ).toEqual({
      relation_kind: "proposes",
      relation_family: "metric_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "performs",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "claim" },
      ),
    ).toEqual({
      relation_kind: "performs",
      relation_family: "claim_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "presented",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "event" },
      ),
    ).toEqual({
      relation_kind: "presented",
      relation_family: "timeline_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "prepared",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "source" },
      ),
    ).toEqual({
      relation_kind: "prepared",
      relation_family: "publication_role",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "prepared",
          relation_family: "other",
          description: "MTA Corporate Compliance prepared the 2024 Personal Property Disposition Guidelines.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "prepared",
      relation_family: "publication_role",
      description: "MTA Corporate Compliance prepared the 2024 Personal Property Disposition Guidelines.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "prepared",
          relation_family: "other",
          description: "Crews prepared the station work area.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "prepared",
      relation_family: "other",
      description: "Crews prepared the station work area.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to",
          relation_family: "other",
        },
        { subject_kind: "source", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "applies_to",
      relation_family: "publication_role",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "applies_to",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "applies_to",
      relation_family: "other",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "implemented_at",
          relation_family: "other",
          description: "P3 ADA improvements project for selected NYCT subway stations.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "implemented_at",
      relation_family: "location_scope",
      description: "P3 ADA improvements project for selected NYCT subway stations.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "implemented_at",
          relation_family: "other",
          description: "Contract implemented by NYCT.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "implemented_at",
      relation_family: "other",
      description: "Contract implemented by NYCT.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "impacts",
          relation_family: "other",
        },
        { subject_kind: "event", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "impacts",
      relation_family: "timeline_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_response_to",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "event" },
      ),
    ).toEqual({
      relation_kind: "has_response_to",
      relation_family: "timeline_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "accommodates",
          relation_family: "other",
        },
        { subject_kind: "event", object_kind: "project" },
      ),
    ).toEqual({
      relation_kind: "accommodates",
      relation_family: "timeline_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "contains",
          relation_family: "other",
        },
        { subject_kind: "source", object_kind: "event" },
      ),
    ).toEqual({
      relation_kind: "contains",
      relation_family: "publication_role",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "receives_report",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "source" },
      ),
    ).toEqual({
      relation_kind: "receives_report",
      relation_family: "publication_role",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "recommends",
          relation_family: "other",
        },
        { subject_kind: "source", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "recommends",
      relation_family: "publication_role",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "manages_response",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "event" },
      ),
    ).toEqual({
      relation_kind: "manages_response",
      relation_family: "timeline_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "mentions",
          relation_family: "other",
        },
        { subject_kind: "event", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "mentions",
      relation_family: "timeline_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "replaces",
          relation_family: "other",
        },
        { subject_kind: "source", object_kind: "event" },
      ),
    ).toEqual({
      relation_kind: "replaces",
      relation_family: "dependency_or_reference",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "connects_to",
          relation_family: "other",
        },
        { subject_kind: "event", object_kind: "route" },
      ),
    ).toEqual({
      relation_kind: "connects_to",
      relation_family: "route_scope",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "connects_to",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "connects_to",
      relation_family: "other",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "uses",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "treatment_component" },
      ),
    ).toEqual({
      relation_kind: "uses",
      relation_family: "treatment_context",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "uses",
          relation_family: "other",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "uses",
      relation_family: "other",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "uses",
          relation_family: "other",
          object_id: "entity_justiceone",
          description: "MTA EAGLE Team uses JusticeONE e-Citation System.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "uses",
      relation_family: "dependency_or_reference",
      object_id: "entity_justiceone",
      description: "MTA EAGLE Team uses JusticeONE e-Citation System.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "uses",
          relation_family: "other",
          object_local_observation_id: "entity_justiceone_meeting_doc_205666",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "uses",
      relation_family: "dependency_or_reference",
      object_local_observation_id: "entity_justiceone_meeting_doc_205666",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "uses",
          relation_family: "other",
          description: "Agency uses a facility.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "uses",
      relation_family: "other",
      description: "Agency uses a facility.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "other",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_emergency-elevator-2way-comms-system",
          object_id: "entity_mta-nyct",
          description: "EE2CS serves NYCT",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "serves",
      relation_family: "agency_role",
      subject_id: "project_emergency-elevator-2way-comms-system",
      object_id: "entity_mta-nyct",
      description: "EE2CS serves NYCT",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_local_observation_id: "project_emergency_elevator_2way_comms_system",
          object_id: "entity_mta-nyct",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("agency_role");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_meeting-doc-157771-ebcs-elevator-comms",
          object_id: "entity_mta-nyct",
          description: "Emergency Booth Communications System serves New York City Transit",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("agency_role");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "entity_department-of-paratransit",
          object_id: "entity_meeting-doc-154986-aar",
        },
        { subject_kind: "entity", object_kind: "entity" },
        { raw_text: "AVLM and IVR systems for Paratransit's Access-A-Ride (AAR) operations" },
      ).relation_family,
    ).toBe("agency_role");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "entity_department-of-paratransit",
          object_id: "entity_meeting-doc-154986-aar",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_annual-2021-penn-station-access",
          object_id: "entity_meeting-doc-124881-mnr",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "Penn Station Access will provide Metro-North Railroad New Haven Line customers with service into and out of Penn Station." },
      ).relation_family,
    ).toBe("agency_role");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_annual-2021-penn-station-access",
          object_id: "entity_meeting-doc-124881-mnr",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("agency_role");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_grand-central-madison",
          object_id: "entity_meeting-doc-124881-mnr",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "The Penn Station Access project faces delays and potential cost overruns." },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_grand-central-madison",
          object_id: "entity_annual-report-2021-lirr",
          description: "Grand Central Madison serves LIRR with full GCM schedule increasing overall LIRR service by 41%",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("agency_role");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_nyct-medical-benefits-program-meeting-doc-160241",
          object_id: "entity_mta-nyct",
          description: "NYCT Medical Benefits Program provides coverage for NYC Transit employees",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("agency_role");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_nyct-medical-benefits-program-meeting-doc-160241",
          object_id: "entity_mta-nyct",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "provide medical health benefits programs for approximately 150,000 active and retired employees of NYC Transit" },
      ).relation_family,
    ).toBe("agency_role");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_nyct-medical-benefits-program-meeting-doc-160241",
          object_id: "entity_mta-nyct",
          description: "NYCT Medical Benefits Program update.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_omny",
          object_id: "entity_mta-nyct",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "The MTA is upgrading to a New Fare Payment System (NFPS) for New York City Transit (NYCT) through OMNY" },
      ).relation_family,
    ).toBe("agency_role");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_omny",
          object_id: "entity_mta-nyct",
        },
        { subject_kind: "project", object_kind: "entity" },
        { raw_text: "OMNY deployment and enhancements for Metro-North and LIRR" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "project_rr-nfps-meeting-doc-170976",
          object_id: "entity_mta-nyct",
          description: "Railroad New Fare Payment System serves LIRR and MNR",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "affects",
      relation_family: "other",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
          subject_id: "project_mnr-lirr-escalator-maintenance",
          object_id: "entity_meeting-doc-124881-mnr",
          description: "MNR and LIRR escalator maintenance RFP project affects both railroads",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("location_scope");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
          description: "Escalator maintenance RFP project affects both railroads",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "affects",
          relation_family: "other",
          description: "MNR and LIRR service project affects both railroads",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "improves",
          relation_family: "other",
          subject_id: "project_f-m-swap-2025",
          object_id: "project_f-m-swap-2025",
          description: "F/M swap increases subway reliability, reduces delays, shortens travel times",
        },
        { subject_kind: "project", object_kind: "project" },
      ),
    ).toEqual({
      relation_kind: "improves",
      relation_family: "metric_context",
      subject_id: "project_f-m-swap-2025",
      object_id: "project_f-m-swap-2025",
      description: "F/M swap increases subway reliability, reduces delays, shortens travel times",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "improves",
          relation_family: "other",
          description: "Project improves station access.",
        },
        { subject_kind: "project", object_kind: "project" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "improves",
          relation_family: "other",
          description: "Project reduces delays.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_associated_entity",
          relation_family: "other",
          description: "Penn Station Access Project involves MTA Metro-North Railroad.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_associated_entity",
      relation_family: "program_project_scope",
      description: "Penn Station Access Project involves MTA Metro-North Railroad.",
    });
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "has_associated_entity",
          relation_family: "other",
          description: "Agency has associated entity context.",
        },
        { subject_kind: "project", object_kind: "entity" },
      ),
    ).toEqual({
      relation_kind: "has_associated_entity",
      relation_family: "other",
      description: "Agency has associated entity context.",
    });
    expect(
      normalizeRelationPayload({
        relation_kind: "parent_organization",
        relation_family: "agency_role",
      }),
    ).toEqual({
      relation_kind: "parent_organization",
      relation_family: "agency_role",
    });
  });

  it("classifies entity serves-route-list descriptions without broad serves matching", () => {
    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "entity_168th-interim-terminal",
          object_id: "entity_168th-interim-terminal",
          description: "168th St Interim Terminal serves 10 MTA bus routes and 5 NICE bus routes, nearly 10,000 daily riders",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ).relation_family,
    ).toBe("route_scope");

    expect(
      normalizeRelationPayload(
        {
          relation_kind: "serves",
          relation_family: "other",
          subject_id: "entity_terminal",
          object_id: "entity_terminal",
          description: "Terminal serves as a public space for customers.",
        },
        { subject_kind: "entity", object_kind: "entity" },
      ).relation_family,
    ).toBe("other");
  });

  it("finds existing relation candidates with normalized relation kind aliases", () => {
    const records = [
      record("relation_project-route", "relation", {
        relation_kind: "has_corridor",
        subject_id: "project_m86-sbs",
        object_id: "corridor_86th-st",
        subject_local_observation_id: "project_m86_sbs",
        object_local_observation_id: "corridor_86th_st",
      }),
    ];

    const result = findRelationCandidates(records, [], {
      relation_kind: "uses_corridor",
      subject_id: "project_m86-sbs",
      object_id: "corridor_86th-st",
    });

    expect(result.existing_relations).toHaveLength(1);
    expect(result.existing_relations[0]?.record_id).toBe("relation_project-route");
    expect(result.existing_relations[0]?.relation_kind).toBe("uses_corridor");
    expect(result.existing_relations[0]?.match_reasons).toContain("same relation_kind");
  });

  it("finds incoming and outgoing relations for a canonical record id", () => {
    const records = [
      record("relation_project-route", "relation", {
        relation_kind: "serves_route",
        subject_id: "project_m86-sbs",
        object_id: "route_m86-sbs",
      }),
      record("relation_project-event", "relation", {
        relation_kind: "has_timeline_event",
        subject_id: "project_m86-sbs",
        object_id: "event_launch",
      }),
    ];

    const result = findRelationCandidates(records, [], { record_id: "project_m86-sbs" });

    expect(result.existing_relations.map((candidate) => candidate.record_id).sort()).toEqual([
      "relation_project-event",
      "relation_project-route",
    ]);
  });

  it("suggests same-source project-route candidates that are not already connected", () => {
    const entries = [
      entry("project", "project_m86_sbs", { project_name: "M86 SBS" }, "M86 SBS"),
      entry("route", "route_m86_sbs", { route_id: "M86 SBS" }, "M86 SBS Route"),
    ];

    const candidates = possibleRelationCandidatesForSource(entries, sourceId, "project_m86_sbs", 5);

    expect(candidates).toEqual([
      expect.objectContaining({
        relation_kind: "serves_route",
        subject_local_observation_id: "project_m86_sbs",
        object_local_observation_id: "route_m86_sbs",
      }),
    ]);
  });

  it("does not suggest a same-source candidate when that relation was already submitted", () => {
    const entries = [
      entry("project", "project_m86_sbs", { project_name: "M86 SBS" }, "M86 SBS"),
      entry("route", "route_m86_sbs", { route_id: "M86 SBS" }, "M86 SBS Route"),
      entry("relation", "relation_project_route", {
        relation_kind: "serves_route",
        subject_local_observation_id: "project_m86_sbs",
        object_local_observation_id: "route_m86_sbs",
      }),
    ];

    expect(possibleRelationCandidatesForSource(entries, sourceId, "project_m86_sbs", 5)).toEqual([]);
  });
});
