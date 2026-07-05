# Plan 023: Record pages — compact metadata header, collapsible detail panels, related-pages navigation

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP
> conditions" section occurs, stop and report — do not improvise. When done, update the status
> row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 09972d0f..HEAD -- packages/pipeline/src/site packages/pipeline/test/site`
> Plans 021/022 legitimately change these files — confirm their work is present (htmlShell
> options object, `SITE_BASE_URL`, `context.sourcePageIds`). If absent, STOP: dependency
> not met. Then compare this plan's "Current state" excerpts (which are from BEFORE 021/022)
> against the live `renderRecordPage`/`payloadSummary`/`evidenceRows` — 021 only touched the
> eyebrow line and the `evidenceRows` link guard inside them; if they differ beyond that,
> STOP and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the renderer for all 2,395 record pages; size caps and the existing
  citation-table cap behavior must survive exactly)
- **Depends on**: plans/021-site-shell-search-and-chrome.md (022 recommended first for clean
  sequencing, not technically required)
- **Category**: direction (publication polish)
- **Planned at**: commit `09972d0f`, 2026-07-05

## Why this matters

A route/corridor/project page today is: title, writer prose, then a raw "Structured Data"
table dump (up to 24 payload keys) and a flat "Citations" table (up to hundreds of rows) —
the reader gets a wall of tables instead of an at-a-glance record. And there is no lateral
navigation at all: the canonical database holds 20,637 relation edges, but a route page never
links the corridors it runs on or the projects that touched it. This plan gives every record
page a compact metadata header (key facts, status chips, source chips, linked-record counts),
folds the big tables into `<details>` disclosure panels (JS-free), and adds a "Related pages"
panel derived from the relations table.

## Current state

The exporter is `packages/pipeline/src/site/export-site.ts` (single file). Relevant excerpts
as of commit `09972d0f` (plan 021 changes only the eyebrow line and adds a
`sourcePageIds` guard inside `evidenceRows`):

`renderRecordPage` (lines 268–298) — the whole record page body:

```ts
function renderRecordPage(record: MtaCanonicalRecord, markdown: string, path: string, context: SiteRenderContext) {
  const url = recordUrl(record)!;
  const large = Buffer.byteLength(markdown) > LARGE_MARKDOWN_CAP_BYTES;
  const writer = writerRegionBody(markdown);
  const writerBytes = Buffer.byteLength(writer);
  const renderedWriter = large && writerBytes > LARGE_WRITER_CAP_BYTES ? writer.slice(0, LARGE_WRITER_CAP_BYTES) : writer;
  const bodyHtml = writer
    ? markdownToHtml(renderedWriter, url, context)
    : `<p class="empty-writer">Writer prose has not been added yet. ...</p>`;
  const blob = wikiBlobUrl(path, context.githubBaseUrl);
  const capNote = large ? `<p class="cap-note">This generated markdown is large; ...</p>` : "";
  const writerCapNote = /* similar */;
  const body = [
    `<article class="record-page ${attr(record.record_kind)}">`,
    `<p class="eyebrow">${htmlEscape(record.record_kind)}</p>`,
    `<h1>${htmlEscape(pageTitle(record))}</h1>`,
    `<p class="record-id">${htmlEscape(record.record_id)}</p>`,
    capNote,
    bodyHtml,
    writerCapNote,
    payloadSummary(record),
    evidenceRows(record, context, url, large ? TABLE_ROW_CAP : undefined, large ? blob : undefined),
    `</article>`,
  ].join("\n");
  return htmlShell(pageTitle(record), body, url);
}
```

`payloadSummary` (lines 219–227) — the raw table dump this plan demotes into a panel:

```ts
function payloadSummary(record: MtaCanonicalRecord) {
  const rows = Object.entries(record.payload)
    .filter(([key, value]) => !key.startsWith("_") && value !== undefined)
    .slice(0, 24)
    .map(([key, value]) => `<tr><th>${htmlEscape(key)}</th><td>${htmlEscape(compactJson(value as JsonValue)).slice(0, 500)}</td></tr>`)
    .join("\n");
  if (!rows) return "";
  return `<section class="facts"><h2>Structured Data</h2><table>${rows}</table></section>`;
}
```

`evidenceRows` (lines 187–217) returns
`<section class="evidence" data-pagefind-ignore><h2>Citations</h2>` + optional cap note
(`showing 200 of N - full data in the repository`) + a 5-column table. The existing site test
asserts the strings `showing 200 of 250`, `quote 200`, and the absence of `quote 201` on a
large fixture page — that logic must survive inside the new panel.

Context type (after plan 021): `SiteRenderContext = { recordsById; sourceById; githubBaseUrl; sourcePageIds }`.
Exporter reads records via `readCanonicalRecordsFromDbFile(dbPath)`; the pipeline package
already imports from `@mta-wiki/db` (`types` in this file; the site test imports
`rebuildCanonicalDb` from `@mta-wiki/db/canonical-db`).

The SQLite database also holds a `relations` table this plan reads (schema from
`packages/db/src/schema-ddl.ts`; user_version 4):
columns `record_id, relation_kind, raw_relation_kind, relation_family, subject_id, object_id, provenance, derivation_rule, canonicalize_decision_id, assertion_status, as_of_date`.
`subject_id`/`object_id` are enforced FKs into `records`. ~20,637 rows. Example kinds touching
a route: `has_metric`, `serves_route`, `operates_on_corridor`, `has_claim`, `replaced_by`,
`operated_by`, `has_timeline_event`, `connects_to`.

How relation rows get into a **test fixture** db: `rebuildCanonicalDb(records, …)` (from
`@mta-wiki/db/canonical-db`) projects every record with `record_kind === "relation"` whose
`payload.subject_id` and `payload.object_id` both name existing records:

```ts
// canonical-db.ts (pass 2)
const subjectId = asString(payload.subject_id);
const objectId = asString(payload.object_id);
if (!subjectId || !objectId || !recordIds.has(subjectId) || !recordIds.has(objectId)) { skipped…; continue; }
insertRelation.run(record.record_id, String(payload.relation_kind ?? ""), …, String(payload.relation_family ?? "other"), subjectId, objectId, …);
```

So a fixture relation is just:
`record("rel_1", "relation", { subject_id: "route_m1", object_id: "corridor_a", relation_kind: "operates_on_corridor" })`
(`relation_family` defaults to `"other"`, which passes the CHECK constraint).

Payload facts available for the metadata header (live key frequencies):

- **route** (319): `route_id` 309, `route_type_normalized` 319, `borough_normalized` 249,
  `service_variant` 214, `description` 260.
- **project** (1,859): `project_family` 1,859, `project_type` 1,675, `status` 1,619 (free
  text: proposed/completed/planned/ongoing/…), `document_time_status` 1,842,
  `borough_normalized` 349, `date_normalized` sparse (~5%), `date_precision` 1,859.
- **corridor** (218): `street` 108, `from` 95, `to` 93, `limits` 109, `borough_normalized` 174.
- All records: `truth_status` (e.g. `source_stated`), `review_state` (e.g. `unreviewed`),
  `evidence_refs` (array; each has `source_id`, optional `block_id`), `display_name`.

Conventions: everything through `htmlEscape`/`attr`; deterministic sorts (`localeCompare` /
`record_id` tie-breaks); single-file exporter; tests extend
`packages/pipeline/test/site/export-site.test.ts` using its `record`/`writePage`/`fixtureRoot`
helpers; `<details>`/`<summary>` are the collapse mechanism — no JavaScript.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Site tests | `bun test packages/pipeline/test/site/` | all pass |
| Full export (final step only) | `bun run export:site` | exit 0, counts unchanged |

## Scope

**In scope** (the only files you should modify):
- `packages/pipeline/src/site/export-site.ts`
- `packages/pipeline/test/site/export-site.test.ts`

**Out of scope** (do NOT touch):
- `renderSourcePage` and source-page rendering (plan 024 owns it)
- `homePage`, `searchPage`, `indexPage`, `sourcesIndex` (plans 021/022 own them)
- `wiki/**`, `data/canonical/**`, `docs/immutable-mta-llm-wiki-spec.md`, `raw/**`
- `packages/db/**` (read the relations table via the existing `openCanonicalDb`; do not add
  db-package helpers)
- Any new dependency

## Git workflow

- Same worktree/branch as plans 021/022. One commit: `Site: record page metadata + related panels`.
- Do NOT push or merge; never commit `dist/` or `data/canonical.db`.

## Steps

### Step 1: Read relation edges at export time

In `export-site.ts`:

1. Import: `import { openCanonicalDb } from "@mta-wiki/db/canonical-db";`
2. Add:
   ```ts
   type RelationEdge = { subject_id: string; object_id: string; relation_kind: string };
   function readRelationEdges(dbPath: string): RelationEdge[] {
     const db = openCanonicalDb(dbPath, { readonly: true });
     try {
       return db
         .query("SELECT subject_id, object_id, relation_kind FROM relations ORDER BY subject_id, object_id, relation_kind")
         .all() as RelationEdge[];
     } finally {
       db.close();
     }
   }
   ```
3. In `exportSite()`, after `records` is read, call `const relationEdges = readRelationEdges(dbPath);`.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Build related-page and linked-count maps

Still in `exportSite()`, after the four `*Records` lists exist:

```ts
const pageBearingIds = new Set([...routeRecords, ...corridorRecords, ...projectRecords].map((r) => r.record_id));
type RelatedEntry = { id: string; kind: string; title: string; url: string; relation: string };
const relatedByRecordId = new Map<string, RelatedEntry[]>();
const linkedKindCounts = new Map<string, Map<string, number>>();
const addRelated = (fromId: string, other: MtaCanonicalRecord, relation: string) => { /* push {id, kind, title: pageTitle(other), url: recordUrl(other)!, relation} onto relatedByRecordId.get(fromId), dedupe by other.record_id keeping the first relation label */ };
for (const edge of relationEdges) {
  const subject = context.recordsById.get(edge.subject_id);
  const object = context.recordsById.get(edge.object_id);
  if (!subject || !object) continue;
  for (const [me, other] of [[subject, object], [object, subject]] as const) {
    if (!pageBearingIds.has(me.record_id)) continue;
    // linked-record counts: every relation partner counts by kind (metric_claim, claim, event, …)
    const counts = linkedKindCounts.get(me.record_id) ?? new Map();
    counts.set(other.record_kind, (counts.get(other.record_kind) ?? 0) + 1);
    linkedKindCounts.set(me.record_id, counts);
    // related PAGES: only partners that themselves have pages
    if (pageBearingIds.has(other.record_id)) addRelated(me.record_id, other, edge.relation_kind);
  }
}
```

Then sort each `relatedByRecordId` list deterministically (`title` `localeCompare`, then
`id`), and pass both maps into the render context: extend `SiteRenderContext` with
`relatedByRecordId: Map<string, RelatedEntry[]>` and
`linkedKindCounts: Map<string, Map<string, number>>` (build `context` after these maps, or
assign onto it before rendering — either is fine as long as types are exact). The site
fixture test that builds tiny dbs will exercise the empty-map path automatically.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Compact metadata header

Add two helpers near `payloadSummary`:

```ts
const KIND_FACT_KEYS: Record<string, string[]> = {
  route: ["route_id", "route_type_normalized", "route_type", "borough_normalized", "borough", "service_variant"],
  project: ["project_family", "project_type", "status", "document_time_status", "borough_normalized", "borough", "date_normalized"],
  corridor: ["street", "from", "to", "limits", "borough_normalized", "borough"],
};
function metaFacts(record: MtaCanonicalRecord): Array<[string, string]> { /* walk KIND_FACT_KEYS[record.record_kind] ?? [], asString each payload value, skip missing, skip a *_normalized/raw pair duplicate (if borough_normalized present skip borough; if route_type_normalized present skip route_type), cap each value at 120 chars, return [key, value] pairs */ }
```

In `renderRecordPage`, replace the current `eyebrow / h1 / record-id` block with a header
section (keep the pagefind filter attribute from plan 021 on the eyebrow):

```html
<nav class="crumbs"><a href="../index.html">Home</a> / <a href="../{dir}.html">{Kind}s</a> / <span>{title}</span></nav>
<p class="eyebrow" data-pagefind-filter="kind">{record_kind}</p>
<h1>{title}</h1>
<p class="record-id">{record_id}</p>
<div class="chips">
  <span class="chip">{truth_status}</span>
  <span class="chip">{review_state}</span>
  {for each metaFacts pair whose key is status|document_time_status: a chip "key: value"}
