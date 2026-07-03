# Replay Eval v2-extract-pilot-20260703-projection-v2

- Release: v1-rc5
- Sources: 10
- Self diff: no
- Overall agreement: 0.00% (0/722)

## Agreement By Kind

| Kind | Expected | Actual | Match | Field mismatch | Missing | Extra | Agreement |
|---|---:|---:|---:|---:|---:|---:|---:|
| claim | 57 | 26 | 0 | 11 | 46 | 15 | 0.00% |
| corridor | 10 | 10 | 0 | 9 | 1 | 1 | 0.00% |
| entity | 34 | 14 | 0 | 11 | 23 | 3 | 0.00% |
| event | 57 | 34 | 0 | 23 | 34 | 11 | 0.00% |
| metric_claim | 163 | 81 | 0 | 68 | 95 | 13 | 0.00% |
| project | 13 | 6 | 0 | 5 | 8 | 1 | 0.00% |
| relation | 252 | 78 | 0 | 0 | 252 | 78 | 0.00% |
| route | 51 | 35 | 0 | 34 | 17 | 1 | 0.00% |
| source | 10 | 7 | 0 | 7 | 3 | 0 | 0.00% |
| source_gap | 2 | 0 | 0 | 0 | 2 | 0 | 0.00% |
| treatment_component | 73 | 30 | 0 | 21 | 52 | 9 | 0.00% |

## Top Mismatch Fields

| Field | Count |
|---|---:|
| payload.description | 160 |
| payload.unit_normalized.normalized_unit | 68 |
| payload.unit_normalized.raw_text | 68 |
| payload.unit_normalized.unit_family | 68 |
| payload.scope | 54 |
| payload.metric_name | 46 |
| payload.raw_value_text | 44 |
| payload.borough_normalized | 43 |
| evidence_refs | 36 |
| payload.route_name | 34 |
| payload.route_record_scope | 34 |
| payload.route_record_scope_reason | 34 |
| payload.route_type_normalized | 34 |
| payload.service_variant | 34 |
| payload.unit | 29 |
| payload.route_type | 28 |
| payload.route_label | 27 |
| payload.boroughs_normalized | 23 |
| payload.date_precision | 23 |
| payload.event_family | 23 |

## Agreement By Source

| Source | Expected | Actual | Match | Field mismatch | Missing | Extra | Agreement |
|---|---:|---:|---:|---:|---:|---:|---:|
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | 96 | 0 | 0 | 0 | 96 | 0 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | 84 | 34 | 0 | 20 | 64 | 14 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb10_may2025 | 91 | 51 | 0 | 33 | 58 | 18 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb11_mar2025 | 74 | 32 | 0 | 27 | 47 | 5 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb11_may2025 | 98 | 49 | 0 | 26 | 72 | 23 | 0.00% |
| 14th_street_busway | 33 | 22 | 0 | 13 | 20 | 9 | 0.00% |
| 14th_street_busway_brochure | 35 | 16 | 0 | 8 | 27 | 8 | 0.00% |
| 2009_05_13_brt_1st2nd_cac1 | 36 | 53 | 0 | 26 | 10 | 27 | 0.00% |
| 2010_01_14_brt_1st2nd_cac3 | 99 | 49 | 0 | 24 | 75 | 25 | 0.00% |
| 2010_04_29_brt_1st2nd_cac4 | 76 | 15 | 0 | 12 | 64 | 3 | 0.00% |

## Diagnostic Examples

### Field Mismatches

