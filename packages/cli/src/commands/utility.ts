import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseGtfsSnapshotManifestV2, verifyGtfsSnapshotDirectory } from "@mta-wiki/db/gtfs-snapshot";
import { parseRouteInventoryJsonl } from "@mta-wiki/pipeline/materialize/route-identity-contract";
import { buildRouteIdentityAudit, routeIdentityAuditBytes, routeIdentityAuditSha256, routeIdentityReviewMarkdown } from "@mta-wiki/pipeline/materialize/route-identities";
import {
  listModels,
  listProfiles,
  listProviders,
  listTranscripts,
  renderTranscript,
  repoRoot,
  writeTranscriptUsageArtifacts,
  type TranscriptUsageSummary,
} from "@mta-wiki/agents";
import type { CommandHandler } from "./shared.js";

function printHelp() {
  console.log(`MTA LLM wiki CLI

Usage:
  bun run harness prepare-source <source-dir>
  bun run harness prepare-source <source-dir> --source-id <local-source-id>
  bun run harness import-sources <root-or-sources-dir> [--dry-run] [--limit <n>] [--include <regex>] [--exclude <regex>]
  bun run harness chandra-queue [source-id] [--limit <n>] [--include <regex>] [--exclude <regex>] [--force]
  bun run harness chandra-run [source-id] [--limit <n>] [--include <regex>] [--exclude <regex>] [--max-pages <n>] [--batch-size <n>] [--force]
  bun run harness seed-pilot
  bun run harness materialize
  bun run harness export-jsonl [--verify]   On-demand JSONL dump of the live DB; --verify asserts DB == shadow JSONL
  bun run harness export-release [--id <release-id>] [--force] [--set-latest] [--quality-report <path>] [--output-root <path> --relationship-completeness-staging]   Versioned release snapshot; --set-latest explicitly promotes it
  bun run harness verify-release <release-id>   Strictly verify an existing named release directory
  bun run harness export-site                                      Build static HTML under dist/site and run Pagefind
  bun run harness quality-report [release-id] [--check]          Write or byte-check deterministic release quality under data/quality/
  bun run harness operational-coverage [--output <dir>] [--decisions <dir>] [--search-receipts <dir>] [--start YYYY-MM-DD --end YYYY-MM-DD]   Write the deterministic completion ledger, priority queue, and honest coverage matrix
  bun run harness coverage-matrix [same options]                 Alias for operational-coverage
  bun run harness forecast-frontier --as-of YYYY-MM-DD --grace-days <n> [--coverage <dir>] [--output <dir>]   Write the deterministic forecast-to-realized acquisition target list
  bun run harness forecast-review-overlay [--frontier <target-list.json>] [--reviews <dir>]   Validate the append-only reviewed overlay and regenerate its manifest/follow-up
  bun run harness operational-recovery-proposals                 Validate and summarize the reviewed recovery proposal tree
  bun run harness qbnr-recovery-draft <reviewed-spec.json>       Strictly expand one QBNR batch into the proposed queue
  bun run harness operational-recovery-apply <proposal-id> [--force]   Dry-run or apply one accepted proposal into an append-only journal
  bun run harness quality-seeded-defects --seed semqa-v1          Write deterministic seeded-defect fixtures
  bun run harness quality-judge-calibration --verdicts <jsonl>    Score judge verdicts against frozen calibration fixtures
  bun run harness semantic-sweep [--dry-run] [--limit <n>] [--kinds <k1,k2>] [--source <source-id>] [--batch-size <n>]   Judge evidence support into data/semantic-sweep/
  bun run harness fact-dedup --scout [--run-id <id>]             Write deterministic fact-key duplicate scout report
  bun run harness fact-dedup --same-source --dry-run [--run-id <id>]   Write owner-review same-source retirement table
  bun run harness replay-eval [--release-id <id>] [--run-id <id>] [--actual-dir <dir>] [--actual-only]   Build replay manifest/baseline and diff actual outputs against v1
  bun run harness extract [--source <source-id>] [--run-id <id>] [--limit <n>] [--mock-response <path>]   Run v2 extraction into data/replay/runs/
  bun run harness identity-review [--limit <n>] [--include <regex>] [--exclude <regex>]
  bun run harness identity-review-run [packet-or-cluster] [--limit <n>] [--include <regex>] [--exclude <regex>] [--concurrency <n>] [--force] [--dry-run]
  bun run harness identity-review-apply [cluster] [--limit <n>] [--include <regex>] [--exclude <regex>] [--dry-run] [--force]
  bun run harness identity-review-autoaccept [--limit <n>] [--include <regex>] [--exclude <regex>] [--force]   Structural gate per docs/identity-merge-canon.md; dry-run by default
  bun run harness canonicalize <run-id> [--kind <kind>] [--dry-run] [--concurrency <n>] [--profile <name>] [--force]
  bun run harness canonicalize-review <run-id> [--concurrency <n>] [--profile <name>] [--dry-run]
  bun run harness canonicalize-apply <run-id> [--dry-run] [--force] [--reapply]
  bun run harness canonicalize-wave --wave <n> [--id <id>] [--concurrency <R>] [--packet-concurrency <P>] [--timeout-min <m>] [--profile <name>] [--dry-run]   Canonicalize a wave's runs: parallel propose/review, serialized apply, resumable (docs/canonicalize-concurrency-plan.md)
  bun run harness cross-source-candidates
  bun run harness import-gtfs <gtfs-feed-dir>   Stage the MTA static bus GTFS; materialize loads ref_gtfs_routes + ref_agencies
  bun run harness dossier <record-id>          Write a source-backed dossier (markdown + JSON) under data/dossiers/
  bun run harness gap-report                   Write the classified gap queue (gaps.jsonl + summary) under data/gap-report/<ts>/
  bun run harness post-ingest-plan <source-id> [--wave <n>] [--id <id>]   Write a source/wave post-ingest work manifest under data/post-ingest/
  bun run harness verify-writer-edits          Check changed files are only writer regions or data/review_notes/*.jsonl
  bun run harness verify-writer-citations <wiki-page...>   Check writer-region source_id#block_id citations resolve to staged source blocks
  bun run harness campaign readiness [--id <id>]              W0 readiness sweep → data/campaigns/<id>/readiness.jsonl (authoritative wave list)
  bun run harness campaign ingest --wave <n> [--id <id>] [--size <n>] [--concurrency <n>] [--timeout-min <n>] [--profile <name>]   Ingest a wave (dedupe by source_id, quarantine failures, resumable; rate-limited, every-K materialize)
  bun run harness campaign dedup --wave <n> [--id <id>] [--profile <name>] [--concurrency <n>] [--dry-run]   Post-wave cross-source identity dedup (review -> auto-accept -> apply -> validate)
  bun run harness campaign golden [--id <id>]                Summarize the golden question set (grading is W2+, per plan §4/§5)
  bun run harness migrate-batch1 [--dry-run] [--force]
  bun run harness migrate-batch2 [--dry-run] [--force]
  bun run harness ontology-review [agent-id] [--limit <n>] [--include <regex>] [--exclude <regex>]
  bun run harness ontology-normalize-run [agent-id] [--limit <n>] [--include <regex>] [--exclude <regex>] [--concurrency <n>] [--dry-run]
  bun run harness schema-audit [--include <regex>] [--exclude <regex>]
  bun run harness schema-propose [--profile <name>] [--include <regex>] [--exclude <regex>] [--concurrency <n>] [--force] [--dry-run]
  bun run harness pipeline-report [run-id[,run-id...]]
  bun run harness post-ingest-audit [--id <id>]   Check readiness exhaustion and post-ingest scope coverage
  bun run harness source-id-drift-audit            Check accepted submissions for missing/mismatched source IDs
  bun run harness post-ingest-goal-audit [--id <id>] [--writer-readiness <json>]  Write deterministic active-goal completion audit
  bun run harness audit [submission-jsonl-or-run-id]
  bun run harness writer-backlog-queue [--limit <n>]   Rank empty writer-region pages for Codex/subagent drafting
  bun run harness writer-backlog-packets [--limit <n>] [--offset <n>] [--batches <n>] Build bounded Codex/subagent writer packets without editing pages
  bun run harness writer-packet-set-manifest [--label <name>] Freeze the exact current writer packet artifact set
  bun run harness writer-packet-dispatch-plan [--packets-per-shard <n>] [--max-shards <n>] [--packet-set <json>] Build paused Codex/subagent writer dispatch shards from packet artifacts
  bun run harness writer-packet-dispatch-status <dispatch-json> [--write] Report shard progress from writer-region emptiness without editing pages
  bun run harness writer-packet-dispatch-next-shard <dispatch-json> [--shard <id>] Write the next claimed not-started shard handoff
  bun run harness writer-packet-dispatch-handoff-batch <dispatch-json> [--limit <n>] [--skip <n>] Write a bounded claimed not-started shard handoff batch
  bun run harness writer-packet-dispatch-handoff-prompts <handoff-json> Split a verified handoff batch into one prompt file per shard
  bun run harness writer-packet-dispatch-handoff-prompt-coverage <dispatch-json> <prompts-json...> Write an aggregate prompt coverage launch board
  bun run harness writer-packet-dispatch-claim <dispatch-json> [--limit <n>] [--owner <name>] Claim paused dispatch shards without editing pages or launching writers
  bun run harness writer-packet-dispatch-readiness <dispatch-json> [--packet-set <json>] Write a combined paused-dispatch readiness report
  bun run harness write-writer-packet <packet-json>  Run the safe writer agent for one one-page writer packet
  bun run harness verify-writer-packets <packet-json>  Check writer packet records/pages/source-block snippets are still valid
  bun run harness verify-writer-packet-set <packet-json...> Check packet files plus cross-file duplicate page coverage
  bun run harness verify-writer-packet-set-manifest <packet-set-json> Check exact packet-set file/page coverage
  bun run harness verify-writer-packet-dispatch-plan <dispatch-json> Check dispatch shards, packet files, page coverage, and gate commands
  bun run harness verify-writer-packet-dispatch-claim <claim-json> Check claimed shards still match the dispatch plan and not-started state
  bun run harness verify-writer-packet-dispatch-claims <dispatch-json> Check all claim files for a dispatch plan together
  bun run harness verify-writer-packet-dispatch-handoff-batch <handoff-json> Check a handoff batch is still claimed, not-started, and packet-valid
  bun run harness verify-writer-packet-dispatch-handoff-prompts <prompts-json> Check per-shard handoff prompt files still match the verified batch
  bun run harness verify-writer-packet-dispatch-handoff-prompt-coverage <dispatch-json> <prompts-json...> Check prompt reports collectively cover dispatch shards exactly once
  bun run harness verify-writer-packet-edits <packet-json...> Check packet pages after writer edits using strict edit and citation gates
  bun run validate

Agent orchestration:
	  bun run harness ingest <source-id> --dry-run [--profile <name>]
	  bun run harness write <source-id> --dry-run [--profile <name>] [--safe-writer]
	  bun run harness ask "<question>" [--profile <name>] [--dry-run]
	  bun run harness resume <run-name-or-session-path> --message "follow-up question"

Question answering:
  bun run harness build-index [--force]   Embed canonical records for semantic search (needs the embeddings server)
  bun run harness ask "<question>"         Answer a question from the corpus with source-backed citations

Utility:
  bun run harness profiles
  bun run harness providers
  bun run harness models [provider]
  bun run harness transcripts
  bun run harness transcript [run-name] [--full]
  bun run harness usage [run-name]

Provider selection:
  --profile <name>     Use a named profile from harness.config.json
  --provider <id>      Override selected profile provider
  --model <id>         Override selected profile model
  --source-id <id>     Compact local id when preparing a source
  --limit <n>          Limit batch source import entries
  --include <regex>    Only import source ids/titles/groups matching regex
  --exclude <regex>    Skip source ids/titles/groups matching regex
  --force              Restage already imported sources
  --max-pages <n>      Limit cached Chandra pages considered for this run
  --batch-size <n>     Reserved for compatibility
  --concurrency <n>    Concurrent identity review packet jobs
  --message <text>     Follow-up message for resume
  --safe-writer        Writer runs only: expose curated MTA writer tools plus read-only file inspection; no generic bash/write/edit
  PI_PROFILE           Default profile override
  PI_PROVIDER          Provider override
  PI_MODEL             Model override
  PIONEER_API_KEY      Pioneer profile API key
  DEEPSEEK_API_KEY     Direct DeepSeek profile API key
`);
}

