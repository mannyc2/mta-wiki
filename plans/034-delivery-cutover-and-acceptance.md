# Plan 034: Migrate the consumer, cut manifest v3, repin, and put a new in-window Wiki occurrence into downstream review

> **Executor instructions**: Follow this cross-repository plan step by step. It is
> DONE only when the consumer has a strict, tested manifest-v3/occurrence-v1 decoder,
> the producer release is reproducible, and at least one newly acquired Wiki
> occurrence with onset on or after 2023-04-01 appears in the downstream review
> worksheet. Approval remains the downstream reviewer's judgment. A CHANGES note,
> release cut without a compatible importer, historical candidate, or unreviewed
> candidate set is not completion. The release cut/repin are owner-gated; absent
> approval means IN PROGRESS, never DONE.
>
> **Drift check (run first)**: plans 026–033 must all be DONE. Verify plan 032's
> manifest-v3 contract fixture and production export path, and plan 033's
> candidate-ready receipt naming an onset `>= 2023-04-01`. Read
> `data/quality/downstream-pin.json`; it should still identify
> `v2-operational-anchors-1` and manifest SHA
> `b69bd9458a92a817c329cfaa2741ef93dece4d2bbdb4695ea775b09622f5c56c`.
> If either repo has already cut/repinned, reconcile exact hashes and artifact versions
> before proceeding.

## Status

- **Priority**: P1 (all producer work remains invisible until this lands)
- **Effort**: L (two repositories, versioned schema migration, release, and review)
- **Risk**: HIGH (cross-repo contract cutover; mitigated by fixture-first consumer
  support, legacy decoder retention, hash pins, and preview-before-repin)
- **Depends on**: **026–033 DONE; plan 033 is mandatory, not recommended**
- **Category**: migration + delivery
- **Planned at**: commit `d28b64c8`, 2026-07-12 (rewritten 2026-07-12 after strict-
  decoder review: consumer code changes and an in-window acceptance floor are now
  mandatory)

## Why this matters

The consumer correctly rejects unknown manifest/row fields. Plan 029's summary
extensions, plan 031's richer resolution provenance, and plan 032's occurrence file
therefore cannot be delivered by changing producer JSON and writing a CHANGES note.
The producer and consumer must migrate as one versioned contract. The consumer also
needs a bundle-aware candidate shape: SBS components cannot be collapsed to the first
treatment, and a multi-route occurrence must project once per route. Finally, the old
Wiki candidates do not test the actual objective: the M15 (2010) and M86 (2015)
events were rejected because they precede the speed outcome window beginning 2023-04,
not because the release machinery was broken. Acceptance must exercise a genuinely new
in-window occurrence acquired in plan 033.

## Current state

### Producer: `/mnt/models/dev/mta-wiki`

- Current consumer pin: release `v2-operational-anchors-1`, manifest 2, anchor
  contract 1, review snapshot 1, manifest SHA above.
- Plan 032 productionizes manifest 3 with frozen anchor-v1 dual-publish and required
  occurrence rows/summary/accepted-review snapshot under new occurrence contract 1.
- `export-release` takes an explicit id only through `--id`; a positional release id
  is ignored by the CLI. The correct command is shown below.
- Existing release directories are immutable and LATEST promotion is separately
  gated by plan 027.

### Consumer: `/mnt/models/dev/bus-reliability-tracker`

- `tools/pipeline-v2/src/lib/mta-wiki-operational-anchors.ts` hardcodes manifest 2,
  anchor 1, review snapshot 1, exact row/summary schemas, and
  `onExcessProperty: "error"`.
- `tools/pipeline-v2/src/commands/studio/import-mta-wiki-operational-anchors.ts`
  exposes only the legacy importer.
- `packages/domain/src/studio/study.ts` represents one
  `treatmentFamily`; it has no atomic-vs-bundle discriminant.
- `tools/pipeline-v2/src/commands/study/merge-events.ts` strictly reads the legacy Wiki
  import artifact.
- Targeted tests live in
  `tools/pipeline-v2/test/studio-mta-wiki-operational-anchors.test.ts` and
  `tools/pipeline-v2/test/lib/study-events.test.ts`; the full gate is `bun run check`.
