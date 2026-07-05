# Plan 024: Source pages — anchored evidence viewer with cited-by, metadata card, original-document links

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP
> conditions" section occurs, stop and report — do not improvise. When done, update the status
> row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 09972d0f..HEAD -- packages/pipeline/src/site packages/pipeline/test/site`
> Plans 021–023 legitimately change these files — confirm plan 021's work is present
> (`htmlShell` options, `SITE_BASE_URL`, `context.sourcePageIds`). Then compare this plan's
> "Current state" excerpts of `renderSourcePage`/`sourceAnchorHtml` against the live code —
> plans 021–023 should NOT have changed them beyond the plan-021 eyebrow attribute; on any
> other mismatch, STOP and report.

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: MED (2,561 source pages are the citation-anchor surface for the whole wiki;
  anchor ids and size caps must survive exactly)
- **Depends on**: plans/021-site-shell-search-and-chrome.md (023 recommended first only for
  clean sequencing)
- **Category**: direction (publication polish)
- **Planned at**: commit `09972d0f`, 2026-07-05

## Why this matters

Source pages are the evidence backbone of the wiki — every citation link on every record page
lands on one — but today a source page is a tiny 3-field `<dl>` and one giant `<pre>` of
extracted text with invisible `<a id>` anchors injected. A reader following a citation gets no
visual indication of the target block, no idea who else cites this source, no path to the
original document, and no trust signals (authority tier, document type, description). This
plan rebuilds source pages as evidence viewers: a proper metadata card, block-structured
anchored text where the cited block highlights on arrival (`:target`), per-block "cited by"
back-links computed from the canonical evidence-ref table, an external original-document link
when the payload has one, and the repository fallback link always.

## Current state

The exporter is `packages/pipeline/src/site/export-site.ts` (single file; deterministic
output asserted by test). Source-page code as of commit `09972d0f` (plan 021 added only
`data-pagefind-filter="kind"` to the eyebrow):

```ts
const SOURCE_TEXT_CAP_BYTES = 1_000_000;
// ...
function sourceAnchorHtml(text: string) {
  return htmlEscape(text).replace(/\[(p\d{3}_[bc]\d{4})\]/gu, `<a id="$1"></a>[$1]`);
}

function renderSourcePage(record: MtaCanonicalRecord, markdown: string, path: string, context: SiteRenderContext) {
  const url = recordUrl(record)!;
  const parsed = parseWikiPage(markdown);
  const bodyBytes = Buffer.byteLength(parsed.body);
  const truncated = bodyBytes > SOURCE_TEXT_CAP_BYTES;
  const visible = truncated ? parsed.body.slice(0, SOURCE_TEXT_CAP_BYTES) : parsed.body;
  const blob = wikiBlobUrl(path, context.githubBaseUrl);
  const note = truncated ? `<p class="cap-note">showing first ${SOURCE_TEXT_CAP_BYTES} bytes of ${bodyBytes} - <a href="${attr(blob)}">full data in the repository</a></p>` : "";
  const body = [
    `<article class="source-page">`,
    `<p class="eyebrow" data-pagefind-filter="kind">source</p>`,
    `<h1>${htmlEscape(pageTitle(record))}</h1>`,
    `<dl class="source-meta">`,
    `<dt>Source ID</dt><dd>${htmlEscape(record.source_id)}</dd>`,
    `<dt>Publisher</dt><dd>${htmlEscape(asString(record.payload.publisher) ?? "")}</dd>`,
    `<dt>Date</dt><dd>${htmlEscape(asString(record.payload.published_date_normalized) ?? asString(record.payload.date_text) ?? "")}</dd>`,
    `</dl>`,
    note,
    `<pre class="source-text">${sourceAnchorHtml(visible)}</pre>`,
    `</article>`,
  ].join("\n");
  return htmlShell(pageTitle(record), body, url);
}
```

**The source markdown body format** (`wiki/sources/<source_id>.md`, generated — never edit):
YAML frontmatter, then extracted text where blocks are line-leading bracketed ids:

```
[p002_c0002] The 86th Street crosstown corridor connects the dense and vibrant Manhattan
neighborhoods of the Upper East Side and Upper West Side. ...
[p002_c0003] Through targeted street treatments at problem intersections, ...
```

Block ids match `p\d{3}_[bc]\d{4}` (`c` = chandra OCR blocks, `b` = legacy blocks — both
exist in the corpus). The biggest capped source (`meeting_doc_201521.md`) has 5,334
line-leading markers; the largest source markdown is ~9 MB (capped to 1 MB of text at
render); the largest rendered source HTML today is ~1.16 MB. Hard caps: no HTML file > 3 MB,
site < 900 MB (currently ~354 MB).

**Citation anchors are a public contract**: record pages link
`sources/<source_id>.html#<block_id>` (e.g. `#p001_c0001`), and the existing test asserts the
rendered source HTML contains `id="p001_c0001"`. Whatever this plan renders, an element with
`id="<block_id>"` must exist for every marker that has one today (first occurrence of each id
within the visible text).

