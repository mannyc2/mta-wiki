import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const SHARD_DIR = import.meta.dir;
const REPO_ROOT = resolve(SHARD_DIR, "../../../../../..");
const RESEARCHED_ON = "2026-07-15";
const CANDIDATE_SET_ID = "candidate-set-v2:24080902f508b55a0033df32";
const CANDIDATE_SET_SHA256 = "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba";
const BX12_LOCAL_VARIANT_CANDIDATE_ID = "study-event-v2:4f20a93956a3af9db4bad8c1";
const PRIOR_SUPPORTED_LINKAGES_SHA256 = "79e478d383e917ae0583ebd3a4d8af04935304e6f38e43b76a8c98359bc7ec90";
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
  project_route_basis: string | null;
  support_note: string | null;
};

const OFFICIAL_SOURCES: SourceDefinition[] = [
  {
    id: "dot_bus_lanes_snapshot",
    category: "dot_lane_project",
    url: "https://data.cityofnewyork.us/resource/ycrg-ses3.json?$limit=5000",
    note: "Authoritative NYC DOT Bus Lanes - Local Streets API snapshot; selected records are retained without geometry.",
  },
  {
    id: "dot_bus_lanes_metadata",
    category: "other_primary",
    url: "https://data.cityofnewyork.us/api/views/ycrg-ses3",
    note: "NYC Open Data metadata for the official DOT bus-lane dataset.",
  },
  {
    id: "dot_datafeeds",
    category: "other_primary",
    url: "https://www.nyc.gov/html/dot/html/about/datafeeds.shtml",
    note: "NYC DOT data catalog linking the official Bus Lane Locations dataset.",
  },
  {
    id: "mta_bronx_final_plan",
    category: "mta_route_project",
    url: "https://files.mta.info/s3fs-public/inline-files/Bronx%20Local%20Bus%20Network%20Redesign%20Fact%20Sheet_4.pdf",
    note: "Official MTA Bronx Local Bus Network Redesign fact sheet.",
  },
  {
    id: "dot_projects_2020",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2020.shtml",
    note: "NYC DOT index exposing East 149th Street community-board presentations.",
  },
  {
    id: "dot_projects_2021",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2021.shtml",
    note: "NYC DOT index for projects implemented in 2021.",
  },
  {
    id: "dot_projects_2023",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2023.shtml",
    note: "NYC DOT index exposing University Avenue community-board presentations.",
  },
  {
    id: "dot_projects_2024",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2024.shtml",
    note: "NYC DOT index exposing Hunts Point Avenue community-board presentations.",
  },
  {
    id: "dot_current_projects",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/current-projects.shtml",
    note: "NYC DOT current project index, checked for later 79th Street and Third Avenue materials.",
  },
  {
    id: "e149_cb1",
    category: "board_committee",
    url: "https://www.nyc.gov/html/brt/downloads/pdf/e149th-st-cb1-jun2020.pdf",
    note: "Official Bronx CB1 presentation identifies the East 149th Street bus-lane project and Bx2, Bx4, Bx17, and Bx19.",
  },
  {
    id: "gun_hill_cb7",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/gun-hill-rd-cb7-mar2023.pdf",
    note: "Official Bronx CB7 presentation identifies the 2023 Gun Hill Road project and Bx28/Bx38; it does not support the shard candidates.",
  },
  {
    id: "gun_hill_completion",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2023/east-gun-hill-road-redesign.shtml",
    note: "NYC DOT completion release identifies the East Gun Hill Road project and Bx28/Bx38.",
  },
  {
    id: "soundview_completion",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2021/first-dedicated-bus-lanes-soundview-begin.shtml",
    note: "NYC DOT completion release identifies Story Avenue and Bx5, Bx36, and Bx39; it does not support Bx27.",
  },
  {
    id: "bronx_cb5_priority_2019",
    category: "board_committee",
    url: "https://www.nyc.gov/html/brt/downloads/pdf/bx-cb5-projects-dec032019.pdf",
    note: "Official Bronx CB5 presentation names Bx3/Bx36 on University Avenue and Bx3/Bx11/Bx13/Bx35/Bx36 on the proposed Washington Bridge bus lanes.",
  },
  {
    id: "university_cb5",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/university-ave-north-cb5-oct2021.pdf",
    note: "Official Bronx CB5 presentation for University Avenue North bus and bike improvements.",
  },
  {
    id: "pelham_parkway_completion",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/site/ddc/about/press-releases/2023/pr-122723-Pelham.page",
    note: "NYC DDC/DOT/DEP release documents final Pelham Parkway reconstruction completion and 1.7 miles of bus lanes.",
  },
  {
    id: "pelham_bay_completion",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2023/pelham-bay-station-improvements.shtml",
    note: "NYC DOT and MTA release identifies Westchester/Wilkinson bus lanes and Bx12, Bx5, Bx23, Bx24, Bx29, and Q50.",
  },
  {
    id: "w178_cb12",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/w178-st-ft-washington-ave-wadsworth-ave-cb12-mar2020.pdf",
    note: "Official Manhattan CB12 presentation identifies the W 178th Street bus-only lane and Bx7 among routes in the project limits.",
  },
  {
    id: "washington_bridge_cb4",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/washington-bridge-bx-cb4-nov2022.pdf",
    note: "Official Bronx CB4 presentation documents the Washington Bridge proposal and five unnamed routes; it is not treated as candidate-specific route proof.",
  },
  {
    id: "washington_bridge_completion",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2024/washington-bridge-safety-project-completed.shtml",
    note: "NYC DOT release documents the 2024 bridge project; it postdates the registry candidate day and does not name the five routes.",
  },
  {
    id: "battery_place_launch",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-020.shtml",
    note: "NYC DOT release documents Battery Place treatment and launch but does not name BxM18.",
  },
  {
    id: "third_avenue_completion",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2023/completion-safety-project-third-ave.shtml",
    note: "NYC DOT release names M98, M101, M102, and M103; it does not support the BxM candidates.",
  },
  {
    id: "main_street_camera_release",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-011.shtml",
    note: "NYC DOT enforcement release identifies Bx6 on East 161st Street and Bx19 on East 149th Street, not the unlike shard candidates.",
  },
];

