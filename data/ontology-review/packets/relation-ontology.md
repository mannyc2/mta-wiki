# Relation Ontology Agent

Agent id: `relation-ontology`

## Purpose

Normalize relation families, exact relation-kind aliases, endpoint shape, and relation-context fields that should become explicit relations.

## Owns

- relation_family
- relation_kind
- raw_relation_kind aliases
- endpoint shape
- relation payload route/context fields

## Decision Contract

Submit review decisions only as append-only normalization decisions. Do not edit canonical JSONL, wiki pages, source pages, or source literals directly.

- relation_family_mapping
- canonical_relation_kind
- relation_alias
- endpoint_fix
- relation_candidate
- keep_relation_kind_passthrough
- reject_mapping
- needs_more_data
- no_change

## Candidate Summary

Candidates: 6

- relation_context_field: 5
- relation_kind_inventory: 1

## Candidates

### relation-ontology:relation-kind-inventory

- Category: relation_kind_inventory
- Priority: 409
- Record kind: relation
- Field: relation_kind
- Count: 691
- Title: Relation kind inventory needs alias consolidation
- Decision options: relation_family_mapping, canonical_relation_kind, relation_alias, endpoint_fix, keep_relation_kind_passthrough, reject_mapping, needs_more_data, no_change

Reasons:
- 691 canonical relations use 109 distinct relation_kind values.
- The runner groups them into 18 bounded relation_family values; 10 relations remain in the other passthrough bucket.
- Do not infer aliases from labels alone; compare representative relation payloads and endpoint direction before mapping.

