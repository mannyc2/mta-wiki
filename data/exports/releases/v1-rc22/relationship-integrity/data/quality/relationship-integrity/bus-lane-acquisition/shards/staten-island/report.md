# Staten Island registry-only bus-lane acquisition shard

- Pinned candidate set: candidate-set-v2:24080902f508b55a0033df32 (42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba)
- Deterministic partition: **54** candidates (**27 S local/SBS**, **27 SIM express**)
- Corridor/date research groups: **10**
- Researched through four official acquisition channels: **54**
- All four channels acquired for candidate: **54**
- Acquired and hashed official source responses: **75** (**21 shared**, **54 route-specific**)
- Exact route-treatment binding proved: **22**
- Exact historical segment binding proved: **0**
- Date and explicit phase both proved: **0**
- Operational occurrence added or updated: **0**
- Registry projections explicitly excluded: **54**
- Still unresolved for study projection: **54**

Each receipt covers NYC DOT lane/project material, an official MTA route/project check, public board/committee material, and another official primary-data check. The supported route-treatment findings are enumerated in supported-linkage-candidates.jsonl for a disjoint remediation owner. They do not authorize an operational occurrence: the pinned candidates omit exact historical segment ids, and no acquired source resolves a stable candidate-specific phase and onset identity. Proximity, geometry, live route pages, and street-name similarity never establish linkage.

## Reproduce

    bun data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/acquire.ts --verify-partition --tracker-root /home/cjpher/.codex/worktrees/61db/bus-reliability-tracker
    bun data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/acquire.ts --check
    bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/acquire.test.ts
