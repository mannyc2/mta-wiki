import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../packages/core/src/paths.js";
import type { MtaEvidenceSubmissionRef, MtaSubmitObservationInput } from "../packages/db/src/types.js";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read.js";
import {
  appendSubmission,
  createSubmissionEntry,
  readSubmissionEntries,
} from "../packages/pipeline/src/records/submissions.js";

const RUN_ID = "2026-07-13_codex_ace-may2025-two-cohort-curation";
const CUT_SOURCE_ID = "mta_ace_routes_may2025_cut";
const DICTIONARY_SOURCE_ID = "ace_routes_dataset_dictionary";
const KPM_SOURCE_ID = "nyct_key_performance_metrics_june2025";
const MINUTES_SOURCE_ID = "meeting_doc_179621";
const PROGRAM_PROJECT_ID = "project_ace-automated-camera-enforcement";
const programLocalId = "project_ace_program_may2025_cut";

const sourceArtifacts: Record<string, Record<string, string>> = {
  [CUT_SOURCE_ID]: {
    "metadata.json": "8f8a599f163550a7486affe9ac232055629ae0b16128ad45628d43fe80192371",
    "source.json": "8f206d056b24099c5ff1f03957a94ff06fdfb7c43b52c4630961fbd4ee50b6ea",
    "blocks.jsonl": "f4a364c38c4048ef20c25865694b25c39c1199c1eca620ada54caf1758ad711f",
  },
  [DICTIONARY_SOURCE_ID]: {
    "metadata.json": "85295354f00456c35a9b00864a229a838f57062e1e09564e3d14a665ae06a442",
    "source.json": "036ee59df32ea069706825915889079432acb27983b3b3f30ac56f7ad448c541",
    "blocks.jsonl": "6a1cebd44436009e112dc40df6da39421b5597d3badba4ecdcc667e8c7f472ec",
  },
  [KPM_SOURCE_ID]: {
    "metadata.json": "aa4280f87295631afaccafe78d9f613ee86da6add51f9d35a742fbc6f1492fd9",
    "source.pdf": "aca1f7edc2748df53814b945128c53ebf11fd06e3cc1cb5be6772260308df13e",
    "blocks.jsonl": "05c367fed2e36a6c07f5d97517315a402731d1932f7bbf85aff9a922ed150e99",
  },
  [MINUTES_SOURCE_ID]: {
    "metadata.json": "2610d7401b95ea2b48f1bff9eef688105d2b97eb10b364e2f46c0afcc20a0508",
    "source.pdf": "c6fde7da5aadf2525f52096311b017d37c0bfdcca250fd606b6ad072b3f75536",
    "blocks.jsonl": "05caa59b480d07f4f4140cf7423f80e29082684b4407fb7062cdccb2483af846",
  },
};

type SourceBlock = {
  block_id: string;
  page_number: number;
  raw_text: string;
  raw_text_sha256: string;
};

type RouteSpec = {
  sourceLiteral: "M2" | "M4" | "M42" | "M100" | "BX5";
  routeIdPayload: string;
  gtfsRouteId: string;
  targetRecordId: string;
  localId: string;
  rowBlockId: string;
  rowSha256: string;
};

