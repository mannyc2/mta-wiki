# Route & Service Identity Agent

Agent id: `route-service-identity`

## Purpose

Normalize route identity, service variants, plus/SBS/local policy, route-id authority, and route merge/split decisions.

## Owns

- route identity
- route_type/service_variant
- MTA plus route surfaces
- route merge/split and do-not-merge decisions

## Decision Contract

Submit review decisions only as append-only normalization decisions. Do not edit canonical JSONL, wiki pages, source pages, or source literals directly.

- merge
- do_not_merge
- split_record
- alias
- canonical_value
- needs_more_data
- no_change

## Candidate Summary

Candidates: 6

- relation_context_field: 5
- route_variant_merge_conflict: 1

## Candidates

### route-service-identity:route-variant:route_m15-local-limited

- Category: route_variant_merge_conflict
- Priority: 450
- Record kind: route
- Record id: route_m15-local-limited
- Source ids: segment_speed_methodology_2024, speeding_up_slowly_2025
- Title: Route variant merge conflict: route_m15-local-limited
- Decision options: split_record, do_not_merge, alias, canonical_value, needs_more_data, no_change

Reasons:
- Merged field values include both local and SBS/select-service surfaces; review for split/do-not-merge.
- Detected variants: limited_stop, local.

Examples:
```json
[
  {
    "source_id": "speeding_up_slowly_2025",
    "block_id": "p005_c0009",
    "page_number": 5,
    "snippet": "The MTA bus network runs over 300 routes across over 3,200 miles in New York City. 2 Some of these routes, such as the M15/M15 SBS, carried over 16 million passengers in 2023. Bus routes are divided into three types of..."
  },
  {
    "source_id": "segment_speed_methodology_2024",
    "block_id": "p001_b0001",
    "page_number": 1,
    "snippet": "Beyond the route Skip to main content Menu Close Menu Schedules Maps Fares and tolls Planned Service Changes Travel Back Elevator & Escalator Status Accessibility Sign up for service alerts Guides Access-A-Ride Paratran..."
  }
]
```

Data:
```json
{
  "record_id": "route_m15-local-limited",
  "display_name": "M15",
  "source_ids": [
    "segment_speed_methodology_2024",
    "speeding_up_slowly_2025"
  ],
  "local_observation_ids": [
    "route_m15_reference",
    "route_m15_segment_speed_reference"
  ],
  "aliases": [
    "route_m15",
    "route_m15-reference",
    "route_m15-segment-speed-reference"
  ],
  "payload": {
    "route_id": "M15",
    "route_label": "M15",
    "source_route_type_phrase": "Local/Limited",
    "description": "M15 Local/Limited route reference paired with M15 SBS in the 2023 ridership discussion.",
    "route_name": "M15",
    "source_route_surface": "generic_m15_reference",
    "_merged_field_values": {
      "description": [
        "M15 Local/Limited route reference paired with M15 SBS in the 2023 ridership discussion.",
        "Generic M15 route mention in the bus segment speed methodology article."
      ]
    }
  }
}
```

### route-service-identity:relation-context:route.program

