import type { MtaObservationKind } from "./types.js";

// Single source of truth for per-kind payload structure. Field inclusion and
// enum closure are derived from the schema audit over the accepted submission
// corpus (data/identity-review/schema-audit/latest.json): fields with >=5
// accepted occurrences or curated ontology preference are listed; enums close
// only when the audit reports closure_readiness === "saturated" AND an
// accepted schema proposal exists. Everything else stays open with
// runner-owned *_normalized companions (see normalizers.ts).

export type KindFieldType =
  | "string"
  | "number"
  | "boolean"
  | "string_array"
  | "string_or_number"
  | "string_or_string_array"
  | "string_or_boolean"
  | "json";

export type KindFieldSpec = {
  name: string;
  type: KindFieldType;
  description: string;
  /** Closed enum values (audit-saturated + accepted proposal only). Out-of-enum literals belong in extra_fields or the *_other_text companion. */
  enum_values?: string[] | undefined;
  /** Field is accepted but a different field is preferred. */
  prefer?: string | undefined;
};

export type KindRelationContextField = {
  field: string;
  reason: string;
  suggested_relation?: string | undefined;
};

export type KindRunnerCompanion = {
  raw: string;
  companion: string;
  reason: string;
};

export type KindSpec = {
  observation_kind: MtaObservationKind;
  /** Identity is corpus-global (entity/project/corridor/route): resolve before create, merges.json applies. */
  global: boolean;
  /** No per-kind submit tool is generated; submissions only flow through the escape hatch. */
  deprecated?: boolean | undefined;
  summary: string;
  /** Payload must include at least one of these fields (imperative check, mirrors REQUIRED_PAYLOAD_ANCHORS). */
  anchors: string[];
  /** Curated raw fields surfaced first in prompts and ontology guides. */
  preferred_fields: string[];
  fields: KindFieldSpec[];
  runner_companions: KindRunnerCompanion[];
  relation_context_fields: KindRelationContextField[];
  notes: string[];
};

/** Bump when registry field/enum structure changes in a way downstream consumers should detect.
 *  v2 (S2.1): source/event/metric_claim gain runner-owned companions — published_date_normalized,
 *  authority_tier, lifecycle_phase, scalar event date_normalized/date_precision, and the C4 cost
 *  companions (docs/step-2-implementation-plan.md §S2.1). */
export const PAYLOAD_SCHEMA_VERSION = 2;

export const RUNNER_OWNED_FIELDS = new Set([
  "unit_normalized",
  // location_text's normalized companion uses this legacy name instead of location_text_normalized
  // (normalizers.ts); without it the corpus-replay test counts runner output as agent drift.
  "normalized_location",
  "borough_normalized",
  "boroughs_normalized",
  "route_type_normalized",
  "event_family",
  "treatment_family",
  "project_family",
  "document_time_status",
  "direction_normalized",
  "day_type_normalized",
  "mode_normalized",
  "scenario_normalized",
  "demographic_group_normalized",
  "comparison_normalized",
  "time_period_normalized",
  "service_type_normalized",
  "data_type_normalized",
  "change_type_normalized",
  "gap_kind_normalized",
  "relation_family",
  "treatment_record_scope",
  "treatment_record_scope_reason",
  // S2.1 runner-owned companions (promoted as TEXT columns; normalizers in normalizers.ts).
  // Source date + authority (C2.6 / C7); event lifecycle + scalar date (C2.1); metric cost/
  // funding dimensions (C4). Closure stays C5-governed — zero CHECK enums this step.
  "published_date_normalized",
  "published_date_precision",
  "authority_tier",
  "date_normalized",
  "date_precision",
  "date_source_field",
  "lifecycle_phase",
  // lifecycle_phase's "other, specify" passthrough companion (this event spec's runner_companions:
  // "lifecycle_phase_other passthrough"). Runner-authored like lifecycle_phase itself; without it
  // the corpus-replay test counts runner output as agent drift (same blind spot as
  // normalized_location). W3's event-heavy corpus surfaced it.
  "lifecycle_phase_other",
  "cost_type",
  "funding_source",
  "time_horizon",
  "benefit_denominator_stated",
  "cause_attribution",
]);

const NYC_BOROUGHS = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"];

const field = (name: string, type: KindFieldType, description: string, extras: Partial<KindFieldSpec> = {}): KindFieldSpec => ({
  name,
  type,
  description,
  ...extras,
});