Examples:
```json
[
  {
    "value": "serves_route",
    "count": 117,
    "records": [
      "relation_church-av-serves-b-and-q",
      "relation_church-av-serves-q",
      "relation_project-has-route-bx6",
      "relation_project-serves-route-bx36"
    ],
    "representative_records": [
      {
        "record_id": "relation_church-av-serves-b-and-q",
        "record_kind": "relation",
        "display_name": "Church Avenue Subway Station ... the 'B' and 'Q' subway line logos",
        "source_ids": [
          "nyct_key_performance_metrics_doc194001"
        ],
        "payload": {
          "relation_kind": "serves_route",
          "subject_local_observation_id": "project_church_av_station_upgrades",
          "object_local_observation_id": "route_b_subway_nyct_2025",
          "relation_family": "route_scope",
          "subject_id": "project_church-av-station-upgrades",
          "object_id": "route_b-subway-nyct-2025"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_doc194001",
            "block_id": "p024_c0004",
            "page_number": 24,
            "role": "church_av_bq",
            "snippet": "A photograph showing the exterior of the Church Avenue Subway Station. A large, modern canopy with a white underside and dark frame extends over the entrance. The canopy features a sign that reads \"Church Avenue Subway..."
          }
        ]
      },
      {
        "record_id": "relation_church-av-serves-q",
        "record_kind": "relation",
        "display_name": "Church Avenue Subway Station ... the 'B' and 'Q' subway line logos",
        "source_ids": [
          "nyct_key_performance_metrics_doc194001"
        ],
        "payload": {
          "relation_kind": "serves_route",
          "subject_local_observation_id": "project_church_av_station_upgrades",
          "object_local_observation_id": "route_q_subway_nyct_2025",
          "relation_family": "route_scope",
          "subject_id": "project_church-av-station-upgrades",
          "object_id": "route_q-subway-nyct-2025"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_doc194001",
            "block_id": "p024_c0004",
            "page_number": 24,
            "role": "church_av_bq",
            "snippet": "A photograph showing the exterior of the Church Avenue Subway Station. A large, modern canopy with a white underside and dark frame extends over the entrance. The canopy features a sign that reads \"Church Avenue Subway..."
          }
        ]
      },
      {
        "record_id": "relation_project-has-route-bx6",
        "record_kind": "relation",
        "display_name": "relation_project_has_route_bx6",
        "source_ids": [
          "161st_bx6_capital_project_2026"
        ],
        "payload": {
          "relation_kind": "serves_route",
          "subject_local_observation_id": "project_east_161st_st_bx6_capital",
          "object_local_observation_id": "route_bx6_sbs",
          "relation_family": "route_scope",
          "subject_id": "project_east-161st-st-bx6-capital",
          "object_id": "route_bx6-sbs"
        },
        "evidence_examples": [
          {
            "source_id": "161st_bx6_capital_project_2026",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "route_relationship",
            "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
          }
        ]
      }
    ]
  },
  {
    "value": "has_metric",
    "count": 115,
    "records": [
      "relation_has-metric-project-better-buses-metric-bus-lane-miles-installed_d458e3b2ce",
      "relation_has-metric-route-able-s79-sbs-metric-s79-sbs-to-brooklyn-am-peak-after_50edb2ae44",
      "relation_has-metric-route-able-s79-sbs-metric-s79-sbs-to-brooklyn-am-peak-before_9f46c829af",
      "relation_has-metric-route-able-s79-sbs-metric-s79-sbs-to-brooklyn-am-peak-change_a1e9d60d84"
    ],
    "representative_records": [
      {
        "record_id": "relation_has-metric-project-better-buses-metric-bus-lane-miles-installed_d458e3b2ce",
        "record_kind": "relation",
        "display_name": "Better Buses Program has_metric Bus lane miles installed 2022-2023",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "relation_kind": "has_metric",
          "relation_family": "metric_context",
          "subject_local_observation_id": "project_better_buses",
          "object_local_observation_id": "metric_bus_lane_miles_installed",
          "subject_id": "project_better-buses",
          "object_id": "metric_bus-lane-miles-installed",
          "subject_record_kind": "project",
          "object_record_kind": "metric_claim",
          "derived_relation": true,
          "derivation_rule": "metric-source-system-has-metric",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "metric_bus-lane-miles-installed",
          "derived_from_payload_field": "source_system",
          "derived_from_payload_value": "Better Buses program"
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "metric_value",
            "snippet": "DOT initiated the Better Buses program in 2019 to further the goals of SBS on a broader array of bus corridors. In 2022 and 2023, DOT installed 23.1 miles of new and upgraded bus lanes, including projects on University..."
          }
        ]
      },
      {
        "record_id": "relation_has-metric-route-able-s79-sbs-metric-s79-sbs-to-brooklyn-am-peak-after_50edb2ae44",
        "record_kind": "relation",
        "display_name": "S79-SBS - ABLE route has_metric metric_s79_sbs_to_brooklyn_am_peak_after",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "relation_kind": "has_metric",
          "relation_family": "metric_context",
          "subject_local_observation_id": "route_s79_plus",
          "object_local_observation_id": "metric_s79_sbs_to_brooklyn_am_peak_after",
          "subject_id": "route_able-s79-sbs",
          "object_id": "metric_s79-sbs-to-brooklyn-am-peak-after",
          "subject_record_kind": "route",
          "object_record_kind": "metric_claim",
          "derived_relation": true,
          "derivation_rule": "metric-route-has-metric",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "metric_s79-sbs-to-brooklyn-am-peak-after",
          "derived_from_payload_field": "route_label",
          "derived_from_payload_value": "S79 SBS"
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p008_c0004",
            "page_number": 8,
            "snippet": "Time Period Before TSP (Minutes) After TSP (Minutes) Change (%) AM Peak (6:15 am-9:30 am) 43.8 39.2 -10.5% Midday (12:00 pm-3:00 pm) 29.4 29.9 +1.5%* PM Peak (3:00 pm-6:45 pm) 47.1 43.2 -8.2% *This is not statistically..."
          }
        ]
      },
      {
        "record_id": "relation_has-metric-route-able-s79-sbs-metric-s79-sbs-to-brooklyn-am-peak-before_9f46c829af",
        "record_kind": "relation",
        "display_name": "S79-SBS - ABLE route has_metric metric_s79_sbs_to_brooklyn_am_peak_before",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "relation_kind": "has_metric",
          "relation_family": "metric_context",
          "subject_local_observation_id": "route_s79_plus",
          "object_local_observation_id": "metric_s79_sbs_to_brooklyn_am_peak_before",
          "subject_id": "route_able-s79-sbs",
          "object_id": "metric_s79-sbs-to-brooklyn-am-peak-before",
          "subject_record_kind": "route",
          "object_record_kind": "metric_claim",
          "derived_relation": true,
          "derivation_rule": "metric-route-has-metric",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "metric_s79-sbs-to-brooklyn-am-peak-before",
          "derived_from_payload_field": "route_label",
          "derived_from_payload_value": "S79 SBS"
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p008_c0004",
            "page_number": 8,
            "snippet": "Time Period Before TSP (Minutes) After TSP (Minutes) Change (%) AM Peak (6:15 am-9:30 am) 43.8 39.2 -10.5% Midday (12:00 pm-3:00 pm) 29.4 29.9 +1.5%* PM Peak (3:00 pm-6:45 pm) 47.1 43.2 -8.2% *This is not statistically..."
          }
        ]
      }
    ]
  },
  {
    "value": "has_timeline_event",
    "count": 107,
    "records": [
      "relation_125th-laguardia-launch",
      "relation_14th-st-launch",
      "relation_23rd-st-launch",
      "relation_34th-st-capital-event"
    ],
    "representative_records": [
      {
        "record_id": "relation_125th-laguardia-launch",
        "record_kind": "relation",
        "display_name": "Service launched on Memorial Day, May 25, 2014",
        "source_ids": [
          "brt_route_index"
        ],
        "payload": {
          "relation_kind": "has_timeline_event",
          "subject_local_observation_id": "route_125th_laguardia_sbs",
          "object_local_observation_id": "event_125th_laguardia_sbs_start",
          "relation_family": "timeline_context",
          "subject_id": "route_125th-laguardia-sbs",
          "object_id": "event_125th-laguardia-sbs-start"
        },
        "evidence_examples": [
          {
            "source_id": "brt_route_index",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "relation",
            "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
          }
        ]
      },
      {
        "record_id": "relation_14th-st-launch",
        "record_kind": "relation",
        "display_name": "14th Street Select Bus Service launch in Summer 2019",
        "source_ids": [
          "brt_route_index"
        ],
        "payload": {
          "relation_kind": "has_timeline_event",
          "subject_local_observation_id": "route_34th_st_sbs",
          "object_local_observation_id": "event_14th_st_sbs_start",
          "relation_family": "timeline_context",
          "subject_id": "route_34th-st-sbs",
          "object_id": "event_14th-st-sbs-start"
        },
        "evidence_examples": [
          {
            "source_id": "brt_route_index",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "relation",
            "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
          }
        ]
      },
      {
        "record_id": "relation_23rd-st-launch",
        "record_kind": "relation",
        "display_name": "23rd Street Select Bus Service began service on November 6, 2016",
        "source_ids": [
          "brt_route_index"
        ],
        "payload": {
          "relation_kind": "has_timeline_event",
          "subject_local_observation_id": "route_23rd_st_sbs",
          "object_local_observation_id": "event_23rd_st_sbs_start",
          "relation_family": "timeline_context",
          "subject_id": "route_23rd-st-sbs",
          "object_id": "event_23rd-st-sbs-start"
        },
        "evidence_examples": [
          {
            "source_id": "brt_route_index",
            "block_id": "p001_b0001",
            "page_number": 1,
            "role": "relation",
            "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
          }
        ]
      }
    ]
  },
  {
    "value": "operates_on_corridor",
    "count": 44,
    "records": [
      "relation_operates-on-corridor-route-bee-line-60-corridor-pelham-fordham-207_717145775f",
      "relation_operates-on-corridor-route-bee-line-62-corridor-pelham-fordham-207_2dc27f6687",
      "relation_operates-on-corridor-route-bx11-corridor-el-grant-highway_08e316b836",
      "relation_operates-on-corridor-route-bx11-corridor-washington-bridge_a66cb89fa5"
    ],
    "representative_records": [
      {
        "record_id": "relation_operates-on-corridor-route-bee-line-60-corridor-pelham-fordham-207_717145775f",
        "record_kind": "relation",
        "display_name": "Bee-Line 60 operates_on_corridor Pelham Parkway, Fordham Road, West 207 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "relation_kind": "operates_on_corridor",
          "relation_family": "corridor_scope",
          "subject_local_observation_id": "route_bee_line_60",
          "object_local_observation_id": "corridor_pelham_fordham_207",
          "subject_id": "route_bee-line-60",
          "object_id": "corridor_pelham-fordham-207",
          "subject_record_kind": "route",
          "object_record_kind": "corridor",
          "derived_relation": true,
          "derivation_rule": "corridor-routes-served",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "corridor_pelham-fordham-207",
          "derived_from_payload_field": "routes",
          "derived_from_payload_value": "Bee Line 60"
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
      },
      {
        "record_id": "relation_operates-on-corridor-route-bee-line-62-corridor-pelham-fordham-207_2dc27f6687",
        "record_kind": "relation",
        "display_name": "Bee-Line 62 operates_on_corridor Pelham Parkway, Fordham Road, West 207 Street Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "relation_kind": "operates_on_corridor",
          "relation_family": "corridor_scope",
          "subject_local_observation_id": "route_bee_line_62",
          "object_local_observation_id": "corridor_pelham_fordham_207",
          "subject_id": "route_bee-line-62",
          "object_id": "corridor_pelham-fordham-207",
          "subject_record_kind": "route",
          "object_record_kind": "corridor",
          "derived_relation": true,
          "derivation_rule": "corridor-routes-served",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "corridor_pelham-fordham-207",
          "derived_from_payload_field": "routes",
          "derived_from_payload_value": "Bee Line 62"
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
      },
      {
        "record_id": "relation_operates-on-corridor-route-bx11-corridor-el-grant-highway_08e316b836",
        "record_kind": "relation",
        "display_name": "MTA Bus Bx11 operates_on_corridor E.L. Grant Highway Corridor",
        "source_ids": [
          "bronx_bus_network_final_plan_2019",
          "bronx_bus_network_final_plan_addendum_2021"
        ],
        "payload": {
          "relation_kind": "operates_on_corridor",
          "relation_family": "corridor_scope",
          "subject_local_observation_id": "route_bx11",
          "object_local_observation_id": "corridor_el_grant_highway",
          "subject_id": "route_bx11",
          "object_id": "corridor_el-grant-highway",
          "subject_record_kind": "route",
          "object_record_kind": "corridor",
          "derived_relation": true,
          "derivation_rule": "corridor-routes-served",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "corridor_el-grant-highway",
          "derived_from_payload_field": "routes_served",
          "derived_from_payload_value": "Bx11"
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
      }
    ]
  },
  {
    "value": "has_treatment",
    "count": 36,
    "records": [
      "relation_busway-has-enforcement",
      "relation_busway-has-treatment-restrictions",
      "relation_corridor-has-treatment-dropoff-pickup",
      "relation_corridor-has-treatment-enforcement-cameras"
    ],
    "representative_records": [
      {
        "record_id": "relation_busway-has-enforcement",
        "record_kind": "relation",
        "display_name": "relation_busway_has_enforcement",
        "source_ids": [
          "34th_st_busway"
        ],
        "payload": {
          "relation_kind": "has_treatment",
          "subject_local_observation_id": "project_34th_street_busway",
          "object_local_observation_id": "treatment_enforcement",
          "relation_family": "treatment_context",
          "subject_id": "project_34th-street-busway",
          "object_id": "treatment_enforcement"
        },
        "evidence_examples": [
          {
            "source_id": "34th_st_busway",
            "block_id": "p002_c0023",
            "page_number": 2,
            "role": "enforcement",
            "snippet": "Restrictions are enforced through NYPD traffic agents and automated cameras, both of which may issue warnings and summonses. Camera violations incur a $50 fine for a first violation and up to $250 for the fifth or subse..."
          }
        ]
      },
      {
        "record_id": "relation_busway-has-treatment-restrictions",
        "record_kind": "relation",
        "display_name": "relation_busway_has_treatment_restrictions",
        "source_ids": [
          "34th_st_busway"
        ],
        "payload": {
          "relation_kind": "has_treatment",
          "subject_local_observation_id": "project_34th_street_busway",
          "object_local_observation_id": "treatment_busway_restrictions",
          "relation_family": "treatment_context",
          "subject_id": "project_34th-street-busway",
          "object_id": "treatment_busway-restrictions"
        },
        "evidence_examples": [
          {
            "source_id": "34th_st_busway",
            "block_id": "p002_c0007",
            "page_number": 2,
            "role": "treatment",
            "snippet": "6 AM – 10 PM / 7 days a week"
          }
        ]
      },
      {
        "record_id": "relation_corridor-has-treatment-dropoff-pickup",
        "record_kind": "relation",
        "display_name": "Corridor has Passenger Drop-off/Pickup",
        "source_ids": [
          "14th_street_busway_brochure"
        ],
        "payload": {
          "relation_kind": "has_treatment",
          "subject_local_observation_id": "corridor_14th_street_ttp",
          "object_local_observation_id": "treatment_passenger_dropoff_pickup",
          "description": "The corridor allows passenger drop-off and pickup all along.",
          "relation_family": "treatment_context",
          "subject_id": "corridor_14th-street-ttp",
          "object_id": "treatment_passenger-dropoff-pickup"
        },
        "evidence_examples": [
          {
            "source_id": "14th_street_busway_brochure",
            "block_id": "p001_c0009",
            "page_number": 1,
            "role": "dropoff/pickup",
            "snippet": "Passenger vehicles may drop-off and pickup all along the corridor."
          }
        ]
      }
    ]
  },
  {
    "value": "published_by",
    "count": 28,
    "records": [
      "relation_published-by-project-behind-schedule-2025-entity-nyc-comptroller-brad-lander_4e068c20e4",
      "relation_published-by-project-how-much-faster-are-we-moving-2025-entity-people-oriented-cities_dd41e492f9",
      "relation_published-by-project-life-in-slow-lane-report-card-entity-nyc-comptroller-brad-lander_abe755b768",
      "relation_published-by-source-14th-street-busway-brochure-entity-nyc-dot_a631c48ed0"
    ],
    "representative_records": [
      {
        "record_id": "relation_published-by-project-behind-schedule-2025-entity-nyc-comptroller-brad-lander_4e068c20e4",
        "record_kind": "relation",
        "display_name": "Behind Schedule Report (April 2025) published_by New York City Comptroller Brad Lander",
        "source_ids": [
          "life_in_slow_lane_2025"
        ],
        "payload": {
          "relation_kind": "published_by",
          "relation_family": "publication_role",
          "subject_local_observation_id": "project_behind_schedule_2025",
          "object_local_observation_id": "entity_nyc_comptroller_brad_lander",
          "subject_id": "project_behind-schedule-2025",
          "object_id": "entity_nyc-comptroller-brad-lander",
          "subject_record_kind": "project",
          "object_record_kind": "entity",
          "derived_relation": true,
          "derivation_rule": "project-publisher",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "project_behind-schedule-2025",
          "derived_from_payload_field": "publisher",
          "derived_from_payload_value": "NYC Comptroller Brad Lander"
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
        "record_id": "relation_published-by-project-how-much-faster-are-we-moving-2025-entity-people-oriented-cities_dd41e492f9",
        "record_kind": "relation",
        "display_name": "How Much Faster Are We Moving (2025) published_by People Oriented Cities",
        "source_ids": [
          "life_in_slow_lane_2025"
        ],
        "payload": {
          "relation_kind": "published_by",
          "relation_family": "publication_role",
          "subject_local_observation_id": "project_how_much_faster_are_we_moving_2025",
          "object_local_observation_id": "entity_people_oriented_cities",
          "subject_id": "project_how-much-faster-are-we-moving-2025",
          "object_id": "entity_people-oriented-cities",
          "subject_record_kind": "project",
          "object_record_kind": "entity",
          "derived_relation": true,
          "derivation_rule": "project-publisher",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "project_how-much-faster-are-we-moving-2025",
          "derived_from_payload_field": "publisher",
          "derived_from_payload_value": "People Oriented Cities"
        },
        "evidence_examples": [
          {
            "source_id": "life_in_slow_lane_2025",
            "block_id": "p005_c0004",
            "page_number": 5,
            "snippet": "Independent analyses of NYCDOT’s bus priority program found mixed results. A 2025 report assessing corridor-level speed impacts of different bus lane types, How Much Faster Are We Moving , found that some bus lanes prod..."
          }
        ]
      },
      {
        "record_id": "relation_published-by-project-life-in-slow-lane-report-card-entity-nyc-comptroller-brad-lander_abe755b768",
        "record_kind": "relation",
        "display_name": "Life in the Slow Lane Report Card published_by New York City Comptroller Brad Lander",
        "source_ids": [
          "life_in_slow_lane_2025"
        ],
        "payload": {
          "relation_kind": "published_by",
          "relation_family": "publication_role",
          "subject_local_observation_id": "project_life_in_slow_lane_report_card",
          "object_local_observation_id": "entity_nyc_comptroller_brad_lander",
          "subject_id": "project_life-in-slow-lane-report-card",
          "object_id": "entity_nyc-comptroller-brad-lander",
          "subject_record_kind": "project",
          "object_record_kind": "entity",
          "derived_relation": true,
          "derivation_rule": "project-publisher",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "project_life-in-slow-lane-report-card",
          "derived_from_payload_field": "publisher",
          "derived_from_payload_value": "NYC Comptroller Brad Lander"
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
    "value": "has_claim",
    "count": 26,
    "records": [
      "relation_has-claim-route-b44-sbs-claim-able-rollout-m14-b44-nov2019_a23fd3d839",
      "relation_has-claim-route-bx11-claim-bx11-frequency-improvement_3efe4a06fb",
      "relation_has-claim-route-bx13-claim-bx13-frequency-improvement_21e98e09a8",
      "relation_has-claim-route-bx15-ace-claim-bx15-split-m125-creation_2f17704194"
    ],
    "representative_records": [
      {
        "record_id": "relation_has-claim-route-b44-sbs-claim-able-rollout-m14-b44-nov2019_a23fd3d839",
        "record_kind": "relation",
        "display_name": "Nostrand Avenue-Rogers Avenue Select Bus Service (B44) has_claim ABLE rollout on M14 SBS and B44 SBS by Nov 2019",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "relation_kind": "has_claim",
          "relation_family": "claim_context",
          "subject_local_observation_id": "route_b44_sbs",
          "object_local_observation_id": "claim_able_rollout_m14_b44_nov2019",
          "subject_id": "route_b44-sbs",
          "object_id": "claim_able-rollout-m14-b44-nov2019",
          "subject_record_kind": "route",
          "object_record_kind": "claim",
          "derived_relation": true,
          "derivation_rule": "claim-route-has-claim",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "claim_able-rollout-m14-b44-nov2019",
          "derived_from_payload_field": "routes",
          "derived_from_payload_value": "B44 SBS"
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p023_c0006",
            "page_number": 23,
            "role": "provides_data",
            "snippet": "Bus lanes separate buses from general traffic, improving speed and reliability. They are typically located along the curb or “offset” from the curb, allowing the curb lane to be utilized for other purposes. Ensuring tha..."
          }
        ]
      },
      {
        "record_id": "relation_has-claim-route-bx11-claim-bx11-frequency-improvement_3efe4a06fb",
        "record_kind": "relation",
        "display_name": "MTA Bus Bx11 has_claim Bx11 frequency improvement to 8-or-better",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "relation_kind": "has_claim",
          "relation_family": "claim_context",
          "subject_local_observation_id": "route_bx11",
          "object_local_observation_id": "claim_bx11_frequency_improvement",
          "subject_id": "route_bx11",
          "object_id": "claim_bx11-frequency-improvement",
          "subject_record_kind": "route",
          "object_record_kind": "claim",
          "derived_relation": true,
          "derivation_rule": "claim-route-has-claim",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "claim_bx11-frequency-improvement",
          "derived_from_payload_field": "route",
          "derived_from_payload_value": "Bx11"
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p007_c0001",
            "page_number": 7,
            "role": "provides_data",
            "snippet": "Route Weekday Frequency Category (7a to 9p, peak direction) Existing Proposed Bx1 15-or-better 15-or-better Bx1 LTD Bx2 15-or-better 15-or-better Bx1/2 Combined 8-or-better 8-or-better Bx3 8-or-better 8-or-better Bx4 30..."
          }
        ]
      },
      {
        "record_id": "relation_has-claim-route-bx13-claim-bx13-frequency-improvement_21e98e09a8",
        "record_kind": "relation",
        "display_name": "MTA Bus Bx13 has_claim Bx13 frequency improvement to 8-or-better",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "relation_kind": "has_claim",
          "relation_family": "claim_context",
          "subject_local_observation_id": "route_bx13",
          "object_local_observation_id": "claim_bx13_frequency_improvement",
          "subject_id": "route_bx13",
          "object_id": "claim_bx13-frequency-improvement",
          "subject_record_kind": "route",
          "object_record_kind": "claim",
          "derived_relation": true,
          "derivation_rule": "claim-route-has-claim",
          "derivation_confidence": "exact_canonical_match",
          "derived_from_record_id": "claim_bx13-frequency-improvement",
          "derived_from_payload_field": "route",
          "derived_from_payload_value": "Bx13"
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p007_c0001",
            "page_number": 7,
            "role": "provides_data",
            "snippet": "Route Weekday Frequency Category (7a to 9p, peak direction) Existing Proposed Bx1 15-or-better 15-or-better Bx1 LTD Bx2 15-or-better 15-or-better Bx1/2 Combined 8-or-better 8-or-better Bx3 8-or-better 8-or-better Bx4 30..."
          }
        ]
      }
    ]
  },
  {
    "value": "uses_corridor",
    "count": 15,
    "records": [
      "relation_31st-project-uses-corridor",
      "relation_court-st-project-uses-corridor",
      "relation_hillside-project-uses-corridor",
      "relation_lexington-project-to-corridor-reviewed"
    ],
    "representative_records": [
      {
        "record_id": "relation_31st-project-uses-corridor",
        "record_kind": "relation",
        "display_name": "relation_31st_project_uses_corridor",
        "source_ids": [
          "streets_plan_update_2026"
        ],
        "payload": {
          "relation_kind": "uses_corridor",
          "subject_local_observation_id": "project_31st_st_astoria_redesign",
          "object_local_observation_id": "corridor_31st_st_astoria",
          "description": "31st Street corridor redesign project is on 31st Street in Astoria.",
          "relation_family": "corridor_scope",
          "subject_id": "project_31st-st-astoria-redesign",
          "object_id": "corridor_31st-st-astoria"
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
        "record_id": "relation_court-st-project-uses-corridor",
        "record_kind": "relation",
        "display_name": "relation_court_st_project_uses_corridor",
        "source_ids": [
          "streets_plan_update_2026"
        ],
        "payload": {
          "relation_kind": "uses_corridor",
          "subject_local_observation_id": "project_court_st_bk_protected_bike_lane",
          "object_local_observation_id": "corridor_court_st_brooklyn",
          "description": "Court Street protected bike lane project is on Court Street in Brooklyn.",
          "relation_family": "corridor_scope",
          "subject_id": "project_court-st-bk-protected-bike-lane",
          "object_id": "corridor_court-st-brooklyn"
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
        "record_id": "relation_hillside-project-uses-corridor",
        "record_kind": "relation",
        "display_name": "relation_hillside_project_uses_corridor",
        "source_ids": [
          "streets_plan_update_2026"
        ],
        "payload": {
          "relation_kind": "uses_corridor",
          "subject_local_observation_id": "project_hillside_ave_bus_lanes",
          "object_local_observation_id": "corridor_hillside_ave_queens",
          "description": "Hillside Avenue bus lanes project is on Hillside Avenue in eastern Queens.",
          "relation_family": "corridor_scope",
          "subject_id": "project_hillside-ave-bus-lanes",
          "object_id": "corridor_hillside-ave-queens"
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
  "bounded_family_policy": {
    "taxonomy_mode": "bounded_relation_family_with_other_passthrough",
    "decision_rule": "Map a relation_kind into a family when representative endpoints share the same broad ontology role; emit relation_alias only for exact same-direction aliases.",
    "passthrough_rule": "Keep relation_kind raw and relation_family=other when labels or endpoint directions are ambiguous."
  },
  "relation_family_inventory": [
    {
      "value": "route_scope",
      "count": 134,
      "records": [
        "relation_ace-covers-b60",
        "relation_ace-covers-b68",
        "relation_ace-covers-m57",
        "relation_church-av-serves-b-and-q"
      ],
      "representative_records": [
        {
          "record_id": "relation_ace-covers-b60",
          "record_kind": "relation",
          "display_name": "the B68 and B60 in Brooklyn and the M57 in Manhattan entered a 60-day warning phase",
          "source_ids": [
            "nyct_key_performance_metrics_doc194001"
          ],
          "payload": {
            "relation_kind": "covers_route",
            "subject_local_observation_id": "project_automated_camera_enforcement_ace",
            "object_local_observation_id": "route_b60_nyct_update_2025",
            "relation_family": "route_scope",
            "subject_id": "project_ace-automated-camera-enforcement",
            "object_id": "route_b60"
          },
          "evidence_examples": [
            {
              "source_id": "nyct_key_performance_metrics_doc194001",
              "block_id": "p010_c0011",
              "page_number": 10,
              "role": "ace_bus_routes",
              "snippet": "The MTA expanded the Automated Camera Enforcement (ACE) program to three additional bus routes. On December 8, the B68 and B60 in Brooklyn and the M57 in Manhattan entered a 60-day warning phase, during which vehicles t..."
            }
          ]
        },
        {
          "record_id": "relation_ace-covers-b68",
          "record_kind": "relation",
          "display_name": "the B68 and B60 in Brooklyn and the M57 in Manhattan entered a 60-day warning phase",
          "source_ids": [
            "nyct_key_performance_metrics_doc194001"
          ],
          "payload": {
            "relation_kind": "covers_route",
            "subject_local_observation_id": "project_automated_camera_enforcement_ace",
            "object_local_observation_id": "route_b68_nyct_2025",
            "relation_family": "route_scope",
            "subject_id": "project_ace-automated-camera-enforcement",
            "object_id": "route_b68-nyct-2025"
          },
          "evidence_examples": [
            {
              "source_id": "nyct_key_performance_metrics_doc194001",
              "block_id": "p010_c0011",
              "page_number": 10,
              "role": "ace_bus_routes",
              "snippet": "The MTA expanded the Automated Camera Enforcement (ACE) program to three additional bus routes. On December 8, the B68 and B60 in Brooklyn and the M57 in Manhattan entered a 60-day warning phase, during which vehicles t..."
            }
          ]
        }
      ]
    },
    {
      "value": "timeline_context",
      "count": 122,
      "records": [
        "relation_125th-laguardia-launch",
        "relation_14th-st-launch",
        "relation_23rd-st-launch",
        "relation_34th-st-capital-event"
      ],
      "representative_records": [
        {
          "record_id": "relation_125th-laguardia-launch",
          "record_kind": "relation",
          "display_name": "Service launched on Memorial Day, May 25, 2014",
          "source_ids": [
            "brt_route_index"
          ],
          "payload": {
            "relation_kind": "has_timeline_event",
            "subject_local_observation_id": "route_125th_laguardia_sbs",
            "object_local_observation_id": "event_125th_laguardia_sbs_start",
            "relation_family": "timeline_context",
            "subject_id": "route_125th-laguardia-sbs",
            "object_id": "event_125th-laguardia-sbs-start"
          },
          "evidence_examples": [
            {
              "source_id": "brt_route_index",
              "block_id": "p001_b0001",
              "page_number": 1,
              "role": "relation",
              "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
            }
          ]
        },
        {
          "record_id": "relation_14th-st-launch",
          "record_kind": "relation",
          "display_name": "14th Street Select Bus Service launch in Summer 2019",
          "source_ids": [
            "brt_route_index"
          ],
          "payload": {
            "relation_kind": "has_timeline_event",
            "subject_local_observation_id": "route_34th_st_sbs",
            "object_local_observation_id": "event_14th_st_sbs_start",
            "relation_family": "timeline_context",
            "subject_id": "route_34th-st-sbs",
            "object_id": "event_14th-st-sbs-start"
          },
          "evidence_examples": [
            {
              "source_id": "brt_route_index",
              "block_id": "p001_b0001",
              "page_number": 1,
              "role": "relation",
              "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
            }
          ]
        }
      ]
    },
    {
      "value": "metric_context",
      "count": 120,
      "records": [
        "relation_2026-priorities",
        "relation_has-metric-project-better-buses-metric-bus-lane-miles-installed_d458e3b2ce",
        "relation_has-metric-route-able-s79-sbs-metric-s79-sbs-to-brooklyn-am-peak-after_50edb2ae44",
        "relation_has-metric-route-able-s79-sbs-metric-s79-sbs-to-brooklyn-am-peak-before_9f46c829af"
      ],
      "representative_records": [
        {
          "record_id": "relation_2026-priorities",
          "record_kind": "relation",
          "display_name": "MTA Open Data Team sets 2026 priorities",
          "source_ids": [
            "open_data_plan_2026_update"
          ],
          "payload": {
            "relation_kind": "has_priority",
            "subject_local_observation_id": "entity_mta_open_data_team",
            "object_local_observation_id": "claim_2026_priority_eam_data",
            "relation_family": "metric_context",
            "subject_id": "entity_mta-open-data-team",
            "object_id": "claim_2026-priority-eam-data"
          },
          "evidence_examples": [
            {
              "source_id": "open_data_plan_2026_update",
              "block_id": "p004_c0003",
              "page_number": 4,
              "role": "section_heading",
              "snippet": "PRIORITIES FOR 2026"
            }
          ]
        },
        {
          "record_id": "relation_has-metric-project-better-buses-metric-bus-lane-miles-installed_d458e3b2ce",
          "record_kind": "relation",
          "display_name": "Better Buses Program has_metric Bus lane miles installed 2022-2023",
          "source_ids": [
            "bus_lane_camera_report_2024"
          ],
          "payload": {
            "relation_kind": "has_metric",
            "relation_family": "metric_context",
            "subject_local_observation_id": "project_better_buses",
            "object_local_observation_id": "metric_bus_lane_miles_installed",
            "subject_id": "project_better-buses",
            "object_id": "metric_bus-lane-miles-installed",
            "subject_record_kind": "project",
            "object_record_kind": "metric_claim",
            "derived_relation": true,
            "derivation_rule": "metric-source-system-has-metric",
            "derivation_confidence": "exact_canonical_match",
            "derived_from_record_id": "metric_bus-lane-miles-installed",
            "derived_from_payload_field": "source_system",
            "derived_from_payload_value": "Better Buses program"
          },
          "evidence_examples": [
            {
              "source_id": "bus_lane_camera_report_2024",
              "block_id": "p005_c0003",
              "page_number": 5,
              "role": "metric_value",
              "snippet": "DOT initiated the Better Buses program in 2019 to further the goals of SBS on a broader array of bus corridors. In 2022 and 2023, DOT installed 23.1 miles of new and upgraded bus lanes, including projects on University..."
            }
          ]
        }
      ]
    },
    {
      "value": "corridor_scope",
      "count": 70,
      "records": [
        "relation_31st-project-uses-corridor",
        "relation_court-st-project-uses-corridor",
        "relation_hillside-project-uses-corridor",
        "relation_lexington-project-to-corridor-reviewed"
      ],
      "representative_records": [
        {
          "record_id": "relation_31st-project-uses-corridor",
          "record_kind": "relation",
          "display_name": "relation_31st_project_uses_corridor",
          "source_ids": [
            "streets_plan_update_2026"
          ],
          "payload": {
            "relation_kind": "uses_corridor",
            "subject_local_observation_id": "project_31st_st_astoria_redesign",
            "object_local_observation_id": "corridor_31st_st_astoria",
            "description": "31st Street corridor redesign project is on 31st Street in Astoria.",
            "relation_family": "corridor_scope",
            "subject_id": "project_31st-st-astoria-redesign",
            "object_id": "corridor_31st-st-astoria"
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
          "record_id": "relation_court-st-project-uses-corridor",
          "record_kind": "relation",
          "display_name": "relation_court_st_project_uses_corridor",
          "source_ids": [
            "streets_plan_update_2026"
          ],
          "payload": {
            "relation_kind": "uses_corridor",
            "subject_local_observation_id": "project_court_st_bk_protected_bike_lane",
            "object_local_observation_id": "corridor_court_st_brooklyn",
            "description": "Court Street protected bike lane project is on Court Street in Brooklyn.",
            "relation_family": "corridor_scope",
            "subject_id": "project_court-st-bk-protected-bike-lane",
            "object_id": "corridor_court-st-brooklyn"
          },
          "evidence_examples": [
            {
              "source_id": "streets_plan_update_2026",
              "block_id": "p002_c0005",
              "page_number": 2,
              "snippet": "In Manhattan, the MTA's Congestion Relief Zone led to an 11 percent reduction in traffic, faster bridge and tunnel crossings of up to 50 percent, and increases in cycling, transit ridership and walking trips. NYC DOT co..."
            }
          ]
        }
      ]
    },
    {
      "value": "treatment_context",
      "count": 41,
      "records": [
        "relation_busway-has-enforcement",
        "relation_busway-has-treatment-restrictions",
        "relation_corridor-has-treatment-dropoff-pickup",
        "relation_corridor-has-treatment-enforcement-cameras"
      ],
      "representative_records": [
        {
          "record_id": "relation_busway-has-enforcement",
          "record_kind": "relation",
          "display_name": "relation_busway_has_enforcement",
          "source_ids": [
            "34th_st_busway"
          ],
          "payload": {
            "relation_kind": "has_treatment",
            "subject_local_observation_id": "project_34th_street_busway",
            "object_local_observation_id": "treatment_enforcement",
            "relation_family": "treatment_context",
            "subject_id": "project_34th-street-busway",
            "object_id": "treatment_enforcement"
          },
          "evidence_examples": [
            {
              "source_id": "34th_st_busway",
              "block_id": "p002_c0023",
              "page_number": 2,
              "role": "enforcement",
              "snippet": "Restrictions are enforced through NYPD traffic agents and automated cameras, both of which may issue warnings and summonses. Camera violations incur a $50 fine for a first violation and up to $250 for the fifth or subse..."
            }
          ]
        },
        {
          "record_id": "relation_busway-has-treatment-restrictions",
          "record_kind": "relation",
          "display_name": "relation_busway_has_treatment_restrictions",
          "source_ids": [
            "34th_st_busway"
          ],
          "payload": {
            "relation_kind": "has_treatment",
            "subject_local_observation_id": "project_34th_street_busway",
            "object_local_observation_id": "treatment_busway_restrictions",
            "relation_family": "treatment_context",
            "subject_id": "project_34th-street-busway",
            "object_id": "treatment_busway-restrictions"
          },
          "evidence_examples": [
            {
              "source_id": "34th_st_busway",
              "block_id": "p002_c0007",
              "page_number": 2,
              "role": "treatment",
              "snippet": "6 AM – 10 PM / 7 days a week"
            }
          ]
        }
      ]
    },
    {
      "value": "agency_role",
      "count": 40,
      "records": [
        "relation_crichlow-president-of-nyct",
        "relation_data-analytics-manages-open-data",
        "relation_dot-and-mta-on-14th-st-busway",
        "relation_dot-implements-ll195"
      ],
      "representative_records": [
        {
          "record_id": "relation_crichlow-president-of-nyct",
          "record_kind": "relation",
          "display_name": "Demetrius Crichlow President New York City Transit",
          "source_ids": [
            "nyct_key_performance_metrics_doc194001"
          ],
          "payload": {
            "relation_kind": "leads_entity",
            "subject_local_observation_id": "entity_demetrius_crichlow",
            "object_local_observation_id": "entity_nyct_entity_update_2025",
            "relation_family": "agency_role",
            "subject_id": "entity_demetrius-crichlow",
            "object_id": "entity_mta-nyct"
          },
          "evidence_examples": [
            {
              "source_id": "nyct_key_performance_metrics_doc194001",
              "block_id": "p004_c0003",
              "page_number": 4,
              "role": "president_org",
              "snippet": "Demetrius Crichlow President New York City Transit"
            }
          ]
        },
        {
          "record_id": "relation_data-analytics-manages-open-data",
          "record_kind": "relation",
          "display_name": "Data & Analytics team manages Open Data program",
          "source_ids": [
            "open_data_program"
          ],
          "payload": {
            "relation_kind": "manages",
            "subject_local_observation_id": "entity_mta_data_analytics_team",
            "object_local_observation_id": "entity_mta_open_data_program",
            "description": "The MTA Open Data program is managed by the Data & Analytics team",
            "relation_family": "agency_role",
            "subject_id": "entity_mta-hq-data-analytics",
            "object_id": "entity_mta-nyct"
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
      "value": "publication_role",
      "count": 40,
      "records": [
        "relation_2025-datasets-claim",
        "relation_data-analytics-publishes-blog",
        "relation_mta-publishes-open-data-plan",
        "relation_published-by-project-behind-schedule-2025-entity-nyc-comptroller-brad-lander_4e068c20e4"
      ],
      "representative_records": [
        {
          "record_id": "relation_2025-datasets-claim",
          "record_kind": "relation",
          "display_name": "MTA Open Data Team published 48 new datasets in 2025",
          "source_ids": [
            "open_data_plan_2026_update"
          ],
          "payload": {
            "relation_kind": "published",
            "subject_local_observation_id": "entity_mta_open_data_team",
            "object_local_observation_id": "claim_new_datasets_2025_highlights",
            "relation_family": "publication_role",
            "subject_id": "entity_mta-open-data-team",
            "object_id": "claim_new-datasets-2025-highlights"
          },
          "evidence_examples": [
            {
              "source_id": "open_data_plan_2026_update",
              "block_id": "p003_c0002",
              "page_number": 3,
              "role": "relationship",
              "snippet": "Our team published 48 new data assets to New York State's open data portal, in 2025. We're particularly proud of our newest offerings from the past year as they addressed key gaps in our catalog and shared more granular..."
            }
          ]
        },
        {
          "record_id": "relation_data-analytics-publishes-blog",
          "record_kind": "relation",
          "display_name": "Data & Analytics team publishes blog posts",
          "source_ids": [
            "open_data_program"
          ],
          "payload": {
            "relation_kind": "publishes",
            "subject_local_observation_id": "entity_mta_data_analytics_team",
            "object_local_observation_id": "event_blog_curious_customers_2026",
            "description": "MTA Data & Analytics team publishes blog posts including Curious customers, cool tools, and open data",
            "relation_family": "publication_role",
            "subject_id": "entity_mta-hq-data-analytics",
            "object_id": "event_blog-curious-customers-2026"
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
      "value": "claim_context",
      "count": 28,
      "records": [
        "relation_has-claim-route-b44-sbs-claim-able-rollout-m14-b44-nov2019_a23fd3d839",
        "relation_has-claim-route-bx11-claim-bx11-frequency-improvement_3efe4a06fb",
        "relation_has-claim-route-bx13-claim-bx13-frequency-improvement_21e98e09a8",
        "relation_has-claim-route-bx15-ace-claim-bx15-split-m125-creation_2f17704194"
      ],
      "representative_records": [
        {
          "record_id": "relation_has-claim-route-b44-sbs-claim-able-rollout-m14-b44-nov2019_a23fd3d839",
          "record_kind": "relation",
          "display_name": "Nostrand Avenue-Rogers Avenue Select Bus Service (B44) has_claim ABLE rollout on M14 SBS and B44 SBS by Nov 2019",
          "source_ids": [
            "bronx_bus_network_final_plan_2019"
          ],
          "payload": {
            "relation_kind": "has_claim",
            "relation_family": "claim_context",
            "subject_local_observation_id": "route_b44_sbs",
            "object_local_observation_id": "claim_able_rollout_m14_b44_nov2019",
            "subject_id": "route_b44-sbs",
            "object_id": "claim_able-rollout-m14-b44-nov2019",
            "subject_record_kind": "route",
            "object_record_kind": "claim",
            "derived_relation": true,
            "derivation_rule": "claim-route-has-claim",
            "derivation_confidence": "exact_canonical_match",
            "derived_from_record_id": "claim_able-rollout-m14-b44-nov2019",
            "derived_from_payload_field": "routes",
            "derived_from_payload_value": "B44 SBS"
          },
          "evidence_examples": [
            {
              "source_id": "bronx_bus_network_final_plan_2019",
              "block_id": "p023_c0006",
              "page_number": 23,
              "role": "provides_data",
              "snippet": "Bus lanes separate buses from general traffic, improving speed and reliability. They are typically located along the curb or “offset” from the curb, allowing the curb lane to be utilized for other purposes. Ensuring tha..."
            }
          ]
        },
        {
          "record_id": "relation_has-claim-route-bx11-claim-bx11-frequency-improvement_3efe4a06fb",
          "record_kind": "relation",
          "display_name": "MTA Bus Bx11 has_claim Bx11 frequency improvement to 8-or-better",
          "source_ids": [
            "bronx_bus_network_final_plan_2019"
          ],
          "payload": {
            "relation_kind": "has_claim",
            "relation_family": "claim_context",
            "subject_local_observation_id": "route_bx11",
            "object_local_observation_id": "claim_bx11_frequency_improvement",
            "subject_id": "route_bx11",
            "object_id": "claim_bx11-frequency-improvement",
            "subject_record_kind": "route",
            "object_record_kind": "claim",
            "derived_relation": true,
            "derivation_rule": "claim-route-has-claim",
            "derivation_confidence": "exact_canonical_match",
            "derived_from_record_id": "claim_bx11-frequency-improvement",
            "derived_from_payload_field": "route",
            "derived_from_payload_value": "Bx11"
          },
          "evidence_examples": [
            {
              "source_id": "bronx_bus_network_final_plan_2019",
              "block_id": "p007_c0001",
              "page_number": 7,
              "role": "provides_data",
              "snippet": "Route Weekday Frequency Category (7a to 9p, peak direction) Existing Proposed Bx1 15-or-better 15-or-better Bx1 LTD Bx2 15-or-better 15-or-better Bx1/2 Combined 8-or-better 8-or-better Bx3 8-or-better 8-or-better Bx4 30..."
            }
          ]
        }
      ]
    },
    {
      "value": "partnership_engagement",
      "count": 23,
      "records": [
        "relation_datathon-partner",
        "relation_monitoring-partnership-public-works",
        "relation_monitoring-partnership-traffic-databank",
        "relation_mta-partner-project"
      ],
      "representative_records": [
        {
          "record_id": "relation_datathon-partner",
          "record_kind": "relation",
          "display_name": "MTA Open Data Team co-hosts CUNY Datathon with CUNY Macaulay Honors College",
          "source_ids": [
            "open_data_plan_2026_update"
          ],
          "payload": {
            "relation_kind": "co_hosted_with",
            "subject_local_observation_id": "entity_mta_open_data_team",
            "object_local_observation_id": "entity_cuny_macaulay_honors_college",
            "relation_family": "partnership_engagement",
            "subject_id": "entity_mta-open-data-team",
            "object_id": "entity_cuny-macaulay-honors-college"
          },
          "evidence_examples": [
            {
              "source_id": "open_data_plan_2026_update",
              "block_id": "p003_c0010",
              "page_number": 3,
              "role": "event_described",
              "snippet": "Our team always has a great time at our now annual datathon with CUNY Macaulay Honors College! The CUNY Datathon had students use MTA open data on buses to explore how students and faculty could get to their classroom m..."
            }
          ]
        },
        {
          "record_id": "relation_monitoring-partnership-public-works",
          "record_kind": "relation",
          "display_name": "relation_monitoring_partnership_public_works",
          "source_ids": [
            "14th_street_fall2019_monitoring"
          ],
          "payload": {
            "relation_kind": "public_engagement_partner",
            "subject_local_observation_id": "project_14th_street_ttp_pilot",
            "object_local_observation_id": "entity_public_works_partners",
            "description": "Sam Schwartz partnering with Public Works Partners for public engagement",
            "relation_family": "partnership_engagement",
            "subject_id": "project_14th-street-transit-truck-priority-pilot",
            "object_id": "entity_public-works-partners"
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
    },
    {
      "value": "governance_legal",
      "count": 11,
      "records": [
        "relation_annual-update-applies-to-streets-plan",
        "relation_city-council-passed-ll195",
        "relation_corridor-vision-zero",
        "relation_law-195-mandates-streets-plan"
      ],
      "representative_records": [
        {
          "record_id": "relation_annual-update-applies-to-streets-plan",
          "record_kind": "relation",
          "display_name": "Annual update requirement applies to NYC Streets Plan",
          "source_ids": [
            "streets_plan"
          ],
          "payload": {
            "relation_kind": "has_update_requirement",
            "subject_local_observation_id": "project_nyc_streets_plan_landing",
            "object_local_observation_id": "claim_annual_update_requirement",
            "description": "The law requires NYC DOT to publish an annual update on the plan describing progress from the prior year.",
            "relation_family": "governance_legal",
            "subject_id": "project_nyc-streets-plan-2021",
            "object_id": "claim_annual-update-requirement"
          },
          "evidence_examples": [
            {
              "source_id": "streets_plan",
              "block_id": "p001_b0001",
              "page_number": 1,
              "role": "relation_evidence",
              "snippet": "NYC DOT - NYC Streets Plan Skip to main content NYC NYC Resources 311 Office of the Mayor About NYC DOT NYC Streets Plan The future of New York City is one where everyone has access to reliable and environmentally-frien..."
            }
          ]
        },
        {
          "record_id": "relation_city-council-passed-ll195",
          "record_kind": "relation",
          "display_name": "relation_city_council_passed_ll195",
          "source_ids": [
            "speeding_up_slowly_2025"
          ],
          "payload": {
            "relation_kind": "enacted",
            "subject_local_observation_id": "entity_nyc_council",
            "object_local_observation_id": "project_local_law_195_2019",
            "description": "City Council passed Local Law 195 of 2019 in November 2019.",
            "relation_family": "governance_legal",
            "subject_id": "entity_nyc-council",
            "object_id": "project_local-law-195-2019"
          },
          "evidence_examples": [
            {
              "source_id": "speeding_up_slowly_2025",
              "block_id": "p010_c0008",
              "page_number": 10,
              "snippet": "The City is not on track to meet the benchmarks established by LL195 of 2019. In November 2019, the City Council passed LL195 , directing DOT to develop and implement a series of 5-year transportation master plans that..."
            }
          ]
        }
      ]
    },
    {
      "value": "program_project_scope",
      "count": 11,
      "records": [
        "relation_14th-st-project",
        "relation_mta-has-open-data-program",
        "relation_nycdot-complemented-congestion-relief",
        "relation_part-of-program-project-jamaica-busway-project-better-buses-restart-2021_066f2d3eee"
      ],
      "representative_records": [
        {
          "record_id": "relation_14th-st-project",
          "record_kind": "relation",
          "display_name": "14th Street Select Bus Service with Transit & Truck Priority Pilot Project",
          "source_ids": [
            "brt_route_index"
          ],
          "payload": {
            "relation_kind": "has_project",
            "subject_local_observation_id": "route_34th_st_sbs",
            "object_local_observation_id": "project_14th_st_transit_truck_priority",
            "relation_family": "program_project_scope",
            "subject_id": "route_34th-st-sbs",
            "object_id": "project_14th-street-transit-truck-priority-pilot"
          },
          "evidence_examples": [
            {
              "source_id": "brt_route_index",
              "block_id": "p001_b0001",
              "page_number": 1,
              "role": "relation",
              "snippet": "Bus Rapid Transit - Routes Skip to main content NYC NYC Resources 311 Office of the Mayor Routes Existing Routes 16 Select Bus Service routes have been implemented throughout New York City, incorporating various element..."
            }
          ]
        },
        {
          "record_id": "relation_mta-has-open-data-program",
          "record_kind": "relation",
          "display_name": "MTA has Open Data Program",
          "source_ids": [
            "open_data_program"
          ],
          "payload": {
            "relation_kind": "has_program",
            "subject_local_observation_id": "entity_mta_open_data_program",
            "object_local_observation_id": "source_open_data_program_page",
            "description": "MTA runs the Open Data Program described on this page",
            "relation_family": "program_project_scope",
            "subject_id": "entity_mta-nyct",
            "object_id": "source_open-data-program"
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
      "value": "data_reporting",
      "count": 10,
      "records": [
        "relation_data-sources-citi-bike",
        "relation_data-sources-inrix",
        "relation_data-sources-mta-nyct",
        "relation_data-sources-nycdot"
      ],
      "representative_records": [
        {
          "record_id": "relation_data-sources-citi-bike",
          "record_kind": "relation",
          "display_name": "relation_data_sources_citi_bike",
          "source_ids": [
            "14th_street_fall2019_monitoring"
          ],
          "payload": {
            "relation_kind": "data_source",
            "subject_local_observation_id": "project_14th_street_ttp_pilot",
            "object_local_observation_id": "entity_citi_bike",
            "description": "Citi Bike provided bikeshare ridership data",
            "relation_family": "data_reporting",
            "subject_id": "project_14th-street-transit-truck-priority-pilot",
            "object_id": "entity_citi-bike"
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
        },
        {
          "record_id": "relation_data-sources-inrix",
          "record_kind": "relation",
          "display_name": "relation_data_sources_inrix",
          "source_ids": [
            "14th_street_fall2019_monitoring"
          ],
          "payload": {
            "relation_kind": "data_source",
            "subject_local_observation_id": "project_14th_street_ttp_pilot",
            "object_local_observation_id": "entity_inrix",
            "description": "INRIX provided vehicle travel time and speed data",
            "relation_family": "data_reporting",
            "subject_id": "project_14th-street-transit-truck-priority-pilot",
            "object_id": "entity_inrix"
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
    },
    {
      "value": "other",
      "count": 10,
      "records": [
        "relation_m34-serves-corridor",
        "relation_m34a-serves-corridor",
        "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5",
        "relation_rel-ace-routes-expansion"
      ],
      "representative_records": [
        {
          "record_id": "relation_m34-serves-corridor",
          "record_kind": "relation",
          "display_name": "relation_m34_serves_corridor",
          "source_ids": [
            "34th_st_busway"
          ],
          "payload": {
            "relation_kind": "serves",
            "subject_local_observation_id": "route_m34_sbs",
            "object_local_observation_id": "corridor_34th_st_busway",
            "relation_family": "other",
            "subject_id": "route_m34-sbs",
            "object_id": "corridor_34th-st-busway"
          },
          "evidence_examples": [
            {
              "source_id": "34th_st_busway",
              "block_id": "p002_c0005",
              "page_number": 2,
              "role": "route_on_corridor",
              "snippet": "• Increase bus speeds and reliability for 28,000+ daily bus riders on M34/M34A SBS and 22 express bus routes. • Improve truck movement and deliveries to local businesses along 34th Street."
            }
          ]
        },
        {
          "record_id": "relation_m34a-serves-corridor",
          "record_kind": "relation",
          "display_name": "relation_m34a_serves_corridor",
          "source_ids": [
            "34th_st_busway"
          ],
          "payload": {
            "relation_kind": "serves",
            "subject_local_observation_id": "route_m34a_sbs",
            "object_local_observation_id": "corridor_34th_st_busway",
            "relation_family": "other",
            "subject_id": "route_m34a-sbs",
            "object_id": "corridor_34th-st-busway"
          },
          "evidence_examples": [
            {
              "source_id": "34th_st_busway",
              "block_id": "p002_c0005",
              "page_number": 2,
              "role": "route_on_corridor",
              "snippet": "• Increase bus speeds and reliability for 28,000+ daily bus riders on M34/M34A SBS and 22 express bus routes. • Improve truck movement and deliveries to local businesses along 34th Street."
            }
          ]
        }
      ]
    },
    {
      "value": "dependency_or_reference",
      "count": 9,
      "records": [
        "relation_congestion-relief-2nd-3rd-ave",
        "relation_rel-bx6-local-postponement-depends-on-sbs-realignment",
        "relation_rel-jamaica-depot-improves-queens-service",
        "relation_rel-m86-sbs-informs-m79"
      ],
      "representative_records": [
        {
          "record_id": "relation_congestion-relief-2nd-3rd-ave",
          "record_kind": "relation",
          "display_name": "relation_congestion_relief_2nd_3rd_ave",
          "source_ids": [
            "streets_plan_update_2026"
          ],
          "payload": {
            "relation_kind": "complementary_project",
            "subject_local_observation_id": "metric_congestion_relief_traffic_reduction",
            "object_local_observation_id": "project_2nd_3rd_ave_protected_lanes",
            "description": "NYC DOT complemented the Congestion Relief program with new protected bus and bike lanes and expanded pedestrian space on 2nd and 3rd Avenues.",
            "relation_family": "dependency_or_reference",
            "subject_id": "metric_congestion-relief-traffic-reduction",
            "object_id": "project_2nd-3rd-ave-protected-lanes"
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
          "record_id": "relation_rel-bx6-local-postponement-depends-on-sbs-realignment",
          "record_kind": "relation",
          "display_name": "Bx6 Local postponement depends on Bx6 SBS realignment",
          "source_ids": [
            "bronx_bus_network_final_plan_addendum_2021"
          ],
          "payload": {
            "relation_kind": "depends_on_realignment_of",
            "subject_local_observation_id": "event_bx6_local_schedule_changes_postponed_2023",
            "object_local_observation_id": "route_bx6_sbs_addendum_update",
            "relation_family": "dependency_or_reference",
            "subject_id": "event_bx6-local-schedule-changes-postponed-2023",
            "object_id": "route_bx6-sbs"
          },
          "evidence_examples": [
            {
              "source_id": "bronx_bus_network_final_plan_addendum_2021",
              "block_id": "p003_c0004",
              "page_number": 3,
              "snippet": "• Due to the 18-month pause caused by the COVID-19 pandemic, Bx6 SBS implementation has been delayed until 2023 to coincide with the retirement of the MetroCard and the full deployment of OMNY across the city. Also, all..."
            }
          ]
        }
      ]
    },
    {
      "value": "organization_hierarchy",
      "count": 9,
      "records": [
        "relation_mta-odt-part-of-mta",
        "relation_part-of-agency-entity-bureau-of-policy-and-research-entity-nyc-comptroller-brad-lander_449d41b96f",
        "relation_part-of-agency-entity-cm-carmen-de-la-rosa-entity-nyc-council_bee40b45d1",
        "relation_part-of-agency-entity-janno-lieber-2025-entity-mta-entity-update-2025_b7f1468f41"
      ],
      "representative_records": [
        {
          "record_id": "relation_mta-odt-part-of-mta",
          "record_kind": "relation",
          "display_name": "MTA Open Data Team is part of MTA",
          "source_ids": [
            "open_data_plan_2026_update"
          ],
          "payload": {
            "relation_kind": "part_of",
            "subject_local_observation_id": "entity_mta_open_data_team",
            "object_local_observation_id": "entity_metropolitan_transportation_authority",
            "relation_family": "organization_hierarchy",
            "subject_id": "entity_mta-open-data-team",
            "object_id": "entity_mta-nyct"
          },
          "evidence_examples": [
            {
              "source_id": "open_data_plan_2026_update",
              "block_id": "p001_c0001",
              "page_number": 1,
              "role": "entity_identity",
              "snippet": "The Metropolitan Transportation Authority (MTA) logo, featuring the letters \"MTA\" in white inside a blue circle."
            }
          ]
        },
        {
          "record_id": "relation_part-of-agency-entity-bureau-of-policy-and-research-entity-nyc-comptroller-brad-lander_449d41b96f",
          "record_kind": "relation",
          "display_name": "Bureau of Policy and Research part_of_agency New York City Comptroller Brad Lander",
          "source_ids": [
            "behind_schedule_2025"
          ],
          "payload": {
            "relation_kind": "part_of_agency",
            "relation_family": "organization_hierarchy",
            "subject_local_observation_id": "entity_bureau_of_policy_and_research",
            "object_local_observation_id": "entity_nyc_comptroller_brad_lander",
            "subject_id": "entity_bureau-of-policy-and-research",
            "object_id": "entity_nyc-comptroller-brad-lander",
            "subject_record_kind": "entity",
            "object_record_kind": "entity",
            "derived_relation": true,
            "derivation_rule": "entity-organization",
            "derivation_confidence": "exact_canonical_match",
            "derived_from_record_id": "entity_bureau-of-policy-and-research",
            "derived_from_payload_field": "parent_entity",
            "derived_from_payload_value": "New York City Comptroller Brad Lander"
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
      "value": "location_scope",
      "count": 6,
      "records": [
        "relation_project-proximate-to-yankee-stadium",
        "relation_rel-jamaica-bus-depot-in-queens",
        "relation_rel-jamaica-bus-depot-queens",
        "relation_rel-jamaica-terminal-old-new-locations"
      ],
      "representative_records": [
        {
          "record_id": "relation_project-proximate-to-yankee-stadium",
          "record_kind": "relation",
          "display_name": "relation_project_proximate_to_yankee_stadium",
          "source_ids": [
            "161st_bx6_capital_project_2026"
          ],
          "payload": {
            "relation_kind": "proximate_to",
            "subject_local_observation_id": "project_east_161st_st_bx6_capital",
            "object_local_observation_id": "entity_yankee_stadium",
            "relation_family": "location_scope",
            "subject_id": "project_east-161st-st-bx6-capital",
            "object_id": "entity_yankee-stadium"
          },
          "evidence_examples": [
            {
              "source_id": "161st_bx6_capital_project_2026",
              "block_id": "p001_b0001",
              "page_number": 1,
              "role": "location_relationship",
              "snippet": "Ahead of Opening Day, Mamdani Administration Breaks Ground on Project to Improve Bronx Crosstown Bus Service and Safety Near Yankee Stadium - NYC Mayor's Office Skip to main content Official website. How you know <b>Off..."
            }
          ]
        },
        {
          "record_id": "relation_rel-jamaica-bus-depot-in-queens",
          "record_kind": "relation",
          "display_name": "Jamaica Bus Depot located in Queens",
          "source_ids": [
            "nyct_key_performance_metrics_june2025"
          ],
          "payload": {
            "relation_kind": "located_in",
            "subject_local_observation_id": "project_jamaica_bus_depot_rebuild",
            "object_local_observation_id": "project_queens_bus_network_redesign_june2025",
            "description": "Jamaica Bus Depot rebuild serves Queens borough, same area as QBNR",
            "relation_family": "location_scope",
            "subject_id": "project_jamaica-bus-depot-rebuild",
            "object_id": "project_queens-bus-network-redesign"
          },
          "evidence_examples": [
            {
              "source_id": "nyct_key_performance_metrics_june2025",
              "block_id": "p024_c0002",
              "page_number": 24,
              "role": "states_relationship",
              "snippet": "Jamaica Bus Depot"
            }
          ]
        }
      ]
    },
    {
      "value": "ownership_role",
      "count": 4,
      "records": [
        "relation_mta-bus-company-owned-by-mta",
        "relation_mta-nyct-and-bus-company-owned-by-mta",
        "relation_railcar-facility-owned-by-nyct",
        "relation_rel-project-owner-mta"
      ],
      "representative_records": [
        {
          "record_id": "relation_mta-bus-company-owned-by-mta",
          "record_kind": "relation",
          "display_name": "relation_mta_bus_company_owned_by_mta",
          "source_ids": [
            "speeding_up_slowly_2025"
          ],
          "payload": {
            "relation_kind": "owned_by",
            "subject_local_observation_id": "entity_mta_bus_company",
            "object_local_observation_id": "entity_mta",
            "description": "MTA Bus Company and New York City Transit are both owned and run by the MTA.",
            "relation_family": "ownership_role",
            "subject_id": "entity_mta-bus-company",
            "object_id": "entity_mta-entity-update-2025"
          },
          "evidence_examples": [
            {
              "source_id": "speeding_up_slowly_2025",
              "block_id": "p006_c0008",
              "page_number": 6,
              "snippet": "Concerns about slow buses—as highlighted in the 2017 City Comptroller report —are not new, nor are New York City bus speeds reflective of a general trend across urban bus systems. Rather, New York City buses are among t..."
            }
          ]
        },
        {
          "record_id": "relation_mta-nyct-and-bus-company-owned-by-mta",
          "record_kind": "relation",
          "display_name": "relation_mta_nyct_and_bus_company_owned_by_mta",
          "source_ids": [
            "speeding_up_slowly_2025"
          ],
          "payload": {
            "relation_kind": "owned_by",
            "subject_local_observation_id": "entity_mta_nyct_reference",
            "object_local_observation_id": "entity_mta",
            "description": "MTA Bus Company and New York City Transit are both owned and run by the MTA.",
            "relation_family": "ownership_role",
            "subject_id": "entity_mta-nyct",
            "object_id": "entity_mta-entity-update-2025"
          },
          "evidence_examples": [
            {
              "source_id": "speeding_up_slowly_2025",
              "block_id": "p006_c0008",
              "page_number": 6,
              "snippet": "Concerns about slow buses—as highlighted in the 2017 City Comptroller report —are not new, nor are New York City bus speeds reflective of a general trend across urban bus systems. Rather, New York City buses are among t..."
            }
          ]
        }
      ]
    },
    {
      "value": "funding_award",
      "count": 3,
      "records": [
        "relation_awarded-by-betanyc",
        "relation_rel-nyct-receives-funding",
        "relation_rel-panynj-funds-project"
      ],
      "representative_records": [
        {
          "record_id": "relation_awarded-by-betanyc",
          "record_kind": "relation",
          "display_name": "MTA Open Data Team awarded Civic Innovator Award by BetaNYC",
          "source_ids": [
            "open_data_plan_2026_update"
          ],
          "payload": {
            "relation_kind": "awarded_by",
            "subject_local_observation_id": "entity_mta_open_data_team",
            "object_local_observation_id": "entity_betanyc",
            "relation_family": "funding_award",
            "subject_id": "entity_mta-open-data-team",
            "object_id": "entity_betanyc"
          },
          "evidence_examples": [
            {
              "source_id": "open_data_plan_2026_update",
              "block_id": "p004_c0001",
              "page_number": 4,
              "role": "award_description",
              "snippet": "Finally, the MTA Open Data Team was awarded BetaNYC's inaugural Civic Innovator Award. This award recognizes organizations, teams, and community groups that are making NYC more open, accessible, and equitable through op..."
            }
          ]
        },
        {
          "record_id": "relation_rel-nyct-receives-funding",
          "record_kind": "relation",
          "display_name": "rel_nyct_receives_funding",
          "source_ids": [
            "q70_fare_free_service_increases_2025"
          ],
          "payload": {
            "relation_kind": "receives_funding_from",
            "subject_local_observation_id": "entity_nyct_2025_q70",
            "object_local_observation_id": "entity_port_authority_ny_nj_2025",
            "relation_family": "funding_award",
            "subject_id": "entity_mta-nyct",
            "object_id": "entity_port-authority-ny-nj"
          },
          "evidence_examples": [
            {
              "source_id": "q70_fare_free_service_increases_2025",
              "block_id": "p001_c0006",
              "page_number": 1,
              "role": "panynj_provides_funding_to_nyct",
              "snippet": "The Q70 has been operated fare free since May 2022 in partnership with the Port Authority of New York and New Jersey (PANYNJ), which provides funding to NYCT for the net increase in operating costs associated with provi..."
            }
          ]
        }
      ]
    }
  ],
  "other_family_records": [
    {
      "record_id": "relation_m34-serves-corridor",
      "record_kind": "relation",
      "display_name": "relation_m34_serves_corridor",
      "source_ids": [
        "34th_st_busway"
      ],
      "payload": {
        "relation_kind": "serves",
        "subject_local_observation_id": "route_m34_sbs",
        "object_local_observation_id": "corridor_34th_st_busway",
        "relation_family": "other",
        "subject_id": "route_m34-sbs",
        "object_id": "corridor_34th-st-busway"
      },
      "evidence_examples": [
        {
          "source_id": "34th_st_busway",
          "block_id": "p002_c0005",
          "page_number": 2,
          "role": "route_on_corridor",
          "snippet": "• Increase bus speeds and reliability for 28,000+ daily bus riders on M34/M34A SBS and 22 express bus routes. • Improve truck movement and deliveries to local businesses along 34th Street."
        }
      ]
    },
    {
      "record_id": "relation_m34a-serves-corridor",
      "record_kind": "relation",
      "display_name": "relation_m34a_serves_corridor",
      "source_ids": [
        "34th_st_busway"
      ],
      "payload": {
        "relation_kind": "serves",
        "subject_local_observation_id": "route_m34a_sbs",
        "object_local_observation_id": "corridor_34th_st_busway",
        "relation_family": "other",
        "subject_id": "route_m34a-sbs",
        "object_id": "corridor_34th-st-busway"
      },
      "evidence_examples": [
        {
          "source_id": "34th_st_busway",
          "block_id": "p002_c0005",
          "page_number": 2,
          "role": "route_on_corridor",
          "snippet": "• Increase bus speeds and reliability for 28,000+ daily bus riders on M34/M34A SBS and 22 express bus routes. • Improve truck movement and deliveries to local businesses along 34th Street."
        }
      ]
    },
    {
      "record_id": "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5",
      "record_kind": "relation",
      "display_name": "ACE Program expanded to five new bus routes",
      "source_ids": [
        "nyct_key_performance_metrics_june2025"
      ],
      "payload": {
        "relation_kind": "applies_to",
        "subject_local_observation_id": "entity_ace_program",
        "object_local_observation_id": "project_jamaica_bus_terminal_relocation",
        "description": "ACE program expanded to M2, M4, M42, M100, and Bx5 routes",
        "routes": [
          "M2",
          "M4",
          "M42",
          "M100",
          "Bx5"
        ],
        "relation_family": "other",
        "subject_id": "entity_ace-program",
        "object_id": "project_jamaica-bus-terminal-relocation"
      },
      "evidence_examples": [
        {
          "source_id": "nyct_key_performance_metrics_june2025",
          "block_id": "p005_c0003",
          "page_number": 5,
          "role": "states_relationship",
          "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
        }
      ]
    },
    {
      "record_id": "relation_rel-ace-routes-expansion",
      "record_kind": "relation",
      "display_name": "ACE Program expanded to five routes",
      "source_ids": [
        "nyct_key_performance_metrics_june2025"
      ],
      "payload": {
        "relation_kind": "applies_to",
        "subject_local_observation_id": "entity_ace_program",
        "object_local_observation_id": "entity_ace_program",
        "routes_affected": [
          "M2",
          "M4",
          "M42",
          "M100",
          "Bx5"
        ],
        "description": "ACE program expanded to five new bus routes",
        "relation_family": "other",
        "subject_id": "entity_ace-program",
        "object_id": "entity_ace-program"
      },
      "evidence_examples": [
        {
          "source_id": "nyct_key_performance_metrics_june2025",
          "block_id": "p005_c0003",
          "page_number": 5,
          "role": "states_relationship",
          "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
        }
      ]
    },
    {
      "record_id": "relation_rel-f-m-swap-improves-subway-reliability",
      "record_kind": "relation",
      "display_name": "F/M Swap improves subway reliability",
      "source_ids": [
        "nyct_key_performance_metrics_june2025"
      ],
      "payload": {
        "relation_kind": "improves",
        "subject_local_observation_id": "project_f_m_swap_2025",
        "object_local_observation_id": "project_f_m_swap_2025",
        "description": "F/M swap increases subway reliability, reduces delays, shortens travel times",
        "relation_family": "other",
        "subject_id": "project_f-m-swap-2025",
        "object_id": "project_f-m-swap-2025"
      },
      "evidence_examples": [
        {
          "source_id": "nyct_key_performance_metrics_june2025",
          "block_id": "p006_c0003",
          "page_number": 6,
          "role": "states_relationship",
          "snippet": "And there's more improvement coming. Later this year, we'll be updating the subway map again, for the second time in 2025, with a new service adjustment. We're calling it the F / M swap. The F train will join the E alon..."
        }
      ]
    },
    {
      "record_id": "relation_rel-interim-terminal-serves-mta-nice-routes",
      "record_kind": "relation",
      "display_name": "168th St Interim Terminal serves MTA and NICE bus routes",
      "source_ids": [
        "nyct_key_performance_metrics_june2025"
      ],
      "payload": {
        "relation_kind": "serves",
        "subject_local_observation_id": "entity_168th_interim_terminal",
        "object_local_observation_id": "entity_168th_interim_terminal",
        "description": "168th St Interim Terminal serves 10 MTA bus routes and 5 NICE bus routes, nearly 10,000 daily riders",
        "relation_family": "other",
        "subject_id": "entity_168th-interim-terminal",
        "object_id": "entity_168th-interim-terminal"
      },
      "evidence_examples": [
        {
          "source_id": "nyct_key_performance_metrics_june2025",
          "block_id": "p010_c0011",
          "page_number": 10,
          "role": "states_relationship",
          "snippet": "This month the MTA officially relocated bus operations to the new interim 168th Street Bus Terminal in Jamaica, Queens, effective Sunday, June 1, 2025. This move temporarily replaces the 165th Street Bus Terminal, which..."
        }
      ]
    },
    {
      "record_id": "relation_rel-m86-local-serves-corridor-86th",
      "record_kind": "relation",
      "display_name": "rel_m86_local_serves_corridor_86th",
      "source_ids": [
        "m86_sbs_progress_report_2017"
      ],
      "payload": {
        "relation_kind": "serves",
        "subject_local_observation_id": "route_m86_local_2017",
        "object_local_observation_id": "corridor_86th_street_2017",
        "description": "M86 Local served the 86th Street crosstown corridor prior to SBS conversion",
        "relation_family": "other",
        "subject_id": "route_m86-local",
        "object_id": "corridor_86th-street"
      },
      "evidence_examples": [
        {
          "source_id": "m86_sbs_progress_report_2017",
          "block_id": "p002_c0002",
          "page_number": 2,
          "role": "m86_route_serves_corridor",
          "snippet": "The 86th Street crosstown corridor connects the dense and vibrant Manhattan neighborhoods of the Upper East Side and Upper West Side. Although bus ridership on the M86 bus route serving the corridor had the highest per-..."
        }
      ]
    },
    {
      "record_id": "relation_rel-m86-sbs-serves-corridor-86th",
      "record_kind": "relation",
      "display_name": "rel_m86_sbs_serves_corridor_86th",
      "source_ids": [
        "m86_sbs_progress_report_2017"
      ],
      "payload": {
        "relation_kind": "serves",
        "subject_local_observation_id": "route_m86_sbs_2017",
        "object_local_observation_id": "corridor_86th_street_2017",
        "description": "M86 SBS route operates on the 86th Street crosstown corridor",
        "relation_family": "other",
        "subject_id": "route_m86-sbs",
        "object_id": "corridor_86th-street"
      },
      "evidence_examples": [
        {
          "source_id": "m86_sbs_progress_report_2017",
          "block_id": "p002_c0002",
          "page_number": 2,
          "role": "corridor_route_relation",
          "snippet": "The 86th Street crosstown corridor connects the dense and vibrant Manhattan neighborhoods of the Upper East Side and Upper West Side. Although bus ridership on the M86 bus route serving the corridor had the highest per-..."
        }
      ]
    },
    {
      "record_id": "relation_rel-program-uses-portal",
      "record_kind": "relation",
      "display_name": "Open Data Program uses NY State open data portal",
      "source_ids": [
        "open_data_lessons_2026"
      ],
      "payload": {
        "relation_kind": "uses",
        "subject_local_observation_id": "project_mta_open_data_program",
        "object_local_observation_id": "entity_ny_open_data_portal",
        "description": "Program publishes datasets to data.ny.gov portal",
        "relation_family": "other",
        "subject_id": "project_mta-open-data-program",
        "object_id": "entity_ny-open-data-portal"
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
      "record_id": "relation_rel-route-m86-on-corridor-86th",
      "record_kind": "relation",
      "display_name": "rel_route_m86_on_corridor_86th",
      "source_ids": [
        "m86_sbs_progress_report_2017"
      ],
      "payload": {
        "relation_kind": "serves",
        "subject_local_observation_id": "route_m86",
        "object_local_observation_id": "corridor_86th_street",
        "relation_family": "other",
        "subject_id": "route_m86-sbs",
        "object_id": "corridor_86th-street"
      },
      "evidence_examples": [
        {
          "source_id": "m86_sbs_progress_report_2017",
          "block_id": "p003_c0006",
          "page_number": 3,
          "role": "route_corridor",
          "snippet": "M86 Route"
        }
      ]
    }
  ]
}
```

