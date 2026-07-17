# Plan 030: Existing-corpus curation (Pass 1): completeness detector, row-level recoverability ledger, reviewed observation+relation recovery — with REQUIRED curated outcomes

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise.
>
> This plan is DONE only when its Tier-B curated outcomes are accepted, journaled,
> and materialized. If the owner (or owner-delegated reviewer) is unavailable to
> review proposals, complete Tiers A and mark the row
> "IN PROGRESS (awaiting owner review of proposals X..Y)" — never mark DONE on
> infrastructure alone. Provider-backed batch canaries (Step 6) are a separately
> owner-gated ACCELERATOR, not the path to DONE.
>
> **Drift check (run first)**: `git diff --stat d28b64c8..HEAD -- packages/pipeline/src/materialize/operational-anchors.ts packages/agents/src/prompts.ts data/operational-anchor-review/`
> Expect only plan-026..029 commits. Recompute and adopt YOUR corpus numbers where
> this plan cites 1,244 / 614 / 617 / 564 / 18 / 15 (plans 028-029 may have shifted them
> slightly). On structural mismatch with "Current state", STOP.

## Status

- **Priority**: P1 — this is the curation pass the whole track exists for
- **Effort**: L
- **Risk**: MED (writes proposals and journal entries; every apply path is reviewed)
- **Depends on**: 028 (registry repaired), 029 (instrumented funnel + matrix)
- **Category**: bug (completeness) + data curation
- **Planned at**: commit `d28b64c8`, 2026-07-12 (revised same day after review: observation
  recovery added — relations alone cannot close the Queens gap; recoverability ledger
  added; curated outcomes made REQUIRED, not optional)

## Why this matters

The consumer's real need is evidence curation, not more machinery: with citations,
what happened, when, on which routes, with which treatment(s), and does the document
plan it or confirm it. Today 1,244 implementation/launch events exist, 614 never enter
the projection (no `has_timeline_event` edge), 617 of 633 projected rows lack route
and/or treatment scope (564 lack both; 1,181 missing dimension-instances), and the
highest-value evidence is already staged but uncurated. Two verified exemplars define
the two curation shapes this plan must deliver:

1. **Missing OBSERVATIONS, not just relations**: Queens post-launch confirmations
   exist as raw blocks — `meeting_doc_179606` (published 2025-07) block p010_c0011
   "On June 29, the MTA launched the Queens Bus Network Redesign…", and
   `meeting_doc_186616` (published 2025-09-29) block p025_c0003 (Phase Two, August
   31st, concluded full implementation) — but those two ingests produced ZERO
   canonical events. Every existing Queens timeline relation is `planned`
   (170921 as-of 2025-04; 174141 as-of 2025-05-28 — a pre-launch doc despite its
   past-tense event names). Without a reviewed path to ADD the delivered
   event/status observations from those staged blocks, plan 031's reconciliation has
   nothing legitimate to resolve against.
2. **Missing RELATIONS**: `brt_routes_fullreport` states Bx12 (June 2008) and M15
   (October 2010) component lists verbatim (blocks ~p007_c0002, p012_c0005); the
   treatment records exist (`treatment_bx12-tsp`, `treatment_m15-offset-curbside-lanes`,
   …) but zero `has_treatment`/timeline links connect them to the launch events.
   The sequential funnel has **18 route-resolved rows total and 15 of those still
   missing resolved treatment scope**. Bx12/M15 are documented SBS *bundles*; adding
   their component links makes the evidence complete for plan 032, but MUST NOT be
   reported as turning either launch into a single-treatment v1 row.

The ingest prompt deliberately forbids cross-product pairing
(`packages/agents/src/prompts.ts:111-114`), so recovery must be per-evidence curation
through review — and this plan's definition of done REQUIRES the two exemplar families
to actually land, with the funnel deltas measured.

## Current state

- Entry gate: `operational-anchors.ts:995-1003` (has_timeline_event → operational
  family). Corpus: 1,244 operational events / 630 linked / 614 unlinked.
