---
managed_by: "mta-wiki-materializer"
record_id: "route_m42-ace"
record_aliases:
  - "route_m42"
record_kind: "route"
display_name: "M42"
source_id: "mta_automated_camera_enforcement"
source_ids:
  - "42nd_st_cb4_jun192019"
  - "42nd_st_cb5_jun242019"
  - "42nd_st_cb6_jun032019"
  - "42nd_st_cb6_sep042019"
  - "mta_ace_routes_may2025_cut"
  - "mta_automated_camera_enforcement"
local_observation_id: "route_m42_ace"
local_observation_ids:
  - "route_42nd_st_m42"
  - "route_ace_may2025_m42"
  - "route_m42_42nd_st"
  - "route_m42_42nd_st_cb4"
  - "route_m42_42nd_st_cb6"
  - "route_m42_ace"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-07-13T15:20:31.328Z"
raw_text: "{\"row_id\":\"row-4ih8.hhxj.srtp\",\"route\":\"M42\",\"program\":\"ACE\",\"implementation_date\":\"2025-05-27T00:00:00.000\"}"
submission_ids:
  - "sub_296d0274c61eae49"
  - "sub_4c4ff9571ba54a56"
  - "sub_9f4e972981a4f1dd"
  - "sub_a922ec6a706b9141"
  - "sub_be6b685987db9771"
  - "sub_f8dbd098af3614f1"
payload:
  _merged_field_values:
    description:
      - "Manhattan bus route operating on 42nd Street"
      - "M42 Manhattan Route along 42nd Street"
      - "Crosstown bus route along 42nd Street"
      - "Crosstown bus route on 42nd Street, east-west service between the East River and Hudson River"
    route_type:
      - "local"
      - "bus"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Manhattan"
  borough_normalized: "manhattan"
  description: "Manhattan bus route operating on 42nd Street"
  route_id: "M42"
  route_label: "M42"
  route_name: "M42 Manhattan Route"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  source_literal: "M42"
  streets: "42 St"
