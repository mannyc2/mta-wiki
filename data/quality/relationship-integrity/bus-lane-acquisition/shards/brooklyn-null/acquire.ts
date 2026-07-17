import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const SHARD_DIR = import.meta.dir;
const REPO_ROOT = resolve(SHARD_DIR, "../../../../../..");
const RESEARCHED_ON = "2026-07-15";
const CANDIDATE_SET_ID = "candidate-set-v2:24080902f508b55a0033df32";
const CANDIDATE_SET_SHA256 = "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba";
const DEFAULT_TRACKER_ROOT = "/home/cjpher/.codex/worktrees/61db/bus-reliability-tracker";

const ARTIFACTS = {
  partition: join(SHARD_DIR, "partition.jsonl"),
  partitionProof: join(SHARD_DIR, "partition-proof.json"),
  sourceChecks: join(SHARD_DIR, "acquired-source-checks.json"),
  laneEvidence: join(SHARD_DIR, "official-lane-evidence.jsonl"),
  receipts: join(SHARD_DIR, "receipts.jsonl"),
  exclusions: join(SHARD_DIR, "registry-projection-exclusions.jsonl"),
  summary: join(SHARD_DIR, "summary.json"),
  report: join(SHARD_DIR, "report.md"),
  manifest: join(SHARD_DIR, "manifest.json"),
};

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

type SourceCategory = "dot_lane_project" | "mta_route_project" | "board_committee" | "other_primary";

type SourcePlan = {
  id: string;
  category: SourceCategory;
  url: string;
  note: string;
};