- Scope gaps (verified on the pinned release): 617 rows missing route OR treatment
  scope; 564 missing both; 582 route-instances + 599 treatment-instances = 1,181.
  The sequential funnel contains 18 route-resolved rows total; 3 already pass the
  treatment stage, leaving **15 route-resolved treatment gaps**. Keep those three
  populations separate in code, artifacts, prose, and tests.
- Queens facts (verified 2026-07-12): canonical launch events exist ONLY from
  pre-launch docs (`meeting_doc_170921` pub 2025-04; `meeting_doc_174141` pub
  2025-05-28), all timeline relations `planned`;
  post-launch sources `meeting_doc_179606` (pub 2025-07) and `meeting_doc_186616`
  (pub 2025-09-29) are staged with confirmation blocks but yielded no events.
- Reviewed-overlay machinery to mirror (do not fork):
  `operational-anchor-review.ts` — accepted decisions in
  `data/operational-anchor-review/accepted/decisions/*.json`, strict `validateDecision`
  (:309-428), quarantine + hard-fail at release. Attribution fields: `reviewer`,
  `accepted_at`, `rationale`.
- Correction substrate: `records/semantic-corrections.ts` (`patch_payload` op; journal
  `data/semantic-corrections/corrections.jsonl`).
- Shape defects to fix here: 3 events with OBJECT-typed `payload.date_normalized`
  (`event_board-meeting-dec182024` "12/18/24", `event_finance-committee-meeting-dec162024`
  "12/16/24", `event_mta-board-meeting-07212021` "7/21/2021").
- Journals: append-only `data/submissions/*.jsonl`; canonical JSONL re-derived by the
  factory (plan 028 mechanics); accepted-entry shape copyable from any 2026-06-20
  journal line.
- 15 event→event `has_timeline_event` edges are LEGAL per shape
  (`relations.ts:833-836`) and excluded as `unsupported_subject_scope` — reclassify
  only via proposals, never silently.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Gates | `bun run typecheck && bun run test && bun run validate && bun scripts/determinism-anchor.ts` | green / Issues: 0 |
| Matrix (before/after) | `bun packages/cli/src/cli.ts coverage-matrix` | deterministic artifact |
| Re-materialize | `bun run materialize && bun run rebuild-db` | exit 0 |

## Suggested executor toolkit

- Steps 1-4: one executor session (Codex CLI or Claude Code).
- Step 5 drafting: the executor itself drafts the ~8-14 required proposals by reading
  staged blocks (no provider spend); dispatch ONE independent adversarial-verifier
  subagent per proposal batch whose brief is to REFUTE each proposal against its cited
  blocks before it goes to the owner. Acceptance is always owner / owner-delegated.
- Step 6 (optional accelerator, owner-gated spend): one subagent per source-family for
  the long tail, same queue, same verifier pattern.

## Scope

**In scope**:
- NEW `packages/pipeline/src/quality/operational-coverage.ts` + CLI subcommand
  (detector + ledger; read-only over canonical + staged blocks)
- NEW queue `data/operational-anchor-review/proposed/` (+ loader/validator module +
  validate lane)
- `data/quality/operational-coverage/recoverability-ledger.jsonl` (generated, then
  overlaid from durable review decisions; never hand-edited)
- NEW durable decisions + search receipts under
  `data/operational-anchor-review/ledger-decisions/`
- `data/semantic-corrections/corrections.jsonl` (append: 3 `patch_payload`)
- `data/submissions/<recovery journal(s)>.jsonl` (append-only; ONLY from accepted
  proposals)
- Tests under `packages/pipeline/test/quality/` and `.../materialize/`
- `LOG.md`, `plans/README.md`

**Out of scope**:
- Loosening the ingest prompt / cross-product doctrine.
- Changing the projection entry gate.
- Full re-ingest of staged sources (targeted, block-cited observation recovery through
  review is NOT re-ingest; plan 033 handles genuinely absent evidence).
- Bundle atomization without per-component dated evidence (plan 032 semantics).

## Git workflow

- Branch: `advisor/030-curation-pass-1`.
- Commits: (1) detector+ledger+tests, (2) shape corrections + regen, (3) queue
  infrastructure, (4+) one commit per accepted proposal batch, named by source.

