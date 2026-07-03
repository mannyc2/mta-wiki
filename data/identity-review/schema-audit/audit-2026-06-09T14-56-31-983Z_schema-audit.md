# Payload Schema Audit

run_id: 2026-06-09T14-56-31-983Z_schema-audit
generated_at: 2026-06-09T14:56:31.983Z

Corpus: 3393 submissions (accepted 3265 / rejected 128) across 12 observation kinds.
Canonical records in audit projection: 2991.

Thresholds: enum if ≤ 12 distinct string values and ≥ 2 occurrences and not free-text/numeric. Values count across **all** submissions (accepted + rejected).

Closure is **deferred**: all enums stay open with an escape hatch. `closure_readiness: saturated` flags an enum whose observed values look complete (near-zero singletons, well sampled) — a candidate to close later, not a decision.

## metric_claim

submissions: 1123 (accepted 1089 / rejected 34); canonical records: 1080

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| metric_name | yes | 1123 | 1089 | 1080 | 1.00 | scalar_string | 611 | free_text | travel_time, bus_travel_time, travel_time_change_pct, bus_travel_time… |
| raw_value_text | yes | 1104 | 1070 | 1061 | 0.98 | scalar_string | 990 | free_text | 0, 84, 14, 86%, +38%, +8%, 17, 18 |
| value | yes | 1068 | 1055 | 1047 | 0.95 | number | 0 | numeric |  |
| unit | — | 949 | 931 | 945 | 0.85 | scalar_string | 95 | free_text | percent, minutes, mph, miles, dollars, vehicles, intersections, routes |
| period | — | 367 | 366 | 366 | 0.33 | scalar_string | 89 | free_text | school_months, 2025, 2022-2023, May 2025, summer_months, December 202… |
| scope | — | 331 | 321 | 321 | 0.29 | scalar_string | 133 | free_text | New York City, CBD Overall, East Houston to South Ferry, Flatbush/Nos… |
| direction | — | 259 | 256 | 251 | 0.23 | scalar_string | 32 | free_text | neutral, decrease, increase, NB/EB, SB/WB, northbound, improvement, a… |
| description | — | 251 | 247 | 246 | 0.22 | scalar_string | 247 | free_text | Bus speed in slowest segments of 116th Street study area, Grade A thr… |
| unit_normalized | — | 221 | 220 | 945 | 0.20 | object | 0 | structured |  |
| route_label | — | 154 | 154 | 154 | 0.14 | scalar_string | 13 | free_text | M86, B44 SBS, M15 SBS, S79 SBS, Bx41 SBS, B60, Bx18A/B, M116 |
| year | — | 73 | 73 | 73 | 0.07 | mixed | 1 | numeric | 2022 |
| context | — | 71 | 69 | 69 | 0.06 | scalar_string | 53 | free_text | Brooklyn, Brooklyn bus network, Brooklyn residents, February 2015, 6:… |
| value_max | yes | 69 | 63 | 62 | 0.06 | mixed | 2 | enum_candidate | 2026-05-11T00:00:00.000, S79+ |
| value_min | yes | 68 | 63 | 62 | 0.06 | mixed | 2 | enum_candidate | 2019-10-07T00:00:00.000, B11 |
| comparison | — | 52 | 52 | 52 | 0.05 | mixed | 12 | enum_candidate | May 2019 vs May 2022, post_vs_pre_sbs, pre_sbs, post_sbs, May_2014_to… |
| route | — | 43 | 37 | 37 | 0.04 | scalar_string | 26 | free_text | B44 SBS, B44 Limited, B1, B44, B49, B44 Local, Bx4, B44 Total |
| time_period | — | 31 | 31 | 31 | 0.03 | scalar_string | 9 | enum_candidate | Daily, Dec-July (2021-2022), Dec-July average (2017-2018, 2018-2019,… |
| column | — | 26 | 26 | 26 | 0.02 | scalar_string | 10 | enum_candidate | Boro, Direction, SBS_Route1, TrafDir, Lane_Type, Lane_Type1, Lane_wid… |
| source_system | — | 26 | 26 | 26 | 0.02 | scalar_string | 4 | enum_candidate | DOT stationary cameras, MTA ABLE program, Better Buses program, full… |
| demographic_group | — | 24 | 24 | 24 | 0.02 | scalar_string | 4 | enum_candidate | Tier 1, Tier 2, Tier 3, Total |
| scenario | — | 24 | 24 | 24 | 0.02 | scalar_string | 3 | enum_candidate | existing_network, increase, proposed_network |
| mode | — | 20 | 20 | 20 | 0.02 | scalar_string | 3 | enum_candidate | subway, bus, paratransit |
| category | — | 19 | 17 | 17 | 0.02 | scalar_string | 14 | free_text | bus_frequency, bus_in_motion, bus_speed, stopped_at_bus_stops, very_s… |
| day_type | — | 18 | 18 | 18 | 0.02 | scalar_string | 4 | enum_candidate | weekday, saturday, sunday, weekend |
| borough | — | 16 | 16 | 16 | 0.01 | scalar_string | 6 | enum_candidate | Bronx, Manhattan, Queens, Staten Island, Brooklyn, Bronx/Manhattan |
| neighborhood | — | 16 | 16 | 16 | 0.01 | scalar_string | 6 | enum_candidate | Central Bronx, Co-op City, East Bronx, Harlem-125th, Highbridge, Soun… |
| units | — | 13 | 13 | 13 | 0.01 | scalar_string | 7 | enum_candidate | percent, dollars, miles, riders, riders per day, routes, USD |
| label | — | 12 | 12 | 12 | 0.01 | scalar_string | 3 | enum_candidate | post_busway, pre_busway_baseline, pre_busway |
| existing_stop_spacing_ft | — | 10 | 10 | 10 | 0.01 | number | 0 | numeric |  |
| proposed_stop_spacing_ft | — | 10 | 10 | 10 | 0.01 | number | 0 | numeric |  |
| stops_removed | — | 10 | 10 | 10 | 0.01 | number | 0 | numeric |  |
| total_stops | — | 10 | 10 | 10 | 0.01 | number | 0 | numeric |  |
| service_type | — | 9 | 9 | 9 | 0.01 | scalar_string | 4 | enum_candidate | express, Select Bus Service, express bus, local |
| value_unit | — | 9 | 9 | 9 | 0.01 | scalar_string | 3 | enum_candidate | percent, riders per day, seconds |
| comparison_period | — | 6 | 6 | 6 | 0.01 | scalar_string | 2 | enum_candidate | November 2024, October 2025 |
| existing_frequency_category | — | 6 | 0 | 0 | 0.01 | scalar_string | 2 | enum_candidate | 15-or-better, 30-or-better |
| perception | — | 6 | 4 | 4 | 0.01 | scalar_string | 3 | enum_candidate | faster, more_frequent, much_safer |
| pilot_value | — | 6 | 6 | 6 | 0.01 | number | 0 | numeric |  |
| pre_pilot_value | — | 6 | 6 | 6 | 0.01 | number | 0 | numeric |  |
| proposed_frequency_category | — | 6 | 0 | 0 | 0.01 | scalar_string | 3 | enum_candidate | 8-or-better, 15-or-better, 8-or-better (at Hunts Point only) |
| fine_tier | — | 5 | 5 | 5 | 0.00 | scalar_string | 5 | free_text | fifth and subsequent offenses, first offense, fourth offense, second… |
| frequency | — | 5 | 5 | 5 | 0.00 | scalar_string | 2 | enum_candidate | per_year, daily |
| location | — | 5 | 5 | 5 | 0.00 | scalar_string | 3 | enum_candidate | Bronx, New York City, Washington Heights and Inwood |
| location_normalized | — | 5 | 5 | 5 | 0.00 | object | 0 | structured |  |
| fine_period_months | — | 4 | 4 | 4 | 0.00 | number | 0 | numeric |  |
| subject | — | 4 | 4 | 4 | 0.00 | scalar_string | 3 | enum_candidate | NYC busways generally, Bx36 bus route, Tremont Avenue Busway |
| code | — | 3 | 3 | 3 | 0.00 | scalar_string | 3 | enum_candidate | A, T, W |
| value_note | — | 3 | 3 | 3 | 0.00 | scalar_string | 3 | enum_candidate | stated as 'more than 27,000', stated as 'nearly 25,000', stated as 'o… |
| date | — | 2 | 1 | 1 | 0.00 | scalar_string | 2 | enum_candidate | June 11, 2025, November 2019 |
| date_normalized | — | 2 | 1 | 1 | 0.00 | object | 0 | structured |  |
| days | — | 2 | 2 | 2 | 0.00 | scalar_string | 1 | enum_candidate | all |
| demographic | — | 2 | 2 | 2 | 0.00 | scalar_string | 2 | enum_candidate | pedestrians, seniors (62+) and persons with disabilities |
| denominator | — | 2 | 2 | 2 | 0.00 | number | 0 | numeric |  |
| provider | — | 2 | 2 | 2 | 0.00 | scalar_string | 2 | enum_candidate | broker, primary_carrier |
| temporal_context | — | 2 | 2 | 2 | 0.00 | scalar_string | 2 | enum_candidate | post-Busway, pre-Busway |
| value_direction | — | 2 | 2 | 2 | 0.00 | scalar_string | 1 | enum_candidate | increase |
| within_minutes | — | 2 | 2 | 2 | 0.00 | number | 0 | numeric |  |
| baseline_year | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| change | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| change_mom_pct | — | 1 | 0 | 0 | 0.00 | number | 0 | numeric |  |
| change_unit | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | percentage_points |
| change_yoy_pct | — | 1 | 0 | 0 | 0.00 | number | 0 | numeric |  |
| currency | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | USD |
| entity | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | New York City Transit |
| fiscal_year | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | FY2025 |
| goal | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | 95% |
| installed_since | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| meaning | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | Bus lane traffic direction code T |
| note | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | Table 1 total differs slightly from text total of 500,882 |
| numerator | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| proposed_rush_routes | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| routes | — | 1 | 0 | 0 | 0.00 | array_string | 2 | sparse | B44 SBS, M14 SBS |
| target | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| target_description | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | 1% below our goal of 95% |
| values | — | 1 | 1 | 1 | 0.00 | object | 0 | structured |  |
| year_over_year_change | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | 1.3% improvement |
| _merged_field_values | — | 0 | 0 | 8 | 0.00 | empty | 0 | sparse |  |
| borough_normalized | — | 0 | 0 | 16 | 0.00 | empty | 0 | sparse |  |
| comparison_normalized | — | 0 | 0 | 51 | 0.00 | empty | 0 | sparse |  |
| day_type_normalized | — | 0 | 0 | 18 | 0.00 | empty | 0 | sparse |  |
| demographic_group_normalized | — | 0 | 0 | 24 | 0.00 | empty | 0 | sparse |  |
| direction_normalized | — | 0 | 0 | 251 | 0.00 | empty | 0 | sparse |  |
| mode_normalized | — | 0 | 0 | 20 | 0.00 | empty | 0 | sparse |  |
| scenario_normalized | — | 0 | 0 | 24 | 0.00 | empty | 0 | sparse |  |
| service_type_normalized | — | 0 | 0 | 9 | 0.00 | empty | 0 | sparse |  |
| time_period_normalized | — | 0 | 0 | 31 | 0.00 | empty | 0 | sparse |  |

### Enum candidates (proposed closures, derived from corpus)

- **value_max** (69 all / 63 accepted / 62 canonical, 2 distinct, singletons 1/2, open): `2026-05-11T00:00:00.000` | `S79+`
  - counts: 2026-05-11T00:00:00.000×2
- **value_min** (68 all / 63 accepted / 62 canonical, 2 distinct, singletons 1/2, open): `2019-10-07T00:00:00.000` | `B11`
  - counts: 2019-10-07T00:00:00.000×2
- **comparison** (52 all / 52 accepted / 52 canonical, 12 distinct, singletons 5/12, open): `current_vs_pre_sbs` | `equivalent local routes` | `Fall_2012_to_Fall_2015` | `last_4_years` | `local buses` | `May 2019 vs May 2022` | `May_2014_to_May_2015` | `post_sbs` | `post_vs_pre_sbs` | `pre_sbs` | `subway riders 3.6%` | `year_over_year`
  - counts: May 2019 vs May 2022×13, post_vs_pre_sbs×13, pre_sbs×8, post_sbs×5, May_2014_to_May_2015×3, Fall_2012_to_Fall_2015×2, year_over_year×2
  - accepted counts: May 2019 vs May 2022×13, post_vs_pre_sbs×13, pre_sbs×8, post_sbs×5, May_2014_to_May_2015×3, Fall_2012_to_Fall_2015×2, year_over_year×2
  - canonical counts: May 2019 vs May 2022×13, post_vs_pre_sbs×13, pre_sbs×8, post_sbs×5, May_2014_to_May_2015×3, Fall_2012_to_Fall_2015×2, year_over_year×2
- **time_period** (31 all / 31 accepted / 31 canonical, 9 distinct, singletons 1/9, open): `AM Peak (6-10 AM)` | `Daily` | `Dec-July (2021-2022)` | `Dec-July average (2017-2018, 2018-2019, 2019-2020, 2020-2021)` | `Midday (10AM-3PM)` | `PM peak` | `PM Peak (3-7 PM)` | `Sep 2022 – May 2023` | `Sep 2023 – May 2024`
  - counts: Daily×6, Dec-July (2021-2022)×5, Dec-July average (2017-2018, 2018-2019, 2019-2020, 2020-2021)×5, Sep 2022 – May 2023×5, PM Peak (3-7 PM)×3, AM Peak (6-10 AM)×2, Midday (10AM-3PM)×2, PM peak×2
  - accepted counts: Daily×6, Dec-July (2021-2022)×5, Dec-July average (2017-2018, 2018-2019, 2019-2020, 2020-2021)×5, Sep 2022 – May 2023×5, PM Peak (3-7 PM)×3, AM Peak (6-10 AM)×2, Midday (10AM-3PM)×2, PM peak×2
  - canonical counts: Daily×6, Dec-July (2021-2022)×5, Dec-July average (2017-2018, 2018-2019, 2019-2020, 2020-2021)×5, Sep 2022 – May 2023×5, PM Peak (3-7 PM)×3, AM Peak (6-10 AM)×2, Midday (10AM-3PM)×2, PM peak×2
- **column** (26 all / 26 accepted / 26 canonical, 10 distinct, singletons 3/10, open): `Boro` | `Days` | `Direction` | `Hours` | `Lane_Color` | `Lane_Type` | `Lane_Type1` | `Lane_width` | `SBS_Route1` | `TrafDir`
  - counts: Boro×6, Direction×4, SBS_Route1×4, TrafDir×3, Lane_Type×2, Lane_Type1×2, Lane_width×2
  - accepted counts: Boro×6, Direction×4, SBS_Route1×4, TrafDir×3, Lane_Type×2, Lane_Type1×2, Lane_width×2
  - canonical counts: Boro×6, Direction×4, SBS_Route1×4, TrafDir×3, Lane_Type×2, Lane_Type1×2, Lane_width×2
- **source_system** (26 all / 26 accepted / 26 canonical, 4 distinct, singletons 2/4, open): `Better Buses program` | `DOT stationary cameras` | `full bus lane automated enforcement program` | `MTA ABLE program`
  - counts: DOT stationary cameras×12, MTA ABLE program×12
  - accepted counts: DOT stationary cameras×12, MTA ABLE program×12
  - canonical counts: DOT stationary cameras×12, MTA ABLE program×12
- **demographic_group** (24 all / 24 accepted / 24 canonical, 4 distinct, singletons 0/4, open): `Tier 1` | `Tier 2` | `Tier 3` | `Total`
  - counts: Tier 1×6, Tier 2×6, Tier 3×6, Total×6
  - accepted counts: Tier 1×6, Tier 2×6, Tier 3×6, Total×6
  - canonical counts: Tier 1×6, Tier 2×6, Tier 3×6, Total×6
- **scenario** (24 all / 24 accepted / 24 canonical, 3 distinct, singletons 0/3, open): `existing_network` | `increase` | `proposed_network`
  - counts: existing_network×8, increase×8, proposed_network×8
  - accepted counts: existing_network×8, increase×8, proposed_network×8
  - canonical counts: existing_network×8, increase×8, proposed_network×8
- **mode** (20 all / 20 accepted / 20 canonical, 3 distinct, singletons 0/3, open): `bus` | `paratransit` | `subway`
  - counts: subway×11, bus×5, paratransit×4
  - accepted counts: subway×11, bus×5, paratransit×4
  - canonical counts: subway×11, bus×5, paratransit×4
- **day_type** (18 all / 18 accepted / 18 canonical, 4 distinct, singletons 1/4, open): `saturday` | `sunday` | `weekday` | `weekend`
  - counts: weekday×9, saturday×5, sunday×3
  - accepted counts: weekday×9, saturday×5, sunday×3
  - canonical counts: weekday×9, saturday×5, sunday×3
- **borough** (16 all / 16 accepted / 16 canonical, 6 distinct, singletons 1/6, open): `Bronx` | `Bronx/Manhattan` | `Brooklyn` | `Manhattan` | `Queens` | `Staten Island`
  - counts: Bronx×4, Manhattan×3, Queens×3, Staten Island×3, Brooklyn×2
  - accepted counts: Bronx×4, Manhattan×3, Queens×3, Staten Island×3, Brooklyn×2
  - canonical counts: Bronx×4, Manhattan×3, Queens×3, Staten Island×3, Brooklyn×2
- **neighborhood** (16 all / 16 accepted / 16 canonical, 6 distinct, singletons 0/6, open): `Central Bronx` | `Co-op City` | `East Bronx` | `Harlem-125th` | `Highbridge` | `Soundview`
  - counts: Central Bronx×4, Co-op City×4, East Bronx×2, Harlem-125th×2, Highbridge×2, Soundview×2
  - accepted counts: Central Bronx×4, Co-op City×4, East Bronx×2, Harlem-125th×2, Highbridge×2, Soundview×2
  - canonical counts: Central Bronx×4, Co-op City×4, East Bronx×2, Harlem-125th×2, Highbridge×2, Soundview×2
- **units** (13 all / 13 accepted / 13 canonical, 7 distinct, singletons 5/7, open): `dollars` | `miles` | `percent` | `riders` | `riders per day` | `routes` | `USD`
  - counts: percent×5, dollars×3
  - accepted counts: percent×5, dollars×3
  - canonical counts: percent×5, dollars×3
- **label** (12 all / 12 accepted / 12 canonical, 3 distinct, singletons 0/3, open): `post_busway` | `pre_busway` | `pre_busway_baseline`
  - counts: post_busway×5, pre_busway_baseline×5, pre_busway×2
  - accepted counts: post_busway×5, pre_busway_baseline×5, pre_busway×2
  - canonical counts: post_busway×5, pre_busway_baseline×5, pre_busway×2
- **service_type** (9 all / 9 accepted / 9 canonical, 4 distinct, singletons 2/4, open): `express` | `express bus` | `local` | `Select Bus Service`
  - counts: express×4, Select Bus Service×3
  - accepted counts: express×4, Select Bus Service×3
  - canonical counts: express×4, Select Bus Service×3
- **value_unit** (9 all / 9 accepted / 9 canonical, 3 distinct, singletons 2/3, open): `percent` | `riders per day` | `seconds`
  - counts: percent×7
  - accepted counts: percent×7
  - canonical counts: percent×7
- **comparison_period** (6 all / 6 accepted / 6 canonical, 2 distinct, singletons 0/2, open): `November 2024` | `October 2025`
  - counts: November 2024×3, October 2025×3
  - accepted counts: November 2024×3, October 2025×3
  - canonical counts: November 2024×3, October 2025×3
- **existing_frequency_category** (6 all / 0 accepted / 0 canonical, 2 distinct, singletons 1/2, open): `15-or-better` | `30-or-better`
  - counts: 15-or-better×5
- **perception** (6 all / 4 accepted / 4 canonical, 3 distinct, singletons 0/3, open): `faster` | `more_frequent` | `much_safer`
  - counts: faster×2, more_frequent×2, much_safer×2
  - accepted counts: much_safer×2
  - canonical counts: much_safer×2
- **proposed_frequency_category** (6 all / 0 accepted / 0 canonical, 3 distinct, singletons 2/3, open): `15-or-better` | `8-or-better` | `8-or-better (at Hunts Point only)`
  - counts: 8-or-better×4
- **frequency** (5 all / 5 accepted / 5 canonical, 2 distinct, singletons 1/2, open): `daily` | `per_year`
  - counts: per_year×4
  - accepted counts: per_year×4
  - canonical counts: per_year×4
- **location** (5 all / 5 accepted / 5 canonical, 3 distinct, singletons 2/3, open): `Bronx` | `New York City` | `Washington Heights and Inwood`
  - counts: Bronx×3
  - accepted counts: Bronx×3
  - canonical counts: Bronx×3
- **subject** (4 all / 4 accepted / 4 canonical, 3 distinct, singletons 2/3, open): `Bx36 bus route` | `NYC busways generally` | `Tremont Avenue Busway`
  - counts: NYC busways generally×2
  - accepted counts: NYC busways generally×2
  - canonical counts: NYC busways generally×2
- **code** (3 all / 3 accepted / 3 canonical, 3 distinct, singletons 3/3, open): `A` | `T` | `W`
- **value_note** (3 all / 3 accepted / 3 canonical, 3 distinct, singletons 3/3, open): `stated as 'more than 27,000'` | `stated as 'nearly 25,000'` | `stated as 'over 30,000'`
- **date** (2 all / 1 accepted / 1 canonical, 2 distinct, singletons 2/2, open): `June 11, 2025` | `November 2019`
- **days** (2 all / 2 accepted / 2 canonical, 1 distinct, singletons 0/1, open): `all`
  - counts: all×2
  - accepted counts: all×2
  - canonical counts: all×2
- **demographic** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `pedestrians` | `seniors (62+) and persons with disabilities`
- **provider** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `broker` | `primary_carrier`
- **temporal_context** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `post-Busway` | `pre-Busway`
- **value_direction** (2 all / 2 accepted / 2 canonical, 1 distinct, singletons 0/1, open): `increase`
  - counts: increase×2
  - accepted counts: increase×2
  - canonical counts: increase×2

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`_merged_field_values`, `baseline_year`, `borough`, `borough_normalized`, `category`, `change`, `change_mom_pct`, `change_unit`, `change_yoy_pct`, `code`, `column`, `comparison`, `comparison_normalized`, `comparison_period`, `context`, `currency`, `date`, `date_normalized`, `day_type`, `day_type_normalized`, `days`, `demographic`, `demographic_group`, `demographic_group_normalized`, `denominator`, `description`, `direction`, `direction_normalized`, `entity`, `existing_frequency_category`, `existing_stop_spacing_ft`, `fine_period_months`, `fine_tier`, `fiscal_year`, `frequency`, `goal`, `installed_since`, `label`, `location`, `location_normalized`, `meaning`, `mode`, `mode_normalized`, `neighborhood`, `note`, `numerator`, `perception`, `period`, `pilot_value`, `pre_pilot_value`, `proposed_frequency_category`, `proposed_rush_routes`, `proposed_stop_spacing_ft`, `provider`, `route`, `route_label`, `routes`, `scenario`, `scenario_normalized`, `scope`, `service_type`, `service_type_normalized`, `source_system`, `stops_removed`, `subject`, `target`, `target_description`, `temporal_context`, `time_period`, `time_period_normalized`, `total_stops`, `unit`, `unit_normalized`, `units`, `value_direction`, `value_note`, `value_unit`, `values`, `within_minutes`, `year`, `year_over_year_change`

### Repeated labels / raw_text (source_labels candidates)

- (label ×3) Fare Evasion Decline at Fortified Stations
- (label ×3) Implementation Date range
- (label ×2) 116th Street: buses traveling less than 4 mph in some segments
- (label ×2) 55% of pedestrians feel bus travel is faster
- (label ×2) 57% of pedestrians feel bus service is more frequent
- (label ×2) Bus lane violation fine range
- (label ×2) Citywide Average Speed 9.3 mph
- (label ×2) Citywide Median Bunch Rate 10.6%
- (label ×2) Citywide Median On-time Rate 70.3%
- (label ×2) Congestion Pricing Overall Bunching After 8.1%
- (label ×2) Congestion Pricing Overall Bunching Before 9.9%
- (label ×2) Congestion Pricing Overall On-time After 70%
- (label ×2) Congestion Pricing Overall On-time Before 60.6%
- (label ×2) Congestion Pricing Overall Speed After 10.9 mph
- (label ×2) Congestion Pricing Overall Speed Before 10.7 mph
- (label ×2) NYPD Bus Lane Moving Violation Fine
- (label ×2) Over 230 open data assets as of 2026
- (label ×2) Program column - non-null count
- (raw_text ×3) Stations fortified with new infrastructure like turnstile sleeves and fins have seen fare evasion d…
- (raw_text ×2) +29%
- (raw_text ×2) +32%
- (raw_text ×2) +34%
- (raw_text ×2) +38%
- (raw_text ×2) +46%
- (raw_text ×2) 2.2pp
- (raw_text ×2) Bus service feels... More frequent 57%
- (raw_text ×2) bus speed increases ranging from 15% to 31%
- (raw_text ×2) Bus travel is... Faster 55%
- (raw_text ×2) Change in Jobs Reachable ↑ 121,504 ↑ 10.1%
- (raw_text ×2) Change in Jobs Reachable ↑ 62,557 ↑ 19.1%
- (raw_text ×2) Change in Residents Reachable ↑ 11,062 ↑ 17.6%
- (raw_text ×2) Change in Residents Reachable ↑ 23,892 ↑ 11.6%
- (raw_text ×2) over 230 open data assets available to the public today
- (raw_text ×2) This process identified 49 corridors to be studied for potential bus priority street improvements,…
- (raw_text ×2) We served nearly 1.35 million riders on 940,000 completed trips last month.

## relation

submissions: 507 (accepted 463 / rejected 44); canonical records: 691

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| relation_kind | yes | 507 | 463 | 691 | 1.00 | scalar_string | 117 | free_text | has_timeline_event, serves_route, in_development_for, has_treatment,… |
| subject_local_observation_id | yes | 507 | 463 | 691 | 1.00 | scalar_string | 153 | free_text | project_ace_automated_camera_enforcement, project_tsp_expansion_2017,… |
| object_local_observation_id | yes | 503 | 463 | 691 | 0.99 | scalar_string | 398 | free_text | entity_nyc_dot, entity_mta_nyct, entity_nyc-dot, project_open_data_pl… |
| description | — | 222 | 187 | 186 | 0.44 | scalar_string | 189 | free_text | B82 in Southern Brooklyn in development for TSP, Bx12 SBS on Fordham… |
| raw_relation_kind | — | 4 | 4 | 27 | 0.01 | scalar_string | 1 | enum_candidate | affects_route |
| routes_affected | — | 2 | 1 | 1 | 0.00 | array_string | 5 | free_text | Bx5, M100, M2, M4, M42 |
| contractor | — | 1 | 0 | 0 | 0.00 | scalar_string | 1 | sparse | Skanska |
| hotline | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | (929) 380-5778 |
| new_location | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | 90th Avenue |
| new_location_normalized | — | 1 | 1 | 1 | 0.00 | object | 0 | structured |  |
| old_location | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | Merrick Boulevard |
| old_location_normalized | — | 1 | 1 | 1 | 0.00 | object | 0 | structured |  |
| routes | — | 1 | 1 | 1 | 0.00 | array_string | 5 | sparse | Bx5, M100, M2, M4, M42 |
| derivation_confidence | — | 0 | 0 | 232 | 0.00 | empty | 0 | sparse |  |
| derivation_rule | — | 0 | 0 | 232 | 0.00 | empty | 0 | sparse |  |
| derived_from_payload_field | — | 0 | 0 | 232 | 0.00 | empty | 0 | sparse |  |
| derived_from_payload_value | — | 0 | 0 | 232 | 0.00 | empty | 0 | sparse |  |
| derived_from_record_id | — | 0 | 0 | 232 | 0.00 | empty | 0 | sparse |  |
| derived_relation | — | 0 | 0 | 232 | 0.00 | empty | 0 | sparse |  |
| object_id | — | 0 | 0 | 691 | 0.00 | empty | 0 | sparse |  |
| object_record_kind | — | 0 | 0 | 232 | 0.00 | empty | 0 | sparse |  |
| relation_family | — | 0 | 0 | 691 | 0.00 | empty | 0 | sparse |  |
| subject_id | — | 0 | 0 | 691 | 0.00 | empty | 0 | sparse |  |
| subject_record_kind | — | 0 | 0 | 232 | 0.00 | empty | 0 | sparse |  |

### Enum candidates (proposed closures, derived from corpus)

- **raw_relation_kind** (4 all / 4 accepted / 27 canonical, 1 distinct, singletons 0/1, open): `affects_route`
  - counts: affects_route×4
  - accepted counts: affects_route×4
  - canonical counts: has_treatment_component×16, affects_route×4, has_corridor×2

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`contractor`, `derivation_confidence`, `derivation_rule`, `derived_from_payload_field`, `derived_from_payload_value`, `derived_from_record_id`, `derived_relation`, `description`, `hotline`, `new_location`, `new_location_normalized`, `object_id`, `object_record_kind`, `old_location`, `old_location_normalized`, `raw_relation_kind`, `relation_family`, `routes`, `routes_affected`, `subject_id`, `subject_record_kind`

### Repeated labels / raw_text (source_labels candidates)

- (label ×3) Source published by NYC DOT
- (label ×2) ACE Program expanded to five routes
- (label ×2) Data & Analytics team publishes blog posts
- (label ×2) Jamaica Bus Depot located in Queens
- (label ×2) Report card builds on Behind Schedule
- (raw_text ×3) Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5.
- (raw_text ×3) the B68 and B60 in Brooklyn and the M57 in Manhattan entered a 60-day warning phase
- (raw_text ×2) 14th Street Select Bus Service launch in Summer 2019
- (raw_text ×2) approximately 1.2 million riders using the E , F , M , and R lines daily
- (raw_text ×2) As the primary policing agency in the NYCT subway system, the NYPD continues to enforce laws, rules…
- (raw_text ×2) Church Avenue Subway Station ... the 'B' and 'Q' subway line logos
- (raw_text ×2) Ever since Governor Kathy Hochul and New York State Legislature enacted the MTA Open Data Law in 20…
- (raw_text ×2) MTA and Skanska staff are ready to assist.
- (raw_text ×2) NYC DOT Bus Lanes dataset dictionary published by NYC Department of Transportation
- (raw_text ×2) The MTA is rebuilding and expanding the Jamaica Bus Depot in Queens

## claim

submissions: 429 (accepted 411 / rejected 18); canonical records: 409

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claim_text | yes | 398 | 383 | 381 | 0.93 | scalar_string | 384 | free_text | A 2025 report assessing corridor-level speed impacts of different bus… |
| description | yes | 214 | 201 | 201 | 0.50 | scalar_string | 193 | free_text | Key concern raised during door-to-door business outreach on May 17, 2… |
| statement | yes | 106 | 101 | 100 | 0.25 | scalar_string | 91 | free_text | monitoring_finding, business_concern, Data & Analytics team builds da… |
| data_type | — | 53 | 50 | 50 | 0.12 | scalar_string | 18 | free_text | text, number, plan, multiline, caveat, document_reference, achievemen… |
| column_name | — | 32 | 29 | 29 | 0.07 | scalar_string | 29 | free_text | Direction, Mid_Block, the_geom, Boro, Chron_ID_1, Days, Days_Code, Fa… |
| field_name | — | 32 | 29 | 29 | 0.07 | scalar_string | 29 | free_text | direction, mid_block, the_geom, bltrafdir, boro, chron_id_1, days, da… |
| position | — | 32 | 29 | 29 | 0.07 | number | 0 | numeric |  |
| non_null_count | — | 29 | 27 | 27 | 0.07 | number | 0 | numeric |  |
| null_count | — | 29 | 27 | 27 | 0.07 | number | 0 | numeric |  |
| change_type | — | 21 | 21 | 21 | 0.05 | scalar_string | 13 | free_text | reroute, maintain_existing, new_route, no_change, annual completion,… |
| route | — | 18 | 18 | 18 | 0.04 | scalar_string | 14 | free_text | M86, Bx6 SBS, Bx11, Bx13, Bx23, Bx25, Bx36, Bx38 |
| subject | — | 18 | 18 | 18 | 0.04 | scalar_string | 15 | free_text | redesign_plan, ABLE mobile cameras, Better Buses Action Plan, DOT sta… |
| source | — | 15 | 15 | 15 | 0.03 | scalar_string | 3 | enum_candidate | bus rider survey, business outreach, DOT Street Ambassadors door-to-d… |
| routes | — | 8 | 8 | 8 | 0.02 | array_string | 12 | free_text | Bx40, Bx42, Bx36, B44 SBS, Bx15, Bx28, Bx38, Bx5 |
| year | — | 7 | 7 | 7 | 0.02 | mixed | 1 | numeric | 2022 |
| existing | — | 6 | 6 | 6 | 0.01 | scalar_string | 2 | enum_candidate | 15-or-better, 30-or-better |
| largest_value | — | 6 | 6 | 6 | 0.01 | number | 0 | numeric |  |
| location | — | 6 | 6 | 6 | 0.01 | scalar_string | 5 | free_text | Throgs Neck, Grand Concourse, Norwood, Story Avenue, Tremont Avenue /… |
| location_normalized | — | 6 | 6 | 6 | 0.01 | object | 0 | structured |  |
| proposed | — | 6 | 6 | 6 | 0.01 | scalar_string | 2 | enum_candidate | 8-or-better, 15-or-better |
| bus_routes_count | — | 4 | 4 | 4 | 0.01 | number | 0 | numeric |  |
| claim_type | — | 4 | 4 | 4 | 0.01 | scalar_string | 3 | enum_candidate | violation_type, deployment_note, effectiveness |
| date_text | — | 4 | 4 | 4 | 0.01 | scalar_string | 1 | free_text | March 21 & 25, 2022 |
| date_text_normalized | — | 4 | 4 | 4 | 0.01 | object | 0 | structured |  |
| subway_lines | — | 4 | 4 | 4 | 0.01 | array_string | 22 | free_text | B, D, 1, 2, 4, 5, 6, A |
| capital_improvements | — | 3 | 3 | 3 | 0.01 | array_string | 4 | enum_candidate | bus bulbs, landscaped medians, pedestrian improvements, pedestrian me… |
| rail_connections | — | 3 | 3 | 3 | 0.01 | array_string | 3 | enum_candidate | LIRR, Metro-North, Metro-North Railroad |
| scope | — | 3 | 3 | 3 | 0.01 | scalar_string | 3 | enum_candidate | at Hunts Point only, July 2016 customer survey, M86 Local before SBS |
| target_date | — | 3 | 3 | 3 | 0.01 | scalar_string | 3 | numeric | 2020, 2021, November 2019 |
| target_date_normalized | — | 3 | 3 | 3 | 0.01 | object | 0 | structured |  |
| text | yes | 3 | 3 | 3 | 0.01 | scalar_string | 3 | enum_candidate | Equity framework description, Equity Score Index methodology, Equity… |
| unit | — | 3 | 3 | 3 | 0.01 | scalar_string | 1 | enum_candidate | feet |
| features | — | 2 | 2 | 2 | 0.00 | array_string | 7 | free_text | off-board fare payment, dedicated bus lanes, limited stops, low-floor… |
| improvement_type | — | 2 | 2 | 2 | 0.00 | scalar_string | 2 | enum_candidate | all_door_boarding, tap_and_go_payment |
| render_type | — | 2 | 1 | 1 | 0.00 | scalar_string | 1 | enum_candidate | multiline |
| timeline | — | 2 | 2 | 2 | 0.00 | scalar_string | 2 | enum_candidate | 2018, late-2014/early-2015 |
| am_peak_minutes | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| claim_kind | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | target_status |
| corridors_scored | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| express_routes_modified | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| map_features | — | 1 | 1 | 1 | 0.00 | object | 0 | structured |  |
| midday_minutes | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| new_express_routes_added | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| new_routes_added | — | 1 | 1 | 1 | 0.00 | array_string | 2 | sparse | Bx25, M125 |
| new_streets | — | 1 | 1 | 1 | 0.00 | array_string | 3 | sparse | Bronx River Avenue, Bruckner Boulevard, Story Avenue |
| new_terminal | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | Turnbull and Pugsley avenues |
| pm_peak_minutes | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| policy_type | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | fare_policy |
| route_types | — | 1 | 1 | 1 | 0.00 | object | 0 | structured |  |
| routes_modified | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| sbs_connections | — | 1 | 1 | 1 | 0.00 | array_string | 2 | sparse | B44 Nostrand Ave SBS, B46 Utica Ave SBS |
| service_type | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | express_bus |
| service_window | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | 7:00am to 9:00pm |
| status_observation | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | abandoned_target |
| strategies | — | 1 | 1 | 1 | 0.00 | array_string | 7 | sparse | Balance Bus Stops, Enhance Connectivity, Expand Bus Priority with NYC… |
| streets | — | 1 | 1 | 1 | 0.00 | array_string | 3 | sparse | Bronx River Avenue, Bruckner Boulevard, Story Avenue |
| subway_lines_count | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| system | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | OMNY |
| tactics | — | 1 | 1 | 1 | 0.00 | array_string | 5 | sparse | balanced_stop_spacing, enhanced_connectivity, expanded_bus_priority,… |
| top_corridors_count | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| topic | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | truck_definition |
| total_express_routes_evaluated | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| total_routes_evaluated | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| _merged_field_values | — | 0 | 0 | 1 | 0.00 | empty | 0 | sparse |  |
| change_type_normalized | — | 0 | 0 | 21 | 0.00 | empty | 0 | sparse |  |
| data_type_normalized | — | 0 | 0 | 50 | 0.00 | empty | 0 | sparse |  |

### Enum candidates (proposed closures, derived from corpus)

- **source** (15 all / 15 accepted / 15 canonical, 3 distinct, singletons 0/3, open): `bus rider survey` | `business outreach` | `DOT Street Ambassadors door-to-door outreach`
  - counts: bus rider survey×6, business outreach×5, DOT Street Ambassadors door-to-door outreach×4
  - accepted counts: bus rider survey×6, business outreach×5, DOT Street Ambassadors door-to-door outreach×4
  - canonical counts: bus rider survey×6, business outreach×5, DOT Street Ambassadors door-to-door outreach×4
- **existing** (6 all / 6 accepted / 6 canonical, 2 distinct, singletons 1/2, open): `15-or-better` | `30-or-better`
  - counts: 15-or-better×5
  - accepted counts: 15-or-better×5
  - canonical counts: 15-or-better×5
- **proposed** (6 all / 6 accepted / 6 canonical, 2 distinct, singletons 1/2, open): `15-or-better` | `8-or-better`
  - counts: 8-or-better×5
  - accepted counts: 8-or-better×5
  - canonical counts: 8-or-better×5
- **claim_type** (4 all / 4 accepted / 4 canonical, 3 distinct, singletons 2/3, open): `deployment_note` | `effectiveness` | `violation_type`
  - counts: violation_type×2
  - accepted counts: violation_type×2
  - canonical counts: violation_type×2
- **capital_improvements** (3 all / 3 accepted / 3 canonical, 4 distinct, singletons 3/4, open): `bus bulbs` | `landscaped medians` | `pedestrian improvements` | `pedestrian medians`
  - counts: bus bulbs×3
  - accepted counts: bus bulbs×3
  - canonical counts: bus bulbs×3
- **rail_connections** (3 all / 3 accepted / 3 canonical, 3 distinct, singletons 3/3, open): `LIRR` | `Metro-North` | `Metro-North Railroad`
- **scope** (3 all / 3 accepted / 3 canonical, 3 distinct, singletons 3/3, open): `at Hunts Point only` | `July 2016 customer survey` | `M86 Local before SBS`
- **text** (3 all / 3 accepted / 3 canonical, 3 distinct, singletons 3/3, open): `Equity framework description` | `Equity Score Index methodology` | `Equity Tier 1/2/3 definitions`
- **unit** (3 all / 3 accepted / 3 canonical, 1 distinct, singletons 0/1, open): `feet`
  - counts: feet×3
  - accepted counts: feet×3
  - canonical counts: feet×3
- **improvement_type** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `all_door_boarding` | `tap_and_go_payment`
- **render_type** (2 all / 1 accepted / 1 canonical, 1 distinct, singletons 0/1, open): `multiline`
  - counts: multiline×2
- **timeline** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `2018` | `late-2014/early-2015`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`_merged_field_values`, `am_peak_minutes`, `bus_routes_count`, `capital_improvements`, `change_type`, `change_type_normalized`, `claim_kind`, `claim_type`, `column_name`, `corridors_scored`, `data_type`, `data_type_normalized`, `date_text`, `date_text_normalized`, `existing`, `express_routes_modified`, `features`, `field_name`, `improvement_type`, `largest_value`, `location`, `location_normalized`, `map_features`, `midday_minutes`, `new_express_routes_added`, `new_routes_added`, `new_streets`, `new_terminal`, `non_null_count`, `null_count`, `pm_peak_minutes`, `policy_type`, `position`, `proposed`, `rail_connections`, `render_type`, `route`, `route_types`, `routes`, `routes_modified`, `sbs_connections`, `scope`, `service_type`, `service_window`, `source`, `status_observation`, `strategies`, `streets`, `subject`, `subway_lines`, `subway_lines_count`, `system`, `tactics`, `target_date`, `target_date_normalized`, `timeline`, `top_corridors_count`, `topic`, `total_express_routes_evaluated`, `total_routes_evaluated`, `unit`, `year`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) Bus lane speed gains mixed (up to 33%)
- (label ×2) Contact opendata@mtahq.org for Open Data inquiries
- (label ×2) Cross-street travel times increased less than 30 seconds except 160th St
- (label ×2) Data & Analytics team work scope
- (label ×2) Developing processes to automate dataset publishing
- (label ×2) Direction column
- (label ×2) Four Open Data Program promises
- (label ×2) Grading formula: 33% speed, 66% reliability
- (label ×2) Implementation sequence priorities
- (label ×2) Mid_Block column
- (label ×2) MTA Open Data Law key provisions
- (label ×2) Open data team contact
- (label ×2) Proposed performance targets
- (label ×2) the_geom column
- (label ×2) Travel times on parallel routes increased 15-30 seconds
- (raw_text ×3) Select Bus Service (SBS) route(s) using bus lane
- (raw_text ×2) A team inbox (opendata@mtahq.org) has worked well for us.
- (raw_text ×2) Direction of travel of the street
- (raw_text ×2) Indicates whether the lane begins or ends before or after the intersection
- (raw_text ×2) Length of the line segment in feet

