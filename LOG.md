# MTA Wiki Changelog

This file is the compact durable history for the public repository. Keep it changelog-sized:
record release milestones, public data-contract changes, owner decisions that affect publication,
and active caveats. Do not use it as a transcript, run log, or plan archive.

## 2026-07-03

### Remaining Plan Approval

- Owner approved LLM spend for the remaining post-v1 plans in this conversation: "I give you
  permission for the llm spend."

### V2 Extract Pilot Spend Gate

- Owner approval for Plan 014 provider spend, recorded verbatim: "I give you permission for the
  llm spend."
- Plan 014 10-source pilot estimate used Pioneer DeepSeek V4 Flash (`$0.10/M input`,
  `$0.20/M output`) and the vendored DeepSeek tokenizer on the first 10 replay-manifest prompts:
  `223452` input tokens total, `22345` average input tokens/source, estimated input cost
  `$0.022345`. With output allowances of `2000`, `5000`, or `10000` tokens/source, estimated
  10-source pilot cost is `$0.026345`, `$0.032345`, or `$0.042345` respectively before retries.

### V2 Extract Stage Local Implementation

- Plan 014 Steps 1-3 landed locally: a deterministic prompt-embedded final-schema extraction
  contract, a replay-only `extract` CLI path that writes under `data/replay/runs/<run_id>/`,
  boundary validation with enum-miss review handling, and deterministic anchor matching against
  existing canonical ids/aliases/do-not-merge pairs.
- Mocked CLI verification passed for `14th_street_busway_brochure`: `accepted=1`, `review=0`,
  `enum_misses=0`, with no live provider call and no writes to `data/submissions/` or
  `data/canonical/`.
- Plan 014 code gates passed before pilot: `bun run typecheck`; `bun run test` (`945 pass`,
  `1 skip`, `0 fail`); `bun run validate` with `Issues: 0`; and
  `bun scripts/determinism-anchor.ts` with combined hash
  `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### V2 Extract Pilot Stop

- Plan 014 Step 4 ran the owner-approved 10-source pilot as `v2-extract-pilot-20260703`
  with Pioneer DeepSeek V4 Flash. Actual usage: `10` requests, `224642` input tokens,
  `183696` output tokens, `408338` total tokens, estimated cost `$0.059203`.
- Corrected the replay evaluator with an `--actual-only` scope so pilot reports compare only
  sources that have actual output files. The scoped pilot report covers `10` sources and scored
  `0.00%` agreement (`0/722`), with `321` actual records, `189` field mismatches, `533`
  missing records, and `132` extras.
- Plan 014 STOP condition fired: pilot agreement is far below the bar, so the full replay was
  not run. Diagnostics are in `data/replay/reports/v2-extract-pilot-20260703-diagnostics.*`.
  Top review causes were `evidence_quote_not_in_block=86`, `missing_display_name=53`,
  `payload_schema_warning=46`, `anchor_ambiguous=10`, `anchor_new=2`, and
  `unknown_evidence_block=1`. Top mismatch fields were `evidence_refs=189`,
  `display_name=177`, `payload.description=160`, and `raw_text=109`.
- Post-STOP gates passed after the `--actual-only` replay-eval fix and pilot artifacts:
  `bun run typecheck`; `bun run test` (`946 pass`, `1 skip`, `0 fail`); `bun run validate`
  with `Issues: 0`; and `bun scripts/determinism-anchor.ts` with combined hash
  `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### V2 Extract Deterministic Boundary Iteration

- Without provider spend, replayed the saved 10 pilot responses through a local boundary fix.
  The fix derives display names from payload anchors when the model omits `display_name`,
  accepts OCR-equivalent citation quotes after conservative normalization, and maps relation
  `subject_local_observation_id`/`object_local_observation_id` aliases into final
  `subject_id`/`object_id` before anchor remapping.
- The no-spend replay improved boundary yield but did not clear the Plan 014 STOP:
  accepted records `321 -> 374`, review entries `198 -> 147`, `missing_display_name`
  `53 -> 0`, but scoped replay agreement remained `0.00%` (`0/722`). The generated
  throwaway replay run was removed; the durable conclusion is this LOG entry plus tests.
