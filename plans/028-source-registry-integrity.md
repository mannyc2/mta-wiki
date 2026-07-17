# Plan 028: Enforce one-source-one-row: merge duplicate source records, backfill the five missing registry rows, and add permanent validate lanes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `jq -r '.source_id' data/canonical/sources.jsonl | sort | uniq -d` must print exactly
> the 5 ids listed under "Current state", and
> `git diff --stat d28b64c8..HEAD -- packages/db/src/identity.ts packages/pipeline/src/materialize/materialize.ts packages/pipeline/src/validate.ts` must show
> only plan-026/027 commits. On any mismatch, compare "Current state" excerpts to the
> live tree; if they diverge, STOP.

## Status

- **Priority**: P1 (the prior audit's step 1; blocks corpus expansion and 029-033)
- **Effort**: M
- **Risk**: MED (regenerates canonical JSONL through the deterministic factory)
- **Depends on**: plans/026-baseline-hygiene-and-agents-refresh.md (clean baseline); 027 recommended but not required
- **Category**: bug (data integrity)
- **Planned at**: commit `d28b64c8`, 2026-07-12

## Why this matters

The source registry violates its core invariant in both directions. Five sources have
TWO canonical rows each (`source_meeting-doc-<id>` + `..._2` collision-suffix twins from
duplicate W4-era ingest runs), and five staged, heavily-cited sources have NO row at all
(287 records / 667 evidence refs cite them). Missing rows silently degrade
`sourceAuthority` to `"unknown"`, which feeds `untrusted_source_authority` exclusions in
the operational-anchor projection (88 in the current release) — including on Queens
redesign records that the downstream consumer specifically needs. Duplicate rows make
authority resolution pick an arbitrary winner. `bun run validate` reports `Issues: 0`
through all of it because no lane checks either invariant. One caution the first audit
pass missed (caught in review 2026-07-12): the pairs are NOT all genuine duplicates —
`source_meeting-doc-85841_2` is an accepted junk observation (`display_name: "Test
submission"`, `payload.title: "test"`, null publisher/date, submission
`sub_2348ce80a7d7d4a0`); blindly merging would fold test garbage into the real Capital
Program Committee record. This plan therefore dispositions each pair (retire junk,
merge genuine), fixes the identity rule so source records merge instead of forking,
backfills the five missing rows through the legitimate producer path (a journal entry,
never a hand-edit), and adds three validate lanes so the invariant can never silently
break again.

## Current state

- **Keying**: `packages/db/src/identity.ts:84-85`

  ```ts
  export function recordBaseIdForInput(input: ...) {
    if (input.observation_kind === "source") return `source_${slug(input.source_id)}`;
  ```

- **Collision suffixing**: `packages/pipeline/src/materialize/materialize.ts:524-536` —
  submissions are grouped by `stableHash(recordIdentity(entry))`; distinct identities
  sharing one `recordBaseId` get `${baseId}_${index + 1}`:

  ```ts
  const sorted = identities.sort();
  for (const [index, identity] of sorted.entries()) {
    ids.set(identity, index === 0 ? baseId : `${baseId}_${index + 1}`);
  }
  ```

  Two ingest runs for the same source submit two source observations with different
  payload/evidence → different `recordIdentity` hashes → two rows. (Find
  `recordIdentity` near that loop and read it before changing anything.)
- **The 5 duplicate pairs** (each: base row + `_2` row, different `submission_ids`,
  same title, created minutes apart on 2026-06-20): `meeting_doc_160631`,
  `meeting_doc_170871`, `meeting_doc_205331`, `meeting_doc_29966`, `meeting_doc_85841`.
- **The 5 missing sources** (staged in `raw/sources/<id>/`, cited by 287 canonical
  records, zero `"observation_kind":"source"` lines in their ingest journals — all five
  journals are from the 2026-06-08 20:13–20:31 first-wave window, when the ingest agent
  omitted the source observation): `jamaica`, `mta_automated_camera_enforcement`,
  `open_data_lessons_2026`, `queens_proposed_final_plan_addendum_2024`,
  `queens_service_change_board_item_2025`. Per-source journal example:
  `data/submissions/2026-06-08T20-13-01-642Z_3399304-b2d3eaaa_ingest_jamaica.jsonl`.
  Healthy sources DO have source observations (2,731 across all journals).
- **Blast radius**: `packages/pipeline/src/materialize/operational-anchors.ts:666-679`
  (`sourceRecordIndex` — last-write-wins on duplicate keys, no detection) and `:687-707`
  (`sourceAuthority` — unresolved ids coerce to `"unknown"`, publisher lookups silently
  skip) — `:773` turns non-official authority into `untrusted_source_authority`.
- **Validate gap**: `packages/pipeline/src/validate.ts` has no lane for (a) duplicate
  `source_id` among source rows, (b) record `source_id`/`source_ids[]` resolving to a
  source row, (c) `source_*_N` collision suffixes (`validateGlobalIdentities`
  at `validate.ts:447-477` flags `_\d+$` suffixes for GLOBAL kinds only, and `source`
  is not one — check `isGlobalRecordKind` in `packages/db/src/identity.ts`).
- **Repair substrate that already exists**: `packages/pipeline/src/records/semantic-corrections.ts`
  ops `retract_record | patch_payload | replace_endpoint | recite_evidence |
  set_review_state | supersede_record`, journal at
  `data/semantic-corrections/corrections.jsonl`, provenance
  `deterministic_rule | llm_triage | human`. Submission retirement:
  `data/submission-overrides/retired.json` (version 1, `retired` array), validated by
  `validateSubmissionRetirementOverrides` in
  `packages/pipeline/src/records/submission-overrides.ts:47` — read the existing file
  to copy the exact entry shape.
- **Pair dispositions** (verified 2026-07-12): `meeting_doc_160631`, `170871`,
  `205331`, `29966` — identical titles/payload metadata on both rows → GENUINE
  duplicates, merge. `meeting_doc_85841` — base row is the real "Capital Program
  Committee Meeting" (published 2022-04); the `_2` row is junk ("test", submission
  `sub_2348ce80a7d7d4a0`) → RETIRE the junk submission, do not merge it.
