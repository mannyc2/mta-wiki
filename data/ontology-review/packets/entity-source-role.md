# Entity & Source-Role Agent

Agent id: `entity-source-role`

## Purpose

Normalize agencies, publishers, operators, people-vs-agency distinctions, source roles, and parent/owner organization context.

## Owns

- entity identity
- entity_type
- publisher/operator/agency source roles
- parent organization context

## Decision Contract

Submit review decisions only as append-only normalization decisions. Do not edit canonical JSONL, wiki pages, source pages, or source literals directly.

- merge
- do_not_merge
- canonical_value
- relation_candidate
- entity_type_mapping
- needs_more_data
- no_change

## Candidate Summary

Candidates: 9

- relation_context_field: 7
- entity_type_mapping: 1
- source_publisher_role: 1

## Candidates

### entity-source-role:source-publishers

- Category: source_publisher_role
- Priority: 227
- Record kind: source
- Field: publisher
- Count: 47
- Title: Source publisher strings should map to entity/source-role decisions
- Decision options: relation_candidate, canonical_value, entity_alias, needs_more_data, no_change

Reasons:
- Source publisher is relation context; normalize aliases without erasing source literals or changing publisher/source-role meaning.

Examples:
```json
[
  {
    "value": "NYC DOT",
    "count": 12,
    "records": [
      "source_14th-street-busway-brochure",
      "source_181st-street-jun2022",
      "source_34th-st-busway",
      "source_brt-route-index"
    ],
    "representative_records": [
      {
        "record_id": "source_14th-street-busway-brochure",
        "record_kind": "source",
        "display_name": "14th Street Busway Brochure",
        "source_ids": [
          "14th_street_busway_brochure"
        ],
        "payload": {
          "source_name": "14th Street Transit & Truck Priority Pilot Project Brochure",
          "publisher": "NYC DOT",
          "source_type": "brochure",
          "language": "en",
          "description": "Informational brochure describing the 14th Street Transit & Truck Priority Pilot Project regulations, FAQ, and access instructions for eastbound and westbound travel.",
          "url": "nyc.gov/betterbuses"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_busway_brochure",
            "block_id": "p001_c0001",
            "page_number": 1,
            "role": "title",
            "snippet": "Transit & Truck Priority"
          }
        ]
      },
      {
        "record_id": "source_181st-street-jun2022",
        "record_kind": "source",
        "display_name": "Source: 181st Street Busway CAB Meeting June 2022",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "source_id": "181st_street_jun2022",
          "title": "NYC DOT 181st Street Busway Community Advisory Board Meeting",
          "publisher": "NYC DOT",
          "document_date": "2022-06-23",
          "source_url": "https://www.nyc.gov/html/dot/downloads/pdf/181-st-broadway-ave-amsterdam-ave-jun2022.pdf",
          "event": "Community Advisory Board Meeting",
          "description": "Presentation deck for the 181st Street Busway Community Advisory Board meeting held June 23, 2022. Covers background, busway updates, on-street outreach, and next steps.",
          "document_date_normalized": {
            "raw_text": "2022-06-23",
            "normalized_date": "2022-06-23",
            "precision": "day",
            "confidence": "submitted_iso"
          }
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p001_c0002",
            "page_number": 1,
            "role": "stated",
            "snippet": "Community Advisory Board Meeting – June 23, 2022"
          }
        ]
      },
      {
        "record_id": "source_34th-st-busway",
        "record_kind": "source",
        "display_name": "34th Street Busway Brochure",
        "source_ids": [
          "34th_st_busway"
        ],
        "payload": {
          "publisher": "NYC DOT",
          "publication_name": "34th Street Busway",
          "series": "Better Buses",
          "description": "Brochure describing 34th Street Busway regulations, maps, and frequently asked questions",
          "url": "nyc.gov/34Busway"
        },
        "evidence_examples": [
          {
            "source_id": "34th_st_busway",
            "block_id": "p001_c0001",
            "page_number": 1,
            "role": "series_name",
            "snippet": "BETTERBUSES"
          }
        ]
      }
    ]
  },
  {
    "value": "MTA",
    "count": 8,
    "records": [
      "source_ace-routes-dataset-dictionary",
      "source_bronx-bus-network-final-plan-addendum-2021",
      "source_capital-dashboard",
      "source_fare-free-bus-pilot-evaluation"
    ],
    "representative_records": [
      {
        "record_id": "source_ace-routes-dataset-dictionary",
        "record_kind": "source",
        "display_name": "MTA ACE Routes Dataset Columns",
        "source_ids": [
          "ace_routes_dataset_dictionary"
        ],
        "payload": {
          "source_name": "MTA ACE Routes Dataset Columns",
          "source_type": "dataset_dictionary",
          "description": "Column definitions for the MTA ACE (Automated Camera Enforcement) Routes dataset",
          "publisher": "MTA"
        },
        "evidence_examples": [
          {
            "source_id": "ace_routes_dataset_dictionary",
            "block_id": "p001_b0003",
            "page_number": 1,
            "role": "source_id",
            "snippet": "\"id\": 602859365,"
          }
        ]
      },
      {
        "record_id": "source_bronx-bus-network-final-plan-addendum-2021",
        "record_kind": "source",
        "display_name": "Bronx Bus Network Redesign Final Plan Addendum",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "source_id": "bronx_bus_network_final_plan_addendum_2021",
          "title": "The Bronx Bus Network Redesign Final Plan Addendum",
          "publisher": "MTA",
          "date_text": "November 2021",
          "document_type": "addendum",
          "date_text_normalized": {
            "raw_text": "November 2021",
            "normalized_date": "2021-11",
            "precision": "month",
            "confidence": "parsed_text"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_addendum_2021",
            "block_id": "p001_c0001",
            "page_number": 1,
            "role": "cover_image",
            "snippet": "A front-facing photograph of a blue Bronx Bus Network bus. The bus is centered in the frame, with its headlights on. The destination sign at the top displays 'BX 18 RIVER PARK TOWERS' in yellow digital text. The bus num..."
          }
        ]
      },
      {
        "record_id": "source_capital-dashboard",
        "record_kind": "source",
        "display_name": "MTA Capital Program Dashboard",
        "source_ids": [
          "capital_dashboard"
        ],
        "payload": {
          "title": "MTA Capital Program Dashboard",
          "publisher": "MTA",
          "source_url": "https://capitaldashboard.mta.info/",
          "content_type": "text/html",
          "retrieved_at": "2026-05-25T22:21:55.189Z",
          "status": "loading_placeholder_only"
        },
        "evidence_examples": [
          {
            "source_id": "capital_dashboard",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "source_content",
            "snippet": "MTA Dashboard Loading..."
          }
        ]
      }
    ]
  },
  {
    "value": "NYC Department of Transportation",
    "count": 5,
    "records": [
      "source_14th-street-busway",
      "source_bus-lane-camera-report-2024",
      "source_bus-lanes-dataset-dictionary",
      "source_sbs-features"
    ],
    "representative_records": [
      {
        "record_id": "source_14th-street-busway",
        "record_kind": "source",
        "display_name": "source_14th_street_busway",
        "source_ids": [
          "14th_street_busway"
        ],
        "payload": {
          "source_id": "14th_street_busway",
          "source_kind": "webpage",
          "publisher": "NYC Department of Transportation",
          "title": "14th Street Busway",
          "description": "NYC DOT informational webpage about the 14th Street Busway, formerly the 14th Street Transit and Truck Priority Pilot Project, covering rules, background, FAQ, and community outreach"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_busway",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "describes_source",
            "snippet": "Bus Rapid Transit - 14th Street Select Bus Service with Transit & Truck Priority Pilot Project Skip to main content NYC NYC Resources 311 Office of the Mayor Routes 14th Street Busway How to Use 14th Street | Background..."
          }
        ]
      },
      {
        "record_id": "source_bus-lane-camera-report-2024",
        "record_kind": "source",
        "display_name": "NYC DOT Bus Lane Camera Enforcement 2024 Report",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "source_type": "report",
          "publisher": "NYC Department of Transportation",
          "commissioner": "Ydanis Rodriguez",
          "year": 2024,
          "coverage_period": "2022-2023",
          "title": "New York City Bus Lane Camera Enforcement",
          "description": "State legislatively mandated report covering the DOT stationary camera and MTA ABLE bus lane camera enforcement programs for 2022 and 2023"
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p001_c0001",
            "page_number": 1,
            "role": "source_title",
            "snippet": "New York City Bus Lane Camera Enforcement"
          }
        ]
      },
      {
        "record_id": "source_bus-lanes-dataset-dictionary",
        "record_kind": "source",
        "display_name": "NYC DOT Bus Lanes Dataset Dictionary",
        "source_ids": [
          "bus_lanes_dataset_dictionary"
        ],
        "payload": {
          "dataset_name": "Bus Lanes",
          "source_type": "data_dictionary",
          "publisher": "NYC Department of Transportation",
          "record_count": 4068,
          "format": "JSON data dictionary (Socrata API column metadata)",
          "description": "Schema definition with column names, data types, descriptions, and cached value distributions for the NYC DOT Bus Lanes dataset"
        },
        "evidence_examples": [
          {
            "source_id": "bus_lanes_dataset_dictionary",
            "block_id": "p001_b0023",
            "page_number": 1,
            "snippet": "\"non_null\": \"4068\","
          }
        ]
      }
    ]
  },
  {
    "value": "MTA New York City Transit",
    "count": 4,
    "records": [
      "source_bronx-bus-network-final-plan-2019",
      "source_brooklyn-bus-network-draft-plan-with-route-profiles",
      "source_nyct-key-performance-metrics-june2025",
      "source_queens-proposed-final-plan-2023"
    ],
    "representative_records": [
      {
        "record_id": "source_bronx-bus-network-final-plan-2019",
        "record_kind": "source",
        "display_name": "Bronx Bus Network Redesign Final Plan",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "document_title": "Bronx Bus Network Redesign Final Plan",
          "publisher": "MTA New York City Transit",
          "publication_date": "October 2019",
          "document_kind": "final_plan",
          "total_blocks": 2179,
          "total_pages": 323,
          "publication_date_normalized": {
            "raw_text": "October 2019",
            "normalized_date": "2019-10",
            "precision": "month",
            "confidence": "parsed_text"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p004_c0004",
            "page_number": 4,
            "role": "states_publication_date",
            "snippet": "graph LR; A[\"Market and Service Data Analyses and Public Outreach\"] --> B[\"Redraw Network and Develop Draft Plan\"]; B --> C[\"Public Input and Final Plan development\"]; C --> D([\"Final Plan Public Outreach\"]); A --- A1[\"..."
          }
        ]
      },
      {
        "record_id": "source_brooklyn-bus-network-draft-plan-with-route-profiles",
        "record_kind": "source",
        "display_name": "MTA Brooklyn Bus Network Redesign Draft Plan with Route Profiles",
        "source_ids": [
          "brooklyn_bus_network_draft_plan_with_route_profiles"
        ],
        "payload": {
          "title": "Brooklyn Bus Network Redesign: Draft Plan with Route Profiles",
          "publisher": "MTA New York City Transit",
          "document_date": "2022-12-01",
          "document_type": "draft_plan",
          "source_id": "brooklyn_bus_network_draft_plan_with_route_profiles",
          "total_pages": 432,
          "total_blocks": 4297,
          "document_date_normalized": {
            "raw_text": "2022-12-01",
            "normalized_date": "2022-12-01",
            "precision": "day",
            "confidence": "submitted_iso"
          }
        },
        "evidence_examples": [
          {
            "source_id": "brooklyn_bus_network_draft_plan_with_route_profiles",
            "block_id": "p001_c0003",
            "page_number": 1,
            "role": "contains_document_date",
            "snippet": "Draft Plan 12/01/22"
          }
        ]
      },
      {
        "record_id": "source_nyct-key-performance-metrics-june2025",
        "record_kind": "source",
        "display_name": "NYCT Key Performance Metrics June 2025",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "source_id": "nyct_key_performance_metrics_june2025",
          "title": "NEW YORK CITY TRANSIT KEY PERFORMANCE METRICS",
          "date": "June 2025",
          "publisher": "MTA New York City Transit",
          "prepared_for": "June 2025 meeting of the New York City Transit & Bus Committee",
          "location": "2 Broadway, New York, NY 10004",
          "date_prepared": "June 23, 2025",
          "date_normalized": {
            "raw_text": "June 2025",
            "normalized_date": "2025-06",
            "precision": "month",
            "confidence": "parsed_text"
          },
          "location_normalized": {
            "raw_text": "2 Broadway, New York, NY 10004"
          }
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p001_c0002",
            "page_number": 1,
            "role": "title",
            "snippet": "NEW YORK CITY TRANSIT KEY PERFORMANCE METRICS"
          }
        ]
      }
    ]
  },
  {
    "value": "Metropolitan Transportation Authority",
    "count": 3,
    "records": [
      "source_open-data-plan-2022",
      "source_open-data-plan-2023-update",
      "source_open-data-plan-2026-update"
    ],
    "representative_records": [
      {
        "record_id": "source_open-data-plan-2022",
        "record_kind": "source",
        "display_name": "MTA Open Data Plan 2022",
        "source_ids": [
          "open_data_plan_2022"
        ],
        "payload": {
          "source_name": "MTA Open Data Plan 2022",
          "publisher": "Metropolitan Transportation Authority",
          "author": "Sarah Meyer, Chief Customer Officer",
          "date": "2022-04-18",
          "document_type": "plan",
          "description": "MTA Open Data Plan developed pursuant to Chapter 489 of the Laws of 2021, detailing efforts to publish nearly 100 datasets",
          "date_normalized": {
            "raw_text": "2022-04-18",
            "normalized_date": "2022-04-18",
            "precision": "day",
            "confidence": "submitted_iso"
          }
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2022",
            "block_id": "p001_c0003",
            "page_number": 1,
            "role": "date",
            "snippet": "April 18, 2022"
          }
        ]
      },
      {
        "record_id": "source_open-data-plan-2023-update",
        "record_kind": "source",
        "display_name": "MTA Open Data Plan 2023 Annual Update",
        "source_ids": [
          "open_data_plan_2023_update"
        ],
        "payload": {
          "source_title": "MTA Open Data Plan 2023 Annual Update",
          "publisher": "Metropolitan Transportation Authority",
          "description": "Annual update on the MTA Open Data Program covering 2022 achievements, program transition, data publication metrics, and forward-looking plans for 2023."
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2023_update",
            "block_id": "p001_c0001",
            "page_number": 1,
            "role": "title",
            "snippet": "THE METROPOLITAN TRANSPORTATION AUTHORITY OPEN DATA PLAN 2023 ANNUAL UPDATE"
          }
        ]
      },
      {
        "record_id": "source_open-data-plan-2026-update",
        "record_kind": "source",
        "display_name": "MTA Open Data Plan 2026 Annual Update",
        "source_ids": [
          "open_data_plan_2026_update"
        ],
        "payload": {
          "document_title": "METROPOLITAN TRANSPORTATION AUTHORITY OPEN DATA PLAN 2026 ANNUAL UPDATE",
          "document_type": "annual update / open data plan",
          "publisher": "Metropolitan Transportation Authority",
          "year": 2026
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2026_update",
            "block_id": "p001_c0002",
            "page_number": 1,
            "role": "document_title",
            "snippet": "METROPOLITAN TRANSPORTATION AUTHORITY OPEN DATA PLAN 2026 ANNUAL UPDATE"
          }
        ]
      }
    ]
  },
  {
    "value": "New York City Department of Transportation (NYC DOT)",
    "count": 2,
    "records": [
      "source_streets-plan-update-2026",
      "source_tremont-ave-busway"
    ],
    "representative_records": [
      {
        "record_id": "source_streets-plan-update-2026",
        "record_kind": "source",
        "display_name": "NYC Streets Plan Update 2026",
        "source_ids": [
          "streets_plan_update_2026"
        ],
        "payload": {
          "title": "NYC Streets Plan Update 2026",
          "publisher": "New York City Department of Transportation (NYC DOT)",
          "content_type": "report",
          "description": "Update on NYC Streets Plan progress, completed projects, and future priorities under Mayor Zohran Mamdani and Commissioner Mike Flynn"
        },
        "evidence_examples": [
          {
            "source_id": "streets_plan_update_2026",
            "block_id": "p002_c0001",
            "page_number": 2,
            "snippet": "NYC Streets Plan Update 2026"
          }
        ]
      },
      {
        "record_id": "source_tremont-ave-busway",
        "record_kind": "source",
        "display_name": "Tremont Avenue Busway Brochure",
        "source_ids": [
          "tremont_ave_busway"
        ],
        "payload": {
          "title": "Tremont Avenue Busway",
          "publisher": "New York City Department of Transportation (NYC DOT)",
          "content_type": "brochure",
          "program": "BETTERBUSES"
        },
        "evidence_examples": [
          {
            "source_id": "tremont_ave_busway",
            "block_id": "p001_c0001",
            "page_number": 1,
            "role": "document_header",
            "snippet": "BETTERBUSES"
          }
        ]
      }
    ]
  },
  {
    "value": "NYC Department of Transportation (NYC DOT)",
    "count": 2,
    "records": [
      "source_better-buses",
      "source_better-buses-action-plan-2019"
    ],
    "representative_records": [
      {
        "record_id": "source_better-buses",
        "record_kind": "source",
        "display_name": "NYC DOT Better Buses Page",
        "source_ids": [
          "better_buses"
        ],
        "payload": {
          "description": "NYC DOT Better Buses webpage describing the Better Buses Action Plan, Bus Priority Toolkit, and current bus priority projects across New York City.",
          "publisher": "NYC Department of Transportation (NYC DOT)",
          "source_type": "webpage"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses",
            "block_id": "p001_b0001",
            "page_number": 1,
            "snippet": "Better Buses Skip to main content NYC NYC Resources 311 Office of the Mayor Better Buses NYC DOT is committed to working with the MTA and NYPD to improve buses citywide, ensuring that New Yorkers have service that they..."
          }
        ]
      },
      {
        "record_id": "source_better-buses-action-plan-2019",
        "record_kind": "source",
        "display_name": "source_better_buses_action_plan_2019",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "title": "Better Buses Action Plan",
          "publisher": "NYC Department of Transportation (NYC DOT)",
          "date_text": "April 2019",
          "source_type": "plan",
          "description": "NYC DOT's 2019 plan to improve bus speeds citywide by 25% through bus lanes, TSP, enforcement, and bus stop improvements",
          "date_text_normalized": {
            "raw_text": "April 2019",
            "normalized_date": "2019-04",
            "precision": "month",
            "confidence": "parsed_text"
          }
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p001_c0001",
            "page_number": 1,
            "snippet": "Better Buses Action Plan"
          }
        ]
      }
    ]
  },
  {
    "value": "Sam Schwartz",
    "count": 2,
    "records": [
      "source_14th-street-fall2019-monitoring",
      "source_14th-street-winter2020-monitoring"
    ],
    "representative_records": [
      {
        "record_id": "source_14th-street-fall2019-monitoring",
        "record_kind": "source",
        "display_name": "14th Street Transit & Truck Priority Pilot Preliminary Report Fall 2019",
        "source_ids": [
          "14th_street_fall2019_monitoring"
        ],
        "payload": {
          "title": "14th Street Transit & Truck Priority Pilot Project Preliminary Report Fall 2019",
          "publisher": "Sam Schwartz",
          "report_type": "preliminary report",
          "date_text": "Fall 2019",
          "document_kind": "monitoring_report",
          "date_text_normalized": {
            "raw_text": "Fall 2019",
            "normalized_date": "2019-fall",
            "precision": "season",
            "confidence": "parsed_text"
          }
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_fall2019_monitoring",
            "block_id": "p001_c0001",
            "page_number": 1,
            "role": "title",
            "snippet": "14TH STREET TRANSIT & TRUCK PRIORITY PILOT PROJECT"
          }
        ]
      },
      {
        "record_id": "source_14th-street-winter2020-monitoring",
        "record_kind": "source",
        "display_name": "14th Street Transit & Truck Priority Pilot Project Quarterly Report Winter 2020",
        "source_ids": [
          "14th_street_winter2020_monitoring"
        ],
        "payload": {
          "source_title": "14th Street Transit & Truck Priority Pilot Project Quarterly Report Winter 2020",
          "publisher": "Sam Schwartz",
          "prepared_for": "NYCDOT",
          "date": "Winter 2020",
          "source_type": "monitoring_report",
          "description": "Quarterly monitoring report for the 14th Street Transit & Truck Priority Pilot Project covering data collected January/February 2020, before COVID-19 PAUSE order. Reports on bus operations, vehicle travel times, vehicle speeds, vehicle volumes, bike volumes, Citi Bike ridership, safety/crash data, enforcement, and community feedback.",
          "date_normalized": {
            "raw_text": "Winter 2020",
            "normalized_date": "2020-winter",
            "precision": "season",
            "confidence": "parsed_text"
          }
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_winter2020_monitoring",
            "block_id": "p001_c0001",
            "page_number": 1,
            "role": "title",
            "snippet": "14TH STREET TRANSIT & TRUCK PRIORITY PILOT PROJECT"
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
  }
}
```

