# Lifecycle & Intervention Taxonomy Agent

Agent id: `lifecycle-intervention-taxonomy`

## Purpose

Normalize event, treatment, project-family, status, and document-time lifecycle taxonomy while preserving source literals.

## Owns

- event_family
- treatment_family
- project_family
- document_time_status
- date/status semantics

## Decision Contract

Submit review decisions only as append-only normalization decisions. Do not edit canonical JSONL, wiki pages, source pages, or source literals directly.

- canonical_value
- family_alias
- bounded_normalizer
- keep_other_passthrough
- reject_mapping
- needs_more_data
- no_change

## Candidate Summary

Candidates: 8

- family_inventory: 4
- raw_lifecycle_field: 4

## Candidates

### lifecycle-intervention-taxonomy:raw-field:event.event_kind

- Category: raw_lifecycle_field
- Priority: 330
- Record kind: event
- Field: event_kind
- Count: 210
- Title: event.event_kind raw literals feed event_family
- Decision options: bounded_normalizer, canonical_value, keep_other_passthrough, reject_mapping, needs_more_data, no_change

Reasons:
- event_kind: canonical=210, distinct=98, class=free_text.
- Review bounded mapping rules without replacing source literals; uncertain values stay raw and map to other.

Examples:
```json
[
  {
    "value": "service_launch"
  },
  {
    "value": "publication"
  },
  {
    "value": "launch"
  },
  {
    "value": "milestone"
  },
  {
    "value": "implementation"
  },
  {
    "value": "meeting"
  },
  {
    "value": "community_presentation"
  },
  {
    "value": "enforcement_milestone"
  }
]
```

Data:
```json
{
  "bounded_taxonomy_policy": {
    "taxonomy_mode": "bounded_normalizer_with_other_passthrough",
    "decision_rule": "Add or remap a family value only when representative raw literals share the same lifecycle/intervention meaning. Otherwise preserve the raw literal and keep the runner-owned family as other.",
    "closed_universe_guard": "The family field is closed for first-pass grouping, but raw source fields remain pass-through so novel or uncertain source language is not rejected."
  }
}
```

### lifecycle-intervention-taxonomy:raw-field:treatment_component.treatment_kind

- Category: raw_lifecycle_field
- Priority: 283
- Record kind: treatment_component
- Field: treatment_kind
- Count: 163
- Title: treatment_component.treatment_kind raw literals feed treatment_family
- Decision options: bounded_normalizer, canonical_value, keep_other_passthrough, reject_mapping, needs_more_data, no_change

Reasons:
- treatment_kind: canonical=163, distinct=96, class=free_text.
- Review bounded mapping rules without replacing source literals; uncertain values stay raw and map to other.

Examples:
```json
[
  {
    "value": "bus_lane"
  },
  {
    "value": "enforcement"
  },
  {
    "value": "bus_priority"
  },
  {
    "value": "curb_management"
  },
  {
    "value": "route_type"
  },
  {
    "value": "traffic_restriction"
  },
  {
    "value": "bus_bulb"
  },
  {
    "value": "busway"
  }
]
```

Data:
```json
{
  "bounded_taxonomy_policy": {
    "taxonomy_mode": "bounded_normalizer_with_other_passthrough",
    "decision_rule": "Add or remap a family value only when representative raw literals share the same lifecycle/intervention meaning. Otherwise preserve the raw literal and keep the runner-owned family as other.",
    "closed_universe_guard": "The family field is closed for first-pass grouping, but raw source fields remain pass-through so novel or uncertain source language is not rejected."
  }
}
```

### lifecycle-intervention-taxonomy:family:treatment_component.treatment_family

- Category: family_inventory
- Priority: 239
- Record kind: treatment_component
- Field: treatment_family
- Count: 163
- Title: Treatment family inventory
- Decision options: family_alias, canonical_value, bounded_normalizer, keep_other_passthrough, reject_mapping, needs_more_data, no_change

Reasons:
- Review treatment_family as a bounded runner-owned taxonomy derived from raw treatment_kind. Preserve raw literals.
- 10 records currently map to other; these are the expansion/review queue.

