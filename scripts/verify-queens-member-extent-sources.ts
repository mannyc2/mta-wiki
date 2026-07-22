import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { repoRoot } from "../packages/core/src/paths";

const RECEIPT_PATH = join(
  repoRoot,
  "data/quality/acquisition/receipts/q45-q86-q87-member-extents-2025.json",
);
const MANIFEST_PATH = join(
  repoRoot,
  "data/quality/acquisition/manifests/q45-q86-q87-member-extents-2025.json",
);

type EvidenceBlock = {
  evidence_id: string;
  staged_block_id: string;
  staged_text_surface: string;
  raw_text: string;
  raw_text_sha256: string;
};

type SourceReceipt = {
  source_id: string;
  source_url: string;
  artifact: {
    path: string;
    byte_length: number;
    sha256: string;
    capture_url: string;
    archive_timestamp: string;
    archive_digest: string;
  };
  reviewed_capture_sha256: string;
  evidence_blocks: EvidenceBlock[];
};

type Receipt = {
  schema_version: number;
  receipt_id: string;
  sources: SourceReceipt[];
};

type ManifestSource = {
  source_id: string;
  source_url: string;
  capture_url: string;
  archive_timestamp: string;
  archive_digest: string;
  content_type: string;
  byte_length: number;
  sha256: string;
  hydration_path: string;
};

