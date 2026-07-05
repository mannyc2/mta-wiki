import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { marked } from "marked";
import { repoRoot } from "@mta-wiki/core/paths";
import { openCanonicalDb } from "@mta-wiki/db/canonical-db";
import type { JsonObject, JsonValue, MtaCanonicalRecord, MtaEvidenceRef } from "@mta-wiki/db/types";
import { parseBlockPrimitives } from "@mta-wiki/pipeline/materialize/primitives";
import { readCanonicalRecordsFromDbFile } from "@mta-wiki/pipeline/materialize/materialize";

const SITE_KINDS = ["route", "corridor", "project"] as const;
const SOURCE_TEXT_CAP_BYTES = 1_000_000;
const LARGE_MARKDOWN_CAP_BYTES = 2_000_000;
const LARGE_WRITER_CAP_BYTES = 120_000;
const TABLE_ROW_CAP = 200;
const SITE_BASE_URL = "https://mannyc2.github.io/mta-wiki";

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

type RelatedEntry = { id: string; kind: string; title: string; url: string; relation: string };

export type SiteRenderContext = {
  recordsById: Map<string, MtaCanonicalRecord>;
  sourceById: Map<string, MtaCanonicalRecord>;
  githubBaseUrl: string;
  sourcePageIds: Set<string>;
  relatedByRecordId: Map<string, RelatedEntry[]>;
  linkedKindCounts: Map<string, Map<string, number>>;
  pageBearingIds: Set<string>;
  citedByBlock: Map<string, Map<string, string[]>>;
  citingRecordsBySource: Map<string, string[]>;
};

type FeaturedEntry = { title: string; url: string; evidence: number; blurb: string };

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

function blurbFor(record: MtaCanonicalRecord) {
  const text = asString(record.payload.description) ?? record.raw_text ?? "";
  if (text.length <= 160) return text;
  const cut = text.slice(0, 160);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 80 ? space : 160)}…`;
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
    if (!context.sourcePageIds.has(id)) {
      return `<span class="citation-link citation-unresolved" title="source ${attr(id)} is not in this export">${cleanLabel}</span>`;
    }
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
  if (refs.length === 0) return "";
  const rows = limit ? refs.slice(0, limit) : refs;
  const body = rows
    .map((ref) => {
      const source = context.sourceById.get(ref.source_id);
      const sourceUrl = relativeRecordUrl(fromUrl, `/sources/${ref.source_id}.html`) + (ref.block_id ? `#${encodeURIComponent(ref.block_id)}` : "");
      const sourceCell = context.sourcePageIds.has(ref.source_id)
        ? `<a href="${attr(sourceUrl)}">${htmlEscape(sourceTitle(source, ref.source_id))}</a>`
        : htmlEscape(sourceTitle(source, ref.source_id));
      return [
        "<tr>",
        `<td>${sourceCell}</td>`,
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
  return [
    `<details class="panel" data-pagefind-ignore>`,
    `<summary>Citations (${refs.length})</summary>`,
    `<section class="evidence">`,
    note,
    `<table><thead><tr><th>Source</th><th>Block</th><th>Publisher</th><th>Date</th><th>Quote</th></tr></thead><tbody>`,
    body,
    `</tbody></table>`,
    `</section>`,
    `</details>`,
  ].join("\n");
}

const KIND_FACT_KEYS: Record<string, string[]> = {
  route: ["route_id", "route_type_normalized", "route_type", "borough_normalized", "borough", "service_variant"],
  project: ["project_family", "project_type", "status", "document_time_status", "borough_normalized", "borough", "date_normalized"],
  corridor: ["street", "from", "to", "limits", "borough_normalized", "borough"],
};

function metaFacts(record: MtaCanonicalRecord): Array<[string, string]> {
  const keys = KIND_FACT_KEYS[record.record_kind] ?? [];
  const boroughNormalized = asString(record.payload.borough_normalized);
  const routeTypeNormalized = asString(record.payload.route_type_normalized);
  const pairs: Array<[string, string]> = [];
  for (const key of keys) {
    if (key === "borough" && boroughNormalized !== undefined) continue;
    if (key === "route_type" && routeTypeNormalized !== undefined) continue;
    const value = asString(record.payload[key]);
    if (value === undefined) continue;
    pairs.push([key, value.slice(0, 120)]);
  }
  return pairs;
}

function humanizeKind(kind: string) {
  return kind.replace(/_/gu, " ");
}

function linkedCountsSuffix(counts: Map<string, number> | undefined) {
  if (!counts || counts.size === 0) return "";
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, count]) => `${count} ${htmlEscape(humanizeKind(kind))}`);
  return ` · linked records: ${parts.join(" · ")}`;
}

