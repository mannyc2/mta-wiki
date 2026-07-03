# Payload Schema Audit

run_id: 2026-06-08T21-57-25-668Z_schema-audit
generated_at: 2026-06-08T21:57:25.668Z

Corpus: 2807 submissions (accepted 2716 / rejected 91) across 12 observation kinds.

Thresholds: enum if ≤ 12 distinct string values and ≥ 2 occurrences and not free-text/numeric. Values count across **all** submissions (accepted + rejected).

## metric_claim

submissions: 902 (accepted 869 / rejected 33)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| metric_name | yes | 902 | 1.00 | scalar_string | 515 | free_text | bus_travel_time, bus_travel_time_change, bus_speed_change, weekday_ri… |
| raw_value_text | yes | 883 | 0.98 | scalar_string | 801 | free_text | 84, 0, 14, 86%, +38%, +8%, 2, 2019-10-07 to 2026-05-11 |
| value | yes | 849 | 0.94 | number | 0 | numeric |  |
| unit | — | 728 | 0.81 | scalar_string | 91 | free_text | percent, minutes, mph, vehicles, routes, dollars, miles, riders |
| description | — | 248 | 0.27 | scalar_string | 244 | free_text | Bus speed in slowest segments of 116th Street study area, Grade A thr… |
| period | — | 196 | 0.22 | scalar_string | 37 | free_text | school_months, 2022-2023, May 2025, summer_months, November 2025, AM_… |
| scope | — | 114 | 0.13 | scalar_string | 49 | free_text | CBD Overall, entire_route, systemwide, CBD Express buses, CBD Local b… |
| direction | — | 79 | 0.09 | scalar_string | 10 | enum_candidate | decrease, northbound, improvement, increase, westbound, eastbound, so… |
| year | — | 73 | 0.08 | mixed | 1 | numeric | 2022 |
| context | — | 71 | 0.08 | scalar_string | 53 | free_text | Brooklyn, Brooklyn bus network, Brooklyn residents, February 2015, 6:… |
| value_max | yes | 66 | 0.07 | mixed | 2 | enum_candidate | 2026-05-11T00:00:00.000, S79+ |
| value_min | yes | 63 | 0.07 | mixed | 2 | enum_candidate | 2019-10-07T00:00:00.000, B11 |
| comparison | — | 52 | 0.06 | mixed | 12 | enum_candidate | May 2019 vs May 2022, post_vs_pre_sbs, pre_sbs, post_sbs, May_2014_to… |
| route | — | 43 | 0.05 | scalar_string | 26 | free_text | B44 SBS, B44 Limited, B1, B44, B49, B44 Local, Bx4, B44 Total |
| route_label | — | 43 | 0.05 | scalar_string | 8 | enum_candidate | B60, Bx18A/B, M116, Q4, S46/S96, System, Fare-Free Avg, Systemwide |
| time_period | — | 31 | 0.03 | scalar_string | 9 | enum_candidate | Daily, Dec-July (2021-2022), Dec-July average (2017-2018, 2018-2019,… |
| column | — | 26 | 0.03 | scalar_string | 10 | enum_candidate | Boro, Direction, SBS_Route1, TrafDir, Lane_Type, Lane_Type1, Lane_wid… |
| source_system | — | 26 | 0.03 | scalar_string | 4 | enum_candidate | DOT stationary cameras, MTA ABLE program, Better Buses program, full… |
| demographic_group | — | 24 | 0.03 | scalar_string | 4 | enum_candidate | Tier 1, Tier 2, Tier 3, Total |
| scenario | — | 24 | 0.03 | scalar_string | 3 | enum_candidate | existing_network, increase, proposed_network |
| mode | — | 20 | 0.02 | scalar_string | 3 | enum_candidate | subway, bus, paratransit |
| category | — | 19 | 0.02 | scalar_string | 14 | free_text | bus_frequency, bus_in_motion, bus_speed, stopped_at_bus_stops, very_s… |
| day_type | — | 18 | 0.02 | scalar_string | 4 | enum_candidate | weekday, saturday, sunday, weekend |
| borough | — | 16 | 0.02 | scalar_string | 6 | enum_candidate | Bronx, Manhattan, Queens, Staten Island, Brooklyn, Bronx/Manhattan |
| neighborhood | — | 16 | 0.02 | scalar_string | 6 | enum_candidate | Central Bronx, Co-op City, East Bronx, Harlem-125th, Highbridge, Soun… |
| units | — | 13 | 0.01 | scalar_string | 7 | enum_candidate | percent, dollars, miles, riders, riders per day, routes, USD |
| label | — | 12 | 0.01 | scalar_string | 3 | enum_candidate | post_busway, pre_busway_baseline, pre_busway |
| existing_stop_spacing_ft | — | 10 | 0.01 | number | 0 | numeric |  |
| proposed_stop_spacing_ft | — | 10 | 0.01 | number | 0 | numeric |  |
| stops_removed | — | 10 | 0.01 | number | 0 | numeric |  |
| total_stops | — | 10 | 0.01 | number | 0 | numeric |  |
| service_type | — | 9 | 0.01 | scalar_string | 4 | enum_candidate | express, Select Bus Service, express bus, local |
| value_unit | — | 9 | 0.01 | scalar_string | 3 | enum_candidate | percent, riders per day, seconds |
| comparison_period | — | 6 | 0.01 | scalar_string | 2 | enum_candidate | November 2024, October 2025 |
| existing_frequency_category | — | 6 | 0.01 | scalar_string | 2 | enum_candidate | 15-or-better, 30-or-better |
| perception | — | 6 | 0.01 | scalar_string | 3 | enum_candidate | faster, more_frequent, much_safer |
| pilot_value | — | 6 | 0.01 | number | 0 | numeric |  |
| pre_pilot_value | — | 6 | 0.01 | number | 0 | numeric |  |
| proposed_frequency_category | — | 6 | 0.01 | scalar_string | 3 | enum_candidate | 8-or-better, 15-or-better, 8-or-better (at Hunts Point only) |
| fine_tier | — | 5 | 0.01 | scalar_string | 5 | free_text | fifth and subsequent offenses, first offense, fourth offense, second… |
| frequency | — | 5 | 0.01 | scalar_string | 2 | enum_candidate | per_year, daily |
| location | — | 5 | 0.01 | scalar_string | 3 | enum_candidate | Bronx, New York City, Washington Heights and Inwood |
| location_normalized | — | 5 | 0.01 | object | 0 | structured |  |
| fine_period_months | — | 4 | 0.00 | number | 0 | numeric |  |
| subject | — | 4 | 0.00 | scalar_string | 3 | enum_candidate | NYC busways generally, Bx36 bus route, Tremont Avenue Busway |
| code | — | 3 | 0.00 | scalar_string | 3 | enum_candidate | A, T, W |
| value_note | — | 3 | 0.00 | scalar_string | 3 | enum_candidate | stated as 'more than 27,000', stated as 'nearly 25,000', stated as 'o… |
| date | — | 2 | 0.00 | scalar_string | 2 | enum_candidate | June 11, 2025, November 2019 |
| date_normalized | — | 2 | 0.00 | object | 0 | structured |  |
| days | — | 2 | 0.00 | scalar_string | 1 | enum_candidate | all |
| demographic | — | 2 | 0.00 | scalar_string | 2 | enum_candidate | pedestrians, seniors (62+) and persons with disabilities |
| denominator | — | 2 | 0.00 | number | 0 | numeric |  |
| provider | — | 2 | 0.00 | scalar_string | 2 | enum_candidate | broker, primary_carrier |
| temporal_context | — | 2 | 0.00 | scalar_string | 2 | enum_candidate | post-Busway, pre-Busway |
| value_direction | — | 2 | 0.00 | scalar_string | 1 | enum_candidate | increase |
| within_minutes | — | 2 | 0.00 | number | 0 | numeric |  |
| baseline_year | — | 1 | 0.00 | number | 0 | numeric |  |
| change | — | 1 | 0.00 | number | 0 | numeric |  |
| change_mom_pct | — | 1 | 0.00 | number | 0 | numeric |  |
| change_unit | — | 1 | 0.00 | scalar_string | 1 | sparse | percentage_points |
| change_yoy_pct | — | 1 | 0.00 | number | 0 | numeric |  |
| currency | — | 1 | 0.00 | scalar_string | 1 | sparse | USD |
| entity | — | 1 | 0.00 | scalar_string | 1 | sparse | New York City Transit |
| fiscal_year | — | 1 | 0.00 | scalar_string | 1 | sparse | FY2025 |
| goal | — | 1 | 0.00 | scalar_string | 1 | sparse | 95% |
| installed_since | — | 1 | 0.00 | number | 0 | numeric |  |
| meaning | — | 1 | 0.00 | scalar_string | 1 | sparse | Bus lane traffic direction code T |
| note | — | 1 | 0.00 | scalar_string | 1 | sparse | Table 1 total differs slightly from text total of 500,882 |
| numerator | — | 1 | 0.00 | number | 0 | numeric |  |
| proposed_rush_routes | — | 1 | 0.00 | number | 0 | numeric |  |
| routes | — | 1 | 0.00 | array_string | 2 | sparse | B44 SBS, M14 SBS |
| target | — | 1 | 0.00 | number | 0 | numeric |  |
| target_description | — | 1 | 0.00 | scalar_string | 1 | sparse | 1% below our goal of 95% |
| values | — | 1 | 0.00 | object | 0 | structured |  |
| year_over_year_change | — | 1 | 0.00 | scalar_string | 1 | sparse | 1.3% improvement |

### Enum candidates (proposed closures, derived from corpus)

- **direction** (79 occ, 10 distinct): `decline` | `decrease` | `eastbound` | `improvement` | `increase` | `northbound` | `southbound` | `unknown` | `westbound` | `westbound (greatest gains)`
  - counts: decrease×20, northbound×14, improvement×12, increase×10, westbound×8, eastbound×5, southbound×4, decline×3, unknown×2
- **value_max** (66 occ, 2 distinct): `2026-05-11T00:00:00.000` | `S79+`
  - counts: 2026-05-11T00:00:00.000×2
- **value_min** (63 occ, 2 distinct): `2019-10-07T00:00:00.000` | `B11`
  - counts: 2019-10-07T00:00:00.000×2
- **comparison** (52 occ, 12 distinct): `current_vs_pre_sbs` | `equivalent local routes` | `Fall_2012_to_Fall_2015` | `last_4_years` | `local buses` | `May 2019 vs May 2022` | `May_2014_to_May_2015` | `post_sbs` | `post_vs_pre_sbs` | `pre_sbs` | `subway riders 3.6%` | `year_over_year`
  - counts: May 2019 vs May 2022×13, post_vs_pre_sbs×13, pre_sbs×8, post_sbs×5, May_2014_to_May_2015×3, Fall_2012_to_Fall_2015×2, year_over_year×2
- **route_label** (43 occ, 8 distinct): `B60` | `Bx18A/B` | `Fare-Free Avg` | `M116` | `Q4` | `S46/S96` | `System` | `Systemwide`
  - counts: B60×7, Bx18A/B×7, M116×7, Q4×7, S46/S96×7, System×4, Fare-Free Avg×2, Systemwide×2
- **time_period** (31 occ, 9 distinct): `AM Peak (6-10 AM)` | `Daily` | `Dec-July (2021-2022)` | `Dec-July average (2017-2018, 2018-2019, 2019-2020, 2020-2021)` | `Midday (10AM-3PM)` | `PM peak` | `PM Peak (3-7 PM)` | `Sep 2022 – May 2023` | `Sep 2023 – May 2024`
  - counts: Daily×6, Dec-July (2021-2022)×5, Dec-July average (2017-2018, 2018-2019, 2019-2020, 2020-2021)×5, Sep 2022 – May 2023×5, PM Peak (3-7 PM)×3, AM Peak (6-10 AM)×2, Midday (10AM-3PM)×2, PM peak×2
- **column** (26 occ, 10 distinct): `Boro` | `Days` | `Direction` | `Hours` | `Lane_Color` | `Lane_Type` | `Lane_Type1` | `Lane_width` | `SBS_Route1` | `TrafDir`
  - counts: Boro×6, Direction×4, SBS_Route1×4, TrafDir×3, Lane_Type×2, Lane_Type1×2, Lane_width×2
- **source_system** (26 occ, 4 distinct): `Better Buses program` | `DOT stationary cameras` | `full bus lane automated enforcement program` | `MTA ABLE program`
  - counts: DOT stationary cameras×12, MTA ABLE program×12
- **demographic_group** (24 occ, 4 distinct): `Tier 1` | `Tier 2` | `Tier 3` | `Total`
  - counts: Tier 1×6, Tier 2×6, Tier 3×6, Total×6
- **scenario** (24 occ, 3 distinct): `existing_network` | `increase` | `proposed_network`
  - counts: existing_network×8, increase×8, proposed_network×8
- **mode** (20 occ, 3 distinct): `bus` | `paratransit` | `subway`
  - counts: subway×11, bus×5, paratransit×4
- **day_type** (18 occ, 4 distinct): `saturday` | `sunday` | `weekday` | `weekend`
  - counts: weekday×9, saturday×5, sunday×3
- **borough** (16 occ, 6 distinct): `Bronx` | `Bronx/Manhattan` | `Brooklyn` | `Manhattan` | `Queens` | `Staten Island`
  - counts: Bronx×4, Manhattan×3, Queens×3, Staten Island×3, Brooklyn×2
- **neighborhood** (16 occ, 6 distinct): `Central Bronx` | `Co-op City` | `East Bronx` | `Harlem-125th` | `Highbridge` | `Soundview`
  - counts: Central Bronx×4, Co-op City×4, East Bronx×2, Harlem-125th×2, Highbridge×2, Soundview×2
- **units** (13 occ, 7 distinct): `dollars` | `miles` | `percent` | `riders` | `riders per day` | `routes` | `USD`
  - counts: percent×5, dollars×3
- **label** (12 occ, 3 distinct): `post_busway` | `pre_busway` | `pre_busway_baseline`
  - counts: post_busway×5, pre_busway_baseline×5, pre_busway×2
- **service_type** (9 occ, 4 distinct): `express` | `express bus` | `local` | `Select Bus Service`
  - counts: express×4, Select Bus Service×3
- **value_unit** (9 occ, 3 distinct): `percent` | `riders per day` | `seconds`
  - counts: percent×7
- **comparison_period** (6 occ, 2 distinct): `November 2024` | `October 2025`
  - counts: November 2024×3, October 2025×3
- **existing_frequency_category** (6 occ, 2 distinct): `15-or-better` | `30-or-better`
  - counts: 15-or-better×5
- **perception** (6 occ, 3 distinct): `faster` | `more_frequent` | `much_safer`
  - counts: faster×2, more_frequent×2, much_safer×2
- **proposed_frequency_category** (6 occ, 3 distinct): `15-or-better` | `8-or-better` | `8-or-better (at Hunts Point only)`
  - counts: 8-or-better×4
- **frequency** (5 occ, 2 distinct): `daily` | `per_year`
  - counts: per_year×4
- **location** (5 occ, 3 distinct): `Bronx` | `New York City` | `Washington Heights and Inwood`
  - counts: Bronx×3
- **subject** (4 occ, 3 distinct): `Bx36 bus route` | `NYC busways generally` | `Tremont Avenue Busway`
  - counts: NYC busways generally×2
- **code** (3 occ, 3 distinct): `A` | `T` | `W`
- **value_note** (3 occ, 3 distinct): `stated as 'more than 27,000'` | `stated as 'nearly 25,000'` | `stated as 'over 30,000'`
- **date** (2 occ, 2 distinct): `June 11, 2025` | `November 2019`
- **days** (2 occ, 1 distinct): `all`
  - counts: all×2
- **demographic** (2 occ, 2 distinct): `pedestrians` | `seniors (62+) and persons with disabilities`
- **provider** (2 occ, 2 distinct): `broker` | `primary_carrier`
- **temporal_context** (2 occ, 2 distinct): `post-Busway` | `pre-Busway`
- **value_direction** (2 occ, 1 distinct): `increase`
  - counts: increase×2

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`baseline_year`, `borough`, `category`, `change`, `change_mom_pct`, `change_unit`, `change_yoy_pct`, `code`, `column`, `comparison`, `comparison_period`, `context`, `currency`, `date`, `date_normalized`, `day_type`, `days`, `demographic`, `demographic_group`, `denominator`, `description`, `direction`, `entity`, `existing_frequency_category`, `existing_stop_spacing_ft`, `fine_period_months`, `fine_tier`, `fiscal_year`, `frequency`, `goal`, `installed_since`, `label`, `location`, `location_normalized`, `meaning`, `mode`, `neighborhood`, `note`, `numerator`, `perception`, `period`, `pilot_value`, `pre_pilot_value`, `proposed_frequency_category`, `proposed_rush_routes`, `proposed_stop_spacing_ft`, `provider`, `route`, `route_label`, `routes`, `scenario`, `scope`, `service_type`, `source_system`, `stops_removed`, `subject`, `target`, `target_description`, `temporal_context`, `time_period`, `total_stops`, `unit`, `units`, `value_direction`, `value_note`, `value_unit`, `values`, `within_minutes`, `year`, `year_over_year_change`

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

## claim

submissions: 393 (accepted 375 / rejected 18)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| claim_text | yes | 362 | 0.92 | scalar_string | 349 | free_text | A 2025 report assessing corridor-level speed impacts of different bus… |
| description | yes | 204 | 0.52 | scalar_string | 183 | free_text | Key concern raised during door-to-door business outreach on May 17, 2… |
| statement | yes | 102 | 0.26 | scalar_string | 87 | free_text | monitoring_finding, business_concern, Data & Analytics team builds da… |
| column_name | — | 32 | 0.08 | scalar_string | 29 | free_text | Direction, Mid_Block, the_geom, Boro, Chron_ID_1, Days, Days_Code, Fa… |
| data_type | — | 32 | 0.08 | scalar_string | 3 | enum_candidate | text, number, multiline |
| field_name | — | 32 | 0.08 | scalar_string | 29 | free_text | direction, mid_block, the_geom, bltrafdir, boro, chron_id_1, days, da… |
| position | — | 32 | 0.08 | number | 0 | numeric |  |
| non_null_count | — | 29 | 0.07 | number | 0 | numeric |  |
| null_count | — | 29 | 0.07 | number | 0 | numeric |  |
| subject | — | 17 | 0.04 | scalar_string | 14 | free_text | redesign_plan, ABLE mobile cameras, DOT stationary cameras, fare_poli… |
| source | — | 15 | 0.04 | scalar_string | 3 | enum_candidate | bus rider survey, business outreach, DOT Street Ambassadors door-to-d… |
| route | — | 14 | 0.04 | scalar_string | 13 | free_text | Bx6 SBS, Bx11, Bx13, Bx23, Bx25, Bx36, Bx38, Bx4 |
| change_type | — | 12 | 0.03 | scalar_string | 5 | enum_candidate | reroute, maintain_existing, new_route, no_change, route_split |
| routes | — | 8 | 0.02 | array_string | 12 | free_text | Bx40, Bx42, Bx36, B44 SBS, Bx15, Bx28, Bx38, Bx5 |
| year | — | 7 | 0.02 | mixed | 1 | numeric | 2022 |
| existing | — | 6 | 0.02 | scalar_string | 2 | enum_candidate | 15-or-better, 30-or-better |
| largest_value | — | 6 | 0.02 | number | 0 | numeric |  |
| location | — | 6 | 0.02 | scalar_string | 5 | free_text | Throgs Neck, Grand Concourse, Norwood, Story Avenue, Tremont Avenue /… |
| location_normalized | — | 6 | 0.02 | object | 0 | structured |  |
| proposed | — | 6 | 0.02 | scalar_string | 2 | enum_candidate | 8-or-better, 15-or-better |
| bus_routes_count | — | 4 | 0.01 | number | 0 | numeric |  |
| claim_type | — | 4 | 0.01 | scalar_string | 3 | enum_candidate | violation_type, deployment_note, effectiveness |
| date_text | — | 4 | 0.01 | scalar_string | 1 | free_text | March 21 & 25, 2022 |
| date_text_normalized | — | 4 | 0.01 | object | 0 | structured |  |
| subway_lines | — | 4 | 0.01 | array_string | 22 | free_text | B, D, 1, 2, 4, 5, 6, A |
| capital_improvements | — | 3 | 0.01 | array_string | 4 | enum_candidate | bus bulbs, landscaped medians, pedestrian improvements, pedestrian me… |
| rail_connections | — | 3 | 0.01 | array_string | 3 | enum_candidate | LIRR, Metro-North, Metro-North Railroad |
| target_date | — | 3 | 0.01 | scalar_string | 3 | numeric | 2020, 2021, November 2019 |
| target_date_normalized | — | 3 | 0.01 | object | 0 | structured |  |
| text | yes | 3 | 0.01 | scalar_string | 3 | enum_candidate | Equity framework description, Equity Score Index methodology, Equity… |
| unit | — | 3 | 0.01 | scalar_string | 1 | enum_candidate | feet |
| features | — | 2 | 0.01 | array_string | 7 | free_text | off-board fare payment, dedicated bus lanes, limited stops, low-floor… |
| improvement_type | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | all_door_boarding, tap_and_go_payment |
| render_type | — | 2 | 0.01 | scalar_string | 1 | enum_candidate | multiline |
| timeline | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | 2018, late-2014/early-2015 |
| am_peak_minutes | — | 1 | 0.00 | number | 0 | numeric |  |
| corridors_scored | — | 1 | 0.00 | number | 0 | numeric |  |
| express_routes_modified | — | 1 | 0.00 | number | 0 | numeric |  |
| map_features | — | 1 | 0.00 | object | 0 | structured |  |
| midday_minutes | — | 1 | 0.00 | number | 0 | numeric |  |
| new_express_routes_added | — | 1 | 0.00 | number | 0 | numeric |  |
| new_routes_added | — | 1 | 0.00 | array_string | 2 | sparse | Bx25, M125 |
| new_streets | — | 1 | 0.00 | array_string | 3 | sparse | Bronx River Avenue, Bruckner Boulevard, Story Avenue |
| new_terminal | — | 1 | 0.00 | scalar_string | 1 | sparse | Turnbull and Pugsley avenues |
| pm_peak_minutes | — | 1 | 0.00 | number | 0 | numeric |  |
| policy_type | — | 1 | 0.00 | scalar_string | 1 | sparse | fare_policy |
| route_types | — | 1 | 0.00 | object | 0 | structured |  |
| routes_modified | — | 1 | 0.00 | number | 0 | numeric |  |
| sbs_connections | — | 1 | 0.00 | array_string | 2 | sparse | B44 Nostrand Ave SBS, B46 Utica Ave SBS |
| scope | — | 1 | 0.00 | scalar_string | 1 | sparse | at Hunts Point only |
| service_type | — | 1 | 0.00 | scalar_string | 1 | sparse | express_bus |
| service_window | — | 1 | 0.00 | scalar_string | 1 | sparse | 7:00am to 9:00pm |
| strategies | — | 1 | 0.00 | array_string | 7 | sparse | Balance Bus Stops, Enhance Connectivity, Expand Bus Priority with NYC… |
| streets | — | 1 | 0.00 | array_string | 3 | sparse | Bronx River Avenue, Bruckner Boulevard, Story Avenue |
| subway_lines_count | — | 1 | 0.00 | number | 0 | numeric |  |
| system | — | 1 | 0.00 | scalar_string | 1 | sparse | OMNY |
| tactics | — | 1 | 0.00 | array_string | 5 | sparse | balanced_stop_spacing, enhanced_connectivity, expanded_bus_priority,… |
| top_corridors_count | — | 1 | 0.00 | number | 0 | numeric |  |
| topic | — | 1 | 0.00 | scalar_string | 1 | sparse | truck_definition |
| total_express_routes_evaluated | — | 1 | 0.00 | number | 0 | numeric |  |
| total_routes_evaluated | — | 1 | 0.00 | number | 0 | numeric |  |

### Enum candidates (proposed closures, derived from corpus)

- **data_type** (32 occ, 3 distinct): `multiline` | `number` | `text`
  - counts: text×23, number×6, multiline×3
- **source** (15 occ, 3 distinct): `bus rider survey` | `business outreach` | `DOT Street Ambassadors door-to-door outreach`
  - counts: bus rider survey×6, business outreach×5, DOT Street Ambassadors door-to-door outreach×4
- **change_type** (12 occ, 5 distinct): `maintain_existing` | `new_route` | `no_change` | `reroute` | `route_split`
  - counts: reroute×5, maintain_existing×3, new_route×2
- **existing** (6 occ, 2 distinct): `15-or-better` | `30-or-better`
  - counts: 15-or-better×5
- **proposed** (6 occ, 2 distinct): `15-or-better` | `8-or-better`
  - counts: 8-or-better×5
- **claim_type** (4 occ, 3 distinct): `deployment_note` | `effectiveness` | `violation_type`
  - counts: violation_type×2
- **capital_improvements** (3 occ, 4 distinct): `bus bulbs` | `landscaped medians` | `pedestrian improvements` | `pedestrian medians`
  - counts: bus bulbs×3
- **rail_connections** (3 occ, 3 distinct): `LIRR` | `Metro-North` | `Metro-North Railroad`
- **text** (3 occ, 3 distinct): `Equity framework description` | `Equity Score Index methodology` | `Equity Tier 1/2/3 definitions`
- **unit** (3 occ, 1 distinct): `feet`
  - counts: feet×3
- **improvement_type** (2 occ, 2 distinct): `all_door_boarding` | `tap_and_go_payment`
- **render_type** (2 occ, 1 distinct): `multiline`
  - counts: multiline×2
- **timeline** (2 occ, 2 distinct): `2018` | `late-2014/early-2015`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`am_peak_minutes`, `bus_routes_count`, `capital_improvements`, `change_type`, `claim_type`, `column_name`, `corridors_scored`, `data_type`, `date_text`, `date_text_normalized`, `existing`, `express_routes_modified`, `features`, `field_name`, `improvement_type`, `largest_value`, `location`, `location_normalized`, `map_features`, `midday_minutes`, `new_express_routes_added`, `new_routes_added`, `new_streets`, `new_terminal`, `non_null_count`, `null_count`, `pm_peak_minutes`, `policy_type`, `position`, `proposed`, `rail_connections`, `render_type`, `route`, `route_types`, `routes`, `routes_modified`, `sbs_connections`, `scope`, `service_type`, `service_window`, `source`, `strategies`, `streets`, `subject`, `subway_lines`, `subway_lines_count`, `system`, `tactics`, `target_date`, `target_date_normalized`, `timeline`, `top_corridors_count`, `topic`, `total_express_routes_evaluated`, `total_routes_evaluated`, `unit`, `year`

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

## relation

submissions: 370 (accepted 354 / rejected 16)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| relation_kind | yes | 370 | 1.00 | scalar_string | 98 | free_text | has_timeline_event, serves_route, has_treatment_component, has_treatm… |
| subject_local_observation_id | yes | 370 | 1.00 | scalar_string | 114 | free_text | project_ace_automated_camera_enforcement, project_mta_open_data_progr… |
| object_local_observation_id | yes | 367 | 0.99 | scalar_string | 320 | free_text | entity_nyc_dot, entity_mta_nyct, entity_nyc-dot, project_open_data_pl… |
| description | — | 97 | 0.26 | scalar_string | 93 | free_text | ACE program expanded to five new bus routes, MTA Data & Analytics tea… |
| raw_relation_kind | — | 4 | 0.01 | scalar_string | 1 | enum_candidate | affects_route |
| routes_affected | — | 2 | 0.01 | array_string | 5 | free_text | Bx5, M100, M2, M4, M42 |
| contractor | — | 1 | 0.00 | scalar_string | 1 | sparse | Skanska |
| hotline | — | 1 | 0.00 | scalar_string | 1 | sparse | (929) 380-5778 |
| new_location | — | 1 | 0.00 | scalar_string | 1 | sparse | 90th Avenue |
| new_location_normalized | — | 1 | 0.00 | object | 0 | structured |  |
| old_location | — | 1 | 0.00 | scalar_string | 1 | sparse | Merrick Boulevard |
| old_location_normalized | — | 1 | 0.00 | object | 0 | structured |  |
| routes | — | 1 | 0.00 | array_string | 5 | sparse | Bx5, M100, M2, M4, M42 |

### Enum candidates (proposed closures, derived from corpus)

- **raw_relation_kind** (4 occ, 1 distinct): `affects_route`
  - counts: affects_route×4

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`contractor`, `description`, `hotline`, `new_location`, `new_location_normalized`, `old_location`, `old_location_normalized`, `raw_relation_kind`, `routes`, `routes_affected`

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

## route

submissions: 212 (accepted 212 / rejected 0)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| route_id | yes | 173 | 0.82 | scalar_string | 142 | free_text | B44, B60, Q43, Q70, B11, B25, B26, B42 |
| route_label | yes | 169 | 0.80 | scalar_string | 131 | free_text | Q43, B25, B26, B42, B60, B62, Q54, Q58 |
| route_name | yes | 80 | 0.38 | scalar_string | 79 | free_text | Q43, 125th-LaGuardia Airport Select Bus Service, 14th Street Select B… |
| borough | — | 78 | 0.37 | mixed | 5 | enum_candidate | Bronx, Brooklyn, Manhattan, Queens, Staten Island |
| description | — | 77 | 0.36 | scalar_string | 61 | free_text | Bronx-Manhattan express bus route serving 116th Street study area, Br… |
| route | yes | 66 | 0.31 | scalar_string | 56 | free_text | B25, B26, B42, B62, BX19, BX35, BX36, Q43 |
| streets | — | 61 | 0.29 | scalar_string | 61 | free_text | 1 Av / 2 Av, 116 St / Manhattan Av, 125 St / Astoria Blvd, 14 St, 21… |
| note | — | 26 | 0.12 | scalar_string | 3 | free_text | ABLE cameras operated on this route through 2023, in 60-day warning p… |
| program | — | 21 | 0.10 | scalar_string | 1 | enum_candidate | ABLE |
| routes | yes | 21 | 0.10 | array_string | 25 | free_text | M101, M102, M103, M14A, M14D, M98, Q1, Q10 |
| route_type | — | 18 | 0.08 | scalar_string | 6 | enum_candidate | express_bus, select_bus_service, Local, local_bus, Rush, limited_stop… |
| mode | — | 10 | 0.05 | scalar_string | 2 | enum_candidate | subway, bus |
| operator | — | 4 | 0.02 | scalar_string | 1 | enum_candidate | MTA |
| existing_route_length_miles | — | 3 | 0.01 | number | 0 | numeric |  |
| existing_stop_spacing_feet | — | 3 | 0.01 | number | 0 | numeric |  |
| existing_turns_per_mile | — | 3 | 0.01 | number | 0 | numeric |  |
| limits | — | 3 | 0.01 | scalar_string | 2 | enum_candidate | Rosedale to Jamaica, W 87th Street and West End Avenue to E 92nd Stre… |
| proposed_route_length_miles | — | 3 | 0.01 | number | 0 | numeric |  |
| proposed_stop_spacing_feet | — | 3 | 0.01 | number | 0 | numeric |  |
| proposed_turns_per_mile | — | 3 | 0.01 | number | 0 | numeric |  |
| related_existing_routes | — | 3 | 0.01 | array_string | 5 | free_text | B1, B3, B44, B44 SBS, B49 |
| route_type_proposed | — | 3 | 0.01 | scalar_string | 1 | enum_candidate | Local |
| service_description | — | 3 | 0.01 | scalar_string | 3 | free_text | Service between Bay Ridge and Manhattan Beach, Service between Bedfor… |
| agency | — | 2 | 0.01 | scalar_string | 1 | enum_candidate | Bee-Line Bus System |
| corridors | — | 2 | 0.01 | array_string | 2 | enum_candidate | Guy R Brewer Blvd, Merrick Blvd |
| status | — | 1 | 0.00 | scalar_string | 1 | sparse | proposed |

### Enum candidates (proposed closures, derived from corpus)

- **borough** (78 occ, 5 distinct): `Bronx` | `Brooklyn` | `Manhattan` | `Queens` | `Staten Island`
  - counts: Bronx×20, Brooklyn×20, Manhattan×20, Queens×15, Staten Island×4
- **program** (21 occ, 1 distinct): `ABLE`
  - counts: ABLE×21
- **route_type** (18 occ, 6 distinct): `express_bus` | `limited_stop_bus` | `Local` | `local_bus` | `Rush` | `select_bus_service`
  - counts: express_bus×6, select_bus_service×4, Local×3, local_bus×2, Rush×2
- **mode** (10 occ, 2 distinct): `bus` | `subway`
  - counts: subway×7, bus×3
- **operator** (4 occ, 1 distinct): `MTA`
  - counts: MTA×4
- **limits** (3 occ, 2 distinct): `Rosedale to Jamaica` | `W 87th Street and West End Avenue to E 92nd Street and York Avenue`
  - counts: Rosedale to Jamaica×2
- **route_type_proposed** (3 occ, 1 distinct): `Local`
  - counts: Local×3
- **agency** (2 occ, 1 distinct): `Bee-Line Bus System`
  - counts: Bee-Line Bus System×2
- **corridors** (2 occ, 2 distinct): `Guy R Brewer Blvd` | `Merrick Blvd`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`agency`, `borough`, `corridors`, `description`, `existing_route_length_miles`, `existing_stop_spacing_feet`, `existing_turns_per_mile`, `limits`, `mode`, `note`, `operator`, `program`, `proposed_route_length_miles`, `proposed_stop_spacing_feet`, `proposed_turns_per_mile`, `related_existing_routes`, `route_type`, `route_type_proposed`, `service_description`, `status`, `streets`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) B11
- (label ×2) B25
- (label ×2) B26
- (label ×2) B42
- (label ×2) B60
- (label ×2) B62
- (label ×2) Bx22
- (label ×2) Bx9
- (label ×2) M116
- (label ×2) M7
- (label ×2) Q43
- (label ×2) Q5
- (label ×2) Q54
- (label ×2) Q58
- (raw_text ×2) over 28,000 daily bus riders on the M34/M34A and numerous express buses

