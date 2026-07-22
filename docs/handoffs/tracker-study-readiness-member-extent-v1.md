# Tracker: study-readiness bridge and member extent v1

This handoff is producer-side only. It does not authorize a Tracker study, replay the rc26 approval
receipt, change a calendar or spine gate, or publish a release. The immutable producer baseline is
MTA Wiki `v1-rc26` at commit `832242cf4083d107dc19ef64213ed69b07247b6b`; manifest SHA-256 is
`c1792d1cbfdf498ea0481fa2374202b634dc2deea532f87a600390c6da382dc0` and occurrence SHA-256 is
`6cb8654efee370d7444405ce3a0cdb8ce6fa394e6ada2347982cbec49df701ef`.

The read-only Tracker input is commit `ce166a23f7db1b0b94659e1fbc88cb9c306213a9`. The normalized,
fully pinned producer copy is
`data/quality/study-readiness/v1/tracker-rc26-input.json`, SHA-256
`1d96eda711a30f651628b64adf8ae4f71cd7acd99bff09d6735bfeea265965cf`. It verifies the exact
candidate set (`fe4d3ce9…e5363`), approval receipt (`00f2fb5e…d89de`), rc26 reconciliation
(`171696a8…bef7e`), scope bindings (`b9cfcf9e…faf25`), review worksheet
(`b0577fc4…aec5`), Tracker import (`b9c41aaf…7d6cd`), and preserved rc25 structured spine/calendar
inputs. The normalized row says whether its structured context is preserved rc25 or revised rc26.

## Deterministic funnel

The non-authorizing bridge has one row per rc26 candidate and exposes exact route scope, delivered
onset, phase, occurrence identity, route-relative member extents, exact evidence, and a sorted
missing-role list. Candidate or registry fields are never upgraded to producer evidence.

| Disposition | Rows | Owner/action |
|---|---:|---|
| Approved in frozen rc26 receipt | 7 | No action in this handoff |
| Source-fixable bus-lane identity/scope/onset/phase | 321 | Deferred; the completed broad sweep is not repeated |
| Source-fixable member treatment extent | 83 | Producer extent review target |
| Tracker spine/pattern | 45 | Tracker-owned quarantine |
| Tracker outcome calendar | 8 | Tracker-owned quarantine |
| Later ACE phase | 20 | Methodology quarantine; retain later-phase status |

The source-fixable manifest contains exactly `404` rows and the quarantine contains exactly `73`.
Every target includes spine readiness, calendar sufficiency, conservative first-onset status,
downstream rejection reason, and artifact hashes. The `321` exhausted bus-lane rows are labeled
`deferred_completed_broad_sweep_requires_exact_identity_source`; generic route-treatment evidence
must not create an occurrence.

Primary artifacts:

| Artifact | Rows/count | SHA-256 |
|---|---:|---|
| `bridge-ledger.jsonl` | 484 | `948d920ad0eb570a130cba155935e66848a78460b5d3b83223eed2fdac810012` |
| `consumer-priority-manifest.json` | 404 targets | `18347cb4ccac3e0c91a45fca6771e0d8b338ca8695b9a91aca6e2a7fe4ac028c` |
| `consumer-owned-quarantine.jsonl` | 73 | `e9a32eb8cdafcdb6b69d6f8410e7503e8a33029e5df20153b03cd571d390a491` |
| study-readiness `manifest.json` | 6 outputs | `0b07f6e9b134ba9b8ec15278ab07a4ff2cb5fec27669b01208a911d8469b9192` |

## Reviewed official-source batch

The priority batch is the `11` Queens redesign rows whose pinned Tracker context is `series_ready`,
has six pre and six post months, has no earlier same-family candidate in the pinned set, and fails
only the legacy `route_wide_evidence_missing` gate: Q45, Q61, Q63, Q80, Q86, Q87, Q89, QM34,
QM44, QM64, and QM68.

All packets preserve the existing exact occurrence, route, day onset, `single_phase` role, canonical
members, and exact evidence in the official MTA Queens service-change source. Results:

- Q63 and Q80 are evidence-complete at member grain. Both occurrences already existed; new
  occurrence count is `0`.
- Nine packets are receipt-backed negatives because at least one member remains unresolved.
- Negative missing roles are `bounded_scope_identity` on 7 packets, `scope_modality` on 3, and
  `stop_identity` on 4. Counts overlap because a packet can have multiple unresolved members.
- Named routes, named prior branches, “some stops,” street lists without pinned stop identities, and
  physicality `not_applicable` never establish whole-route extent.

Reviewed packet SHA-256 is
`1c28f4845592e95ef4fee7776d2f4b38d3bf80fe81e1e21218484b771fe7f0eb`.
These packets require a new Tracker import/candidate set and approval receipt before any admission.

