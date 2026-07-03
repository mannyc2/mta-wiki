# Schema Proposal Data Audit - 2026-06-08

This is a deterministic audit of the refreshed Pro schema proposals against `data/identity-review/schema-audit/latest.json`, accepted submission counts, and current canonical JSONL counts. It is not a promotion decision.

## Snapshot

- Proposal run: 2026-06-08T23-52-42-494Z_schema-proposal-run
- Audit run: 2026-06-08T23-52-04-184Z_schema-audit
- Submissions: 2807 total / 2716 accepted / 91 rejected
- Canonical records in audit projection: 2326
- Field decisions: enum=39, relation_context=16, free_text=33, needs_more_data=19, drop=2
- Relation-context field/key suggestions: 48
- Risky enum suggestions by data screen: 24

## Manual Review Verdict

Do not promote the refreshed Pro proposal set wholesale. The run is useful because it corrected the
main ontology mistake in the earlier pass: repeated strings can still be `relation_context`, not
intrinsic enum fields. It is not sufficient as a schema policy because 24 of 39 enum proposals are
thin, mixed-type, or attached to deprecated table records.

Accepted for warn-mode/open normalization only:

- `corridor.borough`, `project.borough`, and metric borough-style fields have enough support for
  borough normalization, but raw literals must remain. `route.borough` is blocked until scalar and
  array usage are split because the field is currently mixed-type.
- `route.route_type`, `route.mode`, `metric_claim.direction`, `metric_claim.day_type`,
  `metric_claim.mode`, `metric_claim.demographic_group`, `metric_claim.scenario`, and
  `metric_claim.label` are reasonable open normalizers. They should not become closed validation
  because the corpus is still growing.
- `claim.data_type` and `claim.change_type` are supported enough to normalize in warnings/reports,
  but they are not core extraction-time schema closures.
- `metric_claim.units` should not become the canonical raw field despite 13 accepted observations.
  The corpus overwhelmingly uses `metric_claim.unit`, so `units` should alias into `unit`, then
  populate `unit_normalized`.

Accepted as relation-context direction:

- Field-level calls such as `claim.source`, `claim.rail_connections`, `metric_claim.route_label`,
  `metric_claim.source_system`, `project.operator`, `project.publisher`, `route.program`,
  `route.operator`, `route.agency`, `route.corridors`, `entity.publisher`, `entity.organization`,
  `entity.owner`, `entity.parent_organization`, and `table.entities` are materially better than
  enum promotion. They should feed relation-candidate/linking work, not hard payload closure.
- Key-level route, agency, publisher, program, partner, organizer, participant, and subway-line
  suggestions are useful as relation-candidate inventory. They are not proof that relation records
  already exist.

Rejected or blocked:

- Every enum in the risky table below is blocked from hard promotion. Some are plausible future
  normalizers, but the current accepted/canonical counts are too small.
- `route.borough` is blocked despite high counts because `value_kind=mixed`; normalize scalar and
  array forms separately first.
- `table.period` is blocked because canonical table records currently materialize to zero records.
  Table content belongs in source blocks and substantive facts should be extracted as non-table
  records.
- Source document classification fields (`content_type`, `document_kind`, `report_type`,
  `source_kind`) are too sparse for closure. Keep them as discovery signals.
- Proposal `drop` calls are not submit-time deletion instructions. At most they mean "do not promote
  to typed schema yet." Source-backed literals such as dates, locations, benefits, goals, and sparse
  descriptive fields should be preserved or migrated deliberately, not discarded because the proposal
  labeled them low-value.

Manual follow-up priorities:

- Keep raw fields and add runner-owned companions for high-coverage normalization targets:
  `metric_claim.unit`, `metric_claim.metric_name`, `event.event_kind`,
  `treatment_component.treatment_kind`, `project.status`, and `project.project_type`.
- Keep accepted/canonical counts in proposal packets and continue warning on zero-accepted or
  mixed-type enum proposals.
- Build relation-candidate tooling for program, agency, publisher, route-list, corridor-list, and
  source-system context before attempting schema enforcement.

## Data Screen

Enums are useful as open normalizers, but should not become hard validation unless they have accepted/canonical support and a stable type shape.

