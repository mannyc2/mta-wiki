import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { marked } from "marked";
import { repoRoot } from "@mta-wiki/core/paths";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef } from "@mta-wiki/db/types";
import { parseBlockPrimitives } from "@mta-wiki/pipeline/materialize/primitives";
import { readCanonicalRecordsFromDbFile } from "@mta-wiki/pipeline/materialize/materialize";

const SITE_KINDS = ["route", "corridor", "project"] as const;
const SOURCE_TEXT_CAP_BYTES = 1_000_000;
const LARGE_MARKDOWN_CAP_BYTES = 2_000_000;
const LARGE_WRITER_CAP_BYTES = 120_000;
const TABLE_ROW_CAP = 200;

export type SiteRecordKind = (typeof SITE_KINDS)[number];

export type SiteExportResult = {
  outDir: string;
  pages: {
    routes: number;
    corridors: number;
    projects: number;
    sources: number;
  };
  bytes: number;
  oversizedPages: string[];
};

export type SiteRenderContext = {
  recordsById: Map<string, MtaCanonicalRecord>;
  sourceById: Map<string, MtaCanonicalRecord>;
  githubBaseUrl: string;
};

export function siteOutDir(rootDir = repoRoot) {
  return join(rootDir, "dist", "site");
}

function htmlEscape(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function attr(value: string) {
  return htmlEscape(value);
}

function asString(value: JsonValue | undefined) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function compactJson(value: JsonValue | undefined, depth = 0): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (depth >= 1) return `[${value.length} items]`;
    return `[${value.slice(0, 6).map((entry) => compactJson(entry, depth + 1)).join(", ")}${value.length > 6 ? `, ... ${value.length - 6} more` : ""}]`;
  }
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  if (depth >= 1) return `{${entries.length} fields}`;
  return `{${entries
    .slice(0, 8)
    .map(([key, entry]) => `${key}: ${compactJson(entry as JsonValue, depth + 1)}`)
    .join(", ")}${entries.length > 8 ? `, ... ${entries.length - 8} more` : ""}}`;
}

function pageTitle(record: MtaCanonicalRecord) {
  return record.display_name || record.record_id;
}

function parseWikiPage(markdown: string) {
  if (!markdown.startsWith("---\n")) return { frontmatter: "", body: markdown };
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) return { frontmatter: "", body: markdown };
  return { frontmatter: markdown.slice(4, end), body: markdown.slice(end + 5) };
}

function recordDir(kind: MtaCanonicalRecord["record_kind"]) {
  if (kind === "route") return "routes";
  if (kind === "corridor") return "corridors";
  if (kind === "project") return "projects";
  if (kind === "source") return "sources";
  return undefined;
}

function recordUrl(record: MtaCanonicalRecord) {
  const dir = recordDir(record.record_kind);
  if (!dir) return undefined;
  const id = record.record_kind === "source" ? record.source_id : record.record_id;
  return `/${dir}/${id}.html`;
}

function relativeRecordUrl(fromUrl: string, targetUrl: string) {
  const fromDepth = fromUrl.split("/").filter(Boolean).length - 1;
  const prefix = fromDepth <= 0 ? "" : "../".repeat(fromDepth);
  return `${prefix}${targetUrl.replace(/^\//u, "")}`;
}

function wikiBlobUrl(path: string, githubBaseUrl: string) {
  return `${githubBaseUrl}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function sourceTitle(source: MtaCanonicalRecord | undefined, sourceId: string) {
  return source?.display_name || asString(source?.payload.title) || sourceId;
}

function primitiveInlineHtml(kind: string, id: string, blockId: string | undefined, label: string, fromUrl: string, context: SiteRenderContext) {
  const cleanLabel = htmlEscape(label || id);
  if (kind === "cite") {
    const url = relativeRecordUrl(fromUrl, `/sources/${id}.html`) + (blockId ? `#${encodeURIComponent(blockId)}` : "");
    return `<a class="citation-link" href="${attr(url)}">${cleanLabel}</a>`;
  }
  const record = context.recordsById.get(id);
  const url = record ? recordUrl(record) : undefined;
  if (url && (kind === "route" || kind === "corridor" || kind === "project")) {
    return `<a class="primitive primitive-${attr(kind)}" href="${attr(relativeRecordUrl(fromUrl, url))}">${cleanLabel}</a>`;
  }
  if (kind === "metric" && record) {
    const value = asString(record.payload.value) ?? asString(record.payload.raw_value_text);
    const unit = asString(record.payload.unit);
    const suffix = value ? ` <span class="primitive-value">${htmlEscape(value)}${unit ? ` ${htmlEscape(unit)}` : ""}</span>` : "";
    return `<span class="primitive primitive-metric" data-record-id="${attr(id)}">${cleanLabel}${suffix}</span>`;
  }
  return `<span class="primitive primitive-unrendered" data-record-id="${attr(id)}">${cleanLabel}</span>`;
}

