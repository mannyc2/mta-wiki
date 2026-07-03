import {
  applyCanonicalizeDecisions,
  applyFirstMigrationBatch,
  applyIdentityReviewDecisions,
  applyRemainingMigrationBatch,
  autoAcceptIdentityReview,
  generateIdentityReview,
  runCanonicalize,
  runCanonicalizeReview,
  runIdentityReviewPackets,
  writeCrossSourceRelationCandidates,
  type CanonicalizeApplyReport,
  type CanonicalizeReviewManifest,
  type CanonicalizeRunManifest,
  type IdentityReviewApplyReport,
  type IdentityReviewManifest,
  type IdentityReviewRunManifest,
  type MigrationBatchReport,
} from "@mta-wiki/agents";
import { requireSubject, type CommandHandler } from "./shared.js";

function printIdentityReviewManifest(manifest: IdentityReviewManifest) {
  console.log(`Identity review: ${manifest.run_id}`);
  console.log(`Total global records: ${manifest.counts.total_global_records}`);
  console.log(`Review records: ${manifest.counts.review_records}`);
  console.log(`Candidate edges: ${manifest.counts.candidate_edges}`);
  console.log(`Clusters: ${manifest.counts.clusters}`);
  console.log(`Packets: ${manifest.counts.packet_count}`);
  console.log(`Validation issues: ${manifest.counts.validation_issues}`);
  console.log(`Duplicate identity issues: ${manifest.counts.duplicate_global_identity_issues}`);
  console.log(`Relation endpoint-shape issues: ${manifest.counts.relation_endpoint_shape_issues}`);
  console.log(`Manifest: ${manifest.paths.latest}`);
  console.log(`Packets dir: ${manifest.paths.packets_dir}`);

  if (manifest.top_clusters.length === 0) {
    console.log("Top clusters: (none)");
    return;
  }

  console.log("Top clusters:");
  for (const cluster of manifest.top_clusters.slice(0, 12)) {
    console.log(
      `- ${cluster.cluster_id} ${cluster.kind} records=${cluster.record_count} edges=${cluster.edge_count} priority=${cluster.priority} packet=${cluster.packet_path}`,
    );
  }
}

function printIdentityReviewRunManifest(manifest: IdentityReviewRunManifest) {
  console.log(`Identity review run: ${manifest.run_id}`);
  console.log(`Packets: ${manifest.packet_count}`);
  console.log(`Completed: ${manifest.completed}`);
  console.log(`Skipped: ${manifest.skipped}`);
  console.log(`Failed: ${manifest.failed}`);
  console.log(`Concurrency: ${manifest.concurrency}`);
  console.log(`Dry run: ${manifest.dry_run}`);
  console.log(`Model: ${manifest.provider}/${manifest.model}`);
  console.log(`Suggestions dir: ${manifest.paths.suggestions_dir}`);
  console.log(`Manifest: ${manifest.paths.manifest}`);

  const interesting = manifest.results.filter((result) => result.status !== "completed").slice(0, 20);
  for (const result of interesting) {
    console.log(`- ${result.status} ${result.cluster_id}: ${result.error ?? result.suggestion_path ?? result.packet_path}`);
  }
}