| kind | field | accepted | canonical | accepted_distinct | canonical_distinct | value_kind | reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| claim | existing | 6 | 6 | 2 | 2 | scalar_string | accepted<10 |
| claim | proposed | 6 | 6 | 2 | 2 | scalar_string | accepted<10 |
| claim | claim_type | 4 | 4 | 3 | 3 | scalar_string | accepted<10 |
| claim | capital_improvements | 3 | 3 | 4 | 4 | array_string | accepted<10 |
| corridor | days | 9 | 9 | 2 | 2 | scalar_string | accepted<10 |
| corridor | hours | 9 | 9 | 5 | 5 | scalar_string | accepted<10 |
| corridor | through_access_vehicles | 9 | 9 | 6 | 6 | array_string | accepted<10 |
| corridor | boroughs | 3 | 3 | 4 | 4 | array_string | accepted<10 |
| corridor | direction | 3 | 3 | 2 | 2 | scalar_string | accepted<10 |
| entity | jurisdiction | 4 | 4 | 1 | 1 | scalar_string | accepted<10 |
| entity | borough | 3 | 3 | 3 | 3 | scalar_string | accepted<10 |
| metric_claim | service_type | 9 | 9 | 4 | 4 | scalar_string | accepted<10 |
| metric_claim | value_unit | 9 | 9 | 3 | 3 | scalar_string | accepted<10 |
| metric_claim | frequency | 5 | 5 | 2 | 2 | scalar_string | accepted<10 |
| metric_claim | provider | 2 | 2 | 2 | 2 | scalar_string | accepted<10 |
| metric_claim | temporal_context | 2 | 2 | 2 | 2 | scalar_string | accepted<10 |
| project | boroughs | 2 | 2 | 2 | 2 | array_string | accepted<10 |
| route | borough | 78 | 67 | 5 | 5 | mixed | mixed-type |
| source | content_type | 6 | 6 | 3 | 3 | scalar_string | accepted<10 |
| source | document_kind | 3 | 3 | 3 | 3 | scalar_string | accepted<10 |
| source | report_type | 2 | 2 | 2 | 2 | scalar_string | accepted<10 |
| source | source_kind | 2 | 2 | 2 | 2 | scalar_string | accepted<10 |
| source_gap | gap_kind | 4 | 4 | 4 | 4 | scalar_string | accepted<10 |
| table | period | 4 | 0 | 2 | 0 | scalar_string | accepted<10, canonical=0 |

## Relation Context Wins

These suggestions align with the ontology direction: normalize values if useful, but model the semantics as relations or relation candidates rather than intrinsic identity fields.