function printProfiles() {
  for (const profile of listProfiles()) {
    const keyStatus = profile.hasKey ? "key:present" : "key:missing";
    const marker = profile.isDefault ? "*" : " ";
    console.log(`${marker} ${profile.name} ${profile.provider}/${profile.model} ${profile.apiKeyEnv ?? "no-key-env"} ${keyStatus}`);
  }
}

function printProviders() {
  for (const provider of listProviders()) {
    const marker = provider.isProfileProvider ? "*" : " ";
    console.log(`${marker} ${provider.provider}`);
  }
}

function printModels(provider: string | undefined) {
  for (const model of listModels(provider)) {
    console.log(`${model.id}\t${model.name}\tcontext=${model.contextWindow}\tmax=${model.maxTokens}`);
  }
}

function printTranscripts() {
  const transcripts = listTranscripts();
  if (transcripts.length === 0) {
    console.log("No transcripts yet.");
    return;
  }

  for (const transcript of transcripts) {
    console.log(`${transcript.name}\t${relative(repoRoot, transcript.path)}`);
  }
}

function printUsage(summary: TranscriptUsageSummary) {
  console.log(`Run: ${summary.runName}`);
  console.log(`Requests: ${summary.requestCount}`);
  console.log(`Input tokens: ${summary.totals.input}`);
  console.log(`Output tokens: ${summary.totals.output}`);
  console.log(`Cache read tokens: ${summary.totals.cacheRead}`);
  console.log(`Cache write tokens: ${summary.totals.cacheWrite}`);
  console.log(`Total tokens: ${summary.totals.totalTokens}`);
  console.log(`Estimated cost: $${summary.totals.cost.total.toFixed(6)}`);
  console.log(`Usage: ${relative(repoRoot, `${summary.runPath}/usage.md`)}`);
}

