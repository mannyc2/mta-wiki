---
managed_by: "mta-wiki-materializer"
record_id: "route_bx17"
record_kind: "route"
display_name: "Bx17 (NYCT)"
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
  - "meeting_doc_160441"
local_observation_id: "route_bx17"
local_observation_ids:
  - "route_bx17"
  - "route_bx17_bx_cb5"
  - "route_bx17_fordham_2023"
  - "route_bx17_fordham_rd"
  - "route_bx17_fordham_rd_cab_2023"
  - "route_bx17_fordham_rd_jun2023"
  - "route_bx17_fordham_rd_workshop"
  - "route_fordham_rd_bx17"
  - "route_meeting_doc_160441_bx17"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-20T22:12:01.473Z"
submission_ids:
  - "sub_068d123b5470b272"
  - "sub_0bb8b1775d887692"
  - "sub_1b06fd335d02948f"
  - "sub_1bdc2e08c359531e"
  - "sub_2bbe2c1fe55180f0"
  - "sub_2d3fe53a126e3125"
  - "sub_6b7fa8fd7cad0d29"
  - "sub_8b4016e2da1cf75b"
  - "sub_99cece4942e83845"
  - "sub_e116013251edf57a"
payload:
  _merged_field_values:
    description:
      - "Bronx bus route serving Fordham Road corridor"
      - "Bus route on Fordham Road corridor."
      - "Bus route serving Fordham Road. 7,600 daily ridership."
      - "Bus route that travels on Fordham Road"
      - "One of five routes on Fordham Road corridor"
      - "Bus route traveling on Fordham Road"
      - "Port Morris-Fordham Plaza • Frequency increases and running time adjustments"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Bronx"
  borough_normalized: "bronx"
  description: "Bronx bus route serving Fordham Road corridor"
  operator: "NYCT"
  route_id: "Bx17"
  route_label: "Bx17"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
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
  -
    block_id: "p004_c0004"
    evidence_id: "meeting_doc_160441#p004_c0004"
    page_number: 4
    source_id: "meeting_doc_160441"
    source_path: "raw/sources/meeting_doc_160441/blocks.jsonl"
    text_sha256: "sha256:385178108f7be74ba367420569e47119d97e73e0fdd68dc1ff9610a748e6587a"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
[[route:route_bx17|Bx17 (NYCT)]] is a local Bronx bus route operated by MTA New York City Transit, serving the Fordham Road corridor between Port Morris and Fordham Plaza [[cite:meeting_doc_160441#p004_c0004|Bx17 service description]] [[cite:bx_cb5_projects_dec032019#p025_c0003|Fordham corridor routes]]. On the Fordham Road corridor, which carries multiple bus routes, average bus speeds were measured at 6.8 mph during the AM peak and 5.9 mph during the PM peak [[cite:bx_cb5_projects_dec032019#p025_c0003|Fordham corridor bus speeds]].

The Fordham Road corridor carries approximately 85,000 average daily bus riders across five routes — Bx12 SBS, Bx12 Local, Bx9, Bx17, and Bx22 [[cite:fordham_rd_inwood_cb7_jun2023#p004_c0002|85,000 daily riders on 5 routes]] [[cite:fordham_rd_inwood_cb11_jun2023#p004_c0002|same figure]]. The [[route:route_bx17|Bx17]] itself has an estimated 7,600 daily riders [[cite:fordham_rd_inwood_cb6_jun2023#p007_c0002|Bx17 daily ridership]].

Automated Bus Lane Enforcement (ABLE) cameras were deployed on the Bx12 SBS along Fordham Road in November 2022; by April 2023, Fordham Road average bus speeds increased by 4.7% [[cite:fordham_rd_inwood_cb11_jun2023#p016_c0004|ABLE speed change table]]. That [[metric:metric_able-speed-change-april2023|Bx12 SBS Speed Change +4.7% in April 2023 after ABLE]] metric is specific to Bx12 SBS, so it is useful here only as Fordham Road corridor context, not as a Bx17-specific result. In a separate service action, the Bx17 received frequency increases and running time adjustments on the Port Morris–Fordham Plaza segment [[cite:meeting_doc_160441#p004_c0004|Bx17 service changes]].
<!-- mta-wiki:writer:end -->
