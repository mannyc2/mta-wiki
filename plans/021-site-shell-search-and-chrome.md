# Plan 021: Site shell — header Pagefind search, search page, nav/footer chrome, sitemap, no dead cite links

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP
> conditions" section occurs, stop and report — do not improvise. When done, update the status
> row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 09972d0f..HEAD -- packages/pipeline/src/site packages/pipeline/test/site packages/cli/src/commands/materialize.ts package.json`
> If any of these changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (pure exporter change; site is regenerated from scratch each export)
- **Depends on**: none (021 is the foundation; plans 022–024 depend on it)
- **Category**: direction (publication polish)
- **Planned at**: commit `09972d0f`, 2026-07-05

## Why this matters

The static wiki at https://mannyc2.github.io/mta-wiki/ builds a Pagefind search index on every
export (4,964 pages indexed) but exposes **no search UI anywhere** — the index is dead weight.
The global header has no Sources link, pages have no meta description / canonical URL / footer,
there is no sitemap, and prose citations to the ~5 sources without exported pages render as
dead links. This plan adds the shared page chrome every other redesign plan builds on: a header
search box on every page, a dedicated search page wired to the existing Pagefind index, honest
provenance in a global footer, sitemap.xml + robots.txt, filterable index lists, and no dead
citation links.

## Current state

This is a Bun + TypeScript monorepo (`bun@1.3.9`, workspaces under `packages/*`). The static
site exporter is **one file**: `packages/pipeline/src/site/export-site.ts` (470 lines). It
reads `data/canonical.db` (SQLite, gitignored), renders `wiki/**/*.md` pages to
`dist/site/**/*.html`, and the CLI wrapper then runs Pagefind over the output.

- `packages/pipeline/src/site/export-site.ts` — the whole renderer (templates are inline
  template literals; CSS is one `css()` function returning a single string).
- `packages/pipeline/test/site/export-site.test.ts` — the only site test (fixture-based,
  builds a tiny canonical.db + wiki pages in a temp dir; asserts caps, links, determinism).
- `packages/cli/src/commands/materialize.ts:252-271` — the `export-site` CLI command; runs
  `bunx pagefind --site dist/site` after rendering.
- Page inventory at export: routes 318, corridors 218, projects 1,859, sources 2,561, plus
  `index.html`, `routes.html`, `corridors.html`, `projects.html`, `sources.html`, `404.html`,
  and verbatim copies of `wiki/graph.html` + `wiki/primitives.html`. Site totals ~354 MB;
  largest single HTML file today is ~1.16 MB (hard cap is 3 MB per file, 900 MB total).
- The Pagefind bundle written to `dist/site/pagefind/` includes `pagefind-ui.js` and
  `pagefind-ui.css` (verified in the current build output) — the classic Pagefind UI is
  available without any new dependency.

Key excerpts as they exist today (line numbers from `packages/pipeline/src/site/export-site.ts`
at commit `09972d0f`):

The shared HTML shell (lines 229–251) — every page goes through this:

```ts
function htmlShell(title: string, body: string, currentUrl: string) {
  const depth = currentUrl.split("/").filter(Boolean).length - 1;
  const prefix = depth <= 0 ? "" : "../".repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(title)} - MTA Wiki</title>
<link rel="stylesheet" href="${prefix}assets/site.css">
</head>
<body>
<header class="site-header">
  <a class="brand" href="${prefix}index.html">MTA Wiki</a>
  <nav><a href="${prefix}routes.html">Routes</a><a href="${prefix}corridors.html">Corridors</a><a href="${prefix}projects.html">Projects</a></nav>
</header>
<main>
${body}
</main>
</body>
</html>
`;
}
```

The render context (lines 29–33) and the `cite:` inline primitive branch (lines 113–118) —
note it links to `sources/<id>.html` without checking the page exists:

