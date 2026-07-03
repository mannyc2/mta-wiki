# Project/Corridor Spatial Identity Agent

Agent id: `project-corridor-spatial`

## Purpose

Normalize project and corridor identity, corridor limits, street/borough scope, and route-list context on spatial records.

## Owns

- project identity
- corridor identity
- street/limits/borough scope
- project/corridor route-list context

## Decision Contract

Submit review decisions only as append-only normalization decisions. Do not edit canonical JSONL, wiki pages, source pages, or source literals directly.

- merge
- do_not_merge
- weak_alias
- missing_identity_field
- relation_candidate
- needs_more_data
- no_change

## Candidate Summary

Candidates: 7

- relation_context_field: 6
- identity_cluster: 1

## Candidates

### project-corridor-spatial:relation-context:project.routes_served

- Category: relation_context_field
- Priority: 180
- Record kind: project
- Field: routes_served
- Count: 24
- Title: project.routes_served should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 34 endpoint values are already present or derivable (34 already present, 0 newly derivable); 98 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: serves_route.
- project.routes_served appears on 24 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "B103",
    "count": 2,
    "records": [
      "project_20-livingston-st",
      "project_22-church-ave"
    ],
    "representative_records": [
      {
        "record_id": "project_20-livingston-st",
        "record_kind": "project",
        "display_name": "project_20_livingston_st",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Livingston St",
          "name": "Livingston St, Boerum Pl to Flatbush Ave",
          "project_type": "bus_lane_upgrade",
          "status": "proposed_2019",
          "description": "Add dedicated westbound right turn arrow, refresh existing bus lanes and extend hours, upgrade to protected bus lanes with physical barriers",
          "corridor_length_miles": 0.5,
          "daily_ridership": 63000,
          "routes_served": [
            "B41",
            "B45",
            "B57",
            "B62",
            "B67",
            "B103"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p043_c0001",
            "page_number": 43,
            "snippet": "20 Livingston St, Boerum Pl to Flatbush Ave"
          }
        ]
      },
      {
        "record_id": "project_22-church-ave",
        "record_kind": "project",
        "display_name": "project_22_church_ave",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Church Ave",
          "name": "Church Ave, E 7th St to Flatbush Ave",
          "project_type": "new_bus_lane",
          "status": "proposed_2019",
          "description": "Install curbside bus lanes, update curb regulations for truck loading and metered parking, investigate turn bans/bays, adjust bus stops",
          "corridor_length_miles": 0.8,
          "daily_ridership": 45000,
          "routes_served": [
            "B35",
            "B103",
            "BM3",
            "BM4"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p045_c0001",
            "page_number": 45,
            "snippet": "22 Church Ave, E 7th St to Flatbush Ave"
          }
        ]
      }
    ]
  },
  {
    "value": "B83",
    "count": 2,
    "records": [
      "project_19-pennsylvania-ave",
      "project_23-east-new-york-ave"
    ],
    "representative_records": [
      {
        "record_id": "project_19-pennsylvania-ave",
        "record_kind": "project",
        "display_name": "project_19_pennsylvania_ave",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Pennsylvania Ave",
          "name": "Pennsylvania Ave at Delmar Loop and Hornell Loop",
          "project_type": "pedestrian_safety",
          "status": "proposed_2019",
          "description": "Install two new traffic signals, signalized crossings with pedestrian signals and high-visibility crosswalks, painted medians and curb extensions",
          "corridor_length_miles": 0.3,
          "daily_ridership": 36000,
          "routes_served": [
            "B82 SBS",
            "B82",
            "B83",
            "BM2",
            "BM5"
          ],
          "document_time_status": "planned",
          "project_family": "accessibility_or_safety"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p042_c0001",
            "page_number": 42,
            "snippet": "19 Pennsylvania Ave at Delmar Loop and Hornell Loop"
          }
        ]
      },
      {
        "record_id": "project_23-east-new-york-ave",
        "record_kind": "project",
        "display_name": "project_23_east_new_york_ave",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "East New York Ave",
          "name": "East New York Ave, Herkimer St to Fulton St",
          "project_type": "traffic_flow_improvement",
          "status": "proposed_2019",
          "description": "Clarify travel lanes and turning movements with new markings, modify signal timings, investigate turn restrictions, remove parking near intersections",
          "corridor_length_miles": 0.2,
          "daily_ridership": 40000,
          "routes_served": [
            "B20",
            "B25",
            "B83",
            "Q24",
            "Q56"
          ],
          "document_time_status": "planned",
          "project_family": "street_redesign"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p046_c0001",
            "page_number": 46,
            "snippet": "23 East New York Ave, Herkimer St to Fulton St"
          }
        ]
      }
    ]
  },
  {
    "value": "BM2",
    "count": 2,
    "records": [
      "project_05-battery-pl",
      "project_19-pennsylvania-ave"
    ],
    "representative_records": [
      {
        "record_id": "project_05-battery-pl",
        "record_kind": "project",
        "display_name": "project_05_battery_pl",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Battery Pl",
          "name": "Battery Pl, West St to Broadway",
          "project_type": "new_bus_lane",
          "status": "proposed_2019",
          "description": "Install curbside bus lanes in both directions at Battery Pl bottleneck for express buses, with curb management and signal timing adjustments",
          "corridor_length_miles": 0.1,
          "daily_ridership": 28000,
          "routes_served": [
            "BM1",
            "BM2",
            "BM3",
            "BM4",
            "QM7",
            "QM8",
            "QM11",
            "QM25",
            "SIM1",
            "SIM1c",
            "SIM2",
            "SIM3c",
            "SIM4",
            "SIM4c",
            "SIM4x",
            "SIM5",
            "SIM15",
            "SIM32",
            "SIM33c",
            "SIM34",
            "SIM35",
            "X27",
            "X28"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p028_c0001",
            "page_number": 28,
            "snippet": "05 Battery Pl, West St to Broadway"
          }
        ]
      },
      {
        "record_id": "project_19-pennsylvania-ave",
        "record_kind": "project",
        "display_name": "project_19_pennsylvania_ave",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Pennsylvania Ave",
          "name": "Pennsylvania Ave at Delmar Loop and Hornell Loop",
          "project_type": "pedestrian_safety",
          "status": "proposed_2019",
          "description": "Install two new traffic signals, signalized crossings with pedestrian signals and high-visibility crosswalks, painted medians and curb extensions",
          "corridor_length_miles": 0.3,
          "daily_ridership": 36000,
          "routes_served": [
            "B82 SBS",
            "B82",
            "B83",
            "BM2",
            "BM5"
          ],
          "document_time_status": "planned",
          "project_family": "accessibility_or_safety"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p042_c0001",
            "page_number": 42,
            "snippet": "19 Pennsylvania Ave at Delmar Loop and Hornell Loop"
          }
        ]
      }
    ]
  },
  {
    "value": "BM3",
    "count": 2,
    "records": [
      "project_05-battery-pl",
      "project_22-church-ave"
    ],
    "representative_records": [
      {
        "record_id": "project_05-battery-pl",
        "record_kind": "project",
        "display_name": "project_05_battery_pl",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Battery Pl",
          "name": "Battery Pl, West St to Broadway",
          "project_type": "new_bus_lane",
          "status": "proposed_2019",
          "description": "Install curbside bus lanes in both directions at Battery Pl bottleneck for express buses, with curb management and signal timing adjustments",
          "corridor_length_miles": 0.1,
          "daily_ridership": 28000,
          "routes_served": [
            "BM1",
            "BM2",
            "BM3",
            "BM4",
            "QM7",
            "QM8",
            "QM11",
            "QM25",
            "SIM1",
            "SIM1c",
            "SIM2",
            "SIM3c",
            "SIM4",
            "SIM4c",
            "SIM4x",
            "SIM5",
            "SIM15",
            "SIM32",
            "SIM33c",
            "SIM34",
            "SIM35",
            "X27",
            "X28"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p028_c0001",
            "page_number": 28,
            "snippet": "05 Battery Pl, West St to Broadway"
          }
        ]
      },
      {
        "record_id": "project_22-church-ave",
        "record_kind": "project",
        "display_name": "project_22_church_ave",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Church Ave",
          "name": "Church Ave, E 7th St to Flatbush Ave",
          "project_type": "new_bus_lane",
          "status": "proposed_2019",
          "description": "Install curbside bus lanes, update curb regulations for truck loading and metered parking, investigate turn bans/bays, adjust bus stops",
          "corridor_length_miles": 0.8,
          "daily_ridership": 45000,
          "routes_served": [
            "B35",
            "B103",
            "BM3",
            "BM4"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p045_c0001",
            "page_number": 45,
            "snippet": "22 Church Ave, E 7th St to Flatbush Ave"
          }
        ]
      }
    ]
  },
  {
    "value": "BM4",
    "count": 2,
    "records": [
      "project_05-battery-pl",
      "project_22-church-ave"
    ],
    "representative_records": [
      {
        "record_id": "project_05-battery-pl",
        "record_kind": "project",
        "display_name": "project_05_battery_pl",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Battery Pl",
          "name": "Battery Pl, West St to Broadway",
          "project_type": "new_bus_lane",
          "status": "proposed_2019",
          "description": "Install curbside bus lanes in both directions at Battery Pl bottleneck for express buses, with curb management and signal timing adjustments",
          "corridor_length_miles": 0.1,
          "daily_ridership": 28000,
          "routes_served": [
            "BM1",
            "BM2",
            "BM3",
            "BM4",
            "QM7",
            "QM8",
            "QM11",
            "QM25",
            "SIM1",
            "SIM1c",
            "SIM2",
            "SIM3c",
            "SIM4",
            "SIM4c",
            "SIM4x",
            "SIM5",
            "SIM15",
            "SIM32",
            "SIM33c",
            "SIM34",
            "SIM35",
            "X27",
            "X28"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p028_c0001",
            "page_number": 28,
            "snippet": "05 Battery Pl, West St to Broadway"
          }
        ]
      },
      {
        "record_id": "project_22-church-ave",
        "record_kind": "project",
        "display_name": "project_22_church_ave",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Church Ave",
          "name": "Church Ave, E 7th St to Flatbush Ave",
          "project_type": "new_bus_lane",
          "status": "proposed_2019",
          "description": "Install curbside bus lanes, update curb regulations for truck loading and metered parking, investigate turn bans/bays, adjust bus stops",
          "corridor_length_miles": 0.8,
          "daily_ridership": 45000,
          "routes_served": [
            "B35",
            "B103",
            "BM3",
            "BM4"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p045_c0001",
            "page_number": 45,
            "snippet": "22 Church Ave, E 7th St to Flatbush Ave"
          }
        ]
      }
    ]
  },
  {
    "value": "Q20A",
    "count": 2,
    "records": [
      "project_15-main-st",
      "project_16-union-turnpike"
    ],
    "representative_records": [
      {
        "record_id": "project_15-main-st",
        "record_kind": "project",
        "display_name": "project_15_main_st",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Main St",
          "name": "Main St, Northern Blvd to 40th Rd",
          "project_type": "bus_lane_reinforcement",
          "status": "proposed_2019",
          "description": "Add pavement markings, extend northbound curbside bus lane to Northern Blvd, adjust signal timings, install signage for Bus and Truck Only corridor",
          "corridor_length_miles": 0.2,
          "daily_ridership": 150000,
          "routes_served": [
            "Q17",
            "Q19",
            "Q20A",
            "Q20B",
            "Q25",
            "Q27",
            "Q34",
            "Q44 SBS",
            "Q50",
            "Q65",
            "Q66"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p038_c0001",
            "page_number": 38,
            "snippet": "15 Main St, Northern Blvd to 40th Rd"
          }
        ]
      },
      {
        "record_id": "project_16-union-turnpike",
        "record_kind": "project",
        "display_name": "project_16_union_turnpike",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Union Turnpike",
          "name": "Main St at Union Turnpike",
          "project_type": "intersection_improvement",
          "status": "proposed_2019",
          "description": "Restrict southbound left turn, replace turn bay with median tip extension, convert signal phase with LPI, add offset bus queue jump lane",
          "daily_ridership": 42000,
          "routes_served": [
            "Q20A",
            "Q20B",
            "Q44 SBS"
          ],
          "document_time_status": "planned",
          "project_family": "accessibility_or_safety"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p039_c0001",
            "page_number": 39,
            "snippet": "16 Main St at Union Turnpike"
          }
        ]
      }
    ]
  },
  {
    "value": "Q20B",
    "count": 2,
    "records": [
      "project_15-main-st",
      "project_16-union-turnpike"
    ],
    "representative_records": [
      {
        "record_id": "project_15-main-st",
        "record_kind": "project",
        "display_name": "project_15_main_st",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Main St",
          "name": "Main St, Northern Blvd to 40th Rd",
          "project_type": "bus_lane_reinforcement",
          "status": "proposed_2019",
          "description": "Add pavement markings, extend northbound curbside bus lane to Northern Blvd, adjust signal timings, install signage for Bus and Truck Only corridor",
          "corridor_length_miles": 0.2,
          "daily_ridership": 150000,
          "routes_served": [
            "Q17",
            "Q19",
            "Q20A",
            "Q20B",
            "Q25",
            "Q27",
            "Q34",
            "Q44 SBS",
            "Q50",
            "Q65",
            "Q66"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p038_c0001",
            "page_number": 38,
            "snippet": "15 Main St, Northern Blvd to 40th Rd"
          }
        ]
      },
      {
        "record_id": "project_16-union-turnpike",
        "record_kind": "project",
        "display_name": "project_16_union_turnpike",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Union Turnpike",
          "name": "Main St at Union Turnpike",
          "project_type": "intersection_improvement",
          "status": "proposed_2019",
          "description": "Restrict southbound left turn, replace turn bay with median tip extension, convert signal phase with LPI, add offset bus queue jump lane",
          "daily_ridership": 42000,
          "routes_served": [
            "Q20A",
            "Q20B",
            "Q44 SBS"
          ],
          "document_time_status": "planned",
          "project_family": "accessibility_or_safety"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p039_c0001",
            "page_number": 39,
            "snippet": "16 Main St at Union Turnpike"
          }
        ]
      }
    ]
  },
  {
    "value": "Q44 SBS",
    "count": 2,
    "records": [
      "project_15-main-st",
      "project_16-union-turnpike"
    ],
    "representative_records": [
      {
        "record_id": "project_15-main-st",
        "record_kind": "project",
        "display_name": "project_15_main_st",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Main St",
          "name": "Main St, Northern Blvd to 40th Rd",
          "project_type": "bus_lane_reinforcement",
          "status": "proposed_2019",
          "description": "Add pavement markings, extend northbound curbside bus lane to Northern Blvd, adjust signal timings, install signage for Bus and Truck Only corridor",
          "corridor_length_miles": 0.2,
          "daily_ridership": 150000,
          "routes_served": [
            "Q17",
            "Q19",
            "Q20A",
            "Q20B",
            "Q25",
            "Q27",
            "Q34",
            "Q44 SBS",
            "Q50",
            "Q65",
            "Q66"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p038_c0001",
            "page_number": 38,
            "snippet": "15 Main St, Northern Blvd to 40th Rd"
          }
        ]
      },
      {
        "record_id": "project_16-union-turnpike",
        "record_kind": "project",
        "display_name": "project_16_union_turnpike",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Union Turnpike",
          "name": "Main St at Union Turnpike",
          "project_type": "intersection_improvement",
          "status": "proposed_2019",
          "description": "Restrict southbound left turn, replace turn bay with median tip extension, convert signal phase with LPI, add offset bus queue jump lane",
          "daily_ridership": 42000,
          "routes_served": [
            "Q20A",
            "Q20B",
            "Q44 SBS"
          ],
          "document_time_status": "planned",
          "project_family": "accessibility_or_safety"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p039_c0001",
            "page_number": 39,
            "snippet": "16 Main St at Union Turnpike"
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
      "rule_id": "project-routes-served",
      "relation_kind": "serves_route",
      "direction": "origin_to_target",
      "records_with_field": 24,
      "value_count": 132,
      "derived_count": 0,
      "already_present_count": 34,
      "unresolved_count": 98,
      "skipped_self_count": 0
    }
  ]
}
```

### project-corridor-spatial:relation-context:corridor.routes

- Category: relation_context_field
- Priority: 170
- Record kind: corridor
- Field: routes
- Count: 11
- Title: corridor.routes should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 27 endpoint values are already present or derivable (27 already present, 0 newly derivable); 20 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: operates_on_corridor.
- corridor.routes appears on 11 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Bx36",
    "count": 4,
    "records": [
      "corridor_tremont-ave",
      "corridor_university-ave",
      "corridor_washington-bridge",
      "corridor_west-181st-street"
    ],
    "representative_records": [
      {
        "record_id": "corridor_tremont-ave",
        "record_kind": "corridor",
        "display_name": "Tremont Avenue Corridor",
        "source_ids": [
          "better_buses",
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021",
          "busway_tremontavenue",
          "busways",
          "tremont_ave_busway"
        ],
        "payload": {
          "corridor_name": "Tremont Avenue",
          "limits": "Sedgwick Avenue to Boston Road",
          "corridor_length_mi": 6.8,
          "routes_served": [
            "Bx4A",
            "Bx9",
            "Bx18",
            "Bx36",
            "Bx40",
            "Bx42"
          ],
          "combined_daily_ridership": 69000,
          "street": "Tremont Avenue",
          "from": "Sedgwick Avenue",
          "to": "Boston Road",
          "status": "Future Plan",
          "routes": [
            "Bx18",
            "Bx36",
            "Bx40",
            "Bx42"
          ],
          "_merged_field_values": {
            "limits": [
              "Sedgwick Avenue to Boston Road",
              "University Avenue to Bronx River Parkway",
              "Third Avenue to Southern Boulevard (eastbound); Southern Boulevard to Belmont Avenue (westbound)",
              "Eastbound from Third Ave. to Southern Blvd.; Westbound from Southern Blvd. to Belmont Ave."
            ],
            "corridor_name": [
              "Tremont Avenue",
              "Tremont Avenue Busway"
            ],
            "borough": [
              "Bronx",
              "the Bronx"
            ],
            "status": [
              "Future Plan",
              "Planned"
            ],
            "from": [
              "Sedgwick Avenue",
              "Third Avenue / Belmont Avenue",
              "Third Ave. / Southern Blvd."
            ],
            "to": [
              "Boston Road",
              "Southern Boulevard",
              "Southern Blvd. / Belmont Ave."
            ]
          },
          "borough": "Bronx",
          "description": "Corridor for bus priority improvements for Bronx's 5th busiest bus route with nearly 34,000 daily riders",
          "borough_normalized": "bronx",
          "eastbound_limits": "Third Avenue to Southern Boulevard",
          "westbound_limits": "Southern Boulevard to Belmont Avenue",
          "through_access_vehicles": [
            "buses",
            "trucks",
            "Access-A-Ride vans",
            "emergency vehicles",
            "bicycles"
          ],
          "local_access": "may turn onto the busway from a side street but must turn at next available right",
          "hours": "6am to 8pm",
          "days": "seven days a week"
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p032_c0004",
            "page_number": 32,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 6.8 miles • Routes served: Bx4A, Bx9, Bx18, Bx36, Bx40, Bx42 • Combined daily route ridership: 69,000"
          }
        ]
      },
      {
        "record_id": "corridor_university-ave",
        "record_kind": "corridor",
        "display_name": "University Avenue Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "University Avenue",
          "limits": "Kingsbridge Road to Cross Bronx Expressway",
          "corridor_length_mi": 2,
          "routes_served": [
            "Bx3",
            "Bx18",
            "Bx36"
          ],
          "combined_daily_ridership": 39000,
          "street": "University Avenue",
          "from": "Kingsbridge Road",
          "to": "Cross Bronx Expressway",
          "status": "Present Implementation",
          "routes": [
            "Bx3",
            "Bx18",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p031_c0004",
            "page_number": 31,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 2 miles • Routes served: Bx3, Bx18, Bx36 • Combined daily route ridership: 39,000"
          }
        ]
      },
      {
        "record_id": "corridor_washington-bridge",
        "record_kind": "corridor",
        "display_name": "corridor_washington_bridge",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Washington Bridge",
          "street": "Washington Bridge",
          "from": "Amsterdam Avenue",
          "to": "University Avenue",
          "status": "Future Plan",
          "routes": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_addendum_2021",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "table",
            "snippet": "Status Corridors From To Routes Future Plan Tremont Avenue Sedgwick Avenue Boston Road Bx18, Bx36, Bx40 (current), Bx42 (current) Future Plan East Gun Hill Road Bainbridge Avenue Bartow Avenue Bx28, Bx38, Bx30 (current)..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx3",
    "count": 3,
    "records": [
      "corridor_university-ave",
      "corridor_washington-bridge",
      "corridor_west-181st-street"
    ],
    "representative_records": [
      {
        "record_id": "corridor_university-ave",
        "record_kind": "corridor",
        "display_name": "University Avenue Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "University Avenue",
          "limits": "Kingsbridge Road to Cross Bronx Expressway",
          "corridor_length_mi": 2,
          "routes_served": [
            "Bx3",
            "Bx18",
            "Bx36"
          ],
          "combined_daily_ridership": 39000,
          "street": "University Avenue",
          "from": "Kingsbridge Road",
          "to": "Cross Bronx Expressway",
          "status": "Present Implementation",
          "routes": [
            "Bx3",
            "Bx18",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p031_c0004",
            "page_number": 31,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 2 miles • Routes served: Bx3, Bx18, Bx36 • Combined daily route ridership: 39,000"
          }
        ]
      },
      {
        "record_id": "corridor_washington-bridge",
        "record_kind": "corridor",
        "display_name": "corridor_washington_bridge",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Washington Bridge",
          "street": "Washington Bridge",
          "from": "Amsterdam Avenue",
          "to": "University Avenue",
          "status": "Future Plan",
          "routes": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_addendum_2021",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "table",
            "snippet": "Status Corridors From To Routes Future Plan Tremont Avenue Sedgwick Avenue Boston Road Bx18, Bx36, Bx40 (current), Bx42 (current) Future Plan East Gun Hill Road Bainbridge Avenue Bartow Avenue Bx28, Bx38, Bx30 (current)..."
          }
        ]
      },
      {
        "record_id": "corridor_west-181st-street",
        "record_kind": "corridor",
        "display_name": "corridor_west_181st_street",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "West 181st Street",
          "street": "West 181st Street",
          "from": "Amsterdam Avenue",
          "to": "Broadway",
          "status": "Completed 2020",
          "routes": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_addendum_2021",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "table",
            "snippet": "Status Corridors From To Routes Future Plan Tremont Avenue Sedgwick Avenue Boston Road Bx18, Bx36, Bx40 (current), Bx42 (current) Future Plan East Gun Hill Road Bainbridge Avenue Bartow Avenue Bx28, Bx38, Bx30 (current)..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx35",
    "count": 3,
    "records": [
      "corridor_el-grant-highway",
      "corridor_washington-bridge",
      "corridor_west-181st-street"
    ],
    "representative_records": [
      {
        "record_id": "corridor_el-grant-highway",
        "record_kind": "corridor",
        "display_name": "E.L. Grant Highway Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "E.L. Grant Highway",
          "limits": "Cross Bronx Expressway to East 167 Street",
          "corridor_length_mi": 0.6,
          "routes_served": [
            "Bx11",
            "Bx13",
            "Bx35"
          ],
          "combined_daily_ridership": 36000,
          "street": "E.L. Grant Highway",
          "from": "Cross Bronx Expressway",
          "to": "East 167 Street",
          "status": "Completed 2020",
          "routes": [
            "Bx35"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p030_c0004",
            "page_number": 30,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.6 miles • Routes served: Bx11, Bx13, Bx35 • Combined daily route ridership: 36,000"
          }
        ]
      },
      {
        "record_id": "corridor_washington-bridge",
        "record_kind": "corridor",
        "display_name": "corridor_washington_bridge",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Washington Bridge",
          "street": "Washington Bridge",
          "from": "Amsterdam Avenue",
          "to": "University Avenue",
          "status": "Future Plan",
          "routes": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_addendum_2021",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "table",
            "snippet": "Status Corridors From To Routes Future Plan Tremont Avenue Sedgwick Avenue Boston Road Bx18, Bx36, Bx40 (current), Bx42 (current) Future Plan East Gun Hill Road Bainbridge Avenue Bartow Avenue Bx28, Bx38, Bx30 (current)..."
          }
        ]
      },
      {
        "record_id": "corridor_west-181st-street",
        "record_kind": "corridor",
        "display_name": "corridor_west_181st_street",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "West 181st Street",
          "street": "West 181st Street",
          "from": "Amsterdam Avenue",
          "to": "Broadway",
          "status": "Completed 2020",
          "routes": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_addendum_2021",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "table",
            "snippet": "Status Corridors From To Routes Future Plan Tremont Avenue Sedgwick Avenue Boston Road Bx18, Bx36, Bx40 (current), Bx42 (current) Future Plan East Gun Hill Road Bainbridge Avenue Bartow Avenue Bx28, Bx38, Bx30 (current)..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx11",
    "count": 2,
    "records": [
      "corridor_washington-bridge",
      "corridor_west-181st-street"
    ],
    "representative_records": [
      {
        "record_id": "corridor_washington-bridge",
        "record_kind": "corridor",
        "display_name": "corridor_washington_bridge",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Washington Bridge",
          "street": "Washington Bridge",
          "from": "Amsterdam Avenue",
          "to": "University Avenue",
          "status": "Future Plan",
          "routes": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_addendum_2021",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "table",
            "snippet": "Status Corridors From To Routes Future Plan Tremont Avenue Sedgwick Avenue Boston Road Bx18, Bx36, Bx40 (current), Bx42 (current) Future Plan East Gun Hill Road Bainbridge Avenue Bartow Avenue Bx28, Bx38, Bx30 (current)..."
          }
        ]
      },
      {
        "record_id": "corridor_west-181st-street",
        "record_kind": "corridor",
        "display_name": "corridor_west_181st_street",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "West 181st Street",
          "street": "West 181st Street",
          "from": "Amsterdam Avenue",
          "to": "Broadway",
          "status": "Completed 2020",
          "routes": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_addendum_2021",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "table",
            "snippet": "Status Corridors From To Routes Future Plan Tremont Avenue Sedgwick Avenue Boston Road Bx18, Bx36, Bx40 (current), Bx42 (current) Future Plan East Gun Hill Road Bainbridge Avenue Bartow Avenue Bx28, Bx38, Bx30 (current)..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx12",
    "count": 2,
    "records": [
      "corridor_pelham-bay-station",
      "corridor_pelham-fordham-207"
    ],
    "representative_records": [
      {
        "record_id": "corridor_pelham-bay-station",
        "record_kind": "corridor",
        "display_name": "Pelham Bay Park 6 Station Area Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Pelham Bay Park Station Area",
          "corridor_length_mi": 0.1,
          "routes_served": [
            "Bx5",
            "Bx12",
            "Bx12 SBS",
            "Bx23",
            "Bx24",
            "Bx29",
            "Q50 LTD"
          ],
          "combined_daily_ridership": 63000,
          "street": "Westchester Avenue / Wilkinson Avenue",
          "from": "Westchester Avenue",
          "to": "Wilkinson Avenue",
          "status": "Completed 2020",
          "routes": [
            "Bx5",
            "Bx12",
            "Bx12 SBS",
            "Bx23",
            "Bx24",
            "Bx29",
            "Q50 LTD"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p027_c0004",
            "page_number": 27,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.1 miles • Routes served: Bx5, Bx12, Bx12 SBS, Bx23, Bx24, Bx29, Q50 LTD • Combined daily route ridership: 63,000"
          }
        ]
      },
      {
        "record_id": "corridor_pelham-fordham-207",
        "record_kind": "corridor",
        "display_name": "Pelham Parkway, Fordham Road, West 207 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Pelham Parkway, Fordham Road, and West 207 Street",
          "streets": [
            "Pelham Parkway",
            "Fordham Road",
            "West 207 Street"
          ],
          "limits": "Eastchester Avenue to Broadway",
          "corridor_length_mi": 3.1,
          "routes_served": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60-62"
          ],
          "combined_daily_ridership": 86000,
          "street": "Pelham Parkway / Fordham Road / West 207 Street",
          "from": "Eastchester Avenue",
          "to": "Broadway",
          "status": "Future Plan",
          "routes": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60",
            "Bee Line 61",
            "Bee Line 62"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p026_c0006",
            "page_number": 26,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 3.1 miles • Routes served: Bx9, Bx12, Bx12 SBS, Bx17, Bx22, Bee Line 60-62 • Combined daily route ridership: 86,000"
          }
        ]
      }
    ]
  },
  {
    "value": "Bx12 SBS",
    "count": 2,
    "records": [
      "corridor_pelham-bay-station",
      "corridor_pelham-fordham-207"
    ],
    "representative_records": [
      {
        "record_id": "corridor_pelham-bay-station",
        "record_kind": "corridor",
        "display_name": "Pelham Bay Park 6 Station Area Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Pelham Bay Park Station Area",
          "corridor_length_mi": 0.1,
          "routes_served": [
            "Bx5",
            "Bx12",
            "Bx12 SBS",
            "Bx23",
            "Bx24",
            "Bx29",
            "Q50 LTD"
          ],
          "combined_daily_ridership": 63000,
          "street": "Westchester Avenue / Wilkinson Avenue",
          "from": "Westchester Avenue",
          "to": "Wilkinson Avenue",
          "status": "Completed 2020",
          "routes": [
            "Bx5",
            "Bx12",
            "Bx12 SBS",
            "Bx23",
            "Bx24",
            "Bx29",
            "Q50 LTD"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p027_c0004",
            "page_number": 27,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.1 miles • Routes served: Bx5, Bx12, Bx12 SBS, Bx23, Bx24, Bx29, Q50 LTD • Combined daily route ridership: 63,000"
          }
        ]
      },
      {
        "record_id": "corridor_pelham-fordham-207",
        "record_kind": "corridor",
        "display_name": "Pelham Parkway, Fordham Road, West 207 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Pelham Parkway, Fordham Road, and West 207 Street",
          "streets": [
            "Pelham Parkway",
            "Fordham Road",
            "West 207 Street"
          ],
          "limits": "Eastchester Avenue to Broadway",
          "corridor_length_mi": 3.1,
          "routes_served": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60-62"
          ],
          "combined_daily_ridership": 86000,
          "street": "Pelham Parkway / Fordham Road / West 207 Street",
          "from": "Eastchester Avenue",
          "to": "Broadway",
          "status": "Future Plan",
          "routes": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60",
            "Bee Line 61",
            "Bee Line 62"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p026_c0006",
            "page_number": 26,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 3.1 miles • Routes served: Bx9, Bx12, Bx12 SBS, Bx17, Bx22, Bee Line 60-62 • Combined daily route ridership: 86,000"
          }
        ]
      }
    ]
  },
  {
    "value": "Bx13",
    "count": 2,
    "records": [
      "corridor_washington-bridge",
      "corridor_west-181st-street"
    ],
    "representative_records": [
      {
        "record_id": "corridor_washington-bridge",
        "record_kind": "corridor",
        "display_name": "corridor_washington_bridge",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Washington Bridge",
          "street": "Washington Bridge",
          "from": "Amsterdam Avenue",
          "to": "University Avenue",
          "status": "Future Plan",
          "routes": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_addendum_2021",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "table",
            "snippet": "Status Corridors From To Routes Future Plan Tremont Avenue Sedgwick Avenue Boston Road Bx18, Bx36, Bx40 (current), Bx42 (current) Future Plan East Gun Hill Road Bainbridge Avenue Bartow Avenue Bx28, Bx38, Bx30 (current)..."
          }
        ]
      },
      {
        "record_id": "corridor_west-181st-street",
        "record_kind": "corridor",
        "display_name": "corridor_west_181st_street",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "West 181st Street",
          "street": "West 181st Street",
          "from": "Amsterdam Avenue",
          "to": "Broadway",
          "status": "Completed 2020",
          "routes": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_addendum_2021",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "table",
            "snippet": "Status Corridors From To Routes Future Plan Tremont Avenue Sedgwick Avenue Boston Road Bx18, Bx36, Bx40 (current), Bx42 (current) Future Plan East Gun Hill Road Bainbridge Avenue Bartow Avenue Bx28, Bx38, Bx30 (current)..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx17",
    "count": 2,
    "records": [
      "corridor_east-149-st",
      "corridor_pelham-fordham-207"
    ],
    "representative_records": [
      {
        "record_id": "corridor_east-149-st",
        "record_kind": "corridor",
        "display_name": "East 149 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "East 149 Street",
          "limits": "River Avenue to Southern Boulevard",
          "corridor_length_mi": 1.5,
          "routes_served": [
            "Bx19",
            "Bx2",
            "Bx4A",
            "Bx17"
          ],
          "combined_daily_ridership": 46000,
          "street": "East 149 Street",
          "from": "River Avenue",
          "to": "Southern Boulevard",
          "status": "Completed 2020",
          "routes": [
            "Bx2",
            "Bx4",
            "Bx4A",
            "Bx19",
            "Bx17"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p029_c0004",
            "page_number": 29,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 1.5 miles • Routes served: Bx19, Bx2, Bx4A, Bx17 • Combined daily route ridership: 46,000 (excluding Bx2 ridership, for which ridership figures are combined with Bx1)"
          }
        ]
      },
      {
        "record_id": "corridor_pelham-fordham-207",
        "record_kind": "corridor",
        "display_name": "Pelham Parkway, Fordham Road, West 207 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Pelham Parkway, Fordham Road, and West 207 Street",
          "streets": [
            "Pelham Parkway",
            "Fordham Road",
            "West 207 Street"
          ],
          "limits": "Eastchester Avenue to Broadway",
          "corridor_length_mi": 3.1,
          "routes_served": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60-62"
          ],
          "combined_daily_ridership": 86000,
          "street": "Pelham Parkway / Fordham Road / West 207 Street",
          "from": "Eastchester Avenue",
          "to": "Broadway",
          "status": "Future Plan",
          "routes": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60",
            "Bee Line 61",
            "Bee Line 62"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p026_c0006",
            "page_number": 26,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 3.1 miles • Routes served: Bx9, Bx12, Bx12 SBS, Bx17, Bx22, Bee Line 60-62 • Combined daily route ridership: 86,000"
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
      "rule_id": "corridor-routes-served",
      "relation_kind": "operates_on_corridor",
      "direction": "target_to_origin",
      "records_with_field": 11,
      "value_count": 47,
      "derived_count": 0,
      "already_present_count": 27,
      "unresolved_count": 20,
      "skipped_self_count": 0
    }
  ]
}
```

