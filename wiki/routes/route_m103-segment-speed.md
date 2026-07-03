---
managed_by: "mta-wiki-materializer"
record_id: "route_m103-segment-speed"
record_aliases:
  - "route_m103"
record_kind: "route"
display_name: "M103"
source_id: "segment_speed_methodology_2024"
source_ids:
  - "2012_09_19_125th_st_sbs_public_workshop_summary"
  - "2014_05_05_brt_thirdave_cb6_presentation"
  - "2014_12_01_brt_thirdave_cb6_presentation"
  - "42nd_st_cb6_sep042019"
  - "bus_forward_lex_ave_96th_60th_st_june2019"
  - "bus_forward_lex_ave_96th_60th_st_may2019"
  - "lexington_ave_60_st_52_st_cb8_oct2025"
  - "lexington_ave_60_st_52_st_oct2025"
  - "lexington_ave_60_st_52_st_sept2025"
  - "segment_speed_methodology_2024"
local_observation_id: "route_m103_segment_speed"
local_observation_ids:
  - "route_125th_st_m103"
  - "route_42nd_st_m103"
  - "route_m103_2014_05_05"
  - "route_m103_2014_12_01"
  - "route_m103_lex_ave"
  - "route_m103_lex_ave_60_52"
  - "route_m103_lex_ave_60th_52nd"
  - "route_m103_lex_ave_oct2025"
  - "route_m103_segment_speed"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-19T18:54:19.046Z"
raw_text: "The M103 duplicates route of other buses on 125th Street and contributes to the congestions."
submission_ids:
  - "sub_1238f2bfc6f114db"
  - "sub_274d08cd1cb9f41b"
  - "sub_6b1ac2a6f022e2c9"
  - "sub_9528ea4fbeb44cac"
  - "sub_a96f8a48a82cf8a4"
  - "sub_d193e79a5f359b7b"
  - "sub_d8d503594c577600"
  - "sub_d9bb56c237829fcc"
  - "sub_e099d375207a2df2"
  - "sub_ff7509cf19576edb"
payload:
  _merged_field_values:
    description:
      - "MTA bus route in Manhattan; referenced in a sample data row of the Bus Route Segment Speeds Dataset showing speed of 6.00 mph between 3 AV/E 23 ST and 3 AV/E 42 ST at hour 8 on Thursday May 1, 2025; also shown in a schedule figure"
      - "Bus route operating on 125th Street; duplicates route of other buses on 125th Street"
      - "Local bus route on Third Avenue with 59,000 daily riders on M101, M102, M103 combined"
      - "Bus route that transfers with M42 at Lexington Ave and 42nd Street"
      - "Lexington Ave bus route"
      - "Local bus route serving Lexington Ave"
      - "Local bus route traveling on Lexington Avenue between 60th St and 52nd St"
      - "MTA bus route that travels on Lexington Avenue between 60th Street and 52nd Street"
    route_type:
      - "Local"
      - "local"
    route_type_normalized:
      - "local"
      - "bus"
  borough: "Manhattan"
  borough_normalized: "manhattan"
  description: "MTA bus route in Manhattan; referenced in a sample data row of the Bus Route Segment Speeds Dataset showing speed of 6.00 mph between 3 AV/E 23 ST and 3 AV/E 42 ST at hour 8 on Thursday May 1, 2025; also shown in a schedule figure"
  route_id: "M103"
  route_name: "M103"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "Local"
  route_type_normalized: "local"
  service_variant: "local"
