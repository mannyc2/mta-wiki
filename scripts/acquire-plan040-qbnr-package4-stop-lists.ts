import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import { rebuildSourceBlocks } from "../packages/pipeline/src/sources/source-prep";

const RETRIEVED_AT = "2026-07-24T05:01:38Z";
const SOURCE_GROUP = "mta_qbnr_2025_route_stop_list";
const SERVICE_CHANGES_HTML = join(
  repoRoot,
  "raw/sources/mta_queens_bus_network_redesign_service_changes/source.html",
);

const ROUTE_IDS = [
  "Q12",
  "Q17",
  "Q2",
  "Q25",
  "Q29",
  "Q3",
  "Q31",
  "Q39",
  "Q43",
  "Q50",
  "Q54",
  "Q55",
  "Q58",
  "Q59",
  "Q64",
  "Q66",
  "QM2",
  "QM4",
  "QM5",
  "Q42",
  "QM21",
  "QM32",
  "QM35",
] as const;

type StopListReceipt = {
  schema_version: 1;
  receipt_id: string;
  route_ids: string[];
  source_id: string;
  source_url: string;
  source_url_derivation: {
    source_id: "mta_queens_bus_network_redesign_service_changes";
    source_html_sha256: string;
    route_row: string;
    anchor_text: "View the full list of stops.";
  };
  final_url: string;
  retrieved_at: string;
  content_type: string;
  content_disposition: string | null;
  pdf_bytes: number;
  pdf_sha256: string;
  text_bytes: number;
  text_sha256: string;
  page_count: number;
  authorizes_occurrence: false;
  authorizes_study: false;
  authorizes_cross_product: false;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceId(routeId: string): string {
  return `mta_qbnr_2025_${routeId.toLowerCase()}_stop_list`;
}

function decodeEmbeddedHtml(value: string): string {
  return value
    .replaceAll("\\u003C", "<")
    .replaceAll("\\u003E", ">")
    .replaceAll("\\u0022", "\"")
    .replaceAll("\\u0026", "&")
    .replaceAll("\\/", "/");
}

function stopListUrl(sourceHtml: string, routeId: string): string {
  const marker = `"Route":{"value":"${routeId}"`;
  const start = sourceHtml.indexOf(marker);
  if (start < 0) throw new Error(`${routeId}: route row absent from source HTML`);
  const next = sourceHtml.indexOf(`"Route":{"value":"`, start + marker.length);
  const row = decodeEmbeddedHtml(
    sourceHtml.slice(start, next < 0 ? sourceHtml.length : next),
  );
  const anchors = [...row.matchAll(
    /<a\b[^>]*href="(https:\/\/www\.mta\.info\/document\/\d+)"[^>]*>([^<]*)<\/a>/giu,
  )];
  const matches = anchors.filter((match) =>
    match[2]?.replace(/\s+/gu, " ").trim() === "View the full list of stops.");
  if (matches.length !== 1 || !matches[0]?.[1]) {
    throw new Error(
      `${routeId}: expected one exact stop-list anchor, received ${matches.length}`,
    );
  }
  return matches[0][1];
}

function exactWrite(path: string, bytes: Uint8Array | string): void {
  if (existsSync(path)) {
    const current = readFileSync(path);
    const expected =
      typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
    if (!current.equals(expected)) {
      throw new Error(`Refusing to overwrite changed ${path}`);
    }
    return;
  }
  writeFileSync(path, bytes);
}

function extractPdfText(pdfPath: string, mode: "-layout" | "-raw"): string {
  const result = Bun.spawnSync(
    ["pdftotext", mode, "-enc", "UTF-8", pdfPath, "-"],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `pdftotext ${mode} failed for ${pdfPath}: ${result.stderr.toString()}`,
    );
  }
  return result.stdout.toString();
}

function pageCount(pdfPath: string): number {
  const result = Bun.spawnSync(
    ["pdfinfo", pdfPath],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `pdfinfo failed for ${pdfPath}: ${result.stderr.toString()}`,
    );
  }
  const match = result.stdout.toString().match(/^Pages:\s+(\d+)$/mu);
  if (!match) throw new Error(`pdfinfo omitted page count for ${pdfPath}`);
  return Number(match[1]);
}

function verifyExisting(
  receiptPath: string,
  pdfPath: string,
  textPath: string,
  routeId: string,
  expectedSourceId: string,
  expectedUrl: string,
  sourceHtmlSha256: string,
): StopListReceipt {
  const receipt = JSON.parse(
    readFileSync(receiptPath, "utf8"),
  ) as StopListReceipt;
  const pdf = readFileSync(pdfPath);
  const text = readFileSync(textPath);
  if (
    stableJson(receipt.route_ids as JsonValue) !==
      stableJson([routeId] as JsonValue) ||
    receipt.source_id !== expectedSourceId ||
    receipt.source_url !== expectedUrl ||
    receipt.source_url_derivation.source_html_sha256 !== sourceHtmlSha256 ||
    receipt.source_url_derivation.route_row !== routeId ||
    receipt.source_url_derivation.anchor_text !==
      "View the full list of stops." ||
    receipt.pdf_bytes !== pdf.byteLength ||
    receipt.pdf_sha256 !== sha256(pdf) ||
    receipt.text_bytes !== text.byteLength ||
    receipt.text_sha256 !== sha256(text) ||
    receipt.page_count !== pageCount(pdfPath) ||
    receipt.authorizes_occurrence !== false ||
    receipt.authorizes_study !== false ||
    receipt.authorizes_cross_product !== false
  ) {
    throw new Error(`${routeId}: existing stop-list receipt drifted`);
  }
  return receipt;
}

