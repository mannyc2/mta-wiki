# Route Normalization Phase 2 - 2026-06-24

## Baseline

- Re-read Phase 1 artifacts:
  - `data/review_notes/codex-route-normalization-campaign-2026-06-24.md`
  - `data/review_notes/codex-route-normalization-campaign-2026-06-24.json`
- `bun packages/cli/src/cli.ts validate`: clean, `Issues: 0`.
- Canonical route records remain `321`.

## Lanes

- `single_letter_and_numeric_subway_route_identity_keys`: completed read-only subagent `019ef98c-6b6d-77e2-a92c-2eb06b910193` / Plato; implemented mode-qualified subway aliases.
- `aggregate_bundled_route_materializer_policy`: completed read-only subagent `019ef98c-7001-7b93-bb8d-aec64f02eb72` / Aristotle; implemented the recommended pure aggregate-route classifier before any page-policy wiring.
- `high_denorm_route_hotspots`: local deterministic triage completed after the thread hit its subagent limit; implemented a narrow split-candidate classifier guardrail for merged service-variant contamination.
- `identity_review_advisory_parser_followup`: implemented local deterministic slice.
- `route_scope_page_policy`: completed read-only subagent `019ef99e-f563-72e3-adec-a6d0e970cb40` / Raman; implemented only the lowest-churn page-policy slice.

## Implemented Slice

The advisory identity-review route parser in `packages/agents/src/identity-review.ts` previously derived
route-base candidate edges from broad free-text labels. Phase 2 changed that path to prefer exact scalar
`payload.route_id` and to decline slash-composite route ids rather than collapsing them to the first member.

Focused tests in `packages/agents/test/identity-review.test.ts` cover:

- `B82E` does not reduce to `B82`.
- `S93` does not reduce to incidental `S53` context.
- `Q52/Q53` does not emit an advisory base route.

The deterministic route identity key generator in `packages/db/src/identity.ts` now emits
mode-qualified subway aliases for A/C/E/F/G/J/L/N/Q/R/W/Z and numeric 1-7 routes when route context
indicates subway/train mode. Rebuilt materialized route aliases now include examples such as
`route_a-subway`, `route_q-subway`, `route_2-subway`, and `route_7-subway`; bare `route_a` /
`route_2` keys are not emitted by the new tests.

The materializer module now exports a pure `routeRecordScope()` classifier with four values:
`true_route`, `aggregate_list_context`, `data_only_scope`, and `split_candidate`. The classifier is
not yet wired into page suppression, but tests cover the audited policy examples:

- `route_x28-x38-bay-pkwy` is aggregate/list context while true `X28` and `X38` records stay true routes.
- `route_15-express-bus-battery-pl` is a data-only count scope.
- `route_m34-sbs` is a split candidate when single-route identity carries merged M34/M34A route surfaces.
- `route_m14-ad-sbs` remains a true route exception despite A/D branch wording.

The high-denorm route hotspot follow-up extended `routeRecordScope()` to flag records whose top-level
route identity says one service variant while `_merged_field_values` carries another strong service
variant. This covers the Q52/Q53 and Utica/B46 pattern where SBS records have accumulated
limited-stop/LTD values. The classifier remains pure and is not yet wired into materializer page
suppression or canonical split behavior. Focused tests keep clean SBS evidence accumulation such as
B44 SBS as `true_route`.

The route page-policy follow-up added a record-aware `pageRelativePathForCanonicalRecord()` helper.
Only `data_only_scope` route records are now non-page-bearing; this removes the count-only
`route_15-express-bus-battery-pl` route page through deterministic materialization while preserving
canonical route records. Aggregate/list context and split-candidate route records remain page-bearing
because the audit found meaningful writer-content/churn risk, including `route_m34-sbs` and several
SBS hotspot records. Writer packet/listing surfaces now use the same record-aware page helper.

## Verification

- `bun test packages/agents/test/identity-review.test.ts`: pass.
- `bun test packages/db/test/identity.test.ts`: pass.
- `bun test packages/pipeline/test/materialize/materialize.test.ts`: pass.
- `bun run typecheck`: pass.
- `bun packages/cli/src/cli.ts materialize`: pass.
- `bun packages/cli/src/cli.ts validate`: pass, `Issues: 0`.
- Post-high-denorm guardrail recheck: `bun test packages/pipeline/test/materialize/materialize.test.ts`, `bun run typecheck`, and `bun packages/cli/src/cli.ts validate` all pass.
- Post-page-policy slice: `bun test packages/pipeline/test/materialize/materialize.test.ts`, `bun run typecheck`, `bun packages/cli/src/cli.ts materialize`, and `bun packages/cli/src/cli.ts validate` all pass. Final validation reports `321` route records, `7354` wiki pages, and `Issues: 0`; `wiki/routes/route_15-express-bus-battery-pl.md` was removed by materialization.

## Remaining

- Decide whether to wire aggregate-route page suppression after a writer-content migration/churn review.
- Decide whether to annotate or otherwise handle split-candidate route pages without deleting useful route pages.
- Keep the persistent goal active; Phase 2 is not complete.