## route

submissions: 271 (accepted 267 / rejected 4); canonical records: 130

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| route_id | yes | 232 | 228 | 123 | 0.86 | scalar_string | 160 | free_text | M15, B44, B82, Bx6, M86, Bx36, Q43, B60 |
| route_label | yes | 223 | 220 | 110 | 0.82 | scalar_string | 159 | free_text | Q43, Bx36, B25, B26, B42, B60, B62, B82 |
| route_name | yes | 117 | 114 | 67 | 0.43 | scalar_string | 103 | free_text | M15, M86, Q43, B82, Bx6, Bx6 Local, Bx6 SBS, Nostrand/Rogers Avenues |
| borough | — | 116 | 114 | 79 | 0.43 | mixed | 5 | enum_candidate | Bronx, Manhattan, Brooklyn, Queens, Staten Island |
| description | — | 100 | 99 | 68 | 0.37 | scalar_string | 83 | free_text | Bronx-Manhattan express bus route serving 116th Street study area, Br… |
| route | yes | 66 | 66 | 39 | 0.24 | scalar_string | 56 | free_text | B25, B26, B42, B62, BX19, BX35, BX36, Q43 |
| route_type | — | 66 | 63 | 44 | 0.24 | scalar_string | 14 | free_text | Select Bus Service, Local, local bus, SBS, express_bus, local_bus, se… |
| streets | — | 65 | 65 | 62 | 0.24 | scalar_string | 61 | free_text | Lefferts Blvd, 3 Av / Lexington Av, Bay Pkwy / Kings Hwy / Flatlands… |
| route_type_normalized | — | 48 | 45 | 44 | 0.18 | scalar_string | 6 | enum_candidate | select_bus_service, local, bus, limited_stop, local_limited, local_se… |
| service_variant | — | 44 | 42 | 44 | 0.16 | scalar_string | 3 | enum_candidate | local, sbs, limited_stop |
| borough_normalized | — | 38 | 36 | 79 | 0.14 | scalar_string | 5 | enum_candidate | bronx, manhattan, brooklyn, queens, staten_island |
| note | — | 28 | 28 | 27 | 0.10 | scalar_string | 5 | free_text | ABLE cameras operated on this route through 2023, in 60-day warning p… |
| program | — | 23 | 23 | 23 | 0.08 | scalar_string | 2 | enum_candidate | ABLE, Transit Signal Priority |
| routes | yes | 21 | 21 | 20 | 0.08 | array_string | 25 | free_text | M101, M102, M103, M14A, M14D, M98, Q1, Q10 |
| mode | — | 10 | 10 | 10 | 0.04 | scalar_string | 2 | enum_candidate | subway, bus |
| source_route_surface | — | 5 | 5 | 15 | 0.02 | scalar_string | 2 | enum_candidate | ACE, generic_m15_reference |
| existing_route_length_miles | — | 4 | 4 | 3 | 0.01 | number | 0 | numeric |  |
| existing_stop_spacing_feet | — | 4 | 4 | 3 | 0.01 | number | 0 | numeric |  |
| existing_turns_per_mile | — | 4 | 4 | 3 | 0.01 | number | 0 | numeric |  |
| operator | — | 4 | 4 | 4 | 0.01 | scalar_string | 1 | enum_candidate | MTA |
| proposed_route_length_miles | — | 4 | 4 | 3 | 0.01 | number | 0 | numeric |  |
| proposed_stop_spacing_feet | — | 4 | 4 | 3 | 0.01 | number | 0 | numeric |  |
| proposed_turns_per_mile | — | 4 | 4 | 3 | 0.01 | number | 0 | numeric |  |
| related_existing_routes | — | 4 | 4 | 3 | 0.01 | array_string | 5 | free_text | B44, B44 SBS, B49, B1, B3 |
| route_type_proposed | — | 4 | 4 | 3 | 0.01 | scalar_string | 1 | enum_candidate | Local |
| service_description | — | 4 | 4 | 3 | 0.01 | scalar_string | 3 | free_text | Service between Bedford-Stuyvesant and Sheepshead Bay, Service betwee… |
| document_time_status | — | 3 | 3 | 3 | 0.01 | scalar_string | 2 | enum_candidate | tsp_in_development, draft_plan_proposed |
| limits | — | 3 | 3 | 3 | 0.01 | scalar_string | 2 | enum_candidate | Rosedale to Jamaica, W 87th Street and West End Avenue to E 92nd Stre… |
| agency | — | 2 | 2 | 2 | 0.01 | scalar_string | 1 | enum_candidate | Bee-Line Bus System |
| boroughs | — | 2 | 2 | 2 | 0.01 | array_string | 3 | enum_candidate | Queens, Bronx, Manhattan |
| boroughs_normalized | — | 2 | 2 | 2 | 0.01 | array_string | 3 | enum_candidate | queens, bronx, manhattan |
| corridors | — | 2 | 2 | 2 | 0.01 | array_string | 2 | enum_candidate | Guy R Brewer Blvd, Merrick Blvd |
| historical_status | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | pre_sbs_service |
| source_label | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | Southern Brooklyn Select Bus Service |
| source_route_type_phrase | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | Local/Limited |
| status | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | proposed |
| _merged_field_values | — | 0 | 0 | 34 | 0.00 | empty | 0 | sparse |  |
| internal_route_id | — | 0 | 0 | 10 | 0.00 | empty | 0 | sparse |  |
| route_id_authority | — | 0 | 0 | 10 | 0.00 | empty | 0 | sparse |  |

