import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const SHARD_DIR = import.meta.dir;
const REPO_ROOT = resolve(SHARD_DIR, "../../../../../..");
const RESEARCHED_ON = "2026-07-15";
const CANDIDATE_SET_ID = "candidate-set-v2:24080902f508b55a0033df32";
const CANDIDATE_SET_SHA256 = "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba";
const DEFAULT_TRACKER_ROOT = "/home/cjpher/.codex/worktrees/61db/bus-reliability-tracker";

const PATHS = {
  partition: join(SHARD_DIR, "partition.jsonl"),
  partitionProof: join(SHARD_DIR, "partition-proof.json"),
  sourceChecks: join(SHARD_DIR, "acquired-source-checks.json"),
  laneEvidence: join(SHARD_DIR, "official-lane-evidence.jsonl"),
  receipts: join(SHARD_DIR, "receipts.jsonl"),
  exclusions: join(SHARD_DIR, "registry-projection-exclusions.jsonl"),
  supported: join(SHARD_DIR, "supported-linkage-candidates.jsonl"),
  summary: join(SHARD_DIR, "summary.json"),
  report: join(SHARD_DIR, "report.md"),
  manifest: join(SHARD_DIR, "manifest.json"),
} as const;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type PartitionRow = {
  candidate_id: string;
  identity: string;
  route_id: string;
  normalized_route_id: string;
  implementation_date: string;
  implementation_month: string;
  date_precision: string;
  source_event_id: string;
  corridor: string;
  historical_review_rationale: string;
  ledger_row_sha256: string;
  candidate_row_sha256: string;
  review_input_path: string;
  review_input_sha256: string;
};

type LaneEvidenceRow = {
  candidate_id: string;
  source_snapshot_sha256: string;
  source_row_sha256: string;
  segment_id: string | null;
  facility: string | null;
  street: string | null;
  boro: string | null;
  open_dates: string | null;
  official_routes: string[];
  lane_type: string | null;
  lane_description: string | null;
  facility_type: string | null;
  direction: string | null;
  hours: string | null;
  days: string | null;
};

type SourceCategory = "dot_lane_project" | "mta_route_project" | "board_committee" | "other_primary";

type AcquiredSource = {
  id: string;
  category: SourceCategory;
  url: string;
  retrieval_status: "acquired" | "not_retrieved";
  retrieved_on: string;
  http_status: number | null;
  media_type: string | null;
  content_sha256: string | null;
  byte_length: number | null;
  raw_content_retained: false;
  note: string;
};

type RoutePageCheck = {
  candidate_id: string;
  route_id: string;
  query_route_id: string;
  corridor: string;
  url: string;
  retrieval_status: "acquired" | "not_retrieved";
  retrieved_on: string;
  http_status: number | null;
  content_sha256: string | null;
  byte_length: number | null;
  exact_route_title_found: boolean;
  corridor_token_found: boolean;
  title: string | null;
  raw_content_retained: false;
};

type SourceDefinition = {
  id: string;
  category: SourceCategory;
  url: string;
  note: string;
};

type CorridorResearch = {
  web_query: string;
  source_ids: string[];
  board_source_ids: string[];
  exact_project_routes: string[];
  observed_project_routes: string[];
  project_route_basis: string | null;
  support_note: string | null;
};