**Existing test expectations you will deliberately update** (in
`packages/pipeline/test/site/export-site.test.ts`): line 76 asserts
`expect(sourceHtml).toContain("showing first 1000000 bytes")` — the truncation message
changes shape in this plan (keep the `showing first 1000000` prefix and the
`full data in the repository` link text; see Step 4). Every other existing assertion must
pass unchanged, including `id="p001_c0001"` and the byte-identical double export.

**Evidence-ref data for cited-by** (SQLite `data/canonical.db`, user_version 4; ~132,500
rows):

```
evidence_refs(record_id, ordinal, ref_json, source_id, block_id, page_number)
```

`block_id` may be NULL. Reverse lookups are simple GROUP BYs; the most-cited source has ~170
distinct citing records — small enough to render capped chips. The exporter already opens
this db via `readCanonicalRecordsFromDbFile(dbPath)`; plan 023 added
`openCanonicalDb`-based `readRelationEdges(dbPath)` — model the new evidence read on it. If
plan 023 is NOT present in the tree, import `openCanonicalDb` from
`@mta-wiki/db/canonical-db` yourself (the test file already imports `rebuildCanonicalDb` from
there, so the dependency exists).

**Original-document URLs are sparse**: source payload key `source_url` exists on 177 of 2,566
sources, `url` on 9. There is NO local PDF to embed — raw PDFs are untracked and must never
be committed — so the viewer renders an external link when a valid `http(s)` URL exists, and
the GitHub markdown blob link always. Other useful payload keys (frequencies out of 2,566):
`title` 2,543, `content_type` 2,525 (free text: "presentation", "meeting book", …),
`publisher` 2,240, `authority_tier` 2,239 (values: `board_material` 1,287, `plan_document`
880, `official_evaluation` 56, `dataset_documentation` 9, `press_release` 7),
`published_date_normalized` 2,085, `published_date_precision` 2,085, `date_text` 2,007,
`description` 1,471, `retrieved_at` 36.

