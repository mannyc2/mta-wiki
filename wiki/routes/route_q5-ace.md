---
managed_by: "mta-wiki-materializer"
record_id: "route_q5-ace"
record_aliases:
  - "route_q5"
record_kind: "route"
display_name: "Q5 on Merrick Boulevard, Queens (TSP in development)"
source_id: "mta_automated_camera_enforcement"
source_ids:
  - "mta_automated_camera_enforcement"
  - "queens_proposed_final_plan_addendum_2024"
  - "tsp_status_2017"
local_observation_id: "route_q5_ace"
local_observation_ids:
  - "route_q5_ace"
  - "route_q5_addendum_2024"
  - "route_q5_tsp_2017"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-09T01:57:41.305Z"
raw_text: "Underlying local service provided by the Q5"
submission_ids:
  - "sub_000d39f5358c56d3"
  - "sub_1d00bd5dcb8a4c19"
  - "sub_cebb904fd691268b"
payload:
  _merged_field_values:
    route_type:
      - "Local"
      - "local bus"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Queens"
  borough_normalized: "queens"
  description: "Underlying local service for Q85 Rush Route"
  note: "Hook Creek Blvd / Sunrise Highway on weekends only"
  route: "Q5"
  route_id: "Q5"
  route_label: "Q5"
  route_name: "Q5"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "Local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "Merrick Blvd"
evidence_refs:
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists Q5 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "Q5, Merrick Blvd (and Hook Creek Blvd / Sunrise Highway on weekends only)"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p006_c0004"
    evidence_id: "queens_proposed_final_plan_addendum_2024#p006_c0004"
    page_number: 6
    role: "underlying_service"
    source_id: "queens_proposed_final_plan_addendum_2024"
    source_path: "raw/sources/queens_proposed_final_plan_addendum_2024/blocks.jsonl"
    source_quote: "Underlying local service provided by the Q5"
    text_sha256: "sha256:3adfb8c167dc119681f7d255518ee72024582a4c2a92a73c0861111cf5b3ef7e"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "tsp_status_2017#p001_b0001"
    page_number: 1
    role: "route_mention"
    source_id: "tsp_status_2017"
    source_path: "raw/sources/tsp_status_2017/blocks.jsonl"
    source_quote: "Q5 on Merrick Boulevard"
    text_sha256: "sha256:7b2bb88cd8d09fce574b6d49d2311ecfe755511bbc75b79fd88672093ff65ab7"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
[[route:route_q5-ace|Q5 on Merrick Boulevard, Queens (TSP in development)]] is a local bus route operating on Merrick Boulevard in Queens. A 2017 NYC DOT report listed the Q5 on Merrick Boulevard as a route in development for Transit Signal Priority (TSP), a technology that adjusts traffic signals in response to bus movements [[cite:tsp_status_2017#p001_b0001|DOT Releases Status Report on Transit Signal Priority]]. The same report noted that TSP most benefits two-way streets outside Manhattan and complements all-door boarding and dedicated bus lanes [[cite:tsp_status_2017#p001_b0001|TSP complements other measures]].

The Q5 is included in the MTA's Automated Camera Enforcement (ACE) program, which uses bus-mounted cameras to issue violations to vehicles blocking bus lanes, bus stops, or double-parked along bus routes [[cite:mta_automated_camera_enforcement#p001_b0001|ACE bus routes listing Q5]]. The ACE program lists the Q5's major streets as Merrick Boulevard, with Hook Creek Boulevard and Sunrise Highway used on weekends only [[cite:mta_automated_camera_enforcement#p001_b0001|Q5, Merrick Blvd (and Hook Creek Blvd / Sunrise Highway on weekends only)]].

In the Queens Bus Network Redesign Proposed Final Plan Addendum, published December 2024, the Q5 is described as the underlying local service for a rush route serving the Merrick Boulevard corridor, with local stop spacing between Rosedale and the corridor [[cite:queens_proposed_final_plan_addendum_2024#p006_c0004|Underlying local service provided by the Q5]]. The route provides local service along Merrick Boulevard and offers connections to key transfer points in Jamaica [[cite:queens_proposed_final_plan_addendum_2024#p006_c0004|Provides faster service to key transfer points in Jamaica]].
<!-- mta-wiki:writer:end -->
