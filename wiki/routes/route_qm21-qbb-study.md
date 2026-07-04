---
managed_by: "mta-wiki-materializer"
record_id: "route_qm21-qbb-study"
record_aliases:
  - "route_qm21-201110-qbb"
record_kind: "route"
display_name: "QM21 Express Bus Route"
source_id: "201110_qbb_summary_recommendations"
source_ids:
  - "201110_qbb_approach_summary"
  - "201110_qbb_summary_recommendations"
local_observation_id: "route_qm21_qbb_study"
local_observation_ids:
  - "route_qm21_201110_qbb"
  - "route_qm21_qbb_study"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-10T23:03:22.426Z"
raw_text: "Bus Stop: QM 15 QM 16 QM 17 QM 18 QM 21"
submission_ids:
  - "sub_a06bc6521f4d6be8"
  - "sub_a8ff410505ac7bd1"
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
  route_id: "QM21"
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
The QM21 Express Bus Route [[route:route_qm21-qbb-study|QM21 Express Bus Route]] is an express bus service operating between Manhattan and Queens, documented through the Queensboro Bridge Bus Priority Study conducted by NYC DOT in 2010–2011 [[cite:201110_qbb_approach_summary#p001_c0002|Queensboro Bridge Bus Priority Study]]. A data-collection table from the study records that the QM21 carried 340 daily riders, contributing to a total of 7,920 express bus passengers per day across all routes using the Queensboro Bridge [[cite:201110_qbb_approach_summary#p008_c0003|Express Bus Daily Ridership Table]] — a figure captured by the metric [[metric:metric_express-bus-total-daily-ridership|Express Bus Total Daily Ridership on QBB]].

During the study, the QM21 was identified as one of the express bus routes sharing a bus stop at Third Avenue and 57th Street in Manhattan, where buses performed a weave maneuver from the bus-only lane onto 57th Street [[cite:201110_qbb_summary_recommendations#p010_c0005|Third Avenue & 57th Street map description]]. The study examined congestion-related delays affecting express routes like the QM21 on the QBB, where over 75% of bus riders reported regular delays, and developed five recommendations to improve bus speed and safety; recommendations #1 through #4 were presented to local Community Boards in spring 2011 and implemented by fall 2011, while recommendation #5 remained pending further analysis [[cite:201110_qbb_summary_recommendations#p017_c0003|Recommendations #1-4]] [[cite:201110_qbb_summary_recommendations#p017_c0006|Recommendation #5]].

Evidence caveat: the QM21 daily ridership figure of 340 comes from an OCR-extracted table; an asterisk note on the same page indicates that values for some other routes (marked with *) were estimated, but QM21 is not marked with an asterisk [[cite:201110_qbb_approach_summary#p008_c0005|Estimated ridership footnote]].
<!-- mta-wiki:writer:end -->
