import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";

const downloadRoot = resolve(
  process.argv[2] ?? "/tmp/plan040-package5-fetch",
);

const sources = [
  {
    routeId: "Q10",
    documentId: "181866",
    fileName: "q10-newmta.pdf",
    pdfSha256:
      "a4889b32f32932b3c0284c0d78147a03a50b21bbcd72be6d4fd1b1587376fdfc",
    pdfBytes: 939118,
    pageCount: 23,
    contentDisposition:
      'inline; filename="Q10-80 timetable 2025-08-31.pdf"',
    retrievedAt: "2026-07-24T06:17:36Z",
    title: "Q10/Q80 MTA Bus timetable effective August 31, 2025",
    anchorKind: "candidate_timetable_profile",
  },
  {
    routeId: "Q35",
    documentId: "181906",
    fileName: "q35-newmta.pdf",
    pdfSha256:
      "fcbd68e2263d94ab5f852364a1b3ccd01b8424fb9a1dc8c1922215b90ed7b3bf",
    pdfBytes: 439421,
    pageCount: 12,
    contentDisposition:
      'inline; filename="Q35 timetable 2025-08-31.pdf"',
    retrievedAt: "2026-07-24T06:17:46Z",
    title: "Q35 MTA Bus timetable effective August 31, 2025",
    anchorKind: "candidate_timetable_profile",
  },
  {
    routeId: "Q40",
    documentId: "181916",
    fileName: "q40-newmta.pdf",
    pdfSha256:
      "6d13cf1f14723fb4832bf399fbe8d75b713a31fb72e505e9da36b5998d7393a7",
    pdfBytes: 349564,
    pageCount: 11,
    contentDisposition:
      'inline; filename="Q40 timetable 2025-08-31.pdf"',
    retrievedAt: "2026-07-24T06:17:47Z",
    title: "Q40 MTA Bus timetable effective August 31, 2025",
    anchorKind: "candidate_timetable_profile",
  },
  {
    routeId: "Q49",
    documentId: "181931",
    fileName: "q49-newmta.pdf",
    pdfSha256:
      "9e3ed730ca334f799723a6131de7a8430e2aef44b191a980ef732272914fb5b5",
    pdfBytes: 343245,
    pageCount: 13,
    contentDisposition:
      'inline; filename="Q49 timetable 2025-08-31.pdf"',
    retrievedAt: "2026-07-24T06:17:48Z",
    title: "Q49 MTA Bus timetable effective August 31, 2025",
    anchorKind: "candidate_timetable_profile",
  },
  {
    routeId: "Q100",
    documentId: "181971",
    fileName: "q100-newmta.pdf",
    pdfSha256:
      "3cb9f2d0ddb58aa2100d5a007d525106601aaccd16e85fc259e397315509a18c",
    pdfBytes: 698313,
    pageCount: 10,
    contentDisposition:
      'inline; filename="Q100 timetable 2025-08-31.pdf"',
    retrievedAt: "2026-07-24T06:17:47Z",
    title: "Q100 MTA Bus timetable effective August 31, 2025",
    anchorKind: "candidate_timetable_profile",
  },
  {
    routeId: "Q19",
    documentId: "82151",
    fileName: "q19.pdf",
    pdfSha256:
      "fc45bbd4228c3c75aa9158bfcbd7d5cfaa840a09599b2cf5ccf277e8c1c6d06c",
    pdfBytes: 402246,
    pageCount: 5,
    contentDisposition: "inline; filename=Q19.pdf",
    retrievedAt: "2026-07-24T06:09:54Z",
    title: "Q19 Queens Bus Network Redesign route profile and stop list",
    anchorKind: "candidate_row_full_stop_list",
  },
  {
    routeId: "Q72",
    documentId: "82796",
    fileName: "q72.pdf",
    pdfSha256:
      "5c06fb57e4a19ea46adf7fdb89b5219380d007a833e71d2791141cd6b9a83a45",
    pdfBytes: 309222,
    pageCount: 4,
    contentDisposition: "inline; filename=Q72.pdf",
    retrievedAt: "2026-07-24T06:09:55Z",
    title: "Q72 Queens Bus Network Redesign route profile and stop list",
    anchorKind: "candidate_row_full_stop_list",
  },
  {
    routeId: "Q104",
    documentId: "82271",
    fileName: "q104.pdf",
    pdfSha256:
      "beae7e1218f0efe903511fbe8f8cb1fb358df13e401d700b1a282a5556792559",
    pdfBytes: 352742,
    pageCount: 4,
    contentDisposition: "inline; filename=Q104_0.pdf",
    retrievedAt: "2026-07-24T06:09:54Z",
    title: "Q104 Queens Bus Network Redesign route profile and stop list",
    anchorKind: "candidate_row_full_stop_list",
  },
  {
    routeId: "QM15",
    documentId: "83001",
    fileName: "qm15.pdf",
    pdfSha256:
      "9eb1c7fe0879a67f49591a41ac9f04803b2df5f604799eb5c16f64f3a03de4de",
    pdfBytes: 637177,
    pageCount: 5,
    contentDisposition: "inline; filename=QM15.pdf",
    retrievedAt: "2026-07-24T06:09:55Z",
    title: "QM15 Queens Bus Network Redesign route profile and stop list",
    anchorKind: "candidate_row_full_stop_list",
  },
  {
    routeId: "QM18",
    documentId: "83031",
    fileName: "qm18.pdf",
    pdfSha256:
      "7d88ac032d0d5c8b083aa2b9ff65e681b8678f28c74f1332877cbf28d24cebb1",
    pdfBytes: 620725,
    pageCount: 5,
    contentDisposition: "inline; filename=QM18.pdf",
    retrievedAt: "2026-07-24T06:09:55Z",
    title: "QM18 Queens Bus Network Redesign route profile and stop list",
    anchorKind: "candidate_row_full_stop_list",
  },
  {
    routeId: "QM24",
    documentId: "83111",
    fileName: "qm24.pdf",
    pdfSha256:
      "485a4f80637ffefd5eed7cc832e50ca979192026784d11416f3c311527751a3b",
    pdfBytes: 798993,
    pageCount: 5,
    contentDisposition: "inline; filename=QM24.pdf",
    retrievedAt: "2026-07-24T06:09:56Z",
    title: "QM24 Queens Bus Network Redesign route profile and stop list",
    anchorKind: "candidate_row_full_stop_list",
  },
  {
    routeId: "QM25",
    documentId: "83121",
    fileName: "qm25.pdf",
    pdfSha256:
      "68fc9e93212d77b6f2b88a7966bc59cf39c8426267fe37af81785b8203751ee4",
    pdfBytes: 503821,
    pageCount: 5,
    contentDisposition: "inline; filename=QM25.pdf",
    retrievedAt: "2026-07-24T06:09:56Z",
    title: "QM25 Queens Bus Network Redesign route profile and stop list",
    anchorKind: "candidate_row_full_stop_list",
  },
] as const;

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
const writeStable = (path: string, value: unknown): void =>
  writeFileSync(path, `${stableJson(value as JsonValue)}\n`, "utf8");

