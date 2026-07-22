# Operations

Run commands from the repository root.

## Setup

```bash
bun install --offline
```

The public repository intentionally excludes local-only source artifacts under `raw/`, operational
telemetry under `data/post-ingest/`, and the generated SQLite database at `data/canonical.db`.

## Common Commands

```bash
bun run typecheck
bun run test
bun run validate
bun scripts/determinism-anchor.ts
```

Source preparation and agent runs require local source artifacts and provider credentials:

```bash
bun packages/cli/src/cli.ts prepare-source <source-dir>
bun packages/cli/src/cli.ts ingest <source_id> --profile pioneer-deepseek-flash
bun packages/cli/src/cli.ts write <source_id> --profile pioneer-deepseek-flash
```

Materialization:

```bash
bun packages/cli/src/cli.ts materialize
```

Fresh public clone SQLite rebuild:

```bash
bun run materialize
```

## Validation Gates

The standard gate set is:

```bash
bun run typecheck
bun run test
bun run validate
bun scripts/determinism-anchor.ts
```

`bun run validate` must report `Issues: 0`.

## Fresh Clone Note

The public repository tracks canonical JSONL, release exports, wiki pages, and a compact
`data/evidence-block-index.jsonl`, but not `raw/`.

With local `raw/sources/*/blocks.jsonl`, `materialize` performs the full deterministic pipeline
rebuild. In a fresh public clone without `raw/`, it switches to public-clone mode and rebuilds only
the ignored SQLite projection from tracked canonical JSONL:

```bash
bun run materialize
bun run validate
```

The public-clone materialize path refuses to create an empty database from an empty canonical
snapshot and does not rewrite `data/canonical/*.jsonl` or `wiki/`. `validate` uses
`data/evidence-block-index.jsonl` for evidence-page/hash checks when local source blocks are absent.

The reviewed Q45/Q86/Q87 member-extent batch follows the same retention boundary. Its tracked
evidence receipt embeds the 23 minimal reviewed normalized-text blocks; a separate durable-source
manifest pins all seven official archived responses by original URL, archive timestamp/digest,
content type, byte count, SHA-256, and ignored hydration target. Verify the offline fixture in a
clean clone without `raw/`:

```bash
bun run queens-member-extents:sources
bun run study-readiness:check
```

Network hydration is optional and never part of deterministic contract regeneration. To restore
the full exact bytes locally, run `bun run queens-member-extents:hydrate`; the hydrator rejects any
archive response that differs from the committed byte/hash pins.