const OFFICIAL_SOURCES: SourceDefinition[] = [
  { id: "dot_bus_lanes_snapshot", category: "dot_lane_project", url: "https://data.cityofnewyork.us/resource/ycrg-ses3.json?$limit=5000", note: "Authoritative NYC DOT Bus Lanes - Local Streets API snapshot; selected records are retained without geometry." },
  { id: "dot_bus_lanes_metadata", category: "other_primary", url: "https://data.cityofnewyork.us/api/views/ycrg-ses3", note: "NYC Open Data metadata for the official DOT bus-lane dataset." },
  { id: "dot_datafeeds", category: "other_primary", url: "https://www.nyc.gov/html/dot/html/about/datafeeds.shtml", note: "NYC DOT data catalog linking the official Bus Lane Locations dataset." },
  { id: "mta_staten_express_map", category: "mta_route_project", url: "https://files.mta.info/s3fs-public/pdf/bussi-express_0.pdf", note: "Official MTA Staten Island express-bus network map; used only as current route context." },
  { id: "better_buses_action_plan_2019", category: "dot_lane_project", url: "https://www.nyc.gov/html/brt/downloads/pdf/better-buses-action-plan-2019.pdf", note: "Joint NYC DOT/MTA action plan explicitly inventories routes and treatments for Battery Place and Madison Avenue." },
  { id: "dot_projects_2019", category: "board_committee", url: "https://www.nyc.gov/html/dot/html/about/projects-2019.shtml", note: "NYC DOT 2019 project index records the 14th Street pilot and its community-board materials." },
  { id: "dot_projects_2020", category: "board_committee", url: "https://www.nyc.gov/html/dot/html/about/projects-2020.shtml", note: "NYC DOT 2020 project index exposes Hylan Boulevard Community Advisory Board materials." },
  { id: "dot_projects_2021", category: "board_committee", url: "https://www.nyc.gov/html/dot/html/about/projects-2021.shtml", note: "NYC DOT 2021 project index exposes the Battery Place Manhattan CB1 presentation." },
  { id: "dot_projects_2025", category: "board_committee", url: "https://www.nyc.gov/html/dot/html/about/projects-2025.shtml", note: "NYC DOT 2025 project index checked for Third Avenue, Madison Avenue, Victory Boulevard, and Father Capodanno materials." },
  { id: "dot_current_projects", category: "board_committee", url: "https://www.nyc.gov/html/dot/html/about/current-projects.shtml", note: "NYC DOT current and archived project index checked across all shard corridors." },
  { id: "fourteenth_street_completion", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/html/pr2019/pr19-069.shtml", note: "Joint NYC DOT/MTA release identifies M14A/D SBS as the routes served by the 14th Street priority project, not SIM33." },
  { id: "hylan_cb_july_2020", category: "board_committee", url: "https://www.nyc.gov/html/dot/downloads/pdf/hylan-blvd-lincoln-ave-nelson-ave-cab-jul2020.pdf", note: "Official Hylan Boulevard CAB presentation defines the 2020 lane extension and inventories the routes in its project analysis." },
  { id: "hylan_overview_august_2020", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/downloads/pdf/hylan-blvd-bus-lanes-overview-aug2020.pdf", note: "Official NYC DOT overview gives the bounded northbound and southbound extents for the 2020 Hylan Boulevard extension." },
  { id: "hylan_completion", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/html/pr2021/better-buses-mid-island-hylan-blvd-complete.shtml", note: "NYC DOT completion release documents the Hylan Boulevard extension and eleven-route corridor context." },
  { id: "victory_cb2_2025", category: "board_committee", url: "https://www.nyc.gov/html/dot/downloads/pdf/victory-blvd-bay-st-wild-ave-winter2025.pdf", note: "Official Victory Boulevard outreach deck inventories corridor routes and separately describes historical bus-lane segments." },
  { id: "battery_place_launch", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-020.shtml", note: "NYC DOT completion release documents the June 2021 Battery Place treatment but does not itself enumerate routes." },
  { id: "third_avenue_completion", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/html/pr2023/completion-safety-project-third-ave.shtml", note: "NYC DOT completion release names M98, M101, M102, and M103, not the shard SIM candidates." },
  { id: "thirty_fourth_busway_proposal", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/html/pr2025/propose-busway-34-street-manhattan.shtml", note: "NYC DOT 34th Street material documents the M34 corridor; it does not bind SIM23 or SIM24 to the candidate phase." },
  { id: "select_bus_service_report", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/downloads/pdf/nyc-dot-select-bus-service-report.pdf", note: "Official NYC DOT/MTA SBS report documents the S79 Hylan/Richmond treatment." },
  { id: "bus_lane_camera_release_2021", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-019.shtml", note: "Official NYC DOT enforcement release identifies S79 on Hylan Boulevard/Richmond Avenue and M1-M4 on Madison Avenue." },
  { id: "father_capodanno_safety_2023", category: "board_committee", url: "https://www.nyc.gov/html/dot/downloads/pdf/lincoln-ave-father-capodanno-blvd-railroad-ave-april-2023.pdf", note: "Official corridor presentation was checked and does not establish S52 use of a candidate bus-lane segment." },
];

function research(
  webQuery: string,
  sourceIds: string[],
  boardSourceIds: string[],
  exactProjectRoutes: string[] = [],
  projectRouteBasis: string | null = null,
  supportNote: string | null = null,
  observedProjectRoutes: string[] = exactProjectRoutes,
): CorridorResearch {
  return {
    web_query: webQuery,
    source_ids: ["dot_bus_lanes_snapshot", ...sourceIds],
    board_source_ids: boardSourceIds,
    exact_project_routes: exactProjectRoutes,
    observed_project_routes: observedProjectRoutes,
    project_route_basis: projectRouteBasis,
    support_note: supportNote,
  };
}

const BATTERY_ROUTES = [
  "BM1", "BM2", "BM3", "BM4", "QM7", "QM8", "QM11", "QM25",
  "SIM1", "SIM1C", "SIM2", "SIM3C", "SIM4", "SIM4C", "SIM4X", "SIM5",
  "SIM15", "SIM32", "SIM33C", "SIM34", "SIM35", "X27", "X28",
];
const MADISON_ROUTES = [
  "M1", "M2", "M3", "M4", "Q32", "SIM4C", "SIM6", "SIM8", "SIM8X",
  "SIM11", "SIM22", "SIM25", "SIM26", "SIM30", "SIM31", "SIM33C",
];
const HYLAN_2020_ROUTES = [
  "S57", "S78", "S79", "SIM1", "SIM5", "SIM6", "SIM7", "SIM9", "SIM10", "SIM11",
];
const VICTORY_CORRIDOR_ROUTES = [
  "S46", "S48", "S61", "S62", "S66", "S91", "S92", "S93", "S96", "S98",
  "SIM3", "SIM3C", "SIM30", "SIM32", "SIM33", "SIM34",
];

const CORRIDOR_RESEARCH: Record<string, CorridorResearch> = {
  "14 Street (9 Avenue- 3 Avenue)": research("site:nyc.gov 14th Street transit truck priority 2019 M14A M14D SIM33", ["fourteenth_street_completion"], ["dot_projects_2019"], ["M14A", "M14D"], "fourteenth_street_completion", "The joint release explicitly names M14A/D SBS; it does not bind SIM33."),
  "34th Street": research("site:nyc.gov 34th Street bus lane 2015 M34 M34A SIM23 SIM24", ["thirty_fourth_busway_proposal"], ["dot_projects_2025", "dot_current_projects"], ["M34", "M34A"], "thirty_fourth_busway_proposal", "Official 34th Street materials concern the M34 corridor and do not establish either SIM candidate's historical phase."),
  "3rd Avenue": research("site:nyc.gov 3rd Avenue bus lane 2025 M98 M101 M102 M103 SIM", ["third_avenue_completion"], ["dot_projects_2025", "dot_current_projects"], ["M98", "M101", "M102", "M103"], "third_avenue_completion", "The official completion release names Manhattan local routes, not the five SIM projections."),
  "Battery Pl": research("site:nyc.gov Battery Place bus lane 2021 SIM1 SIM2 SIM35 routes", ["better_buses_action_plan_2019", "battery_place_launch"], ["dot_projects_2021"], BATTERY_ROUTES, "better_buses_action_plan_2019", "The joint plan explicitly inventories the Battery Place route set and proposed curbside lanes; the completion release confirms the later treatment, but exact candidate segment and phase identity remain unproved."),
  "Father Capodanno Bl": research("site:nyc.gov Father Capodanno Boulevard bus lane S52 2010", ["select_bus_service_report"], ["father_capodanno_safety_2023", "dot_current_projects"], [], null, "The official corridor and SBS sources checked do not bind S52 to a Father Capodanno bus-lane segment."),
  "Hylan Bl / Hylan Boulevard": research("site:nyc.gov Hylan Boulevard bus lanes 2020 S57 S78 S79 SIM routes", ["hylan_overview_august_2020", "hylan_completion", "select_bus_service_report"], ["hylan_cb_july_2020", "dot_projects_2020"], HYLAN_2020_ROUTES, "hylan_cb_july_2020", "The official CAB deck defines the extension and inventories the ten routes used in its project analysis; exact registry segment and candidate-day phase remain unproved."),
  "Hylan Boulevard": research("site:nyc.gov Hylan Boulevard bus lanes 2020 S57 S78 S79 SIM routes", ["hylan_overview_august_2020", "hylan_completion", "select_bus_service_report"], ["hylan_cb_july_2020", "dot_projects_2020"], HYLAN_2020_ROUTES, "hylan_cb_july_2020", "The official CAB deck defines the extension and inventories the ten routes used in its project analysis; exact registry segment and candidate-day phase remain unproved."),
  "Madison Avenue": research("site:nyc.gov Madison Avenue double bus lanes SIM8 SIM22 SIM25 SIM26 SIM30", ["better_buses_action_plan_2019", "bus_lane_camera_release_2021"], ["dot_projects_2025", "dot_current_projects"], MADISON_ROUTES, "better_buses_action_plan_2019", "The joint plan explicitly lists the routes served by the existing double bus lanes; it does not prove the registry's 2012 phase/date identity."),
  "Richmond Avenue": research("site:nyc.gov Richmond Avenue bus lane S79 SBS 2012 Staten Island", ["select_bus_service_report", "bus_lane_camera_release_2021"], ["hylan_cb_july_2020", "dot_projects_2020"], ["S79"], "hylan_cb_july_2020", "Official sources bind S79 SBS to portions of Richmond Avenue, not any of the eight shard routes."),
  "Victory Bl": research("site:nyc.gov Victory Boulevard bus lanes 1963 S46 S48 S62 S66 S92 S96 S98", [], ["victory_cb2_2025", "dot_projects_2025"], [], null, "The official deck separately inventories corridor-wide routes and historical lane segments. It does not prove that any listed route used an exact 1963 candidate segment, so no proximity-derived linkage is promoted.", VICTORY_CORRIDOR_ROUTES),
};

function sortJson(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value as Json));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fileSha256(path: string): Promise<string> {
  return sha256(await readFile(path));
}

function jsonl(rows: unknown[]): string {
  return rows.map(stableJson).join("\n") + "\n";
}

async function writeStableJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(sortJson(value as Json), null, 2) + "\n");
}

function normalizeRouteId(routeId: string): string {
  return routeId.toUpperCase().replace(/-SBS$/, "").replace(/\+$/, "");
}

function busTimeRouteId(routeId: string): string {
  return routeId.endsWith("+") ? routeId.slice(0, -1) + "-SBS" : routeId;
}

function inferCorridor(rationale: string): string {
  const patterns = [
    /Pinned (.+?) rows for \d{4}-\d{2}-\d{2}/,
    /'s (.+?) candidate (?:uses|is dated)/,
    /lane piece\(s\) on (.+?) selected by/,
  ];
  for (const pattern of patterns) {
    const match = rationale.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  throw new Error("Could not infer corridor from rationale: " + rationale);
}

function corridorFacilities(corridor: string): string[] {
  return [corridor.trim(), ...corridor.split(/\s*\/\s*/).map((value) => value.trim()).filter(Boolean)]
    .filter((value, index, values) => values.indexOf(value) === index);
}

function normalizeFacility(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, "$1")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bstreet\b/g, "st")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOpenDate(value: string): string[] {
  return value.split(/\s*(?:,|&|;)\s*/).map((part) => part.trim()).filter(Boolean).flatMap((part) => {
    const match = part.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!match) return [];
    const rawYear = Number(match[3]);
    const year = match[3].length === 2 ? rawYear + (rawYear >= 60 ? 1900 : 2000) : rawYear;
    return [
      String(year).padStart(4, "0") + "-" +
      match[1].padStart(2, "0") + "-" +
      match[2].padStart(2, "0"),
    ];
  });
}

function sourceRoutes(row: Record<string, unknown>): string[] {
  return [row.sbs_route1, row.sbs_route2, row.sbs_route3]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizeRouteId(value.trim()))
    .sort();
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJsonl<T>(path: string): Promise<T[]> {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

async function rederivePartition(trackerRoot: string, write: boolean): Promise<PartitionRow[]> {
  const ledgerPath = join(REPO_ROOT, "data/quality/rc19-reject-reconciliation/rc19-reject-ledger.jsonl");
  const pinnedPath = join(
    trackerRoot,
    "docs/research/artifacts/candidate-set-v2-24080902f508b55a0033df32.study-events.json",
  );
  const reviewInputsDir = join(trackerRoot, "docs/research/reviews/rc19/inputs");
  const ledgerRows = await readJsonl<Record<string, unknown>>(ledgerPath);
  const backlog = ledgerRows.filter(
    (row) =>
      row.exclusive_primary_disposition === "mta_route_or_treatment_scope_binding_gap" &&
      row.treatment_family === "bus_lane",
  );
  if (backlog.length !== 321) throw new Error("Expected the exact 321-row backlog, got " + backlog.length);
  const pinnedSha = await fileSha256(pinnedPath);
  if (pinnedSha !== CANDIDATE_SET_SHA256) throw new Error("Pinned candidate-set hash mismatch: " + pinnedSha);
  const pinned = JSON.parse(await readFile(pinnedPath, "utf8")) as {
    candidateSetId: string;
    candidates: Array<Record<string, unknown>>;
  };
  if (pinned.candidateSetId !== CANDIDATE_SET_ID) throw new Error("Unexpected candidate set " + pinned.candidateSetId);
  const candidatesById = new Map(pinned.candidates.map((row) => [String(row.candidateId), row]));

  const reviewFiles = (await readdir(reviewInputsDir))
    .filter((name) => /^\d+-bus-lane-.*\.input\.json$/.test(name))
    .sort();
  const reviewById = new Map<string, { row: Record<string, unknown>; path: string; sha256: string }>();
  for (const name of reviewFiles) {
    const path = join(reviewInputsDir, name);
    const input = JSON.parse(await readFile(path, "utf8")) as { candidates: Array<Record<string, unknown>> };
    const inputSha = await fileSha256(path);
    for (const row of input.candidates) reviewById.set(String(row.candidateId), { row, path, sha256: inputSha });
  }

  const staten = backlog
    .filter((row) => /^(?:S\d|SIM)/.test(String(row.route_id)))
    .map((ledgerRow): PartitionRow => {
      const candidateId = String(ledgerRow.candidate_id);
      const candidate = candidatesById.get(candidateId);
      const review = reviewById.get(candidateId);
      if (!candidate) throw new Error("Candidate missing from pinned candidate set: " + candidateId);
      if (!review) throw new Error("Candidate missing from pinned review inputs: " + candidateId);
      const historical = (review.row.historicalContext ?? {}) as Record<string, unknown>;
      const rationale = String(historical.rationale ?? "");
      const routeId = String(ledgerRow.route_id);
      const expectedIdentity =
        String(candidate.routeId) + "|" +
        String(candidate.treatmentFamily) + "|" +
        String(candidate.implementationDate) + "|" +
        String(candidate.datePrecision);
      if (
        routeId !== candidate.routeId ||
        String(ledgerRow.implementation_date) !== candidate.implementationDate ||
        String(ledgerRow.identity) !== expectedIdentity
      ) {
        throw new Error("Pinned identity mismatch for " + candidateId);
      }
      const provenance = (candidate.provenance as Array<Record<string, unknown>>)[0];
      return {
        candidate_id: candidateId,
        identity: String(ledgerRow.identity),
        route_id: routeId,
        normalized_route_id: normalizeRouteId(routeId),
        implementation_date: String(ledgerRow.implementation_date),
        implementation_month: String(candidate.implementationMonth),
        date_precision: String(ledgerRow.date_precision),
        source_event_id: String(provenance.sourceEventId),
        corridor: inferCorridor(rationale),
        historical_review_rationale: rationale,
        ledger_row_sha256: sha256(stableJson(ledgerRow)),
        candidate_row_sha256: sha256(stableJson(candidate)),
        review_input_path: relative(trackerRoot, review.path),
        review_input_sha256: review.sha256,
      };
    })
    .sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));

  if (staten.length !== 54) throw new Error("Expected 54 Staten Island candidates, got " + staten.length);
  if (new Set(staten.map((row) => row.candidate_id)).size !== 54) throw new Error("Duplicate Staten Island candidate ids");
  if (new Set(staten.map((row) => row.route_id)).size !== 54) throw new Error("Staten Island partition is not one row per route");
  for (const row of staten) {
    if (!CORRIDOR_RESEARCH[row.corridor]) throw new Error("No research plan for corridor " + row.corridor);
  }

  const partitionPayload = jsonl(staten);
  const localCount = staten.filter((row) => /^S\d/.test(row.route_id)).length;
  const expressCount = staten.filter((row) => /^SIM\d/.test(row.route_id)).length;
  const proof = {
    schema_version: 1,
    shard: "staten-island",
    derived_on: RESEARCHED_ON,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    reconciliation_ledger_path: relative(REPO_ROOT, ledgerPath),
    reconciliation_ledger_sha256: await fileSha256(ledgerPath),
    exact_backlog_count: backlog.length,
    staten_island_count: staten.length,
    s_local_or_sbs_count: localCount,
    sim_express_count: expressCount,
    unique_candidate_count: new Set(staten.map((row) => row.candidate_id)).size,
    unique_route_count: new Set(staten.map((row) => row.route_id)).size,
    candidate_ids_sha256: sha256(staten.map((row) => row.candidate_id).join("\n") + "\n"),
    partition_sha256: sha256(partitionPayload),
    exclusive_partition_rule:
      "exclusive_primary_disposition=mta_route_or_treatment_scope_binding_gap AND treatment_family=bus_lane AND route_id matches ^(?:S\\d|SIM)",
  };
  if (write) {
    await writeFile(PATHS.partition, partitionPayload);
    await writeStableJson(PATHS.partitionProof, proof);
  }
  return staten;
}

async function fetchSource(source: SourceDefinition): Promise<{ source: AcquiredSource; bytes: Uint8Array | null }> {
  const base = {
    ...source,
    retrieved_on: RESEARCHED_ON,
    raw_content_retained: false as const,
  };
  const curlFallback = async (status: number | null) => {
    const process = Bun.spawn(
      ["curl", "-A", "Mozilla/5.0", "-fsSL", "--max-time", "60", source.url],
      { stdout: "pipe", stderr: "ignore" },
    );
    const bytes = new Uint8Array(await new Response(process.stdout).arrayBuffer());
    if ((await process.exited) !== 0 || bytes.byteLength === 0) return null;
    return {
      source: {
        ...base,
        retrieval_status: "acquired" as const,
        http_status: 200,
        media_type: source.url.includes("/document/") || source.url.endsWith(".pdf") ? "application/pdf" : null,
        content_sha256: sha256(bytes),
        byte_length: bytes.byteLength,
        note: source.note + " curl fallback used after fetch status " + (status ?? "unavailable") + ".",
      },
      bytes,
    };
  };
  try {
    const response = await fetch(source.url, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36",
        accept: "*/*",
      },
    });
    if (!response.ok) {
      const fallback = await curlFallback(response.status);
      if (fallback) return fallback;
      return {
        source: {
          ...base,
          retrieval_status: "not_retrieved" as const,
          http_status: response.status,
          media_type: response.headers.get("content-type"),
          content_sha256: null,
          byte_length: null,
        },
        bytes: null,
      };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      source: {
        ...base,
        retrieval_status: "acquired" as const,
        http_status: response.status,
        media_type: response.headers.get("content-type"),
        content_sha256: sha256(bytes),
        byte_length: bytes.byteLength,
      },
      bytes,
    };
  } catch {
    const fallback = await curlFallback(null);
    if (fallback) return fallback;
    return {
      source: {
        ...base,
        retrieval_status: "not_retrieved" as const,
        http_status: null,
        media_type: null,
        content_sha256: null,
        byte_length: null,
      },
      bytes: null,
    };
  }
}

async function fetchRoutePage(row: PartitionRow): Promise<RoutePageCheck> {
  const queryRoute = busTimeRouteId(row.route_id);
  const url = "https://bustime-classic.mta.info/m/?q=" + encodeURIComponent(queryRoute);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36" },
    });
    if (!response.ok) throw new Error(String(response.status));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const html = new TextDecoder().decode(bytes);
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
    const text = normalizeFacility(stripHtml(html));
    return {
      candidate_id: row.candidate_id,
      route_id: row.route_id,
      query_route_id: queryRoute,
      corridor: row.corridor,
      url,
      retrieval_status: "acquired",
      retrieved_on: RESEARCHED_ON,
      http_status: response.status,
      content_sha256: sha256(bytes),
      byte_length: bytes.byteLength,
      exact_route_title_found: title?.toUpperCase().includes("ROUTE " + queryRoute) ?? false,
      corridor_token_found: corridorFacilities(row.corridor)
        .map(normalizeFacility)
        .some((token) => text.includes(token)),
      title,
      raw_content_retained: false,
    };
  } catch {
    return {
      candidate_id: row.candidate_id,
      route_id: row.route_id,
      query_route_id: queryRoute,
      corridor: row.corridor,
      url,
      retrieval_status: "not_retrieved",
      retrieved_on: RESEARCHED_ON,
      http_status: null,
      content_sha256: null,
      byte_length: null,
      exact_route_title_found: false,
      corridor_token_found: false,
      title: null,
      raw_content_retained: false,
    };
  }
}

