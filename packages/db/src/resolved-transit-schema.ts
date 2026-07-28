export const RESOLVED_TRANSIT_DB_VERSION = 1;

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
`;
