export { repoRoot } from "@mta-wiki/core/paths";
export { readConfig } from "@mta-wiki/core/config";
export { listModels, listProfiles, listProviders } from "@mta-wiki/core/models";
export { listTranscripts, renderTranscript, summarizeTranscriptUsage, writeTranscriptUsageArtifacts } from "@mta-wiki/core/transcript";
export { resumeHarnessRun, runHarnessCommand } from "@mta-wiki/agents/run";
export { runWritePacket, writerPacketPrompt } from "@mta-wiki/agents/write";
export { validateRepo } from "@mta-wiki/pipeline/validate";

export { exportCanonicalJsonl, verifyCanonicalJsonlParity } from "@mta-wiki/pipeline/materialize/export-jsonl";
export { exportRelease } from "@mta-wiki/pipeline/materialize/export-release";
export {
  THRESHOLDS,
  correctionsLedgerStats,
  deterministicQualityReport,
  latestReleaseId,
  qualityDir,
  readReleaseRecords,
  sameSourceDuplication,
  semanticInvariantCounts,
  stratifiedSampleRows,
  writeDeterministicQualityReport,
} from "@mta-wiki/pipeline/quality/release-quality";
export { exportSite, siteOutDir, type SiteExportResult } from "@mta-wiki/pipeline/site/export-site";
export { importGtfs, readGtfsManifest, type GtfsManifest } from "@mta-wiki/db/import-gtfs";
export { buildDossier, dossierMarkdown, writeDossier, type Dossier } from "@mta-wiki/pipeline/identity/dossier";
export { generateGapReport, collectGaps, gapCountsByClass, type GapRow } from "@mta-wiki/pipeline/materialize/gap-report";
export type { JsonlExportResult, JsonlParityResult } from "@mta-wiki/pipeline/materialize/export-jsonl";
export type { ReleaseExportOptions, ReleaseExportResult, ReleaseManifest } from "@mta-wiki/pipeline/materialize/export-release";
export type {
  CrossFieldSanitySummary,
  DeterministicQualityReport,
  EvidenceResolutionSummary,
  QualityReportWriteResult,
  QuoteContainsValueSummary,
  SampleAuditSeedRow,
  SameSourceDuplicationSummary,
  SemanticInvariantCounts,
  CorrectionsLedgerStats,
} from "@mta-wiki/pipeline/quality/release-quality";

