# Ontology Normalization Audit - 2026-06-08

This audit reviews the recent payload schema proposal work in
`data/identity-review/llm-suggestions/schema-proposals/` against the current
submission journals, canonical JSONL, validators, and ontology code.

Goal: increase normalization while preserving raw passthrough until feature
extraction is complete.

## Snapshot

Validation baseline at review time:

```text
Submissions: 2807
Accepted submissions: 2716
Canonical records: 2476
Wiki pages: 387
Validation issues: 0
```

Canonical records by kind:

| kind | records |
| --- | ---: |
| metric_claim | 868 |
| claim | 374 |
| relation | 354 |
| event | 200 |
| table | 149 |
| treatment_component | 145 |
| route | 122 |
| project | 88 |
| entity | 84 |
| corridor | 48 |
| source | 40 |
| source_gap | 4 |

Schema proposal aggregate for the staged Pro run:

| proposal class | count |
| --- | ---: |
| enum field proposals | 58 |
| free_text field proposals | 31 |
| needs_more_data field proposals | 17 |
| drop field proposals | 3 |
| promote_field key dispositions | 143 |
| drop key dispositions | 82 |
| needs_more_data key dispositions | 74 |
| relation_context key dispositions | 21 |
| alias key dispositions | 16 |
| promote_enum key dispositions | 9 |

Accepted-only stress test:

| check | result |
| --- | ---: |
| proposed enums with fewer than 10 accepted observations | 34 / 58 |
| proposed enums with zero accepted observations | 2 / 58 |
| proposed enums over mixed-type fields | 2 / 58 |
| promote_field dispositions with fewer than 5 accepted observations | 93 / 143 |

## Findings

### 1. Accepted-only and canonical views must gate enforcement

The current schema audit intentionally counts all submissions, accepted and
rejected. That is useful for discovery, but it is not safe as an enforcement
basis.

Concrete example: Pro proposes enum mappings for:

| field | all observed | accepted observed | rejected observed |
| --- | ---: | ---: | ---: |
| `metric_claim.existing_frequency_category` | 6 | 0 | 6 |
| `metric_claim.proposed_frequency_category` | 6 | 0 | 6 |

These fields came entirely from rejected submissions. They can stay in the
discovery feed, but should not become validation rules or canonical schema
without accepted/canonical evidence.

Recommendation:

- Keep `schema-audit` as a broad discovery audit, but add an accepted-only
  and/or canonical projection to every proposal packet.
- Mark each proposed field with `all_occurrences`, `accepted_occurrences`,
  `canonical_occurrences`, and `rejected_occurrences`.
- Only allow hard validation from accepted/canonical counts.

### 2. The proposal shape cannot classify enum-candidate fields as relation context

The proposal workflow splits fields into `field_proposals` for enum candidates
and `key_dispositions` for additional keys. `field_proposals[].decision` only
allows:

```text
enum | free_text | structured | drop | needs_more_data
```

That means an enum-candidate field cannot cleanly be classified as
`relation_context`. This forced Pro into ontology-weak choices such as:

| field | accepted observations | Pro decision | ontology concern |
| --- | ---: | --- | --- |
| `route.program` | 21 | enum (`ABLE` -> `able`) | program membership is relation context, not route identity |
| `metric_claim.source_system` | 26 | enum | program/source system should link to source/project/entity context |
| `claim.source` | 15 | enum | outreach/survey source is provenance/context, not a closed claim type |

The comparison README already notes that Flash surfaced more project
relation-context fields (`program`, `lead_agency`, `partner_agency`,
`implementing_agency`, `partners`). Pro was more conservative, but the schema
shape also nudges it away from relation-context decisions once a field has
small repeated string values.

Recommendation:

- Add `relation_context` to field proposal decisions, or merge field proposals
  and key dispositions into a single field-disposition list.
- Allow a field to have both a value normalizer and a semantic disposition, for
  example: `value_policy: enum_open`, `semantic_role: relation_context`.

### 3. Current identity code still has policy mismatches masked by overrides

Validation is clean, but some identity semantics are still enforced by
override/suppression artifacts rather than by the core identity functions.

Code-level risks:

- `packages/harness/src/mta/identity.ts:291` still includes `program` in
  project identity key generation.
- `packages/harness/src/mta/identity.ts:245` treats any trailing `+` route
  label as SBS without recording why that label is authoritative. The working
  policy is that official MTA internal route ids such as GTFS/BusTime/ACE
  `B44+`, `M15+`, or `Q44+` are strong SBS aliases, but the payload should
  preserve that the `+` came from an MTA route-id surface rather than loose
  prose.

