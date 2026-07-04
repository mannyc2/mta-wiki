---
managed_by: "mta-wiki-materializer"
record_id: "route_sim8x-42nd-st"
record_kind: "route"
display_name: "SIM8X"
source_id: "42nd_st_cb4_jun192019"
source_ids:
  - "42nd_st_cb4_jun192019"
  - "42nd_st_cb6_jun032019"
  - "meeting_doc_176441"
local_observation_id: "route_sim8x_42nd_st"
local_observation_ids:
  - "route_sim8x_42nd_st"
  - "route_sim8x_meeting_doc_176441"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-21T18:00:34.207Z"
submission_ids:
  - "sub_5be3d3201cd7a2ec"
  - "sub_9c0b1144ea1b4ea5"
  - "sub_ea425d0b79c1227c"
payload:
  _merged_field_values:
    description:
      - "Staten Island Express Bus Route using 42nd Street"
      - "Staten Island Express Bus route using 42nd Street"
      - "Short variant of SIM8 serving only two stops on Staten Island (Staten Island Mall Park-and-Ride and one other stop) but all same SIM8 stops in Midtown Manhattan"
    route_type:
      - "express"
      - "express bus variant"
    route_type_normalized:
      - "express"
      - "express_bus_variant"
  borough: "Staten Island"
  borough_normalized: "staten_island"
  boroughs:
    - "Staten Island"
    - "Manhattan"
  boroughs_normalized:
    - "staten_island"
    - "manhattan"
  description: "Staten Island Express Bus Route using 42nd Street"
  route_id: "SIM8X"
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
    block_id: "p001_c0006"
    evidence_id: "meeting_doc_176441#p001_c0006"
    page_number: 1
    source_id: "meeting_doc_176441"
    source_path: "raw/sources/meeting_doc_176441/blocks.jsonl"
    text_sha256: "sha256:f1f8826518802baaf2ed1d0debbe337ef8bcd79229f5df7bfb8e4c992bf944de"
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
[[route:route_sim8x-42nd-st|SIM8X]] is a Staten Island Express Bus route that uses 42nd Street in Manhattan, identified as one of six Staten Island express routes serving the 42nd Street corridor alongside the [[cite:42nd_st_cb4_jun192019#p006_c0003|SIM8, SIM22, SIM25, SIM26, and SIM30]]. It is a short variant of the full-route SIM8, serving only two bus stops on Staten Island (at the Staten Island Mall Park-and-Ride and a stop added near its first/last Staten Island stop in January 2019) but making all the same SIM8 stops in Midtown Manhattan [[cite:meeting_doc_176441#p001_c0006|SIM8X stop pattern]] [[cite:meeting_doc_176441#p002_c0010|January 2019 stop addition]]. The SIM8X was established as part of the Staten Island Express Bus Redesign in August 2018 to experiment with leveraging the Staten Island Mall Park-and-Ride to attract ridership [[cite:meeting_doc_176441#p001_c0006|2018 Redesign]]. The SIM8X and SIM4X trips have been found to be underutilized [[cite:meeting_doc_176441#p001_c0007|underutilized trips]]. The [[metric:metric_sim8x-load-factor-25pct|SIM8X average load factor]] is approximately 25% [[cite:meeting_doc_176441#p001_c0007|25% load factor]]. A June 2025 MTA staff summary proposed discontinuing the SIM8X and reinvesting into two full-route SIM8 trips (one each to Manhattan and Staten Island), with a net decrease in operating costs of [[metric:metric_net-decrease-operating-costs-2-5m|$2.5 million per year]] and a target implementation date of Fall 2025 [[cite:meeting_doc_176441#p001_c0009|discontinuation recommendation]] [[cite:meeting_doc_176441#p001_c0011|$2.5M cost savings]] [[cite:meeting_doc_176441#p001_c0013|Fall 2025 implementation]]. As part of the 42nd Street Transit Improvements project under the Better Buses Action Plan, the SIM8X was one of seven routes served along the 2.0-mile corridor, which carries about 16,000 daily bus passengers and had average bus speeds of 4.2 mph eastbound AM peak and 2.9 mph westbound PM peak [[cite:better_buses_action_plan_2019#p029_c0006|corridor statistics]]. [[metric:metric_bus-people-79-percent|Buses carry 79% of people on 42nd St using 33% of street space]] [[cite:42nd_st_cb4_jun192019#p008_c0002|79% people 33% space]].
<!-- mta-wiki:writer:end -->
