import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import { stableJson } from "../packages/db/src/stable-json.js";
import { prepareSource } from "../packages/pipeline/src/sources/source-prep.js";

const SOURCE_ID = "mta_ace_routes_may2025_cut";
const DATASET_ID = "ki2b-sg5y";
const DATASET_TITLE = "MTA Bus Automated Camera Enforced Routes: Beginning October 2019";
const DATASET_METADATA_URL = `https://data.ny.gov/api/views/${DATASET_ID}`;
const RETRIEVED_AT = "2026-07-13T15:15:00Z";
const ROWS_UPDATED_AT_EPOCH = 1_781_882_092;
const ROWS_UPDATED_AT = "2026-06-19T15:14:52Z";
const EXPECTED_RESPONSE_SHA256 = "8f206d056b24099c5ff1f03957a94ff06fdfb7c43b52c4630961fbd4ee50b6ea";

const queryUrl = new URL(`https://data.ny.gov/resource/${DATASET_ID}.json`);
queryUrl.searchParams.set("$select", ":id as row_id,route,program,implementation_date");
queryUrl.searchParams.set(
  "$where",
  "program='ACE' AND route in('M2','M4','M42','M100','BX5')",
);
queryUrl.searchParams.set("$order", "implementation_date,route");

const expectedRows = [
  {
    row_id: "row-a83i_fak4-5nyp",
    route: "M2",
    program: "ACE",
    implementation_date: "2025-05-19T00:00:00.000",
  },
  {
    row_id: "row-s8j7-7i64-49jz",
    route: "M4",
    program: "ACE",
    implementation_date: "2025-05-19T00:00:00.000",
  },
  {
    row_id: "row-5mqc-82pi_cjgy",
    route: "BX5",
    program: "ACE",
    implementation_date: "2025-05-27T00:00:00.000",
  },
  {
    row_id: "row-kur9.r4em.mw3w",
    route: "M100",
    program: "ACE",
    implementation_date: "2025-05-27T00:00:00.000",
  },
  {
    row_id: "row-4ih8.hhxj.srtp",
    route: "M42",
    program: "ACE",
    implementation_date: "2025-05-27T00:00:00.000",
  },
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function responseBytes(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "mta-wiki-corpus-completion/1.0",
    },
  });
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/json",
  };
}

const rowResponse = await responseBytes(queryUrl.toString());
assert(
  sha256(rowResponse.bytes) === EXPECTED_RESPONSE_SHA256,
  `Official five-row response changed: expected ${EXPECTED_RESPONSE_SHA256}, found ${sha256(rowResponse.bytes)}`,
);
const rows = JSON.parse(rowResponse.bytes.toString("utf8")) as unknown;
assert(
  stableJson(rows as never) === stableJson(expectedRows as never),
  "Official five-row response no longer matches the reviewed route/date/row-id cut",
);

const metadataResponse = await responseBytes(DATASET_METADATA_URL);
const datasetMetadata = JSON.parse(metadataResponse.bytes.toString("utf8")) as {
  id?: unknown;
  name?: unknown;
  rowsUpdatedAt?: unknown;
};
assert(datasetMetadata.id === DATASET_ID, "Dataset id changed");
assert(datasetMetadata.name === DATASET_TITLE, "Dataset title changed");
assert(datasetMetadata.rowsUpdatedAt === ROWS_UPDATED_AT_EPOCH, "Dataset rowsUpdatedAt changed");

const metadata = {
  sourceId: SOURCE_ID,
  upstreamSourceId: `mta_open_data_${DATASET_ID}_may2025_five_route_cut`,
  title: "MTA ACE Routes — May 2025 Five-Route Official Cut",
  publisher: "Metropolitan Transportation Authority (MTA) Open Data",
  sourceGroup: "operational_dataset_cut",
  intendedUse: ["operational_event_date", "route_scope", "treatment_scope"],
  sourceUrl: queryUrl.toString(),
  finalUrl: queryUrl.toString(),
  datasetId: DATASET_ID,
  datasetTitle: DATASET_TITLE,
  datasetMetadataUrl: DATASET_METADATA_URL,
  datasetRowsUpdatedAt: ROWS_UPDATED_AT,
  documentDate: "2026-06-19",
  retrievedAt: RETRIEVED_AT,
  captureStatus: "captured",
  httpStatus: 200,
  contentType: rowResponse.contentType,
  detectedContentType: "json",
  byteLength: rowResponse.bytes.length,
  sha256: `sha256:${EXPECTED_RESPONSE_SHA256}`,
  rowCount: expectedRows.length,
  stableRowIds: expectedRows.map((row) => row.row_id),
  termsNote: "Targeted official Socrata API cut. Field semantics are separately pinned from the staged official dataset dictionary.",
};

const header = [
  `Official MTA Open Data cut from dataset ${DATASET_ID}.`,
  `Rows updated ${ROWS_UPDATED_AT}.`,
  `Retrieved ${RETRIEVED_AT}.`,
  `Response SHA-256 ${EXPECTED_RESPONSE_SHA256}.`,
].join(" ");
const textSurface = `${[header, ...expectedRows.map((row) => JSON.stringify(row))].join("\n")}\n`;
const outputDir = join(repoRoot, "raw", "sources", SOURCE_ID);
const apply = process.argv.includes("--apply");
let status = "validated";

if (apply && existsSync(outputDir)) {
  const existing = readFileSync(join(outputDir, "source.json"));
  assert(sha256(existing) === EXPECTED_RESPONSE_SHA256, `${SOURCE_ID}/source.json conflicts with reviewed response`);
  status = "already_staged";
} else if (apply) {
  const tempDir = mkdtempSync(join(tmpdir(), `${SOURCE_ID}-`));
  try {
    writeFileSync(join(tempDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    writeFileSync(join(tempDir, "source.json"), rowResponse.bytes);
    writeFileSync(join(tempDir, "text.txt"), textSurface, "utf8");
    prepareSource(tempDir);
    status = "staged";
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const stagedArtifacts = apply
  ? Object.fromEntries(
      ["metadata.json", "source.json", "text.txt", "blocks.jsonl"].map((filename) => {
        const bytes = readFileSync(join(outputDir, filename));
        return [filename, { byte_length: bytes.length, sha256: sha256(bytes) }];
      }),
    )
  : null;

process.stdout.write(`${JSON.stringify({
  mode: apply ? "apply" : "dry_run",
  status,
  source_id: SOURCE_ID,
  query_url: queryUrl.toString(),
  row_count: expectedRows.length,
  rows_updated_at: ROWS_UPDATED_AT,
  response_sha256: EXPECTED_RESPONSE_SHA256,
  cohorts: [
    { implementation_date: "2025-05-19", routes: ["M2", "M4"] },
    { implementation_date: "2025-05-27", routes: ["BX5", "M100", "M42"] },
  ],
  staged_artifacts: stagedArtifacts,
}, null, 2)}\n`);