```ts
export type SiteRenderContext = {
  recordsById: Map<string, MtaCanonicalRecord>;
  sourceById: Map<string, MtaCanonicalRecord>;
  githubBaseUrl: string;
};
// ...
  if (kind === "cite") {
    const url = relativeRecordUrl(fromUrl, `/sources/${id}.html`) + (blockId ? `#${encodeURIComponent(blockId)}` : "");
    return `<a class="citation-link" href="${attr(url)}">${cleanLabel}</a>`;
  }
```

The category index pages (lines 324–356): `indexPage(kind, records)` renders
`<section class="index-list"><h1>…</h1><p>N pages</p><ol>…</ol></section>`; `sourcesIndex`
is the same shape for sources. The eyebrow line on record pages
(`renderRecordPage`, line 287): `` `<p class="eyebrow">${htmlEscape(record.record_kind)}</p>` ``
and on source pages (line 310): `` `<p class="eyebrow">source</p>` ``.

`exportSite()` (lines 418–470) builds `context`, filters records to those with wiki pages
(`hasWikiPage`), writes record pages, source pages, four category indexes, `index.html`,
`404.html`, `assets/site.css`, and copies `graph.html`/`primitives.html`. `sourceRecords` is
already the deduped, page-having list — reuse it for the new `sourcePageIds` set.

The CLI command (`packages/cli/src/commands/materialize.ts:252-271`):

```ts
  "export-site": () => {
    const result = exportSite();
    console.log(
      `Exported static site to ${relative(repoRoot, result.outDir)}: ` +
        `routes=${result.pages.routes}, corridors=${result.pages.corridors}, projects=${result.pages.projects}, sources=${result.pages.sources}.`,
    );
    if (result.oversizedPages.length > 0) { /* prints and exits 1 */ }
    const pagefind = spawnSync("bunx", ["pagefind", "--site", "dist/site"], { cwd: repoRoot, encoding: "utf8" });
    // non-zero → warn "site exported without search", still exit 0
  },
```

Repo conventions that apply here:

- Tests use `bun:test` (`describe`/`it`/`expect`), build fixtures in `mkdtempSync` temp dirs,
  and clean up in `finally`. Model new tests on
  `packages/pipeline/test/site/export-site.test.ts` — its `record()` / `writePage()` /
  `fixtureRoot()` helpers are exactly what you need; extend that file.
- Rendering must be **deterministic**: no timestamps, no randomness, no locale-dependent
  ordering (sorts use `localeCompare` on fixed inputs, which is fine). The existing test
  asserts double-export byte-equality — it must keep passing.
- All record/user text goes through `htmlEscape()`; attribute values through `attr()`.
- Keep everything in the single `export-site.ts` file (inline template literals, css string) —
  match the existing style; do not introduce a template engine or split into many files.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install deps (fresh worktree) | `bun install` (try `bun install --offline` first) | exit 0 |
| Provide the db (gitignored, required by export) | `cp /mnt/models/dev/mta-wiki/data/canonical.db data/canonical.db` | file exists, ~hundreds of MB |
| Typecheck | `bun run typecheck` | exit 0, no errors |
| Site tests only (fast) | `bun test packages/pipeline/test/site/` | all pass |
| Full test suite (baseline + final) | `bun run test` | all pass (record any pre-existing failures BEFORE changing code) |
| Validate corpus | `bun run validate` | `Issues: 0` |
| Determinism anchor | `bun scripts/determinism-anchor.ts` | exit 0, prints combined hash |
| Full export (slow: renders ~4,960 pages + Pagefind) | `bun run export:site` | exit 0; prints page counts; Pagefind "Indexed …" line |

Note for a fresh worktree: `node_modules/` and `data/canonical.db` are gitignored and absent.
Run the install and the `cp` above before anything else. `bunx pagefind` resolves the locally
installed `pagefind` devDependency — no network needed after install.

## Scope

**In scope** (the only files you should modify):
- `packages/pipeline/src/site/export-site.ts`
- `packages/pipeline/test/site/export-site.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `wiki/**` (generated content — never hand-edit), `data/canonical/**` (canonical JSONL —
  never hand-edit), `docs/immutable-mta-llm-wiki-spec.md` (read-only by standing house rule)
