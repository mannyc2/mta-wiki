import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue, MtaCanonicalRecord } from "../packages/db/src/types";
import { readCanonicalRecordsFromJsonl } from "../packages/pipeline/src/materialize/canonical-read";
import { entriesToRecords } from "../packages/pipeline/src/materialize/materialize";
import { retiredSubmissionIds } from "../packages/pipeline/src/records/submission-overrides";
import { readSubmissionEntries } from "../packages/pipeline/src/records/submissions";
import {
  readSemanticCorrections,
  readSemanticCorrectionSupersessions,
  withSemanticCorrections,
} from "../packages/pipeline/src/records/semantic-corrections";

const CONTRACT_DIR = join(repoRoot, "data/contracts/relationships/v1");
const INVENTORY_PATH = join(CONTRACT_DIR, "baseline-tuple-review-inventory.json");
const OUTPUT_PATH = join(CONTRACT_DIR, "semantic-review-shards/part-0.json");
const CORRECTIONS_PATH = join(repoRoot, "data/semantic-corrections/corrections.jsonl");
const SUPERSESSIONS_PATH = join(repoRoot, "data/semantic-corrections/supersessions-v1.json");
const SHARD_MODULUS = 3;
const SHARD_REMAINDER = 0;
const REVIEWED_AT = "2026-07-16T00:00:00.000Z";
const REVIEWED_BY = "Codex relationship-integrity adversarial semantic review / part-0";

type InventoryTuple = {
  relation_kind: string;
  relation_family: string;
  subject_kind: string;
  object_kind: string;
  rule_review_basis: string;
  observed_relation_count: number;
  observed_relation_record_ids_sha256: string;
};

type Inventory = {
  schema_version: number;
  inventory_id: string;
  contract_id: string;
  tuples: InventoryTuple[];
};

type ReviewFinding = {
  suspect_relation_ids: string[];
  semantic_rationale: string;
  remediation_proposal: string;
};

type RemediationAction =
  | "retract"
  | "guarded_endpoint_replacement"
  | "guarded_family_or_predicate_patch"
  | "generator_fix"
  | "central_identity_remediation";

/*
 * These findings are deliberately relation-specific.  A tuple may be generally sound while one
 * legacy edge uses a source, metric, claim, agency, or date event as a surrogate for the physical
 * or organizational endpoint stated by its evidence.  The generator intersects these ids with the
 * authoritative post-correction replay, so a correction completed before regeneration is credited
 * as remediated rather than left as a stale warning.
 */
