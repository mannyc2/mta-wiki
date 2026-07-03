# MTA Wiki Changelog

This file is the compact durable history for the public repository. Keep it changelog-sized:
record release milestones, public data-contract changes, owner decisions that affect publication,
and active caveats. Do not use it as a transcript, run log, or plan archive.

## 2026-07-03

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