evidence_refs:
  -
    block_id: "p001_b0001"
    evidence_id: "segment_speed_methodology_2024#p001_b0001"
    page_number: 1
    role: "sample_data"
    source_id: "segment_speed_methodology_2024"
    source_path: "raw/sources/segment_speed_methodology_2024/blocks.jsonl"
    source_quote: "2025 5 1 M103 Local 8 3 AV/E 23 ST 3 AV/ E 42 ST 11 6.00"
    text_sha256: "sha256:44b5cb0777ad8ea3dfad0116e0156a31618a34b9f542523c954a22b1c6b4e5f5"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "segment_speed_methodology_2024#p001_b0001"
    page_number: 1
    role: "figure_reference"
    source_id: "segment_speed_methodology_2024"
    source_path: "raw/sources/segment_speed_methodology_2024/blocks.jsonl"
    source_quote: "the M103 schedule shown in Figure 1"
    text_sha256: "sha256:44b5cb0777ad8ea3dfad0116e0156a31618a34b9f542523c954a22b1c6b4e5f5"
    text_source: "raw_text"
  -
    block_id: "p004_c0009"
    evidence_id: "2012_09_19_125th_st_sbs_public_workshop_summary#p004_c0009"
    page_number: 4
    source_id: "2012_09_19_125th_st_sbs_public_workshop_summary"
    source_path: "raw/sources/2012_09_19_125th_st_sbs_public_workshop_summary/blocks.jsonl"
    text_sha256: "sha256:c6b0880c7a3c0018f2a0c9899ba0e8925267a9718ac845954c96c40680dbe4b1"
    text_source: "raw_text"
  -
    block_id: "p002_c0002"
    evidence_id: "2014_05_05_brt_thirdave_cb6_presentation#p002_c0002"
    page_number: 2
    source_id: "2014_05_05_brt_thirdave_cb6_presentation"
    source_path: "raw/sources/2014_05_05_brt_thirdave_cb6_presentation/blocks.jsonl"
    source_quote: "59,000 daily riders on M101, M102, M103"
    text_sha256: "sha256:ed2835379d78c2b4f8138d520f90848e3a37f5d1bc8e70ca52031493f5e2e254"
    text_source: "raw_text"
  -
    block_id: "p002_c0002"
    evidence_id: "2014_12_01_brt_thirdave_cb6_presentation#p002_c0002"
    page_number: 2
    role: "mentioned_route"
    source_id: "2014_12_01_brt_thirdave_cb6_presentation"
    source_path: "raw/sources/2014_12_01_brt_thirdave_cb6_presentation/blocks.jsonl"
    text_sha256: "sha256:58c526b058597ad9dba85dd521eaf76f2603b2a2bd8b98142b32fa69e3261dcb"
    text_source: "raw_text"
  -
    block_id: "p017_c0003"
    evidence_id: "42nd_st_cb6_sep042019#p017_c0003"
    page_number: 17
    role: "mentioned"
    source_id: "42nd_st_cb6_sep042019"
    source_path: "raw/sources/42nd_st_cb6_sep042019/blocks.jsonl"
    text_sha256: "sha256:ed92b13c6275901e045bdce8d1ebdbd4112db6bb8a810334c2948d97b0741120"
    text_source: "raw_text"
  -
    block_id: "p008_c0002"
    evidence_id: "bus_forward_lex_ave_96th_60th_st_may2019#p008_c0002"
    page_number: 8
    source_id: "bus_forward_lex_ave_96th_60th_st_may2019"
    source_path: "raw/sources/bus_forward_lex_ave_96th_60th_st_may2019/blocks.jsonl"
    text_sha256: "sha256:7813c0082ebc33613b41b1229fa9c2b8f889715923bf298e6c7f41adb9641c17"
    text_source: "raw_text"
  -
    block_id: "p008_c0002"
    evidence_id: "bus_forward_lex_ave_96th_60th_st_june2019#p008_c0002"
    page_number: 8
    role: "route_list"
    source_id: "bus_forward_lex_ave_96th_60th_st_june2019"
    source_path: "raw/sources/bus_forward_lex_ave_96th_60th_st_june2019/blocks.jsonl"
    text_sha256: "sha256:7813c0082ebc33613b41b1229fa9c2b8f889715923bf298e6c7f41adb9641c17"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "lexington_ave_60_st_52_st_oct2025#p004_c0002"
    page_number: 4
    role: "route_list"
    source_id: "lexington_ave_60_st_52_st_oct2025"
    source_path: "raw/sources/lexington_ave_60_st_52_st_oct2025/blocks.jsonl"
    text_sha256: "sha256:7c01bb2a2f7422e08cd4da1ad12a26c6eee57fc4129184b9b6b7a309a350d704"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "lexington_ave_60_st_52_st_cb8_oct2025#p004_c0002"
    page_number: 4
    role: "routes list"
    source_id: "lexington_ave_60_st_52_st_cb8_oct2025"
    source_path: "raw/sources/lexington_ave_60_st_52_st_cb8_oct2025/blocks.jsonl"
    text_sha256: "sha256:7c01bb2a2f7422e08cd4da1ad12a26c6eee57fc4129184b9b6b7a309a350d704"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "lexington_ave_60_st_52_st_sept2025#p004_c0002"
    page_number: 4
    role: "route_list"
    source_id: "lexington_ave_60_st_52_st_sept2025"
    source_path: "raw/sources/lexington_ave_60_st_52_st_sept2025/blocks.jsonl"
    text_sha256: "sha256:7c01bb2a2f7422e08cd4da1ad12a26c6eee57fc4129184b9b6b7a309a350d704"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->

<!-- mta-wiki:writer:end -->
