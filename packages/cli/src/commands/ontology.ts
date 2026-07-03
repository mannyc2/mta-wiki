import {
  generateOntologyReview,
  generateSchemaAudit,
  runOntologyNormalizePackets,
  runSchemaEnumProposals,
  type OntologyNormalizeProgressEvent,
  type OntologyNormalizeRunManifest,
  type OntologyReviewManifest,
  type SchemaAuditManifest,
  type SchemaProposalRunManifest,
} from "@mta-wiki/agents";
import { formatElapsed, type CommandHandler } from "./shared.js";

function printSchemaAuditManifest(manifest: SchemaAuditManifest) {
  console.log(`Schema audit: ${manifest.run_id}`);
  console.log(`Submissions: ${manifest.corpus.total_submissions} (accepted ${manifest.corpus.accepted} / rejected ${manifest.corpus.rejected})`);
  console.log(`Observation kinds: ${manifest.corpus.observation_kinds}`);
  console.log(`Manifest: ${manifest.paths.latest}`);
  console.log(`Markdown: ${manifest.paths.markdown}`);

  for (const kind of manifest.kinds) {
    const enums = kind.enum_candidates.map((candidate) => candidate.field);
    console.log(
      `- ${kind.observation_kind} subs=${kind.submission_count} fields=${kind.fields.length} extra_keys=${kind.additional_keys.length} enums=[${enums.join(", ")}]`,
    );
  }

  if (manifest.truncations.length > 0) {
    console.log(`Truncations: ${manifest.truncations.length} (see markdown)`);
  }
}

function printSchemaProposalManifest(manifest: SchemaProposalRunManifest) {
  console.log(`Schema proposal run: ${manifest.run_id}`);
  console.log(`Model: ${manifest.provider}/${manifest.model} (profile ${manifest.profile_name})`);
  console.log(`Kinds: ${manifest.kind_count}`);
  console.log(`Completed: ${manifest.completed}`);
  console.log(`Skipped: ${manifest.skipped}`);
  console.log(`Failed: ${manifest.failed}`);
  console.log(`Invalid (failed schema validation): ${manifest.invalid}`);
  console.log(`Dry run: ${manifest.dry_run}`);
  console.log(`Manifest: ${manifest.paths.latest}`);
  console.log(`Proposals dir: ${manifest.paths.proposals_dir}`);

  for (const result of manifest.results) {
    const validity = result.status !== "completed" ? result.status : result.valid ? "valid" : "INVALID";
    const counts = `issues=${result.schema_issues.length} warnings=${result.warnings.length}`;
    console.log(`- ${result.observation_kind} ${validity} ${counts}${result.error ? ` (${result.error})` : ""}`);
  }
}

function printOntologyReviewManifest(manifest: OntologyReviewManifest) {
  console.log(`Ontology review: ${manifest.run_id}`);
  console.log(`Agents: ${manifest.counts.agents}`);
  console.log(`Candidates: ${manifest.counts.candidates}`);
  console.log(`Canonical records: ${manifest.counts.canonical_records}`);
  console.log(
    `Submissions: ${manifest.counts.submissions} (accepted ${manifest.counts.accepted_submissions} / rejected ${manifest.counts.rejected_submissions})`,
  );
  console.log(`Manifest: ${manifest.paths.latest}`);
  console.log(`Candidates JSONL: ${manifest.paths.candidates_jsonl}`);
  console.log(`Packets dir: ${manifest.paths.packets_dir}`);

  for (const agent of manifest.agents) {
    const categories = Object.entries(agent.top_categories)
      .map(([category, count]) => `${category}=${count}`)
      .join(", ");
    console.log(`- ${agent.agent_id}: ${agent.candidate_count} candidates${categories ? ` (${categories})` : ""}`);
    console.log(`  packet: ${agent.packet_path}`);
  }
}

function printOntologyNormalizeManifest(manifest: OntologyNormalizeRunManifest) {
  console.log(`Ontology normalize run: ${manifest.run_id}`);
  console.log(`Ontology review run: ${manifest.ontology_review_run_id}`);
  console.log(`Packets: ${manifest.packet_count}`);
  console.log(`Completed: ${manifest.completed}`);
  console.log(`Planned: ${manifest.planned}`);
  console.log(`Failed: ${manifest.failed}`);
  console.log(`Concurrency: ${manifest.concurrency}`);
  console.log(`Dry run: ${manifest.dry_run}`);
  console.log(`Model: ${manifest.provider}/${manifest.model}`);
  console.log(`Decisions: ${manifest.decision_count}`);
  console.log(`Machine-valid decisions: ${manifest.validated_decision_count}`);
  console.log(`Quarantined decisions: ${manifest.quarantined_decision_count}`);
  console.log(`Manifest: ${manifest.paths.manifest}`);
  console.log(`Validated decisions: ${manifest.paths.decisions_jsonl}`);
  console.log(`Quarantine: ${manifest.paths.quarantine_jsonl}`);

  const interesting = manifest.results.filter((result) => result.status !== "completed" || result.quarantined_decision_count > 0).slice(0, 20);
  for (const result of interesting) {
    console.log(
      `- ${result.status} ${result.agent_id}: decisions=${result.decision_count} valid=${result.validated_decision_count} quarantined=${result.quarantined_decision_count}${result.error ? ` (${result.error})` : ""}`,
    );
  }
}