const KIND_SPECS: Record<MtaObservationKind, KindSpec> = {
  source: {
    observation_kind: "source",
    global: false,
    summary: "Document-level metadata for the source being ingested.",
    anchors: [],
    preferred_fields: ["title", "publisher", "content_type", "date", "date_text", "publication_date", "retrieved_at"],
    fields: [
      field("title", "string", "Document title as printed."),
      field("publisher", "string", "Publishing organization as printed (relation context; also link published_by when supported)."),
      field("description", "string", "Short description of the document."),
      field("content_type", "string", "Document content type (report, presentation, brochure, ...)."),
      field("source_type", "string", "Source genre as stated by the document."),
      field("document_type", "string", "Document type label as printed."),
      field("date_text", "string", "Verbatim document date wording."),
      field("date", "string", "Document date literal."),
      field("document_date", "string", "Document date literal."),
      field("publication_date", "string", "Publication date literal."),
      field("retrieved_at", "string", "Retrieval timestamp when stated."),
      field("year", "number", "Publication year when stated as a bare year."),
      field("source_url", "string", "Document URL when printed."),
      field("url", "string", "Document URL when printed.", { prefer: "source_url" }),
      field("source_name", "string", "Source name label.", { prefer: "title" }),
      field("source_title", "string", "Source title label.", { prefer: "title" }),
      field("document_title", "string", "Document title label.", { prefer: "title" }),
      field("document_kind", "string", "Document kind label.", { prefer: "content_type" }),
      field("prepared_for", "string", "Organization the document was prepared for (relation context)."),
      field("source_id", "string", "Upstream source identifier when printed."),
    ],
    runner_companions: [
      {
        raw: "publication_date/date/document_date/date_text/year",
        companion: "published_date_normalized/published_date_precision",
        reason:
          "Source publication date is load-bearing for every diachronic join (C2.6); the runner folds the best available date literal into a normalized ISO value + precision, raw literals preserved.",
      },
      {
        raw: "publisher/content_type",
        companion: "authority_tier",
        reason:
          "Authority tier (official_evaluation/board_material/plan_document/press_release/dataset_documentation/third_party) is derived from publisher + content_type for the C7 corroboration surface; open passthrough, C5-governed closure.",
      },
    ],
    relation_context_fields: [
      {
        field: "publisher",
        reason: "Publisher has 39 accepted/canonical observations and should link to entity context when useful.",
        suggested_relation: "published_by",
      },
    ],
    notes: ["Source classification fields are currently sparse; preserve literals and avoid closed document-kind enums."],
  },

  entity: {
    observation_kind: "entity",
    global: true,
    summary: "Agencies, organizations, programs, and people referenced by sources.",
    anchors: ["entity_name", "name", "agency_name", "operator", "owner", "publisher", "entity_type"],
    preferred_fields: ["entity_name", "name", "agency_name", "entity_type", "short_name", "acronym", "description"],
    fields: [
      field("entity_name", "string", "Primary entity name as printed."),
      field("entity_type", "string", "Entity type literal (agency, person, program, ...)."),
      field("agency_name", "string", "Agency name when the entity is or belongs to an agency."),
      field("name", "string", "Entity name.", { prefer: "entity_name" }),
      field("description", "string", "Short description of the entity."),
      field("role", "string", "Role of the entity in this source's context."),
      field("title", "string", "Person title when the entity is a person."),
      field("acronym", "string", "Acronym as printed."),
      field("short_name", "string", "Short name as printed."),
      field("organization", "string", "Parent organization name (relation context)."),
      field("publisher", "string_or_boolean", "Publisher name (relation context); avoid boolean flags."),
      field("operator", "string_or_boolean", "Operator name (relation context); avoid boolean flags."),
      field("owner", "string", "Owner name (relation context)."),
      field("parent_organization", "string", "Parent organization name (relation context)."),
      field("parent_entity", "string", "Parent entity name (relation context)."),
      field("agency", "string", "Agency name (relation context)."),
      field("office", "string", "Office name (relation context unless the source treats the office as the entity)."),
    ],
    runner_companions: [],
    relation_context_fields: [
      { field: "publisher", reason: "Publisher can be a source role or related organization; mixed usage is not a safe enum.", suggested_relation: "published_by" },
      { field: "organization", reason: "Organization names should link to entity records when supported.", suggested_relation: "part_of_agency" },
      { field: "owner", reason: "Owner names should link to entity records when supported.", suggested_relation: "owned_by" },
      { field: "parent_organization", reason: "Parent organizations are relation context.", suggested_relation: "part_of_agency" },
      { field: "parent_entity", reason: "Parent entities are relation context.", suggested_relation: "part_of_agency" },
      { field: "agency", reason: "Agency names are relation context." },
      { field: "office", reason: "Office names are relation context unless the source treats the office as the entity." },
    ],
    notes: ["Do not merge person/title strings into agencies without entity-type evidence."],
  },

  project: {
    observation_kind: "project",
    global: true,
    summary: "Named initiatives: SBS launches, busways, redesigns, pilots, studies.",
    anchors: ["project_name", "name", "project_type", "status", "description"],
    preferred_fields: ["project_name", "name", "project_type", "status", "borough", "boroughs", "description"],
    fields: [
      field("project_name", "string", "Project name as printed."),
      field("name", "string", "Project name.", { prefer: "project_name" }),
      field("description", "string", "Short description of the project."),
      field("status", "string", "Project status literal as stated by the document (runner adds document_time_status)."),
      field("project_type", "string", "Project type literal (runner adds project_family)."),
      field("borough", "string", "Single borough literal."),
      field("boroughs", "string_array", "Borough list when the project spans boroughs."),
      field("routes_served", "string_array", "Route labels served (relation context -> serves_route)."),
      field("daily_ridership", "number", "Stated daily ridership."),
      field("corridor_length_miles", "number", "Stated corridor length in miles."),
      field("location", "string", "Location wording when stated."),
      field("launch_date", "string", "Launch date literal."),
      field("completion_date", "string", "Completion date literal."),
      field("completion_target_year", "string_or_number", "Completion target year when stated."),
      field("program", "string", "Program name (relation context -> part_of_program)."),
      field("agency", "string", "Agency name (relation context -> implemented_by)."),
      field("lead_agency", "string", "Lead agency (relation context -> implemented_by)."),
      field("implementing_agency", "string", "Implementing agency (relation context -> implemented_by)."),
      field("partner_agency", "string", "Partner agency (relation context -> has_partner)."),
      field("partners", "string_or_string_array", "Partner list (relation context -> has_partner)."),
      field("publisher", "string", "Publisher (relation context -> published_by)."),
      field("operator", "string", "Operator (relation context -> operated_by)."),
      field("owner", "string", "Owner (relation context -> owned_by)."),
      field("subway_lines", "string_array", "Subway line list (external service context)."),
    ],
    runner_companions: [
      {
        raw: "status",
        companion: "document_time_status",
        reason: "Project status is preserved raw while document_time_status maps observed values to a bounded document-time lifecycle taxonomy with other as passthrough fallback.",
      },
      {
        raw: "project_type",
        companion: "project_family",
        reason: "Project type is preserved raw while project_family maps observed values to a bounded project-family taxonomy with other as passthrough fallback.",
      },
    ],
    relation_context_fields: [
      { field: "program", reason: "Program names caused identity overmerge; they are relation context, not strong project identity.", suggested_relation: "part_of_program" },
      { field: "agency", reason: "Agency names should link to entity records when supported.", suggested_relation: "implemented_by" },
      { field: "lead_agency", reason: "Lead agency is relation context.", suggested_relation: "implemented_by" },
      { field: "implementing_agency", reason: "Implementing agency is relation context.", suggested_relation: "implemented_by" },
      { field: "partner_agency", reason: "Partner agency is relation context.", suggested_relation: "has_partner" },
      { field: "partners", reason: "Partner agency lists are relation context.", suggested_relation: "has_partner" },
      { field: "publisher", reason: "Publisher is an entity relation, not a project enum.", suggested_relation: "published_by" },
      { field: "operator", reason: "Operator is an entity relation, not a project enum.", suggested_relation: "operated_by" },
      { field: "owner", reason: "Owner is an entity relation, not a project enum.", suggested_relation: "owned_by" },
      { field: "routes_served", reason: "Route lists should become project-route relations when supported.", suggested_relation: "serves_route" },
      { field: "subway_lines", reason: "Subway line lists are external service context." },
    ],
    notes: ["Project identity comes from project name plus scope; program and status are not strong identity keys."],
  },

  corridor: {
    observation_kind: "corridor",
    global: true,
    summary: "Street corridors with geographic limits where service runs or treatments apply.",
    anchors: ["corridor_name", "name", "street", "streets", "limits", "from", "to", "description"],
    preferred_fields: ["corridor_name", "name", "street", "streets", "limits", "from", "to", "borough", "boroughs", "description"],
    fields: [
      field("corridor_name", "string", "Corridor name as printed."),
      field("name", "string", "Corridor name.", { prefer: "corridor_name" }),
      field("street", "string", "Primary street name."),
      field("streets", "string_or_string_array", "Street list when the corridor spans streets."),
      field("limits", "string", "Corridor limits wording (e.g. 'from X to Y')."),
      field("from", "string", "Corridor start limit."),
      field("to", "string", "Corridor end limit."),
      field("borough", "string", "Single borough literal."),
      field("boroughs", "string_array", "Borough list when the corridor spans boroughs."),
      field("description", "string", "Short description of the corridor."),
      field("status", "string", "Corridor status literal when stated."),
      field("routes", "string_array", "Route labels on the corridor (relation context -> operates_on_corridor)."),
      field("routes_served", "string_array", "Route labels served (relation context -> operates_on_corridor)."),
      field("corridor_length_mi", "number", "Stated corridor length in miles."),
      field("combined_daily_ridership", "number", "Stated combined daily ridership."),
      field("days", "string", "Operating days wording for corridor rules."),
      field("hours", "string", "Operating hours wording for corridor rules."),
      field("local_access", "string", "Local access rule wording."),
      field("through_access_vehicles", "string_array", "Vehicle classes with through access."),
    ],
    runner_companions: [
      {
        raw: "borough or boroughs",
        companion: "borough_normalized or boroughs_normalized",
        reason: "Corridor borough has 43 accepted and 33 canonical observations with stable NYC borough values.",
      },
    ],
    relation_context_fields: [
      { field: "routes", reason: "Route lists refer to route records, not corridor identity.", suggested_relation: "route operates_on_corridor corridor" },
      { field: "routes_served", reason: "Route lists refer to route records, not corridor identity.", suggested_relation: "route operates_on_corridor corridor" },
    ],
    notes: ["Street name alone is weak identity; borough/limits/scope matter for canonical corridor identity."],
  },

  route: {
    observation_kind: "route",
    global: true,
    summary: "Bus routes and service variants (SBS, local, limited, express).",
    anchors: ["route_id", "route_name", "route", "route_label", "routes"],
    preferred_fields: ["route_id", "route_label", "route_name", "route_type", "borough", "boroughs"],
    fields: [
      field("route_id", "string", "Route id as printed (e.g. M86, B44+)."),
      field("route_label", "string", "Route label as printed (e.g. M86-SBS)."),
      field("route_name", "string", "Full route name as printed (e.g. M86 Select Bus Service)."),
      field("route", "string", "Route id shorthand.", { prefer: "route_id" }),
      field("routes", "string_array", "Route list when the observation covers several routes (relation context)."),
      field("route_type", "string", "Service type literal (runner adds route_type_normalized)."),
      field("service_variant", "string", "service_variant is derived from route_type for current submissions; keep source route type literal.", {
        prefer: "route_type",
      }),
      field("borough", "string", "Single borough literal.", { enum_values: NYC_BOROUGHS }),
      field("boroughs", "string_array", "Borough list when the route spans boroughs."),
      field("description", "string", "Short description of the route."),
      field("streets", "string", "Streets wording for the route alignment."),
      field("note", "string", "Source note about the route."),
      field("mode", "string", "Mode literal when stated."),
      field("program", "string", "Program name (relation context -> part_of_program)."),
      field("operator", "string", "Operator (relation context -> operated_by)."),
      field("agency", "string", "Agency (relation context -> operated_by)."),
      field("corridors", "string_array", "Corridor list (relation context -> operates_on_corridor)."),
      field("related_existing_routes", "string_array", "Related route list (relation context -> related_route)."),
      field("branding_label", "string", "Branding label when distinct from route_label."),
      field("internal_route_id", "string", "Internal/GTFS route id when printed."),
      field("source_route_surface", "string", "Where the route id surface comes from (gtfs, bustime, ...)."),
      field("route_id_authority", "string", "Authority for the route id surface before deriving plus/SBS identity."),
    ],
    runner_companions: [
      {
        raw: "route_type",
        companion: "route_type_normalized",
        reason: "18 accepted/canonical route_type observations support open normalization.",
      },
      {
        raw: "borough or boroughs",
        companion: "borough_normalized or boroughs_normalized",
        reason: "Route borough has 78 accepted observations, but the current field is mixed scalar/array and must stay open.",
      },
      {
        raw: "route identity/scope fields",
        companion: "route_record_scope/route_record_scope_reason",
        reason: "Materialization classifies true routes, aggregate/list context, data-only count records, and split candidates after canonical route merge.",
      },
    ],
    relation_context_fields: [
      {
        field: "program",
        reason: "21 accepted/canonical observations are ABLE program membership; program is relation context, not route identity.",
        suggested_relation: "part_of_program",
      },
      { field: "operator", reason: "Operator names are agencies/entities, not a route enum.", suggested_relation: "operated_by" },
      { field: "agency", reason: "Agency names are entity context, not route identity.", suggested_relation: "operated_by" },
      { field: "corridors", reason: "Corridor lists should become route-corridor relations when evidence supports them.", suggested_relation: "operates_on_corridor" },
      { field: "routes", reason: "Related route lists are relation candidates, not route identity.", suggested_relation: "related_route" },
      { field: "related_existing_routes", reason: "Related route lists are relation candidates, not a fixed route enum.", suggested_relation: "related_route" },
      { field: "source_route_surface", reason: "Preserves why a route id surface such as B44+ is authoritative." },
      { field: "route_id_authority", reason: "Preserves authority before deriving plus/SBS identity." },
    ],
    notes: [
      "Use scalar borough for one borough and boroughs for arrays.",
      "Official MTA plus-suffixed route_id/internal_route_id values are normalized as SBS while preserving route_id_authority.",
    ],
  },

  treatment_component: {
    observation_kind: "treatment_component",
    global: false,
    summary: "Physical/operational interventions: bus lanes, queue jumps, TSP, off-board fare payment.",
    anchors: ["treatment_kind", "treatment_type", "component_kind", "component_type", "description", "locations"],
    preferred_fields: ["treatment_kind", "treatment_type", "component_kind", "component_type", "description", "locations", "location_text", "date_text"],
    fields: [
      field("treatment_kind", "string", "Treatment kind literal (runner adds treatment_family)."),
      field("treatment_type", "string", "Treatment type literal.", { prefer: "treatment_kind" }),
      field("component_kind", "string", "Component kind literal when the treatment is a component."),
      field("component_type", "string", "Component type literal.", { prefer: "component_kind" }),
      field("description", "string", "Short description of the treatment."),
      field("locations", "string_or_string_array", "Location wording or list for installations."),
      field("location_text", "string", "Verbatim location wording."),
      field("date_text", "string", "Verbatim date wording for the treatment."),
      field("enforcement_authority", "string", "Authority name (relation context -> enforced_by)."),
    ],
    runner_companions: [
      {
        raw: "treatment_kind/treatment_type/component_kind/component_type",
        companion: "treatment_family",
        reason: "Treatment literals are preserved raw while treatment_family maps observed values to a bounded intervention taxonomy with other as passthrough fallback.",
      },
      {
        raw: "treatment_kind/treatment_type/description",
        companion: "treatment_record_scope/treatment_record_scope_reason",
        reason: "Treatment observations are marked with a runner-owned scope when payload text proves they are contextual, aggregate, or non-intervention records rather than actionable physical or operational treatments.",
      },
    ],
    relation_context_fields: [
      { field: "enforcement_authority", reason: "Authority names refer to agency/entity records.", suggested_relation: "enforced_by" },
    ],
    notes: ["Keep treatment location/date wording raw; runner-owned location/date companions are added when parseable."],
  },

  event: {
    observation_kind: "event",
    global: false,
    summary: "Dated lifecycle moments: launches, meetings, milestones, expansions.",
    anchors: ["event_kind", "date_text", "date", "event_date", "description"],
    preferred_fields: ["event_kind", "date_text", "date", "event_date", "description"],
    fields: [
      field("event_kind", "string", "Event kind literal (runner adds event_family)."),
      field("description", "string", "Short description of the event."),
      field("date_text", "string", "Verbatim date wording."),
      field("date", "string", "Date literal.", { prefer: "date_text" }),
      field("event_date", "string", "Event date literal.", { prefer: "date_text" }),
      field("event_name", "string", "Event name when printed."),
      field("year", "number", "Bare year when that is all the source states."),
      field("organizers", "string_array", "Organizer list (relation context -> organized_by)."),
      field("participants", "string_array", "Participant list (relation context -> has_participant)."),
      field("stations_affected", "string_array", "Station list (external service/location context)."),
    ],
    runner_companions: [
      {
        raw: "event_kind",
        companion: "event_family",
        reason: "Event kind is preserved raw while event_family maps observed values to a bounded lifecycle taxonomy with other as passthrough fallback.",
      },
      {
        raw: "event_kind/event_family",
        companion: "lifecycle_phase",
        reason:
          "Lifecycle phase (C2.1) maps event kind/family toward a bounded lifecycle taxonomy (proposed…cancelled) with lifecycle_phase_other passthrough; raw event_kind preserved, C5-governed closure.",
      },
      {
        raw: "event_date/date/date_text/year",
        companion: "date_normalized/date_precision",
        reason:
          "The best available event date literal is folded to a scalar normalized ISO value + precision (day/month/season/year) so lifecycle views (C2) can order events; raw literals preserved.",
      },
    ],
    relation_context_fields: [
      { field: "organizers", reason: "Organizer lists refer to entity records.", suggested_relation: "organized_by" },
      { field: "participants", reason: "Participant lists refer to entity records.", suggested_relation: "has_participant" },
      { field: "stations_affected", reason: "Station lists are external service/location context." },
    ],
    notes: ["Preserve the source date literal; runner-owned *_normalized companions are added when parseable."],
  },

  claim: {
    observation_kind: "claim",
    global: false,
    summary: "Qualitative source-backed statements that are not numeric measurements.",
    anchors: ["claim_text", "statement", "description", "text"],
    preferred_fields: ["claim_text", "statement", "description", "text", "data_type", "change_type"],
    fields: [
      field("claim_text", "string", "Verbatim or tightly paraphrased claim text."),
      field("statement", "string", "Claim statement.", { prefer: "claim_text" }),
      field("description", "string", "Short description or context for the claim."),
      field("text", "string", "Claim text.", { prefer: "claim_text" }),
      field("data_type", "string", "Claim data-type literal (runner adds data_type_normalized)."),
      field("change_type", "string", "Claim change-type literal (runner adds change_type_normalized)."),
      field("subject", "string", "Subject wording of the claim."),
      field("route", "string", "Route id mentioned (relation context -> has_claim)."),
      field("routes", "string_array", "Route list mentioned (relation context -> has_claim)."),
      field("source", "string", "Data source/program name (relation context)."),
      field("location", "string", "Location wording when stated."),
      field("year", "string_or_number", "Year when stated."),
      field("column_name", "string", "Dataset column name for data-dictionary claims."),
      field("field_name", "string", "Dataset field name for data-dictionary claims."),
      field("position", "number", "Dataset column position for data-dictionary claims."),
      field("non_null_count", "number", "Dataset non-null count for data-dictionary claims."),
      field("null_count", "number", "Dataset null count for data-dictionary claims."),
      field("largest_value", "number", "Dataset largest value for data-dictionary claims."),
      field("existing", "string", "Existing-condition wording in before/after claims."),
      field("proposed", "string", "Proposed-condition wording in before/after claims."),
    ],
    runner_companions: [
      {
        raw: "data_type/change_type",
        companion: "data_type_normalized/change_type_normalized",
        reason: "Claim category labels are open-vocabulary source literals; the runner preserves them and adds normalized companions for grouping.",
      },
    ],
    relation_context_fields: [
      { field: "source", reason: "Source/program names are relation context, not claim type.", suggested_relation: "data_provided_by or part_of_program" },
      { field: "route", reason: "Route ids should link to route records when supported.", suggested_relation: "route has_claim claim when the route endpoint resolves exactly" },
      { field: "routes", reason: "Route arrays should link to route records when supported.", suggested_relation: "route has_claim claim when the route endpoint resolves exactly" },
      { field: "subway_lines", reason: "Subway lines are external service context." },
      { field: "rail_connections", reason: "Rail service names are external service context." },
    ],
    notes: ["claim.data_type and claim.change_type have accepted support for open normalization; sparse claim categories should stay pass-through."],
  },

  metric_claim: {
    observation_kind: "metric_claim",
    global: false,
    summary: "Numeric measurements with units, dimensions, and verbatim source values.",
    anchors: ["metric_name", "raw_value_text", "value", "value_min", "value_max"],
    preferred_fields: [
      "metric_name",
      "raw_value_text",
      "value",
      "value_min",
      "value_max",
      "unit",
      "period",
      "scope",
      "direction",
      "day_type",
      "mode",
      "scenario",
      "comparison",
      "time_period",
      "service_type",
    ],
    fields: [
      field("metric_name", "string", "Metric name (e.g. ridership_change, travel_time_savings)."),
      field("raw_value_text", "string", "Verbatim source value wording (e.g. 'up to 30% faster')."),
      field("value", "number", "Parsed numeric value; use value_min/value_max for ranges."),
      field("value_min", "number", "Parsed range minimum."),
      field("value_max", "number", "Parsed range maximum."),
      field("unit", "string", "Unit literal (runner adds unit_normalized)."),
      field("units", "string", "unit is the dominant raw field; units is sparse and normalized into unit when submitted.", { prefer: "unit" }),
      field("value_unit", "string", "value_unit has only 9 accepted observations; submit one metric per measurement and use unit for the measurement unit.", {
        prefer: "unit",
      }),
      field("currency", "string", "Currency literal for money values."),
      field("change", "number", "Parsed change amount when distinct from value."),
      field("change_unit", "string", "Unit for the change amount."),
      field("period", "string", "Measurement period wording."),
      field("time_period", "string", "Time-period dimension literal."),
      field("comparison_period", "string", "Comparison period wording."),
      field("baseline_year", "string_or_number", "Baseline year when stated."),
      field("year", "string_or_number", "Measurement year when stated."),
      field("date", "string", "Measurement date literal."),
      field("scope", "string", "Measurement scope wording (geography, segment, population)."),
      field("direction", "string", "Direction dimension literal (e.g. increase, eastbound)."),
      field("day_type", "string", "Day-type dimension literal (weekday, weekend, ...)."),
      field("mode", "string", "Mode dimension literal."),
      field("scenario", "string", "Scenario dimension literal."),
      field("comparison", "string_or_number", "Comparison wording or comparator value."),
      field("service_type", "string", "Service-type dimension literal."),
      field("demographic_group", "string", "Demographic-group dimension literal."),
      field("description", "string", "Short description of the measurement."),
      field("context", "string", "Measurement context wording."),
      field("label", "string", "Source label for the measurement row/series."),
      field("category", "string", "Source category label."),
      field("column", "string", "Source table column label."),
      field("code", "string", "Source code label."),
      field("borough", "string", "Borough literal when the measurement is borough-scoped."),
      field("neighborhood", "string", "Neighborhood literal when stated."),
      field("location", "string", "Location wording when stated."),
      field("route", "string", "Route id (relation context -> has_metric)."),
      field("route_label", "string", "Route label (relation context -> has_metric)."),
      field("entity", "string", "Entity name (relation context -> has_metric)."),
      field("source_system", "string", "System/program name (relation context -> has_metric)."),
      field("frequency", "string", "Frequency wording when stated."),
      field("fine_tier", "string", "Fine tier wording for penalty schedules."),
      field("existing_stop_spacing_ft", "number", "Existing stop spacing in feet for redesign rows."),
      field("proposed_stop_spacing_ft", "number", "Proposed stop spacing in feet for redesign rows."),
      field("stops_removed", "number", "Stops removed count for redesign rows."),
      field("total_stops", "number", "Total stops count for redesign rows."),
      field("pilot_value", "number", "Pilot-period value for before/after rows."),
      field("pre_pilot_value", "number", "Pre-pilot value for before/after rows."),
    ],
    runner_companions: [
      {
        raw: "unit",
        companion: "unit_normalized",
        reason: "metric_claim.unit is the dominant raw unit field; the runner adds an open unit/family companion.",
      },
      {
        raw: "direction/day_type/mode/scenario/demographic_group/comparison/time_period/service_type",
        companion:
          "direction_normalized/day_type_normalized/mode_normalized/scenario_normalized/demographic_group_normalized/comparison_normalized/time_period_normalized/service_type_normalized",
        reason: "Frequently occurring metric dimensions are open-vocabulary context, so the runner preserves literals and adds normalized companions.",
      },
      {
        raw: "metric_name/unit/period/category/scope",
        companion: "cost_type/funding_source/time_horizon/benefit_denominator_stated/cause_attribution",
        reason:
          "C4 cost & service-delivery dimensions: cost_type (capital/operating), funding_source, time_horizon, benefit_denominator_stated, and cause_attribution (no_operator/no_vehicle/other) are derived from existing metric signals. Mechanism only — density follows the board-book OCR tranche; closure C5-governed.",
      },
    ],
    relation_context_fields: [
      {
        field: "route_label",
        reason: "43 accepted/canonical route-label observations refer to route entities, not a closed metric enum.",
        suggested_relation: "route has_metric metric_claim when the route endpoint resolves exactly",
      },
      {
        field: "route",
        reason: "Route ids on metric payloads refer to route entities and should become explicit relations when supported.",
        suggested_relation: "route has_metric metric_claim when the route endpoint resolves exactly",
      },
      {
        field: "source_system",
        reason: "26 accepted/canonical observations name systems/programs such as ABLE or camera programs.",
        suggested_relation: "entity/project has_metric metric_claim when the endpoint resolves exactly",
      },
      {
        field: "entity",
        reason: "Agency/entity names should link to entity records when the source supports the relationship.",
      },
    ],
    notes: [
      "Submit one measurement per metric_claim.",
      "Keep the verbatim source value in raw_value_text and parsed numeric value in value/value_min/value_max.",
      "Metric dimensions are open-vocabulary: preserve raw literals and let runner-owned *_normalized companions support grouping.",
    ],
  },

  table: {
    observation_kind: "table",
    global: false,
    deprecated: true,
    summary: "Deprecated: cite source table blocks and submit substantive facts as typed records.",
    anchors: [],
    preferred_fields: [],
    fields: [
      field("table_title", "string", "Source table title."),
      field("caption", "string", "Source table caption."),
      field("description", "string", "Short description of the table."),
    ],
    runner_companions: [],
    relation_context_fields: [],
    notes: ["table records are deprecated; cite source table/table-like blocks and submit substantive facts as non-table records."],
  },

  source_gap: {
    observation_kind: "source_gap",
    global: false,
    summary: "Stated caveats or missing information the source itself flags.",
    anchors: ["gap_kind", "gap_text", "missing_information", "description"],
    preferred_fields: ["gap_kind", "gap_text", "missing_information", "description"],
    fields: [
      field("gap_kind", "string", "Gap kind literal (runner adds gap_kind_normalized)."),
      field("gap_text", "string", "Verbatim gap wording."),
      field("missing_information", "string", "What information is missing."),
      field("description", "string", "Short description of the gap."),
    ],
    runner_companions: [
      {
        raw: "gap_kind",
        companion: "gap_kind_normalized",
        reason: "Source gap kind is preserved raw while gap_kind_normalized maps observed caveat/resolution types to a bounded taxonomy with other as passthrough fallback.",
      },
    ],
    relation_context_fields: [],
    notes: ["Source gaps remain source-scoped caveats until a source-backed resolution decision cites resolving evidence."],
  },

  relation: {
    observation_kind: "relation",
    global: false,
    summary: "Typed edges between records submitted in this or earlier runs.",
    anchors: ["relation_kind", "subject_local_observation_id", "object_local_observation_id"],
    preferred_fields: ["relation_kind", "subject_local_observation_id", "object_local_observation_id", "description"],
    fields: [
      field("relation_kind", "string", "Relation kind (runner adds relation_family; see relation taxonomy)."),
      field("subject_local_observation_id", "string", "Local observation id of the subject record."),
      field("object_local_observation_id", "string", "Local observation id of the object record."),
      field("subject_id", "string", "Canonical record id of the subject (canonicalizer-authored relations only)."),
      field("object_id", "string", "Canonical record id of the object (canonicalizer-authored relations only)."),
      field("description", "string", "Short description of the relationship."),
      field("routes", "string_array", "Route arrays inside relation payloads are relation context and should become endpoint records when important."),
    ],
    runner_companions: [
      {
        raw: "relation_kind",
        companion: "relation_family",
        reason:
          "Relation kind remains a source-facing canonical label; the runner adds relation_family as a bounded grouping taxonomy with other as passthrough fallback for unreviewed labels.",
      },
    ],
    relation_context_fields: [
      { field: "routes", reason: "Route arrays inside relation payloads are relation context and should become endpoint records when important." },
    ],
    notes: [
      "Submit endpoint records before relation records; relation payloads must stay structured.",
      "Use relation_family for broad closed-world filtering; use raw relation_kind and endpoints before approving exact aliases or direction changes.",
    ],
  },
};

export function kindSpec(kind: MtaObservationKind | string): KindSpec | undefined {
  return KIND_SPECS[kind as MtaObservationKind];
}

export function allKindSpecs(): KindSpec[] {
  return Object.values(KIND_SPECS);
}

export function submitToolKinds(): MtaObservationKind[] {
  return allKindSpecs()
    .filter((spec) => !spec.deprecated)
    .map((spec) => spec.observation_kind);
}

/** Derived view kept for callers of the legacy anchors constant shape. */
export function requiredPayloadAnchors(): Partial<Record<MtaObservationKind, string[]>> {
  const anchors: Partial<Record<MtaObservationKind, string[]>> = {};
  for (const spec of allKindSpecs()) {
    if (spec.anchors.length > 0) anchors[spec.observation_kind] = spec.anchors;
  }
  return anchors;
}
