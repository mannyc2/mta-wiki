---
managed_by: "mta-wiki-materializer"
record_id: "route_bx35"
record_kind: "route"
display_name: "BX35 - ABLE route"
source_id: "ace_routes_dataset_dictionary"
source_ids:
  - "2012_09_webster_sbs_cac3_workshop"
  - "2013_02_sbs_webster_bx_cb3"
  - "2014_03_11_brt_webster_cb3"
  - "ace_routes_dataset_dictionary"
  - "bus_lane_camera_report_2024"
  - "bx_cb3_projects_feb112020"
  - "bx_cb4_projects_feb052020"
  - "bx_cb5_projects_dec032019"
  - "meeting_doc_111811"
  - "meeting_doc_37081"
  - "mta_automated_camera_enforcement"
local_observation_id: "route_bx35"
local_observation_ids:
  - "route_able_bx35"
  - "route_bx35"
  - "route_bx35_2012_09_webster"
  - "route_bx35_2013_02_sbs_cb3"
  - "route_bx35_2014_03_11_cb3"
  - "route_bx35_37081"
  - "route_bx35_ace"
  - "route_bx35_bx_cb3_feb112020"
  - "route_bx35_bx_cb4"
  - "route_bx35_bx_cb5"
  - "route_meeting_doc_111811_bx35"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-23T13:31:57.966Z"
raw_text: "BX35 ABLE camera route through 2023"
submission_ids:
  - "sub_0fb2887f201e9c0e"
  - "sub_154c692559e3cf45"
  - "sub_50845d6c6c3410d5"
  - "sub_631b9417b98d0184"
  - "sub_681f8835311c8f26"
  - "sub_959d1c389544f72e"
  - "sub_a08d30020747eca8"
  - "sub_b070acf44426f309"
  - "sub_f6b8d56bd471243c"
  - "sub_f9134071d8bfffe1"
  - "sub_fb4437b708022369"
