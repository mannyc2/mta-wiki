---
managed_by: "mta-wiki-materializer"
record_id: "corridor_south-brooklyn-east-west"
record_kind: "corridor"
display_name: "South Brooklyn East-West Corridor"
source_id: "2015_06_17_brt_southbrooklyn_kickoff_boards"
source_ids:
  - "2015_06_17_brt_southbrooklyn_kickoff_boards"
  - "2015_10_14_brt_southbrooklyn_bkbsc"
local_observation_id: "corridor_south_brooklyn_east_west"
local_observation_ids:
  - "corridor_south_brooklyn_east_west"
  - "corridor_south_brooklyn_east_west_2015_10_14"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-19T19:33:47.199Z"
raw_text: "south Brooklyn east-west corridor identified as a priority service need"
submission_ids:
  - "sub_ef81325c95945bd7"
  - "sub_f1a992a1bdce4403"
payload:
  _merged_field_values:
    corridor_name:
      - "South Brooklyn East-West Corridor"
      - "South Brooklyn east-west corridor"
    description:
      - "East-west corridor across south Brooklyn, identified as a priority service need by the Bus Rapid Transit Phase II Study (2009). Serves 14 bus routes with a combined ridership of 178,000 per day."
      - "Corridor identified as a priority service need by the Bus Rapid Transit Phase II Study (2009). Serves B82 route with 32,000 daily riders."
  borough: "Brooklyn"
  borough_normalized: "brooklyn"
  corridor_name: "South Brooklyn East-West Corridor"
  description: "East-west corridor across south Brooklyn, identified as a priority service need by the Bus Rapid Transit Phase II Study (2009). Serves 14 bus routes with a combined ridership of 178,000 per day."
  routes_served:
    - "B1"
    - "B2"
    - "B3"
    - "B4"
    - "B6"
    - "B7"
    - "B8"
    - "B9"
    - "B11"
    - "B36"
    - "B64"
    - "B82"
    - "B100"
evidence_refs:
  -
    block_id: "p002_c0009"
    evidence_id: "2015_06_17_brt_southbrooklyn_kickoff_boards#p002_c0009"
    page_number: 2
    role: "corridor_origin"
    source_id: "2015_06_17_brt_southbrooklyn_kickoff_boards"
    source_path: "raw/sources/2015_06_17_brt_southbrooklyn_kickoff_boards/blocks.jsonl"
    text_sha256: "sha256:7a1218d0c5656ef1699d58258fa4cad5f1a364ee4aaef9833b95ebce5aa6edc7"
    text_source: "raw_text"
  -
    block_id: "p002_c0004"
    evidence_id: "2015_06_17_brt_southbrooklyn_kickoff_boards#p002_c0004"
    page_number: 2
    role: "routes_and_ridership"
    source_id: "2015_06_17_brt_southbrooklyn_kickoff_boards"
    source_path: "raw/sources/2015_06_17_brt_southbrooklyn_kickoff_boards/blocks.jsonl"
    text_sha256: "sha256:3ae5a354c18bd9c76e81a721e4955e96aeef2f631e6bc29eeaa8541c97cf5f93"
    text_source: "raw_text"
  -
    block_id: "p006_c0002"
    evidence_id: "2015_10_14_brt_southbrooklyn_bkbsc#p006_c0002"
    page_number: 6
    role: "description"
    source_id: "2015_10_14_brt_southbrooklyn_bkbsc"
    source_path: "raw/sources/2015_10_14_brt_southbrooklyn_bkbsc/blocks.jsonl"
    text_sha256: "sha256:ea70542911a655ad62266618b668ba93779dd9925b63ab98d5938af148a32737"
    text_source: "raw_text"
  -
    block_id: "p008_c0002"
    evidence_id: "2015_10_14_brt_southbrooklyn_bkbsc#p008_c0002"
    page_number: 8
    role: "ridership"
    source_id: "2015_10_14_brt_southbrooklyn_bkbsc"
    source_path: "raw/sources/2015_10_14_brt_southbrooklyn_bkbsc/blocks.jsonl"
    text_sha256: "sha256:d664f9cf1ae78bed841af619fd8110822dbe7aea4d334fabdafc2502a5ee3e8d"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The [[corridor:corridor_south-brooklyn-east-west|South Brooklyn East-West Corridor]] was identified as a priority service need by the Bus Rapid Transit Phase II Study in 2009 [[cite:2015_06_17_brt_southbrooklyn_kickoff_boards#p002_c0009|BRT Phase II Study identified corridor]]. The corridor is served by 14 east-west bus routes carrying a combined 178,000 riders per day [[cite:2015_06_17_brt_southbrooklyn_kickoff_boards#p002_c0004|14 bus routes provide East-West service]] [[cite:2015_06_17_brt_southbrooklyn_kickoff_boards#p002_c0007|178,000 per day]]. Key issues raised at 2009 public workshops included bus trips that are long and slow, many underserved areas, and cross-Brooklyn trips that can take up to two hours [[cite:2015_06_17_brt_southbrooklyn_kickoff_boards#p002_c0011|bus trips can take up to 2 hours]].

The [[metric:metric_b82-daily-ridership-2015-10-14|B82 daily ridership]] accounted for 32,000 of those riders, split between [[metric:metric_b82-limited-daily-ridership-2015-10-14|10,000 on the Limited]] and [[metric:metric_b82-local-daily-ridership-2015-10-14|22,000 on the Local]] service [[cite:2015_10_14_brt_southbrooklyn_bkbsc#p008_c0002|32,000 daily riders]]. The proposed South Brooklyn Crosstown SBS route was planned at [[metric:metric_sbs-corridor-length-2015-10-14|10.2 miles]] in length [[cite:2015_10_14_brt_southbrooklyn_bkbsc#p009_c0003|South Brooklyn Crosstown SBS Route Length: 10.2 mi]].

Corridor performance was poor. The [[metric:metric_b82-avg-route-speed-2015-10-14|B82 average route speed]] was 7.9 mph, and buses were [[metric:metric_b82-slower-than-auto-2015-10-14|42% to 71% slower than auto speeds]] with an [[metric:metric_b82-avg-travel-time-2015-10-14|average travel time of 88 minutes]] [[cite:2015_10_14_brt_southbrooklyn_bkbsc#p008_c0002|Average route speed: 7.9 mph]]. Bus delays were dominated by time spent [[metric:metric_bus-delay-in-motion-pct-2015-10-14|in motion (48% of delay)]], followed by [[metric:metric_bus-delay-signal-delay-pct-2015-10-14|signal delay (29%)]], [[metric:metric_bus-delay-dwell-time-pct-2015-10-14|dwell time (21%)]], and [[metric:metric_bus-delay-other-delays-pct-2015-10-14|other delays (2%)]] [[cite:2015_10_14_brt_southbrooklyn_bkbsc#p008_c0003|Delay breakdown pie chart]]. Community feedback gathered during the 2015 input phase prioritized more reliable on-time service, articulated buses, faster service, more shelters and benches, extended night service, and extending the B82 to Gateway Center Mall [[cite:2015_10_14_brt_southbrooklyn_bkbsc#p014_c0002|Top community feedback items]].
<!-- mta-wiki:writer:end -->
