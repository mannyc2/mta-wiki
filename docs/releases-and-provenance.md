# Releases and Provenance

## Current Release

The v1 public data release is `v1-rc25`.

- Git tag: `v1-rc25`
- Release pointer: `data/exports/releases/LATEST`
- Release directory: `data/exports/releases/v1-rc25/`
- Public repository: `https://github.com/mannyc2/mta-wiki`

The release manifest records per-kind counts, hashes, and pointers to companion release artifacts.

### Treatment semantic companions

Manifest-v5 candidates may address a complete seven-file treatment companion set without changing
the manifest schema or rewriting canonical treatment records. The semantic contract retains every
exact `payload.treatment_kind` literal and assigns each record scope to one of three dispositions:
canonical atomic treatment, explicit source-backed bundle with lossless members, or documented but
unresolved with a review reason. The release verifier reconstructs the vocabulary inventory,
reconciliation, unresolved queue, and route-scope projection from the addressed canonical records
and rejects missing, stale, duplicate, or byte-divergent artifacts.

`route_treatment_scopes.jsonl` authorizes a route/treatment pair only from a direct allowlisted,
evidence-bound treatment-to-route relation or an approved operational occurrence. A shared
`projectRef` is context, never route scope: project membership cannot fan every project treatment
out to every project route. Unscoped or ambiguous records remain losslessly represented in
`route_treatment_scope_reconciliation.jsonl` instead of being guessed into route evidence.

Regenerate and verify the reviewed source vocabulary with:

```bash
bun run treatment-semantics:check
```

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

Missing records and relations are recovered only through the strict proposal tree at
`data/operational-anchor-review/proposed/`. Relation proposals bind existing canonical endpoints
and exact canonical evidence; observation bundles keep all new records and relations within one
source and require shared block context for local observation links. Acceptance requires
`accepted_by`, `accepted_at`, and a passed adversarial verifier. The force-gated apply command writes
a new append-only journal whose every entry carries `recovery_provenance`, runs normal
materialization, refreshes the operational matrix, verifies the resulting records and relations,
and only then moves the unchanged proposal to `applied/`. A partial failure remains resumable and
cannot silently duplicate a proposal or submission identity. Before journal creation, apply runs
the materializer's record-id assignment across the complete unretired submission corpus and rejects
any proposal that would shift an existing id or receive an undeclared collision suffix. Apply and
repository validation share one exact proposal-derived validator for every persisted journal field.

### Release pointer semantics

`data/exports/releases/LATEST` names the current public release. Creating a release snapshot does
not change that pointer by default. Promotion is a separate, explicit action:

```bash
bun packages/cli/src/cli.ts export-release --id <release-id> --set-latest
```

Omit `--set-latest` for draft, test, and internal canary cuts. The exporter updates the pointer only
after the complete release and manifest have been written successfully.

Immutable candidates later found contract-invalid are quarantined without modifying their named
release directory or `LATEST`. Machine-readable status records live under
`data/exports/release-status/`; the release verifier and consumers consult its deterministic index.
Each quarantine record binds the affected manifest and artifact hashes, exact decoder failure,
affected identity, discovery date, and replacement release when known.

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
- `data/exports/releases/v1-rc25/`, the current v1 release snapshot.
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
