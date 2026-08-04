import type {
  AiAgentCheckResult,
  AiAgentProfile,
  AiInvocationSession,
  AiStageDefinition,
  BackgroundJob,
  BackgroundJobType,
  PlatformAiConfig,
  ChapterDashboard,
  ChapterQualityReport,
  ChapterSummary,
  CodexTaskType,
  CreationRuntimeSnapshot,
  CreativeSession,
  CreativeJourneyProjection,
  UnderstandingPreview,
  DialogueQuestion,
  StoryContractCandidate,
  WorldRuleContract,
  OutlineCandidate,
  OutlineValidationReport,
  OutlineAdoptionProposal,
  OutlineVersion,
  ExecutionReadyProof,
  ExecutionReadinessDecision,
  ExecutionWorkItem,
  ProseCandidate,
  ProseCandidateValidation,
  ProseValidationBundle,
  RedBlueReview,
  AuthorFeedbackEvent,
  FeedbackAttribution,
  FeedbackCategory,
  PreferenceHypothesis,
  LearningPolicy,
  ExplorationBudget,
  SourceMaterialRecord,
  RightsEnvelope,
  CraftPattern,
  CharacterDramaticContract,
  CharacterStateSnapshot,
  CharacterChoiceEvidence,
  RelationshipEvent,
  CharacterArcContract,
  WorldStateSnapshot,
  CapabilityContract,
  ProgressionEvent,
  WorldLocation,
  StoryTimeEvent,
  CausalityEdge,
  CausalityGraphReport,
  VolumeContract,
  ChapterFunctionContract,
  SceneCardContract,
  NarrativeTraceLink,
  NarrativeTraceReport,
  ObligationLoadReport,
  NarrativeCurvePoint,
  PlanningNode,
  StructureAlternativeSet,
  SimilarityGuardResult,
  PatternTransferPlan,
  CraftExperiment,
  DerivedPublicationTransaction,
  ProseAdoptionTransaction,
  ProseAdoptionReadiness,
  ProseRepairPlan,
  ProseRepairCandidate,
  ProseRepairRegression,
  ChapterSettlement,
  BookWorkGraph,
  BookRun,
  CompletionAudit,
  ReleaseActivation,
  LengthContract,
  LengthForecast,
  LengthVarianceDecision,
  UnderstandingReview,
  ContractAdoptionProposal,
  ContractMutationPlan,
  ProjectionRebuildReceipt,
  ProjectionFreshness,
  QualityCalibrationEvidence,
  ReleaseAcceptanceDecision,
  StoryContractReadinessProof,
  ContextManifest,
  EditorSuggestion,
  EditorSuggestionRequest,
  EditorSelection,
  FileDiffResult,
  FileVersionSnapshot,
  KnowledgeIndexProjection,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
  MemoryRetrievalPreview,
  MemoryHealthReport,
  MemoryReadyProof,
  LongContinuityAudit,
  LedgerEntry,
  NovelFilePatch,
  NovelProject,
  NovelTask,
  PlatformAsset,
  PlatformAssetType,
  PlatformLibrary,
  ProjectAuditReport,
  RuntimeCheckpoint,
  RuntimeCommand,
  RuntimeDerivativeBranch,
  RuntimeRun,
  RuntimeStatusSnapshot,
  SceneCard,
  SeriesQualityMetrics,
  StoryControl,
  StoryGraphProjection,
  WritingRecapCandidate,
  MigrationPreview,
  MigrationCutoverReport,
  MigrationValidation,
  MigrationResolution,
  MigrationActivation,
  MigrationRollback,
  BackupCatalogEntry,
  MigrationBatchValidationReport,
  NarrativeObligation,
  ObligationEvent,
  ObligationType,
  ObligationStatus,
  NarrativeObligationCoverageReport,
  NarrativeObligationCandidate,
  ObligationCoverageCertificate,
  ObligationCoverageInvalidation,
  RevisionIntent,
  RevisionIntentType,
  RevisionMaturity,
  RevisionIntentMode,
  RevisionImpactReport,
  RevisionChangeSet,
  RevisionChangeOperation,
  RevisionReview,
  RevisionAdoptionProposal,
  RevisionAdoptionReceipt,
  RevisionSettlement,
  EditionManifest,
  PublicationTree,
  PublicationArtifactSet,
  DeliveryProof,
  DeliveryProofVerification,
  DeliveryProofEvent,
  DeliveryAccessGrant,
  DeliveryAccessGrantVerification,
  DeliveryAccessGrantEvent,
  ReleasePreflightReport
} from "@/types/novel";

const jsonHeaders = { "Content-Type": "application/json" };

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; code?: unknown };
    if (typeof value.message === "string" && value.message.trim()) return value.message;
    if (typeof value.code === "string" && value.code.trim()) return value.code;
  }
  return fallback;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorMessage(data.error, `Request failed: ${response.status}`));
  }
  return data as T;
}

