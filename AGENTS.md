# MTA Wiki Agent Notes

## Project Purpose

This repo builds a filesystem-first LLM wiki for MTA and NYC bus-priority knowledge.
The goal is to turn official/public sources into programmatically usable structured
records plus human-written wiki context.

The core architecture is a two-stage agent pipeline:

1. `ingest`: first agent reads one staged source and submits structured observations.
2. `materialize`: deterministic runner canonicalizes submissions and creates/updates wiki pages.
3. `write`: second agent reads materialized pages and writes useful Markdown context inside writer regions on non-source record pages.

Do not treat the writer as the owner of structured data. Programmatic structure belongs in
frontmatter/canonical JSONL; the writer owns only the Markdown body between writer markers on
non-source record pages. Source pages in `wiki/sources/` are read-only pages with generated YAML
frontmatter and a full-source Markdown body.

## Important Paths

- `raw/sources/<source_id>/`: staged source folders with `metadata.json`, `source.pdf`, `text.txt`, etc.
- `data/submissions/`: append-only accepted/rejected tool submission journals.
- `data/canonical/`: deterministic JSONL projections by record kind.
- `data/materialized/`: record/page indexes produced by materialization.
- `data/transcripts/`: rendered run transcripts, sessions, and usage artifacts. These are runner audit logs,
  not source evidence or agent-readable context.
- `wiki/`: generated wiki pages. `wiki/sources/` contains source pages with YAML frontmatter and
  full-source Markdown bodies; other wiki pages use YAML frontmatter plus writer regions.
- `packages/pipeline/src/` and `packages/db/src/`: MTA domain logic — source prep, submissions, materialization, ontology, identity, relations, validation.
- `packages/core/src/` runtime and provider modules: harness lib (reusable runtime over pi-agent-core/pi-ai).
- `packages/agents/src/`: one file per agent type. `ingest.ts`/`write.ts`/`ask.ts` (with `shared.ts` envelope + `run.ts` dispatch/resume), plus `identity-review.ts`, `ontology-normalize.ts`, `schema-proposal.ts`, `ontology-review.ts`. Agent prompts in `agents/prompts.ts`; scoped tool factories in `agents/tools/`.
- `packages/core/src/transcript.ts`: compact transcript renderer.
- `packages/cli/src/cli.ts`: CLI entrypoint.
- `docs/mta-llm-wiki-spec.md`: working product/spec notes.
- `docs/immutable-mta-llm-wiki-spec.md`: stable north-star spec. Read it, but do not edit it unless
  the project owner explicitly asks to edit that exact file in the current conversation.
- `LOG.md`: compact changelog for release milestones, public data-contract changes, publication
  decisions, and active caveats. Keep it short; do not use it as a run diary.
- `CODEX.md`: Codex-specific note that future sessions should keep `LOG.md` changelog-sized.

## Useful Commands

Run from repo root.

```bash
bun install --offline
bun run typecheck
bun run validate
bun run test
```

Staging a source:

```bash
bun packages/cli/src/cli.ts prepare-source <source-dir>
bun packages/cli/src/cli.ts prepare-source <source-dir> --source-id <compact_local_id>
```

Batch source intake:

```bash
bun packages/cli/src/cli.ts import-sources <root-or-sources-dir> --dry-run
bun packages/cli/src/cli.ts import-sources <root-or-sources-dir>
bun packages/cli/src/cli.ts import-sources <root-or-sources-dir> --include 'progress|busway' --limit 10
```

Batch import writes `data/source-imports/<run>.json` and `data/source-imports/latest.json`.
By default it stages captured artifacts, derives compact local source ids, extracts `text.txt`, writes
`blocks.jsonl`, and skips expensive PDF layout XML. Use `--with-layout` only when you intentionally
want layout XML for every imported PDF. Use `--force` to restage already imported sources.
When pointed at the top-level artifact tree, the importer recursively discovers nested
`*/sources/<source>/metadata.json` folders and dedupes repeated captures by upstream `sourceId`.

Agent runs:

```bash
bun packages/cli/src/cli.ts ingest <source_id> --profile pioneer-deepseek-flash
bun packages/cli/src/cli.ts write <source_id> --profile pioneer-deepseek-flash
```

`ingest` builds an agent-facing source packet from `blocks.jsonl`, inlining small sources and
including a manifest plus page windows for larger sources. PDF sources must have complete source
evidence blocks before ingest; ingest no longer runs the legacy LLM normalization prepass.
Manual `normalize` remains useful for inspection and targeted debugging of legacy layouts.

Materialization and inspection:

```bash
bun packages/cli/src/cli.ts materialize
bun packages/cli/src/cli.ts validate
bun packages/cli/src/cli.ts ontology-review
bun packages/cli/src/cli.ts ontology-normalize-run relation-ontology --include relation-kind-inventory --dry-run
bun packages/cli/src/cli.ts transcripts
bun packages/cli/src/cli.ts transcript <run_name>
bun packages/cli/src/cli.ts transcript <run_name> --full
bun packages/cli/src/cli.ts usage <run_name>
```

`ontology-normalize-run` is audit-first: it writes machine-validated and quarantined typed decisions
under `data/ontology-decisions/`, but those decisions are not automatically applied to canonical
records or materialized pages.

Provider/model inspection:

```bash
bun packages/cli/src/cli.ts profiles
bun packages/cli/src/cli.ts providers
bun packages/cli/src/cli.ts models
```

## Providers

Configured profiles live in `harness.config.json`.

Useful current profiles:

- `pioneer-deepseek-flash`
- `pioneer-deepseek-pro`

