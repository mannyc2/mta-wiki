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

const RETRIEVED_AT = "2026-07-24T03:10:09Z";
const SOURCE_GROUP = "mta_qbnr_2025_route_stop_list";

const SPECS = [
  ["Q1", "81901"],
  ["Q110", "128461"],
  ["Q111", "82416"],
  ["Q112", "128466"],
  ["Q114", "82436"],
  ["Q15", "128416"],
  ["Q16", "82121"],
  ["Q23", "82216"],
  ["Q26", "82281"],
  ["Q27", "82291"],
  ["Q30", "128426"],
  ["Q38", "82371"],
  ["Q65", "82726"],
  ["Q76", "81911"],
  ["Q77", "81951"],
  ["Q83", "82021"],
  ["Q88", "82211"],
  ["QM12", "82926"],
  ["QM20", "83076"],
  ["QM36", "83196"],
  ["QM42", "128481"],
  ["QM63", "83226"],
  ["QM68", "83256"],
  ["QM8", "82906"],
] as const;

type StopListReceipt = {
  schema_version: 1;
  receipt_id: string;
  route_id: string;
  source_id: string;
  source_url: string;
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

function exactWrite(path: string, bytes: Uint8Array | string): void {
  if (existsSync(path)) {
    const current = readFileSync(path);
    const expected = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
    if (!current.equals(expected)) throw new Error(`Refusing to overwrite changed ${path}`);
    return;
  }
  writeFileSync(path, bytes);
}

function extractPdfText(pdfPath: string): string {
  const result = Bun.spawnSync(
    ["pdftotext", "-layout", "-enc", "UTF-8", pdfPath, "-"],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) {
    throw new Error(`pdftotext failed for ${pdfPath}: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

function extractPdfRawText(pdfPath: string): string {
  const result = Bun.spawnSync(
    ["pdftotext", "-raw", "-enc", "UTF-8", pdfPath, "-"],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) {
    throw new Error(`pdftotext -raw failed for ${pdfPath}: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

function pageCount(pdfPath: string): number {
  const result = Bun.spawnSync(["pdfinfo", pdfPath], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`pdfinfo failed for ${pdfPath}: ${result.stderr.toString()}`);
  }
  const match = result.stdout.toString().match(/^Pages:\s+(\d+)$/mu);
  if (!match) throw new Error(`pdfinfo omitted page count for ${pdfPath}`);
  return Number(match[1]);
}

function verifyExisting(
  receiptPath: string,
  pdfPath: string,
  textPath: string,
  expectedRouteId: string,
  expectedSourceId: string,
  expectedUrl: string,
): StopListReceipt {
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as StopListReceipt;
  const pdf = readFileSync(pdfPath);
  const text = readFileSync(textPath);
  if (
    receipt.route_id !== expectedRouteId ||
    receipt.source_id !== expectedSourceId ||
    receipt.source_url !== expectedUrl ||
    receipt.pdf_bytes !== pdf.byteLength ||
    receipt.pdf_sha256 !== sha256(pdf) ||
    receipt.text_bytes !== text.byteLength ||
    receipt.text_sha256 !== sha256(text) ||
    receipt.page_count !== pageCount(pdfPath) ||
    receipt.authorizes_occurrence !== false ||
    receipt.authorizes_study !== false ||
    receipt.authorizes_cross_product !== false
  ) {
    throw new Error(`${expectedRouteId}: existing stop-list receipt drifted`);
  }
  return receipt;
}

async function acquire(
  routeId: string,
  documentId: string,
  check: boolean,
): Promise<StopListReceipt> {
  const id = sourceId(routeId);
  const url = `https://www.mta.info/document/${documentId}`;
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
    const receipt = verifyExisting(receiptPath, pdfPath, textPath, routeId, id, url);
    const rawText = extractPdfRawText(pdfPath);
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
    throw new Error(`${routeId}: MTA download failed: ${response.stderr.toString()}`);
  }
  const metadataMatch = response.stderr.toString().match(
    /CURL_META\t([^\t\r\n]+)\t([^\r\n]+)$/u,
  );
  if (!metadataMatch) throw new Error(`${routeId}: curl omitted response metadata`);
  const contentType = metadataMatch[1]!.split(";")[0]!.trim();
  const finalUrl = metadataMatch[2]!;
  if (contentType !== "application/pdf") {
    throw new Error(`${routeId}: expected application/pdf, received ${contentType}`);
  }
  const pdf = new Uint8Array(response.stdout);
  if (pdf.byteLength < 5 || Buffer.from(pdf.subarray(0, 5)).toString() !== "%PDF-") {
    throw new Error(`${routeId}: response lacks a PDF signature`);
  }
  mkdirSync(root, { recursive: true });
  exactWrite(pdfPath, pdf);
  const text = extractPdfText(pdfPath);
  exactWrite(textPath, text);
  exactWrite(rawTextPath, extractPdfRawText(pdfPath));
  const receipt: StopListReceipt = {
    schema_version: 1,
    receipt_id: `plan-040-qbnr-package-2-stop-list-${routeId.toLowerCase()}-v1`,
    route_id: routeId,
    source_id: id,
    source_url: url,
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
  exactWrite(metadataPath, `${stableJson(metadata as unknown as JsonValue)}\n`);
  exactWrite(receiptPath, `${stableJson(receipt as unknown as JsonValue)}\n`);
  return receipt;
}

const check = process.argv.includes("--check");
const receipts: StopListReceipt[] = [];
for (const [routeId, documentId] of SPECS) {
  const receipt = await acquire(routeId, documentId, check);
  const blocks = rebuildSourceBlocks(receipt.source_id);
  if (blocks.blockCount === 0) {
    throw new Error(`${routeId}: source preparation produced no evidence blocks`);
  }
  receipts.push(receipt);
}
console.log(JSON.stringify({
  status: check ? "checked" : "acquired",
  source_count: receipts.length,
  route_ids: receipts.map((receipt) => receipt.route_id),
  total_pdf_bytes: receipts.reduce((sum, receipt) => sum + receipt.pdf_bytes, 0),
}));
