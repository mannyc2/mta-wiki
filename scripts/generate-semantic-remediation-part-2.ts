import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type {
  JsonObject,
  JsonValue,
  MtaCanonicalRecord,
  MtaEvidenceRef,
  MtaSubmitObservationInput,
} from "../packages/db/src/types";
import { entriesToRecords } from "../packages/pipeline/src/materialize/materialize";
import { retiredSubmissionIds } from "../packages/pipeline/src/records/submission-overrides";
import { readSubmissionEntries, validateSubmitInput } from "../packages/pipeline/src/records/submissions";
import {
  readSemanticCorrections,
  readSemanticCorrectionSupersessions,
  withSemanticCorrections,
} from "../packages/pipeline/src/records/semantic-corrections";
import { sourceBlockById } from "../packages/pipeline/src/sources/source-prep";

const CONTRACT_DIR = join(repoRoot, "data/contracts/relationships/v1");
const REVIEW_PATH = join(CONTRACT_DIR, "semantic-review-shards/part-2.json");
const INVENTORY_PATH = join(CONTRACT_DIR, "baseline-tuple-review-inventory.json");
const OUTPUT_PATH = join(CONTRACT_DIR, "semantic-remediation-shards/part-2.json");
const CORRECTIONS_PATH = join(repoRoot, "data/semantic-corrections/corrections.jsonl");
const SUPERSESSIONS_PATH = join(repoRoot, "data/semantic-corrections/supersessions-v1.json");
const RETIREMENTS_PATH = join(repoRoot, "data/submission-overrides/retired.json");
const MERGES_PATH = join(repoRoot, "data/identity-overrides/merges.json");
const REVIEWED_AT = "2026-07-16T00:00:00.000Z";
const REVIEWED_BY = "Codex relationship-integrity semantic remediation / part-2";

type ReviewArtifact = {
  schema_version: number;
  shard_id: string;
  decisions: Array<{
    tuple_index: number;
    suspect_relation_ids: string[];
    semantic_rationale: string;
    remediation_actions: Array<{ relation_id: string; evidence_ids: string[]; defect: string }>;
  }>;
  summary: { suspect_relation_count: number; suspect_relation_ids_sha256: string };
};

type RelationFields = {
  relation_family: string;
  relation_kind: string;
  subject_id: string;
  object_id: string;
};

type TerminalAction =
  | "retract_unsupported"
  | "replace_endpoint"
  | "patch_relation"
  | "resolved_by_identity_campaign"
  | "resolved_by_generator_fix"
  | "replace_with_submissions";

type Resolution = {
  terminal_action: TerminalAction;
  rationale: string;
  supported_claims: string[];
  unsupported_claims: string[];
  action: JsonObject;
};

type ResolutionContext = {
  relation: MtaCanonicalRecord;
  fields: RelationFields;
  recordsById: Map<string, MtaCanonicalRecord>;
  evidenceRefs: MtaEvidenceRef[];
  sourceId: string;
};

type ResolutionBuilder = (context: ResolutionContext) => Resolution;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

function idsSha256(ids: string[]): string {
  return sha256(stableJson([...ids].sort() as unknown as JsonValue));
}

function recordsSha256(records: readonly MtaCanonicalRecord[]): string {
  const hash = createHash("sha256");
  hash.update("[");
  for (const [index, record] of records.entries()) {
    if (index > 0) hash.update(",");
    hash.update(stableJson(record as unknown as JsonValue));
  }
  hash.update("]");
  return hash.digest("hex");
}

function text(value: JsonValue | undefined, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`relation is missing ${field}`);
  return value.trim();
}

function fieldsFor(relation: MtaCanonicalRecord): RelationFields {
  return {
    relation_family: text(relation.payload.relation_family, "relation_family"),
    relation_kind: text(relation.payload.relation_kind, "relation_kind"),
    subject_id: text(relation.payload.subject_id, "subject_id"),
    object_id: text(relation.payload.object_id, "object_id"),
  };
}

function guards(fields: RelationFields): JsonObject {
  return { ...fields };
}

function exactEvidenceRefs(relation: MtaCanonicalRecord): MtaEvidenceRef[] {
  if (relation.evidence_refs.length === 0) throw new Error(`${relation.record_id} has no evidence`);
  return relation.evidence_refs.map((ref) => ({ ...ref }));
}

function sourceIdFor(refs: MtaEvidenceRef[]): string {
  const ids = [...new Set(refs.map((ref) => ref.source_id).filter(Boolean))];
  if (ids.length !== 1 || !ids[0]) throw new Error(`replacement submissions require one exact source; found ${ids.join(",")}`);
  return ids[0];
}

function endpointExists(context: ResolutionContext, id: string, expectedKinds?: string[]): void {
  const target = context.recordsById.get(id);
  if (!target) throw new Error(`${context.relation.record_id} replacement endpoint ${id} is missing`);
  if (expectedKinds && !expectedKinds.includes(target.record_kind)) {
    throw new Error(`${context.relation.record_id} replacement endpoint ${id} has ${target.record_kind}, expected ${expectedKinds.join("/")}`);
  }
}

function defaultSupported(context: ResolutionContext): string[] {
  const description = typeof context.relation.payload.description === "string"
    ? context.relation.payload.description.trim()
    : "";
  return [description || context.relation.display_name];
}

function retract(
  rationale: string,
  supportedClaims?: string[],
  unsupportedClaims?: string[],
): ResolutionBuilder {
  return (context) => ({
    terminal_action: "retract_unsupported",
    rationale,
    supported_claims: supportedClaims ?? defaultSupported(context),
    unsupported_claims: unsupportedClaims ?? [
      `The cited evidence does not support ${context.fields.relation_kind} from ${context.fields.subject_id} to ${context.fields.object_id} at the stored precision.`,
    ],
    action: { replacement_relation_ids: [] },
  });
}

function replaceEndpoint(
  field: "subject_id" | "object_id",
  toRecordId: string,
  rationale: string,
  supportedClaims?: string[],
  unsupportedClaims?: string[],
  expectedKinds?: string[],
): ResolutionBuilder {
  return (context) => {
    endpointExists(context, toRecordId, expectedKinds);
    return {
      terminal_action: "replace_endpoint",
      rationale,
      supported_claims: supportedClaims ?? defaultSupported(context),
      unsupported_claims: unsupportedClaims ?? [
        `${context.fields[field]} is not the canonical ${field === "subject_id" ? "subject" : "object"} stated by the cited evidence.`,
      ],
      action: { field, to_record_id: toRecordId, guards: guards(context.fields) },
    };
  };
}

function patchRelation(
  set: RelationFields | ((context: ResolutionContext) => RelationFields),
  rationale: string,
  supportedClaims?: string[],
  unsupportedClaims?: string[],
): ResolutionBuilder {
  return (context) => {
    const resolved = typeof set === "function" ? set(context) : set;
    endpointExists(context, resolved.subject_id);
    endpointExists(context, resolved.object_id);
    return {
      terminal_action: "patch_relation",
      rationale,
      supported_claims: supportedClaims ?? defaultSupported(context),
      unsupported_claims: unsupportedClaims ?? [
        `The legacy ${context.fields.relation_kind}/${context.fields.relation_family} direction or role is not supported at the cited precision.`,
      ],
      action: { set: resolved, guards: guards(context.fields) },
    };
  };
}

function identityCampaign(options: {
  submissionIds: string[];
  expectedSubjectId: string;
  expectedObjectId: string;
  rationale: string;
  supportedClaims: string[];
}): ResolutionBuilder {
  return (context) => {
    if (!options.expectedSubjectId.startsWith("route_") || !options.expectedObjectId.startsWith("route_")) {
      throw new Error(`${context.relation.record_id} identity-campaign endpoints must be exact route ids`);
    }
    return {
      terminal_action: "resolved_by_identity_campaign",
      rationale: options.rationale,
      supported_claims: options.supportedClaims,
      unsupported_claims: [
        `The current self-loop or conflated route identity ${context.fields.subject_id} -> ${context.fields.object_id} is not a valid representation of the distinct service identities.`,
      ],
      action: {
        identity_submission_ids: [...options.submissionIds].sort(),
        expected_subject_id: options.expectedSubjectId,
        expected_object_id: options.expectedObjectId,
      },
    };
  };
}

function generatorFix(ruleId: string, change: string): ResolutionBuilder {
  return (context) => ({
    terminal_action: "resolved_by_generator_fix",
    rationale: "The cited table is an inventory/revenue table and does not state an operator relationship; the deterministic legacy generator must stop upgrading table membership into operates.",
    supported_claims: [`The cited source table lists ${context.fields.object_id} as an MTA Bridges and Tunnels facility.`],
    unsupported_claims: [`The table does not itself prove that ${context.fields.subject_id} operates ${context.fields.object_id}.`],
    action: { rule_id: ruleId, change, expected_relation_disposition: "retracted" },
  });
}

function observation(
  context: ResolutionContext,
  observationKind: MtaSubmitObservationInput["observation_kind"],
  localObservationId: string,
  label: string,
  payload: JsonObject,
): MtaSubmitObservationInput {
  return {
    source_id: context.sourceId,
    observation_kind: observationKind,
    local_observation_id: localObservationId,
    create_new: true,
    label,
    raw_text: typeof context.relation.payload.description === "string"
      ? context.relation.payload.description
      : context.relation.display_name,
    payload,
    evidence_refs: context.evidenceRefs,
  };
}

function replaceWithSubmissions(
  rationale: string,
  supportedClaims: string[],
  unsupportedClaims: string[],
  build: (context: ResolutionContext) => MtaSubmitObservationInput[],
): ResolutionBuilder {
  return (context) => {
    const submissions = build(context);
    if (submissions.length === 0) throw new Error(`${context.relation.record_id} has no replacement submissions`);
    const localIds = new Set(submissions.map((input) => input.local_observation_id));
    for (const [index, input] of submissions.entries()) {
      if (
        input.source_id !== context.sourceId ||
        !input.observation_kind ||
        !input.local_observation_id ||
        input.create_new !== true ||
        !input.label ||
        !input.payload ||
        !input.evidence_refs?.length
      ) {
        throw new Error(`${context.relation.record_id} replacement submission ${index} is incomplete`);
      }
      const validationIssues = validateSubmitInput(input);
      if (validationIssues.length > 0) {
        throw new Error(`${context.relation.record_id} replacement submission ${index} is invalid: ${validationIssues.join("; ")}`);
      }
      for (const field of ["subject_id", "object_id"] as const) {
        const endpoint = input.payload[field];
        if (typeof endpoint === "string") endpointExists(context, endpoint);
      }
      for (const [localField, canonicalField] of [
        ["subject_local_observation_id", "subject_id"],
        ["object_local_observation_id", "object_id"],
      ] as const) {
        const localId = input.payload[localField];
        if (typeof localId === "string" && typeof input.payload[canonicalField] !== "string" && !localIds.has(localId)) {
          throw new Error(`${context.relation.record_id} replacement submission ${index} references unknown ${localField} ${localId}`);
        }
      }
    }
    return {
      terminal_action: "replace_with_submissions",
      rationale,
      supported_claims: supportedClaims,
      unsupported_claims: unsupportedClaims,
      action: { retire_relation: true, submissions: submissions as unknown as JsonValue },
    };
  };
}

const SPECS = new Map<string, ResolutionBuilder>();

function assign(ids: string[], builder: ResolutionBuilder): void {
  for (const id of ids) {
    if (SPECS.has(id)) throw new Error(`duplicate remediation specification for ${id}`);
    SPECS.set(id, builder);
  }
}