async function acquire(
  routeId: string,
  url: string,
  sourceHtmlSha256: string,
  check: boolean,
): Promise<StopListReceipt> {
  const id = sourceId(routeId);
  const root = join(repoRoot, "raw", "sources", id);
  const pdfPath = join(root, "source.pdf");
  const textPath = join(root, "text.txt");
  const rawTextPath = join(root, "text_raw.txt");
  const metadataPath = join(root, "metadata.json");
  const receiptPath = join(root, "receipt.json");
  if (
    existsSync(pdfPath) &&
    existsSync(textPath) &&
    existsSync(metadataPath) &&
    existsSync(receiptPath)
  ) {
    const receipt = verifyExisting(
      receiptPath,
      pdfPath,
      textPath,
      routeId,
      id,
      url,
      sourceHtmlSha256,
    );
    const rawText = extractPdfText(pdfPath, "-raw");
    if (check && !existsSync(rawTextPath)) {
      throw new Error(`${routeId}: raw-order PDF text is not staged`);
    }
    exactWrite(rawTextPath, rawText);
    return receipt;
  }
  if (check) throw new Error(`${routeId}: stop-list source is not staged`);

  const response = Bun.spawnSync([
    "curl",
    "-sSL",
    "--fail",
    "--max-time",
    "60",
    "-w",
    "%{stderr}CURL_META\\t%{content_type}\\t%{url_effective}",
    url,
  ], { stdout: "pipe", stderr: "pipe" });
  if (response.exitCode !== 0) {
    throw new Error(
      `${routeId}: MTA download failed: ${response.stderr.toString()}`,
    );
  }
  const metadataMatch = response.stderr.toString().match(
    /CURL_META\t([^\t\r\n]+)\t([^\r\n]+)$/u,
  );
  if (!metadataMatch) throw new Error(`${routeId}: curl omitted metadata`);
  const contentType = metadataMatch[1]!.split(";")[0]!.trim();
  const finalUrl = metadataMatch[2]!;
  if (contentType !== "application/pdf") {
    throw new Error(
      `${routeId}: expected application/pdf, received ${contentType}`,
    );
  }
  const pdf = new Uint8Array(response.stdout);
  if (
    pdf.byteLength < 5 ||
    Buffer.from(pdf.subarray(0, 5)).toString() !== "%PDF-"
  ) {
    throw new Error(`${routeId}: response lacks a PDF signature`);
  }
  mkdirSync(root, { recursive: true });
  exactWrite(pdfPath, pdf);
  const text = extractPdfText(pdfPath, "-layout");
  const rawText = extractPdfText(pdfPath, "-raw");
  exactWrite(textPath, text);
  exactWrite(rawTextPath, rawText);
  const receipt: StopListReceipt = {
    schema_version: 1,
    receipt_id:
      `plan-040-qbnr-package-4-stop-list-${routeId.toLowerCase()}-v1`,
    route_ids: [routeId],
    source_id: id,
    source_url: url,
    source_url_derivation: {
      source_id: "mta_queens_bus_network_redesign_service_changes",
      source_html_sha256: sourceHtmlSha256,
      route_row: routeId,
      anchor_text: "View the full list of stops.",
    },
    final_url: finalUrl,
    retrieved_at: RETRIEVED_AT,
    content_type: contentType,
    content_disposition: null,
    pdf_bytes: pdf.byteLength,
    pdf_sha256: sha256(pdf),
    text_bytes: Buffer.byteLength(text),
    text_sha256: sha256(text),
    page_count: pageCount(pdfPath),
    authorizes_occurrence: false,
    authorizes_study: false,
    authorizes_cross_product: false,
  };
  const metadata = {
    sourceId: id,
    title: `${routeId} Queens Bus Network Redesign route profile and stop list`,
    publisher: "Metropolitan Transportation Authority",
    sourceGroup: SOURCE_GROUP,
    sourceUrl: url,
    finalUrl,
    documentDate: "2025",
    retrievedAt: RETRIEVED_AT,
    contentType,
    byteLength: pdf.byteLength,
    sha256: receipt.pdf_sha256,
    textLength: text.length,
    textSha256: receipt.text_sha256,
  };
  exactWrite(metadataPath, `${stableJson(metadata as JsonValue)}\n`);
  exactWrite(receiptPath, `${stableJson(receipt as unknown as JsonValue)}\n`);
  return receipt;
}

const sourceHtml = readFileSync(SERVICE_CHANGES_HTML, "utf8");
const sourceHtmlSha256 = sha256(sourceHtml);
const urls = new Map(
  ROUTE_IDS.map((routeId) => [routeId, stopListUrl(sourceHtml, routeId)]),
);
const check = process.argv.includes("--check");
const receipts: StopListReceipt[] = [];
for (const routeId of ROUTE_IDS) {
  const receipt = await acquire(
    routeId,
    urls.get(routeId)!,
    sourceHtmlSha256,
    check,
  );
  const blocks = rebuildSourceBlocks(receipt.source_id);
  if (blocks.blockCount === 0) {
    throw new Error(
      `${routeId}: source preparation produced no evidence blocks`,
    );
  }
  receipts.push(receipt);
}

console.log(JSON.stringify({
  status: check ? "checked" : "acquired",
  source_html_sha256: sourceHtmlSha256,
  source_count: receipts.length,
  candidate_count: receipts.length,
  route_ids: receipts.map((receipt) => receipt.route_ids[0]),
  document_urls: Object.fromEntries(urls),
  total_pdf_bytes: receipts.reduce(
    (sum, receipt) => sum + receipt.pdf_bytes,
    0,
  ),
}));
