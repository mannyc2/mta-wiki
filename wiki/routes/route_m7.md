---
managed_by: "mta-wiki-materializer"
record_id: "route_m7"
record_kind: "route"
display_name: "M7 Bus Route"
source_id: "better_buses"
source_ids:
  - "116_st_morningside_ave_pleasant_ave_cb10_feb2025"
  - "116_st_morningside_ave_pleasant_ave_cb10_jun2025"
  - "116_st_morningside_ave_pleasant_ave_cb10_may2025"
  - "116_st_morningside_ave_pleasant_ave_cb11_mar2025"
  - "116_st_morningside_ave_pleasant_ave_cb9_feb2025"
  - "116_st_morningside_ave_pleasant_ave_cb9_jun2025"
  - "better_buses"
  - "mta_automated_camera_enforcement"
  - "segment_speed_methodology_2024"
local_observation_id: "route_m7"
local_observation_ids:
  - "route_m7"
  - "route_m7_116th_st_study_area"
  - "route_m7_ace"
  - "route_m7_cb11_mar2025"
  - "route_m7_cb9_feb2025"
  - "route_m7_cb9_jun2025"
  - "route_m7_jun2025"
  - "route_m7_may2025"
  - "route_m7_segment_speed_sixth_ave"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-10T17:22:19.716Z"
raw_text: "M7"
submission_ids:
  - "sub_12f113858d1067e7"
  - "sub_1c3d822fa21e3fbe"
  - "sub_1f4bd74e8c8abb73"
  - "sub_55c236fa5de2b47e"
  - "sub_6690aecfaf4da2d1"
  - "sub_a36bd54872b76dee"
  - "sub_a565e5bd757607f1"
  - "sub_d795b3d5afed338f"
  - "sub_faaca99463c8d0de"
payload:
  _merged_field_values:
    description:
      - "Bus route serving 116th Street study area in Manhattan"
      - "MTA bus route on 6 Avenue in Manhattan; the article references M7 bus speeds traveling north on 6 Avenue between 16 St and 34 St timepoints"
      - "Local bus route serving 116th Street study area"
      - "One of the bus routes in the 116th Street study area."
      - "Bus route serving 116th Street study area"
      - "Bus route in the 116th Street study area"
      - "Bus route serving the 116th Street study area."
    route_type:
      - "local bus"
      - "local"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Manhattan"
  borough_normalized: "manhattan"
  description: "Bus route serving 116th Street study area in Manhattan"
  note: "in 60-day warning period"
  route_id: "M7"
  route_label: "M7"
  route_name: "M7"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local bus"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "6 Av / 7 Av / Columbus Av"
