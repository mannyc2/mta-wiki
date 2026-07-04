---
managed_by: "mta-wiki-materializer"
record_id: "route_sim8-42nd-st"
record_kind: "route"
display_name: "SIM8"
source_id: "42nd_st_cb4_jun192019"
source_ids:
  - "42nd_st_cb4_jun192019"
  - "42nd_st_cb6_jun032019"
  - "meeting_doc_176441"
local_observation_id: "route_sim8_42nd_st"
local_observation_ids:
  - "route_sim8_42nd_st"
  - "route_sim8_meeting_doc_176441"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-21T18:00:32.209Z"
submission_ids:
  - "sub_20cd0f1c573bf9da"
  - "sub_2a0751d399b60bd8"
  - "sub_331d3829307d1fb4"
payload:
  _merged_field_values:
    description:
      - "Staten Island Express Bus Route using 42nd Street"
      - "Staten Island Express Bus route using 42nd Street"
      - "Weekday peak period, peak direction express bus route between Staten Island's South Shore along Richmond Avenue and Midtown Manhattan"
    route_type:
      - "express"
      - "express bus"
  borough: "Staten Island"
  borough_normalized: "staten_island"
  boroughs:
    - "Staten Island"
    - "Manhattan"
  boroughs_normalized:
    - "staten_island"
    - "manhattan"
  description: "Staten Island Express Bus Route using 42nd Street"
  route_id: "SIM8"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "express"
  route_type_normalized: "express"
  service_variant: "express"
evidence_refs:
  -
    block_id: "p006_c0003"
    evidence_id: "42nd_st_cb4_jun192019#p006_c0003"
    page_number: 6
    role: "route_group"
    source_id: "42nd_st_cb4_jun192019"
    source_path: "raw/sources/42nd_st_cb4_jun192019/blocks.jsonl"
    text_sha256: "sha256:e0bf9724a218964ddc3b79fc0695556dd165023063d827d16ae86676ab72b8ba"
    text_source: "raw_text"
  -
    block_id: "p006_c0001"
    evidence_id: "42nd_st_cb4_jun192019#p006_c0001"
    page_number: 6
    role: "map"
    source_id: "42nd_st_cb4_jun192019"
    source_path: "raw/sources/42nd_st_cb4_jun192019/blocks.jsonl"
    text_sha256: "sha256:24fae3e828c9c36a75003d904091028035bc7b69c52bbb018019524eaaa30dd0"
    text_source: "raw_text"
  -
    block_id: "p007_c0001"
    evidence_id: "42nd_st_cb6_jun032019#p007_c0001"
    page_number: 7
    role: "map_label"
    source_id: "42nd_st_cb6_jun032019"
    source_path: "raw/sources/42nd_st_cb6_jun032019/blocks.jsonl"
    text_sha256: "sha256:a57aab32a86648a0b25920d2a74bbe3efe4b311747c312daee31275d806e1fc7"
    text_source: "raw_text"
  -
    block_id: "p007_c0003"
    evidence_id: "42nd_st_cb6_jun032019#p007_c0003"
    page_number: 7
    role: "route_list"
    source_id: "42nd_st_cb6_jun032019"
    source_path: "raw/sources/42nd_st_cb6_jun032019/blocks.jsonl"
    text_sha256: "sha256:e0bf9724a218964ddc3b79fc0695556dd165023063d827d16ae86676ab72b8ba"
    text_source: "raw_text"
  -
    block_id: "p001_c0005"
    evidence_id: "meeting_doc_176441#p001_c0005"
    page_number: 1
    source_id: "meeting_doc_176441"
    source_path: "raw/sources/meeting_doc_176441/blocks.jsonl"
    text_sha256: "sha256:fecaa1d0dd3fbaea0e9afb94909e99039b88b8aae2cf7f3ca742c23f3befa9b3"
    text_source: "raw_text"
  -
    block_id: "p002_c0009"
    evidence_id: "meeting_doc_176441#p002_c0009"
    page_number: 2
    source_id: "meeting_doc_176441"
    source_path: "raw/sources/meeting_doc_176441/blocks.jsonl"
    text_sha256: "sha256:8e19d6cf863212a77a795becdf673d42f38fedef8b403791de234bdfb3348bf7"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
[[route:route_sim8-42nd-st|SIM8]] is one of six Staten Island Express Bus routes that use 42nd Street, alongside the SIM8X, SIM22, SIM25, SIM26, and SIM30 [[cite:42nd_st_cb4_jun192019#p006_c0003|8 MTA bus routes use 42nd St]]. The SIM8 and its variant the SIM8X are weekday peak period, peak direction express bus routes operating between Staten Island's South Shore along Richmond Avenue and Midtown Manhattan [[cite:meeting_doc_176441#p001_c0005|SIM4 and SIM8 description]][[cite:meeting_doc_176441#p002_c0009|SIM8 serves Midtown]]. The SIM8X variant was introduced as part of the August 2018 Staten Island Express Bus Redesign to leverage the Staten Island Mall Park-and-Ride, making only two stops on Staten Island but serving all SIM8 stops in Manhattan [[cite:meeting_doc_176441#p001_c0006|SIM8X established in 2018 redesign]][[cite:meeting_doc_176441#p002_c0010|SIM8X two stops on Staten Island]]. [[metric:metric_sim8x-load-factor-25pct|SIM8X average load factor 25%]] and [[metric:metric_sim4x-load-factor-15pct|SIM4X average load factor 15%]] indicate the X-variant trips were underutilized [[cite:meeting_doc_176441#p001_c0007|SIM8X 25% full, SIM4X 15% full]]. A staff summary dated June 17, 2025 recommended discontinuing the SIM8X and SIM4X variants and reinvesting into two full-route SIM8 trips (one each to Manhattan and Staten Island) and seven full-route SIM4 trips [[cite:meeting_doc_176441#p001_c0009|discontinue X variants, reinvest into full-route trips]]. [[metric:metric_net-decrease-operating-costs-2-5m|Net decrease in operating costs $2.5M/year]] would result [[cite:meeting_doc_176441#p001_c0011|net decrease $2.5M per year]], with implementation planned for Fall 2025 [[cite:meeting_doc_176441#p001_c0013|Fall 2025 implementation]]. On 42nd Street, [[metric:metric_bus-people-79-percent|Buses carry 79% of people on 42nd St using 33% of street space]], and the M42 local route experiences running times that nearly double overnight speeds during the day [[cite:42nd_st_cb4_jun192019#p008_c0002|79% people in 33% street space]][[cite:42nd_st_cb4_jun192019#p010_c0005|bus travel times nearly double overnight]].
<!-- mta-wiki:writer:end -->
