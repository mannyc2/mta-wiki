---
managed_by: "mta-wiki-materializer"
record_id: "route_b60"
record_aliases:
  - "route_b60-cb18-jun2017"
record_kind: "route"
display_name: "B60 Brooklyn"
source_id: "better_buses"
source_ids:
  - "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_jun2025"
  - "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_sept2025"
  - "better_buses"
  - "brt_south_brooklyn_b82_cb18_jun2017"
  - "fare_free_bus_pilot_evaluation"
  - "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024"
  - "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024"
  - "grand_ave_metropolitan_ave_queens_blvd_nov2024"
  - "meeting_doc_147096"
  - "mta_automated_camera_enforcement"
  - "nyct_key_performance_metrics_doc194001"
local_observation_id: "route_b60"
local_observation_ids:
  - "route_b60"
  - "route_b60_ace"
  - "route_b60_cb18_jun2017"
  - "route_b60_eval"
  - "route_b60_grand_ave_2024"
  - "route_b60_grand_ave_nov2024"
  - "route_b60_marcy_ave_2025"
  - "route_b60_marcy_cb1_jun2025"
  - "route_b60_nyct_update_2025"
  - "route_b60_update"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-21T15:54:12.768Z"
raw_text: "B60 route in Brooklyn, passing through Williamsburg and Canarsie"
submission_ids:
  - "sub_01e281bf4f8ed581"
  - "sub_37f0c4ec0875706b"
  - "sub_42e163da1d439e97"
  - "sub_69688d222e47b340"
  - "sub_6c4d97f628a6575e"
  - "sub_95006467533b4db4"
  - "sub_9546bd399806415f"
  - "sub_9c0371a17efafc79"
  - "sub_9fd4f44891e46ca0"
  - "sub_a369143abc75f20b"
  - "sub_ebaddc2e93a55c88"
payload:
  _merged_field_values:
    description:
      - "Williamsburg Bridge/Washington Plaza-bound bus route, serving Marcy Avenue corridor in Brooklyn."
      - "Fare-free bus pilot route in Brooklyn, passing through Williamsburg and Canarsie"
      - "Williamsburg Bridge Plaza-bound bus route with Avg. Daily Ridership of 12,226 (2024). Uses Marcy Av corridor between Borinquen Pl and Broadway."
      - "Williamsburg Bridge Plaza-bound bus route serving Marcy Av corridor near Borinquen Pl to Broadway"
      - "Existing B60 bus service on Flatlands Ave"
      - "Bus route operating from Grand Av Bus Depot"
      - "Fare-Free Bus Pilot route in Brooklyn, connecting Williamsburg to Canarsie"
    route_type:
      - "local"
      - "Local"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Brooklyn"
  borough_normalized: "brooklyn"
  description: "Williamsburg Bridge/Washington Plaza-bound bus route, serving Marcy Avenue corridor in Brooklyn."
  mode: "bus"
  route: "B60"
  route_id: "B60"
  route_label: "B60"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "Wilson Av / Rockaway Av"
