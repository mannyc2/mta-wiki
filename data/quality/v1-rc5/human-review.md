# v1-rc5 Human Spot-Check Packet

Release: `v1-rc5`

This packet is generated from `sample-audit.jsonl` rows where `human_review` is `true`. Review completed on 2026-07-03 UTC at the user's request. The original LLM verdicts below are unchanged; the reviewer decision records calibration agreement with those verdicts.

Rows: `50`
Verdicts: `partially_supported: 6`, `supported: 39`, `unsupported: 3`, `wrong: 2`
Reviewer decisions: `47 agree`, `3 disagree`, `0 needs follow-up`
Agreement rate: `94.00%`

Review standard: records were judged against only their cited evidence blocks. Adjacent page titles/captions were treated as follow-up evidence when they were not included in the record's cited refs.

## 1. route_scoped_relation / supported

- Sample index: `2`
- Record: `relation_has-metric-route-m15-sbs-metric-m15-sbs-sb-wb-midday-after_17f4c76c3e`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: M15 SBS corridor ... Midday (12:30 pm-2:00 pm) ... After TSP 16.7 minutes
- Rationale: The evidence explicitly describes the M15 SBS corridor with a midday after-TSP metric, directly supporting the has_metric relation for route M15-SBS and the midday SB/WB metric.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 2. route_scoped_relation / unsupported

- Sample index: `7`
- Record: `relation_has-metric-route-m79-sbs-metric-wb-dwell-time-3-7pm_160ce1a021`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: 3 PM - 7 PM 7.1 5.6 -21%
- Rationale: The evidence block shows travel time for M79 SBS during 3-7PM, but the record claims a westbound dwell time metric, which is not supported by the text.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 3. route_scoped_relation / supported

- Sample index: `13`
- Record: `relation_has-claim-route-lirr-atlantic-branch-2023-claim-laurelton-bus-replacement-2024_c5c1b7d956`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: bus service will replace train service to/from Locust Manor, Laurelton, and Rosedale
- Rationale: The evidence explicitly states bus replacement service on the Atlantic Branch for Laurelton, directly supporting the claim that the Atlantic Branch has a claim about Laurelton bus replacement.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 4. route_scoped_relation / supported

- Sample index: `27`
- Record: `relation_has-metric-route-m34-sbs-metric-daily-bus-passengers-m34_b160636d84`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: 28,000 daily bus passengers on the M34/M34-A SBS and express buses
- Rationale: The evidence explicitly states the metric value and route name.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 5. route_scoped_relation / supported

- Sample index: `40`
- Record: `relation_has-metric-route-m79-sbs-metric-m79-wb-dwell-3to7-sept2018_ab4750dfdd`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: M79 SBS (Sept 2018) (Minutes) ... 3 PM - 7 PM ... 5.6
- Rationale: The evidence directly shows M79 SBS dwell time metric for the specified time period.
- Reviewer decision: `[ ] agree` `[x] disagree` `[ ] needs follow-up`
- Reviewer note: Disagrees with judge: using only the cited block, this mirrors row 2. The dwell-time caption is adjacent but not cited, so the relation is unsupported by the cited block alone.

## 6. route_scoped_relation / supported

- Sample index: `47`
- Record: `relation_125th-laguardia-launch`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Service launched on Memorial Day, May 25, 2014
- Rationale: The block text explicitly states the launch date for the 125th-LaGuardia SBS route.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 7. route_scoped_relation / supported

- Sample index: `50`
- Record: `relation_has-metric-route-webster-ave-sbs-metric-bx41-sbs-sb-wb-am-peak-before_2874c0fc3a`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: AM Peak (6:30 am-9:30 am) 40.6
- Rationale: The evidence provides the exact travel time for the Bx41 SBS route during AM Peak before TSP, matching the metric.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 8. route_scoped_relation / supported

- Sample index: `55`
- Record: `relation_has-metric-route-q52-q53-sbs-proposed-2015-05-metric-transit-concept2-nb-28pct_03b918e4e1`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Concept 2' shows a -28% reduction for Northbound
- Rationale: The evidence directly reports a 28% reduction for Northbound under Concept 2, matching the metric claim.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 9. route_scoped_relation / supported

- Sample index: `56`
- Record: `relation_has-metric-route-port-jervis-line-2023-ridership-metric-salisbury-mills-oh-travel_c52bf71433`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: 87 minutes to Secaucus Transfer and then NY Penn
- Rationale: The evidence provides a specific travel time (87 minutes) from Salisbury Mills to Manhattan via Port Jervis Line, supporting the metric claim.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 10. route_scoped_relation / supported

- Sample index: `61`
- Record: `relation_has-claim-route-meeting-doc-135451-a-line-claim-signal-modernization-liberty-line_bf7bdee72e`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: signal modernization on the A/C/B/D/F/M lines
- Rationale: The evidence explicitly includes the A line in the signal modernization project.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 11. route_scoped_relation / supported