const FINDINGS = new Map<number, ReviewFinding>([
  [84, {
    suspect_relation_ids: [
      "relation_meeting-doc-113966-brown-diversity-report",
      "relation_meeting-doc-113966-hartke-finance-report",
      "relation_meeting-doc-113966-hildebrand-ops-report",
      "relation_meeting-doc-113966-osnes-safety-report",
    ],
    semantic_rationale: "The four entity-to-source authored_by edges reverse the documentary role: the evidence identifies people who prepared or presented report sections, while the source/report is the authored artifact.",
    remediation_proposal: "Reverse the artifact-role direction to source/report -> person with an evidence-supported prepared_by or authored_by relation, or model the report item explicitly before linking its author.",
  }],
  [99, {
    suspect_relation_ids: ["relation_meeting-doc-127476-procurement-prevost"],
    semantic_rationale: "The awarded_to edge points from a vendor entity to a dollar metric; the evidence describes a procurement award, not a metric awarded to a vendor.",
    remediation_proposal: "Use the procurement event, contract, or project as subject and Prevost as awardee; retain the dollar metric through a separate metric relation.",
  }],
  [132, {
    suspect_relation_ids: ["relation_congestion-relief-2nd-3rd-ave"],
    semantic_rationale: "A congestion-pricing revenue metric is used as the project actor for caused_by, even though the evidence supports a program/funding relationship and not causation by a metric record.",
    remediation_proposal: "Link the project to the canonical congestion-pricing program or funding claim at the supported precision and relate the revenue metric separately.",
  }],
  [156, {
    suspect_relation_ids: ["relation_meeting-doc-192191-halmar-pav"],
    semantic_rationale: "The contractor relation targets MTA Construction & Development, but the description and cited text identify Halmar as the contractor.",
    remediation_proposal: "Resolve and use a canonical Halmar entity when identity is proven, or retype the edge to the precise agency role actually supported by the evidence.",
  }],
  [165, {
    suspect_relation_ids: [
      "relation_rel-mta-fsa-contract-pa",
      "relation_rel-mta-greystone-contract",
      "relation_rel-mta-pbm-contract-caremark",
    ],
    semantic_rationale: "Each contracted_with edge substitutes a publication source for the MTA organization or contract described as the contracting party.",
    remediation_proposal: "Use a canonical MTA entity, procurement event, contract, or project as the contracting endpoint and retain the source solely as evidence/publication context.",
  }],
  [198, {
    suspect_relation_ids: ["relation_meeting-doc-133761-projects-delayed"],
    semantic_rationale: "A $15 billion congestion-pricing metric is used as the delayed_by endpoint; a numeric metric cannot itself be the delaying event or program.",
    remediation_proposal: "Link the delayed projects to the evidence-supported funding/program/event claim and attach the amount as a separate metric claim.",
  }],
  [234, {
    suspect_relation_ids: ["relation_jaibala-cfo-mta", "relation_robert-foran-cfo-mta_2"],
    semantic_rationale: "Both employed_by edges target a source document rather than the MTA organization identified as employer in the cited material.",
    remediation_proposal: "Replace the source endpoint with the canonical MTA entity and keep the document only as provenance.",
  }],
  [249, {
    suspect_relation_ids: ["relation_nypd-enforces-bus-lanes_2"],
    semantic_rationale: "The edge says NYPD enforces NYC DOT, while the evidence distinguishes NYPD enforcement from DOT rule-setting; an agency is not the enforced rule or program.",
    remediation_proposal: "Link NYPD to the canonical bus-lane regulation/program or a precise enforcement claim, preserving DOT's separate rule-setting role.",
  }],
  [255, {
    suspect_relation_ids: ["relation_rel-mercer-consultant-caremark"],
    semantic_rationale: "The engaged_by object is a meeting-book source, used as a surrogate for the MTA entity or project that engaged Mercer.",
    remediation_proposal: "Replace the publication endpoint with the evidence-supported agency, contract, or project endpoint.",
  }],
  [258, {
    suspect_relation_ids: ["relation_ddcr-goals-for-contract"],
    semantic_rationale: "The direction is reversed: the evidence says DDCR established goals for the project, not that the project established DDCR.",
    remediation_proposal: "Swap endpoints and use an evidence-supported established_goals_for/agency-role relation, or retract if no approved relation kind captures it.",
  }],
  [282, {
    suspect_relation_ids: ["relation_lirr-operating-budget-funds-projects"],
    semantic_rationale: "A generic claim record is used as the funding-source actor rather than the LIRR operating budget or capital program named in evidence.",
    remediation_proposal: "Resolve the budget/program identity as a canonical entity or project and keep the claim as provenance/context.",
  }],
  [285, {
    suspect_relation_ids: ["relation_meeting164941-funding-2020-2024-capital", "relation_nhl-pilot-funded-by-ctdot"],
    semantic_rationale: "These funded_by edges point to unrelated sibling projects even though the evidence names the 2020-2024 Capital Plan and CTDOT, respectively, as funding actors.",
    remediation_proposal: "Replace each object with the proven capital-program or CTDOT endpoint and preserve sibling-project context through a different supported relation.",
  }],
  [297, {
    suspect_relation_ids: ["relation_crz-metrics-fund-project"],
    semantic_rationale: "A revenue metric is modeled as the actor that funds a project; the evidence supports a revenue/funding-program relationship, not agency by a number.",
    remediation_proposal: "Link the project to the canonical funding program/claim and connect the amount through a separate metric relation.",
  }],
  [303, {
    suspect_relation_ids: ["relation_oss-generated-ptasp-nyct"],
    semantic_rationale: "The generated_by direction and endpoint do not match the text: OSS generated safety plans, whereas NYCT is neither the generated artifact nor generator in this edge.",
    remediation_proposal: "Model the plan/report artifact and link it generated_by OSS, or use a precisely directed developed/prepared relation supported by the source.",
  }],
  [327, {
    suspect_relation_ids: ["relation_meeting-doc-133361-lirr-license-vpct"],
    semantic_rationale: "The relation is a self-loop, so it cannot express the stated licensor/licensee relationship.",
    remediation_proposal: "Resolve the distinct counterparty endpoint from authoritative evidence or retract the edge.",
  }],
  [342, {
    suspect_relation_ids: ["relation_storms-hernando-fern-overtime"],
    semantic_rationale: "The has_metric subject is an Iran-conflict claim while the description and evidence attribute overtime to storms Hernando and Fern.",
    remediation_proposal: "Create or resolve the storm event/claim as subject and attach the overtime metric there.",
  }],
  [363, {
    suspect_relation_ids: ["relation_rel-omny-ch2m-support"],
    semantic_rationale: "The has_support_provider object is MTA, but the description and evidence identify CH2M as the support provider.",
    remediation_proposal: "Use the proven CH2M entity as object, or invert/retype the edge if only MTA's recipient role is supported.",
  }],
  [372, {
    suspect_relation_ids: ["relation_meeting-doc-128961-nyct-division-subways"],
    semantic_rationale: "The hierarchy relation is a self-loop and therefore does not identify the distinct parent and child organizations described by the source.",
    remediation_proposal: "Resolve distinct NYCT and Department/Division of Subways entities or retract the unsupported hierarchy edge.",
  }],
  [396, {
    suspect_relation_ids: ["relation_meeting-doc-194066-zaro-lessor-lease-term"],
    semantic_rationale: "The has_lease_term edge targets a first-year rent metric while its description claims a ten-year lease term.",
    remediation_proposal: "Attach the edge to a correctly scoped duration metric/claim and retain the rent amount in its own metric relation.",
  }],
  [426, {
    suspect_relation_ids: ["relation_meeting-doc-199151-dept-subways-oss-rwp-manual"],
    semantic_rationale: "The participant relation obscures the stated authorship: the evidence says the department developed the RWP manual, not merely that it participated in a claim.",
    remediation_proposal: "Model the manual/source artifact and connect the department with a directed developed/prepared/authored role at the supported precision.",
  }],
  [438, {
    suspect_relation_ids: ["relation_a-rockaways-lirr-partnership", "relation_rel-jamaica-depot-skanska-hotline"],
    semantic_rationale: "Both partnership edges are self-loops and cannot encode the two distinct parties named in their descriptions.",
    remediation_proposal: "Resolve both counterparties to distinct canonical entities and replace the endpoints, or retract where identity is not proven.",
  }],
  [468, {
    suspect_relation_ids: ["relation_197041-psa-easements"],
    semantic_rationale: "A has_related_project edge points to Con Edison although the evidence identifies Con Edison as an easement grantor, not a related project.",
    remediation_proposal: "Retype to an evidence-supported easement/grantor role and use an entity or physical-property endpoint as appropriate.",
  }],
  [540, {
    suspect_relation_ids: [
      "relation_lirr-implements-program-meeting-doc-155616",
      "relation_mnr-implements-program-meeting-doc-155616",
      "relation_mta-cd-implements-cost-containment",
      "relation_nyct-implements-program-meeting-doc-155616",
    ],
    semantic_rationale: "The objects are publication sources, and the descriptions say those sources discuss agency programs; a document is not the program implemented by an agency.",
    remediation_proposal: "Resolve the actual cost-containment program/project endpoints or retype as publication about/addresses_entity relations.",
  }],
  [639, {
    suspect_relation_ids: ["relation_libla-license-to-lirr"],
    semantic_rationale: "The licensee_of direction contradicts the description: Libla is the licensee, while LIRR is currently the subject.",
    remediation_proposal: "Swap endpoints so the documented licensee is subject, or use the inverse licensed_to relation consistently.",
  }],
  [657, {
    suspect_relation_ids: ["relation_rel-meeting-doc-201581-port-authority-jamaica-maintenance"],
    semantic_rationale: "The object is the LIRR agency, but the cited maintenance scope is physical station equipment at Jamaica.",
    remediation_proposal: "Resolve the equipment or Jamaica station/location as a physical endpoint, or retype to a supported interagency responsibility relation.",
  }],
  [660, {
    suspect_relation_ids: ["relation_rel-greystone-mta-real-estate"],
    semantic_rationale: "The managed_by object is a source document used in place of the MTA Real Estate organization named in the evidence.",
    remediation_proposal: "Replace the source endpoint with the canonical MTA Real Estate entity and retain the source only as evidence.",
  }],
  [663, {
    suspect_relation_ids: ["relation_meeting-doc-174011-mta-treasury", "relation_mta-procurement-managed-actions-b"],
    semantic_rationale: "These edges say publication sources are managed by units, while their evidence describes Treasury/procurement actions rather than management of a document.",
    remediation_proposal: "Link the responsible organization to the actual program, action, or project, or retype the documentary relationship precisely.",
  }],
  [666, {
    suspect_relation_ids: ["relation_data-analytics-manages-open-data"],
    semantic_rationale: "The Open Data endpoint resolves to NYCT because of an identity collapse, although official evidence describes the umbrella MTA Open Data program.",
    remediation_proposal: "Restore a distinct canonical MTA Open Data program/entity identity and point the management relation to it; do not alias it to NYCT.",
  }],
  [672, {
    suspect_relation_ids: ["relation_meeting-doc-113891-lirr-tracks-program"],
    semantic_rationale: "The edge targets the LIRR agency while the description says the person sponsored the T.R.A.C.K.S. program.",
    remediation_proposal: "Resolve the T.R.A.C.K.S. program as the object and use an evidence-supported sponsor/program role.",
  }],
  [675, {
    suspect_relation_ids: ["relation_john-mueller-project-manager"],
    semantic_rationale: "A policy source is used as the managed_project endpoint; the evidence must identify the actual project/program or only a documentary role can be asserted.",
    remediation_proposal: "Replace the source with a proven project/program endpoint, or retype to a source authorship/role relation.",
  }],
  [687, {
    suspect_relation_ids: ["relation_wakefield-tod-near-wakefield-station"],
    semantic_rationale: "The near relation targets the MNR agency even though the claimed physical location is Wakefield station.",
    remediation_proposal: "Resolve a canonical Wakefield station/location endpoint before asserting physical proximity.",
  }],
  [690, {
    suspect_relation_ids: [
      "relation_bos-operated-by-etech",
      "relation_operated-by-project-34th-street-busway-entity-nyc-dot_47763c917b",
      "relation_operated-by-project-better-buses-entity-nyc-dot_ae754aa8c4",
      "relation_operated-by-project-gct-fire-standpipe-phase2-entity-meeting-doc-124881-mnr_51b40c26c7",
      "relation_operated-by-project-haverstraw-ferry-terminal-entity-meeting-doc-160166-ny-waterway_7a4d812ace",
      "relation_operated-by-project-jamaica-temporary-bus-terminal-gjdc-entity-mta-bus-company_d5f3735c59",
      "relation_operated-by-project-lirr-lic-flood-wall-entity-annual-report-2021-lirr_d0e8fa8e24",
      "relation_operated-by-project-lirr-station-spruce-up-entity-annual-report-2021-lirr_df7995792c",
      "relation_operated-by-project-meeting-doc-131491-bus-radio-system-entity-mta-bus-company_7a82fc5383",
      "relation_operated-by-project-mnr-nextgen-tvm-rollout-entity-meeting-doc-124881-mnr_4399aa53d0",
      "relation_operated-by-project-mnr-sc42-locomotive-entity-meeting-doc-124881-mnr_8befb3b6cc",
      "relation_operated-by-project-rail-flaw-testing-joint-bar-inspection-138251-entity-annual-report-2021-lirr_6e2bca88e4",
      "relation_operated-by-project-southeast-station-parking-garage-dec2023-entity-meeting-doc-124881-mnr_b57715b539",
      "relation_operated-by-project-stationary-camera-program-entity-nyc-dot_b8bdee302d",
      "relation_siemens-operator-cdot-option",
    ],
    semantic_rationale: "These operated_by edges are derived from agency scope or contract awards rather than exact evidence of operational responsibility; two explicitly identify contractors, and the remaining derived rows require claim-level confirmation.",
    remediation_proposal: "For each edge, obtain exact operator evidence or retype it to implemented_by, contracted_with, agency_scope, or another supported role; retract unsupported derived operator claims.",
  }],
  [693, {
    suspect_relation_ids: ["relation_mta-operates-bus-lane-cameras", "relation_nyc-dot-operates-cameras"],
    semantic_rationale: "The objects are claims about camera methods/signage rather than canonical systems or projects that an agency can operate.",
    remediation_proposal: "Resolve a camera-enforcement program/system endpoint or keep the assertions as claims without an operates edge.",
  }],
  [699, {
    suspect_relation_ids: ["relation_meeting-doc-171141-lirr-penn-ticket-checks"],
    semantic_rationale: "A physical operational location is claimed, but the located_at object is the MTA agency rather than Penn Station.",
    remediation_proposal: "Resolve Penn Station as a canonical physical location endpoint or retract the location edge.",
  }],
  [714, {
    suspect_relation_ids: ["relation_mta-congestion-relief-zone"],
    semantic_rationale: "A toll-rate metric claim is used as the operates object; it is not the congestion-relief program or zone identity.",
    remediation_proposal: "Link the operator to the canonical program/zone project and retain the toll amount as a separate metric relation.",
  }],
  [720, {
    suspect_relation_ids: ["relation_meeting-doc-nyct-organized-by-compton", "relation_meeting-joint-committee"],
    semantic_rationale: "The subjects are publication sources, but the evidence describes document origin or a committee meeting; organized_by is not established for the publication artifact at the stored precision.",
    remediation_proposal: "Use a prepared_by/authored_by publication role or model the meeting event and its organizer explicitly.",
  }],
  [726, {
    suspect_relation_ids: ["relation_lirr-committee-oversight"],
    semantic_rationale: "The oversight object is a committee work-plan source, used as a surrogate for the LIRR operations or program under oversight.",
    remediation_proposal: "Link the committee to the actual agency/program scope or retype as a documentary about/governs relation.",
  }],
  [732, {
    suspect_relation_ids: ["relation_mta-owns-subject-property"],
    semantic_rationale: "The ownership evidence concerns a tax lot/property, while the object is a proposed housing project rather than the physical property.",
    remediation_proposal: "Create or resolve the physical property/parcel endpoint before asserting ownership; relate the proposal separately.",
  }],
  [750, {
    suspect_relation_ids: ["relation_bt-committee-agency", "relation_mnrr-mta-parent"],
    semantic_rationale: "Both organization-hierarchy edges are self-loops and therefore cannot establish distinct parent and child identities.",
    remediation_proposal: "Resolve distinct committee/agency or MNR/MTA organization identities and replace endpoints, or retract the malformed edges.",
  }],
  [753, {
    suspect_relation_ids: [
      "relation_hall-interlocking-part-of-jci2",
      "relation_part-of-program-project-annual-2021-east-side-access-project-annual-2021-east-side-access_7abcbc950c",
      "relation_project-part-of-brt-phase2",
    ],
    semantic_rationale: "These part_of_program edges are project self-loops and cannot identify a containing program or phase.",
    remediation_proposal: "Resolve a distinct parent program/phase endpoint from evidence or retract the self-loop.",
  }],
  [756, {
    suspect_relation_ids: ["relation_esa-ptc-testing-part-of-esa", "relation_psa-ptc-support-part-of-psa"],
    semantic_rationale: "Both part_of_project edges are project self-loops and do not encode the stated subproject-to-parent relationship.",
    remediation_proposal: "Resolve distinct subproject and parent-project identities, replace endpoints, and preserve evidence; otherwise retract.",
  }],
  [807, {
    suspect_relation_ids: [
      "relation_meeting-doc-157976-cd-presents-to-board",
      "relation_nyct-presented-by-jaibala-patel",
      "relation_patel-presents-mtabus-jul",
      "relation_patel-presents-nyct-aug",
      "relation_patel-presents-nyct-jul",
      "relation_patel-presents-sir-jul",
      "relation_rel-mnr-presented-by-steven-weiss",
      "relation_sir-presented-by-jaibala-patel",
    ],
    semantic_rationale: "Agency entities are used as the artifacts presented_by people, while the evidence concerns reports/presentations delivered for or about those agencies; one edge also reverses C&D's presentation to the Board.",
    remediation_proposal: "Model the report/presentation source as subject with presented_by person, or use a correctly directed agency presents_to Board relation.",
  }],
  [816, {
    suspect_relation_ids: ["relation_ptc-report-submitted"],
    semantic_rationale: "The submitted_by edge connects LIRR to MNR, but the description identifies a joint report submitted to a committee rather than one agency submitted by another.",
    remediation_proposal: "Model the report/source artifact and committee recipient, with both agencies represented through supported author/submission roles.",
  }],
  [819, {
    suspect_relation_ids: ["relation_lirr-annual-elevator-escalator-report"],
    semantic_rationale: "The submitted_to object is a meeting-book source, while the evidence says an annual report was presented to a committee.",
    remediation_proposal: "Resolve the report artifact and committee/event recipient and use a precise presented_to/submitted_to relation.",
  }],
  [882, {
    suspect_relation_ids: ["relation_open-data-program-publishes-board-books"],
    semantic_rationale: "The publishes relation is a project self-loop, so it cannot identify both the Open Data publisher and the published Board Books artifact.",
    remediation_proposal: "Restore distinct Open Data program and Board Books source/dataset identities and replace the endpoints.",
  }],
  [900, {
    suspect_relation_ids: ["relation_rel-ddcr-fsa-no-goals"],
    semantic_rationale: "The recommended_by object is Mercer although the description and evidence attribute the recommendation to DDCR.",
    remediation_proposal: "Replace the object with the canonical DDCR entity, keeping Mercer only where a separate consultant role is evidenced.",
  }],
  [933, {
    suspect_relation_ids: [
      "relation_rel-mta-publishes-user-personas",
      "relation_rel-mta-releases-20yr-needs-datasets",
      "relation_rel-mta-releases-hourly-ridership-datasets",
      "relation_rel-mta-releases-sir-datasets",
    ],
    semantic_rationale: "These publication edges resolve their local MTA/Open Data subject to NYCT, but the official source supports the umbrella MTA Open Data publisher rather than NYCT specifically.",
    remediation_proposal: "Restore an unambiguous umbrella MTA/Open Data identity and repoint the publication edges; do not retain the NYCT alias collapse.",
  }],
  [939, {
    suspect_relation_ids: ["relation_policy-replaces-prior-policy"],
    semantic_rationale: "The replaces object is an effective-date event, not the prior policy identity that the new policy replaces.",
    remediation_proposal: "Resolve the prior policy source/claim as object and keep the effective date as a separate event/date relation.",
  }],
  [963, {
    suspect_relation_ids: ["relation_meeting-doc-133276-tab-transit-committee"],
    semantic_rationale: "The subsidiary_of relation is an entity self-loop and cannot identify distinct committee and parent-board entities.",
    remediation_proposal: "Resolve the distinct parent organization endpoint or retract the malformed hierarchy edge.",
  }],
  [969, {
    suspect_relation_ids: ["relation_dob-clever-devices-192241", "relation_dob-new-flyer-192241", "relation_dos-standard-steel-192241"],
    semantic_rationale: "The requested_by direction is reversed: departments are subjects and procurement events are objects, although the events were requested by those departments.",
    remediation_proposal: "Swap endpoints so each procurement event/project is requested_by the department, or use the consistently directed inverse relation.",
  }],
  [975, {
    suspect_relation_ids: ["relation_meeting-doc-124311-montanti-requesting"],
    semantic_rationale: "A person is linked by requesting_department to a dollar metric, which cannot represent the requesting department named by the procurement evidence.",
    remediation_proposal: "Link the procurement event/project to the canonical requesting department and retain the amount through a separate metric relation.",
  }],
  [990, {
    suspect_relation_ids: ["relation_meeting-doc-29956-ddcr-update-initiatives"],
    semantic_rationale: "The supporting_entity edge is an entity self-loop and does not identify the distinct initiative or supported organization.",
    remediation_proposal: "Resolve the actual supported project/entity and replace the endpoint, or retract if the source only supports a narrative claim.",
  }],
  [1044, {
    suspect_relation_ids: ["relation_moa-signed-by-margaret-connor", "relation_moa-signed-by-raymond-gruber"],
    semantic_rationale: "The signed_by edges run from people to the MOU event, reversing the artifact/event signed by each person.",
    remediation_proposal: "Swap endpoints so the MOU/source/event is signed_by the signatories, or use a consistently directed person signed relation.",
  }],
  [1092, {
    suspect_relation_ids: ["relation_meeting-doc-98321-ch2m-supports-omny-v2"],
    semantic_rationale: "The supports relation is an entity self-loop and cannot express CH2M support for a distinct OMNY project/entity.",
    remediation_proposal: "Resolve CH2M and OMNY as distinct endpoints and replace the malformed edge.",
  }],
  [1122, {
    suspect_relation_ids: ["relation_project-uses-amtrak-hell-gate-meeting-doc-205586"],
    semantic_rationale: "The uses_infrastructure_of object is MTA Construction & Development, but the description and evidence identify Amtrak's Hell Gate infrastructure.",
    remediation_proposal: "Use a proven Amtrak entity or canonical Hell Gate physical-corridor endpoint at the evidence-supported precision.",
  }],
]);

