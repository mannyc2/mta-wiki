# Staten Island supported-linkage remediation

Run: `2026-07-15T21-00-00-000Z_staten-island-acquisition-linkage-remediation`

This reconciliation covers the 22 evidence-supported Staten Island acquisition rows without creating registry occurrences, candidate phases, candidate dates, or candidate segment bindings. Direct physical treatment-to-corridor relations are owned by the coordinated physical-scope journal and are referenced here rather than duplicated.

## Exact outcome

- Supported candidates: 22
- Route bindings verified in canonical-before: 10
- Route bindings added: 12
- Compact canonical route records added: 12
- Shared Madison project scope relations added: 2
- Coordinated treatment-to-corridor relations: 3
- Operational occurrences added: 0

## Candidate actions

| Candidate | Route | Corridor | Route action | Route record |
|---|---|---|---|---|
| `study-event-v2:03cf27aac5906110d05d23d8` | SIM1C | Battery Place | verified_existing | `route_sim1c-meeting-doc-138456` |
| `study-event-v2:35b924de75751e620ff5cd1b` | S78 | Hylan Boulevard | verified_existing | `route_s78-hylan-2010` |
| `study-event-v2:402e35b93b2e18dd50b8bf4d` | SIM3C | Battery Place | added | `route_sim3c` |
| `study-event-v2:56144ad13c89a760eca742f1` | SIM26 | Madison Avenue | verified_existing | `route_sim26-42nd-st` |
| `study-event-v2:56a19ae37a156ba38aefa748` | SIM8 | Madison Avenue | verified_existing | `route_sim8-42nd-st` |
| `study-event-v2:5ac3f393233f205c142914c2` | SIM7 | Hylan Boulevard | added | `route_sim7` |
| `study-event-v2:5c3f4b6828ca4b76c035fffb` | S79 | Hylan Boulevard | verified_existing | `route_able-s79-sbs` |
| `study-event-v2:69ff2b25bf71bb7f1dd41962` | SIM33C | Battery Place | added | `route_sim33c` |
| `study-event-v2:7ee4d4a1161ff7b0902bd182` | SIM4C | Battery Place | verified_existing | `route_sim4c-meeting-doc-138456` |
| `study-event-v2:88a4ef98d281f791f9e4d4c5` | SIM34 | Battery Place | added | `route_sim34` |
| `study-event-v2:94506aa18ba41d7470163cad` | SIM2 | Battery Place | added | `route_sim2` |
| `study-event-v2:955adb3a7cb228ff39810821` | SIM15 | Battery Place | added | `route_sim15` |
| `study-event-v2:b6072a8190833425317d1ddc` | SIM1 | Battery Place | added | `route_sim1` |
| `study-event-v2:b6b1da71abbf2c610a3ff0e0` | S57 | Hylan Boulevard | added | `route_s57` |
| `study-event-v2:b81faee767193778423c95fc` | SIM5 | Battery Place | added | `route_sim5` |
| `study-event-v2:c224f7cd66538358313fa2c2` | SIM30 | Madison Avenue | verified_existing | `route_sim30-42nd-st` |
| `study-event-v2:c4c39b0f3c90371b46c73fa6` | SIM25 | Madison Avenue | verified_existing | `route_sim25-42nd-st` |
| `study-event-v2:c5669d0023b64203e23f1af6` | SIM4 | Battery Place | verified_existing | `route_sim4-meeting-doc-176441` |
| `study-event-v2:c6bd93155bbffd9856470732` | SIM22 | Madison Avenue | verified_existing | `route_sim22-42nd-st` |
| `study-event-v2:c910351a6970ad67a85ba290` | SIM35 | Battery Place | added | `route_sim35` |
| `study-event-v2:c99e29584b799c943a5dda53` | SIM32 | Battery Place | added | `route_sim32` |
| `study-event-v2:fbc625c00e4811450ce3dab9` | SIM9 | Hylan Boulevard | added | `route_sim9` |

All 22 rows remain non-projectable because exact historical segment identity, stable phase identity, candidate-specific onset, and canonical operational-occurrence identity remain unsupported.

## Reproduction

```bash
bun scripts/remediate-staten-island-acquisition-linkages.ts
bun test packages/pipeline/test/records/staten-island-acquisition-linkage-remediation.test.ts
```