const routes: RouteSpec[] = [
  {
    sourceLiteral: "M2",
    routeIdPayload: "M2",
    gtfsRouteId: "M2",
    targetRecordId: "route_m2-ace",
    localId: "route_ace_may2025_m2",
    rowBlockId: "p001_b0002",
    rowSha256: "sha256:b951f90ce367f9751b5854ba1f3531ea26847dc790157c383068d99499243eb4",
  },
  {
    sourceLiteral: "M4",
    routeIdPayload: "M4",
    gtfsRouteId: "M4",
    targetRecordId: "route_m4-ace",
    localId: "route_ace_may2025_m4",
    rowBlockId: "p001_b0003",
    rowSha256: "sha256:9f678307c7c631f9cbde51eff922d9af1b4e74d2df00ff29b44c3ff73cde7df2",
  },
  {
    sourceLiteral: "BX5",
    routeIdPayload: "Bx5",
    gtfsRouteId: "BX5",
    targetRecordId: "route_bx5-addendum-update",
    localId: "route_ace_may2025_bx5",
    rowBlockId: "p001_b0004",
    rowSha256: "sha256:af11743f84deb37d80e5d34e45c25401e17a6496898cf7907adfe41e4c6899bf",
  },
  {
    sourceLiteral: "M100",
    routeIdPayload: "M100",
    gtfsRouteId: "M100",
    targetRecordId: "route_m100-ace",
    localId: "route_ace_may2025_m100",
    rowBlockId: "p001_b0005",
    rowSha256: "sha256:1ade6dcc0b19712835cb6da704c1adf3199af5fdffd3771615f9b11404b7e286",
  },
  {
    sourceLiteral: "M42",
    routeIdPayload: "M42",
    gtfsRouteId: "M42",
    targetRecordId: "route_m42-ace",
    localId: "route_ace_may2025_m42",
    rowBlockId: "p001_b0006",
    rowSha256: "sha256:08e698e15923feefac5848969f9d9ac96ee67c0d3f3ceb16f0eb6e02671a3f02",
  },
];

