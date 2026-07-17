# Plan 033: Execute the in-window acquisition loop: search, acquire, ingest, curate, and close at least one 2023–2026 occurrence

> **Executor instructions**: Follow every step. This is an execution plan, not a
> target-list deliverable. It is DONE only after an actual official-source search,
> acquisition, staged intake, ingest, reviewed curation, materialization, and
> occurrence recompute produce at least one candidate-ready onset on or after
> 2023-04-01. If acquisition/provider/reviewer authority is unavailable, prepare the
> queue and mark this plan IN PROGRESS with the exact gate; do not mark it DONE. Run
> every verification and honor the STOP conditions. Update `plans/README.md` when the
> outcome is real.
>
> **Drift check (run first)**: plans 030–032 must be DONE. Confirm
> `data/quality/operational-coverage/recoverability-ledger.jsonl` has zero
> `unreviewed` priority-feeder rows, every `absent_in_source` target has current search
> receipts, and `bun packages/cli/src/cli.ts occurrences --dry-run` succeeds. If any
> premise fails, return to the owning plan rather than inventing targets.

## Status

- **Priority**: P1 (the existing resolved candidates are outside the outcome window)
- **Effort**: L/iterative
- **Risk**: MED (external-source retrieval, provider spend, and reviewed data writes;
  all are bounded and provenance-preserving)
- **Depends on**: 028–032 DONE, including plan-030 exhaustive priority ledger and
  plan-032 production occurrence contract
- **Category**: data acquisition + curation
- **Planned at**: commit `d28b64c8`, 2026-07-12 (rewritten 2026-07-12: a list-only or
  search-only outcome can no longer satisfy DONE)

## Why this matters

The outcome corpus begins 2023-04. Existing wiki candidates are historical SBS/fare
collection events, so perfect cleanup of those rows cannot unlock an in-window study.
Plan 030 exhausts evidence already staged; this plan operates only on its
receipt-backed `absent_in_source` frontier. The high-value missing evidence is narrow:
Queens redesign phase route rosters, delivered TSP activations, and busway conversion
onsets/components. The work is only useful if a source is actually acquired and its
evidence reaches canonical records and the production occurrence projection. A
prioritized Markdown list is preparation, not completion.

## Current state

- Input of record:
  `data/quality/operational-coverage/recoverability-ledger.jsonl`, generated and
  durably overlaid by plan 030. Eligible targets are `acquisition_priority: true` +
  `verdict: "absent_in_source"` + complete current-fingerprint receipts.
- The priority families are `route_redesign`, `transit_signal_priority`, and
  `busway`; lower-value historical gaps do not outrank these merely because they are
  easier.
- Verified seed gaps at planning time:
  - Queens Phases 1/2 have post-event dates/status from 2025 evidence, but staged
    board materials lack a phase-bound official route roster.
  - Flatbush TSP is named in planning/kickoff material, but a delivered activation
    onset is absent.
  - Tremont/Bx36 busway is named by an official DOT page, but the complete
    route+component+delivered-onset binding is absent.
- Intake commands are existing and provenance-preserving:
  `import-sources <dir> --dry-run`, `import-sources <dir>`, and `prepare-source`.
  A captured source folder carries `metadata.json` plus `source.pdf`, `source.html`,
  `source.json`, or `text.txt`; staging writes block evidence and an import manifest.
- Ingest is provider-backed:
  `bun packages/cli/src/cli.ts ingest <source_id> --profile pioneer-deepseek-flash`.
  It requires the configured provider key/owner authorization. Reviewed correction
  still flows through plan 030's observation/relation proposal queue; model output is
  never accepted automatically.
- Plan 032's occurrence output and accepted occurrence-review decision are the
  completion check: plural routes and bundles are valid; single-route/single-treatment
  coercion is forbidden.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Generate target list | new/extended plan-030 acquisition-list command | deterministic JSON+Markdown from ledger |
| Intake dry-run | `bun packages/cli/src/cli.ts import-sources <capture-dir> --dry-run` | discovery report, no staging |
| Intake | same without `--dry-run` | staged source(s), import manifest |
| Ingest | `bun packages/cli/src/cli.ts ingest <source_id> --profile pioneer-deepseek-flash` | accepted/rejected journal + transcript |
| Recompute | `bun run materialize && bun run rebuild-db && bun packages/cli/src/cli.ts coverage-matrix && bun packages/cli/src/cli.ts occurrences --dry-run` | target gap and occurrence deltas visible |
| Gates | `bun run typecheck && bun run test && bun run validate && bun scripts/determinism-anchor.ts` | exit 0 / Issues: 0 |