export const utilityCommands = {
  help: () => {
    printHelp();
  },

  profiles: () => {
    printProfiles();
  },

  providers: () => {
    printProviders();
  },

  models: (args) => {
    printModels(args.subject ?? args.provider);
  },

  transcripts: () => {
    printTranscripts();
  },

  transcript: (args) => {
    console.log(renderTranscript(args.subject, { full: args.full }));
  },

  "verify-gtfs-reference": (args) => { verifyGtfsReference(args.snapshot ?? args.subject ?? ""); },

  "route-identity-diff": (args) => { if (!args.fromSnapshot || !args.toSnapshot) throw new Error("route-identity-diff requires --from and --to"); routeIdentityDiff(args.fromSnapshot, args.toSnapshot); },

  "route-identity-audit": (args) => { routeIdentityAudit(args.snapshot ?? args.subject ?? ""); },

  usage: (args) => {
    printUsage(writeTranscriptUsageArtifacts(args.subject));
  },
} satisfies Record<string, CommandHandler>;

const SAFE_SNAPSHOT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
function snapshotDir(snapshotId: string) {
  if (!SAFE_SNAPSHOT_ID.test(snapshotId)) throw new Error(`${snapshotId || "(empty)"}: expected a safe snapshot id`);
  return join(repoRoot, "data", "reference", "gtfs", "snapshots", snapshotId);
}
function readSnapshot(snapshotId: string) {
  const dir = snapshotDir(snapshotId);
  const verified = verifyGtfsSnapshotDirectory(dir);
  const manifestBytes = readFileSync(join(dir, "manifest.json"));
  const manifest = parseGtfsSnapshotManifestV2(JSON.parse(manifestBytes.toString("utf8")));
  if (manifest.snapshot_id !== snapshotId || verified.snapshot_id !== snapshotId) throw new Error(`${snapshotId}: snapshot manifest identity mismatch`);
  const inventory = parseRouteInventoryJsonl(readFileSync(join(dir, "route_inventory.jsonl"), "utf8"));
  return { dir, manifest, manifest_sha256: verified.manifest_sha256, inventory };
}
function verifyGtfsReference(snapshotId: string) {
  const value = readSnapshot(snapshotId);
  const selectedPath = join(repoRoot, "data", "reference", "gtfs", "SELECTED");
  const selected = existsSync(selectedPath) && readFileSync(selectedPath, "utf8") === `${snapshotId}\n`;
  console.log(JSON.stringify({ snapshot_id: snapshotId, manifest_sha256: value.manifest_sha256, route_count: value.inventory.length, selected }));
}
function routeIdentityDiff(from: string, to: string) { const a=readSnapshot(from), b=readSnapshot(to); const left=new Map(a.inventory.map(r=>[`${r.dataset_id}\0${r.source_route_id}`,r])), right=new Map(b.inventory.map(r=>[`${r.dataset_id}\0${r.source_route_id}`,r])); const keys=[...new Set([...left.keys(),...right.keys()])].sort(); const changes=keys.filter(k=>JSON.stringify(left.get(k))!==JSON.stringify(right.get(k))).map(k=>({identity:k.replace("\0","/"),before:left.get(k)??null,after:right.get(k)??null})); console.log(JSON.stringify({from,to,change_count:changes.length,changes})); }
function routeIdentityAudit(snapshotId: string) { const snapshot=readSnapshot(snapshotId); const records=readFileSync(join(repoRoot,"data","canonical","routes.jsonl"),"utf8").split(/\r?\n/u).filter(Boolean).map(line=>JSON.parse(line)); const audit=buildRouteIdentityAudit(snapshotId,records,snapshot.inventory); const out=join(repoRoot,"data","quality","route-identity",snapshotId); mkdirSync(out,{recursive:true}); writeFileSync(join(out,"proposed-bindings.json"),routeIdentityAuditBytes(audit)); writeFileSync(join(out,"review-packet.md"),routeIdentityReviewMarkdown(audit)); const digest={schema_version:1,snapshot_id:snapshotId,proposal_sha256:routeIdentityAuditSha256(audit),route_record_count:audit.route_record_count,exact_binding_count:audit.exact_binding_count,review_required_count:audit.review_required_count,approval_status:"unapproved"}; writeFileSync(join(out,"proposal-digest.json"),`${JSON.stringify(digest,null,2)}\n`); console.log(JSON.stringify(digest)); }