function sourceChipsHtml(record: MtaCanonicalRecord, context: SiteRenderContext, fromUrl: string) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const ref of record.evidence_refs) {
    if (seen.has(ref.source_id)) continue;
    seen.add(ref.source_id);
    ids.push(ref.source_id);
  }
  const shown = ids.slice(0, 12);
  const chips = shown.map((id) => {
    const source = context.sourceById.get(id);
    const label = htmlEscape(sourceTitle(source, id).slice(0, 60));
    if (context.sourcePageIds.has(id)) {
      const chipUrl = relativeRecordUrl(fromUrl, `/sources/${id}.html`);
      return `<a class="chip" href="${attr(chipUrl)}">${label}</a>`;
    }
    return `<span class="chip">${label}</span>`;
  });
  const more = ids.length > 12 ? `<span class="chip chip-more">+${ids.length - 12} more</span>` : "";
  if (chips.length === 0 && !more) return "";
  return `<div class="source-chips">${chips.join("")}${more}</div>`;
}

const RELATED_GROUP_ORDER: Array<{ kind: string; label: string }> = [
  { kind: "route", label: "Routes" },
  { kind: "corridor", label: "Corridors" },
  { kind: "project", label: "Projects" },
];

function relatedPagesHtml(record: MtaCanonicalRecord, context: SiteRenderContext, fromUrl: string) {
  const entries = context.relatedByRecordId.get(record.record_id);
  if (!entries || entries.length === 0) return "";
  const sections = RELATED_GROUP_ORDER.map(({ kind, label }) => {
    const groupEntries = entries.filter((entry) => entry.kind === kind);
    if (groupEntries.length === 0) return "";
    const shown = groupEntries.slice(0, 12);
    const items = shown
      .map(
        (entry) =>
          `<li><a href="${attr(relativeRecordUrl(fromUrl, entry.url))}" title="${attr(humanizeKind(entry.relation))}">${htmlEscape(entry.title)}</a></li>`,
      )
      .join("");
    const more = groupEntries.length > 12 ? `<p class="cap-note-inline">+${groupEntries.length - 12} more not shown</p>` : "";
    return `<div class="related-group"><h3>${htmlEscape(label)}</h3><ul>${items}</ul>${more}</div>`;
  }).join("");
  if (!sections) return "";
  return `<section class="related"><h2>Related pages</h2>${sections}</section>`;
}

function payloadSummary(record: MtaCanonicalRecord) {
  const rowEntries = Object.entries(record.payload)
    .filter(([key, value]) => !key.startsWith("_") && value !== undefined)
    .slice(0, 24);
  if (rowEntries.length === 0) return "";
  const rows = rowEntries
    .map(([key, value]) => `<tr><th>${htmlEscape(key)}</th><td>${htmlEscape(compactJson(value as JsonValue)).slice(0, 500)}</td></tr>`)
    .join("\n");
  return `<details class="panel"><summary>Structured data (${rowEntries.length} fields)</summary><section class="facts"><table>${rows}</table></section></details>`;
}

