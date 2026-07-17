export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined };
export type JsonObject = { [key: string]: JsonValue | undefined };

export type MtaObservationKind =
  | "source"
  | "entity"
  | "project"
  | "corridor"
  | "route"
  | "treatment_component"
  | "event"
  | "claim"
  | "metric_claim"
  | "table"
  | "source_gap"
  | "relation";

export type MtaEvidenceRef = {
  source_id: string;
  evidence_id?: string | undefined;
  source_path?: string | undefined;
  page_number?: number | undefined;
  block_id?: string | undefined;
  block_range?: string | undefined;
  child_block_ids?: string[] | undefined;
  text_sha256?: string | undefined;
  text_source?: "raw_text" | "normalized_text" | undefined;
  role?: string | undefined;
  source_quote?: string | undefined;
};

export type MtaEvidenceSubmissionRef = MtaEvidenceRef & {
  normalized_start_offset?: number | undefined;
  normalized_end_offset?: number | undefined;
};

export type MtaSubmitObservationInput = {
  source_id: string;
  observation_kind: MtaObservationKind;
  local_observation_id: string;
  target_record_id?: string | undefined;
  create_new?: boolean | undefined;
  label?: string | undefined;
  raw_text?: string | undefined;
  payload?: JsonObject | undefined;
  evidence_refs?: MtaEvidenceSubmissionRef[] | undefined;
  /** Required when submitting through the generic escape-hatch tool; mined by schema-audit for novel-kind discovery. */
  escape_justification?: string | undefined;
};

export type MtaSubmissionState = "accepted" | "rejected";

export type MtaSubmissionEntry = {
  submission_id: string;
  run_id: string;
  submitted_at: string;
  tool_args_sha256: string;
  /** Kind-registry schema generation in effect when the entry was created; absent on pre-schema entries. */
  schema_version?: number | undefined;
  tool_args: MtaSubmitObservationInput;
  validation: {
    state: MtaSubmissionState;
    issues: string[];
    warnings?: string[] | undefined;
  };
  /** Present only on owner-reviewed recovery entries produced from a durable proposal. */
  recovery_provenance?: {
    proposal_id: string;
    proposal_kind: "relation" | "observation_bundle";
    proposal_sha256: string;
    accepted_by: string;
    accepted_at: string;
  } | undefined;
};

export type MtaCanonicalRecord = {
  record_id: string;
  record_aliases?: string[] | undefined;
  record_kind: MtaObservationKind;
  source_id: string;
  source_ids?: string[] | undefined;
  local_observation_id: string;
  local_observation_ids?: string[] | undefined;
  display_name: string;
  raw_text?: string | undefined;
  payload: JsonObject;
  evidence_refs: MtaEvidenceRef[];
  submission_ids: string[];
  truth_status: string;
  review_state: string;
  generated_at: string;
};

export type StagedSourceMetadata = {
  sourceId: string;
  upstreamSourceId?: string | undefined;
  title?: string | undefined;
  publisher?: string | undefined;
  sourceGroup?: string | undefined;
  sourceUrl?: string | undefined;
  documentDate?: string | null | undefined;
  retrievedAt?: string | undefined;
  contentType?: string | undefined;
  detectedContentType?: string | undefined;
  sha256?: string | undefined;
  [key: string]: JsonValue | undefined;
};

export type StagedSourceBlock = {
  source_id: string;
  block_id: string;
  page_number: number;
  reading_order: number;
  source_surface: "chandra_ocr" | "pdf_text" | "ocr_text";
  block_kind?:
    | "text"
    | "heading"
    | "list_item"
    | "caption"
    | "figure"
    | "footnote"
    | "table_row"
    | "section"
    | "list"
    | "table"
    | "table_candidate"
    | "range"
    | "discard"
    | undefined;
  child_block_ids?: string[] | undefined;
  source_line_ids?: string[] | undefined;
  x_min?: number | undefined;
  y_min?: number | undefined;
  x_max?: number | undefined;
  y_max?: number | undefined;
  font_id?: string | undefined;
  font_size?: number | undefined;
  image_width?: number | undefined;
  image_height?: number | undefined;
  image_dpi?: number | undefined;
  ocr_engine?: string | undefined;
  ocr_model?: string | undefined;
  raw_source_path: string;
  raw_start_char: number;
  raw_end_char: number;
  raw_text: string;
  normalized_text: string;
  raw_text_sha256: string;
  normalized_text_sha256: string;
};

export type PreparedSourceResult = {
  sourceId: string;
  upstreamSourceId?: string | undefined;
  sourceDir: string;
  copiedFiles: string[];
  textPath?: string | undefined;
  textBytes?: number | undefined;
  blocksPath: string;
  blockCount: number;
};

export type MaterializeResult = {
  submissionsRead: number;
  acceptedSubmissions: number;
  retiredSubmissions: number;
  semanticCorrections?: {
    total: number;
    applied: number;
    skipped: number;
    appliedByOp: Record<string, number>;
    skippedByOp: Record<string, number>;
    appliedBySourceDecision: Record<string, number>;
  } | undefined;
  recordCounts: Record<string, number>;
  pageCount: number;
  canonicalDir: string;
  wikiDir: string;
};

export type MtaValidationIssue = {
  code: string;
  message: string;
  path?: string | undefined;
  recordId?: string | undefined;
};

export type MtaValidationReport = {
  requiredPathCount: number;
  submissionCount: number;
  canonicalRecordCount: number;
  wikiPageCount: number;
  issues: MtaValidationIssue[];
  warnings: MtaValidationIssue[];
};

export type MtaReviewNote = {
  note_id: string;
  run_id: string;
  submitted_at: string;
  record_id: string;
  issue_kind: string;
  severity: "info" | "warning" | "error";
  summary: string;
  details?: string | undefined;
  suggested_action?: string | undefined;
  evidence_refs?: MtaEvidenceRef[] | undefined;
};