### entity-source-role:entity-type-values

- Category: entity_type_mapping
- Priority: 194
- Record kind: entity
- Field: entity_type
- Count: 92
- Title: Entity type values need open mapping and person/agency safeguards
- Decision options: entity_type_mapping, canonical_value, do_not_merge, needs_more_data, no_change

Reasons:
- Entity type has many literal forms; normalize families while preserving person/title vs agency distinctions.

Examples:
```json
[
  {
    "value": "person",
    "count": 17,
    "records": [
      "entity_andrea-stewart-cousins-open-data-plan",
      "entity_brooklyn-bp-eric-adams-tsp-2017",
      "entity_carl-heastie-open-data-plan",
      "entity_christopher-pangilinan-ops-planning"
    ],
    "representative_records": [
      {
        "record_id": "entity_andrea-stewart-cousins-open-data-plan",
        "record_kind": "entity",
        "display_name": "Andrea Stewart-Cousins, NYS Senate President Pro Tempore",
        "source_ids": [
          "open_data_plan_2022"
        ],
        "payload": {
          "entity_name": "Andrea Stewart-Cousins",
          "title": "President Pro Tempore & Majority Leader",
          "organization": "New York State Senate",
          "entity_type": "person"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2022",
            "block_id": "p001_c0005",
            "page_number": 1,
            "role": "addressee",
            "snippet": "The Honorable Andrea Stewart-Cousins President Pro Tempore & Majority Leader New York State Senate 330 State Capitol Building Albany, NY 12247"
          }
        ]
      },
      {
        "record_id": "entity_brooklyn-bp-eric-adams-tsp-2017",
        "record_kind": "entity",
        "display_name": "Eric Adams, Brooklyn Borough President",
        "source_ids": [
          "tsp_status_2017"
        ],
        "payload": {
          "entity_name": "Eric Adams",
          "entity_type": "person",
          "description": "Brooklyn Borough President quoted in the TSP press release"
        },
        "evidence_examples": [
          {
            "source_id": "tsp_status_2017",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "entity_mention",
            "snippet": "DOT Press Releases &#8211; DOT Releases Status Report on “Transit Signal Priority” Technology Used To Speed MTA Buses Skip to main content NYC NYC Resources 311 Office of the Mayor About DOT Press Releases FOR IMMEDIATE..."
          }
        ]
      },
      {
        "record_id": "entity_carl-heastie-open-data-plan",
        "record_kind": "entity",
        "display_name": "Carl Heastie, NYS Assembly Speaker",
        "source_ids": [
          "open_data_plan_2022"
        ],
        "payload": {
          "entity_name": "Carl Heastie",
          "title": "Speaker",
          "organization": "New York State Assembly",
          "entity_type": "person"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2022",
            "block_id": "p001_c0006",
            "page_number": 1,
            "role": "addressee",
            "snippet": "The Honorable Carl Heastie Speaker New York State Assembly 932 Legislative Office Building Albany, NY 12248"
          }
        ]
      }
    ]
  },
  {
    "value": "government_official",
    "count": 8,
    "records": [
      "entity_council-majority-leader-shaun-abreu",
      "entity_ddc-acting-commissioner-eduardo-del-valle",
      "entity_governor-kathy-hochul",
      "entity_manhattan-bp-brad-hoylman-sigal"
    ],
    "representative_records": [
      {
        "record_id": "entity_council-majority-leader-shaun-abreu",
        "record_kind": "entity",
        "display_name": "entity_council_majority_leader_shaun_abreu",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "entity_name": "Shaun Abreu",
          "entity_type": "government_official",
          "title": "New York City Council Majority Leader"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "entity_mention",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      },
      {
        "record_id": "entity_ddc-acting-commissioner-eduardo-del-valle",
        "record_kind": "entity",
        "display_name": "entity_ddc_acting_commissioner_eduardo_del_valle",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "entity_name": "Eduardo del Valle",
          "entity_type": "government_official",
          "title": "DDC Acting Commissioner",
          "agency_name": "NYC Department of Design and Construction",
          "_merged_field_values": {
            "entity_name": [
              "Eduardo del Valle",
              "NYC Department of Design and Construction"
            ],
            "entity_type": [
              "government_official",
              "government_agency"
            ]
          }
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "entity_mention",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      },
      {
        "record_id": "entity_governor-kathy-hochul",
        "record_kind": "entity",
        "display_name": "Governor Kathy Hochul",
        "source_ids": [
          "open_data_lessons_2026",
          "open_data_plan_2022",
          "open_data_plan_2024_update",
          "open_data_plan_2025_update"
        ],
        "payload": {
          "entity_name": "Governor Kathy Hochul",
          "name": "Kathy Hochul",
          "entity_type": "government_official",
          "_merged_field_values": {
            "entity_name": [
              "Governor Kathy Hochul",
              "Kathy Hochul"
            ],
            "entity_type": [
              "government_official",
              "person",
              "government official"
            ]
          },
          "title": "Governor of New York State",
          "jurisdiction": "New York State",
          "description": "New York State Governor who signed the MTA Open Data Act into law in October 2021"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_lessons_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "source_context",
            "snippet": "Lessons learned in the MTA’s Open Data program Skip to main content Menu Close Menu Schedules Maps Fares and tolls Planned Service Changes Travel Back Elevator & Escalator Status Accessibility Sign up for service alerts..."
          }
        ]
      }
    ]
  },
  {
    "value": "government agency",
    "count": 4,
    "records": [
      "entity_nyc-comptroller-brad-lander",
      "entity_nyc-ibo",
      "entity_nypd",
      "entity_nys-its-open-data-plan"
    ],
    "representative_records": [
      {
        "record_id": "entity_nyc-comptroller-brad-lander",
        "record_kind": "entity",
        "display_name": "New York City Comptroller Brad Lander",
        "source_ids": [
          "behind_schedule_2025",
          "life_in_slow_lane_2025"
        ],
        "payload": {
          "entity_name": "New York City Comptroller Brad Lander",
          "office": "New York City Comptroller",
          "entity_type": "government agency",
          "publisher": true,
          "_merged_field_values": {
            "publisher": [
              true,
              "NYC Comptroller"
            ]
          }
        },
        "evidence_examples": [
          {
            "source_id": "behind_schedule_2025",
            "block_id": "p001_c0002",
            "page_number": 1,
            "snippet": "NEW YORK CITY COMPTROLLER BRAD LANDER"
          }
        ]
      },
      {
        "record_id": "entity_nyc-ibo",
        "record_kind": "entity",
        "display_name": "New York City Independent Budget Office (IBO)",
        "source_ids": [
          "speeding_up_slowly_2025"
        ],
        "payload": {
          "entity_name": "New York City Independent Budget Office",
          "short_name": "IBO",
          "entity_type": "government agency",
          "description": "IBO's mission is to enhance understanding of New York City's budget, public policy, and economy through independent analysis."
        },
        "evidence_examples": [
          {
            "source_id": "speeding_up_slowly_2025",
            "block_id": "p001_c0002",
            "page_number": 1,
            "snippet": "New York City Independent Budget Office"
          }
        ]
      },
      {
        "record_id": "entity_nypd",
        "record_kind": "entity",
        "display_name": "NYPD Reference",
        "source_ids": [
          "14th_street_busway",
          "14th_street_busway_brochure",
          "34th_st_busway",
          "better_buses",
          "better_buses_action_plan_2019",
          "brooklyn_bus_network_draft_plan_with_route_profiles",
          "bus_lane_camera_report_2024",
          "jamaica_archer_brochure",
          "jamaica_busway_monitoring_update_2022",
          "m86_sbs_progress_report_2017",
          "nyct_key_performance_metrics_doc194001",
          "sbs_features",
          "soundview_bus_priority_press_release_2021",
          "speeding_up_slowly_2025",
          "tremont_ave_busway"
        ],
        "payload": {
          "entity_name": "New York City Police Department",
          "agency_name": "NYPD",
          "entity_type": "government agency",
          "description": "Enforces curb regulations and may issue summonses for busway violations",
          "_merged_field_values": {
            "entity_type": [
              "government agency",
              "municipal agency",
              "government_agency",
              "police_agency",
              "police_department",
              "agency",
              "police precinct",
              "police department"
            ],
            "description": [
              "Enforces curb regulations and may issue summonses for busway violations",
              "Enforces Transit & Truck Priority restrictions and curb regulations via traffic agents."
            ],
            "agency_name": [
              "NYPD",
              "New York City Police Department"
            ],
            "entity_name": [
              "New York City Police Department",
              "New York Police Department",
              "NYPD Central Park Precinct",
              "New York City Police Department (NYPD)"
            ]
          },
          "name": "NYPD",
          "acronym": "NYPD",
          "data_source": true,
          "role": "enforcement",
          "short_name": "NYPD"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_busway",
            "block_id": "p001_b0001",
            "page_number": 1,
            "snippet": "Bus Rapid Transit - 14th Street Select Bus Service with Transit & Truck Priority Pilot Project Skip to main content NYC NYC Resources 311 Office of the Mayor Routes 14th Street Busway How to Use 14th Street | Background..."
          }
        ]
      }
    ]
  },
  {
    "value": "community_board",
    "count": 3,
    "records": [
      "entity_brooklyn-community-board-1",
      "entity_manhattan-community-board-7",
      "entity_manhattan-community-board-8"
    ],
    "representative_records": [
      {
        "record_id": "entity_brooklyn-community-board-1",
        "record_kind": "entity",
        "display_name": "entity_brooklyn_community_board_1",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "entity_name": "Brooklyn Community Board 1",
          "entity_type": "community_board",
          "borough": "Brooklyn",
          "borough_normalized": "brooklyn"
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p037_c0003",
            "page_number": 37,
            "role": "entity_mention",
            "snippet": "Williamsburg Bridge Bus Plaza, an important facility for the B44 SBS route, has been reconstructed as part of a capital project through the NYC Department of Design and Construction (DDC). This plaza serves as the north..."
          }
        ]
      },
      {
        "record_id": "entity_manhattan-community-board-7",
        "record_kind": "entity",
        "display_name": "entity_manhattan_community_board_7",
        "source_ids": [
          "m86_sbs_progress_report_2017"
        ],
        "payload": {
          "entity_name": "Manhattan Community Board 7",
          "entity_type": "community_board",
          "description": "Transportation Committee of Manhattan Community Board 7",
          "_merged_field_values": {
            "entity_type": [
              "community_board",
              "community board"
            ]
          }
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p003_c0013",
            "page_number": 3,
            "role": "description",
            "snippet": "Community outreach was an important part of the project, as it provided local knowledge and feedback to the planning and implementation process. Given the short length of the route and the limited scope of implementatio..."
          }
        ]
      },
      {
        "record_id": "entity_manhattan-community-board-8",
        "record_kind": "entity",
        "display_name": "entity_manhattan_community_board_8",
        "source_ids": [
          "m86_sbs_progress_report_2017"
        ],
        "payload": {
          "entity_name": "Manhattan Community Board 8",
          "entity_type": "community_board",
          "description": "Transportation Committee of Manhattan Community Board 8",
          "_merged_field_values": {
            "entity_type": [
              "community_board",
              "community board"
            ]
          }
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p003_c0013",
            "page_number": 3,
            "role": "description",
            "snippet": "Community outreach was an important part of the project, as it provided local knowledge and feedback to the planning and implementation process. Given the short length of the route and the limited scope of implementatio..."
          }
        ]
      }
    ]
  },
  {
    "value": "organization",
    "count": 3,
    "records": [
      "entity_r-ladies",
      "entity_transitcenter-tsp-2017",
      "entity_tri-state-transportation-campaign-tsp-2017"
    ],
    "representative_records": [
      {
        "record_id": "entity_r-ladies",
        "record_kind": "entity",
        "display_name": "R-Ladies",
        "source_ids": [
          "open_data_plan_2023_update"
        ],
        "payload": {
          "entity_name": "R-Ladies",
          "entity_type": "organization",
          "description": "Organization dedicated to promoting gender diversity in data science. MTA spoke at an R-Ladies public event in November 2022."
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2023_update",
            "block_id": "p005_c0004",
            "page_number": 5,
            "role": "stated",
            "snippet": "Since 2022 was a year of transition in program management, getting oriented to the workload and issues ahead was our team's number one priority. We did speak at a public event in November 2022 with R-Ladies, an organiza..."
          }
        ]
      },
      {
        "record_id": "entity_transitcenter-tsp-2017",
        "record_kind": "entity",
        "display_name": "TransitCenter",
        "source_ids": [
          "tsp_status_2017"
        ],
        "payload": {
          "entity_name": "TransitCenter",
          "entity_type": "organization",
          "description": "Advocacy organization; NYC program director quoted in the TSP press release"
        },
        "evidence_examples": [
          {
            "source_id": "tsp_status_2017",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "entity_mention",
            "snippet": "DOT Press Releases &#8211; DOT Releases Status Report on “Transit Signal Priority” Technology Used To Speed MTA Buses Skip to main content NYC NYC Resources 311 Office of the Mayor About DOT Press Releases FOR IMMEDIATE..."
          }
        ]
      },
      {
        "record_id": "entity_tri-state-transportation-campaign-tsp-2017",
        "record_kind": "entity",
        "display_name": "Tri-State Transportation Campaign",
        "source_ids": [
          "tsp_status_2017"
        ],
        "payload": {
          "entity_name": "Tri-State Transportation Campaign",
          "entity_type": "organization",
          "description": "Advocacy organization; executive director quoted in the TSP press release"
        },
        "evidence_examples": [
          {
            "source_id": "tsp_status_2017",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "entity_mention",
            "snippet": "DOT Press Releases &#8211; DOT Releases Status Report on “Transit Signal Priority” Technology Used To Speed MTA Buses Skip to main content NYC NYC Resources 311 Office of the Mayor About DOT Press Releases FOR IMMEDIATE..."
          }
        ]
      }
    ]
  },
  {
    "value": "accessibility technology",
    "count": 2,
    "records": [
      "entity_convo-access-pilot",
      "entity_navilens-program"
    ],
    "representative_records": [
      {
        "record_id": "entity_convo-access-pilot",
        "record_kind": "entity",
        "display_name": "Convo Access ASL Interpretation Pilot",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "entity_name": "Convo Access Pilot Program",
          "entity_type": "accessibility technology",
          "description": "ASL interpretation via QR code for Deaf/hard-of-hearing customers",
          "successful_calls": "over 200 in 3 months",
          "top_locations": [
            "3 Stone Street",
            "Penn Station"
          ],
          "active_locations": "over 15 locations across MTA",
          "top_locations_normalized": [
            {
              "raw_text": "3 Stone Street"
            },
            {
              "raw_text": "Penn Station"
            }
          ],
          "active_locations_normalized": {
            "raw_text": "over 15 locations across MTA"
          }
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p026_c0008",
            "page_number": 26,
            "role": "description",
            "snippet": "Our Convo Access pilot also continues to move forward. Convo Access instantly connects people who are Deaf or hard-of-hearing with an American Sign Language interpreter to facilitate conversations with MTA staff. Custom..."
          }
        ]
      },
      {
        "record_id": "entity_navilens-program",
        "record_kind": "entity",
        "display_name": "NaviLens Wayfinding Program",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "entity_name": "NaviLens Wayfinding Program",
          "entity_type": "accessibility technology",
          "stations_with_navilens": 44,
          "navilens_uses_ytd": "over 45,000",
          "bus_routes_covered": [
            "Bx12"
          ],
          "subway_line_deployed": "6 line",
          "notable_stations": [
            "Brooklyn Bridge-City Hall",
            "Canal St",
            "Bleecker St/Broadway-Lafayette",
            "Union Sq"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p026_c0006",
            "page_number": 26,
            "role": "description",
            "snippet": "The MTA continues to make progress on new technology pilots that enhance our communication with customers. The current NaviLens wayfinding, information, and language translation app project has continued to move forward..."
          }
        ]
      }
    ]
  },
  {
    "value": "advocacy_organization",
    "count": 2,
    "records": [
      "entity_riders-alliance",
      "entity_transportation-alternatives"
    ],
    "representative_records": [
      {
        "record_id": "entity_riders-alliance",
        "record_kind": "entity",
        "display_name": "Riders Alliance (entity reference for TSP source)",
        "source_ids": [
          "161st_bx6_capital_project_2026",
          "tsp_status_2017"
        ],
        "payload": {
          "entity_name": "Riders Alliance",
          "entity_type": "advocacy_organization",
          "executive_director": "Betsy Plum",
          "_merged_field_values": {
            "entity_type": [
              "advocacy_organization",
              "organization"
            ]
          },
          "description": "Advocacy organization; deputy director quoted in TSP press release"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "entity_mention",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      },
      {
        "record_id": "entity_transportation-alternatives",
        "record_kind": "entity",
        "display_name": "entity_transportation_alternatives",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "entity_name": "Transportation Alternatives",
          "entity_type": "advocacy_organization",
          "executive_director": "Ben Furnas"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "entity_mention",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      }
    ]
  },
  {
    "value": "agency",
    "count": 2,
    "records": [
      "entity_mta-nyct",
      "entity_nyc-dot"
    ],
    "representative_records": [
      {
        "record_id": "entity_mta-nyct",
        "record_kind": "entity",
        "display_name": "MTA NYCT Reference",
        "source_ids": [
          "14th_street_busway",
          "14th_street_busway_brochure",
          "14th_street_fall2019_monitoring",
          "14th_street_winter2020_monitoring",
          "161st_bx6_capital_project_2026",
          "181st_street_jun2022",
          "ace_routes_dataset_dictionary",
          "b44_sbs_progress_report_2016",
          "behind_schedule_2025",
          "better_buses",
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021",
          "brooklyn_bus_network_draft_plan_with_route_profiles",
          "bus_lane_camera_report_2024",
          "busway_34thstreet",
          "busway_tremontavenue",
          "fare_free_bus_pilot_evaluation",
          "jamaica",
          "jamaica_busway_monitoring_update_2022",
          "jay_street_pilot_overview",
          "life_in_slow_lane_2025",
          "m86_sbs_progress_report_2017",
          "mta_automated_camera_enforcement",
          "nyct_key_performance_metrics_doc194001",
          "nyct_key_performance_metrics_june2025",
          "open_data_lessons_2026",
          "open_data_plan_2022",
          "open_data_plan_2024_update",
          "open_data_plan_2025_update",
          "open_data_plan_2026_update",
          "open_data_program",
          "q70_fare_free_service_increases_2025",
          "queens_addendum_equity_evaluation_appendix_d",
          "queens_proposed_final_plan_2023",
          "queens_proposed_final_plan_addendum_2024",
          "queens_service_change_board_item_2025",
          "sbs_features",
          "soundview_bus_priority_press_release_2021",
          "speeding_up_slowly_2025",
          "streets_plan_update_2026",
          "tremont_ave_busway",
          "tsp_report_2017",
          "tsp_status_2017"
        ],
        "payload": {
          "entity_name": "MTA New York City Transit",
          "entity_type": "agency",
          "agency_name": "MTA NYCT",
          "_merged_field_values": {
            "entity_type": [
              "agency",
              "transit_agency",
              "transit agency",
              "transit authority",
              "transit_authority",
              "transit_operator",
              "transit operating agency",
              "government agency",
              "public authority"
            ],
            "agency_name": [
              "MTA NYCT",
              "NYCT",
              "MTA",
              "MTA New York City Transit",
              "Metropolitan Transportation Authority",
              "New York City Transit"
            ],
            "description": [
              "Joint project lead for Select Bus Service and operator of M14A/D Select Bus Service",
              "Operator of M14 A/D Select Bus Service and beneficiary of the left turn exception for MTA buses at signed locations.",
              "Division of MTA managing local, express, and Select Bus Service routes",
              "Public transportation authority for New York State, publisher of the Open Data Plan 2024 Annual Update",
              "The MTA moves millions of people every day and manages the Open Data Program to share data publicly",
              "The MTA operates the Congestion Relief Zone in Manhattan and provides subway and bus service referenced in the NYC Streets Plan Update 2026."
            ],
            "entity_name": [
              "MTA New York City Transit",
              "Metropolitan Transportation Authority",
              "MTA",
              "Metropolitan Transportation Authority New York City Transit",
              "New York City Transit (NYCT)",
              "New York City Transit",
              "New York City Transit (NYCT) and MTA Bus",
              "Metropolitan Transportation Authority (MTA)",
              "Metropolitan Transportation Authority (MTA) New York City Transit"
            ],
            "role": [
              "data provider for bus performance and partner on TTP Pilot Project",
              "publisher",
              "project_lead",
              "partner_agency",
              "ACE program administrator",
              "lead_agency_for_redesign"
            ],
            "acronym": [
              "MTA",
              "NYCT",
              "MTA NYCT"
            ],
            "subway_cars": [
              6700,
              "nearly 6,700"
            ],
            "buses": [
              5800,
              "5,800"
            ],
            "short_name": [
              "MTA",
              "NYCT"
            ]
          },
          "role": "data provider for bus performance and partner on TTP Pilot Project",
          "description": "Joint project lead for Select Bus Service and operator of M14A/D Select Bus Service",
          "name": "MTA New York City Transit",
          "acronym": "MTA",
          "role_in_source": "co-lead of Jamaica Bus Improvement Study",
          "data_source": true,
          "employees": 45000,
          "daily_passengers": 4500000,
          "subway_cars": 6700,
          "buses": 5800,
          "subway_stations": 472,
          "track_miles": 640,
          "bus_depots": 27,
          "shops_and_yards": 70,
          "jurisdiction": "New York State",
          "short_name": "MTA",
          "publisher": true,
          "operator": true
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p003_c0003",
            "page_number": 3,
            "role": "description",
            "snippet": "Select Bus Service (SBS) is a joint program between MTA New York City Transit (NYCT) and the New York City Department of Transportation (NYC DOT), to provide improved transit service through the application of Bus Rapid..."
          }
        ]
      },
      {
        "record_id": "entity_nyc-dot",
        "record_kind": "entity",
        "display_name": "NYC DOT as Publisher",
        "source_ids": [
          "14th_street_busway",
          "14th_street_busway_brochure",
          "14th_street_fall2019_monitoring",
          "14th_street_winter2020_monitoring",
          "161st_bx6_capital_project_2026",
          "181st_street_jun2022",
          "34th_st_busway",
          "b44_sbs_progress_report_2016",
          "behind_schedule_2025",
          "better_buses",
          "better_buses_action_plan_2019",
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021",
          "brooklyn_bus_network_draft_plan_with_route_profiles",
          "brt_route_index",
          "bus_lane_camera_report_2024",
          "bus_lanes_dataset_dictionary",
          "busway_34thstreet",
          "busway_tremontavenue",
          "busways",
          "jamaica",
          "jamaica_archer_brochure",
          "jamaica_busway_monitoring_update_2022",
          "jay_street_pilot_overview",
          "life_in_slow_lane_2025",
          "m86_sbs_progress_report_2017",
          "mta_automated_camera_enforcement",
          "queens_addendum_equity_evaluation_appendix_d",
          "queens_proposed_final_plan_2023",
          "queens_proposed_final_plan_addendum_2024",
          "queens_service_change_board_item_2025",
          "sbs_features",
          "soundview_bus_priority_press_release_2021",
          "speeding_up_slowly_2025",
          "streets_plan",
          "streets_plan_update_2026",
          "tremont_ave_busway",
          "tsp_report_2017",
          "tsp_status_2017"
        ],
        "payload": {
          "entity_name": "New York City Department of Transportation",
          "entity_type": "agency",
          "agency_name": "NYC DOT",
          "_merged_field_values": {
            "agency_name": [
              "NYC DOT",
              "NYCDOT",
              "NYC Department of Transportation",
              "New York City Department of Transportation"
            ],
            "entity_type": [
              "agency",
              "government_agency",
              "government agency",
              "municipal agency",
              "city agency",
              "transportation_department",
              "transportation_agency",
              "city_agency"
            ],
            "description": [
              "Joint project lead for Select Bus Service and operator of the 14th Street Busway",
              "Publisher of the 14th Street Busway brochure and lead agency for the Transit & Truck Priority Pilot Project.",
              "Responsible for installing bus lanes, shelters, and bus priority infrastructure",
              "The New York City Department of Transportation leads street redesign, safety, and sustainable transportation projects under Mayor Zohran Mamdani and Commissioner Mike Flynn.",
              "NYC DOT developed the NYC Streets Plan, a five-year transportation plan to improve the safety, accessibility, and quality of the City's streets for all New Yorkers."
            ],
            "entity_name": [
              "New York City Department of Transportation",
              "NYC Department of Transportation",
              "NYC Department of Transportation (DOT)",
              "NYC Department of Transportation (NYCDOT)",
              "NYC Department of Transportation (NYC DOT)",
              "New York City Department of Transportation (DOT)"
            ],
            "name": [
              "NYC DOT",
              "New York City Department of Transportation"
            ],
            "role": [
              "implementer and monitor of TTP Pilot Project",
              "bus_priority_study_partner",
              "report_publisher_and_program_administrator",
              "busway_operator_and_publisher",
              "publisher_and_operator",
              "ACE program partner",
              "partner_agency_for_bus_priority"
            ],
            "publisher": [
              "NYC DOT",
              true
            ],
            "acronym": [
              "DOT",
              "NYC DOT"
            ]
          },
          "role": "implementer and monitor of TTP Pilot Project",
          "description": "Joint project lead for Select Bus Service and operator of the 14th Street Busway",
          "owner": "New York City",
          "publisher": "NYC DOT",
          "name": "NYC DOT",
          "acronym": "DOT",
          "commissioner": "Ydanis Rodriguez",
          "role_in_source": "co-lead of Jamaica Bus Improvement Study",
          "short_name": "NYC DOT"
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p003_c0003",
            "page_number": 3,
            "role": "description",
            "snippet": "Select Bus Service (SBS) is a joint program between MTA New York City Transit (NYCT) and the New York City Department of Transportation (NYC DOT), to provide improved transit service through the application of Bus Rapid..."
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
  }
}
```