- Sample index: `63`
- Record: `relation_has-metric-route-webster-ave-sbs-metric-bx41-sbs-sb-wb-am-peak-after_b7382b04b3`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Bx41 SBS route (SB/WB) before and after the Transit Service Plan (TSP)
- Rationale: The block provides travel time data for Bx41 SBS, directly supporting the metric relation.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 12. route_scoped_relation / supported

- Sample index: `67`
- Record: `relation_has-metric-route-bx6-sbs-metric-speed-2020-05_c93a416d80`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Bx6-SBS Peak Period Bus Speeds by Month ... 2020-05 8.8
- Rationale: Evidence explicitly lists Bx6-SBS speeds with May 2020 value, supporting the metric-route association.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 13. route_scoped_relation / supported

- Sample index: `83`
- Record: `relation_b46-limited-on-corridor`
- Kind: `relation`
- Evidence refs: `2`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: B46 LTD generally travels between Kings Plaza and Williamsburg Bridge Plaza
- Rationale: The evidence confirms B46 Limited travel along the Utica Avenue corridor, aligning with the record's claim.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 14. route_scoped_relation / supported

- Sample index: `87`
- Record: `relation_bx9-operates-on-fordham-rd_2`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Bus Ridership: Bx9 - 22,800
- Rationale: The evidence block explicitly lists Bx9 among routes serving Fordham Road.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 15. route_scoped_relation / supported

- Sample index: `95`
- Record: `relation_has-metric-route-125th-laguardia-sbs-metric-m60-tt-7to10am-endtoend-2013_85cfa23618`
- Kind: `relation`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: 7 - 10 AM 59
- Rationale: The block text includes a table showing 59 minutes travel time for 7-10 AM in October 2013, directly supporting the metric.
- Reviewer decision: `[ ] agree` `[x] disagree` `[ ] needs follow-up`
- Reviewer note: Disagrees with judge: the cited table supports the 7-10 AM value, but route/direction/segment are only in adjacent title text, so the row is partially supported by the cited block alone.

## 16. route_scoped_relation / supported

- Sample index: `96`
- Record: `relation_bx41-sbs-on-corridor`
- Kind: `relation`
- Evidence refs: `2`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Based on the existing Bx41 route
- Rationale: The block texts indicate Bx41 SBS operates on the Webster Avenue corridor, supporting the operates_on_corridor relation.
- Reviewer decision: `[ ] agree` `[x] disagree` `[ ] needs follow-up`
- Reviewer note: Disagrees with judge: the cited blocks support Bx41/Bx41 SBS, but the Webster Avenue corridor title/map is adjacent rather than cited, so the row is partially supported by the cited blocks alone.

## 17. treatment_component / supported

- Sample index: `19`
- Record: `treatment_offset-bus-lanes-eliot-metropolitan_2`
- Kind: `treatment_component`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: offset bus lanes between Eliot and Metropolitan Avenues (reducing congestion by eliminating the need for general traffic to merge onto to the overpass)
- Rationale: The block text exactly matches the location and description of the offset bus lanes.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 18. treatment_component / wrong

- Sample index: `26`
- Record: `treatment_sbs-passenger-info-q44`
- Kind: `treatment_component`
- Evidence refs: `2`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: B44 Avenue U 0 B44 Avenue U 0 B44 Knapp Street 1 B44 Avenue U 2
- Rationale: The evidence shows a digital display for B44 bus route, not the Q44 corridor as claimed, thus contradicting the record's location.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 19. treatment_component / unsupported

- Sample index: `34`
- Record: `treatment_protected-bike-lane-ped-islands`
- Kind: `treatment_component`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Toolbox – Pedestrian and Bicycle Safety
- Rationale: The cited block only mentions a generic safety toolbox, lacking specifics about protected bike lanes, pedestrian islands, or the Bronx location.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 20. treatment_component / partially_supported

- Sample index: `35`
- Record: `treatment_bus-lanes-23rd-st-westbound-eastbound`
- Kind: `treatment_component`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Westbound bus lanes: 1 st Ave – 8 th Ave
- Rationale: The evidence supports only the westbound segment; the eastbound segment and location details are absent.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 21. treatment_component / supported

- Sample index: `40`
- Record: `treatment_bus-boarding-islands-flatbush_3`
- Kind: `treatment_component`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: DOT/MTA propose removing 6 of 12 existing curbside bus stops, consolidating them onto 6 boarding islands. • Bus boarding islands would be concentrated at subway stations : Atlantic Av/Barclays Center, Bergen St, and 7 th Av.
- Rationale: Block text directly supports the description and location.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 22. treatment_component / supported

