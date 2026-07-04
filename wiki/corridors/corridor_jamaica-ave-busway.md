---
managed_by: "mta-wiki-materializer"
record_id: "corridor_jamaica-ave-busway"
record_aliases:
  - "corridor_jamaica-ave-busway-queens"
record_kind: "corridor"
display_name: "Jamaica Avenue Busway, Queens"
source_id: "busways"
source_ids:
  - "201104_jamaica_cac2_slides"
  - "20110517_jamaica_open_house_posters"
  - "201106_jamaica_cb12_slides"
  - "busways"
  - "jamaica_archer_brochure"
  - "jamaica_busway_monitoring_update_2022"
local_observation_id: "corridor_jamaica_ave_busway"
local_observation_ids:
  - "corridor_jamaica_ave"
  - "corridor_jamaica_ave_bus_lanes"
  - "corridor_jamaica_ave_busway"
  - "corridor_jamaica_ave_cb12_2011"
  - "corridor_jamaica_ave_jamaica_cac2"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-10T22:58:14.959Z"
raw_text: "Jamaica Ave from Sutphin Blvd to 168th St, both directions, 24/7 busway with bus/truck/emergency through trips and local vehicle access with next-right-turn requirement."
submission_ids:
  - "sub_0ca5c7f4b9646d27"
  - "sub_142517981c06448a"
  - "sub_5636bbc1558dc742"
  - "sub_6705efb4a3cb0d2d"
  - "sub_71f5ee3a1e42bfec"
  - "sub_937961954dd02bcf"
payload:
  _merged_field_values:
    corridor_name:
      - "Jamaica Avenue Busway"
      - "Jamaica Avenue"
    description:
      - "Existing bus lanes from Parsons Blvd to 168th St. Proposed west extension from Parsons Blvd to Sutphin Blvd."
      - "Major bus corridor with up to 90 buses/hr per direction, proposed offset bus lanes, expanded hours of operation, and turn restrictions."
      - "Bus lane corridor on Jamaica Avenue in Jamaica, Queens"
    limits:
      - "Sutphin Boulevard to 168th Street"
      - "Sutphin Blvd to 168th St"
      - "Parsons Blvd to 168th St (existing), West Extension: Parsons Blvd to Sutphin Blvd"
    local_access:
      - "permitted from the north and south only and must take the next required turn off the corridor"
      - "all other vehicles may make local trips to access the curb, must make next available right turn"
  borough: "Queens"
  borough_normalized: "queens"
  bus_routes: 14
  busway_launch_date: "October 24, 2021"
  busway_launch_date_normalized:
    confidence: "parsed_text"
    normalized_date: "2021-10-24"
    precision: "day"
    raw_text: "October 24, 2021"
  corridor_name: "Jamaica Avenue Busway"
  daily_ridership_hours: "All Days, 6AM-8PM"
  days: "seven days a week"
  description: "Existing bus lanes from Parsons Blvd to 168th St. Proposed west extension from Parsons Blvd to Sutphin Blvd."
  direction: "both directions"
  hours: "6am to 8pm"
  left_turns: "restricted except eastbound left at 153rd St"
  limits: "Sutphin Boulevard to 168th Street"
  local_access: "permitted from the north and south only and must take the next required turn off the corridor"
  pickup_dropoff: "allowed throughout except Jamaica Ave westbound between 147th Pl and Sutphin Blvd"
  regulation_text: "24 hours a day/7 days a week"
  ridership: 139000
  ridership_text: "139,000 daily riders"
  routes_note: "Routes running between Sutphin Blvd & 168 St only"
  street: "Jamaica Avenue"
  through_access_vehicles:
    - "buses"
    - "trucks"
    - "emergency vehicles"
  through_trips: "buses, trucks, emergency vehicles only"