### relation-ontology:relation-context:relation.hotline

- Category: relation_context_field
- Priority: 100
- Record kind: relation
- Field: hotline
- Count: 1
- Title: Relation payload field hotline should be reviewed for endpoint/context shape
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Suggested relation family: endpoint_fix or additional relation.
- relation.hotline appears on 1 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "(929) 380-5778",
    "count": 1,
    "records": [
      "relation_rel-jamaica-depot-skanska-hotline"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-jamaica-depot-skanska-hotline",
        "record_kind": "relation",
        "display_name": "Jamaica Bus Depot project hotline with Skanska",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "has_partner",
          "subject_local_observation_id": "project_jamaica_bus_depot_rebuild",
          "object_local_observation_id": "project_jamaica_bus_depot_rebuild",
          "description": "MTA and Skanska collaboration on Jamaica Bus Depot",
          "hotline": "(929) 380-5778",
          "relation_family": "partnership_engagement",
          "subject_id": "project_jamaica-bus-depot-rebuild",
          "object_id": "project_jamaica-bus-depot-rebuild"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p024_c0007",
            "page_number": 24,
            "role": "states_relationship",
            "snippet": "The MTA remains committed to investing in the local community. For the first time, the MTA is piloting local hiring goals which aim to have 20% of the New York State workforce for this project come from Southeast Queens..."
          }
        ]
      }
    ]
  }
]
```

### relation-ontology:relation-context:relation.new_location

- Category: relation_context_field
- Priority: 100
- Record kind: relation
- Field: new_location
- Count: 1
- Title: Relation payload field new_location should be reviewed for endpoint/context shape
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Suggested relation family: endpoint_fix or additional relation.
- relation.new_location appears on 1 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "90th Avenue",
    "count": 1,
    "records": [
      "relation_rel-jamaica-terminal-old-new-locations"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-jamaica-terminal-old-new-locations",
        "record_kind": "relation",
        "display_name": "Jamaica Bus Terminal moved from Merrick to 90th Avenue",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "relocated_from",
          "subject_local_observation_id": "project_jamaica_bus_terminal_relocation",
          "object_local_observation_id": "project_jamaica_bus_terminal_relocation",
          "old_location": "Merrick Boulevard",
          "new_location": "90th Avenue",
          "description": "Jamaica Bus Terminal moved from Merrick Boulevard to new facility on 90th Avenue",
          "old_location_normalized": {
            "raw_text": "Merrick Boulevard"
          },
          "new_location_normalized": {
            "raw_text": "90th Avenue"
          },
          "relation_family": "location_scope",
          "subject_id": "project_jamaica-bus-terminal-relocation",
          "object_id": "project_jamaica-bus-terminal-relocation"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0005",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "The timing of the Queens Bus Network Redesign is also aligned with another major development: the relocation of the Jamaica Bus Terminal. The terminal is moving from Merrick Boulevard to a new, state-of-the-art facility..."
          }
        ]
      }
    ]
  }
]
```

