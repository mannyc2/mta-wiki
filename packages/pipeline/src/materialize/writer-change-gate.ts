import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { sourceBlockById } from "@mta-wiki/pipeline/sources/source-prep";

export type WriterEditIssue = {
  path: string;
  code: string;
  message: string;
};

export type WriterEditVerification = {
  ok: boolean;
  checked_paths: string[];
  issues: WriterEditIssue[];
};

export type WriterCitationRef = {
  source_id: string;
  block_id: string;
};

export type WriterCitationVerification = {
  ok: boolean;
  checked_paths: string[];
  citation_count: number;
  issues: WriterEditIssue[];
};

export type WriterEditVerificationOptions = {
  paths?: string[] | undefined;
  scoped?: boolean | undefined;
};

const WRITER_REGION_PATTERN = "<!-- mta-wiki:writer:start -->[\\s\\S]*?<!-- mta-wiki:writer:end -->";
const WRITER_REGION_RE = new RegExp(WRITER_REGION_PATTERN, "u");
const WRITER_REGION_GLOBAL_RE = new RegExp(WRITER_REGION_PATTERN, "gu");
const WRITER_CITATION_RE = /\[([a-z0-9_:-]+)#([^\]\s]+)\]/gu;

function normalizeNewlines(value: string) {
  return value.replace(/\r\n?/gu, "\n");
}

function scrubWriterRegion(value: string) {
  const normalized = normalizeNewlines(value);
  if (!WRITER_REGION_RE.test(normalized)) return undefined;
  return normalized.replace(WRITER_REGION_RE, "<!-- mta-wiki:writer:start -->\n<!-- mta-wiki:writer:end -->");
}

export function writerRegion(value: string) {
  return normalizeNewlines(value).match(WRITER_REGION_RE)?.[0];
}

export function writerRegionPresent(value: string): { ok: boolean; message?: string | undefined } {
  const matches = normalizeNewlines(value).match(WRITER_REGION_GLOBAL_RE) ?? [];
  if (matches.length === 0) return { ok: false, message: "current file has no writer region" };
  if (matches.length > 1) return { ok: false, message: "current file has multiple writer regions" };
  return { ok: true };
}

export function extractWriterCitations(value: string): WriterCitationRef[] {
  const region = writerRegion(value);
  if (!region) return [];
  const refs: WriterCitationRef[] = [];
  for (const match of region.matchAll(WRITER_CITATION_RE)) {
    refs.push({ source_id: match[1]!, block_id: match[2]! });
  }
  return refs;
}

export function writerRegionOnlyChanged(before: string, after: string): { ok: boolean; message?: string | undefined } {
  const beforeScrubbed = scrubWriterRegion(before);
  const afterScrubbed = scrubWriterRegion(after);
  if (beforeScrubbed === undefined) return { ok: false, message: "baseline file has no writer region" };
  if (afterScrubbed === undefined) return { ok: false, message: "current file has no writer region" };
  if (beforeScrubbed !== afterScrubbed) return { ok: false, message: "changes extend outside the writer region" };
  return { ok: true };
}

function git(args: string[]) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function changedPaths() {
  const tracked = git(["diff", "--name-only", "--diff-filter=ACMRTD", "HEAD", "--", "."])
    .split(/\r?\n/u)
    .filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard"])
    .split(/\r?\n/u)
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

function normalizeVerificationPaths(paths: string[]): { paths: string[]; issues: WriterEditIssue[] } {
  const normalizedPaths: string[] = [];
  const issues: WriterEditIssue[] = [];

  for (const rawPath of paths) {
    const trimmed = rawPath.trim();
    if (!trimmed) {
      issues.push({ path: rawPath, code: "empty_scope_path", message: "scoped writer verification paths cannot be empty" });
      continue;
    }

    const absolutePath = isAbsolute(trimmed) ? resolve(trimmed) : resolve(repoRoot, trimmed);
    const repoRelativePath = relative(repoRoot, absolutePath).replace(/\\/gu, "/");
    if (!repoRelativePath || repoRelativePath.startsWith("../") || repoRelativePath === "..") {
      issues.push({ path: rawPath, code: "scope_path_outside_repo", message: "scoped writer verification only accepts paths inside the repository" });
      continue;
    }
    normalizedPaths.push(repoRelativePath);
  }

  return { paths: [...new Set(normalizedPaths)].sort(), issues };
}

function headFile(path: string) {
  return git(["show", `HEAD:${path}`]);
}

function validateReviewNoteJsonl(path: string): WriterEditIssue[] {
  if (!existsSync(join(repoRoot, path))) return [{ path, code: "missing_review_note", message: "review note path is changed but missing from the worktree" }];
  const issues: WriterEditIssue[] = [];
  const lines = readFileSync(join(repoRoot, path), "utf8").split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    try {
      JSON.parse(line);
    } catch (error) {
      issues.push({ path, code: "invalid_review_note_jsonl", message: `line ${index + 1} is not valid JSON: ${String(error)}` });
    }
  }
  return issues;
}

export function verifyWriterEdits(options: WriterEditVerificationOptions = {}): WriterEditVerification {
  const explicitPaths = options.paths?.filter(Boolean);
  const issues: WriterEditIssue[] = [];
  let paths: string[];

  if (options.scoped && (!explicitPaths || explicitPaths.length === 0)) {
    return {
      ok: false,
      checked_paths: [],
      issues: [{ path: "(scope)", code: "missing_scope_paths", message: "--scoped writer verification requires one or more explicit paths" }],
    };
  }

  if (explicitPaths && explicitPaths.length > 0) {
    const normalized = normalizeVerificationPaths(explicitPaths);
    paths = normalized.paths;
    issues.push(...normalized.issues);
  } else {
    paths = changedPaths();
  }

  for (const path of paths) {
    if (path.startsWith("data/review_notes/") && path.endsWith(".jsonl")) {
      issues.push(...validateReviewNoteJsonl(path));
      continue;
    }

    if (!path.startsWith("wiki/") || !path.endsWith(".md")) {
      issues.push({ path, code: "path_not_allowed", message: "writer/subagent verification only allows wiki markdown writer regions and data/review_notes/*.jsonl" });
      continue;
    }
    if (path.startsWith("wiki/sources/")) {
      issues.push({ path, code: "source_page_modified", message: "source pages are generated read-only pages and cannot be writer-edited" });
      continue;
    }
    if (!existsSync(join(repoRoot, path))) {
      issues.push({ path, code: "wiki_page_deleted", message: "writer verification does not allow deleting wiki pages" });
      continue;
    }

    if (options.scoped) {
      const check = writerRegionPresent(readFileSync(join(repoRoot, path), "utf8"));
      if (!check.ok) {
        issues.push({ path, code: "missing_writer_region", message: check.message ?? "current file has no writer region" });
      }
      continue;
    }

    let before: string;
    try {
      before = headFile(path);
    } catch {
      issues.push({ path, code: "new_wiki_page", message: "writer verification only allows edits to existing materialized wiki pages" });
      continue;
    }

    const after = readFileSync(join(repoRoot, path), "utf8");
    const check = writerRegionOnlyChanged(before, after);
    if (!check.ok) {
      issues.push({ path, code: "outside_writer_region", message: check.message ?? "wiki page changed outside writer region" });
    }
  }

  return {
    ok: issues.length === 0,
    checked_paths: paths,
    issues,
  };
}

export function verifyWriterCitations(paths: string[]): WriterCitationVerification {
  const normalized = normalizeVerificationPaths(paths);
  const issues: WriterEditIssue[] = [...normalized.issues];
  let citationCount = 0;

  if (normalized.paths.length === 0 && issues.length === 0) {
    issues.push({ path: "(scope)", code: "missing_scope_paths", message: "writer citation verification requires one or more explicit wiki paths" });
  }

  for (const path of normalized.paths) {
    if (!path.startsWith("wiki/") || !path.endsWith(".md")) {
      issues.push({ path, code: "path_not_allowed", message: "writer citation verification only accepts wiki markdown paths" });
      continue;
    }
    if (path.startsWith("wiki/sources/")) {
      issues.push({ path, code: "source_page_not_allowed", message: "source pages are generated read-only pages and do not have writer-region citations" });
      continue;
    }
    if (!existsSync(join(repoRoot, path))) {
      issues.push({ path, code: "wiki_page_missing", message: "wiki page is missing from the worktree" });
      continue;
    }

    const file = readFileSync(join(repoRoot, path), "utf8");
    const regionCheck = writerRegionPresent(file);
    if (!regionCheck.ok) {
      issues.push({ path, code: "missing_writer_region", message: regionCheck.message ?? "current file has no writer region" });
      continue;
    }

    const refs = extractWriterCitations(file);
    citationCount += refs.length;
    if (refs.length === 0) {
      issues.push({ path, code: "missing_writer_citations", message: "writer region does not cite any source blocks" });
      continue;
    }

    for (const ref of refs) {
      try {
        sourceBlockById(ref.source_id, ref.block_id);
      } catch (error) {
        issues.push({
          path,
          code: "missing_source_block",
          message: `${ref.source_id}#${ref.block_id} could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    checked_paths: normalized.paths,
    citation_count: citationCount,
    issues,
  };
}
