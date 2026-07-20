# Eligible occurrence treatment physicality review

- Release snapshot: `v1-rc25` (`final_post_semantic_release`).
- Eligible operational occurrences: 130.
- Unique reviewed treatment records: 269.
- Treatment memberships: 269.
- Classification counts: {"physical_corridor_or_segment_intervention":1,"nonphysical_service_operations_policy_control":268,"point_or_stop_physical_intervention":0,"review_required":0}.
- Occurrence scope dispositions: {"physical_scope_satisfied":1,"physical_scope_missing":0,"physical_scope_relation_missing":0,"physical_scope_evidence_missing":0,"physical_scope_relation_invalid":0,"physicality_review_required":0,"physical_scope_not_applicable":129}.
- Immutable review ledger complete: true.
- Physical-scope role complete: true.
- Final post-semantic release guard ready: true.
- Hard-mode ready: true.

## Exact family inventory

- `automated_bus_lane_enforcement`: {"unique_treatment_count":5,"occurrence_membership_count":5,"classifications":{"nonphysical_service_operations_policy_control":5}}.
- `bus_lane`: {"unique_treatment_count":1,"occurrence_membership_count":1,"classifications":{"physical_corridor_or_segment_intervention":1}}.
- `bus_stop_or_boarding`: {"unique_treatment_count":113,"occurrence_membership_count":113,"classifications":{"nonphysical_service_operations_policy_control":113}}.
- `fare_collection`: {"unique_treatment_count":4,"occurrence_membership_count":4,"classifications":{"nonphysical_service_operations_policy_control":4}}.
- `route_redesign`: {"unique_treatment_count":1,"occurrence_membership_count":1,"classifications":{"nonphysical_service_operations_policy_control":1}}.
- `service_pattern`: {"unique_treatment_count":145,"occurrence_membership_count":145,"classifications":{"nonphysical_service_operations_policy_control":145}}.

## Findings

- None.

## Interpretation

The policy reviews exact treatment family/kind pairs and exact treatment evidence. It does not infer
physicality from a family name, location literal, proximity, or street-name similarity. A
nonphysical decision only makes the physical-scope role not applicable; it is not a waiver and does
not independently make an occurrence study-eligible.

The provisional rc20 snapshot is not an enforcement migration. Final verification must run against
the post-semantic immutable release and its matching completeness bundle. The final run refuses any
change to treatment identity, exact evidence, classification, or eligible occurrence membership
without an explicit reviewed ledger migration.