function reportReplacement(options: {
  reportLocalId: string;
  reportLabel: string;
  reportDescription: string;
  presenterId: string;
  presenterLabel: string;
  relationKind?: string;
}): ResolutionBuilder {
  return replaceWithSubmissions(
    "The evidence describes a report as the presented/delivered artifact. Create that first-class report record and link the report to the exact presenter instead of using a claim or agency as an artifact surrogate.",
    [`${options.presenterLabel} presented or delivered ${options.reportLabel}.`],
    ["A person, agency, or narrative claim cannot stand in for the report artifact."],
    (context) => {
      const prepared = options.relationKind === "prepared_by";
      return [
        observation(context, "source", options.reportLocalId, options.reportLabel, {
          title: options.reportLabel,
          content_type: "embedded official report",
          description: options.reportDescription,
        }),
        observation(context, "relation", `relation_${options.reportLocalId}_presented_by_20260716`, `${options.reportLabel} presented by ${options.presenterLabel}`, {
          relation_kind: prepared ? "prepared_by" : "presented_by",
          relation_family: prepared ? "publication_role" : "agency_role",
          subject_local_observation_id: options.reportLocalId,
          object_id: options.presenterId,
          assertion_status: "delivered",
          description: `${options.reportLabel} was presented or delivered by ${options.presenterLabel}.`,
        }),
      ];
    },
  );
}

function contractReplacement(options: {
  projectLocalId: string;
  projectLabel: string;
  projectDescription: string;
  vendorId: string;
  vendorLabel: string;
  agencyId?: string;
  agencyLabel?: string;
  metricId?: string;
  claimId?: string;
  status?: string;
}): ResolutionBuilder {
  return replaceWithSubmissions(
    "The official procurement text supports a contract/project identity and party roles. Model the contract as a first-class project before linking the vendor, administering agency, claim, or amount.",
    [`${options.vendorLabel} is the named contractor/vendor for ${options.projectLabel}.`],
    ["A vendor, agency, claim, source, or numeric metric is not a substitute for the contract/project identity."],
    (context) => {
      const inputs: MtaSubmitObservationInput[] = [
        observation(context, "project", options.projectLocalId, options.projectLabel, {
          project_name: options.projectLabel,
          project_type: "contract or procurement",
          project_family: "contract_or_procurement",
          document_time_status: options.status ?? "approved",
          description: options.projectDescription,
        }),
        observation(context, "relation", `relation_${options.projectLocalId}_awarded_to_20260716`, `${options.projectLabel} awarded to ${options.vendorLabel}`, {
          relation_kind: "awarded_to",
          relation_family: "funding_award",
          subject_local_observation_id: options.projectLocalId,
          object_id: options.vendorId,
          assertion_status: options.status ?? "approved",
          description: `${options.projectLabel} was awarded to ${options.vendorLabel}.`,
        }),
      ];
      if (options.agencyId) {
        inputs.push(observation(context, "relation", `relation_${options.projectLocalId}_managed_by_20260716`, `${options.projectLabel} managed by ${options.agencyLabel ?? options.agencyId}`, {
          relation_kind: "managed_by",
          relation_family: "agency_role",
          subject_local_observation_id: options.projectLocalId,
          object_id: options.agencyId,
          assertion_status: options.status ?? "approved",
          description: `${options.agencyLabel ?? options.agencyId} is the administering or requesting agency for ${options.projectLabel}.`,
        }));
      }
      if (options.metricId) {
        inputs.push(observation(context, "relation", `relation_${options.projectLocalId}_has_metric_20260716`, `${options.projectLabel} has amount metric`, {
          relation_kind: "has_metric",
          relation_family: "metric_context",
          subject_local_observation_id: options.projectLocalId,
          object_id: options.metricId,
          description: `The canonical metric records the source-stated amount for ${options.projectLabel}.`,
        }));
      }
      if (options.claimId) {
        inputs.push(observation(context, "relation", `relation_${options.projectLocalId}_has_claim_20260716`, `${options.projectLabel} has procurement claim`, {
          relation_kind: "has_claim",
          relation_family: "claim_context",
          subject_local_observation_id: options.projectLocalId,
          object_id: options.claimId,
          description: `The canonical claim records the source-stated procurement action for ${options.projectLabel}.`,
        }));
      }
      return inputs;
    },
  );
}

// Self-loops and identity collapses.
assign(["relation_congestion-pricing-critical-capital"], replaceEndpoint(
  "object_id",
  "project_2020-2024-capital-program-meeting-doc-152166",
  "The headline names the CBD tolling program as critical to the distinct 2020-2024 Capital Program; the self-loop arose from a collapsed project endpoint.",
  ["Congestion Pricing/CBDTP is described as critical to the 2020-2024 Capital Program."],
  ["CBDTP is not critical_for itself."],
  ["project"],
));

assign(["relation_corridor-vision-zero"], retract(
  "The Vision Zero designation is already source-backed in the canonical 14th Street corridor payload; a corridor-to-itself binary designation adds no second identity and is invalid.",
  ["The source identifies 14th Street as a Vision Zero priority corridor."],
  ["A designation relation cannot use the same corridor as both subject and object."],
));

assign(["relation_2020-surplus-to-mta-nyct"], replaceWithSubmissions(
  "The resolution explicitly names two recipients. Retire the collapsed B&T self-loop and emit one evidence-identical recipient edge for umbrella MTA and one for NYCTA/NYCT.",
  ["TBTA/B&T certified and transferred the 2020 operating surplus to MTA and NYCTA."],
  ["B&T did not distribute the surplus to itself."],
  (context) => [
    observation(context, "relation", "relation_2020_surplus_bt_to_mta_20260716", "2020 TBTA surplus distributed to MTA", {
      relation_kind: "distributes_surplus_to",
      relation_family: "funding_award",
      subject_id: "entity_mta-bridges-and-tunnels",
      object_id: "entity_mta-entity-update-2025",
      assertion_status: "delivered",
      description: "TBTA/B&T certified and transferred part of its 2020 operating surplus to the Metropolitan Transportation Authority.",
    }),
    observation(context, "relation", "relation_2020_surplus_bt_to_nyct_20260716", "2020 TBTA surplus distributed to NYCTA", {
      relation_kind: "distributes_surplus_to",
      relation_family: "funding_award",
      subject_id: "entity_mta-bridges-and-tunnels",
      object_id: "entity_mta-nyct",
      assertion_status: "delivered",
      description: "TBTA/B&T certified and transferred part of its 2020 operating surplus to the New York City Transit Authority.",
    }),
  ],
));

assign(["relation_meeting135266-mueller-mtapd"], replaceEndpoint(
  "subject_id",
  "entity_meeting-doc-113891-john-mueller",
  "The person observation for John Mueller was conflated with MTAPD; the independently canonicalized John Mueller person record is the proven employee/Chief endpoint.",
  ["John Mueller is Chief of Police of the MTA Police Department."],
  ["The MTA Police Department is not employed_by itself."],
  ["entity"],
));

assign([
  "relation_meeting-doc-115326-able-extension",
  "relation_meeting-doc-115326-fare-free-pilot-funding",
], retract(
  "Each underlying legislative/funding statement already exists as the exact canonical claim that supplied both endpoints; the binary self-edge is malformed and adds no independently identified funder.",
  undefined,
  ["A claim record cannot be funded_by itself, and the cited blocks do not identify a second canonical endpoint for these rows."],
));

assign(["relation_mnr-security-tsa-award"], patchRelation(
  {
    relation_family: "claim_context",
    relation_kind: "has_claim",
    subject_id: "entity_meeting-doc-124881-mnr",
    object_id: "claim_mnr-tsa-gold-award-2024",
  },
  "The exact award fact already has a canonical claim; link Metro-North to that claim instead of using the agency as both award holder and award object.",
  ["Metro-North received the TSA Gold Standard Award in 2024."],
  ["Metro-North is not an award record and cannot have_award itself."],
));

assign([
  "relation_rel-open-data-act-has-event-signing",
  "relation_rel-mta-operates-metrics-site",
  "relation_rel-mta-plans-congestion-pricing-data",
  "relation_rel-mta-plans-operating-budget-release",
  "relation_rel-mta-publishes-open-data-plan",
  "relation_publishes-to-portal",
], replaceEndpoint(
  "subject_id",
  "entity_mta-entity-update-2025",
  "Official MTA Open Data publications use the umbrella Metropolitan Transportation Authority as actor; the NYCT subject is a historical alias collapse, not a source-supported agency assignment.",
  undefined,
  ["The cited MTA-wide Open Data material does not attribute the action specifically to NYCT."],
  ["entity"],
));

assign(["relation_rel-caremark-services-nyct"], replaceEndpoint(
  "object_id",
  "entity_mta-nyct",
  "The source explicitly says CVS Health/Caremark provides pharmacy-benefit services for NYC Transit; the object was collapsed to the vendor itself.",
  ["Caremark/CVS Health provides pharmacy benefit management services for NYC Transit."],
  ["Caremark does not serve itself."],
  ["entity"],
));

const BX15_IDENTITY_SUBMISSIONS = [
  "sub_10ebd6a95a3990e3",
  "sub_f54c705e885bb4e7",
  "sub_4fbff44709754ce0",
  "sub_b3fd1d768f00f286",
  "sub_83a3fae7f354f2ef",
  "sub_fae5bd03b76c12cb",
];
assign(["relation_bx15-local-replaces-bx55"], identityCampaign({
  submissionIds: BX15_IDENTITY_SUBMISSIONS,
  expectedSubjectId: "route_bx15-ace",
  expectedObjectId: "route_bx55-2012",
  rationale: "The source distinguishes Bx15 Local from Bx15 Limited. Six exact route submissions must be split by stated service identity before this Local replacement edge can resolve.",
  supportedClaims: ["Bx15 Local replaced Bx55 route service with all-times local service."],
}));
assign([
  "relation_bx15-ltd-replaces-bx55",
], identityCampaign({
  submissionIds: BX15_IDENTITY_SUBMISSIONS,
  expectedSubjectId: "route_bx15-ltd-webster-2012",
  expectedObjectId: "route_bx55-2012",
  rationale: "The route corpus currently mixes Bx15 Local and Limited observations. The exact source identifies Bx15 Limited as distinct from Bx15 Local and Bx55.",
  supportedClaims: ["The Bx15 Limited service succeeded the Bx55 Limited identity in the Webster/Third Avenue service plan."],
}));
assign([
  "relation_bx55-renamed-bx15-ltd",
  "relation_bx55-renamed-to-bx15-limited-2012",
], identityCampaign({
  submissionIds: BX15_IDENTITY_SUBMISSIONS,
  expectedSubjectId: "route_bx55-2012",
  expectedObjectId: "route_bx15-ltd-webster-2012",
  rationale: "The official progress material says the remaining Bx55 service was renamed Bx15 Limited. The identity campaign must preserve distinct Bx55, Bx15 Local, and Bx15 Limited rows.",
  supportedClaims: ["The remaining Bx55 route on Third Avenue was renamed Bx15 Limited."],
}));

