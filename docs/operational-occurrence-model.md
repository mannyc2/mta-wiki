# Operational Occurrence and Intervention Model

Canonical events, relations, routes, and treatment components are immutable
source observations. They preserve what a document said; they do not, by
themselves, answer what real-world change occurred.

The resolution pipeline is deliberately layered:

1. The observation frontier enumerates eligible source observations.
2. The candidate frontier accounts for every possible observation-to-episode
   assignment as accepted, pending, rejected, or unsupported.
3. The occurrence registry gives reviewed episodes durable `occurrence_id`
   identities with explicit redirect and retirement lineage.
4. Review snapshot v3 binds an episode to exact observation, phase,
   physical-scope, and route-treatment application membership. Any membership
   change invalidates the review.
5. Resolved episodes and exact applications answer what reviewed change
   occurred. An application is one route/treatment/action/scope incidence;
   multi-route and bundle evidence must never be expanded as a cross-product.
6. Stable placements identify installed-treatment subjects independently from
   episodes. Reviewed transitions connect applications to placement changes.
7. Lifecycle assertions keep valid time separate from document/retrieval time.
   Only dated placement state and the confirmed-current footprint answer
   current-state questions.

Pending, ambiguous, conflicted, invalid, and reconciliation rows are
non-authorizing. Canonical timelines, route-treatment scopes, historical
onsets, and “latest” documentary rows cannot establish current activity.