### Enum candidates (proposed closures, derived from corpus)

- **borough** (116 all / 114 accepted / 79 canonical, 5 distinct, singletons 0/5, **saturated → closure candidate**): `Bronx` | `Brooklyn` | `Manhattan` | `Queens` | `Staten Island`
  - counts: Bronx×31, Manhattan×29, Brooklyn×27, Queens×22, Staten Island×8
  - accepted counts: Bronx×30, Manhattan×29, Brooklyn×26, Queens×22, Staten Island×8
  - canonical counts: Bronx×21, Manhattan×20, Queens×17, Brooklyn×16, Staten Island×6
- **route_type_normalized** (48 all / 45 accepted / 44 canonical, 6 distinct, singletons 2/6, open): `bus` | `limited_stop` | `local` | `local_limited` | `local_select_bus_service` | `select_bus_service`
  - counts: select_bus_service×21, local×20, bus×3, limited_stop×2
  - accepted counts: select_bus_service×21, local×18, bus×3, limited_stop×2
  - canonical counts: local×16, select_bus_service×15, express×6, limited_stop×3, bus×2, rush×2
- **service_variant** (44 all / 42 accepted / 44 canonical, 3 distinct, singletons 0/3, open): `limited_stop` | `local` | `sbs`
  - counts: local×21, sbs×21, limited_stop×2
  - accepted counts: sbs×21, local×19, limited_stop×2
  - canonical counts: sbs×17, local×16, express×6, limited_stop×3, rush×2
