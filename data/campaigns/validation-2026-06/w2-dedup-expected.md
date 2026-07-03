# W2 cross-source dedup — expected answers (written BEFORE the identity-review LLM run)

Date: 2026-06-10. Purpose: score the first live `identity-review-run` (pioneer-deepseek-pro) against
pre-committed answers derived from `docs/identity-merge-canon.md` + the handoff doc's cluster
analysis. The 15 `duplicate_global_identity` validate errors form 6 clusters.

Scoring: a cluster PASSES if the suggestion's merge_groups/do_not_merge are compatible with the
expectation below (ambiguous is acceptable where noted). Any wrong-direction merge (merging a
must-not-merge pair) is a hard FAIL for the whole run.

## 1. entity — Hudson Yards (key `entity_hudson-yards-development-corporation`)
- `entity_hudson-yards-dev-corp-2012` + `entity_hudson-yards-development-corp` → **MERGE**
  (same corporation; abbreviation + date-suffix delta only).

## 2. entity — MTA (key `entity_mta`)
- `entity_mta-2012` + `entity_mta-entity-update-2025` → **MERGE** (lifecycle/update record of the
  MTA authority itself). `ambiguous` acceptable if evidence doesn't pin what the 2025 update record
  describes.
- `entity_mta-2012` (or its merge target) vs `entity_mta-nyct` → **DO_NOT_MERGE**
  (authority vs subsidiary — the canon's hard rule). Merging these is a hard FAIL.

## 3. project — First/Second Ave SBS (key `project_first-ave-second-ave-sbs`)
- `project_first-second-ave-sbs` + `-2010` + `-cac3` + `-cb8-2010` → **MERGE all 4**
  (same SBS project documented across CB/CAC meeting docs).

## 4. project — Nostrand/Rogers SBS (key `project_nostrand-ave-rogers-ave-sbs`)
- `project_nostrand-rogers-sbs` + `-cac-2010` + `-cb3` + `-cb9-2010` → **MERGE all 4**.

## 5. route — M15 base key (key `route_m15`)
Records: `route_m15-cb8-2010`, `route_m15-limited-2010-06-09`, `route_m15-limited-2010-09-14`,
`route_m15-local-limited`, `route_m15-sbs`.
- `route_m15-limited-2010-06-09` + `route_m15-limited-2010-09-14` → **MERGE** (same variant,
  date suffix only).
- `route_m15-sbs` vs any limited/local record → **DO_NOT_MERGE** (variant rule). Merging SBS with
  another variant is a hard FAIL.
- `route_m15-cb8-2010` (variant-unspecified) and `route_m15-local-limited` (bundled variants) →
  **AMBIGUOUS acceptable**; do_not_merge-with-reason also acceptable; folding either into a single
  variant without evidence is a FAIL.

## 6. route — M15 local (key `route_m15-local`)
- `route_m15-local-2010-06-09-v2` + `route_m15-local-2010-09-14` + `route_m15-local-20100607` →
  **MERGE all 3** (same variant, date/version suffixes only).

## Result (filled in after the run)
- Run: `2026-06-10T21-39-01-072Z_identity-review-run`, pioneer-deepseek-pro, 5/5 completed.
- **Score: 5/5 clusters PASS, zero hard fails.** All expected merges and do-not-merges matched.
- Cluster 5 deviation (better than expected): `route_m15-cb8-2010` was merged into the local group
  rather than left ambiguous — verified correct, its payload carries `service_variant: "local"`.
- Cluster 5 ambiguous pairs (`route_m15-local-limited` vs the two limited records) resolved by human
  review as do_not_merge: the record is a 6-source generic-mention agglomerate mixing variants
  (future split candidate). Decision: `route_cluster_001-w2-2026-06-10-ambiguous-resolution.json`.
- Applied via `identity-review-apply` (12 aliases, 21 do-not-merge pairs). Exposed + fixed a
  materializer gap: canonicalize-authored relation endpoints weren't remapped through merge aliases
  (33 transient `missing_relation_target` errors). After the fix: **validate 15 → 0**, export
  verify clean, determinism anchor reproduced, tests 365/366 (known treatment ceiling only).
