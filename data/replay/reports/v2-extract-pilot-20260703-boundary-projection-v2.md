# Replay Eval v2-extract-pilot-20260703-boundary-projection-v2

- Release: v1-rc5
- Sources: 10
- Self diff: no
- Overall agreement: 0.00% (0/722)

## Agreement By Kind

| Kind | Expected | Actual | Match | Field mismatch | Missing | Extra | Agreement |
|---|---:|---:|---:|---:|---:|---:|---:|
| claim | 57 | 36 | 0 | 13 | 44 | 23 | 0.00% |
| corridor | 10 | 11 | 0 | 10 | 0 | 1 | 0.00% |
| entity | 34 | 19 | 0 | 14 | 20 | 5 | 0.00% |
| event | 57 | 35 | 0 | 23 | 34 | 12 | 0.00% |
| metric_claim | 163 | 91 | 0 | 78 | 85 | 13 | 0.00% |
| project | 13 | 7 | 0 | 6 | 7 | 1 | 0.00% |
| relation | 252 | 92 | 0 | 3 | 249 | 89 | 0.00% |
| route | 51 | 45 | 0 | 44 | 7 | 1 | 0.00% |
| source | 10 | 8 | 0 | 8 | 2 | 0 | 0.00% |
| source_gap | 2 | 0 | 0 | 0 | 2 | 0 | 0.00% |
| treatment_component | 73 | 30 | 0 | 21 | 52 | 9 | 0.00% |

## Top Mismatch Fields

| Field | Count |
|---|---:|
| payload.description | 177 |
| payload.unit_normalized.normalized_unit | 78 |
| payload.unit_normalized.raw_text | 78 |
| payload.unit_normalized.unit_family | 78 |
| payload.scope | 64 |
| payload.borough_normalized | 54 |
| payload.metric_name | 53 |
| payload.raw_value_text | 52 |
| payload.route_name | 44 |
| payload.route_record_scope | 44 |
| payload.route_record_scope_reason | 44 |
| payload.route_type_normalized | 44 |
| payload.service_variant | 44 |
| evidence_refs | 43 |
| payload.route_type | 38 |
| payload.route_label | 37 |
| payload.unit | 33 |
| payload.boroughs_normalized | 29 |
| payload.borough | 28 |
| payload.boroughs | 26 |

## Agreement By Source

| Source | Expected | Actual | Match | Field mismatch | Missing | Extra | Agreement |
|---|---:|---:|---:|---:|---:|---:|---:|
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | 96 | 53 | 0 | 28 | 68 | 25 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | 84 | 34 | 0 | 20 | 64 | 14 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb10_may2025 | 91 | 51 | 0 | 34 | 57 | 17 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb11_mar2025 | 74 | 32 | 0 | 27 | 47 | 5 | 0.00% |
| 116_st_morningside_ave_pleasant_ave_cb11_may2025 | 98 | 49 | 0 | 26 | 72 | 23 | 0.00% |
| 14th_street_busway | 33 | 22 | 0 | 13 | 20 | 9 | 0.00% |
| 14th_street_busway_brochure | 35 | 16 | 0 | 9 | 26 | 7 | 0.00% |
| 2009_05_13_brt_1st2nd_cac1 | 36 | 53 | 0 | 26 | 10 | 27 | 0.00% |
| 2010_01_14_brt_1st2nd_cac3 | 99 | 49 | 0 | 24 | 75 | 25 | 0.00% |
| 2010_04_29_brt_1st2nd_cac4 | 76 | 15 | 0 | 13 | 63 | 2 | 0.00% |

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
