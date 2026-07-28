# Operational episode frontier

The operational episode frontier is the producer-owned reconciliation between
canonical source observations and durable real-world occurrences. It prevents
an absent release row from ambiguously meaning “not found,” “not reviewed,”
“unsupported,” or “rejected.”

The contract keeps three identities separate:

- An **observation** is a canonical, source-scoped event record.
- A **candidate** is a deterministic, versioned segmentation fingerprint
  emitted by an adapter. It can change when graph enrichment or reviewed
  segmentation changes.
- An **occurrence** is a durable `occurrence:<24-hex>` identity governed by the
  append-only identity registry. Only an active identity with a current exact
  review is published.

The legacy `operational_change_id` field on broad anchors is therefore an
`anchor_candidate_fingerprint`, not a durable episode ID. Consumers must never
persist it as an occurrence reference.

## Closed ledgers

`data/quality/operational-episode-frontier/v1/` contains:

- `cohort.json`, which pins the cohort rule and every semantic input;
- `observation_ledger.jsonl`, with exactly one disposition for every admitted
  observation;
- `candidate_ledger.jsonl`, with exactly one disposition for every adapter
  candidate; and
- `summary.json`, which recomputes the identity partition and ledger
  arithmetic.

The generic cohort admits the 1,363 implementation/launch-family observations
and observations already bound by a current exact episode review. The latter
adds three reviewed route-renaming observations whose canonical family is
`other`, producing 1,366 frontier rows. The study-specific operational
coverage view retains its 1,363-event denominator and verifies that every one
of those observations is present in the generic frontier.

The accepted-mapping adapter owns reviewed segmentation, including
multi-observation episodes. Its inputs live under
`data/operational-episode-resolution/adapters/`; source-specific IDs are data,
never code branches. The generic relation-graph adapter emits exact or
ambiguous candidate fingerprints from typed graph structure. It never infers
a project-level route × treatment cross-product.

## Partial and complete profiles

The tracked v1 projection is `partial`. Pending segmentation and review remain
explicit, counted, and operator-visible. Five pending candidates retain the
unresolved active identity IDs from the Plan 045 partition without gaining
publication authority. Other graph-derived candidates may remain pending
without an occurrence identity.

A `complete` profile rejects every pending or invalid row. Non-publication
states such as rejected, insufficient evidence, outside domain, duplicate
alias, or retired require their corresponding accepted authority.

Absence from the published occurrence subset means only that no candidate has
both an active identity and a current exact review. Consumers should inspect
the candidate disposition rather than subtract route counts or reinterpret
study dimension gaps as episode candidates. The 2,931 operational-coverage
dimension gaps—and its 2,436 unreviewed gaps—remain a study queue, not an
episode backlog.

Reproduce and verify the tracked frontier:

```bash
bun scripts/generate-operational-episode-mappings-v1.ts --check
bun packages/cli/src/cli.ts operational-episode-frontier \
  --profile partial \
  --check data/quality/operational-episode-frontier/v1
```
