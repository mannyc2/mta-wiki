# Route Normalization / Dedupe / Canonicalization Campaign - 2026-06-24

## Deterministic Re-Baseline

- `bun packages/cli/src/cli.ts validate`: clean, `Issues: 0`.
- Canonical route records: `321` lines in `data/canonical/routes.jsonl`.
- Identity-review validation issues: `156` total in `data/identity-review/validation_issues.jsonl`, `0` route-scoped issues by route-id scan.
- Identity overrides: route aliases `146`, route do-not-merge pairs `64`.
- Strict-ish primary route id plus variant duplicate leads:
  - `B3|`: `route_b3-2015-sbk-corridor`, `route_b3-draft-plan` (audit lead; variant absent).
  - `M15|limited`: `route_m15-limited-2010-06-09`, `route_m15-local-limited` (known bundled/local-limited typing problem, not a blind merge).
  - `S|shuttle`: `route_meeting-doc-152171-42-st-shuttle`, `route_meeting-doc-160271-s-shuttle` (known false duplicate pressure from under-specified shuttle key).
- Top denormalization hotspots by `_merged_field_values` count include `route_utica-ave-sbs`, `route_q52-sbs-queens`, `route_q53-sbs-ace`, `route_bx12-plus`, `route_webster-ave-sbs`, `route_b44-sbs`, `route_m34-sbs`, and `route_bx15-ltd-webster-2012`.

## Operating Constraints

- No external/provider-backed LLM commands. Do not run ingest, write, ask, schema, provider-backed identity review, or provider-backed ontology normalization.
- Keep `validate` clean.
- Prefer deterministic code paths, identity overrides, schema normalization, materialization behavior, and tests over hand-editing canonical JSONL.
- The repo is dirty from broader campaign work; preserve unrelated changes.

## Subagent Audit Lanes

1. **Route identity-key audit**
   - Find under-specified route keys, especially single-letter/public ids such as `S` shuttle where route label, route name, borough, or mode should disambiguate identities.
   - Output concrete candidate records, decisive payload/evidence fields, and deterministic key-generation rules.

2. **Bundled / aggregate route audit**
   - Classify multi-route records (`Q52/Q53`, `X28/X38`, `SIM23/SIM24`, `Bx40/42`, `M34/M34A`, local/limited bundles).
   - Propose deterministic representation rules: separate durable route identities when source-backed, aggregate/list context when source only states a bundle, and avoid assigning pure service variants to bundled/generic records.

3. **Route denormalization audit**
   - Inspect high `_merged_field_values` route records and classify each as healthy evidence accumulation, source contamination, or split candidate.
   - Prioritize high-confidence guardrails/fixes over broad merge work.

4. **Override / code-path audit**
   - Identify the right deterministic implementation points: `packages/db/src/identity.ts`, submission route validation/normalization, identity overrides, materializer page policy, and tests.
   - Recommend the smallest high-confidence patch set.

## Initial Implementation Targets

- Guard route identity key generation so `S` shuttle records do not collide when route names/labels indicate 42 St Shuttle versus Rockaway Park Shuttle.
- Prevent bundled/local-limited route records from presenting as a pure single `service_variant` when deterministic identity text indicates a bundle/generic local-limited reference.
- Add focused tests for shuttle identity keys and bundled-route classification/validation.

## Campaign Result

- Completed the four Codex-only audit lanes without provider-backed harness commands or canonical JSONL hand edits.
- Implemented deterministic local/limited composite normalization in `packages/pipeline/src/ontology/normalizers.ts` and route submission guardrails in `packages/pipeline/src/records/submissions.ts`.
- Reused and extended focused tests in `packages/db/test/identity.test.ts`, `packages/pipeline/test/materialize/materialize.test.ts`, and `packages/pipeline/test/records/submissions.test.ts`.
- Added one narrow route do-not-merge guard for `route_m34-sbs` versus `route_m34a-sbs` after deterministic materialization exposed a single `route_m34-m34a` duplicate pressure.
- Verification passed: `bun test packages/db/test/identity.test.ts`, `bun test packages/pipeline/test/materialize/materialize.test.ts`, `bun test packages/pipeline/test/records/submissions.test.ts`, `bun run typecheck`, `bun packages/cli/src/cli.ts materialize`, and `bun packages/cli/src/cli.ts validate` (`Issues: 0`).
- Machine-readable result note: `data/review_notes/codex-route-normalization-campaign-2026-06-24.json`.

## Remaining Lanes

- Add mode-qualified identity keys for single-letter subway routes.
- Decide route-scope/materializer policy for true aggregate and service-bundle route records.
- Create deterministic split or representation plans for B46/Utica, Q52/Q53, M34/M34A, Webster/Bx41, and Bx40/42 hotspots.
- Review whether source-shaped route aliases should remain merge-authority identity keys on variant-specific records.