Conventions: `htmlEscape`/`attr` everywhere; source text is LITERAL — never run it through
`marked`; deterministic ordering only; single-file exporter; tests extend
`packages/pipeline/test/site/export-site.test.ts` (helpers `record`/`writePage`/`fixtureRoot`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Site tests | `bun test packages/pipeline/test/site/` | all pass |
| Full export | `bun run export:site` | exit 0, counts unchanged |
| Final gates | `bun run test` / `bun run validate` / `bun scripts/determinism-anchor.ts` | no new failures / `Issues: 0` / exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/pipeline/src/site/export-site.ts`
- `packages/pipeline/test/site/export-site.test.ts`

**Out of scope** (do NOT touch):
- `renderRecordPage` and the record-page panels (plan 023 owns them)
- `homePage`/`searchPage`/index pages (plans 021/022)
- `wiki/**`, `data/canonical/**`, `docs/immutable-mta-llm-wiki-spec.md`, `raw/**` (no PDFs,
  ever), `packages/db/**`
- Any new dependency; any change to `SOURCE_TEXT_CAP_BYTES` or the 3 MB/900 MB caps

## Git workflow

- Same worktree/branch as plans 021–023. One commit: `Site: source evidence viewer`.
- Do NOT push or merge; never commit `dist/` or `data/canonical.db`.

## Steps

### Step 1: Read cited-by data at export time

Add near `readRelationEdges` (or standalone if 023 absent):

```ts
type EvidenceRefRow = { record_id: string; source_id: string; block_id: string | null };
function readEvidenceRefRows(dbPath: string): EvidenceRefRow[] {
  const db = openCanonicalDb(dbPath, { readonly: true });
  try {
    return db
      .query("SELECT record_id, source_id, block_id FROM evidence_refs ORDER BY source_id, block_id, record_id")
      .all() as EvidenceRefRow[];
  } finally {
    db.close();
  }
}
```

In `exportSite()` build two maps and put them on the render context (extend
`SiteRenderContext`):

- `citedByBlock: Map<string, Map<string, string[]>>` — `source_id → block_id → sorted unique
  citing record_ids` (skip NULL block_ids).
- `citingRecordsBySource: Map<string, string[]>` — `source_id → sorted unique citing
  record_ids` (ALL rows, including NULL block_id).

Exclude self-citations (the source record citing itself) from both maps:
`row.record_id !== context.sourceById.get(row.source_id)?.record_id` — simpler and
equivalent: skip rows where the citing record's `record_kind === "source"` and its
`source_id` equals the row's `source_id`.

Also ensure a `pageBearingIds: Set<string>` (route/corridor/project record ids with pages)
exists on the context — plan 023 computes it locally; promote it onto `SiteRenderContext`
(or compute it here identically if 023 is absent:
`new Set([...routeRecords, ...corridorRecords, ...projectRecords].map((r) => r.record_id))`).

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Parse the source body into blocks

Add:

```ts
type ParsedSourceBody = { preamble: string; blocks: Array<{ id: string; text: string }> };
function parseSourceBlocks(body: string): ParsedSourceBody {
  const marker = /^\[(p\d{3}_[bc]\d{4})\][ \t]?/gmu;
  const blocks: Array<{ id: string; text: string }> = [];
  let preambleEnd: number | undefined;
  let current: { id: string; start: number } | undefined;
  for (let match = marker.exec(body); match; match = marker.exec(body)) {
    if (current) blocks.push({ id: current.id, text: body.slice(current.start, match.index) });
    else preambleEnd = match.index;
    current = { id: match[1]!, start: match.index + match[0].length };
  }
  if (current) blocks.push({ id: current.id, text: body.slice(current.start) });
  return { preamble: body.slice(0, preambleEnd ?? (current ? 0 : body.length)), blocks };
}
```

(If no markers exist, `blocks` is empty and `preamble` is the whole body — the legacy path.)
Trim a single trailing newline from each block's text when rendering, nothing more — the text
is literal OCR content.

**Verify**: `bun run typecheck` → exit 0 (behavior is asserted by the Step 5 tests).

### Step 3: Rebuild `renderSourcePage`

Keep the function signature. New structure:

1. **Header**: breadcrumbs (`Home / Sources / {title}` — source pages are one level deep, so
   `../index.html` and `../sources.html`), the existing eyebrow (keep
   `data-pagefind-filter="kind"`), `<h1>`, and `<p class="record-id">{source_id}</p>`.
2. **Metadata card** — extend the existing `<dl class="source-meta">` with rows rendered only
   when the value exists (`asString`): Source ID; Publisher; Date
   (`published_date_normalized` + ` ({published_date_precision})` when present, else
   `date_text`); Document type (`content_type`); Authority tier (`authority_tier`, humanized:
   `_`→space); Retrieved (`retrieved_at`); Description (`description`, capped 500 chars).
   Then a `cite-line` paragraph: `Cited by {N} records · {K} blocks cited` from
   `citingRecordsBySource` / `citedByBlock` (render `Cited by 0 records` honestly when
   absent).
3. **Links row** (`<p class="source-links">`):
   - When `payload.source_url ?? payload.url` starts with `http://` or `https://` (after
     `String(...).trim()`): `<a href="…" rel="noopener">Original document ↗</a>` — otherwise
     omit entirely (never render `javascript:` or relative values).
   - Always: `<a href="{wikiBlobUrl(path, context.githubBaseUrl)}">Wiki markdown on GitHub</a>`.
4. **Body**:
   - `const parsed = parseWikiPage(markdown);` then `parseSourceBlocks(parsed.body)`.
   - **Legacy path** (`blocks.length === 0`): keep today's rendering EXACTLY — cap note +
     `<pre class="source-text">${sourceAnchorHtml(visible)}</pre>`.
   - **Block path**: render preamble (when non-empty after trim) as
     `<pre class="source-text">{escaped}</pre>`, then for each visible block:
     ```html
     <section class="src-block" id="{block_id}">
     <a class="block-ref" href="#{block_id}" data-pagefind-ignore>[{block_id}]</a>
     <pre>{htmlEscape(text)}</pre>
     {cited-by line, only when citedByBlock has entries for this source_id+block_id}
     </section>
     ```
     - **Duplicate ids**: track a `Set<string>`; only the FIRST occurrence of an id gets
       `id="…"` and a self-href; later duplicates render the label as a `<span
       class="block-ref">` with no id (duplicate DOM ids are invalid HTML and would break
       `:target`).
     - **Cited-by line**: `<p class="block-cited" data-pagefind-ignore>Cited by {n}
       record{s}{: links}</p>` where links are up to 3 citing records that are in
       `context.pageBearingIds`, rendered via `recordUrl` + `relativeRecordUrl(url, …)` with
       `pageTitle` labels, comma-separated, followed by ` +{k} more` when more citing records
       exist than were linked. Citing records with no page contribute to the count only.
5. **Truncation (block path)**: accumulate `Buffer.byteLength(block.text)` in document order;
   once the running total would exceed `SOURCE_TEXT_CAP_BYTES`, slice that block's text to
   the remaining budget, render it as the last block, and stop. Then emit the cap note ABOVE
   the body (same position as today):
   `<p class="cap-note">showing first {shownBytes} of {bodyBytes} bytes ({shownBlocks} of {totalBlocks} blocks) - <a href="{blob}">full data in the repository</a></p>`
   where `bodyBytes` is the FULL body byte length (same number as today) and `shownBytes` the
   rendered text bytes (equals `SOURCE_TEXT_CAP_BYTES` when a block was sliced). No note when
   nothing was truncated.
6. Pass a `description` in `htmlShell` options:
   `` `Source document: {title}{, publisher} — cited by {N} records in the MTA Wiki.` ``

**Verify**: `bun run typecheck` → exit 0.

### Step 4: CSS + existing-test message update

Append to `css()`:

- `.src-block{border:1px solid var(--line);border-left:3px solid var(--line);background:var(--panel);margin:10px 0;padding:8px 12px;scroll-margin-top:72px}`
- `.src-block:target{border-left-color:var(--accent);background:#eef8f6;outline:1px solid var(--accent)}`
- `.src-block pre{border:0;padding:0;margin:6px 0 0;background:transparent;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.9rem}`
- `.block-ref{font-family:"SFMono-Regular",Consolas,monospace;font-size:.78rem;color:var(--muted);text-decoration:none}`
- `.block-cited{margin:6px 0 0;font-size:.82rem;color:var(--muted);border-top:1px dashed var(--line);padding-top:6px}`
- `.source-links a{margin-right:14px}`

Update the ONE existing truncation assertion (test line 76) from
`"showing first 1000000 bytes"` to `"showing first 1000000"`, and add
`expect(sourceHtml).toContain("full data in the repository")` beside it. Do not touch any
other existing assertion.

**Verify**: `bun run typecheck` → exit 0; `bun test packages/pipeline/test/site/` → all pass
(the existing fixture source has one `[p001_c0001]` marker + ~1.4 MB of text, so it now
exercises the block path with an intra-block slice; `id="p001_c0001"` must still be found).

### Step 5: New tests + full export + gates

Extend the test file (Test plan below), then run everything.

**Verify**:
- `bun test packages/pipeline/test/site/` → all pass.
- `bun run export:site` → exit 0; counts unchanged (`routes=318, corridors=218, projects=1859, sources=2561`).
- `grep -c 'class="src-block" id="p002_c0003"' dist/site/sources/m86_sbs_progress_report_2017.html` → 1.
- `grep -c "Cited by" dist/site/sources/m86_sbs_progress_report_2017.html` → ≥ 1.
- `find dist/site -name "*.html" -size +3M` → empty (**hard gate** — the 5,334-block capped
  sources are the risk); `du -s dist/site` < 900 MB.
- `bun run typecheck` → 0; `bun run validate` → `Issues: 0`; `bun scripts/determinism-anchor.ts` → exit 0.
- `bun run test` → no NEW failures vs the plan-021 Step 0 baseline.

## Test plan

New `it` blocks in `packages/pipeline/test/site/export-site.test.ts`. Build a second, richer
source fixture (e.g. `source_b`) with a body like:

```
intro preamble line
[p001_c0001] first block text
[p001_b0002] legacy-id block text
[p001_c0001] duplicate marker text
```

1. **Block structure**: `source_b.html` contains `class="src-block" id="p001_c0001"` and
   `id="p001_b0002"`; the preamble renders in a `source-text` pre; block text is present and
   HTML-escaped.
2. **Duplicate ids**: exactly ONE `id="p001_c0001"` in the whole file
   (`sourceHtml.split('id="p001_c0001"').length === 2`); the duplicate renders as a span
   block-ref.
3. **Cited-by**: route_m1's fixture evidence already cites `source_a#p001_c0001` — on
   `source_a.html` that block shows `Cited by` and a link to `../routes/route_m1.html`; a
   `metric_claim` citing the same block raises the count without adding a link. The header
   cite-line shows the distinct total.
4. **Original-document link**: `source_b` payload `source_url: "https://example.com/doc.pdf"`
   → `Original document` anchor with `rel="noopener"`; a third fixture source with
   `source_url: "javascript:alert(1)"` renders NO `Original document` anchor.
5. **Metadata card**: `authority_tier: "board_material"` renders `board material`;
   `content_type` renders; GitHub blob link present on every source page.
6. **Truncation**: existing giant fixture — updated message asserts `showing first 1000000`
   and `full data in the repository`; `id="p001_c0001"` still present.
7. **Legacy fallback**: a fixture source whose body has NO line-leading markers renders the
   old `<pre class="source-text">` path (assert `source-text` present, `src-block` absent).
8. **Determinism**: extend the double-export byte-equality to `sources/source_b.html`.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun test packages/pipeline/test/site/` passes, including the 8 areas above
- [ ] `bun run export:site` exits 0 with unchanged page counts
- [ ] Every previously-valid citation fragment still resolves: spot-check `dist/site/sources/m86_sbs_progress_report_2017.html` contains `id="p003_c0007"` (cited by the M86 route page prose)
- [ ] `find dist/site -name "*.html" -size +3M` empty; `du -s dist/site` < 900 MB
- [ ] `bun run test` no new failures; `bun run validate` `Issues: 0`; `bun scripts/determinism-anchor.ts` exit 0
- [ ] `git status` shows modifications ONLY to the two in-scope files
- [ ] `plans/README.md` row updated (skip if your dispatcher maintains the index)

## STOP conditions

- Plan 021's context changes are absent (dependency not met).
- Any exported HTML exceeds 3 MB after the redesign (block markup blew the budget — report
  the offending pages and their sizes; do NOT change the caps).
- The anchor-compat assertion (`id="p001_c0001"` / `id="p003_c0007"`) cannot be satisfied —
  citation fragments are a public contract; report rather than change link formats.
- The determinism test fails after one fix attempt.
- The `evidence_refs` query errors (schema mismatch) — do not modify `packages/db/**`;
  report.

## Maintenance notes

- The block regex `p\d{3}_[bc]\d{4}` mirrors `sourceAnchorHtml`. If the block-id grammar ever
  gains a new prefix, update BOTH and add a fixture.
- Cited-by uses the `evidence_refs` table; if a future plan renames/re-shapes it, this read
  is the only site-side consumer.
- Truncated sources lose anchors beyond the 1 MB budget (true today too — links into the
  truncated tail land on the page top). A future improvement could add a "block not shown"
  stub list for cited-but-truncated block ids; deliberately deferred.
- Reviewers should scrutinize: one of the ~170-citing-record sources (`tsp_report_2017`) for
  cited-by rendering sanity, and `meeting_doc_201521.html` (5,334 blocks) for size.
