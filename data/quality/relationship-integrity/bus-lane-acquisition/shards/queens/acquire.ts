import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const SHARD_DIR = import.meta.dir;
const REPO_ROOT = resolve(SHARD_DIR, "../../../../../..");
const RESEARCHED_ON = "2026-07-15";
const CANDIDATE_SET_ID = "candidate-set-v2:24080902f508b55a0033df32";
const CANDIDATE_SET_SHA256 = "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba";
const DEFAULT_TRACKER_ROOT = "/home/cjpher/.codex/worktrees/61db/bus-reliability-tracker";

const PARTITION_PATH = join(SHARD_DIR, "partition.jsonl");
const PARTITION_PROOF_PATH = join(SHARD_DIR, "partition-proof.json");
const SOURCE_CHECKS_PATH = join(SHARD_DIR, "acquired-source-checks.json");
const LANE_EVIDENCE_PATH = join(SHARD_DIR, "official-lane-evidence.jsonl");
const RECEIPTS_PATH = join(SHARD_DIR, "receipts.jsonl");
const EXCLUSIONS_PATH = join(SHARD_DIR, "registry-projection-exclusions.jsonl");
const SUMMARY_PATH = join(SHARD_DIR, "summary.json");
const REPORT_PATH = join(SHARD_DIR, "report.md");
const MANIFEST_PATH = join(SHARD_DIR, "manifest.json");
const LINKAGE_ACTIONS_PATH = join(SHARD_DIR, "linkage-remediation", "candidate-actions.json");

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