- **borough_normalized** (38 all / 36 accepted / 79 canonical, 5 distinct, singletons 0/5, open): `bronx` | `brooklyn` | `manhattan` | `queens` | `staten_island`
  - counts: bronx×11, manhattan×9, brooklyn×7, queens×7, staten_island×4
  - accepted counts: bronx×10, manhattan×9, queens×7, brooklyn×6, staten_island×4
  - canonical counts: bronx×20, manhattan×20, queens×17, brooklyn×16, staten_island×6
- **program** (23 all / 23 accepted / 23 canonical, 2 distinct, singletons 0/2, open): `ABLE` | `Transit Signal Priority`
  - counts: ABLE×21, Transit Signal Priority×2
  - accepted counts: ABLE×21, Transit Signal Priority×2
  - canonical counts: ABLE×21, Transit Signal Priority×2
- **mode** (10 all / 10 accepted / 10 canonical, 2 distinct, singletons 0/2, open): `bus` | `subway`
  - counts: subway×7, bus×3
  - accepted counts: subway×7, bus×3
  - canonical counts: subway×7, bus×3
- **source_route_surface** (5 all / 5 accepted / 15 canonical, 2 distinct, singletons 1/2, open): `ACE` | `generic_m15_reference`
  - counts: ACE×4
  - accepted counts: ACE×4
  - canonical counts: mta_route_id×10, ACE×4
- **operator** (4 all / 4 accepted / 4 canonical, 1 distinct, singletons 0/1, open): `MTA`
  - counts: MTA×4
  - accepted counts: MTA×4
  - canonical counts: MTA×4
- **route_type_proposed** (4 all / 4 accepted / 3 canonical, 1 distinct, singletons 0/1, open): `Local`
  - counts: Local×4
  - accepted counts: Local×4
  - canonical counts: Local×3
- **document_time_status** (3 all / 3 accepted / 3 canonical, 2 distinct, singletons 1/2, open): `draft_plan_proposed` | `tsp_in_development`
  - counts: tsp_in_development×2
  - accepted counts: tsp_in_development×2
  - canonical counts: tsp_in_development×2
- **limits** (3 all / 3 accepted / 3 canonical, 2 distinct, singletons 1/2, open): `Rosedale to Jamaica` | `W 87th Street and West End Avenue to E 92nd Street and York Avenue`
  - counts: Rosedale to Jamaica×2
  - accepted counts: Rosedale to Jamaica×2
  - canonical counts: Rosedale to Jamaica×2
- **agency** (2 all / 2 accepted / 2 canonical, 1 distinct, singletons 0/1, open): `Bee-Line Bus System`
  - counts: Bee-Line Bus System×2
  - accepted counts: Bee-Line Bus System×2
  - canonical counts: Bee-Line Bus System×2
- **boroughs** (2 all / 2 accepted / 2 canonical, 3 distinct, singletons 2/3, open): `Bronx` | `Manhattan` | `Queens`
  - counts: Queens×2
  - accepted counts: Queens×2
  - canonical counts: Queens×2
- **boroughs_normalized** (2 all / 2 accepted / 2 canonical, 3 distinct, singletons 2/3, open): `bronx` | `manhattan` | `queens`
  - counts: queens×2
  - accepted counts: queens×2
  - canonical counts: queens×2
- **corridors** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `Guy R Brewer Blvd` | `Merrick Blvd`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`_merged_field_values`, `agency`, `borough`, `borough_normalized`, `boroughs`, `boroughs_normalized`, `corridors`, `description`, `document_time_status`, `existing_route_length_miles`, `existing_stop_spacing_feet`, `existing_turns_per_mile`, `historical_status`, `internal_route_id`, `limits`, `mode`, `note`, `operator`, `program`, `proposed_route_length_miles`, `proposed_stop_spacing_feet`, `proposed_turns_per_mile`, `related_existing_routes`, `route_id_authority`, `route_type`, `route_type_normalized`, `route_type_proposed`, `service_description`, `service_variant`, `source_label`, `source_route_surface`, `source_route_type_phrase`, `status`, `streets`

### Repeated labels / raw_text (source_labels candidates)

- (label ×4) M15
- (label ×3) M7
- (label ×2) B11
- (label ×2) B25
- (label ×2) B26
- (label ×2) B42
- (label ×2) B60
- (label ×2) B62
- (label ×2) B82 in Southern Brooklyn (TSP in development)
- (label ×2) B82-SBS
- (label ×2) Bx22
- (label ×2) Bx6 in the South Bronx (TSP in development)
- (label ×2) Bx9
- (label ×2) M101
- (label ×2) M116
- (label ×2) Proposed B44 Local - Nostrand/Rogers Avenues
- (label ×2) Q43
- (label ×2) Q5
- (label ×2) Q54
- (label ×2) Q58
- (raw_text ×2) over 28,000 daily bus riders on the M34/M34A and numerous express buses
- (raw_text ×2) The proposed B44 would maintain its existing southbound routing. As a Local route, stops would be s…

## entity

submissions: 239 (accepted 235 / rejected 4); canonical records: 96

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| entity_name | yes | 232 | 228 | 96 | 0.97 | scalar_string | 122 | free_text | New York City Department of Transportation, MTA New York City Transit… |
| entity_type | yes | 221 | 217 | 92 | 0.92 | scalar_string | 77 | free_text | person, government_agency, transit_agency, government agency, agency,… |
| agency_name | yes | 91 | 88 | 20 | 0.38 | scalar_string | 24 | free_text | NYC DOT, MTA, Metropolitan Transportation Authority, MTA New York Cit… |
| description | — | 57 | 56 | 42 | 0.24 | scalar_string | 56 | free_text | Automated Camera Enforcement program for bus lane enforcement, Advoca… |
| role | — | 23 | 21 | 9 | 0.10 | scalar_string | 20 | free_text | ACE program partner, partner_agency, publisher, ACE program administr… |
| acronym | — | 21 | 21 | 9 | 0.09 | scalar_string | 11 | enum_candidate | MTA, DOT, NYCT, NYPD, AAA, DOF, MTA Bus, MTA NYCT |
| title | — | 17 | 17 | 16 | 0.07 | scalar_string | 16 | free_text | Project Manager, Acting Chief, Operations Planning, Chief Customer Of… |
| short_name | — | 13 | 13 | 5 | 0.05 | scalar_string | 6 | enum_candidate | NYC DOT, MTA, DDC, IBO, NYCT, NYPD |
| name | yes | 12 | 12 | 11 | 0.05 | scalar_string | 12 | free_text | CDC Social Vulnerability Index, data.ny.gov, Demetrius Crichlow, Kath… |
| publisher | yes | 11 | 10 | 4 | 0.05 | mixed | 3 | enum_candidate | NYC DOT, NYC Comptroller, People Oriented Cities |
| organization | — | 7 | 7 | 7 | 0.03 | scalar_string | 6 | free_text | Metropolitan Transportation Authority, New York State Assembly, New Y… |
| operator | yes | 5 | 5 | 3 | 0.02 | mixed | 1 | free_text | MTA New York City Transit |
| jurisdiction | — | 4 | 4 | 4 | 0.02 | scalar_string | 1 | enum_candidate | New York State |
| borough | — | 3 | 3 | 3 | 0.01 | scalar_string | 3 | enum_candidate | Brooklyn, Manhattan, Queens |
| data_source | — | 3 | 3 | 3 | 0.01 | boolean | 0 | boolean |  |
| parent_entity | — | 3 | 3 | 2 | 0.01 | scalar_string | 3 | free_text | Metropolitan Transportation Authority, Metropolitan Transportation Au… |
| agency | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | free_text | Metropolitan Transportation Authority (MTA), MTA New York City Transit |
| bus_depots | — | 2 | 2 | 1 | 0.01 | number | 0 | numeric |  |
| buses | — | 2 | 2 | 1 | 0.01 | mixed | 1 | enum_candidate | 5,800 |
| daily_passengers | — | 2 | 2 | 1 | 0.01 | number | 0 | numeric |  |
| employees | — | 2 | 2 | 1 | 0.01 | number | 0 | numeric |  |
| executive_director | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | Ben Furnas, Betsy Plum |
| office | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | New York City Comptroller, New York City Council |
| owner | yes | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | New York City, New York State |
| parent_organization | — | 2 | 2 | 2 | 0.01 | scalar_string | 1 | enum_candidate | Metropolitan Transportation Authority |
| role_in_source | — | 2 | 2 | 2 | 0.01 | scalar_string | 1 | free_text | co-lead of Jamaica Bus Improvement Study |
| shops_and_yards | — | 2 | 2 | 1 | 0.01 | number | 0 | numeric |  |
| subway_cars | — | 2 | 2 | 1 | 0.01 | mixed | 1 | enum_candidate | nearly 6,700 |
| subway_stations | — | 2 | 2 | 1 | 0.01 | number | 0 | numeric |  |
| track_miles | — | 2 | 2 | 1 | 0.01 | number | 0 | numeric |  |
| a_line | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | converted to all R179 and R211 cars |
| active_locations | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | over 15 locations across MTA |
| active_locations_normalized | — | 1 | 1 | 1 | 0.00 | object | 0 | structured |  |
| bus_routes_covered | — | 1 | 1 | 1 | 0.00 | array_string | 1 | sparse | Bx12 |
| c_line | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | converted to all R179 and R211 cars |
| chair | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | Haeda Mihaltses |
| commissioner | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | Ydanis Rodriguez |
| daily_riders | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | nearly 10,000 |
| g_line | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | introducing R211s, entire fleet expected to be R211s later this year |
| location | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | Jamaica, Queens |
| location_normalized | — | 1 | 1 | 1 | 0.00 | object | 0 | structured |  |
| members | — | 1 | 1 | 1 | 0.00 | array_string | 10 | sparse | Andrew Albert, Dan Garodnick, David Jones, Haeda Mihaltses, John Ross… |
| navilens_uses_ytd | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | over 45,000 |
| nearby_subway | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | 169th St F Station |
| notable_stations | — | 1 | 1 | 1 | 0.00 | array_string | 4 | sparse | Bleecker St/Broadway-Lafayette, Brooklyn Bridge-City Hall, Canal St,… |
| regions | — | 1 | 1 | 1 | 0.00 | array_string | 4 | sparse | Connecticut, Long Island, New York City, southeastern New York State |
| replaces | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | 165th Street Bus Terminal |
| routes_most_recently_added | — | 1 | 1 | 1 | 0.00 | array_string | 5 | sparse | Bx5, M100, M2, M4, M42 |
| routes_served | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | 10 MTA bus routes and five Nassau Inter-County Express bus routes |
| service_area_description | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | serving a population of 15.3 million people across a 5,000-square-mil… |
| service_area_population | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| service_area_sq_miles | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| stations_with_navilens | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| status | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | operational |
| subway_line_deployed | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | 6 line |
| successful_calls | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | over 200 in 3 months |
| teams | — | 1 | 1 | 1 | 0.00 | array_string | 4 | sparse | Customer Communications, Department of Buses, Government and Communit… |
| top_locations | — | 1 | 1 | 1 | 0.00 | array_string | 2 | sparse | 3 Stone Street, Penn Station |
| top_locations_normalized | — | 1 | 1 | 1 | 0.00 | object | 0 | structured |  |
| url | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | data.ny.gov |
| _merged_field_values | — | 0 | 0 | 25 | 0.00 | empty | 0 | sparse |  |
| borough_normalized | — | 0 | 0 | 3 | 0.00 | empty | 0 | sparse |  |