Examples:
```json
[
  {
    "value": "traffic_restriction",
    "count": 28,
    "records": [
      "treatment_access-restriction",
      "treatment_busway-hours",
      "treatment_eastbound-exit-rules",
      "treatment_left-turn-restriction-all-times"
    ],
    "representative_records": [
      {
        "record_id": "treatment_access-restriction",
        "record_kind": "treatment_component",
        "display_name": "Access restriction - buses, trucks, bicycles only from north/south",
        "source_ids": [
          "jay_street_pilot_overview"
        ],
        "payload": {
          "treatment_kind": "access_restriction",
          "restricted_to": [
            "buses",
            "trucks",
            "bicycles"
          ],
          "access_points": [
            "north",
            "south"
          ],
          "description": "Buses, trucks, and bicycles only permitted to enter Jay Street from north and south; local access from east and west",
          "treatment_family": "traffic_restriction"
        },
        "evidence_examples": [
          {
            "source_id": "jay_street_pilot_overview",
            "block_id": "p001_c0008",
            "page_number": 1,
            "role": "contains",
            "snippet": "• Buses, trucks, and bicycles only permitted to enter Jay Street from north and south • Local access from east and west • Johnson Street converted to one-way eastbound to provide local access • Smith Street/Jay Street p..."
          }
        ]
      },
      {
        "record_id": "treatment_busway-hours",
        "record_kind": "treatment_component",
        "display_name": "Busway operating hours",
        "source_ids": [
          "busway_tremontavenue"
        ],
        "payload": {
          "treatment_kind": "time_of_day_restriction",
          "component_type": "busway_hours",
          "description": "Busway regulations in effect daily 6am to 8pm; overnight 8pm to 6am regulations not in effect",
          "treatment_family": "traffic_restriction"
        },
        "evidence_examples": [
          {
            "source_id": "busway_tremontavenue",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "describes busway hours of operation",
            "snippet": "Tremont Avenue Busway Skip to main content NYC NYC Resources 311 Office of the Mayor Busways Tremont Avenue Busway How to Use the Busway | FAQ | Community Outreach | MTA Bus Schedule The Tremont Avenue Busway in the Bro..."
          }
        ]
      },
      {
        "record_id": "treatment_eastbound-exit-rules",
        "record_kind": "treatment_component",
        "display_name": "Eastbound Busway exit rules by entry point",
        "source_ids": [
          "tremont_ave_busway"
        ],
        "payload": {
          "treatment_kind": "traffic_regulation",
          "component_kind": "turn_restriction",
          "description": "Eastbound busway entry-to-exit rules: Enter from Third and Lafayette Avenues → exit on Arthur Avenue; Enter from Belmont and Hughes Avenues → exit on Crotona Avenue; Enter from Clinton Avenue → exit on Clinton, Prospect and Mapes Avenues; Enter from Marmion Avenue → exit on Marmion Avenue; Enter from Southern Boulevard → exit on Southern Boulevard.",
          "direction": "eastbound",
          "treatment_family": "traffic_restriction"
        },
        "evidence_examples": [
          {
            "source_id": "tremont_ave_busway",
            "block_id": "p001_c0006",
            "page_number": 1,
            "role": "map_table",
            "snippet": "If you enter Tremont Ave. from: You must turn right to exit on: Third and Lafayette Avenues Arthur Avenue Belmont and Hughes Avenues Crotona Avenue Crotona Avenue Clinton Avenue Clinton, Prospect and Mapes Avenues Marmi..."
          }
        ]
      }
    ]
  },
  {
    "value": "bus_lane",
    "count": 19,
    "records": [
      "treatment_bus-lane-bronx-river-ave",
      "treatment_bus-lanes",
      "treatment_busway-bus-lanes-9th-to-1st",
      "treatment_center-running-bus-lane"
    ],
    "representative_records": [
      {
        "record_id": "treatment_bus-lane-bronx-river-ave",
        "record_kind": "treatment_component",
        "display_name": "treatment_bus_lane_bronx_river_ave",
        "source_ids": [
          "soundview_bus_priority_press_release_2021"
        ],
        "payload": {
          "treatment_kind": "bus lane",
          "treatment_type": "traffic lane bus lane",
          "description": "New bus lane in the traffic lane along Bronx River Avenue",
          "location_text": "Bronx River Avenue",
          "date_text": "in effect at all times",
          "treatment_family": "bus_lane",
          "date_text_normalized": {
            "raw_text": "in effect at all times",
            "precision": "unknown",
            "confidence": "unparsed"
          },
          "normalized_location": {
            "raw_text": "Bronx River Avenue"
          }
        },
        "evidence_examples": [
          {
            "source_id": "soundview_bus_priority_press_release_2021",
            "block_id": "p001_b0001",
            "page_number": 1,
            "snippet": "DOT Press Releases - First Dedicated Bus Lanes in Soundview to Begin Serving 45,000 Daily Riders Skip to main content NYC NYC Resources 311 Office of the Mayor About DOT Press Releases IMMEDIATE RELEASE Friday, December..."
          }
        ]
      },
      {
        "record_id": "treatment_bus-lanes",
        "record_kind": "treatment_component",
        "display_name": "treatment_bus_lanes",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "treatment_kind": "bus_lane",
          "description": "9.6 miles of bus lanes implemented along B44 SRS counting both directions, covering just over half the route. Offset bus lane configuration on Nostrand Avenue; curbside bus lanes where space constrained.",
          "treatment_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p018_c0005",
            "page_number": 18,
            "role": "treatment_description",
            "snippet": "Bus lanes were added to Nostrand Avenue and Rogers Avenue in order to better organize the street, increase safety, and to better provide for the large number of buses and bus customers. The cross-sections on page 16 sho..."
          }
        ]
      },
      {
        "record_id": "treatment_busway-bus-lanes-9th-to-1st",
        "record_kind": "treatment_component",
        "display_name": "treatment_busway_bus_lanes_9th_to_1st",
        "source_ids": [
          "14th_street_busway"
        ],
        "payload": {
          "treatment_kind": "bus_lane",
          "component_type": "bus_priority",
          "description": "The project combines blocks of exclusive access and standard bus lanes to provide bus priority from 9th Avenue to 1st Avenue",
          "treatment_family": "bus_lane"
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
    "value": "curb_management",
    "count": 14,
    "records": [
      "treatment_angled-parking",
      "treatment_commercial-loading-adjustment",
      "treatment_commercial-loading-zones",
      "treatment_coned-construction-materials"
    ],
    "representative_records": [
      {
        "record_id": "treatment_angled-parking",
        "record_kind": "treatment_component",
        "display_name": "treatment_angled_parking",
        "source_ids": [
          "soundview_bus_priority_press_release_2021"
        ],
        "payload": {
          "treatment_kind": "parking",
          "treatment_type": "angled parking",
          "description": "Angled parking was added on adjacent side streets at community request, including along Boynton, Soundview and Taylor Avenues",
          "location_text": "Boynton Avenue, Soundview Avenue, Taylor Avenue",
          "treatment_family": "curb_management",
          "normalized_location": {
            "raw_text": "Boynton Avenue, Soundview Avenue, Taylor Avenue"
          }
        },
        "evidence_examples": [
          {
            "source_id": "soundview_bus_priority_press_release_2021",
            "block_id": "p001_b0001",
            "page_number": 1,
            "snippet": "DOT Press Releases - First Dedicated Bus Lanes in Soundview to Begin Serving 45,000 Daily Riders Skip to main content NYC NYC Resources 311 Office of the Mayor About DOT Press Releases IMMEDIATE RELEASE Friday, December..."
          }
        ]
      },
      {
        "record_id": "treatment_commercial-loading-adjustment",
        "record_kind": "treatment_component",
        "display_name": "Commercial loading hours adjustment",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "treatment_kind": "curb_regulation",
          "description": "Adjust commercial loading hours to afternoon and allow morning parking",
          "treatment_family": "curb_management"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p018_c0005",
            "page_number": 18,
            "role": "stated",
            "snippet": "• Adjust curb regulation on southwest corner of 181 st St/Audubon Ave • Adjust commercial loading hours to afternoon and allow morning parking • Work with ConEd to explore alternatives to on-street storage of constructi..."
          }
        ]
      },
      {
        "record_id": "treatment_commercial-loading-zones",
        "record_kind": "treatment_component",
        "display_name": "Commercial Vehicle Loading Zones",
        "source_ids": [
          "14th_street_busway_brochure"
        ],
        "payload": {
          "treatment_kind": "curb_management",
          "component_kind": "loading_zone",
          "description": "Commercial vehicles may load and unload in short-term metered loading zones along the corridor every day from 6am to 10pm. Meters are in effect Monday to Saturday.",
          "time_of_day": "6am-10pm daily",
          "locations": [
            "14th Street between 9th Avenue and 3rd Avenue"
          ],
          "locations_normalized": [
            {
              "raw_text": "14th Street between 9th Avenue and 3rd Avenue",
              "street": "14th Street",
              "cross_street": "Third Avenue"
            }
          ],
          "treatment_family": "curb_management"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_busway_brochure",
            "block_id": "p001_c0008",
            "page_number": 1,
            "role": "commercial loading",
            "snippet": "Commercial vehicles may load and unload in short-term metered loading zones."
          }
        ]
      }
    ]
  },
  {
    "value": "bus_stop_or_boarding",
    "count": 12,
    "records": [
      "treatment_bus-boarder",
      "treatment_bus-boarding-platforms",
      "treatment_bus-boarding-platforms_2",
      "treatment_bus-bulbs"
    ],
    "representative_records": [
      {
        "record_id": "treatment_bus-boarder",
        "record_kind": "treatment_component",
        "display_name": "treatment_component_bus_boarder",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "treatment_kind": "bus_stop",
          "treatment_type": "bus_boarder",
          "description": "Bus bulbs (bus boarders) are permanent sidewalk extensions at bus stops that provide more space for waiting passengers and allow buses to pull up to the curb without leaving the travel lane. DOT has recently been employing durable recycled plastic bus boarders.",
          "treatment_family": "bus_stop_or_boarding"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p014_c0011",
            "page_number": 14,
            "snippet": "Bus Boarder"
          }
        ]
      },
      {
        "record_id": "treatment_bus-boarding-platforms",
        "record_kind": "treatment_component",
        "display_name": "treatment_bus_boarding_platforms",
        "source_ids": [
          "14th_street_fall2019_monitoring"
        ],
        "payload": {
          "treatment_kind": "bus_boarding_platform",
          "description": "Bus boarding platforms in the process of being installed as of November 2019",
          "locations": [
            "14th Street"
          ],
          "locations_normalized": [
            {
              "raw_text": "14th Street",
              "street": "14th Street"
            }
          ],
          "treatment_family": "bus_stop_or_boarding"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_fall2019_monitoring",
            "block_id": "p002_c0008",
            "page_number": 2,
            "role": "description",
            "snippet": "Additional elements of the pilot include new pedestrian space around Union Square, painted curb extensions to shorten pedestrian crossings, and bus boarding platforms, which are in the process of being installed as of N..."
          }
        ]
      },
      {
        "record_id": "treatment_bus-boarding-platforms_2",
        "record_kind": "treatment_component",
        "display_name": "treatment_bus_boarding_platforms",
        "source_ids": [
          "14th_street_winter2020_monitoring"
        ],
        "payload": {
          "treatment_kind": "bus_boarding_platform",
          "description": "Installed bus boarding platforms (temporary sidewalk extensions at bus stops) along 14th Street to facilitate passenger access at key stops and provide additional waiting space",
          "location_text": "Along 14th Street",
          "normalized_location": {
            "raw_text": "Along 14th Street",
            "street": "14th Street"
          },
          "treatment_family": "bus_stop_or_boarding"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_winter2020_monitoring",
            "block_id": "p004_c0006",
            "page_number": 4,
            "role": "project_update",
            "snippet": "→ Added additional green time for westbound traffic at the intersection of 13th Street and 5th Avenue; signal timing on other streets continues to be monitored. → Added additional signage to 14th Street and along approa..."
          }
        ]
      }
    ]
  },
  {
    "value": "enforcement",
    "count": 12,
    "records": [
      "treatment_able-mobile-camera-system",
      "treatment_automated-enforcement",
      "treatment_bus-lane-enforcement-cameras",
      "treatment_enforcement"
    ],
    "representative_records": [
      {
        "record_id": "treatment_able-mobile-camera-system",
        "record_kind": "treatment_component",
        "display_name": "MTA ABLE on-bus mobile camera system",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "treatment_kind": "enforcement_camera",
          "treatment_type": "mobile_on_bus_camera",
          "description": "On-bus mobile camera system. Equipment inside bus captures rear license plates of stopped vehicles, uses GPS to mark location. Two buses must observe same vehicle at same GPS location at least 5 minutes apart to issue violation. Records no standing and no parking violations.",
          "treatment_family": "enforcement"
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p009_c0001",
            "page_number": 9,
            "role": "system_description",
            "snippet": "For the ABLE camera system, equipment is installed inside of the bus that can capture the rear license plates of vehicles stopped in the bus lane as the bus passes the vehicle. It then uses GPS to mark that location. To..."
          }
        ]
      },
      {
        "record_id": "treatment_automated-enforcement",
        "record_kind": "treatment_component",
        "display_name": "treatment_automated_enforcement",
        "source_ids": [
          "14th_street_winter2020_monitoring"
        ],
        "payload": {
          "treatment_kind": "automated_enforcement",
          "description": "Implemented automated enforcement along 14th Street with both fixed position and bus-mounted cameras",
          "location_text": "Along 14th Street",
          "normalized_location": {
            "raw_text": "Along 14th Street",
            "street": "14th Street"
          },
          "treatment_family": "enforcement"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_winter2020_monitoring",
            "block_id": "p004_c0006",
            "page_number": 4,
            "role": "project_update",
            "snippet": "→ Added additional green time for westbound traffic at the intersection of 13th Street and 5th Avenue; signal timing on other streets continues to be monitored. → Added additional signage to 14th Street and along approa..."
          }
        ]
      },
      {
        "record_id": "treatment_bus-lane-enforcement-cameras",
        "record_kind": "treatment_component",
        "display_name": "treatment_bus_lane_enforcement_cameras",
        "source_ids": [
          "soundview_bus_priority_press_release_2021"
        ],
        "payload": {
          "treatment_kind": "enforcement",
          "treatment_type": "bus lane cameras",
          "description": "Bus lane cameras will be activated beginning today with warnings being issued for the first 60-days. After the 60-day warning period, bus lane cameras will issue fines starting at $50 and progressively increasing to $250 for subsequent violations within a one-year period.",
          "treatment_family": "enforcement"
        },
        "evidence_examples": [
          {
            "source_id": "soundview_bus_priority_press_release_2021",
            "block_id": "p001_b0001",
            "page_number": 1,
            "snippet": "DOT Press Releases - First Dedicated Bus Lanes in Soundview to Begin Serving 45,000 Daily Riders Skip to main content NYC NYC Resources 311 Office of the Mayor About DOT Press Releases IMMEDIATE RELEASE Friday, December..."
          }
        ]
      }
    ]
  },
  {
    "value": "capital_or_infrastructure",
    "count": 11,
    "records": [
      "treatment_161st-street-underpass-bus-only",
      "treatment_bus-bulbs_3",
      "treatment_fire-hydrant-upgrades",
      "treatment_grand-concourse-tunnel-bus-both-directions"
    ],
    "representative_records": [
      {
        "record_id": "treatment_161st-street-underpass-bus-only",
        "record_kind": "treatment_component",
        "display_name": "treatment_161st_street_underpass_bus_only",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "treatment_kind": "bus_infrastructure_conversion",
          "description": "Converting the 161st Street underpass to buses only",
          "locations": [
            "161st Street underpass"
          ],
          "locations_normalized": [
            {
              "raw_text": "161st Street underpass",
              "street": "161st Street"
            }
          ],
          "treatment_family": "capital_or_infrastructure"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "treatment_description",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      },
      {
        "record_id": "treatment_bus-bulbs_3",
        "record_kind": "treatment_component",
        "display_name": "treatment_bus_bulbs",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "treatment_kind": "sidewalk_extension",
          "description": "Sidewalk extensions (bus bulbs) at bus stops along the Bx6 route to speed up boarding and create space for seating and bus shelters",
          "treatment_family": "capital_or_infrastructure"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "treatment_description",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      },
      {
        "record_id": "treatment_fire-hydrant-upgrades",
        "record_kind": "treatment_component",
        "display_name": "treatment_fire_hydrant_upgrades",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "treatment_kind": "infrastructure_upgrade",
          "description": "16 fire hydrants upgraded",
          "treatment_family": "capital_or_infrastructure"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "infrastructure_description",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      }
    ]
  },
  {
    "value": "pedestrian_or_accessibility",
    "count": 11,
    "records": [
      "treatment_ada-ramps",
      "treatment_bollards-union-sq",
      "treatment_curb-extensions-medians-pedestrian-refuge-islands",
      "treatment_hylan-blvd-improvements"
    ],
    "representative_records": [
      {
        "record_id": "treatment_ada-ramps",
        "record_kind": "treatment_component",
        "display_name": "treatment_ada_ramps",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "treatment_kind": "ada_improvement",
          "component_kind": "pedestrian_ramp",
          "description": "370 ADA-compliant pedestrian ramps",
          "treatment_family": "pedestrian_or_accessibility"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "infrastructure_description",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      },
      {
        "record_id": "treatment_bollards-union-sq",
        "record_kind": "treatment_component",
        "display_name": "treatment_bollards_union_sq",
        "source_ids": [
          "14th_street_winter2020_monitoring"
        ],
        "payload": {
          "treatment_kind": "pedestrian_safety",
          "description": "Installed plastic delineators (bollards) along expanded pedestrian areas adjacent to Union Square",
          "location_text": "Union Square area",
          "normalized_location": {
            "raw_text": "Union Square area"
          },
          "treatment_family": "pedestrian_or_accessibility"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_winter2020_monitoring",
            "block_id": "p004_c0006",
            "page_number": 4,
            "role": "project_update",
            "snippet": "→ Added additional green time for westbound traffic at the intersection of 13th Street and 5th Avenue; signal timing on other streets continues to be monitored. → Added additional signage to 14th Street and along approa..."
          }
        ]
      },
      {
        "record_id": "treatment_curb-extensions-medians-pedestrian-refuge-islands",
        "record_kind": "treatment_component",
        "display_name": "treatment_curb_extensions_medians_pedestrian_refuge_islands",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "treatment_kind": "pedestrian_safety_feature",
          "description": "Curb extensions, medians and pedestrian refuge islands to shorten crossing distances and improve visibility. Existing painted safety features upgraded to concrete extending sidewalk out to new curblines.",
          "treatment_family": "pedestrian_or_accessibility"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "treatment_description",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      }
    ]
  },
  {
    "value": "busway",
    "count": 10,
    "records": [
      "treatment_archer-ave-busway",
      "treatment_busway-restrictions",
      "treatment_jamaica-ave-busway",
      "treatment_tc-34th-st-busway-hours-daytime"
    ],
    "representative_records": [
      {
        "record_id": "treatment_archer-ave-busway",
        "record_kind": "treatment_component",
        "display_name": "Archer Avenue Busway treatment",
        "source_ids": [
          "jamaica_archer_brochure"
        ],
        "payload": {
          "treatment_kind": "busway",
          "corridor": "Archer Avenue",
          "limits": "150th St to 160th St",
          "direction": "eastbound only",
          "hours": "24/7",
          "through_trips_allowed": "buses and emergency vehicles",
          "local_access": "none",
          "trucks_allowed": false,
          "passenger_vehicles_allowed": false,
          "parking_loading": "no parking nor loading eastbound between 150th St and 160th St",
          "pickup_dropoff": "permitted in westbound direction",
          "treatment_family": "busway"
        },
        "evidence_examples": [
          {
            "source_id": "jamaica_archer_brochure",
            "block_id": "p001_c0002",
            "page_number": 1,
            "role": "limits",
            "snippet": "In October 2021, Jamaica Ave. from Sutphin Blvd. to 168th St. will become a Busway in both directions. Archer Ave. will also become an eastbound Busway from 150th St. to 160th St. Both Busways are part of a one-year pil..."
          }
        ]
      },
      {
        "record_id": "treatment_busway-restrictions",
        "record_kind": "treatment_component",
        "display_name": "34th Street Busway Access Restrictions",
        "source_ids": [
          "34th_st_busway"
        ],
        "payload": {
          "treatment_kind": "busway_access_restriction",
          "treatment_type": "restricted_corridor",
          "description": "Only buses, trucks with 6+ wheels, Access-A-Ride vans, and emergency vehicles may travel all the way through on 34th Street between Third Ave. and Ninth Ave. in both directions. Passenger vehicles may make local trips by turning onto the busway from an avenue, but must make the first possible right turn off the busway.",
          "locations": [
            "34th Street between Third Avenue and Ninth Avenue"
          ],
          "hours": "6 AM – 10 PM / 7 days a week",
          "locations_normalized": [
            {
              "raw_text": "34th Street between Third Avenue and Ninth Avenue",
              "street": "34th Street"
            }
          ],
          "treatment_family": "busway"
        },
        "evidence_examples": [
          {
            "source_id": "34th_st_busway",
            "block_id": "p002_c0007",
            "page_number": 2,
            "role": "hours",
            "snippet": "6 AM – 10 PM / 7 days a week"
          }
        ]
      },
      {
        "record_id": "treatment_jamaica-ave-busway",
        "record_kind": "treatment_component",
        "display_name": "Jamaica Avenue Busway treatment",
        "source_ids": [
          "jamaica_archer_brochure"
        ],
        "payload": {
          "treatment_kind": "busway",
          "corridor": "Jamaica Avenue",
          "limits": "Sutphin Blvd to 168th St",
          "direction": "both directions",
          "hours": "24/7",
          "through_trips_allowed": "buses, trucks, emergency vehicles",
          "left_turns": "restricted except eastbound left at 153rd St",
          "local_access": "allowed with next-right-turn requirement",
          "pickup_dropoff": "allowed throughout except westbound between 147th Pl and Sutphin Blvd",
          "treatment_family": "busway"
        },
        "evidence_examples": [
          {
            "source_id": "jamaica_archer_brochure",
            "block_id": "p001_c0002",
            "page_number": 1,
            "role": "limits",
            "snippet": "In October 2021, Jamaica Ave. from Sutphin Blvd. to 168th St. will become a Busway in both directions. Archer Ave. will also become an eastbound Busway from 150th St. to 160th St. Both Busways are part of a one-year pil..."
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
  "other_bucket_records": [
    {
      "record_id": "treatment_125th-features",
      "record_kind": "treatment_component",
      "display_name": "The route includes dedicated bus lanes, transit signal priority, off-board fare payment, limited stops, and low-floor, three-door articulated buses.",
      "source_ids": [
        "brt_route_index"
      ],
      "payload": {
        "treatment_kind": "sbs_features",
        "description": "dedicated bus lanes, transit signal priority, off-board fare payment, limited stops, and low-floor, three-door articulated buses on 125th-LaGuardia Airport SBS (M60)",
        "features": [
          "dedicated bus lanes",
          "transit signal priority",
          "off-board fare payment",
          "limited stops",
          "low-floor three-door articulated buses"
        ],
        "treatment_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "brt_route_index",
          "block_id": "p001_b0001",
          "page_number": 1,
          "role": "treatment_description",
          "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
        }
      ]
    },
    {
      "record_id": "treatment_bus-boarders",
      "record_kind": "treatment_component",
      "display_name": "Bus Boarders Treatment",
      "source_ids": [
        "bronx_bus_network_final_plan_2019"
      ],
      "payload": {
        "treatment_kind": "bus_priority",
        "component_kind": "bus_boarder",
        "description": "Bus bulbs are permanent sidewalk extensions at bus stops. NYCDOT also uses durable recycled plastic 'bus boarders' that serve the same purpose without capital construction.",
        "treatment_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "bronx_bus_network_final_plan_2019",
          "block_id": "p024_c0012",
          "page_number": 24,
          "role": "describes_treatment",
          "snippet": "Bus bulbs are permanent sidewalk extensions at bus stops that provide more space for waiting passengers and allow buses to pull up to the curb without leaving the travel lane, saving valuable seconds. Recently, NYCDOT b..."
        }
      ]
    },
    {
      "record_id": "treatment_bus-priority-types",
      "record_kind": "treatment_component",
      "display_name": "treatment_bus_priority_types",
      "source_ids": [
        "bronx_bus_network_final_plan_addendum_2021"
      ],
      "payload": {
        "treatment_kind": "bus_priority",
        "description": "Improvements include new bus lanes, transit signal priority (TSP), bus boarders, and curb management.",
        "treatment_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "bronx_bus_network_final_plan_addendum_2021",
          "block_id": "p005_c0002",
          "page_number": 5,
          "role": "treatment_description",
          "snippet": "NYC DOT analyzed 46 corridors in the Bronx and Manhattan and selected 10 of the highest-ranking corridors to implement a variety of bus priority treatments that speed up buses and allow the MTA to operate more frequent..."
        }
      ]
    },
    {
      "record_id": "treatment_bus-queue-jump-tsp",
      "record_kind": "treatment_component",
      "display_name": "Bus Queue Jump Lane and Transit Signal Priority Treatment",
      "source_ids": [
        "bronx_bus_network_final_plan_2019"
      ],
      "payload": {
        "treatment_kind": "bus_priority",
        "component_kind": "bus_queue_jump_and_tsp",
        "description": "Dedicated bus signal phases allow a bus to enter an intersection before regular traffic and bypass waiting queues. Often paired with bus lanes.",
        "treatment_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "bronx_bus_network_final_plan_2019",
          "block_id": "p024_c0015",
          "page_number": 24,
          "role": "describes_treatment",
          "snippet": "In addition to corridor-wide transit signal priority (TSP) treatments, dedicated bus signal phases are another way to use traffic signals to give buses priority through an intersection. These bus queue jump signals allo..."
        }
      ]
    },
    {
      "record_id": "treatment_new-bus-lanes",
      "record_kind": "treatment_component",
      "display_name": "New Bus Lanes Treatment",
      "source_ids": [
        "bronx_bus_network_final_plan_2019"
      ],
      "payload": {
        "treatment_kind": "bus_priority",
        "component_kind": "bus_lane",
        "description": "Bus lanes separate buses from general traffic, improving speed and reliability. Typically curb or offset located. Automated Bus Lane Enforcement (ABLE) cameras mounted on bus fronts capture evidence of vehicles blocking bus lanes.",
        "treatment_type": "new_bus_lane",
        "treatment_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "bronx_bus_network_final_plan_2019",
          "block_id": "p023_c0004",
          "page_number": 23,
          "role": "describes_treatment",
          "snippet": "New Bus Lanes"
        }
      ]
    },
    {
      "record_id": "treatment_protected-bus-lane_2",
      "record_kind": "treatment_component",
      "display_name": "Protected Bus Lane Treatment",
      "source_ids": [
        "bronx_bus_network_final_plan_2019"
      ],
      "payload": {
        "treatment_kind": "bus_priority",
        "component_kind": "protected_bus_lane",
        "description": "Using barriers to protect a bus lane makes it more difficult for vehicles other than buses to illegally use the lane.",
        "treatment_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "bronx_bus_network_final_plan_2019",
          "block_id": "p024_c0006",
          "page_number": 24,
          "role": "describes_treatment",
          "snippet": "Using barriers to protect a bus lane makes it more difficult for vehicles other than buses to illegally use the lane. This can improve the effectiveness of a bus lane where violations are rampant, but must be accompanie..."
        }
      ]
    },
    {
      "record_id": "treatment_reduced-busway-hours",
      "record_kind": "treatment_component",
      "display_name": "Proposed reduced Busway hours: 6 AM – 8 PM, 7 days/week",
      "source_ids": [
        "181st_street_jun2022"
      ],
      "payload": {
        "treatment_kind": "regulation_change",
        "description": "Reduce Busway hours based on community feedback. New regulations: 6 AM – 8 PM, 7-days/week. Move to make Busway pilot permanent.",
        "date_text": "proposed as of June 2022",
        "hours": "6 AM – 8 PM",
        "days": "7 days/week",
        "date_text_normalized": {
          "raw_text": "proposed as of June 2022",
          "normalized_date": "2022-06",
          "precision": "month",
          "confidence": "parsed_text"
        },
        "treatment_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "181st_street_jun2022",
          "block_id": "p018_c0003",
          "page_number": 18,
          "role": "stated",
          "snippet": "• Reduce Busway hours based on community feedback • New regulations: 6 AM – 8 PM, 7-days/week • Move to make Busway pilot permanent"
        }
      ]
    },
    {
      "record_id": "treatment_shelters-benches",
      "record_kind": "treatment_component",
      "display_name": "treatment_shelters_benches",
      "source_ids": [
        "m86_sbs_progress_report_2017"
      ],
      "payload": {
        "treatment_kind": "shelters_and_benches",
        "description": "Existing shelters updated with SBS branding. One bench added at westbound E 86 St & Fifth Avenue stop. Shelters to be added at Lexington and Third Avenues as part of bus bulb construction capital project.",
        "treatment_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "m86_sbs_progress_report_2017",
          "block_id": "p006_c0001",
          "page_number": 6,
          "role": "description",
          "snippet": "Shelters & Benches"
        }
      ]
    },
    {
      "record_id": "treatment_transit-freight-priority",
      "record_kind": "treatment_component",
      "display_name": "Transit and Freight Priority Street Treatment",
      "source_ids": [
        "bronx_bus_network_final_plan_2019"
      ],
      "payload": {
        "treatment_kind": "bus_priority",
        "component_kind": "transit_freight_priority_street",
        "description": "Provides dedicated space for buses and trucks to traverse a corridor while limiting other through traffic. May include curb regulation changes and turn restrictions.",
        "treatment_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "bronx_bus_network_final_plan_2019",
          "block_id": "p024_c0009",
          "page_number": 24,
          "role": "describes_treatment",
          "snippet": "A transit and freight priority street provides dedicated space for buses and trucks to traverse a corridor while limiting other through traffic. This type of treatment may include curb regulation changes and turn restri..."
        }
      ]
    },
    {
      "record_id": "treatment_upgraded-bus-lane",
      "record_kind": "treatment_component",
      "display_name": "Upgraded Bus Lane Treatment",
      "source_ids": [
        "bronx_bus_network_final_plan_2019"
      ],
      "payload": {
        "treatment_kind": "bus_priority",
        "component_kind": "bus_lane_upgrade",
        "description": "Extending hours of bus lane enforcement, painting bus lanes red, changing curbside lanes to offset lanes, and other measures.",
        "treatment_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "bronx_bus_network_final_plan_2019",
          "block_id": "p024_c0003",
          "page_number": 24,
          "role": "describes_treatment",
          "snippet": "NYCDOT monitors all bus lanes and will upgrade bus lanes when warranted to make them more effective. This could include extending hours of bus lane enforcement, painting bus lanes red to clearly delineate them from norm..."
        }
      ]
    }
  ]
}
```

