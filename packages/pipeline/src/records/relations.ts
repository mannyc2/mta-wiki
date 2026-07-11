import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaObservationKind, MtaSubmissionEntry } from "@mta-wiki/db/types";

export type RelationEndpointShapeIssue = {
  relation_kind: string;
  subject_kind: string;
  object_kind: string;
  expected_subject_kinds: string[];
  expected_object_kinds: string[];
  message: string;
};

export type ExistingRelationCandidate = {
  record_id?: string | undefined;
  local_observation_id?: string | undefined;
  relation_kind: string;
  raw_relation_kind?: string | undefined;
  subject_id?: string | undefined;
  object_id?: string | undefined;
  subject_local_observation_id?: string | undefined;
  object_local_observation_id?: string | undefined;
  source_ids: string[];
  display_name?: string | undefined;
  match_reasons: string[];
};

export type PossibleRelationCandidate = {
  relation_kind: string;
  subject_local_observation_id: string;
  object_local_observation_id: string;
  subject_kind: MtaObservationKind;
  object_kind: MtaObservationKind;
  subject_label: string;
  object_label: string;
  reason: string;
};

export type RelationCandidateQuery = {
  source_id?: string | undefined;
  record_id?: string | undefined;
  subject_local_observation_id?: string | undefined;
  object_local_observation_id?: string | undefined;
  subject_id?: string | undefined;
  object_id?: string | undefined;
  relation_kind?: string | undefined;
  max_results?: number | undefined;
};

export const RELATION_FAMILIES = [
  "route_scope",
  "corridor_scope",
  "location_scope",
  "metric_context",
  "claim_context",
  "treatment_context",
  "timeline_context",
  "agency_role",
  "organization_hierarchy",
  "publication_role",
  "ownership_role",
  "program_project_scope",
  "partnership_engagement",
  "governance_legal",
  "funding_award",
  "data_reporting",
  "dependency_or_reference",
  "other",
] as const;

export type RelationFamily = (typeof RELATION_FAMILIES)[number];

export type RelationEndpointKinds = {
  subject_kind?: MtaObservationKind | undefined;
  object_kind?: MtaObservationKind | undefined;
};

export type RelationNormalizationContext = {
  raw_text?: string | undefined;
};

const RELATION_KIND_ALIASES = new Map<string, string>([
  ["has_treatment_component", "has_treatment"],
  ["has_corridor", "uses_corridor"],
  ["has_metric_claim", "has_metric"],
  ["has_implementing_entity", "implemented_by"],
  ["implementing_agency", "implemented_by"],
  ["has_partner_agency", "has_partner"],
  ["has_partner_entity", "has_partner"],
]);