- `wiki/graph.html`, `wiki/primitives.html` (copied verbatim into the site; do not edit)
- `packages/cli/src/commands/materialize.ts` (the CLI command already works; no change needed)
- `package.json`, lockfile, any new dependency (Pagefind UI ships inside the existing
  Pagefind output bundle)
- Raw PDFs / anything under `raw/` (not tracked; never commit)
- The homepage `homePage()` beyond what Step 2 says (full redesign is plan 022)

## Git workflow

- You are working in a dedicated git worktree on a dedicated branch; commit there.
- One commit for this plan; message style matches repo history (`git log --oneline` shows
  `Site: static HTML exporter`, `Writer track: close plan 012`): use
  `Site: shell chrome, header search, sitemap`.
- Do NOT push. Do NOT merge into `main`. Do NOT commit `dist/` or `data/canonical.db`.

## Steps

### Step 0: Baseline

In the worktree: `bun install` (offline first), copy the db (command table above), then run
`bun run typecheck` and `bun test packages/pipeline/test/site/` — both must be clean BEFORE
you change anything. Also run `bun run test` once and save the summary (pass/fail counts) so
new failures are distinguishable from pre-existing ones.

**Verify**: typecheck exit 0; site tests pass.

### Step 1: Extend `htmlShell` — head metadata, header search, nav, footer

In `packages/pipeline/src/site/export-site.ts`:

1. Add a module constant near the other caps (line ~13):
   `const SITE_BASE_URL = "https://mannyc2.github.io/mta-wiki";`
2. Change `htmlShell` to
   `function htmlShell(title: string, body: string, currentUrl: string, options: { description?: string; headExtra?: string } = {})`.
   Inside:
   - `const description = options.description ?? "Structured, source-cited records about MTA and NYC bus-priority routes, corridors, and projects.";`
   - `const canonical = `${SITE_BASE_URL}${currentUrl}`;`
   - In `<head>`, after the viewport meta, add (escaping with `attr()`/`htmlEscape()`):
     ```html
     <meta name="description" content="${attr(description)}">
     <link rel="canonical" href="${attr(canonical)}">
     <meta property="og:title" content="${attr(title)} - MTA Wiki">
     <meta property="og:description" content="${attr(description)}">
     <meta property="og:url" content="${attr(canonical)}">
     <meta property="og:type" content="article">
     <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%9A%8C%3C/text%3E%3C/svg%3E">
     ${options.headExtra ?? ""}
     ```
   - Replace the `<nav>` with:
     ```html
     <nav><a href="${prefix}routes.html">Routes</a><a href="${prefix}corridors.html">Corridors</a><a href="${prefix}projects.html">Projects</a><a href="${prefix}sources.html">Sources</a></nav>
     <form class="site-search" action="${prefix}search.html" method="get" role="search">
       <input type="search" name="q" placeholder="Search the wiki" aria-label="Search the wiki">
     </form>
     ```
     (form after `</nav>`, still inside `.site-header`).
   - Change `<main>` to `<main data-pagefind-body>`.
   - After `</main>`, add the footer:
     ```html
     <footer class="site-footer">
     <p>Built from public NYC/MTA government records. Every structured record cites evidence
     blocks in official source documents. Data was extracted with an LLM pipeline and may
     contain errors — verify against the cited sources.</p>
     <p><a href="https://github.com/mannyc2/mta-wiki">GitHub repository</a> · <a href="https://github.com/mannyc2/mta-wiki/tree/main/data/exports/releases">Data releases</a> · MIT-licensed code · To request a correction or takedown, <a href="https://github.com/mannyc2/mta-wiki/issues">open a GitHub issue</a>.</p>
     </footer>
     ```
   Note on `data-pagefind-body`: once it appears anywhere, Pagefind indexes ONLY elements
   carrying it — the verbatim-copied `graph.html`/`primitives.html` will drop out of the
   search index. This is intentional and accepted (they are linked from the homepage); the
   payoff is that header/nav/footer text stops polluting every search result.
