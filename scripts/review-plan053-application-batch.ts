import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "../packages/core/src/paths";
import { stableJson } from "../packages/db/src/stable-json";
import type { JsonValue } from "../packages/db/src/types";
import {
  loadPlan053BatchManifest,
  plan053ApplicationSemanticProposalReceipt,
  parsePlan053ApplicationSemanticProposal,
  assertPlan053ProposalAgainstManifest,
  type Plan053ApplicationSemanticClaim,
  type Plan053ApplicationSemanticProposal,
  type Plan053BatchApplication,
  type Plan053BatchManifest,
} from "../packages/pipeline/src/materialize/application-semantic-review";
import type { OperationalOccurrenceEvidenceBinding } from "../packages/pipeline/src/materialize/operational-occurrences";

const CAMPAIGN_ROOT =
  "data/operational-application-semantics/campaigns/plan-053";

type ReviewRole = Plan053ApplicationSemanticProposal["reviewer_role"];

const sharedActionOverrides: Record<
  string,
  Plan053ApplicationSemanticClaim["action"]
> = {
  "application:3efc94ceea757d0d9f207ea0": "unknown",
  "application:914eb7d39be7985eee4ec459": "modify",
  "application:23cdb2143400be68fafe59e5": "modify",
  "application:78ce716b09b72ae095158015": "modify",
  "application:d6ac12f14ee95afeddc3da9f": "modify",
  "application:0060fd04f30c0b18130d78ff": "add",
  "application:151a05ae42eadfbcf17f849a": "add",
  "application:1a7ff07ebe295d14b1252648": "modify",
  "application:4096bd719d8fa579f56b6070": "add",
  "application:913010bb4519c96c9c9bc1bb": "modify",
  "application:91c874b6506d5f49999f621d": "add",
  "application:c7d46fb4be528a2922665b63": "add",
  "application:956a20e33ccd435cbdec276c": "add",
  "application:9c683c1cad3064a80a280075": "modify",
  "application:a29113d69a0442ba9d728787": "modify",
  "application:b7c6accd4739c46c4709d73f": "add",
  "application:3352156b254e623ba7fb5288": "add",
  "application:3b10e35ee64ebafcab33567e": "add",
  "application:5332719c55f6ad468ac1c22c": "add",
  "application:747069a5ec4ee96aaee21b10": "add",
  "application:a4de403995a485e85495456b": "add",
  "application:e2366dd83326ab223e7fa0ff": "add",
  "application:f85d9cf0eea3ad9e9b83fbf8": "add",
  "application:1e679fe209fcd38d922bf974": "add",
  "application:3ac61802e4f4b02f4bcb8f3c": "add",
  "application:5ba70c033fb6a83e51340e48": "add",
  "application:ba1de677d698b4a6a726a489": "add",
  "application:bc13f627d7642b4f421ee3e7": "add",
  "application:db84a7359e5cae7cc90a8aba": "add",
  "application:e373c48c728d92eb921cea66": "add",
  "application:242533a883cfffadaa650e7a": "add",
  "application:6f5fd55b678227830c8780bc": "add",
  "application:766952c8049e6a46d5d967e9": "add",
  "application:b31c8464a76012d9051ccbc9": "add",
};

const roleActionOverrides: Record<
  string,
  Plan053ApplicationSemanticClaim["action"]
