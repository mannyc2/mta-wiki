# Plan 032: Productionize resolved operational occurrences: stable identity, reviewed clusters, bundle/multi-route semantics, and manifest v3 dual-publish

> **Executor instructions**: Follow this plan step by step. This is a production
> contract plan, not a design-only spike. It is DONE only when `export-release` writes
> a manifest-addressed `operational_occurrences.jsonl` contract and all stability,
> legacy-compatibility, and migration-fixture tests pass. Run every verification
> command before moving on. If a STOP condition occurs, stop and report; do not fall
> back to a preview-only artifact. Update `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat d28b64c8..HEAD -- packages/pipeline/src/materialize/operational-anchors.ts packages/pipeline/src/materialize/operational-anchor-review.ts packages/pipeline/src/materialize/export-release.ts packages/cli/src/commands/materialize.ts`
> Plans 026–031 must be merged and plan 031 must have accepted cluster decisions plus
> `resolved-occurrence-seeds.jsonl`. Read their live diffs before implementing. If
> plan 031 reclassification introduced excess keys into serialized schema-v1 anchors,
> repair that compatibility defect before proceeding.

## Status

- **Priority**: P1 (the current single-route/single-treatment row cannot represent the
  real SBS or Queens intervention shapes)
- **Effort**: L
- **Risk**: HIGH (new production contract and persistent ids; mitigated by dual-publish,
  strict parsers, fixtures, and no official cut in this plan)
- **Depends on**: 029, 030 Tier B, 031 including accepted cluster decisions
- **Category**: architecture + migration
- **Planned at**: commit `d28b64c8`, 2026-07-12 (rewritten 2026-07-12 after contract
  review: production cutover is now required; the prior preview-only exit was removed)

## Why this matters

The v1 anchor surface assumes one reviewed route and one reviewed treatment. That
cannot honestly express either of the important real shapes: a Queens redesign phase
can change many routes on one onset date, and an SBS launch is a dated bundle of bus
lanes, TSP, fare collection, stop changes, and other members. Adding four component
relations to M15 improves evidence but must not magically make M15 a single-treatment
event. The producer therefore needs a stable occurrence object with plural routes and
an explicit atomic-vs-bundle discriminant, and the release manifest must address that
object under a new contract version. A preview does not help the consumer; this plan
wires the new object into production export while preserving the exact legacy files
during a migration window.

## Current state

- Broad+reviewed anchors are built in
  `packages/pipeline/src/materialize/operational-anchors.ts:995-1179`.
- The accepted v1 review schema is singular (`route_record_id`,
  `treatment_record_id`) in
  `packages/pipeline/src/materialize/operational-anchor-review.ts:26-45`; it throws
  unless one GTFS route is selected and cannot represent a bundle.
- `packages/pipeline/src/materialize/export-release.ts` currently parses manifest
  versions 1|2, emits manifest 2, and allows only the existing anchor/review contract
  keys and pointers. Its parser is strict on unexpected keys.
- The downstream decoder at
  `/mnt/models/dev/bus-reliability-tracker/tools/pipeline-v2/src/lib/mta-wiki-operational-anchors.ts`
  is also strict (`onExcessProperty: "error"`), accepts manifest 2 and anchor contract
  1 only, and accepts evidence roles `event|route_scope|timeline_relation|treatment_scope`.
  A CHANGES note alone cannot migrate it; plan 034 implements the new decoder before
  repinning.
- Plan 029 adds internal summary metrics and de-duplicates overlapping scope-evidence
  exclusions; plan 031 adds rich resolution provenance in
  `data/quality/operational-coverage/resolved-occurrence-seeds.jsonl`. New fields AND
  changed exclusion/temporal meanings are not legal in a resource still labeled
  anchor contract 1. They stay in coverage/occurrence outputs.
- Plan 031's accepted cluster decisions are the only co-reference clusters allowed to
  affect eligibility. Heuristic/quarantined clusters are not occurrence identities.
- Bundle evidence is in `raw/sources/brt_routes_fullreport/blocks.jsonl` for Bx12 and
  M15; plan 030 requires the component relations to be accepted before this plan.
- Existing releases and their manifests are immutable. Plan 027 makes LATEST
  promotion explicit; this plan must not move it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Gates | `bun run typecheck && bun run test && bun run validate && bun scripts/determinism-anchor.ts` | exit 0 / Issues: 0 |
| Inspect occurrences | `bun packages/cli/src/cli.ts occurrences --dry-run` | deterministic quality artifact |
| Contract canary | `bun packages/cli/src/cli.ts export-release --id occurrence-contract-canary` against a temp root | manifest v3 with addressed occurrence files; LATEST unchanged |