</div>
<dl class="meta-grid">{for each remaining metaFacts pair: <dt>{key}</dt><dd>{value}</dd>}</dl>
<p class="cite-line">Cited from {N} sources · {M} citations{linked-count suffix}</p>
<div class="source-chips">{up to 12 distinct evidence source chips}{+K more}</div>
```

Where:
- `{dir}` comes from `recordDir(record.record_kind)`; record pages are one level deep so the
  `../` prefix is constant here.
- `N` = distinct `evidence_refs[].source_id` count; `M` = `record.evidence_refs.length`.
- linked-count suffix: from `context.linkedKindCounts.get(record.record_id)` — render
  ` · linked records: 13 metric_claim · 4 claim · 1 event` (kinds sorted by count desc then
  name asc; skip section entirely when the map is empty; humanize by replacing `_` with a
  space).
- Source chips: first occurrence order of `evidence_refs[].source_id`; each chip is a link to
  `../sources/{source_id}.html` **only when** `context.sourcePageIds.has(source_id)` (plan
  021's set), otherwise a plain `<span class="chip">`; label = `sourceTitle(...)` truncated
  to 60 chars; cap 12 chips then `<span class="chip chip-more">+K more</span>`.

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Fold the tables into `<details>` panels

1. Change `payloadSummary` to return
   `<details class="panel"><summary>Structured data ({K} fields)</summary><section class="facts"><table>…</table></section></details>`
   where `K` is the number of rendered rows (keep the 24-key cap, `compactJson`, and the
   500-char cell truncation exactly as-is; keep returning `""` when empty).
2. Change `evidenceRows` to return
   `<details class="panel" data-pagefind-ignore><summary>Citations ({M})</summary><section class="evidence">…existing note + table…</section></details>`
   — keep the cap-note logic (`showing 200 of N - full data in the repository`), the plan-021
   unresolved-source guard, and the column set byte-for-byte. `data-pagefind-ignore` moves to
   the `<details>` element. `{M}` is the full `refs.length` (not the capped row count).
   Keep returning `""` when there are no refs.
3. `renderRecordPage` keeps calling both in the same order after the writer prose. Do NOT add
   the `open` attribute — panels default closed; that's the point.

**Verify**: `bun run typecheck` → exit 0. `bun test packages/pipeline/test/site/` — the
pre-existing large-page assertions (`showing 200 of 250`, `quote 200`, no `quote 201`) must
still pass.

### Step 5: Related pages panel

In `renderRecordPage`, after the details panels, when
`context.relatedByRecordId.get(record.record_id)` is non-empty, render:

```html
<section class="related"><h2>Related pages</h2>
  {group entries by entry.kind in fixed order route, corridor, project:}
  <div class="related-group"><h3>{Kind}s</h3>
    <ul>{up to 12: <li><a href="{relative url}" title="{relation}">{title}</a></li>}</ul>
    {when more than 12: <p class="cap-note-inline">+{K} more not shown</p>}
  </div>