- Baseline candidate set is `candidate-set:49af8c8721457fa7532a7345`. Its two Wiki
  candidates are historical/out-of-window. Existing approval receipts remain immutable
  and must not be reused for the new candidate-set id.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Producer gates | `bun run typecheck && bun run test && bun run validate && bun scripts/determinism-anchor.ts` | exit 0 / Issues: 0 |
| Consumer targeted tests | `bun test tools/pipeline-v2/test/studio-mta-wiki-operational-occurrences.test.ts tools/pipeline-v2/test/lib/study-events.test.ts --timeout 5000` | all pass |
| Consumer full gate | `bun run check` | exit 0 |
| Official cut | `bun packages/cli/src/cli.ts export-release --id v3-operational-occurrences-1` | exact release dir + manifest; LATEST untouched |
| New import | `bun run pipeline studio import-mta-wiki-operational-occurrences --mta-wiki-root /mnt/models/dev/mta-wiki --wiki-release v3-operational-occurrences-1 --wiki-manifest-sha256 <sha>` | strict import artifact written |
| Candidate merge | `bun run pipeline study merge-events --wiki-import <new-import-artifact>` | new candidate-set id, awaiting approval |

## Scope

**In scope — producer**:
- `data/exports/releases/v3-operational-occurrences-1/` (new immutable internal
  release), `data/quality/downstream-pin.json`, `LOG.md`, `plans/README.md`.

**In scope — consumer**:
- NEW `packages/domain/src/documents/operational-occurrence/index.ts` plus the existing
  documents barrel export for strict normalized occurrence/import types.
- NEW `tools/pipeline-v2/src/lib/mta-wiki-release.ts` extracting the existing safe
  path/hash/file verification without changing legacy behavior.
- NEW `tools/pipeline-v2/src/lib/mta-wiki-operational-occurrences.ts` and
  `tools/pipeline-v2/src/commands/studio/import-mta-wiki-operational-occurrences.ts`.
- Command registry wiring and strict tests for the new importer.
- `packages/domain/src/studio/study.ts` plus study-event merge/projection code and
  tests in `tools/pipeline-v2/src/lib/study-engine/study-events.ts` needed for a
  version-2 bundle-aware candidate artifact.
- New deterministic import/candidate/review artifacts and the consumer's knowledge log
  receipt. Exact generated paths follow existing studio v2 conventions.

**Out of scope**:
- Mutating either repo's existing pinned release or approval artifacts.
- Removing the manifest-2/anchor-v1 importer; rollback requires it.
- Promoting producer LATEST or publishing a release externally.
- Forcing downstream approval or implementing bundle effect estimation; a bundle must
  reach review honestly even if the reviewer defers estimation support.

## Git workflow

- Producer branch: `advisor/034-occurrence-release`.
- Consumer branch: `codex/mta-wiki-occurrence-v1-import` (or its local convention).
- Land consumer fixture support before changing any pin. Record both commits in the
  final receipt. Do not combine the repositories into one commit and do not push
  without operator instruction.

## Steps

### Step 1: Implement the strict consumer contract migration against the fixture

In bus-reliability-tracker, add a separate manifest-3/occurrence-v1 importer rather
than weakening the legacy decoder:

- Strict manifest 3 schema with exact contract versions
  `operational_anchors:1`, `operational_anchor_review_decisions:1`, and
  `operational_occurrences:1`, plus
  `operational_occurrence_review_decisions:1`, with exact required pointers.
- Strict occurrence/summary/accepted-review-snapshot schemas matching plan 032
  field-for-field.
- Verify manifest SHA pin, addressed path containment, file bytes, file SHA, row count,
  schema version, evidence bindings, occurrence-id uniqueness/aliases, and summary
  recomputation. Unknown/excess fields remain errors.
- Preserve the legacy manifest-2 importer and tests byte-for-byte in behavior.
- Extract only the already-tested release-root containment and byte/hash verification
  into `mta-wiki-release.ts`; both importers call it. Do not globally loosen
  `decodeStrict` or duplicate a subtly different path-security implementation.
- Emit a new tagged import artifact, for example
  `bp.studio.mta_wiki_operational_occurrences.v3`, that records release/manifest/file
  hashes and normalized occurrence rows/projection rejections.