assign(["relation_m16-related-to-m34a-sbs"], identityCampaign({
  submissionIds: ["sub_44c16acea6c24460", "sub_f43682b2b609e0e8"],
  expectedSubjectId: "route_m16-mentioned",
  expectedObjectId: "route_m34a-sbs",
  rationale: "The 2011 source contains separate M16 and M34A SBS route observations that were merged into M34A; replaying the exact old/new submissions restores two endpoints.",
  supportedClaims: ["M16 was the predecessor/related route identity for the M34A SBS service described by the source."],
}));
assign(["relation_m16-renamed-to-m34a"], identityCampaign({
  submissionIds: ["sub_db600f92a7823098", "sub_89fafdd61d0a5cf4"],
  expectedSubjectId: "route_m16-mentioned",
  expectedObjectId: "route_m34a-sbs",
  rationale: "The CAC source names M16 and M34A SBS separately; the exact submissions prove the predecessor and successor observations and must no longer canonicalize to one route.",
  supportedClaims: ["The source describes the M16-to-M34A service rename/transition."],
}));
assign(["relation_q52-sbs-replaces-ltd"], identityCampaign({
  submissionIds: ["sub_d381702a0310030d", "sub_6bace2a398e15571"],
  expectedSubjectId: "route_q52-sbs-queens",
  expectedObjectId: "route_q52-ltd-woodhaven-2014",
  rationale: "The Q52 LTD and Q52 SBS submissions are distinct service-era identities; alias collapse converted the supported predecessor relation into a self-loop.",
  supportedClaims: ["Q52 SBS replaced/succeeded Q52 LTD service."],
}));
assign(["relation_q53-sbs-replaces-ltd"], identityCampaign({
  submissionIds: ["sub_26863e165aee7983", "sub_049a143a7b11aef3"],
  expectedSubjectId: "route_q53-sbs-ace",
  expectedObjectId: "route_q53-ltd-woodhaven-2014",
  rationale: "The Q53 LTD and Q53 SBS submissions are distinct service-era identities; alias collapse converted the supported predecessor relation into a self-loop.",
  supportedClaims: ["Q53 SBS replaced/succeeded Q53 LTD service."],
}));

assign([
  "relation_batch019-mta-bt-operates-bronx-whitestone-bridge",
  "relation_batch019-mta-bt-operates-cross-bay-bridge",
  "relation_batch019-mta-bt-operates-henry-hudson-bridge",
  "relation_batch019-mta-bt-operates-hugh-l-carey-tunnel",
  "relation_batch019-mta-bt-operates-marine-parkway-bridge",
  "relation_batch019-mta-bt-operates-queens-midtown-tunnel",
  "relation_batch019-mta-bt-operates-rfk-bridge",
  "relation_batch019-mta-bt-operates-throgs-neck-bridge",
  "relation_batch019-mta-bt-operates-verrazzano-narrows-bridge",
], generatorFix(
  "legacy-remediation/batch019-facility-table-operates",
  "Stop emitting operates from the August 2025 facility revenue-collection table; retire the exact generated relation and preserve the facility/table evidence without an operator edge.",
));
assign([
  "relation_mta-bt-operates-bronx-whitestone",
  "relation_mta-bt-operates-cross-bay",
  "relation_mta-bt-operates-henry-hudson",
  "relation_mta-bt-operates-hugh-carey",
  "relation_mta-bt-operates-marine-parkway",
  "relation_mta-bt-operates-queens-midtown",
  "relation_mta-bt-operates-rfk",
  "relation_mta-bt-operates-throgs-neck",
  "relation_mta-bt-operates-verrazzano",
], generatorFix(
  "source-ingest/bt-facility-financial-table-operates",
  "Stop converting the cited facility financial table into operates edges; retire the exact relation while retaining the canonical facility and source evidence.",
));

// Endpoint and first-class-record repairs.
assign(["relation_alphapointe-adjacent-property"], retract(
  "The block distinguishes LIRR-owned and Alphapointe-owned sections of one building but does not establish a canonical parcel/building-section endpoint or an adjacency topology. Preserve the ownership narrative on the project and retract the inferred edge.",
  ["LIRR owns the section scheduled for demolition, while Alphapointe owns the remaining section of the occupied building."],
  ["The evidence does not define the two physical sections as canonical adjacent_to endpoints."],
));

assign(["relation_mta-sas2-field-office-agency"], patchRelation(
  {
    relation_family: "agency_role",
    relation_kind: "managed_by",
    subject_id: "project_sas-phase-ii-field-office-lease",
    object_id: "entity_mta-entity-update-2025",
  },
  "The source describes an MTA agency role for the SAS2 field-office lease, not for the committee approval event used as subject.",
  ["MTA is the named agency for the SAS2 field-office lease at 159 East 125th Street."],
  ["The approval event is not the lease identity for which the agency field is stated."],
));

assign(["relation_98266-graffiti-hudson-harlem"], replaceWithSubmissions(
  "The source names two physical rail lines. Replace the MNR-agency surrogate with one uses_corridor edge to each already canonical line.",
  ["The Graffiti Removal Program covers sites along the Hudson and Harlem lines."],
  ["An agency entity is not the physical corridor scope of the graffiti-removal work."],
  (context) => [
    observation(context, "relation", "relation_98266_graffiti_uses_hudson_line_20260716", "Graffiti Removal Program uses Hudson Line corridor", {
      relation_kind: "uses_corridor",
      relation_family: "corridor_scope",
      subject_id: "project_meeting-doc-104771-graffiti-removal",
      object_id: "corridor_meeting-doc-151786-hudson-line",
      description: "Graffiti removal covered buildings, bridges, retaining walls, and rock cuts along the Hudson Line.",
    }),
    observation(context, "relation", "relation_98266_graffiti_uses_harlem_line_20260716", "Graffiti Removal Program uses Harlem Line corridor", {
      relation_kind: "uses_corridor",
      relation_family: "corridor_scope",
      subject_id: "project_meeting-doc-104771-graffiti-removal",
      object_id: "corridor_meeting-doc-151786-harlem-line",
      description: "Graffiti removal covered buildings, bridges, retaining walls, and rock cuts along the Harlem Line.",
    }),
  ],
));

assign(["relation_98266-overhead-bridge-lines"], replaceWithSubmissions(
  "The block enumerates four physical lines. Reuse the three canonical corridors, create the missing Port Jervis Line physical corridor, and emit one evidence-identical scope edge per line.",
  ["The Overhead Bridge Program covered bridge-flag repairs on the Harlem, Hudson, New Haven-NY, and Port Jervis lines."],
  ["Metro-North as an agency is not a substitute for the four named physical line scopes."],
  (context) => [
    observation(context, "corridor", "corridor_port_jervis_line_98266", "Port Jervis Line", {
      corridor_name: "Port Jervis Line",
      corridor_type: "commuter rail line",
      description: "Physical Port Jervis Line named in the overhead-bridge repair scope.",
    }),
    ...[
      ["hudson", "corridor_meeting-doc-151786-hudson-line", "Hudson Line"],
      ["harlem", "corridor_meeting-doc-151786-harlem-line", "Harlem Line"],
      ["new_haven", "corridor_meeting-doc-151786-new-haven-line", "New Haven Line"],
    ].map(([slug, id, label]) => observation(
      context,
      "relation",
      `relation_98266_overhead_bridge_uses_${slug}_line_20260716`,
      `Overhead Bridge Program uses ${label} corridor`,
      {
        relation_kind: "uses_corridor",
        relation_family: "corridor_scope",
        subject_id: "project_meeting-doc-104771-overhead-bridge-program-ny",
        object_id: id,
        description: `Overhead bridge flag repairs were scoped to the ${label}.`,
      },
    )),
    observation(context, "relation", "relation_98266_overhead_bridge_uses_port_jervis_line_20260716", "Overhead Bridge Program uses Port Jervis Line corridor", {
      relation_kind: "uses_corridor",
      relation_family: "corridor_scope",
      subject_id: "project_meeting-doc-104771-overhead-bridge-program-ny",
      object_local_observation_id: "corridor_port_jervis_line_98266",
      description: "Overhead bridge flag repairs were scoped to the Port Jervis Line.",
    }),
  ],
));

assign([
  "relation_grade-crossing-territories-lirr-mnr",
  "relation_grade-crossing-territories-mnr",
], patchRelation(
  (context) => ({ ...context.fields, relation_kind: "involves_agency", relation_family: "program_project_scope" }),
  "The source scopes the Grade Crossing Safety Improvement Program to LIRR and Metro-North agency territories; it does not use those agencies as physical location endpoints.",
  undefined,
  ["The agency entities are not corridor or location records."],
));

assign(["relation_mdoc164971-fitch-trb-rating"], patchRelation(
  {
    relation_family: "claim_context",
    relation_kind: "has_claim",
    subject_id: "entity_fitch-ratings",
    object_id: "claim_mdoc164971-trb-rating-upgrade",
  },
  "The exact block states Fitch's TRB rating upgrade. Attach the canonical rating-action claim to Fitch instead of assigning an undifferentiated rating to umbrella MTA.",
  ["Fitch upgraded the Transportation Revenue Bonds rating as stated in the cited block."],
  ["The block does not describe an undifferentiated rating assigned to the umbrella MTA entity."],
));
assign([
  "relation_mdoc164971-kbra-rating",
  "relation_mdoc164971-moodys-rating",
  "relation_mdoc164971-sp-rating",
], retract(
  "The shared block contains both TRB confirmation and RETT rating statements but the relation payload does not preserve which credit each agency action concerns. Retraction is required rather than guessing across two instruments.",
  ["The cited block reports rating actions by KBRA, Moody's, and S&P for named MTA credits."],
  ["The current umbrella-MTA object loses the instrument/credit precision needed to determine the exact rating relationship."],
));

assign(["relation_mack-chairs-tbta-committee"], replaceEndpoint(
  "object_id",
  "entity_tbta-committee-charter",
  "The source's chair listing is for the TBTA operations committee, not for the Bridges and Tunnels operating agency as a whole.",
  ["David Mack is listed as Chair of the TBTA Committee."],
  ["The block does not state that David Mack chairs the B&T agency."],
  ["entity"],
));

assign(["relation_meeting-doc-194106-kpm-lirr-mnr"], replaceEndpoint(
  "subject_id",
  "source_meeting-doc-194106",
  "The Key Performance Metrics book itself is the artifact covering LIRR performance; the generic claim used as subject is a report surrogate.",
  ["The Key Performance Metrics book covers monthly LIRR performance indicators."],
  ["A narrative claim is not the report artifact that covers the railroad."],
  ["source"],
));

assign(["relation_able-enforced-by-dot"], patchRelation(
  {
    relation_family: "agency_role",
    relation_kind: "managed_by",
    subject_id: "project_able-program",
    object_id: "entity_nyc-dot",
  },
  "The block describes DOT human review and issuance administration for the ABLE program; use the canonical program instead of the one-day implementation event.",
  ["NYC DOT human review ensures ABLE violations are captured and issued according to program rules."],
  ["The implementation-onset event is not the enduring enforcement program."],
));

assign(["relation_nypd-enforces-bus-lanes"], patchRelation(
  {
    relation_family: "claim_context",
    relation_kind: "has_claim",
    subject_id: "entity_nypd",
    object_id: "claim_bus-lane-enforcement-methods",
  },
  "The source directly supports a claim about NYPD patrol and violation issuance. Treat the claim as evidence context instead of pretending the claim record is the thing being enforced.",
  ["NYPD patrols bus lanes and issues moving and parking violations."],
  ["A claim record is not an enforceable physical or legal endpoint."],
));

for (const id of [
  "relation_meeting-doc-133761-cp-funds-sas2",
  "relation_meeting-doc-157976-cp-funds-ada",
  "relation_meeting-doc-157976-cp-funds-infra",
  "relation_meeting-doc-157976-cp-funds-rolling",
  "relation_meeting-doc-157976-cp-funds-sas2",
  "relation_meeting-doc-157976-cp-funds-signal",
  "relation_meeting-doc-157976-cp-funds-sogr",
  "relation_meeting-doc-157976-cp-funds-ze",
]) {
  assign([id], patchRelation(
    (context) => ({ ...context.fields, relation_kind: "has_metric", relation_family: "metric_context" }),
    "The object is a quantified allocation/funding metric, not a funding actor. Preserve the exact project-to-metric binding without assigning agency to a number.",
    undefined,
    ["A metric value cannot be the actor in a funded_by relationship."],
  ));
}

