# Source Gap & Caveat Resolution Agent

Agent id: `source-gap-resolution`

## Purpose

Review source gaps as document-scoped caveats, corpus-resolvable gaps, or extraction issues, using wiki/sources search hints before treating something as missing.

## Owns

- source_gap.gap_kind
- source_gap.missing_information
- source-scoped caveats
- cross-source resolution candidates

## Decision Contract

Submit review decisions only as append-only normalization decisions. Do not edit canonical JSONL, wiki pages, source pages, or source literals directly.

- resolved_by_source
- remains_source_scoped_caveat
- convert_to_claim_caveat
- canonical_value
- needs_more_data
- no_change

## Candidate Summary

Candidates: 6

- source_gap_possible_resolution: 5
- source_gap_kind_inventory: 1

## Candidates

### source-gap-resolution:gap:gap_future-reports-suspended-covid

- Category: source_gap_possible_resolution
- Priority: 380
- Record kind: source_gap
- Record id: gap_future-reports-suspended-covid
- Source ids: 14th_street_fall2019_monitoring, 14th_street_winter2020_monitoring, b44_sbs_progress_report_2016, behind_schedule_2025, bronx_bus_network_final_plan_2019, brooklyn_bus_network_draft_plan_with_route_profiles, nyct_key_performance_metrics_doc194001, nyct_key_performance_metrics_june2025, queens_proposed_final_plan_2023
- Title: Review source gap: gap_future_reports_suspended_covid
- Decision options: resolved_by_source, remains_source_scoped_caveat, convert_to_claim_caveat, canonical_value, needs_more_data, no_change

Reasons:
- Source gaps should represent a source-stated caveat or missing information, not a claim that the corpus lacks the fact.
- wiki/sources search found possible resolving/context sources; inspect them before leaving this gap unresolved.

