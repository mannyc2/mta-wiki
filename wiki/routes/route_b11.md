---
managed_by: "mta-wiki-materializer"
record_id: "route_b11"
record_kind: "route"
display_name: "B11"
source_id: "ace_routes_dataset_dictionary"
source_ids:
  - "2015_06_17_brt_southbrooklyn_kickoff_boards"
  - "ace_routes_dataset_dictionary"
  - "mta_automated_camera_enforcement"
local_observation_id: "route_b11"
local_observation_ids:
  - "route_b11"
  - "route_b11_2015_sbk_corridor"
  - "route_b11_ace"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-19T17:57:12.193Z"
raw_text: "B11 listed as an east-west bus route in south Brooklyn"
submission_ids:
  - "sub_4b0a819524d537de"
  - "sub_cd9bdb8d48bd79d0"
  - "sub_ed58a9c58bab5a42"
payload:
  borough: "Brooklyn"
  borough_normalized: "brooklyn"
  description: "East-west bus route in south Brooklyn serving the South Brooklyn Crosstown corridor"
  route: "B11"
  route_id: "B11"
  route_label: "B11"
  route_name: "B11"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type_normalized: "bus"
  streets: "49 St / 50 St / Avenue I / Avenue J / Bedford Av"
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
    block_id: "p001_b0097"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0097"
    page_number: 1
    role: "smallest"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"smallest\": \"B11\","
    text_sha256: "sha256:3177fd3b96adff6ef10ea6e595f528bba56296aa5df2dbd202dcfc1d76c6d6bc"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists B11 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "B11, 49 St / 50 St / Avenue I / Avenue J / Bedford Av"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p002_c0005"
    evidence_id: "2015_06_17_brt_southbrooklyn_kickoff_boards#p002_c0005"
    page_number: 2
    role: "route_list"
    source_id: "2015_06_17_brt_southbrooklyn_kickoff_boards"
    source_path: "raw/sources/2015_06_17_brt_southbrooklyn_kickoff_boards/blocks.jsonl"
    text_sha256: "sha256:8d13eaa770ba56a029388c00b22a1a4c84153193e7e5f7418c9d7156c0065c7c"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->

<!-- mta-wiki:writer:end -->