## Scope

**In scope**:
- `data/quality/acquisition/target-list.{json,md}`.
- NEW append-only search receipts and dispositions under
  `data/quality/acquisition/receipts/`.
- A bounded set of official MTA/NYC DOT sources needed by the selected targets,
  captured and staged through existing intake.
- Ingest journals/transcripts for those sources and plan-030 reviewed
  observation/relation/ledger decisions.
- Regenerated coverage/occurrence quality artifacts, `LOG.md`, `plans/README.md`.

**Out of scope**:
- A bulk crawl of 2023–2026 or the 2,500+ unstaged captures.
- Unofficial blogs/social posts as the sole onset, route, treatment, or delivered-
  status evidence.
- Hand-placing files in `raw/`, bypassing source metadata/manifests, or using inferred
  route×treatment×date combinations.
- Approving a downstream study; plan 034 only requires the candidate reach review.

## Git workflow

- Branch: `advisor/033-execute-in-window-acquisition`.
- Commit deterministic target/receipt schema first, then one logical commit per
  accepted source/curation batch. Raw capture policy remains as configured; do not
  force-add untracked PDFs.

## Steps

### Step 1: Generate the bounded, ledger-driven round

Emit one row per receipt-backed priority frontier gap:
`{gap_id, occurrence_id|null, family, route_or_area, date_window,
blocking_dimensions, evidence_needed, source_types, priority, receipt_ids,
status}`. Group rows that one document could legitimately close, but preserve each
`gap_id`. Initial order:

1. Queens Phase 1 and 2 official route/effective-date profiles or notices;
2. delivered TSP activations from 2023–2026, beginning with Flatbush;
3. delivered busway conversions from 2023–2026, beginning with Tremont/Bx36;
4. remaining priority-feeder gaps.

Cap one round at 25 gaps. Select at least three targets across at least two families.
The list generator fails if a target is `unreviewed`, lacks a complete plan-030
receipt, or points only to a pre-2023 occurrence.

**Verify**: two generations are byte-identical; target count reconciles to the
priority ledger; every row names its blocking occurrence/anchor dimension and prior
receipt.

### Step 2: Perform and persist the official-source search

Actually search official MTA and NYC DOT properties, including agency project/service
pages, board books, press releases, implementation notices, and final route profiles.
For each target persist a receipt:

`{receipt_id, gap_ids, searched_at, operator, exact_queries, domains, urls_inspected,
candidate_urls, disposition: "candidate_found"|"absent_after_search"|"blocked",
rationale}`.

Inspect candidate content, not just search snippets. A useful candidate must state at
least one missing binding (onset/status, phase route roster, or treatment member) and
be an official/public agency source. Search all selected targets; continue down the
bounded list until at least one candidate document is found. `absent_after_search` is
an honest result for a target but does not satisfy this plan's acquisition outcome.

**Verify**: at least three executed receipts span two families; every inspected URL
has a disposition; at least one receipt is `candidate_found`. If none is found, expand
within the 25-gap cap and remain IN PROGRESS rather than marking DONE.

### Step 3: Acquire and stage the source(s)

Capture each selected official document/page with URL, final URL, publisher,
publication/document date, retrieval timestamp, content type, byte length, and SHA-256
in `metadata.json`; retain the actual source artifact. Run intake dry-run, inspect
dedupe/collision output, then stage through `import-sources` or `prepare-source`.
Never overwrite a prior capture with `--force` merely to reuse an id.

**Verify**: each acquired source has a staged directory, block evidence, and an import
manifest binding the original URL and hash; `bun run validate` remains Issues: 0.

### Step 4 [OWNER-GATED PROVIDER]: Ingest every acquired source

Run the configured ingest profile for every acquired source. Inspect accepted and
rejected journals plus transcript for truncation/evidence failures. Re-run the source
registry lane. A staged-but-uningested document does not count as acquisition closure.

**Verify**: each source has a completed ingest journal/transcript; every accepted
observation cites real block ids; registry coverage remains complete. Provider failure
or absent authorization leaves the plan IN PROGRESS.

### Step 5 [OWNER/DELEGATE REVIEW]: Curate and apply the missing bindings

Run plan 030's detector/queue on the new sources. Draft the exact observation/relation
bundles needed for target gaps; adversarially verify them; obtain owner/delegate
acceptance; journal verbatim; materialize and rebuild. Update ledger decisions and
search receipts to `closed` or `evidence_found_partial` with proposal/journal ids.

