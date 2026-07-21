# Relationship integrity audit

Contract: `relationship-contract-v1`

Mode: `enforce`

Canonical graph: 85,396 records; 21,424 relation records; 704 relation kinds.

Frozen matrix coverage: 21,424/21,424 relations across 704 exact relation-kind rules.

## Findings

| Code | Count |
|---|---:|
| `REL_ALIAS_AMBIGUOUS` | 0 |
| `REL_CONFLICTING_EDGE` | 0 |
| `REL_CONTRACT_RULE_MISSING` | 0 |
| `REL_DERIVATION_DANGLING` | 0 |
| `REL_DUPLICATE_IDENTITY` | 0 |
| `REL_ENDPOINT_DANGLING` | 0 |
| `REL_ENDPOINT_LOCAL_MISMATCH` | 0 |
| `REL_ENDPOINT_LOCAL_ONLY` | 0 |
| `REL_ENDPOINT_SUPERSEDED` | 0 |
| `REL_ENDPOINT_TYPE_INVALID` | 0 |
| `REL_EVIDENCE_MISSING` | 0 |
| `REL_EVIDENCE_OVERBROAD` | 0 |
| `REL_EVIDENCE_UNRESOLVED` | 0 |
| `REL_FAMILY_TYPE_SUSPECT` | 0 |
| `REL_FAMILY_TYPE_SUSPECT_REVIEWED` | 3 |
| `REL_MERGED_EDGE_CONFLICT` | 0 |
| `REL_ORPHAN_RECORD` | 45,983 |
| `REL_SOURCE_ID_AMBIGUOUS` | 0 |
| `REL_SOURCE_ID_MISSING` | 0 |

## Exclusive primary relation dispositions

| Disposition | Relation records |
|---|---:|
| `clean` | 18,685 |
| `endpoint_invalid` | 0 |
| `exact_duplicate` | 0 |
| `local_endpoint_inconsistent` | 0 |
| `merged_edge_conflict` | 0 |
| `parallel_duplicate` | 2,736 |
| `provisional_family_type_suspect` | 0 |
| `reviewed_family_type_advisory` | 3 |
| `same_date_status_conflict` | 0 |
| `structurally_overbroad_evidence` | 0 |

## Non-exclusive graph inventory

- Duplicate triple groups: 702 (2,736 records).
- Exact duplicate groups: 0 (0 records).
- Ambiguous canonical aliases: 0.
- Semantic supersessions: 32.

## Orphan inventory

| Kind | Zero-degree records |
|---|---:|
| `claim` | 8,182 |
| `corridor` | 62 |
| `entity` | 733 |
| `event` | 4,290 |
| `metric_claim` | 30,519 |
| `project` | 674 |
| `route` | 16 |
| `source_gap` | 468 |
| `treatment_component` | 1,039 |

Orphan rows are inventory, not automatic completeness failures. Completeness enforcement uses the versioned record-class selectors and immutable dispositions, not graph degree alone.

Parallel assertions with the same triple remain distinct when source, status, date, or evidence identity differs. Exact duplicates are the narrower same-triple/status/date/evidence groups.