- **House rules**: never hand-edit `data/canonical/*.jsonl`; canonical JSONL is
  re-derived deterministically from `data/submissions/` journals (+ overrides +
  corrections) by the materialize factory; gates are typecheck + test + validate
  (Issues: 0) + `bun scripts/determinism-anchor.ts`.
- Baseline counts on this tree: sources.jsonl 2,566 rows / 2,561 unique source_id;
  84,024 canonical records; validate `Issues: 0`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `bun run test` | all pass |
| Validate | `bun run validate` | `Issues: 0` only AFTER Step 5 |
| Re-materialize | `bun run materialize` | exit 0, idempotent |
| Rebuild DB | `bun run rebuild-db` | exit 0 |
| Determinism | `bun scripts/determinism-anchor.ts` | exit 0 |
| Dup probe | `jq -r '.source_id' data/canonical/sources.jsonl \| sort \| uniq -d` | empty after Step 4 |
| Missing probe | see Step 1 script | empty after Step 5 |

## Suggested executor toolkit

- One primary executor session (Codex CLI or Claude Code) for the code + data steps —
  this work is serial by nature (identity change → re-materialize → verify).
- Optional but recommended: after Step 6, dispatch ONE independent read-only reviewer
  subagent whose only brief is to re-run every "Verify" command on the branch and
  adversarially diff `data/canonical/` against `main` looking for unexpected churn
  outside sources.jsonl and the wiki pages listed in Step 4. Fresh eyes on the diff are
  the cheapest insurance this plan has.

## Scope

**In scope**:
- `packages/db/src/identity.ts` (source-kind identity only)
- `packages/pipeline/src/materialize/materialize.ts` (only if the identity fix requires
  a source-kind special case near `recordIdentity`)
- `packages/pipeline/src/materialize/operational-anchors.ts` (`sourceRecordIndex`
  duplicate hard-error only)
- `packages/pipeline/src/validate.ts` (3 new lanes)
- NEW `packages/pipeline/src/sources/source-registry-backfill.ts` + a CLI subcommand
- NEW/changed tests under `packages/pipeline/test/` and `packages/db/test/`
- `data/submission-overrides/retired.json` (append one retirement entry, Step 3a)
- `data/submissions/<new backfill journal>.jsonl` (append-only, new file)
- Regenerated `data/canonical/*.jsonl`, `data/canonical.db`, affected `wiki/sources/*`
  pages — via the factory only
- `LOG.md`, `plans/README.md`

**Out of scope**:
- Hand edits to ANY file under `data/canonical/` (hard house rule).
- The operational-anchors summary/funnel semantics (plan 029).
- Ingest prompt changes (the durable fix is deterministic enforcement, not LLM
  diligence).
- The 129 never-cited source rows (legitimate: staged sources with no extracted
  records; note them in the Step 1 report, change nothing).

## Git workflow

- Branch: `advisor/028-source-registry-integrity`.
- Commit sequence: (1) lanes + expected-failure snapshot, (2) identity merge fix +
  regeneration, (3) backfill + regeneration, (4) hardening + tests + LOG.
