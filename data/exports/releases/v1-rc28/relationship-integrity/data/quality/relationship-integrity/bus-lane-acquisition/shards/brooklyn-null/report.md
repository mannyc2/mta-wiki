# Brooklyn and borough-null registry-only bus-lane acquisition shard

- Pinned candidate set: `candidate-set-v2:24080902f508b55a0033df32` (`42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`)
- Deterministic partition: **60** candidates (**56 Brooklyn**, **4 borough-null X routes**)
- Researched: **60**
- Official source acquired: **60**
- Exact route-treatment binding proved: **8**
- Exact DOT segment binding proved: **1**
- Date and explicit phase both proved: **0**
- Operational occurrence added or updated: **0**
- Registry projections explicitly excluded: **60**
- Still unresolved for study projection: **60**

Every receipt records NYC DOT lane/project, MTA route/project, public board/committee, and other official primary-data checks. A route/corridor statement is kept separate from exact segment, day, phase, and occurrence identity. Proximity and street-name similarity are never authoritative.

## Reproduce

```bash
bun data/quality/relationship-integrity/bus-lane-acquisition/shards/brooklyn-null/acquire.ts --verify-partition --tracker-root /home/cjpher/.codex/worktrees/61db/bus-reliability-tracker
bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/brooklyn-null/acquire.test.ts
```