export {
  materializeWiki,
  readCanonicalRecordById,
  readCanonicalRecords,
  readCanonicalRecordsByKind,
  readCanonicalRecordsFromDbFile,
  readCanonicalRecordsFromJsonl,
} from "@mta-wiki/pipeline/materialize/materialize";
export {
  CANONICAL_DB_VERSION,
  canonicalDbDump,
  canonicalDbPath,
  duplicateRelations,
  openCanonicalDb,
  orphanRecords,
  readCanonicalRecordsFromDb,
  readCanonicalRecordsOfKindFromDb,
  rebuildCanonicalDb,
  rowToRecord,
} from "@mta-wiki/db/canonical-db";
export type { DuplicateRelationRow, OrphanRecordRow, RebuildCanonicalDbResult } from "@mta-wiki/db/canonical-db";
export { buildSemanticIndex, searchSemanticIndex, recordCard, semanticIndexExists } from "@mta-wiki/pipeline/materialize/semantic-index";
export type { BuildSemanticIndexOptions, BuildSemanticIndexResult, SemanticIndexManifest, SemanticSearchHit } from "@mta-wiki/pipeline/materialize/semantic-index";
export { embedTexts, embedQuery, embeddingsEndpoint } from "@mta-wiki/pipeline/sources/embeddings";
export type { Embedder } from "@mta-wiki/pipeline/sources/embeddings";
export { createMtaQueryTools } from "@mta-wiki/agents/tools/query-tools";
export { seedPilotSubmissions, PILOT_RUN_ID, PILOT_SOURCE_ID } from "@mta-wiki/pipeline/campaign/pilot";
export { compactSourceId, importSources } from "@mta-wiki/pipeline/sources/source-intake";
export {
  buildEvidenceBlockIndexEntries,
  evidenceBlockIndexEntry,
  evidenceBlockIndexPath,
  readEvidenceBlockIndex,
  writeEvidenceBlockIndex,
  type EvidenceBlockIndex,
  type EvidenceBlockIndexEntry,
  type EvidenceBlockIndexWriteResult,
} from "@mta-wiki/pipeline/sources/evidence-block-index";
export { queueChandraOcr, runChandraOcr, chandraOcrCacheStats } from "@mta-wiki/pipeline/sources/chandra";
export { auditIngestRun, writeIngestAuditReport } from "@mta-wiki/pipeline/campaign/ingest-audit";
export { generatePipelineReport, writePipelineReport } from "@mta-wiki/pipeline/campaign/pipeline-metrics";
export type { PipelineReport, PipelineRunMetrics, PipelineKindMetrics, PipelineDuplicateCandidatePair } from "@mta-wiki/pipeline/campaign/pipeline-metrics";
export {
  auditPostIngestCoverage,
  auditPostIngestCoverageRows,
  auditSubmissionSourceIdDrift,
  auditSubmissionSourceIdDriftRows,
  claimWriterBacklogDispatchShards,
  collectWriterBacklogItems,
  generatePostIngestPlan,
  generateWriterBacklogDispatchPlan,
  generateWriterBacklogPacketSetManifest,
  generateWriterBacklogPackets,
  generateWriterBacklogQueue,
  verifyWriterBacklogPacketEdits,
  verifyWriterBacklogDispatchClaim,
  verifyWriterBacklogDispatchClaims,
  verifyWriterBacklogDispatchHandoffBatch,
  verifyWriterBacklogDispatchHandoffPromptCoverage,
  verifyWriterBacklogDispatchHandoffPrompts,
  verifyWriterBacklogDispatchPlan,
  verifyWriterBacklogPackets,
  verifyWriterBacklogPacketSetManifest,
  verifyWriterBacklogPacketSet,
  writeCodexPostIngestGoalAudit,
  writeWriterBacklogDispatchHandoffBatch,
  writeWriterBacklogDispatchHandoffPromptCoverageReport,
  writeWriterBacklogDispatchHandoffPrompts,
  writeWriterBacklogDispatchNextShard,
  writeWriterBacklogDispatchPlanStatus,
  writeWriterBacklogDispatchReadinessReport,
  writerBacklogDispatchPlanStatus,
} from "@mta-wiki/pipeline/campaign/post-ingest";
export type {
  PostIngestCoverageAudit,
  PostIngestPlan,
  PostIngestPlanOptions,
  PostIngestPlanRecordCard,
  PostIngestScopePlan,
  PostIngestWriterBatch,
  CodexPostIngestGoalAudit,
  CodexPostIngestGoalAuditRequirement,
  SubmissionSourceIdDriftAudit,
  SubmissionSourceIdDriftCandidate,
  WriterBacklogPacket,
  WriterBacklogPacketSetManifest,
  WriterBacklogPacketSetManifestEntry,
  WriterBacklogPacketSetManifestOptions,
  WriterBacklogPacketSetManifestVerification,
  WriterBacklogPacketSetManifestVerificationIssue,
  WriterBacklogDispatchPlan,
  WriterBacklogDispatchClaim,
  WriterBacklogDispatchClaimOptions,
  WriterBacklogDispatchClaimShard,
  WriterBacklogDispatchHandoffBatchOptions,
  WriterBacklogDispatchHandoffBatchReport,
  WriterBacklogDispatchHandoffBatchVerification,
  WriterBacklogDispatchHandoffBatchVerificationIssue,
  WriterBacklogDispatchHandoffPromptFile,
  WriterBacklogDispatchHandoffPromptCoverageIssue,
  WriterBacklogDispatchHandoffPromptCoverageReport,
  WriterBacklogDispatchHandoffPromptCoverageRun,
  WriterBacklogDispatchHandoffPromptCoverageVerification,
  WriterBacklogDispatchHandoffPromptsReport,
  WriterBacklogDispatchHandoffPromptsVerification,
  WriterBacklogDispatchHandoffPromptsVerificationIssue,
  WriterBacklogDispatchNextShardOptions,
  WriterBacklogDispatchNextShardReport,
  WriterBacklogDispatchClaimVerification,
  WriterBacklogDispatchClaimVerificationIssue,
  WriterBacklogDispatchClaimsVerification,
  WriterBacklogDispatchClaimsVerificationIssue,
  WriterBacklogDispatchPlanOptions,
  WriterBacklogDispatchPlanStatusReport,
  WriterBacklogDispatchReadinessReport,
  WriterBacklogDispatchPlanVerification,
  WriterBacklogDispatchPlanVerificationIssue,
  WriterBacklogDispatchPlanStatus,
  WriterBacklogDispatchShardStatus,
  WriterBacklogDispatchShard,
  WriterBacklogPacketEditVerification,
  WriterBacklogPacketOptions,
  WriterBacklogPacketRecord,
  WriterBacklogPacketRun,
  WriterBacklogPacketSetVerification,
  WriterBacklogPacketSetVerificationIssue,
  WriterBacklogPacketVerification,
  WriterBacklogPacketVerificationOptions,
  WriterBacklogPacketVerificationIssue,
  WriterBacklogQueue,
  WriterBacklogQueueItem,
  WriterBacklogQueueOptions,
} from "@mta-wiki/pipeline/campaign/post-ingest";
export { extractWriterCitations, verifyWriterCitations, verifyWriterEdits, writerRegionOnlyChanged, writerRegionPresent } from "@mta-wiki/pipeline/materialize/writer-change-gate";
export type { WriterCitationRef, WriterCitationVerification, WriterEditIssue, WriterEditVerification } from "@mta-wiki/pipeline/materialize/writer-change-gate";
export { applyIdentityReviewDecisions, validateIdentityReviewAcceptedArtifacts, validateIdentityOverrideArtifacts } from "@mta-wiki/pipeline/identity/identity-review-apply";
export { generateIdentityReview, runIdentityReviewPackets } from "@mta-wiki/agents/identity-review";
export { autoAcceptIdentityReview, evaluateSuggestionForAutoAccept } from "@mta-wiki/pipeline/identity/identity-review-autoaccept";
export type { AutoAcceptReport, AutoAcceptClusterResult, AutoAcceptOptions } from "@mta-wiki/pipeline/identity/identity-review-autoaccept";
export { generateSchemaAudit } from "@mta-wiki/pipeline/ontology/schema-audit";
export { allKindSpecs, kindSpec, submitToolKinds, requiredPayloadAnchors, RUNNER_OWNED_FIELDS } from "@mta-wiki/db/kind-registry";
export type { KindSpec, KindFieldSpec, KindFieldType } from "@mta-wiki/db/kind-registry";
export { payloadSchemaForKind, validatePayloadSchema } from "@mta-wiki/db/payload-schemas";
export type { PayloadSchemaResult } from "@mta-wiki/db/payload-schemas";
export { applyFirstMigrationBatch, applyRemainingMigrationBatch } from "@mta-wiki/pipeline/records/migration";
export type { SchemaAuditManifest, SchemaAuditOptions } from "@mta-wiki/pipeline/ontology/schema-audit";
export type {
  FirstMigrationBatchOptions,
  FirstMigrationBatchReport,
  MigrationAliasPlan,
  MigrationAliasRemovalPlan,
  MigrationBatchReport,
  MigrationConflict,
  MigrationDoNotMergePlan,
  MigrationDoNotMergeRemovalPlan,
  RemainingMigrationBatchOptions,
  RemainingMigrationBatchReport,
} from "@mta-wiki/pipeline/records/migration";
export { runSchemaEnumProposals } from "@mta-wiki/agents/schema-proposal";
export type { SchemaProposalOptions, SchemaProposalRunManifest } from "@mta-wiki/agents/schema-proposal";
export { generateOntologyReview, ontologyAgentDefinitions } from "@mta-wiki/agents/ontology-review";
export type { OntologyAgentDefinition, OntologyAgentId, OntologyReviewCandidate, OntologyReviewManifest, OntologyReviewOptions } from "@mta-wiki/agents/ontology-review";
export { runCanonicalize, canonicalizeDir } from "@mta-wiki/agents/canonicalize";
export type { CanonicalizeRunManifest, CanonicalizeRunOptions } from "@mta-wiki/agents/canonicalize";
export { canonicalizeWave } from "@mta-wiki/pipeline/records/canonicalize-wave";
export type { CanonicalizeWaveOptions, CanonicalizeWaveResult, CanonicalizeWaveRunStatus } from "@mta-wiki/pipeline/records/canonicalize-wave";
export { runCanonicalizeReview } from "@mta-wiki/agents/canonicalize-review";
export type { CanonicalizeReviewManifest, CanonicalizeReviewOptions, CanonicalizeVerdict } from "@mta-wiki/agents/canonicalize-review";
export { applyCanonicalizeDecisions } from "@mta-wiki/pipeline/records/canonicalize-apply";
export type { CanonicalizeApplyOptions, CanonicalizeApplyReport } from "@mta-wiki/pipeline/records/canonicalize-apply";
export {
  buildExtractContract,
  DEFAULT_EXTRACT_RELEASE_ID,
  DEFAULT_EXTRACT_RUN_ID,
  extractEnumVocabulary,
  extractPrompt,
  extractRunActualDir,
  extractSystemPrompt,
  runExtractSource,
} from "@mta-wiki/agents/extract";
export type { ExtractRunOptions, ExtractRunResult } from "@mta-wiki/agents/extract";
export { buildCanonicalizePackets } from "@mta-wiki/pipeline/records/canonicalize-packets";
export type { CanonicalizeDecision, CanonicalizePacket } from "@mta-wiki/pipeline/records/canonicalize-packets";
export { generateCrossSourceRelationCandidates, writeCrossSourceRelationCandidates } from "@mta-wiki/pipeline/identity/cross-source-candidates";
export type { CrossSourceRelationCandidate } from "@mta-wiki/pipeline/identity/cross-source-candidates";
export { runOntologyNormalizePackets } from "@mta-wiki/agents/ontology-normalize";
export type { OntologyNormalizeOptions, OntologyNormalizeProgressEvent, OntologyNormalizeResult, OntologyNormalizeRunManifest } from "@mta-wiki/agents/ontology-normalize";
export {
  assertChandraOcrReadyForIngest,
  chandraOcrReadiness,
  pdfSourceEvidenceReadiness,
  prepareSource,
  readStagedSourceBlocks,
  readStagedSourceMetadata,
  rebuildSourceBlocks,
} from "@mta-wiki/pipeline/sources/source-prep";
export { applySpreadsheetPreview, buildSpreadsheetPreview, spreadsheetPreviewMarkdown, spreadsheetPreviewTextSurface, writeSpreadsheetPreview } from "@mta-wiki/pipeline/sources/source-prep-preview";
export type {
  ApplySpreadsheetPreviewOptions,
  SpreadsheetCellPreview,
  SpreadsheetPreviewManifest,
  SpreadsheetRowPreview,
  SpreadsheetSheetPreview,
  WriteSpreadsheetPreviewOptions,
} from "@mta-wiki/pipeline/sources/source-prep-preview";
export { appendSubmission, createSubmissionEntry, readSubmissionEntries } from "@mta-wiki/pipeline/records/submissions";
export { createMtaTools } from "@mta-wiki/agents/tools/ingest-tools";
export { createMtaWriterTools } from "@mta-wiki/agents/tools/writer-tools";

