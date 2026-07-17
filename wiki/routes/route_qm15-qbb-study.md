---
managed_by: "mta-wiki-materializer"
record_id: "route_qm15-qbb-study"
record_aliases:
  - "route_qm15-201110-qbb"
record_kind: "route"
display_name: "QM15 Express Bus Route"
source_id: "201110_qbb_summary_recommendations"
source_ids:
  - "201110_qbb_approach_summary"
  - "201110_qbb_summary_recommendations"
  - "meeting_doc_160441"
  - "mta_queens_bus_network_redesign_service_changes"
local_observation_id: "route_qm15_qbb_study"
local_observation_ids:
  - "route_meeting_doc_160441_qm15"
  - "route_qm15_201110_qbb"
  - "route_qm15_qbb_study"
  - "route_qm15_qbnr_2025"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-07-12T23:02:57.000Z"
raw_text: "Bus Stop: QM 15 QM 16 QM 17 QM 18 QM 21"
submission_ids:
  - "sub_368ee4685ade600f"
  - "sub_730643f578927219"
  - "sub_b51604788f226099"
  - "sub_f0dab968aca74849"
payload:
  _merged_field_values:
    description:
      - "Express bus service between Manhattan and Queens"
      - "Queens: Lindenwood-Cross Bay Blvd-Woodhaven Blvd-Midtown • 1 peak period, peak direction trip each in the AM and PM peaks"
  borough: "Queens"
  borough_normalized: "queens"
  boroughs:
    - "Manhattan"
    - "Queens"
  boroughs_normalized:
    - "manhattan"
    - "queens"
  description: "Express bus service between Manhattan and Queens"
  gtfs_route_id: "QM15"
  operator: "MTA Bus Company"
  route_id: "QM15"
  route_name: "QM15"
  route_record_scope: "true_route"
  route_record_scope_reason: "default_true_route"
  route_type: "express"
  route_type_normalized: "express"
  service_variant: "express"
evidence_refs:
  -
    block_id: "p010_c0005"
    evidence_id: "201110_qbb_summary_recommendations#p010_c0005"
    page_number: 10
    role: "route_mention"
    source_id: "201110_qbb_summary_recommendations"
    source_path: "raw/sources/201110_qbb_summary_recommendations/blocks.jsonl"
    text_sha256: "sha256:c19d208b000c4374185cdb2311bc5c6ab1a8b6b25100445b6db4a43ad54c0c75"
    text_source: "raw_text"
  -
    block_id: "p008_c0003"
    evidence_id: "201110_qbb_approach_summary#p008_c0003"
    page_number: 8
    source_id: "201110_qbb_approach_summary"
    source_path: "raw/sources/201110_qbb_approach_summary/blocks.jsonl"
    source_quote: "Route Daily QM1 750 QM1A 2,020 QM2 1,160 QM2A 720 QM3 90 QM4 350 QM10 130 QM12 220 QM15 430 QM16 140 QM17 200 QM18 110 QM21 340 QM24 150 X51* 180 X63* 380 X64* 220 X68* 330 Total 7,920"
    text_sha256: "sha256:7a60487563c9efadc67277fe6f070f4c89fe6d1c5777a420f3f71180c11580af"
    text_source: "raw_text"
  -
    block_id: "p003_c0005"
    evidence_id: "meeting_doc_160441#p003_c0005"
    page_number: 3
    source_id: "meeting_doc_160441"
    source_path: "raw/sources/meeting_doc_160441/blocks.jsonl"
    text_sha256: "sha256:a1cb3550e548ba0e4cc902da5e264574b62e2318fcfe0a6f5418eb28d04373de"
    text_source: "raw_text"
  -
    block_id: "p001_b0113"
    evidence_id: "mta_queens_bus_network_redesign_service_changes#p001_b0113"
    page_number: 1
    role: "route_identity"
    source_id: "mta_queens_bus_network_redesign_service_changes"
    source_path: "raw/sources/mta_queens_bus_network_redesign_service_changes/blocks.jsonl"
    source_quote: "QM15"
    text_sha256: "sha256:f60d6f3110d5afceed9bb42780da61d93726de6863079c2c21c431e1582bd5aa"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
The [[route:route_qm15-qbb-study|QM15 Express Bus Route]] is an express bus route operated by MTA Bus Company between Lindenwood, Queens (via Cross Bay Boulevard and Woodhaven Boulevard) and Midtown Manhattan [[cite:meeting_doc_160441#p003_c0005|QM15 service description]]. As part of the Queensboro Bridge Bus Priority Study conducted by NYC DOT in 2010-2011, the QM15 was one of 18 express bus routes inventoried crossing the Queensboro Bridge, carrying approximately 430 daily riders [[cite:201110_qbb_approach_summary#p008_c0003|QM15 daily ridership of 430]]. A QM15 bus stop at Third Avenue and 57th Street in Manhattan was documented in the study's analysis of bus weave maneuvers and bus priority opportunities at that location [[cite:201110_qbb_summary_recommendations#p010_c0005|QM15 bus stop at 3rd Ave & 57th St]].

In support of Congestion Pricing, the MTA proposed service enhancements in a December 2024 staff summary that includes adding 1 peak period, peak direction trip each in the AM and PM peaks on the QM15 [[cite:meeting_doc_160441#p003_c0005|QM15 service description]], part of a package affecting eight express bus routes scheduled for implementation in spring 2025 [[cite:meeting_doc_160441#p001_c0012|Express bus routes: Spring 2025]]. The overall recommendation covers frequency increases or running time adjustments on eight express and 16 local bus routes [[cite:meeting_doc_160441#p001_c0007|Recommendation scope]]. The annualized operating cost increase for the full package is approximately $8 million, of which roughly $2.9 million per year is attributed to MTA Bus Company routes including the QM15; NYCT routes account for approximately $5.1 million per year [[cite:meeting_doc_160441#p001_c0010|Cost allocation]]. In the first year, there is an additional cost of approximately $5 million to rehabilitate and extend the life of 29 local buses ([[metric:metric_meeting-doc-160441-first-year-bus-rehab|First year cost - rehabilitate 29 local buses]]; [[metric:metric_meeting-doc-160441-total-annual-cost|Annualized operating cost increase - total]]; [[metric:metric_meeting-doc-160441-mtabus-annual-cost|Annual operating cost - MTA Bus Company portion]]; [[metric:metric_meeting-doc-160441-nyct-annual-cost|Annual operating cost - NYCT bus routes portion]]).
<!-- mta-wiki:writer:end -->