These are exactly the problems the identity review remediated:

- `project_better-buses-restart-2021` vs `project_jamaica-busway` needed a
  do-not-merge because program text became identity evidence.
- Plus-route policy was resolved through curated overrides, but future sources
  can still create a `+` -> SBS identity key without preserving the MTA
  route-id authority that makes that inference valid.

Recommendation:

- Remove `program` from project strong identity key generation.
- Add route identity fields before deriving a strong plus/SBS alias:
  `base_route_id`, `service_variant`, `internal_route_id`, `branding_label`,
  and `route_id_authority` or `source_route_surface`.
- Treat official MTA `+` route ids as strong SBS aliases, and preserve other
  `+` labels as source labels until a source authority or inherited MTA route-id
  convention is recorded.

### 4. The largest normalization opportunities are high-coverage semantic fields excluded from enum proposals

The enum proposal pass found small low-cardinality fields, but the greatest
normalization payoff is in high-coverage fields with too many literal variants
for the current enum heuristic.

| field | canonical occurrences | distinct literals | examples |
| --- | ---: | ---: | --- |
| `metric_claim.metric_name` | 868 | 506 | `bus_travel_time`, `Average Speed`, `average bus speed` |
| `metric_claim.unit` | 711 | 90 | `percent`, `mph`, `miles_per_hour`, `USD`, `$ millions` |
| `event.event_kind` | 200 | 93 | `service_launch`, `launch`, `implementation_date`, `pilot_start` |
| `treatment_component.treatment_kind` | 145 | 84 | `bus_lane`, `busway_restriction`, `vehicle_restriction` |
| `project.project_type` | 70 | 50 | `new_bus_lane`, `busway pilot`, `busway_pilot` |
| `project.status` | 87 | 29 | `proposed_2019`, `proposed`, `under construction`, `under_construction` |

These should not be closed enums yet, but they are strong candidates for open
normalizers that preserve raw literals.

Recommended normalized companion fields:

| raw field | normalized companion |
| --- | --- |
| `metric_name` | `metric_family`, `metric_slug`, `metric_subject`, `metric_measure` |
| `unit` | `unit_normalized`, `unit_family`, `unit_scale` |
| `event_kind` | `event_kind_normalized`, `event_family` |
| `treatment_kind` | `treatment_family`, `treatment_subtype` |
| `project_type` | `project_family`, `project_subtype` |
| `status` | `document_time_status`, `resolved_status`, `status_raw` |

### 5. `metric_claim.unit` should be primary; Pro's `unit` -> `units` alias is backwards

Canonical data has:

| field | accepted/canonical occurrences | distinct literals |
| --- | ---: | ---: |
| `metric_claim.unit` | 711 | 90 |
| `metric_claim.units` | 13 | 7 |

Pro recommends aliasing `unit` to sparse `units`. That would move the system
away from the dominant field and toward a less common duplicate.

Recommendation:

- Keep `unit` as the canonical raw field for metric claims.
- Alias `units` to `unit`, not the other way around.
- Add `unit_normalized` while preserving the submitted literal under `unit`.
- Normalize common families now: `percent`, `percentage_point`, `mph`,
  `minutes`, `seconds`, `riders`, `riders_per_day`, `dollars`, `miles`,
  `feet`, `routes`, `vehicles`, `cameras`, `violations`.

### 6. Mixed-type fields should not become enum proposals

`entity.publisher` was classified as an enum candidate even though the audit
records `value_kind: mixed`. Accepted examples include both named publishers
and boolean flags:

```text
publisher: "NYC DOT"
publisher: true
operator: "MTA New York City Transit"
operator: true
```

This means the field is doing two jobs:

- source role flag (`publisher: true`, `operator: true`)
- related organization name (`publisher: "NYC DOT"`)

Recommendation:

- Treat `mixed` as non-enum unless all non-string values are runner-generated
  or otherwise explicitly explained.
- Split entity/source roles into clear fields or relations:
  `role_in_source`, `is_publisher`, `is_operator`, `published_by`,
  `operated_by`.
- Preserve raw mixed fields during passthrough, but warn on new mixed usage.

### 7. Generated normalized fields need a runner-owned namespace/policy

The proposal set is inconsistent about normalized fields. It drops source
normalized fields as derived, but promotes many normalized fields on claim,
project, treatment, relation, metric, and table records.

Accepted generated-field examples:

| field | accepted occurrences |
| --- | ---: |
| `event.date_text_normalized` | 185 |
| `event.date_normalized` | 30 |
| `event.event_date_normalized` | 26 |
| `treatment_component.locations_normalized` | 31 |
| `source.document_date_normalized` | 8 |
| `claim.location_normalized` | 6 |
| `project.location_normalized` | 5 |

These fields are useful, but they are produced by the runner normalizer, not
source-owned agent payloads.

Recommendation:

- Define derived fields as runner-owned, for example under `derived` or
  `_derived`, or by explicit `*_normalized` policy.
- Do not ask ingest agents to submit `*_normalized` fields.
- Keep raw source literals in user-facing payload fields and generated parsed
  objects in derived fields.

### 8. Pro's proposed drops are not safe as extraction-time drops

Pro proposes three field-level drops:

| field | accepted observations | concern |
| --- | ---: | --- |
| `corridor.ridership_text` | 2 | source literal should be preserved or migrated to metric claims |
| `corridor.busway_launch_date` | 1 | raw date literal should remain alongside derived normalized date |
| `project.boroughs` | 2 | plural field should alias to array-style borough scope, not be lost |

Recommendation:

- Interpret `drop` as "do not promote to typed schema", not "discard".
- For passthrough extraction, preserve as `_raw`, `notes`, or canonical
  `_merged_field_values` until a deterministic migration exists.
- Use materialization-only projection drops for bulky or redundant output, like
  table rows, rather than submit-time rejection.

### 9. Relation context is under-modeled relative to the ontology

Current relation context dispositions:

```text
event: organizers, participants
metric_claim: context
relation: contractor, hotline
route: related_existing_routes
source: author, commissioner, event, location, prepared_for, program, project, publication_name, series
table: chair, committee, governing_body, members, source
treatment_component: enforcement_authority
```

Missing or under-surfaced relation-context candidates include:

- `project.program`
- `project.lead_agency`
- `project.partner_agency`
- `project.implementing_agency`
- `project.partners`
- `metric_claim.source_system`
- `claim.source`
- `corridor.routes` / `corridor.routes_served`
- `project.routes_served`

Recommendation:

- Add explicit relation candidates for common ontology edges:
  `part_of_program`, `implemented_by`, `published_by`, `prepared_for`,
  `serves_route`, `operates_on_corridor`, `uses_corridor`,
  `data_provided_by`.
- Keep relation-context source fields raw until the agent or a deterministic
  linker can create source-backed relation records.

## Recommended Normalization Roadmap

### Phase 1: safe warn-mode normalizers

Do now; no hard closure.

- Add accepted-only/canonical counts to schema proposals.
- Add `relation_context` as a valid field-level semantic role.
- Add a warning when `value_kind: mixed` is proposed as an enum.
- Add `unit` normalizer for metric claims, preserving raw `unit`.
- Add route type normalizer:
  `Local` / `local_bus` -> `local`,
  `express_bus` -> `express`,
  `limited_stop_bus` -> `limited_stop`,
  `select_bus_service` -> `sbs` or `select_bus_service` consistently.
- Add borough normalizer for scalar and array fields, preserving raw literals.

### Phase 2: high-impact open vocabularies

Do after Phase 1, still with passthrough.

- Normalize `event_kind` into `event_family`.
- Normalize `treatment_kind` into `treatment_family` and `treatment_subtype`.
- Normalize `project_type` into `project_family`.
- Normalize `project.status` into `document_time_status`; keep raw status.
- Normalize `metric_name` into a metric taxonomy.

### Phase 3: identity and relation guardrails

Do before large new ingest batches.

- Remove `program` from project identity keys.
- Record route-id authority before deriving plus/SBS strong aliases.
- Split publisher/operator booleans from named organizations.
- Promote program, agency, publisher, prepared-for, and route/corridor list
  fields into relation-candidate workflows.

### Phase 4: enforcement

Only after most source extraction is complete.

- Hard-reject only structural requirements and impossible value types.
- Warn, normalize, and preserve raw values for open enums.
- Close enums only when accepted/canonical saturation supports it and escape
  hatches remain available for new source families.

## Suggested Acceptance Criteria

- `schema-audit` or a sibling report can show all/proposed/accepted/canonical
  counts per field.
- No proposed hard enum has `accepted_occurrences = 0`.
- Mixed-type fields are never promoted to enum without an explicit split plan.
- `metric_claim.unit` remains the primary raw field and has a derived
  normalized companion.
- High-coverage semantic fields have normalized companion fields while raw
  literals are preserved.
- Future validation remains at 0 issues after the normalizers run.