export const novelApi = {
  async listProjects(): Promise<NovelProject[]> {
    const data = await request<{ projects: NovelProject[] }>("/api/novel/projects");
    return data.projects;
  },

  async createProject(input: { title?: string; genre?: string; roughIdea: string }): Promise<NovelProject> {
    const data = await request<{ project: NovelProject }>("/api/novel/projects", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ ...input, idempotencyKey: `project-create-${Date.now()}-${Math.random().toString(36).slice(2)}` })
    });
    return data.project;
  },

  async previewProjectMigration(projectId: string): Promise<MigrationPreview> {
    const data = await request<{ preview: MigrationPreview }>(`/api/novel/projects/${encodeURIComponent(projectId)}/migrations`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ previewOnly: true })
    });
    return data.preview;
  },

  async validateProjectMigration(projectId: string, migrationId: string): Promise<MigrationValidation> {
    const data = await request<{ validation: MigrationValidation }>(`/api/novel/projects/${encodeURIComponent(projectId)}/migrations/${encodeURIComponent(migrationId)}/validate`, {
      method: "POST",
      headers: jsonHeaders,
      body: "{}"
    });
    return data.validation;
  },

  async resolveProjectMigrationConflicts(projectId: string, migrationId: string, selectedOutlineAuthority: "active" | "archived"): Promise<MigrationResolution> {
    const data = await request<{ resolution: MigrationResolution }>(`/api/novel/projects/${encodeURIComponent(projectId)}/migrations/${encodeURIComponent(migrationId)}/resolve-conflicts`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ selectedOutlineAuthority })
    });
    return data.resolution;
  },

  async activateProjectMigration(projectId: string, migrationId: string, input: { idempotencyKey: string; expectedValidationFingerprint: string }): Promise<MigrationActivation> {
    const data = await request<{ activation: MigrationActivation }>(`/api/novel/projects/${encodeURIComponent(projectId)}/migrations/${encodeURIComponent(migrationId)}/activate`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.activation;
  },

  async rollbackProjectMigration(projectId: string, migrationId: string): Promise<MigrationRollback> {
    const data = await request<{ rollback: MigrationRollback }>(`/api/novel/projects/${encodeURIComponent(projectId)}/migrations/${encodeURIComponent(migrationId)}/rollback`, {
      method: "POST",
      headers: jsonHeaders,
      body: "{}"
    });
    return data.rollback;
  },

  async listProjectBackups(projectId: string): Promise<BackupCatalogEntry[]> {
    const data = await request<{ backups: BackupCatalogEntry[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/backups`);
    return data.backups;
  },

  async listNarrativeObligations(projectId: string): Promise<NarrativeObligation[]> {
    const data = await request<{ obligations: NarrativeObligation[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/obligations`);
    return data.obligations;
  },

  async readNarrativeObligationCoverage(projectId: string): Promise<NarrativeObligationCoverageReport> {
    const data = await request<{ report: NarrativeObligationCoverageReport }>(`/api/novel/projects/${encodeURIComponent(projectId)}/obligation-coverage`);
    return data.report;
  },

  async previewNarrativeObligationCandidates(projectId: string): Promise<NarrativeObligationCandidate[]> {
    const data = await request<{ candidates: NarrativeObligationCandidate[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/obligation-candidates/preview`);
    return data.candidates;
  },

  async issueObligationCoverageCertificate(projectId: string, sourceFingerprint: string): Promise<ObligationCoverageCertificate> {
    const data = await request<{ certificate: ObligationCoverageCertificate }>(`/api/novel/projects/${encodeURIComponent(projectId)}/obligation-coverage/certificate`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ sourceFingerprint })
    });
    return data.certificate;
  },

  async validateObligationCoverageCertificate(projectId: string, sourceFingerprint: string): Promise<{ valid: true; certificate: ObligationCoverageCertificate }> {
    return request<{ valid: true; certificate: ObligationCoverageCertificate }>(`/api/novel/projects/${encodeURIComponent(projectId)}/obligation-coverage/certificate/validate`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ sourceFingerprint })
    });
  },

  async invalidateObligationCoverageCertificate(projectId: string, sourceFingerprint: string): Promise<ObligationCoverageInvalidation | null> {
    const data = await request<{ invalidation: ObligationCoverageInvalidation | null }>(`/api/novel/projects/${encodeURIComponent(projectId)}/obligation-coverage/certificate/invalidate`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ sourceFingerprint })
    });
    return data.invalidation;
  },

  async listRevisionIntents(projectId: string): Promise<RevisionIntent[]> {
    const data = await request<{ intents: RevisionIntent[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/revision-intents`);
    return data.intents;
  },

  async createRevisionIntent(projectId: string, input: { authorText: string; type: RevisionIntentType; maturity: RevisionMaturity; scope: { chapterIds: string[]; sceneIds?: string[] }; requestedChanges: string[]; protectedItems: string[]; mode: RevisionIntentMode; actor: "author" | "system" }): Promise<RevisionIntent> {
    const data = await request<{ intent: RevisionIntent }>(`/api/novel/projects/${encodeURIComponent(projectId)}/revision-intents`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.intent;
  },

  async readRevisionImpactReport(projectId: string, intentId: string): Promise<RevisionImpactReport> {
    const data = await request<{ report: RevisionImpactReport }>(`/api/novel/projects/${encodeURIComponent(projectId)}/revision-intents/${encodeURIComponent(intentId)}/impact`);
    return data.report;
  },

  async createRevisionChangeSet(projectId: string, intentId: string, expectedIntentFingerprint: string, operations: RevisionChangeOperation[]): Promise<RevisionChangeSet> {
    const data = await request<{ changeSet: RevisionChangeSet }>(`/api/novel/projects/${encodeURIComponent(projectId)}/revision-intents/${encodeURIComponent(intentId)}/change-sets`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ expectedIntentFingerprint, operations })
    });
    return data.changeSet;
  },

  async reviewRevisionChangeSet(projectId: string, changeSetId: string, expectedChangeSetFingerprint: string, input: { decision: "accepted" | "needs_revision" | "rejected"; note: string; actor: "author" | "system" }): Promise<RevisionReview> {
    const data = await request<{ review: RevisionReview }>(`/api/novel/projects/${encodeURIComponent(projectId)}/revision-change-sets/${encodeURIComponent(changeSetId)}/reviews`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ expectedChangeSetFingerprint, ...input })
    });
    return data.review;
  },

  async createRevisionAdoptionProposal(projectId: string, changeSetId: string, expectedChangeSetFingerprint: string, reviewId: string, baseCanonFingerprint: string): Promise<RevisionAdoptionProposal> {
    const data = await request<{ proposal: RevisionAdoptionProposal }>(`/api/novel/projects/${encodeURIComponent(projectId)}/revision-change-sets/${encodeURIComponent(changeSetId)}/adoption-proposals`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ expectedChangeSetFingerprint, reviewId, baseCanonFingerprint })
    });
    return data.proposal;
  },

  async recordRevisionAdoptionReceipt(projectId: string, proposalId: string, expectedProposalFingerprint: string, proseAdoptionTransactionId: string): Promise<RevisionAdoptionReceipt> {
    const data = await request<{ receipt: RevisionAdoptionReceipt }>(`/api/novel/projects/${encodeURIComponent(projectId)}/revision-adoption-proposals/${encodeURIComponent(proposalId)}/receipts`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ expectedProposalFingerprint, proseAdoptionTransactionId })
    });
    return data.receipt;
  },

  async settleRevision(projectId: string, receiptId: string, expectedReceiptFingerprint: string, chapterSettlementIds: string[]): Promise<RevisionSettlement> {
    const data = await request<{ settlement: RevisionSettlement }>(`/api/novel/projects/${encodeURIComponent(projectId)}/revision-adoption-receipts/${encodeURIComponent(receiptId)}/settlements`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ expectedReceiptFingerprint, chapterSettlementIds })
    });
    return data.settlement;
  },

  async createEditionManifest(projectId: string, input: { canonCommitFingerprint: string; title: string; author: string; language: string; chapters: Array<{ chapterId: string; title: string; order: number; contentPath: string; settlementId: string }> }): Promise<EditionManifest> {
    const data = await request<{ manifest: EditionManifest }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.manifest;
  },

  async readEditionManifest(projectId: string, editionId: string): Promise<EditionManifest> {
    const data = await request<{ manifest: EditionManifest }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}`);
    return data.manifest;
  },

  async compilePublicationTree(projectId: string, editionId: string): Promise<PublicationTree> {
    const data = await request<{ tree: PublicationTree }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/tree`, {
      method: "POST",
      headers: jsonHeaders,
      body: "{}"
    });
    return data.tree;
  },

  async readPublicationTree(projectId: string, editionId: string): Promise<PublicationTree> {
    const data = await request<{ tree: PublicationTree }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/tree`);
    return data.tree;
  },

  async renderPublicationArtifacts(projectId: string, editionId: string, formats: Array<"markdown" | "txt">): Promise<PublicationArtifactSet> {
    const data = await request<{ artifacts: PublicationArtifactSet }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/artifacts`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ formats })
    });
    return data.artifacts;
  },

  async readPublicationArtifacts(projectId: string, editionId: string): Promise<PublicationArtifactSet> {
    const data = await request<{ artifacts: PublicationArtifactSet }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/artifacts`);
    return data.artifacts;
  },

  async issueDeliveryProof(projectId: string, editionId: string, approvalId: string, expectedArtifactSetFingerprint: string): Promise<DeliveryProof> {
    const data = await request<{ proof: DeliveryProof }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/delivery-proof`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ approvalId, approverKind: "author", expectedArtifactSetFingerprint })
    });
    return data.proof;
  },

  async verifyDeliveryProof(projectId: string, editionId: string): Promise<DeliveryProofVerification> {
    const data = await request<{ verification: DeliveryProofVerification }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/delivery-proof`);
    return data.verification;
  },

  async revokeDeliveryProof(projectId: string, editionId: string, reason: string): Promise<DeliveryProofEvent> {
    const data = await request<{ event: DeliveryProofEvent }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/delivery-proof/revoke`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ reason })
    });
    return data.event;
  },

  async supersedeDeliveryProof(projectId: string, editionId: string, reason: string, replacementEditionId: string): Promise<DeliveryProofEvent> {
    const data = await request<{ event: DeliveryProofEvent }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/delivery-proof/supersede`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ reason, replacementEditionId })
    });
    return data.event;
  },

  async issueDeliveryAccessGrant(projectId: string, editionId: string, recipientId: string, scope: "reader" | "archive", expiresAt: string): Promise<DeliveryAccessGrant> {
    const data = await request<{ grant: DeliveryAccessGrant }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/access-grants`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ recipientId, scope, expiresAt })
    });
    return data.grant;
  },

  async verifyDeliveryAccessGrant(projectId: string, editionId: string, grantId: string): Promise<DeliveryAccessGrantVerification> {
    const data = await request<{ verification: DeliveryAccessGrantVerification }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/access-grants/${encodeURIComponent(grantId)}/verify`);
    return data.verification;
  },

  async revokeDeliveryAccessGrant(projectId: string, editionId: string, grantId: string, reason: string): Promise<DeliveryAccessGrantEvent> {
    const data = await request<{ event: DeliveryAccessGrantEvent }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/access-grants/${encodeURIComponent(grantId)}/revoke`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ reason })
    });
    return data.event;
  },

  async preflightPublicationEdition(projectId: string, editionId: string): Promise<ReleasePreflightReport> {
    const data = await request<{ report: ReleasePreflightReport }>(`/api/novel/projects/${encodeURIComponent(projectId)}/publication-editions/${encodeURIComponent(editionId)}/preflight`, {
      method: "POST",
      headers: jsonHeaders,
      body: "{}"
    });
    return data.report;
  },

  async createNarrativeObligation(projectId: string, input: { type: ObligationType; title: string; questionOrPromise: string; importance?: "low" | "medium" | "high"; sourceRefs?: string[]; entityRefs?: string[] }): Promise<NarrativeObligation> {
    const data = await request<{ obligation: NarrativeObligation }>(`/api/novel/projects/${encodeURIComponent(projectId)}/obligations`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.obligation;
  },

  async appendNarrativeObligationEvent(projectId: string, obligationId: string, input: { toStatus: ObligationStatus; reason: string; actor: ObligationEvent["actor"]; expectedVersion: number; evidenceRefs?: string[] }): Promise<{ obligation: NarrativeObligation; event: ObligationEvent }> {
    return request<{ obligation: NarrativeObligation; event: ObligationEvent }>(`/api/novel/projects/${encodeURIComponent(projectId)}/obligations/${encodeURIComponent(obligationId)}/events`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
  },

  async readMigrationCutoverReadiness(): Promise<MigrationCutoverReport> {
    const data = await request<{ report: MigrationCutoverReport }>("/api/novel/migrations/cutover-readiness");
    return data.report;
  },

  async validateAllProjectMigrations(): Promise<MigrationBatchValidationReport> {
    const data = await request<{ report: MigrationBatchValidationReport }>("/api/novel/migrations/validate-all", {
      method: "POST",
      headers: jsonHeaders,
      body: "{}"
    });
    return data.report;
  },

  async readCreativeSession(projectId: string): Promise<CreativeSession> {
    const data = await request<{ session: CreativeSession }>(`/api/novel/projects/${encodeURIComponent(projectId)}/session`);
    return data.session;
  },

  async readCreativeJourney(projectId: string): Promise<CreativeJourneyProjection> {
    const data = await request<{ journey: CreativeJourneyProjection }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/journey`
    );
    return data.journey;
  },

  async captureAuthorMessage(projectId: string, input: { clientMessageId: string; text: string }): Promise<{ session: CreativeSession; created: boolean }> {
    return request<{ session: CreativeSession; created: boolean }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/messages`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(input)
      }
    );
  },

  async readUnderstandingPreview(projectId: string): Promise<UnderstandingPreview> {
    const data = await request<{ preview: UnderstandingPreview }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding-preview`
    );
    return data.preview;
  },

  async freezeContextManifest(projectId: string): Promise<{ manifest: ContextManifest; created: boolean }> {
    return request<{ manifest: ContextManifest; created: boolean }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/context-manifest`,
      { method: "POST" }
    );
  },

  async readContextManifest(projectId: string): Promise<ContextManifest> {
    const data = await request<{ manifest: ContextManifest }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/context-manifest`
    );
    return data.manifest;
  },

  async startUnderstanding(projectId: string, mode: "model" | "shadow" | "shadow-async" = "model"): Promise<{ task?: import("@/types/novel").UnderstandingTask; job?: BackgroundJob }> {
    return request(`/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ mode })
    });
  },

  async readUnderstandingTask(projectId: string, taskId: string): Promise<import("@/types/novel").UnderstandingTask> {
    const data = await request<{ task: import("@/types/novel").UnderstandingTask }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/tasks/${encodeURIComponent(taskId)}`
    );
    return data.task;
  },

  async cancelUnderstandingTask(projectId: string, taskId: string): Promise<import("@/types/novel").UnderstandingTask> {
    const data = await request<{ task: import("@/types/novel").UnderstandingTask }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/tasks/${encodeURIComponent(taskId)}/cancel`,
      { method: "POST" }
    );
    return data.task;
  },

  async resumeUnderstandingTask(projectId: string, taskId: string): Promise<import("@/types/novel").UnderstandingTask> {
    const data = await request<{ task: import("@/types/novel").UnderstandingTask }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/tasks/${encodeURIComponent(taskId)}/resume`,
      { method: "POST" }
    );
    return data.task;
  },

  async listDialogueQuestions(projectId: string): Promise<DialogueQuestion[]> {
    const data = await request<{ questions: DialogueQuestion[] }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/questions`
    );
    return data.questions;
  },

  async ensurePrimaryDialogueQuestion(projectId: string): Promise<{ created: boolean; question: DialogueQuestion }> {
    return request<{ created: boolean; question: DialogueQuestion }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/questions`,
      { method: "POST" }
    );
  },

  async answerDialogueQuestion(projectId: string, questionId: string, input: { questionVersion: number; expectedSnapshotFingerprint: string; idempotencyKey: string; answerText: string; answerStatus: "confirmed" | "tentative" | "delegated" }): Promise<{ question: DialogueQuestion; decision?: import("@/types/novel").DecisionRecord; replayed?: boolean }> {
    return request<{ question: DialogueQuestion; decision?: import("@/types/novel").DecisionRecord; replayed?: boolean }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/questions/${encodeURIComponent(questionId)}/answers`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) }
    );
  },

  async compileContractCandidate(projectId: string, decisionId: string, interpretationId?: string): Promise<{ candidate: StoryContractCandidate; created: boolean }> {
    return request<{ candidate: StoryContractCandidate; created: boolean }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/contract-candidates`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify({ decisionId, ...(interpretationId ? { interpretationId } : {}) }) }
    );
  },

  async listContractCandidates(projectId: string): Promise<StoryContractCandidate[]> {
    const data = await request<{ candidates: StoryContractCandidate[] }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/contract-candidates`
    );
    return data.candidates;
  },

  async readContractCandidate(projectId: string, candidateId: string): Promise<StoryContractCandidate> {
    const data = await request<{ candidate: StoryContractCandidate }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/contract-candidates/${encodeURIComponent(candidateId)}`
    );
    return data.candidate;
  },

  async compileOutlineCandidate(projectId: string, sourceCandidateId: string, options: { strongFreezeCount?: number; totalChapterCount?: number } = {}): Promise<{ outline: OutlineCandidate; created: boolean }> {
    return request<{ outline: OutlineCandidate; created: boolean }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/outline-candidates`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify({ sourceCandidateId, ...options }) }
    );
  },

  async listOutlineCandidates(projectId: string): Promise<OutlineCandidate[]> {
    const data = await request<{ candidates: OutlineCandidate[] }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/outline-candidates`
    );
    return data.candidates;
  },

  async readOutlineCandidate(projectId: string, outlineId: string): Promise<OutlineCandidate> {
    const data = await request<{ outline: OutlineCandidate }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/outline-candidates/${encodeURIComponent(outlineId)}`
    );
    return data.outline;
  },

  async validateOutlineCandidate(projectId: string, outlineId: string): Promise<OutlineValidationReport> {
    const data = await request<{ report: OutlineValidationReport }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/outline-candidates/${encodeURIComponent(outlineId)}/validate`,
      { method: "POST", headers: jsonHeaders, body: "{}" }
    );
    return data.report;
  },

  async readOutlineValidationReport(projectId: string, outlineId: string): Promise<OutlineValidationReport> {
    const data = await request<{ report: OutlineValidationReport }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/outline-candidates/${encodeURIComponent(outlineId)}/validation`
    );
    return data.report;
  },

  async createOutlineAdoptionProposal(projectId: string, input: { outlineId: string; expectedOutlineFingerprint: string; selectedChapterIds?: string[] }): Promise<OutlineAdoptionProposal> {
    const data = await request<{ proposal: OutlineAdoptionProposal }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/outline-adoption-proposals`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) }
    );
    return data.proposal;
  },

  async authorizeOutlineAdoption(projectId: string, input: { expectedProposalFingerprint: string; actorId: string; authorizationId: string }): Promise<OutlineAdoptionProposal> {
    const data = await request<{ proposal: OutlineAdoptionProposal }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/outline-adoption-proposals/authorize`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) }
    );
    return data.proposal;
  },

  async readOutlineAdoptionProposal(projectId: string): Promise<OutlineAdoptionProposal> {
    const data = await request<{ proposal: OutlineAdoptionProposal }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/outline-adoption-proposals`
    );
    return data.proposal;
  },

  async commitOutlineAdoption(projectId: string, expectedProposalFingerprint: string): Promise<{ status: string; canonWritten: boolean; reason?: string; version?: OutlineVersion; proof?: ExecutionReadyProof }> {
    return request<{ status: string; canonWritten: boolean; reason?: string; version?: OutlineVersion; proof?: ExecutionReadyProof }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/outline-adoption`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify({ expectedProposalFingerprint }) }
    );
  },

  async readOutlineVersion(projectId: string, outlineId: string): Promise<OutlineVersion> {
    const data = await request<{ version: OutlineVersion }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/outline-version/${encodeURIComponent(outlineId)}`
    );
    return data.version;
  },

  async readExecutionReadyProof(projectId: string): Promise<ExecutionReadyProof> {
    const data = await request<{ proof: ExecutionReadyProof }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/execution-ready-proof`
    );
    return data.proof;
  },

  async checkExecutionReadiness(projectId: string, chapterId: string): Promise<ExecutionReadinessDecision> {
    const data = await request<{ readiness: ExecutionReadinessDecision }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/runtime/execution-readiness/${encodeURIComponent(chapterId)}`
    );
    return data.readiness;
  },

  async listExecutionWorkItems(projectId: string): Promise<ExecutionWorkItem[]> {
    const data = await request<{ workItems: ExecutionWorkItem[] }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/runtime/execution-work-items`
    );
    return data.workItems;
  },

  async createWorldRuleContract(projectId: string, input: Omit<WorldRuleContract, "schemaVersion" | "ruleId" | "version" | "projectSlug" | "status" | "canonWritten" | "createdAt" | "fingerprint">): Promise<WorldRuleContract> {
    const data = await request<{ contract: WorldRuleContract }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/world-rule-contracts`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) }
    );
    return data.contract;
  },

  async listWorldRuleContracts(projectId: string): Promise<WorldRuleContract[]> {
    const data = await request<{ contracts: WorldRuleContract[] }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/world-rule-contracts`
    );
    return data.contracts;
  },

  async readWorldRuleContract(projectId: string, ruleId: string): Promise<WorldRuleContract> {
    const data = await request<{ contract: WorldRuleContract }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/world-rule-contracts/${encodeURIComponent(ruleId)}`
    );
    return data.contract;
  },

  async reviewUnderstanding(projectId: string, reviewerId?: string): Promise<UnderstandingReview> {
    const data = await request<{ review: UnderstandingReview }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/review`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify(reviewerId ? { reviewerId } : {}) }
    );
    return data.review;
  },

  async readUnderstandingReview(projectId: string): Promise<UnderstandingReview> {
    const data = await request<{ review: UnderstandingReview }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/review`
    );
    return data.review;
  },

  async submitExternalUnderstandingReview(projectId: string, input: { reviewerKind: "provider" | "human"; reviewerId: string; attestationReference: string; snapshotFingerprint: string; checks: Array<{ checkId: "source-fingerprint" | "evidence-spans" | "branch-separation" | "question-gate" | "canon-isolation"; detail: string }>; evidenceRefs: string[] }): Promise<UnderstandingReview> {
    const data = await request<{ review: UnderstandingReview }>(`/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/review/external`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.review;
  },

  async createContractAdoptionProposal(projectId: string, input: { candidateId: string; expectedCandidateFingerprint: string; fieldDecisions: Array<{ fieldId: string; status: "accept" | "keep-provisional" | "reject" | "delegate"; reason?: string }>; worldRuleContractId?: string }): Promise<ContractAdoptionProposal> {
    const data = await request<{ proposal: ContractAdoptionProposal }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/contract-adoption-proposals`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) }
    );
    return data.proposal;
  },

  async readContractAdoptionProposal(projectId: string): Promise<ContractAdoptionProposal> {
    const data = await request<{ proposal: ContractAdoptionProposal }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/contract-adoption-proposals`
    );
    return data.proposal;
  },

  async commitContractAdoption(projectId: string, input: { expectedProposalFingerprint: string; authorization?: { actorId: string; authorizationId: string } }): Promise<{ status: "committed" | "rolled_back" | "blocked"; canonWritten: boolean; mutationId: string; reason?: string }> {
    return request(`/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/contract-adoption`, {
      method: "POST", headers: jsonHeaders, body: JSON.stringify(input)
    });
  },

  async readContractMutationPlan(projectId: string, mutationId: string): Promise<ContractMutationPlan> {
    const data = await request<{ plan: ContractMutationPlan }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/mutations/${encodeURIComponent(mutationId)}`
    );
    return data.plan;
  },

  async rebuildContractProjections(projectId: string): Promise<ProjectionRebuildReceipt> {
    const data = await request<{ receipt: ProjectionRebuildReceipt }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/projection-rebuild`,
      { method: "POST", headers: jsonHeaders, body: "{}" }
    );
    return data.receipt;
  },

  async readProjectionRebuildReceipt(projectId: string): Promise<ProjectionRebuildReceipt> {
    const data = await request<{ receipt: ProjectionRebuildReceipt }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/projection-rebuild`
    );
    return data.receipt;
  },

  async readProjectionFreshness(projectId: string): Promise<ProjectionFreshness> {
    const data = await request<{ freshness: ProjectionFreshness }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/projection-freshness`
    );
    return data.freshness;
  },

  async readQualityCalibrationEvidence(projectId: string): Promise<QualityCalibrationEvidence> {
    const data = await request<{ evidence: QualityCalibrationEvidence }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/quality-calibration`
    );
    return data.evidence;
  },

  async readQualityCalibrationEvidenceHistory(projectId: string): Promise<QualityCalibrationEvidence[]> {
    const data = await request<{ evidence: QualityCalibrationEvidence[] }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/quality-calibration/history`
    );
    return data.evidence;
  },

  async submitQualityCalibrationEvidence(projectId: string, input: {
    evaluatorVersion: string;
    sourceKind: "provider" | "human";
    holdoutInputFingerprint: string;
    evaluatedCount: number;
    correctCount: number;
    accuracy: number;
    minimumAccuracy: number;
    attestation: { kind: "provider-signed" | "human-reviewed"; reference: string };
    evidenceRefs: string[];
  }): Promise<QualityCalibrationEvidence> {
    const data = await request<{ evidence: QualityCalibrationEvidence }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/quality-calibration`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) }
    );
    return data.evidence;
  },

  async readReleaseAcceptance(): Promise<ReleaseAcceptanceDecision> {
    const data = await request<{ decision: ReleaseAcceptanceDecision }>("/api/novel/release-acceptance");
    return data.decision;
  },

  async readReleaseActivation(): Promise<ReleaseActivation | null> {
    const response = await fetch("/api/novel/release-activation", {});
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json() as { activation: ReleaseActivation | null };
    return data.activation;
  },

  async activateRelease(): Promise<ReleaseActivation> {
    const data = await request<{ activation: ReleaseActivation }>("/api/novel/release-activation", { method: "POST", headers: jsonHeaders, body: "{}" });
    return data.activation;
  },

  async readLengthContract(projectId: string): Promise<LengthContract | null> {
    const response = await fetch(`/api/novel/projects/${encodeURIComponent(projectId)}/length-contract`, {});
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json() as { contract: LengthContract };
    return data.contract;
  },

  async createLengthContract(projectId: string, input: { dimensions: LengthContract["dimensions"]; hardLocks?: string[] }): Promise<LengthContract> {
    const data = await request<{ contract: LengthContract }>(`/api/novel/projects/${encodeURIComponent(projectId)}/length-contract`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.contract;
  },

  async readLengthForecast(projectId: string): Promise<LengthForecast> {
    const data = await request<{ forecast: LengthForecast }>(`/api/novel/projects/${encodeURIComponent(projectId)}/length-forecast`);
    return data.forecast;
  },

  async decideLengthVariance(projectId: string, choice: LengthVarianceDecision["choice"] = "pause-and-review"): Promise<LengthVarianceDecision> {
    const data = await request<{ decision: LengthVarianceDecision }>(`/api/novel/projects/${encodeURIComponent(projectId)}/length-variance-decisions`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ choice }) });
    return data.decision;
  },

  async buildStoryContractReadiness(projectId: string, candidateId?: string): Promise<StoryContractReadinessProof> {
    const data = await request<{ proof: StoryContractReadinessProof }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/contract-readiness`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify(candidateId ? { candidateId } : {}) }
    );
    return data.proof;
  },

  async readStoryContractReadiness(projectId: string): Promise<StoryContractReadinessProof> {
    const data = await request<{ proof: StoryContractReadinessProof }>(
      `/api/novel/projects/${encodeURIComponent(projectId)}/session/understanding/contract-readiness`
    );
    return data.proof;
  },

  async importProject(input: {
    sourcePath: string;
    title?: string;
    genre?: string;
    roughIdea?: string;
    files?: Array<{ relativePath: string; content: string }>;
  }): Promise<NovelProject> {
    const data = await request<{ project: NovelProject }>("/api/novel/import", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.project;
  },

  async deleteProject(projectId: string): Promise<void> {
    await request(`/api/novel/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE"
    });
  },

  async readPlatformLibrary(): Promise<PlatformLibrary> {
    const data = await request<{ library: PlatformLibrary }>("/api/platform/library");
    return data.library;
  },

  async readAgentProfiles(): Promise<{
    defaultProfileId: string;
    profiles: AiAgentProfile[];
    checks: AiAgentCheckResult[];
  }> {
    return request("/api/novel/agents");
  },

  async readAiStages(): Promise<AiStageDefinition[]> {
    const data = await request<{ stages: AiStageDefinition[] }>("/api/novel/ai-stages");
    return data.stages;
  },

  async checkAgentProfile(profileId: string, modelId?: string): Promise<AiAgentCheckResult> {
    return request("/api/novel/agents/check", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ profileId, modelId })
    });
  },

  async readPlatformAiConfig(): Promise<PlatformAiConfig> {
    const data = await request<{ config: PlatformAiConfig }>("/api/platform/ai-config");
    return data.config;
  },

  async savePlatformAiConfig(config: PlatformAiConfig): Promise<PlatformAiConfig> {
    const data = await request<{ config: PlatformAiConfig }>("/api/platform/ai-config", {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ config })
    });
    return data.config;
  },

  async updateProjectAiConfig(projectId: string, input: { profileId: string; modelId?: string }): Promise<NovelProject> {
    const data = await request<{ project: NovelProject }>(`/api/novel/projects/${projectId}/ai`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.project;
  },

  async createPlatformAsset(input: {
    name: string;
    type?: PlatformAssetType;
    scope?: "project" | "shared";
    projectSlug?: string;
    filePath?: string;
    tags?: string[];
  }): Promise<PlatformAsset> {
    const data = await request<{ asset: PlatformAsset }>("/api/platform/assets", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.asset;
  },

  async linkPlatformAsset(assetId: string, projectSlug: string): Promise<PlatformAsset> {
    const data = await request<{ asset: PlatformAsset }>(`/api/platform/assets/${assetId}/link`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ projectSlug })
    });
    return data.asset;
  },

  async readFile(projectId: string, filePath: string): Promise<string> {
    const data = await request<{ content: string }>(`/api/novel/projects/${projectId}/files/${filePath}`);
    return data.content;
  },

  async saveFile(projectId: string, filePath: string, content: string): Promise<void> {
    await request(`/api/novel/projects/${projectId}/files/${filePath}`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ content })
    });
  },

  async readFileVersions(projectId: string, filePath: string): Promise<FileVersionSnapshot[]> {
    const data = await request<{ versions: FileVersionSnapshot[] }>(`/api/novel/projects/${projectId}/file-versions/${filePath}`);
    return data.versions;
  },

  async readFileDiff(projectId: string, filePath: string, versionId: string): Promise<FileDiffResult> {
    const data = await request<{ diff: FileDiffResult }>(
      `/api/novel/projects/${projectId}/file-diff/${filePath}?from=${encodeURIComponent(versionId)}`
    );
    return data.diff;
  },

  async requestEditorSuggestion(projectId: string, input: EditorSuggestionRequest): Promise<EditorSuggestion> {
    const data = await request<{ suggestion: EditorSuggestion }>(`/api/novel/projects/${projectId}/editor/suggestion`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.suggestion;
  },

  async readChapterDashboard(projectId: string, chapterId: string): Promise<ChapterDashboard> {
    const data = await request<{ dashboard: ChapterDashboard }>(`/api/novel/projects/${projectId}/dashboard/${chapterId}`);
    return data.dashboard;
  },

  async readCreationRuntimeSnapshot(projectId: string, chapterId: string): Promise<CreationRuntimeSnapshot> {
    const data = await request<{ snapshot: CreationRuntimeSnapshot }>(`/api/novel/projects/${projectId}/runtime/${chapterId}`);
    return data.snapshot;
  },

  async startRuntime(
    projectId: string,
    input: { chapterId?: string; direction?: string; branchId?: string; autoContinue?: boolean; requireExecutionReady?: boolean } = {}
  ): Promise<{ run: RuntimeRun; command: RuntimeCommand; workItem?: ExecutionWorkItem }> {
    return request<{ run: RuntimeRun; command: RuntimeCommand; workItem?: ExecutionWorkItem }>(`/api/novel/projects/${projectId}/runtime/start`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
  },

  async readProseCandidate(projectId: string, candidateId: string): Promise<{ candidate: ProseCandidate; validation: ProseCandidateValidation; validationBundle?: ProseValidationBundle | null }> {
    return request<{ candidate: ProseCandidate; validation: ProseCandidateValidation; validationBundle?: ProseValidationBundle | null }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-candidates/${encodeURIComponent(candidateId)}`);
  },

  async listProseCandidates(projectId: string): Promise<ProseCandidate[]> {
    const data = await request<{ candidates: ProseCandidate[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-candidates`);
    return data.candidates;
  },

  async readProseAdoptionReadiness(projectId: string, candidateId: string): Promise<ProseAdoptionReadiness> {
    const data = await request<{ readiness: ProseAdoptionReadiness }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-candidates/${encodeURIComponent(candidateId)}/adoption-readiness`);
    return data.readiness;
  },

  async validateProseCandidate(projectId: string, candidateId: string): Promise<ProseValidationBundle> {
    const data = await request<{ validationBundle: ProseValidationBundle }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-candidates/${encodeURIComponent(candidateId)}/validate`, {
      method: "POST",
      headers: jsonHeaders,
      body: "{}"
    });
    return data.validationBundle;
  },

  async reviewProseCandidate(projectId: string, candidateId: string): Promise<RedBlueReview> {
    const data = await request<{ review: RedBlueReview }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-candidates/${encodeURIComponent(candidateId)}/review`, {
      method: "POST",
      headers: jsonHeaders,
      body: "{}"
    });
    return data.review;
  },

  async createProseRepairPlan(projectId: string, candidateId: string): Promise<ProseRepairPlan> {
    const data = await request<{ plan: ProseRepairPlan }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-candidates/${encodeURIComponent(candidateId)}/repair-plans`, { method: "POST", headers: jsonHeaders, body: "{}" });
    return data.plan;
  },

  async readProseRepairPlan(projectId: string, planId: string): Promise<ProseRepairPlan | null> {
    const response = await fetch(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-repair-plans/${encodeURIComponent(planId)}`, {});
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json() as { plan: ProseRepairPlan };
    return data.plan;
  },

  async createProseRepairCandidate(projectId: string, planId: string, content: string): Promise<{ candidate: ProseCandidate; metadata: ProseRepairCandidate }> {
    return request<{ candidate: ProseCandidate; metadata: ProseRepairCandidate }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-repair-plans/${encodeURIComponent(planId)}/candidates`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ content }) });
  },

  async evaluateProseRepairRegression(projectId: string, repairCandidateId: string): Promise<ProseRepairRegression> {
    const data = await request<{ dossier: ProseRepairRegression }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-repair-candidates/${encodeURIComponent(repairCandidateId)}/regression`, { method: "POST", headers: jsonHeaders, body: "{}" });
    return data.dossier;
  },

  async recordAuthorFeedback(projectId: string, candidateId: string, input: { adoptionTransactionId: string; decision: AuthorFeedbackEvent["decision"]; note?: string }): Promise<AuthorFeedbackEvent> {
    const data = await request<{ event: AuthorFeedbackEvent }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-candidates/${encodeURIComponent(candidateId)}/feedback`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.event;
  },

  async readAuthorFeedbackEvent(projectId: string, eventId: string): Promise<AuthorFeedbackEvent> {
    const data = await request<{ event: AuthorFeedbackEvent }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-feedback/${encodeURIComponent(eventId)}`);
    return data.event;
  },

  async createFeedbackAttribution(projectId: string, eventId: string, input: { category: FeedbackCategory; pattern?: string; scope: { chapterId?: string; sceneId?: string }; evidenceRefs: string[]; confounders: string[]; confidence: { lower: number; upper: number } }): Promise<FeedbackAttribution> {
    const data = await request<{ attribution: FeedbackAttribution }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-feedback/${encodeURIComponent(eventId)}/attribution`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.attribution;
  },

  async derivePreferenceHypothesis(projectId: string, attributionId: string): Promise<PreferenceHypothesis> {
    const data = await request<{ hypothesis: PreferenceHypothesis }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-feedback-attributions/${encodeURIComponent(attributionId)}/hypothesis`, { method: "POST", headers: jsonHeaders, body: "{}" });
    return data.hypothesis;
  },

  async readPreferenceHypothesis(projectId: string, hypothesisId: string): Promise<PreferenceHypothesis> {
    const data = await request<{ hypothesis: PreferenceHypothesis }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/preference-hypotheses/${encodeURIComponent(hypothesisId)}`);
    return data.hypothesis;
  },

  async revokePreferenceHypothesis(projectId: string, hypothesisId: string, input: { actor: string; reason: string }): Promise<PreferenceHypothesis> {
    const data = await request<{ hypothesis: PreferenceHypothesis }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/preference-hypotheses/${encodeURIComponent(hypothesisId)}/revoke`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.hypothesis;
  },

  async recordPreferenceOpposition(projectId: string, hypothesisId: string, input: { oppositionEventId: string; reason: string }): Promise<PreferenceHypothesis> {
    const data = await request<{ hypothesis: PreferenceHypothesis }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/preference-hypotheses/${encodeURIComponent(hypothesisId)}/oppositions`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.hypothesis;
  },

  async createLearningPolicy(projectId: string, rollbackVersion: string): Promise<LearningPolicy> {
    const data = await request<{ policy: LearningPolicy }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/learning-policy`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ rollbackVersion }) });
    return data.policy;
  },

  async readLearningPolicy(projectId: string): Promise<LearningPolicy> {
    const data = await request<{ policy: LearningPolicy }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/learning-policy`);
    return data.policy;
  },

  async createExplorationBudget(projectId: string, input: { scope: string; maxProbes: number; maxCost: number; maxImpact: string; stopConditions: string[] }): Promise<ExplorationBudget> {
    const data = await request<{ budget: ExplorationBudget }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/exploration-budgets`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.budget;
  },

  async consumeExplorationBudget(projectId: string, budgetId: string, input: { operationId: string; probes: number; cost: number; impact: string }): Promise<ExplorationBudget> {
    const data = await request<{ budget: ExplorationBudget }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/exploration-budgets/${encodeURIComponent(budgetId)}/consume`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.budget;
  },

  async readExplorationBudget(projectId: string, budgetId: string): Promise<ExplorationBudget> {
    const data = await request<{ budget: ExplorationBudget }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/exploration-budgets/${encodeURIComponent(budgetId)}`);
    return data.budget;
  },

  async pauseExplorationBudget(projectId: string, budgetId: string, reason: string): Promise<ExplorationBudget> {
    const data = await request<{ budget: ExplorationBudget }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/exploration-budgets/${encodeURIComponent(budgetId)}/pause`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ reason }) });
    return data.budget;
  },

  async createSourceMaterial(projectId: string, input: Omit<SourceMaterialRecord, "schemaVersion" | "sourceId" | "projectSlug" | "createdAt" | "fingerprint">): Promise<SourceMaterialRecord> {
    const data = await request<{ source: SourceMaterialRecord }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/source-material`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.source;
  },

  async readSourceMaterial(projectId: string, sourceId: string): Promise<SourceMaterialRecord> {
    const data = await request<{ source: SourceMaterialRecord }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/source-material/${encodeURIComponent(sourceId)}`);
    return data.source;
  },

  async createRightsEnvelope(projectId: string, sourceId: string, checkedBy: string): Promise<RightsEnvelope> {
    const data = await request<{ envelope: RightsEnvelope }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/source-material/${encodeURIComponent(sourceId)}/rights-envelope`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ checkedBy }) });
    return data.envelope;
  },

  async createCraftPattern(projectId: string, input: Omit<CraftPattern, "schemaVersion" | "patternId" | "projectSlug" | "lifecycle" | "createdAt" | "updatedAt" | "fingerprint" | "approval">): Promise<CraftPattern> {
    const data = await request<{ pattern: CraftPattern }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/craft-patterns`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.pattern;
  },

  async createCharacterDramaticContract(projectId: string, input: Omit<CharacterDramaticContract, "schemaVersion" | "contractId" | "projectSlug" | "lifecycle" | "createdAt" | "updatedAt" | "fingerprint" | "confirmation">): Promise<CharacterDramaticContract> {
    const data = await request<{ contract: CharacterDramaticContract }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/character-contracts`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.contract;
  },

  async listCharacterDramaticContracts(projectId: string): Promise<CharacterDramaticContract[]> {
    const data = await request<{ contracts: CharacterDramaticContract[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/character-contracts`);
    return data.contracts;
  },

  async confirmCharacterDramaticContract(projectId: string, contractId: string, input: { actor: string; reason: string }): Promise<CharacterDramaticContract> {
    const data = await request<{ contract: CharacterDramaticContract }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/character-contracts/${encodeURIComponent(contractId)}/confirm`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.contract;
  },

  async recordCharacterStateSnapshot(projectId: string, input: Omit<CharacterStateSnapshot, "schemaVersion" | "snapshotId" | "projectSlug" | "createdAt" | "fingerprint">): Promise<CharacterStateSnapshot> {
    const data = await request<{ snapshot: CharacterStateSnapshot }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/character-state-snapshots`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.snapshot;
  },

  async listCharacterStateSnapshots(projectId: string, characterId?: string): Promise<CharacterStateSnapshot[]> {
    const query = characterId ? `?characterId=${encodeURIComponent(characterId)}` : "";
    const data = await request<{ snapshots: CharacterStateSnapshot[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/character-state-snapshots${query}`);
    return data.snapshots;
  },

  async createCharacterChoiceEvidence(projectId: string, input: Omit<CharacterChoiceEvidence, "schemaVersion" | "evidenceId" | "projectSlug" | "status" | "afterSnapshotId" | "outcomeRefs" | "createdAt" | "updatedAt" | "fingerprint">): Promise<CharacterChoiceEvidence> {
    const data = await request<{ evidence: CharacterChoiceEvidence }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/character-choice-evidence`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.evidence;
  },

  async observeCharacterChoiceEvidence(projectId: string, evidenceId: string, input: { afterSnapshotId: string; outcomeRefs: string[] }): Promise<CharacterChoiceEvidence> {
    const data = await request<{ evidence: CharacterChoiceEvidence }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/character-choice-evidence/${encodeURIComponent(evidenceId)}/observe`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.evidence;
  },

  async createRelationshipEvent(projectId: string, input: Omit<RelationshipEvent, "schemaVersion" | "eventId" | "projectSlug" | "status" | "afterSnapshotId" | "outcomeRefs" | "createdAt" | "updatedAt" | "fingerprint">): Promise<RelationshipEvent> {
    const data = await request<{ event: RelationshipEvent }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/relationship-events`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.event;
  },

  async observeRelationshipEvent(projectId: string, eventId: string, input: { afterSnapshotId: string; outcomeRefs: string[] }): Promise<RelationshipEvent> {
    const data = await request<{ event: RelationshipEvent }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/relationship-events/${encodeURIComponent(eventId)}/observe`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.event;
  },

  async createCharacterArcContract(projectId: string, input: Omit<CharacterArcContract, "schemaVersion" | "arcId" | "projectSlug" | "lifecycle" | "milestones" | "createdAt" | "updatedAt" | "fingerprint">): Promise<CharacterArcContract> {
    const data = await request<{ arc: CharacterArcContract }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/character-arcs`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.arc;
  },

  async listCharacterArcContracts(projectId: string, characterId?: string): Promise<CharacterArcContract[]> {
    const query = characterId ? `?characterId=${encodeURIComponent(characterId)}` : "";
    const data = await request<{ arcs: CharacterArcContract[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/character-arcs${query}`);
    return data.arcs;
  },

  async recordCharacterArcMilestone(projectId: string, arcId: string, input: { choiceEvidenceId: string; milestone: string; actualChange: string; sourceRefs: string[] }): Promise<CharacterArcContract> {
    const data = await request<{ arc: CharacterArcContract }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/character-arcs/${encodeURIComponent(arcId)}/milestones`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.arc;
  },

  async recordWorldStateSnapshot(projectId: string, input: Omit<WorldStateSnapshot, "schemaVersion" | "snapshotId" | "projectSlug" | "createdAt" | "fingerprint">): Promise<WorldStateSnapshot> {
    const data = await request<{ snapshot: WorldStateSnapshot }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/world-state-snapshots`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.snapshot;
  },

  async listWorldStateSnapshots(projectId: string, region?: string): Promise<WorldStateSnapshot[]> {
    const query = region ? `?region=${encodeURIComponent(region)}` : "";
    const data = await request<{ snapshots: WorldStateSnapshot[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/world-state-snapshots${query}`);
    return data.snapshots;
  },

  async createCapabilityContract(projectId: string, input: Omit<CapabilityContract, "schemaVersion" | "capabilityId" | "projectSlug" | "permanent" | "status" | "progressionEventIds" | "createdAt" | "updatedAt" | "fingerprint">): Promise<CapabilityContract> {
    const data = await request<{ capability: CapabilityContract }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/capability-contracts`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.capability;
  },

  async listCapabilityContracts(projectId: string): Promise<CapabilityContract[]> {
    const data = await request<{ capabilities: CapabilityContract[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/capability-contracts`);
    return data.capabilities;
  },

  async createProgressionEvent(projectId: string, capabilityId: string, input: Omit<ProgressionEvent, "schemaVersion" | "progressionId" | "capabilityId" | "createdAt" | "fingerprint">): Promise<ProgressionEvent> {
    const data = await request<{ event: ProgressionEvent }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/capability-contracts/${encodeURIComponent(capabilityId)}/progression`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.event;
  },

  async createWorldLocation(projectId: string, input: Omit<WorldLocation, "schemaVersion" | "projectSlug" | "createdAt" | "updatedAt" | "fingerprint">): Promise<WorldLocation> {
    const data = await request<{ location: WorldLocation }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/world-locations`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.location;
  },

  async listWorldLocations(projectId: string): Promise<WorldLocation[]> {
    const data = await request<{ locations: WorldLocation[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/world-locations`);
    return data.locations;
  },

  async evaluateWorldLocationReachability(projectId: string, locationId: string, input: { destinationId: string; hasAccess: boolean }): Promise<"reachable" | "blocked" | "unknown"> {
    const data = await request<{ status: "reachable" | "blocked" | "unknown" }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/world-locations/${encodeURIComponent(locationId)}/reachability`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.status;
  },

  async createStoryTimeEvent(projectId: string, input: Omit<StoryTimeEvent, "schemaVersion" | "projectSlug" | "createdAt" | "fingerprint">): Promise<StoryTimeEvent> {
    const data = await request<{ event: StoryTimeEvent }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/story-time-events`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.event;
  },

  async listStoryTimeEvents(projectId: string): Promise<StoryTimeEvent[]> {
    const data = await request<{ events: StoryTimeEvent[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/story-time-events`);
    return data.events;
  },

  async compareStoryTimeEvents(projectId: string, leftEventId: string, rightEventId: string): Promise<"before" | "after" | "simultaneous" | "unknown"> {
    const data = await request<{ relation: "before" | "after" | "simultaneous" | "unknown" }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/story-time-events/compare`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ leftEventId, rightEventId }) });
    return data.relation;
  },

  async createCausalityEdge(projectId: string, input: Omit<CausalityEdge, "schemaVersion" | "projectSlug" | "status" | "createdAt" | "fingerprint">): Promise<CausalityEdge> {
    const data = await request<{ edge: CausalityEdge }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/causality-edges`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.edge;
  },

  async listCausalityEdges(projectId: string): Promise<CausalityEdge[]> {
    const data = await request<{ edges: CausalityEdge[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/causality-edges`);
    return data.edges;
  },

  async validateCausalityGraph(projectId: string): Promise<CausalityGraphReport> {
    const data = await request<{ report: CausalityGraphReport }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/causality-graph/validation`);
    return data.report;
  },

  async createVolumeContract(projectId: string, input: Omit<VolumeContract, "schemaVersion" | "projectSlug" | "status" | "createdAt" | "updatedAt" | "fingerprint">): Promise<VolumeContract> {
    const data = await request<{ volume: VolumeContract }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/volume-contracts`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.volume;
  },

  async listVolumeContracts(projectId: string): Promise<VolumeContract[]> {
    const data = await request<{ volumes: VolumeContract[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/volume-contracts`);
    return data.volumes;
  },

  async createChapterFunctionContract(projectId: string, input: Omit<ChapterFunctionContract, "schemaVersion" | "projectSlug" | "status" | "createdAt" | "updatedAt" | "fingerprint">): Promise<ChapterFunctionContract> {
    const data = await request<{ chapter: ChapterFunctionContract }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/chapter-functions`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.chapter;
  },

  async listChapterFunctionContracts(projectId: string): Promise<ChapterFunctionContract[]> {
    const data = await request<{ chapters: ChapterFunctionContract[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/chapter-functions`);
    return data.chapters;
  },

  async createSceneCardContract(projectId: string, input: Omit<SceneCardContract, "schemaVersion" | "projectSlug" | "status" | "createdAt" | "updatedAt" | "fingerprint">): Promise<SceneCardContract> {
    const data = await request<{ scene: SceneCardContract }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/scene-cards`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.scene;
  },

  async listSceneCardContracts(projectId: string): Promise<SceneCardContract[]> {
    const data = await request<{ scenes: SceneCardContract[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/scene-cards`);
    return data.scenes;
  },

  async createNarrativeTraceLink(projectId: string, input: Omit<NarrativeTraceLink, "schemaVersion" | "projectSlug" | "createdAt" | "fingerprint">): Promise<NarrativeTraceLink> {
    const data = await request<{ link: NarrativeTraceLink }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/narrative-trace-links`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.link;
  },

  async listNarrativeTraceLinks(projectId: string): Promise<NarrativeTraceLink[]> {
    const data = await request<{ links: NarrativeTraceLink[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/narrative-trace-links`);
    return data.links;
  },

  async validateNarrativeTrace(projectId: string): Promise<NarrativeTraceReport> {
    const data = await request<{ report: NarrativeTraceReport }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/narrative-trace/validation`);
    return data.report;
  },

  async readObligationLoadReport(projectId: string, chapterIds: string[] = []): Promise<ObligationLoadReport> {
    const query = chapterIds.length ? `?chapterIds=${encodeURIComponent(chapterIds.join(","))}` : "";
    const data = await request<{ report: ObligationLoadReport }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/obligation-load${query}`);
    return data.report;
  },

  async createNarrativeCurvePoint(projectId: string, input: Omit<NarrativeCurvePoint, "schemaVersion" | "projectSlug" | "createdAt" | "fingerprint">): Promise<NarrativeCurvePoint> {
    const data = await request<{ point: NarrativeCurvePoint }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/narrative-curve-points`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.point;
  },

  async listNarrativeCurvePoints(projectId: string): Promise<NarrativeCurvePoint[]> {
    const data = await request<{ points: NarrativeCurvePoint[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/narrative-curve-points`);
    return data.points;
  },

  async createPlanningNode(projectId: string, input: Omit<PlanningNode, "schemaVersion" | "projectSlug" | "autoEvolutionAllowed" | "decision" | "createdAt" | "updatedAt" | "fingerprint">): Promise<PlanningNode> {
    const data = await request<{ node: PlanningNode }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/planning-nodes`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.node;
  },

  async transitionPlanningNode(projectId: string, nodeId: string, input: { toStatus: PlanningNode["status"]; actor: string; reason: string }): Promise<PlanningNode> {
    const data = await request<{ node: PlanningNode }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/planning-nodes/${encodeURIComponent(nodeId)}/transition`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.node;
  },

  async createStructureAlternativeSet(projectId: string, input: Omit<StructureAlternativeSet, "schemaVersion" | "projectSlug" | "createdAt" | "fingerprint">): Promise<StructureAlternativeSet> {
    const data = await request<{ set: StructureAlternativeSet }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/structure-alternatives`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.set;
  },

  async listStructureAlternativeSets(projectId: string): Promise<StructureAlternativeSet[]> {
    const data = await request<{ sets: StructureAlternativeSet[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/structure-alternatives`);
    return data.sets;
  },

  async listCraftPatterns(projectId: string): Promise<CraftPattern[]> {
    const data = await request<{ patterns: CraftPattern[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/craft-patterns`);
    return data.patterns;
  },

  async readCraftPattern(projectId: string, patternId: string): Promise<CraftPattern> {
    const data = await request<{ pattern: CraftPattern }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/craft-patterns/${encodeURIComponent(patternId)}`);
    return data.pattern;
  },

  async approveCraftPattern(projectId: string, patternId: string, input: { actor: string; reason: string }): Promise<CraftPattern> {
    const data = await request<{ pattern: CraftPattern }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/craft-patterns/${encodeURIComponent(patternId)}/approve`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.pattern;
  },

  async evaluateSimilarityGuard(projectId: string, input: { sourceText: string; targetText: string; maxTokenOverlap: number; sourceVersion: string; targetVersion: string }): Promise<SimilarityGuardResult> {
    const data = await request<{ guard: SimilarityGuardResult }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/similarity-guards`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.guard;
  },

  async createPatternTransferPlan(projectId: string, input: { patternId: string; sourceEnvelopeId: string; guard: SimilarityGuardResult; targetChapterId: string; intendedEffect: string }): Promise<PatternTransferPlan> {
    const data = await request<{ plan: PatternTransferPlan }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/pattern-transfer-plans`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.plan;
  },

  async createCraftExperiment(projectId: string, input: { transferPlanId: string; baselineCandidateId: string; treatmentCandidateId: string; holdoutSceneIds: string[]; targetMetrics: string[]; budgetId: string }): Promise<CraftExperiment> {
    const data = await request<{ experiment: CraftExperiment }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/craft-experiments`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.experiment;
  },

  async listCraftExperiments(projectId: string): Promise<CraftExperiment[]> {
    const data = await request<{ experiments: CraftExperiment[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/craft-experiments`);
    return data.experiments;
  },

  async startCraftExperiment(projectId: string, experimentId: string, runnerId: string): Promise<CraftExperiment> {
    const data = await request<{ experiment: CraftExperiment }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/craft-experiments/${encodeURIComponent(experimentId)}/start`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ runnerId }) });
    return data.experiment;
  },

  async judgeCraftExperiment(projectId: string, experimentId: string, input: { evaluatorId: string; evaluatorKind: "independent-reviewer" | "author"; winner: "baseline" | "treatment" | "tie" | "uncertain"; hardGuardsPassed: boolean; authorReason: string }): Promise<CraftExperiment> {
    const data = await request<{ experiment: CraftExperiment }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/craft-experiments/${encodeURIComponent(experimentId)}/judge`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.experiment;
  },

  async promoteCraftPatternFromExperiment(projectId: string, patternId: string, input: { experiment: CraftExperiment; actor: string; reason: string }): Promise<CraftPattern> {
    const data = await request<{ pattern: CraftPattern }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/craft-patterns/${encodeURIComponent(patternId)}/promote-from-experiment`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.pattern;
  },

  async validateCraftPatternFromExperiment(projectId: string, patternId: string, input: { experiment: CraftExperiment; actor: string; reason: string }): Promise<CraftPattern> {
    const data = await request<{ pattern: CraftPattern }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/craft-patterns/${encodeURIComponent(patternId)}/validate-from-experiment`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.pattern;
  },

  async publishDerivedAssets(projectId: string, chapterId: string, settlementId: string, writes: Array<{ relativePath: string; content: string }>): Promise<DerivedPublicationTransaction> {
    const data = await request<{ transaction: DerivedPublicationTransaction }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/chapters/${encodeURIComponent(chapterId)}/settlements/${encodeURIComponent(settlementId)}/derived`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ writes })
    });
    return data.transaction;
  },

  async readDerivedPublicationTransaction(projectId: string, transactionId: string): Promise<DerivedPublicationTransaction> {
    const data = await request<{ transaction: DerivedPublicationTransaction }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/derived-publications/${encodeURIComponent(transactionId)}`);
    return data.transaction;
  },

  async adoptProseCandidate(projectId: string, candidateId: string, input: { expectedCanonSha256: string; authorizationId: string }): Promise<ProseAdoptionTransaction> {
    const data = await request<{ transaction: ProseAdoptionTransaction }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-candidates/${encodeURIComponent(candidateId)}/adopt`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.transaction;
  },

  async readProseAdoptionTransaction(projectId: string, transactionId: string): Promise<ProseAdoptionTransaction> {
    const data = await request<{ transaction: ProseAdoptionTransaction }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/prose-adoptions/${encodeURIComponent(transactionId)}`);
    return data.transaction;
  },

  async settleChapter(projectId: string, chapterId: string, adoptionTransactionId: string, bookRunId?: string): Promise<ChapterSettlement> {
    const data = await request<{ settlement: ChapterSettlement }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/chapters/${encodeURIComponent(chapterId)}/settle`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ adoptionTransactionId, ...(bookRunId ? { bookRunId } : {}) })
    });
    return data.settlement;
  },

  async readChapterSettlement(projectId: string, chapterId: string, settlementId: string): Promise<ChapterSettlement> {
    const data = await request<{ settlement: ChapterSettlement }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/chapters/${encodeURIComponent(chapterId)}/settlements/${encodeURIComponent(settlementId)}`);
    return data.settlement;
  },

  async createBookWorkGraph(projectId: string, chapterIds?: string[]): Promise<BookWorkGraph> {
    const data = await request<{ graph: BookWorkGraph }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/work-graph`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(chapterIds ? { chapterIds } : {})
    });
    return data.graph;
  },

  async refreshBookWorkGraph(projectId: string): Promise<BookWorkGraph> {
    const data = await request<{ graph: BookWorkGraph }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/work-graph/refresh`, { method: "POST", headers: jsonHeaders, body: "{}" });
    return data.graph;
  },

  async readBookWorkGraph(projectId: string): Promise<BookWorkGraph> {
    const data = await request<{ graph: BookWorkGraph }>(`/api/novel/projects/${encodeURIComponent(projectId)}/runtime/work-graph`);
    return data.graph;
  },

  async startBookRun(projectId: string, input: { chapterIds?: string[]; objective?: string; parentRunId?: string; storyContractRef?: string; autonomyLevel: "L0" | "L1" | "L2"; limits: BookRun["limits"] }): Promise<BookRun> {
    const data = await request<{ run: BookRun }>(`/api/novel/projects/${encodeURIComponent(projectId)}/book-runs`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.run;
  },

  async listBookRuns(projectId: string): Promise<BookRun[]> {
    const data = await request<{ runs: BookRun[] }>(`/api/novel/projects/${encodeURIComponent(projectId)}/book-runs`);
    return data.runs;
  },

  async readBookRun(projectId: string, bookRunId: string): Promise<{ run: BookRun; quiescence: { quiescent: boolean; activeWorkItemIds: string[]; activeMutationLeases: string[] } }> {
    return request<{ run: BookRun; quiescence: { quiescent: boolean; activeWorkItemIds: string[]; activeMutationLeases: string[] } }>(`/api/novel/projects/${encodeURIComponent(projectId)}/book-runs/${encodeURIComponent(bookRunId)}`);
  },

  async advanceBookRun(projectId: string, bookRunId: string): Promise<{ run: BookRun; graph: BookWorkGraph; scheduled: Array<{ chapterId: string; workItemId: string; status: string }>; dispatched: Array<Record<string, unknown>> }> {
    return request<{ run: BookRun; graph: BookWorkGraph; scheduled: Array<{ chapterId: string; workItemId: string; status: string }>; dispatched: Array<Record<string, unknown>> }>(`/api/novel/projects/${encodeURIComponent(projectId)}/book-runs/${encodeURIComponent(bookRunId)}/advance`, {
      method: "POST",
      headers: jsonHeaders,
      body: "{}"
    });
  },

  async runBookCompletionAudit(projectId: string, bookRunId: string, sourceFingerprint: string): Promise<CompletionAudit> {
    const data = await request<{ audit: CompletionAudit }>(`/api/novel/projects/${encodeURIComponent(projectId)}/book-runs/${encodeURIComponent(bookRunId)}/completion-audits`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ sourceFingerprint })
    });
    return data.audit;
  },

  async readRuntimeStatus(projectId: string): Promise<RuntimeStatusSnapshot> {
    const data = await request<{ status: RuntimeStatusSnapshot }>(`/api/novel/projects/${projectId}/runtime/status`);
    return data.status;
  },

  runtimeEventsUrl(projectId: string, after = 0): string {
    return `/api/novel/projects/${encodeURIComponent(projectId)}/runtime/events?after=${encodeURIComponent(String(after))}`;
  },

  async pauseRuntime(projectId: string, runId?: string): Promise<{ run: RuntimeRun | null; command: RuntimeCommand }> {
    return request<{ run: RuntimeRun | null; command: RuntimeCommand }>(`/api/novel/projects/${projectId}/runtime/pause`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ runId })
    });
  },

  async resumeRuntime(projectId: string, runId?: string): Promise<{ run: RuntimeRun | null; command: RuntimeCommand }> {
    return request<{ run: RuntimeRun | null; command: RuntimeCommand }>(`/api/novel/projects/${projectId}/runtime/resume`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ runId })
    });
  },

  async stopRuntime(projectId: string, runId?: string): Promise<{ run: RuntimeRun | null; command: RuntimeCommand }> {
    return request<{ run: RuntimeRun | null; command: RuntimeCommand }>(`/api/novel/projects/${projectId}/runtime/stop`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ runId })
    });
  },

  async acceptRuntimeReview(projectId: string, runId?: string): Promise<{ run: RuntimeRun | null; command: RuntimeCommand }> {
    return request<{ run: RuntimeRun | null; command: RuntimeCommand }>(`/api/novel/projects/${projectId}/runtime/review/accept`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ runId })
    });
  },

  async rewriteRuntimeReview(projectId: string, input: { runId?: string; direction?: string } = {}): Promise<{ run: RuntimeRun | null; command: RuntimeCommand }> {
    return request<{ run: RuntimeRun | null; command: RuntimeCommand }>(`/api/novel/projects/${projectId}/runtime/review/rewrite`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
  },

  async sendRuntimeDirection(projectId: string, input: { runId?: string; direction: string }): Promise<{ run: RuntimeRun | null; command: RuntimeCommand }> {
    return request<{ run: RuntimeRun | null; command: RuntimeCommand }>(`/api/novel/projects/${projectId}/runtime/direction`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
  },

  async createRuntimeDerivative(
    projectId: string,
    input: { baseRunId?: string; sourceChapterId?: string; type?: "side_story" | "branch" | "adaptation"; title: string; direction?: string }
  ): Promise<{ branch: RuntimeDerivativeBranch; run: RuntimeRun; command: RuntimeCommand }> {
    return request<{ branch: RuntimeDerivativeBranch; run: RuntimeRun; command: RuntimeCommand }>(`/api/novel/projects/${projectId}/runtime/derivatives`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
  },

  async mergeRuntimeDerivative(
    projectId: string,
    branchId: string,
    input: { note?: string; mode?: "new_chapter" | "replace_source_chapter"; draftContent?: string } = {}
  ): Promise<{ branch: RuntimeDerivativeBranch; run?: RuntimeRun; merged: boolean; chapterId?: string }> {
    return request<{ branch: RuntimeDerivativeBranch; run?: RuntimeRun; merged: boolean; chapterId?: string }>(
      `/api/novel/projects/${projectId}/runtime/derivatives/${branchId}/merge`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(input)
      }
    );
  },

  async restoreRuntimeCheckpoint(projectId: string, checkpointId: string): Promise<{ checkpoint: RuntimeCheckpoint; restored: boolean }> {
    return request<{ checkpoint: RuntimeCheckpoint; restored: boolean }>(
      `/api/novel/projects/${projectId}/runtime/checkpoints/${checkpointId}/restore`,
      { method: "POST" }
    );
  },

  async saveChapterDashboard(projectId: string, dashboard: ChapterDashboard): Promise<ChapterDashboard> {
    const data = await request<{ dashboard: ChapterDashboard }>(
      `/api/novel/projects/${projectId}/dashboard/${dashboard.chapterId}`,
      {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify({ dashboard })
      }
    );
    return data.dashboard;
  },

  async readSceneCards(projectId: string, chapterId: string): Promise<SceneCard[]> {
    const data = await request<{ scenes: SceneCard[] }>(`/api/novel/projects/${projectId}/scenes/${chapterId}`);
    return data.scenes;
  },

  async saveSceneCards(projectId: string, chapterId: string, scenes: SceneCard[]): Promise<SceneCard[]> {
    const data = await request<{ scenes: SceneCard[] }>(`/api/novel/projects/${projectId}/scenes/${chapterId}`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ scenes })
    });
    return data.scenes;
  },

  async readStoryControl(projectId: string): Promise<StoryControl> {
    const data = await request<{ storyControl: StoryControl }>(`/api/novel/projects/${projectId}/story-control`);
    return data.storyControl;
  },

  async saveStoryControl(projectId: string, storyControl: StoryControl): Promise<StoryControl> {
    const data = await request<{ storyControl: StoryControl }>(`/api/novel/projects/${projectId}/story-control`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ storyControl })
    });
    return data.storyControl;
  },

  async readStoryGraph(projectId: string): Promise<StoryGraphProjection> {
    const data = await request<{ graph: StoryGraphProjection }>(`/api/novel/projects/${projectId}/story-graph`);
    return data.graph;
  },

  async readKnowledgeIndex(projectId: string): Promise<KnowledgeIndexProjection> {
    const data = await request<{ index: KnowledgeIndexProjection }>(`/api/novel/projects/${projectId}/knowledge/index`);
    return data.index;
  },

  async rebuildKnowledgeIndex(projectId: string): Promise<KnowledgeIndexProjection> {
    const data = await request<{ index: KnowledgeIndexProjection }>(`/api/novel/projects/${projectId}/knowledge/index/rebuild`, {
      method: "POST"
    });
    return data.index;
  },

  async searchKnowledgeIndex(projectId: string, input: KnowledgeSearchQuery): Promise<KnowledgeSearchResult> {
    const data = await request<{ result: KnowledgeSearchResult }>(`/api/novel/projects/${projectId}/knowledge/search`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.result;
  },

  async createMemoryRetrievalPreview(projectId: string, input: KnowledgeSearchQuery & { maxResults?: number }): Promise<MemoryRetrievalPreview> {
    const data = await request<{ preview: MemoryRetrievalPreview }>(`/api/novel/projects/${projectId}/memory/retrieval-previews`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
    return data.preview;
  },

  async readMemoryRetrievalPreview(projectId: string, retrievalId: string): Promise<MemoryRetrievalPreview> {
    const data = await request<{ preview: MemoryRetrievalPreview }>(`/api/novel/projects/${projectId}/memory/retrievals/${retrievalId}`);
    return data.preview;
  },

  async createMemoryHealthReport(projectId: string): Promise<MemoryHealthReport> {
    const data = await request<{ report: MemoryHealthReport }>(`/api/novel/projects/${projectId}/memory/health-reports`, { method: "POST" });
    return data.report;
  },

  async readMemoryHealthReport(projectId: string, reportId: string): Promise<MemoryHealthReport> {
    const data = await request<{ report: MemoryHealthReport }>(`/api/novel/projects/${projectId}/memory/health-reports/${reportId}`);
    return data.report;
  },

  async createMemoryReadyProof(projectId: string, input: { healthReportId: string; retrievalId: string; continuityAuditId?: string; targetChapterId: string }): Promise<MemoryReadyProof> {
    const data = await request<{ proof: MemoryReadyProof }>(`/api/novel/projects/${projectId}/memory/ready-proofs`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.proof;
  },

  async readMemoryReadyProof(projectId: string, proofId: string): Promise<MemoryReadyProof> {
    const data = await request<{ proof: MemoryReadyProof }>(`/api/novel/projects/${projectId}/memory/ready-proofs/${proofId}`);
    return data.proof;
  },

  async createMemoryContinuityAudit(projectId: string, input: { healthReportId: string }): Promise<LongContinuityAudit> {
    const data = await request<{ audit: LongContinuityAudit }>(`/api/novel/projects/${projectId}/memory/continuity-audits`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    return data.audit;
  },

  async readMemoryContinuityAudit(projectId: string, auditId: string): Promise<LongContinuityAudit> {
    const data = await request<{ audit: LongContinuityAudit }>(`/api/novel/projects/${projectId}/memory/continuity-audits/${auditId}`);
    return data.audit;
  },

  async readLedgerEntries(projectId: string, kind: LedgerEntry["kind"]): Promise<LedgerEntry[]> {
    const data = await request<{ entries: LedgerEntry[] }>(`/api/novel/projects/${projectId}/ledger/${kind}`);
    return data.entries;
  },

  async saveLedgerEntries(projectId: string, kind: LedgerEntry["kind"], entries: LedgerEntry[]): Promise<LedgerEntry[]> {
    const data = await request<{ entries: LedgerEntry[] }>(`/api/novel/projects/${projectId}/ledger/${kind}`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ entries })
    });
    return data.entries;
  },

  async readChapterSummary(projectId: string, chapterId: string): Promise<ChapterSummary> {
    const data = await request<{ summary: ChapterSummary }>(
      `/api/novel/projects/${projectId}/memory/chapter-summaries/${chapterId}`
    );
    return data.summary;
  },

  async saveChapterSummary(projectId: string, chapterId: string, summary: ChapterSummary): Promise<ChapterSummary> {
    const data = await request<{ summary: ChapterSummary }>(
      `/api/novel/projects/${projectId}/memory/chapter-summaries/${chapterId}`,
      {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify({ summary })
      }
    );
    return data.summary;
  },

  async readChapterQualityReport(projectId: string, chapterId: string): Promise<ChapterQualityReport | null> {
    const data = await request<{ report: ChapterQualityReport | null }>(`/api/novel/projects/${projectId}/quality/${chapterId}`);
    return data.report;
  },

  async readSeriesQualityMetrics(projectId: string): Promise<SeriesQualityMetrics> {
    const data = await request<{ seriesMetrics: SeriesQualityMetrics }>(`/api/novel/projects/${projectId}/quality/series-metrics`);
    return data.seriesMetrics;
  },

  async saveChapterQualityReport(
    projectId: string,
    report: ChapterQualityReport
  ): Promise<{ report: ChapterQualityReport; seriesMetrics: SeriesQualityMetrics }> {
    return request<{ report: ChapterQualityReport; seriesMetrics: SeriesQualityMetrics }>(`/api/novel/projects/${projectId}/quality/${report.chapterId}`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ report })
    });
  },

  async acceptWritingRecap(
    projectId: string,
    recap: WritingRecapCandidate
  ): Promise<{ summary: ChapterSummary }> {
    return request<{ summary: ChapterSummary }>(`/api/novel/projects/${projectId}/recaps/accept`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ recap })
    });
  },

  async runTask(projectId: string, type: CodexTaskType, payload: Record<string, unknown>): Promise<NovelTask> {
    const data = await request<{ task: NovelTask }>(`/api/novel/projects/${projectId}/tasks`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ type, payload })
    });
    return data.task;
  },

  async listTasks(projectId: string): Promise<NovelTask[]> {
    const data = await request<{ tasks: NovelTask[] }>(`/api/novel/projects/${projectId}/tasks`);
    return data.tasks;
  },

  async startTask(projectId: string, type: CodexTaskType, payload: Record<string, unknown>): Promise<NovelTask> {
    const data = await request<{ task: NovelTask }>(`/api/novel/projects/${projectId}/tasks/async`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ type, payload })
    });
    return data.task;
  },

  async readTask(projectId: string, taskId: string): Promise<NovelTask> {
    const data = await request<{ task: NovelTask }>(`/api/novel/projects/${projectId}/tasks/${taskId}`);
    return data.task;
  },

  async cancelTask(projectId: string, taskId: string): Promise<NovelTask> {
    const data = await request<{ task: NovelTask }>(`/api/novel/projects/${projectId}/tasks/${taskId}/cancel`, {
      method: "POST"
    });
    return data.task;
  },

  async readAiInvocations(projectId: string): Promise<AiInvocationSession[]> {
    const data = await request<{ invocations: AiInvocationSession[] }>(`/api/novel/projects/${projectId}/tasks/invocations`);
    return data.invocations;
  },

  async readProjectAuditReport(projectId: string): Promise<ProjectAuditReport> {
    const data = await request<{ report: ProjectAuditReport }>(`/api/novel/projects/${projectId}/audit-report`);
    return data.report;
  },

  async listBackgroundJobs(projectId: string): Promise<BackgroundJob[]> {
    const data = await request<{ jobs: BackgroundJob[] }>(`/api/novel/projects/${projectId}/jobs`);
    return data.jobs;
  },

  async readBackgroundJob(projectId: string, jobId: string): Promise<BackgroundJob> {
    const data = await request<{ job: BackgroundJob }>(`/api/novel/projects/${projectId}/jobs/${jobId}`);
    return data.job;
  },

  async startBackgroundJob(projectId: string, type: BackgroundJobType, payload: Record<string, unknown> = {}): Promise<BackgroundJob> {
    const data = await request<{ job: BackgroundJob }>(`/api/novel/projects/${projectId}/jobs`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ type, payload })
    });
    return data.job;
  },

  async cancelBackgroundJob(projectId: string, jobId: string): Promise<BackgroundJob> {
    const data = await request<{ job: BackgroundJob }>(`/api/novel/projects/${projectId}/jobs/${jobId}/cancel`, {
      method: "POST"
    });
    return data.job;
  },

  async retryBackgroundJob(projectId: string, jobId: string): Promise<BackgroundJob> {
    const data = await request<{ job: BackgroundJob }>(`/api/novel/projects/${projectId}/jobs/${jobId}/retry`, {
      method: "POST"
    });
    return data.job;
  },

  async polishSelection(projectId: string, selection: EditorSelection & { chapterId: string; mode: string }): Promise<NovelTask> {
    const data = await request<{ task: NovelTask }>(`/api/novel/projects/${projectId}/selection/polish`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(selection)
    });
    return data.task;
  },

  async applyPatches(projectId: string, patches: NovelFilePatch[], taskId?: string): Promise<void> {
    await request(`/api/novel/projects/${projectId}/patches`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ patches, taskId })
    });
  }
};
