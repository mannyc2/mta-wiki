# Bronx registry-only bus-lane acquisition shard

- Pinned candidate set: candidate-set-v2:24080902f508b55a0033df32 (42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba)
- Deterministic partition: **52** candidates (**41 BX local/SBS**, **11 BxM express**)
- Corridor/date research groups: **19**
- Researched through four official acquisition channels: **52**
- All four channels acquired for candidate: **52**
- Acquired and hashed official source responses: **75** (**23 shared**, **52 route-specific**)
- Exact route-treatment binding proved: **13**
- Route-family match rejected at exact variant precision: **1** (BX12 local is not BX12+)
- Exact historical segment binding proved: **0**
- Date and explicit phase both proved: **0**
- Operational occurrence added or updated: **0**
- Registry projections explicitly excluded: **52**
- Still unresolved for study projection: **52**

Each receipt covers NYC DOT lane/project material, an official MTA route/project check, public board/committee material, and another official primary-data check. The supported route-treatment findings are enumerated in supported-linkage-candidates.jsonl for a disjoint remediation owner. The prior BX12-local support result was corrected because the Pelham Parkway source explicitly names BX12 Select Bus Service (BX12+), a distinct route variant. Supported rows do not authorize an operational occurrence: the pinned candidates omit exact historical segment ids, and no acquired source resolves a stable candidate-specific phase and onset identity. Proximity, geometry, live route pages, route-family normalization, and street-name similarity never establish linkage.

## Reproduce

    bun data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquire.ts --verify-partition --tracker-root /home/cjpher/.codex/worktrees/61db/bus-reliability-tracker
    bun data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquire.ts --check
    bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquire.test.ts
