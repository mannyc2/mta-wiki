# Releases and Provenance

## Current Release

The v1 public data release is `v1-rc5`.

- Git tag: `v1`
- Release pointer: `data/exports/releases/LATEST`
- Release directory: `data/exports/releases/v1-rc5/`
- Public repository: `https://github.com/mannyc2/mta-wiki`

The release manifest records per-kind counts, hashes, and pointers to companion release artifacts.

### Operational coverage diagnostics

`bun packages/cli/src/cli.ts operational-coverage` writes a deterministic completion ledger,
priority queue, and coverage matrix under `data/quality/operational-coverage/`. The matrix keeps
canonical operational events, broad anchor rows, reviewed overlays, resolved occurrences, and
occurrence-route projections as separate populations. Reviewed overlays never increase the
canonical-event or timeline-linked-event denominator, and bundles remain one occurrence regardless
of member count.

The priority queue is a bounded study-work feeder, not a completeness percentage. Its denominator
includes every open route, treatment, date-precision, delivered-status, or timeline-subject gap for
bus-relevant in-window events and the explicit route-redesign, TSP, and busway families. Durable
decisions must retain exact evidence or receipt bindings; terminal `absent_in_source` decisions
require a gap-bound search receipt covering every required source plus the staged-source registry.
Receipts bind to the matrix's corpus fingerprint and replay from
`data/operational-anchor-review/ledger-decisions/search-receipts/`; a missing, stale, incomplete,
or match-bearing receipt fails closed.

### Release pointer semantics

`data/exports/releases/LATEST` names the current public release. Creating a release snapshot does
not change that pointer by default. Promotion is a separate, explicit action:

```bash
bun packages/cli/src/cli.ts export-release --id <release-id> --set-latest
```

Omit `--set-latest` for draft, test, and internal canary cuts. The exporter updates the pointer only
after the complete release and manifest have been written successfully.

### Internal releases and canaries

Internal releases such as temporal canaries may remain untracked and can be removed after their
release id, generator commit, and manifest SHA-256 have been recorded for reproducibility. Removing
release artifacts or promoting a canary is an owner action; neither happens as a side effect of an
ordinary release export.

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
- `data/quality/operational-coverage/`, the deterministic operational completion ledger and matrix.
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
