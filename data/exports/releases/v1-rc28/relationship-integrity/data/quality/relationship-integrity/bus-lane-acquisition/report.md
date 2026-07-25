# Registry-only bus-lane acquisition campaign v1

- Campaign: `registry-only-bus-lane-acquisition-v1`
- Pinned candidate set: `candidate-set-v2:24080902f508b55a0033df32` (`42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`)
- Candidate coverage: **321 / 321**
- Generated from five immutable shard manifests on 2026-07-15.

## Exact campaign totals

| Metric | Count |
| --- | ---: |
| Researched | 321 |
| Physical bus-lane source acquired | 321 |
| Authoritative route-treatment/corridor binding proved | 54 |
| Exact candidate segment binding proved | 1 |
| Candidate date and phase jointly proved | 0 |
| Operational occurrence added or updated | 0 |
| Explicitly excluded from occurrence projection | 321 |
| Still unresolved | 321 |

The shard source field `exact_route_treatment_binding_proved` is normalized here as an authoritative generic route-treatment or route-corridor binding. It does **not** prove the registry candidate's exact segment, day, phase, onset, or canonical occurrence identity. No date-only or corridor-only match is promoted beyond its supported precision.

## Exclusive primary dispositions

| Disposition | Count |
| --- | ---: |
| `completed_search_route_linkage_unresolved` | 267 |
| `linkage_supported_phase_unresolved` | 54 |

Every campaign row has exactly one primary disposition. All 321 rows remain non-projectable.

## Non-exclusive reasons

| Reason code | Count |
| --- | ---: |
| `authoritative_route_treatment_binding_unproved` | 267 |
| `exact_candidate_segment_binding_unproved` | 320 |
| `explicit_phase_identity_unproved` | 321 |
| `candidate_date_and_phase_unproved` | 321 |
| `canonical_operational_occurrence_identity_unproved` | 321 |
| `operational_occurrence_not_added_or_updated` | 321 |

## Shard reconciliation

| Shard | Researched | Acquired | Route binding | Segment | Date + phase | Occurrence | Excluded | Unresolved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bronx | 52 | 52 | 13 | 0 | 0 | 0 | 52 | 52 |
| brooklyn-null | 60 | 60 | 8 | 1 | 0 | 0 | 60 | 60 |
| manhattan | 42 | 42 | 6 | 0 | 0 | 0 | 42 | 42 |
| queens | 113 | 113 | 5 | 0 | 0 | 0 | 113 | 113 |
| staten-island | 54 | 54 | 22 | 0 | 0 | 0 | 54 | 54 |

## Coverage and collision assertions

| Assertion | Result |
| --- | ---: |
| `all_assertions_passed` | true |
| `expected_shard_count` | 5 |
| `observed_shard_count` | 5 |
| `reconciliation_backlog_count` | 321 |
| `partition_union_count` | 321 |
| `campaign_candidate_count` | 321 |
| `missing_backlog_candidate_count` | 0 |
| `extra_shard_candidate_count` | 0 |
| `cross_shard_candidate_collision_count` | 0 |
| `cross_shard_receipt_candidate_collision_count` | 0 |
| `cross_shard_exclusion_candidate_collision_count` | 0 |
| `receipt_id_collision_count` | 0 |
| `candidate_identity_collision_count` | 0 |
| `partition_without_receipt_count` | 0 |
| `receipt_without_partition_count` | 0 |
| `partition_without_exclusion_count` | 0 |
| `exclusion_without_partition_count` | 0 |
| `four_channel_receipt_count` | 321 |
| `verified_shard_manifest_count` | 5 |

The campaign generator verifies every shard manifest and artifact hash, one-to-one partition/receipt/exclusion coverage, receipt and candidate identity uniqueness, and exact equality between the five-shard union and the 321-row reconciliation backlog. Per-row provenance hashes in `campaign.jsonl` bind each normalized decision to its shard partition row, receipt, exclusion, and reconciliation-ledger row.

## Reproduce

```bash
bun scripts/aggregate-bus-lane-acquisition-campaign-v1.ts --check
bun test packages/pipeline/test/quality/bus-lane-acquisition-campaign.test.ts
```

This report is non-authorizing. It does not mutate canonical records, operational occurrences, releases, Tracker state, approvals, or publication state.