For Queens, route evidence must be phase-bound; a final-network roster without a
Phase-1/Phase-2 binding cannot be assigned to both dates. For TSP/busway, planned
language cannot become delivered status. For a multi-treatment launch, preserve the
bundle.

**Verify**: every `closed` disposition names the canonical record/relation ids and the
before/after exclusion diff. There are zero journal entries without an accepted
proposal id.

### Step 6 [OWNER/DELEGATE REVIEW]: Continue until one in-window occurrence is candidate-ready

Re-run plan 031 cluster amendments/review where the new source joins an existing
occurrence; then run the plan-032 occurrence computation. Draft and accept a plan-032
occurrence-review decision binding the complete onset, route set, atomic/bundle
treatment, and evidence; a pre-enrichment decision that no longer matches is stale and
must be replaced through review. At least one newly closed occurrence must satisfy all
of:

- resolved, official post-event onset date with precision day or month;
- onset date on or after `2023-04-01`;
- at least one current GTFS route with binding evidence;
- treatment represented honestly as atomic or bundle, with member evidence;
- delivered/realized status and complete provenance;
- current accepted occurrence-review decision;
- no temporal, spatial, treatment, evidence, authority, conflict, or review exclusion
  blocking downstream projection.

If the first acquired source closes only part of a gap, repeat Steps 2–5 on the next
target. Do not lower the bar or substitute a historical event.

**Verify**: write a deterministic acceptance receipt naming the `occurrence_id`, onset,
route ids, treatment discriminant/members, resolver source/block ids, closed gap ids,
and zero blocking exclusions. Two occurrence runs are byte-identical and preserve any
pre-existing occurrence id through enrichment.

### Step 7: Record residue and gates

Record all target dispositions, including honest `absent_after_search` rows, partial
finds, cost/run counts, and the candidate-ready receipt. Re-run the matrix and all four
gates. The residue is the next acquisition round; it is not silently dropped.

## Test plan

- If target/receipt generation requires new code, add fixture and determinism tests
  under `packages/pipeline/test/quality/`.
- Validation tests reject a target sourced from `unreviewed`, an absent disposition
  without URLs/queries, a closed gap without accepted proposal/journal ids, and a
  candidate-ready receipt with onset before 2023-04 or any blocking exclusion.
- Use plan 032 fixtures to confirm enrichment preserves `occurrence_id` and bundle
  shape.

## Done criteria

- [ ] Deterministic target list contains at least three executed targets across two
  priority families, each tied to receipt-backed ledger gaps.
- [ ] Actual official-source searches are persisted; at least one useful document is
  acquired and staged through intake.
- [ ] Every acquired source is ingested; its missing bindings are reviewed, accepted,
  journaled, materialized, and reflected in ledger/exclusion diffs.
- [ ] At least one **new** candidate-ready occurrence has onset `>= 2023-04-01`, a
  precise date, evidenced route(s), honest atomic/bundle treatment, delivered status,
  official provenance, a current accepted occurrence-review decision, and zero
  blocking projection exclusions.
- [ ] Candidate-ready acceptance receipt exists; all residues/dispositions recorded;
  occurrence output deterministic and ids stable.
- [ ] All four gates green; LOG and `plans/README.md` updated.

## STOP conditions

- Plan-030 priority ledger contains `unreviewed` rows or stale/missing receipts →
  return to plan 030; do not construct targets from an unaudited gap.
- Intake reports an existing-id collision → resolve explicitly; never overwrite.
- A source is unofficial or only planned/aspirational for a delivered claim → it may
  be context, not closure.
- Provider or owner/delegate review is unavailable → preserve completed receipts,
  queue the next action, and mark IN PROGRESS; never DONE.
- Searches find no useful document within the first targets → expand within the
  bounded priority list and report residue. If no candidate-ready occurrence is
  produced, the plan remains IN PROGRESS/BLOCKED; list-only is not success.
- Closing a target would require route×treatment×date inference → leave it open.

## Maintenance notes

- Repeat this exact ledger→search→intake→ingest→review→occurrence loop for later
  rounds. Never regress to bulk corpus counts as the success metric.
- Plan 034 is a hard dependent and may not cut/repin until the candidate-ready receipt
  exists.
- Downstream approval remains independent. This plan guarantees that a defensible
  in-window candidate can be presented, not that the study reviewer must approve it.