3. Existing callers of `htmlShell` compile unchanged (the new argument is optional).

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Search page

Add a `searchPage()` function and write it from `exportSite()` as `search.html` (root level,
alongside `routes.html`):

```ts
function searchPage() {
  const body = [
    `<section class="search-page">`,
    `<h1>Search</h1>`,
    `<p class="search-hint">Searches ${""}all exported route, corridor, project, and source pages. Use the kind filter to narrow results.</p>`,
    `<div id="search" data-pagefind-ignore></div>`,
    `<noscript><p>Search requires JavaScript. Browse <a href="routes.html">routes</a>, <a href="corridors.html">corridors</a>, <a href="projects.html">projects</a>, or <a href="sources.html">sources</a> instead.</p></noscript>`,
    `<script src="pagefind/pagefind-ui.js"></script>`,
    `<script>
window.addEventListener("DOMContentLoaded", () => {
  const ui = new PagefindUI({ element: "#search", showSubResults: true, showImages: false, pageSize: 10 });
  const q = new URLSearchParams(window.location.search).get("q");
  if (q) ui.triggerSearch(q);
});
</script>`,
    `</section>`,
  ].join("\n");
  return htmlShell("Search", body, "/search.html", {
    description: "Full-text search across all MTA Wiki routes, corridors, projects, and source documents.",
    headExtra: `<link rel="stylesheet" href="pagefind/pagefind-ui.css">`,
  });
}
```

(Drop the stray `${""}` if you copy this — plain text is fine.) The `pagefind/` directory is
created by the Pagefind CLI step AFTER rendering, so the exporter writes a page referencing
files that appear later in the same `export:site` run — that ordering already exists and is
fine. `data-pagefind-ignore` on the mount div keeps result snippets out of the index.

In `exportSite()`, after the `404.html` write, add:
`writeFile(join(outDir, "search.html"), searchPage());`

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Pagefind filters on record/source pages

- In `renderRecordPage`, change the eyebrow line to
  `` `<p class="eyebrow" data-pagefind-filter="kind">${htmlEscape(record.record_kind)}</p>` ``
- In `renderSourcePage`, change the eyebrow to
  `` `<p class="eyebrow" data-pagefind-filter="kind">source</p>` ``

This gives the Pagefind UI a "kind" filter (route / corridor / project / source) with zero JS.

**Verify**: `bun run typecheck` → exit 0.

### Step 4: No dead citation links

