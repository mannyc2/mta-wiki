// Pure read-side helpers for canonicalize run artifacts. These live in pipeline
// (not agents) so apply/report code can consume run outputs without depending on
// the agent prompt/loop wiring — the agents package imports them from here.
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import type { CanonicalizeDecision } from "@mta-wiki/pipeline/records/canonicalize-packets";

export type CanonicalizeVerdict = {
  decision_id: string;
  verdict: "pass" | "fail" | "unsure";
  failure_reason?: string | undefined;
  evidence_checked: string[];
};

export function canonicalizeDir(runId: string) {
  return join(repoRoot, "data", "canonicalize", runId);
}

export function readCanonicalizeDecisions(runId: string): CanonicalizeDecision[] {
  const path = join(canonicalizeDir(runId), "decisions.jsonl");
  if (!existsSync(path)) throw new Error(`No canonicalize decisions found at ${relative(repoRoot, path)}. Run \`canonicalize\` first.`);
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as CanonicalizeDecision);
}

export function readCanonicalizeVerdicts(runId: string): CanonicalizeVerdict[] {
  const path = join(canonicalizeDir(runId), "verdicts.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as CanonicalizeVerdict);
}
