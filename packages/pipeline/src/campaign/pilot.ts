import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { submissionPath, createSubmissionEntry } from "@mta-wiki/pipeline/records/submissions";
import { evidenceId, readStagedSourceBlocks, readStagedSourceMetadata } from "@mta-wiki/pipeline/sources/source-prep";
import type { MtaEvidenceRef, MtaSubmitObservationInput } from "@mta-wiki/db/types";

export const PILOT_SOURCE_ID = "nyc_dot_14th_street_busway_brochure_pdf";
export const PILOT_RUN_ID = "pilot_14th_street_busway_brochure";

function existingSubmissionIds(path: string) {
  if (!existsSync(path)) return new Set<string>();
  return new Set(
    readFileSync(path, "utf8")
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { submission_id: string })
      .map((entry) => entry.submission_id),
  );
}

function evidenceForQuery(sourceId: string, query: string, role: string): MtaEvidenceRef {
  const normalizedQuery = query.replace(/\s+/gu, " ").toLowerCase();
  const block = readStagedSourceBlocks(sourceId).find((candidate) => candidate.normalized_text.toLowerCase().includes(normalizedQuery));
  if (!block) {
    throw new Error(`Pilot evidence block not found for role ${role}: ${query}`);
  }

  return {
    source_id: sourceId,
    evidence_id: evidenceId(sourceId, block.block_id),
    block_id: block.block_id,
    role,
  };
}

export function seedPilotSubmissions() {
  const sourceId = PILOT_SOURCE_ID;
  const metadata = readStagedSourceMetadata(sourceId);
  const intro = "On October 3, 2019, 14th Street between 9th";
  const goals = "•   Increase speeds and reliability for M14";
  const rules = "Only buses and trucks may make through trips";
  const monitoring = "Data on bus performance, safety, parking,";
  const sourceEvidence = evidenceForQuery(sourceId, "Begins October 3, 2019", "document_date_banner");
  const introEvidence = evidenceForQuery(sourceId, intro, "project_description");
  const goalEvidence = evidenceForQuery(sourceId, goals, "project_goal");
  const rulesEvidence = evidenceForQuery(sourceId, rules, "regulatory_window");
  const monitoringEvidence = evidenceForQuery(sourceId, monitoring, "monitoring_plan");

  const inputs: MtaSubmitObservationInput[] = [
    {
      source_id: sourceId,
      observation_kind: "source",
      local_observation_id: "source",
      label: metadata.title ?? sourceId,
      payload: {
        title: metadata.title ?? sourceId,
        publisher: metadata.publisher ?? "unknown",
        source_group: metadata.sourceGroup ?? "unknown",
        source_url: metadata.sourceUrl ?? null,
        document_date: metadata.documentDate ?? null,
      },
      evidence_refs: [sourceEvidence],
    },
    {
      source_id: sourceId,
      observation_kind: "project",
      local_observation_id: "project_14th_street_transit_truck_priority",
      label: "14th Street Transit & Truck Priority Pilot Project",
      raw_text: "14th Street Transit & Truck Priority Pilot Project",
      payload: {
        status: "planned",
        project_kind: "busway_pilot",
        location_text: "14th Street between 9th Avenue and 3rd Avenue",
        date_text: "October 3, 2019",
      },
      evidence_refs: [introEvidence],
    },
    {
      source_id: sourceId,
      observation_kind: "corridor",
      local_observation_id: "corridor_14th_street_9th_to_3rd",
      label: "14th Street, 9th Avenue to 3rd Avenue",
      raw_text: "14th Street between 9th Avenue and 3rd Avenue",
      payload: {
        borough: "Manhattan",
        corridor_text: "14th Street between 9th Avenue and 3rd Avenue",
      },
      evidence_refs: [introEvidence],
    },
    {
      source_id: sourceId,
      observation_kind: "route",
      local_observation_id: "route_m14_ad_sbs",
      label: "M14 A/D Select Bus Service",
      raw_text: "M14 A/D Select Bus Service",
      payload: {
        route_text: "M14 A/D Select Bus Service",
        resolution_state: "source_stated_unresolved",
      },
      evidence_refs: [goalEvidence],
    },
    {
      source_id: sourceId,
      observation_kind: "treatment_component",
      local_observation_id: "component_transit_truck_priority_rules",
      label: "Transit and truck priority through-trip restrictions",
      raw_text: "Only buses and trucks may make through trips between 9th Avenue and 3rd Avenue.",
      payload: {
        treatment_kind: "busway",
        rule_window: "6 am - 10 pm",
        exact_scope_text: "between 9th Avenue and 3rd Avenue",
      },
      evidence_refs: [rulesEvidence],
    },
    {
      source_id: sourceId,
      observation_kind: "event",
      local_observation_id: "event_project_begins_2019_10_03",
      label: "14th Street Transit & Truck Priority begins",
      raw_text: "Begins October 3, 2019",
      payload: {
        event_kind: "launch",
        date_text: "October 3, 2019",
        date_precision: "day",
        status: "planned",
      },
      evidence_refs: [sourceEvidence, introEvidence],
    },
    {
      source_id: sourceId,
      observation_kind: "claim",
      local_observation_id: "claim_project_goals_speed_reliability_safety",
      label: "Project goals include bus speed, reliability, and safety",
      raw_text: "Increase speeds and reliability for M14 A/D Select Bus Service; improve safety along a Vision Zero Priority corridor.",
      payload: {
        claim_kind: "project_goal",
        authority: metadata.publisher ?? "NYC DOT",
        subject_text: "14th Street Transit & Truck Priority Pilot Project",
      },
      evidence_refs: [goalEvidence],
    },
    {
      source_id: sourceId,
      observation_kind: "metric_claim",
      local_observation_id: "metric_operating_window_6am_10pm",
      label: "Transit and truck priority operating window",
      raw_text: "6 am - 10 pm",
      payload: {
        metric_family: "operating_window",
        value_text: "6 am - 10 pm",
        subject_text: "14th Street transit and truck priority restrictions",
      },
      evidence_refs: [rulesEvidence],
    },
    {
      source_id: sourceId,
      observation_kind: "claim",
      local_observation_id: "claim_monitoring_and_public_reporting",
      label: "Project monitoring and public reporting planned",
      raw_text: "Data on bus performance, safety, parking, traffic, trucks, and pedestrians will be collected and publicly reported regularly.",
      payload: {
        claim_kind: "monitoring_plan",
        authority: metadata.publisher ?? "NYC DOT",
      },
      evidence_refs: [monitoringEvidence],
    },
    {
      source_id: sourceId,
      observation_kind: "relation",
      local_observation_id: "relation_project_has_launch_event",
      label: "Project has launch event",
      payload: {
        relation_kind: "has_timeline_event",
        subject_local_observation_id: "project_14th_street_transit_truck_priority",
        object_local_observation_id: "event_project_begins_2019_10_03",
      },
      evidence_refs: [introEvidence],
    },
  ];

  const path = submissionPath(PILOT_RUN_ID);
  const existingIds = existingSubmissionIds(path);
  mkdirSync(dirname(path), { recursive: true });

  let appended = 0;
  for (const input of inputs) {
    const entry = createSubmissionEntry(PILOT_RUN_ID, input, "2026-06-07T00:00:00.000Z");
    if (existingIds.has(entry.submission_id)) continue;
    appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
    appended += 1;
  }

  return {
    runId: PILOT_RUN_ID,
    path,
    submitted: inputs.length,
    appended,
  };
}