### Enum candidates (proposed closures, derived from corpus)

- **acronym** (21 all / 21 accepted / 9 canonical, 11 distinct, singletons 7/11, open): `AAA` | `DOF` | `DOT` | `MTA` | `MTA Bus` | `MTA NYCT` | `NYC DOT` | `NYCT` | `NYPD` | `NYS ITS` | `PANYNJ`
  - counts: MTA×6, DOT×3, NYCT×3, NYPD×2
  - accepted counts: MTA×6, DOT×3, NYCT×3, NYPD×2
  - canonical counts: MTA×2
- **short_name** (13 all / 13 accepted / 5 canonical, 6 distinct, singletons 4/6, open): `DDC` | `IBO` | `MTA` | `NYC DOT` | `NYCT` | `NYPD`
  - counts: NYC DOT×5, MTA×4
  - accepted counts: NYC DOT×5, MTA×4
- **publisher** (11 all / 10 accepted / 4 canonical, 3 distinct, singletons 2/3, open): `NYC Comptroller` | `NYC DOT` | `People Oriented Cities`
  - counts: NYC DOT×3
  - accepted counts: NYC DOT×2
- **jurisdiction** (4 all / 4 accepted / 4 canonical, 1 distinct, singletons 0/1, open): `New York State`
  - counts: New York State×4
  - accepted counts: New York State×4
  - canonical counts: New York State×4
- **borough** (3 all / 3 accepted / 3 canonical, 3 distinct, singletons 3/3, open): `Brooklyn` | `Manhattan` | `Queens`
- **buses** (2 all / 2 accepted / 1 canonical, 1 distinct, singletons 1/1, open): `5,800`
- **executive_director** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `Ben Furnas` | `Betsy Plum`
- **office** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `New York City Comptroller` | `New York City Council`
- **owner** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `New York City` | `New York State`
- **parent_organization** (2 all / 2 accepted / 2 canonical, 1 distinct, singletons 0/1, open): `Metropolitan Transportation Authority`
  - counts: Metropolitan Transportation Authority×2
  - accepted counts: Metropolitan Transportation Authority×2
  - canonical counts: Metropolitan Transportation Authority×2
- **subway_cars** (2 all / 2 accepted / 1 canonical, 1 distinct, singletons 1/1, open): `nearly 6,700`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`_merged_field_values`, `a_line`, `acronym`, `active_locations`, `active_locations_normalized`, `agency`, `borough`, `borough_normalized`, `bus_depots`, `bus_routes_covered`, `buses`, `c_line`, `chair`, `commissioner`, `daily_passengers`, `daily_riders`, `data_source`, `description`, `employees`, `executive_director`, `g_line`, `jurisdiction`, `location`, `location_normalized`, `members`, `navilens_uses_ytd`, `nearby_subway`, `notable_stations`, `office`, `organization`, `parent_entity`, `parent_organization`, `regions`, `replaces`, `role`, `role_in_source`, `routes_most_recently_added`, `routes_served`, `service_area_description`, `service_area_population`, `service_area_sq_miles`, `shops_and_yards`, `short_name`, `stations_with_navilens`, `status`, `subway_cars`, `subway_line_deployed`, `subway_stations`, `successful_calls`, `teams`, `title`, `top_locations`, `top_locations_normalized`, `track_miles`, `url`

### Repeated labels / raw_text (source_labels candidates)

- (label ×11) Metropolitan Transportation Authority (MTA)
- (label ×4) MTA
- (label ×4) MTA Data & Analytics Team
- (label ×4) MTA New York City Transit
- (label ×3) MTA Bus Company
- (label ×3) NYC Department of Transportation
- (label ×3) NYC DOT
- (label ×2) ACE Program
- (label ×2) Demetrius Crichlow, President of New York City Transit
- (label ×2) Governor Kathy Hochul
- (label ×2) MTA - Metropolitan Transportation Authority
- (label ×2) MTA on 34th Street Busway
- (label ×2) New York City Department of Finance
- (label ×2) New York City Department of Transportation
- (label ×2) New York City Department of Transportation (NYC DOT)
- (label ×2) New York City Police Department (NYPD)
- (label ×2) New York City Transit (NYCT)
- (label ×2) New York State Legislature
- (label ×2) NYC Department of Transportation (NYC DOT)
- (label ×2) NYC DOT (as publisher of Busways page)
- (label ×2) NYS Open Data Portal
- (raw_text ×4) MTA
- (raw_text ×3) NEW YORK CITY DOT
- (raw_text ×2) Demetrius Crichlow President New York City Transit
- (raw_text ×2) Governor Kathy Hochul and New York State Legislature enacted the MTA Open Data Law in 2021
- (raw_text ×2) MTA bus schedules, fare collection machines, fare enforcement, or general MTA issues (e.g., MetroCa…
- (raw_text ×2) New York City Transit and MTA Bus operate all subways and buses in New York City. Our 45,000 employ…
- (raw_text ×2) The Metropolitan Transportation Authority is North America's largest transportation network, servin…

## event

submissions: 220 (accepted 212 / rejected 8); canonical records: 210

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| description | yes | 220 | 212 | 210 | 1.00 | scalar_string | 203 | free_text | Developed / Published Plan, Busway launched October 2021, Capital imp… |
| event_kind | yes | 220 | 212 | 210 | 1.00 | scalar_string | 99 | free_text | service_launch, publication, launch, milestone, implementation, meeti… |
| date_text | yes | 203 | 197 | 195 | 0.92 | scalar_string | 151 | free_text | 2024, 2023, 2019, October 3, 2019, 2025, October 2019, October 2021,… |
| date_text_normalized | — | 203 | 197 | 195 | 0.92 | object | 0 | structured |  |
| date | yes | 30 | 30 | 30 | 0.14 | scalar_string | 27 | free_text | 2019-10-03, 2023, 2008-01-01, 2011-03-25, 2011-05-12, 2011-06-14, 201… |
| date_normalized | — | 30 | 30 | 30 | 0.14 | object | 0 | structured |  |
| event_date | yes | 27 | 27 | 27 | 0.12 | scalar_string | 25 | free_text | December 2025, December 8, 2025, 2013-11-17, 2013-11-18, 2014-02, 201… |
| event_date_normalized | — | 27 | 27 | 27 | 0.12 | object | 0 | structured |  |
| year | — | 23 | 22 | 22 | 0.10 | number | 0 | numeric |  |
| event_name | — | 14 | 13 | 13 | 0.06 | scalar_string | 13 | free_text | Budget Press Tour, 168th St/Jamaica Interim Bus Terminal Opens, Bx6 L… |
| event_family | — | 13 | 12 | 210 | 0.06 | scalar_string | 9 | free_text | public_engagement, milestone, construction, launch, postponement, pre… |
| details | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | 16 agents deployed, 55 agents deployed |
| month | — | 2 | 2 | 2 | 0.01 | number | 0 | numeric |  |
| affected_boroughs | — | 1 | 1 | 1 | 0.00 | array_string | 2 | sparse | Manhattan, Queens |
| affected_routes | — | 1 | 1 | 1 | 0.00 | array_string | 4 | sparse | E, F, M, R |
| affected_stations | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| end_date_text | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | April 27, 2020 |
| end_date_text_normalized | — | 1 | 1 | 1 | 0.00 | object | 0 | structured |  |
| location | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | Washington, DC |
| location_normalized | — | 1 | 1 | 1 | 0.00 | object | 0 | structured |  |
| organizers | — | 1 | 1 | 1 | 0.00 | array_string | 2 | sparse | MTA, NYC DOT |
| participants | — | 1 | 1 | 1 | 0.00 | array_string | 3 | sparse | CM De La Rosa's office, NYC DOT, WHBID |
| riders_affected | — | 1 | 1 | 1 | 0.00 | number | 0 | numeric |  |
| route | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | Bx6 Local |
| start_date_text | — | 1 | 1 | 1 | 0.00 | scalar_string | 1 | sparse | April 2019 |
| start_date_text_normalized | — | 1 | 1 | 1 | 0.00 | object | 0 | structured |  |
| stations_affected | — | 1 | 1 | 1 | 0.00 | array_string | 2 | sparse | Atlantic Av-Barclays Ctr (2345), W 4 St-Wash Sq (ACEBDFM) |
| _merged_field_values | — | 0 | 0 | 2 | 0.00 | empty | 0 | sparse |  |

### Enum candidates (proposed closures, derived from corpus)

- **details** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `16 agents deployed` | `55 agents deployed`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`_merged_field_values`, `affected_boroughs`, `affected_routes`, `affected_stations`, `date_normalized`, `date_text_normalized`, `details`, `end_date_text`, `end_date_text_normalized`, `event_date_normalized`, `event_family`, `event_name`, `location`, `location_normalized`, `month`, `organizers`, `participants`, `riders_affected`, `route`, `start_date_text`, `start_date_text_normalized`, `stations_affected`, `year`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) 181st Street Busway launched
- (label ×2) 34th Street Busway Community Outreach
- (label ×2) Hourly Subway and Bus Ridership datasets published in 2023
- (label ×2) Implementation
- (label ×2) Project Launch
- (raw_text ×2) capital improvements began in 2014
- (raw_text ×2) Implementation: Two phases aligned with regular seasonal service changes. Large-scale marketing and…
- (raw_text ×2) Off-board fare payment along the route began in November 2011

## treatment_component

submissions: 167 (accepted 163 / rejected 4); canonical records: 163

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| treatment_kind | yes | 167 | 163 | 163 | 1.00 | scalar_string | 98 | free_text | bus_lane, enforcement, bus_priority, curb_management, route_type, tra… |
| description | yes | 165 | 161 | 161 | 0.99 | scalar_string | 164 | free_text | Beginning and end of busway blocks painted red with 'BUS TRUCK ONLY'… |
| locations | yes | 34 | 34 | 34 | 0.20 | mixed | 30 | free_text | 14th Street between 9th Avenue and 3rd Avenue, Jamaica, Queens, 14th… |
| component_kind | yes | 32 | 29 | 29 | 0.19 | scalar_string | 22 | free_text | driving_directions, turn_restriction, physical_infrastructure, access… |
| locations_normalized | — | 32 | 32 | 32 | 0.19 | object | 0 | structured |  |
| treatment_type | yes | 31 | 31 | 31 | 0.19 | scalar_string | 30 | free_text | new_bus_lane, angled parking, automated_enforcement_and_police, bus l… |
| component_type | yes | 18 | 18 | 18 | 0.11 | scalar_string | 18 | free_text | access_rule, automated_enforcement, bike_lane, bus_priority, busway_h… |
| treatment_family | — | 18 | 18 | 163 | 0.11 | scalar_string | 11 | enum_candidate | bus_lane, traffic_restriction, curb_management, enforcement, pedestri… |
| location_text | — | 13 | 13 | 13 | 0.08 | scalar_string | 12 | free_text | Along 14th Street, 13th Street and 5th Avenue, All M86 SBS stations e… |
| normalized_location | — | 13 | 13 | 13 | 0.08 | object | 0 | structured |  |
| date_text | — | 7 | 7 | 7 | 0.04 | scalar_string | 7 | free_text | 6 AM – 8 PM / 7 days a week, December 2021, in effect at all times, J… |
| date_text_normalized | — | 7 | 7 | 7 | 0.04 | object | 0 | structured |  |
| direction | — | 4 | 4 | 4 | 0.02 | scalar_string | 4 | enum_candidate | both directions, eastbound, eastbound only, westbound |
| hours | — | 4 | 4 | 4 | 0.02 | scalar_string | 3 | free_text | 24/7, 6 AM – 10 PM / 7 days a week, 6 AM – 8 PM |
| time_of_day | — | 4 | 4 | 4 | 0.02 | scalar_string | 4 | enum_candidate | 10pm-6am, 6am-10pm, 6am-10pm daily, all times |
| corridor | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | Archer Avenue, Jamaica Avenue |
| enforcement_authority | — | 2 | 2 | 2 | 0.01 | scalar_string | 1 | enum_candidate | NYPD |
| features | — | 2 | 2 | 2 | 0.01 | array_string | 8 | free_text | dedicated bus lanes, left-turn lanes, limited stops, low-floor three-… |
| limits | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | free_text | 150th St to 160th St, Sutphin Blvd to 168th St |
| local_access | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | allowed with next-right-turn requirement, none |
| pickup_dropoff | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | allowed throughout except westbound between 147th Pl and Sutphin Blvd… |
| street | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | Johnson Street, Smith Street / Jay Street |
| through_trips_allowed | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | buses and emergency vehicles, buses, trucks, emergency vehicles |
| access_points | — | 1 | 1 | 1 | 0.01 | array_string | 2 | sparse | north, south |
| allowed_vehicles | — | 1 | 1 | 1 | 0.01 | array_string | 5 | sparse | Access-A-Ride vans, bicycles, buses, emergency vehicles, trucks with… |
| days | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | 7 days/week |
| end_date | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | 2024-08-31 |
| end_date_normalized | — | 1 | 1 | 1 | 0.01 | object | 0 | structured |  |
| enforcement_methods | — | 1 | 1 | 1 | 0.01 | array_string | 2 | sparse | automated cameras, traffic agents |
| left_turns | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | restricted except eastbound left at 153rd St |
| parking_loading | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | no parking nor loading eastbound between 150th St and 160th St |
| passenger_vehicles_allowed | — | 1 | 1 | 1 | 0.01 | boolean | 0 | boolean |  |
| restricted_to | — | 1 | 1 | 1 | 0.01 | array_string | 3 | sparse | bicycles, buses, trucks |
| restricted_vehicles | — | 1 | 1 | 1 | 0.01 | array_string | 2 | sparse | for-hire vehicles, passenger vehicles |
| start_date | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | 2023-09-24 |
| start_date_normalized | — | 1 | 1 | 1 | 0.01 | object | 0 | structured |  |
| trucks_allowed | — | 1 | 1 | 1 | 0.01 | boolean | 0 | boolean |  |

