import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { prepareSource } from "../packages/pipeline/src/sources/source-prep.js";

const SOURCE_ID = "nyc_dot_gun_hill_road_completion_2023";
const SOURCE_URL = "https://www.nyc.gov/html/dot/html/pr2023/east-gun-hill-road-redesign.shtml";
const RETRIEVED_AT = "2026-07-14T22:29:28Z";
const REVIEWED_SOURCE_SHA256 = "66d8005f4c919f2dc65edc8acc0d926c213df833486ee857e38586ecc3937a99";
const REVIEWED_SOURCE_BYTE_LENGTH = 30_117;
const REVIEWED_METADATA_SHA256 = "bb26f2761fbdf79d94ae0df62e24551ce10391595e66f0da8066f216f9ff439c";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

const outputDir = join(repoRoot, "raw", "sources", SOURCE_ID);
const apply = process.argv.includes("--apply");
const existing = apply && existsSync(outputDir);
const httpStatus = 200;
const contentType = "text/html; charset=utf-8";
let sourceBytes: Buffer;

if (existing) {
  sourceBytes = readFileSync(join(outputDir, "source.html"));
  const stagedMetadata = JSON.parse(readFileSync(join(outputDir, "metadata.json"), "utf8")) as {
    sha256?: unknown;
    byteLength?: unknown;
  };
  assert(stagedMetadata.sha256 === `sha256:${sha256(sourceBytes)}`, `${SOURCE_ID} metadata hash is stale`);
  assert(stagedMetadata.byteLength === sourceBytes.length, `${SOURCE_ID} metadata byte length is stale`);
} else {
  const response = await fetch(SOURCE_URL, {
    headers: {
      Accept: "text/html",
      "User-Agent": "mta-wiki-rc19-reconciliation/1.0",
    },
  });
  assert(response.ok, `${SOURCE_URL} returned HTTP ${response.status}`);
  assert(response.status === httpStatus, `Official source returned unexpected HTTP ${response.status}`);
  assert(response.url === SOURCE_URL, `Official source redirected to unexpected URL ${response.url}`);
  assert(response.headers.get("content-type")?.toLowerCase().includes("text/html"), "Official source is no longer HTML");
  sourceBytes = Buffer.from(await response.arrayBuffer());
}
const sourceSha256 = sha256(sourceBytes);
assert(
  sourceBytes.length === REVIEWED_SOURCE_BYTE_LENGTH && sourceSha256 === REVIEWED_SOURCE_SHA256,
  `Official source snapshot changed; expected ${REVIEWED_SOURCE_BYTE_LENGTH} bytes/${REVIEWED_SOURCE_SHA256}, ` +
    `found ${sourceBytes.length} bytes/${sourceSha256}. Stage a newly reviewed source id instead of replacing this snapshot.`,
);
const sourceText = sourceBytes.toString("utf8");
for (const literal of [
  "October 31, 2023",
  "substantial completion",
  "Bx28 and Bx38",
  "from Bainbridge Avenue to Bartow Avenue",
  "3.1 miles",
]) {
  assert(sourceText.includes(literal), `Official source lost reviewed literal ${JSON.stringify(literal)}`);
}

const metadata = {
  sourceId: SOURCE_ID,
  title: "NYC DOT Celebrates Completion of East Gun Hill Road Redesign",
  publisher: "New York City Department of Transportation (NYC DOT)",
  sourceGroup: "bus_priority_document",
  intendedUse: [
    "bus_priority_project_context",
    "bus_lane_candidate",
    "operational_date_candidate",
    "route_link_candidate",
    "treated_segment_candidate",
    "source_card",
  ],
  priority: 1,
  sourceUrl: SOURCE_URL,
  finalUrl: SOURCE_URL,
  documentDate: "2023-10-31",
  retrievedAt: RETRIEVED_AT,
  ocrHint: "not_needed",
  termsNote: "Official public agency page; use short excerpts and source links in public artifacts.",
  captureStatus: "captured",
  httpStatus,
  contentType,
  detectedContentType: "html",
  byteLength: sourceBytes.length,
  sha256: `sha256:${sourceSha256}`,
  rawArtifactKey: `sources/${SOURCE_ID}/source.html`,
  textArtifactKey: null,
  textLength: 0,
  textExtractionStatus: "html_text_pending",
  error: null,
  stagedAt: RETRIEVED_AT,
  stagedFrom: SOURCE_URL,
};
const metadataBytes = `${JSON.stringify(metadata, null, 2)}\n`;
assert(sha256(metadataBytes) === REVIEWED_METADATA_SHA256, "Deterministic reviewed metadata serialization changed");

let status = "validated";

if (apply) {
  const tempDir = mkdtempSync(join(tmpdir(), `${SOURCE_ID}-`));
  try {
    writeFileSync(join(tempDir, "metadata.json"), metadataBytes, "utf8");
    writeFileSync(join(tempDir, "source.html"), sourceBytes);
    prepareSource(tempDir);
    // prepareSource records wall-clock time and its temporary input directory. Those
    // fields are useful for ordinary imports but would make this reviewed snapshot
    // impossible to reproduce. Restore the source-specific, pinned acquisition
    // metadata after preparation so a clean replay is byte-identical.
    writeFileSync(join(outputDir, "metadata.json"), metadataBytes, "utf8");
    assert(sha256(readFileSync(join(outputDir, "metadata.json"))) === REVIEWED_METADATA_SHA256, "Staged metadata replay is not byte-identical");
    status = existing ? "restaged" : "staged";
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const stagedArtifacts = apply
  ? Object.fromEntries(
      ["metadata.json", "source.html", "text.txt", "blocks.jsonl"].map((filename) => {
        const bytes = readFileSync(join(outputDir, filename));
        return [filename, { byte_length: bytes.length, sha256: sha256(bytes) }];
      }),
    )
  : null;

process.stdout.write(`${JSON.stringify({
  mode: apply ? "apply" : "dry_run",
  status,
  source_id: SOURCE_ID,
  source_url: SOURCE_URL,
  retrieved_at: RETRIEVED_AT,
  response_sha256: sourceSha256,
  staged_artifacts: stagedArtifacts,
}, null, 2)}\n`);