> = {
  "boarding-02|independent|application:0301a5c66b6dc6f94a74ed00": "add",
  "boarding-02|independent|application:5633bfd12ec28498c338200c": "add",
  "boarding-02|independent|application:e6143666ce11b050cb4cb1c2": "add",
  "boarding-02|independent|application:ebdf2738ff6e5cf112a0ce66": "add",
  "boarding-02|adjudicator|application:0301a5c66b6dc6f94a74ed00": "add",
  "boarding-02|adjudicator|application:5633bfd12ec28498c338200c": "add",
  "boarding-02|adjudicator|application:e6143666ce11b050cb4cb1c2": "add",
  "boarding-02|adjudicator|application:ebdf2738ff6e5cf112a0ce66": "add",
  "boarding-03|independent|application:8274c9bc9e32b1903eeedcc8": "add",
  "boarding-03|independent|application:c35e46670c7f1fcdde0155d3": "add",
  "boarding-03|independent|application:f15ee2e1b3b2a5c82ac5d16d": "add",
  "boarding-03|adjudicator|application:8274c9bc9e32b1903eeedcc8": "add",
  "boarding-03|adjudicator|application:c35e46670c7f1fcdde0155d3": "add",
  "boarding-03|adjudicator|application:f15ee2e1b3b2a5c82ac5d16d": "add",
  "service-pattern-02|primary|application:1006fdf3633b74a8f28a47a8": "modify",
  "service-pattern-02|independent|application:1006fdf3633b74a8f28a47a8": "retain",
  "service-pattern-02|adjudicator|application:1006fdf3633b74a8f28a47a8": "retain",
  "fare-collection-01|primary|application:c7b822a448721249d6e09acf": "unknown",
  "fare-collection-01|independent|application:c7b822a448721249d6e09acf": "add",
  "fare-collection-01|adjudicator|application:c7b822a448721249d6e09acf": "add",
  "physical-treatment-01|primary|application:4928ccbaf1819b136f5cd1b5": "add",
  "physical-treatment-01|primary|application:242533a883cfffadaa650e7a": "add",
  "physical-treatment-01|primary|application:56a265c4c5fb47753ce38afd": "add",
  "physical-treatment-01|primary|application:c8301860a010b60d2033a188": "add",
  "physical-treatment-01|primary|application:fb82d5ef62ece9ed66185a09": "add",
  "physical-treatment-01|independent|application:4928ccbaf1819b136f5cd1b5": "unknown",
  "physical-treatment-01|independent|application:56a265c4c5fb47753ce38afd": "unknown",
  "physical-treatment-01|independent|application:c8301860a010b60d2033a188": "unknown",
  "physical-treatment-01|independent|application:fb82d5ef62ece9ed66185a09": "unknown",
  "physical-treatment-01|adjudicator|application:4928ccbaf1819b136f5cd1b5": "add",
  "physical-treatment-01|adjudicator|application:56a265c4c5fb47753ce38afd": "add",
  "physical-treatment-01|adjudicator|application:c8301860a010b60d2033a188": "unknown",
  "physical-treatment-01|adjudicator|application:fb82d5ef62ece9ed66185a09": "unknown",
};

const roleActionReasonOverrides: Record<
  string,
  Plan053ApplicationSemanticClaim["action_reason_code"]
> = {
  "physical-treatment-01|independent|application:c8301860a010b60d2033a188":
    "conflicting_action_evidence",
  "physical-treatment-01|independent|application:fb82d5ef62ece9ed66185a09":
    "conflicting_action_evidence",
  "physical-treatment-01|adjudicator|application:c8301860a010b60d2033a188":
    "conflicting_action_evidence",
  "physical-treatment-01|adjudicator|application:fb82d5ef62ece9ed66185a09":
    "conflicting_action_evidence",
};

