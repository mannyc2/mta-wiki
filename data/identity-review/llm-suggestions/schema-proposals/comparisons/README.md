# Schema-proposal comparison: Flash vs Pro

Both runs propose payload schemas for the same schema-audit corpus, under the same
deferred-closure contract. Staged set on disk is **Pro**; this preserves the **Flash**
run (`flash-snapshot/`) and the diff so its findings are not lost.

- Flash: run `2026-06-08T23-05-26` — `pioneer/deepseek-ai/DeepSeek-V4-Flash` (thinkingLevel high)
- Pro:   run `2026-06-08T23-16-38` — `deepseek/deepseek-v4-pro` (thinkingLevel high)
- Both: 12/12 valid, 0 schema issues.

## Aggregate

| metric | Flash | Pro |
| --- | --- | --- |
| enum | 62 | 58 |
| needs_more_data | 7 | 17 |
| free_text | 35 | 31 |
| drop | 4 | 3 |
| structured | 1 | 0 |
| real normalizations (from!=to) | 124 | 146 |
| relation_context reclassifications | 32 | 21 |

**Read:** Pro is more conservative on thin data (more needs_more_data) yet normalizes
more thoroughly within the enums it keeps (more mappings from fewer enums), and
surfaces fewer relation_context candidates.

## Verdict

- **Pro wins on normalization consistency.** `route.route_type`: Flash left `express_bus`/
  `limited_stop_bus` un-normalized; Pro applied snake_case uniformly (`express`, `limited_stop`).
- **Pro is more disciplined on thin evidence** — defers single-occurrence fields instead of
  forcing an enum/relation classification.
- **Watch-item: Pro under-surfaces relation_context candidates.** It dropped/deferred project's
  `program`/`lead_agency`/`partner_agency` that Flash flagged as relation_context — Pro's
  rationales show it understands them (program: "relation context... one occurrence") but
  won't commit on one sample. When ratifying, cross-reference Flash's list below.
- The earlier entity junk-enum problem (`buses`/`subway_cars`) was a max-thinking (xhigh)
  artifact; both Flash-high and Pro correctly mark them free_text.

## Decision changes (Flash -> Pro)

**claim**
- `render_type`: enum -> needs_more_data
- `unit`: enum -> needs_more_data

**corridor**
- `boroughs`: drop -> enum
- `busway_launch_date`: structured -> drop
- `daily_ridership_hours`: needs_more_data -> enum
- `ridership_text`: free_text -> drop

**entity**
- `office`: needs_more_data -> free_text
- `parent_organization`: enum -> needs_more_data

**event**
- `details`: needs_more_data -> free_text

**metric_claim**
- `column`: free_text -> enum
- `days`: enum -> needs_more_data
- `demographic`: free_text -> needs_more_data
- `location`: enum -> free_text
- `provider`: enum -> needs_more_data
- `subject`: free_text -> needs_more_data
- `temporal_context`: enum -> needs_more_data
- `time_period`: free_text -> enum
- `value_direction`: enum -> needs_more_data

**project**
- `duration`: enum -> needs_more_data
- `publisher`: enum -> needs_more_data
- `start_date_text`: drop -> free_text

**route**
- `route_type_proposed`: enum -> needs_more_data

**source**
- `dataset_name`: free_text -> needs_more_data

**table**
- `demographic`: needs_more_data -> enum
- `period`: needs_more_data -> enum

**treatment_component**
- `direction`: free_text -> needs_more_data
- `local_access`: free_text -> needs_more_data
- `through_trips_allowed`: drop -> free_text
- `time_of_day`: free_text -> enum

## relation_context reclassifications by kind

| kind | Flash | Pro |
| --- | --- | --- |
| claim | column_name, field_name, non_null_count, null_count, position | — |
| entity | agency | — |
| event | — | organizers, participants |
| metric_claim | — | context |
| project | agency, implementing_agency, lead_agency, partner_agency, partners, program | — |
| relation | contractor, hotline, new_location, new_location_normalized, old_location, old_location_normalized, routes, routes_affected | contractor, hotline |
| route | — | related_existing_routes |
| source | author, commissioner, event, prepared_for, program, project, publication_name, series | author, commissioner, event, location, prepared_for, program, project, publication_name, series |
| table | chair, committee, governing_body, members | chair, committee, governing_body, members, source |
| treatment_component | — | enforcement_authority |