## Steps

### Step 1: Detector + row-level recoverability ledger

`operational-coverage.ts` emits under `data/quality/operational-coverage/` (stableJson):
- `unlinked-operational-events.jsonl` — the 614, each with same-source candidate
  subjects (projects/routes/corridors/treatments canonicalized from the same
  source_id), candidates clearly labeled, no auto-linking.
- `treatment-gap-route-resolved.jsonl` — the **15** rows that pass the sequential
  route stage but fail the treatment stage, joined to same-source
  treatment_components. Separately report `route_resolved_total: 18` and
  `route_and_treatment_resolved_total: 3`; never label all 18 treatment gaps.
- `date-refinement-candidates.jsonl` — season/year-precision anchors whose cited
  blocks (±3 neighbors) contain month/day strings by regex (guard raw/ with existsSync;
  emit `skipped_no_raw` for public clones).
- **`recoverability-ledger.jsonl`** — THE row-level ledger the strategy stands on: one
  entry per (anchor_id × missing dimension) — expect ≈1,181 entries over ≈617 rows —
  fields: `{gap_id, anchor_id, event_record_id, dimension: "route"|"treatment"|
  "date_precision"|"delivered_status", acquisition_priority: boolean,
  verdict: "relation_missing"|"record_missing"|"absent_in_source"|
  "bundle_documented"|"bundle_ambiguous"|"unreviewed", verdict_basis:
  "detector:<rule>"|"review:<decision_id>"|null, search_receipt_ids: string[],
  updated_at}`. `gap_id` is stable from `(anchor_id, dimension)`. Initialize verdicts
  ONLY where a detector
  rule justifies them (e.g. stratum-1 rows with same-source components →
  `relation_missing`); everything else starts `unreviewed`. Percentages are henceforth
  COMPUTED from this file — the 2026-07-12 sampled estimates (~7% recoverable) are
  provisional until the ledger says otherwise.

The generator MUST reapply accepted, append-only decisions from
`data/operational-anchor-review/ledger-decisions/*.json`; regeneration may never turn
an adjudicated gap back into `unreviewed`. Each decision binds one `gap_id`, its prior
verdict, new verdict, reviewer, timestamp, rationale, and zero or more search receipts.
A search receipt records the exact source ids searched, title/publisher filters and
block queries used, matching block ids (possibly empty), and the corpus/materialization
fingerprint searched. `absent_in_source` is legal only with a non-empty receipt that
searched every staged source linked to the event's subjects plus the staged-source
registry for the target route/project/treatment terms.

Define the **priority acquisition feeder** deterministically as the union of:
1. gaps whose candidate operational-date interval intersects 2023-04-01 through
   2026-12-31; and
2. gaps in the route-redesign, TSP, or busway families supported by a source published
   in 2023–2026, including explicit seed cases for Queens Phases 1/2, Flatbush TSP,
   and Tremont/Bx36.
The CLI prints this population and its verdict histogram. Step 5 may not finish until
every feeder gap has a durable non-`unreviewed` decision. This is the exhaustive bridge
to plan 033; a capped sample is not acceptable.

**Verify**: counts printed match the drift-check numbers, including 18 route-resolved
total / 15 treatment gaps / 3 already treatment-resolved; two runs byte-identical;
ledger entry count = route-instances + treatment-instances (+ any date/status rows you
define — document the exact population rule in the module header); spot-open 3 rows of
each artifact and confirm cited evidence exists. Apply a fixture decision, regenerate,
and assert its verdict and receipt binding survive byte-for-byte.

### Step 2: Payload-shape corrections

Append 3 `patch_payload` corrections (provenance `deterministic_rule`) setting
`date_normalized` to `"2024-12-18"`, `"2024-12-16"`, `"2021-07-21"` (confirm each
raw_text parse yourself) with `date_precision: "day"`. Re-materialize.

**Verify**: `jq -c 'select(.payload.date_normalized | type=="object")' data/canonical/events.jsonl` → empty; gates green.

### Step 3: Proposal queue with TWO kinds

