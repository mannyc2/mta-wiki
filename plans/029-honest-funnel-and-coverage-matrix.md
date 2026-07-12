# Plan 029: Make the anchor summary honest and publish the three-layer coverage matrix

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d28b64c8..HEAD -- packages/pipeline/src/materialize/operational-anchors.ts`
> Only plan-026/027/028 commits should intervene, and none of them touch the
> summarize/exclusions logic. If `summarizeOperationalAnchors` or `exclusions` changed,
> compare "Current state" excerpts before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED (additive summary fields; no existing release is touched)
- **Depends on**: plans/028-source-registry-integrity.md (counts below assume the repaired registry)
- **Category**: bug (reporting correctness) + tech-debt
- **Planned at**: commit `d28b64c8`, 2026-07-12

## Why this matters

The release summary misled its first real consumer. `row_count: 633` and
`funnel.timeline_linked_operational_events` are both `rows.length`, which mixes ~630
broad event rows with 3 manually reviewed overlay rows that DUPLICATE events already
present in the broad rows. `funnel.canonical_events: 7945` counts every event including
6,508 `lifecycle_phase: "other"` rows, so the top of the funnel is not comparable to the
next stage. Worst: 614 of the 1,244 operational-family events (49%) never enter the
projection at all — silently dropped at the `has_timeline_event` entry gate with no
counter anywhere. And the exclusion-reason pairs (`missing_route_scope` 582 ==
`missing_route_scope_evidence` 582) double-report one underlying state. This plan makes
every number in the summary mean one thing, surfaces the silent drops, and ships a
deterministic three-layer coverage matrix (full corpus → projection → downstream-served)
so the next scope conversation starts from shared denominators.

## Current state

- `packages/pipeline/src/materialize/operational-anchors.ts`:
  - `:995-1003` — entry gate: only events reachable via a `has_timeline_event` relation
    with `event_family ∈ {implementation, launch}` enter; everything else `continue`s
    uncounted. Corpus facts: 1,244 operational-family events; 630 timeline-linked; 614
    never linked.
  - `:1123-1130` — 3 reviewed overlay rows appended to the same `rows` array
    (anchor_id prefix `operational-reviewed:`); their `event_record_id`s also appear as
    broad rows.
  - `:1141-1179` — `summarizeOperationalAnchors`: `row_count: rows.length`,
    `funnel.timeline_linked_operational_events: rows.length` (633),
    `canonical_events: input.canonicalEventCount ?? rows.length` (7,945 = ALL events).
  - `:754` + `:765` — `missing_route_scope` (routeRecordCount === 0) and
    `missing_route_scope_evidence` (!evidenceCoverage.route_scope) both fire for every
    scope-less row (582/582 parity in the release); same for the treatment pair
    (`:758` + `:766`, 599/599).
- Release summary exemplar:
  `data/exports/releases/v2-operational-anchors-1/operational_anchors_summary.json`.
- Downstream (bus-reliability-tracker) pins the EXISTING release by manifest SHA and
  reads its summary file as-is; new fields may only appear in FUTURE release ids. Their
  compatibility constraints: `anchor_id` scheme, `event_record_id` mapping, and
  `schema_version: 1` must not change meaning (plan 032 owns any breaking evolution).
- Corpus facts for the matrix (recompute, don't trust): sources 2,566 (post-028), of
  which 2,085 have `published_date_normalized`, 1,323 in 2023–2026; events 7,945 by
  `event_family` (implementation 746, launch 498, …) and `lifecycle_phase` (other 6,508,
  launched 467, …); anchors 633 rows.
- Test surface: `packages/pipeline/test/materialize/operational-anchors.test.ts`
  (~40 tests; none assert funnel/row_count relationships or reviewed-row counting).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Scoped tests | `bun test packages/pipeline/test/materialize/operational-anchors.test.ts` | all pass |
| Full gates | `bun run test && bun run validate && bun scripts/determinism-anchor.ts` | green / Issues: 0 |

## Suggested executor toolkit

Single executor session. Optionally dispatch one subagent to independently recompute
the matrix numbers with jq from `data/canonical/` and diff against your generated
artifact — a cheap cross-check that the generator has no off-by-one.

## Scope

**In scope**:
- `packages/pipeline/src/materialize/operational-anchors.ts` (summarize + exclusions
  emission ordering + drop counters; NOT the entry-gate semantics themselves)
- NEW `packages/pipeline/src/quality/coverage-matrix.ts` + CLI subcommand
- `packages/pipeline/test/materialize/operational-anchors.test.ts` (+ new matrix test)
- `docs/releases-and-provenance.md` (one paragraph naming the new summary fields)
- `LOG.md`, `plans/README.md`

**Out of scope**:
- Changing WHICH events enter the projection (plan 030 recovers links; the gate itself
  is correct policy).
- Any byte of `data/exports/releases/v2-operational-anchors-1/` (downstream-pinned).
- `schema_version` bumps or exclusion-reason retirement (plan 032).
- The exclusion-reason CATEGORY hierarchy idea from the audit — explicitly deferred to
  plan 032 (record as such in the PR).

## Git workflow

- Branch: `advisor/029-honest-funnel`.
- No push without operator instruction.

## Steps

### Step 1: Summary truthfulness (additive fields only)

In `summarizeOperationalAnchors` (and its type `OperationalAnchorSummary`):
- Split populations: `broad_row_count` (anchor_id prefix `operational:`),
  `reviewed_row_count` (prefix `operational-reviewed:`),
  `distinct_operational_event_count` (unique `event_record_id` across all rows).
  Keep `row_count` as total rows (document: broad + reviewed).
- Funnel: keep every existing key with its current value semantics (do not break
  consumers of future releases who copied parsing from this one), and ADD:
  `operational_family_events_total` (new required input, like `canonicalEventCount`),
  `timeline_linked_distinct_events` (630-style), `unlinked_operational_events`
  (total − linked). Thread the new input from both call sites
  (`export-release.ts:304-314` and any test callers).
- Reviewed rows: add `study_eligible_reviewed_count` so `study_eligible` is
  decomposable.

**Verify**: scoped tests pass after updating fixtures; a new test asserts
`row_count === broad_row_count + reviewed_row_count` and
`unlinked_operational_events === operational_family_events_total − timeline_linked_distinct_events`.

### Step 2: Count the silent drops at the entry gate

In `computeOperationalAnchors` (`:995-1003`), count what the loop skips
(non-event objects, non-operational families) and return them as a side-channel
(e.g. a second return value or an options-out object) that `summarizeOperationalAnchors`
folds into the summary as `entry_gate: { relations_examined,
non_event_timeline_objects, non_operational_event_objects }`. Keep
`computeOperationalAnchors`' primary return type stable for existing callers if
possible; if a signature change is unavoidable, update all call sites in the same
commit.

**Verify**: new test with a fixture containing one non-event object and one
non-operational event asserts the counters.

### Step 3: Fix the double-emitted scope reasons

In `exclusions` (`:744-776`): emit `missing_route_scope_evidence` only when
`routeRecordCount > 0 && !evidenceCoverage.route_scope`; same for the treatment pair.
`missing_route_scope` / `missing_treatment_scope` keep their current triggers.

**Verify**: update the existing exclusion tests; add one: a row with zero routes gets
`missing_route_scope` but NOT `missing_route_scope_evidence`; a row with an uncited
route relation gets only the `_evidence` reason.

### Step 4: The coverage matrix artifact

New `coverage-matrix.ts` + CLI `bun packages/cli/src/cli.ts coverage-matrix` writing
`data/quality/coverage-matrix.json` (stableJson) + a small human `coverage-matrix.md`
next to it:
- **Layer A — corpus**: events by `event_family` × `lifecycle_phase` × date-era
  (pre-2023 / 2023-2026 / undated, from `date_normalized`); sources by
  `published_date_normalized` year and by `authority` publisher-official match.
- **Layer B — projection**: the summary numbers from Step 1-2, presented in two
  clearly separated forms. (1) The SEQUENTIAL funnel: only the summarize stages
  (1,244 → 630 linked → dated → realized → precise → route → treatment → evidence →
  conflict-free → eligible), each a subset of the previous. (2) The OVERLAPPING
  exclusion histogram — per-reason counts explicitly labeled non-additive (a row
  carries many reasons), plus a scope-overlap table with the verified shape: 617
  distinct rows missing route OR treatment scope, 564 missing BOTH, 1,181
  dimension-instances total (582 route + 599 treatment). Never present the histogram
  as attrition.
- **Layer C — downstream-served**: do NOT read `LATEST` — after plan 026 it points at
  `v1-rc5`, which is a manifest_version-1 release with NO operational-anchor artifact,
  while the consumer pins `v2-operational-anchors-1`. Instead: introduce
  `data/quality/downstream-pin.json` (`{consumer, release_id, manifest_sha256,
  pinned_at}`, seeded with `v2-operational-anchors-1` /
  `b69bd9458a92a817c329cfaa2741ef93dece4d2bbdb4695ea775b09622f5c56c` / 2026-07-11;
  plan 034 updates it at each cutover) and have Layer C read THAT release dir,
  restating its summary + verifying its manifest SHA matches the pin. If the pinned dir
  is absent locally (fresh public clone — it is untracked), emit an explicit
  "pinned release not present locally; layer C skipped" section rather than failing or
  silently substituting another release.

**Verify**: run it; jq-recompute two spot cells independently
(e.g. `jq -r 'select(.payload.event_family=="launch") | .payload.lifecycle_phase' data/canonical/events.jsonl | sort | uniq -c`)
and confirm they match the artifact. Second run → byte-identical file.

### Step 5: Gates, docs, LOG

One paragraph in `docs/releases-and-provenance.md` naming the new summary fields and
the matrix artifact; LOG entry (summary contract extended additively; next release cut
will carry the new fields; matrix introduced).

**Verify**: all four gates green.

## Test plan

- Extend `operational-anchors.test.ts`: population identity, funnel monotonicity
  (each stage ≤ previous), entry-gate counters, reviewed decomposition, the two
  exclusion-ordering cases.
- New `packages/pipeline/test/quality/coverage-matrix.test.ts` (model after an existing
  quality test): fixture records → expected matrix cells; determinism (two runs equal).

## Done criteria

- [ ] New summary fields present and internally consistent on a local recompute (assert via the new tests, not a release cut)
- [ ] `missing_route_scope`/`_evidence` (and treatment pair) are mutually exclusive per row in a fresh recompute
- [ ] `data/quality/coverage-matrix.{json,md}` generated, deterministic, spot-verified
- [ ] `data/exports/releases/v2-operational-anchors-1/**` untouched (`git status`)
- [ ] All four gates green; LOG + docs updated; `plans/README.md` row updated

## STOP conditions

- Adding funnel inputs forces changes to `OPERATIONAL_ANCHOR_SCHEMA_VERSION` or the
  manifest contract — that is plan-032 territory; report instead.
- Existing tests encode the OLD double-emission behavior in ways that suggest a
  downstream depends on it (search bus-reliability-tracker mentions in docs before
  changing; if found, report).
- The matrix generator needs data outside `data/canonical/` + the release dir
  (e.g. raw/ blocks) — keep it public-clone-safe; report if impossible.

## Maintenance notes

- Plan 030's recovery work will move `unlinked_operational_events` down and
  `timeline_linked_distinct_events` up — the matrix is the before/after instrument;
  re-run it in every subsequent plan's PR.
- Plan 032 owns any BREAKING funnel redesign (categories, schema_version 2); this plan
  deliberately stays additive.
- Reviewer: confirm no existing release file changed and that new fields are absent
  from any committed release (they appear only in future cuts).
