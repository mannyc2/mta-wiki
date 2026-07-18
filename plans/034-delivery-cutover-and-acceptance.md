# Plan 034: Reconciled manifest-v5 exact-route cutover and downstream review handoff

> **Execution authority (2026-07-18)**: This runbook supersedes the original
> manifest-v3 / occurrence-v1 cut instructions. The owner authorized the
> coordinated MTA Wiki and Bus Reliability Tracker migration, immutable producer
> candidate creation, ready pull requests, and merge when required checks and
> repository policy permit. This authority does not permit changing MTA Wiki
> `LATEST`, approving a Tracker candidate, reusing an old approval, publishing,
> deploying, changing Pages, or promoting production.

## Reconciled starting state

- Producer foundation is merged `origin/main` commit
  `299752f2e9c7696296b29b1bcefbb5f454cb1699`.
- Manifest-v3/occurrence-v1 shipped at `c5834836`; later work advanced the
  producer to manifest-v4, occurrence-v2, enforced relationship-integrity
  artifacts, and immutable `v1-rc23`.
- `v1-rc22` is quarantined for its review-v1/v2-role mismatch.
- `v1-rc23` is quarantined for collapsing exact base/plus route identities.
- Plan 035 is a hard prerequisite. Its exact-route contract and accepted
  binding ledger replace the old family-level route assumptions.
- The public pointer remains exact bytes `v1-rc5\n`. It is not a cutover
  pointer for this program.
- Plans 026–033 are evaluated by evidenced outcomes, not their stale README
  labels. The durable mapping is
  `docs/operational-integrity-plan-reconciliation.md`.

## Outcome retained from the original plan

Plan 034 is complete only when all of the following are true:

1. Tracker strictly supports the producer's manifest-v5 route-identity-v1 and
   route-anchors-v1 contracts while preserving explicit legacy import paths.
2. A new immutable producer release is cut from committed code and reproduced
   byte-for-byte into a separate output root.
3. Tracker performs a pinned, read-only replay against both a compact producer
   fixture and the final named release, including the identical Current Bus
   Routes content hash and effective date.
4. At least one truthful Wiki occurrence with onset on or after 2023-04-01 is
   present in newly generated downstream review material when the already
   satisfied Plan 033 prerequisites project without rejection.
5. No candidate is approved, no prior approval is reused, and no publication,
   deployment, production promotion, Pages change, or `LATEST` update occurs.

## Binding contracts

### Producer

- Exact service identity is
  `(immutable dataset namespace, case-sensitive source_route_id)`.
- `source_route_id === gtfs_route_id` in route-identity-v1.
- B44 and B44+ are separate identities; route family B44 is context only.
- The selected immutable GTFS/Current Bus Routes snapshot is offline-verified
  during every export and verification run.
- Manifest-v5 declares and addresses:

  ```text
  contract_versions.route_anchors = 1
  contract_versions.route_identity_snapshot = 1
  pointers.route_anchors = route_anchors.jsonl
  pointers.route_identity_snapshot = route_identity_snapshot.json
  ```

- `route_identity_snapshot.json` embeds the complete snapshot descriptor,
  exact service identities, exactly one binding per canonical Wiki route,
  reviewed-decision digest, deterministic counts/hashes, and expected
  compatibility projection count/hash.
- Human-review fields occur only on genuinely reviewed bindings.
  Deterministic exact bindings carry no reviewer attribution.
- `route_anchors.jsonl` is the exact canonical projection of the rich
  snapshot. Historical, future, family, aggregate, proposal, temporary,
  external, non-bus, unresolved, catalog-mismatched, unreliable, or
  unscheduled bindings remain explicit nonprojectable dispositions.
- A named release is written through a temporary directory, fully verified,
  and atomically installed. A failure leaves no named partial directory.

### Tracker

- Named manifest-v5 imports use strict decoders, pinned release and manifest
  SHA-256 values, containment-safe addressed paths, byte/hash checks, exact
  contract versions, and full rich/compatibility projection parity.
- A named import never falls back to family normalization or fuzzy route
  matching. Legacy immutable fixtures use an explicit legacy path/flag.
- Dataset, component feed, source route, exported route, scope, class,
  temporal scope, projectability, and presentation primary are preserved.
- Current Bus Routes `route_type` and `trip_type` are mapped jointly.
  Unknown values and disagreements fail closed; School requires trip type 10
  or 11 and is never guessed.
- B44/B44+ produce distinct route bundles/slugs. Local evidence stays on B44,
  SBS evidence stays on B44+, and historical Limited evidence remains
  nonoperational context.
- Generated route-evidence provenance pins producer release ID, manifest SHA,
  rich snapshot SHA, compatibility SHA, Tracker route-input SHA, Current Bus
  Routes SHA/effective date, and a fixed generation time.

## Execution

### 1. Reconcile prerequisites

Verify every Plan 026–033 row in the reconciliation table against current
merged main and the implementation branch. Do not rerun already-proved
provider work. Any remaining deterministic gap is completed before the cut.