- Post-iteration gates passed: `bun run typecheck`; `bun run test` (`949 pass`, `1 skip`,
  `0 fail`); `bun run validate` with `Issues: 0`; and `bun scripts/determinism-anchor.ts`
  with combined hash `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### V2 Replay Projection Diagnostics

- Corrected replay equality to use the plan-013 comparable projection: declared schema fields
  plus runner companions, source/block evidence identity, and relation endpoints/family/kind/status;
  v1-only payload residue and evidence role/page/hash metadata are no longer scored as equality
  failures. The projection-v2 self-diff stayed `15770/15770`.
- Replayed the saved 10 pilot responses through the current boundary with no provider spend as
  `v2-extract-pilot-20260703-boundary-projection-v2`. It produced `374` accepted records and
  `147` review entries (`evidence_quote_not_in_block=86`, `payload_schema_warning=46`,
  `anchor_ambiguous=12`, `anchor_new=2`, `unknown_evidence_block=1`).
- Plan 014 remains STOPPED: corrected projection agreement is still `0.00%` (`0/722`) with
  `220` field mismatches, `502` missing records, and `154` extras. Top mismatch classes are
  schema/content gaps, especially `payload.description`, metric unit normalization, metric scope/name/raw
  value fields, route companions, and citation block sets.
- Added deterministic replay diagnostic examples to projection-v2 reports: bounded field
  mismatch, missing, and extra samples with truncated expected/actual values. This used no
  provider spend and did not change replay scores: self-diff remains `15770/15770`, and
  boundary projection-v2 remains `0/722`.
- Post-diagnostic gates passed: `bun run typecheck`; `bun run test` (`952 pass`, `1 skip`,
  `0 fail`); `bun run validate` with `Issues: 0`; and `bun scripts/determinism-anchor.ts`
  with combined hash `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Static Site Exporter Ready

- Added the static HTML exporter for route, corridor, project, and source citation-target pages.
  The exporter reads tracked wiki Markdown plus rebuilt `data/canonical.db`, writes to
  `dist/site/`, caps oversized project/source pages, and builds a Pagefind search index.
- Corpus export check passed: `318` routes, `218` corridors, `1859` projects, `2561` sources;
  `dist/site` is `352M`; no generated HTML page exceeds `3M`.
- Bus-product cross-links were skipped because no bus product base URL or served-route artifact
  was supplied for Plan 011 Step 4.
- Plan 011 code gates passed before deploy: `bun run typecheck`, `bun run test`, `bun run
  validate` with `Issues: 0`, and `bun scripts/determinism-anchor.ts`.
- Owner approval for Plan 011 GitHub Pages deployment, recorded verbatim: "its not owner gated
  i give you permission".
- Deployed `dist/site` to the public `gh-pages` branch and enabled GitHub Pages at
  `https://mannyc2.github.io/mta-wiki/`. GitHub reports source `gh-pages` path `/`, HTTPS
  enforced, status `built`. HTTP 200 spot checks passed for the homepage, `route_m116`,
  `project_lirr-mnr-ptc`, and source `116_st_morningside_ave_pleasant_ave_cb10_feb2025`.
- Deployment branch commit: `624717c`. Post-deploy gates passed: `bun run typecheck`;
  `bun run test` (`952 pass`, `1 skip`, `0 fail`); `bun run validate` with `Issues: 0`;
  and `bun scripts/determinism-anchor.ts` with combined hash
  `d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`.

### Relation Family DB Constraint

- Added a `relations.relation_family` SQLite CHECK and bumped `CANONICAL_DB_VERSION` from
  `3` to `4`. This enforces the already code-closed `RELATION_FAMILIES` tuple at the DB
  boundary, like the existing `record_kind` and `provenance` CHECKs; it is not raw
  `relation_kind` closure. The `schema-audit` saturation signal is structurally unavailable
  for this 18-value field because `ENUM_MAX_DISTINCT=12`.
- Step 1 corpus evidence, recorded verbatim:
  `SELECT COUNT(*) FROM relations;` => `20640`.
  `SELECT relation_family, COUNT(*) FROM relations GROUP BY 1 ORDER BY 2 DESC;` =>
  `metric_context|6015`; `timeline_context|3626`; `agency_role|2194`;
  `treatment_context|1690`; `corridor_scope|1286`; `route_scope|1020`;
  `publication_role|1015`; `organization_hierarchy|883`; `claim_context|815`;
  `partnership_engagement|686`; `funding_award|645`; `program_project_scope|227`;
  `governance_legal|197`; `dependency_or_reference|179`; `location_scope|74`;
  `ownership_role|65`; `data_reporting|23`.
  Out-of-tuple count => `0`.
- Local `data/canonical.db` was rebuilt to `PRAGMA user_version=4` and contains the
  `relation_family` CHECK; per the public-history policy from Plan 009, the DB remains ignored
  and is not committed.
