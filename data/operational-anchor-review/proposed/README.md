# Operational recovery proposal queue

This queue is the only reviewed path for adding missing operational relations or
source-backed observations outside a normal ingest run.

- `relations/<proposal_id>.json`: one proposed relation between existing canonical records.
- `observations/<proposal_id>.json`: one source-local observation bundle plus its relations.
- `applied/<kind>/`: accepted proposals moved here only after their append-only recovery journal materializes and verifies.
- `rejected/<kind>/`: rejected proposals with reviewer, timestamp, and reason.

Every proposal is strict-schema, binds current operational coverage `gap_ids` and the
current live-computed `corpus_fingerprint`, cites exact source blocks, and carries drafting provenance.
An accepted proposal additionally requires `accepted_by`, `accepted_at`, and a passed
adversarial verifier. Review changes those explicit review fields only; it must not edit
the proposed semantic content.

Validate and inspect the queue:

```bash
bun packages/cli/src/cli.ts operational-recovery-proposals
bun packages/cli/src/cli.ts validate
```

Application is dry-run by default. `--force` writes a new journal under
`data/submissions/`, adds proposal/reviewer provenance to every journal row, runs the
normal materializer, verifies the resulting records/relations, then moves the unchanged
proposal into `applied/`. It also regenerates operational coverage artifacts before the
move, so the next proposal cannot rely on a stale matrix:

```bash
bun packages/cli/src/cli.ts operational-recovery-apply <proposal_id>
bun packages/cli/src/cli.ts operational-recovery-apply <proposal_id> --force
```

Existing journals are never rewritten. If materialization or coverage refresh fails after
the new journal is created, the accepted proposal remains pending; a retry validates and
reuses that exact provenance-bound journal, tolerating already-materialized members while
requiring the final complete bundle before the proposal can move to `applied/`.
