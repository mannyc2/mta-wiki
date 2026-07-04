---
managed_by: "mta-wiki-materializer"
record_id: "route_b25"
record_kind: "route"
display_name: "B25 - ABLE route"
source_id: "ace_routes_dataset_dictionary"
source_ids:
  - "ace_routes_dataset_dictionary"
  - "bus_lane_camera_report_2024"
  - "meeting_doc_102836"
  - "mta_automated_camera_enforcement"
local_observation_id: "route_b25"
local_observation_ids:
  - "route_able_b25"
  - "route_b25"
  - "route_b25_ace"
  - "route_b25_camera_enforcement"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-19T19:35:27.695Z"
raw_text: "B25 ABLE camera route through 2023"
submission_ids:
  - "sub_31f70e2007e504ac"
  - "sub_73e279fd4e3a7d50"
  - "sub_8667fb90cfedf1d3"
  - "sub_bbea41a9edd2be21"
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
  route: "B25"
  route_id: "B25"
  route_label: "B25"
  route_name: "B25"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "Fulton St"
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
    block_id: "p001_b0089"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0089"
    page_number: 1
    role: "value"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"item\": \"B25\","
    text_sha256: "sha256:01732b4f9d17243e62fbc4591153e477cc7ca1c73952d0aacf4518301f940ee3"
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
    role: "lists B25 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "B25, Fulton St"
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
The [[route:route_b25|B25]] is a Brooklyn local bus route operating primarily on Fulton Street. It is listed in the ACE Routes dataset with route identifier "B25" [[cite:ace_routes_dataset_dictionary#p001_b0089|ACE dataset B25 item]] and is part of a dataset containing 84 route entries [[cite:ace_routes_dataset_dictionary#p001_b0099|ACE dataset cardinality of 84]].

The B25 was a participant in the MTA's ABLE (Automated Bus Lane Enforcement) mobile camera program through 2023, one of 21 routes equipped with on-bus enforcement cameras [[cite:bus_lane_camera_report_2024#p008_c0003|ABLE cameras on 21 routes through 2023]]. The ABLE system captures no-standing and no-parking violations by recording vehicles stopped in bus lanes using onboard cameras, requiring two buses to observe the same vehicle at the same GPS location at least five minutes apart before a violation is issued [[cite:bus_lane_camera_report_2024#p009_c0001|ABLE violation capture mechanism]].

Bus lane enforcement cameras on the B25 were activated on December 12, 2022, as part of a broader expansion that added cameras to 300 additional buses and 9 new routes [[cite:meeting_doc_102836#p015_c0011|B25 camera activation December 12, 2022]]. The B25 was among the final three routes activated in this push, alongside the B62 and B42 [[cite:meeting_doc_102836#p015_c0011|final three routes B25, B62, B42]]. The MTA's Automated Camera Enforcement (ACE) program subsequently lists the B25 as an active enforcement route on Fulton Street [[cite:mta_automated_camera_enforcement#p001_b0001|ACE B25 on Fulton St]].

The B25 is also documented in select bus lane camera enforcement corridor lists maintained by the New York City Department of Transportation, appearing alongside routes such as the B26, B42, and B62 in Brooklyn ABLE route records [[cite:bus_lane_camera_report_2024#p008_c0004|B25 in ABLE route list]].
<!-- mta-wiki:writer:end -->