- Category: relation_context_field
- Priority: 180
- Record kind: route
- Field: program
- Count: 23
- Title: Route field program should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 0 endpoint values are already present or derivable (0 already present, 0 newly derivable); 23 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: part_of_program.
- route.program appears on 23 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "ABLE",
    "count": 21,
    "records": [
      "route_23rd-st-sbs",
      "route_able-s79-sbs",
      "route_b25",
      "route_b26"
    ],
    "representative_records": [
      {
        "record_id": "route_23rd-st-sbs",
        "record_kind": "route",
        "display_name": "M23-SBS - ABLE route",
        "source_ids": [
          "brt_route_index",
          "bus_lane_camera_report_2024",
          "mta_automated_camera_enforcement"
        ],
        "payload": {
          "route_name": "23rd Street Select Bus Service",
          "route_id": "M23",
          "borough": "Manhattan",
          "description": "SBS on 23rd Street on the M23 bus route in Manhattan",
          "borough_normalized": "manhattan",
          "route": "M23-SBS",
          "route_label": "M23-SBS",
          "program": "ABLE",
          "note": "ABLE cameras operated on this route through 2023",
          "_merged_field_values": {
            "route_id": [
              "M23",
              "M23-SBS"
            ]
          },
          "streets": "23 St"
        },
        "evidence_examples": [
          {
            "source_id": "brt_route_index",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "route_description",
            "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
          }
        ]
      },
      {
        "record_id": "route_able-s79-sbs",
        "record_kind": "route",
        "display_name": "S79-SBS - ABLE route",
        "source_ids": [
          "ace_routes_dataset_dictionary",
          "bus_lane_camera_report_2024",
          "mta_automated_camera_enforcement",
          "tsp_report_2017",
          "tsp_status_2017"
        ],
        "payload": {
          "route_id": "S79+",
          "route_label": "S79+",
          "route": "S79+",
          "route_name": "S79+",
          "internal_route_id": "S79+",
          "route_id_authority": "mta_internal",
          "source_route_surface": "mta_route_id",
          "service_variant": "sbs",
          "_merged_field_values": {
            "route": [
              "S79+",
              "S79-SBS"
            ],
            "route_label": [
              "S79+",
              "S79-SBS",
              "S79 Select Bus Service",
              "S79 SBS"
            ],
            "route_id": [
              "S79+",
              "S79-SBS",
              "S79 SBS"
            ],
            "route_name": [
              "S79+",
              "S79 SBS"
            ],
            "route_type": [
              "SBS",
              "Select Bus Service"
            ]
          },
          "program": "ABLE",
          "note": "ABLE cameras operated on this route through 2023",
          "borough": "Staten Island",
          "streets": "Hylan Blvd / Richmond Av",
          "borough_normalized": "staten_island",
          "route_type": "SBS",
          "route_type_normalized": "select_bus_service"
        },
        "evidence_examples": [
          {
            "source_id": "ace_routes_dataset_dictionary",
            "block_id": "p001_b0006",
            "page_number": 1,
            "role": "definition",
            "snippet": "\"description\": \"Identifies each individual bus route.\","
          }
        ]
      },
      {
        "record_id": "route_b25",
        "record_kind": "route",
        "display_name": "B25 - ABLE route",
        "source_ids": [
          "ace_routes_dataset_dictionary",
          "bus_lane_camera_report_2024",
          "mta_automated_camera_enforcement"
        ],
        "payload": {
          "route_id": "B25",
          "route_label": "B25",
          "route": "B25",
          "route_name": "B25",
          "program": "ABLE",
          "note": "ABLE cameras operated on this route through 2023",
          "borough": "Brooklyn",
          "streets": "Fulton St",
          "borough_normalized": "brooklyn"
        },
        "evidence_examples": [
          {
            "source_id": "ace_routes_dataset_dictionary",
            "block_id": "p001_b0006",
            "page_number": 1,
            "role": "definition",
            "snippet": "\"description\": \"Identifies each individual bus route.\","
          }
        ]
      }
    ]
  },
  {
    "value": "Transit Signal Priority",
    "count": 2,
    "records": [
      "route_b82-local",
      "route_bx6-local"
    ],
    "representative_records": [
      {
        "record_id": "route_b82-local",
        "record_kind": "route",
        "display_name": "B82 in Southern Brooklyn",
        "source_ids": [
          "tsp_status_2017"
        ],
        "payload": {
          "route_id": "B82",
          "route_label": "B82",
          "route_name": "B82 in Southern Brooklyn",
          "borough": "Brooklyn",
          "program": "Transit Signal Priority",
          "document_time_status": "tsp_in_development",
          "description": "B82 route listed in the 2017 TSP status report as in development for Transit Signal Priority.",
          "borough_normalized": "brooklyn"
        },
        "evidence_examples": [
          {
            "source_id": "tsp_status_2017",
            "block_id": "p001_b0001",
            "page_number": 1,
            "snippet": "DOT Press Releases &#8211; DOT Releases Status Report on “Transit Signal Priority” Technology Used To Speed MTA Buses Skip to main content NYC NYC Resources 311 Office of the Mayor About DOT Press Releases FOR IMMEDIATE..."
          }
        ]
      },
      {
        "record_id": "route_bx6-local",
        "record_kind": "route",
        "display_name": "Bx6 in the South Bronx",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021",
          "tsp_status_2017"
        ],
        "payload": {
          "route_id": "Bx6",
          "route_label": "Bx6",
          "route_name": "Bx6 in the South Bronx",
          "borough": "Bronx",
          "program": "Transit Signal Priority",
          "document_time_status": "tsp_in_development",
          "description": "Bx6 route listed in the 2017 TSP status report as in development for Transit Signal Priority.",
          "borough_normalized": "bronx",
          "_merged_field_values": {
            "route_id": [
              "Bx6",
              "Bx6 Local"
            ],
            "route_name": [
              "Bx6 in the South Bronx",
              "Bx6 Local"
            ],
            "route_label": [
              "Bx6",
              "Bx6 Local"
            ],
            "description": [
              "Bx6 route listed in the 2017 TSP status report as in development for Transit Signal Priority.",
              "Bx6 Local route identity referenced by the Bronx addendum; schedule-change timing is captured separately as lifecycle records."
            ]
          },
          "route_type": "local_bus",
          "service_variant": "local",
          "route_type_normalized": "local"
        },
        "evidence_examples": [
          {
            "source_id": "tsp_status_2017",
            "block_id": "p001_b0001",
            "page_number": 1,
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
      "rule_id": "route-program",
      "relation_kind": "part_of_program",
      "direction": "origin_to_target",
      "records_with_field": 23,
      "value_count": 23,
      "derived_count": 0,
      "already_present_count": 0,
      "unresolved_count": 23,
      "skipped_self_count": 0
    }
  ]
}
```

### route-service-identity:relation-context:route.agency

- Category: relation_context_field
- Priority: 130
- Record kind: route
- Field: agency
- Count: 2
- Title: Route field agency should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 0 endpoint values are already present or derivable (0 already present, 0 newly derivable); 2 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: operated_by.
- route.agency appears on 2 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Bee-Line Bus System",
    "count": 2,
    "records": [
      "route_bee-line-60",
      "route_bee-line-62"
    ],
    "representative_records": [
      {
        "record_id": "route_bee-line-60",
        "record_kind": "route",
        "display_name": "Bee-Line 60",
        "source_ids": [
          "better_buses"
        ],
        "payload": {
          "route_id": "Bee-Line 60",
          "route_name": "Bee-Line 60",
          "description": "Westchester County Bee-Line bus route serving Fordham Road corridor",
          "agency": "Bee-Line Bus System"
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
        "record_id": "route_bee-line-62",
        "record_kind": "route",
        "display_name": "Bee-Line 62",
        "source_ids": [
          "better_buses"
        ],
        "payload": {
          "route_id": "Bee-Line 62",
          "route_name": "Bee-Line 62",
          "description": "Westchester County Bee-Line bus route serving Fordham Road corridor",
          "agency": "Bee-Line Bus System"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses",
            "block_id": "p001_b0001",
            "page_number": 1,
            "snippet": "Better Buses Skip to main content NYC NYC Resources 311 Office of the Mayor Better Buses NYC DOT is committed to working with the MTA and NYPD to improve buses citywide, ensuring that New Yorkers have service that they..."
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
      "rule_id": "route-operator",
      "relation_kind": "operated_by",
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

### route-service-identity:relation-context:route.corridors

- Category: relation_context_field
- Priority: 130
- Record kind: route
- Field: corridors
- Count: 2
- Title: Route field corridors should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 1 endpoint values are already present or derivable (1 already present, 0 newly derivable); 1 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: operates_on_corridor.
- route.corridors appears on 2 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Guy R Brewer Blvd",
    "count": 1,
    "records": [
      "route_q111-rush"
    ],
    "representative_records": [
      {
        "record_id": "route_q111-rush",
        "record_kind": "route",
        "display_name": "Q111 Rush Route",
        "source_ids": [
          "queens_proposed_final_plan_addendum_2024"
        ],
        "payload": {
          "route_id": "Q111",
          "route": "Q111",
          "route_label": "Q111 Rush Route",
          "route_type": "Rush",
          "description": "Service from Rosedale to Jamaica, serves Guy R Brewer Blvd corridor, rush segment on Guy R Brewer Blvd",
          "corridors": [
            "Guy R Brewer Blvd"
          ],
          "limits": "Rosedale to Jamaica",
          "route_type_normalized": "rush",
          "service_variant": "rush"
        },
        "evidence_examples": [
          {
            "source_id": "queens_proposed_final_plan_addendum_2024",
            "block_id": "p007_c0001",
            "page_number": 7,
            "role": "heading",
            "snippet": "Q111 Rush Route"
          }
        ]
      }
    ]
  },
  {
    "value": "Merrick Blvd",
    "count": 1,
    "records": [
      "route_q85-rush"
    ],
    "representative_records": [
      {
        "record_id": "route_q85-rush",
        "record_kind": "route",
        "display_name": "Q85 Rush Route",
        "source_ids": [
          "queens_proposed_final_plan_addendum_2024"
        ],
        "payload": {
          "route_id": "Q85",
          "route": "Q85",
          "route_label": "Q85 Rush Route",
          "route_type": "Rush",
          "description": "Service from Rosedale to Jamaica, serves Merrick Blvd corridor, rush segment on Merrick Blvd",
          "corridors": [
            "Merrick Blvd"
          ],
          "limits": "Rosedale to Jamaica",
          "route_type_normalized": "rush",
          "service_variant": "rush"
        },
        "evidence_examples": [
          {
            "source_id": "queens_proposed_final_plan_addendum_2024",
            "block_id": "p006_c0001",
            "page_number": 6,
            "role": "heading",
            "snippet": "Q85 Rush Route"
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
      "rule_id": "route-corridors",
      "relation_kind": "operates_on_corridor",
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

### route-service-identity:relation-context:route.operator

- Category: relation_context_field
- Priority: 130
- Record kind: route
- Field: operator
- Count: 4
- Title: Route field operator should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 0 endpoint values are already present or derivable (0 already present, 0 newly derivable); 4 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: operated_by.
- route.operator appears on 4 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "MTA",
    "count": 4,
    "records": [
      "route_bx11",
      "route_bx13",
      "route_bx3",
      "route_bx36"
    ],
    "representative_records": [
      {
        "record_id": "route_bx11",
        "record_kind": "route",
        "display_name": "MTA Bus Bx11",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "route_id": "Bx11",
          "route_label": "Bx11",
          "operator": "MTA",
          "description": "MTA bus route serving the 181st Street corridor; mentioned as still slow and inadequate in survey comments"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p016_c0006",
            "page_number": 16,
            "role": "stated",
            "snippet": "• Increased traffic and congestion near the Washington Bridge, where the Busway ends • Bus service is still slow and inadequate along the following lines: Bx3, Bx11, Bx13 • Confusing signage • Bus stop crowding is still..."
          }
        ]
      },
      {
        "record_id": "route_bx13",
        "record_kind": "route",
        "display_name": "MTA Bus Bx13",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "route_id": "Bx13",
          "route_label": "Bx13",
          "operator": "MTA",
          "description": "MTA bus route serving the 181st Street corridor; mentioned as still slow and inadequate in survey comments"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p016_c0006",
            "page_number": 16,
            "role": "stated",
            "snippet": "• Increased traffic and congestion near the Washington Bridge, where the Busway ends • Bus service is still slow and inadequate along the following lines: Bx3, Bx11, Bx13 • Confusing signage • Bus stop crowding is still..."
          }
        ]
      },
      {
        "record_id": "route_bx3",
        "record_kind": "route",
        "display_name": "MTA Bus Bx3",
        "source_ids": [
          "181st_street_jun2022",
          "mta_automated_camera_enforcement"
        ],
        "payload": {
          "route_id": "Bx3",
          "route_label": "Bx3",
          "operator": "MTA",
          "description": "MTA bus route serving the 181st Street corridor; mentioned as still slow and inadequate in survey comments",
          "borough": "Bronx",
          "streets": "Sedgwick Av / University Av / W 181 St",
          "borough_normalized": "bronx"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p016_c0006",
            "page_number": 16,
            "role": "stated",
            "snippet": "• Increased traffic and congestion near the Washington Bridge, where the Busway ends • Bus service is still slow and inadequate along the following lines: Bx3, Bx11, Bx13 • Confusing signage • Bus stop crowding is still..."
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
      "rule_id": "route-operator",
      "relation_kind": "operated_by",
      "direction": "origin_to_target",
      "records_with_field": 4,
      "value_count": 4,
      "derived_count": 0,
      "already_present_count": 0,
      "unresolved_count": 4,
      "skipped_self_count": 0
    }
  ]
}
```

### route-service-identity:relation-context:route.routes

- Category: relation_context_field
- Priority: 130
- Record kind: route
- Field: routes
- Count: 20
- Title: Route field routes should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 0 endpoint values are already present or derivable (0 already present, 0 newly derivable); 5 remain unresolved/pass-through and 16 self-links were skipped.
- Suggested relation family: related_route.
- route.routes appears on 20 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "M14A",
    "count": 1,
    "records": [
      "route_m14-ad-sbs"
    ],
    "representative_records": [
      {
        "record_id": "route_m14-ad-sbs",
        "record_kind": "route",
        "display_name": "M14 A/D Select Bus Service",
        "source_ids": [
          "14th_street_busway",
          "14th_street_busway_brochure",
          "14th_street_fall2019_monitoring",
          "14th_street_winter2020_monitoring",
          "ace_routes_dataset_dictionary",
          "brt_route_index",
          "bus_lane_camera_report_2024",
          "mta_automated_camera_enforcement"
        ],
        "payload": {
          "route_id": "M14 A SBS",
          "route_name": "M14 A Select Bus Service",
          "route_label": "M14 A/D SBS",
          "description": "Select Bus Service routes on 14th Street, part of the TTP Pilot Project. M14 A/D SBS services started in July 2019.",
          "_merged_field_values": {
            "route_name": [
              "M14 A Select Bus Service",
              "M14 A/D Select Bus Service",
              "M14A/D Select Bus Service",
              "M14+",
              "14th Street Select Bus Service"
            ],
            "description": [
              "Select Bus Service routes on 14th Street, part of the TTP Pilot Project. M14 A/D SBS services started in July 2019.",
              "Select Bus Service routes operating on 14th Street, a target of the Transit & Truck Priority pilot project to increase speeds and reliability.",
              "Select Bus Service on 14th Street, operated by NYCT; began July 1, 2019; serves approximately 28,000 daily riders",
              "Select Bus Service for M14A and M14D buses on 14th Street in Manhattan, with Transit & Truck Priority Pilot Project"
            ],
            "route_id": [
              "M14 A SBS",
              "M14 A/D SBS",
              "M14A/D",
              "M14+",
              "M14A/M14D",
              "M14-SBS"
            ],
            "route_label": [
              "M14 A/D SBS",
              "M14 A/D Select Bus Service",
              "M14A/D SBS",
              "M14+",
              "M14-SBS"
            ],
            "route": [
              "M14",
              "M14 A/D SBS",
              "M14+",
              "M14-SBS"
            ]
          },
          "route": "M14",
          "routes": [
            "M14A",
            "M14D"
          ],
          "internal_route_id": "M14+",
          "route_id_authority": "mta_internal",
          "source_route_surface": "mta_route_id",
          "service_variant": "sbs",
          "program": "ABLE",
          "note": "ABLE cameras operated on this route through 2023",
          "borough": "Manhattan",
          "streets": "14 St",
          "borough_normalized": "manhattan"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_winter2020_monitoring",
            "block_id": "p002_c0006",
            "page_number": 2,
            "role": "route_mention",
            "snippet": "The 14th Street Transit & Truck Priority (TTP) Pilot Project was implemented by the New York City Department of Transportation (NYCDOT) in October 2019, aiming to improve operations of the M14 A and M14 D Select Bus Ser..."
          }
        ]
      }
    ]
  },
  {
    "value": "M14D",
    "count": 1,
    "records": [
      "route_m14-ad-sbs"
    ],
    "representative_records": [
      {
        "record_id": "route_m14-ad-sbs",
        "record_kind": "route",
        "display_name": "M14 A/D Select Bus Service",
        "source_ids": [
          "14th_street_busway",
          "14th_street_busway_brochure",
          "14th_street_fall2019_monitoring",
          "14th_street_winter2020_monitoring",
          "ace_routes_dataset_dictionary",
          "brt_route_index",
          "bus_lane_camera_report_2024",
          "mta_automated_camera_enforcement"
        ],
        "payload": {
          "route_id": "M14 A SBS",
          "route_name": "M14 A Select Bus Service",
          "route_label": "M14 A/D SBS",
          "description": "Select Bus Service routes on 14th Street, part of the TTP Pilot Project. M14 A/D SBS services started in July 2019.",
          "_merged_field_values": {
            "route_name": [
              "M14 A Select Bus Service",
              "M14 A/D Select Bus Service",
              "M14A/D Select Bus Service",
              "M14+",
              "14th Street Select Bus Service"
            ],
            "description": [
              "Select Bus Service routes on 14th Street, part of the TTP Pilot Project. M14 A/D SBS services started in July 2019.",
              "Select Bus Service routes operating on 14th Street, a target of the Transit & Truck Priority pilot project to increase speeds and reliability.",
              "Select Bus Service on 14th Street, operated by NYCT; began July 1, 2019; serves approximately 28,000 daily riders",
              "Select Bus Service for M14A and M14D buses on 14th Street in Manhattan, with Transit & Truck Priority Pilot Project"
            ],
            "route_id": [
              "M14 A SBS",
              "M14 A/D SBS",
              "M14A/D",
              "M14+",
              "M14A/M14D",
              "M14-SBS"
            ],
            "route_label": [
              "M14 A/D SBS",
              "M14 A/D Select Bus Service",
              "M14A/D SBS",
              "M14+",
              "M14-SBS"
            ],
            "route": [
              "M14",
              "M14 A/D SBS",
              "M14+",
              "M14-SBS"
            ]
          },
          "route": "M14",
          "routes": [
            "M14A",
            "M14D"
          ],
          "internal_route_id": "M14+",
          "route_id_authority": "mta_internal",
          "source_route_surface": "mta_route_id",
          "service_variant": "sbs",
          "program": "ABLE",
          "note": "ABLE cameras operated on this route through 2023",
          "borough": "Manhattan",
          "streets": "14 St",
          "borough_normalized": "manhattan"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_winter2020_monitoring",
            "block_id": "p002_c0006",
            "page_number": 2,
            "role": "route_mention",
            "snippet": "The 14th Street Transit & Truck Priority (TTP) Pilot Project was implemented by the New York City Department of Transportation (NYCDOT) in October 2019, aiming to improve operations of the M14 A and M14 D Select Bus Ser..."
          }
        ]
      }
    ]
  },
  {
    "value": "Q1",
    "count": 1,
    "records": [
      "route_q1-queens"
    ],
    "representative_records": [
      {
        "record_id": "route_q1-queens",
        "record_kind": "route",
        "display_name": "Q1 bus route",
        "source_ids": [
          "queens_addendum_equity_evaluation_appendix_d"
        ],
        "payload": {
          "route_id": "Q1",
          "route_name": "Q1",
          "route_label": "Q1",
          "routes": [
            "Q1"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "queens_addendum_equity_evaluation_appendix_d",
            "block_id": "p006_c0008",
            "page_number": 6,
            "role": "route_listed",
            "snippet": "Q1, Q3, Q7, Q8, Q9, Q11, Q25, Q26, Q36, Q50, Q54, Q67, Q75, Q80, Q89, Q115"
          }
        ]
      }
    ]
  },
  {
    "value": "Q10",
    "count": 1,
    "records": [
      "route_q10"
    ],
    "representative_records": [
      {
        "record_id": "route_q10",
        "record_kind": "route",
        "display_name": "Q10 bus route",
        "source_ids": [
          "mta_automated_camera_enforcement",
          "queens_addendum_equity_evaluation_appendix_d"
        ],
        "payload": {
          "route_id": "Q10",
          "route_name": "Q10",
          "route_label": "Q10",
          "routes": [
            "Q10"
          ],
          "borough": "Queens",
          "streets": "Lefferts Blvd",
          "source_route_surface": "ACE",
          "note": "Listed in ACE route surface with Q80 on Lefferts Blvd during 60-day warning period.",
          "borough_normalized": "queens"
        },
        "evidence_examples": [
          {
            "source_id": "queens_addendum_equity_evaluation_appendix_d",
            "block_id": "p010_c0004",
            "page_number": 10,
            "role": "route_description",
            "snippet": "In Southwest Queens, the Q10 route traverses several Tier 1 and 2 areas of equity consideration, and has multiple service patterns: one that travels along Lefferts Boulevard providing direct service to JFK Airport, anot..."
          }
        ]
      }
    ]
  },
  {
    "value": "Q110",
    "count": 1,
    "records": [
      "route_q110-queens"
    ],
    "representative_records": [
      {
        "record_id": "route_q110-queens",
        "record_kind": "route",
        "display_name": "Q110 bus route",
        "source_ids": [
          "queens_addendum_equity_evaluation_appendix_d"
        ],
        "payload": {
          "route_id": "Q110",
          "route_name": "Q110",
          "route_label": "Q110",
          "routes": [
            "Q110"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "queens_addendum_equity_evaluation_appendix_d",
            "block_id": "p009_c0005",
            "page_number": 9,
            "role": "route_description",
            "snippet": "More direct bus routes offer several advantages that enhance both efficiency and the rider experience. By minimizing turns and deviations, direct routes reduce travel time, increasing speed and reliability. Several rout..."
          }
        ]
      }
    ]
  },
  {
    "value": "Q14",
    "count": 1,
    "records": [
      "route_q14-queens"
    ],
    "representative_records": [
      {
        "record_id": "route_q14-queens",
        "record_kind": "route",
        "display_name": "Q14 bus route",
        "source_ids": [
          "queens_addendum_equity_evaluation_appendix_d"
        ],
        "payload": {
          "route_id": "Q14",
          "route_name": "Q14",
          "route_label": "Q14",
          "routes": [
            "Q14"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "queens_addendum_equity_evaluation_appendix_d",
            "block_id": "p013_c0004",
            "page_number": 13,
            "role": "route_description",
            "snippet": "A good example of a route split aimed at enhancing reliability is the Q38 . Currently operating as a loop, the Q38 's start and end points are approximately a third of a mile apart, in Rego Park and Corona – neighborhoo..."
          }
        ]
      }
    ]
  },
  {
    "value": "Q22",
    "count": 1,
    "records": [
      "route_q22-queens"
    ],
    "representative_records": [
      {
        "record_id": "route_q22-queens",
        "record_kind": "route",
        "display_name": "Q22 bus route",
        "source_ids": [
          "queens_addendum_equity_evaluation_appendix_d"
        ],
        "payload": {
          "route_id": "Q22",
          "route_name": "Q22",
          "route_label": "Q22",
          "routes": [
            "Q22"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "queens_addendum_equity_evaluation_appendix_d",
            "block_id": "p012_c0004",
            "page_number": 12,
            "role": "route_description",
            "snippet": "Shorter bus routes typically boast better reliability as they cover reduced distances, minimizing exposure to traffic congestion, accidents, and other potential delays. An example of this approach is seen in Rockaway Pa..."
          }
        ]
      }
    ]
  },
  {
    "value": "Q25",
    "count": 1,
    "records": [
      "route_q25-queens"
    ],
    "representative_records": [
      {
        "record_id": "route_q25-queens",
        "record_kind": "route",
        "display_name": "Q25 bus route",
        "source_ids": [
          "queens_addendum_equity_evaluation_appendix_d",
          "tsp_status_2017"
        ],
        "payload": {
          "route_id": "Q25",
          "route_name": "Q25",
          "route_label": "Q25",
          "routes": [
            "Q25"
          ],
          "route_type": "local bus",
          "borough": "Queens",
          "route_type_normalized": "local",
          "service_variant": "local",
          "borough_normalized": "queens"
        },
        "evidence_examples": [
          {
            "source_id": "queens_addendum_equity_evaluation_appendix_d",
            "block_id": "p011_c0004",
            "page_number": 11,
            "role": "route_description",
            "snippet": "Within the existing network, there are routes that offer redundant service, a situation that the Redesign aims to eliminate. For example, the proposed Q25 would absorb existing Q34 trips and provide better service along..."
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
      "rule_id": "route-related-routes",
      "relation_kind": "related_route",
      "direction": "origin_to_target",
      "records_with_field": 20,
      "value_count": 21,
      "derived_count": 0,
      "already_present_count": 0,
      "unresolved_count": 5,
      "skipped_self_count": 16
    }
  ]
}
```