evidence_refs:
  -
    block_id: "p001_b0001"
    evidence_id: "better_buses#p001_b0001"
    page_number: 1
    source_id: "better_buses"
    source_path: "raw/sources/better_buses/blocks.jsonl"
    source_quote: "the B24, B60, and Q54, and each route experiences delays and slower speeds along this tail end stretch"
    text_sha256: "sha256:2e61bfba4267992a965aaf383369bd9841b3023373066892ad4931fe86c9e0d0"
    text_source: "raw_text"
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
    block_id: "p010_c0011"
    evidence_id: "nyct_key_performance_metrics_doc194001#p010_c0011"
    page_number: 10
    role: "ace_program_route"
    source_id: "nyct_key_performance_metrics_doc194001"
    source_path: "raw/sources/nyct_key_performance_metrics_doc194001/blocks.jsonl"
    text_sha256: "sha256:e147dfa103fac9d1499e269c62864619e13cdfd4b3540e71e98ebfb706cd1a42"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists B60 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "B60, Wilson Av / Rockaway Av"
    text_sha256: "sha256:5e3cad5451631ea70cff8966419e8249eb64b6a82474a14420dc5bc670d53d68"
    text_source: "raw_text"
  -
    block_id: "p002_c0002"
    evidence_id: "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_jun2025#p002_c0002"
    page_number: 2
    source_id: "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_jun2025"
    source_path: "raw/sources/ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_jun2025/blocks.jsonl"
    text_sha256: "sha256:0a43155509ac756031b6f0c74697f5fc5e195fe9addea9e1dc53eacce479e6fd"
    text_source: "raw_text"
  -
    block_id: "p002_c0002"
    evidence_id: "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_sept2025#p002_c0002"
    page_number: 2
    source_id: "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_sept2025"
    source_path: "raw/sources/ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_sept2025/blocks.jsonl"
    source_quote: "B60 – Avg. Daily Ridership 12,226 (2024)"
    text_sha256: "sha256:0a43155509ac756031b6f0c74697f5fc5e195fe9addea9e1dc53eacce479e6fd"
    text_source: "raw_text"
  -
    block_id: "p037_c0005"
    evidence_id: "brt_south_brooklyn_b82_cb18_jun2017#p037_c0005"
    page_number: 37
    source_id: "brt_south_brooklyn_b82_cb18_jun2017"
    source_path: "raw/sources/brt_south_brooklyn_b82_cb18_jun2017/blocks.jsonl"
    text_sha256: "sha256:aa7d56f2bbc14b478012ccceaa142ca240757661edf63d4a60ebadc8b21b1d54"
    text_source: "raw_text"
  -
    block_id: "p007_c0005"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024#p007_c0005"
    page_number: 7
    role: "mentioned"
    source_id: "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024/blocks.jsonl"
    text_sha256: "sha256:297c690821d112808c984eb439fc65c979fa47f81d105fd7d3a0cbc55deff8b5"
    text_source: "raw_text"
  -
    block_id: "p007_c0004"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_nov2024#p007_c0004"
    page_number: 7
    source_id: "grand_ave_metropolitan_ave_queens_blvd_nov2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_nov2024/blocks.jsonl"
    source_quote: "Operates 10 bus routes, including the B38, B47, B57, B60, B62, and Q59"
    text_sha256: "sha256:297c690821d112808c984eb439fc65c979fa47f81d105fd7d3a0cbc55deff8b5"
    text_source: "raw_text"
  -
    block_id: "p007_c0005"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024#p007_c0005"
    page_number: 7
    source_id: "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024/blocks.jsonl"
    source_quote: "Operates 10 bus routes, including the B38, B47, B57, B60, B62, and Q59"
    text_sha256: "sha256:297c690821d112808c984eb439fc65c979fa47f81d105fd7d3a0cbc55deff8b5"
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
    block_id: "p017_c0004"
    evidence_id: "meeting_doc_147096#p017_c0004"
    page_number: 17
    source_id: "meeting_doc_147096"
    source_path: "raw/sources/meeting_doc_147096/blocks.jsonl"
    text_sha256: "sha256:7ccdf280627a9bf48056fdb6fff90dbeaec67a217628f4ffa4b9dc60bda81917"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The [[route:route_b60|B60 Brooklyn]] is a local bus route in Brooklyn that passes through Williamsburg and Canarsie, serving the Marcy Avenue corridor between Borinquen Place and Broadway [[cite:fare_free_bus_pilot_evaluation#p002_c0006|route map showing B60]]. The route has an average daily ridership of 12,226 (2024) and is one of three Williamsburg Bridge Plaza-bound bus routes that experience delays and slower speeds along this tail-end stretch, alongside the B24 and Q54 [[cite:ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_jun2025#p002_c0002|B60 ridership and delay context]]. The BQE North and South (2024) study recommended providing a bus priority lane to alleviate these delays [[cite:ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_jun2025#p002_c0002|BQE study recommendation]]. The B60 also operates from the Grand Av Bus Depot, which serves ten bus routes including the B38, B47, B57, B60, B62, and Q59 [[cite:grand_ave_metropolitan_ave_queens_blvd_nov2024#p007_c0004|Grand Av Depot route mentions]].

The B60 was selected as Brooklyn's fare-free bus pilot route under the 2023 New York State budget mandate [[cite:meeting_doc_147096#p002_c0006|pilot map showing B60]]. The pilot ran from September 24, 2023 through August 31, 2024 [[cite:meeting_doc_147096#p002_c0005|pilot dates]]. During school months (September 2023 to May 2024), weekday ridership on the B60 rose 34% from a pre-pilot baseline of 10,081 to 13,545, and weekend ridership rose 38% from 4,794 to 6,627 [[cite:meeting_doc_147096#p004_c0003|school-month weekday table]] [[cite:meeting_doc_147096#p004_c0004|school-month weekend table]]. This weekend increase is reflected in the [[metric:metric_school-weekend-overall-38pct|School Weekend Overall +38%]] metric. The total cost attributed to the B60 route was $4,787,000, contributing to the overall pilot cost of [[metric:metric_total-cost-16-475-m|Total Pilot Cost $16,475,000]] across all five routes [[cite:fare_free_bus_pilot_evaluation#p019_c0002|cost breakdown table]].

The B60 was added to the MTA's Automated Camera Enforcement (ACE) program on December 8, entering a 60-day warning phase in which vehicles blocking bus lanes on the route were subject to camera enforcement [[cite:nyct_key_performance_metrics_doc194001#p010_c0011|ACE expansion to B60]]. The route's major streets for ACE enforcement are Wilson Avenue and Rockaway Avenue [[cite:mta_automated_camera_enforcement#p001_b0001|B60 ACE route listing]].
<!-- mta-wiki:writer:end -->