1. Add `sourcePageIds: Set<string>;` to `SiteRenderContext`.
2. In `exportSite()`, the `sourceRecords` list (already filtered by `hasWikiPage` and deduped)
   is computed AFTER `context` today — reorder so `context` is built after the four
   `*Records` lists, and set `sourcePageIds: new Set(sourceRecords.map((r) => r.source_id))`.
   (The `*Records` filters don't use `context`, so reordering is safe.)
3. In `primitiveInlineHtml`, guard the `cite` branch:
   ```ts
   if (kind === "cite") {
     if (!context.sourcePageIds.has(id)) {
       return `<span class="citation-link citation-unresolved" title="source ${attr(id)} is not in this export">${cleanLabel}</span>`;
     }
     // existing anchor rendering unchanged
   }
   ```
4. `evidenceRows` (citations table) links every ref to `sources/<source_id>.html` the same
   way — apply the same guard there: when `!context.sourcePageIds.has(ref.source_id)`, render
   the source title as plain text (no `<a>`), keep the row otherwise unchanged.

**Verify**: `bun run typecheck` → exit 0.

### Step 5: sitemap.xml + robots.txt

1. Collect URLs while writing pages. Simplest correct approach: in `exportSite()`, build
   `const siteUrls: string[] = []` and push the absolute URL for every page written:
   record pages (`SITE_BASE_URL + url`), source pages, the four category indexes,
   `index.html`, `search.html`, and — only when the copy actually happens in
   `copyStaticWikiHtml` (it checks `existsSync`) — `graph.html` and `primitives.html`. To know
   what was copied, change `copyStaticWikiHtml` to return the list of copied filenames.
   Exclude `404.html`.
2. Add:
   ```ts
   function sitemapXml(urls: string[]) {
     const body = [...urls].sort().map((u) => `<url><loc>${htmlEscape(u)}</loc></url>`).join("\n");
     return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
   }
   ```
3. Write `sitemap.xml` and `robots.txt` at the end of `exportSite()`:
   ```
   User-agent: *
   Allow: /

   Sitemap: https://mannyc2.github.io/mta-wiki/sitemap.xml
   ```
   (Build the Sitemap line from `SITE_BASE_URL`, don't hardcode it twice.)

**Verify**: `bun run typecheck` → exit 0.

### Step 6: Client-side filter on index lists (progressive enhancement)

In `indexPage()` and `sourcesIndex()`, above the `<ol>`, add:

```html
<input type="search" class="index-filter" placeholder="Filter by name or id" aria-label="Filter this list">
```

and immediately before `</section>` a small inline script (static string — identical on every
index page, so determinism holds):

```html
<script>
(function () {
  var input = document.querySelector(".index-filter");
  if (!input) return;
  var items = Array.prototype.slice.call(document.querySelectorAll(".index-list ol li"));
  input.addEventListener("input", function () {
    var q = input.value.toLowerCase();
    items.forEach(function (li) { li.hidden = q !== "" && li.textContent.toLowerCase().indexOf(q) === -1; });
  });
})();
</script>
```

Without JS the full list still renders — no behavior lost.

**Verify**: `bun run typecheck` → exit 0.

### Step 7: CSS for the new chrome

Append to the `css()` string (keep it one string; match the terse existing style):

- `.site-search input{border:1px solid var(--line);padding:6px 10px;min-width:210px;font:inherit;background:#fff}`
- `.site-footer{border-top:1px solid var(--line);margin-top:48px;padding:20px 24px;color:var(--muted);font-size:.9rem;max-width:1180px;margin-left:auto;margin-right:auto}`
- `.search-page #search{margin-top:16px}`
- `.index-filter{margin:12px 0;border:1px solid var(--line);padding:8px 10px;font:inherit;width:min(420px,100%)}`
- `.citation-unresolved{color:var(--muted);border-bottom:1px dotted var(--muted)}`
- In the mobile media query, let the header wrap: add `.site-search{width:100%}` and
  `.site-search input{width:100%}` inside `@media(max-width:720px)`.

**Verify**: `bun run typecheck` → exit 0.

### Step 8: Tests, full export, gates

Extend `packages/pipeline/test/site/export-site.test.ts` per the Test plan below, then run the
fast loop, then one full export, then the gates.

**Verify** (all must hold):
- `bun test packages/pipeline/test/site/` → all pass (old + new).
- `bun run export:site` → exit 0; page counts `routes=318, corridors=218, projects=1859, sources=2561`; Pagefind prints an "Indexed" line with roughly 4,960 pages.
- `ls dist/site/search.html dist/site/sitemap.xml dist/site/robots.txt` → all exist.
- `grep -c "data-pagefind-body" dist/site/routes/route_m86-sbs.html` → ≥ 1.
- `grep -c "site-search" dist/site/sources/m86_sbs_progress_report_2017.html` → ≥ 1.
- `du -sh dist/site` → under 900 MB (expect ~354 MB, marginal growth).
- `find dist/site -name "*.html" -size +3M` → empty.
- `bun run typecheck` → exit 0; `bun run validate` → `Issues: 0`; `bun scripts/determinism-anchor.ts` → exit 0.
- `bun run test` → no NEW failures vs the Step 0 baseline.

## Test plan

Extend `packages/pipeline/test/site/export-site.test.ts` (reuse `record`, `writePage`,
`fixtureRoot`). New `it` blocks inside the existing `describe`:

1. **Shell chrome**: after `exportSite`, the rendered route page HTML contains
   `data-pagefind-body`, `action="../search.html"`, `name="description"`,
   `rel="canonical"`, the footer string `Built from public NYC/MTA government records`, and
   `data-pagefind-filter="kind"`. The root `routes.html` contains `action="search.html"`
   (no `../`) and the `.index-filter` input.
2. **Search page**: `dist/site/search.html` exists, contains `pagefind/pagefind-ui.js`,
   `pagefind/pagefind-ui.css`, `id="search"`, and `triggerSearch`.
3. **Sitemap/robots**: `sitemap.xml` contains
   `<loc>https://mannyc2.github.io/mta-wiki/routes/route_m1.html</loc>` and
   `.../search.html`, does NOT contain `404.html`; `robots.txt` contains
   `Sitemap: https://mannyc2.github.io/mta-wiki/sitemap.xml`.
4. **Unresolved cite**: add to the route fixture writer region
   `[[cite:missing_src#p001_c0001|dead cite]]` (no `missing_src` source record/page). The
   rendered page contains `citation-unresolved` around "dead cite" and does NOT contain
   `missing_src.html`.
5. **Determinism**: extend the existing double-export assertion to also compare
   `search.html` and `sitemap.xml` byte-for-byte across two exports.

The existing assertions (caps, `showing 200 of 250`, `id="p001_c0001"`, metric value from db,
byte-identical re-render) must all keep passing untouched.

## Done criteria

Machine-checkable; ALL must hold (commands as in Step 8):

- [ ] `bun run typecheck` exits 0
- [ ] `bun test packages/pipeline/test/site/` passes with the 5 new test areas present
- [ ] `bun run test` has no new failures vs the Step 0 baseline
- [ ] `bun run validate` reports `Issues: 0`
- [ ] `bun scripts/determinism-anchor.ts` exits 0
- [ ] `bun run export:site` exits 0 with unchanged page counts; `search.html`, `sitemap.xml`, `robots.txt` exist in `dist/site/`
- [ ] `du -s dist/site` < 900 MB; `find dist/site -name "*.html" -size +3M` empty
- [ ] `git status` shows modifications ONLY to the two in-scope files
- [ ] `plans/README.md` row updated (skip if your dispatcher maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The Step 0 baseline itself fails (typecheck, site tests) — the plan was written against a
  clean gate.
- `bunx pagefind` cannot run in this environment (e.g. sandbox/network issue) — report; do
  NOT hand-roll a search index or vendor Pagefind files manually.
- The determinism test (byte-identical double export) fails after your changes and you cannot
  find the nondeterminism within one fix attempt.
- `dist/site` exceeds 900 MB or any HTML file exceeds 3 MB.
- The code at the "Current state" excerpts doesn't match (drift).
- Fixing something appears to require touching an out-of-scope file.

## Maintenance notes

- Plans 022–024 assume the `htmlShell` options object, `SITE_BASE_URL`, and
  `context.sourcePageIds` from this plan. If you rename them, those plans' excerpts drift.
- `data-pagefind-body` on `<main>` means any future standalone HTML copied into the site
  verbatim will be absent from search until it carries the attribute itself.
- The search page references `pagefind/pagefind-ui.js` — if the Pagefind major version is ever
  bumped, confirm the UI bundle filenames are unchanged.
- Redeploying the live site (gh-pages push) is owner-gated and NOT part of this plan.
