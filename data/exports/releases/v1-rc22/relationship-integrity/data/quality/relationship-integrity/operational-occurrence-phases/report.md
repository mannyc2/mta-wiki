# Operational occurrence phase review v1

This deterministic review covers all 135 current schema-v2 operational occurrences (134 study-projectable and 1 ineligible). It treats canonical event records as physical phase identities and never derives earlier/later order from dates, labels, routes, or shared projects.

## Result

- Phase identity memberships: 135
- Unique canonical phase events: 135
- Projected evidence-backed phase relations: 0
- Event-to-event candidates explicitly checked: 0
- Findings requiring review: 0
- Phase hard-mode ready: true

| Primary disposition | Count |
| --- | ---: |
| single_observed_phase_no_related_phase_asserted | 135 |
| evidence_bound_related_phases | 0 |
| review_required | 0 |

| Candidate disposition | Count |
| --- | ---: |
| projected_reviewed_phase_relation | 0 |
| not_projected_external_event_not_selected | 0 |
| not_projected_non_phase_semantics | 0 |
| review_required_unprojected_same_occurrence_temporal_relation | 0 |

The single-phase disposition means only that the accepted occurrence review selected one evidenced event and asserted no earlier/later edge inside that occurrence. It is not a claim that the broader project has no other phases.

## Reproduction pins

- Route-anchor release: v1-rc21
- Route-anchor release manifest SHA-256: `e60606d177f5ab51bd7c11dc4972cc4b2f53b345d801bc2d27f93c931b162299`
- Current canonical record count: 85392
- Schema-v2 occurrence projection SHA-256: `de85fa5791540d373b11b6975cece389360607e70875d878af28a6b492707b9d`
- Canonical phase/event-relation projection SHA-256: `437d9cb83ea87bffec5c8fc14ca9c5ccab4c8dd3df9717dba50def184a8f51a2`

Reproduce or verify with:

```bash
bun scripts/generate-operational-occurrence-phase-review-v1.ts --check --route-anchor-release-dir data/exports/releases/v1-rc21
bun test packages/pipeline/test/quality/operational-occurrence-phases.test.ts
```
