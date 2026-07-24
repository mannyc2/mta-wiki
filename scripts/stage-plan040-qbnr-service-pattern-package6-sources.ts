import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";

const downloadRoot = resolve(
  process.argv[2] ?? "/tmp",
);
const serviceChangeSourceId =
  "mta_queens_bus_network_redesign_service_changes";
const serviceChangeHtmlSha256 =
  "4b5dc9ca398980a3803e076378acefd7ac3ec04343e0ac32db95a17c1d51226d";

const sources = [
  {
    sourceId: "mta_qbnr_2025_q102_profile_timetable",
    routeIds: ["Q102"],
    documentId: "181981",
    fileName: "plan040-p6-q102.pdf",
    pdfSha256:
      "1ff3fe6b6229c2ec9576176a96200edee7bcc18072536561c1d47648197a358c",
    pdfBytes: 546891,
    pageCount: 10,
    contentDisposition:
      'inline; filename="Q102 timetable 2025-08-31.pdf"',
    retrievedAt: "2026-07-24T07:02:23Z",
    title: "Q102 MTA Bus timetable effective August 31, 2025",
    sharedDocument: false,
    nonexclusiveContext: false,
    bindingScope:
      "exact_q102_candidate_timetable_nonexhaustive_timepoints",
    rowAnchors: [
      {
        route_id: "Q102",
        route_profile_url:
          "https://www.mta.info/project/queens-bus-network-redesign/routes/q102-local",
        route_profile_anchor_text: "Get more details on Q102 service.",
        timetable_anchor_text: "View the new Q102 timetable.",
      },
    ],
  },
  {
    sourceId: "mta_qbnr_2025_qm16_qm17_profile_timetable",
    routeIds: ["QM16", "QM17"],
    documentId: "182006",
    fileName: "plan040-p6-qm16-qm17.pdf",
    pdfSha256:
      "577cb1a2f0f6b612882ebe074b56e6c328b59a69cdbf4d6fc5c31ab99d4fdb94",
    pdfBytes: 2693618,
    pageCount: 14,
    contentDisposition:
      'inline; filename="QM16-17 timetable 2025-08-31.pdf"',
    retrievedAt: "2026-07-24T07:02:23Z",
    title:
      "QM16/QM17 shared MTA Bus timetable effective September 2, 2025",
    sharedDocument: true,
    nonexclusiveContext: true,
    bindingScope:
      "shared_qm16_qm17_candidate_timetable_nonexclusive_across_two_routes",
    rowAnchors: [
      {
        route_id: "QM16",
        route_profile_url:
          "https://www.mta.info/project/queens-bus-network-redesign/routes/qm16-express",
        route_profile_anchor_text: "Get more details on QM16 service.",
        timetable_anchor_text: "View the new QM16 timetable.",
      },
      {
        route_id: "QM17",
        route_profile_url:
          "https://www.mta.info/project/queens-bus-network-redesign/routes/qm17-express",
        route_profile_anchor_text: "Get more details on QM17 service.",
        timetable_anchor_text: "View the new QM17 timetable.",
      },
    ],
  },
] as const;

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
const writeStable = (path: string, value: unknown): void =>
  writeFileSync(path, `${stableJson(value as JsonValue)}\n`, "utf8");

const stagingRoot = mkdtempSync(
  join(tmpdir(), "plan040-package6-stage-"),
);

for (const source of sources) {
  const inputPdf = join(downloadRoot, source.fileName);
  const inputBytes = readFileSync(inputPdf);
  if (
    inputBytes.byteLength !== source.pdfBytes ||
    sha256(inputBytes) !== source.pdfSha256
  ) {
    throw new Error(
      `${source.routeIds.join("/")}: downloaded PDF identity drifted`,
    );
  }

  const stageDir = join(stagingRoot, source.sourceId);
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
      throw new Error(
        `${source.routeIds.join("/")}: pdftotext failed`,
      );
    }
  }

  const layoutBytes = readFileSync(layoutText);
  const sourceUrl =
    `https://www.mta.info/document/${source.documentId}`;
  const transportUrl =
    `https://new.mta.info/document/${source.documentId}`;
  const sourceRowAnchorDerivations = source.rowAnchors.map((anchor) => ({
    ...anchor,
    phase_2_route_row: anchor.route_id,
    service_change_source_id: serviceChangeSourceId,
    service_change_source_html_sha256: serviceChangeHtmlSha256,
    timetable_href: sourceUrl,
  }));
  writeStable(join(stageDir, "metadata.json"), {
    byteLength: source.pdfBytes,
    contentType: "application/pdf",
    documentDate: "2025",
    finalUrl: sourceUrl,
    publisher: "Metropolitan Transportation Authority",
    retrievedAt: source.retrievedAt,
    sha256: source.pdfSha256,
    sourceGroup: "mta_qbnr_2025_route_profile_timetable",
    sourceId: source.sourceId,
    sourceUrl,
    textLength: layoutBytes.byteLength,
    textSha256: sha256(layoutBytes),
    title: source.title,
  });
  writeStable(join(stageDir, "receipt.json"), {
    anchor_href: sourceUrl,
    anchor_relation: "candidate_timetable_profile",
    authorizes_cross_product: false,
    authorizes_occurrence: false,
    authorizes_study: false,
    binding_scope: source.bindingScope,
    content_disposition: source.contentDisposition,
    content_type: "application/pdf",
    document_is_full_stop_chain: false,
    final_url: sourceUrl,
    nonexclusive_context: source.nonexclusiveContext,
    page_count: source.pageCount,
    pdf_bytes: source.pdfBytes,
    pdf_sha256: source.pdfSha256,
    receipt_id:
      `plan-040-qbnr-package-6-profile-timetable-` +
      `${source.routeIds.join("-").toLowerCase()}-v1`,
    retrieved_at: source.retrievedAt,
    route_ids: [...source.routeIds],
    schema_version: 1,
    service_change_source_id: serviceChangeSourceId,
    shared_document: source.sharedDocument,
    source_id: source.sourceId,
    source_row_anchor_derivations: sourceRowAnchorDerivations,
    source_url: sourceUrl,
    text_bytes: layoutBytes.byteLength,
    text_sha256: sha256(layoutBytes),
    transport_receipt: {
      final_status: 200,
      final_url: sourceUrl,
      redirect_status: 301,
      requested_url: transportUrl,
      response_content_disposition: source.contentDisposition,
      response_content_length: source.pdfBytes,
      response_content_type: "application/pdf",
      retrieved_at: source.retrievedAt,
    },
    transport_url: transportUrl,
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
    throw new Error(
      `${source.routeIds.join("/")}: prepare-source failed`,
    );
  }
}

console.log(
  `Staged ${sources.length} Package 6 exact MTA timetable sources ` +
  `from ${downloadRoot}`,
);
