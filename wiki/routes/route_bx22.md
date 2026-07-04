---
managed_by: "mta-wiki-materializer"
record_id: "route_bx22"
record_kind: "route"
display_name: "Bx22"
source_id: "better_buses"
source_ids:
  - "better_buses"
  - "bx_cb5_projects_dec032019"
  - "fordham_rd_inwood_cab_may2023"
  - "fordham_rd_inwood_cb11_jun2023"
  - "fordham_rd_inwood_cb5_jun2023"
  - "fordham_rd_inwood_cb6_jun2023"
  - "fordham_rd_inwood_cb7_jun2023"
  - "fordham_rd_major_deegan_expwy_boston_rd_cab_jan2021"
  - "fordham_rd_major_deegan_expwy_boston_rd_jun2021"
  - "fordham_rd_sedgwick_ave_bronx_river_pkwy_cb6_may2026"
  - "fordham_rd_sedgwick_ave_bronx_river_pkwy_cb7_may2026"
  - "mta_automated_camera_enforcement"
local_observation_id: "route_bx22"
local_observation_ids:
  - "route_bx22"
  - "route_bx22_ace"
  - "route_bx22_bx_cb5"
  - "route_bx22_fordham"
  - "route_bx22_fordham_2023"
  - "route_bx22_fordham_rd"
  - "route_bx22_fordham_rd_cab_2023"
  - "route_bx22_fordham_rd_jun2023"
  - "route_bx22_fordham_rd_workshop"
  - "route_fordham_rd_bx22"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-19T18:47:09.557Z"
submission_ids:
  - "sub_1b03db26c4423bda"
  - "sub_44c29579c8b1e2a7"
  - "sub_54873defa5636366"
  - "sub_6fe45f2cbd880f3f"
  - "sub_83ea562de5a699d1"
  - "sub_8d0009bc0b2ac4bd"
  - "sub_94a621b5685926ba"
  - "sub_95af852194be6a0e"
  - "sub_9bf3ff2ae4ec2f1d"
  - "sub_a744383d127da67d"
  - "sub_d32d33e66bfc0bdd"
  - "sub_fd1fcc5dc04d2f28"
payload:
  _merged_field_values:
    description:
      - "Bronx bus route serving Fordham Road corridor"
      - "Bus route on Fordham Road corridor."
      - "Bus route serving Fordham Road. 12,300 daily ridership."
      - "Route serving Fordham Road corridor"
      - "Bus route that travels on Fordham Road"
      - "One of five routes on Fordham Road corridor"
      - "Bus route traveling on Fordham Road"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Bronx"
  borough_normalized: "bronx"
  description: "Bronx bus route serving Fordham Road corridor"
  route_id: "Bx22"
  route_label: "Bx22"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "Fordham Rd / White Plains Rd / Castle Hill Av"
