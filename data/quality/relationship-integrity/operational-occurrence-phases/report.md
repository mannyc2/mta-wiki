# Operational occurrence phase review v1

This deterministic review covers all 131 current schema-v2 operational occurrences (130 study-projectable and 1 ineligible). It treats canonical event records as physical phase identities and never derives earlier/later order from dates, labels, routes, or shared projects.

## Result

- Phase identity memberships: 131
- Unique canonical phase events: 131
- Projected evidence-backed phase relations: 0
- Event-to-event candidates explicitly checked: 0
- Findings requiring review: 0
- Phase hard-mode ready: true

| Primary disposition | Count |
| --- | ---: |
| single_observed_phase_no_related_phase_asserted | 131 |
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

- Route-anchor release: v1-rc24
- Route-anchor release input fingerprint: `22306d79bdf17db99afd79c3fd31a403fdd82cfacabd6f02237425443d41a9bb`
- Current canonical record count: 85392
- Schema-v2 occurrence projection SHA-256: `9c751b39912d25a3d72ac0c94a1b45a253bc087cad4c7b20d07014cc572111a1`
- Canonical phase/event-relation projection SHA-256: `5326bb2f7b2e01a5d78efc4ef78da5743e53ae72833e016c48ef1c81d74f0e52`

Reproduce or verify with:

```bash
bun scripts/generate-operational-occurrence-phase-review-v1.ts --check --route-anchor-release-dir data/exports/releases/v1-rc24
bun test packages/pipeline/test/quality/operational-occurrence-phases.test.ts
```
