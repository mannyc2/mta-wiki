---
managed_by: "mta-wiki-materializer"
record_id: "route_qm10-qbb-study"
record_aliases:
  - "route_qm10-201110-qbb"
record_kind: "route"
display_name: "QM10 Express Bus Route"
source_id: "201110_qbb_summary_recommendations"
source_ids:
  - "201110_qbb_approach_summary"
  - "201110_qbb_summary_recommendations"
local_observation_id: "route_qm10_qbb_study"
local_observation_ids:
  - "route_qm10_201110_qbb"
  - "route_qm10_qbb_study"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-10T23:02:45.977Z"
raw_text: "Bus Stop: QM 4 QM 10 QM 12 QM 24"
submission_ids:
  - "sub_4bbdb9b53352b169"
  - "sub_923366fdf4aa03c3"
payload:
  borough: "Queens"
  borough_normalized: "queens"
  boroughs:
    - "Manhattan"
    - "Queens"
  boroughs_normalized:
    - "manhattan"
    - "queens"
  description: "Express bus service between Manhattan and Queens"
  route_id: "QM10"
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
---

<!-- mta-wiki:writer:start -->
The QM10 is an express bus route running between Manhattan and Queens, documented in NYC DOT's Queensboro Bridge Bus Priority Study [[cite:201110_qbb_summary_recommendations#p010_c0005|QM10 bus stop at Third Ave & 57th St]]. The study recorded daily ridership of 130 passengers for the QM10 as part of a total of 7,920 express bus riders crossing the Queensboro Bridge daily across all QM and X routes [[cite:201110_qbb_approach_summary#p008_c0003|Express Bus Daily Ridership table]]. The [[metric:metric_express-bus-total-daily-ridership|Express Bus Total Daily Ridership on QBB]] metric captures the systemwide figure. The QM10 shared a Manhattan bus stop at Third Avenue and 57th Street with the QM4, QM12, and QM24, where buses executed a weave maneuver from the bus-only lane onto 57th Street that was flagged as a safety concern in the study [[cite:201110_qbb_summary_recommendations#p010_c0005|Bus weave maneuver at Third Ave & 57th St]]. The study, conducted by NYC DOT from spring 2010 through fall 2011, identified five focus areas for improvement and implemented short-term recommendations in fall 2011 [[cite:201110_qbb_summary_recommendations#p004_c0011|Fall 2011 implementation]]. Recommendation #2 at Third Avenue and 57th Street proposed a Leading Pedestrian Interval as an opportunity for eastbound bus signal priority, benefiting 45 express and 10 local buses during the PM peak hour [[cite:201110_qbb_summary_recommendations#p010_c0004|Leading Pedestrian Interval opportunity]] [[cite:201110_qbb_summary_recommendations#p010_c0007|Benefits 45 express and 10 local buses in PM peak hr]]. Broader congestion on the Queensboro Bridge was identified as a major cause of bus delay, with over 75 percent of QBB bus riders reporting regular delays [[cite:201110_qbb_summary_recommendations#p003_c0003|QBB congestion causes bus delay]].
<!-- mta-wiki:writer:end -->