## event

submissions: 207 (accepted 200 / rejected 7)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| description | yes | 207 | 1.00 | scalar_string | 196 | free_text | Developed / Published Plan, Busway launched October 2021, Capital imp… |
| event_kind | yes | 207 | 1.00 | scalar_string | 93 | free_text | service_launch, publication, launch, milestone, implementation, meeti… |
| date_text | yes | 190 | 0.92 | scalar_string | 147 | free_text | 2024, 2023, 2019, October 3, 2019, 2025, October 2019, October 2021,… |
| date_text_normalized | — | 190 | 0.92 | object | 0 | structured |  |
| date | yes | 30 | 0.14 | scalar_string | 27 | free_text | 2019-10-03, 2023, 2008-01-01, 2011-03-25, 2011-05-12, 2011-06-14, 201… |
| date_normalized | — | 30 | 0.14 | object | 0 | structured |  |
| event_date | yes | 26 | 0.13 | scalar_string | 24 | free_text | December 2025, December 8, 2025, 2013-11-17, 2013-11-18, 2014-02, 201… |
| event_date_normalized | — | 26 | 0.13 | object | 0 | structured |  |
| year | — | 23 | 0.11 | number | 0 | numeric |  |
| event_name | — | 13 | 0.06 | scalar_string | 12 | free_text | Budget Press Tour, 168th St/Jamaica Interim Bus Terminal Opens, CUNY… |
| details | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | 16 agents deployed, 55 agents deployed |
| month | — | 2 | 0.01 | number | 0 | numeric |  |
| affected_boroughs | — | 1 | 0.00 | array_string | 2 | sparse | Manhattan, Queens |
| affected_routes | — | 1 | 0.00 | array_string | 4 | sparse | E, F, M, R |
| affected_stations | — | 1 | 0.00 | number | 0 | numeric |  |
| end_date_text | — | 1 | 0.00 | scalar_string | 1 | sparse | April 27, 2020 |
| end_date_text_normalized | — | 1 | 0.00 | object | 0 | structured |  |
| location | — | 1 | 0.00 | scalar_string | 1 | sparse | Washington, DC |
| location_normalized | — | 1 | 0.00 | object | 0 | structured |  |
| organizers | — | 1 | 0.00 | array_string | 2 | sparse | MTA, NYC DOT |
| participants | — | 1 | 0.00 | array_string | 3 | sparse | CM De La Rosa's office, NYC DOT, WHBID |
| riders_affected | — | 1 | 0.00 | number | 0 | numeric |  |
| start_date_text | — | 1 | 0.00 | scalar_string | 1 | sparse | April 2019 |
| start_date_text_normalized | — | 1 | 0.00 | object | 0 | structured |  |
| stations_affected | — | 1 | 0.00 | array_string | 2 | sparse | Atlantic Av-Barclays Ctr (2345), W 4 St-Wash Sq (ACEBDFM) |