- No push without operator instruction.

## Steps

### Step 1: Write the diagnostic report (read-only) and pin expectations

Add a small script or test fixture that computes and prints: duplicate source_ids (5),
collision-suffixed source record_ids (5), cited-but-missing source ids (5) with
per-kind citation counts (287 total), and relations whose `subject_id`/`object_id`
reference any `source_*_2` record id.

**Verify**: output matches the "Current state" numbers exactly. Record the
relations-referencing-`_2` count: if it is NOT 0, plan `replace_endpoint` semantic
corrections for those relations in Step 4 and list them in your report.

### Step 2: Add the three validate lanes (they must FAIL first)

In `validate.ts`:
- `duplicate_source_id` — more than one source row sharing `source_id`.
- `unresolved_source_reference` — any record whose `source_id` or `source_ids[]` entry
  has no source row; aggregate one issue per missing source id, message includes the
  citing-record count.
- `source_record_collision_suffix` — source record_id matching `/_\d+$/`.

**Verify**: `bun run validate` reports EXACTLY 15 issues (5 + 5 + 5) and nothing else.
Snapshot that output into the PR description. `bun run typecheck` green.

### Step 3a: Retire the junk observation (85841)

Read `data/submission-overrides/retired.json` and its validator
(`submission-overrides.ts:47` — version 1, `retired` array) to copy the exact entry
shape, then add a retirement entry for `sub_2348ce80a7d7d4a0` with a reason like
"accepted test submission; junk source observation for meeting_doc_85841 (title:
'test'); retired per plan 028". Re-run `bun run materialize`.

**Verify**: `jq -c 'select(.source_id=="meeting_doc_85841")' data/canonical/sources.jsonl`
→ exactly ONE row, the real "Capital Program Committee Meeting";
`bun run validate` now reports EXACTLY 13 issues (4 dup + 4 suffix + 5 unresolved).

### Step 3b: Make source-kind observations merge instead of fork

For the four GENUINE pairs (160631, 170871, 205331, 29966 — before touching code,
print both payloads of each pair side by side and confirm no other junk): change the
identity rule so all source observations for one `source_id` canonicalize into ONE
record — the cleanest point is making `recordIdentity` (or the equivalent grouping key
in `materialize.ts:520-536`) collapse to the base id for
`observation_kind === "source"`, so the existing field-merge machinery
(`_merged_field_values`) unions payloads and `submission_ids` aggregates both
submissions. Read how non-source kinds with equal identity merge TODAY and reuse that
path — do not invent a new merge.

Then regenerate: `bun run materialize && bun run rebuild-db`.

**Verify**:
- `jq -r '.source_id' data/canonical/sources.jsonl | sort | uniq -d` → empty;
  `wc -l < data/canonical/sources.jsonl` → 2561.
- `jq -r '.record_id' data/canonical/sources.jsonl | grep -c '_2$'` → 0.
- The merged rows carry BOTH submission_ids:
  `jq -c 'select(.source_id=="meeting_doc_160631") | .submission_ids' data/canonical/sources.jsonl`
  → array of length 2 (85841 keeps length 1 — its twin was retired, not merged).
- `git diff --stat -- data/canonical/` touches sources.jsonl and NOTHING ELSE among
  canonical files (if other files churn, STOP — the identity change leaked).
- `git status --short -- wiki/` shows only deletions/renames of the five `*_2` source
  pages (report what materialize actually does to `wiki/sources/`).
- `bun run validate` now reports EXACTLY 5 issues (only `unresolved_source_reference`,
  one per missing source; it clears in Step 5).

### Step 4: (conditional) Endpoint corrections for `_2` references

Only if Step 1 found relations referencing `source_*_2` record ids: append
`replace_endpoint` entries (provenance `deterministic_rule`, rationale citing this plan)
to `data/semantic-corrections/corrections.jsonl` mapping each to the surviving base
record id, re-run `bun run materialize`, and re-verify Step 3's checks.

**Verify**: `rg -c "source_meeting-doc-.*_2" data/canonical/relations.jsonl` → 0.

### Step 5: Backfill the five missing source rows through a journal

New `packages/pipeline/src/sources/source-registry-backfill.ts` + CLI subcommand
(e.g. `bun packages/cli/src/cli.ts backfill-source-registry --dry-run|--apply`):
- Deterministically finds cited-but-missing staged sources (same logic as the lane).
- For each, derives a source observation from `raw/sources/<id>/metadata.json` the same
  way `packages/pipeline/src/sources/source-intake.ts` derives source metadata (title,
  publisher, dates, content type; reuse its helpers — read it first and cite the
  functions you reuse), marks the observation clearly as runner-derived backfill, and
  appends it to ONE new journal file
  `data/submissions/<iso-ts>_backfill_source-registry.jsonl` in the exact accepted-entry
  shape used by existing journals (copy the shape from a 2026-06-20 journal line).