### relation-ontology:relation-context:relation.old_location

- Category: relation_context_field
- Priority: 100
- Record kind: relation
- Field: old_location
- Count: 1
- Title: Relation payload field old_location should be reviewed for endpoint/context shape
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Suggested relation family: endpoint_fix or additional relation.
- relation.old_location appears on 1 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Merrick Boulevard",
    "count": 1,
    "records": [
      "relation_rel-jamaica-terminal-old-new-locations"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-jamaica-terminal-old-new-locations",
        "record_kind": "relation",
        "display_name": "Jamaica Bus Terminal moved from Merrick to 90th Avenue",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "relocated_from",
          "subject_local_observation_id": "project_jamaica_bus_terminal_relocation",
          "object_local_observation_id": "project_jamaica_bus_terminal_relocation",
          "old_location": "Merrick Boulevard",
          "new_location": "90th Avenue",
          "description": "Jamaica Bus Terminal moved from Merrick Boulevard to new facility on 90th Avenue",
          "old_location_normalized": {
            "raw_text": "Merrick Boulevard"
          },
          "new_location_normalized": {
            "raw_text": "90th Avenue"
          },
          "relation_family": "location_scope",
          "subject_id": "project_jamaica-bus-terminal-relocation",
          "object_id": "project_jamaica-bus-terminal-relocation"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0005",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "The timing of the Queens Bus Network Redesign is also aligned with another major development: the relocation of the Jamaica Bus Terminal. The terminal is moving from Merrick Boulevard to a new, state-of-the-art facility..."
          }
        ]
      }
    ]
  }
]
```

### relation-ontology:relation-context:relation.routes

- Category: relation_context_field
- Priority: 100
- Record kind: relation
- Field: routes
- Count: 1
- Title: Relation payload field routes should be reviewed for endpoint/context shape
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Suggested relation family: endpoint_fix or additional relation.
- relation.routes appears on 1 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Bx5",
    "count": 1,
    "records": [
      "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5",
        "record_kind": "relation",
        "display_name": "ACE Program expanded to five new bus routes",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "applies_to",
          "subject_local_observation_id": "entity_ace_program",
          "object_local_observation_id": "project_jamaica_bus_terminal_relocation",
          "description": "ACE program expanded to M2, M4, M42, M100, and Bx5 routes",
          "routes": [
            "M2",
            "M4",
            "M42",
            "M100",
            "Bx5"
          ],
          "relation_family": "other",
          "subject_id": "entity_ace-program",
          "object_id": "project_jamaica-bus-terminal-relocation"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
          }
        ]
      }
    ]
  },
  {
    "value": "M100",
    "count": 1,
    "records": [
      "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5",
        "record_kind": "relation",
        "display_name": "ACE Program expanded to five new bus routes",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "applies_to",
          "subject_local_observation_id": "entity_ace_program",
          "object_local_observation_id": "project_jamaica_bus_terminal_relocation",
          "description": "ACE program expanded to M2, M4, M42, M100, and Bx5 routes",
          "routes": [
            "M2",
            "M4",
            "M42",
            "M100",
            "Bx5"
          ],
          "relation_family": "other",
          "subject_id": "entity_ace-program",
          "object_id": "project_jamaica-bus-terminal-relocation"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
          }
        ]
      }
    ]
  },
  {
    "value": "M2",
    "count": 1,
    "records": [
      "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5",
        "record_kind": "relation",
        "display_name": "ACE Program expanded to five new bus routes",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "applies_to",
          "subject_local_observation_id": "entity_ace_program",
          "object_local_observation_id": "project_jamaica_bus_terminal_relocation",
          "description": "ACE program expanded to M2, M4, M42, M100, and Bx5 routes",
          "routes": [
            "M2",
            "M4",
            "M42",
            "M100",
            "Bx5"
          ],
          "relation_family": "other",
          "subject_id": "entity_ace-program",
          "object_id": "project_jamaica-bus-terminal-relocation"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
          }
        ]
      }
    ]
  },
  {
    "value": "M4",
    "count": 1,
    "records": [
      "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5",
        "record_kind": "relation",
        "display_name": "ACE Program expanded to five new bus routes",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "applies_to",
          "subject_local_observation_id": "entity_ace_program",
          "object_local_observation_id": "project_jamaica_bus_terminal_relocation",
          "description": "ACE program expanded to M2, M4, M42, M100, and Bx5 routes",
          "routes": [
            "M2",
            "M4",
            "M42",
            "M100",
            "Bx5"
          ],
          "relation_family": "other",
          "subject_id": "entity_ace-program",
          "object_id": "project_jamaica-bus-terminal-relocation"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
          }
        ]
      }
    ]
  },
  {
    "value": "M42",
    "count": 1,
    "records": [
      "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-ace-expanded-routes-m2-m4-m42-m100-bx5",
        "record_kind": "relation",
        "display_name": "ACE Program expanded to five new bus routes",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "applies_to",
          "subject_local_observation_id": "entity_ace_program",
          "object_local_observation_id": "project_jamaica_bus_terminal_relocation",
          "description": "ACE program expanded to M2, M4, M42, M100, and Bx5 routes",
          "routes": [
            "M2",
            "M4",
            "M42",
            "M100",
            "Bx5"
          ],
          "relation_family": "other",
          "subject_id": "entity_ace-program",
          "object_id": "project_jamaica-bus-terminal-relocation"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
          }
        ]
      }
    ]
  }
]
```

