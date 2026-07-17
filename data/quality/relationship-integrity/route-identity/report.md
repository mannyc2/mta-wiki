# Route identity exhaustiveness migration v1

This audit closes the silent route-anchor fall-through against the immutable v1-rc20 baseline without editing any existing release.

## Exact reconciliation

- Canonical route records: 395
- Records absent from the immutable rc20 route-anchor accounting: 109 (90 legacy gaps plus 19 post-rc20 route records)
- Deterministic unique SBS `+` successor bindings: 13 (11 legacy gaps plus 2 post-rc20 historical Limited records)
- Evidence-reviewed variant bindings: 1
- Exact current-GTFS bindings for post-rc20 route records: 16
- Reviewed non-projectable dispositions added for the combined backlog: 79
- Ending unaccounted records: 0
- Total evidence-linked non-projectable dispositions: 96
- Resulting route-anchor rows for a future release: 482 (386 GTFS rows plus 96 disposition rows)
- Existing v1-rc20 `route_anchors.jsonl` remains byte-identical at 517b8f74a89e70ec4791d0bf327da6224bb9a6b2ea44eaf8162d704721659239

The v1 successor rule removes only a terminal `+` from a sole current GTFS candidate, and only when the record has no exact GTFS id or short-name match. It never strips Local/LTD/E, splits an aggregate A/B label, or infers a route from arbitrary SBS text. All other non-exact identities require an evidence-linked reviewed override or a non-projectable disposition.

## Reproduction

```bash
bun data/relationship-integrity/dispositions/v1/routes/generate.ts
bun test packages/pipeline/test/materialize/route-anchors.test.ts --timeout 900000
bun run --cwd packages/pipeline typecheck
sha256sum data/exports/releases/v1-rc20/route_anchors.jsonl
cat data/exports/releases/LATEST
```

The generator fails if canonical routes, the pinned GTFS routes, or the rc20 anchor baseline drift. It also fails unless all 109 rc20-unaccounted current rows receive exactly one primary outcome and all 395 canonical records appear exactly once in the computed future accounting.
