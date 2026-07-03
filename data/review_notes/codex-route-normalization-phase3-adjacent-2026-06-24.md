# Route Normalization Phase 3 Adjacent Identity/Ontology - 2026-06-24

## Baseline

- Continued the active Codex-only deterministic normalization/dedupe/canonicalization goal after Phase 2 route work.
- Re-baseline validation before adjacent work: `bun packages/cli/src/cli.ts validate` clean, `Issues: 0`, `83963` canonical records, `7354` wiki pages.
- Route page-policy checkpoint persisted: `321` route records; `wiki/routes/route_15-express-bus-battery-pl.md` remains absent after materialization.

## Subagent Lanes

- `adjacent_non_route_identity_hotspots`: completed read-only subagent `019ef9a9-246d-7393-9596-908e6fb50f79` / Huygens.
- `adjacent_ontology_normalization_hotspots`: completed read-only subagent `019ef9a9-409b-7472-948c-1699ca3454e7` / Kepler.
- `project_program_identity_review_followup`: completed read-only subagent `019ef9c4-ac8b-72e1-b019-6e45f400a305` / Copernicus.
- `relation_treatment_family_followup`: completed read-only subagent `019ef9c4-c3c8-7f30-91ec-dc912e70074a` / Cicero.
- `treatment_bus_stop_family_followup`: completed read-only subagent `019ef9d0-294a-75e1-b906-95a5d134497b` / Harvey.
- `route_page_policy_followup`: completed read-only subagent `019ef9d0-471b-7d12-ae47-2876d9fe51e4` / Confucius.
- `residual_route_identity_alias_audit`: completed read-only subagent `019ef9df-ca31-7173-b1a5-044521d0ab03` / Kierkegaard.
- `residual_adjacent_identity_ontology_audit`: completed read-only subagent `019ef9df-f736-70d1-8b85-f59b855b542d` / Schrodinger.
- `entity_child_unit_alias_audit`: completed read-only subagent `019ef9f1-869a-7051-b57f-74cf797925d1` / Laplace.
- `corridor_identity_review_noise_audit`: completed read-only subagent `019ef9f1-7cc8-78d3-8eca-3f06e85c252d` / Pasteur.
- `residual_relation_serves_entity_audit`: completed read-only subagent `019efb2f-5cb8-78c2-874f-463cb5ecd821` / Wegener.
- `identity_review_do_not_merge_suppression_audit`: completed read-only subagent `019efc81-3378-7830-8ba9-bf1445fd26c8` / Galileo.
- `identity_review_remaining14_override_audit`: completed read-only subagent `019efc8a-350f-7ae3-97ef-03f78ad4489d` / Boyle.
- `residual_relation_tail_ptasp_system_audit`: completed read-only subagent `019efc92-a07e-7891-b331-10d375cefc7d` / Hooke.

## Implemented Slice

Kepler identified two safe project-ontology fixes:

- `normalizeProjectStatus()` now maps common board-approval, award, active, and implemented literals without changing raw `status`.
- `mergePayload()` now promotes concrete runner-owned companion values over an earlier `"other"` only for `document_time_status` and `project_family`, while preserving both values in `_merged_field_values`.

Huygens identified a safe identity guardrail:

- Explicit `target_record_id` submissions no longer donate unrelated name-derived aliases as strong canonical aliases. They may retain the explicit target alias or aliases that already resolve to the target, but a targeted submission with LIRR text cannot add `entity_lirr` aliases to `entity_mta-nyct`.
- Materialization surfaced one remaining parent-vs-department collision (`entity_meeting-doc-64066-mta` vs `entity_meeting-doc-ddcr` on `entity_mta`), resolved with a narrow do-not-merge guard because MTA is the parent agency and DDCR is a department.
- Community-board entity keys now prune generic `entity_community-board-N` aliases when borough context is known and use borough-qualified keys instead. Community-board committees are excluded from parent-board keys so committee records do not create false duplicate pressure against their parent boards.
- Deterministic materialization surfaced same-borough community-board duplicate pressure; exact same-board duplicates for Brooklyn CB5, Manhattan CB4/CB5/CB12, Queens CB7, and Queens CB9 were resolved through identity merge overrides. The Bronx CB2 committee-vs-board case was resolved by the committee key guardrail, not a merge.

Copernicus confirmed a safe identity-review parser follow-up:

- Project `program` values remain visible as packet context but no longer create candidate edges or union review clusters. The stale generated artifacts had `64` program-only project edges; deterministic `identity-review` regeneration now reports `133` candidate edges, `75` clusters, and no `shared_program_value` / `project_program:` strings.

Cicero identified a safe relation-family-only ontology slice:

- Organization hierarchy relation literals (`parent_organization`, `has_subsidiary`, `subsidiary_of`, `parent_of`, `parent_entity`) now normalize to `relation_family: organization_hierarchy` without changing raw `relation_kind` or endpoint direction.
- `normalizeRelationPayload()` promotes runner-owned `relation_family: "other"` to the computed concrete family but preserves any existing non-`other` family. Deterministic materialization moved the targeted `112` hierarchy relations out of `other`.

Harvey identified a safe exact-token treatment-family slice:

- Exact bus stop/boarding treatment literals now normalize to `treatment_family: bus_stop_or_boarding` without generic `station` matching. The mapping covers audited tokens such as `sbs_station`, `bus_station`, `bus_pad`, `bus_shelter`, `bus_lay_by`, `limited_stops`, stop consolidation/removal/relocation/optimization, and related SBS/BRT station-stop tokens.
- `normalizeTreatmentPayload()` promotes runner-owned `treatment_family: "other"` to the computed concrete family and replaces the single legacy non-canonical `shelters_and_benches` family with `bus_stop_or_boarding`; existing concrete canonical families remain preserved.

Confucius completed the route aggregate/split page-policy follow-up:

- No additional page suppression is safe beyond the existing `data_only_scope` policy. Current scope counts are `true_route: 290`, `aggregate_list_context: 10`, `split_candidate: 20`, and `data_only_scope: 1`.
- Aggregate/list and split-candidate route pages remain page-bearing because suppressing them would delete substantial writer regions on pages such as `route_m34-sbs`, `route_q52-sbs-queens`, `route_q53-sbs-ace`, `route_utica-ave-sbs`, and `route_125th-laguardia-sbs`.

Kierkegaard completed a residual route identity audit:

- Letter-suffixed bus-route aliases such as `route_b103e`, `route_b82e`, and `route_q20a` were still carrying stale base aliases such as `route_b103`, `route_b82`, and `route_q20` through `record_aliases`.
- `pruneGenericRouteKeys()` now removes a generic bus base key when a same-record letter-suffixed bus key is present. Regression coverage targets `identityKeysForRecord()` because the issue came from canonical aliases, not fresh submission input.

Schrodinger completed a residual adjacent identity/ontology audit:

- Five exact organization-hierarchy relation literals (`parent_subsidiary`, `parent_agency`, `parent_agency_of`, `is_subsidiary_of`, `subsidiary`) now map to `relation_family: organization_hierarchy`, moving 20 additional records out of `other`.
- Project companion replay normalization was tightened so stale `document_time_status: other` values in old journals are promoted during deterministic replay when a concrete status can be derived. Percent-complete statuses now preserve partial progress as `active` while `100% complete` maps to `implemented`.

Laplace completed an entity child-unit alias audit:

- `agency_name` is now treated as parent/relation context, not a strong identity alias, when the entity is clearly a child unit, department, division, bureau, board, committee, office, unit, team, staff, role, or position and the agency name differs from the entity's own identity surface.
- Regression coverage protects examples such as Department of Subways inheriting `entity_mta-nyct` and NYPD Transit Bureau inheriting `entity_new-york-city-police-department`; true agency records with matching acronym aliases, such as NYC DOT/NYCDOT, still keep those aliases.

Pasteur completed a corridor identity-review noise audit:

- Deterministic identity-review no longer emits same-street corridor candidate edges when boroughs contradict, limits contradict, or one side is a multi-street aggregate `streets[]` list. Canonical corridor IDs were not changed in this slice.
- Candidate review pressure dropped from `133` edges / `75` clusters to `91` edges / `56` clusters while validation, duplicate identity, and endpoint-shape issue counts remained zero.

Direct relation-family cleanup loop:

- Exact agency-role, publication-role, and funding/contract relation literals now normalize to bounded families. This moved `relation_family: other` from `2886` to `2263`.
- Exact agenda/timeline, route-scope, corridor-scope, location-scope, and treatment-context literals then moved `relation_family: other` from `2263` to `2081`.
- Exact participation/partnership, agency-role, governance/legal, and funding/agreement/procurement role literals then moved `relation_family: other` from `2081` to `1385`.
- Exact project/program scope, publication/reporting, organization hierarchy, funding/agreement/counterparty, agency-role, claim-context, and dependency/predecessor relation literals then moved `relation_family: other` from `1385` to `1040`. The targeted `345` records all now carry bounded families and preserve raw `relation_kind`.
- Exact timeline/event-at-meeting, governance/approval/authorization, funding/agreement/contract, agency-role, partnership/joint-venture, publication/source-context, project-scope, corridor-scope, and route-stop treatment-context literals then moved `relation_family: other` from `1040` to `845`. The targeted `195` records all now carry bounded families and preserve raw `relation_kind`.
- Additional exact organization hierarchy, agency/staff-role, publication/source-context, project-scope, partnership, governance, funding/agreement, route/corridor-scope, and dependency/reference literals then moved `relation_family: other` from `845` to `694`. The targeted `151` records all now carry bounded families and preserve raw `relation_kind`.
- Exact service/provider relation literals then moved `relation_family: other` from `694` to `626`. The targeted `68` records now carry bounded families and preserve raw `relation_kind`: `provides_service_to`, `provides_service_for`, `provides_service`, `provides_services_for`, `provides_security_for`, `performs_audit`, and `performed_services_for` classify as `agency_role`; `service_provider`, `has_service_provider`, `supplies`, `contracted_vendor`, `subcontracted_by`, and `engaged_as` classify as `funding_award`.
- Exact funding/contract, agency-role, governance/legal, timeline/event, program/project, metric, claim, and dependency/reference relation literals then moved `relation_family: other` from `626` to `550`. The targeted `76` records now carry bounded families and preserve raw `relation_kind`: `30` agency-role, `18` funding-award, `13` timeline-context, `5` program-project-scope, `5` governance-legal, `2` metric-context, `2` claim-context, and `1` dependency/reference.
- Exact route/location/data/publication/timeline, ownership, partnership/advisory, funding/payment/procurement, and dependency/lifecycle relation literals then moved `relation_family: other` from `550` to `468`. The targeted `82` records now carry bounded families and preserve raw `relation_kind`; broad overloaded labels such as `serves`, `affects`, `includes`, `applies_to`, `uses`, and `connects_to` remain intentionally unmapped pending endpoint-aware handling.
- Six residual exact relation literals then moved `relation_family: other` from `468` to `450`: `implements_for`, `operated_on`, and `works_at` now classify as `agency_role`; `aggregates` as `organization_hierarchy`; `has_section` as `publication_role`; and `authorizes` as `governance_legal`. The targeted `18` records now carry bounded families and preserve raw `relation_kind`; endpoint-overloaded labels such as `affects`, `includes`, `serves`, and `applies_to` remain deferred for a dedicated endpoint-aware rule path.
- Endpoint-shape inference then moved `relation_family: other` from `450` to `401` after relation endpoint resolution. The targeted `49` ambiguous-label records now carry bounded families while preserving raw `relation_kind`: route-object `affects`/`connects_to` records classify as `route_scope`; route-to-corridor `serves` records classify as `corridor_scope`; selected `includes` source/metric, source/claim, event/event, project/project, and source/entity shapes classify as metric, claim, timeline, program/project, and publication context; `has_location` entity/entity records classify as `location_scope`; `assigned_rating` entity/metric records classify as `metric_context`; `has_reported_item` entity/event records classify as `timeline_context`; and `has_connecting_service` entity/entity records classify as `partnership_engagement`.
- A second endpoint-shape slice then moved `relation_family: other` from `401` to `393`: `replaces`/`replaced` route-to-route records now classify as `route_scope`; `changes_route_service` and `creates_route` project-to-route records classify as `route_scope`; and `applies_to_corridor` project-to-corridor records classify as `corridor_scope`.
- Exact residual relation literals then moved `relation_family: other` from `393` to `362`. The targeted `31` records now carry bounded families for governance/legal, funding/agreement, organization hierarchy, agency role, partnership, dependency/reference, and route-scope labels while preserving raw `relation_kind`.
- Exact residual `has_*` and related context relation literals then moved `relation_family: other` from `362` to `319`. The targeted `43` records now carry bounded families for organization hierarchy, publication role, agency role, funding/contract, governance/legal, program/project, route-scope, timeline, claim-context, and location-scope labels while preserving raw `relation_kind`; broad overloaded labels remain intentionally unmapped.
- Exact role/context relation literals plus narrow endpoint-aware `presented` inference then moved `relation_family: other` from `319` to `288`. The targeted `31` records now carry bounded families for agency/person-role, metric-context, funding, governance/legal, organization hierarchy, route-scope, partnership, publication-role, and timeline-context labels; bare `presented` remains unmapped unless endpoint shapes prove metric or timeline context.
- Additional exact role/legal/contract/ownership/partnership/data/publication/timeline relation literals plus narrow endpoint-aware `prepared` inference then moved `relation_family: other` from `288` to `254`. The targeted `34` records now carry bounded families while preserving raw `relation_kind`; bare `prepared` remains unmapped unless endpoint shapes prove an `entity -> source` publication relation.
- Endpoint-aware broad-label relation inference then moved `relation_family: other` from `254` to `223`. The targeted `31` records now carry bounded timeline or publication families when resolved endpoint shapes prove event/timeline or document/publication context; broad project/entity and entity/entity `serves`, `affects`, and `applies_to` shapes remain intentionally unmapped.
- Exact and endpoint-aware tail relation inference then moved `relation_family: other` from `223` to `180`. The targeted `44` records now carry bounded governance/legal, funding/contract, agency-role, data-reporting, dependency/reference, publication/document, and timeline/event families while preserving raw `relation_kind`; broad service/scope labels remain intentionally unmapped.
- Exact and endpoint-aware role/context relation inference then moved `relation_family: other` from `180` to `165`. The targeted `15` records now carry bounded families for ownership, agency work/service roles, partnership, procurement, timeline-event support, route-treatment context, dependency/reference infrastructure use, and only resolved `event -> route` `connects_to` edges. Broad service/scope labels such as `serves`, `serves_entity`, project/entity `connects_to`, `affects`, `applies_to`, and `has_associated_entity` remain intentionally unmapped.
- Exact and endpoint-aware dependency/governance/agency relation inference then moved `relation_family: other` from `165` to `144`. The targeted `21` records now carry bounded families for agency work/selection/support roles, governance/legal review and requirements, dependency/reference links, location proximity, and only resolved `entity -> treatment_component` `uses` edges. Broad service/scope labels remain intentionally unmapped.
- Exact residual role/governance/dependency relation literals then moved `relation_family: other` from `144` to `132`. The targeted `12` records now carry bounded families for `proposed_as` and `serves_agency` agency-role labels, `resolved_in_favor_of` governance/legal resolution support, and `supplements` dependency/reference context while preserving raw `relation_kind`.
- Endpoint-aware claim-context relation inference then moved `relation_family: other` from `132` to `124`. The targeted `8` records classify only resolved `route -> claim` `connects_to` and resolved `entity -> claim` labels (`has_location`, `has_relation`, `has_relation_to`, `provides`, `receives`) as `claim_context`; the same broad labels remain unmapped in non-claim endpoint shapes.
- Exact and endpoint-aware service/rating/reporting relation inference then moved `relation_family: other` from `124` to `114`. The targeted `10` records classify exact `includes_service` as `program_project_scope`, exact `assigned_rating` as `metric_context`, exact `has_presence_in` and `receives_reports_from` as `agency_role`, resolved `entity -> metric_claim` `proposes` as `metric_context`, and resolved `entity -> claim` `performs` as `claim_context`.
- Endpoint-aware project-context relation inference then moved `relation_family: other` from `114` to `112`. The targeted `2` records classify only resolved `claim -> project` `has_related_project` as `program_project_scope`; same-label `project -> entity` records remain deferred.
- Exact/endpoint-aware location and corridor relation inference then moved `relation_family: other` from `112` to `110`. The targeted `2` records classify exact `adjacent_to` as `location_scope` and only resolved `project -> corridor` `has_description` as `corridor_scope`.
- Exact cross-reference relation inference then moved `relation_family: other` from `110` to `108`. The targeted `2` records classify exact `related_entity` as `dependency_or_reference` while preserving raw `relation_kind`.
- Endpoint-aware inclusion relation inference then moved `relation_family: other` from `108` to `105`. The targeted `3` records classify resolved `entity -> entity` `included_in` as `dependency_or_reference`; resolved `entity -> source` `included_in` remains `publication_role`.
- Exact service-entity relation inference then moved `relation_family: other` from `105` to `92`. The targeted `13` residual `serves_entity` records now classify as `agency_role`, matching adjacent exact labels such as `serves_agency` while preserving raw `relation_kind`.
- Exact real-estate action relation inference then moved `relation_family: other` from `92` to `91`. The targeted `1` residual `has_real_estate_action` record now classifies as `ownership_role`, matching adjacent property ownership/acquisition labels while preserving raw `relation_kind`.
- Payload-aware data-portal relation inference then moved `relation_family: other` from `91` to `88`. The targeted `3` residual `uses` records now classify as `data_reporting` only when resolved object ids are known Open Data or metrics portal identities; non-portal `uses` records remain `other`.
- Payload-aware lease/license counterparty relation inference then moved `relation_family: other` from `88` to `86`. The targeted `2` residual `has_entity` records now classify as `funding_award` only when resolved `project -> entity` relations have description text proving lease/license counterparty context.
- Payload-aware cost/expense inclusion relation inference then moved `relation_family: other` from `86` to `85`. The targeted `1` residual bare `includes` record now classifies as `funding_award` only when resolved `entity -> entity` relations have description text proving expense/cost inclusion context.
- Endpoint-aware document-scope relation inference then moved `relation_family: other` from `85` to `84`. The targeted `1` residual `applies_to` record now classifies as `publication_role` only for resolved `source -> entity` document/policy scope; other `applies_to` endpoint shapes remain `other`.
- Exact project-scope relation inference then moved `relation_family: other` from `84` to `83`. The targeted `1` residual `has_project_scope` record now classifies as `program_project_scope` while preserving raw `relation_kind`.
- Exact savings/beneficiary relation inference then moved `relation_family: other` from `83` to `82`. The targeted `1` residual `results_in_savings_for` record now classifies as `funding_award` while preserving raw `relation_kind`.
- Exact project-feature relation inference then moved `relation_family: other` from `82` to `81`. The targeted `1` residual `has_project_feature` record now classifies as `program_project_scope` while preserving raw `relation_kind`.
- Exact legal-name relation inference then moved `relation_family: other` from `81` to `80`. The targeted `1` residual `has_legal_name` record now classifies as `governance_legal` while preserving raw `relation_kind`.
- Payload-aware property-license use relation inference then moved `relation_family: other` from `80` to `79`. The targeted `1` residual `uses` record now classifies as `funding_award` only when resolved `entity -> entity` relations have description text proving lease/license use of property; ordinary system-use records remain `other`.
- Exact budget new-need relation inference then moved `relation_family: other` from `79` to `78`. The targeted `1` residual `has_new_need` record now classifies as `funding_award` while preserving raw `relation_kind`.
- Payload-aware prepared-document relation inference then moved `relation_family: other` from `78` to `77`. The rule covers `2` `prepared` records as `publication_role` only when resolved `entity -> entity` relations have description text proving document, guideline, report, plan, or budget preparation.
- Endpoint-aware project/entity rail-territory scope inference then moved `relation_family: other` from `68` to `64`. The targeted `4` residual `applies_to` records now classify as `location_scope` only when resolved `project -> entity` relations have description text proving rail line or rail territory scope; descriptionless PTASP department-scope records and ACE route-list expansion records remain unresolved.
- Payload-aware associated-entity agreement/acquisition inference then moved `relation_family: other` from `64` to `59`. The targeted `5` residual `has_associated_entity` records now classify as `funding_award` only when resolved `project -> entity` or `entity -> entity` relations have description text proving lease, agreement, contract, easement, or acquisition context; generic association and involvement records remain unresolved.
- Payload-aware entity/entity lease-license `serves` inference then moved `relation_family: other` from `59` to `55`. The targeted `4` residual `serves` records now classify as `funding_award` only when resolved `entity -> entity` relations have description text proving lease or license context; ordinary facility/customer/service `serves` records remain unresolved.
- Payload-aware project/entity contract-services `serves` inference then moved `relation_family: other` from `55` to `51`. The targeted `4` residual `serves` records now classify as `funding_award` only when resolved `project -> entity` relations have description text proving contract or maintenance-services context; medical-benefits coverage and ordinary service-scope records remain unresolved.
- Payload-aware entity/entity served-location `serves` inference then moved `relation_family: other` from `51` to `46`. The targeted `5` residual `serves` records now classify as `location_scope` only when resolved non-self `entity -> entity` relations have served-object or description text proving terminal, station, stadium, arena, field, MSG, Barclays, or Citi Field location scope; self-referential terminal route-count artifacts remain unresolved.
- Payload-aware associated-entity vendor/service inference then moved `relation_family: other` from `46` to `43`. The targeted `3` residual `has_associated_entity` records now classify as `funding_award` only when resolved `entity -> entity` relations have description text proving benefits-manager or service-vendor context; generic association records remain unresolved.
- Payload-aware customer-service `serves` inference then moved `relation_family: other` from `43` to `37`. The targeted `6` residual `serves` records now classify as `agency_role` only when resolved `entity -> entity` relations have a customer-services/service-communications subject or description text saying the unit keeps customers informed; ordinary `serves` records remain unresolved.
- Payload-aware station/place `operates_at` inference then moved `relation_family: other` from `37` to `36`. The targeted `1` residual `operates_at` record now classifies as `location_scope` only when resolved `entity -> entity` relations have description text naming a station, terminal, stadium, arena, or field location signal; generic operation text remains unresolved.

Direct treatment-family cleanup loop:

- Exact customer-information, vehicle/fleet, service-pattern, bus-lane, traffic-restriction, pedestrian/accessibility, and roadway capital/infrastructure treatment literals moved `treatment_family: other` from `463` to `378`.
- Exact elevator/stair accessibility, fare/payment, curb delivery-window, bus-lane/bollard, passenger-information, vehicle/fleet, and safety/security treatment literals moved `treatment_family: other` from `378` to `345`.
- Exact bus/SBS/BRT station-amenity treatment literals (`improved_station_amenities`, `station_amenities`, `enhanced_stations`) moved `treatment_family: other` from `345` to `333`.
- Exact low-floor/articulated bus fleet, pantograph dispenser, bus interior, information display, passenger counting, limited-stop discontinuation, bus layover, quick/qwik curb, and Leading Bus Interval literals moved `treatment_family: other` from `333` to `317`.
- Exact transitway, roadway/lane design, upgraded crosswalk, detectable/tactile warning strip, wide-aisle gate, hearing loop, Help Point, NaviLens, MTA Trip Planner, digital information screen, and wayfinding sign literals moved `treatment_family: other` from `317` to `289`.
- Exact station/entrance/lighting/restroom infrastructure and access literals (`station_improvement`, `station_lighting`, `station_lighting_upgrade`, `lighting_upgrade`, `led_lighting`, `canopy_installation`, `restroom_improvement`, `station_building_improvement`, `station_enhancement`, `new_entrance`, `entrance_reconfiguration`, and `help_point_installation`) moved `treatment_family: other` from `289` to `263`.
- Exact rail/bridge/flood/drainage and fixed infrastructure asset-work literals (`communications_based_train_control`, `ultrasonic_rail_testing`, `track_maintenance`, `grade_crossing_replacement`, `crossing_renewal`, `switch_installation`, `autonomous_track_inspection`, `positive_train_control_data_radios`, substation labels, bridge/structural rehabilitation/replacement, flood protection/wall, drainage/catch-basin/sewer/surfacing work, and fire-suppression replacement) moved `treatment_family: other` from `263` to `229`.
- Exact customer-information, fare/toll-collection, vehicle/fleet, bus-lane, traffic-restriction, and pedestrian/accessibility literals moved `treatment_family: other` from `229` to `196`; the slice covers real-time/passenger information, public-address/customer-display and passenger-counting labels; ticket/pre-payment/revenue-recovery/tolling labels; low-floor fleet, operator-protection/barrier, enclosed compartment, and bus-design labels; bus contra-flow, bus-and-truck-only lane, physical-separation, and bollard labels; one-way bus tunnel; and elevator/ramp/crossing/refuge-island labels.
- Exact street geometry, resurfacing, curb, slip-lane, pedestrian/public-realm, safety, and marking literals moved `treatment_family: other` from `196` to `165`; the slice covers road/street reconfiguration, resurfacing, pavement replacement, street treatment, new two-way operation, raised vents, No Standing regulation, taxi stand relocation, slip-lane changes, public realm/walkability/greening/tree/crossing/raised-step labels, speed bumps, and stop-bar recess.
- Exact safety/security, service-pattern, bus-stop, and traffic-restriction literals plus precise component/type fallback moved `treatment_family: other` from `165` to `143`. Broad `bus_priority` remains unmapped by itself, while concrete component/type values such as `bus_boarder`, bus-lane, protected-bus-lane, and queue-jump/TSP payloads now classify deterministically.
- Exact concrete infrastructure, safety/security, fare-system, accessibility, rail/track inspection, and vehicle/fleet technology treatment literals moved `treatment_family: other` from `143` to `103`. The targeted 40 records cover labels such as `back_office_system`, `backflow_prevention`, `cut_and_cover_excavation`, `electric_substation_construction`, `elevator_installation_and_replacement`, `gate_guards`, `high_security_fencing`, `laser_train`, `power_system_upgrade`, `rail_washer_train`, `station_construction`, `substation_feeders`, `track_geometry_inspection`, `tunnel_sealing`, and `yard_improvement`. Broad/context-dependent labels such as `technology`, `hardware_upgrade`, generic `sensor`, cleaning-only initiatives, and SBS/BRT composite labels remain intentionally unmapped.
- Exact street-operation and design treatment literals moved `treatment_family: other` from `103` to `96`. The targeted 7 records map `street_closure`, `shared_street`, and `regulation_change` to `traffic_restriction`, `station_design` to `bus_stop_or_boarding`, and `transit_boulevard_design` to `capital_or_infrastructure`.
- Exact/component-fallback treatment literals moved `treatment_family: other` from `96` to `91`. The targeted 5 records map `predictive_maintenance`, `station_renewal_cleaning`, and `paint_removal` to `capital_or_infrastructure`, `encampment_removal` to `safety`, and the precise `bus_validator_mounting_bracket` component to `vehicle_or_fleet` while broad `hardware_upgrade` remains unmapped.
- Exact component-fallback street-priority treatment evidence moved `treatment_family: other` from `91` to `90`. The targeted record maps precise `component_kind: transit_freight_priority_street` to `traffic_restriction` while broad `bus_priority` remains unmapped by itself.
- Payload-aware physical-modification treatment evidence moved `treatment_family: other` from `90` to `87`. The targeted 3 records map only anti-back-cocking, delayed-egress, and turnstile sleeve/fin `physical_modification` descriptions to `safety`; generic physical modifications remain unmapped.
- Payload-aware generic station treatment evidence moved `treatment_family: other` from `87` to `83`. The targeted 4 records map only SBS/BRT/curbside bus-station descriptions with boarding features such as shelters, fare machines, passenger information, or bus bulbs to `bus_stop_or_boarding`; bare generic station labels remain unmapped.
- Payload-aware vertical-circulation repair evidence moved `treatment_family: other` from `83` to `65`. The targeted 18 records map only broad `repair` payloads with `ESC` asset ids or escalator-specific part signals such as step chains, comb plates, gear boxes, handrails, frequency drives, reverse-phase relays, or emergency-stop repairs to `pedestrian_or_accessibility`; generic warranty, valve, and unproven repair records remain unmapped.
- Payload-aware cross-section street-layout evidence moved `treatment_family: other` from `65` to `60`. The targeted 5 records map only `cross-section` payloads whose description proves existing/proposed street-layout design to `capital_or_infrastructure`; generic cross-section artifacts remain unmapped.
- Payload-aware transit-priority curbside-stop evidence moved `treatment_family: other` from `60` to `57`. The targeted 3 records map only `transit priority` / `Targeted transit priority treatments` payloads whose description proves improved curbside bus stops to `bus_stop_or_boarding`; broad transit-priority labels and `No bus lanes` wording remain unmapped as bus-lane evidence.
- Payload-aware pedestrian/public-realm addition evidence moved `treatment_family: other` from `57` to `55`. The targeted 2 records map only broad `addition` payloads whose descriptions prove raised crosswalks or additional crossings plus street trees to `pedestrian_or_accessibility`; generic additions remain unmapped.
- Payload-aware gate-guard deployment evidence moved `treatment_family: other` from `55` to `54`. The targeted record maps only broad `deployment` payloads whose description proves gate-guard deployment to `safety`; generic deployments remain unmapped.
- Payload-aware pedestrian-overpass license/easement evidence moved `treatment_family: other` from `54` to `52`. The targeted 2 records map only `construction license` and `permanent easement` payloads whose descriptions prove pedestrian-overpass construction or use to `pedestrian_or_accessibility`; generic licenses and easements remain unmapped.
- Payload-aware bus-shelter amenities evidence moved `treatment_family: other` from `52` to `51`. The targeted record maps only broad `amenities` payloads whose description proves bus shelters to `bus_stop_or_boarding`; generic amenities remain unmapped.
- Payload-aware capital-projects-on-behalf relation evidence moved `relation_family: other` from `36` to `35`. The targeted `serves` `entity -> entity` record maps only descriptions that contain both an `undertakes capital projects` signal and an `on behalf of` agency-role signal to `agency_role`; plain `on behalf of`, plain capital-project text, and ordinary facility `serves` records remain unmapped.
- Payload-aware `serves` relation evidence moved `relation_family: other` from `35` to `32`. The targeted records map only `project -> entity` headquarters-facility or parking-facility/customer/station descriptions to `location_scope`, and only `treatment_component -> entity` descriptions proving a treatment/system was procured for use by the entity to `treatment_context`; broad project/entity service, benefits, and agency-scope `serves` records remain unmapped.
- Payload-aware rail-location relation evidence moved `relation_family: other` from `32` to `30`. The targeted records map only `project -> entity` relations whose payload descriptions prove physical rail infrastructure location context: a grade crossing that crosses tracks, or rail lines/trackage/equipment/access located on property adjacent to the project. Descriptionless rail records, OMNY integration records, and maintenance RFP records remain unmapped.
- Raw-text-context relation evidence moved `relation_family: other` from `30` to `28`. Materialization now passes observation `raw_text` as normalization context without storing it in canonical payloads; scoped rules classify only rail-location `affects` project/entity records with crossing/span rail-infrastructure language and rail-connection `connects_to` project/entity records with connection-to-line/railroad language.
- Conservative relation-tail rules moved `relation_family: other` from `28` to `22`. The targeted records classify only station accessibility work `affects` project/entity records with raw station plus ADA/elevator/escalator evidence as `location_scope`, `applies_to` records with concrete `routes` or `routes_affected` arrays as `route_scope`, and exact vendor-service `serves` phrases (`Contact Center as a Service`, `pharmacy benefit management services`) as `funding_award`. PTASP applies-to departments, P3 ADA `implemented_at`, generic station wording, terminal route/rider service, and medical-benefits coverage remain unmapped.
- Endpoint-aware station accessibility `implemented_at` evidence moved `relation_family: other` from `22` to `21`. The targeted record classifies only the P3 ADA improvements relation for selected NYCT subway stations as `location_scope`; the remaining `serves`, `affects`, `applies_to`, `uses`, `eligible_for`, `improves`, and `has_associated_entity` tail stays intentionally unmapped.
- Endpoint/payload-aware PTASP, project-involvement, and named-system relation evidence moved `relation_family: other` from `21` to `17`. The targeted records classify only PTASP applicability to DOB/DOS department entities as `governance_legal`, project-involves-entity evidence as `program_project_scope`, and named JusticeONE system use as `dependency_or_reference`; broad `serves`, `affects`, generic `uses`, `eligible_for`, and self-edge `improves` records remain intentionally unmapped.
- Treatment residual audit re-baselined `treatment_family: other` at `34` and made no code change. The current residuals are composite SBS/BRT/toolkit/package records, generic repair records without payload-level vertical-circulation evidence, or records outside the bounded treatment-family taxonomy.
- Identity-review Community Board suppression moved deterministic review pressure from `91` candidate edges / `56` clusters to `78` candidate edges / `50` clusters. Same-number Community Board entity edges are now suppressed when both community-board-shaped records expose contradictory borough context via payload identity fields, canonical IDs, source labels, or local observation IDs; same-borough Community Board records still produce review edges.
- Identity-review entity-name parsing moved deterministic review pressure from `78` candidate edges / `50` clusters to `76` candidate edges / `48` clusters. `agency_name` is now an entity-name fallback only when `entity_name`, `name`, `short_name`, and `acronym` are absent, so shared agency affiliation no longer creates person/person candidate edges while agency-only records still review normally.
- Generic `station`, `stations`, `repair`, `capital project`, and broad station/capital labels remain intentionally unmapped unless payload context proves a bounded family.
- Broad composite labels such as `sbs_features` and `bus_rapid_transit_improvements` remain intentionally unmapped because they bundle multiple treatment families.

Route split-candidate cleanup loop:

- Limited-bus classifier-artifact evidence moved route `split_candidate` records from `16` to `14`.
  Read-only Codex audit lanes Bohr (`019f15b2-9c60-7f51-9bb8-61005ccbf4a2`) and Maxwell
  (`019f15b2-b905-7860-8fb2-b94bd7d30910`) confirmed that only `route_meeting-doc-129371-s93`
  and `route_q50-2014-brt-flushingjamaica-ws` fit the safe false-positive shape: top-level local
  route evidence, exact merged `limited bus` / `limited_bus` classifier values, no merged
  `service_variant`, and no `LTD`/`Limited`/`SBS`/`Express` identity surfaces. Materialization now
  assigns those records `route_record_scope: true_route` with reason
  `local_limited_bus_classifier_artifact`. Negative guards preserve B103 LTD, Q25/Q34/Q44,
  Bx15 LTD, Bx55 Limited, Q53 SBS, and B46/Utica SBS contamination as split candidates. After
  deterministic materialization, route scopes are `true_route: 296`, `split_candidate: 14`,
  `aggregate_list_context: 10`, and `data_only_scope: 1`; identity-review remains all-zero and
  validation remains clean.
- Route lineage and alias-pruning evidence moved route `split_candidate` records from `14` to `11`
  and duplicate route alias keys from `6` to `2`. Read-only Codex audit lanes Epicurus
  (`019f15be-4f51-7861-974f-4d0bdcd4dede`) and Euclid
  (`019f15be-6e0f-7210-ae99-653555d1014c`) identified three narrow false-positive split shapes:
  M60 SBS local-predecessor upgrade context, B41 local/local-limited bundled service context, and
  explicit M16-to-M34A SBS rename lineage. Materialization now records those as `true_route` with
  reasons `sbs_local_upgrade_compatible`, `local_limited_bundle_limited_context_compatible`, and
  `renamed_route_predecessor_compatible`. Persisted route aliases now prune stale generic
  route-base aliases when a variant-specific record id or alias is present. Remaining route split
  candidates are `10` service-variant conflicts and `1` slash-surface conflict; remaining duplicate
  route alias keys are `route_q44` and `route_bx55`, both intentionally left with the unresolved
  lifecycle/split cases.
- Predecessor/successor lifecycle evidence moved route `split_candidate` records from `11` to `7`
  and duplicate route alias keys from `2` to `0`. Read-only Codex audit lane Peirce
  (`019f15d0-066f-71d1-8fc4-8de60cff9054`) confirmed a narrow same-base-route lifecycle policy:
  Limited/LTD-to-SBS or local-to-SBS predecessor/successor context is compatible when route identity
  stays on the same route token and payload evidence explicitly proves lifecycle context, not a
  branch/bundle merge. Materialization now records `route_q53-sbs-ace`, `route_utica-ave-sbs`,
  `route_bx41-limited-2012`, and `route_s79-hylan-2010` as `true_route` with reason
  `predecessor_successor_lifecycle_compatible`. The final post-merge alias pruning pass prevents
  stale generic route aliases from being reintroduced after accumulated submissions merge. Remaining
  split candidates are `6` service-variant conflicts plus `1` slash-surface conflict: B103 LTD,
  Bx15, Bx55, Q25, Q34, Q44, and Q52/Q53 context.

## Verification

- `bun test packages/pipeline/test/ontology/normalizers.test.ts`: pass.
- `bun test packages/db/test/identity.test.ts`: pass.
- `bun test packages/pipeline/test/materialize/materialize.test.ts`: pass.
- `bun test packages/agents/test/identity-review.test.ts`: pass.
- `bun test packages/pipeline/test/records/relations.test.ts`: pass.
- `bun run typecheck`: pass.
- `bun packages/cli/src/cli.ts materialize`: pass, SQLite FTS quick_check OK.
- `bun packages/cli/src/cli.ts identity-review`: pass, deterministic artifact regeneration only.
- `bun packages/cli/src/cli.ts validate`: pass, `Issues: 0`.
- Residual combined focused test pass: `bun test packages/db/test/identity.test.ts packages/pipeline/test/records/relations.test.ts packages/pipeline/test/ontology/normalizers.test.ts packages/pipeline/test/materialize/materialize.test.ts`.
- Direct cleanup focused test pass: `bun test packages/db/test/identity.test.ts packages/pipeline/test/materialize/materialize.test.ts packages/pipeline/test/records/relations.test.ts packages/agents/test/identity-review.test.ts`.
- Additional relation-family focused test pass: `bun test packages/pipeline/test/records/relations.test.ts`.
- Treatment-family focused test pass: `bun test packages/pipeline/test/ontology/normalizers.test.ts packages/pipeline/test/materialize/materialize.test.ts`.
- Latest relation-family cleanup pass: focused relation test pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass, and `validate` pass with `Issues: 0`.
- Latest treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, and `validate` pass with `Issues: 0`.
- Latest exact treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, and `validate` pass with `Issues: 0`.
- Latest accessibility/roadway treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, and `validate` pass with `Issues: 0`.
- Latest exact relation-family cleanup pass: focused relation test pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass, and `validate` pass with `Issues: 0`.
- Latest residual relation-family cleanup pass: focused relation test pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass, and `validate` pass with `Issues: 0`.
- Latest service/provider relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest mixed exact relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest targeted exact relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest small exact relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest route/corridor endpoint-aware relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact residual relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact residual has/context relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest role/context relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact/endpoint-aware relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest broad-label endpoint-aware relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact/endpoint-aware tail relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact/endpoint-aware role/context relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact/endpoint-aware dependency/governance/agency relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest treatment component fallback cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact residual role/governance/dependency relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware claim-context relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact/endpoint-aware service/rating/reporting relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware `has_related_project` relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest service/schedule adjustment event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest pilot execution event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest planning-analysis event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest asset-SGR/station/track/signal project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest vehicle/fleet procurement project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest service-change project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest crossing/bridge/trackwork/CBTC project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware EE2CS/EBCS service relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware OMNY and Paratransit/AAR service relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware Penn Station Access / Metro-North service relation-family cleanup pass: focused relation tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware NYCT Medical Benefits Program service relation-family cleanup pass: focused relation tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest station-renewal treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest opening event-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest public-workshop event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest approval/adoption event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest installation event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest schedule/timetable event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest bond-financing event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest ribbon-cutting event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest trackwork event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest holiday-service event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest disruption/outage event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest anniversary event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest planning/study/design-phase event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest RFP/proposal event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest policy-effective-date event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest service expansion/restoration event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest track-outage event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest ridership-record event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest unveiling event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest plan-release event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest design/refinement event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest forum/webinar public-engagement cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest planned/upcoming bond-issuance event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest track-outage variant event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest service-start/resumption event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest planning/study/design-start event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest anniversary/ribbon ceremony event-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware capital-projects-on-behalf `serves` relation-family cleanup pass: focused relation tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware facility/use-by `serves` relation-family cleanup pass: focused relation tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware rail-location relation-family cleanup pass: focused relation tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest raw-text-context rail relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest conservative relation-tail cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware station accessibility `implemented_at` relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest Community Board identity-review candidate cleanup pass: focused identity-review tests pass, `bun run typecheck` pass, deterministic `identity-review` pass with `78` candidate edges / `50` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest agency-name fallback identity-review candidate cleanup pass: focused identity-review tests pass, `bun run typecheck` pass, deterministic `identity-review` pass with `76` candidate edges / `48` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest do-not-merge suppression identity-review cleanup pass: focused identity-review tests pass, `bun run typecheck` pass, deterministic `identity-review` pass with `14` candidate edges / `14` clusters / `0` validation, duplicate, or endpoint-shape issues, `0` remaining do-not-merge-covered candidate edges, and `validate` pass with `Issues: 0`.
- Latest remaining-14 identity-review override cleanup pass: focused identity override and identity-review tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest residual relation-tail cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware claim/entity `affects` relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware project/entity rail-connection relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware project/entity rail-territory `applies_to` relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware associated-entity agreement/acquisition relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.

## Latest Slice - LIRR Track Testing Inspection

- Re-baselined residual `project_family: other` at `261`; deterministic inspection found one testing-and-inspection project with explicit ultrasonic rail and track geometry vehicle testing proof still in `other`.
- Target: `project_track-testing-lirr-2023-q2`.
- Added a payload-gated exact `testing_and_inspection` project rule requiring ultrasonic-rail or track-geometry-vehicle testing proof.
- Guardrail: generic testing/inspection and train-simulator testing remain `other`.
- Post-materialize counts: residual `project_family: other` is `260`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`; residual `event_family: other` remains `1822`; the Track Testing record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T02-09-09-025Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - LED Station Lighting Upgrade

- Re-baselined residual `treatment_family: other` at `9`; left that bucket unchanged because the remaining records are taxonomy-less public-art/employee-amenity/map-legend records or need context outside the treatment payload for a safe rule.
- Re-baselined residual `project_family: other` at `260`; deterministic inspection found one `upgrade` project with explicit station LED lighting proof still in `other`.
- Target: `project_meeting-doc-135421-led-station-lighting-upgrade`.
- Added a payload-gated exact `upgrade` project rule requiring station context plus LED/lighting upgrade proof.
- Guardrail: generic upgrades and non-station lighting upgrades remain `other`.
- Post-materialize counts: residual `project_family: other` is `259`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`; residual `event_family: other` remains `1822`; the LED Station Lighting Upgrade record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T02-18-08-609Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Latest payload-aware entity/entity lease-license `serves` relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware project/entity contract-services `serves` relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware entity/entity served-location `serves` relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware associated-entity vendor/service relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware customer-service `serves` relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware station/place `operates_at` relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact/endpoint-aware location/corridor relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact cross-reference relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware inclusion relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact service-entity relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact real-estate action relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware data-portal relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware lease/license counterparty relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware cost/expense inclusion relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware document-scope relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact project-scope relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact savings/beneficiary relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact project-feature relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact legal-name relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware property-license use relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact budget new-need relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware prepared-document relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest station infrastructure/access treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, and `validate` pass with `Issues: 0`.
- Latest rail/bridge/flood/drainage treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, and `validate` pass with `Issues: 0`.
- Latest customer/fare/vehicle/bus-lane/access treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, and `validate` pass with `Issues: 0`.
- Latest street/curb/access treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, and `validate` pass with `Issues: 0`.
- Latest infrastructure/safety/fleet treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest street-operation/design treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact/component-fallback treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact zero-emission fleet/depot project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact rail/tie replacement project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact signal-infrastructure project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact station-upgrade/redevelopment project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact subway-car/zero-emission-bus project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact track-surfacing project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact bridge-infrastructure project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact SBS-upgrade project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact communications/signal-upgrade project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact bicycle-network project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-gated capacity-improvement project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest board/award-pending project-status cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest near-completion progress project-status cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest development/procurement/extension project-status cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest construction-start project-status cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest implementation/service-outcome project-status cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest study/design-phase project-status cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest planned procurement/request-stage project-status cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest planned schedule/forecast project-status cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact ADA/access project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware contract-delivery accessibility project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware draft-plan intersection treatment-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware public-private partnership accessibility project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact subway-expansion and flag-repair project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware security-camera project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware maintenance-contract project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact tolling-program project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware engineering-control safety project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware street-improvement bus-priority project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact alternatives-analysis project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact design-build bridge-replacement project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware bus-stop-improvement project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware needs-assessment project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware rail/bridge maintenance project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware station/tunnel rehabilitation project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware bus-reroute service-change cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact proof-of-concept project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware bridge/rail inspection-contract project-family cleanup pass: focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest transit/freight priority component-fallback cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest physical-modification treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware station treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware repair treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware cross-section treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware transit-priority curbside-stop cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware addition treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware deployment treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware pedestrian-overpass license/easement treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware amenities treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware bridge-strike sensor treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware draft-plan street-layout treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware SBS-station capital-improvements treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware traffic-signage and Glenwood bus-lane treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware capital-infrastructure treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware key-design-piece treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware regulated curbside bus-lane treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware street-infrastructure upgrade treatment-family cleanup pass: focused ontology and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware `has_related_project` relation-family cleanup pass: focused relation and materializer tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `91` candidate edges / `56` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest endpoint-aware OMNY commuter-rail `affects` relation-family cleanup pass: residual `treatment_family: other` was rechecked at `26` and left unchanged because the remaining records are composite or insufficiently single-family; residual `relation_family: other` moved from `11` to `9` by mapping exactly two `project_omny` to LIRR/MNR `affects` records with `OMNY CVM deployment and enhancements` evidence to `agency_role`. Focused relation tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware design-build public-works project-family cleanup pass: residual `relation_family: other` was rechecked at `9` and left unchanged because the remaining tail is endpoint-suspect or intentionally ambiguous; residual `project_family: other` moved from `602` to `599` by mapping exactly three `design-build public works contract` records with bridge/electrical/elevator/pedestrian/fender infrastructure evidence to `capital_or_infrastructure`. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact vertical-circulation project-family cleanup pass: residual `project_family: other` moved from `599` to `594` by mapping exact `elevator`, `elevator_installation`, `elevator_rehabilitation`, `elevator_replacement`, and `escalator_replacement` project types to `accessibility_or_safety`; generic `installation` and `rehabilitation` remain unmapped. The first materialize attempt hit a full `/mnt/models` filesystem; only failed deterministic build artifacts (`data/canonical.db.building*`) and stale `.git/objects/pack/tmp_pack_*` files were removed before rerunning materialize successfully. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact flood-protection project-family cleanup pass: residual `project_family: other` moved from `594` to `591` by mapping exact `flood_protection`, `flood_protection_resiliency`, and `flood_mitigation_and_signal_repair` project types to `capital_or_infrastructure`; generic `resiliency` and climate-strategy labels remain unmapped. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest vehicle/fleet procurement project-family cleanup pass: residual `project_family: other` moved from `591` to `586` by mapping exact `electric_bus_procurement`, `fleet_conversion`, and `fleet_replacement` project types plus payload-proven `contract_option_exercise` / `contract_modification_option_exercise` rolling-stock records to `capital_or_infrastructure`; generic procurement and `procurement_modification` records remain unmapped. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact physical-infrastructure project-family cleanup pass: residual `project_family: other` moved from `586` to `575` by mapping exact concrete tie, crossing rehabilitation, elevated steel repair/painting, component repair, concrete coring, platform repair, switch maintenance, grade separation, new station, facility improvement, and facility upgrade project types to `capital_or_infrastructure`; generic repair/component/facility labels and signal/systems contract records remain unmapped. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware signal/control-system project-family cleanup pass: residual `project_family: other` moved from `575` to `568` by mapping payload-proven PTC data-radio equipment supply, traction-power/fiber-network systems upgrades, PTC/ATC/ACSES sole-source contract, and CBTC/signaling-system contract modifications to `capital_or_infrastructure`; generic equipment, systems, contract, communications, cell-service, signal-testing, and technology labels remain unmapped. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware physical facility project-family cleanup pass: residual `project_family: other` moved from `568` to `564` by mapping payload-proven substation/bridge-structure demolition and replacement bus-terminal facility-replacement records to `capital_or_infrastructure`; generic demolition, facility replacement, facility relocation, facility transformation, parking, real-estate, installation, and equipment-replacement records remain unmapped. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware installation project-family cleanup pass: residual `project_family: other` moved from `564` to `562` by mapping signal-hut installation to `capital_or_infrastructure` and tactile station installation to `accessibility_or_safety`; IT-rack station installation and generic installation labels remain unmapped. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest payload-aware fare/ticketing project-family cleanup pass: residual `project_family: other` moved from `562` to `559` by mapping TVM/TOM replacement, next-generation TVM rollout, and Mobile Ticketing / TrainTime service contract records to `fare_program`; AVRM/CCTV equipment replacement, Paratransit technology upgrade, and generic service contracts remain unmapped. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact event-family engagement cleanup pass: residual `event_family: other` moved from `2493` to `2480` by mapping exact `community_engagement` and `design_workshop` event kinds to `public_engagement`; generic `workshop`, `public_event`, ERG, and employee-engagement event kinds remain unmapped. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact event-family recognition/graduation cleanup pass: residual `event_family: other` moved from `2480` to `2470` by mapping exact `employee_recognition` and `graduation` event kinds to `milestone`; broad `ceremony`, `celebration`, public/private events, tours, panels, lunch-and-learns, ERG events, employee-engagement events, and community events remain unmapped. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact event-family toll/fare-toll implementation cleanup pass: residual `event_family: other` moved from `2470` to `2459` by mapping exact `toll_increase` and `fare_toll_increase` event kinds to `implementation`; standalone `fare_increase`, broad toll/fare adjustments, and rate-schedule modifications remained unmapped at that checkpoint because sampled records included proposed or broader policy/update contexts. Later payload-gated cleanup maps only `fare_increase` records with `went_into_effect` evidence. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact event-family proposal-deadline cleanup pass: residual `event_family: other` moved from `2459` to `2452` by mapping exact `proposal_deadline` and `proposal_due` event kinds to `milestone`; public written-comment `submission_deadline`, generic `solicitation`, non-approval `procurement_action`, contract term/start/end/expiration/extension labels, mixed certification, retirement, and proposed fare-increase labels remain unmapped. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.
- Latest exact event-family RFP-issued cleanup pass: residual `event_family: other` moved from `2452` to `2446` by mapping exact `request_for_proposals`, `solicitation_issue`, `rfp_issued`, `rfp_issue`, and `rfp_release` event kinds to `milestone`; generic `solicitation`, `rfp_advertisement`, `rfp_deadline`, `rfp_response`, generic procurement, and contract-term labels remain unmapped. Focused ontology tests pass, `bun run typecheck` pass, deterministic `materialize` pass with SQLite FTS quick_check OK, deterministic `identity-review` pass with `0` review records / `0` candidate edges / `0` clusters / `0` validation, duplicate, or endpoint-shape issues, and `validate` pass with `Issues: 0`.

Final counts after materialization and validation:

- Canonical records: `84049`.
- Wiki pages: `7339`.
- Canonical route records: `321`.
- Project `document_time_status` distribution now has `other: 120`, down from the Phase 2 baseline `744`; exact board/award-pending, planned procurement/request-stage, and scheduled/forecast status literals now classify as `planned`, exact near-completion plus development/procurement/extension and implementation-start status literals now classify as `active`, exact study/design/public-engagement phase literals now classify as `study`, exact construction-start status literals now classify as `under_construction`, and exact implementation/service-outcome literals now classify as `implemented`; `active: 357`, `planned: 538`, `study: 51`, `implemented: 286`, and `under_construction: 72`.
- Project `project_family` distribution now has `other: 559`; exact asset SGR, station rehabilitation/renovation/improvement/renewal/upgrade/redevelopment, track maintenance/surfacing/switch-maintenance, signal modernization/upgrade/cutover/signals, communications/signal upgrade, subway expansion, structural flag repair, exact flood-protection/flood-mitigation project types, payload-proven capacity improvements, payload-proven rail/bridge maintenance records, payload-proven station/tunnel rehabilitation records, payload-proven bridge/rail inspection and repair contract records, payload-proven design-build public-works bridge/electrical/elevator/pedestrian/fender records, exact and payload-proven vehicle/fleet procurement and rolling-stock option records, concrete tie/crossing/platform/facility and other exact physical-infrastructure project types, payload-proven PTC/CBTC/signal/control-system contract-shaped records, payload-proven demolition and replacement bus-terminal records, payload-proven signal-hut and tactile-station installation records, payload-proven TVM/TOM and mobile-ticketing fare records, subway-car procurement, zero-emission fleet/bus deployment, depot redevelopment, rail/tie replacement, crossing, bridge preservation/rehabilitation/timber replacement/waterproofing, exact design-build bridge replacement, trackwork, CBTC, and signals/train-control project types now classify as `capital_or_infrastructure`, exact ADA/access/elevator/escalator project types, payload-proven contract-delivery accessibility records, payload-proven engineering-control safety records, payload-proven maintenance contract accessibility records, and payload-proven public-private partnership accessibility records now classify as `accessibility_or_safety`, camera/CCTV security programs and camera/CCTV maintenance contracts now classify as `enforcement_program`, exact tolling programs and payload-proven TVM/TOM/mobile-ticketing records now classify as `fare_program`, exact alternatives-analysis and payload-proven needs-assessment records now classify as `planning_or_report`, exact proof-of-concept records now classify as `pilot`, payload-proven street-improvement and bus-stop-improvement bus-priority records plus exact service expansion/improvement/enhancement and payload-proven bus-reroute records now classify as `service_change` or `bus_priority` as appropriate, exact SBS-upgrade project types now classify as `sbs_or_brt`, and exact bicycle-network project types now classify as `bike_facility`. The fare/ticketing slice moved `3` records out of `other`; TVM/TOM replacement, next-generation TVM rollout, and Mobile Ticketing / TrainTime service contract now carry `fare_program`, while AVRM/CCTV equipment replacement, Paratransit technology upgrade, and generic service contracts remain `other`. The installation slice moved `2` records out of `other`; signal-hut installation now carries `capital_or_infrastructure`, tactile station installation now carries `accessibility_or_safety`, and IT-rack station installation remains `other`. The physical facility payload slice moved `4` records out of `other`; both targeted demolition records and both targeted replacement bus-terminal records now carry `capital_or_infrastructure`, while generic demolition/facility replacement, facility relocation/transformation, parking, real-estate, installation, and equipment-replacement records remain `other`. The signal/control-system slice moved `7` records out of `other`; all targeted PTC data-radio, traction-power/fiber-network systems upgrade, PTC/ATC/ACSES sole-source contract, and CBTC/signaling-system modification records now carry `capital_or_infrastructure`, while communications upgrade, cell-service installation, signal-testing, and broad technology records remain `other`. The exact physical-infrastructure slice moved `11` records out of `other`; all targeted concrete tie, crossing rehabilitation, elevated steel repair/painting, component repair, concrete coring, platform repair, switch maintenance, grade separation, new station, facility improvement, and facility upgrade records now carry `capital_or_infrastructure`, while `facility_transformation` remains deferred. The vehicle/fleet option slice moved `5` records out of `other`; all targeted electric-bus, fleet-conversion, fleet-replacement, subway-car option, and locomotive option records now carry `capital_or_infrastructure`, while `3` inspected `procurement_modification` records remain `other`. The flood-protection slice moved `3` records out of `other`; all targeted flood wall/flood mitigation/signal repair records now carry `capital_or_infrastructure`, and `0` targeted records remain `other`. The vertical-circulation slice moved `5` records out of `other`; all targeted elevator/escalator records now carry `accessibility_or_safety`, and `0` targeted records remain `other`. The design-build public-works slice moved `3` records out of `other`; all targeted records now carry `capital_or_infrastructure`, and `0` targeted records remain `other`. The bridge/rail inspection-contract slice moved `5` records out of `other`; all targeted records now carry `capital_or_infrastructure`, and `0` targeted records remain `other`. The proof-of-concept slice moved `2` records out of `other`; both targeted records now carry `pilot`, and `0` targeted records remain `other`. The bus-reroute slice moved `1` record out of `other`; the M100 East Harlem reroute now carries `service_change`, and `0` targeted records remain `other`. The station/tunnel rehabilitation slice moved `7` records out of `other`; `7` rehabilitation records now carry `capital_or_infrastructure`, while `5` vague or non-station/tunnel rehabilitation records remain `other`. The rail/bridge maintenance slice moved `2` records out of `other`; Van Wyck Bridge Waterproofing and Montauk Branch bridge/track maintenance now carry `capital_or_infrastructure`, while `3` generic maintenance records remain `other`. The needs-assessment slice moved `1` record out of `other`; the targeted 20-Year Needs Assessment record now carries `planning_or_report`, and `0` targeted records remain `other`. The bus-stop-improvement slice moved `1` record out of `other`; the targeted Mosholu Parkway record now carries `bus_priority`, and `0` targeted records remain `other`. The design-build bridge-replacement slice moved `3` records out of `other`; all targeted bridge-replacement records now carry `capital_or_infrastructure`, and `0` targeted records remain `other`. The alternatives-analysis slice moved `2` records out of `other`; both targeted records now carry `planning_or_report`, and `0` targeted records remain `other`. The street-improvement bus-priority slice moved `4` records out of `other`; all targeted SBS/bus-lane/bus-stop street-improvement records now carry `bus_priority`, and `0` targeted records remain `other`. The engineering-control safety slice moved `2` records out of `other`; both targeted collision-reduction roadway records now carry `accessibility_or_safety`, and `0` targeted records remain `other`. The tolling-program slice moved `2` records out of `other`; both targeted Central Business District Tolling records now carry `fare_program`, and `0` targeted records remain `other`. The maintenance-contract slice classified `2` targeted records (`1` enforcement, `1` accessibility) with `0` targeted records remaining `other`; aggregate `project_family: other` moved from `638` to `635` after replay. The security-camera slice moved `2` records out of `other`; both targeted records now carry `enforcement_program`, and `0` target records remain `other`. The subway-expansion/flag-repair slice moved `8` records out of `other`; all `9` exact `subway_expansion` and `flag_repair` records now carry `capital_or_infrastructure`, and `0` target records remain `other`. The contract-delivery accessibility slice moved `49` records out of `other`; all `56` strict target records now carry `accessibility_or_safety`, `0` strict target records remain `other`, and `66` adjacent contract-delivery records without payload access tokens remain `other`. The public-private partnership accessibility slice moved `4` records out of `other`; all `4` targeted P3 accessibility records now carry `accessibility_or_safety`, and `0` targeted records remain `other`. Token-boundary matching prevents `SCADA` and `viaduct` from satisfying the `ada` evidence token; one Park Avenue Viaduct record still carries an existing accessibility family outside this new rule and is deferred.
- Identity-review artifacts: `0` candidate edges, `0` clusters, `0` review records, `0` validation issues, `0` duplicate identity issues.
- Event `event_family: other`: `2446`; opening/reopening, exact service-start, in-service, new-service, and service-rollout event kinds now classify as `launch`, exact normalized public-workshop/design-workshop/community-engagement and forum/webinar/town-hall/public-engagement event kinds now classify as `public_engagement`, exact adoption/authorization event kinds now classify as `approval`, exact installation, schedule/timetable, trackwork, holiday-service, policy-effective-date, service-expansion/restoration, service-resumption/return-to-service, exact service/schedule adjustment/modification, exact pilot execution/test, exact toll-increase, and exact fare/toll-increase event kinds now classify as `implementation`, exact bond-issuance/pricing plus planned/upcoming bond-issuance variants, ribbon-cutting, ribbon-cutting ceremony, anniversary, anniversary celebration, RFP-issuance/issued/release/request-for-proposals, proposal-submission, proposal-deadline/proposal-due, ridership-record, unveiling, employee-recognition, and graduation event kinds now classify as `milestone`, exact plan-release event kinds now classify as `publication`, exact service-disruption/outage, track-outage, and track-outage variant event kinds now classify as `pause`, exact planning/study/design-phase, design/refinement, exact study/design/planning/scoping phase-start, and exact planning-analysis event kinds now classify as `planning`. The latest RFP-issued slice moved `6` records out of `other`; all exact `request_for_proposals`, `solicitation_issue`, `rfp_issued`, `rfp_issue`, and `rfp_release` records now carry `milestone`, while generic `solicitation`, `rfp_advertisement`, `rfp_deadline`, `rfp_response`, generic procurement, and contract-term labels remain `other`. Replay promotes stale `event_family: other` companions when an exact event-kind rule applies.
- Relation `relation_family: other`: `6`; latest targeted tail records moved out of `other`: 2 PTASP department applicability relations, 1 project-involves-entity Penn Station Access relation, 1 JusticeONE named-system use relation, 2 EE2CS/EBCS service-to-NYCT relations, 1 OMNY NFPS service-to-NYCT relation, 1 Paratransit/Access-A-Ride operations relation, 1 endpoint-aware Penn Station Access / Metro-North `serves` relation, 1 endpoint-aware NYCT Medical Benefits Program `serves` relation, 2 endpoint-aware OMNY commuter-rail `affects` relations, 2 endpoint/evidence-gated Grand Central Madison / LIRR `serves` relations, and 1 Fair Fares / Transit Adjudication Bureau fine-waiver `eligible_for` relation now classified out of `other`. The current six-record tail remains unresolved because of endpoint/display mismatch, missing payload evidence, endpoint mismatch, or self-relation shape.
- Treatment `treatment_family: other`: `26`, down from `542`; `bus_stop_or_boarding`: updated by precise component fallback and payload-proven generic station/transit-priority curbside-stop/amenities/SBS-station capital-improvements/key-design-piece records; legacy `shelters_and_benches`: `0`; precise physical-modification safety, station-renewal cleaning/Re-NEW-vation capital work, vertical-circulation repair, street-layout cross-section and draft-plan descriptions, location-bound draft-plan intersection records, traffic-signage draft-plan descriptions, concrete bus-lane design pieces, regulated curbside bus-lane priority payloads, payload-proven capital infrastructure, street-infrastructure upgrades, and key-design pieces, pedestrian/public-realm addition, gate-guard deployment, pedestrian-overpass license/easement, and bridge-strike sensor mitigation descriptions now classify out of `other`. The latest draft-plan intersection slice moved `6` records to `capital_or_infrastructure`, with `0` targeted records remaining `other`.
- Route scope distribution: `true_route: 290`, `aggregate_list_context: 10`, `split_candidate: 20`, `data_only_scope: 1`; canonical route records remain `321`.

## Remaining

- Avoid generic treatment `station`/`stations`, broad `repair`/`upgrade`/`capital_project`, and composite SBS/BRT mappings unless a future audit can separate concrete component families.
- Avoid broad relation service/scope labels such as `serves`, project/entity `affects`, generic `applies_to`, generic `uses`, and generic `has_associated_entity` unless endpoint, payload, or stable identity context proves a bounded family.
- Keep residual relation tail records with endpoint/display mismatch, missing payload text, endpoint mismatch, or self-relation shape unmapped until an endpoint repair or stronger payload-evidence rule is available; the GCM/LIRR service rule is limited to GCM subject, LIRR object, and service/customer/schedule evidence.
- Keep generic `eligible_for` records unmapped unless endpoint identity and payload/raw evidence prove the bounded Fair Fares / Transit Adjudication Bureau fine-waiver eligibility context.
- Keep generic project/entity `affects` records unmapped unless endpoint identity plus payload/raw evidence proves a bounded agency, location, or scope family; the OMNY commuter-rail CVM rule is limited to `project_omny`, LIRR/MNR endpoints, and CVM deployment/enhancement evidence.
- Avoid broad benefits/service relation mappings unless endpoint identity and payload/raw evidence both prove a bounded agency role; description-only NYCT or employee-benefit mentions remain insufficient.
- Leave testing, evaluation, delivery, project-step, infrastructure-project, and other broad event labels unresolved until a future slice can prove a narrower lifecycle or family rule.
- Leave broad public-event, workshop, briefing, committee-briefing, conference, job-fair, and employee-resource-group event labels unresolved until a future slice can prove a narrower engagement or lifecycle rule.
- Leave generic `upcoming_issuance` and `issuance` event labels unresolved unless a future rule has bond/procurement/policy evidence beyond the generic token.
- Leave timetable/trackwork advisories and trackwork program updates unresolved; they are committee-update shaped and should not be classified as outage/pause without direct outage evidence.
- Leave planned revenue-service/in-service dates, service-live dates, service addition/activation labels, and generic work-resumption labels unresolved until a future rule has stronger launch or implementation evidence.
- Leave mixed project-phase, project-schedule, environmental-review, performance-review, and design-workshop labels unresolved unless a future rule has payload evidence for a single lifecycle/family.
- Leave broad celebration, ceremony, ceremony-and-parade, cultural/heritage/ERG celebration, and public-event labels unresolved unless a future rule has a narrower milestone signal.
- Leave service-plan updates, rate-schedule modifications, price adjustments, and fare-promotion adjustments unresolved until a future rule has stronger policy/update evidence.
- Leave pilot duration, pilot period, pilot conclusion, pilot extension, and proof-of-concept labels unresolved until a future rule has stronger lifecycle/family policy evidence.
- Leave analysis snapshots, performance/budget/committee/environmental reviews, testing, and evaluation labels unresolved until a future rule has stronger planning or implementation evidence.
- Leave generic analysis and performance-analysis project labels unresolved; only exact alternatives-analysis labels now map to `planning_or_report`.
- Leave generic concept/design project labels unresolved; only exact proof-of-concept project types now map to `pilot`.
- Leave project-family delivery/procurement/admin labels such as design-build, generic procurement, generic program, license agreement, generic rehabilitation, and operating-efficiency initiative unresolved until a future rule has stronger asset or service-family evidence.
- Leave generic design-build and design-build contract project labels unresolved unless exact project type or payload evidence proves a bounded physical asset family.
- Leave generic design-build public-works contract labels unresolved unless payload evidence proves bridge, electrical, elevator, pedestrian walkway, fender, or comparable physical infrastructure work.
- Leave generic installation and rehabilitation project labels unresolved; only exact elevator/escalator vertical-circulation project types classify through the latest accessibility rule.
- Leave generic project procurement and contract-delivery labels such as personal-service contract, miscellaneous-service contract, noncompetitive procurement, procurement modification, public-works contract, and design-build contract unresolved until a future rule has stronger asset-family evidence.
- Leave customer-service initiatives/programs, generic programs, broad initiatives, and operating-efficiency initiatives unresolved until a future rule has stronger service-family evidence.
- Leave generic project maintenance, rehabilitation, installation, demolition, equipment replacement, and signaling-system contract modification labels unresolved until a future rule has stronger asset-family evidence.
- Leave broad procurement, contract, demolition, ITS consulting, and generic inspection project labels unresolved unless payload fields prove bounded physical bridge, rail, station, tunnel, vehicle, or asset infrastructure work.
- Leave generic project transition, transformation, redevelopment, and procurement labels unresolved until a future rule has stronger fleet, depot, or asset-family evidence.
- Leave generic project maintenance, installation, and equipment-replacement labels unresolved unless a future rule has stronger rail, station, vehicle, or asset-family evidence.
- Leave signal-testing and signaling-system contract-modification project labels unresolved unless a future rule has stronger project-family evidence beyond activity or contract shape.
- Leave generic resiliency and climate-strategy project labels unresolved; only exact flood-protection/flood-mitigation project types classify through the latest capital-infrastructure rule.
- Leave communications upgrade and cell-service installation project labels unresolved unless a future rule has stronger physical signal/asset infrastructure evidence than the project-type token alone.
- Leave generic project upgrade/redevelopment, ADA-only enhancement, parking-facility, and parking-permit labels unresolved until a future rule has stronger asset-family or accessibility policy evidence.
- Leave parking, facility relocation/replacement, real-estate, technology, and equipment-replacement project-family labels unresolved unless a future rule has stronger bounded family evidence than the project-type token alone.
- Leave generic procurement and technology initiative/platform/implementation/upgrade project labels unresolved until a future rule has stronger vehicle, asset, or technology-family policy evidence.
- Leave systems/IT/technology upgrade, generic maintenance, installation, and equipment-replacement project labels unresolved until a future rule has stronger physical asset-family policy evidence.
- Leave recreational trail, resiliency/climate strategy, and street-improvement project labels unresolved until a future rule has stronger asset-family or planning/accessibility policy evidence.
- Leave bus-stop improvement, street-improvement, bus-reroute, and bus-service-contract project labels unresolved until a future rule has stronger family evidence than the project-type token alone.
- Keep bus-stop-improvement labels unmapped unless payload fields beyond `project_type` prove concrete bus-stop or boarding context.
- Leave generic network expansion, street-improvement, bus-reroute, and capacity-improvement project labels unresolved until a future rule has stronger family evidence than the project-type token alone.
- Leave generic capacity-improvement, resiliency/climate strategy, network expansion, expansion, and street-improvement project labels unresolved unless payload context proves a bounded project family.
- Leave generic recommended, approval, ratification, reviewed, ratification-requested, and ION ratification/contract-award status labels unresolved until a future rule can distinguish requested approval from completed approval.
- Leave various completion percentages, completion goals, launching, announced, and new status labels unresolved until a future rule can distinguish planned launch, active work, rollups, and completed implementation.
- Leave expanded, generic deployment, launching, executed, and non-exact future/schedule status labels unresolved until a future rule can distinguish active expansion, completed implementation, agreements, and planned launch.
- Leave generic beginning, service-resumption-like beginning dates, construction-pushed dates, and broad deployment status labels unresolved until a future rule can distinguish planned starts, active construction, and completed implementation.
- Leave reviewed/presented/update/report and broad post-implementation project status labels unresolved until a future rule can distinguish active delivery, publication/update context, and planning phases; bounded `in_design`/`in_design_phase` variants are handled by the later exact design-phase slice.
- Leave generic approval, ratification, recommended, amendment, executed, and already-selected conditional-designation labels unresolved until a future rule can distinguish completed approval, requested approval, recommendations, and agreement execution.
- Defer the existing Park Avenue Viaduct contract-delivery project-family value until a future provenance-specific cleanup can determine whether to preserve submitted family evidence or override it.
- Keep generic draft plans and public-workshop-shaped draft-plan records unmapped unless the payload repeats a concrete location-bound intersection plan or proves a more specific design/signage family.
- Keep public-private partnership records unmapped unless payload text proves ADA/accessibility/elevator/escalator/ramp assets.
- Keep broad project expansion, network expansion, generic repair, demolition, resiliency, and strategy records unmapped unless exact project type or payload evidence proves physical capital infrastructure.
- Keep security program records unmapped unless payload text proves camera/CCTV/video context.
- Keep maintenance contract records unmapped unless payload text proves camera/CCTV/video or ADA/accessibility/elevator/escalator/ramp assets.
- Keep generic contract and procurement modification records unmapped; exact tolling-program classification does not apply to contract-shape labels.
- Keep engineering-control records unmapped unless payload text proves collision or safety outcomes.
- Keep street-improvement records unmapped unless payload text proves bus/SBS context.
- Raw-text normalization context is now available, but should remain limited to tightly scoped evidence phrases; broad raw-text inference for service, agency, or benefits relations remains deferred.
- Route aggregate/split page annotations or writer-content migration remain deferred; broad page suppression is intentionally rejected for now.
- Identity-review candidate pressure is currently cleared; future ingest/materialize batches should continue to use durable merge aliases, do-not-merge pairs, and parser guardrails rather than advisory packet churn.
- Broad event buckets such as `board_action`, `committee_action`, committee agenda/information items, employee-resource events, generic public events, and generic workshops remain intentionally unresolved pending narrower evidence or endpoint/payload policy.
- Implementation/change event literals such as delivery, design phases, planning, project steps, and policy effective dates remain unresolved pending narrower family/lifecycle policy.
- Contract/procurement event literals such as RFP issuance, proposal submission, agreement execution, MOU execution, and notice to proceed now have exact milestone rules; license agreements, contract terms, and generic procurement remain unresolved pending narrower family policy.
- Broad ceremony/event literals such as `ceremony`, `celebration`, `public event`, ERG events, community/private events, tours, and anniversaries remain unresolved pending narrower family policy.
- Broader operational disruption literals such as incidents and weather events remain unresolved pending narrower family policy; adjacent commemoration/event labels such as celebration, ceremony, and public event also remain unresolved.
- Generic event labels and ceremony/celebration/public-event records remain unresolved unless exact labels prove a bounded milestone or engagement family.
- Trackwork advisory/update labels remain unresolved because the sampled records describe committee advisories about schedule adjustments, not the outage event itself.
- Mixed project-progress literals such as project_step, evaluation, delivery, project update, and infrastructure_project remain unresolved pending narrower lifecycle/project-event policy.
- Reporting and information-update literals such as financial forecast, quarterly_update, announcement, and information_item remain unresolved pending a reporting/publication policy.
- Generic announcements, document dates, information items, and quarterly updates remain unresolved even when some payload text mentions a release or report.
- Generic service/project labels remain unresolved unless exact tokens prove a bounded service expansion, restoration, disruption, schedule, or holiday-service event.
- Broader agreement and procurement-adjacent literals such as license_agreement, contract_term, contract_extension, contract_start, contract_end, contract_expiration, contract_modification, contract_issuance, and document_date remain unresolved pending narrower contract-event policy; exact agreement/MOU/contract execution and notice-to-proceed literals now classify as milestones.

## Latest Slice - Contract Execution Event Milestones

- Re-baselined residual `event_family: other` at `2446`.
- A read-only Codex subagent audit identified `33` exact procurement/legal execution milestone records: `5` `contract_execution`, `3` `notice_to_proceed`, `15` `agreement_execution`, and `10` `mou_execution`.
- Added exact event-family mappings for contract execution, agreement execution, MOU execution, notice to proceed, and `ntp` to `milestone`.
- Kept boundary and administrative contract labels unmapped: `contract_start`, `contract_end`, `contract_expiration`, `contract_extension`, `contract_term`, `contract_modification`, and `contract_issuance`.
- Post-materialize counts: residual `event_family: other` is `2413`; targeted execution / notice-to-proceed records remaining `other`: `0`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization passes with SQLite FTS quick_check OK, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Treatment Tail Audit And Ratification Approval Events

- Re-baselined residual `treatment_family: other` at `26`.
- A read-only Codex subagent audit found no safe positive treatment-family remap: `16` residuals are mixed SBS/BRT/bus-priority package/toolkit/list contexts, and the remaining `10` are generic repair, construction-zone, timing/context, retail vending-machine, operational staffing, subway-legend connection, or public-art records without a precise existing family.
- Kept `treatment_family: other` unchanged at `26`; aggregate/toolkit treatment records should continue to require a concrete `component_kind` or narrowly proven payload context before promotion.
- Pivoted to an exact event-family cleanup. Re-baselined residual `event_family: other` at `2413`.
- Added exact mappings for `board_ratification`, `procurement_ratification`, `contract_ratification`, and exact `ratification` to `approval`, while keeping broad `board_action` and `committee_action` unmapped.
- Post-materialize counts: residual `event_family: other` is `2407`; targeted ratification records now carrying `approval`: `6`; targeted ratification records remaining `other`: `0`.
- Disk note: a first materialize attempt failed because the filesystem was full; only failed `data/canonical.db.building*` outputs and Git-reported `.git/objects/*/tmp_obj_*` garbage were removed before the successful deterministic rerun.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization passes with SQLite FTS quick_check OK, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Immediate Operating Need Declaration Events

- Re-baselined residual `event_family: other` at `2407`.
- Local deterministic inspection found six exact `event_kind: declaration` records whose payload descriptions all identify Immediate Operating Need / ION declarations.
- Added a payload-gated event-family rule mapping only `declaration` records with Immediate Operating Need / ION evidence to `approval`.
- Guardrails: generic declarations, emergency declarations, and mixed `certification` records remain `other`.
- Post-materialize counts: residual `event_family: other` is `2401`; targeted ION declaration records now carrying `approval`: `6`; targeted declaration records remaining `other`: `0`; certification records remaining `other`: `6`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization passes with SQLite FTS quick_check OK, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Fuel Hedge Execution Event Milestones

- Re-baselined residual `event_family: other` at `2401`.
- Local deterministic inspection found seven exact `fuel_hedge_execution` / `fuel hedge execution` records describing executed ultra-low-sulfur diesel fuel hedge transactions.
- Added exact event-family mappings for those fuel-hedge execution literals to `milestone`.
- Guardrails: adjacent financial/admin event buckets such as `appraisal`, `financial_forecast`, and `budget_review` remain `other`.
- Post-materialize counts: residual `event_family: other` is `2394`; targeted fuel hedge execution records now carrying `milestone`: `7`; targeted fuel hedge execution records remaining `other`: `0`.
- Disk note: the first materialize attempt failed because only about `1.4G` was free; the previous `data/canonical.db` was temporarily moved to `/tmp` as a backup, deterministic materialization was rerun successfully, validation passed, and the backup was removed.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization passes with SQLite FTS quick_check OK, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Selection-Committee Evaluation Decisions

- Re-baselined residual `event_family: other` at `2394`.
- Local deterministic inspection found the exact `evaluation` bucket is mixed. Ordinary SBS performance evaluations and program-impact evaluations remain unresolved, but three procurement records describe an MTA Selection Committee evaluating proposals and selecting/determining the qualified vendor.
- Added a payload-gated event-family rule mapping only `evaluation` records with `selection_committee` plus `selected` or `determined` evidence to `approval`.
- Guardrails: ordinary `evaluation`, `delivery`, and `project_update` records remain `other`.
- Post-materialize counts: residual `event_family: other` is `2391`; targeted selection-committee evaluation records now carrying `approval`: `3`; ordinary evaluation records remaining `other`: `8`.
- Disk note: free space was under `1G`; the previous `data/canonical.db` was temporarily moved to `/tmp` as a backup, deterministic materialization was rerun successfully, validation passed, and the backup was removed.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization passes with SQLite FTS quick_check OK, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Actual Delivery Completion Events

- Re-baselined residual `event_family: other` at `2391`.
- Local deterministic inspection found the exact `delivery` bucket is mixed: most records are expected or scheduled deliveries/starts, but two records describe actual delivery completion (`delivered on schedule` and `delivery completion`).
- Added a payload-gated event-family rule mapping only actual delivery-completion payloads to `implementation`.
- Guardrails: expected delivery, scheduled delivery start/completion, ordinary `evaluation`, and `project_update` records remain `other`.
- Post-materialize counts: residual `event_family: other` is `2389`; targeted actual delivery records now carrying `implementation`: `2`; delivery records remaining `other`: `9`.
- Disk note: free space was only a few hundred MB. The previous `data/canonical.db` was moved to `/tmp` as a rollback backup; after materialize hit local FTS-repair disk limits, the new DB was repaired on `/tmp`, moved back, validated, and all temporary DB backups were removed.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization and SQLite quick_check are clean, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Generic effective-date and document-date literals remain unresolved unless source labels prove a bounded policy implementation event.

## Latest Slice - Effective Fare Increase Events

- Re-baselined residual `event_family: other` at `2389`.
- Local deterministic inspection found nine `fare_increase` records. Only one record states that fare increases "went into effect"; the others are proposed, projected, CTDOT-reserved, or generic fare-increase records.
- Added a payload-gated event-family rule mapping only `fare_increase` records with `went_into_effect` evidence to `implementation`.
- Guardrails: standalone `fare_increase`, proposed fare increases, projected fare/toll revenue increases, and CTDOT-reserved New Haven Line fare increases remain `other`.
- Post-materialize counts: residual `event_family: other` is `2388`; fare-increase records carrying `implementation`: `1`; fare-increase records remaining `other`: `8`.
- Disk note: the repo filesystem was full. The old DB was moved to `/tmp`, the rebuilt DB's FTS indexes were repaired on `/tmp`, and the repaired DB is currently linked from `data/canonical.db` because the repo mount did not have enough free space for a regular-file copy.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic SQLite FTS repair reports `ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Bid Receipt Procurement Milestones

- Re-baselined residual `event_family: other` at `2388`.
- Local deterministic inspection found four exact `bid_receipt` / `bid receipt` records; all describe bids received in response to IFB/procurement processes.
- Added an exact procurement milestone mapping for `bid_receipt`.
- Guardrails: non-approval `procurement_action`, `solicitation`, `rfp_advertisement`, `rfp_deadline`, `rfp_response`, appraisal, budget review, and contract-boundary labels remain `other`.
- Post-materialize counts: residual `event_family: other` is `2384`; bid-receipt records carrying `milestone`: `4`; bid-receipt records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Board Resolution Approval Events

- Re-baselined residual `event_family: other` at `2384`.
- Local deterministic inspection found four exact `board_resolution` / `board resolution` records; all describe Board-adopted resolutions.
- Added an exact approval mapping for `board_resolution`, aligned with the existing `board_resolution_adoption` and `resolution_adoption` approval mappings.
- Guardrails: generic `resolution`, broad `board_action`, `committee_action`, `action_item`, and `board_update` records remain `other`.
- Post-materialize counts: residual `event_family: other` is `2380`; board-resolution records carrying `approval`: `4`; board-resolution records remaining `other`: `0`; broad board-action and committee-action records remain `other` at `41` and `57`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Commissioning Implementation Events

- Re-baselined residual `event_family: other` at `2380`.
- Local deterministic inspection found four exact `commissioning` records; all describe in-service, completed, or commissioned assets/systems.
- Added an exact implementation mapping for `commissioning`.
- Guardrails: adjacent mixed buckets such as `activation`, `deployment`, and `closeout` remain `other`.
- Post-materialize counts: residual `event_family: other` is `2376`; commissioning records carrying `implementation`: `4`; commissioning records remaining `other`: `0`; activation, deployment, and closeout records remain `other` at `4`, `5`, and `4`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Inaugural Run Milestone Events

- Re-baselined residual `event_family: other` at `2376`.
- Local deterministic inspection found four exact `inaugural_run` / `inaugural run` records; all are first-run/debut events for rolling stock.
- Added an exact milestone mapping for `inaugural_run`.
- Guardrails: adjacent public/social event buckets such as `parade`, `Pride event`, `Pride Month event`, and `employee_event` remain `other`.
- Post-materialize counts: residual `event_family: other` is `2372`; inaugural-run records carrying `milestone`: `4`; inaugural-run records remaining `other`: `0`; parade, Pride-event, Pride-month-event, and employee-event records remain `other` at `4` each.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Proposal Development Planning Events

- Re-baselined residual `event_family: other` at `2372`.
- Local deterministic inspection found four exact `proposal_development` / `proposal development` records; all describe proposal/planning development work and already carry proposed lifecycle semantics.
- Added an exact planning mapping for `proposal_development`.
- Guardrails: adjacent mixed buckets such as `board_proposal`, generic `next_steps`, and `environmental_review` remain `other`.
- Post-materialize counts: residual `event_family: other` is `2368`; proposal-development records carrying `planning`: `4`; proposal-development records remaining `other`: `0`; board-proposal, next-steps, and environmental-review records remained `other` at `4` each at this checkpoint.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Seasonal Service Implementation Events

- Re-baselined residual `event_family: other` at `2368`.
- Local deterministic inspection found four exact `seasonal_service` / `seasonal service` records; all describe added, returned, or ongoing seasonal train service.
- Added an exact implementation mapping for `seasonal_service`, aligned with the existing exact `holiday_service` implementation rule.
- Guardrails: adjacent mixed buckets such as `special_service`, `special_event`, and `service_period` remain `other`.
- Post-materialize counts: residual `event_family: other` is `2364`; seasonal-service records carrying `implementation`: `4`; seasonal-service records remaining `other`: `0`; special-service, special-event, and service-period records remain `other` at `5`, `4`, and `4`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Signal Cutover Implementation Events

- Re-baselined residual `event_family: other` at `2364`.
- Local deterministic inspection found four exact `signal_cutover` / `signal cutover` records; all describe concrete signal-system cutover events or windows.
- Added an exact implementation mapping for `signal_cutover`.
- Guardrails: adjacent track-maintenance and advisory buckets such as `track_maintenance`, `trackwork_advisory`, and `timetable_change_and_trackwork_advisory` remain `other`.
- Post-materialize counts: residual `event_family: other` is `2360`; signal-cutover records carrying `implementation`: `4`; signal-cutover records remaining `other`: `0`; track-maintenance, trackwork-advisory, and timetable-change-and-trackwork-advisory records remain `other` at `4`, `6`, and `4`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Credit Rating Upgrade Milestone Events

- Re-baselined residual `event_family: other` at `2360`.
- Local deterministic inspection found three exact `credit_rating_upgrade` / `credit rating upgrade` records; all describe Fitch or S&P upgrades of MTA Transportation Revenue Bond ratings.
- Added an exact milestone mapping for `credit_rating_upgrade`, aligned with existing bond issuance and bond pricing financial milestones.
- Guardrails: adjacent generic fare-system-change, generic `establishment`, `customer_engagement`, and `community_walk_through` buckets remain `other` pending narrower payload-gated policy; broad `financial_forecast` and `budget_review` labels remain `other`.
- Post-materialize counts: residual `event_family: other` is `2357`; credit-rating-upgrade records carrying `milestone`: `3`; credit-rating-upgrade records remaining `other`: `0`; fare-system-change, establishment, customer-engagement, and community-walk-through records remained `other` at `3` each at this checkpoint.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Bond Transaction Milestone Events

- Re-baselined residual `event_family: other` at `2357`.
- Local deterministic inspection found five exact bond-transaction records: `bond_closing`, `bond_sale`, `bond_transaction`, and two `bond_remarketing` records. All describe concrete MTA/TBTA bond sale, closing, refunding, or remarketing transactions.
- Added exact milestone mappings for `bond_closing`, `bond_sale`, `bond_transaction`, and `bond_remarketing`, aligned with existing bond issuance, bond pricing, and credit-rating-upgrade financial milestones.
- Guardrails: adjacent `budget_deal`, `budget_enactment`, `contract_amendment`, and `contract_option_period` buckets remain `other` pending separate policy; broad `financial_forecast` and `budget_review` labels remain `other`.
- Post-materialize counts: residual `event_family: other` is `2352`; bond-closing, bond-sale, bond-transaction, and bond-remarketing records carrying `milestone`: `5`; targeted bond-transaction bucket records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Holiday Service Program Implementation Events

- Re-baselined residual `event_family: other` at `2352`.
- Local deterministic inspection found five exact `holiday_service_program` / `holiday service program` records; all describe LIRR added holiday trains or early-getaway/holiday service programs.
- Added an exact implementation mapping for `holiday_service_program`, aligned with the existing exact `holiday_service` and `seasonal_service` implementation rules.
- Guardrails: adjacent `special_service`, `special_event`, `service_period`, generic `policy_announcement`, `training`, `testing`, and `corridor_selection` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2347`; holiday-service-program records carrying `implementation`: `5`; holiday-service-program records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Holiday Getaway Service Implementation Events

- Re-baselined residual `event_family: other` at `2347`.
- Local deterministic inspection found three exact `holiday_getaway_service` / `holiday getaway service` records; all describe Metro-North operating getaway or Sunday/holiday train service for July 4, Labor Day, or Memorial Day periods.
- Added an exact implementation mapping for `holiday_getaway_service`, aligned with existing exact holiday-service and holiday-service-program implementation rules.
- Guardrails: adjacent `special_service`, `special_event`, `service_period`, generic `policy_announcement`, `training`, `testing`, `corridor_selection`, and `immediate_operating_need_declaration` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2344`; holiday-getaway-service records carrying `implementation`: `3`; holiday-getaway-service records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Immediate Operating Need Declaration Approval Events

- Re-baselined residual `event_family: other` at `2344`.
- Local deterministic inspection found three exact `immediate_operating_need_declaration` / `Immediate Operating Need declaration` records; all describe ION declarations for procurement or contract authority.
- Extended the existing payload-gated ION declaration approval rule to also recognize the exact normalized event-kind token `immediate_operating_need_declaration`.
- Guardrails: adjacent `certification`, `regulatory_filing`, `regulatory_submission`, `policy_revision`, and generic `release` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2341`; immediate-operating-need-declaration records carrying `approval`: `3`; immediate-operating-need-declaration records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Special Event Service Implementation Events

- Re-baselined residual `event_family: other` at `2341`.
- Local deterministic inspection found three exact `special_event_service` / `special event service` records; all describe Metro-North or LIRR operating special event service or extra trains for Yankee Stadium or Belmont Stakes events.
- Added an exact implementation mapping for `special_event_service`, aligned with the holiday-service and service-operation implementation rules.
- Guardrails: adjacent `special_service`, `special_event`, `service_period`, `bus_deployment`, `delivery_complete`, and `infrastructure_activation` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2338`; special-event-service records carrying `implementation`: `3`; special-event-service records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Final Cutover Implementation Events

- Re-baselined residual `event_family: other` at `2338`.
- Local deterministic inspection found two exact `final_cutover` / `final cutover` records; both describe Beaver or MET Interlocking final cutovers in Jamaica Capacity Improvements.
- Added an exact implementation mapping for `final_cutover`, aligned with the existing exact `signal_cutover` rule.
- Guardrails: adjacent `signal_testing`, `track_maintenance`, `trackwork_advisory`, `infrastructure_activation`, `activation`, and `deployment` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2336`; final-cutover records carrying `implementation`: `2`; final-cutover records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Ratings Upgrade Milestone Events

- Re-baselined residual `event_family: other` at `2336`.
- Local deterministic inspection found two exact `ratings_upgrade` / `ratings upgrade` records; both describe Transportation Revenue Bond ratings upgrades by Moody's or S&P.
- Added an exact milestone mapping for `ratings_upgrade`, aligned with the existing credit-rating-upgrade financial milestone rule.
- Guardrails: adjacent `financial_plan_update`, `upcoming_issuance`, generic `issuance`, `financial_forecast`, and `budget_review` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2334`; ratings-upgrade records carrying `milestone`: `2`; ratings-upgrade records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Toll Change Implementation Events

- Re-baselined residual `event_family: other` at `2334`.
- Local deterministic inspection found two exact `toll_change` / `toll change` records; both state that toll increases were implemented at TBTA / MTA Bridges and Tunnels facilities.
- Added an exact implementation mapping for `toll_change`, aligned with the existing exact `toll_increase` rule.
- Guardrails: adjacent `fare_and_toll_increase`, `proposed_fare_increase`, `proposed_rate_change`, and standalone `fare_increase` buckets remain `other` unless payload proves actual effect.
- Post-materialize counts: residual `event_family: other` is `2332`; toll-change records carrying `implementation`: `2`; toll-change records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Vehicle Unveiling Milestone Events

- Re-baselined residual `event_family: other` at `2332`.
- Local deterministic inspection found two exact `vehicle_unveiling` / `vehicle unveiling` records; both describe NYCT zero-emission or Access-A-Ride vehicles being unveiled or shown publicly.
- Added an exact milestone mapping for `vehicle_unveiling`, aligned with the existing exact `unveiling` rule.
- Guardrails: adjacent `rolling_stock_delivery`, `service_announcement`, `property_acquisition`, and `naming_announcement` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2330`; vehicle-unveiling records carrying `milestone`: `2`; vehicle-unveiling records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Service Addition Implementation Events

- Re-baselined residual `event_family: other` at `2330`.
- Local deterministic inspection found two exact `service_addition` / `service addition` records; both describe LIRR or Metro-North operating added or extra train service.
- Added an exact implementation mapping for `service_addition`, aligned with existing service expansion/restoration and service-operation rules.
- Guardrails at that checkpoint: adjacent `service_announcement`, `service_activation`, `activation`, `deployment`, `service_period`, and `special_service` buckets remained `other`; the following special-service slice supersedes the `special_service` deferral.
- Post-materialize counts: residual `event_family: other` is `2328`; service-addition records carrying `implementation`: `2`; service-addition records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Special Service Implementation Events

- Re-baselined residual `event_family: other` at `2328`.
- Local deterministic inspection found five exact `special_service` / `special service` records; all describe operated extra, event, or seasonal train service.
- Added an exact implementation mapping for `special_service`, aligned with the existing holiday/special-event/service-operation implementation rules.
- Guardrails: adjacent `special_event`, `service_period`, `service_announcement`, `service_activation`, `activation`, `deployment`, and `emergency_exercise` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2323`; special-service records carrying `implementation`: `5`; special-service records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Board Proposal Planning Events

- Re-baselined residual `event_family: other` at `2323`.
- Local deterministic inspection found four exact `board_proposal` / `board proposal` records; all describe capital-program amendments proposed to the MTA Board, and all already carry `lifecycle_phase: proposed`.
- Added an exact planning mapping for `board_proposal`, preserving proposed lifecycle semantics.
- Guardrails at that checkpoint: adjacent `board_action`, `committee_action`, `annual_review`, `certification`, `deadline`, and `corridor_selection` buckets remained `other`; the following corridor-selection slice supersedes the `corridor_selection` deferral.
- Post-materialize counts: residual `event_family: other` is `2319`; board-proposal records carrying `planning`: `4`; board-proposal records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Corridor Selection Planning Events

- Re-baselined residual `event_family: other` at `2319`.
- Local deterministic inspection found four exact `corridor_selection` / `corridor selection` records; all describe BRT/corridor selection for further development.
- Added an exact planning mapping for `corridor_selection`, while preserving unresolved lifecycle semantics as `other`.
- Guardrails at that checkpoint: adjacent `environmental_review`, generic `next_steps`, `data_collection`, `rfp_advertisement`, `proof_of_concept`, `board_action`, and `committee_action` buckets remained `other`; the following RFP-advertisement slice supersedes the `rfp_advertisement` deferral.
- Post-materialize counts: residual `event_family: other` is `2315`; corridor-selection records carrying `planning`: `4`; corridor-selection records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - RFP Advertisement Milestone Events

- Re-baselined residual `event_family: other` at `2315`.
- Local deterministic inspection found four exact `rfp_advertisement` / `RFP advertisement` records; all describe public RFP advertisement or issuance.
- Added an exact milestone mapping for `rfp_advertisement`, aligned with existing RFP issuance/release/request-for-proposals milestone rules.
- Guardrails at that checkpoint: adjacent `solicitation`, `submission_deadline`, `rfp_deadline`, `rfp_response`, `procurement`, non-approval `procurement_action`, and `contract_issuance` buckets remained `other`; the following contract-issuance slice supersedes the `contract_issuance` deferral.
- Post-materialize counts: residual `event_family: other` is `2311`; RFP-advertisement records carrying `milestone`: `4`; RFP-advertisement records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Contract Issuance Milestone Events

- Re-baselined residual `event_family: other` at `2311`.
- Local deterministic inspection found four exact `contract_issuance` / `contract issuance` records; all describe purchase agreement issuance.
- Added an exact milestone mapping for `contract_issuance`, while preserving the broader contract-boundary guardrails.
- Guardrails: adjacent `contract_start`, `contract_end`, `contract_expiration`, `contract_extension`, `contract_term`, `contract_modification`, `contract_amendment`, `license_agreement`, and `lease_agreement` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2307`; contract-issuance records carrying `milestone`: `4`; contract-issuance records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Submission Deadline Milestone Events

- Re-baselined residual `event_family: other` at `2307`.
- Local deterministic inspection found four exact `submission_deadline` / `submission deadline` records; all describe written-comment submission deadlines for projects or proposed property acquisitions.
- Added an exact milestone mapping for `submission_deadline`, aligned with existing proposal-deadline milestone rules.
- Guardrails: adjacent generic `deadline`, `rfp_deadline`, `rfp_response`, `solicitation`, `procurement`, and non-approval `procurement_action` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2303`; submission-deadline records carrying `milestone`: `4`; submission-deadline records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Delivery Start Milestone Events

- Re-baselined residual `event_family: other` at `2303`.
- Local deterministic inspection found four exact `delivery_start` / `delivery start` records; all describe scheduled or anticipated starts of vehicle delivery.
- Added an exact milestone mapping for `delivery_start`, while preserving broader delivery/activation/deployment guardrails.
- Guardrails: adjacent `delivery`, `delivery_period`, `activation`, `deployment`, `closeout`, `proof_of_concept`, and `track_maintenance` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2299`; delivery-start records carrying `milestone`: `4`; delivery-start records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Payload-Gated Solicitation Milestone Events

- Re-baselined residual `event_family: other` at `2299`.
- Local deterministic inspection found six exact `solicitation` records; all describe procurement solicitations, RFPs, RFIs, or RFEIs that were issued, advertised, published, or conducted.
- Added a payload-gated milestone rule for exact `solicitation`, while preserving bare `solicitation` as `other`.
- Guardrails: adjacent `procurement`, non-approval `procurement_action`, generic `deadline`, `rfp_deadline`, and `rfp_response` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2293`; solicitation records carrying `milestone`: `6`; solicitation records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Testing Implementation Events

- Re-baselined residual `event_family: other` at `2293`.
- Local deterministic inspection found six exact `testing` records; all describe operational, equipment, infrastructure, or fare-gate testing.
- Added an exact implementation mapping for `testing`, aligned with the existing pilot-test implementation rule.
- Guardrails: adjacent `signal_testing`, `trackwork_advisory`, `trackwork_program_update`, `track_work_program_update`, `performance_review`, `budget_review`, `committee_review`, and `evaluation` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2287`; testing records carrying `implementation`: `6`; testing records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Acquisition Milestone Events

- Re-baselined residual `event_family: other` at `2287`.
- Local deterministic inspection found four exact `acquisition` records; all describe completed corporate, property, or equipment-rights acquisitions.
- Added an exact milestone mapping for `acquisition`.
- Guardrails: adjacent `property_acquisition`, `contract_option_period`, `grant_period`, `contract_term_end`, `parade`, `pride_event`, and `pride_month_event` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2283`; acquisition records carrying `milestone`: `4`; acquisition records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Retirement Milestone Events

- Re-baselined residual `event_family: other` at `2283`.
- Local deterministic inspection found six exact `retirement` records; all describe retirements of people, dashboards, or MetroCard.
- Added an exact milestone mapping for `retirement`.
- Guardrails: adjacent `training`, `certification`, `safety_event`, `emergency_exercise`, `site_tour`, generic `walkthrough`, and generic `policy_announcement` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2277`; retirement records carrying `milestone`: `6`; retirement records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Incorporation Milestone Events

- Re-baselined residual `event_family: other` at `2277`.
- Local deterministic inspection found three exact `incorporation` records; all describe First Mutual Transportation Assurance Company being incorporated.
- Added an exact milestone mapping for `incorporation`.
- Guardrails: adjacent generic `establishment`, `lease_execution`, `filing`, `public_notice`, generic fare-system-change, `policy_revision`, and `regulation_update` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2274`; incorporation records carrying `milestone`: `3`; incorporation records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Payload-Gated Release Publication Events

- Re-baselined residual `event_family: other` at `2274`.
- Local deterministic inspection found three exact `release` records; all describe the Better Buses Action Plan being released.
- Added a payload-gated publication rule for exact `release` when the payload says a plan or action plan was released.
- Guardrails: generic `release` without plan evidence plus `filing`, `public_notice`, `announcement`, `document_date`, `information_item`, `quarterly_update`, `policy_revision`, and `regulation_update` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2271`; release records carrying `publication`: `3`; release records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Conviction Enforcement Events

- Re-baselined residual `event_family: other` at `2271`.
- Local deterministic inspection found three exact `conviction` records; all describe employee-assault convictions with guilty pleas and sentencing.
- Added an exact enforcement mapping for `conviction`.
- Guardrails: adjacent `incident`, `safety_incident`, `accident`, `derailment`, `payment`, `regulatory_filing`, and `regulatory_submission` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2268`; conviction records carrying `enforcement`: `3`; conviction records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Design Selection Planning Events

- Re-baselined residual `event_family: other` at `2268`.
- Local deterministic inspection found two exact `design_selection` / `design selection` records; both describe selection of a preferred design for the Woodhaven/Cross Bay SBS corridor.
- Added an exact planning mapping for `design_selection`.
- Guardrails: adjacent `design_finalization`, `environmental_review_start`, `corridor_identification`, `issuance`, `submission`, `project_schedule`, and generic `evaluation` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2266`; design-selection records carrying `planning`: `2`; design-selection records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Bid Submission Milestone Event

- Re-baselined residual `event_family: other` at `2266`.
- Local deterministic inspection found one exact `bid_submission` record; it describes Best and Final Offers received from three vendors for a BOS RFP.
- Added an exact procurement milestone mapping for `bid_submission`, with `proposed` lifecycle to match the existing received-proposal/BAFO treatment for `proposal_submission` and `proposal_deadline`.
- Guardrails: adjacent `board_submission` and `budget_enactment` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2265`; bid-submission records carrying `milestone`: `1`; bid-submission records carrying `proposed`: `1`; bid-submission records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Accessibility Installation Implementation Event

- Re-baselined residual `event_family: other` at `2265`.
- Local deterministic inspection found one exact `accessibility_installation` record; it describes installation of a tactile and Braille map at the 23 St station and already carried `lifecycle_phase: installed`.
- Added an exact implementation mapping for `accessibility_installation`, aligned with the existing exact `installation` implementation rule.
- Guardrails: adjacent `commissioning_scheduled` and `anticipated_start` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2264`; accessibility-installation records carrying `implementation`: `1`; accessibility-installation records carrying `installed`: `1`; accessibility-installation records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Cutover Implementation Event

- Re-baselined residual `event_family: other` at `2264`.
- Local deterministic inspection found one exact `cutover` record; it describes a successful Culver Line automatic-train-control cutover.
- Added an exact implementation mapping for `cutover`, aligned with the existing exact `signal_cutover` and `final_cutover` implementation rules.
- Guardrails: broader `activation`, `deployment`, and `commissioning_scheduled` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2263`; cutover records carrying `implementation`: `1`; cutover records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Credit Rating Action Milestone Event

- Re-baselined residual `event_family: other` at `2263`.
- Local deterministic inspection found one exact `credit_rating_action` / `credit rating action` record; it describes Fitch upgrading MTA Transportation Revenue Bond ratings from A- to A and revising the outlook to stable.
- Added an exact financial milestone mapping for `credit_rating_action`, aligned with existing `credit_rating_upgrade` and `ratings_upgrade` rules.
- Guardrails: `financial_forecast`, `budget_review`, and `budget_enactment` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2262`; credit-rating-action records carrying `milestone`: `1`; credit-rating-action records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Debut Milestone Event

- Re-baselined residual `event_family: other` at `2262`.
- Local deterministic inspection found one exact `debut` record; it describes Metro-North debuting a new Siemens Charger locomotive at Grand Central Terminal.
- Added an exact milestone mapping for `debut`, aligned with existing `inaugural_run`, `vehicle_unveiling`, and `unveiling` rolling-stock milestone rules.
- Guardrails: broader `deployment`, `community_event`, and `demonstration` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2261`; debut records carrying `milestone`: `1`; debut records remaining `other`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Public Engagement Labels

- Re-baselined residual `event_family: other` at `2261`.
- Local deterministic inspection found five exact public-engagement labels: `design_charrette`, `community_workshop`, `community_board_briefing`, `community_board_design_review`, and `community_board_review`.
- Added exact `public_engagement` mappings for those labels, aligned with existing public workshop/design workshop rules.
- Guardrails: generic `workshop`, `briefing`, and `community_event` buckets remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2256`; targeted records carrying `public_engagement`: `5`; targeted records remaining `other`: `0`; guard buckets unchanged (`workshop`: `12`, `briefing`: `13`, `community_event`: `10`).
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Completed Agreement Milestones

- Re-baselined residual `event_family: other` at `2256`.
- Local deterministic inspection found three exact completed-agreement/procurement milestone labels: `agreement_signed`, `agreement_executed`, and `contract_option_exercised`.
- Added exact `milestone` mappings for those labels, aligned with existing agreement-execution and contract-execution milestone rules.
- Guardrails: bare `agreement`, `agreement_effective_date`, `contract_option_period`, and `contract_option_term` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2253`; targeted records carrying `milestone`: `3`; targeted records remaining `other`: `0`; guarded agreement/contract-boundary records carrying `milestone`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Organizational Milestones

- Re-baselined residual `event_family: other` at `2253`.
- Local deterministic inspection found three exact organizational milestone labels: `creation`, `appointment`, and `consolidation`.
- Added exact `milestone` mappings for those labels, aligned with existing incorporation/acquisition/retirement milestone rules.
- Guardrails: generic `establishment`, `current_status`, `advisory_committee`, `community_partnership`, `assessment`, `annual_update`, and `annual_plan_update` remain `other` pending separate policy; a later ACTA successor establishment rule is recorded below.
- Post-materialize counts: residual `event_family: other` is `2250`; targeted records carrying `milestone`: `3`; targeted records remaining `other`: `0`; guarded organizational/status/update records carrying `milestone`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Publication Releases

- Re-baselined residual `event_family: other` at `2250`.
- Local deterministic inspection found four exact release/publication labels: `document_release`, `design_release`, `draft_plan_release`, and `environmental_assessment_release`.
- Added exact `publication` mappings for those labels, aligned with existing plan-release publication rules.
- Guardrails: `annual_update`, `annual_plan_update`, `app_update`, `data_prepared`, `design_review`, `engineering_review`, `analysis_snapshot`, `budget_results_review`, `annual_results_review`, `committee_update`, and `community_board_update` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2246`; targeted records carrying `publication`: `4`; targeted records remaining `other`: `0`; guarded update/review/data-preparation records carrying `publication`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Infrastructure Implementation

- Re-baselined residual `event_family: other` at `2246`.
- Local deterministic inspection found five exact infrastructure implementation labels: `infrastructure_added`, `infrastructure_replacement`, `infrastructure_upgrade`, `infrastructure_work`, and `installation_target`.
- Added exact `implementation` mappings for those labels, aligned with existing installation and trackwork implementation rules.
- Guardrails: `infrastructure_failure`, `infrastructure_issue`, `disruption`, `damage`, `damage_event`, `damage_incident`, `electrical_fault`, `deployment_deadline`, `delivery_window`, `estimated_start`, and `anticipated_start` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2241`; targeted records carrying `implementation`: `5`; targeted records remaining `other`: `0`; guarded incident/damage/deadline/window records carrying `implementation`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Rolling-Stock Milestones

- Re-baselined residual `event_family: other` at `2241`.
- Local deterministic inspection found three exact rolling-stock milestone labels: `locomotive_unveiling`, `inaugural_ride`, and `fleet_retirement`.
- Added exact `milestone` mappings for those labels, aligned with existing unveiling, inaugural-run, and retirement milestone rules.
- Guardrails: `fleet_commissioning`, `fleet_transition`, `fleet_upgrade`, `in_service_date`, `go_live_deadline`, `extra_service`, `fare_change`, and `fare_promotion_adjustment` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2238`; targeted records carrying `milestone`: `3`; targeted records remaining `other`: `0`; guarded fleet/service/fare records carrying `milestone`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Executed-Agreement Milestones

- Re-baselined residual `event_family: other` at `2238`.
- Local deterministic inspection found four exact executed-agreement labels: `grant_execution`, `legal_execution`, `licenses_executed`, and `execution`.
- Added exact `milestone` mappings for those labels, aligned with existing agreement-execution and contract-execution milestone rules.
- Guardrails: `legal_agreement`, `letter_of_intent`, `holdover_agreement`, `lease_renewal_agreement`, `lease_termination_agreement`, `license_agreement_effective`, `formal_offer`, `offer`, `labor_agreement`, `labor_settlement`, `agreement`, and `agreement_effective_date` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2234`; targeted records carrying `milestone`: `4`; targeted records remaining `other`: `0`; guarded agreement/offer/labor records carrying `milestone`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Funding Milestones

- Re-baselined residual `event_family: other` at `2234`.
- Local deterministic inspection found five exact funding milestone labels: `grant_announcement`, `funding_allocation`, `financing_closing`, `debt_payoff`, and `fuel_hedge`.
- Added exact `milestone` mappings for those labels, aligned with existing bond issuance, bond closing, credit rating, and fuel-hedge execution milestone rules.
- Guardrails: `financial_reconfiguration`, `budget_baseline`, `budget_deal`, `budget_enactment`, `budget_recommendation`, `price_adjustment`, `proposed_increase`, `fare_change`, and `fare_promotion_adjustment` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2229`; targeted records carrying `milestone`: `5`; targeted records remaining `other`: `0`; guarded funding/budget/fare records carrying `milestone`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Approved Contract Modifications

- Re-baselined residual `event_family: other` at `2229`.
- Local deterministic inspection found five `contract_modification` / `contract_amendment` records whose payload text proves Board approval, ratification of a modification, or approval to amend.
- Added a payload-gated `approval` mapping for those labels, aligned with existing payload-gated approval rules for Immediate Operating Need declarations and selection-committee decisions.
- Guardrails: `contract_extension`, `contract_start`, `contract_end`, `contract_expiration`, `contract_term`, `license_agreement`, and `lease_agreement` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2224`; targeted records carrying `approval`: `5`; targeted records remaining `other`: `0`; guarded contract-boundary records carrying `approval`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Payload-Proven Project Steps

- Re-baselined residual `event_family: other` at `2224`.
- Local deterministic inspection found 12 `project_step` records with bounded SBS/corridor step payloads: 9 data-collection/analysis/concept/design/corridor-plan/preferred-plan steps and 3 Step 4 implementation/launch steps.
- Added a payload-gated mapping for `project_step`: planning evidence maps to `planning`, while Step 4 implementation/launch evidence maps to `implementation`.
- Guardrails: `project_update`, `board_update`, `committee_briefing`, `briefing`, and `committee_review` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2212`; `project_step` records carrying `planning`: `9`; `project_step` records carrying `implementation`: `3`; `project_step` records remaining `other`: `0`; guarded update/briefing/review records carrying `planning` or `implementation`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Payload-Proven Project Phases

- Re-baselined residual `event_family: other` at `2212`.
- Local deterministic inspection found eight `project_phase` records with bounded Webster Avenue SBS phase payloads: 3 planning/design phases, 1 implementation phase, and 4 CAC meeting/public open house phases.
- Added a payload-gated mapping for `project_phase`: planning evidence maps to `planning`, implementation evidence maps to `implementation`, and CAC meeting/public open house evidence maps to `public_engagement`.
- Guardrails: `project_update`, `board_update`, `committee_briefing`, `briefing`, and `committee_review` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2204`; `project_phase` records carrying `planning`: `3`; `project_phase` records carrying `implementation`: `1`; `project_phase` records carrying `public_engagement`: `4`; `project_phase` records remaining `other`: `0`; guarded update/briefing/review records carrying those families: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Payload-Proven Activations

- Re-baselined residual `event_family: other` at `2204`.
- Local deterministic inspection found four `activation` records whose payload text proves activation began or was activated: OMNY AutoGate readers, Church Avenue bus lanes, bus-lane enforcement camera routes, and ACE warning periods.
- Added a payload-gated `implementation` mapping for `activation` only when payload text includes activated/began evidence.
- Guardrails: `deployment`, `service_activation`, `infrastructure_activation`, `bus_deployment`, `commissioning_scheduled`, and `trackwork_advisory` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2200`; `activation` records carrying `implementation`: `4`; `activation` records remaining `other`: `0`; guarded deployment/service/infrastructure/trackwork records carrying `implementation`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Post-Implementation Data Collection

- Re-baselined residual `event_family: other` at `2200`.
- Local deterministic inspection found three `data_collection` records whose payload text proves post-implementation data collection or monitoring, plus one report-card data-period record that remains intentionally unmapped.
- Added a payload-gated `implementation` mapping for `data_collection` only when payload text includes post-implementation data collection/monitoring evidence.
- Guardrails: `evaluation`, `performance_review`, `quarterly_update`, `project_update`, `environmental_review`, and `data_prepared` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2197`; `data_collection` records carrying `implementation`: `3`; `data_collection` records remaining `other`: `1`; guarded evaluation/review/update/environmental/data-prep records carrying `implementation`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Conducted Proof-of-Concept Events

- Re-baselined residual `event_family: other` at `2197`.
- Local deterministic inspection found four `proof_of_concept` records whose payload text proves conducted, successful, pilot, or permitted proof-of-concept events.
- Added a payload-gated `implementation` mapping for `proof_of_concept` only when payload text includes conducted/successful/pilot/permitted evidence.
- Guardrails: generic `next_steps`, `environmental_review`, `board_action`, `committee_action`, `evaluation`, and `deployment` remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2193`; `proof_of_concept` records carrying `implementation`: `4`; `proof_of_concept` records remaining `other`: `0`; guarded planning/review/deployment records carrying `implementation`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Public-Comment Agenda Items

- Re-baselined residual `event_family: other` at `2193`.
- Local deterministic inspection found 53 agenda/information records whose payload text explicitly mentions public comment.
- Added a payload-gated `public_engagement` mapping for `agenda_item`, `committee_agenda_item`, `committee_information_item`, `information_item`, and `scheduled_committee_agenda` only when payload text includes `public comment`.
- Guardrails: agenda/information records without public-comment text, plus adjacent `committee_action`, `board_action`, `recurring_agenda_item`, `committee_briefing`, `briefing`, and `committee_review` labels, remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2140`; targeted public-comment agenda/information records carrying `public_engagement`: `53`; targeted records remaining `other`: `0`; non-public-comment agenda/information records remaining `other`: `517`; adjacent guard records carrying `public_engagement`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Scheduled Delivery Starts

- Re-baselined residual `event_family: other` at `2140`.
- Local deterministic inspection found three generic `delivery` records whose payload text proves scheduled delivery start/commencement or scheduled provision of pilot buses.
- Added a payload-gated `milestone` mapping for `delivery` only when payload text includes delivery/provided evidence plus scheduled begin/commence/provided evidence.
- Guardrails: expected delivery, scheduled completion, remaining delivery, software receipt, and start-and-conclude delivery-window records remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2137`; targeted delivery-start records carrying `milestone`: `3`; targeted records remaining `other`: `0`; guarded generic delivery records remaining `other`: `6`; guarded delivery records carrying `milestone`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Weather Disruption Pauses

- Re-baselined residual `event_family: other` at `2137`.
- Local deterministic inspection found 11 `weather_event` records whose payload text proves concrete weather-related service disruption, flooding, late/canceled/terminated trains, suspension, curtailment, travel ban, planned shutdown, reduced OTP, or operational challenges.
- Added a payload-gated `pause` mapping for `weather_event` only when those disruption tokens are present and the payload does not say operations were maintained.
- Guardrails: bare weather events, maintained-operations weather records, and broad impact-only rainfall records remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2126`; targeted weather-disruption records carrying `pause`: `11`; targeted records remaining `other`: `0`; guarded weather-event records remaining `other`: `2`; guarded weather-event records carrying `pause`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Service-Impact Incidents

- Re-baselined residual `event_family: other` at `2126`.
- Local deterministic inspection found eight `incident` records whose payload text proves concrete service impact: temporary service suspension, late trains, delayed customers, service disruption, service restoration, full closure, or allowed reopening.
- Added a payload-gated `pause` mapping for `incident` only when those service-impact tokens are present.
- Guardrails: generic safety, legal, crime, thermal, collision, derailment, retaining-wall, and water-main incident records remain `other` pending separate policy unless they carry explicit service-impact evidence.
- Post-materialize counts: residual `event_family: other` is `2118`; targeted service-impact incident records carrying `pause`: `8`; targeted records remaining `other`: `0`; guarded incident records remaining `other`: `11`; guarded incident records carrying `pause`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Environmental Review Phases

- Re-baselined residual `event_family: other` at `2118`.
- Local deterministic inspection found three `environmental_review` records whose payload text proves either environmental-review planning/start evidence or completed FHWA/NEPA reevaluation approval evidence.
- Added a payload-gated mapping for `environmental_review`: review process expected-to-begin, commencement, scope publication, DEIS, and draft environmental impact statement evidence maps to `planning`; completed FHWA/NEPA reevaluation with valid FONSI evidence maps to `approval`.
- Guardrails: target-completion deadline records remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2115`; targeted environmental-review records carrying `planning`: `2`; targeted records carrying `approval`: `1`; targeted records remaining `other`: `0`; guarded target-completion records carrying `planning` or `approval`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Ceremony Unveilings

- Re-baselined residual `event_family: other` at `2115`.
- Local deterministic inspection found two `ceremony` records whose payload text proves an unveiling: one plaque unveiled at 250 Broadway and one ASCE Historic Landmark plaque unveiling at the Hugh L. Carey Tunnel.
- Added a payload-gated `milestone` mapping for `ceremony` only when payload text includes unveiled/unveiling evidence.
- Guardrails: award, promotional, Veterans Day, commemorative, wreath-laying, contest-recognition, and other generic ceremony records remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2113`; targeted ceremony-unveiling records carrying `milestone`: `2`; targeted records remaining `other`: `0`; guarded ceremony records remaining `other`: `17`; guarded ceremony records carrying `milestone`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Out-of-Service Track Maintenance

- Re-baselined residual `event_family: other` at `2113`.
- Local deterministic inspection found four `track_maintenance` records whose payload text proves tracks taken out of service or bus service replacing train service for maintenance.
- Added a payload-gated `pause` mapping for `track_maintenance` only when payload text includes out-of-service or bus-replacement evidence.
- Guardrails: adjacent `trackwork_advisory`, `trackwork_program_update`, `track_work_program_update`, `timetable_change_and_trackwork`, and `timetable_change_and_trackwork_advisory` records remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2109`; targeted track-maintenance records carrying `pause`: `4`; targeted records remaining `other`: `0`; adjacent trackwork advisory/update records remaining `other`: `29`; adjacent guard records carrying `pause`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Board/Committee Action Approvals

- Re-baselined residual `event_family: other` at `2109`.
- Local deterministic inspection found 21 `board_action` / `committee_action` records whose payload text explicitly proves Board, MTA Board, Committee, or Finance Committee approval.
- Added a payload-gated `approval` mapping for `board_action` and `committee_action` only when payload text includes board/committee approval evidence.
- Guardrails: generic board-action-on records, committee recommendations to the Board, agenda/information records, and approval-phrase-free board/committee action records remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2088`; targeted board-action approvals carrying `approval`: `20`; targeted committee-action approvals carrying `approval`: `1`; targeted approval-action records remaining `other`: `0`; board-action records remaining `other`: `21`; committee-action records remaining `other`: `56`; agenda guard records promoted to `approval`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Public-Comment Engagement Siblings

- Re-baselined residual `event_family: other` at `2088`.
- Local deterministic inspection found 10 agenda/notice/budget sibling records whose payload text explicitly includes `public_comment` evidence.
- Extended the existing payload-gated `public_engagement` mapping to `budget_review`, `committee_budget_briefing`, `committee_information`, `finance_committee_agenda_item`, `public_notice`, `public_release`, and `regulatory_notice` only when payload text includes public-comment evidence.
- Guardrails: `board_submission` records that mention a public-comment period only as prior context remain `other`; public notice/budget/committee records without public-comment text remain `other`; broad public events and employee-resource-group events remain unmapped.
- Post-materialize counts: residual `event_family: other` is `2078`; targeted public-comment sibling records carrying `public_engagement`: `10`; targeted records remaining `other`: `0`; board-submission public-comment guards remaining `other`: `1`; board-submission public-comment guards promoted to `public_engagement`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Action Approval Payloads

- Re-baselined residual `event_family: other` at `2078`.
- Local deterministic inspection found 38 `board_action` / `committee_action` records whose payload text proves the action itself is an approval through work-plan, charter, minutes, approved-and-moved-to-Board, or board-action-to-approve wording.
- Extended the existing payload-gated `approval` mapping for `board_action` and `committee_action`, while excluding recommendation-only approval contexts.
- Guardrails: "recommend action to approve," procurement recommendations before Board approval, generic Board-approval requirements, and approval-looking agenda/information records remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2040`; targeted action-approval records carrying `approval`: `38`; targeted action-approval records remaining `other`: `0`; approval-looking action guards remaining `other`: `4`; approval-looking agenda/information guards promoted to `approval`: `0`; remaining `committee_action` records carrying `other`: `23`; remaining `board_action` records carrying `other`: `16`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Stakeholder Engagement Events

- Re-baselined residual `event_family: other` at `2040`.
- Local deterministic inspection found 21 stakeholder-engagement records: exact community consultations and community walk-throughs, plus town halls, workshops, and briefings whose payload proves public or stakeholder context.
- Added a narrow `public_engagement` mapping for exact `community_consultation` and `community_walk_through`, and payload-gated mappings for `town_hall`, `workshop`, and `briefing` when payload text proves Community Board, elected-official, Interborough Express/IBX, public workshop, community planning, Bronx Bus Network Redesign, or Connecting Communities evidence.
- Guardrails: internal employee town halls/workshops, generic project-update briefings, employee-resource-group events, broad public events, and generic community/social events remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2019`; targeted stakeholder-engagement records carrying `public_engagement`: `21`; targeted records remaining `other`: `0`; town-hall/workshop/briefing guard records remaining `other`: `12`; guard records promoted to `public_engagement`: `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Action-Item Approvals

- Re-baselined residual `event_family: other` at `2019`.
- Local deterministic inspection found 10 `action_item` / `committee_action_item` records whose payload text proves committee work-plan or committee-charter approval.
- Extended the existing payload-gated `approval` mapping to `action_item` and `committee_action_item`, reusing the recommendation-only guardrails from the board/committee action cleanup.
- Guardrails: recommendation-only action items, especially Final Proposed Budget items that recommend action to the Board, remain `other` pending separate policy.
- Post-materialize counts: residual `event_family: other` is `2009`; targeted action-item approvals carrying `approval`: `10`; targeted records remaining `other`: `0`; recommendation-only action-item guards remaining `other`: `3`; guard records promoted to `approval`: `0`; remaining `action_item` records carrying `other`: `2`; remaining `committee_action_item` records carrying `other`: `1`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Performance Improvement Relation

- Re-baselined residual `relation_family: other` at `6`.
- Local deterministic inspection found one `improves` relation whose project-to-project payload text proves performance improvement through reliability, reduced delays, and shorter travel times.
- Added a payload-gated `metric_context` mapping for `improves` relations only when endpoint shape is project-to-project and payload/context text includes performance-improvement evidence such as reliability, delays, travel time, OTP, runtime, or run time.
- Guardrails: broad `improves` relations without performance evidence, non-project-to-project `improves` relations, and the remaining `serves` / `affects` other-family leftovers remain unresolved pending separate endpoint-shape or raw-relation policy.
- Post-materialize counts: residual `relation_family: other` is `5`; targeted performance-improvement records carrying `metric_context`: `1`; targeted records remaining `other`: `0`; remaining other-family relation kinds: `serves` (`4`) and `affects` (`1`).
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused relation tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Served Location Relation

- Re-baselined residual `relation_family: other` at `5`.
- Local deterministic inspection found one clear endpoint-shape miss: `relation_meeting-doc-170821-gct-serves-mnr` has `serves` with structured `entity_grand-central-terminal` subject and Metro-North object, but the served-location detector only considered `object_id` and description text.
- Expanded the bounded entity-to-entity served-location detector to consider structured `subject_id` when an `object_id` is also present, while preserving the self-edge guard.
- Guardrails: description-only Grand Central Terminal prose remains `other`; self-referential terminal route-bundle records remain `other`; RRNFPS rail-service scope, Alliant OCIP/SAS endpoint contamination, and the MNR/LIRR escalator RFP remain intentionally unresolved pending stronger endpoint or payload policy.
- Post-materialize counts: residual `relation_family: other` is `4`; `relation_meeting-doc-170821-gct-serves-mnr` now carries `location_scope`; the four remaining relation-family leftovers are `relation_alliant-ocip-sas-phase2`, `relation_mnr-lirr-escalator-rfp`, `relation_rel-interim-terminal-serves-mta-nice-routes`, and `relation_rr-nfps-serves-lirr-mnr`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused relation tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Vehicle Procurement Project Family

- Re-baselined residual `project_family: other` at `559`; generic `procurement` records accounted for `57` of those.
- Local deterministic inspection found vehicle procurement records whose broad `project_type: procurement` payloads explicitly prove bus, locomotive, R211, subway-car, or rolling-stock purchase/delivery/manufacture.
- Added a payload-gated `capital_or_infrastructure` mapping for generic `procurement` only when payload fields prove actual vehicle purchase, delivery, manufacture, or rolling-stock procurement.
- Guardrails: bus-service contracts, fuel/fueling procurements, HASTUS/software, train simulators, bus camera systems, automated vehicle location systems, maintenance services, and parts/repair service purchase agreements remain `other`.
- Post-materialize counts: residual `project_family: other` is `544`; generic `procurement` records remaining `other` dropped from `57` to `44`; `15` targeted vehicle-procurement records now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Design-Build Physical Infrastructure Project Family

- Re-baselined residual `project_family: other` at `544`; design-build-shaped records accounted for `62` of those (`design-build`, `Design-Build`, and `design-build contract`).
- Local deterministic inspection found `50` design-build delivery records whose payloads prove physical infrastructure work: rail/CBTC/signals, bridges/viaducts, tunnels, stations, substations, power/switchgear, flood mitigation, fire suppression/alarms, structural work, painting, dehumidification, and refueling/electric-charging facilities.
- Added a payload-gated `capital_or_infrastructure` mapping for broad design-build project types only when those physical-infrastructure signals are present.
- Guardrails: design-build camera, laser intrusion, PA/CIS, COE/network video, electronic monitoring, radio/audio, bus radio, CCTV, facility monitoring, and tunnel monitoring/safety-system records remain `other` pending a separate security/enforcement/communications policy.
- Post-materialize counts: residual `project_family: other` is `494`; design-build-shaped records remaining `other` dropped from `62` to `12`; `50` targeted design-build physical-infrastructure records now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Rail Infrastructure Procurement Project Family

- Re-baselined residual `project_family: other` at `494`; generic `procurement` records accounted for `45` of those when case-normalized.
- Local deterministic inspection found `6` procurement records whose payloads prove rail infrastructure maintenance or inspection: rail grinding, rail flaw and joint-bar inspection, ultrasonic testing, track geometry car critical systems, and laser/railhead cleaning.
- Added a payload-gated `capital_or_infrastructure` mapping for generic `procurement` only when those rail-infrastructure signals are present.
- Guardrails: generic services, office supplies/copy paper, replacement parts and repair services, train simulators, software, fuel, transponder/tolling, AVLM, ferry service, and bus-service procurements remain `other`.
- Post-materialize counts: residual `project_family: other` is `488`; generic `procurement` records remaining `other` dropped from `45` to `39`; `6` targeted rail-infrastructure procurement records now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Operating-Efficiency Bus Lane Enforcement Project Family

- Re-baselined residual `project_family: other` at `488`; `operating efficiency initiative` records accounted for `18` of those.
- Local deterministic inspection found one clear bounded taxonomy miss: `project_nyct-expand-automated-bus-lane-enforcement` describes installing cameras on 700 additional buses.
- Added a payload-gated `enforcement_program` mapping for broad operating-efficiency initiatives only when payload text proves automated bus lane enforcement or cameras on buses.
- Guardrails: overtime, employee availability, workers' comp, energy efficiency, cleaning, procurement-spec, station-agent, MOW capitalization, contract-streamlining, materials-management, rolling-stock productivity/inspection, and train-scheduling efficiency initiatives remain `other`.
- Post-materialize counts: residual `project_family: other` is `487`; `operating efficiency initiative` records remaining `other` dropped from `18` to `17`; the targeted ABLE expansion record now carries `enforcement_program`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Contract Modification Accessibility And Rail Project Family

- Re-baselined residual `project_family: other` at `487`; case-normalized `contract modification` records accounted for `16` of those.
- Local deterministic inspection found `3` contract-modification records whose payloads prove bounded families: Grand Central Madison elevator/escalator maintenance, emergency elevator two-way communications, and ultrasonic internal rail-flaw inspections.
- Added payload-gated mappings for broad contract modifications only when payload text proves elevator/escalator or emergency-elevator communication accessibility work, or rail flaw/joint-bar/ultrasonic inspection infrastructure work.
- Guardrails: service extensions, consulting, SaaS/GRC, HASTUS licensing, bus-service continuation, OVD/fare equipment expansion, tolling revenue-recovery, and HOV/bus-lane operations modifications remain `other`.
- Post-materialize counts: residual `project_family: other` is `484`; case-normalized `contract modification` records remaining `other` dropped from `16` to `13`; the two accessibility modifications now carry `accessibility_or_safety`, and the rail-flaw modification now carries `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Coach Car And Flatcar Procurement Project Family

- Re-baselined residual `project_family: other` at `484`; generic `procurement` records accounted for `39` of those.
- Local deterministic inspection found `2` residual procurement records whose payloads prove actual rolling-stock purchase/procure scope: Penn Station Access coach cars and R252 flatcars.
- Extended the existing payload-gated generic procurement vehicle rule to include coach-car, flatcar, and R252 signals, plus an explicit `procure` action signal.
- Guardrails: customer/contact-center services, tolling/transponders, PTC software/support, CNG/fuel, train simulators, OEM parts/repair, office supplies, ferry/bus services, public-safety systems, radios, AVLM, and maintenance/service extensions remain `other`.
- Post-materialize counts: residual `project_family: other` is `482`; generic `procurement` records remaining `other` dropped from `39` to `37`; `project_penn-station-access-coach-cars` and `project_r252-flatcar-purchase-option` now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Fare-Evasion Turnstile Procurement Project Family

- Re-baselined residual `project_family: other` at `482`; case-insensitive generic `procurement` records accounted for `37` of those, with `36` using exact lowercase `procurement`.
- Local deterministic inspection found `2` procurement records whose payloads prove fare-evasion turnstile sleeve/fin work.
- Added a payload-gated `fare_program` mapping for generic `procurement` only when payload text includes fare-evasion context and turnstile sleeve/fin evidence.
- Guardrails: E-ZPass transponders, tolling operations, customer-service systems, PTC software/support, fuel/fueling, simulators, OEM parts/repair, office supplies, ferry/bus services, radios, public-safety systems, AVLM, service extensions, and generic turnstile maintenance remain `other`.
- Post-materialize counts: residual `project_family: other` is `480`; case-insensitive generic `procurement` records remaining `other` dropped from `37` to `35`; `project_meeting-doc-193996-boyce-fare-evasion` and `project_meeting-doc-196876-fare-evasion-turnstile-sleeves` now carry `fare_program`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Program Accessibility And Enforcement Project Family

- Re-baselined residual `project_family: other` at `480`; exact `program` records accounted for `8` of those.
- Local deterministic inspection found `4` broad program records with bounded payload proof: Elevate Transit/Zoning for Accessibility ADA work, ABLE camera program, Cops/Cameras/Care camera and police presence, and Drone as First Responder funded by a law-enforcement technology grant.
- Added payload-gated mappings for `project_type: program` records only when payload text proves accessibility/ADA work or camera/law-enforcement program context.
- Guardrails: Bus Forward, Open Stroller, Drug & Alcohol statistics, and vague congestion-relief project-summary program records remain `other`.
- Post-materialize counts: residual `project_family: other` is `476`; exact `program` records remaining `other` dropped from `8` to `4`; `project_meeting-doc-100351-elevate-transit-zoning-accessibility` now carries `accessibility_or_safety`, and `project_meeting-doc-108036-cops-cameras-care`, `project_meeting-doc-113946-able-camera-program`, and `project_meeting-doc-199161-drone-first-responder` now carry `enforcement_program`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Fare-System And Ticketing Project Family

- Re-baselined residual `project_family: other` at `476`; fare/ticketing-shaped residuals accounted for `49` of those.
- Local deterministic inspection found `4` broad-type records with bounded fare-system payload proof: Masabi mobile ticketing / TrainTime, Scheidt & Bachmann fare collection replacement, OVD expansion, and ticket-selling-system maintenance.
- Extended the existing `fare_program` gate to broad `mobile_ticketing_program`, `procurement_and_installation`, and `contract_modification` project types only when payload text proves fare collection, ticket vending/office/selling systems, TrainTime mobile ticketing, or OVD/onboard validation device scope. Short acronyms are token matched so `TOM` does not match words such as `automated`.
- Guardrails: automated revenue-recovery/OCR tolling modifications, open-road tolling, TrainTime app launch, station-agent modernization, reduced-fare/customer-service centers, and tolling/customer-contact-center projects remain `other`.
- Post-materialize counts: residual `project_family: other` is `472`; fare/ticketing-shaped residuals remaining `other` dropped from `49` to `45`; `project_masabi-mobile-ticketing-contract-16022`, `project_meeting-doc-140621-fare-collection-replacement`, `project_meeting-doc-171006-ovd-enhancements`, and `project_meeting-doc-98321-sb-maintenance-ext` now carry `fare_program`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Noncompetitive Procurement Signal-Power And PTC Radio Project Family

- Re-baselined residual `project_family: other` at `472`; exact `noncompetitive procurement` records accounted for `4` of those.
- Local deterministic inspection found `3` broad noncompetitive-procurement records with bounded capital/signal-power payload proof: PTC data radio supply/delivery and OEM circuit breakers at AC traction power substations.
- Added a payload-gated `capital_or_infrastructure` mapping for `noncompetitive_procurement` only when payload text proves PTC data-radio assets or circuit breakers at traction-power substations.
- Guardrails: HASTUS/CDMS implementation remains `other`.
- Post-materialize counts: residual `project_family: other` is `469`; exact `noncompetitive procurement` records remaining `other` dropped from `4` to `1`; `project_meeting-doc-100331-oem-circuit-breaker`, `project_meeting155096-ptc-data-radio-procurement`, and `project_meeting155126-ptc-data-radios` now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Procurement Modification Vehicle And Bridge-Structural Project Family

- Re-baselined residual `project_family: other` at `469`; exact `procurement modification` records accounted for `3` of those.
- Local deterministic inspection found `3` broad procurement-modification records with bounded capital payload proof: all-electric bus contract modification, dual-mode locomotive option exercise, and Verrazzano-Narrows Bridge structural steel/fire-standpipe repairs.
- Added a payload-gated `capital_or_infrastructure` mapping for `procurement_modification` only when payload text proves actual vehicle purchase/option scope or bridge structural work.
- Guardrails: generic vehicle procurement modifications and software service modifications remain `other`.
- Post-materialize counts: residual `project_family: other` is `466`; exact `procurement modification` records remaining `other` dropped from `3` to `0`; `project_meeting-doc-115251-new-flyer-ebus-contract-mod`, `project_meeting164941-mnr-siemens-bac-locomotives`, and `project_vn32-vn49x-steel-repairs-52711` now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Design-Bid-Build Bridge And Viaduct Structural Project Family

- Re-baselined residual `project_family: other` at `466`; exact `Design-Bid-Build` records accounted for `2` visible residuals.
- Local deterministic inspection found bridge/viaduct design-bid-build records with bounded structural payload proof: RFK Bridge structural rehabilitation, Bronx/Queens viaduct steel and concrete rehabilitation, and TN49 Throgs Neck Bridge orthotropic deck replacement.
- Added a payload-gated `capital_or_infrastructure` mapping for `design_bid_build` only when payload text proves bridge or viaduct structural work such as steel/concrete rehabilitation, bearings, deck replacement, or structural repairs.
- Guardrails: generic design-bid-build delivery, technology-system implementation, and security-system replacement records remain `other`.
- Post-materialize counts: residual `project_family: other` is `463`; exact `Design-Bid-Build` records remaining `other` dropped from `2` to `0`; `project_rfk-structural-rehab`, `project_tn-bx-qns-viaducts-rehab`, and `project_tn49-orthotropic-deck` now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Public Work Rail Infrastructure Project Family

- Re-baselined residual `project_family: other` at `463`; exact `public work contract` records accounted for `2` residuals.
- Local deterministic inspection found both exact `public work contract` records carry bounded rail infrastructure payload proof: Continuous Work Platform services for Loram Maintenance of Way and Joint-Agency Rail Vacuum Services excavating ballast, mud, and debris along railway rights-of-way in electrified territory.
- Extended the existing bridge/rail infrastructure contract gate to singular `public_work_contract` only when payload text proves continuous work platform / maintenance-of-way rail context or rail-vacuum railway/right-of-way context.
- Guardrails: generic public work contract administration and building-demolition text remain `other`.
- Post-materialize counts: residual `project_family: other` is `461`; exact `public work contract` records remaining `other` dropped from `2` to `0`; `project_meeting-doc-143191-cwp` and `project_rail-vacuum-services-contract` now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Resiliency Flood-Mitigation Project Family

- Re-baselined residual `project_family: other` at `461`; exact `resiliency` records accounted for `3` residuals.
- Local deterministic inspection found `2` exact `resiliency` records with bounded flood-mitigation infrastructure payload proof: NYCT stormwater / flash-flood mitigation and stair-flooding prevention.
- Added a payload-gated `capital_or_infrastructure` mapping for `resiliency` only when payload text proves flood, flash-flood, stormwater, or stair-flooding mitigation/prevention context.
- Guardrails: `project_fortifying-mnr-hudson-line` remains `other` because its payload only says "Increasing Resiliency - Fortifying MNR's Hudson Line" without concrete infrastructure work.
- Post-materialize counts: residual `project_family: other` is `459`; exact `resiliency` records remaining `other` dropped from `3` to `1`; `project_nyct-stormwater-flooding-mitigation` and `project_preventing-stair-flooding` now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Hugh L. Carey Tunnel Rehabilitation Project Family

- Re-baselined residual `project_family: other` at `459`; exact `rehabilitation` records accounted for `5` residuals.
- Local deterministic inspection found `1` exact `rehabilitation` record with bounded tunnel infrastructure payload proof: Hugh L. Carey Tunnel Manhattan Plaza rehabilitation, including electrical and communications systems, structural and retaining-wall repairs, paving, drainage, over-height detection sensors, and IVIS tolling loop replacement.
- Extended the existing station/tunnel rehabilitation gate to map Hugh L. Carey Tunnel / Manhattan Plaza rehabilitation only when payload text also proves physical systems, drainage, structural, or retaining-wall work.
- Guardrails: L Train Tunnel, Rutgers Tube, Rockaways Rehab, and RFK Fleet Garage records remain `other`; their current normalized payloads are too vague or need a separate facility/tube policy.
- Post-materialize counts: residual `project_family: other` is `458`; exact `rehabilitation` records remaining `other` dropped from `5` to `4`; `project_193976-hlct-manhattan-plaza` now carries `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - LIRR New-Assets Maintenance Project Family

- Re-baselined residual `project_family: other` at `458`; exact `maintenance` records accounted for `3` residuals.
- Local deterministic inspection found `1` exact `maintenance` record with bounded infrastructure payload proof: LIRR Maintenance Requirements for New Assets, describing increased infrastructure in vertical equipment, fire systems, and HVAC requiring inspection plus preventive and reactive maintenance.
- Extended the existing maintenance gate to map vertical-equipment / fire-system / HVAC asset maintenance only when payload text also proves infrastructure and inspection/preventive/reactive maintenance context.
- Guardrails: Grand Central Madison contractor maintenance / wireless cellular installation and GCM weekend contractor maintenance remain `other`; those payloads are timetable support / service-window context rather than bounded asset-family proof.
- Post-materialize counts: residual `project_family: other` is `457`; exact `maintenance` records remaining `other` dropped from `3` to `2`; `project_lirr-maintenance-new-assets` now carries `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Bus Camera Security System Service Contract Project Family

- Re-baselined residual `project_family: other` at `457`; exact `Miscellaneous Service Contract` records accounted for `3` residuals.
- Local deterministic inspection found `1` exact `Miscellaneous Service Contract` record with bounded enforcement payload proof: Bus Camera Security System Maintenance Contract Award, describing maintenance/support services for the MTA Bus Camera Security System.
- Extended the existing maintenance-contract camera gate to `miscellaneous_service_contract` only when payload text proves CCTV/camera/video context.
- Guardrails: HASTUS Crew Dispatch and Management System and Small Business Development and Mentoring Program contracts remain `other`.
- Post-materialize counts: residual `project_family: other` is `456`; exact `Miscellaneous Service Contract` records remaining `other` dropped from `3` to `2`; `project_bcss-maintenance-contract-440943` now carries `enforcement_program`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Tunnel Inspection Personal Service Contract Project Family

- Re-baselined residual `project_family: other` at `456`; exact `Personal Service Contract` records accounted for `3` residuals.
- Local deterministic inspection found `1` exact `Personal Service Contract` record with bounded physical-infrastructure payload proof: 2021 Routine Tunnel Inspections at the Queens-Midtown and Hugh L. Carey Tunnels.
- Extended the existing bridge/rail infrastructure inspection contract gate to singular `personal_service_contract` only when payload text proves tunnel inspections and Queens-Midtown or Hugh L. Carey Tunnel context.
- Guardrails: customer-service-center project management consulting and toll-related revenue/environmental-review professional services remain `other`.
- Post-materialize counts: residual `project_family: other` is `455`; exact `Personal Service Contract` records remaining `other` dropped from `3` to `2`; `project_2021-tunnel-inspections` now carries `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Predictive-Maintenance Technology Project Family

- Re-baselined residual `project_family: other` at `455`; the predictive-maintenance technology slice accounted for `3` residuals across exact `technology initiative` and `AI maintenance system`.
- Local deterministic inspection found `2` records with bounded rolling-stock / maintenance-repair payload proof: Rolling Stock Predictive Maintenance Application and Preteckt System.
- Added a payload-gated `capital_or_infrastructure` mapping for `technology_initiative` and `ai_maintenance_system` only when payload text proves predictive maintenance / AI / machine learning plus rolling-stock or maintenance-repair-plan context.
- Guardrails: MYMTA Web/APP Paratransit Taxi Authorization remains `other`; customer-contact-center, CRM, and generic AI/customer outreach technology remain unmapped.
- Post-materialize counts: residual `project_family: other` is `453`; predictive-maintenance technology records remaining `other` dropped from `3` to `1`; `project_meeting-doc-rolling-stock-predictive-maintenance` and `project_meeting-doc-102806-preteckt` now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Arrow Rail Link Feeder Bus Service Project Family

- Re-baselined residual `project_family: other` at `453`; exact `bus service contract` records accounted for `1` residual.
- Local deterministic inspection found bounded service-change payload proof: Metro-North Arrow Rail Link fixed-route scheduled feeder bus service between Spuyten Duyvil / Riverdale stations and surrounding neighborhoods.
- Added a payload-gated `service_change` mapping for `bus_service_contract` only when payload text proves fixed-route / scheduled feeder bus service plus Metro-North/station/neighborhood context.
- Guardrails: emergency/scheduled bus-services contract modifications and generic bus operations contracts remain `other`.
- Post-materialize counts: residual `project_family: other` is `452`; exact `bus service contract` records remaining `other` dropped from `1` to `0`; `project_arrow-rail-link-feeder-bus` now carries `service_change`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - PTC M-8 Fleet Service Contract Project Family

- Re-baselined residual `project_family: other` at `452`; exact `service contract` records accounted for `1` residual.
- Local deterministic inspection found bounded signal/fleet infrastructure payload proof: PTC Software Upgrade for MNR M-8 Fleet.
- Added a payload-gated `capital_or_infrastructure` mapping for `service_contract` only when payload text proves Positive Train Control / PTC plus fleet, M-8, or software-upgrade context.
- Guardrails: generic software/business service contracts and existing fare service contracts remain governed by narrower rules.
- Post-materialize counts: residual `project_family: other` is `451`; exact `service contract` records remaining `other` dropped from `1` to `0`; `project_alstom-ptc-m8-upgrade` now carries `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Sperry Rail Contract Extension Project Family

- Re-baselined residual `project_family: other` at `451`; exact `contract_extension` records accounted for `1` residual.
- Local deterministic inspection found bounded rail-infrastructure payload proof: Sperry Rail ultrasonic rail testing and joint-bar detection services.
- Extended the existing rail/bridge/tunnel inspection contract gate to `contract_extension` only when payload text proves ultrasonic rail or joint-bar inspection context.
- Guardrails: the Small Business Mentoring Program `contract extension` record remains `other`.
- Post-materialize counts: residual `project_family: other` is `450`; exact `contract_extension` records remaining `other` dropped from `1` to `0`; `project_meeting-doc-102756-sperry-rail-extension` now carries `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Grand Central Madison Terminal Operation And Maintenance Contract Project Family

- Re-baselined residual `project_family: other` at `450`; exact `contract award` records accounted for `1` residual and exact `contract_award` records accounted for `1` residual.
- Local deterministic inspection found bounded terminal/facility infrastructure payload proof for `project_gcm-om-contract-ms21001`: operation and maintenance of Grand Central Madison Terminal and related facility assets.
- Added a payload-gated `capital_or_infrastructure` mapping for `contract_award` only when payload text proves operation/maintenance plus terminal, facility-asset, or infrastructure context.
- Guardrails: `project_bos-procurement-2025` remains `other`; simulator procurement, generic professional-services awards, and program-admin contract awards remain unmapped unless payload proves a bounded physical-infrastructure, fare, enforcement, accessibility, or service-change family.
- Post-materialize counts: residual `project_family: other` is `449`; exact `contract award` records remaining `other` dropped from `1` to `0`; exact `contract_award` records remaining `other` stayed at `1`; `project_gcm-om-contract-ms21001` now carries `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - CNG Fueling Facilities Operation And Maintenance Project Family

- Re-baselined residual `project_family: other` at `449`; CNG/fueling residuals accounted for `3` records.
- Local deterministic inspection found `2` records with bounded physical-infrastructure payload proof: CNG fueling facilities operation/maintenance for DOB and MTABC.
- Added a payload-gated `capital_or_infrastructure` mapping for `procurement` and `contract_modification` only when payload text proves CNG/compressed-natural-gas plus fueling-facility operation and maintenance.
- Guardrails: `project_fuel-hedge-program-2022` remains `other`; generic fuel procurement, finance/hedging, simulator, and service-procurement records remain unmapped unless payload proves bounded physical infrastructure or another concrete project family.
- Post-materialize counts: residual `project_family: other` is `447`; CNG/fueling residuals remaining `other` dropped from `3` to `1`; `project_cng-fueling-facilities-extension-2025` and `project_cng-fueling-facilities-ops-maintenance` now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Bus Camera Security System Contract Extension Project Family

- Re-baselined residual `project_family: other` at `447`; Bus Camera Security System / BCSS residuals accounted for `2` records.
- Local deterministic inspection found both residuals are bounded maintenance/extension records for the same BCSS program already represented by enforcement-program maintenance-contract records.
- Added a payload-gated `enforcement_program` mapping for broad `procurement` and `modification` labels only when payload text proves BCSS / Bus Camera Security System plus maintenance, support, or extension context.
- Guardrails: generic camera procurement, generic security-service extensions, and broader CCTV/security design-build records remain unmapped unless payload proves a bounded enforcement, safety, accessibility, fare, service-change, or physical-infrastructure family.
- Post-materialize counts: residual `project_family: other` is `445`; BCSS residuals remaining `other` dropped from `2` to `0`; `project_bcss-extension-105971` and `project_meeting-doc-107531-bus-camera-security-systems-contract` now carry `enforcement_program`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Named Ferry Service Project Family

- Re-baselined residual `project_family: other` at `445`; ferry residuals accounted for `7` records.
- Local deterministic inspection found `3` direct service records with bounded named ferry-route payload proof: Haverstraw-Ossining weekend ferry service, Newburgh-Beacon ferry service, and the NY Waterway ferry-services contract for the Haverstraw-Ossining and Newburgh-Beacon routes.
- Added a payload-gated `service_change` mapping for `service`, `ferry_service`, and `procurement` only when payload text proves ferry service plus named route/service context.
- Guardrails: CMAQ grant and Newburgh-Beacon lease/MOU reimbursement records remain `other`; generic ferry terminal/facility procurement remains unmapped unless payload proves direct service-change scope or a bounded physical-infrastructure family.
- Post-materialize counts: residual `project_family: other` is `442`; ferry residuals remaining `other` dropped from `7` to `4`; `project_haverstraw-ossining-weekend-ferry-2026`, `project_meeting-doc-160311-mn241812`, and `project_newburgh-beacon-ferry-service` now carry `service_change`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Employer-Based Shuttle Agreement Project Family

- Re-baselined residual `project_family: other` at `442`; employer-based shuttle agreement residuals accounted for `4` records.
- Local deterministic inspection found all four records are agreement/amendment records extending or funding the Westchester Employer-Based Shuttle Agreement, including shuttles providing connecting bus service to and from Metro-North stations.
- Added a payload-gated `service_change` mapping for `agreement_amendment`, `amendment`, and `interagency_agreement` only when payload text proves Employer-Based Shuttle Agreement context plus amendment, extension, payment, or subsidy language.
- Guardrails: generic shuttle supervision records and connecting-service grants remain `other`; generic agreement amendments remain unmapped unless payload proves a bounded service-change scope.
- Post-materialize counts: residual `project_family: other` is `438`; employer-shuttle residuals remaining `other` dropped from `4` to `0`; `project_164896-employer-based-shuttle-amend9`, `project_201596-employer-based-shuttle-amend10`, `project_meeting-doc-128906-employer-based-shuttle-amendment`, and `project_wcdpw-employer-based-shuttle-amendment8-dec2023` now carry `service_change`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Named Shuttle And Rail-Link Service Project Family

- Re-baselined residual `project_family: other` at `438`; named shuttle/rail-link service residuals accounted for `3` direct service records.
- Local deterministic inspection found Bridgeport/Waterbury Shuttle, South Fork Commuter Connection, and Hudson Rail Link renewal records with bounded route/service payload proof.
- Added a payload-gated `service_change` mapping for `shuttle_service`, `rail_and_shuttle_bus_service`, and Hudson Rail Link `contract_modification` records only when payload text proves the named service context.
- Guardrails: generic shuttle supervision records and as-needed emergency/scheduled bus service contracts remain `other`; generic shuttle-service discussions remain unmapped unless payload proves a bounded named service-change scope.
- Post-materialize counts: residual `project_family: other` is `435`; the three named shuttle/rail-link targets now carry `service_change`: `project_bridgeport-waterbury-shuttle`, `project_meeting-doc-113891-south-fork-commuter`, and `project_hudson-rail-link-contract-modification`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Verrazzano HOV/Bus Lane Operations Project Family

- Re-baselined residual `project_family: other` at `435`; Verrazzano HOV/bus-lane operations residuals accounted for `2` explicit bus-lane records plus `1` adjacent median-barrier-only record.
- Local deterministic inspection found two records with bounded bus-priority payload proof: HOV/Bus Lane Operations at the Verrazzano-Narrows Bridge and VNB Barrier Transfer Machine / HOV/Bus Lane services.
- Added a payload-gated `bus_priority` mapping for `contract_modification` and `public_works_contract_modification` only when payload text proves both HOV/bus-lane operations and Verrazzano/VNB context.
- Guardrails: the median-barrier-only extension remains `other`; generic HOV operations and barrier-transfer records remain unmapped unless payload proves bus-lane operations.
- Post-materialize counts: residual `project_family: other` is `433`; `project_meeting-doc-186961-hov-bus-lane-ops` and `project_triumph-vnm399-modification` now carry `bus_priority`, while `project_meeting-doc-186961-median-barrier-transfer` remains `other`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - MTAPD Public Safety Software Project Family

- Re-baselined residual `project_family: other` at `433`; MTAPD/CentralSquare public-safety software residuals accounted for `2` records.
- Local deterministic inspection found both target records are procurement-shaped MTA Police public-safety software/suite implementations.
- Added a payload-gated `enforcement_program` mapping for `procurement` and `competitive_procurement` only when payload text proves public-safety software/suite context plus MTAPD/MTA Police context.
- Guardrails: security-grant records, generic public-safety outreach platforms, and customer-service software replacements remain `other`.
- Post-materialize counts: residual `project_family: other` is `431`; `project_meeting-doc-79341-centralsquare-ps` and `project_mtapd-software-central-square` now carry `enforcement_program`, while `project_meeting-doc-115236-security-grant-program` remains `other`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Radio System Replacement Project Family

- Re-baselined residual `project_family: other` at `431`; radio residuals accounted for `5` records.
- Local deterministic inspection found `3` bounded communications-infrastructure records: MNR Radio System Upgrades Phase 1, NYCT Bus Radio System, and UHF T-Band Radio System Replacement.
- Added a payload-gated `capital_or_infrastructure` mapping for `design_build`, `design_build_contract`, and `systems_replacement` only when payload text proves radio-system replacement or upgrade scope.
- Guardrails: radio maintenance/procurement support records, PBX/audio call recording systems, CCTV/security monitoring systems, and generic communications software remain `other` unless another bounded rule applies.
- Post-materialize counts: residual `project_family: other` is `428`; radio residuals remaining `other` dropped from `5` to `2`; `project_mnr-radio-system-upgrades-phase1`, `project_nyct-bus-radio-system`, and `project_uhf-t-band-radio-replacement` now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Subway Customer Service Center Project Family

- Re-baselined residual `project_family: other` at `428`; Customer Service Center mentions accounted for `8` residual records.
- Local deterministic inspection found `3` station-facing subway Customer Service Center records that match existing concrete CSC infrastructure records.
- Added a payload-gated `capital_or_infrastructure` mapping for `customer_service` and `customer_service_initiative` only when payload text proves Customer Service Centers plus subway/station or OMNY/Reduced-Fare support context.
- Guardrails: NYCSC tolling/customer-service-center systems, PMOC/personal-service contracts, NCBA E-ZPass support, contact-center software, CRM systems, and generic customer-service initiatives remain `other`.
- Post-materialize counts: residual `project_family: other` is `425`; Customer Service Center residuals remaining `other` dropped from `8` to `5`; `project_customer-service-centers`, `project_meeting-doc-104781-customer-service-centers`, and `project_meeting-doc-128921-customer-service-centers` now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Station Parking Infrastructure Project Family

- Re-baselined residual `project_family: other` at `425`; parking/garage residuals accounted for `34` records.
- Local deterministic inspection found `5` station-parking infrastructure records: Brewster Yard Phase 1 Parking Garage and Transportation Hub, Croton Falls Station Parking Expansion, Harrison Station Parking Garage, Croton Falls Parking Facility, and Poughkeepsie Station Garage Structural Repairs.
- Added a payload-gated `capital_or_infrastructure` mapping for `parking_expansion`, `parking_facility`, and `parking_garage_and_transportation_hub` only when payload text proves parking garage/lot construction or expansion context, plus a narrow `structural_repairs` rule for Poughkeepsie Station Garage repair payloads.
- Guardrails: RFK Fleet Garage repairs, parking fee structures, parking permits, parking licenses, event parking, TOD ground leases, and generic parking operations remain `other`.
- Post-materialize counts: residual `project_family: other` is `420`; parking/garage residuals remaining `other` dropped from `34` to `29`; `project_brewster-yard-phase1-parking`, `project_croton-falls-parking-expansion`, `project_harrison-station-parking-garage`, `project_meeting-doc-113891-croton-falls-parking`, and `project_poughkeepsie-station-garage-repairs` now carry `capital_or_infrastructure`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Direct Fare And Toll Product Project Family

- Re-baselined residual `project_family: other` at `420`; toll/fare product residuals accounted for `20` records.
- Local deterministic inspection found `4` direct fare/toll product records: congestion-pricing implementation, congestion-pricing pricing program context, Tolls NY mobile payment app, and Saturday Summer Savings ticket discount program.
- Added a payload-gated `fare_program` mapping for `tolling_program_implementation` and `pricing_program` only when payload text proves congestion-pricing/CBD tolling context, for `mobile_application` only when payload proves E-ZPass/Tolls by Mail/toll-payment context, and for `discount_program` only when payload proves fare/ticket/TrainTime context.
- Guardrails: E-ZPass implementation support, toll violation fee regulatory changes, E-ZPass/transponder procurement, cashless tolling maintenance contracts, customer-contact contracts, and toll consultant support remain `other`.
- Post-materialize counts: residual `project_family: other` is `416`; toll/fare product residuals remaining `other` dropped from `20` to `16`; `project_batch045-congestion-pricing-implementation`, `project_congestion-pricing-dec2024`, `project_meeting-doc-124281-tolls-ny-app`, and `project_meeting-doc-176346-saturday-summer-savings` now carry `fare_program`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Rail Track And Signal Infrastructure Project Family

- Re-baselined residual `project_family: other` at `416`; exact rail track/signal infrastructure project types accounted for `18` residual records.
- Local deterministic inspection found physical rail-infrastructure records covering LIRR Expansion, CP 4/5/6 signal and communications upgrades, Great Neck and Massapequa pocket-track work, GCT terminal track rehabilitation, Babylon-Patchogue signalization, 207th Street track/signal repairs, Ronkonkoma switch/signal work, Montauk Branch track maintenance/signal cutover, Fulton-Liberty CBTC signal replacement, Port Jefferson Branch track work, Queens Boulevard East CBTC, Queens Interlocking renewal, track-panel renewal, Pelham/Concourse/Dyre track replacement, West Hempstead/Far Rockaway track and power maintenance, and Winter Trackwork Programs.
- Added exact `capital_or_infrastructure` project-type mappings for bounded physical rail expansion, pocket-track, track/signal repair, signalization, signal replacement/modernization, switch/signal work, track renewal/replacement/rehabilitation, and track-maintenance/signal-cutover labels.
- Guardrails: track outages, schedule-only changes, signal testing, signal-testing/cutover outage records, signaling maintenance contracts, real-estate easements/licenses, traffic-control software upgrades, track-access management systems, and internal dispatching applications remain `other`.
- Post-materialize counts: residual `project_family: other` is `398`; exact rail track/signal infrastructure targets remaining `other` dropped from `18` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Station And Platform Infrastructure Project Family

- Re-baselined residual `project_family: other` at `398`; exact station/platform infrastructure labels accounted for `5` residual records.
- Local deterministic inspection found physical station-infrastructure records: Harlem Line Station Improvements, Hudson Line High-Level Platform Refurbishment, Upper Hudson and Upper Harlem Station Repairs, Mineola Station Improvements, and MNR Station Improvements Initiatives.
- Added exact `capital_or_infrastructure` project-type mappings for `station_improvements`, `station_modernization`, `station_repair`, `station_enhancement`, and `platform_refurbishment`.
- Guardrails: station reopening, station refresh/aesthetics, and ADA/signage-only improvement records remain `other` unless a narrower accessibility/safety rule is added later.
- Post-materialize counts: residual `project_family: other` is `393`; exact station/platform infrastructure targets remaining `other` dropped from `5` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Facility And Structural Infrastructure Project Family

- Re-baselined residual `project_family: other` at `393`; bounded facility, line-structure, and tunnel-lighting infrastructure residuals accounted for `5` records.
- Local deterministic inspection found two Bedford Avenue Maintenance Shop acquisition records, Jamaica Bus Terminal Relocation to a new facility, Broadway/8th Avenue line-structure component repairs, and Atlantic Branch Tunnel Lighting.
- Added exact `capital_or_infrastructure` project-type mappings for `structural_repairs_design_bid_build` and `tunnel_lighting_installation`, plus payload-gated maintenance-shop acquisition and permanent terminal-relocation mappings.
- Guardrails: generic facility acquisition, real-estate acquisition, facility relocation, temporary terminal swing-space leases, generic repair, and broad lighting records remain `other` unless payload evidence proves bounded physical infrastructure.
- Post-materialize counts: residual `project_family: other` is `388`; targeted facility/structural/tunnel infrastructure records remaining `other` dropped from `5` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Station Bike Rack Project Family

- Re-baselined residual `project_family: other` at `388`; one source-label-masked bike-facility residual remained under a `small business mentoring program` project label.
- Local deterministic inspection found `project_14-mnr-bike-racks-208006`, whose payload describes installation of bicycle racks and related work at 14 Metro-North stations.
- Added a payload-gated `bike_facility` mapping for `small_business_mentoring_program` only when payload text proves bike/bicycle racks at stations.
- Guardrails: generic small-business mentoring services, loan repayment administration, and unrelated mentoring/admin contracts remain `other`.
- Post-materialize counts: residual `project_family: other` is `387`; targeted bike-rack records remaining `other` dropped from `1` to `0`; total `bike_facility` project records rose from `1` to `2`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Route Service Change Project Family

- Re-baselined residual `project_family: other` at `387`; route/routing/service-improvement residuals with explicit route-service payloads accounted for `3` records.
- Local deterministic inspection found B63 Travel Path Revision, permanent southbound M125 routing change, and Targeted Improvements on 28 Lower Performing Routes.
- Added payload-gated `service_change` mappings for `route_revision` and `routing_change` only when payload text includes concrete route tokens, and for `service_improvement_initiative` only when payload text proves lower-performing routes, targeted improvements, or bus-ridership context.
- Guardrails: generic route-documentation revisions, customer-service training/outreach, customer-service programs, station-agent customer-service modernization, and paratransit technology/service-improvement records remain `other`.
- Post-materialize counts: residual `project_family: other` is `384`; targeted route-service records remaining `other` dropped from `3` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Paratransit Vehicle Procurement Project Family

- Re-baselined residual `project_family: other` at `384`; one paratransit bus/van purchase ratification remained under `procurement_ratification`.
- Local deterministic inspection found `project_meeting-doc-98321-paratransit-vehicles`, a ratification of Immediate Operating Need for purchase of 20 Paratransit Ford Cutaway buses and 20 Paratransit Ford Transit vans.
- Extended the existing payload-gated vehicle-procurement mapping to `procurement_ratification` only when payload text proves vehicle purchase/delivery scope, adding bus/van/cutaway evidence tokens for this fleet case.
- Guardrails: paratransit technology systems, AVLM/RTS/CAD replacements, contact-center services, eligibility assessment contracts, carrier-service options, and contingency ride-service records remain `other`.
- Post-materialize counts: residual `project_family: other` is `383`; targeted paratransit vehicle ratifications remaining `other` dropped from `1` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Paratransit Assessment Center Project Family

- Re-baselined residual `project_family: other` at `383`; paratransit eligibility/assessment-center residuals accounted for `2` records.
- Local deterministic inspection found an Eligibility Assessment Services modification adding a Brooklyn Assessment Center and the Queens Assessment Center for independent eligibility assessment of applicants for paratransit service.
- Added a payload-gated `accessibility_or_safety` mapping for `paratransit_facility` and `personal_miscellaneous_service_contract_modification` only when payload text proves a paratransit/Reduced-Fare eligibility assessment center.
- Guardrails: paratransit technology systems, AVLM/RTS/CAD replacements, contact-center services, carrier-service options, contingency ride-service records, and generic personal/miscellaneous service modifications remain `other`.
- Post-materialize counts: residual `project_family: other` is `381`; targeted paratransit assessment-center records remaining `other` dropped from `2` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Station Access Elevator/Escalator Project Family

- Re-baselined residual `project_family: other` at `381`; station-access elevator/escalator-shaped residuals accounted for `5` records.
- Local deterministic inspection found ADA P3 station-elevator upgrades, Emergency Elevator 2-Way Communications, Grand Central Biltmore station-access connection, Three Line Bundles accessibility design/engineering, and Midtown 42nd Street Corridor elevator/escalator work.
- Added payload-gated `accessibility_or_safety` mappings for ADA P3 station-elevator packages, Grand Central Biltmore station-access improvements, emergency elevator two-way communications, and design/engineering bundles with accessibility/ADA/escalator evidence.
- Guardrails: Penn Station Access-adjacent yard/station/coach-car records, project-management-services records, and generic access-looking records remain `other` unless payload evidence proves bounded accessibility assets.
- Post-materialize counts: residual `project_family: other` is `377`; station-access targets now carrying `accessibility_or_safety` rose by `4`, with `1` target remaining `other`.
- Follow-up: the remaining Midtown 42nd Street Corridor record needs merge-time companion promotion or source-specific typing. Its accepted elevator/escalator observation lacks `project_type`, while a sibling accepted `corridor_project` observation carries only project/construction-management wording.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Physical Climate/Disaster Recovery Project Family

- Re-baselined residual `project_family: other` at `377`; physical climate/disaster-recovery infrastructure residuals accounted for `2` records.
- Local deterministic inspection found Coney Island Yard Complex Superstorm Sandy Repair and Hudson Line Resilience.
- Added payload-gated `capital_or_infrastructure` mappings for `disaster_recovery_restoration` only when payload text proves Superstorm Sandy damage/restoration at the Coney Island Yard/Complex, and for `resilience_climate_protection` only when payload text proves Hudson Line protection from climate threats, flooding, and sea-level-rise flooding.
- Guardrails: climate-roadmap/strategy records, generic resiliency records, signal-tower license/easement records, and vague rehabilitation records remain `other`.
- Post-materialize counts: residual `project_family: other` is `375`; targeted physical climate/disaster-recovery records remaining `other` dropped from `2` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Restriction Effective Implementation Events

- Re-baselined residual `event_family: other` at `2009`; exactly `1` `restriction_effective` event remained in the other bucket.
- Local deterministic inspection found `event_101av-left-turn-restriction-oct26-2017`, whose payload says a 101 Av southbound left-turn restriction goes into effect.
- Added an exact `restriction_effective` event-kind mapping to `implementation`.
- Guardrails: generic effective-date records, document dates, contract starts, and agreement effective dates remain `other`.
- Post-materialize counts: residual `event_family: other` is `2008`; `restriction_effective` records remaining `other` dropped from `1` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Emergency Exercise Implementation Events

- Re-baselined residual `event_family: other` at `2008`; raw `emergency_exercise` records accounted for `5` records.
- Local deterministic inspection found five conducted or simulated emergency preparedness/responder exercises at Floral Park, Grand Central Madison, Norwalk/Walk Bridge, and Poughkeepsie.
- Added a raw-literal-gated `emergency_exercise` event-kind mapping to `implementation`.
- Guardrails: generic `training`, `certification`, `safety event`, and spaced `emergency exercise` labels remain `other`.
- Post-materialize counts: residual `event_family: other` is `2003`; raw `emergency_exercise` records remaining `other` dropped from `5` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Stakeholder Walkthrough Public Engagement Events

- Re-baselined residual `event_family: other` at `2003`; `walkthrough` records accounted for `4` records.
- Local deterministic inspection found 125th Street SBS planning and DOT/elected-official/NYCT President corridor walkthrough records.
- Added payload-gated `walkthrough` mapping to `public_engagement` only when payload text proves SBS planning, community walkthrough context, elected-official context, DOT Commissioner context, or NYCT President context.
- Guardrails: generic internal/back-office walkthrough records remain `other`; exact `site tour` records remain outside this rule.
- Post-materialize counts: residual `event_family: other` is `1999`; `walkthrough` records remaining `other` dropped from `4` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Leadership Change Milestone Events

- Re-baselined residual `event_family: other` at `1999`; `leadership_change` records accounted for `2` records.
- Local deterministic inspection found Janno Lieber named Acting MTA Board Chair/CEO and Justin Vonashek assuming the Metro-North presidency.
- Added exact `leadership_change` event-kind mapping to `milestone`.
- Guardrails: generic `personnel start`, social/employee events, fleet transition/commissioning/upgrade, and in-service-date labels remain `other`.
- Post-materialize counts: residual `event_family: other` is `1997`; `leadership_change` records remaining `other` dropped from `2` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Appraisal Milestone Events

- Re-baselined residual `event_family: other` at `1997`; `appraisal` records accounted for `7` records.
- Local deterministic inspection found real-estate appraisal/valuation records for 2 Broadway, Hartsdale, required easements, Tarrytown, and 3876-3880 Park Avenue.
- Added payload-gated `appraisal` mapping to `milestone` only when payload text proves an appraisal was solicited, completed, commissioned, appraised, or has an effective valuation date.
- Guardrails: bare/generic appraisal labels and future-review appraisal topics remain `other`.
- Post-materialize counts: residual `event_family: other` is `1990`; `appraisal` records remaining `other` dropped from `7` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - ACTA Establishment Milestone Events

- Re-baselined residual `event_family: other` at `1990`; `establishment` records accounted for `3` records.
- Bounded Codex subagent audit independently ranked `establishment` as a high-confidence `3` of `3` cleanup candidate and recommended the same ACTA/advisory-committee successor gate.
- Local deterministic inspection found three Advisory Committee for Transit Accessibility (ACTA) records established as successor to the CCC.
- Added payload-gated `establishment` mapping to `milestone` only when payload text proves ACTA / Advisory Committee for Transit Accessibility was established as successor.
- Guardrails: generic establishment labels remain `other`.
- Post-materialize counts: residual `event_family: other` is `1987`; `establishment` records remaining `other` dropped from `3` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Next ranked event-family candidates: `procurement_action` approval-gated records (`4` of `6`) and `fare_system_change` implementation-gated records (`3` of `3`; implemented in the next slice).

## Latest Slice - Fare-System-Change Implementation Events

- Re-baselined residual `event_family: other` at `1987`; `fare_system_change` records accounted for `3` records.
- Local deterministic inspection found concrete fare-media changes: MetroCard no longer accepted, MetroCards no longer sold, and the OMNY card fee promotion ending.
- Added payload-gated `fare_system_change` mapping to `implementation` only when payload text proves MetroCard acceptance/sales ending or OMNY card fee-promotion ending.
- Guardrails: generic fare-system modernization/update labels remain `other`; generic `fare_change`, standalone fare increase, proposed fare increase, and projected fare/toll increase labels remain guarded by existing tests.
- Post-materialize counts: residual `event_family: other` is `1984`; `fare_system_change` records remaining `other` dropped from `3` to `0`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Next ranked event-family candidate: `procurement_action` approval-gated records (`4` of `6`).

## Latest Slice - Procurement-Action Approval Events

- Re-baselined residual `event_family: other` at `1984`; `procurement_action` records accounted for `6` records.
- Local deterministic inspection found four approval-proven records: three procurement actions seeking Board approval and one Immediate Operating Need declaration issued and approved by MTA executives.
- Added payload-gated `procurement_action` mapping to `approval` only when payload text proves `seeks Board approval`, `MTA Board approval`, or an Immediate Operating Need was issued and approved.
- Guardrails: `procurement_action` records that only say an award was made or proposed remain `other`.
- Post-materialize counts: residual `event_family: other` is `1980`; `procurement_action` records remaining `other` dropped from `6` to `2`; `procurement_action` records carrying `approval` rose to `4`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Next-Steps Planning Events

- Re-baselined residual `event_family: other` at `1980`; `next_steps` records accounted for `4` records.
- Local deterministic inspection found four planning-process records for M86 SBS / bus-priority work: traffic/transit data analysis, conceptual design, detailed plans with Community Boards, CAC meeting, and preferred-plan development.
- Added payload-gated `next_steps` mapping to `planning` only when payload text proves data/traffic/transit analysis, conceptual or detailed planning, Community Board discussion, or CAC meeting evidence.
- Guardrails: generic `next_steps` labels and broad “design ideas / preferred plan” text without those process anchors remain `other`.
- Post-materialize counts: residual `event_family: other` is `1976`; `next_steps` records remaining `other` dropped from `4` to `0`; `next_steps` records carrying `planning` rose to `4`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - CBDTP Pause Policy Announcements

- Re-baselined residual `event_family: other` at `1976`; `policy announcement` records accounted for `4` records.
- Local deterministic inspection found two CBDTP policy announcements that explicitly announced an intention to pause implementation.
- Added payload-gated `policy announcement` mapping to `pause` only when payload text proves an announced pause of Central Business District Tolling Program / CBDTP implementation.
- Guardrails: generic policy announcements, safety-plan announcements, and plan-launch announcements remain `other`.
- Post-materialize counts: residual `event_family: other` is `1974`; `policy announcement` records remaining `other` dropped from `4` to `2`; two CBDTP pause announcements now carry `pause`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Actual/Completed Closeout Events

- Re-baselined residual `event_family: other` at `1974`; `closeout` records accounted for `4` records.
- Local deterministic inspection found one Massapequa Pocket Track closeout record whose payload proves completed/actual closeout.
- Added payload-gated `closeout` mapping to `implementation` only when payload text proves completed or actual closeout.
- Guardrails: forecast closeout records and generic closeout labels without completed/actual proof remain `other`.
- Post-materialize counts: residual `event_family: other` is `1973`; `closeout` records remaining `other` dropped from `4` to `3`; one actual/completed closeout now carries `implementation`.
- Bounded Codex subagent Hilbert completed a read-only ranking of next small event buckets and recommended spaced `emergency exercise` / `emergency_drill` as the next high-confidence implementation lane.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Spaced Emergency Exercise Events

- Re-baselined residual `event_family: other` at `1973`; spaced `emergency exercise` and `emergency_drill` records accounted for `3` records.
- Local deterministic inspection found annual emergency management/preparedness exercises and one full-scale emergency drill with simulated fire, evacuation, responder, or safety-protocol evidence.
- Added payload-gated mapping to `implementation` for `emergency exercise` and `emergency_drill` only when payload text proves emergency exercise/drill context.
- Guardrails: bare `emergency exercise`, generic `training`, `certification`, and `safety event` labels remain `other`.
- Post-materialize counts: residual `event_family: other` is `1970`; spaced emergency-exercise/drill records remaining `other` dropped from `3` to `0`; three records now carry `implementation`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Signal Testing Service Impacts

- Re-baselined residual `event_family: other` at `1970`; `signal testing` records accounted for `3` records.
- Bounded Codex subagent Hubble independently ranked `signal testing` as the top candidate and recommended a direct service-impact guard.
- Local deterministic inspection found three Queens Interlocking signal-testing weekend records with tracks out of service, bus replacement, bypassed stops, no-service, or reduced-service evidence.
- Added payload-gated `signal testing` mapping to `pause` only when payload text proves direct service impact.
- Guardrails: bare `signal testing`, signal-testing/cutover project labels, signal-testing contract labels, and generic trackwork advisories remain `other`.
- Post-materialize counts: residual `event_family: other` is `1967`; `signal testing` records remaining `other` dropped from `3` to `0`; three records now carry `pause`.
- Next subagent-ranked lanes: charter-review approval guards and `delivery_complete` vehicle delivery-completion guards.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Committee Charter Review Approvals

- Re-baselined residual `event_family: other` at `1967`; committee-charter review shaped records accounted for `12` records.
- Local deterministic inspection found ten annual/charter/committee-review records with explicit committee-charter approval or revision-approval evidence.
- Added payload-gated mapping to `approval` for annual review, charter review, committee charter review, and committee review records only when payload text proves committee charter plus approval/revision-approval context.
- Guardrails: generic committee review, budget review, performance review, and committee-charter review records without approval proof remain `other`.
- Post-materialize counts: residual `event_family: other` is `1957`; committee-charter review shaped records remaining `other` dropped from `12` to `2`; ten records now carry `approval`.
- Next subagent-ranked lane: `delivery_complete` vehicle delivery-completion guard.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Vehicle Delivery-Complete Events

- Re-baselined residual `event_family: other` at `1957`; exact `delivery_complete` records accounted for `2` records.
- Local deterministic inspection found two locomotive delivery-completion records with vehicle/fleet evidence.
- Added payload-gated mapping to `implementation` for exact `delivery_complete` only when payload text proves delivery completion plus vehicle/fleet terms.
- Guardrails: delivery periods/windows, generic `delivery` scheduled-completion records, software delivery/receipt records, and `rolling_stock_delivery` labels remain `other`.
- Post-materialize counts: residual `event_family: other` is `1955`; exact `delivery_complete` records remaining `other` dropped from `2` to `0`; two records now carry `implementation`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Board Approval Request Events

- Re-baselined residual `event_family: other` at `1955`; exact `board_action_request` and `board_request` records accounted for `2` records.
- Local deterministic inspection found two records whose payloads explicitly request or are requesting Board approval.
- Added payload-gated mapping to `approval` for exact `board_action_request` and `board_request` only when payload text proves request/requesting Board approval.
- Guardrails: `board_submission` records submitted after public comment, recommend-action budget records, board briefings/updates, and board reviews remain `other`.
- Post-materialize counts: residual `event_family: other` is `1953`; exact Board-approval request records remaining `other` dropped from `2` to `0`; two records now carry `approval`; `board_submission` remains `other`.
- Bounded Codex subagent Turing completed a read-only residual event-family ranking and recommended `employee resource group event` -> `public_engagement` (`8` records) as the next lane, followed by exact `ERG event` (`9` records) if examples remain clean.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Employee Resource Group Events

- Re-baselined residual `event_family: other` at `1953`; the normalized `employee_resource_group_event` key had `90` total records, including `60` payload-proven targets (`52` snake_case plus `8` spaced literals) and `30` guarded residuals.
- Local deterministic inspection found ERG/public-event payload proof such as ERG, Employee Resource Group, All Generational, B.E.G.I.N., Latinos & Friends, Young Professionals, Cafecito Chat, train module workshops, speed networking, Black History Month, and holiday gatherings.
- Added payload-gated mapping to `public_engagement` for the normalized exact `employee_resource_group_event` key only when those bounded proof terms appear in payload text.
- Guardrails: the `30` employee-resource-group records without bounded proof terms remain `other`; `ERG event`, `erg_event`, `employee_event`, `employee engagement event`, `workforce event`, networking buckets, `ERG membership drive`, `ERG event series`, and `ERG Celebration` remain `other`.
- Post-materialize counts: residual `event_family: other` is `1893`; normalized employee-resource-group records remaining `other` dropped from `90` to `30`; `60` records now carry `public_engagement`; adjacent guarded buckets remain `other`.
- Next lane: exact `ERG event` remains Turing's next ranked candidate (`9` records), pending a separate rebaseline and guardrail pass.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - ERG Events

- Re-baselined residual `event_family: other` at `1893`; the normalized `erg_event` key had `13` total records (`9` spaced `ERG event` plus `4` snake_case `erg_event`).
- Local deterministic inspection found all `13` records carried ERG/public-event proof such as B.E.G.I.N., Black Employee Group, All Generational, TransportAsian, Multicultural, Latinos & Friends, Pride Express, Veterans, EWT, Black History, Juneteenth, Stonewall, dynamic dialogues, cross-cultural exchange, lunch-and-learn, or all-member meeting.
- Added payload-gated mapping to `public_engagement` for the normalized exact `erg_event` key only when those bounded proof terms appear in payload text.
- Guardrails: `ERG membership drive`, `ERG event series`, `ERG Celebration`, `employee_event`, `employee engagement event`, `workforce event`, and networking buckets remain `other`.
- Post-materialize counts: residual `event_family: other` is `1880`; normalized `erg_event` records remaining `other` dropped from `13` to `0`; all `13` now carry `public_engagement`; adjacent guarded buckets remain `other`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Employee Engagement Events

- Re-baselined residual `event_family: other` at `1880`; normalized `employee_engagement_event` accounted for `6` records.
- Bounded Codex subagent Gibbs independently ranked `employee engagement event` as the best next adjacent public-engagement bucket and recommended exact-key plus named ERG/hosted-event proof.
- Added payload-gated mapping to `public_engagement` for normalized `employee_engagement_event` when event text proves hosted employee/ERG engagement context through hosted/program/tour/commemoration/storytelling/trivia/bingo/Cafecito/heritage-month or named ERG terms.
- Guardrails: `employee_event`, `workforce event`, networking buckets, `ERG membership drive`, `ERG event series`, and `ERG Celebration` remain `other`.
- Post-materialize counts: residual `event_family: other` is `1874`; normalized employee-engagement records remaining `other` dropped from `6` to `0`; all `6` now carry `public_engagement`; adjacent guarded buckets remain `other`.
- Next lane: Gibbs ranked `ERG Celebration` as the next adjacent candidate (`3` records), pending a separate rebaseline and guardrail pass. `employee_event` remains a policy-change bucket because existing tests intentionally keep it `other`.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - ERG Celebrations

- Re-baselined residual `event_family: other` at `1874`; normalized `erg_celebration` accounted for `3` records.
- Local deterministic inspection found all three were named ERG cultural/heritage celebrations: B.E.G.I.N. Black History Month, B.E.G.I.N. Umoja/Kwanzaa, and EWT Women's History Month.
- Added payload-gated mapping to `public_engagement` for normalized `erg_celebration` when event text proves B.E.G.I.N., ERG, EWT/Empowering Women, Black History Month, Women's History Month, Kwanzaa, Umoja, cultural celebration, or celebration context.
- Guardrails: `ERG membership drive`, `ERG event series`, `employee_event`, `workforce event`, networking buckets, charity/fundraising walks, and blood drives remain `other`.
- Post-materialize counts: residual `event_family: other` is `1871`; normalized ERG Celebration records remaining `other` dropped from `3` to `0`; all `3` now carry `public_engagement`; adjacent guarded buckets remain `other`.
- Next adjacent public-engagement candidates are weaker policy decisions: `employee_event` has existing negative tests, networking/workforce are employee-internal, and charity/fundraising/blood-drive records likely need a separate social/community event policy.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Scheduled Maintenance Bus Replacements

- Re-baselined residual `event_family: other` at `1871`; normalized `scheduled_maintenance` accounted for `2` records.
- Local deterministic inspection found both records described switch work where buses or bus service replaced train service.
- Added payload-gated mapping to `pause` for normalized `scheduled_maintenance` only when event text proves switch work plus bus/buses replacing train service.
- Guardrails: bare scheduled maintenance, maintenance-window records, trackwork advisories, trackwork program updates, and generic signal-testing records remain `other` unless their own exact rule proves direct service impact.
- Post-materialize counts: residual `event_family: other` is `1869`; normalized scheduled-maintenance records remaining `other` dropped from `2` to `0`; both records now carry `pause` and preserve `lifecycle_phase: planned`.
- Bounded Codex subagent Rawls completed a read-only residual event-family ranking and recommended `contract_end` as the next lane (`8` records), with exact-key plus contract-term endpoint proof and guards for adjacent contract-start/term/extension/modification buckets.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Contract-End Milestones

- Re-baselined residual `event_family: other` at `1869`; normalized `contract_end` accounted for `8` records.
- Local deterministic inspection and Rawls's read-only ranking agreed that all eight records were contract endpoint/end-date events.
- Added payload-gated mapping to `milestone` for normalized `contract_end` only when event text proves a contract endpoint, end date, contract-term end, or through-date.
- Guardrails: bare `contract_end`, `contract_start`, `contract_term`, `contract_term_end`, `contract_period`, `contract_extension`, `contract_option_period`, `contract_expiration`, and non-approval `contract_modification` records remain `other` unless their own exact bucket and payload proof are reviewed separately.
- Post-materialize counts: residual `event_family: other` is `1861`; normalized contract-end records remaining `other` dropped from `8` to `0`; all `8` now carry `milestone`.
- Next Rawls-ranked candidates remain `infrastructure_activation` (`2` records) and `contract_term_end` (`4` records), pending separate rebaseline and guardrail passes.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Infrastructure Activation Events

- Re-baselined residual `event_family: other` at `1861`; normalized `infrastructure_activation` accounted for `2` records.
- Local deterministic inspection found one pantograph charger record expected to be in operation and one Waterbury Branch CTC record describing activated/activating train-control infrastructure.
- Added payload-gated mapping to `implementation` for normalized `infrastructure_activation` only when event text proves operational, in-operation, activating, or activated infrastructure.
- Guardrails: bare infrastructure-activation labels, `service_activation`, `deployment`, `bus_deployment`, `commissioning_scheduled`, and `estimated_start` records remain `other` unless separately reviewed with exact-bucket proof.
- Post-materialize counts: residual `event_family: other` is `1859`; normalized infrastructure-activation records remaining `other` dropped from `2` to `0`; both records now carry `implementation`.
- Next Rawls-ranked candidate is `contract_term_end` (`4` records), pending a separate rebaseline and guardrail pass.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Contract-Term-End Milestones

- Re-baselined residual `event_family: other` at `1859`; normalized `contract_term_end` accounted for `4` records.
- Local deterministic inspection found all four were contract term endpoint/end-date facts.
- Added payload-gated mapping to `milestone` for normalized `contract_term_end` only when event text proves a contract term endpoint or end date.
- Guardrails: bare `contract_term_end`, `contract_start`, `contract_term`, `contract_period`, `contract_extension`, `contract_option_period`, `contract_expiration`, and non-approval `contract_modification` records remain `other` unless separately reviewed with exact-bucket proof.
- Post-materialize counts: residual `event_family: other` is `1855`; normalized contract-term-end records remaining `other` dropped from `4` to `0`; all `4` now carry `milestone`.
- Rawls's small ranked event-family list is now consumed; next slice should pick a fresh measured residual bucket before implementing.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Customer Engagement Events

- Re-baselined residual `event_family: other` at `1855`; normalized `customer_engagement` accounted for `3` records.
- Local deterministic inspection found three customer-facing public engagement events: Connect with Us at Cortlandt Station, a customer appreciation luncheon at MTA headquarters, and TransitTalk engagement on OMNY, reduced-fare options, wide-aisle gates, and quality-of-life initiatives.
- Added payload-gated mapping to `public_engagement` for normalized `customer_engagement` only when event text proves Connect with Us, TransitTalk, engaged customers, customer appreciation, or an appreciation luncheon.
- Guardrails: bare `customer_engagement`, `public_event`, `community_event`, `employee_event`, broad `workshop`, `deployment`, and `fare_increase` records remain `other` unless separately reviewed with exact-bucket proof.
- Post-materialize counts: residual `event_family: other` is `1852`; normalized customer-engagement records remaining `other` dropped from `3` to `0`; all `3` now carry `public_engagement`; adjacent `public_event` (`32`), `community_event` (`10`), and `employee_event` (`4`) buckets remain `other`.
- Bounded Codex subagent Tesla completed a read-only residual event-family ranking. Its `contract_start`, `workshop`, `deployment`, `fare_increase`, and `service activation` suggestions were deferred because the examples mix endpoint/start semantics, internal events, generic deployment, proposed/effective fare changes, or launch-vs-implementation policy.
- Disk note: deterministic materialization wrote JSONL but could not complete the local SQLite build because the repo filesystem is full. Rebuilt the canonical DB from the just-written JSONL plus submission metadata directly on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db` to that rebuilt DB.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Panel Discussion Events

- Re-baselined residual `event_family: other` at `1852`; normalized `panel_discussion` accounted for `6` records.
- Bounded Codex subagent Jason reviewed the tiny `relation_family: other` bucket first and recommended no relation rule because the four residual `serves`/`affects` records are endpoint-contamination or self-edge shaped, not safe family misses.
- Bounded Codex subagent Lorentz independently confirmed `panel_discussion` was safe if gated by payload proof, and caught the `women_s_history_month` apostrophe-token variant needed for Women's History Month.
- Added payload-gated mapping to `public_engagement` for normalized `panel_discussion` only when event text proves B.E.G.I.N., EWT/Empowering Women, Women's History Month, International Women's Day, Black Excellence, workplace-panel, or art-showcase context.
- Guardrails: bare `panel_discussion`, generic `panel`, `panel_creation`, `panel_announcement`, `private_event`, `public_event`, `tour`, `lunch_and_learn`, and `employee_event` records remain `other` unless separately reviewed with exact-bucket proof.
- Post-materialize counts: residual `event_family: other` is `1846`; normalized panel-discussion records remaining `other` dropped from `6` to `0`; all `6` now carry `public_engagement`.
- Disk note: deterministic materialization wrote complete canonical JSONL but failed on the repo filesystem with `ENOSPC`; rebuilt the canonical DB from JSONL on `/tmp`, repaired SQLite FTS there (`quick_check: ok`), and repointed `data/canonical.db`. The failed run also left one untracked generated project page with a partial writer region; repaired it deterministically from generated frontmatter plus the complete alias writer region.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Emergency Repair Projects

- Re-baselined residual `project_family: other` at `375`; normalized `emergency_repair` accounted for `2` records.
- Bounded Codex subagent Maxwell confirmed both records are R251/Vacuum Train 4 fire-damage repairs involving Filter Car 2 replacement, fabrication, installation, wiring, and software, and recommended excluding bare `rail` as equipment proof.
- Added payload-gated mapping to `capital_or_infrastructure` for normalized `emergency_repair` only when project text proves fire damage, specific train/filter-car/R251/vacuum-train equipment, and concrete repair/replacement/fabrication/installation work.
- Guardrails: generic emergency repair, bare-rail emergency repair, non-`emergency_repair` repair records, maintenance, rehabilitation, procurement, and miscellaneous service contract records remain `other` unless separately reviewed with exact-bucket proof.
- Post-materialize counts: residual `project_family: other` is `373`; normalized emergency-repair records remaining `other` dropped from `2` to `0`; both records now carry `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Procurement Issuance Events

- Re-baselined residual `event_family: other` at `1846`; exact normalized `event_kind: procurement` accounted for `6` records, all still `other`.
- Bounded Codex subagent Dirac confirmed `3` records prove RFP/bid issuance or public bid solicitation, while `3` are vague procurement phase, proposal receipt, or qualification/procurement phase records.
- Added payload-gated mapping to `milestone` for exact normalized `event_kind: procurement` only when event text proves RFP issuance, issued notification of an RFP, issued RFP/request for proposals, bid solicitation, or public solicitation of bids.
- Guardrails: vague procurement phases, proposal receipt, qualification-and-procurement phases, bare `procurement`, `procurement_action`, `procurement_modification`, `procurement_recommendation`, `procurement_option_exercise`, `procurement_cycle`, and `planned_procurement` records remain `other` unless separately reviewed with exact-bucket proof.
- Post-materialize counts: residual `event_family: other` is `1843`; exact procurement records now split into `3` `milestone` records and `3` remaining `other` records.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Celebration Events

- Re-baselined residual `event_family: other` at `1843`; exact normalized `event_kind: celebration` accounted for `21` records, all still `other`.
- Bounded Codex subagent Darwin confirmed a safe exact-bucket split: `14` ERG/heritage/pride/accessibility/public-delivery celebrations to `public_engagement`, `1` Bronx bus-network redesign launch celebration to `launch`, `4` station/achievement/milestone celebrations to `milestone`, and `2` guarded records left `other`.
- Added payload-gated mapping for exact normalized `event_kind: celebration` only. Launch proof wins over public-facing terms when a celebration explicitly describes a bus-network redesign launch.
- Guardrails: bare `celebration`, Earth Day celebrations without public-facing delivery, employee-appreciation celebrations, awards celebrations, and non-exact celebration-like event kinds remain `other` unless separately reviewed with exact-bucket proof.
- Post-materialize counts: residual `event_family: other` is `1824`; exact celebration records now split into `14` `public_engagement`, `1` `launch`, `4` `milestone`, and `2` remaining `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Public Event Station Feedback

- Re-baselined residual `event_family: other` at `1824`; exact normalized `event_kind: public_event` accounted for `32` records, all still `other`.
- Bounded Codex subagent Gauss confirmed only `2` public-event records prove station-prioritization feedback engagement; `30` Grand Central retail/promotional/market/entertainment events, bike-tour records, a holiday fair, and an open house stay `other`.
- Added payload-gated mapping to `public_engagement` for exact normalized `event_kind: public_event` only when text proves feedback, priority stations, and systemwide geographic review or accessibility context.
- Guardrails: broad public events, feedback-only public events, retail markets, vendors, brand promotions, sampling, kiosks, entertainment, tourism, sports events, bike tours, holiday fairs, and open houses remain `other` unless separately reviewed with exact-bucket proof.
- Post-materialize counts: residual `event_family: other` is `1822`; exact public-event records now split into `2` `public_engagement` and `30` remaining `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Facility Relocation Projects

- Re-baselined residual `project_family: other` at `373`; exact normalized `project_type: facility_relocation` accounted for `2` records, both still `other`.
- Bounded Codex subagent Bacon confirmed both records are Jamaica/GJDC temporary bus-terminal swing-space leases tied to replacement-terminal construction, which is physical bus-terminal infrastructure support rather than a service-pattern change.
- Added payload-gated mapping to `capital_or_infrastructure` for exact normalized `project_type: facility_relocation` only when text proves bus-terminal swing space plus replacement-terminal construction or Jamaica/GJDC site anchors.
- Guardrails: broad facility relocation, generic leases, office/support leases, retail leases, cable-shop relocations, temporary bus parking, and bus relocations without terminal swing-space proof remain `other`.
- Post-materialize counts: residual `project_family: other` is `371`; exact facility-relocation records now split into `2` `capital_or_infrastructure` and `0` remaining `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Next audited candidate: bounded Codex subagent Zeno found `1` of `3` residual `real_estate_development` records may be safe for `capital_or_infrastructure` only when payload proves an NYCT electric bus charging facility; Quay Street and Webster Avenue should remain `other`.

## Latest Slice - Real Estate Development Electric Bus Charging

- Re-baselined residual `project_family: other` at `371`; exact normalized `project_type: real_estate_development` accounted for `3` records, all still `other`.
- Bounded Codex subagent Zeno confirmed only the Gun Hill Road record proves an NYCT Facility for electric bus charging. Quay Street is real-estate redevelopment with NYCT relocation/storage context, and Webster Avenue is housing development.
- Added payload-gated mapping to `capital_or_infrastructure` for exact normalized `project_type: real_estate_development` only when text proves `NYCT Facility` plus electric bus charging facility.
- Guardrails: broad real-estate development, TOD, housing, ground lease, property-rights/disposition, NYCT relocation, mobile-wash/material-storage relocation, and generic NYCT/ERU facility records remain `other`.
- Post-materialize counts: residual `project_family: other` is `370`; exact real-estate-development records now split into `1` `capital_or_infrastructure` and `2` remaining `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Exact Expansion Capital Projects

- Re-baselined residual `project_family: other` at `370`; exact normalized `project_type: expansion` accounted for `2` records still in `other`: Second Avenue Subway and Penn Reconstruction.
- Bounded Codex subagent Arendt confirmed both residual exact-expansion records are high-confidence capital/network expansion records.
- Added a payload-gated exact-`expansion` mapping to `capital_or_infrastructure` when project text proves Second Avenue Subway, Penn Reconstruction, Penn Station, MTA Expansion Program, or rail/subway/station expansion context.
- Added a study/planning guard for exact `expansion` records, including deterministic reads from `_merged_field_values`, so expansion-study evidence can map to `planning_or_report` in observation-level or stale-capital conflict cases.
- Post-materialize counts: residual `project_family: other` is `368`; exact expansion records now split into `3` `capital_or_infrastructure` and `0` `other`.
- Correction: Second Avenue Subway West remains `capital_or_infrastructure` because the current merged canonical evidence includes Major Projects and Expansion / capital-program funding, even though one merged source says `study`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Network Expansion Capital Projects

- Re-baselined residual `project_family: other` at `368`; exact normalized `project_type: network_expansion` accounted for `2` records, both still `other`.
- Bounded Codex subagent Kuhn confirmed both residual exact-network-expansion records are high-confidence capital/network expansion records: Second Avenue Subway Phase 1 and Westbound Bypass.
- Added exact `network_expansion` to the capital/infrastructure project-type set.
- Guardrails: `service_expansion`, `network_redesign`, generic `expansion`, `system_expansion`, `analytics_expansion`, `license_expansion`, and `yard_expansion` remain governed by their existing exact rules or stay `other` pending separate audit.
- Post-materialize counts: residual `project_family: other` is `365`; exact network-expansion records now split into `2` `capital_or_infrastructure` and `0` `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - System Expansion Capital Project

- Re-baselined residual `project_family: other` at `365`; exact normalized `project_type: system_expansion` accounted for `1` record, still `other`.
- Bounded Codex subagent Euler confirmed the singleton is `project_ronkonkoma-double-track`, with source-backed Ronkonkoma Double Track investment context and merged `track expansion` evidence.
- Added exact `system_expansion` to the capital/infrastructure project-type set.
- Guardrails: generic `expansion` remains payload-gated; `service_expansion` remains `service_change`; `network_redesign` remains `bus_network_redesign`; `analytics_expansion`, `license_expansion`, and `yard_expansion` remain `other` pending separate audits.
- Post-materialize counts: residual `project_family: other` is `364`; exact system-expansion records now split into `1` `capital_or_infrastructure` and `0` remaining `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Yard Expansion Capital Project

- Re-baselined residual `project_family: other` at `364`; exact normalized `project_type: yard_expansion` accounted for `1` record, still `other`.
- Bounded Codex subagent Popper confirmed the singleton is `project_meeting-doc-179566-new-rochelle-yard-improvements`, with source-backed Penn Station Access support, New Rochelle Yard expansion, retaining-wall, and easement evidence.
- Added exact `yard_expansion` to the capital/infrastructure project-type set.
- Guardrails: bare `yard`, `yard track extension`, analytics expansion, license expansion, service expansion, network redesign, and generic expansion are not swept in by this exact rule.
- Post-materialize counts: residual `project_family: other` is `363`; exact yard-expansion records now split into `1` `capital_or_infrastructure` and `0` remaining `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Procurement New Rail Cars

- Re-baselined residual `project_family: other` at `363`; exact normalized `project_type: procurement` accounted for `31` remaining `other` records.
- Local deterministic inspection found a singleton vehicle-procurement wording miss: `project_meeting-doc-177271-new-rail-cars`, whose payload and source quote are both `Ordering New Rail Cars`.
- Added `rail car` / `rail cars` vehicle terms plus `order` / `ordering` procurement-action terms to the existing generic procurement vehicle gate.
- Guardrails: generic procurement remains `other`; railcar-parts purchase agreements, train simulators, AVLM/RTS/CAD, PTC software, HASTUS, tolling/transponders, office supplies, fuel, inspection services, bus services, and maintenance-of-way parts remain unmapped unless separately reviewed.
- Post-materialize counts: residual `project_family: other` is `362`; exact procurement records now split into `30` `other`, `25` `capital_or_infrastructure`, and existing non-capital families. `Ordering New Rail Cars` now carries `capital_or_infrastructure`.
- Bounded Codex subagent Beauvoir identified the next high-confidence procurement candidate: six OEM rolling-stock parts/propulsion records, pending a separate implementation slice.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Procurement OEM Rolling-Stock Parts

- Re-baselined residual `project_family: other` at `362`; exact normalized `project_type: procurement` accounted for `30` remaining `other` records.
- Bounded Codex subagent Beauvoir identified a high-confidence six-record OEM rolling-stock parts / propulsion overhaul sub-bucket.
- Added a payload-gated generic-procurement rule requiring OEM/original-equipment-manufacturer or purchase-agreement proof, a bounded parts or propulsion-overhaul phrase, and railcar/locomotive/subway-car or agency/fleet context.
- Moved records: `project_custom-glass-window-assemblies`, `project_hvac-propulsion-parts-agreement`, `project_luminator-lighting-parts`, `project_m7-propulsion-system-upgrade`, `project_meeting-doc-79341-wabtec-oem`, and `project_ussc-seating-parts`.
- Guardrails: generic railcar-parts text without OEM/fleet proof, train simulators, AVLM/RTS/CAD, PTC software, HASTUS, tolling/transponders, office supplies, fuel, inspection services, bus services, and maintenance-of-way parts remain unmapped unless separately reviewed.
- Post-materialize counts: residual `project_family: other` is `356`; exact procurement records now split into `24` `other`, `31` `capital_or_infrastructure`, and existing non-capital families. All six audited OEM records now carry `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Design-Build Safety And Systems Projects

- Re-baselined residual `project_family: other` at `356`.
- Bounded Codex subagent Franklin audited the `17` exact `operating_efficiency_initiative` residuals and recommended no mapping to existing project families; the existing ABLE/bus-camera exception remains the only safe operating-efficiency mapping.
- Pivoted to exact normalized `project_type: design_build`, where current-state rebaseline showed `10` remaining `other` records.
- Bounded Codex subagent Leibniz identified high-confidence design-build safety/enforcement/capital shapes; current-state rebaseline showed duplicate-shaped laser/CCTV examples beyond the initial four-record shortlist.
- Added narrow rules for subway/station laser-intrusion detection (`accessibility_or_safety`), bridge electronic monitoring/detection (`accessibility_or_safety`), Canarsie PA/CIS replacement and upgrade (`capital_or_infrastructure`), and closed-circuit/fare-control/passenger-identification CCTV camera projects (`enforcement_program`).
- Guardrails: bare design-build, generic CCTV/electronic monitoring, PBX/audio recording, and tunnel facility monitoring/safety systems remain `other`.
- Post-materialize counts: residual `project_family: other` is `350`; exact design-build records now split into `4` `other`, `2` `enforcement_program`, `52` `accessibility_or_safety`, and `60` `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Contract Modification Revenue Recovery

- Re-baselined residual `project_family: other` at `350`; exact normalized `project_type: contract_modification` accounted for `12` remaining `other` records.
- Bounded Codex subagent Avicenna identified one high-confidence fare-program record: `project_transcore-rrs-modification`, a modification to an All-Electronic Open-Road Tolling contract to implement an automated Revenue Recovery System for toll evasion / recovering tolls.
- Added a payload-gated contract-modification rule requiring both open-road/all-electronic tolling proof and revenue-recovery/RRS/toll-evasion proof.
- Guardrails: R211 post-award consulting, GRC SaaS/support, HASTUS licensing/support, emergency and scheduled bus services, fleet management services, EAM consulting, generic management consulting, and ESA Systems Facilities remain `other` unless separately reviewed.
- Post-materialize counts: residual `project_family: other` is `349`; exact contract-modification records now split into `11` `other`, `3` `fare_program`, `2` `capital_or_infrastructure`, `2` `accessibility_or_safety`, `1` `service_change`, and `1` `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - License Agreement Construction Support

- Re-baselined residual `project_family: other` at `349`; exact normalized `project_type: license_agreement` accounted for `9` remaining `other` records.
- Bounded Codex subagent Parfit identified two high-confidence construction-support license records: Rockaway Line signal-tower construction/staging and temporary bus parking during Kingsbridge Bus Depot construction.
- Added payload-gated license-agreement rules requiring signal-tower construction/staging plus Rockaway Line/resiliency context, or temporary bus parking plus buses, ongoing construction, and depot/Kingsbridge context.
- Guardrails: retail concessions, food/cafe uses, GCT kiosks, commuter parking operation/maintenance licenses, scaffolding/material-storage licenses, and generic vehicle parking remain `other`.
- Post-materialize counts: residual `project_family: other` is `347`; exact license-agreement records now split into `7` `other` and `2` `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Procurement Safety And ABLE Systems

- Re-baselined residual `project_family: other` at `347`; exact normalized `project_type: procurement` accounted for `24` remaining `other` records.
- Bounded Codex subagent Banach identified three high-confidence procurement records: `project_meeting-doc-108036-platform-screen-doors` and `project_meeting-doc-108036-track-intrusion-detection` to `accessibility_or_safety`, plus `project_meeting-doc-140621-able-systems` to `enforcement_program`.
- Added payload-gated procurement rules requiring exact platform screen door or track-intrusion-detection asset proof, or ABLE/Automated Bus Lane Enforcement system proof plus procurement-action terms.
- Guardrails: customer/contact-center services, tolling/transponder services, PTC software/support, train simulators, HASTUS/software, office supplies, paratransit AVLM/RTS/CAD technology, maintenance/support contracts, fuel delivery, inspection/testing services, bus-service contracts, maintenance-of-way equipment, and mixed procurement packages remain `other`.
- Post-materialize counts: residual `project_family: other` is `344`; exact procurement records have `21` remaining `other` records, and the three target records carry their intended families.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Bus Forward Program

- Re-baselined residual `project_family: other` at `344`; exact normalized `project_type: program` accounted for `4` remaining `other` records, and exact `grant_program` accounted for `3`.
- Bounded Codex subagent James confirmed the high-confidence implementation slice is `project_bus-forward-2-bus-forward-program` to `bus_priority`.
- Added a payload-gated exact-`program` rule requiring bus-corridor segment proof, speed/reliability/slow-trip proof, and planning/outreach/implementation proof.
- Guardrails: bare programs, Open Stroller, Drug & Alcohol, broad congestion-relief headings, Security Grant utilization/program records, and the RCE Grant Program remain `other` pending separate tighter review.
- Post-materialize counts: residual `project_family: other` is `343`; exact `program` records have `3` remaining `other` records, and Bus Forward carries `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - CBTC Consulting

- Re-baselined residual `project_family: other` at `343`; exact normalized `project_type: consulting` accounted for `2` remaining `other` records.
- Bounded Codex subagent Kant confirmed `project_atkins-hntb-cbtc-gec` is a high-confidence `capital_or_infrastructure` move because its payload proves CBTC / Communications Based Train Control engineering, design/procurement/program support, and NYCT subway implementation context.
- Added a payload-gated exact-`consulting` rule requiring CBTC proof, engineering/support terms, and NYCT subway context.
- Guardrail: `project_cd-project-controls-policies` remains `other` as internal project-controls/process consulting.
- Post-materialize counts: residual `project_family: other` is `342`; exact `consulting` records have `1` remaining `other` record, and the CBTC GEC record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Initiative Safety Charging And Pilots

- Re-baselined residual `project_family: other` at `342`; exact normalized `project_type: initiative` accounted for `4` remaining `other` records.
- Bounded Codex subagent Erdos identified three high-confidence mappings: `project_cd-sms-into-contracts` to `accessibility_or_safety`, `project_meeting-doc-127476-zero-emission` to `capital_or_infrastructure`, and `project_meeting-doc-98231-fmlm-initiative` to `pilot`.
- Added payload-gated exact-`initiative` rules for Safety Management System contract provisions/requirements, zero-emission charging-infrastructure installation, and first-mile/last-mile pilot programs.
- Guardrail: `project_meeting-doc-128896-mow-data-analysis` remains `other` as an internal productivity/staffing/analytics initiative.
- Post-materialize counts: residual `project_family: other` is `339`; exact `initiative` records have `1` remaining `other` record.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Track Geometry Car Noncompetitive Procurement

- Re-baselined residual `project_family: other` at `339`; exact normalized `project_type: noncompetitive_procurement` accounted for `2` remaining `other` records.
- A bounded Codex subagent fan-out for nearby technology buckets could not start because the agent thread limit was reached, so this slice used local deterministic inspection.
- Added a payload-gated extension to the existing noncompetitive-procurement infrastructure rule for Track Geometry Cars only when payload proves TGC/Track Geometry Car assets plus critical-systems or operational-life upgrade terms.
- Guardrail: `project_giro-cdms-implementation-201766` remains `other` as HASTUS Crew Dispatch and Management System software.
- Post-materialize counts: residual `project_family: other` is `338`; exact `noncompetitive_procurement` records have `1` remaining `other` record, and `project_tgc-upgrade-2023` carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - SafeWork Technology Platform

- Re-baselined residual `project_family: other` at `338`; exact normalized `project_type: technology_platform` accounted for `2` remaining `other` records.
- Local deterministic inspection identified one high-confidence safety-compliance platform: `project_cd-safework-platform`, whose payload proves SafeWork inspection protocols, real-time hazard reporting, and scaffold/electrical/traffic-control compliance context.
- Added a payload-gated exact-`technology_platform` rule requiring SafeWork proof, inspection/hazard reporting terms, and concrete safety-compliance terms.
- Guardrails: `project_meeting-doc-177266-paratransit-tech-system` remains `other` as scheduling/dispatch/AVLM technology, and generic hazard dashboards without inspection protocol plus compliance proof remain `other`.
- Post-materialize counts: residual `project_family: other` is `337`; exact `technology_platform` records have `1` remaining `other` record, and SafeWork carries `accessibility_or_safety`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Signal Testing Cutover Infrastructure

- Re-baselined residual `project_family: other` at `337`; exact normalized `project_type: signal_testing` accounted for `2` remaining `other` records, with one adjacent exact `signal_testing_and_cutover` record also still `other`.
- Local deterministic inspection identified two high-confidence capital/infrastructure records: `project_main-line-signal-testing-queens-interlocking-2026` and `project_meeting-doc-170846-main-line-signal-testing-cutover`.
- Added a payload-gated project rule for `signal_testing` and `signal_testing_and_cutover` only when payload proves rail tracks out of service plus signal-cutover or modernized-signal-system context.
- Guardrail: `project_meeting-doc-170846-signal-testing-east-jamaica` remains `other` because its project payload is only a sparse timetable-support mention.
- Post-materialize counts: residual `project_family: other` is `335`; signal-testing/cutover records have `1` remaining `other` record, and both audited records carry `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Obsolete Rail-Car Disposal Service Contract

- Re-baselined residual `project_family: other` at `335`; exact normalized `project_type: miscellaneous_service_contract` accounted for `4` remaining `other` records.
- Local deterministic inspection identified one high-confidence capital/infrastructure record: `project_removal-disposal-obsolete-subway-rail-cars`, covering removal and disposal of obsolete subway/rail cars for NYC Transit, LIRR, and MNR.
- Added a payload-gated miscellaneous-service-contract rule requiring obsolete subway/rail-car proof, removal/disposal proof, and agency/rail-car context.
- Guardrails: Energy Management System, HASTUS CDMS, and Small Business Development and Mentoring Program service contracts remain `other`.
- Post-materialize counts: residual `project_family: other` is `334`; exact miscellaneous-service-contract records have `3` remaining `other` records, and the obsolete rail-car disposal record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Design-Build Tunnel Safety Systems

- Re-baselined residual `project_family: other` at `334`; exact normalized `project_type: design_build` accounted for `4` remaining `other` records.
- Local deterministic inspection identified two high-confidence `accessibility_or_safety` records: `project_tunnel-facility-monitoring-systems` and `project_tunnel-monitoring-safety-systems-dec2023`.
- Added a payload-gated Design-Build rule requiring facility-monitoring/safety-system proof, Hugh L. Carey / Queens Midtown tunnel context, and concrete safety/security system terms.
- Guardrails: `project_meeting-doc-173986-coe-phase-3c` remains `other` as network/CCTV streaming capacity context, and `project_mnr-digital-audio-call-recording` remains `other` as PBX/audio recording hardware/software.
- Post-materialize counts: residual `project_family: other` is `332`; exact design-build records have `2` remaining `other` records, and both tunnel safety-system records carry `accessibility_or_safety`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - C2K R211 Contract Modification

- Re-baselined residual `project_family: other` at `332`; exact normalized `project_type: contract_modification` accounted for `11` remaining `other` records.
- Local deterministic inspection identified two high-confidence `capital_or_infrastructure` records: `project_meeting-doc-196901-c2k-modification` and `project_meeting-doc-98321-c2k-mod6`.
- Added a payload-gated contract-modification rule requiring post-award consulting proof, R211/R34211 proof, and subway-car contract proof.
- Guardrails: Enterprise Asset Management, HASTUS, GRC/SaaS, management-consultant, emergency bus-service, and fleet-management contract modifications remain `other`.
- Post-materialize counts: residual `project_family: other` is `330`; exact contract-modification records have `9` remaining `other` records, and both C2K/R211 records carry `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Bus Predictive Maintenance Operating Efficiency

- Re-baselined residual `project_family: other` at `330`; exact normalized `project_type: operating_efficiency_initiative` accounted for `17` remaining `other` records.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_nyct-bus-predictive-maintenance`.
- Added a payload-gated operating-efficiency rule requiring predictive-maintenance proof, bus proof, and maintenance-needs or incident-reduction proof.
- Guardrails: generic bus maintenance technology, rail scheduling, rolling-stock process/productivity, staffing, overtime, procurement-spec, cleaning, and energy-efficiency initiatives remain `other`.
- Post-materialize counts: residual `project_family: other` is `329`; exact operating-efficiency-initiative records have `16` remaining `other` records, and `project_nyct-bus-predictive-maintenance` carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Cashless Tolling Contract Fare Program

- Re-baselined residual `project_family: other` at `329`; exact normalized `project_type: procurement` accounted for `21` remaining `other` records, and exact `personal_service_contract` accounted for `6`.
- Local deterministic inspection identified two high-confidence `fare_program` records: `project_meeting-doc-131681-psc-13-2949` and `project_transcore-cashless-tolling-maintenance`.
- Added a payload-gated tolling-contract rule requiring cashless or all-electronic open-road tolling proof, maintenance/install/option-renewal proof, and TBTA/B&T/toll-facility context.
- Guardrails: E-ZPass transponder procurement, transponder distribution, customer contact center services, and toll-related revenue/environmental assessment contracts remain `other`.
- Post-materialize counts: residual `project_family: other` is `327`; exact procurement records have `20` remaining `other` records, exact personal-service-contract records have `5` remaining `other` records, and both cashless tolling records carry `fare_program`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - RFK Fleet Garage Rehabilitation

- Re-baselined residual `project_family: other` at `327`; exact normalized `project_type: rehabilitation` accounted for `4` remaining `other` records.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_rfk-fleet-garage-repairs-208006`.
- Added a payload-gated rehabilitation rule requiring RFK/fleet-garage proof, exit-corridor or miscellaneous-space proof, and concrete physical repair work terms.
- Guardrails: sparse L Train Tunnel, Rockaways Rehab, and Rutgers Tube mentions remain `other`.
- Post-materialize counts: residual `project_family: other` is `326`; exact rehabilitation records have `3` remaining `other` records, and `project_rfk-fleet-garage-repairs-208006` carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Newburgh-Beacon Ferry Interagency Agreements

- Re-baselined residual `project_family: other` at `326`; exact normalized `project_type: interagency_agreement` accounted for `2` remaining `other` records.
- Local deterministic inspection identified two high-confidence `service_change` records: `project_newburgh-beacon-ferry-mou-10-dec2023` and `project_ninth-mou-newburgh-ferry-2023`.
- Added a payload-gated interagency-agreement rule requiring Newburgh-Beacon proof, ferry-landing/parking proof, and lease reimbursement/payment proof.
- Guardrail: generic interagency lease payments without named ferry-route proof remain `other`.
- Post-materialize counts: residual `project_family: other` is `324`; exact interagency-agreement records have `0` remaining `other` records, and both Newburgh-Beacon MOU records carry `service_change`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - 2022 Bus Strategy

- Re-baselined residual `project_family: other` at `324`; exact normalized `project_type: strategy` accounted for `2` remaining `other` records.
- Local deterministic inspection identified one high-confidence `bus_priority` record: `project_68651-2022-bus-strategy`.
- Added a payload-gated exact-`strategy` rule requiring bus-priority proof plus bus-system strategy signals: traffic enforcement, zero-emissions fleet, network, accessibility, or customer engagement.
- Guardrail: `project_climate-resilience-roadmap` remains `other` as broad climate strategy/planning context.
- Post-materialize counts: residual `project_family: other` is `323`; exact strategy records have `1` remaining `other` record, and the 2022 Bus Strategy carries `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Congestion Pricing FONSI

- Re-baselined residual `project_family: other` at `323`; singleton inspection found one exact normalized `project_type: congestion_pricing` record still in `other`.
- Local deterministic inspection identified one high-confidence `fare_program` record: `project_meeting-doc-114221-congestion-pricing-fonsi`.
- Extended the direct fare/toll product rule so exact `congestion_pricing` maps to `fare_program` only when payload proves the Congestion Pricing Program or Central Business District Tolling Program itself.
- Guardrail: transit-adjacent environmental-review or charging-zone mentions without program proof remain `other`.
- Post-materialize counts: residual `project_family: other` is `322`; exact congestion-pricing records have `0` remaining `other` records, and the FONSI record carries `fare_program`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - 125th Street Transportation Improvements SBS

- Re-baselined residual `project_family: other` at `322`; singleton inspection found one exact normalized `project_type: transportation_improvements` record still in `other`.
- Local deterministic inspection identified one high-confidence `sbs_or_brt` record: `project_125th-street-transportation-improvements`.
- Added a payload-gated exact-`transportation_improvements` rule requiring Select Bus Service proof, off-board fare collection/payment proof, and SBS amenities or offset/dedicated bus-lane proof.
- Guardrail: generic transportation/street/parking improvements without SBS package proof remain `other`.
- Post-materialize counts: residual `project_family: other` is `321`; exact transportation-improvements records have `0` remaining `other` records, and the 125th Street record carries `sbs_or_brt`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Security Grant Program

- Re-baselined residual `project_family: other` at `321`; exact normalized `project_type: grant_program` accounted for `3` remaining `other` records.
- Local deterministic inspection identified one high-confidence `enforcement_program` record: `project_meeting-doc-115236-security-grant-program`.
- Added a payload-gated exact-`grant_program` rule requiring security-grant proof plus fare-evasion or MTAPD proof.
- Guardrails: Security Grant Program past-utilization dollar totals and the Railroad Crossing Elimination grant opportunity remain `other`.
- Post-materialize counts: residual `project_family: other` is `320`; exact grant-program records have `2` remaining `other` records, and the Security Grant Program carries `enforcement_program`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - TransCore Open-Road Tolling Procurement Amendment

- Re-baselined residual `project_family: other` at `320`; singleton inspection found one exact normalized `project_type: procurement_amendment` record still in `other`.
- Local deterministic inspection identified one high-confidence `fare_program` record: `project_meeting-doc-131486-transcore-ort-amendment`.
- Extended the existing payload-gated tolling-contract rule to include `procurement_amendment`, still requiring cashless/open-road tolling proof, maintenance/option-renewal proof, and TBTA/toll-facility proof.
- Guardrail: tolling consultant, customer-contact, and environmental-review contract support remain `other`.
- Post-materialize counts: residual `project_family: other` is `319`; exact procurement-amendment records have `0` remaining `other` records, and the TransCore amendment carries `fare_program`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - TrainTime Digital Service Launch

- Re-baselined residual `project_family: other` at `319`; singleton inspection found one exact normalized `project_type: digital_service_launch` record still in `other`.
- Local deterministic inspection identified one high-confidence `fare_program` record: `project_meeting-doc-95221-train-time-app`.
- Extended the existing payload-gated ticketing/fare-program rule to include `digital_service_launch`, still requiring fare collection, mobile ticketing, ticket-selling, ticket-vending, onboard validation, or TrainTime proof.
- Guardrail: generic digital-service launches, customer surveys, and non-ticketing app launches remain `other`.
- Post-materialize counts: residual `project_family: other` is `318`; exact digital-service-launch records have `0` remaining `other` records, and the TrainTime app carries `fare_program`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Rolling-Stock Option Exercises

- Re-baselined residual `project_family: other` at `318`; exact-type inspection found four option-exercise records still in `other`.
- Local deterministic inspection identified four high-confidence `capital_or_infrastructure` records: `project_nyct-flatcars-option-b`, `project_meeting-doc-160316-dual-mode-loco-option3`, `project_cdot-dual-mode-locomotive-option`, and `project_r211-cbtc-carborne-8th-ave`.
- Extended the existing payload-gated option-exercise vehicle rule to include `option_exercise_on_existing_contract`, `procurement_option_election`, `procurement_option_exercise`, and `option_exercise_cbtc_equipment`, still requiring rolling-stock or vehicle-equipment proof.
- Guardrail: generic administrative option exercises and software-support option exercises remain `other`.
- Post-materialize counts: residual `project_family: other` is `314`; the four targeted exact-type buckets have `0` remaining `other` records, and all four targets carry `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Positive Train Control Project Families

- Re-baselined residual `project_family: other` at `314`; deterministic PTC inspection found three target records still in `other`.
- Local deterministic inspection identified `project_mnr-ptc` as `accessibility_or_safety`, and `project_alstom-ptc-upgrade-may2022` plus `project_ptc-technical-service-agreement-meeting-doc-205611` as `capital_or_infrastructure`.
- Added payload-gated rules for exact Positive Train Control implementation, PTC software upgrades with M8/Metro-North fleet proof, and PTC systems-engineering / technical-service agreements for LIRR/MNR railroads.
- Guardrail: generic PTC policy/reporting support, office software support, and train-simulator procurement remain `other`.
- Post-materialize counts: residual `project_family: other` is `311`; the targeted PTC shapes have `0` remaining `other` records.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Bus Maintenance Systems

- Re-baselined residual `project_family: other` at `311`; deterministic inspection found five bus maintenance system records still in `other`.
- Local deterministic inspection identified five high-confidence `capital_or_infrastructure` records: `project_enterprise-asset-mgmt-mtabus`, `project_meeting-doc-177171-cmms-replacement`, `project_hexagon-eam-implementation-dob-mtabc`, `project_meeting-doc-121066-preteckt-prognostic-maintenance`, and `project_maintenance-management-improvements`.
- Added payload-gated rules for bus CMMS/EAM system replacement or implementation, and bus predictive/prognostic maintenance contracts and initiatives.
- Guardrail: generic enterprise IT, contact-center CRM, office software support, zCloud/data-center support, and HASTUS/CDMS crew-dispatch systems remain `other`.
- Post-materialize counts: residual `project_family: other` is `306`; the targeted bus-maintenance-system exact-type buckets have `0` remaining `other` records.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Rail and Rolling-Stock Asset Support

- Re-baselined residual `project_family: other` at `306`; deterministic inspection found five rail/rolling-stock asset support records still in `other`.
- Local deterministic inspection identified five high-confidence `capital_or_infrastructure` records: `project_oem-replacement-parts-meppi-meeting-doc-133401`, `project_kawasaki-sole-source-parts-meeting-doc-164791`, `project_meeting-doc-98321-plasser-mow`, `project_meeting-163126-r211-option2`, and `project_lirr-avrm-system-upgrade`.
- Added exact `rail_car_procurement` spelling support, extended the existing OEM/replacement-parts rule to cover OEM or sole-source rail equipment parts contracts, and added a narrow AVRM fleet monitoring-system replacement rule.
- Guardrail: office-supply procurement, train-simulator procurement, and generic contract awards remain `other`.
- Post-materialize counts: residual `project_family: other` is `301`; the targeted rail/rolling-stock asset exact-type buckets have `0` remaining `other` records.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Woodhaven Q52/Q53 SBS Launch

- Re-baselined residual `project_family: other` at `301`; exact-type inspection found one `sbs_launch` record still in `other`.
- Local deterministic inspection identified one high-confidence `sbs_or_brt` record: `project_woodhaven-q52-q53-sbs`.
- Extended the exact SBS project-type rule to include `sbs_launch` alongside `sbs` and `sbs_upgrade`.
- Guardrail: existing tests keep generic bus-stop improvements, street improvements, bus reroutes, bus-service contracts, and generic transportation improvements outside SBS/BRT unless payload proves the full SBS package.
- Post-materialize counts: residual `project_family: other` is `300`; exact `sbs_launch` records have `0` remaining `other` records, and the Woodhaven Q52/Q53 SBS record carries `sbs_or_brt`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - VNB Roadway Widening

- Re-baselined residual `project_family: other` at `300`; exact-type inspection found one `roadway_widening` record still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_meeting-doc-206201-vnb-roadway-widening`.
- Added `roadway_widening` to the exact capital/infrastructure project-type set.
- Guardrail: generic roadway maintenance remains `other`, and the VNB median barrier transfer services extension remains `other`.
- Post-materialize counts: residual `project_family: other` is `299`; exact `roadway_widening` records have `0` remaining `other` records, and the VNB roadway widening record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Security Camera Initiatives

- Re-baselined residual `project_family: other` at `299`; exact-type inspection found one `security` record and one `security_initiative` record still in `other`.
- Local deterministic inspection identified two high-confidence `enforcement_program` records: `project_lirr-security-initiatives` and `project_security-initiatives-nyct`.
- Extended the existing camera/video-gated `security_program` rule to exact `security` and `security_initiative` project types.
- Guardrail: staffing/patrol-only security initiatives remain `other`.
- Post-materialize counts: residual `project_family: other` is `297`; exact `security` and `security_initiative` records have `0` remaining `other` records, and both target records carry `enforcement_program`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - JusticeONE e-Citation

- Re-baselined residual `project_family: other` at `297`; exact-type inspection found one `noncompetitive_miscellaneous_service_contract_ion_ratification` record still in `other`.
- Local deterministic inspection identified one high-confidence `enforcement_program` record: `project_meeting-doc-201746-ecitation-system`.
- Added a bounded exact-type rule requiring e-Citation/JusticeONE proof plus EAGLE Team, MTAPD, or MTA Police proof.
- Guardrail: generic JusticeONE software, generic e-Citation workflows, and the adjacent bus-radio ION service agreement remain `other`.
- Post-materialize counts: residual `project_family: other` is `296`; exact noncompetitive miscellaneous service contract ION records have `0` remaining `other` records, and the JusticeONE e-Citation record carries `enforcement_program`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Queens Bus Network Redesign

- Re-baselined residual `project_family: other` at `296`; exact-type inspection found one `redesign` record still in `other`.
- Local deterministic inspection identified one high-confidence `bus_network_redesign` record: `project_queens-redesign`.
- Added a payload-gated exact-`redesign` rule requiring bus and network-redesign proof.
- Guardrail: generic redesign projects remain `other`.
- Post-materialize counts: residual `project_family: other` is `295`; exact `redesign` records have `0` remaining `other` records, and the Queens Redesign Project carries `bus_network_redesign`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Bus Radio Infrastructure

- Re-baselined residual `project_family: other` at `295`; exact-type inspection found one `noncompetitive_miscellaneous_service_agreement_ion_ratification` record still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_meeting-doc-201746-bus-radio-system-maintenance`.
- Added a bounded exact-type rule requiring bus-radio system, command-center, and critical-infrastructure-upgrade proof.
- Guardrail: generic radio maintenance and VHF support remain `other`.
- Post-materialize counts: residual `project_family: other` is `294`; exact noncompetitive miscellaneous service agreement ION records have `0` remaining `other` records, and the bus-radio system record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Subway Stormwater Climate Resilience

- Re-baselined residual `project_family: other` at `294`; exact-type inspection found two `climate_resilience_strategy` records still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_shield-subway-stations-tunnels`.
- Added a bounded exact `climate_resilience_strategy` rule requiring stormwater, subway/station/tunnel, and capital-project or track-drain proof.
- Guardrail: the Metro-North flooding strategy remains `other`.
- Post-materialize counts: residual `project_family: other` is `293`; exact `climate_resilience_strategy` records have `1` remaining `other` record, intentionally `project_reduce-metronorth-flooding`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - E-ZPass Electronic Toll Collection Transponders

- Re-baselined residual `project_family: other` at `293`; deterministic inspection found two E-ZPass electronic toll collection transponder procurement records still in `other`.
- Local deterministic inspection identified two high-confidence `fare_program` records: `project_ezpass-transponder-procurement-2024` and `project_bt-electronic-transponders-contract`.
- Added a narrow procurement/procurement-contract rule requiring E-ZPass proof, electronic toll collection system proof, and transponder proof.
- Guardrail: generic transponder distribution services, NCBA E-ZPass implementation support, and generic tolling customer-contact procurements remain `other`.
- Post-materialize counts: residual `project_family: other` is `291`; both targeted E-ZPass electronic toll collection procurement records carry `fare_program`, and `project_39651-transponder-distribution-contract` remains `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - RFK Design-Build Public Works Spelling

- Re-baselined residual `project_family: other` at `291`; deterministic inspection found one `Design-Build Public Works` physical infrastructure record still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_rfk-pedestrian-walkway-fender`.
- Extended the existing design-build public-works physical-infrastructure rule from `design_build_public_works_contract` to also cover the canonical `design_build_public_works` spelling.
- Guardrail: the rule still requires bridge, electrical-power, tower-elevator, pedestrian-walkway, or fender-rehabilitation proof; `project_mp09-tower-elevator-replacement` retains its existing concrete `accessibility_or_safety` family.
- Post-materialize counts: residual `project_family: other` is `290`; the RFK pedestrian walkway/fender record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Bus Prognostic Maintenance Analytics

- Re-baselined residual `project_family: other` at `290`; deterministic inspection found one bus prognostic-maintenance analytics record still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_prognostic-maintenance-analytics`.
- Extended the existing bus maintenance systems rule to include the exact `analytics_expansion` project-type spelling.
- Guardrail: the rule still requires prognostic/predictive maintenance proof, bus or Department of Buses proof, and maintenance/asset proof; generic analytics expansion for internal reporting remains `other`.
- Post-materialize counts: residual `project_family: other` is `289`; the prognostic maintenance analytics record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - GCT ADA/Safety Signage

- Re-baselined residual `project_family: other` at `289`; deterministic inspection found one station signage improvement record still in `other`.
- Local deterministic inspection identified one high-confidence `accessibility_or_safety` record: `project_grand-central-terminal-signage-ada-meeting-doc-138196`.
- Added a payload-gated `signage_improvement` rule requiring ADA/safety-code proof, station/platform/terminal context, and signage proof.
- Guardrail: bare signage improvement records and retail-only station signage remain `other`.
- Post-materialize counts: residual `project_family: other` is `288`; the Grand Central Terminal ADA/safety signage record carries `accessibility_or_safety`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Bus Operator Cockpit Protection

- Re-baselined residual `project_family: other` at `288`; deterministic inspection found two bus operator cockpit-protection records still in `other`.
- Local deterministic inspection identified two high-confidence `accessibility_or_safety` records: `project_fully-enclosed-cockpits-local-buses` and `project_operator-cockpit-door-express-bus`.
- Added a payload-gated rule for exact `design_and_testing` and `design_and_retrofit` records requiring cockpit/operator-cockpit proof, bus/fleet proof, and operator safety or retrofit proof.
- Guardrail: generic design-and-testing records remain `other`; train simulator procurements remain guarded by the existing simulator exclusion.
- Post-materialize counts: residual `project_family: other` is `286`; both bus operator cockpit-protection records carry `accessibility_or_safety`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - SC-42 Charger Locomotive Acquisition

- Re-baselined residual `project_family: other` at `286`; deterministic inspection found one SC-42 Charger locomotive acquisition record still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_mnr-sc42-charger-locos`.
- Added exact `locomotive_acquisition_and_replacement` project-type spelling support, aligning it with existing `locomotive_procurement`, `rolling_stock_procurement`, and `railcar_procurement` handling.
- Guardrail: `project_meeting-doc-166926-locomotive-222` locomotive restoration, train simulator procurements, and locomotive engineer workforce records remain `other`.
- Post-materialize counts: residual `project_family: other` is `285`; the SC-42 Charger locomotive acquisition record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Station Refresh and ReNEWvation

- Re-baselined residual `project_family: other` at `285`; deterministic inspection found four station refresh/ReNEWvation records still in `other`.
- Local deterministic inspection identified four high-confidence `capital_or_infrastructure` records: `project_meeting-doc-95161-mop-my-stop`, `project_meeting91596-station-refresh-plan`, `project_station-re-new-vation`, and `project_station-renewvation-nov2022`.
- Added a payload-gated rule for exact station-refresh, station-refresh-program, station-renovation-program, and station-maintenance records requiring station context plus physical refresh/renewal evidence.
- Guardrail: bare `station refresh` and routine station maintenance records remain `other`; the rule requires physical work evidence such as tactile warning strips, stair contrast, improved lighting, planned closures, deep cleaning, power washing, light-fixture replacement, or water-intrusion prevention.
- Post-materialize counts: residual `project_family: other` is `281`; all four targeted station refresh/ReNEWvation records carry `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Penn Station Access Coach Car RFP

- Re-baselined residual `project_family: other` at `281`; deterministic inspection found one Coach Car RFP fleet procurement record still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_meeting164941-coach-car-rfp`.
- Extended the existing vehicle procurement payload-gated rule to include the exact `rfp_procurement` spelling.
- Guardrail: the rule still requires vehicle/rolling-stock asset proof and procurement/purchase action proof, and keeps simulator and service procurements out of capital infrastructure.
- Post-materialize counts: residual `project_family: other` is `280`; the Coach Car RFP record carries `capital_or_infrastructure`, the sibling Penn Station Access coach-car procurement remains `capital_or_infrastructure`, and train simulator procurements remain `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - R211 CBTC Carborne Software Upgrade

- Re-baselined residual `project_family: other` at `280`; deterministic inspection found one R211 CBTC carborne equipment software-upgrade record still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_meeting-doc-206081-r211-cbtc`.
- Added a payload-gated `software_upgrade` rule requiring CBTC/communications-based train-control proof, carborne equipment/controller proof, and R211 fleet proof.
- Guardrail: generic business software upgrades, traffic-control system software upgrades, and signaling maintenance contracts remain `other`; R179/R211 CBTC contract-modification siblings remain `capital_or_infrastructure`.
- Post-materialize counts: residual `project_family: other` is `279`; the R211 CBTC carborne equipment software-upgrade record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - East 86th Street DDC Streetscape Construction

- Re-baselined residual `project_family: other` at `279`; deterministic inspection found one `streetscape improvement` project still in `other`.
- Local deterministic inspection identified one high-confidence `accessibility_or_safety` record: `project_86th-st-ddc-streetscape-cb7-presentation`.
- Added a payload-gated `streetscape_improvement` rule requiring pedestrian-improvement, bus-bulb, neckdown, or curb-extension safety proof.
- Guardrail: generic streetscape improvements and retail/plaza landscaping remain `other`.
- Post-materialize counts: residual `project_family: other` is `278`; the East 86th Street DDC Streetscape Construction record carries `accessibility_or_safety`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - 270 Park Avenue Viaduct Agreement Amendment

- Re-baselined residual `project_family: other` at `278`; deterministic inspection found one Grand Central train-shed / Park Avenue Viaduct rehabilitation P3 record still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_270-park-ave-viaduct-agreement-amendment`.
- Added a payload-gated exact `viaduct_rehabilitation_public_private_partnership` rule requiring Grand Central train-shed context plus JPMC, Sector 2, or rehabilitation-work proof.
- Guardrail: Park Avenue Viaduct job-fair and generic viaduct-adjacent real-estate P3 records remain `other`.
- Post-materialize counts: residual `project_family: other` is `277`; the 270 Park Avenue Viaduct Agreement Amendment / Grand Central Train Shed Sector 2 record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Breakneck Ridge Station Reopening

- Re-baselined residual `project_family: other` at `277`; deterministic inspection found one station-reopening record with safety-enhancement and station-improvement proof still in `other`.
- Local deterministic inspection identified one high-confidence `accessibility_or_safety` record: `project_breakneck-ridge-station-meeting-doc-104741`.
- Added a payload-gated exact `station_reopening` rule requiring station context, safety-enhancement proof, and station-improvement proof.
- Guardrail: bare station-reopening records and adjacent recreational trail records remain `other`.
- Post-materialize counts: residual `project_family: other` is `276`; the Breakneck Ridge Station Reopening record carries `accessibility_or_safety`, while `project_breakneck-connector` and `project_fjord-trail` remain `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - 39 Av Two-Way Conversion Study

- Re-baselined residual `project_family: other` at `276`; deterministic inspection found one concrete `street conversion` project still in `other`.
- Local deterministic inspection identified one high-confidence `street_redesign` record: `project_brt-flushing-jamaica-oct2016-39av-2way`.
- Added a payload-gated exact `street_conversion` rule requiring two-way conversion proof plus concrete access/parking/Sheraton/Prince Street context.
- Guardrail: generic street-conversion and utility-conversion records remain `other`.
- Post-materialize counts: residual `project_family: other` is `275`; the 39 Av Two-Way Conversion Study record carries `street_redesign`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Bethpage Employee Facility

- Re-baselined residual `project_family: other` at `275`; deterministic inspection found one concrete facility-transformation project still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_bethpage-employee-facility`.
- Added a payload-gated exact `facility_transformation` rule requiring centralized-headquarters/employee-facility or warehouse-office-complex proof, LIRR Engineering / Force Account proof, and warehouse, training, or indoor-material-storage proof.
- Guardrail: bare facility-transformation and office-consolidation records remain `other`; adjacent warehouse lease records remain `other`.
- Post-materialize counts: residual `project_family: other` is `274`; the Bethpage Employee Facility record carries `capital_or_infrastructure`, while `project_meeting-doc-79341-raisin-lease` remains `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Eastern Parkway Transit Priority B14

- Re-baselined residual `project_family: other` at `274`; deterministic inspection found one transit-priority bus-stop accessibility proposal still in `other`.
- Local deterministic inspection identified one high-confidence `bus_priority` record: `project_eastern-pkwy-transit-priority-b14-apr2025`.
- Added a payload-gated exact `transit_priority` rule requiring B14/bus-stop relocation proof plus ADA-ramp, ADA-accessible-bus-stop, or pedestrian-mall proof.
- Guardrail: generic transit-priority treatments and signal-timing/corridor discussions remain `other`.
- Post-materialize counts: residual `project_family: other` is `273`; the Eastern Parkway Transit Priority Proposal B14 record carries `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - SBS/BRT Treatment Package Family

- Re-baselined residual `treatment_family: other` at `26`; deterministic inspection found several composite SBS/BRT and bus-priority package records still in `other`.
- Local deterministic inspection identified nine high-confidence `bus_priority` treatment-package records: `treatment_125th-features`, `treatment_brt-features`, `treatment_brt-toolbox-features-2012`, `treatment_bus-forward-2-bus-priority-toolkit`, `treatment_bus-priority-types`, `treatment_lga-manhattan-bronx-improvements-2012`, `treatment_long-term-sbs-improvements-2016-2017`, `treatment_sbs-2016-improvements`, and `treatment_sbs-features-pw3`.
- Added a payload-gated treatment rule for broad SBS/BRT/bus-priority package labels requiring at least three concrete component signals: bus lanes, TSP/queue jumps, off-board or advanced fare collection, SBS station/boarding amenities, limited stops/stop spacing, real-time information, low-floor/articulated buses, or curb management.
- Guardrail: bare broad labels remain `other`; two-signal toolkit/options records such as `treatment_transit-toolkit-options` and `treatment_lga-queens-improvements-2012` remain `other`.
- Post-materialize counts: residual `treatment_family: other` is `17`; the nine target records carry `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Treatment Toolkit Signal Family

- Re-baselined residual `treatment_family: other` at `17`; deterministic inspection found three toolkit/package records with enough concrete component evidence still in `other`.
- Local deterministic inspection identified three high-confidence `bus_priority` records: `treatment_hylan-technology-toolbox`, `treatment_toolkit-tsm`, and `treatment_transit-toolkit-options`.
- Extended the existing payload-gated treatment-package rule to count busway/transit-and-truck-priority and bus-lane camera enforcement as concrete component signals, and to admit exact `technology` and `operational_treatment` labels only when the payload has at least three component signals.
- Guardrail: bare `technology` and `operational treatment` labels remain `other`; two-option snippets, Queens LGA highway/TSP improvements, and geography-only targeted bus-priority records remain `other`.
- Post-materialize counts: residual `treatment_family: other` is `14`; the three target records carry `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Great Streets Capital Toolkit

- Re-baselined residual `treatment_family: other` at `14`; deterministic inspection found one capital-project toolkit record with concrete street-infrastructure and bus-priority payload proof still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `treatment_capital-project-toolkit-linden-blvd`.
- Added a payload-gated `capital_project` treatment rule requiring Great Streets capital-toolkit proof, pedestrian-safety proof, concrete physical street elements such as curb extensions, widened medians, or intersection realignment, and bus-priority elements such as bus lanes, bus stops, signal timing, or curb management.
- Guardrail: generic capital-project discussions and amenity-only Great Streets toolkit descriptions remain `other`; Queens LGA highway/TSP improvements and geography-only targeted bus-priority records remain `other`.
- Post-materialize counts: residual `treatment_family: other` is `13`; the Linden Boulevard capital-project toolkit record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Capital Program Dashboard

- Re-baselined residual `project_family: other` at `273`; deterministic inspection found one exact Capital Program Dashboard record still in `other`.
- Local deterministic inspection identified one high-confidence `data_program` record: `project_capital-program-dashboard-2025-2029`.
- Added a payload-gated exact `dashboard` project rule requiring Capital Program Dashboard and Capital Program / 2025-2029 proof.
- Guardrail: generic dashboards, security dashboards, and climate-roadmap strategy records remain `other`.
- Post-materialize counts: residual `project_family: other` is `272`; the Capital Program Dashboard record carries `data_program`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - MTA Open Data Update

- Re-baselined residual `project_family: other` at `272`; deterministic inspection found one exact Open Data `data initiative` record still in `other`.
- Local deterministic inspection identified one high-confidence `data_program` record: `project_meeting-doc-152171-mta-open-data-update`.
- Added a payload-gated exact `data_initiative` project rule requiring Open Data proof.
- Guardrail: generic/internal data initiatives and the Open Data Challenge record remain `other`.
- Post-materialize counts: residual `project_family: other` is `271`; the MTA Open Data Update record carries `data_program`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Conductor Cab Camera Deployment

- Re-baselined residual `project_family: other` at `271`; deterministic inspection found one conductor-cab camera deployment record with direct worker-safety proof still in `other`.
- Local deterministic inspection identified one high-confidence `accessibility_or_safety` record: `project_meeting-doc-135421-conductor-cab-camera-deployment`.
- Added a payload-gated exact `deployment` project rule requiring conductor-cab-camera proof plus frontline/worker-safety proof.
- Guardrail: generic camera deployments, worker-safety outreach deployments, conductor-cab-camera schedules, LED station lighting, and LIRR AVRM equipment replacement records remain `other`.
- Post-materialize counts: residual `project_family: other` is `270`; the Conductor Cab Camera Deployment record carries `accessibility_or_safety`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - LIRR AVRM Equipment Replacement

- Re-baselined residual `project_family: other` at `270`; deterministic inspection found one LIRR AVRM equipment-replacement record with specific railcar fleet proof still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_meeting-doc-177171-lirr-avrm-upgrade`.
- Extended the existing AVRM fleet rule from `procurement_contract_award` to exact `equipment_replacement`, still requiring AVRM/audio-visual recording proof, replacement/upgrade proof, and specific railcar fleet proof.
- Guardrail: generic AVRM/CCTV equipment replacement, LED station lighting, and conductor-cab camera deployment guardrails remain unchanged.
- Post-materialize counts: residual `project_family: other` is `269`; the LIRR AVRM upgrade record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Flatbush Major Transportation Project

- Re-baselined residual `project_family: other` at `269`; deterministic inspection found one Flatbush Avenue major transportation project with concrete bus-priority street-design proof still in `other`.
- Local deterministic inspection identified one high-confidence `bus_priority` record: `project_flatbush-ave-state-st-grand-army-plaza`.
- Added a payload-gated exact `major_transportation_project` rule requiring bus-lane proof, bus-stop/loading/signal proof, and pedestrian-safety street-design proof.
- Guardrail: curbside-only, curb-regulation, and geometry-only records remain `other`.
- Post-materialize counts: residual `project_family: other` is `268`; the Flatbush Avenue - State Street to Grand Army Plaza record carries `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Lexington Avenue Bus Bulbs

- Re-baselined residual `project_family: other` at `268`; deterministic inspection found one curb-extension/bus-bulb proposal still in `other`.
- Local deterministic inspection identified one high-confidence `bus_priority` record: `project_lexington-ave-bus-bulbs-2015`.
- Added a payload-gated exact `curb_extension_bus_bulb` rule requiring both curb-extension and bus-bulb proof.
- Guardrail: curb-only, curbside-only, and curb-regulation records remain `other`.
- Post-materialize counts: residual `project_family: other` is `267`; the Lexington Avenue Curb Extensions (Bus Bulbs) record carries `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Long-Term Capital SBS Treatment

- Re-baselined residual `treatment_family: other` at `13`; deterministic inspection found one capital-design/SBS implementation treatment still in `other`.
- Local deterministic inspection identified one high-confidence `bus_priority` record: `treatment_long-term-capital-sbs`.
- Added a payload-gated exact `capital_design_and_sbs_implementation` treatment rule requiring both capital-roadway-improvement proof and Select Bus Service implementation proof.
- Guardrail: generic capital-design packages remain `other`; Queens LGA highway/TSP improvements and geography-only targeted bus-priority records remain `other` under the existing package thresholds.
- Post-materialize counts: residual `treatment_family: other` is `12`; the Long Term Improvements - capital design and SBS record carries `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - CB14 Targeted Bus Priority Treatment

- Re-baselined residual `treatment_family: other` at `12`; deterministic inspection found one targeted bus-priority treatment still in `other`.
- Local deterministic inspection identified one high-confidence `bus_priority` record: `treatment_targeted-bus-priority-cb14-2017`.
- Added a payload-gated exact `bus_priority_improvements` treatment rule requiring the description to explicitly state targeted bus priority improvements.
- Guardrail: generic bus-priority-improvement discussions remain `other`; two-signal SBS/BRT snippets remain governed by the existing package threshold.
- Post-materialize counts: residual `treatment_family: other` is `11`; the Targeted bus priority improvements record carries `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - GCT Security-System Replacement

- Re-baselined residual `project_family: other` at `267`; deterministic inspection found one GCT security-system replacement with safety/security infrastructure proof still in `other`.
- Local deterministic inspection identified one high-confidence `accessibility_or_safety` record: `project_security-systems-replacement-gct`.
- Added a payload-gated exact `security_system_replacement` project rule requiring replacement/state-of-good-repair proof, security-system proof, and bounded Grand Central Terminal / Grand Central Train Shed / Park Avenue Tunnel context.
- Guardrail: generic security-system replacements and office-facility security support contracts remain `other`; HASTUS/CDMS and Energy Management System residual guardrails remain unchanged.
- Post-materialize counts: residual `project_family: other` is `266`; residual `treatment_family: other` remains `11`; residual `relation_family: other` remains `4`; residual `event_family: other` remains `1822`; the GCT security-system replacement record carries `accessibility_or_safety`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T01-03-27-858Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Thanksgiving Day Holiday Service

- Re-baselined residual `project_family: other` at `266`; deterministic inspection found one holiday-service program with explicit extra-train service proof still in `other`.
- Local deterministic inspection identified one high-confidence `service_change` record: `project_thanksgiving-day-program`.
- Added a payload-gated exact `holiday_service_program` project rule requiring token-level extra/additional train proof and Thanksgiving Day Parade / parade context.
- Guardrail: decorative seasonal trains, generic holiday customer events, and holiday/shopping permit records remain `other`.
- Post-materialize counts: residual `project_family: other` is `265`; residual `treatment_family: other` remains `11`; residual `relation_family: other` remains `4`; residual `event_family: other` remains `1822`; the Thanksgiving Day Program record carries `service_change`, while `project_holiday-lights-trains-192301` remains `other`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T01-11-24-124Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Great Neck Pocket Track

- Re-baselined residual `project_family: other` at `265`; deterministic inspection found one ESA/GCM readiness pocket-track project with train-storage and operational-flexibility proof still in `other`.
- Local deterministic inspection identified one high-confidence `capital_or_infrastructure` record: `project_great-neck-pocket-track`.
- Added a payload-gated exact `esa_readiness_project` rule requiring Great Neck/pocket-track proof, train-storage proof, and Grand Central Madison/new-service/operational-flexibility proof.
- Guardrail: generic ESA readiness planning and train-storage planning without a pocket-track asset remain `other`.
- Post-materialize counts: residual `project_family: other` is `264`; residual `treatment_family: other` remains `11`; residual `relation_family: other` remains `4`; residual `event_family: other` remains `1822`; the Great Neck Pocket Track record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T01-18-56-932Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Merged Project-Family Replay

- Re-baselined residual `project_family: other` at `264`; deterministic inspection found one split-evidence materializer replay case still in `other`.
- Target: `project_midtown-42nd-st-corridor-37171`. One accepted submission carried escalator/elevator replacement scope, while a later targeted submission carried `project_type: corridor project` and stale `project_family: other`; per-entry normalization could not see both signals at once.
- Added final merged-payload normalization after `mergePayload()` and preserved `other -> concrete` replay promotions in `_merged_field_values`.
- Guardrail: this uses existing bounded normalizer rules; it does not add broad project-family vocabulary or alter identity keys.
- Post-materialize counts: residual `project_family: other` is `263`; residual `treatment_family: other` remains `11`; residual `relation_family: other` remains `4`; residual `event_family: other` remains `1822`; Midtown 42nd St. Corridor Projects carries `accessibility_or_safety` with merged project-family values `["other", "accessibility_or_safety"]`.
- Verification: focused materializer and ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T01-28-09-830Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - ITSP Solicitation Signal Priority

- Re-baselined residual `project_family: other` at `263`; deterministic inspection found one RFP-shaped Intelligent Transit Signal Priority project still in `other`.
- Target: `project_itsp-solicitation-2026`, whose payload says NYCT requested proposals for an Intelligent Transit Signal Priority System (ITSP) for NYCT and MTA Bus Company.
- Added a payload-gated `rfp` / solicitation project rule requiring Intelligent Transit Signal Priority / ITSP proof, transit-signal-priority proof, and NYCT/MTA Bus context.
- Guardrail: generic RFPs, intelligent transportation analytics, and general signal-controller procurements remain `other`.
- Post-materialize counts: residual `project_family: other` is `262`; residual `treatment_family: other` remains `11`; residual `relation_family: other` remains `4`; residual `event_family: other` remains `1822`; the ITSP solicitation record carries `signal_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T01-36-48-159Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - 34th Street Implementation Timeline

- Re-baselined residual `treatment_family: other` at `11`; deterministic inspection found one implementation-timeline treatment whose payload explicitly says 34th Street Bus Priority would be implemented by the end of 2008.
- Target: `treatment_34th-st-implementation-deadline`.
- Added a payload-gated exact `implementation_timeline` treatment rule requiring bus-priority implementation language.
- Guardrail: generic implementation deadlines and bus-priority concepts without implementation proof remain `other`.
- Post-materialize counts: residual `project_family: other` remains `262`; residual `treatment_family: other` is `10`; residual `relation_family: other` remains `4`; residual `event_family: other` remains `1822`; the 34th Street implementation deadline carries `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T01-45-12-881Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Ronkonkoma Relief Train Service Addition

- Re-baselined residual `relation_family: other` at `4`; deterministic inspection left those records intentionally unresolved because the candidates appear to be endpoint contamination or intentionally guarded ambiguity rather than a safe relation-family rule gap.
- Re-baselined residual `project_family: other` at `262`; deterministic inspection found one service-addition project with explicit new/additional train-service proof still in `other`.
- Target: `project_ronkonkoma-relief-train-192301`, whose payload describes a new additional train departing Penn Station and arriving at Ronkonkoma.
- Added a payload-gated exact `service_addition` project rule requiring new/additional/added train or service proof plus branch/departure/relief/schedule context.
- Guardrail: generic service additions, customer-service additions, and service-addition planning discussions remain `other`.
- Post-materialize counts: residual `project_family: other` is `261`; residual `treatment_family: other` remains `10`; residual `relation_family: other` remains `4`; residual `event_family: other` remains `1822`; the Ronkonkoma Relief Train record carries `service_change`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T01-53-07-742Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Queens LGA SBS Improvements

- Re-baselined residual `treatment_family: other` at `10`; deterministic inspection found one bus-rapid-transit-improvements treatment with explicit SBS route context still in `other`.
- Target: `treatment_lga-queens-improvements-2012`, whose payload carries `Limited stops, highway operation, transit signal priority` and `location_text: Queens proposed SBS routes`.
- Added a payload-gated `bus_rapid_transit_improvements` treatment rule requiring the limited-stops + highway-operation + transit-signal-priority feature trio plus SBS/LGA route context in `location_text`.
- Guardrail: generic BRT improvements without route context and incomplete feature bundles remain `other`.
- Post-materialize counts: residual `project_family: other` remains `261`; residual `treatment_family: other` is `9`; residual `relation_family: other` remains `4`; residual `event_family: other` remains `1822`; the Queens LGA SBS improvements record carries `bus_priority`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T02-00-27-840Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - MOW Situation Room Facility

- Re-baselined residual `project_family: other` at `259`; deterministic inspection found one generic `facility` project with explicit emergency-management situation-room and subway incident / inclement-weather response proof still in `other`.
- Target: `project_mow-situation-room`, whose payload describes an emergency management situation room at Livingston Plaza for managing major subway incidents and inclement weather events.
- Added a payload-gated exact `facility` project rule requiring emergency-management situation-room proof plus subway incident or inclement-weather response context.
- Guardrail: generic facilities, office situation rooms, and emergency-management office space remain `other`.
- Post-materialize counts: residual `project_family: other` is `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`; residual `event_family: other` remains `1822`; the MOW Situation Room record carries `capital_or_infrastructure`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T02-27-20-657Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - ERG Event Alias Proof

- Re-baselined residual `event_family: other` at `1822`; deterministic inspection found `30` residual `employee_resource_group_event` records.
- Target subset: `20` records whose payload text carried known ERG or affinity-group proof such as BEGIN, EWT / Empowering Women in Transportation, Pride Express, Abilities, TransportAsian, Latinos & Friends, AAPI Heritage Month, or Hispanic Heritage Month.
- Added payload-proof aliases for those known ERG surfaces to the existing `employee_resource_group_event` rule.
- Guardrail: bare/internal ERG-shaped records such as Back to School Photos and Tabletop Model Train Project remain `other`.
- Post-materialize counts: residual `event_family: other` is `1803`; residual `employee_resource_group_event` records in `other` dropped from `30` to `11`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T02-36-23-391Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Committee Report Presentation Publication

- Re-baselined residual `event_family: other` at `1803`; deterministic inspection found committee agenda/information records whose payloads explicitly represented annual or quarterly reports being presented to the Committee.
- Target subset: committee agenda/information/reporting item kinds with payload proof such as `report will be presented to the Committee`, `annual report to the Committee`, `quarterly report to the Committee`, or `report to the Committee`.
- Added a payload-gated agenda-item rule that classifies only committee report-presentation shapes as `publication`.
- Guardrail: generic information items, committee briefings, and committee recommendations to the Board remain `other`.
- Post-materialize counts: residual `event_family: other` is `1695`; matching committee report-presentation records remaining in `other`: `0`; committee agenda/information report-presentation records carrying `publication`: `108`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T02-44-27-189Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Infrastructure Project Implementation

- Re-baselined residual `event_family: other` at `1695`; deterministic inspection found `12` residual `infrastructure_project` events.
- Target subset: `7` records whose payloads prove implementation/construction timing or completed replacement, including fully replaced/constructed, began/will-begin, scheduled-completion, and crossing-replacement wording.
- Added a payload-gated `infrastructure_project` rule for those implementation-proof phrases.
- Guardrail: bare project labels such as LIRR Third Track and generic bridge-replacement project listings remain `other`.
- Post-materialize counts: residual `event_family: other` is `1688`; `infrastructure_project` records carrying `implementation`: `7`; `infrastructure_project` records remaining `other`: `5`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T02-52-03-592Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Announcement Plan Release Publication

- Re-baselined residual `event_family: other` at `1688`; deterministic inspection found one high-confidence announcement-shaped publication.
- Target: `event_meeting-doc-131541-queens-bus-redesign-announcement-dec2023`, whose payload is an announcement of the release of the Queens Bus Network Redesign Proposed Final Plan.
- Added a payload-gated `announcement` rule for release-of-plan announcements only.
- Guardrail: CBDTP proposal, Fordham Road project restart, Vision Zero initiative, and generic announcements remain `other`.
- Post-materialize counts: residual `event_family: other` is `1687`; announcement records carrying `publication`: `1`; announcement records remaining `other`: `9`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T02-59-57-139Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - PTC Project Update Implementation

- Re-baselined residual `event_family: other` at `1687`; deterministic inspection found `15` residual `project_update` records.
- Target subset: `10` PTC project updates with explicit implementation/close-out plus full Positive Train Control functionality proof.
- Added a payload-gated `project_update` rule for completed PTC implementation updates only.
- Guardrail: generic project updates, East Side Access support updates, winter trackwork updates, board updates, and committee briefings remain `other`.
- Post-materialize counts: residual `event_family: other` is `1677`; `project_update` records carrying `implementation`: `10`; `project_update` records remaining `other`: `5`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T03-08-39-032Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Contract Term Milestones

- Re-baselined residual `event_family: other` at `1677`; deterministic inspection found `11` residual `contract_term` records.
- Target subset: `11` contract-term events with bounded contract term/date/duration proof such as base term, original contract term, five-year term, or option years.
- Added a payload-gated `contract_term` milestone rule requiring contract term language plus year/options/duration proof; fixed the normalized-year token check for underscore-normalized date ranges.
- Guardrail: bare contract-term labels and generic contract terms-and-conditions discussions remain `other`.
- Post-materialize counts: residual `event_family: other` is `1662`; `contract_term` records carrying `milestone`: `11`; `contract_term` records remaining `other`: `0`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T03-25-05-229Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Contract Extension Milestones

- Re-baselined residual `event_family: other` at `1662`; deterministic inspection found `9` residual `contract_extension` records.
- Target subset: `9` contract-extension events with bounded extension start/end/period/date/duration proof.
- Added a payload-gated `contract_extension` milestone rule for the exact canonical underscore kind.
- Guardrail: the spaced `contract extension` phrase, generic contract-extension discussions, and unrelated project timeline extensions remain `other`.
- Post-materialize counts: residual `event_family: other` is `1653`; `contract_extension` records carrying `milestone`: `9`; `contract_extension` records remaining `other`: `0`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T03-38-41-297Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Contract Start Milestones

- Re-baselined residual `event_family: other` at `1653`; deterministic inspection found `7` residual `contract_start` records.
- Target subset: `7` contract-start events with explicit contract/agreement start-date or start-of-term proof.
- Added a payload-gated `contract_start` milestone rule for the exact canonical underscore kind.
- Guardrail: the spaced `contract start` phrase, bare `contract_start` labels, and generic contract-start discussions remain `other`.
- Post-materialize counts: residual `event_family: other` is `1646`; `contract_start` records carrying `milestone`: `7`; `contract_start` records remaining `other`: `0`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T03-46-28-718Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - ERG Ceremony Public Engagement

- Re-baselined residual `event_family: other` at `1646`; deterministic inspection found `17` residual `ceremony` records.
- Target subset: `5` ERG-backed Veterans or Memorial Day ceremonies with explicit Veterans ERG / MTA Veterans Employee Resource Group proof.
- Added a payload-gated `ceremony` rule that maps only those ERG-backed ceremonies to `public_engagement`.
- Guardrail: MTAPD promotional/award ceremonies, generic Veterans Day ceremonies without ERG proof, school-safety recognition ceremonies, bare ceremony labels, and `ceremony and parade` remain `other`.
- Post-materialize counts: residual `event_family: other` is `1641`; `ceremony` records carrying `public_engagement`: `5`; `ceremony` records remaining `other`: `12`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T03-55-53-118Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Budget Review Publication

- Re-baselined residual `event_family: other` at `1641`; deterministic inspection found `25` normalized `budget_review` records in `other`, including `18` exact `budget_review` records.
- Target subset: `16` normalized budget-review records with budget-results wording plus presentation-to-committee or brief-review presentation proof.
- Added a payload-gated budget-review publication rule requiring budget-results proof and presentation proof.
- Guardrail: final proposed budget recommendation actions, review-only budget summaries without presentation proof, and the existing public-comment budget-review case remain outside this publication rule.
- Post-materialize counts: residual `event_family: other` is `1625`; normalized `budget_review` records carrying `publication`: `16`; normalized `budget_review` records remaining `other`: `9`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T04-05-46-354Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - ERG Event Alias Proof Follow-Up

- Re-baselined residual `event_family: other` at `1625`; deterministic inspection found `11` residual `employee_resource_group_event` records.
- Target subset: `8` records with explicit ERG/public-engagement surfaces: African American Day Parade, Como Yo, Latinos & Friends Shadow Day, Making Strides Against Breast Cancer, Generations in the Workforce, Winter Toy and Coat Drive, suicide prevention support, and Museum of Jewish Heritage conversation.
- Added bounded public-engagement aliases for those proof surfaces, including the normalized `Latinos & Friends` token form `latinos_and_friends`.
- Guardrail: Back to School Photos and both Tabletop Model Train Project rows remain `other` as bare/internal activity records.
- Post-materialize counts: residual `event_family: other` is `1617`; residual `employee_resource_group_event` records in `other`: `3`; `employee_resource_group_event` records carrying `public_engagement`: `79`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T04-16-23-456Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Direct Action Adoption Approval

- Re-baselined residual `event_family: other` at `1617`; deterministic inspection found `48` action-shaped residuals and `6` adoption-looking records.
- Target subset: `3` direct `board_action` adoption records and `1` `committee_action` formal adoption of a committee charter.
- Added a narrow approval rule for direct `board_action` adoption proof and `committee_action` formal adoption of a committee charter.
- Guardrail: the existing recommendation-only guard remains active; the final-budget action whose payload only says the Committee will recommend action to the Board and the Finance Committee aggregate action item remain `other`.
- Post-materialize counts: residual `event_family: other` is `1613`; `board_action` records remaining `other`: `8`; `committee_action` records remaining `other`: `11`; direct adoption records newly carrying `approval`: `4`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T04-24-38-268Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Quarterly Track Program Publication

- Re-baselined residual `event_family: other` at `1613`; deterministic inspection found `6` residual `quarterly_update` events.
- Target subset: all `6` Track Program quarterly reports with progress/state-of-good-repair proof.
- Added a payload-gated `quarterly_update` publication rule requiring quarterly-report wording plus track/progress/SGR context.
- Guardrail: bare or generic quarterly updates remain `other`.
- Post-materialize counts: residual `event_family: other` is `1607`; `quarterly_update` records carrying `publication`: `6`; `quarterly_update` records remaining `other`: `0`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T04-33-09-618Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Committee Information Reports

- Re-baselined residual `event_family: other` at `1607`; deterministic inspection found `7` residual `committee_information` records.
- Target subset: `4` committee-information records with annual-report proof or final budget-results review proof.
- Added a payload-gated `committee_information` publication rule requiring annual-report shape or final budget-results review shape.
- Guardrail: Mid-Year Forecast, Adopted Budget/Financial Plan, and Operations Summary records remain `other`.
- Post-materialize counts: residual `event_family: other` is `1603`; `committee_information` records carrying `publication`: `8`; `committee_information` records remaining `other`: `3`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T04-41-23-974Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Financial Forecast Publication

- Re-baselined residual `event_family: other` at `1603`; deterministic inspection found `6` residual `financial forecast` records.
- Target subset: all `6` Mid-Year Forecast / July Financial Plan forecast records with financial-plan, revenue/expense, financial information, or consolidated-subsidies proof.
- Added a payload-gated `financial forecast` publication rule requiring forecast/financial-plan wording plus financial-information proof.
- Guardrail: bare or generic financial forecast records remain `other`.
- Post-materialize counts: residual `event_family: other` is `1595`; `financial forecast` records carrying `publication`: `6`; `financial forecast` records remaining `other`: `0`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T04-50-46-836Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Agenda Financial Forecast Publication

- Re-baselined residual `event_family: other` at `1595`; deterministic inspection found `22` generic committee agenda/information residual records with Mid-Year Forecast / financial-plan wording plus revenue/expense or consolidated-subsidies proof.
- Target subset: `committee_agenda_item`, `committee agenda item`, `information_item`, `information item`, `committee_information`, `committee_information_item`, and `committee information item` records matching that strict financial-forecast proof.
- Reused the financial-forecast publication guard inside bounded agenda/information item handling.
- Guardrail: `Mid-Year Forecast` with generic financial-information wording alone remains `other`; adopted-budget/financial-plan records without revenue/expense or consolidated-subsidies proof remain `other`.
- Post-materialize counts: residual `event_family: other` is `1573`; targeted agenda/information financial forecast records carrying `publication`: `22`; targeted agenda/information financial forecast records remaining `other`: `0`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T05-01-26-970Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Transit Performance Reports

- Re-baselined residual `event_family: other` at `1573`; deterministic inspection found `12` generic committee agenda/information/briefing residual records that were transit-performance report publications.
- Target subset: `7` ridership reports with ridership-trend, monthly-ticket-sales, or train-count proof, plus `5` elevator/escalator annual reports with reliability or availability proof.
- Added a bounded report-publication guard for those report shapes, including committee briefings only when the strict report proof is present.
- Guardrail: generic ridership updates, elevator repair-planning briefings, operations summaries, and broad committee briefings remain `other`.
- Post-materialize counts: residual `event_family: other` is `1561`; targeted transit-performance report records carrying `publication`: `38` total, including the `12` newly normalized residuals; targeted transit-performance report records remaining `other`: `0`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `4`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T05-09-20-199Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Entity Serves Bus Routes Relation

- Re-baselined residual `relation_family: other` at `4`; deterministic inspection found one high-confidence entity-to-entity `serves` relation where the evidence explicitly says the 168th St Interim Terminal serves MTA/NICE bus routes and daily riders.
- Target subset: `serves` entity->entity relations with explicit `bus routes` plus rider proof.
- Added a narrow endpoint-shape guard classifying that proof shape as `route_scope`.
- Guardrail: generic `serves routes and riders` and `serves MTA/NICE bus routes` records without explicit `bus routes` plus rider proof remain `other`; three residual relation records remain intentionally unresolved because their endpoint resolution or agency/project semantics are less deterministic.
- Post-materialize counts: residual `relation_family: other` is `3`; targeted entity-serves-bus-routes relation carrying `route_scope`: `1`; targeted entity-serves-bus-routes relations remaining `other`: `0`; residual `project_family: other` remains `258`; residual `treatment_family: other` remains `9`; residual `event_family: other` remains `1561`.
- Verification: focused relation tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T05-17-36-794Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Rutgers Tube Rehabilitation

- Re-baselined `treatment_family: other` at `9` and inspected every residual treatment record; no treatment change was made because the clearest elevator/escalator repair cases expose asset proof only in display names, while the treatment normalizer currently uses payload fields.
- Pivoted to `project_family: other` at `258`; deterministic inspection found one high-confidence replay-only rehabilitation record: `project_rutgers-tube-meeting-doc-171436`.
- Target subset: `rehabilitation` projects with merged source evidence proving final rehabilitation of a Superstorm Sandy damaged tunnel.
- Added a narrow merged-evidence rehabilitation guard that maps that proof shape to `capital_or_infrastructure`.
- Guardrail: payload-only Rutgers Tube and L Train Tunnel labels remain `other`; Rockaways Rehab remains `other`.
- Post-materialize counts: residual `project_family: other` is `257`; Rutgers Tube project family is `capital_or_infrastructure`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`; residual `event_family: other` remains `1561`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T05-27-11-242Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Workforce Diversity Reports

- Re-baselined residual `event_family: other` at `1561`; deterministic inspection found `28` generic agenda/information residual records with explicit EEO/Diversity report surfaces.
- Target subset: agenda/information records requiring report wording plus EEO, diversity, or equal-opportunity proof and quarter, Qtr, year-end, or EEO/Diversity-report shape proof.
- Added a payload-gated workforce-diversity report publication rule.
- Guardrail: generic diversity discussions and equal-opportunity updates without report-publication proof remain `other`.
- Post-materialize counts: residual `event_family: other` is `1533`; matching workforce diversity report records carrying `publication`: `100` total, including the `28` newly normalized residuals; matching workforce diversity report records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T05-34-58-781Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Budget Certification Publications

- Re-baselined residual `event_family: other` at `1533`; deterministic inspection found `5` residual `certification` events with explicit budget/financial-plan document certification surfaces.
- Target subset: `certification` records requiring certification/certified wording plus attached-budget, preliminary-budget, or July-Financial-Plan proof.
- Added a payload-gated budget-certification publication rule.
- Guardrail: bare "certified the budget and financial plan", actuarial certifications, regulatory certifications, and volunteer certifications remain `other`.
- Post-materialize counts: residual `event_family: other` is `1528`; matching budget-certification records carrying `publication`: `5`; matching budget-certification records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T05-45-27-422Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - GCT Retail Annual Reports

- Re-baselined residual `event_family: other` at `1528`; deterministic inspection found `9` residual agenda/information records for Grand Central Terminal retail-development annual reports.
- Target subset: agenda/information records requiring annual-report wording plus Grand Central Terminal, retail-development, leasing, construction-opportunities, financial, and marketing proof.
- Added a payload-gated GCT retail annual-report publication rule.
- Guardrail: generic annual reports and mid-year operations updates without annual-report proof remain `other`.
- Post-materialize counts: residual `event_family: other` is `1519`; matching GCT retail annual-report records carrying `publication`: `10` total, including the `9` newly normalized residuals; matching GCT retail annual-report records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T05-53-48-769Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Committee Charter Approvals

- Re-baselined residual `event_family: other` at `1519`; deterministic inspection found `10` residual committee-charter annual review records with direct approval or committee-revision-approval wording.
- Target subset: annual-review, review, agenda, and information-shaped committee-charter records requiring committee-charter proof plus annual review-and-approval, review-and-approval, revision-approval, committee-revision-approval, or approval proof.
- Extended the existing committee-charter approval rule to the agenda/information/review event-kind variants while preserving the proof predicate.
- Guardrail: charter records that only say review/adequacy assessment, proposed revisions, or future formal adoption remain `other`.
- Post-materialize counts: residual `event_family: other` is `1509`; matching committee-charter approval records carrying `approval`: `21` total, including the `10` newly normalized residuals; matching committee-charter approval records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T06-01-53-592Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Committee Work Plan Approvals

- Re-baselined residual `event_family: other` at `1509`; deterministic inspection found `17` residual agenda/information records for committee work plan approvals.
- Target subset: agenda/information-shaped committee work plan records requiring `committee_work_plan` plus direct approval proof such as `approval of`, `will approve`, `requested to approve`, or `committee approves`.
- Added a narrow committee-work-plan approval rule.
- Guardrail: draft/proposed work-plan presentations, committee work-plan list records, and a no-quorum postponement remain `other`.
- Post-materialize counts: residual `event_family: other` is `1492`; matching committee work-plan approval records carrying `approval`: `19` total, including the `17` newly normalized residuals; matching committee work-plan approval records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass, `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T06-10-23-485Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Safety/Security Reports

- Re-baselined residual `event_family: other` at `1492`; deterministic inspection found `22` residual Safety/Security report records.
- Target subset: agenda/information/update records requiring Safety/Security plus comprehensive-report proof, and recurring records requiring explicit Safety Report plus monthly/compilation performance-indicator proof.
- Added a payload-gated Safety/Security report publication rule.
- Guardrail: generic safety discussions, generic safety updates, and President's Report records that only mention safety among broader topics remain `other`.
- Post-materialize counts: residual `event_family: other` is `1470`; matching Safety/Security report records carrying `publication`: `22` newly normalized residuals; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2406` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T06-20-00-809Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Contract Expiration Milestones

- Re-baselined residual `event_family: other` at `1470`; deterministic inspection found `8` residual contract-expiration records with explicit contract, agreement, or license-agreement expiry wording.
- Target subset: `contract_expiration` records requiring contract/agreement context plus expire, expires, expired, expiration, or expiring proof.
- Added a payload-gated contract-expiration milestone rule beside the existing contract-end and contract-term-end rules.
- Guardrail: bare `contract_expiration` and contract lifecycle planning discussions remain `other`.
- Post-materialize counts: residual `event_family: other` is `1462`; matching contract-expiration records carrying `milestone`: `8`; matching contract-expiration records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2410` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T06-28-33-453Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Recurring Financial Reports

- Re-baselined residual `event_family: other` at `1462`; deterministic inspection found `4` residual recurring Financial Report records with monthly report wording and budget/forecast financial-performance proof.
- Target subset: recurring agenda/information records requiring an exact Financial Report surface plus monthly-report wording and financial-performance, financial-indicator, or budget/forecast proof.
- Added a payload-gated recurring Financial Report publication rule.
- Guardrail: generic financial-report discussions and scheduled committee agenda bundles remain `other`.
- Post-materialize counts: residual `event_family: other` is `1458`; matching strict recurring Financial Report records carrying `publication`: `4`; matching strict recurring Financial Report records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2413` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T06-36-30-054Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Recurring Operations/Ridership Reports

- Re-baselined residual `event_family: other` at `1458`; deterministic inspection found `5` residual recurring Operations/Ridership Report records with monthly report wording and operating-performance statistics or ticket-sales/ridership/revenue comparison proof.
- Target subset: recurring agenda/information records requiring exact Operations Report plus operating-performance statistics/indicators proof, or exact Ridership Report plus ticket-sales, ridership, and revenue comparison proof.
- Added a payload-gated recurring Operations/Ridership Report publication rule.
- Guardrail: President's Reports and MTA Police Report activity summaries remain `other`.
- Post-materialize counts: residual `event_family: other` is `1453`; matching strict recurring Operations/Ridership Report records carrying `publication`: `5`; matching strict recurring Operations/Ridership Report records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2417` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T06-44-29-679Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Quarterly Track Program Reports

- Re-baselined residual `event_family: other` at `1453`; deterministic inspection found `7` residual committee-agenda Track Program Quarterly Update records with explicit quarterly-report, track-maintenance, and state-of-good-repair proof.
- Target subset: agenda-shaped records requiring quarterly-report wording plus progress, track-maintenance, and state-of-good-repair proof.
- Lifted the existing quarterly track-program publication guard so agenda-shaped records with the same proof normalize to `publication`.
- Guardrail: title-only Track Program Quarterly Update records and generic track-maintenance planning updates remain `other`.
- Post-materialize counts: residual `event_family: other` is `1446`; matching strict quarterly track-program report records carrying `publication`: `7`; matching strict quarterly track-program report records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2420` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T06-52-22-339Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Strategic Priorities Reports

- Re-baselined residual `event_family: other` at `1446`; deterministic inspection found `3` residual Strategic Priorities update records with biannual-report wording and railroad progress/customer-service proof.
- Target subset: `strategic_priorities_update` and `strategic_update` records requiring biannual report, Railroads' progress, safe-and-reliable transportation, and customer-service proof.
- Added a payload-gated Strategic Priorities report publication rule.
- Guardrail: ERG strategic-priorities training records and title-only Way Ahead Strategic Plan agenda items remain `other`.
- Post-materialize counts: residual `event_family: other` is `1443`; matching strict Strategic Priorities report records carrying `publication`: `3`; matching strict Strategic Priorities report records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2424` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T07-00-23-751Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - State-Required Annual Reports

- Re-baselined residual `event_family: other` at `1443`; deterministic inspection found `2` residual Finance Committee action items for state-required annual reports.
- Target subset: `finance_committee_action_item` records requiring state-required report wording plus either All-Agency Annual Procurement Report with Procurement Division proof or MTA Annual Investment Report with Treasury Division proof.
- Added a payload-gated state-required annual report publication rule.
- Guardrail: generic Finance Committee action items and procurement discussions remain `other`.
- Post-materialize counts: residual `event_family: other` is `1441`; matching state-required annual report records carrying `publication`: `2`; matching state-required annual report records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2427` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T07-08-19-858Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Recurring Key Performance Metrics Reports

- Re-baselined residual `event_family: other` at `1441`; deterministic inspection found `2` residual recurring Key Performance Metrics report records with monthly presentation/book wording and performance-indicator proof.
- Target subset: recurring agenda/information records requiring exact Key Performance Metric(s) Report surfaces plus monthly/comprehensive-overview and performance-indicator proof.
- Added a payload-gated recurring Key Performance Metrics report publication rule.
- Guardrail: mid-year operations updates with key performance metrics remain `other`.
- Post-materialize counts: residual `event_family: other` is `1439`; matching strict recurring Key Performance Metrics report records carrying `publication`: `2`; matching strict recurring Key Performance Metrics report records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2430` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T07-17-31-686Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Draft/Proposed Committee Work Plans

- Re-baselined residual `event_family: other` at `1439`; deterministic inspection found `26` residual draft/proposed Committee Work Plan records with direct proposed-title or present-a-draft wording.
- Target subset: committee action/agenda/information/work-plan records requiring Committee Work Plan proof plus present-a-draft, presents-draft, presentation-of-draft, or Proposed Committee Work Plan proof.
- Added a payload-gated Committee Work Plan planning rule.
- Guardrail: Committee Work Plan approval records remain `approval`, and broad agenda-list bundles that only mention a proposed work plan remain `other`.
- Post-materialize counts: residual `event_family: other` is `1413`; matching strict draft/proposed Committee Work Plan records carrying `planning`: `26`; matching strict draft/proposed Committee Work Plan records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2432` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T07-27-31-192Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Schedule/Trackwork Advisory Planning

- Re-baselined residual `event_family: other` at `1413`; deterministic inspection found `69` residual schedule/trackwork advisory records with committee-advised or inform-the-committee wording, explicit plans to adjust schedules, and timetable/trackwork/holiday-service context.
- Target subset: committee agenda/briefing/information, information item, project update, timetable-and-trackwork, trackwork advisory/update, holiday-service-planning, and service-planning-and-trackwork records requiring committee-advised/inform wording plus `plans to adjust schedules` plus timetable/trackwork/holiday-service context.
- Added a payload-gated schedule-advisory planning rule.
- Guardrail: exact schedule/timetable changes remain `implementation`, bare trackwork advisories remain `other`, and broad agenda-list bundles without schedule-adjustment proof remain `other`.
- Post-materialize counts: residual `event_family: other` is `1344`; matching strict schedule-advisory records carrying `planning`: `69`; matching strict schedule-advisory records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2437` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T07-36-40-806Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Committee Schedule-Advisory Planning Follow-Up

- Re-baselined residual `event_family: other` at `1344`; deterministic inspection found `44` additional committee schedule-advisory records whose payload only says the committee will be advised of plans to adjust schedules.
- Target subset: committee agenda/information, information item, service-planning, and service-plan-advisory records requiring committee-advised wording plus `plans to adjust schedules`.
- Relaxed the existing payload-gated schedule-advisory planning rule for those committee/service advisory kinds.
- Guardrail: exact implemented schedule/timetable changes remain `implementation`, and generic committee agenda items without schedule-adjustment proof remain `other`.
- Post-materialize counts: residual `event_family: other` is `1300`; full strict committee schedule-advisory records carrying `planning`: `87`; full strict committee schedule-advisory records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2440` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T07-44-42-584Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Trackwork Adjust-Schedule Planning Follow-Up

- Re-baselined residual `event_family: other` at `1300`; deterministic inspection found `17` residual trackwork/construction schedule-advisory records with `adjust schedules` or `temporarily adjust schedules` wording plus trackwork, construction-project, or switch-installation proof.
- Target subset: information, committee briefing/information, project update, and track-work-program-update records requiring adjust-schedules wording plus trackwork/construction/switch-installation proof.
- Extended the existing payload-gated schedule-advisory planning rule for those adjust-schedule forms.
- Guardrail: generic adjust-schedules text without trackwork/construction proof remains `other`, and exact implemented schedule/timetable changes remain `implementation`.
- Post-materialize counts: residual `event_family: other` is `1283`; full strict trackwork adjust-schedule records carrying `planning`: `52`; full strict trackwork adjust-schedule records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2443` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T07-53-07-543Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Public and Planning Tours

- Re-baselined residual `event_family: other` at `1283`; deterministic inspection found `11` residual public/planning tour records with tour, site-tour, site-visit, public-tour, or walking-tour event kinds plus CAC, public-outreach, public-tour, or SBS planning/reference proof.
- Target subset: `tour`, `site_tour`, `site_visit`, `public_tour`, and `walking_tour` records requiring payload proof from CAC, public outreach, explicit public tour wording, or SBS planning/reference context.
- Added a payload-gated public-engagement rule for those tour records.
- Guardrail: internal/professional tours, elected-official-only tours, commercial tourism/promotion events, and generic public/community event labels remain `other`.
- Post-materialize counts: residual `event_family: other` is `1272`; strict public/planning tour records carrying `public_engagement`: `11`; strict public/planning tour records remaining `other`: `0`; residual `project_family: other` remains `257`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2449` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T08-05-48-958Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Service/Schedule Projects

- Re-baselined residual `project_family: other` at `257`; deterministic inspection found `4` residual service/schedule projects with payload-proven schedule changes, seasonal service, or emergency/scheduled bus services for railroad passengers during track outages and service disruptions.
- Target subset: `schedule_change`, `seasonal_service`, `procurement`, `contract_modification`, and `competitive_procurement_miscellaneous_service_contract` records requiring concrete train schedule/service or emergency/scheduled bus-service proof.
- Added a payload-gated `service_change` rule for those project records.
- Guardrail: generic seasonal-service events, administrative schedule-change text, and generic bus-equipment procurement remain `other`.
- Post-materialize counts: residual `project_family: other` is `253`; strict service/schedule project records carrying `service_change`: `4`; strict service/schedule project records remaining `other`: `0`; residual `event_family: other` remains `1272`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2455` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T08-15-50-098Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Recurring Approval Of Minutes

- Re-baselined residual `event_family: other` at `1272`; deterministic inspection found `3` residual recurring approval-of-minutes agenda records with Approval of Minutes names and payload proof that the Committee Chair requests a motion to approve prior-month minutes or official proceedings of the Committee meeting.
- Target subset: `recurring_agenda_item` records requiring minutes plus approval/approve wording plus committee-meeting, prior-month, or official-proceedings proof.
- Added a payload-gated `approval` rule for those recurring minutes records.
- Guardrail: recurring procurements, recurring financial reports, and other recurring agenda/report entries remain `other` unless an existing report-publication rule applies.
- Post-materialize counts: residual `event_family: other` is `1269`; strict recurring approval-of-minutes records carrying `approval`: `3`; strict recurring approval-of-minutes records remaining `other`: `0`; residual `project_family: other` remains `253`; residual `treatment_family: other` remains `9`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2459` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T08-25-37-659Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Main-Valve Accessibility Repair

- Re-baselined residual `treatment_family: other` at `9`; deterministic inspection found `1` Atlantic Terminal 2 repair record with `Main Valve issues and replacements` in the LIRR elevator availability source.
- Target subset: `repair` treatment records requiring bounded elevator/escalator component proof from `main_valve`, existing vertical-circulation identifiers, or existing escalator repair signals.
- Extended the existing repair normalizer to read scalar `locations` values and classify `main_valve` repairs as `pedestrian_or_accessibility`.
- Guardrail: generic `GC warranty repairs`, construction-zone references, murals, operational changes, subway-connection diagram entries, and vending-machine license records remain `other`.
- Post-materialize counts: residual `treatment_family: other` is `8`; targeted main-valve repair records carrying `pedestrian_or_accessibility`: `1`; targeted main-valve repair records remaining `other`: `0`; residual `event_family: other` remains `1269`; residual `project_family: other` remains `253`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2462` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T08-41-56-708Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Procurement Guidelines Policy Programs

- Re-baselined residual `project_family: other` at `253`; deterministic inspection found `2` all-agency procurement guideline records.
- Target subset: exact `procurement_guidelines` project type only.
- Added an exact project-family rule mapping `procurement_guidelines` to `policy_program`.
- Guardrail: generic `procurement`, `procurement modification`, service/public-works contracts, and `procurement guideline update` remain governed by existing payload gates or `other`.
- Post-materialize counts: residual `project_family: other` is `251`; strict procurement-guidelines records carrying `policy_program`: `2`; strict procurement-guidelines records remaining `other`: `0`; residual `event_family: other` remains `1269`; residual `treatment_family: other` remains `8`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2464` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T08-50-24-879Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Open Data Challenge Program

- Re-baselined residual `project_family: other` at `251`; deterministic inspection found `1` MTA Open Data Challenge record with `project_type: challenge` and explicit Open Data library proof.
- Target subset: `challenge` project records requiring Open Data / MTA Open Data proof.
- Added a narrow project-family rule mapping Open Data challenges to `data_program`.
- Guardrail: generic innovation challenges remain `other`.
- Post-materialize counts: residual `project_family: other` is `250`; target Open Data Challenge records carrying `data_program`: `1`; target Open Data Challenge records remaining `other`: `0`; total `data_program` project records: `5`; residual `event_family: other` remains `1269`; residual `treatment_family: other` remains `8`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`225` tests, `2466` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T08-58-38-788Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Legacy Project Family Canonicalization

- Re-baselined residual tails: `relation_family: other` is `3`, `treatment_family: other` is `8`, `project_family: other` is `250`, and concrete noncanonical `project_family` values total `7`.
- Relation tail decision: the remaining broad `serves`/`affects` rows are endpoint-suspect or intentionally ambiguous and were not forced into a family.
- Treatment tail decision: commercial vending/micro-markets, construction-zone context, public art, generic warranty repairs, station-agent operating model, and subway-map connection symbols remain intentionally unresolved.
- Target subset: existing concrete project-family legacy values `bike_lane`, `bike_boulevard`, `greenway`, `bus_priority_corridor`, `transit_signal_priority`, and `transit_signal_priority_program`.
- Added deterministic replay canonicalization to map bike subfamilies to `bike_facility`, bus-priority corridor to `bus_priority`, and transit-signal-priority variants to `signal_priority`.
- Post-materialize counts: noncanonical concrete `project_family` values are `0`; `project_family: other` remains `250`; `bike_facility` is `6`; `bus_priority` is `42`; `signal_priority` is `3`; residual `event_family: other` remains `1269`; residual `treatment_family: other` remains `8`; residual `relation_family: other` remains `3`.
- Verification: focused ontology tests pass (`226` tests, `2472` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T09-07-57-082Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Stalled Project Status Literals

- Re-baselined residual `document_time_status: other` at `120`; exact `on hold` and `work stopped and suspended after incident` status records accounted for `2` of those.
- Project-family residual decision: existing recorded guardrails keep broad TOD/real-estate, recreational trail, maintenance, and operating-efficiency residuals unresolved without stronger payload proof.
- Target subset: project `status` literals containing `on_hold`, `suspended`, or `work_stopped`.
- Added a deterministic project-status rule mapping those paused/stopped status literals to `stalled_resuming`.
- Post-materialize counts: residual `document_time_status: other` is `118`; `document_time_status: stalled_resuming` is `7`; the Fulton A/C signal modernization and LIRR Third Track records now carry `stalled_resuming`; residual `project_family: other` remains `250`.
- Verification: focused ontology tests pass (`226` tests, `2474` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T09-16-34-500Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Completion Progress Status Literals

- Re-baselined residual `document_time_status: other` at `118`; completion-progress status literals accounted for `3` high-confidence targets.
- Target subset: exact `substantial_completion`, dated `substantial_completion_at_end...`, and `nearing_substantial_completion` status forms.
- Added deterministic project-status rules mapping plain/datable substantial-completion forms to `implemented` and nearing-substantial-completion forms to `active`.
- Guardrail: forecast or anticipated completion text remains `other`; `substantial completion anticipated Fall 2024`, `completion goal`, and `Project completion slated...` were not normalized.
- Post-materialize counts: residual `document_time_status: other` is `115`; `document_time_status: active` is `358`; `document_time_status: implemented` is `288`; the MNR station improvements and Harlem Express Cable records carry `implemented`, and the Bronx-Whitestone / Verrazzano climate-resiliency work carries `active`.
- Verification: focused ontology tests pass (`226` tests, `2478` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T09-24-01-151Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Active Construction Progress Status Literals

- Re-baselined residual `document_time_status: other` at `115`; active construction-progress status literals accounted for `2` high-confidence targets.
- Target subset: status text containing `installation_is_progressing` or `nearing_end_of_civil_work`.
- Added deterministic project-status rules mapping those active progress forms to `active`.
- Guardrail: concurrent-delay/manufacturing-delay status text remains `other`; forecast/anticipated/slated completion statuses remain `other`.
- Post-materialize counts: residual `document_time_status: other` is `113`; `document_time_status: active` is `360`; Culver F CBTC and LIRR Third Track Expansion records carry `active`; the 8 Av A/C/E CBTC concurrent-delay record remains `other`.
- Verification: focused ontology tests pass (`226` tests, `2480` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T09-31-12-137Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Active Lifecycle Variant Status Literals

- Re-baselined residual `document_time_status: other` at `113`; active lifecycle variant status literals accounted for `3` high-confidence targets.
- Target subset: exact/near-exact active forms `wrapping_up_as_of...`, `on_going`, and `in_development_roll_out`.
- Added deterministic project-status rules mapping those active variants to `active`.
- Guardrail: concurrent-delay, forecast/anticipated/slated completion, and `construction_pushed_to_2025` status text remains `other`.
- Post-materialize counts: residual `document_time_status: other` is `110`; `document_time_status: active` is `363`; Rutgers Tube, Grand Central Terminal Train Shed roof replacement, and Track Access Management System records carry `active`.
- Verification: focused ontology tests pass (`226` tests, `2483` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T09-40-45-881Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Elevator/Escalator Warranty Repair Treatments

- Re-baselined residual `treatment_family: other` at `8`; elevator/escalator warranty repair records accounted for `2` high-confidence targets.
- Target subset: `repair` treatment observations whose submission label proves elevator or escalator context while the payload description says GC warranty repairs/issues.
- Added bounded materializer context that carries the observation label into treatment payloads only for repair labels containing elevator/escalator signals; extended repair normalization to read `label` and `name` alongside description/location context.
- Guardrail: bare `GC warranty repairs` without elevator/escalator label context remains `other`; construction-zone, mural, station-agent operating model, subway-connection symbol, and vending-machine residuals remain unresolved.
- Post-materialize counts: residual `treatment_family: other` is `6`; `pedestrian_or_accessibility` is `238`; Locust Manor A Elevator and Valley Stream Escalator warranty repair records carry `pedestrian_or_accessibility`.
- Verification: focused ontology tests pass (`226` tests, `2485` expect calls), focused materializer tests pass (`31` tests, `749` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T09-50-50-788Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Legacy Event-Family Canonicalization

- Re-baselined concrete noncanonical `event_family` values at `3`: `postponement`, `press_release`, and `tolling_program_commencement`.
- Target subset: existing concrete legacy event-family values only.
- Added deterministic replay canonicalization mapping `postponement` to `pause`, `press_release` to `publication`, and `tolling_program_commencement` to `launch`.
- Guardrail: unrelated concrete event-family values remain unchanged; residual `event_family: other` records were not forced into families.
- Post-materialize counts: noncanonical concrete event-family values are `0`; residual `event_family: other` remains `1269`; Bx6 Local postponement carries `pause`, the TSP press release carries `publication`, and congestion-pricing commencement carries `launch`.
- Verification: focused ontology tests pass (`227` tests, `2489` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T09-59-42-870Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Legacy Project Status Canonicalization

- Re-baselined concrete noncanonical `document_time_status` values at `1`: `construction_began_june_2016_anticipated_completion_summer_2017`.
- Target subset: existing concrete project `document_time_status` companion values that themselves normalize to a bounded lifecycle state.
- Added deterministic replay canonicalization for concrete document-time status values before raw `status` fallback promotion.
- Guardrail: existing `document_time_status: other` records remain governed by the raw status normalizer and were not forced into lifecycle states.
- Post-materialize counts: noncanonical concrete `document_time_status` values are `0`; residual `document_time_status: other` remains `110`; M86 SBS Pedestrian Safety Capital Construction carries `under_construction`.
- Verification: focused ontology tests pass (`227` tests, `2490` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T10-07-29-379Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Contract Start Space-Spelling Milestones

- Re-baselined residual `event_family: other` at `1269`; space-spelled `contract start` / `Contract start` records accounted for `5` high-confidence dated contract-start targets.
- Target subset: dated contract-start events whose event kind used the space spelling rather than the existing underscore-spelled `contract_start` form.
- Added deterministic event-family normalization for space-spelled contract-start kinds when date/start-date proof is present.
- Guardrail: undated vague `contract start` discussion remains `other`; contract extensions, contract terms, and contract ends remain under their separate existing proof gates.
- Post-materialize counts: residual `event_family: other` is `1264`; `event_family: milestone` is `853`; all `5` targeted contract-start records carry `milestone`.
- Verification: focused ontology tests pass (`227` tests, `2493` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T10-20-16-483Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - RRNFPS Relation-Family Cleanup

- Re-baselined residual `relation_family: other` at `3`; one record, `relation_rr-nfps-serves-lirr-mnr`, had raw evidence proving Railroad New Fare Payment System replacement scope at both LIRR and MNR.
- Target subset: `project -> entity` `serves` relations for RRNFPS only when raw evidence proves both railroad agencies and replacement scope.
- Added a deterministic endpoint-aware relation-family rule mapping that named RRNFPS service pattern to `agency_role`.
- Guardrail: generic project-to-entity fare-payment service text remains `other`; description-only RRNFPS wording without replacement-at-both-railroads proof remains `other`.
- Post-materialize counts: residual `relation_family: other` is `2`; `relation_rr-nfps-serves-lirr-mnr` carries `agency_role`; `relation_alliant-ocip-sas-phase2` and `relation_mnr-lirr-escalator-rfp` remain visible because their canonical endpoints are contaminated or under-specified.
- Verification: focused relation tests pass (`8` tests, `518` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T10-29-39-864Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Procurement and Lifecycle Status Literals

- Re-baselined residual `document_time_status: other` at `110`; five exact status literals had bounded lifecycle/procurement semantics.
- Target subset: `on schedule and on budget`, `partially in service`, `RFP pending`, `RFP released`, and `recommended for approval`.
- Added deterministic status normalization mapping the first two to `active` and the procurement/approval forms to `planned`.
- Guardrail: broad `recommended`, `approval`, `launching`, `reviewed`, generic design, and ambiguous completion-percentage statuses remain `other`.
- Post-materialize counts: residual `document_time_status: other` is `105`; `active` totals `365`; `planned` totals `541`; the five targeted records now carry `active` or `planned`.
- Verification: focused ontology tests pass (`227` tests, `2498` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T10-37-06-409Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Execution and Procurement Status Literals

- Re-baselined residual `document_time_status: other` at `105`; eight records had exact bounded procurement/planning or active-execution status literals.
- Target subset: `recommended for Board approval`, `under procurement`, `under solicitation`, `Scoping`, `testing`, `property acquisition phase`, and `phasing in early 2023`; `recommended for Board approval` covered two records.
- Added deterministic status normalization mapping the procurement/approval forms to `planned`, `Scoping` to `study`, and active execution forms to `active`.
- Guardrail: broad `recommended`, `approval`, `launching`, `reviewed`, `presented`, generic design, and ambiguous completion-percentage statuses remain `other`.
- Post-materialize counts: residual `document_time_status: other` is `98`; `active` totals `368`; `planned` totals `544`; `study` totals `52`; all eight targeted records now carry bounded lifecycle status.
- Verification: focused ontology tests pass (`227` tests, `2505` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T10-44-55-677Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Scheduled Start Status Literals

- Re-baselined residual `document_time_status: other` at `98`; five exact status literals described future or anticipated start timing.
- Target subset: `Beginning in Q2 2025 through 2027`, `implementation begins Mid-July`, `upcoming Q1 2025`, `upcoming six-weekend project spanning July and August`, and `work currently anticipated to begin by the second quarter of 2024`.
- Added deterministic status normalization mapping those exact scheduled-start literals to `planned`.
- Guardrail: broad `beginning`, `Beginning Sep 3`, `launching`, `announced`, and generic date/status fragments remain `other`.
- Post-materialize counts: residual `document_time_status: other` is `93`; `planned` totals `549`; all five targeted records now carry `planned`.
- Verification: focused ontology tests pass (`227` tests, `2510` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T10-52-29-672Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Authorization and Terminal Status Literals

- Re-baselined residual `document_time_status: other` at `93`; twelve exact status literals had bounded approval, funding/security, order/option, or terminal lifecycle semantics.
- Target subset: `lease authorized`, `purchase authorized`, `option exercised`, `FONSI secured`, `FEMA Reimbursement Secured`, `initial investment received`, `funding added`, `ordered`, `directed by law`, `superseded`, `concluded`, and `live`.
- Added deterministic status normalization mapping authorization/funding/legal/order forms to `approved`, and terminal `superseded`/`concluded`/`live` forms to `implemented`.
- Guardrail: broad `committed`, `approval`, `ratification`, `recommended`, `launching`, `reviewed`, and ambiguous completion-percentage statuses remain `other`.
- Post-materialize counts: residual `document_time_status: other` is `81`; `approved` totals `183`; `implemented` totals `291`; all twelve targeted records now carry bounded lifecycle status, while `project_meeting-doc-79331-bus-lane-commitment` remains `other`.
- Verification: focused ontology tests pass (`227` tests, `2523` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T11-01-44-571Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Deployment and Expansion Status Literals

- Re-baselined residual `document_time_status: other` at `81`; eight exact status literals had bounded deployed, existing, expanded, active implementation, or post-implementation semantics.
- Target subset: `deployed April 2026`, `Existing`, `expanded`, `expanded beyond GCT to North White Plains`, `expanded from 7 to 45 locations`, `expanding to 27 additional platforms`, `implementation`, and `post-implementation evaluation`.
- Added deterministic status normalization mapping resolved deployment/existing/expanded/post-implementation forms to `implemented`, and active implementation/ongoing expansion forms to `active`.
- Guardrail: broad `launching`, `executed`, design, reviewed, presented, annual-update, and ambiguous completion-percentage statuses remain `other`.
- Post-materialize counts: residual `document_time_status: other` is `73`; `active` totals `370`; `implemented` totals `297`; all eight targeted records now carry bounded lifecycle status, while the three `launching` records and `project_cortlandt-station-event-parking` (`executed`) remain `other`.
- Verification: focused ontology tests pass (`227` tests, `2529` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T11-10-00-835Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - ION Contract Award Ratification Status Literals

- Re-baselined residual `document_time_status: other` at `73`; two exact `Ratification of ION declaration and contract award` status records had bounded contract-award semantics.
- Target subset: `project_meeting-doc-201746-bus-radio-system-maintenance` and `project_meeting-doc-201746-ecitation-system`.
- Added deterministic status normalization mapping only `Ratification of ION declaration and contract award` to `approved`.
- Guardrail: generic `approval`, `ratification`, and `Ratification` statuses remain `other`.
- Post-materialize counts: residual `document_time_status: other` is `71`; `approved` totals `185`; both targeted ION records now carry `approved`.
- Verification: focused ontology tests pass (`227` tests, `2533` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T11-17-25-912Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Project Advancement Status Literals

- Re-baselined residual `document_time_status: other` at `71`; eight exact status literals had bounded lifecycle, planning, or approval semantics.
- Target subset: `early phase`, `in its early stages`, `kick-off`, `Moving forward`, `CRISI Grant application submitted to FRA`, `future`, `next project to advance`, and `Locally Preferred Alternative`.
- Added deterministic status normalization mapping early activity/kickoff/forward movement to `active`, grant/future/next-advance planning forms to `planned`, and locally preferred alternative to `approved`.
- Guardrail: broad `announced`, `new`, `reported`, generic design statuses, generic approval/ratification labels, and ambiguous completion-percentage statuses remain `other`.
- Post-materialize counts: residual `document_time_status: other` is `63`; `active` totals `374`; `planned` totals `552`; `approved` totals `186`; all eight targeted records now carry bounded lifecycle status.
- Verification: focused ontology tests pass (`227` tests, `2540` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T11-25-10-150Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Infrastructure Continuation Status Literals

- Re-baselined residual `document_time_status: other` at `63`; six exact status literals had bounded active continuation/restoration or planned handoff semantics.
- Target subset: `service restored September 3, 2024; continues until Q3 2027`, `supported during this timetable`, `supported during this timetable to improve state of good repair and reliability`, `Restart station reconstruction and ADA upgrades at Hollis LIRR; procurement for subway station renewals at Briarwood EF`, `Resume procurements on Verrazzano-Narrows Bridge ramp reconstruction and main cable dehumidification`, and `transmitted to DDC for design and construction`.
- Added deterministic status normalization mapping continuation/restoration/restart/resume forms to `active`, and DDC design-and-construction handoff to `planned`.
- Guardrail: broad `announced`, `new`, `reported`, `presented`, `reviewed`, annual-update, generic design, generic approval/ratification labels, and ambiguous completion-percentage statuses remain `other`.
- Post-materialize counts: residual `document_time_status: other` is `57`; `active` totals `379`; `planned` totals `553`; all six targeted records now carry bounded lifecycle status.
- Verification: focused ontology tests pass (`227` tests, `2546` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T11-32-19-808Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Design Phase Status Literals

- Re-baselined residual `document_time_status: other` at `57`; three exact status literals were design-phase variants of the existing `Design` / `design phase` policy.
- Target subset: `In design`, `in design phase`, and `In final stages of design`.
- Added deterministic status normalization mapping those exact design-phase forms to `study`.
- Guardrail: broad `presented`, `reviewed`, annual-update, generic approval/ratification labels, and ambiguous completion-percentage statuses remain `other`.
- Post-materialize counts: residual `document_time_status: other` is `54`; `study` totals `55`; all three targeted records now carry `study`.
- Verification: focused ontology tests pass (`227` tests, `2547` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T11-39-40-974Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Active Progress Status Literals

- Re-baselined residual `document_time_status: other` at `54`; two exact status literals had bounded active-progress semantics.
- Target subset: `Project completion slated for July 2023, currently in last phase of construction` and `scaling up`.
- Added deterministic status normalization mapping those exact progress forms to `active`.
- Guardrail: purchase/replacement slogans, weekend-only outage/date labels, broad `announced`/`new`/`reported` labels, review/presentation/update labels, generic approval/ratification labels, and ambiguous completion-percentage statuses remain `other`.
- Post-materialize counts: residual `document_time_status: other` is `52`; `active` totals `381`; both targeted records now carry `active`, while `Purchase new dual-mode locomotives for LIRR`, `Replacing Old Train Cars ✓`, `weekend of May 17-18, 2025`, and `weekends of May 3-4 and May 17-18, 2025` remain `other`.
- Verification: focused ontology tests pass (`227` tests, `2549` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T11-48-23-399Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Railroad Escalator Relation Family

- Re-baselined residual `relation_family: other` at `2`; one record had bounded MNR/LIRR escalator-maintenance location scope and one record showed source/payload contamination.
- Target subset: `relation_mnr-lirr-escalator-rfp`.
- Added deterministic relation normalization mapping only `project -> entity` `affects` records with canonical MNR/LIRR escalator-maintenance identity and description evidence to `location_scope`.
- Guardrail: generic `affects project -> entity` records, prose-only railroad escalator descriptions without canonical identity context, and the contaminated `relation_alliant-ocip-sas-phase2` record remain `other`.
- Post-materialize counts: residual `relation_family: other` is `1`; `location_scope` totals `74`; `relation_mnr-lirr-escalator-rfp` now carries `location_scope`.
- Intentionally unresolved: `relation_alliant-ocip-sas-phase2` remains `other` because its accepted payload endpoints point at Metro-North/Penn Station Access while its label/evidence point at an Alliant OCIP/Second Avenue Subway item. That needs a deterministic relation repair/quarantine path, not family normalization.
- Verification: focused relation tests pass (`8` tests, `521` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T12-01-06-269Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Construction Zone Treatment Family

- Re-baselined residual `treatment_family: other` at `6`; two exact `construction zone` records had bounded corridor-map construction/infrastructure semantics.
- Target subset: `treatment_construction-zone-first-ave` and `treatment_construction-zone-second-ave`.
- Added exact-token treatment normalization mapping `construction zone` to `capital_or_infrastructure`.
- Guardrail: vending/micro-market amenities, public-art mural records, station-agent staffing/operating changes, and subway-connection map markers remain `other`.
- Post-materialize counts: residual `treatment_family: other` is `4`; `capital_or_infrastructure` totals `257`; both construction-zone records now carry `capital_or_infrastructure`.
- Verification: focused ontology tests pass (`227` tests, `2550` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-27T12-09-15-764Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - External Advisory License/Lease Agreement Events

- Owner authorization on June 29, 2026 permits external LLM use for candidate discovery, with an advisory-only campaign policy: provider output may propose bounded buckets, but implementation must still be deterministic local code, overrides, materializer policy, or tests. Provider-backed mutating harness paths remain out of scope.
- Advisory artifacts: `data/review_notes/external-advisory-2026-06-29/event-family-other-top80-packet.json` and `data/review_notes/external-advisory-2026-06-29/pioneer-event-family-other-top80-advisory.json`.
- Re-baselined residual `event_family: other` at `1264`; exact normalized `license_agreement` / `lease_agreement` records accounted for `25` residual records.
- Added exact event-kind normalization mapping `license_agreement` and `lease_agreement` to `milestone`.
- Guardrail: `license_agreement_effective`, `license term`, `license_amendment`, `lease execution`, `lease_renewal_agreement`, `lease termination agreement`, and other agreement-like boundary labels remain `other`.
- Post-materialize counts: residual `event_family: other` is `1239`; all `25` targeted license/lease agreement event records now carry `milestone`.
- Verification: focused ontology tests pass (`227` tests, `2563` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T12-46-26-182Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Treatment And Relation Tail Zero

- Re-baselined the smallest residual buckets: `treatment_family: other = 4` and `relation_family: other = 1`.
- Treatment target subset: `treatment_compass-vending-machines-mta-system`, `treatment_garrett-goble-mural`, `treatment_meeting-doc-station-agent-mobility`, and `treatment_subway-connection-2015-webster`.
- Added exact/payload-gated treatment normalization: `vending machine installation` and `mural` map to bounded `amenity_or_public_art`; exact `Subway Connection` maps to `customer_information`; `operational_change` maps to `service_pattern` only when payload text proves station agents working outside booths / customer-service mobility.
- Relation target subset: contaminated `relation_alliant-ocip-sas-phase2` from submission `sub_09565ca22f579c3f`.
- Retired `sub_09565ca22f579c3f` because its label describes Alliant Insurance Services providing OCIP for Second Avenue Subway Phase II, but its accepted payload endpoints resolve to Metro-North Railroad and Penn Station Access. The clean same-source Alliant/SAS2 `contracted_by` relation `sub_f90d721b5e2cb3c7` remains canonical and normalized to `funding_award`.
- Post-materialize counts: `treatment_family: other` is `0`; `relation_family: other` is `0`; retired submissions skipped is `242`; canonical records total is `84048`.
- Verification: focused ontology tests pass (`228` tests, `2568` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T13-03-30-790Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Project Family Extended Taxonomy

- Re-baselined residual `project_family: other` at `250`; the largest exact backlog groups included generic procurement/contract records plus non-transit administrative, property, customer, technology, and funding records.
- Added deterministic fallback families for recurring records that do not fit older transit-improvement buckets: `real_estate_or_property`, `internal_operations`, `customer_experience`, `technology_system`, and `finance_or_funding`.
- Guardrail: these fallbacks run after existing payload-specific infrastructure, safety, fare, enforcement, service, and planning rules, so stronger context still wins. Generic procurement, contract modification, personal-service contract, program, Design-Build, maintenance, recreational trail, and ambiguous rehabilitation records remain `other` pending separate exact/payload-gated slices.
- Post-materialize counts: `project_family: other` is `154`; new family totals are `real_estate_or_property = 39`, `internal_operations = 26`, `customer_experience = 9`, `technology_system = 13`, and `finance_or_funding = 9`.
- Verification: focused ontology tests pass (`229` tests, `2580` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T13-19-17-664Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Contract-Shaped Support Project Families

- Re-baselined residual `project_family: other` at `154`; the largest remaining exact groups were contract/procurement-shaped records plus low-count administrative, customer, technology, and operations labels.
- Added payload-gated normalization for contract/procurement-shaped support records: tolling/contact-center support maps to `fare_program`, HASTUS/AVLM/RTS-CAD/radio/PBX/GRC/EAM/Kronos/UKG/simulator systems map to `technology_system`, office/fleet/fuel/consulting/small-business support maps to `internal_operations`, and FMTAC/investment portfolio support maps to `finance_or_funding`.
- Added exact/project-type cleanup for `alternative_dispute_resolution_program`, `apprenticeship_program`, `cleaning_initiative`, `community_event`, `cultural_programming`, `cell_service_installation`, and `drone_program`, plus a narrow Open Stroller `program` payload rule for stroller/customer/bus evidence.
- Guardrail: generic procurement/contract/program records remain `other` without bounded payload proof. Recreational trails, ambiguous maintenance/rehabilitation labels, insurance procurement, lease/license extension tail records, and broad implementation/design labels remain unresolved for later slices.
- Post-materialize counts: `project_family: other` is `113`; selected family totals are `real_estate_or_property = 39`, `internal_operations = 39`, `customer_experience = 12`, `technology_system = 34`, `finance_or_funding = 10`, and `fare_program = 43`.
- Verification: focused ontology tests pass (`230` tests, `2600` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T13-33-13-279Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.

## Latest Slice - Project Family Tail Alias Cleanup

- Re-baselined residual `project_family: other` at `113`; many remaining records were exact type aliases or payload variants of already-established families rather than new taxonomy categories.
- Added deterministic project-family normalization for bounded residual aliases: E-ZPass implementation to `fare_program`; rail-cleaning, hoist/turntable maintenance, signaling maintenance, Grand Central Madison operations/maintenance, physical geometry/structural/fueling/zero-emission-bus labels to `capital_or_infrastructure`; transportation-planning retainer aliases to `planning_or_report`; lease/license/property aliases to `real_estate_or_property`; Open Trip Planner, zCloud/data-center, contact-center, Transit Wireless, traffic-control, and training-equipment records to `technology_system`; market-research/public-awareness/outreach aliases to `customer_experience`; benefit/administrative/workforce/training aliases to `internal_operations`; and refinancing/bond-refunding records to `finance_or_funding`.
- Guardrail: older explicit negative cases remain guarded as `other`, including as-needed emergency/scheduled bus services, paratransit service continuations, toll-violation regulatory changes, generic yard/yard-track concepts, climate/resilience strategy labels without concrete flood-mitigation capital-work evidence, public-works contract administration, and generic contract extensions.
- Post-materialize counts: `project_family: other` is `60`; selected family totals are `capital_or_infrastructure = 820`, `real_estate_or_property = 48`, `internal_operations = 50`, `customer_experience = 16`, `technology_system = 43`, `finance_or_funding = 12`, `fare_program = 44`, and `planning_or_report = 45`.
- Verification: focused ontology tests pass (`231` tests, `2639` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T18-42-00-300Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Parallel read-only subagent follow-up: Volta found a safe `document_time_status: other` path from `52 -> 42`; Meitner found exact event-family slices that can likely move `event_family: other` from `1239 -> 1219`.

## Latest Slice - Document-Time Status Payload-Gated Cleanup

- Re-baselined residual `document_time_status: other` at `52`; Volta's read-only audit identified ten records whose exact status literals were safe only with payload proof.
- Added `normalizeProjectStatusFromPayload()` to map exact residual statuses with bounded context: contract/procurement `approval`, `ratification`, `Ratification`, and `amendment` records map to `approved`; weekend track-outage / signal-testing / concrete-tie date labels and zero-emission bus/depot-charging proceeding text map to `planned`; and West 255th Street infrastructure-reconstruction `launching` maps to `under_construction`.
- Guardrail: bare `approval`, `ratification`, generic `launching`, generic weekend dates, completion-percentage bundles, construction-pushed/date labels, broad reviewed/announced/presented/recommended labels, and SBS/service launch records remain `other`.
- Post-materialize counts: `document_time_status: other` is `42`; `project_family: other` remains `60`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`; `event_family: other` remains `1239`.
- Verification: focused ontology tests pass (`232` tests, `2655` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T18-52-36-552Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Next audited fast lane: Meitner's exact event-family slice can likely move `event_family: other` from `1239 -> 1219`.

## Latest Slice - Exact Event-Tail Family Cleanup

- Re-baselined residual `event_family: other` at `1239`; Meitner's read-only audit identified exact filing/submission/execution/establishment/activation/drill tails with bounded family semantics.
- Added exact event-kind normalization: `filing`, `regulatory_filing`, `regulatory_submission`, `submission`, `lease_execution`, `permit_execution`, and `program_establishment` map to `milestone`; `program_activation` and `drill_exercise` map to `implementation`.
- Guardrail: broad or mixed buckets remain `other`, including committee agenda/information/document-date/public-event/incident/delivery/deployment/fare-change/proposed-fare/proposed-rate/contract-extension/upcoming-issuance/lunch-and-learn labels.
- Post-materialize counts: `event_family: other` is `1216`; `document_time_status: other` remains `42`; `project_family: other` remains `60`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`.
- Verification: focused ontology tests pass (`233` tests, `2676` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T19-04-34-197Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Next fastest lane: continue event-family residual reduction from `1216`, but require endpoint/payload-gated rules for the large agenda/information/public-event tails rather than broad exact aliases.

## Latest Slice - Payload-Gated Event Tail Cleanup

- Re-baselined residual `event_family: other` at `1216`; Godel's read-only audit identified narrow action/contract/trackwork/deployment/safety/delivery predicates that did not require broad exact aliases.
- Added payload-gated event normalization for: space-spelled `contract extension` rows with concrete extension period/date evidence; `contract_period` rows with term/year/option evidence; `track work program update` rows with trackwork/construction/switch-installation text; budget reviews with operating-budget/result presentation proof; board actions with authorization/acquisition proof; fleetwide/begin deployment events; safety incidents that caused stop-work/work-resume pauses; and delivery rows that describe installation beginning.
- Guardrail: generic evaluations, generic track-work updates, recommendation-only budget/board actions, generic contract-extension text, future-only deployment, generic safety incidents, and expected deliveries remain `other`.
- Post-materialize counts: `event_family: other` is `1190`; `document_time_status: other` remains `42`; `project_family: other` remains `60`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`.
- Verification: focused ontology tests pass (`234` tests, `2695` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T19-25-53-230Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Next queued lanes: Noether found up to `104` agenda/info publication candidates, but they need a policy decision that committee presentations/reports should be treated as `publication`; Hypatia found about `26` public-engagement/publication/social-event candidates with narrower payload predicates.

## Latest Slice - Public/Social Event Tail Cleanup

- Re-baselined residual `event_family: other` at `1190`; Hypatia's read-only audit identified narrow public-engagement, publication, planning, and milestone predicates for public/social event tails.
- Added exact outreach-label normalization for `public_discussion`, `public_feedback`, `public_workshop_series`, `residents_briefing`, `stakeholder_briefing`, and `community_board_update`.
- Added payload-gated normalization for SBS briefings, M15 SBS tours, customer touchpoints, future workshops, public review/notice/advertisement records, Vision Zero announcements, Transit Improvement Summit announcements, accessibility settlement and project-restart announcements, ERG African American Day Parade community events, and unveiling ceremonies.
- Guardrail: generic public events, workshops, briefings, tours, ceremonies, open houses, job/career events, depot/yard/facility tours, CBDTP phase-in and PANYNJ recommendation announcements, State of the City bus-speed goals, charity/cleanup community events, generic public notices, and generic customer events remain `other`.
- Post-materialize counts: `event_family: other` is `1165`; `document_time_status: other` remains `42`; `project_family: other` remains `60`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`.
- Verification: focused ontology tests pass (`235` tests, `2724` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T19-36-11-063Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Next queued lane: Noether's agenda/info publication policy slice remains the largest audited opportunity, with up to `104` candidate records if committee financial-plan/budget/operations presentations and reports are accepted as `publication` event-family records.

## Latest Slice - Agenda/Info Publication And Closeout Cleanup

- Re-baselined residual `event_family: other` at `1165`; Noether's read-only audit identified agenda/info records whose payloads prove publication, approval, planning, or implementation semantics without broad agenda matching.
- Added deterministic payload gates for committee financial-plan presentations, final operating-budget/result reviews, operations year-in-review records, recurring committee reports, Positive Train Control implementation closeout briefings, formal committee work-plan approvals, formal committee-charter adoptions, and upcoming schedule-change advisories.
- Guardrail: recommendation-only Board-action agenda lists, placeholder/no-items agenda records, generic briefings, generic work-plan listings, and charter review/assessment records remain `other`.
- Post-materialize counts: `event_family: other` is `1086`; `document_time_status: other` remains `42`; `project_family: other` remains `60`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`.
- Verification: focused ontology tests pass (`235` tests, `2726` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T19-50-15-809Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Next queued lanes: Sartre found a public/community/employee event-kind lane estimated up to `146` residual records with exact-kind and payload guardrails; Mendel found a `16` to `27` record `project_family: other` lane for infrastructure/service/fare/curb records.

## Latest Slice - Public/Community/Employee Event-Family Cleanup

- Re-baselined residual `event_family: other` at `1086`; Nash's read-only audit identified a payload-proven public-engagement lane across ERG, employee, community, customer, safety, recruitment, charity, and public-outreach records.
- Added deterministic payload-gated normalization for ERG/employee programs, workshops, lunch-and-learns, trainings, observances, networking events, charity drives/walks, Pride events, customer safety events, recruitment/open-house records, community advisory/kickoff records, and customer/open-street outreach records.
- Added a narrow milestone mapping for Garrett Goble memorial records.
- Guardrail: commercial GCT/Vanderbilt Hall event programming from `meeting_doc_170996` remains `other` (`40` residual rows), and bare `public event`, `community event`, `employee_event`, job/conference labels, generic ceremonies, private events, and emergency-response training remain `other` unless payload proof matches the bounded predicates.
- Post-materialize counts: `event_family: other` is `977`; `document_time_status: other` remains `42`; `project_family: other` remains `60`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`.
- Verification: focused ontology tests pass (`235` tests, `2755` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T20-14-21-763Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Next queued lanes: contract/license/grant/service event endpoints, disruption/weather/incident pause events, the `project_family: other` infrastructure/service/fare tail, and the remaining committee-agenda residuals.

## Latest Slice - Endpoint And Disruption Event-Family Cleanup

- Re-baselined residual `event_family: other` at `977`; Carver's read-only endpoint audit and Pauli's read-only disruption audit produced two bounded deterministic lanes.
- Added payload-gated endpoint normalization for dated contract option/term/renewal records, agreement effective/expiration/extension records, contract extension endpoints, grant periods, dated license extension/expiration/term records, permit terms, and service periods. These map to `milestone` only with domain and date/range proof.
- Added payload-gated disruption normalization for explicit strikes, station/tunnel closures, service-impact signal upgrades, removed-from-service incidents, maintenance outages, weather/flood service suspensions, work resumption, temporary bus-lane installations during shutdown shuttles, and project-restart announcements.
- Guardrail: undated license terms, document/staff-summary dates, generic procurement/proposal records, recommendation-only action items, venue/permitted public events, GCT power outages with no train interruption, administrative contract closures, generic incident/safety stories, pilot/fare endpoints, and emergency-response training remain `other` unless covered by pre-existing narrower rules.
- Post-materialize counts: `event_family: other` is `934`; `document_time_status: other` remains `42`; `project_family: other` remains `60`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`.
- Verification: focused ontology tests pass (`237` tests, `2801` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-29T20-35-57-392Z_identity-review` reports `0` review records / `0` candidate edges / `0` clusters / `0` issues, and `validate` reports `Issues: 0`.
- Next queued lanes: `project_family: other` infrastructure/service/fare tail, remaining committee-agenda residuals, and narrower residual `incident`/`fare`/`document_date` event buckets.

## Latest Slice - Project-Family Residual Tail Cleanup

- Re-baselined residual `project_family: other` at `60`; read-only Codex audit lanes were Russell for infrastructure/asset labels, Bacon for service/fare/curb/program/governance labels, and Heisenberg for procurement/contract/support labels.
- Implemented deterministic payload-gated project-family rules for high-confidence residuals: station/yard/renovation assets, service-frequency increases, parking/fare/toll records, E-ZPass implementation, track-trespassing task-force safety records, MOW and drug/alcohol internal-operations records, 42nd Street accessibility project-management support, bus-parts and HASTUS procurements, Breakneck station/bridge trail work, climate/resilience infrastructure and roadmap records, IT-rack station installations, SCOUT mental-health co-response, toll-collection consultant support, and worldwide inspection/testing support.
- Guardrail: curbside/curb-regulation records, Access-A-Ride continuation contracts, emergency/scheduled bus-service contracts, sparse maintenance/rehabilitation labels, sparse trails, heritage locomotive wraps, median-barrier service extensions, mixed procurement packages, OCIP insurance procurement, and generic shuttles remain `other`.
- Post-materialize counts: `project_family: other` is `33`; `event_family: other` remains `934`; `document_time_status: other` remains `42`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`.
- Verification: focused ontology tests pass (`237` tests, `2820` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, and `validate` reports `Issues: 0`.
- Next queued lanes: classify the remaining `33` project-family residuals only where payload proof is strong; otherwise move to `document_time_status: other` (`42`) or exact/payload event-family residuals (`934`) with guardrails.

## Latest Slice - Document-Time Status Residual Cleanup

- Re-baselined residual `document_time_status: other` at `42`; read-only Codex audit lanes were Aquinas for infrastructure/construction/service/fleet status literals and Dalton for policy/report/procurement/real-estate/admin status literals.
- Implemented deterministic payload-gated status rules for anticipated ADA station completion, partial structural-flag completion percentages, hybrid/electric bus completion goals, route-proven SBS launches, student MetroCard launch-window records, annual agency safety-plan updates, DEI Year 1 progress reports, CBTC delay records, real-estate conditional designations, ADA acceleration, station-refresh/signal-modernization beginning records, East River Tunnel construction delay, electric-bus and Albany-service announcements, route/procurement recommendations, executed station parking permits, reviewed policy-code records with adoption/revision proof, bus-lane commitments, rolling-stock purchase action labels, and new SGR/admin-element records.
- Guardrail: bare `launching`, `recommended`, `new`, `reviewed`, `presented`, `reported`, `discussed`, checklist labels, financial-stability section labels, and operating-efficiency `identified` records remain `other` without stronger payload proof.
- Post-materialize counts: `document_time_status: other` is `9`; `project_family: other` remains `33`; `event_family: other` remains `934`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`.
- Verification: focused ontology tests pass (`237` tests, `2839` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, and `validate` reports `Issues: 0`.
- Next queued lanes: remaining `9` document-status records, `33` project-family residuals, and exact/payload event-family residuals (`934`) with guardrails.

## Latest Slice - Governance And Service-Increase Event-Family Cleanup

- Re-baselined residual `event_family: other` at `934`; read-only Codex audit lanes were Schrodinger for board/committee/agenda/information procedural records and Archimedes for service/operations residuals.
- Implemented an exact `governance` event-family whitelist for board/committee agenda, information, review, action, update, briefing, recurring-agenda, scheduled-agenda, budget-review, and adjournment labels.
- Preserved precedence for stronger payload-specific public-comment, publication, approval, and planning rules before the `governance` fallback.
- Added exact `service_increase` mapping to `implementation`.
- Guardrail: broad `board`, `committee`, `information`, community-board public-engagement labels, committee meetings, transaction false positives, request-for-information, rating-action, environmental-review, broad delivery/deployment/closeout, service-announcement, and service-activation records remain outside the new rules.
- Post-materialize counts: `event_family: other` is `721`; `event_family: governance` is `212`; exact governance labels remaining `other` are `0`; `service_increase` records remaining `other` are `0`; `document_time_status: other` remains `9`; `project_family: other` remains `33`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`.
- Verification: focused ontology tests pass (`238` tests, `2859` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, and `validate` reports `Issues: 0`.
- Next queued lanes: residual public/commercial event labels (`public event`, `ceremony`, `private event`, `tour`), document/date labels, incident/pause tails, and the remaining `33` project-family and `9` document-status records.

## Latest Slice - Document Metadata, Incident, Cafecito, And Postponement Event-Family Cleanup

- Re-baselined residual `event_family: other` at `721`; read-only Codex audit lanes were Dewey for public/commercial/social labels and Dirac for document/date/incident/pause-shaped labels.
- Implemented exact document-metadata fallbacks for `document_date`, `document date`, `staff_summary_date`, and `data_as_of_date`, and exact incident fallbacks for non-disruptive `incident`, `accident`, `derailment`, and `safety_incident` labels.
- Added a strict Cafecito chat public-engagement rule only when `chat`/`chat_event`/`virtual_chat` payload text contains `cafecito_chat`.
- Added a payload-gated `postponement` pause rule for implementation/service deferrals; governance/minutes/work-plan postponements with quorum or approval-list context remain `other`.
- Guardrail: broad `public event`, `private event`, `event`, `special_event`, `commercial_event`, `holiday_market`, `tour`, `conference`, `ceremony`, broad `deadline`, generic closure/outage, and generic incident/safety-story records remain outside the new rules.
- Post-materialize counts: `event_family: other` is `674`; `event_family: incident` is `21`; `event_family: document_metadata` is `21`; Cafecito chat records carrying `public_engagement` are `4`; Cafecito chat records remaining `other` are `0`; `postponement` records split into `2` pause and `2` other; `document_time_status: other` remains `9`; `project_family: other` remains `33`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`.
- Verification: focused ontology tests pass (`238` tests, `2867` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, and `validate` reports `Issues: 0`.
- Next queued lanes: residual `event_family: other` labels (`deadline`, `fare increase`, `delivery`, `deployment`, `closeout`, `infrastructure_project`, `capital project`, `performance review`), plus the remaining `33` project-family and `9` document-status records.

## Latest Slice - Performance-Review Publication And ESA Project-Family Cleanup

- Re-baselined residual buckets at `event_family: other = 674`, `project_family: other = 33`, and `document_time_status: other = 9`.
- Read-only Codex audit lanes were Turing for the 9-record document-status tail and Anscombe for the 33-record project-family tail.
- Turing found no safe payload-only document-status reduction: bare `presented`, `discussed`, `reported`, `identified`, checklist-heading, and category-list statuses remain `other`; `reviewed` policy-directive records need stronger source-surface evidence before mapping.
- Implemented a strict `performance_review` event-family publication predicate only when payload text proves a prior-year railroad-service performance review or budget-results review provided/presented to a committee.
- Implemented a one-record ESA Systems Facilities `contract_modification` project-family predicate requiring `ESA Systems Facilities`/`CS179.415`, Grand Central Terminal, design drawings, and device-relocation/access-restraint evidence.
- Guardrail: generic performance reviews, broad contract modifications, Grand Central contract modifications without ESA design/device/access evidence, emergency/scheduled bus-service contracts, paratransit service continuations, curbside changes, maintenance/rehabilitation/trail/sustainability/remediation/locomotive records, and the 9 document-status tail remain outside the new rules.
- Post-materialize counts: `event_family: other` is `669`; `project_family: other` is `32`; `document_time_status: other` is `9`; `performance_review` records carrying `publication` are `5`; `performance_review` records remaining `other` are `2`; `project_esa-systems-facilities-contract-mod` carries `capital_or_infrastructure`; `treatment_family: other` remains `0`; `relation_family: other` remains `0`.
- Verification: focused ontology tests pass (`238` tests, `2873` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, and `validate` reports `Issues: 0`.
- Next queued lanes: residual `event_family: other` labels (`fare increase`, `fare_increase`, `proposed_fare_toll_increase`, `deadline`, `delivery`, `deployment`, `closeout`, `infrastructure_project`, `capital project`) with payload proof and guardrails; keep project/status tails guarded unless stronger source-backed payload evidence is available.

## Latest Slice - Deadline And Bx6 Capital-Schedule Event Cleanup

- Re-baselined residual `event_family: other` at `669`; read-only Codex audit lanes were Gauss for fare/deadline tails and Curie for delivery/deployment/closeout/infrastructure/capital-project tails.
- Implemented payload-gated deadline milestone rules for RFQ response deadlines, RFP closing deadlines, deployment deadlines, go-live target dates, automated Revenue Recovery target dates, option-exercise deadlines, and FRA/CCTV compliance deadlines.
- Implemented narrow generic-`deadline` rules: JusticeONE deployment deadline and Open Data Challenge submissions due map to `milestone`; Penn Station Access written-comment deadline maps to `public_engagement`.
- Implemented Bx6 SBS capital-improvement schedule/timeline rules: construction-start schedule records map to `construction`, final-design/procurement schedule records map to `planning`, and non-upcoming bus-priority capital-project records map to `implementation`.
- Implemented awarded contract-modification milestones for Hayden Modification 1 records.
- Guardrail: fare/proposed fare/toll increase records remain `other`; Park Avenue final-plan conditional trigger, expected delivery records, broad deployment/announcement/project-update/payment records, generic infrastructure-project names, upcoming water-main capital project, EV-charging modification requests, and Runwise procurement outreach remain `other`.
- Post-materialize counts: `event_family: other` is `651`; deadline subtype milestones are `7`; generic deadline records split into `2` milestone, `1` public_engagement, and `1` other; project schedules split into `1` construction and `2` planning; capital-project records split into `3` implementation and `1` other; contract modifications split into `2` milestone and `3` other; `fare_increase` records remaining `other` are `8`; `proposed_fare_toll_increase` records remaining `other` are `3`; `project_family: other` remains `32`; `document_time_status: other` remains `9`.
- Verification: focused ontology tests pass (`238` tests, `2896` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, and `validate` reports `Issues: 0`.
- Next queued lanes: residual public/commercial/social event labels (`public event`, `ceremony`, `private event`, `tour`, `Event`) and guarded delivery/deployment/announcement/project-update/payment tails.

## Latest Slice - Governance, Finance, And Social-Tail Event Cleanup

- Re-baselined residual `event_family: other` at `651`; read-only Codex audit lanes were Boyle for public/private/social labels and Faraday for small admin/finance/project-update tails.
- Implemented exact governance mappings for `board_briefing`, `budget_action`, and `policy_revision`.
- Implemented payload-gated milestones for debt `upcoming_issuance`, Penn Station Access `access_license`, Runwise `change_order`, MRT-2 escalator `payment`, pre-proposal `conference`, and R211T deployments whose payload proves cars hit the tracks.
- Implemented bounded planning/governance/implementation/public-engagement predicates for CBDTP/LGA planning announcements, holiday/summer service-plan updates, committee project updates, concrete ACE/SCOUT expansions, C3RS/FMLM symposiums, named transit/safety/rivertowns summits, Earth Day/transit employee celebrations, and MTAPD medal/promotional ceremonies.
- Guardrail: broad `public event`, `private event`, generic `event`, `tour`, `special_event`, generic `briefing`, generic `delivery`, generic `procurement`, conditional customer expansion, bare bus-speed announcements, and unproven East Side Access update titles remain `other`.
- Post-materialize counts: `event_family: other` is `610`; `project_family: other` remains `32`; `document_time_status: other` remains `9`; residual targeted labels include `public_event: 29`, `event: 11`, `private_event: 8`, `ceremony: 8`, `delivery: 5`, `tour: 5`, `procurement: 3`, `closeout: 3`, `deployment: 2`, `announcement: 1`, `project_update: 1`, and `expansion: 1`.
- Verification: focused ontology tests pass (`238` tests, `2920` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, and `validate` reports `Issues: 0`.
- Next queued lanes: remaining mixed public/commercial event bucket, guarded `delivery`/`procurement`/`closeout` tails, and the `32` project-family / `9` document-status residuals.

## Latest Slice - Residual Other Bucket Zero-Out

- Re-baselined residual buckets at `event_family: other = 610`, `project_family: other = 32`, and `document_time_status: other = 9`; the broader canonical scan already had `relation_family: other = 0` and `treatment_family: other = 0`.
- Read-only Codex audit lanes were Avicenna (`019f1586-c6b4-71e2-8cbc-c74b18e5d89a`) for event tails and Linnaeus (`019f1586-cc81-7ff3-9580-78fd00c7c022`) for project-family tails.
- Implemented bounded payload-gated event rules for agreement/license expirations, RFP/proposal issuance and dated proposal receipts, NTSB closeout requests, vehicle delivery periods/endpoints, Bx6 SBS capital procurement planning, and dated capital closeouts.
- Implemented bounded project-family support rules for homeless-security outreach professional services (`accessibility_or_safety`), OCIP insurance procurement (`finance_or_funding`), and graffiti-removal maintenance programs (`internal_operations`).
- Guardrail: generic delivery/procurement/expiration/issuance records, future procurement, expected/remaining deliveries, forecast closeouts, generic NTSB discussion, generic support contracts, and generic maintenance/insurance/professional-services records remain unmapped unless payload proof is present.
- Post-materialize counts: `event_family: other = 0`; `project_family: other = 0`; `document_time_status: other = 0`; no literal `other` or `other_unknown` values remain in `data/canonical/*.jsonl`; canonical records are `84048`; wiki pages are `7339`.
- Verification: focused ontology tests pass (`238` tests, `2939` expect calls), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, and `validate` reports `Issues: 0`.
- Next queued lanes: identity/duplicate pressure and route aggregate/split policy, not `other` paydown; any genuinely commercial/social event taxonomy should be handled as an owner-approved taxonomy expansion rather than forced into existing lifecycle families.

## Latest Slice - Route Scope Persistence And S Shuttle Advisory Guard

- Re-baselined deterministic identity-review pressure at `0` review records, `0` candidate edges, `0` clusters, `0` validation issues, `0` duplicate identity issues, and `0` endpoint-shape issues; `validate` was clean.
- Read-only Codex audit lanes were Erdos (`019f1599-5f1b-7ad3-9409-b0eb20054e0c`) for `S` shuttle identity pressure and James (`019f1599-813d-70d3-a588-058abfe9b381`) for route aggregate/split scope policy.
- Erdos confirmed no production `S` shuttle identity fix was needed: 42 St Shuttle and Rockaway Park Shuttle already carry distinct aliases (`route_s-42-st-shuttle` and `route_s-rockaway-park-shuttle`) and produce no deterministic identity-review pressure.
- Added a test-only identity-review regression asserting 42 St Shuttle and Rockaway Park Shuttle do not emit an advisory candidate edge.
- James confirmed route scope was computed but not persisted. Materialization now persists runner-owned `payload.route_record_scope` for route records, and the route kind registry marks `route_record_scope` as a runner-owned companion.
- Post-materialize route scope counts are directly available from `data/canonical/routes.jsonl`: `true_route = 290`, `split_candidate = 20`, `aggregate_list_context = 10`, `data_only_scope = 1`, `missing = 0`; the only `data_only_scope` route remains `route_15-express-bus-battery-pl`.
- Verification: `bun test packages/pipeline/test/materialize/materialize.test.ts` passes (`32` tests, `755` expects); `bun test packages/agents/test/identity-review.test.ts` passes (`20` tests, `32` expects); `bun test packages/db/test/identity.test.ts packages/pipeline/test/records/payload-schemas.test.ts` passes (`31` tests, `137` expects); `bun run typecheck` passes; deterministic materialization completed with SQLite FTS `quick_check: ok`; deterministic `identity-review` reports all zero review/candidate/cluster/issue counts; `validate` reports `Issues: 0`.
- Next queued lanes: with `other` and identity-review pressure at zero, continue with route split-candidate review or adjacent high-denorm records only where a deterministic rule changes canonical behavior without disturbing page policy.

## Latest Slice - Route Split-Candidate Reason And Local-Limited Compatibility Cleanup

- Re-baselined route scope at `true_route = 290`, `split_candidate = 20`, `aggregate_list_context = 10`, and `data_only_scope = 1`; all `321` route records had `route_record_scope`, but `route_record_scope_reason` was not yet persisted.
- Read-only Codex audit lanes were Lagrange (`019f15a4-4b02-7802-a619-46d9d23ee603`) for the 20 split candidates and Planck (`019f15a4-6c93-7a40-ada8-cae17e0319d1`) for high-denorm true-route SBS records.
- Added runner-owned `payload.route_record_scope_reason` and focused tests so each persisted route scope records the deterministic classifier branch.
- Updated route-scope variant parsing so `local_limited`, `local_and_limited`, `limited_and_local`, and `local_and_limited_stop` are a distinct compatible bundle bucket rather than pure `limited_stop`.
- Reclassified four safe local/local-limited bundle artifacts from `split_candidate` to `true_route`: `route_b15-ace`, `route_b38`, `route_b6-2015-sbk-corridor`, and `route_bx36`. They now carry `route_record_scope_reason: local_limited_bundle_compatible`.
- Preserved true split pressure for Q52/Q53 SBS, B46 SBS, M34A, and other pure local-vs-limited/SBS conflicts; high-denorm true-route SBS records such as `route_bx12-plus`, `route_webster-ave-sbs`, `route_b44-sbs`, `route_m15-sbs`, `route_b82-sbs`, `route_m86-sbs`, and `route_able-s79-sbs` remain healthy `true_route` accumulations.
- Post-materialize route scope counts: `true_route = 294`, `split_candidate = 16`, `aggregate_list_context = 10`, `data_only_scope = 1`, missing scope/reason = `0`. Route-scope reason counts: `default_true_route = 288`, `local_limited_bundle_compatible = 5`, `m14_ad_exception = 1`, `merged_service_variant_conflict = 14`, `merged_slash_route_surface = 2`, `routes_array_aggregate = 4`, `slash_route_surface = 6`, and `count_only_route_scope_text = 1`.
- Verification: `bun test packages/pipeline/test/materialize/materialize.test.ts` passes (`34` tests, `761` expects); `bun test packages/pipeline/test/records/payload-schemas.test.ts packages/agents/test/identity-review.test.ts` passes (`39` tests, `125` expects); `bun run typecheck` passes; deterministic materialization completed with SQLite FTS `quick_check: ok`; deterministic `identity-review` reports all zero review/candidate/cluster/issue counts; `validate` reports `Issues: 0`.
- Next queued lanes: remaining `16` split candidates by reason, especially `14` `merged_service_variant_conflict` records and `2` `merged_slash_route_surface` records; leave false-positive pure limited/context artifacts guarded unless a source-backed deterministic rule can distinguish them.

## Latest Slice - Route Policy Floor And Adjacent Bucket Cleanup

- Re-baselined route scope at `true_route = 303`, `split_candidate = 7`, `aggregate_list_context = 10`, and `data_only_scope = 1`; duplicate route alias keys were `0`, deterministic identity-review was all-zero, and `validate` was clean.
- Read-only Codex audit lane Cicero (`019f15de-8d4c-73e1-b267-378b12668659`) found only one safe remaining route false positive: `route_q34-queens`, where evidence names neighboring `Q25 LTD` and plain `Q34` but never `Q34 LTD`/`Q34 Limited`.
- Added `neighbor_ltd_classifier_spillover` route-scope compatibility before generic local/limited conflict handling. It requires top-level local evidence, merged variants limited to local/limited_stop, no current-route variant identity surface, evidence that another route token has `LTD`/`Limited`, and no evidence that the current route token has `LTD`/`Limited`.
- Reclassified only `route_q34-queens` to `true_route`; the remaining six split candidates are policy floor: `route_b103-ltd-proposed-draft`, `route_bx15-ltd-webster-2012`, `route_bx55-2012`, `route_q25-queens`, `route_q44-cb12-2011`, and `route_q52-sbs-queens`.
- Read-only adjacent audits found three safe normalization slices: Harvey (`019f15e2-4a32-7441-8bc9-06524e13bfc7`) identified seven completed Board-approval event records; Descartes (`019f15e5-ee40-7c00-92cb-d7e34899274e`) identified eleven signal/CBTC infrastructure project-family records; Gibbs (`019f15e7-1d5a-7462-bcbc-50fcd046c574`) identified three committee work-plan document-time-status records.
- Implemented payload-gated Board-approval event mapping for option exercises, procurement modifications, rate-schedule modifications, and real-estate acquisition/lease/license records. Recommendation-only, pending, proposed, submitted-to-Board, and postponed-approval text remains guarded.
- Implemented rail signal/CBTC project-family normalization to `capital_or_infrastructure`, with explicit bus/TSP/traffic-signal and software-support guards.
- Implemented exact committee/work-plan document-time status normalization to `planned` only when work-plan type is paired with descriptive work-plan text outside the `project_type` field.
- Post-materialize counts: routes `true_route = 304`, `split_candidate = 6`, `aggregate_list_context = 10`, `data_only_scope = 1`; `event_family: other = 588`; `project_family: other = 28`, missing project family = `176`; `document_time_status: other = 9`, missing document-time status = `239`.
- Verification: focused combined tests pass (`312` tests, `3829` expects), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-30T00-38-06-097Z_identity-review` reports all-zero review/candidate/cluster/issue counts, and `validate` reports `Issues: 0`.
- Next queued lanes: residual `event_family: other = 588`, project-family `28 other / 176 missing`, document-time status `9 other / 239 missing`, and non-route duplicate alias keys. Keep the six route split candidates as policy floor unless a new deterministic source-backed rule can distinguish them.

## Latest Slice - Aggressive Codex Fan-Out Adjacent Cleanup

- Re-baselined measurable buckets at `event_family: other = 588`, unresolved project family `204` (`176` missing + `28` other), unresolved document-time status `248`, relation-family other `0`, treatment-family other `0`, deterministic identity-review all-zero, and `validate` clean.
- Read-only Codex audit lanes were Laplace (`019f15fc-e26b-7f73-9e97-e958bbd83e5d`) for public/social event tails, Bernoulli (`019f15fc-e55b-7992-a525-c1080cbe407b`) for fare/service/admin event tails, Plato (`019f15fc-e895-7fe2-a65e-e30f12e4a9bc`) for missing project-family/status tails, and Socrates (`019f15fc-ec38-7033-bfdb-76f90e37efa8`) for non-route duplicate identity pressure.
- Implemented exact event-kind mappings for `design_finalization`, `environmental_review_start`, `planned_rfq`, `project_transfer`, `bus_deployment`, and `naming_announcement`; added a payload-proven full-PTC `operational_status` implementation rule.
- Implemented narrow payload rules for Veterans Day ceremonies (`public_engagement`) and implemented fare/toll/rate changes (`fare_change`, `tolling_change`, `tax_rate_change`) while preserving proposed/forecast/planned fare and toll guards.
- Implemented missing-type ADA/accessibility station/rail project-family mapping to `accessibility_or_safety`, guarded against generic web/accessibility compliance and Access-A-Ride/paratransit without station context.
- Guardrail: broad public/commercial event labels, generic delivery/deployment/service activation, generic operational status, generic ceremonies, proposed fare/toll/rate changes, and generic ADA/accessibility text remain unresolved unless payload proof is present.
- Post-materialize counts: `event_family: other = 564` (down `24`); unresolved project family `191` (`163` missing + `28` other, down `13`); unresolved document-time status stayed `248`; strict project family/status both-unresolved moved from `28` to `25`.
- Socrates confirmed latest deterministic identity-review remains all-zero and duplicate-related work should move to alias hygiene rather than active duplicate clusters: bare corridor aliases with distinct limits and generic CAC/committee labels are the next likely deterministic lanes.
- Verification: focused ontology tests pass (`238` tests, `2983` expects), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-30T00-56-15-209Z_identity-review` reports all-zero review/candidate/cluster/issue counts, and `validate` reports `Issues: 0`.
- Next queued lanes: continue `event_family: other = 564`, project-family unresolved `191`, document-time-status unresolved `248`, and alias hygiene. Keep using wide read-only Codex fan-out for discovery, with the main thread integrating overlapping normalizer/code changes.

## Latest Slice - Missing-Type Bus And Structural Bridge Cleanup

- Re-baselined measurable buckets at `event_family: other = 564`, unresolved project family `191` (`163` missing + `28` other), unresolved document-time status `248`, deterministic identity-review all-zero, and `validate` clean.
- Read-only Codex audit lanes were Locke (`019f160a-57f0-7520-826c-4bda7e2cd89f`) for transport/service/infrastructure event tails, Kepler (`019f160a-5db2-7bc3-a64f-63add909eb87`) for evaluation/review/planning event tails, Leibniz (`019f160a-62ea-7cd0-91fa-c42589abcae2`) for public/commercial/social event tails, and Pasteur (`019f160a-663f-7312-ae51-b3620ea2f3bb`) for project-family unresolved tails.
- Implemented missing-type bus-priority/bus-lane project-family rules for explicit bus-lane, bus-priority, SBS, or BRT surfaces with bus/route/rider context. Traffic Signal Priority and generic bus depot text remain guarded.
- Implemented payload-gated event rules for RFQ-issued milestones, SBS/busway evaluation planning, and named-official yard/facility tours.
- Implemented missing-type structural bridge/viaduct project-family mapping to `capital_or_infrastructure`, with exclusions for ADA/accessibility, bike/pedestrian/micromobility, safety-fence, monitoring/detection, tolling/cashless/fare, elevator/escalator, and fender contexts.
- Guardrail: broad delivery/deployment/service activation, generic infrastructure-project labels, generic evaluation/review/update, broad public/commercial venue events, generic elected-official tours without named offices, and bridge-adjacent access/safety/tolling records remain unresolved unless payload proof is present.
- Post-materialize counts: `event_family: other = 554` (down `10`); unresolved project family `171` (`143` missing + `28` other, down `20`); unresolved document-time status stayed `248`.
- Verification: focused ontology tests pass (`238` tests, `3001` expects), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-30T01-13-57-362Z_identity-review` reports all-zero review/candidate/cluster/issue counts, and `validate` reports `Issues: 0`.
- Next queued lanes: residual `event_family: other = 554`, project-family unresolved `171`, document-time-status unresolved `248`, and alias hygiene. The public/commercial/social event bucket remains largely taxonomy-policy residue and should not be forced into public engagement.

## Latest Slice - Fixed Guideway, FMTAC, Status, And Corridor Alias Cleanup

- Re-baselined measurable buckets at `event_family: other = 554`, unresolved project family `171` (`143` missing + `28` other), unresolved document-time status `248`, corridor alias collisions `11` aliases / `28` records, deterministic identity-review all-zero, and `validate` clean.
- Read-only Codex audit lanes were Feynman (`019f161a-af1e-7bd2-9e2c-fdbcc63cd007`) for document-time status, Arendt (`019f161a-b45a-7081-a3e2-a059d9edc5f5`) for fixed-guideway project-family gaps, Hegel (`019f161a-b7aa-74f1-afbc-1e8e09409ec0`) for plan-amendment event tails, and Banach (`019f161a-baf8-74c1-bda0-1eb84e685eca`) for non-route alias hygiene.
- Implemented missing-type fixed-guideway/traction-power project-family normalization, completed procurement/contract no-status approval mapping, approved/effective FMTAC coverage plan-amendment event mapping, and scoped-corridor bare-alias pruning with primary-record protection.
- Post-materialize counts: `event_family: other = 552`, unresolved project family `146` (`118` missing + `28` other), unresolved document-time status `243`, and corridor alias collisions `0`.
- Operational note: the first materialize attempt hit a full `/mnt/models` filesystem. Removed incomplete generated `data/canonical.db.building` and moved untracked `data/chandra-ocr/vast-h100` to `/tmp/mta-wiki-offload-20260630/vast-h100` before rerunning materialization.
- Verification: focused ontology, identity, and materializer tests pass; `bun run typecheck` passes; deterministic materialization completed with SQLite FTS `quick_check: ok`; deterministic `identity-review` run `2026-06-30T01-42-47-503Z_identity-review` reports all-zero review/candidate/cluster/issue counts; `validate` reports `Issues: 0`.

## Latest Slice - ERG, Fleet, Construction Status, And CAC Alias Cleanup

- Re-baselined after the corridor slice at `event_family: other = 552`, unresolved project family `146` (`118` missing + `28` other), unresolved document-time status `243`, entity alias collisions `15` aliases / `27` records, deterministic identity-review all-zero, and `validate` clean.
- Read-only Codex audit lanes were Nietzsche (`019f162b-3bb1-7313-a440-b3363d624068`) for social/ERG event tails, Boole (`019f162b-4099-7cf1-9799-31ebc6bc0ef6`) for missing-type vehicle/fleet projects, Pascal (`019f162b-446b-7180-973b-25c0662127f8`) for construction-start statuses, and Helmholtz (`019f162b-4a83-7a53-ae0a-10d7f362fe97`) for post-corridor alias collisions.
- Implemented payload-proven ERG/career social-engagement event mapping to `public_engagement`; missing-type vehicle/fleet project-family mapping to `capital_or_infrastructure`; no-status infrastructure construction-start mapping to `under_construction`; and generic Community Advisory Committee alias pruning when a more specific CAC key exists.
- Guardrail: generic workshops, discussions, career events, ERG labels without specific activity proof, ceremonial/heritage locomotive records, AAR pilots, laser trains, service-contract bus records, generic project starts, and generic CAC labels without a specific key remain unresolved.
- Post-materialize counts: `event_family: other = 543`; unresolved project family `139` (`111` missing + `28` other); unresolved document-time status `241` (`232` missing + `9` other); entity alias collisions `13` aliases / `23` records.
- Verification: `bun test packages/db/test/identity.test.ts` passes (`19` tests, `62` expects); `bun test packages/pipeline/test/ontology/normalizers.test.ts` passes (`238` tests, `3045` expects); `bun run typecheck` passes; deterministic materialization completed with SQLite FTS `quick_check: ok`; deterministic `identity-review` run `2026-06-30T01-50-50-549Z_identity-review` reports all-zero review/candidate/cluster/issue counts; `validate` reports `Issues: 0`.
- Next queued lanes: residual `event_family: other = 543`, project-family unresolved `139`, document-time-status unresolved `241`, entity alias collision aliases `13`, and project alias collision aliases `3`.

## Latest Slice - Aggressive Codex Reset-Window Adjacent Cleanup

- Re-baselined measurable buckets at `event_family: other = 543`, unresolved project family `139` (`111` missing + `28` other), unresolved document-time status `241` (`232` missing + `9` other), relation-family unresolved `0`, treatment-family unresolved `0`, deterministic identity-review all-zero, and `validate` clean.
- Used parallel read-only Codex scouts while the main thread implemented deterministic changes: Mill for activation/deployment event tails, Tesla for PTASP project-family tails, Zeno for timetable rail-work status, Chandrasekhar for fare-gate project-family tails, Ampere for checked-name statuses, Fermat for ABLE test-agreement events, Herschel/Parfit/Jason for alias hygiene, and Galileo/Hubble to confirm relation/treatment unresolved buckets are already zero.
- Implemented payload-proven service activation/deployment completions, ABLE vendor test-agreement milestones, PTASP/Agency Safety Plan project-family mapping, fare-gate strategy/RFI project-family mapping, timetable-supported rail-work active status, checked project-name implemented status, generic scoped-role alias pruning, GCM station/operator alias pruning, and an allowlisted broad-project-key prune table for already do-not-merge-suppressed project collisions.
- Guardrail: generic deployment/service activation, future/coming deployment, generic test agreements, ABLE RFI/lawsuit records, generic public-safety records, generic station access RFIs, non-timetable support text, broad checklist text, generic President/Chief Safety Officer roles without scoped aliases, and non-GCM acronym/facility aliases remain unmodified.
- Post-materialize counts: `event_family: other = 538`; unresolved project family `134` (`106` missing + `28` other); unresolved document-time status `234` (`227` missing + `7` other); relation-family unresolved `0`; treatment-family unresolved `0`; project/corridor/route alias collisions `0`; entity alias collisions `12` aliases / `25` memberships.
- Verification: focused ontology tests pass (`240` tests, `3077` expects), identity tests pass (`22` tests, `76` expects), materializer tests pass (`45` tests, `809` expects), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-30T02-20-31-343Z_identity-review` reports all-zero review/candidate/cluster/issue counts, and `validate` reports `Issues: 0`.
- Next queued lanes: residual `event_family: other = 538`, project-family unresolved `134`, document-time-status unresolved `234`, entity alias collision aliases `12`, and the six route split-candidate policy-floor records.

## Latest Slice - Reset-Window Codex Fanout Burst

- Re-baselined measurable buckets at `event_family: other = 538`, unresolved project family `134` (`106` missing + `28` other), unresolved document-time status `234` (`227` missing + `7` other), relation-family unresolved `0`, treatment-family unresolved `0`, entity alias collisions `12` keys / `25` memberships, route scopes `true_route: 304`, `split_candidate: 6`, `aggregate_list_context: 10`, and `data_only_scope: 1`.
- Used parallel read-only Codex scouts while the main thread implemented and verified deterministic slices: Darwin (`019f165f-f5a2-7253-9622-b3ab2adb1c99`) for residual events, Lovelace (`019f1660-12bd-7760-9061-049fa54ce8be`) for project/status tails, Hume (`019f1660-2b92-7700-97d9-6a1e916d02c3`) for entity alias collisions, and Popper (`019f1660-4658-7083-9dfe-8dbe4593822c`) for route scope/identity guardrails.
- Implemented event-family rules for `license_term` term-of-license records, dated operating/performance/year-end publication records, payload-proven governance policy amendments, and rail right-of-way rescue incidents.
- Implemented project-family/status rules for missing-type LED station lighting, fixed bike facilities, line-structure repairs, no-status exact pilot project types, and no-status purchase-contract award payloads.
- Implemented reviewed broad entity-key prunes for Michael Baker/IEC, NYSDOT commissioner role context, and NYCT Department of Subways/Department of Buses/MTA Bus Company aggregate scope.
- Implemented a route identity/scope guard that ignores display-only slash bundles when structured route fields prove one route; `route_m34-sbs` moved from `aggregate_list_context / slash_route_surface` to `split_candidate / merged_slash_route_surface` and no longer emits `route_m34-m34a`.
- Post-materialize counts: `event_family: other = 526`; unresolved project family `124` (`96` missing + `28` other); unresolved document-time status `225` (`218` missing + `7` other); relation-family unresolved `0`; treatment-family unresolved `0`; entity alias collisions `9` keys / `19` memberships; route scopes `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`.
- Verification: focused ontology tests pass (`240` tests, `3110` expects), identity tests pass (`24` tests, `89` expects), materializer tests pass (`47` tests, `818` expects), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-30T02-54-52-888Z_identity-review` reports all-zero review/candidate/cluster/issue counts, and `validate` reports `Issues: 0`.
- Next queued lanes: residual `event_family: other = 526`, project-family unresolved `124`, document-time-status unresolved `225`, entity alias collision keys `9`, and the remaining route split-candidate policy floor. No external/provider-backed LLM commands were used.

## Latest Slice - Reset-Window Codex Follow-Up Cleanup

- Re-baselined measurable buckets at `event_family: other = 526`, unresolved project family `124` (`96` missing + `28` other), unresolved document-time status `225` (`218` missing + `7` other), route scopes `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`, relation-family unresolved `0`, treatment-family unresolved `0`, deterministic identity-review all-zero, and `validate` clean.
- Used parallel read-only Codex scouts while the main thread implemented deterministic changes: Kierkegaard for residual event-family tails, Kuhn for project/status tails, Franklin for entity alias collisions, Carson for route split candidates, Confucius/Averroes for second-wave event tails, Singer for project policy-floor review, and Poincare for entity collision follow-up.
- Implemented event-family rules for lack-of-quorum postponed committee approvals (`governance`), named safety summits (`public_engagement`), busway education/outreach campaigns ahead of launch (`public_engagement`), and exact corridor/project identification events (`planning`).
- Implemented project/status rules for no-status planning/report study and assessment records (`study`) and Joint Track Safety Audit records (`accessibility_or_safety`).
- Implemented reviewed broad entity-key prunes for MTA Real Estate vs MTA Real Estate Department and MTA TOD program vs department aliases.
- Policy-floor findings: the remaining seven route `split_candidate` records are real split/aggregate residue; unsuppressed entity duplicate identity issues are `0`; residual `document_time_status: other` records are heterogeneous vague meeting-action statuses; and residual `project_family: other` records should not be force-mapped without stronger deterministic proof.
- Post-materialize counts: `event_family: other = 517` (down `9`); unresolved project family `122` (`94` missing + `28` other, down `2`); unresolved document-time status `221` (`214` missing + `7` other, down `4`); route scopes unchanged at `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`; relation-family unresolved `0`; treatment-family unresolved `0`.
- Verification: focused ontology tests pass (`240` tests, `3132` expects), identity tests pass (`24` tests, `103` expects), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-30T03-22-37-237Z_identity-review` reports all-zero review/candidate/cluster/issue counts, and `validate` reports `Issues: 0`.
- Next queued lanes: residual `event_family: other = 517` remains the biggest countable cleanup bucket; project-family/status residuals and route split candidates need either stronger deterministic evidence or owner-approved taxonomy/representation policy. No external/provider-backed LLM commands were used.

## Latest Slice - Reset-Window Codex Event-Tail Burst

- Re-baselined measurable buckets at `event_family: other = 517`, unresolved project family `122` (`94` missing + `28` other), unresolved document-time status `221` (`214` missing + `7` other), route scopes `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`, relation-family unresolved `0`, treatment-family unresolved `0`, deterministic identity-review all-zero, and `validate` clean.
- Used parallel read-only Codex scouts while the main thread implemented deterministic event-family rules: Newton for governance/admin event tails, Einstein for contract/procurement/easement tails, Beauvoir for public/commercial/social tails, and Raman for planning/input-phase tails.
- Implemented/materialized event-family rules for public input-phase records with feedback/stakeholder proof (`public_engagement`), dated revised Financial Plan presentations (`publication`), easement transaction records with transit/infrastructure context (`milestone`), and public blood drives with New York Blood Center/public-donor proof (`public_engagement`).
- Guardrail: generic financial-plan updates, generic easement agreements, formal-offer/discussion records, internal blood drives, broad public/commercial/venue events, and heterogeneous lawsuit/evaluation/initiative tails remain unresolved.
- Post-materialize counts: `event_family: other = 509` (down `8`); unresolved project family unchanged at `122` (`94` missing + `28` other); unresolved document-time status unchanged at `221` (`214` missing + `7` other); route scopes unchanged at `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`; relation-family unresolved `0`; treatment-family unresolved `0`.
- Verification: focused ontology tests pass (`240` tests, `3148` expects), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-30T03-38-08-434Z_identity-review` reports all-zero review/candidate/cluster/issue counts, and `validate` reports `Issues: 0`.
- Next queued lanes: residual `event_family: other = 509` is still the largest countable bucket; project-family/status residuals remain a secondary bucket; route split candidates are a representation/data-retargeting policy floor for now. No external/provider-backed LLM commands were used.

## Latest Slice - Reset-Window Codex Event/Project Burst

- Re-baselined measurable buckets at `event_family: other = 509`, unresolved project family `122` (`94` missing + `28` other), unresolved document-time status `221` (`214` missing + `7` other), relation-family unresolved `0`, treatment-family unresolved `0`, route scopes `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`, deterministic identity-review all-zero, and `validate` clean.
- Used parallel read-only Codex scouts while the main thread implemented deterministic changes: Lorentz for fare/toll event tails, Kant for procurement/property event tails, Halley for public/commercial/venue event tails, and Sagan for project-family/status residuals.
- Implemented/materialized approved responsibility-finding events (`approval`) and project-backed property-acquisition events (`milestone`), moving `event_family: other` from `509` to `505` with validation and identity-review still clean.
- Implemented/materialized OMNY temporary-fare-promotion approvals, OMNY weekly-best-fare implementation, OMNY systemwide public campaign, PCAC/LIRR facilities tour, completed contract amendments/modifications, completed procurement actions, license amendments, permit agreements, completed negotiations, and no-type named physical-infrastructure project-family mapping.
- Guardrail: proposed fare/toll/rate records, expected delivery records, proposal records, generic GCT/commercial/public venue programming, generic tours, telecom/connectivity/tolling/retail/planning no-type projects, and broad station/bridge records without audited named-asset proof remain unresolved.
- Post-materialize counts: `event_family: other = 489` (down `20` from this slice baseline); unresolved project family `103` (`75` missing + `28` other, down `19`); unresolved document-time status unchanged at `221` (`214` missing + `7` other); relation-family unresolved `0`; treatment-family unresolved `0`; route scopes unchanged at `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`.
- Verification: focused ontology tests pass (`241` tests, `3181` expects), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-30T04-01-52-067Z_identity-review` reports all-zero review/candidate/cluster/issue counts, and `validate` reports `Issues: 0`.
- Next queued lanes: residual `event_family: other = 489` remains the largest countable bucket; project-family unresolved is now `103`; document-time-status residuals appear to be a policy floor absent stronger deterministic evidence; route split candidates remain representation/data-retargeting policy floor. No external/provider-backed LLM commands were used.

## Latest Slice - Aggressive Codex Reset-Window Event/Project/Status Cleanup

- Re-baselined measurable buckets at `event_family: other = 489`, unresolved project family `103` (`75` missing + `28` other), unresolved document-time status `221` (`214` missing + `7` other), source-gap kind unresolved `424` (`2` missing + `422` other), relation-family unresolved `0`, treatment-family unresolved `0`, deterministic identity-review all-zero, and `validate` clean.
- Used parallel read-only Codex scouts while the main thread implemented deterministic changes: Ohm for infrastructure/service event tails, Huygens for public/venue/special-event tails, Aristotle for typed project-family policy-floor review, Ptolemy for no-type project-family residuals, Rawls for largest-backlog inventory, and Goodall for document-time status residuals.
- Implemented event-family rules for US Open LIRR special-event service (`implementation`), marathon subway-ridership record (`milestone`), Grand Avenue Depot/NYPA charging-infrastructure tour (`milestone`), city busway/bus-lane install-plan announcement (`planning`), and Elmont-UBS Arena new-station service announcement (`launch`).
- Implemented no-type project-family rules for exact planning/report, governance policy, technology-system, capital-infrastructure, accessibility/safety, and pilot payloads; typed project-family residuals remain an intentional policy floor.
- Implemented no-status document-time rules for exact Board-request planned actions, option/extension/authorization approvals, explicit launched/installed/took-effect implementations, ongoing active work, and future/will/draft planned work.
- Guardrail: broad public/commercial/venue events, proposed fare/toll/rate records, expected deliveries, generic tours, generic contract extensions, generic initiatives, generic ADA/accessibility projects, generic operating-efficiency projects, and typed project-family `other` records remain unresolved without stronger deterministic proof or taxonomy policy.
- Post-materialize counts: `event_family: other = 484` (down `5`), unresolved project family `81` (`53` missing + `28` other, down `22`), unresolved document-time status `180` (`173` missing + `7` other, down `41`), source-gap kind unresolved `424` (`2` missing + `422` other), route scopes unchanged at `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`, relation-family unresolved `0`, and treatment-family unresolved `0`.
- Verification: focused ontology tests pass (`244` tests, `3245` expects), `bun run typecheck` passes, deterministic materialization completed with SQLite FTS `quick_check: ok`, deterministic `identity-review` run `2026-06-30T04-31-07-212Z_identity-review` reports all-zero review/candidate/cluster/issue counts, and `validate` reports `Issues: 0`.
- Next queued lanes: source-gap `gap_kind_normalized` missing `2` (taxonomy caution because one is a methodology caveat), residual document-time status missing `173`, no-type project-family missing `53`, and event-family other `484`. No external/provider-backed LLM commands were used.

## Latest Slice - Codex Reset-Window Source-Gap/Event/Project Cleanup

- Re-baselined measurable buckets at `event_family: other = 484`, unresolved project family `81` (`53` missing + `28` other), unresolved document-time status `180` (`173` missing + `7` other), source-gap kind unresolved `424` (`2` missing + `422` other), relation-family unresolved `0`, treatment-family unresolved `0`, route scopes `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`, deterministic identity-review all-zero, and `validate` clean.
- Used bounded Codex fanout: Mencius audited document-time status, Ramanujan audited project-family missing rows, Euler audited event-family tails, Euclid audited source-gap kind normalization, Sagan narrowed event implementation groups, and Halley implemented the project-family worker slice.
- Implemented source-gap normalization replay for singleton source-gap records and stale runner-owned `gap_kind_normalized: other` promotion. Source-gap unresolved dropped from `424` to `66`; remaining `other` records are generic caveats, implementation/funding/status uncertainty, scope limits, and source-prep artifacts needing taxonomy policy rather than blind mapping.
- Implemented event-family rules for exact station-agent agreements, lease expirations, fare-gate qualification/procurement planning, actual SDMF delivery, concrete proposal/refinement/estimated/design/study planning records, and proven service-impact pause records.
- Implemented project-family rules for bounded no-type surfaces: bus priority, accessibility/safety, pilot, service change, fare/enforcement/finance, real-estate/property, capital infrastructure, and internal operations. Skipped `project_125th-st-curb-regulations-2014` because its payload only proves truck loading/parking.
- Guardrail: proposed procurement awards, expected deliveries, generic environmental-review/status records, comparison-only storms, maintained-operations storm records, typed `project_family: other`, and generic source-gap caveats remain unresolved.
- Post-materialize counts: `event_family: other = 457` (down `27`), unresolved project family `51` (`23` missing + `28` other, down `30`), unresolved document-time status `180`, source-gap kind unresolved `66`, route scopes unchanged at `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`, relation-family unresolved `0`, and treatment-family unresolved `0`.
- Verification: focused ontology tests pass (`249` tests, `3345` expects); `git diff --check` passes for touched code/test files; `bun run typecheck` passes; deterministic materialization completed with SQLite FTS `quick_check: ok`; deterministic `identity-review` run `2026-06-30T05-05-30-842Z_identity-review` reports all-zero review/candidate/cluster/issue counts; `validate` reports `Issues: 0` (`84048` canonical records, `7339` wiki pages).
- Next queued lanes: residual `event_family: other = 457`, document-time status unresolved `180`, project-family unresolved `51`, source-gap policy floor `66`, and route split-candidate policy floor `7`. No external/provider-backed LLM commands were used.

## Latest Slice - Codex Reset-Window Status/Event/Project/Source-Gap Cleanup

- Re-baselined measurable buckets at `event_family: other = 457`, unresolved project family `51` (`23` missing + `28` other), unresolved document-time status `180` (`173` missing + `7` other), source-gap kind unresolved `66` (`0` missing + `66` other), route scopes `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`, relation-family unresolved `0`, treatment-family unresolved `0`, deterministic identity-review all-zero, and `validate` clean.
- Used bounded read-only Codex fanout while the main thread implemented deterministic changes: Wegener the 2nd audited event-family tails, Herschel the 2nd audited document-time status and contract/agreement status patterns, Epicurus the 2nd audited project-family residuals, and Mendel the 2nd audited source-gap kind residuals.
- Implemented no-status project document-time status rules for exact ADA/station accessibility planning evidence, station success-story implementation evidence, operating-efficiency action evidence, safety/operations active evidence, and concrete contract/agreement instrument approval evidence. Guardrails keep generic ADA projects, generic operating-efficiency initiatives, umbrella `Additional NYCT Initiatives`, generic technology platforms, generic station renewals, and generic contract chatter unresolved.
- Implemented no-type project-family rules for six exact ADA/station accessibility payloads: new ADA accessible stations, Lindenhurst LIRR accessibility, Capital Program ADA Accessibility, LIRR ADA Stations, Williams Bridge ADA station improvements, and Mets-Willets Point developer-funded ADA accessibility. Generic station accessibility, generic ADA station work, and generic developer-funded station work remain unresolved.
- Implemented payload-proven event-family rules for document metadata page/staff/data-prepared events, planned revenue-service dates, Woodhaven/Cross Bay/Q52/Q53 SBS project target dates, and curb-regulation refinement after bus-lane implementation. Bare `page_update`, `measurement_date`, `revenue_service_date`, generic `project_target`, and generic `regulation_update` remain unresolved.
- Implemented exact source-gap correction rules for typographical errors, calculation-error removals, explicit data revision notes, and updated violation-count notes. Generic subject-to-revision/provisional caveats and updated proposal text remain outside correction.
- Post-materialize counts: `event_family: other = 445` (down `12`), unresolved project family `45` (`17` missing + `28` other, down `6`), unresolved document-time status `137` (`131` missing + `6` other, down `43`), source-gap kind unresolved `62` (`0` missing + `62` other, down `4`), route scopes unchanged at `true_route: 304`, `split_candidate: 7`, `aggregate_list_context: 9`, `data_only_scope: 1`, relation-family unresolved `0`, and treatment-family unresolved `0`.
- Verification: focused ontology tests pass (`250` tests, `3401` expects); `git diff --check` passes for touched code/test files; `bun run typecheck` passes; deterministic materialization completed with SQLite FTS `quick_check: ok`; deterministic `identity-review` run `2026-06-30T05-23-20-552Z_identity-review` reports all-zero review/candidate/cluster/issue counts; `validate` reports `Issues: 0` (`84048` canonical records, `7339` wiki pages).
- Next queued lanes: residual `event_family: other = 445`, document-time status unresolved `137`, project-family unresolved `45`, source-gap kind unresolved `62`, route split-candidate policy floor `7`, and entity alias collision follow-up if it reappears. No external/provider-backed LLM commands were used.

## Latest Slice - Aggressive Codex Reset-Window Route-Type/Project-Family Cleanup

- Re-baselined after the prior checkpoint at `event_family: other = 445`, unresolved project family `45` (`17` missing + `28` other), unresolved document-time status `137` (`131` missing + `6` other), source-gap kind unresolved `62`, route type unresolved `55`, relation-family unresolved `0`, treatment-family unresolved `0`, and `validate` clean.
- Used parallel read-only Codex scouts while the main thread implemented deterministic cleanup: Poincare the 2nd ranked residual buckets, Bohr the 2nd audited identity-review noise, Feynman the 2nd audited route aggregate/split scope, and Hume the 2nd audited ontology tails. All scouts were closed after completion.
- Implemented exact source-gap, event-family, project-status, and project-family rules for methodology/comparability gaps, data-unavailable/data-quality source gaps, proposed fare/toll planning events, final-budget governance action items, hard end/sunset milestones, grant-funded/contract/proposal statuses, and exact project-family buckets.
- Implemented bounded route type inference from explicit bus route IDs, Bee-Line route IDs, stated bus/subway/ferry/commuter-rail modes, named Select Bus Service surfaces, subway train evidence, and Penn Station Access/Metro-North evidence. Guardrails leave aggregate/count-only/slash route surfaces and `route_34th-st-bus-priority` untyped.
- Implemented seven exact project-family residual rules: 125th/126th/Kings Highway curb operations as `street_redesign`, Verrazano/Verrazzano tolling as `fare_program`, Contingency Recovery Rides as `service_change`, and Rockaways Rehab as `capital_or_infrastructure`.
- Post-materialize counts: `event_family: other = 431`; unresolved project family `26` (`6` missing + `20` other); unresolved document-time status `125` (`119` missing + `6` other); source-gap kind unresolved `47`; route type unresolved `1`; relation-family unresolved `0`; treatment-family unresolved `0`.
- Verification: focused ontology tests pass (`252` tests, `3486` expects); `git diff --check` passes for touched code/test files; `bun run typecheck` passes; deterministic materialization completed with SQLite FTS `quick_check: ok`; `validate` reports `Issues: 0` (`84043` canonical records, `7339` wiki pages).
- Next queued lanes: source-gap exact tail candidates (`47`), small event-family exact tail candidates (`431` total, but only a few safe whitelist wins), project-family residual `26`, document-time status residual `125`, and optional entity duplicate-key overrides after owner approval. No external/provider-backed LLM commands were used.

## Latest Slice - Codex Reset-Window Source-Gap/Event Tail Cleanup

- Re-baselined measurable buckets at `event_family: other = 431`, source-gap kind unresolved `47`, unresolved project family `26` (`6` missing + `20` other), unresolved document-time status `125` (`119` missing + `6` other), route type unresolved `1`, relation-family unresolved `0`, treatment-family unresolved `0`, and `validate` clean.
- Used bounded read-only Codex fanout while the main thread implemented deterministic changes: Nietzsche the 2nd audited source-gap residuals, Laplace the 2nd audited event-family residuals, and Meitner the 2nd audited project-family/status residuals.
- Implemented existing-taxonomy source-gap rules for exact unknown/unidentified information, pending filings/reporting/status, data reliability, temporal-scope caveats, no-active-hedges exclusions, survey-not-conducted gaps, date inconsistency corrections, and provisional forecast/design values.
- Source-gap guardrail: broad financial/programmatic risks, scope limits, operational constraints, source-processing partial-extraction records, work-continuation notes, and generic caveats remain `other` rather than being force-mapped.
- Implemented event-family rules for payload-proven fare/toll planning, report/review publications, committee/work-plan governance, minutes approval, incident-response records, emergency/station operations drills, and concrete support/discontinuation milestones.
- Event guardrail: generic updates, performance reviews, proposed fare increases without stronger planning markers, plain `support_end` may-end records, broad public/commercial/venue events, delivery forecasts, and infrastructure-project labels remain unresolved.
- Post-materialize counts: `event_family: other = 395` (down `36`), source-gap kind unresolved `31` (down `16`), unresolved project family unchanged at `26` (`6` missing + `20` other), unresolved document-time status unchanged at `125` (`119` missing + `6` other), route type unresolved `1`, relation-family unresolved `0`, and treatment-family unresolved `0`.
- Verification: focused ontology tests pass (`253` tests, `3529` expects); `git diff --check` passes for touched code/test/note files; `bun run typecheck` passes; deterministic materialization completed with SQLite FTS `quick_check: ok`; `validate` reports `Issues: 0` (`84043` canonical records, `7339` wiki pages).
- Next queued lanes: project/status scout found a safe `19`-record project-family/status batch; event-family `other = 395` remains the largest bucket but needs tighter whitelists; source-gap `other = 31` is mostly policy-floor risk/scope/operational caveat material. No external/provider-backed LLM commands were used.
