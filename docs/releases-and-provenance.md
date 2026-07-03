# Releases and Provenance

## Current Release

The v1 public data release is `v1-rc5`.

- Git tag: `v1`
- Release pointer: `data/exports/releases/LATEST`
- Release directory: `data/exports/releases/v1-rc5/`
- Public repository: `https://github.com/mannyc2/mta-wiki`

The release manifest records per-kind counts, hashes, and pointers to companion release artifacts.

## License

Code is licensed under the MIT License.

Source documents are public NYC/MTA government records obtained from public agency websites.
Extracted text and derived data are provided for research and reference. To request a correction or
takedown, open a GitHub issue.

## What Is Tracked

Tracked durable surfaces:

- Pipeline code and tests.
- `data/submissions/`, the accepted and rejected observation journals.
- `data/canonical/`, the canonical JSONL records.
- `data/evidence-block-index.jsonl`, compact cited-block metadata used by public-clone validation.
- `data/reference/gtfs/`, the small GTFS route/agency reference input used by SQLite projections.
- `wiki/`, the generated wiki pages and source context pages.
- `data/exports/releases/v1-rc5/`, the current v1 release snapshot.
- Documentation in `docs/`.

Ignored local or build surfaces:

- `raw/`, the staged source artifacts and OCR block inputs.
- `data/canonical.db`, the deterministic SQLite materialization.
- `data/post-ingest/`, operational run telemetry.
- Superseded release candidates `v1-rc1` through `v1-rc4`.
- Local planning files under `plans/`.
- Local automation state under `.claude/`.

Fresh public clones can recreate `data/canonical.db` from tracked canonical JSONL with:

```bash
bun run materialize
```

Evidence validation in public clones uses `data/evidence-block-index.jsonl`.

## Publication History

The old local Git history was retired because it contained a 120.95 GiB pack with large generated
artifacts. It remains on disk as `.git-archive/` until the owner explicitly deletes it. The public
repository uses a fresh history intended for normal GitHub operation.