assign(["relation_crz-bond-capital-projects"], patchRelation(
  {
    relation_family: "claim_context",
    relation_kind: "has_claim",
    subject_id: "project_2020-2024-capital-program-meeting-doc-152166",
    object_id: "claim_crz-bond-resolution-submitted",
  },
  "The source supports a capital-program funding claim about the CRZ Bond Resolution. The claim is context for the program, not itself a funding actor.",
  ["CRZ-backed notes and bonds are intended to fund $15 billion of authorized transit and commuter-rail capital projects."],
  ["A claim record does not itself fund the capital program."],
));

assign(["relation_meeting-doc-113946-grandstaff-safety"], reportReplacement({
  reportLocalId: "report_meeting_doc_113946_safety_security",
  reportLabel: "Safety and Security Report (meeting_doc_113946)",
  reportDescription: "Safety and Security Report item delivered by Norman Grandstaff at the cited meeting.",
  presenterId: "entity_meeting-doc-113946-norman-grandstaff",
  presenterLabel: "Norman Grandstaff",
  relationKind: "delivered_by",
}));

assign(["relation_safety-report-gulotta"], replaceWithSubmissions(
  "The block identifies a named presenter and a Safety and Security Report. Create both the missing person and report identities, then link the report to the person.",
  ["Joseph Gulotta, Chief of Transit, NYPD delivered the Safety and Security Report."],
  ["The crime-decrease claim is not the report artifact, and the NYPD Transit Bureau entity is not Joseph Gulotta."],
  (context) => [
    observation(context, "entity", "entity_joseph_gulotta_nypd_transit", "Joseph Gulotta", {
      entity_name: "Joseph Gulotta",
      entity_type: "person",
      title: "Chief, Transit, NYPD",
      organization: "NYPD Transit Bureau",
    }),
    observation(context, "source", "report_safety_security_gulotta_170981", "Safety and Security Report (meeting_doc_170981)", {
      title: "Safety and Security Report (meeting_doc_170981)",
      content_type: "embedded official report",
      description: "Safety and Security Report delivered by Joseph Gulotta, Chief of Transit, NYPD.",
    }),
    observation(context, "relation", "relation_report_safety_security_gulotta_presented_by_20260716", "Safety and Security Report delivered by Joseph Gulotta", {
      relation_kind: "presented_by",
      relation_family: "agency_role",
      subject_local_observation_id: "report_safety_security_gulotta_170981",
      object_local_observation_id: "entity_joseph_gulotta_nypd_transit",
      assertion_status: "delivered",
      description: "Joseph Gulotta delivered the Safety and Security Report.",
    }),
  ],
));

assign(["relation_cd-presented-by-torres-springer"], reportReplacement({
  reportLocalId: "report_cd_president_205556",
  reportLabel: "MTA C&D President's Report (meeting_doc_205556)",
  reportDescription: "MTA Construction & Development President's Report presented by Jamie Torres-Springer.",
  presenterId: "entity_jamie-torres-springer-cdo",
  presenterLabel: "Jamie Torres-Springer",
}));
assign(["relation_lirr-presented-by-free"], reportReplacement({
  reportLocalId: "report_lirr_president_205556",
  reportLabel: "LIRR President's Report (meeting_doc_205556)",
  reportDescription: "Long Island Rail Road President's Report presented by Rob Free.",
  presenterId: "entity_meeting-doc-129041-robert-free",
  presenterLabel: "Rob Free",
}));
assign(["relation_mnr-presented-by-vonashek"], reportReplacement({
  reportLocalId: "report_mnr_president_205556",
  reportLabel: "Metro-North President's Report (meeting_doc_205556)",
  reportDescription: "Metro-North Railroad President's Report presented by Justin Vonashek.",
  presenterId: "entity_meeting-doc-113891-justin-vonashek",
  presenterLabel: "Justin Vonashek",
}));
assign(["relation_nyct-presented-by-crichlow"], reportReplacement({
  reportLocalId: "report_nyct_president_205556",
  reportLabel: "NYC Transit President's Report (meeting_doc_205556)",
  reportDescription: "New York City Transit President's Report presented by Demetrius Crichlow.",
  presenterId: "entity_demetrius-crichlow",
  presenterLabel: "Demetrius Crichlow",
}));

assign(["relation_meeting-doc-164901-cubic-contract"], contractReplacement({
  projectLocalId: "contract_cubic_a34024_bus_validator_modification_164901",
  projectLabel: "Contract A-34024 Bus Validator Hardware Modification",
  projectDescription: "Modification awarded to Cubic Transportation Systems for bus-validator mounting hardware, wiring, and accelerated change work.",
  vendorId: "entity_cubic-transportation-systems",
  vendorLabel: "Cubic Transportation Systems",
  claimId: "claim_meeting-doc-164901-cubic-item-4",
}));
assign(["relation_meeting-doc-164901-skanska-contracts"], contractReplacement({
  projectLocalId: "contract_skanska_rr_jv_items_1_2_164901",
  projectLabel: "Skanska-Railroad JV Procurement Items 1 and 2",
  projectDescription: "The two procurement actions attributed by the source to Skanska-Railroad JV.",
  vendorId: "entity_meeting-doc-164901-skanska-rr-jv",
  vendorLabel: "Skanska-Railroad JV",
  claimId: "claim_meeting-doc-164901-skanska-items-1-2",
}));
assign(["relation_meeting-doc-164901-tutor-contract"], contractReplacement({
  projectLocalId: "contract_tutor_perini_item_3_164901",
  projectLabel: "Tutor Perini Procurement Item 3",
  projectDescription: "The procurement action attributed by the source to Tutor Perini Corporation.",
  vendorId: "entity_tutor-perini-corporation",
  vendorLabel: "Tutor Perini Corporation",
  claimId: "claim_meeting-doc-164901-tutor-perini-item-3",
}));

assign(["relation_gct-has-elevators-escalators-map"], patchRelation(
  {
    relation_family: "publication_role",
    relation_kind: "describes_entity",
    subject_id: "source_meeting-doc-135296",
    object_id: "entity_grand-central-terminal",
  },
  "The object is the official year-end report/map that describes GCT's elevator and escalator inventory, not a facility. Preserve the physical inventory in the terminal evidence and make the binary edge documentary.",
  ["The cited official map identifies GCT elevator and escalator locations."],
  ["A report source is not itself a facility contained by Grand Central Terminal."],
));

assign(["relation_meeting128916-mnr-legal-name"], patchRelation(
  {
    relation_family: "claim_context",
    relation_kind: "has_claim",
    subject_id: "entity_meeting-doc-124881-mnr",
    object_id: "claim_164896-legal-name",
  },
  "The object was an unrelated committee entity. The exact legal-name fact already has a canonical claim and is appropriately attached to the Metro-North entity.",
  ["The legal name of MTA Metro-North Railroad is Metro-North Commuter Railroad Company."],
  ["The cited block does not make a committee the legal name of Metro-North."],
));

for (const id of [
  "relation_170996-real-estate-gct-license",
  "relation_hrg-east-hampton-location",
  "relation_markys-gct-location",
]) {
  assign([id], patchRelation(
    (context) => ({ ...context.fields, relation_kind: "has_claim", relation_family: "claim_context" }),
    "The object is a lease/license claim, not a physical location. Preserve the exact party-to-claim context without converting a claim into a place.",
    undefined,
    ["A claim record cannot serve as a has_location endpoint."],
  ));
}

assign(["relation_fos-contract-eastern-pkwy"], contractReplacement({
  projectLocalId: "contract_c48703_mod08_eastern_parkway_115231",
  projectLabel: "Contract C-48703 Modification 08 - Eastern Parkway Line Repairs",
  projectDescription: "Modification 08 to the Eastern Parkway Line structure-component repair contract, awarded to FOS Development Corporation.",
  vendorId: "entity_fos-development-meeting-doc-115231",
  vendorLabel: "FOS Development Corporation",
  claimId: "claim_eastern-pkwy-fiberglass-plenum-plates",
}));

assign(["relation_safety-deployments-nypd"], retract(
  "The two cited headings state a safety outcome and subway police deployments but do not establish the stored partner relationship or causal contribution at exact precision.",
  ["The source juxtaposes 'Safest Year in a Generation' with 'Subway Police Deployments'."],
  ["The cited headings alone do not prove a has_partner or causal edge between the claim and NYPD."],
));

assign(["relation_b-t-business-unit-verrazzano"], replaceWithSubmissions(
  "The staff summary identifies a B&T Business Unit and separately names Joe Keane. Create the organizational unit and link the project to that department rather than using a person as the department endpoint.",
  ["The B&T Business Unit is the responsible department for the Verrazzano painting and lighting contract; Joe Keane is its listed head."],
  ["Joe Keane as a person is not the responsible-department identity."],
  (context) => [
    observation(context, "entity", "entity_bt_business_unit_133356", "B&T Business Unit", {
      entity_name: "B&T Business Unit",
      entity_type: "organizational unit",
      parent_organization: "MTA Bridges and Tunnels",
      department_head: "Joe Keane",
    }),
    observation(context, "relation", "relation_verrazzano_project_responsible_bt_business_unit_20260716", "Verrazzano project responsible department: B&T Business Unit", {
      relation_kind: "has_responsible_department",
      relation_family: "agency_role",
      subject_id: "project_verrazzano-narrows-painting-feb2024",
      object_local_observation_id: "entity_bt_business_unit_133356",
      description: "The B&T Business Unit is the requesting/responsible department for the Verrazzano painting and lighting action.",
    }),
  ],
));

assign(["relation_delivery-department-mnr-fire"], replaceWithSubmissions(
  "The staff summary names Delivery as the department and Mark Roche as its head. Create the department identity and retain the person only as an attribute of that organization.",
  ["Delivery is the responsible department for the Metro-North signal-house fire-suppression action; Mark Roche is the listed department head."],
  ["Mark Roche as a person is not the responsible-department endpoint."],
  (context) => [
    observation(context, "entity", "entity_mnr_delivery_department_133356", "Metro-North Delivery Department", {
      entity_name: "Metro-North Delivery Department",
      entity_type: "department",
      parent_organization: "MTA Metro-North Railroad",
      department_head: "Mark Roche",
    }),
    observation(context, "relation", "relation_mnr_fire_project_responsible_delivery_department_20260716", "MNR fire-suppression project responsible department: Delivery", {
      relation_kind: "has_responsible_department",
      relation_family: "agency_role",
      subject_id: "project_fire-suppression-mnr-signal-houses-feb2024",
      object_local_observation_id: "entity_mnr_delivery_department_133356",
      description: "The Metro-North Delivery Department is responsible for the fire-suppression procurement action.",
    }),
  ],
));

assign(["relation_jamie-torres-springer-president-cd"], replaceEndpoint(
  "object_id",
  "entity_mta-construction-and-development",
  "The source identifies Jamie Torres-Springer as President of MTA Construction & Development, not head of the umbrella MTA organization.",
  ["Jamie Torres-Springer is President of MTA Construction & Development."],
  ["The cited title does not make Jamie Torres-Springer head of umbrella MTA."],
  ["entity"],
));

