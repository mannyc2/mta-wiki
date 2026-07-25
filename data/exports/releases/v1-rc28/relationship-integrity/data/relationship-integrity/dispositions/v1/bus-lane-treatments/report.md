# Bus-lane treatment physical-scope dispositions v1

Contract: `bus-lane-treatment-physical-scope-v1`  
Reviewed: 2026-07-15T20:00:00.000Z by `codex-corpus-physical-scope-audit`

## Inventory and outcome

- Canonical bus-lane-family treatments: **669**
- Reviewed accepted pending additions: **0**
- Exclusive decisions: **669**
- Physical scope satisfied before coordinated materialization: **51**
- Additional treatments satisfied by reviewed pending journals: **0**
- Evidence-backed scope relations submitted by this campaign: **112**
- Prior exact evidence sets retained: **91**
- Location-only evidence sets repaired by reviewed adjacent co-citation: **21**
- Bus-stop-only treatment reclassified and omitted: **1**
- Projected physical-scope-satisfied treatments: **163**
- Non-satisfied, explicitly study-ineligible decisions: **506**

### Exclusive disposition counts

- `aggregate_or_unbounded_treatment`: **110**
- `non_lane_supporting_feature`: **17**
- `non_physical_enforcement_or_control`: **42**
- `physical_scope_satisfied`: **163**
- `reviewed_non_projectable_physical_scope_unproven`: **337**

## Evidence and inference boundary

Each decision retains the canonical treatment evidence references. New physical-scope links require a shared authoritative source, hash-matching exact facility evidence, a same-page physical-lane assertion, an unambiguous treatment-facility identity, and one matching corridor. The versioned evidence-review ledger records the 91 already-exact rows, 21 reviewed co-citation repairs, and one non-lane reclassification. No route relationship, occurrence, phase, onset, or date claim is added. Street-name similarity, geometry, and proximity never create route bindings.

All non-satisfied decisions are `study_eligible=false`. A satisfied physical-scope decision only clears this one role; it does not make a treatment or occurrence study-eligible.

## Coordinated materialization boundary

The accepted remediation journal is intentionally unmaterialized in this lane. After the root campaign performs its one coordinated materialization, rerun the generator in apply mode to refresh the canonical-before counts and input hashes, then run check mode.

## Reproduce

```bash
bun scripts/audit-bus-lane-treatment-scope-v1.ts --apply
bun scripts/audit-bus-lane-treatment-scope-v1.ts --check
bun test packages/pipeline/test/records/bus-lane-treatment-scope-dispositions.test.ts
```