- Determinism anchor re-baselined from `dump=9ebbafe0c187f13c46d530585191dae1f2fc78d4dc0b149dd8e385e1adc17335`,
  `fts=f4838f4b9807560b62ba6b8296591041544408daac8f295422b43612a7c4ea2f`,
  `master=c93647aacf94b89286f7764dde2841195ed984787e23df8ea687048be7f2a1b4`,
  `combined=8e42b43fc9695204316204f211552b4e15ec1b444b8baaaf818b2613aa7de858` to
  `dump=17054fd6f6e8bbdb855c2120ae1c4bebe8a73de47b50b8724f52fff2d551922b`,
  `fts=f4838f4b9807560b62ba6b8296591041544408daac8f295422b43612a7c4ea2f`,
  `master=7eb86293059611f6a04a97c7805ebc25cc6fb387f4989bd18ec7d24a3615cc09`,
  `combined=d9a03eba3f4c33e90ab1b3b9caf525679ad90aa38a38eceeb1fc12fe3f11950a`; the FTS
  hash is unchanged.
- Plan 016 gates passed: `bun run typecheck`, `bun run test`, `bun run validate` with
  `Issues: 0`, and `bun scripts/determinism-anchor.ts`.

### Writer Primitive Validation

- Added the writer primitive grammar for ids-only inline links and structured writer blocks:
  `[[route:id|label]]`, `[[corridor:id|label]]`, `[[project:id|label]]`,
  `[[entity:id|label]]`, `[[metric:id|label]]`, and `[[cite:source#block|label]]`,
  plus fenced `mta:<kind>` JSON blocks for route, corridor, project, entity, and metric context.
- `validate` now checks non-source writer regions for dangling writer primitives by default while
  leaving the stricter uncited-paragraph check behind `--strict-writer-citations`.
- Plan 010 gates passed: `bun run typecheck`, `bun run test`, `bun run validate` with
  `Issues: 0`, and `bun scripts/determinism-anchor.ts`.

### Replay Harness Preflight Stop

- Plan 013 stopped before implementation under its explicit STOP conditions. The 300-row
  `v1-rc5` audit sample cites `257` distinct sources, exceeding the plan's approximate `250`
  source limit for the mandatory replay set.
- Evidence-ref matching is ambiguous in the shipped v1 release: using
  `source_id#block_id + record_kind + relation endpoints` produces `13,980` collision keys
  across the full release and `1,997` collision keys even when scoped to the mandatory
  audit-cited sources. The largest affected family is `metric_claim`.
- Follow-up decision needed before Plan 013 resumes: revise the replay matching key and/or
  rebalance the mandatory sample scope instead of silently choosing one colliding v1 record.

### Replay Harness Resume Decision

- Owner decision for Plan 013: "proceed with all 257 audit-cited sources. Revise replay matching
  so the primary bucket remains source_id#block_id + record_kind + relation endpoints, but
  ambiguous buckets are resolved by deterministic comparable-projection matching rather than
  stopping. Preserve truly identical projected duplicates as multiset entries. Record this in
  LOG.md and resume Plan 013. Within-bucket resolution must be deterministic
  (order-independent), and per-kind collision counts must appear in the replay report, not only
  LOG.md."

### Replay Eval Harness Landed

- Added deterministic replay evaluation scaffolding for the v2 track: `replay-eval` writes
  `data/replay/sample-manifest.json`, per-source v1 baseline projections under
  `data/replay/baseline/`, and JSON/Markdown reports under `data/replay/reports/`.
- Manifest seed: `v2-replay-v1`; sources: `257`; selected strata: `197` board-book,
  `17` DOT-project-PDF, and `43` other. All `300` quality-audit rows have their cited sources
  included.
- Self-diff sanity for `v1-rc5`: `15770 / 15770` matches, `0` field mismatches, `0` missing,
  `0` extra. The report records per-kind collision counts for replay-scope and full-release
  buckets.
- Plan 013 gates passed: `bun run typecheck`, `bun run test`, `bun run validate` with
  `Issues: 0`, and `bun scripts/determinism-anchor.ts`.

### Public History, Docs, And Log Cleanup

- Rewrote the public repository to a compact single-root history for normal GitHub use. `main`
  and `v1` point to the same public-history root after cleanup.
- Removed local execution plans from the tracked tree. `plans/` is now local-only through
  `.git/info/exclude`; previous plan/status docs were preserved locally under
  `plans/archived-docs/docs-before-public-cleanup-2026-07-03/`.
- Added `.claude/` to `.gitignore` and removed `.claude/scheduled_tasks.lock` from the tracked
  public tree.