export const RELATION_FAMILY_BY_KIND = new Map<string, RelationFamily>([
  ["affects_route", "route_scope"],
  ["applies_to_route", "route_scope"],
  ["covers_route", "route_scope"],
  ["changes_route_service", "route_scope"],
  ["creates_route", "route_scope"],
  ["discontinues_route", "route_scope"],
  ["enforces_on_route", "route_scope"],
  ["extends_route", "route_scope"],
  ["has_mitigation", "route_scope"],
  ["has_planned_change", "route_scope"],
  ["has_route_adjustment", "route_scope"],
  ["implements_service", "route_scope"],
  ["includes_service", "program_project_scope"],
  ["includes_route", "route_scope"],
  ["operates_on_route", "route_scope"],
  ["operates_route", "route_scope"],
  ["related_route", "route_scope"],
  ["replaces_route", "route_scope"],
  ["served_by_route", "route_scope"],
  ["serves_route", "route_scope"],
  ["will_serve_route", "route_scope"],

  ["applied_on_corridor", "corridor_scope"],
  ["improves_corridor", "corridor_scope"],
  ["affects_corridor", "corridor_scope"],
  ["examined_corridor", "corridor_scope"],
  ["identifies_corridor", "corridor_scope"],
  ["includes_corridor", "corridor_scope"],
  ["located_on", "corridor_scope"],
  ["located_on_corridor", "corridor_scope"],
  ["operates_on", "corridor_scope"],
  ["operates_on_corridor", "corridor_scope"],
  ["serves_corridor", "corridor_scope"],
  ["studies_corridor", "corridor_scope"],
  ["uses_corridor", "corridor_scope"],

  ["located_in", "location_scope"],
  ["located_at", "location_scope"],
  ["adjacent_to", "location_scope"],
  ["applies_to_facility", "location_scope"],
  ["has_facility", "location_scope"],
  ["near_station", "location_scope"],
  ["proximate_to", "location_scope"],
  ["relocated_from", "location_scope"],
  ["serves_destination", "location_scope"],
  ["serves_facility", "location_scope"],
  ["serves_location", "location_scope"],
  ["transferred_from_to", "location_scope"],
  ["uses_facility", "location_scope"],

  ["exhibits_property", "metric_context"],
  ["assigned_rating", "metric_context"],
  ["assigned_rating_to", "metric_context"],
  ["has_associated_metric", "metric_context"],
  ["has_metric", "metric_context"],
  ["has_position_allocation", "metric_context"],
  ["has_priority", "metric_context"],
  ["metric_of_source", "metric_context"],

  ["describes", "claim_context"],
  ["has_causal_contribution", "claim_context"],
  ["has_claim", "claim_context"],
  ["has_agenda_topic", "claim_context"],
  ["has_gap", "claim_context"],
  ["has_plan_adjustment", "claim_context"],
  ["has_recurring_agenda_item", "claim_context"],
  ["has_board_item", "claim_context"],
  ["has_safety_designation", "claim_context"],
  ["has_source_gap", "claim_context"],
  ["has_status", "claim_context"],
  ["has_subtheme", "claim_context"],
  ["presented_to", "claim_context"],

  ["has_treatment", "treatment_context"],
  ["has_tsp", "treatment_context"],
  ["implements_treatment", "treatment_context"],
  ["proposes_treatment", "treatment_context"],
  ["serves_stop", "treatment_context"],
  ["uses_treatment", "treatment_context"],

  ["discussed_at", "timeline_context"],
  ["agenda_item", "timeline_context"],
  ["approved_at", "timeline_context"],
  ["has_agenda_event", "timeline_context"],
  ["has_agenda_item", "timeline_context"],
  ["has_event", "timeline_context"],
  ["has_minutes", "timeline_context"],
  ["has_minutes_approval", "timeline_context"],
  ["has_minutes_review", "timeline_context"],
  ["has_subsequent_event", "timeline_context"],
  ["has_timeline_event", "timeline_context"],
  ["has_outreach_event", "timeline_context"],
  ["has_planned_event", "timeline_context"],
  ["held_meeting", "timeline_context"],
  ["held_timeline_event", "timeline_context"],
  ["hosted_at", "timeline_context"],
  ["considered_at", "timeline_context"],
  ["holds", "timeline_context"],
  ["holds_meeting", "timeline_context"],
  ["in_development_for", "timeline_context"],
  ["launches", "timeline_context"],
  ["launched_by", "timeline_context"],
  ["plans", "timeline_context"],
  ["precedes_event", "timeline_context"],
  ["presented_at", "timeline_context"],
  ["convened", "timeline_context"],
  ["drives", "timeline_context"],
  ["follows", "timeline_context"],
  ["organizes", "timeline_context"],
  ["organized", "timeline_context"],
  ["organized_meeting", "timeline_context"],
  ["performed", "timeline_context"],
  ["related_event", "timeline_context"],
  ["reported_at", "timeline_context"],
  ["replaced_by", "timeline_context"],
  ["supports_event", "timeline_context"],
  ["subject_of_agenda_item", "timeline_context"],
  ["triggers", "timeline_context"],

  ["developed_by", "agency_role"],
  ["audited_by", "agency_role"],
  ["delivered_presentation", "agency_role"],
  ["enforced_by", "agency_role"],
  ["enforces", "agency_role"],
  ["external_auditor", "agency_role"],
  ["department_head_of", "agency_role"],
  ["employed_by", "agency_role"],
  ["employee_of", "agency_role"],
  ["employs", "agency_role"],
  ["accountable_executive_for", "agency_role"],
  ["accountable_for", "agency_role"],
  ["acting_for", "agency_role"],
  ["acted_on_behalf_of", "agency_role"],
  ["agency_for", "agency_role"],
  ["agency_of", "agency_role"],
  ["announced_by", "agency_role"],
  ["appointed_as", "agency_role"],
  ["audits", "agency_role"],
  ["chair_of", "agency_role"],
  ["chaired_by", "agency_role"],
  ["chief_safety_officer_for", "agency_role"],
  ["commissioned_by", "agency_role"],
  ["conducted_investigation_on", "agency_role"],
  ["conducted_by", "agency_role"],
  ["constructed_by", "agency_role"],
  ["coordinates", "agency_role"],
  ["covers_agency", "agency_role"],
  ["developed", "agency_role"],
  ["developed_scenarios_for", "agency_role"],
  ["developer", "agency_role"],
  ["delegates_to", "agency_role"],
  ["delivered_by", "agency_role"],
  ["evaluated_by", "agency_role"],
  ["enforces_for", "agency_role"],
  ["financial_liaison_for", "agency_role"],
  ["former_leader_of", "agency_role"],
  ["formerly_employed_by", "agency_role"],
  ["general_counsel_of", "agency_role"],
  ["generated_by", "agency_role"],
  ["has_contact", "agency_role"],
  ["has_consultant", "agency_role"],
  ["has_employee", "agency_role"],
  ["has_implementer", "agency_role"],
  ["has_incumbent_provider", "agency_role"],
  ["has_independent_engineering_consultant", "agency_role"],
  ["has_leader", "agency_role"],
  ["has_lead_agency", "agency_role"],
  ["has_lead_entity", "agency_role"],
  ["has_liaison", "agency_role"],
  ["has_officer", "agency_role"],
  ["has_oversight", "agency_role"],
  ["has_personnel", "agency_role"],
  ["has_presence_in", "agency_role"],
  ["has_procurement_representative", "agency_role"],
  ["has_responsible_department", "agency_role"],
  ["has_role", "agency_role"],
  ["has_transaction_manager", "agency_role"],
  ["assigned_to", "agency_role"],
  ["assigned_to_route", "agency_role"],
  ["implemented_by", "agency_role"],
  ["implements", "agency_role"],
  ["implements_for", "agency_role"],
  ["independent_engineering_consultant_for", "agency_role"],
  ["interim_president_of", "agency_role"],
  ["is_department_head_of", "agency_role"],
  ["is_employee_of", "agency_role"],
  ["is_executive_vice_president_of", "agency_role"],
  ["is_financial_liaison_for", "agency_role"],
  ["is_interim_president_of", "agency_role"],
  ["is_liaison_for", "agency_role"],
  ["is_leader_of", "agency_role"],
  ["is_president_of", "agency_role"],
  ["is_principal_of", "agency_role"],
  ["holds_position", "agency_role"],
  ["lead_agency", "agency_role"],
  ["lead_by", "agency_role"],
  ["led_by", "agency_role"],
  ["leads", "agency_role"],
  ["leads_entity", "agency_role"],
  ["leads_organization", "agency_role"],
  ["manages_project", "agency_role"],
  ["managed_by_department", "agency_role"],
  ["managed_by", "agency_role"],
  ["manages", "agency_role"],
  ["manages_portfolios_for", "agency_role"],
  ["manages_program", "agency_role"],
  ["manages_projects_for", "agency_role"],
  ["maintains_equipment_at", "agency_role"],
  ["on_behalf_of", "agency_role"],
  ["operated_by", "agency_role"],
  ["operated_on", "agency_role"],
  ["operates_for", "agency_role"],
  ["operator", "agency_role"],
  ["operates", "agency_role"],
  ["operates_service", "agency_role"],
  ["oversees", "agency_role"],
  ["overseen_by", "agency_role"],
  ["oversees_project", "agency_role"],
  ["planned_by", "agency_role"],
  ["presented_by", "agency_role"],
  ["presents", "agency_role"],
  ["presents_to", "agency_role"],
  ["president_of", "agency_role"],
  ["primary_policing_agency_for", "agency_role"],
  ["project_manager", "agency_role"],
  ["project_manager_of", "agency_role"],
  ["procured_for", "agency_role"],
  ["proposed_by", "agency_role"],
  ["proposed_as", "agency_role"],
  ["proposer_for", "agency_role"],
  ["selected_by", "agency_role"],
  ["reported_by", "agency_role"],
  ["reports_on", "agency_role"],
  ["reports_to", "agency_role"],
  ["receives_reports_from", "agency_role"],
  ["requested_by", "agency_role"],
  ["requested_by_department", "agency_role"],
  ["requesting_department", "agency_role"],
  ["responsible_for", "agency_role"],
  ["responsible_for_event", "agency_role"],
  ["supported_by", "agency_role"],
  ["serves_agency", "agency_role"],
  ["serves_entity", "agency_role"],
  ["serves_as", "agency_role"],
  ["senior_vice_president_of", "agency_role"],
  ["sponsors", "agency_role"],
  ["submitted_by", "agency_role"],
  ["supervises", "agency_role"],
  ["transaction_manager_for", "agency_role"],
  ["under_direction_of", "agency_role"],
  ["works_for", "agency_role"],
  ["works_at", "agency_role"],
  ["vice_president_of", "agency_role"],
  ["acts_as", "agency_role"],
  ["acts_on_behalf_of", "agency_role"],
  ["chairs", "agency_role"],
  ["has_monitor", "agency_role"],
  ["has_project_manager", "agency_role"],
  ["has_proposer", "agency_role"],
  ["has_requesting_department", "agency_role"],
  ["has_responsibility", "agency_role"],
  ["is_officer_of", "agency_role"],
  ["monitors", "agency_role"],
  ["project_manager_for", "agency_role"],
  ["provides_audit_services_to", "agency_role"],
  ["provides_security_for", "agency_role"],
  ["provides_service", "agency_role"],
  ["provides_service_for", "agency_role"],
  ["provides_service_to", "agency_role"],
  ["provides_services_for", "agency_role"],
  ["provides_services_to", "agency_role"],
  ["provides_support_to", "agency_role"],
  ["performs_audit", "agency_role"],
  ["performed_services_for", "agency_role"],
  ["performs_work_for", "agency_role"],
  ["provided_valuation_for", "agency_role"],
  ["receives_services_from", "agency_role"],
  ["issues_novis", "agency_role"],
  ["represents", "agency_role"],
  ["represents_employees_at", "agency_role"],
  ["reviews_project", "agency_role"],
  ["works_on", "agency_role"],

  ["part_of", "organization_hierarchy"],
  ["affiliated_with", "organization_hierarchy"],
  ["belongs_to", "organization_hierarchy"],
  ["child_of", "organization_hierarchy"],
  ["department_head", "organization_hierarchy"],
  ["formed", "organization_hierarchy"],
  ["part_of_agency", "organization_hierarchy"],
  ["has_agency", "organization_hierarchy"],
  ["has_affiliate", "organization_hierarchy"],
  ["has_component", "organization_hierarchy"],
  ["has_department", "organization_hierarchy"],
  ["has_department_head", "organization_hierarchy"],
  ["has_chair", "organization_hierarchy"],
  ["has_division", "organization_hierarchy"],
  ["has_member", "organization_hierarchy"],
  ["has_position", "organization_hierarchy"],
  ["has_president", "organization_hierarchy"],
  ["has_principal", "organization_hierarchy"],
  ["has_subsidiary", "organization_hierarchy"],
  ["has_subunit", "organization_hierarchy"],
  ["aggregates", "organization_hierarchy"],
  ["head_of", "organization_hierarchy"],
  ["headed_by", "organization_hierarchy"],
  ["heads_department", "organization_hierarchy"],
  ["heads", "organization_hierarchy"],
  ["has_role_at", "organization_hierarchy"],
  ["includes_agency", "organization_hierarchy"],
  ["is_agency_for", "organization_hierarchy"],
  ["is_component_unit_of", "organization_hierarchy"],
  ["is_subsidiary_of", "organization_hierarchy"],
  ["member_of", "organization_hierarchy"],
  ["parent_agency", "organization_hierarchy"],
  ["parent_agency_of", "organization_hierarchy"],
  ["parent_entity", "organization_hierarchy"],
  ["parent_of", "organization_hierarchy"],
  ["parent_organization", "organization_hierarchy"],
  ["parent_subsidiary", "organization_hierarchy"],
  ["subsidiary", "organization_hierarchy"],
  ["subsidiary_of", "organization_hierarchy"],

  ["about", "publication_role"],
  ["about_entity", "publication_role"],
  ["author_of", "publication_role"],
  ["authored_by", "publication_role"],
  ["addresses", "publication_role"],
  ["addresses_entity", "publication_role"],
  ["considered_by", "publication_role"],
  ["covers", "publication_role"],
  ["about_subject", "publication_role"],
  ["covers_entity", "publication_role"],
  ["covers_mode", "publication_role"],
  ["covers_system", "publication_role"],
  ["delivered_report", "publication_role"],
  ["described_in", "publication_role"],
  ["description_about", "publication_role"],
  ["describes_entity", "publication_role"],
  ["drafted_by", "publication_role"],
  ["committee_work_plan_of", "publication_role"],
  ["has_author", "publication_role"],
  ["has_publisher", "publication_role"],
  ["has_document", "publication_role"],
  ["has_source", "publication_role"],
  ["has_subject", "publication_role"],
  ["has_work_plan", "publication_role"],
  ["has_workplan", "publication_role"],
  ["includes_section", "publication_role"],
  ["has_section", "publication_role"],
  ["is_about", "publication_role"],
  ["is_subject_of", "publication_role"],
  ["is_work_plan_of", "publication_role"],
  ["presents_report", "publication_role"],
  ["pertains_to", "publication_role"],
  ["prepared_by", "publication_role"],
  ["prepared_for", "publication_role"],
  ["published", "publication_role"],
  ["published_by", "publication_role"],
  ["published_for", "publication_role"],
  ["publisher_of", "publication_role"],
  ["publishes", "publication_role"],
  ["reported_on", "publication_role"],
  ["reported_to", "publication_role"],
  ["report_subject", "publication_role"],
  ["reviewed_by_committee", "publication_role"],
  ["releases", "publication_role"],
  ["reports_metric", "publication_role"],
  ["sourced_from", "publication_role"],
  ["subject_of", "publication_role"],
  ["submits_report_to", "publication_role"],

  ["owned_by", "ownership_role"],
  ["acquired", "ownership_role"],
  ["adjacent_property_owner", "ownership_role"],
  ["has_real_estate_action", "ownership_role"],
  ["owns_project", "ownership_role"],
  ["owns_property", "ownership_role"],
  ["owns", "ownership_role"],

  ["complementary_program", "program_project_scope"],
  ["has_program", "program_project_scope"],
  ["has_project", "program_project_scope"],
  ["has_project_component", "program_project_scope"],
  ["has_project_feature", "program_project_scope"],
  ["has_project_scope", "program_project_scope"],
  ["has_initiative", "program_project_scope"],
  ["has_subproject", "program_project_scope"],
  ["contains_project", "program_project_scope"],
  ["contributes_to", "program_project_scope"],
  ["covers_project", "program_project_scope"],
  ["generated", "program_project_scope"],
  ["implements_project", "program_project_scope"],
  ["implements_on_route", "program_project_scope"],
  ["includes_project", "program_project_scope"],
  ["includes_subproject", "program_project_scope"],
  ["involves_agency", "program_project_scope"],
  ["involves_entity", "program_project_scope"],
  ["joint_program", "program_project_scope"],
  ["operates_program", "program_project_scope"],
  ["part_of_program", "program_project_scope"],
  ["part_of_project", "program_project_scope"],
  ["related_project", "program_project_scope"],
  ["related_to_project", "program_project_scope"],
  ["studied", "program_project_scope"],
  ["supports_project", "program_project_scope"],
  ["supports_program", "program_project_scope"],

  ["attended_by", "partnership_engagement"],
  ["advised", "partnership_engagement"],
  ["advisory_services", "partnership_engagement"],
  ["co_hosted_with", "partnership_engagement"],
  ["co_presented", "partnership_engagement"],
  ["co_presenter", "partnership_engagement"],
  ["collaborates_with", "partnership_engagement"],
  ["collaborated_with", "partnership_engagement"],
  ["community_outreach", "partnership_engagement"],
  ["consulted", "partnership_engagement"],
  ["contributed_to", "partnership_engagement"],
  ["coordinates_with", "partnership_engagement"],
  ["data_collection_partner", "partnership_engagement"],
  ["has_construction_partner", "partnership_engagement"],
  ["has_partner", "partnership_engagement"],
  ["has_participant", "partnership_engagement"],
  ["has_stakeholder", "partnership_engagement"],
  ["assists", "partnership_engagement"],
  ["briefed_to", "partnership_engagement"],
  ["guided_by", "partnership_engagement"],
  ["informed", "partnership_engagement"],
  ["involved_in", "partnership_engagement"],
  ["involves", "partnership_engagement"],
  ["joint_venture_member", "partnership_engagement"],
  ["joint_venture_of", "partnership_engagement"],
  ["joint_project_partner", "partnership_engagement"],
  ["organized_by", "partnership_engagement"],
  ["partner", "partnership_engagement"],
  ["partner_agency", "partnership_engagement"],
  ["partners_with", "partnership_engagement"],
  ["participates_in", "partnership_engagement"],
  ["policing_partner", "partnership_engagement"],
  ["project_partner", "partnership_engagement"],
  ["public_engagement_partner", "partnership_engagement"],
  ["partnered_on", "partnership_engagement"],
  ["partnered_with", "partnership_engagement"],
  ["partner_of", "partnership_engagement"],
  ["provides_consulting", "partnership_engagement"],
  ["provides_guidance", "partnership_engagement"],
  ["provides_information_to", "partnership_engagement"],
  ["provides_input_to", "partnership_engagement"],
  ["public_comment", "partnership_engagement"],
  ["recommended_to", "partnership_engagement"],
  ["requires_coordination_with", "partnership_engagement"],
  ["implements_with", "partnership_engagement"],
  ["operates_with", "partnership_engagement"],
  ["supports_operation", "partnership_engagement"],
  ["works_with", "partnership_engagement"],

  ["adopted_by", "governance_legal"],
  ["approved", "governance_legal"],
  ["approved_by", "governance_legal"],
  ["approves", "governance_legal"],
  ["authorizes", "governance_legal"],
  ["authorized_by", "governance_legal"],
  ["authorized_under", "governance_legal"],
  ["certified_by", "governance_legal"],
  ["certifies", "governance_legal"],
  ["board_approves", "governance_legal"],
  ["designated_as", "governance_legal"],
  ["enacted", "governance_legal"],
  ["enacted_by", "governance_legal"],
  ["adopted", "governance_legal"],
  ["establishes", "governance_legal"],
  ["governs", "governance_legal"],
  ["has_approval_authority", "governance_legal"],
  ["has_approval_body", "governance_legal"],
  ["has_approving_body", "governance_legal"],
  ["has_requirement", "governance_legal"],
  ["has_legal_name", "governance_legal"],
  ["has_update_requirement", "governance_legal"],
  ["mandated_by", "governance_legal"],
  ["mandates", "governance_legal"],
  ["permits", "governance_legal"],
  ["regulated_by", "governance_legal"],
  ["regulates", "governance_legal"],
  ["requests_approval", "governance_legal"],
  ["requests_authorization", "governance_legal"],
  ["requests_authorization_for", "governance_legal"],
  ["required_by", "governance_legal"],
  ["requires_approval", "governance_legal"],
  ["requires_approval_from", "governance_legal"],
  ["reviewed_by", "governance_legal"],
  ["recommended", "governance_legal"],
  ["resolved_in_favor_of", "governance_legal"],
  ["reviews", "governance_legal"],
  ["review_for", "governance_legal"],
  ["seeks_approval_for", "governance_legal"],
  ["seeks_approval_from", "governance_legal"],
  ["seeks_authorization_from", "governance_legal"],
  ["signed_into_law", "governance_legal"],
  ["signed_by", "governance_legal"],
  ["issued", "governance_legal"],
  ["filed_with", "governance_legal"],
  ["issued_by", "governance_legal"],
  ["permittee", "governance_legal"],
  ["permittee_for", "governance_legal"],
  ["ratified", "governance_legal"],
  ["regulatory_authority_over", "governance_legal"],
  ["requests_approval_for", "governance_legal"],
  ["seeks_action_from", "governance_legal"],
  ["seeks_ratification_from", "governance_legal"],
  ["set_requirements", "governance_legal"],
  ["established_goals_for", "governance_legal"],
  ["subject_to_assessment", "governance_legal"],
  ["submits_for_board_approval", "governance_legal"],
  ["submitted_to", "governance_legal"],
  ["submits_to", "governance_legal"],
  ["voted_to_recommend", "governance_legal"],

  ["awarded_by", "funding_award"],
  ["access_agreement", "funding_award"],
  ["agreement_between", "funding_award"],
  ["awarded_contract", "funding_award"],
  ["awarded_contract_for", "funding_award"],
  ["awarded_to", "funding_award"],
  ["awards_contract_to", "funding_award"],
  ["acquires_easement_from", "funding_award"],
  ["contractor", "funding_award"],
  ["contract_award", "funding_award"],
  ["contract_vendor", "funding_award"],
  ["contracted_to", "funding_award"],
  ["contracted_by", "funding_award"],
  ["contracted_vendor", "funding_award"],
  ["contracted_with", "funding_award"],
  ["contracts_with", "funding_award"],
  ["contract_with", "funding_award"],
  ["contractual_relationship", "funding_award"],
  ["billed", "funding_award"],
  ["easement_agreement", "funding_award"],
  ["easement_agreement_with", "funding_award"],
  ["cost_attribution", "funding_award"],
  ["distributes_income_to", "funding_award"],
  ["engaged", "funding_award"],
  ["engaged_by", "funding_award"],
  ["entered_agreement_with", "funding_award"],
  ["enters_agreement_with", "funding_award"],
  ["finances", "funding_award"],
  ["funded_by", "funding_award"],
  ["funder", "funding_award"],
  ["funding_transfer", "funding_award"],
  ["funding_transfer_to", "funding_award"],
  ["funds_transferred_to", "funding_award"],
  ["funds", "funding_award"],
  ["beneficiary_of_agreement", "funding_award"],
  ["granted_by", "funding_award"],
  ["grants_agreement", "funding_award"],
  ["grants_easement_to", "funding_award"],
  ["grantor_grantee", "funding_award"],
  ["has_agreement", "funding_award"],
  ["has_agreement_with", "funding_award"],
  ["has_arrangement_with", "funding_award"],
  ["has_award", "funding_award"],
  ["has_beneficiary", "funding_award"],
  ["has_competing_bidder", "funding_award"],
  ["has_contract", "funding_award"],
  ["has_related_contract", "funding_award"],
  ["has_contract_support", "funding_award"],
  ["has_contract_vendor", "funding_award"],
  ["has_contract_with", "funding_award"],
  ["has_contractor", "funding_award"],
  ["has_counterparty", "funding_award"],
  ["has_funding_partner", "funding_award"],
  ["has_funding_share", "funding_award"],
  ["has_funding_source", "funding_award"],
  ["has_grantor", "funding_award"],
  ["has_financial_action", "funding_award"],
  ["has_new_need", "funding_award"],
  ["has_lessee", "funding_award"],
  ["has_license_agreement", "funding_award"],
  ["has_lease_term", "funding_award"],
  ["has_legal_approval", "governance_legal"],
  ["has_licensee", "funding_award"],
  ["has_lessor", "funding_award"],
  ["has_service_provider", "funding_award"],
  ["has_supplier", "funding_award"],
  ["has_subcontractor", "funding_award"],
  ["has_party", "funding_award"],
  ["has_recipient", "funding_award"],
  ["is_lessee", "funding_award"],
  ["leaser", "funding_award"],
  ["leases", "funding_award"],
  ["leases_from", "funding_award"],
  ["leases_to", "funding_award"],
  ["lessor_lessee", "funding_award"],
  ["lessor_to", "funding_award"],
  ["lessor_of", "funding_award"],
  ["has_vendor", "funding_award"],
  ["engaged_as", "funding_award"],
  ["license_agreement", "funding_award"],
  ["license_agreement_amendment", "funding_award"],
  ["license_agreement_with", "funding_award"],
  ["lead_contractor_for", "funding_award"],
  ["licensee_of", "funding_award"],
  ["licensee_to", "funding_award"],
  ["licenses_from", "funding_award"],
  ["licenses", "funding_award"],
  ["licenses_to", "funding_award"],
  ["includes_costs_of", "funding_award"],
  ["includes_expenses_of", "funding_award"],
  ["joint_procurement", "funding_award"],
  ["has_joint_procurement", "funding_award"],
  ["issued_procurement_for", "funding_award"],
  ["makes_payment_to", "funding_award"],
  ["manages_agreement", "funding_award"],
  ["manages_lease_with", "funding_award"],
  ["pays_assessment_to", "funding_award"],
  ["payment_to", "funding_award"],
  ["permit_agreement", "funding_award"],
  ["pending_funding_from", "funding_award"],
  ["procured_by", "funding_award"],
  ["procures", "funding_award"],
  ["procures_from", "funding_award"],
  ["provides_funding_to", "funding_award"],
  ["provides_funding", "funding_award"],
  ["provides_funding_for", "funding_award"],
  ["provided_funding", "funding_award"],
  ["purchased_by", "funding_award"],
  ["purchaser_of", "funding_award"],
  ["results_in_savings_for", "funding_award"],
  ["manufactured_by", "funding_award"],
  ["reached_agreement_with", "funding_award"],
  ["recipient_of", "funding_award"],
  ["receives_funding_from", "funding_award"],
  ["receives_reimbursement_from", "funding_award"],
  ["received_award", "funding_award"],
  ["receives_revenue_from", "funding_award"],
  ["reimburses", "funding_award"],
  ["reports_agreements_for", "funding_award"],
  ["assessment_payment", "funding_award"],
  ["contract_awarded_to", "funding_award"],
  ["distributes_surplus_to", "funding_award"],
  ["distributes_to", "funding_award"],
  ["supports_contract", "funding_award"],
  ["retains", "funding_award"],
  ["seller", "funding_award"],
  ["seller_to", "funding_award"],
  ["sells_to", "funding_award"],
  ["service_provider", "funding_award"],
  ["subcontracted_by", "funding_award"],
  ["subcontractor_of", "funding_award"],
  ["subcontracts", "funding_award"],
  ["supplies", "funding_award"],
  ["supplied_by", "funding_award"],
  ["transfers_surplus_to", "funding_award"],
  ["transfers_funds_to", "funding_award"],

  ["data_source", "data_reporting"],
  ["includes_data", "data_reporting"],
  ["data_provided_by", "data_reporting"],
  ["data_source_for", "data_reporting"],
  ["has_source_content", "data_reporting"],
  ["monitoring_prepared_by", "data_reporting"],
  ["publishes_data_from", "data_reporting"],
  ["publishes_data_to", "data_reporting"],
  ["source_data_provider", "data_reporting"],
  ["publishes_to", "data_reporting"],
  ["submits_data_to", "data_reporting"],
  ["uses_data_source", "data_reporting"],

  ["builds_on", "dependency_or_reference"],
  ["affected_by", "dependency_or_reference"],
  ["aligned_with", "dependency_or_reference"],
  ["caused", "dependency_or_reference"],
  ["caused_delay", "dependency_or_reference"],
  ["complementary_project", "dependency_or_reference"],
  ["contingent_on", "dependency_or_reference"],
  ["challenges", "dependency_or_reference"],
  ["depends_on_realignment_of", "dependency_or_reference"],
  ["depends_on", "dependency_or_reference"],
  ["delayed_by", "dependency_or_reference"],
  ["due_to", "dependency_or_reference"],
  ["enables", "dependency_or_reference"],
  ["enabled_by", "dependency_or_reference"],
  ["critical_for", "dependency_or_reference"],
  ["evolved_from", "dependency_or_reference"],
  ["informs", "dependency_or_reference"],
  ["is_related_to", "dependency_or_reference"],
  ["has_concern", "dependency_or_reference"],
  ["has_qualification", "dependency_or_reference"],
  ["has_related_work", "dependency_or_reference"],
  ["interoperates_with", "dependency_or_reference"],
  ["maintained_by", "dependency_or_reference"],
  ["precedes", "dependency_or_reference"],
  ["predecessor_of", "dependency_or_reference"],
  ["references", "dependency_or_reference"],
  ["related_entity", "dependency_or_reference"],
  ["related_to", "dependency_or_reference"],
  ["also_known_as", "dependency_or_reference"],
  ["replaced", "dependency_or_reference"],
  ["result_of", "dependency_or_reference"],
  ["succeeded", "dependency_or_reference"],
  ["same_as", "dependency_or_reference"],
  ["source_of", "dependency_or_reference"],
  ["succeeded_by", "dependency_or_reference"],
  ["successor_of", "dependency_or_reference"],
  ["supports", "dependency_or_reference"],
  ["supplements", "dependency_or_reference"],
  ["used_by", "dependency_or_reference"],
  ["uses_infrastructure", "dependency_or_reference"],
  ["uses_infrastructure_of", "dependency_or_reference"],
  ["uses_service", "dependency_or_reference"],
  ["uses_system", "dependency_or_reference"],
  ["will_use", "dependency_or_reference"],
]);

