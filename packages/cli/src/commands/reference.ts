import { relative } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { captureScheduleSnapshots, captureX64PredecessorSnapshot } from "@mta-wiki/pipeline/reference/bus-schedules";
import {
  stageHistoricalFullStopEvidence,
  writeHistoricalFullStopEvidence,
} from "@mta-wiki/pipeline/reference/historical-full-stop";
import { buildCurrentLaneProbe, writeLaneTraversalDossier } from "@mta-wiki/pipeline/reference/lane-traversal";
import { writeRequiredScheduleDiffDossiers, writeScheduleDiffDossier } from "@mta-wiki/pipeline/reference/schedule-diff";
import {
  loadOperationalSnapshotRegistryIfPresent,
  mergeOperationalSnapshots,
  stageDownloadedDotSnapshot,
  stageLocalDotSnapshot,
  stageLocalGtfsSnapshots,
  validateOperationalReferenceRegistry,
  writeOperationalSnapshotRegistry,
  type OperationalSnapshot,
} from "@mta-wiki/pipeline/reference/snapshot-registry";
import { optionValue, optionValues, requireSubject, type CommandHandler } from "./shared.js";

function currentSnapshots(): OperationalSnapshot[] {
  return loadOperationalSnapshotRegistryIfPresent()?.snapshots ?? [];
}

function listOption(name: string): string[] {
  return optionValues(process.argv, name).flatMap((value) => value.split(",")).filter(Boolean);
}

function explicitSelection(): {
  gtfsSnapshotIds: string[];
  scheduleSnapshotIds: string[];
} {
  const gtfsSnapshotIds = listOption("--gtfs");
  const scheduleSnapshotIds = listOption("--schedules");
  if (gtfsSnapshotIds.length === 0 || scheduleSnapshotIds.length === 0) {
    throw new Error("Explicit --gtfs <snapshot[,snapshot...]> and --schedules <snapshot[,snapshot...]> inputs are required");
  }
  return { gtfsSnapshotIds, scheduleSnapshotIds };
}

const referenceSnapshots: CommandHandler = async () => {
  let snapshots = currentSnapshots();
  if (process.argv.includes("--stage-local")) {
    snapshots = mergeOperationalSnapshots(snapshots, [...stageLocalGtfsSnapshots(), stageLocalDotSnapshot()]);
    writeOperationalSnapshotRegistry(snapshots);
  }
  const freshDot = optionValue(process.argv, "--fresh-dot");
  if (freshDot) {
    const headers = optionValue(process.argv, "--headers");
    const retrievedAt = optionValue(process.argv, "--retrieved-at");
    const date = optionValue(process.argv, "--date");
    if (!headers || !retrievedAt || !date) {
      throw new Error("--fresh-dot requires --headers, --retrieved-at, and --date");
    }
    snapshots = mergeOperationalSnapshots(snapshots, [stageDownloadedDotSnapshot({
      date,
      retrievedAt,
      geojsonPath: freshDot,
      responseHeadersPath: headers,
    })]);
    writeOperationalSnapshotRegistry(snapshots);
  }
  if (process.argv.includes("--capture-schedules")) {
    const capture = await captureScheduleSnapshots();
    snapshots = mergeOperationalSnapshots(snapshots, capture.snapshots);
    writeOperationalSnapshotRegistry(snapshots);
    console.log(`Schedule request universe: ${capture.universe.windows.length} windows (${capture.universe_sha256})`);
  }
  if (process.argv.includes("--capture-x64-predecessor")) {
    snapshots = mergeOperationalSnapshots(snapshots, [await captureX64PredecessorSnapshot()]);
    writeOperationalSnapshotRegistry(snapshots);
  }
  const report = validateOperationalReferenceRegistry();
  console.log(`Operational snapshots: ${report.registry?.snapshots.length ?? 0}`);
  console.log(`Registry SHA-256: ${report.registry_sha256 ?? "(missing)"}`);
  for (const status of report.snapshots) console.log(`- ${status.snapshot_id}: ${status.status}`);
  if (report.issues.length > 0) {
    for (const issue of report.issues) console.error(`${issue.code}: ${issue.path}: ${issue.message}`);
    process.exitCode = 1;
  }
};

