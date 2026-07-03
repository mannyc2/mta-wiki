# Accepted Identity Review Artifacts

This directory contains reviewer-owned staging artifacts derived from LLM identity-review suggestions. These files do not mutate canonical records by themselves. Promote them into deterministic override/config files only after a separate implementation pass.

- `manifest.json`: summary of accepted, corrected, and quarantined clusters.
- `decisions/`: accepted or corrected cluster decisions that are ready for override implementation review.
- `quarantine/`: clusters that must not be promoted until their blocker is resolved.

Validated format:

- `manifest.json` uses `version: 1`, `counts`, `accepted[]`, and `quarantined[]`. Every accepted/corrected
  file and every quarantine file must be listed exactly once.
- `decisions/*.json` must use `review_state: "accepted"` or `"corrected"` and include `version`,
  `accepted_at`, `reviewer`, `source`, `cluster_id`, `kind`, `packet_path`, `suggestion_path`,
  `action_summary`, `merge_groups`, `do_not_merge`, `weak_aliases`, `missing_fields`, `ambiguous`,
  `suggested_rules`, and `rationale`.
- `quarantine/*.json` must use `review_state: "quarantined"` and include a `quarantine.blocker`.
  Quarantine files preserve `original_merge_groups` and `original_do_not_merge`, but those actions are not
  promotable.
- Record ids inside merge and do-not-merge actions must match the decision `kind`, merge groups must contain
  at least two distinct records, do-not-merge actions must contain exactly two records, and a pair cannot appear
  in both `merge_groups` and `do_not_merge`.
- `action_summary` counts must match the parsed action arrays.

Run checks and dry-run promotion planning with:

```bash
bun run validate
bun packages/cli/src/cli.ts identity-review-apply --dry-run
```

Generated from `data/identity-review/llm-suggestions/audit-2026-06-08.md` at 2026-06-08T21:21:36.731Z.