| kind | field | decision | accepted | canonical | value_kind | rationale |
| --- | --- | --- | --- | --- | --- | --- |
| claim | new_routes_added | key:relation_context | 1 | 1 | array_string | List of added route IDs, references external route entities. |
| claim | new_streets | key:relation_context | 1 | 1 | array_string | Street names; relation to external geographic features. |
| claim | new_terminal | key:relation_context | 1 | 1 | scalar_string | Terminal description relates to external location reference. |
| claim | rail_connections | relation_context | 3 | 3 | array_string | Rail service names (e.g., LIRR, Metro-North) are external entities, not a closed enum. |
| claim | route | key:relation_context | 14 | 14 | scalar_string | Single route identifier referencing external route entity. |
| claim | routes | key:relation_context | 8 | 8 | array_string | List of route IDs; multiple external references. |
| claim | sbs_connections | key:relation_context | 1 | 1 | array_string | References to SBS routes, external entities. |
| claim | source | relation_context | 15 | 15 | scalar_string | Program/initiative or survey source name; relates to external entity, not an identity enum. |
| claim | strategies | key:relation_context | 1 | 1 | array_string | Strategy names reference external program/initiative entities. |
| claim | streets | key:relation_context | 1 | 1 | array_string | Street names; external geographic references. |
| claim | subway_lines | key:relation_context | 4 | 4 | array_string | Subway line identifiers, relation to external services. |
| claim | system | key:relation_context | 1 | 1 | scalar_string | System name ('OMNY') is external payment system reference. |
| claim | tactics | key:relation_context | 1 | 1 | array_string | Tactic names reference external plan elements. |
| corridor | routes | key:relation_context | 10 | 10 | array_string | List of bus routes serving corridor; relation to route entities, not corridor identity. |
| corridor | routes_served | key:relation_context | 10 | 10 | array_string | Another list of served routes; relation to routes. |
| entity | agency | key:relation_context | 2 | 2 | scalar_string | agency name, relation context |
| entity | office | relation_context | 2 | 2 | scalar_string | office names are relation context |
| entity | organization | relation_context | 4 | 4 | scalar_string | organization names are relation context |
| entity | owner | relation_context | 2 | 2 | scalar_string | owner names are relation context |
| entity | parent_entity | key:relation_context | 2 | 2 | scalar_string | parent entity name, relation context |
| entity | parent_organization | relation_context | 2 | 2 | scalar_string | organization names are relation context |
| entity | publisher | relation_context | 10 | 4 | mixed | publisher names are relation context, not an enum |
| event | organizers | key:relation_context | 1 | 1 | array_string | List of organizing agencies/entities, relation context. |
| event | participants | key:relation_context | 1 | 1 | array_string | List of participants, relation context. |
| event | stations_affected | key:relation_context | 1 | 1 | array_string | List of station identifiers, relation context. |
| metric_claim | entity | key:relation_context | 1 | 1 | scalar_string | Name of transit agency; relation context. |
| metric_claim | route_label | relation_context | 43 | 43 | scalar_string | Route identifiers; relation context linking to route entities. |
| metric_claim | source_system | relation_context | 26 | 26 | scalar_string | Names of source programs/systems; relation context. |
| project | agency | key:relation_context | 1 | 1 | scalar_string | Agency name; relation context. |
| project | implementing_agency | key:relation_context | 1 | 1 | scalar_string | Agency name; relation context. |
| project | lead_agency | key:relation_context | 1 | 1 | scalar_string | Agency name; relation context. |
| project | operator | relation_context | 5 | 5 | scalar_string | Operator is an agency name, better modeled as a relation context, not a closed enumeration. |
| project | partner_agency | key:relation_context | 1 | 1 | scalar_string | Partner agency name; relation context. |
| project | partners | key:relation_context | 1 | 1 | array_string | List of partner agencies; relation context. |
| project | program | key:relation_context | 1 | 1 | scalar_string | Program name; relation context. |
| project | publisher | relation_context | 3 | 3 | scalar_string | Publisher is an organizational entity, relation context. |
| project | routes_served | key:relation_context | 24 | 24 | array_string | List of route identifiers; relation context. |
| project | subway_lines | key:relation_context | 1 | 1 | array_string | List of subway line identifiers; relation context. |
| relation | routes | key:relation_context | 1 | 1 | array_string | Array of route identifiers (e.g., Bx5, M100); represents routes involved in the relation, suitable as relation context. |
| route | agency | relation_context | 2 | 2 | scalar_string | Agency name (Bee-Line Bus System) is relation context. |
| route | corridors | relation_context | 2 | 2 | array_string | List of corridor names is relation context, not a stable enumeration. |
| route | operator | relation_context | 4 | 4 | scalar_string | Operator name (MTA) is relation context, not a fixed enumeration. |
| route | program | relation_context | 21 | 21 | scalar_string | Program name (ABLE) is relation context, not a stable enumeration. |
| route | related_existing_routes | key:relation_context | 3 | 3 | array_string | List of related routes is relation context, not a fixed enumerable set. |
| route | route_id_authority | key:relation_context | 0 | 10 | empty | Name of the authority/source system, relation context. |
| route | source_route_surface | key:relation_context | 0 | 10 | empty | Source system identifier surface, relation context. |
| source | publisher | key:relation_context | 39 | 39 | scalar_string | Entity name of publisher, high coverage, contextual. |
| table | entities | relation_context | 3 | 0 | array_string | Agency names (MTA Bus, NYCT, SIR) are relation‑context, not an enumeration. |

## Promotion Guidance

- Do not hard-promote any enum in the risky table. Keep these as warn-mode/open normalizers at most,
  and only after a field-specific raw/normalized policy exists.
- Treat `route.borough` as blocked for enum enforcement until scalar/array usage is split; the proposal warning is data-backed.
- Treat table proposals as discovery-only while canonical `table` records are currently deprecated/materialized to zero records.
- The relation-context suggestions are the most valuable part of the rerun and should feed relation-candidate tooling, not direct schema closure.
- Next deterministic work should focus on high-coverage raw fields (`metric_claim.unit`, `metric_claim.metric_name`, `event.event_kind`, `treatment_component.treatment_kind`, `project.status`, `project.project_type`) using raw+normalized companion fields.