export type {
  HarnessConfig,
  IdentityReviewPacketRunResult,
  IdentityReviewRunManifest,
  IdentityReviewRunOptions,
  HarnessResumeOptions,
  HarnessResumeResult,
  HarnessRunCommand,
  HarnessRunOptions,
  HarnessRunResult,
  HarnessTranscriptCommand,
  ModelInfo,
  ProfileInfo,
  ProviderInfo,
  ProviderProfile,
  TranscriptInfo,
  TranscriptUsageSummary,
  UsageRecord,
} from "@mta-wiki/core/types";

export type {
  JsonObject,
  JsonValue,
  MaterializeResult,
  MtaCanonicalRecord,
  MtaEvidenceRef,
  MtaObservationKind,
  MtaSubmitObservationInput,
  MtaSubmissionEntry,
  MtaValidationReport,
  PreparedSourceResult,
  StagedSourceBlock,
  StagedSourceMetadata,
} from "@mta-wiki/db/types";

export type { SourceImportEntry, SourceImportManifest, SourceImportOptions } from "@mta-wiki/pipeline/sources/source-intake";
export type { ChandraQueueEntry, ChandraQueueManifest, ChandraQueueOptions, ChandraRunResult } from "@mta-wiki/pipeline/sources/chandra";
export type { MtaIngestAuditReport, MtaIngestAuditWarning } from "@mta-wiki/pipeline/campaign/ingest-audit";
export type {
  IdentityReviewAcceptedArtifactsReport,
  IdentityReviewAliasPlan,
  IdentityReviewApplyConflict,
  IdentityReviewApplyOptions,
  IdentityReviewApplyReport,
  IdentityReviewDoNotMergePlan,
} from "@mta-wiki/pipeline/identity/identity-review-apply";
export type { IdentityReviewManifest, IdentityReviewOptions } from "@mta-wiki/agents/identity-review";

