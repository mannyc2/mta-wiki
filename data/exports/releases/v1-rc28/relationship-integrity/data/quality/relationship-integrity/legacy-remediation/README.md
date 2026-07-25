# Legacy relationship integrity remediation

Pinned review time: `2026-07-15T12:00:00.000Z`

This campaign actively investigated every assigned legacy item. The JSONL ledger gives one exclusive primary disposition per item and non-exclusive reason codes. Source-backed distinctions are preserved; no street-name similarity, proximity, or unsupported route inference is used.

## Inventory

- ledger_items: 216
- provisional_family_shape_suspects: 172
- exact_semantic_duplicate_groups: 22
- same_date_lifecycle_groups: 2
- merged_edge_conflicts: 1
- local_endpoint_membership_mismatches: 1
- broad_evidence_span_reviews: 8
- missing_source_registry_identities: 5
- duplicate_source_registry_identities: 5

## Primary dispositions

- backfilled_authoritative_source_observation: 5
- corrected_canonical_endpoint: 14
- corrected_relation_family: 137
- merged_duplicate_identity: 8
- merged_into_correct_local_identity_survivor: 1
- merged_same_document_identity: 4
- modeled_typed_counterpart: 6
- recited_to_exact_atomic_blocks: 6
- repaired_collapsed_agency_endpoints: 1
- retained_explicit_distinct_variants: 13
- retained_necessary_multirow_evidence: 1
- retained_phase_parallel_assertions: 2
- retained_semantically_valid_family: 9
- retracted_evidence_invalid_relation: 1
- retracted_invalid_derived_self_loop: 1
- retracted_malformed_self_loop: 5
- retracted_test_submission: 1
- split_into_two_canonical_edges: 1

## Projected materialized counts

- relation_records_before: 21247
- relation_records_after_corrections: 21226
- relation_records_after_split_submission: 21227
- relation_records_after_all_submissions: 21235
- source_records_before: 2574
- source_records_after_corrections: 2569
- source_records_after_backfills: 2574
- corridor_records_before: 218
- corridor_records_after_additions: 221
- project_records_after_additions: 1867
- entity_records_after_additions: 1896
- missing_source_registry_identities_after: 0
- duplicate_source_registry_identities_after: 0

## Evidence-backed canonical additions

- corridor `corridor_east-river-tunnels-meeting-doc-171496` via `sub_86261221d940ff84`
- corridor `corridor_flatbush-phase1-livingston-state` via `sub_f9824a66d8ab3bfc`
- relation `relation_flatbush-phase1-uses-bounded-corridor-livingston-state-20260715` via `sub_9457376b301c4128`
- relation `relation_flatbush-phase1-treatment-on-bounded-corridor-livingston-state-20260715` via `sub_1eef86e06a786107`
- entity `entity_ossining-station-2024` via `sub_0193323612676453`
- relation `relation_ossining-event-located-at-station-20260715` via `sub_85210cb67a6158f4`
- project `project_paratransit-ev-bus-pilot-2024` via `sub_89a72b8caf737d43`
- relation `relation_paratransit-department-has-ev-bus-pilot-20260715` via `sub_10a48321e42ca00f`
- project `project_ptm-second-queens-facility-2025` via `sub_75e696b814e718bd`
- relation `relation_ptm-has-second-queens-facility-project-20260715` via `sub_4e20edd192ae5450`
- entity `entity_queens-borough` via `sub_343f86ef704f5bc1`
- relation `relation_jamaica-bus-depot-located-in-queens-20260715` via `sub_e7f4c51d1db4ec3e`
- project `project_dos-sharp-safety-hazards-risk-prevention` via `sub_6e9d8a118a711d1b`
- relation `relation_sharp-program-part-of-department-of-subways-20260715` via `sub_2f0c1e57732228ac`
- corridor `corridor_lirr-port-washington-branch` via `sub_ba7f43f9543e7201`
- relation `relation_webster-bridge-located-on-port-washington-branch-20260715` via `sub_1e3e79816ea3af00`

## Reproduction

```bash
bun scripts/remediate-legacy-relationship-integrity.ts --check
bun scripts/remediate-legacy-relationship-integrity.ts --apply
bun run materialize
bun test packages/pipeline/test/records/legacy-relationship-remediation.test.ts
bun run validate
```

All assigned family-shape modeling gaps are closed through an existing proved endpoint, a newly modeled typed counterpart, or retraction of an evidence-invalid relation. No unresolved surrogate endpoints remain in this ledger.
