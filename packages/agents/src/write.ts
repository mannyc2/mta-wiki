import { readFileSync } from "node:fs";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { readConfig } from "@mta-wiki/core/config";
import { selectModel } from "@mta-wiki/core/models";
import { createWikiReactorReadTools, createWikiReactorSandboxTools, sandboxSystemPrompt } from "@mta-wiki/core/sandbox";
import { createTranscript, type TranscriptWriter } from "@mta-wiki/core/transcript";
import type { HarnessConfig, HarnessRunOptions, HarnessRunResult } from "@mta-wiki/core/types";
import { normalizeRepoPath } from "@mta-wiki/core/paths";
import { pageRelativePathForCanonicalRecord, readCanonicalRecords } from "@mta-wiki/pipeline/materialize/materialize";
import {
  verifyWriterBacklogPacketEdits,
  verifyWriterBacklogPackets,
  type WriterBacklogPacket,
  type WriterBacklogPacketRun,
} from "@mta-wiki/pipeline/campaign/post-ingest";
import { readStagedSourceMetadata } from "@mta-wiki/pipeline/sources/source-prep";
import { createMtaWriterTools } from "@mta-wiki/agents/tools/writer-tools";
import { writerPrompt, writerSystemPrompt } from "@mta-wiki/agents/prompts";
import { runScopedSourceAgent } from "@mta-wiki/agents/shared";

const DATA_ONLY_WRITER_KINDS = new Set(["claim", "metric_claim", "event", "treatment_component", "relation"]);

export function writerSystemPromptFull(config: HarnessConfig, safeWriter = false): string {
  if (!safeWriter) return [writerSystemPrompt(), sandboxSystemPrompt("write", config)].join("\n\n");
  return [
    writerSystemPrompt(),
    "Safe writer mode is active. Use only MTA writer tools for writes, and the generic read tool only for repository-local read-only inspection. Generic bash/write/edit tools are not available in this mode.",
  ].join("\n\n");
}

export function createWriterTools(transcript: TranscriptWriter, config: HarnessConfig, options: { safeWriter?: boolean | undefined } = {}): AgentTool[] {
  return [
    ...createMtaWriterTools(transcript, transcript.runId, { requireExistingPages: options.safeWriter }),
    ...(options.safeWriter ? createWikiReactorReadTools(config) : createWikiReactorSandboxTools(config, "write")),
  ];
}

function recordSourceIds(record: ReturnType<typeof readCanonicalRecords>[number]) {
  return new Set([record.source_id, ...(record.source_ids ?? []), ...record.evidence_refs.map((ref) => ref.source_id)].filter(Boolean));
}

function writerContextPacket(sourceId: string) {
  const related = readCanonicalRecords()
    .filter((record) => recordSourceIds(record).has(sourceId))
    .sort((a, b) => a.record_kind.localeCompare(b.record_kind) || a.record_id.localeCompare(b.record_id));

  const countsByKind: Record<string, number> = {};
  for (const record of related) countsByKind[record.record_kind] = (countsByKind[record.record_kind] ?? 0) + 1;

  const card = (record: (typeof related)[number]) => ({
    record_id: record.record_id,
    record_kind: record.record_kind,
    display_name: record.display_name,
    source_id: record.source_id,
    source_ids: record.source_ids,
    page_path: pageRelativePathForCanonicalRecord(record),
    payload_keys: Object.keys(record.payload ?? {}).sort(),
    evidence_count: record.evidence_refs.length,
    source_evidence_count: record.evidence_refs.filter((ref) => ref.source_id === sourceId).length,
  });

  const pageBearing = related.filter((record) => pageRelativePathForCanonicalRecord(record));
  const dataOnly = related.filter((record) => DATA_ONLY_WRITER_KINDS.has(record.record_kind));

  return JSON.stringify(
    {
      source_id: sourceId,
      total_related_records: related.length,
      counts_by_kind: countsByKind,
      page_bearing_records: pageBearing.map(card),
      data_only_records: dataOnly.slice(0, 250).map(card),
      data_only_records_truncated: Math.max(0, dataOnly.length - 250),
      writer_instruction:
        "Inspect page_bearing_records first, then inspect data_only_records before writing or saying something is missing. Claims, metric_claims, events, treatment_components, and relations are data-only by default.",
    },
    null,
    2,
  );
}

