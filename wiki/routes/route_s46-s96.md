---
managed_by: "mta-wiki-materializer"
record_id: "route_s46-s96"
record_kind: "route"
display_name: "S46/S96 (NYCT)"
source_id: "fare_free_bus_pilot_evaluation"
source_ids:
  - "fare_free_bus_pilot_evaluation"
  - "meeting_doc_147096"
  - "meeting_doc_160441"
  - "mta_automated_camera_enforcement"
  - "victory_blvd_bay_st_wild_ave_winter2025"
local_observation_id: "route_s46_s96"
local_observation_ids:
  - "route_meeting_doc_160441_s46_s96"
  - "route_s46_ace"
  - "route_s46_s96"
  - "route_s46_s96_eval"
  - "route_s46_victory_blvd"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-22T22:47:12.914Z"
raw_text: "S46/96 route in Staten Island, passing through St. George"
submission_ids:
  - "sub_3a5ca26c36fa8d99"
  - "sub_aa491aa7d3ec3e6e"
  - "sub_bb6d2f651b8f9be3"
  - "sub_e151fab7a3609190"
  - "sub_e888060a7085c150"
payload:
  _merged_field_values:
    description:
      - "Fare-free bus pilot route in Staten Island, passing through St. George"
      - "Castleton Avenue • Frequency increases and running time adjustments"
      - "Fare-Free Bus Pilot route in Staten Island, connecting St. George to Jamaica"
    route_id:
      - "S46"
      - "S46/S96"
    route_label:
      - "S46/S96"
      - "S46"
    route_type:
      - "local"
      - "local and limited"
    route_type_normalized:
      - "bus"
      - "local"
      - "local_and_limited"
    service_variant:
      - "local"
      - "local_limited"
  borough: "Staten Island"
  borough_normalized: "staten_island"
  description: "Fare-free bus pilot route in Staten Island, passing through St. George"
  operator: "NYCT"
  route_id: "S46"
  route_label: "S46/S96"
  route_record_scope: "aggregate_list_context"
  route_record_scope_reason: "routes_array_aggregate"
  route_type: "local"
  route_type_normalized: "bus"
  routes:
    - "S46"
    - "S96"
  service_variant: "local"
  streets: "Castleton Av"
evidence_refs:
  -
    block_id: "p002_c0006"
    evidence_id: "fare_free_bus_pilot_evaluation#p002_c0006"
    page_number: 2
    role: "route_map"
    source_id: "fare_free_bus_pilot_evaluation"
    source_path: "raw/sources/fare_free_bus_pilot_evaluation/blocks.jsonl"
    text_sha256: "sha256:16396d801f9d7bb8298c103e77727bf74ad2bd66ecd9999b6a8c36e83a2797be"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists S46 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "S46, Castleton Av"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
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
    block_id: "p002_c0006"
    evidence_id: "meeting_doc_147096#p002_c0006"
    page_number: 2
    source_id: "meeting_doc_147096"
    source_path: "raw/sources/meeting_doc_147096/blocks.jsonl"
    text_sha256: "sha256:301d5245c345132deb2f6d40e5ec4afeeeaadc11052cd0479f325223ff183db9"
    text_source: "raw_text"
  -
    block_id: "p004_c0003"
    evidence_id: "meeting_doc_147096#p004_c0003"
    page_number: 4
    source_id: "meeting_doc_147096"
    source_path: "raw/sources/meeting_doc_147096/blocks.jsonl"
    text_sha256: "sha256:24e20d5d01061586336bfbc95f0a79b198a9703e193aee6df12156bcfb0f0528"
    text_source: "raw_text"
  -
    block_id: "p020_c0002"
    evidence_id: "meeting_doc_147096#p020_c0002"
    page_number: 20
    source_id: "meeting_doc_147096"
    source_path: "raw/sources/meeting_doc_147096/blocks.jsonl"
    text_sha256: "sha256:3b77da7b2408604f20f2da907b7fd76fd6eeae69c9f547d97e66378b0a1cbbe6"
    text_source: "raw_text"
  -
    block_id: "p008_c0004"
    evidence_id: "victory_blvd_bay_st_wild_ave_winter2025#p008_c0004"
    page_number: 8
    source_id: "victory_blvd_bay_st_wild_ave_winter2025"
    source_path: "raw/sources/victory_blvd_bay_st_wild_ave_winter2025/blocks.jsonl"
    source_quote: "• S46, S48, S61, S62, S66"
    text_sha256: "sha256:b991f766e8f6efe7065949614291834c892347c1f280109bfa95108bf4ecb735"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The [[route:route_s46-s96|S46/S96 (NYCT)]] is a local and limited-stop bus route on Castleton Avenue in Staten Island, operated by MTA New York City Transit [[cite:meeting_doc_160441#p004_c0004|listed as S46/S96 on Castleton Avenue]]. It was selected as Staten Island's fare-free bus pilot route, running from September 24, 2023 through August 2024, serving the St. George area [[cite:fare_free_bus_pilot_evaluation#p002_c0006|pilot map showing S46/96 in Staten Island]][[cite:meeting_doc_147096#p002_c0005|pilot start and end dates]].

During the pilot, the route's total weekday ridership grew by +22%, from 8,228 pre-pilot riders to 10,074 during the pilot period [[cite:meeting_doc_147096#p004_c0003|S46/S96 weekday ridership table]]. Weekend ridership increased by +32%, rising from 3,586 to 4,740 [[cite:fare_free_bus_pilot_evaluation#p005_c0006|S46/S96 weekend ridership table]]. However, service reliability declined: the share of scheduled buses actually delivered during peak hours fell from 94.3% pre-pilot to 90.0% during the pilot, a drop of 4.3 percentage points -- the largest decline among the five pilot routes [[cite:meeting_doc_147096#p011_c0004|Service Delivered table for S46/S96]]. The total cost of the S46/S96 pilot was $2,641,000 [[cite:fare_free_bus_pilot_evaluation#p019_c0002|pilot cost table]].

Separately, the route is identified for service enhancements supporting Congestion Pricing: the S46/S96 was selected for frequency increases and running time adjustments, with implementation planned in the Summer 2025 schedule [[cite:meeting_doc_160441#p004_c0004|listed as item 15 among local bus routes]][[cite:meeting_doc_160441#p005_c0006|summer 2025 implementation]]. The S46 also operates on Victory Boulevard and is listed among routes served by that corridor's transit and safety improvement initiative [[cite:victory_blvd_bay_st_wild_ave_winter2025#p008_c0004|S46 listed among Victory Blvd routes]], and is included in the MTA's Automated Camera Enforcement (ACE) program on Castleton Avenue [[cite:mta_automated_camera_enforcement#p001_b0001|ACE route listing with Castleton Av]].
<!-- mta-wiki:writer:end -->