### project-corridor-spatial:relation-context:corridor.routes_served

- Category: relation_context_field
- Priority: 170
- Record kind: corridor
- Field: routes_served
- Count: 10
- Title: corridor.routes_served should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 23 endpoint values are already present or derivable (23 already present, 0 newly derivable); 17 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: operates_on_corridor.
- corridor.routes_served appears on 10 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Bx35",
    "count": 3,
    "records": [
      "corridor_east-167-168-st",
      "corridor_el-grant-highway",
      "corridor_washington-bridge-181st"
    ],
    "representative_records": [
      {
        "record_id": "corridor_east-167-168-st",
        "record_kind": "corridor",
        "display_name": "East 167 Street and East 168 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "corridor_name": "East 167 Street and East 168 Street",
          "limits": "Jerome Avenue to Franklin Avenue",
          "corridor_length_mi": 1.2,
          "routes_served": [
            "Bx35"
          ],
          "daily_ridership": 27000
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p033_c0004",
            "page_number": 33,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 1.2 miles • Routes served: Bx35 • Daily route ridership: 27,000"
          }
        ]
      },
      {
        "record_id": "corridor_el-grant-highway",
        "record_kind": "corridor",
        "display_name": "E.L. Grant Highway Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "E.L. Grant Highway",
          "limits": "Cross Bronx Expressway to East 167 Street",
          "corridor_length_mi": 0.6,
          "routes_served": [
            "Bx11",
            "Bx13",
            "Bx35"
          ],
          "combined_daily_ridership": 36000,
          "street": "E.L. Grant Highway",
          "from": "Cross Bronx Expressway",
          "to": "East 167 Street",
          "status": "Completed 2020",
          "routes": [
            "Bx35"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p030_c0004",
            "page_number": 30,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.6 miles • Routes served: Bx11, Bx13, Bx35 • Combined daily route ridership: 36,000"
          }
        ]
      },
      {
        "record_id": "corridor_washington-bridge-181st",
        "record_kind": "corridor",
        "display_name": "Washington Bridge and West 181 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "corridor_name": "Washington Bridge and West 181 Street",
          "streets": [
            "Washington Bridge",
            "West 181 Street"
          ],
          "limits": "University Avenue to Broadway",
          "corridor_length_mi": 0.8,
          "routes_served": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ],
          "combined_daily_ridership": 73000
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p028_c0005",
            "page_number": 28,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.8 miles • Routes served: Bx3, Bx11, Bx13, Bx35, Bx36 • Combined daily route ridership: 73,000"
          }
        ]
      }
    ]
  },
  {
    "value": "Bx36",
    "count": 3,
    "records": [
      "corridor_tremont-ave",
      "corridor_university-ave",
      "corridor_washington-bridge-181st"
    ],
    "representative_records": [
      {
        "record_id": "corridor_tremont-ave",
        "record_kind": "corridor",
        "display_name": "Tremont Avenue Corridor",
        "source_ids": [
          "better_buses",
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021",
          "busway_tremontavenue",
          "busways",
          "tremont_ave_busway"
        ],
        "payload": {
          "corridor_name": "Tremont Avenue",
          "limits": "Sedgwick Avenue to Boston Road",
          "corridor_length_mi": 6.8,
          "routes_served": [
            "Bx4A",
            "Bx9",
            "Bx18",
            "Bx36",
            "Bx40",
            "Bx42"
          ],
          "combined_daily_ridership": 69000,
          "street": "Tremont Avenue",
          "from": "Sedgwick Avenue",
          "to": "Boston Road",
          "status": "Future Plan",
          "routes": [
            "Bx18",
            "Bx36",
            "Bx40",
            "Bx42"
          ],
          "_merged_field_values": {
            "limits": [
              "Sedgwick Avenue to Boston Road",
              "University Avenue to Bronx River Parkway",
              "Third Avenue to Southern Boulevard (eastbound); Southern Boulevard to Belmont Avenue (westbound)",
              "Eastbound from Third Ave. to Southern Blvd.; Westbound from Southern Blvd. to Belmont Ave."
            ],
            "corridor_name": [
              "Tremont Avenue",
              "Tremont Avenue Busway"
            ],
            "borough": [
              "Bronx",
              "the Bronx"
            ],
            "status": [
              "Future Plan",
              "Planned"
            ],
            "from": [
              "Sedgwick Avenue",
              "Third Avenue / Belmont Avenue",
              "Third Ave. / Southern Blvd."
            ],
            "to": [
              "Boston Road",
              "Southern Boulevard",
              "Southern Blvd. / Belmont Ave."
            ]
          },
          "borough": "Bronx",
          "description": "Corridor for bus priority improvements for Bronx's 5th busiest bus route with nearly 34,000 daily riders",
          "borough_normalized": "bronx",
          "eastbound_limits": "Third Avenue to Southern Boulevard",
          "westbound_limits": "Southern Boulevard to Belmont Avenue",
          "through_access_vehicles": [
            "buses",
            "trucks",
            "Access-A-Ride vans",
            "emergency vehicles",
            "bicycles"
          ],
          "local_access": "may turn onto the busway from a side street but must turn at next available right",
          "hours": "6am to 8pm",
          "days": "seven days a week"
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p032_c0004",
            "page_number": 32,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 6.8 miles • Routes served: Bx4A, Bx9, Bx18, Bx36, Bx40, Bx42 • Combined daily route ridership: 69,000"
          }
        ]
      },
      {
        "record_id": "corridor_university-ave",
        "record_kind": "corridor",
        "display_name": "University Avenue Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "University Avenue",
          "limits": "Kingsbridge Road to Cross Bronx Expressway",
          "corridor_length_mi": 2,
          "routes_served": [
            "Bx3",
            "Bx18",
            "Bx36"
          ],
          "combined_daily_ridership": 39000,
          "street": "University Avenue",
          "from": "Kingsbridge Road",
          "to": "Cross Bronx Expressway",
          "status": "Present Implementation",
          "routes": [
            "Bx3",
            "Bx18",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p031_c0004",
            "page_number": 31,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 2 miles • Routes served: Bx3, Bx18, Bx36 • Combined daily route ridership: 39,000"
          }
        ]
      },
      {
        "record_id": "corridor_washington-bridge-181st",
        "record_kind": "corridor",
        "display_name": "Washington Bridge and West 181 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "corridor_name": "Washington Bridge and West 181 Street",
          "streets": [
            "Washington Bridge",
            "West 181 Street"
          ],
          "limits": "University Avenue to Broadway",
          "corridor_length_mi": 0.8,
          "routes_served": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ],
          "combined_daily_ridership": 73000
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p028_c0005",
            "page_number": 28,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.8 miles • Routes served: Bx3, Bx11, Bx13, Bx35, Bx36 • Combined daily route ridership: 73,000"
          }
        ]
      }
    ]
  },
  {
    "value": "Bx11",
    "count": 2,
    "records": [
      "corridor_el-grant-highway",
      "corridor_washington-bridge-181st"
    ],
    "representative_records": [
      {
        "record_id": "corridor_el-grant-highway",
        "record_kind": "corridor",
        "display_name": "E.L. Grant Highway Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "E.L. Grant Highway",
          "limits": "Cross Bronx Expressway to East 167 Street",
          "corridor_length_mi": 0.6,
          "routes_served": [
            "Bx11",
            "Bx13",
            "Bx35"
          ],
          "combined_daily_ridership": 36000,
          "street": "E.L. Grant Highway",
          "from": "Cross Bronx Expressway",
          "to": "East 167 Street",
          "status": "Completed 2020",
          "routes": [
            "Bx35"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p030_c0004",
            "page_number": 30,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.6 miles • Routes served: Bx11, Bx13, Bx35 • Combined daily route ridership: 36,000"
          }
        ]
      },
      {
        "record_id": "corridor_washington-bridge-181st",
        "record_kind": "corridor",
        "display_name": "Washington Bridge and West 181 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "corridor_name": "Washington Bridge and West 181 Street",
          "streets": [
            "Washington Bridge",
            "West 181 Street"
          ],
          "limits": "University Avenue to Broadway",
          "corridor_length_mi": 0.8,
          "routes_served": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ],
          "combined_daily_ridership": 73000
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p028_c0005",
            "page_number": 28,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.8 miles • Routes served: Bx3, Bx11, Bx13, Bx35, Bx36 • Combined daily route ridership: 73,000"
          }
        ]
      }
    ]
  },
  {
    "value": "Bx12",
    "count": 2,
    "records": [
      "corridor_pelham-bay-station",
      "corridor_pelham-fordham-207"
    ],
    "representative_records": [
      {
        "record_id": "corridor_pelham-bay-station",
        "record_kind": "corridor",
        "display_name": "Pelham Bay Park 6 Station Area Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Pelham Bay Park Station Area",
          "corridor_length_mi": 0.1,
          "routes_served": [
            "Bx5",
            "Bx12",
            "Bx12 SBS",
            "Bx23",
            "Bx24",
            "Bx29",
            "Q50 LTD"
          ],
          "combined_daily_ridership": 63000,
          "street": "Westchester Avenue / Wilkinson Avenue",
          "from": "Westchester Avenue",
          "to": "Wilkinson Avenue",
          "status": "Completed 2020",
          "routes": [
            "Bx5",
            "Bx12",
            "Bx12 SBS",
            "Bx23",
            "Bx24",
            "Bx29",
            "Q50 LTD"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p027_c0004",
            "page_number": 27,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.1 miles • Routes served: Bx5, Bx12, Bx12 SBS, Bx23, Bx24, Bx29, Q50 LTD • Combined daily route ridership: 63,000"
          }
        ]
      },
      {
        "record_id": "corridor_pelham-fordham-207",
        "record_kind": "corridor",
        "display_name": "Pelham Parkway, Fordham Road, West 207 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Pelham Parkway, Fordham Road, and West 207 Street",
          "streets": [
            "Pelham Parkway",
            "Fordham Road",
            "West 207 Street"
          ],
          "limits": "Eastchester Avenue to Broadway",
          "corridor_length_mi": 3.1,
          "routes_served": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60-62"
          ],
          "combined_daily_ridership": 86000,
          "street": "Pelham Parkway / Fordham Road / West 207 Street",
          "from": "Eastchester Avenue",
          "to": "Broadway",
          "status": "Future Plan",
          "routes": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60",
            "Bee Line 61",
            "Bee Line 62"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p026_c0006",
            "page_number": 26,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 3.1 miles • Routes served: Bx9, Bx12, Bx12 SBS, Bx17, Bx22, Bee Line 60-62 • Combined daily route ridership: 86,000"
          }
        ]
      }
    ]
  },
  {
    "value": "Bx12 SBS",
    "count": 2,
    "records": [
      "corridor_pelham-bay-station",
      "corridor_pelham-fordham-207"
    ],
    "representative_records": [
      {
        "record_id": "corridor_pelham-bay-station",
        "record_kind": "corridor",
        "display_name": "Pelham Bay Park 6 Station Area Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Pelham Bay Park Station Area",
          "corridor_length_mi": 0.1,
          "routes_served": [
            "Bx5",
            "Bx12",
            "Bx12 SBS",
            "Bx23",
            "Bx24",
            "Bx29",
            "Q50 LTD"
          ],
          "combined_daily_ridership": 63000,
          "street": "Westchester Avenue / Wilkinson Avenue",
          "from": "Westchester Avenue",
          "to": "Wilkinson Avenue",
          "status": "Completed 2020",
          "routes": [
            "Bx5",
            "Bx12",
            "Bx12 SBS",
            "Bx23",
            "Bx24",
            "Bx29",
            "Q50 LTD"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p027_c0004",
            "page_number": 27,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.1 miles • Routes served: Bx5, Bx12, Bx12 SBS, Bx23, Bx24, Bx29, Q50 LTD • Combined daily route ridership: 63,000"
          }
        ]
      },
      {
        "record_id": "corridor_pelham-fordham-207",
        "record_kind": "corridor",
        "display_name": "Pelham Parkway, Fordham Road, West 207 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Pelham Parkway, Fordham Road, and West 207 Street",
          "streets": [
            "Pelham Parkway",
            "Fordham Road",
            "West 207 Street"
          ],
          "limits": "Eastchester Avenue to Broadway",
          "corridor_length_mi": 3.1,
          "routes_served": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60-62"
          ],
          "combined_daily_ridership": 86000,
          "street": "Pelham Parkway / Fordham Road / West 207 Street",
          "from": "Eastchester Avenue",
          "to": "Broadway",
          "status": "Future Plan",
          "routes": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60",
            "Bee Line 61",
            "Bee Line 62"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p026_c0006",
            "page_number": 26,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 3.1 miles • Routes served: Bx9, Bx12, Bx12 SBS, Bx17, Bx22, Bee Line 60-62 • Combined daily route ridership: 86,000"
          }
        ]
      }
    ]
  },
  {
    "value": "Bx13",
    "count": 2,
    "records": [
      "corridor_el-grant-highway",
      "corridor_washington-bridge-181st"
    ],
    "representative_records": [
      {
        "record_id": "corridor_el-grant-highway",
        "record_kind": "corridor",
        "display_name": "E.L. Grant Highway Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "E.L. Grant Highway",
          "limits": "Cross Bronx Expressway to East 167 Street",
          "corridor_length_mi": 0.6,
          "routes_served": [
            "Bx11",
            "Bx13",
            "Bx35"
          ],
          "combined_daily_ridership": 36000,
          "street": "E.L. Grant Highway",
          "from": "Cross Bronx Expressway",
          "to": "East 167 Street",
          "status": "Completed 2020",
          "routes": [
            "Bx35"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p030_c0004",
            "page_number": 30,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.6 miles • Routes served: Bx11, Bx13, Bx35 • Combined daily route ridership: 36,000"
          }
        ]
      },
      {
        "record_id": "corridor_washington-bridge-181st",
        "record_kind": "corridor",
        "display_name": "Washington Bridge and West 181 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "corridor_name": "Washington Bridge and West 181 Street",
          "streets": [
            "Washington Bridge",
            "West 181 Street"
          ],
          "limits": "University Avenue to Broadway",
          "corridor_length_mi": 0.8,
          "routes_served": [
            "Bx3",
            "Bx11",
            "Bx13",
            "Bx35",
            "Bx36"
          ],
          "combined_daily_ridership": 73000
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p028_c0005",
            "page_number": 28,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 0.8 miles • Routes served: Bx3, Bx11, Bx13, Bx35, Bx36 • Combined daily route ridership: 73,000"
          }
        ]
      }
    ]
  },
  {
    "value": "Bx17",
    "count": 2,
    "records": [
      "corridor_east-149-st",
      "corridor_pelham-fordham-207"
    ],
    "representative_records": [
      {
        "record_id": "corridor_east-149-st",
        "record_kind": "corridor",
        "display_name": "East 149 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "East 149 Street",
          "limits": "River Avenue to Southern Boulevard",
          "corridor_length_mi": 1.5,
          "routes_served": [
            "Bx19",
            "Bx2",
            "Bx4A",
            "Bx17"
          ],
          "combined_daily_ridership": 46000,
          "street": "East 149 Street",
          "from": "River Avenue",
          "to": "Southern Boulevard",
          "status": "Completed 2020",
          "routes": [
            "Bx2",
            "Bx4",
            "Bx4A",
            "Bx19",
            "Bx17"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p029_c0004",
            "page_number": 29,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 1.5 miles • Routes served: Bx19, Bx2, Bx4A, Bx17 • Combined daily route ridership: 46,000 (excluding Bx2 ridership, for which ridership figures are combined with Bx1)"
          }
        ]
      },
      {
        "record_id": "corridor_pelham-fordham-207",
        "record_kind": "corridor",
        "display_name": "Pelham Parkway, Fordham Road, West 207 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "Pelham Parkway, Fordham Road, and West 207 Street",
          "streets": [
            "Pelham Parkway",
            "Fordham Road",
            "West 207 Street"
          ],
          "limits": "Eastchester Avenue to Broadway",
          "corridor_length_mi": 3.1,
          "routes_served": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60-62"
          ],
          "combined_daily_ridership": 86000,
          "street": "Pelham Parkway / Fordham Road / West 207 Street",
          "from": "Eastchester Avenue",
          "to": "Broadway",
          "status": "Future Plan",
          "routes": [
            "Bx9",
            "Bx12",
            "Bx12 SBS",
            "Bx17",
            "Bx22",
            "Bee Line 60",
            "Bee Line 61",
            "Bee Line 62"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p026_c0006",
            "page_number": 26,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 3.1 miles • Routes served: Bx9, Bx12, Bx12 SBS, Bx17, Bx22, Bee Line 60-62 • Combined daily route ridership: 86,000"
          }
        ]
      }
    ]
  },
  {
    "value": "Bx18",
    "count": 2,
    "records": [
      "corridor_tremont-ave",
      "corridor_university-ave"
    ],
    "representative_records": [
      {
        "record_id": "corridor_tremont-ave",
        "record_kind": "corridor",
        "display_name": "Tremont Avenue Corridor",
        "source_ids": [
          "better_buses",
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021",
          "busway_tremontavenue",
          "busways",
          "tremont_ave_busway"
        ],
        "payload": {
          "corridor_name": "Tremont Avenue",
          "limits": "Sedgwick Avenue to Boston Road",
          "corridor_length_mi": 6.8,
          "routes_served": [
            "Bx4A",
            "Bx9",
            "Bx18",
            "Bx36",
            "Bx40",
            "Bx42"
          ],
          "combined_daily_ridership": 69000,
          "street": "Tremont Avenue",
          "from": "Sedgwick Avenue",
          "to": "Boston Road",
          "status": "Future Plan",
          "routes": [
            "Bx18",
            "Bx36",
            "Bx40",
            "Bx42"
          ],
          "_merged_field_values": {
            "limits": [
              "Sedgwick Avenue to Boston Road",
              "University Avenue to Bronx River Parkway",
              "Third Avenue to Southern Boulevard (eastbound); Southern Boulevard to Belmont Avenue (westbound)",
              "Eastbound from Third Ave. to Southern Blvd.; Westbound from Southern Blvd. to Belmont Ave."
            ],
            "corridor_name": [
              "Tremont Avenue",
              "Tremont Avenue Busway"
            ],
            "borough": [
              "Bronx",
              "the Bronx"
            ],
            "status": [
              "Future Plan",
              "Planned"
            ],
            "from": [
              "Sedgwick Avenue",
              "Third Avenue / Belmont Avenue",
              "Third Ave. / Southern Blvd."
            ],
            "to": [
              "Boston Road",
              "Southern Boulevard",
              "Southern Blvd. / Belmont Ave."
            ]
          },
          "borough": "Bronx",
          "description": "Corridor for bus priority improvements for Bronx's 5th busiest bus route with nearly 34,000 daily riders",
          "borough_normalized": "bronx",
          "eastbound_limits": "Third Avenue to Southern Boulevard",
          "westbound_limits": "Southern Boulevard to Belmont Avenue",
          "through_access_vehicles": [
            "buses",
            "trucks",
            "Access-A-Ride vans",
            "emergency vehicles",
            "bicycles"
          ],
          "local_access": "may turn onto the busway from a side street but must turn at next available right",
          "hours": "6am to 8pm",
          "days": "seven days a week"
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p032_c0004",
            "page_number": 32,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 6.8 miles • Routes served: Bx4A, Bx9, Bx18, Bx36, Bx40, Bx42 • Combined daily route ridership: 69,000"
          }
        ]
      },
      {
        "record_id": "corridor_university-ave",
        "record_kind": "corridor",
        "display_name": "University Avenue Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "corridor_name": "University Avenue",
          "limits": "Kingsbridge Road to Cross Bronx Expressway",
          "corridor_length_mi": 2,
          "routes_served": [
            "Bx3",
            "Bx18",
            "Bx36"
          ],
          "combined_daily_ridership": 39000,
          "street": "University Avenue",
          "from": "Kingsbridge Road",
          "to": "Cross Bronx Expressway",
          "status": "Present Implementation",
          "routes": [
            "Bx3",
            "Bx18",
            "Bx36"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p031_c0004",
            "page_number": 31,
            "role": "provides_metrics",
            "snippet": "• Corridor length: 2 miles • Routes served: Bx3, Bx18, Bx36 • Combined daily route ridership: 39,000"
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
      "rule_id": "corridor-routes-served",
      "relation_kind": "operates_on_corridor",
      "direction": "target_to_origin",
      "records_with_field": 10,
      "value_count": 40,
      "derived_count": 0,
      "already_present_count": 23,
      "unresolved_count": 17,
      "skipped_self_count": 0
    }
  ]
}
```

### project-corridor-spatial:relation-context:project.operator

- Category: relation_context_field
- Priority: 130
- Record kind: project
- Field: operator
- Count: 5
- Title: project.operator should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 3 endpoint values are already present or derivable (3 already present, 0 newly derivable); 2 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: operated_by.
- project.operator appears on 5 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "NYC DOT",
    "count": 3,
    "records": [
      "project_34th-street-busway",
      "project_better-buses",
      "project_stationary-camera-program"
    ],
    "representative_records": [
      {
        "record_id": "project_34th-street-busway",
        "record_kind": "project",
        "display_name": "34th Street Busway",
        "source_ids": [
          "34th_st_busway",
          "busway_34thstreet"
        ],
        "payload": {
          "project_name": "34th Street Busway",
          "project_type": "busway",
          "status": "active",
          "description": "Busway on 34th Street from Ninth Avenue to Third Avenue (eastbound) and Third Avenue to Ninth Avenue (westbound), prioritizing buses, trucks, and emergency vehicles",
          "document_time_status": "active",
          "project_family": "busway",
          "borough": "Manhattan",
          "operator": "NYC DOT",
          "_merged_field_values": {
            "description": [
              "Busway on 34th Street from Ninth Avenue to Third Avenue (eastbound) and Third Avenue to Ninth Avenue (westbound), prioritizing buses, trucks, and emergency vehicles",
              "Busway on 34th Street between Ninth Avenue and Third Avenue. Active daily 6am-10pm. Only buses, trucks >2 axles or >=6 wheels, Access-A-Ride vans, and emergency vehicles may travel through. Passenger vehicles may turn onto busway from side streets but must make next available right turn. Curb access allowed entire busway. Enforced by NYPD and automated cameras."
            ]
          },
          "borough_normalized": "manhattan"
        },
        "evidence_examples": [
          {
            "source_id": "34th_st_busway",
            "block_id": "p002_c0002",
            "page_number": 2,
            "role": "description",
            "snippet": "34th Street will become a busway:"
          }
        ]
      },
      {
        "record_id": "project_better-buses",
        "record_kind": "project",
        "display_name": "Better Buses Program",
        "source_ids": [
          "behind_schedule_2025",
          "better_buses",
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "project_name": "Better Buses Program",
          "project_type": "bus_priority_program",
          "status": "operational",
          "description": "Program initiated in 2019 to further SBS goals on a broader array of bus corridors. In 2022-2023, installed 23.1 miles of new and upgraded bus lanes.",
          "operator": "NYC DOT",
          "document_time_status": "implemented",
          "project_family": "bus_priority",
          "_merged_field_values": {
            "description": [
              "Program initiated in 2019 to further SBS goals on a broader array of bus corridors. In 2022-2023, installed 23.1 miles of new and upgraded bus lanes.",
              "Umbrella program/page for NYC DOT bus-priority work.",
              "Better Buses program context for DOT bus-priority initiatives."
            ],
            "document_time_status": [
              "implemented",
              "program_context"
            ],
            "project_family": [
              "bus_priority",
              "bus_priority_program"
            ],
            "project_name": [
              "Better Buses Program",
              "Better Buses"
            ]
          }
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "program_description",
            "snippet": "DOT initiated the Better Buses program in 2019 to further the goals of SBS on a broader array of bus corridors. In 2022 and 2023, DOT installed 23.1 miles of new and upgraded bus lanes, including projects on University..."
          }
        ]
      },
      {
        "record_id": "project_stationary-camera-program",
        "record_kind": "project",
        "display_name": "DOT Stationary Bus Lane Camera Program",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "project_name": "DOT Stationary Bus Lane Camera Enforcement Program",
          "project_type": "enforcement_program",
          "status": "operational",
          "description": "Fixed-location camera system with two cameras mounted above bus lanes - one for license plate view, one for wider street view. Installed at 188 locations through 2023.",
          "operator": "NYC DOT",
          "document_time_status": "implemented",
          "project_family": "enforcement_program"
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p006_c0003",
            "page_number": 6,
            "role": "system_description",
            "snippet": "Two types of violation monitoring equipment have been used to date. The first is a fixed location camera system implemented by DOT. In the fixed system, two cameras are mounted above the bus lane. One camera provides a..."
          }
        ]
      }
    ]
  },
  {
    "value": "MTA",
    "count": 2,
    "records": [
      "project_able-program",
      "project_ace-program"
    ],
    "representative_records": [
      {
        "record_id": "project_able-program",
        "record_kind": "project",
        "display_name": "MTA ABLE (Automated Bus Lane Enforcement) Program",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "project_name": "MTA ABLE (Automated Bus Lane Enforcement) Program",
          "project_type": "enforcement_program",
          "status": "operational",
          "description": "On-bus mobile camera system operated by MTA. Equipment installed inside buses captures rear license plates of vehicles stopped in bus lanes. Two buses must observe same vehicle at same GPS location at least 5 minutes apart to issue violation. Captures no standing and no parking violations.",
          "operator": "MTA",
          "document_time_status": "implemented",
          "project_family": "enforcement_program"
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p008_c0002",
            "page_number": 8,
            "role": "program_origin",
            "snippet": "The second type of violation monitoring equipment is operated by the MTA and consists of on-bus mobile cameras, which were first tested in a NYCT pilot program in 2010–2011 and then fully implemented under the ABLE prog..."
          }
        ]
      },
      {
        "record_id": "project_ace-program",
        "record_kind": "project",
        "display_name": "MTA ACE (Automated Camera Enforcement) Program",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "project_name": "MTA ACE (Automated Camera Enforcement) Program",
          "project_type": "enforcement_program",
          "status": "starting_2024",
          "description": "Expanded program that transitioned from ABLE, issuing additional violations for vehicles parking in bus stops and double parking along bus routes. Began enforcement after a 60-day warning period in summer 2024.",
          "operator": "MTA",
          "document_time_status": "planned",
          "project_family": "enforcement_program"
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p003_c0002",
            "page_number": 3,
            "role": "program_description",
            "snippet": "In 2024 expanded legislative authority went into effect, and MTA transitioned from the ABLE program to the Automated Camera Enforcement (ACE) program which issues additional violations for vehicles parking in bus stops..."
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
      "rule_id": "project-operator",
      "relation_kind": "operated_by",
      "direction": "origin_to_target",
      "records_with_field": 5,
      "value_count": 5,
      "derived_count": 0,
      "already_present_count": 3,
      "unresolved_count": 2,
      "skipped_self_count": 0
    }
  ]
}
```

