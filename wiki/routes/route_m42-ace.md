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
  - "mta_automated_camera_enforcement"
local_observation_id: "route_m42_ace"
local_observation_ids:
  - "route_42nd_st_m42"
  - "route_m42_42nd_st"
  - "route_m42_42nd_st_cb4"
  - "route_m42_42nd_st_cb6"
  - "route_m42_ace"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-19T18:05:27.522Z"
submission_ids:
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
---

<!-- mta-wiki:writer:start -->

<!-- mta-wiki:writer:end -->