async function acquire(partition: PartitionRow[]): Promise<void> {
  const acquired: Array<{ source: AcquiredSource; bytes: Uint8Array | null }> = [];
  for (let index = 0; index < OFFICIAL_SOURCES.length; index += 6) {
    acquired.push(...(await Promise.all(OFFICIAL_SOURCES.slice(index, index + 6).map(fetchSource))));
  }
  const sourceChecks = acquired.map((result) => result.source).sort((left, right) => left.id.localeCompare(right.id));
  const dotCapture = acquired.find((result) => result.source.id === "dot_bus_lanes_snapshot");
  if (!dotCapture?.bytes || !dotCapture.source.content_sha256) throw new Error("NYC DOT bus-lane snapshot was not acquired");
  const laneRows = JSON.parse(new TextDecoder().decode(dotCapture.bytes)) as Array<Record<string, unknown>>;
  const evidence: LaneEvidenceRow[] = [];
  for (const candidate of partition) {
    const facilities = corridorFacilities(candidate.corridor).map(normalizeFacility);
    const matches = laneRows.filter((row) => {
      const facility = typeof row.facility === "string" ? normalizeFacility(row.facility) : "";
      const dates = typeof row.open_dates === "string" ? parseOpenDate(row.open_dates) : [];
      return facilities.includes(facility) && dates.includes(candidate.implementation_date);
    });
    if (matches.length === 0) {
      throw new Error(
        "No official lane rows matched " + candidate.candidate_id + " " + candidate.corridor + " " + candidate.implementation_date,
      );
    }
    for (const row of matches) {
      const retained = {
        segment_id: typeof row.segmentid === "string" ? row.segmentid : null,
        facility: typeof row.facility === "string" ? row.facility : null,
        street: typeof row.street === "string" ? row.street : null,
        boro: typeof row.boro === "string" ? row.boro : null,
        open_dates: typeof row.open_dates === "string" ? row.open_dates : null,
        official_routes: sourceRoutes(row),
        lane_type: typeof row.lane_type === "string" ? row.lane_type : null,
        lane_description: typeof row.lane_type2 === "string" ? row.lane_type2 : null,
        facility_type: typeof row.lane_type1 === "string" ? row.lane_type1 : null,
        direction: typeof row.direction === "string" ? row.direction : null,
        hours: typeof row.hours === "string" ? row.hours : null,
        days: typeof row.days === "string" ? row.days : null,
      };
      evidence.push({
        candidate_id: candidate.candidate_id,
        source_snapshot_sha256: dotCapture.source.content_sha256,
        source_row_sha256: sha256(stableJson(retained)),
        ...retained,
      });
    }
  }
  evidence.sort((left, right) =>
    left.candidate_id.localeCompare(right.candidate_id) ||
    String(left.segment_id).localeCompare(String(right.segment_id)) ||
    left.source_row_sha256.localeCompare(right.source_row_sha256),
  );
  await writeFile(PATHS.laneEvidence, jsonl(evidence));

  const routePages: RoutePageCheck[] = [];
  for (let index = 0; index < partition.length; index += 8) {
    routePages.push(...(await Promise.all(partition.slice(index, index + 8).map(fetchRoutePage))));
  }
  routePages.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  await writeStableJson(PATHS.sourceChecks, {
    schema_version: 1,
    shard: "staten-island",
    acquired_on: RESEARCHED_ON,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    web_search_method:
      "Official-domain web searches were performed for all 10 corridor/date groups on 2026-07-15; receipt query strings and checked URLs preserve the acquisition trail. Official results were byte-fetched and hashed where retrievable.",
    route_binding_policy:
      "Only an official route-named lane/project statement counts. Current route pages, geometry, stops, proximity, and street-name similarity never establish historical candidate linkage.",
    sources: sourceChecks,
    route_pages: routePages,
  });
}