### lifecycle-intervention-taxonomy:family:event.event_family

- Category: family_inventory
- Priority: 236
- Record kind: event
- Field: event_family
- Count: 210
- Title: Event family inventory
- Decision options: family_alias, canonical_value, bounded_normalizer, keep_other_passthrough, reject_mapping, needs_more_data, no_change

Reasons:
- Review event_family as a bounded runner-owned taxonomy derived from raw event_kind. Preserve raw literals.
- 15 records currently map to other; these are the expansion/review queue.

Examples:
```json
[
  {
    "value": "launch",
    "count": 48,
    "records": [
      "event_125th-laguardia-sbs-start",
      "event_14th-st-launch",
      "event_14th-st-sbs-start",
      "event_181st-st-launch"
    ],
    "representative_records": [
      {
        "record_id": "event_125th-laguardia-sbs-start",
        "record_kind": "event",
        "display_name": "Service launched on Memorial Day, May 25, 2014.",
        "source_ids": [
          "brt_route_index"
        ],
        "payload": {
          "event_kind": "service_launch",
          "date_text": "May 25, 2014",
          "description": "125th-LaGuardia Airport Select Bus Service (M60) launched",
          "date_text_normalized": {
            "raw_text": "May 25, 2014",
            "normalized_date": "2014-05-25",
            "precision": "day",
            "confidence": "parsed_text"
          },
          "event_family": "launch"
        },
        "evidence_examples": [
          {
            "source_id": "brt_route_index",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "launch_date",
            "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
          }
        ]
      },
      {
        "record_id": "event_14th-st-launch",
        "record_kind": "event",
        "display_name": "14th Street Busway launched",
        "source_ids": [
          "busways"
        ],
        "payload": {
          "event_kind": "launch",
          "date_text": "October 2019",
          "description": "Busway launched October 2019",
          "date_text_normalized": {
            "raw_text": "October 2019",
            "normalized_date": "2019-10",
            "precision": "month",
            "confidence": "parsed_text"
          },
          "event_family": "launch"
        },
        "evidence_examples": [
          {
            "source_id": "busways",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "launch_date",
            "snippet": "Busways Skip to main content NYC NYC Resources 311 Office of the Mayor Busways Busways are designed to improve bus speed and reliability to benefit the passengers who rely on transit to get around the city. Significant..."
          }
        ]
      },
      {
        "record_id": "event_14th-st-sbs-start",
        "record_kind": "event",
        "display_name": "Coinciding with the launch of Select Bus Service for the M14A and M14D buses and Manhattan in Summer 2019",
        "source_ids": [
          "brt_route_index"
        ],
        "payload": {
          "event_kind": "service_launch",
          "date_text": "Summer 2019",
          "description": "14th Street Select Bus Service (M14A/M14D) launch with Transit & Truck Priority Pilot Project",
          "date_text_normalized": {
            "raw_text": "Summer 2019",
            "normalized_date": "2019-summer",
            "precision": "season",
            "confidence": "parsed_text"
          },
          "event_family": "launch"
        },
        "evidence_examples": [
          {
            "source_id": "brt_route_index",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "launch_date",
            "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
          }
        ]
      }
    ]
  },
  {
    "value": "public_engagement",
    "count": 35,
    "records": [
      "event_addendum-outreach-fall-2024-winter-2025",
      "event_bus-rider-survey-20220418-22",
      "event_business-walkthrough-20220517",
      "event_cab-kickoff-20200707"
    ],
    "representative_records": [
      {
        "record_id": "event_addendum-outreach-fall-2024-winter-2025",
        "record_kind": "event",
        "display_name": "Addendum Outreach",
        "source_ids": [
          "queens_proposed_final_plan_addendum_2024"
        ],
        "payload": {
          "event_kind": "outreach",
          "date_text": "Fall 2024/Winter 2025",
          "description": "Addendum Outreach including website updates, Trip Planner tool, briefings, virtual town hall in early 2025",
          "date_text_normalized": {
            "raw_text": "Fall 2024/Winter 2025",
            "normalized_date": "2024-fall",
            "precision": "season",
            "confidence": "parsed_text"
          },
          "event_family": "public_engagement"
        },
        "evidence_examples": [
          {
            "source_id": "queens_proposed_final_plan_addendum_2024",
            "block_id": "p009_c0002",
            "page_number": 9,
            "role": "heading",
            "snippet": "Addendum Outreach"
          }
        ]
      },
      {
        "record_id": "event_bus-rider-survey-20220418-22",
        "record_kind": "event",
        "display_name": "On-street bus rider survey",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "event_kind": "survey",
          "event_date": "2022-04-18",
          "date_text": "April 18 – 22, 2022",
          "description": "On-street bus rider survey conducted by DOT",
          "event_date_normalized": {
            "raw_text": "2022-04-18",
            "normalized_date": "2022-04-18",
            "precision": "day",
            "confidence": "submitted_iso"
          },
          "date_text_normalized": {
            "raw_text": "April 18 – 22, 2022",
            "precision": "unknown",
            "confidence": "unparsed"
          },
          "event_family": "public_engagement"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "stated",
            "snippet": "1. CAB Kickoff Meeting – July 7, 2020 2. Meeting with Small Business Services (SBS) – July 2020 3. Meeting with Washington Heights BID – August 2020 4. Presented draft Busway plan 1. CAB Meeting #2 – September 3, 2020 2..."
          }
        ]
      },
      {
        "record_id": "event_business-walkthrough-20220517",
        "record_kind": "event",
        "display_name": "Door-to-door business walkthrough",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "event_kind": "outreach",
          "event_date": "2022-05-17",
          "date_text": "May 17, 2022",
          "description": "DOT, WHBID, and staff from CM De La Rosa's office went door-to-door to businesses on 181st St",
          "participants": [
            "NYC DOT",
            "WHBID",
            "CM De La Rosa's office"
          ],
          "event_date_normalized": {
            "raw_text": "2022-05-17",
            "normalized_date": "2022-05-17",
            "precision": "day",
            "confidence": "submitted_iso"
          },
          "date_text_normalized": {
            "raw_text": "May 17, 2022",
            "normalized_date": "2022-05-17",
            "precision": "day",
            "confidence": "parsed_text"
          },
          "event_family": "public_engagement"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "stated",
            "snippet": "1. CAB Kickoff Meeting – July 7, 2020 2. Meeting with Small Business Services (SBS) – July 2020 3. Meeting with Washington Heights BID – August 2020 4. Presented draft Busway plan 1. CAB Meeting #2 – September 3, 2020 2..."
          }
        ]
      }
    ]
  },
  {
    "value": "implementation",
    "count": 27,
    "records": [
      "event_2010-november-first-cameras",
      "event_34th-st-sbs-capital-start",
      "event_34th-st-sbs-offboard-fare-start",
      "event_ace-program-expansion-dec2025"
    ],
    "representative_records": [
      {
        "record_id": "event_2010-november-first-cameras",
        "record_kind": "event",
        "display_name": "First stationary cameras installed November 2010",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "event_kind": "implementation_start",
          "date_text": "November 2010",
          "year": 2010,
          "month": 11,
          "description": "Initiated implementation of stationary bus lane camera enforcement system",
          "date_text_normalized": {
            "raw_text": "November 2010",
            "normalized_date": "2010-11",
            "precision": "month",
            "confidence": "parsed_text"
          },
          "event_family": "implementation"
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p002_c0003",
            "page_number": 2,
            "role": "event_description",
            "snippet": "In the summer of 2010, New York City and the MTA were given legislative authority to begin operating camera-based bus lane enforcement. The authorizing legislation allowed camera-based enforcement only on Select Bus Ser..."
          }
        ]
      },
      {
        "record_id": "event_34th-st-sbs-capital-start",
        "record_kind": "event",
        "display_name": "capital improvements began in 2014",
        "source_ids": [
          "brt_route_index"
        ],
        "payload": {
          "event_kind": "capital_improvements_start",
          "date_text": "2014",
          "description": "Capital improvements began on 34th Street Select Bus Service",
          "date_text_normalized": {
            "raw_text": "2014",
            "normalized_date": "2014",
            "precision": "year",
            "confidence": "submitted_iso"
          },
          "event_family": "implementation"
        },
        "evidence_examples": [
          {
            "source_id": "brt_route_index",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "capital_improvement_date",
            "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
          }
        ]
      },
      {
        "record_id": "event_34th-st-sbs-offboard-fare-start",
        "record_kind": "event",
        "display_name": "Off-board fare payment along the route began in November 2011",
        "source_ids": [
          "brt_route_index"
        ],
        "payload": {
          "event_kind": "service_implementation",
          "date_text": "November 2011",
          "description": "Off-board fare payment began on 34th Street Select Bus Service",
          "date_text_normalized": {
            "raw_text": "November 2011",
            "normalized_date": "2011-11",
            "precision": "month",
            "confidence": "parsed_text"
          },
          "event_family": "implementation"
        },
        "evidence_examples": [
          {
            "source_id": "brt_route_index",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "launch_date",
            "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
          }
        ]
      }
    ]
  },
  {
    "value": "milestone",
    "count": 26,
    "records": [
      "event_168th-interim-terminal-opening",
      "event_2024-ace-transition",
      "event_betanyc-civic-innovator-award-2025",
      "event_board-vote-2024"
    ],
    "representative_records": [
      {
        "record_id": "event_168th-interim-terminal-opening",
        "record_kind": "event",
        "display_name": "168th St/Jamaica Interim Bus Terminal Opens",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "event_kind": "milestone",
          "event_name": "168th St/Jamaica Interim Bus Terminal Opens",
          "date_text": "June 1, 2025",
          "description": "Relocation of bus operations to new interim 168th Street Bus Terminal in Jamaica, Queens",
          "date_text_normalized": {
            "raw_text": "June 1, 2025",
            "normalized_date": "2025-06-01",
            "precision": "day",
            "confidence": "parsed_text"
          },
          "event_family": "milestone"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p010_c0011",
            "page_number": 10,
            "role": "description",
            "snippet": "This month the MTA officially relocated bus operations to the new interim 168th Street Bus Terminal in Jamaica, Queens, effective Sunday, June 1, 2025. This move temporarily replaces the 165th Street Bus Terminal, which..."
          }
        ]
      },
      {
        "record_id": "event_2024-ace-transition",
        "record_kind": "event",
        "display_name": "ACE program goes into effect 2024",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "event_kind": "program_transition",
          "date_text": "2024",
          "year": 2024,
          "description": "MTA transitioned from ABLE to ACE program, issuing additional violations for vehicles parking in bus stops and double parking along bus routes. Enforcement began after 60-day warning period in summer 2024.",
          "date_text_normalized": {
            "raw_text": "2024",
            "normalized_date": "2024",
            "precision": "year",
            "confidence": "submitted_iso"
          },
          "event_family": "milestone"
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p003_c0002",
            "page_number": 3,
            "role": "event_description",
            "snippet": "In 2024 expanded legislative authority went into effect, and MTA transitioned from the ABLE program to the Automated Camera Enforcement (ACE) program which issues additional violations for vehicles parking in bus stops..."
          }
        ]
      },
      {
        "record_id": "event_betanyc-civic-innovator-award-2025",
        "record_kind": "event",
        "display_name": "MTA Open Data Team awarded BetaNYC Civic Innovator Award",
        "source_ids": [
          "open_data_plan_2026_update"
        ],
        "payload": {
          "event_kind": "award",
          "date_text": "2025",
          "year": 2025,
          "description": "MTA Open Data Team awarded BetaNYC's inaugural Civic Innovator Award",
          "date_text_normalized": {
            "raw_text": "2025",
            "normalized_date": "2025",
            "precision": "year",
            "confidence": "submitted_iso"
          },
          "event_family": "milestone"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2026_update",
            "block_id": "p004_c0001",
            "page_number": 4,
            "role": "event_described",
            "snippet": "Finally, the MTA Open Data Team was awarded BetaNYC's inaugural Civic Innovator Award. This award recognizes organizations, teams, and community groups that are making NYC more open, accessible, and equitable through op..."
          }
        ]
      }
    ]
  },
  {
    "value": "publication",
    "count": 21,
    "records": [
      "event_addendum-published-2024",
      "event_article-published-2026-03-10",
      "event_blog-curious-customers-2026",
      "event_blog-lessons-learned-2026"
    ],
    "representative_records": [
      {
        "record_id": "event_addendum-published-2024",
        "record_kind": "event",
        "display_name": "Developed/Published Addendum",
        "source_ids": [
          "queens_proposed_final_plan_addendum_2024"
        ],
        "payload": {
          "event_kind": "publication",
          "date_text": "Summer 2024 - December 2024",
          "description": "Developed / Published Addendum",
          "date_text_normalized": {
            "raw_text": "Summer 2024 - December 2024",
            "normalized_date": "2024-summer",
            "precision": "season",
            "confidence": "parsed_text"
          },
          "event_family": "publication"
        },
        "evidence_examples": [
          {
            "source_id": "queens_proposed_final_plan_addendum_2024",
            "block_id": "p003_c0011",
            "page_number": 3,
            "role": "event",
            "snippet": "Developed / Published Addendum Summer 2024 - December 2024"
          }
        ]
      },
      {
        "record_id": "event_article-published-2026-03-10",
        "record_kind": "event",
        "display_name": "Article Published March 10, 2026",
        "source_ids": [
          "open_data_lessons_2026"
        ],
        "payload": {
          "event_kind": "publication_date",
          "date_text": "March 10, 2026",
          "description": "Lessons learned blog post published by MTA",
          "date_text_normalized": {
            "raw_text": "March 10, 2026",
            "normalized_date": "2026-03-10",
            "precision": "day",
            "confidence": "parsed_text"
          },
          "event_family": "publication"
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
      },
      {
        "record_id": "event_blog-curious-customers-2026",
        "record_kind": "event",
        "display_name": "Blog post: Curious customers, cool tools, and open data",
        "source_ids": [
          "open_data_program"
        ],
        "payload": {
          "event_kind": "blog_post",
          "date_text": "April 23, 2026 1:00 pm",
          "date": "2026-04-23",
          "description": "MTA Data & Analytics blog post: Curious customers, cool tools, and open data",
          "date_text_normalized": {
            "raw_text": "April 23, 2026 1:00 pm",
            "normalized_date": "2026-04-23",
            "precision": "day",
            "confidence": "parsed_text"
          },
          "date_normalized": {
            "raw_text": "2026-04-23",
            "normalized_date": "2026-04-23",
            "precision": "day",
            "confidence": "submitted_iso"
          },
          "event_family": "publication"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_program",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "supports",
            "snippet": "MTA Open Data Program Skip to main content Menu Close Menu Schedules Maps Fares and tolls Planned Service Changes Travel Back Elevator & Escalator Status Accessibility Sign up for service alerts Guides Access-A-Ride Par..."
          }
        ]
      }
    ]
  },
  {
    "value": "other",
    "count": 15,
    "records": [
      "event_ace-page-update-2026",
      "event_budget-press-tour-2024",
      "event_bx6-sbs-2023-delay",
      "event_community-advisory-board"
    ],
    "representative_records": [
      {
        "record_id": "event_ace-page-update-2026",
        "record_kind": "event",
        "display_name": "ACE page updated May 15, 2026",
        "source_ids": [
          "mta_automated_camera_enforcement"
        ],
        "payload": {
          "event_kind": "page update",
          "date_text": "May 15, 2026",
          "date": "2026-05-15",
          "description": "Automated Camera Enforcement webpage updated",
          "date_text_normalized": {
            "raw_text": "May 15, 2026",
            "normalized_date": "2026-05-15",
            "precision": "day",
            "confidence": "parsed_text"
          },
          "date_normalized": {
            "raw_text": "2026-05-15",
            "normalized_date": "2026-05-15",
            "precision": "day",
            "confidence": "submitted_iso"
          },
          "event_family": "other"
        },
        "evidence_examples": [
          {
            "source_id": "mta_automated_camera_enforcement",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "states page update date",
            "snippet": "Automated Camera Enforcement Skip to main content Menu Close Menu Schedules Maps Fares and tolls Planned Service Changes Travel Back Elevator & Escalator Status Accessibility Sign up for service alerts Guides Access-A-R..."
          }
        ]
      },
      {
        "record_id": "event_budget-press-tour-2024",
        "record_kind": "event",
        "display_name": "event_budget_press_tour_2024",
        "source_ids": [
          "open_data_plan_2025_update"
        ],
        "payload": {
          "event_kind": "public engagement",
          "event_name": "Budget Press Tour",
          "date_text": "2024",
          "description": "Series of public-facing events with live demonstrations showing users how to use the operating budget datasets and explaining how they were built",
          "date_text_normalized": {
            "raw_text": "2024",
            "normalized_date": "2024",
            "precision": "year",
            "confidence": "submitted_iso"
          },
          "event_family": "other"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2025_update",
            "block_id": "p004_c0004",
            "page_number": 4,
            "role": "description",
            "snippet": "The operating budget is available in three datasets: Statement of Operations, Subsidies, and Headcount. This data release was accompanied by public engagement efforts, including a series of public-facing events we dubbe..."
          }
        ]
      },
      {
        "record_id": "event_bx6-sbs-2023-delay",
        "record_kind": "event",
        "display_name": "event_bx6_sbs_2023_delay",
        "source_ids": [
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "event_kind": "postponement",
          "date_text": "until 2023",
          "description": "Bx6 SBS implementation delayed until 2023 to coincide with MetroCard retirement and OMNY full deployment.",
          "date_text_normalized": {
            "raw_text": "until 2023",
            "precision": "unknown",
            "confidence": "unparsed"
          },
          "event_family": "other"
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_addendum_2021",
            "block_id": "p003_c0004",
            "page_number": 3,
            "role": "event_description",
            "snippet": "• Due to the 18-month pause caused by the COVID-19 pandemic, Bx6 SBS implementation has been delayed until 2023 to coincide with the retirement of the MetroCard and the full deployment of OMNY across the city. Also, all..."
          }
        ]
      }
    ]
  },
  {
    "value": "construction",
    "count": 8,
    "records": [
      "event_bus-platform-installation",
      "event_construction-already-begun-segment",
      "event_construction-completion-target",
      "event_groundbreaking-announcement"
    ],
    "representative_records": [
      {
        "record_id": "event_bus-platform-installation",
        "record_kind": "event",
        "display_name": "event_bus_platform_installation",
        "source_ids": [
          "14th_street_fall2019_monitoring"
        ],
        "payload": {
          "event_kind": "construction",
          "date_text": "November-December 2019",
          "description": "14th Street bus boarding platform installation",
          "date_text_normalized": {
            "raw_text": "November-December 2019",
            "normalized_date": "2019-12",
            "precision": "month",
            "confidence": "parsed_text"
          },
          "event_family": "construction"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_fall2019_monitoring",
            "block_id": "p003_c0017",
            "page_number": 3,
            "role": "description",
            "snippet": "➔ TTP Pilot Project implemented on Thursday, October 3 ➔ Since April 2019, L Train has operated with reduced service between Manhattan and Brooklyn, after 8pm on weekdays and all day on weekends ➔ October-November 2019:..."
          }
        ]
      },
      {
        "record_id": "event_construction-already-begun-segment",
        "record_kind": "event",
        "display_name": "event_construction_already_begun_segment",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "event_kind": "construction_start",
          "description": "Construction has already begun on East 163rd Street between Intervale Avenue and Tiffany Street",
          "event_family": "construction"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "construction_start_description",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      },
      {
        "record_id": "event_construction-completion-target",
        "record_kind": "event",
        "display_name": "event_construction_completion_target",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "event_kind": "construction_completion_target",
          "date_text": "2028",
          "description": "Construction is expected to continue through 2028",
          "date_text_normalized": {
            "raw_text": "2028",
            "normalized_date": "2028",
            "precision": "year",
            "confidence": "submitted_iso"
          },
          "event_family": "construction"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "completion_date",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      }
    ]
  },
  {
    "value": "data_release",
    "count": 8,
    "records": [
      "event_20-year-needs-assessment-datasets-release",
      "event_congestion-pricing-data-planned",
      "event_gtfs-rt-service-alerts-release-2024",
      "event_hourly-subway-bus-ridership-release"
    ],
    "representative_records": [
      {
        "record_id": "event_20-year-needs-assessment-datasets-release",
        "record_kind": "event",
        "display_name": "20-Year Needs Assessment datasets published in 2023",
        "source_ids": [
          "open_data_plan_2024_update"
        ],
        "payload": {
          "event_kind": "dataset_release",
          "year": 2023,
          "date_text": "2023",
          "description": "Publication of five open datasets in conjunction with the MTA's 20-Year Needs Assessment, including asset condition data and Comparative Evaluation dataset",
          "date_text_normalized": {
            "raw_text": "2023",
            "normalized_date": "2023",
            "precision": "year",
            "confidence": "submitted_iso"
          },
          "event_family": "data_release"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2024_update",
            "block_id": "p003_c0006",
            "page_number": 3,
            "role": "event_description",
            "snippet": "The MTA public five open datasets in conjunction with the release of the MTA's 20-Year Needs Assessment, a comprehensive blueprint that outlines the agency's long-term capital needs. This is the first time the MTA has p..."
          }
        ]
      },
      {
        "record_id": "event_congestion-pricing-data-planned",
        "record_kind": "event",
        "display_name": "Congestion Pricing Data releases planned for 2024",
        "source_ids": [
          "open_data_plan_2024_update"
        ],
        "payload": {
          "event_kind": "planned_dataset_release",
          "year": 2024,
          "date_text": "2024",
          "description": "Planned publication of Congestion Pricing program data including toll crossings, revenue generated, and vehicle speeds, on a rolling basis",
          "date_text_normalized": {
            "raw_text": "2024",
            "normalized_date": "2024",
            "precision": "year",
            "confidence": "submitted_iso"
          },
          "event_family": "data_release"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2024_update",
            "block_id": "p006_c0007",
            "page_number": 6,
            "role": "event_description",
            "snippet": "Beginning with the launch of the Congestion Pricing program, which will charge drivers a toll for entering Manhattan below 60 Street, the MTA will begin publishing data related to program implementation. Datasets will b..."
          }
        ]
      },
      {
        "record_id": "event_gtfs-rt-service-alerts-release-2024",
        "record_kind": "event",
        "display_name": "event_gtfs_rt_service_alerts_release_2024",
        "source_ids": [
          "open_data_plan_2025_update"
        ],
        "payload": {
          "event_kind": "data release",
          "event_name": "GTFS real-time Service Alerts dataset release",
          "date_text": "2024",
          "description": "Published an archive of GTFS real-time data with the Service Alerts dataset, providing a historical record of service disruptions, planned work, and other incidents",
          "date_text_normalized": {
            "raw_text": "2024",
            "normalized_date": "2024",
            "precision": "year",
            "confidence": "submitted_iso"
          },
          "event_family": "data_release"
        },
        "evidence_examples": [
          {
            "source_id": "open_data_plan_2025_update",
            "block_id": "p004_c0005",
            "page_number": 4,
            "role": "description",
            "snippet": "Shortly after the release of the operating budget open datasets, we published an archive of GTFS real-time data with the Service Alerts dataset. This dataset provides a historical record of service disruptions, planned..."
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
  "other_bucket_records": [
    {
      "record_id": "event_ace-page-update-2026",
      "record_kind": "event",
      "display_name": "ACE page updated May 15, 2026",
      "source_ids": [
        "mta_automated_camera_enforcement"
      ],
      "payload": {
        "event_kind": "page update",
        "date_text": "May 15, 2026",
        "date": "2026-05-15",
        "description": "Automated Camera Enforcement webpage updated",
        "date_text_normalized": {
          "raw_text": "May 15, 2026",
          "normalized_date": "2026-05-15",
          "precision": "day",
          "confidence": "parsed_text"
        },
        "date_normalized": {
          "raw_text": "2026-05-15",
          "normalized_date": "2026-05-15",
          "precision": "day",
          "confidence": "submitted_iso"
        },
        "event_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "mta_automated_camera_enforcement",
          "block_id": "p001_b0001",
          "page_number": 1,
          "role": "states page update date",
          "snippet": "Automated Camera Enforcement Skip to main content Menu Close Menu Schedules Maps Fares and tolls Planned Service Changes Travel Back Elevator & Escalator Status Accessibility Sign up for service alerts Guides Access-A-R..."
        }
      ]
    },
    {
      "record_id": "event_budget-press-tour-2024",
      "record_kind": "event",
      "display_name": "event_budget_press_tour_2024",
      "source_ids": [
        "open_data_plan_2025_update"
      ],
      "payload": {
        "event_kind": "public engagement",
        "event_name": "Budget Press Tour",
        "date_text": "2024",
        "description": "Series of public-facing events with live demonstrations showing users how to use the operating budget datasets and explaining how they were built",
        "date_text_normalized": {
          "raw_text": "2024",
          "normalized_date": "2024",
          "precision": "year",
          "confidence": "submitted_iso"
        },
        "event_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "open_data_plan_2025_update",
          "block_id": "p004_c0004",
          "page_number": 4,
          "role": "description",
          "snippet": "The operating budget is available in three datasets: Statement of Operations, Subsidies, and Headcount. This data release was accompanied by public engagement efforts, including a series of public-facing events we dubbe..."
        }
      ]
    },
    {
      "record_id": "event_bx6-sbs-2023-delay",
      "record_kind": "event",
      "display_name": "event_bx6_sbs_2023_delay",
      "source_ids": [
        "bronx_bus_network_final_plan_addendum_2021"
      ],
      "payload": {
        "event_kind": "postponement",
        "date_text": "until 2023",
        "description": "Bx6 SBS implementation delayed until 2023 to coincide with MetroCard retirement and OMNY full deployment.",
        "date_text_normalized": {
          "raw_text": "until 2023",
          "precision": "unknown",
          "confidence": "unparsed"
        },
        "event_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "bronx_bus_network_final_plan_addendum_2021",
          "block_id": "p003_c0004",
          "page_number": 3,
          "role": "event_description",
          "snippet": "• Due to the 18-month pause caused by the COVID-19 pandemic, Bx6 SBS implementation has been delayed until 2023 to coincide with the retirement of the MetroCard and the full deployment of OMNY across the city. Also, all..."
        }
      ]
    },
    {
      "record_id": "event_community-advisory-board",
      "record_kind": "event",
      "display_name": "Community Advisory Board for Jay Street Busway Pilot",
      "source_ids": [
        "jay_street_pilot_overview"
      ],
      "payload": {
        "event_kind": "community_engagement",
        "description": "Community Advisory Board will guide the pilot during and after implementation",
        "event_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "jay_street_pilot_overview",
          "block_id": "p002_c0016",
          "page_number": 2,
          "role": "contains",
          "snippet": "• DOT is committed to public engagement throughout this one year pilot • A Community Advisory Board will guide the pilot during and after implementation"
        }
      ]
    },
    {
      "record_id": "event_customer-ambassador-program",
      "record_kind": "event",
      "display_name": "event_customer_ambassador_program",
      "source_ids": [
        "m86_sbs_progress_report_2017"
      ],
      "payload": {
        "event_kind": "ambassador_program",
        "date_text": "July 2015",
        "description": "Customer ambassador program covering two shifts (6 am-1 pm and 1 pm-8 pm) over two weeks. Ambassadors also deployed September 8-11 for back-to-school.",
        "date_text_normalized": {
          "raw_text": "July 2015",
          "normalized_date": "2015-07",
          "precision": "month",
          "confidence": "parsed_text"
        },
        "event_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "m86_sbs_progress_report_2017",
          "block_id": "p006_c0006",
          "page_number": 6,
          "role": "description",
          "snippet": "system and all-door boarding procedures. The customer ambassador program covered two shifts—6:00 am- 1:00 pm and 1:00 pm- 8:00 pm—over the course of two weeks. Ambassadors were also deployed at select stops the followin..."
        }
      ]
    },
    {
      "record_id": "event_fare-collection-resumed",
      "record_kind": "event",
      "display_name": "Fare Collection Resumed",
      "source_ids": [
        "fare_free_bus_pilot_evaluation"
      ],
      "payload": {
        "event_kind": "pilot_end",
        "date_text": "September 1, 2024",
        "date": "2024-09-01",
        "description": "Fare collection resumed on pilot routes",
        "date_text_normalized": {
          "raw_text": "September 1, 2024",
          "normalized_date": "2024-09-01",
          "precision": "day",
          "confidence": "parsed_text"
        },
        "date_normalized": {
          "raw_text": "2024-09-01",
          "normalized_date": "2024-09-01",
          "precision": "day",
          "confidence": "submitted_iso"
        },
        "event_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "fare_free_bus_pilot_evaluation",
          "block_id": "p002_c0005",
          "page_number": 2,
          "role": "end_date",
          "snippet": "The pilot began September 24, 2023, and fare collection resumed on September 1, 2024."
        }
      ]
    },
    {
      "record_id": "event_marathon-weekend-nov2025",
      "record_kind": "event",
      "display_name": "TCS NYC Marathon Weekend November 1-2, 2025",
      "source_ids": [
        "nyct_key_performance_metrics_doc194001"
      ],
      "payload": {
        "event_kind": "special_event",
        "event_date": "November 1-2, 2025",
        "description": "TCS NYC Marathon weekend produced record-setting subway ridership",
        "event_date_normalized": {
          "raw_text": "November 1-2, 2025",
          "precision": "unknown",
          "confidence": "unparsed"
        },
        "event_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "nyct_key_performance_metrics_doc194001",
          "block_id": "p015_c0005",
          "page_number": 15,
          "role": "marathon_ridership",
          "snippet": "Weekend ridership was led by the record-setting numbers of Marathon weekend on November 1st and 2nd, when we hit 3.10 million and 2.83 million respectively. For the full month, average Saturdays came in at 2.85 million..."
        }
      ]
    },
    {
      "record_id": "event_open-data-challenge-fall2024",
      "record_kind": "event",
      "display_name": "event_open_data_challenge_fall2024",
      "source_ids": [
        "open_data_plan_2025_update"
      ],
      "payload": {
        "event_kind": "competition",
        "event_name": "MTA Open Data Challenge",
        "date_text": "fall 2024",
        "description": "MTA's first Open Data Challenge launched in fall 2024. Stakeholders from across the country were invited to build a product using MTA open data. Over 100 submissions received.",
        "date_text_normalized": {
          "raw_text": "fall 2024",
          "normalized_date": "2024-fall",
          "precision": "season",
          "confidence": "parsed_text"
        },
        "event_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "open_data_plan_2025_update",
          "block_id": "p005_c0004",
          "page_number": 5,
          "role": "description",
          "snippet": "In fall 2024, we launched the MTA's first Open Data Challenge and called on all interested stakeholders from across the country to build a product, such as a web app, data visualization, written report, map, or even a p..."
        }
      ]
    },
    {
      "record_id": "event_open-data-steering-committee-creation-2024",
      "record_kind": "event",
      "display_name": "event_open_data_steering_committee_creation_2024",
      "source_ids": [
        "open_data_plan_2025_update"
      ],
      "payload": {
        "event_kind": "creation",
        "event_name": "Open Data Steering Committee creation",
        "date_text": "2024",
        "description": "Created the Open Data Steering Committee to facilitate internal decision-making on open data releases",
        "date_text_normalized": {
          "raw_text": "2024",
          "normalized_date": "2024",
          "precision": "year",
          "confidence": "submitted_iso"
        },
        "event_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "open_data_plan_2025_update",
          "block_id": "p006_c0002",
          "page_number": 6,
          "role": "description",
          "snippet": "In 2024, we created the Open Data Steering Committee, marking a major shift in how we facilitate internal decision-making on open data releases. The Committee suggests and approves high-level, priority subject areas for..."
        }
      ]
    },
    {
      "record_id": "event_panynj-announcement-2025-03-25",
      "record_kind": "event",
      "display_name": "event_panynj_announcement_2025_03_25",
      "source_ids": [
        "q70_fare_free_service_increases_2025"
      ],
      "payload": {
        "event_kind": "announcement",
        "date_text": "March 25, 2025",
        "event_date": "2025-03-25",
        "description": "PANYNJ announcement to advance 2023 recommendations of Independent Panel of Transit Experts to improve transit access to LaGuardia Airport",
        "date_text_normalized": {
          "raw_text": "March 25, 2025",
          "normalized_date": "2025-03-25",
          "precision": "day",
          "confidence": "parsed_text"
        },
        "event_date_normalized": {
          "raw_text": "2025-03-25",
          "normalized_date": "2025-03-25",
          "precision": "day",
          "confidence": "submitted_iso"
        },
        "event_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "q70_fare_free_service_increases_2025",
          "block_id": "p003_c0004",
          "page_number": 3,
          "role": "states_announcement",
          "snippet": "These service increases coincide with peak seasonal summer ridership, and the PANYNJ's announcement on March 25, 2025 to advance the 2023 recommendations of their Independent Panel of Transit Experts to improve transit..."
        }
      ]
    },
    {
      "record_id": "event_r-ladies-event-nov2022",
      "record_kind": "event",
      "display_name": "MTA spoke at R-Ladies public event",
      "source_ids": [
        "open_data_plan_2023_update"
      ],
      "payload": {
        "event_kind": "public_engagement",
        "date_text": "November 2022",
        "description": "MTA spoke at a public event with R-Ladies, an organization dedicated to promoting gender diversity in data science.",
        "date_text_normalized": {
          "raw_text": "November 2022",
          "normalized_date": "2022-11",
          "precision": "month",
          "confidence": "parsed_text"
        },
        "event_family": "other"
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
      "record_id": "event_report-card-data-period",
      "record_kind": "event",
      "display_name": "Report Card Data Collection Period June 2024 - June 2025",
      "source_ids": [
        "life_in_slow_lane_2025"
      ],
      "payload": {
        "event_kind": "data_collection",
        "date_text": "June 17, 2024 to June 20, 2025",
        "description": "Data collection period for the Life in the Slow Lane report card. Bus Time feed data (June 17, 2024 - June 12, 2025) and speed data (June 1, 2024 - June 20, 2025).",
        "date_text_normalized": {
          "raw_text": "June 17, 2024 to June 20, 2025",
          "normalized_date": "2024-06-17",
          "precision": "day",
          "confidence": "parsed_text"
        },
        "event_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "life_in_slow_lane_2025",
          "block_id": "p007_c0003",
          "page_number": 7,
          "snippet": "This report card used live data from MTA’s Bus Time feed collected between June 17, 2024 and June 12, 2025, archived at five-minute intervals, to calculate on-time performance and bus bunching metrics. This data reports..."
        }
      ]
    }
  ]
}
```

