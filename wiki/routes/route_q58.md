---
managed_by: "mta-wiki-materializer"
record_id: "route_q58"
record_aliases:
  - "route_meeting-doc-115256-q58"
record_kind: "route"
display_name: "Q58 - ABLE route"
source_id: "ace_routes_dataset_dictionary"
source_ids:
  - "ace_routes_dataset_dictionary"
  - "brt_broadway_roosevelt_ave_queens_blvd_apr2019"
  - "bus_lane_camera_report_2024"
  - "fresh_pond_rd_jun2019"
  - "fresh_pond_rd_may2019"
  - "fresh_pond_rd_tc_jun2019"
  - "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024"
  - "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024"
  - "grand_ave_metropolitan_ave_queens_blvd_nov2024"
  - "meeting_doc_115256"
  - "meeting_doc_202106"
  - "mta_automated_camera_enforcement"
  - "mta_queens_bus_network_redesign_service_changes"
local_observation_id: "route_q58"
local_observation_ids:
  - "route_able_q58"
  - "route_meeting_doc_115256_q58"
  - "route_q58"
  - "route_q58_ace"
  - "route_q58_broadway_apr2019"
  - "route_q58_fresh_pond_rd"
  - "route_q58_fresh_pond_rd_may2019"
  - "route_q58_grand_ave_2024"
  - "route_q58_grand_ave_nov2024"
  - "route_q58_meeting_doc_202106"
  - "route_q58_qbnr_2025"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-07-12T23:02:57.000Z"
raw_text: "Q58 ABLE camera route through 2023"
submission_ids:
  - "sub_16e53186a38b6d0b"
  - "sub_1a85e87d64dbe0dc"
  - "sub_1b5262751d7be143"
  - "sub_54bdcf629b747ecb"
  - "sub_61b4903e362a96e2"
  - "sub_7c5bf9d5652eab4b"
  - "sub_8f96961670c84ca0"
  - "sub_90fcb76801723108"
  - "sub_b9637ca1e5f08df3"
  - "sub_c6ce13e2cf81dffb"
  - "sub_cb7b036996ccb7a1"
  - "sub_db856205ec525be3"
  - "sub_f170dec6007b1ddd"
