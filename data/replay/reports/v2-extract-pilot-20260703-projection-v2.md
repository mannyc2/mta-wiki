# Replay Eval v2-extract-pilot-20260703-projection-v2

- Release: v1-rc5
- Sources: 10
- Self diff: no
- Overall agreement: 0.00% (0/722)

## Agreement By Kind

| Kind | Expected | Actual | Match | Field mismatch | Missing | Extra | Agreement |
|---|---:|---:|---:|---:|---:|---:|---:|
| claim | 57 | 26 | 0 | 11 | 46 | 15 | 0.00% |
| corridor | 10 | 10 | 0 | 9 | 1 | 1 | 0.00% |
| entity | 34 | 14 | 0 | 11 | 23 | 3 | 0.00% |
| event | 57 | 34 | 0 | 23 | 34 | 11 | 0.00% |
| metric_claim | 163 | 81 | 0 | 68 | 95 | 13 | 0.00% |
| project | 13 | 6 | 0 | 5 | 8 | 1 | 0.00% |
| relation | 252 | 78 | 0 | 0 | 252 | 78 | 0.00% |
| route | 51 | 35 | 0 | 34 | 17 | 1 | 0.00% |
| source | 10 | 7 | 0 | 7 | 3 | 0 | 0.00% |
| source_gap | 2 | 0 | 0 | 0 | 2 | 0 | 0.00% |
| treatment_component | 73 | 30 | 0 | 21 | 52 | 9 | 0.00% |

## Top Mismatch Fields

| Field | Count |
|---|---:|
| payload.description | 160 |
| payload.unit_normalized.normalized_unit | 68 |
| payload.unit_normalized.raw_text | 68 |
| payload.unit_normalized.unit_family | 68 |
| payload.scope | 54 |
| payload.metric_name | 46 |
| payload.raw_value_text | 44 |
| payload.borough_normalized | 43 |
| evidence_refs | 36 |
| payload.route_name | 34 |
| payload.route_record_scope | 34 |
| payload.route_record_scope_reason | 34 |
| payload.route_type_normalized | 34 |
| payload.service_variant | 34 |
| payload.unit | 29 |
| payload.route_type | 28 |
| payload.route_label | 27 |
| payload.boroughs_normalized | 23 |
| payload.date_precision | 23 |
| payload.event_family | 23 |

## Agreement By Source

| Source | Expected | Actual | Match | Field mismatch | Missing | Extra | Agreement |
|---|---:|---:|---:|---:|---:|---:|---:|
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | 96 | 0 | 0 | 0 | 96 | 0 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | 84 | 34 | 0 | 20 | 64 | 14 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb10_may2025 | 91 | 51 | 0 | 33 | 58 | 18 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb11_mar2025 | 74 | 32 | 0 | 27 | 47 | 5 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb11_may2025 | 98 | 49 | 0 | 26 | 72 | 23 | 0.00% |
| 14th_street_busway | 33 | 22 | 0 | 13 | 20 | 9 | 0.00% |
| 14th_street_busway_brochure | 35 | 16 | 0 | 8 | 27 | 8 | 0.00% |
| 2009_05_13_brt_1st2nd_cac1 | 36 | 53 | 0 | 26 | 10 | 27 | 0.00% |
| 2010_01_14_brt_1st2nd_cac3 | 99 | 49 | 0 | 24 | 75 | 25 | 0.00% |
| 2010_04_29_brt_1st2nd_cac4 | 76 | 15 | 0 | 12 | 64 | 3 | 0.00% |

## Collision Summary

| Scope | Kind | Buckets | Records | Projection-distinguishable | Projection-ambiguous |
|---|---|---:|---:|---:|---:|
| replay_scope | claim | 6 | 14 | 6 | 0 |
| replay_scope | entity | 2 | 5 | 2 | 0 |
| replay_scope | event | 10 | 50 | 10 | 0 |
| replay_scope | metric_claim | 39 | 144 | 39 | 0 |
| replay_scope | project | 1 | 2 | 1 | 0 |
| replay_scope | relation | 14 | 28 | 14 | 0 |
| replay_scope | route | 5 | 45 | 5 | 0 |
| replay_scope | treatment_component | 10 | 34 | 10 | 0 |
| full_release | claim | 984 | 2697 | 981 | 3 |
| full_release | corridor | 78 | 286 | 78 | 0 |
| full_release | entity | 2222 | 6853 | 2222 | 0 |
| full_release | event | 932 | 2677 | 931 | 1 |
| full_release | metric_claim | 7850 | 31023 | 7831 | 19 |
| full_release | project | 321 | 971 | 321 | 0 |
| full_release | relation | 679 | 1359 | 654 | 25 |
| full_release | route | 477 | 1567 | 477 | 0 |
| full_release | source | 13 | 26 | 13 | 0 |
| full_release | source_gap | 9 | 22 | 9 | 0 |
| full_release | treatment_component | 415 | 1310 | 415 | 0 |