export const RELATION_ENDPOINT_SHAPES: Record<string, { subject: MtaObservationKind[]; object: MtaObservationKind[] }> = {
  serves_route: {
    // W0 ontology decision (data/ontology-decisions/W0-corridor-serves-route-decision.md):
    // admit corridor as a legal subject — a corridor/study-area serving the routes within it is
    // real authored data (the §2.8 "admit corridor→route as a legal serves_route shape" option).
    subject: ["project", "corridor"],
    object: ["route"],
  },
  affects_route: {
    subject: ["project", "event"],
    object: ["route"],
  },
  uses_corridor: {
    subject: ["project"],
    object: ["corridor"],
  },
  serves_corridor: {
    subject: ["route"],
    object: ["corridor"],
  },
  operates_on_corridor: {
    subject: ["route", "entity"],
    object: ["corridor"],
  },
  has_treatment: {
    subject: ["project", "corridor", "route"],
    object: ["treatment_component"],
  },
  has_timeline_event: {
    subject: ["project", "route", "corridor", "entity", "source", "event", "treatment_component"],
    object: ["event"],
  },
  has_metric: {
    subject: ["project", "route", "corridor", "entity", "event", "claim"],
    object: ["metric_claim"],
  },
  has_claim: {
    subject: ["project", "route", "corridor", "entity", "source", "event", "treatment_component"],
    object: ["claim"],
  },
  implemented_by: {
    subject: ["project"],
    object: ["entity"],
  },
  operated_by: {
    subject: ["project", "route", "corridor"],
    object: ["entity"],
  },
  part_of_program: {
    subject: ["project", "route"],
    object: ["project", "entity"],
  },
  part_of_agency: {
    subject: ["entity"],
    object: ["entity"],
  },
  owned_by: {
    subject: ["entity", "project", "corridor"],
    object: ["entity"],
  },
  published_by: {
    subject: ["source", "project", "entity"],
    object: ["entity"],
  },
  related_route: {
    subject: ["route"],
    object: ["route"],
  },
};

