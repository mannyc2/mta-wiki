# MTA LLM Wiki Spec

This is the current public-facing product spec for MTA Wiki. The immutable charter remains in
`docs/immutable-mta-llm-wiki-spec.md`; this document explains the concrete repository contract.

## Goal

MTA Wiki turns official and public MTA, NYC DOT, and related transit documents into:

- Source-backed structured records.
- Generated Markdown wiki pages.
- Versioned JSONL release exports for downstream consumers.
- A deterministic SQLite materialization for local query work.

The project is not a generic chat/RAG corpus. Its product is the structured, citeable, reusable data
surface.

## Published Corpus

The public repository publishes:

- Accepted and rejected submission journals under `data/submissions/`.
- Canonical JSONL records under `data/canonical/`.
- Compact cited-block evidence metadata under `data/evidence-block-index.jsonl`.
- Generated wiki pages under `wiki/`.
- The current v1 release under `data/exports/releases/v1-rc25/`.
- Code, tests, validation tools, and durable documentation.

The public repository does not publish:

- `raw/`, the local staged source artifact tree.
- `data/canonical.db`, the generated SQLite database.
- `data/post-ingest/`, operational run telemetry.
- Local execution plans under `plans/`.

## Evidence Contract

Every substantive structured observation should cite source evidence. Source literals should be
preserved. Runner-owned hashes, canonical ids, and normalized companions are deterministic pipeline
outputs, not agent guesses.

Source pages under `wiki/sources/` are generated source context. Non-source wiki pages contain
materializer-owned frontmatter plus writer-owned Markdown regions.

## Record Contract

Canonical records use open-world source labels with bounded normalized companions where useful.
Durable page-bearing records include sources, entities, projects, corridors, routes, and source gaps.
Data-only records include treatment components, events, claims, metric claims, and relations.

Relations are first-class records. They carry endpoint ids, evidence refs, relation kind, bounded
relation family, assertion posture, and provenance.

## Release Contract

Release exports are immutable snapshots of the canonical JSONL surface plus release metadata. The
current v1 release is `v1-rc25`, and `data/exports/releases/LATEST` points to that id.

Downstream consumers should pin a release id instead of assuming `main` is stable.

## Writer Primitives

Writer regions may use typed Markdown primitives so prose can point at current structured data
without restating values.

1. **Inline reference**: `[[<kind>:<record_id>[#<block_id>]|<label>]]`
   - `kind` is one of `route`, `corridor`, `project`, `entity`, `metric`, or `cite`.
   - `cite:` targets a `source_id` with optional `#<block_id>`; all other kinds target a
     canonical `record_id` with no block suffix.
   - Legacy `[[wiki/<path>|<label>]]` links have no `kind:` prefix and are page links, not writer
     primitives.
2. **Block component**: fenced code block with language tag `mta:<kind>`, body a single JSON
   object, minimum `{"id": "<record_id>"}`. The block kind set is `route`, `corridor`, `project`,
   `entity`, and `metric`; `cite` is inline-only.
3. **Invariant**: primitives carry only ids and labels, never restated values. A metric primitive
   is a pointer; renderers pull the current value and provenance from `canonical.db` at build time
   so prose cannot drift from data.

Validation emits `dangling_writer_primitive` when a primitive points at an unknown record, the
wrong record kind, an unknown source, an unknown block, or invalid block JSON. The stricter
`uncited_writer_paragraph` rule is available behind `validate --strict-writer-citations`; by
default it is off.

## Operating Contract

The standard local gates are:

```bash
bun run typecheck
bun run test
bun run validate
bun scripts/determinism-anchor.ts
```

`validate` must report `Issues: 0`.

Full materialization from submissions currently requires the local `raw/` tree. In fresh public
clones, `bun run materialize` detects the missing local source blocks and rebuilds only the ignored
SQLite projection from tracked canonical JSONL. `bun run validate` then uses the tracked evidence
block index for evidence-page/hash checks.