### Enum candidates (proposed closures, derived from corpus)

- **details** (2 occ, 2 distinct): `16 agents deployed` | `55 agents deployed`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`affected_boroughs`, `affected_routes`, `affected_stations`, `date_normalized`, `date_text_normalized`, `details`, `end_date_text`, `end_date_text_normalized`, `event_date_normalized`, `event_name`, `location`, `location_normalized`, `month`, `organizers`, `participants`, `riders_affected`, `start_date_text`, `start_date_text_normalized`, `stations_affected`, `year`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) 181st Street Busway launched
- (label ×2) 34th Street Busway Community Outreach
- (label ×2) Hourly Subway and Bus Ridership datasets published in 2023
- (label ×2) Implementation
- (label ×2) Project Launch
- (raw_text ×2) capital improvements began in 2014
- (raw_text ×2) Implementation: Two phases aligned with regular seasonal service changes. Large-scale marketing and…
- (raw_text ×2) Off-board fare payment along the route began in November 2011

## entity

submissions: 194 (accepted 190 / rejected 4)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| entity_name | yes | 187 | 0.96 | scalar_string | 103 | free_text | New York City Department of Transportation, MTA New York City Transit… |
| entity_type | yes | 177 | 0.91 | scalar_string | 73 | free_text | government_agency, transit_agency, agency, person, government_officia… |
| agency_name | yes | 85 | 0.44 | scalar_string | 23 | free_text | NYC DOT, MTA, Metropolitan Transportation Authority, MTA New York Cit… |
| description | — | 36 | 0.19 | scalar_string | 35 | free_text | Automated Camera Enforcement program for bus lane enforcement, ASL in… |
| role | — | 23 | 0.12 | scalar_string | 20 | free_text | ACE program partner, partner_agency, publisher, ACE program administr… |
| title | — | 17 | 0.09 | scalar_string | 16 | free_text | Project Manager, Acting Chief, Operations Planning, Chief Customer Of… |
| acronym | — | 12 | 0.06 | scalar_string | 9 | free_text | MTA, NYCT, AAA, DOF, DOT, MTA Bus, NYPD, NYS ITS |
| name | yes | 12 | 0.06 | scalar_string | 12 | free_text | CDC Social Vulnerability Index, data.ny.gov, Demetrius Crichlow, Kath… |
| publisher | yes | 11 | 0.06 | mixed | 3 | enum_candidate | NYC DOT, NYC Comptroller, People Oriented Cities |
| operator | yes | 5 | 0.03 | mixed | 1 | free_text | MTA New York City Transit |
| jurisdiction | — | 4 | 0.02 | scalar_string | 1 | enum_candidate | New York State |
| organization | — | 4 | 0.02 | scalar_string | 3 | enum_candidate | Metropolitan Transportation Authority, New York State Assembly, New Y… |
| borough | — | 3 | 0.02 | scalar_string | 3 | enum_candidate | Brooklyn, Manhattan, Queens |
| data_source | — | 3 | 0.02 | boolean | 0 | boolean |  |
| agency | — | 2 | 0.01 | scalar_string | 2 | free_text | Metropolitan Transportation Authority (MTA), MTA New York City Transit |
| bus_depots | — | 2 | 0.01 | number | 0 | numeric |  |
| buses | — | 2 | 0.01 | mixed | 1 | enum_candidate | 5,800 |
| daily_passengers | — | 2 | 0.01 | number | 0 | numeric |  |
| employees | — | 2 | 0.01 | number | 0 | numeric |  |
| executive_director | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | Ben Furnas, Betsy Plum |
| office | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | New York City Comptroller, New York City Council |
| owner | yes | 2 | 0.01 | scalar_string | 2 | enum_candidate | New York City, New York State |
| parent_entity | — | 2 | 0.01 | scalar_string | 2 | free_text | Metropolitan Transportation Authority (MTA), New York City Comptrolle… |
| parent_organization | — | 2 | 0.01 | scalar_string | 1 | enum_candidate | Metropolitan Transportation Authority |
| role_in_source | — | 2 | 0.01 | scalar_string | 1 | free_text | co-lead of Jamaica Bus Improvement Study |
| shops_and_yards | — | 2 | 0.01 | number | 0 | numeric |  |
| subway_cars | — | 2 | 0.01 | mixed | 1 | enum_candidate | nearly 6,700 |
| subway_stations | — | 2 | 0.01 | number | 0 | numeric |  |
| track_miles | — | 2 | 0.01 | number | 0 | numeric |  |
| a_line | — | 1 | 0.01 | scalar_string | 1 | sparse | converted to all R179 and R211 cars |
| active_locations | — | 1 | 0.01 | scalar_string | 1 | sparse | over 15 locations across MTA |
| active_locations_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| bus_routes_covered | — | 1 | 0.01 | array_string | 1 | sparse | Bx12 |
| c_line | — | 1 | 0.01 | scalar_string | 1 | sparse | converted to all R179 and R211 cars |
| chair | — | 1 | 0.01 | scalar_string | 1 | sparse | Haeda Mihaltses |
| commissioner | — | 1 | 0.01 | scalar_string | 1 | sparse | Ydanis Rodriguez |
| daily_riders | — | 1 | 0.01 | scalar_string | 1 | sparse | nearly 10,000 |
| g_line | — | 1 | 0.01 | scalar_string | 1 | sparse | introducing R211s, entire fleet expected to be R211s later this year |
| location | — | 1 | 0.01 | scalar_string | 1 | sparse | Jamaica, Queens |
| location_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| members | — | 1 | 0.01 | array_string | 10 | sparse | Andrew Albert, Dan Garodnick, David Jones, Haeda Mihaltses, John Ross… |
| navilens_uses_ytd | — | 1 | 0.01 | scalar_string | 1 | sparse | over 45,000 |
| nearby_subway | — | 1 | 0.01 | scalar_string | 1 | sparse | 169th St F Station |
| notable_stations | — | 1 | 0.01 | array_string | 4 | sparse | Bleecker St/Broadway-Lafayette, Brooklyn Bridge-City Hall, Canal St,… |
| regions | — | 1 | 0.01 | array_string | 4 | sparse | Connecticut, Long Island, New York City, southeastern New York State |
| replaces | — | 1 | 0.01 | scalar_string | 1 | sparse | 165th Street Bus Terminal |
| routes_most_recently_added | — | 1 | 0.01 | array_string | 5 | sparse | Bx5, M100, M2, M4, M42 |
| routes_served | — | 1 | 0.01 | scalar_string | 1 | sparse | 10 MTA bus routes and five Nassau Inter-County Express bus routes |
| service_area_description | — | 1 | 0.01 | scalar_string | 1 | sparse | serving a population of 15.3 million people across a 5,000-square-mil… |
| service_area_population | — | 1 | 0.01 | number | 0 | numeric |  |
| service_area_sq_miles | — | 1 | 0.01 | number | 0 | numeric |  |
| short_name | — | 1 | 0.01 | scalar_string | 1 | sparse | MTA |
| stations_with_navilens | — | 1 | 0.01 | number | 0 | numeric |  |
| status | — | 1 | 0.01 | scalar_string | 1 | sparse | operational |
| subway_line_deployed | — | 1 | 0.01 | scalar_string | 1 | sparse | 6 line |
| successful_calls | — | 1 | 0.01 | scalar_string | 1 | sparse | over 200 in 3 months |
| teams | — | 1 | 0.01 | array_string | 4 | sparse | Customer Communications, Department of Buses, Government and Communit… |
| top_locations | — | 1 | 0.01 | array_string | 2 | sparse | 3 Stone Street, Penn Station |
| top_locations_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| url | — | 1 | 0.01 | scalar_string | 1 | sparse | data.ny.gov |