Use `mta-wiki/data/contract-fixtures/operational-occurrences-v1/` as the first input.
Add tamper tests for manifest version, contract versions, missing pointer, excess key,
file hash/size, traversal, duplicate id, dangling alias/evidence, and summary mismatch.

**Verify**: targeted importer tests pass; the plan-032 expected projection fixture is
reproduced byte-for-byte; all tamper cases fail closed; legacy importer tests still
pass.

### Step 2: Migrate study candidates to an atomic/bundle discriminated v2 shape

In `packages/domain/src/studio/study.ts`, introduce version-2 candidate/merge/approval
artifact variants while retaining decoders for immutable v1 artifacts. Preserve
`treatmentFamily` as the analysis family so existing study machinery has an explicit
input, and add:

- `occurrenceId`;
- `treatmentScopeKind: "atomic"|"bundle"`; and
- `componentTreatmentFamilies: unique StudyTreatmentFamily[]`.

For atomic candidates, `treatmentFamily` is the one member and component families are
empty. For bundles, `treatmentFamily` is a source-backed supported umbrella such as
`select_bus_service` or `route_redesign`, never the first component; component
families list every evidenced member. A bundle without a supported umbrella remains
in the occurrence import but is rejected from candidate projection with
`unsupported_bundle_analysis_family`.

Project each accepted occurrence to one candidate per GTFS route. Candidate identity
includes the stable `occurrence_id`, GTFS route id, and treatment discriminant; it
does not include mutable provenance ordering. A bundle stays one candidate per route
and never fans out into one candidate per member. Preserve the full occurrence id,
aliases, member evidence, release/manifest/file hashes, and route evidence in
provenance. Day/month onset only; pre-window is a downstream reason code, not silently
dropped.

Teach `study merge-events` to accept the tagged legacy or occurrence import artifact.
Add a separate `occurrenceDrafts`/`computeOccurrenceStudyEligibility` path in
`study-events.ts`; leave the existing `wikiEligibility` atomic-v1 path unchanged.
New occurrence input emits candidate/merge artifact v2 and requires a fresh approval
artifact bound to the new candidate-set id. Existing v1 receipts continue to decode
but cannot approve a v2 candidate set.

**Verify**: plan-032 fixture yields one bundle candidate per route, not per member;
atomic fixture remains atomic; multi-route fixture yields N route candidates sharing
one occurrence id; unsupported bundle umbrella yields the named projection rejection;
candidate ids are deterministic under provenance reordering; old v1 fixture tests
remain green.

### Step 3 [OWNER GO/NO-GO]: Assemble and approve the cut package

In mta-wiki, assemble: all producer gates; plan-030 ledger histogram with zero
priority `unreviewed`; plan-033 search/acquisition/curation and candidate-ready
receipt; plan-032 identity-registry fingerprint and live occurrence summary; exact
contract versions; consumer fixture-test commit and results. Record owner go/no-go.

**Verify**: the package names one candidate-ready `occurrence_id` with onset
`>=2023-04-01`, route(s), treatment discriminant/members, and zero producer projection
exclusions. No owner approval means stop here IN PROGRESS.

### Step 4: Cut and independently reproduce the manifest-v3 release

From a clean committed producer HEAD run exactly:

`bun packages/cli/src/cli.ts export-release --id v3-operational-occurrences-1`

Do not pass a positional id and do not pass `--set-latest`. In a clean worktree at the
same commit, recut to a temporary root and compare manifest bytes plus every addressed
file hash. Record release id, manifest SHA, generator commit, identity-registry
fingerprint, accepted cluster/review snapshot hashes, and occurrence count.

**Verify**: recut is byte-identical; parsed manifest says version 3, occurrence
contract 1, and occurrence-review snapshot contract 1; `v2-operational-anchors-1` and
LATEST retain their pre-cut hashes.

### Step 5: Import the actual release and preview the new candidate set

Run the new consumer importer on the official release with its exact manifest SHA.
Recompute the import summary from rows and compare. Run `study merge-events` without
an approval artifact to produce an `awaiting_approval` candidate set. Do **not** update
the producer pin yet.

Acceptance preview must contain at least one Wiki-sourced candidate that:

