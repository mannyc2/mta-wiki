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

## Relationship Integrity Boundary

Canonical JSONL remains authoritative. SQLite is a deterministic, sealed projection and is not
treated as protection for records that have not passed the repository materializer. Relationship
invariants therefore run before canonical JSONL is installed, are repeated by normal validation and
quality commands, and are mirrored in SQLite for query-time diagnostics and defense in depth.

The versioned v1 contract lives under `data/contracts/relationships/v1/`. It pins:

- every canonical relation identity and reviewed subject/object type tuple;
- the allowed endpoint-type matrix and alias/supersession policy;
- stable referential, type, evidence, duplicate, and completeness finding codes;
- objective warning-to-enforcement criteria and their proof artifacts.

Relationship-like payload fields have a separate versioned contract under
`data/contracts/relationship-references/v1/`. Exact resolutions become evidence-bound derived
edges. Ambiguous, unresolved, contextual, temporal-mismatch, and self-reference values must match
an immutable reviewed decision; an unseen equivalent fails closed in enforcement mode.

Completeness is selector-based rather than inferred from the absence of dangling edges. The
materializer evaluates the route, operational-event, eligible-occurrence, occurrence-treatment
physicality, and bus-lane-treatment populations. Each in-scope row must satisfy its required roles
or carry an evidence-linked reviewed non-projectable disposition. Waivers use an exact versioned
role vocabulary, always set `study_projectable=false`, and cannot manufacture route, segment,
phase, onset, or operational claims.

The SQLite v8 projection mirrors canonical identities, typed relations, evidence bindings,
selector contracts, role status, and exact waiver scope. Foreign keys, typed edge triggers,
JSON/normalized-column parity triggers, enforcement-state guards, and seal-time diagnostic checks
prevent an alternate database writer from representing a graph that the authoritative validator
would reject.

The contract begins in `warning_first` mode so legacy diagnostics are visible in ordinary
`validate` and quality commands. Promotion to `enforced` requires hash-pinned zero-violation
artifacts, complete reviewed dispositions, two independent deterministic materialization/export
captures, and a sealed SQL mirror. An enforced release uses manifest v4 and embeds the complete
relationship-integrity bundle. Internal release cuts never change `LATEST` unless the owner invokes
the separate explicit promotion command.

## Source Ownership

Structured facts belong in submissions, canonical records, release JSONL, and database projections.
Narrative context belongs only in writer regions. Source pages under `wiki/sources/` are generated
source context and are not writer-owned.

The materializer is idempotent and resumable. When generated outputs change, the change should be
explainable by changed inputs, code, or deterministic override files.
