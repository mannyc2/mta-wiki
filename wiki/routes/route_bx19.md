---
managed_by: "mta-wiki-materializer"
record_id: "route_bx19"
record_kind: "route"
display_name: "BX19 - ABLE route"
source_id: "ace_routes_dataset_dictionary"
source_ids:
  - "ace_routes_dataset_dictionary"
  - "bus_lane_camera_report_2024"
  - "meeting_doc_133291"
  - "meeting_doc_167241"
  - "meeting_doc_206191"
  - "mta_automated_camera_enforcement"
local_observation_id: "route_bx19"
local_observation_ids:
  - "route_able_bx19"
  - "route_bx19"
  - "route_bx19_167241"
  - "route_bx19_ace"
  - "route_meeting_doc_133291_bx19"
  - "route_meeting_doc_206191_bx19"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-21T22:53:18.071Z"
raw_text: "BX19 ABLE camera route through 2023"
submission_ids:
  - "sub_1afba4e594725182"
  - "sub_1e23becaef4b2f1c"
  - "sub_394bf0350d5e4a83"
  - "sub_a7b6456ee355e422"
  - "sub_ab48b39c2acda163"
  - "sub_e7d1e86381c42765"
payload:
  _merged_field_values:
    route_id:
      - "BX19"
      - "Bx19"
    route_label:
      - "BX19"
      - "Bx19"
    route_type:
      - "local"
      - "bus"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Bronx"
  borough_normalized: "bronx"
  description: "Route Bx19 to Bronx Park, seen on bus on MTA Board Meeting cover page"
  note: "ABLE cameras operated on this route through 2023"
  program: "ABLE"
  route: "BX19"
  route_id: "BX19"
  route_label: "BX19"
  route_name: "BX19"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "Southern Blvd / E 149 St"
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
    block_id: "p001_b0033"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0033"
    page_number: 1
    role: "value"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"item\": \"BX19\","
    text_sha256: "sha256:ca0272538b13d6bdbf7ebe9104defc6a599f340cd6de3e401dbd37d7bc1856fc"
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
    role: "lists Bx19 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "Bx19, Southern Blvd / E 149 St"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p001_c0006"
    evidence_id: "meeting_doc_133291#p001_c0006"
    page_number: 1
    role: "route_evidence"
    source_id: "meeting_doc_133291"
    source_path: "raw/sources/meeting_doc_133291/blocks.jsonl"
    text_sha256: "sha256:258c4daa8b30dbf8d4f7904b1d752fa2deba4209a5ddfe29940e80c0625552c9"
    text_source: "raw_text"
  -
    block_id: "p004_c0003"
    evidence_id: "meeting_doc_133291#p004_c0003"
    page_number: 4
    role: "route_evidence"
    source_id: "meeting_doc_133291"
    source_path: "raw/sources/meeting_doc_133291/blocks.jsonl"
    text_sha256: "sha256:6ffa459d4123139a88175f44a7848090e77806a1ae5fcad76826301bd7cd7ce1"
    text_source: "raw_text"
  -
    block_id: "p005_c0003"
    evidence_id: "meeting_doc_167241#p005_c0003"
    page_number: 5
    role: "evidence"
    source_id: "meeting_doc_167241"
    source_path: "raw/sources/meeting_doc_167241/blocks.jsonl"
    text_sha256: "sha256:e21969269e27dcdee9ae3ba18e44e6005f56e332f2dd9539b51d877276b7a2c1"
    text_source: "raw_text"
  -
    block_id: "p001_c0001"
    evidence_id: "meeting_doc_206191#p001_c0001"
    page_number: 1
    role: "route_mention"
    source_id: "meeting_doc_206191"
    source_path: "raw/sources/meeting_doc_206191/blocks.jsonl"
    source_quote: "Bx19 BRONX PARK"
    text_sha256: "sha256:9d8a9c6e6ed3e6b9df9da662a6af51ebc320c6c3071b5eb6b21fa18e00ceacc6"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->

<!-- mta-wiki:writer:end -->
