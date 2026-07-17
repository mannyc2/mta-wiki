import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { buildHarnessAgent, positiveIntegerEnv } from "@mta-wiki/core/agent";
import { readConfig } from "@mta-wiki/core/config";
import { selectModel, type ModelSelection } from "@mta-wiki/core/models";
import { repoRoot } from "@mta-wiki/core/paths";
import { createHarnessSession } from "@mta-wiki/core/session";
import { createWikiReactorSandboxTools, sandboxSystemPrompt } from "@mta-wiki/core/sandbox";
import { createTranscript, type TranscriptWriter } from "@mta-wiki/core/transcript";
import type { HarnessConfig, HarnessRunOptions } from "@mta-wiki/core/types";
import { assistantText } from "@mta-wiki/core/usage";
import { canonicalizeDir, readCanonicalizeDecisions, readCanonicalizeVerdicts, type CanonicalizeVerdict } from "@mta-wiki/pipeline/records/canonicalize-shared";
export { readCanonicalizeDecisions, readCanonicalizeVerdicts, type CanonicalizeVerdict };
import { parseJsonResponse } from "@mta-wiki/agents/ontology-normalize";
import type { CanonicalizeDecision } from "@mta-wiki/pipeline/records/canonicalize-packets";
import { readIdentityDoNotMergeOverrides } from "@mta-wiki/db/identity";
import { readCanonicalRecords } from "@mta-wiki/pipeline/materialize/canonical-read";
import { sourceBlockById } from "@mta-wiki/pipeline/sources/source-prep";
import type { JsonObject, JsonValue, MtaCanonicalRecord } from "@mta-wiki/db/types";

// Adversarial second-pass reviewer for canonicalize decisions. Runs under a
// separate profile (config.canonicalizeReviewerProfile) so the canonicalizer
// is not grading its own homework. Only link/relate decisions are reviewed;
// new/skip/uncertain never mutate state and pass through apply untouched.

const REVIEW_TIMEOUT_MS = 180_000;
const DEFAULT_CONCURRENCY = 2;
const DECISIONS_PER_REVIEW_PACKET = 12;

export type CanonicalizeReviewOptions = HarnessRunOptions & {
  runId: string;
  concurrency?: number | undefined;
  onProgress?: ((message: string) => void) | undefined;
};

export type CanonicalizeReviewManifest = {
  run_id: string;
  generated_at: string;
  dry_run: boolean;
  profile_name: string;
  provider: string;
  model: string;
  reviewed_decision_count: number;
  pass_count: number;
  fail_count: number;
  unsure_count: number;
  paths: {
    verdicts_jsonl: string;
    manifest: string;
  };
};


function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function recordSnapshot(record: MtaCanonicalRecord | undefined) {
  if (!record) return undefined;
  return {
    record_id: record.record_id,
    record_kind: record.record_kind,
    display_name: record.display_name,
    record_aliases: record.record_aliases,
    source_ids: [...new Set([record.source_id, ...(record.source_ids ?? [])])].sort(),
    raw_text: record.raw_text,
    payload: record.payload,
    evidence_quotes: record.evidence_refs.map((ref) => ref.source_quote).filter(Boolean),
  };
}

function citedBlockText(decision: CanonicalizeDecision) {
  const refs = [...decision.evidence_refs, ...decision.proposed_relations.flatMap((relation) => relation.evidence_refs)];
  const blocks: Array<{ source_id: string; block_id: string; raw_text: string }> = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.source_id}#${ref.block_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const block = sourceBlockById(ref.source_id, ref.block_id);
      blocks.push({ source_id: ref.source_id, block_id: ref.block_id, raw_text: block.raw_text });
    } catch {
      // Missing blocks were already flagged during propose validation.
    }
  }
  return blocks;
}

export type CanonicalizeReviewItem = {
  decision: CanonicalizeDecision;
  base_record: ReturnType<typeof recordSnapshot>;
  target_record: ReturnType<typeof recordSnapshot>;
  relation_endpoint_records: Array<ReturnType<typeof recordSnapshot>>;
  cited_blocks: Array<{ source_id: string; block_id: string; raw_text: string }>;
};

export function buildReviewItems(decisions: CanonicalizeDecision[], records: MtaCanonicalRecord[]): CanonicalizeReviewItem[] {
  const recordsById = new Map(records.map((record) => [record.record_id, record]));
  return decisions
    .filter((decision) => decision.decision === "link" || decision.decision === "relate")
    .map((decision) => ({
      decision,
      base_record: recordSnapshot(recordsById.get(decision.base_record_id)),
      target_record: decision.target_record_id ? recordSnapshot(recordsById.get(decision.target_record_id)) : undefined,
      relation_endpoint_records: [
        ...new Set(decision.proposed_relations.flatMap((relation) => [relation.subject_id, relation.object_id])),
      ].map((id) => recordSnapshot(recordsById.get(id))),
      cited_blocks: citedBlockText(decision),
    }));
}