function printIdentityReviewApplyReport(report: IdentityReviewApplyReport) {
  console.log("Identity review apply");
  console.log(`Dry run: ${report.dry_run}`);
  console.log(`Wrote overrides: ${report.wrote}`);
  console.log(`Selected decisions: ${report.selected_decision_count}`);
  console.log(`Quarantined decisions kept out: ${report.quarantined_decision_count}`);
  console.log(`Schema/override issues: ${report.validation_issues.length}`);
  console.log(`Merge groups reviewed: ${report.merge_group_count}`);
  console.log(`Alias additions: ${report.alias_additions.length}`);
  console.log(`Aliases already present: ${report.aliases_already_present.length}`);
  console.log(`Do-not-merge additions: ${report.do_not_merge_additions.length}`);
  console.log(`Do-not-merge already present: ${report.do_not_merge_already_present.length}`);
  console.log(`Conflicts: ${report.conflicts.length}`);
  console.log(`Merges file: ${report.paths.merges_path}`);
  console.log(`Do-not-merge file: ${report.paths.do_not_merge_path}`);

  for (const issue of report.validation_issues.slice(0, 20)) {
    const location = [issue.path, issue.recordId].filter(Boolean).join(" ");
    console.log(`- ${issue.code}${location ? ` ${location}` : ""}: ${issue.message}`);
  }

  for (const conflict of report.conflicts.slice(0, 20)) {
    console.log(
      `- conflict ${conflict.kind} ${conflict.record_id}: existing ${conflict.existing_target}, proposed ${conflict.proposed_target} (${conflict.cluster_id})`,
    );
  }

  if (report.alias_additions.length > 0) {
    console.log("Planned merge aliases:");
    for (const plan of report.alias_additions.slice(0, 40)) {
      console.log(`- ${plan.kind} ${plan.alias} -> ${plan.target} (${plan.cluster_id})`);
    }
    if (report.alias_additions.length > 40) console.log(`- ... ${report.alias_additions.length - 40} more`);
  }

  if (report.do_not_merge_additions.length > 0) {
    console.log("Planned do-not-merge suppressions:");
    for (const plan of report.do_not_merge_additions.slice(0, 40)) {
      console.log(`- ${plan.kind} ${plan.record_ids[0]} <> ${plan.record_ids[1]} (${plan.cluster_id})`);
    }
    if (report.do_not_merge_additions.length > 40) console.log(`- ... ${report.do_not_merge_additions.length - 40} more`);
  }
}

function printMigrationBatchReport(report: MigrationBatchReport) {
  console.log("Migration batch");
  console.log(`Dry run: ${report.dry_run}`);
  console.log(`Wrote changes: ${report.wrote}`);
  console.log(`Run id: ${report.run_id}`);
  console.log(`Planned submissions: ${report.planned_submission_count}`);
  console.log(`Submission additions: ${report.submission_additions.length}`);
  console.log(`Submissions already present: ${report.submissions_already_present.length}`);
  console.log(`Retirement additions: ${report.retirement_additions.length}`);
  console.log(`Retirements already present: ${report.retirements_already_present.length}`);
  console.log(`Alias additions: ${report.alias_additions.length}`);
  console.log(`Aliases already present: ${report.aliases_already_present.length}`);
  console.log(`Alias removals: ${report.alias_removals.length}`);
  console.log(`Aliases already absent: ${report.aliases_already_absent.length}`);
  console.log(`Do-not-merge additions: ${report.do_not_merge_additions.length}`);
  console.log(`Do-not-merges already present: ${report.do_not_merges_already_present.length}`);
  console.log(`Do-not-merge removals: ${report.do_not_merge_removals.length}`);
  console.log(`Do-not-merges already absent: ${report.do_not_merges_already_absent.length}`);
  console.log(`Validation issues: ${report.validation_issues.length}`);
  console.log(`Conflicts: ${report.conflicts.length}`);
  console.log(`Submissions file: ${report.paths.submissions_path}`);
  console.log(`Retirements file: ${report.paths.retirements_path}`);
  console.log(`Identity merges file: ${report.paths.identity_merges_path}`);
  console.log(`Identity do-not-merge file: ${report.paths.identity_do_not_merge_path}`);

  for (const issue of report.validation_issues.slice(0, 20)) {
    const location = [issue.path, issue.recordId].filter(Boolean).join(" ");
    console.log(`- ${issue.code}${location ? ` ${location}` : ""}: ${issue.message}`);
  }

  for (const conflict of report.conflicts.slice(0, 20)) {
    console.log(
      `- conflict ${conflict.kind} ${conflict.alias}: existing ${conflict.existing_target}, proposed ${conflict.proposed_target}`,
    );
  }

  if (report.alias_additions.length > 0) {
    console.log("Planned aliases:");
    for (const plan of report.alias_additions) {
      console.log(`- ${plan.kind} ${plan.alias} -> ${plan.target}`);
    }
  }

  if (report.alias_removals.length > 0) {
    console.log("Planned alias removals:");
    for (const plan of report.alias_removals) {
      console.log(`- ${plan.kind} ${plan.alias}${plan.existing_target ? ` -> ${plan.existing_target}` : ""}`);
    }
  }

  if (report.do_not_merge_additions.length > 0) {
    console.log("Planned do-not-merge additions:");
    for (const plan of report.do_not_merge_additions) {
      console.log(`- ${plan.kind} ${plan.record_ids[0]} <> ${plan.record_ids[1]}`);
    }
  }

  if (report.do_not_merge_removals.length > 0) {
    console.log("Planned do-not-merge removals:");
    for (const plan of report.do_not_merge_removals) {
      console.log(`- ${plan.kind} ${plan.record_ids[0]} <> ${plan.record_ids[1]}`);
    }
  }

  if (report.retirement_additions.length > 0) {
    console.log("Planned retired submissions:");
    for (const plan of report.retirement_additions) {
      console.log(`- ${plan.submission_id}: ${plan.reason}`);
    }
  }
}

