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

## Releases

Release exports copy canonical records plus release metadata under `data/exports/releases/<id>/`.
The v1 tag corresponds to release `v1-rc5`; the `LATEST` file points to the current release id.