type AcquiredSource = {
  id: string;
  category: "dot_lane_project" | "mta_route_project" | "board_committee" | "other_primary";
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

type LinkageCandidateAction = {
  candidate_id: string;
  canonical_links_added: string[];
  canonical_records_added: string[];
  canonical_records_updated: string[];
  staged_source_ids: string[];
  study_projection_eligible: false;
  remaining_unsupported_claims: string[];
};

const OFFICIAL_SOURCES: Array<{
  id: string;
  category: AcquiredSource["category"];
  url: string;
  note: string;
}> = [
  {
    id: "dot_bus_lanes_snapshot",
    category: "dot_lane_project",
    url: "https://data.cityofnewyork.us/resource/ycrg-ses3.json?$limit=5000",
    note: "Authoritative NYC DOT Bus Lanes - Local Streets API snapshot; selected records are retained separately without geometry.",
  },
  {
    id: "dot_bus_lanes_metadata",
    category: "other_primary",
    url: "https://data.cityofnewyork.us/api/views/ycrg-ses3",
    note: "NYC Open Data metadata for the DOT bus-lane dataset.",
  },
  {
    id: "dot_datafeeds",
    category: "other_primary",
    url: "https://www.nyc.gov/html/dot/html/about/datafeeds.shtml",
    note: "NYC DOT data catalog linking the official Bus Lane Locations dataset.",
  },
  {
    id: "mta_qbnr_addendum",
    category: "mta_route_project",
    url: "https://www.mta.info/document/160976",
    note: "Official Queens Bus Network Redesign Proposed Final Plan Addendum summary.",
  },
  {
    id: "mta_board_staff_summary",
    category: "board_committee",
    url: "https://www.mta.info/document/174076",
    note: "Official MTA Board staff summary documenting Board approval and implementation phases for the Queens Bus Network Redesign.",
  },
  {
    id: "dot_projects_2019",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2019.shtml",
    note: "NYC DOT project index exposing official community-board presentations for 2019 projects.",
  },
  {
    id: "dot_projects_2021",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2021.shtml",
    note: "NYC DOT project index exposing official community-board and advisory-board presentations for 2021 projects.",
  },
  {
    id: "dot_projects_2023",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2023.shtml",
    note: "NYC DOT project index exposing official community-board presentations for 2023 projects.",
  },
  {
    id: "dot_projects_2024",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2024.shtml",
    note: "NYC DOT project index exposing official community-board presentations for 2024 projects.",
  },
  {
    id: "dot_projects_2025",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/html/about/projects-2025.shtml",
    note: "NYC DOT project index exposing official community-board presentations for 2025 projects.",
  },
  {
    id: "fresh_pond_cb5_minutes",
    category: "board_committee",
    url: "https://www.nyc.gov/assets/queenscb5/downloads/pdf/minutes/CB5QMinutes_June122019Amended.pdf",
    note: "Queens CB5 minutes identify the Fresh Pond Road proposal and the Q58, QM24, QM25, and QM34 routes; none is a Queens-shard candidate for this corridor/date.",
  },
  {
    id: "rockaway_beach_cb14",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/rockaway-beach-blvd-jun2019.pdf",
    note: "Queens CB14 presentation identifies Q22, Q52 SBS, Q53 SBS, QM16, and QM17 as routes served by the Rockaway Beach Boulevard improvements.",
  },
  {
    id: "merrick_camera_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2021/release-merrick-busway-camera-warnings.shtml",
    note: "NYC DOT identifies the Merrick Boulevard lane extent and Q4, Q5, Q84, and Q85 among the served MTA routes.",
  },
  {
    id: "jamaica_archer_start_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-035.shtml",
    note: "NYC DOT identifies the Jamaica and Archer busway extents and installation timing but not an exhaustive route list.",
  },
  {
    id: "battery_place_launch_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-020.shtml",
    note: "NYC DOT identifies Battery Place treatment and launch date but does not name the Queens express candidates individually.",
  },
  {
    id: "twenty_first_completion_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2022/buses-for-queens.shtml",
    note: "NYC DOT identifies the 21st Street extent and Q66, Q69, Q100, plus one-block Q102/Q103 service.",
  },
  {
    id: "northern_completion_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2023/northern-blvd-bus-priority.shtml",
    note: "NYC DOT identifies Northern Boulevard project routes Q66, QM2, QM3, QM20, and QM32.",
  },
  {
    id: "westchester_pelham_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2023/pelham-bay-station-improvements.shtml",
    note: "NYC DOT identifies Bx12 SBS as the served route; it does not support the Q50 registry projection.",
  },
  {
    id: "third_avenue_start_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2023/3rd-ave-redesign.shtml",
    note: "NYC DOT identifies M98, M101, M102, and M103; it does not name the Queens express candidates.",
  },
  {
    id: "second_avenue_start_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2024/redesign-manhattan-second-ave.shtml",
    note: "NYC DOT identifies M15 local/SBS as the served route; it does not support QM63/QM64 candidate-specific onset.",
  },
  {
    id: "queens_boulevard_cb2",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/queens-blvd-roosevelt-ave-skillman-ave-jun2024.pdf",
    note: "Queens CB2 presentation lists current routes on a defined Queens Boulevard section; it postdates and does not establish the 2023 candidate lane onset.",
  },
  {
    id: "flatbush_utica_cb18",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/flatbush-ave-utica-ave-ave-s-mar2024.pdf",
    note: "Brooklyn CB18 presentation covers the intersection project but does not establish a Q35 bus-lane implementation relationship.",
  },
  {
    id: "hillside_start_press",
    category: "dot_lane_project",
    url: "https://www.nyc.gov/html/dot/html/pr2025/nyc-dot-begins-construction-on-hillside-av-bus-lanes.shtml",
    note: "NYC DOT identifies the 144th Street-Springfield Boulevard extent and July 2025 construction start, but does not enumerate all 17 MTA routes in text.",
  },
  {
    id: "hillside_cb8_final",
    category: "board_committee",
    url: "https://www.nyc.gov/html/dot/downloads/pdf/hillside-ave-springfield-blvd-queens-blvd-cb8-may2025.pdf",
    note: "Queens CB8 final proposal documents extent, design, engagement, and planned summer/fall 2025 implementation.",
  },
  {
    id: "mta_q1_hillside_profile",
    category: "mta_route_project",
    url: "https://www.mta.info/document/81901",
    note: "Official MTA final-plan Q1 profile says the route uses Hillside Avenue and changes took effect June 29, 2025.",
  },
];

const CORRIDOR_RESEARCH: Record<
  string,
  {
    web_query: string;
    source_ids: string[];
    exact_project_routes: string[];
    project_route_basis: string | null;
  }
> = {
  "23rd Street": {
    web_query: "site:nyc.gov/html/dot 23rd Street bus lane August 2016 routes QM21 PDF",
    source_ids: ["dot_bus_lanes_snapshot", "dot_projects_2019"],
    exact_project_routes: [],
    project_route_basis: null,
  },
  "Queens Boulevard": {
    web_query: "site:nyc.gov/html/dot Queens Boulevard bus lane community board routes PDF",
    source_ids: ["dot_bus_lanes_snapshot", "queens_boulevard_cb2", "dot_projects_2023", "dot_projects_2024"],
    exact_project_routes: [],
    project_route_basis: null,
  },
  "Fresh Pond Road": {
    web_query: "site:nyc.gov/html/dot Fresh Pond Road bus lane Queens 2019 community board PDF",
    source_ids: ["dot_bus_lanes_snapshot", "fresh_pond_cb5_minutes", "dot_projects_2019"],
    exact_project_routes: ["Q58", "QM24", "QM25", "QM34"],
    project_route_basis: "fresh_pond_cb5_minutes",
  },
  Broadway: {
    web_query: "site:nyc.gov/html/dot Broadway Queens bus lane 2019 community board PDF",
    source_ids: ["dot_bus_lanes_snapshot", "dot_projects_2019"],
    exact_project_routes: [],
    project_route_basis: null,
  },
  "Rockaway Beach Boulevard": {
    web_query: "site:nyc.gov/html/dot Rockaway Beach Boulevard bus lane 2019 Q52 Q53 PDF",
    source_ids: ["dot_bus_lanes_snapshot", "rockaway_beach_cb14", "dot_projects_2019"],
    exact_project_routes: ["Q22", "Q52", "Q53", "QM16", "QM17"],
    project_route_basis: "rockaway_beach_cb14",
  },
  "B 59 Street / Rockaway Beach Boulevard": {
    web_query: "site:nyc.gov/html/dot Rockaway Beach Boulevard bus lane 2019 Q52 Q53 PDF",
    source_ids: ["dot_bus_lanes_snapshot", "rockaway_beach_cb14", "dot_projects_2019"],
    exact_project_routes: ["Q22", "Q52", "Q53", "QM16", "QM17"],
    project_route_basis: "rockaway_beach_cb14",
  },
  "Broadway / Rockaway Beach Boulevard": {
    web_query: "site:nyc.gov/html/dot Rockaway Beach Boulevard bus lane 2019 Q52 Q53 PDF",
    source_ids: ["dot_bus_lanes_snapshot", "rockaway_beach_cb14", "dot_projects_2019"],
    exact_project_routes: ["Q22", "Q52", "Q53", "QM16", "QM17"],
    project_route_basis: "rockaway_beach_cb14",
  },
  "Merrick Boulevard": {
    web_query: "site:nyc.gov/html/dot Merrick Boulevard bus lane 2020 Queens PDF",
    source_ids: ["dot_bus_lanes_snapshot", "merrick_camera_press", "dot_projects_2021"],
    exact_project_routes: ["Q4", "Q5", "Q84", "Q85"],
    project_route_basis: "merrick_camera_press",
  },
  "Kissena Bl / Main Street": {
    web_query: "site:nyc.gov/html/dot Main Street Kissena Boulevard bus lane Queens 2021 community board PDF",
    source_ids: ["dot_bus_lanes_snapshot", "dot_projects_2021"],
    exact_project_routes: [],
    project_route_basis: null,
  },
  "Kissena Bl": {
    web_query: "site:nyc.gov/html/dot Main Street Kissena Boulevard bus lane Queens 2021 community board PDF",
    source_ids: ["dot_bus_lanes_snapshot", "dot_projects_2021"],
    exact_project_routes: [],
    project_route_basis: null,
  },
  "Main Street": {
    web_query: "site:nyc.gov/html/dot Main Street busway Queens 2021 routes PDF",
    source_ids: ["dot_bus_lanes_snapshot", "dot_projects_2021"],
    exact_project_routes: [],
    project_route_basis: null,
  },
  "Battery Pl": {
    web_query: "site:nyc.gov/html/dot Battery Place bus lane 2021 express buses community board PDF",
    source_ids: ["dot_bus_lanes_snapshot", "battery_place_launch_press", "dot_projects_2021"],
    exact_project_routes: [],
    project_route_basis: null,
  },
  "Jamaica Avenue": {
    web_query: "site:nyc.gov/html/dot Jamaica Avenue bus lane busway 2021 Queens routes PDF",
    source_ids: ["dot_bus_lanes_snapshot", "jamaica_archer_start_press", "dot_projects_2023"],
    exact_project_routes: [],
    project_route_basis: null,
  },
  "21st": {
    web_query: "site:nyc.gov/html/dot 21st Street Queens bus lane 2022 Q69 Q100 PDF",
    source_ids: ["dot_bus_lanes_snapshot", "twenty_first_completion_press"],
    exact_project_routes: ["Q66", "Q69", "Q100", "Q102", "Q103"],
    project_route_basis: "twenty_first_completion_press",
  },
  "Westchester Avenue / Wilkinson Avenue": {
    web_query: "site:nyc.gov/html/dot Westchester Avenue Wilkinson Avenue bus lane 2022 routes PDF",
    source_ids: ["dot_bus_lanes_snapshot", "westchester_pelham_press", "dot_projects_2023"],
    exact_project_routes: ["BX12"],
    project_route_basis: "westchester_pelham_press",
  },
  "Northern Boulevard": {
    web_query: "site:nyc.gov/html/dot Northern Boulevard bus priority Queens 2023 routes PDF community board",
    source_ids: ["dot_bus_lanes_snapshot", "northern_completion_press", "dot_projects_2023"],
    exact_project_routes: ["Q66", "QM2", "QM3", "QM20", "QM32"],
    project_route_basis: "northern_completion_press",
  },
  "3rd Avenue": {
    web_query: "site:nyc.gov/html/dot Third Avenue bus lane routes community board PDF",
    source_ids: ["dot_bus_lanes_snapshot", "third_avenue_start_press", "dot_projects_2023"],
    exact_project_routes: ["M98", "M101", "M102", "M103"],
    project_route_basis: "third_avenue_start_press",
  },
  "Flatbush Avenue/Utica Avenue": {
    web_query: "site:nyc.gov/html/dot Flatbush Avenue Utica Avenue bus lane 2024 routes community board PDF",
    source_ids: ["dot_bus_lanes_snapshot", "flatbush_utica_cb18", "dot_projects_2024"],
    exact_project_routes: [],
    project_route_basis: null,
  },
  "2nd Avenue": {
    web_query: "site:nyc.gov/html/dot Second Avenue bus lane 2024 routes community board PDF",
    source_ids: ["dot_bus_lanes_snapshot", "second_avenue_start_press", "dot_projects_2025"],
    exact_project_routes: ["M15"],
    project_route_basis: "second_avenue_start_press",
  },
  "Hillside Avenue": {
    web_query: "site:nyc.gov/html/dot Hillside Avenue bus lanes 2025 routes community board PDF",
    source_ids: ["dot_bus_lanes_snapshot", "hillside_start_press", "hillside_cb8_final", "dot_projects_2025", "mta_q1_hillside_profile"],
    exact_project_routes: ["Q1"],
    project_route_basis: "mta_q1_hillside_profile",
  },
  "Queens Plaza": {
    web_query: "site:nyc.gov/html/dot Queens Plaza bus lane December 2025 routes PDF",
    source_ids: ["dot_bus_lanes_snapshot", "dot_projects_2025"],
    exact_project_routes: [],
    project_route_basis: null,
  },
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
  return `${rows.map(stableJson).join("\n")}\n`;
}

async function writeStableJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(sortJson(value as Json), null, 2)}\n`);
}

function normalizeRouteId(routeId: string): string {
  return routeId.toUpperCase().replace(/-SBS$/, "").replace(/\+$/, "");
}

function busTimeRouteId(routeId: string): string {
  return routeId.endsWith("+") ? `${routeId.slice(0, -1)}-SBS` : routeId;
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
  throw new Error(`Could not infer corridor from rationale: ${rationale}`);
}

function corridorFacilities(corridor: string): string[] {
  return [
    corridor.trim(),
    ...corridor
      .split(/\s*\/\s*/)
      .map((value) => value.trim())
      .filter(Boolean),
  ].filter((value, index, values) => values.indexOf(value) === index);
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
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const match = part.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
      if (!match) return [];
      const year = match[3].length === 2 ? Number(match[3]) + (Number(match[3]) >= 60 ? 1900 : 2000) : Number(match[3]);
      return [`${String(year).padStart(4, "0")}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`];
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
  return (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function rederivePartition(trackerRoot: string): Promise<PartitionRow[]> {
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
  if (backlog.length !== 321) throw new Error(`Expected the exact 321-row backlog, got ${backlog.length}`);

  const pinnedSha = await fileSha256(pinnedPath);
  if (pinnedSha !== CANDIDATE_SET_SHA256) {
    throw new Error(`Pinned candidate-set hash mismatch: ${pinnedSha}`);
  }
  const pinned = JSON.parse(await readFile(pinnedPath, "utf8")) as { candidateSetId: string; candidates: Array<Record<string, unknown>> };
  if (pinned.candidateSetId !== CANDIDATE_SET_ID) throw new Error(`Unexpected candidate set ${pinned.candidateSetId}`);
  const candidatesById = new Map(pinned.candidates.map((row) => [String(row.candidateId), row]));

  const reviewFiles = (await readdir(reviewInputsDir))
    .filter((name) => /^\d+-bus-lane-.*\.input\.json$/.test(name))
    .sort();
  const reviewById = new Map<string, { row: Record<string, unknown>; path: string; sha256: string }>();
  for (const name of reviewFiles) {
    const path = join(reviewInputsDir, name);
    const input = JSON.parse(await readFile(path, "utf8")) as { candidates: Array<Record<string, unknown>> };
    const inputSha = await fileSha256(path);
    for (const row of input.candidates) {
      reviewById.set(String(row.candidateId), { row, path, sha256: inputSha });
    }
  }

  const queens = backlog
    .filter((row) => /^(Q|QM)\d/.test(String(row.route_id)))
    .map((ledgerRow): PartitionRow => {
      const candidateId = String(ledgerRow.candidate_id);
      const candidate = candidatesById.get(candidateId);
      const review = reviewById.get(candidateId);
      if (!candidate) throw new Error(`Candidate ${candidateId} missing from pinned candidate set`);
      if (!review) throw new Error(`Candidate ${candidateId} missing from pinned review inputs`);
      const historical = (review.row.historicalContext ?? {}) as Record<string, unknown>;
      const rationale = String(historical.rationale ?? "");
      const routeId = String(ledgerRow.route_id);
      if (
        routeId !== candidate.routeId ||
        String(ledgerRow.implementation_date) !== candidate.implementationDate ||
        String(ledgerRow.identity) !== `${candidate.routeId}|${candidate.treatmentFamily}|${candidate.implementationDate}|${candidate.datePrecision}`
      ) {
        throw new Error(`Pinned identity mismatch for ${candidateId}`);
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

  if (queens.length !== 113) throw new Error(`Expected 113 Queens candidates, got ${queens.length}`);
  if (new Set(queens.map((row) => row.candidate_id)).size !== queens.length) throw new Error("Duplicate Queens candidate ids");
  if (new Set(queens.map((row) => row.route_id)).size !== queens.length) throw new Error("Queens route partition is not one row per route");
  for (const row of queens) {
    if (!CORRIDOR_RESEARCH[row.corridor]) throw new Error(`No research plan for corridor ${row.corridor}`);
  }

  await writeFile(PARTITION_PATH, jsonl(queens));
  const qCount = queens.filter((row) => /^Q\d/.test(row.route_id)).length;
  const qmCount = queens.filter((row) => /^QM\d/.test(row.route_id)).length;
  const proof = {
    schema_version: 1,
    shard: "queens",
    derived_on: RESEARCHED_ON,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    reconciliation_ledger_path: relative(REPO_ROOT, ledgerPath),
    reconciliation_ledger_sha256: await fileSha256(ledgerPath),
    exact_backlog_count: backlog.length,
    queens_count: queens.length,
    q_route_count: qCount,
    qm_route_count: qmCount,
    unique_candidate_count: new Set(queens.map((row) => row.candidate_id)).size,
    unique_route_count: new Set(queens.map((row) => row.route_id)).size,
    candidate_ids_sha256: sha256(`${queens.map((row) => row.candidate_id).join("\n")}\n`),
    partition_sha256: sha256(jsonl(queens)),
    exclusive_partition_rule:
      "exclusive_primary_disposition=mta_route_or_treatment_scope_binding_gap AND treatment_family=bus_lane AND route_id starts Q or QM",
  };
  await writeStableJson(PARTITION_PROOF_PATH, proof);
  return queens;
}

async function fetchSource(source: (typeof OFFICIAL_SOURCES)[number]): Promise<{ source: AcquiredSource; bytes: Uint8Array | null }> {
  const curlFallback = async (httpStatus: number | null): Promise<{ source: AcquiredSource; bytes: Uint8Array | null } | null> => {
    const process = Bun.spawn(["curl", "-fsSL", source.url], { stdout: "pipe", stderr: "ignore" });
    const bytes = new Uint8Array(await new Response(process.stdout).arrayBuffer());
    if ((await process.exited) !== 0 || bytes.byteLength === 0) return null;
    return {
      source: {
        ...source,
        retrieval_status: "acquired",
        retrieved_on: RESEARCHED_ON,
        http_status: 200,
        media_type: source.url.includes("/document/") || source.url.endsWith(".pdf") ? "application/pdf" : null,
        content_sha256: sha256(bytes),
        byte_length: bytes.byteLength,
        raw_content_retained: false,
        note: `${source.note} curl fallback used after fetch status ${httpStatus ?? "unavailable"}.`,
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
          ...source,
          retrieval_status: "not_retrieved",
          retrieved_on: RESEARCHED_ON,
          http_status: response.status,
          media_type: response.headers.get("content-type"),
          content_sha256: null,
          byte_length: null,
          raw_content_retained: false,
        },
        bytes: null,
      };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      source: {
        ...source,
        retrieval_status: "acquired",
        retrieved_on: RESEARCHED_ON,
        http_status: response.status,
        media_type: response.headers.get("content-type"),
        content_sha256: sha256(bytes),
        byte_length: bytes.byteLength,
        raw_content_retained: false,
      },
      bytes,
    };
  } catch {
    const fallback = await curlFallback(null);
    if (fallback) return fallback;
    return {
      source: {
        ...source,
        retrieval_status: "not_retrieved",
        retrieved_on: RESEARCHED_ON,
        http_status: null,
        media_type: null,
        content_sha256: null,
        byte_length: null,
        raw_content_retained: false,
      },
      bytes: null,
    };
  }
}

async function fetchRoutePage(row: PartitionRow): Promise<RoutePageCheck> {
  const queryRoute = busTimeRouteId(row.route_id);
  const url = `https://bustime-classic.mta.info/m/?q=${encodeURIComponent(queryRoute)}`;
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
    const corridorTokens = corridorFacilities(row.corridor).map(normalizeFacility);
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
      exact_route_title_found: title?.toUpperCase().includes(`ROUTE ${queryRoute}`) ?? false,
      corridor_token_found: corridorTokens.some((token) => text.includes(token)),
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
  const acquired = await Promise.all(OFFICIAL_SOURCES.map(fetchSource));
  const sourceChecks = acquired.map((result) => result.source).sort((left, right) => left.id.localeCompare(right.id));
  const dotCapture = acquired.find((result) => result.source.id === "dot_bus_lanes_snapshot");
  if (!dotCapture?.bytes || dotCapture.source.content_sha256 === null) throw new Error("NYC DOT bus-lane snapshot could not be acquired");
  const laneRows = JSON.parse(new TextDecoder().decode(dotCapture.bytes)) as Array<Record<string, unknown>>;
  const evidence: LaneEvidenceRow[] = [];
  for (const candidate of partition) {
    const facilities = corridorFacilities(candidate.corridor).map(normalizeFacility);
    const matches = laneRows.filter((row) => {
      const facility = typeof row.facility === "string" ? normalizeFacility(row.facility) : "";
      const openDates = typeof row.open_dates === "string" ? parseOpenDate(row.open_dates) : [];
      return facilities.includes(facility) && openDates.includes(candidate.implementation_date);
    });
    if (matches.length === 0) throw new Error(`No official lane rows matched ${candidate.candidate_id} ${candidate.corridor}`);
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
  await writeFile(LANE_EVIDENCE_PATH, jsonl(evidence));

  const routePages: RoutePageCheck[] = [];
  for (let index = 0; index < partition.length; index += 8) {
    routePages.push(...(await Promise.all(partition.slice(index, index + 8).map(fetchRoutePage))));
  }
  routePages.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  await writeStableJson(SOURCE_CHECKS_PATH, {
    schema_version: 1,
    shard: "queens",
    acquired_on: RESEARCHED_ON,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    web_search_method:
      "Official-domain web searches were performed by corridor groups on 2026-07-15; exact query strings are repeated in each receipt. Retrieved official result URLs were then byte-fetched where possible.",
    sources: sourceChecks,
    route_pages: routePages,
  });
}

