# Plan 022: Homepage research workbench — search hero, corpus stats, featured pages, provenance

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP
> conditions" section occurs, stop and report — do not improvise. When done, update the status
> row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 09972d0f..HEAD -- packages/pipeline/src/site packages/pipeline/test/site`
> Plan 021 legitimately changes these files — confirm plan 021's work is present (htmlShell
> takes an options object; `SITE_BASE_URL` exists; `search.html` is written). If plan 021's
> changes are ABSENT, STOP — this plan depends on them.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (one function rewrite + pure derived stats; no data-layer change)
- **Depends on**: plans/021-site-shell-search-and-chrome.md
- **Category**: direction (publication polish)
- **Planned at**: commit `09972d0f`, 2026-07-05

## Why this matters

The current homepage is 1,004 bytes: four count tiles and two bare links. It gives a visitor
no way to search, no sense of what the corpus contains, no starting points, and no statement
of where the data comes from. This plan turns it into a research workbench: a prominent search
box, browse entry points, honest corpus statistics computed from the canonical database at
build time, deterministic "most documented" featured lists (routes / corridors / projects),
and a concise provenance note. Everything is static and derived — no hardcoded numbers that
rot.

## Current state

The static site exporter is `packages/pipeline/src/site/export-site.ts` (single file; inline
template literals; one `css()` string; strictly deterministic output — an existing test
asserts byte-identical double export). Plan 021 has already landed in your working tree:
`htmlShell(title, body, currentUrl, options?)` with `description`/`headExtra`, a global
header search form, footer, `SITE_BASE_URL`, `search.html`, sitemap.

The homepage function as it exists at commit `09972d0f` (lines 335–348; plan 021 does not
change it):

```ts
function homePage(counts: SiteExportResult["pages"]) {
  const body = `<section class="home">
<h1>MTA Wiki</h1>
<p>Structured v1 records and citations for MTA and NYC bus-priority knowledge.</p>
<div class="home-grid">
<a href="routes.html"><strong>${counts.routes}</strong><span>Routes</span></a>
<a href="corridors.html"><strong>${counts.corridors}</strong><span>Corridors</span></a>
<a href="projects.html"><strong>${counts.projects}</strong><span>Projects</span></a>
<a href="sources.html"><strong>${counts.sources}</strong><span>Source citation targets</span></a>
</div>
<p><a href="graph.html">Graph</a> <a href="primitives.html">Primitives</a></p>
</section>`;
  return htmlShell("Home", body, "/index.html");
}
```

Its only call site, in `exportSite()` (line ~459):

```ts
writeFile(join(outDir, "index.html"), homePage({ routes: routeRecords.length, corridors: corridorRecords.length, projects: projectRecords.length, sources: sourceRecords.length }));
```

Facts about the data available inside `exportSite()` (all already in memory — `records` is
the full `MtaCanonicalRecord[]` from `readCanonicalRecordsFromDbFile`):

- Record kinds and live counts: metric_claim 36,530; relation 20,637; claim 8,928; event
  7,945; treatment_component 2,648; source 2,566; entity 1,894; project 1,859; source_gap
  480; route 319; corridor 218. Total ≈ 84,024. Only route/corridor/project/source get pages.
- Every record has `evidence_refs: MtaEvidenceRef[]` (corpus-wide total ≈ 132,500). Each ref
  has `source_id` and optional `block_id` / `source_quote`.
- `record.payload.description` exists on many records (260/319 routes, 1,834/1,859 projects,
  208/218 corridors); `record.raw_text` is a fallback one-liner on most records.
- `display_name` is the page title (`pageTitle(record)` helper, line 73).
- Highest-evidence routes today (sanity reference for the featured rule):
  `route_q53-sbs-ace` (90 refs), `route_q52-sbs-queens` (90), `route_utica-ave-sbs` (79).
- The wiki's live provenance language (README.md): "Source documents are public NYC/MTA
  government records obtained from public agency websites. Extracted text and derived data
  are provided for research and reference. To request a correction or takedown, open a GitHub
  issue." Reuse this vocabulary — do not invent new claims about the data.

Conventions: all text through `htmlEscape()`; deterministic sorts only (numeric desc, then
`record_id` ascending as tie-break); keep everything inside `export-site.ts`; tests extend
`packages/pipeline/test/site/export-site.test.ts` (fixture helpers `record` / `writePage` /
`fixtureRoot`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Site tests | `bun test packages/pipeline/test/site/` | all pass |
| Full export (only if asked in a step) | `bun run export:site` | exit 0, counts unchanged |

(Worktree setup — `bun install`, `cp /mnt/models/dev/mta-wiki/data/canonical.db data/canonical.db` —
is a plan-021 Step 0 concern; it is already done if you executed 021 in this worktree.)

## Scope

**In scope** (the only files you should modify):
- `packages/pipeline/src/site/export-site.ts`
- `packages/pipeline/test/site/export-site.test.ts`

**Out of scope** (do NOT touch):
- `wiki/**`, `data/canonical/**`, `docs/immutable-mta-llm-wiki-spec.md`, `raw/**`
- `wiki/graph.html` / `wiki/primitives.html` (still copied verbatim; keep linking to them)
- Record/source page renderers (`renderRecordPage`, `renderSourcePage`) — plans 023/024 own
  those; touching them here creates merge noise
- `package.json`, CLI files, any new dependency

## Git workflow

- Same worktree/branch as plan 021. One commit: `Site: homepage research workbench`.
- Do NOT push or merge; never commit `dist/` or `data/canonical.db`.

## Steps

### Step 1: Derive homepage data in `exportSite()`

Above the `writeFile(... "index.html" ...)` call, compute (plain in-memory derivations from
`records` and the already-filtered `routeRecords` / `corridorRecords` / `projectRecords` /
`sourceRecords`):

```ts
const kindCounts = new Map<string, number>();
for (const record of records) kindCounts.set(record.record_kind, (kindCounts.get(record.record_kind) ?? 0) + 1);
const evidenceRefTotal = records.reduce((sum, record) => sum + record.evidence_refs.length, 0);

function featured(list: MtaCanonicalRecord[], limit: number) {
  return [...list]
    .sort((a, b) => b.evidence_refs.length - a.evidence_refs.length || a.record_id.localeCompare(b.record_id))
    .slice(0, limit)
    .map((record) => ({
      title: pageTitle(record),
      url: recordUrl(record)!,
      evidence: record.evidence_refs.length,
      blurb: blurbFor(record),
    }));
}
```

Add a top-level helper (near `pageTitle`):

```ts
function blurbFor(record: MtaCanonicalRecord) {
  const text = asString(record.payload.description) ?? record.raw_text ?? "";
  if (text.length <= 160) return text;
  const cut = text.slice(0, 160);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 80 ? space : 160)}…`;
}
```

Featured limits: routes 6, corridors 4, projects 6.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Rewrite `homePage()`

New signature:

```ts
function homePage(data: {
  counts: SiteExportResult["pages"];
  stats: { records: number; evidenceRefs: number; metricClaims: number; relations: number; events: number; claims: number };
  featured: { routes: FeaturedEntry[]; corridors: FeaturedEntry[]; projects: FeaturedEntry[] };
})
```

(`type FeaturedEntry = { title: string; url: string; evidence: number; blurb: string }` —
declare it near the other types.)

Body layout, top to bottom (all values escaped; counts formatted with
`n.toLocaleString("en-US")` — fixed locale, so determinism holds):

1. **Hero**: `<h1>MTA Wiki</h1>`, one tagline `<p>` — reuse the provenance vocabulary:
   "Structured, source-cited records about MTA and NYC bus-priority routes, corridors, and
   projects — extracted from public government documents." Then a search form (same shape as
   the plan-021 header form but larger): `<form class="home-search" action="search.html" method="get" role="search"><input type="search" name="q" placeholder="Search routes, projects, corridors, sources…" aria-label="Search the wiki"><button type="submit">Search</button></form>`.
2. **Browse grid**: keep the existing four `home-grid` tiles (Routes / Corridors / Projects /
   Sources with counts) exactly as today, plus two more tiles linking `graph.html`
   ("Relation graph") and `primitives.html` ("Primitive reference") without counts —
   `<strong>→</strong>` as the tile figure keeps markup uniform.
3. **Corpus stats strip**: `<section class="home-stats"><h2>What's inside</h2>` + a `<ul>` of
   six `<li><strong>{n}</strong><span>{label}</span></li>` entries: canonical records
   (stats.records), evidence citations (stats.evidenceRefs), metric claims, relations,
   events, claims. One trailing `<p>` line: "Counts are computed from the canonical database
   at export time."
4. **Featured sections**: for routes, corridors, projects each:
   `<section class="home-featured"><h2>Most documented {kind}s</h2><ol>` where each entry is
   `<li><a href="{url}">{title}</a><span class="featured-evidence">{evidence} citations</span><p>{blurb}</p></li>`
   (omit the `<p>` when blurb is empty). Then a "All {N} {kind}s →" link to the category
   index. URLs from `recordUrl` are root-relative (`/routes/x.html`) — the homepage lives at
   the root, so strip the leading slash (`url.replace(/^\//u, "")`), matching how the
   existing `home-grid` links work.
5. **Provenance note**: `<section class="home-provenance"><h2>Where this data comes from</h2>`
   with two short `<p>`s: (a) sources are public NYC/MTA government records obtained from
   public agency websites; every structured record cites evidence blocks in the source
   documents, and source pages are exported as citation targets; (b) extraction is
   LLM-assisted and may contain errors; extracted text and derived data are provided for
   research and reference — link "open a GitHub issue" to
   `https://github.com/mannyc2/mta-wiki/issues` for corrections/takedowns. Keep it to those
   claims; do not add new ones.
6. Pass `description: "Research workbench for MTA and NYC bus-priority knowledge: searchable, source-cited routes, corridors, projects, and source documents."`
   in the `htmlShell` options.

Update the call site to pass the new `data` object.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: CSS

Append to `css()` (match the terse style):

- `.home-search{display:flex;gap:8px;margin:20px 0;max-width:560px}.home-search input{flex:1;border:1px solid var(--line);padding:12px 14px;font:inherit}.home-search button{border:1px solid var(--accent);background:var(--accent);color:#fff;padding:12px 18px;font:inherit;cursor:pointer}`
- `.home-stats ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;list-style:none;margin:16px 0;padding:0}.home-stats li{border:1px solid var(--line);background:var(--panel);padding:14px}.home-stats strong{display:block;font-size:1.5rem}.home-stats span{color:var(--muted);font-size:.85rem}`
- `.home-featured ol{list-style:none;margin:12px 0;padding:0}.home-featured li{border-bottom:1px solid var(--line);padding:12px 0}.home-featured p{margin:4px 0 0;color:var(--muted);font-size:.92rem}.featured-evidence{color:var(--muted);font-size:.85rem;margin-left:10px}`
- `.home-provenance{border:1px solid var(--line);background:var(--panel);padding:18px 20px;margin-top:36px}.home-provenance p{margin:8px 0;color:var(--muted)}`

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Tests + export

Extend the test file (Test plan below), run site tests, then one full export.

**Verify**:
- `bun test packages/pipeline/test/site/` → all pass.
- `bun run export:site` → exit 0, counts unchanged (`routes=318, corridors=218, projects=1859, sources=2561`).
- `grep -c "home-search" dist/site/index.html` → ≥ 1; `grep -c "Most documented" dist/site/index.html` → 3; `grep -c "home-provenance" dist/site/index.html` → ≥ 1.
- `find dist/site -name "*.html" -size +3M` → empty; `du -s dist/site` still < 900 MB.

## Test plan

New `it` blocks in `packages/pipeline/test/site/export-site.test.ts`:

1. **Featured selection is deterministic and evidence-ranked**: build a fixture with three
   routes — evidence counts 5, 2, 2 (the two ties differing only in record_id) — assert the
   homepage lists them ordered: highest first, then the tie broken by ascending record_id;
   assert the "n citations" figure renders.
2. **Stats math**: fixture homepage shows the exact totals derived from the fixture records
   (e.g. with one metric_claim record: `<strong>1</strong><span>metric claims`; records total
   equals the number of fixture records). Use `toLocaleString("en-US")` in expectations for
   any number ≥ 1,000.
3. **Workbench surfaces**: homepage contains `action="search.html"`, the six browse tiles
   (`graph.html` and `primitives.html` included), `Where this data comes from`, and the
   GitHub issues link.
4. **Blurb truncation**: a fixture route with a 400-char description renders a blurb ending
   in `…` and ≤ 161 chars inside the `<p>`.
5. **Determinism**: `index.html` byte-identical across two exports (extend the existing
   double-export block).

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun test packages/pipeline/test/site/` passes, including the 5 new areas
- [ ] `bun run export:site` exits 0 with unchanged page counts
- [ ] `dist/site/index.html` contains: a search form to `search.html`, six browse tiles, a stats strip, three "Most documented" sections, and the provenance section
- [ ] `find dist/site -name "*.html" -size +3M` empty; `du -s dist/site` < 900 MB
- [ ] `git status` shows modifications ONLY to the two in-scope files
- [ ] `plans/README.md` row updated (skip if your dispatcher maintains the index)

## STOP conditions

- Plan 021's changes are absent from the working tree (dependency not met).
- The determinism test fails after your changes and one fix attempt.
- Homepage stats derivation forces a change outside the two in-scope files.
- Anything in "Current state" doesn't match the live code (drift).

## Maintenance notes

- Featured lists use evidence-ref count as the "most documented" proxy. If a better editorial
  signal lands later (e.g. writer-prose length or curated flags), swap `featured()`'s sort —
  the markup won't care.
- The stats strip intentionally reads from the in-memory `records` array, not new SQL — keep
  it that way so `exportSite` stays usable against fixture dbs.
- If plan 024 changes source-page counts (it must not), the homepage tiles recount
  automatically — they derive from the same lists used to write pages.