### lifecycle-intervention-taxonomy:raw-field:project.status

- Category: raw_lifecycle_field
- Priority: 222
- Record kind: project
- Field: status
- Count: 102
- Title: project.status raw literals feed document_time_status
- Decision options: bounded_normalizer, canonical_value, keep_other_passthrough, reject_mapping, needs_more_data, no_change

Reasons:
- status: canonical=102, distinct=32, class=free_text.
- Review bounded mapping rules without replacing source literals; uncertain values stay raw and map to other.

Examples:
```json
[
  {
    "value": "proposed_2019"
  },
  {
    "value": "completed"
  },
  {
    "value": "proposed"
  },
  {
    "value": "study"
  },
  {
    "value": "active"
  },
  {
    "value": "ongoing"
  },
  {
    "value": "operational"
  },
  {
    "value": "stalled, resuming"
  }
]
```

Data:
```json
{
  "bounded_taxonomy_policy": {
    "taxonomy_mode": "bounded_normalizer_with_other_passthrough",
    "decision_rule": "Add or remap a family value only when representative raw literals share the same lifecycle/intervention meaning. Otherwise preserve the raw literal and keep the runner-owned family as other.",
    "closed_universe_guard": "The family field is closed for first-pass grouping, but raw source fields remain pass-through so novel or uncertain source language is not rejected."
  }
}
```

