import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import {
  auditPostIngestCoverage,
  auditSubmissionSourceIdDrift,
  claimWriterBacklogDispatchShards,
  exportCanonicalJsonl,
  exportSite,
  exportRelease,
  generatePostIngestPlan,
  generateWriterBacklogDispatchPlan,
  generateWriterBacklogPacketSetManifest,
  generateWriterBacklogPackets,
  generateWriterBacklogQueue,
  generateGapReport,
  generatePipelineReport,
  materializeWiki,
  readCanonicalRecordsFromJsonl,
  repoRoot,
  rebuildCanonicalDb,
  writeDeterministicQualityReport,
  verifyWriterCitations,
  verifyWriterEdits,
  verifyWriterBacklogPacketEdits,
  verifyWriterBacklogDispatchClaim,
  verifyWriterBacklogDispatchClaims,
  verifyWriterBacklogDispatchHandoffBatch,
  verifyWriterBacklogDispatchHandoffPromptCoverage,
  verifyWriterBacklogDispatchHandoffPrompts,
  verifyWriterBacklogDispatchPlan,
  verifyWriterBacklogPackets,
  verifyWriterBacklogPacketSetManifest,
  verifyWriterBacklogPacketSet,
  writeCodexPostIngestGoalAudit,
  writeWriterBacklogDispatchHandoffBatch,
  writeWriterBacklogDispatchHandoffPromptCoverageReport,
  writeWriterBacklogDispatchHandoffPrompts,
  writeWriterBacklogDispatchNextShard,
  writeWriterBacklogDispatchPlanStatus,
  writeWriterBacklogDispatchReadinessReport,
  writerBacklogDispatchPlanStatus,
  verifyCanonicalJsonlParity,
  writeDossier,
  writeEvidenceBlockIndex,
  writePipelineReport,
  type PipelineReport,
} from "@mta-wiki/agents";
import { canonicalDbPath } from "@mta-wiki/db/canonical-db";
import { calibrationMarkdown, scoreJudgeCalibration, writeV1CalibrationFixtures } from "@mta-wiki/pipeline/quality/judge-calibration";
import { seededDefectSummary, writeSeededDefectFixtures } from "@mta-wiki/pipeline/quality/seeded-defects";
import { humanCalibrationJudgeInputs, readFixtureJudgeInputs, runSemanticSweep, semanticSweepSummaryText } from "@mta-wiki/pipeline/quality/semantic-sweep";
import { optionValue, requireSubject, type CommandHandler } from "./shared.js";

