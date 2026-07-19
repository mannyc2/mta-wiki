# Relationship integrity audit

Contract: `relationship-contract-v1`

Mode: `warn`

Canonical graph: 85,116 records; 21,247 relation records; 741 relation kinds.

Frozen matrix coverage: 21,247/21,247 relations across 741 exact relation-kind rules.

## Findings

| Code | Count |
|---|---:|
| `REL_ALIAS_AMBIGUOUS` | 1 |
| `REL_CONFLICTING_EDGE` | 4 |
| `REL_DUPLICATE_IDENTITY` | 44 |
| `REL_ENDPOINT_LOCAL_MISMATCH` | 1 |
| `REL_EVIDENCE_OVERBROAD` | 8 |
| `REL_FAMILY_TYPE_SUSPECT` | 172 |
| `REL_MERGED_EDGE_CONFLICT` | 1 |
| `REL_ORPHAN_RECORD` | 46,031 |
| `REL_SOURCE_ID_AMBIGUOUS` | 5 |
| `REL_SOURCE_ID_MISSING` | 287 |

## Exclusive primary relation dispositions

| Disposition | Relation records |
|---|---:|
| `clean` | 18,322 |
| `exact_duplicate` | 43 |
| `local_endpoint_inconsistent` | 1 |
| `merged_edge_conflict` | 1 |
| `parallel_duplicate` | 2,696 |
| `provisional_family_type_suspect` | 172 |
| `same_date_status_conflict` | 4 |
| `structurally_overbroad_evidence` | 8 |

## Non-exclusive graph inventory

- Duplicate triple groups: 709 (2,750 records).
- Exact duplicate groups: 22 (44 records).
- Ambiguous canonical aliases: 1.
- Semantic supersessions: 20.

## Orphan inventory

| Kind | Zero-degree records |
|---|---:|
| `claim` | 8,174 |
| `corridor` | 63 |
| `entity` | 729 |
| `event` | 4,284 |
| `metric_claim` | 30,553 |
| `project` | 669 |
| `route` | 16 |
| `source_gap` | 467 |
| `treatment_component` | 1,076 |

Orphan rows are inventory, not automatic completeness failures. Completeness enforcement uses the versioned record-class selectors and immutable dispositions, not graph degree alone.

Parallel assertions with the same triple remain distinct when source, status, date, or evidence identity differs. Exact duplicates are the narrower same-triple/status/date/evidence groups.