### Enum candidates (proposed closures, derived from corpus)

- **publisher** (11 occ, 3 distinct): `NYC Comptroller` | `NYC DOT` | `People Oriented Cities`
  - counts: NYC DOT×3
- **jurisdiction** (4 occ, 1 distinct): `New York State`
  - counts: New York State×4
- **organization** (4 occ, 3 distinct): `Metropolitan Transportation Authority` | `New York State Assembly` | `New York State Senate`
  - counts: Metropolitan Transportation Authority×2
- **borough** (3 occ, 3 distinct): `Brooklyn` | `Manhattan` | `Queens`
- **buses** (2 occ, 1 distinct): `5,800`
- **executive_director** (2 occ, 2 distinct): `Ben Furnas` | `Betsy Plum`
- **office** (2 occ, 2 distinct): `New York City Comptroller` | `New York City Council`
- **owner** (2 occ, 2 distinct): `New York City` | `New York State`
- **parent_organization** (2 occ, 1 distinct): `Metropolitan Transportation Authority`
  - counts: Metropolitan Transportation Authority×2
- **subway_cars** (2 occ, 1 distinct): `nearly 6,700`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`a_line`, `acronym`, `active_locations`, `active_locations_normalized`, `agency`, `borough`, `bus_depots`, `bus_routes_covered`, `buses`, `c_line`, `chair`, `commissioner`, `daily_passengers`, `daily_riders`, `data_source`, `description`, `employees`, `executive_director`, `g_line`, `jurisdiction`, `location`, `location_normalized`, `members`, `navilens_uses_ytd`, `nearby_subway`, `notable_stations`, `office`, `organization`, `parent_entity`, `parent_organization`, `regions`, `replaces`, `role`, `role_in_source`, `routes_most_recently_added`, `routes_served`, `service_area_description`, `service_area_population`, `service_area_sq_miles`, `shops_and_yards`, `short_name`, `stations_with_navilens`, `status`, `subway_cars`, `subway_line_deployed`, `subway_stations`, `successful_calls`, `teams`, `title`, `top_locations`, `top_locations_normalized`, `track_miles`, `url`

