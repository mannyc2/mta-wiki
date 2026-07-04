---
managed_by: "mta-wiki-materializer"
record_id: "corridor_el-grant-highway"
record_kind: "corridor"
display_name: "E.L. Grant Highway Corridor"
source_id: "bronx_bus_network_final_plan_2019"
source_ids:
  - "bronx_bus_network_final_plan_2019"
  - "bronx_bus_network_final_plan_addendum_2021"
  - "bx_cb3_projects_feb112020"
  - "bx_cb4_projects_feb052020"
local_observation_id: "corridor_el_grant_highway"
local_observation_ids:
  - "corridor_el_grant_highway"
  - "corridor_el_grant_highway_bx_cb4"
  - "corridor_el_grant_hwy_bx_cb3"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-23T13:33:38.383Z"
raw_text: "E.L. Grant Highway (Cross Bronx Expressway to East 167 Street) - Corridor length: 0.6 miles. Routes served: Bx11, Bx13, Bx35. Combined daily route ridership: 36,000."
submission_ids:
  - "sub_2fd48c5cf03dc0c4"
  - "sub_59c7182ecd03f60f"
  - "sub_979b9fad434a0ea9"
  - "sub_c4af8b35921b8511"
payload:
  _merged_field_values:
    description:
      - "Bus priority corridor identified as top Bronx corridor; high ridership, slow bus speeds, important cross-borough connections"
      - "Bronx bus priority corridor identified by NYCDOT as a top corridor for bus lanes and bus priority treatments"
    street:
      - "E.L. Grant Highway"
      - "Edward L. Grant Highway"
      - "E.L. Grant Hwy"
  borough: "Bronx"
  borough_normalized: "bronx"
  combined_daily_ridership: 36000
  corridor_length_mi: 0.6
  corridor_name: "E.L. Grant Highway"
  description: "Bus priority corridor identified as top Bronx corridor; high ridership, slow bus speeds, important cross-borough connections"
  from: "Cross Bronx Expressway"
  limits: "Cross Bronx Expressway to East 167 Street"
  routes:
    - "Bx35"
  routes_served:
    - "Bx11"
    - "Bx13"
    - "Bx35"
  status: "Completed 2020"
  street: "E.L. Grant Highway"
  to: "East 167 Street"
evidence_refs:
  -
    block_id: "p030_c0004"
    evidence_id: "bronx_bus_network_final_plan_2019#p030_c0004"
    page_number: 30
    role: "provides_metrics"
    source_id: "bronx_bus_network_final_plan_2019"
    source_path: "raw/sources/bronx_bus_network_final_plan_2019/blocks.jsonl"
    text_sha256: "sha256:e0bc9bb02bb30cfda5c6e71b6ba6e11c81f853eee83f4d2f7a86820baec7b709"
    text_source: "raw_text"
  -
    block_id: "p005_c0003"
    evidence_id: "bronx_bus_network_final_plan_addendum_2021#p005_c0003"
    page_number: 5
    role: "table"
    source_id: "bronx_bus_network_final_plan_addendum_2021"
    source_path: "raw/sources/bronx_bus_network_final_plan_addendum_2021/blocks.jsonl"
    text_sha256: "sha256:bc92373f356e066204434f43c67c632e44b6e8da655716de96ad14457f290064"
    text_source: "raw_text"
  -
    block_id: "p005_c0003"
    evidence_id: "bx_cb4_projects_feb052020#p005_c0003"
    page_number: 5
    role: "corridor_identification"
    source_id: "bx_cb4_projects_feb052020"
    source_path: "raw/sources/bx_cb4_projects_feb052020/blocks.jsonl"
    text_sha256: "sha256:75bf51d06fb6ec23435b72c4789507ea66757263d517048a19bf884ff89c2ee5"
    text_source: "raw_text"
  -
    block_id: "p005_c0002"
    evidence_id: "bx_cb4_projects_feb052020#p005_c0002"
    page_number: 5
    role: "map"
    source_id: "bx_cb4_projects_feb052020"
    source_path: "raw/sources/bx_cb4_projects_feb052020/blocks.jsonl"
    text_sha256: "sha256:f825c3110718ebb5860908e5db4b2c118c1eb19c13f595e6bed1ab65a1b7ffad"
    text_source: "raw_text"
  -
    block_id: "p005_c0003"
    evidence_id: "bx_cb3_projects_feb112020#p005_c0003"
    page_number: 5
    role: "corridor_identification"
    source_id: "bx_cb3_projects_feb112020"
    source_path: "raw/sources/bx_cb3_projects_feb112020/blocks.jsonl"
    text_sha256: "sha256:75bf51d06fb6ec23435b72c4789507ea66757263d517048a19bf884ff89c2ee5"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The E.L. Grant Highway Corridor runs in the Bronx from the Cross Bronx Expressway to East 167 Street, covering 0.6 miles with three bus routes (Bx11, Bx13, Bx35) and a combined daily ridership of 36,000 [[cite:bronx_bus_network_final_plan_2019#p030_c0004|bronx_bus_network_final_plan_2019 p.30]]. As part of the MTA Bronx Bus Network Redesign, the Bx11 was rerouted to operate along E.L. Grant Highway instead of Ogden Avenue, 168 Street, and Shakespeare Avenue, and during peak times up to 37 buses per hour serve the corridor [[cite:bx_cb4_projects_feb052020#p011_c0002|bx_cb4_projects_feb052020 p.11]].

NYCDOT analyzed Bronx corridors to prioritize bus lane and bus priority treatments and identified both E.L. Grant Highway and East 167 Street / East 168 Street as top Bronx corridors, citing high ridership, slow and unreliable bus service, and important cross-borough connections [[cite:bx_cb4_projects_feb052020#p005_c0003|bx_cb4_projects_feb052020 p.5]]. After the redesign, the corridor carries over 26,000 daily passengers on the Bx11, Bx13, and Bx35 combined; despite this high transit demand, minimal road space is dedicated to buses, resulting in average bus speeds of 6.7 mph in the AM peak and 5.7 mph in the PM peak [[cite:bx_cb4_projects_feb052020#p012_c0002|bx_cb4_projects_feb052020 p.12]]. By comparison, the [[metric:metric_avg-stop-spacing-existing-bronx|existing average bus stop spacing across the Bronx]] is 882 feet, as measured during the redesign planning process [[cite:bronx_bus_network_final_plan_2019#p011_c0002|bronx_bus_network_final_plan_2019 p.11]]; the Final Plan proposed increasing this to 1,092 feet [[cite:bronx_bus_network_final_plan_2019#p011_c0003|bronx_bus_network_final_plan_2019 p.11]].

The 2021 Bronx Bus Network Redesign Addendum listed the E.L. Grant Highway corridor (Washington Bridge, Amsterdam Avenue to University Avenue) under "Future Plan" status with routes Bx3, Bx11, Bx13, Bx35, and Bx36 [[cite:bronx_bus_network_final_plan_addendum_2021#p005_c0003|bronx_bus_network_final_plan_addendum_2021 p.5]]. The corridor was also identified as a priority project in the Connecting Communities Plan (May 2018), which included plans for a protected bicycle lane along Edward L. Grant Highway from East 167 Street to Tremont Avenue [[cite:bx_cb4_projects_feb052020#p006_c0002|bx_cb4_projects_feb052020 p.6]].
<!-- mta-wiki:writer:end -->
