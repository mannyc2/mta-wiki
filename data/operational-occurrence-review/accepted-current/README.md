# Current operational occurrence resolution decisions

The files in `decisions/` are append-only accepted decision-v3 resolutions.
They either establish a new current resolution or supersede an immutable
migration/current predecessor. They never edit, delete, or replace historical
files under `../accepted-v2/decisions/`.

An establishment has no predecessor and uses durable incidence-derived
application IDs. A supersession must name its exact predecessor decision and
membership fingerprint. Deterministic replay requires one current head per
occurrence and preserves predecessor application IDs while allowing
evidence-bound action and extent claims to change.

No current decisions are accepted in the Plan 051 baseline. The directory may
therefore be absent until the first owner-approved review is appended.