function renderPrimitiveLinks(markdown: string, fromUrl: string, context: SiteRenderContext) {
  return markdown
    .replace(/\[\[(route|corridor|project|entity|metric|cite):([^#|\]\s]+)(?:#([^|\]\s]+))?\|([\s\S]*?)\]\]/gu, (_raw, kind: string, id: string, blockId: string | undefined, label: string) =>
      primitiveInlineHtml(kind, id, blockId, label, fromUrl, context),
    )
    .replace(/\[\[wiki\/([^|\]]+)\|([\s\S]*?)\]\]/gu, (_raw, path: string, label: string) => {
      const htmlPath = path.replace(/\.md$/u, ".html").replace(/^routes\//u, "routes/").replace(/^corridors\//u, "corridors/").replace(/^projects\//u, "projects/").replace(/^sources\//u, "sources/");
      return `<a href="${attr(relativeRecordUrl(fromUrl, `/${htmlPath}`))}">${htmlEscape(label)}</a>`;
    });
}

function metricComponent(id: string, context: SiteRenderContext) {
  const record = context.recordsById.get(id);
  if (!record) return `<aside class="component component-missing">Unknown metric ${htmlEscape(id)}</aside>`;
  const value = asString(record.payload.value) ?? asString(record.payload.raw_value_text) ?? "value not extracted";
  const unit = asString(record.payload.unit);
  const name = asString(record.payload.metric_name) ?? record.display_name;
  return [
    `<aside class="component metric-card" data-record-id="${attr(id)}">`,
    `<div class="component-label">${htmlEscape(name)}</div>`,
    `<div class="component-value">${htmlEscape(value)}${unit ? ` <span>${htmlEscape(unit)}</span>` : ""}</div>`,
    `</aside>`,
  ].join("");
}

function recordChip(kind: string, id: string, context: SiteRenderContext, fromUrl: string) {
  const record = context.recordsById.get(id);
  if (!record) return `<aside class="component component-missing">Unknown ${htmlEscape(kind)} ${htmlEscape(id)}</aside>`;
  const url = recordUrl(record);
  const label = htmlEscape(record.display_name || id);
  const linked = url ? `<a href="${attr(relativeRecordUrl(fromUrl, url))}">${label}</a>` : label;
  return `<aside class="component chip-row"><span>${htmlEscape(kind)}</span>${linked}</aside>`;
}

function renderBlockPrimitives(markdown: string, fromUrl: string, context: SiteRenderContext) {
  let rendered = markdown;
  for (const primitive of parseBlockPrimitives(markdown).sort((a, b) => b.offset - a.offset)) {
    const replacement =
      primitive.error || !primitive.id
        ? `<aside class="component component-missing">Invalid MTA component</aside>`
        : primitive.kind === "metric"
          ? metricComponent(primitive.id, context)
          : recordChip(primitive.kind, primitive.id, context, fromUrl);
    rendered = `${rendered.slice(0, primitive.offset)}${replacement}${rendered.slice(primitive.offset + primitive.raw.length)}`;
  }
  return rendered;
}

function markdownToHtml(markdown: string, fromUrl: string, context: SiteRenderContext) {
  const primitiveBlocks = renderBlockPrimitives(markdown, fromUrl, context);
  const links = renderPrimitiveLinks(primitiveBlocks, fromUrl, context);
  return marked.parse(links, { async: false, gfm: true }) as string;
}

function evidenceRows(record: MtaCanonicalRecord, context: SiteRenderContext, fromUrl: string, limit: number | undefined, fullDataUrl?: string | undefined) {
  const refs = record.evidence_refs;
  const rows = limit ? refs.slice(0, limit) : refs;
  const body = rows
    .map((ref) => {
      const source = context.sourceById.get(ref.source_id);
      const sourceUrl = relativeRecordUrl(fromUrl, `/sources/${ref.source_id}.html`) + (ref.block_id ? `#${encodeURIComponent(ref.block_id)}` : "");
      return [
        "<tr>",
        `<td><a href="${attr(sourceUrl)}">${htmlEscape(sourceTitle(source, ref.source_id))}</a></td>`,
        `<td>${htmlEscape(ref.block_id ?? ref.block_range ?? "")}</td>`,
        `<td>${htmlEscape(asString(source?.payload.publisher) ?? "")}</td>`,
        `<td>${htmlEscape(asString(source?.payload.published_date_normalized) ?? asString(source?.payload.date_text) ?? "")}</td>`,
        `<td>${htmlEscape(ref.source_quote ?? "")}</td>`,
        "</tr>",
      ].join("");
    })
    .join("\n");
  const fullData = fullDataUrl ? `<a href="${attr(fullDataUrl)}">full data in the repository</a>` : "full data in the repository";
  const note = limit && refs.length > limit ? `<p class="cap-note">showing ${limit} of ${refs.length} - ${fullData}</p>` : "";
  if (refs.length === 0) return "";
  return [
    `<section class="evidence" data-pagefind-ignore>`,
    `<h2>Citations</h2>`,
    note,
    `<table><thead><tr><th>Source</th><th>Block</th><th>Publisher</th><th>Date</th><th>Quote</th></tr></thead><tbody>`,
    body,
    `</tbody></table>`,
    `</section>`,
  ].join("\n");
}

function payloadSummary(record: MtaCanonicalRecord) {
  const rows = Object.entries(record.payload)
    .filter(([key, value]) => !key.startsWith("_") && value !== undefined)
    .slice(0, 24)
    .map(([key, value]) => `<tr><th>${htmlEscape(key)}</th><td>${htmlEscape(compactJson(value as JsonValue)).slice(0, 500)}</td></tr>`)
    .join("\n");
  if (!rows) return "";
  return `<section class="facts"><h2>Structured Data</h2><table>${rows}</table></section>`;
}

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

function writerRegionBody(body: string) {
  const startMarker = "<!-- mta-wiki:writer:start -->";
  const endMarker = "<!-- mta-wiki:writer:end -->";
  const start = body.indexOf(startMarker);
  if (start === -1) return "";
  const contentStart = start + startMarker.length;
  const end = body.indexOf(endMarker, contentStart);
  if (end === -1) return "";
  return body.slice(contentStart, end).trim();
}

function sourceAnchorHtml(text: string) {
  return htmlEscape(text).replace(/\[(p\d{3}_[bc]\d{4})\]/gu, `<a id="$1"></a>[$1]`);
}

function renderRecordPage(record: MtaCanonicalRecord, markdown: string, path: string, context: SiteRenderContext) {
  const url = recordUrl(record)!;
  const large = Buffer.byteLength(markdown) > LARGE_MARKDOWN_CAP_BYTES;
  const writer = writerRegionBody(markdown);
  const writerBytes = Buffer.byteLength(writer);
  const renderedWriter = large && writerBytes > LARGE_WRITER_CAP_BYTES ? writer.slice(0, LARGE_WRITER_CAP_BYTES) : writer;
  const bodyHtml = writer
    ? markdownToHtml(renderedWriter, url, context)
    : `<p class="empty-writer">Writer prose has not been added yet. This page is generated from structured v1 records and source citations.</p>`;
  const blob = wikiBlobUrl(path, context.githubBaseUrl);
  const capNote = large
    ? `<p class="cap-note">This generated markdown is large; showing capped page content and citation tables. <a href="${attr(blob)}">Full data in the repository</a>.</p>`
    : "";
  const writerCapNote =
    large && writerBytes > LARGE_WRITER_CAP_BYTES
      ? `<p class="cap-note">showing first ${LARGE_WRITER_CAP_BYTES} bytes of ${writerBytes} writer-region bytes - full data in the repository</p>`
      : "";
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
    `<p class="eyebrow">source</p>`,
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

function indexPage(kind: SiteRecordKind, records: MtaCanonicalRecord[]) {
  const title = `${kind[0]!.toUpperCase()}${kind.slice(1)}s`;
  const dir = recordDir(kind)!;
  const items = records
    .sort((a, b) => pageTitle(a).localeCompare(pageTitle(b)) || a.record_id.localeCompare(b.record_id))
    .map((record) => `<li><a href="${dir}/${attr(record.record_id)}.html">${htmlEscape(pageTitle(record))}</a><span>${htmlEscape(record.record_id)}</span></li>`)
    .join("\n");
  const body = `<section class="index-list"><h1>${htmlEscape(title)}</h1><p>${records.length} pages</p><ol>${items}</ol></section>`;
  return htmlShell(title, body, `/${dir}.html`);
}

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

function sourcesIndex(records: MtaCanonicalRecord[]) {
  const items = records
    .sort((a, b) => pageTitle(a).localeCompare(pageTitle(b)) || a.source_id.localeCompare(b.source_id))
    .map((record) => `<li><a href="sources/${attr(record.source_id)}.html">${htmlEscape(pageTitle(record))}</a><span>${htmlEscape(record.source_id)}</span></li>`)
    .join("\n");
  return htmlShell("Sources", `<section class="index-list"><h1>Sources</h1><p>${records.length} citation targets</p><ol>${items}</ol></section>`, "/sources.html");
}

function writeFile(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function pagePath(rootDir: string, record: MtaCanonicalRecord) {
  if (record.record_kind === "source") return join(rootDir, "wiki", "sources", `${record.source_id}.md`);
  const dir = recordDir(record.record_kind);
  if (!dir) return undefined;
  return join(rootDir, "wiki", dir, `${record.record_id}.md`);
}

function hasWikiPage(rootDir: string, record: MtaCanonicalRecord) {
  const path = pagePath(rootDir, record);
  return path !== undefined && existsSync(path);
}

function css() {
  return `:root{color-scheme:light;--ink:#1d2433;--muted:#5b6475;--line:#d8dde7;--bg:#fbfcfe;--panel:#fff;--accent:#0f766e}*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);line-height:1.55}.site-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:12px 24px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.94);backdrop-filter:blur(10px)}.brand{font-weight:700;color:var(--ink);text-decoration:none}nav{display:flex;gap:14px}nav a,a{color:var(--accent)}main{max-width:1180px;margin:0 auto;padding:28px 24px 64px}h1{font-size:clamp(2rem,4vw,4rem);line-height:1.05;margin:0 0 12px}h2{margin-top:32px}.eyebrow,.record-id{color:var(--muted);font-size:.9rem}.home-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:28px 0}.home-grid a{display:block;border:1px solid var(--line);background:var(--panel);padding:18px;text-decoration:none}.home-grid strong{display:block;font-size:2rem;color:var(--ink)}.index-list ol{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}.index-list li{display:grid;grid-template-columns:minmax(0,1fr)minmax(120px,32%);gap:16px;padding:10px 0;border-bottom:1px solid var(--line)}.index-list span{color:var(--muted);font-size:.85rem;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;background:var(--panel);font-size:.92rem}th,td{border:1px solid var(--line);padding:8px;vertical-align:top;text-align:left}td{overflow-wrap:anywhere}.facts th{width:220px}.cap-note{border-left:4px solid var(--accent);padding:10px 12px;background:#eef8f6}.empty-writer{color:var(--muted);background:#f1f4f8;padding:12px}.primitive,.component{border:1px solid var(--line);background:#fff;padding:2px 6px}.primitive-value{font-weight:700}.metric-card{display:inline-block;margin:12px 0;padding:12px 14px}.component-label{color:var(--muted);font-size:.85rem}.component-value{font-size:1.4rem;font-weight:700}.chip-row{display:flex;gap:12px;align-items:center;width:max-content}.source-meta{display:grid;grid-template-columns:120px minmax(0,1fr);gap:6px 16px}.source-meta dt{font-weight:700}.source-meta dd{margin:0}.source-text{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;background:#fff;border:1px solid var(--line);padding:16px;font-size:.9rem}pre,code{font-family:"SFMono-Regular",Consolas,monospace}@media(max-width:720px){.site-header{align-items:flex-start;flex-direction:column}.index-list li{grid-template-columns:1fr}.facts th{width:auto}main{padding:20px 16px 48px}}`;
}

function dirSize(path: string): number {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

function oversizedHtml(path: string, root: string, maxBytes = 3_000_000): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) results.push(...oversizedHtml(full, root, maxBytes));
    else if (entry.isFile() && entry.name.endsWith(".html") && statSync(full).size > maxBytes) results.push(relative(root, full));
  }
  return results.sort();
}

function copyStaticWikiHtml(rootDir: string, outDir: string) {
  for (const filename of ["graph.html", "primitives.html"]) {
    const source = join(rootDir, "wiki", filename);
    if (existsSync(source)) copyFileSync(source, join(outDir, filename));
  }
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(value);
  }
  return result;
}

export function exportSite(options: { rootDir?: string | undefined; outDir?: string | undefined; githubBaseUrl?: string | undefined } = {}): SiteExportResult {
  const rootDir = options.rootDir ?? repoRoot;
  const dbPath = join(rootDir, "data", "canonical.db");
  if (!existsSync(dbPath)) throw new Error(`Missing ${relative(rootDir, dbPath)}. Run bun run materialize before export-site.`);
  const records = readCanonicalRecordsFromDbFile(dbPath);
  if (!records) throw new Error(`Unable to read ${relative(rootDir, dbPath)}. Run bun run materialize before export-site.`);
  const outDir = options.outDir ?? siteOutDir(rootDir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const context: SiteRenderContext = {
    recordsById: new Map(records.map((record) => [record.record_id, record])),
    sourceById: new Map(records.filter((record) => record.record_kind === "source").map((record) => [record.source_id, record])),
    githubBaseUrl: options.githubBaseUrl ?? "https://github.com/mannyc2/mta-wiki/blob/main",
  };

  const routeRecords = records.filter((record) => record.record_kind === "route" && hasWikiPage(rootDir, record));
  const corridorRecords = records.filter((record) => record.record_kind === "corridor" && hasWikiPage(rootDir, record));
  const projectRecords = records.filter((record) => record.record_kind === "project" && hasWikiPage(rootDir, record));
  const sourceRecords = uniqueBy(
    records.filter((record) => record.record_kind === "source" && hasWikiPage(rootDir, record)),
    (record) => record.source_id,
  );

  for (const record of [...routeRecords, ...corridorRecords, ...projectRecords]) {
    const path = pagePath(rootDir, record);
    if (!path || !existsSync(path)) continue;
    const url = recordUrl(record)!;
    writeFile(join(outDir, url.replace(/^\//u, "")), renderRecordPage(record, readFileSync(path, "utf8"), relative(rootDir, path), context));
  }
  for (const record of sourceRecords) {
    const path = pagePath(rootDir, record);
    if (!path || !existsSync(path)) continue;
    const url = recordUrl(record)!;
    writeFile(join(outDir, url.replace(/^\//u, "")), renderSourcePage(record, readFileSync(path, "utf8"), relative(rootDir, path), context));
  }

  writeFile(join(outDir, "routes.html"), indexPage("route", routeRecords));
  writeFile(join(outDir, "corridors.html"), indexPage("corridor", corridorRecords));
  writeFile(join(outDir, "projects.html"), indexPage("project", projectRecords));
  writeFile(join(outDir, "sources.html"), sourcesIndex(sourceRecords));
  writeFile(join(outDir, "index.html"), homePage({ routes: routeRecords.length, corridors: corridorRecords.length, projects: projectRecords.length, sources: sourceRecords.length }));
  writeFile(join(outDir, "404.html"), htmlShell("Not Found", `<h1>Not Found</h1><p>The requested page is not in this static export.</p>`, "/404.html"));
  writeFile(join(outDir, "assets", "site.css"), css());
  copyStaticWikiHtml(rootDir, outDir);

  return {
    outDir,
    pages: { routes: routeRecords.length, corridors: corridorRecords.length, projects: projectRecords.length, sources: sourceRecords.length },
    bytes: dirSize(outDir),
    oversizedPages: oversizedHtml(outDir, outDir),
  };
}