export function validateVerdictEnvelope(items: CanonicalizeReviewItem[], parsed: JsonValue | undefined): { verdicts: CanonicalizeVerdict[]; issues: string[] } {
  const issues: string[] = [];
  const verdicts: CanonicalizeVerdict[] = [];
  const expectedIds = new Set(items.map((item) => item.decision.decision_id));
  const covered = new Set<string>();

  const root = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonObject) : undefined;
  const rawVerdicts = root && Array.isArray(root.verdicts) ? root.verdicts : undefined;
  if (!rawVerdicts) {
    issues.push("response is not a JSON object with a verdicts array");
  } else {
    for (const [index, raw] of rawVerdicts.entries()) {
      const object = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as JsonObject) : undefined;
      const decisionId = typeof object?.decision_id === "string" ? object.decision_id : undefined;
      const verdict = typeof object?.verdict === "string" ? object.verdict : undefined;
      if (!decisionId || !expectedIds.has(decisionId)) {
        issues.push(`verdicts[${index}] decision_id is missing or not in the review packet`);
        continue;
      }
      if (covered.has(decisionId)) {
        issues.push(`verdicts[${index}] duplicates decision_id ${decisionId}`);
        continue;
      }
      if (verdict !== "pass" && verdict !== "fail" && verdict !== "unsure") {
        issues.push(`verdicts[${index}] verdict must be pass, fail, or unsure`);
        continue;
      }
      const failureReason = typeof object?.failure_reason === "string" && object.failure_reason.trim() ? object.failure_reason.trim() : undefined;
      if (verdict === "fail" && !failureReason) {
        issues.push(`verdicts[${index}] fail verdict for ${decisionId} requires failure_reason`);
        continue;
      }
      covered.add(decisionId);
      verdicts.push({
        decision_id: decisionId,
        verdict,
        failure_reason: failureReason,
        evidence_checked: Array.isArray(object?.evidence_checked) ? object.evidence_checked.filter((value): value is string => typeof value === "string") : [],
      });
    }
  }

  for (const id of expectedIds) {
    if (covered.has(id)) continue;
    verdicts.push({ decision_id: id, verdict: "unsure", failure_reason: "reviewer did not cover this decision", evidence_checked: [] });
  }
  return { verdicts, issues };
}

function reviewSystemPrompt(config: HarnessConfig) {
  return [
    "You are the adversarial reviewer for MTA wiki canonicalize decisions. Your job is to find a reason each decision is WRONG.",
    "For link decisions, check: route service-variant mismatch (SBS vs local vs limited), borough or corridor-limits conflict, person vs organization, program vs project scope, incompatible dates, and the do_not_merge list.",
    "For relate decisions, check that the cited block text actually states the connection between the two records; co-occurrence in a document is not a relation.",
    "Verify quotes against the provided cited_blocks raw text. If the evidence does not support the decision, fail it and name the reason.",
    "pass means you actively tried to refute the decision and could not. unsure means you cannot tell either way. Never pass on plausibility alone.",
    "You must call `mta_submit_canonicalize_verdicts` exactly once with the final envelope.",
    JSON.stringify(
      {
        verdicts: [
          {
            decision_id: "decision id from the packet",
            verdict: "pass | fail | unsure",
            failure_reason: "required for fail: what is wrong",
            evidence_checked: ["source_id#block_id values you actually checked"],
          },
        ],
      },
      null,
      2,
    ),
    sandboxSystemPrompt("canonicalize-review", config),
  ].join("\n\n");
}