### lifecycle-intervention-taxonomy:raw-field:project.project_type

- Category: raw_lifecycle_field
- Priority: 206
- Record kind: project
- Field: project_type
- Count: 86
- Title: project.project_type raw literals feed project_family
- Decision options: bounded_normalizer, canonical_value, keep_other_passthrough, reject_mapping, needs_more_data, no_change

Reasons:
- project_type: canonical=86, distinct=62, class=free_text.
- Review bounded mapping rules without replacing source literals; uncertain values stay raw and map to other.

Examples:
```json
[
  {
    "value": "new_bus_lane"
  },
  {
    "value": "busway"
  },
  {
    "value": "bus_lane_upgrade"
  },
  {
    "value": "enforcement_program"
  },
  {
    "value": "report"
  },
  {
    "value": "bike lane"
  },
  {
    "value": "bus lane"
  },
  {
    "value": "legislation"
  }
]
```

Data:
```json
{
  "bounded_taxonomy_policy": {
    "taxonomy_mode": "bounded_normalizer_with_other_passthrough",
    "decision_rule": "Add or remap a family value only when representative raw literals share the same lifecycle/intervention meaning. Otherwise preserve the raw literal and keep the runner-owned family as other.",
    "closed_universe_guard": "The family field is closed for first-pass grouping, but raw source fields remain pass-through so novel or uncertain source language is not rejected."
  }
}
```

### lifecycle-intervention-taxonomy:family:project.project_family

- Category: family_inventory
- Priority: 203
- Record kind: project
- Field: project_family
- Count: 86
- Title: Project family inventory
- Decision options: family_alias, canonical_value, bounded_normalizer, keep_other_passthrough, reject_mapping, needs_more_data, no_change

Reasons:
- Review project_family as a bounded runner-owned taxonomy derived from raw project_type. Preserve raw literals.
- 3 records currently map to other; these are the expansion/review queue.

