# Plan 040 Package 10 validation schedule source

This acquisition-only prerequisite stages
`mta_bus_schedules_2025_plan040_p10_validation_2026_07_24` from the
authoritative local MTA/NY Open Data June 2025 partition. It does not authorize
an occurrence, study, cross-product, member-extent decision, or grain decision.

The extraction keeps every source row for these exact slices:

| Schedule date | Route | Rows | Passenger shapes under the downstream `trip_type not in (2,3,4)` diagnostic |
|---|---:|---:|---|
| 2025-06-27 | Q20A | 1,032 | Q20A0071, Q20A0087 |
| 2025-06-27 | Q20B | 845 | Q20B0057, Q20B0068 |
| 2025-06-29 | Q14 | 844 | Q140008, Q140009 |
| 2025-06-29 | Q90 | 358 | Q901243, Q901247, Q901249 |
| 2025-06-29 | Q98 | 648 | Q980041, Q980045 |

Total data rows are `3,727`; extraction has no `trip_type` predicate and excludes
zero rows. The durable receipt pins every trip-type and shape/trip-type count so
later candidate-specific classification can remain fail closed.

Pinned provenance:

- partition SHA-256:
  `03f9b289512658133225bbda03aad00ceb5a405aa4ae24a50a39dd11b8a8df55`
- partition manifest SHA-256:
  `23df32e0d6b7d744cf3076f8a1535ca06bfc4d724000465b779607bbe403adb0`
- source metadata SHA-256:
  `14fb6e55305fe15aa9a79301ebdcbf44097cb8958c5716514b22952856b12cba`
- dataset metadata SHA-256:
  `4546d6e11a7014cfe0463fb1f18f31a4927a73bccf2e09b127d5b0d22af6c7cc`
- staged `source.csv` SHA-256:
  `af9e368d93c8fe879e1cd42145ff116a815a6e9464436bb1244fa350c9ffb1fa`
- staged `blocks.jsonl` SHA-256:
  `bbaa8fc50ce2598e7e00b97dd7ecdb8c4400ecf3d43168cfd09fc3fe95cbdbde`
- durable receipt SHA-256:
  `f40140d24c7edeef113a793982b376f603957f6922d9b94137f3679acf12f0e0`

Reproduce and verify without network access:

```bash
bun scripts/acquire-plan040-qbnr-package10-validation-schedules.ts
bun scripts/acquire-plan040-qbnr-package10-validation-schedules.ts --check
```

Both commands require `/home/cjpher/.local/bin/duckdb` at
`v1.5.2 (Variegata) 8a5851971f` and refuse to overwrite any staged artifact
whose bytes differ.