function repairCanonicalFtsWithSqliteCli(): string {
  const sql = [
    "INSERT INTO records_fts(records_fts) VALUES('rebuild')",
    "INSERT INTO blocks_fts(blocks_fts) VALUES('rebuild')",
    "PRAGMA quick_check",
  ].join("; ");
  const result = spawnSync("sqlite3", [canonicalDbPath(), sql], { encoding: "utf8" });
  if (result.error) throw new Error(`sqlite3 FTS repair failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`sqlite3 FTS repair failed${detail ? `: ${detail}` : ""}`);
  }
  const lines = result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const issues = lines.filter((line) => line !== "ok");
  if (issues.length > 0) throw new Error(`sqlite3 quick_check failed after FTS repair: ${issues.slice(0, 5).join("; ")}`);
  return lines.join("\n") || "ok";
}

function printPipelineReport(report: PipelineReport) {
  console.log(`Pipeline report (${report.scope.run_ids ? `runs: ${report.scope.run_ids.join(", ")}` : "full corpus"})`);
  console.log(
    `Submissions: ${report.submissions.total} (accepted ${report.submissions.accepted} / rejected ${report.submissions.rejected} / retired ${report.submissions.retired}) acceptance=${report.submissions.acceptance_rate}`,
  );
  for (const kind of report.submissions.by_kind) {
    console.log(`- ${kind.observation_kind}: ${kind.accepted}/${kind.submissions} accepted (${kind.acceptance_rate})`);
  }

  const reasons = Object.entries(report.submissions.rejection_reasons).sort((a, b) => b[1] - a[1]);
  if (reasons.length > 0) {
    console.log("Top rejection reasons:");
    for (const [reason, count] of reasons.slice(0, 10)) console.log(`- ${count}x ${reason}`);
  }

  const identity = report.identity;
  console.log(
    `Identity: global subs=${identity.link_vs_new.global_submissions} linked=${identity.link_vs_new.linked} new=${identity.link_vs_new.created_new} unresolved=${identity.link_vs_new.unresolved} link_ratio=${identity.link_vs_new.link_ratio}`,
  );
  console.log(`Aliases: ${identity.alias_count}, do-not-merge pairs: ${identity.do_not_merge_pair_count}`);
  console.log(`Duplicate candidates: ${identity.duplicate_candidate_pairs} pairs in ${identity.duplicate_clusters} clusters`);
  for (const pair of identity.duplicate_candidates.slice(0, 12)) {
    console.log(`- ${pair.kind} ${pair.record_ids[0]} <> ${pair.record_ids[1]} score=${pair.score}`);
  }

  const graph = report.graph;
  console.log(
    `Graph: ${graph.nodes_probed} nodes probed, ${graph.orphans} orphans (rate ${graph.orphan_rate}); relations=${graph.relation_records} resolved_edges=${graph.relation_edges_resolved} unresolved=${graph.relation_edges_unresolved}`,
  );
  const orphanEntries = Object.entries(graph.orphans_by_kind).sort((a, b) => b[1] - a[1]);
  if (orphanEntries.length > 0) {
    console.log(`Orphans by kind: ${orphanEntries.map(([kind, count]) => `${kind}=${count}`).join(", ")}`);
  }

  const usageRuns = report.runs.filter((run) => run.usage);
  if (usageRuns.length > 0) {
    const totalCost = usageRuns.reduce((total, run) => total + (run.usage?.estimated_cost ?? 0), 0);
    console.log(`Usage (across ${usageRuns.length} runs with transcripts): $${totalCost.toFixed(4)}`);
  }
}

function hasLocalStagedSourceBlocks(): boolean {
  const sourcesDir = join(repoRoot, "raw", "sources");
  if (!existsSync(sourcesDir)) return false;
  return readdirSync(sourcesDir, { withFileTypes: true }).some((entry) => entry.isDirectory() && existsSync(join(sourcesDir, entry.name, "blocks.jsonl")));
}

function rebuildDbFromTrackedCanonical() {
  const records = readCanonicalRecordsFromJsonl();
  if (records.length === 0) {
    throw new Error("No tracked canonical JSONL records found; refusing to rebuild an empty data/canonical.db.");
  }

  const result = rebuildCanonicalDb(records);
  const quickCheck = repairCanonicalFtsWithSqliteCli();
  console.log(
    `Rebuilt ${relative(repoRoot, result.path)} from tracked canonical JSONL: ` +
      `${result.recordCount} records, ${result.relationCount} relation edge(s), ` +
      `${result.skippedRelationEdges} skipped relation edge(s).`,
  );
  console.log(`SQLite FTS quick_check: ${quickCheck}`);
  return result;
}

function writerVerificationPathArgs(argv: string[]) {
  return argv.slice(3).filter((arg) => arg !== "--scoped" && !arg.startsWith("--"));
}

function writerRecordKinds(argv: string[]) {
  const raw = optionValue(argv, "--record-kind") ?? optionValue(argv, "--kind");
  return raw?.split(",").map((value) => value.trim()).filter(Boolean);
}

function repeatedOptionValues(argv: string[], name: string) {
  const values: string[] = [];
  for (const [index, arg] of argv.entries()) {
    if (arg !== name) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
    values.push(value);
  }
  return values;
}

function writerPagePaths(argv: string[]) {
  const commaSeparated = repeatedOptionValues(argv, "--pages").flatMap((value) => value.split(","));
  return [...repeatedOptionValues(argv, "--page"), ...commaSeparated].map((value) => value.trim()).filter(Boolean);
}

function printPostIngestGoalAuditHelp() {
  console.log(`Usage: bun packages/cli/src/cli.ts post-ingest-goal-audit [--id <campaign-id>] [--writer-readiness <json>] [--writer-prompt-coverage <dispatch-json>,<prompts-json...>]

Writes a deterministic active-goal completion audit under data/review_notes/ by composing:
- validate
- post-ingest-audit
- source-id-drift-audit
- writer-packet-dispatch-readiness
- optional writer-packet-dispatch-handoff-prompt-coverage

This command does not run provider-backed post-ingest commands, writer agents, or wiki prose edits.`);
}

function printQualityJudgeCalibrationHelp() {
  console.log(`Usage: bun packages/cli/src/cli.ts quality-judge-calibration --verdicts <jsonl> [--run-id <id>]

Scores judge verdicts against the frozen v1 calibration fixtures:
- data/quality/fixtures/v1-rc5-calibration/human-50.jsonl
- data/quality/fixtures/seeded-defects-v1/fixtures.jsonl

Writes deterministic calibration reports under data/quality/calibration/.
This command does not call a provider.`);
}

export const materializeCommands = {
  materialize: () => {
    if (!hasLocalStagedSourceBlocks()) {
      console.log("Local raw source blocks not found; public-clone materialize is rebuilding the SQLite projection from tracked canonical JSONL.");
      rebuildDbFromTrackedCanonical();
      return;
    }

    const result = materializeWiki();
    const quickCheck = repairCanonicalFtsWithSqliteCli();
    console.log(`Materialized ${result.acceptedSubmissions}/${result.submissionsRead} submissions.`);
    console.log(`Retired submissions skipped: ${result.retiredSubmissions}`);
    if (result.semanticCorrections && result.semanticCorrections.total > 0) {
      console.log(
        `Semantic corrections: ${result.semanticCorrections.applied}/${result.semanticCorrections.total} applied, ${result.semanticCorrections.skipped} skipped.`,
      );
    }
    console.log(`Pages: ${result.pageCount}`);
    console.log(`Canonical: ${relative(repoRoot, result.canonicalDir)}`);
    console.log(`Wiki: ${relative(repoRoot, result.wikiDir)}`);
    console.log(`SQLite FTS quick_check: ${quickCheck}`);
  },

  "rebuild-db-from-canonical": () => {
    rebuildDbFromTrackedCanonical();
  },

  "rebuild-evidence-index": () => {
    const records = readCanonicalRecordsFromJsonl();
    if (records.length === 0) {
      throw new Error("No tracked canonical JSONL records found; refusing to rebuild an empty evidence block index.");
    }
    const result = writeEvidenceBlockIndex(records);
    console.log(
      `Rebuilt ${relative(repoRoot, result.path)} from local raw source blocks: ` +
        `${result.entryCount} cited block/range entries across ${result.sourceCount} source(s).`,
    );
  },

  "export-jsonl": () => {
    if (process.argv.includes("--verify")) {
      const result = verifyCanonicalJsonlParity();
      if (result.ok) {
        console.log(`export-jsonl --verify: DB == shadow JSONL (${result.recordCount} records).`);
        return;
      }
      console.log(`export-jsonl --verify: ${result.issues.length}+ parity issue(s) over ${result.recordCount} DB records:`);
      for (const issue of result.issues) console.log(`- ${issue}`);
      process.exitCode = 1;
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
    const result = exportCanonicalJsonl(timestamp);
    console.log(`Exported ${result.recordCount} records across ${result.files} kind file(s) to ${relative(repoRoot, result.dir)}`);
  },

  "export-release": (args) => {
    const releaseId = optionValue(process.argv, "--id") ?? new Date().toISOString().slice(0, 10);
    const result = exportRelease(releaseId, { force: args.force, qualityReport: optionValue(process.argv, "--quality-report") });
    console.log(
      `Exported release ${result.releaseId}: ${result.recordCount} records across ${result.files} file(s) to ${relative(repoRoot, result.dir)} ` +
        `(manifest ${result.manifestSha256.slice(0, 12)})`,
    );
  },

  "export-site": () => {
    const result = exportSite();
    console.log(
      `Exported static site to ${relative(repoRoot, result.outDir)}: ` +
        `routes=${result.pages.routes}, corridors=${result.pages.corridors}, projects=${result.pages.projects}, sources=${result.pages.sources}.`,
    );
    if (result.oversizedPages.length > 0) {
      console.log(`Oversized HTML pages (>3 MB):`);
      for (const page of result.oversizedPages.slice(0, 20)) console.log(`- ${page}`);
      process.exitCode = 1;
      return;
    }
    const pagefind = spawnSync("bunx", ["pagefind", "--site", "dist/site"], { cwd: repoRoot, encoding: "utf8" });
    if (pagefind.error || pagefind.status !== 0) {
      const detail = `${pagefind.stdout ?? ""}${pagefind.stderr ?? ""}${pagefind.error ? `\n${pagefind.error.message}` : ""}`.trim();
      console.warn(`Pagefind could not run; site exported without search.${detail ? `\n${detail}` : ""}`);
      return;
    }
    console.log((pagefind.stdout ?? "").trim());
  },

  "quality-report": (args) => {
    const releaseId = args.subject ?? optionValue(process.argv, "--id");
    const result = writeDeterministicQualityReport(releaseId);
    const evidence = result.deterministic.evidence_ref_resolution;
    const eventFlags = result.deterministic.cross_field_sanity.event_date_window.flagged;
    const routeFlags = result.deterministic.cross_field_sanity.route_id_sanity.flagged;
    console.log(
      `Quality report ${result.releaseId}: evidence ${evidence.resolved_refs}/${evidence.total_refs} ` +
        `(${(evidence.resolution_rate * 100).toFixed(2)}%) resolved.`,
    );
    console.log(`Cross-field flags: events=${eventFlags}, routes=${routeFlags}.`);
    console.log(`Wrote ${relative(repoRoot, result.deterministicPath)}`);
  },

  "quality-seeded-defects": () => {
    const calibration = writeV1CalibrationFixtures();
    const result = writeSeededDefectFixtures({ seed: optionValue(process.argv, "--seed") ?? "semqa-v1" });
    console.log(`Calibration fixtures: ${relative(repoRoot, calibration.dir)} (${calibration.humanRows} human rows)`);
    console.log(seededDefectSummary(result));
  },

  "quality-judge-calibration": () => {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
      printQualityJudgeCalibrationHelp();
      return;
    }
    const verdicts = optionValue(process.argv, "--verdicts");
    if (!verdicts) throw new Error("Missing --verdicts <jsonl> for quality-judge-calibration");
    const score = scoreJudgeCalibration(verdicts.startsWith("/") ? verdicts : join(repoRoot, verdicts), { runId: optionValue(process.argv, "--run-id") });
    console.log(calibrationMarkdown(score));
    console.log(JSON.stringify(score, null, 2));
    if (score.human_agreement.status === "FAIL" || score.seeded_recall.status === "FAIL") process.exitCode = 1;
  },

  "semantic-sweep": async (args) => {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
      console.log(`Usage: bun packages/cli/src/cli.ts semantic-sweep [--dry-run] [--limit <n>] [--kinds <k1,k2>] [--source <source-id>] [--batch-size <n>] [--run-id <id>] [--profile <name>]
       bun packages/cli/src/cli.ts semantic-sweep --fixtures <jsonl> [--human-calibration] [--ledger <jsonl>] [--run-id <id>]

Judges evidence support for claim/event/metric_claim/relation/treatment_component records.
Writes append-only verdict rows to data/semantic-sweep/verdicts.jsonl and per-run summaries to data/semantic-sweep/runs/.
Use --dry-run to estimate count/cost without provider calls.`);
      return;
    }
    const sourceId = optionValue(process.argv, "--source");
    const kinds = optionValue(process.argv, "--kinds") ?? optionValue(process.argv, "--kind");
    const fixturePath = optionValue(process.argv, "--fixtures");
    const humanCalibration = process.argv.includes("--human-calibration");
    const inputs = [
      ...(fixturePath ? readFixtureJudgeInputs(fixturePath) : []),
      ...(humanCalibration ? humanCalibrationJudgeInputs() : []),
    ];
    const summary = await runSemanticSweep({
      dryRun: args.dryRun,
      runId: args.runId,
      limit: args.importLimit,
      batchSize: args.batchSize,
      sourceId,
      kinds: kinds?.split(",").map((value) => value.trim()).filter(Boolean),
      profileName: args.profileName,
      provider: args.provider,
      model: args.model,
      inputs: inputs.length > 0 ? inputs : undefined,
      ledgerPath: optionValue(process.argv, "--ledger"),
    });
    console.log(semanticSweepSummaryText(summary));
  },

  "dossier": (args) => {
    const result = writeDossier(requireSubject(args.command, args.subject, "record id"));
    console.log(`Dossier: ${result.dossier.display_name} (${result.dossier.confirmation_level ?? "unknown"}, ${result.dossier.edges.length} relations, ${result.dossier.evidence.length} evidence)`);
    console.log(`  ${result.markdown}`);
    console.log(`  ${result.json}`);
  },

  "gap-report": () => {
    const result = generateGapReport(new Date().toISOString().replace(/[:.]/gu, "-"));
    console.log(`Gap report: ${result.total} gaps across ${Object.keys(result.by_class).length} classes`);
    for (const [cls, n] of Object.entries(result.by_class)) console.log(`  ${cls}: ${n}`);
    console.log(`  ${result.dir}`);
  },

  "pipeline-report": (args) => {
    const runIds = args.subject ? args.subject.split(",").map((value) => value.trim()).filter(Boolean) : undefined;
    const report = generatePipelineReport({ runIds });
    const path = writePipelineReport(report);
    printPipelineReport(report);
    console.log(`Report JSON: ${path}`);
  },

  "post-ingest-audit": () => {
    const id = optionValue(process.argv, "--id") ?? "validation-2026-06";
    const audit = auditPostIngestCoverage(id);
    console.log(`Post-ingest audit [${id}]: ${audit.ok ? "ok" : "needs attention"}.`);
    console.log(
      `Readiness: ${audit.readiness.ready}/${audit.readiness.total} ready, ${audit.readiness.ready_never_ingested} ready & never-ingested, ${audit.readiness.ingested} ingested, ${audit.readiness.not_ready} not-ready.`,
    );
    console.log(`Post-ingest scope: ${audit.post_ingest_scope.scoped_sources} scoped source(s) across ${audit.post_ingest_scope.plan_files} plan file(s).`);
    console.log(`Writer backlog: ${audit.writer_backlog.empty_writer_regions} empty writer region(s), ${audit.writer_backlog.status}.`);
    console.log(
      `Writer packet coverage: ${audit.writer_backlog.packet_coverage.covered_current_backlog_pages}/${audit.writer_backlog.empty_writer_regions} current backlog page(s), ` +
        `${audit.writer_backlog.packet_coverage.packet_count} packet(s) across ${audit.writer_backlog.packet_coverage.artifact_files} artifact file(s), ` +
        `${audit.writer_backlog.packet_coverage.duplicate_pages} duplicate page(s), ${audit.writer_backlog.packet_coverage.stale_packet_pages} stale page(s), ` +
        `${audit.writer_backlog.packet_coverage.status}.`,
    );
    if (audit.readiness_sources_missing_post_ingest_scope.length > 0) {
      console.log(`Missing post-ingest scope for readiness source(s): ${audit.readiness_sources_missing_post_ingest_scope.slice(0, 25).join(", ")}`);
    }
    if (audit.post_ingest_scoped_sources_not_in_readiness.length > 0) {
      console.log(`Plan-only source(s): ${audit.post_ingest_scoped_sources_not_in_readiness.slice(0, 25).join(", ")}`);
    }
    if (!audit.ok) process.exitCode = 1;
  },

  "source-id-drift-audit": () => {
    const audit = auditSubmissionSourceIdDrift();
    console.log(
      `Source-id drift audit: ${audit.ok ? "ok" : "needs attention"} (${audit.summary.total_candidates} candidate(s), ` +
        `${audit.summary.missing_source_id} missing source id, ${audit.summary.source_mismatch} source/evidence mismatch, ` +
        `${audit.summary.single_evidence_likely_truncated} likely truncated).`,
    );
    for (const candidate of audit.candidates.slice(0, 25)) {
      console.log(
        `- ${candidate.submission_id} ${candidate.observation_kind} ${candidate.local_observation_id}: ` +
          `source_id=${candidate.source_id} source_exists=${candidate.source_exists} evidence=${candidate.evidence_source_ids.join(",") || "(none)"}`,
      );
    }
    if (!audit.ok) process.exitCode = 1;
  },

  "post-ingest-goal-audit": () => {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
      printPostIngestGoalAuditHelp();
      return;
    }
    const id = optionValue(process.argv, "--id") ?? "validation-2026-06";
    const writerReadinessPath = optionValue(process.argv, "--writer-readiness");
    const rawWriterPromptCoverage = optionValue(process.argv, "--writer-prompt-coverage");
    const writerPromptCoveragePaths = rawWriterPromptCoverage?.split(",").map((value) => value.trim()).filter(Boolean);
    if (writerPromptCoveragePaths && writerPromptCoveragePaths.length < 2) {
      throw new Error("--writer-prompt-coverage must include a dispatch JSON followed by at least one prompts JSON, separated by commas");
    }
    const report = writeCodexPostIngestGoalAudit({ campaignId: id, writerReadinessPath, writerPromptCoveragePaths });
    console.log(`Codex post-ingest goal audit: ${report.overall_status}.`);
    console.log(
      `Validation: ${report.live_gates.validation.issue_count} issue(s), ` +
        `${report.live_gates.validation.submissions} submissions, ` +
        `${report.live_gates.validation.canonical_records} canonical records, ` +
        `${report.live_gates.validation.wiki_pages} wiki pages.`,
    );
    console.log(`Post-ingest audit: ${report.live_gates.post_ingest_audit.ok ? "ok" : "needs attention"}.`);
    console.log(`Source-id drift audit: ${report.live_gates.source_id_drift_audit.summary.total_candidates} candidate(s).`);
    if (report.live_gates.writer_readiness) {
      console.log(
        `Writer readiness: ${report.live_gates.writer_readiness.ok ? "ready" : "needs attention"}; ` +
          `${report.live_gates.writer_readiness.status.claimed_shards}/${report.live_gates.writer_readiness.status.shard_count} shards claimed, ` +
          `${report.live_gates.writer_readiness.status.empty_pages}/${report.live_gates.writer_readiness.status.packet_count} packet pages empty.`,
      );
    } else {
      console.log("Writer readiness: missing.");
    }
    if (report.live_gates.writer_prompt_coverage) {
      console.log(
        `Writer prompt coverage: ${report.live_gates.writer_prompt_coverage.ok ? "ok" : "needs attention"}; ` +
          `${report.live_gates.writer_prompt_coverage.covered_shard_count}/${report.live_gates.writer_prompt_coverage.expected_shard_count} shards, ` +
          `${report.live_gates.writer_prompt_coverage.existing_prompt_count}/${report.live_gates.writer_prompt_coverage.prompt_count} prompt files.`,
      );
    }
    console.log(`Audit JSON: ${report.path}`);
    console.log(`Audit Markdown: ${report.markdown_path}`);
    if (report.overall_status === "needs_attention") process.exitCode = 1;
  },

  "post-ingest-plan": (args) => {
    const rawWave = optionValue(process.argv, "--wave");
    let wave: number | undefined;
    if (rawWave !== undefined) {
      const parsedWave = Number(rawWave);
      if (!Number.isInteger(parsedWave) || parsedWave < 1) throw new Error(`--wave must be a positive integer: ${rawWave}`);
      wave = parsedWave;
    }
    const id = optionValue(process.argv, "--id") ?? "validation-2026-06";
    const plan = generatePostIngestPlan({
      campaignId: id,
      wave,
      sourceId: wave === undefined ? args.subject : undefined,
    });
    console.log(`Post-ingest plan: ${plan.scope.source_ids.length} source(s), ${plan.records.total_related} related record(s).`);
    console.log(`Validation: ${plan.validation.issue_count} issue(s), duplicate_global_identity=${plan.validation.duplicate_global_identity}.`);
    console.log(`Writer batches: ${plan.writer_batches.length}`);
    console.log(`Plan JSON: ${plan.path}`);
  },

  "writer-backlog-queue": () => {
    const rawLimit = optionValue(process.argv, "--limit");
    const recordKinds = writerRecordKinds(process.argv);
    const pagePaths = writerPagePaths(process.argv);
    let limit: number | undefined;
    if (rawLimit !== undefined) {
      const parsedLimit = Number(rawLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) throw new Error(`--limit must be a positive integer: ${rawLimit}`);
      limit = parsedLimit;
    }
    const queue = generateWriterBacklogQueue({ limit, recordKinds, pagePaths });
    console.log(`Writer backlog queue: ${queue.items.length}/${queue.scope.empty_writer_regions} empty writer page(s) selected.`);
    if (queue.scope.record_kinds) console.log(`Record kinds: ${queue.scope.record_kinds.join(", ")}`);
    if (queue.scope.page_paths) console.log(`Explicit pages: ${queue.scope.page_paths.length}`);
    for (const item of queue.items.slice(0, 12)) {
      console.log(`- score=${item.score} evidence=${item.evidence_count} support=${item.data_only_supporting_records} ${item.page_path}`);
    }
    console.log(`Queue JSON: ${queue.path}`);
  },

  "writer-backlog-packets": () => {
    const rawLimit = optionValue(process.argv, "--limit");
    const rawOffset = optionValue(process.argv, "--offset");
    const rawBatches = optionValue(process.argv, "--batches");
    const recordKinds = writerRecordKinds(process.argv);
    const pagePaths = writerPagePaths(process.argv);
    let limit: number | undefined;
    let offset: number | undefined;
    let batches = 1;
    if (rawLimit !== undefined) {
      const parsedLimit = Number(rawLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) throw new Error(`--limit must be a positive integer: ${rawLimit}`);
      limit = parsedLimit;
    }
    if (rawOffset !== undefined) {
      const parsedOffset = Number(rawOffset);
      if (!Number.isInteger(parsedOffset) || parsedOffset < 0) throw new Error(`--offset must be a non-negative integer: ${rawOffset}`);
      offset = parsedOffset;
    }
    if (rawBatches !== undefined) {
      const parsedBatches = Number(rawBatches);
      if (!Number.isInteger(parsedBatches) || parsedBatches < 1) throw new Error(`--batches must be a positive integer: ${rawBatches}`);
      batches = parsedBatches;
    }

    const packetLimit = limit ?? 10;
    const firstOffset = offset ?? 0;
    const runs = [];
    for (let batchIndex = 0; batchIndex < batches; batchIndex += 1) {
      const batchOffset = firstOffset + batchIndex * packetLimit;
      const run = generateWriterBacklogPackets({ limit: packetLimit, offset: batchOffset, recordKinds, pagePaths });
      runs.push(run);
      if (run.scope.selected_packets === 0) break;
    }

    const selected = runs.reduce((sum, run) => sum + run.scope.selected_packets, 0);
    const emptyWriterRegions = runs[0]?.scope.empty_writer_regions ?? 0;
    console.log(
      `Writer backlog packets: ${selected}/${emptyWriterRegions} empty writer page(s) packetized across ${runs.length} batch artifact(s), starting at offset ${firstOffset}.`,
    );
    if (recordKinds?.length) console.log(`Record kinds: ${recordKinds.join(", ")}`);
    if (pagePaths.length) console.log(`Explicit pages: ${pagePaths.length}`);
    for (const run of runs) {
      console.log(`Batch offset ${run.scope.offset}: ${run.scope.selected_packets} packet(s)`);
      for (const packet of run.packets.slice(0, 12)) {
        console.log(`- support=${packet.supporting_records.length} ${packet.page_path}`);
      }
      console.log(`Packets JSON: ${run.json_path}`);
      console.log(`Packets Markdown: ${run.markdown_path}`);
    }
  },

  "writer-packet-dispatch-plan": () => {
    const rawPacketsPerShard = optionValue(process.argv, "--packets-per-shard");
    const rawMaxShards = optionValue(process.argv, "--max-shards");
    const packetSetPath = optionValue(process.argv, "--packet-set");
    let packetsPerShard: number | undefined;
    let maxShards: number | undefined;
    if (rawPacketsPerShard !== undefined) {
      const parsedPacketsPerShard = Number(rawPacketsPerShard);
      if (!Number.isInteger(parsedPacketsPerShard) || parsedPacketsPerShard < 1) throw new Error(`--packets-per-shard must be a positive integer: ${rawPacketsPerShard}`);
      packetsPerShard = parsedPacketsPerShard;
    }
    if (rawMaxShards !== undefined) {
      const parsedMaxShards = Number(rawMaxShards);
      if (!Number.isInteger(parsedMaxShards) || parsedMaxShards < 1) throw new Error(`--max-shards must be a positive integer: ${rawMaxShards}`);
      maxShards = parsedMaxShards;
    }

    const plan = generateWriterBacklogDispatchPlan({ packetsPerShard, maxShards, packetSetPath });
    console.log(
      `Writer packet dispatch plan: ${plan.shards.length} shard(s), ${plan.scope.packet_coverage.covered_current_backlog_pages}/${plan.scope.empty_writer_regions} current backlog page(s) covered, ${plan.scope.packet_coverage.status}.`,
    );
    for (const shard of plan.shards.slice(0, 12)) {
      console.log(`- ${shard.shard_id}: ${shard.packet_count} packet(s), ${shard.packet_files.length} file(s)`);
    }
    console.log(`Dispatch JSON: ${plan.path}`);
    console.log(`Dispatch Markdown: ${plan.markdown_path}`);
  },

  "writer-packet-set-manifest": () => {
    const label = optionValue(process.argv, "--label");
    const manifest = generateWriterBacklogPacketSetManifest({ label });
    console.log(
      `Writer packet set manifest: ${manifest.packet_files.length} file(s), ${manifest.scope.packet_coverage.packet_count} packet(s), ` +
        `${manifest.scope.packet_coverage.covered_current_backlog_pages}/${manifest.scope.empty_writer_regions} current backlog page(s), ${manifest.scope.packet_coverage.status}.`,
    );
    console.log(`Packet Set JSON: ${manifest.path}`);
    console.log(`Packet Set Markdown: ${manifest.markdown_path}`);
  },

  "verify-writer-edits": () => {
    const scoped = process.argv.includes("--scoped");
    const paths = writerVerificationPathArgs(process.argv);
    const result = verifyWriterEdits({
      paths: paths.length > 0 ? paths : undefined,
      scoped,
    });
    const mode = scoped ? "scoped explicit path" : paths.length > 0 ? "strict explicit path" : "strict changed path";
    console.log(`Writer edit verification: ${result.ok ? "ok" : "failed"} (${result.checked_paths.length} path(s) checked; ${mode})`);
    for (const issue of result.issues.slice(0, 50)) {
      console.log(`- ${issue.code} ${issue.path}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },

  "verify-writer-citations": () => {
    const paths = writerVerificationPathArgs(process.argv);
    const result = verifyWriterCitations(paths);
    console.log(`Writer citation verification: ${result.ok ? "ok" : "failed"} (${result.checked_paths.length} path(s), ${result.citation_count} citation(s))`);
    for (const issue of result.issues.slice(0, 50)) {
      console.log(`- ${issue.code} ${issue.path}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },

  "verify-writer-packets": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet JSON path");
    const result = verifyWriterBacklogPackets(path);
    console.log(
      `Writer packet verification: ${result.ok ? "ok" : "failed"} (${result.packet_count} packet(s), ${result.checked_source_blocks} source block ref(s))`,
    );
    console.log(`Packet JSON: ${result.path}`);
    for (const issue of result.issues.slice(0, 50)) {
      console.log(`- ${issue.code} packet=${issue.packet_index} ${issue.page_path}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },

  "verify-writer-packet-set": () => {
    const paths = writerVerificationPathArgs(process.argv);
    if (paths.length === 0) throw new Error("verify-writer-packet-set requires one or more writer packet JSON paths");
    const result = verifyWriterBacklogPacketSet(paths);
    console.log(
      `Writer packet set verification: ${result.ok ? "ok" : "failed"} (${result.file_count} file(s), ${result.packet_count} packet(s), ${result.unique_page_count} unique page(s), ${result.checked_source_blocks} source block ref(s))`,
    );
    if (result.duplicate_page_count > 0) console.log(`Duplicate pages: ${result.duplicate_page_count}`);
    for (const issue of result.issues.slice(0, 50)) {
      console.log(`- ${issue.code} ${issue.page_path}${issue.path ? ` (${issue.path})` : ""}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },

  "verify-writer-packet-set-manifest": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet set manifest JSON path");
    const result = verifyWriterBacklogPacketSetManifest(path);
    console.log(
      `Writer packet set manifest verification: ${result.ok ? "ok" : "failed"} (${result.file_count} file(s), ${result.packet_count} packet(s), ${result.unique_page_count} unique page(s))`,
    );
    console.log(`Packet Set JSON: ${result.path}`);
    for (const issue of result.issues.slice(0, 50)) {
      console.log(`- ${issue.code}${issue.path ? ` ${issue.path}` : ""}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },

  "verify-writer-packet-dispatch-plan": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch plan JSON path");
    const result = verifyWriterBacklogDispatchPlan(path);
    console.log(
      `Writer packet dispatch plan verification: ${result.ok ? "ok" : "failed"} (${result.shard_count} shard(s), ${result.packet_count} packet(s), ${result.unique_page_count} unique page(s), ${result.packet_file_count} packet file(s))`,
    );
    console.log(`Dispatch JSON: ${result.path}`);
    for (const issue of result.issues.slice(0, 50)) {
      console.log(`- ${issue.code}${issue.shard_id ? ` ${issue.shard_id}` : ""}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },

  "verify-writer-packet-dispatch-claim": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch claim JSON path");
    const result = verifyWriterBacklogDispatchClaim(path);
    console.log(
      `Writer packet dispatch claim verification: ${result.ok ? "ok" : "failed"} (${result.claimed_count} claimed shard(s), ${result.unique_claimed_shards} unique)`,
    );
    console.log(`Claim JSON: ${result.path}`);
    if (result.dispatch_plan_path) console.log(`Dispatch JSON: ${result.dispatch_plan_path}`);
    if (result.owner) console.log(`Owner: ${result.owner}`);
    for (const issue of result.issues.slice(0, 50)) {
      console.log(`- ${issue.code}${issue.shard_id ? ` ${issue.shard_id}` : ""}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },

  "verify-writer-packet-dispatch-claims": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch plan JSON path");
    const result = verifyWriterBacklogDispatchClaims(path);
    console.log(
      `Writer packet dispatch claims verification: ${result.ok ? "ok" : "failed"} (${result.claim_file_count} claim file(s), ${result.unique_claimed_shards} unique claimed shard(s), ${result.unclaimed_not_started_shards} unclaimed not-started)`,
    );
    console.log(`Dispatch JSON: ${result.dispatch_plan_path}`);
    for (const file of result.files.slice(0, 25)) {
      console.log(`- ${file.ok ? "ok" : "failed"} ${file.path}: ${file.claimed_count} shard(s), owner=${file.owner ?? "(unknown)"}`);
    }
    for (const issue of result.issues.slice(0, 50)) {
      console.log(`- ${issue.code}${issue.shard_id ? ` ${issue.shard_id}` : ""}${issue.path ? ` (${issue.path})` : ""}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },

  "verify-writer-packet-dispatch-handoff-batch": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch handoff batch JSON path");
    const result = verifyWriterBacklogDispatchHandoffBatch(path);
    console.log(
      `Writer packet dispatch handoff batch verification: ${result.ok ? "ok" : "failed"} (` +
        `${result.selected_count} shard(s), ${result.packet_count} packet(s), ${result.page_count} page(s), ` +
        `${result.claim_file_count} claim file(s), ${result.checked_source_blocks} source block ref(s))`,
    );
    console.log(`Handoff JSON: ${result.path}`);
    if (result.dispatch_plan_path) console.log(`Dispatch JSON: ${result.dispatch_plan_path}`);
    for (const issue of result.issues.slice(0, 50)) {
      console.log(`- ${issue.code}${issue.shard_id ? ` ${issue.shard_id}` : ""}${issue.path ? ` (${issue.path})` : ""}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },

  "writer-packet-dispatch-handoff-prompts": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch handoff batch JSON path");
    const report = writeWriterBacklogDispatchHandoffPrompts(path);
    console.log(`Writer packet dispatch handoff prompts: ${report.prompt_count} prompt file(s) written.`);
    console.log(`Handoff verification: ${report.verification.ok ? "ok" : "failed"}`);
    for (const prompt of report.prompts.slice(0, 25)) {
      console.log(`- ${prompt.shard_id}: ${prompt.path}`);
    }
    console.log(`Prompts JSON: ${report.path}`);
    console.log(`Prompts Markdown: ${report.markdown_path}`);
  },

  "verify-writer-packet-dispatch-handoff-prompts": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch handoff prompts JSON path");
    const result = verifyWriterBacklogDispatchHandoffPrompts(path);
    console.log(
      `Writer packet dispatch handoff prompts verification: ${result.ok ? "ok" : "failed"} (` +
        `${result.existing_prompt_count}/${result.prompt_count} prompt file(s), ${result.unique_shard_count} unique shard(s))`,
    );
    console.log(`Prompts JSON: ${result.path}`);
    if (result.handoff_batch_path) console.log(`Handoff batch JSON: ${result.handoff_batch_path}`);
    for (const issue of result.issues.slice(0, 50)) {
      console.log(`- ${issue.code}${issue.shard_id ? ` ${issue.shard_id}` : ""}${issue.path ? ` (${issue.path})` : ""}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },

  "verify-writer-packet-dispatch-handoff-prompt-coverage": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch plan JSON path");
    const promptPaths = process.argv.slice(4).filter((arg) => !arg.startsWith("--"));
    const result = verifyWriterBacklogDispatchHandoffPromptCoverage(path, promptPaths);
    console.log(
      `Writer packet dispatch handoff prompt coverage: ${result.ok ? "ok" : "failed"} (` +
        `${result.covered_shard_count}/${result.expected_shard_count} shard(s), ${result.prompt_report_count} report(s), ` +
        `${result.existing_prompt_count}/${result.prompt_count} prompt file(s))`,
    );
    console.log(`Dispatch JSON: ${result.dispatch_plan_path}`);
    for (const report of result.reports.slice(0, 25)) {
      console.log(`- ${report.ok ? "ok" : "failed"} ${report.path}: ${report.existing_prompt_count}/${report.prompt_count} prompt file(s), ${report.unique_shard_count} unique shard(s)`);
    }
    for (const issue of result.issues.slice(0, 50)) {
      console.log(`- ${issue.code}${issue.shard_id ? ` ${issue.shard_id}` : ""}${issue.path ? ` (${issue.path})` : ""}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },

  "writer-packet-dispatch-handoff-prompt-coverage": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch plan JSON path");
    const promptPaths = process.argv.slice(4).filter((arg) => !arg.startsWith("--"));
    const report = writeWriterBacklogDispatchHandoffPromptCoverageReport(path, promptPaths);
    console.log(
      `Writer packet dispatch handoff prompt coverage report: ${report.verification.ok ? "ok" : "failed"} (` +
        `${report.verification.covered_shard_count}/${report.verification.expected_shard_count} shard(s), ` +
        `${report.verification.existing_prompt_count}/${report.verification.prompt_count} prompt file(s))`,
    );
    console.log(`Coverage JSON: ${report.path}`);
    console.log(`Coverage Markdown: ${report.markdown_path}`);
    if (!report.verification.ok) process.exitCode = 1;
  },

  "writer-packet-dispatch-readiness": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch plan JSON path");
    const packetSetPath = optionValue(process.argv, "--packet-set");
    const report = writeWriterBacklogDispatchReadinessReport(path, { packetSetPath });
    console.log(
      `Writer packet dispatch readiness: ${report.ok ? "ready" : "not ready"} (${report.status.claimed_shards}/${report.status.shard_count} shard(s) claimed, ${report.status.empty_pages}/${report.status.packet_count} page(s) empty)`,
    );
    console.log(`Dispatch verification: ${report.dispatch_verification.ok ? "ok" : "failed"}`);
    console.log(`Claims verification: ${report.claims_verification.ok ? "ok" : "failed"}`);
    if (report.packet_set_verification) console.log(`Packet-set verification: ${report.packet_set_verification.ok ? "ok" : "failed"}`);
    console.log(`Readiness JSON: ${report.path}`);
    console.log(`Readiness Markdown: ${report.markdown_path}`);
    if (!report.ok) process.exitCode = 1;
  },

  "writer-packet-dispatch-status": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch plan JSON path");
    const writeReport = process.argv.includes("--write");
    const report = writeReport ? writeWriterBacklogDispatchPlanStatus(path) : undefined;
    const status = report?.status ?? writerBacklogDispatchPlanStatus(path);
    console.log(
      `Writer packet dispatch status: ${status.shard_count} shard(s), ${status.packet_count} packet(s), ${status.empty_pages} empty page(s), ${status.non_empty_pages} non-empty page(s), ${status.missing_pages} missing/stale page(s).`,
    );
    console.log(
      `Shards: ${status.not_started_shards} not started, ${status.in_progress_shards} in progress, ${status.ready_for_post_edit_verification_shards} ready for post-edit verification, ${status.stale_or_missing_shards} stale/missing.`,
    );
    console.log(`Claims: ${status.claimed_shards} claimed, ${status.unclaimed_not_started_shards} unclaimed not-started.`);
    for (const shard of status.shards.filter((shard) => shard.state !== "not_started").slice(0, 25)) {
      console.log(`- ${shard.shard_id}: ${shard.state}, empty=${shard.empty_pages}, non_empty=${shard.non_empty_pages}, missing=${shard.missing_pages}`);
    }
    for (const shard of status.shards.filter((shard) => shard.claim).slice(0, 25)) {
      console.log(`- claimed ${shard.shard_id}: ${shard.claim!.owner} (${shard.claim!.path})`);
    }
    console.log(`Dispatch JSON: ${status.path}`);
    if (report) {
      console.log(`Status JSON: ${report.path}`);
      console.log(`Status Markdown: ${report.markdown_path}`);
    }
  },

  "writer-packet-dispatch-next-shard": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch plan JSON path");
    const shardId = optionValue(process.argv, "--shard");
    const report = writeWriterBacklogDispatchNextShard(path, { shardId });
    if (report.selected && report.shard) {
      console.log(`Writer packet dispatch next shard: ${report.shard.shard_id} (${report.shard.packet_count} packet(s), ${report.shard.page_paths.length} page(s)).`);
      console.log(`Owner: ${report.shard.claim?.owner ?? "(unclaimed)"}`);
      console.log(`Claim preflight: ${report.claim_preflight_command ?? "(none)"}`);
      console.log(`Shard preflight: ${report.shard.preflight_command}`);
      console.log(`Post-edit verification: ${report.shard.post_edit_command}`);
    } else {
      console.log(`Writer packet dispatch next shard: none selected (${report.reason ?? "no eligible shard"}).`);
      process.exitCode = 1;
    }
    console.log(`Handoff JSON: ${report.path}`);
    console.log(`Handoff Markdown: ${report.markdown_path}`);
  },

  "writer-packet-dispatch-handoff-batch": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch plan JSON path");
    const rawLimit = optionValue(process.argv, "--limit");
    const rawSkip = optionValue(process.argv, "--skip");
    let limit: number | undefined;
    if (rawLimit !== undefined) {
      const parsedLimit = Number(rawLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) throw new Error(`--limit must be a positive integer: ${rawLimit}`);
      limit = parsedLimit;
    }
    let skip: number | undefined;
    if (rawSkip !== undefined) {
      const parsedSkip = Number(rawSkip);
      if (!Number.isInteger(parsedSkip) || parsedSkip < 0) throw new Error(`--skip must be a non-negative integer: ${rawSkip}`);
      skip = parsedSkip;
    }
    const report = writeWriterBacklogDispatchHandoffBatch(path, { limit, skip });
    console.log(
      `Writer packet dispatch handoff batch: ${report.selected_count}/${report.available_claimed_not_started_shards} claimed not-started shard(s) selected (skip=${report.requested_skip}).`,
    );
    for (const entry of report.shards.slice(0, 25)) {
      console.log(`- ${entry.shard.shard_id}: ${entry.shard.packet_count} packet(s), ${entry.shard.page_paths.length} page(s), owner=${entry.shard.claim?.owner ?? "(unclaimed)"}`);
    }
    console.log(`Handoff JSON: ${report.path}`);
    console.log(`Handoff Markdown: ${report.markdown_path}`);
  },

  "writer-packet-dispatch-claim": (args) => {
    const path = requireSubject(args.command, args.subject, "writer packet dispatch plan JSON path");
    const rawLimit = optionValue(process.argv, "--limit");
    const owner = optionValue(process.argv, "--owner");
    let limit: number | undefined;
    if (rawLimit !== undefined) {
      const parsedLimit = Number(rawLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) throw new Error(`--limit must be a positive integer: ${rawLimit}`);
      limit = parsedLimit;
    }
    const claim = claimWriterBacklogDispatchShards(path, { limit, owner });
    console.log(
      `Writer packet dispatch claim: ${claim.claimed_count}/${claim.requested_limit} shard(s) claimed for ${claim.owner}; ${claim.available_unclaimed_shards} unclaimed shard(s) remain.`,
    );
    if (claim.skipped_already_claimed_shards > 0) console.log(`Already claimed shards skipped: ${claim.skipped_already_claimed_shards}`);
    for (const shard of claim.shards) {
      console.log(`- ${shard.shard_id}: ${shard.packet_count} packet(s), ${shard.packet_files.length} file(s)`);
    }
    console.log(`Claim JSON: ${claim.path}`);
    console.log(`Claim Markdown: ${claim.markdown_path}`);
  },

  "verify-writer-packet-edits": () => {
    const paths = writerVerificationPathArgs(process.argv);
    if (paths.length === 0) throw new Error("verify-writer-packet-edits requires one or more writer packet JSON paths");
    const result = verifyWriterBacklogPacketEdits(paths);
    console.log(
      `Writer packet edit verification: ${result.ok ? "ok" : "failed"} (${result.packet_file_count} packet file(s), ${result.page_count} page(s), ${result.citation_verification.citation_count} citation(s))`,
    );
    for (const issue of result.packet_issues.slice(0, 50)) {
      console.log(`- ${issue.code} ${issue.path}: ${issue.message}`);
    }
    for (const issue of result.edit_verification.issues.slice(0, 50)) {
      console.log(`- edit:${issue.code} ${issue.path}: ${issue.message}`);
    }
    for (const issue of result.citation_verification.issues.slice(0, 50)) {
      console.log(`- citation:${issue.code} ${issue.path}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  },
} satisfies Record<string, CommandHandler>;