evidence_refs:
  -
    block_id: "p001_b0001"
    evidence_id: "better_buses#p001_b0001"
    page_number: 1
    source_id: "better_buses"
    source_path: "raw/sources/better_buses/blocks.jsonl"
    source_quote: "Bx9, Bx12 SBS/Local, Bx17, Bx22, Bx34, Bee-Line 60-62 buses"
    text_sha256: "sha256:2e61bfba4267992a965aaf383369bd9841b3023373066892ad4931fe86c9e0d0"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists Bx22 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "Bx22, Fordham Rd / White Plains Rd / Castle Hill Av"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p025_c0003"
    evidence_id: "bx_cb5_projects_dec032019#p025_c0003"
    page_number: 25
    role: "route_on_fordham"
    source_id: "bx_cb5_projects_dec032019"
    source_path: "raw/sources/bx_cb5_projects_dec032019/blocks.jsonl"
    text_sha256: "sha256:4cb5d19ca3aa2cb688ec545717309449978f689df1ddb2e35c831ce52359771b"
    text_source: "raw_text"
  -
    block_id: "p007_c0002"
    evidence_id: "fordham_rd_inwood_cb6_jun2023#p007_c0002"
    page_number: 7
    role: "ridership"
    source_id: "fordham_rd_inwood_cb6_jun2023"
    source_path: "raw/sources/fordham_rd_inwood_cb6_jun2023/blocks.jsonl"
    text_sha256: "sha256:98d8e05a71346082e7853323c7f1698f4c667d7d15dc4df6602a58a614b59023"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "fordham_rd_inwood_cb7_jun2023#p004_c0002"
    page_number: 4
    role: "mentioned"
    source_id: "fordham_rd_inwood_cb7_jun2023"
    source_path: "raw/sources/fordham_rd_inwood_cb7_jun2023/blocks.jsonl"
    text_sha256: "sha256:c3b9506814b1585945d6aa82293cf7ce5d0a638125ea700facefc1fa01ba60e2"
    text_source: "raw_text"
  -
    block_id: "p001_c0005"
    evidence_id: "fordham_rd_sedgwick_ave_bronx_river_pkwy_cb6_may2026#p001_c0005"
    page_number: 1
    source_id: "fordham_rd_sedgwick_ave_bronx_river_pkwy_cb6_may2026"
    source_path: "raw/sources/fordham_rd_sedgwick_ave_bronx_river_pkwy_cb6_may2026/blocks.jsonl"
    source_quote: "A bus stop sign lists routes Bx12, Bx22, w60, w61, and w62"
    text_sha256: "sha256:834ee7ed643bf695a0e31d64231281825189a1807e2372812cece1854c47fefc"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "fordham_rd_inwood_cb11_jun2023#p004_c0002"
    page_number: 4
    source_id: "fordham_rd_inwood_cb11_jun2023"
    source_path: "raw/sources/fordham_rd_inwood_cb11_jun2023/blocks.jsonl"
    source_quote: "85,000 average daily bus riders on 5 routes (Bx12-SBS + Local, Bx9, Bx17, Bx22)"
    text_sha256: "sha256:c3b9506814b1585945d6aa82293cf7ce5d0a638125ea700facefc1fa01ba60e2"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "fordham_rd_inwood_cab_may2023#p004_c0002"
    page_number: 4
    source_id: "fordham_rd_inwood_cab_may2023"
    source_path: "raw/sources/fordham_rd_inwood_cab_may2023/blocks.jsonl"
    text_sha256: "sha256:c3b9506814b1585945d6aa82293cf7ce5d0a638125ea700facefc1fa01ba60e2"
    text_source: "raw_text"
  -
    block_id: "p016_c0002"
    evidence_id: "fordham_rd_major_deegan_expwy_boston_rd_cab_jan2021#p016_c0002"
    page_number: 16
    role: "description"
    source_id: "fordham_rd_major_deegan_expwy_boston_rd_cab_jan2021"
    source_path: "raw/sources/fordham_rd_major_deegan_expwy_boston_rd_cab_jan2021/blocks.jsonl"
    text_sha256: "sha256:4d8312f5653856573b2b8b9412031a2c89c3972793bcb33bb45349619d5a560a"
    text_source: "raw_text"
  -
    block_id: "p001_c0005"
    evidence_id: "fordham_rd_sedgwick_ave_bronx_river_pkwy_cb7_may2026#p001_c0005"
    page_number: 1
    source_id: "fordham_rd_sedgwick_ave_bronx_river_pkwy_cb7_may2026"
    source_path: "raw/sources/fordham_rd_sedgwick_ave_bronx_river_pkwy_cb7_may2026/blocks.jsonl"
    source_quote: "A bus stop sign lists routes Bx12, Bx22, w60, w61, and w62"
    text_sha256: "sha256:e083769532644ade935dce48fb6aee2ad7a1c45d692cebd0b6108ba575e1d8c7"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "fordham_rd_inwood_cb5_jun2023#p004_c0002"
    page_number: 4
    role: "corridor_routes"
    source_id: "fordham_rd_inwood_cb5_jun2023"
    source_path: "raw/sources/fordham_rd_inwood_cb5_jun2023/blocks.jsonl"
    text_sha256: "sha256:c3b9506814b1585945d6aa82293cf7ce5d0a638125ea700facefc1fa01ba60e2"
    text_source: "raw_text"
  -
    block_id: "p028_c0002"
    evidence_id: "fordham_rd_major_deegan_expwy_boston_rd_jun2021#p028_c0002"
    page_number: 28
    source_id: "fordham_rd_major_deegan_expwy_boston_rd_jun2021"
    source_path: "raw/sources/fordham_rd_major_deegan_expwy_boston_rd_jun2021/blocks.jsonl"
    source_quote: "Bx9, Bx12 SBS/Local, Bx17, Bx22, Bx34, Bee-Line 60-62 buses"
    text_sha256: "sha256:4d8312f5653856573b2b8b9412031a2c89c3972793bcb33bb45349619d5a560a"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The [[route:route_bx22|Bx22]] is a Bronx local bus route that travels on Fordham Road, White Plains Road, and Castle Hill Avenue, as listed in the MTA's automated camera enforcement program [[cite:mta_automated_camera_enforcement#p001_b0001|ACE route list]]. The route carries approximately 12,300 daily riders, serving the Fordham Road corridor alongside the Bx9, Bx12 (SBS and local), and Bx17 [[cite:fordham_rd_inwood_cb6_jun2023#p007_c0002|ridership data]].

