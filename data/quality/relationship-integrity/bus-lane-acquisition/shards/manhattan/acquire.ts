import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const DIR = import.meta.dir;
const ROOT = resolve(DIR, "../../../../../..");
const DATE = "2026-07-15";
const SET_ID = "candidate-set-v2:24080902f508b55a0033df32";
const SET_SHA = "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba";
const DEFAULT_TRACKER = "/home/cjpher/.codex/worktrees/61db/bus-reliability-tracker";

const OUT = {
  partition: join(DIR, "partition.jsonl"),
  proof: join(DIR, "partition-proof.json"),
  checks: join(DIR, "acquired-source-checks.json"),
  lanes: join(DIR, "official-lane-evidence.jsonl"),
  receipts: join(DIR, "receipts.jsonl"),
  exclusions: join(DIR, "registry-projection-exclusions.jsonl"),
  summary: join(DIR, "summary.json"),
  report: join(DIR, "report.md"),
  manifest: join(DIR, "manifest.json"),
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Partition = {
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
type Category = "dot_lane_project" | "mta_route_project" | "board_committee" | "other_primary";
type SourcePlan = { id: string; category: Category; url: string; note: string };
type SourceCheck = SourcePlan & {
  retrieval_status: "acquired" | "not_retrieved";
  retrieved_on: string;
  http_status: number | null;
  media_type: string | null;
  content_sha256: string | null;
  byte_length: number | null;
  raw_content_retained: false;
};
type RouteCheck = {
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
type Lane = {
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
  { id: "dot_bus_lanes_snapshot", category: "dot_lane_project", url: "https://data.cityofnewyork.us/resource/ycrg-ses3.json?$limit=5000", note: "Authoritative NYC DOT Bus Lanes - Local Streets API snapshot; selected non-geometry rows are retained separately." },
  { id: "dot_bus_lanes_metadata", category: "other_primary", url: "https://data.cityofnewyork.us/api/views/ycrg-ses3", note: "Official NYC Open Data metadata for ycrg-ses3." },
  { id: "dot_datafeeds", category: "other_primary", url: "https://www.nyc.gov/html/dot/html/about/datafeeds.shtml", note: "Official NYC DOT data catalog linking the bus-lane dataset." },
  { id: "mta_manhattan_bus_service", category: "mta_route_project", url: "https://www.mta.info/document/8331", note: "Official MTA Manhattan bus service guide, checked only for route geography and identity, not historical onset." },
  { id: "dot_current_projects", category: "board_committee", url: "https://www.nyc.gov/html/dot/html/about/current-projects.shtml", note: "Official NYC DOT project index linking current Manhattan community-board proposals." },
  { id: "dot_projects_2019", category: "board_committee", url: "https://www.nyc.gov/html/dot/html/about/projects-2019.shtml", note: "Official NYC DOT project index linking 42nd Street community-board presentations." },
  { id: "dot_projects_2021", category: "board_committee", url: "https://www.nyc.gov/html/dot/html/about/projects-2021.shtml", note: "Official NYC DOT project index checked for 2021 Manhattan projects." },
  { id: "dot_projects_2023", category: "board_committee", url: "https://www.nyc.gov/html/dot/html/about/projects-2023.shtml", note: "Official NYC DOT project index linking Third Avenue board material." },
  { id: "dot_projects_2024", category: "board_committee", url: "https://www.nyc.gov/html/dot/html/about/projects-2024.shtml", note: "Official NYC DOT project index linking 96th Street, Allen/Pike/Madison, and Second Avenue board material." },
  { id: "dot_projects_2025", category: "board_committee", url: "https://www.nyc.gov/html/dot/html/about/projects-2025.shtml", note: "Official NYC DOT project index checked for 2025 Manhattan projects." },
  { id: "third_avenue_completion", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/html/pr2023/completion-safety-project-third-ave.shtml", note: "Official completion release names M98, M101, M102, and M103 as routes served by the Third Avenue bus lane." },
  { id: "third_avenue_midtown_proposal", category: "board_committee", url: "https://www.nyc.gov/html/dot/downloads/pdf/3rd-ave-24-st-59-st-jun2025.pdf", note: "Official Manhattan CB6 proposal identifies M101, M102, and M103 on the East 24th-to-59th Street Third Avenue extension." },
  { id: "third_avenue_upper_proposal", category: "board_committee", url: "https://www.nyc.gov/html/dot/downloads/pdf/3rd-ave-96-st-128-st-jan2025.pdf", note: "Official Manhattan CB11 proposal identifies M98, M101, M102, and M103 on the proposed East 96th-to-128th Street bus-lane extent." },
  { id: "second_avenue_press", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/html/pr2024/redesign-manhattan-second-ave.shtml", note: "Official Second Avenue redesign release identifies the upgraded bus lane and M15 local/SBS service." },
  { id: "second_avenue_cb6", category: "board_committee", url: "https://www.nyc.gov/html/dot/downloads/pdf/2nd-ave-e59-st-houston-st-mar2024.pdf", note: "Official Manhattan CB6 presentation identifies the M15 SBS with the Second Avenue lane treatment." },
  { id: "m60_2015_extension_press", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/html/pr2016/pr16-010.shtml", note: "Official release identifies additional 125th Street lanes installed in fall 2015 on the M60 SBS route." },
  { id: "m60_cb9", category: "board_committee", url: "https://www.nyc.gov/html/brt/downloads/pdf/2013-06-05-sbs-125th-cb9.pdf", note: "Official Manhattan CB9 presentation documents the M60 SBS and dedicated bus lanes on 125th Street." },
  { id: "battery_place_press", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/html/pr2021/pr21-020.shtml", note: "Official Battery Place completion release; it does not name M20 or M55." },
  { id: "battery_place_board", category: "board_committee", url: "https://www.nyc.gov/html/dot/downloads/pdf/battery-pl-broadway-west-st-whh.pdf", note: "Official Battery Place project flyer with physical extent and treatment, but no M20/M55 binding." },
  { id: "ninety_sixth_press", category: "dot_lane_project", url: "https://www.nyc.gov/html/dot/html/pr2024/major-redesign-of-96th-st-manhattan.shtml", note: "Official completion release names M96 and M106, not the shard candidates spatially associated with 96th Street." },
  { id: "allen_pike_cb3", category: "board_committee", url: "https://www.nyc.gov/html/dot/downloads/pdf/allen-pike-madison-sts-jun2024.pdf", note: "Official Manhattan CB3 presentation identifies M15 local/SBS, not candidate M22." },
  { id: "forty_second_cb4", category: "board_committee", url: "https://www.nyc.gov/html/dot/downloads/pdf/42nd-st-cb4-jun192019.pdf", note: "Official Manhattan CB4 presentation for 42nd Street transit improvements; it does not support M12 as the treated route." },
];

type Research = {
  query: string;
  sources: string[];
  exact_routes: string[];
  route_basis: string | null;
  locator: string | null;
  supported_claim: string | null;
  existing_links: Record<string, string[]>;
};
const COMMON = ["dot_bus_lanes_snapshot"];
const RESEARCH: Record<string, Research> = {
  "3rd Avenue": { query: "site:nyc.gov/html/dot 3rd Avenue Manhattan bus lane M101 M102 M103 2025 community board official", sources: [...COMMON, "third_avenue_completion", "third_avenue_midtown_proposal", "dot_projects_2023", "dot_projects_2025"], exact_routes: ["M101", "M102", "M103"], route_basis: "third_avenue_midtown_proposal", locator: "PDF pages 4 and 12, existing bus service and proposed Third Avenue extent", supported_claim: "The CB6 proposal identifies M101, M102, and M103 service along the East 24th-to-59th Street Third Avenue extension.", existing_links: {} },
  "3 Avenue": { query: "site:nyc.gov/html/dot 3 Avenue East 96th East 128th bus lane M98 M101 M102 M103 official", sources: [...COMMON, "dot_current_projects", "third_avenue_upper_proposal", "third_avenue_completion"], exact_routes: ["M98", "M101", "M102", "M103"], route_basis: "third_avenue_upper_proposal", locator: "PDF pages 4 and 27", supported_claim: "The CB11 proposal identifies M98, M101, M102, and M103 on the East 96th-to-128th Street project extent.", existing_links: {} },
  "2nd Avenue": { query: "site:nyc.gov/html/dot 2nd Avenue Manhattan bus lane M15 SBS 2024 2025 official", sources: [...COMMON, "second_avenue_press", "second_avenue_cb6", "dot_projects_2024"], exact_routes: ["M15+"], route_basis: "second_avenue_cb6", locator: "PDF route and bus-speed sections", supported_claim: "The official proposal identifies M15 SBS with the Second Avenue bus-lane upgrade.", existing_links: { "M15+": ["relation_m15-sbs-on-second-ave", "relation_project-serves-route-m15-sbs"] } },
  "125th Street": { query: "site:nyc.gov/html/dot 125th Street M60 SBS bus lane extension fall 2015 official", sources: [...COMMON, "m60_2015_extension_press", "m60_cb9"], exact_routes: ["M60+"], route_basis: "m60_2015_extension_press", locator: "Press release paragraph describing fall 2015 added lanes", supported_claim: "NYC DOT identifies additional 125th Street lanes installed in fall 2015 on the M60 SBS route.", existing_links: { "M60+": ["relation_2015-06-09-125th-cb10-project-serves-route", "relation_2015-06-09-125th-cb10-route-on-corridor"] } },
  "96th Street": { query: "site:nyc.gov/html/dot 96th Street Manhattan bus lane M96 M106 community board 2024 official", sources: [...COMMON, "ninety_sixth_press", "dot_projects_2024"], exact_routes: [], route_basis: null, locator: null, supported_claim: null, existing_links: {} },
  "Fredrick Douglass Boulevard": { query: "site:nyc.gov/html/dot Frederick Douglass Boulevard bus lane M10 December 2024 official", sources: [...COMMON, "dot_projects_2024"], exact_routes: [], route_basis: null, locator: null, supported_claim: null, existing_links: {} },
  "42nd Street": { query: "site:nyc.gov/html/dot 42nd Street Transit Improvements bus lane M42 M12 2019 official", sources: [...COMMON, "forty_second_cb4", "dot_projects_2019"], exact_routes: [], route_basis: null, locator: null, supported_claim: null, existing_links: {} },
  "Battery Pl": { query: "site:nyc.gov/html/dot Battery Place bus lane M20 M55 June 2021 official", sources: [...COMMON, "battery_place_press", "battery_place_board", "dot_projects_2021"], exact_routes: [], route_basis: null, locator: null, supported_claim: null, existing_links: {} },
  "Allen Street/Pike Street": { query: "site:nyc.gov/html/dot Allen Street Pike Street bus lane M22 M15 community board official", sources: [...COMMON, "allen_pike_cb3", "dot_projects_2024"], exact_routes: [], route_basis: null, locator: null, supported_claim: null, existing_links: {} },
  "W 178 Street": { query: "site:nyc.gov/html/dot West 178 Street bus lane M100 June 2021 official", sources: [...COMMON, "dot_projects_2021"], exact_routes: [], route_basis: null, locator: null, supported_claim: null, existing_links: {} },
};

function sortJson(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortJson(child)]));
  return value;
}
const stable = (value: unknown): string => JSON.stringify(sortJson(value as Json));
const sha = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const fileSha = async (path: string): Promise<string> => sha(await readFile(path));
const jsonl = (rows: unknown[]): string => `${rows.map(stable).join("\n")}\n`;
const writeJson = async (path: string, value: unknown): Promise<void> => writeFile(path, `${JSON.stringify(sortJson(value as Json), null, 2)}\n`);
async function readJsonl<T>(path: string): Promise<T[]> { return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T); }
const normalizeRoute = (route: string): string => route.toUpperCase().replace(/-SBS$/, "").replace(/\+$/, "");
const busTimeRoute = (route: string): string => route.endsWith("+") ? `${route.slice(0, -1)}-SBS` : route;

function inferCorridor(rationale: string): string {
  for (const pattern of [/Pinned (.+?) rows for \d{4}-\d{2}-\d{2}/, /'s (.+?) candidate (?:uses|is dated)/, /(?:\w+) (.+?) rows explicitly name/, /lane piece\(s\) on (.+?) selected by/]) {
    const match = rationale.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  throw new Error(`Could not infer corridor: ${rationale}`);
}
function normalizeFacility(value: string): string {
  return value.toLowerCase().replace(/\bavenue\b/g, "ave").replace(/\bboulevard\b/g, "blvd").replace(/\bstreet\b/g, "st").replace(/\s+/g, " ").trim();
}
function facilityNames(corridor: string): string[] {
  return [corridor, ...corridor.split(/\s*\/\s*/)].map((value) => value.trim()).filter((value, index, all) => value && all.indexOf(value) === index);
}
function dates(value: string): string[] {
  return value.split(",").map((part) => part.trim()).flatMap((part) => {
    const match = part.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!match) return [];
    const raw = Number(match[3]);
    const year = match[3].length === 2 ? raw + (raw >= 60 ? 1900 : 2000) : raw;
    return [`${String(year).padStart(4, "0")}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`];
  });
}
function rowRoutes(row: Record<string, unknown>): string[] {
  return [row.sbs_route1, row.sbs_route2, row.sbs_route3].filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => normalizeRoute(value)).sort();
}
function stripHtml(value: string): string { return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }

async function derivePartition(tracker: string): Promise<Partition[]> {
  const ledgerPath = join(ROOT, "data/quality/rc19-reject-reconciliation/rc19-reject-ledger.jsonl");
  const pinnedPath = join(tracker, "docs/research/artifacts/candidate-set-v2-24080902f508b55a0033df32.study-events.json");
  const inputsDir = join(tracker, "docs/research/reviews/rc19/inputs");
  const backlog = (await readJsonl<Record<string, unknown>>(ledgerPath)).filter((row) => row.exclusive_primary_disposition === "mta_route_or_treatment_scope_binding_gap" && row.treatment_family === "bus_lane");
  if (backlog.length !== 321) throw new Error(`Expected 321 backlog rows, got ${backlog.length}`);
  if (await fileSha(pinnedPath) !== SET_SHA) throw new Error("Pinned candidate set hash mismatch");
  const pinned = JSON.parse(await readFile(pinnedPath, "utf8")) as { candidateSetId: string; candidates: Array<Record<string, unknown>> };
  if (pinned.candidateSetId !== SET_ID) throw new Error(`Unexpected candidate set ${pinned.candidateSetId}`);
  const candidates = new Map(pinned.candidates.map((row) => [String(row.candidateId), row]));
  const reviews = new Map<string, { row: Record<string, unknown>; path: string; sha256: string }>();
  for (const name of (await readdir(inputsDir)).filter((name) => /^\d+-bus-lane-.*\.input\.json$/.test(name)).sort()) {
    const path = join(inputsDir, name);
    const input = JSON.parse(await readFile(path, "utf8")) as { candidates: Array<Record<string, unknown>> };
    const digest = await fileSha(path);
    for (const row of input.candidates) reviews.set(String(row.candidateId), { row, path, sha256: digest });
  }
  const rows = backlog.filter((row) => /^M\d/.test(String(row.route_id))).map((ledger): Partition => {
    const id = String(ledger.candidate_id);
    const candidate = candidates.get(id);
    const review = reviews.get(id);
    if (!candidate || !review) throw new Error(`Missing pinned candidate/review ${id}`);
    const route = String(ledger.route_id);
    if (route !== candidate.routeId || String(ledger.implementation_date) !== candidate.implementationDate || String(ledger.identity) !== `${candidate.routeId}|${candidate.treatmentFamily}|${candidate.implementationDate}|${candidate.datePrecision}`) throw new Error(`Pinned identity mismatch ${id}`);
    const rationale = String(((review.row.historicalContext ?? {}) as Record<string, unknown>).rationale ?? "");
    const provenance = (candidate.provenance as Array<Record<string, unknown>>)[0];
    return { candidate_id: id, identity: String(ledger.identity), route_id: route, normalized_route_id: normalizeRoute(route), implementation_date: String(ledger.implementation_date), implementation_month: String(candidate.implementationMonth), date_precision: String(ledger.date_precision), source_event_id: String(provenance.sourceEventId), corridor: inferCorridor(rationale), historical_review_rationale: rationale, ledger_row_sha256: sha(stable(ledger)), candidate_row_sha256: sha(stable(candidate)), review_input_path: relative(tracker, review.path), review_input_sha256: review.sha256 };
  }).sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  if (rows.length !== 42 || new Set(rows.map((row) => row.route_id)).size !== 42) throw new Error(`Expected 42 unique Manhattan routes, got ${rows.length}`);
  for (const row of rows) if (!RESEARCH[row.corridor]) throw new Error(`No plan for corridor ${row.corridor}`);
  await writeFile(OUT.partition, jsonl(rows));
  await writeJson(OUT.proof, { schema_version: 1, shard: "manhattan", derived_on: DATE, candidate_set_id: SET_ID, candidate_set_sha256: SET_SHA, reconciliation_ledger_path: relative(ROOT, ledgerPath), reconciliation_ledger_sha256: await fileSha(ledgerPath), exact_backlog_count: backlog.length, manhattan_count: rows.length, unique_candidate_count: new Set(rows.map((row) => row.candidate_id)).size, unique_route_count: new Set(rows.map((row) => row.route_id)).size, candidate_ids_sha256: sha(`${rows.map((row) => row.candidate_id).join("\n")}\n`), partition_sha256: sha(jsonl(rows)), exclusive_partition_rule: "exclusive_primary_disposition=mta_route_or_treatment_scope_binding_gap AND treatment_family=bus_lane AND route_id matches ^M[0-9] (QM excluded)" });
  return rows;
}

async function fetchSource(plan: SourcePlan): Promise<{ source: SourceCheck; bytes: Uint8Array | null }> {
  const check = (bytes: Uint8Array, status: number, type: string | null, suffix = ""): { source: SourceCheck; bytes: Uint8Array } => ({ source: { ...plan, retrieval_status: "acquired", retrieved_on: DATE, http_status: status, media_type: type, content_sha256: sha(bytes), byte_length: bytes.byteLength, raw_content_retained: false, note: `${plan.note}${suffix}` }, bytes });
  try {
    const response = await fetch(plan.url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36", accept: "*/*" } });
    if (response.ok) return check(new Uint8Array(await response.arrayBuffer()), response.status, response.headers.get("content-type"));
  } catch { /* curl fallback below */ }
  const process = Bun.spawn(["curl", "-fsSL", "-A", "Mozilla/5.0", plan.url], { stdout: "pipe", stderr: "ignore" });
  const bytes = new Uint8Array(await new Response(process.stdout).arrayBuffer());
  if ((await process.exited) === 0 && bytes.byteLength > 0) return check(bytes, 200, plan.url.endsWith(".pdf") || plan.url.includes("/document/") ? "application/pdf" : null, " curl fallback used.");
  return { source: { ...plan, retrieval_status: "not_retrieved", retrieved_on: DATE, http_status: null, media_type: null, content_sha256: null, byte_length: null, raw_content_retained: false }, bytes: null };
}

async function fetchRoute(candidate: Partition): Promise<RouteCheck> {
  const query = busTimeRoute(candidate.route_id);
  const url = `https://bustime-classic.mta.info/m/?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/136 Safari/537.36" } });
    if (!response.ok) throw new Error(String(response.status));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const html = new TextDecoder().decode(bytes);
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
    const text = normalizeFacility(stripHtml(html));
    return { candidate_id: candidate.candidate_id, route_id: candidate.route_id, query_route_id: query, corridor: candidate.corridor, url, retrieval_status: "acquired", retrieved_on: DATE, http_status: response.status, content_sha256: sha(bytes), byte_length: bytes.byteLength, exact_route_title_found: title?.toUpperCase().includes(`ROUTE ${query}`) ?? false, corridor_token_found: facilityNames(candidate.corridor).map(normalizeFacility).some((token) => text.includes(token)), title, raw_content_retained: false };
  } catch {
    return { candidate_id: candidate.candidate_id, route_id: candidate.route_id, query_route_id: query, corridor: candidate.corridor, url, retrieval_status: "not_retrieved", retrieved_on: DATE, http_status: null, content_sha256: null, byte_length: null, exact_route_title_found: false, corridor_token_found: false, title: null, raw_content_retained: false };
  }
}

async function acquire(partition: Partition[]): Promise<void> {
  const fetched = await Promise.all(SOURCES.map(fetchSource));
  const dot = fetched.find((row) => row.source.id === "dot_bus_lanes_snapshot");
  if (!dot?.bytes || !dot.source.content_sha256) throw new Error("Official DOT snapshot unavailable");
  const raw = JSON.parse(new TextDecoder().decode(dot.bytes)) as Array<Record<string, unknown>>;
  const lanes: Lane[] = [];
  for (const candidate of partition) {
    const facilities = facilityNames(candidate.corridor).map(normalizeFacility);
    const matches = raw.filter((row) => facilities.includes(normalizeFacility(String(row.facility ?? ""))) && dates(String(row.open_dates ?? "")).includes(candidate.implementation_date));
    if (matches.length === 0) throw new Error(`No official lane rows for ${candidate.candidate_id} ${candidate.corridor}`);
    for (const row of matches) {
      const retained = { segment_id: typeof row.segmentid === "string" ? row.segmentid : null, facility: typeof row.facility === "string" ? row.facility : null, street: typeof row.street === "string" ? row.street : null, boro: typeof row.boro === "string" ? row.boro : null, open_dates: typeof row.open_dates === "string" ? row.open_dates : null, official_sbs_routes: rowRoutes(row), lane_type: typeof row.lane_type === "string" ? row.lane_type : null, lane_description: typeof row.lane_type2 === "string" ? row.lane_type2 : null, facility_type: typeof row.lane_type1 === "string" ? row.lane_type1 : null, direction: typeof row.direction === "string" ? row.direction : null, hours: typeof row.hours === "string" ? row.hours : null, days: typeof row.days === "string" ? row.days : null };
      lanes.push({ candidate_id: candidate.candidate_id, source_snapshot_sha256: dot.source.content_sha256, source_row_sha256: sha(stable(retained)), ...retained });
    }
  }
  lanes.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id) || String(a.segment_id).localeCompare(String(b.segment_id)) || a.source_row_sha256.localeCompare(b.source_row_sha256));
  await writeFile(OUT.lanes, jsonl(lanes));
  const routes: RouteCheck[] = [];
  for (let index = 0; index < partition.length; index += 8) routes.push(...await Promise.all(partition.slice(index, index + 8).map(fetchRoute)));
  routes.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  await writeJson(OUT.checks, { schema_version: 1, shard: "manhattan", acquired_on: DATE, candidate_set_id: SET_ID, candidate_set_sha256: SET_SHA, web_search_method: "Official-domain searches were executed by corridor group on 2026-07-15. Every receipt preserves exact queries and official URLs; retrieved bytes are hashed and raw content is not retained in this shard.", sources: fetched.map((row) => row.source).sort((a, b) => a.id.localeCompare(b.id)), route_pages: routes });
}

async function generate(): Promise<void> {
  const partition = await readJsonl<Partition>(OUT.partition);
  const lanes = await readJsonl<Lane>(OUT.lanes);
  const checks = JSON.parse(await readFile(OUT.checks, "utf8")) as { sources: SourceCheck[]; route_pages: RouteCheck[] };
  const sources = new Map(checks.sources.map((row) => [row.id, row]));
  const routes = new Map(checks.route_pages.map((row) => [row.candidate_id, row]));
  const lanesByCandidate = new Map<string, Lane[]>();
  for (const row of lanes) lanesByCandidate.set(row.candidate_id, [...(lanesByCandidate.get(row.candidate_id) ?? []), row]);
  const source = (id: string): SourceCheck => { const found = sources.get(id); if (!found) throw new Error(`Missing source ${id}`); return found; };
  const receipts = partition.map((candidate) => {
    const research = RESEARCH[candidate.corridor];
    const evidence = lanesByCandidate.get(candidate.candidate_id) ?? [];
    const route = routes.get(candidate.candidate_id);
    if (!route) throw new Error(`Missing route check ${candidate.candidate_id}`);
    const datasetRows = candidate.route_id.endsWith("+") ? evidence.filter((row) => row.official_sbs_routes.includes(candidate.normalized_route_id)) : [];
    const projectBasis = research.route_basis ? source(research.route_basis) : null;
    const projectSupported = research.exact_routes.includes(candidate.route_id) && projectBasis?.retrieval_status === "acquired";
    const routeSupported = datasetRows.length > 0 || projectSupported;
    const checked = research.sources.map(source);
    const existingLinks = research.existing_links[candidate.route_id] ?? [];
    const intakeGap = routeSupported && existingLinks.length === 0;
    const bindings = [
      ...datasetRows.map((row) => ({ evidence_kind: "official_dot_lane_registry_row", source_id: "dot_bus_lanes_snapshot", source_sha256: row.source_snapshot_sha256, source_row_sha256: row.source_row_sha256, segment_id: row.segment_id, official_sbs_routes: row.official_sbs_routes, open_dates: row.open_dates, limitation: "The pinned candidate artifacts do not retain the historical matched segment identifiers, so the current segment id is not promoted as the candidate segment." })),
      ...(projectSupported && projectBasis ? [{ evidence_kind: "official_project_route_statement", source_id: projectBasis.id, source_sha256: projectBasis.content_sha256, source_row_sha256: null, segment_id: null, official_routes: research.exact_routes, open_dates: null, locator: research.locator, supported_claim: research.supported_claim }] : []),
    ];
    const core = {
      schema_version: 1, campaign: "canonical-relationship-integrity-v1", shard: "manhattan", researched_on: DATE,
      candidate: { candidate_id: candidate.candidate_id, candidate_set_id: SET_ID, candidate_set_sha256: SET_SHA, identity: candidate.identity, route_id: candidate.route_id, normalized_route_id: candidate.normalized_route_id, treatment_family: "bus_lane", implementation_date: candidate.implementation_date, implementation_month: candidate.implementation_month, date_precision: candidate.date_precision, source_event_id: candidate.source_event_id, registry_source_id: "nyc_dot_bus_lanes", corridor: candidate.corridor },
      partition_evidence: { ledger_row_sha256: candidate.ledger_row_sha256, candidate_row_sha256: candidate.candidate_row_sha256, review_input_path: candidate.review_input_path, review_input_sha256: candidate.review_input_sha256 },
      acquisition_attempts: [
        { category: "official_nyc_dot_lane_project", query: research.query, query_status: "performed_2026-07-15", urls_checked: checked.filter((row) => row.category === "dot_lane_project").map((row) => row.url), retrievals: checked.filter((row) => row.category === "dot_lane_project").map((row) => ({ id: row.id, status: row.retrieval_status, retrieved_on: row.retrieved_on, sha256: row.content_sha256 })) },
        { category: "official_mta_route_project", query: `site:mta.info \"${candidate.route_id}\" \"${candidate.corridor}\" bus route project`, query_status: "performed_by_official_route_fetch_and_service_guide_search_2026-07-15", urls_checked: [route.url, source("mta_manhattan_bus_service").url], retrievals: [{ id: `mta_bustime_${candidate.route_id}`, status: route.retrieval_status, retrieved_on: route.retrieved_on, sha256: route.content_sha256 }, { id: "mta_manhattan_bus_service", status: source("mta_manhattan_bus_service").retrieval_status, retrieved_on: source("mta_manhattan_bus_service").retrieved_on, sha256: source("mta_manhattan_bus_service").content_sha256 }] },
        { category: "official_public_board_committee", query: `${research.query} community board committee`, query_status: "performed_2026-07-15", urls_checked: checked.filter((row) => row.category === "board_committee").map((row) => row.url), retrievals: checked.filter((row) => row.category === "board_committee").map((row) => ({ id: row.id, status: row.retrieval_status, retrieved_on: row.retrieved_on, sha256: row.content_sha256 })) },
        { category: "other_repository_approved_primary", query: `NYC DOT Open Data ycrg-ses3 facility=${candidate.corridor} open_dates contains ${candidate.implementation_date}`, query_status: "executed_against_acquired_snapshot_2026-07-15", urls_checked: [source("dot_bus_lanes_metadata").url, source("dot_datafeeds").url], retrievals: [source("dot_bus_lanes_metadata"), source("dot_datafeeds")].map((row) => ({ id: row.id, status: row.retrieval_status, retrieved_on: row.retrieved_on, sha256: row.content_sha256 })) },
      ],
      source_findings: { acquired_for_candidate: checked.some((row) => row.retrieval_status === "acquired") && route.retrieval_status === "acquired", official_lane_matching_record_count: evidence.length, official_lane_matching_segment_ids: [...new Set(evidence.map((row) => row.segment_id).filter(Boolean))].sort(), official_lane_named_sbs_routes: [...new Set(evidence.flatMap((row) => row.official_sbs_routes))].sort(), candidate_named_lane_record_count: datasetRows.length, exact_project_route_statement_found: projectSupported, exact_project_route_source_id: projectSupported ? projectBasis?.id ?? null : null, exact_project_route_locator: projectSupported ? research.locator : null, exact_project_route_supported_claim: projectSupported ? research.supported_claim : null, mta_route_page: { retrieval_status: route.retrieval_status, content_sha256: route.content_sha256, exact_route_title_found: route.exact_route_title_found, current_corridor_token_found: route.corridor_token_found, temporal_limitation: "The live route page was captured in 2026 and is not treated as proof that the route used the candidate segment on the candidate date." }, historical_review_rationale: candidate.historical_review_rationale },
      claim_results: { physical_bus_lane_record_acquired: evidence.length > 0, exact_route_treatment_binding_proved: routeSupported, exact_route_binding_evidence: bindings, exact_segment_binding_proved: false, exact_segment_ids: [], candidate_segment_ids_pinned: false, official_lane_date_string_matches_candidate: evidence.length > 0, candidate_date_supported_at_day_precision: false, explicit_phase_identity_proved: false, date_and_phase_proved: false, operational_occurrence_identity_proved: false, unsupported_claims: [...(!routeSupported ? ["No acquired authoritative source binds this candidate route to the lane treatment."] : []), "The pinned candidate and review artifacts do not retain exact historical matched-segment identifiers; current segment ids are not substituted for that missing provenance.", "No acquired source assigns a stable canonical phase identity and proves the registry day as onset rather than extension or redesign.", "The registry projection is not a canonical MTA Wiki operational occurrence.", "Geometry, stop proximity, live route geography, and street-name similarity were not promoted to historical authoritative evidence."] },
      canonical_actions: { existing_canonical_links_verified: existingLinks, canonical_links_added: [], operational_occurrence_added_or_updated: false, authoritative_linkage_intake_gap: intakeGap, recommended_intake: intakeGap ? { source_id: projectBasis?.id ?? null, source_url: projectBasis?.url ?? null, source_sha256: projectBasis?.content_sha256 ?? null, route_id: candidate.route_id, corridor: candidate.corridor, required_roles: ["route_scope", "treatment_scope", "corridor_scope"], limitation: "Stage and ingest the source through normal intake; do not create a registry phase or occurrence from this receipt." } : null, reason: existingLinks.length > 0 ? "The generic route/corridor linkage already exists. The registry-specific phase and occurrence remain unresolved." : intakeGap ? "Official evidence supports a generic route-treatment linkage not found in canonical data; this receipt reports it for central normal-source intake without editing shared journals." : "No authoritative route-treatment linkage was proved; no canonical mutation is warranted." },
      outcome: { exclusive_primary_disposition: routeSupported ? "linkage_supported_phase_unresolved" : "completed_search_route_linkage_unresolved", registry_projection_excluded: true, exclusion_reason: routeSupported ? "Authoritative route-treatment evidence exists, but the registry event lacks an evidence-backed stable phase, exact candidate segment, and canonical occurrence identity." : "The completed official-source search did not prove a route-treatment binding; the registry row remains a proximity-derived, non-projectable projection.", study_projection_eligible: false, still_unresolved: true, next_action: intakeGap ? "Stage and ingest the cited official source, add only generic evidence-backed relationship roles, and separately resolve phase/onset before reconsidering projection." : routeSupported ? "Retain existing generic canonical links; resolve exact phase, segment, and onset through authoritative evidence before reconsidering projection." : "Retain this completed receipt and exclusion; reconsider only if later authoritative evidence binds route, treatment, physical scope, date, and phase." },
    };
    return { receipt_id: `manhattan-acquisition:${sha(stable(core)).slice(0, 24)}`, ...core };
  }).sort((a, b) => a.candidate.candidate_id.localeCompare(b.candidate.candidate_id));
  await writeFile(OUT.receipts, jsonl(receipts));
  const exclusions = receipts.map((receipt) => ({ schema_version: 1, candidate_id: receipt.candidate.candidate_id, candidate_set_id: SET_ID, identity: receipt.candidate.identity, shard: "manhattan", excluded_from: "mta_wiki_operational_occurrence_projection", exclusion_rule: "relationship-contract-v1:registry-only-bus-lane-requires-authoritative-route-treatment-phase-occurrence-evidence", reason: receipt.outcome.exclusion_reason, exact_route_treatment_binding_proved: receipt.claim_results.exact_route_treatment_binding_proved, phase_identity_proved: false, study_projection_eligible: false, receipt_id: receipt.receipt_id }));
  await writeFile(OUT.exclusions, jsonl(exclusions));
  const bound = receipts.filter((receipt) => receipt.claim_results.exact_route_treatment_binding_proved);
  const gaps = receipts.filter((receipt) => receipt.canonical_actions.authoritative_linkage_intake_gap);
  const summary = { schema_version: 1, shard: "manhattan", researched_on: DATE, candidate_set_id: SET_ID, candidate_set_sha256: SET_SHA, researched_count: receipts.length, source_acquired_count: receipts.filter((receipt) => receipt.source_findings.acquired_for_candidate).length, exact_route_binding_proved_count: bound.length, exact_route_binding_proved_candidate_ids: bound.map((receipt) => receipt.candidate.candidate_id), exact_route_binding_proved_route_ids: bound.map((receipt) => receipt.candidate.route_id).sort(), segment_binding_proved_count: 0, segment_binding_proved_candidate_ids: [], date_and_phase_proved_count: 0, operational_occurrence_added_or_updated_count: 0, explicitly_excluded_count: receipts.filter((receipt) => receipt.outcome.registry_projection_excluded).length, still_unresolved_count: receipts.filter((receipt) => receipt.outcome.still_unresolved).length, study_projection_eligible_count: 0, existing_canonical_link_count: receipts.reduce((sum, receipt) => sum + receipt.canonical_actions.existing_canonical_links_verified.length, 0), authoritative_linkage_intake_gap_count: gaps.length, authoritative_linkage_intake_gap_candidate_ids: gaps.map((receipt) => receipt.candidate.candidate_id), authoritative_linkage_intake_gap_route_ids: gaps.map((receipt) => receipt.candidate.route_id).sort(), exclusive_primary_disposition_counts: Object.fromEntries([...new Set(receipts.map((receipt) => receipt.outcome.exclusive_primary_disposition))].sort().map((value) => [value, receipts.filter((receipt) => receipt.outcome.exclusive_primary_disposition === value).length])), receipts_sha256: sha(jsonl(receipts)), exclusions_sha256: sha(jsonl(exclusions)), warning: "A generic supported route-treatment linkage is not a projectable occurrence. All Manhattan rows remain excluded because exact segment, stable phase, onset precision, and canonical occurrence identity were not jointly proved." };
  await writeJson(OUT.summary, summary);
  const report = `# Manhattan registry-only bus-lane acquisition shard\n\n- Pinned candidate set: \`${SET_ID}\` (\`${SET_SHA}\`)\n- Deterministic partition: **${receipts.length}** Manhattan M-route candidates (QM excluded)\n- Researched / official source acquired: **${summary.researched_count} / ${summary.source_acquired_count}**\n- Generic route-treatment binding proved: **${summary.exact_route_binding_proved_count}** (${summary.exact_route_binding_proved_route_ids.join(", ")})\n- Exact candidate segment binding proved: **0**\n- Date and explicit phase both proved: **0**\n- Operational occurrence added or updated: **0**\n- Registry projections explicitly excluded / still unresolved: **${summary.explicitly_excluded_count} / ${summary.still_unresolved_count}**\n- Authoritative generic linkage gaps for central intake: **${summary.authoritative_linkage_intake_gap_count}** (${summary.authoritative_linkage_intake_gap_route_ids.join(", ")})\n\nEvery receipt records NYC DOT lane/project, MTA route/project, public board/committee, and official primary-data checks with byte hashes. The six supported generic linkages are kept separate from exact segment, registry day, phase, and occurrence identity. Existing M15 SBS and M60 SBS canonical links are recorded; the four Third Avenue routes require normal source staging and canonical intake. No proximity or street-name match is treated as authoritative.\n\n## Reproduce\n\n\`\`\`bash\nbun data/quality/relationship-integrity/bus-lane-acquisition/shards/manhattan/acquire.ts --verify-partition --tracker-root ${DEFAULT_TRACKER}\nbun test data/quality/relationship-integrity/bus-lane-acquisition/shards/manhattan/acquire.test.ts\n\`\`\`\n`;
  await writeFile(OUT.report, report);
  const paths = [OUT.partition, OUT.proof, OUT.checks, OUT.lanes, OUT.receipts, OUT.exclusions, OUT.summary, OUT.report];
  const artifacts = await Promise.all(paths.map(async (path) => ({ path: basename(path), sha256: await fileSha(path), bytes: (await readFile(path)).byteLength })));
  await writeJson(OUT.manifest, { schema_version: 1, shard: "manhattan", generated_on: DATE, candidate_set_id: SET_ID, candidate_set_sha256: SET_SHA, artifacts, manifest_payload_sha256: sha(stable(artifacts)) });
}

async function main(): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const args = process.argv.slice(2);
  const trackerIndex = args.indexOf("--tracker-root");
  const tracker = trackerIndex >= 0 ? resolve(args[trackerIndex + 1] ?? "") : DEFAULT_TRACKER;
  if (args.includes("--acquire")) { const partition = await derivePartition(tracker); await acquire(partition); await generate(); return; }
  if (args.includes("--verify-partition")) {
    const before = await readFile(OUT.partition, "utf8").catch(() => null);
    const partition = await derivePartition(tracker);
    if (before !== null && before !== jsonl(partition)) throw new Error("Rederived Manhattan partition differs from checked artifact");
    if (!args.includes("--generate")) return;
  }
  await generate();
}

await main();