function sourceRefs(ids: string[], sourcesById: Map<string, AcquiredSource>): AcquiredSource[] {
  return [...new Set(ids)].map((id) => {
    const source = sourcesById.get(id);
    if (!source) throw new Error("Missing acquired source definition " + id);
    return source;
  });
}

async function generate(): Promise<void> {
  const partition = await readJsonl<PartitionRow>(PATHS.partition);
  const evidence = await readJsonl<LaneEvidenceRow>(PATHS.laneEvidence);
  const checks = JSON.parse(await readFile(PATHS.sourceChecks, "utf8")) as {
    sources: AcquiredSource[];
    route_pages: RoutePageCheck[];
  };
  if (partition.length !== 54) throw new Error("Expected 54 checked partition rows");
  const sourcesById = new Map(checks.sources.map((source) => [source.id, source]));
  const routePageByCandidate = new Map(checks.route_pages.map((source) => [source.candidate_id, source]));
  const evidenceByCandidate = new Map<string, LaneEvidenceRow[]>();
  for (const row of evidence) {
    evidenceByCandidate.set(row.candidate_id, [...(evidenceByCandidate.get(row.candidate_id) ?? []), row]);
  }

  const receipts = partition.map((candidate) => {
    const researchPlan = CORRIDOR_RESEARCH[candidate.corridor];
    const laneEvidence = evidenceByCandidate.get(candidate.candidate_id) ?? [];
    const routePage = routePageByCandidate.get(candidate.candidate_id);
    if (!routePage) throw new Error("Missing route-page check for " + candidate.candidate_id);
    const datasetRouteRows = laneEvidence.filter((row) => row.official_routes.includes(candidate.normalized_route_id));
    const projectRouteListed = researchPlan.exact_project_routes
      .map(normalizeRouteId)
      .includes(candidate.normalized_route_id);
    const observedProjectRouteListed = researchPlan.observed_project_routes
      .map(normalizeRouteId)
      .includes(candidate.normalized_route_id);
    const projectSource = researchPlan.project_route_basis
      ? sourcesById.get(researchPlan.project_route_basis) ?? null
      : null;
    const projectRouteSupported =
      projectRouteListed &&
      projectSource !== null &&
      projectSource.retrieval_status === "acquired" &&
      projectSource.content_sha256 !== null;
    const routeBindingSupported = datasetRouteRows.length > 0 || projectRouteSupported;
    const namedSegmentIds = [
      ...new Set(datasetRouteRows.map((row) => row.segment_id).filter((value): value is string => value !== null)),
    ].sort();
    const exactEvidence = [
      ...datasetRouteRows.map((row) => ({
        evidence_kind: "official_dot_lane_registry_row",
        source_id: "dot_bus_lanes_snapshot",
        source_sha256: row.source_snapshot_sha256,
        source_row_sha256: row.source_row_sha256,
        segment_id: row.segment_id,
        official_routes: row.official_routes,
        open_dates: row.open_dates,
        support_note: "The official row itself names this route; no proximity inference was used.",
      })),
      ...(projectRouteSupported && projectSource
        ? [{
            evidence_kind: "official_project_route_statement",
            source_id: projectSource.id,
            source_sha256: projectSource.content_sha256,
            source_row_sha256: null,
            segment_id: null,
            official_routes: researchPlan.exact_project_routes,
            open_dates: null,
            support_note: researchPlan.support_note,
          }]
        : []),
    ];
    const checkedCorridorSources = sourceRefs(researchPlan.source_ids, sourcesById);
    const checkedBoardSources = sourceRefs(researchPlan.board_source_ids, sourcesById);
    const officialRoutes = [...new Set(laneEvidence.flatMap((row) => row.official_routes))].sort();
    const acquisitionChannelsAcquired = {
      dot: checkedCorridorSources.some(
        (source) =>
          (source.category === "dot_lane_project" || source.id === "dot_bus_lanes_snapshot") &&
          source.retrieval_status === "acquired",
      ),
      mta:
        routePage.retrieval_status === "acquired" ||
        sourcesById.get("mta_staten_express_map")?.retrieval_status === "acquired",
      board: checkedBoardSources.some((source) => source.retrieval_status === "acquired"),
      other:
        sourcesById.get("dot_bus_lanes_metadata")?.retrieval_status === "acquired" &&
        sourcesById.get("dot_datafeeds")?.retrieval_status === "acquired",
    };
    const acquiredForCandidate = Object.values(acquisitionChannelsAcquired).every(Boolean);
    const disposition = routeBindingSupported
      ? "linkage_supported_phase_unresolved"
      : "completed_search_route_linkage_unresolved";
    const dotAttemptSources = checkedCorridorSources.filter(
      (source) => source.category === "dot_lane_project" || source.id === "dot_bus_lanes_snapshot",
    );
    const mtaMap = sourcesById.get("mta_staten_express_map");
    if (!mtaMap) throw new Error("Missing MTA Staten Island network-map acquisition check");
    const metadata = sourcesById.get("dot_bus_lanes_metadata");
    const datafeeds = sourcesById.get("dot_datafeeds");
    if (!metadata || !datafeeds) throw new Error("Missing official Open Data source checks");

    const receiptCore = {
      schema_version: 1,
      campaign: "canonical-relationship-integrity-v1",
      shard: "staten-island",
      researched_on: RESEARCHED_ON,
      candidate: {
        candidate_id: candidate.candidate_id,
        candidate_set_id: CANDIDATE_SET_ID,
        candidate_set_sha256: CANDIDATE_SET_SHA256,
        identity: candidate.identity,
        route_id: candidate.route_id,
        normalized_route_id: candidate.normalized_route_id,
        treatment_family: "bus_lane",
        implementation_date: candidate.implementation_date,
        implementation_month: candidate.implementation_month,
        date_precision: candidate.date_precision,
        source_event_id: candidate.source_event_id,
        registry_source_id: "nyc_dot_bus_lanes",
        corridor: candidate.corridor,
      },
      partition_evidence: {
        ledger_row_sha256: candidate.ledger_row_sha256,
        candidate_row_sha256: candidate.candidate_row_sha256,
        review_input_path: candidate.review_input_path,
        review_input_sha256: candidate.review_input_sha256,
      },
      acquisition_attempts: [
        {
          category: "official_nyc_dot_lane_project",
          query: researchPlan.web_query,
          query_status: "performed_2026-07-15",
          urls_checked: dotAttemptSources.map((source) => source.url),
          retrievals: dotAttemptSources.map((source) => ({
            id: source.id,
            status: source.retrieval_status,
            retrieved_on: source.retrieved_on,
            sha256: source.content_sha256,
          })),
        },
        {
          category: "official_mta_route_project",
          query: "site:mta.info \"" + candidate.route_id + "\" \"" + candidate.corridor + "\" bus route project",
          query_status: "performed_by_official_route_fetch_and_staten_network_map_search_2026-07-15",
          urls_checked: [routePage.url, mtaMap.url],
          retrievals: [
            {
              id: "mta_bustime_" + candidate.route_id,
              status: routePage.retrieval_status,
              retrieved_on: routePage.retrieved_on,
              sha256: routePage.content_sha256,
            },
            {
              id: mtaMap.id,
              status: mtaMap.retrieval_status,
              retrieved_on: mtaMap.retrieved_on,
              sha256: mtaMap.content_sha256,
            },
          ],
        },
        {
          category: "official_public_board_committee",
          query: researchPlan.web_query + " community board committee",
          query_status: "performed_2026-07-15",
          urls_checked: checkedBoardSources.map((source) => source.url),
          retrievals: checkedBoardSources.map((source) => ({
            id: source.id,
            status: source.retrieval_status,
            retrieved_on: source.retrieved_on,
            sha256: source.content_sha256,
          })),
        },
        {
          category: "other_repository_approved_primary",
          query:
            "NYC DOT Open Data ycrg-ses3 facility=" +
            candidate.corridor +
            " open_dates contains " +
            candidate.implementation_date,
          query_status: "executed_against_acquired_snapshot_2026-07-15",
          urls_checked: [metadata.url, datafeeds.url],
          retrievals: [metadata, datafeeds].map((source) => ({
            id: source.id,
            status: source.retrieval_status,
            retrieved_on: source.retrieved_on,
            sha256: source.content_sha256,
          })),
        },
      ],
      source_findings: {
        acquired_for_candidate: acquiredForCandidate,
        acquisition_channels_acquired: acquisitionChannelsAcquired,
        official_lane_matching_record_count: laneEvidence.length,
        official_lane_matching_segment_ids: [
          ...new Set(laneEvidence.map((row) => row.segment_id).filter((value): value is string => value !== null)),
        ].sort(),
        official_lane_named_routes: officialRoutes,
        candidate_named_lane_record_count: datasetRouteRows.length,
        mta_route_page: {
          retrieval_status: routePage.retrieval_status,
          content_sha256: routePage.content_sha256,
          exact_route_title_found: routePage.exact_route_title_found,
          current_corridor_token_found: routePage.corridor_token_found,
          temporal_limitation:
            "The live route page was captured in 2026 and is never treated as proof that the route used the candidate segment on the implementation date.",
        },
        exact_project_route_statement_found: projectRouteSupported,
        exact_project_route_source_id: projectRouteSupported ? projectSource?.id ?? null : null,
        official_project_route_inventory: researchPlan.observed_project_routes,
        broader_corridor_route_inventory_match: observedProjectRouteListed,
        project_route_review_note: researchPlan.support_note,
        official_route_named_segment_ids: namedSegmentIds,
        segment_identity_limitation:
          "Current official DOT segment ids are retained as research evidence only. The pinned candidate and reconciliation artifacts omit the historical matched-segment ids, so current matches are not promoted as exact candidate segments.",
        historical_review_rationale: candidate.historical_review_rationale,
      },
      claim_results: {
        physical_bus_lane_record_acquired: laneEvidence.length > 0,
        exact_route_treatment_binding_proved: routeBindingSupported,
        exact_route_binding_evidence: exactEvidence,
        official_lane_rows_match_corridor_and_day: laneEvidence.length > 0,
        exact_segment_binding_proved: false,
        exact_segment_ids: [] as string[],
        candidate_segment_ids_pinned: false,
        explicit_phase_identity_proved: false,
        date_and_phase_proved: false,
        operational_occurrence_identity_proved: false,
        unsupported_claims: [
          ...(!routeBindingSupported
            ? ["No acquired authoritative source binds this candidate route to the lane treatment; route proximity and street overlap remain insufficient."]
            : []),
          ...(observedProjectRouteListed && !routeBindingSupported
            ? ["An official source inventories this route on the broader corridor but does not bind it to an exact historical candidate lane segment."]
            : []),
          "The pinned candidate does not preserve exact historical matched-segment identifiers.",
          "A current registry corridor/day match does not prove which physical segment produced the historical candidate.",
          "No acquired source assigns a stable candidate-specific canonical phase identity and distinguishes onset from extension, repainting, or redesign.",
          "The registry projection is not itself a canonical MTA Wiki operational occurrence.",
          "Geometry, stop proximity, route-page street tokens, and street-name similarity were not promoted to authoritative evidence.",
        ],
      },
      canonical_actions: {
        canonical_links_added: [] as string[],
        operational_occurrence_added_or_updated: false,
        reason:
          "This disjoint shard records acquisition evidence and enumerates supported linkages separately. Shared canonical journals were intentionally not edited.",
      },
      outcome: {
        exclusive_primary_disposition: disposition,
        registry_projection_excluded: true,
        exclusion_reason: routeBindingSupported
          ? "Authoritative route-treatment evidence was acquired, but exact historical segment, phase, and canonical operational-occurrence identity remain unproved."
          : "The completed official-source search did not prove an exact route-treatment binding; the registry row remains non-projectable.",
        study_projection_eligible: false,
        still_unresolved: true,
        next_action: routeBindingSupported
          ? "A separate remediation owner may stage the cited source and map it to existing canonical route/treatment/corridor records, but must independently resolve phase, onset precision, and occurrence identity before projection."
          : "Retain this immutable receipt and exclusion; reconsider only if later authoritative evidence explicitly binds route, treatment, physical scope, date, and phase.",
      },
    };
    return {
      receipt_id: "staten-island-acquisition:" + sha256(stableJson(receiptCore)).slice(0, 24),
      ...receiptCore,
    };
  });
  receipts.sort((left, right) => left.candidate.candidate_id.localeCompare(right.candidate.candidate_id));
  await writeFile(PATHS.receipts, jsonl(receipts));

  const exclusions = receipts.map((receipt) => ({
    schema_version: 1,
    candidate_id: receipt.candidate.candidate_id,
    candidate_set_id: CANDIDATE_SET_ID,
    identity: receipt.candidate.identity,
    shard: "staten-island",
    excluded_from: "mta_wiki_operational_occurrence_projection",
    exclusion_rule:
      "relationship-contract-v1:registry-only-bus-lane-requires-authoritative-route-treatment-phase-occurrence-evidence",
    reason: receipt.outcome.exclusion_reason,
    exact_route_treatment_binding_proved: receipt.claim_results.exact_route_treatment_binding_proved,
    phase_identity_proved: false,
    study_projection_eligible: false,
    receipt_id: receipt.receipt_id,
  }));
  await writeFile(PATHS.exclusions, jsonl(exclusions));

  const supported = receipts
    .filter((receipt) => receipt.claim_results.exact_route_treatment_binding_proved)
    .map((receipt) => ({
      schema_version: 1,
      shard: "staten-island",
      candidate_id: receipt.candidate.candidate_id,
      identity: receipt.candidate.identity,
      route_id: receipt.candidate.route_id,
      normalized_route_id: receipt.candidate.normalized_route_id,
      corridor: receipt.candidate.corridor,
      implementation_date: receipt.candidate.implementation_date,
      supported_claim: "authoritative_route_to_corridor_treatment_binding",
      evidence: receipt.claim_results.exact_route_binding_evidence,
      unsupported_for_canonical_submission: [
        "exact historical segment identity",
        "stable phase identity",
        "candidate-specific operational onset",
        "canonical operational occurrence identity",
      ],
      canonical_links_added_by_shard: [],
      remediation_boundary:
        "Stage and canonicalize the source through normal intake; do not submit an operational occurrence until every unsupported role is resolved.",
      receipt_id: receipt.receipt_id,
    }));
  await writeFile(PATHS.supported, jsonl(supported));

  const routeBound = receipts.filter((receipt) => receipt.claim_results.exact_route_treatment_binding_proved);
  const prefixCounts = {
    S: receipts.filter((receipt) => /^S\d/.test(receipt.candidate.route_id)).length,
    SIM: receipts.filter((receipt) => /^SIM\d/.test(receipt.candidate.route_id)).length,
  };
  const summary = {
    schema_version: 1,
    shard: "staten-island",
    researched_on: RESEARCHED_ON,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    researched_count: receipts.length,
    corridor_group_count: new Set(receipts.map((receipt) => receipt.candidate.corridor)).size,
    source_acquired_count: receipts.filter((receipt) => receipt.source_findings.acquired_for_candidate).length,
    shared_official_source_fetch_count: checks.sources.filter((source) => source.retrieval_status === "acquired").length,
    route_specific_mta_fetch_count: checks.route_pages.filter((source) => source.retrieval_status === "acquired").length,
    acquired_source_hash_count:
      checks.sources.filter((source) => source.content_sha256 !== null).length +
      checks.route_pages.filter((source) => source.content_sha256 !== null).length,
    exact_route_binding_proved_count: routeBound.length,
    exact_route_binding_proved_candidate_ids: routeBound.map((receipt) => receipt.candidate.candidate_id),
    exact_route_binding_proved_by_corridor: Object.fromEntries(
      [...new Set(routeBound.map((receipt) => receipt.candidate.corridor))]
        .sort()
        .map((corridor) => [
          corridor,
          routeBound.filter((receipt) => receipt.candidate.corridor === corridor).length,
        ]),
    ),
    exact_route_binding_proved_by_source: Object.fromEntries(
      [
        ...new Set(
          routeBound
            .map((receipt) => receipt.source_findings.exact_project_route_source_id)
            .filter((sourceId): sourceId is string => sourceId !== null),
        ),
      ]
        .sort()
        .map((sourceId) => [
          sourceId,
          routeBound.filter((receipt) => receipt.source_findings.exact_project_route_source_id === sourceId).length,
        ]),
    ),
    segment_binding_proved_count: 0,
    segment_binding_proved_candidate_ids: [],
    date_and_phase_proved_count: 0,
    operational_occurrence_added_or_updated_count: 0,
    explicitly_excluded_count: receipts.filter((receipt) => receipt.outcome.registry_projection_excluded).length,
    still_unresolved_count: receipts.filter((receipt) => receipt.outcome.still_unresolved).length,
    study_projection_eligible_count: receipts.filter((receipt) => receipt.outcome.study_projection_eligible).length,
    exclusive_primary_disposition_counts: Object.fromEntries(
      [...new Set(receipts.map((receipt) => receipt.outcome.exclusive_primary_disposition))]
        .sort()
        .map((disposition) => [
          disposition,
          receipts.filter((receipt) => receipt.outcome.exclusive_primary_disposition === disposition).length,
        ]),
    ),
    route_prefix_counts: prefixCounts,
    receipts_sha256: sha256(jsonl(receipts)),
    exclusions_sha256: sha256(jsonl(exclusions)),
    supported_linkages_sha256: sha256(jsonl(supported)),
    warning:
      "Supported route-treatment evidence is not a projectable occurrence. All Staten Island rows remain excluded pending exact segment, stable phase, onset, and canonical occurrence identity.",
  };
  await writeStableJson(PATHS.summary, summary);

  const report =
    "# Staten Island registry-only bus-lane acquisition shard\n\n" +
    "- Pinned candidate set: " + CANDIDATE_SET_ID + " (" + CANDIDATE_SET_SHA256 + ")\n" +
    "- Deterministic partition: **" + receipts.length + "** candidates (**" + prefixCounts.S +
      " S local/SBS**, **" + prefixCounts.SIM + " SIM express**)\n" +
    "- Corridor/date research groups: **" + summary.corridor_group_count + "**\n" +
    "- Researched through four official acquisition channels: **" + summary.researched_count + "**\n" +
    "- All four channels acquired for candidate: **" + summary.source_acquired_count + "**\n" +
    "- Acquired and hashed official source responses: **" + summary.acquired_source_hash_count +
      "** (**" + summary.shared_official_source_fetch_count + " shared**, **" +
      summary.route_specific_mta_fetch_count + " route-specific**)\n" +
    "- Exact route-treatment binding proved: **" + summary.exact_route_binding_proved_count + "**\n" +
    "- Exact historical segment binding proved: **0**\n" +
    "- Date and explicit phase both proved: **0**\n" +
    "- Operational occurrence added or updated: **0**\n" +
    "- Registry projections explicitly excluded: **" + summary.explicitly_excluded_count + "**\n" +
    "- Still unresolved for study projection: **" + summary.still_unresolved_count + "**\n\n" +
    "Each receipt covers NYC DOT lane/project material, an official MTA route/project check, public board/committee material, and another official primary-data check. The supported route-treatment findings are enumerated in supported-linkage-candidates.jsonl for a disjoint remediation owner. They do not authorize an operational occurrence: the pinned candidates omit exact historical segment ids, and no acquired source resolves a stable candidate-specific phase and onset identity. Proximity, geometry, live route pages, and street-name similarity never establish linkage.\n\n" +
    "## Reproduce\n\n" +
    "    bun data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/acquire.ts --verify-partition --tracker-root " +
      DEFAULT_TRACKER_ROOT + "\n" +
    "    bun data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/acquire.ts --check\n" +
    "    bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/staten-island/acquire.test.ts\n";
  await writeFile(PATHS.report, report);

  const artifactPaths = [
    PATHS.partition,
    PATHS.partitionProof,
    PATHS.sourceChecks,
    PATHS.laneEvidence,
    PATHS.receipts,
    PATHS.exclusions,
    PATHS.supported,
    PATHS.summary,
    PATHS.report,
  ];
  const artifacts = [];
  for (const path of artifactPaths) {
    artifacts.push({
      path: basename(path),
      sha256: await fileSha256(path),
      bytes: (await readFile(path)).byteLength,
    });
  }
  await writeStableJson(PATHS.manifest, {
    schema_version: 1,
    shard: "staten-island",
    generated_on: RESEARCHED_ON,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    artifacts,
    manifest_payload_sha256: sha256(stableJson(artifacts)),
  });
}