### entity-source-role:relation-context:entity.agency

- Category: relation_context_field
- Priority: 115
- Record kind: entity
- Field: agency
- Count: 2
- Title: Entity field agency should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 1 endpoint values are already present or derivable (1 already present, 0 newly derivable); 1 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: related_agency.
- entity.agency appears on 2 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Metropolitan Transportation Authority (MTA)",
    "count": 1,
    "records": [
      "entity_janno-lieber-2025"
    ],
    "representative_records": [
      {
        "record_id": "entity_janno-lieber-2025",
        "record_kind": "entity",
        "display_name": "Janno Lieber, MTA Chair & CEO",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "entity_name": "Janno Lieber",
          "role": "MTA Chair & CEO",
          "agency": "Metropolitan Transportation Authority (MTA)"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p002_c0001",
            "page_number": 2,
            "role": "entity_description",
            "snippet": "MTA Chair & CEO Janno Lieber, NYCT President Demetrius Crichlow and Queens Borough President Donovan Richards at the announcement for the two-phase implementation of the Queens Bus Network Redesign at Queens Borough Hal..."
          }
        ]
      }
    ]
  },
  {
    "value": "MTA New York City Transit",
    "count": 1,
    "records": [
      "entity_demetrius-crichlow"
    ],
    "representative_records": [
      {
        "record_id": "entity_demetrius-crichlow",
        "record_kind": "entity",
        "display_name": "Demetrius Crichlow, President of New York City Transit",
        "source_ids": [
          "nyct_key_performance_metrics_doc194001",
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "entity_name": "Demetrius Crichlow",
          "name": "Demetrius Crichlow",
          "title": "President of New York City Transit",
          "entity_type": "person",
          "role": "President of New York City Transit",
          "agency": "MTA New York City Transit"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_doc194001",
            "block_id": "p004_c0003",
            "page_number": 4,
            "role": "title_and_name",
            "snippet": "Demetrius Crichlow President New York City Transit"
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
  "derived_relation_coverage": [
    {
      "rule_id": "entity-organization",
      "relation_kind": "part_of_agency",
      "direction": "origin_to_target",
      "records_with_field": 2,
      "value_count": 2,
      "derived_count": 0,
      "already_present_count": 1,
      "unresolved_count": 1,
      "skipped_self_count": 0
    }
  ]
}
```

### entity-source-role:relation-context:entity.office

- Category: relation_context_field
- Priority: 115
- Record kind: entity
- Field: office
- Count: 2
- Title: Entity field office should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 1 endpoint values are already present or derivable (1 already present, 0 newly derivable); 1 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: part_of_agency.
- entity.office appears on 2 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "New York City Comptroller",
    "count": 1,
    "records": [
      "entity_nyc-comptroller-brad-lander"
    ],
    "representative_records": [
      {
        "record_id": "entity_nyc-comptroller-brad-lander",
        "record_kind": "entity",
        "display_name": "New York City Comptroller Brad Lander",
        "source_ids": [
          "behind_schedule_2025",
          "life_in_slow_lane_2025"
        ],
        "payload": {
          "entity_name": "New York City Comptroller Brad Lander",
          "office": "New York City Comptroller",
          "entity_type": "government agency",
          "publisher": true,
          "_merged_field_values": {
            "publisher": [
              true,
              "NYC Comptroller"
            ]
          }
        },
        "evidence_examples": [
          {
            "source_id": "behind_schedule_2025",
            "block_id": "p001_c0002",
            "page_number": 1,
            "snippet": "NEW YORK CITY COMPTROLLER BRAD LANDER"
          }
        ]
      }
    ]
  },
  {
    "value": "New York City Council",
    "count": 1,
    "records": [
      "entity_cm-carmen-de-la-rosa"
    ],
    "representative_records": [
      {
        "record_id": "entity_cm-carmen-de-la-rosa",
        "record_kind": "entity",
        "display_name": "Council Member Carmen De La Rosa",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "entity_name": "Carmen De La Rosa",
          "entity_type": "city council member",
          "office": "New York City Council"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p011_c0003",
            "page_number": 11,
            "role": "stated",
            "snippet": "DOT, WHBID, and staff from CM De La Rosa's office went door-to-door to businesses on 181st St to hear concerns"
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
  "derived_relation_coverage": [
    {
      "rule_id": "entity-organization",
      "relation_kind": "part_of_agency",
      "direction": "origin_to_target",
      "records_with_field": 2,
      "value_count": 2,
      "derived_count": 0,
      "already_present_count": 1,
      "unresolved_count": 1,
      "skipped_self_count": 0
    }
  ]
}
```

### entity-source-role:relation-context:entity.organization

- Category: relation_context_field
- Priority: 115
- Record kind: entity
- Field: organization
- Count: 7
- Title: Entity field organization should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 3 endpoint values are already present or derivable (3 already present, 0 newly derivable); 4 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: part_of_agency.
- entity.organization appears on 7 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Metropolitan Transportation Authority",
    "count": 2,
    "records": [
      "entity_mta-board-open-data-plan",
      "entity_sarah-meyer-open-data-plan"
    ],
    "representative_records": [
      {
        "record_id": "entity_mta-board-open-data-plan",
        "record_kind": "entity",
        "display_name": "MTA Board",
        "source_ids": [
          "open_data_plan_2022",
          "open_data_plan_2025_update"
        ],
        "payload": {
          "entity_name": "MTA Board",
          "organization": "Metropolitan Transportation Authority",
          "entity_type": "governing body",
          "_merged_field_values": {
            "entity_type": [
              "governing body",
              "governing board"
            ]
          }
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2022",
            "block_id": "p002_c0005",
            "page_number": 2,
            "role": "context",
            "snippet": "The MTA has a long history of publishing data, both open data and data visualizations that lower barriers to interpretation of our data. To date, in addition to the data published to the NYS portal Open Data NY , MTA ha..."
          }
        ]
      },
      {
        "record_id": "entity_sarah-meyer-open-data-plan",
        "record_kind": "entity",
        "display_name": "Sarah Meyer, MTA Chief Customer Officer",
        "source_ids": [
          "open_data_plan_2022"
        ],
        "payload": {
          "entity_name": "Sarah Meyer",
          "title": "Chief Customer Officer",
          "organization": "Metropolitan Transportation Authority",
          "entity_type": "person"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2022",
            "block_id": "p001_c0013",
            "page_number": 1,
            "role": "signature",
            "snippet": "A handwritten signature in black ink, appearing to read \"Sarah Meyer\"."
          }
        ]
      }
    ]
  },
  {
    "value": "New York State Assembly",
    "count": 1,
    "records": [
      "entity_carl-heastie-open-data-plan"
    ],
    "representative_records": [
      {
        "record_id": "entity_carl-heastie-open-data-plan",
        "record_kind": "entity",
        "display_name": "Carl Heastie, NYS Assembly Speaker",
        "source_ids": [
          "open_data_plan_2022"
        ],
        "payload": {
          "entity_name": "Carl Heastie",
          "title": "Speaker",
          "organization": "New York State Assembly",
          "entity_type": "person"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2022",
            "block_id": "p001_c0006",
            "page_number": 1,
            "role": "addressee",
            "snippet": "The Honorable Carl Heastie Speaker New York State Assembly 932 Legislative Office Building Albany, NY 12248"
          }
        ]
      }
    ]
  },
  {
    "value": "New York State Senate",
    "count": 1,
    "records": [
      "entity_andrea-stewart-cousins-open-data-plan"
    ],
    "representative_records": [
      {
        "record_id": "entity_andrea-stewart-cousins-open-data-plan",
        "record_kind": "entity",
        "display_name": "Andrea Stewart-Cousins, NYS Senate President Pro Tempore",
        "source_ids": [
          "open_data_plan_2022"
        ],
        "payload": {
          "entity_name": "Andrea Stewart-Cousins",
          "title": "President Pro Tempore & Majority Leader",
          "organization": "New York State Senate",
          "entity_type": "person"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2022",
            "block_id": "p001_c0005",
            "page_number": 1,
            "role": "addressee",
            "snippet": "The Honorable Andrea Stewart-Cousins President Pro Tempore & Majority Leader New York State Senate 330 State Capitol Building Albany, NY 12247"
          }
        ]
      }
    ]
  },
  {
    "value": "Riders Alliance",
    "count": 1,
    "records": [
      "entity_nick-sifuentes-riders-alliance-tsp-2017"
    ],
    "representative_records": [
      {
        "record_id": "entity_nick-sifuentes-riders-alliance-tsp-2017",
        "record_kind": "entity",
        "display_name": "Nick Sifuentes, Riders Alliance",
        "source_ids": [
          "tsp_status_2017"
        ],
        "payload": {
          "entity_name": "Nick Sifuentes",
          "entity_type": "person",
          "organization": "Riders Alliance",
          "description": "Deputy Director of the Riders Alliance quoted in the TSP press release"
        },
        "evidence_examples": [
          {
            "source_id": "tsp_status_2017",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "entity_mention",
            "snippet": "DOT Press Releases &#8211; DOT Releases Status Report on “Transit Signal Priority” Technology Used To Speed MTA Buses Skip to main content NYC NYC Resources 311 Office of the Mayor About DOT Press Releases FOR IMMEDIATE..."
          }
        ]
      }
    ]
  },
  {
    "value": "TransitCenter",
    "count": 1,
    "records": [
      "entity_tabitha-decker-transitcenter-tsp-2017"
    ],
    "representative_records": [
      {
        "record_id": "entity_tabitha-decker-transitcenter-tsp-2017",
        "record_kind": "entity",
        "display_name": "Tabitha Decker, TransitCenter",
        "source_ids": [
          "tsp_status_2017"
        ],
        "payload": {
          "entity_name": "Tabitha Decker",
          "entity_type": "person",
          "organization": "TransitCenter",
          "description": "NYC program director for TransitCenter quoted in the TSP press release"
        },
        "evidence_examples": [
          {
            "source_id": "tsp_status_2017",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "entity_mention",
            "snippet": "DOT Press Releases &#8211; DOT Releases Status Report on “Transit Signal Priority” Technology Used To Speed MTA Buses Skip to main content NYC NYC Resources 311 Office of the Mayor About DOT Press Releases FOR IMMEDIATE..."
          }
        ]
      }
    ]
  },
  {
    "value": "Tri-State Transportation Campaign",
    "count": 1,
    "records": [
      "entity_veronica-vanterpool-tsp-2017"
    ],
    "representative_records": [
      {
        "record_id": "entity_veronica-vanterpool-tsp-2017",
        "record_kind": "entity",
        "display_name": "Veronica Vanterpool, Tri-State Transportation Campaign",
        "source_ids": [
          "tsp_status_2017"
        ],
        "payload": {
          "entity_name": "Veronica Vanterpool",
          "entity_type": "person",
          "organization": "Tri-State Transportation Campaign",
          "description": "Executive director of the Tri-State Transportation Campaign and member of the MTA board"
        },
        "evidence_examples": [
          {
            "source_id": "tsp_status_2017",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "entity_mention",
            "snippet": "DOT Press Releases &#8211; DOT Releases Status Report on “Transit Signal Priority” Technology Used To Speed MTA Buses Skip to main content NYC NYC Resources 311 Office of the Mayor About DOT Press Releases FOR IMMEDIATE..."
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
  "derived_relation_coverage": [
    {
      "rule_id": "entity-organization",
      "relation_kind": "part_of_agency",
      "direction": "origin_to_target",
      "records_with_field": 7,
      "value_count": 7,
      "derived_count": 0,
      "already_present_count": 3,
      "unresolved_count": 4,
      "skipped_self_count": 0
    }
  ]
}
```

### entity-source-role:relation-context:entity.owner

- Category: relation_context_field
- Priority: 115
- Record kind: entity
- Field: owner
- Count: 2
- Title: Entity field owner should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 0 endpoint values are already present or derivable (0 already present, 0 newly derivable); 2 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: owned_by.
- entity.owner appears on 2 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "New York City",
    "count": 1,
    "records": [
      "entity_nyc-dot"
    ],
    "representative_records": [
      {
        "record_id": "entity_nyc-dot",
        "record_kind": "entity",
        "display_name": "NYC DOT as Publisher",
        "source_ids": [
          "14th_street_busway",
          "14th_street_busway_brochure",
          "14th_street_fall2019_monitoring",
          "14th_street_winter2020_monitoring",
          "161st_bx6_capital_project_2026",
          "181st_street_jun2022",
          "34th_st_busway",
          "b44_sbs_progress_report_2016",
          "behind_schedule_2025",
          "better_buses",
          "better_buses_action_plan_2019",
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021",
          "brooklyn_bus_network_draft_plan_with_route_profiles",
          "brt_route_index",
          "bus_lane_camera_report_2024",
          "bus_lanes_dataset_dictionary",
          "busway_34thstreet",
          "busway_tremontavenue",
          "busways",
          "jamaica",
          "jamaica_archer_brochure",
          "jamaica_busway_monitoring_update_2022",
          "jay_street_pilot_overview",
          "life_in_slow_lane_2025",
          "m86_sbs_progress_report_2017",
          "mta_automated_camera_enforcement",
          "queens_addendum_equity_evaluation_appendix_d",
          "queens_proposed_final_plan_2023",
          "queens_proposed_final_plan_addendum_2024",
          "queens_service_change_board_item_2025",
          "sbs_features",
          "soundview_bus_priority_press_release_2021",
          "speeding_up_slowly_2025",
          "streets_plan",
          "streets_plan_update_2026",
          "tremont_ave_busway",
          "tsp_report_2017",
          "tsp_status_2017"
        ],
        "payload": {
          "entity_name": "New York City Department of Transportation",
          "entity_type": "agency",
          "agency_name": "NYC DOT",
          "_merged_field_values": {
            "agency_name": [
              "NYC DOT",
              "NYCDOT",
              "NYC Department of Transportation",
              "New York City Department of Transportation"
            ],
            "entity_type": [
              "agency",
              "government_agency",
              "government agency",
              "municipal agency",
              "city agency",
              "transportation_department",
              "transportation_agency",
              "city_agency"
            ],
            "description": [
              "Joint project lead for Select Bus Service and operator of the 14th Street Busway",
              "Publisher of the 14th Street Busway brochure and lead agency for the Transit & Truck Priority Pilot Project.",
              "Responsible for installing bus lanes, shelters, and bus priority infrastructure",
              "The New York City Department of Transportation leads street redesign, safety, and sustainable transportation projects under Mayor Zohran Mamdani and Commissioner Mike Flynn.",
              "NYC DOT developed the NYC Streets Plan, a five-year transportation plan to improve the safety, accessibility, and quality of the City's streets for all New Yorkers."
            ],
            "entity_name": [
              "New York City Department of Transportation",
              "NYC Department of Transportation",
              "NYC Department of Transportation (DOT)",
              "NYC Department of Transportation (NYCDOT)",
              "NYC Department of Transportation (NYC DOT)",
              "New York City Department of Transportation (DOT)"
            ],
            "name": [
              "NYC DOT",
              "New York City Department of Transportation"
            ],
            "role": [
              "implementer and monitor of TTP Pilot Project",
              "bus_priority_study_partner",
              "report_publisher_and_program_administrator",
              "busway_operator_and_publisher",
              "publisher_and_operator",
              "ACE program partner",
              "partner_agency_for_bus_priority"
            ],
            "publisher": [
              "NYC DOT",
              true
            ],
            "acronym": [
              "DOT",
              "NYC DOT"
            ]
          },
          "role": "implementer and monitor of TTP Pilot Project",
          "description": "Joint project lead for Select Bus Service and operator of the 14th Street Busway",
          "owner": "New York City",
          "publisher": "NYC DOT",
          "name": "NYC DOT",
          "acronym": "DOT",
          "commissioner": "Ydanis Rodriguez",
          "role_in_source": "co-lead of Jamaica Bus Improvement Study",
          "short_name": "NYC DOT"
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p003_c0003",
            "page_number": 3,
            "role": "description",
            "snippet": "Select Bus Service (SBS) is a joint program between MTA New York City Transit (NYCT) and the New York City Department of Transportation (NYC DOT), to provide improved transit service through the application of Bus Rapid..."
          }
        ]
      }
    ]
  },
  {
    "value": "New York State",
    "count": 1,
    "records": [
      "entity_ny-open-data-portal"
    ],
    "representative_records": [
      {
        "record_id": "entity_ny-open-data-portal",
        "record_kind": "entity",
        "display_name": "New York State Open Data Portal",
        "source_ids": [
          "open_data_lessons_2026",
          "open_data_plan_2026_update"
        ],
        "payload": {
          "entity_name": "New York State open data portal",
          "name": "data.ny.gov",
          "entity_type": "data_portal",
          "owner": "New York State",
          "_merged_field_values": {
            "entity_name": [
              "New York State open data portal",
              "New York State Open Data Portal"
            ],
            "entity_type": [
              "data_portal",
              "data portal"
            ]
          },
          "url": "data.ny.gov"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_lessons_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "source_context",
            "snippet": "Lessons learned in the MTA’s Open Data program Skip to main content Menu Close Menu Schedules Maps Fares and tolls Planned Service Changes Travel Back Elevator & Escalator Status Accessibility Sign up for service alerts..."
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
  "derived_relation_coverage": [
    {
      "rule_id": "entity-owner",
      "relation_kind": "owned_by",
      "direction": "origin_to_target",
      "records_with_field": 2,
      "value_count": 2,
      "derived_count": 0,
      "already_present_count": 0,
      "unresolved_count": 2,
      "skipped_self_count": 0
    }
  ]
}
```

### entity-source-role:relation-context:entity.parent_entity

- Category: relation_context_field
- Priority: 115
- Record kind: entity
- Field: parent_entity
- Count: 2
- Title: Entity field parent_entity should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 2 endpoint values are already present or derivable (2 already present, 0 newly derivable); 0 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: part_of_agency.
- entity.parent_entity appears on 2 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Metropolitan Transportation Authority (MTA)",
    "count": 1,
    "records": [
      "entity_mta-bus-company"
    ],
    "representative_records": [
      {
        "record_id": "entity_mta-bus-company",
        "record_kind": "entity",
        "display_name": "MTA Bus Company",
        "source_ids": [
          "behind_schedule_2025",
          "better_buses_action_plan_2019",
          "bus_lane_camera_report_2024",
          "q70_fare_free_service_increases_2025",
          "queens_service_change_board_item_2025",
          "sbs_features",
          "soundview_bus_priority_press_release_2021",
          "speeding_up_slowly_2025"
        ],
        "payload": {
          "entity_name": "MTA Bus Company",
          "entity_type": "transit agency division",
          "parent_entity": "Metropolitan Transportation Authority (MTA)",
          "description": "Division of MTA that runs express service to Manhattan and about 40 local routes in the Bronx and Queens",
          "name": "MTA Bus Company",
          "_merged_field_values": {
            "entity_type": [
              "transit agency division",
              "transit_operator",
              "bus_operator",
              "transit_agency",
              "transit agency",
              "transit operator"
            ],
            "entity_name": [
              "MTA Bus Company",
              "MTA Bus"
            ],
            "agency_name": [
              "MTA Bus Company",
              "MTA Bus"
            ],
            "parent_entity": [
              "Metropolitan Transportation Authority (MTA)",
              "Metropolitan Transportation Authority"
            ]
          },
          "acronym": "MTA Bus",
          "agency_name": "MTA Bus Company",
          "operator": true
        },
        "evidence_examples": [
          {
            "source_id": "behind_schedule_2025",
            "block_id": "p010_c0003",
            "page_number": 10,
            "snippet": "New York City's bus system is managed by the MTA, the country's largest transit agency. The MTA bus system consists of a fleet of over 5,800 buses and 330 routes across the five boroughs. 8 Two divisions within the MTA..."
          }
        ]
      }
    ]
  },
  {
    "value": "New York City Comptroller Brad Lander",
    "count": 1,
    "records": [
      "entity_bureau-of-policy-and-research"
    ],
    "representative_records": [
      {
        "record_id": "entity_bureau-of-policy-and-research",
        "record_kind": "entity",
        "display_name": "Bureau of Policy and Research",
        "source_ids": [
          "behind_schedule_2025"
        ],
        "payload": {
          "entity_name": "Bureau of Policy and Research",
          "entity_type": "research bureau",
          "parent_entity": "New York City Comptroller Brad Lander"
        },
        "evidence_examples": [
          {
            "source_id": "behind_schedule_2025",
            "block_id": "p010_c0003",
            "page_number": 10,
            "snippet": "New York City's bus system is managed by the MTA, the country's largest transit agency. The MTA bus system consists of a fleet of over 5,800 buses and 330 routes across the five boroughs. 8 Two divisions within the MTA..."
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
  "derived_relation_coverage": [
    {
      "rule_id": "entity-organization",
      "relation_kind": "part_of_agency",
      "direction": "origin_to_target",
      "records_with_field": 2,
      "value_count": 2,
      "derived_count": 0,
      "already_present_count": 2,
      "unresolved_count": 0,
      "skipped_self_count": 0
    }
  ]
}
```

### entity-source-role:relation-context:entity.parent_organization

- Category: relation_context_field
- Priority: 115
- Record kind: entity
- Field: parent_organization
- Count: 2
- Title: Entity field parent_organization should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 0 endpoint values are already present or derivable (0 already present, 0 newly derivable); 2 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: part_of_agency.
- entity.parent_organization appears on 2 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Metropolitan Transportation Authority",
    "count": 2,
    "records": [
      "entity_mta-hq-data-analytics",
      "entity_mta-open-data-team"
    ],
    "representative_records": [
      {
        "record_id": "entity_mta-hq-data-analytics",
        "record_kind": "entity",
        "display_name": "MTA Data & Analytics Team",
        "source_ids": [
          "open_data_plan_2023_update",
          "open_data_plan_2026_update",
          "open_data_program",
          "segment_speed_methodology_2024"
        ],
        "payload": {
          "entity_name": "MTA Data & Analytics Team",
          "agency_name": "Metropolitan Transportation Authority",
          "entity_type": "internal team",
          "description": "Team at MTA HQ that assumed responsibility for the MTA Open Data Program in 2022, led by MTA's Data Coordinator Jon Kaufman.",
          "_merged_field_values": {
            "agency_name": [
              "Metropolitan Transportation Authority",
              "MTA"
            ],
            "entity_type": [
              "internal team",
              "internal_team",
              "team"
            ],
            "description": [
              "Team at MTA HQ that assumed responsibility for the MTA Open Data Program in 2022, led by MTA's Data Coordinator Jon Kaufman.",
              "The MTA's center of excellence in the management, usage and sharing of data. Manages the Open Data program.",
              "The MTA team that published the segment speed dataset and methodology article"
            ]
          },
          "parent_organization": "Metropolitan Transportation Authority"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2023_update",
            "block_id": "p002_c0003",
            "page_number": 2,
            "role": "stated",
            "snippet": "In 2022, the responsibility of the MTA Open Data Program transferred from Customer Experience to the newly formed Data & Analytics team at MTA HQ. This move will allow for more seamless data management, improved pipelin..."
          }
        ]
      },
      {
        "record_id": "entity_mta-open-data-team",
        "record_kind": "entity",
        "display_name": "MTA Open Data team",
        "source_ids": [
          "open_data_plan_2024_update",
          "open_data_plan_2026_update"
        ],
        "payload": {
          "entity_name": "MTA Open Data team",
          "entity_type": "team",
          "agency_name": "Metropolitan Transportation Authority",
          "description": "Team responsible for the MTA Open Data program and publication of the Open Data Plan",
          "_merged_field_values": {
            "entity_name": [
              "MTA Open Data team",
              "MTA Open Data Team"
            ]
          },
          "parent_organization": "Metropolitan Transportation Authority"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2024_update",
            "block_id": "p002_c0004",
            "page_number": 2,
            "role": "entity_description",
            "snippet": "The MTA Open Data team is proud to release its second annual update to the original open data plan. 2023 was a year of immense growth for the program, and the team is looking forward to continuing to share more and bett..."
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
  "derived_relation_coverage": [
    {
      "rule_id": "entity-organization",
      "relation_kind": "part_of_agency",
      "direction": "origin_to_target",
      "records_with_field": 2,
      "value_count": 2,
      "derived_count": 0,
      "already_present_count": 0,
      "unresolved_count": 2,
      "skipped_self_count": 0
    }
  ]
}
```

### entity-source-role:relation-context:entity.publisher

- Category: relation_context_field
- Priority: 115
- Record kind: entity
- Field: publisher
- Count: 4
- Title: Entity field publisher should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 0 endpoint values are already present or derivable (0 already present, 0 newly derivable); 0 remain unresolved/pass-through and 2 self-links were skipped.
- Suggested relation family: published_by.
- entity.publisher appears on 4 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "NYC DOT",
    "count": 1,
    "records": [
      "entity_nyc-dot"
    ],
    "representative_records": [
      {
        "record_id": "entity_nyc-dot",
        "record_kind": "entity",
        "display_name": "NYC DOT as Publisher",
        "source_ids": [
          "14th_street_busway",
          "14th_street_busway_brochure",
          "14th_street_fall2019_monitoring",
          "14th_street_winter2020_monitoring",
          "161st_bx6_capital_project_2026",
          "181st_street_jun2022",
          "34th_st_busway",
          "b44_sbs_progress_report_2016",
          "behind_schedule_2025",
          "better_buses",
          "better_buses_action_plan_2019",
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021",
          "brooklyn_bus_network_draft_plan_with_route_profiles",
          "brt_route_index",
          "bus_lane_camera_report_2024",
          "bus_lanes_dataset_dictionary",
          "busway_34thstreet",
          "busway_tremontavenue",
          "busways",
          "jamaica",
          "jamaica_archer_brochure",
          "jamaica_busway_monitoring_update_2022",
          "jay_street_pilot_overview",
          "life_in_slow_lane_2025",
          "m86_sbs_progress_report_2017",
          "mta_automated_camera_enforcement",
          "queens_addendum_equity_evaluation_appendix_d",
          "queens_proposed_final_plan_2023",
          "queens_proposed_final_plan_addendum_2024",
          "queens_service_change_board_item_2025",
          "sbs_features",
          "soundview_bus_priority_press_release_2021",
          "speeding_up_slowly_2025",
          "streets_plan",
          "streets_plan_update_2026",
          "tremont_ave_busway",
          "tsp_report_2017",
          "tsp_status_2017"
        ],
        "payload": {
          "entity_name": "New York City Department of Transportation",
          "entity_type": "agency",
          "agency_name": "NYC DOT",
          "_merged_field_values": {
            "agency_name": [
              "NYC DOT",
              "NYCDOT",
              "NYC Department of Transportation",
              "New York City Department of Transportation"
            ],
            "entity_type": [
              "agency",
              "government_agency",
              "government agency",
              "municipal agency",
              "city agency",
              "transportation_department",
              "transportation_agency",
              "city_agency"
            ],
            "description": [
              "Joint project lead for Select Bus Service and operator of the 14th Street Busway",
              "Publisher of the 14th Street Busway brochure and lead agency for the Transit & Truck Priority Pilot Project.",
              "Responsible for installing bus lanes, shelters, and bus priority infrastructure",
              "The New York City Department of Transportation leads street redesign, safety, and sustainable transportation projects under Mayor Zohran Mamdani and Commissioner Mike Flynn.",
              "NYC DOT developed the NYC Streets Plan, a five-year transportation plan to improve the safety, accessibility, and quality of the City's streets for all New Yorkers."
            ],
            "entity_name": [
              "New York City Department of Transportation",
              "NYC Department of Transportation",
              "NYC Department of Transportation (DOT)",
              "NYC Department of Transportation (NYCDOT)",
              "NYC Department of Transportation (NYC DOT)",
              "New York City Department of Transportation (DOT)"
            ],
            "name": [
              "NYC DOT",
              "New York City Department of Transportation"
            ],
            "role": [
              "implementer and monitor of TTP Pilot Project",
              "bus_priority_study_partner",
              "report_publisher_and_program_administrator",
              "busway_operator_and_publisher",
              "publisher_and_operator",
              "ACE program partner",
              "partner_agency_for_bus_priority"
            ],
            "publisher": [
              "NYC DOT",
              true
            ],
            "acronym": [
              "DOT",
              "NYC DOT"
            ]
          },
          "role": "implementer and monitor of TTP Pilot Project",
          "description": "Joint project lead for Select Bus Service and operator of the 14th Street Busway",
          "owner": "New York City",
          "publisher": "NYC DOT",
          "name": "NYC DOT",
          "acronym": "DOT",
          "commissioner": "Ydanis Rodriguez",
          "role_in_source": "co-lead of Jamaica Bus Improvement Study",
          "short_name": "NYC DOT"
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p003_c0003",
            "page_number": 3,
            "role": "description",
            "snippet": "Select Bus Service (SBS) is a joint program between MTA New York City Transit (NYCT) and the New York City Department of Transportation (NYC DOT), to provide improved transit service through the application of Bus Rapid..."
          }
        ]
      }
    ]
  },
  {
    "value": "People Oriented Cities",
    "count": 1,
    "records": [
      "entity_people-oriented-cities"
    ],
    "representative_records": [
      {
        "record_id": "entity_people-oriented-cities",
        "record_kind": "entity",
        "display_name": "People Oriented Cities",
        "source_ids": [
          "life_in_slow_lane_2025"
        ],
        "payload": {
          "entity_name": "People Oriented Cities",
          "entity_type": "research_organization",
          "publisher": "People Oriented Cities"
        },
        "evidence_examples": [
          {
            "source_id": "life_in_slow_lane_2025",
            "block_id": "p010_c0003",
            "page_number": 10,
            "snippet": "2 People Oriented Cities. (2025). How Much Faster Are We Moving? https://peopleoriented.org/nyc-bus-priority"
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
  "derived_relation_coverage": [
    {
      "rule_id": "entity-publisher",
      "relation_kind": "published_by",
      "direction": "origin_to_target",
      "records_with_field": 2,
      "value_count": 2,
      "derived_count": 0,
      "already_present_count": 0,
      "unresolved_count": 0,
      "skipped_self_count": 2
    }
  ]
}
```