assign(["relation_nyct-employee-vaccination-site"], replaceWithSubmissions(
  "The source gives a physical street address for the vaccination site. Create that location and point the event to it rather than using NYCT as a place.",
  ["The employee vaccination site was at 130 Livingston Street."],
  ["NYCT is an organization, not the physical vaccination-site endpoint."],
  (context) => [
    observation(context, "entity", "entity_130_livingston_street", "130 Livingston Street", {
      entity_name: "130 Livingston Street",
      entity_type: "physical address",
      address: "130 Livingston Street, Brooklyn, New York",
    }),
    observation(context, "relation", "relation_employee_vaccination_site_located_130_livingston_20260716", "Employee vaccination site at 130 Livingston Street", {
      relation_kind: "located_at",
      relation_family: "location_scope",
      subject_id: "event_employee-vaccination-site-feb24-2021",
      object_local_observation_id: "entity_130_livingston_street",
      description: "The employee vaccination event was held at 130 Livingston Street.",
    }),
  ],
));

assign(["relation_meeting-doc-72546-p3-ada-nyct"], patchRelation(
  {
    relation_family: "program_project_scope",
    relation_kind: "involves_agency",
    subject_id: "project_meeting-doc-72546-ada-p3-elevators",
    object_id: "entity_mta-nyct",
  },
  "The block states an aggregate scope of 23 NYCT stations but does not enumerate physical stations. Preserve only the supported agency scope and do not manufacture location endpoints.",
  ["The P3 ADA elevator work applies to 23 NYCT stations in aggregate."],
  ["The cited block does not identify individual station endpoints and the umbrella MTA entity is not a location."],
));

for (const id of [
  "relation_rel-meeting-doc-194166-novi-issuing-eagle",
  "relation_rel-meeting-doc-194166-novi-issuing-mtapd",
  "relation_rel-meeting-doc-194166-novi-issuing-nypd",
]) {
  assign([id], patchRelation(
    (context) => ({ ...context.fields, relation_kind: "submits_to", relation_family: "governance_legal" }),
    "The official TAB description says these enforcement bodies issue Notices of Violation that TAB processes. Encode the directed notice handoff rather than saying each body issues TAB itself.",
    undefined,
    ["TAB is not the Notice of Violation that the enforcement entity issues."],
  ));
}

assign(["relation_meeting-doc-115211-rail-grind-lirr"], replaceEndpoint(
  "subject_id",
  "project_joint-agency-rail-grinding-services",
  "The evidence describes a joint-agency rail-grinding procurement led by LIRR; the existing project is the proper subject, not the narrative claim.",
  ["LIRR acts on behalf of itself, Metro-North, and NYCT for the joint rail-grinding services procurement."],
  ["A claim record is not the project for which LIRR has the lead-agency role."],
  ["project"],
));

assign(["relation_pmt2024c-led-by-jpmorgan"], retract(
  "The only cited block identifies the PMT 2024C bond issuance but does not name JPMorgan. A JPMorgan entity elsewhere in the corpus cannot repair missing evidence for this exact edge.",
  ["The cited block identifies the TBTA PMT 2024C bond issuance."],
  ["The cited block does not support JPMorgan as lead manager."],
));

assign(["relation_166906-jamaica-maintained-by-port-authority"], replaceWithSubmissions(
  "The source states a physical equipment-maintenance responsibility at Jamaica. Create the bounded equipment group and link it to the Port Authority instead of using LIRR as the maintained object/subject surrogate.",
  ["The Port Authority maintains Jamaica elevators and escalators except platform F equipment."],
  ["The LIRR organization is not the physical equipment being maintained."],
  (context) => [
    observation(context, "entity", "entity_jamaica_station_vertical_transportation_except_platform_f", "Jamaica Station elevators and escalators (except Platform F)", {
      entity_name: "Jamaica Station elevators and escalators (except Platform F)",
      entity_type: "station equipment group",
      location: "Jamaica Station",
      extent: "Elevators and escalators excluding Platform F equipment",
    }),
    observation(context, "relation", "relation_jamaica_vertical_transportation_maintained_by_port_authority_20260716", "Jamaica vertical-transportation equipment maintained by Port Authority", {
      relation_kind: "maintained_by",
      relation_family: "dependency_or_reference",
      subject_local_observation_id: "entity_jamaica_station_vertical_transportation_except_platform_f",
      object_id: "entity_port-authority-ny-nj",
      description: "The Port Authority maintains Jamaica Station elevators and escalators except Platform F equipment.",
    }),
  ],
));

assign(["relation_meeting-doc-164961-davis-manages-procurement"], replaceWithSubmissions(
  "The staff summary names a procurement authorization as the managed project. Create the procurement action and link it to Rose Davis instead of treating the source document as the managed object.",
  ["Rose Davis is Project Manager for the MTA Headquarters request to award various procurements."],
  ["The meeting-book source is not the procurement project she manages."],
  (context) => [
    observation(context, "project", "project_mta_hq_various_procurements_authorization_164961", "MTA Headquarters Various Procurements Authorization", {
      project_name: "MTA Headquarters Various Procurements Authorization",
      project_type: "procurement authorization",
      project_family: "contract_or_procurement",
      document_time_status: "board_action_requested",
      description: "Request for authorization to award various procurements managed by Rose Davis for the MTA Procurement Department.",
    }),
    observation(context, "relation", "relation_mta_hq_various_procurements_managed_by_davis_20260716", "MTA HQ various procurements managed by Rose Davis", {
      relation_kind: "managed_by",
      relation_family: "agency_role",
      subject_local_observation_id: "project_mta_hq_various_procurements_authorization_164961",
      object_id: "entity_rose-davis",
      description: "Rose Davis is the project manager for the procurement authorization.",
    }),
  ],
));

assign(["relation_mta-real-estate-gct-retail_2"], patchRelation(
  (context) => ({
    relation_family: context.fields.relation_family,
    relation_kind: context.fields.relation_kind,
    subject_id: context.fields.object_id,
    object_id: context.fields.subject_id,
  }),
  "The event is organized by MTA Real Estate; the legacy row reverses organizer and organized event.",
  ["MTA Real Estate organized the July 2024 Grand Central Terminal retail-development event."],
  ["MTA Real Estate is not organized_by the event."],
));

assign([
  "relation_mta-has-finance-committee",
  "relation_mta-sub-lirr",
  "relation_mta-sub-mnr",
  "relation_mta-sub-mtabus",
  "relation_mta-sub-nyct",
  "relation_mta-sub-sir",
], patchRelation(
  (context) => ({
    relation_family: context.fields.relation_family,
    relation_kind: context.fields.relation_kind,
    subject_id: context.fields.object_id,
    object_id: context.fields.subject_id,
  }),
  "Under the established parent_entity predicate direction, the child/committee is subject and the parent MTA organization is object; the imported endpoints are reversed.",
  undefined,
  ["The umbrella MTA organization is not a child of each listed agency or committee."],
));

assign(["relation_safety-committee-composition"], replaceWithSubmissions(
  "The evidence names a distinct NYCT Safety Committee and its labor representation. Create the committee and point TWU Local 100 to it instead of using the safety-plan source as the committee endpoint.",
  ["TWU Local 100 provides three voting frontline-worker representatives to the NYCT Safety Committee."],
  ["The safety-plan source document is not the committee in which TWU participates."],
  (context) => [
    observation(context, "entity", "entity_nyct_safety_committee_199166", "NYCT Safety Committee", {
      entity_name: "NYCT Safety Committee",
      entity_type: "joint labor-management safety committee",
      organization: "New York City Transit",
      management_voting_members: 3,
      labor_voting_members: 3,
    }),
    observation(context, "relation", "relation_nyct_safety_committee_has_twu_local_100_participant_20260716", "NYCT Safety Committee has TWU Local 100 participation", {
      relation_kind: "has_participant",
      relation_family: "partnership_engagement",
      subject_local_observation_id: "entity_nyct_safety_committee_199166",
      object_id: "entity_twu-local-100",
      description: "TWU Local 100 supplies three voting frontline-worker representatives to the NYCT Safety Committee.",
    }),
  ],
));

assign(["relation_dmb-prepares-ridership-report"], reportReplacement({
  reportLocalId: "report_ridership_data_through_july_2023",
  reportLabel: "Ridership Data Through July 2023",
  reportDescription: "Ridership report prepared by the MTA Department of Management and Budget.",
  presenterId: "entity_meeting-doc-113981-mta-dmb",
  presenterLabel: "MTA Department of Management and Budget",
  relationKind: "prepared_by",
}));
assign(["relation_mta-finance-prepared-year-end-review"], reportReplacement({
  reportLocalId: "report_2020_year_end_review_26831",
  reportLabel: "2020 Year-End Review",
  reportDescription: "2020 Year-End Review prepared by MTA Finance for the Finance Committee material.",
  presenterId: "entity_meeting-doc-111901-mta-finance",
  presenterLabel: "MTA Finance",
  relationKind: "prepared_by",
}));

assign(["relation_meeting-doc-133551-nyct-bus-camera"], patchRelation(
  {
    relation_family: "funding_award",
    relation_kind: "awarded_to",
    subject_id: "project_bcss-maintenance-contract-440943",
    object_id: "entity_seon-design-usa-corp",
  },
  "The source supports a Bus Camera Security System maintenance contract awarded to Seon. Both first-class endpoints already exist; the dollar metric cannot be the procured object.",
  ["NYC Transit awarded the BCSS maintenance and support contract to Seon Design (USA) Corp."],
  ["A contract-value metric is not what NYC Transit procures."],
));

assign(["relation_bridges-tunnels-support-mass-transit"], replaceEndpoint(
  "object_id",
  "entity_mta-entity-update-2025",
  "The annual report describes B&T support for the MTA's regional transit operations in aggregate. C&D alone is an unsupported recipient narrowing.",
  ["B&T provided approximately $1.38 billion in support for MTA regional transit operations in 2021."],
  ["The cited passages do not assign the full support amount specifically to MTA Construction & Development."],
  ["entity"],
));

assign(["relation_meeting-doc-205571-fema-grant"], replaceWithSubmissions(
  "The block names a specific funded system. Create that project and link it to FEMA; a publication source cannot be the grant recipient/project endpoint.",
  ["A $3.6 million FEMA Transit Security Grant was awarded in 2025 for a Tactical Deployable Camera System."],
  ["The meeting-book source is not the funded camera-system project."],
  (context) => [
    observation(context, "project", "project_tactical_deployable_camera_system_205571", "Tactical Deployable Camera System", {
      project_name: "Tactical Deployable Camera System",
      project_type: "transit security camera system",
      project_family: "enforcement_program",
      document_time_status: "funded",
      funding_amount: "$3.6 million",
      funding_year: "2025",
      description: "Tactical Deployable Camera System funded by a 2025 FEMA Transit Security Grant.",
    }),
    observation(context, "relation", "relation_tactical_deployable_camera_system_funded_by_fema_20260716", "Tactical Deployable Camera System funded by FEMA", {
      relation_kind: "funded_by",
      relation_family: "funding_award",
      subject_local_observation_id: "project_tactical_deployable_camera_system_205571",
      object_id: "entity_fema-meeting-doc-101141",
      assertion_status: "approved",
      description: "FEMA awarded a $3.6 million Transit Security Grant for the Tactical Deployable Camera System.",
    }),
  ],
));

assign(["relation_menotti-safety-bt"], replaceEndpoint(
  "object_id",
  "entity_mta-bridges-and-tunnels",
  "The procurement material names B&T as recipient of Menotti's safety services; the meeting-book source is only provenance.",
  ["Menotti Enterprise provides the cited safety service for MTA Bridges and Tunnels."],
  ["A source document is not the service recipient."],
  ["entity"],
));