## Member-level producer contract

`operational-occurrence-member-extent-v1` is a companion contract pinned to rc26, not a mutation of
occurrence-v2 or the immutable rc26 release. Its exact grain is
`(occurrence_id, route_record_id, treatment_record_id)`. It enumerates all `308` occurrence × route ×
member keys (`306` eligible) with no loss: `2 route_wide`, `9 bounded_segment`, `0 stop_set`,
`0 mixed`, and `297 unresolved`.

The closed extent vocabulary is:

- `route_wide`: reviewed affirmative whole-route/whole-service evidence relative to the exact route
  member.
- `bounded_segment`: a nonempty canonical or versioned source-literal corridor/segment identity plus
  exact evidence.
- `stop_set`: exact, versioned stop identities plus evidence; vague stop language fails closed.
- `mixed`: at least two distinct positive components, never coerced to route-wide.
- `unresolved`: empty or incomplete extent with a nonempty explicit missing-role list.

The two Flatbush rows are B41 and B67 only, both bound to
`occurrence:8c987704152b459014217d44`, the exact Livingston-to-State corridor, operational onset
`2025-10-02`, and the installation/opening phase relation. Contract projection SHA-256 is
`311c768a5b15cc8262d0d2445fdd6099317d7742245516b92b107eef3d4771f7`; reviewed ledger SHA-256 is
`50815d86fcc950c43da2034bca84d603889790b9c9072c58b713a56c6ecaaa48`; contract manifest SHA-256
is `bfc505e3233b4cedfa8964dbfdcbf11a3d0bd984ed78048bfc456c3a737375b2`.

## Frozen acquisition-receipt overlay

The append-only overlay links exactly the prior B41 and B67 acquisition receipts to the later exact
rc26 identities. It does not rewrite the frozen `receipts.jsonl` file (SHA-256
`8806c619a6a3cbcdf4233f74fb58cab8d243651b649b69c02c8f8c4c24344a10`) or change the historical
registry exclusion. The ledger has two current resolutions, no producer missing roles, and explicit
`authorizes_study=false`, `authorizes_cross_product=false`, and `tracker_reapproval_required=true`.

- B41 receipt row SHA-256: `bdf422c6c092973f6232047d265f8508762a2f8f36b910cfecc006d3fb56ce7a`
- B67 receipt row SHA-256: `e2ae428c25bdb54ab56891a30f1fe4c7d2234ea17a311170403a9260d96fdd75`
- Overlay ledger SHA-256: `9af451e05dde94e290016073d91e5abdb4ca8b540c574e9dd40f041f7f061f8a`
- Overlay manifest SHA-256: `3509abde0c7330fcfa30b7d5dd210cf4d1a7acf9a820c9c0103b536db4dc15e2`

## Required Tracker migration

Tracker currently loses member identity while constructing study candidates and gates extent through
family defaults and occurrence-level geometry. A safe migration must be coordinated across these
consumer surfaces:

- `packages/domain/src/documents/operational-occurrence/index.ts`
- `tools/pipeline-v2/src/lib/study-engine/study-events.ts`
- `tools/pipeline-v2/src/lib/study-engine/scope.ts`
- `packages/domain/src/studio/study.ts`

Migration target:

1. Add strict schemas for the contract, review ledger, projection, and summary while retaining legacy
   manifest-v3/v4/v5 and occurrence decoders.
2. Add an import-artifact version that verifies all companion paths/hashes and exact
   occurrence × route × member parity. A manifest-v5 producer may address the companion without
   changing occurrence-v2, but rc26 itself remains immutable.
3. Preserve `treatment_record_id` and route-relative member extent through candidate construction.
   Changing `scope.ts` alone is insufficient because current bundle construction discards this grain.
4. Include the extent projection hash and member resolutions in candidate-set identity. Build a new
   candidate set and require a new approval receipt; never replay `00f2fb5e…d89de`.
5. Replace the old family default with strict mapping: `route_wide` to all route spines,
   `bounded_segment` to exact geometry/spine binding, `stop_set` to exact stop/spine binding,
   `mixed` to explicit composite binding, and `unresolved` to rejection with the producer missing
   roles. Generalize the physical-scope binding artifact to candidate + occurrence + route + member.
6. Keep spine, calendar, first-onset, confounder, estimator, and publication gates independent. B67
   may pass exact bounded extent while B41 still fails its Tracker-owned pattern gate. The 20 later
   ACE phases remain later phases.

## Reproduction

```bash
bun scripts/import-tracker-rc26-study-readiness-input.ts --check
bun scripts/generate-study-readiness-v1.ts --check
bun test packages/pipeline/test/quality/study-readiness-v1.test.ts
bun run typecheck
bun run validate
bun run test
```