function readWriterPacketRun(packetPath: string) {
  const { absolutePath, relativePath } = normalizeRepoPath(packetPath);
  const run = JSON.parse(readFileSync(absolutePath, "utf8")) as WriterBacklogPacketRun;
  return { run, relativePath };
}

export function writerPacketPrompt(packetPath: string, packet: WriterBacklogPacket) {
  return `Write the writer region for exactly one materialized wiki page from this packet.

Target page: \`${packet.page_path}\`
Packet file: \`${packetPath}\`

Workflow:
1. Read \`${packet.page_path}\` with \`mta_read_wiki_page\`.
2. Inspect the packet records below. Use \`mta_read_record\` for full canonical JSON when a packet card is not enough.
3. Write only the writer region for \`${packet.page_path}\` with \`mta_write_writer_context\`.
4. Keep the page concise: target 150-400 words. If evidence is thin, write less or leave the region empty rather than padding.
5. Every factual sentence needs a direct \`[[cite:source_id#block_id|label]]\` primitive whose block supports that sentence.
6. Use record primitives for known records: \`[[route:id|label]]\`, \`[[corridor:id|label]]\`, \`[[project:id|label]]\`, \`[[entity:id|label]]\`, and \`[[metric:id|label]]\`.
7. Do not use bare \`source_id#block_id\` citations in final prose, do not edit frontmatter, and do not write to any page other than the target page.

Writer packet:

\`\`\`json
${JSON.stringify(packet, null, 2)}
\`\`\`

Return a short summary of the writer-region edit and any evidence caveats you noticed.`;
}

export async function runWritePacket(packetPath: string, options: HarnessRunOptions): Promise<HarnessRunResult> {
  const preflight = verifyWriterBacklogPackets(packetPath);
  if (!preflight.ok) {
    throw new Error(`Writer packet preflight failed for ${preflight.path}: ${preflight.issues.map((issue) => `${issue.page_path} ${issue.code}`).join("; ")}`);
  }

  const { run, relativePath } = readWriterPacketRun(packetPath);
  if (run.packets.length !== 1) {
    throw new Error(`write-writer-packet expects a one-packet JSON file; got ${run.packets.length}. Generate one with writer-backlog-packets --limit 1 --page <wiki/page.md>.`);
  }
  const packet = run.packets[0]!;

  const config = readConfig();
  const selection = selectModel(config, options);
  const transcript = createTranscript(config, "write", packet.page_path, options.dryRun);

  return runScopedSourceAgent({
    command: "write",
    subject: packet.page_path,
    options: { ...options, safeWriter: true },
    config,
    selection,
    transcript,
    tools: createWriterTools(transcript, config, { safeWriter: true }),
    systemPrompt: writerSystemPromptFull(config, true),
    prompt: writerPacketPrompt(relativePath, packet),
    finalize: () => {
      const verification = verifyWriterBacklogPacketEdits([relativePath]);
      transcript.write("mta_writer_packet_edit_verification", {
        ok: verification.ok,
        packetFileCount: verification.packet_file_count,
        pageCount: verification.page_count,
        pages: verification.pages,
        packetIssues: verification.packet_issues,
        editIssues: verification.edit_verification.issues,
        citationIssues: verification.citation_verification.issues,
      });
      if (!verification.ok) {
        throw new Error(`Writer packet post-edit verification failed for ${relativePath}: ${verification.packet_issues.concat(verification.edit_verification.issues, verification.citation_verification.issues).map((issue) => `${issue.path} ${issue.code}`).join("; ")}`);
      }
      return undefined;
    },
  });
}

export async function runWrite(sourceId: string, options: HarnessRunOptions): Promise<HarnessRunResult> {
  readStagedSourceMetadata(sourceId);

  const config = readConfig();
  const selection = selectModel(config, options);
  const transcript = createTranscript(config, "write", sourceId, options.dryRun);

  return runScopedSourceAgent({
    command: "write",
    subject: sourceId,
    options,
    config,
    selection,
    transcript,
    tools: createWriterTools(transcript, config, { safeWriter: options.safeWriter }),
    systemPrompt: writerSystemPromptFull(config, Boolean(options.safeWriter)),
    prompt: writerPrompt(sourceId, writerContextPacket(sourceId)),
  });
}
