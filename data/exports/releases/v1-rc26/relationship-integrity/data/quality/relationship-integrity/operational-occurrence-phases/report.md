# Operational occurrence phase review v1

This deterministic review covers all 131 current schema-v2 operational occurrences (130 study-projectable and 1 ineligible). It treats canonical event records as physical phase identities and never derives earlier/later order from dates, labels, routes, or shared projects.

## Result

- Phase identity memberships: 132
- Unique canonical phase events: 132
- Projected evidence-backed phase relations: 1
- Event-to-event candidates explicitly checked: 1
- Findings requiring review: 0
- Phase hard-mode ready: true

| Primary disposition | Count |
| --- | ---: |
| single_observed_phase_no_related_phase_asserted | 130 |
| evidence_bound_related_phases | 1 |
| review_required | 0 |

| Candidate disposition | Count |
| --- | ---: |
| projected_reviewed_phase_relation | 1 |
| not_projected_external_event_not_selected | 0 |
| not_projected_non_phase_semantics | 0 |
| review_required_unprojected_same_occurrence_temporal_relation | 0 |

The single-phase disposition means only that the accepted occurrence review selected one evidenced event and asserted no earlier/later edge inside that occurrence. It is not a claim that the broader project has no other phases.

## Reproduction pins

- Route-anchor release: v1-rc26
- Route-anchor release input fingerprint: `150d9c97266525adb25dd1b910e7fc278f274151216593e48c6500efe23e1d6b`
- Current canonical record count: 85396
- Schema-v2 occurrence projection SHA-256: `4d556489b096d11a040aaad446b25432f3d88e6c8b9a3b3f41a842aede391e22`
- Canonical phase/event-relation projection SHA-256: `0829cf2b044c31f32b0899540bb7586be77e891b9ec759a103e22bcdf3d43d69`

Reproduce or verify with:

```bash
bun scripts/generate-operational-occurrence-phase-review-v1.ts --check --route-anchor-release-dir data/exports/releases/v1-rc26
bun test packages/pipeline/test/quality/operational-occurrence-phases.test.ts
```