### 2. Complete Plan 035

Authenticate and offline-verify the selected official snapshot. Rebuild and
byte-compare the accepted binding ledger from current canonical records,
proposal bytes, legacy review inputs, and exact GTFS rows. Verify complete
route accounting, exact identity injectivity, official display precedence,
projectability, one presentation primary per eligible identity, adversarial
fail-closed decoding, immutable quarantine, and release-status validation.

### 3. Land strict Tracker support before the named cut

Implement and test the strict manifest-v5 named-release decoder, v2
route-evidence artifact, exact route presentation model, import path, and UI
naming. Retain legacy decoders without weakening them. Exercise the compact
fixture, including B44/B44+, unknown fields/versions/modes, path traversal,
hash/count drift, missing/multiple primaries, and re-signed projection drift.

### 4. Commit producer implementation, select the next free ID, and cut

The producer implementation must be committed before export so
`generator_commit` names the actual generating code. Re-fetch and inspect
the release index immediately before choosing the next free immutable ID.

```bash
bun packages/cli/src/cli.ts export-release \
  --id <next-free-id> \
  --gtfs-snapshot mta-bus-2026-07-18-route-provenance-v1
```

Do not pass `--set-latest`. Verify the named directory immediately.

### 5. Reproduce independently

Export the same committed inputs into a new temporary output root:

```bash
bun packages/cli/src/cli.ts export-release \
  --id <next-free-id> \
  --gtfs-snapshot mta-bus-2026-07-18-route-provenance-v1 \
  --output-root <temporary-directory>
```

Compare complete sorted relative-path/SHA-256 trees and byte-compare every
file. The output-root run must not write release-status state or `LATEST`.
Its full verifier may read the immutable quarantine registry so an explicitly
quarantined release cannot be mistaken for a valid candidate.

### 6. Run pinned read-only Tracker replay

In temporary directories, import the compact fixture and final named release
using their exact manifest pins and the identical Current Bus Routes content
SHA/effective date. Generate route evidence, occurrence import/candidate
preview, and review material. Verify that at least one newly acquired
in-window Wiki occurrence reaches review without projection rejection.

The review artifact remains awaiting operator review. Do not approve, reject,
defer, publish, deploy, or update a production pin.

### 7. Close receipts and repository state

Run all producer and Tracker gates, verify all pre-existing immutable release
hashes, verify `LATEST` exact bytes, and record branches, commits, pull
requests, merge/check state, contract versions, release/artifact hashes,
replay commands, candidate/review artifact hashes, and explicit non-actions.
Push/open ready PRs and merge only when checks are green and policy permits.

## Required gates

Producer:

```bash
bun run typecheck
bun run test
bun run validate
bun scripts/determinism-anchor.ts
bun packages/cli/src/cli.ts verify-release <release-id>
bun packages/cli/src/cli.ts quality-report <release-id> --check
```

Also run architecture, doctrine, knowledge, materialization, relationship,
named-release, selected-snapshot, and targeted adversarial checks required by
the repository.

Tracker:

```bash
bun test tools/pipeline-v2/test/mta-wiki-route-identities.test.ts
bun test tools/pipeline-v2/test/studio-mta-wiki-route-evidence-v2.test.ts
bun run check
```

Run the exact additional domain/API/UI/import tests named by changed packages.

## Done criteria

- [ ] Plans 026–033 have exact evidence and no genuinely unmet outcome.
- [ ] Plan 035 exact-route contracts, selected snapshot, accepted bindings,
      quarantine, adversarial tests, and full verifier are green.
- [ ] Tracker named-release support is strict and keeps B44/B44+ distinct.
- [ ] The next correct immutable producer release is cut from committed code,
      fully verified, and independently reproduced byte-for-byte.
- [ ] Pinned read-only Tracker replays pass against fixture and named release.
- [ ] A truthful newly acquired in-window occurrence reaches newly generated
      downstream review material without receiving a decision.
- [ ] Coherent commits/ready PRs are pushed and merged only if checks and policy
      permit; exact receipt records any remaining external boundary.
- [ ] `LATEST` remains `v1-rc5\n`; pre-existing release directories are
      byte-identical; no approval/publication/deployment/promotion occurred.

## STOP conditions

- The official artifacts do not reliably cover 2026-07-18.
- Exact source route IDs collide across dataset namespaces under v1.
- An accepted decision or canonical/GTFS fingerprint is stale.
- Any route is unresolved/unreviewed, or an eligible identity lacks exactly
  one presentation primary.
- A new external literal cannot be mapped by the versioned policy.
- Tracker requires fuzzy matching or strips unknown fields to consume v5.
- Repeated export differs, a target release ID already exists, or a failed
  export leaves a named partial.
- A required provider-backed run lacks bounded prior authorization.
- A requested action would change `LATEST`, candidate approval, publication,
  deployment, Pages, or production promotion.