evidence_refs:
  -
    block_id: "p001_b0001"
    evidence_id: "better_buses#p001_b0001"
    page_number: 1
    source_id: "better_buses"
    source_path: "raw/sources/better_buses/blocks.jsonl"
    source_quote: "10 bus routes (M3, M7, M102, M116, BxM1, BxM6, BxM7, BxM8, BxM9, BxM11)"
    text_sha256: "sha256:2e61bfba4267992a965aaf383369bd9841b3023373066892ad4931fe86c9e0d0"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists M7 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "M7, 6 Av / 7 Av / Columbus Av (in 60-day warning period)"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "segment_speed_methodology_2024#p001_b0001"
    page_number: 1
    role: "route_reference"
    source_id: "segment_speed_methodology_2024"
    source_path: "raw/sources/segment_speed_methodology_2024/blocks.jsonl"
    source_quote: "Figure 4 shows a zoomed in view of how fast our buses travel north on 6 Avenue in Manhattan, between the 16 St and 34 St timepoints on the M7 bus route"
    text_sha256: "sha256:44b5cb0777ad8ea3dfad0116e0156a31618a34b9f542523c954a22b1c6b4e5f5"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002"
    page_number: 4
    source_id: "116_st_morningside_ave_pleasant_ave_cb10_feb2025"
    source_path: "raw/sources/116_st_morningside_ave_pleasant_ave_cb10_feb2025/blocks.jsonl"
    text_sha256: "sha256:c282423777374655893fa61fffaa2e192aa9cfdc6c6864ec4b102d0e9978ca0c"
    text_source: "raw_text"
  -
    block_id: "p005_c0002"
    evidence_id: "116_st_morningside_ave_pleasant_ave_cb10_jun2025#p005_c0002"
    page_number: 5
    role: "route_listed"
    source_id: "116_st_morningside_ave_pleasant_ave_cb10_jun2025"
    source_path: "raw/sources/116_st_morningside_ave_pleasant_ave_cb10_jun2025/blocks.jsonl"
    text_sha256: "sha256:26532fc44806854c23823d7807e723e5fccbb6f3009d23c52cdbff4eec4dffa3"
    text_source: "raw_text"
  -
    block_id: "p005_c0002"
    evidence_id: "116_st_morningside_ave_pleasant_ave_cb10_may2025#p005_c0002"
    page_number: 5
    source_id: "116_st_morningside_ave_pleasant_ave_cb10_may2025"
    source_path: "raw/sources/116_st_morningside_ave_pleasant_ave_cb10_may2025/blocks.jsonl"
    text_sha256: "sha256:26532fc44806854c23823d7807e723e5fccbb6f3009d23c52cdbff4eec4dffa3"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "116_st_morningside_ave_pleasant_ave_cb11_mar2025#p004_c0002"
    page_number: 4
    source_id: "116_st_morningside_ave_pleasant_ave_cb11_mar2025"
    source_path: "raw/sources/116_st_morningside_ave_pleasant_ave_cb11_mar2025/blocks.jsonl"
    source_quote: "Over 65,000+ daily bus passengers across 10 bus routes: – M3, M7, M102, M116, BxM1, BxM6, BxM7, BxM8, BxM9, BxM11"
    text_sha256: "sha256:169180cfef5a27c59e1278807c60081e4950d1cb2546b1167062e0a3c829d11b"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "116_st_morningside_ave_pleasant_ave_cb9_feb2025#p004_c0002"
    page_number: 4
    source_id: "116_st_morningside_ave_pleasant_ave_cb9_feb2025"
    source_path: "raw/sources/116_st_morningside_ave_pleasant_ave_cb9_feb2025/blocks.jsonl"
    source_quote: "Over 40,000+ daily bus passengers across 3 bus routes: – M3, M7, M116"
    text_sha256: "sha256:624d428da4d811e524b1182a3eaafd402edc33eef047a978c455f93a93ee00c9"
    text_source: "raw_text"
  -
    block_id: "p005_c0002"
    evidence_id: "116_st_morningside_ave_pleasant_ave_cb9_jun2025#p005_c0002"
    page_number: 5
    role: "route_listing"
    source_id: "116_st_morningside_ave_pleasant_ave_cb9_jun2025"
    source_path: "raw/sources/116_st_morningside_ave_pleasant_ave_cb9_jun2025/blocks.jsonl"
    text_sha256: "sha256:1a6589aef65ef510869abc6e2653f689eeacf3d1b25e62216916b0c70aef0574"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The [[route:route_m7|M7]] is a Manhattan local bus route operating on 6th Avenue, 7th Avenue, and Columbus Avenue, as listed by the MTA's Automated Camera Enforcement program, which shows the route is in a 60-day warning period [[cite:mta_automated_camera_enforcement#p001_b0001|ACE lists M7 on 6 Av / 7 Av / Columbus Av in warning period]]. The MTA's September 2024 bus speed dataset blog post uses the M7 as an example, showing a zoomed-in view of northbound speeds on 6th Avenue between the 16th Street and 34th Street timepoints, with speeds reaching their lowest around 12 p.m., running three times slower than overnight speeds due to midday traffic [[cite:segment_speed_methodology_2024#p001_b0001|M7 segment speed example on 6th Avenue between 16 St and 34 St]].

The route is one of ten bus routes serving the 116th Street, Manhattan Avenue, and Morningside Avenue study area, which carries over 65,000 daily bus passengers across three community board districts [[cite:116_st_morningside_ave_pleasant_ave_cb10_feb2025#p004_c0002|Study area with M7 listed among 10 bus routes, 2.2 miles, 65,000+ passengers]]. In the Community Board 9 portion of the study area, safety data from 2019 to 2023 recorded 32 total injuries including 7 pedestrian injuries (none severe), 10 bicyclist injuries (2 severe), and 14 motor vehicle occupant injuries (1 severe) [[cite:116_st_morningside_ave_pleasant_ave_cb9_feb2025#p012_c0006|Injury summary 2019-2023 shows 7 pedestrian, 10 bicyclist, 14 MV occupant injuries]]. These safety metrics reflect conditions along the broader corridor that the M7 shares with routes such as the M3, M102, M116, and several express bus services [[cite:116_st_morningside_ave_pleasant_ave_cb10_jun2025#p005_c0002|CB10 study area 1.1 miles, 64,000+ passengers across M3, M7, M102, M116, BxM routes]].
<!-- mta-wiki:writer:end -->