type Manifest = {
  schema_version: number;
  manifest_id: string;
  retention_contract: string;
  tracked_full_artifacts: boolean;
  offline_fixture: {
    path: string;
    byte_length: number;
    sha256: string;
    evidence_block_count: number;
  };
  verification_command: string;
  hydration_command: string;
  clean_clone_requires_network: boolean;
  sources: ManifestSource[];
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fail(message: string): never {
  throw new Error(message);
}

function validateFixture(receipt: Receipt, manifest: Manifest): void {
  if (
    receipt.schema_version !== 1 ||
    receipt.receipt_id !== "q45-q86-q87-member-extents-2025"
  ) {
    fail("Queens member-extent evidence receipt changed; review required");
  }
  if (
    manifest.schema_version !== 1 ||
    manifest.manifest_id !== "q45-q86-q87-member-extents-2025-durable-sources" ||
    manifest.retention_contract !== "docs/releases-and-provenance.md" ||
    manifest.tracked_full_artifacts !== false ||
    manifest.offline_fixture.path !==
      "data/quality/acquisition/receipts/q45-q86-q87-member-extents-2025.json" ||
    manifest.offline_fixture.byte_length !== statSync(RECEIPT_PATH).size ||
    manifest.offline_fixture.sha256 !== sha256(readFileSync(RECEIPT_PATH)) ||
    manifest.offline_fixture.evidence_block_count !== 23 ||
    manifest.verification_command !== "bun run queens-member-extents:sources" ||
    manifest.hydration_command !== "bun run queens-member-extents:hydrate" ||
    manifest.clean_clone_requires_network !== false
  ) {
    fail("Queens member-extent durability contract changed; review required");
  }
  if (receipt.sources.length !== 7) fail("Queens source fixture must pin exactly seven sources");
  if (manifest.sources.length !== receipt.sources.length) fail("Queens durable source inventory changed");

  const manifestBySource = new Map(manifest.sources.map((source) => [source.source_id, source]));

  const sourceIds = new Set<string>();
  for (const source of receipt.sources) {
    if (sourceIds.has(source.source_id)) fail(`${source.source_id}: duplicate source id`);
    sourceIds.add(source.source_id);
    const artifact = source.artifact;
    const durable = manifestBySource.get(source.source_id);
    if (!durable) fail(`${source.source_id}: missing durable archive pin`);
    const expectedPrefix = `raw/sources/${source.source_id}/source.`;
    if (!artifact.path.startsWith(expectedPrefix) || durable.hydration_path !== artifact.path) {
      fail(`${source.source_id}: artifact path is outside its ignored raw source directory`);
    }
    if (
      durable.source_url !== source.source_url ||
      durable.capture_url !== artifact.capture_url ||
      durable.archive_timestamp !== artifact.archive_timestamp ||
      durable.archive_digest !== artifact.archive_digest ||
      durable.byte_length !== artifact.byte_length ||
      durable.sha256 !== artifact.sha256
    ) {
      fail(`${source.source_id}: manifest does not match the historical evidence receipt`);
    }
    if (!durable.capture_url.startsWith(
      `https://web.archive.org/web/${artifact.archive_timestamp}id_/https://www.mta.info/`,
    )) {
      fail(`${source.source_id}: archive URL and timestamp do not match`);
    }
    if (!/^\d{14}$/u.test(artifact.archive_timestamp)) {
      fail(`${source.source_id}: invalid archive timestamp`);
    }
    if (!/^[A-Z2-7]{32}$/u.test(artifact.archive_digest)) {
      fail(`${source.source_id}: invalid archive digest`);
    }
    if (!/^[a-f0-9]{64}$/u.test(artifact.sha256) || artifact.byte_length <= 0) {
      fail(`${source.source_id}: invalid artifact byte/hash pin`);
    }
    const extension = artifact.path.endsWith(".pdf") ? "pdf" : "html";
    const expectedContentType = extension === "pdf" ? "application/pdf" : "text/html; charset=UTF-8";
    if (durable.content_type !== expectedContentType) {
      fail(`${source.source_id}: unexpected content type ${durable.content_type}`);
    }

    if (source.evidence_blocks.length === 0) {
      fail(`${source.source_id}: missing committed evidence-block fixture`);
    }
    const capture = `${source.evidence_blocks.map((block) => block.raw_text).join("\n")}\n`;
    if (sha256(capture) !== source.reviewed_capture_sha256) {
      fail(`${source.source_id}: reviewed capture hash mismatch`);
    }
    const stagedIds = new Set<string>();
    for (const block of source.evidence_blocks) {
      if (block.staged_text_surface !== "normalized_text") {
        fail(`${block.evidence_id}: evidence is not pinned to normalized_text`);
      }
      if (!/^p\d{3,}_[bp]\d{4,}$/u.test(block.staged_block_id)) {
        fail(`${block.evidence_id}: invalid staged block locator`);
      }
      if (stagedIds.has(block.staged_block_id)) {
        fail(`${source.source_id}: duplicate staged block locator ${block.staged_block_id}`);
      }
      stagedIds.add(block.staged_block_id);
      if (`sha256:${sha256(block.raw_text)}` !== block.raw_text_sha256) {
        fail(`${block.evidence_id}: evidence text hash mismatch`);
      }
    }
  }
}

function verifyArtifact(source: ManifestSource): boolean {
  const path = join(repoRoot, source.hydration_path);
  if (!existsSync(path)) return false;
  const bytes = readFileSync(path);
  if (statSync(path).size !== source.byte_length || sha256(bytes) !== source.sha256) {
    fail(`${source.source_id}: hydrated artifact does not match its byte/hash pin`);
  }
  return true;
}

async function hydrateArtifact(source: ManifestSource): Promise<void> {
  const path = join(repoRoot, source.hydration_path);
  if (verifyArtifact(source)) return;

  const response = await fetch(source.capture_url, {
    headers: { "user-agent": "mta-wiki-source-hydration/1.0" },
    redirect: "follow",
  });
  if (!response.ok) {
    fail(`${source.source_id}: archive fetch failed with HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== source.byte_length || sha256(bytes) !== source.sha256) {
    fail(`${source.source_id}: archive response does not match its byte/hash pin`);
  }
  if (source.content_type === "application/pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    fail(`${source.source_id}: pinned PDF response has invalid magic bytes`);
  }
  if (source.content_type.startsWith("text/html") && !bytes.toString("utf8", 0, 256).match(/<!doctype html|<html/iu)) {
    fail(`${source.source_id}: pinned HTML response has invalid document bytes`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  verifyArtifact(source);
}

async function main(): Promise<void> {
  const hydrate = process.argv.includes("--hydrate");
  const requireHydrated = process.argv.includes("--require-hydrated") || hydrate;
  const receipt = JSON.parse(readFileSync(RECEIPT_PATH, "utf8")) as Receipt;
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  validateFixture(receipt, manifest);

  if (hydrate) {
    for (const source of manifest.sources) await hydrateArtifact(source);
  }

  const hydratedCount = manifest.sources.filter(verifyArtifact).length;
  if (requireHydrated && hydratedCount !== manifest.sources.length) {
    fail(`only ${hydratedCount}/${manifest.sources.length} pinned artifacts are hydrated`);
  }
  console.log(JSON.stringify({
    receipt_id: receipt.receipt_id,
    receipt_sha256: sha256(readFileSync(RECEIPT_PATH)),
    manifest_sha256: sha256(readFileSync(MANIFEST_PATH)),
    source_count: receipt.sources.length,
    evidence_block_count: receipt.sources.reduce((sum, source) => sum + source.evidence_blocks.length, 0),
    hydrated_artifact_count: hydratedCount,
    network_required_for_contract_regeneration: false,
    status: "verified",
  }));
}

await main();