function htmlShell(title: string, body: string, currentUrl: string, options: { description?: string; headExtra?: string } = {}) {
  const depth = currentUrl.split("/").filter(Boolean).length - 1;
  const prefix = depth <= 0 ? "" : "../".repeat(depth);
  const description = options.description ?? "Structured, source-cited records about MTA and NYC bus-priority routes, corridors, and projects.";
  const canonical = `${SITE_BASE_URL}${currentUrl}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${attr(description)}">
<link rel="canonical" href="${attr(canonical)}">
<meta property="og:title" content="${attr(title)} - MTA Wiki">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${attr(canonical)}">
<meta property="og:type" content="article">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%9A%8C%3C/text%3E%3C/svg%3E">
${options.headExtra ?? ""}
<title>${htmlEscape(title)} - MTA Wiki</title>
<link rel="stylesheet" href="${prefix}assets/site.css">
</head>
<body>
<header class="site-header">
  <a class="brand" href="${prefix}index.html">MTA Wiki</a>
  <nav><a href="${prefix}routes.html">Routes</a><a href="${prefix}corridors.html">Corridors</a><a href="${prefix}projects.html">Projects</a><a href="${prefix}sources.html">Sources</a></nav>
  <form class="site-search" action="${prefix}search.html" method="get" role="search">
    <input type="search" name="q" placeholder="Search the wiki" aria-label="Search the wiki">
  </form>
</header>
<main data-pagefind-body>
${body}
</main>
<footer class="site-footer">
<p>Built from public NYC/MTA government records. Every structured record cites evidence
blocks in official source documents. Data was extracted with an LLM pipeline and may
contain errors — verify against the cited sources.</p>
<p><a href="https://github.com/mannyc2/mta-wiki">GitHub repository</a> · <a href="https://github.com/mannyc2/mta-wiki/tree/main/data/exports/releases">Data releases</a> · MIT-licensed code · To request a correction or takedown, <a href="https://github.com/mannyc2/mta-wiki/issues">open a GitHub issue</a>.</p>
</footer>
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

function sourceMetaRows(record: MtaCanonicalRecord): string {
  const rows: Array<[string, string]> = [["Source ID", record.source_id]];
  const publisher = asString(record.payload.publisher);
  if (publisher) rows.push(["Publisher", publisher]);
  const dateNormalized = asString(record.payload.published_date_normalized);
  const datePrecision = asString(record.payload.published_date_precision);
  const dateText = asString(record.payload.date_text);
  if (dateNormalized) rows.push(["Date", datePrecision ? `${dateNormalized} (${datePrecision})` : dateNormalized]);
  else if (dateText) rows.push(["Date", dateText]);
  const contentType = asString(record.payload.content_type);
  if (contentType) rows.push(["Document type", contentType]);
  const authorityTier = asString(record.payload.authority_tier);
  if (authorityTier) rows.push(["Authority tier", humanizeKind(authorityTier)]);
  const retrievedAt = asString(record.payload.retrieved_at);
  if (retrievedAt) rows.push(["Retrieved", retrievedAt]);
  const description = asString(record.payload.description);
  if (description) rows.push(["Description", description.slice(0, 500)]);
  return rows.map(([key, value]) => `<dt>${htmlEscape(key)}</dt><dd>${htmlEscape(value)}</dd>`).join("");
}

function sourceLinksHtml(record: MtaCanonicalRecord, blob: string) {
  const rawUrl = asString(record.payload.source_url) ?? asString(record.payload.url);
  const original = rawUrl && /^https?:\/\//u.test(rawUrl) ? `<a href="${attr(rawUrl)}" rel="noopener">Original document ↗</a>` : "";
  return `<p class="source-links">${original}<a href="${attr(blob)}">Wiki markdown on GitHub</a></p>`;
}

function blockCitedByHtml(sourceId: string, blockId: string, context: SiteRenderContext, fromUrl: string) {
  const citingIds = context.citedByBlock.get(sourceId)?.get(blockId);
  if (!citingIds || citingIds.length === 0) return "";
  const n = citingIds.length;
  const linkableIds = citingIds.filter((id) => context.pageBearingIds.has(id)).slice(0, 3);
  const links = linkableIds
    .map((id) => {
      const citingRecord = context.recordsById.get(id);
      const targetUrl = citingRecord ? recordUrl(citingRecord) : undefined;
      if (!citingRecord || !targetUrl) return undefined;
      return `<a href="${attr(relativeRecordUrl(fromUrl, targetUrl))}">${htmlEscape(pageTitle(citingRecord))}</a>`;
    })
    .filter((entry): entry is string => entry !== undefined);
  const more = n - links.length;
  const suffix = links.length > 0 ? `: ${links.join(", ")}${more > 0 ? ` +${more} more` : ""}` : "";
  return `<p class="block-cited" data-pagefind-ignore>Cited by ${n} record${n === 1 ? "" : "s"}${suffix}</p>`;
}

function renderSourceBlock(block: { id: string; text: string }, seenIds: Set<string>, sourceId: string, context: SiteRenderContext, fromUrl: string): string {
  const isFirst = !seenIds.has(block.id);
  seenIds.add(block.id);
  const idAttr = isFirst ? ` id="${attr(block.id)}"` : "";
  const refLabel = `[${htmlEscape(block.id)}]`;
  const ref = isFirst
    ? `<a class="block-ref" href="#${attr(block.id)}" data-pagefind-ignore>${refLabel}</a>`
    : `<span class="block-ref">${refLabel}</span>`;
  return [`<section class="src-block"${idAttr}>`, ref, `<pre>${htmlEscape(block.text)}</pre>`, blockCitedByHtml(sourceId, block.id, context, fromUrl), `</section>`].join(
    "\n",
  );
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
  const title = pageTitle(record);
  const dir = recordDir(record.record_kind)!;
  const kindLabel = `${record.record_kind[0]!.toUpperCase()}${record.record_kind.slice(1)}`;
  const facts = metaFacts(record);
  const chipFacts = facts.filter(([key]) => key === "status" || key === "document_time_status");
  const gridFacts = facts.filter(([key]) => key !== "status" && key !== "document_time_status");
  const distinctSourceCount = new Set(record.evidence_refs.map((ref) => ref.source_id)).size;
  const citationCount = record.evidence_refs.length;
  const body = [
    `<article class="record-page ${attr(record.record_kind)}">`,
    `<nav class="crumbs"><a href="../index.html">Home</a> / <a href="../${attr(dir)}.html">${htmlEscape(kindLabel)}s</a> / <span>${htmlEscape(title)}</span></nav>`,
    `<p class="eyebrow" data-pagefind-filter="kind">${htmlEscape(record.record_kind)}</p>`,
    `<h1>${htmlEscape(title)}</h1>`,
    `<p class="record-id">${htmlEscape(record.record_id)}</p>`,
    [
      `<div class="chips">`,
      `<span class="chip">${htmlEscape(record.truth_status)}</span>`,
      `<span class="chip">${htmlEscape(record.review_state)}</span>`,
      chipFacts.map(([key, value]) => `<span class="chip">${htmlEscape(key)}: ${htmlEscape(value)}</span>`).join(""),
      `</div>`,
    ].join(""),
    gridFacts.length > 0
      ? `<dl class="meta-grid">${gridFacts.map(([key, value]) => `<dt>${htmlEscape(key)}</dt><dd>${htmlEscape(value)}</dd>`).join("")}</dl>`
      : "",
    `<p class="cite-line">Cited from ${distinctSourceCount} sources · ${citationCount} citations${linkedCountsSuffix(context.linkedKindCounts.get(record.record_id))}</p>`,
    sourceChipsHtml(record, context, url),
    capNote,
    bodyHtml,
    writerCapNote,
    payloadSummary(record),
    evidenceRows(record, context, url, large ? TABLE_ROW_CAP : undefined, large ? blob : undefined),
    relatedPagesHtml(record, context, url),
    `</article>`,
  ].join("\n");
  return htmlShell(title, body, url, {
    description: `${record.record_kind} ${title} — structured MTA Wiki record with ${citationCount} citations from ${distinctSourceCount} sources.`,
  });
}

function renderSourcePage(record: MtaCanonicalRecord, markdown: string, path: string, context: SiteRenderContext) {
  const url = recordUrl(record)!;
  const title = pageTitle(record);
  const parsed = parseWikiPage(markdown);
  const bodyBytes = Buffer.byteLength(parsed.body);
  const blob = wikiBlobUrl(path, context.githubBaseUrl);
  const parsedBlocks = parseSourceBlocks(parsed.body);

  let note: string;
  let bodyContent: string;
  if (parsedBlocks.blocks.length === 0) {
    const truncated = bodyBytes > SOURCE_TEXT_CAP_BYTES;
    const visible = truncated ? parsed.body.slice(0, SOURCE_TEXT_CAP_BYTES) : parsed.body;
    note = truncated
      ? `<p class="cap-note">showing first ${SOURCE_TEXT_CAP_BYTES} bytes of ${bodyBytes} - <a href="${attr(blob)}">full data in the repository</a></p>`
      : "";
    bodyContent = `<pre class="source-text">${sourceAnchorHtml(visible)}</pre>`;
  } else {
    const preamble = parsedBlocks.preamble.trim();
    const preambleHtml = preamble ? `<pre class="source-text">${htmlEscape(preamble)}</pre>` : "";
    const seenIds = new Set<string>();
    const renderedSections: string[] = [];
    let usedBytes = 0;
    let shownBlocks = 0;
    let truncated = false;
    for (const block of parsedBlocks.blocks) {
      const blockBytes = Buffer.byteLength(block.text);
      if (usedBytes + blockBytes > SOURCE_TEXT_CAP_BYTES) {
        const remaining = SOURCE_TEXT_CAP_BYTES - usedBytes;
        if (remaining > 0) {
          const slicedText = block.text.slice(0, remaining);
          renderedSections.push(renderSourceBlock({ id: block.id, text: slicedText }, seenIds, record.source_id, context, url));
          usedBytes += Buffer.byteLength(slicedText);
          shownBlocks += 1;
        }
        truncated = true;
        break;
      }
      renderedSections.push(renderSourceBlock(block, seenIds, record.source_id, context, url));
      usedBytes += blockBytes;
      shownBlocks += 1;
    }
    note = truncated
      ? `<p class="cap-note">showing first ${usedBytes} of ${bodyBytes} bytes (${shownBlocks} of ${parsedBlocks.blocks.length} blocks) - <a href="${attr(blob)}">full data in the repository</a></p>`
      : "";
    bodyContent = [preambleHtml, ...renderedSections].join("\n");
  }

  const citingCount = context.citingRecordsBySource.get(record.source_id)?.length ?? 0;
  const citedBlockCount = context.citedByBlock.get(record.source_id)?.size ?? 0;
  const publisher = asString(record.payload.publisher);

  const body = [
    `<article class="source-page">`,
    `<nav class="crumbs"><a href="../index.html">Home</a> / <a href="../sources.html">Sources</a> / <span>${htmlEscape(title)}</span></nav>`,
    `<p class="eyebrow" data-pagefind-filter="kind">source</p>`,
    `<h1>${htmlEscape(title)}</h1>`,
    `<p class="record-id">${htmlEscape(record.source_id)}</p>`,
    `<dl class="source-meta">${sourceMetaRows(record)}</dl>`,
    `<p class="cite-line">Cited by ${citingCount} records · ${citedBlockCount} blocks cited</p>`,
    sourceLinksHtml(record, blob),
    note,
    bodyContent,
    `</article>`,
  ].join("\n");
  return htmlShell(title, body, url, {
    description: `Source document: ${title}${publisher ? `, ${publisher}` : ""} — cited by ${citingCount} records in the MTA Wiki.`,
  });
}

const INDEX_FILTER_INPUT = `<input type="search" class="index-filter" placeholder="Filter by name or id" aria-label="Filter this list">`;
const INDEX_FILTER_SCRIPT = `<script>
(function () {
  var input = document.querySelector(".index-filter");
  if (!input) return;
  var items = Array.prototype.slice.call(document.querySelectorAll(".index-list ol li"));
  input.addEventListener("input", function () {
    var q = input.value.toLowerCase();
    items.forEach(function (li) { li.hidden = q !== "" && li.textContent.toLowerCase().indexOf(q) === -1; });
  });
})();
</script>`;

function indexPage(kind: SiteRecordKind, records: MtaCanonicalRecord[]) {
  const title = `${kind[0]!.toUpperCase()}${kind.slice(1)}s`;
  const dir = recordDir(kind)!;
  const items = records
    .sort((a, b) => pageTitle(a).localeCompare(pageTitle(b)) || a.record_id.localeCompare(b.record_id))
    .map((record) => `<li><a href="${dir}/${attr(record.record_id)}.html">${htmlEscape(pageTitle(record))}</a><span>${htmlEscape(record.record_id)}</span></li>`)
    .join("\n");
  const body = `<section class="index-list"><h1>${htmlEscape(title)}</h1><p>${records.length} pages</p>${INDEX_FILTER_INPUT}<ol>${items}</ol>${INDEX_FILTER_SCRIPT}</section>`;
  return htmlShell(title, body, `/${dir}.html`);
}

function featuredSectionHtml(kindLabel: string, entries: FeaturedEntry[], totalCount: number, indexHref: string) {
  const items = entries
    .map(
      (entry) =>
        `<li><a href="${attr(entry.url.replace(/^\//u, ""))}">${htmlEscape(entry.title)}</a><span class="featured-evidence">${entry.evidence} citations</span>${entry.blurb ? `<p>${htmlEscape(entry.blurb)}</p>` : ""}</li>`,
    )
    .join("\n");
  return `<section class="home-featured"><h2>Most documented ${htmlEscape(kindLabel)}s</h2><ol>${items}</ol><p><a href="${attr(indexHref)}">All ${totalCount} ${htmlEscape(kindLabel)}s →</a></p></section>`;
}

function homePage(data: {
  counts: SiteExportResult["pages"];
  stats: { records: number; evidenceRefs: number; metricClaims: number; relations: number; events: number; claims: number };
  featured: { routes: FeaturedEntry[]; corridors: FeaturedEntry[]; projects: FeaturedEntry[] };
}) {
  const { counts, stats, featured } = data;
  const body = `<section class="home">
<h1>MTA Wiki</h1>
<p>Structured, source-cited records about MTA and NYC bus-priority routes, corridors, and
projects — extracted from public government documents.</p>
<form class="home-search" action="search.html" method="get" role="search">
<input type="search" name="q" placeholder="Search routes, projects, corridors, sources…" aria-label="Search the wiki">
<button type="submit">Search</button>
</form>
<div class="home-grid">
<a href="routes.html"><strong>${counts.routes}</strong><span>Routes</span></a>
<a href="corridors.html"><strong>${counts.corridors}</strong><span>Corridors</span></a>
<a href="projects.html"><strong>${counts.projects}</strong><span>Projects</span></a>
<a href="sources.html"><strong>${counts.sources}</strong><span>Source citation targets</span></a>
<a href="graph.html"><strong>→</strong><span>Relation graph</span></a>
<a href="primitives.html"><strong>→</strong><span>Primitive reference</span></a>
</div>
</section>
<section class="home-stats"><h2>What's inside</h2>
<ul>
<li><strong>${stats.records.toLocaleString("en-US")}</strong><span>canonical records</span></li>
<li><strong>${stats.evidenceRefs.toLocaleString("en-US")}</strong><span>evidence citations</span></li>
<li><strong>${stats.metricClaims.toLocaleString("en-US")}</strong><span>metric claims</span></li>
<li><strong>${stats.relations.toLocaleString("en-US")}</strong><span>relations</span></li>
<li><strong>${stats.events.toLocaleString("en-US")}</strong><span>events</span></li>
<li><strong>${stats.claims.toLocaleString("en-US")}</strong><span>claims</span></li>
</ul>
<p>Counts are computed from the canonical database at export time.</p>
</section>
${featuredSectionHtml("route", featured.routes, counts.routes, "routes.html")}
${featuredSectionHtml("corridor", featured.corridors, counts.corridors, "corridors.html")}
${featuredSectionHtml("project", featured.projects, counts.projects, "projects.html")}
<section class="home-provenance"><h2>Where this data comes from</h2>
<p>Sources are public NYC/MTA government records obtained from public agency websites. Every
structured record cites evidence blocks in the source documents, and source pages are
exported as citation targets.</p>
<p>Extraction is LLM-assisted and may contain errors; extracted text and derived data are
provided for research and reference. To request a correction or takedown,
<a href="https://github.com/mannyc2/mta-wiki/issues">open a GitHub issue</a>.</p>
</section>`;
  return htmlShell("Home", body, "/index.html", {
    description:
      "Research workbench for MTA and NYC bus-priority knowledge: searchable, source-cited routes, corridors, projects, and source documents.",
  });
}

function sourcesIndex(records: MtaCanonicalRecord[]) {
  const items = records
    .sort((a, b) => pageTitle(a).localeCompare(pageTitle(b)) || a.source_id.localeCompare(b.source_id))
    .map((record) => `<li><a href="sources/${attr(record.source_id)}.html">${htmlEscape(pageTitle(record))}</a><span>${htmlEscape(record.source_id)}</span></li>`)
    .join("\n");
  return htmlShell("Sources", `<section class="index-list"><h1>Sources</h1><p>${records.length} citation targets</p>${INDEX_FILTER_INPUT}<ol>${items}</ol>${INDEX_FILTER_SCRIPT}</section>`, "/sources.html");
}

function searchPage() {
  const body = [
    `<section class="search-page">`,
    `<h1>Search</h1>`,
    `<p class="search-hint">Searches all exported route, corridor, project, and source pages. Use the kind filter to narrow results.</p>`,
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

function sitemapXml(urls: string[]) {
  const body = [...urls].sort().map((u) => `<url><loc>${htmlEscape(u)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
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
  return `:root{color-scheme:light;--ink:#1d2433;--muted:#5b6475;--line:#d8dde7;--bg:#fbfcfe;--panel:#fff;--accent:#0f766e}*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);line-height:1.55}.site-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:12px 24px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.94);backdrop-filter:blur(10px)}.brand{font-weight:700;color:var(--ink);text-decoration:none}nav{display:flex;gap:14px}nav a,a{color:var(--accent)}main{max-width:1180px;margin:0 auto;padding:28px 24px 64px}h1{font-size:clamp(2rem,4vw,4rem);line-height:1.05;margin:0 0 12px}h2{margin-top:32px}.eyebrow,.record-id{color:var(--muted);font-size:.9rem}.home-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:28px 0}.home-grid a{display:block;border:1px solid var(--line);background:var(--panel);padding:18px;text-decoration:none}.home-grid strong{display:block;font-size:2rem;color:var(--ink)}.index-list ol{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}.index-list li{display:grid;grid-template-columns:minmax(0,1fr)minmax(120px,32%);gap:16px;padding:10px 0;border-bottom:1px solid var(--line)}.index-list span{color:var(--muted);font-size:.85rem;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;background:var(--panel);font-size:.92rem}th,td{border:1px solid var(--line);padding:8px;vertical-align:top;text-align:left}td{overflow-wrap:anywhere}.facts th{width:220px}.cap-note{border-left:4px solid var(--accent);padding:10px 12px;background:#eef8f6}.empty-writer{color:var(--muted);background:#f1f4f8;padding:12px}.primitive,.component{border:1px solid var(--line);background:#fff;padding:2px 6px}.primitive-value{font-weight:700}.metric-card{display:inline-block;margin:12px 0;padding:12px 14px}.component-label{color:var(--muted);font-size:.85rem}.component-value{font-size:1.4rem;font-weight:700}.chip-row{display:flex;gap:12px;align-items:center;width:max-content}.source-meta{display:grid;grid-template-columns:120px minmax(0,1fr);gap:6px 16px}.source-meta dt{font-weight:700}.source-meta dd{margin:0}.source-text{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;background:#fff;border:1px solid var(--line);padding:16px;font-size:.9rem}pre,code{font-family:"SFMono-Regular",Consolas,monospace}.site-search input{border:1px solid var(--line);padding:6px 10px;min-width:210px;font:inherit;background:#fff}.site-footer{border-top:1px solid var(--line);margin-top:48px;padding:20px 24px;color:var(--muted);font-size:.9rem;max-width:1180px;margin-left:auto;margin-right:auto}.search-page #search{margin-top:16px}.index-filter{margin:12px 0;border:1px solid var(--line);padding:8px 10px;font:inherit;width:min(420px,100%)}.citation-unresolved{color:var(--muted);border-bottom:1px dotted var(--muted)}.home-search{display:flex;gap:8px;margin:20px 0;max-width:560px}.home-search input{flex:1;border:1px solid var(--line);padding:12px 14px;font:inherit}.home-search button{border:1px solid var(--accent);background:var(--accent);color:#fff;padding:12px 18px;font:inherit;cursor:pointer}.home-stats ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;list-style:none;margin:16px 0;padding:0}.home-stats li{border:1px solid var(--line);background:var(--panel);padding:14px}.home-stats strong{display:block;font-size:1.5rem}.home-stats span{color:var(--muted);font-size:.85rem}.home-featured ol{list-style:none;margin:12px 0;padding:0}.home-featured li{border-bottom:1px solid var(--line);padding:12px 0}.home-featured p{margin:4px 0 0;color:var(--muted);font-size:.92rem}.featured-evidence{color:var(--muted);font-size:.85rem;margin-left:10px}.home-provenance{border:1px solid var(--line);background:var(--panel);padding:18px 20px;margin-top:36px}.home-provenance p{margin:8px 0;color:var(--muted)}.crumbs{font-size:.85rem;color:var(--muted);margin-bottom:8px}.crumbs a{color:var(--muted)}.chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.chip{border:1px solid var(--line);background:var(--panel);padding:2px 10px;font-size:.82rem;border-radius:999px;color:var(--muted)}.chip a{text-decoration:none}.chip-more{border-style:dashed}.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:4px 18px;margin:12px 0;border:1px solid var(--line);background:var(--panel);padding:12px 14px}.meta-grid dt{font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.meta-grid dd{margin:0 0 8px;overflow-wrap:anywhere}.cite-line{color:var(--muted);font-size:.9rem}.source-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 18px}details.panel{border:1px solid var(--line);background:var(--panel);margin:18px 0}details.panel summary{cursor:pointer;padding:10px 14px;font-weight:600}details.panel[open] summary{border-bottom:1px solid var(--line)}details.panel section{padding:0 14px 14px}.related-group ul{list-style:none;padding:0;margin:6px 0;display:flex;flex-wrap:wrap;gap:8px}.related-group li a{border:1px solid var(--line);background:var(--panel);padding:4px 10px;display:inline-block;text-decoration:none}.cap-note-inline{color:var(--muted);font-size:.85rem}.src-block{border:1px solid var(--line);border-left:3px solid var(--line);background:var(--panel);margin:10px 0;padding:8px 12px;scroll-margin-top:72px}.src-block:target{border-left-color:var(--accent);background:#eef8f6;outline:1px solid var(--accent)}.src-block pre{border:0;padding:0;margin:6px 0 0;background:transparent;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.9rem}.block-ref{font-family:"SFMono-Regular",Consolas,monospace;font-size:.78rem;color:var(--muted);text-decoration:none}.block-cited{margin:6px 0 0;font-size:.82rem;color:var(--muted);border-top:1px dashed var(--line);padding-top:6px}.source-links a{margin-right:14px}@media(max-width:720px){.site-header{align-items:flex-start;flex-direction:column}.site-search{width:100%}.site-search input{width:100%}.index-list li{grid-template-columns:1fr}.facts th{width:auto}main{padding:20px 16px 48px}}`;
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

function copyStaticWikiHtml(rootDir: string, outDir: string): string[] {
  const copied: string[] = [];
  for (const filename of ["graph.html", "primitives.html"]) {
    const source = join(rootDir, "wiki", filename);
    if (existsSync(source)) {
      copyFileSync(source, join(outDir, filename));
      copied.push(filename);
    }
  }
  return copied;
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

export function exportSite(options: { rootDir?: string | undefined; outDir?: string | undefined; githubBaseUrl?: string | undefined } = {}): SiteExportResult {
  const rootDir = options.rootDir ?? repoRoot;
  const dbPath = join(rootDir, "data", "canonical.db");
  if (!existsSync(dbPath)) throw new Error(`Missing ${relative(rootDir, dbPath)}. Run bun run materialize before export-site.`);
  const records = readCanonicalRecordsFromDbFile(dbPath);
  if (!records) throw new Error(`Unable to read ${relative(rootDir, dbPath)}. Run bun run materialize before export-site.`);
  const relationEdges = readRelationEdges(dbPath);
  const evidenceRefRows = readEvidenceRefRows(dbPath);
  const outDir = options.outDir ?? siteOutDir(rootDir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const routeRecords = records.filter((record) => record.record_kind === "route" && hasWikiPage(rootDir, record));
  const corridorRecords = records.filter((record) => record.record_kind === "corridor" && hasWikiPage(rootDir, record));
  const projectRecords = records.filter((record) => record.record_kind === "project" && hasWikiPage(rootDir, record));
  const sourceRecords = uniqueBy(
    records.filter((record) => record.record_kind === "source" && hasWikiPage(rootDir, record)),
    (record) => record.source_id,
  );

  const context: SiteRenderContext = {
    recordsById: new Map(records.map((record) => [record.record_id, record])),
    sourceById: new Map(records.filter((record) => record.record_kind === "source").map((record) => [record.source_id, record])),
    githubBaseUrl: options.githubBaseUrl ?? "https://github.com/mannyc2/mta-wiki/blob/main",
    sourcePageIds: new Set(sourceRecords.map((record) => record.source_id)),
    relatedByRecordId: new Map(),
    linkedKindCounts: new Map(),
    pageBearingIds: new Set([...routeRecords, ...corridorRecords, ...projectRecords].map((r) => r.record_id)),
    citedByBlock: new Map(),
    citingRecordsBySource: new Map(),
  };

  function addRelated(fromId: string, other: MtaCanonicalRecord, relation: string) {
    const list = context.relatedByRecordId.get(fromId) ?? [];
    if (!list.some((entry) => entry.id === other.record_id)) {
      list.push({ id: other.record_id, kind: other.record_kind, title: pageTitle(other), url: recordUrl(other)!, relation });
    }
    context.relatedByRecordId.set(fromId, list);
  }

  for (const edge of relationEdges) {
    const subject = context.recordsById.get(edge.subject_id);
    const object = context.recordsById.get(edge.object_id);
    if (!subject || !object) continue;
    for (const [me, other] of [
      [subject, object],
      [object, subject],
    ] as const) {
      if (!context.pageBearingIds.has(me.record_id)) continue;
      const counts = context.linkedKindCounts.get(me.record_id) ?? new Map<string, number>();
      counts.set(other.record_kind, (counts.get(other.record_kind) ?? 0) + 1);
      context.linkedKindCounts.set(me.record_id, counts);
      if (context.pageBearingIds.has(other.record_id)) addRelated(me.record_id, other, edge.relation_kind);
    }
  }
  for (const list of context.relatedByRecordId.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }

  const citingBySourceSets = new Map<string, Set<string>>();
  const citedByBlockSets = new Map<string, Map<string, Set<string>>>();
  for (const row of evidenceRefRows) {
    const citingRecord = context.recordsById.get(row.record_id);
    if (citingRecord?.record_kind === "source" && citingRecord.source_id === row.source_id) continue;
    const citingSet = citingBySourceSets.get(row.source_id) ?? new Set<string>();
    citingSet.add(row.record_id);
    citingBySourceSets.set(row.source_id, citingSet);
    if (row.block_id !== null) {
      const blockMap = citedByBlockSets.get(row.source_id) ?? new Map<string, Set<string>>();
      const blockSet = blockMap.get(row.block_id) ?? new Set<string>();
      blockSet.add(row.record_id);
      blockMap.set(row.block_id, blockSet);
      citedByBlockSets.set(row.source_id, blockMap);
    }
  }
  for (const [sourceId, set] of citingBySourceSets) {
    context.citingRecordsBySource.set(sourceId, [...set].sort());
  }
  for (const [sourceId, blockMap] of citedByBlockSets) {
    const outBlockMap = new Map<string, string[]>();
    for (const [blockId, set] of blockMap) outBlockMap.set(blockId, [...set].sort());
    context.citedByBlock.set(sourceId, outBlockMap);
  }

  const siteUrls: string[] = [];

  for (const record of [...routeRecords, ...corridorRecords, ...projectRecords]) {
    const path = pagePath(rootDir, record);
    if (!path || !existsSync(path)) continue;
    const url = recordUrl(record)!;
    writeFile(join(outDir, url.replace(/^\//u, "")), renderRecordPage(record, readFileSync(path, "utf8"), relative(rootDir, path), context));
    siteUrls.push(`${SITE_BASE_URL}${url}`);
  }
  for (const record of sourceRecords) {
    const path = pagePath(rootDir, record);
    if (!path || !existsSync(path)) continue;
    const url = recordUrl(record)!;
    writeFile(join(outDir, url.replace(/^\//u, "")), renderSourcePage(record, readFileSync(path, "utf8"), relative(rootDir, path), context));
    siteUrls.push(`${SITE_BASE_URL}${url}`);
  }

  writeFile(join(outDir, "routes.html"), indexPage("route", routeRecords));
  writeFile(join(outDir, "corridors.html"), indexPage("corridor", corridorRecords));
  writeFile(join(outDir, "projects.html"), indexPage("project", projectRecords));
  writeFile(join(outDir, "sources.html"), sourcesIndex(sourceRecords));

  const kindCounts = new Map<string, number>();
  for (const record of records) kindCounts.set(record.record_kind, (kindCounts.get(record.record_kind) ?? 0) + 1);
  const evidenceRefTotal = records.reduce((sum, record) => sum + record.evidence_refs.length, 0);

  function featured(list: MtaCanonicalRecord[], limit: number): FeaturedEntry[] {
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

  writeFile(
    join(outDir, "index.html"),
    homePage({
      counts: { routes: routeRecords.length, corridors: corridorRecords.length, projects: projectRecords.length, sources: sourceRecords.length },
      stats: {
        records: records.length,
        evidenceRefs: evidenceRefTotal,
        metricClaims: kindCounts.get("metric_claim") ?? 0,
        relations: kindCounts.get("relation") ?? 0,
        events: kindCounts.get("event") ?? 0,
        claims: kindCounts.get("claim") ?? 0,
      },
      featured: {
        routes: featured(routeRecords, 6),
        corridors: featured(corridorRecords, 4),
        projects: featured(projectRecords, 6),
      },
    }),
  );
  writeFile(join(outDir, "404.html"), htmlShell("Not Found", `<h1>Not Found</h1><p>The requested page is not in this static export.</p>`, "/404.html"));
  writeFile(join(outDir, "search.html"), searchPage());
  writeFile(join(outDir, "assets", "site.css"), css());
  const copiedStaticHtml = copyStaticWikiHtml(rootDir, outDir);

  siteUrls.push(
    `${SITE_BASE_URL}/routes.html`,
    `${SITE_BASE_URL}/corridors.html`,
    `${SITE_BASE_URL}/projects.html`,
    `${SITE_BASE_URL}/sources.html`,
    `${SITE_BASE_URL}/index.html`,
    `${SITE_BASE_URL}/search.html`,
    ...copiedStaticHtml.map((filename) => `${SITE_BASE_URL}/${filename}`),
  );
  writeFile(join(outDir, "sitemap.xml"), sitemapXml(siteUrls));
  writeFile(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_BASE_URL}/sitemap.xml\n`);

  return {
    outDir,
    pages: { routes: routeRecords.length, corridors: corridorRecords.length, projects: projectRecords.length, sources: sourceRecords.length },
    bytes: dirSize(outDir),
    oversizedPages: oversizedHtml(outDir, outDir),
  };
}
