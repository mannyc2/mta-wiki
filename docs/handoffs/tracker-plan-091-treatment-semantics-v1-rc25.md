# Tracker Plan 091: MTA Wiki treatment semantics v1 / rc25

Use the immutable, unpromoted producer candidate at
`data/exports/releases/v1-rc25/`. Its manifest-v5 SHA-256 is
`77e518a5de39e9fc982d09b7677d44059d26de69b04d9fe10841d6c478516f0f`.
The generator commit recorded by the manifest is
`36271d1516987759012fa6f9b08bcd838fadaafb`. `LATEST` remains `v1-rc5`.

## Consumer contract

- `treatment_components.jsonl` remains the lossless producer record surface. Preserve
  `payload.treatment_kind` as raw source wording; do not treat it as a closed semantic kind.
- `treatment_semantics.json` is the strict record-scoped mapping contract. A disposition is exactly
  one of `atomic`, `bundle`, or `unresolved`. Atomic rows expose a reviewed canonical kind/family;
  bundles expose lossless source-backed members; unresolved rows retain the literal, record IDs,
  and a review reason. New or stale scopes fail release verification.
- `treatment_semantic_review_queue.jsonl` is the fail-closed review queue. `unresolved` is not an
  atomic `other` bucket and must not be silently coerced into a closed downstream taxonomy.
- `operational_occurrences.jsonl` remains schema v2, but its atomic member `treatment_family` is
  now strict over the producer's 21-family occurrence vocabulary. Bundle rows retain lossless
  member IDs and member families; `bundle_family` is accepted only with source-bound analysis-family
  evidence, and unsupported bundle semantics remain study-ineligible. Raw wording is recovered via
  each member's `treatment_record_id`, not copied into either semantic-family field.
- `route_treatment_scopes.jsonl` is the only producer-approved route/treatment authorization
  companion. A pair requires an allowlisted direct evidence-bound treatment/route relation or an
  approved operational occurrence. `projectRefs` and project membership are context only.
- `route_treatment_scope_reconciliation.jsonl` retains every treatment that lacks exact projectable
  route authority. Consumers should surface these rows as source gaps/reconciliation work, not fan
  them out through a shared program.

## Vocabulary and reconciliation

| Measure | Value |
|---|---:|
| Treatment records | 2,938 |
| Exact raw literals | 1,038 |
| Source records represented | 514 sources |
| LF-terminated sorted-union SHA-256 | `e825336ba8b7bff606ac9cfa3ae3fbf0b7c0dccf8c1e54d8cbed4f1109cecc4a` |
| Atomic literals / record scopes | 27 / 650 |
| Bundle literals / record scopes | 5 / 5 |
| Unresolved literals / record scopes | 1,006 / 2,283 |
| Missing / stale / duplicate record scopes | 0 / 0 / 0 |
| Route/treatment scopes | 327 over 278 treatment records |
| Direct-relation / occurrence-authorized scopes | 19 / 308 |
| Explicitly reconciled unscoped treatments | 2,660 |
| Project-membership-authorized scopes | 0 |
| Operational occurrences | 131: 48 atomic / 83 bundle |
| Study-eligible / excluded occurrences | 130 / 1 unsupported bundle family |
| Zero unexplained loss | true |

The downstream audit's `681` literals and SHA-256
`ac2e8bf069d2d4aed9bc483499a290da52e11446dc02f290c39a5e26ac5d255e` include
Tracker custom/local inputs and are not the complete producer denominator. The rc24 route-evidence
reproduction contained `35,817` intervention rows, all with `title === treatmentKind`, over `497`
unique literals. rc25's companions are the migration boundary that separates display wording from
reviewed semantics.

## Addressed artifact hashes

| Artifact | SHA-256 |
|---|---|
| `treatment_semantics.json` | `cef852fbf2922c8e5f839bff5ae67ce530f797f5a3bc8628eefe39e40de9c554` |
| `treatment_vocabulary_inventory.json` | `a93bdf296e65bb9c4a46474066d67107d2be72fd1dd6efeb87ee01f274713b2e` |
| `treatment_vocabulary_reconciliation.json` | `b8cd1277eb9a8ec3dc995d5d12f49aee5c4039aef99b7e1838972cafeb211ea7` |
| `treatment_semantic_review_queue.jsonl` | `fd161ca350d6d95b53855b667f42b71d31019d17bc61bd2262ccded111115bd4` |
| `operational_occurrences.jsonl` | `1650ca9ef02e723c694baaf4685596a36ed0eb9e1447b46313397d92adcd8bcc` |
| `route_treatment_scopes.jsonl` | `79329f495d323c2c16c9993279b84c70ab90c65895d305bb039d38bb8bed49ba` |
| `route_treatment_scope_reconciliation.jsonl` | `40ddf4d584e112818f2decf56a1fd3cc3d253fb612e24ff39b715f508d5a485f` |
| `route_treatment_scope_summary.json` | `bb5ae5266b93070b90656c544ee7e9a6399492ae4fb28ac0c912bc5485cfb643` |

## Exact anti-fan-out result

`treatment_q27-holly-kissena-reroute-2025` resolves to the one-element route set `["Q27"]`.
`treatment_b57-stop-removal-2025` resolves to `["B57"]`. Neither appears on the other route or on
unrelated Queens redesign routes. The route identity snapshot separately retains both `B44` and
`B44+`; the scoped TSP record remains on `B44+` and is not rewritten to `B44` or an invented SBS ID.

## Verification

```bash
bun run treatment-semantics:check
bun run materialize
bun packages/cli/src/cli.ts export-jsonl --verify
bun run typecheck
bun run validate
bun run test
bun packages/cli/src/cli.ts verify-release v1-rc24
bun packages/cli/src/cli.ts verify-release v1-rc25

diff -qr /tmp/mta-wiki-rc25-final-a.pvBSIl/v1-rc25 \
  /tmp/mta-wiki-rc25-final-b.NZEcjS/v1-rc25

jq -s '[.[] | select(.treatment_record_id ==
  "treatment_q27-holly-kissena-reroute-2025") |
  .route_identity.source_route_id]' \
  data/exports/releases/v1-rc25/route_treatment_scopes.jsonl

jq -s '[.[] | select(.treatment_record_id ==
  "treatment_b57-stop-removal-2025") |
  .route_identity.source_route_id]' \
  data/exports/releases/v1-rc25/route_treatment_scopes.jsonl
```

The two release replays and the installed release were byte-identical. Strict verification reports
manifest-v5, `265` addressed files, and `85,392` canonical records for rc25; rc24 also still passes
with `258` addressed files and the same canonical cardinality. The repository-wide suite passed
`1,577` tests with `599,233` assertions, `0` failures, and one intentional generated-block-index
skip. Type checking passed; validation reported `0` issues, `3` already-reviewed relationship
advisories, and `0` release-contract issues. The determinism anchor combined SHA-256 was
`7ecb0f8f6cf6369c8ea214fa18288025bb3796866c46772614bf6564314dd288`.