</section>
```

Use `relativeRecordUrl(url, entry.url)` for hrefs (`url` is the current page's url — same
mechanism the rest of the file uses). Humanize `{relation}` in the title attribute
(`operates_on_corridor` → `operates on corridor`).

Also pass a per-record `description` to `htmlShell` (plan 021's options):
`` `${record.record_kind} ${pageTitle(record)} — structured MTA Wiki record with ${M} citations from ${N} sources.` ``

**Verify**: `bun run typecheck` → exit 0.

### Step 6: CSS

Append to `css()`:

- `.crumbs{font-size:.85rem;color:var(--muted);margin-bottom:8px}.crumbs a{color:var(--muted)}`
- `.chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.chip{border:1px solid var(--line);background:var(--panel);padding:2px 10px;font-size:.82rem;border-radius:999px;color:var(--muted)}.chip a{text-decoration:none}.chip-more{border-style:dashed}`
- `.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:4px 18px;margin:12px 0;border:1px solid var(--line);background:var(--panel);padding:12px 14px}.meta-grid dt{font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.meta-grid dd{margin:0 0 8px;overflow-wrap:anywhere}`
- `.cite-line{color:var(--muted);font-size:.9rem}`
- `.source-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 18px}`
- `details.panel{border:1px solid var(--line);background:var(--panel);margin:18px 0}details.panel summary{cursor:pointer;padding:10px 14px;font-weight:600}details.panel[open] summary{border-bottom:1px solid var(--line)}details.panel section{padding:0 14px 14px}details.panel h2{display:none}`
  (drop the inner `<h2>`s from the panel sections instead of hiding them, if simpler — either
  way no duplicate visible heading).
- `.related-group ul{list-style:none;padding:0;margin:6px 0;display:flex;flex-wrap:wrap;gap:8px}.related-group li a{border:1px solid var(--line);background:var(--panel);padding:4px 10px;display:inline-block;text-decoration:none}.cap-note-inline{color:var(--muted);font-size:.85rem}`

**Verify**: `bun run typecheck` → exit 0.

### Step 7: Tests + export

Extend the test file (Test plan below); run site tests; one full export; size checks.

**Verify**:
- `bun test packages/pipeline/test/site/` → all pass.
- `bun run export:site` → exit 0, counts unchanged.
- `grep -c "<details" dist/site/routes/route_m86-sbs.html` → ≥ 2; `grep -c "Related pages" dist/site/routes/route_m86-sbs.html` → ≥ 0 (spot-read the page; the M86 route has `operates_on_corridor` edges so expect ≥ 1).
- `find dist/site -name "*.html" -size +3M` → empty (the two giant project pages MUST stay under 3 MB); `du -s dist/site` < 900 MB.

## Test plan

New `it` blocks in `packages/pipeline/test/site/export-site.test.ts`:

1. **Metadata header**: fixture route with
   `{ route_id: "M1", borough_normalized: "Manhattan", route_type_normalized: "sbs" }` →
   page contains `<dt>route_id</dt><dd>M1</dd>`, chips for `source_stated` and `unreviewed`,
   and a `cite-line` with the fixture's citation count.
2. **Details panels**: page contains `<details class="panel"><summary>Structured data` and
   `<summary>Citations (250)` (the big fixture); `data-pagefind-ignore` sits on the citations
   `<details>`; the existing `showing 200 of 250` cap-note still renders inside it.
3. **Related pages both directions**: add
   `record("rel_1", "relation", { subject_id: "route_m1", object_id: "corridor_a", relation_kind: "operates_on_corridor" })`
   to the fixture db → the route page links `../corridors/corridor_a.html` inside a
   `Related pages` section, and the corridor page links `../routes/route_m1.html`.
4. **Linked-record counts**: the fixture already has `metric_speed` (a `metric_claim`); add
   `record("rel_2", "relation", { subject_id: "route_m1", object_id: "metric_speed", relation_kind: "has_metric" })`
   → route page `cite-line` contains `linked records: 1 metric claim`; `metric_speed` does
   NOT appear in Related pages (no page-bearing partner).
5. **Source chips**: route page contains a chip linking `../sources/source_a.html`.
6. **Breadcrumbs + description**: page contains `class="crumbs"` with `Home` and a
   `name="description"` containing `citations from`.
7. **Determinism**: existing double-export byte-equality keeps passing (it re-renders the
   route page — no change needed, just don't break it).

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun test packages/pipeline/test/site/` passes, including the 7 areas above
- [ ] `bun run export:site` exits 0 with unchanged page counts (318/218/1859/2561)
- [ ] `find dist/site -name "*.html" -size +3M` empty; `du -s dist/site` < 900 MB
- [ ] A spot-read of `dist/site/routes/route_m86-sbs.html` shows: crumbs, chips, meta grid, cite-line, source chips, writer prose, two closed `<details>` panels, and a Related pages section
- [ ] `git status` shows modifications ONLY to the two in-scope files
- [ ] `plans/README.md` row updated (skip if your dispatcher maintains the index)