function sourceRefs(ids: string[], sourcesById: Map<string, AcquiredSource>): AcquiredSource[] {
  return ids.map((id) => {
    const source = sourcesById.get(id);
    if (!source) throw new Error(`Missing acquired source ${id}`);
    return source;
  });
}

async function generate(): Promise<void> {
  const partition = await readJsonl<PartitionRow>(PARTITION_PATH);
  const evidence = await readJsonl<LaneEvidenceRow>(LANE_EVIDENCE_PATH);
  const checks = JSON.parse(await readFile(SOURCE_CHECKS_PATH, "utf8")) as {
    sources: AcquiredSource[];
    route_pages: RoutePageCheck[];
  };
  const linkagePayload = JSON.parse(await readFile(LINKAGE_ACTIONS_PATH, "utf8")) as {
    schema_version: number;
    run_id: string;
    candidates: LinkageCandidateAction[];
  };
  if (linkagePayload.schema_version !== 1) throw new Error(`Unsupported Queens linkage action schema ${linkagePayload.schema_version}`);
  const linkageByCandidate = new Map(linkagePayload.candidates.map((action) => [action.candidate_id, action]));
  if (linkageByCandidate.size !== linkagePayload.candidates.length) throw new Error("Duplicate Queens linkage candidate action");
  const sourcesById = new Map(checks.sources.map((source) => [source.id, source]));
  const routePageByCandidate = new Map(checks.route_pages.map((source) => [source.candidate_id, source]));
  const evidenceByCandidate = new Map<string, LaneEvidenceRow[]>();
  for (const row of evidence) evidenceByCandidate.set(row.candidate_id, [...(evidenceByCandidate.get(row.candidate_id) ?? []), row]);

  const receipts = partition.map((candidate) => {
    const research = CORRIDOR_RESEARCH[candidate.corridor];
    const laneEvidence = evidenceByCandidate.get(candidate.candidate_id) ?? [];
    const routePage = routePageByCandidate.get(candidate.candidate_id);
    if (!routePage) throw new Error(`Missing route-page check for ${candidate.candidate_id}`);
    const datasetRouteRows = laneEvidence.filter((row) => row.official_routes.includes(candidate.normalized_route_id));
    const projectRouteSupported = research.exact_project_routes.map(normalizeRouteId).includes(candidate.normalized_route_id);
    const routeBindingSupported = datasetRouteRows.length > 0 || projectRouteSupported;
    const linkageAction = linkageByCandidate.get(candidate.candidate_id);
    if (linkageAction && !routeBindingSupported) {
      throw new Error(`Canonical linkage action lacks authoritative route-treatment support: ${candidate.candidate_id}`);
    }
    const officialRouteNamedSegmentIds = [
      ...new Set(
        datasetRouteRows
          .map((row) => row.segment_id)
          .filter((value): value is string => value !== null),
      ),
    ].sort();
    const exactProjectSource = projectRouteSupported && research.project_route_basis
      ? sourcesById.get(research.project_route_basis) ?? null
      : null;
    const evidenceBindings = [
      ...datasetRouteRows.map((row) => ({
        evidence_kind: "official_dot_lane_registry_row",
        source_id: "dot_bus_lanes_snapshot",
        source_sha256: row.source_snapshot_sha256,
        source_row_sha256: row.source_row_sha256,
        segment_id: row.segment_id,
        official_routes: row.official_routes,
        open_dates: row.open_dates,
      })),
      ...(exactProjectSource
        ? [{
            evidence_kind: "official_project_route_statement",
            source_id: exactProjectSource.id,
            source_sha256: exactProjectSource.content_sha256,
            source_row_sha256: null,
            segment_id: null,
            official_routes: research.exact_project_routes,
            open_dates: null,
          }]
        : []),
    ];
    const officialRoutes = [...new Set(laneEvidence.flatMap((row) => row.official_routes))].sort();
    const checkedCorridorSources = sourceRefs(research.source_ids, sourcesById);
    const acquiredForCandidate = checkedCorridorSources.some((source) => source.retrieval_status === "acquired") && routePage.retrieval_status === "acquired";
    const exclusiveDisposition = routeBindingSupported
      ? "linkage_supported_phase_unresolved"
      : "completed_search_route_linkage_unresolved";

    const receiptCore = {
      schema_version: 1,
      campaign: "canonical-relationship-integrity-v1",
      shard: "queens",
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
          query: research.web_query,
          query_status: "performed_2026-07-15",
          urls_checked: checkedCorridorSources
            .filter((source) => source.category === "dot_lane_project" || source.id === "dot_bus_lanes_snapshot")
            .map((source) => source.url),
          retrievals: checkedCorridorSources
            .filter((source) => source.category === "dot_lane_project" || source.id === "dot_bus_lanes_snapshot")
            .map((source) => ({
              id: source.id,
              status: source.retrieval_status,
              retrieved_on: source.retrieved_on,
              sha256: source.content_sha256,
            })),
        },
        {
          category: "official_mta_route_project",
          query: `site:mta.info \"${candidate.route_id}\" \"${candidate.corridor}\" bus route project`,
          query_status: "performed_by_official_route_fetch_and_project_document_search_2026-07-15",
          urls_checked: [routePage.url, sourcesById.get("mta_qbnr_addendum")!.url],
          retrievals: [
            {
              id: `mta_bustime_${candidate.route_id}`,
              status: routePage.retrieval_status,
              retrieved_on: routePage.retrieved_on,
              sha256: routePage.content_sha256,
            },
            {
              id: "mta_qbnr_addendum",
              status: sourcesById.get("mta_qbnr_addendum")!.retrieval_status,
              retrieved_on: sourcesById.get("mta_qbnr_addendum")!.retrieved_on,
              sha256: sourcesById.get("mta_qbnr_addendum")!.content_sha256,
            },
          ],
        },
        {
          category: "official_public_board_committee",
          query: `${research.web_query} community board committee MTA Board`,
          query_status: "performed_2026-07-15",
          urls_checked: [
            sourcesById.get("mta_board_staff_summary")!.url,
            ...checkedCorridorSources.filter((source) => source.category === "board_committee").map((source) => source.url),
          ],
          retrievals: [
            sourcesById.get("mta_board_staff_summary")!,
            ...checkedCorridorSources.filter((source) => source.category === "board_committee"),
          ].map((source) => ({
            id: source.id,
            status: source.retrieval_status,
            retrieved_on: source.retrieved_on,
            sha256: source.content_sha256,
          })),
        },
        {
          category: "other_repository_approved_primary",
          query: `NYC DOT Open Data ycrg-ses3 facility=${candidate.corridor} open_dates contains ${candidate.implementation_date}`,
          query_status: "executed_against_acquired_snapshot_2026-07-15",
          urls_checked: [sourcesById.get("dot_bus_lanes_metadata")!.url, sourcesById.get("dot_datafeeds")!.url],
          retrievals: [sourcesById.get("dot_bus_lanes_metadata")!, sourcesById.get("dot_datafeeds")!].map((source) => ({
            id: source.id,
            status: source.retrieval_status,
            retrieved_on: source.retrieved_on,
            sha256: source.content_sha256,
          })),
        },
      ],
      source_findings: {
        acquired_for_candidate: acquiredForCandidate,
        official_lane_matching_record_count: laneEvidence.length,
        official_lane_matching_segment_ids: [...new Set(laneEvidence.map((row) => row.segment_id).filter(Boolean))].sort(),
        official_lane_named_routes: officialRoutes,
        candidate_named_lane_record_count: datasetRouteRows.length,
        mta_route_page: {
          retrieval_status: routePage.retrieval_status,
          content_sha256: routePage.content_sha256,
          exact_route_title_found: routePage.exact_route_title_found,
          current_corridor_token_found: routePage.corridor_token_found,
          temporal_limitation:
            "The live route page was captured in 2026 and is not treated as proof that the route used the exact segment on the candidate implementation date.",
        },
        exact_project_route_statement_found: projectRouteSupported,
        exact_project_route_source_id: exactProjectSource?.id ?? null,
        official_route_named_segment_ids: officialRouteNamedSegmentIds,
        segment_identity_limitation:
          "These are segment identifiers in the current official DOT snapshot whose rows name the route. The pinned candidate and reconciliation artifacts do not retain the historical matched-segment identifiers, and their recorded match counts differ from the current route-named rows; these identifiers therefore are not promoted as the exact candidate segment binding.",
        historical_review_rationale: candidate.historical_review_rationale,
      },
      claim_results: {
        physical_bus_lane_record_acquired: laneEvidence.length > 0,
        exact_route_treatment_binding_proved: routeBindingSupported,
        exact_route_binding_evidence: evidenceBindings,
        exact_segment_binding_proved: false,
        exact_segment_ids: [],
        candidate_segment_ids_pinned: false,
        candidate_date_supported_at_day_precision: routeBindingSupported && laneEvidence.length > 0,
        explicit_phase_identity_proved: false,
        date_and_phase_proved: false,
        operational_occurrence_identity_proved: false,
        unsupported_claims: [
          ...(!routeBindingSupported
            ? ["No acquired authoritative source binds this candidate route to the dated lane treatment at the claimed precision."]
            : []),
          "The pinned candidate and reconciliation artifacts do not retain exact historical matched-segment identifiers; current route-named DOT rows cannot be substituted for that missing provenance.",
          "No acquired source assigns a stable canonical phase identity and distinguishes initial onset from extension or redesign.",
          "The registry projection is not a canonical MTA Wiki operational occurrence.",
          "Geometry, stop proximity, and street-name similarity were not promoted to authoritative evidence.",
        ],
      },
      canonical_actions: {
        canonical_links_added: linkageAction?.canonical_links_added ?? [],
        canonical_records_added: linkageAction?.canonical_records_added ?? [],
        canonical_records_updated: linkageAction?.canonical_records_updated ?? [],
        staged_source_ids: linkageAction?.staged_source_ids ?? [],
        journal_path: linkageAction
          ? "data/submissions/2026-07-15T18-00-00-000Z_queens-acquisition-linkage-remediation.jsonl"
          : null,
        operational_occurrence_added_or_updated: false,
        reason: linkageAction
          ? "Evidence-backed generic project, treatment, route, and corridor links were submitted through the accepted deterministic journal. Candidate phase, exact historical segment identity, and canonical operational-occurrence identity remain unresolved."
          : "The completed acquisition search did not support a canonical linkage correction. Phase and occurrence identity remain unresolved.",
      },
      outcome: {
        exclusive_primary_disposition: exclusiveDisposition,
        registry_projection_excluded: true,
        exclusion_reason: routeBindingSupported
          ? "Authoritative route-treatment evidence was acquired, but the registry event still lacks a stable phase and canonical operational-occurrence identity."
          : "The completed official-source search did not prove an exact route-treatment binding; the registry row remains a proximity-derived, non-projectable projection.",
        study_projection_eligible: false,
        still_unresolved: true,
        next_action: linkageAction
          ? "Materialize the accepted linkage journal centrally, then resolve candidate phase identity, onset precision, and exact historical segment provenance before reconsidering projection."
          : routeBindingSupported
          ? "Stage any newly acquired source through normal intake, resolve canonical phase identity and onset precision, then submit relationships through the established correction path before reconsidering projection."
          : "Retain this completed receipt and exclusion; reconsider only if a later authoritative source explicitly binds the route, treatment, physical scope, date, and phase.",
      },
    };
    return { receipt_id: `queens-acquisition:${sha256(stableJson(receiptCore)).slice(0, 24)}`, ...receiptCore };
  });
  receipts.sort((left, right) => left.candidate.candidate_id.localeCompare(right.candidate.candidate_id));
  const receiptCandidateIds = new Set(receipts.map((receipt) => receipt.candidate.candidate_id));
  for (const candidateId of linkageByCandidate.keys()) {
    if (!receiptCandidateIds.has(candidateId)) throw new Error(`Queens linkage action is outside the pinned partition: ${candidateId}`);
  }
  await writeFile(RECEIPTS_PATH, jsonl(receipts));

  const exclusions = receipts.map((receipt) => ({
    schema_version: 1,
    candidate_id: receipt.candidate.candidate_id,
    candidate_set_id: CANDIDATE_SET_ID,
    identity: receipt.candidate.identity,
    shard: "queens",
    excluded_from: "mta_wiki_operational_occurrence_projection",
    exclusion_rule: "relationship-contract-v1:registry-only-bus-lane-requires-authoritative-route-treatment-phase-occurrence-evidence",
    reason: receipt.outcome.exclusion_reason,
    exact_route_treatment_binding_proved: receipt.claim_results.exact_route_treatment_binding_proved,
    phase_identity_proved: false,
    study_projection_eligible: false,
    receipt_id: receipt.receipt_id,
  }));
  await writeFile(EXCLUSIONS_PATH, jsonl(exclusions));

  const routeBound = receipts.filter((receipt) => receipt.claim_results.exact_route_treatment_binding_proved);
  const segmentBound = receipts.filter((receipt) => receipt.claim_results.exact_segment_binding_proved);
  const summary = {
    schema_version: 1,
    shard: "queens",
    researched_on: RESEARCHED_ON,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    researched_count: receipts.length,
    source_acquired_count: receipts.filter((receipt) => receipt.source_findings.acquired_for_candidate).length,
    exact_route_binding_proved_count: routeBound.length,
    exact_route_binding_proved_candidate_ids: routeBound.map((receipt) => receipt.candidate.candidate_id),
    segment_binding_proved_count: segmentBound.length,
    segment_binding_proved_candidate_ids: segmentBound.map((receipt) => receipt.candidate.candidate_id),
    date_and_phase_proved_count: receipts.filter((receipt) => receipt.claim_results.date_and_phase_proved).length,
    operational_occurrence_added_or_updated_count: receipts.filter(
      (receipt) => receipt.canonical_actions.operational_occurrence_added_or_updated,
    ).length,
    canonical_linkage_remediated_count: receipts.filter((receipt) => receipt.canonical_actions.canonical_links_added.length > 0).length,
    canonical_links_added_count: new Set(receipts.flatMap((receipt) => receipt.canonical_actions.canonical_links_added)).size,
    explicitly_excluded_count: receipts.filter((receipt) => receipt.outcome.registry_projection_excluded).length,
    still_unresolved_count: receipts.filter((receipt) => receipt.outcome.still_unresolved).length,
    study_projection_eligible_count: receipts.filter((receipt) => receipt.outcome.study_projection_eligible).length,
    exclusive_primary_disposition_counts: Object.fromEntries(
      [...new Set(receipts.map((receipt) => receipt.outcome.exclusive_primary_disposition))]
        .sort()
        .map((disposition) => [disposition, receipts.filter((receipt) => receipt.outcome.exclusive_primary_disposition === disposition).length]),
    ),
    route_prefix_counts: {
      Q: receipts.filter((receipt) => /^Q\d/.test(receipt.candidate.route_id)).length,
      QM: receipts.filter((receipt) => /^QM\d/.test(receipt.candidate.route_id)).length,
    },
    receipts_sha256: sha256(jsonl(receipts)),
    exclusions_sha256: sha256(jsonl(exclusions)),
    warning:
      "A supported route-treatment linkage is not a projectable occurrence. All Queens rows remain excluded because stable phase and canonical occurrence identity were not proved.",
  };
  await writeStableJson(SUMMARY_PATH, summary);

  const report = `# Queens registry-only bus-lane acquisition shard\n\n` +
    `- Pinned candidate set: \`${CANDIDATE_SET_ID}\` (\`${CANDIDATE_SET_SHA256}\`)\n` +
    `- Deterministic partition: **${receipts.length}** candidates (**${summary.route_prefix_counts.Q} Q**, **${summary.route_prefix_counts.QM} QM**)\n` +
    `- Researched: **${summary.researched_count}**\n` +
    `- Official source acquired for every candidate: **${summary.source_acquired_count}**\n` +
    `- Exact route-treatment binding proved: **${summary.exact_route_binding_proved_count}**\n` +
    `- Exact DOT segment binding proved: **${summary.segment_binding_proved_count}**\n` +
    `- Date and explicit phase both proved: **${summary.date_and_phase_proved_count}**\n` +
    `- Operational occurrence added or updated: **${summary.operational_occurrence_added_or_updated_count}**\n` +
    `- Candidates with evidence-backed canonical linkage remediation: **${summary.canonical_linkage_remediated_count}**\n` +
    `- Unique canonical relationships submitted: **${summary.canonical_links_added_count}**\n` +
    `- Registry projections explicitly excluded: **${summary.explicitly_excluded_count}**\n` +
    `- Still unresolved for study projection: **${summary.still_unresolved_count}**\n\n` +
    `Every receipt records four acquisition channels: NYC DOT lane/project material, MTA route/project material, public board/committee material, and another official primary-data check. Route proximity and street-name similarity are never treated as authoritative. Even where an official project or lane row names the route, no Queens row is projected because the search did not establish a stable canonical phase identity and operational occurrence.\n\n` +
    `## Reproduce\n\n` +
    `\`\`\`bash\n` +
    `bun data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/acquire.ts --verify-partition --tracker-root ${DEFAULT_TRACKER_ROOT}\n` +
    `bun test data/quality/relationship-integrity/bus-lane-acquisition/shards/queens/acquire.test.ts\n` +
    `\`\`\`\n`;
  await writeFile(REPORT_PATH, report);

  const artifactPaths = [
    PARTITION_PATH,
    PARTITION_PROOF_PATH,
    SOURCE_CHECKS_PATH,
    LANE_EVIDENCE_PATH,
    RECEIPTS_PATH,
    EXCLUSIONS_PATH,
    SUMMARY_PATH,
    REPORT_PATH,
  ];
  const artifacts = [];
  for (const path of artifactPaths) {
    artifacts.push({ path: basename(path), sha256: await fileSha256(path), bytes: (await readFile(path)).byteLength });
  }
  await writeStableJson(MANIFEST_PATH, {
    schema_version: 1,
    shard: "queens",
    generated_on: RESEARCHED_ON,
    candidate_set_id: CANDIDATE_SET_ID,
    candidate_set_sha256: CANDIDATE_SET_SHA256,
    artifacts,
    manifest_payload_sha256: sha256(stableJson(artifacts)),
  });
}

async function main(): Promise<void> {
  await mkdir(SHARD_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const trackerIndex = args.indexOf("--tracker-root");
  const trackerRoot = trackerIndex >= 0 ? resolve(args[trackerIndex + 1] ?? "") : DEFAULT_TRACKER_ROOT;
  if (args.includes("--acquire")) {
    const partition = await rederivePartition(trackerRoot);
    await acquire(partition);
    await generate();
    return;
  }
  if (args.includes("--verify-partition")) {
    const before = await readFile(PARTITION_PATH, "utf8").catch(() => null);
    const partition = await rederivePartition(trackerRoot);
    const after = jsonl(partition);
    if (before !== null && before !== after) throw new Error("Rederived Queens partition differs from checked artifact");
    if (!args.includes("--generate")) return;
  }
  await generate();
}

await main();
