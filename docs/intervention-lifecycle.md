# Resolved Intervention Lifecycle

The resolved intervention model answers a narrower question than the canonical wiki:
which stable intervention placements are supported in a particular state on an explicit date?
It never rewrites canonical source observations.

## Identities

- An **episode** is a reviewed occurrence with a resolved onset.
- An **application** is an exact route, treatment, action, extent, and evidence claim inside an
  episode.
- A **placement** is a durable real-world intervention identity. It is established and changed only
  through append-only reviewed identity operations.

An application can affect zero, one, or several placements. `add` may establish a reviewed
placement; `retain` and `resume` preserve exact identity; `remove` and `suspend` require an existing
target and never create a placement; `modify` requires reviewed continuity or explicit lineage.
`unknown` is always non-authorizing.

## Time and state

Lifecycle assertions preserve two independent clocks:

- **Valid time** describes when the asserted real-world state applies, using point, bounded, or
  explicitly open coverage and earliest/latest bounds.
- **Document time** preserves publication, retrieval, and source assertion-as-of dates.

The pure `stateAsOf(date)` resolver never reads the wall clock and never uses latest-row-wins.
Its results are `confirmed_active`, `last_confirmed_active`, `confirmed_inactive`, `planned`,
`suspended`, `conflicted`, or `unknown`. A historical start point becomes
`last_confirmed_active` after that point; silence does not turn it into current activity.
Overlapping incompatible accepted assertions or unresolved uncertain bounds remain `conflicted`
until an explicit reviewed resolution supersedes exact assertion ids.

## Operator artifacts

`data/resolved-transit/operator/v1/placements/` contains the closed examined cohort, a row for every
examined source observation, the placement-candidate frontier, reviewed registry and transitions,
and application reconciliation.

`data/resolved-transit/operator/v1/lifecycle/` contains assertions, dated state rows, confirmed-active
footprint rows, reconciliation for every non-active placement, history, and a balancing summary.
Every snapshot carries its requested `as_of_date` and input fingerprint.

The separate `data/resolved-transit.db` mirrors these products in strict indexed tables. Canonical
`lifecycle_entries`, `route_timeline`, and the deprecated `resolved_status` view remain documentary
and are forbidden inputs to new resolved builders.

## Current corpus boundary

The current 343 applications have evidence-reviewed historical actions and
extents, including explicitly accepted unknowns. Plan 054 independently
reviewed all 1,773 placement candidates and closed them as 104 distinct live
placements, 239 accepted transition ambiguities, and 1,430 documentary rows
that are not placements. The 104 accepted positive transitions are exact
reviewed additions; every other application has an explicit accepted negative
transition disposition. Application action alone never authorizes a placement.

Lifecycle truth remains a separate Plan 055 review. The explicit 2026-07-27
projection therefore contains zero accepted lifecycle assertions, 104
`unknown` placement states, 104 reconciliation rows, and zero
confirmed-current footprint rows. This is evidence preservation, not a claim
that the placements are inactive or that the real-world footprint is zero.

Build and inspect with an explicit date:

```bash
bun packages/cli/src/cli.ts materialize-intervention-placements
bun packages/cli/src/cli.ts materialize-intervention-lifecycle --date 2026-07-27
bun packages/cli/src/cli.ts intervention-state-as-of --date 2026-07-27 --json /tmp/state.json
```
