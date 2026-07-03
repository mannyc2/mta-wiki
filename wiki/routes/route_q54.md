---
managed_by: "mta-wiki-materializer"
record_id: "route_q54"
record_kind: "route"
display_name: "Q54 - ABLE route"
source_id: "ace_routes_dataset_dictionary"
source_ids:
  - "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_jun2025"
  - "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_sept2025"
  - "ace_routes_dataset_dictionary"
  - "bus_lane_camera_report_2024"
  - "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024"
  - "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024"
  - "grand_ave_metropolitan_ave_queens_blvd_nov2024"
  - "meeting_doc_127471"
  - "mta_automated_camera_enforcement"
local_observation_id: "route_q54"
local_observation_ids:
  - "route_able_q54"
  - "route_meeting_doc_127471_q54"
  - "route_q54"
  - "route_q54_ace"
  - "route_q54_grand_ave_2024"
  - "route_q54_grand_ave_nov2024"
  - "route_q54_marcy_ave_2025"
  - "route_q54_marcy_cb1_jun2025"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-20T15:17:52.932Z"
raw_text: "Q54 ABLE camera route through 2023"
submission_ids:
  - "sub_24c7c0efb268d7d5"
  - "sub_28e647b2ecaf0e05"
  - "sub_2b3358c91dac08bf"
  - "sub_36b1cd209a27ce00"
  - "sub_39a2b7b67cd2bdeb"
  - "sub_7fd664973dd65ac8"
  - "sub_ac79764bba50e5df"
  - "sub_b457ecb6e53bcaf5"
  - "sub_d5886c3784865b2d"
payload:
  _merged_field_values:
    borough:
      - "Queens"
      - "Brooklyn"
    borough_normalized:
      - "queens"
      - "brooklyn"
    description:
      - "Williamsburg Bridge Plaza-bound bus route with Avg. Daily Ridership of 13,411 (2024). Uses Marcy Av corridor between Borinquen Pl and Broadway. Experiencing consistently slower speeds between 52nd St and 54th St (westbound)."
      - "Williamsburg Bridge Plaza-bound bus route serving Marcy Av corridor near Borinquen Pl to Broadway; experiences consistently slower speeds westbound between 52nd St and 54th St"
      - "Bus route serving Grand St/Grand Av corridor, one of over 51,000 daily bus passengers on Q54, Q58, and Q59"
      - "ABLE program expanded to Q54 route along Jamaica Avenue Busway"
    route_type_normalized:
      - "bus"
      - "local"
  borough: "Queens"
  borough_normalized: "queens"
  boroughs:
    - "Brooklyn"
    - "Queens"
  boroughs_normalized:
    - "brooklyn"
    - "queens"
  description: "Williamsburg Bridge Plaza-bound bus route with Avg. Daily Ridership of 13,411 (2024). Uses Marcy Av corridor between Borinquen Pl and Broadway. Experiencing consistently slower speeds between 52nd St and 54th St (westbound)."
  note: "ABLE cameras operated on this route through 2023"
  program: "ABLE"
  route: "Q54"
  route_id: "Q54"
  route_label: "Q54"
  route_name: "Q54"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "local"
  route_type_normalized: "bus"
  service_variant: "local"
  streets: "Jamaica Av / Metropolitan Av"
evidence_refs:
  -
    block_id: "p001_b0006"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0006"
    page_number: 1
    role: "definition"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"description\": \"Identifies each individual bus route.\""
    text_sha256: "sha256:230b6e305204ab8227d315f854b7da6592bd44101f557dd361132010183c144e"
    text_source: "raw_text"
  -
    block_id: "p001_b0053"
    evidence_id: "ace_routes_dataset_dictionary#p001_b0053"
    page_number: 1
    role: "value"
    source_id: "ace_routes_dataset_dictionary"
    source_path: "raw/sources/ace_routes_dataset_dictionary/blocks.jsonl"
    source_quote: "\"item\": \"Q54\","
    text_sha256: "sha256:6f8cabccf526d35116727fd3b9520b06734fb74c6733165102b14a4cdacf9169"
    text_source: "raw_text"
  -
    block_id: "p008_c0004"
    evidence_id: "bus_lane_camera_report_2024#p008_c0004"
    page_number: 8
    role: "route_list"
    source_id: "bus_lane_camera_report_2024"
    source_path: "raw/sources/bus_lane_camera_report_2024/blocks.jsonl"
    text_sha256: "sha256:b05bc64a6f30b25ca3fe7341e37f4afef63d3a65725da3dbdccaf44314d64d71"
    text_source: "raw_text"
  -
    block_id: "p001_b0001"
    evidence_id: "mta_automated_camera_enforcement#p001_b0001"
    page_number: 1
    role: "lists Q54 as ACE route with major streets"
    source_id: "mta_automated_camera_enforcement"
    source_path: "raw/sources/mta_automated_camera_enforcement/blocks.jsonl"
    source_quote: "Q54, Jamaica Av / Metropolitan Av"
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
    block_id: "p002_c0003"
    evidence_id: "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_jun2025#p002_c0003"
    page_number: 2
    source_id: "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_jun2025"
    source_path: "raw/sources/ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_jun2025/blocks.jsonl"
    text_sha256: "sha256:c5b13697d64a80ae889e09227856efcd2a412aa85f6881d962f6cb70b837f682"
    text_source: "raw_text"
  -
    block_id: "p002_c0002"
    evidence_id: "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_sept2025#p002_c0002"
    page_number: 2
    source_id: "ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_sept2025"
    source_path: "raw/sources/ace_able_pdf_marcy_ave_borinquen_pl_broadway_cb1_sept2025/blocks.jsonl"
    source_quote: "Q54 – Avg. Daily Ridership 13,411 (2024)"
    text_sha256: "sha256:0a43155509ac756031b6f0c74697f5fc5e195fe9addea9e1dc53eacce479e6fd"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024#p004_c0002"
    page_number: 4
    role: "mentioned"
    source_id: "grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_cb5_dec2024/blocks.jsonl"
    text_sha256: "sha256:76c6f89adbcb2cf2d168a88a87a25053ed29155facebadd3f5bf84102728e523"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_nov2024#p004_c0002"
    page_number: 4
    source_id: "grand_ave_metropolitan_ave_queens_blvd_nov2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_nov2024/blocks.jsonl"
    source_quote: "Over 51,000 daily bus passengers on the Q54, Q58, and Q59"
    text_sha256: "sha256:76c6f89adbcb2cf2d168a88a87a25053ed29155facebadd3f5bf84102728e523"
    text_source: "raw_text"
  -
    block_id: "p004_c0002"
    evidence_id: "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024#p004_c0002"
    page_number: 4
    source_id: "grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024"
    source_path: "raw/sources/grand_ave_metropolitan_ave_queens_blvd_cb4_nov2024/blocks.jsonl"
    source_quote: "Over 51,000 daily bus passengers on the Q54, Q58, and Q59"
    text_sha256: "sha256:76c6f89adbcb2cf2d168a88a87a25053ed29155facebadd3f5bf84102728e523"
    text_source: "raw_text"
  -
    block_id: "p006_c0004"
    evidence_id: "meeting_doc_127471#p006_c0004"
    page_number: 6
    source_id: "meeting_doc_127471"
    source_path: "raw/sources/meeting_doc_127471/blocks.jsonl"
    text_sha256: "sha256:f110a524011af2ef7ba2bce44f8564c8092e491a22382cc03925bd38ceab98f7"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->

<!-- mta-wiki:writer:end -->
