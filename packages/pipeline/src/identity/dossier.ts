// C7 / S2.7 dossier export (docs/step-2-implementation-plan.md §S2.7).
//
// Walk a record's edges and emit every source-backed fact — claim/metric literals (never normalized
// away), evidence handles, authority/confirmation, assertion status — as markdown + JSON with a fully
// deterministic ordering so reruns diff cleanly (the byte-identical gate). Read-only over the live DB.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { repoRoot } from "@mta-wiki/core/paths";
import { canonicalDbPath, openCanonicalDb } from "@mta-wiki/db/canonical-db";
import { stableJson } from "@mta-wiki/db/stable-json";
import type { JsonObject, JsonValue } from "@mta-wiki/db/types";

export type DossierEdge = {
  relation_kind: string;
  direction: "out" | "in";
  other_record_id: string;
  other_display_name: string;
  provenance: string;
  assertion_status: string | null;
  as_of_date: string | null;
};

export type DossierEvidence = { source_id: string; page_number: number | null; block_id: string | null };

export type Dossier = {
  record_id: string;
  record_kind: string;
  display_name: string;
  confirmation_level: string | null;
  source_count: number;
  max_authority_rank: number | null;
  facts: Array<{ field: string; value: JsonValue }>;
  edges: DossierEdge[];
  evidence: DossierEvidence[];
  sources: string[];
};

const SCALAR_FACT = (value: JsonValue) => value === null || typeof value !== "object";

/** Payload literals worth surfacing as facts — scalar fields only, excluding runner/bookkeeping keys,
 *  in sorted order. Raw literals are preserved verbatim (never the normalized companion). */
function factsFromPayload(payload: JsonObject): Array<{ field: string; value: JsonValue }> {
  return Object.keys(payload)
    .filter((key) => !key.startsWith("_") && !key.endsWith("_normalized") && key !== "subject_id" && key !== "object_id")
    .sort()
    .flatMap((field) => {
      const value = payload[field];
      return value !== undefined && SCALAR_FACT(value) ? [{ field, value }] : [];
    });
}

export function buildDossier(db: Database, recordId: string): Dossier | undefined {
  const row = db.query("SELECT record_id, record_kind, display_name, payload FROM records WHERE record_id = ?").get(recordId) as
    | { record_id: string; record_kind: string; display_name: string; payload: string }
    | null;
  if (!row) return undefined;
  const payload = JSON.parse(row.payload) as JsonObject;

  const edgeRows = db
    .query(
      `SELECT relation_kind, subject_id, object_id, provenance, assertion_status, as_of_date
       FROM relations WHERE subject_id = ?1 OR object_id = ?1`,
    )
    .all(recordId) as Array<{ relation_kind: string; subject_id: string; object_id: string; provenance: string; assertion_status: string | null; as_of_date: string | null }>;

  const nameOf = (id: string) => (db.query("SELECT display_name FROM records WHERE record_id = ?").get(id) as { display_name: string } | null)?.display_name ?? id;

  const edges: DossierEdge[] = edgeRows
    .map((edge) => {
      const outgoing = edge.subject_id === recordId;
      const other = outgoing ? edge.object_id : edge.subject_id;
      return {
        relation_kind: edge.relation_kind,
        direction: outgoing ? ("out" as const) : ("in" as const),
        other_record_id: other,
        other_display_name: nameOf(other),
        provenance: edge.provenance,
        assertion_status: edge.assertion_status,
        as_of_date: edge.as_of_date,
      };
    })
    .sort((a, b) => {
      // Code-unit comparison, not localeCompare: collation treats `_` vs `-` as secondary, which
      // breaks the byte-identical rerun gate once a record mixes both id styles.
      const left = `${a.relation_kind} ${a.direction} ${a.other_record_id}`;
      const right = `${b.relation_kind} ${b.direction} ${b.other_record_id}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });

  const evidence = (
    db.query("SELECT source_id, page_number, block_id FROM evidence_refs WHERE record_id = ? ORDER BY source_id, page_number, block_id").all(recordId) as DossierEvidence[]
  ).map((e) => ({ source_id: e.source_id, page_number: e.page_number, block_id: e.block_id }));

  const sources = (db.query("SELECT source_id FROM record_sources WHERE record_id = ? ORDER BY source_id").all(recordId) as Array<{ source_id: string }>).map((s) => s.source_id);

  const corr = db.query("SELECT source_count, max_authority_rank, confirmation_level FROM corroboration WHERE record_id = ?").get(recordId) as
    | { source_count: number; max_authority_rank: number | null; confirmation_level: string }
    | null;

  return {
    record_id: row.record_id,
    record_kind: row.record_kind,
    display_name: row.display_name,
    confirmation_level: corr?.confirmation_level ?? null,
    source_count: corr?.source_count ?? sources.length,
    max_authority_rank: corr?.max_authority_rank ?? null,
    facts: factsFromPayload(payload),
    edges,
    evidence,
    sources,
  };
}

export function dossierMarkdown(d: Dossier): string {
  const lines: string[] = [];
  lines.push(`# Dossier: ${d.display_name}`, "");
  lines.push(`- record_id: \`${d.record_id}\``, `- kind: ${d.record_kind}`);
  lines.push(`- confirmation: ${d.confirmation_level ?? "unknown"} (${d.source_count} source${d.source_count === 1 ? "" : "s"}, max authority rank ${d.max_authority_rank ?? 0})`, "");
  lines.push("## Facts (source literals, never normalized away)");
  lines.push(...(d.facts.length ? d.facts.map((f) => `- **${f.field}**: ${JSON.stringify(f.value)}`) : ["_none_"]), "");
  lines.push("## Relations");
  lines.push(
    ...(d.edges.length
      ? d.edges.map((e) => `- ${e.direction === "out" ? "→" : "←"} ${e.relation_kind} ${e.other_display_name} \`${e.other_record_id}\` [${e.assertion_status ?? "unknown"}${e.as_of_date ? `, as of ${e.as_of_date}` : ""}] (${e.provenance})`)
      : ["_none_"]),
    "",
  );
  lines.push("## Evidence");
  lines.push(...(d.evidence.length ? d.evidence.map((e) => `- ${e.source_id}${e.page_number ? ` p${e.page_number}` : ""}${e.block_id ? ` ${e.block_id}` : ""}`) : ["_none_"]), "");
  return lines.join("\n") + "\n";
}

/** Write `<record-id>.md` + `.json` under data/dossiers/ and return their paths. Deterministic output. */
export function writeDossier(recordId: string): { markdown: string; json: string; dossier: Dossier } {
  const db = openCanonicalDb(canonicalDbPath(), { readonly: true });
  try {
    const dossier = buildDossier(db, recordId);
    if (!dossier) throw new Error(`record not found: ${recordId}`);
    const dir = join(repoRoot, "data", "dossiers");
    mkdirSync(dir, { recursive: true });
    const mdPath = join(dir, `${recordId}.md`);
    const jsonPath = join(dir, `${recordId}.json`);
    writeFileSync(mdPath, dossierMarkdown(dossier), "utf8");
    writeFileSync(jsonPath, stableJson(dossier as unknown as JsonValue) + "\n", "utf8");
    return { markdown: mdPath, json: jsonPath, dossier };
  } finally {
    db.close();
  }
}