const laneTraversal: CommandHandler = () => {
  const selected = explicitSelection();
  const laneSnapshotId = optionValue(process.argv, "--lanes");
  const candidateLedgerPath = optionValue(process.argv, "--candidate-ledger");
  if (!laneSnapshotId || !candidateLedgerPath) {
    throw new Error("lane-traversal requires explicit --lanes <snapshot> and --candidate-ledger <path>");
  }
  const result = writeLaneTraversalDossier({
    ...selected,
    laneSnapshotId,
    candidateLedgerPath,
    trackerInputPath: optionValue(process.argv, "--tracker-input"),
  }, optionValue(process.argv, "--output"));
  console.log(`Lane traversal: ${relative(repoRoot, result.path)}`);
  console.log(`Rows: ${result.rows.length}; candidates: ${new Set(result.rows.map((row) => row.candidate_id)).size}`);
  console.log(`SHA-256: ${result.sha256}`);
};

const laneTraversalProbe: CommandHandler = () => {
  const gtfsSnapshotIds = listOption("--gtfs");
  const laneSnapshotId = optionValue(process.argv, "--lanes");
  const routeIds = listOption("--routes");
  const serviceDate = optionValue(process.argv, "--date");
  if (gtfsSnapshotIds.length === 0 || !laneSnapshotId || routeIds.length === 0 || !serviceDate) {
    throw new Error("lane-traversal-probe requires --gtfs, --lanes, --routes, and --date");
  }
  const rows = buildCurrentLaneProbe({ gtfsSnapshotIds, laneSnapshotId, routeIds, serviceDate });
  for (const routeId of routeIds) {
    const routeRows = rows.filter((row) => row.route_id === routeId);
    console.log(`${routeId}: ${routeRows.filter((row) => row.verdict_class === "traversal_confirmed").length} confirmed / ${routeRows.length} overlap rows`);
  }
  console.log(`Total: ${rows.filter((row) => row.verdict_class === "traversal_confirmed").length} confirmed / ${rows.length} overlap rows`);
};

const scheduleDiff: CommandHandler = (args) => {
  const selected = explicitSelection();
  if (process.argv.includes("--required")) {
    for (const result of writeRequiredScheduleDiffDossiers(selected)) {
      console.log(`${result.dossier.route_id}: ${relative(repoRoot, result.path)} (${result.sha256})`);
    }
    return;
  }
  const routeId = requireSubject(args.command, args.subject, "route id");
  const beforeDate = optionValue(process.argv, "--before");
  const afterDate = optionValue(process.argv, "--after");
  if (!beforeDate || !afterDate) throw new Error("schedule-diff requires --before YYYY-MM-DD and --after YYYY-MM-DD");
  const correspondRoutes = optionValues(process.argv, "--correspond").flatMap((value) => value.split(",")).filter(Boolean);
  const beforeRouteId = optionValue(process.argv, "--before-route");
  const result = writeScheduleDiffDossier({
    ...selected,
    routeId,
    ...(beforeRouteId ? { beforeRouteId } : {}),
    beforeDate,
    afterDate,
    correspondRoutes,
    outputPath: optionValue(process.argv, "--output"),
  });
  console.log(`Schedule diff: ${relative(repoRoot, result.path)}`);
  console.log(`SHA-256: ${result.sha256}`);
};

const historicalFullStop: CommandHandler = () => {
  const paths = {
    queens_before: optionValue(process.argv, "--queens-before"),
    queens_after: optionValue(process.argv, "--queens-after"),
    busco_before: optionValue(process.argv, "--busco-before"),
    busco_after: optionValue(process.argv, "--busco-after"),
  };
  const provided = Object.values(paths).filter((value) => value !== undefined).length;
  if (provided !== 0 && provided !== 4) {
    throw new Error(
      "historical-full-stop requires all four of --queens-before, --queens-after, --busco-before, and --busco-after",
    );
  }
  const result = provided === 4
    ? stageHistoricalFullStopEvidence({
      queens_before: paths.queens_before!,
      queens_after: paths.queens_after!,
      busco_before: paths.busco_before!,
      busco_after: paths.busco_after!,
    })
    : writeHistoricalFullStopEvidence();
  console.log(`Historical full-stop acceptance manifest: ${relative(repoRoot, result.acceptance_manifest_path)}`);
  console.log(`SHA-256: ${result.acceptance_manifest_sha256}`);
  console.log(`Replay hash: ${result.replay_hash}`);
  console.log(`Covered candidates: ${result.covered_candidate_count}`);
  console.log(`Verdicts: ${JSON.stringify(result.verdict_distribution)}`);
};

export const referenceCommands = {
  "reference-snapshots": referenceSnapshots,
  "lane-traversal": laneTraversal,
  "lane-traversal-probe": laneTraversalProbe,
  "schedule-diff": scheduleDiff,
  "historical-full-stop": historicalFullStop,
} satisfies Record<string, CommandHandler>;