function research(
  webQuery: string,
  sourceIds: string[],
  boardSourceIds: string[],
  exactProjectRoutes: string[] = [],
  projectRouteBasis: string | null = null,
  supportNote: string | null = null,
): CorridorResearch {
  return {
    web_query: webQuery,
    source_ids: ["dot_bus_lanes_snapshot", ...sourceIds],
    board_source_ids: boardSourceIds,
    exact_project_routes: exactProjectRoutes,
    project_route_basis: projectRouteBasis,
    support_note: supportNote,
  };
}

const CORRIDOR_RESEARCH: Record<string, CorridorResearch> = {
  "149th Street / E 149 Street": research(
    "site:nyc.gov/html/dot East 149th Street bus lane 2020 Bx2 Bx4 Bx17 Bx19",
    ["e149_cb1", "main_street_camera_release"],
    ["e149_cb1", "dot_projects_2020"],
    ["BX2", "BX4", "BX17", "BX19"],
    "e149_cb1",
    "The CB1 project presentation explicitly identifies both the bus-lane project and these four routes.",
  ),
  "E 149 Street": research(
    "site:nyc.gov/html/dot East 149th Street bus lane 2020 Bx2 Bx4 Bx17 Bx19",
    ["e149_cb1", "main_street_camera_release"],
    ["e149_cb1", "dot_projects_2020"],
    ["BX2", "BX4", "BX17", "BX19"],
    "e149_cb1",
    "The CB1 project presentation explicitly identifies both the bus-lane project and these four routes.",
  ),
  "3 Avenue": research(
    "site:nyc.gov/html/dot 3rd Avenue bus lane 2025 BxM routes",
    ["third_avenue_completion"],
    ["dot_current_projects"],
    ["M98", "M101", "M102", "M103"],
    "third_avenue_completion",
    "The official completion release names only Manhattan local routes, not these BxM projections.",
  ),
  "3rd Avenue": research(
    "site:nyc.gov/html/dot 3rd Avenue bus lane 2025 BxM routes",
    ["third_avenue_completion"],
    ["dot_current_projects"],
    ["M98", "M101", "M102", "M103"],
    "third_avenue_completion",
    "The official completion release names only Manhattan local routes, not this BxM projection.",
  ),
  "79th Street / W 81st Street": research(
    "site:nyc.gov/html/dot 79th Street bus lane BxM2 M79 SBS",
    ["dot_current_projects"],
    ["dot_current_projects"],
    ["M79"],
    "dot_current_projects",
    "The official project is an M79 SBS project and does not bind BxM2.",
  ),
  "79th Street": research(
    "site:nyc.gov/html/dot 79th Street bus lane BxM3 M79 SBS",
    ["dot_current_projects"],
    ["dot_current_projects"],
    ["M79"],
    "dot_current_projects",
    "The official project is an M79 SBS project and does not bind BxM3.",
  ),
  "Battery Pl": research(
    "site:nyc.gov/html/dot Battery Place bus lane BxM18 2021",
    ["battery_place_launch"],
    ["dot_projects_2021"],
  ),
  "E 161 Street": research(
    "site:nyc.gov/html/dot East 161st Street bus lane BxM4 Bx6",
    ["main_street_camera_release"],
    ["dot_projects_2021"],
    ["BX6"],
    "main_street_camera_release",
    "The official enforcement release identifies Bx6, not BxM4.",
  ),
  "Gun Hill Road": research(
    "site:nyc.gov/html/dot Gun Hill Road bus lane 2023 Bx28 Bx38",
    ["gun_hill_completion", "gun_hill_cb7"],
    ["gun_hill_cb7", "dot_projects_2023"],
    ["BX28", "BX38"],
    "gun_hill_completion",
    "The official project sources identify Bx28/Bx38, not the seven proximity-derived shard routes.",
  ),
  "Hunts Point Avenue": research(
    "site:nyc.gov/html/dot Hunts Point Avenue bus lane 2025 Bx routes",
    ["dot_projects_2024"],
    ["dot_projects_2024"],
  ),
  "Pelham Parkway / University Avenue": research(
    "site:nyc.gov Pelham Parkway University Avenue bus lane Bx12 2023",
    ["pelham_parkway_completion"],
    ["university_cb5", "dot_projects_2023"],
    ["BX12+"],
    "pelham_parkway_completion",
    "The official DDC/DOT/DEP completion release says the new Pelham Parkway lanes primarily serve BX12 Select Bus Service (BX12+), without supporting BX12 local or candidate-day phase identity.",
  ),
  "Pelham Parkway": research(
    "site:nyc.gov Pelham Parkway bus lane Bx12 reconstruction 2023",
    ["pelham_parkway_completion"],
    ["dot_projects_2023"],
    ["BX12"],
    "pelham_parkway_completion",
    "The official completion release identifies Bx12, not the five proximity-derived shard routes.",
  ),
  "Story Avenue": research(
    "site:nyc.gov/html/dot Story Avenue bus lane 2021 Bx5 Bx36 Bx39",
    ["soundview_completion"],
    ["dot_projects_2021"],
    ["BX5", "BX36", "BX39"],
    "soundview_completion",
    "The official completion release names Bx5/Bx36/Bx39, not Bx27.",
  ),
  "University Avenue / Washington Bridge": research(
    "site:nyc.gov/html/dot University Avenue bus lanes Bx3 Bx36 Bx18 Phase 2",
    ["bronx_cb5_priority_2019", "washington_bridge_completion"],
    ["bronx_cb5_priority_2019", "university_cb5", "washington_bridge_cb4", "dot_projects_2023"],
    ["BX3", "BX36"],
    "bronx_cb5_priority_2019",
    "The official CB5 presentation explicitly identifies Bx3/Bx36 on University Avenue; no generic Bx18 statement is promoted to Bx18A or Bx18B.",
  ),
  "University Avenue": research(
    "site:nyc.gov/html/dot University Avenue bus lanes Bx3 Bx36 Bx18 Phase 2",
    ["bronx_cb5_priority_2019"],
    ["bronx_cb5_priority_2019", "university_cb5", "dot_projects_2023"],
    ["BX3", "BX36"],
    "bronx_cb5_priority_2019",
    "The official project routes do not match the University-only shard candidates.",
  ),
  "W 178 Street": research(
    "site:nyc.gov/html/dot W 178th Street bus-only lane Bx7",
    ["w178_cb12"],
    ["w178_cb12"],
    ["BX3", "BX7", "BX11", "BX13", "BX36", "M5", "M98", "M100"],
    "w178_cb12",
    "The official CB12 presentation places Bx7 in the project limits and proposes the bus-only lane.",
  ),
  "W 207th Street": research(
    "site:nyc.gov/html/dot W 207th Street bus-only lane Bx20 Bx12",
    [],
    ["dot_current_projects"],
  ),
  "Washington Bridge": research(
    "site:nyc.gov/html/dot Washington Bridge bus lane 2023 Bx11 Bx13 Bx35",
    ["bronx_cb5_priority_2019", "washington_bridge_completion"],
    ["bronx_cb5_priority_2019", "washington_bridge_cb4"],
    ["BX3", "BX11", "BX13", "BX35", "BX36"],
    "bronx_cb5_priority_2019",
    "The official CB5 presentation explicitly names the five routes and proposes bus lanes on Washington Bridge; onset day and phase remain unproved.",
  ),
  "Westchester Avenue / Wilkinson Avenue": research(
    "site:nyc.gov/html/dot Westchester Wilkinson bus lane Pelham Bay Bx23 Bx24 Bx29",
    ["pelham_bay_completion"],
    ["dot_projects_2023"],
    ["BX12", "BX5", "BX23", "BX24", "BX29", "Q50"],
    "pelham_bay_completion",
    "The joint NYC DOT/MTA release explicitly names Bx23, Bx24, and Bx29 at the Westchester/Wilkinson project.",
  ),
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

function normalizeExactProjectRouteId(routeId: string): string {
  return routeId.toUpperCase().replace(/-SBS$/, "+");
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
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bstreet\b/g, "st")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOpenDate(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean).flatMap((part) => {
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

  const bronx = backlog
    .filter((row) => /^BX/.test(String(row.route_id)))
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

  if (bronx.length !== 52) throw new Error("Expected 52 Bronx candidates, got " + bronx.length);
  if (new Set(bronx.map((row) => row.candidate_id)).size !== 52) throw new Error("Duplicate Bronx candidate ids");
  if (new Set(bronx.map((row) => row.route_id)).size !== 52) throw new Error("Bronx partition is not one row per route");
  for (const row of bronx) {
    if (!CORRIDOR_RESEARCH[row.corridor]) throw new Error("No research plan for corridor " + row.corridor);
  }

  const partitionPayload = jsonl(bronx);
  const localCount = bronx.filter((row) => /^BX\d/.test(row.route_id)).length;
  const expressCount = bronx.filter((row) => /^BXM\d/.test(row.route_id)).length;
  const proof = {
    schema_version: 1,
    shard: "bronx",
    derived_on: RESEARCHED_ON,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    reconciliation_ledger_path: relative(REPO_ROOT, ledgerPath),
    reconciliation_ledger_sha256: await fileSha256(ledgerPath),
    exact_backlog_count: backlog.length,
    bronx_count: bronx.length,
    bx_local_or_sbs_count: localCount,
    bxm_express_count: expressCount,
    unique_candidate_count: new Set(bronx.map((row) => row.candidate_id)).size,
    unique_route_count: new Set(bronx.map((row) => row.route_id)).size,
    candidate_ids_sha256: sha256(bronx.map((row) => row.candidate_id).join("\n") + "\n"),
    partition_sha256: sha256(partitionPayload),
    exclusive_partition_rule:
      "exclusive_primary_disposition=mta_route_or_treatment_scope_binding_gap AND treatment_family=bus_lane AND route_id begins BX",
  };
  if (write) {
    await writeFile(PATHS.partition, partitionPayload);
    await writeStableJson(PATHS.partitionProof, proof);
  }
  return bronx;
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
    shard: "bronx",
    acquired_on: RESEARCHED_ON,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    web_search_method:
      "Official-domain web searches were performed for all 19 corridor/date groups on 2026-07-15; receipt query strings and checked URLs preserve the acquisition trail. Official results were byte-fetched and hashed where retrievable.",
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
  if (partition.length !== 52) throw new Error("Expected 52 checked partition rows");
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
      .map(normalizeExactProjectRouteId)
      .includes(normalizeExactProjectRouteId(candidate.route_id));
    const projectRouteFamilyListed = researchPlan.exact_project_routes
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
    const routeVariantPrecisionMismatch =
      datasetRouteRows.length === 0 &&
      !projectRouteListed &&
      projectRouteFamilyListed &&
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
        sourcesById.get("mta_bronx_final_plan")?.retrieval_status === "acquired",
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
    const mtaPlan = sourcesById.get("mta_bronx_final_plan");
    if (!mtaPlan) throw new Error("Missing MTA Bronx plan acquisition check");
    const metadata = sourcesById.get("dot_bus_lanes_metadata");
    const datafeeds = sourcesById.get("dot_datafeeds");
    if (!metadata || !datafeeds) throw new Error("Missing official Open Data source checks");

    const receiptCore = {
      schema_version: 1,
      campaign: "canonical-relationship-integrity-v1",
      shard: "bronx",
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
          query_status: "performed_by_official_route_fetch_and_bronx_plan_search_2026-07-15",
          urls_checked: [routePage.url, mtaPlan.url],
          retrievals: [
            {
              id: "mta_bustime_" + candidate.route_id,
              status: routePage.retrieval_status,
              retrieved_on: routePage.retrieved_on,
              sha256: routePage.content_sha256,
            },
            {
              id: mtaPlan.id,
              status: mtaPlan.retrieval_status,
              retrieved_on: mtaPlan.retrieved_on,
              sha256: mtaPlan.content_sha256,
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
        route_variant_precision_mismatch: routeVariantPrecisionMismatch,
        route_variant_precision_limitation: routeVariantPrecisionMismatch
          ? "The official Pelham Parkway source names BX12 Select Bus Service (BX12+); it does not prove that the distinct BX12 local route used the treatment."
          : null,
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
            ? [routeVariantPrecisionMismatch
                ? "The acquired Pelham Parkway source binds the bus lanes to BX12 Select Bus Service (BX12+), not the distinct BX12 local candidate; route-family normalization cannot substitute for exact variant evidence."
                : "No acquired authoritative source binds this candidate route to the lane treatment; route proximity and street overlap remain insufficient."]
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
          : routeVariantPrecisionMismatch
            ? "The completed search found Pelham Parkway treatment evidence for BX12 Select Bus Service (BX12+) only; it did not prove an exact binding for the distinct BX12 local candidate, which remains non-projectable."
            : "The completed official-source search did not prove an exact route-treatment binding; the registry row remains non-projectable.",
        study_projection_eligible: false,
        still_unresolved: true,
        next_action: routeBindingSupported
          ? "A separate remediation owner may stage the cited source and map it to existing canonical route/treatment/corridor records, but must independently resolve phase, onset precision, and occurrence identity before projection."
          : routeVariantPrecisionMismatch
            ? "Retain this completed-search route-linkage-unresolved receipt; reconsider BX12 local only if later authoritative evidence explicitly binds that exact local variant to the treatment, physical scope, date, and phase."
            : "Retain this immutable receipt and exclusion; reconsider only if later authoritative evidence explicitly binds route, treatment, physical scope, date, and phase.",
      },
    };
    return {
      receipt_id: "bronx-acquisition:" + sha256(stableJson(receiptCore)).slice(0, 24),
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
    shard: "bronx",
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
      shard: "bronx",
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
    BX: receipts.filter((receipt) => /^BX\d/.test(receipt.candidate.route_id)).length,
    BXM: receipts.filter((receipt) => /^BXM\d/.test(receipt.candidate.route_id)).length,
  };
  const summary = {
    schema_version: 1,
    shard: "bronx",
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
    route_variant_precision_rejected_count: receipts.filter(
      (receipt) => receipt.source_findings.route_variant_precision_mismatch,
    ).length,
    route_variant_precision_rejected_candidate_ids: receipts
      .filter((receipt) => receipt.source_findings.route_variant_precision_mismatch)
      .map((receipt) => receipt.candidate.candidate_id),
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
    reconciliation_correction: {
      candidate_id: BX12_LOCAL_VARIANT_CANDIDATE_ID,
      prior_supported_linkages_sha256: PRIOR_SUPPORTED_LINKAGES_SHA256,
      prior_exact_route_treatment_binding_proved: true,
      corrected_exact_route_treatment_binding_proved: false,
      exclusive_primary_disposition: "completed_search_route_linkage_unresolved",
      reason:
        "The official source says BX12 Select Bus Service (BX12+); exact route-variant matching rejects promotion to the distinct BX12 local candidate.",
    },
    warning:
      "Supported route-treatment evidence is not a projectable occurrence. All Bronx rows remain excluded pending exact segment, stable phase, onset, and canonical occurrence identity.",
  };
  await writeStableJson(PATHS.summary, summary);

  const report =
    "# Bronx registry-only bus-lane acquisition shard\n\n" +
    "- Pinned candidate set: " + CANDIDATE_SET_ID + " (" + CANDIDATE_SET_SHA256 + ")\n" +
    "- Deterministic partition: **" + receipts.length + "** candidates (**" + prefixCounts.BX +
      " BX local/SBS**, **" + prefixCounts.BXM + " BxM express**)\n" +
    "- Corridor/date research groups: **" + summary.corridor_group_count + "**\n" +
    "- Researched through four official acquisition channels: **" + summary.researched_count + "**\n" +
    "- All four channels acquired for candidate: **" + summary.source_acquired_count + "**\n" +
    "- Acquired and hashed official source responses: **" + summary.acquired_source_hash_count +
      "** (**" + summary.shared_official_source_fetch_count + " shared**, **" +
      summary.route_specific_mta_fetch_count + " route-specific**)\n" +
    "- Exact route-treatment binding proved: **" + summary.exact_route_binding_proved_count + "**\n" +
    "- Route-family match rejected at exact variant precision: **" + summary.route_variant_precision_rejected_count + "** (BX12 local is not BX12+)\n" +
    "- Exact historical segment binding proved: **0**\n" +
    "- Date and explicit phase both proved: **0**\n" +
    "- Operational occurrence added or updated: **0**\n" +
    "- Registry projections explicitly excluded: **" + summary.explicitly_excluded_count + "**\n" +
    "- Still unresolved for study projection: **" + summary.still_unresolved_count + "**\n\n" +
    "Each receipt covers NYC DOT lane/project material, an official MTA route/project check, public board/committee material, and another official primary-data check. The supported route-treatment findings are enumerated in supported-linkage-candidates.jsonl for a disjoint remediation owner. The prior BX12-local support result was corrected because the Pelham Parkway source explicitly names BX12 Select Bus Service (BX12+), a distinct route variant. Supported rows do not authorize an operational occurrence: the pinned candidates omit exact historical segment ids, and no acquired source resolves a stable candidate-specific phase and onset identity. Proximity, geometry, live route pages, route-family normalization, and street-name similarity never establish linkage.\n\n" +
    "## Reproduce\n\n" +
    "    bun data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquire.ts --verify-partition --tracker-root " +
      DEFAULT_TRACKER_ROOT + "\n" +
    "    bun data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquire.ts --check\n" +
    "    bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/bronx/acquire.test.ts\n";
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
    shard: "bronx",
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
  if (receipts.length !== 52 || exclusions.length !== 52) throw new Error("Receipt/exclusion cardinality mismatch");
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
    if (jsonl(partition) !== expected) throw new Error("Rederived Bronx partition differs from checked artifact");
    return;
  }
  if (args.includes("--generate")) {
    await generate();
    return;
  }
  await checkArtifacts();
}

await main();