Pioneer uses `PIONEER_API_KEY`. The provider implementation is in
`packages/core/src/models.ts`.

## Current Prototype Sources

First canary source:

- `14th_street_busway_brochure`
- Good for a small brochure-shaped run.
- It exposed useful issues: broad evidence spans, duplicate observations, and writer pages missing
  related treatment/metric records and source-table evidence.

Recommended next prototype source:

- `m86_sbs_progress_report_2017`
- Staged at `raw/sources/m86_sbs_progress_report_2017/`.
- Upstream source id is preserved in metadata as `upstreamSourceId`.
- Better for agent testing because it is an 11-page official progress report with launch dates,
  treatments, route/corridor scope, before/after metric claims, ridership, reliability, customer
  satisfaction, queue jumps, off-board fare payment, bus bulbs, neckdowns, and caveats.

Suggested next run:

```bash
bun packages/cli/src/cli.ts chandra-run m86_sbs_progress_report_2017
bun packages/cli/src/cli.ts ingest m86_sbs_progress_report_2017 --profile pioneer-deepseek-flash
```

Curated source import status:

- The curated set at `/mnt/models/dev/bus-reliability-tracker/data/artifacts/docs/gap-roadmap-docs-2026-05-25`
  has been imported in cheap mode.
- Latest manifest: `data/source-imports/latest.json`.
- Import result on June 8, 2026: 61 discovered, 53 staged, 8 skipped, 0 failed.
- Skips were metadata-only captures without `text.txt`, `source.pdf`, `source.html`, or `source.json`.
- `raw/sources/` currently contains 54 source folders including the earlier M86 prototype.

Full artifact tree dry-run status:

- Root: `/mnt/models/dev/bus-reliability-tracker/data/artifacts/docs`.
- Latest full dry-run on June 8, 2026 found 2,909 captures, 2,632 unique source ids, 277 duplicate
  captures, 2,568 not-yet-staged stageable sources, and 64 skips.
- Would-stage artifact size is about 7.35 GB before extracted text/block files.
- Use the dry run first before staging the full tree:
  `bun packages/cli/src/cli.ts import-sources /mnt/models/dev/bus-reliability-tracker/data/artifacts/docs --dry-run`.

## Data And Page Conventions

- Keep ids minimal. Prefer compact local source ids and short canonical ids.
- Page filenames may be descriptive, but do not append hash suffixes unless required for collision handling.
- Agents should not submit hashes. Evidence hashes are runner-owned.
- Every structured observation should carry source-backed evidence refs.
- Preserve source literals. Do not normalize raw project names, dates, metric values, or quotes by guessing.
- Use enums only for closed-world classifications such as treatment kind, date role, status, metric family,
  relation kind, truth status, and review state.
- Open-world entities such as projects, interventions, corridors, studies, reports, claims, gaps, and events
  should be discovered as source-backed records.
- Materialization should be idempotent and resumable.
- The deterministic runner may create pages immediately from accepted submissions when the record kind
  is page-bearing.
- Source pages under `wiki/sources/` should have generated YAML frontmatter plus the full source
  document as Markdown, with citeable block ids and no JSON body. Page-bearing generated wiki pages
  should be YAML frontmatter plus writer markers only.
- Claims, metric claims, events, treatment components, and relations are canonical data-only records
  by default. Inspect them through canonical record tools and surface useful context on related
  project, corridor, route, entity, or gap pages.
- Do not submit table records. Table content belongs in citeable source table/table-like blocks.
  Extract substantive table facts as metric/claim or domain records that cite those blocks. If expected
  table structure is missing or unusable, use a qualified source gap.

Writer region contract:

```markdown
<!-- mta-wiki:writer:start -->
...
<!-- mta-wiki:writer:end -->
```

## Agent Tooling Expectations

Extractor/first agent:

- Reads one staged source packet at a time.
- Uses source tools for paging, search, and evidence expansion when the inline packet is incomplete
  or context is ambiguous.
- Submits structured observations as it works through the source.
- Does not need to know whether a page was created from a submission.
- Should submit uncertainty, caveats, source gaps, and absence checks when source-backed.

Writer/second agent:

- Reads materialized wiki pages and writes context.
- Must not alter generated frontmatter.
- Must not write to `wiki/sources/`; source pages are read-only source context.
- Should add synthesis, caveats, relationship explanations, and open questions.
- Should not make unsourced external claims.
- Before saying something is "not extracted" or "missing", it should inspect related pages and
  canonical data-only records for the same `source_id`, especially treatment, metric, table, claim,
  relation, event, and gap records.

## Known Current Issues

- The first 14th Street run has overlapping/duplicate records, especially project goals and launch events.
- Evidence spans can be too broad around OCR/table-like text.
- Writer tooling currently makes it too easy to read only source/project/corridor/route pages and miss related
  entity pages.
- Status semantics need refinement. A source may be pre-launch even when the real-world project later launched;
  represent document-time status separately from resolved real-world status.
- Some source gaps are reviewer context rather than source-stated facts and should stay clearly qualified.

## Editing Notes

- Prefer existing code patterns and keep changes scoped.
- Do not edit `docs/immutable-mta-llm-wiki-spec.md` during ordinary work. Treat it as read-only unless
  the user explicitly asks to edit that exact file.
- Skim `LOG.md` before substantial work and update it only for changelog-worthy release milestones,
  public data-contract changes, publication decisions, or active caveats.
- Use `rg` for search when shell access works.
- Use `apply_patch` for manual edits.
- Do not revert unrelated user changes.
- After code changes, run `bun run typecheck` and `bun run validate` when possible.
