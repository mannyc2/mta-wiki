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

const RETRIEVED_AT = "2026-07-24T04:21:07Z";
const SOURCE_GROUP = "mta_qbnr_2025_route_stop_list";

const SPECS = [
  { routeIds: ["Q11"], documentId: "82081" },
  { routeIds: ["Q18"], documentId: "82141" },
  { routeIds: ["Q22"], documentId: "82186" },
  { routeIds: ["Q32"], documentId: "82326" },
  { routeIds: ["Q33", "Q47"], documentId: "82496" },
  { routeIds: ["Q37"], documentId: "82361" },
  { routeIds: ["Q41"], documentId: "128436" },
  { routeIds: ["Q60"], documentId: "82641" },
  { routeIds: ["Q67"], documentId: "82751" },
  { routeIds: ["Q69"], documentId: "82776" },
  { routeIds: ["Q101"], documentId: "128451" },
  { routeIds: ["Q103"], documentId: "128456" },
] as const;

type StopListReceipt = {
  schema_version: 1;
  receipt_id: string;
  route_ids: string[];
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

function sourceId(routeIds: readonly string[]): string {
  return `mta_qbnr_2025_${routeIds.map((routeId) => routeId.toLowerCase()).join("_")}_stop_list`;
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

function extractPdfText(pdfPath: string, mode: "-layout" | "-raw"): string {
  const result = Bun.spawnSync(
    ["pdftotext", mode, "-enc", "UTF-8", pdfPath, "-"],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) {
    throw new Error(`pdftotext ${mode} failed for ${pdfPath}: ${result.stderr.toString()}`);
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
  expectedRouteIds: readonly string[],
  expectedSourceId: string,
  expectedUrl: string,
): StopListReceipt {
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as StopListReceipt;
  const pdf = readFileSync(pdfPath);
  const text = readFileSync(textPath);
  if (
    stableJson(receipt.route_ids as JsonValue) !== stableJson([...expectedRouteIds] as JsonValue) ||
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
    throw new Error(`${expectedRouteIds.join("/")}: existing stop-list receipt drifted`);
  }
  return receipt;
}

async function acquire(
  routeIds: readonly string[],
  documentId: string,
  check: boolean,
): Promise<StopListReceipt> {
  const id = sourceId(routeIds);
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
    const receipt = verifyExisting(
      receiptPath,
      pdfPath,
      textPath,
      routeIds,
      id,
      url,
    );
    const rawText = extractPdfText(pdfPath, "-raw");
    if (check && !existsSync(rawTextPath)) {
      throw new Error(`${routeIds.join("/")}: raw-order PDF text is not staged`);
    }
    exactWrite(rawTextPath, rawText);
    return receipt;
  }
  if (check) throw new Error(`${routeIds.join("/")}: stop-list source is not staged`);

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
      `${routeIds.join("/")}: MTA download failed: ${response.stderr.toString()}`,
    );
  }
  const metadataMatch = response.stderr.toString().match(
    /CURL_META\t([^\t\r\n]+)\t([^\r\n]+)$/u,
  );
  if (!metadataMatch) throw new Error(`${routeIds.join("/")}: curl omitted response metadata`);
  const contentType = metadataMatch[1]!.split(";")[0]!.trim();
  const finalUrl = metadataMatch[2]!;
  if (contentType !== "application/pdf") {
    throw new Error(
      `${routeIds.join("/")}: expected application/pdf, received ${contentType}`,
    );
  }
  const pdf = new Uint8Array(response.stdout);
  if (pdf.byteLength < 5 || Buffer.from(pdf.subarray(0, 5)).toString() !== "%PDF-") {
    throw new Error(`${routeIds.join("/")}: response lacks a PDF signature`);
  }
  mkdirSync(root, { recursive: true });
  exactWrite(pdfPath, pdf);
  const text = extractPdfText(pdfPath, "-layout");
  exactWrite(textPath, text);
  exactWrite(rawTextPath, extractPdfText(pdfPath, "-raw"));
  const receipt: StopListReceipt = {
    schema_version: 1,
    receipt_id:
      `plan-040-qbnr-package-3-stop-list-${routeIds.map((routeId) =>
        routeId.toLowerCase()).join("-")}-v1`,
    route_ids: [...routeIds],
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
  const routeLabel = routeIds.join("/");
  const metadata = {
    sourceId: id,
    title: `${routeLabel} Queens Bus Network Redesign route profile and stop list`,
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
for (const spec of SPECS) {
  const receipt = await acquire(spec.routeIds, spec.documentId, check);
  const blocks = rebuildSourceBlocks(receipt.source_id);
  if (blocks.blockCount === 0) {
    throw new Error(`${receipt.route_ids.join("/")}: source preparation produced no evidence blocks`);
  }
  receipts.push(receipt);
}
console.log(JSON.stringify({
  status: check ? "checked" : "acquired",
  source_count: receipts.length,
  candidate_count: receipts.reduce((sum, receipt) => sum + receipt.route_ids.length, 0),
  route_ids: receipts.flatMap((receipt) => receipt.route_ids),
  total_pdf_bytes: receipts.reduce((sum, receipt) => sum + receipt.pdf_bytes, 0),
}));