### project-corridor-spatial:relation-context:project.program

- Category: relation_context_field
- Priority: 120
- Record kind: project
- Field: program
- Count: 1
- Title: project.program should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 1 endpoint values are already present or derivable (1 already present, 0 newly derivable); 0 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: part_of_program.
- project.program appears on 1 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Better Buses Restart",
    "count": 1,
    "records": [
      "project_jamaica-busway"
    ],
    "representative_records": [
      {
        "record_id": "project_jamaica-busway",
        "record_kind": "project",
        "display_name": "Jamaica Busway",
        "source_ids": [
          "jamaica_busway_monitoring_update_2022"
        ],
        "payload": {
          "project_name": "Jamaica Busway",
          "project_type": "busway",
          "status": "monitoring",
          "description": "Busway pilot on Jamaica Avenue and Archer Avenue in Queens, launched October 24, 2021, as part of the Better Buses Restart program",
          "program": "Better Buses Restart",
          "corridors": [
            "Jamaica Avenue",
            "Archer Avenue"
          ],
          "launch_date_text": "October 24, 2021",
          "launch_date_text_normalized": {
            "raw_text": "October 24, 2021",
            "normalized_date": "2021-10-24",
            "precision": "day",
            "confidence": "parsed_text"
          },
          "document_time_status": "monitoring",
          "project_family": "busway"
        },
        "evidence_examples": [
          {
            "source_id": "jamaica_busway_monitoring_update_2022",
            "block_id": "p001_c0001",
            "page_number": 1,
            "role": "project_title",
            "snippet": "Better Buses Restart: Jamaica Busway"
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
      "rule_id": "project-program",
      "relation_kind": "part_of_program",
      "direction": "origin_to_target",
      "records_with_field": 1,
      "value_count": 1,
      "derived_count": 0,
      "already_present_count": 1,
      "unresolved_count": 0,
      "skipped_self_count": 0
    }
  ]
}
```

### project-corridor-spatial:relation-context:project.publisher

- Category: relation_context_field
- Priority: 120
- Record kind: project
- Field: publisher
- Count: 3
- Title: project.publisher should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 3 endpoint values are already present or derivable (3 already present, 0 newly derivable); 0 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: published_by.
- project.publisher appears on 3 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "NYC Comptroller Brad Lander",
    "count": 2,
    "records": [
      "project_behind-schedule-2025",
      "project_life-in-slow-lane-report-card"
    ],
    "representative_records": [
      {
        "record_id": "project_behind-schedule-2025",
        "record_kind": "project",
        "display_name": "Behind Schedule Report (April 2025)",
        "source_ids": [
          "life_in_slow_lane_2025"
        ],
        "payload": {
          "project_name": "Behind Schedule",
          "project_type": "report",
          "publisher": "NYC Comptroller Brad Lander",
          "status": "completed",
          "description": "Comprehensive performance review of the NYC bus system published in April 2024 (sic) by the NYC Comptroller's Office. The Life in the Slow Lane report card builds on this analysis.",
          "document_time_status": "implemented",
          "project_family": "planning_or_report"
        },
        "evidence_examples": [
          {
            "source_id": "life_in_slow_lane_2025",
            "block_id": "p001_c0007",
            "page_number": 1,
            "snippet": "New York City's bus system faces many performance challenges, with slow speeds and inconsistent service plaguing the commutes of 1.1 million daily riders. In April 2024, the NYC Comptroller's Office published Behind Sch..."
          }
        ]
      },
      {
        "record_id": "project_life-in-slow-lane-report-card",
        "record_kind": "project",
        "display_name": "Life in the Slow Lane Report Card",
        "source_ids": [
          "life_in_slow_lane_2025"
        ],
        "payload": {
          "project_name": "Life in the Slow Lane: A Report Card for New York City's Bus System",
          "project_type": "report",
          "publisher": "NYC Comptroller Brad Lander",
          "status": "completed",
          "description": "A report card assessing every bus line in NYC on speed, bunching rate, and on-time performance using real-time MTA data from June 2024 to June 2025, assigning letter grades A through F.",
          "document_time_status": "implemented",
          "project_family": "planning_or_report"
        },
        "evidence_examples": [
          {
            "source_id": "life_in_slow_lane_2025",
            "block_id": "p001_c0003",
            "page_number": 1,
            "snippet": "Life in the Slow Lane: A Report Card for New York City's Bus System"
          }
        ]
      }
    ]
  },
  {
    "value": "People Oriented Cities",
    "count": 1,
    "records": [
      "project_how-much-faster-are-we-moving-2025"
    ],
    "representative_records": [
      {
        "record_id": "project_how-much-faster-are-we-moving-2025",
        "record_kind": "project",
        "display_name": "How Much Faster Are We Moving (2025)",
        "source_ids": [
          "life_in_slow_lane_2025"
        ],
        "payload": {
          "project_name": "How Much Faster Are We Moving",
          "project_type": "report",
          "publisher": "People Oriented Cities",
          "status": "completed",
          "description": "2025 report assessing corridor-level speed impacts of different bus lane types in NYC.",
          "document_time_status": "implemented",
          "project_family": "planning_or_report"
        },
        "evidence_examples": [
          {
            "source_id": "life_in_slow_lane_2025",
            "block_id": "p005_c0004",
            "page_number": 5,
            "snippet": "Independent analyses of NYCDOT’s bus priority program found mixed results. A 2025 report assessing corridor-level speed impacts of different bus lane types, How Much Faster Are We Moving , found that some bus lanes prod..."
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
      "rule_id": "project-publisher",
      "relation_kind": "published_by",
      "direction": "origin_to_target",
      "records_with_field": 3,
      "value_count": 3,
      "derived_count": 0,
      "already_present_count": 3,
      "unresolved_count": 0,
      "skipped_self_count": 0
    }
  ]
}
```

### project-corridor-spatial:identity-cluster:corridor_cluster_004

- Category: identity_cluster
- Priority: 47
- Record kind: corridor
- Record ids: corridor_lexington-ave-96th-to-60th, corridor_lexington-avenue
- Title: corridor identity cluster corridor_cluster_004
- Decision options: merge, do_not_merge, split_record, weak_alias, missing_identity_field, needs_more_data, no_change

Reasons:
- identity packet: data/identity-review/packets/corridor_cluster_004.md
- negative:different or partially different limits
- shared_corridor_street:lexington ave

Data:
```json
{
  "cluster_id": "corridor_cluster_004",
  "packet_path": "data/identity-review/packets/corridor_cluster_004.md",
  "identity_pairs_needing_review": [
    {
      "left_record_id": "corridor_lexington-ave-96th-to-60th",
      "right_record_id": "corridor_lexington-avenue"
    }
  ]
}
```
