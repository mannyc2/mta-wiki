# Tracker rc19 reject reconciliation

Status: **non-authorizing operator handoff**. This report reconciles every rejected candidate identity one-for-one; it does not approve a candidate, authorize a study, or weaken a gate.

## Outcome

- Rejected candidate identities reconciled: **473**
- Candidate identities with authoritative route/treatment/segment scope and completion-phase date repaired: **2**
- Candidate identities fully unblocked or made authorizing by MTA Wiki changes: **0**
- Candidate identities that remain non-authorizing: **473**
- Anticipated Tracker recommendation change without new exact treated-lane spines, a phase-aware consumer decision, a pinned replay, and human approval: **0**. This is an inference until a pinned Tracker replay verifies it.

The MTA Wiki changes add authoritative scope context and confirm an exact completion-phase date. They do not prove the first operational onset, create an independent outcome estimate, or turn a route-level outcome spine into an exact treated-lane-overlap spine. No standard occurrence is emitted because that contract cannot preserve completion-phase versus first-operation semantics.

Release boundary: rc19 remains immutable and unpromoted. This reconciliation does not mutate `LATEST`; the expected observed value remains `v1-rc5`. No release is promoted, deployed, pushed, or published by this workflow.

## Verified rc19 partition

| Partition | Count |
| --- | ---: |
| Mechanical: spine only | 219 |
| Mechanical: spine plus calendar | 152 |
| Mechanical: calendar only | 63 |
| Deep-review rejects | 39 |
| **Total** | **473** |

## Changed candidate identities

| Candidate ID | rc19 identity | Repaired scope and phase | Remaining blocker |
| --- | --- | --- | --- |
| study-event-v2:06559cef3f03e1672b7dd685 | BX28\|bus_lane\|2023-10-31\|day | BX28\|bus_lane\|East Gun Hill Road\|Bainbridge Avenue to Bartow Avenue; completion phase 2023-10-31 | Phase-preserving producer projection contract, exact treated-lane outcome spine, pinned replay, and human approval |
| study-event-v2:8759b24539a59fc715b1dff3 | BX38\|bus_lane\|2023-10-31\|day | BX38\|bus_lane\|East Gun Hill Road\|Bainbridge Avenue to Bartow Avenue; completion phase 2023-10-31 | Phase-preserving producer projection contract, exact treated-lane outcome spine, pinned replay, and human approval |

No occurrence identity or candidate implementation date was changed. The MTA report proves that the 3.1 miles were completed on October 31, 2023; the first operational onset remains unknown. The separate DOT page is retained as a publication/status-as-of event, not used alone as onset proof.

## Exclusive primary disposition after MTA actions

These counts are mutually exclusive and sum to the rejected-candidate total.

| Primary disposition | Count |
| --- | ---: |
| mta_evidence_acquisition_gap | 0 |
| mta_route_or_treatment_scope_binding_gap | 321 |
| mta_date_phase_occurrence_identity_gap | 2 |
| producer_contract_or_projection_gap | 0 |
| tracker_exact_lane_overlap_spine_gap | 2 |
| tracker_route_pattern_grouping_gap | 112 |
| outcome_window_time_bound_gap | 8 |
| overlap_confounder_causal_design_rejection | 8 |
| intentionally_invalid_or_duplicate_phase | 20 |
| human_authority_required | 0 |
| **Total** | **473** |

## Non-exclusive reason counts

A candidate may have several gate reasons, so these columns do not sum to 473.

| Reason | At rc19 | After MTA actions |
| --- | ---: | ---: |
| mta_evidence_acquisition_gap | 323 | 321 |
| mta_route_or_treatment_scope_binding_gap | 323 | 321 |
| mta_date_phase_occurrence_identity_gap | 28 | 28 |
| producer_contract_or_projection_gap | 323 | 323 |
| tracker_exact_lane_overlap_spine_gap | 325 | 325 |
| tracker_route_pattern_grouping_gap | 371 | 371 |
| outcome_window_time_bound_gap | 215 | 215 |
| overlap_confounder_causal_design_rejection | 46 | 46 |
| intentionally_invalid_or_duplicate_phase | 20 | 20 |
| human_authority_required | 473 | 473 |

## Pinned inputs