payload:
  _merged_field_values:
    description:
      - "Existing bus route on Webster Avenue at East 167th Street and East Fordham Road"
      - "Bx35 bus route mentioned at E 167 St SBS station diagram"
      - "Bx35 stop changes at E 167 St and E 168 St associated with Webster Avenue SBS"
      - "Bus route on E 167th St/E 168th St corridor; carries 22,000 weekday riders; average speed 4.7 mph AM peak, 4.3 mph PM peak"
      - "Bus route on Washington Bridge corridor."
      - "Crosstown route, carrying approximately 19,000 weekday riders with key connections to 22 bus routes and the 1, A, 4, B, D subway lines. First ABLE route of 2023."
      - "Route serving the 181st Street Busway in Washington Heights"
      - "Bx35 bus route serving E 167th St / E 168th St corridor with crosstown connections to 8 bus routes and 4, B/D trains"
    route_id:
      - "BX35"
      - "Bx35"
    route_label:
      - "BX35"
      - "Bx35"
    route_type_normalized:
      - "bus"
      - "local"
      - "select_bus_service"
    service_variant:
      - "local"
      - "sbs"
  borough: "Bronx"
  borough_normalized: "bronx"
  description: "Existing bus route on Webster Avenue at East 167th Street and East Fordham Road"
  note: "ABLE cameras operated on this route through 2023"
  program: "ABLE"
  route: "BX35"
  route_id: "BX35"
  route_label: "BX35"
  route_name: "BX35"
  route_record_scope: "true_route"
  route_record_scope_reason: "local_sbs_context_spillover"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "E 167 St / W 181 St"
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
    block_id: "p001_b0085"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0085"
    page_number: 1
    role: "value"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"item\": \"BX35\","
    text_sha256: "sha256:f3e4bc0adc33cd31b98192a0c8670e2ec594068fbf41807cf5036052bce9f339"
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
    role: "lists Bx35 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "Bx35, E 167 St / W 181 St"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p001_c0004"
    evidence_id: "2012_09_webster_sbs_cac3_workshop#p001_c0004"
    page_number: 1
    source_id: "2012_09_webster_sbs_cac3_workshop"
    source_path: "raw/sources/2012_09_webster_sbs_cac3_workshop/blocks.jsonl"
    source_quote: "Existing Bus Stop for SB Bx 41 and WB Bx 35"
    text_sha256: "sha256:a9fd459f48734a08fd1811777d4d67257e683606c04b156305be7c151e583b83"
    text_source: "raw_text"
  -
    block_id: "p001_c0005"
    evidence_id: "2012_09_webster_sbs_cac3_workshop#p001_c0005"
    page_number: 1
    source_id: "2012_09_webster_sbs_cac3_workshop"
    source_path: "raw/sources/2012_09_webster_sbs_cac3_workshop/blocks.jsonl"
    source_quote: "Bus Stop for Local NB Bx 41 and EB Bx 35 Routes"
    text_sha256: "sha256:e01c0a3c7077e3335c627687a72ec6bcd8fce0e36d9dd5b4d05e0218fce86db1"
    text_source: "raw_text"
  -
    block_id: "p022_c0002"
    evidence_id: "2014_03_11_brt_webster_cb3#p022_c0002"
    page_number: 22
    source_id: "2014_03_11_brt_webster_cb3"
    source_path: "raw/sources/2014_03_11_brt_webster_cb3/blocks.jsonl"
    source_quote: "E 167 St running vertically and Bx35 running horizontally"
    text_sha256: "sha256:431be40665ee43afba2016231bd4c5c9ab21091c7af0384b2107b6c68863f54b"
    text_source: "raw_text"
  -
    block_id: "p029_c0003"
    evidence_id: "2013_02_sbs_webster_bx_cb3#p029_c0003"
    page_number: 29
    source_id: "2013_02_sbs_webster_bx_cb3"
    source_path: "raw/sources/2013_02_sbs_webster_bx_cb3/blocks.jsonl"
    source_quote: "Relocate WB Bx35 stop to E 167 St"
    text_sha256: "sha256:4918a03a9ed7ae386291a3a08bc69164876d8cd2c9837e8d10d7580ad2faae25"
    text_source: "raw_text"
  -
    block_id: "p028_c0003"
    evidence_id: "bx_cb4_projects_feb052020#p028_c0003"
    page_number: 28
    role: "route_data"
    source_id: "bx_cb4_projects_feb052020"
    source_path: "raw/sources/bx_cb4_projects_feb052020/blocks.jsonl"
    text_sha256: "sha256:7e3fa798f0ba468507e54525bdc79cf521ed47d4d3ec4311f65edba3f58af63b"
    text_source: "raw_text"
  -
    block_id: "p020_c0003"
    evidence_id: "bx_cb5_projects_dec032019#p020_c0003"
    page_number: 20
    role: "route_on_washington_bridge"
    source_id: "bx_cb5_projects_dec032019"
    source_path: "raw/sources/bx_cb5_projects_dec032019/blocks.jsonl"
    text_sha256: "sha256:271e0cfe188db91ad7a79d7f4763d967cba75e69eeb3995fbc03a6c4dbb6db64"
    text_source: "raw_text"
  -
    block_id: "p015_c0011"
    evidence_id: "meeting_doc_111811#p015_c0011"
    page_number: 15
    source_id: "meeting_doc_111811"
    source_path: "raw/sources/meeting_doc_111811/blocks.jsonl"
    source_quote: "the MTA rolled out the first of our 2023 ABLE routes, the Bx35. The Bx35 is an essential crosstown route for the Bronx, carrying approximately 19,000 weekday riders with key connections to 22 bus routes and the 1, A, 4, B, D subway lines."
    text_sha256: "sha256:bc1b1842d605c01386975278f03ab1ca621d4bc1af3d9b80636a63f360efeda5"
    text_source: "raw_text"
  -
    block_id: "p041_c0004"
    evidence_id: "meeting_doc_37081#p041_c0004"
    page_number: 41
    source_id: "meeting_doc_37081"
    source_path: "raw/sources/meeting_doc_37081/blocks.jsonl"
    text_sha256: "sha256:b7d7d29f319d32042be91932edff608f71bb2171a763b59707977e955a17b0e0"
    text_source: "raw_text"
  -
    block_id: "p008_c0003"
    evidence_id: "bx_cb3_projects_feb112020#p008_c0003"
    page_number: 8
    role: "route_description"
    source_id: "bx_cb3_projects_feb112020"
    source_path: "raw/sources/bx_cb3_projects_feb112020/blocks.jsonl"
    text_sha256: "sha256:5cbecd7f4bc83e522c8728599b7ec26d87bb02ec4146a0737cd23f31b84321b6"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->

<!-- mta-wiki:writer:end -->