export {
  runReadinessSweep,
  checkSourceReadiness,
  listStagedSourceIds,
  ingestedSourceIds,
  waveSourceList,
  readReadinessRows,
  campaignDir,
} from "@mta-wiki/pipeline/campaign/campaign-readiness";
export type { ReadinessRow, ReadinessSummary } from "@mta-wiki/pipeline/campaign/campaign-readiness";
export {
  selectWaveSources,
  ingestWave,
  writeWaveReport,
  makeAcceptedIsDone,
} from "@mta-wiki/pipeline/campaign/campaign";
export type { WaveReport, WaveTelemetry, WaveIngestResult, IngestWaveOptions } from "@mta-wiki/pipeline/campaign/campaign";
export { campaignMaterializeQueue, resetCampaignMaterializeQueue, MaterializeQueue, DEFAULT_MATERIALIZE_EVERY } from "@mta-wiki/pipeline/materialize/materialize-queue";
export type { CadenceOutcome } from "@mta-wiki/pipeline/materialize/materialize-queue";
export { bucket, allBucketStats, resetBuckets, providerRatePerMinute, TokenBucket, DEFAULT_PIONEER_RPM } from "@mta-wiki/core/rate-limit";
export type { RateLimitStats, TokenBucketOptions, LimiterClock } from "@mta-wiki/core/rate-limit";
