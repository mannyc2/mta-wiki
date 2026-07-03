import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  allBucketStats,
  applyCanonicalizeDecisions,
  applyIdentityReviewDecisions,
  autoAcceptIdentityReview,
  campaignDir,
  campaignMaterializeQueue,
  canonicalizeDir,
  canonicalizeWave,
  generateIdentityReview,
  ingestWave,
  ingestedSourceIds,
  makeAcceptedIsDone,
  materializeWiki,
  readConfig,
  readReadinessRows,
  readSubmissionEntries,
  rebuildSourceBlocks,
  repoRoot,
  runCanonicalize,
  runCanonicalizeReview,
  runHarnessCommand,
  runIdentityReviewPackets,
  runReadinessSweep,
  selectWaveSources,
  validateRepo,
  waveSourceList,
  writeWaveReport,
} from "@mta-wiki/agents";
import { optionValue, type CommandHandler } from "./shared.js";

export const campaignCommands = {
  "canonicalize-wave": async (args) => {
    // Per-run canonicalize over a wave's ingested runs (docs/canonicalize-concurrency-plan.md P2):
    // parallel propose/review (R runs × packet-c P), serialized apply in sorted order, resumable.
    const id = optionValue(process.argv, "--id") ?? "validation-2026-06";
    const wave = Number(optionValue(process.argv, "--wave"));
    if (!Number.isInteger(wave) || wave < 1) throw new Error("canonicalize-wave requires --wave <n>");

    const explicit = optionValue(process.argv, "--run-ids");
    let runIds: string[];
    if (explicit) {
      runIds = explicit.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      const reportPath = join(campaignDir(id), `wave-${wave}`, "report.json");
      if (!existsSync(reportPath)) {
        throw new Error(`No wave-${wave} ingest report at ${reportPath}; run \`campaign ingest --wave ${wave}\` first (or pass --run-ids).`);
      }
      const ingestReport = JSON.parse(readFileSync(reportPath, "utf8")) as { run_ids?: string[] };
      runIds = ingestReport.run_ids ?? [];
    }
    if (runIds.length === 0) throw new Error(`Wave ${wave}: no run-ids to canonicalize.`);

    // The ingest report stores run_ids as full session PATHS (`<dir>/<sessionTs>_<run_id>.jsonl`),
    // but the canonicalize machinery keys on the submission `run_id` (the inner segment). Resolve
    // each path to its run_id via suffix-match against accepted submissions — robust to the naming,
    // and a no-op for explicit short --run-ids.
    const acceptedRunIds = new Set(readSubmissionEntries().filter((entry) => entry.validation.state === "accepted").map((entry) => entry.run_id));
    const toRunId = (raw: string): string => {
      if (acceptedRunIds.has(raw)) return raw;
      const base = (raw.endsWith(".jsonl") ? raw.slice(0, -6) : raw).split("/").pop() ?? raw;
      if (acceptedRunIds.has(base)) return base;
      return [...acceptedRunIds].find((id) => base.endsWith(`_${id}`)) ?? base;
    };
    runIds = runIds.map(toRunId);

    const profileName = args.profileName ?? readConfig().canonicalizeReviewerProfile;
    if (!profileName) throw new Error("canonicalize-wave needs --profile or canonicalizeReviewerProfile in harness.config.json");
    const runConcurrency = args.concurrency ?? 4; // R, plan P3 starting posture
    const packetConcurrency = Number(optionValue(process.argv, "--packet-concurrency") ?? "") || 6; // P, plan P1
    const timeoutMin = args.timeoutMin ?? 30;
    const progress = (message: string) => console.error(`[canonicalize-wave ${new Date().toISOString()}] ${message}`);

    console.log(
      `Canonicalize wave ${wave} [${id}]: ${runIds.length} run(s) at R=${runConcurrency} × P=${packetConcurrency} (timeout ${timeoutMin}min, profile ${profileName})${args.dryRun ? " (dry-run)" : ""}…`,
    );

    const readJson = (path: string): any => {
      try {
        return JSON.parse(readFileSync(path, "utf8"));
      } catch {
        return null;
      }
    };
    const startedAt = Date.now();
    const result = await canonicalizeWave(runIds, {
      concurrency: runConcurrency,
      timeoutMs: timeoutMin * 60 * 1000,
      onProgress: progress,
      // Resume signals (plan P2): apply-report wrote=true → done; propose-manifest failed:0 → proposed;
      // review-manifest present → reviewed. Skip what's done, never re-spend.
      isApplied: (runId) => readJson(join(canonicalizeDir(runId), "apply-report.json"))?.wrote === true,
      isProposed: (runId) => {
        // Require a LIVE manifest: a dry-run propose writes the manifest (failed:0) but no
        // decisions.jsonl, so honoring it would skip propose on the live run and leave nothing to apply.
        const m = readJson(join(canonicalizeDir(runId), "propose-manifest.json"));
        return m?.failed === 0 && m?.dry_run === false;
      },
      isReviewed: (runId) => {
        const m = readJson(join(canonicalizeDir(runId), "review-manifest.json"));
        return Boolean(m) && m?.dry_run === false;
      },
      propose: async (runId) => {
        const manifest = await runCanonicalize({ runId, profileName, concurrency: packetConcurrency, dryRun: args.dryRun, onProgress: progress });
        return { failed: manifest.failed, decision_count: manifest.validated_decision_count };
      },
      review: async (runId) => {
        // Dry-run propose writes no decisions.jsonl, so there is nothing to review — skip cleanly.
        // (The wiring proof is propose planning the packets; the full chain only runs live.)
        if (args.dryRun) return { failed: 0 };
        // Hard packet errors throw (→ quarantine); fail_count is decisions failing review, which is
        // a normal verdict, not an orchestration failure — so failed is 0 here.
        await runCanonicalizeReview({ runId, profileName, concurrency: packetConcurrency, dryRun: args.dryRun, onProgress: progress });
        return { failed: 0 };
      },
      apply: (runId) => {
        // Dry-run plans packets but writes no decisions.jsonl, so there is nothing to apply — skip
        // cleanly rather than quarantining on the absent decisions file (a live run always writes it).
        if (args.dryRun) {
          return { wrote: false, conflicts: 0, skipped_already_applied: false, alias_additions: 0, do_not_merge_additions: 0, relation_submissions: 0, decision_count: 0 };
        }
        const report = applyCanonicalizeDecisions(runId, { dryRun: args.dryRun, force: !args.dryRun });
        return {
          wrote: report.wrote,
          conflicts: report.conflicts.length,
          skipped_already_applied: Boolean(report.skipped_already_applied),
          alias_additions: report.alias_additions.length,
          do_not_merge_additions: report.do_not_merge_additions.length,
          relation_submissions: report.relation_submissions,
          decision_count: report.decision_count,
        };
      },
    });
    const wallClockS = Math.round((Date.now() - startedAt) / 1000);

    const telemetry = {
      run_concurrency: runConcurrency,
      packet_concurrency: packetConcurrency,
      timeout_min: timeoutMin,
      wall_clock_s: wallClockS,
      rate_limit: allBucketStats().map((s) => ({
        provider: s.label,
        rate_per_minute: s.ratePerMinute,
        requests: s.requests,
        requests_per_minute_observed: wallClockS > 0 ? Math.round((s.requests / wallClockS) * 60 * 10) / 10 : 0,
        rate_limited_429: s.rateLimited,
        circuit_breaker_trips: s.circuitBreakerTrips,
        wait_ms_p50: s.waitMsP50,
        wait_ms_p95: s.waitMsP95,
        wait_ms_max: s.waitMsMax,
        last_rate_limit_headers: s.lastRateLimitHeaders,
      })),
    };

    const dir = join(campaignDir(id), `wave-${wave}`);
    mkdirSync(dir, { recursive: true });
    const reportPath = join(dir, "canonicalize-report.json");
    writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          campaign_id: id,
          wave,
          generated_at: new Date().toISOString(),
          profile: profileName,
          dry_run: Boolean(args.dryRun),
          runs_total: runIds.length,
          applied: result.applied,
          quarantined: result.quarantined,
          skipped_already_applied: result.skipped_already_applied,
          run_status: result.runs,
          telemetry,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    console.log(
      `Wave ${wave}: applied ${result.applied.length}, skipped ${result.skipped_already_applied.length} (already applied), quarantined ${result.quarantined.length} in ${wallClockS}s. → ${relative(repoRoot, reportPath)}`,
    );
    const pioneer = telemetry.rate_limit.find((r) => r.provider === "pioneer");
    if (pioneer) {
      console.log(
        `  Rate limit [pioneer]: ${pioneer.requests} reqs (${pioneer.requests_per_minute_observed}/min observed, cap ${pioneer.rate_per_minute}), ${pioneer.rate_limited_429} × 429, breaker trips ${pioneer.circuit_breaker_trips}, wait p95 ${pioneer.wait_ms_p95}ms.`,
      );
    }
    for (const q of result.quarantined) console.log(`  quarantined ${q.run_id}: ${q.reason}`);
    if (result.quarantined.length > 0) {
      console.log(`  ${result.quarantined.length} run(s) need attention; re-run canonicalize-wave to retry (applied runs are skipped).`);
    }
    console.log(`Next: \`campaign dedup --wave ${wave}\` (cross-source identity merge → validate 0).`);
    return;
  },

  campaign: async (args) => {
    const sub = args.subject;
    const id = optionValue(process.argv, "--id") ?? "validation-2026-06";

    if (sub === "readiness") {
      const { summary, dir } = runReadinessSweep(id);
      console.log(
        `Readiness [${id}]: ${summary.ready}/${summary.total} ready, ${summary.ready_never_ingested} ready & never-ingested (wave pool), ${summary.ingested} already ingested, ${summary.quarantined} quarantined.`,
      );
      console.log(`  ${dir}/readiness.jsonl`);
      return;
    }

    if (sub === "ingest") {
      const wave = Number(optionValue(process.argv, "--wave"));
      if (!Number.isInteger(wave) || wave < 1) throw new Error("campaign ingest requires --wave <n>");
      const defaultSizes: Record<number, number> = { 1: 5, 2: 25, 3: 100 };
      const size = Number(optionValue(process.argv, "--size") ?? "") || defaultSizes[wave] || 100;
      const pool = waveSourceList(readReadinessRows(id));
      const selected = selectWaveSources(pool, ingestedSourceIds(), size);
      if (selected.length === 0) {
        console.log(`Wave ${wave}: nothing to ingest (pool exhausted or all sources already done).`);
        return;
      }
      // Concurrency campaign defaults (campaign-concurrency-plan.md §2/§3): c=24, 30 min timeout.
      const concurrency = args.concurrency ?? 24;
      const timeoutMin = args.timeoutMin ?? 30;
      console.log(`Wave ${wave} [${id}]: ingesting ${selected.length} source(s) at concurrency ${concurrency} (timeout ${timeoutMin}min)${args.dryRun ? " (dry-run)" : ""}…`);
      const startedAt = Date.now();
      const result = await ingestWave(selected, {
        concurrency,
        timeoutMs: timeoutMin * 60 * 1000,
        ingest: async (sourceId) => {
          // Prep step: chandra-OCR'd PDFs are "ready" but ship an EMPTY blocks.jsonl until the
          // evidence surface is generated from the chandra blocks. Populate it before ingest
          // (idempotent; deterministic from chandra). A failure here quarantines the source.
          rebuildSourceBlocks(sourceId);
          // Campaign materialize cadence: every-K, not per-run (plan §2 P0-b).
          const run = await runHarnessCommand("ingest", sourceId, { dryRun: args.dryRun, profileName: args.profileName, campaignMaterialize: true });
          return { runId: run.sessionPath };
        },
        isDone: makeAcceptedIsDone(),
        requireDoneAfterIngest: !args.dryRun,
      });

      // Always materialize once at wave end through the same single-flight queue (plan §2 P0-b).
      const materializeQueue = campaignMaterializeQueue();
      if (!args.dryRun) await materializeQueue.force();
      const wallClockS = (Date.now() - startedAt) / 1000;
      const matStats = materializeQueue.stats();
      const telemetry = {
        concurrency,
        timeout_min: timeoutMin,
        wall_clock_s: Math.round(wallClockS),
        rate_limit: allBucketStats().map((s) => ({
          provider: s.label,
          rate_per_minute: s.ratePerMinute,
          requests: s.requests,
          requests_per_minute_observed: wallClockS > 0 ? Math.round((s.requests / wallClockS) * 60 * 10) / 10 : 0,
          rate_limited_429: s.rateLimited,
          circuit_breaker_trips: s.circuitBreakerTrips,
          wait_ms_p50: s.waitMsP50,
          wait_ms_p95: s.waitMsP95,
          wait_ms_max: s.waitMsMax,
          last_rate_limit_headers: s.lastRateLimitHeaders,
        })),
        materialize: {
          completed_ingests: matStats.completed,
          runs: matStats.runs,
          total_seconds: Math.round(matStats.totalMs / 1000),
          every_k: materializeQueue.every,
        },
      };

      const { path } = writeWaveReport({
        campaign_id: id,
        wave,
        generated_at: new Date().toISOString(),
        sources_selected: selected,
        ...result,
        telemetry,
      });
      const pioneer = telemetry.rate_limit.find((r) => r.provider === "pioneer");
      console.log(
        `Wave ${wave}: ingested ${result.ingested.length}, skipped ${result.skipped_already_done.length} (already done), quarantined ${result.quarantined.length} in ${telemetry.wall_clock_s}s. → ${path}`,
      );
      if (pioneer) {
        console.log(
          `  Rate limit [pioneer]: ${pioneer.requests} reqs (${pioneer.requests_per_minute_observed}/min observed, cap ${pioneer.rate_per_minute}), ${pioneer.rate_limited_429} × 429, breaker trips ${pioneer.circuit_breaker_trips}, wait p95 ${pioneer.wait_ms_p95}ms.`,
        );
      }
      console.log(
        `  Materialize: ${telemetry.materialize.runs} run(s) over ${telemetry.materialize.completed_ingests} ingests (K=${telemetry.materialize.every_k}), ${telemetry.materialize.total_seconds}s total.`,
      );
      console.log(
        `Next (campaign plan §5): per-run canonicalize → canonicalize-review → canonicalize-apply, then once-per-wave materialize → export-jsonl --verify → validate → pipeline-report → schema-audit → ontology-review → identity-review → cross-source-candidates → build-index → gap-report → campaign golden --wave ${wave}.`,
      );
      return;
    }

    if (sub === "dedup") {
      // Post-wave cross-source identity dedup (identity-merge-canon.md): per-run canonicalize
      // decides identity per observation and cannot merge existing records colliding on a key,
      // so each wave ends with generate → LLM review → structural auto-accept → apply → validate.
      const wave = Number(optionValue(process.argv, "--wave"));
      if (!Number.isInteger(wave) || wave < 1) throw new Error("campaign dedup requires --wave <n>");
      const profileName = args.profileName ?? readConfig().canonicalizeReviewerProfile;
      if (!profileName) throw new Error("campaign dedup needs --profile or canonicalizeReviewerProfile in harness.config.json");
      const concurrency = args.concurrency ?? 4;

      const before = validateRepo();
      const dupsBefore = before.issues.filter((issue) => issue.code === "duplicate_global_identity").length;
      const review = generateIdentityReview({});
      console.log(`Dedup wave ${wave} [${id}]: ${review.counts.clusters} cluster(s), ${review.counts.duplicate_global_identity_issues} duplicate-identity issue(s), profile ${profileName}.`);
      const dir = join(campaignDir(id), `wave-${wave}`);
      mkdirSync(dir, { recursive: true });
      const reportPath = join(dir, "dedup-report.json");
      const writeDedupReport = (status: string, extra: Record<string, unknown>) => {
        writeFileSync(
          reportPath,
          `${JSON.stringify(
            {
              campaign_id: id,
              wave,
              generated_at: new Date().toISOString(),
              profile: profileName,
              dry_run: Boolean(args.dryRun),
              status,
              clusters: review.counts.clusters,
              ...extra,
            },
            null,
            2,
          )}\n`,
          "utf8",
        );
      };

      const runManifest = await runIdentityReviewPackets({ profileName, concurrency, dryRun: args.dryRun, force: args.force });
      console.log(`  Review run: ${runManifest.completed} completed, ${runManifest.skipped} skipped (existing suggestions), ${runManifest.failed} failed.`);
      if (runManifest.failed > 0) {
        process.exitCode = 1;
        writeDedupReport("review_failed", {
          review_run: { completed: runManifest.completed, skipped: runManifest.skipped, failed: runManifest.failed },
          auto_accept: { written_decisions: 0, written_quarantines: 0, statuses: {}, quarantined_clusters: [] },
          apply: { alias_additions: 0, do_not_merge_additions: 0, conflicts: 0, validation_issues: 0 },
          validate: { issues_before: before.issues.length, dups_before: dupsBefore, issues_after: before.issues.length, dups_after: dupsBefore },
        });
        console.log(`  Review failures block dedup apply. Use --force after provider recovery to retry failed/poisoned suggestions. → ${relative(repoRoot, reportPath)}`);
        return;
      }

      const gate = autoAcceptIdentityReview({ force: !args.dryRun });
      const gateCounts = new Map<string, number>();
      for (const result of gate.results) gateCounts.set(result.status, (gateCounts.get(result.status) ?? 0) + 1);
      console.log(`  Auto-accept gate: ${gate.written_decisions} decision(s), ${gate.written_quarantines} quarantine(s) [${[...gateCounts].map(([status, n]) => `${status}=${n}`).join(" ")}].`);
      for (const result of gate.results) {
        if (result.blocker) console.log(`    quarantined ${result.cluster_id}: ${result.blocker}`);
      }

      const apply = applyIdentityReviewDecisions({ dryRun: args.dryRun, force: !args.dryRun });
      console.log(`  Apply: ${apply.alias_additions.length} alias addition(s), ${apply.do_not_merge_additions.length} do-not-merge addition(s), ${apply.conflicts.length} conflict(s), ${apply.validation_issues.length} issue(s).`);
      if (apply.conflicts.length > 0 || apply.validation_issues.length > 0) process.exitCode = 1;

      let dupsAfter = dupsBefore;
      let issuesAfter = before.issues.length;
      if (!args.dryRun) {
        materializeWiki();
        const after = validateRepo();
        dupsAfter = after.issues.filter((issue) => issue.code === "duplicate_global_identity").length;
        issuesAfter = after.issues.length;
        console.log(`  Validate: ${before.issues.length} issue(s) (${dupsBefore} dups) → ${issuesAfter} issue(s) (${dupsAfter} dups).`);
        if (issuesAfter > 0) process.exitCode = 1;
      }

      writeDedupReport(issuesAfter === 0 ? "validated" : "validate_failed", {
        review_run: { completed: runManifest.completed, skipped: runManifest.skipped, failed: runManifest.failed },
        auto_accept: { written_decisions: gate.written_decisions, written_quarantines: gate.written_quarantines, statuses: Object.fromEntries(gateCounts), quarantined_clusters: gate.results.filter((r) => r.blocker).map((r) => ({ cluster_id: r.cluster_id, blocker: r.blocker })) },
        apply: { alias_additions: apply.alias_additions.length, do_not_merge_additions: apply.do_not_merge_additions.length, conflicts: apply.conflicts.length, validation_issues: apply.validation_issues.length },
        validate: { issues_before: before.issues.length, dups_before: dupsBefore, issues_after: issuesAfter, dups_after: dupsAfter },
      });
      console.log(`  → ${relative(repoRoot, reportPath)}`);
      const quarantinedTotal = gate.written_quarantines;
      if (quarantinedTotal > 0) console.log(`  ${quarantinedTotal} cluster(s) need human review under data/identity-review/accepted/quarantine/ before the next wave.`);
      return;
    }

    if (sub === "golden") {
      const path = join(campaignDir(id), "golden-questions.jsonl");
      if (!existsSync(path)) throw new Error(`No golden set at ${path}`);
      const questions = readFileSync(path, "utf8").split("\n").filter((line) => line.trim().length > 0).map((line) => JSON.parse(line) as { id: string; category: string });
      const byCategory = new Map<string, number>();
      for (const q of questions) byCategory.set(q.category, (byCategory.get(q.category) ?? 0) + 1);
      console.log(`Golden set [${id}]: ${questions.length} questions across ${byCategory.size} categories.`);
      for (const [category, n] of [...byCategory].sort()) console.log(`  ${category}: ${n}`);
      console.log(`Grading runs the ask + SQL probes against cited evidence (W2+, needs the embeddings server + reviewer profile) — campaign plan §4/§5.`);
      return;
    }

    throw new Error(`Unknown campaign subcommand: ${sub ?? "(none)"}. Use one of: readiness | ingest --wave N | dedup --wave N | golden`);
  },
} satisfies Record<string, CommandHandler>;
