# Plan 031: Reconcile document-time status with post-event evidence: reviewed co-reference clusters, a strict supersedence rule, and eligibility-affecting resolution

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row in `plans/README.md`.
>
> **Drift check (run first)**: plan 030 Tier B MUST be DONE — verify the curated
> Queens evidence exists before anything else:
> `jq -c 'select((.payload.relation_kind=="has_timeline_event") and (.payload.assertion_status=="delivered") and (.payload.subject_id=="project_queens-bus-network-redesign"))' data/canonical/relations.jsonl`
> must return ≥2 rows (Phase 1 + Phase 2, sourced from meeting_doc_179606 /
> meeting_doc_186616). If it returns zero, 030's curation has not landed — STOP;
> this plan's fixture cannot legitimately pass without it. Also
> `git diff --stat d28b64c8..HEAD -- packages/pipeline/src/materialize/operational-anchors.ts packages/db/src/schema.ts` — reconcile plans 026-030's diffs with "Current state".

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: MED–HIGH (this plan changes resolved-occurrence eligibility under a
  strict, tested rule; source-local records and anchor-v1 semantics stay untouched)
- **Depends on**: 028, 029, **030 Tier B (hard — the Queens delivered observations)**
- **Category**: bug (known issue AGENTS.md:227) + architecture
- **Planned at**: commit `d28b64c8`, 2026-07-12 (revised same day after review: the
  original draft's supersedence rule was UNSAFE — it would have resolved Queens off
  `meeting_doc_174141`, a PRE-launch doc whose timeline relation is `planned` as-of
  2025-05-28; the rule now requires post-event evidence, and resolution now affects
  occurrence eligibility instead of being annotation-only)

## Why this matters

A source may describe a launch before it happens; the wiki rightly preserves that
document-time view, but nothing reconciles it against later confirmation — so the
projection carries planned-forever rows for changes that verifiably shipped, and the
consumer sees zero studyable occurrences even where July/September official documents
confirm delivery. The trap this plan must not fall into (verified 2026-07-12): the
corpus contains past-tense-named, realized-lifecycle events from PRE-launch documents
(`event_queens-bus-redesign-phase1-launch-june29-2025`, lifecycle `launched`, from
`meeting_doc_174141` published 2025-05-28, whose timeline relation is
`assertion_status: "planned"`, `as_of: 2025-05-28`) — treating those as confirmation
would mint false realized statuses. Only post-event evidence may resolve. And per the
review verdict: resolution that never touches eligibility changes nothing for the
consumer. Where the strict bar is met, the **resolved occurrence seed's** effective
temporal classification must update with citations so plan 032 can project it. The
anchor-v1 observation remains document-time truth; cross-source resolution must not be
misrepresented there as source-stated fact.

## Current state

- Known issue: `AGENTS.md:227-228` (document-time vs resolved real-world status).
- Temporal logic: `operational-anchors.ts:562-611` (`temporalFields` — role purely
  from timeline `assertion_status`es); realizedLifecyclePhases at `:181-189`;
  exclusions `non_realized_operational_date` / `status_as_of_only` at `:748-749`.
- Label machinery: `:778-806` — `normalizedSemanticLabel` prefers
  `payload.event_name` over `display_name` and strips dates. VERIFIED PITFALL: exact
  label equality FAILS even for the closest Queens pair —
  `event_170921-queens-bus-phase1-launch` has `event_name: "Queens Bus Network
  Redesign Phase 1"` (no "Launch") while
  `event_queens-bus-redesign-phase1-launch-june29-2025` has `event_name: null` →
  display_name → "queens bus network redesign phase 1 launch". Clustering must NOT
  assume exact equality.
- Queens cluster ground truth (post-030 this grows by the curated delivered events):
  pre-launch members from `meeting_doc_170921` (pub 2025-04, relation planned as-of
  2025-04) and `meeting_doc_174141` (pub 2025-05-28, relations planned as-of
  2025-05-28); post-launch curated members from `meeting_doc_179606` (pub 2025-07)
  and `meeting_doc_186616` (pub 2025-09-29) with `delivered` relations — all sharing
  subject `project_queens-bus-network-redesign`.
- Unused view: `packages/db/src/schema.ts:323` `resolved_status_view` (subject-scoped
  latest-status window) — an input for subject-sharing clusters, not the whole answer.
- Source publication dates: `sources.jsonl` `payload.published_date_normalized`
  (registry complete post-028).