### Repeated labels / raw_text (source_labels candidates)

- (label ×9) Metropolitan Transportation Authority (MTA)
- (label ×4) MTA
- (label ×4) MTA New York City Transit
- (label ×3) MTA Bus Company
- (label ×3) MTA Data & Analytics Team
- (label ×3) NYC Department of Transportation
- (label ×2) ACE Program
- (label ×2) Demetrius Crichlow, President of New York City Transit
- (label ×2) Governor Kathy Hochul
- (label ×2) MTA - Metropolitan Transportation Authority
- (label ×2) MTA on 34th Street Busway
- (label ×2) New York City Department of Finance
- (label ×2) New York City Department of Transportation (NYC DOT)
- (label ×2) New York City Police Department (NYPD)
- (label ×2) New York City Transit (NYCT)
- (label ×2) New York State Legislature
- (label ×2) NYC Department of Transportation (NYC DOT)
- (label ×2) NYC DOT
- (label ×2) NYC DOT (as publisher of Busways page)
- (raw_text ×3) MTA
- (raw_text ×2) Demetrius Crichlow President New York City Transit
- (raw_text ×2) Governor Kathy Hochul and New York State Legislature enacted the MTA Open Data Law in 2021
- (raw_text ×2) MTA bus schedules, fare collection machines, fare enforcement, or general MTA issues (e.g., MetroCa…
- (raw_text ×2) NEW YORK CITY DOT
- (raw_text ×2) New York City Transit and MTA Bus operate all subways and buses in New York City. Our 45,000 employ…
- (raw_text ×2) The Metropolitan Transportation Authority is North America's largest transportation network, servin…

## table

submissions: 151 (accepted 149 / rejected 2)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| table_title | yes | 151 | 1.00 | scalar_string | 147 | free_text | Bus Customer Journey Time Performance by Borough, Congestion Relief Z… |
| rows | yes | 122 | 0.81 | object | 0 | structured |  |
| columns | yes | 116 | 0.77 | array_string | 250 | free_text | Route, Month, Percentage, Year, Pilot, Pre-Pilot, Category, Change (p… |
| caption | yes | 22 | 0.15 | scalar_string | 20 | free_text | Datasets published to support the launch of the Congestion Relief Zon… |
| description | — | 13 | 0.09 | scalar_string | 13 | free_text | Board action approval routing table, Dataset dictionary defining thre… |
| rows_count | — | 8 | 0.05 | number | 0 | numeric |  |
| table_name | yes | 6 | 0.04 | scalar_string | 6 | free_text | Bus Lanes, eastbound_access, express_bus_route_improvements, regular_… |
| page | — | 4 | 0.03 | number | 0 | numeric |  |
| period | — | 4 | 0.03 | scalar_string | 2 | enum_candidate | May 2025, January to May 2025 |
| row_count | — | 4 | 0.03 | number | 0 | numeric |  |
| source_note | — | 4 | 0.03 | scalar_string | 4 | free_text | Bus Lanes – Local Streets (NYC Open Data), Mayor's Management Report… |
| entities | — | 3 | 0.02 | array_string | 3 | enum_candidate | MTA Bus, New York City Transit, Staten Island Rail |
| title | yes | 3 | 0.02 | scalar_string | 3 | free_text | Finding Your New Route - Route Relationship Chart, NYC DOT Brooklyn B… |
| demographic | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | pedestrians, seniors (62+) and persons with disabilities |
| notes | — | 2 | 0.01 | scalar_string | 2 | free_text | Bx6 to be implemented in 2023 with Bx6 SBS alignment and Bx5 schedule… |
| rows_description | — | 2 | 0.01 | scalar_string | 2 | free_text | Weekday AM (8-9 AM) and Weekday PM (5-6 PM) travel times for east-wes… |
| table_number | — | 2 | 0.01 | scalar_string | 2 | numeric | 1, 2 |
| chair | — | 1 | 0.01 | scalar_string | 1 | sparse | Haeda Mihaltses |
| column_count | — | 1 | 0.01 | number | 0 | numeric |  |
| committee | — | 1 | 0.01 | scalar_string | 1 | sparse | New York City Transit Committee |
| date_range | — | 1 | 0.01 | scalar_string | 1 | sparse | June 2020 - May 2022 |
| governing_body | — | 1 | 0.01 | scalar_string | 1 | sparse | MTA Board of Directors |
| location | — | 1 | 0.01 | scalar_string | 1 | sparse | 181st St, Broadway to Amsterdam |
| location_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| members | — | 1 | 0.01 | array_string | 9 | sparse | Andrew Albert, Dan Garodnick, David Jones, John Ross 'JR' Rizzo, John… |
| nyct_non_reimbursable_actual | — | 1 | 0.01 | number | 0 | numeric |  |
| nyct_total_positions_actual | — | 1 | 0.01 | number | 0 | numeric |  |
| record_count | — | 1 | 0.01 | number | 0 | numeric |  |
| rows_partial_sample | — | 1 | 0.01 | object | 0 | structured |  |
| source | — | 1 | 0.01 | scalar_string | 1 | sparse | MTA |
| systemwide_average | — | 1 | 0.01 | scalar_string | 1 | sparse | 86.1% |
| top_ranked_count | — | 1 | 0.01 | number | 0 | numeric |  |
| total_corridors_studied | — | 1 | 0.01 | number | 0 | numeric |  |
| unit | — | 1 | 0.01 | scalar_string | 1 | sparse | percent |
| values | — | 1 | 0.01 | object | 0 | structured |  |

### Enum candidates (proposed closures, derived from corpus)

- **period** (4 occ, 2 distinct): `January to May 2025` | `May 2025`
  - counts: May 2025×3
- **entities** (3 occ, 3 distinct): `MTA Bus` | `New York City Transit` | `Staten Island Rail`
  - counts: MTA Bus×3, New York City Transit×3, Staten Island Rail×3
- **demographic** (2 occ, 2 distinct): `pedestrians` | `seniors (62+) and persons with disabilities`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`chair`, `column_count`, `committee`, `date_range`, `demographic`, `description`, `entities`, `governing_body`, `location`, `location_normalized`, `members`, `notes`, `nyct_non_reimbursable_actual`, `nyct_total_positions_actual`, `page`, `period`, `record_count`, `row_count`, `rows_count`, `rows_description`, `rows_partial_sample`, `source`, `source_note`, `systemwide_average`, `table_number`, `top_ranked_count`, `total_corridors_studied`, `unit`, `values`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) Jamaica Ave Busway Percentage Speed Change Pre-Busway and Post-Busway (May 2019 vs. May 2022)
- (raw_text ×2) Jamaica Ave Busway - Percentage Speed Change Pre-Busway and Post-Busway (May 2019 vs. May 2022)

## treatment_component

submissions: 149 (accepted 145 / rejected 4)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| treatment_kind | yes | 149 | 1.00 | scalar_string | 86 | free_text | bus_lane, bus_priority, enforcement, curb_management, route_type, tra… |
| description | yes | 147 | 0.99 | scalar_string | 146 | free_text | Beginning and end of busway blocks painted red with 'BUS TRUCK ONLY'… |
| locations | yes | 32 | 0.21 | mixed | 28 | free_text | 14th Street between 9th Avenue and 3rd Avenue, Jamaica, Queens, 14th… |
| locations_normalized | — | 31 | 0.21 | object | 0 | structured |  |
| component_kind | yes | 27 | 0.18 | scalar_string | 19 | free_text | driving_directions, physical_infrastructure, access_restriction, alte… |
| treatment_type | yes | 24 | 0.16 | scalar_string | 23 | free_text | new_bus_lane, automated_enforcement_and_police, bus_boarder, bus_queu… |
| component_type | yes | 18 | 0.12 | scalar_string | 18 | free_text | access_rule, automated_enforcement, bike_lane, bus_priority, busway_h… |
| location_text | — | 5 | 0.03 | scalar_string | 4 | enum_candidate | Along 14th Street, 13th Street and 5th Avenue, Six locations along 14… |
| normalized_location | — | 5 | 0.03 | object | 0 | structured |  |
| date_text | — | 4 | 0.03 | scalar_string | 4 | enum_candidate | December 2021, June 2021, October 2021, proposed as of June 2022 |
| date_text_normalized | — | 4 | 0.03 | object | 0 | structured |  |
| hours | — | 4 | 0.03 | scalar_string | 3 | free_text | 24/7, 6 AM – 10 PM / 7 days a week, 6 AM – 8 PM |
| time_of_day | — | 4 | 0.03 | scalar_string | 4 | enum_candidate | 10pm-6am, 6am-10pm, 6am-10pm daily, all times |
| corridor | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | Archer Avenue, Jamaica Avenue |
| direction | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | both directions, eastbound only |
| features | — | 2 | 0.01 | array_string | 8 | free_text | dedicated bus lanes, left-turn lanes, limited stops, low-floor three-… |
| limits | — | 2 | 0.01 | scalar_string | 2 | free_text | 150th St to 160th St, Sutphin Blvd to 168th St |
| local_access | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | allowed with next-right-turn requirement, none |
| pickup_dropoff | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | allowed throughout except westbound between 147th Pl and Sutphin Blvd… |
| street | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | Johnson Street, Smith Street / Jay Street |
| through_trips_allowed | — | 2 | 0.01 | scalar_string | 2 | enum_candidate | buses and emergency vehicles, buses, trucks, emergency vehicles |
| access_points | — | 1 | 0.01 | array_string | 2 | sparse | north, south |
| allowed_vehicles | — | 1 | 0.01 | array_string | 5 | sparse | Access-A-Ride vans, bicycles, buses, emergency vehicles, trucks with… |
| days | — | 1 | 0.01 | scalar_string | 1 | sparse | 7 days/week |
| end_date | — | 1 | 0.01 | scalar_string | 1 | sparse | 2024-08-31 |
| end_date_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| enforcement_authority | — | 1 | 0.01 | scalar_string | 1 | sparse | NYPD |
| enforcement_methods | — | 1 | 0.01 | array_string | 2 | sparse | automated cameras, traffic agents |
| left_turns | — | 1 | 0.01 | scalar_string | 1 | sparse | restricted except eastbound left at 153rd St |
| parking_loading | — | 1 | 0.01 | scalar_string | 1 | sparse | no parking nor loading eastbound between 150th St and 160th St |
| passenger_vehicles_allowed | — | 1 | 0.01 | boolean | 0 | boolean |  |
| restricted_to | — | 1 | 0.01 | array_string | 3 | sparse | bicycles, buses, trucks |
| restricted_vehicles | — | 1 | 0.01 | array_string | 2 | sparse | for-hire vehicles, passenger vehicles |
| start_date | — | 1 | 0.01 | scalar_string | 1 | sparse | 2023-09-24 |
| start_date_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| trucks_allowed | — | 1 | 0.01 | boolean | 0 | boolean |  |

### Enum candidates (proposed closures, derived from corpus)

- **location_text** (5 occ, 4 distinct): `13th Street and 5th Avenue` | `Along 14th Street` | `Six locations along 14th Street` | `Union Square area`
  - counts: Along 14th Street×2
- **date_text** (4 occ, 4 distinct): `December 2021` | `June 2021` | `October 2021` | `proposed as of June 2022`
- **time_of_day** (4 occ, 4 distinct): `10pm-6am` | `6am-10pm` | `6am-10pm daily` | `all times`
- **corridor** (2 occ, 2 distinct): `Archer Avenue` | `Jamaica Avenue`
- **direction** (2 occ, 2 distinct): `both directions` | `eastbound only`
- **local_access** (2 occ, 2 distinct): `allowed with next-right-turn requirement` | `none`
- **pickup_dropoff** (2 occ, 2 distinct): `allowed throughout except westbound between 147th Pl and Sutphin Blvd` | `permitted in westbound direction`
- **street** (2 occ, 2 distinct): `Johnson Street` | `Smith Street / Jay Street`
- **through_trips_allowed** (2 occ, 2 distinct): `buses and emergency vehicles` | `buses, trucks, emergency vehicles`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`access_points`, `allowed_vehicles`, `corridor`, `date_text`, `date_text_normalized`, `days`, `direction`, `end_date`, `end_date_normalized`, `enforcement_authority`, `enforcement_methods`, `features`, `hours`, `left_turns`, `limits`, `local_access`, `location_text`, `locations_normalized`, `normalized_location`, `parking_loading`, `passenger_vehicles_allowed`, `pickup_dropoff`, `restricted_to`, `restricted_vehicles`, `start_date`, `start_date_normalized`, `street`, `through_trips_allowed`, `time_of_day`, `trucks_allowed`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) 34th St Busway Signage and Markings