function printOntologyNormalizeProgress(event: OntologyNormalizeProgressEvent) {
  const stamp = new Date().toISOString();
  const prefix = `[ontology-normalize ${stamp}]`;
  if (event.type === "run_start") {
    console.error(
      `${prefix} start run=${event.run_id} packets=${event.packet_count} concurrency=${event.concurrency} dry_run=${event.dry_run} model=${event.provider}/${event.model} output=${event.output_dir}`,
    );
    return;
  }
  if (event.type === "packet_start") {
    console.error(`${prefix} packet ${event.agent_id} start candidates=${event.candidate_count} packet=${event.packet_path}`);
    return;
  }
  if (event.type === "packet_prompt_ready") {
    console.error(
      `${prefix} packet ${event.agent_id} prompt ready elapsed=${formatElapsed(event.elapsed_ms)} transcript=${event.transcript_dir} session=${event.session_path}`,
    );
    return;
  }
  if (event.type === "packet_model_request") {
    console.error(`${prefix} packet ${event.agent_id} model request sent elapsed=${formatElapsed(event.elapsed_ms)}`);
    return;
  }
  if (event.type === "packet_model_wait") {
    console.error(`${prefix} packet ${event.agent_id} waiting on model elapsed=${formatElapsed(event.elapsed_ms)}`);
    return;
  }
  if (event.type === "packet_model_response") {
    console.error(`${prefix} packet ${event.agent_id} model response received elapsed=${formatElapsed(event.elapsed_ms)} chars=${event.response_chars}`);
    return;
  }
  if (event.type === "packet_validated") {
    console.error(
      `${prefix} packet ${event.agent_id} validated decisions=${event.decision_count} valid=${event.validated_decision_count} quarantined=${event.quarantined_decision_count} raw=${event.raw_response_path}`,
    );
    return;
  }
  if (event.type === "packet_written") {
    console.error(
      `${prefix} packet ${event.agent_id} done decisions=${event.decision_count} valid=${event.validated_decision_count} quarantined=${event.quarantined_decision_count}`,
    );
    return;
  }
  if (event.type === "packet_failed") {
    console.error(`${prefix} packet ${event.agent_id} failed: ${event.error}`);
    return;
  }
  if (event.type === "run_written") {
    console.error(
      `${prefix} wrote manifest=${event.manifest_path} decisions=${event.decisions_path} quarantine=${event.quarantine_path} counts=${event.validated_decision_count}/${event.quarantined_decision_count}`,
    );
  }
}

export const ontologyCommands = {
  "ontology-review": (args) => {
    const manifest = generateOntologyReview({
      subject: args.subject,
      limit: args.importLimit,
      include: args.include,
      exclude: args.exclude,
    });
    printOntologyReviewManifest(manifest);
  },

  "ontology-normalize-run": async (args) => {
    const manifest = await runOntologyNormalizePackets({
      dryRun: args.dryRun,
      profileName: args.profileName,
      provider: args.provider,
      model: args.model,
      subject: args.subject,
      limit: args.importLimit,
      include: args.include,
      exclude: args.exclude,
      concurrency: args.concurrency,
      onProgress: printOntologyNormalizeProgress,
    });
    printOntologyNormalizeManifest(manifest);
    if (manifest.failed > 0) process.exitCode = 1;
  },

  "schema-audit": (args) => {
    const manifest = generateSchemaAudit({
      include: args.include,
      exclude: args.exclude,
    });
    printSchemaAuditManifest(manifest);
  },

  "schema-propose": async (args) => {
    const manifest = await runSchemaEnumProposals({
      dryRun: args.dryRun,
      profileName: args.profileName,
      provider: args.provider,
      model: args.model,
      include: args.include,
      exclude: args.exclude,
      concurrency: args.concurrency,
      force: args.force,
    });
    printSchemaProposalManifest(manifest);
    if (manifest.failed > 0 || manifest.invalid > 0) process.exitCode = 1;
  },
} satisfies Record<string, CommandHandler>;
