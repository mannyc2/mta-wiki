# Data Model

The project keeps source-backed observations as structured records plus generated wiki context.
Every substantive fact should trace back to cited source evidence.

## Canonical Record Kinds

Page-bearing records:

- `source`
- `entity`
- `project`
- `corridor`
- `route`
- `source_gap`

Mostly data-only records:

- `treatment_component`
- `event`
- `claim`
- `metric_claim`
- `relation`

`table` is retained only for legacy compatibility. New extraction should cite source table blocks
and submit substantive table facts as claims, metric claims, treatments, events, or relations.

## Evidence

Evidence refs point to source blocks. Agents do not submit hashes; the runner owns source-text hashes
and validation. Source literals should be preserved instead of normalized by guessing.

The public repository tracks `data/evidence-block-index.jsonl`, a compact validation index for the
canonical evidence refs. It contains cited block ids, page numbers, and raw-text hashes so fresh
clones can validate evidence integrity without the local `raw/` source tree.

Generated wiki pages should not be treated as primary evidence. The canonical record plus its cited
source block is the evidence surface.

## Identity

Canonical ids identify durable real-world or source-scoped records. Identity logic separates:

- Durable identities, such as a route, agency, project, or corridor.
- Source-scoped observations, such as a document-specific status update.
- Local observation ids, which let one source submission refer to another observation from the same
  source.

Aliases and merge overrides are deterministic runner inputs. They should preserve source literals and
avoid collapsing lifecycle observations into durable identities.

## Ontology

Raw source labels stay open-world. Bounded companions provide stable query surfaces where the corpus
supports them.

Examples:

- `relation_kind` remains open, while `relation_family` is bounded.
- Project, event, treatment, and metric labels preserve raw text while adding normalized family or
  unit companions.
- `assertion_status` and `as_of_date` describe document-time relation posture.

Enums should be closed only through deterministic audit evidence or by enforcing an invariant already
guaranteed by code. Do not close source vocabularies based on model confidence alone.

## Documentary and resolved lifecycle

Canonical lifecycle records preserve what a source said. The canonical `lifecycle_entries` and
`route_timeline` views are documentary timelines, not a current intervention inventory.
The legacy canonical `resolved_status` view is deprecated: despite its name, it only selects the
most recent credible documentary row per subject. It does not reconcile conflicts and has no
current-state authority. Its SQL remains unchanged for historical consumers, but new builders and
queries must not depend on it.

Resolved intervention state lives in the independently versioned `data/resolved-transit.db`.
Stable placement identity is separate from an episode (something that happened) and an application
(a reviewed route/treatment/action claim within that episode). Placement lifecycle assertions retain
valid-time bounds separately from source publication, retrieval, and assertion-as-of time.
Consumers must provide an explicit date and read `resolved_intervention_placement_state_as_of` or
`resolved_current_intervention_footprint`; the latter contains only `confirmed_active` placements.
An empty footprint means no placement is currently confirmed by accepted interval evidence, not that
the corpus contains no interventions.

## Consumer-safe resolved pack

The Resolved Transit Knowledge Pack is the product boundary above the
operator-only resolved database. Its append-only public-key registry freezes
route, treatment-family, source, exact component, and placement keys. A
canonical-read display builder produces an addressed operator dictionary;
the public projector then reads only resolved operator resources and that
dictionary. Public rows exclude canonical ids, review metadata, fingerprints,
queues, and paths. History, placement state, and confirmed-current footprint
remain separate resources with explicit denominators.

## Releases

Release exports copy canonical records plus release metadata under `data/exports/releases/<id>/`.
The `resolved-pack-v1-production` tag corresponds to the current production release; the `LATEST`
file points to that release id.

Manifest v7 keeps canonical observations documentary and places resolved
episodes/applications, stable placements, lifecycle state, and public
projections in separately described resources. Only resolved episodes and
applications answer what reviewed real-world change occurred. Only placement
state-as-of and confirmed-current footprint answer installed-treatment state.
The operator and public surfaces intentionally expose different fields and
must reconcile by frozen public keys.

Resolved application identity is incidence-stable. The historical migration
root establishes an application ID; append-only current review decisions may
refine action and extent without changing it. Public component and placement
lookups likewise survive mutable claim refinement. An accepted same-subject
presentation-key supersession retains the prior key as an alias; a real
subject replacement requires explicit reviewed lineage/redirect history.
