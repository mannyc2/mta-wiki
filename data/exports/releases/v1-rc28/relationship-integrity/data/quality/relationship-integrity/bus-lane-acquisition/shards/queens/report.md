# Queens registry-only bus-lane acquisition shard

- Pinned candidate set: `candidate-set-v2:24080902f508b55a0033df32` (`42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`)
- Deterministic partition: **113** candidates (**83 Q**, **30 QM**)
- Researched: **113**
- Official source acquired for every candidate: **113**
- Exact route-treatment binding proved: **5**
- Exact DOT segment binding proved: **0**
- Date and explicit phase both proved: **0**
- Operational occurrence added or updated: **0**
- Candidates with evidence-backed canonical linkage remediation: **5**
- Unique canonical relationships submitted: **21**
- Registry projections explicitly excluded: **113**
- Still unresolved for study projection: **113**

Every receipt records four acquisition channels: NYC DOT lane/project material, MTA route/project material, public board/committee material, and another official primary-data check. Route proximity and street-name similarity are never treated as authoritative. Even where an official project or lane row names the route, no Queens row is projected because the search did not establish a stable canonical phase identity and operational occurrence.

## Reproduce

```bash
bun data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/acquire.ts --verify-partition --tracker-root /home/cjpher/.codex/worktrees/61db/bus-reliability-tracker
bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/acquire.test.ts
```
