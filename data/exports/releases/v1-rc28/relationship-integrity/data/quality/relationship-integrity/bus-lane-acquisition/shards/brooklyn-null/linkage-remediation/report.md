# Brooklyn/null supported-linkage reconciliation v1

- Supported acquisition rows reviewed: **8**
- Already verified in canonical data: **7 candidates / 8 relations**
- Implemented through accepted evidence-backed submission: **1 candidate**
- Implemented or verified total: **8 / 8**

## B54 / Jay Street remediation

The gap was real: v1-rc20 anchored GTFS route `B54` as `no_wiki_coverage`, and the canonical corpus contained neither a B54 route record nor a B54-to-Jay-Street relationship. The current NYC DOT March 2, 2021 release was reacquired and staged as `jay_street_busway_camera_2021`. Its exact route/corridor block states that the Jay Street busway hosts B54. The accepted journal adds a canonical `route_b54` record and one generic `operates_on_corridor` relation to `corridor_jay-st-busway`.

The source supports the route/corridor relationship as of the report date only. This campaign does not inherit the registry candidate's August 31 day, select a physical DOT segment, create a phase, or create/update an operational occurrence. All eight registry candidates remain excluded and non-projectable.

## Exact counts

- Existing canonical relations verified: 8
- Exact authoritative linkage evidence receipts pinned: 8
- Accepted pending route records: 1
- Accepted pending relations: 1
- Registry day claims inherited: 0
- Phase records added: 0
- Operational occurrences added or updated: 0
- Study-projectable rows: 0

## Reproduce

```bash
bun data/quality/relationship-integrity/bus-lane-acquisition/shards/brooklyn-null/linkage-remediation/reconcile.ts --check
bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/brooklyn-null/linkage-remediation/reconcile.test.ts
```
