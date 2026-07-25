# Relationship-like payload-reference integrity audit

Contract: `relationship-reference-contract-v1` (warning-first).

Projected corpus: 85,411 canonical records.

Exhaustive payload inventory: 14,670 valid string values and 0 invalid values across 15 rules / 26 fields.

## Exclusive primary dispositions

- Origin-attributed derived edges: 5,555.
- Already-present canonical edges: 439.
- Native supportable missing edges: 0.
- Explicit self skips: 27.
- Reviewed supportable canonicalizations still missing an edge: 0.
- Reviewed supportable canonicalizations with an existing edge: 93.
- Reviewed non-authoritative context literals: 647.
- Reviewed forbidden self references: 2.
- Reviewed temporal-scope mismatches: 4.
- Reviewed unresolved claims: 1,838.
- Reviewed ambiguous claims: 6,067.
- Unreviewed unresolved/ambiguous claims: 0.

Native generator reconciliation: 0 rule-field drift and 0 count mismatches.

Proposed evidence-preserving remediations: 0. These are proposals only and are never auto-applied.

Enforcement-mode hard failures: 0. Reviewed legacy unresolved/ambiguous/context rows remain explicit warnings; unseen or stale review surfaces, invalid values, evidence failures, policy drift, and pending supportable links fail closed.

## Highest-volume review groups

| Rule / field | Normalized value | Native state | References | Review disposition | Candidates |
|---|---|---:|---:|---|---:|
| `metric-source-system-has-metric.entity` | `long island rail rd` | ambiguous | 1,214 | `reviewed_ambiguous_reference_claim` | 5 |
| `source-publisher.publisher` | `metropolitan transportation authority` | ambiguous | 905 | `reviewed_ambiguous_reference_claim` | 8 |
| `source-publisher.publisher` | `mta` | ambiguous | 443 | `reviewed_ambiguous_reference_claim` | 4 |
| `metric-source-system-has-metric.entity` | `new york city transit` | ambiguous | 390 | `reviewed_ambiguous_reference_claim` | 3 |
| `metric-source-system-has-metric.entity` | `mta long island rail rd` | ambiguous | 346 | `reviewed_ambiguous_reference_claim` | 2 |
| `metric-source-system-has-metric.entity` | `metropolitan transportation authority` | ambiguous | 291 | `reviewed_ambiguous_reference_claim` | 8 |
| `metric-source-system-has-metric.entity` | `mta` | ambiguous | 207 | `reviewed_ambiguous_reference_claim` | 4 |
| `metric-source-system-has-metric.entity` | `mta new york city transit` | ambiguous | 140 | `reviewed_ambiguous_reference_claim` | 3 |
| `metric-source-system-has-metric.entity` | `mta new york city transit nyct` | unresolved | 118 | `reviewed_unresolved_reference_claim` | 0 |
| `metric-route-has-metric.route` | `bx41` | ambiguous | 116 | `reviewed_ambiguous_reference_claim` | 3 |
| `metric-source-system-has-metric.entity` | `nyct` | ambiguous | 105 | `reviewed_ambiguous_reference_claim` | 5 |
| `entity-organization.organization` | `metropolitan transportation authority` | ambiguous | 103 | `reviewed_ambiguous_reference_claim` | 8 |
| `source-publisher.publisher` | `mta new york city transit` | ambiguous | 100 | `reviewed_ambiguous_reference_claim` | 3 |
| `metric-route-has-metric.route` | `bx6` | ambiguous | 99 | `reviewed_ambiguous_reference_claim` | 2 |
| `metric-route-has-metric.route` | `m60` | unresolved | 98 | `reviewed_unresolved_reference_claim` | 1 |
| `metric-source-system-has-metric.entity` | `mta lirr` | unresolved | 86 | `reviewed_unresolved_reference_claim` | 0 |
| `metric-route-has-metric.route` | `b46` | ambiguous | 85 | `reviewed_ambiguous_reference_claim` | 3 |
| `metric-source-system-has-metric.entity` | `nyc transit` | unresolved | 80 | `reviewed_unresolved_reference_claim` | 0 |
| `source-publisher.publisher` | `mta long island rail rd` | ambiguous | 75 | `reviewed_ambiguous_reference_claim` | 2 |
| `metric-route-has-metric.route` | `b82` | ambiguous | 73 | `reviewed_ambiguous_reference_claim` | 6 |
| `source-publisher.publisher` | `new york city transit` | ambiguous | 70 | `reviewed_ambiguous_reference_claim` | 3 |
| `metric-route-has-metric.route` | `ulsd` | unresolved | 65 | `reviewed_non_authoritative_context_literal` | 0 |
| `entity-organization.organization` | `mta` | ambiguous | 61 | `reviewed_ambiguous_reference_claim` | 4 |
| `metric-route-has-metric.route` | `bx12` | ambiguous | 59 | `reviewed_ambiguous_reference_claim` | 2 |
| `metric-route-has-metric.route` | `m86` | ambiguous | 58 | `reviewed_ambiguous_reference_claim` | 2 |
| `metric-route-has-metric.route` | `lirr` | unresolved | 56 | `reviewed_non_authoritative_context_literal` | 0 |
| `source-publisher.publisher` | `metropolitan transportation authority mta` | ambiguous | 54 | `reviewed_ambiguous_reference_claim` | 2 |
| `metric-source-system-has-metric.entity` | `metro north` | ambiguous | 49 | `reviewed_ambiguous_reference_claim` | 2 |
| `metric-source-system-has-metric.entity` | `new york city transit nyct` | unresolved | 49 | `reviewed_unresolved_reference_claim` | 0 |
| `metric-source-system-has-metric.entity` | `mta mnr` | unresolved | 48 | `reviewed_unresolved_reference_claim` | 0 |

Every audit row retains the origin record's exact evidence refs. Group decisions pin the exact origin-record, source, evidence, and canonical-candidate sets reviewed; adding a new row to an existing normalized group makes the decision stale instead of silently inheriting a waiver.

Non-route literals in generalized route fields are classified as context only when they contain no NYC bus-route identity surface. Generic route bases that could mean local, limited, or SBS variants remain ambiguous and are never guessed.