Examples:
```json
[
  {
    "value": "bus_lane",
    "count": 18,
    "records": [
      "project_01-lexington-ave",
      "project_02-fdr-dr",
      "project_03-madison-ave",
      "project_04-allen-st"
    ],
    "representative_records": [
      {
        "record_id": "project_01-lexington-ave",
        "record_kind": "project",
        "display_name": "project_01_lexington_ave",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Lexington Ave",
          "name": "Lexington Ave, 96th St to 60th St",
          "project_type": "bus_lane_upgrade",
          "status": "proposed_2019",
          "description": "Upgrade existing curbside bus lane to offset bus lane with curb management and bus boarders on Lexington Ave from 96th St to 60th St",
          "corridor_length_miles": 1.8,
          "daily_ridership": 44000,
          "routes_served": [
            "M98",
            "M101",
            "M102",
            "M103"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p024_c0001",
            "page_number": 24,
            "snippet": "01 Lexington Ave, 96th St to 60th St"
          }
        ]
      },
      {
        "record_id": "project_02-fdr-dr",
        "record_kind": "project",
        "display_name": "project_02_fdr_dr",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "FDR Dr",
          "name": "FDR Dr, Brooklyn Bridge to Battery Park",
          "project_type": "new_bus_lane",
          "status": "proposed_2019",
          "description": "Allow buses to use southbound shoulder as bus lane during peak hours for Staten Island-bound express buses",
          "corridor_length_miles": 0.7,
          "daily_ridership": 7000,
          "routes_served": [
            "SIM3",
            "SIM6",
            "SIM10",
            "SIM11",
            "SIM31"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p025_c0001",
            "page_number": 25,
            "snippet": "02 FDR Dr, Brooklyn Bridge to Battery Park"
          }
        ]
      },
      {
        "record_id": "project_03-madison-ave",
        "record_kind": "project",
        "display_name": "project_03_madison_ave",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Madison Ave",
          "name": "Madison Ave, 60th St to 42nd St",
          "project_type": "bus_lane_upgrade",
          "status": "proposed_2019",
          "description": "Upgrade existing double bus lanes to red-painted bus lanes with updated signage",
          "corridor_length_miles": 0.9,
          "daily_ridership": 68000,
          "routes_served": [
            "M1",
            "M2",
            "M3",
            "M4",
            "Q32",
            "SIM4c",
            "SIM6",
            "SIM8",
            "SIM8x",
            "SIM11",
            "SIM22",
            "SIM25",
            "SIM26",
            "SIM30",
            "SIM31",
            "SIM33c"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p026_c0001",
            "page_number": 26,
            "snippet": "03 Madison Ave, 60th St to 42nd St"
          }
        ]
      }
    ]
  },
  {
    "value": "accessibility_or_safety",
    "count": 7,
    "records": [
      "project_09-baychester-ave",
      "project_16-union-turnpike",
      "project_19-pennsylvania-ave",
      "project_24-narrows-rd"
    ],
    "representative_records": [
      {
        "record_id": "project_09-baychester-ave",
        "record_kind": "project",
        "display_name": "project_09_baychester_ave",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Baychester Ave",
          "name": "Baychester Ave at Bay Plaza",
          "project_type": "bus_stop_accessibility",
          "status": "proposed_2019",
          "description": "Construct sidewalk to bus stop, install pedestrian signals, high-visibility crosswalks, and upgrade pedestrian ramps",
          "corridor_length_miles": 1.8,
          "daily_ridership": 56000,
          "routes_served": [
            "Bx12 SBS",
            "Bx12",
            "Bx5"
          ],
          "document_time_status": "planned",
          "project_family": "accessibility_or_safety"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p032_c0001",
            "page_number": 32,
            "snippet": "09 Baychester Ave at Bay Plaza"
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
    "value": "busway",
    "count": 7,
    "records": [
      "project_14th-street-busway-permanent",
      "project_181st-street-busway",
      "project_34th-street-busway",
      "project_jamaica-archer-busway-pilot"
    ],
    "representative_records": [
      {
        "record_id": "project_14th-street-busway-permanent",
        "record_kind": "project",
        "display_name": "14th Street Busway - permanent extension",
        "source_ids": [
          "14th_street_busway",
          "behind_schedule_2025",
          "speeding_up_slowly_2025"
        ],
        "payload": {
          "project_name": "14th Street Busway",
          "project_type": "busway",
          "status": "permanent",
          "description": "Permanent busway on Manhattan's 14th Street between 3rd Avenue and 9th Avenue, made permanent in June 2020 after a successful pilot",
          "document_time_status": "implemented",
          "project_family": "busway",
          "_merged_field_values": {
            "status": [
              "permanent",
              "extended and made permanent"
            ],
            "description": [
              "Permanent busway on Manhattan's 14th Street between 3rd Avenue and 9th Avenue, made permanent in June 2020 after a successful pilot",
              "Better Buses Restart extended and made permanent the 14th Street Busway. Travel speeds increased up to 47% after installation in 2019, making trips 10 minutes faster.",
              "A bus-only street in Lower Manhattan, from 6 a.m. to 10 p.m., only trucks and buses are allowed to travel through the corridor. Started as a pilot in 2019, later made permanent."
            ]
          },
          "location": "14th Street, Manhattan",
          "location_normalized": {
            "raw_text": "14th Street, Manhattan",
            "street": "14th Street"
          },
          "borough": "Manhattan",
          "borough_normalized": "manhattan"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_busway",
            "block_id": "p001_b0001",
            "page_number": 1,
            "snippet": "Bus Rapid Transit - 14th Street Select Bus Service with Transit & Truck Priority Pilot Project Skip to main content NYC NYC Resources 311 Office of the Mayor Routes 14th Street Busway How to Use 14th Street | Background..."
          }
        ]
      },
      {
        "record_id": "project_181st-street-busway",
        "record_kind": "project",
        "display_name": "181st Street Busway",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "project_name": "181st Street Busway",
          "project_type": "busway",
          "description": "Bus priority corridor on 181st Street, launched April 26, 2021. Proposed to be made permanent with reduced hours of 6 AM – 8 PM, 7 days/week based on community feedback.",
          "status": "pilot (proposed permanent)",
          "launch_date": "2021-04-26",
          "launch_date_normalized": {
            "raw_text": "2021-04-26",
            "normalized_date": "2021-04-26",
            "precision": "day",
            "confidence": "submitted_iso"
          },
          "document_time_status": "pilot",
          "project_family": "busway"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p005_c0002",
            "page_number": 5,
            "role": "stated",
            "snippet": "Busway Launched April 26, 2021"
          }
        ]
      },
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
      }
    ]
  },
  {
    "value": "capital_or_infrastructure",
    "count": 7,
    "records": [
      "project_customer-service-center-network",
      "project_jamaica-bus-depot-rebuild",
      "project_m86-sbs-pedestrian-safety-capital",
      "project_pedestrian-safety-neckdowns-bus-bulbs"
    ],
    "representative_records": [
      {
        "record_id": "project_customer-service-center-network",
        "record_kind": "project",
        "display_name": "Customer Service Center (CSC) Network",
        "source_ids": [
          "nyct_key_performance_metrics_doc194001"
        ],
        "payload": {
          "project_name": "Customer Service Center Network",
          "project_type": "customer_service_infrastructure",
          "status": "ongoing",
          "csc_total_open": 21,
          "csc_planned_additional": 9,
          "csc_target_total": 30,
          "description": "Network of 24/7 staffed Customer Service Centers for fare payment support and travel information",
          "document_time_status": "active",
          "project_family": "capital_or_infrastructure"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_doc194001",
            "block_id": "p028_c0004",
            "page_number": 28,
            "role": "csc_program",
            "snippet": "Customers Service Center"
          }
        ]
      },
      {
        "record_id": "project_jamaica-bus-depot-rebuild",
        "record_kind": "project",
        "display_name": "Jamaica Bus Depot Rebuild and Expansion",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "project_name": "Jamaica Bus Depot Rebuild and Expansion",
          "project_type": "depot reconstruction and expansion",
          "status": "under construction",
          "expected_completion": "summer of 2026",
          "location": "Queens",
          "bus_capacity": 300,
          "sustainability_features": "green roof, LEED certification standards, stormwater detention tanks (3,600 feet of storm drain and fuel piping, 30,000 cubic feet of stormwater detention tanks)",
          "noise_mitigation": "sound-reducing walls along 107th Avenue and 165th Street",
          "local_hiring_goal": "20% of NY State workforce from Southeast Queens",
          "location_normalized": {
            "raw_text": "Queens"
          },
          "document_time_status": "under_construction",
          "project_family": "capital_or_infrastructure"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p024_c0002",
            "page_number": 24,
            "role": "description",
            "snippet": "Jamaica Bus Depot"
          }
        ]
      },
      {
        "record_id": "project_m86-sbs-pedestrian-safety-capital",
        "record_kind": "project",
        "display_name": "project_m86_sbs_pedestrian_safety_capital",
        "source_ids": [
          "m86_sbs_progress_report_2017"
        ],
        "payload": {
          "project_name": "M86 SBS Pedestrian Safety Improvements",
          "project_type": "capital construction",
          "status": "Construction began June 2016; anticipated completion summer 2017",
          "borough": "Manhattan",
          "description": "Six neckdowns and four bus bulbs being added for pedestrian safety along the M86 SBS route, performed by NYC DDC",
          "document_time_status": "construction_began_june_2016_anticipated_completion_summer_2017",
          "project_family": "capital_or_infrastructure",
          "borough_normalized": "manhattan"
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p011_c0004",
            "page_number": 11,
            "role": "project_description",
            "snippet": "Six neckdowns and four bus bulbs are being added for pedestrian safety along the M86 SBS route as part of the capital construction portion of the project."
          }
        ]
      }
    ]
  },
  {
    "value": "bus_network_redesign",
    "count": 4,
    "records": [
      "project_bronx-bus-network-redesign",
      "project_brooklyn-bus-network-redesign",
      "project_queens-bus-network-redesign",
      "project_staten-island-express-bus-network-redesign"
    ],
    "representative_records": [
      {
        "record_id": "project_bronx-bus-network-redesign",
        "record_kind": "project",
        "display_name": "Bronx Bus Network Redesign",
        "source_ids": [
          "behind_schedule_2025",
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021",
          "soundview_bus_priority_press_release_2021",
          "speeding_up_slowly_2025"
        ],
        "payload": {
          "project_name": "Bronx Bus Network Redesign",
          "project_type": "bus_network_redesign",
          "status": "final_plan_published",
          "description": "First borough-wide bus network redesign conducted as part of the Fast Forward Plan initiative. Publish Existing Conditions Report February 2019, Draft Plan May 2019, Final Plan October 2019.",
          "document_time_status": "approved",
          "project_family": "bus_network_redesign",
          "_merged_field_values": {
            "project_type": [
              "bus_network_redesign",
              "network redesign",
              "bus network redesign"
            ],
            "status": [
              "final_plan_published",
              "completed and implemented 2022",
              "proposed_final_plan_addendum",
              "completed and implemented",
              "planned"
            ],
            "description": [
              "First borough-wide bus network redesign conducted as part of the Fast Forward Plan initiative. Publish Existing Conditions Report February 2019, Draft Plan May 2019, Final Plan October 2019.",
              "First major update to Bronx bus network since 1950s. Major changes to 13 out of 46 routes, added 2 new routes, removed 258 bus stops. Excludes express buses. Resulted in 4% speed increase on most-changed routes and up to 8% ridership increase on cross-town routes.",
              "Multi-year planning effort to improve Local, Limited and Select Bus Service routes in the Bronx. Paused due to COVID-19 pandemic, restarted August 2021, planned for implementation Summer 2022.",
              "MTA planned Bronx Bus Network Redesign that identified Soundview corridors as especially congested"
            ],
            "document_time_status": [
              "approved",
              "implemented",
              "planned"
            ],
            "project_name": [
              "Bronx Bus Network Redesign",
              "Bronx Local Bus Network Redesign"
            ]
          },
          "borough": "Bronx",
          "borough_normalized": "bronx"
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p004_c0002",
            "page_number": 4,
            "role": "describes_project",
            "snippet": "The Bronx Bus Network Redesign is New York City Transit’s first borough-wide bus network redesign conducted as part of the Fast Forward Plan initiative to Reimagine the Bus Network . Over the past year, we gathered all..."
          }
        ]
      },
      {
        "record_id": "project_brooklyn-bus-network-redesign",
        "record_kind": "project",
        "display_name": "Brooklyn Bus Network Redesign",
        "source_ids": [
          "behind_schedule_2025",
          "brooklyn_bus_network_draft_plan_with_route_profiles",
          "speeding_up_slowly_2025"
        ],
        "payload": {
          "project_name": "Brooklyn Bus Network Redesign",
          "project_type": "network redesign",
          "status": "in planning stages",
          "description": "Currently in planning stages. Draft plan contains proposal for new SBS route between Kensington, Brooklyn and JFK Airport (B55 SBS). Final plan expected in second half of 2025.",
          "document_time_status": "study",
          "project_family": "bus_network_redesign",
          "_merged_field_values": {
            "project_type": [
              "network redesign",
              "bus_network_redesign"
            ],
            "status": [
              "in planning stages",
              "draft_plan",
              "planning stage"
            ],
            "description": [
              "Currently in planning stages. Draft plan contains proposal for new SBS route between Kensington, Brooklyn and JFK Airport (B55 SBS). Final plan expected in second half of 2025.",
              "Draft Plan for the Brooklyn Bus Network Redesign, proposing a reimagined Brooklyn bus network with routes, stops, and generalized frequencies."
            ],
            "document_time_status": [
              "study",
              "other"
            ]
          },
          "borough": "Brooklyn",
          "phase": "Draft Plan",
          "publication_date": "December 2022",
          "publication_date_normalized": {
            "raw_text": "December 2022",
            "normalized_date": "2022-12",
            "precision": "month",
            "confidence": "parsed_text"
          },
          "borough_normalized": "brooklyn"
        },
        "evidence_examples": [
          {
            "source_id": "behind_schedule_2025",
            "block_id": "p028_c0004",
            "page_number": 28,
            "snippet": "Since 2019, MTA has embarked on plans to redesign the citywide bus network, with the goals of improving connectivity, decreasing travel times, and simplifying routes for riders. These redesigns were much-needed, and rep..."
          }
        ]
      },
      {
        "record_id": "project_queens-bus-network-redesign",
        "record_kind": "project",
        "display_name": "Queens Bus Network Redesign",
        "source_ids": [
          "behind_schedule_2025",
          "nyct_key_performance_metrics_june2025",
          "queens_addendum_equity_evaluation_appendix_d",
          "queens_proposed_final_plan_2023",
          "queens_proposed_final_plan_addendum_2024",
          "queens_service_change_board_item_2025",
          "speeding_up_slowly_2025"
        ],
        "payload": {
          "project_name": "Queens Bus Network Redesign",
          "project_type": "network redesign",
          "status": "scheduled for implementation summer 2025",
          "description": "Finalized early 2025. Includes simplifying, straightening, and consolidating routes, $30 million of new/increased service, new 'rush' limited routes. Set to go into effect June 2025. Did not include new SBS routes.",
          "document_time_status": "planned",
          "project_family": "bus_network_redesign",
          "_merged_field_values": {
            "project_type": [
              "network redesign",
              "bus network redesign",
              "bus_network_redesign"
            ],
            "status": [
              "scheduled for implementation summer 2025",
              "implementation",
              "proposed_final_plan",
              "board_approval_pending",
              "planning stage"
            ],
            "description": [
              "Finalized early 2025. Includes simplifying, straightening, and consolidating routes, $30 million of new/increased service, new 'rush' limited routes. Set to go into effect June 2025. Did not include new SBS routes.",
              "Reimagined bus network for Queens, driven by customer feedback, implementing Rush routes and modernized service across the borough",
              "The Queens Bus Network Redesign aims to create a more efficient, reliable, and accessible bus system that better serves the needs of all riders, while prioritizing equity to address disparities in access and opportunity.",
              "Proposed Final Plan for redesigning the Queens bus network, published Q4 2023. Proposes 121 total routes (91 local, 30 express) vs 113 existing routes. Includes bus priority expansion with NYC DOT, overnight network expansion, all-day frequent network expansion, and bus stop spacing changes.",
              "Queens Bus Network Redesign Proposed Final Plan Addendum published December 2024",
              "Board staff summary seeking approval to implement the Queens Bus Network Redesign as set forth in the December 2024 Proposed Final Plan Addendum for local and express bus service in Queens."
            ],
            "document_time_status": [
              "planned",
              "other",
              "study"
            ]
          },
          "phase_1_start_date": "June 29, 2025",
          "phase_2_start_date": "August 31, 2025",
          "borough": "Queens",
          "years_of_planning": 6,
          "public_comments_received": "more than 18,000",
          "community_meetings": "nearly 300 outreach events since 2019",
          "phase_1_start_date_normalized": {
            "raw_text": "June 29, 2025",
            "normalized_date": "2025-06-29",
            "precision": "day",
            "confidence": "parsed_text"
          },
          "phase_2_start_date_normalized": {
            "raw_text": "August 31, 2025",
            "normalized_date": "2025-08-31",
            "precision": "day",
            "confidence": "parsed_text"
          },
          "borough_normalized": "queens",
          "total_routes_proposed": 124,
          "total_routes_existing": 113,
          "local_routes_proposed": 94,
          "local_routes_existing": 83,
          "rush_routes_proposed": 25,
          "express_routes_proposed": 30,
          "express_routes_existing": 30
        },
        "evidence_examples": [
          {
            "source_id": "behind_schedule_2025",
            "block_id": "p028_c0005",
            "page_number": 28,
            "snippet": "The Bronx redesign featured major changes to 13 out of 46 routes, added two new routes, and made minor changes to most pre-existing routes, such as removing stops and altering schedules. The changes affect the Bronx's l..."
          }
        ]
      }
    ]
  },
  {
    "value": "bus_priority",
    "count": 4,
    "records": [
      "project_better-buses",
      "project_better-buses-restart-2021",
      "project_jamaica-bus-improvement-study",
      "project_mta-2018-bus-plan"
    ],
    "representative_records": [
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
        "record_id": "project_better-buses-restart-2021",
        "record_kind": "project",
        "display_name": "Better Buses Restart initiative",
        "source_ids": [
          "behind_schedule_2025",
          "jay_street_pilot_overview"
        ],
        "payload": {
          "project_name": "Better Buses Restart",
          "project_type": "bus improvement initiative",
          "status": "implemented",
          "description": "2021 NYC DOT initiative to install nine new major bus lanes and busways throughout the city. Extended and made permanent the 14th Street Busway and created plans to implement five additional busways.",
          "year": 2021,
          "document_time_status": "implemented",
          "project_family": "bus_priority",
          "_merged_field_values": {
            "description": [
              "2021 NYC DOT initiative to install nine new major bus lanes and busways throughout the city. Extended and made permanent the 14th Street Busway and created plans to implement five additional busways.",
              "Better Buses Restart context for the Jay Street Busway Pilot."
            ],
            "document_time_status": [
              "implemented",
              "program_context"
            ],
            "project_family": [
              "bus_priority",
              "bus_improvement_initiative"
            ]
          }
        },
        "evidence_examples": [
          {
            "source_id": "behind_schedule_2025",
            "block_id": "p023_c0003",
            "page_number": 23,
            "snippet": "In 2021, NYC DOT launched its Better Buses Restart initiative to install nine new major bus lanes and busways throughout the city. Better Buses Restart extended and made permanent the 14 th Street and created plans to i..."
          }
        ]
      },
      {
        "record_id": "project_jamaica-bus-improvement-study",
        "record_kind": "project",
        "display_name": "Jamaica Bus Improvement Study",
        "source_ids": [
          "jamaica"
        ],
        "payload": {
          "project_name": "Jamaica Bus Improvement Study",
          "project_type": "Bus Improvement Study",
          "status": "preliminary recommendations developed",
          "description": "Joint NYCT and DOT study starting in 2009 to improve bus circulation in Jamaica, Queens, including upgrading/extending bus lanes, moving bus stops, improving intersections, and developing curb access regulations.",
          "start_year": 2009,
          "implementation_target": "spring 2012",
          "document_time_status": "study",
          "project_family": "bus_priority"
        },
        "evidence_examples": [
          {
            "source_id": "jamaica",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "primary",
            "snippet": "Bus Rapid Transit - Jamaica Bus Improvement Study Skip to main content NYC NYC Resources 311 Office of the Mayor Bus Improvement Projects Jamaica Bus Improvement Study Jamaica Bus Improvement Study Goals Improve bus tra..."
          }
        ]
      }
    ]
  },
  {
    "value": "enforcement_program",
    "count": 4,
    "records": [
      "project_able-program",
      "project_ace-automated-camera-enforcement",
      "project_ace-program",
      "project_stationary-camera-program"
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
        "record_id": "project_ace-automated-camera-enforcement",
        "record_kind": "project",
        "display_name": "Automated Camera Enforcement (ACE)",
        "source_ids": [
          "mta_automated_camera_enforcement",
          "nyct_key_performance_metrics_doc194001"
        ],
        "payload": {
          "project_name": "Automated Camera Enforcement (ACE)",
          "description": "A bus-mounted camera system that issues violations to vehicles occupying bus lanes, to double parked vehicles along bus routes, and to vehicles blocking bus stops. Administered in partnership between the MTA, NYC Department of Finance (DOF), and NYC Department of Transportation (DOT). The 2023 NYS Legislature passed a provision in the budget to expand ACE. Currently active on 60 bus routes.",
          "status": "active",
          "project_type": "camera enforcement program",
          "document_time_status": "active",
          "project_family": "enforcement_program",
          "_merged_field_values": {
            "project_name": [
              "Automated Camera Enforcement (ACE)",
              "Automated Camera Enforcement Program"
            ],
            "project_type": [
              "camera enforcement program",
              "enforcement_program"
            ],
            "status": [
              "active",
              "ongoing"
            ]
          },
          "start_date": "June 2024",
          "buses_equipped": 1400,
          "coverage_miles": 560,
          "daily_customers_benefitted": 915000,
          "routes_covered": 54,
          "start_date_normalized": {
            "raw_text": "June 2024",
            "normalized_date": "2024-06",
            "precision": "month",
            "confidence": "parsed_text"
          }
        },
        "evidence_examples": [
          {
            "source_id": "mta_automated_camera_enforcement",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "describes ACE program",
            "snippet": "Automated Camera Enforcement Skip to main content Menu Close Menu Schedules Maps Fares and tolls Planned Service Changes Travel Back Elevator & Escalator Status Accessibility Sign up for service alerts Guides Access-A-R..."
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
  },
  {
    "value": "planning_or_report",
    "count": 4,
    "records": [
      "project_behind-schedule-2025",
      "project_better-buses-action-plan",
      "project_how-much-faster-are-we-moving-2025",
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
        "record_id": "project_better-buses-action-plan",
        "record_kind": "project",
        "display_name": "Better Buses Action Plan",
        "source_ids": [
          "behind_schedule_2025",
          "better_buses",
          "life_in_slow_lane_2025",
          "speeding_up_slowly_2025"
        ],
        "payload": {
          "project_name": "Better Buses Action Plan",
          "description": "The Better Buses Action Plan is focused on improving bus speeds citywide by 25% and reversing downward bus ridership trends. Accomplished through NYC DOT projects using the bus priority toolkit, increased camera and NYPD enforcement of bus lanes, and service management initiatives and bus network redesigns by MTA.",
          "project_type": "action_plan",
          "agency": "NYC DOT",
          "partners": [
            "MTA",
            "NYPD"
          ],
          "project_family": "planning_or_report",
          "_merged_field_values": {
            "project_type": [
              "action_plan",
              "bus improvement plan",
              "plan"
            ],
            "description": [
              "The Better Buses Action Plan is focused on improving bus speeds citywide by 25% and reversing downward bus ridership trends. Accomplished through NYC DOT projects using the bus priority toolkit, increased camera and NYPD enforcement of bus lanes, and service management initiatives and bus network redesigns by MTA.",
              "Set goals of increasing bus speeds by 25% citywide, installing 10-15 miles of new bus lanes per year, installing TSP at hundreds of intersections, and piloting new busways and automated enforcement",
              "2018 NYC Department of Transportation plan that established a performance target of increasing bus speeds by 25% citywide—from approximately 8 to 10 miles per hour. Target has since been abandoned.",
              "The source identifies the 2018 NYC DOT Better Buses plan's citywide 25 percent bus-speed target and says that target has since been abandoned.",
              "de Blasio Administration's 2019 plan to improve bus service across the City, focused on increasing citywide bus speeds by 25% and reversing downward ridership trends, establishing goals such as improving 5 miles of existing bus lanes each year, installing 10-15 miles of new bus lanes each year, expanding bus lane camera enforcement, and advocating with the MTA for all-door boarding."
            ],
            "project_family": [
              "planning_or_report",
              "bus_priority"
            ],
            "project_name": [
              "Better Buses Action Plan",
              "NYCDOT Better Buses Plan"
            ],
            "status": [
              "ongoing",
              "abandoned",
              "target_abandoned"
            ],
            "document_time_status": [
              "active",
              "abandoned",
              "retrospective"
            ]
          },
          "status": "ongoing",
          "year": 2018,
          "document_time_status": "active"
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
  "other_bucket_records": [
    {
      "record_id": "project_07-14th-st",
      "record_kind": "project",
      "display_name": "project_07_14th_st",
      "source_ids": [
        "better_buses_action_plan_2019"
      ],
      "payload": {
        "project_name": "14th St",
        "name": "14th St, Ave A to Ave D",
        "project_type": "sbs_upgrade",
        "status": "proposed_2019",
        "description": "Upgrade M14A and M14D local service to SBS with off-board fare payment, bus priority treatments, bus lanes, curb management, signal timing, and bus boarders",
        "corridor_length_miles": 6.9,
        "daily_ridership": 28000,
        "routes_served": [
          "M14A",
          "M14D"
        ],
        "document_time_status": "planned",
        "project_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "better_buses_action_plan_2019",
          "block_id": "p030_c0001",
          "page_number": 30,
          "snippet": "07 14th St, Ave A, Ave D"
        }
      ]
    },
    {
      "record_id": "project_11-mosholu-pkwy",
      "record_kind": "project",
      "display_name": "project_11_mosholu_pkwy",
      "source_ids": [
        "better_buses_action_plan_2019"
      ],
      "payload": {
        "project_name": "Mosholu Pkwy",
        "name": "Mosholu Pkwy at Paul Ave",
        "project_type": "bus_stop_improvement",
        "status": "proposed_2019",
        "description": "Add bus boarding island and painted pedestrian space, lengthen bus stop, improve accessibility and pedestrian safety",
        "daily_ridership": 59000,
        "routes_served": [
          "Bx1",
          "Bx2",
          "Bx10",
          "Bx28"
        ],
        "document_time_status": "planned",
        "project_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "better_buses_action_plan_2019",
          "block_id": "p034_c0001",
          "page_number": 34,
          "snippet": "11 Mosholu Pkwy at Paul Ave"
        }
      ]
    },
    {
      "record_id": "project_jamaica-bus-terminal-relocation",
      "record_kind": "project",
      "display_name": "Jamaica Bus Terminal Relocation",
      "source_ids": [
        "nyct_key_performance_metrics_june2025"
      ],
      "payload": {
        "project_name": "Jamaica Bus Terminal Relocation",
        "project_type": "terminal relocation",
        "status": "completed relocation",
        "old_location": "Merrick Boulevard",
        "new_location": "90th Avenue",
        "description": "Relocation of Jamaica Bus Terminal from Merrick Boulevard to a new state-of-the-art facility on 90th Avenue",
        "old_location_normalized": {
          "raw_text": "Merrick Boulevard"
        },
        "new_location_normalized": {
          "raw_text": "90th Avenue"
        },
        "document_time_status": "implemented",
        "project_family": "other"
      },
      "evidence_examples": [
        {
          "source_id": "nyct_key_performance_metrics_june2025",
          "block_id": "p005_c0005",
          "page_number": 5,
          "role": "description",
          "snippet": "The timing of the Queens Bus Network Redesign is also aligned with another major development: the relocation of the Jamaica Bus Terminal. The terminal is moving from Merrick Boulevard to a new, state-of-the-art facility..."
        }
      ]
    }
  ]
}
```