const cohorts = [
  {
    key: "m2_m4",
    label: "M2/M4 ACE implementation cohort",
    date: "2025-05-19",
    dateText: "May 19, 2025",
    projectLocalId: "project_ace_m2_m4_implementation_2025_05_19",
    eventLocalId: "event_ace_m2_m4_implementation_2025_05_19",
    treatmentLocalId: "treatment_ace_m2_m4_implementation_2025_05_19",
    timelineLocalId: "relation_ace_m2_m4_has_implementation_2025_05_19",
    treatmentRelationLocalId: "relation_ace_m2_m4_may19_has_enforcement",
    partOfLocalId: "relation_ace_m2_m4_may19_part_of_program",
    routeSpecs: routes.filter((route) => route.sourceLiteral === "M2" || route.sourceLiteral === "M4"),
  },
  {
    key: "m42_m100_bx5",
    label: "M42/M100/BX5 ACE implementation cohort",
    date: "2025-05-27",
    dateText: "May 27, 2025",
    projectLocalId: "project_ace_m42_m100_bx5_implementation_2025_05_27",
    eventLocalId: "event_ace_m42_m100_bx5_implementation_2025_05_27",
    treatmentLocalId: "treatment_ace_m42_m100_bx5_implementation_2025_05_27",
    timelineLocalId: "relation_ace_m42_m100_bx5_has_implementation_2025_05_27",
    treatmentRelationLocalId: "relation_ace_m42_m100_bx5_may27_has_enforcement",
    partOfLocalId: "relation_ace_m42_m100_bx5_may27_part_of_program",
    routeSpecs: routes.filter((route) => ["M42", "M100", "BX5"].includes(route.sourceLiteral)),
  },
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

for (const [sourceId, artifacts] of Object.entries(sourceArtifacts)) {
  for (const [filename, expected] of Object.entries(artifacts)) {
    const path = join(repoRoot, "raw", "sources", sourceId, filename);
    assert(sha256(readFileSync(path)) === expected, `${sourceId}/${filename} changed`);
  }
}

const blocksBySource = new Map<string, Map<string, SourceBlock>>();
for (const sourceId of Object.keys(sourceArtifacts)) {
  const blocks = readFileSync(join(repoRoot, "raw", "sources", sourceId, "blocks.jsonl"), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as SourceBlock);
  blocksBySource.set(sourceId, new Map(blocks.map((block) => [block.block_id, block])));
}

function pinnedBlock(sourceId: string, blockId: string, expectedSha256: string, literals: string[]): SourceBlock {
  const block = blocksBySource.get(sourceId)?.get(blockId);
  assert(block, `Missing ${sourceId}#${blockId}`);
  assert(block.raw_text_sha256 === expectedSha256, `${sourceId}#${blockId} hash changed`);
  for (const literal of literals) {
    assert(block.raw_text.includes(literal), `${sourceId}#${blockId} lost ${JSON.stringify(literal)}`);
  }
  return block;
}

const cutHeader = pinnedBlock(
  CUT_SOURCE_ID,
  "p001_b0001",
  "sha256:4739a081afb00f16c77a13989ff0a02f30ec781a229f08bf8493ac2bec3a6db1",
  ["ki2b-sg5y", "2026-06-19T15:14:52Z", "8f206d056b24099c5ff1f03957a94ff06fdfb7c43b52c4630961fbd4ee50b6ea"],
);
const routeRows = new Map(
  routes.map((route) => [
    route.sourceLiteral,
    pinnedBlock(CUT_SOURCE_ID, route.rowBlockId, route.rowSha256, [
      `\"route\":\"${route.sourceLiteral}\"`,
      route.sourceLiteral === "M2" || route.sourceLiteral === "M4" ? "2025-05-19" : "2025-05-27",
      "\"program\":\"ACE\"",
    ]),
  ]),
);
const dictionaryDescription = pinnedBlock(
  DICTIONARY_SOURCE_ID,
  "p001_b0136",
  "sha256:9365d95e2570481960c7b23afc5d4319a92fff2d4055e3c239594b187e239c05",
  ["The date that the program took effect"],
);
const dictionaryField = pinnedBlock(
  DICTIONARY_SOURCE_ID,
  "p001_b0137",
  "sha256:6067471b839e1c04a8b973e81eae23c38c0fffa31ac36076ef1d41058ff6a91f",
  ["implementation_date"],
);
const kpmDate = pinnedBlock(
  KPM_SOURCE_ID,
  "p003_c0003",
  "sha256:cd869e913bf2d080f629ddf7eb8b23792ba00e43f53f2e35c6a8748cf9779963",
  ["June 23, 2025"],
);
const kpmExpansion = pinnedBlock(
  KPM_SOURCE_ID,
  "p005_c0003",
  "sha256:9fc307cf56e4a722aa295141283ba558804bae3171796e5b5e66b9bbad5b9a58",
  ["Last month, we expanded ACE to five new routes", "M2, M4, M42, M100, and Bx5"],
);
const minutesDate = pinnedBlock(
  MINUTES_SOURCE_ID,
  "p001_c0002",
  "sha256:d2dcda9b07db4683bd41d224e22a28557f51b72e4f50822f55bbbb2141bf5301",
  ["June 23, 2025"],
);
const minutesExpansion = pinnedBlock(
  MINUTES_SOURCE_ID,
  "p003_c0009",
  "sha256:1c2fe0ec1ad28cd6bc0d4279b6fbddcafba648d000b2e0d1de858a72c6e398f3",
  ["M2, M4, M42, M100, and Bx5", "are now ACE-enabled"],
);

function evidence(sourceId: string, block: SourceBlock, role: string, sourceQuote?: string): MtaEvidenceSubmissionRef {
  return {
    source_id: sourceId,
    evidence_id: `${sourceId}#${block.block_id}`,
    source_path: `raw/sources/${sourceId}/blocks.jsonl`,
    page_number: block.page_number,
    block_id: block.block_id,
    text_sha256: block.raw_text_sha256,
    text_source: "raw_text",
    role,
    ...(sourceQuote ? { source_quote: sourceQuote } : {}),
  };
}

const aggregateEvidence = [
  evidence(KPM_SOURCE_ID, kpmDate, "publication_date_context", "June 23, 2025"),
  evidence(
    KPM_SOURCE_ID,
    kpmExpansion,
    "five_route_expansion",
    "Last month, we expanded ACE to five new routes: the M2, M4, M42, M100, and Bx5.",
  ),
  evidence(MINUTES_SOURCE_ID, minutesDate, "minutes_date_context", "June 23, 2025"),
  evidence(MINUTES_SOURCE_ID, minutesExpansion, "delivered_status", "are now ACE-enabled"),
];
const implementationDefinitionEvidence = [
  evidence(
    DICTIONARY_SOURCE_ID,
    dictionaryDescription,
    "implementation_date_definition",
    "The date that the program took effect in a MM/DD/YYYY format.",
  ),
  evidence(DICTIONARY_SOURCE_ID, dictionaryField, "implementation_date_field", "implementation_date"),
];

const observations: MtaSubmitObservationInput[] = [
  {
    source_id: CUT_SOURCE_ID,
    observation_kind: "source",
    local_observation_id: `source_${CUT_SOURCE_ID}`,
    label: "MTA ACE Routes — May 2025 Five-Route Official Cut",
    raw_text: [cutHeader.raw_text, ...routes.map((route) => routeRows.get(route.sourceLiteral)!.raw_text)].join("\n"),
    payload: {
      title: "MTA ACE Routes — May 2025 Five-Route Official Cut",
      publisher: "Metropolitan Transportation Authority (MTA) Open Data",
      content_type: "official dataset API cut",
      source_url: "https://data.ny.gov/resource/ki2b-sg5y.json",
      dataset_id: "ki2b-sg5y",
      dataset_rows_updated_at: "2026-06-19T15:14:52Z",
      retrieved_at: "2026-07-13T15:15:00Z",
      response_sha256: "8f206d056b24099c5ff1f03957a94ff06fdfb7c43b52c4630961fbd4ee50b6ea",
      row_count: 5,
      description: "Pinned official MTA Open Data cut containing only the five ACE routes reported as expanded in May 2025, with stable Socrata row ids and implementation dates.",
    },
    evidence_refs: [
      evidence(CUT_SOURCE_ID, cutHeader, "capture_identity"),
      ...routes.map((route) => evidence(CUT_SOURCE_ID, routeRows.get(route.sourceLiteral)!, "captured_row")),
    ],
  },
  {
    source_id: CUT_SOURCE_ID,
    observation_kind: "project",
    local_observation_id: programLocalId,
    target_record_id: PROGRAM_PROJECT_ID,
    label: "Automated Camera Enforcement (ACE)",
    raw_text: [kpmExpansion.raw_text, minutesExpansion.raw_text].join("\n\n"),
    payload: {
      project_name: "Automated Camera Enforcement (ACE)",
      project_type: "automated camera enforcement program",
      project_family: "enforcement_program",
      status: "active",
      document_time_status: "implemented",
      description: "The official May 2025 ACE expansion added M2, M4, M42, M100, and Bx5 in two implementation-date cohorts.",
    },
    evidence_refs: [
      ...aggregateEvidence,
      ...routes.map((route) => evidence(CUT_SOURCE_ID, routeRows.get(route.sourceLiteral)!, "program_route_row")),
    ],
  },
  ...routes.map<MtaSubmitObservationInput>((route) => ({
    source_id: CUT_SOURCE_ID,
    observation_kind: "route",
    local_observation_id: route.localId,
    target_record_id: route.targetRecordId,
    label: route.routeIdPayload,
    raw_text: routeRows.get(route.sourceLiteral)!.raw_text,
    payload: {
      route_id: route.routeIdPayload,
      route_label: route.routeIdPayload,
      route_type: "bus",
      source_literal: route.sourceLiteral,
    },
    evidence_refs: [
      evidence(CUT_SOURCE_ID, routeRows.get(route.sourceLiteral)!, "route_identity", `\"route\":\"${route.sourceLiteral}\"`),
    ],
  })),
];

for (const cohort of cohorts) {
  const literals = cohort.routeSpecs.map((route) => route.sourceLiteral);
  const routeText = literals.join(", ");
  const cohortRows = cohort.routeSpecs.map((route) => routeRows.get(route.sourceLiteral)!);
  const rowEvidence = cohortRows.map((block) => evidence(CUT_SOURCE_ID, block, "cohort_implementation_row"));
  const commonEvidence = [...rowEvidence, ...implementationDefinitionEvidence, ...aggregateEvidence];

  observations.push(
    {
      source_id: CUT_SOURCE_ID,
      observation_kind: "project",
      local_observation_id: cohort.projectLocalId,
      create_new: true,
      label: `${cohort.label} — ${cohort.dateText}`,
      raw_text: cohortRows.map((block) => block.raw_text).join("\n"),
      payload: {
        project_name: `${cohort.label} — ${cohort.dateText}`,
        project_type: "bounded ACE route implementation cohort",
        project_family: "enforcement_program",
        status: "implemented",
        document_time_status: "implemented",
        implementation_date: cohort.date,
        description: `Bounded ACE implementation cohort for ${routeText}; the official dataset records the program taking effect on ${cohort.dateText}.`,
      },
      evidence_refs: commonEvidence,
    },
    {
      source_id: CUT_SOURCE_ID,
      observation_kind: "event",
      local_observation_id: cohort.eventLocalId,
      create_new: true,
      label: `${routeText} ACE implementation on ${cohort.dateText}`,
      raw_text: cohortRows.map((block) => block.raw_text).join("\n"),
      payload: {
        event_kind: "ACE route implementation",
        event_family: "implementation",
        lifecycle_phase: "expanded",
        date_text: cohort.dateText,
        date_normalized: cohort.date,
        date_precision: "day",
        description: `ACE took effect on ${routeText} on ${cohort.dateText}.`,
        date_resolution_basis: "The official dataset's implementation_date field is defined as the date the program took effect.",
      },
      evidence_refs: commonEvidence,
    },
    {
      source_id: CUT_SOURCE_ID,
      observation_kind: "treatment_component",
      local_observation_id: cohort.treatmentLocalId,
      create_new: true,
      label: `${routeText} ACE implementation on ${cohort.dateText}`,
      raw_text: cohortRows.map((block) => block.raw_text).join("\n"),
      payload: {
        treatment_kind: "Automated Camera Enforcement (ACE) route implementation",
        treatment_family: "automated_bus_lane_enforcement",
        location_text: routeText,
        implementation_date: cohort.date,
        description: `Atomic ACE implementation treatment for the ${routeText} cohort that took effect on ${cohort.dateText}.`,
      },
      evidence_refs: commonEvidence,
    },
    {
      source_id: CUT_SOURCE_ID,
      observation_kind: "relation",
      local_observation_id: cohort.timelineLocalId,
      label: `${cohort.label} has ${cohort.dateText} implementation event`,
      payload: {
        relation_kind: "has_timeline_event",
        relation_family: "timeline_context",
        subject_local_observation_id: cohort.projectLocalId,
        object_local_observation_id: cohort.eventLocalId,
        assertion_status: "delivered",
        as_of_date: cohort.date,
        description: `The bounded ${routeText} ACE cohort took effect on ${cohort.dateText}.`,
      },
      evidence_refs: commonEvidence,
    },
    {
      source_id: CUT_SOURCE_ID,
      observation_kind: "relation",
      local_observation_id: cohort.treatmentRelationLocalId,
      label: `${cohort.label} has ACE treatment`,
      payload: {
        relation_kind: "has_treatment",
        relation_family: "treatment_scope",
        subject_local_observation_id: cohort.projectLocalId,
        object_local_observation_id: cohort.treatmentLocalId,
        assertion_status: "delivered",
        as_of_date: cohort.date,
        description: `The ${routeText} cohort implements one atomic Automated Camera Enforcement treatment.`,
      },
      evidence_refs: commonEvidence,
    },
    {
      source_id: CUT_SOURCE_ID,
      observation_kind: "relation",
      local_observation_id: cohort.partOfLocalId,
      label: `${cohort.label} is part of ACE`,
      payload: {
        relation_kind: "part_of_program",
        relation_family: "program_project_scope",
        subject_local_observation_id: cohort.projectLocalId,
        object_local_observation_id: programLocalId,
        assertion_status: "delivered",
        as_of_date: cohort.date,
        description: `The bounded ${routeText} implementation cohort is part of the Automated Camera Enforcement program.`,
      },
      evidence_refs: commonEvidence,
    },
  );

  for (const route of cohort.routeSpecs) {
    observations.push({
      source_id: CUT_SOURCE_ID,
      observation_kind: "relation",
      local_observation_id: `relation_ace_${cohort.key}_${cohort.date.replaceAll("-", "_")}_affects_${route.sourceLiteral.toLowerCase()}`,
      label: `${cohort.label} affects ${route.routeIdPayload}`,
      payload: {
        relation_kind: "affects_route",
        relation_family: "route_scope",
        subject_local_observation_id: cohort.projectLocalId,
        object_local_observation_id: route.localId,
        assertion_status: "delivered",
        as_of_date: cohort.date,
        description: `${route.routeIdPayload} belongs to the ACE implementation cohort that took effect on ${cohort.dateText}.`,
      },
      evidence_refs: [
        evidence(CUT_SOURCE_ID, routeRows.get(route.sourceLiteral)!, "route_scope"),
        ...implementationDefinitionEvidence,
        ...aggregateEvidence,
      ],
    });
  }
}

const canonicalIds = new Set(readCanonicalRecordsFromJsonl().map((record) => record.record_id));
for (const observation of observations) {
  if (observation.target_record_id && !canonicalIds.has(observation.target_record_id)) {
    throw new Error(`Missing target_record_id ${observation.target_record_id}`);
  }
}

const fixedSubmittedAt = "2026-07-13T15:30:00.000Z";
const dryRunEntries = observations.map((observation) => createSubmissionEntry(RUN_ID, observation, fixedSubmittedAt));
for (const entry of dryRunEntries) {
  if (entry.validation.state !== "accepted") {
    throw new Error(`${entry.submission_id} rejected: ${entry.validation.issues.join("; ")}`);
  }
}

const existingSubmissionIds = new Set(readSubmissionEntries().map((entry) => entry.submission_id));
const pending = dryRunEntries.filter((entry) => !existingSubmissionIds.has(entry.submission_id));
const apply = process.argv.includes("--apply");
if (apply) {
  const bySubmissionId = new Map(
    observations.map((observation) => [createSubmissionEntry(RUN_ID, observation, fixedSubmittedAt).submission_id, observation]),
  );
  for (const entry of pending) {
    const observation = bySubmissionId.get(entry.submission_id);
    assert(observation, `Lost pending observation ${entry.submission_id}`);
    const written = appendSubmission(RUN_ID, observation);
    assert(written.validation.state === "accepted", `${written.submission_id} rejected while applying`);
  }
}

process.stdout.write(`${JSON.stringify({
  run_id: RUN_ID,
  source_id: CUT_SOURCE_ID,
  mode: apply ? "apply" : "dry_run",
  observation_count: observations.length,
  cohort_count: cohorts.length,
  route_count: routes.length,
  already_present_count: observations.length - pending.length,
  written_count: apply ? pending.length : 0,
  pending_count: apply ? 0 : pending.length,
  target_occurrences: cohorts.map((cohort) => ({
    date: cohort.date,
    routes: cohort.routeSpecs.map((route) => route.gtfsRouteId),
  })),
  submission_ids: dryRunEntries.map((entry) => entry.submission_id),
}, null, 2)}\n`);