## project

submissions: 109 (accepted 106 / rejected 3)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| project_name | yes | 109 | 1.00 | scalar_string | 90 | free_text | Queens Bus Network Redesign, 14th Street Transit & Truck Priority Pil… |
| status | yes | 107 | 0.98 | scalar_string | 36 | free_text | proposed_2019, proposed, active, completed, study, ongoing, operation… |
| description | yes | 106 | 0.97 | scalar_string | 103 | free_text | A bus-mounted camera system that issues violations to vehicles occupy… |
| project_type | yes | 91 | 0.83 | scalar_string | 53 | free_text | new_bus_lane, busway, bus_network_redesign, bus_lane_upgrade, enforce… |
| daily_ridership | — | 24 | 0.22 | number | 0 | numeric |  |
| name | yes | 24 | 0.22 | scalar_string | 24 | free_text | 14th St, Ave A to Ave D, 42nd St, 12th Ave to FDR Dr, 96th St, Rivers… |
| routes_served | — | 24 | 0.22 | array_string | 106 | free_text | B103, B83, BM2, BM3, BM4, Q20A, Q20B, Q44 SBS |
| corridor_length_miles | — | 21 | 0.19 | number | 0 | numeric |  |
| borough | — | 19 | 0.17 | scalar_string | 5 | enum_candidate | Manhattan, Brooklyn, Queens, Bronx, Staten Island |
| location | — | 5 | 0.05 | scalar_string | 5 | free_text | 14th Street, Manhattan, Bronx, New York City, Church Avenue Station,… |
| location_normalized | — | 5 | 0.05 | object | 0 | structured |  |
| operator | — | 5 | 0.05 | scalar_string | 2 | enum_candidate | NYC DOT, MTA |
| duration | — | 4 | 0.04 | scalar_string | 3 | enum_candidate | one year, 18-month pilot, one-year pilot |
| publisher | — | 4 | 0.04 | scalar_string | 2 | enum_candidate | NYC Comptroller Brad Lander, People Oriented Cities |
| year | — | 3 | 0.03 | number | 0 | numeric |  |
| boroughs | — | 2 | 0.02 | array_string | 2 | enum_candidate | Brooklyn, Queens |
| completion_date | — | 2 | 0.02 | scalar_string | 2 | enum_candidate | November 25, 2025, summer 2017 |
| completion_date_normalized | — | 2 | 0.02 | object | 0 | structured |  |
| launch_date | — | 2 | 0.02 | scalar_string | 2 | enum_candidate | 2021-04-26, July 13, 2015 |
| launch_date_normalized | — | 2 | 0.02 | object | 0 | structured |  |
| start_date | — | 2 | 0.02 | scalar_string | 2 | enum_candidate | June 2016, June 2024 |
| start_date_normalized | — | 2 | 0.02 | object | 0 | structured |  |
| start_date_text | — | 2 | 0.02 | scalar_string | 2 | enum_candidate | October 24, 2021, October 3, 2019 |
| start_date_text_normalized | — | 2 | 0.02 | object | 0 | structured |  |
| agency | — | 1 | 0.01 | scalar_string | 1 | sparse | NYC DOT |
| authorizing_legislation | — | 1 | 0.01 | scalar_string | 1 | sparse | Chapter 489 of the Laws of 2021 |
| benefits | — | 1 | 0.01 | scalar_string | 1 | sparse | increased reliability, reduced delays, shorter travel times; 2.5 time… |
| bus_capacity | — | 1 | 0.01 | number | 0 | numeric |  |
| buses_equipped | — | 1 | 0.01 | number | 0 | numeric |  |
| capacity_per_month | — | 1 | 0.01 | number | 0 | numeric |  |
| community_meetings | — | 1 | 0.01 | scalar_string | 1 | sparse | nearly 300 outreach events since 2019 |
| completion_target_year | — | 1 | 0.01 | number | 0 | numeric |  |
| corridor | — | 1 | 0.01 | scalar_string | 1 | sparse | 79th Street |
| corridors | — | 1 | 0.01 | array_string | 2 | sparse | Archer Avenue, Jamaica Avenue |
| coverage_miles | — | 1 | 0.01 | number | 0 | numeric |  |
| csc_planned_additional | — | 1 | 0.01 | number | 0 | numeric |  |
| csc_target_total | — | 1 | 0.01 | number | 0 | numeric |  |
| csc_total_open | — | 1 | 0.01 | number | 0 | numeric |  |
| daily_customers_benefitted | — | 1 | 0.01 | number | 0 | numeric |  |
| expected_completion | — | 1 | 0.01 | scalar_string | 1 | sparse | summer of 2026 |
| expected_timeline | — | 1 | 0.01 | scalar_string | 1 | sparse | later in 2025 |
| express_routes_existing | — | 1 | 0.01 | number | 0 | numeric |  |
| express_routes_proposed | — | 1 | 0.01 | number | 0 | numeric |  |
| goals | — | 1 | 0.01 | array_string | 2 | sparse | Improve safety along a Vision Zero Priority corridor, Increase speeds… |
| implementation_target | — | 1 | 0.01 | scalar_string | 1 | sparse | spring 2012 |
| implementing_agency | — | 1 | 0.01 | scalar_string | 1 | sparse | NYCDOT |
| launch_date_text | — | 1 | 0.01 | scalar_string | 1 | sparse | October 24, 2021 |
| launch_date_text_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| lead_agency | — | 1 | 0.01 | scalar_string | 1 | sparse | NYC Department of Transportation |
| local_hiring_goal | — | 1 | 0.01 | scalar_string | 1 | sparse | 20% of NY State workforce from Southeast Queens |
| local_routes_existing | — | 1 | 0.01 | number | 0 | numeric |  |
| local_routes_proposed | — | 1 | 0.01 | number | 0 | numeric |  |
| new_location | — | 1 | 0.01 | scalar_string | 1 | sparse | 90th Avenue |
| new_location_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| noise_mitigation | — | 1 | 0.01 | scalar_string | 1 | sparse | sound-reducing walls along 107th Avenue and 165th Street |
| old_location | — | 1 | 0.01 | scalar_string | 1 | sparse | Merrick Boulevard |
| old_location_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| partner_agency | — | 1 | 0.01 | scalar_string | 1 | sparse | NYC Department of Design and Construction |
| partners | — | 1 | 0.01 | array_string | 2 | sparse | MTA, NYPD |
| phase | — | 1 | 0.01 | scalar_string | 1 | sparse | Draft Plan |
| phase_1_start_date | — | 1 | 0.01 | scalar_string | 1 | sparse | June 29, 2025 |
| phase_1_start_date_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| phase_2_start_date | — | 1 | 0.01 | scalar_string | 1 | sparse | August 31, 2025 |
| phase_2_start_date_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| program | — | 1 | 0.01 | scalar_string | 1 | sparse | Better Buses Restart |
| public_comments_received | — | 1 | 0.01 | scalar_string | 1 | sparse | more than 18,000 |
| publication_date | — | 1 | 0.01 | scalar_string | 1 | sparse | December 2022 |
| publication_date_normalized | — | 1 | 0.01 | object | 0 | structured |  |
| routes_covered | — | 1 | 0.01 | number | 0 | numeric |  |
| rush_routes_proposed | — | 1 | 0.01 | number | 0 | numeric |  |
| start_year | — | 1 | 0.01 | number | 0 | numeric |  |
| subway_lines | — | 1 | 0.01 | array_string | 2 | sparse | B, Q |
| sustainability_features | — | 1 | 0.01 | scalar_string | 1 | sparse | green roof, LEED certification standards, stormwater detention tanks… |
| total_routes_existing | — | 1 | 0.01 | number | 0 | numeric |  |
| total_routes_proposed | — | 1 | 0.01 | number | 0 | numeric |  |
| years_of_planning | — | 1 | 0.01 | number | 0 | numeric |  |