assign(["relation_lirr-simulator-funding-esa"], replaceEndpoint(
  "object_id",
  "project_annual-2021-east-side-access",
  "The evidence ties the LIRR simulator systems to East Side Access, not to the unrelated CBD tolling program produced by identity collapse.",
  ["The LIRR train-simulator systems are related to/funded in support of East Side Access."],
  ["The cited block does not link the simulator project to CBDTP."],
  ["project"],
));

assign(["relation_tab-report-to-transit-committee"], replaceEndpoint(
  "object_id",
  "entity_meeting-doc-140466-nyct-committee-members",
  "The report's stated audience is the Transit Committee. TAB is the report subject, not the committee recipient.",
  ["The Standard Follow-Up Report updates the Transit Committee on TAB activities and outcomes."],
  ["The source report does not report_to TAB itself."],
  ["entity"],
));

assign(["relation_meeting-doc-127516-budget-dec2023-committee"], replaceEndpoint(
  "object_id",
  "entity_long-island-committee",
  "The event is a LIRR budget item reviewed by the Long Island Committee; the LIRR operating agency is not the reviewing committee.",
  ["The Long Island Committee reviews/recommends action on the cited final proposed budget item."],
  ["LIRR as an agency is not the committee named by the source."],
  ["entity"],
));

assign([
  "relation_meeting-doc-174096-cubic-ai-serves-nyct-bus",
  "relation_meeting-doc-174096-cubic-pos-serves-nyct-bus",
], replaceEndpoint(
  "subject_id",
  "entity_cubic-transportation-systems",
  "The contract table names Cubic Transportation Systems as the provider serving NYC Transit/MTA Bus; the amount/feature metric is not a service provider.",
  undefined,
  ["A metric value cannot serve an agency."],
  ["entity"],
));

assign(["relation_mitsubishi-supplies-item1"], patchRelation(
  {
    relation_family: "funding_award",
    relation_kind: "awarded_to",
    subject_id: "project_m7-propulsion-system-upgrade",
    object_id: "entity_mitsubishi-electric-power-products",
  },
  "The canonical M7 propulsion procurement already exists. Link that contract/project to Mitsubishi instead of treating the contract-value metric as supplied equipment.",
  ["The M7 propulsion-system equipment upgrade purchase agreement was awarded to Mitsubishi Electric Power Products."],
  ["The dollar metric is not the equipment or contract being supplied."],
));
assign(["relation_mitsubishi-supplies-item2"], patchRelation(
  {
    relation_family: "funding_award",
    relation_kind: "awarded_to",
    subject_id: "project_oem-replacement-parts-meppi-meeting-doc-133401",
    object_id: "entity_mitsubishi-electric-power-products",
  },
  "The canonical OEM replacement-parts procurement already exists. Link the procurement to Mitsubishi rather than using its value metric as a contract endpoint.",
  ["The five-year OEM replacement-parts contract was awarded to Mitsubishi Electric Power Products."],
  ["The dollar metric is not the replacement-parts contract."],
));

assign(["relation_qblw-systra-176356"], retract(
  "The cited block requests additional engineering support for QBLW CBTC but names neither SYSTRA nor Siemens. The stored Siemens endpoint contradicts the relation label and cannot be repaired from this evidence.",
  ["The cited block supports additional engineering support for QBLW CBTC installation."],
  ["The cited block does not identify SYSTRA or Siemens as the support provider."],
));

assign(["relation_pcac-supports-federal-funding"], retract(
  "The cited block fragment discusses federal funding adequacy but does not establish PCAC support for the specific public-hearing event endpoint.",
  ["The source discusses federal funding for the MTA capital program."],
  ["It does not support the stored PCAC supports hearing-event edge."],
));

assign(["relation_project-34th-corridor-14th"], replaceEndpoint(
  "object_id",
  "corridor_34th-st-busway",
  "The source explicitly names 34th Street Phase II SBS and an exclusive busway on 34th Street; the 14th Street corridor endpoint is an identity error.",
  ["The 34th Street SBS Phase II project was planning an exclusive busway on 34th Street."],
  ["The cited blocks do not place this project on the 14th Street corridor."],
  ["corridor"],
));
assign(["relation_project-uses-corridor-cross-bay-2015"], replaceEndpoint(
  "object_id",
  "corridor_woodhaven-cross-bay-blvds",
  "The project is the Woodhaven/Cross Bay SBS program and the official draft-plan source supports the combined canonical corridor, not the narrow Liberty-to-109th Cross Bay segment selected by the legacy row.",
  ["The Woodhaven/Cross Bay SBS project uses the Woodhaven/Cross Bay Boulevards corridor."],
  ["The cited block does not prove that this project edge is bounded only to the Liberty Avenue/109th Avenue Cross Bay segment."],
  ["corridor"],
));
assign(["relation_rel-126th-curb-project-uses-corridor"], replaceWithSubmissions(
  "The map and notes identify a distinct 126th Street segment. Create that bounded physical corridor instead of linking the project to 125th Street by street-name proximity.",
  ["The curb-regulation changes apply on 126th Street between St. Nicholas/Frederick Douglass/Adam Clayton Powell/Lenox-area cross streets as mapped."],
  ["The cited evidence does not place the 126th Street project on the 125th Street corridor."],
  (context) => [
    observation(context, "corridor", "corridor_126th_street_fdb_lenox_2015", "126th Street curb-regulation segment", {
      corridor_name: "126th Street curb-regulation segment",
      corridor_type: "street segment",
      street: "126th Street",
      borough: "Manhattan",
      limits: "Frederick Douglass Boulevard to Lenox Avenue, with mapped St. Nicholas/Adam Clayton Powell context",
      description: "Bounded 126th Street segment shown in the curb-regulation proposal map and notes.",
    }),
    observation(context, "relation", "relation_126th_curb_project_uses_126th_corridor_20260716", "126th Street curb project uses 126th Street segment", {
      relation_kind: "uses_corridor",
      relation_family: "corridor_scope",
      subject_id: "project_126th-st-curb-reg-changes",
      object_local_observation_id: "corridor_126th_street_fdb_lenox_2015",
      description: "The curb-regulation changes use the bounded 126th Street segment shown in the official map.",
    }),
  ],
));

assign(["relation_meeting91591-nova-kingsbridge-depot"], replaceWithSubmissions(
  "The source names a bounded five-bus Nova test fleet as the physical user of Kingsbridge charging. Create that fleet and link it to the depot instead of assigning a facility to a dollar metric or stretching a project-to-facility shape beyond the v1 contract.",
  ["The five Nova all-electric buses will use existing in-depot charging stations at Kingsbridge Depot."],
  ["A dollar metric cannot use a physical facility, and the v1 contract does not treat a procurement project itself as the physical facility user."],
  (context) => [
    observation(context, "entity", "entity_nova_aeb_test_fleet_91591", "Nova all-electric bus test fleet", {
      entity_name: "Nova all-electric bus test fleet",
      entity_type: "bus fleet",
      fleet_size: 5,
      vehicle_type: "low-floor 40-foot all-electric buses",
      description: "Five Nova all-electric buses assigned to the Kingsbridge Depot test and charging program.",
    }),
    observation(context, "relation", "relation_nova_aeb_test_fleet_uses_kingsbridge_depot_20260716", "Nova all-electric bus test fleet uses Kingsbridge Depot", {
      relation_kind: "uses_facility",
      relation_family: "location_scope",
      subject_local_observation_id: "entity_nova_aeb_test_fleet_91591",
      object_id: "entity_meeting91591-kingsbridge-depot",
      description: "The five Nova all-electric buses use existing in-depot charging stations at Kingsbridge Depot.",
    }),
  ],
));

for (const id of [
  "relation_mta-total-includes-lirr-192326",
  "relation_mta-total-includes-mnr-192326",
  "relation_mta-total-includes-mta-bus-192326",
  "relation_mta-total-includes-nyct-192326",
  "relation_mta-total-includes-sir-192326",
]) {
  assign([id], retract(
    "The source is a statistical MTA-total table, not an organization graph. Preserve the table fact in its source/metric context and retract the entity-to-entity hierarchy edge; v1 has no canonical aggregate-statistic endpoint that would make an exact replacement truthful.",
    ["The cited table reports an agency value alongside an MTA Total Agency Average."],
    ["A statistical subtotal does not prove an organization-hierarchy relation or an entity-to-entity metric inclusion edge."],
  ));
}

assign(["relation_meeting-doc-133551-cd-verrazzano"], patchRelation(
  {
    relation_family: "funding_award",
    relation_kind: "contracted_with",
    subject_id: "project_verrazzano-narrows-painting-feb2024",
    object_id: "entity_entech-engineering-feb2024",
  },
  "The source describes EnTech as project-management consultant on the already canonical Verrazzano painting/lighting project. C&D is the requesting agency, not the thing implemented by EnTech.",
  ["The Verrazzano painting and lighting project contracted with EnTech for project-management consultant services."],
  ["C&D does not implement the EnTech vendor entity."],
));
assign(["relation_meeting-doc-171141-mta-eagle"], patchRelation(
  (context) => ({ ...context.fields, relation_kind: "has_participant", relation_family: "partnership_engagement" }),
  "The block supports MTA EAGLE Team deployments on buses. Use the contract-native participant role without treating the team as a project implemented by MTA.",
  ["MTA deploys the EAGLE Team on buses at intervention stops."],
  ["The EAGLE Team entity is not an implemented project."],
));
assign(["relation_mtacd-loop1a-contract-ch058a"], replaceEndpoint(
  "object_id",
  "project_annual-2021-east-side-access",
  "The cited CH058A Loop 1A work is explicitly for East Side Access. LIRR benefits from/accesses the work but is not the project implemented by C&D.",
  ["MTA C&D implements the cited Loop 1A track work for the East Side Access project."],
  ["The source does not say C&D implements the LIRR agency."],
  ["project"],
));

assign(["relation_efficiencies-agencies"], replaceWithSubmissions(
  "The source describes a distinct operating-efficiencies plan with multiple agency scopes. Create the plan and emit the full stated scope instead of misusing umbrella-MTA operates NYCT.",
  ["The 2023 operating efficiencies focused on NYCT, LIRR, Metro-North, and B&T operations; the new plan also includes MTA Headquarters."],
  ["The paragraph is not evidence that umbrella MTA operates the NYCT entity."],
  (context) => {
    const planLocalId = "project_mta_operating_efficiencies_plan_194126";
    const agencies = [
      ["nyct", "entity_mta-nyct", "NYC Transit"],
      ["lirr", "entity_annual-report-2021-lirr", "Long Island Rail Road"],
      ["mnr", "entity_meeting-doc-124881-mnr", "Metro-North Railroad"],
      ["bt", "entity_mta-bridges-and-tunnels", "MTA Bridges and Tunnels"],
      ["hq", "entity_mta-entity-update-2025", "MTA Headquarters/umbrella MTA"],
    ];
    return [
      observation(context, "project", planLocalId, "MTA Operating Efficiencies Plan", {
        project_name: "MTA Operating Efficiencies Plan",
        project_type: "operating-efficiency program",
        project_family: "internal_operations",
        document_time_status: "active",
        description: "Plan for recurring operating savings across MTA operating agencies and headquarters/shared services.",
      }),
      ...agencies.map(([slug, agencyId, label]) => observation(
        context,
        "relation",
        `relation_mta_efficiencies_plan_applies_to_${slug}_20260716`,
        `MTA Operating Efficiencies Plan applies to ${label}`,
        {
          relation_kind: "involves_agency",
          relation_family: "program_project_scope",
          subject_local_observation_id: planLocalId,
          object_id: agencyId,
          description: `The official plan identifies ${label} within its operating-efficiency scope.`,
        },
      )),
    ];
  },
));