const ACTION_BY_TUPLE = new Map<number, RemediationAction>([
  [84, "retract"],
  [99, "guarded_endpoint_replacement"],
  [132, "guarded_endpoint_replacement"],
  [156, "guarded_endpoint_replacement"],
  [165, "guarded_endpoint_replacement"],
  [198, "guarded_endpoint_replacement"],
  [234, "guarded_endpoint_replacement"],
  [249, "guarded_family_or_predicate_patch"],
  [255, "guarded_endpoint_replacement"],
  [258, "retract"],
  [282, "guarded_endpoint_replacement"],
  [285, "guarded_endpoint_replacement"],
  [297, "guarded_endpoint_replacement"],
  [303, "retract"],
  [327, "retract"],
  [342, "guarded_endpoint_replacement"],
  [363, "guarded_endpoint_replacement"],
  [372, "retract"],
  [396, "guarded_endpoint_replacement"],
  [426, "guarded_family_or_predicate_patch"],
  [438, "retract"],
  [468, "guarded_family_or_predicate_patch"],
  [540, "guarded_endpoint_replacement"],
  [639, "retract"],
  [657, "guarded_endpoint_replacement"],
  [660, "guarded_endpoint_replacement"],
  [663, "guarded_endpoint_replacement"],
  [666, "central_identity_remediation"],
  [672, "guarded_endpoint_replacement"],
  [675, "guarded_endpoint_replacement"],
  [687, "guarded_endpoint_replacement"],
  [690, "generator_fix"],
  [693, "guarded_endpoint_replacement"],
  [699, "guarded_endpoint_replacement"],
  [714, "guarded_endpoint_replacement"],
  [720, "guarded_family_or_predicate_patch"],
  [726, "guarded_endpoint_replacement"],
  [732, "guarded_endpoint_replacement"],
  [750, "retract"],
  [753, "retract"],
  [756, "retract"],
  [807, "retract"],
  [816, "retract"],
  [819, "retract"],
  [882, "retract"],
  [900, "guarded_endpoint_replacement"],
  [933, "central_identity_remediation"],
  [939, "guarded_endpoint_replacement"],
  [963, "retract"],
  [969, "retract"],
  [975, "guarded_endpoint_replacement"],
  [990, "retract"],
  [1044, "retract"],
  [1092, "retract"],
  [1122, "guarded_endpoint_replacement"],
]);

