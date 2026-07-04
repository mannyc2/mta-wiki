---
managed_by: "mta-wiki-materializer"
record_id: "route_qm18-qbb-study"
record_aliases:
  - "route_qm18-201110-qbb"
record_kind: "route"
display_name: "QM18 Express Bus Route"
source_id: "201110_qbb_summary_recommendations"
source_ids:
  - "201110_qbb_approach_summary"
  - "201110_qbb_summary_recommendations"
local_observation_id: "route_qm18_qbb_study"
local_observation_ids:
  - "route_qm18_201110_qbb"
  - "route_qm18_qbb_study"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-10T23:03:22.328Z"
raw_text: "Bus Stop: QM 15 QM 16 QM 17 QM 18 QM 21"
submission_ids:
  - "sub_cbdb55ffa8e4999d"
  - "sub_f389af30e780009d"
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
  route_id: "QM18"
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
The [[route:route_qm18-qbb-study|QM18 Express Bus Route]] is an express bus service between Manhattan and Queens documented in the Queensboro Bridge (QBB) Bus Priority Study, published by NYC DOT in 2011 [[cite:201110_qbb_summary_recommendations#p001_c0001|NYC DOT QBB study]]. During the study period, the route carried approximately 110 daily riders, contributing to a total of 7,920 daily express bus riders crossing the QBB [[cite:201110_qbb_approach_summary#p008_c0003|QM18 daily ridership of 110]]. The study identified that congestion on the QBB caused significant bus delay, with over 75% of riders reporting regular delays [[cite:201110_qbb_approach_summary#p004_c0003|over 75% report delay]].

The QM18 shared a bus stop with the QM15, QM16, QM17, and QM21 at Third Avenue and 57th Street in Manhattan, where a bus weave maneuver was identified as a safety concern [[cite:201110_qbb_summary_recommendations#p010_c0005|bus weave at 3rd Ave & 57th St]]. The study's Recommendation #2 addressed this intersection with a Leading Pedestrian Interval that also created an opportunity for eastbound bus signal priority [[cite:201110_qbb_summary_recommendations#p010_c0004|LPI and bus signal priority]].

The [[metric:metric_express-bus-total-daily-ridership|Express Bus Total Daily Ridership on QBB]] figure of 7,920 across all express routes reflects the corridor's significance as a bus corridor carrying 16,000 total bus trips daily [[cite:201110_qbb_approach_summary#p008_c0003|total express ridership]]. The QBB Bus Priority Study's short-term recommendations were implemented in fall 2011, while Recommendation #5 called for additional analysis of bus priority options on the Thomson Avenue ramps [[cite:201110_qbb_summary_recommendations#p017_c0004|recommendations #1-4 implemented fall 2011]][[cite:201110_qbb_summary_recommendations#p017_c0006|rec #5 pending analysis]].
<!-- mta-wiki:writer:end -->