- traces to the plan-033 occurrence id;
- has onset `>=2023-04-01` with day/month precision;
- has an evidenced GTFS route and honest atomic/bundle treatment;
- was absent from `candidate-set:49af8c8721457fa7532a7345`;
- has no importer/projection rejection.

**Verify**: consumer targeted and full gates pass on the actual release; preview
artifact contains the required candidate. If not, do not repin—return the exact reason
to plan 033 or fix a contract bug in 032/034.

### Step 6: Generate and complete downstream review

Generate the existing review worksheet/report flow for the new candidate-set id,
including the new occurrence provenance and bundle members. The downstream reviewer
records approved/rejected/deferred with rationale. Approval is not required for this
plan; **being presented and adjudicated in the review artifact is required**. A bundle
may be deferred because the estimator lacks a bundle estimand, but it must not be
silently coerced or excluded from review.

**Verify**: review worksheet contains the required in-window Wiki candidate and a
decision/rationale; artifact points to the exact release and manifest SHA. Old approval
receipt remains untouched.

### Step 7: Repin and close the two-repo receipt

After the actual import, candidate preview, review, and owner approval, update
`mta-wiki/data/quality/downstream-pin.json` to release id, manifest SHA, contract
versions, and consumer commit. Re-run coverage-matrix Layer C. Record producer and
consumer commits, importer artifact hash, candidate-set id, review artifact hash,
decision, and reason codes in both logs.

**Verify**: Layer C names `v3-operational-occurrences-1` and exact SHA; consumer
artifacts name the same; both repo gates are green; no legacy release/receipt bytes
changed.

## Test plan

- Producer: rerun plan 032 manifest/identity/dual-publish tests and all four gates.
- Consumer importer: happy atomic/bundle/multi-route fixture plus every Step-1 tamper
  case and legacy manifest-2 regression.
- Candidate projection: one-per-route, never one-per-bundle-member; stable ids;
  source-backed umbrella family; unsupported-bundle reason; pre-window reason; missing
  route/treatment/status/evidence rejection; exact provenance hashes.
- Artifact migration: v1 candidate/approval artifacts still decode; v1 approval cannot
  approve a v2 candidate set; fresh v2 review does.
- End-to-end actual-release run followed by `bun run check` in the consumer.

## Done criteria

- [ ] Consumer has strict manifest-3/occurrence-v1 importer and bundle-aware candidate
  artifact v2; legacy manifest-2/candidate-v1 paths remain tested.
- [ ] All fixture/tamper/projection tests and consumer `bun run check` pass.
- [ ] `v3-operational-occurrences-1` is cut with the correct `--id` syntax and
  independently reproduced byte-for-byte; LATEST and old releases untouched.
- [ ] Actual release imports strictly and produces a new candidate set.
- [ ] At least one newly acquired Wiki candidate with onset `>=2023-04-01` appears in
  the downstream review worksheet and receives a recorded rationale; approval itself
  is not required.
- [ ] Producer pin and Layer C update only after preview/review; two-repo hash/commit
  receipt is complete.
- [ ] Producer and consumer full gates green; logs and `plans/README.md` updated.

## STOP conditions

- Plan 033 lacks a candidate-ready in-window receipt → do not cut; acquisition is a
  hard dependency.
- Consumer support requires accepting excess/unknown fields or weakening hash/path
  checks → stop and fix the versioned schema instead.
- Bundle projection selects the first member or fans out without member-specific dates
  → stop; that recreates the core data error.
- Independent recut differs → do not hand off or repin.
- Actual import/candidate preview lacks the plan-033 in-window occurrence → do not
  repin; record whether the cause belongs to curation, producer projection, or consumer
  projection and return to that plan.
- Owner cut/repin approval is absent → stop IN PROGRESS with the verified package.

## Maintenance notes

- Keep the legacy decoder and dual-published anchor-v1 files until a later explicit
  retirement after at least one stable manifest-v3 receipt.
- The review outcome, especially bundle deferrals, is the next work order for study
  estimands. It is not permission to flatten bundles.
- Future cuts repeat: producer gates → consumer fixture compatibility → cut/reproduce
  → actual import/preview → review → repin. Never update the pin before preview.