| Source | Kind | Expected | Actual | Key | Fields |
|---|---|---|---|---|---|
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | route | route_bxm7 | route_m102 | route\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p005_c0002 | payload.borough_normalized: "manhattan" -> undefined<br>payload.boroughs: ["Bronx","Manhattan"] -> undefined<br>payload.boroughs_normalized: ["bronx","manhattan"] -> undefined<br>payload.description: "Bronx-Manhattan express bus route serving 116th Street study area" -> undefined<br>payload.route_id: "BxM7" -> "M102"<br>payload.route_label: "BxM7" -> undefined<br>payload.route_name: "BxM7" -> undefined<br>payload.route_record_scope: "true_route" -> undefined<br>payload.route_record_scope_reason: "default_true_route" -> undefined<br>payload.route_type: "express_bus" -> "local bus"<br>payload.route_type_normalized: "express" -> undefined<br>payload.service_variant: "express" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | event | event_engineering-review-approval | obs-18 | event\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p032_c0002 | evidence_refs: [{"block_id":"p032_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"}] -> [{"block_id":"p001_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"},{"block_id":"p001_c0003","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"},{"block_id":"p032_c0002","source_id":"116_st_morningside_a...<br>payload.date_precision: "unknown" -> undefined<br>payload.description: "Engineering review and approval" -> "Presentation of updated proposal to Manhattan Community Board 10's Transportation, Historic Preservation & Landmarks Committee in June 2025."<br>payload.event_date: undefined -> "2025-06"<br>payload.event_family: "milestone" -> undefined<br>payload.event_kind: "planning milestone" -> "presentation"<br>payload.lifecycle_phase: "other" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | route | route_m3 | route_m3 | route\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p005_c0002 | evidence_refs: [{"block_id":"p005_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"},{"block_id":"p010_c0003","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"}] -> [{"block_id":"p005_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"}]<br>payload.borough_normalized: "manhattan" -> undefined<br>payload.description: "Bus route serving 116th Street study area in Manhattan" -> undefined<br>payload.route_label: "M3" -> undefined<br>payload.route_name: "M3" -> undefined<br>payload.route_record_scope: "true_route" -> undefined<br>payload.route_record_scope_reason: "default_true_route" -> undefined<br>payload.route_type_normalized: "bus" -> undefined<br>payload.service_variant: "local" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | corridor | corridor_116th-street | corridor_116th-street | corridor\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p005_c0002 | evidence_refs: [{"block_id":"p005_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"}] -> [{"block_id":"p004_c0004","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"},{"block_id":"p005_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"}]<br>payload.borough_normalized: "manhattan" -> undefined<br>payload.corridor_length_mi: 1.1 -> undefined<br>payload.corridor_name: "116th Street" -> "116th Street Corridor (Morningside Ave to Pleasant Ave)"<br>payload.description: "Vision Zero Priority Corridor serving 10 bus routes with 65,000+ daily riders, within a Priority Youth Injury Area and Senior Area" -> "Study area corridor in CB10, Manhattan."<br>payload.from: "114th St" -> undefined<br>payload.limits: "Morningside Avenue to Pleasant Avenue" -> "from Morningside Avenue to Pleasant Avenue"<br>payload.streets: ["116th Street","Manhattan Avenue","Pleasant Avenue","Morningside Avenue"] -> undefined<br>payload.to: "113th St" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | treatment_component | treatment_concrete-pedestrian-curb-extension-1 | obs-11 | treatment_component\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p020_c0001 | evidence_refs: [{"block_id":"p020_c0001","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"},{"block_id":"p020_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"},{"block_id":"p020_c0006","source_id":"116_st_morningside_a... -> [{"block_id":"p020_c0001","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"},{"block_id":"p020_c0003","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"}]<br>payload.component_kind: "concrete pedestrian curb extension" -> undefined<br>payload.description: "One proposed concrete pedestrian curb extension at 116th St. and Adam Clayton Powell Jr. Dr. Shortens crossing distance with expanded sidewalk space. Reduces crossing distance by 12%." -> "Proposed concrete pedestrian curb extension at 116th St & Adam Clayton Powell Jr. Dr, reduces crossing distance by 12%."<br>payload.location_text: "116th St. & Adam Clayton Powell Jr. Dr." -> undefined<br>payload.locations: "116th St. and Adam Clayton Powell Jr. Dr." -> "116th Street & Adam Clayton Powell Jr. Dr"<br>payload.treatment_family: "curb_management" -> undefined<br>payload.treatment_kind: "curb extension" -> "concrete pedestrian curb extension" |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | route | route_m102 | route_m7 | route\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p005_c0002 | payload.borough_normalized: "manhattan" -> undefined<br>payload.description: "Bus route serving 116th Street study area in Manhattan" -> undefined<br>payload.route_id: "M102" -> "M7"<br>payload.route_label: "M102" -> undefined<br>payload.route_name: "M102" -> undefined<br>payload.route_record_scope: "true_route" -> undefined<br>payload.route_record_scope_reason: "default_true_route" -> undefined<br>payload.route_type_normalized: "bus" -> undefined<br>payload.service_variant: "local" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | route | route_bxm11 | route_m116 | route\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p005_c0002 | evidence_refs: [{"block_id":"p005_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"}] -> [{"block_id":"p005_c0002","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"},{"block_id":"p009_c0003","source_id":"116_st_morningside_ave_pleasant_ave_cb10_jun2025"}]<br>payload.borough_normalized: "manhattan" -> undefined<br>payload.boroughs: ["Bronx","Manhattan"] -> undefined<br>payload.boroughs_normalized: ["bronx","manhattan"] -> undefined<br>payload.description: "Bronx-Manhattan express bus route serving 116th Street study area" -> undefined<br>payload.route_id: "BxM11" -> "M116"<br>payload.route_label: "BxM11" -> undefined<br>payload.route_name: "BxM11" -> undefined<br>payload.route_record_scope: "true_route" -> undefined<br>payload.route_record_scope_reason: "default_true_route" -> undefined<br>payload.route_type: "express_bus" -> "local bus"<br>payload.route_type_normalized: "express" -> undefined |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | metric_claim | metric_residents-62-800 | obs-22 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p006_c0003 | payload.description: undefined -> "Percentage of car-free households in the study area."<br>payload.metric_name: "residents" -> "car_free_households_percentage"<br>payload.raw_value_text: "62,800 residents within 1/4 mile" -> "76% of households are car-free"<br>payload.scope: "CB10 study area within 1/4 mile" -> "CB10 study area"<br>payload.unit: undefined -> "percent"<br>payload.unit_normalized.normalized_unit: "residents" -> undefined<br>payload.unit_normalized.raw_text: "62,800 residents within 1/4 mile" -> undefined<br>payload.unit_normalized.unit_family: "population" -> undefined<br>payload.value: 62800 -> 76 |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | treatment_component | treatment_painted-pedestrian-space-daylighting | obs-16 | treatment_component\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p030_c0002 | payload.component_kind: "painted pedestrian space / daylighting" -> undefined<br>payload.description: "Adds 18,700+ ft2 of painted pedestrian space. Daylighting at 10 intersections." -> "18,700+ ft2 of painted pedestrian space, daylighting at 10 intersections."<br>payload.locations: undefined -> "10 intersections"<br>payload.treatment_family: "pedestrian_or_accessibility" -> undefined<br>payload.treatment_kind: "pedestrian space" -> "painted pedestrian space" |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | entity | entity_community-board-10-manhattan | entity_community-board-10-manhattan | entity\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p001_c0002 | payload.acronym: "CB 10" -> "CB10"<br>payload.description: "CB10's Transportation, Landmarks and Historic Preservation Committee" -> undefined<br>payload.entity_type: "community_board" -> "community board"<br>payload.short_name: "CB10" -> undefined |

### Missing Examples

| Source | Kind | Record | Key |
|---|---|---|---|
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_rel-corridor-serves-bxm6 | relation\|corridor_116th-street->route_bxm6\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_daily-bus-passengers-65000 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_commute-car-10-percent | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p012_c0005 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_rel-project-uses-corridor | relation\|project_116th-st-morningside-to-pleasant-bus-priority-review->corridor_116th-street\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | event | event_winter-spring-2025-outreach | event\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p025_c0003 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_safety-total-ksi-38 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p013_c0005 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_safety-motor-vehicle-occupant-fatalities-1 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p013_c0005 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | claim | claim_goals-make-bus-fast-reliable-safer | claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p015_c0003 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | relation | relation_rel-presented-by-nyc-dot | relation\|project_116th-st-morningside-to-pleasant-bus-priority-review->entity_nyc-dot\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p002_c0006 |
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | metric_claim | metric_commute-bike-3-percent | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_feb2025#p012_c0005 |

### Extra Examples

| Source | Kind | Record | Key |
|---|---|---|---|
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | relation | obs-34 | relation\|->\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p008_c0003 |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | relation | obs-30 | relation\|->\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p033_c0003 |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | metric_claim | obs-19 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p007_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | relation | obs-38 | relation\|->\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p005_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | metric_claim | obs-20 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p008_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | metric_claim | obs-23 | metric_claim\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p017_c0008 |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | relation | obs-39 | relation\|->\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p007_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | treatment_component | obs-12 | treatment_component\|\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p024_c0001 |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | relation | obs-32 | relation\|->\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p005_c0002 |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | relation | obs-35 | relation\|->\|116_st_morningside_ave_pleasant_ave_cb10_jun2025#p005_c0002 |

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