- Downstream constraints: existing releases immutable; `anchor_id`/`event_record_id`
  meanings stable. The current bus-reliability-tracker decoder uses strict excess-
  property rejection, so **new row fields, new summary fields, new evidence-role
  values, and cross-source reinterpretation of `temporal_role` are breaking changes
  even if TypeScript calls them additive**. This plan preserves the exact v1 key set,
  evidence-role vocabulary, AND document-time value semantics. Effective resolution
  lives only in the internal seed consumed by plan 032. Plan 032 owns the versioned
  producer contract; plan 034 owns the coordinated consumer decoder migration.
- Anchor evidence-ref role enum (`operational-anchors.ts:62`):
  `"event" | "route_scope" | "timeline_relation" | "treatment_scope"`. Do not append
  cross-source resolver evidence to a v1 anchor: that would make the consumer treat an
  inferred resolution as source-local truth. Resolver evidence lives in the internal
  seed and plan-032 occurrence contract; do not add a `"resolution"` role or reinterpret
  existing roles in schema_version 1.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Gates | `bun run typecheck && bun run test && bun run validate && bun scripts/determinism-anchor.ts` | green / Issues: 0 |
| Matrix | `bun packages/cli/src/cli.ts coverage-matrix` | before/after deltas |

## Suggested executor toolkit

- One executor session for clustering + rule + fields.
- After Step 1, dispatch 2-3 read-only subagents over DISJOINT slices of the cluster
  file with the brief "find one cluster merging two DIFFERENT real-world changes";
  feed every confirmed false-merge back as a guard rule before Step 3. Precision
  failures are this plan's main risk.

## Scope

**In scope**:
- NEW `packages/pipeline/src/quality/occurrence-clusters.ts` (+ CLI subcommand)
- NEW reviewed cluster-decision validator/loader and queue under
  `data/operational-anchor-review/proposed/cluster-decisions/` plus durable accepted
  decisions under `data/operational-anchor-review/accepted/cluster-decisions/`
- NEW `packages/pipeline/src/quality/resolved-occurrence-seeds.ts` (effective
  classification/eligibility over accepted clusters; may reuse pure temporal helpers)
- `packages/pipeline/src/materialize/operational-anchors.ts` only if a pure helper must
  be extracted; its serialized v1 rows/summary and semantics remain unchanged
- Tests under `packages/pipeline/test/`
- `data/quality/operational-coverage/occurrence-clusters.jsonl` (generated)
- `data/quality/operational-coverage/resolved-occurrence-seeds.jsonl` (generated
  internal provenance consumed by plan 032; not a release pointer)
- `AGENTS.md` known-issues bullet (narrow at the END, only if shipped), `LOG.md`,
  `plans/README.md`