const SAME_SOURCE_PAIR_RULES: Array<{
  subject: MtaObservationKind[];
  object: MtaObservationKind[];
  relation_kind: string;
  reason: string;
}> = [
  {
    subject: ["project"],
    object: ["route"],
    relation_kind: "serves_route",
    reason: "same source has a project and route without an existing relation",
  },
  {
    subject: ["project"],
    object: ["corridor"],
    relation_kind: "uses_corridor",
    reason: "same source has a project and corridor without an existing relation",
  },
  {
    subject: ["route"],
    object: ["corridor"],
    relation_kind: "operates_on_corridor",
    reason: "same source has a route and corridor without an existing relation",
  },
  {
    subject: ["project", "corridor"],
    object: ["treatment_component"],
    relation_kind: "has_treatment",
    reason: "same source has a scope record and treatment without an existing relation",
  },
  {
    subject: ["project"],
    object: ["event"],
    relation_kind: "has_timeline_event",
    reason: "same source has a project and event without an existing relation",
  },
];

function stringValue(value: JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function relationKindKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/gu, "_");
}

export function normalizeRelationKind(value: string) {
  const key = relationKindKey(value);
  return RELATION_KIND_ALIASES.get(key) ?? key;
}

export function normalizeRelationFamily(value: string): RelationFamily {
  return RELATION_FAMILY_BY_KIND.get(normalizeRelationKind(value)) ?? "other";
}

function isDataPortalObjectId(value: JsonValue | undefined) {
  const objectId = stringValue(value);
  return Boolean(objectId && (objectId.includes("open-data-portal") || objectId === "entity_metrics-mta-info"));
}

function isLeaseLicenseCounterpartyDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  if (!description) return false;
  if (!/\b(lease|license)\b/u.test(description)) return false;
  return /\b(vendor|landlord|tenant|licensee|counterparty)\b/u.test(description);
}

function isLeaseLicensePropertyUseDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  if (!description) return false;
  if (!/\b(lease|license)\b/u.test(description)) return false;
  return /\bproperty\b/u.test(description);
}

function isLeaseLicenseDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  return Boolean(description && /\b(lease|license)\b/u.test(description));
}

function isContractServicesDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  return Boolean(description && /\b(contract|maintenance services)\b/u.test(description));
}

function isServedLocationEntity(payload: JsonObject) {
  if (payload.subject_id === payload.object_id) return false;
  const objectId = stringValue(payload.object_id);
  const subjectId = stringValue(payload.subject_id);
  const text = [objectId, objectId ? subjectId : undefined, stringValue(payload.description)].filter(Boolean).join(" ").toLowerCase();
  return /\b(terminal|station|stadium|arena|field|msg|barclays|citi[-_ ]?field)\b/u.test(text);
}

function isStationOrPlaceDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  return Boolean(description && /\b(station|terminal|stadium|arena|field|msg|barclays|citi[-_ ]?field)\b/u.test(description));
}

function isExpenseInclusionDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  return Boolean(description && /\b(expense|expenses|cost|costs)\b/u.test(description));
}

function isEasementProjectEntityDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  return Boolean(description && /\beasements?\b/u.test(description));
}

function isAgreementOrAcquisitionDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  return Boolean(description && /\b(lease|agreement|contract|easements?|acquisition)\b/u.test(description));
}

function isVendorServiceDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  return Boolean(description && /\b(benefits? manager|services?)\b/u.test(description));
}

function isCustomerServiceUnitServes(payload: JsonObject) {
  const subjectId = stringValue(payload.subject_id)?.toLowerCase() ?? "";
  const description = stringValue(payload.description)?.toLowerCase() ?? "";
  return /customer-services|service-comms/u.test(subjectId) || /\bkeep customers informed\b/u.test(description);
}

function isSpecificVendorServiceServesDescription(value: JsonValue | undefined, context?: RelationNormalizationContext) {
  const description = relationEvidenceText(value, context);
  return /\bcontact center as a service\b/u.test(description) || /\bpharmacy benefit management services\b/u.test(description);
}

function isCapitalProjectsOnBehalfDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  if (!description || !/\bon behalf of\b/u.test(description)) return false;
  return /\bundertakes?\s+capital projects?\b/u.test(description);
}

function isHeadquartersLocationDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  return Boolean(description && /\bserves?\s+as\s+headquarters\b/u.test(description));
}

function isParkingFacilityLocationDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  if (!description || !/\bparking facility\b/u.test(description)) return false;
  return /\bcustomers?\b/u.test(description) && /\bstation\b/u.test(description);
}

function isProcuredForUseDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  return Boolean(description && /\b(procured\s+)?for use by\b/u.test(description));
}

function isImplementedByEntityDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  return Boolean(description && /\bimplemented by\b/u.test(description));
}

