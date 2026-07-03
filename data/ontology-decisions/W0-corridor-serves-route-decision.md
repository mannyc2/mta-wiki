# W0 ontology decision — corridor → route `serves_route` endpoint shape

Status: **APPLIED 2026-06-10 (Option A, legalize) — owner authorized proceeding.** The re-orient
(Option B) remains the documented cleaner refinement for a between-wave ontology batch if preferred.
`serves_route.subject` is now `["project","corridor"]` in `relations.ts`; `validate` dropped 13→3.
Date: 2026-06-10. Context: Step 3 / S3.6b (`docs/step-3-implementation-plan.md` §2.8, §6).

Per §6 this decision must NOT be made quietly — it changes the validator's relation-shape contract
for the entire 10× campaign, so it is recorded here for explicit sign-off before the freeze.

## The issue (10 of the 13 `validate` issues)

`validate` flags 10 `unexpected_relation_endpoint_shape`: relation kind `serves_route` expects
`project -> route` but got `corridor -> route`. All 10 are **`provenance=authored`** edges from a
single corridor record:

- subject: `corridor_116th-street` — "116th Street Study Area, Manhattan"
- objects: `route_bxm1, route_bxm6, route_bxm7, route_bxm8, route_bxm9, route_bxm11, route_m3,
  route_m7, route_m102, route_m116`

This is **real authored data** (a 116th St study area scoping the bus routes within it), not a
pipeline bug. The question is purely which relation kind/shape expresses it.

## Analysis

The ontology already models the corridor↔route relationship — as **route → corridor**, not
corridor → route (`packages/harness/src/mta/relations.ts`):

- `operates_on_corridor`: subject `route`, object `corridor`
- `serves_corridor`: subject `route`, object `corridor`

`serves_route` (subject `project`, object `route`) means *a project does scope/work serving a
route*. A corridor "serving" routes is a different relationship — geographic containment — and the
modelers already chose **route → corridor** as its orientation. So these 10 edges are
**mis-oriented**, not evidence of a missing `serves_route` subject type.

## Options

- **(A) Legalize** — add `corridor` to `serves_route.subject` (`["project","corridor"]`). One-line,
  fully reversible, deterministic (no data change; `validate` stops flagging the 10). **Downside:**
  muddies `serves_route` — "what serves route M3?" would then mix projects (improvements) with
  corridors (geography), degrading the flagship project↔route queries at scale.
- **(B) Re-kind + re-orient (RECOMMENDED)** — rewrite the 10 edges as
  `route --operates_on_corridor--> corridor` (swap endpoints, change kind). Uses an **existing**
  kind with the correct shape; no contract widening; keeps `serves_route` clean. **Cost:** a
  deterministic re-orientation of 10 authored edges, applied through the ontology-normalize /
  canonicalize-apply channel (mechanical mapping: `corridor --serves_route--> route` ⇒
  `route --operates_on_corridor--> corridor`), then re-materialize.

## Recommendation

**Option B** (re-orient to `operates_on_corridor`). It matches the ontology's existing choice of
route→corridor orientation and protects the project↔route query surface that the campaign validates.
Option A is the acceptable fallback if re-orienting authored edges is judged too invasive for W0.

## Scope note

This resolves only the **10** endpoint-shape issues. The remaining **3** `duplicate_global_identity`
issues (`route_m34` local/SBS, `route_m60` variants, the tri-state-campaign entity pair) are a
separate fix that the plan routes through **canonicalize → cross-model review → apply** (DeepSeek
model spend) — see the S3.6b note in LOG.md. `validate → 0` requires both this decision applied AND
that canonicalize loop run. Both land before the S3.6c freeze; neither has been applied yet.
