# Relationship completeness audit

Schema version: 1. Mode: **warning**. Release: **v1-rc24**.

This report uses the immutable occurrence-treatment physicality policy and exact per-treatment review ledger. Family names and location literals are not physicality evidence, and a nonphysical decision is neither a waiver nor a source of study eligibility. No generic all-record non-projectable coverage is claimed: project, corridor, entity, claim, metric, and source classes remain outside the reviewed route/event/treatment full-denominator selectors.

## Eligible operational occurrences

- Release rows: 131; eligible: 130.
- Core identity/route/treatment/onset role failures: 0 occurrence(s).
- All enforcement-candidate contract-role failures: 0 occurrence(s).
- Phase/schema migration warnings: 0 occurrence(s).
- Physical scope required: 1; not applicable: 129; physicality review required: 0.
- Eligible event identities inside the implementation/launch denominator: 130; outside: 0.

## Eligible-occurrence treatment physicality denominator

- Exact treatment records: 269; occurrence memberships: 269; policy rules: 26.
- Classifications: {"nonphysical_service_operations_policy_control":268,"physical_corridor_or_segment_intervention":1,"point_or_stop_physical_intervention":0,"review_required":0}.
- Scope requirements: {"corridor_or_segment_required":1,"not_applicable":268,"point_or_stop_required":0,"review_required":0}.
- Treatment review warnings: 0.
- Immutable ledger complete: true; physical scope complete: true; final release guard: verified.

## Full bus-lane treatment physical-scope denominator

- Immutable inventory rows: 669; audited selector rows: 669; omitted: 0.
- Canonically materialized treatments: 669; accepted pending addition: 0.
- Canonical physical scope satisfied: 163; evidence-bound reviewed non-projectable dispositions: 506.
- Exact evidence bound: 669; warning rows: 0; review complete: true.

## Full operational-event denominator

- Operational-family events: 1365.
- Primary dispositions: eligible occurrence present 130; legacy terminal gaps only 0; open review 0; versioned non-projectable 1235.
- Gap rows: 2929; events with an unreviewed gap: 1142.
- Eligible occurrence/coverage conflicts: 0.

## Canonical route-identity denominator

- Canonical routes: 395; audited exactly once: 395.
- GTFS-backed route records: 299; reviewed typed non-projectable 96.
- Route identity accounting warnings: 0; evidence warnings: 0.

## Warning codes

| Code | Selector class | Instances |
|---|---:|---:|
| `RC_OCCURRENCE_IDENTITY_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_IDENTITY_AMBIGUOUS` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_REALIZED_IDENTITY_INVALID` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_REALIZED_EVENT_IDENTITY_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_ROUTE_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_GTFS_ROUTE_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_ROUTE_IDENTITY_EVIDENCE_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_ROUTE_SCOPE_EVIDENCE_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_TREATMENT_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_TREATMENT_DEFINITION_EVIDENCE_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_TREATMENT_SCOPE_EVIDENCE_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_TREATMENT_BUNDLE_IDENTITY_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_TREATMENT_BUNDLE_EVIDENCE_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_ONSET_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_ONSET_PRECISION_INVALID` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_EVENT_DATE_EVIDENCE_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_TIMELINE_EVIDENCE_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_PHASE_IDENTITY_MISSING` | schema_migration | 0 |
| `RC_OCCURRENCE_PHASE_RELATION_MISSING` | schema_migration | 0 |
| `RC_OCCURRENCE_PHYSICALITY_REVIEW_REQUIRED` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_PHYSICAL_SCOPE_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_PHYSICAL_SCOPE_EVIDENCE_MISSING` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_PHYSICAL_SCOPE_RELATION_INVALID` | enforcement_candidate | 0 |
| `RC_OCCURRENCE_POINT_SCOPE_CONTRACT_REQUIRED` | enforcement_candidate | 0 |
| `RC_TREATMENT_PHYSICALITY_REVIEW_REQUIRED` | enforcement_candidate | 0 |
| `RC_BUS_LANE_TREATMENT_SELECTOR_ACCOUNTING_REQUIRED` | enforcement_candidate | 0 |
| `RC_BUS_LANE_TREATMENT_SCOPE_OR_DISPOSITION_REQUIRED` | enforcement_candidate | 0 |
| `RC_BUS_LANE_TREATMENT_EVIDENCE_MISSING` | enforcement_candidate | 0 |
| `RC_OPERATIONAL_EVENT_REVIEW_OR_DISPOSITION_REQUIRED` | schema_migration | 0 |
| `RC_OPERATIONAL_EVENT_VERSIONED_DISPOSITION_REQUIRED` | schema_migration | 0 |
| `RC_OPERATIONAL_EVENT_OCCURRENCE_COVERAGE_CONFLICT` | schema_migration | 0 |
| `RC_ROUTE_IDENTITY_ACCOUNTING_REQUIRED` | enforcement_candidate | 0 |
| `RC_ROUTE_IDENTITY_EVIDENCE_MISSING` | enforcement_candidate | 0 |

## Enforcement migration

- Core eligible occurrence roles ready: true.
- Phase contract ready: true.
- Physical-scope contract ready: true.
- Treatment physicality contract ready: true.
- Treatment physicality final-release guard ready: true.
- Full bus-lane treatment completeness ready: true.
- Full operational-event completeness ready: true.
- Canonical route-identity completeness ready: true.
- Hard mode ready: true.

Reproduce from the repository root:

```bash
bun -e 'import { writeRelationshipCompletenessArtifacts as write } from "./packages/pipeline/src/quality/relationship-completeness.ts"; write()'
```