evidence_refs:
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists M42 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "M42, 42 St"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p006_c0003"
    evidence_id: "42nd_st_cb4_jun192019#p006_c0003"
    page_number: 6
    role: "route_list"
    source_id: "42nd_st_cb4_jun192019"
    source_path: "raw/sources/42nd_st_cb4_jun192019/blocks.jsonl"
    text_sha256: "sha256:e0bf9724a218964ddc3b79fc0695556dd165023063d827d16ae86676ab72b8ba"
    text_source: "raw_text"
  -
    block_id: "p010_c0002"
    evidence_id: "42nd_st_cb4_jun192019#p010_c0002"
    page_number: 10
    role: "running_time_data"
    source_id: "42nd_st_cb4_jun192019"
    source_path: "raw/sources/42nd_st_cb4_jun192019/blocks.jsonl"
    text_sha256: "sha256:1261ff9426bfa7abb482c869240186b2e943cdb0656a3a4fa9d28c56df83357b"
    text_source: "raw_text"
  -
    block_id: "p006_c0003"
    evidence_id: "42nd_st_cb5_jun242019#p006_c0003"
    page_number: 6
    role: "route_listing"
    source_id: "42nd_st_cb5_jun242019"
    source_path: "raw/sources/42nd_st_cb5_jun242019/blocks.jsonl"
    text_sha256: "sha256:e0bf9724a218964ddc3b79fc0695556dd165023063d827d16ae86676ab72b8ba"
    text_source: "raw_text"
  -
    block_id: "p010_c0002"
    evidence_id: "42nd_st_cb5_jun242019#p010_c0002"
    page_number: 10
    role: "running_time_table"
    source_id: "42nd_st_cb5_jun242019"
    source_path: "raw/sources/42nd_st_cb5_jun242019/blocks.jsonl"
    text_sha256: "sha256:1261ff9426bfa7abb482c869240186b2e943cdb0656a3a4fa9d28c56df83357b"
    text_source: "raw_text"
  -
    block_id: "p024_c0002"
    evidence_id: "42nd_st_cb5_jun242019#p024_c0002"
    page_number: 24
    role: "bus_stop_map"
    source_id: "42nd_st_cb5_jun242019"
    source_path: "raw/sources/42nd_st_cb5_jun242019/blocks.jsonl"
    text_sha256: "sha256:22f235d3e74ad2959a401319ac0de3273dd33e7b31a02c9777b84ca3f230b927"
    text_source: "raw_text"
  -
    block_id: "p007_c0003"
    evidence_id: "42nd_st_cb6_jun032019#p007_c0003"
    page_number: 7
    role: "route_mention"
    source_id: "42nd_st_cb6_jun032019"
    source_path: "raw/sources/42nd_st_cb6_jun032019/blocks.jsonl"
    source_quote: "M42 Manhattan Route"
    text_sha256: "sha256:e0bf9724a218964ddc3b79fc0695556dd165023063d827d16ae86676ab72b8ba"
    text_source: "raw_text"
  -
    block_id: "p013_c0002"
    evidence_id: "42nd_st_cb6_jun032019#p013_c0002"
    page_number: 13
    role: "route_travel_times"
    source_id: "42nd_st_cb6_jun032019"
    source_path: "raw/sources/42nd_st_cb6_jun032019/blocks.jsonl"
    source_quote: "M42 Running Time (Min, end to end)"
    text_sha256: "sha256:1261ff9426bfa7abb482c869240186b2e943cdb0656a3a4fa9d28c56df83357b"
    text_source: "raw_text"
  -
    block_id: "p006_c0002"
    evidence_id: "42nd_st_cb6_sep042019#p006_c0002"
    page_number: 6
    role: "heading"
    source_id: "42nd_st_cb6_sep042019"
    source_path: "raw/sources/42nd_st_cb6_sep042019/blocks.jsonl"
    text_sha256: "sha256:1261ff9426bfa7abb482c869240186b2e943cdb0656a3a4fa9d28c56df83357b"
    text_source: "raw_text"
  -
    block_id: "p006_c0003"
    evidence_id: "42nd_st_cb6_sep042019#p006_c0003"
    page_number: 6
    role: "table"
    source_id: "42nd_st_cb6_sep042019"
    source_path: "raw/sources/42nd_st_cb6_sep042019/blocks.jsonl"
    text_sha256: "sha256:6db2a9dbbf1db34fe389595f4722e67e1f513cae89f2194049886a4d635c3a6c"
    text_source: "raw_text"
  -
    block_id: "p001_b0006"
    evidence_id: "mta_ace_routes_may2025_cut#p001_b0006"
    page_number: 1
    role: "route_identity"
    source_id: "mta_ace_routes_may2025_cut"
    source_path: "raw/sources/mta_ace_routes_may2025_cut/blocks.jsonl"
    source_quote: "\"route\":\"M42\""
    text_sha256: "sha256:08e698e15923feefac5848969f9d9ac96ee67c0d3f3ceb16f0eb6e02671a3f02"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The [[route:route_m42-ace|M42]] is a Manhattan local bus route providing crosstown service along 42nd Street [[cite:42nd_st_cb4_jun192019#p006_c0003|M42 Manhattan Route]]. As of 2019, it was one of eight MTA bus routes using 42nd Street, carrying approximately 16,000 daily passengers alongside six Staten Island express routes (SIM8, SIM8X, SIM22, SIM25, SIM26, SIM30) and the X68 Queens route, with up to 210 buses per hour traveling along the corridor [[cite:42nd_st_cb6_jun032019#p007_c0003|8 routes use 42nd St]]. [[metric:metric_bus-people-79-percent|Buses carry 79% of people on 42nd St using 33% of street space]] [[cite:42nd_st_cb4_jun192019#p008_c0002|buses carry 79% of people]].

The 42nd Street corridor was identified as a Bus Forward priority in 2017 and became project 06 in the Better Buses Action Plan (April 2019), with the corridor running 2.0 miles from 12th Avenue to FDR Drive [[cite:better_buses_action_plan_2019#p029_c0005|42nd St project background]]. Average bus speeds at that time were 4.2 mph in the AM peak and 2.9 mph in the PM peak [[cite:better_buses_action_plan_2019#p029_c0006|corridor stats]].

Running time data from mid-2019 shows M42 end-to-end travel times nearly double overnight levels throughout the day [[cite:42nd_st_cb4_jun192019#p010_c0005|nearly double overnight]]. Eastbound weekday running time ranges from [[metric:metric_m42-eb-weekday-overnight-running-time|18.8 minutes overnight (12-6am)]] to [[metric:metric_m42-eb-weekday-10am-3pm-running-time|34.4 minutes midday (10am-3pm)]]; westbound weekday peak reaches [[metric:metric_m42-wb-weekday-3-7pm-running-time|35.2 minutes in the 3-7pm period]] [[cite:42nd_st_cb4_jun192019#p010_c0003|M42 running time table]]. On average, M42 buses spend more than 40% of their time stalled in traffic or at red lights [[cite:42nd_st_cb4_jun192019#p010_c0005|40% time stalled]].

The 42nd Street Transit Improvements project, jointly presented by NYC DOT and MTA New York City Transit to Community Boards 4, 5, and 6 in June 2019, proposed offset bus lanes at all times, seven-second bus queue jump signals, quick kurb installations, turn bays, and extended turn restrictions at key intersections [[cite:42nd_st_cb6_sep042019#p012_c0002|proposed treatments at Lexington Ave]].
<!-- mta-wiki:writer:end -->
