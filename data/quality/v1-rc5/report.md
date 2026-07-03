# v1-rc5 Quality Report

Release measured: `v1-rc5`

## Deterministic Checks

- Evidence refs resolved: `132526 / 132526` (`100.00%`).
- Event date-window sanity: `16` flags among `3885` checked dated events. The sample flags are long-horizon contract/future-service dates or one historic anniversary date; these are review signals, not structural failures.
- Route id sanity: `97` flags among `319` route records. Most are subway/rail/ferry, aggregate, historical, proposed, or variant route surfaces outside the static bus GTFS anchor set.
- Release anchor proxy: `396` GTFS route ids, `213` canonical anchors, `183` no-wiki-coverage rows, `0` ambiguous dispositions, `0` null-canonical rows with a coverage disposition.

## LLM Sample Audit

Judge: `pioneer-deepseek-flash` (`deepseek-ai/DeepSeek-V4-Flash`) record-vs-cited-block audit.

- Rows: `300`, stratified as `100` route-scoped relations, `50` treatment components, `75` events, and `75` metric claims.
- Verdicts: `197 supported`, `73 partially_supported`, `26 unsupported`, `4 wrong`.
- Strict precision (`supported / total`): `65.67%`.
- Lenient precision (`supported + partially_supported / total`): `90.00%`.
- Estimated provider spend recorded in `summary.json`: `$0.032633`.
- Human spot-check set: `50` rows flagged with `human_review: true`; review completed on 2026-07-03 UTC with `47` judge agreements, `3` disagreements, `0` needs-follow-up rows, and `94.00%` agreement. Row-level decisions are recorded in `human-review.md`.

Per-sample-group lenient precision:

- Route-scoped relations: `82.00%` (`77 supported`, `5 partially_supported`, `18 unsupported`).
- Treatment components: `92.00%` (`27 supported`, `19 partially_supported`, `3 unsupported`, `1 wrong`).
- Events: `94.67%` (`49 supported`, `22 partially_supported`, `1 unsupported`, `3 wrong`).
- Metric claims: `94.67%` (`44 supported`, `27 partially_supported`, `4 unsupported`).

## Consumer Parity

After bus PR #45 merged, the consumer signal was rerun from a temporary archive of bus
`origin/main` at `8c5bdff00398b0e6c372fd4887ded55d5f052be9`. The importer was pinned directly to
this measured release with `--wiki-release v1-rc5` and consumed `route_anchors.jsonl`.

The importer exited 0 with `12` served Bus routes, `10` matched wiki route records, `308` unmatched
wiki routes, `1,792` citations, and `0` omitted ambiguous records. The lower matched-route count is
expected: M14A+ and M14D+ are honest `no_wiki_coverage` anchor rows in `v1-rc5`, not alias-heuristic
matches. The bus ambiguous-omission gate is clear for this release. The human-review calibration gate
is also complete; Plan 008 / LOG later record the owner close-out decisions required before tagging
`v1`.

## Artifacts

- `deterministic.json`
- `sample-audit.jsonl`
- `summary.json`
- `human-review.md`
- `bus-importer-stats.json`
- `report.md`