**Out of scope**:
- Mutating ANY source-local event/relation record (document-time truth is sacrosanct;
  new delivered observations come only from 030's reviewed queue).
- Merging event records via identity overrides (co-reference ≠ identity).
- Scope exclusions (`missing_route_scope`, `missing_treatment_scope`, evidence
  variants) — resolution NEVER lifts scope gates; only 030 curation / 033 acquisition
  add scope.
- schema_version bumps / occurrence objects (plan 032).

## Git workflow

- Branch: `advisor/031-status-reconciliation`. No push without operator instruction.

## Steps

### Step 1: Deterministic co-reference clustering

`occurrence-clusters.ts` over implementation/launch events:
- **Primary rule (strong)**: same timeline SUBJECT (project/corridor/route via
  has_timeline_event) AND event dates within containment of each other
  (reuse `broaderDateContains`, operational-anchors.ts:524-528) AND compatible
  family. Post-030, the whole Queens quartet+curated set clusters this way via
  `project_queens-bus-network-redesign`.
- **Secondary rule (quarantine-first)**: normalizedSemanticLabel TOKEN-SUBSET
  containment (one label's token set ⊆ the other's, computed AFTER date stripping —
  handles "…phase 1" ⊆ "…phase 1 launch") PLUS at least one corroborator (date
  containment or shared gtfs route). Secondary-rule clusters land in a
  `quarantined_clusters` section until the Step-2 audit promotes them.
Emit per member: record_id, source_id, publication date, lifecycle_phase,
date_normalized/precision, timeline assertion_statuses + as_of dates, and per cluster:
`rule: "subject" | "label_subset"`, confidence class. Generated clusters are
**candidates**, not permission to change eligibility. Their `candidate_cluster_id` may
be content-derived for deterministic regeneration, but it is never exported as the
durable resolution identity.

Create a strict accepted cluster-decision shape:
`{schema_version, resolution_cluster_id, operation: "same_occurrence"|"split",
member_record_ids, founding_member_record_ids, resolver_record_id|null,
reviewer, accepted_at, rationale, evidence_bindings}`. The owner/delegate must inspect
the member evidence and accept `same_occurrence` before any member can be
reclassified. `resolution_cluster_id` is minted once from the accepted decision id,
is persisted, and is not recomputed from current member/date/route/treatment sets.
Adding a later source member requires an amended accepted decision that retains the
same id and founding members. A merge or split requires an explicit decision with
aliases/tombstones; it may never silently rewrite an exported id.

**Verify**: deterministic across two runs; the Phase 1 cluster contains the 170921,
174141, AND curated 179606-backed members under the PRIMARY rule; size histogram in
the PR. Fixtures prove route/treatment/date/status enrichment and addition/reordering
of a corroborating source member do not change an accepted `resolution_cluster_id`.

### Step 2 [OWNER REVIEW REQUIRED]: Adversarial precision audit and cluster acceptance

Sample ≥20 non-eligibility clusters (all, if fewer) across rules; verify
same-real-world-change against evidence; add guard rules for every confirmed
false-merge; re-run. In addition, audit **100% of clusters that have a qualifying
post-event resolver or would change any resolved seed's temporal eligibility** and write an
accepted `same_occurrence` or `split` decision for each. Secondary-rule clusters and
all undecided clusters stay quarantined. No accepted decision means no
reclassification, even when the deterministic rule is high-confidence. Ship with zero
KNOWN false-merges; ambiguity stays quarantined rather than threshold-tuned.

**Verify**: sampled verdicts recorded; fixtures stable after guards; every candidate
listed by `would_reclassify=true` joins exactly one accepted cluster decision, and
the validator rejects overlapping accepted memberships, dangling evidence, silent id
replacement, or an amendment that changes founding members.

Generated decisions begin in `proposed/cluster-decisions/`. The adversarial audit and
owner/delegate rationale are attached there; acceptance moves an exact validated copy
to `accepted/cluster-decisions/` with reviewer/timestamp. Rejection records a reason.
There is no direct materializer path from the proposed directory.

### Step 3: The supersedence rule (post-event evidence only) + version-safe resolution

Encode EXACTLY this rule (code comment cites this plan):

An **accepted `same_occurrence` cluster** resolves to REALIZED iff some member
("the resolver") satisfies ALL of:
1. realized lifecycle_phase (realizedLifecyclePhases set);
2. its timeline relation(s) carry `assertion_status: "delivered"`;
3. its source's `published_date_normalized` interval START is ON/AFTER the claimed
   operational date (e.g. pub `2025-07` starts 2025-07-01 ≥ 2025-06-29 ✓; pub
   `2025-05-28` < 2025-06-29 ✗ — this is precisely why `meeting_doc_174141` MUST NOT
   resolve anything);
4. the resolver's own date is precise (day|month).
`resolved_date` = the resolver's date (most precise wins; ties → later publication).
No qualifying resolver → `resolved_status: "planned_unconfirmed"`, no date, nothing
else changes.

Write the full resolution provenance to
`resolved-occurrence-seeds.jsonl`: `resolved_status`, `resolved_date`,
`resolved_date_precision`, durable `resolution_cluster_id`, resolver event/relation
ids, source ids, publishers/authority, evidence refs, and accepted cluster-decision id.

Perform ELIGIBILITY RECLASSIFICATION **in the resolved seed, not in anchor v1**. The
seed's `effective_temporal_role` becomes `realized_operational`; the resolver date is
inserted into a structured effective candidate list before selection; raw/normalized/
precision/source-field values stay internally consistent; effective exclusions
`non_realized_operational_date` and `status_as_of_only` are lifted. Resolver event and
relation evidence, timeline relation ids, source ids, publishers/authority,
assertion/truth/review state, evidence coverage, and conflict states are recomputed in
the seed from the complete provenance set. A still-conflicting date set keeps its
conflict exclusion. ALL OTHER effective exclusions — every scope/evidence/authority
gate — remain exactly as computed.

The same source records serialized through `operational_anchors.jsonl` v1 retain their
document-time `temporal_role`, candidate date/provenance, evidence refs, exclusions,
and `study_eligible` value from the plan-030/029 baseline. Do not add resolution keys,
new counters, resolver evidence, or changed temporal meaning to schema-version-1
rows/summary. Coverage-matrix reads the seed for `rows_resolution_reclassified` and
`clusters_{total,quarantined}`; plan 032 publishes the effective layer under the new
occurrence contract.

**Verify** (local recompute, no release cut): the two Queens 170921 observations yield
internal resolved seeds with status `realized`, resolved dates 2025-06-29 /
2025-08-31, resolution evidence pointing at the CURATED post-event records (NOT at
174141);
`effective_temporal_role: "realized_operational"`; their effective exclusion lists no longer contain
`non_realized_operational_date` but STILL contain the scope exclusions (honest
statement: Queens now fails only on scope — route rosters are plan 033's acquisition
target); a synthetic fixture with ONLY a pre-launch realized-lifecycle member (the
174141 shape) resolves to `planned_unconfirmed` and is NOT reclassified.
Also compare serialized v1 rows/summary before vs after this plan: they must be
byte-identical, not merely strict-decodable. There must be zero excess keys, no
`resolution` role, and no cross-source reinterpretation of `temporal_role`.

### Step 4: Relate to the existing resolved_status view

For subject-sharing clusters, cross-check against `resolved_status_view`
(schema.ts:323) via an existing view-consumer pattern; emit `view_disagreements` into
the cluster artifact instead of silently preferring either. If wiring the view is
disproportionate under frozen-producer constraints, document that decision in the
module header + PR.

### Step 5: Gates, LOG, AGENTS.md

LOG entry: rule text, accepted/quarantined counts, reclassified seeds (expect ≥2 from
Queens), the explicit v1 compatibility rule, and the note that scope gates are
untouched. Narrow AGENTS.md:227 to what remains true.

## Test plan

- Cluster tests: primary-rule formation, token-subset secondary + quarantine,
  date-stripping edge cases, determinism; accepted-decision overlap/dangling-evidence
  rejection; stable decision identity under route/treatment/date/status enrichment,
  provenance growth, and input reordering; explicit merge/split alias behavior.
- Supersedence tests (the core): (a) post-event delivered resolver → effective seed
  reclassified with resolution evidence; (b) PRE-event realized-lifecycle member only (174141 shape) →
  `planned_unconfirmed`, NOT reclassified; (c) resolver with imprecise date → not
  reclassified; (d) scope exclusions survive reclassification verbatim; (e) internal
  seed/coverage counters (not schema-v1 summary keys).
- End-to-end Queens fixture built from the post-030 corpus shapes, including an
  accepted cluster decision; removing that decision must make reclassification zero.
- Frozen schema-v1 serialization fixture: complete row+summary bytes and document-time
  meanings remain identical before/after resolution; legacy strict decoder still accepts.
- Model on `operational-anchors.test.ts` builders.

## Done criteria

- [ ] Cluster artifact deterministic; Queens Phase 1+2 clusters form under the PRIMARY rule; precision audit shipped with zero known false-merges
- [ ] 100% of eligibility-changing clusters have accepted, evidence-bound decisions;
  undecided/quarantined clusters reclassify zero rows; cluster ids survive all
  enrichment/provenance/reordering fixtures
- [ ] Supersedence rule implemented exactly as specified; all five test classes pass; the 174141-shape fixture provably does NOT resolve
- [ ] Local recompute: ≥2 Queens resolved seeds reclassified realized with post-event
  citations; effective scope exclusions intact; internal `rows_resolution_reclassified` ≥ 2
- [ ] Serialized v1 rows/summary remain byte-identical for ALL rows, including resolved
  clusters; richer resolution values/evidence exist only in the internal seed pending 032
- [ ] No committed release touched
- [ ] All four gates green; LOG + AGENTS.md updated; `plans/README.md` row updated

## STOP conditions

- The drift-check Queens query returns zero delivered relations (030 Tier B not
  landed) — hard dependency, stop immediately.
- Zero known false-merges is unreachable without near-zero recall — ship
  quarantine-heavy and report the tension; never tune silently.
- Owner/delegate has not accepted every eligibility-changing cluster → leave those
  clusters quarantined and the plan IN PROGRESS; never let a heuristic change
  eligibility by itself.
- Any anchor-v1 byte/value changes are required to implement resolution → stop and
  keep the effective output in the internal seed; plan 032 owns the new resource.
- You are tempted to edit an event's lifecycle_phase/date to fix a cluster — hard
  stop; that is the document-time layer.
- Reclassified-seed count exceeds ~30 on first run — the rule is looser than designed;
  audit every flip before shipping.

## Maintenance notes

- Plan 032 consumes **accepted** clusters and resolved seeds, must inherit the
  post-event rule verbatim, and productionizes the versioned provenance fields;
  plan 034's acceptance counts reclassified rows among its deltas.
- New curated/acquired post-event sources (030/033) create cluster-amendment
  candidates; after explicit acceptance they can only ADD resolutions. The rule plus
  accepted-decision history is monotone; the determinism anchor and test (b) guard
  regressions.
- Reviewer: check the rule implementation against the Step-3 text clause by clause;
  clause 3's publication-interval comparison is where a subtle bug would mint false
  realized statuses again.
