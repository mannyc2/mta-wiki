# V2 Extract Pilot Diagnostics v2-extract-pilot-20260703

- Status: STOP_pilot_below_bar
- Scoped replay agreement: 0.00% (0/722)
- Actual records: 321; field mismatches: 189; missing: 533; extra: 132
- Usage: 10 requests; 224642 input tokens; 183696 output tokens; 408338 total tokens; $0.059203 estimated cost
- STOP: Full replay was not run.

## Per Source

| Source | Expected | Actual | Match | Field mismatch | Missing | Extra |
|---|---:|---:|---:|---:|---:|---:|
| 116_st_morningside_ave_pleasant_ave_cb10_feb2025 | 96 | 0 | 0 | 0 | 96 | 0 |
| 116_st_morningside_ave_pleasant_ave_cb10_jun2025 | 84 | 34 | 0 | 20 | 64 | 14 |
| 116_st_morningside_ave_pleasant_ave_cb10_may2025 | 91 | 51 | 0 | 33 | 58 | 18 |
| 116_st_morningside_ave_pleasant_ave_cb11_mar2025 | 74 | 32 | 0 | 27 | 47 | 5 |
| 116_st_morningside_ave_pleasant_ave_cb11_may2025 | 98 | 49 | 0 | 26 | 72 | 23 |
| 14th_street_busway | 33 | 22 | 0 | 13 | 20 | 9 |
| 14th_street_busway_brochure | 35 | 16 | 0 | 8 | 27 | 8 |
| 2009_05_13_brt_1st2nd_cac1 | 36 | 53 | 0 | 26 | 10 | 27 |
| 2010_01_14_brt_1st2nd_cac3 | 99 | 49 | 0 | 24 | 75 | 25 |
| 2010_04_29_brt_1st2nd_cac4 | 76 | 15 | 0 | 12 | 64 | 3 |

## Review Codes

| Code | Count |
|---|---:|
| evidence_quote_not_in_block | 86 |
| missing_display_name | 53 |
| payload_schema_warning | 46 |
| anchor_ambiguous | 10 |
| anchor_new | 2 |
| unknown_evidence_block | 1 |

## Top Mismatch Fields

| Field | Count |
|---|---:|
| evidence_refs | 189 |
| display_name | 177 |
| payload.description | 160 |
| raw_text | 109 |
| payload.unit_normalized.normalized_unit | 68 |
| payload.unit_normalized.raw_text | 68 |
| payload.unit_normalized.unit_family | 68 |
| payload._merged_field_values.description | 58 |
| payload.scope | 54 |
| payload.borough_normalized | 50 |
| payload.metric_name | 48 |
| payload.raw_value_text | 46 |
| payload.route_name | 34 |
| payload.route_record_scope | 34 |
| payload.route_record_scope_reason | 34 |
| payload.route_type_normalized | 34 |
| payload.service_variant | 34 |
| payload._merged_field_values.route_type | 32 |
| payload.route_type | 30 |
| payload.boroughs_normalized | 28 |

## Extra Records

See the JSON diagnostics file for the full extra-record list.
