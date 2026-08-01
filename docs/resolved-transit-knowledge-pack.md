# Resolved Transit Knowledge Pack

The knowledge pack is the consumer boundary for resolved intervention data.
It has two deliberately different surfaces built from the same verified
operator state.

## Operator and public resources

The operator pack contains complete audit contracts: resolved episodes and
applications, occurrence and placement lineage, evidence bindings, review
references, closed frontiers, lifecycle assertions, dated state, display
provenance, reconciliation, and fingerprints.

The public pack contains only product-ready episode, component, placement,
route, treatment-family, history, current-footprint, source, and summary
resources. Public projection reads resolved operator rows plus the frozen
operator display dictionary. It never reads canonical events or treatments
directly.

Every public file is decoded as an exact closed object. Unknown or missing
fields, malformed calendar dates, duplicate identities, broken joins, stale
route-index rows, incomplete source coverage, and summary or footprint drift
are hard failures. Consumers do not use unchecked casts or silently discard
unresolved joins. The pack's requested `as_of_date` must exactly match the
reviewed lifecycle projection, footprint, lifecycle summary, and frozen
display dictionary; choosing a different date requires a separately reviewed
projection rather than re-labeling existing state.

`intervention_id` preserves the durable occurrence identity. An
`intervention_component_key` identifies one exact route/treatment/phase
application within that episode; action and scope are mutable reviewed
details. A `placement_key` identifies a durable
installed subject independently of any single episode. Route and treatment
joins use `route_key` and `treatment_family_key`; internal record,
application, placement, review, decision, hash, queue, and path fields are
forbidden.

Each placement exposes its reviewed `founding_intervention_component_key`, or
`null` when an intentionally independent fixture or future contract has no
founding episode. Transition history must exactly cover every additive
component and every non-null founding placement; this structural equality
cannot be disabled by summary metadata.

Episode `title` is a concise date-free display label; onset belongs only in
the structured onset fields. Every component exposes treatment-family,
action, and extent labels, a plain-language applicability statement, useful
details, and zero or more caveats. Accepted unknown action or extent semantics
must produce an explicit human-readable caveat and never leak internal reason
codes or snake-case placeholders into the interface.

Keys are replayed from
`resolved-transit-public-key-registry-v1`. Establishment is append-only and
records either a reproducible lossless migration or an exact accepted display
decision. Labels may be corrected or gain aliases without changing identity.
An existing key is not re-derived from mutable action, extent, placement-scope,
or label claims. An accepted `supersede_public_key` operation may replace the
live presentation key for the same durable subject while retaining the prior
key as an alias. A genuine subject replacement uses an accepted
`redirect_public_key_subject` operation; replay retains all prior keys as
aliases, preserves operation history, and rejects cycles or duplicate
ownership.
Normal display checks and pack builds are read-only over this registry.

## History is not current footprint

Every resolved episode remains in historical resources. The route index has
one row per exact component incidence, so a multi-route episode and two
same-family components remain explicit rather than becoming a cross-product
or a deduplicated family count.

Stable placements are a separate resource. The positive current footprint
contains only placements whose accepted lifecycle state is `confirmed_active`
on the pack's explicit `as_of_date`. `last_confirmed_active`, inactive, planned,
suspended, conflicted, and unknown placements remain in state/history
resources and summary counts but never become positive current rows. A
removal or suspension action cannot create a placement or footprint row.

It is therefore normal for one route to have broad documentary evidence, a
smaller reviewed historical episode list, and a still smaller confirmed
current footprint. Consumers must not subtract these cardinalities to invent a
backlog; they have different denominators and authority.

## Sources and links

Every public fact cites a `source_key`. A source row always has a title and may
have a nullable URL:

- `source_provided` means a source-registry literal normalized losslessly to an
  absolute HTTPS URL.
- `accepted_override` means an append-only reviewed permalink decision supplied
  the URL.
- `unavailable` means no authorized public URL exists and `url` is null.

No URL status claims that a link was fetched, is live, is permanent, or is
owned by the publisher. Interfaces may render links only for the first two
states.

## Completeness

`public_network_summary.json` reports reviewed historical episodes, exact
component incidences, stable placements, confirmed-current placements/routes,
dated placement-state counts, and the closed placement-frontier pending count.
It does not hide pending candidates or convert absence of review into absence
of an intervention.

## Reference adapter and fixtures

The standalone reference adapter accepts only the public directory. It groups
episodes and exact component history by route, exposes confirmed-current
placements, and emits links only when URL status permits. It imports no
canonical reader, SQLite layer, or route/treatment special case.

`data/contract-fixtures/resolved-transit-pack-v1-hand-reviewed/` is the
independent semantic oracle. Its expected output is manually maintained,
content-addressed, and not generated by the producer under test. The old
operational-occurrence expected-candidate fixture remains only for legacy
decoder compatibility.

## Tracker conformance

`data/resolved-transit/operator/v1/tracker-conformance/` freezes the audited
read-only Tracker baseline, a content-addressed 179-row route-surface manifest,
the accepted row-level diff ledger, its summary, and the owner-acceptance
receipt. The route manifest preserves 243 literal memberships plus each route
artifact and embedded-episode hash; validation replays exact Route History to
global `/interventions` identity and content equality. The baseline has 204
unique interventions across 179 route artifacts. Reconciliation accepts 131 exact producer matches,
keeps 65 Tracker-minted rows as downstream enrichment rather than producer
identity, records eight reviewed exclusions of stale Tracker-local examples,
and adds 26 producer episodes. The producer result is therefore 157 episodes,
343 component incidences, 170 route keys, and 167 distinct GTFS routes.

Tracker retains ownership of narratives, study links, assets, eligibility,
and other downstream-only annotations. Conformance validation proves the
accepted identity and route-membership boundary without importing those
fields into the producer or mutating the Tracker checkout. A Tracker pin or
deployment is a separate publication action and must consume only a verified,
explicitly published release.

Build and verify:

```bash
bun packages/cli/src/cli.ts resolved-transit-public-keys --check --as-of 2026-07-27
bun packages/cli/src/cli.ts resolved-transit-public-display --as-of 2026-07-27 --check
bun packages/cli/src/cli.ts resolved-transit-pack --as-of 2026-07-27 --output /tmp/resolved-pack
bun packages/cli/src/cli.ts resolved-pack-reference-adapter --input /tmp/resolved-pack/public --json /tmp/reference.json
```

## Verified release envelope

Manifest v7 packages canonical observations, the complete operator audit
surface, and the consumer-safe public surface as distinct resource roles.
Every addressed file has exactly one descriptor declaring its layer,
authority, identity contract, completeness, joins, dependencies, and
authorization flags. The addressed build receipt binds the clean generator
commit, runtime, explicit as-of date, export options, all enumerated semantic
and code/config inputs, and every output resource hash.

The strict verifier hashes every addressed byte before parsing it, validates
descriptor ownership and authority, checks receipt/output parity, validates
the complete resolved resource set, recursively checks public redaction, and
runs the reference adapter using only public files. A successful verifier
returns the sole branded verified-release handle used by downstream analysis.

Temporary verification candidates are producer-contract proofs only. They do
not promote `LATEST`, publish an external release, or authorize a downstream
pin.