payload:
  _merged_field_values:
    description:
      - "Operates on Broadway with Q53 SBS"
      - "Queens' Busiest Bus Route serving Ridgewood, Maspeth, Elmhurst, Corona & Flushing; operates on Fresh Pond Rd corridor"
      - "Queens' Busiest Bus Route. Ridgewood, Maspeth, Elmhurst, Corona & Flushing."
      - "Queens' Busiest Bus Route serving Ridgewood, Maspeth, Elmhurst, Corona & Flushing"
      - "Highest ridership route in Queens, serving Grand St/Grand Av corridor"
      - "Second busiest route in 2022, carrying 6.7 million customers. Speed at 7.6 MPH, 10% slower than the average Queens local and limited route. ABLE bus lane enforcement activated on July 14."
    note:
      - "ABLE cameras operated on this route through 2023"
      - "Shown in MTA App status screen with delay alert"
    route_name:
      - "Q58"
      - "Q58 Bus Route"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Queens"
  borough_normalized: "queens"
  description: "Operates on Broadway with Q53 SBS"
  gtfs_route_id: "Q58"
  note: "ABLE cameras operated on this route through 2023"
  program: "ABLE"
  route: "Q58"
  route_id: "Q58"
  route_label: "Q58"
  route_name: "Q58"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "Fresh Pond Rd / Corona Av / College Pt Blvd"
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
    block_id: "p001_b0017"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0017"
    page_number: 1
    role: "value"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"item\": \"Q58\","
    text_sha256: "sha256:e4d9d8678df198f497c40bc08ababa16db1c7c747507ae42cfc32acdf2c27b5f"
    text_source: "raw_text"
  -
    block_id: "p001_b0018"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0018"
    page_number: 1
    role: "count"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"count\": \"2\""
    text_sha256: "sha256:0b32a56b18daf0dab9a8b696a1df0cb41fb17578270af4ed47235e6608bec544"
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
    role: "lists Q58 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "Q58, Fresh Pond Rd / Corona Av / College Pt Blvd"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p006_c0002"
    evidence_id: "brt_broadway_roosevelt_ave_queens_blvd_apr2019#p006_c0002"
    page_number: 6
    source_id: "brt_broadway_roosevelt_ave_queens_blvd_apr2019"
    source_path: "raw/sources/brt_broadway_roosevelt_ave_queens_blvd_apr2019/blocks.jsonl"
    text_sha256: "sha256:86c78690294d4f318310beca0c4bdcafa4fa5cccea7e7b76f2d6d14268ac07a4"
    text_source: "raw_text"
  -
    block_id: "p006_c0002"
    evidence_id: "fresh_pond_rd_may2019#p006_c0002"
    page_number: 6
    role: "route_description"
    source_id: "fresh_pond_rd_may2019"
    source_path: "raw/sources/fresh_pond_rd_may2019/blocks.jsonl"
    text_sha256: "sha256:ba708d386724df4ba3c5e4ad9843b959ef33db75382bf890a4b8a1e95efbe282"
    text_source: "raw_text"
  -
    block_id: "p005_c0002"
    evidence_id: "fresh_pond_rd_may2019#p005_c0002"
    page_number: 5
    role: "high_ridership_route"
    source_id: "fresh_pond_rd_may2019"
    source_path: "raw/sources/fresh_pond_rd_may2019/blocks.jsonl"
    text_sha256: "sha256:93d426d827d5614eeb6d8111565f81eca96766b2a7b29ac34ee3048de0b0ea4b"
    text_source: "raw_text"
  -
    block_id: "p006_c0002"
    evidence_id: "fresh_pond_rd_tc_jun2019#p006_c0002"
    page_number: 6
    role: "route_description"
    source_id: "fresh_pond_rd_tc_jun2019"
    source_path: "raw/sources/fresh_pond_rd_tc_jun2019/blocks.jsonl"
    text_sha256: "sha256:ba708d386724df4ba3c5e4ad9843b959ef33db75382bf890a4b8a1e95efbe282"
    text_source: "raw_text"
  -
    block_id: "p006_c0002"
    evidence_id: "fresh_pond_rd_jun2019#p006_c0002"
    page_number: 6
    role: "route_description"
    source_id: "fresh_pond_rd_jun2019"
    source_path: "raw/sources/fresh_pond_rd_jun2019/blocks.jsonl"
    text_sha256: "sha256:ba708d386724df4ba3c5e4ad9843b959ef33db75382bf890a4b8a1e95efbe282"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024#p004_c0002"
    page_number: 4
    role: "mentioned"
    source_id: "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024/blocks.jsonl"
    text_sha256: "sha256:76c6f89adbcb2cf2d168a88a87a25053ed29155facebadd3f5bf84102728e523"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_nov2024#p004_c0002"
    page_number: 4
    source_id: "grand_ave_metropolitan_ave_queens_blvd_nov2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_nov2024/blocks.jsonl"
    source_quote: "Q58 is the highest ridership route in Queens"
    text_sha256: "sha256:76c6f89adbcb2cf2d168a88a87a25053ed29155facebadd3f5bf84102728e523"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024#p004_c0002"
    page_number: 4
    source_id: "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024/blocks.jsonl"
    source_quote: "Q58 is the highest ridership route in Queens"
    text_sha256: "sha256:76c6f89adbcb2cf2d168a88a87a25053ed29155facebadd3f5bf84102728e523"
    text_source: "raw_text"
  -
    block_id: "p015_c0010"
    evidence_id: "meeting_doc_115256#p015_c0010"
    page_number: 15
    source_id: "meeting_doc_115256"
    source_path: "raw/sources/meeting_doc_115256/blocks.jsonl"
    text_sha256: "sha256:caa958b24314b5d5e6667cdf839b661441648938ec663bf13985c42b877f2ab6"
    text_source: "raw_text"
  -
    block_id: "p009_c0003"
    evidence_id: "meeting_doc_202106#p009_c0003"
    page_number: 9
    source_id: "meeting_doc_202106"
    source_path: "raw/sources/meeting_doc_202106/blocks.jsonl"
    source_quote: "Q58 Delays (10:03 AM)"
    text_sha256: "sha256:a51e38161f22cbaa4e7fd619d2e1c79b8c92700f68cce6dbbafe742ee642a1cb"
    text_source: "raw_text"
  -
    block_id: "p001_b0062"
    evidence_id: "mta_queens_bus_network_redesign_service_changes#p001_b0062"
    page_number: 1
    role: "route_identity"
    source_id: "mta_queens_bus_network_redesign_service_changes"
    source_path: "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl"
    source_quote: "Q58"
    text_sha256: "sha256:0064feb6a1fb25e90db099ee09e6956776771e659f3b129a1b6bb640e490eb35"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The Q58 is a Queens local bus route operated by MTA New York City Transit under the ABLE automated bus lane enforcement program [[cite:bus_lane_camera_report_2024#p008_c0004|ABLE route list including Q58]]. It runs along Fresh Pond Road, Corona Avenue, and College Point Boulevard serving Ridgewood, Maspeth, Elmhurst, Corona, and Flushing [[cite:mta_automated_camera_enforcement#p001_b0001|ACE page listing Q58 major streets]] [[cite:fresh_pond_rd_may2019#p006_c0002|route description]].

Multiple sources describe the Q58 as Queens' highest-ridership bus route [[cite:grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024#p004_c0002|Q58 highest ridership route in Queens]] [[cite:grand_ave_metropolitan_ave_queens_blvd_nov2024#p004_c0002|Q58 highest ridership route in Queens]] [[cite:fresh_pond_rd_may2019#p005_c0002|high ridership route]]. On Broadway between Roosevelt Avenue and Grand Avenue, the Q58 shares corridor with the Q53 SBS; this segment carries approximately 17,000 daily bus trips combined and has been identified as the slowest portion of the Q53 route [[cite:brt_broadway_roosevelt_ave_queens_blvd_apr2019#p006_c0002|Broadway carries Q53 and Q58 with 17,000 daily trips]].

The route is listed in the ACE Routes Dataset as route ID "Q58" with two entries in the dataset, and it is categorized under the ABLE program [[cite:ace_routes_dataset_dictionary#p001_b0017|ACE dataset Q58 item]] [[cite:ace_routes_dataset_dictionary#p001_b0018|ACE dataset Q58 count of 2]]. ABLE bus lane camera enforcement operated on this route through at least 2023 [[cite:bus_lane_camera_report_2024#p008_c0004|Q58 listed among ABLE camera routes]]. The Q58 also appears in MTA New York City Transit Key Performance Metrics reporting and has been shown with a delay alert in the MTA app [[cite:meeting_doc_115256#p015_c0010|Q58 in NYCT KPI metrics]] [[cite:meeting_doc_202106#p009_c0003|Q58 delay alert]].

Several recent Grand Street and Grand Avenue safety and bus priority improvement presentations to Queens Community Boards 4 and 5 in late 2024 reference the Q58 as the primary route on that corridor, noting its status as the highest-ridership route in Queens [[cite:grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024#p004_c0002|Grand Ave project mentions Q58]] [[cite:grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024#p004_c0002|CB5 presentation mentions Q58]]. The fresh Pond Road corridor was also the subject of earlier transit and traffic improvement proposals presented to Community Board 5 in mid-2019 [[cite:fresh_pond_rd_may2019#p006_c0002|Fresh Pond Rd route description]] [[cite:fresh_pond_rd_tc_jun2019#p006_c0002|Fresh Pond Rd transit improvements]] [[cite:fresh_pond_rd_jun2019#p006_c0002|Fresh Pond Rd route description]].
<!-- mta-wiki:writer:end -->
