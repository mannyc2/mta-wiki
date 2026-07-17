---
managed_by: "mta-wiki-materializer"
record_id: "route_b62"
record_kind: "route"
display_name: "B62 - ABLE route"
source_id: "ace_routes_dataset_dictionary"
source_ids:
  - "ace_routes_dataset_dictionary"
  - "bus_lane_camera_report_2024"
  - "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024"
  - "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024"
  - "grand_ave_metropolitan_ave_queens_blvd_nov2024"
  - "meeting_doc_102836"
  - "meeting_doc_187251"
  - "mta_automated_camera_enforcement"
  - "mta_queens_bus_network_redesign_service_changes"
local_observation_id: "route_b62"
local_observation_ids:
  - "route_able_b62"
  - "route_b62"
  - "route_b62_ace"
  - "route_b62_camera_enforcement"
  - "route_b62_extension_20250821"
  - "route_b62_grand_ave_2024"
  - "route_b62_grand_ave_nov2024"
  - "route_b62_qbnr_2025"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-07-12T23:31:06.000Z"
raw_text: "B62 ABLE camera route through 2023"
submission_ids:
  - "sub_028779615e2b7b0c"
  - "sub_04232dd62936bcab"
  - "sub_13229be93035470a"
  - "sub_2cbab83c16da56d6"
  - "sub_3908583607ae7599"
  - "sub_581d276d9a8d27b7"
  - "sub_6a32b16a0b3fdaa7"
  - "sub_9992fad4c6f90383"
  - "sub_c7e306202393fd34"
payload:
  _merged_field_values:
    borough:
      - "Brooklyn"
      - "Queens"
    borough_normalized:
      - "brooklyn"
      - "queens"
    description:
      - "Bus route operating from Grand Av Bus Depot"
      - "Bus lane enforcement camera activated December 12, 2022 as part of 9 new routes"
      - "The B62 will be extended along 21 St to the Astoria Houses"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Brooklyn"
  borough_normalized: "brooklyn"
  description: "Bus route operating from Grand Av Bus Depot"
  gtfs_route_id: "B62"
  note: "ABLE cameras operated on this route through 2023"
  program: "ABLE"
  route: "B62"
  route_id: "B62"
  route_label: "B62"
  route_name: "B62"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "Brooklyn Navy Yard / Manhattan Av / Jackson Av"
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
    block_id: "p001_b0029"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0029"
    page_number: 1
    role: "value"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"item\": \"B62\","
    text_sha256: "sha256:263375290e8a3127987057c289a8027cc50d73c2b9772c9a73442cf5c3a5e35e"
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
    role: "lists B62 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "B62, Brooklyn Navy Yard / Manhattan Av / Jackson Av"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p007_c0005"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024#p007_c0005"
    page_number: 7
    role: "mentioned"
    source_id: "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024/blocks.jsonl"
    text_sha256: "sha256:297c690821d112808c984eb439fc65c979fa47f81d105fd7d3a0cbc55deff8b5"
    text_source: "raw_text"
  -
    block_id: "p007_c0004"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_nov2024#p007_c0004"
    page_number: 7
    source_id: "grand_ave_metropolitan_ave_queens_blvd_nov2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_nov2024/blocks.jsonl"
    source_quote: "Operates 10 bus routes, including the B38, B47, B57, B60, B62, and Q59"
    text_sha256: "sha256:297c690821d112808c984eb439fc65c979fa47f81d105fd7d3a0cbc55deff8b5"
    text_source: "raw_text"
  -
    block_id: "p007_c0005"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024#p007_c0005"
    page_number: 7
    source_id: "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024/blocks.jsonl"
    source_quote: "Operates 10 bus routes, including the B38, B47, B57, B60, B62, and Q59"
    text_sha256: "sha256:297c690821d112808c984eb439fc65c979fa47f81d105fd7d3a0cbc55deff8b5"
    text_source: "raw_text"
  -
    block_id: "p015_c0011"
    evidence_id: "meeting_doc_102836#p015_c0011"
    page_number: 15
    source_id: "meeting_doc_102836"
    source_path: "raw/sources/meeting_doc_102836/blocks.jsonl"
    text_sha256: "sha256:faafd4cf30b5312fb207b62abbca0602b1d16b3827cf317b5a0768125ddef7db"
    text_source: "raw_text"
  -
    block_id: "p005_c0003"
    evidence_id: "meeting_doc_187251#p005_c0003"
    page_number: 5
    role: "route_change"
    source_id: "meeting_doc_187251"
    source_path: "raw/sources/meeting_doc_187251/blocks.jsonl"
    source_quote: "QUEENS Q102 B62 Starting August 21 The B62 will be extended along 21 St to the Astoria Houses and will serve this stop."
    text_sha256: "sha256:94fec00c493f0cf77545ab66183d0e68f8e3e7d497e0127c5b376c87900aa7f9"
    text_source: "raw_text"
  -
    block_id: "p001_b0101"
    evidence_id: "mta_queens_bus_network_redesign_service_changes#p001_b0101"
    page_number: 1
    role: "route_identity"
    source_id: "mta_queens_bus_network_redesign_service_changes"
    source_path: "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl"
    source_quote: "B62"
    text_sha256: "sha256:3df52b86890cf9e45ec23bfb96cb1f6d063bd0d96d5071980c49752c64349ea4"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The B62 is a local bus route classified under the ACE (Automated Camera Enforcement) program, running on Brooklyn Navy Yard / Manhattan Av / Jackson Av in Brooklyn and Queens [[cite:mta_automated_camera_enforcement#p001_b0001|B62 listed as ACE route]]. In the ACE Routes Dataset, the route's identifier is B62, with the Route column defined as a text field identifying each individual bus route [[cite:ace_routes_dataset_dictionary#p001_b0029|B62 item in ACE routes dictionary]][[cite:ace_routes_dataset_dictionary#p001_b0006|Route column description]]. The B62 was previously part of the ABLE (Automated Bus Lane Enforcement) program, with cameras operating on this route through 2023; the bus_lane_camera_report_2024 includes B62 on its list of ABLE camera-enforced routes [[cite:bus_lane_camera_report_2024#p008_c0004|B62 listed among ABLE routes]].

The B62 operates out of the MTA Grand Av Bus Depot, one of 10 bus routes served by that facility, which handles over 1,032 bus movements each weekday [[cite:grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024#p007_c0005|Grand Av Depot operates 10 routes including B62]]. The depot faces significant operational difficulties from truck traffic and congestion near the Grand St Bridge, and improvements along Grand Avenue that prioritize bus service are expected to result in more reliable, faster buses in an area lacking direct subway service [[cite:grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024#p007_c0005|Congestion impacts Grand Av Depot operations]].

As of the September 30, 2025 MTA Board Meeting, the B62 is scheduled for an extension along 21st Street to the Astoria Houses, starting August 21, as part of the Queens Bus Network Redesign [[cite:meeting_doc_187251#p005_c0003|B62 extension to Astoria Houses]]. No implementation date is recorded in the ACE dataset for this route specifically, though the most common ACE implementation date across all routes was June 20, 2024 [[cite:ace_routes_dataset_dictionary#p001_b0147|2024-06-20 implementation item]][[metric:metric_impl-20240620-count-14|14 entries on 2024-06-20]].
<!-- mta-wiki:writer:end -->
