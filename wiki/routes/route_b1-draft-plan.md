---
managed_by: "mta-wiki-materializer"
record_id: "route_b1-draft-plan"
record_aliases:
  - "route_b1-local"
record_kind: "route"
display_name: "Proposed B1 Local - 86th Street"
source_id: "brooklyn_bus_network_draft_plan_with_route_profiles"
source_ids:
  - "2015_06_17_brt_southbrooklyn_kickoff_boards"
  - "brooklyn_bus_network_draft_plan_with_route_profiles"
  - "segment_speed_methodology_2024"
local_observation_id: "route_b1_draft_plan"
local_observation_ids:
  - "route_b1_2015_sbk_corridor"
  - "route_b1_draft_plan"
  - "route_b1_segment_speed_sample"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-19T17:56:38.870Z"
raw_text: "The proposed B1 would maintain its existing routing. As a Local route, stops would be spaced slightly farther apart than existing to speed up buses and improve reliability. No frequency or service span changes are being proposed at this time."
submission_ids:
  - "sub_08ed97cda7b77975"
  - "sub_616a6995124c50a8"
  - "sub_b02b68da4050a27f"
payload:
  _merged_field_values:
    description:
      - "MTA bus route referenced in a sample data row of the Bus Route Segment Speeds Dataset showing speed of 6.19 mph between 86 ST/STILLWELL AV and 86 ST/18 AV at hour 8 on Wednesday May 1, 2024"
      - "East-west bus route in south Brooklyn serving the South Brooklyn Crosstown corridor"
    route_name:
      - "86th Street"
      - "B1"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Brooklyn"
  borough_normalized: "brooklyn"
  description: "MTA bus route referenced in a sample data row of the Bus Route Segment Speeds Dataset showing speed of 6.19 mph between 86 ST/STILLWELL AV and 86 ST/18 AV at hour 8 on Wednesday May 1, 2024"
  existing_route_length_miles: 6.8
  existing_stop_spacing_feet: 738
  existing_turns_per_mile: 1.1
  proposed_route_length_miles: 6.8
  proposed_stop_spacing_feet: 967
  proposed_turns_per_mile: 1.1
  related_existing_routes:
    - "B1"
  route_id: "B1"
  route_label: "B1"
  route_name: "86th Street"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "Local"
  route_type_normalized: "bus"
  route_type_proposed: "Local"
  service_description: "Service between Bay Ridge and Manhattan Beach"
  service_variant: "local"
evidence_refs:
  -
    block_id: "p067_c0003"
    evidence_id: "brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0003"
    page_number: 67
    role: "names_route"
    source_id: "brooklyn_bus_network_draft_plan_with_route_profiles"
    source_path: "raw/sources/brooklyn_bus_network_draft_plan_with_route_profiles/blocks.jsonl"
    text_sha256: "sha256:5b950e77941d01cdf246d00b1ece546bc95234b77d98b44c9187e2733afa696a"
    text_source: "raw_text"
  -
    block_id: "p067_c0004"
    evidence_id: "brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0004"
    page_number: 67
    role: "names_corridor"
    source_id: "brooklyn_bus_network_draft_plan_with_route_profiles"
    source_path: "raw/sources/brooklyn_bus_network_draft_plan_with_route_profiles/blocks.jsonl"
    text_sha256: "sha256:8a478859195a53f22b6a7369428a84c6d649a4d6f4ea8a4642f0868a943abadd"
    text_source: "raw_text"
  -
    block_id: "p067_c0005"
    evidence_id: "brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0005"
    page_number: 67
    role: "describes_service"
    source_id: "brooklyn_bus_network_draft_plan_with_route_profiles"
    source_path: "raw/sources/brooklyn_bus_network_draft_plan_with_route_profiles/blocks.jsonl"
    text_sha256: "sha256:f2417592c7bc6130347ef41086fd903247b8ddb7e2e6eedc96c9dd0f93e3dbbe"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "segment_speed_methodology_2024#p001_b0001"
    page_number: 1
    role: "sample_data"
    source_id: "segment_speed_methodology_2024"
    source_path: "raw/sources/segment_speed_methodology_2024/blocks.jsonl"
    source_quote: "Table 1: Bus speeds dataset Year Month Day of week Route ID Trip type Hour of day Timepoint stop name Next timepoint stop name Bus trips Speed 2024 5 1 B1 Local 8 86 ST/ STILLWELL AV 86 ST/18 AV 24 6.19"
    text_sha256: "sha256:44b5cb0777ad8ea3dfad0116e0156a31618a34b9f542523c954a22b1c6b4e5f5"
    text_source: "raw_text"
  -
    block_id: "p002_c0004"
    evidence_id: "2015_06_17_brt_southbrooklyn_kickoff_boards#p002_c0004"
    page_number: 2
    role: "route_list"
    source_id: "2015_06_17_brt_southbrooklyn_kickoff_boards"
    source_path: "raw/sources/2015_06_17_brt_southbrooklyn_kickoff_boards/blocks.jsonl"
    text_sha256: "sha256:3ae5a354c18bd9c76e81a721e4955e96aeef2f631e6bc29eeaa8541c97cf5f93"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The proposed B1 Local - 86th Street is part of the MTA Brooklyn Bus Network Redesign Draft Plan, published December 2022 [[cite:brooklyn_bus_network_draft_plan_with_route_profiles#p001_c0003|Draft Plan date]]. The route would continue to operate along 86th Street between Bay Ridge and Manhattan Beach, maintaining its existing routing [[cite:brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0014|B1 routing unchanged]]. As a Local route, stops would be spaced slightly farther apart than existing to speed up buses and improve reliability [[cite:brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0015|stop spacing rationale]]. The proposed average stop spacing changes from 738 feet (existing) to 967 feet (proposed), while route length (6.8 miles) and turns per mile (1.1) remain unchanged [[cite:brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0008|route length]][[cite:brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0010|stop spacing]][[cite:brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0012|turns per mile]].

No frequency or service span changes are being proposed at this time [[cite:brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0016|no frequency/span changes]]. The sole listed route improvement is improved stop spacing [[cite:brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0018|B1 route improvements]]. The B1 connects with subway lines B, Q, D, N, R, and F, and with numerous Brooklyn bus routes including B3, B4, B5, B6, B8, B16, B36, B37, B44 SBS, B49, B63, B64, B68, B70, B82, B82 SBS, and Staten Island routes S53, S79 SBS, and S93 [[cite:brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0021|bus connections]][[cite:brooklyn_bus_network_draft_plan_with_route_profiles#p067_c0023|subway connections]].

The corridor was previously identified in the 2015 South Brooklyn BRT kickoff materials as one of 14 east-west bus routes serving south Brooklyn [[cite:2015_06_17_brt_southbrooklyn_kickoff_boards#p002_c0004|14 east-west routes]]. The 2024 MTA Bus Route Segment Speeds Dataset recorded a B1 Local trip at 6.19 mph between 86 ST/STILLWELL AV and 86 ST/18 AV at hour 8 on Wednesday May 1, 2024 [[cite:segment_speed_methodology_2024#p001_b0001|segment speed sample]].

The B1 route is listed as a related route for the proposed B44 Local - Nostrand/Rogers Avenues draft plan [[cite:brooklyn_bus_network_draft_plan_with_route_profiles#p062_c0031|B44 connections]].
<!-- mta-wiki:writer:end -->
