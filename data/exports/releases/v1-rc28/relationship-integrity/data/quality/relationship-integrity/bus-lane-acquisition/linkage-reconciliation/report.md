# Bus-lane supported-linkage reconciliation v2

All **54 / 54** generic linkage-supported acquisition candidates resolve to one exact route-specific canonical or accepted-pending relation.

- Verified existing: **25**
- Implemented pending materialization: **29**
- Endpoint/type/evidence-invalid proofs: **0**
- Study-projectable candidates: **0**

## Shards

- bronx: 13 candidates (6 existing, 7 pending)
- brooklyn-null: 8 candidates (7 existing, 1 pending)
- manhattan: 6 candidates (2 existing, 4 pending)
- queens: 5 candidates (0 existing, 5 pending)
- staten-island: 22 candidates (10 existing, 12 pending)

## Variant precision

The eight `+`/SBS candidates are matched only to SBS canonical route records and authoritative SBS evidence. The BX12 local candidate is not in the supported set; only BX12+ is reconciled. Manhattan M60+/125th Street and M15+/Second Avenue are explicit existing-canonical proofs even though the Manhattan gap-action artifact covers only four Third Avenue rows.

## Staten Island evidence supersession

The immutable original Staten Island journal remains pinned. Its 20 evidence-reblocked submissions are retired by the live override ledger and replaced append-only by the pinned superseding journal. Of the selected candidate proofs, **9** now resolve through replacement relation submissions with current Chandra primary-block ids and hashes; **3** unaffected Hylan proofs remain on the original journal.

Before migration, all 12 pending Staten Island proofs pointed at the original journal and the nine affected proofs carried 27 obsolete evidence references. After migration, 3 proofs remain on the original journal, 9 point at the superseding journal, obsolete references are 0, and the affected proofs carry 18 current primary-block references. Relation identity changes: 0; candidate conclusion changes: 0.

Across all pending linkage journals, 131 active submissions materialize to 131 records under current validation; 20 retired submissions materialize to none. Selected proofs citing obsolete evidence: **0**.

## Remaining non-exclusive reasons

- candidate_date_and_phase_unproved: 54
- canonical_operational_occurrence_identity_unproved: 54
- exact_candidate_segment_binding_unproved: 53
- explicit_phase_identity_unproved: 54
- operational_occurrence_not_added_or_updated: 54

One B82+ row has exact segment evidence, so segment absence applies to 53 rather than 54 rows. No row has the joint exact phase/date/occurrence proof required for projection. All 54 remain excluded, unresolved, and nonprojectable.

## Reproduce

```bash
bun data/quality/relationship-integrity/bus-lane-acquisition/linkage-reconciliation/reconcile.ts --check
bun test data/quality/relationship-integrity/bus-lane-acquisition/linkage-reconciliation/reconcile.test.ts
```