## Scope

**In scope**:
- NEW `docs/operational-occurrence-model.md` — normative producer/consumer contract
  and migration table.
- NEW `packages/pipeline/src/materialize/operational-occurrences.ts`.
- NEW `packages/pipeline/src/materialize/operational-occurrence-identity.ts` and
  persistent registry under `data/operational-occurrence-identities/`.
- NEW `packages/pipeline/src/materialize/operational-occurrence-review.ts` with
  proposed/accepted decisions under `data/operational-occurrence-review/`.
- `packages/pipeline/src/materialize/export-release.ts` — backwards-compatible
  manifest parser plus manifest-v3 writer and occurrence pointers.
- `packages/pipeline/src/materialize/operational-anchors.ts` — a dedicated legacy-v1
  serializer that strips all post-v1 excess fields from the dual-published files.
- CLI inspection command and tests under `packages/pipeline/test/materialize/`.
- Deterministic consumer migration fixture under
  `data/contract-fixtures/operational-occurrences-v1/` (small, synthetic, no raw PDFs).
- `LOG.md`, `plans/README.md`.

**Out of scope**:
- Editing `/mnt/models/dev/bus-reliability-tracker`; plan 034 performs and tests that
  side of the migration against this plan's fixture.
- Cutting or promoting the official consumer-bound release; plan 034 owns that.
- Altering source-local event/relation truth or inventing route×treatment×date
  combinations.
- Deleting the legacy v1 files or existing accepted v1 review decisions.

## Git workflow

- Branch: `advisor/032-production-occurrence-contract`.
- Logical commits: contract+fixtures; identity registry; occurrence compute/review;
  manifest-v3 dual-publish; docs/gates. Do not push without operator instruction.

## Steps

### Step 1: Freeze both contracts and the migration envelope

Write `docs/operational-occurrence-model.md` and matching TypeScript schemas.

Manifest v3 is an explicit tagged variant, not a permissive extension of manifest 2:

- Existing manifest 1 and 2 parse exactly as today.
- Manifest 3 retains the existing pointers and adds
  `operational_occurrences`, `operational_occurrence_summary`, and
  `operational_occurrence_review_decisions`.
- `contract_versions` retains `operational_anchors: 1` and
  `operational_anchor_review_decisions: 1`, and adds
  `operational_occurrences: 1` and
  `operational_occurrence_review_decisions: 1`. This is a new resource, so its first
  contract is version 1; manifest 3 is what distinguishes the release envelope.
- `operational_anchors.jsonl`, `operational_anchors_summary.json`, and the accepted
  review snapshot remain strict schema-v1 migration surfaces. A dedicated serializer
  emits their exact frozen key sets, evidence-role enum, document-time temporal
  meaning, summary meanings, and legacy exclusion triggers characterized from
  `v2-operational-anchors-1`. Plan-029 de-duplicated diagnostics and all plan-031
  effective resolution stay in the coverage matrix/occurrence summary. Do not label a
  changed semantic surface contract 1.
- `operational_occurrences.jsonl`, its summary, and the accepted occurrence-review
  snapshot are required addressed files in manifest 3; null or dangling pointers are
  invalid.

Define occurrence schema version 1 with, at minimum:

- `occurrence_id` and optional `occurrence_aliases`;
- accepted `resolution_cluster_id`/decision id or a single founding event id;
- all observation event/relation ids and document-time statuses/dates;
- `resolved_status`, onset date and precision, resolver ids, publication dates, and
  evidence refs;
- `routes: [{route_record_id, gtfs_route_id, evidence_refs}]` (plural);
- discriminated treatment scope:
  `treatment: {kind:"atomic", member:{...}} | {kind:"bundle", bundle_family,
  members:[{treatment_record_id,treatment_family,evidence_refs}]}`;
- categorized exclusions (temporal/spatial/treatment/evidence/authority/review),
  review state, and complete provenance chain.

Define occurrence-review decision/snapshot version 1. A decision binds an exact
`occurrence_id`, observation/cluster identity, resolved onset+precision, complete route
set, treatment discriminant and member set, and required evidence refs, with
`approved|rejected`, reviewer, timestamp, and rationale. Materialization verifies every
bound value against current computation. Only an approved, current decision may remove
the occurrence `review` exclusion; proposed, stale, or rejected decisions never enter
the release snapshot or study projection.

Bundle semantics are strict: several members sharing one evidenced onset are ONE
bundle occurrence. Members inherit the bundle onset without claiming individual
activation dates. Atomic projection is allowed only for exactly one member or for a
member carrying its own independently cited onset. Multi-route semantics are also
strict: a route belongs only when evidence or an accepted curation decision binds it
to this occurrence; never cross-product all project routes with all project events.