Examples:
```json
[
  {
    "source_gap": {
      "record_id": "gap_future-reports-suspended-covid",
      "display_name": "gap_future_reports_suspended_covid",
      "source_ids": [
        "14th_street_winter2020_monitoring"
      ],
      "local_observation_ids": [
        "gap_future_reports_suspended_covid"
      ],
      "aliases": [],
      "payload": {
        "gap_kind": "data_collection_suspension",
        "gap_text": "Data will not be gathered for future Quarterly Reports until travel conditions return to more typical activity levels due to COVID-19 pandemic",
        "missing_information": "No future quarterly data collected after the Winter 2020 report due to COVID-19 PAUSE order",
        "description": "Report states that data collection is suspended for future reports following the March 22, 2020 NY PAUSE executive order",
        "gap_kind_normalized": "data_collection_suspension"
      }
    },
    "original_evidence": [
      {
        "source_id": "14th_street_winter2020_monitoring",
        "block_id": "p003_c0017",
        "page_number": 3,
        "role": "statement",
        "snippet": "All data included in the Winter 2020 Quarterly Report was collected in January/February 2020, prior to the \"New York State on PAUSE\" executive order issued by Governor Cuomo that went into effect on March 22nd. This ord..."
      }
    ],
    "search_terms": [
      "2020",
      "activity",
      "collected",
      "collection",
      "conditions",
      "covid",
      "executive",
      "following",
      "gathered",
      "levels",
      "march",
      "more",
      "order",
      "pandemic",
      "pause",
      "quarterly"
    ],
    "possible_source_matches": [
      {
        "source_id": "brooklyn_bus_network_draft_plan_with_route_profiles",
        "path": "wiki/sources/brooklyn_bus_network_draft_plan_with_route_profiles.md",
        "score": 203,
        "matched_terms": [
          "2020",
          "activity",
          "collection",
          "conditions",
          "covid",
          "following",
          "gathered",
          "levels",
          "march",
          "more",
          "order",
          "pandemic",
          "pause"
        ],
        "primary_terms_matched": [
          "2020",
          "covid",
          "order",
          "pause",
          "winter"
        ],
        "snippets": [
          "a corresponding date box above it. Fall 2019 : Public Launch • Open houses • Pop-up on-street outreach • Surveys Winter 2020 : Data Analysis and Public Outreach • Published Existing Conditions Report Spring 2020 to Summer 2021 : COVID-19 Pause Spring 2020 to Fall 2022 : Redraw Network and Develop Draft",
          "eys Winter 2020 : Data Analysis and Public Outreach • Published Existing Conditions Report Spring 2020 to Summer 2021 : COVID-19 Pause Spring 2020 to Fall 2022 : Redraw Network and Develop Draft Plan • Publishing Draft Plan (December 2022) August 2021 : Redesign Restart Announced Winter/Spring 2023 : Dra"
        ]
      },
      {
        "source_id": "behind_schedule_2025",
        "path": "wiki/sources/behind_schedule_2025.md",
        "score": 192,
        "matched_terms": [
          "2020",
          "collection",
          "conditions",
          "covid",
          "executive",
          "following",
          "levels",
          "march",
          "more",
          "order",
          "pandemic",
          "pause"
        ],
        "primary_terms_matched": [
          "2020",
          "covid",
          "order",
          "pause"
        ],
        "snippets": [
          "c0004] When the pandemic hit, all transit ridership dropped precipitously as the City and State instituted stay-at-home orders. In subsequent years, however, bus ridership has stagnated at about two-thirds of 2019 levels even as subway ridership continues to recover. 3 Traffic volumes in 2024 are 15% hig",
          "d NYC DOT made progress on bus priority projects, piloting the 14 th Street busway by late 2019. While the onset of the COVID-19 pandemic caused some delays, NYC DOT completed a record number of bus lanes and signal upgrades in 2020. 29 The NYC Streets Plan, codified into law by the City Council in 2021,"
        ]
      },
      {
        "source_id": "bronx_bus_network_final_plan_2019",
        "path": "wiki/sources/bronx_bus_network_final_plan_2019.md",
        "score": 183,
        "matched_terms": [
          "2020",
          "activity",
          "collection",
          "conditions",
          "executive",
          "following",
          "gathered",
          "levels",
          "march",
          "more",
          "order",
          "quarterly"
        ],
        "primary_terms_matched": [
          "2020",
          "order",
          "quarterly",
          "winter"
        ],
        "snippets": [
          "Sundays 5:45 am - 12:00 am 6:00 am - 12:45 am 20* 15* 15* 15* - ``` [p053_c0013] *Frequencies are slightly decreased in order to reallocate resources to the NEW Bx6-SBS extension along Story Av. (combined Bx5 and Bx6-SBS frequencies on Story Av are significantly better than existing Bx5 alone) [p053_c001",
          "insight from the road/field perspective on any routing, bus stop, or service frequency and span proposals. We also hold quarterly meetings with the unions to obtain feedback from them and inform them of upcoming projects. [p171_c0004] In development of our Draft Plan, we held Network Drawing Sessions with ro"
        ]
      },
      {
        "source_id": "nyct_key_performance_metrics_june2025",
        "path": "wiki/sources/nyct_key_performance_metrics_june2025.md",
        "score": 169,
        "matched_terms": [
          "activity",
          "collected",
          "conditions",
          "covid",
          "following",
          "gathered",
          "levels",
          "march",
          "more",
          "order",
          "pandemic"
        ],
        "primary_terms_matched": [
          "collected",
          "covid",
          "order"
        ],
        "snippets": [
          "e transit system. Their summons and arrest activity remains strong, and we are encouraged by their commitment to ensure order and safety are maintained within the transit system. The MTA also continues to offer our support and partner with the NYPD to deploy internal resources, like the MTAPD Transit Ops",
          "ncern, suggestion, and comment contributed to a more responsive and community-centered plan. [p029_c0008] Comments were collected in a variety of ways such as surveys, comment cards, the online project comment portal, geocoded comments through the Remix software platform, workshop comments, and staff taking"
        ]
      },
      {
        "source_id": "nyct_key_performance_metrics_doc194001",
        "path": "wiki/sources/nyct_key_performance_metrics_doc194001.md",
        "score": 148,
        "matched_terms": [
          "activity",
          "conditions",
          "covid",
          "following",
          "levels",
          "more",
          "order",
          "pandemic",
          "quarterly"
        ],
        "primary_terms_matched": [
          "covid",
          "order",
          "quarterly",
          "winter"
        ],
        "snippets": [
          "customers, and estimated number of non-paying customers, on an average weekday [p014_c0004] *Fare Evasion reports on a quarterly basis October and November data not yet available. To be reported January 2026 > [p014_c0005] Year Month Paid (Millions) Unpaid (Millions) Total (Millions) 2022 D 3.5 0.5 4.0 2022",
          "e transit system. Their summons and arrest activity remains strong, and we are encouraged by their commitment to ensure order and safety are maintained within the transit system throughout the fall. The MTA also continues to offer our support and partner with the NYPD to deploy internal resources like th"
        ]
      },
      {
        "source_id": "b44_sbs_progress_report_2016",
        "path": "wiki/sources/b44_sbs_progress_report_2016.md",
        "score": 147,
        "matched_terms": [
          "activity",
          "collected",
          "collection",
          "conditions",
          "executive",
          "following",
          "levels",
          "march",
          "more",
          "order"
        ],
        "primary_terms_matched": [
          "collected",
          "order",
          "winter"
        ],
        "snippets": [
          "destrians, general traffic, parking activity, and the needs of business owners and shoppers. This diversity of data was collected in order to be able to generate regulatory and street design solutions for the project corridors that would make buses faster, while maintaining traffic flow and local access. NYC",
          "neral traffic, parking activity, and the needs of business owners and shoppers. This diversity of data was collected in order to be able to generate regulatory and street design solutions for the project corridors that would make buses faster, while maintaining traffic flow and local access. NYC DOT & NY"
        ]
      },
      {
        "source_id": "queens_proposed_final_plan_2023",
        "path": "wiki/sources/queens_proposed_final_plan_2023.md",
        "score": 142,
        "matched_terms": [
          "2020",
          "conditions",
          "covid",
          "following",
          "gathered",
          "march",
          "more",
          "pandemic",
          "pause"
        ],
        "primary_terms_matched": [
          "2020",
          "covid",
          "pause"
        ],
        "snippets": [
          "rk and Develop Original Draft Plan Published Original Draft Plan Q1 2020 Original Draft Plan Public Outreach March 2020 Covid-19 Pause 18-month public pause December 2021 Original Draft Plan withdrawn March 2022 Develop New Draft Plan Published New Draft Plan Q2/Q3 2022 New Draft Plan Public Outreach Q4",
          "velop Original Draft Plan Published Original Draft Plan Q1 2020 Original Draft Plan Public Outreach March 2020 Covid-19 Pause 18-month public pause December 2021 Original Draft Plan withdrawn March 2022 Develop New Draft Plan Published New Draft Plan Q2/Q3 2022 New Draft Plan Public Outreach Q4 2023 Deve"
        ]
      },
      {
        "source_id": "14th_street_fall2019_monitoring",
        "path": "wiki/sources/14th_street_fall2019_monitoring.md",
        "score": 141,
        "matched_terms": [
          "2020",
          "activity",
          "collected",
          "collection",
          "following",
          "gathered",
          "more",
          "quarterly"
        ],
        "primary_terms_matched": [
          "2020",
          "collected",
          "quarterly",
          "winter"
        ],
        "snippets": [
          "[p003_c0008] REPORT RELEASE SCHEDULE: [p003_c0009] Preliminary Report: Fall 2019 [p003_c0010] Quarterly Report: Winter 2020 [p003_c0011] Quarterly Report: Spring 2020 [p003_c0012] Quarterly Report: Summer 2020 [p003_c0013] Quarterly Report: Fall 2020 [p003_c0014] Quarterly Report: Winter 2021 [p003_c00",
          "he TTP Pilot Project. ### [p003_c0008] REPORT RELEASE SCHEDULE: [p003_c0009] Preliminary Report: Fall 2019 [p003_c0010] Quarterly Report: Winter 2020 [p003_c0011] Quarterly Report: Spring 2020 [p003_c0012] Quarterly Report: Summer 2020 [p003_c0013] Quarterly Report: Fall 2020 [p003_c0014] Quarterly Report: W"
        ]
      }
    ],
    "searched_source_pages": 48
  }
]
```

### source-gap-resolution:gap:gap_missing-bus-speed-reliability-data

- Category: source_gap_possible_resolution
- Priority: 380
- Record kind: source_gap
- Record id: gap_missing-bus-speed-reliability-data
- Source ids: behind_schedule_2025, better_buses_action_plan_2019, bronx_bus_network_final_plan_2019, brooklyn_bus_network_draft_plan_with_route_profiles, bus_lane_camera_report_2024, nyct_key_performance_metrics_doc194001, nyct_key_performance_metrics_june2025, open_data_plan_2024_update, speeding_up_slowly_2025
- Title: Review source gap: Missing bus speed, reliability, and ridership data
- Decision options: resolved_by_source, remains_source_scoped_caveat, convert_to_claim_caveat, canonical_value, needs_more_data, no_change

Reasons:
- Source gaps should represent a source-stated caveat or missing information, not a claim that the corpus lacks the fact.
- wiki/sources search found possible resolving/context sources; inspect them before leaving this gap unresolved.

Examples:
```json
[
  {
    "source_gap": {
      "record_id": "gap_missing-bus-speed-reliability-data",
      "display_name": "Missing bus speed, reliability, and ridership data",
      "source_ids": [
        "bus_lane_camera_report_2024"
      ],
      "local_observation_ids": [
        "gap_missing_bus_speed_reliability_data"
      ],
      "aliases": [],
      "payload": {
        "gap_kind": "data_not_collected",
        "missing_information": "Bus speeds, reliability, and ridership before and after implementation of the bus rapid transit demonstration program for each bus route, including current statistics",
        "description": "2024 legislation added new reporting requirements not yet collected for 2022-2023. Next two-year report will incorporate this data.",
        "affected_period": "2022-2023",
        "gap_kind_normalized": "data_not_collected"
      }
    },
    "original_evidence": [
      {
        "source_id": "bus_lane_camera_report_2024",
        "block_id": "p003_c0004",
        "page_number": 3,
        "role": "gap_description",
        "snippet": "The expanded legislative authority which went into effect in 2024 included additional reporting requirements on bus speeds, reliability, and ridership. newer reporting components are not a part of this report, as data w..."
      },
      {
        "source_id": "bus_lane_camera_report_2024",
        "block_id": "p003_c0005",
        "page_number": 3,
        "role": "footnote_details",
        "snippet": "1 The legislation that went into effect in 2024 requires an itemized list of expenditures made by the MTA, as well as a detailed report of the bus speeds, reliability, and ridership before and after implementation of th..."
      }
    ],
    "search_terms": [
      "2022",
      "2023",
      "2024",
      "added",
      "additional",
      "authority",
      "bus",
      "collected",
      "components",
      "current",
      "demonstration",
      "each",
      "effect",
      "expanded",
      "implementation",
      "including"
    ],
    "possible_source_matches": [
      {
        "source_id": "brooklyn_bus_network_draft_plan_with_route_profiles",
        "path": "wiki/sources/brooklyn_bus_network_draft_plan_with_route_profiles.md",
        "score": 359,
        "matched_terms": [
          "2022",
          "2023",
          "2024",
          "added",
          "additional",
          "authority",
          "bus",
          "components",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "primary_terms_matched": [
          "2022",
          "2023",
          "2024",
          "additional",
          "authority",
          "bus",
          "components",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "snippets": [
          "5_c0005] Following the publication of this report, the MTA will host a range of public meetings and workshops to gather additional input from Brooklyn bus customers and residents. Your invaluable input will inform and shape the Proposed Final Plan. This process is laid out in more detail within the report. >",
          "Public Outreach • Published Existing Conditions Report Spring 2020 to Summer 2021 : COVID-19 Pause Spring 2020 to Fall 2022 : Redraw Network and Develop Draft Plan • Publishing Draft Plan (December 2022) August 2021 : Redesign Restart Announced Winter/Spring 2023 : Draft Plan Release and Public Outreac"
        ]
      },
      {
        "source_id": "nyct_key_performance_metrics_june2025",
        "path": "wiki/sources/nyct_key_performance_metrics_june2025.md",
        "score": 349,
        "matched_terms": [
          "2022",
          "2023",
          "2024",
          "additional",
          "authority",
          "bus",
          "collected",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "primary_terms_matched": [
          "2022",
          "2023",
          "2024",
          "additional",
          "authority",
          "bus",
          "collected",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "snippets": [
          "023 May 95 2023 June 94 2023 July 94 2023 August 94 2023 September 94 2023 October 94 2023 November 91 2023 December 93 2024 January 95 2024 February 95 2024 March 95 2024 April 94 2024 May 94 2024 June 94 2024 July 95 2024 August 95 2024 September 94 2024 October 92 2024 November 92 2024 December 93 20",
          "h Service Delivered (%) 2022 July 92 2022 August 91 2022 September 93 2022 October 94 2022 November 94 2022 December 94 2023 January 96 2023 February 95 2023 March 96 2023 April 95 2023 May 95 2023 June 94 2023 July 94 2023 August 94 2023 September 94 2023 October 94 2023 November 91 2023 December 93 20"
        ]
      },
      {
        "source_id": "better_buses_action_plan_2019",
        "path": "wiki/sources/better_buses_action_plan_2019.md",
        "score": 331,
        "matched_terms": [
          "2022",
          "additional",
          "authority",
          "bus",
          "collected",
          "components",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "primary_terms_matched": [
          "2022",
          "additional",
          "authority",
          "bus",
          "collected",
          "components",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "snippets": [
          "# NYC DOT Better Buses Action Plan source_id: better_buses_action_plan_2019 citation: cite block ids exactly as shown in square brackets document: 542 block(s) ## Page 1 ### [p001_c0001] Better Bus",
          "h SBS and local bus networks. ### [p010_c0008] Enforcement [p010_c0009] Camera Enforcement The City currently has legal authority to install bus lane cameras along 16 corridors. We will advocate for authority to expand this enforcement approach to other routes. [p010_c0010] On-bus Camera Enforcement MTA test"
        ]
      },
      {
        "source_id": "behind_schedule_2025",
        "path": "wiki/sources/behind_schedule_2025.md",
        "score": 329,
        "matched_terms": [
          "2022",
          "2023",
          "2024",
          "added",
          "additional",
          "authority",
          "bus",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "primary_terms_matched": [
          "2022",
          "2023",
          "2024",
          "additional",
          "authority",
          "bus",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "snippets": [
          "ip has stagnated at about two-thirds of 2019 levels even as subway ridership continues to recover. 3 Traffic volumes in 2024 are 15% higher than in 2019, indicating that New Yorkers are choosing driving over public transit. [p004_c0005] Recognizing the downward trajectory of bus ridership and performanc",
          "rgets mandated by the Streets Plan, building or upgrading just 27.6 miles out of the 50 miles required between 2022 and 2023. In 2024, NYC DOT painted just under 5.5 miles of new bus lanes – the lowest number since 2018. In comparison, the City installed 29.2 miles of new lanes between 2019 and 2020. Of"
        ]
      },
      {
        "source_id": "nyct_key_performance_metrics_doc194001",
        "path": "wiki/sources/nyct_key_performance_metrics_doc194001.md",
        "score": 329,
        "matched_terms": [
          "2022",
          "2023",
          "2024",
          "added",
          "additional",
          "authority",
          "bus",
          "current",
          "demonstration",
          "each",
          "effect",
          "expanded",
          "including"
        ],
        "primary_terms_matched": [
          "2022",
          "2023",
          "2024",
          "additional",
          "authority",
          "bus",
          "current",
          "demonstration",
          "each",
          "effect",
          "expanded",
          "including"
        ],
        "snippets": [
          "2022 95.0 M 2022 95.5 A 2022 95.0 M 2022 95.0 J 2022 94.5 J 2022 94.0 A 2022 94.0 S 2022 94.0 O 2022 91.5 N 2022 92.5 D 2023 94.5 J 2023 95.0 F 2023 94.5 M 2023 94.0 A 2023 94.0 M 2023 94.0 J 2023 94.5 J 2023 95.0 A 2023 94.5 S 2023 94.0 O 2023 92.5 N 2023 93.0 D 2024 95.5 J 2024 96.0 F 2024 95.5 M 2024",
          "2023 94.5 M 2023 94.0 A 2023 94.0 M 2023 94.0 J 2023 94.5 J 2023 95.0 A 2023 94.5 S 2023 94.0 O 2023 92.5 N 2023 93.0 D 2024 95.5 J 2024 96.0 F 2024 95.5 M 2024 95.0 A 2024 94.5 M 2024 94.5 J 2024 94.5 J 2024 94.5 A 2024 94.5 S 2024 94.5 O 2024 94.5 N 2024 94.5 D 2025 95.5 J 2025 96.0 F 2025 95.5 M 2025"
        ]
      },
      {
        "source_id": "open_data_plan_2024_update",
        "path": "wiki/sources/open_data_plan_2024_update.md",
        "score": 305,
        "matched_terms": [
          "2023",
          "2024",
          "added",
          "additional",
          "authority",
          "bus",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "primary_terms_matched": [
          "2023",
          "2024",
          "additional",
          "authority",
          "bus",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "snippets": [
          "# MTA Open Data Plan 2024 Annual Update source_id: open_data_plan_2024_update citation: cite block ids exactly as shown in square brackets document: 40 block(s) ## Page 1 > [p001_c0001] The logo of the",
          "s shown in square brackets document: 40 block(s) ## Page 1 > [p001_c0001] The logo of the Metropolitan Transportation Authority (MTA), featuring the letters \"MTA\" in white inside a blue circle. ### [p001_c0002] THE METROPOLITAN TRANSPORTATION AUTHORITY OPEN DATA PLAN 2024 ANNUAL UPDATE > [p001_c0003] A pho"
        ]
      },
      {
        "source_id": "speeding_up_slowly_2025",
        "path": "wiki/sources/speeding_up_slowly_2025.md",
        "score": 292,
        "matched_terms": [
          "2022",
          "2023",
          "2024",
          "additional",
          "authority",
          "bus",
          "current",
          "each",
          "effect",
          "implementation",
          "including"
        ],
        "primary_terms_matched": [
          "2022",
          "2023",
          "2024",
          "additional",
          "authority",
          "bus",
          "current",
          "each",
          "effect",
          "implementation",
          "including"
        ],
        "snippets": [
          "d weekend hours. Between the five boroughs, Brooklyn has the highest bus ridership, with over 104 million passengers in 2023, compared to Staten Island, which has the lowest bus ridership at a little over 20 million passengers. Bus ridership has increased over the years since the COVID-19 pandemic, but",
          "ndependent Budget Office (IBO) examines DOT's progress toward its stated goals to improve bus speeds. IBO also provides additional context for the community impacts associated with the lack of timely and reliable public buses. ### [p005_c0007] Bus Service and Ridership in New York City [p005_c0008] MTA riders"
        ]
      },
      {
        "source_id": "bronx_bus_network_final_plan_2019",
        "path": "wiki/sources/bronx_bus_network_final_plan_2019.md",
        "score": 281,
        "matched_terms": [
          "2024",
          "added",
          "additional",
          "authority",
          "bus",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "primary_terms_matched": [
          "2024",
          "additional",
          "authority",
          "bus",
          "current",
          "each",
          "effect",
          "expanded",
          "implementation",
          "including"
        ],
        "snippets": [
          "# Bronx Bus Network Redesign Final Plan source_id: bronx_bus_network_final_plan_2019 citation: cite block ids exactly as shown in square brackets document: 2179 block(s) ## Page 1 > [p001_",
          "go? What will the Bronx look like in 20 years? See: Service analysis [p165_c0012] MetroCard – the Metropolitan Transit Authority’s predominant fare payment method. [p165_c0013] Network-level – in contrast with route-level , network-level improvements pertain to the Bronx Bus Network as a whole, rather than"
        ]
      }
    ],
    "searched_source_pages": 48
  }
]
```

### source-gap-resolution:gap:gap_report-correction-noted

- Category: source_gap_possible_resolution
- Priority: 380
- Record kind: source_gap
- Record id: gap_report-correction-noted
- Source ids: behind_schedule_2025, better_buses_action_plan_2019, bronx_bus_network_final_plan_2019, bronx_bus_network_final_plan_addendum_2021, brooklyn_bus_network_draft_plan_with_route_profiles, m86_sbs_progress_report_2017, queens_proposed_final_plan_2023, speeding_up_slowly_2025, tsp_report_2017
- Title: Review source gap: gap_report_correction_noted
- Decision options: resolved_by_source, remains_source_scoped_caveat, convert_to_claim_caveat, canonical_value, needs_more_data, no_change

Reasons:
- Source gaps should represent a source-stated caveat or missing information, not a claim that the corpus lacks the fact.
- wiki/sources search found possible resolving/context sources; inspect them before leaving this gap unresolved.

Examples:
```json
[
  {
    "source_gap": {
      "record_id": "gap_report-correction-noted",
      "display_name": "gap_report_correction_noted",
      "source_ids": [
        "tsp_report_2017"
      ],
      "local_observation_ids": [
        "gap_report_correction_noted"
      ],
      "aliases": [],
      "payload": {
        "gap_kind": "correction",
        "gap_text": "Correction: After publishing the TSP report in July 2017, we have since found it contains some data that is no longer accurate. The report has been updated.",
        "missing_information": "The specific data that was inaccurate and the correction details are not stated.",
        "gap_kind_normalized": "correction"
      }
    },
    "original_evidence": [
      {
        "source_id": "tsp_report_2017",
        "block_id": "p011_c0007",
        "page_number": 11,
        "snippet": "Correction: After publishing the TSP report in July 2017, we have since found it contains some data that is no longer accurate. The report has been updated."
      }
    ],
    "search_terms": [
      "2017",
      "accurate",
      "been",
      "contains",
      "correction",
      "details",
      "found",
      "inaccurate",
      "july",
      "longer",
      "publishing",
      "since",
      "some",
      "specific",
      "stated",
      "tsp"
    ],
    "possible_source_matches": [
      {
        "source_id": "brooklyn_bus_network_draft_plan_with_route_profiles",
        "path": "wiki/sources/brooklyn_bus_network_draft_plan_with_route_profiles.md",
        "score": 140,
        "matched_terms": [
          "2017",
          "been",
          "contains",
          "details",
          "found",
          "longer",
          "publishing",
          "since",
          "some",
          "specific",
          "tsp"
        ],
        "primary_terms_matched": [
          "details",
          "specific"
        ],
        "snippets": [
          "3] This Draft Plan introduces a proposed Brooklyn bus network with routes, stops, and generalized frequencies that have been reimagined to meet the needs of current and future customers. [p005_c0004] In this report, we will discuss how we got here, what we've heard from customers, and how we have integr",
          "B2000, B2001, B2002, B2003, B2004, B2005, B2006, B2007, B2008, B2009, B2010, B2011, B2012, B2013, B2014, B2015, B2016, B2017, B2018, B2019, B2020, B2021, B2022, B2023, B2024, B2025, B2026, B2027, B2028, B2029, B2030, B2031, B2032, B2033, B2034, B2035, B2036, B2037, B2038, B2039, B2040, B2041, B2042, B20"
        ]
      },
      {
        "source_id": "behind_schedule_2025",
        "path": "wiki/sources/behind_schedule_2025.md",
        "score": 133,
        "matched_terms": [
          "2017",
          "been",
          "contains",
          "found",
          "july",
          "longer",
          "since",
          "some",
          "specific",
          "stated",
          "tsp"
        ],
        "primary_terms_matched": [
          "specific",
          "stated"
        ],
        "snippets": [
          "YC DOT has not disclosed the locations or routes equipped with this technology or published any evaluations of it since 2017. • MTA followed through on its commitment to redesign bus networks in the Bronx, Brooklyn, and Queens but the final plans scaled back some of the most transformative changes, like",
          "e. [p004_c0003] Despite the central role buses play in moving people throughout the city, bus ridership in New York has been in free fall for over 20 years. 1 The MTA-managed bus system lost millions of riders starting in 2002, when over 2 million people were riding buses every day. This downturn largel"
        ]
      },
      {
        "source_id": "better_buses_action_plan_2019",
        "path": "wiki/sources/better_buses_action_plan_2019.md",
        "score": 114,
        "matched_terms": [
          "2017",
          "been",
          "details",
          "found",
          "longer",
          "since",
          "some",
          "specific",
          "tsp"
        ],
        "primary_terms_matched": [
          "details",
          "specific"
        ],
        "snippets": [
          "include any or all of the following: Stakeholder Briefings: Briefings involve discussions and presentations on project details to inform and gather feedback. Examples of stakeholders consulted on projects include elected officials, community boards, civic associations, business improvement districts (BIDs",
          "measures that speed up buses. In addition to and complementing MTA's service change proposals, DOT will create borough-specific Better Buses Action plans that will set the stage for bus priority project implementation in 2020 and beyond. Future bus priority projects will include those that complement the c"
        ]
      },
      {
        "source_id": "bronx_bus_network_final_plan_2019",
        "path": "wiki/sources/bronx_bus_network_final_plan_2019.md",
        "score": 114,
        "matched_terms": [
          "been",
          "details",
          "found",
          "july",
          "longer",
          "since",
          "some",
          "specific",
          "tsp"
        ],
        "primary_terms_matched": [
          "details",
          "specific"
        ],
        "snippets": [
          "g at Pelham Bay Park 6 Station during off-peak periods > [p018_c0004] A detailed map of the Bronx Bus Network Redesign, specifically focusing on the Co-op City area. The map shows various bus routes with route numbers (e.g., 12, 23, 25, 26, 28, 30, 38, 50, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80,",
          "quency network that serves the largest number of riders at the times when they need service the most. While this report details changes being made to the routes, frequencies, and spans of service that make up the Bronx Bus Network, it also demonstrates our new approach to providing bus service—one that dyn"
        ]
      },
      {
        "source_id": "speeding_up_slowly_2025",
        "path": "wiki/sources/speeding_up_slowly_2025.md",
        "score": 114,
        "matched_terms": [
          "2017",
          "been",
          "found",
          "july",
          "longer",
          "since",
          "some",
          "specific",
          "stated"
        ],
        "primary_terms_matched": [
          "specific",
          "stated"
        ],
        "snippets": [
          "ifts. ### [p006_c0007] City Efforts to Enhance Bus Service [p006_c0008] Concerns about slow buses—as highlighted in the 2017 City Comptroller report —are not new, nor are New York City bus speeds reflective of a general trend across urban bus systems. Rather, New York City buses are among the slowest bu",
          "stion pricing on bus speeds. Slow bus speeds are a concern across the entire City of New York, while congestion pricing specifically applies to Central and Lower Manhattan. While speeds may improve in central and Lower Manhattan, speeds in the surrounding communities may decrease due to the spillover effect"
        ]
      },
      {
        "source_id": "bronx_bus_network_final_plan_addendum_2021",
        "path": "wiki/sources/bronx_bus_network_final_plan_addendum_2021.md",
        "score": 111,
        "matched_terms": [
          "been",
          "details",
          "longer",
          "publishing",
          "since",
          "some",
          "specific",
          "tsp"
        ],
        "primary_terms_matched": [
          "details",
          "specific"
        ],
        "snippets": [
          "n March 2020 to pause the bus network redesign initiative to ensure that resources were concentrated where needed most, specifically moving our essential workers as quickly and safely as possible. The project remained paused for approximately 18 months. • In August 2021, Acting MTA Chair and CEO Janno Liebe",
          "nd Select Bus Service routes. There are currently no changes to express routes at this time. • The next step would have been to take the proposed Final Plan to the MTA’s Board of Directors for a vote. Due to the COVID-19 Pandemic, we made the difficult decision in March 2020 to pause the bus network red"
        ]
      },
      {
        "source_id": "queens_proposed_final_plan_2023",
        "path": "wiki/sources/queens_proposed_final_plan_2023.md",
        "score": 110,
        "matched_terms": [
          "2017",
          "been",
          "contains",
          "details",
          "longer",
          "since",
          "some",
          "specific"
        ],
        "primary_terms_matched": [
          "details",
          "specific"
        ],
        "snippets": [
          "## Page 4 ### [p004_c0001] Why Redesign the Queens Bus Network? [p004_c0002] Bus service performance and ridership has been decreasing over the past few years ### [p004_c0003] Slow Speeds - [p004_c0004] • Bus speeds continue to decline year by year • Queens bus speeds decreased 3% from 2015 to 2019 ###",
          "identified, further improving the connectivity and accessibility of the network Proposed bus stop changes Concerns with specific proposed bus stop removals and certain routes with wider bus stop spacing Re-evaluated proposed stop spacing and maintained specific stops based on customer recommendations Propos"
        ]
      },
      {
        "source_id": "m86_sbs_progress_report_2017",
        "path": "wiki/sources/m86_sbs_progress_report_2017.md",
        "score": 104,
        "matched_terms": [
          "2017",
          "been",
          "found",
          "july",
          "since",
          "some",
          "specific",
          "stated"
        ],
        "primary_terms_matched": [
          "specific",
          "stated"
        ],
        "snippets": [
          "# M86 Select Bus Service Progress Report source_id: m86_sbs_progress_report_2017 citation: cite block ids exactly as shown in square brackets document: 154 block(s) ## Page 1 ### [p001_c0001] M86 Select Bus Service Progress Report [p001_c0002] Eastbound Rout",
          "6 bus route serving the corridor had the highest per-mile ridership in New York City, in recent years the ridership had been dropping due to rising travel times and declining reliability. This made the route a strong candidate for Select Bus Service (SBS) conversion. [p002_c0003] Through targeted street"
        ]
      }
    ],
    "searched_source_pages": 48
  }
]
```

### source-gap-resolution:gap:gap_winter-bike-data-unavailable

- Category: source_gap_possible_resolution
- Priority: 380
- Record kind: source_gap
- Record id: gap_winter-bike-data-unavailable
- Source ids: 14th_street_fall2019_monitoring, 14th_street_winter2020_monitoring, b44_sbs_progress_report_2016, behind_schedule_2025, better_buses_action_plan_2019, bronx_bus_network_final_plan_2019, m86_sbs_progress_report_2017, nyct_key_performance_metrics_june2025, speeding_up_slowly_2025
- Title: Review source gap: gap_winter_bike_data_unavailable
- Decision options: resolved_by_source, remains_source_scoped_caveat, convert_to_claim_caveat, canonical_value, needs_more_data, no_change

Reasons:
- Source gaps should represent a source-stated caveat or missing information, not a claim that the corpus lacks the fact.
- wiki/sources search found possible resolving/context sources; inspect them before leaving this gap unresolved.

Examples:
```json
[
  {
    "source_gap": {
      "record_id": "gap_winter-bike-data-unavailable",
      "display_name": "gap_winter_bike_data_unavailable",
      "source_ids": [
        "14th_street_winter2020_monitoring"
      ],
      "local_observation_ids": [
        "gap_winter_bike_data_unavailable"
      ],
      "aliases": [],
      "payload": {
        "gap_kind": "data_unavailable",
        "gap_text": "Pre-implementation data from winter is not available for comparison for bicycle volumes",
        "missing_information": "Winter pre-implementation bike volume data not available for before/after comparison",
        "description": "Bicycle ridership is subject to seasonal factors; pre-implementation winter data not available",
        "gap_kind_normalized": "data_unavailable"
      }
    },
    "original_evidence": [
      {
        "source_id": "14th_street_winter2020_monitoring",
        "block_id": "p015_c0005",
        "page_number": 15,
        "role": "statement",
        "snippet": "➔ Even more than other transportation modes, bicycle ridership is highly subject to seasonal factors such as weather conditions. Pre-implementation data from winter is not available for comparison, therefore changes in..."
      }
    ],
    "search_terms": [
      "bicycle",
      "bike",
      "comparison",
      "factors",
      "implementation",
      "pre",
      "ridership",
      "seasonal",
      "subject",
      "unavailable",
      "volume",
      "volumes",
      "winter"
    ],
    "possible_source_matches": [
      {
        "source_id": "14th_street_fall2019_monitoring",
        "path": "wiki/sources/14th_street_fall2019_monitoring.md",
        "score": 196,
        "matched_terms": [
          "bicycle",
          "bike",
          "comparison",
          "implementation",
          "pre",
          "ridership",
          "volume",
          "volumes",
          "winter"
        ],
        "primary_terms_matched": [
          "bike",
          "comparison",
          "implementation",
          "pre",
          "volume",
          "winter"
        ],
        "snippets": [
          "# 14th Street Transit and Truck Priority Pilot Preliminary Report Fall 2019 source_id: 14th_street_fall2019_monitoring citation: cite block ids exactly as shown in square brackets document: 355 block(s) ## Page 1 ### [p001_c000",
          "0005] 2019 CITI BIKE STATION - TRIP ORIGINS [p019_c0006] * Station data only available in 2019, excluded from 2018-2019 comparison ### [p019_c0007] 2019 CITI BIKE STATION - TRIP DESTINATIONS [p019_c0008] * Station data only available in 2019, excluded from 2018-2019 comparison ### [p019_c0009] PEAK HOUR RIDER"
        ]
      },
      {
        "source_id": "speeding_up_slowly_2025",
        "path": "wiki/sources/speeding_up_slowly_2025.md",
        "score": 181,
        "matched_terms": [
          "bicycle",
          "bike",
          "comparison",
          "factors",
          "implementation",
          "pre",
          "ridership",
          "subject",
          "volume"
        ],
        "primary_terms_matched": [
          "bike",
          "comparison",
          "implementation",
          "pre",
          "volume"
        ],
        "snippets": [
          "ally mandated targets for the construction of new protected bus lanes, transit signal priority intersections, protected bike lanes, and more. ### [p007_c0008] Buses in New York City Are Still at 2019 Speeds [p007_c0009] IBO conducted an analysis of publicly available bus speed data from New York State O",
          "er the most recent Preliminary Budget, but large year-to-year fluctuations in capital projects are common and make this comparison difficult to interpret. [p012_c0006] Regarding DOT's claim of staffing shortages, IBO's analysis of DOT administrative staffing data shows a relatively constant overall staffing l"
        ]
      },
      {
        "source_id": "b44_sbs_progress_report_2016",
        "path": "wiki/sources/b44_sbs_progress_report_2016.md",
        "score": 172,
        "matched_terms": [
          "comparison",
          "factors",
          "implementation",
          "pre",
          "ridership",
          "volume",
          "volumes",
          "winter"
        ],
        "primary_terms_matched": [
          "comparison",
          "implementation",
          "pre",
          "volume",
          "winter"
        ],
        "snippets": [
          "2nd Av), B44 (Nostrand Av / Rogers Av), and S79 (Hylan Blvd). A legend at the bottom right indicates that blue lines represent 'Other Existing SBS' and a north arrow is also present. [p006_c0008] _Map of SBS Routes Currently in Operation_ [p006_c0009] Other Existing SBS [p006_c0010] _6_ ## Page 7 ##",
          "a steady linear increase in year-over-year ridership, so the trend in increasing ridership is not limited to May-to-May comparisons. [p029_c0004] Due to bus lanes and signal timing changes on Rogers Avenue, the resulting 33-37% travel time reductions on the B44 SBS and 7-11% travel time reductions on the B49"
        ]
      },
      {
        "source_id": "m86_sbs_progress_report_2017",
        "path": "wiki/sources/m86_sbs_progress_report_2017.md",
        "score": 157,
        "matched_terms": [
          "comparison",
          "factors",
          "implementation",
          "pre",
          "ridership",
          "subject",
          "volume",
          "volumes"
        ],
        "primary_terms_matched": [
          "comparison",
          "implementation",
          "pre",
          "volume"
        ],
        "snippets": [
          "de of the intersection once capital work is complete. ### [p009_c0008] Crosstown Traffic [p009_c0009] Peak hour traffic volumes were collected at all access points to the Central Park Transverse Road. Volumes were analyzed during the peak hours of 7:45 am-8:45 am and 5:15 pm-6:15 pm both before and after",
          "ion. [p006_c0010] Since the introduction of the SBS service, ridership has seen significant increases month-to-month in comparison to 2014/2015 numbers. Ridership grew by an average of 7% in the first 14 months of SBS service. Note that the ridership measured in August and September 2015, and March and April"
        ]
      },
      {
        "source_id": "bronx_bus_network_final_plan_2019",
        "path": "wiki/sources/bronx_bus_network_final_plan_2019.md",
        "score": 155,
        "matched_terms": [
          "bike",
          "implementation",
          "pre",
          "ridership",
          "volume",
          "volumes",
          "winter"
        ],
        "primary_terms_matched": [
          "bike",
          "implementation",
          "pre",
          "volume",
          "winter"
        ],
        "snippets": [
          "ents 15 Chapter 3 Bus Priority Improvements 22 Chapter 4 Route-Level Improvements 36 Chapter 5 Next Steps: Outreach and Implementation 40 Chapter 6 Redesigned Routes: Individual Route Proposals 42 Chapter 7 Appendices 163 [p002_c0003] _The Bronx Bus Network Redesign: Final Plan | 2_ ## Page 3 ### [p003_c0001] 1",
          "ridge and Grand Concourse, then shifting east at Jerome Avenue to become East 167 Street. It is a wide boulevard with a bike lane, two travel lanes, and curbside parking in each direction. The Final Plan proposes increased frequency on both the Bx11 and the Bx13 to 8 minutes or better all day. More freq"
        ]
      },
      {
        "source_id": "behind_schedule_2025",
        "path": "wiki/sources/behind_schedule_2025.md",
        "score": 150,
        "matched_terms": [
          "comparison",
          "implementation",
          "pre",
          "ridership",
          "unavailable",
          "volume",
          "volumes"
        ],
        "primary_terms_matched": [
          "comparison",
          "implementation",
          "pre",
          "volume"
        ],
        "snippets": [
          "Forward, Better Buses, and NYC Streets Plan initiatives. These programs delivered tangible improvements, including the implementation of four dedicated busways throughout the city, widespread installation of transit signal priority, and commencement of bus network redesigns for the Bronx, Queens, and Brooklyn. T",
          "bus ridership has stagnated at about two-thirds of 2019 levels even as subway ridership continues to recover. 3 Traffic volumes in 2024 are 15% higher than in 2019, indicating that New Yorkers are choosing driving over public transit. [p004_c0005] Recognizing the downward trajectory of bus ridership and p"
        ]
      },
      {
        "source_id": "better_buses_action_plan_2019",
        "path": "wiki/sources/better_buses_action_plan_2019.md",
        "score": 142,
        "matched_terms": [
          "factors",
          "implementation",
          "pre",
          "ridership",
          "volume",
          "volumes",
          "winter"
        ],
        "primary_terms_matched": [
          "implementation",
          "pre",
          "volume",
          "winter"
        ],
        "snippets": [
          "### [p020_c0001] Schedule > [p020_c0002] The figure is a Gantt chart titled \"Schedule\" showing project timelines from Winter 2019 to Fall 2020. A vertical grey line separates the years. Tasks are represented by blue arrows with yellow text labels. 2019 2020 Winter Spring Summer Fall Winter Spring Summer",
          "attan. SBS upgrades, including off-board fare payment and bus lanes, will help to more efficiently accommodate the high volume of crosstown riders and provide faster, more reliable service. - [p030_c0013] • Corridor length: 6.9 miles • Routes served: M14A, M14D • Total daily ridership: 28,000 ### [p030_c0"
        ]
      },
      {
        "source_id": "nyct_key_performance_metrics_june2025",
        "path": "wiki/sources/nyct_key_performance_metrics_june2025.md",
        "score": 139,
        "matched_terms": [
          "factors",
          "implementation",
          "pre",
          "ridership",
          "seasonal",
          "subject",
          "volume",
          "volumes"
        ],
        "primary_terms_matched": [
          "implementation",
          "pre",
          "volume"
        ],
        "snippets": [
          ", NYCT President Demetrius Crichlow and Queens Borough President Donovan Richards at the announcement for the two-phase implementation of the Queens Bus Network Redesign at Queens Borough Hall earlier this year._ > [p002_c0002] A photograph of three men in suits standing behind a podium. The man in the center is",
          "2_c0003] The number of paratransit trips, by type of service > [p012_c0004] This stacked bar chart displays the monthly volume of paratransit trips across five provider categories from July 2022 to March 2025. The y-axis measures the number of trips in thousands, with increments of 200. The x-axis is labe"
        ]
      }
    ],
    "searched_source_pages": 48
  }
]
```

### source-gap-resolution:gap:gap_crash-data-future-reports

- Category: source_gap_possible_resolution
- Priority: 330
- Record kind: source_gap
- Record id: gap_crash-data-future-reports
- Source ids: 14th_street_fall2019_monitoring, 14th_street_winter2020_monitoring, jamaica_busway_monitoring_update_2022, soundview_bus_priority_press_release_2021
- Title: Review source gap: source_gap_crash_data_future_reports
- Decision options: resolved_by_source, remains_source_scoped_caveat, convert_to_claim_caveat, canonical_value, needs_more_data, no_change

Reasons:
- Source gaps should represent a source-stated caveat or missing information, not a claim that the corpus lacks the fact.
- wiki/sources search found possible resolving/context sources; inspect them before leaving this gap unresolved.

Examples:
```json
[
  {
    "source_gap": {
      "record_id": "gap_crash-data-future-reports",
      "display_name": "source_gap_crash_data_future_reports",
      "source_ids": [
        "14th_street_fall2019_monitoring"
      ],
      "local_observation_ids": [
        "source_gap_crash_data_future_reports"
      ],
      "aliases": [],
      "payload": {
        "gap_kind": "deferred_data",
        "gap_text": "As a Vision Zero Priority Corridor, crash data will be reported in subsequent reports",
        "description": "Crash data not included in this preliminary report; planned for future reports",
        "missing_information": "crash data",
        "gap_kind_normalized": "deferred_data"
      }
    },
    "original_evidence": [
      {
        "source_id": "14th_street_fall2019_monitoring",
        "block_id": "p003_c0005",
        "page_number": 3,
        "role": "described",
        "snippet": "Sam Schwartz is monitoring the performance of the 14th Street TTP Pilot Project and its effects on adjacent roadways. For this project, Sam Schwartz is partnering with Traffic Databank for data collection and Public Wor..."
      }
    ],
    "search_terms": [
      "corridor",
      "crash",
      "deferred",
      "planned",
      "preliminary",
      "priority",
      "vision",
      "zero"
    ],
    "possible_source_matches": [
      {
        "source_id": "14th_street_winter2020_monitoring",
        "path": "wiki/sources/14th_street_winter2020_monitoring.md",
        "score": 82,
        "matched_terms": [
          "corridor",
          "crash",
          "preliminary",
          "priority",
          "vision",
          "zero"
        ],
        "primary_terms_matched": [
          "crash"
        ],
        "snippets": [
          "0010] Since 2014, Vision Zero has been New York City's initiative to eliminate deaths and serious injuries from traffic crashes through engineering, enforcement, and education. Vision Zero Priority Locations are corridors, intersections, or areas with disproportionately high rates of pedestrian deaths an",
          "M14 D Select Bus Service (M14 A/D SBS). The TTP Pilot Project also aims to increase safety on this Vision Zero Priority Corridor while maintaining the street as an important truck route. [p002_c0007] From 6 AM–10 PM, only buses, trucks, and emergency vehicles are allowed to drive on 14th Street from 3rd Ave"
        ]
      },
      {
        "source_id": "soundview_bus_priority_press_release_2021",
        "path": "wiki/sources/soundview_bus_priority_press_release_2021.md",
        "score": 78,
        "matched_terms": [
          "corridor",
          "crash",
          "planned",
          "priority",
          "vision",
          "zero"
        ],
        "primary_terms_matched": [
          "crash"
        ],
        "snippets": [
          "# NYC DOT Soundview Bus-Priority Corridor Completion source_id: soundview_bus_priority_press_release_2021 citation: cite block ids exactly as shown in square brackets document: 1 block(s) ## Page 1 [p001_b0001] DOT Pre",
          "effect at all times. The Vision Zero pedestrian improvements that are part of this project are also expected to reduce crashes. Major improvements include: Painted curb extensions to calm traffic and improve safety for pedestrians at five intersections. Transit Signal Priority, a smart-signal system tha"
        ]
      },
      {
        "source_id": "jamaica_busway_monitoring_update_2022",
        "path": "wiki/sources/jamaica_busway_monitoring_update_2022.md",
        "score": 37,
        "matched_terms": [
          "corridor",
          "crash"
        ],
        "primary_terms_matched": [
          "crash"
        ],
        "snippets": [
          "DC Social Vulnerability Index (SVI) for the New York City area, specifically focusing on the Jamaica Ave and Archer Ave corridors. The legend identifies the following: Corridor: Archer Ave (light blue line) Jamaica Ave (dark blue line) Jamaica and Archer (thick dark blue line) 2018 CDC Social Vulnerability",
          "USES Restart_ ## Page 8 ### [p008_c0001] Safety – Jamaica Avenue - [p008_c0002] • Jamaica Ave has seen a reduction in crashes and injuries since busway launch. • Total crashes down 68% • People injured or killed down 45% (60% decrease for serious injuries) ○ -100% for cyclists ○ -28% for pedestrians ○"
        ]
      }
    ],
    "searched_source_pages": 48
  }
]
```

### source-gap-resolution:gap-kind-inventory

- Category: source_gap_kind_inventory
- Priority: 185
- Record kind: source_gap
- Field: gap_kind
- Count: 5
- Title: Source gap kind values need caveat/resolution semantics
- Decision options: canonical_value, remains_source_scoped_caveat, resolved_by_source, needs_more_data, no_change

Reasons:
- Review whether each gap_kind maps to the bounded runner-owned gap_kind_normalized taxonomy, remains other, or needs source-backed resolution evidence.
- Do not treat absence in one source as corpus-level absence without checking other source pages.

Examples:
```json
[
  {
    "value": "correction",
    "count": 1,
    "records": [
      "gap_report-correction-noted"
    ],
    "representative_records": [
      {
        "record_id": "gap_report-correction-noted",
        "record_kind": "source_gap",
        "display_name": "gap_report_correction_noted",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "gap_kind": "correction",
          "gap_text": "Correction: After publishing the TSP report in July 2017, we have since found it contains some data that is no longer accurate. The report has been updated.",
          "missing_information": "The specific data that was inaccurate and the correction details are not stated.",
          "gap_kind_normalized": "correction"
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p011_c0007",
            "page_number": 11,
            "snippet": "Correction: After publishing the TSP report in July 2017, we have since found it contains some data that is no longer accurate. The report has been updated."
          }
        ]
      }
    ]
  },
  {
    "value": "data_collection_suspension",
    "count": 1,
    "records": [
      "gap_future-reports-suspended-covid"
    ],
    "representative_records": [
      {
        "record_id": "gap_future-reports-suspended-covid",
        "record_kind": "source_gap",
        "display_name": "gap_future_reports_suspended_covid",
        "source_ids": [
          "14th_street_winter2020_monitoring"
        ],
        "payload": {
          "gap_kind": "data_collection_suspension",
          "gap_text": "Data will not be gathered for future Quarterly Reports until travel conditions return to more typical activity levels due to COVID-19 pandemic",
          "missing_information": "No future quarterly data collected after the Winter 2020 report due to COVID-19 PAUSE order",
          "description": "Report states that data collection is suspended for future reports following the March 22, 2020 NY PAUSE executive order",
          "gap_kind_normalized": "data_collection_suspension"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_winter2020_monitoring",
            "block_id": "p003_c0017",
            "page_number": 3,
            "role": "statement",
            "snippet": "All data included in the Winter 2020 Quarterly Report was collected in January/February 2020, prior to the \"New York State on PAUSE\" executive order issued by Governor Cuomo that went into effect on March 22nd. This ord..."
          }
        ]
      }
    ]
  },
  {
    "value": "data_not_collected",
    "count": 1,
    "records": [
      "gap_missing-bus-speed-reliability-data"
    ],
    "representative_records": [
      {
        "record_id": "gap_missing-bus-speed-reliability-data",
        "record_kind": "source_gap",
        "display_name": "Missing bus speed, reliability, and ridership data",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "gap_kind": "data_not_collected",
          "missing_information": "Bus speeds, reliability, and ridership before and after implementation of the bus rapid transit demonstration program for each bus route, including current statistics",
          "description": "2024 legislation added new reporting requirements not yet collected for 2022-2023. Next two-year report will incorporate this data.",
          "affected_period": "2022-2023",
          "gap_kind_normalized": "data_not_collected"
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p003_c0004",
            "page_number": 3,
            "role": "gap_description",
            "snippet": "The expanded legislative authority which went into effect in 2024 included additional reporting requirements on bus speeds, reliability, and ridership. newer reporting components are not a part of this report, as data w..."
          }
        ]
      }
    ]
  },
  {
    "value": "data_unavailable",
    "count": 1,
    "records": [
      "gap_winter-bike-data-unavailable"
    ],
    "representative_records": [
      {
        "record_id": "gap_winter-bike-data-unavailable",
        "record_kind": "source_gap",
        "display_name": "gap_winter_bike_data_unavailable",
        "source_ids": [
          "14th_street_winter2020_monitoring"
        ],
        "payload": {
          "gap_kind": "data_unavailable",
          "gap_text": "Pre-implementation data from winter is not available for comparison for bicycle volumes",
          "missing_information": "Winter pre-implementation bike volume data not available for before/after comparison",
          "description": "Bicycle ridership is subject to seasonal factors; pre-implementation winter data not available",
          "gap_kind_normalized": "data_unavailable"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_winter2020_monitoring",
            "block_id": "p015_c0005",
            "page_number": 15,
            "role": "statement",
            "snippet": "➔ Even more than other transportation modes, bicycle ridership is highly subject to seasonal factors such as weather conditions. Pre-implementation data from winter is not available for comparison, therefore changes in..."
          }
        ]
      }
    ]
  },
  {
    "value": "deferred_data",
    "count": 1,
    "records": [
      "gap_crash-data-future-reports"
    ],
    "representative_records": [
      {
        "record_id": "gap_crash-data-future-reports",
        "record_kind": "source_gap",
        "display_name": "source_gap_crash_data_future_reports",
        "source_ids": [
          "14th_street_fall2019_monitoring"
        ],
        "payload": {
          "gap_kind": "deferred_data",
          "gap_text": "As a Vision Zero Priority Corridor, crash data will be reported in subsequent reports",
          "description": "Crash data not included in this preliminary report; planned for future reports",
          "missing_information": "crash data",
          "gap_kind_normalized": "deferred_data"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_fall2019_monitoring",
            "block_id": "p003_c0005",
            "page_number": 3,
            "role": "described",
            "snippet": "Sam Schwartz is monitoring the performance of the 14th Street TTP Pilot Project and its effects on adjacent roadways. For this project, Sam Schwartz is partnering with Traffic Databank for data collection and Public Wor..."
          }
        ]
      }
    ]
  }
]
```

Data:
```json
{
  "mapping_review_policy": {
    "mapping_relation_classifications": [
      "exact_alias",
      "broader_narrower",
      "inverse_direction",
      "related_but_distinct",
      "needs_more_data"
    ],
    "mapping_decision_rule": "Emit field_value_mapping or relation_kind_mapping only when mapping_relation is exact_alias and representative records show the same record meaning/query semantics. Do not map broader/narrower, inverse-direction, or merely related values.",
    "context_expectation": "Use representative_records payloads and endpoints, not only value labels or frequency counts, before deciding."
  },
  "bounded_taxonomy_policy": {
    "taxonomy_mode": "bounded_normalizer_with_other_passthrough",
    "decision_rule": "Add or remap a family value only when representative raw literals share the same lifecycle/intervention meaning. Otherwise preserve the raw literal and keep the runner-owned family as other.",
    "closed_universe_guard": "The family field is closed for first-pass grouping, but raw source fields remain pass-through so novel or uncertain source language is not rejected."
  },
  "gap_kind_normalized_inventory": [
    {
      "value": "correction",
      "count": 1,
      "records": [
        "gap_report-correction-noted"
      ],
      "representative_records": [
        {
          "record_id": "gap_report-correction-noted",
          "record_kind": "source_gap",
          "display_name": "gap_report_correction_noted",
          "source_ids": [
            "tsp_report_2017"
          ],
          "payload": {
            "gap_kind": "correction",
            "gap_text": "Correction: After publishing the TSP report in July 2017, we have since found it contains some data that is no longer accurate. The report has been updated.",
            "missing_information": "The specific data that was inaccurate and the correction details are not stated.",
            "gap_kind_normalized": "correction"
          },
          "evidence_examples": [
            {
              "source_id": "tsp_report_2017",
              "block_id": "p011_c0007",
              "page_number": 11,
              "snippet": "Correction: After publishing the TSP report in July 2017, we have since found it contains some data that is no longer accurate. The report has been updated."
            }
          ]
        }
      ]
    },
    {
      "value": "data_collection_suspension",
      "count": 1,
      "records": [
        "gap_future-reports-suspended-covid"
      ],
      "representative_records": [
        {
          "record_id": "gap_future-reports-suspended-covid",
          "record_kind": "source_gap",
          "display_name": "gap_future_reports_suspended_covid",
          "source_ids": [
            "14th_street_winter2020_monitoring"
          ],
          "payload": {
            "gap_kind": "data_collection_suspension",
            "gap_text": "Data will not be gathered for future Quarterly Reports until travel conditions return to more typical activity levels due to COVID-19 pandemic",
            "missing_information": "No future quarterly data collected after the Winter 2020 report due to COVID-19 PAUSE order",
            "description": "Report states that data collection is suspended for future reports following the March 22, 2020 NY PAUSE executive order",
            "gap_kind_normalized": "data_collection_suspension"
          },
          "evidence_examples": [
            {
              "source_id": "14th_street_winter2020_monitoring",
              "block_id": "p003_c0017",
              "page_number": 3,
              "role": "statement",
              "snippet": "All data included in the Winter 2020 Quarterly Report was collected in January/February 2020, prior to the \"New York State on PAUSE\" executive order issued by Governor Cuomo that went into effect on March 22nd. This ord..."
            }
          ]
        }
      ]
    },
    {
      "value": "data_not_collected",
      "count": 1,
      "records": [
        "gap_missing-bus-speed-reliability-data"
      ],
      "representative_records": [
        {
          "record_id": "gap_missing-bus-speed-reliability-data",
          "record_kind": "source_gap",
          "display_name": "Missing bus speed, reliability, and ridership data",
          "source_ids": [
            "bus_lane_camera_report_2024"
          ],
          "payload": {
            "gap_kind": "data_not_collected",
            "missing_information": "Bus speeds, reliability, and ridership before and after implementation of the bus rapid transit demonstration program for each bus route, including current statistics",
            "description": "2024 legislation added new reporting requirements not yet collected for 2022-2023. Next two-year report will incorporate this data.",
            "affected_period": "2022-2023",
            "gap_kind_normalized": "data_not_collected"
          },
          "evidence_examples": [
            {
              "source_id": "bus_lane_camera_report_2024",
              "block_id": "p003_c0004",
              "page_number": 3,
              "role": "gap_description",
              "snippet": "The expanded legislative authority which went into effect in 2024 included additional reporting requirements on bus speeds, reliability, and ridership. newer reporting components are not a part of this report, as data w..."
            }
          ]
        }
      ]
    },
    {
      "value": "data_unavailable",
      "count": 1,
      "records": [
        "gap_winter-bike-data-unavailable"
      ],
      "representative_records": [
        {
          "record_id": "gap_winter-bike-data-unavailable",
          "record_kind": "source_gap",
          "display_name": "gap_winter_bike_data_unavailable",
          "source_ids": [
            "14th_street_winter2020_monitoring"
          ],
          "payload": {
            "gap_kind": "data_unavailable",
            "gap_text": "Pre-implementation data from winter is not available for comparison for bicycle volumes",
            "missing_information": "Winter pre-implementation bike volume data not available for before/after comparison",
            "description": "Bicycle ridership is subject to seasonal factors; pre-implementation winter data not available",
            "gap_kind_normalized": "data_unavailable"
          },
          "evidence_examples": [
            {
              "source_id": "14th_street_winter2020_monitoring",
              "block_id": "p015_c0005",
              "page_number": 15,
              "role": "statement",
              "snippet": "➔ Even more than other transportation modes, bicycle ridership is highly subject to seasonal factors such as weather conditions. Pre-implementation data from winter is not available for comparison, therefore changes in..."
            }
          ]
        }
      ]
    },
    {
      "value": "deferred_data",
      "count": 1,
      "records": [
        "gap_crash-data-future-reports"
      ],
      "representative_records": [
        {
          "record_id": "gap_crash-data-future-reports",
          "record_kind": "source_gap",
          "display_name": "source_gap_crash_data_future_reports",
          "source_ids": [
            "14th_street_fall2019_monitoring"
          ],
          "payload": {
            "gap_kind": "deferred_data",
            "gap_text": "As a Vision Zero Priority Corridor, crash data will be reported in subsequent reports",
            "description": "Crash data not included in this preliminary report; planned for future reports",
            "missing_information": "crash data",
            "gap_kind_normalized": "deferred_data"
          },
          "evidence_examples": [
            {
              "source_id": "14th_street_fall2019_monitoring",
              "block_id": "p003_c0005",
              "page_number": 3,
              "role": "described",
              "snippet": "Sam Schwartz is monitoring the performance of the 14th Street TTP Pilot Project and its effects on adjacent roadways. For this project, Sam Schwartz is partnering with Traffic Databank for data collection and Public Wor..."
            }
          ]
        }
      ]
    }
  ]
}
```