- `--dry-run` prints the five observations; `--apply` writes the journal.

Run `--dry-run`, eyeball, then `--apply`, then `bun run materialize && bun run rebuild-db`.

**Verify**:
- `wc -l < data/canonical/sources.jsonl` → 2566; unique source_id → 2566.
- `bun run validate` → `Issues: 0`.
- Re-run the backfill `--apply` again → it must be a no-op (idempotence).
- `jq -c 'select(.source_id=="queens_proposed_final_plan_addendum_2024") | {record_id, title: .payload.title, publisher: .payload.publisher}' data/canonical/sources.jsonl`
  → one row with sane metadata.

### Step 6: Harden the consumers and finish

- `sourceRecordIndex` (operational-anchors.ts:666-679): throw on a second source record
  claiming an already-indexed `source_id` key (now impossible; the throw preserves the
  invariant against regressions). Keep alias keys (dash/underscore, `source_` prefix)
  as-is.
- Tests: (a) db/identity test — two source observations for one source_id yield one
  record with merged submission_ids; (b) validate-lane tests with synthetic fixtures for
  each of the three codes; (c) backfill dry-run/apply/idempotence test against a temp
  rootDir fixture; (d) sourceRecordIndex duplicate → throws.
- Recompute the anchor summary locally (existing test helpers or a scratch invocation of
  `computeOperationalAnchors`/`summarizeOperationalAnchors` — do NOT cut a release) and
  record in the PR how `untrusted_source_authority` moved (expect a drop from 88 as
  Queens/camera-enforcement sources now resolve to their real publishers).
- LOG.md entry: registry invariant enforced; 5 merges + 5 backfills; lane names; note
  that the next release cut will differ accordingly.
- Full gates. Run `bun scripts/determinism-anchor.ts` twice; both runs identical.

**Verify**: all four gates green; done criteria below.

## Test plan

New tests named in Step 6, modeled structurally on
`packages/pipeline/test/materialize/operational-anchors.test.ts` fixtures (build
records in-memory; no live-corpus dependence). The three lane tests must each show:
clean fixture → 0 issues; seeded defect → exactly 1 issue with the right code.

## Done criteria

- [ ] `jq -r '.source_id' data/canonical/sources.jsonl | sort | uniq -d` → empty; `wc -l` → 2566; unique → 2566
- [ ] `bun run validate` → `Issues: 0` (with the three new lanes active)
- [ ] Diagnostic from Step 1 rerun → all three defect lists empty
- [ ] `git diff main --stat -- data/canonical/` shows changes ONLY in sources.jsonl (+ relations.jsonl iff Step 4 ran)
- [ ] Backfill re-run is a no-op; all new tests pass; all four gates green
- [ ] LOG.md entry present; `plans/README.md` status row updated

## STOP conditions

- Step 2 lane counts ≠ 15, Step 3a leaves ≠ 13, or Step 3b leaves ≠ 5 — the corpus
  drifted from this plan's snapshot; re-run Step 1 and report before touching data.
- Any of the four "genuine" pairs shows materially different payloads side-by-side
  (another junk case like 85841) — retire instead of merging and report the deviation.
- `bun run materialize` churns canonical files other than sources.jsonl (Step 3) or
  produces different bytes across two consecutive runs (determinism break).
- `recordIdentity` turns out to feed anything beyond record-id assignment (e.g. dedup
  ledgers, replay baselines) — map the blast radius and report before changing it.
- The accepted-journal entry shape has fields you cannot derive deterministically
  (e.g. run/session ids with semantic meaning) — report with a proposed shape instead
  of inventing values.
- Any wiki/ churn beyond the five `*_2` source pages and the five new source pages.

## Maintenance notes

- Future ingest waves: the `unresolved_source_reference` lane now catches an agent that
  forgets its source observation — but the better long-term shape is deriving the
  registry row at intake time (runner-owned) with agent observations merging in;
  consider that in the v3/occurrence work (plan 032), not here.
- The five backfilled rows have runner-derived payloads; if a later ingest re-reads
  those sources and submits richer source observations, the Step 3 merge rule absorbs
  them into the same row by design.
- Reviewer: scrutinize the canonical diff file-by-file; this is the one plan in the
  track that regenerates data.
