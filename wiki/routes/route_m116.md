---
managed_by: "mta-wiki-materializer"
record_id: "route_m116"
record_kind: "route"
display_name: "M116 Manhattan"
source_id: "better_buses"
source_ids:
  - "116_st_morningside_ave_pleasant_ave_cb10_feb2025"
  - "116_st_morningside_ave_pleasant_ave_cb10_jun2025"
  - "116_st_morningside_ave_pleasant_ave_cb10_may2025"
  - "116_st_morningside_ave_pleasant_ave_cb11_jun2025"
  - "116_st_morningside_ave_pleasant_ave_cb11_mar2025"
  - "116_st_morningside_ave_pleasant_ave_cb11_may2025"
  - "116_st_morningside_ave_pleasant_ave_cb9_feb2025"
  - "116_st_morningside_ave_pleasant_ave_cb9_jun2025"
  - "better_buses"
  - "fare_free_bus_pilot_evaluation"
  - "meeting_doc_147096"
  - "meeting_doc_202106"
  - "mta_automated_camera_enforcement"
local_observation_id: "route_m116"
local_observation_ids:
  - "route_m116"
  - "route_m116_116th_st_study_area"
  - "route_m116_ace"
  - "route_m116_cb11_jun2025"
  - "route_m116_cb11_mar2025"
  - "route_m116_cb11_may2025"
  - "route_m116_cb9_feb2025"
  - "route_m116_cb9_jun2025"
  - "route_m116_eval"
  - "route_m116_may2025"
  - "route_m116_meeting_doc_202106"
  - "route_m116_update"
  - "route_m116_update_jun2025"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-21T22:40:45.290Z"
raw_text: "M116 route in Manhattan, in Harlem"
submission_ids:
  - "sub_023efb260e416c71"
  - "sub_3a4276e19f1ed73a"
  - "sub_3b6502d3c0ad8f59"
  - "sub_3e4ef482b830330b"
  - "sub_463a1a82434b2a5f"
  - "sub_4db4d6a5b03a762c"
  - "sub_503ef7b5b692764e"
  - "sub_5c52542419f2e77c"
  - "sub_75ee712b849e689d"
  - "sub_93c09890409f0aa2"
  - "sub_b4d44e404da27ab7"
  - "sub_beb19b99d181815c"
  - "sub_f7a878e0b09e594c"