### Enum candidates (proposed closures, derived from corpus)

- **treatment_family** (18 all / 18 accepted / 163 canonical, 11 distinct, singletons 6/11, open): `bus_lane` | `bus_stop_or_boarding` | `busway` | `curb_management` | `enforcement` | `fare_collection` | `pedestrian_or_accessibility` | `shelters_and_benches` | `signage_and_markings` | `signal_priority` | `traffic_restriction`
  - counts: bus_lane×3, traffic_restriction×3, curb_management×2, enforcement×2, pedestrian_or_accessibility×2
  - accepted counts: bus_lane×3, traffic_restriction×3, curb_management×2, enforcement×2, pedestrian_or_accessibility×2
  - canonical counts: traffic_restriction×28, bus_lane×19, curb_management×14, bus_stop_or_boarding×12, enforcement×12, capital_or_infrastructure×11, pedestrian_or_accessibility×11, busway×10, other×10, service_pattern×9, signal_priority×7, signage_and_markings×6, fare_collection×4, customer_information×3, bike_facility×2, vehicle_or_fleet×2
- **direction** (4 all / 4 accepted / 4 canonical, 4 distinct, singletons 4/4, open): `both directions` | `eastbound` | `eastbound only` | `westbound`
- **time_of_day** (4 all / 4 accepted / 4 canonical, 4 distinct, singletons 4/4, open): `10pm-6am` | `6am-10pm` | `6am-10pm daily` | `all times`
- **corridor** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `Archer Avenue` | `Jamaica Avenue`
- **enforcement_authority** (2 all / 2 accepted / 2 canonical, 1 distinct, singletons 0/1, open): `NYPD`
  - counts: NYPD×2
  - accepted counts: NYPD×2
  - canonical counts: NYPD×2
- **local_access** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `allowed with next-right-turn requirement` | `none`
- **pickup_dropoff** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `allowed throughout except westbound between 147th Pl and Sutphin Blvd` | `permitted in westbound direction`
- **street** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `Johnson Street` | `Smith Street / Jay Street`
- **through_trips_allowed** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `buses and emergency vehicles` | `buses, trucks, emergency vehicles`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`access_points`, `allowed_vehicles`, `corridor`, `date_text`, `date_text_normalized`, `days`, `direction`, `end_date`, `end_date_normalized`, `enforcement_authority`, `enforcement_methods`, `features`, `hours`, `left_turns`, `limits`, `local_access`, `location_text`, `locations_normalized`, `normalized_location`, `parking_loading`, `passenger_vehicles_allowed`, `pickup_dropoff`, `restricted_to`, `restricted_vehicles`, `start_date`, `start_date_normalized`, `street`, `through_trips_allowed`, `time_of_day`, `treatment_family`, `trucks_allowed`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) 34th St Busway Signage and Markings

## table

submissions: 151 (accepted 149 / rejected 2); canonical records: 0

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| table_title | — | 151 | 149 | 0 | 1.00 | scalar_string | 147 | free_text | Bus Customer Journey Time Performance by Borough, Congestion Relief Z… |
| rows | — | 122 | 120 | 0 | 0.81 | object | 0 | structured |  |
| columns | — | 116 | 114 | 0 | 0.77 | array_string | 250 | free_text | Route, Month, Percentage, Year, Pilot, Pre-Pilot, Category, Change (p… |
| caption | — | 22 | 21 | 0 | 0.15 | scalar_string | 20 | free_text | Datasets published to support the launch of the Congestion Relief Zon… |
| description | — | 13 | 13 | 0 | 0.09 | scalar_string | 13 | free_text | Board action approval routing table, Dataset dictionary defining thre… |
| rows_count | — | 8 | 8 | 0 | 0.05 | number | 0 | numeric |  |
| table_name | — | 6 | 6 | 0 | 0.04 | scalar_string | 6 | free_text | Bus Lanes, eastbound_access, express_bus_route_improvements, regular_… |
| page | — | 4 | 4 | 0 | 0.03 | number | 0 | numeric |  |
| period | — | 4 | 4 | 0 | 0.03 | scalar_string | 2 | enum_candidate | May 2025, January to May 2025 |
| row_count | — | 4 | 4 | 0 | 0.03 | number | 0 | numeric |  |
| source_note | — | 4 | 4 | 0 | 0.03 | scalar_string | 4 | free_text | Bus Lanes – Local Streets (NYC Open Data), Mayor's Management Report… |
| entities | — | 3 | 3 | 0 | 0.02 | array_string | 3 | enum_candidate | MTA Bus, New York City Transit, Staten Island Rail |
| title | — | 3 | 3 | 0 | 0.02 | scalar_string | 3 | free_text | Finding Your New Route - Route Relationship Chart, NYC DOT Brooklyn B… |
| demographic | — | 2 | 2 | 0 | 0.01 | scalar_string | 2 | enum_candidate | pedestrians, seniors (62+) and persons with disabilities |
| notes | — | 2 | 2 | 0 | 0.01 | scalar_string | 2 | free_text | Bx6 to be implemented in 2023 with Bx6 SBS alignment and Bx5 schedule… |
| rows_description | — | 2 | 2 | 0 | 0.01 | scalar_string | 2 | free_text | Weekday AM (8-9 AM) and Weekday PM (5-6 PM) travel times for east-wes… |
| table_number | — | 2 | 2 | 0 | 0.01 | scalar_string | 2 | numeric | 1, 2 |
| chair | — | 1 | 1 | 0 | 0.01 | scalar_string | 1 | sparse | Haeda Mihaltses |
| column_count | — | 1 | 1 | 0 | 0.01 | number | 0 | numeric |  |
| committee | — | 1 | 1 | 0 | 0.01 | scalar_string | 1 | sparse | New York City Transit Committee |
| date_range | — | 1 | 1 | 0 | 0.01 | scalar_string | 1 | sparse | June 2020 - May 2022 |
| governing_body | — | 1 | 1 | 0 | 0.01 | scalar_string | 1 | sparse | MTA Board of Directors |
| location | — | 1 | 1 | 0 | 0.01 | scalar_string | 1 | sparse | 181st St, Broadway to Amsterdam |
| location_normalized | — | 1 | 1 | 0 | 0.01 | object | 0 | structured |  |
| members | — | 1 | 1 | 0 | 0.01 | array_string | 9 | sparse | Andrew Albert, Dan Garodnick, David Jones, John Ross 'JR' Rizzo, John… |
| nyct_non_reimbursable_actual | — | 1 | 1 | 0 | 0.01 | number | 0 | numeric |  |
| nyct_total_positions_actual | — | 1 | 1 | 0 | 0.01 | number | 0 | numeric |  |
| record_count | — | 1 | 1 | 0 | 0.01 | number | 0 | numeric |  |
| rows_partial_sample | — | 1 | 1 | 0 | 0.01 | object | 0 | structured |  |
| source | — | 1 | 1 | 0 | 0.01 | scalar_string | 1 | sparse | MTA |
| systemwide_average | — | 1 | 1 | 0 | 0.01 | scalar_string | 1 | sparse | 86.1% |
| top_ranked_count | — | 1 | 1 | 0 | 0.01 | number | 0 | numeric |  |
| total_corridors_studied | — | 1 | 1 | 0 | 0.01 | number | 0 | numeric |  |
| unit | — | 1 | 1 | 0 | 0.01 | scalar_string | 1 | sparse | percent |
| values | — | 1 | 1 | 0 | 0.01 | object | 0 | structured |  |

### Enum candidates (proposed closures, derived from corpus)

- **period** (4 all / 4 accepted / 0 canonical, 2 distinct, singletons 1/2, open): `January to May 2025` | `May 2025`
  - counts: May 2025×3
  - accepted counts: May 2025×3
- **entities** (3 all / 3 accepted / 0 canonical, 3 distinct, singletons 0/3, open): `MTA Bus` | `New York City Transit` | `Staten Island Rail`
  - counts: MTA Bus×3, New York City Transit×3, Staten Island Rail×3
  - accepted counts: MTA Bus×3, New York City Transit×3, Staten Island Rail×3
- **demographic** (2 all / 2 accepted / 0 canonical, 2 distinct, singletons 2/2, open): `pedestrians` | `seniors (62+) and persons with disabilities`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`caption`, `chair`, `column_count`, `columns`, `committee`, `date_range`, `demographic`, `description`, `entities`, `governing_body`, `location`, `location_normalized`, `members`, `notes`, `nyct_non_reimbursable_actual`, `nyct_total_positions_actual`, `page`, `period`, `record_count`, `row_count`, `rows`, `rows_count`, `rows_description`, `rows_partial_sample`, `source`, `source_note`, `systemwide_average`, `table_name`, `table_number`, `table_title`, `title`, `top_ranked_count`, `total_corridors_studied`, `unit`, `values`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) Jamaica Ave Busway Percentage Speed Change Pre-Busway and Post-Busway (May 2019 vs. May 2022)
- (raw_text ×2) Jamaica Ave Busway - Percentage Speed Change Pre-Busway and Post-Busway (May 2019 vs. May 2022)

## project

submissions: 143 (accepted 138 / rejected 5); canonical records: 104

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| project_name | yes | 143 | 138 | 104 | 1.00 | scalar_string | 112 | free_text | Queens Bus Network Redesign, 14th Street Transit & Truck Priority Pil… |
| description | yes | 136 | 131 | 101 | 0.95 | scalar_string | 131 | free_text | A bus-mounted camera system that issues violations to vehicles occupy… |
| status | yes | 133 | 128 | 102 | 0.93 | scalar_string | 44 | free_text | proposed_2019, completed, active, proposed, study, ongoing, operation… |
| project_type | yes | 120 | 115 | 86 | 0.84 | scalar_string | 68 | free_text | busway, new_bus_lane, bus_network_redesign, bus network redesign, bus… |
| borough | — | 40 | 39 | 36 | 0.28 | scalar_string | 5 | enum_candidate | Manhattan, Brooklyn, Bronx, Queens, Staten Island |
| document_time_status | — | 30 | 28 | 102 | 0.21 | scalar_string | 10 | enum_candidate | implemented, active, program_context, stalled_resuming, announced, st… |
| project_family | — | 29 | 27 | 86 | 0.20 | scalar_string | 18 | free_text | busway, capital_or_infrastructure, planning_or_report, bike_lane, bus… |
| daily_ridership | — | 24 | 24 | 24 | 0.17 | number | 0 | numeric |  |
| name | yes | 24 | 24 | 24 | 0.17 | scalar_string | 24 | free_text | 14th St, Ave A to Ave D, 42nd St, 12th Ave to FDR Dr, 96th St, Rivers… |
| routes_served | — | 24 | 24 | 24 | 0.17 | array_string | 106 | free_text | B103, B83, BM2, BM3, BM4, Q20A, Q20B, Q44 SBS |
| borough_normalized | — | 21 | 20 | 36 | 0.15 | scalar_string | 5 | enum_candidate | bronx, manhattan, queens, brooklyn, staten_island |
| corridor_length_miles | — | 21 | 21 | 21 | 0.15 | number | 0 | numeric |  |
| location | — | 5 | 5 | 5 | 0.03 | scalar_string | 5 | free_text | 14th Street, Manhattan, Bronx, New York City, Church Avenue Station,… |
| location_normalized | — | 5 | 5 | 5 | 0.03 | object | 0 | structured |  |
| operator | — | 5 | 5 | 5 | 0.03 | scalar_string | 2 | enum_candidate | NYC DOT, MTA |
| duration | — | 4 | 3 | 3 | 0.03 | scalar_string | 3 | enum_candidate | one year, 18-month pilot, one-year pilot |
| publisher | — | 4 | 3 | 3 | 0.03 | scalar_string | 2 | enum_candidate | NYC Comptroller Brad Lander, People Oriented Cities |
| boroughs | — | 3 | 3 | 3 | 0.02 | array_string | 3 | enum_candidate | Queens, Brooklyn, Manhattan |
| year | — | 3 | 3 | 3 | 0.02 | number | 0 | numeric |  |
| completion_date | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | November 25, 2025, summer 2017 |
| completion_date_normalized | — | 2 | 2 | 2 | 0.01 | object | 0 | structured |  |
| launch_date | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | 2021-04-26, July 13, 2015 |
| launch_date_normalized | — | 2 | 2 | 2 | 0.01 | object | 0 | structured |  |
| start_date | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | June 2016, June 2024 |
| start_date_normalized | — | 2 | 2 | 2 | 0.01 | object | 0 | structured |  |
| start_date_text | — | 2 | 2 | 2 | 0.01 | scalar_string | 2 | enum_candidate | October 24, 2021, October 3, 2019 |
| start_date_text_normalized | — | 2 | 2 | 2 | 0.01 | object | 0 | structured |  |
| agency | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | NYC DOT |
| authorizing_legislation | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | Chapter 489 of the Laws of 2021 |
| benefits | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | increased reliability, reduced delays, shorter travel times; 2.5 time… |
| boroughs_normalized | — | 1 | 1 | 3 | 0.01 | array_string | 2 | sparse | manhattan, queens |
| bus_capacity | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| buses_equipped | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| capacity_per_month | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| community_meetings | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | nearly 300 outreach events since 2019 |
| completion_target_year | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| corridor | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | 79th Street |
| corridors | — | 1 | 1 | 1 | 0.01 | array_string | 2 | sparse | Archer Avenue, Jamaica Avenue |
| coverage_miles | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| csc_planned_additional | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| csc_target_total | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| csc_total_open | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| daily_customers_benefitted | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| expected_completion | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | summer of 2026 |
| expected_timeline | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | later in 2025 |
| express_routes_existing | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| express_routes_proposed | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| goals | — | 1 | 1 | 1 | 0.01 | array_string | 2 | sparse | Improve safety along a Vision Zero Priority corridor, Increase speeds… |
| implementation_target | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | spring 2012 |
| implementing_agency | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | NYCDOT |
| launch_date_text | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | October 24, 2021 |
| launch_date_text_normalized | — | 1 | 1 | 1 | 0.01 | object | 0 | structured |  |
| lead_agency | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | NYC Department of Transportation |
| local_hiring_goal | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | 20% of NY State workforce from Southeast Queens |
| local_routes_existing | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| local_routes_proposed | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| new_location | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | 90th Avenue |
| new_location_normalized | — | 1 | 1 | 1 | 0.01 | object | 0 | structured |  |
| noise_mitigation | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | sound-reducing walls along 107th Avenue and 165th Street |
| old_location | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | Merrick Boulevard |
| old_location_normalized | — | 1 | 1 | 1 | 0.01 | object | 0 | structured |  |
| partner_agency | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | NYC Department of Design and Construction |
| partners | — | 1 | 1 | 1 | 0.01 | array_string | 2 | sparse | MTA, NYPD |
| phase | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | Draft Plan |
| phase_1_start_date | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | June 29, 2025 |
| phase_1_start_date_normalized | — | 1 | 1 | 1 | 0.01 | object | 0 | structured |  |
| phase_2_start_date | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | August 31, 2025 |
| phase_2_start_date_normalized | — | 1 | 1 | 1 | 0.01 | object | 0 | structured |  |
| program | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | Better Buses Restart |
| public_comments_received | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | more than 18,000 |
| publication_date | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | December 2022 |
| publication_date_normalized | — | 1 | 1 | 1 | 0.01 | object | 0 | structured |  |
| routes_covered | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| rush_routes_proposed | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| start_year | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| subway_lines | — | 1 | 1 | 1 | 0.01 | array_string | 2 | sparse | B, Q |
| sustainability_features | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | green roof, LEED certification standards, stormwater detention tanks… |
| total_routes_existing | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| total_routes_proposed | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| years_of_planning | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| _merged_field_values | — | 0 | 0 | 16 | 0.00 | empty | 0 | sparse |  |