- Replaced the old `docs/` planning/status surface with durable user-facing docs:
  `docs/README.md`, `architecture.md`, `data-model.md`, `mta-llm-wiki-spec.md`,
  `operations.md`, `releases-and-provenance.md`, plus the untouched
  `docs/immutable-mta-llm-wiki-spec.md`.
- Compressed `LOG.md` from a long project diary into this changelog. Future entries should stay
  short and public-facing.

### Public Repository Published

- Created the public GitHub repository `mannyc2/mta-wiki`.
- Owner approved public publication of extracted text and verbatim evidence quotes from the
  MTA/DOT source corpus, with an attribution/correction/takedown note.
- Code license: MIT. Data provenance statement: source documents are public NYC/MTA government
  records obtained from public agency websites; extracted text and derived data are provided for
  research and reference; correction or takedown requests should be opened as GitHub issues.
- Retired the old local Git history because it had a 120.95 GiB pack with generated artifacts.
  The archive remains on disk as `.git-archive/` until the owner explicitly deletes it.
- Publication intentionally leaves old commit hashes cited in archived local plans as inert labels.

### Public Clone Validation

- The public repository tracks `data/submissions/`, `data/canonical/`,
  `data/evidence-block-index.jsonl`, `data/reference/gtfs/`, `wiki/`, and
  `data/exports/releases/v1-rc5/`, but not `raw/` or `data/canonical.db`.
- Added `bun run rebuild-db` plus a public-clone `materialize` path that rebuilds the ignored
  `data/canonical.db` from tracked `data/canonical/*.jsonl` without requiring `raw/` or rewriting
  canonical/wiki outputs.
- Added the compact evidence-block index so `validate` can perform evidence page/hash checks in
  fresh public clones without `raw/sources/*/blocks.jsonl`.

### V1 Release Closed

- `v1` is the public release tag for release `v1-rc5`; `data/exports/releases/LATEST` remains
  `v1-rc5`.
- Final v1 gates passed: `bun run typecheck`, `bun run test`, `bun run validate` with `Issues: 0`,
  and `bun scripts/determinism-anchor.ts`.
- Determinism anchor combined hash for v1: `8e42b43fc9695204316204f211552b4e15ec1b444b8baaaf818b2613aa7de858`.
- Corpus at v1: `98119` submissions, `84027` canonical records, `7331` wiki pages.
- Quality report for `v1-rc5`: evidence resolution `132526 / 132526`; sample precision
  `65.67%` strict and `90.00%` lenient.
- Owner accepted the `50`-row human-review calibration as agent-executed and owner-ratified:
  `47/50` judge agreement (`94.00%`), with no new hard-wrong class.
- Bus importer parity for `v1-rc5` was accepted: `0` ambiguous omissions, `10` matched served Bus
  routes, and `2` honest `no_wiki_coverage` served Bus routes.

### V1 Data Contract Landed

- Versioned release exports landed under `data/exports/releases/`, with manifest hashes and a
  `LATEST` pointer.
- Route anchor export landed for downstream route matching: `396` GTFS ids resolved to `213`
  canonical anchors plus `183` `no_wiki_coverage` rows, with `0` ambiguous dispositions.
- Route-scoped relation assertion cleanup met the v1 stop line: unknown rates were below 10% for
  `claim_context`, `corridor_scope`, `metric_context`, `route_scope`, `timeline_context`, and
  `treatment_context`.
- Release taxonomy export landed for relation families and assertion-status vocabulary.
- Events and projects gained `date_normalized` and `date_precision` release fields.
- Empty payloads were effectively eliminated for v1: `4` corpus-wide and `0` on routes.

## 2026-06

### Pipeline Foundation

- Built the filesystem-first two-stage pipeline: ingest agents submit structured observations;
  deterministic materialization writes canonical JSONL, wiki pages, release exports, and SQLite
  projections; writer agents own only marked Markdown regions on non-source pages.
- Established source prep around citeable source blocks and staged source folders under
  `raw/sources/<source_id>/`.
- Added deterministic validation, identity, ontology normalization, route anchoring, release export,
  quality-report, and SQLite materialization infrastructure.
- Imported the curated source set in cheap mode: `61` captures discovered, `53` staged, `8`
  skipped, `0` failed. The full artifact-tree dry run found `2632` unique source ids, with
  roughly `7.35 GB` of stageable source artifacts before extracted text/block files.
- Early canary runs used `14th_street_busway_brochure` and `m86_sbs_progress_report_2017` to expose
  duplicate observations, broad evidence spans, writer-context gaps, and status/document-time
  semantics.