### Enum candidates (proposed closures, derived from corpus)

- **borough** (19 occ, 5 distinct): `Bronx` | `Brooklyn` | `Manhattan` | `Queens` | `Staten Island`
  - counts: Manhattan×7, Brooklyn×6, Queens×3, Bronx×2
- **operator** (5 occ, 2 distinct): `MTA` | `NYC DOT`
  - counts: NYC DOT×3, MTA×2
- **duration** (4 occ, 3 distinct): `18-month pilot` | `one year` | `one-year pilot`
  - counts: one year×2
- **publisher** (4 occ, 2 distinct): `NYC Comptroller Brad Lander` | `People Oriented Cities`
  - counts: NYC Comptroller Brad Lander×3
- **boroughs** (2 occ, 2 distinct): `Brooklyn` | `Queens`
  - counts: Brooklyn×2, Queens×2
- **completion_date** (2 occ, 2 distinct): `November 25, 2025` | `summer 2017`
- **launch_date** (2 occ, 2 distinct): `2021-04-26` | `July 13, 2015`
- **start_date** (2 occ, 2 distinct): `June 2016` | `June 2024`
- **start_date_text** (2 occ, 2 distinct): `October 24, 2021` | `October 3, 2019`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`agency`, `authorizing_legislation`, `benefits`, `borough`, `boroughs`, `bus_capacity`, `buses_equipped`, `capacity_per_month`, `community_meetings`, `completion_date`, `completion_date_normalized`, `completion_target_year`, `corridor`, `corridor_length_miles`, `corridors`, `coverage_miles`, `csc_planned_additional`, `csc_target_total`, `csc_total_open`, `daily_customers_benefitted`, `daily_ridership`, `duration`, `expected_completion`, `expected_timeline`, `express_routes_existing`, `express_routes_proposed`, `goals`, `implementation_target`, `implementing_agency`, `launch_date`, `launch_date_normalized`, `launch_date_text`, `launch_date_text_normalized`, `lead_agency`, `local_hiring_goal`, `local_routes_existing`, `local_routes_proposed`, `location`, `location_normalized`, `new_location`, `new_location_normalized`, `noise_mitigation`, `old_location`, `old_location_normalized`, `operator`, `partner_agency`, `partners`, `phase`, `phase_1_start_date`, `phase_1_start_date_normalized`, `phase_2_start_date`, `phase_2_start_date_normalized`, `program`, `public_comments_received`, `publication_date`, `publication_date_normalized`, `publisher`, `routes_covered`, `routes_served`, `rush_routes_proposed`, `start_date`, `start_date_normalized`, `start_date_text`, `start_date_text_normalized`, `start_year`, `subway_lines`, `sustainability_features`, `total_routes_existing`, `total_routes_proposed`, `year`, `years_of_planning`

### Repeated labels / raw_text (source_labels candidates)

- (label ×3) Queens Bus Network Redesign
- (label ×2) Automated Camera Enforcement (ACE)
- (label ×2) Behind Schedule Report (April 2025)
- (label ×2) Brooklyn Bus Network Redesign
- (label ×2) Jay Street Busway Pilot
- (raw_text ×2) Jay Street Busway Pilot Smith St./Livingston St. to Jay St./Tillary St.

## corridor

submissions: 74 (accepted 72 / rejected 2)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| corridor_name | yes | 74 | 1.00 | scalar_string | 54 | free_text | Tremont Avenue, 34th Street Busway, Jamaica Avenue, 116th Street, 14t… |
| limits | yes | 47 | 0.64 | scalar_string | 44 | free_text | 3rd Avenue to 8th Avenue (westbound) and 9th Avenue to 3rd Avenue (ea… |
| borough | — | 45 | 0.61 | scalar_string | 6 | enum_candidate | Manhattan, Brooklyn, Queens, Bronx, Staten Island, the Bronx |
| street | yes | 38 | 0.51 | scalar_string | 24 | free_text | 14th Street, Jamaica Avenue, 34th Street, Archer Avenue, Tremont Aven… |
| description | yes | 37 | 0.50 | scalar_string | 37 | free_text | 14th Street between 9th Avenue and 3rd Avenue designated as a Transit… |
| from | yes | 16 | 0.22 | scalar_string | 15 | free_text | Amsterdam Avenue, 3rd Avenue, 9th Avenue, Bainbridge Avenue, Broadway… |
| to | yes | 16 | 0.22 | scalar_string | 14 | free_text | Broadway, Southern Boulevard, 3rd Avenue, 8th Avenue, Amsterdam Avenu… |
| status | — | 12 | 0.16 | scalar_string | 4 | enum_candidate | Completed 2020, Future Plan, Planned, Present Implementation |
| corridor_length_mi | — | 10 | 0.14 | number | 0 | numeric |  |
| routes | — | 10 | 0.14 | array_string | 29 | free_text | Bx36, Bx3, Bx35, Bx11, Bx12, Bx12 SBS, Bx13, Bx17 |
| routes_served | — | 10 | 0.14 | array_string | 26 | free_text | Bx35, Bx36, Bx11, Bx12, Bx12 SBS, Bx13, Bx17, Bx18 |
| combined_daily_ridership | — | 9 | 0.12 | number | 0 | numeric |  |
| days | — | 9 | 0.12 | scalar_string | 2 | enum_candidate | seven days a week, Monday through Friday |
| hours | — | 9 | 0.12 | scalar_string | 5 | enum_candidate | 6am to 8pm, 24 hours a day, 6am to 10pm, 6am to 7pm, 7am to 7pm |
| local_access | — | 9 | 0.12 | scalar_string | 8 | free_text | may turn onto the busway from a side street but must turn at next ava… |
| streets | yes | 9 | 0.12 | array_string | 60 | free_text | 1st Avenue, 3rd Avenue, 86th Street, Broadway, Fordham Road, 125th St… |
| through_access_vehicles | — | 9 | 0.12 | array_string | 6 | enum_candidate | buses, emergency vehicles, trucks, Access-A-Ride vans, bicycles, buse… |
| boroughs | — | 3 | 0.04 | array_string | 4 | enum_candidate | Manhattan, Queens, Brooklyn, Bronx |
| bus_routes | — | 3 | 0.04 | number | 0 | numeric |  |
| daily_ridership_hours | — | 3 | 0.04 | scalar_string | 2 | enum_candidate | All Days, 6AM-8PM, All Days, 24/7 |
| direction | — | 3 | 0.04 | scalar_string | 2 | enum_candidate | both directions, eastbound only |
| ridership | — | 3 | 0.04 | number | 0 | numeric |  |
| ridership_text | — | 3 | 0.04 | scalar_string | 2 | enum_candidate | 139,000 daily riders, 189,000 daily riders |
| routes_note | — | 3 | 0.04 | scalar_string | 1 | free_text | Routes running between Sutphin Blvd & 168 St only |
| busway_launch_date | — | 2 | 0.03 | scalar_string | 1 | enum_candidate | October 24, 2021 |
| busway_launch_date_normalized | — | 2 | 0.03 | object | 0 | structured |  |
| pickup_dropoff | — | 2 | 0.03 | scalar_string | 2 | enum_candidate | allowed throughout except Jamaica Ave westbound between 147th Pl and… |
| regulation_text | — | 2 | 0.03 | scalar_string | 1 | free_text | 24 hours a day/7 days a week |
| restrictions | — | 2 | 0.03 | scalar_string | 2 | free_text | No parking nor loading access along busway, truck loading zones are p… |
| through_trips | — | 2 | 0.03 | scalar_string | 2 | free_text | buses and emergency vehicles only, buses, trucks, emergency vehicles… |
| borrow | — | 1 | 0.01 | scalar_string | 1 | sparse | Manhattan |
| daily_ridership | — | 1 | 0.01 | number | 0 | numeric |  |
| eastbound_limits | — | 1 | 0.01 | scalar_string | 1 | sparse | Third Avenue to Southern Boulevard |
| features | — | 1 | 0.01 | scalar_string | 1 | sparse | Enhanced protected bicycle lanes on Jay Street and Smith Street |
| left_turns | — | 1 | 0.01 | scalar_string | 1 | sparse | restricted except eastbound left at 153rd St |
| length_miles | — | 1 | 0.01 | number | 0 | numeric |  |
| limits_northbound | — | 1 | 0.01 | scalar_string | 1 | sparse | Main Street between Sanford Avenue and Northern Boulevard |
| limits_southbound | — | 1 | 0.01 | scalar_string | 1 | sparse | Main Street between Sanford Avenue and 37th Avenue |
| neighborhoods | — | 1 | 0.01 | array_string | 2 | sparse | Inwood, Washington Heights |
| parking_loading | — | 1 | 0.01 | scalar_string | 1 | sparse | no parking nor loading access eastbound between 150th St and 160th St |
| pre_busway_speed_range | — | 1 | 0.01 | scalar_string | 1 | sparse | 5.3 to 6.1 MPH (PM) |
| trucks_allowed | — | 1 | 0.01 | scalar_string | 1 | sparse | not allowed eastbound |
| westbound_limits | — | 1 | 0.01 | scalar_string | 1 | sparse | Southern Boulevard to Belmont Avenue |

### Enum candidates (proposed closures, derived from corpus)

- **borough** (45 occ, 6 distinct): `Bronx` | `Brooklyn` | `Manhattan` | `Queens` | `Staten Island` | `the Bronx`
  - counts: Manhattan×14, Brooklyn×11, Queens×11, Bronx×6, Staten Island×2
- **status** (12 occ, 4 distinct): `Completed 2020` | `Future Plan` | `Planned` | `Present Implementation`
  - counts: Completed 2020×4, Future Plan×4, Planned×2, Present Implementation×2
- **days** (9 occ, 2 distinct): `Monday through Friday` | `seven days a week`
  - counts: seven days a week×8
- **hours** (9 occ, 5 distinct): `24 hours a day` | `6am to 10pm` | `6am to 7pm` | `6am to 8pm` | `7am to 7pm`
  - counts: 6am to 8pm×3, 24 hours a day×2, 6am to 10pm×2
- **through_access_vehicles** (9 occ, 6 distinct): `Access-A-Ride vans` | `bicycles` | `buses` | `buses only` | `emergency vehicles` | `trucks`
  - counts: buses×8, emergency vehicles×8, trucks×7, Access-A-Ride vans×2, bicycles×2
- **boroughs** (3 occ, 4 distinct): `Bronx` | `Brooklyn` | `Manhattan` | `Queens`
  - counts: Manhattan×4, Queens×4, Brooklyn×3, Bronx×2
- **daily_ridership_hours** (3 occ, 2 distinct): `All Days, 24/7` | `All Days, 6AM-8PM`
  - counts: All Days, 6AM-8PM×2
- **direction** (3 occ, 2 distinct): `both directions` | `eastbound only`
  - counts: both directions×2
- **ridership_text** (3 occ, 2 distinct): `139,000 daily riders` | `189,000 daily riders`
  - counts: 139,000 daily riders×2
- **busway_launch_date** (2 occ, 1 distinct): `October 24, 2021`
  - counts: October 24, 2021×2
- **pickup_dropoff** (2 occ, 2 distinct): `allowed throughout except Jamaica Ave westbound between 147th Pl and Sutphin Blvd` | `permitted in westbound direction`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`borough`, `boroughs`, `borrow`, `bus_routes`, `busway_launch_date`, `busway_launch_date_normalized`, `combined_daily_ridership`, `corridor_length_mi`, `daily_ridership`, `daily_ridership_hours`, `days`, `direction`, `eastbound_limits`, `features`, `hours`, `left_turns`, `length_miles`, `limits_northbound`, `limits_southbound`, `local_access`, `neighborhoods`, `parking_loading`, `pickup_dropoff`, `pre_busway_speed_range`, `regulation_text`, `restrictions`, `ridership`, `ridership_text`, `routes`, `routes_note`, `routes_served`, `status`, `through_access_vehicles`, `through_trips`, `trucks_allowed`, `westbound_limits`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) Jamaica Avenue, Queens