### Enum candidates (proposed closures, derived from corpus)

- **borough** (40 all / 39 accepted / 36 canonical, 5 distinct, singletons 0/5, open): `Bronx` | `Brooklyn` | `Manhattan` | `Queens` | `Staten Island`
  - counts: Manhattan×13, Brooklyn×9, Bronx×8, Queens×8, Staten Island×2
  - accepted counts: Manhattan×13, Brooklyn×9, Queens×8, Bronx×7, Staten Island×2
  - canonical counts: Manhattan×13, Brooklyn×8, Queens×7, Bronx×6, Staten Island×2
- **document_time_status** (30 all / 28 accepted / 102 canonical, 10 distinct, singletons 4/10, open): `active` | `announced` | `construction_began_june_2016_anticipated_completion_summer_2017` | `implemented` | `launched_july_2015_post_implementation_progress_reported` | `planned` | `program_context` | `retrospective` | `stalled_resuming` | `study`
  - counts: implemented×11, active×4, program_context×4, stalled_resuming×3, announced×2, study×2
  - accepted counts: implemented×11, program_context×4, active×3, stalled_resuming×3, study×2
  - canonical counts: planned×40, implemented×27, active×12, study×10, stalled_resuming×3, under_construction×3, approved×2, pilot×2
- **borough_normalized** (21 all / 20 accepted / 36 canonical, 5 distinct, singletons 1/5, open): `bronx` | `brooklyn` | `manhattan` | `queens` | `staten_island`
  - counts: bronx×6, manhattan×6, queens×5, brooklyn×3
  - accepted counts: manhattan×6, bronx×5, queens×5, brooklyn×3
  - canonical counts: manhattan×13, brooklyn×8, queens×7, bronx×6, staten_island×2
- **operator** (5 all / 5 accepted / 5 canonical, 2 distinct, singletons 0/2, open): `MTA` | `NYC DOT`
  - counts: NYC DOT×3, MTA×2
  - accepted counts: NYC DOT×3, MTA×2
  - canonical counts: NYC DOT×3, MTA×2
- **duration** (4 all / 3 accepted / 3 canonical, 3 distinct, singletons 2/3, open): `18-month pilot` | `one year` | `one-year pilot`
  - counts: one year×2
- **publisher** (4 all / 3 accepted / 3 canonical, 2 distinct, singletons 1/2, open): `NYC Comptroller Brad Lander` | `People Oriented Cities`
  - counts: NYC Comptroller Brad Lander×3
  - accepted counts: NYC Comptroller Brad Lander×2
  - canonical counts: NYC Comptroller Brad Lander×2
- **boroughs** (3 all / 3 accepted / 3 canonical, 3 distinct, singletons 1/3, open): `Brooklyn` | `Manhattan` | `Queens`
  - counts: Queens×3, Brooklyn×2
  - accepted counts: Queens×3, Brooklyn×2
  - canonical counts: Queens×3, Brooklyn×2
- **completion_date** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `November 25, 2025` | `summer 2017`
- **launch_date** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `2021-04-26` | `July 13, 2015`
- **start_date** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `June 2016` | `June 2024`
- **start_date_text** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `October 24, 2021` | `October 3, 2019`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`_merged_field_values`, `agency`, `authorizing_legislation`, `benefits`, `borough`, `borough_normalized`, `boroughs`, `boroughs_normalized`, `bus_capacity`, `buses_equipped`, `capacity_per_month`, `community_meetings`, `completion_date`, `completion_date_normalized`, `completion_target_year`, `corridor`, `corridor_length_miles`, `corridors`, `coverage_miles`, `csc_planned_additional`, `csc_target_total`, `csc_total_open`, `daily_customers_benefitted`, `daily_ridership`, `document_time_status`, `duration`, `expected_completion`, `expected_timeline`, `express_routes_existing`, `express_routes_proposed`, `goals`, `implementation_target`, `implementing_agency`, `launch_date`, `launch_date_normalized`, `launch_date_text`, `launch_date_text_normalized`, `lead_agency`, `local_hiring_goal`, `local_routes_existing`, `local_routes_proposed`, `location`, `location_normalized`, `new_location`, `new_location_normalized`, `noise_mitigation`, `old_location`, `old_location_normalized`, `operator`, `partner_agency`, `partners`, `phase`, `phase_1_start_date`, `phase_1_start_date_normalized`, `phase_2_start_date`, `phase_2_start_date_normalized`, `program`, `project_family`, `public_comments_received`, `publication_date`, `publication_date_normalized`, `publisher`, `routes_covered`, `routes_served`, `rush_routes_proposed`, `start_date`, `start_date_normalized`, `start_date_text`, `start_date_text_normalized`, `start_year`, `subway_lines`, `sustainability_features`, `total_routes_existing`, `total_routes_proposed`, `year`, `years_of_planning`

### Repeated labels / raw_text (source_labels candidates)

- (label ×3) Queens Bus Network Redesign
- (label ×3) Tremont Avenue Busway
- (label ×2) Automated Camera Enforcement (ACE)
- (label ×2) Behind Schedule Report (April 2025)
- (label ×2) Better Buses Action Plan
- (label ×2) Better Buses Program
- (label ×2) Brooklyn Bus Network Redesign
- (label ×2) Jay Street Busway Pilot
- (label ×2) NYC Streets Plan
- (raw_text ×2) Jay Street Busway Pilot Smith St./Livingston St. to Jay St./Tillary St.
- (raw_text ×2) NYC DOT developed the NYC Streets Plan, a five-year transportation plan to improve the safety, acce…
- (raw_text ×2) Tremont Ave. will become a busway: Eastbound from Third Ave. to Southern Blvd. Westbound from South…

## corridor

submissions: 87 (accepted 84 / rejected 3); canonical records: 55

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| corridor_name | yes | 87 | 84 | 55 | 1.00 | scalar_string | 64 | free_text | Tremont Avenue, 34th Street Busway, Jamaica Avenue, Story Avenue, 116… |
| borough | — | 58 | 55 | 42 | 0.67 | scalar_string | 6 | enum_candidate | Manhattan, Brooklyn, Queens, Bronx, Staten Island, the Bronx |
| limits | yes | 52 | 50 | 36 | 0.60 | scalar_string | 48 | free_text | 3rd Avenue to 8th Avenue (westbound) and 9th Avenue to 3rd Avenue (ea… |
| street | yes | 51 | 49 | 33 | 0.59 | scalar_string | 34 | free_text | 14th Street, Tremont Avenue, Jamaica Avenue, 34th Street, Archer Aven… |
| description | yes | 48 | 47 | 41 | 0.55 | scalar_string | 47 | free_text | Bus priority corridor in Soundview, South Bronx with new curbside bus… |
| from | yes | 18 | 17 | 14 | 0.21 | scalar_string | 16 | free_text | Amsterdam Avenue, Third Ave. / Southern Blvd., 3rd Avenue, 9th Avenue… |
| to | yes | 18 | 17 | 14 | 0.21 | scalar_string | 15 | free_text | Broadway, Southern Blvd. / Belmont Ave., Southern Boulevard, 3rd Aven… |
| borough_normalized | — | 13 | 12 | 42 | 0.15 | scalar_string | 4 | enum_candidate | bronx, manhattan, brooklyn, queens |
| status | — | 12 | 12 | 11 | 0.14 | scalar_string | 4 | enum_candidate | Completed 2020, Future Plan, Planned, Present Implementation |
| routes | — | 11 | 11 | 11 | 0.13 | array_string | 33 | free_text | Bx36, Bx3, Bx35, Bx11, Bx12, Bx12 SBS, Bx13, Bx17 |
| corridor_length_mi | — | 10 | 10 | 10 | 0.11 | number | 0 | numeric |  |
| routes_served | — | 10 | 10 | 10 | 0.11 | array_string | 26 | free_text | Bx35, Bx36, Bx11, Bx12, Bx12 SBS, Bx13, Bx17, Bx18 |
| combined_daily_ridership | — | 9 | 9 | 9 | 0.10 | number | 0 | numeric |  |
| days | — | 9 | 9 | 9 | 0.10 | scalar_string | 2 | enum_candidate | seven days a week, Monday through Friday |
| hours | — | 9 | 9 | 9 | 0.10 | scalar_string | 5 | enum_candidate | 6am to 8pm, 24 hours a day, 6am to 10pm, 6am to 7pm, 7am to 7pm |
| local_access | — | 9 | 9 | 8 | 0.10 | scalar_string | 8 | free_text | may turn onto the busway from a side street but must turn at next ava… |
| streets | yes | 9 | 9 | 9 | 0.10 | array_string | 60 | free_text | 1st Avenue, 3rd Avenue, 86th Street, Broadway, Fordham Road, 125th St… |
| through_access_vehicles | — | 9 | 9 | 9 | 0.10 | array_string | 6 | enum_candidate | buses, emergency vehicles, trucks, Access-A-Ride vans, bicycles, buse… |
| boroughs | — | 3 | 3 | 3 | 0.03 | array_string | 4 | enum_candidate | Manhattan, Queens, Brooklyn, Bronx |
| bus_routes | — | 3 | 2 | 2 | 0.03 | number | 0 | numeric |  |
| daily_ridership_hours | — | 3 | 2 | 2 | 0.03 | scalar_string | 2 | enum_candidate | All Days, 6AM-8PM, All Days, 24/7 |
| direction | — | 3 | 3 | 3 | 0.03 | scalar_string | 2 | enum_candidate | both directions, eastbound only |
| ridership | — | 3 | 2 | 2 | 0.03 | number | 0 | numeric |  |
| ridership_text | — | 3 | 2 | 2 | 0.03 | scalar_string | 2 | enum_candidate | 139,000 daily riders, 189,000 daily riders |
| routes_note | — | 3 | 2 | 2 | 0.03 | scalar_string | 1 | free_text | Routes running between Sutphin Blvd & 168 St only |
| busway_launch_date | — | 2 | 1 | 1 | 0.02 | scalar_string | 1 | enum_candidate | October 24, 2021 |
| busway_launch_date_normalized | — | 2 | 1 | 1 | 0.02 | object | 0 | structured |  |
| pickup_dropoff | — | 2 | 2 | 2 | 0.02 | scalar_string | 2 | enum_candidate | allowed throughout except Jamaica Ave westbound between 147th Pl and… |
| regulation_text | — | 2 | 2 | 2 | 0.02 | scalar_string | 1 | free_text | 24 hours a day/7 days a week |
| restrictions | — | 2 | 2 | 2 | 0.02 | scalar_string | 2 | free_text | No parking nor loading access along busway, truck loading zones are p… |
| through_trips | — | 2 | 2 | 2 | 0.02 | scalar_string | 2 | free_text | buses and emergency vehicles only, buses, trucks, emergency vehicles… |
| borrow | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | Manhattan |
| corridor_length_miles | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| daily_ridership | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| eastbound_limits | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | Third Avenue to Southern Boulevard |
| features | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | Enhanced protected bicycle lanes on Jay Street and Smith Street |
| left_turns | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | restricted except eastbound left at 153rd St |
| length_miles | — | 1 | 1 | 1 | 0.01 | number | 0 | numeric |  |
| limits_northbound | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | Main Street between Sanford Avenue and Northern Boulevard |
| limits_southbound | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | Main Street between Sanford Avenue and 37th Avenue |
| neighborhoods | — | 1 | 1 | 1 | 0.01 | array_string | 2 | sparse | Inwood, Washington Heights |
| parking_loading | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | no parking nor loading access eastbound between 150th St and 160th St |
| pre_busway_speed_range | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | 5.3 to 6.1 MPH (PM) |
| trucks_allowed | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | not allowed eastbound |
| westbound_limits | — | 1 | 1 | 1 | 0.01 | scalar_string | 1 | sparse | Southern Boulevard to Belmont Avenue |
| _merged_field_values | — | 0 | 0 | 10 | 0.00 | empty | 0 | sparse |  |
| boroughs_normalized | — | 0 | 0 | 3 | 0.00 | empty | 0 | sparse |  |

### Enum candidates (proposed closures, derived from corpus)

- **borough** (58 all / 55 accepted / 42 canonical, 6 distinct, singletons 1/6, open): `Bronx` | `Brooklyn` | `Manhattan` | `Queens` | `Staten Island` | `the Bronx`
  - counts: Manhattan×18, Brooklyn×13, Queens×13, Bronx×11, Staten Island×2
  - accepted counts: Manhattan×17, Brooklyn×13, Queens×12, Bronx×10, Staten Island×2
  - canonical counts: Brooklyn×13, Manhattan×11, Bronx×8, Queens×8, Staten Island×2
- **borough_normalized** (13 all / 12 accepted / 42 canonical, 4 distinct, singletons 0/4, open): `bronx` | `brooklyn` | `manhattan` | `queens`
  - counts: bronx×5, manhattan×4, brooklyn×2, queens×2
  - accepted counts: bronx×4, manhattan×4, brooklyn×2, queens×2
  - canonical counts: brooklyn×13, manhattan×11, bronx×8, queens×8, staten_island×2
- **status** (12 all / 12 accepted / 11 canonical, 4 distinct, singletons 0/4, open): `Completed 2020` | `Future Plan` | `Planned` | `Present Implementation`
  - counts: Completed 2020×4, Future Plan×4, Planned×2, Present Implementation×2
  - accepted counts: Completed 2020×4, Future Plan×4, Planned×2, Present Implementation×2
  - canonical counts: Completed 2020×4, Future Plan×4, Present Implementation×2
- **days** (9 all / 9 accepted / 9 canonical, 2 distinct, singletons 1/2, open): `Monday through Friday` | `seven days a week`
  - counts: seven days a week×8
  - accepted counts: seven days a week×8
  - canonical counts: seven days a week×8
- **hours** (9 all / 9 accepted / 9 canonical, 5 distinct, singletons 2/5, open): `24 hours a day` | `6am to 10pm` | `6am to 7pm` | `6am to 8pm` | `7am to 7pm`
  - counts: 6am to 8pm×3, 24 hours a day×2, 6am to 10pm×2
  - accepted counts: 6am to 8pm×3, 24 hours a day×2, 6am to 10pm×2
  - canonical counts: 6am to 8pm×3, 24 hours a day×2, 6am to 10pm×2
- **through_access_vehicles** (9 all / 9 accepted / 9 canonical, 6 distinct, singletons 1/6, open): `Access-A-Ride vans` | `bicycles` | `buses` | `buses only` | `emergency vehicles` | `trucks`
  - counts: buses×8, emergency vehicles×8, trucks×7, Access-A-Ride vans×2, bicycles×2
  - accepted counts: buses×8, emergency vehicles×8, trucks×7, Access-A-Ride vans×2, bicycles×2
  - canonical counts: buses×8, emergency vehicles×8, trucks×7, Access-A-Ride vans×2, bicycles×2
- **boroughs** (3 all / 3 accepted / 3 canonical, 4 distinct, singletons 0/4, open): `Bronx` | `Brooklyn` | `Manhattan` | `Queens`
  - counts: Manhattan×4, Queens×4, Brooklyn×3, Bronx×2
  - accepted counts: Manhattan×4, Queens×4, Brooklyn×3, Bronx×2
  - canonical counts: Manhattan×4, Queens×4, Brooklyn×3, Bronx×2
- **daily_ridership_hours** (3 all / 2 accepted / 2 canonical, 2 distinct, singletons 1/2, open): `All Days, 24/7` | `All Days, 6AM-8PM`
  - counts: All Days, 6AM-8PM×2
- **direction** (3 all / 3 accepted / 3 canonical, 2 distinct, singletons 1/2, open): `both directions` | `eastbound only`
  - counts: both directions×2
  - accepted counts: both directions×2
  - canonical counts: both directions×2
- **ridership_text** (3 all / 2 accepted / 2 canonical, 2 distinct, singletons 1/2, open): `139,000 daily riders` | `189,000 daily riders`
  - counts: 139,000 daily riders×2
- **busway_launch_date** (2 all / 1 accepted / 1 canonical, 1 distinct, singletons 0/1, open): `October 24, 2021`
  - counts: October 24, 2021×2
- **pickup_dropoff** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `allowed throughout except Jamaica Ave westbound between 147th Pl and Sutphin Blvd` | `permitted in westbound direction`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`_merged_field_values`, `borough`, `borough_normalized`, `boroughs`, `boroughs_normalized`, `borrow`, `bus_routes`, `busway_launch_date`, `busway_launch_date_normalized`, `combined_daily_ridership`, `corridor_length_mi`, `corridor_length_miles`, `daily_ridership`, `daily_ridership_hours`, `days`, `direction`, `eastbound_limits`, `features`, `hours`, `left_turns`, `length_miles`, `limits_northbound`, `limits_southbound`, `local_access`, `neighborhoods`, `parking_loading`, `pickup_dropoff`, `pre_busway_speed_range`, `regulation_text`, `restrictions`, `ridership`, `ridership_text`, `routes`, `routes_note`, `routes_served`, `status`, `through_access_vehicles`, `through_trips`, `trucks_allowed`, `westbound_limits`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) Jamaica Avenue, Queens
- (label ×2) Tremont Avenue Busway Corridor Segment
- (raw_text ×2) Tremont Ave. busway: Eastbound from Third Ave. to Southern Blvd. Westbound from Southern Blvd. to B…