function printCanonicalizeManifest(manifest: CanonicalizeRunManifest) {
  console.log(`Canonicalize run: ${manifest.run_id}`);
  console.log(`Packets: ${manifest.packet_count} (completed ${manifest.completed} / planned ${manifest.planned} / failed ${manifest.failed})`);
  console.log(`Model: ${manifest.provider}/${manifest.model} (profile ${manifest.profile_name})`);
  console.log(`Observations: ${manifest.observation_count}`);
  console.log(`Validated decisions: ${manifest.validated_decision_count}`);
  console.log(`Quarantined decisions: ${manifest.quarantined_decision_count}`);
  console.log(`Decisions: ${manifest.paths.decisions_jsonl}`);
  console.log(`Quarantine: ${manifest.paths.quarantine_jsonl}`);
  for (const result of manifest.results) {
    console.log(
      `- ${result.status} ${result.packet_id}: decisions=${result.decision_count} valid=${result.validated_decision_count} quarantined=${result.quarantined_decision_count}${result.error ? ` (${result.error})` : ""}`,
    );
  }
}

function printCanonicalizeReviewManifest(manifest: CanonicalizeReviewManifest) {
  console.log(`Canonicalize review: ${manifest.run_id}`);
  console.log(`Model: ${manifest.provider}/${manifest.model} (profile ${manifest.profile_name})`);
  console.log(`Reviewed: ${manifest.reviewed_decision_count} (pass ${manifest.pass_count} / fail ${manifest.fail_count} / unsure ${manifest.unsure_count})`);
  console.log(`Verdicts: ${manifest.paths.verdicts_jsonl}`);
}

function printCanonicalizeApplyReport(report: CanonicalizeApplyReport) {
  console.log(`Canonicalize apply: ${report.run_id} (dry_run=${report.dry_run}, wrote=${report.wrote})`);
  console.log(`Decisions: ${report.decision_count}, reviewer verdicts: ${report.reviewed_count}`);
  console.log(`Alias additions: ${report.alias_additions.length} (already present: ${report.aliases_already_present.length})`);
  console.log(`Do-not-merge additions: ${report.do_not_merge_additions.length}`);
  console.log(`Relation submissions: ${report.relation_submissions}`);
  console.log(`Quarantined: ${report.quarantined} (${report.paths.quarantine_jsonl})`);
  for (const addition of report.alias_additions) {
    console.log(`- alias ${addition.kind} ${addition.alias} -> ${addition.target} (${addition.decision_id})`);
  }
  for (const conflict of report.conflicts) {
    console.log(`- conflict ${conflict.decision_id}: ${conflict.reason}`);
  }
  console.log(`Apply report: ${report.paths.apply_report}`);
}

