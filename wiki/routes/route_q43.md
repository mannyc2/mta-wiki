---
managed_by: "mta-wiki-materializer"
record_id: "route_q43"
record_aliases:
  - "route_q43-jamaica-cac2"
  - "route_q43-queens"
record_kind: "route"
display_name: "Q43 - ABLE route"
source_id: "ace_routes_dataset_dictionary"
source_ids:
  - "201104_jamaica_cac2_slides"
  - "201106_jamaica_cb12_slides"
  - "ace_routes_dataset_dictionary"
  - "bus_lane_camera_report_2024"
  - "meeting_doc_160441"
  - "mta_automated_camera_enforcement"
  - "mta_queens_bus_network_redesign_service_changes"
  - "queens_addendum_equity_evaluation_appendix_d"
  - "tsp_status_2017"
local_observation_id: "route_q43"
local_observation_ids:
  - "route_able_q43"
  - "route_meeting_doc_160441_q43"
  - "route_q43"
  - "route_q43_ace"
  - "route_q43_cb12_2011"
  - "route_q43_jamaica_cac2"
  - "route_q43_qbnr_2025"
  - "route_q43_queens"
  - "route_q43_tsp_2017"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-07-12T23:31:06.000Z"
raw_text: "Q43 ABLE camera route through 2023"
submission_ids:
  - "sub_23de79897cdbb616"
  - "sub_2cf15646f37514fa"
  - "sub_4892d516a71adec6"
  - "sub_4fd103b3c4166d3a"
  - "sub_526a91dfd6ae2834"
  - "sub_752a71331bdc2e3d"
  - "sub_930d2ee685225562"
  - "sub_ad8e87476cbd1623"
  - "sub_e86ff3e576d0c3fa"