type SourceCheck = SourcePlan & {
  retrieval_status: "acquired" | "not_retrieved";
  retrieved_on: string;
  http_status: number | null;
  media_type: string | null;
  content_sha256: string | null;
  byte_length: number | null;
  raw_content_retained: false;
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

type LaneEvidence = {
  candidate_id: string;
  source_snapshot_sha256: string;
  source_row_sha256: string;
  segment_id: string | null;
  facility: string | null;
  street: string | null;
  boro: string | null;
  open_dates: string | null;
  official_sbs_routes: string[];
  lane_type: string | null;
  lane_description: string | null;
  facility_type: string | null;
  direction: string | null;
  hours: string | null;
  days: string | null;
};

const SOURCES: SourcePlan[] = [
  {
    id: "dot_bus_lanes_snapshot",
    category: "dot_lane_project",
    url: "https://data.cityofnewyork.us/resource/ycrg-ses3.json?$limit=5000",
    note: "Authoritative NYC DOT Bus Lanes - Local Streets API snapshot; selected non-geometry rows are retained separately.",
  },
  {
    id: "dot_bus_lanes_metadata",
    category: "other_primary",
    url: "https://data.cityofnewyork.us/api/views/ycrg-ses3",
    note: "Official NYC Open Data metadata for ycrg-ses3.",
  },
  {
    id: "dot_datafeeds",
    category: "other_primary",
    url: "https://www.nyc.gov/html/dot/html/about/datafeeds.shtml",
    note: "NYC DOT official data catalog.",
  },
  {
    id: "mta_brooklyn_bus_map",
    category: "mta_route_project",
    url: "https://www.mta.info/document/12041",
    note: "Official MTA Brooklyn bus map used only for route geography, never as historical implementation-date proof.",
  },
  {
    id: "dot_busways",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/brt/html/busways/busways.shtml",
    note: "Official NYC DOT busway extents and launch month summaries.",
  },
  {
    id: "dot_projects_2018",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2018.shtml",
    note: "Official 2018 NYC DOT project index checked for the dated Fulton Street projection and linked public-meeting material.",
  },
  {
    id: "dot_projects_2019",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2019.shtml",
    note: "Official project index exposing Church Avenue and Fresh Pond Road board material.",
  },
  {
    id: "dot_projects_2020",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2020.shtml",
    note: "Official project index exposing Jay Street and Malcolm X Boulevard board material.",
  },
  {
    id: "dot_projects_2021",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2021.shtml",
    note: "Official project index exposing Battery Place board material.",
  },
  {
    id: "dot_projects_2023",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2023.shtml",
    note: "Official project index for 2023 bus-priority work.",
  },
  {
    id: "dot_projects_2024",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2024.shtml",
    note: "Official project index exposing Flatbush/Utica/Avenue S board material.",
  },
  {
    id: "dot_projects_2025",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2025.shtml",
    note: "Official project index exposing Flatbush and Livingston Street board material.",
  },
  {
    id: "flatbush_phase1_start",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2025/nyc-dot-better-bus-service-flatbush-ave.shtml",
    note: "Official NYC DOT Flatbush announcement; establishes project and B41 context but not the registry's October 2 onset.",
  },
  {
    id: "flatbush_phase1_retrospective",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/flatbush-ave-bus-priority-mtp-briefing-apr2026.pdf",
    note: "Official retrospective identifies the bounded Livingston-to-State phase and B41/B67 route scope at season precision.",
  },
  {
    id: "flatbush_cb2_2025",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/flatbush-ave-cb2-jun2025.pdf",
    note: "Official Brooklyn CB2 presentation for the Flatbush project.",
  },
  {
    id: "flatbush_utica_cb18_2024",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/flatbush-ave-utica-ave-ave-s-mar2024.pdf",
    note: "Official Brooklyn CB18 intersection presentation; it does not establish route-specific bus-lane onset.",
  },
  {
    id: "b82_kings_highway_cb15_2018",
    category: "board_committee",
    url: "https://www.nyc.gov/html/brt/downloads/pdf/brt-south-brooklyn-b82-mar2018.pdf",
    note: "Official B82 SBS board presentation covering the Kings Highway treatment.",
  },
  {
    id: "church_projects",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2019.shtml",
    note: "Official Church Avenue project description names B35, B103, BM3, and BM4.",
  },
  {
    id: "jay_launch_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-009.shtml",
    note: "Official Jay Street retrospective names seven routes and an August 2020 launch, not an exact launch day.",
  },
  {
    id: "jay_board_2020",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/jay-st-busway-tillary-st-livingston-st-cab-jul2020.pdf",
    note: "Official community-advisory-board presentation for the Jay Street Busway.",
  },
  {
    id: "battery_completion_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-020.shtml",
    note: "Official June 10 completion release for Battery Place; it names Brooklyn and Staten Island express service collectively.",
  },
  {
    id: "better_buses_action_plan_2019",
    category: "mta_route_project",
    url: "https://www.nyc.gov/html/brt/downloads/pdf/better-buses-action-plan-2019.pdf",
    note: "Official NYC DOT action plan; its Battery Place project sheet explicitly lists X27 and X28 among routes served.",
  },
  {
    id: "battery_board_flyer",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/battery-pl-broadway-west-st-whh.pdf",
    note: "Official Battery Place project flyer with physical extent and planned implementation.",
  },
  {
    id: "b46_malcolm_projects",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2020.shtml",
    note: "Official Malcolm X/Utica project description explicitly names B46 Local and SBS.",
  },
  {
    id: "b46_sbs_press",
    category: "mta_route_project",
    url: "https://www.nyc.gov/html/dot/html/pr2016/pr16-089.shtml",
    note: "Official DOT/MTA partnership release identifying the B46 SBS corridor.",
  },
  {
    id: "b44_nostrand_report",
    category: "mta_route_project",
    url: "https://www.nyc.gov/html/brt/downloads/pdf/brt-nostrand-progress-report-june2016.pdf",
    note: "Official joint DOT/NYCT B44 SBS report used to disprove unrelated Nostrand projections.",
  },
  {
    id: "b44_nostrand_rogers_presentation",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/nostrand_rogers_avenues.pdf",
    note: "Official NYC DOT Nostrand/Rogers B44 presentation checked for route and lane scope.",
  },
  {
    id: "b49_cb9_resolution_2023",
    category: "board_committee",
    url: "https://www.nyc.gov/assets/brooklyncb9/downloads/pdf/2024/B49BusResolution.pdf",
    note: "Official Brooklyn Community Board 9 B49 resolution checked as later route-geography context only; it is not historical lane-onset proof.",
  },
  {
    id: "livingston_completion_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2024/nyc-dot-livingston-st-redesign.shtml",
    note: "Official Livingston completion release names B41, B45, B67, and B103, none of the shard's Livingston candidates.",
  },
  {
    id: "third_avenue_start_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2023/3rd-ave-redesign.shtml",
    note: "Official Third Avenue project source; it does not establish the candidate-specific December 2025 express-route phase.",
  },
];

type CorridorResearch = {
  web_query: string;
  source_ids: string[];
  exact_project_routes: string[];
  project_route_basis: string | null;
  project_route_locator?: string;
  project_route_supported_claim?: string;
  canonical_links: Record<string, string[]>;
  exact_completion_milestone_routes?: string[];
};

const COMMON = ["dot_bus_lanes_snapshot"];
const RESEARCH: Record<string, CorridorResearch> = {
  "3rd Avenue": {
    web_query: "site:nyc.gov/html/dot 3rd Avenue bus lane Brooklyn express BM1 X37 December 2025 official",
    source_ids: [...COMMON, "third_avenue_start_press", "dot_projects_2023"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Allen Street/Pike Street": {
    web_query: "site:nyc.gov/html/dot Allen Street Pike Street bus lane B39 February 2024 official",
    source_ids: [...COMMON, "dot_projects_2024"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Battery Pl": {
    web_query: "site:nyc.gov/html/dot Battery Place bus lane X27 X28 June 2021 official",
    source_ids: [...COMMON, "battery_completion_press", "battery_board_flyer", "better_buses_action_plan_2019", "dot_projects_2021", "mta_brooklyn_bus_map"],
    exact_project_routes: ["X27", "X28"], project_route_basis: "better_buses_action_plan_2019", exact_completion_milestone_routes: ["X27", "X28"],
    project_route_locator: "PDF page 28, Battery Place project sheet",
    project_route_supported_claim: "The Battery Place project sheet lists X27 and X28 among the routes served.",
    canonical_links: {
      X27: ["relation_serves-route-project-05-battery-pl-route-meeting-doc-160441-x27_c3374c2ec8"],
      X28: ["relation_serves-route-project-05-battery-pl-route-x28-cb11-jun2025_07a5d5a355"],
    },
  },
  "Bedford Avenue / Rogers Avenue": {
    web_query: "site:nyc.gov/html/dot Bedford Rogers Avenue bus lane B44 B49 official",
    source_ids: [...COMMON, "b44_nostrand_report", "b44_nostrand_rogers_presentation", "b49_cb9_resolution_2023"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Church Avenue": {
    web_query: "site:nyc.gov/html/dot Church Avenue bus lane B35 2019 official community board",
    source_ids: [...COMMON, "church_projects", "dot_projects_2019"], exact_project_routes: ["B35"], project_route_basis: "church_projects",
    project_route_locator: "HTML section: Church Avenue Transit & Traffic Improvements",
    project_route_supported_claim: "The Church Avenue project description identifies B35 as a route served by the bus-lane improvements.",
    canonical_links: { B35: ["relation_project-serves-b35_2"] },
  },
  "Flatbush Avenue": {
    web_query: "site:nyc.gov/html/dot Flatbush Avenue bus lane B41 B67 2025 official community board",
    source_ids: [...COMMON, "flatbush_phase1_start", "flatbush_phase1_retrospective", "flatbush_cb2_2025", "dot_projects_2025"],
    exact_project_routes: ["B41", "B67"], project_route_basis: "flatbush_phase1_retrospective",
    project_route_locator: "PDF page 12, delivered Phase 1 route context",
    project_route_supported_claim: "The retrospective identifies B41 and B67 buses traveling in the bounded Flatbush Avenue Phase 1 bus lanes.",
    canonical_links: {
      B41: ["relation_flatbush-phase1-serves-b41"],
      B67: ["relation_flatbush-phase1-serves-b67"],
    },
  },
  "Flatbush Avenue/Utica Avenue": {
    web_query: "site:nyc.gov/html/dot Flatbush Avenue Utica Avenue bus lane September 2024 B46 official",
    source_ids: [...COMMON, "flatbush_utica_cb18_2024", "dot_projects_2024"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Flatlands Avenue": {
    web_query: "site:nyc.gov/html/dot Flatlands Avenue bus lane B47 B82 official Brooklyn",
    source_ids: [...COMMON, "b82_kings_highway_cb15_2018"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Fresh Pond Road": {
    web_query: "site:nyc.gov/html/dot Fresh Pond Road bus lane 2019 routes official",
    source_ids: [...COMMON, "dot_projects_2019"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Fulton Street": {
    web_query: "site:nyc.gov/html/dot Fulton Street bus lane Brooklyn B69 2018 official",
    source_ids: [...COMMON, "dot_busways", "dot_projects_2018"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Glenwood Road": {
    web_query: "site:nyc.gov/html/dot Glenwood Road bus lane B6 B17 B42 B60 official",
    source_ids: [...COMMON, "dot_projects_2019"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Jay Street/Smith Street / Tillary Street": {
    web_query: "site:nyc.gov/html/dot Jay Street Busway B54 August 2020 routes official",
    source_ids: [...COMMON, "jay_launch_press", "jay_board_2020", "dot_busways", "dot_projects_2020"],
    exact_project_routes: ["B54"], project_route_basis: "jay_launch_press", canonical_links: {},
    project_route_locator: "HTML lead paragraphs naming the seven Jay Street routes",
    project_route_supported_claim: "The Jay Street Busway release lists B54 among the routes using the busway.",
  },
  "Kings Highway": {
    web_query: "site:nyc.gov/html/dot Kings Highway bus lane B82 2018 official community board",
    source_ids: [...COMMON, "b82_kings_highway_cb15_2018"], exact_project_routes: ["B82+"], project_route_basis: "b82_kings_highway_cb15_2018",
    project_route_locator: "PDF pages 13-29, B82 SBS route and Kings Highway transit-improvement sections",
    project_route_supported_claim: "The B82 SBS presentation identifies the service and the Kings Highway bus-lane treatment together.",
    canonical_links: { "B82+": ["relation_route-b82-sbs-on-kings-highway", "relation_project-has-treatment-bus-lanes_9"] },
  },
  "Livingston Street": {
    web_query: "site:nyc.gov/html/dot Livingston Street protected bus lane routes November 2023 official",
    source_ids: [...COMMON, "livingston_completion_press", "dot_projects_2025"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Malcolm X Boulevard": {
    web_query: "site:nyc.gov/html/dot Malcolm X Boulevard bus lane B46 July 2020 official",
    source_ids: [...COMMON, "b46_malcolm_projects", "b46_sbs_press", "dot_projects_2020"], exact_project_routes: ["B46+"], project_route_basis: "b46_malcolm_projects",
    project_route_locator: "HTML section: Malcolm X Boulevard/Utica Avenue, Chauncey Street to Atlantic Avenue",
    project_route_supported_claim: "The Malcolm X Boulevard project description identifies B46 Local and Select Bus Service as beneficiaries of the bus lane.",
    canonical_links: { "B46+": ["relation_b46-sbs-operates-on-malcolm-x"] },
  },
  "Nassau Avenue": {
    web_query: "site:nyc.gov/html/dot Nassau Avenue bus lane B43 B48 2018 official",
    source_ids: [...COMMON, "dot_projects_2019"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Nostrand Avenue": {
    web_query: "site:nyc.gov/html/dot Nostrand Avenue bus lane B44 official 2013 report",
    source_ids: [...COMMON, "b44_nostrand_report", "b44_nostrand_rogers_presentation"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Pennsylvania Avenue": {
    web_query: "site:nyc.gov/html/dot Pennsylvania Avenue bus lane B82 B83 2018 official",
    source_ids: [...COMMON, "b82_kings_highway_cb15_2018"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Utica Avenue": {
    web_query: "site:nyc.gov/html/dot Utica Avenue bus lane B46 official 2016 community board",
    source_ids: [...COMMON, "b46_sbs_press", "dot_projects_2020"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
  "Van Sinderen Avenue": {
    web_query: "site:nyc.gov/html/dot Van Sinderen Avenue bus lane B111 2016 official",
    source_ids: [...COMMON, "dot_projects_2019"], exact_project_routes: [], project_route_basis: null, canonical_links: {},
  },
};

function sortJson(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortJson(child)]));
  }
  return value;
}

function stableJson(value: unknown): string { return JSON.stringify(sortJson(value as Json)); }
function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
async function fileSha256(path: string): Promise<string> { return sha256(await readFile(path)); }
function jsonl(rows: unknown[]): string { return `${rows.map(stableJson).join("\n")}\n`; }
async function writeStableJson(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(sortJson(value as Json), null, 2)}\n`); }
async function readJsonl<T>(path: string): Promise<T[]> {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

function normalizeRouteId(routeId: string): string { return routeId.toUpperCase().replace(/-SBS$/, "").replace(/\+$/, ""); }
function busTimeRouteId(routeId: string): string { return routeId.endsWith("+") ? `${routeId.slice(0, -1)}-SBS` : routeId; }
function inferCorridor(rationale: string): string {
  for (const pattern of [/Pinned (.+?) rows for \d{4}-\d{2}-\d{2}/, /'s (.+?) candidate (?:uses|is dated)/, /lane piece\(s\) on (.+?) selected by/]) {
    const match = rationale.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  throw new Error(`Could not infer corridor: ${rationale}`);
}
function corridorFacilities(corridor: string): string[] {
  return [corridor.trim(), ...corridor.split(/\s*\/\s*/).map((value) => value.trim()).filter(Boolean)].filter((value, i, all) => all.indexOf(value) === i);
}
function normalizeFacility(value: string): string {
  return value.toLowerCase().replace(/\bavenue\b/g, "ave").replace(/\bboulevard\b/g, "blvd").replace(/\bstreet\b/g, "st").replace(/\bplace\b/g, "pl").replace(/\s+/g, " ").trim();
}
function parseOpenDate(value: string): string[] {
  return value.split(",").map((part) => part.trim()).flatMap((part) => {
    const match = part.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!match) return [];
    const shortYear = Number(match[3]);
    const year = match[3].length === 2 ? shortYear + (shortYear >= 60 ? 1900 : 2000) : shortYear;
    return [`${String(year).padStart(4, "0")}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`];
  });
}
function officialSbsRoutes(row: Record<string, unknown>): string[] {
  return [row.sbs_route1, row.sbs_route2, row.sbs_route3].filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => normalizeRouteId(value)).sort();
}
function stripHtml(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

async function rederivePartition(trackerRoot: string): Promise<PartitionRow[]> {
  const ledgerPath = join(REPO_ROOT, "data/quality/rc19-reject-reconciliation/rc19-reject-ledger.jsonl");
  const pinnedPath = join(trackerRoot, "docs/research/artifacts/candidate-set-v2-24080902f508b55a0033df32.study-events.json");
  const reviewDir = join(trackerRoot, "docs/research/reviews/rc19/inputs");
  const ledgerRows = await readJsonl<Record<string, unknown>>(ledgerPath);
  const backlog = ledgerRows.filter((row) => row.exclusive_primary_disposition === "mta_route_or_treatment_scope_binding_gap" && row.treatment_family === "bus_lane");
  if (backlog.length !== 321) throw new Error(`Expected exact 321-row backlog, got ${backlog.length}`);
  if (await fileSha256(pinnedPath) !== CANDIDATE_SET_SHA256) throw new Error("Pinned candidate set hash mismatch");
  const pinned = JSON.parse(await readFile(pinnedPath, "utf8")) as { candidateSetId: string; candidates: Array<Record<string, unknown>> };
  if (pinned.candidateSetId !== CANDIDATE_SET_ID) throw new Error(`Unexpected candidate set ${pinned.candidateSetId}`);
  const candidates = new Map(pinned.candidates.map((row) => [String(row.candidateId), row]));
  const review = new Map<string, { row: Record<string, unknown>; path: string; sha256: string }>();
  for (const name of (await readdir(reviewDir)).filter((name) => /^\d+-bus-lane-.*\.input\.json$/.test(name)).sort()) {
    const path = join(reviewDir, name);
    const input = JSON.parse(await readFile(path, "utf8")) as { candidates: Array<Record<string, unknown>> };
    const inputSha = await fileSha256(path);
    for (const row of input.candidates) review.set(String(row.candidateId), { row, path, sha256: inputSha });
  }
  const rows = backlog.filter((row) => /^B(?!X)/.test(String(row.route_id)) || /^X(27|28|37|38)$/.test(String(row.route_id))).map((ledger): PartitionRow => {
    const id = String(ledger.candidate_id);
    const candidate = candidates.get(id);
    const reviewed = review.get(id);
    if (!candidate || !reviewed) throw new Error(`Missing pinned candidate/review ${id}`);
    const historical = (reviewed.row.historicalContext ?? {}) as Record<string, unknown>;
    const rationale = String(historical.rationale ?? "");
    const routeId = String(ledger.route_id);
    if (routeId !== candidate.routeId || String(ledger.implementation_date) !== candidate.implementationDate || String(ledger.identity) !== `${candidate.routeId}|${candidate.treatmentFamily}|${candidate.implementationDate}|${candidate.datePrecision}`) {
      throw new Error(`Pinned identity mismatch ${id}`);
    }
    const provenance = (candidate.provenance as Array<Record<string, unknown>>)[0];
    return {
      candidate_id: id, identity: String(ledger.identity), route_id: routeId, normalized_route_id: normalizeRouteId(routeId),
      implementation_date: String(ledger.implementation_date), implementation_month: String(candidate.implementationMonth), date_precision: String(ledger.date_precision),
      source_event_id: String(provenance.sourceEventId), corridor: inferCorridor(rationale), historical_review_rationale: rationale,
      ledger_row_sha256: sha256(stableJson(ledger)), candidate_row_sha256: sha256(stableJson(candidate)),
      review_input_path: relative(trackerRoot, reviewed.path), review_input_sha256: reviewed.sha256,
    };
  }).sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  if (rows.length !== 60) throw new Error(`Expected 60 Brooklyn/null candidates, got ${rows.length}`);
  if (new Set(rows.map((row) => row.candidate_id)).size !== 60) throw new Error("Duplicate candidate ids");
  for (const row of rows) if (!RESEARCH[row.corridor]) throw new Error(`Missing research plan for ${row.corridor}`);
  await writeFile(ARTIFACTS.partition, jsonl(rows));
  const brooklyn = rows.filter((row) => /^B(?!X)/.test(row.route_id));
  const nullRows = rows.filter((row) => /^X(27|28|37|38)$/.test(row.route_id));
  await writeStableJson(ARTIFACTS.partitionProof, {
    schema_version: 1, shard: "brooklyn-null", derived_on: RESEARCHED_ON, candidate_set_id: CANDIDATE_SET_ID, candidate_set_sha256: CANDIDATE_SET_SHA256,
    reconciliation_ledger_path: relative(REPO_ROOT, ledgerPath), reconciliation_ledger_sha256: await fileSha256(ledgerPath), exact_backlog_count: backlog.length,
    brooklyn_count: brooklyn.length, borough_null_count: nullRows.length, borough_null_candidate_ids: nullRows.map((row) => row.candidate_id),
    borough_null_route_ids: nullRows.map((row) => row.route_id).sort(), unique_candidate_count: new Set(rows.map((row) => row.candidate_id)).size,
    candidate_ids_sha256: sha256(`${rows.map((row) => row.candidate_id).join("\n")}\n`), partition_sha256: sha256(jsonl(rows)),
    exclusive_partition_rule: "exclusive_primary_disposition=mta_route_or_treatment_scope_binding_gap AND treatment_family=bus_lane AND (route_id begins B but not BX OR route_id is X27/X28/X37/X38)",
  });
  return rows;
}

async function fetchSource(plan: SourcePlan): Promise<{ source: SourceCheck; bytes: Uint8Array | null }> {
  const unavailable = (status: number | null, media: string | null): { source: SourceCheck; bytes: null } => ({ source: { ...plan, retrieval_status: "not_retrieved", retrieved_on: RESEARCHED_ON, http_status: status, media_type: media, content_sha256: null, byte_length: null, raw_content_retained: false }, bytes: null });
  try {
    const response = await fetch(plan.url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36", accept: "*/*" } });
    if (!response.ok) return unavailable(response.status, response.headers.get("content-type"));
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { source: { ...plan, retrieval_status: "acquired", retrieved_on: RESEARCHED_ON, http_status: response.status, media_type: response.headers.get("content-type"), content_sha256: sha256(bytes), byte_length: bytes.byteLength, raw_content_retained: false }, bytes };
  } catch {
    return unavailable(null, null);
  }
}

async function fetchRoutePage(row: PartitionRow): Promise<RoutePageCheck> {
  const queryRoute = busTimeRouteId(row.route_id);
  const url = `https://bustime-classic.mta.info/m/?q=${encodeURIComponent(queryRoute)}`;
  const empty = (): RoutePageCheck => ({ candidate_id: row.candidate_id, route_id: row.route_id, query_route_id: queryRoute, corridor: row.corridor, url, retrieval_status: "not_retrieved", retrieved_on: RESEARCHED_ON, http_status: null, content_sha256: null, byte_length: null, exact_route_title_found: false, corridor_token_found: false, title: null, raw_content_retained: false });
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36" } });
    if (!response.ok) return { ...empty(), http_status: response.status };
    const bytes = new Uint8Array(await response.arrayBuffer());
    const html = new TextDecoder().decode(bytes);
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
    const text = normalizeFacility(stripHtml(html));
    return { candidate_id: row.candidate_id, route_id: row.route_id, query_route_id: queryRoute, corridor: row.corridor, url, retrieval_status: "acquired", retrieved_on: RESEARCHED_ON, http_status: response.status, content_sha256: sha256(bytes), byte_length: bytes.byteLength, exact_route_title_found: title?.toUpperCase().includes(`ROUTE ${queryRoute}`) ?? false, corridor_token_found: corridorFacilities(row.corridor).map(normalizeFacility).some((token) => text.includes(token)), title, raw_content_retained: false };
  } catch { return empty(); }
}

async function acquire(partition: PartitionRow[]): Promise<void> {
  const fetched = await Promise.all(SOURCES.map(fetchSource));
  const dot = fetched.find((result) => result.source.id === "dot_bus_lanes_snapshot");
  if (!dot?.bytes || !dot.source.content_sha256) throw new Error("Official NYC DOT lane snapshot unavailable");
  const laneRows = JSON.parse(new TextDecoder().decode(dot.bytes)) as Array<Record<string, unknown>>;
  const evidence: LaneEvidence[] = [];
  for (const candidate of partition) {
    const facilities = corridorFacilities(candidate.corridor).map(normalizeFacility);
    const matches = laneRows.filter((row) => facilities.includes(normalizeFacility(String(row.facility ?? ""))) && parseOpenDate(String(row.open_dates ?? "")).includes(candidate.implementation_date));
    if (matches.length === 0) throw new Error(`No official lane row for ${candidate.candidate_id} ${candidate.corridor} ${candidate.implementation_date}`);
    for (const row of matches) {
      const retained = {
        segment_id: typeof row.segmentid === "string" ? row.segmentid : null, facility: typeof row.facility === "string" ? row.facility : null,
        street: typeof row.street === "string" ? row.street : null, boro: typeof row.boro === "string" ? row.boro : null,
        open_dates: typeof row.open_dates === "string" ? row.open_dates : null, official_sbs_routes: officialSbsRoutes(row),
        lane_type: typeof row.lane_type === "string" ? row.lane_type : null, lane_description: typeof row.lane_type2 === "string" ? row.lane_type2 : null,
        facility_type: typeof row.lane_type1 === "string" ? row.lane_type1 : null, direction: typeof row.direction === "string" ? row.direction : null,
        hours: typeof row.hours === "string" ? row.hours : null, days: typeof row.days === "string" ? row.days : null,
      };
      evidence.push({ candidate_id: candidate.candidate_id, source_snapshot_sha256: dot.source.content_sha256, source_row_sha256: sha256(stableJson(retained)), ...retained });
    }
  }
  evidence.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id) || String(a.segment_id).localeCompare(String(b.segment_id)) || a.source_row_sha256.localeCompare(b.source_row_sha256));
  await writeFile(ARTIFACTS.laneEvidence, jsonl(evidence));
  const routePages: RoutePageCheck[] = [];
  for (let i = 0; i < partition.length; i += 8) routePages.push(...await Promise.all(partition.slice(i, i + 8).map(fetchRoutePage)));
  routePages.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  await writeStableJson(ARTIFACTS.sourceChecks, {
    schema_version: 1, shard: "brooklyn-null", acquired_on: RESEARCHED_ON, candidate_set_id: CANDIDATE_SET_ID, candidate_set_sha256: CANDIDATE_SET_SHA256,
    web_search_method: "Official-domain corridor searches were executed on 2026-07-15. Each receipt preserves the exact query and official URLs; retrieved official sources were byte-hashed.",
    sources: fetched.map((result) => result.source).sort((a, b) => a.id.localeCompare(b.id)), route_pages: routePages,
  });
}

function sameSbsIdentity(candidate: PartitionRow, row: LaneEvidence): boolean {
  return candidate.route_id.endsWith("+") && row.official_sbs_routes.includes(candidate.normalized_route_id);
}

async function generate(): Promise<void> {
  const partition = await readJsonl<PartitionRow>(ARTIFACTS.partition);
  const evidence = await readJsonl<LaneEvidence>(ARTIFACTS.laneEvidence);
  const checks = JSON.parse(await readFile(ARTIFACTS.sourceChecks, "utf8")) as { sources: SourceCheck[]; route_pages: RoutePageCheck[] };
  const sources = new Map(checks.sources.map((row) => [row.id, row]));
  const routePages = new Map(checks.route_pages.map((row) => [row.candidate_id, row]));
  const evidenceByCandidate = new Map<string, LaneEvidence[]>();
  for (const row of evidence) evidenceByCandidate.set(row.candidate_id, [...(evidenceByCandidate.get(row.candidate_id) ?? []), row]);
  const source = (id: string): SourceCheck => { const value = sources.get(id); if (!value) throw new Error(`Missing source ${id}`); return value; };
  const receipts = partition.map((candidate) => {
    const research = RESEARCH[candidate.corridor];
    const lanes = evidenceByCandidate.get(candidate.candidate_id) ?? [];
    const routePage = routePages.get(candidate.candidate_id);
    if (!routePage) throw new Error(`Missing route page ${candidate.candidate_id}`);
    const sameSbsRows = lanes.filter((row) => sameSbsIdentity(candidate, row));
    const configuredProjectBasis = research.project_route_basis ? source(research.project_route_basis) : null;
    const projectSupported = research.exact_project_routes.includes(candidate.route_id) && configuredProjectBasis?.retrieval_status === "acquired";
    const projectBasis = projectSupported ? configuredProjectBasis : null;
    const routeBinding = sameSbsRows.length > 0 || projectSupported;
    const segmentIds = [...new Set(sameSbsRows.map((row) => row.segment_id).filter((id): id is string => id !== null))].sort();
    const existingLinks = research.canonical_links[candidate.route_id] ?? [];
    const completionMilestone = (research.exact_completion_milestone_routes ?? []).includes(candidate.route_id) && source("battery_completion_press").retrieval_status === "acquired";
    const checked = research.source_ids.map(source);
    const officialRoutes = [...new Set(lanes.flatMap((row) => row.official_sbs_routes))].sort();
    const evidenceBindings = [
      ...sameSbsRows.map((row) => ({ evidence_kind: "official_dot_lane_registry_row", source_id: "dot_bus_lanes_snapshot", source_sha256: row.source_snapshot_sha256, source_row_sha256: row.source_row_sha256, segment_id: row.segment_id, official_sbs_routes: row.official_sbs_routes, open_dates: row.open_dates })),
      ...(projectBasis ? [{ evidence_kind: "official_project_route_statement", source_id: projectBasis.id, source_sha256: projectBasis.content_sha256, source_row_sha256: null, segment_id: null, official_routes: research.exact_project_routes, open_dates: null, locator: research.project_route_locator ?? null, supported_claim: research.project_route_supported_claim ?? null }] : []),
    ];
    const receiptCore = {
      schema_version: 1, campaign: "canonical-relationship-integrity-v1", shard: "brooklyn-null", researched_on: RESEARCHED_ON,
      candidate: { candidate_id: candidate.candidate_id, candidate_set_id: CANDIDATE_SET_ID, candidate_set_sha256: CANDIDATE_SET_SHA256, identity: candidate.identity, route_id: candidate.route_id, normalized_route_id: candidate.normalized_route_id, treatment_family: "bus_lane", implementation_date: candidate.implementation_date, implementation_month: candidate.implementation_month, date_precision: candidate.date_precision, source_event_id: candidate.source_event_id, registry_source_id: "nyc_dot_bus_lanes", corridor: candidate.corridor },
      partition_evidence: { ledger_row_sha256: candidate.ledger_row_sha256, candidate_row_sha256: candidate.candidate_row_sha256, review_input_path: candidate.review_input_path, review_input_sha256: candidate.review_input_sha256 },
      acquisition_attempts: [
        { category: "official_nyc_dot_lane_project", query: research.web_query, query_status: "performed_2026-07-15", urls_checked: checked.filter((item) => item.category === "dot_lane_project").map((item) => item.url), retrievals: checked.filter((item) => item.category === "dot_lane_project").map((item) => ({ id: item.id, status: item.retrieval_status, retrieved_on: item.retrieved_on, sha256: item.content_sha256 })) },
        { category: "official_mta_route_project", query: `site:mta.info \"${candidate.route_id}\" \"${candidate.corridor}\" bus route project`, query_status: "performed_by_official_route_fetch_and_project_document_search_2026-07-15", urls_checked: [routePage.url, source("mta_brooklyn_bus_map").url, ...checked.filter((item) => item.category === "mta_route_project").map((item) => item.url)].filter((url, i, all) => all.indexOf(url) === i), retrievals: [{ id: `mta_bustime_${candidate.route_id}`, status: routePage.retrieval_status, retrieved_on: routePage.retrieved_on, sha256: routePage.content_sha256 }, { id: "mta_brooklyn_bus_map", status: source("mta_brooklyn_bus_map").retrieval_status, retrieved_on: source("mta_brooklyn_bus_map").retrieved_on, sha256: source("mta_brooklyn_bus_map").content_sha256 }, ...checked.filter((item) => item.category === "mta_route_project").map((item) => ({ id: item.id, status: item.retrieval_status, retrieved_on: item.retrieved_on, sha256: item.content_sha256 }))] },
        { category: "official_public_board_committee", query: `${research.web_query} community board committee MTA Board`, query_status: "performed_2026-07-15", urls_checked: checked.filter((item) => item.category === "board_committee").map((item) => item.url), retrievals: checked.filter((item) => item.category === "board_committee").map((item) => ({ id: item.id, status: item.retrieval_status, retrieved_on: item.retrieved_on, sha256: item.content_sha256 })) },
        { category: "other_repository_approved_primary", query: `NYC DOT Open Data ycrg-ses3 facility=${candidate.corridor} open_dates contains ${candidate.implementation_date}`, query_status: "executed_against_acquired_snapshot_2026-07-15", urls_checked: [source("dot_bus_lanes_metadata").url, source("dot_datafeeds").url], retrievals: [source("dot_bus_lanes_metadata"), source("dot_datafeeds")].map((item) => ({ id: item.id, status: item.retrieval_status, retrieved_on: item.retrieved_on, sha256: item.content_sha256 })) },
      ],
      source_findings: {
        acquired_for_candidate: checked.some((item) => item.retrieval_status === "acquired") && source("dot_bus_lanes_snapshot").retrieval_status === "acquired",
        official_lane_matching_record_count: lanes.length, official_lane_matching_segment_ids: [...new Set(lanes.map((row) => row.segment_id).filter(Boolean))].sort(),
        official_lane_named_sbs_routes: officialRoutes, candidate_named_lane_record_count: sameSbsRows.length,
        exact_project_route_statement_found: projectSupported, exact_project_route_source_id: projectBasis?.id ?? null,
        exact_project_route_locator: projectBasis ? research.project_route_locator ?? null : null,
        exact_project_route_supported_claim: projectBasis ? research.project_route_supported_claim ?? null : null,
        mta_route_page: { retrieval_status: routePage.retrieval_status, content_sha256: routePage.content_sha256, exact_route_title_found: routePage.exact_route_title_found, current_corridor_token_found: routePage.corridor_token_found, temporal_limitation: "The live route page was captured in 2026 and is not treated as proof that the route used the candidate segment on the candidate date." },
        historical_review_rationale: candidate.historical_review_rationale,
      },
      claim_results: {
        physical_bus_lane_record_acquired: lanes.length > 0, exact_route_treatment_binding_proved: routeBinding, exact_route_binding_evidence: evidenceBindings,
        exact_segment_binding_proved: segmentIds.length > 0, exact_segment_ids: segmentIds,
        candidate_date_supported_at_day_precision: sameSbsRows.length > 0,
        official_completion_milestone_proved: completionMilestone,
        explicit_phase_identity_proved: false, date_and_phase_proved: false, operational_occurrence_identity_proved: false,
        unsupported_claims: [
          ...(!routeBinding ? ["No acquired authoritative source binds this candidate route to the dated lane treatment at the claimed precision."] : []),
          ...(segmentIds.length === 0 ? ["No single acquired authoritative source binds the candidate route to exact DOT segment identifiers."] : []),
          ...(completionMilestone ? ["The source proves a completion milestone, but the campaign has not assigned a stable canonical phase identity to the registry event."] : ["No acquired source assigns a stable canonical phase identity and distinguishes initial onset from extension or redesign."]),
          "The registry projection is not itself a canonical MTA Wiki operational occurrence.",
          "Geometry, stop proximity, and street-name similarity were not promoted to authoritative evidence.",
        ],
      },
      canonical_actions: {
        existing_canonical_links_verified: existingLinks, canonical_links_added: [], operational_occurrence_added_or_updated: false,
        reason: existingLinks.length > 0 ? "The supportable route/corridor relationship already exists in canonical data. The registry-specific phase and occurrence identity remain unresolved, so no duplicate edge or occurrence was created." : routeBinding ? "Authoritative linkage evidence was acquired, but a stable phase/occurrence identity was not proved. Stage and review the cited source before any canonical event promotion." : "No authoritative route linkage was proved; no canonical mutation is warranted.",
      },
      outcome: {
        exclusive_primary_disposition: routeBinding ? "linkage_supported_phase_unresolved" : "completed_search_route_linkage_unresolved",
        registry_projection_excluded: true,
        exclusion_reason: routeBinding ? "Authoritative route-treatment evidence exists, but the registry event lacks an evidence-backed stable phase and canonical operational-occurrence identity." : "The completed official-source search did not prove an exact route-treatment binding; the registry row remains a proximity-derived, non-projectable projection.",
        study_projection_eligible: false, still_unresolved: true,
        next_action: routeBinding ? "Use normal source intake and reviewed canonical correction paths to resolve phase identity and onset precision before reconsidering projection; never inherit the registry day automatically." : "Retain this completed receipt and exclusion; reconsider only if a later authoritative source explicitly binds route, treatment, physical scope, date, and phase.",
      },
    };
    return { receipt_id: `brooklyn-null-acquisition:${sha256(stableJson(receiptCore)).slice(0, 24)}`, ...receiptCore };
  }).sort((a, b) => a.candidate.candidate_id.localeCompare(b.candidate.candidate_id));
  await writeFile(ARTIFACTS.receipts, jsonl(receipts));
  const exclusions = receipts.map((receipt) => ({ schema_version: 1, candidate_id: receipt.candidate.candidate_id, candidate_set_id: CANDIDATE_SET_ID, identity: receipt.candidate.identity, shard: "brooklyn-null", excluded_from: "mta_wiki_operational_occurrence_projection", exclusion_rule: "relationship-contract-v1:registry-only-bus-lane-requires-authoritative-route-treatment-phase-occurrence-evidence", reason: receipt.outcome.exclusion_reason, exact_route_treatment_binding_proved: receipt.claim_results.exact_route_treatment_binding_proved, phase_identity_proved: false, study_projection_eligible: false, receipt_id: receipt.receipt_id }));
  await writeFile(ARTIFACTS.exclusions, jsonl(exclusions));
  const bound = receipts.filter((receipt) => receipt.claim_results.exact_route_treatment_binding_proved);
  const segment = receipts.filter((receipt) => receipt.claim_results.exact_segment_binding_proved);
  const summary = {
    schema_version: 1, shard: "brooklyn-null", researched_on: RESEARCHED_ON, candidate_set_id: CANDIDATE_SET_ID, candidate_set_sha256: CANDIDATE_SET_SHA256,
    researched_count: receipts.length, source_acquired_count: receipts.filter((receipt) => receipt.source_findings.acquired_for_candidate).length,
    exact_route_binding_proved_count: bound.length, exact_route_binding_proved_candidate_ids: bound.map((receipt) => receipt.candidate.candidate_id),
    segment_binding_proved_count: segment.length, segment_binding_proved_candidate_ids: segment.map((receipt) => receipt.candidate.candidate_id),
    date_and_phase_proved_count: receipts.filter((receipt) => receipt.claim_results.date_and_phase_proved).length,
    operational_occurrence_added_or_updated_count: receipts.filter((receipt) => receipt.canonical_actions.operational_occurrence_added_or_updated).length,
    explicitly_excluded_count: receipts.filter((receipt) => receipt.outcome.registry_projection_excluded).length,
    still_unresolved_count: receipts.filter((receipt) => receipt.outcome.still_unresolved).length,
    study_projection_eligible_count: receipts.filter((receipt) => receipt.outcome.study_projection_eligible).length,
    existing_canonical_link_count: receipts.reduce((sum, receipt) => sum + receipt.canonical_actions.existing_canonical_links_verified.length, 0),
    exclusive_primary_disposition_counts: Object.fromEntries([...new Set(receipts.map((receipt) => receipt.outcome.exclusive_primary_disposition))].sort().map((value) => [value, receipts.filter((receipt) => receipt.outcome.exclusive_primary_disposition === value).length])),
    route_partition_counts: { brooklyn: receipts.filter((receipt) => /^B(?!X)/.test(receipt.candidate.route_id)).length, borough_null_x_routes: receipts.filter((receipt) => /^X(27|28|37|38)$/.test(receipt.candidate.route_id)).length },
    receipts_sha256: sha256(jsonl(receipts)), exclusions_sha256: sha256(jsonl(exclusions)),
    warning: "A supported route-treatment linkage is not a projectable occurrence. All rows remain excluded because stable phase and canonical occurrence identity were not proved.",
  };
  await writeStableJson(ARTIFACTS.summary, summary);
  const report = `# Brooklyn and borough-null registry-only bus-lane acquisition shard\n\n` +
    `- Pinned candidate set: \`${CANDIDATE_SET_ID}\` (\`${CANDIDATE_SET_SHA256}\`)\n` +
    `- Deterministic partition: **${receipts.length}** candidates (**${summary.route_partition_counts.brooklyn} Brooklyn**, **${summary.route_partition_counts.borough_null_x_routes} borough-null X routes**)\n` +
    `- Researched: **${summary.researched_count}**\n- Official source acquired: **${summary.source_acquired_count}**\n` +
    `- Exact route-treatment binding proved: **${summary.exact_route_binding_proved_count}**\n- Exact DOT segment binding proved: **${summary.segment_binding_proved_count}**\n` +
    `- Date and explicit phase both proved: **${summary.date_and_phase_proved_count}**\n- Operational occurrence added or updated: **${summary.operational_occurrence_added_or_updated_count}**\n` +
    `- Registry projections explicitly excluded: **${summary.explicitly_excluded_count}**\n- Still unresolved for study projection: **${summary.still_unresolved_count}**\n\n` +
    `Every receipt records NYC DOT lane/project, MTA route/project, public board/committee, and other official primary-data checks. A route/corridor statement is kept separate from exact segment, day, phase, and occurrence identity. Proximity and street-name similarity are never authoritative.\n\n` +
    `## Reproduce\n\n\`\`\`bash\nbun data/quality/relationship-integrity/bus-lane-acquisition/shards/brooklyn-null/acquire.ts --verify-partition --tracker-root ${DEFAULT_TRACKER_ROOT}\nbun test data/quality/relationship-integrity/bus-lane-acquisition/shards/brooklyn-null/acquire.test.ts\n\`\`\`\n`;
  await writeFile(ARTIFACTS.report, report);
  const paths = [ARTIFACTS.partition, ARTIFACTS.partitionProof, ARTIFACTS.sourceChecks, ARTIFACTS.laneEvidence, ARTIFACTS.receipts, ARTIFACTS.exclusions, ARTIFACTS.summary, ARTIFACTS.report];
  const artifacts = await Promise.all(paths.map(async (path) => ({ path: basename(path), sha256: await fileSha256(path), bytes: (await readFile(path)).byteLength })));
  await writeStableJson(ARTIFACTS.manifest, { schema_version: 1, shard: "brooklyn-null", generated_on: RESEARCHED_ON, candidate_set_id: CANDIDATE_SET_ID, candidate_set_sha256: CANDIDATE_SET_SHA256, artifacts, manifest_payload_sha256: sha256(stableJson(artifacts)) });
}

async function main(): Promise<void> {
  await mkdir(SHARD_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const trackerIndex = args.indexOf("--tracker-root");
  const trackerRoot = trackerIndex >= 0 ? resolve(args[trackerIndex + 1] ?? "") : DEFAULT_TRACKER_ROOT;
  if (args.includes("--acquire")) { const partition = await rederivePartition(trackerRoot); await acquire(partition); await generate(); return; }
  if (args.includes("--verify-partition")) {
    const before = await readFile(ARTIFACTS.partition, "utf8").catch(() => null);
    const partition = await rederivePartition(trackerRoot);
    if (before !== null && before !== jsonl(partition)) throw new Error("Rederived partition differs from checked artifact");
    if (!args.includes("--generate")) return;
  }
  await generate();
}

await main();