payload:
  _merged_field_values:
    description:
      - "Bus route serving 116th Street corridor in Manhattan"
      - "Fare-free bus pilot route in Manhattan, in Harlem"
      - "Local bus route serving 116th Street study area"
      - "Operates along 116th Street in the CB10 study area. Weekday congestion causes 785 hours of delay to M116 passengers daily."
      - "Bus route serving 116th Street corridor in Manhattan, part of 10 routes in the study area"
      - "Critical crosstown bus route serving 116th Street corridor with connections to subway lines 2, 3, 6, B, C"
      - "Critical crosstown service on 116th Street"
      - "Bus route serving 116th Street study area"
      - "Bus route in the 116th Street study area"
      - "Critical crosstown bus service operating along 116th Street corridor in study area."
      - "Fare-Free Bus Pilot route in Manhattan, connecting Harlem to Mt. Eden"
    route_type:
      - "local bus"
      - "local"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Manhattan"
  borough_normalized: "manhattan"
  description: "Bus route serving 116th Street corridor in Manhattan"
  note: "Shown in MTA App Spanish-language screenshot heading to East Harlem Paladino Av Crosstown"
  route_id: "M116"
  route_label: "M116"
  route_name: "M116"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local bus"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "116 St / Manhattan Av"
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
    block_id: "p002_c0006"
    evidence_id: "fare_free_bus_pilot_evaluation#p002_c0006"
    page_number: 2
    role: "route_map"
    source_id: "fare_free_bus_pilot_evaluation"
    source_path: "raw/sources/fare_free_bus_pilot_evaluation/blocks.jsonl"
    text_sha256: "sha256:16396d801f9d7bb8298c103e77727bf74ad2bd66ecd9999b6a8c36e83a2797be"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists M116 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "M116, 116 St / Manhattan Av"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
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
    block_id: "p008_c0002"
    evidence_id: "116_st_morningside_ave_pleasant_ave_cb10_jun2025#p008_c0002"
    page_number: 8
    role: "route_context"
    source_id: "116_st_morningside_ave_pleasant_ave_cb10_jun2025"
    source_path: "raw/sources/116_st_morningside_ave_pleasant_ave_cb10_jun2025/blocks.jsonl"
    source_quote: "785 hours of delay to M116 passengers daily"
    text_sha256: "sha256:07ce6c31ed47cb73bb18e7e68de598bb7d2af4adaadbd93c0fa0339234454007"
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
    block_id: "p005_c0002"
    evidence_id: "116_st_morningside_ave_pleasant_ave_cb11_may2025#p005_c0002"
    page_number: 5
    source_id: "116_st_morningside_ave_pleasant_ave_cb11_may2025"
    source_path: "raw/sources/116_st_morningside_ave_pleasant_ave_cb11_may2025/blocks.jsonl"
    source_quote: "M102, M116, BxM6, BxM7, BxM8, BxM9, BxM11"
    text_sha256: "sha256:c98c7cc2615305e872dcab1d7b1385de0784b043602e422340e2b94dcd03ef42"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "116_st_morningside_ave_pleasant_ave_cb11_jun2025#p004_c0002"
    page_number: 4
    source_id: "116_st_morningside_ave_pleasant_ave_cb11_jun2025"
    source_path: "raw/sources/116_st_morningside_ave_pleasant_ave_cb11_jun2025/blocks.jsonl"
    source_quote: "• CB11 Study area: 116 th St. & Pleasant Av. – Total: 1.1 miles • Over 36,000+ daily bus passengers across 7 bus routes: – M102, M116, BxM6, BxM7, BxM8, BxM9, BxM11"
    text_sha256: "sha256:c98c7cc2615305e872dcab1d7b1385de0784b043602e422340e2b94dcd03ef42"
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
  -
    block_id: "p002_c0006"
    evidence_id: "meeting_doc_147096#p002_c0006"
    page_number: 2
    source_id: "meeting_doc_147096"
    source_path: "raw/sources/meeting_doc_147096/blocks.jsonl"
    text_sha256: "sha256:301d5245c345132deb2f6d40e5ec4afeeeaadc11052cd0479f325223ff183db9"
    text_source: "raw_text"
  -
    block_id: "p004_c0003"
    evidence_id: "meeting_doc_147096#p004_c0003"
    page_number: 4
    source_id: "meeting_doc_147096"
    source_path: "raw/sources/meeting_doc_147096/blocks.jsonl"
    text_sha256: "sha256:24e20d5d01061586336bfbc95f0a79b198a9703e193aee6df12156bcfb0f0528"
    text_source: "raw_text"
  -
    block_id: "p018_c0002"
    evidence_id: "meeting_doc_147096#p018_c0002"
    page_number: 18
    source_id: "meeting_doc_147096"
    source_path: "raw/sources/meeting_doc_147096/blocks.jsonl"
    text_sha256: "sha256:7f21d6bdb730239a5890c1312097c8f9efbeb2b876811fffc17d5253b30a74d3"
    text_source: "raw_text"
  -
    block_id: "p014_c0003"
    evidence_id: "meeting_doc_202106#p014_c0003"
    page_number: 14
    source_id: "meeting_doc_202106"
    source_path: "raw/sources/meeting_doc_202106/blocks.jsonl"
    source_quote: "a subway route card for the M116 line is displayed. The card shows the destination 'East Harlem Paladino Av Crosstown'"
    text_sha256: "sha256:c877417ffbcd725e3d9abd1f6c0686d4e4eb1fe89e5c135453bcd3393e1fe9c3"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->

<!-- mta-wiki:writer:end -->