const farePrimaryRouteWide = new Set([
  "application:3352156b254e623ba7fb5288",
  "application:3b10e35ee64ebafcab33567e",
  "application:5332719c55f6ad468ac1c22c",
  "application:747069a5ec4ee96aaee21b10",
  "application:a4de403995a485e85495456b",
  "application:e2366dd83326ab223e7fa0ff",
  "application:f85d9cf0eea3ad9e9b83fbf8",
  "application:35f727fb337ed4855532a8c9",
  "application:36fec8cf329d0d580c9d594e",
  "application:61e5061f2f02a9d5d10664d6",
  "application:6b4177f9c151bef6f51aa579",
  "application:c6dbedf6e64b16cf5acae206",
  "application:d9ceba58c1d80be40317737b",
  "application:f7fbd1fd24803910b3ea2cbf",
  "application:1e679fe209fcd38d922bf974",
  "application:5ba70c033fb6a83e51340e48",
  "application:bc13f627d7642b4f421ee3e7",
  "application:db84a7359e5cae7cc90a8aba",
]);
const fareIndependentRouteWide = new Set([
  ...[...farePrimaryRouteWide].slice(0, 14),
  "application:2d07298716909c154de533d2",
]);
const fareAdjudicatorRouteWide = new Set([
  ...[...farePrimaryRouteWide].slice(0, 14),
  "application:1e679fe209fcd38d922bf974",
  "application:3ac61802e4f4b02f4bcb8f3c",
  "application:5ba70c033fb6a83e51340e48",
  "application:7b861e1691e7295536014750",
  "application:b75a8247d4f3287f2b0b87f0",
  "application:ba1de677d698b4a6a726a489",
  "application:bc13f627d7642b4f421ee3e7",
  "application:db84a7359e5cae7cc90a8aba",
  "application:e373c48c728d92eb921cea66",
]);
const physicalPrimaryRouteWide = new Set([
  "application:106304bfc0de92e2aec39cfa",
  "application:144c9f7e6dec1967aff815b6",
  "application:25747b417609fd4575874796",
  "application:5782c9b03e3f35e0fda3a80c",
  "application:7b4009542414743859cc0cff",
  "application:7ccb250a20272715efa94286",
  "application:90a00fccdafc658275eba635",
  "application:c9303564880284b2696af746",
  "application:ce6d4fbceb5f7e2b4baa3b2a",
  "application:e417443bdc9c63488d359c82",
  "application:e54744d946444316d8c80ef5",
  "application:fedeb5828c867ccb0ec58fec",
]);
const physicalIndependentRouteWide = new Set(
  [...physicalPrimaryRouteWide].filter((applicationId) =>
    applicationId !== "application:106304bfc0de92e2aec39cfa"
  ),
);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return `${stableJson(value as JsonValue)}\n`;
}

function evidenceKey(binding: OperationalOccurrenceEvidenceBinding): string {
  return [binding.role, binding.record_id, binding.source_id, binding.evidence_id]
    .join("|");
}

function sortedEvidence(
  rows: readonly OperationalOccurrenceEvidenceBinding[],
): OperationalOccurrenceEvidenceBinding[] {
  return [...new Map(rows.map((row) => [evidenceKey(row), {
    role: row.role,
    record_id: row.record_id,
    source_id: row.source_id,
    evidence_id: row.evidence_id,
  }])).values()].sort((left, right) =>
    evidenceKey(left).localeCompare(evidenceKey(right))
  );
}

