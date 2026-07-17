# Bronx supported-linkage remediation

Run: `2026-07-15T22-00-00-000Z_bronx-acquisition-linkage-remediation`

The acquisition evidence was rechecked at exact route-variant precision before canonical submission. The official Pelham Parkway release names BX12 Select Bus Service (BX12+), so the distinct BX12 local registry row was removed from the supported set and retained as completed-search route-linkage-unresolved.

## Exact outcome

- Frozen supports before precision correction: 14
- Exact supports after correction: 13
- Exact generic linkages implemented or verified: 13
- Route–corridor links added: 7
- Route–corridor links verified existing: 6
- Canonical submissions: 53 (37 relations)
- Operational occurrences, candidate phases, candidate onsets, or registry segment bindings added: 0

## Candidate actions

| Candidate | Route | Corridor group | Route–corridor action |
|---|---|---|---|
| `study-event-v2:2dd76c9b799ab1165b237330` | BX2 | East 149th Street | verified_existing |
| `study-event-v2:3134629ede9faeff4c6f54b5` | BX35 | CB5 Washington Bridge | added |
| `study-event-v2:37447319d0697677f54ec0db` | BX13 | CB5 Washington Bridge | verified_existing |
| `study-event-v2:3a7457be7847b8857c79fc68` | BX4 | East 149th Street | added |
| `study-event-v2:3f2f3824ccf3987f4fac2f73` | BX11 | CB5 Washington Bridge | verified_existing |
| `study-event-v2:452901b4951f8fd3f5105e3e` | BX12+ | Pelham Parkway | added |
| `study-event-v2:531b37f7c6e156178c51707a` | BX3 | CB5 University Avenue | verified_existing |
| `study-event-v2:62d9b1d8b5d7ede06fa8ba6a` | BX29 | Pelham Bay | added |
| `study-event-v2:74303954f2450436e58eadaf` | BX17 | East 149th Street | added |
| `study-event-v2:90af3c526dedca40f0e7fb28` | BX7 | West 178th Street | added |
| `study-event-v2:aa65fa96dffcaf26e7f07c85` | BX24 | Pelham Bay | verified_existing |
| `study-event-v2:b8621d718aca1a1bf4d5b0d6` | BX23 | Pelham Bay | added |
| `study-event-v2:c725655aeb19bb344c1ce990` | BX36 | CB5 University Avenue | verified_existing |

The rejected BX12-local row remains non-projectable. All 13 linked rows also remain non-projectable because exact historical segment, stable phase, candidate onset, and canonical occurrence identity are still unsupported.

## Reproduction

```bash
bun data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquire.ts --check
bun scripts/remediate-bronx-acquisition-linkages.ts
bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquire.test.ts packages/pipeline/test/records/bronx-acquisition-linkage-remediation.test.ts
```
