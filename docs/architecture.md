# Architecture

MTA Wiki is a filesystem-first knowledge base for MTA and NYC bus-priority sources. The repository
publishes the durable data products: accepted submission journals, canonical JSONL records, generated
wiki pages, release exports, tests, and the pipeline code that produced them.

## Pipeline

1. Source prep stages public agency documents under `raw/sources/<source_id>/` and builds citeable
   source blocks. The `raw/` tree is local-only because it contains large source artifacts.
2. Ingest agents read one staged source packet and submit source-backed observations. Accepted and
   rejected submissions are journaled under `data/submissions/`.
3. Materialization is deterministic. It canonicalizes submissions, applies identity and ontology
   rules, writes `data/canonical/*.jsonl`, renders `wiki/`, and rebuilds `data/canonical.db`.
4. Writer agents may edit only the Markdown body inside writer markers on non-source wiki pages.
   They do not own frontmatter, source pages, or structured data.
5. Query tools read canonical records, wiki pages, evidence refs, release exports, and the SQLite
   materialization.

## Generated Surfaces

- `data/submissions/`: append-only journals. These are product provenance and are tracked.
- `data/canonical/`: canonical JSONL records by kind. These are tracked because they are the durable
  structured data surface.
- `data/evidence-block-index.jsonl`: compact cited-block metadata for public-clone evidence
  validation. It stores block ids, pages, and hashes for cited evidence blocks/ranges, not raw
  source text.
- `wiki/`: generated Markdown pages. Source pages include extracted public-source text; non-source
  pages include materializer-owned frontmatter and writer regions.
- `data/exports/releases/`: versioned release snapshots for downstream consumers.
- `data/reference/gtfs/`: small tracked GTFS route/agency reference input used to rebuild the
  SQLite reference tables deterministically.
- `data/canonical.db`: deterministic SQLite build output. It is ignored because it can be rebuilt
  from tracked canonical JSONL with `bun run rebuild-db` and is too large for ordinary Git history.

## Source Ownership

Structured facts belong in submissions, canonical records, release JSONL, and database projections.
Narrative context belongs only in writer regions. Source pages under `wiki/sources/` are generated
source context and are not writer-owned.

The materializer is idempotent and resumable. When generated outputs change, the change should be
explainable by changed inputs, code, or deterministic override files.
