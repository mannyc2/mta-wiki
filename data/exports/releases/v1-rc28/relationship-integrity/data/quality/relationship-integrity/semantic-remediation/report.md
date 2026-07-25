# Relationship semantic remediation v1

Status: applied and fully reconciled.

- Reviewed relation decisions: 399
- Guarded semantic corrections added: 365
- Replacement submissions: 154
- Payload-reference remediation relations reconciled: 81
- Native-derivation correction supersessions: 7
- Route identity merge aliases split: 4
- Evidence-preserving route submissions retired/reissued: 1
- Explicitly pinned post-campaign identity retirements preserved: 19
- Generated semantic-journal retirements in that set: 18
- Original meeting-doc ingest retirements in that set: 1
- Semantic replacement decisions reconciled by exact reviewed retirements: 9
- Reviewed M16 predecessor payload corrections: 1
- Reviewed Moody's rating-event precision corrections: 1
- Explicit reviewed-valid family warning shapes: 3
- Silent family-warning exceptions: 0
- Total semantic corrections replayed: 798
- Total submission retirements replayed: 373
- Live invalid derivations removed: 15
- Accepted invalid relation observations retracted exactly: 18
- Post-remediation canonical relations: 21424
- Post-remediation endpoint tuples: 1008
- Derived reference values audited: 14671
- Unresolved derived references: 2573
- Ambiguous derived references: 6073
- Staten Island reblocking relations: 11
- Staten Island / semantic remediation overlap: 0
- Skipped corrections: 0
- Replay issues: 0
- Unmapped projected relations: 0

## Route identity split

The four reviewed alias collapses were removed exactly, preserving distinct
Bx15 Local/Limited, M16/M34A SBS, Q52 LTD/SBS, and Q53 LTD/SBS physical route
records. Submission `sub_b3fd1d768f00f286` was retired and
reissued as `sub_a4ca1983bfb6ce83` with identical
payload and evidence and only the canonical target changed.

The exact review-note correction `zz-relationship-identity-m16-predecessor-payload-20260717`
restores the historical M16 payload while retaining M16 and M34A SBS as
distinct predecessor/successor route records. The two reviewed transition
relations remain non-self-loop M16-to-M34A edges.

The exact family-review correction `zz-relationship-family-moodys-rating-event-20260717`
repoints the imprecise umbrella-MTA rating edge to the canonical June 13, 2025
Moody's rating-action event while preserving the source, subject, status, date,
and evidence binding. The three other family warnings remain explicit reviewed
narrow shapes; no silent exception is admitted.

## Derived reference diagnostics

The post-remediation replay contains
8646 unresolved or ambiguous
relationship-like references (2573
unresolved; 6073 ambiguous). Exact
coverage rows and the top 25 deterministic groups are embedded in
`data/quality/relationship-integrity/semantic-remediation/summary.json`.

## Reproduction

```bash
bun scripts/apply-relationship-semantic-remediation-v1.ts --check
bun test packages/pipeline/test/records/derived-relations-semantic-integrity.test.ts
```

The projected tuple inventory is `data/quality/relationship-integrity/semantic-remediation/projected-tuples.json`
(SHA-256 `c7a18628e490fd8da3ce0be01960ed03180a67817bf7e9e270c6e43859244055`). The relation-level inventory is
`data/quality/relationship-integrity/semantic-remediation/projected-relations.jsonl` (SHA-256
`1d7eb621f15620e9b24f5ca023f65c20383f3d26b4c6eaa4094f6c5adaeef03d`). Every projected relation maps to a
baseline semantic-review tuple decision, an exact remediation decision, or both.
