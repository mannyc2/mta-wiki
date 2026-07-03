---
managed_by: "mta-wiki-materializer"
record_id: "project_tsp-program-2017"
record_aliases:
  - "project_nyc-transit-signal-priority-program"
record_kind: "project"
display_name: "Transit Signal Priority Program"
source_id: "tsp_status_2017"
source_ids:
  - "tsp_report_2017"
  - "tsp_status_2017"
local_observation_id: "project_tsp_program_2017"
local_observation_ids:
  - "project_tsp_program_2017"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-09T01:30:45.084Z"
submission_ids:
  - "sub_711082b4ca2e2a16"
  - "sub_9dd284695bb54151"
payload:
  _merged_field_values:
    description:
      - "Transit Signal Priority program context for the 2017 expansion status report."
      - "Transit Signal Priority (TSP) program implemented by NYC DOT and MTA to reduce bus travel times at traffic signals"
    document_time_status:
      - "program_context"
      - "active"
    project_name:
      - "Transit Signal Priority Program"
      - "NYC Transit Signal Priority Program"
    project_type:
      - "transit_signal_priority_program"
      - "TSP implementation"
  date_precision: "unknown"
  description: "Transit Signal Priority program context for the 2017 expansion status report."
  document_time_status: "program_context"
  project_family: "signal_priority"
  project_name: "Transit Signal Priority Program"
  project_type: "transit_signal_priority_program"
  status: "active"
evidence_refs:
  -
    block_id: "p001_b0001"
    evidence_id: "tsp_status_2017#p001_b0001"
    page_number: 1
    source_id: "tsp_status_2017"
    source_path: "raw/sources/tsp_status_2017/blocks.jsonl"
    source_quote: "Transit Signal Priority"
    text_sha256: "sha256:7b2bb88cd8d09fce574b6d49d2311ecfe755511bbc75b79fd88672093ff65ab7"
    text_source: "raw_text"
  -
    block_id: "p003_c0002"
    evidence_id: "tsp_report_2017#p003_c0002"
    page_number: 3
    source_id: "tsp_report_2017"
    source_path: "raw/sources/tsp_report_2017/blocks.jsonl"
    text_sha256: "sha256:e4b3c758f3ce1c576549217a8c422533406ce69ddb63d8053328ffa7fcec7b6d"
    text_source: "raw_text"
  -
    block_id: "p003_c0004"
    evidence_id: "tsp_report_2017#p003_c0004"
    page_number: 3
    source_id: "tsp_report_2017"
    source_path: "raw/sources/tsp_report_2017/blocks.jsonl"
    text_sha256: "sha256:347fe536275de3a27bb1a3622a07c5ff62eb78bcfe7c6814bb2f30d484619ec7"
    text_source: "raw_text"
---

<!-- mta-wiki:writer:start -->
## Overview

Transit Signal Priority (TSP) is a NYC DOT/MTA bus-priority program that coordinates buses and traffic signals to reduce the time buses spend stopped at traffic lights. [tsp_report_2017#p003_c0002] [tsp_report_2017#p003_c0003]

Active TSP uses bus location technology to send requests through MTA's Bus Command Center to the Traffic Management Center, where signals can extend green time or shorten red time while preserving pedestrian crossing time. [tsp_report_2017#p004_c0007]

TSP works best where signal timing can be adjusted meaningfully, including two-way streets, intersections with limited cross traffic or turn phases, and predictable bus-running conditions such as bus-lane corridors. [tsp_report_2017#p004_c0002] [tsp_report_2017#p004_c0003]

## 2017 Program Status

TSP began in 2006 on Victory Boulevard in Staten Island, and NYC DOT developed a newer centralized system in 2012 using NYCWiN, existing signal controllers, and MTA Bus Time GPS instead of new equipment at every intersection. [tsp_report_2017#p005_c0004] [tsp_report_2017#p005_c0005] [tsp_report_2017#p005_c0006]

As of June 2017, TSP was provided at about 260 intersections on five SBS corridors: M15 SBS/Lower Manhattan, B44 SBS/Nostrand Avenue, S79 SBS/Hylan Boulevard, Bx41 SBS/Webster Avenue, and B46 SBS/Utica Avenue. [tsp_report_2017#p003_c0004] [tsp_report_2017#p005_c0007]

NYC DOT and MTA were the named program partners, with MTA providing bus-side technology and NYC DOT providing traffic analysis and signal-side implementation. [tsp_report_2017#p003_c0003] [tsp_report_2017#p003_c0006]

## Outcomes And Limits

The report's executive summary says TSP reduced weekday peak bus travel times by about 14 percent on average, with corridor, direction, and time-period savings ranging from less than 1 percent to 25 percent. [tsp_report_2017#p003_c0004]

The companion press release describes the status report as finding an 18 percent daily average improvement across five routes, with individual route improvements between 5 and 30 percent. [tsp_status_2017#p001_b0001]

The evaluated M15 SBS examples include reductions from 18.7 to 15.3 minutes in the north/eastbound AM peak and from 20.0 to 16.8 minutes in the north/eastbound PM peak. [tsp_report_2017#p007_c0004] [tsp_report_2017#p007_c0006]

The evaluated B44 SBS southbound examples include reductions from 26.6 to 21.2 minutes in the AM peak, 27.0 to 22.3 minutes midday, and 29.4 to 22.1 minutes in the PM peak. [tsp_report_2017#p009_c0005] [tsp_report_2017#p009_c0007]

The evaluated Bx41 SBS examples include reductions from 45.1 to 36.4 minutes in the NB/EB AM peak, 51.6 to 41.5 minutes in the NB/EB PM peak, 40.6 to 33.6 minutes in the SB/WB AM peak, and 45.8 to 36.2 minutes in the SB/WB PM peak. [tsp_report_2017#p010_c0001] [tsp_report_2017#p010_c0004] [tsp_report_2017#p010_c0005] [tsp_report_2017#p010_c0007]

The evaluation notes that the travel-time results cover only TSP-equipped corridor segments, not entire bus routes, and may not represent current or any given day's travel times. [tsp_report_2017#p006_c0005] [tsp_report_2017#p007_c0002]

## Expansion

As of July 2017, planned TSP corridors included Main Street/Q44 SBS, LaGuardia/125th Street/M60 SBS, a B46 SBS Utica Avenue extension, a Victory Boulevard S62/S92 extension, Kissena Boulevard/Q25, Hillside Avenue/Q43, Merrick Boulevard/Q5, South Bronx/Bx6 SBS, Southern Brooklyn/B82, Woodhaven Boulevard/Q52/Q53 SBS, and Fordham Road/Bx12 SBS. [tsp_report_2017#p011_c0002] [tsp_report_2017#p011_c0003]

By the end of 2017, NYC DOT said it was ready to implement TSP on M60 SBS, Q44 SBS, the B46 SBS extension, S62/S92, Q25, and Q43 upon MTA procurement of new bus technology. [tsp_report_2017#p011_c0005]

After 2017, NYC DOT planned to add 550 intersections, about 10 routes, by the end of 2020 as MTA made TSP technology available for all buses. [tsp_report_2017#p011_c0006]
<!-- mta-wiki:writer:end -->