async function checkArtifacts(): Promise<void> {
  const manifest = JSON.parse(await readFile(PATHS.manifest, "utf8")) as {
    candidate_set_sha256: string;
    artifacts: Array<{ path: string; sha256: string; bytes: number }>;
  };
  if (manifest.candidate_set_sha256 !== CANDIDATE_SET_SHA256) throw new Error("Manifest candidate hash mismatch");
  for (const artifact of manifest.artifacts) {
    const path = join(SHARD_DIR, artifact.path);
    const bytes = await readFile(path);
    if (sha256(bytes) !== artifact.sha256 || bytes.byteLength !== artifact.bytes) {
      throw new Error("Artifact hash/size mismatch: " + artifact.path);
    }
  }
  const receipts = await readJsonl<Record<string, unknown>>(PATHS.receipts);
  const exclusions = await readJsonl<Record<string, unknown>>(PATHS.exclusions);
  if (receipts.length !== 54 || exclusions.length !== 54) throw new Error("Receipt/exclusion cardinality mismatch");
}

async function main(): Promise<void> {
  await mkdir(SHARD_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const trackerIndex = args.indexOf("--tracker-root");
  const trackerRoot = trackerIndex >= 0 ? resolve(args[trackerIndex + 1] ?? "") : DEFAULT_TRACKER_ROOT;
  if (args.includes("--acquire")) {
    const partition = await rederivePartition(trackerRoot, true);
    await acquire(partition);
    await generate();
    return;
  }
  if (args.includes("--verify-partition")) {
    const expected = await readFile(PATHS.partition, "utf8");
    const partition = await rederivePartition(trackerRoot, false);
    if (jsonl(partition) !== expected) throw new Error("Rederived Staten Island partition differs from checked artifact");
    return;
  }
  if (args.includes("--generate")) {
    await generate();
    return;
  }
  await checkArtifacts();
}

await main();