`data/operational-anchor-review/proposed/<kind>/<proposal_id>.json`, mirroring the
accepted-decision parser's rigor (copy patterns from
`operational-anchor-review.ts:100-207`; reject unknown fields; verify bound records +
exact evidence refs):

- **`relations/`** — `{proposed relation: {relation_kind ∈ {has_timeline_event,
  has_treatment, affects_route, serves_route}, subject_record_id, object_record_id,
  assertion_status, as_of_date}, evidence_bindings[], provenance, rationale}`.
- **`observations/`** — an OBSERVATION BUNDLE from ONE staged source: one or more new
  records (typically an event with family/lifecycle/date fields) plus their relations,
  each element carrying block-cited evidence (source_id + block ids that must exist in
  `raw/sources/<sid>/blocks.jsonl`), plus provenance + rationale. This is the reviewed
  path for "the document confirms delivery but no observation was ever extracted" —
  the Queens case. Bundles must preserve document-time semantics: a post-event doc
  legitimately yields a realized event + `delivered` relation with `as_of_date` = its
  publication context.

Acceptance path (module header + README): owner or owner-delegated reviewer sets
`accepted_by`/`accepted_at` and the executor converts the proposal VERBATIM into
accepted-journal entries in `data/submissions/<ts>_recovery_<source>.jsonl` (same
entry shape as ingest journals, citing the proposal id), runs `bun run materialize`,
and moves the proposal to `proposed/applied/`. Rejected proposals move to
`proposed/rejected/` with a reason. No other apply path exists. Add validate lane
`invalid_relation_proposal` covering the whole proposed/ tree (malformed → gate fails;
empty dir → clean).

**Verify**: fixture proposals of BOTH kinds round-trip (valid passes; mutated evidence
id fails; unknown field fails); gates green with empty queue.

### Step 4: Draft the REQUIRED proposal set (no provider spend)

Reading staged blocks directly, draft:
1. **Queens delivered observations** — from `meeting_doc_179606`: Phase 1 launch event
   (family `launch`, lifecycle `launched`, date 2025-06-29, evidence p010_c0011 ±
   neighbors) + `has_timeline_event` relation (subject
   `project_queens-bus-network-redesign`, status `delivered`, as_of from the doc);
   from `meeting_doc_186616`: Phase 2 (2025-08-31, evidence p025_c0003) + delivered
   relation + (if the block supports it) a completion/status observation for the full
   redesign.
2. **Stratum-1 treatment links** — for at least Bx12 and M15 (target all
   brt_routes_fullreport-family rows): `has_treatment`/timeline links between the
   launch events and the EXISTING treatment records, each citing the component block.
   Treat each SBS launch as a documented bundle when more than one component is linked:
   set the treatment-gap ledger decision to `bundle_documented`, preserve every member,
   and do not claim `resolved_treatment_scope` under the v1 single-treatment gate.
3. **Single-candidate timeline links** — unlinked operational events whose source has
   exactly one same-source project/route candidate (from Step 1), where the cited
   block states the connection.
Run the adversarial-verifier subagent over the batch; drop or fix anything it refutes
with the block text.

**Verify**: every proposal validates; every evidence binding resolves to a real block;
verifier verdicts recorded in each proposal's rationale; queue count reported
(expect ≈8-14 from items 1-2 plus whatever item 3 yields).

### Step 5 [OWNER REVIEW — required for DONE]: Accept, journal, materialize, measure

Owner/delegate reviews the queue. For accepted proposals: journal → materialize →
rebuild-db → re-run coverage-matrix and the Step-1 detector (ledger entries flip to
`review:<proposal_id>` verdicts). Record per-batch accept/reject counts in LOG.md.
Then adjudicate **every priority acquisition-feeder gap** using the durable ledger
decision/search-receipt path: `relation_missing` or `record_missing` where staged
evidence can close it; `bundle_documented`/`bundle_ambiguous` where that is the honest
treatment shape; `absent_in_source` only after the required exhaustive staged-corpus
search. Draft/apply proposals for recoverable rows before marking them terminal.

**Tier-B minimum for DONE** (the curated outcomes this plan exists to deliver):
- Queens Phase 1 AND Phase 2 delivered observation bundles applied (canonical now
  contains realized, delivered, post-event-sourced Queens launch events).
