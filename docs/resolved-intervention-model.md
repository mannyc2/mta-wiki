# Resolved intervention model v1

The resolved intervention model is a generated read layer. It does not replace,
rewrite, or reclassify canonical source observations.

```text
canonical source observations
        ↓ exact identity + review membership + closed episode frontier
resolved intervention episodes
        ↓ exact reviewed applications
route / treatment / phase / extent serving projections
```

## Authority and identity

An episode is published only when the closed frontier marks its candidate
`published`, its occurrence identity is active, and review-v2 binds the exact
current observation membership. The episode id remains the durable occurrence
id. Candidate ids and identity aliases are provenance, not competing episode
identities.

An application is the authority-bearing incidence:

```text
occurrence × route × treatment × phase
```

The durable application id identifies that reviewed incidence. Existing
Plan 047 IDs remain their immutable founding IDs; future founding IDs use only
the incidence fields above. Action and reviewed extent are supersedable
claims, not application-identity inputs. Description text and evidence
ordering are also not identity inputs. Evidence from repeated observations is
de-duplicated and sorted. A partial two-route/two-treatment review can
authorize `A×X` and `B×Y` without ever creating `A×Y` or `B×X`.

Episode route, GTFS route, treatment, family, phase, physical-scope, and
application-id arrays are convenience sets derived from applications. They
must not be joined to each other. The compatibility occurrence projection says
`applications_are_authoritative` and names the exact application ids.

## Inputs and invalidation

The operator build is bound to:

- tracked canonical JSONL and exact canonical evidence;
- occurrence registry-v2 operation replay;
- immutable accepted review-v2 migration roots plus append-only current
  decision-v3 supersession replay and membership fingerprints;
- the closed candidate ledger.

Any membership, route identity, treatment, phase, scope, evidence, or frontier
fingerprint drift invalidates the build. Canonical records must remain
`source_stated`, non-quarantined, and type-correct at the build boundary.
Refining action or extent requires a new current decision, an exact
evidence-bound semantic-review receipt, and a regenerated frontier
fingerprint, but it does not change the durable application id. Replay checks
the predecessor application head, frozen batch/input hashes, distinct primary
and independent reviewers, and a third adjudicator whenever semantic claims
disagree. Accepted unknowns require axis-specific reason codes and exact
application evidence; they are terminal reviewed claims, never metric-filling
defaults.

## Extent and legacy study companions

An application extent is `route_wide`, `bounded_segment`, `stop_set`,
`service_pattern`, or explicit `unknown`. Only scope ids inside the exact
application review may be promoted. Project context and study-specific
member-extent/member-grain decisions cannot authorize a generic application.

The v1-rc28 study member-extent rows join by exact
`occurrence_id × route_record_id × treatment_record_id`. In the current
projection, 343 exact applications cover all 157 public episodes. Four
historical route-binding projection retirements remain explicit typed
reconciliations; there are no unresolved active episode identities.

The reviewed application partition is 104 `add`, 109 `modify`, 117 `remove`,
seven `resume`, one `retain`, and five accepted `unknown`. Extents partition as
34 `route_wide`, eight `bounded_segment`, 163 `service_pattern`, and 138
accepted `unknown`. These claims describe reviewed historical episode
semantics only. They do not establish placement continuity, transitions,
lifecycle intervals, or current footprint.

Documentary route-treatment scope describes source-backed applicability. It is
not a statement that a treatment is currently installed. Current operational
state requires the placement and transition model in Plan 048.

## Artifacts and database

Tracked operator artifacts live in
`data/resolved-transit/operator/v1/interventions/`. They contain strict
episodes, applications, context links, application reconciliation, identity
reconciliation, and an arithmetic summary. The generated
`data/resolved-transit.db` mirrors those contracts in a separate sealed SQLite
database with strict tables, foreign keys, and indexed operator read paths.
Resolved rows are never inserted into `data/canonical.db`.

Internal agents may query the operator database through
`mta_read_resolved_interventions`. Consumer-safe labels and redaction are a
separate presentation contract owned by Plan 049.