Document the downstream projection: one occurrence produces one candidate per GTFS
route; an atomic occurrence retains its family; a bundle remains one bundle-typed
candidate with its source-backed supported umbrella analysis family and all member
families (it does not fan out into per-treatment candidates). When no supported
umbrella family exists, retain the occurrence and emit
`unsupported_bundle_analysis_family` instead of choosing the first component.
Include worked M15 SBS and Queens Phase examples and a field-by-field migration table
for the consumer files named in plan 034.

**Verify**: schema fixtures strict-decode; deleting either new pointer, adding an
unknown key, representing a bundle as multiple atomic rows without member-specific
dates, or binding an unevidenced route all fail with named errors.

### Step 2: Establish enrichment-stable occurrence identity

Do not derive `occurrence_id` from date, date bucket, route ids, treatment ids,
status, publishers, evidence count, or current cluster membership: every one can
change during plans 030/031/033.

Implement a persistent identity registry with append-only entries containing
`occurrence_id`, immutable `founding_key`, `founding_event_record_ids`,
`resolution_cluster_id|null`, aliases/tombstones, decision provenance, and timestamps.
Initial founding keys use only a stable canonical event record id or an accepted
plan-031 cluster-decision id. Once issued, adding a route, treatment, refined date,
delivered status, publisher/evidence source, or new accepted cluster member reuses the
same id. Cluster merges select one existing id and preserve the others as aliases;
splits tombstone the ambiguous id and mint explicit children. Both operations require
an accepted decision and must never be inferred during materialization.

Add a validate lane: duplicate active ids, reused tombstones, overlapping founding
members, unknown cluster decisions, alias cycles, or silent id replacement fail the
gate. Bootstrap the live registry deterministically, review the collision/merge/split
report, and persist it before export.

**Verify**: start with a fixture occurrence and independently add/reorder (a) route
scope, (b) treatment scope, (c) a day-precise date replacing month precision, (d)
delivered status, (e) resolver publication/evidence, and (f) a newly accepted cluster
member. The id and prior aliases remain byte-identical after every mutation. Separate
fixtures prove explicit merge and split history.

### Step 3: Implement occurrences with cluster and evidence gates

Compute occurrences from canonical records, route anchors, plan-031 resolved seeds,
accepted cluster decisions, accepted v1 anchor decisions, accepted occurrence-review
decisions, and the identity registry.

- Only an accepted `same_occurrence` decision may combine multiple event records.
- A quarantined/undecided cluster emits no study-eligible combined occurrence.
- Unclustered single observations may emit an occurrence when their route/treatment/
  temporal evidence is internally complete.
- Preserve all document-time observations beside the resolved layer.
- Build plural routes and atomic/bundle treatment values without discarding members.
- Carry exact block-level evidence for onset, status, every route, and every treatment
  member; missing evidence creates the appropriate exclusion.
- Keep conflict and authority gates fail-closed.
- Require an accepted occurrence-review decision before setting
  `study_projection_eligible`; validate it against the full current route/bundle/onset
  shape so later enrichment makes a stale decision fail closed.

`occurrences --dry-run` writes an inspection copy and summary under
`data/quality/occurrences-preview/`, but this is only a diagnostic view of the same
production compute function used by export.

**Verify**: two dry-runs are byte-identical. The live corpus contains documented Bx12
and M15 bundle occurrences after plan 030; neither is mislabeled atomic. Queens Phase
1/2 produce one occurrence per accepted phase cluster, retain post-event resolved
dates, and remain spatially excluded until plan 033 supplies reviewed route scope.
Draft and owner/delegate-review the live Bx12/M15 occurrence decisions; rejected or
stale decisions remain visible in diagnostics but cannot make an occurrence eligible.

### Step 4: Test projection and all identity/cluster boundaries

Create fixtures before wiring export:

1. M15 launch + four component links → one bundle occurrence; no per-member dates;
   per-route projection yields exactly one M15 bundle candidate.
2. Queens Phase 1 with four source observations + accepted cluster decision + three
   reviewed routes → one occurrence and exactly three route candidates with the same
   occurrence id/date and complete provenance.
3. Atomic M86-style decision → one atomic occurrence/candidate compatible with the
   legacy semantics.
4. Same-label different-change events → separate/quarantined until an explicit
   cluster decision; zero eligibility leakage.
5. All six identity enrichments from Step 2 → stable id.
6. Accepted cluster amendment/merge/split and rejected/dangling decision cases.
7. Pre-launch-only resolver → planned/unconfirmed and ineligible.
8. Route or treatment cross-product without a binding evidence ref → excluded.