payload:
  _merged_field_values:
    description:
      - "Bus route serving Hillside Ave and Sutphin Blvd bus stop"
      - "Jamaica-Floral Park • Frequency increases and running time adjustments"
    route_type:
      - "local bus"
      - "local"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Queens"
  borough_normalized: "queens"
  description: "Bus route serving Hillside Ave and Sutphin Blvd bus stop"
  gtfs_route_id: "Q43"
  note: "ABLE cameras operated on this route through 2023"
  operator: "NYCT"
  program: "ABLE"
  route: "Q43"
  route_id: "Q43"
  route_label: "Q43"
  route_name: "Q43"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local bus"
  route_type_normalized: "bus"
  routes:
    - "Q43"
  service_variant: "local"
  streets: "Sutphin Blvd / Hillside Av"
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
    block_id: "p001_b0069"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0069"
    page_number: 1
    role: "value"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"item\": \"Q43\","
    text_sha256: "sha256:eca13380ef2574001ca9ace7df634a6dde48b29495b15b004ac6b4cb6a7eaed1"
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
    role: "lists Q43 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "Q43, Sutphin Blvd / Hillside Av"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p016_c0007"
    evidence_id: "queens_addendum_equity_evaluation_appendix_d#p016_c0007"
    page_number: 16
    role: "route_description"
    source_id: "queens_addendum_equity_evaluation_appendix_d"
    source_path: "raw/sources/queens_addendum_equity_evaluation_appendix_d/blocks.jsonl"
    text_sha256: "sha256:ca1dcd376d007eff562a0f0e51751bbe8305c1c505fe07002e842cccc68a5308"
    text_source: "raw_text"
  -
    block_id: "p016_c0008"
    evidence_id: "queens_addendum_equity_evaluation_appendix_d#p016_c0008"
    page_number: 16
    role: "route_details"
    source_id: "queens_addendum_equity_evaluation_appendix_d"
    source_path: "raw/sources/queens_addendum_equity_evaluation_appendix_d/blocks.jsonl"
    text_sha256: "sha256:c615de988fa0d12deac8c5113f3adb67a6fa4721e50b070a9e43e58e6ffe9d2d"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "tsp_status_2017#p001_b0001"
    page_number: 1
    role: "route_mention"
    source_id: "tsp_status_2017"
    source_path: "raw/sources/tsp_status_2017/blocks.jsonl"
    source_quote: "Q43 on Hillside Avenue"
    text_sha256: "sha256:7b2bb88cd8d09fce574b6d49d2311ecfe755511bbc75b79fd88672093ff65ab7"
    text_source: "raw_text"
  -
    block_id: "p026_c0006"
    evidence_id: "201106_jamaica_cb12_slides#p026_c0006"
    page_number: 26
    role: "mentioned_on_bus_stop_diagram"
    source_id: "201106_jamaica_cb12_slides"
    source_path: "raw/sources/201106_jamaica_cb12_slides/blocks.jsonl"
    text_sha256: "sha256:90747835e8dc769a479f836815a00ae2fd3adb2946bbf8c35a56437a21c23169"
    text_source: "raw_text"
  -
    block_id: "p028_c0006"
    evidence_id: "201104_jamaica_cac2_slides#p028_c0006"
    page_number: 28
    role: "route mention"
    source_id: "201104_jamaica_cac2_slides"
    source_path: "raw/sources/201104_jamaica_cac2_slides/blocks.jsonl"
    source_quote: "Q43"
    text_sha256: "sha256:90747835e8dc769a479f836815a00ae2fd3adb2946bbf8c35a56437a21c23169"
    text_source: "raw_text"
  -
    block_id: "p004_c0004"
    evidence_id: "meeting_doc_160441#p004_c0004"
    page_number: 4
    source_id: "meeting_doc_160441"
    source_path: "raw/sources/meeting_doc_160441/blocks.jsonl"
    text_sha256: "sha256:385178108f7be74ba367420569e47119d97e73e0fdd68dc1ff9610a748e6587a"
    text_source: "raw_text"
  -
    block_id: "p001_b0048"
    evidence_id: "mta_queens_bus_network_redesign_service_changes#p001_b0048"
    page_number: 1
    role: "route_identity"
    source_id: "mta_queens_bus_network_redesign_service_changes"
    source_path: "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl"
    source_quote: "Q43"
    text_sha256: "sha256:230fff8ee7572629800f8d9ab732646a1a3e719ab202a112d194fc195da826e7"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The Q43 is an NYCT-operated local bus route in Queens serving Sutphin Boulevard and Hillside Avenue, identified as "Q43" in the ACE Routes Dataset [[cite:ace_routes_dataset_dictionary#p001_b0069|ACE Routes Dataset: Q43 item]] and operated by MTA New York City Transit [[cite:meeting_doc_160441#p004_c0004|meeting_doc_160441: Q43 (NYCT)]].

The route carried Automated Bus Lane Enforcement (ABLE) cameras through at least 2023 [[cite:bus_lane_camera_report_2024#p008_c0004|2024 bus lane camera report: Q43 listed among ABLE routes]] and is listed under the MTA's Automated Camera Enforcement (ACE) program serving Sutphin Blvd and Hillside Ave [[cite:mta_automated_camera_enforcement#p001_b0001|MTA ACE page: Q43, Sutphin Blvd / Hillside Av]].

As of a 2017 NYC DOT status report, the Q43 had Transit Signal Priority (TSP) technology operating along Hillside Avenue as part of the city's TSP program [[cite:tsp_status_2017#p001_b0001|2017 TSP status report: Q43 on Hillside Avenue]].

In the Queens Bus Network Redesign, the proposed plan includes a Q43 Extension to Long Island Jewish Hospital [[cite:queens_addendum_equity_evaluation_appendix_d#p016_c0007|Queens addendum equity evaluation: Q43 Extension to Long Island Jewish Hospital]]. A Spring/Summer 2025 service enhancement package recommended frequency increases and running time adjustments for the Q43 on its Jamaica-Floral Park routing [[cite:meeting_doc_160441#p004_c0004|meeting_doc_160441: Q43 frequency increases and running time adjustments]].

Earlier, the 2011 Jamaica Bus Improvement Study included the Q43 in proposed bus stop reconfigurations at the intersection of Hillside Avenue and Sutphin Boulevard, alongside the Q20A/Q20B and Q44 [[cite:201104_jamaica_cac2_slides#p028_c0006|2011 Jamaica CAC2 slides: Q43 bus stop at Hillside/Sutphin]], and the Q43 stop appeared on diagrams presented to Queens Community Board 12 [[cite:201106_jamaica_cb12_slides#p026_c0006|2011 Jamaica CB12 slides: Q43 bus stop diagram]].
<!-- mta-wiki:writer:end -->