assign(["relation_meeting-doc-176421-mta-operates-nyct"], retract(
  "The block says NYCT and MTA Bus operate NYC subways and buses; it does not say umbrella MTA operates the NYCT organization. The agency identity facts remain canonical without this malformed edge.",
  ["NYC Transit and MTA Bus operate New York City's subway and bus services."],
  ["The cited paragraph does not support an entity-to-entity operates edge from umbrella MTA to NYCT."],
));

assign(["relation_lirr-work-plan-summer-track-esa"], patchRelation(
  {
    relation_family: "dependency_or_reference",
    relation_kind: "supports",
    subject_id: "event_lirr-work-plan-jun-2024-summer-trackwork",
    object_id: "project_east-side-access-support",
  },
  "The work-plan/trackwork event supports East Side Access readiness work. The legacy edge reverses the support direction and uses the broader agenda event.",
  ["June 2024 summer trackwork and schedule adjustments support East Side Access readiness projects."],
  ["The East Side Access support project does not support the work-plan event."],
));
assign([
  "relation_summer-trackwork-supports-east-side-access-readiness",
  "relation_summer-trackwork-supports-main-line-second-track",
  "relation_winter-trackwork-supports-jamaica-capacity",
], patchRelation(
  (context) => ({
    relation_family: context.fields.relation_family,
    relation_kind: context.fields.relation_kind,
    subject_id: context.fields.object_id,
    object_id: context.fields.subject_id,
  }),
  "The cited operational work-plan event supports the named capital/readiness project. The legacy importer reversed the dependency direction.",
  undefined,
  ["The supported capital project is not the actor that supports the trackwork event."],
));

for (const [relationId, contributorId, contributorLabel, contributionLocalId] of [
  ["relation_lynch-architect-taxi-reimbursement-app", "entity_dennis-lynch", "Dennis Lynch", "relation_dennis_lynch_contributed_to_taxi_reimbursement_improvement_20260716"],
  ["relation_ye-led-taxi-reimbursement-improvement", "entity_jason-ye", "Jason Ye", "relation_jason_ye_contributed_to_taxi_reimbursement_improvement_20260716"],
] as const) {
  assign([relationId], replaceWithSubmissions(
    "The evidence attributes work by the named person/team to a distinct taxi-reimbursement processing-improvement project and its measured result. Model the project, the contributor role, and the project-to-metric link instead of connecting a person directly to a numeric metric.",
    [`${contributorLabel} contributed to the taxi-reimbursement processing improvement represented by the 83 percent processing-time metric.`],
    ["A person does not acts_as a numeric metric, and contributed_to does not allow an entity-to-metric endpoint shape."],
    (context) => [
      observation(context, "project", "project_taxi_reimbursement_processing_improvement_133281", "Taxi Reimbursement Processing Improvement", {
        project_name: "Taxi Reimbursement Processing Improvement",
        project_type: "customer reimbursement process improvement",
        project_family: "internal_operations",
        document_time_status: "operational",
        description: "Application and workflow improvement for customer taxi-reimbursement processing associated with an 83 percent faster processing-time result.",
      }),
      observation(context, "relation", contributionLocalId, `${contributorLabel} contributed to Taxi Reimbursement Processing Improvement`, {
        relation_kind: "contributed_to",
        relation_family: "partnership_engagement",
        subject_id: contributorId,
        object_local_observation_id: "project_taxi_reimbursement_processing_improvement_133281",
        description: `${contributorLabel} contributed to the taxi-reimbursement application or processing improvement described in the official recognition text.`,
      }),
      observation(context, "relation", "relation_taxi_reimbursement_processing_improvement_has_83pct_metric_20260716", "Taxi Reimbursement Processing Improvement has 83 percent processing-time metric", {
        relation_kind: "has_metric",
        relation_family: "metric_context",
        subject_local_observation_id: "project_taxi_reimbursement_processing_improvement_133281",
        object_id: "metric_taxi-reimb-processing-time-improvement-83pct",
        description: "The canonical metric records the source-stated 83 percent processing-time improvement for the taxi-reimbursement workflow.",
      }),
    ],
  ));
}

assign([
  "relation_rel-omny-lirr-mnr-integration",
  "relation_rel-omny-mnr-integration",
], retract(
  "The only cited text is a generic discussion heading. It does not support either exact railroad integration edge at the stored precision.",
  ["The source contains an OMNY discussion section."],
  ["The cited heading does not state LIRR or Metro-North integration scope."],
));

assign(["relation_exp-urbahn-contract-design-services"], contractReplacement({
  projectLocalId: "contract_exp_urbahn_three_line_accessibility_design_206071",
  projectLabel: "Three-Line Accessibility Design and Engineering Services Contract",
  projectDescription: "Preliminary design and engineering services for accessibility work on the Queens Boulevard, Grand Concourse, and Nostrand Avenue lines; 23 months, not-to-exceed $21,502,283.",
  vendorId: "entity_exp-urbahn-jv-206071",
  vendorLabel: "EXP-Urbahn Joint Venture",
  agencyId: "entity_mta-construction-and-development",
  agencyLabel: "MTA Construction & Development",
  metricId: "metric_exp-urbahn-contract-21502283",
  status: "board_approval_requested",
}));
assign(["relation_oas-contract-avlm-hardware"], contractReplacement({
  projectLocalId: "contract_oas_avlm_hardware_155111",
  projectLabel: "Paratransit AVLM Hardware Contract",
  projectDescription: "Purchase, installation, and maintenance of AVLM tablet hardware interfacing with CTG software for Paratransit.",
  vendorId: "entity_oas-meeting-doc-155111",
  vendorLabel: "OAS, Inc.",
  agencyId: "entity_department-of-paratransit",
  agencyLabel: "Department of Paratransit",
  metricId: "metric_oas-contract-4878364",
}));
assign(["relation_udi-contract-ivr-system"], contractReplacement({
  projectLocalId: "contract_udi_paratransit_ivr_155111",
  projectLabel: "Paratransit Interactive Voice Response Contract",
  projectDescription: "Interactive Voice Response service, support, and maintenance contract for Paratransit customer calls, survey data, and reporting.",
  vendorId: "entity_meeting-doc-154986-udi",
  vendorLabel: "Unified Dispatch LLC",
  agencyId: "entity_department-of-paratransit",
  agencyLabel: "Department of Paratransit",
  metricId: "metric_udi-contract-1178505",
}));
assign(["relation_waye-contract-scheduling-engine"], contractReplacement({
  projectLocalId: "contract_waye_paratransit_scheduling_engine_155111",
  projectLabel: "Paratransit Backup Scheduling Engine Contract",
  projectDescription: "Scheduling-engine software contract providing a parallel backup to the ADEPT system and improving trip-scheduling productivity.",
  vendorId: "entity_meeting-doc-154986-waye",
  vendorLabel: "WAYE, LLC",
  agencyId: "entity_department-of-paratransit",
  agencyLabel: "Department of Paratransit",
  metricId: "metric_waye-contract-11419136",
}));

assign(["relation_cbdtp-funds-capital-projects"], patchRelation(
  {
    relation_family: "funding_award",
    relation_kind: "funded_by",
    subject_id: "project_2020-2024-capital-program-meeting-doc-152166",
    object_id: "project_annual-2021-cbdtp",
  },
  "The source says the CBDTP funding program must generate revenue for MTA capital projects. Use the two canonical programs; neither a revenue metric nor rate-adoption event is the funding actor/recipient.",
  ["CBDTP is required to generate sufficient net annual revenue to fund $15 billion of MTA transit and commuter-rail capital projects."],
  ["A metric and a rate-schedule adoption event do not form the stated program-to-program funding relationship."],
));
assign(["relation_meeting-doc-133761-congestion-pricing-funding-capital-program"], patchRelation(
  {
    relation_family: "funding_award",
    relation_kind: "funded_by",
    subject_id: "project_2020-2024-capital-program-meeting-doc-152166",
    object_id: "project_annual-2021-cbdtp",
  },
  "The cited text states a program-to-program funding role and a $15 billion metric. Restore the two program endpoints and leave the amount in its canonical metric records.",
  ["Congestion Pricing is foundational to the 2020-2024 Capital Program and is set to raise $15 billion/30 percent of it."],
  ["One metric cannot fund another metric."],
));

assign(["relation_rel-project-nycdot"], retract(
  "The only cited content is a NYC DOT logo. A logo proves publication branding but not that DOT is the publisher/owner of this exact project record at the precision asserted.",
  ["The source page displays NYC DOT branding."],
  ["A logo alone does not establish the stored project has_publisher edge."],
));
assign(["relation_meeting-doc-114216-mta-operates-aar"], retract(
  "The cited accessibility/ADA passage does not establish umbrella MTA as operator of the AAR entity. Keep the AAR service facts in their canonical records without this unsupported organization edge.",
  ["The source discusses AAR/accessibility service."],
  ["The cited block does not support the exact MTA operates AAR endpoint pair."],
));

assign([
  "relation_2014-bus-priority-serves-b46",
  "relation_2015-06-09-125th-cb10-turn-restrictions-serves-route",
  "relation_better-buses-action-plan-serves-bx12-local",
  "relation_better-buses-action-plan-serves-bx12-sbs",
  "relation_e-167-168-project-serves-bx11",
  "relation_e-167-168-project-serves-bx13",
  "relation_metropolitan-av-serves-q52-cb6",
  "relation_metropolitan-av-serves-q53-cb6",
  "relation_phase-b-serves-q52",
  "relation_phase-b-serves-q52-cb6",
  "relation_phase-b-serves-q53",
  "relation_phase-b-serves-q53-cb6",
  "relation_project-2014-priority-serves-b46",
  "relation_project-2015-serves-m60-sbs",
  "relation_project-serves-b35",
  "relation_project-serves-bx12-sbs_3",
  "relation_project-serves-bx6-local_5",
  "relation_project-serves-bx6-sbs_3",
  "relation_project-serves-route-b69_2",
], retract(
  "The reviewed source block supports a project/corridor/treatment statement but does not name or otherwise prove the exact route endpoint at relationship precision. Street-name overlap and known route geography are not authoritative route evidence.",
  undefined,
  ["The exact cited evidence does not prove the stored project-to-route binding; no proximity or street-name inference may substitute for authoritative route scope."],
));

assign([
  "relation_2017-project-on-79th-corridor",
  "relation_2017-project-uses-corridor-cb7",
  "relation_ddc-streetscape-uses-corridor-cb7",
  "relation_m86-project-uses-corridor",
  "relation_project-2014-priority-uses-corridor-utica-av",
  "relation_project-m60-sbs-uses-corridor",
  "relation_project-uses-corridor-main-st",
  "relation_project-uses-corridor_58",
], retract(
  "The cited block is a title, generic project heading, or treatment fragment that does not independently establish the exact bounded corridor endpoint used by the relation. Other canonical evidence may retain the project/corridor facts, but this edge is not precisely cited.",
  undefined,
  ["The exact cited evidence does not prove the stored bounded physical corridor relationship."],
));