The Bx22 is one of five routes that together carry 85,000 average daily bus riders on Fordham Road, a critical crosstown corridor and major Bronx-Manhattan connection [[cite:fordham_rd_inwood_cb11_jun2023#p004_c0002|corridor context]]. On the Fordham Road corridor, average bus speeds were 6.8 mph during the AM peak and 5.9 mph during the PM peak [[cite:bx_cb5_projects_dec032019#p025_c0003|speed data]].

The Fordham Road corridor--which the Bx22 serves together with the Bx9, Bx12 SBS/Local, Bx17, Bx34, and Bee-Line 60-62 buses--has been the focus of bus priority planning by NYC DOT and the MTA under the Better Buses program [[cite:fordham_rd_major_deegan_expwy_boston_rd_jun2021#p028_c0002|route list]] [[cite:better_buses#p001_b0001|Better Buses program]]. Proposed treatments presented to community boards in 2023 included Alternative A (24/7 offset bus lanes in both directions), Alternative B (eastbound busway from Morris Avenue to Webster Avenue), and Alternative C (two-way busway between Jerome and Webster Avenues) [[cite:fordham_rd_inwood_cb6_jun2023#p011_c0004|Alternative A]] [[cite:fordham_rd_inwood_cb6_jun2023#p011_c0006|Alternative B]] [[cite:fordham_rd_inwood_cb6_jun2023#p011_c0008|Alternative C]].

Automated bus lane camera enforcement (ABLE) was implemented on the corridor starting November 2022. While the Bx12 SBS saw a 4.7% speed increase by April 2023 after ABLE deployment [[metric:metric_able-speed-change-april2023|Bx12 SBS Speed Change +4.7% in April 2023 after ABLE]] [[cite:fordham_rd_inwood_cb11_jun2023#p016_c0002|ABLE evaluation]], speeds remained below the 6.7 mph recorded after the original Bx12 SBS launch in 2008 [[cite:fordham_rd_inwood_cb11_jun2023#p016_c0002|ABLE context]].

The Bx22 is part of a future-plan corridor identified in the Bronx Bus Network Redesign, covering Pelham Parkway, Fordham Road, and West 207th Street together with the Bx9, Bx12, Bx12 SBS, and Bx17 [[cite:fordham_rd_inwood_cb5_jun2023#p004_c0002|Fordham corridor routes]].
<!-- mta-wiki:writer:end -->