async function buildReviewAgent(config: HarnessConfig, selection: ModelSelection, transcript: TranscriptWriter) {
  const bundle = await createHarnessSession(config, transcript.runId);
  let submittedEnvelope: JsonObject | undefined;
  const parameters = Type.Object({
    verdicts: Type.Array(
      Type.Object(
        {
          decision_id: Type.String(),
          verdict: Type.String({ description: "pass | fail | unsure" }),
          failure_reason: Type.Optional(Type.String()),
          evidence_checked: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: true },
      ),
    ),
  });
  const submitTool: AgentTool<typeof parameters> = {
    name: "mta_submit_canonicalize_verdicts",
    label: "Submit Canonicalize Verdicts",
    description: "Submit the final review verdicts for this packet. Call exactly once when ready.",
    parameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      submittedEnvelope = params as JsonObject;
      transcript.write("mta_tool_submit_canonicalize_verdicts", { verdictCount: params.verdicts.length });
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ state: "accepted_for_validation", instruction: "Verdicts captured. Stop now." }) }],
        details: { verdictCount: params.verdicts.length },
        terminate: true,
      };
    },
  };
  const { agent } = buildHarnessAgent({
    selection,
    transcript,
    bundle,
    tools: [...createWikiReactorSandboxTools(config, "canonicalize-review"), submitTool],
    streamOptions: { timeoutMs: REVIEW_TIMEOUT_MS },
    systemPrompt: reviewSystemPrompt(config),
  });
  return { agent, submittedEnvelope: () => submittedEnvelope };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) break;
        results[index] = await worker(items[index]!, index);
      }
    }),
  );
  return results;
}

export async function runCanonicalizeReview(options: CanonicalizeReviewOptions): Promise<CanonicalizeReviewManifest> {
  const config = readConfig();
  const reviewerProfile = options.profileName ?? config.canonicalizeReviewerProfile;
  const selection = selectModel(config, { ...options, profileName: reviewerProfile });
  const decisions = readCanonicalizeDecisions(options.runId);
  const records = readCanonicalRecords();
  const items = buildReviewItems(decisions, records);
  const doNotMerge = readIdentityDoNotMergeOverrides().pairs ?? {};

  const verdictsPath = join(canonicalizeDir(options.runId), "verdicts.jsonl");
  const manifestPath = join(canonicalizeDir(options.runId), "review-manifest.json");
  const packets = chunk(items, DECISIONS_PER_REVIEW_PACKET);
  const concurrency = options.concurrency ?? positiveIntegerEnv("MTA_CANONICALIZE_REVIEW_CONCURRENCY") ?? DEFAULT_CONCURRENCY;
  options.onProgress?.(`reviewing ${items.length} link/relate decisions in ${packets.length} packets with ${selection.model.provider}/${selection.model.id}`);

  const allVerdicts: CanonicalizeVerdict[] = [];
  if (!options.dryRun) {
    const packetVerdicts = await mapWithConcurrency(packets, concurrency, async (packetItems, index) => {
      const transcript = createTranscript(config, "canonicalize-review", `${options.runId}_review-${index + 1}`, options.dryRun);
      const { agent, submittedEnvelope } = await buildReviewAgent(config, selection, transcript);
      const packetData = {
        items: packetItems,
        do_not_merge: doNotMerge,
      };
      const responseText = assistantText(
        await agent.prompt(`Adversarially review these canonicalize decisions. Submit verdicts with mta_submit_canonicalize_verdicts.

\`\`\`json
${JSON.stringify(packetData, null, 2)}
\`\`\`
`),
      );
      transcript.writeResponse(responseText || "[verdicts submitted via mta_submit_canonicalize_verdicts]");
      let parsed: JsonValue | undefined = submittedEnvelope();
      if (!parsed) {
        try {
          parsed = parseJsonResponse(responseText);
        } catch {
          parsed = undefined;
        }
      }
      const { verdicts, issues } = validateVerdictEnvelope(packetItems, parsed);
      if (issues.length > 0) options.onProgress?.(`review packet ${index + 1}: ${issues.length} envelope issues (uncovered decisions become unsure)`);
      return verdicts;
    });
    allVerdicts.push(...packetVerdicts.flat());
    mkdirSync(dirname(verdictsPath), { recursive: true });
    writeFileSync(verdictsPath, allVerdicts.length ? `${allVerdicts.map((verdict) => JSON.stringify(verdict)).join("\n")}\n` : "", "utf8");
  }

  const manifest: CanonicalizeReviewManifest = {
    run_id: options.runId,
    generated_at: new Date().toISOString(),
    dry_run: options.dryRun,
    profile_name: selection.profileName,
    provider: selection.model.provider,
    model: selection.model.id,
    reviewed_decision_count: items.length,
    pass_count: allVerdicts.filter((verdict) => verdict.verdict === "pass").length,
    fail_count: allVerdicts.filter((verdict) => verdict.verdict === "fail").length,
    unsure_count: allVerdicts.filter((verdict) => verdict.verdict === "unsure").length,
    paths: {
      verdicts_jsonl: relative(repoRoot, verdictsPath).split("/").join("/"),
      manifest: relative(repoRoot, manifestPath).split("/").join("/"),
    },
  };
  writeJson(manifestPath, manifest);
  return manifest;
}