## source

submissions: 42 (accepted 40 / rejected 2)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| publisher | — | 41 | 0.98 | scalar_string | 15 | free_text | NYC DOT, MTA, MTA New York City Transit, NYC Department of Transporta… |
| description | — | 21 | 0.50 | scalar_string | 20 | free_text | Schema definition with column names, data types, descriptions, and ca… |
| title | — | 21 | 0.50 | scalar_string | 21 | free_text | 14th Street Busway, 14th Street Transit & Truck Priority Pilot Projec… |
| source_id | — | 13 | 0.31 | scalar_string | 13 | free_text | 14th_street_busway, 161st_bx6_capital_project_2026, 181st_street_jun2… |
| source_type | — | 12 | 0.29 | scalar_string | 9 | free_text | webpage, data_dictionary, brochure, dataset_dictionary, evaluation_re… |
| document_type | — | 10 | 0.24 | scalar_string | 9 | free_text | bus_network_redesign_plan, addendum, annual update / open data plan,… |
| document_date | — | 8 | 0.19 | scalar_string | 7 | free_text | 2025, 2016-06, 2020-07, 2022-06-23, 2022-12-01, 2025-09, 2026-01-27 |
| document_date_normalized | — | 8 | 0.19 | object | 0 | structured |  |
| source_url | — | 8 | 0.19 | scalar_string | 8 | free_text | https://capitaldashboard.mta.info/, https://www.mta.info/document/173… |
| source_name | — | 7 | 0.17 | scalar_string | 6 | free_text | Queens Bus Network Redesign Proposed Final Plan, 14th Street Transit… |
| content_type | — | 6 | 0.14 | scalar_string | 3 | enum_candidate | text/html, application/pdf, html |
| source_title | — | 6 | 0.14 | scalar_string | 6 | free_text | 14th Street Transit & Truck Priority Pilot Project Quarterly Report W… |
| url | — | 6 | 0.14 | scalar_string | 6 | free_text | https://comptroller.nyc.gov, https://www.mta.info/open-data, https://… |
| year | — | 6 | 0.14 | number | 0 | numeric |  |
| date | — | 5 | 0.12 | scalar_string | 4 | enum_candidate | June 2025, 2022-04-18, December 2025, Winter 2020 |
| date_normalized | — | 5 | 0.12 | object | 0 | structured |  |
| date_text | — | 4 | 0.10 | scalar_string | 4 | enum_candidate | April 2019, Fall 2019, November 2021, November 2022 |
| date_text_normalized | — | 4 | 0.10 | object | 0 | structured |  |
| document_kind | — | 3 | 0.07 | scalar_string | 3 | enum_candidate | equity_evaluation, final_plan, monitoring_report |
| document_title | — | 3 | 0.07 | scalar_string | 3 | free_text | Bronx Bus Network Redesign Final Plan, METROPOLITAN TRANSPORTATION AU… |
| prepared_for | — | 3 | 0.07 | scalar_string | 3 | free_text | June 2025 meeting of the New York City Transit & Bus Committee, NYCDO… |
| retrieved_at | — | 3 | 0.07 | scalar_string | 1 | enum_candidate | 2026-05-25T22:21:55.189Z |
| dataset_name | — | 2 | 0.05 | scalar_string | 1 | enum_candidate | Bus Lanes |
| format | — | 2 | 0.05 | scalar_string | 1 | free_text | JSON data dictionary (Socrata API column metadata) |
| publication_date | — | 2 | 0.05 | scalar_string | 2 | enum_candidate | 2026-03-24, October 2019 |
| publication_date_normalized | — | 2 | 0.05 | object | 0 | structured |  |
| record_count | — | 2 | 0.05 | number | 0 | numeric |  |
| report_type | — | 2 | 0.05 | scalar_string | 2 | enum_candidate | performance evaluation, preliminary report |
| source_kind | — | 2 | 0.05 | scalar_string | 2 | enum_candidate | brochure, webpage |
| total_blocks | — | 2 | 0.05 | number | 0 | numeric |  |
| total_pages | — | 2 | 0.05 | number | 0 | numeric |  |
| author | — | 1 | 0.02 | scalar_string | 1 | sparse | Sarah Meyer, Chief Customer Officer |
| commissioner | — | 1 | 0.02 | scalar_string | 1 | sparse | Ydanis Rodriguez |
| coverage_period | — | 1 | 0.02 | scalar_string | 1 | sparse | 2022-2023 |
| date_prepared | — | 1 | 0.02 | scalar_string | 1 | sparse | June 23, 2025 |
| event | — | 1 | 0.02 | scalar_string | 1 | sparse | Community Advisory Board Meeting |
| language | — | 1 | 0.02 | scalar_string | 1 | sparse | en |
| location | — | 1 | 0.02 | scalar_string | 1 | sparse | 2 Broadway, New York, NY 10004 |
| location_normalized | — | 1 | 0.02 | object | 0 | structured |  |
| program | — | 1 | 0.02 | scalar_string | 1 | sparse | Better Buses Restart |
| project | — | 1 | 0.02 | scalar_string | 1 | sparse | Queens Bus Network Redesign |
| publication_date_text | — | 1 | 0.02 | scalar_string | 1 | sparse | April 2025 |
| publication_date_text_normalized | — | 1 | 0.02 | object | 0 | structured |  |
| publication_name | — | 1 | 0.02 | scalar_string | 1 | sparse | 34th Street Busway |
| series | — | 1 | 0.02 | scalar_string | 1 | sparse | Better Buses |
| source_date | — | 1 | 0.02 | scalar_string | 1 | sparse | 2025 |
| source_date_normalized | — | 1 | 0.02 | object | 0 | structured |  |
| source_group | — | 1 | 0.02 | scalar_string | 1 | sparse | open_data_plan |
| source_label | — | 1 | 0.02 | scalar_string | 1 | sparse | Better Buses Restart: Jamaica Busway Monitoring Update – November 2022 |
| status | — | 1 | 0.02 | scalar_string | 1 | sparse | loading_placeholder_only |

### Enum candidates (proposed closures, derived from corpus)

- **content_type** (6 occ, 3 distinct): `application/pdf` | `html` | `text/html`
  - counts: text/html×3, application/pdf×2
- **date** (5 occ, 4 distinct): `2022-04-18` | `December 2025` | `June 2025` | `Winter 2020`
  - counts: June 2025×2
- **date_text** (4 occ, 4 distinct): `April 2019` | `Fall 2019` | `November 2021` | `November 2022`
- **document_kind** (3 occ, 3 distinct): `equity_evaluation` | `final_plan` | `monitoring_report`
- **retrieved_at** (3 occ, 1 distinct): `2026-05-25T22:21:55.189Z`
  - counts: 2026-05-25T22:21:55.189Z×3
- **dataset_name** (2 occ, 1 distinct): `Bus Lanes`
  - counts: Bus Lanes×2
- **publication_date** (2 occ, 2 distinct): `2026-03-24` | `October 2019`
- **report_type** (2 occ, 2 distinct): `performance evaluation` | `preliminary report`
- **source_kind** (2 occ, 2 distinct): `brochure` | `webpage`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`author`, `commissioner`, `content_type`, `coverage_period`, `dataset_name`, `date`, `date_normalized`, `date_prepared`, `date_text`, `date_text_normalized`, `description`, `document_date`, `document_date_normalized`, `document_kind`, `document_title`, `document_type`, `event`, `format`, `language`, `location`, `location_normalized`, `prepared_for`, `program`, `project`, `publication_date`, `publication_date_normalized`, `publication_date_text`, `publication_date_text_normalized`, `publication_name`, `publisher`, `record_count`, `report_type`, `retrieved_at`, `series`, `source_date`, `source_date_normalized`, `source_group`, `source_id`, `source_kind`, `source_label`, `source_name`, `source_title`, `source_type`, `source_url`, `status`, `title`, `total_blocks`, `total_pages`, `url`, `year`

### Repeated labels / raw_text (source_labels candidates)

- (label ×2) NYC DOT Bus Lanes Dataset Dictionary
- (label ×2) Queens Bus Network Redesign Proposed Final Plan
- (raw_text ×2) NYC DOT Bus Lanes Dataset Columns — data dictionary / schema definition for the Bus Lanes dataset o…

## source_gap

submissions: 4 (accepted 4 / rejected 0)

### Fields

| field | anchor | occ | coverage | value_kind | distinct | classification | samples |
| --- | --- | --- | --- | --- | --- | --- | --- |
| description | yes | 4 | 1.00 | scalar_string | 4 | free_text | 2024 legislation added new reporting requirements not yet collected f… |
| gap_kind | yes | 4 | 1.00 | scalar_string | 4 | enum_candidate | data_collection_suspension, data_not_collected, data_unavailable, def… |
| missing_information | yes | 4 | 1.00 | scalar_string | 4 | free_text | Bus speeds, reliability, and ridership before and after implementatio… |
| gap_text | yes | 3 | 0.75 | scalar_string | 3 | free_text | As a Vision Zero Priority Corridor, crash data will be reported in su… |
| affected_period | — | 1 | 0.25 | scalar_string | 1 | sparse | 2022-2023 |

### Enum candidates (proposed closures, derived from corpus)

- **gap_kind** (4 occ, 4 distinct): `data_collection_suspension` | `data_not_collected` | `data_unavailable` | `deferred_data`

### Keys outside declared anchors

These payload keys are not in `REQUIRED_PAYLOAD_ANCHORS` for this kind. High-coverage keys are schema-promotion candidates; rare ones are escape-hatch (`raw_*`/`notes`/`other_*`) candidates.

`affected_period`

## Reviewer Task

This is a diagnostic feed for tightening `mta_submit_observation` payload typing. Suggest only — do not enforce here.

For each enum candidate: confirm whether the proposed closure is complete (`other` + `other_type_text` escape hatch), or whether values should be normalized/merged. For each key outside declared anchors: classify as promote-to-schema, alias-of-existing, escape-hatch, or drop. Stage proposals under `data/identity-review/llm-suggestions/`; land them as warn-mode normalizers before any hard-reject.

