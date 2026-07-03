# Metric & Claim Ontology Agent

Agent id: `metric-claim-ontology`

## Purpose

Normalize metric units, metric dimensions, claim data/change types, and metric/claim relation-context fields.

## Owns

- metric_claim.unit
- unit_normalized other bucket
- metric dimensions
- claim data_type/change_type
- metric route/source context

## Decision Contract

Submit review decisions only as append-only normalization decisions. Do not edit canonical JSONL, wiki pages, source pages, or source literals directly.

- canonical_value
- alias_field
- relation_candidate
- open_normalizer
- reject_mapping
- needs_more_data
- no_change

## Candidate Summary

Candidates: 7

- relation_context_field: 7

## Candidates

### metric-claim-ontology:relation-context:metric_claim.route_label

- Category: relation_context_field
- Priority: 210
- Record kind: metric_claim
- Field: route_label
- Count: 154
- Title: Metric field route_label should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 94 endpoint values are already present or derivable (94 already present, 0 newly derivable); 60 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: route has_metric metric_claim.
- metric_claim.route_label appears on 154 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "M86",
    "count": 45,
    "records": [
      "metric_at-bus-stop-time-m86-local-74min",
      "metric_at-bus-stop-time-m86-sbs-66min",
      "metric_avg-weekday-ridership-2010-26028",
      "metric_avg-weekday-ridership-2014-23846"
    ],
    "representative_records": [
      {
        "record_id": "metric_at-bus-stop-time-m86-local-74min",
        "record_kind": "metric_claim",
        "display_name": "metric_at_bus_stop_time_m86_local_74min",
        "source_ids": [
          "m86_sbs_progress_report_2017"
        ],
        "payload": {
          "metric_name": "time at bus stop",
          "raw_value_text": "7.4 minutes",
          "value": 7.4,
          "unit": "minutes",
          "scope": "M86 Local (before SBS)",
          "route_label": "M86",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          }
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p007_c0017",
            "page_number": 7,
            "role": "metric_table",
            "snippet": "Component M86 (Minutes) M86 SBS (Minutes) Moving 11.8 11.3 Stopped in Traffic 3.7 2.9 At Bus Stop 7.4 6.6"
          }
        ]
      },
      {
        "record_id": "metric_at-bus-stop-time-m86-sbs-66min",
        "record_kind": "metric_claim",
        "display_name": "metric_at_bus_stop_time_m86_sbs_66min",
        "source_ids": [
          "m86_sbs_progress_report_2017"
        ],
        "payload": {
          "metric_name": "time at bus stop",
          "raw_value_text": "6.6 minutes",
          "value": 6.6,
          "unit": "minutes",
          "scope": "M86 SBS",
          "route_label": "M86",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          }
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p007_c0017",
            "page_number": 7,
            "role": "metric_table",
            "snippet": "Component M86 (Minutes) M86 SBS (Minutes) Moving 11.8 11.3 Stopped in Traffic 3.7 2.9 At Bus Stop 7.4 6.6"
          }
        ]
      },
      {
        "record_id": "metric_avg-weekday-ridership-2010-26028",
        "record_kind": "metric_claim",
        "display_name": "metric_avg_weekday_ridership_2010_26028",
        "source_ids": [
          "m86_sbs_progress_report_2017"
        ],
        "payload": {
          "metric_name": "average weekday ridership",
          "raw_value_text": "26,028 weekday customers in 2010",
          "value": 26028,
          "unit": "riders",
          "period": "2010",
          "scope": "M86 Local",
          "route_label": "M86",
          "unit_normalized": {
            "raw_text": "riders",
            "normalized_unit": "riders",
            "unit_family": "ridership"
          }
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p006_c0009",
            "page_number": 6,
            "role": "metric_values",
            "snippet": "The M86 route has the highest ridership per mile of any bus route in the city. Ridership had declined from an average of 26,028 weekday customers in 2010 to 23,846 in 2014, an 8% decrease in the 5 years preceding SBS im..."
          }
        ]
      }
    ]
  },
  {
    "value": "B44 SBS",
    "count": 18,
    "records": [
      "metric_b44-sbs-nb-am-peak-after",
      "metric_b44-sbs-nb-am-peak-before",
      "metric_b44-sbs-nb-am-peak-change",
      "metric_b44-sbs-nb-midday-after"
    ],
    "representative_records": [
      {
        "record_id": "metric_b44-sbs-nb-am-peak-after",
        "record_kind": "metric_claim",
        "display_name": "metric_b44_sbs_nb_am_peak_after",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time",
          "raw_value_text": "25.1",
          "value": 25.1,
          "unit": "minutes",
          "period": "AM Peak (6:45 am-9:45 am)",
          "direction": "NB",
          "route_label": "B44 SBS",
          "scope": "Knapp/Shore Pkwy to Flatbush/Rogers Aves",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "direction_normalized": {
            "raw_text": "NB",
            "normalized_value": "northbound"
          }
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p009_c0004",
            "page_number": 9,
            "snippet": "Time Period Before TSP (Minutes) After TSP (Minutes) Change (%) AM Peak (6:45 am-9:45 am) 25.3 25.1 -0.7% Midday (12:30 pm-3:30 pm) 27.4 26.2 -4.4% PM Peak (4:15 pm-7:15 pm) 29.6 26.2 -11.5%"
          }
        ]
      },
      {
        "record_id": "metric_b44-sbs-nb-am-peak-before",
        "record_kind": "metric_claim",
        "display_name": "metric_b44_sbs_nb_am_peak_before",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time",
          "raw_value_text": "25.3",
          "value": 25.3,
          "unit": "minutes",
          "period": "AM Peak (6:45 am-9:45 am)",
          "direction": "NB",
          "route_label": "B44 SBS",
          "scope": "Knapp/Shore Pkwy to Flatbush/Rogers Aves",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "direction_normalized": {
            "raw_text": "NB",
            "normalized_value": "northbound"
          }
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p009_c0004",
            "page_number": 9,
            "snippet": "Time Period Before TSP (Minutes) After TSP (Minutes) Change (%) AM Peak (6:45 am-9:45 am) 25.3 25.1 -0.7% Midday (12:30 pm-3:30 pm) 27.4 26.2 -4.4% PM Peak (4:15 pm-7:15 pm) 29.6 26.2 -11.5%"
          }
        ]
      },
      {
        "record_id": "metric_b44-sbs-nb-am-peak-change",
        "record_kind": "metric_claim",
        "display_name": "metric_b44_sbs_nb_am_peak_change",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time_change_pct",
          "raw_value_text": "-0.7%",
          "value": -0.7,
          "unit": "percent",
          "period": "AM Peak (6:45 am-9:45 am)",
          "direction": "NB",
          "route_label": "B44 SBS",
          "scope": "Knapp/Shore Pkwy to Flatbush/Rogers Aves",
          "unit_normalized": {
            "raw_text": "percent",
            "normalized_unit": "percent",
            "unit_family": "percentage"
          },
          "direction_normalized": {
            "raw_text": "NB",
            "normalized_value": "northbound"
          }
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p009_c0004",
            "page_number": 9,
            "snippet": "Time Period Before TSP (Minutes) After TSP (Minutes) Change (%) AM Peak (6:45 am-9:45 am) 25.3 25.1 -0.7% Midday (12:30 pm-3:30 pm) 27.4 26.2 -4.4% PM Peak (4:15 pm-7:15 pm) 29.6 26.2 -11.5%"
          }
        ]
      }
    ]
  },
  {
    "value": "M15 SBS",
    "count": 18,
    "records": [
      "metric_m15-sbs-nb-eb-am-peak-after",
      "metric_m15-sbs-nb-eb-am-peak-before",
      "metric_m15-sbs-nb-eb-am-peak-change",
      "metric_m15-sbs-nb-eb-midday-after"
    ],
    "representative_records": [
      {
        "record_id": "metric_m15-sbs-nb-eb-am-peak-after",
        "record_kind": "metric_claim",
        "display_name": "metric_m15_sbs_nb_eb_am_peak_after",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time",
          "raw_value_text": "15.3",
          "value": 15.3,
          "unit": "minutes",
          "period": "AM Peak (7:30 am-10:00 am)",
          "direction": "NB/EB",
          "route_label": "M15 SBS",
          "scope": "South Ferry to East Houston Street",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "direction_normalized": {
            "raw_text": "NB/EB",
            "normalized_value": "nb_eb"
          }
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p007_c0006",
            "page_number": 7,
            "snippet": "A bar chart comparing travel times before and after TSP for the M15 SBS corridor in Lower Manhattan (NB/EB direction). The y-axis represents time in minutes, ranging from 0 to 25. The x-axis shows three time periods: AM..."
          }
        ]
      },
      {
        "record_id": "metric_m15-sbs-nb-eb-am-peak-before",
        "record_kind": "metric_claim",
        "display_name": "metric_m15_sbs_nb_eb_am_peak_before",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time",
          "raw_value_text": "18.7",
          "value": 18.7,
          "unit": "minutes",
          "period": "AM Peak (7:30 am-10:00 am)",
          "direction": "NB/EB",
          "route_label": "M15 SBS",
          "scope": "South Ferry to East Houston Street",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "direction_normalized": {
            "raw_text": "NB/EB",
            "normalized_value": "nb_eb"
          }
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p007_c0006",
            "page_number": 7,
            "snippet": "A bar chart comparing travel times before and after TSP for the M15 SBS corridor in Lower Manhattan (NB/EB direction). The y-axis represents time in minutes, ranging from 0 to 25. The x-axis shows three time periods: AM..."
          }
        ]
      },
      {
        "record_id": "metric_m15-sbs-nb-eb-am-peak-change",
        "record_kind": "metric_claim",
        "display_name": "metric_m15_sbs_nb_eb_am_peak_change",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time_change_pct",
          "raw_value_text": "18.2%",
          "value": -18.2,
          "unit": "percent",
          "period": "AM Peak (7:30 am-10:00 am)",
          "direction": "NB/EB",
          "route_label": "M15 SBS",
          "scope": "South Ferry to East Houston Street",
          "unit_normalized": {
            "raw_text": "percent",
            "normalized_unit": "percent",
            "unit_family": "percentage"
          },
          "direction_normalized": {
            "raw_text": "NB/EB",
            "normalized_value": "nb_eb"
          }
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p007_c0006",
            "page_number": 7,
            "snippet": "A bar chart comparing travel times before and after TSP for the M15 SBS corridor in Lower Manhattan (NB/EB direction). The y-axis represents time in minutes, ranging from 0 to 25. The x-axis shows three time periods: AM..."
          }
        ]
      }
    ]
  },
  {
    "value": "S79 SBS",
    "count": 18,
    "records": [
      "metric_s79-sbs-to-brooklyn-am-peak-after",
      "metric_s79-sbs-to-brooklyn-am-peak-before",
      "metric_s79-sbs-to-brooklyn-am-peak-change",
      "metric_s79-sbs-to-brooklyn-midday-after"
    ],
    "representative_records": [
      {
        "record_id": "metric_s79-sbs-to-brooklyn-am-peak-after",
        "record_kind": "metric_claim",
        "display_name": "metric_s79_sbs_to_brooklyn_am_peak_after",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time",
          "raw_value_text": "39.2",
          "value": 39.2,
          "unit": "minutes",
          "period": "AM Peak (6:15 am-9:30 am)",
          "direction": "To Brooklyn",
          "route_label": "S79 SBS",
          "scope": "Richmond/Yukon Sts to Hylan/Steuben & 92nd/Dahlgren to Ft Hamilton/90th St",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "direction_normalized": {
            "raw_text": "To Brooklyn",
            "normalized_value": "to_brooklyn"
          }
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
        "record_id": "metric_s79-sbs-to-brooklyn-am-peak-before",
        "record_kind": "metric_claim",
        "display_name": "metric_s79_sbs_to_brooklyn_am_peak_before",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time",
          "raw_value_text": "43.8",
          "value": 43.8,
          "unit": "minutes",
          "period": "AM Peak (6:15 am-9:30 am)",
          "direction": "To Brooklyn",
          "route_label": "S79 SBS",
          "scope": "Richmond/Yukon Sts to Hylan/Steuben & 92nd/Dahlgren to Ft Hamilton/90th St",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "direction_normalized": {
            "raw_text": "To Brooklyn",
            "normalized_value": "to_brooklyn"
          }
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
        "record_id": "metric_s79-sbs-to-brooklyn-am-peak-change",
        "record_kind": "metric_claim",
        "display_name": "metric_s79_sbs_to_brooklyn_am_peak_change",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time_change_pct",
          "raw_value_text": "-10.5%",
          "value": -10.5,
          "unit": "percent",
          "period": "AM Peak (6:15 am-9:30 am)",
          "direction": "To Brooklyn",
          "route_label": "S79 SBS",
          "scope": "Richmond/Yukon Sts to Hylan/Steuben & 92nd/Dahlgren to Ft Hamilton/90th St",
          "unit_normalized": {
            "raw_text": "percent",
            "normalized_unit": "percent",
            "unit_family": "percentage"
          },
          "direction_normalized": {
            "raw_text": "To Brooklyn",
            "normalized_value": "to_brooklyn"
          }
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
    "value": "Bx41 SBS",
    "count": 12,
    "records": [
      "metric_bx41-sbs-nb-eb-am-peak-after",
      "metric_bx41-sbs-nb-eb-am-peak-before",
      "metric_bx41-sbs-nb-eb-am-peak-change",
      "metric_bx41-sbs-nb-eb-pm-peak-after"
    ],
    "representative_records": [
      {
        "record_id": "metric_bx41-sbs-nb-eb-am-peak-after",
        "record_kind": "metric_claim",
        "display_name": "metric_bx41_sbs_nb_eb_am_peak_after",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time",
          "raw_value_text": "36.4",
          "value": 36.4,
          "unit": "minutes",
          "period": "AM Peak (6:30 am-9:30 am)",
          "direction": "NB/EB",
          "route_label": "Bx41 SBS",
          "scope": "Third/Melrose Aves to E. Gun Hill/White Plains Rds",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "direction_normalized": {
            "raw_text": "NB/EB",
            "normalized_value": "nb_eb"
          }
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p010_c0004",
            "page_number": 10,
            "snippet": "A bar chart comparing travel times in minutes for the Bx41 SBS route (NB/EB) before and after the Transit Service Plan (TSP). The y-axis is labeled 'Minutes' and ranges from 0 to 60 in increments of 10. The x-axis shows..."
          }
        ]
      },
      {
        "record_id": "metric_bx41-sbs-nb-eb-am-peak-before",
        "record_kind": "metric_claim",
        "display_name": "metric_bx41_sbs_nb_eb_am_peak_before",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time",
          "raw_value_text": "45.1",
          "value": 45.1,
          "unit": "minutes",
          "period": "AM Peak (6:30 am-9:30 am)",
          "direction": "NB/EB",
          "route_label": "Bx41 SBS",
          "scope": "Third/Melrose Aves to E. Gun Hill/White Plains Rds",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "direction_normalized": {
            "raw_text": "NB/EB",
            "normalized_value": "nb_eb"
          }
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p010_c0004",
            "page_number": 10,
            "snippet": "A bar chart comparing travel times in minutes for the Bx41 SBS route (NB/EB) before and after the Transit Service Plan (TSP). The y-axis is labeled 'Minutes' and ranges from 0 to 60 in increments of 10. The x-axis shows..."
          }
        ]
      },
      {
        "record_id": "metric_bx41-sbs-nb-eb-am-peak-change",
        "record_kind": "metric_claim",
        "display_name": "metric_bx41_sbs_nb_eb_am_peak_change",
        "source_ids": [
          "tsp_report_2017"
        ],
        "payload": {
          "metric_name": "travel_time_change_pct",
          "raw_value_text": "-19.3%",
          "value": -19.3,
          "unit": "percent",
          "period": "AM Peak (6:30 am-9:30 am)",
          "direction": "NB/EB",
          "route_label": "Bx41 SBS",
          "scope": "Third/Melrose Aves to E. Gun Hill/White Plains Rds",
          "unit_normalized": {
            "raw_text": "percent",
            "normalized_unit": "percent",
            "unit_family": "percentage"
          },
          "direction_normalized": {
            "raw_text": "NB/EB",
            "normalized_value": "nb_eb"
          }
        },
        "evidence_examples": [
          {
            "source_id": "tsp_report_2017",
            "block_id": "p010_c0004",
            "page_number": 10,
            "snippet": "A bar chart comparing travel times in minutes for the Bx41 SBS route (NB/EB) before and after the Transit Service Plan (TSP). The y-axis is labeled 'Minutes' and ranges from 0 to 60 in increments of 10. The x-axis shows..."
          }
        ]
      }
    ]
  },
  {
    "value": "B60",
    "count": 7,
    "records": [
      "metric_school-weekday-b60-pct",
      "metric_school-weekday-b60-pilot-increase",
      "metric_school-weekday-b60-pilot-total",
      "metric_school-weekday-b60-pre"
    ],
    "representative_records": [
      {
        "record_id": "metric_school-weekday-b60-pct",
        "record_kind": "metric_claim",
        "display_name": "B60 School Weekday % Increase",
        "source_ids": [
          "fare_free_bus_pilot_evaluation"
        ],
        "payload": {
          "metric_name": "weekday_ridership_percent_increase",
          "value": 34,
          "raw_value_text": "+34%",
          "route_label": "B60",
          "period": "school_months"
        },
        "evidence_examples": [
          {
            "source_id": "fare_free_bus_pilot_evaluation",
            "block_id": "p005_c0004",
            "page_number": 5,
            "role": "table_cell",
            "snippet": "Route Pre-pilot ridership (Sept 2022 – May 2023) Δ Pilot ridership increase (Sept 2023 – May 2024) Total Pilot Ridership % Increase B60 10,081 3,464 13,545 +34% Bx18A/B 4,703 1,369 6,072 +29% M116 10,424 3,011 13,435 +2..."
          }
        ]
      },
      {
        "record_id": "metric_school-weekday-b60-pilot-increase",
        "record_kind": "metric_claim",
        "display_name": "B60 School Weekday Pilot Ridership Increase",
        "source_ids": [
          "fare_free_bus_pilot_evaluation"
        ],
        "payload": {
          "metric_name": "weekday_ridership_pilot_increase",
          "value": 3464,
          "raw_value_text": "3,464",
          "route_label": "B60",
          "period": "school_months",
          "time_period": "Sep 2023 – May 2024",
          "time_period_normalized": {
            "raw_text": "Sep 2023 – May 2024",
            "normalized_value": "sep_2023_may_2024"
          }
        },
        "evidence_examples": [
          {
            "source_id": "fare_free_bus_pilot_evaluation",
            "block_id": "p005_c0004",
            "page_number": 5,
            "role": "table_cell",
            "snippet": "Route Pre-pilot ridership (Sept 2022 – May 2023) Δ Pilot ridership increase (Sept 2023 – May 2024) Total Pilot Ridership % Increase B60 10,081 3,464 13,545 +34% Bx18A/B 4,703 1,369 6,072 +29% M116 10,424 3,011 13,435 +2..."
          }
        ]
      },
      {
        "record_id": "metric_school-weekday-b60-pilot-total",
        "record_kind": "metric_claim",
        "display_name": "B60 School Weekday Total Pilot Ridership",
        "source_ids": [
          "fare_free_bus_pilot_evaluation"
        ],
        "payload": {
          "metric_name": "weekday_ridership_total_pilot",
          "value": 13545,
          "raw_value_text": "13,545",
          "route_label": "B60",
          "period": "school_months"
        },
        "evidence_examples": [
          {
            "source_id": "fare_free_bus_pilot_evaluation",
            "block_id": "p005_c0004",
            "page_number": 5,
            "role": "table_cell",
            "snippet": "Route Pre-pilot ridership (Sept 2022 – May 2023) Δ Pilot ridership increase (Sept 2023 – May 2024) Total Pilot Ridership % Increase B60 10,081 3,464 13,545 +34% Bx18A/B 4,703 1,369 6,072 +29% M116 10,424 3,011 13,435 +2..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx18A/B",
    "count": 7,
    "records": [
      "metric_school-weekday-bx18-increase",
      "metric_school-weekday-bx18-pct",
      "metric_school-weekday-bx18-pre",
      "metric_school-weekday-bx18-total"
    ],
    "representative_records": [
      {
        "record_id": "metric_school-weekday-bx18-increase",
        "record_kind": "metric_claim",
        "display_name": "Bx18A/B School Weekday Pilot Increase",
        "source_ids": [
          "fare_free_bus_pilot_evaluation"
        ],
        "payload": {
          "metric_name": "weekday_ridership_pilot_increase",
          "value": 1369,
          "raw_value_text": "1,369",
          "route_label": "Bx18A/B",
          "period": "school_months"
        },
        "evidence_examples": [
          {
            "source_id": "fare_free_bus_pilot_evaluation",
            "block_id": "p005_c0004",
            "page_number": 5,
            "role": "table_cell",
            "snippet": "Route Pre-pilot ridership (Sept 2022 – May 2023) Δ Pilot ridership increase (Sept 2023 – May 2024) Total Pilot Ridership % Increase B60 10,081 3,464 13,545 +34% Bx18A/B 4,703 1,369 6,072 +29% M116 10,424 3,011 13,435 +2..."
          }
        ]
      },
      {
        "record_id": "metric_school-weekday-bx18-pct",
        "record_kind": "metric_claim",
        "display_name": "Bx18A/B School Weekday % Increase",
        "source_ids": [
          "fare_free_bus_pilot_evaluation"
        ],
        "payload": {
          "metric_name": "weekday_ridership_percent_increase",
          "value": 29,
          "raw_value_text": "+29%",
          "route_label": "Bx18A/B",
          "period": "school_months"
        },
        "evidence_examples": [
          {
            "source_id": "fare_free_bus_pilot_evaluation",
            "block_id": "p005_c0004",
            "page_number": 5,
            "role": "table_cell",
            "snippet": "Route Pre-pilot ridership (Sept 2022 – May 2023) Δ Pilot ridership increase (Sept 2023 – May 2024) Total Pilot Ridership % Increase B60 10,081 3,464 13,545 +34% Bx18A/B 4,703 1,369 6,072 +29% M116 10,424 3,011 13,435 +2..."
          }
        ]
      },
      {
        "record_id": "metric_school-weekday-bx18-pre",
        "record_kind": "metric_claim",
        "display_name": "Bx18A/B School Weekday Pre-Pilot Ridership",
        "source_ids": [
          "fare_free_bus_pilot_evaluation"
        ],
        "payload": {
          "metric_name": "weekday_ridership_pre_pilot",
          "value": 4703,
          "raw_value_text": "4,703",
          "route_label": "Bx18A/B",
          "period": "school_months",
          "time_period": "Sep 2022 – May 2023",
          "time_period_normalized": {
            "raw_text": "Sep 2022 – May 2023",
            "normalized_value": "sep_2022_may_2023"
          }
        },
        "evidence_examples": [
          {
            "source_id": "fare_free_bus_pilot_evaluation",
            "block_id": "p005_c0004",
            "page_number": 5,
            "role": "table_cell",
            "snippet": "Route Pre-pilot ridership (Sept 2022 – May 2023) Δ Pilot ridership increase (Sept 2023 – May 2024) Total Pilot Ridership % Increase B60 10,081 3,464 13,545 +34% Bx18A/B 4,703 1,369 6,072 +29% M116 10,424 3,011 13,435 +2..."
          }
        ]
      }
    ]
  },
  {
    "value": "M116",
    "count": 7,
    "records": [
      "metric_school-weekday-m116-increase",
      "metric_school-weekday-m116-pct",
      "metric_school-weekday-m116-pre",
      "metric_school-weekday-m116-total"
    ],
    "representative_records": [
      {
        "record_id": "metric_school-weekday-m116-increase",
        "record_kind": "metric_claim",
        "display_name": "M116 School Weekday Pilot Increase",
        "source_ids": [
          "fare_free_bus_pilot_evaluation"
        ],
        "payload": {
          "metric_name": "weekday_ridership_pilot_increase",
          "value": 3011,
          "raw_value_text": "3,011",
          "route_label": "M116",
          "period": "school_months"
        },
        "evidence_examples": [
          {
            "source_id": "fare_free_bus_pilot_evaluation",
            "block_id": "p005_c0004",
            "page_number": 5,
            "role": "table_cell",
            "snippet": "Route Pre-pilot ridership (Sept 2022 – May 2023) Δ Pilot ridership increase (Sept 2023 – May 2024) Total Pilot Ridership % Increase B60 10,081 3,464 13,545 +34% Bx18A/B 4,703 1,369 6,072 +29% M116 10,424 3,011 13,435 +2..."
          }
        ]
      },
      {
        "record_id": "metric_school-weekday-m116-pct",
        "record_kind": "metric_claim",
        "display_name": "M116 School Weekday % Increase",
        "source_ids": [
          "fare_free_bus_pilot_evaluation"
        ],
        "payload": {
          "metric_name": "weekday_ridership_percent_increase",
          "value": 29,
          "raw_value_text": "+29%",
          "route_label": "M116",
          "period": "school_months"
        },
        "evidence_examples": [
          {
            "source_id": "fare_free_bus_pilot_evaluation",
            "block_id": "p005_c0004",
            "page_number": 5,
            "role": "table_cell",
            "snippet": "Route Pre-pilot ridership (Sept 2022 – May 2023) Δ Pilot ridership increase (Sept 2023 – May 2024) Total Pilot Ridership % Increase B60 10,081 3,464 13,545 +34% Bx18A/B 4,703 1,369 6,072 +29% M116 10,424 3,011 13,435 +2..."
          }
        ]
      },
      {
        "record_id": "metric_school-weekday-m116-pre",
        "record_kind": "metric_claim",
        "display_name": "M116 School Weekday Pre-Pilot Ridership",
        "source_ids": [
          "fare_free_bus_pilot_evaluation"
        ],
        "payload": {
          "metric_name": "weekday_ridership_pre_pilot",
          "value": 10424,
          "raw_value_text": "10,424",
          "route_label": "M116",
          "period": "school_months",
          "time_period": "Sep 2022 – May 2023",
          "time_period_normalized": {
            "raw_text": "Sep 2022 – May 2023",
            "normalized_value": "sep_2022_may_2023"
          }
        },
        "evidence_examples": [
          {
            "source_id": "fare_free_bus_pilot_evaluation",
            "block_id": "p005_c0004",
            "page_number": 5,
            "role": "table_cell",
            "snippet": "Route Pre-pilot ridership (Sept 2022 – May 2023) Δ Pilot ridership increase (Sept 2023 – May 2024) Total Pilot Ridership % Increase B60 10,081 3,464 13,545 +34% Bx18A/B 4,703 1,369 6,072 +29% M116 10,424 3,011 13,435 +2..."
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
      "rule_id": "metric-route-has-metric",
      "relation_kind": "has_metric",
      "direction": "target_to_origin",
      "records_with_field": 154,
      "value_count": 154,
      "derived_count": 0,
      "already_present_count": 94,
      "unresolved_count": 60,
      "skipped_self_count": 0
    }
  ]
}
```

### metric-claim-ontology:relation-context:metric_claim.entity

- Category: relation_context_field
- Priority: 150
- Record kind: metric_claim
- Field: entity
- Count: 1
- Title: Metric field entity should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 0 endpoint values are already present or derivable (0 already present, 0 newly derivable); 1 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: entity/project has_metric metric_claim.
- metric_claim.entity appears on 1 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "New York City Transit",
    "count": 1,
    "records": [
      "metric_farebox-revenue-variance-2025-ytd"
    ],
    "representative_records": [
      {
        "record_id": "metric_farebox-revenue-variance-2025-ytd",
        "record_kind": "metric_claim",
        "display_name": "NYCT Farebox Revenue Variance August 2025 YTD",
        "source_ids": [
          "nyct_key_performance_metrics_doc194001"
        ],
        "payload": {
          "metric_name": "farebox_revenue_vs_forecast",
          "raw_value_text": "$19.3 million unfavorable",
          "value": -19.3,
          "unit": "million_dollars",
          "period": "August 2025 Year-to-Date",
          "entity": "New York City Transit",
          "unit_normalized": {
            "raw_text": "million_dollars",
            "normalized_unit": "dollars",
            "unit_family": "money",
            "scale": 1000000
          }
        },
        "evidence_examples": [
          {
            "source_id": "nyct_key_performance_metrics_doc194001",
            "block_id": "p027_c0007",
            "page_number": 27,
            "role": "farebox_variance",
            "snippet": "Farebox revenue was unfavorable to the Forecast by $19.3 million mainly due to lower than projected bus paid ridership. Other Revenue was $29.0 million unfavorable to the Forecast mainly due to lower than projected para..."
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
      "rule_id": "metric-source-system-has-metric",
      "relation_kind": "has_metric",
      "direction": "target_to_origin",
      "records_with_field": 1,
      "value_count": 1,
      "derived_count": 0,
      "already_present_count": 0,
      "unresolved_count": 1,
      "skipped_self_count": 0
    }
  ]
}
```

### metric-claim-ontology:relation-context:metric_claim.route

- Category: relation_context_field
- Priority: 150
- Record kind: metric_claim
- Field: route
- Count: 37
- Title: Metric field route should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 16 endpoint values are already present or derivable (16 already present, 0 newly derivable); 21 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: route has_metric metric_claim.
- metric_claim.route appears on 37 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "B44 SBS",
    "count": 7,
    "records": [
      "metric_b44-sbs-ridership-recovery-d-church",
      "metric_bus-delay-stopped-at-stops-b44-sbs",
      "metric_bus-in-motion-b44-sbs",
      "metric_customer-satisfaction-sbs-very-satisfied"
    ],
    "representative_records": [
      {
        "record_id": "metric_b44-sbs-ridership-recovery-d-church",
        "record_kind": "metric_claim",
        "display_name": "metric_b44_sbs_ridership_recovery_d_church",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "ridership_change",
          "raw_value_text": "Between May 2014 and May 2015, B44 SBS ridership at Avenue D and Church Avenue increased 37%",
          "value": 37,
          "unit": "percent",
          "scope": "Avenue_D_Church_Avenue_stops",
          "route": "B44 SBS",
          "comparison": "May_2014_to_May_2015",
          "unit_normalized": {
            "raw_text": "percent",
            "normalized_unit": "percent",
            "unit_family": "percentage"
          },
          "comparison_normalized": {
            "raw_text": "May_2014_to_May_2015",
            "normalized_value": "may_2014_to_may_2015"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p029_c0003",
            "page_number": 29,
            "role": "metric_value",
            "snippet": "The ridership trend changed towards positive ridership gains after May 2014. Between May 2014 and May 2015, B44 SBS ridership at Avenue D and Church Avenue increased 37%, roughly recovering to pre-implementation levels...."
          }
        ]
      },
      {
        "record_id": "metric_bus-delay-stopped-at-stops-b44-sbs",
        "record_kind": "metric_claim",
        "display_name": "metric_bus_delay_stopped_at_stops_b44_sbs",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "bus_delay_at_bus_stops",
          "raw_value_text": "B44 SBS: 15.4 min stopped at bus stops",
          "value": 15.4,
          "unit": "minutes",
          "route": "B44 SBS",
          "category": "stopped_at_bus_stops",
          "comparison": "post_sbs",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "comparison_normalized": {
            "raw_text": "post_sbs",
            "normalized_value": "post_sbs"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p025_c0011",
            "page_number": 25,
            "role": "metric_table",
            "snippet": "Bus Delay Data Category B44 Limited (min) B44 SBS (min) Percentage of Total Stopped at bus stops 25.8 15.4 31% / 24% Stopped in traffic 20.0 12.5 24% / 19% Bus in motion 37.4 37.3 45% / 57% Total 83.2 65.2"
          }
        ]
      },
      {
        "record_id": "metric_bus-in-motion-b44-sbs",
        "record_kind": "metric_claim",
        "display_name": "metric_bus_in_motion_b44_sbs",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "bus_time_in_motion",
          "raw_value_text": "B44 SBS: 37.3 min bus in motion (57% of total)",
          "value": 37.3,
          "unit": "minutes",
          "route": "B44 SBS",
          "category": "bus_in_motion",
          "comparison": "post_sbs",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "comparison_normalized": {
            "raw_text": "post_sbs",
            "normalized_value": "post_sbs"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p025_c0011",
            "page_number": 25,
            "role": "metric_table",
            "snippet": "Bus Delay Data Category B44 Limited (min) B44 SBS (min) Percentage of Total Stopped at bus stops 25.8 15.4 31% / 24% Stopped in traffic 20.0 12.5 24% / 19% Bus in motion 37.4 37.3 45% / 57% Total 83.2 65.2"
          }
        ]
      }
    ]
  },
  {
    "value": "B44 Limited",
    "count": 4,
    "records": [
      "metric_bus-delay-stopped-at-stops-b44-limited",
      "metric_bus-in-motion-b44-limited",
      "metric_customer-satisfaction-limited-very-satisfied",
      "metric_total-delay-b44-limited"
    ],
    "representative_records": [
      {
        "record_id": "metric_bus-delay-stopped-at-stops-b44-limited",
        "record_kind": "metric_claim",
        "display_name": "metric_bus_delay_stopped_at_stops_b44_limited",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "bus_delay_at_bus_stops",
          "raw_value_text": "B44 Limited: 25.8 min stopped at bus stops",
          "value": 25.8,
          "unit": "minutes",
          "route": "B44 Limited",
          "category": "stopped_at_bus_stops",
          "comparison": "pre_sbs",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "comparison_normalized": {
            "raw_text": "pre_sbs",
            "normalized_value": "pre_sbs"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p025_c0011",
            "page_number": 25,
            "role": "metric_table",
            "snippet": "Bus Delay Data Category B44 Limited (min) B44 SBS (min) Percentage of Total Stopped at bus stops 25.8 15.4 31% / 24% Stopped in traffic 20.0 12.5 24% / 19% Bus in motion 37.4 37.3 45% / 57% Total 83.2 65.2"
          }
        ]
      },
      {
        "record_id": "metric_bus-in-motion-b44-limited",
        "record_kind": "metric_claim",
        "display_name": "metric_bus_in_motion_b44_limited",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "bus_time_in_motion",
          "raw_value_text": "B44 Limited: 37.4 min bus in motion (45% of total)",
          "value": 37.4,
          "unit": "minutes",
          "route": "B44 Limited",
          "category": "bus_in_motion",
          "comparison": "pre_sbs",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          },
          "comparison_normalized": {
            "raw_text": "pre_sbs",
            "normalized_value": "pre_sbs"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p025_c0011",
            "page_number": 25,
            "role": "metric_table",
            "snippet": "Bus Delay Data Category B44 Limited (min) B44 SBS (min) Percentage of Total Stopped at bus stops 25.8 15.4 31% / 24% Stopped in traffic 20.0 12.5 24% / 19% Bus in motion 37.4 37.3 45% / 57% Total 83.2 65.2"
          }
        ]
      },
      {
        "record_id": "metric_customer-satisfaction-limited-very-satisfied",
        "record_kind": "metric_claim",
        "display_name": "metric_customer_satisfaction_limited_very_satisfied",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "customer_satisfaction_very_satisfied",
          "raw_value_text": "14% of B44 Limited riders were very satisfied (pre-SBS)",
          "value": 14,
          "unit": "percent",
          "route": "B44 Limited",
          "category": "very_satisfied",
          "comparison": "pre_sbs",
          "unit_normalized": {
            "raw_text": "percent",
            "normalized_unit": "percent",
            "unit_family": "percentage"
          },
          "comparison_normalized": {
            "raw_text": "pre_sbs",
            "normalized_value": "pre_sbs"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p026_c0003",
            "page_number": 26,
            "role": "metric_value",
            "snippet": "B44 SBS riders were more satisfied with the service on average than B44 Limited riders. This was especially true at higher levels of the satisfaction range, where 46% of B44 SBS riders were very satisfied, compared with..."
          }
        ]
      }
    ]
  },
  {
    "value": "B1",
    "count": 3,
    "records": [
      "metric_b1-saturday-morning-freq",
      "metric_b1-weekday-am-peak-freq",
      "metric_b1-weekday-midday-freq"
    ],
    "representative_records": [
      {
        "record_id": "metric_b1-saturday-morning-freq",
        "record_kind": "metric_claim",
        "display_name": "B1 proposed Saturday Morning frequency",
        "source_ids": [
          "brooklyn_bus_network_draft_plan_with_route_profiles"
        ],
        "payload": {
          "metric_name": "proposed_frequency",
          "raw_value_text": "10 minutes Saturday Morning",
          "value": 10,
          "unit": "minutes",
          "context": "B1 route Saturday Morning peak direction",
          "route": "B1",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          }
        },
        "evidence_examples": [
          {
            "source_id": "brooklyn_bus_network_draft_plan_with_route_profiles",
            "block_id": "p067_c0026",
            "page_number": 67,
            "role": "provides_frequencies",
            "snippet": "Service Hours AM Peak 6:00 AM-8:59 AM Midday 9:00 AM-11:59 PM PM Peak 2:00 PM-5:59 PM Early Evening 6:00 PM-7:59 PM Late Evening 8:00 PM-11:59 PM WEEKDAY 24 hours 6 7 6 10 18 Service Hours Early Morning 6:00 AM-8:59 AM..."
          }
        ]
      },
      {
        "record_id": "metric_b1-weekday-am-peak-freq",
        "record_kind": "metric_claim",
        "display_name": "B1 proposed Weekday AM Peak frequency",
        "source_ids": [
          "brooklyn_bus_network_draft_plan_with_route_profiles"
        ],
        "payload": {
          "metric_name": "proposed_frequency",
          "raw_value_text": "6 minutes AM Peak",
          "value": 6,
          "unit": "minutes",
          "context": "B1 route Weekday AM Peak peak direction",
          "route": "B1",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          }
        },
        "evidence_examples": [
          {
            "source_id": "brooklyn_bus_network_draft_plan_with_route_profiles",
            "block_id": "p067_c0026",
            "page_number": 67,
            "role": "provides_frequencies",
            "snippet": "Service Hours AM Peak 6:00 AM-8:59 AM Midday 9:00 AM-11:59 PM PM Peak 2:00 PM-5:59 PM Early Evening 6:00 PM-7:59 PM Late Evening 8:00 PM-11:59 PM WEEKDAY 24 hours 6 7 6 10 18 Service Hours Early Morning 6:00 AM-8:59 AM..."
          }
        ]
      },
      {
        "record_id": "metric_b1-weekday-midday-freq",
        "record_kind": "metric_claim",
        "display_name": "B1 proposed Weekday Midday frequency",
        "source_ids": [
          "brooklyn_bus_network_draft_plan_with_route_profiles"
        ],
        "payload": {
          "metric_name": "proposed_frequency",
          "raw_value_text": "7 minutes Midday",
          "value": 7,
          "unit": "minutes",
          "context": "B1 route Weekday Midday peak direction",
          "route": "B1",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          }
        },
        "evidence_examples": [
          {
            "source_id": "brooklyn_bus_network_draft_plan_with_route_profiles",
            "block_id": "p067_c0026",
            "page_number": 67,
            "role": "provides_frequencies",
            "snippet": "Service Hours AM Peak 6:00 AM-8:59 AM Midday 9:00 AM-11:59 PM PM Peak 2:00 PM-5:59 PM Early Evening 6:00 PM-7:59 PM Late Evening 8:00 PM-11:59 PM WEEKDAY 24 hours 6 7 6 10 18 Service Hours Early Morning 6:00 AM-8:59 AM..."
          }
        ]
      }
    ]
  },
  {
    "value": "B44",
    "count": 3,
    "records": [
      "metric_b44-weekday-am-peak-freq",
      "metric_ridership-b44-annual",
      "metric_ridership-b44-weekday-range"
    ],
    "representative_records": [
      {
        "record_id": "metric_b44-weekday-am-peak-freq",
        "record_kind": "metric_claim",
        "display_name": "B44 proposed Weekday AM Peak frequency",
        "source_ids": [
          "brooklyn_bus_network_draft_plan_with_route_profiles"
        ],
        "payload": {
          "metric_name": "proposed_frequency",
          "raw_value_text": "7 minutes AM Peak",
          "value": 7,
          "unit": "minutes",
          "context": "B44 route Weekday AM Peak peak direction",
          "route": "B44",
          "unit_normalized": {
            "raw_text": "minutes",
            "normalized_unit": "minutes",
            "unit_family": "duration"
          }
        },
        "evidence_examples": [
          {
            "source_id": "brooklyn_bus_network_draft_plan_with_route_profiles",
            "block_id": "p062_c0037",
            "page_number": 62,
            "role": "provides_frequencies",
            "snippet": "● Increased Service ● Decreased Service ● No Change Service Hours AM Peak 8:00 AM-8:59 AM Midday 9:00 AM-1:59 PM PM Peak 2:00 PM-5:59 PM Early Evening 6:30 PM-7:59 PM Late Evening 8:30 PM-11:59 PM WEEKDAY 24 hours 7 8 7..."
          }
        ]
      },
      {
        "record_id": "metric_ridership-b44-annual",
        "record_kind": "metric_claim",
        "display_name": "metric_ridership_b44_annual",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "annual_ridership",
          "raw_value_text": "13.6 million annual riders historically",
          "value": 13.6,
          "unit": "million_riders",
          "route": "B44",
          "period": "historical",
          "unit_normalized": {
            "raw_text": "million_riders",
            "normalized_unit": "riders",
            "unit_family": "ridership",
            "scale": 1000000
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p007_c0004",
            "page_number": 7,
            "role": "metric_value",
            "snippet": "The B44 is the 3rd highest ridership bus route in Brooklyn, and the 6th highest in all of New York City. The B44 has historically carried between 35,000 and 40,000 people on an average weekday and 13.6 million annual ri..."
          }
        ]
      },
      {
        "record_id": "metric_ridership-b44-weekday-range",
        "record_kind": "metric_claim",
        "display_name": "metric_ridership_b44_weekday_range",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "average_weekday_ridership",
          "raw_value_text": "Historically carried between 35,000 and 40,000 people on an average weekday",
          "value_min": 35000,
          "value_max": 40000,
          "unit": "riders_per_weekday",
          "route": "B44",
          "period": "historical",
          "unit_normalized": {
            "raw_text": "riders_per_weekday",
            "normalized_unit": "riders_per_weekday",
            "unit_family": "ridership"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p007_c0004",
            "page_number": 7,
            "role": "metric_value",
            "snippet": "The B44 is the 3rd highest ridership bus route in Brooklyn, and the 6th highest in all of New York City. The B44 has historically carried between 35,000 and 40,000 people on an average weekday and 13.6 million annual ri..."
          }
        ]
      }
    ]
  },
  {
    "value": "B49",
    "count": 3,
    "records": [
      "metric_b49-ridership-recovery-d-church",
      "metric_b49-travel-time-am",
      "metric_b49-travel-time-pm"
    ],
    "representative_records": [
      {
        "record_id": "metric_b49-ridership-recovery-d-church",
        "record_kind": "metric_claim",
        "display_name": "metric_b49_ridership_recovery_d_church",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "ridership_change",
          "raw_value_text": "Between May 2014 and May 2015, B49 ridership at Avenue D and Church Avenue increased 47%",
          "value": 47,
          "unit": "percent",
          "scope": "Avenue_D_Church_Avenue_stops",
          "route": "B49",
          "comparison": "May_2014_to_May_2015",
          "unit_normalized": {
            "raw_text": "percent",
            "normalized_unit": "percent",
            "unit_family": "percentage"
          },
          "comparison_normalized": {
            "raw_text": "May_2014_to_May_2015",
            "normalized_value": "may_2014_to_may_2015"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p029_c0003",
            "page_number": 29,
            "role": "metric_value",
            "snippet": "The ridership trend changed towards positive ridership gains after May 2014. Between May 2014 and May 2015, B44 SBS ridership at Avenue D and Church Avenue increased 37%, roughly recovering to pre-implementation levels...."
          }
        ]
      },
      {
        "record_id": "metric_b49-travel-time-am",
        "record_kind": "metric_claim",
        "display_name": "metric_b49_travel_time_am",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "bus_travel_time_change",
          "raw_value_text": "B49 northbound in bus lane section AM: -7% (26.5 to 24.6 min)",
          "value": -7,
          "unit": "percent",
          "route": "B49",
          "direction": "northbound",
          "period": "AM_peak",
          "scope": "bus_lane_section_Foster_to_Fulton",
          "comparison": "Fall_2012_to_Fall_2015",
          "unit_normalized": {
            "raw_text": "percent",
            "normalized_unit": "percent",
            "unit_family": "percentage"
          },
          "direction_normalized": {
            "raw_text": "northbound",
            "normalized_value": "northbound"
          },
          "comparison_normalized": {
            "raw_text": "Fall_2012_to_Fall_2015",
            "normalized_value": "fall_2012_to_fall_2015"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p025_c0006",
            "page_number": 25,
            "role": "metric_table",
            "snippet": "Time Period Travel Time (mins) % Change Fall 2012 Fall 2015 AM 26.5 24.6 -7% PM 30 26.7 -11%"
          }
        ]
      },
      {
        "record_id": "metric_b49-travel-time-pm",
        "record_kind": "metric_claim",
        "display_name": "metric_b49_travel_time_pm",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "bus_travel_time_change",
          "raw_value_text": "B49 northbound in bus lane section PM: -11% (30 to 26.7 min)",
          "value": -11,
          "unit": "percent",
          "route": "B49",
          "direction": "northbound",
          "period": "PM_peak",
          "scope": "bus_lane_section_Foster_to_Fulton",
          "comparison": "Fall_2012_to_Fall_2015",
          "unit_normalized": {
            "raw_text": "percent",
            "normalized_unit": "percent",
            "unit_family": "percentage"
          },
          "direction_normalized": {
            "raw_text": "northbound",
            "normalized_value": "northbound"
          },
          "comparison_normalized": {
            "raw_text": "Fall_2012_to_Fall_2015",
            "normalized_value": "fall_2012_to_fall_2015"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p025_c0006",
            "page_number": 25,
            "role": "metric_table",
            "snippet": "Time Period Travel Time (mins) % Change Fall 2012 Fall 2015 AM 26.5 24.6 -7% PM 30 26.7 -11%"
          }
        ]
      }
    ]
  },
  {
    "value": "B44 Local",
    "count": 2,
    "records": [
      "metric_ridership-local-2014-avg",
      "metric_ridership-local-2015-avg"
    ],
    "representative_records": [
      {
        "record_id": "metric_ridership-local-2014-avg",
        "record_kind": "metric_claim",
        "display_name": "metric_ridership_local_2014_avg",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "average_weekday_ridership",
          "raw_value_text": "2014 Averages: B44 local 18,767",
          "value": 18767,
          "unit": "riders_per_weekday",
          "route": "B44 Local",
          "period": "2014",
          "unit_normalized": {
            "raw_text": "riders_per_weekday",
            "normalized_unit": "riders_per_weekday",
            "unit_family": "ridership"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p027_c0010",
            "page_number": 27,
            "role": "metric_value",
            "snippet": "2014 Averages B44 SBS: 17,249 B44 local: 18,767 2015 Averages B44 SBS: 18,986 (+10%) B44 local: 18,035 (-4%)"
          }
        ]
      },
      {
        "record_id": "metric_ridership-local-2015-avg",
        "record_kind": "metric_claim",
        "display_name": "metric_ridership_local_2015_avg",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "average_weekday_ridership",
          "raw_value_text": "2015 Averages: B44 local 18,035 (-4%)",
          "value": 18035,
          "unit": "riders_per_weekday",
          "route": "B44 Local",
          "period": "2015",
          "unit_normalized": {
            "raw_text": "riders_per_weekday",
            "normalized_unit": "riders_per_weekday",
            "unit_family": "ridership"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p027_c0010",
            "page_number": 27,
            "role": "metric_value",
            "snippet": "2014 Averages B44 SBS: 17,249 B44 local: 18,767 2015 Averages B44 SBS: 18,986 (+10%) B44 local: 18,035 (-4%)"
          }
        ]
      }
    ]
  },
  {
    "value": "B44 Total",
    "count": 1,
    "records": [
      "metric_ridership-b44-total-2015"
    ],
    "representative_records": [
      {
        "record_id": "metric_ridership-b44-total-2015",
        "record_kind": "metric_claim",
        "display_name": "metric_ridership_b44_total_2015",
        "source_ids": [
          "b44_sbs_progress_report_2016"
        ],
        "payload": {
          "metric_name": "average_weekday_ridership",
          "raw_value_text": "B44 Total 2015: 36,989 (+2.7%)",
          "value": 36989,
          "unit": "riders_per_weekday",
          "route": "B44 Total",
          "period": "2015",
          "unit_normalized": {
            "raw_text": "riders_per_weekday",
            "normalized_unit": "riders_per_weekday",
            "unit_family": "ridership"
          }
        },
        "evidence_examples": [
          {
            "source_id": "b44_sbs_progress_report_2016",
            "block_id": "p027_c0002",
            "page_number": 27,
            "role": "metric_table",
            "snippet": "Average Weekday Ridership and % Change from Prior Year 2011 2012 2013 2014 2015 B44 Total 39,516 39,661 37,786 36,016 36,989 -3.1%\" +0.4%\" -4.7%\" -4.7%\" +2.7%\" Brooklyn locals 640,056 641,773 634,406 620,976 615,432 -4...."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx1",
    "count": 1,
    "records": [
      "metric_bx1-stop-removal"
    ],
    "representative_records": [
      {
        "record_id": "metric_bx1-stop-removal",
        "record_kind": "metric_claim",
        "display_name": "Bx1 stop removal: 3% of stops removed",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "metric_name": "bus_stop_removal_rate",
          "raw_value_text": "3% (3 of 93)",
          "value": 3,
          "value_min": 3,
          "value_max": 3,
          "unit": "percent",
          "route": "Bx1",
          "stops_removed": 3,
          "total_stops": 93,
          "existing_stop_spacing_ft": 861,
          "proposed_stop_spacing_ft": 890,
          "unit_normalized": {
            "raw_text": "percent",
            "normalized_unit": "percent",
            "unit_family": "percentage"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p043_c0007",
            "page_number": 43,
            "role": "provides_metric",
            "snippet": "Three percent (3 of 93) of the Bx1 stops will be removed, improving the average distance between stops from 861 feet to 890 feet. Three percent (2 of 53) of the Bx1 Limited stops will be removed, improving the average d..."
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
      "rule_id": "metric-route-has-metric",
      "relation_kind": "has_metric",
      "direction": "target_to_origin",
      "records_with_field": 37,
      "value_count": 37,
      "derived_count": 0,
      "already_present_count": 16,
      "unresolved_count": 21,
      "skipped_self_count": 0
    }
  ]
}
```

### metric-claim-ontology:relation-context:metric_claim.source_system

- Category: relation_context_field
- Priority: 150
- Record kind: metric_claim
- Field: source_system
- Count: 26
- Title: Metric field source_system should be reviewed as relation context
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 1 endpoint values are already present or derivable (1 already present, 0 newly derivable); 25 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: entity/project has_metric metric_claim.
- metric_claim.source_system appears on 26 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "DOT stationary cameras",
    "count": 12,
    "records": [
      "metric_dot-operating-cost-2022",
      "metric_dot-operating-cost-2023",
      "metric_stationary-camera-locations",
      "metric_stationary-challenged-fine-reduction-pct"
    ],
    "representative_records": [
      {
        "record_id": "metric_dot-operating-cost-2022",
        "record_kind": "metric_claim",
        "display_name": "DOT stationary camera operating cost 2022",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "metric_name": "dot_stationary_operating_cost",
          "value": 8773020,
          "raw_value_text": "$8,773,020",
          "unit": "dollars",
          "year": 2022,
          "source_system": "DOT stationary cameras",
          "unit_normalized": {
            "raw_text": "dollars",
            "normalized_unit": "dollars",
            "unit_family": "money"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p008_c0001",
            "page_number": 8,
            "role": "metric_value",
            "snippet": "The operating cost incurred by DOT for stationary cameras in 2022 and 2023 was $8,773,020 and $8,761,035, respectively."
          }
        ]
      },
      {
        "record_id": "metric_dot-operating-cost-2023",
        "record_kind": "metric_claim",
        "display_name": "DOT stationary camera operating cost 2023",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "metric_name": "dot_stationary_operating_cost",
          "value": 8761035,
          "raw_value_text": "$8,761,035",
          "unit": "dollars",
          "year": 2023,
          "source_system": "DOT stationary cameras",
          "unit_normalized": {
            "raw_text": "dollars",
            "normalized_unit": "dollars",
            "unit_family": "money"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p008_c0001",
            "page_number": 8,
            "role": "metric_value",
            "snippet": "The operating cost incurred by DOT for stationary cameras in 2022 and 2023 was $8,773,020 and $8,761,035, respectively."
          }
        ]
      },
      {
        "record_id": "metric_stationary-camera-locations",
        "record_kind": "metric_claim",
        "display_name": "Stationary camera locations through 2023",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "metric_name": "stationary_camera_location_count",
          "value": 188,
          "raw_value_text": "188 locations",
          "unit": "locations",
          "year": 2023,
          "source_system": "DOT stationary cameras",
          "unit_normalized": {
            "raw_text": "locations",
            "normalized_unit": "locations",
            "unit_family": "count"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p006_c0004",
            "page_number": 6,
            "role": "metric_value",
            "snippet": "Through 2023, fixed bus lane cameras were installed at 188 locations along the following corridors:"
          }
        ]
      }
    ]
  },
  {
    "value": "MTA ABLE program",
    "count": 12,
    "records": [
      "metric_able-budget-2022",
      "metric_able-budget-2023",
      "metric_able-challenged-fine-reduction-pct",
      "metric_able-challenged-guilty-pct"
    ],
    "representative_records": [
      {
        "record_id": "metric_able-budget-2022",
        "record_kind": "metric_claim",
        "display_name": "ABLE program budgeted operating cost 2022",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "metric_name": "able_program_budgeted_operating_cost",
          "value": 2715000,
          "raw_value_text": "$2,715,000",
          "unit": "dollars",
          "year": 2022,
          "source_system": "MTA ABLE program",
          "unit_normalized": {
            "raw_text": "dollars",
            "normalized_unit": "dollars",
            "unit_family": "money"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p009_c0002",
            "page_number": 9,
            "role": "metric_value",
            "snippet": "Budgeted MTA operating costs for the ABLE program were $2,715,000 in 2022 and $3,610,000 in 2023."
          }
        ]
      },
      {
        "record_id": "metric_able-budget-2023",
        "record_kind": "metric_claim",
        "display_name": "ABLE program budgeted operating cost 2023",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "metric_name": "able_program_budgeted_operating_cost",
          "value": 3610000,
          "raw_value_text": "$3,610,000",
          "unit": "dollars",
          "year": 2023,
          "source_system": "MTA ABLE program",
          "unit_normalized": {
            "raw_text": "dollars",
            "normalized_unit": "dollars",
            "unit_family": "money"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p009_c0002",
            "page_number": 9,
            "role": "metric_value",
            "snippet": "Budgeted MTA operating costs for the ABLE program were $2,715,000 in 2022 and $3,610,000 in 2023."
          }
        ]
      },
      {
        "record_id": "metric_able-challenged-fine-reduction-pct",
        "record_kind": "metric_claim",
        "display_name": "ABLE violations fine reduction percentage",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "metric_name": "able_violations_fine_reduction_pct",
          "value": 1,
          "raw_value_text": "1%",
          "unit": "percent",
          "period": "2022-2023",
          "source_system": "MTA ABLE program",
          "unit_normalized": {
            "raw_text": "percent",
            "normalized_unit": "percent",
            "unit_family": "percentage"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p016_c0004",
            "page_number": 16,
            "role": "metric_value",
            "snippet": "Category Count Percentage Not challenged 203,136 86% Challenged - guilty 16,303 7% Challenged - not guilty 13,127 6% Challenged - fine reduction 2,394 1%"
          }
        ]
      }
    ]
  },
  {
    "value": "Better Buses program",
    "count": 1,
    "records": [
      "metric_bus-lane-miles-installed"
    ],
    "representative_records": [
      {
        "record_id": "metric_bus-lane-miles-installed",
        "record_kind": "metric_claim",
        "display_name": "Bus lane miles installed 2022-2023",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "metric_name": "bus_lane_miles_installed",
          "value": 23.1,
          "raw_value_text": "23.1 miles",
          "unit": "miles",
          "period": "2022-2023",
          "source_system": "Better Buses program",
          "unit_normalized": {
            "raw_text": "miles",
            "normalized_unit": "miles",
            "unit_family": "distance"
          }
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
    "value": "full bus lane automated enforcement program",
    "count": 1,
    "records": [
      "metric_total-revenue"
    ],
    "representative_records": [
      {
        "record_id": "metric_total-revenue",
        "record_kind": "metric_claim",
        "display_name": "Total revenue collected 2022-2023",
        "source_ids": [
          "bus_lane_camera_report_2024"
        ],
        "payload": {
          "metric_name": "total_revenue_collected",
          "value": 106584200.86,
          "raw_value_text": "$106,584,200.86",
          "unit": "dollars",
          "period": "2022-2023",
          "source_system": "full bus lane automated enforcement program",
          "unit_normalized": {
            "raw_text": "dollars",
            "normalized_unit": "dollars",
            "unit_family": "money"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bus_lane_camera_report_2024",
            "block_id": "p017_c0001",
            "page_number": 17,
            "role": "metric_value",
            "snippet": "The total amount of revenue collected as a result of violations issued by the full bus lane automated enforcement program during 2022 and 2023 was $106,584,200.86, comprised of $91,127,285.46 from the stationary camera..."
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
      "rule_id": "metric-source-system-has-metric",
      "relation_kind": "has_metric",
      "direction": "target_to_origin",
      "records_with_field": 26,
      "value_count": 26,
      "derived_count": 0,
      "already_present_count": 1,
      "unresolved_count": 25,
      "skipped_self_count": 0
    }
  ]
}
```

### metric-claim-ontology:relation-context:claim.route

- Category: relation_context_field
- Priority: 110
- Record kind: claim
- Field: route
- Count: 18
- Title: Claim field route needs ontology review
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 7 endpoint values are already present or derivable (7 already present, 0 newly derivable); 11 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: route has_claim claim.
- claim.route appears on 18 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "M86",
    "count": 4,
    "records": [
      "claim_dwell-time-impacted-by-nearside-stops",
      "claim_m86-second-busiest-crosstown",
      "claim_over-three-quarters-sbs-improvement",
      "claim_ridership-growth-impacted-by-fare-machines"
    ],
    "representative_records": [
      {
        "record_id": "claim_dwell-time-impacted-by-nearside-stops",
        "record_kind": "claim",
        "display_name": "claim_dwell_time_impacted_by_nearside_stops",
        "source_ids": [
          "m86_sbs_progress_report_2017"
        ],
        "payload": {
          "claim_text": "Dwell time improvement would likely have been greater if not for the temporary movement of high-ridership stops at Lexington and 3rd Avenues to the nearside of their intersections to accommodate ongoing capital construction",
          "data_type": "caveat",
          "route": "M86",
          "data_type_normalized": {
            "raw_text": "caveat",
            "normalized_value": "caveat"
          }
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p009_c0006",
            "page_number": 9,
            "role": "claim_statement",
            "snippet": "Off-board fare payment – along with boarding from multiple doors – has led to decreased delays at bus stops. Dwell time – or the time spent boarding passengers – fell 11% from February 2015 to February 2016 as a result..."
          }
        ]
      },
      {
        "record_id": "claim_m86-second-busiest-crosstown",
        "record_kind": "claim",
        "display_name": "claim_m86_second_busiest_crosstown",
        "source_ids": [
          "m86_sbs_progress_report_2017"
        ],
        "payload": {
          "claim_text": "Prior to SBS, the M86 carried over 24,000 daily passengers, making the M86 the second-busiest crosstown bus route (second to the M14A/D) in Manhattan with the highest per-mile ridership in the city.",
          "_merged_field_values": {
            "claim_text": [
              "Prior to SBS, the M86 carried over 24,000 daily passengers, making the M86 the second-busiest crosstown bus route (second to the M14A/D) in Manhattan with the highest per-mile ridership in the city.",
              "Prior to SBS, the M86 was the second-busiest crosstown bus route (second to the M14A/D) in Manhattan with the highest per-mile ridership in the city"
            ]
          },
          "data_type": "ranking",
          "scope": "M86 Local before SBS",
          "route": "M86",
          "data_type_normalized": {
            "raw_text": "ranking",
            "normalized_value": "ranking"
          }
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p003_c0009",
            "page_number": 3,
            "role": "ridership_ranking",
            "snippet": "Prior to SBS, the M86 carried over 24,000 daily passengers, making the M86 the second-busiest crosstown bus route (second to the M14A/D) in Manhattan with the highest per-mile ridership in the city."
          }
        ]
      },
      {
        "record_id": "claim_over-three-quarters-sbs-improvement",
        "record_kind": "claim",
        "display_name": "claim_over_three_quarters_sbs_improvement",
        "source_ids": [
          "m86_sbs_progress_report_2017"
        ],
        "payload": {
          "claim_text": "Over three-quarters of surveyed riders stated that the new SBS is an improvement over the previous local service",
          "data_type": "survey result",
          "scope": "July 2016 customer survey",
          "route": "M86",
          "data_type_normalized": {
            "raw_text": "survey result",
            "normalized_value": "survey_result"
          }
        },
        "evidence_examples": [
          {
            "source_id": "m86_sbs_progress_report_2017",
            "block_id": "p007_c0004",
            "page_number": 7,
            "role": "claim_statement",
            "snippet": "In a July 2016 survey of customer perceptions of the M86 SBS service, riders gave the service high marks, with a 96% satisfaction for overall service. Over three-quarters of surveyed riders stated that the new SBS is an..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx6 SBS",
    "count": 2,
    "records": [
      "claim_bx6-sbs-reroute-story-ave",
      "claim_bx6sbs-reroute-story-turnbull-pugsley"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx6-sbs-reroute-story-ave",
        "record_kind": "claim",
        "display_name": "Bx6 SBS reroute via Story Avenue",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx6 SBS service will run along Bruckner Boulevard, Bronx River Avenue, and Story Avenue as proposed in Draft Plan",
          "route": "Bx6 SBS",
          "change_type": "reroute",
          "streets": [
            "Bruckner Boulevard",
            "Bronx River Avenue",
            "Story Avenue"
          ],
          "change_type_normalized": {
            "raw_text": "reroute",
            "normalized_value": "reroute"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p019_c0002",
            "page_number": 19,
            "role": "describes_change",
            "snippet": "The map below shows how the Bx5 and Bx6 SBS routes work together with the alignments proposed in the Draft Plan. Customers expressed concerns over the proposed routing in the Draft Plan. As can be seen on this map, the..."
          }
        ]
      },
      {
        "record_id": "claim_bx6sbs-reroute-story-turnbull-pugsley",
        "record_kind": "claim",
        "display_name": "Bx6 SBS reroute to Story Avenue / Turnbull and Pugsley",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx6 SBS will be rerouted along Bruckner Boulevard, Bronx River Avenue, and Story Avenue to a new eastern terminal at Turnbull and Pugsley avenues. The route will no longer serve Hunts Point, which will continue to be served by Bx6 Local Service.",
          "route": "Bx6 SBS",
          "change_type": "reroute",
          "new_streets": [
            "Bruckner Boulevard",
            "Bronx River Avenue",
            "Story Avenue"
          ],
          "new_terminal": "Turnbull and Pugsley avenues",
          "change_type_normalized": {
            "raw_text": "reroute",
            "normalized_value": "reroute"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p057_c0004",
            "page_number": 57,
            "role": "describes_change",
            "snippet": "The Bx6 Select Bus Service routing will change. To improve crosstown connections, the Bx6 Select Bus Service will be rerouted along Bruckner Boulevard, Bronx River Avenue, and Story Avenue to a new eastern terminal at T..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx11",
    "count": 1,
    "records": [
      "claim_bx11-frequency-improvement"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx11-frequency-improvement",
        "record_kind": "claim",
        "display_name": "Bx11 frequency improvement to 8-or-better",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx11 weekday frequency improves from 15-or-better to 8-or-better",
          "route": "Bx11",
          "existing": "15-or-better",
          "proposed": "8-or-better"
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
    "value": "Bx13",
    "count": 1,
    "records": [
      "claim_bx13-frequency-improvement"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx13-frequency-improvement",
        "record_kind": "claim",
        "display_name": "Bx13 frequency improvement to 8-or-better",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx13 weekday frequency improves from 15-or-better to 8-or-better",
          "route": "Bx13",
          "existing": "15-or-better",
          "proposed": "8-or-better"
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
    "value": "Bx23",
    "count": 1,
    "records": [
      "claim_bx23-unchanged"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx23-unchanged",
        "record_kind": "claim",
        "display_name": "Bx23 alignment unchanged",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx23 alignment will remain unchanged",
          "route": "Bx23",
          "change_type": "no_change",
          "change_type_normalized": {
            "raw_text": "no_change",
            "normalized_value": "no_change"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p018_c0003",
            "page_number": 18,
            "role": "describes_change",
            "snippet": "• Bx23 - alignment will remain unchanged • Bx25 - new route to operate between Bedford Park and north Co-op City via Allerton Avenue • Bx26 - maintain existing service in Co-op City • Bx28 - maintain existing service in..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx25",
    "count": 1,
    "records": [
      "claim_new-route-bx25"
    ],
    "representative_records": [
      {
        "record_id": "claim_new-route-bx25",
        "record_kind": "claim",
        "display_name": "New route Bx25",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx25 is a new route to operate between Bedford Park and north Co-op City via Allerton Avenue",
          "route": "Bx25",
          "change_type": "new_route",
          "description": "Bedford Park to north Co-op City via Allerton Avenue",
          "change_type_normalized": {
            "raw_text": "new_route",
            "normalized_value": "new_route"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p018_c0003",
            "page_number": 18,
            "role": "describes_route_change",
            "snippet": "• Bx23 - alignment will remain unchanged • Bx25 - new route to operate between Bedford Park and north Co-op City via Allerton Avenue • Bx26 - maintain existing service in Co-op City • Bx28 - maintain existing service in..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx36",
    "count": 1,
    "records": [
      "claim_bx36-routing-tremont-ave"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx36-routing-tremont-ave",
        "record_kind": "claim",
        "display_name": "Bx36 routing change to East Tremont Avenue",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx36 will now operate on East Tremont Avenue instead of East 174 and East 180 Streets, avoid its existing indirect routing along Boston Road.",
          "route": "Bx36",
          "change_type": "reroute",
          "change_type_normalized": {
            "raw_text": "reroute",
            "normalized_value": "reroute"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p117_c0004",
            "page_number": 117,
            "role": "describes_change",
            "snippet": "The Bx36 routing will change as part of the larger redesign effort to improve crosstown service by streamlining the Bx11, Bx35, Bx36, Bx40, and Bx42. The new Bx36 will still travel between Soundview and Washington Heigh..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx38",
    "count": 1,
    "records": [
      "claim_bx38-norwood-unchanged"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx38-norwood-unchanged",
        "record_kind": "claim",
        "display_name": "Bx38 maintain existing alignment in Norwood",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "We will maintain the existing route alignment of the Bx38 to maintain service options for customers in Norwood traveling to/from Co-op City.",
          "route": "Bx38",
          "location": "Norwood",
          "change_type": "maintain_existing",
          "location_normalized": {
            "raw_text": "Norwood"
          },
          "change_type_normalized": {
            "raw_text": "maintain_existing",
            "normalized_value": "maintain_existing"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p017_c0005",
            "page_number": 17,
            "role": "describes_change",
            "snippet": "Since release of the Draft Plan, we updated certain route alignment proposals in Norwood in response to customer comments and concerns. We will maintain the existing route alignment of the Bx38 to maintain service optio..."
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
      "rule_id": "claim-route-has-claim",
      "relation_kind": "has_claim",
      "direction": "target_to_origin",
      "records_with_field": 18,
      "value_count": 18,
      "derived_count": 0,
      "already_present_count": 7,
      "unresolved_count": 11,
      "skipped_self_count": 0
    }
  ]
}
```

### metric-claim-ontology:relation-context:claim.routes

- Category: relation_context_field
- Priority: 110
- Record kind: claim
- Field: routes
- Count: 8
- Title: Claim field routes needs ontology review
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Deterministic derived-relation coverage: 8 endpoint values are already present or derivable (8 already present, 0 newly derivable); 11 remain unresolved/pass-through and 0 self-links were skipped.
- Suggested relation family: route has_claim claim.
- claim.routes appears on 8 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "Bx40",
    "count": 4,
    "records": [
      "claim_bx40-42-throgs-neck-unchanged",
      "claim_bx40-bx42-routing-change",
      "claim_bx40-throgs-neck-draft-plan-not-implemented",
      "claim_tremont-routing-change"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx40-42-throgs-neck-unchanged",
        "record_kind": "claim",
        "display_name": "Bx40/42 maintain existing alignments in Throgs Neck",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "The southeastern route alignments of the Bx40 and Bx42 will remain as they exist today in Throgs Neck.",
          "routes": [
            "Bx40",
            "Bx42"
          ],
          "location": "Throgs Neck",
          "change_type": "maintain_existing",
          "location_normalized": {
            "raw_text": "Throgs Neck"
          },
          "change_type_normalized": {
            "raw_text": "maintain_existing",
            "normalized_value": "maintain_existing"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p017_c0002",
            "page_number": 17,
            "role": "describes_change",
            "snippet": "Since release of the Draft Plan, we updated certain route alignment proposals in the Central Bronx in response to customer comments and concerns. The southeastern route alignments of the Bx40 and Bx42 will remain as the..."
          }
        ]
      },
      {
        "record_id": "claim_bx40-bx42-routing-change",
        "record_kind": "claim",
        "display_name": "Bx40 and Bx42 routing change via East Tremont Avenue and East 180 Street",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx40 and Bx42 will travel via East Tremont Avenue and East 180 Street. Bx36 replaces existing Bx40/42 routing on Rosedale and Webster avenues. New connection to E 180 St 2 5 station (accessible).",
          "routes": [
            "Bx40",
            "Bx42",
            "Bx36"
          ],
          "change_type": "reroute",
          "change_type_normalized": {
            "raw_text": "reroute",
            "normalized_value": "reroute"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p123_c0004",
            "page_number": 123,
            "role": "describes_change",
            "snippet": "The Bx40 routing will change as part of the larger redesign effort to improve crosstown service by streamlining the Bx11, Bx35, Bx36, Bx40, and Bx42. The Bx40 will still travel between Throgs Neck and Morris Heights, bu..."
          }
        ]
      },
      {
        "record_id": "claim_bx40-throgs-neck-draft-plan-not-implemented",
        "record_kind": "claim",
        "display_name": "Bx40 Throgs Neck Draft Plan proposal not implemented",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Draft Plan proposal to adjust Bx40 service in Throgs Neck will not be implemented. The southeastern route alignments of the Bx40 and Bx42 will remain as they exist today in Throgs Neck.",
          "routes": [
            "Bx40",
            "Bx42"
          ],
          "location": "Throgs Neck",
          "location_normalized": {
            "raw_text": "Throgs Neck"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p123_c0005",
            "page_number": 123,
            "role": "states_change",
            "snippet": "Note: The Draft Plan proposal to adjust Bx40 service in Thros Neck will not be implemented."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx42",
    "count": 4,
    "records": [
      "claim_bx40-42-throgs-neck-unchanged",
      "claim_bx40-bx42-routing-change",
      "claim_bx40-throgs-neck-draft-plan-not-implemented",
      "claim_tremont-routing-change"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx40-42-throgs-neck-unchanged",
        "record_kind": "claim",
        "display_name": "Bx40/42 maintain existing alignments in Throgs Neck",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "The southeastern route alignments of the Bx40 and Bx42 will remain as they exist today in Throgs Neck.",
          "routes": [
            "Bx40",
            "Bx42"
          ],
          "location": "Throgs Neck",
          "change_type": "maintain_existing",
          "location_normalized": {
            "raw_text": "Throgs Neck"
          },
          "change_type_normalized": {
            "raw_text": "maintain_existing",
            "normalized_value": "maintain_existing"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p017_c0002",
            "page_number": 17,
            "role": "describes_change",
            "snippet": "Since release of the Draft Plan, we updated certain route alignment proposals in the Central Bronx in response to customer comments and concerns. The southeastern route alignments of the Bx40 and Bx42 will remain as the..."
          }
        ]
      },
      {
        "record_id": "claim_bx40-bx42-routing-change",
        "record_kind": "claim",
        "display_name": "Bx40 and Bx42 routing change via East Tremont Avenue and East 180 Street",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx40 and Bx42 will travel via East Tremont Avenue and East 180 Street. Bx36 replaces existing Bx40/42 routing on Rosedale and Webster avenues. New connection to E 180 St 2 5 station (accessible).",
          "routes": [
            "Bx40",
            "Bx42",
            "Bx36"
          ],
          "change_type": "reroute",
          "change_type_normalized": {
            "raw_text": "reroute",
            "normalized_value": "reroute"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p123_c0004",
            "page_number": 123,
            "role": "describes_change",
            "snippet": "The Bx40 routing will change as part of the larger redesign effort to improve crosstown service by streamlining the Bx11, Bx35, Bx36, Bx40, and Bx42. The Bx40 will still travel between Throgs Neck and Morris Heights, bu..."
          }
        ]
      },
      {
        "record_id": "claim_bx40-throgs-neck-draft-plan-not-implemented",
        "record_kind": "claim",
        "display_name": "Bx40 Throgs Neck Draft Plan proposal not implemented",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Draft Plan proposal to adjust Bx40 service in Throgs Neck will not be implemented. The southeastern route alignments of the Bx40 and Bx42 will remain as they exist today in Throgs Neck.",
          "routes": [
            "Bx40",
            "Bx42"
          ],
          "location": "Throgs Neck",
          "location_normalized": {
            "raw_text": "Throgs Neck"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p123_c0005",
            "page_number": 123,
            "role": "states_change",
            "snippet": "Note: The Draft Plan proposal to adjust Bx40 service in Thros Neck will not be implemented."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx36",
    "count": 2,
    "records": [
      "claim_bx40-bx42-routing-change",
      "claim_tremont-routing-change"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx40-bx42-routing-change",
        "record_kind": "claim",
        "display_name": "Bx40 and Bx42 routing change via East Tremont Avenue and East 180 Street",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx40 and Bx42 will travel via East Tremont Avenue and East 180 Street. Bx36 replaces existing Bx40/42 routing on Rosedale and Webster avenues. New connection to E 180 St 2 5 station (accessible).",
          "routes": [
            "Bx40",
            "Bx42",
            "Bx36"
          ],
          "change_type": "reroute",
          "change_type_normalized": {
            "raw_text": "reroute",
            "normalized_value": "reroute"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p123_c0004",
            "page_number": 123,
            "role": "describes_change",
            "snippet": "The Bx40 routing will change as part of the larger redesign effort to improve crosstown service by streamlining the Bx11, Bx35, Bx36, Bx40, and Bx42. The Bx40 will still travel between Throgs Neck and Morris Heights, bu..."
          }
        ]
      },
      {
        "record_id": "claim_tremont-routing-change",
        "record_kind": "claim",
        "display_name": "Bx36, Bx40, Bx42 Tremont routing change",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx36 will run on Tremont Avenue continuously between East 180 Street and Webster Avenue, and Bx40 and Bx42 will run on East 180 Street between Tremont Avenue and Webster Avenue to allow for more direct routing.",
          "routes": [
            "Bx36",
            "Bx40",
            "Bx42"
          ],
          "location": "Tremont Avenue / East 180 Street / Webster Avenue",
          "location_normalized": {
            "raw_text": "Tremont Avenue / East 180 Street / Webster Avenue",
            "street": "180 Street"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p032_c0003",
            "page_number": 32,
            "role": "describes_change",
            "snippet": "Tremont Avenue is a major east-west corridor in the Central Bronx, connecting dense residential neighborhoods, neighborhood retail and dining, and parks. The street varies between 50 feet and 70 feet wide throughout the..."
          }
        ]
      }
    ]
  },
  {
    "value": "B44 SBS",
    "count": 1,
    "records": [
      "claim_able-rollout-m14-b44-nov2019"
    ],
    "representative_records": [
      {
        "record_id": "claim_able-rollout-m14-b44-nov2019",
        "record_kind": "claim",
        "display_name": "ABLE rollout on M14 SBS and B44 SBS by Nov 2019",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Automated Bus Lane Enforcement (ABLE) is now active on all M15 SBS buses, and will roll out on all M14 SBS and B44 SBS buses by November of 2019.",
          "routes": [
            "M15 SBS",
            "M14 SBS",
            "B44 SBS"
          ],
          "target_date": "November 2019",
          "target_date_normalized": {
            "raw_text": "November 2019",
            "normalized_date": "2019-11",
            "precision": "month",
            "confidence": "parsed_text"
          }
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
      }
    ]
  },
  {
    "value": "Bx15",
    "count": 1,
    "records": [
      "claim_bx15-split-m125-creation"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx15-split-m125-creation",
        "record_kind": "claim",
        "display_name": "Bx15 split and M125 creation",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "The existing Bx15 will be split into two routes. The new Bx15 Local and Limited service will operate between The Hub and Fordham Plaza at all times. The new M125 route will replace service along 125 Street to The Hub.",
          "routes": [
            "Bx15",
            "M125"
          ],
          "change_type": "route_split",
          "change_type_normalized": {
            "raw_text": "route_split",
            "normalized_value": "route_split"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p075_c0004",
            "page_number": 75,
            "role": "describes_change",
            "snippet": "The existing Bx15 will be split into two routes to improve reliability and bus speeds throughout the length of the route. The new Bx15 Local and Limited service will operate between The Hub and Fordham Plaza at all time..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx28",
    "count": 1,
    "records": [
      "claim_bx28-38-coop-city-unchanged"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx28-38-coop-city-unchanged",
        "record_kind": "claim",
        "display_name": "Bx28/38 maintain existing service in Co-op City",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx28 - maintain existing service in Co-op City. Bx38 - maintain existing service in Co-op City.",
          "routes": [
            "Bx28",
            "Bx38"
          ],
          "change_type": "maintain_existing",
          "change_type_normalized": {
            "raw_text": "maintain_existing",
            "normalized_value": "maintain_existing"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p018_c0003",
            "page_number": 18,
            "role": "describes_change",
            "snippet": "• Bx23 - alignment will remain unchanged • Bx25 - new route to operate between Bedford Park and north Co-op City via Allerton Avenue • Bx26 - maintain existing service in Co-op City • Bx28 - maintain existing service in..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx38",
    "count": 1,
    "records": [
      "claim_bx28-38-coop-city-unchanged"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx28-38-coop-city-unchanged",
        "record_kind": "claim",
        "display_name": "Bx28/38 maintain existing service in Co-op City",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "Bx28 - maintain existing service in Co-op City. Bx38 - maintain existing service in Co-op City.",
          "routes": [
            "Bx28",
            "Bx38"
          ],
          "change_type": "maintain_existing",
          "change_type_normalized": {
            "raw_text": "maintain_existing",
            "normalized_value": "maintain_existing"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p018_c0003",
            "page_number": 18,
            "role": "describes_change",
            "snippet": "• Bx23 - alignment will remain unchanged • Bx25 - new route to operate between Bedford Park and north Co-op City via Allerton Avenue • Bx26 - maintain existing service in Co-op City • Bx28 - maintain existing service in..."
          }
        ]
      }
    ]
  },
  {
    "value": "Bx5",
    "count": 1,
    "records": [
      "claim_bx5-bx6sbs-combined-story-ave-frequency"
    ],
    "representative_records": [
      {
        "record_id": "claim_bx5-bx6sbs-combined-story-ave-frequency",
        "record_kind": "claim",
        "display_name": "Bx5 and Bx6 SBS combined frequency on Story Avenue",
        "source_ids": [
          "bronx_bus_network_final_plan_2019"
        ],
        "payload": {
          "claim_text": "With both the Bx5 and Bx6 SBS combined, Story Avenue will now have a bus scheduled every 3 minutes in the weekday AM peak, every 6 minutes in the midday, and every 4 minutes in the PM peak.",
          "location": "Story Avenue",
          "routes": [
            "Bx5",
            "Bx6 SBS"
          ],
          "am_peak_minutes": 3,
          "midday_minutes": 6,
          "pm_peak_minutes": 4,
          "location_normalized": {
            "raw_text": "Story Avenue"
          }
        },
        "evidence_examples": [
          {
            "source_id": "bronx_bus_network_final_plan_2019",
            "block_id": "p053_c0010",
            "page_number": 53,
            "role": "provides_metric",
            "snippet": "The Bx5 weekday and weekend schedule will receive a slight decrease in frequency to reallocate resources for the new Bx6 Select Bus Service extension along Story Avenue. With both the Bx5 and Bx6 SBS combined, Story Ave..."
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
      "rule_id": "claim-route-has-claim",
      "relation_kind": "has_claim",
      "direction": "target_to_origin",
      "records_with_field": 8,
      "value_count": 19,
      "derived_count": 0,
      "already_present_count": 8,
      "unresolved_count": 11,
      "skipped_self_count": 0
    }
  ]
}
```

### metric-claim-ontology:relation-context:claim.source

- Category: relation_context_field
- Priority: 110
- Record kind: claim
- Field: source
- Count: 15
- Title: Claim field source needs ontology review
- Decision options: relation_candidate, keep_passthrough, alias_field, needs_more_data, no_change

Reasons:
- Suggested relation family: data_provided_by.
- claim.source appears on 15 canonical records but points at external records/context, not a closed enum.

Examples:
```json
[
  {
    "value": "bus rider survey",
    "count": 6,
    "records": [
      "claim_survey-benefit-comments",
      "claim_survey-bus-stop-crowding",
      "claim_survey-confusing-signage",
      "claim_survey-pedestrian-safety-comment"
    ],
    "representative_records": [
      {
        "record_id": "claim_survey-benefit-comments",
        "record_kind": "claim",
        "display_name": "Survey comments on benefits",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "claim_text": "Number of buses have increased, and service has gotten better",
          "description": "Survey respondent comment about Busway benefits",
          "source": "bus rider survey"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p015_c0006",
            "page_number": 15,
            "role": "stated",
            "snippet": "• Number of buses have increased, and service has gotten better • Pedestrians see fewer conflict with vehicles, and feels safer crossing 181 st St • Reduced congestion along Busway limits"
          }
        ]
      },
      {
        "record_id": "claim_survey-bus-stop-crowding",
        "record_kind": "claim",
        "display_name": "Survey comment on bus stop crowding",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "claim_text": "Bus stop crowding is still a concern",
          "description": "Survey respondent comment about Busway challenges",
          "source": "bus rider survey"
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
        "record_id": "claim_survey-confusing-signage",
        "record_kind": "claim",
        "display_name": "Survey comment on confusing signage",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "claim_text": "Confusing signage",
          "description": "Survey respondent comment about Busway challenges",
          "source": "bus rider survey"
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
  },
  {
    "value": "business outreach",
    "count": 5,
    "records": [
      "claim_business-concern-customer-confusion",
      "claim_business-concern-loading-hours",
      "claim_business-concern-parking-coned",
      "claim_business-concern-safety-evening"
    ],
    "representative_records": [
      {
        "record_id": "claim_business-concern-customer-confusion",
        "record_kind": "claim",
        "display_name": "Customer confusion concerns from business outreach",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "claim_text": "Customers confused about Busway regulations, afraid of getting tickets",
          "description": "Key concern raised during door-to-door business outreach on May 17, 2022",
          "source": "business outreach"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p011_c0005",
            "page_number": 11,
            "role": "stated",
            "snippet": "• Customers confused about Busway regulations, afraid of getting tickets • Safety and quality of life concerns in the evening • Parking availability, including impacts of ConEd construction staging • Commercial loading..."
          }
        ]
      },
      {
        "record_id": "claim_business-concern-loading-hours",
        "record_kind": "claim",
        "display_name": "Commercial loading hours concern",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "claim_text": "Commercial loading hours do not match when deliveries are made",
          "description": "Key concern raised during door-to-door business outreach on May 17, 2022",
          "source": "business outreach"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p011_c0005",
            "page_number": 11,
            "role": "stated",
            "snippet": "• Customers confused about Busway regulations, afraid of getting tickets • Safety and quality of life concerns in the evening • Parking availability, including impacts of ConEd construction staging • Commercial loading..."
          }
        ]
      },
      {
        "record_id": "claim_business-concern-parking-coned",
        "record_kind": "claim",
        "display_name": "Parking availability concerns including ConEd staging",
        "source_ids": [
          "181st_street_jun2022"
        ],
        "payload": {
          "claim_text": "Parking availability, including impacts of ConEd construction staging",
          "description": "Key concern raised during door-to-door business outreach on May 17, 2022",
          "source": "business outreach"
        },
        "evidence_examples": [
          {
            "source_id": "181st_street_jun2022",
            "block_id": "p011_c0005",
            "page_number": 11,
            "role": "stated",
            "snippet": "• Customers confused about Busway regulations, afraid of getting tickets • Safety and quality of life concerns in the evening • Parking availability, including impacts of ConEd construction staging • Commercial loading..."
          }
        ]
      }
    ]
  },
  {
    "value": "DOT Street Ambassadors door-to-door outreach",
    "count": 4,
    "records": [
      "claim_business-delivery-difficulties",
      "claim_business-revenue-suffered",
      "claim_inconvenient-taxi-access",
      "claim_vendors-taking-loading-space"
    ],
    "representative_records": [
      {
        "record_id": "claim_business-delivery-difficulties",
        "record_kind": "claim",
        "display_name": "Businessowner concern: difficult deliveries",
        "source_ids": [
          "jamaica_busway_monitoring_update_2022"
        ],
        "payload": {
          "claim_text": "Difficult to receive deliveries due to lack of commercial loading, unpredictable delivery times, and cars with placards blocking loading zone spaces",
          "statement": "business_concern",
          "source": "DOT Street Ambassadors door-to-door outreach",
          "date_text": "March 21 & 25, 2022",
          "date_text_normalized": {
            "raw_text": "March 21 & 25, 2022",
            "precision": "unknown",
            "confidence": "unparsed"
          }
        },
        "evidence_examples": [
          {
            "source_id": "jamaica_busway_monitoring_update_2022",
            "block_id": "p009_c0003",
            "page_number": 9,
            "role": "claim",
            "snippet": "• DOT's Street Ambassadors went door-to-door on Jamaica Ave to hear concerns about the Busway from the business community • Businessowner concerns: • Difficult to receive deliveries due to lack of commercial loading, un..."
          }
        ]
      },
      {
        "record_id": "claim_business-revenue-suffered",
        "record_kind": "claim",
        "display_name": "Businessowner concern: revenue and customer traffic suffered",
        "source_ids": [
          "jamaica_busway_monitoring_update_2022"
        ],
        "payload": {
          "claim_text": "Merchants felt business revenue and customer traffic has suffered",
          "statement": "business_concern",
          "source": "DOT Street Ambassadors door-to-door outreach",
          "date_text": "March 21 & 25, 2022",
          "date_text_normalized": {
            "raw_text": "March 21 & 25, 2022",
            "precision": "unknown",
            "confidence": "unparsed"
          }
        },
        "evidence_examples": [
          {
            "source_id": "jamaica_busway_monitoring_update_2022",
            "block_id": "p009_c0003",
            "page_number": 9,
            "role": "claim",
            "snippet": "• DOT's Street Ambassadors went door-to-door on Jamaica Ave to hear concerns about the Busway from the business community • Businessowner concerns: • Difficult to receive deliveries due to lack of commercial loading, un..."
          }
        ]
      },
      {
        "record_id": "claim_inconvenient-taxi-access",
        "record_kind": "claim",
        "display_name": "Businessowner concern: inconvenient taxi access",
        "source_ids": [
          "jamaica_busway_monitoring_update_2022"
        ],
        "payload": {
          "claim_text": "Inconvenient to access busway via taxi",
          "statement": "business_concern",
          "source": "DOT Street Ambassadors door-to-door outreach",
          "date_text": "March 21 & 25, 2022",
          "date_text_normalized": {
            "raw_text": "March 21 & 25, 2022",
            "precision": "unknown",
            "confidence": "unparsed"
          }
        },
        "evidence_examples": [
          {
            "source_id": "jamaica_busway_monitoring_update_2022",
            "block_id": "p009_c0003",
            "page_number": 9,
            "role": "claim",
            "snippet": "• DOT's Street Ambassadors went door-to-door on Jamaica Ave to hear concerns about the Busway from the business community • Businessowner concerns: • Difficult to receive deliveries due to lack of commercial loading, un..."
          }
        ]
      }
    ]
  }
]
```