## STOP conditions

- Plans 021's changes are absent (dependency not met).
- The pre-existing cap assertions (`showing 200 of 250` etc.) or the determinism test fail
  after one fix attempt.
- Any exported HTML file exceeds 3 MB (the 65 MB / 35 MB project markdown sources are the
  risk — their citation tables must stay capped inside the panel).
- `readRelationEdges` needs schema access that `openCanonicalDb` doesn't provide (would mean
  touching `packages/db/**` — out of scope; report instead).
- Anything in "Current state" doesn't match the live code beyond plan-021/022's documented
  edits.

## Maintenance notes

- `KIND_FACT_KEYS` is a display whitelist — extending it is safe and cheap; keep
  `*_normalized`-over-raw preference when adding pairs.
- The related panel intentionally links only page-bearing kinds (route/corridor/project).
  If entities ever get pages, add `entity` to `pageBearingIds` and the group order.
- Linked-record counts double-count nothing today (each relation edge contributes one
  partner), but if relation records themselves ever become page-bearing this logic should
  skip `other.record_kind === "relation"`.
- Reviewers should scrutinize: the two pathological project pages
  (`project_lirr-mnr-ptc`, `project_jamaica-capacity-improvements`) — open their HTML after
  export and confirm the panels collapsed and the file size is unchanged-ish (~within the
  cap).