## source

submissions: 51 (accepted 49 / rejected 2); canonical records: 48

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| publisher | — | 50 | 48 | 47 | 0.98 | scalar_string | 17 | free_text | NYC DOT, MTA, NYC Department of Transportation, MTA New York City Tra… |
| title | — | 30 | 30 | 29 | 0.59 | scalar_string | 28 | free_text | M86 Select Bus Service Progress Report, Tremont Avenue Busway, 14th S… |
| description | — | 23 | 21 | 21 | 0.45 | scalar_string | 22 | free_text | Schema definition with column names, data types, descriptions, and ca… |
| content_type | — | 15 | 15 | 15 | 0.29 | scalar_string | 9 | enum_candidate | text/html, report, application/pdf, article, brochure, html, press re… |
| source_id | — | 13 | 13 | 13 | 0.25 | scalar_string | 13 | free_text | 14th_street_busway, 161st_bx6_capital_project_2026, 181st_street_jun2… |
| source_type | — | 12 | 11 | 11 | 0.24 | scalar_string | 9 | free_text | webpage, data_dictionary, brochure, dataset_dictionary, evaluation_re… |
| date_text | — | 10 | 10 | 10 | 0.20 | scalar_string | 10 | free_text | 2017, April 2019, Fall 2019, February 2025, Friday, December 3, 2021,… |
| date_text_normalized | — | 10 | 10 | 10 | 0.20 | object | 0 | structured |  |
| document_type | — | 10 | 9 | 9 | 0.20 | scalar_string | 9 | free_text | bus_network_redesign_plan, addendum, annual update / open data plan,… |
| document_date | — | 8 | 8 | 8 | 0.16 | scalar_string | 7 | free_text | 2025, 2016-06, 2020-07, 2022-06-23, 2022-12-01, 2025-09, 2026-01-27 |
| document_date_normalized | — | 8 | 8 | 8 | 0.16 | object | 0 | structured |  |
| source_url | — | 8 | 8 | 8 | 0.16 | scalar_string | 8 | free_text | https://capitaldashboard.mta.info/, https://www.mta.info/document/173… |
| source_name | — | 7 | 6 | 6 | 0.14 | scalar_string | 6 | free_text | Queens Bus Network Redesign Proposed Final Plan, 14th Street Transit… |
| date | — | 6 | 6 | 6 | 0.12 | scalar_string | 5 | free_text | June 2025, 2022-04-18, 2026, December 2025, Winter 2020 |
| date_normalized | — | 6 | 6 | 6 | 0.12 | object | 0 | structured |  |
| source_title | — | 6 | 6 | 6 | 0.12 | scalar_string | 6 | free_text | 14th Street Transit & Truck Priority Pilot Project Quarterly Report W… |
| url | — | 6 | 6 | 6 | 0.12 | scalar_string | 6 | free_text | https://comptroller.nyc.gov, https://www.mta.info/open-data, https://… |
| year | — | 6 | 5 | 5 | 0.12 | number | 0 | numeric |  |
| publication_date | — | 4 | 4 | 4 | 0.08 | scalar_string | 4 | enum_candidate | 2017-07-24, 2021-12-03, 2026-03-24, October 2019 |
| publication_date_normalized | — | 4 | 4 | 4 | 0.08 | object | 0 | structured |  |
| retrieved_at | — | 4 | 4 | 4 | 0.08 | scalar_string | 1 | enum_candidate | 2026-05-25T22:21:55.189Z |
| document_kind | — | 3 | 3 | 3 | 0.06 | scalar_string | 3 | enum_candidate | equity_evaluation, final_plan, monitoring_report |
| document_title | — | 3 | 3 | 3 | 0.06 | scalar_string | 3 | free_text | Bronx Bus Network Redesign Final Plan, METROPOLITAN TRANSPORTATION AU… |
| prepared_for | — | 3 | 3 | 3 | 0.06 | scalar_string | 3 | free_text | June 2025 meeting of the New York City Transit & Bus Committee, NYCDO… |
| dataset_name | — | 2 | 1 | 1 | 0.04 | scalar_string | 1 | enum_candidate | Bus Lanes |
| format | — | 2 | 1 | 1 | 0.04 | scalar_string | 1 | free_text | JSON data dictionary (Socrata API column metadata) |
| program | — | 2 | 2 | 2 | 0.04 | scalar_string | 2 | enum_candidate | Better Buses Restart, BETTERBUSES |
| record_count | — | 2 | 1 | 1 | 0.04 | number | 0 | numeric |  |
| report_type | — | 2 | 2 | 2 | 0.04 | scalar_string | 2 | enum_candidate | performance evaluation, preliminary report |
| source_kind | — | 2 | 2 | 2 | 0.04 | scalar_string | 2 | enum_candidate | brochure, webpage |
| total_blocks | — | 2 | 2 | 2 | 0.04 | number | 0 | numeric |  |
| total_pages | — | 2 | 2 | 2 | 0.04 | number | 0 | numeric |  |
| author | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | Sarah Meyer, Chief Customer Officer |
| commissioner | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | Ydanis Rodriguez |
| coverage_period | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | 2022-2023 |
| date_prepared | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | June 23, 2025 |
| event | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | Community Advisory Board Meeting |
| language | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | en |
| location | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | 2 Broadway, New York, NY 10004 |
| location_normalized | — | 1 | 1 | 1 | 0.02 | object | 0 | structured |  |
| project | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | Queens Bus Network Redesign |
| publication_date_text | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | April 2025 |
| publication_date_text_normalized | — | 1 | 1 | 1 | 0.02 | object | 0 | structured |  |
| publication_name | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | 34th Street Busway |
| series | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | Better Buses |
| source_date | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | 2025 |
| source_date_normalized | — | 1 | 1 | 1 | 0.02 | object | 0 | structured |  |
| source_group | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | open_data_plan |
| source_label | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | Better Buses Restart: Jamaica Busway Monitoring Update – November 2022 |
| status | — | 1 | 1 | 1 | 0.02 | scalar_string | 1 | sparse | loading_placeholder_only |
| _merged_field_values | — | 0 | 0 | 1 | 0.00 | empty | 0 | sparse |  |

### Enum candidates (proposed closures, derived from corpus)

- **content_type** (15 all / 15 accepted / 15 canonical, 9 distinct, singletons 6/9, open): `application/pdf` | `article` | `brochure` | `html` | `press release` | `Press Release` | `progress report` | `report` | `text/html`
  - counts: text/html×4, report×3, application/pdf×2
  - accepted counts: text/html×4, report×3, application/pdf×2
  - canonical counts: text/html×4, report×3, application/pdf×2
- **publication_date** (4 all / 4 accepted / 4 canonical, 4 distinct, singletons 4/4, open): `2017-07-24` | `2021-12-03` | `2026-03-24` | `October 2019`
- **retrieved_at** (4 all / 4 accepted / 4 canonical, 1 distinct, singletons 0/1, open): `2026-05-25T22:21:55.189Z`
  - counts: 2026-05-25T22:21:55.189Z×4
  - accepted counts: 2026-05-25T22:21:55.189Z×4
  - canonical counts: 2026-05-25T22:21:55.189Z×4
- **document_kind** (3 all / 3 accepted / 3 canonical, 3 distinct, singletons 3/3, open): `equity_evaluation` | `final_plan` | `monitoring_report`
- **dataset_name** (2 all / 1 accepted / 1 canonical, 1 distinct, singletons 0/1, open): `Bus Lanes`
  - counts: Bus Lanes×2
- **program** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `Better Buses Restart` | `BETTERBUSES`
- **report_type** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `performance evaluation` | `preliminary report`
- **source_kind** (2 all / 2 accepted / 2 canonical, 2 distinct, singletons 2/2, open): `brochure` | `webpage`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`_merged_field_values`, `author`, `commissioner`, `content_type`, `coverage_period`, `dataset_name`, `date`, `date_normalized`, `date_prepared`, `date_text`, `date_text_normalized`, `description`, `document_date`, `document_date_normalized`, `document_kind`, `document_title`, `document_type`, `event`, `format`, `language`, `location`, `location_normalized`, `prepared_for`, `program`, `project`, `publication_date`, `publication_date_normalized`, `publication_date_text`, `publication_date_text_normalized`, `publication_name`, `publisher`, `record_count`, `report_type`, `retrieved_at`, `series`, `source_date`, `source_date_normalized`, `source_group`, `source_id`, `source_kind`, `source_label`, `source_name`, `source_title`, `source_type`, `source_url`, `status`, `title`, `total_blocks`, `total_pages`, `url`, `year`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) NYC DOT Bus Lanes Dataset Dictionary
- (label ×2) Queens Bus Network Redesign Proposed Final Plan
- (raw_text ×2) NYC DOT Bus Lanes Dataset Columns — data dictionary / schema definition for the Bus Lanes dataset o…

## source_gap

submissions: 5 (accepted 5 / rejected 0); canonical records: 5

### Fields

| field | anchor | all | acc | canon | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gap_kind | yes | 5 | 5 | 5 | 1.00 | scalar_string | 5 | free_text | correction, data_collection_suspension, data_not_collected, data_unav… |
| missing_information | yes | 5 | 5 | 5 | 1.00 | scalar_string | 5 | free_text | Bus speeds, reliability, and ridership before and after implementatio… |
| description | yes | 4 | 4 | 4 | 0.80 | scalar_string | 4 | free_text | 2024 legislation added new reporting requirements not yet collected f… |
| gap_text | yes | 4 | 4 | 4 | 0.80 | scalar_string | 4 | free_text | As a Vision Zero Priority Corridor, crash data will be reported in su… |
| affected_period | — | 1 | 1 | 1 | 0.20 | scalar_string | 1 | sparse | 2022-2023 |
| gap_kind_normalized | — | 0 | 0 | 5 | 0.00 | empty | 0 | sparse |  |

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`affected_period`, `gap_kind_normalized`

## Reviewer Task

This is a diagnostic feed for tightening `mta_submit_observation` payload typing. Suggest only — do not enforce here.

For each enum candidate: confirm whether the proposed closure is complete (`other` + `other_type_text` escape hatch), or whether values should be normalized/merged. For each key outside declared anchors: classify as promote-to-schema, alias-of-existing, escape-hatch, or drop. Stage proposals under `data/identity-review/llm-suggestions/`; land them as warn-mode normalizers before any hard-reject.