const stagingRoot = mkdtempSync(join(tmpdir(), "plan040-package5-stage-"));

for (const source of sources) {
  const sourceId =
    `mta_qbnr_2025_${source.routeId.toLowerCase()}_${source.anchorKind ===
      "candidate_timetable_profile"
      ? "profile_timetable"
      : "stop_list"}`;
  const inputPdf = join(downloadRoot, source.fileName);
  const inputBytes = readFileSync(inputPdf);
  if (
    inputBytes.byteLength !== source.pdfBytes ||
    sha256(inputBytes) !== source.pdfSha256
  ) {
    throw new Error(`${source.routeId}: downloaded PDF identity drifted`);
  }

  const stageDir = join(stagingRoot, sourceId);
  mkdirSync(stageDir, { recursive: true });
  const stagedPdf = join(stageDir, "source.pdf");
  const layoutText = join(stageDir, "text.txt");
  const rawText = join(stageDir, "text_raw.txt");
  copyFileSync(inputPdf, stagedPdf);

  for (const args of [
    ["-layout", stagedPdf, layoutText],
    [stagedPdf, rawText],
  ]) {
    const result = Bun.spawnSync(["pdftotext", ...args], {
      cwd: repoRoot,
      stdout: "inherit",
      stderr: "inherit",
    });
    if (result.exitCode !== 0) {
      throw new Error(`${source.routeId}: pdftotext failed`);
    }
  }

  const layoutBytes = readFileSync(layoutText);
  const sourceUrl = `https://www.mta.info/document/${source.documentId}`;
  writeStable(join(stageDir, "metadata.json"), {
    byteLength: source.pdfBytes,
    contentType: "application/pdf",
    documentDate: "2025",
    finalUrl: sourceUrl,
    publisher: "Metropolitan Transportation Authority",
    retrievedAt: source.retrievedAt,
    sha256: source.pdfSha256,
    sourceGroup:
      source.anchorKind === "candidate_timetable_profile"
        ? "mta_qbnr_2025_route_profile_timetable"
        : "mta_qbnr_2025_route_stop_list",
    sourceId,
    sourceUrl,
    textLength: layoutBytes.byteLength,
    textSha256: sha256(layoutBytes),
    title: source.title,
  });
  writeStable(join(stageDir, "receipt.json"), {
    anchor_href: sourceUrl,
    anchor_relation: source.anchorKind,
    anchor_text:
      source.anchorKind === "candidate_timetable_profile"
        ? `View the new ${source.routeId} timetable.`
        : "View the full list of stops.",
    authorizes_cross_product: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    content_disposition: source.contentDisposition,
    content_type: "application/pdf",
    final_url: sourceUrl,
    page_count: source.pageCount,
    pdf_bytes: source.pdfBytes,
    pdf_sha256: source.pdfSha256,
    receipt_id:
      `plan-040-qbnr-package-5-${source.anchorKind ===
        "candidate_timetable_profile"
        ? "profile-timetable"
        : "stop-list"}-${source.routeId.toLowerCase()}-v1`,
    retrieved_at: source.retrievedAt,
    route_ids: [source.routeId],
    schema_version: 1,
    service_change_source_id:
      "mta_queens_bus_network_redesign_service_changes",
    transport_url: `https://new.mta.info/document/${source.documentId}`,
    source_id: sourceId,
    source_url: sourceUrl,
    text_bytes: layoutBytes.byteLength,
    text_sha256: sha256(layoutBytes),
  });

  const prepared = Bun.spawnSync([
    "bun",
    "packages/cli/src/cli.ts",
    "prepare-source",
    stageDir,
  ], {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (prepared.exitCode !== 0) {
    throw new Error(`${source.routeId}: prepare-source failed`);
  }
}

console.log(
  `Staged ${sources.length} Package 5 exact MTA stop-list sources from ${downloadRoot}`,
);
