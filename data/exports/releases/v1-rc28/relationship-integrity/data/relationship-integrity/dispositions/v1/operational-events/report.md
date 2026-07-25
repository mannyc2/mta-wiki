# Operational-event relationship dispositions v1

Every canonical event whose event_family is implementation or launch has one immutable, evidence-bound decision. A waiver always sets study_projectable=false and cannot make an event eligible.

- Denominator: 1362
- Study-projectable through approved occurrences: 131
- Explicitly non-projectable: 1231
- Missing decisions: 0

## Exclusive primary dispositions

- eligible_occurrence_present: 131
- reviewed_non_projectable_occurrence_excluded: 1
- reviewed_non_projectable_required_roles_unproven: 1143
- reviewed_non_projectable_terminal_source_absence: 87

## Reproduction

```bash
bun data/relationship-integrity/dispositions/v1/operational-events/generate.ts --check --occurrences=data/exports/releases/v1-rc20/operational_occurrences.jsonl
```