### relation-ontology:relation-context:relation.routes_affected

- Category: relation_context_field
- Priority: 100
- Record kind: relation
- Field: routes_affected
- Count: 1
- Title: Relation payload field routes_affected should be reviewed for endpoint/context shape
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Suggested relation family: endpoint_fix or additional relation.
- relation.routes_affected appears on 1 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Bx5",
    "count": 1,
    "records": [
      "relation_rel-ace-routes-expansion"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-ace-routes-expansion",
        "record_kind": "relation",
        "display_name": "ACE Program expanded to five routes",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "applies_to",
          "subject_local_observation_id": "entity_ace_program",
          "object_local_observation_id": "entity_ace_program",
          "routes_affected": [
            "M2",
            "M4",
            "M42",
            "M100",
            "Bx5"
          ],
          "description": "ACE program expanded to five new bus routes",
          "relation_family": "other",
          "subject_id": "entity_ace-program",
          "object_id": "entity_ace-program"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
          }
        ]
      }
    ]
  },
  {
    "value": "M100",
    "count": 1,
    "records": [
      "relation_rel-ace-routes-expansion"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-ace-routes-expansion",
        "record_kind": "relation",
        "display_name": "ACE Program expanded to five routes",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "applies_to",
          "subject_local_observation_id": "entity_ace_program",
          "object_local_observation_id": "entity_ace_program",
          "routes_affected": [
            "M2",
            "M4",
            "M42",
            "M100",
            "Bx5"
          ],
          "description": "ACE program expanded to five new bus routes",
          "relation_family": "other",
          "subject_id": "entity_ace-program",
          "object_id": "entity_ace-program"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
          }
        ]
      }
    ]
  },
  {
    "value": "M2",
    "count": 1,
    "records": [
      "relation_rel-ace-routes-expansion"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-ace-routes-expansion",
        "record_kind": "relation",
        "display_name": "ACE Program expanded to five routes",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "applies_to",
          "subject_local_observation_id": "entity_ace_program",
          "object_local_observation_id": "entity_ace_program",
          "routes_affected": [
            "M2",
            "M4",
            "M42",
            "M100",
            "Bx5"
          ],
          "description": "ACE program expanded to five new bus routes",
          "relation_family": "other",
          "subject_id": "entity_ace-program",
          "object_id": "entity_ace-program"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
          }
        ]
      }
    ]
  },
  {
    "value": "M4",
    "count": 1,
    "records": [
      "relation_rel-ace-routes-expansion"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-ace-routes-expansion",
        "record_kind": "relation",
        "display_name": "ACE Program expanded to five routes",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "applies_to",
          "subject_local_observation_id": "entity_ace_program",
          "object_local_observation_id": "entity_ace_program",
          "routes_affected": [
            "M2",
            "M4",
            "M42",
            "M100",
            "Bx5"
          ],
          "description": "ACE program expanded to five new bus routes",
          "relation_family": "other",
          "subject_id": "entity_ace-program",
          "object_id": "entity_ace-program"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
          }
        ]
      }
    ]
  },
  {
    "value": "M42",
    "count": 1,
    "records": [
      "relation_rel-ace-routes-expansion"
    ],
    "representative_records": [
      {
        "record_id": "relation_rel-ace-routes-expansion",
        "record_kind": "relation",
        "display_name": "ACE Program expanded to five routes",
        "source_ids": [
          "nyct_key_performance_metrics_june2025"
        ],
        "payload": {
          "relation_kind": "applies_to",
          "subject_local_observation_id": "entity_ace_program",
          "object_local_observation_id": "entity_ace_program",
          "routes_affected": [
            "M2",
            "M4",
            "M42",
            "M100",
            "Bx5"
          ],
          "description": "ACE program expanded to five new bus routes",
          "relation_family": "other",
          "subject_id": "entity_ace-program",
          "object_id": "entity_ace-program"
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_june2025",
            "block_id": "p005_c0003",
            "page_number": 5,
            "role": "states_relationship",
            "snippet": "One of the most impactful modern tools in that strategy is Automated Camera Enforcement (ACE). Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5. The results from ACE have been amazing. Acro..."
          }
        ]
      }
    ]
  }
]
```
