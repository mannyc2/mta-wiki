# Plan 026: Repair tracked-state baseline: broken committed test import, stray NUL bytes, dirty LATEST, stale AGENTS.md, and untracked plan files

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git status --short && git log --oneline -3`
> Expected: branch `codex/operational-anchor-release` at `d28b64c8` with exactly
> ` M LOG.md`, ` M data/exports/releases/LATEST`,
> ` M packages/pipeline/test/materialize/canonical-db.test.ts`, ` M plans/README.md`
> (the 2026-07-12 advisor track update — expected, keep it), and 6 untracked
> `data/exports/releases/v2-*` dirs. Note: `.git/info/exclude:7` ignores `plans/`,
> so plan files 026-034 do NOT appear in status yet — Step 5 force-adds them
> precisely because worktree executors otherwise cannot see their own
> instructions. If the modified-file set differs beyond this, compare the
> "Current state" excerpts against the live tree before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (everything else builds on a committed, self-consistent baseline)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug + docs
- **Planned at**: commit `d28b64c8`, 2026-07-12 (revised same day after review: committed-state
  verification added; plan files become tracked; file-list checks made consistent)

## Why this matters

The committed HEAD is broken: `packages/pipeline/test/materialize/canonical-db.test.ts`
at HEAD imports `readCanonicalRecordsByKind`/`readCanonicalRecordsFromDbFile`/`readCanonicalRecordsFromJsonl`
from `@mta-wiki/pipeline/materialize/materialize`, but `materialize.ts` no longer exports
them (they moved to `canonical-read.ts`). The one-line fix exists only as an uncommitted
edit. The same file contains 2 stray NUL bytes, which makes git and `file` treat it as
binary. The tracked release pointer `data/exports/releases/LATEST` was left pointing at
`v2-operational-anchors-1` — an intentionally untracked internal release — contradicting
`docs/releases-and-provenance.md:5` and, if committed, breaking fresh-clone consumers of
LATEST (plan 027 hardens this). `AGENTS.md` — the primary agent instruction surface —
still describes a deleted `packages/harness` layout and a 54-source pilot corpus.
Finally, plan files 026-034 are invisible to git (`.git/info/exclude:7` ignores
`plans/`), which means the worktree-based executors this track prescribes would check
out a tree WITHOUT their own instructions — this plan force-adds them (the exact
precedent: plans 021-024 are already tracked this way).

## Current state

- `git status --short`: ` M LOG.md` (6-line changelog entry describing the
  v2-operational-anchors-1 internal release cut — correct content, should be committed),
  ` M data/exports/releases/LATEST` (`v1-rc5` → `v2-operational-anchors-1`, should be
  reverted), ` M packages/pipeline/test/materialize/canonical-db.test.ts` (import-path
  fix, keep and commit), ` M plans/README.md` (advisor track rows, keep and commit).
- The uncommitted test diff (keep this):

  ```
  -} from "@mta-wiki/pipeline/materialize/materialize";
  +} from "@mta-wiki/pipeline/materialize/canonical-read";
  ```

- `rg -n "readCanonicalRecordsByKind|readCanonicalRecordsFromDbFile|readCanonicalRecordsFromJsonl" packages/pipeline/src/materialize/materialize.ts`
  returns nothing — the committed test's import target is gone.
- `tr -cd '\000' < packages/pipeline/test/materialize/canonical-db.test.ts | wc -c` → `2`.
- `git show HEAD:data/exports/releases/LATEST` → `v1-rc5`; working tree says
  `v2-operational-anchors-1` (untracked 124 MiB internal artifact; the downstream
  tracker pins the release id + manifest SHA directly, NOT via LATEST).
- `git ls-files plans/` → only `README.md` and `021`-`024`; `git check-ignore -v
  plans/026-baseline-hygiene-and-agents-refresh.md` → `.git/info/exclude:7  plans/`.
- `AGENTS.md:30-34` references `packages/harness/src/...` (deleted 2026-06-11); actual:
  prompts `packages/agents/src/prompts.ts`, tools `packages/agents/src/tools/`,
  runtime `packages/core/src/`, pipeline `packages/pipeline/src/`, DB
  `packages/db/src/`, CLI `packages/cli/src/cli.ts`. `AGENTS.md:124-165` describes the
  June-8 54-source pilot era; live baseline: 2,566 sources, 98,119 submissions, 84,024
  canonical records, 7,331 wiki pages, `Issues: 0`, v1 tagged.
- **Known fresh-context baseline** (`plans/README.md:124-131`, recorded 2026-07-05): in
  a fresh clone/worktree WITHOUT untracked local state, `bun run validate` reports 64
  `invalid_semantic_correction` issues and 8 test files fail
  (`test/campaign/post-ingest.test.ts` ×7, `test/quality/semantic-eval-pack.test.ts` ×1),
  while the full local checkout reports `Issues: 0` and all-pass. This plan does NOT fix
  that pre-existing gap; it MEASURES the committed state against exactly that baseline
  so "baseline repaired" is a verified claim, not a local-state illusion.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `bun run test` | all pass (local full checkout) |
| Validate | `bun run validate` | `Issues: 0` (local full checkout) |
| Determinism | `bun scripts/determinism-anchor.ts` | exits 0, stable anchor |
| NUL check | `tr -cd '\000' < packages/pipeline/test/materialize/canonical-db.test.ts \| wc -c` | `0` after Step 1 |
| Worktree check | see Step 6 | typecheck 0; failures == known baseline exactly |

## Suggested executor toolkit

Any single agent session (Codex CLI in repo root, or Claude Code) can execute this plan
alone; no subagents needed. Read `AGENTS.md` and `CODEX.md` first — they bind you.

## Scope

**In scope** (the only files you should modify):
- `packages/pipeline/test/materialize/canonical-db.test.ts` (NUL removal only; keep the
  already-present import fix)
- `data/exports/releases/LATEST` (revert to committed content)
- `AGENTS.md` (path + corpus-status refresh)
- `LOG.md` (commit the existing staged entry as-is)
- `plans/README.md` + `plans/026-*.md` … `plans/034-*.md` (git add -f; content edits
  only to the README status row)

**Out of scope** (do NOT touch):
- The untracked `data/exports/releases/v2-*` directories (owner decision; 027 documents
  lifecycle).
- Any behavior change in `packages/pipeline/src/**`.
- `docs/immutable-mta-llm-wiki-spec.md` (never edit).
- Canonical JSONL under `data/canonical/` (house rule: never hand-edit).
- The known fresh-context validate/test gap itself (pre-existing; measured, not fixed).

## Git workflow

- Work directly on `codex/operational-anchor-release` (it owns these stragglers).
- Two commits, imperative style matching `git log --oneline`:
  1. `Fix canonical-db test import and strip stray NUL bytes`
  2. `Refresh AGENTS.md, log v2 internal release, track advisor plans 026-034`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Strip the 2 NUL bytes from the test file

Locate: `grep -obUaP '\x00' packages/pipeline/test/materialize/canonical-db.test.ts`.
Remove ONLY those bytes (`perl -0pi -e 's/\x00//g' <file>`). No other reformatting.

**Verify**: NUL check → `0`; `git diff -- <file>` renders as TEXT showing the import
line plus the NUL sites; `bun test packages/pipeline/test/materialize/canonical-db.test.ts`
→ all pass.

### Step 2: Revert the LATEST pointer

`git checkout -- data/exports/releases/LATEST`

Commit-message rationale: v2 cut is internal (LOG entry); downstream pins release id +
manifest SHA directly; docs define v1-rc5 as public; a tracked LATEST naming an
untracked directory breaks fresh clones.

**Verify**: `cat data/exports/releases/LATEST` → `v1-rc5`; not listed in `git status`.

### Step 3: Refresh AGENTS.md

Edit only: "Important Paths" (replace all `packages/harness/src/...` entries with the
real locations from "Current state"; verify each with `ls` before writing) and
"Current Prototype Sources" (replace pilot narrative with a short corpus-status block:
2,566 sources, v1 sealed at tag `v1`/release `v1-rc5`, intake commands still valid;
keep the `pioneer-*` profile names). Leave "Known Current Issues" alone (plan 031
revises the status bullet when its fix lands).

**Verify**: `rg -c "packages/harness" AGENTS.md` → `0`; every path you wrote exists.

### Step 4: Local gate suite

**Verify**: `bun run typecheck` exit 0; `bun run test` all pass; `bun run validate` →
`Issues: 0`; `bun scripts/determinism-anchor.ts` exits 0. (Read the anchor script
first; if it mutates tracked files, STOP.)

### Step 5: Track the plan files and commit

`git add -f plans/README.md plans/026-*.md plans/027-*.md plans/028-*.md plans/029-*.md plans/030-*.md plans/031-*.md plans/032-*.md plans/033-*.md plans/034-*.md`

Commit 1: the test file only.
Commit 2: `AGENTS.md`, `LOG.md`, `plans/README.md`, and the nine plan files 026-034.

**Verify**:
- `git show --stat HEAD~1` lists exactly 1 file (the test).
- `git show --stat HEAD` lists exactly 12 files: `AGENTS.md`, `LOG.md`,
  `plans/README.md`, and `plans/026…034` (9 plan files).
- `git status --short` afterwards shows ONLY the untracked
  `data/exports/releases/v2-*` dirs.
- `git ls-files plans/ | wc -l` → 14 (README + 021-024 + 026-034).

### Step 6: Verify the COMMITTED state in a throwaway worktree

```
git worktree add /tmp/check-plan-026 HEAD
cd /tmp/check-plan-026 && bun install --offline
bun run typecheck            # MUST exit 0 — this is what the plan fixes
bun run test                 # expect failures ONLY in the known baseline set
bun run validate             # expect ONLY 64 invalid_semantic_correction issues
ls plans/026-*.md            # plan visible in the worktree — the tracking fix
cd - && git worktree remove /tmp/check-plan-026
```

Compare test/validate results to the known fresh-context baseline in "Current state":
typecheck must be clean; failing test files must be EXACTLY
`test/campaign/post-ingest.test.ts` (7) + `test/quality/semantic-eval-pack.test.ts`
(1); validate issues must be exactly the 64 `invalid_semantic_correction`. Anything
else failing = a NEW regression = STOP.

**Verify**: the three exact-match comparisons above, recorded in the PR/report.

## Test plan

No new test files. The deliverable is measured baseline health: the full local suite
green (Step 4) AND the committed-state worktree matching the known fresh-context
baseline exactly (Step 6) — the second check is what makes "baseline repaired"
trustworthy rather than an artifact of local untracked state.

## Done criteria

- [ ] `git show HEAD~1:packages/pipeline/test/materialize/canonical-db.test.ts | grep -c canonical-read` ≥ 1 and `| tr -cd '\000' | wc -c` → 0
- [ ] `cat data/exports/releases/LATEST` → `v1-rc5`, unmodified vs HEAD
- [ ] `rg -c "packages/harness" AGENTS.md` → 0
- [ ] `git ls-files plans/ | wc -l` → 14; Step 6 worktree shows `plans/026-*.md`
- [ ] Step 4 local gates green; Step 6 committed-state check matches the known baseline exactly (typecheck 0; 8 known failing test files; 64 known issues; nothing new)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The dirty-file set at start differs from the four files listed.
- `bun run test` (local) fails on files OTHER than canonical-db.test.ts at any point.
- Step 6 worktree shows any failure OUTSIDE the known baseline set — that is a new
  regression this plan must not paper over; report it.
- `bun install --offline` fails inside the worktree (report; do not switch to online
  install without operator say-so).
- `scripts/determinism-anchor.ts` mutates tracked files.
- Removing the NUL bytes changes more than 2 bytes of content.

## Maintenance notes

- Plan 027 prevents LATEST from silently pointing at internal cuts again.
- The fresh-context 64-issue/8-file baseline is PRE-EXISTING and now measured here; if
  public reproducibility of `validate` becomes a goal, that is its own follow-up plan
  (see plans/README.md:124-131) — do not fold it into this one.
- All later plans in this track (027-034) assume plan files are tracked; if a new plan
  NNN is added later, force-add it the same way.
- Reviewer: check the NUL-removal diff contains no other byte churn, and that the
  Step 6 baseline comparison is exact, not "roughly the known failures".
