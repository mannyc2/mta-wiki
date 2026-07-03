# Replay Eval v2-extract-pilot-20260703-boundary-projection-v2

- Release: v1-rc5
- Sources: 10
- Self diff: no
- Overall agreement: 0.00% (0/722)

## Agreement By Kind

| Kind | Expected | Actual | Match | Field mismatch | Missing | Extra | Agreement |
|---|---:|---:|---:|---:|---:|---:|---:|
| claim | 57 | 36 | 0 | 13 | 44 | 23 | 0.00% |
| corridor | 10 | 11 | 0 | 10 | 0 | 1 | 0.00% |
| entity | 34 | 19 | 0 | 14 | 20 | 5 | 0.00% |
| event | 57 | 35 | 0 | 23 | 34 | 12 | 0.00% |
| metric_claim | 163 | 91 | 0 | 78 | 85 | 13 | 0.00% |
| project | 13 | 7 | 0 | 6 | 7 | 1 | 0.00% |
| relation | 252 | 92 | 0 | 3 | 249 | 89 | 0.00% |
| route | 51 | 45 | 0 | 44 | 7 | 1 | 0.00% |
| source | 10 | 8 | 0 | 8 | 2 | 0 | 0.00% |
| source_gap | 2 | 0 | 0 | 0 | 2 | 0 | 0.00% |
| treatment_component | 73 | 30 | 0 | 21 | 52 | 9 | 0.00% |

## Top Mismatch Fields

| Field | Count |
|---|---:|
| payload.description | 177 |
| payload.unit_normalized.normalized_unit | 78 |
| payload.unit_normalized.raw_text | 78 |
| payload.unit_normalized.unit_family | 78 |
| payload.scope | 64 |
| payload.borough_normalized | 54 |
| payload.metric_name | 53 |
| payload.raw_value_text | 52 |
| payload.route_name | 44 |
| payload.route_record_scope | 44 |
| payload.route_record_scope_reason | 44 |
| payload.route_type_normalized | 44 |
| payload.service_variant | 44 |
| evidence_refs | 43 |
| payload.route_type | 38 |
| payload.route_label | 37 |
| payload.unit | 33 |
| payload.boroughs_normalized | 29 |
| payload.borough | 28 |
| payload.boroughs | 26 |

## Agreement By Source

| Source | Expected | Actual | Match | Field mismatch | Missing | Extra | Agreement |
|---|---:|---:|---:|---:|---:|---:|---:|
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | 96 | 53 | 0 | 28 | 68 | 25 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | 84 | 34 | 0 | 20 | 64 | 14 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb10_may2025 | 91 | 51 | 0 | 34 | 57 | 17 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb11_mar2025 | 74 | 32 | 0 | 27 | 47 | 5 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb11_may2025 | 98 | 49 | 0 | 26 | 72 | 23 | 0.00% |
| 14th_street_busway | 33 | 22 | 0 | 13 | 20 | 9 | 0.00% |
| 14th_street_busway_brochure | 35 | 16 | 0 | 9 | 26 | 7 | 0.00% |
| 2009_05_13_brt_1st2nd_cac1 | 36 | 53 | 0 | 26 | 10 | 27 | 0.00% |
| 2010_01_14_brt_1st2nd_cac3 | 99 | 49 | 0 | 24 | 75 | 25 | 0.00% |
| 2010_04_29_brt_1st2nd_cac4 | 76 | 15 | 0 | 13 | 63 | 2 | 0.00% |

## Diagnostic Examples

### Field Mismatches

