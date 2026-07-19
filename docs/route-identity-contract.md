# Exact route identity contract

MTA Wiki treats an exact, case-sensitive `route_id` in an immutable dataset namespace as service identity. `B44` and `B44+` are different identities. A family such as `B44` is grouping context only and never a matching fallback.

| Term | Meaning |
|---|---|
| Exact service identity | `(dataset_id, source_route_id)`, preserving the case-sensitive source literal. Manifest-v5 compatibility additionally requires `source_route_id === gtfs_route_id`. |
| Route family | MTA grouping context formed only by removing one terminal `+`; it is not an identity. |
| Service designation | Source-backed Current Bus Routes or canonical literal mapped through the closed, versioned mode vocabulary. |
| Reliable interval | Feed-info bounds or a separately pinned official completeness assertion; calendar rows alone do not establish it. |
| Scheduled in window | Whether trips whose services are active are scheduled on the seven consecutive New York service dates ending on `as_of_date`; indeterminate unless the entire window is reliable. |
| Identity scope | Exact service, family context, aggregate context, or unresolved. |
| Service class | Regular MTA bus, proposal, temporary, external, non-bus, undetermined, or not applicable. |
| Record temporal scope | Current, historical, future, undetermined, or not applicable description. This is separate from schedule activity. |
| Presentation primary | A reviewed Wiki record used to present one exact eligible service; it is not the GTFS identity. |

## Immutable inputs and namespaces

The five NYCT borough schedule archives are partitions of one `mta-nyct-bus` route namespace. Their identical route definitions collapse to one exact identity while component IDs remain attached to trip, service, stop, and activity provenance. MTA Bus Company uses a separate `mta-bus-company` namespace. A non-identical duplicate definition inside the shared namespace, or the same exported `route_id` across namespaces, stops snapshot production. Synthetic IDs are forbidden.

Every snapshot pins official archive and Current Bus Routes bytes, hashes, capture time, service window, feed bounds, timezone, component policy, and compact output metadata. Each route row carries the intersection of its component-feed reliable intervals and the literal derivation policy `component_feed_bounds_intersection_v1`; reliability is recomputed from that interval during verification. The selected snapshot is verified offline for every release. Network acquisition occurs only during an explicit refresh.

## Activity, catalog state, and labels

`declared_in_feed`, `catalog_in_effect`, and `scheduled_in_window` are separate facts. Schedule activity applies weekly calendar service plus `calendar_dates` additions and removals to trips. A route outside reliable coverage is `indeterminate`, not inactive or historical. Current Bus Routes is a distinct point-in-time catalog assertion, and disagreements are review items rather than silently reconciled.

Display labels are data. For a catalog-effective route, the Current Bus Routes `route_short_name` wins; otherwise the GTFS short name wins, then exact `source_route_id`. The chosen source is recorded. A source-ID fallback is explicit as `label_fallback: source_route_id`. When nonempty Current and GTFS short names differ, both literals are preserved in the typed `label_diff` object. Family transforms, service modes, booleans, and UI code never manufacture a label.

## Closed contracts

Normalized service modes are `local`, `local_limited`, `limited_stop`, `sbs`, `express`, `rush`, `school_local`, and `school_limited`. Identity scope, service class, temporal scope, activity, and reliability values are likewise closed tuples shared by TypeScript and strict decoders. Unknown keys, versions, roles, modes, duplicate identities, unsorted sets, hash/count drift, stale decisions, and source/exported identity inequality fail closed.

Canonical source literals and historical identities remain unchanged. Current service facts are release projections; they are never hand-edited into canonical JSONL. Deterministic bindings identify their algorithm and evidence but do not falsely attribute a human reviewer.