- ≥4 stratum-1 treatment-link proposals applied (Bx12 + M15 at minimum).
- Ledger: 100% of the 15 route-resolved treatment gaps, 100% of drafted-proposal
  rows, and **100% of the priority acquisition feeder** carry durable
  non-`unreviewed` verdicts with required receipts.
- Matrix delta recorded: `timeline_linked_distinct_events` strictly increases and
  accepted treatment-relation/member counts strictly increase. Report
  `resolved_treatment_scope` honestly; it may remain 3 because Bx12/M15 are bundles,
  not single-treatment anchors. Bundle usability is verified by plan 032's occurrence
  fixtures and production projection, never by relabeling the v1 funnel.

**Verify**: gates green after every batch; zero journal entries without a proposal id;
matrix before/after archived in the PR.

### Step 6 [OWNER-GATED, optional accelerator]: Batch canaries for the tail

Provider-backed or subagent batch drafting for the remaining unlinked events and
date-refinement candidates, same queue + verifier + review flow, one source-family at
a time; stop a family if its verifier rejects >50% of drafts. Update the ledger as
verdicts land.

## Test plan

- Detector + ledger: fixture corpus (linked event; unlinked with unique candidate;
  season-date row with month string in fixture blocks; stratum-1-shaped row) → exact
  expected artifact rows, incl. 18-vs-15 population accounting, ledger verdict
  initialization rules, durable-decision replay, stale-fingerprint rejection, and the
  rule that `absent_in_source` without a complete receipt fails validation.
- Queue validator: valid/invalid fixtures for BOTH kinds (bad kind, dangling record
  id, wrong evidence id, unknown field, observation bundle whose block id is absent) →
  each rejected with the right reason.
- Model on `operational-anchor-review.test.ts`.

## Done criteria

- [ ] Tier A: detector + ledger + queue + lane live; artifacts deterministic; tests pass; 3 shape corrections applied
- [ ] Tier B: Queens Phase 1+2 delivered bundles AND ≥4 stratum-1 links accepted, journaled, materialized
- [ ] Ledger has zero `unreviewed` entries for all 15 route-resolved treatment gaps,
  every drafted-proposal row, and every priority acquisition-feeder gap; decisions and
  search receipts persist across regeneration; ledger-computed recoverable/absent
  split reported (superseding the sampled 7%/93%)
- [ ] Coverage-matrix before/after archived; funnel deltas stated in LOG.md
- [ ] All four gates green; zero unreviewed apply paths (`rg` every recovery journal for proposal ids)
- [ ] `plans/README.md` row updated (or IN PROGRESS with the awaiting-review note)

## STOP conditions

- Owner review unavailable → stop after Step 4 with the queue full and the row marked
  IN PROGRESS (this is the only acceptable non-DONE exit).
- Any priority acquisition-feeder gap remains `unreviewed`, or an
  `absent_in_source` decision lacks a complete current-fingerprint search receipt →
  remain IN PROGRESS; plan 033 must not receive an incomplete frontier.
- Any proposal encodes a route×treatment×date combination not stated by a single
  cited block context — the forbidden cross-product; drop it.
- An observation bundle would DUPLICATE an existing canonical event rather than add
  the missing delivered observation (check `record_id`/label collisions first; if the
  right move is updating an existing record's relations instead, propose that).
- Re-materialize after a batch changes records outside the expected new
  records/relations — diff and report.
- The verifier refutes a Queens bundle (the plan's premise would be wrong — report
  with the block text).

## Maintenance notes

- The ledger is now the single source of truth for recover-vs-acquire; plan 033
  consumes ONLY receipt-backed `absent_in_source` rows from the exhaustively
  adjudicated priority feeder, and plan 034's acceptance reads the deltas.
- Plan 031 hard-depends on this plan's Queens bundles (its supersedence needs a
  post-event delivered member to resolve against).
- Future ingest waves land into the same detector→ledger→queue loop.
- Reviewer: audit one accepted proposal of EACH kind end-to-end (block → proposal →
  journal → canonical → anchor/matrix delta) before approving.