- Tracker audit commit: `12c9a53b69186baa3a125bc9d0b251a40e5e821f`
- Candidate set: `candidate-set-v2:24080902f508b55a0033df32`
- Candidate artifact SHA-256: `42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba`
- Reconciliation SHA-256: `8b5f77c9391970223aaa1fee8c3833a2d00c90e1755b80267c76ffbfb95c522c`
- Audit SHA-256: `7b0241a4a9e9de27eb3dcf1b71ead532718e9f05be357af91212351120d6fe00`
- Hard-gate SHA-256: `dec178065b02bbd61bd63a3be2b61a1fe8b7ea33266afcaf161bf93606f7b86c`
- Deep-review SHA-256: `cb7e2f7f74191a798ca075245f9a66996aa643ee71e615b0cfba8e1809629691`
- rc19 manifest SHA-256: `c5d4563d37815d330b37898774a027fb07563335163fcfccbaeebfc3da81720f`
- rc19 generator commit: `35984e9d75ee00849ee5a580a45064976122e4bb`
- rc19 occurrence artifact SHA-256: `424ee1ceed24bc8c8af77d49e328c0f6bb7859e88a619bbb79a0c13ac7ed5399`

## Reproduction commands

### later_release_replay_operator_step

```sh
After an immutable next release exists, an operator may run Tracker read-only against that explicitly pinned manifest and a temporary output root; do not use LATEST and do not modify Tracker receipts, studies, databases, approvals, or publication state.
```

### regenerate_ledger

```sh
bun scripts/reconcile-tracker-rc19-rejects.ts --candidate-set '/home/cjpher/.codex/worktrees/61db/bus-reliability-tracker/docs/research/artifacts/candidate-set-v2-24080902f508b55a0033df32.study-events.json' --reconciliation '/home/cjpher/.codex/worktrees/61db/bus-reliability-tracker/docs/research/reviews/rc19/corrected/rc19-review-reconciliation.json' --audit '/home/cjpher/.codex/worktrees/61db/bus-reliability-tracker/docs/research/artifacts/mta-wiki-rc19-study-candidate-audit.json' --hard-gate '/home/cjpher/.codex/worktrees/61db/bus-reliability-tracker/docs/research/reviews/rc19/corrected/hard-gate-triage.json' --deep-review '/home/cjpher/.codex/worktrees/61db/bus-reliability-tracker/docs/research/reviews/rc19/corrected/deep-review-input.json' --rc19-manifest '/home/cjpher/.codex/worktrees/7eaf/mta-wiki/data/exports/releases/v1-rc19/manifest.json' --output-dir '<new-empty-output-dir>'
```

### verify_input_hashes

```sh
printf '%s
' '42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba  /home/cjpher/.codex/worktrees/61db/bus-reliability-tracker/docs/research/artifacts/candidate-set-v2-24080902f508b55a0033df32.study-events.json
8b5f77c9391970223aaa1fee8c3833a2d00c90e1755b80267c76ffbfb95c522c  /home/cjpher/.codex/worktrees/61db/bus-reliability-tracker/docs/research/reviews/rc19/corrected/rc19-review-reconciliation.json
7b0241a4a9e9de27eb3dcf1b71ead532718e9f05be357af91212351120d6fe00  /home/cjpher/.codex/worktrees/61db/bus-reliability-tracker/docs/research/artifacts/mta-wiki-rc19-study-candidate-audit.json
dec178065b02bbd61bd63a3be2b61a1fe8b7ea33266afcaf161bf93606f7b86c  /home/cjpher/.codex/worktrees/61db/bus-reliability-tracker/docs/research/reviews/rc19/corrected/hard-gate-triage.json
cb7e2f7f74191a798ca075245f9a66996aa643ee71e615b0cfba8e1809629691  /home/cjpher/.codex/worktrees/61db/bus-reliability-tracker/docs/research/reviews/rc19/corrected/deep-review-input.json
c5d4563d37815d330b37898774a027fb07563335163fcfccbaeebfc3da81720f  /home/cjpher/.codex/worktrees/7eaf/mta-wiki/data/exports/releases/v1-rc19/manifest.json' | sha256sum -c -
```

### verify_release_selection

```sh
test "$(cat '/home/cjpher/.codex/worktrees/7eaf/mta-wiki/data/exports/releases/LATEST')" = "v1-rc5" && test "$(git -C '/home/cjpher/.codex/worktrees/7eaf/mta-wiki' rev-parse 35984e9d75ee00849ee5a580a45064976122e4bb^{commit})" = "35984e9d75ee00849ee5a580a45064976122e4bb"
```

### verify_tracker_commit

```sh
test "$(git -C '/home/cjpher/.codex/worktrees/61db/bus-reliability-tracker' rev-parse HEAD)" = "12c9a53b69186baa3a125bc9d0b251a40e5e821f"
```
