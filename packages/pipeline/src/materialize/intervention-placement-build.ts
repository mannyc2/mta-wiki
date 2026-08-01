import { join } from "node:path";
import { repoRoot } from "@mta-wiki/core/paths";
import { readCanonicalRecords } from "./canonical-read.js";
import {
  loadApplicationPlacementTransitions,
  validateApplicationPlacementTransitions,
  validateApplicationPlacementTransitionManifests,
} from "./application-placement-transitions.js";
import {
  buildInterventionLifecycleProjection,
  type InterventionLifecycleProjection,
} from "./current-intervention-footprint.js";
import {
  buildInterventionPlacementFrontier,
  type InterventionPlacementFrontier,
} from "./intervention-placement-frontier.js";
import {
  loadAcceptedPlacementCandidateDispositions,
  validateAcceptedPlacementCandidateDispositionManifests,
  validatePlacementDecisionProvenance,
} from "./intervention-placement-candidate-dispositions.js";
import {
  loadAcceptedInterventionLifecycleAssertions,
  validateAcceptedInterventionLifecycleAssertions,
} from "./intervention-lifecycle.js";
import {
  loadInterventionPlacementIdentityOperations,
  replayInterventionPlacementIdentityOperations,
  validateInterventionPlacementIdentityOperationManifests,
  type InterventionPlacementRegistryEntry,
} from "./intervention-placements.js";
import {
  loadResolvedInterventions,
  productionResolvedInterventionDir,
} from "./resolved-interventions.js";
import type { ApplicationPlacementTransition } from "./application-placement-transitions.js";

export type ProductionInterventionPlacementBuild = {
  registry: InterventionPlacementRegistryEntry[];
  transitions: ApplicationPlacementTransition[];
  frontier: InterventionPlacementFrontier;
  lifecycle: InterventionLifecycleProjection;
  documentary_lifecycle_observations: Array<{
    observation_id: string;
    subject_record_id: string | null;
    lifecycle_phase: string | null;
    document_status: string | null;
    assertion_as_of: string | null;
    source_id: string;
  }>;
};

export function productionInterventionPlacementDir(rootDir = repoRoot): string {
  return join(rootDir, "data", "resolved-transit", "operator", "v1", "placements");
}

export function productionInterventionLifecycleDir(rootDir = repoRoot): string {
  return join(rootDir, "data", "resolved-transit", "operator", "v1", "lifecycle");
}

export function buildProductionInterventionPlacements(
  asOfDate: string,
  rootDir = repoRoot,
): ProductionInterventionPlacementBuild {
  const records = readCanonicalRecords();
  const resolved = loadResolvedInterventions(productionResolvedInterventionDir(rootDir));
  const placementBatchesDir = join(
    rootDir,
    "data",
    "intervention-placements",
    "campaigns",
    "plan-054",
    "batches",
  );
  const operations = validateInterventionPlacementIdentityOperationManifests(
    loadInterventionPlacementIdentityOperations(join(
      rootDir,
      "data",
      "intervention-placements",
      "accepted",
      "identity-operations",
    )),
    placementBatchesDir,
  );
  const registry = replayInterventionPlacementIdentityOperations(operations);
  const transitions = validateApplicationPlacementTransitions(
    validateApplicationPlacementTransitionManifests(
      loadApplicationPlacementTransitions(join(
        rootDir,
        "data",
        "intervention-placements",
        "accepted",
        "transitions",
      )),
      placementBatchesDir,
    ),
    resolved.applications,
    registry,
    new Map(resolved.episodes.map((episode) => [
      episode.occurrence_id,
      episode.resolved_onset.date,
    ])),
  );
  const candidateDispositions = validateAcceptedPlacementCandidateDispositionManifests(
    loadAcceptedPlacementCandidateDispositions(join(
      rootDir,
      "data",
      "intervention-placements",
      "accepted",
      "candidate-dispositions",
    )),
    placementBatchesDir,
    resolved.applications,
  );
  const frontier = buildInterventionPlacementFrontier({
    canonical_records: records,
    applications: resolved.applications,
    registry,
    transitions,
    candidate_dispositions: candidateDispositions,
  });
  validatePlacementDecisionProvenance({
    candidate_dispositions: candidateDispositions,
    candidate_ledger: frontier.candidate_ledger,
    identity_operations: operations,
    registry,
    transitions,
  });
  const acceptedAssertions = validateAcceptedInterventionLifecycleAssertions(
    loadAcceptedInterventionLifecycleAssertions(join(
      rootDir,
      "data",
      "intervention-lifecycle",
      "accepted",
    )),
    {
      placements: registry,
      episodes: resolved.episodes,
      applications: resolved.applications,
      canonical_records: records,
    },
  );
  const lifecycle = buildInterventionLifecycleProjection({
    placements: registry,
    transitions,
    assertions: acceptedAssertions,
    as_of_date: asOfDate,
  });
  const documentaryLifecycleObservations = records.flatMap((record) => {
    const lifecyclePhase = typeof record.payload.lifecycle_phase === "string"
      ? record.payload.lifecycle_phase
      : null;
    const documentStatus = typeof record.payload.document_time_status === "string"
      ? record.payload.document_time_status
      : typeof record.payload.status === "string" ? record.payload.status : null;
    const assertionAsOf = typeof record.payload.as_of_date === "string"
      ? record.payload.as_of_date
      : null;
    if (lifecyclePhase === null && documentStatus === null && assertionAsOf === null) return [];
    const subject = typeof record.payload.subject_id === "string"
      ? record.payload.subject_id
      : record.record_kind === "event" ? record.record_id : null;
    return [{
      observation_id: `documentary:${record.record_id}`,
      subject_record_id: subject,
      lifecycle_phase: lifecyclePhase,
      document_status: documentStatus,
      assertion_as_of: assertionAsOf,
      source_id: record.source_id,
    }];
  }).sort((a, b) => a.observation_id.localeCompare(b.observation_id));
  return {
    registry,
    transitions,
    frontier,
    lifecycle,
    documentary_lifecycle_observations: documentaryLifecycleObservations,
  };
}