function isPtaspEntityApplicability(payload: JsonObject, context?: RelationNormalizationContext) {
  const text = [
    stringValue(payload.subject_id),
    stringValue(payload.subject_local_observation_id),
    stringValue(payload.object_id),
    stringValue(payload.object_local_observation_id),
    relationEvidenceText(payload.description, context),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\b(ptasp|public[-_ ]transportation[-_ ]agency[-_ ]safety[-_ ]plan)\b/u.test(text) && /\b(department[-_ ]of[-_ ]buses|department[-_ ]of[-_ ]subways|dob|dos)\b/u.test(text);
}

function isFairFaresFineWaiverEligibility(payload: JsonObject, context?: RelationNormalizationContext) {
  const subjectText = [stringValue(payload.subject_id), stringValue(payload.subject_local_observation_id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const objectText = [stringValue(payload.object_id), stringValue(payload.object_local_observation_id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const evidenceText = relationEvidenceText(payload.description, context);

  return (
    /(^|[^a-z0-9])fair[-_ ]fares([^a-z0-9]|$)/u.test(subjectText) &&
    /(^|[^a-z0-9])(transit[-_ ]adjudication[-_ ]bureau|tab)([^a-z0-9]|$)/u.test(objectText) &&
    /(^|[^a-z0-9])fair[-_ ]fares([^a-z0-9]|$)/u.test(evidenceText) &&
    /(^|[^a-z0-9])eligible([^a-z0-9]|$)/u.test(evidenceText) &&
    /(^|[^a-z0-9])(fine|violation|hearing|waiv(?:e|ed|er))([^a-z0-9]|$)/u.test(evidenceText)
  );
}

function isProjectInvolvesEntityDescription(value: JsonValue | undefined, context?: RelationNormalizationContext) {
  const description = relationEvidenceText(value, context);
  return Boolean(description && /\bproject\s+involves\b/u.test(description));
}

function isNamedSoftwareSystemUse(payload: JsonObject, context?: RelationNormalizationContext) {
  const text = [stringValue(payload.object_id), stringValue(payload.object_local_observation_id), relationEvidenceText(payload.description, context)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /(^|[^a-z0-9])justiceone([^a-z0-9]|$)/u.test(text);
}

function isEmergencyBoothCommsSystemServesNyct(payload: JsonObject, context?: RelationNormalizationContext) {
  const subjectText = [
    stringValue(payload.subject_id),
    stringValue(payload.subject_local_observation_id),
    relationEvidenceText(payload.description, context),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const objectText = [stringValue(payload.object_id), stringValue(payload.object_local_observation_id), relationEvidenceText(payload.description, context)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const isEmergencyCommsSystem =
    /\bee2cs\b/u.test(subjectText) ||
    /\bebcs\b/u.test(subjectText) ||
    /emergency[-_ ]elevator[-_ ](?:2way|two[-_ ]way)[-_ ]comms[-_ ]system\b/u.test(subjectText) ||
    /emergency[-_ ]booth[-_ ]communications[-_ ]system\b/u.test(subjectText);
  const servesNyct = /\b(entity[-_ ]mta[-_ ]nyct|nyct|new[-_ ]york[-_ ]city[-_ ]transit)\b/u.test(objectText);
  return isEmergencyCommsSystem && servesNyct;
}

function isOmnyNfpsServesNyct(payload: JsonObject, context?: RelationNormalizationContext) {
  const subjectText = [stringValue(payload.subject_id), stringValue(payload.subject_local_observation_id), relationEvidenceText(payload.description, context)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const objectText = [stringValue(payload.object_id), stringValue(payload.object_local_observation_id), relationEvidenceText(payload.description, context)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const evidenceText = relationEvidenceText(payload.description, context);

  return (
    /\b(project[-_ ]omny|omny)\b/u.test(subjectText) &&
    /\b(entity[-_ ]mta[-_ ]nyct|nyct|new[-_ ]york[-_ ]city[-_ ]transit)\b/u.test(objectText) &&
    /\b(new[-_ ]fare[-_ ]payment[-_ ]system|nfps)\b/u.test(evidenceText) &&
    /\bthrough[-_ ]omny\b/u.test(evidenceText)
  );
}

function isRailroadNfpsServesRailroads(payload: JsonObject, context?: RelationNormalizationContext) {
  const subjectText = [stringValue(payload.subject_id), stringValue(payload.subject_local_observation_id), relationEvidenceText(payload.description, context)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const evidenceText = relationEvidenceText(payload.description, context);

  const isRailroadFarePayment =
    /\b(rrnfps|railroad[-_ ]new[-_ ]fare[-_ ]payment[-_ ]system)\b/u.test(subjectText) ||
    /\b(rrnfps|railroad[-_ ]new[-_ ]fare[-_ ]payment[-_ ]system)\b/u.test(evidenceText);
  const servesRailroads = /\b(lirr|long[-_ ]island[-_ ]rail[-_ ]road)\b/u.test(evidenceText) && /\b(mnr|metro[-_ ]north[-_ ]railroad)\b/u.test(evidenceText);
  const provesReplacementScope = /\breplacement\b/u.test(evidenceText) && /\bat[-_ ]both\b/u.test(evidenceText);
  return isRailroadFarePayment && servesRailroads && provesReplacementScope;
}

function isOmnyCvmDeploymentAffectsCommuterRail(payload: JsonObject, context?: RelationNormalizationContext) {
  const subjectIdentityText = [stringValue(payload.subject_id), stringValue(payload.subject_local_observation_id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const objectIdentityText = [stringValue(payload.object_id), stringValue(payload.object_local_observation_id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const evidenceText = relationEvidenceText(payload.description, context);

  return (
    /\b(project[-_ ]omny|omny)\b/u.test(subjectIdentityText) &&
    /\b(lirr|long[-_ ]island[-_ ]rail[-_ ]road|metro[-_ ]north|mnr)\b/u.test(objectIdentityText) &&
    /\bomny\b/u.test(evidenceText) &&
    /\bcvm\b/u.test(evidenceText) &&
    /\b(deployment|enhancements?)\b/u.test(evidenceText)
  );
}

function isGcmServesLirr(payload: JsonObject, context?: RelationNormalizationContext) {
  const subjectIdentityText = [stringValue(payload.subject_id), stringValue(payload.subject_local_observation_id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const objectIdentityText = [stringValue(payload.object_id), stringValue(payload.object_local_observation_id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const evidenceText = relationEvidenceText(payload.description, context);

  return (
    /(^|[^a-z0-9])(grand[-_ ]central[-_ ]madison|gcm)([^a-z0-9]|$)/u.test(subjectIdentityText) &&
    /(^|[^a-z0-9])(lirr|long[-_ ]island[-_ ]rail[-_ ]road)([^a-z0-9]|$)/u.test(objectIdentityText) &&
    /(^|[^a-z0-9])(lirr|long[-_ ]island[-_ ]rail[-_ ]road)([^a-z0-9]|$)/u.test(evidenceText) &&
    /(^|[^a-z0-9])(grand[-_ ]central[-_ ]madison|gcm)([^a-z0-9]|$)/u.test(evidenceText) &&
    /(^|[^a-z0-9])(service|schedule|customers?)([^a-z0-9]|$)/u.test(evidenceText)
  );
}

function isParatransitDepartmentServesAccessARide(payload: JsonObject, context?: RelationNormalizationContext) {
  const subjectText = [stringValue(payload.subject_id), stringValue(payload.subject_local_observation_id), relationEvidenceText(payload.description, context)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const objectText = [stringValue(payload.object_id), stringValue(payload.object_local_observation_id), relationEvidenceText(payload.description, context)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const evidenceText = relationEvidenceText(payload.description, context);

  return (
    /department[-_ ]of[-_ ]paratransit\b/u.test(subjectText) &&
    /\b(access[-_ ]a[-_ ]ride|aar)\b/u.test(objectText) &&
    /\bparatransit'?s[-_ ]access[-_ ]a[-_ ]ride\b/u.test(evidenceText)
  );
}

function isPennStationAccessServesMetroNorth(payload: JsonObject, context?: RelationNormalizationContext) {
  const subjectIdentityText = [stringValue(payload.subject_id), stringValue(payload.subject_local_observation_id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const objectIdentityText = [stringValue(payload.object_id), stringValue(payload.object_local_observation_id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const evidenceText = relationEvidenceText(payload.description, context);

  if (/\bpenn[-_ ]station[-_ ]access\b/u.test(subjectIdentityText) && /\b(metro[-_ ]north|mnr)\b/u.test(objectIdentityText)) return true;

  return (
    /\bpenn[-_ ]station[-_ ]access\b/u.test(subjectIdentityText) &&
    /\b(metro[-_ ]north|mnr)\b/u.test(objectIdentityText) &&
    /\b(new[-_ ]haven[-_ ]line|metro[-_ ]north[-_ ]railroad|mnr)\b/u.test(evidenceText) &&
    /\b(provides?|providing|introduce|direct)\b/u.test(evidenceText) &&
    /\b(rail[-_ ])?service\b/u.test(evidenceText)
  );
}

function isNyctMedicalBenefitsProgramServesNyct(payload: JsonObject, context?: RelationNormalizationContext) {
  const subjectIdentityText = [stringValue(payload.subject_id), stringValue(payload.subject_local_observation_id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const objectIdentityText = [stringValue(payload.object_id), stringValue(payload.object_local_observation_id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const evidenceText = relationEvidenceText(payload.description, context);

  return (
    /\bmedical[-_ ]benefits?[-_ ]program\b/u.test(subjectIdentityText) &&
    /\b(entity[-_ ]mta[-_ ]nyct|nyct|nyc[-_ ]transit|new[-_ ]york[-_ ]city[-_ ]transit)\b/u.test(objectIdentityText) &&
    /\b(medical[-_ ]health[-_ ]benefits?|medical[-_ ]benefits?|health[-_ ]benefits?|provides?[-_ ]coverage|coverage[-_ ]for)\b/u.test(evidenceText) &&
    /\b(employees?|active[-_ ]and[-_ ]retired|retired)\b/u.test(evidenceText)
  );
}

function isRailConnectionDescription(value: JsonValue | undefined, context?: RelationNormalizationContext) {
  const description = relationEvidenceText(value, context);
  if (!description || !/\b(connects?|connection)\s+to\b/u.test(description)) return false;
  return /\b(line|mainline|railroad)\b/u.test(description);
}

function isRailTerritoryScopeDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  if (!description) return false;
  return /\b(lines?|territor(?:y|ies))\b/u.test(description);
}

function isRailInfrastructureLocationDescription(value: JsonValue | undefined, context?: RelationNormalizationContext) {
  const description = relationEvidenceText(value, context);
  if (!description) return false;
  if (/\bcross(?:es|ing)?\b/u.test(description) && /\btracks?\b/u.test(description)) return true;
  if (/\bspans?\b/u.test(description) && /\b(branch|line|railroad)\b/u.test(description)) return true;
  return /\b(lines?|trackage|equipment)\b/u.test(description) && /\bproperty\b/u.test(description) && /\badjacent\b/u.test(description);
}

function isStationAccessibilityWorkDescription(value: JsonValue | undefined, context?: RelationNormalizationContext) {
  const description = relationEvidenceText(value, context);
  if (!description || !/\bstations?\b/u.test(description)) return false;
  return /\b(ada|elevators?|escalators?)\b/u.test(description);
}

function isRailroadEscalatorMaintenanceDescription(payload: JsonObject, context?: RelationNormalizationContext) {
  const identityText = [stringValue(payload.subject_id), stringValue(payload.subject_local_observation_id), stringValue(payload.object_id), stringValue(payload.object_local_observation_id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const evidenceText = [identityText, relationEvidenceText(payload.description, context)].filter(Boolean).join(" ");
  if (!evidenceText) return false;
  const hasEscalatorMaintenance =
    /\bescalators?\b/u.test(evidenceText) &&
    /\b(maintenance|inspection|repair|repairs|services?)\b/u.test(evidenceText) &&
    /\bescalator[-_ ]maintenance\b/u.test(identityText);
  const hasRailroadContext =
    /\b(mnr|metro[-_ ]north|lirr|long[-_ ]island[-_ ]rail[-_ ]road|railroads?)\b/u.test(evidenceText) && /\bentity[-_ ]meeting[-_ ]doc[-_ ]124881[-_ ]mnr\b/u.test(identityText);
  return hasEscalatorMaintenance && hasRailroadContext;
}

function hasRouteListPayload(payload: JsonObject) {
  return [payload.routes, payload.routes_affected].some(
    (value) => Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0),
  );
}

function relationEvidenceText(value: JsonValue | undefined, context?: RelationNormalizationContext) {
  return [stringValue(value), context?.raw_text].filter(Boolean).join(" ").toLowerCase();
}

function isEntityServesRouteListDescription(payload: JsonObject, context?: RelationNormalizationContext) {
  const evidenceText = relationEvidenceText(payload.description, context);
  if (!evidenceText) return false;
  const servesRouteList = /\bserv(?:es|ing)\b/u.test(evidenceText) && /\bbus[-_ ]routes?\b/u.test(evidenceText);
  return servesRouteList && /\briders?\b/u.test(evidenceText);
}

function isPreparedDocumentDescription(value: JsonValue | undefined) {
  const description = stringValue(value)?.toLowerCase();
  if (!description || !/\bprepared\b/u.test(description)) return false;
  return /\b(guideline|guidelines|report|plan|budget)\b/u.test(description);
}

function isPerformanceImprovementDescription(value: JsonValue | undefined, context?: RelationNormalizationContext) {
  const evidenceText = relationEvidenceText(value, context);
  if (!evidenceText) return false;
  return /\b(reliability|delays?|travel[-_ ]times?|on[-_ ]time[-_ ]performance|otp|runtime|run[-_ ]time)\b/u.test(evidenceText);
}

function isSupportsTimelineRepair(payload: JsonObject) {
  const subjectId = stringValue(payload.subject_id) ?? "";
  const objectId = stringValue(payload.object_id) ?? "";
  const description = stringValue(payload.description)?.toLowerCase().replace(/\s+/gu, " ").trim() ?? "";
  if (!subjectId.startsWith("event_")) return false;
  if (!objectId.startsWith("claim_") && !objectId.startsWith("metric_")) return false;
  const claimRepair =
    description.startsWith("replacement for malformed has_timeline_event claim->event relation;") ||
    description.startsWith("replacement for malformed has_timeline_event claim -> event relation;");
  const metricRepair = description.startsWith("replacement for malformed has_timeline_event metric_claim -> event relation;");
  return (claimRepair || metricRepair) && description.includes("provides timeline context");
}

function normalizeRelationFamilyForEndpointShape(
  relationKind: string,
  payload: JsonObject,
  endpointKinds: RelationEndpointKinds | undefined,
  context?: RelationNormalizationContext,
): RelationFamily {
  if (!endpointKinds?.subject_kind || !endpointKinds.object_kind) return "other";
  const shape = `${endpointKinds.subject_kind}->${endpointKinds.object_kind}`;

  if (relationKind === "affects" && ["event->route", "project->route"].includes(shape)) return "route_scope";
  if (relationKind === "improves" && shape === "project->project" && isPerformanceImprovementDescription(payload.description, context)) return "metric_context";
  if (relationKind === "affects" && shape === "project->entity" && isRailInfrastructureLocationDescription(payload.description, context)) return "location_scope";
  if (relationKind === "affects" && shape === "project->entity" && isStationAccessibilityWorkDescription(payload.description, context)) return "location_scope";
  if (relationKind === "affects" && shape === "project->entity" && isRailroadEscalatorMaintenanceDescription(payload, context)) return "location_scope";
  if (relationKind === "affects" && shape === "project->entity" && isOmnyCvmDeploymentAffectsCommuterRail(payload, context)) return "agency_role";
  if (relationKind === "implemented_at" && shape === "project->entity" && isStationAccessibilityWorkDescription(payload.description, context)) return "location_scope";
  if (relationKind === "connects_to" && ["corridor->route", "event->route", "route->route"].includes(shape)) return "route_scope";
  if (relationKind === "connects_to" && shape === "project->entity" && isRailConnectionDescription(payload.description, context)) return "dependency_or_reference";
  if (["changes_route_service", "creates_route"].includes(relationKind) && shape === "project->route") return "route_scope";
  if (["replaced", "replaces"].includes(relationKind) && shape === "route->route") return "route_scope";
  if (relationKind === "serves" && shape === "route->corridor") return "corridor_scope";
  if (relationKind === "serves" && shape === "entity->entity" && isLeaseLicenseDescription(payload.description)) return "funding_award";
  if (relationKind === "serves" && shape === "entity->entity" && isServedLocationEntity(payload)) return "location_scope";
  if (relationKind === "serves" && shape === "entity->entity" && isEntityServesRouteListDescription(payload, context)) return "route_scope";
  if (relationKind === "serves" && shape === "entity->entity" && isCustomerServiceUnitServes(payload)) return "agency_role";
  if (relationKind === "serves" && shape === "entity->entity" && isParatransitDepartmentServesAccessARide(payload, context)) return "agency_role";
  if (relationKind === "serves" && shape === "entity->entity" && isSpecificVendorServiceServesDescription(payload.description, context)) return "funding_award";
  if (relationKind === "serves" && shape === "entity->entity" && isCapitalProjectsOnBehalfDescription(payload.description)) return "agency_role";
  if (relationKind === "serves" && shape === "project->entity" && isContractServicesDescription(payload.description)) return "funding_award";
  if (relationKind === "serves" && shape === "project->entity" && isHeadquartersLocationDescription(payload.description)) return "location_scope";
  if (relationKind === "serves" && shape === "project->entity" && isParkingFacilityLocationDescription(payload.description)) return "location_scope";
  if (relationKind === "serves" && shape === "project->entity" && isEmergencyBoothCommsSystemServesNyct(payload, context)) return "agency_role";
  if (relationKind === "serves" && shape === "project->entity" && isOmnyNfpsServesNyct(payload, context)) return "agency_role";
  if (relationKind === "serves" && shape === "project->entity" && isRailroadNfpsServesRailroads(payload, context)) return "agency_role";
  if (relationKind === "serves" && shape === "project->entity" && isPennStationAccessServesMetroNorth(payload, context)) return "agency_role";
  if (relationKind === "serves" && shape === "project->entity" && isNyctMedicalBenefitsProgramServesNyct(payload, context)) return "agency_role";
  if (relationKind === "serves" && shape === "project->entity" && isGcmServesLirr(payload, context)) return "agency_role";
  if (relationKind === "serves" && shape === "entity->entity" && isGcmServesLirr(payload, context)) return "agency_role";
  if (relationKind === "serves" && shape === "treatment_component->entity" && isProcuredForUseDescription(payload.description)) return "treatment_context";
  if (relationKind === "operates_at" && shape === "entity->entity" && isStationOrPlaceDescription(payload.description)) return "location_scope";
  if (relationKind === "applies_to_corridor" && shape === "project->corridor") return "corridor_scope";
  if (relationKind === "applies_to" && hasRouteListPayload(payload)) return "route_scope";
  if (relationKind === "applies_to" && shape === "project->entity" && isPtaspEntityApplicability(payload, context)) return "governance_legal";
  if (relationKind === "applies_to" && shape === "project->entity" && isRailTerritoryScopeDescription(payload.description)) return "location_scope";
  if (relationKind === "eligible_for" && shape === "entity->entity" && isFairFaresFineWaiverEligibility(payload, context)) return "governance_legal";
  if (
    relationKind === "has_associated_entity" &&
    ["project->entity", "entity->entity"].includes(shape) &&
    isAgreementOrAcquisitionDescription(payload.description)
  ) {
    return "funding_award";
  }
  if (relationKind === "has_associated_entity" && shape === "entity->entity" && isVendorServiceDescription(payload.description)) return "funding_award";
  if (relationKind === "has_associated_entity" && shape === "project->entity" && isProjectInvolvesEntityDescription(payload.description, context)) {
    return "program_project_scope";
  }
  if (relationKind === "has_affected_entity" && shape === "project->entity" && isRailInfrastructureLocationDescription(payload.description, context)) return "location_scope";
  if (relationKind === "uses" && shape === "entity->entity" && isNamedSoftwareSystemUse(payload, context)) return "dependency_or_reference";

  if (relationKind === "includes") {
    if (shape === "source->metric_claim") return "metric_context";
    if (shape === "source->claim") return "claim_context";
    if (shape === "event->event") return "timeline_context";
    if (shape === "project->project") return "program_project_scope";
    if (shape === "source->entity") return "publication_role";
    if (shape === "entity->entity" && isExpenseInclusionDescription(payload.description)) return "funding_award";
  }

  if (
    (relationKind === "connects_to" && shape === "route->claim") ||
    (relationKind === "affects" && shape === "claim->entity") ||
    (["has_location", "has_relation", "has_relation_to", "provides", "receives"].includes(relationKind) && shape === "entity->claim")
  ) {
    return "claim_context";
  }

  if (relationKind === "has_related_project" && shape === "claim->project") return "program_project_scope";
  if (relationKind === "has_related_project" && shape === "project->entity" && isEasementProjectEntityDescription(payload.description)) return "funding_award";
  if (relationKind === "has_related_project" && shape === "project->entity" && isImplementedByEntityDescription(payload.description)) return "agency_role";
  if (relationKind === "has_description" && shape === "project->corridor") return "corridor_scope";
  if (relationKind === "included_in" && shape === "entity->entity") return "dependency_or_reference";
  if (relationKind === "has_entity" && shape === "project->entity" && isLeaseLicenseCounterpartyDescription(payload.description)) return "funding_award";

  if (relationKind === "has_location" && shape === "entity->entity") return "location_scope";
  if (relationKind === "uses" && ["entity->entity", "project->entity"].includes(shape) && isDataPortalObjectId(payload.object_id)) return "data_reporting";
  if (relationKind === "uses" && shape === "entity->entity" && isLeaseLicensePropertyUseDescription(payload.description)) return "funding_award";
  if (relationKind === "uses" && shape === "entity->treatment_component") return "treatment_context";
  if (relationKind === "presented" && shape === "entity->metric_claim") return "metric_context";
  if (relationKind === "proposes" && shape === "entity->metric_claim") return "metric_context";
  if (relationKind === "performs" && shape === "entity->claim") return "claim_context";
  if (relationKind === "presented" && shape === "entity->event") return "timeline_context";
  if (relationKind === "prepared" && shape === "entity->source") return "publication_role";
  if (relationKind === "prepared" && shape === "entity->entity" && isPreparedDocumentDescription(payload.description)) return "publication_role";
  if (
    (["affects", "applies_to", "impacts", "supported_by"].includes(relationKind) && shape === "event->entity") ||
    (["contemplates", "has_response_to", "manages_response", "operates_service_for", "performs", "proposes", "related_entity", "requests", "seeks_approval"].includes(
      relationKind,
    ) &&
      shape === "entity->event") ||
    (["accommodates"].includes(relationKind) && shape === "event->project") ||
    (["mentions", "part_of_committee_schedule"].includes(relationKind) && shape === "event->entity") ||
    (["enables", "serves"].includes(relationKind) && shape === "project->event") ||
    (relationKind === "serves" && shape === "route->event")
  ) {
    return "timeline_context";
  }
  if (
    (relationKind === "contains" && shape === "source->event") ||
    (relationKind === "applies_to" && shape === "source->entity") ||
    (relationKind === "uses" && shape === "source->entity") ||
    (["received_by", "recommended_by", "recommends", "relates_to", "sponsored_by", "structures"].includes(relationKind) && shape === "source->entity") ||
    (["receives_report", "reviews_and_approves"].includes(relationKind) && shape === "entity->source") ||
    (relationKind === "included_in" && shape === "entity->source") ||
    (["is_part_of"].includes(relationKind) && shape === "claim->source") ||
    (relationKind === "proposes" && shape === "entity->source")
  ) {
    return "publication_role";
  }
  if (relationKind === "replaces" && shape === "source->event") return "dependency_or_reference";
  if (relationKind === "has_reported_item" && shape === "entity->event") return "timeline_context";
  if (relationKind === "has_connecting_service" && shape === "entity->entity") return "partnership_engagement";

  return "other";
}

export function normalizeRelationPayload(payload: JsonObject, endpointKinds?: RelationEndpointKinds, context?: RelationNormalizationContext): JsonObject {
  const relationKind = stringValue(payload.relation_kind);
  if (!relationKind) return payload;

  const rawRelationKind = stringValue(payload.raw_relation_kind);
  const normalized = rawRelationKind ? normalizeRelationKind(rawRelationKind) : normalizeRelationKind(relationKind);
  const family = normalizeRelationFamily(normalized);
  const exactFamily = normalized === "supports" && isSupportsTimelineRepair(payload) ? "timeline_context" : undefined;
  const endpointFamily = family === "other" ? normalizeRelationFamilyForEndpointShape(normalized, payload, endpointKinds, context) : "other";
  const nextFamily = exactFamily ?? (family !== "other" ? family : endpointFamily);
  const next: JsonObject = { ...payload };
  if (exactFamily !== undefined) {
    if (next.relation_family === undefined || next.relation_family === "other" || next.relation_family === family) next.relation_family = exactFamily;
  } else if (next.relation_family === undefined || (next.relation_family === "other" && nextFamily !== "other")) {
    next.relation_family = nextFamily;
  }

  if (normalized === relationKind) return next;

  next.raw_relation_kind = payload.raw_relation_kind ?? relationKind;
  next.relation_kind = normalized;
  return next;
}

export function relationEndpointShapeIssue(
  relationKind: string,
  subjectKind: string | undefined,
  objectKind: string | undefined,
): RelationEndpointShapeIssue | undefined {
  const normalizedKind = normalizeRelationKind(relationKind);
  const shape = RELATION_ENDPOINT_SHAPES[normalizedKind];
  if (!shape || !subjectKind || !objectKind) return undefined;
  if (shape.subject.includes(subjectKind as MtaObservationKind) && shape.object.includes(objectKind as MtaObservationKind)) {
    return undefined;
  }

  return {
    relation_kind: normalizedKind,
    subject_kind: subjectKind,
    object_kind: objectKind,
    expected_subject_kinds: shape.subject,
    expected_object_kinds: shape.object,
    message: `Relation kind ${normalizedKind} expects ${shape.subject.join("|")} -> ${shape.object.join("|")}, got ${subjectKind} -> ${objectKind}.`,
  };
}

function recordSourceIds(record: MtaCanonicalRecord) {
  return [...new Set([record.source_id, ...(record.source_ids ?? [])])].sort();
}

function submissionDisplayName(entry: MtaSubmissionEntry) {
  return entry.tool_args.label ?? entry.tool_args.raw_text ?? entry.tool_args.local_observation_id;
}

function relationEntryKind(entry: MtaSubmissionEntry) {
  return stringValue(entry.tool_args.payload?.relation_kind);
}

function sourceMatches(candidateSources: string[], sourceId: string | undefined) {
  return !sourceId || candidateSources.includes(sourceId);
}

function addReason(reasons: string[], condition: boolean, reason: string) {
  if (condition) reasons.push(reason);
}

function relationMatchesQuery(
  relation: Pick<ExistingRelationCandidate, "relation_kind" | "subject_id" | "object_id" | "subject_local_observation_id" | "object_local_observation_id" | "source_ids">,
  query: RelationCandidateQuery,
) {
  if (!sourceMatches(relation.source_ids, query.source_id)) return [];

  const reasons: string[] = [];
  const normalizedQueryKind = query.relation_kind ? normalizeRelationKind(query.relation_kind) : undefined;
  addReason(reasons, Boolean(normalizedQueryKind && relation.relation_kind === normalizedQueryKind), "same relation_kind");
  addReason(reasons, Boolean(query.subject_id && relation.subject_id === query.subject_id), "same subject_id");
  addReason(reasons, Boolean(query.object_id && relation.object_id === query.object_id), "same object_id");
  addReason(
    reasons,
    Boolean(query.subject_local_observation_id && relation.subject_local_observation_id === query.subject_local_observation_id),
    "same subject_local_observation_id",
  );
  addReason(
    reasons,
    Boolean(query.object_local_observation_id && relation.object_local_observation_id === query.object_local_observation_id),
    "same object_local_observation_id",
  );
  addReason(reasons, Boolean(query.record_id && (relation.subject_id === query.record_id || relation.object_id === query.record_id)), "touches record_id");

  const hasSpecificQuery = Boolean(
    normalizedQueryKind ||
      query.subject_id ||
      query.object_id ||
      query.subject_local_observation_id ||
      query.object_local_observation_id ||
      query.record_id,
  );
  if (!hasSpecificQuery && query.source_id) reasons.push("same source_id");

  return reasons;
}

function canonicalRelationCandidates(records: MtaCanonicalRecord[], query: RelationCandidateQuery): ExistingRelationCandidate[] {
  return records
    .filter((record) => record.record_kind === "relation")
    .map((record) => {
      const relationKind = stringValue(record.payload.relation_kind);
      const candidate: ExistingRelationCandidate = {
        record_id: record.record_id,
        local_observation_id: record.local_observation_id,
        relation_kind: relationKind ? normalizeRelationKind(relationKind) : "unknown",
        raw_relation_kind: stringValue(record.payload.raw_relation_kind),
        subject_id: stringValue(record.payload.subject_id),
        object_id: stringValue(record.payload.object_id),
        subject_local_observation_id: stringValue(record.payload.subject_local_observation_id),
        object_local_observation_id: stringValue(record.payload.object_local_observation_id),
        source_ids: recordSourceIds(record),
        display_name: record.display_name,
        match_reasons: [],
      };
      candidate.match_reasons = relationMatchesQuery(candidate, query);
      return candidate;
    })
    .filter((candidate) => candidate.match_reasons.length > 0);
}

function submissionRelationCandidates(entries: MtaSubmissionEntry[], query: RelationCandidateQuery): ExistingRelationCandidate[] {
  return entries
    .filter((entry) => entry.validation.state === "accepted" && entry.tool_args.observation_kind === "relation")
    .map((entry) => {
      const relationKind = relationEntryKind(entry);
      const candidate: ExistingRelationCandidate = {
        local_observation_id: entry.tool_args.local_observation_id,
        relation_kind: relationKind ? normalizeRelationKind(relationKind) : "unknown",
        raw_relation_kind: stringValue(entry.tool_args.payload?.raw_relation_kind),
        subject_local_observation_id: stringValue(entry.tool_args.payload?.subject_local_observation_id),
        object_local_observation_id: stringValue(entry.tool_args.payload?.object_local_observation_id),
        subject_id: stringValue(entry.tool_args.payload?.subject_id),
        object_id: stringValue(entry.tool_args.payload?.object_id),
        source_ids: [entry.tool_args.source_id],
        display_name: entry.tool_args.label,
        match_reasons: [],
      };
      candidate.match_reasons = relationMatchesQuery(candidate, query);
      return candidate;
    })
    .filter((candidate) => candidate.match_reasons.length > 0);
}

function pairKey(kind: string, subjectLocalId: string, objectLocalId: string) {
  return `${kind}\0${subjectLocalId}\0${objectLocalId}`;
}

function existingSubmissionRelationKeys(entries: MtaSubmissionEntry[], sourceId: string) {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (entry.validation.state !== "accepted" || entry.tool_args.source_id !== sourceId || entry.tool_args.observation_kind !== "relation") continue;
    const relationKind = relationEntryKind(entry);
    const subjectLocalId = stringValue(entry.tool_args.payload?.subject_local_observation_id);
    const objectLocalId = stringValue(entry.tool_args.payload?.object_local_observation_id);
    if (!relationKind || !subjectLocalId || !objectLocalId) continue;
    keys.add(pairKey(normalizeRelationKind(relationKind), subjectLocalId, objectLocalId));
  }
  return keys;
}

function candidateEntries(entries: MtaSubmissionEntry[], sourceId: string) {
  return entries.filter((entry) => entry.validation.state === "accepted" && entry.tool_args.source_id === sourceId && entry.tool_args.observation_kind !== "relation");
}

export function possibleRelationCandidatesForSource(
  entries: MtaSubmissionEntry[],
  sourceId: string,
  focusLocalObservationId: string | undefined,
  maxResults = 5,
): PossibleRelationCandidate[] {
  const accepted = candidateEntries(entries, sourceId);
  const byKind = new Map<MtaObservationKind, MtaSubmissionEntry[]>();
  for (const entry of accepted) {
    const bucket = byKind.get(entry.tool_args.observation_kind) ?? [];
    bucket.push(entry);
    byKind.set(entry.tool_args.observation_kind, bucket);
  }

  const existing = existingSubmissionRelationKeys(entries, sourceId);
  const candidates: PossibleRelationCandidate[] = [];
  for (const rule of SAME_SOURCE_PAIR_RULES) {
    const subjects = rule.subject.flatMap((kind) => byKind.get(kind) ?? []);
    const objects = rule.object.flatMap((kind) => byKind.get(kind) ?? []);
    for (const subject of subjects) {
      for (const object of objects) {
        if (subject.tool_args.local_observation_id === object.tool_args.local_observation_id) continue;
        if (
          focusLocalObservationId &&
          subject.tool_args.local_observation_id !== focusLocalObservationId &&
          object.tool_args.local_observation_id !== focusLocalObservationId
        ) {
          continue;
        }
        const key = pairKey(rule.relation_kind, subject.tool_args.local_observation_id, object.tool_args.local_observation_id);
        if (existing.has(key)) continue;
        candidates.push({
          relation_kind: rule.relation_kind,
          subject_local_observation_id: subject.tool_args.local_observation_id,
          object_local_observation_id: object.tool_args.local_observation_id,
          subject_kind: subject.tool_args.observation_kind,
          object_kind: object.tool_args.observation_kind,
          subject_label: submissionDisplayName(subject),
          object_label: submissionDisplayName(object),
          reason: rule.reason,
        });
        if (candidates.length >= maxResults) return candidates;
      }
    }
  }

  return candidates;
}

export function findRelationCandidates(
  records: MtaCanonicalRecord[],
  entries: MtaSubmissionEntry[],
  query: RelationCandidateQuery,
) {
  const maxResults = Math.max(1, Math.min(25, query.max_results ?? 8));
  const existing = [...canonicalRelationCandidates(records, query), ...submissionRelationCandidates(entries, query)]
    .sort((a, b) => b.match_reasons.length - a.match_reasons.length || (a.record_id ?? a.local_observation_id ?? "").localeCompare(b.record_id ?? b.local_observation_id ?? ""))
    .slice(0, maxResults);
  const possible =
    query.source_id && !query.subject_id && !query.object_id
      ? possibleRelationCandidatesForSource(entries, query.source_id, query.subject_local_observation_id ?? query.object_local_observation_id, maxResults)
      : [];

  return {
    existing_relations: existing,
    possible_relation_candidates: possible,
    instruction:
      "Existing relations are possible duplicate or adjacent edges. Possible relation candidates are advisory only; submit a relation only when the source evidence supports the edge.",
  };
}