- Sample index: `44`
- Record: `treatment_bus-bulb-stations-cross-bay-spring2015`
- Kind: `treatment_component`
- Evidence refs: `2`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: SBS buses stop at "bus bulb" stations, where the sidewalk is widened to meet the offset bus lane and create space for waiting
- Rationale: Description and component kind are directly supported, and location is supported by 'Cross Bay Blvd'.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 23. treatment_component / supported

- Sample index: `47`
- Record: `treatment_m60-sbs-125th-fare-machines-shelters`
- Kind: `treatment_component`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: 39 fare machines, 6 new bus shelters installed along 125 th Street
- Rationale: The evidence text directly matches the record's description of 39 fare machines and 6 bus shelters along 125th Street.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 24. treatment_component / partially_supported

- Sample index: `49`
- Record: `treatment_tremont-anthony-valentine`
- Kind: `treatment_component`
- Evidence refs: `3`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Tremont Av b/n Anthony Ave and Valentine Ave
- Rationale: Evidence supports location and benefit of increased bus speeds, and a new 11' bus lane, but does not explicitly state it replaces the existing shared lane; the existing shared lane still appears in the potential treatment.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 25. event / supported

- Sample index: `2`
- Record: `event_meeting-doc-135421-feb13-snowstorm`
- Kind: `event`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: The February 13 snowstorm and the day after posed many challenges in bus operations. This February, New York City had snowiest day after more than 700 days without measurable snowfall.
- Rationale: The evidence explicitly mentions the February 13 snowstorm, challenges in bus operations, and the snowiest day after 700+ days, matching the record's description and date.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 26. event / supported

- Sample index: `10`
- Record: `event_2025-jan-nyct-committee_3`
- Kind: `event`
- Evidence refs: `2`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: January 2025 ... Approval of 2025 NYCT Committee Work Plan Preliminary Review of NYCT 2024 Operating Results Preliminary Review of SIR 2024 Operating Results Preliminary Review of MTA Bus 2024 Operating Results
- Rationale: The evidence directly supports the month and the exact list of agenda items, which match the record's description.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 27. event / supported

- Sample index: `21`
- Record: `event_nostrand-reconstruction-start-fall-2011`
- Kind: `event`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Nostrand Avenue Reconstruction: Flushing to Atlantic Avenues
- Rationale: The evidence places this project starting in Fall 2011 on the combined construction schedule.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 28. event / supported

- Sample index: `24`
- Record: `event_open-house-1-2012-05-16-webster`
- Kind: `event`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Public open houses 1. May 16, 2012
- Rationale: The block explicitly lists the public open house on May 16, 2012.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 29. event / supported

- Sample index: `29`
- Record: `event_mta-open-data-law-enacted-2021_2`
- Kind: `event`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: enacted the MTA Open Data Law in 2021
- Rationale: The evidence explicitly confirms the MTA Open Data Law was enacted in 2021 by the Governor and Legislature.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 30. event / supported

- Sample index: `30`
- Record: `event_meeting-doc-147251-fare-toll-increase-mar2025`
- Kind: `event`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Fare/Toll Increase, March 2025 (4% Yield)
- Rationale: The evidence block begins with the exact title and date from the record's description.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 31. event / supported

- Sample index: `54`
- Record: `event_masabi-contract-15590-approved`
- Kind: `event`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: In April 2014, the MTA Board approved the award of a competitively negotiated miscellaneous service contract (15590) to Masabi for the development and implementation of a mobile ticketing program
- Rationale: The block text matches the record's structured claim exactly.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 32. event / supported

- Sample index: `56`
- Record: `event_meeting-doc-115206-safety-report-monthly`
- Kind: `event`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: A monthly report will be provided highlighting key safety performance statistics and indicators.
- Rationale: The block text exactly matches the description and supports the monthly frequency.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 33. event / supported

- Sample index: `60`
- Record: `event_meeting-doc-164866-st-patricks-day-parade`
- Kind: `event`
- Evidence refs: `2`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: The MTA Long Island Rail Road will also be operating extra train service to support increased ridership for the New York City St. Patrick’s Day Parade, which will take place on Monday, March 17th.
- Rationale: Block text directly confirms the parade event, date, and LIRR extra service.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 34. event / partially_supported

- Sample index: `63`
- Record: `event_meeting-doc-146956-tutor-perini-procurement`
- Kind: `event`
- Evidence refs: `3`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Award of a modification to Contract CS179 to replace fire standpipe valves in the East Side Access tunnels and retest the fire suppression system.
- Rationale: The evidence supports the vendor, amount, and contract description, but does not contain a date to support the 'July 2024' timestamp.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 35. event / supported

- Sample index: `65`
- Record: `event_transittalk-utica-ave-nov28`
- Kind: `event`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: We held our 7th TransitTalk event at the Utica Avenue A/C station in Brooklyn on November 28, 2022.
- Rationale: The evidence directly confirms the date, station, and event number.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 36. event / wrong