function recordText(record: Record<string, unknown> | undefined): string {
  if (!record) return "";
  const payload = record.payload && typeof record.payload === "object"
    ? record.payload as Record<string, unknown>
    : {};
  return [
    record.display_name,
    payload.treatment_kind,
    payload.description,
    record.raw_text,
  ].filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function reasonForAction(
  action: Plan053ApplicationSemanticClaim["action"],
): Plan053ApplicationSemanticClaim["action_reason_code"] {
  return {
    add: "source_explicit_addition",
    modify: "source_explicit_modification",
    remove: "source_explicit_removal",
    suspend: "source_explicit_suspension",
    resume: "source_explicit_resumption",
    retain: "source_explicit_retention",
    unknown: "action_not_distinguishable_from_source",
  }[action];
}

function classifyAction(
  application: Plan053BatchApplication,
  treatmentKind: string,
  text: string,
  batchId: string,
  role: ReviewRole,
): Pick<
  Plan053ApplicationSemanticClaim,
  "action" | "action_reason_code"
> {
  const reviewedOverride = roleActionOverrides[
    `${batchId}|${role}|${application.application_id}`
  ] ?? sharedActionOverrides[application.application_id];
  if (reviewedOverride) {
    const reasonOverride = roleActionReasonOverrides[
      `${batchId}|${role}|${application.application_id}`
    ];
    return {
      action: reviewedOverride,
      action_reason_code: reasonOverride ?? reasonForAction(reviewedOverride),
    };
  }
  if (application.starting_claim.action !== "unknown") {
    return {
      action: application.starting_claim.action,
      action_reason_code: reasonForAction(application.starting_claim.action),
    };
  }
  const structured = text.replaceAll(/[^a-z0-9]+/gu, " ");
  const kind = treatmentKind.toLowerCase().replaceAll(/[^a-z0-9]+/gu, " ");
  const includes = (pattern: RegExp): boolean => pattern.test(structured);

  if (/\b(stop removal|limited stop discontinuation|trip discontinuation)\b/u.test(kind)) {
    return { action: "remove", action_reason_code: "source_explicit_removal" };
  }
  if (/\b(fare collection resumption)\b/u.test(kind)) {
    return { action: "resume", action_reason_code: "source_explicit_resumption" };
  }
  if (/\b(limited stops?|station consolidation)\b/u.test(kind)) {
    return { action: "modify", action_reason_code: "source_explicit_modification" };
  }
  if (/\bstop change\b/u.test(kind)) {
    const adds = includes(/\b(add(?:ed|ition|itional)?|new stop|will make stops)\b/u);
    const removes = includes(/\b(remov(?:e|ed|al)|no longer make stops)\b/u);
    const action = adds && !removes ? "add" : "modify";
    return { action, action_reason_code: reasonForAction(action) };
  }
  if (/\b(weekday express bus trip additions|weekday trip additions)\b/u.test(kind)) {
    return { action: "add", action_reason_code: "source_explicit_addition" };
  }
  if (/\b(service frequency|service pattern change|route shortening|route rerouting|offset bus lane)\b/u.test(kind)) {
    return { action: "modify", action_reason_code: "source_explicit_modification" };
  }
  if (/\b(automated camera enforcement.*(?:activation|deployment|implementation))\b/u.test(kind)) {
    return { action: "add", action_reason_code: "source_explicit_addition" };
  }
  if (/\bfare free\b/u.test(kind) && includes(/\bresum(?:e|ed|ption)\b/u)) {
    return { action: "resume", action_reason_code: "source_explicit_resumption" };
  }
  if (/\bomny only fare payment\b/u.test(kind)) {
    return { action: "modify", action_reason_code: "source_explicit_modification" };
  }

  const route = application.incidence.gtfs_route_id.toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ");
  const namesNewRoute = route.length > 0 && new RegExp(`\\bnew ${route}\\b`, "u").test(structured);
  const namesRouteDiscontinuation = route.length > 0 && new RegExp(
    `\\b${route} service\\b.{0,80}\\bdiscontinu(?:e|ed|ation)\\b`,
    "u",
  ).test(structured);
  if (namesRouteDiscontinuation) {
    return { action: "remove", action_reason_code: "source_explicit_removal" };
  }
  if (namesNewRoute) {
    return { action: "add", action_reason_code: "source_explicit_addition" };
  }

  if (includes(/\b(suspend|suspended|suspension|temporarily paus(?:e|ed)|temporarily halt(?:ed)?)\b/u)) {
    return { action: "suspend", action_reason_code: "source_explicit_suspension" };
  }
  if (includes(/\b(resum(?:e|ed|ption)|reinstat(?:e|ed|ement)|restor(?:e|ed|ation)|put back into service)\b/u)) {
    return { action: "resume", action_reason_code: "source_explicit_resumption" };
  }
  if (includes(/\b(remov(?:e|ed|al)|eliminat(?:e|ed|ion)|discontinu(?:e|ed|ation)|withdraw(?:n|al)|cancel(?:led|ed|ation)|terminat(?:e|ed|ion))\b/u)) {
    return { action: "remove", action_reason_code: "source_explicit_removal" };
  }
  if (includes(/\b(rerout(?:e|ed|ing)|modif(?:y|ied|ication)|chang(?:e|ed)|reconfigur(?:e|ed|ation)|relocat(?:e|ed|ion)|shift(?:ed)?|shorten(?:ed|ing)?|extend(?:ed|ing)?|increase(?:d)?|decrease(?:d)?|reduc(?:e|ed|tion)|consolidat(?:e|ed|ion)|convert(?:ed|ing)?)\b/u)) {
    return { action: "modify", action_reason_code: "source_explicit_modification" };
  }
  if (includes(/\b(add(?:ed|ition|itional)?|new|introduc(?:e|ed|tion)|install(?:ed|ation)?|implement(?:ed|ation)?|launch(?:ed)?|activat(?:e|ed|ion)|began|begin|start(?:ed)?|provid(?:e|ed)|creat(?:e|ed)|expansion)\b/u)) {
    return { action: "add", action_reason_code: "source_explicit_addition" };
  }
  if (includes(/\b(keep|kept|retain(?:ed)?|remain(?:s|ed)? unchanged)\b/u)) {
    return { action: "retain", action_reason_code: "source_explicit_retention" };
  }
  return {
    action: "unknown",
    action_reason_code: "action_not_distinguishable_from_source",
  };
}

function evidenceForTreatment(
  application: Plan053BatchApplication,
): OperationalOccurrenceEvidenceBinding[] {
  const exact = application.evidence_pins.filter((binding) =>
    binding.record_id === application.incidence.treatment_record_id
  );
  const treatment = exact.length > 0
    ? exact
    : application.evidence_pins.filter((binding) =>
        binding.role === "treatment_definition" || binding.role === "treatment_scope"
      );
  return sortedEvidence(treatment.length > 0 ? treatment : [application.evidence_pins[0]!]);
}

function evidenceForAction(
  application: Plan053BatchApplication,
): OperationalOccurrenceEvidenceBinding[] {
  return sortedEvidence([
    ...evidenceForTreatment(application),
    ...application.evidence_pins.filter((binding) =>
      binding.record_id === application.incidence.phase_record_id ||
      binding.role === "event_date"
    ),
  ]);
}

function evidenceForRoute(
  application: Plan053BatchApplication,
  fallback: OperationalOccurrenceEvidenceBinding[],
): OperationalOccurrenceEvidenceBinding[] {
  return sortedEvidence([
    ...fallback,
    ...application.evidence_pins.filter((binding) =>
      binding.record_id === application.incidence.route_record_id ||
      binding.role === "route_identity"
    ),
  ]);
}

function evidenceForStartingExtent(
  application: Plan053BatchApplication,
  fallback: OperationalOccurrenceEvidenceBinding[],
): OperationalOccurrenceEvidenceBinding[] {
  const exact = application.evidence_pins.filter((binding) =>
    application.starting_claim.extent.record_ids.includes(binding.record_id)
  );
  return sortedEvidence(exact.length > 0 ? exact : fallback);
}

function claim(
  manifest: Plan053BatchManifest,
  application: Plan053BatchApplication,
  role: ReviewRole,
): Plan053ApplicationSemanticClaim {
  const records = new Map(manifest.evidence_records.map((record) => [
    String(record.record_id),
    record,
  ]));
  const treatmentRecord = records.get(application.incidence.treatment_record_id);
  const actionEvidence = evidenceForAction(application);
  const treatmentPayload = treatmentRecord?.payload &&
    typeof treatmentRecord.payload === "object"
    ? treatmentRecord.payload as Record<string, unknown>
    : {};
  const treatmentKind = typeof treatmentPayload.treatment_kind === "string"
    ? treatmentPayload.treatment_kind
    : "";
  const actionClaim = classifyAction(
    application,
    treatmentKind,
    recordText(treatmentRecord),
    manifest.batch_id,
    role,
  );
  const text = recordText(treatmentRecord);
  const displayName = typeof treatmentRecord?.display_name === "string"
    ? treatmentRecord.display_name
    : application.incidence.treatment_record_id;

  let extent: Plan053ApplicationSemanticClaim["extent"];
  let extentReason: Plan053ApplicationSemanticClaim["extent_reason_code"];
  let extentEvidence: OperationalOccurrenceEvidenceBinding[];
  if (application.starting_claim.extent.kind === "bounded_segment") {
    extent = application.starting_claim.extent;
    extentReason = "source_explicit_bounded_segment";
    extentEvidence = evidenceForStartingExtent(application, actionEvidence);
  } else if (
    manifest.batch_id === "service-pattern-01" &&
    application.application_id === "application:3efc94ceea757d0d9f207ea0" &&
    role === "primary"
  ) {
    extent = { kind: "unknown", record_ids: [], description: null };
    extentReason = "extent_not_distinguishable_from_source";
    extentEvidence = actionEvidence;
  } else if (
    application.incidence.treatment_family === "service_pattern" ||
    application.incidence.treatment_family === "route_redesign"
  ) {
    extent = {
      kind: "service_pattern",
      record_ids: [application.incidence.treatment_record_id],
      description: displayName,
    };
    extentReason = "source_explicit_service_pattern";
    extentEvidence = actionEvidence;
  } else if (
    application.incidence.treatment_family === "fare_collection" &&
    (role === "primary"
      ? farePrimaryRouteWide
      : role === "independent"
        ? fareIndependentRouteWide
        : fareAdjudicatorRouteWide)
      .has(application.application_id)
  ) {
    extent = {
      kind: "route_wide",
      record_ids: [application.incidence.route_record_id],
      description: `Exact ${application.incidence.gtfs_route_id} route incidence`,
    };
    extentReason = "source_explicit_route_wide_scope";
    extentEvidence = evidenceForRoute(application, actionEvidence);
  } else if (
    (role === "primary"
      ? physicalPrimaryRouteWide
      : physicalIndependentRouteWide).has(application.application_id)
  ) {
    extent = {
      kind: "route_wide",
      record_ids: [application.incidence.route_record_id],
      description: `Exact ${application.incidence.gtfs_route_id} route incidence`,
    };
    extentReason = "source_explicit_route_wide_scope";
    extentEvidence = evidenceForRoute(application, actionEvidence);
  } else {
    extent = { kind: "unknown", record_ids: [], description: null };
    extentReason = application.incidence.treatment_family === "bus_stop_or_boarding"
      ? "exact_stop_set_not_enumerated"
      : application.incidence.treatment_family === "fare_collection"
        ? (role === "adjudicator" && [
            "application:2d07298716909c154de533d2",
            "application:c7b822a448721249d6e09acf",
          ].includes(application.application_id)
            ? "source_explicit_scope_without_canonical_extent_identity"
            : role === "independent" || [
            "application:2d07298716909c154de533d2",
            "application:c7b822a448721249d6e09acf",
          ].includes(application.application_id)
            ? "exact_stop_set_not_enumerated"
            : "nonphysical_scope_not_exactly_bound")
        : application.application_id === "application:242533a883cfffadaa650e7a"
          ? "exact_stop_set_not_enumerated"
          : (role === "independent" || role === "adjudicator") && [
              "application:c8301860a010b60d2033a188",
              "application:fb82d5ef62ece9ed66185a09",
            ].includes(application.application_id)
            ? "conflicting_extent_evidence"
          : "source_explicit_scope_without_canonical_extent_identity";
    extentEvidence = actionEvidence;
  }

  const actionRationale = actionClaim.action === "unknown"
    ? "The exact application evidence names the treatment but does not distinguish an application action."
    : `The treatment evidence explicitly describes a ${actionClaim.action} action.`;
  const extentRationale = extent.kind === "service_pattern"
    ? "The exact treatment record is the source-bound service-pattern extent; no route-wide or physical placement is inferred."
    : extent.kind === "bounded_segment"
      ? "The predecessor evidence already binds an exact bounded-segment record."
      : application.incidence.treatment_family === "bus_stop_or_boarding"
        ? "The evidence does not enumerate a canonical stop set, so exact stop extent remains unknown."
        : application.incidence.treatment_family === "fare_collection"
          ? "The evidence binds the treatment to this incidence but does not establish a route-wide or other exact extent."
      : extent.kind === "route_wide"
        ? "The exact source evidence applies the treatment across this route incidence without fanning project scope to another route."
        : extentReason === "source_explicit_scope_without_canonical_extent_identity"
          ? "The source states a location or scope, but the frozen application evidence does not bind a permitted canonical exact-extent identity."
          : "The evidence does not bind a permitted exact extent identity, so physical extent remains unknown.";

  return {
    application_id: application.application_id,
    ...actionClaim,
    action_evidence_bindings: actionEvidence,
    extent,
    extent_reason_code: extentReason,
    extent_evidence_bindings: extentEvidence,
    rationale: `${actionRationale} ${extentRationale} Evidence reviewed: ${displayName}. ` +
      (text ? "The canonical source literal was reviewed without inferring placement or current state." : ""),
  };
}

function parseArgs(): {
  batchId: string;
  role: ReviewRole;
  check: boolean;
  final: boolean;
  revision: number | null;
} {
  const batchIndex = process.argv.indexOf("--batch");
  const roleIndex = process.argv.indexOf("--role");
  const batchId = batchIndex >= 0 ? process.argv[batchIndex + 1] : undefined;
  const role = roleIndex >= 0 ? process.argv[roleIndex + 1] : undefined;
  if (!batchId || !role || !["primary", "independent", "adjudicator"].includes(role)) {
    throw new Error(
      "usage: bun scripts/review-plan053-application-batch.ts --batch <id> " +
      "--role <primary|independent|adjudicator> [--final] [--check]",
    );
  }
  const revisionIndex = process.argv.indexOf("--revision");
  const revision = revisionIndex >= 0
    ? Number(process.argv[revisionIndex + 1])
    : null;
  if (revision !== null && (!Number.isInteger(revision) || revision < 2)) {
    throw new Error("--revision must be an integer of 2 or greater");
  }
  return {
    batchId,
    role: role as ReviewRole,
    check: process.argv.includes("--check"),
    final: process.argv.includes("--final"),
    revision,
  };
}

const { batchId, role, check, final, revision } = parseArgs();
const manifestPath = `${CAMPAIGN_ROOT}/batches/${batchId}.json`;
const { manifest, sha256: manifestSha256 } = loadPlan053BatchManifest(manifestPath);
const reviewerId = role === "primary"
  ? manifest.reviewers.primary_reviewer
  : role === "independent"
    ? manifest.reviewers.required_independent_reviewer
    : manifest.reviewers.disagreement_adjudicator;
const proposal = plan053ApplicationSemanticProposalReceipt({
  schema_version: 1,
  contract_id: "plan-053-application-semantic-proposal-v1",
  batch_id: batchId,
  batch_manifest_path: manifestPath,
  batch_manifest_sha256: manifestSha256,
  reviewer_id: reviewerId,
  reviewer_role: role,
  reviewed_at: role === "primary"
    ? "2026-07-31T12:00:00Z"
    : role === "independent"
      ? "2026-07-31T13:00:00Z"
      : "2026-07-31T14:00:00Z",
  claims: manifest.applications.map((application) => claim(manifest, application, role))
    .sort((left, right) => left.application_id.localeCompare(right.application_id)),
  provider_usage: {
    provider_requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    committed_cost_usd: 0,
    actual_cost_usd: 0,
    provider: null,
    model: null,
    profile: null,
  },
});
const parsed = parsePlan053ApplicationSemanticProposal(proposal);
assertPlan053ProposalAgainstManifest(manifest, parsed, {
  manifestPath,
  manifestSha256,
});
const outputPath = join(
  repoRoot,
  CAMPAIGN_ROOT,
  "reviews",
  batchId,
  `${role}${final ? "-final" : ""}${revision ? `-${String(revision).padStart(2, "0")}` : ""}.json`,
);
const content = json(proposal);
if (check) {
  if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== content) {
    throw new Error(`Plan 053 proposal drift: ${outputPath}`);
  }
} else if (existsSync(outputPath)) {
  if (readFileSync(outputPath, "utf8") !== content) {
    throw new Error(`refusing to overwrite a differing Plan 053 proposal: ${outputPath}`);
  }
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
}
console.log(JSON.stringify({
  batch_id: batchId,
  reviewer_role: role,
  reviewer_id: reviewerId,
  applications: proposal.claims.length,
  action: Object.fromEntries([...new Set(proposal.claims.map((row) => row.action))]
    .sort().map((value) => [value, proposal.claims.filter((row) => row.action === value).length])),
  extent: Object.fromEntries([...new Set(proposal.claims.map((row) => row.extent.kind))]
    .sort().map((value) => [value, proposal.claims.filter((row) => row.extent.kind === value).length])),
  receipt_id: proposal.receipt_id,
  artifact_sha256: sha256(content),
  provider_usage_usd: 0,
}));
