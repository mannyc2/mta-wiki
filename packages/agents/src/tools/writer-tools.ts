import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { normalizeRepoPath, repoRoot } from "@mta-wiki/core/paths";
import type { TranscriptWriter } from "@mta-wiki/core/transcript";
import { pageRelativePathForCanonicalRecord, readCanonicalRecords } from "@mta-wiki/pipeline/materialize/materialize";
import { stableHash } from "@mta-wiki/db/stable-json";
import { evidenceId, sourceBlockById, sourceBlocksRelativePath } from "@mta-wiki/pipeline/sources/source-prep";
import type { JsonObject, MtaEvidenceRef, MtaReviewNote } from "@mta-wiki/db/types";

function textResult(text: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function assertWikiMarkdownPath(relativePath: string) {
  if (!relativePath.startsWith("wiki/") || !relativePath.endsWith(".md")) {
    throw new Error(`Path must be a wiki markdown path: ${relativePath}`);
  }
  if (relativePath.startsWith("wiki/transcripts/")) {
    throw new Error(`Transcript paths are not available to agents: ${relativePath}`);
  }
}

function assertWriterContextPath(relativePath: string) {
  assertWikiMarkdownPath(relativePath);
  if (relativePath.startsWith("wiki/sources/")) {
    throw new Error(`Source pages have generated frontmatter plus read-only full-source Markdown. Write context to related project, corridor, route, entity, or gap pages instead: ${relativePath}`);
  }
}

function replaceWriterRegion(content: string, writerMarkdown: string) {
  const nextRegion = ["<!-- mta-wiki:writer:start -->", writerMarkdown.trim(), "<!-- mta-wiki:writer:end -->"].join("\n");
  const regionPattern = /<!-- mta-wiki:writer:start -->[\s\S]*?<!-- mta-wiki:writer:end -->/u;

  if (regionPattern.test(content)) {
    return content.replace(regionPattern, nextRegion);
  }

  return `${content.trimEnd()}\n\n${nextRegion}\n`;
}

function reviewNotesDir() {
  return join(repoRoot, "data", "review_notes");
}

function normalizeEvidenceRef(sourceId: string, blockId: string, role: string | undefined): MtaEvidenceRef {
  const block = sourceBlockById(sourceId, blockId);
  return {
    source_id: sourceId,
    evidence_id: evidenceId(sourceId, block.block_id),
    source_path: sourceBlocksRelativePath(sourceId),
    page_number: block.page_number,
    block_id: block.block_id,
    text_sha256: block.raw_text_sha256,
    text_source: "raw_text",
    role,
  };
}

function appendReviewNote(runId: string, note: Omit<MtaReviewNote, "note_id" | "run_id" | "submitted_at">): MtaReviewNote {
  const submittedAt = new Date().toISOString();
  const noteId = `note_${stableHash(note as unknown as JsonObject).slice(0, 16)}`;
  const entry: MtaReviewNote = {
    ...note,
    note_id: noteId,
    run_id: runId,
    submitted_at: submittedAt,
  };

  mkdirSync(reviewNotesDir(), { recursive: true });
  appendFileSync(join(reviewNotesDir(), `${runId}.jsonl`), `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

function clampLimit(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.min(250, Math.trunc(value)));
}

export type WriterToolOptions = {
  requireExistingPages?: boolean | undefined;
};

export function createMtaWriterTools(transcript: TranscriptWriter, runId: string, options: WriterToolOptions = {}): AgentTool[] {
  const listPagesParameters = Type.Object({
    record_kind: Type.Optional(Type.String()),
  });

  const listRecordsParameters = Type.Object({
    record_kind: Type.Optional(Type.String()),
    source_id: Type.Optional(Type.String()),
    max_results: Type.Optional(Type.Number({ description: "Maximum records to return, capped at 250. Defaults to 80." })),
  });

  const readRecordParameters = Type.Object({
    record_id: Type.String({ description: "Canonical record id to read from the canonical store (data/canonical.db)." }),
  });

  const readPageParameters = Type.Object({
    path: Type.String({ description: "Repository-relative wiki/*.md path." }),
  });

  const writeContextParameters = Type.Object({
    path: Type.String({ description: "Repository-relative wiki/*.md path." }),
    markdown: Type.String({
      description: "Complete markdown to place inside the writer region, including useful existing context to preserve.",
    }),
  });

  const flagRecordIssueParameters = Type.Object({
    record_id: Type.String({ description: "Canonical record id whose structured data or evidence needs review." }),
    issue_kind: Type.String({ description: "Short machine-readable category, e.g. evidence_conflict, normalization_needed, unsupported_claim." }),
    severity: Type.Optional(Type.String({ description: "info, warning, or error. Defaults to warning." })),
    summary: Type.String({ description: "One-sentence description of the issue." }),
    details: Type.Optional(Type.String({ description: "Concise supporting explanation." })),
    suggested_action: Type.Optional(Type.String({ description: "Concrete next action for a human or future correction pass." })),
    evidence_refs: Type.Optional(
      Type.Array(
        Type.Object({
          source_id: Type.String(),
          block_id: Type.String(),
          role: Type.Optional(Type.String()),
        }),
      ),
    ),
  });

  const listPagesTool: AgentTool<typeof listPagesParameters> = {
    name: "mta_list_wiki_pages",
    label: "List Wiki Pages",
    description: "List materialized wiki pages from canonical records.",
    parameters: listPagesParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      const records = readCanonicalRecords().filter(
        (record) => !params.record_kind || record.record_kind === params.record_kind,
      );
      const pages = records.flatMap((record) => {
        const path = pageRelativePathForCanonicalRecord(record);
        if (!path) return [];
        return [
          {
            path,
            record_id: record.record_id,
            record_kind: record.record_kind,
            display_name: record.display_name,
          },
        ];
      });

      transcript.write("mta_tool_list_wiki_pages", { recordKind: params.record_kind, pageCount: pages.length });
      return textResult(JSON.stringify({ pages }, null, 2), { pageCount: pages.length });
    },
  };

  const listRecordsTool: AgentTool<typeof listRecordsParameters> = {
    name: "mta_list_records",
    label: "List Canonical Records",
    description: "List canonical records, including data-only supporting records that do not have standalone wiki pages.",
    parameters: listRecordsParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      const maxResults = clampLimit(params.max_results, 80);
      const matches = readCanonicalRecords().filter((record) => {
        if (params.record_kind && record.record_kind !== params.record_kind) return false;
        if (params.source_id && record.source_id !== params.source_id && !(record.source_ids ?? []).includes(params.source_id)) return false;
        return true;
      });
      const records = matches.slice(0, maxResults).map((record) => ({
        record_id: record.record_id,
        record_kind: record.record_kind,
        display_name: record.display_name,
        source_id: record.source_id,
        source_ids: record.source_ids,
        page_path: pageRelativePathForCanonicalRecord(record),
        payload_keys: Object.keys(record.payload ?? {}).sort(),
        evidence_count: record.evidence_refs.length,
      }));

      transcript.write("mta_tool_list_records", {
        recordKind: params.record_kind,
        sourceId: params.source_id,
        returned: records.length,
        totalMatches: matches.length,
      });
      return textResult(JSON.stringify({ records, total_matches: matches.length }, null, 2), {
        returned: records.length,
        totalMatches: matches.length,
      });
    },
  };

  const readRecordTool: AgentTool<typeof readRecordParameters> = {
    name: "mta_read_record",
    label: "Read Canonical Record",
    description: "Read one canonical record as JSON, including data-only records without standalone wiki pages.",
    parameters: readRecordParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      const record = readCanonicalRecords().find((candidate) => candidate.record_id === params.record_id);
      if (!record) throw new Error(`Canonical record not found: ${params.record_id}`);
      transcript.write("mta_tool_read_record", { recordId: record.record_id, recordKind: record.record_kind });
      return textResult(JSON.stringify(record, null, 2), {
        recordId: record.record_id,
        recordKind: record.record_kind,
      });
    },
  };

  const readPageTool: AgentTool<typeof readPageParameters> = {
    name: "mta_read_wiki_page",
    label: "Read Wiki Page",
    description: "Read a wiki markdown page.",
    parameters: readPageParameters,
    executionMode: "parallel",
    execute: async (_toolCallId, params) => {
      const { absolutePath, relativePath } = normalizeRepoPath(params.path);
      assertWikiMarkdownPath(relativePath);
      if (!existsSync(absolutePath)) throw new Error(`Wiki page not found: ${relativePath}`);

      const content = readFileSync(absolutePath, "utf8");
      transcript.write("mta_tool_read_wiki_page", { path: relativePath, bytes: Buffer.byteLength(content) });
      return textResult(content, { path: relativePath, bytes: Buffer.byteLength(content) });
    },
  };

  const writeContextTool: AgentTool<typeof writeContextParameters> = {
    name: "mta_write_writer_context",
    label: "Write Writer Context",
    description: "Replace only the writer-owned region of a wiki markdown page with updated accumulated context.",
    parameters: writeContextParameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const { absolutePath, relativePath } = normalizeRepoPath(params.path);
      assertWriterContextPath(relativePath);
      if (options.requireExistingPages && !existsSync(absolutePath)) {
        throw new Error(`Safe writer mode only writes existing materialized wiki pages: ${relativePath}`);
      }
      const previous = existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
      const next = replaceWriterRegion(previous, params.markdown);

      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, next, "utf8");
      transcript.write("mta_tool_write_writer_context", {
        path: relativePath,
        previousBytes: Buffer.byteLength(previous),
        nextBytes: Buffer.byteLength(next),
      });

      return textResult(`Wrote writer context for ${relativePath}`, {
        path: relativePath,
        bytes: Buffer.byteLength(next),
        repoRoot,
        absolutePath: join(repoRoot, relativePath),
      });
    },
  };

  const flagRecordIssueTool: AgentTool<typeof flagRecordIssueParameters> = {
    name: "mta_flag_record_issue",
    label: "Flag Record Issue",
    description: "Create an auditable review note when writer review finds structured data that may be wrong, under-supported, or should become canonical.",
    parameters: flagRecordIssueParameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const records = readCanonicalRecords();
      if (!records.some((record) => record.record_id === params.record_id)) {
        throw new Error(`Cannot flag missing canonical record: ${params.record_id}`);
      }

      const severity = params.severity === "info" || params.severity === "warning" || params.severity === "error" ? params.severity : "warning";
      const evidenceRefs = (params.evidence_refs ?? []).map((ref) => normalizeEvidenceRef(ref.source_id, ref.block_id, ref.role));
      const note = appendReviewNote(runId, {
        record_id: params.record_id,
        issue_kind: params.issue_kind,
        severity,
        summary: params.summary,
        details: params.details,
        suggested_action: params.suggested_action,
        evidence_refs: evidenceRefs.length > 0 ? evidenceRefs : undefined,
      });

      transcript.write("mta_tool_flag_record_issue", {
        noteId: note.note_id,
        recordId: note.record_id,
        severity: note.severity,
      });

      return textResult(`Flagged ${note.severity} review note ${note.note_id} for ${note.record_id}`, {
        noteId: note.note_id,
        recordId: note.record_id,
        path: `data/review_notes/${runId}.jsonl`,
      });
    },
  };

  return [listPagesTool, listRecordsTool, readRecordTool, readPageTool, writeContextTool, flagRecordIssueTool];
}
