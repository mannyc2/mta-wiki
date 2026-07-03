---
managed_by: "mta-wiki-materializer"
record_id: "route_b42"
record_kind: "route"
display_name: "B42 - ABLE route"
source_id: "ace_routes_dataset_dictionary"
source_ids:
  - "ace_routes_dataset_dictionary"
  - "bus_lane_camera_report_2024"
  - "meeting_doc_102836"
  - "mta_automated_camera_enforcement"
local_observation_id: "route_b42"
local_observation_ids:
  - "route_able_b42"
  - "route_b42"
  - "route_b42_ace"
  - "route_b42_camera_enforcement"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-19T19:36:06.904Z"
raw_text: "B42 ABLE camera route through 2023"
submission_ids:
  - "sub_638a3f25b5a896fe"
  - "sub_6cc3b62211e62b7f"
  - "sub_b9c5cf9da682e860"
  - "sub_c41f66821481e072"
payload:
  _merged_field_values:
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Brooklyn"
  borough_normalized: "brooklyn"
  description: "Bus lane enforcement camera activated December 12, 2022 as part of 9 new routes"
  note: "ABLE cameras operated on this route through 2023"
  program: "ABLE"
  route: "B42"
  route_id: "B42"
  route_label: "B42"
  route_name: "B42"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "Rockaway Pkwy"
evidence_refs:
  -
    block_id: "p001_b0006"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0006"
    page_number: 1
    role: "definition"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"description\": \"Identifies each individual bus route.\""
    text_sha256: "sha256:230b6e305204ab8227d315f854b7da6592bd44101f557dd361132010183c144e"
    text_source: "raw_text"
  -
    block_id: "p001_b0045"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0045"
    page_number: 1
    role: "value"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"item\": \"B42\","
    text_sha256: "sha256:a1679dfe735814ac4302c5522a6260a000e7db164c18f4f4a025495bfd7bca34"
    text_source: "raw_text"
  -
    block_id: "p008_c0004"
    evidence_id: "bus_lane_camera_report_2024#p008_c0004"
    page_number: 8
    role: "route_list"
    source_id: "bus_lane_camera_report_2024"
    source_path: "raw/sources/bus_lane_camera_report_2024/blocks.jsonl"
    text_sha256: "sha256:b05bc64a6f30b25ca3fe7341e37f4afef63d3a65725da3dbdccaf44314d64d71"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists B42 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "B42, Rockaway Pkwy"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p015_c0011"
    evidence_id: "meeting_doc_102836#p015_c0011"
    page_number: 15
    source_id: "meeting_doc_102836"
    source_path: "raw/sources/meeting_doc_102836/blocks.jsonl"
    text_sha256: "sha256:faafd4cf30b5312fb207b62abbca0602b1d16b3827cf317b5a0768125ddef7db"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->

<!-- mta-wiki:writer:end -->
