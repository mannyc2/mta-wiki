# Operational occurrence identity and exact review

`occurrence_id` is the only durable identity for a real-world operational
episode. The namespace remains `occurrence:<24-hex>`. An ID is established from
one immutable founding key; later route, treatment, date, label, provenance,
or evidence enrichment never changes it.

The founding key and founding event members are identity inputs, not display
labels. Registry v2 is a deterministic projection of immutable operations
under `data/operational-occurrence-identities/operations/`. Future curation
appends an operation and regenerates `registry-v2.jsonl`; it never edits that
projection directly.

Supported operations distinguish the identity judgments explicitly:

- `establish` creates one durable identity.
- `add_alias` adds a redirect without changing the identity.
- `merge` retires non-survivors and redirects them to an accepted survivor.
- `split` retires one predecessor and names two or more successors.
- `correct_founding_membership` retains the ID and records both old and new
  founding keys and member sets.
- `retire` closes an identity without a successor.
- `record_non_coreference` prevents a later silent merge.

Resolution returns a typed active, redirect, retired, or missing result. A
retired ID is therefore inspectable and cannot be reused. Old founding keys
remain redirects after a reviewed correction.

Identity operations are not source observations. They say which durable
episode an observation belongs to; they do not alter source literals,
canonical records, or evidence.

## Exact review membership

Review-decision v2 and snapshot v3 bind the complete episode membership:
observation events and relations, resolution cluster, phase records and
relations, physical scope records and relations, and exact route-treatment
applications. Each application identifies one route, treatment, phase (or
reviewed null), lifecycle action, physical scope, and exact evidence.

The application array is an authority-bearing incidence set. It is never
derived as a plural-route × plural-treatment convenience cross-product.
Migration is automatic only when one side of that pairing has cardinality one
and phase assignment is unambiguous. Lifecycle action migrates as `unknown`
unless an accepted rule entails a more specific value.

Every authority-bearing field participates in
`membership_fingerprint`. A semantic member change invalidates review;
ordering-only changes canonicalize without invalidation.

## Immutable migration roots and current resolution heads

The 130 files under
`data/operational-occurrence-review/accepted-v2/decisions/` are immutable
v1→v2 migration roots. They remain byte-for-byte inputs to
`occurrence-identity-migrate --check`; current curation never edits, deletes,
or adds a replacement beside them.

Current accepted resolutions are separate append-only decision-v3 files under
`data/operational-occurrence-review/accepted-current/decisions/`. A v3
establishment has no predecessor and can add a newly reviewed occurrence
without changing the migration corpus. A v3 supersession names exactly one
`supersedes_decision_id` and its exact predecessor `membership_fingerprint`;
both operations carry the complete current review. Replay requires a
superseded predecessor to be the one current head for that occurrence.
Missing predecessors, stale fingerprints, cycles, branches with conflicting
heads, duplicate application owners, and changed route × treatment × phase
incidence fail closed.

Application identity is durable across this replay. Existing migrated
`application:<24-hex>` values are retained as founding incidence identities;
new establishments derive application IDs only from occurrence × route ×
treatment × phase incidence;
action and extent are current reviewed claims, not identity inputs. A
refinement from `unknown` action/extent to `add`/`bounded_segment` therefore
changes the review fingerprint and resolved claim while preserving consumer
lookup. A true incidence replacement requires explicit application lineage;
it is not represented by silently recomputing an ID.

The Plan 045 migration preserves all 135 v1 identity IDs. It produces 130
lossless exact reviews and five operator-visible unresolved packets: four
existing route-binding projection retirements and one two-phase application
that needs explicit review. The active identity partition is disjoint and
exhaustive; unresolved identities remain durable but are not publishable
episodes.

`operational_change_id` is a candidate or observation-layer identifier. It is
not durable real-world episode identity and must not be persisted as a
substitute for `occurrence_id`.

Reproduce the migration:

```bash
bun packages/cli/src/cli.ts occurrence-identity-migrate --check
```

The migration check verifies only historical outputs. Resolved-intervention
materialization replays those roots plus the separate current decisions.