### lifecycle-intervention-taxonomy:family:project.document_time_status

- Category: family_inventory
- Priority: 191
- Record kind: project
- Field: document_time_status
- Count: 102
- Title: Document-time project status inventory
- Decision options: family_alias, canonical_value, bounded_normalizer, keep_other_passthrough, reject_mapping, needs_more_data, no_change

Reasons:
- Review document_time_status as a bounded runner-owned taxonomy derived from raw status. Preserve raw literals.
- No records currently map to other; keep the taxonomy closed unless evidence shows an exact missing family.

Examples:
```json
[
  {
    "value": "planned",
    "count": 40,
    "records": [
      "project_01-lexington-ave",
      "project_02-fdr-dr",
      "project_03-madison-ave",
      "project_04-allen-st"
    ],
    "representative_records": [
      {
        "record_id": "project_01-lexington-ave",
        "record_kind": "project",
        "display_name": "project_01_lexington_ave",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Lexington Ave",
          "name": "Lexington Ave, 96th St to 60th St",
          "project_type": "bus_lane_upgrade",
          "status": "proposed_2019",
          "description": "Upgrade existing curbside bus lane to offset bus lane with curb management and bus boarders on Lexington Ave from 96th St to 60th St",
          "corridor_length_miles": 1.8,
          "daily_ridership": 44000,
          "routes_served": [
            "M98",
            "M101",
            "M102",
            "M103"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p024_c0001",
            "page_number": 24,
            "snippet": "01 Lexington Ave, 96th St to 60th St"
          }
        ]
      },
      {
        "record_id": "project_02-fdr-dr",
        "record_kind": "project",
        "display_name": "project_02_fdr_dr",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "FDR Dr",
          "name": "FDR Dr, Brooklyn Bridge to Battery Park",
          "project_type": "new_bus_lane",
          "status": "proposed_2019",
          "description": "Allow buses to use southbound shoulder as bus lane during peak hours for Staten Island-bound express buses",
          "corridor_length_miles": 0.7,
          "daily_ridership": 7000,
          "routes_served": [
            "SIM3",
            "SIM6",
            "SIM10",
            "SIM11",
            "SIM31"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p025_c0001",
            "page_number": 25,
            "snippet": "02 FDR Dr, Brooklyn Bridge to Battery Park"
          }
        ]
      },
      {
        "record_id": "project_03-madison-ave",
        "record_kind": "project",
        "display_name": "project_03_madison_ave",
        "source_ids": [
          "better_buses_action_plan_2019"
        ],
        "payload": {
          "project_name": "Madison Ave",
          "name": "Madison Ave, 60th St to 42nd St",
          "project_type": "bus_lane_upgrade",
          "status": "proposed_2019",
          "description": "Upgrade existing double bus lanes to red-painted bus lanes with updated signage",
          "corridor_length_miles": 0.9,
          "daily_ridership": 68000,
          "routes_served": [
            "M1",
            "M2",
            "M3",
            "M4",
            "Q32",
            "SIM4c",
            "SIM6",
            "SIM8",
            "SIM8x",
            "SIM11",
            "SIM22",
            "SIM25",
            "SIM26",
            "SIM30",
            "SIM31",
            "SIM33c"
          ],
          "document_time_status": "planned",
          "project_family": "bus_lane"
        },
        "evidence_examples": [
          {
            "source_id": "better_buses_action_plan_2019",
            "block_id": "p026_c0001",
            "page_number": 26,
            "snippet": "03 Madison Ave, 60th St to 42nd St"
          }
        ]
      }
    ]
  },
  {
    "value": "implemented",
    "count": 27,
    "records": [
      "project_14th-street-busway-permanent",
      "project_2nd-3rd-ave-protected-lanes",
      "project_31st-ave-bike-boulevard",
      "project_able-program"
    ],
    "representative_records": [
      {
        "record_id": "project_14th-street-busway-permanent",
        "record_kind": "project",
        "display_name": "14th Street Busway - permanent extension",
        "source_ids": [
          "14th_street_busway",
          "behind_schedule_2025",
          "speeding_up_slowly_2025"
        ],
        "payload": {
          "project_name": "14th Street Busway",
          "project_type": "busway",
          "status": "permanent",
          "description": "Permanent busway on Manhattan's 14th Street between 3rd Avenue and 9th Avenue, made permanent in June 2020 after a successful pilot",
          "document_time_status": "implemented",
          "project_family": "busway",
          "_merged_field_values": {
            "status": [
              "permanent",
              "extended and made permanent"
            ],
            "description": [
              "Permanent busway on Manhattan's 14th Street between 3rd Avenue and 9th Avenue, made permanent in June 2020 after a successful pilot",
              "Better Buses Restart extended and made permanent the 14th Street Busway. Travel speeds increased up to 47% after installation in 2019, making trips 10 minutes faster.",
              "A bus-only street in Lower Manhattan, from 6 a.m. to 10 p.m., only trucks and buses are allowed to travel through the corridor. Started as a pilot in 2019, later made permanent."
            ]
          },
          "location": "14th Street, Manhattan",
          "location_normalized": {
            "raw_text": "14th Street, Manhattan",
            "street": "14th Street"
          },
          "borough": "Manhattan",
          "borough_normalized": "manhattan"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_busway",
            "block_id": "p001_b0001",
            "page_number": 1,
            "snippet": "Bus Rapid Transit - 14th Street Select Bus Service with Transit & Truck Priority Pilot Project Skip to main content NYC NYC Resources 311 Office of the Mayor Routes 14th Street Busway How to Use 14th Street | Background..."
          }
        ]
      },
      {
        "record_id": "project_2nd-3rd-ave-protected-lanes",
        "record_kind": "project",
        "display_name": "2nd and 3rd Avenues Protected Bus and Bike Lanes",
        "source_ids": [
          "streets_plan_update_2026"
        ],
        "payload": {
          "project_name": "2nd and 3rd Avenues Protected Bus and Bike Lanes and Pedestrian Space",
          "project_type": "street redesign",
          "status": "completed",
          "borough": "Manhattan",
          "description": "New protected bus and bike lanes and expanded pedestrian space on 2nd and 3rd Avenues in Manhattan, complementing the Congestion Relief Zone.",
          "document_time_status": "implemented",
          "project_family": "street_redesign",
          "borough_normalized": "manhattan"
        },
        "evidence_examples": [
          {
            "source_id": "streets_plan_update_2026",
            "block_id": "p002_c0005",
            "page_number": 2,
            "snippet": "In Manhattan, the MTA's Congestion Relief Zone led to an 11 percent reduction in traffic, faster bridge and tunnel crossings of up to 50 percent, and increases in cycling, transit ridership and walking trips. NYC DOT co..."
          }
        ]
      },
      {
        "record_id": "project_31st-ave-bike-boulevard",
        "record_kind": "project",
        "display_name": "31st Avenue Bike Boulevard (Astoria)",
        "source_ids": [
          "streets_plan_update_2026"
        ],
        "payload": {
          "project_name": "31st Avenue Bike Boulevard",
          "project_type": "bike boulevard",
          "status": "completed",
          "borough": "Queens",
          "description": "A transformational Bike Boulevard on 31st Avenue in Astoria, completed in 2025.",
          "document_time_status": "implemented",
          "project_family": "bike_boulevard",
          "borough_normalized": "queens"
        },
        "evidence_examples": [
          {
            "source_id": "streets_plan_update_2026",
            "block_id": "p002_c0006",
            "page_number": 2,
            "snippet": "Across the five boroughs, NYC DOT continued to implement street redesign projects that support safe and sustainable transportation. We completed more than 130 projects in 2025 including a transformational Bike Boulevard..."
          }
        ]
      }
    ]
  },
  {
    "value": "active",
    "count": 12,
    "records": [
      "project_14th-street-transit-truck-priority-pilot",
      "project_34th-street-busway",
      "project_ace-automated-camera-enforcement",
      "project_better-buses-action-plan"
    ],
    "representative_records": [
      {
        "record_id": "project_14th-street-transit-truck-priority-pilot",
        "record_kind": "project",
        "display_name": "14th Street Transit & Truck Priority Pilot Project",
        "source_ids": [
          "14th_street_busway",
          "14th_street_busway_brochure",
          "14th_street_fall2019_monitoring",
          "14th_street_winter2020_monitoring",
          "brt_route_index"
        ],
        "payload": {
          "project_name": "14th Street Transit & Truck Priority Pilot Project",
          "project_type": "pilot",
          "status": "ongoing",
          "description": "Implemented by NYCDOT in October 2019, aiming to improve operations of the M14 A and M14 D Select Bus Service (M14 A/D SBS), increase safety on this Vision Zero Priority Corridor, and maintain the street as an important truck route. From 6 AM–10 PM, only buses, trucks, and emergency vehicles allowed on 14th Street from 3rd Avenue to 8th Avenue westbound and 9th Avenue to 3rd Avenue eastbound.",
          "start_date_text": "October 3, 2019",
          "implementing_agency": "NYCDOT",
          "start_date_text_normalized": {
            "raw_text": "October 3, 2019",
            "normalized_date": "2019-10-03",
            "precision": "day",
            "confidence": "parsed_text"
          },
          "document_time_status": "active",
          "project_family": "pilot",
          "_merged_field_values": {
            "status": [
              "ongoing",
              "active",
              "completed",
              "planned"
            ],
            "description": [
              "Implemented by NYCDOT in October 2019, aiming to improve operations of the M14 A and M14 D Select Bus Service (M14 A/D SBS), increase safety on this Vision Zero Priority Corridor, and maintain the street as an important truck route. From 6 AM–10 PM, only buses, trucks, and emergency vehicles allowed on 14th Street from 3rd Avenue to 8th Avenue westbound and 9th Avenue to 3rd Avenue eastbound.",
              "18-month pilot project making 14th Street between 9th Avenue and 3rd Avenue a Transit & Truck Priority corridor starting October 3, 2019.",
              "Pilot project implemented by NYCDOT in October 2019 aiming to improve operations of M14A/D Select Bus Service, increase safety on Vision Zero Priority Corridor, and maintain street as truck route",
              "NYC DOT piloted a Transit and Truck Priority design on 14th Street, formerly known as the 14th Street Transit and Truck Priority Pilot Project, which later became the permanent 14th Street Busway",
              "NYCDOT will pilot a Transit & Truck Priority design on 14th Street between 3rd Avenue and 9th Avenue, and will also install standard bus lanes between 1st Avenue and 3rd Avenue, coinciding with SBS launch for M14A and M14D buses in Summer 2019"
            ],
            "project_name": [
              "14th Street Transit & Truck Priority Pilot Project",
              "14th Street Transit and Truck Priority Pilot Project"
            ],
            "document_time_status": [
              "active",
              "implemented",
              "planned"
            ],
            "project_type": [
              "pilot",
              "pilot_project"
            ]
          },
          "duration": "18-month pilot",
          "goals": [
            "Increase speeds and reliability for M14 A/D Select Bus Service",
            "Improve safety along a Vision Zero Priority corridor"
          ]
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_winter2020_monitoring",
            "block_id": "p002_c0006",
            "page_number": 2,
            "role": "project_description",
            "snippet": "The 14th Street Transit & Truck Priority (TTP) Pilot Project was implemented by the New York City Department of Transportation (NYCDOT) in October 2019, aiming to improve operations of the M14 A and M14 D Select Bus Ser..."
          }
        ]
      },
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
        "record_id": "project_ace-automated-camera-enforcement",
        "record_kind": "project",
        "display_name": "Automated Camera Enforcement (ACE)",
        "source_ids": [
          "mta_automated_camera_enforcement",
          "nyct_key_performance_metrics_doc194001"
        ],
        "payload": {
          "project_name": "Automated Camera Enforcement (ACE)",
          "description": "A bus-mounted camera system that issues violations to vehicles occupying bus lanes, to double parked vehicles along bus routes, and to vehicles blocking bus stops. Administered in partnership between the MTA, NYC Department of Finance (DOF), and NYC Department of Transportation (DOT). The 2023 NYS Legislature passed a provision in the budget to expand ACE. Currently active on 60 bus routes.",
          "status": "active",
          "project_type": "camera enforcement program",
          "document_time_status": "active",
          "project_family": "enforcement_program",
          "_merged_field_values": {
            "project_name": [
              "Automated Camera Enforcement (ACE)",
              "Automated Camera Enforcement Program"
            ],
            "project_type": [
              "camera enforcement program",
              "enforcement_program"
            ],
            "status": [
              "active",
              "ongoing"
            ]
          },
          "start_date": "June 2024",
          "buses_equipped": 1400,
          "coverage_miles": 560,
          "daily_customers_benefitted": 915000,
          "routes_covered": 54,
          "start_date_normalized": {
            "raw_text": "June 2024",
            "normalized_date": "2024-06",
            "precision": "month",
            "confidence": "parsed_text"
          }
        },
        "evidence_examples": [
          {
            "source_id": "mta_automated_camera_enforcement",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "describes ACE program",
            "snippet": "Automated Camera Enforcement Skip to main content Menu Close Menu Schedules Maps Fares and tolls Planned Service Changes Travel Back Elevator & Escalator Status Accessibility Sign up for service alerts Guides Access-A-R..."
          }
        ]
      }
    ]
  },
  {
    "value": "study",
    "count": 10,
    "records": [
      "project_116th-street-study-manhattan",
      "project_34th-street-enhanced-bus-priority",
      "project_broadway-157th-220th-manhattan",
      "project_brooklyn-bus-network-redesign"
    ],
    "representative_records": [
      {
        "record_id": "project_116th-street-study-manhattan",
        "record_kind": "project",
        "display_name": "116th Street Bus Priority and Pedestrian Safety Study, Manhattan",
        "source_ids": [
          "better_buses"
        ],
        "payload": {
          "project_name": "116th Street, Morningside Avenue to Pleasant Avenue Study",
          "description": "Studying bus priority and pedestrian safety improvements on 116th Street, Manhattan Avenue, Morningside Avenue and Pleasant Avenue. Study area serves 10 bus routes carrying 65,000+ daily riders, with connections to the 2, 3, 6, B, C trains and seven perpendicular bus routes.",
          "status": "study",
          "borough": "Manhattan",
          "document_time_status": "study",
          "borough_normalized": "manhattan"
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
        "record_id": "project_34th-street-enhanced-bus-priority",
        "record_kind": "project",
        "display_name": "34th Street Enhanced Bus Priority, Manhattan",
        "source_ids": [
          "better_buses"
        ],
        "payload": {
          "project_name": "34th Street Enhanced Bus Priority",
          "description": "Exploring bus and pedestrian safety enhancements on 34th Street, located within the Congestion Pricing tolling zone. Identified as an important corridor for facilitating safe and easy travel within the Central Business District. Aims to improve bus speeds and reliability, and safety.",
          "status": "study",
          "borough": "Manhattan",
          "document_time_status": "study",
          "borough_normalized": "manhattan"
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
        "record_id": "project_broadway-157th-220th-manhattan",
        "record_kind": "project",
        "display_name": "Broadway, 157th Street to 220th Street Study, Manhattan",
        "source_ids": [
          "better_buses"
        ],
        "payload": {
          "project_name": "Broadway, 157th Street to 220th Street",
          "description": "Exploring a potential project on Broadway between 157th and 220th St in cooperation with MTA. Identified by the NYC Streets Plan. Study will identify ways to improve bus speeds and reliability, as well as general safety and traffic flow improvements.",
          "status": "study",
          "borough": "Manhattan",
          "document_time_status": "study",
          "borough_normalized": "manhattan"
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
  },
  {
    "value": "stalled_resuming",
    "count": 3,
    "records": [
      "project_31st-st-astoria-redesign",
      "project_madison-ave-bus-lanes-extension",
      "project_mcguinness-blvd-bike-lanes"
    ],
    "representative_records": [
      {
        "record_id": "project_31st-st-astoria-redesign",
        "record_kind": "project",
        "display_name": "31st Street Corridor Redesign (Astoria)",
        "source_ids": [
          "streets_plan_update_2026"
        ],
        "payload": {
          "project_name": "31st Street Corridor Redesign",
          "project_type": "street redesign",
          "status": "stalled, resuming",
          "borough": "Queens",
          "description": "Redesigning the safety-critical 31st Street corridor in Astoria. Had been stalled in prior years; NYC DOT plans to restart the process.",
          "document_time_status": "stalled_resuming",
          "project_family": "street_redesign",
          "borough_normalized": "queens"
        },
        "evidence_examples": [
          {
            "source_id": "streets_plan_update_2026",
            "block_id": "p002_c0002",
            "page_number": 2,
            "snippet": "The New York City Department of Transportation has made enormous strides in designing streets to prioritize safety and expand space for cyclists, pedestrians, and bus riders, but there is more work to do. Under the lead..."
          }
        ]
      },
      {
        "record_id": "project_madison-ave-bus-lanes-extension",
        "record_kind": "project",
        "display_name": "Madison Avenue Double Bus Lanes Extension",
        "source_ids": [
          "streets_plan_update_2026"
        ],
        "payload": {
          "project_name": "Madison Avenue Double Bus Lanes Extension",
          "project_type": "bus lane",
          "status": "stalled, resuming",
          "borough": "Manhattan",
          "description": "Extending Madison Avenue double bus lanes south from 42nd Street to 23rd Street in Manhattan. Had been stalled in prior years; NYC DOT plans to resume.",
          "document_time_status": "stalled_resuming",
          "project_family": "bus_lane",
          "borough_normalized": "manhattan"
        },
        "evidence_examples": [
          {
            "source_id": "streets_plan_update_2026",
            "block_id": "p002_c0002",
            "page_number": 2,
            "snippet": "The New York City Department of Transportation has made enormous strides in designing streets to prioritize safety and expand space for cyclists, pedestrians, and bus riders, but there is more work to do. Under the lead..."
          }
        ]
      },
      {
        "record_id": "project_mcguinness-blvd-bike-lanes",
        "record_kind": "project",
        "display_name": "McGuinness Boulevard Parking-Protected Bike Lanes",
        "source_ids": [
          "streets_plan_update_2026"
        ],
        "payload": {
          "project_name": "McGuinness Boulevard Parking-Protected Bike Lanes",
          "project_type": "bike lane",
          "status": "stalled, resuming",
          "borough": "Brooklyn",
          "description": "Implementing parking-protected bike lanes along McGuinness Boulevard in Greenpoint. Had been stalled in prior years; NYC DOT plans to resume.",
          "document_time_status": "stalled_resuming",
          "project_family": "bike_lane",
          "borough_normalized": "brooklyn"
        },
        "evidence_examples": [
          {
            "source_id": "streets_plan_update_2026",
            "block_id": "p002_c0002",
            "page_number": 2,
            "snippet": "The New York City Department of Transportation has made enormous strides in designing streets to prioritize safety and expand space for cyclists, pedestrians, and bus riders, but there is more work to do. Under the lead..."
          }
        ]
      }
    ]
  },
  {
    "value": "under_construction",
    "count": 3,
    "records": [
      "project_east-161st-st-bx6-capital",
      "project_jamaica-bus-depot-rebuild",
      "project_pedestrian-safety-neckdowns-bus-bulbs"
    ],
    "representative_records": [
      {
        "record_id": "project_east-161st-st-bx6-capital",
        "record_kind": "project",
        "display_name": "project_east_161st_st_bx6_capital",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "project_name": "East 161st Street and Bx6 Capital Project",
          "project_type": "bus_street_safety_improvement",
          "status": "construction_started",
          "description": "Project to improve Bronx crosstown bus service and street safety near Yankee Stadium, adding westbound bus-only lanes, converting the 161st Street underpass to buses only, creating fully protected center-running bus lanes, pedestrian safety upgrades, and new amenities for bus riders",
          "lead_agency": "NYC Department of Transportation",
          "partner_agency": "NYC Department of Design and Construction",
          "completion_target_year": 2028,
          "document_time_status": "under_construction",
          "project_family": "accessibility_or_safety"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "project_description",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      },
      {
        "record_id": "project_jamaica-bus-depot-rebuild",
        "record_kind": "project",
        "display_name": "Jamaica Bus Depot Rebuild and Expansion",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "project_name": "Jamaica Bus Depot Rebuild and Expansion",
          "project_type": "depot reconstruction and expansion",
          "status": "under construction",
          "expected_completion": "summer of 2026",
          "location": "Queens",
          "bus_capacity": 300,
          "sustainability_features": "green roof, LEED certification standards, stormwater detention tanks (3,600 feet of storm drain and fuel piping, 30,000 cubic feet of stormwater detention tanks)",
          "noise_mitigation": "sound-reducing walls along 107th Avenue and 165th Street",
          "local_hiring_goal": "20% of NY State workforce from Southeast Queens",
          "location_normalized": {
            "raw_text": "Queens"
          },
          "document_time_status": "under_construction",
          "project_family": "capital_or_infrastructure"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p024_c0002",
            "page_number": 24,
            "role": "description",
            "snippet": "Jamaica Bus Depot"
          }
        ]
      },
      {
        "record_id": "project_pedestrian-safety-neckdowns-bus-bulbs",
        "record_kind": "project",
        "display_name": "Pedestrian Safety Neckdowns and Bus Bulbs Capital Project",
        "source_ids": [
          "m86_sbs_progress_report_2017"
        ],
        "payload": {
          "project_name": "Pedestrian Safety Neckdowns and Bus Bulbs Capital Project",
          "project_type": "capital_construction",
          "status": "under_construction",
          "description": "Addition of six neckdowns and four bus bulbs for pedestrian safety along the M86 SBS route. Construction began June 2016, anticipated completion summer 2017.",
          "start_date": "June 2016",
          "completion_date": "summer 2017",
          "start_date_normalized": {
            "raw_text": "June 2016",
            "normalized_date": "2016-06",
            "precision": "month",
            "confidence": "parsed_text"
          },
          "completion_date_normalized": {
            "raw_text": "summer 2017",
            "normalized_date": "2017-summer",
            "precision": "season",
            "confidence": "parsed_text"
          },
          "document_time_status": "under_construction",
          "project_family": "capital_or_infrastructure"
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p011_c0004",
            "page_number": 11,
            "role": "description",
            "snippet": "Six neckdowns and four bus bulbs are being added for pedestrian safety along the M86 SBS route as part of the capital construction portion of the project."
          }
        ]
      }
    ]
  },
  {
    "value": "approved",
    "count": 2,
    "records": [
      "project_bronx-bus-network-redesign",
      "project_mta-open-data-law-2021"
    ],
    "representative_records": [
      {
        "record_id": "project_bronx-bus-network-redesign",
        "record_kind": "project",
        "display_name": "Bronx Bus Network Redesign",
        "source_ids": [
          "behind_schedule_2025",
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021",
          "soundview_bus_priority_press_release_2021",
          "speeding_up_slowly_2025"
        ],
        "payload": {
          "project_name": "Bronx Bus Network Redesign",
          "project_type": "bus_network_redesign",
          "status": "final_plan_published",
          "description": "First borough-wide bus network redesign conducted as part of the Fast Forward Plan initiative. Publish Existing Conditions Report February 2019, Draft Plan May 2019, Final Plan October 2019.",
          "document_time_status": "approved",
          "project_family": "bus_network_redesign",
          "_merged_field_values": {
            "project_type": [
              "bus_network_redesign",
              "network redesign",
              "bus network redesign"
            ],
            "status": [
              "final_plan_published",
              "completed and implemented 2022",
              "proposed_final_plan_addendum",
              "completed and implemented",
              "planned"
            ],
            "description": [
              "First borough-wide bus network redesign conducted as part of the Fast Forward Plan initiative. Publish Existing Conditions Report February 2019, Draft Plan May 2019, Final Plan October 2019.",
              "First major update to Bronx bus network since 1950s. Major changes to 13 out of 46 routes, added 2 new routes, removed 258 bus stops. Excludes express buses. Resulted in 4% speed increase on most-changed routes and up to 8% ridership increase on cross-town routes.",
              "Multi-year planning effort to improve Local, Limited and Select Bus Service routes in the Bronx. Paused due to COVID-19 pandemic, restarted August 2021, planned for implementation Summer 2022.",
              "MTA planned Bronx Bus Network Redesign that identified Soundview corridors as especially congested"
            ],
            "document_time_status": [
              "approved",
              "implemented",
              "planned"
            ],
            "project_name": [
              "Bronx Bus Network Redesign",
              "Bronx Local Bus Network Redesign"
            ]
          },
          "borough": "Bronx",
          "borough_normalized": "bronx"
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p004_c0002",
            "page_number": 4,
            "role": "describes_project",
            "snippet": "The Bronx Bus Network Redesign is New York City Transit’s first borough-wide bus network redesign conducted as part of the Fast Forward Plan initiative to Reimagine the Bus Network . Over the past year, we gathered all..."
          }
        ]
      },
      {
        "record_id": "project_mta-open-data-law-2021",
        "record_kind": "project",
        "display_name": "MTA Open Data Law 2021",
        "source_ids": [
          "open_data_lessons_2026",
          "open_data_plan_2025_update"
        ],
        "payload": {
          "project_name": "MTA Open Data Law",
          "project_type": "legislation",
          "status": "enacted",
          "description": "Law enacted by Governor Kathy Hochul and New York State Legislature in 2021 mandating MTA to publish data in open, machine-readable formats",
          "document_time_status": "approved",
          "project_family": "legislation",
          "_merged_field_values": {
            "description": [
              "Law enacted by Governor Kathy Hochul and New York State Legislature in 2021 mandating MTA to publish data in open, machine-readable formats",
              "Enacted by Governor Hochul and the New York State Legislature. 2024 marked three years since enactment."
            ]
          }
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
    "value": "pilot",
    "count": 2,
    "records": [
      "project_181st-street-busway",
      "project_jay-street-busway-pilot"
    ],
    "representative_records": [
      {
        "record_id": "project_181st-street-busway",
        "record_kind": "project",
        "display_name": "181st Street Busway",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "project_name": "181st Street Busway",
          "project_type": "busway",
          "description": "Bus priority corridor on 181st Street, launched April 26, 2021. Proposed to be made permanent with reduced hours of 6 AM – 8 PM, 7 days/week based on community feedback.",
          "status": "pilot (proposed permanent)",
          "launch_date": "2021-04-26",
          "launch_date_normalized": {
            "raw_text": "2021-04-26",
            "normalized_date": "2021-04-26",
            "precision": "day",
            "confidence": "submitted_iso"
          },
          "document_time_status": "pilot",
          "project_family": "busway"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p005_c0002",
            "page_number": 5,
            "role": "stated",
            "snippet": "Busway Launched April 26, 2021"
          }
        ]
      },
      {
        "record_id": "project_jay-street-busway-pilot",
        "record_kind": "project",
        "display_name": "Jay Street Busway Pilot",
        "source_ids": [
          "jay_street_pilot_overview"
        ],
        "payload": {
          "project_name": "Jay Street Busway Pilot",
          "project_type": "busway_pilot",
          "status": "pilot",
          "description": "Busway pilot along Jay Street from Smith St./Livingston St. to Jay St./Tillary St. Part of Better Buses Restart. NYC is speeding up implementation on bus projects citywide to provide faster and more reliable bus service for essential workers and communities impacted by COVID-19.",
          "duration": "one year",
          "document_time_status": "pilot",
          "project_family": "busway"
        },
        "evidence_examples": [
          {
            "source_id": "jay_street_pilot_overview",
            "block_id": "p001_c0002",
            "page_number": 1,
            "role": "contains",
            "snippet": "Jay Street Busway Pilot Smith St./Livingston St. to Jay St./Tillary St."
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
  "other_bucket_records": []
}
```
