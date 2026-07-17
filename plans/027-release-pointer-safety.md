# Plan 027: Make the release pointer safe: opt-in LATEST writes, existence-checked reads, a release_pointer validate lane, and documented canary lifecycle

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d28b64c8..HEAD -- packages/pipeline/src/materialize/export-release.ts packages/pipeline/src/quality/release-quality.ts packages/pipeline/src/validate.ts packages/cli/src/commands/materialize.ts docs/releases-and-provenance.md`
> Only plan-026 commits should intervene. If these files changed otherwise, compare the
> "Current state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW–MED (touches release tooling; no data changes)
- **Depends on**: plans/026-baseline-hygiene-and-agents-refresh.md
- **Category**: bug
- **Planned at**: commit `d28b64c8`, 2026-07-12

## Why this matters

Every `exportRelease()` call unconditionally rewrites the tracked public pointer
`data/exports/releases/LATEST` — including internal canary cuts. That is exactly how six
internal cuts (`v2-temporal-canary` … `-5`, `v2-operational-anchors-1`) left the tracked
pointer naming an untracked 124 MiB directory. If such a pointer edit is ever committed,
any fresh public clone that runs the `quality-report` path crashes with a raw ENOENT,
because the LATEST readers never check existence. The docs also contradict the tree
(`v1-rc5` vs the working-tree pointer), and ~620 MiB of identical canary residue sits
around with no documented lifecycle. This plan makes pointer promotion an explicit act,
makes readers fail with an actionable error, adds a validate lane so the gate catches a
bad pointer before a commit does, and documents canary naming/retention.

## Current state

- `packages/pipeline/src/materialize/export-release.ts:355-357` — unconditional pointer
  write at the end of `exportRelease()`:

  ```ts
  mkdirSync(releasesDir, { recursive: true });
  writeFileSync(join(releasesDir, "LATEST"), `${releaseId}\n`, "utf8");
  ```

- `packages/pipeline/src/quality/release-quality.ts:192-194` — no existence check:

  ```ts
  export function latestReleaseId(rootDir = repoRoot) {
    return readFileSync(join(releasesRoot(rootDir), "LATEST"), "utf8").trim();
  }
  ```

  and `release-quality.ts:791` — `writeDeterministicQualityReport(releaseId = latestReleaseId(), ...)`;
  the manifest read below it does a bare `readFileSync` (ENOENT bubbles raw).
- `packages/cli/src/commands/materialize.ts:273-276` — the `quality-report` subcommand
  defaults to LATEST: `const releaseId = args.subject ?? optionValue(process.argv, "--id");`
  then `writeDeterministicQualityReport(releaseId)`.
- `packages/pipeline/src/validate.ts` (582 lines) has NO lane touching
  `data/exports/releases/` (lanes: required paths, pages, staged blocks, evidence,
  relations, semantic invariants, global identities, metric payloads, writer primitives,
  identity/override/correction artifacts).
- `packages/pipeline/test/materialize/export-release.test.ts` asserts the LATEST WRITE
  (~line 69-81) but nothing asserts the target exists on read, and no test round-trips
  manifest hashes/counts against the exported files.
- Releases on disk: `v1-rc5` (tracked, public); `v1-rc1..4` (gitignored by plan 009);
  `v2-operational-anchors-1` + `v2-temporal-canary{,-2..5}` (untracked, NOT gitignored).
  The five canaries have identical manifests from generator `67158e39` and predate the
  v2 manifest pointer contract. `docs/releases-and-provenance.md:3-9` names `v1-rc5` as
  the current public release and LATEST as the pointer.
- Downstream (bus-reliability-tracker) pins `v2-operational-anchors-1` by release id +
  manifest SHA `b69bd945…` + file SHAs directly — it does NOT read LATEST. Nothing in
  this plan may alter any existing release directory's bytes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Tests (scoped) | `bun test packages/pipeline/test/materialize/export-release.test.ts` | all pass |
| Full tests | `bun run test` | all pass |
| Validate | `bun run validate` | `Issues: 0` |
| Determinism | `bun scripts/determinism-anchor.ts` | exit 0 |

## Suggested executor toolkit

Single agent session (Codex CLI or Claude Code). No subagents required; optionally
dispatch one reviewer subagent at the end to re-run the gates on a clean checkout of
your branch and confirm the new tests fail if the guard is reverted (mutation check).

## Scope

**In scope**:
- `packages/pipeline/src/materialize/export-release.ts`
- `packages/pipeline/src/quality/release-quality.ts` (reader guard only)
- `packages/pipeline/src/validate.ts` (+ its issue-code type if declared in
  `packages/db/src/types.ts`)
- `packages/cli/src/commands/*.ts` (only where the export CLI surfaces the new flag)
- `packages/pipeline/test/materialize/export-release.test.ts`
- `docs/releases-and-provenance.md`, `LOG.md`, `plans/README.md`

**Out of scope**:
- Deleting or gitignoring the `v2-*` directories (owner decision; you only document).
- Any change to existing release directories' contents or manifests.
- The operational-anchors compute/summary (plans 029+).
- Manifest schema changes (deferred to plan 032's contract work).

## Git workflow

- Branch: `advisor/027-release-pointer-safety` off the plan-026 result.
- One commit per step group; imperative messages. No push without operator instruction.

## Steps

### Step 1: Make LATEST writes opt-in

In `export-release.ts`: add `setLatest?: boolean` to `ReleaseExportOptions` (default
`false`); wrap the two pointer lines (355-357) in `if (opts.setLatest) { ... }`. Find
every caller (`rg -n "exportRelease\(" packages/`) and thread an explicit value: the CLI
`export-release` command gets a `--set-latest` flag (default absent → false) and prints
which behavior applied; tests updated accordingly. Update the `ReleaseExportResult`
consumers if they displayed the pointer.

**Verify**: `rg -n "setLatest" packages/pipeline/src/materialize/export-release.ts packages/cli/src` shows the option + flag;
`bun test packages/pipeline/test/materialize/export-release.test.ts` passes with a NEW
assertion that a default export leaves LATEST untouched.

### Step 2: Guard the LATEST readers

In `release-quality.ts`: `latestReleaseId()` throws
`"data/exports/releases/LATEST is missing"` if the file is absent, and the manifest
reader checks `existsSync` on `<releasesRoot>/<id>/manifest.json` first, throwing:
`"Release <id> (from LATEST) has no manifest on disk; LATEST may point at an untracked internal release — pass an explicit --id or re-point LATEST"`.

**Verify**: new unit test — write LATEST to a bogus id in a temp rootDir, assert the
error message contains "untracked internal release".

### Step 3: Add the `release_pointer` validate lane

In `validate.ts`, new lane `validateReleasePointer(issues)`: if
`data/exports/releases/LATEST` exists, its trimmed content must name a directory that
exists AND contains `manifest.json`; otherwise push issue code
`dangling_release_pointer`. (Do not require the dir to be git-tracked — public clones
can't cheaply know; tracked-ness is enforced socially by this lane running in CI-like
gates on full checkouts, where an untracked target still EXISTS and passes — the
protection against committing a dangling pointer comes from the fact that a fresh clone
run of validate fails. State this in a code comment.) Wire it into `validateRepo()`.

**Verify**: `bun run validate` → `Issues: 0` (LATEST=v1-rc5 exists). Temporarily
`echo bogus > data/exports/releases/LATEST && bun run validate` → 1 issue
`dangling_release_pointer`; then `git checkout -- data/exports/releases/LATEST`.

### Step 4: Manifest round-trip test

In `export-release.test.ts`: export a release into a temp rootDir, then re-read
`manifest.json` and assert for every `files[name]`: recomputed sha256 and byte length of
the file match, and `record_counts[kind]` equals the line count of the corresponding
JSONL. (This is the test audit found missing; it pins the byte-reproducibility story.)

**Verify**: `bun test packages/pipeline/test/materialize/export-release.test.ts` → all pass.

### Step 5: Document pointer + canary lifecycle

`docs/releases-and-provenance.md`: add a "Pointer semantics" paragraph (LATEST names the
current PUBLIC release; internal/canary cuts never set it — `--set-latest` is an explicit
promotion act) and a "Internal releases and canaries" paragraph (naming
`v2-temporal-canary*` etc.; untracked by design; reproducible from generator commit +
manifest; safe to delete once their manifest SHA is recorded in LOG.md — deletion itself
is an owner action). Add one LOG.md line: pointer semantics changed, `--set-latest`
introduced.

**Verify**: `rg -n "set-latest" docs/releases-and-provenance.md` ≥ 1.

### Step 6: Gates + commit

**Verify**: all four gates green; `git status --short` clean except untracked `v2-*`.

## Test plan

- New tests (in `export-release.test.ts`, modeled on its existing style):
  1. default export does not write LATEST; `--set-latest`/option does.
  2. manifest round-trip: per-file sha256 + bytes + record counts match.
  3. `latestReleaseId`/manifest read against missing dir → actionable error.
- Validate-lane test: prefer a unit test if validate lanes have one (check
  `packages/pipeline/test/` for a validate test pattern; if none exists, the Step 3
  temporary-mutation check plus lane code review suffices — note that in the PR).

## Done criteria

- [ ] `rg -n "writeFileSync\(join\(releasesDir, \"LATEST\"" packages/pipeline/src/materialize/export-release.ts` shows the write only under the option guard
- [ ] `bun run validate` → `Issues: 0`; bogus LATEST → exactly 1 `dangling_release_pointer` issue (then restored)
- [ ] New tests exist and pass; full gates green
- [ ] `docs/releases-and-provenance.md` documents pointer + canary lifecycle
- [ ] No file under any existing `data/exports/releases/<id>/` changed (`git status` + `du` unchanged for v1-rc5)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any existing release directory's bytes would change (e.g. a test writes into the real
  releases root instead of a temp rootDir) — fix the test isolation, never the release.
- `exportRelease` callers exist that semantically REQUIRE the old always-write behavior
  (e.g. a script that re-points LATEST as its whole job) — list them and report instead
  of guessing.
- The issue-code type for validation lanes is a closed union you cannot extend without
  touching frozen v1 surfaces (check `packages/db/src/types.ts` `MtaValidationIssue`);
  if `code` is a plain string, proceed; if it is an enum needing migration, report.

## Maintenance notes

- Plan 029 adds summary/funnel fields; plan 032 revisits the manifest contract
  (schema_version 2, optional dirty-tree flag) — do not preempt either here.
- Future exporters: any new companion artifact must be added to the manifest `files`
  map, or the round-trip test will (correctly) fail.
- Reviewer: scrutinize Step 3's decision to accept untracked-but-existing targets on
  full checkouts; the fresh-clone validate run is the enforcement point.
