# Manhattan registry-only bus-lane acquisition shard

- Pinned candidate set: `candidate-set-v2:24080902f508b55a0033df32` (`42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`)
- Deterministic partition: **42** Manhattan M-route candidates (QM excluded)
- Researched / official source acquired: **42 / 42**
- Generic route-treatment binding proved: **6** (M101, M102, M103, M15+, M60+, M98)
- Exact candidate segment binding proved: **0**
- Date and explicit phase both proved: **0**
- Operational occurrence added or updated: **0**
- Registry projections explicitly excluded / still unresolved: **42 / 42**
- Authoritative generic linkage gaps for central intake: **4** (M101, M102, M103, M98)

Every receipt records NYC DOT lane/project, MTA route/project, public board/committee, and official primary-data checks with byte hashes. The six supported generic linkages are kept separate from exact segment, registry day, phase, and occurrence identity. Existing M15 SBS and M60 SBS canonical links are recorded; the four Third Avenue routes require normal source staging and canonical intake. No proximity or street-name match is treated as authoritative.

## Reproduce

```bash
bun data/quality/relationship-integrity/bus-lane-acquisition/shards/manhattan/acquire.ts --verify-partition --tracker-root /home/cjpher/.codex/worktrees/61db/bus-reliability-tracker
bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/manhattan/acquire.test.ts
```