function correctedCorpus(): {
  mechanicalRecords: MtaCanonicalRecord[];
  records: MtaCanonicalRecord[];
  corrections: ReturnType<typeof readSemanticCorrections>;
  supersessions: ReturnType<typeof readSemanticCorrectionSupersessions>;
  summary: ReturnType<typeof withSemanticCorrections>["summary"];
  issues: ReturnType<typeof withSemanticCorrections>["issues"];
  submissionIds: Set<string>;
} {
  const submissionEntries = readSubmissionEntries();
  const mechanicalRecords = entriesToRecords(submissionEntries, {
    retiredSubmissionIds: retiredSubmissionIds(),
  });
  const corrections = readSemanticCorrections();
  const supersessions = readSemanticCorrectionSupersessions();
  const result = withSemanticCorrections(mechanicalRecords, corrections, supersessions);
  return {
    mechanicalRecords,
    records: result.records,
    corrections,
    supersessions,
    summary: result.summary,
    issues: result.issues,
    submissionIds: new Set(submissionEntries.map((entry) => entry.submission_id)),
  };
}

function evidenceIdFor(ref: MtaEvidenceRef): string {
  if (typeof ref.evidence_id === "string" && ref.evidence_id.trim()) return ref.evidence_id.trim();
  const block = ref.block_id ?? ref.block_range;
  if (!ref.source_id || !block) throw new Error("evidence binding lacks exact evidence_id/source block");
  return `${ref.source_id}#${block}`;
}

function blockIdFor(ref: MtaEvidenceRef): string {
  const direct = ref.block_id ?? ref.block_range;
  if (direct) return direct;
  const evidenceId = evidenceIdFor(ref);
  const separator = evidenceId.indexOf("#");
  if (separator < 1 || separator === evidenceId.length - 1) throw new Error(`invalid evidence id ${evidenceId}`);
  return evidenceId.slice(separator + 1);
}

function sourceInvestigation(ref: MtaEvidenceRef) {
  const blockId = blockIdFor(ref);
  const block = sourceBlockById(ref.source_id, blockId);
  const selectedHash = (ref.text_source === "normalized_text" ? block.normalized_text_sha256 : block.raw_text_sha256)
    .replace(/^sha256:/u, "");
  const expectedHash = typeof ref.text_sha256 === "string" ? ref.text_sha256.replace(/^sha256:/u, "") : undefined;
  if (expectedHash && selectedHash !== expectedHash) {
    throw new Error(`${evidenceIdFor(ref)} text hash drifted: expected ${expectedHash}, found ${selectedHash}`);
  }
  const compactText = block.raw_text.replace(/\s+/gu, " ").trim();
  return {
    evidence_id: evidenceIdFor(ref),
    source_id: ref.source_id,
    block_id: block.block_id,
    resolved: true,
    text_sha256: selectedHash,
    excerpt: compactText.length > 360 ? `${compactText.slice(0, 357)}...` : compactText,
  };
}

const apply = process.argv.includes("--apply");
const check = process.argv.includes("--check");
if (apply === check) throw new Error("Choose exactly one of --apply or --check");

const review = JSON.parse(readFileSync(REVIEW_PATH, "utf8")) as ReviewArtifact;
if (review.schema_version !== 1 || review.shard_id !== "relationship-contract-v1-baseline-semantic-review-part-2") {
  throw new Error("unexpected part-2 semantic-review artifact");
}
const tupleIndicesByRelation = new Map<string, number[]>();
const reviewRationaleByRelation = new Map<string, string>();
for (const decision of review.decisions) {
  for (const relationId of decision.suspect_relation_ids) {
    const indices = tupleIndicesByRelation.get(relationId) ?? [];
    indices.push(decision.tuple_index);
    tupleIndicesByRelation.set(relationId, indices);
    const action = decision.remediation_actions.find((candidate) => candidate.relation_id === relationId);
    reviewRationaleByRelation.set(relationId, action?.defect ?? decision.semantic_rationale);
  }
}
const suspectIds = [...tupleIndicesByRelation.keys()].sort();
if (suspectIds.length !== review.summary.suspect_relation_count || idsSha256(suspectIds) !== review.summary.suspect_relation_ids_sha256) {
  throw new Error("semantic-review suspect inventory drifted");
}

const missingSpecs = suspectIds.filter((id) => !SPECS.has(id));
const extraSpecs = [...SPECS.keys()].filter((id) => !tupleIndicesByRelation.has(id)).sort();
if (missingSpecs.length > 0 || extraSpecs.length > 0) {
  throw new Error(`remediation spec coverage mismatch\nmissing: ${missingSpecs.join(", ")}\nextra: ${extraSpecs.join(", ")}`);
}

const replay = correctedCorpus();
const suspectReplayIssues = replay.issues.filter((issue) => issue.recordId && suspectIds.includes(issue.recordId));
if (suspectReplayIssues.length > 0) {
  throw new Error(`authoritative replay has issue(s) on part-2 suspects: ${suspectReplayIssues.map((issue) => issue.recordId).join(", ")}`);
}
const recordsById = new Map(replay.records.map((record) => [record.record_id, record]));
const decisions = suspectIds.map((relationId) => {
  const relation = recordsById.get(relationId);
  if (!relation || relation.record_kind !== "relation") throw new Error(`suspect relation ${relationId} is absent from authoritative replay`);
  const relationFields = fieldsFor(relation);
  endpointExists({
    relation,
    fields: relationFields,
    recordsById,
    evidenceRefs: relation.evidence_refs,
    sourceId: relation.source_id,
  }, relationFields.subject_id);
  endpointExists({
    relation,
    fields: relationFields,
    recordsById,
    evidenceRefs: relation.evidence_refs,
    sourceId: relation.source_id,
  }, relationFields.object_id);
  const evidenceRefs = exactEvidenceRefs(relation);
  const sourceId = sourceIdFor(evidenceRefs);
  const context: ResolutionContext = { relation, fields: relationFields, recordsById, evidenceRefs, sourceId };
  const resolution = SPECS.get(relationId)!(context);
  const citedEvidence = evidenceRefs.map(sourceInvestigation).sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
  const subject = recordsById.get(relationFields.subject_id)!;
  const object = recordsById.get(relationFields.object_id)!;
  return {
    relation_id: relationId,
    tuple_indices: [...new Set(tupleIndicesByRelation.get(relationId)!)].sort((left, right) => left - right),
    current_snapshot: {
      record_kind: relation.record_kind,
      relation_family: relationFields.relation_family,
      relation_kind: relationFields.relation_kind,
      subject_id: relationFields.subject_id,
      object_id: relationFields.object_id,
      payload_sha256: sha256(stableJson(relation.payload as unknown as JsonValue)),
      evidence_ids: citedEvidence.map((item) => item.evidence_id),
      evidence_bindings_sha256: sha256(stableJson(evidenceRefs as unknown as JsonValue)),
    },
    terminal_action: resolution.terminal_action,
    rationale: resolution.rationale,
    supported_claims: resolution.supported_claims,
    unsupported_claims: resolution.unsupported_claims,
    investigation: {
      method: "Resolved every exact evidence binding against staged blocks.jsonl, verified its stored text hash, inspected the cited text, and resolved both current and proposed canonical identities in the authoritative post-correction replay.",
      cited_evidence: citedEvidence,
      current_endpoint_resolution: {
        subject: { record_id: subject.record_id, record_kind: subject.record_kind, display_name: subject.display_name },
        object: { record_id: object.record_id, record_kind: object.record_kind, display_name: object.display_name },
      },
      semantic_review_finding: reviewRationaleByRelation.get(relationId),
      terminal_conclusion: resolution.rationale,
    },
    action: resolution.action,
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
  };
});

for (const decision of decisions) {
  if (decision.terminal_action !== "resolved_by_identity_campaign") continue;
  const ids = decision.action.identity_submission_ids;
  if (!Array.isArray(ids) || ids.length === 0) throw new Error(`${decision.relation_id} has no identity submission ids`);
  const missing = ids.filter((id): id is string => typeof id === "string" && !replay.submissionIds.has(id));
  if (missing.length > 0) throw new Error(`${decision.relation_id} references missing identity submissions: ${missing.join(", ")}`);
}

const evidenceIds = [...new Set(decisions.flatMap((decision) => decision.current_snapshot.evidence_ids))].sort();
const actionCounts = Object.fromEntries(
  [...new Set(decisions.map((decision) => decision.terminal_action))]
    .sort()
    .map((action) => [action, decisions.filter((decision) => decision.terminal_action === action).length]),
);
const replacementSubmissionCount = decisions.reduce((sum, decision) => {
  const submissions = decision.terminal_action === "replace_with_submissions"
    ? (decision.action.submissions as unknown[])
    : [];
  return sum + submissions.length;
}, 0);

const output = {
  schema_version: 1,
  contract_id: "relationship-semantic-remediation-v1",
  shard_id: "part-2",
  review_status: "complete",
  pinned_inputs: {
    semantic_review: {
      path: relative(repoRoot, REVIEW_PATH),
      sha256: fileSha256(REVIEW_PATH),
      suspect_relation_ids_sha256: review.summary.suspect_relation_ids_sha256,
    },
    baseline_inventory: { path: relative(repoRoot, INVENTORY_PATH), sha256: fileSha256(INVENTORY_PATH) },
    authoritative_projection: {
      method: "entriesToRecords(readSubmissionEntries(), retiredSubmissionIds) followed by withSemanticCorrections(corrections, supersessions)",
      mechanical_record_count: replay.mechanicalRecords.length,
      mechanical_records_sha256: recordsSha256(replay.mechanicalRecords),
      post_correction_record_count: replay.records.length,
      post_correction_records_sha256: recordsSha256(replay.records),
      post_correction_relation_count: replay.records.filter((record) => record.record_kind === "relation").length,
      correction_apply_summary: replay.summary,
      replay_issue_count: replay.issues.length,
      replay_issue_record_ids: [...new Set(replay.issues.flatMap((issue) => issue.recordId ? [issue.recordId] : []))].sort(),
      part_2_suspect_replay_issue_count: suspectReplayIssues.length,
    },
    files: {
      semantic_corrections: { path: relative(repoRoot, CORRECTIONS_PATH), sha256: fileSha256(CORRECTIONS_PATH) },
      semantic_supersessions: { path: relative(repoRoot, SUPERSESSIONS_PATH), sha256: fileSha256(SUPERSESSIONS_PATH) },
      submission_retirements: { path: relative(repoRoot, RETIREMENTS_PATH), sha256: fileSha256(RETIREMENTS_PATH) },
      identity_merges: { path: relative(repoRoot, MERGES_PATH), sha256: fileSha256(MERGES_PATH) },
    },
  },
  summary: {
    relation_count: decisions.length,
    relation_ids_sha256: idsSha256(suspectIds),
    evidence_id_count: evidenceIds.length,
    evidence_ids_sha256: idsSha256(evidenceIds),
    terminal_action_counts: actionCounts,
    replacement_submission_count: replacementSubmissionCount,
    source_binding_resolution_failures: 0,
    unreviewed_count: 0,
    zero_unreviewed: true,
  },
  decisions,
};

const rendered = `${JSON.stringify(output, null, 2)}\n`;
mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
if (apply) {
  writeFileSync(OUTPUT_PATH, rendered, "utf8");
  console.log(JSON.stringify({
    artifact: relative(repoRoot, OUTPUT_PATH),
    sha256: sha256(rendered),
    ...output.summary,
    status: "written",
  }, null, 2));
} else {
  const existing = readFileSync(OUTPUT_PATH, "utf8");
  if (existing !== rendered) throw new Error(`${relative(repoRoot, OUTPUT_PATH)} is stale; rerun with --apply`);
  console.log(JSON.stringify({
    artifact: relative(repoRoot, OUTPUT_PATH),
    sha256: sha256(rendered),
    ...output.summary,
    status: "deterministic",
  }, null, 2));
}
