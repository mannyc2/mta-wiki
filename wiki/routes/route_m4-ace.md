---
managed_by: "mta-wiki-materializer"
record_id: "route_m4-ace"
record_aliases:
  - "route_m4"
record_kind: "route"
display_name: "M4 Local Bus"
source_id: "mta_automated_camera_enforcement"
source_ids:
  - "broadway_157_st_220_st_cb12_mar2025"
  - "madison_ave_e23_st_e42_st_cb5_may2025"
  - "madison_ave_e23_st_e42_st_cb6_jun2025"
  - "mta_automated_camera_enforcement"
local_observation_id: "route_m4_ace"
local_observation_ids:
  - "route_m4_ace"
  - "route_m4_broadway_cb12_mar2025"
  - "route_m4_madison_ave_cb6_jun2025"
  - "route_m4_madison_ave_may2025"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-19T18:55:53.553Z"
submission_ids:
  - "sub_80b55fbddecd3b18"
  - "sub_a1c7d1ba5adcbc66"
  - "sub_c9186983e9146692"
  - "sub_d1e516df435b031d"
payload:
  _merged_field_values:
    description:
      - "MTA bus route on Broadway corridor between 157th St and 220th St"
      - "Local bus route on Madison Avenue in study area"
      - "M4 local bus on Madison Avenue study area"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Manhattan"
  borough_normalized: "manhattan"
  description: "MTA bus route on Broadway corridor between 157th St and 220th St"
  route_id: "M4"
  route_label: "M4"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "5 Av / Madison Av / Broadway"
evidence_refs:
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists M4 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "M4, 5 Av / Madison Av / Broadway"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p005_c0002"
    evidence_id: "broadway_157_st_220_st_cb12_mar2025#p005_c0002"
    page_number: 5
    source_id: "broadway_157_st_220_st_cb12_mar2025"
    source_path: "raw/sources/broadway_157_st_220_st_cb12_mar2025/blocks.jsonl"
    source_quote: "Bx7, Bx20, M5, M4, M100"
    text_sha256: "sha256:e13e193c7f876e486ce14e918abab23e88cfb35b9f38bbd59dc9979a5f291b7e"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "madison_ave_e23_st_e42_st_cb6_jun2025#p004_c0002"
    page_number: 4
    role: "routes_listed"
    source_id: "madison_ave_e23_st_e42_st_cb6_jun2025"
    source_path: "raw/sources/madison_ave_e23_st_e42_st_cb6_jun2025/blocks.jsonl"
    text_sha256: "sha256:985f6a589f3d76798599bb44607ae29c8c1683910f86d1c8e0c824479e1c723b"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "madison_ave_e23_st_e42_st_cb5_may2025#p004_c0002"
    page_number: 4
    source_id: "madison_ave_e23_st_e42_st_cb5_may2025"
    source_path: "raw/sources/madison_ave_e23_st_e42_st_cb5_may2025/blocks.jsonl"
    text_sha256: "sha256:985f6a589f3d76798599bb44607ae29c8c1683910f86d1c8e0c824479e1c723b"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The [[route:route_m4-ace|M4 Local Bus]] operates along two key Manhattan corridors currently under study for bus priority improvements. On Broadway from 157th Street to 220th Street, the M4 is one of five MTA bus routes (alongside Bx7, Bx20, M5, and M100) that the New York City Department of Transportation is evaluating for bus and safety improvements, connecting to the 1 A C subway lines and Metro-North at Marble Hill [[cite:broadway_157_st_220_st_cb12_mar2025#p005_c0002|Broadway study corridor routes]]. DOT presented existing conditions to Community Board 12 in March 2025 and is working with MTA to develop a design proposal with continued community feedback [[cite:broadway_157_st_220_st_cb12_mar2025#p017_c0002|CB 12 next steps]].

On Madison Avenue, the M4 is one of 34 bus routes carrying 92,000 daily riders between East 23rd and East 42nd Street, where bus lanes have existed from 42nd to 60th Street since 1981 [[cite:madison_ave_e23_st_e42_st_cb5_may2025#p004_c0002|Madison Avenue study area routes]]. Bus speeds in the study area are as low as 4.5 miles per hour, compared to a Manhattan average of 6.2 mph and a New York City average of 8.1 mph [[cite:madison_ave_e23_st_e42_st_cb5_may2025#p004_c0002|bus speed comparison]]. In October 2024, weekday AM peak speeds were summarized separately for local buses and express buses in the study area's slowest range [[metric:metric_local-speed-5-7-mph-6-10am-oct2024|local-bus AM peak speed in the Madison study area]] [[metric:metric_express-speed-7-5-mpg-6-10am-oct2024|express-bus AM peak speed in the Madison study area]] [[cite:madison_ave_e23_st_e42_st_cb5_may2025#p010_c0002|speed data table]].

A proposal for the Madison Avenue corridor includes extending existing 24/7 double bus lanes from East 42nd Street south to East 23rd Street, maintaining west curb parking and loading along with one general travel lane on most blocks [[cite:madison_ave_e23_st_e42_st_cb6_jun2025#p016_c0002|double bus lane proposal]]. The M4 is also identified as undergoing Automated Camera Enforcement (ACE) expansion, which enforces against bus lane driving, double parking, and bus stop standing [[cite:madison_ave_e23_st_e42_st_cb5_may2025#p019_c0002|ACE expansion on M2 and M4]]. An updated curb management plan for the Madison Avenue segment would retain approximately 78% of existing parking spaces [[cite:madison_ave_e23_st_e42_st_cb5_may2025#p018_c0002|curb management proposal]].
<!-- mta-wiki:writer:end -->