const ACTION_BY_RELATION = new Map<string, RemediationAction>([
  ["relation_bos-operated-by-etech", "guarded_family_or_predicate_patch"],
  ["relation_siemens-operator-cdot-option", "guarded_family_or_predicate_patch"],
]);

function sha256(value: string): string {
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

function tupleKey(tuple: Pick<InventoryTuple, "relation_kind" | "relation_family" | "subject_kind" | "object_kind">): string {
  return [tuple.relation_kind, tuple.relation_family, tuple.subject_kind, tuple.object_kind].join("\0");
}

function text(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function correctedCorpus(): {
  records: MtaCanonicalRecord[];
  mechanicalRecords: MtaCanonicalRecord[];
  corrections: ReturnType<typeof readSemanticCorrections>;
  supersessions: ReturnType<typeof readSemanticCorrectionSupersessions>;
  summary: ReturnType<typeof withSemanticCorrections>["summary"];
  issueCount: number;
} {
  const corrections = readSemanticCorrections();
  const supersessions = readSemanticCorrectionSupersessions();
  const mechanicalRecords = entriesToRecords(readSubmissionEntries(), {
    retiredSubmissionIds: retiredSubmissionIds(),
  });
  const result = withSemanticCorrections(mechanicalRecords, corrections, supersessions);
  if (result.issues.length > 0 || result.summary.skipped > 0) {
    throw new Error(`Post-correction replay has ${result.issues.length} issue(s) and ${result.summary.skipped} skip(s)`);
  }
  return {
    records: result.records,
    mechanicalRecords,
    corrections,
    supersessions,
    summary: result.summary,
    issueCount: result.issues.length,
  };
}

function relationsByTuple(records: MtaCanonicalRecord[]): Map<string, MtaCanonicalRecord[]> {
  const byId = new Map(records.map((record) => [record.record_id, record]));
  const result = new Map<string, MtaCanonicalRecord[]>();
  for (const relation of records) {
    if (relation.record_kind !== "relation") continue;
    const relationKind = text(relation.payload.relation_kind);
    const relationFamily = text(relation.payload.relation_family) ?? "other";
    const subject = byId.get(text(relation.payload.subject_id) ?? "");
    const object = byId.get(text(relation.payload.object_id) ?? "");
    if (!relationKind || !subject || !object) continue;
    const key = tupleKey({
      relation_kind: relationKind,
      relation_family: relationFamily,
      subject_kind: subject.record_kind,
      object_kind: object.record_kind,
    });
    const group = result.get(key) ?? [];
    group.push(relation);
    result.set(key, group);
  }
  for (const relations of result.values()) relations.sort((left, right) => left.record_id.localeCompare(right.record_id));
  return result;
}

const inventory = JSON.parse(readFileSync(INVENTORY_PATH, "utf8")) as Inventory;
const replay = correctedCorpus();
const grouped = relationsByTuple(replay.records);
const baselineGrouped = relationsByTuple(readCanonicalRecordsFromJsonl());
const assigned = inventory.tuples
  .map((tuple, index) => ({ tuple, index }))
  .filter(({ index }) => index % SHARD_MODULUS === SHARD_REMAINDER);

const apply = process.argv.includes("--apply");
const check = process.argv.includes("--check");
if (apply && check) throw new Error("Choose exactly one of --apply or --check");

if (!apply && !check) {
  for (const { tuple, index } of assigned) {
    const ids = (grouped.get(tupleKey(tuple)) ?? []).map((relation) => relation.record_id);
    console.log([
      index,
      tuple.relation_kind,
      tuple.relation_family,
      tuple.subject_kind,
      tuple.object_kind,
      tuple.observed_relation_count,
      ids.length,
      idsSha256(ids),
      ids.slice(0, 5).join(","),
    ].join("\t"));
  }
  process.exit(0);
}

const EVIDENCE_SOURCE_REVIEW_METHOD = [
  "Authoritative pre-semantic records were rebuilt from accepted submissions with retired-submission overrides,",
  "then the complete semantic-correction and correction-supersession journals were replayed.",
  "For every assigned post-correction edge, endpoint resolution/kinds, relation family/kind, provenance refs,",
  "self-loops, direction, surrogate endpoints, review state, description, and cited source text were inspected.",
  "The relation-specific findings in this shard record every surviving semantic exception found by that review.",
].join(" ");
const postRecordsById = new Map(replay.records.map((record) => [record.record_id, record]));

const decisions = assigned.map(({ tuple, index }) => {
  const baselineIds = (baselineGrouped.get(tupleKey(tuple)) ?? []).map((relation) => relation.record_id).sort();
  if (
    baselineIds.length !== tuple.observed_relation_count ||
    idsSha256(baselineIds) !== tuple.observed_relation_record_ids_sha256
  ) {
    throw new Error(`Frozen inventory mismatch for tuple ${index}`);
  }

  const postIds = (grouped.get(tupleKey(tuple)) ?? []).map((relation) => relation.record_id).sort();
  const postIdSet = new Set(postIds);
  const baselineIdSet = new Set(baselineIds);
  const finding = FINDINGS.get(index);
  const unknownFindingIds = finding?.suspect_relation_ids.filter((id) => !baselineIdSet.has(id) && !postIdSet.has(id)) ?? [];
  if (unknownFindingIds.length > 0) {
    throw new Error(`Semantic finding for tuple ${index} names unknown relation(s): ${unknownFindingIds.join(", ")}`);
  }
  const suspectIds = finding?.suspect_relation_ids.filter((id) => postIdSet.has(id)).sort() ?? [];
  const remediatedIds = baselineIds.filter((id) => !postIdSet.has(id));
  const decision = postIds.length === 0 ? "rejected" : suspectIds.length > 0 ? "needs_remediation" : "approved";
  const representativeIds = [...new Set([...suspectIds, ...postIds])].slice(0, 5);
  const remediationActions = suspectIds.map((relationId) => {
    const relation = postRecordsById.get(relationId);
    if (!relation || relation.record_kind !== "relation") {
      throw new Error(`Semantic finding ${index} cannot resolve relation ${relationId} in post-correction corpus`);
    }
    const evidenceIds = [...new Set(relation.evidence_refs.map((ref) => ref.evidence_id).filter((id): id is string => typeof id === "string" && id.trim().length > 0))].sort();
    if (evidenceIds.length === 0) {
      throw new Error(`Semantic finding ${index} relation ${relationId} has no exact evidence id`);
    }
    const actionCategory = ACTION_BY_RELATION.get(relationId) ?? ACTION_BY_TUPLE.get(index);
    if (!actionCategory) throw new Error(`Semantic finding ${index} has no bounded remediation action`);
    return {
      relation_id: relationId,
      evidence_ids: evidenceIds,
      action_category: actionCategory,
      defect: finding!.semantic_rationale,
      bounded_remediation: finding!.remediation_proposal,
    };
  });

  let semanticRationale: string;
  let remediationProposal: string | null;
  if (decision === "rejected") {
    semanticRationale = "All frozen-baseline assignments for this observed tuple were retracted or retyped by reviewed semantic corrections. No post-correction relation uses this endpoint shape, so retaining it as an allowed type rule would preserve a known legacy defect without a valid edge.";
    remediationProposal = "Remove this obsolete observed tuple from the allowed endpoint matrix while retaining the remediated/retyped baseline relation ids as migration provenance.";
  } else if (decision === "needs_remediation") {
    semanticRationale = finding!.semantic_rationale;
    remediationProposal = finding!.remediation_proposal;
  } else if (finding && finding.suspect_relation_ids.length > 0) {
    semanticRationale = `The previously identified relation-specific defect(s) were retracted or retyped before this final replay. The remaining ${postIds.length} exact edge(s) use ${tuple.relation_kind} in ${tuple.relation_family} from ${tuple.subject_kind} to ${tuple.object_kind}, and the endpoint role and cited evidence support that shape at the stored precision.`;
    remediationProposal = null;
  } else {
    semanticRationale = `All ${postIds.length} exact post-correction edge(s) consistently use ${tuple.relation_kind} in ${tuple.relation_family} to relate ${tuple.subject_kind} to ${tuple.object_kind}; resolved endpoints and representative cited evidence support that role at the stored precision, with no self-loop, surrogate endpoint, reversed direction, or unsupported type role found.`;
    remediationProposal = null;
  }

  return {
    tuple_index: index,
    relation_kind: tuple.relation_kind,
    relation_family: tuple.relation_family,
    subject_kind: tuple.subject_kind,
    object_kind: tuple.object_kind,
    decision,
    baseline_observed_relation_count: baselineIds.length,
    baseline_observed_relation_ids_sha256: idsSha256(baselineIds),
    post_correction_relation_count: postIds.length,
    reviewed_relation_ids_sha256: idsSha256(postIds),
    representative_relation_ids: representativeIds,
    evidence_source_review_method: EVIDENCE_SOURCE_REVIEW_METHOD,
    semantic_rationale: semanticRationale,
    reviewed_at: REVIEWED_AT,
    reviewed_by: REVIEWED_BY,
    suspect_relation_ids: suspectIds,
    remediation_proposal: remediationProposal,
    remediation_actions: remediationActions,
    remediated_or_retyped_baseline_relation_ids: remediatedIds,
  };
});

for (const findingIndex of FINDINGS.keys()) {
  if (findingIndex % SHARD_MODULUS !== SHARD_REMAINDER || !assigned.some(({ index }) => index === findingIndex)) {
    throw new Error(`Semantic finding ${findingIndex} is outside shard ${SHARD_REMAINDER}/${SHARD_MODULUS}`);
  }
  if (!ACTION_BY_TUPLE.has(findingIndex)) throw new Error(`Semantic finding ${findingIndex} has no action category`);
}

const approvedCount = decisions.filter((decision) => decision.decision === "approved").length;
const rejectedCount = decisions.filter((decision) => decision.decision === "rejected").length;
const needsRemediationCount = decisions.filter((decision) => decision.decision === "needs_remediation").length;
const allReviewedIds = [...new Set(decisions.flatMap((decision) => {
  const tuple = inventory.tuples[decision.tuple_index]!;
  return (grouped.get(tupleKey(tuple)) ?? []).map((relation) => relation.record_id);
}))].sort();
const allSuspectIds = [...new Set(decisions.flatMap((decision) => decision.suspect_relation_ids))].sort();
const allReviewedEvidenceIds = [...new Set(allReviewedIds.flatMap((recordId) => {
  const relation = postRecordsById.get(recordId);
  if (!relation || relation.record_kind !== "relation") throw new Error(`Reviewed relation ${recordId} is missing`);
  return relation.evidence_refs.map((ref) => {
    if (typeof ref.evidence_id !== "string" || !ref.evidence_id.trim()) {
      throw new Error(`Reviewed relation ${recordId} has an evidence ref without evidence_id`);
    }
    return ref.evidence_id;
  });
}))].sort();

const output = {
  schema_version: 1,
  shard_id: "relationship-contract-v1-baseline-semantic-review-part-0",
  contract_id: inventory.contract_id,
  review_status: needsRemediationCount > 0 ? "completed_with_remediation_required" : "complete",
  partition: {
    inventory_path: relative(repoRoot, INVENTORY_PATH),
    inventory_sha256: fileSha256(INVENTORY_PATH),
    index_modulus: SHARD_MODULUS,
    index_remainder: SHARD_REMAINDER,
  },
  reviewed_at: REVIEWED_AT,
  reviewed_by: REVIEWED_BY,
  projection: {
    method: "entriesToRecords(readSubmissionEntries(), retiredSubmissionIds) followed by withSemanticCorrections(corrections, supersessions)",
    authoritative_submission_record_count: replay.mechanicalRecords.length,
    authoritative_submission_records_sha256: recordsSha256(replay.mechanicalRecords),
    semantic_correction_count: replay.corrections.length,
    semantic_corrections_file_sha256: fileSha256(CORRECTIONS_PATH),
    semantic_corrections_logical_sha256: sha256(stableJson(replay.corrections as unknown as JsonValue)),
    semantic_supersession_count: replay.supersessions.length,
    semantic_supersessions_file_sha256: fileSha256(SUPERSESSIONS_PATH),
    semantic_supersessions_logical_sha256: sha256(stableJson(replay.supersessions as unknown as JsonValue)),
    correction_apply_summary: {
      total: replay.summary.total,
      applied: replay.summary.applied,
      superseded: replay.summary.superseded,
      skipped: replay.summary.skipped,
      issues: replay.issueCount,
    },
    post_correction_record_count: replay.records.length,
    post_correction_records_sha256: recordsSha256(replay.records),
    post_correction_relation_count: replay.records.filter((record) => record.record_kind === "relation").length,
  },
  summary: {
    assigned_tuple_count: assigned.length,
    approved_count: approvedCount,
    rejected_count: rejectedCount,
    needs_remediation_count: needsRemediationCount,
    baseline_relation_count: decisions.reduce((sum, decision) => sum + decision.baseline_observed_relation_count, 0),
    post_correction_relation_count: decisions.reduce((sum, decision) => sum + decision.post_correction_relation_count, 0),
    reviewed_relation_ids_sha256: idsSha256(allReviewedIds),
    reviewed_evidence_id_count: allReviewedEvidenceIds.length,
    reviewed_evidence_ids_sha256: idsSha256(allReviewedEvidenceIds),
    suspect_relation_count: allSuspectIds.length,
    suspect_relation_ids_sha256: idsSha256(allSuspectIds),
    zero_post_correction_tuple_count: decisions.filter((decision) => decision.post_correction_relation_count === 0).length,
  },
  decisions,
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
const rendered = `${JSON.stringify(output, null, 2)}\n`;
if (check) {
  const existing = readFileSync(OUTPUT_PATH, "utf8");
  if (existing !== rendered) {
    throw new Error(`${relative(repoRoot, OUTPUT_PATH)} is stale; rerun with --apply`);
  }
  console.log(JSON.stringify({
    artifact: relative(repoRoot, OUTPUT_PATH),
    sha256: sha256(rendered),
    ...output.summary,
    status: "deterministic",
  }, null, 2));
} else {
  writeFileSync(OUTPUT_PATH, rendered, "utf8");
}