**Verify**: all eight fixture classes pass. Done criteria require all fixtures, not a
subset.

### Step 5: Wire manifest-v3 production dual-publish

Update `parseReleaseManifest` as a discriminated parser for manifest 1|2|3 and update
`exportRelease` to emit manifest 3 with both frozen legacy files and the three required
occurrence files (rows, summary, accepted-review snapshot). File hashes, byte counts,
record counts, and pointers are computed by
the existing stable-json machinery. The official release id remains plan 034's choice.
`export-release` continues to accept `--id`; plan 027's opt-in LATEST behavior remains
untouched.

Generate `data/contract-fixtures/operational-occurrences-v1/` from a small synthetic
atomic + bundle + multi-route corpus. Include its manifest and expected per-route
projection JSON. This fixture is the executable handshake for plan 034's consumer
migration, not merely prose.

**Verify**: export a temporary `occurrence-contract-canary`, parse it, verify every
addressed byte/hash, and independently recut it byte-for-byte. A manifest-2 fixture
still parses unchanged. Frozen legacy row/summary characterization fixtures retain
pre-029 exclusion triggers, summary meanings, document-time temporal values, and no
plan-029/031 excess keys; occurrence files contain the corrected/rich fields. LATEST
is unchanged.

### Step 6: Gates and production-readiness record

Record in LOG: manifest-3 shape, exact contract versions, identity-registry
fingerprint, live atomic/bundle/multi-route counts, quarantined counts, and the fact
that the official cut and consumer repin remain plan 034. Do not call this preview-only
or owner-gated cutover: the exporter is now production-capable and always emits the
occurrence files for manifest 3.

**Verify**: all four repository gates pass; `rg -n
"operational_occurrences" packages/pipeline/src/materialize/export-release.ts`
returns the production write and manifest pointer; the temp release recut is
byte-identical.

## Test plan

- Extend `packages/pipeline/test/materialize/export-release.test.ts` with manifest
  1/2 backward parsing, strict manifest-3 parsing, addressed occurrence files,
  legacy-v1 frozen serialization, and reproducibility.
- Add occurrence compute/identity tests for all eight Step-4 fixture classes.
- Add validator tests for identity alias/tombstone cycles and cluster-decision gates.
- Add occurrence-review tests for exact binding, stale route/member/onset changes,
  proposed-vs-accepted isolation, and deterministic snapshot ordering.
- Model stable-json and temp-root patterns on the existing export-release tests.

## Done criteria

- [ ] Normative schema/migration doc exists and matches TypeScript strict schemas.
- [ ] Persistent occurrence ids survive route, treatment, date, status, provenance,
  cluster-growth, and input-order changes; merge/split aliases are explicit and tested.
- [ ] Every combined occurrence is backed by an accepted cluster decision; undecided
  clusters leak zero study-eligible rows.
- [ ] Every study-projectable occurrence is bound by a current accepted
  occurrence-review decision; proposed/rejected/stale decisions leak zero rows.
- [ ] M15/Bx12 are bundle occurrences, Queens fixture is multi-route, and all eight
  fixture classes pass.
- [ ] `export-release` production-writes manifest 3 + addressed occurrence-v1 rows,
  summary, and accepted-review snapshot;
  independent temp recut is byte-identical; manifest 1/2 parsing still passes.
- [ ] Dual-published anchor v1 rows/summary preserve exact frozen keys/roles; LATEST
  and characterized value semantics; LATEST and every existing release are untouched.
- [ ] Consumer migration fixture and expected per-route projection are committed.
- [ ] All four gates green; LOG and `plans/README.md` updated.

## STOP conditions

- Any identity changes under one of the six enrichment/cluster-growth fixtures →
  redesign the registry before export; do not weaken the test.
- A combined occurrence lacks an accepted cluster decision, or a route/treatment
  member lacks binding evidence → quarantine it; do not infer the cross-product.
- A bundle cannot be represented without inventing member-specific dates → keep it
  bundled and record the limitation; never atomize it for yield.
- Manifest 1/2 backward parsing or frozen anchor-v1 serialization breaks → stop;
  dual-publish is the rollback path.
- The implementation can only produce a quality-directory preview and is not wired to
  `exportRelease` → the plan is not DONE.

## Maintenance notes

- Plan 033 reruns this production computation after acquisition; route/treatment/date
  enrichment must reuse existing occurrence ids.
- Plan 034 must implement the strict manifest-3/occurrence-v1 consumer decoder and
  bundle-aware candidate schema before changing the pin. A CHANGES note is not enough.
- Retire legacy anchor-v1 dual-publish only in a later plan after at least one accepted
  downstream receipt and an explicit owner decision.