evidence_refs:
  -
    block_id: "p001_b0001"
    evidence_id: "busways#p001_b0001"
    page_number: 1
    role: "corridor_description"
    source_id: "busways"
    source_path: "raw/sources/busways/blocks.jsonl"
    text_sha256: "sha256:0f691417677ec17891c10c047b9b8e2e506b51264ef0c0d8e63a6a4170e2ead5"
    text_source: "raw_text"
  -
    block_id: "p001_c0002"
    evidence_id: "jamaica_archer_brochure#p001_c0002"
    page_number: 1
    role: "limits"
    source_id: "jamaica_archer_brochure"
    source_path: "raw/sources/jamaica_archer_brochure/blocks.jsonl"
    text_sha256: "sha256:547826cadcddef4cc7d3db45d245caf1e60a888a2550a7483d7321c778a8a0fc"
    text_source: "raw_text"
  -
    block_id: "p001_c0005"
    evidence_id: "jamaica_archer_brochure#p001_c0005"
    page_number: 1
    role: "hours"
    source_id: "jamaica_archer_brochure"
    source_path: "raw/sources/jamaica_archer_brochure/blocks.jsonl"
    text_sha256: "sha256:1ff37d677327917f608d3455aaba5ef8d0b9b432531f7783f21b66c33fc0164a"
    text_source: "raw_text"
  -
    block_id: "p001_c0006"
    evidence_id: "jamaica_archer_brochure#p001_c0006"
    page_number: 1
    role: "through_trips"
    source_id: "jamaica_archer_brochure"
    source_path: "raw/sources/jamaica_archer_brochure/blocks.jsonl"
    text_sha256: "sha256:ab81beb6197604f4c99a7302710c5ded1fe2fb1e20d99bc660cd266feaf400a2"
    text_source: "raw_text"
  -
    block_id: "p001_c0007"
    evidence_id: "jamaica_archer_brochure#p001_c0007"
    page_number: 1
    role: "local_access_and_left_turns"
    source_id: "jamaica_archer_brochure"
    source_path: "raw/sources/jamaica_archer_brochure/blocks.jsonl"
    text_sha256: "sha256:5e3ec7398737ab777a819fd63976c11c1f20afddc1b529b15a993e2c8c7f0807"
    text_source: "raw_text"
  -
    block_id: "p001_c0018"
    evidence_id: "jamaica_archer_brochure#p001_c0018"
    page_number: 1
    role: "pickup_dropoff"
    source_id: "jamaica_archer_brochure"
    source_path: "raw/sources/jamaica_archer_brochure/blocks.jsonl"
    text_sha256: "sha256:93766a33674adca25c9303aa2af3f928da93dc1e74b1dae240c745a7f354ee04"
    text_source: "raw_text"
  -
    block_id: "p002_c0003"
    evidence_id: "jamaica_busway_monitoring_update_2022#p002_c0003"
    page_number: 2
    role: "description"
    source_id: "jamaica_busway_monitoring_update_2022"
    source_path: "raw/sources/jamaica_busway_monitoring_update_2022/blocks.jsonl"
    source_quote: "• Jamaica Ave • Serves 139,000 daily riders • 14 bus routes • Pre-busway speeds of 6.8 MPH (PM)"
    text_sha256: "sha256:66323260bde66d818fd324f63053fe7470d3d9b8224006cf32f157a9c90c1577"
    text_source: "raw_text"
  -
    block_id: "p003_c0005"
    evidence_id: "jamaica_busway_monitoring_update_2022#p003_c0005"
    page_number: 3
    role: "hours"
    source_id: "jamaica_busway_monitoring_update_2022"
    source_path: "raw/sources/jamaica_busway_monitoring_update_2022/blocks.jsonl"
    source_quote: "Jamaica, QN 139,000 All Days, 6AM-8PM"
    text_sha256: "sha256:2e24f5dc29c6618ca4e57b2d5e360a9cd736380b65ec889b44b3e14959ced8ae"
    text_source: "raw_text"
  -
    block_id: "p005_c0003"
    evidence_id: "jamaica_busway_monitoring_update_2022#p005_c0003"
    page_number: 5
    role: "busway_launch"
    source_id: "jamaica_busway_monitoring_update_2022"
    source_path: "raw/sources/jamaica_busway_monitoring_update_2022/blocks.jsonl"
    source_quote: "Busway Launched Oct 24, 2021"
    text_sha256: "sha256:8723c3a1a0aae6e320a1cbf34a1e6c821e3996ae407994b5cbc0dfa85d3447de"
    text_source: "raw_text"
  -
    block_id: "p021_c0003"
    evidence_id: "201104_jamaica_cac2_slides#p021_c0003"
    page_number: 21
    role: "description"
    source_id: "201104_jamaica_cac2_slides"
    source_path: "raw/sources/201104_jamaica_cac2_slides/blocks.jsonl"
    source_quote: "Up to 90 buses/hr per direction"
    text_sha256: "sha256:a7fb0a000203f97e4359d5f45d81291bbd6d58969f4dd45a4553c78dc51a001d"
    text_source: "raw_text"
  -
    block_id: "p021_c0004"
    evidence_id: "201104_jamaica_cac2_slides#p021_c0004"
    page_number: 21
    role: "description"
    source_id: "201104_jamaica_cac2_slides"
    source_path: "raw/sources/201104_jamaica_cac2_slides/blocks.jsonl"
    source_quote: "Congestion delays due to: pedestrians turning vehicles deliveries"
    text_sha256: "sha256:0de8074560034d9e8d380ad394f597705b23946306e19dc5e95a370a04b2ffa8"
    text_source: "raw_text"
  -
    block_id: "p019_c0003"
    evidence_id: "201106_jamaica_cb12_slides#p019_c0003"
    page_number: 19
    role: "corridor_description"
    source_id: "201106_jamaica_cb12_slides"
    source_path: "raw/sources/201106_jamaica_cb12_slides/blocks.jsonl"
    text_sha256: "sha256:a7fb0a000203f97e4359d5f45d81291bbd6d58969f4dd45a4553c78dc51a001d"
    text_source: "raw_text"
  -
    block_id: "p020_c0003"
    evidence_id: "201106_jamaica_cb12_slides#p020_c0003"
    page_number: 20
    role: "existing_lanes_area"
    source_id: "201106_jamaica_cb12_slides"
    source_path: "raw/sources/201106_jamaica_cb12_slides/blocks.jsonl"
    text_sha256: "sha256:9df15c6de86214648665343d860ebe7a71479eee18d8f06556303556e1c35805"
    text_source: "raw_text"
  -
    block_id: "p022_c0003"
    evidence_id: "201106_jamaica_cb12_slides#p022_c0003"
    page_number: 22
    role: "west_extension"
    source_id: "201106_jamaica_cb12_slides"
    source_path: "raw/sources/201106_jamaica_cb12_slides/blocks.jsonl"
    text_sha256: "sha256:8274f67b1a9b319fbe7c821dfbfd8bde5ff57bd9af0d637094c7f5aea8fd633d"
    text_source: "raw_text"
  -
    block_id: "p006_c0002"
    evidence_id: "20110517_jamaica_open_house_posters#p006_c0002"
    page_number: 6
    role: "corridor_descriptor"
    source_id: "20110517_jamaica_open_house_posters"
    source_path: "raw/sources/20110517_jamaica_open_house_posters/blocks.jsonl"
    source_quote: "Jamaica Avenue: Sutphin Boulevard to Parsons Boulevard"
    text_sha256: "sha256:6a6840e265fa9af0e4b835bd98309acd7114ae1a195b5b1f06924ecf45e82f8b"
    text_source: "raw_text"
  -
    block_id: "p006_c0004"
    evidence_id: "20110517_jamaica_open_house_posters#p006_c0004"
    page_number: 6
    role: "corridor_descriptor"
    source_id: "20110517_jamaica_open_house_posters"
    source_path: "raw/sources/20110517_jamaica_open_house_posters/blocks.jsonl"
    source_quote: "Jamaica Avenue: Parsons Boulevard to 168 th Street"
    text_sha256: "sha256:7ea775fd7b8039e9ec62f3ebdf354f2e06373ed76131784aeb9e052fe8362664"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The [[corridor:corridor_jamaica-ave-busway|Jamaica Avenue Busway, Queens]] is a 24-hour, seven-day-a-week busway on Jamaica Avenue from Sutphin Boulevard to 168th Street, operating in both directions [[cite:jamaica_archer_brochure#p001_c0002|limits from brochure]] [[cite:jamaica_archer_brochure#p001_c0005|24/7 schedule]]. It launched on October 24, 2021 as a one-year pilot project [[cite:jamaica_busway_monitoring_update_2022#p005_c0003|launch date]].

Only buses, trucks, and emergency vehicles may make through trips along the corridor [[cite:jamaica_archer_brochure#p001_c0006|through-trip rule]]. All other vehicles may enter for local access to the curb but must make the next available right turn off the busway [[cite:jamaica_archer_brochure#p001_c0007|local-access rule]]. Left turns are restricted except for the eastbound left at 153rd Street [[cite:jamaica_archer_brochure#p001_c0007|left-turn exception]]. Pickups and drop-offs are allowed throughout Jamaica Avenue except westbound between 147th Place and Sutphin Boulevard [[cite:jamaica_archer_brochure#p001_c0018|pickup-dropoff restriction]].

The corridor serves 139,000 daily riders across 14 bus routes, with pre-busway PM peak speeds of 6.8 MPH [[cite:jamaica_busway_monitoring_update_2022#p002_c0003|ridership and speed baseline]]. Busway hours are 6AM-8PM all days [[cite:jamaica_busway_monitoring_update_2022#p003_c0005|ridership hours table]].

Earlier planning for the corridor dates to the 2011 Jamaica Bus Improvement Study, which proposed offset bus lanes, expanded hours of operation, and turn restrictions for Jamaica Avenue from Parsons Boulevard to 168th Street, with a west extension from Parsons Boulevard to Sutphin Boulevard [[cite:20110517_jamaica_open_house_posters#p006_c0002|Sutphin to Parsons segment]] [[cite:20110517_jamaica_open_house_posters#p006_c0004|Parsons to 168th segment]] [[cite:201106_jamaica_cb12_slides#p020_c0003|existing lanes area]] [[cite:201106_jamaica_cb12_slides#p022_c0003|west extension proposal]] [[cite:201104_jamaica_cac2_slides#p021_c0003|up to 90 buses per hour per direction]]. Those study concepts anticipated the full busway treatment that ultimately launched a decade later.
<!-- mta-wiki:writer:end -->
