# Testing and producer-input boundaries

`bun run test` is the mandatory clean-clone regression gate. It uses only
tracked inputs. A preload rebuilds the ignored canonical SQLite projection
under an owned operating-system temporary directory from tracked canonical
JSONL; ordinary tests never inherit `data/canonical.db` from a developer
checkout.

Two stronger hydrated checks are intentionally separate:

- `bun run test:corpus` preflights every declared ignored source artifact
  against `data/test-contracts/local-corpus-manifest-v1.json`, then runs the
  local source-byte and evidence audits. Missing corpus is one deterministic
  preflight failure, never a default-suite skip or accepted failure.
- `bun run test:authoring` performs the same content-addressed corpus
  preflight, then runs the journal/evidence-to-canonical replay. A clean clone
  does not claim this replay occurred when its ignored evidence bytes are
  absent.

The deterministic dependency inventory is
`data/test-contracts/test-local-dependency-inventory-v1.json`; verify it with:

```bash
bun scripts/audit-test-local-dependencies.ts --check
```

Public-snapshot and authoring producer claims are separate in
`data/test-contracts/producer-input-closure-v1.json`:

```bash
bun scripts/audit-producer-input-closure.ts --check --profile public-snapshot
bun scripts/audit-producer-input-closure.ts --check --profile authoring
```

The public clone may rebuild `data/canonical.db` from the sealed tracked
canonical snapshot. That does not imply submission/raw-evidence replay. The
active relationship completeness, enforcement proof, source-refresh receipt,
and release-bundle descriptor form one strict content-addressed chain. Its
read-only reproduction command is:

```bash
bun packages/cli/src/cli.ts relationship-completeness \
  --check-current-public-snapshot --no-sync-db
```

The historical rc20 writer/migration remains a separate restricted workflow.
Completeness, proof, contract, bundle, and the primary ignored DB are refreshed
only through the crash-detectable unified source-refresh transaction. While
its marker exists, primary DB reads/rebuilds plus materialize, quality, and
query entrypoints fail closed and instruct the operator to resume the same
receipt.

Release verification and canonical determinism remain independent mandatory
gates:

```bash
bun scripts/determinism-anchor.ts
bun packages/cli/src/cli.ts verify-release v1-rc28
```
