---
managed_by: "mta-wiki-materializer"
record_id: "route_b26"
record_kind: "route"
display_name: "B26 - ABLE route"
source_id: "ace_routes_dataset_dictionary"
source_ids:
  - "ace_routes_dataset_dictionary"
  - "bus_lane_camera_report_2024"
  - "meeting_doc_160441"
  - "mta_automated_camera_enforcement"
local_observation_id: "route_b26"
local_observation_ids:
  - "route_able_b26"
  - "route_b26"
  - "route_b26_ace"
  - "route_meeting_doc_160441_b26"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-20T21:51:00.416Z"
raw_text: "B26 ABLE camera route through 2023"
submission_ids:
  - "sub_0a9f086eb64d64e4"
  - "sub_9036bbc8448e0a7d"
  - "sub_a612f856986d753b"
  - "sub_d3ba9c3618181855"
payload:
  _merged_field_values:
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Brooklyn"
  borough_normalized: "brooklyn"
  description: "Fulton St-Ridgewood • Frequency increases"
  note: "ABLE cameras operated on this route through 2023"
  operator: "NYCT"
  program: "ABLE"
  route: "B26"
  route_id: "B26"
  route_label: "B26"
  route_name: "B26"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "Halsey St / Fulton St"
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
    block_id: "p001_b0081"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0081"
    page_number: 1
    role: "value"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"item\": \"B26\","
    text_sha256: "sha256:6507f14a794a05f8971f2cf6c5571cc5b343677a165f99f733ad5b45bd6d1361"
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
    role: "lists B26 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "B26, Halsey St / Fulton St"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p003_c0008"
    evidence_id: "meeting_doc_160441#p003_c0008"
    page_number: 3
    source_id: "meeting_doc_160441"
    source_path: "raw/sources/meeting_doc_160441/blocks.jsonl"
    text_sha256: "sha256:27253649bd4f93a9116b17de6e881c26f2aad2bba4edda435f76b54e804666e9"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->

<!-- mta-wiki:writer:end -->