| Source | Kind | Expected | Actual | Key | Fields |
|---|---|---|---|---|---|
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_daily-bus-passengers-65000 | metric_claim_225868507355 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 | payload.raw_value_text: "Over 65,000+ daily bus passengers across 10 bus routes" -> "65,000+"<br>payload.scope: "116th Street study area across 10 bus routes" -> "10 bus routes on 116th Street corridor"<br>payload.unit_normalized.normalized_unit: "riders" -> undefined<br>payload.unit_normalized.raw_text: "passengers" -> undefined<br>payload.unit_normalized.unit_family: "ridership" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_residents-within-quarter-mile-91400 | metric_claim_23d51f376392 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p012_c0003 | payload.metric_name: "residents_within_quarter_mile" -> "resident_population"<br>payload.scope: "Study Area: 116th St., Manhattan Av., Pleasant Av., Morningside Av. Slip Lane" -> "within 1/4 mile of study area"<br>payload.unit_normalized.normalized_unit: "residents" -> undefined<br>payload.unit_normalized.raw_text: "residents" -> undefined<br>payload.unit_normalized.unit_family: "population" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | route | route_bxm1 | route_bxm1 | route\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 | payload.borough: "Manhattan" -> undefined<br>payload.borough_normalized: "manhattan" -> undefined<br>payload.boroughs_normalized: ["bronx","manhattan"] -> undefined<br>payload.description: "Bronx-Manhattan express bus route serving 116th Street study area" -> undefined<br>payload.route_label: "BxM1" -> undefined<br>payload.route_name: "BxM1" -> undefined<br>payload.route_record_scope: "true_route" -> undefined<br>payload.route_record_scope_reason: "default_true_route" -> undefined<br>payload.route_type: "express_bus" -> "express"<br>payload.route_type_normalized: "express" -> undefined<br>payload.service_variant: "express" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | route | route_m116 | route_m116 | route\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 | payload.borough: "Manhattan" -> undefined<br>payload.borough_normalized: "manhattan" -> undefined<br>payload.boroughs: undefined -> ["Manhattan"]<br>payload.description: "Bus route serving 116th Street corridor in Manhattan" -> undefined<br>payload.note: "Shown in MTA App Spanish-language screenshot heading to East Harlem Paladino Av Crosstown" -> undefined<br>payload.route_label: "M116" -> undefined<br>payload.route_name: "M116" -> undefined<br>payload.route_record_scope: "true_route" -> undefined<br>payload.route_record_scope_reason: "default_true_route" -> undefined<br>payload.route_type: "local bus" -> "local"<br>payload.route_type_normalized: "bus" -> undefined<br>payload.service_variant: "local" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | route | route_m102 | route_m102 | route\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 | payload.borough: "Manhattan" -> undefined<br>payload.borough_normalized: "manhattan" -> undefined<br>payload.boroughs: undefined -> ["Manhattan"]<br>payload.description: "Bus route serving 116th Street study area in Manhattan" -> undefined<br>payload.route_label: "M102" -> undefined<br>payload.route_name: "M102" -> undefined<br>payload.route_record_scope: "true_route" -> undefined<br>payload.route_record_scope_reason: "default_true_route" -> undefined<br>payload.route_type: "local bus" -> "local"<br>payload.route_type_normalized: "bus" -> undefined<br>payload.service_variant: "local" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_m116-weekday-congestion-delay-785-hours | metric_claim_1e7bcd8e6a62 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p007_c0002 | evidence_refs: [{"block_id":"p007_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_feb2025"},{"block_id":"p008_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_feb2025"},{"block_id":"p009_c0002","source_id":"116_st_morningside_a... -> [{"block_id":"p007_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_feb2025"}]<br>payload.day_type: "weekday" -> undefined<br>payload.day_type_normalized.normalized_value: "weekday" -> undefined<br>payload.day_type_normalized.raw_text: "weekday" -> undefined<br>payload.raw_value_text: "785 hours of delay to M116 passengers daily" -> "785 hours of delay"<br>payload.route: undefined -> "M116"<br>payload.scope: "M116 passengers" -> "weekday congestion"<br>payload.unit_normalized.normalized_unit: "hours" -> undefined<br>payload.unit_normalized.raw_text: "hours" -> undefined<br>payload.unit_normalized.unit_family: "duration" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_safety-total-injuries-573 | metric_claim_795cb192d568 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p013_c0002 | payload.metric_name: "crashes_injuries" -> "fatalities"<br>payload.raw_value_text: "From 2019-2023, 573 people were injured in crashes in the study area" -> "4 people were killed"<br>payload.scope: "Study area" -> "study area"<br>payload.unit: "people" -> "fatalities"<br>payload.unit_normalized.normalized_unit: "people" -> undefined<br>payload.unit_normalized.raw_text: "people" -> undefined<br>payload.unit_normalized.unit_family: "population" -> undefined<br>payload.value: 573 -> 4 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | route | route_bxm6 | route_bxm6 | route\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 | payload.borough: "Manhattan" -> undefined<br>payload.borough_normalized: "manhattan" -> undefined<br>payload.boroughs_normalized: ["bronx","manhattan"] -> undefined<br>payload.description: "Bronx-Manhattan express bus route serving 116th Street study area" -> undefined<br>payload.route_label: "BxM6" -> undefined<br>payload.route_name: "BxM6" -> undefined<br>payload.route_record_scope: "true_route" -> undefined<br>payload.route_record_scope_reason: "default_true_route" -> undefined<br>payload.route_type: "express_bus" -> "express"<br>payload.route_type_normalized: "express" -> undefined<br>payload.service_variant: "express" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | route | route_m3 | route_m3 | route\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 | payload.borough: "Manhattan" -> undefined<br>payload.borough_normalized: "manhattan" -> undefined<br>payload.boroughs: undefined -> ["Manhattan"]<br>payload.description: "Bus route serving 116th Street study area in Manhattan" -> undefined<br>payload.route_label: "M3" -> undefined<br>payload.route_name: "M3" -> undefined<br>payload.route_record_scope: "true_route" -> undefined<br>payload.route_record_scope_reason: "default_true_route" -> undefined<br>payload.route_type: "local bus" -> "local"<br>payload.route_type_normalized: "bus" -> undefined<br>payload.service_variant: "local" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | claim | claim_truck-route-acp-to-1st-av | claim_048195967bea | claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p012_c0003 | payload.claim_text: "Truck Route from Adam Clayton Powell Jr. Blvd. to 1st Av." -> "91,400 residents within ¼ mile"<br>payload.data_type: "existing_condition" -> undefined<br>payload.data_type_normalized.normalized_value: "existing_condition" -> undefined<br>payload.data_type_normalized.raw_text: "existing_condition" -> undefined<br>payload.description: "Truck route designation along 116th Street" -> undefined<br>payload.subject: undefined -> "study area" |

### Missing Examples

| Source | Kind | Record | Key |
|---|---|---|---|
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_rel-corridor-serves-bxm6 | relation\|corridor_116th-street->route_bxm6\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_commute-car-10-percent | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p012_c0005 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_rel-project-uses-corridor | relation\|project_116th-st-morningside-to-pleasant-bus-priority-review->corridor_116th-street\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | event | event_winter-spring-2025-outreach | event\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p025_c0003 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_safety-total-ksi-38 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p013_c0005 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_safety-motor-vehicle-occupant-fatalities-1 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p013_c0005 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | claim | claim_goals-make-bus-fast-reliable-safer | claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p015_c0003 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_rel-presented-by-nyc-dot | relation\|project_116th-st-morningside-to-pleasant-bus-priority-review->entity_nyc-dot\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p002_c0006 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_commute-bike-3-percent | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p012_c0005 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_safety-other-motorized-ksi-1 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p013_c0005 |

### Extra Examples

| Source | Kind | Record | Key |
|---|---|---|---|
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_68475b9fefab | relation\|corridor_116th_street->route_M116\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_a324691c2660 | relation\|project_116th_st_bus_priority_review->entity_better_buses\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p002_c0005 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_e004ec72154e | relation\|event_116th_st_presentation->entity_cb10\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p001_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | entity | entity_c60787f77936 | entity\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p002_c0004 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_c8296af00fd4 | relation\|project_116th_st_bus_priority_review->entity_nyc_dot\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p001_c0001 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_d325ebe9070e | relation\|corridor_116th_street->route_BxM11\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | entity | entity_a77ace98303c | entity\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p007_c0003 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_8d420008cf04 | relation\|corridor_116th_street->route_BxM9\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | claim | claim_2d4ec49f03e3 | claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p013_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | claim | claim_f18d7825435a | claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p007_c0002 |

## Collision Summary

| Scope | Kind | Buckets | Records | Projection-distinguishable | Projection-ambiguous |
|---|---|---:|---:|---:|---:|
| replay_scope | claim | 6 | 14 | 6 | 0 |
| replay_scope | entity | 2 | 5 | 2 | 0 |
| replay_scope | event | 10 | 50 | 10 | 0 |
| replay_scope | metric_claim | 39 | 144 | 39 | 0 |
| replay_scope | project | 1 | 2 | 1 | 0 |
| replay_scope | relation | 14 | 28 | 14 | 0 |
| replay_scope | route | 5 | 45 | 5 | 0 |
| replay_scope | treatment_component | 10 | 34 | 10 | 0 |
| full_release | claim | 984 | 2697 | 981 | 3 |
| full_release | corridor | 78 | 286 | 78 | 0 |
| full_release | entity | 2222 | 6853 | 2222 | 0 |
| full_release | event | 932 | 2677 | 931 | 1 |
| full_release | metric_claim | 7850 | 31023 | 7831 | 19 |
| full_release | project | 321 | 971 | 321 | 0 |
| full_release | relation | 679 | 1359 | 654 | 25 |
| full_release | route | 477 | 1567 | 477 | 0 |
| full_release | source | 13 | 26 | 13 | 0 |
| full_release | source_gap | 9 | 22 | 9 | 0 |
| full_release | treatment_component | 415 | 1310 | 415 | 0 |
