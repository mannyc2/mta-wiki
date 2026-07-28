export const RESOLVED_TRANSIT_DB_VERSION = 2;

export const RESOLVED_TRANSIT_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE resolved_transit_state (
  state_key TEXT PRIMARY KEY CHECK (state_key = 'resolved-transit'),
  schema_version INTEGER NOT NULL,
  contract_id TEXT NOT NULL,
  sealed INTEGER NOT NULL CHECK (sealed IN (0, 1)),
  data_sha256 TEXT NOT NULL
) STRICT;

CREATE TABLE resolved_intervention_episodes (
  occurrence_id TEXT PRIMARY KEY,
  onset_date TEXT NOT NULL,
  onset_precision TEXT NOT NULL CHECK (onset_precision IN ('day', 'month')),
  review_decision_id TEXT NOT NULL,
  review_membership_fingerprint TEXT NOT NULL,
  resolution_method TEXT NOT NULL CHECK (resolution_method IN ('accepted_review', 'lossless_v1_migration')),
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE TABLE resolved_intervention_applications (
  application_id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL REFERENCES resolved_intervention_episodes(occurrence_id),
  route_record_id TEXT NOT NULL,
  gtfs_route_id TEXT NOT NULL,
  treatment_record_id TEXT NOT NULL,
  treatment_family TEXT NOT NULL,
  phase_record_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('add', 'modify', 'remove', 'suspend', 'resume', 'retain', 'unknown')),
  extent_kind TEXT NOT NULL CHECK (extent_kind IN ('route_wide', 'bounded_segment', 'stop_set', 'service_pattern', 'unknown')),
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE TABLE resolved_intervention_context_links (
  context_link_id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL REFERENCES resolved_intervention_episodes(occurrence_id),
  context_record_id TEXT NOT NULL,
  context_record_kind TEXT NOT NULL CHECK (context_record_kind IN ('project', 'corridor', 'entity')),
  relation_record_id TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE TABLE resolved_intervention_application_reconciliation (
  reconciliation_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  occurrence_id TEXT,
  disposition TEXT NOT NULL CHECK (disposition IN ('does_not_apply', 'unknown', 'ambiguous', 'pending_review')),
  reason_code TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE TABLE resolved_intervention_identity_reconciliation (
  reconciliation_id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL UNIQUE,
  disposition TEXT NOT NULL CHECK (disposition = 'pending_review'),
  reason_code TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE INDEX resolved_episode_onset_idx
  ON resolved_intervention_episodes(onset_date, occurrence_id);
CREATE INDEX resolved_application_occurrence_idx
  ON resolved_intervention_applications(occurrence_id, application_id);
CREATE INDEX resolved_application_gtfs_route_idx
  ON resolved_intervention_applications(gtfs_route_id, occurrence_id);
CREATE INDEX resolved_application_treatment_family_idx
  ON resolved_intervention_applications(treatment_family, occurrence_id);
CREATE INDEX resolved_application_phase_idx
  ON resolved_intervention_applications(phase_record_id, occurrence_id);
CREATE INDEX resolved_application_action_idx
  ON resolved_intervention_applications(action, occurrence_id);
CREATE INDEX resolved_context_occurrence_idx
  ON resolved_intervention_context_links(occurrence_id, context_record_kind);
CREATE INDEX resolved_application_reconciliation_occurrence_idx
  ON resolved_intervention_application_reconciliation(occurrence_id, disposition);

CREATE TABLE resolved_intervention_placements (
  placement_id TEXT PRIMARY KEY,
  registry_state TEXT NOT NULL CHECK (registry_state IN ('live_identity', 'retired_identity')),
  route_record_id TEXT NOT NULL,
  gtfs_route_id TEXT NOT NULL,
  treatment_family TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  normalized_scope_key TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE TABLE resolved_application_placement_transitions (
  transition_id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES resolved_intervention_applications(application_id),
  action TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE TABLE resolved_intervention_placement_frontier (
  candidate_id TEXT PRIMARY KEY,
  disposition TEXT NOT NULL,
  origin TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE TABLE resolved_intervention_placement_reconciliation (
  application_id TEXT PRIMARY KEY REFERENCES resolved_intervention_applications(application_id),
  disposition TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE TABLE documentary_lifecycle_observations (
  observation_id TEXT PRIMARY KEY,
  subject_record_id TEXT,
  lifecycle_phase TEXT,
  document_status TEXT,
  assertion_as_of TEXT,
  source_id TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE VIEW latest_lifecycle_observation AS
SELECT observation_id, subject_record_id, lifecycle_phase, document_status,
       assertion_as_of, source_id, row_json
FROM (
  SELECT dlo.*, ROW_NUMBER() OVER (
    PARTITION BY subject_record_id
    ORDER BY COALESCE(assertion_as_of, '') DESC, observation_id DESC
  ) AS rn
  FROM documentary_lifecycle_observations dlo
)
WHERE rn = 1;

CREATE TABLE resolved_intervention_lifecycle_assertions (
  assertion_id TEXT PRIMARY KEY,
  placement_id TEXT REFERENCES resolved_intervention_placements(placement_id),
  state TEXT NOT NULL,
  review_state TEXT NOT NULL,
  valid_start_earliest TEXT,
  valid_start_latest TEXT,
  valid_end_earliest TEXT,
  valid_end_latest TEXT,
  document_assertion_as_of TEXT,
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE TABLE resolved_intervention_placement_state_as_of (
  placement_id TEXT PRIMARY KEY REFERENCES resolved_intervention_placements(placement_id),
  as_of_date TEXT NOT NULL,
  state TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE TABLE resolved_current_intervention_footprint (
  placement_id TEXT PRIMARY KEY REFERENCES resolved_intervention_placements(placement_id),
  as_of_date TEXT NOT NULL,
  gtfs_route_id TEXT NOT NULL,
  treatment_family TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK (json_valid(row_json))
) STRICT;

CREATE INDEX resolved_placement_route_idx
  ON resolved_intervention_placements(gtfs_route_id, placement_id);
CREATE INDEX resolved_placement_treatment_idx
  ON resolved_intervention_placements(treatment_family, placement_id);
CREATE INDEX resolved_placement_scope_idx
  ON resolved_intervention_placements(scope_kind, normalized_scope_key);
CREATE INDEX resolved_transition_application_idx
  ON resolved_application_placement_transitions(application_id, transition_id);
CREATE INDEX documentary_lifecycle_subject_idx
  ON documentary_lifecycle_observations(subject_record_id, assertion_as_of);
CREATE INDEX resolved_lifecycle_state_idx
  ON resolved_intervention_lifecycle_assertions(state, review_state);
CREATE INDEX resolved_lifecycle_valid_bounds_idx
  ON resolved_intervention_lifecycle_assertions(valid_start_latest, valid_end_earliest);
CREATE INDEX resolved_lifecycle_document_time_idx
  ON resolved_intervention_lifecycle_assertions(document_assertion_as_of);
CREATE INDEX resolved_state_as_of_idx
  ON resolved_intervention_placement_state_as_of(as_of_date, state);
CREATE INDEX resolved_current_footprint_route_idx
  ON resolved_current_intervention_footprint(as_of_date, gtfs_route_id);
`;