- Sample index: `69`
- Record: `event_cpc-meeting-20220425`
- Kind: `event`
- Evidence refs: `2`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Monday, 4/25/2022
- Rationale: The evidence provides the exact date with day precision, contradicting the record's claim of unknown date precision.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 37. event / partially_supported

- Sample index: `72`
- Record: `event_113901-jan2024-approve-work-plan`
- Kind: `event`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Approval of 2024 Committee Work Plan
- Rationale: The evidence supports an approval event for a 2024 work plan but does not specify the month as January, so the month precision is unsupported.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 38. metric_claim / supported

- Sample index: `2`
- Record: `metric_2025-monthly-nov`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Nov-25 3.00%
- Rationale: The evidence block explicitly lists the monthly weighted average rate for November 2025 as 3.00%, matching the record's value and period.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 39. metric_claim / supported

- Sample index: `16`
- Record: `metric_jan2025-mta-bus-farebox-actual`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: MTA Bus 15.1 14.5 (0.6) -3.7%
- Rationale: The evidence block includes a table with 'January 2025' and 'MTA Bus' actual farebox revenue as 14.5, exactly matching the record's claim.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 40. metric_claim / supported

- Sample index: `22`
- Record: `metric_meeting-doc-115216-salaries-q12023`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Salaries and wages 1,656 1,568 88
- Rationale: The block text shows salaries and wages of 1,656 for March 31, 2023 and 1,568 for March 31, 2022, matching the record's value and comparison.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 41. metric_claim / partially_supported

- Sample index: `29`
- Record: `metric_may2024-gl_2`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: GL 97 109 -12 -11.0%
- Rationale: The block shows a GL count of 109 for the year 2024 but does not specify the month as May 2024, leaving the period only partially supported.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 42. metric_claim / supported

- Sample index: `34`
- Record: `metric_mta-audit-third-party-questioned-2023`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Third-party questioned were $54.9 million
- Rationale: The cited block explicitly states the third-party questioned costs as $54.9 million for 2023, matching the record's value and period.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 43. metric_claim / supported

- Sample index: `36`
- Record: `metric_meeting-doc-146991-schedule-f`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Schedule F: Personal Service Contracts 5 $ 262.4 M
- Rationale: The cited block states 5 personal service contract actions totaling $262.4M, directly supporting the record.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 44. metric_claim / supported

- Sample index: `42`
- Record: `metric_meeting-doc-128991-dbe-goal-2024-2026`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: DBE Goal Rationale for 2024-2026 has now been established at 20%
- Rationale: The evidence explicitly states the DBE Goal Rationale for 2024-2026 is established at 20%.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 45. metric_claim / partially_supported

- Sample index: `44`
- Record: `metric_monthly-total-revenues-combined-actual`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Total Revenues ... 750.8
- Rationale: The evidence supports the revenue value but lacks explicit mention of the period and scope.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 46. metric_claim / supported

- Sample index: `52`
- Record: `metric_mta-if-peer-investment-24b`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: If MTA were to invest at a rate comparable to the average of its peers ($7.20 capital expenditure per rider), that would equate to $24 billion per year in 2027-dollars
- Rationale: The evidence directly states the $24 billion figure and the context of investing at a peer rate.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 47. metric_claim / supported

- Sample index: `54`
- Record: `metric_fta-cig-5309-obligation`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: CIG 5309 4,599,638,564.00
- Rationale: The evidence block lists the CIG 5309 total obligation amount as exactly that number.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 48. metric_claim / supported

- Sample index: `58`
- Record: `metric_total-expenses-h1-2024`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: Total operating expenses 9,673
- Rationale: The block text explicitly states total operating expenses as 9,673 for the six-month period ended June 30, 2024, matching the record.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 49. metric_claim / supported

- Sample index: `68`
- Record: `metric_meeting-doc-121066-savings-amount`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: savings of 7 percent or $240,000
- Rationale: The block text explicitly states the savings amount and percentage, directly supporting the record's metric value and description.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

## 50. metric_claim / unsupported

- Sample index: `73`
- Record: `metric_bt-nonreimb-ot-actual-ytd2025`
- Kind: `metric_claim`
- Evidence refs: `1`
- Judge: `pioneer-deepseek-flash` / `deepseek-ai/DeepSeek-V4-Flash`
- Relied-on span: December 2025 year-to-date overtime
- Rationale: The cited block discusses variances but does not provide the actual $31.7 million value claimed in the record, so the record is unsupported.
- Reviewer decision: `[x] agree` `[ ] disagree` `[ ] needs follow-up`
- Reviewer note: Agrees with judge after checking the record payload and cited evidence block(s).