export const identityCommands = {
  "identity-review": (args) => {
    const manifest = generateIdentityReview({
      limit: args.importLimit,
      include: args.include,
      exclude: args.exclude,
    });
    printIdentityReviewManifest(manifest);
  },

  "identity-review-run": async (args) => {
    const manifest = await runIdentityReviewPackets({
      dryRun: args.dryRun,
      profileName: args.profileName,
      provider: args.provider,
      model: args.model,
      subject: args.subject,
      limit: args.importLimit,
      include: args.include,
      exclude: args.exclude,
      concurrency: args.concurrency,
      force: args.force,
    });
    printIdentityReviewRunManifest(manifest);
    if (manifest.failed > 0) process.exitCode = 1;
  },

  "identity-review-apply": (args) => {
    const report = applyIdentityReviewDecisions({
      dryRun: args.dryRun,
      force: args.force,
      subject: args.subject,
      limit: args.importLimit,
      include: args.include,
      exclude: args.exclude,
    });
    printIdentityReviewApplyReport(report);
    if (report.validation_issues.length > 0 || report.conflicts.length > 0) process.exitCode = 1;
  },

  "identity-review-autoaccept": (args) => {
    const report = autoAcceptIdentityReview({
      force: args.force,
      limit: args.importLimit,
      include: args.include,
      exclude: args.exclude,
    });
    console.log("Identity review auto-accept");
    console.log(`Dry run: ${report.dry_run}`);
    console.log(`Clusters evaluated: ${report.results.length}`);
    console.log(`Decisions written: ${report.written_decisions}`);
    console.log(`Quarantines written: ${report.written_quarantines}`);
    for (const result of report.results) {
      const counts = `merges=${result.accepted_merge_group_count} dnm=${result.accepted_do_not_merge_count} rejected=${result.rejection_count} ambiguous=${result.ambiguous_count}`;
      console.log(`- ${result.cluster_id} [${result.kind}] ${result.status} (${counts})`);
      if (result.blocker) console.log(`    blocker: ${result.blocker}`);
    }
  },

  canonicalize: async (args) => {
    const runId = requireSubject(args.command, args.subject, "run id");
    const progress = (message: string) => console.error(`[canonicalize ${new Date().toISOString()}] ${message}`);
    const manifest = await runCanonicalize({
      runId,
      kind: args.kindFilter,
      dryRun: args.dryRun,
      profileName: args.profileName,
      provider: args.provider,
      model: args.model,
      concurrency: args.concurrency,
      onProgress: progress,
    });
    printCanonicalizeManifest(manifest);
    if (manifest.failed > 0) {
      process.exitCode = 1;
      return;
    }
    if (args.dryRun) return;

    const review = await runCanonicalizeReview({
      runId,
      dryRun: args.dryRun,
      concurrency: args.concurrency,
      onProgress: progress,
    });
    printCanonicalizeReviewManifest(review);

    const report = applyCanonicalizeDecisions(runId, { dryRun: !args.force, force: args.force });
    printCanonicalizeApplyReport(report);
    if (report.conflicts.length > 0) process.exitCode = 1;
  },

  "canonicalize-review": async (args) => {
    const manifest = await runCanonicalizeReview({
      runId: requireSubject(args.command, args.subject, "run id"),
      dryRun: args.dryRun,
      profileName: args.profileName,
      provider: args.provider,
      model: args.model,
      concurrency: args.concurrency,
      onProgress: (message) => console.error(`[canonicalize-review ${new Date().toISOString()}] ${message}`),
    });
    printCanonicalizeReviewManifest(manifest);
  },

  "canonicalize-apply": (args) => {
    const report = applyCanonicalizeDecisions(requireSubject(args.command, args.subject, "run id"), {
      dryRun: args.dryRun,
      force: args.force,
      reapply: process.argv.includes("--reapply"),
    });
    if (report.skipped_already_applied) {
      console.log(`Run ${report.run_id} already applied (apply-report records wrote=true); pass --reapply to override.`);
      return;
    }
    printCanonicalizeApplyReport(report);
    if (report.conflicts.length > 0) process.exitCode = 1;
  },

  "cross-source-candidates": () => {
    const result = writeCrossSourceRelationCandidates();
    console.log(`Cross-source relation candidates: ${result.count}`);
    console.log(`Candidates JSONL: ${result.path}`);
  },

  "migrate-batch1": (args) => {
    const report = applyFirstMigrationBatch({
      dryRun: args.dryRun,
      force: args.force,
    });
    printMigrationBatchReport(report);
    if (report.validation_issues.length > 0 || report.conflicts.length > 0) process.exitCode = 1;
  },

  "migrate-batch2": (args) => {
    const report = applyRemainingMigrationBatch({
      dryRun: args.dryRun,
      force: args.force,
    });
    printMigrationBatchReport(report);
    if (report.validation_issues.length > 0 || report.conflicts.length > 0) process.exitCode = 1;
  },
} satisfies Record<string, CommandHandler>;
