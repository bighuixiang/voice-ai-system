import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { novelApi } from "@/services/novelApi";
import { errorText } from "@/utils/novelLabels";
import {
  analyzeChapterQuality as analyzeChapterQualityHelper,
  chapterOrdinal as chapterOrdinalHelper
} from "@/stores/novel/quality";
import {
  buildSceneCardsFromDraft as buildSceneCardsFromDraftHelper,
  buildSceneCardsFromIdea as buildSceneCardsFromIdeaHelper,
  countDraftWords as countDraftWordsHelper,
  inferPov as inferPovHelper,
  pickConflict as pickConflictHelper,
  splitTextUnits as splitTextUnitsHelper
} from "@/stores/novel/structure";
import type {
  AiAgentCheckResult,
  AiAgentProfile,
  AiInvocationSession,
  AiStageDefinition,
  ChapterDashboard,
  ChapterSummary,
  ChapterQualityMetric,
  ChapterQualityReport,
  CreativeSession,
  CreativeJourneyProjection,
  StoryBlueprint,
  StoryBlueprintContent,
  ContractAdoptionProposal,
  StoryContractCandidate,
  OutlineCandidate,
  OutlineValidationReport,
  OutlineAdoptionProposal,
  ExecutionReadyProof,
  ExecutionReadinessDecision,
  ExecutionWorkItem,
  BookRun,
  CompletionAudit,
  EditionManifest,
  PublicationTree,
  PublicationArtifactSet,
  DeliveryProofVerification,
  DeliveryProof,
  ProseRepairPlan,
  ProseRepairCandidate,
  ProseRepairRegression,
  ReleasePreflightReport,
  ReleaseActivation,
  LengthContract,
  LengthForecast,
  LengthVarianceDecision,
  UnderstandingPreview,
  DialogueQuestion,
  ContextManifest,
  CreationRuntimeSnapshot,
  CodexTaskResult,
  CodexTaskType,
  ChapterDocumentKind,
  CreationLoopAction,
  CreationLoopStep,
  EditorSuggestion,
  EditorSuggestionRequest,
  EditorSelection,
  BackgroundJob,
  BackgroundJobType,
  FileDiffResult,
  FileVersionSnapshot,
  FocusWritingGuide,
  KnowledgeIndexProjection,
  KnowledgeSearchResult,
  MemoryRetrievalPreview,
  MemoryHealthReport,
  MemoryReadyProof,
  LongContinuityAudit,
  LedgerEntry,
  NovelFilePatch,
  NovelChapter,
  NovelProject,
  NovelTask,
  PlatformAiConfig,
  PlatformAsset,
  PlatformAssetType,
  PlatformLibrary,
  PlotPilotLearningItem,
  ProjectAuditReport,
  QualityImprovementState,
  QualityMetricKey,
  RuntimeCheckpoint,
  RuntimeDerivativeBranch,
  RuntimeEvent,
  RuntimeRun,
  RuntimeStatusSnapshot,
  RuntimeWorkerHealth,
  SceneCard,
  SavePipelineStep,
  SavePipelineStepId,
  SavePipelineStepStatus,
  SeriesQualityMetrics,
  StoryControl,
  StoryGraphProjection,
  StyleToneKey,
  TaskProgressStep,
  WorkbenchCommand,
  WorkbenchNextAction,
  WorkbenchSourceRef,
  WorkbenchRiskSignal,
  WritingMode,
  EmotionLedger,
  WritingRecapCandidate
  ,ProseCandidate,
  ProseAdoptionReadiness,
  ProseAdoptionTransaction,
  ChapterSettlement,
  QualityCalibrationEvidence,
  ReleaseAcceptanceDecision,
  UnderstandingReview,
  MigrationCutoverReport,
  MigrationBatchValidationReport,
  ProseValidationBundle,
  RedBlueReview,
  AuthorFeedbackEvent,
  FeedbackAttribution,
  PreferenceHypothesis
  ,LearningPolicy,
  ExplorationBudget
  ,CraftPattern,
  CraftExperiment,
  CharacterDramaticContract
  ,CharacterStateSnapshot
} from "@/types/novel";

type LedgerKind = LedgerEntry["kind"];
const DEFAULT_FOCUS_TARGET_WORDS = 3000;
const aiScenarioKeys = ["novel", "assets", "script", "image-generation", "video-generation"] as const;

interface WorkspaceCache {
  project: NovelProject;
  chapterId: string | null;
  documentKind: ChapterDocumentKind;
  filePath: string;
  content: string;
  savedContent: string;
  lastSavedAt: string;
  selection: EditorSelection | null;
  rewriteSelection: EditorSelection | null;
  currentTask: NovelTask | null;
  taskProgress: TaskProgressStep[];
  taskHistory: NovelTask[];
  aiInvocations: AiInvocationSession[];
  rewriteCandidate: CodexTaskResult | null;
  recapCandidate: WritingRecapCandidate | null;
  qualityReport: ChapterQualityReport | null;
  seriesQualityMetrics: SeriesQualityMetrics | null;
  styleTone: StyleToneKey;
  focusTargetWords: number;
  focusDraftInstruction: string;
  dashboard: ChapterDashboard | null;
  chapterSummary: ChapterSummary | null;
  runtimeSnapshot: CreationRuntimeSnapshot | null;
  sceneCards: SceneCard[];
  storyControl: StoryControl | null;
  storyGraph: StoryGraphProjection | null;
  knowledgeIndex: KnowledgeIndexProjection | null;
  structureIdeaInput: string;
  structureDraftVersion: number;
  ledgerKind: LedgerKind;
  ledgerEntries: LedgerEntry[];
  writingMode: WritingMode;
  supportPath: string;
  supportContent: string;
  savedSupportContent: string;
}

interface WorkspaceSwitchOptions {
  skipLeaveCheck?: boolean;
}

interface ReverseStructurePayload {
  dashboard?: Partial<ChapterDashboard>;
  scenes?: Array<Partial<SceneCard>>;
  sceneCards?: Array<Partial<SceneCard>>;
}

interface WorkspaceLoadState {
  requestId: number;
  projectSlug: string;
}

interface ChapterLoadState extends WorkspaceLoadState {
  chapterId: string;
  filePath: string;
}

interface SupportFileLoadState extends WorkspaceLoadState {
  filePath: string;
}

interface StoredWorkspacePreference {
  chapterId?: string | null;
  documentKind?: ChapterDocumentKind;
}

const workspacePreferenceStorageKey = "voice-ai-novel-workspace";
const retrievalPreviewStorageKey = "voice-ai-novel-retrieval-previews";
const memoryGovernanceStorageKey = "voice-ai-novel-memory-governance";

function makeDefaultPlatformAiConfig(): PlatformAiConfig {
  return {
    version: 1,
    defaultScenario: "novel",
    scenarios: aiScenarioKeys.reduce(
      (scenarios, key) => ({
        ...scenarios,
        [key]: { profileId: "codex-cli" }
      }),
      {} as PlatformAiConfig["scenarios"]
    ),
    knowledgeEmbedding: {
      provider: "local",
      baseUrl: "https://api.openai.com/v1",
      model: "text-embedding-3-small",
      apiKeyConfigured: false
    },
    updatedAt: new Date().toISOString()
  };
}

function normalizeStoredDocumentKind(value?: string | null): ChapterDocumentKind {
  return value === "outline" ? "outline" : "content";
}

function readStoredWorkspacePreferences(): Record<string, StoredWorkspacePreference> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(workspacePreferenceStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredWorkspacePreference>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readStoredWorkspacePreference(projectSlug: string): StoredWorkspacePreference {
  return readStoredWorkspacePreferences()[projectSlug] || {};
}

function writeStoredWorkspacePreference(projectSlug: string, nextPreference: StoredWorkspacePreference) {
  if (typeof window === "undefined") {
    return;
  }
  const stored = readStoredWorkspacePreferences();
  stored[projectSlug] = {
    ...stored[projectSlug],
    ...nextPreference
  };
  window.localStorage.setItem(workspacePreferenceStorageKey, JSON.stringify(stored));
}

function readStoredRetrievalPreviewId(projectSlug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(retrievalPreviewStorageKey) || "{}") as Record<string, unknown>;
    const value = stored[projectSlug];
    return typeof value === "string" && /^retrieval-[a-f0-9]{24}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStoredRetrievalPreviewId(projectSlug: string, retrievalId: string | null) {
  if (typeof window === "undefined") return;
  try {
    const stored = JSON.parse(window.localStorage.getItem(retrievalPreviewStorageKey) || "{}") as Record<string, unknown>;
    if (retrievalId) stored[projectSlug] = retrievalId;
    else delete stored[projectSlug];
    window.localStorage.setItem(retrievalPreviewStorageKey, JSON.stringify(stored));
  } catch {
    // localStorage is an optional recovery hint; server state remains authoritative.
  }
}

interface StoredMemoryGovernanceIds {
  healthReportId?: string;
  readyProofId?: string;
  continuityAuditId?: string;
}

function readStoredMemoryGovernanceIds(projectSlug: string): StoredMemoryGovernanceIds {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(memoryGovernanceStorageKey) || "{}") as Record<string, StoredMemoryGovernanceIds>;
    return stored[projectSlug] || {};
  } catch {
    return {};
  }
}

function writeStoredMemoryGovernanceIds(projectSlug: string, ids: StoredMemoryGovernanceIds) {
  if (typeof window === "undefined") return;
  try {
    const stored = JSON.parse(window.localStorage.getItem(memoryGovernanceStorageKey) || "{}") as Record<string, StoredMemoryGovernanceIds>;
    stored[projectSlug] = ids;
    window.localStorage.setItem(memoryGovernanceStorageKey, JSON.stringify(stored));
  } catch {
    // localStorage is only a recovery hint; server files remain authoritative.
  }
}

function resolvePreferredChapter(project: NovelProject, preferredChapterId?: string | null): NovelChapter | null {
  return (
    project.chapters.find((chapter) => chapter.id === preferredChapterId) ||
    project.chapters.find((chapter) => chapter.id === project.lastOpenedChapterId) ||
    project.chapters[0] ||
    null
  );
}

export const useNovelStore = defineStore("novel", () => {
  const projects = ref<NovelProject[]>([]);
  const openWorkspaceSlugs = ref<string[]>([]);
  const workspaceCache = ref<Record<string, WorkspaceCache>>({});
  const currentProject = ref<NovelProject | null>(null);
  const creativeSession = ref<CreativeSession | null>(null);
  const creativeJourney = ref<CreativeJourneyProjection | null>(null);
  const activeStoryBlueprint = ref<StoryBlueprint | null>(null);
  const storyBlueprintLoadError = ref("");
  const isLoadingStoryBlueprint = ref(false);
  let storyBlueprintLoadVersion = 0;
  const isAdvancingAuthorJourney = ref(false);
  const authorJourneyError = ref("");
  const understandingPreview = ref<UnderstandingPreview | null>(null);
  const dialogueQuestions = ref<DialogueQuestion[]>([]);
  const activeDialogueQuestion = computed(() => dialogueQuestions.value.find((question) => question.status === "active") || null);
  const isLoadingDialogueQuestions = ref(false);
  const dialogueQuestionsError = ref("");
  let dialogueQuestionLoadVersion = 0;
  const contextManifest = ref<ContextManifest | null>(null);
  const isFreezingContextManifest = ref(false);
  const isLoadingCreativeSession = ref(false);
  const isSubmittingCreativeMessage = ref(false);
  const creativeSessionError = ref("");
  const contractCandidates = ref<StoryContractCandidate[]>([]);
  const isLoadingContractCandidates = ref(false);
  const contractCandidatesError = ref("");
  const lastContractDecisionId = ref("");
  const contractAdoptionProposal = ref<ContractAdoptionProposal | null>(null);
  const isCreatingContractAdoptionProposal = ref(false);
  const contractAdoptionError = ref("");
  const outlineCandidates = ref<OutlineCandidate[]>([]);
  const outlineValidationReports = ref<Record<string, OutlineValidationReport>>({});
  const isLoadingOutlineCandidates = ref(false);
  const validatingOutlineId = ref("");
  const outlineCandidatesError = ref("");
  const outlineChapterSelections = ref<Record<string, string[]>>({});
  const outlineAdoptionProposal = ref<OutlineAdoptionProposal | null>(null);
  const isAdoptingOutline = ref(false);
  const outlineAdoptionError = ref("");
  const executionReadyProof = ref<ExecutionReadyProof | null>(null);
  const executionReadiness = ref<ExecutionReadinessDecision | null>(null);
  const isLoadingExecutionReadiness = ref(false);
  const executionReadinessError = ref("");
  const executionWorkItems = ref<ExecutionWorkItem[]>([]);
  const isLoadingExecutionWorkItems = ref(false);
  const bookRuns = ref<BookRun[]>([]);
  const activeBookRun = ref<BookRun | null>(null);
  const bookRunError = ref("");
  const isLoadingBookRun = ref(false);
  const completionAudit = ref<CompletionAudit | null>(null);
  const publicationEdition = ref<EditionManifest | null>(null);
  const publicationTree = ref<PublicationTree | null>(null);
  const publicationArtifacts = ref<PublicationArtifactSet | null>(null);
  const deliveryProofVerification = ref<DeliveryProofVerification | null>(null);
  const publicationPreflight = ref<ReleasePreflightReport | null>(null);
  const publicationEvidenceError = ref("");
  const isLoadingPublicationEvidence = ref(false);
  const deliveryProof = ref<DeliveryProof | null>(null);
  const proseCandidates = ref<ProseCandidate[]>([]);
  const isLoadingProseCandidates = ref(false);
  const proseValidations = ref<Record<string, ProseValidationBundle>>({});
  const proseReviews = ref<Record<string, RedBlueReview>>({});
  const proseRepairPlans = ref<Record<string, ProseRepairPlan>>({});
  const proseRepairCandidates = ref<Record<string, ProseRepairCandidate>>({});
  const proseRepairRegressions = ref<Record<string, ProseRepairRegression>>({});
  const proseAdoptionReadiness = ref<Record<string, ProseAdoptionReadiness>>({});
  const proseAdoptions = ref<Record<string, ProseAdoptionTransaction>>({});
  const proseSettlements = ref<Record<string, ChapterSettlement>>({});
  const feedbackAttributions = ref<Record<string, FeedbackAttribution>>({});
  const preferenceHypotheses = ref<Record<string, PreferenceHypothesis>>({});
  const learningPolicy = ref<LearningPolicy | null>(null);
  const explorationBudgets = ref<Record<string, ExplorationBudget>>({});
  const craftPatterns = ref<CraftPattern[]>([]);
  const craftExperiments = ref<Record<string, CraftExperiment>>({});
  const characterContracts = ref<CharacterDramaticContract[]>([]);
  const characterStateSnapshots = ref<Record<string, CharacterStateSnapshot[]>>({});
  const proseCandidateBusyId = ref("");
  const proseCandidateError = ref("");
  const qualityCalibrationEvidence = ref<QualityCalibrationEvidence | null>(null);
  const qualityCalibrationHistory = ref<QualityCalibrationEvidence[]>([]);
  const isLoadingQualityCalibration = ref(false);
  const qualityCalibrationError = ref("");
  const releaseAcceptanceDecision = ref<ReleaseAcceptanceDecision | null>(null);
  const releaseActivation = ref<ReleaseActivation | null>(null);
  const releaseActivationError = ref("");
  const isActivatingRelease = ref(false);
  const lengthContract = ref<LengthContract | null>(null);
  const lengthForecast = ref<LengthForecast | null>(null);
  const lengthVarianceDecision = ref<LengthVarianceDecision | null>(null);
  const lengthPlanningError = ref("");
  const isLoadingLengthPlanning = ref(false);
  const isLoadingReleaseAcceptance = ref(false);
  const understandingReview = ref<UnderstandingReview | null>(null);
  const isLoadingUnderstandingReview = ref(false);
  const migrationCutoverReport = ref<MigrationCutoverReport | null>(null);
  const migrationValidationReport = ref<MigrationBatchValidationReport | null>(null);
  const isLoadingMigrationCutover = ref(false);
  const currentChapter = ref<NovelChapter | null>(null);
  const currentDocumentKind = ref<ChapterDocumentKind>("content");
  const currentFilePath = ref("");
  const currentContent = ref("");
  const savedContent = ref("");
  const isSavingContent = ref(false);
  const lastSavedAt = ref("");
  const selection = ref<EditorSelection | null>(null);
  const rewriteSelection = ref<EditorSelection | null>(null);
  const currentTask = ref<NovelTask | null>(null);
  const activeTaskType = ref<CodexTaskType | null>(null);
  const activeAsyncTaskId = ref<string | null>(null);
  const taskProgress = ref<TaskProgressStep[]>([]);
  const taskHistory = ref<NovelTask[]>([]);
  const aiInvocations = ref<AiInvocationSession[]>([]);
  const aiStages = ref<AiStageDefinition[]>([]);
  const backgroundJobs = ref<BackgroundJob[]>([]);
  const rewriteCandidate = ref<CodexTaskResult | null>(null);
  const recapCandidate = ref<WritingRecapCandidate | null>(null);
  const currentQualityReport = ref<ChapterQualityReport | null>(null);
  const currentSeriesQualityMetrics = ref<SeriesQualityMetrics | null>(null);
  const styleTone = ref<StyleToneKey>("elegant");
  const focusTargetWords = ref(DEFAULT_FOCUS_TARGET_WORDS);
  const focusDraftInstruction = ref("");
  const currentDashboard = ref<ChapterDashboard | null>(null);
  const currentChapterSummary = ref<ChapterSummary | null>(null);
  const currentRuntimeSnapshot = ref<CreationRuntimeSnapshot | null>(null);
  const runtimeStatus = ref<RuntimeStatusSnapshot | null>(null);
  const runtimeEvents = ref<RuntimeEvent[]>([]);
  const activeRuntimeRun = computed<RuntimeRun | undefined>(() => runtimeStatus.value?.activeRun);
  const activeRuntimeChapter = computed<NovelChapter | undefined>(() => {
    const chapterId = activeRuntimeRun.value?.chapterId;
    if (!chapterId || !currentProject.value) return undefined;
    return currentProject.value.chapters.find((chapter) => chapter.id === chapterId);
  });
  const activeRuntimeChapterLabel = computed(() => activeRuntimeChapter.value?.title || activeRuntimeRun.value?.chapterId || "");
  const runtimeCheckpoints = computed<RuntimeCheckpoint[]>(() => runtimeStatus.value?.checkpoints || []);
  const runtimeBranches = computed<RuntimeDerivativeBranch[]>(() => runtimeStatus.value?.branches || []);
  const latestRuntimeNarrativeSnapshot = computed(() => runtimeStatus.value?.latestSnapshot);
  const runtimeKnowledgeRefs = computed(() => runtimeStatus.value?.knowledgeRefs || []);
  const runtimeWorkerHealth = computed<RuntimeWorkerHealth | undefined>(() => runtimeStatus.value?.worker);
  const isRuntimeEventsConnected = ref(false);
  const isStartingRuntime = ref(false);
  let runtimeStatusRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  const sceneCards = ref<SceneCard[]>([]);
  const storyControl = ref<StoryControl | null>(null);
  const storyGraph = ref<StoryGraphProjection | null>(null);
  const knowledgeIndex = ref<KnowledgeIndexProjection | null>(null);
  const knowledgeSearchResult = ref<KnowledgeSearchResult | null>(null);
  const knowledgeRetrievalPreview = ref<MemoryRetrievalPreview | null>(null);
  const memoryHealthReport = ref<MemoryHealthReport | null>(null);
  const memoryReadyProof = ref<MemoryReadyProof | null>(null);
  const memoryContinuityAudit = ref<LongContinuityAudit | null>(null);
  const isRunningMemoryGovernance = ref(false);
  const structureIdeaInput = ref("");
  const structureDraftVersion = ref(0);
  const activeLedgerKind = ref<LedgerKind>("foreshadowing");
  const ledgerEntries = ref<LedgerEntry[]>([]);
  const writingMode = ref<WritingMode>("structure");
  const isSavingDashboard = ref(false);
  const isSavingScenes = ref(false);
  const isSavingStoryControl = ref(false);
  const isRebuildingKnowledgeIndex = ref(false);
  const isRebuildingSeriesQualityMetrics = ref(false);
  const isImprovingQualityMetrics = ref(false);
  const qualityImprovementState = ref<QualityImprovementState>({
    status: "idle",
    targetMetrics: [],
    changes: [],
    patchCount: 0
  });
  const isRebuildingStoryGraph = ref(false);
  const isSearchingKnowledge = ref(false);
  const isReverseEngineeringStructure = ref(false);
  const agentProfiles = ref<AiAgentProfile[]>([]);
  const agentChecks = ref<AiAgentCheckResult[]>([]);
  const defaultAgentProfileId = ref("codex-cli");
  const isSavingAiConfig = ref(false);
  const platformAiConfig = ref<PlatformAiConfig>(makeDefaultPlatformAiConfig());
  const platformLibrary = ref<PlatformLibrary | null>(null);
  const supportFiles = [
    { label: "角色", path: "bible/characters.md" },
    { label: "世界观", path: "bible/world.md" },
    { label: "力量体系", path: "bible/power-system.md" },
    { label: "地点", path: "bible/locations.md" },
    { label: "文风", path: "style/style-guide.md" },
    { label: "卷纲", path: "outline/volume-01.md" },
    { label: "伏笔", path: "ledger/foreshadowing.md" },
    { label: "连续性", path: "ledger/continuity.md" },
    { label: "升级节奏", path: "ledger/power-progression.md" }
  ];
  const currentSupportPath = ref(supportFiles[0].path);
  const supportContent = ref("");
  const savedSupportContent = ref("");
  const isLoading = ref(false);
  const error = ref("");
  const isExportingAuditReport = ref(false);
  const auditReportPreview = ref<ProjectAuditReport | null>(null);
  const isLoadingAuditReportPreview = ref(false);
  const fileVersions = ref<FileVersionSnapshot[]>([]);
  const currentFileDiff = ref<FileDiffResult | null>(null);
  const isLoadingFileVersions = ref(false);
  const isLoadingFileDiff = ref(false);
  const autoRunSavePipeline = ref(false);
  const savePipelineSteps = ref<SavePipelineStep[]>([]);
  const isRunningSavePipeline = ref(false);
  let runtimeEventSource: EventSource | null = null;
  let workspaceLoadRequestId = 0;
  let chapterLoadRequestId = 0;
  let supportFileLoadRequestId = 0;

  function beginWorkspaceLoad(projectSlug: string): WorkspaceLoadState {
    workspaceLoadRequestId += 1;
    return { requestId: workspaceLoadRequestId, projectSlug };
  }

  function isWorkspaceLoadCurrent(loadState: WorkspaceLoadState) {
    return workspaceLoadRequestId === loadState.requestId && currentProject.value?.slug === loadState.projectSlug;
  }

  function beginChapterLoad(projectSlug: string, chapterId: string, filePath: string): ChapterLoadState {
    chapterLoadRequestId += 1;
    return { requestId: chapterLoadRequestId, projectSlug, chapterId, filePath };
  }

  function isChapterLoadCurrent(loadState: ChapterLoadState) {
    return (
      chapterLoadRequestId === loadState.requestId &&
      currentProject.value?.slug === loadState.projectSlug &&
      currentChapter.value?.id === loadState.chapterId &&
      currentFilePath.value === loadState.filePath
    );
  }

  function beginSupportFileLoad(projectSlug: string, filePath: string): SupportFileLoadState {
    supportFileLoadRequestId += 1;
    return { requestId: supportFileLoadRequestId, projectSlug, filePath };
  }

  function isSupportFileLoadCurrent(loadState: SupportFileLoadState) {
    return (
      supportFileLoadRequestId === loadState.requestId &&
      currentProject.value?.slug === loadState.projectSlug &&
      currentSupportPath.value === loadState.filePath
    );
  }

  function invalidateWorkspaceLoadState() {
    workspaceLoadRequestId += 1;
    chapterLoadRequestId += 1;
    supportFileLoadRequestId += 1;
  }

  const hasProject = computed(() => currentProject.value !== null);
  const openWorkspaceProjects = computed(() =>
    openWorkspaceSlugs.value
      .map((slug) => projects.value.find((project) => project.slug === slug))
      .filter((project): project is NovelProject => Boolean(project))
  );
  const hasUnsavedChanges = computed(() => currentContent.value !== savedContent.value);
  const currentDocumentLabel = computed(() => (currentDocumentKind.value === "content" ? "章节正文" : "章纲设定"));
  const currentSaveStateLabel = computed(() => {
    if (isSavingContent.value) return "保存中";
    if (hasUnsavedChanges.value) return "有未保存修改";
    if (lastSavedAt.value) return `已保存 ${lastSavedAt.value}`;
    return "已保存";
  });
  const hasUnsavedSupportChanges = computed(() => supportContent.value !== savedSupportContent.value);
  const canUseSelection = computed(() => Boolean(selection.value?.selectedText));
  const canTuneSelection = computed(() => Boolean(selection.value?.selectedText?.trim()));
  const activeRewriteSelection = computed(() => rewriteSelection.value || selection.value);
  const rewriteCandidateTargetsCurrentFile = computed(() =>
    Boolean(
      currentFilePath.value &&
        rewriteCandidate.value?.patches.some(
          (patch) => patch.target === currentFilePath.value && patch.mode === "replace-file" && Boolean(patch.content?.trim())
        )
    )
  );
  const rewriteComparisonOriginalText = computed(() =>
    rewriteCandidateTargetsCurrentFile.value ? currentContent.value : activeRewriteSelection.value?.selectedText || ""
  );
  const rewriteComparisonEmptyOriginalText = computed(() =>
    rewriteCandidateTargetsCurrentFile.value ? "当前章节正文为空，无法形成整章对比。" : "当前没有选区，不能直接接受为选区改写。"
  );
  const rewritePatchApplyLabel = computed(() =>
    rewriteCandidateTargetsCurrentFile.value ? "应用整章改造" : "应用补丁"
  );
  const canAcceptSelectedRewrite = computed(() =>
    Boolean(activeRewriteSelection.value?.selectedText && rewriteCandidate.value?.content)
  );
  const canDiagnoseChapter = computed(() => currentDocumentKind.value === "content" && countDraftWordsHelper(currentContent.value) >= 30);
  const qualityTargetScore = 86;
  const qualityMaxScore = 100;
  const qualityMetricsBelowTarget = computed<ChapterQualityMetric[]>(() =>
    [...(currentQualityReport.value?.metrics || [])]
      .filter((metric) => metric.score < qualityTargetScore)
      .sort((left, right) => left.score - right.score)
  );
  function lineChangeStats(before: string, after: string) {
    const beforeLines = before.split(/\r?\n/);
    const afterLines = after.split(/\r?\n/);
    let prefix = 0;
    while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) {
      prefix += 1;
    }
    let suffix = 0;
    while (
      suffix + prefix < beforeLines.length &&
      suffix + prefix < afterLines.length &&
      beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
    ) {
      suffix += 1;
    }
    return {
      added: Math.max(0, afterLines.length - prefix - suffix),
      removed: Math.max(0, beforeLines.length - prefix - suffix)
    };
  }

  function buildQualityImprovementChanges(before: string, after: string, result?: CodexTaskResult | null) {
    const changes = (result?.changes || []).map((item) => item.trim()).filter(Boolean);
    const beforeWords = countDraftWords(before);
    const afterWords = countDraftWords(after);
    const wordDelta = afterWords - beforeWords;
    const beforeParagraphs = before.split(/\n\s*\n/).filter((item) => item.trim()).length;
    const afterParagraphs = after.split(/\n\s*\n/).filter((item) => item.trim()).length;
    const stats = lineChangeStats(before, after);
    const measuredChanges = [
      wordDelta === 0 ? `字数未变化（${afterWords} 字）` : `字数 ${wordDelta > 0 ? "+" : ""}${wordDelta}（${beforeWords} -> ${afterWords}）`,
      beforeParagraphs === afterParagraphs
        ? `段落数未变化（${afterParagraphs} 段）`
        : `段落 ${afterParagraphs - beforeParagraphs > 0 ? "+" : ""}${afterParagraphs - beforeParagraphs}（${beforeParagraphs} -> ${afterParagraphs}）`,
      `候选稿改动区约 ${stats.removed} 行旧内容 / ${stats.added} 行新内容`
    ];
    if (before.trim() === after.trim()) {
      measuredChanges.unshift("候选稿与当前正文几乎一致，建议重新生成或提高改造要求。");
    }
    return [...changes, ...measuredChanges].slice(0, 8);
  }

  function setQualityImprovementState(next: Partial<QualityImprovementState>) {
    qualityImprovementState.value = {
      ...qualityImprovementState.value,
      ...next,
      updatedAt: new Date().toISOString()
    };
  }
  const canImproveQualityMetrics = computed(
    () =>
      Boolean(currentProject.value && currentChapter.value && currentFilePath.value && currentDocumentKind.value === "content") &&
      qualityMetricsBelowTarget.value.length > 0 &&
      !isLoading.value &&
      !isSavingContent.value &&
      !isImprovingQualityMetrics.value
  );
  const canReverseEngineerStructure = computed(
    () =>
      currentDocumentKind.value === "content" &&
      currentContent.value.replace(/\s+/g, "").length >= 20 &&
      !isLoading.value &&
      !isReverseEngineeringStructure.value
  );
  const canRequestFocusDraft = computed(() => Boolean(currentProject.value && currentChapter.value && !isLoading.value));
  const canRequestStoryOrchestration = computed(() => Boolean(currentProject.value && storyControl.value && !isLoading.value));
  const activeNovelAiConfig = computed(() => platformAiConfig.value.scenarios.novel);
  const activeNovelAgentProfile = computed(() =>
    agentProfiles.value.find((profile) => profile.id === activeNovelAiConfig.value.profileId)
  );
  const activeNovelAgentCheck = computed(() => agentChecks.value.find((check) => check.profileId === activeNovelAiConfig.value.profileId));
  const activeNovelAiSummary = computed(() => {
    const profileLabel = activeNovelAgentProfile.value?.label || activeNovelAiConfig.value.profileId || "Codex CLI";
    const modelLabel =
      activeNovelAgentProfile.value?.models.find((model) => model.id === activeNovelAiConfig.value.modelId)?.label ||
      activeNovelAiConfig.value.modelId ||
      "默认模型";
    return `${profileLabel} · ${modelLabel}`;
  });
  const currentWordCount = computed(() => countDraftWordsHelper(currentContent.value));
  const focusProgressPercent = computed(() => {
    if (!focusTargetWords.value) return 0;
    return clampScore((currentWordCount.value / focusTargetWords.value) * 100);
  });
  const hasChapterStructure = computed(() =>
    Boolean(
      currentDashboard.value?.goal ||
        currentDashboard.value?.pov ||
        currentDashboard.value?.mainConflict ||
        currentDashboard.value?.endingHook ||
        sceneCards.value.length
    )
  );
  const hasDraftContent = computed(() => currentWordCount.value >= 30);
  const hasSavedDraftContent = computed(() => hasDraftContent.value && !hasUnsavedChanges.value);
  const hasChapterQualityReport = computed(
    () => Boolean(currentQualityReport.value && currentQualityReport.value.chapterId === (currentChapter.value?.id || currentDashboard.value?.chapterId))
  );
  const hasAcceptedLedgerForCurrentChapter = computed(() => {
    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId;
    return Boolean(chapterId && ledgerEntries.value.some((entry) => entry.chapterIds.includes(chapterId)));
  });
  const hasWritingRecapTaskForCurrentChapter = computed(() => {
    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId;
    return Boolean(
      chapterId &&
        taskHistory.value.some(
          (task) =>
            task.type === "writing.recap" &&
            task.status === "success" &&
            (task.inputSummary.includes(chapterId) || task.result?.content.includes(chapterId))
        )
    );
  });
  function emotionLedgerCount(ledger?: Partial<EmotionLedger>): number {
    return (
      (ledger?.wounds?.length || 0) +
      (ledger?.boons?.length || 0) +
      (ledger?.powerShifts?.length || 0) +
      (ledger?.openLoops?.length || 0)
    );
  }
  const pendingEmotionLedgerCount = computed(() => emotionLedgerCount(recapCandidate.value?.emotionLedgerPatch));
  const acceptedEmotionLedgerCount = computed(() => emotionLedgerCount(currentChapterSummary.value?.emotionLedger));
  const radarBackgroundJobLabels: Record<BackgroundJobType, string> = {
    "knowledge.index.rebuild": "知识索引",
    "quality.series.rebuild": "质量趋势",
    "story.graph.rebuild": "故事图谱"
  };
  const radarSavePipelineLabels: Record<SavePipelineStepId, string> = {
    save: "保存",
    recap: "回顾",
    runtime: "运行态",
    quality: "质量",
    knowledge: "索引",
    story: "图谱"
  };
  function latestBackgroundJob(type: BackgroundJobType): BackgroundJob | undefined {
    return backgroundJobs.value
      .filter((job) => job.type === type)
      .sort((left, right) => Date.parse(right.updatedAt || right.startedAt) - Date.parse(left.updatedAt || left.startedAt))[0];
  }
  function backgroundJobSignals(types: BackgroundJobType[]): string[] {
    return types.flatMap((type) => {
      const job = latestBackgroundJob(type);
      if (!job) return [];
      const label = radarBackgroundJobLabels[type];
      if (job.status === "error") return [`${label}失败`];
      if (job.status === "running" || job.status === "pending") return [`${label}后台中`];
      if (job.status === "cancelled") return [`${label}已取消`];
      return [];
    });
  }
  function savePipelineSignals(ids: SavePipelineStepId[]): string[] {
    if (!savePipelineSteps.value.length) return [];
    return ids.flatMap((id) => {
      const step = savePipelineSteps.value.find((item) => item.id === id);
      if (!step) return [];
      const label = radarSavePipelineLabels[id];
      if (step.status === "error") return [`${label}失败`];
      if (step.status === "running") return [`${label}进行中`];
      if (step.status === "queued") return [`${label}后台队列`];
      if (step.status === "skipped") return [`${label}跳过`];
      return [];
    });
  }
  const latestAiInvocation = computed(() =>
    [...aiInvocations.value].sort(
      (left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt)
    )[0]
  );
  const abnormalAppearanceSignals = computed(
    () =>
      storyGraph.value?.characterRelations?.appearanceSignals.filter((signal) =>
        ["should-appear", "overexposed", "absent"].includes(signal.status)
      ) || []
  );
  function sourceRef(id: string, label: string, value?: string | number, kind?: WorkbenchSourceRef["kind"]): WorkbenchSourceRef {
    return {
      id,
      label,
      value: typeof value === "number" ? String(value) : value,
      kind
    };
  }
  function auditCommand(): WorkbenchCommand {
    return { type: "open-audit-report", section: "ai-control-plane" };
  }
  function storyGraphCommand(signal = abnormalAppearanceSignals.value[0]): WorkbenchCommand {
    return {
      type: "open-story-graph",
      characterId: signal?.characterId,
      nodeId: signal?.characterId,
      appearanceStatus: signal?.status,
      reason: signal ? `${signal.name} ${signal.status}` : undefined
    };
  }
  const recapStateSignals = computed(() => {
    const signals: string[] = [];
    if (pendingEmotionLedgerCount.value) signals.push(`情绪待入账 ${pendingEmotionLedgerCount.value}`);
    if (recapCandidate.value?.summaryPatch?.keyEvents?.length) signals.push(`事件 ${recapCandidate.value.summaryPatch.keyEvents.length}`);
    if (recapCandidate.value?.ledgerPatches?.length) signals.push(`账本补丁 ${recapCandidate.value.ledgerPatches.length}`);
    if (acceptedEmotionLedgerCount.value) signals.push(`情绪已沉淀 ${acceptedEmotionLedgerCount.value}`);
    return signals;
  });
  const runtimeNarrativeDebtSignals = computed(() => {
    const debt = currentRuntimeSnapshot.value?.signals.narrativeDebt;
    if (!debt?.debtCount) return [];
    const label = debt.severity === "blocked" ? "叙事债务需交付" : debt.severity === "watch" ? "叙事债务观察" : "叙事债务稳定";
    const parts = [`${label} ${debt.debtCount}`];
    if (debt.overdueCount) parts.push(`逾期 ${debt.overdueCount}`);
    if (debt.riskCount) parts.push(`风险 ${debt.riskCount}`);
    if (debt.openLoopCount) parts.push(`情绪回路 ${debt.openLoopCount}`);
    return [parts.join(" / ")];
  });
  const creationLoopSteps = computed<CreationLoopStep[]>(() => {
    const savedDraftBlocked = !hasSavedDraftContent.value;
    return [
      {
        id: "structure",
        label: "结构",
        status: hasChapterStructure.value ? "done" : writingMode.value === "structure" ? "active" : "waiting",
        detail: hasChapterStructure.value ? "仪表盘/场景卡已形成写作约束" : "先从想法或正文反写章节骨架",
        metric: sceneCards.value.length ? `${sceneCards.value.length} 场` : currentDashboard.value?.status || "未建",
        signals: backgroundJobSignals(["story.graph.rebuild"]),
        action: "open-structure",
        actionLabel: hasChapterStructure.value ? "查看结构" : "补结构"
      },
      {
        id: "draft",
        label: "正文",
        status: hasSavedDraftContent.value ? "done" : hasDraftContent.value ? "active" : writingMode.value === "focus" ? "active" : "waiting",
        detail: hasDraftContent.value ? (hasUnsavedChanges.value ? "正文已有修改，保存后进入审稿/回顾" : "正文已保存，可进入审稿") : "按下一拍生成或手写正文",
        metric: `${currentWordCount.value} 字`,
        signals: [...(hasUnsavedChanges.value ? ["正文未保存"] : []), ...savePipelineSignals(["save"])],
        action: hasDraftContent.value && hasUnsavedChanges.value ? "save-draft" : "open-focus",
        actionLabel: hasDraftContent.value && hasUnsavedChanges.value ? "保存正文" : "去写作"
      },
      {
        id: "review",
        label: "审稿",
        status: hasChapterQualityReport.value ? "done" : writingMode.value === "review" ? "active" : savedDraftBlocked ? "blocked" : "waiting",
        detail: hasChapterQualityReport.value ? "已有本章质量体检结果" : savedDraftBlocked ? "需要先保存可审正文" : "检查冲突、节奏、信息释放和文风风险",
        metric: hasChapterQualityReport.value ? `${currentQualityReport.value?.overallScore || 0} 分` : "待体检",
        signals: [...backgroundJobSignals(["quality.series.rebuild"]), ...savePipelineSignals(["quality"])],
        action: hasChapterQualityReport.value ? "open-review" : "diagnose",
        actionLabel: hasChapterQualityReport.value ? "看报告" : "体检本章"
      },
      {
        id: "recap",
        label: "章后回顾",
        status: recapCandidate.value ? "active" : hasWritingRecapTaskForCurrentChapter.value ? "done" : savedDraftBlocked ? "blocked" : "waiting",
        detail: recapCandidate.value ? "有待确认的状态补丁" : savedDraftBlocked ? "保存正文后再抽取事实变化" : "抽取摘要、事实、人物变化和账本候选",
        metric: recapCandidate.value
          ? `${recapCandidate.value.newFacts.length + recapCandidate.value.characterStateChanges.length} 条`
          : hasWritingRecapTaskForCurrentChapter.value
            ? "已生成"
            : "待生成",
        signals: [...recapStateSignals.value, ...savePipelineSignals(["recap", "runtime"])],
        action: recapCandidate.value ? "accept-recap" : "request-recap",
        actionLabel: recapCandidate.value ? "入账" : "生成回顾"
      },
      {
        id: "ledger",
        label: "账本",
        status: hasAcceptedLedgerForCurrentChapter.value ? "done" : recapCandidate.value ? "active" : savedDraftBlocked ? "blocked" : "waiting",
        detail: hasAcceptedLedgerForCurrentChapter.value ? "本章已有账本状态沉淀" : recapCandidate.value ? "确认后写入伏笔/风险/升级账本" : "等待章后回顾产生可采纳条目",
        metric: hasAcceptedLedgerForCurrentChapter.value
          ? `${ledgerEntries.value.length} 条`
          : pendingEmotionLedgerCount.value
            ? `情绪 ${pendingEmotionLedgerCount.value}`
            : "待入账",
        signals: [
          ...recapStateSignals.value,
          ...runtimeNarrativeDebtSignals.value,
          ...backgroundJobSignals(["knowledge.index.rebuild"]),
          ...savePipelineSignals(["knowledge"])
        ],
        action: recapCandidate.value ? "accept-recap" : "request-recap",
        actionLabel: recapCandidate.value ? "确认入账" : "先回顾"
      },
      {
        id: "next",
        label: "下一章",
        status: hasAcceptedLedgerForCurrentChapter.value || hasWritingRecapTaskForCurrentChapter.value ? "done" : "waiting",
        detail: hasAcceptedLedgerForCurrentChapter.value || hasWritingRecapTaskForCurrentChapter.value ? "下一章可读取回顾与账本继续推进" : "完成回顾和账本后，下一章上下文更稳",
        metric: currentChapter.value?.status || "当前章",
        signals: [
          ...(acceptedEmotionLedgerCount.value ? [`情绪线 ${acceptedEmotionLedgerCount.value}`] : []),
          ...runtimeNarrativeDebtSignals.value,
          ...backgroundJobSignals(["knowledge.index.rebuild", "story.graph.rebuild"]),
          ...savePipelineSignals(["story"])
        ],
        action: "open-structure",
        actionLabel: "规划后续"
      }
    ];
  });
  const nextWorkbenchActions = computed<WorkbenchNextAction[]>(() => {
    const actions: WorkbenchNextAction[] = [];
    const debt = currentRuntimeSnapshot.value?.signals.narrativeDebt;
    const failedPipelineStep = savePipelineSteps.value.find((step) => step.status === "error");
    const failedBackgroundJob = backgroundJobs.value.find((job) => job.status === "error");
    const abnormalAppearance = storyGraph.value?.characterRelations?.appearanceSignals.find((signal) =>
      ["should-appear", "overexposed", "absent"].includes(signal.status)
    );

    if (!currentChapter.value) {
      actions.push({
        id: "select-chapter",
        priority: "critical",
        label: "选择章节",
        reason: "工作台还没有绑定当前章节，先进入章节才能计算闭环状态。",
        action: "open-structure",
        targetPanel: "chapter-tree"
      });
      return actions;
    }

    if (hasUnsavedChanges.value) {
      actions.push({
        id: "save-draft",
        priority: "critical",
        label: "保存正文",
        reason: "当前正文有未保存修改，审稿、回顾和账本都应基于已落盘版本。",
        action: "save-draft",
        targetPanel: "editor"
      });
    }

    if (!hasDraftContent.value) {
      actions.push({
        id: "write-draft",
        priority: "recommended",
        label: "进入正文写作",
        reason: "本章还没有足够正文，先补出可审稿的文本。",
        action: "open-focus",
        targetPanel: "focus-writing"
      });
    }

    if (!hasUnsavedChanges.value && recapCandidate.value) {
      actions.push({
        id: "accept-recap",
        priority: "critical",
        label: "确认写作回顾",
        reason: "已有回顾候选，确认后才能把事实、情绪和账本变化沉淀下来。",
        action: "accept-recap",
        targetPanel: "writing-recap"
      });
    }

    if (!hasUnsavedChanges.value && hasSavedDraftContent.value && !recapCandidate.value && !hasWritingRecapTaskForCurrentChapter.value) {
      actions.push({
        id: "request-recap",
        priority: "recommended",
        label: "生成写作回顾",
        reason: "正文已保存，但本章还没有可复用的章后状态沉淀。",
        action: "request-recap",
        targetPanel: "writing-recap"
      });
    }

    if (hasSavedDraftContent.value && !hasChapterQualityReport.value) {
      actions.push({
        id: "diagnose",
        priority: "recommended",
        label: "体检本章",
        reason: "缺少本章质量报告，风险雷达无法判断节奏、张力和信息释放。",
        action: "diagnose",
        targetPanel: "review-quality"
      });
    }

    if (debt && (debt.severity === "blocked" || debt.overdueCount > 0)) {
      actions.push({
        id: "narrative-debt",
        priority: "critical",
        label: "处理叙事债务",
        reason: `当前叙事债务 ${debt.debtCount} 项，逾期 ${debt.overdueCount} 项。`,
        action: "open-review",
        targetPanel: "ledger"
      });
    }

    if (pendingEmotionLedgerCount.value) {
      actions.push({
        id: "emotion-ledger",
        priority: recapCandidate.value ? "critical" : "recommended",
        label: "确认情绪账本",
        reason: `有 ${pendingEmotionLedgerCount.value} 条情绪账本补丁待入账。`,
        action: recapCandidate.value ? "accept-recap" : "request-recap",
        targetPanel: "writing-recap"
      });
    }

    if (failedPipelineStep || failedBackgroundJob) {
      actions.push({
        id: "pipeline-health",
        priority: "recommended",
        label: "检查后台流水线",
        reason: failedPipelineStep ? `${failedPipelineStep.label} 失败。` : `${failedBackgroundJob?.inputSummary || "后台任务"} 失败。`,
        action: "open-review",
        targetPanel: "task-history"
      });
    }

    if (abnormalAppearance) {
      actions.push({
        id: "character-schedule",
        priority: "optional",
        label: "检查角色调度",
        reason: `${abnormalAppearance.name} 出现 ${abnormalAppearance.status} 信号。`,
        action: "open-structure",
        targetPanel: "story-graph"
      });
    }

    if (!actions.length) {
      actions.push({
        id: "safe-next",
        priority: "optional",
        label: "规划下一章",
        reason: "当前闭环没有阻塞项，可以推进下一章结构。",
        action: "open-structure",
        targetPanel: "chapter-tree"
      });
    }

    const priorityRank: Record<WorkbenchNextAction["priority"], number> = {
      critical: 0,
      recommended: 1,
      optional: 2
    };
    return actions
      .filter((action, index, list) => list.findIndex((item) => item.id === action.id) === index)
      .sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority])
      .slice(0, 3);
  });
  const workbenchRiskSignals = computed<WorkbenchRiskSignal[]>(() => {
    const signals: WorkbenchRiskSignal[] = [];
    const debt = currentRuntimeSnapshot.value?.signals.narrativeDebt;
    const latestInvocation = latestAiInvocation.value;
    const failedJob = backgroundJobs.value.find((job) => job.status === "error");
    const runningJobCount = backgroundJobs.value.filter((job) => job.status === "running" || job.status === "pending").length;
    const truncatedContextCount = latestInvocation?.contextSnapshot.truncatedBlocks?.length || 0;
    const abnormalAppearance = abnormalAppearanceSignals.value[0];
    const abnormalAppearanceCount = abnormalAppearanceSignals.value.length;
    const weakMetric = currentQualityReport.value?.metrics.find((metric) => metric.score < 60);

    signals.push({
      id: "draft-save",
      label: hasUnsavedChanges.value ? "正文未保存" : "正文已沉淀",
      status: hasUnsavedChanges.value ? "blocked" : "stable",
      reason: hasUnsavedChanges.value ? "未保存会阻塞审稿、回顾和章后流水线。" : "当前正文可作为后续计算输入。",
      action: hasUnsavedChanges.value ? "save-draft" : undefined,
      actionLabel: hasUnsavedChanges.value ? "保存" : undefined,
      source: "draft",
      detailRows: [
        sourceRef("draft-state", "保存状态", hasUnsavedChanges.value ? "未保存" : "已保存", "draft"),
        sourceRef("draft-word-count", "当前字数", currentWordCount.value, "draft"),
        sourceRef("chapter", "当前章节", currentChapter.value?.title || currentDashboard.value?.chapterId || "未选择章节", "draft")
      ],
      sourceRefs: [sourceRef("content-file", "正文文件", currentFilePath.value || currentChapter.value?.contentPath || "未打开文件", "draft")]
    });

    signals.push({
      id: "quality",
      label: weakMetric ? `${weakMetric.label} 偏低` : hasChapterQualityReport.value ? "质量体检可用" : "质量体检缺失",
      status: weakMetric ? "watch" : hasChapterQualityReport.value ? "stable" : hasSavedDraftContent.value ? "watch" : "blocked",
      reason: weakMetric?.note || (hasChapterQualityReport.value ? "已有本章质量报告。" : "缺少节奏、张力和信息释放检查。"),
      action: hasChapterQualityReport.value && !weakMetric ? undefined : "diagnose",
      actionLabel: hasChapterQualityReport.value && !weakMetric ? undefined : "体检",
      source: "quality",
      detailRows: [
        sourceRef("quality-report", "质量报告", hasChapterQualityReport.value ? `${currentQualityReport.value?.overallScore || 0} 分` : "缺失", "quality"),
        sourceRef("quality-weak-metric", "最低指标", weakMetric ? `${weakMetric.label} ${weakMetric.score}` : "暂无低分项", "quality"),
        sourceRef("saved-draft", "可审正文", hasSavedDraftContent.value ? "已保存" : "不足或未保存", "draft")
      ],
      sourceRefs: currentQualityReport.value?.metrics.map((metric) => sourceRef(`metric-${metric.key}`, metric.label, `${metric.score} 分`, "quality")) || []
    });

    signals.push({
      id: "narrative-debt",
      label: debt?.debtCount ? `叙事债务 ${debt.debtCount}` : "叙事债务稳定",
      status: debt?.severity === "blocked" ? "blocked" : debt?.severity === "watch" ? "watch" : "stable",
      reason: debt?.debtCount
        ? `伏笔 ${debt.openForeshadowingCount}，风险 ${debt.riskCount}，情绪回路 ${debt.openLoopCount}，逾期 ${debt.overdueCount}。`
        : "当前快照未发现高压叙事债务。",
      action: debt?.debtCount ? "open-review" : undefined,
      actionLabel: debt?.debtCount ? "查看" : undefined,
      source: "runtime",
      detailRows: [
        sourceRef("runtime-fingerprint", "运行时快照", currentRuntimeSnapshot.value?.fingerprint.slice(0, 8) || "暂无", "runtime"),
        sourceRef("open-foreshadowing", "未交付伏笔", debt?.openForeshadowingCount || 0, "runtime"),
        sourceRef("continuity-risks", "风险项", debt?.riskCount || 0, "runtime"),
        sourceRef("open-emotion-loops", "情绪回路", debt?.openLoopCount || 0, "ledger"),
        sourceRef("overdue-debt", "逾期项", debt?.overdueCount || 0, "runtime")
      ],
      sourceRefs: [sourceRef("current-runtime", "章节运行时", currentRuntimeSnapshot.value?.updatedAt || "未生成", "runtime")]
    });

    signals.push({
      id: "emotion-ledger",
      label: pendingEmotionLedgerCount.value ? `情绪待入账 ${pendingEmotionLedgerCount.value}` : `情绪已沉淀 ${acceptedEmotionLedgerCount.value}`,
      status: pendingEmotionLedgerCount.value ? "watch" : "stable",
      reason: pendingEmotionLedgerCount.value ? "回顾候选里有情绪伤口、馈赠或开放回路待确认。" : "当前没有待确认情绪账本补丁。",
      action: pendingEmotionLedgerCount.value ? "accept-recap" : undefined,
      actionLabel: pendingEmotionLedgerCount.value ? "入账" : undefined,
      source: "ledger",
      detailRows: [
        sourceRef("pending-ledger", "待确认补丁", pendingEmotionLedgerCount.value, "ledger"),
        sourceRef("accepted-ledger", "已沉淀条目", acceptedEmotionLedgerCount.value, "ledger"),
        sourceRef("recap-candidate", "回顾候选", recapCandidate.value ? recapCandidate.value.createdAt : "暂无", "ledger")
      ],
      sourceRefs: [
        sourceRef("emotion-wounds", "伤口", recapCandidate.value?.emotionLedgerPatch?.wounds?.length || 0, "ledger"),
        sourceRef("emotion-boons", "馈赠", recapCandidate.value?.emotionLedgerPatch?.boons?.length || 0, "ledger"),
        sourceRef("emotion-open-loops", "开放回路", recapCandidate.value?.emotionLedgerPatch?.openLoops?.length || 0, "ledger")
      ]
    });

    signals.push({
      id: "context-ai",
      label:
        latestInvocation?.status === "error"
          ? "AI 调用失败"
          : truncatedContextCount
            ? `上下文截断 ${truncatedContextCount}`
            : "AI 调用健康",
      status: latestInvocation?.status === "error" ? "blocked" : truncatedContextCount ? "watch" : "stable",
      reason:
        latestInvocation?.status === "error"
          ? latestInvocation.attempt.error || "最近一次 AI 调用失败。"
          : truncatedContextCount
            ? "最近一次调用发生上下文压缩，需要留意关键信息是否被截断。"
            : "最近一次 AI 调用没有暴露失败或上下文截断。",
      action: latestInvocation?.status === "error" || truncatedContextCount ? "open-review" : undefined,
      actionLabel: latestInvocation?.status === "error" || truncatedContextCount ? "审计" : undefined,
      command: latestInvocation?.status === "error" || truncatedContextCount ? auditCommand() : undefined,
      commandLabel: latestInvocation?.status === "error" || truncatedContextCount ? "定位 AI 调用控制面板" : undefined,
      source: "ai",
      detailRows: [
        sourceRef("latest-invocation", "最近调用", latestInvocation?.id || "暂无", "ai"),
        sourceRef("invocation-status", "调用状态", latestInvocation?.status || "无记录", "ai"),
        sourceRef("prompt-version", "提示词版本", latestInvocation?.promptVersion || "未记录", "ai"),
        sourceRef("context-blocks", "上下文块", latestInvocation?.contextSnapshot.blockCount || 0, "ai"),
        sourceRef("truncated-blocks", "截断块", truncatedContextCount, "ai")
      ],
      sourceRefs: [
        ...((latestInvocation?.contextSnapshot.truncatedBlocks || []).map((title, index) =>
          sourceRef(`truncated-${index}`, "被截断上下文", title, "ai")
        )),
        ...((latestInvocation?.preCallReview?.warnings || []).map((warning, index) =>
          sourceRef(`pre-call-warning-${index}`, "调用前预警", warning, "ai")
        ))
      ]
    });

    signals.push({
      id: "jobs-and-cast",
      label: failedJob ? "后台任务失败" : abnormalAppearanceCount ? `角色调度 ${abnormalAppearanceCount}` : runningJobCount ? `后台处理中 ${runningJobCount}` : "后台与角色稳定",
      status: failedJob ? "blocked" : abnormalAppearanceCount || runningJobCount ? "watch" : "stable",
      reason: failedJob
        ? failedJob.error || "后台任务失败，需要重试或查看任务历史。"
        : abnormalAppearanceCount
          ? "角色关系图发现缺少证据、长期未登场或近期过曝信号。"
          : runningJobCount
            ? "仍有后台任务在排队或运行。"
            : "知识图谱、故事图谱和角色调度没有暴露阻塞项。",
      action: failedJob ? "open-review" : abnormalAppearanceCount ? "open-structure" : undefined,
      actionLabel: failedJob ? "查看" : abnormalAppearanceCount ? "定位" : undefined,
      command: abnormalAppearanceCount ? storyGraphCommand(abnormalAppearance) : failedJob ? undefined : undefined,
      commandLabel: abnormalAppearanceCount ? "定位角色图谱" : undefined,
      source: "graph",
      detailRows: [
        sourceRef("failed-job", "失败后台任务", failedJob ? `${radarBackgroundJobLabels[failedJob.type]} / ${failedJob.id}` : "无", "job"),
        sourceRef("running-jobs", "处理中任务", runningJobCount, "job"),
        sourceRef("appearance-risk-count", "异常调度", abnormalAppearanceCount, "graph"),
        sourceRef("focused-character", "优先定位角色", abnormalAppearance?.name || "暂无", "graph")
      ],
      sourceRefs: [
        ...(failedJob ? [sourceRef(failedJob.id, "后台任务错误", failedJob.error || failedJob.status, "job")] : []),
        ...abnormalAppearanceSignals.value.map((signal) =>
          sourceRef(signal.characterId, signal.name, `${signal.status} / ${signal.reasons.join("、") || "无原因"}`, "graph")
        )
      ]
    });

    return signals;
  });
  const plotPilotLearningItems = computed<PlotPilotLearningItem[]>(() => {
    const latestInvocation = latestAiInvocation.value;
    const tierCount = latestInvocation?.contextSnapshot.tierCounts
      ? Object.values(latestInvocation.contextSnapshot.tierCounts).reduce((total, value) => total + (value || 0), 0)
      : 0;
    const relationCount = storyGraph.value?.characterRelations?.relationships.length || 0;
    const appearanceCount = storyGraph.value?.characterRelations?.appearanceSignals.length || 0;
    const knowledgeCount = storyGraph.value?.nodes.filter((node) => node.type === "knowledge").length || 0;
    const debt = currentRuntimeSnapshot.value?.signals.narrativeDebt;
    const currentChapterId = currentChapter.value?.id || currentDashboard.value?.chapterId;
    const structureActive = Boolean(hasChapterStructure.value || sceneCards.value.length);
    const contextActive = Boolean(latestInvocation?.contextSnapshot.blockCount);
    const aiControlActive = Boolean(latestInvocation?.promptVersion || latestInvocation?.preCallReview || latestInvocation?.contextSnapshot.truncatedBlocks?.length);
    const emotionActive = Boolean(pendingEmotionLedgerCount.value || acceptedEmotionLedgerCount.value);
    const narrativeDebtActive = Boolean(debt?.debtCount || currentSeriesQualityMetrics.value?.narrativeDebtSignals?.some((signal) => signal.chapterId === currentChapterId));
    const graphActive = Boolean(relationCount || appearanceCount || knowledgeCount);

    return [
      {
        id: "promise-lock",
        label: "叙事承诺锁",
        status: hasChapterStructure.value || Boolean(currentRuntimeSnapshot.value) ? "done" : "partial",
        sourcePattern: "把项目承诺、类型信号和早期节奏约束注入写作输入。",
        localLanding: "结构、正文和上下文装配共享同一章目标。",
        userValue: "减少早期跑题、过早泄底和无代价推进。",
        entryAction: "open-structure",
        evidenceCount: Number(hasChapterStructure.value) + sceneCards.value.length,
        active: structureActive,
        activeReason: structureActive ? `当前章正在使用 ${sceneCards.value.length} 张场景卡和章节目标约束。` : undefined,
        sourceRefs: [
          sourceRef("dashboard", "章节仪表盘", hasChapterStructure.value ? "已建立" : "缺失", "structure"),
          sourceRef("scene-cards", "场景卡", sceneCards.value.length, "structure")
        ]
      },
      {
        id: "context-budget",
        label: "上下文预算分层",
        status: tierCount ? "done" : latestInvocation ? "partial" : "planned",
        sourcePattern: "T0/T1/T2/T3 分层保护关键上下文，压缩低优先级材料。",
        localLanding: "AI 调用审计记录 tier 计数和截断块。",
        userValue: "长篇推进时优先保留承诺、人物和账本状态。",
        entryAction: "open-review",
        entryCommand: auditCommand(),
        evidenceCount: tierCount || latestInvocation?.contextSnapshot.blockCount || 0,
        active: contextActive,
        activeReason: contextActive ? `最近调用装配了 ${latestInvocation?.contextSnapshot.blockCount || 0} 个上下文块。` : undefined,
        sourceRefs: [
          sourceRef("tier-count", "分层证据", tierCount, "ai"),
          sourceRef("truncated-count", "截断块", latestInvocation?.contextSnapshot.truncatedBlocks?.length || 0, "ai")
        ]
      },
      {
        id: "ai-control-plane",
        label: "AI 调用控制面",
        status: latestInvocation?.promptVersion || latestInvocation?.preCallReview ? "done" : latestInvocation ? "partial" : "planned",
        sourcePattern: "记录 prompt 版本、变量计划、调用前预检和采纳结果。",
        localLanding: "任务历史与审计报告暴露 AI 调用健康度。",
        userValue: "失败、截断和采纳状态能追溯，不必翻 JSONL。",
        entryAction: "open-review",
        entryCommand: auditCommand(),
        evidenceCount: aiInvocations.value.length,
        active: aiControlActive,
        activeReason: aiControlActive ? "最近调用已有提示词版本、预检或上下文截断记录。" : undefined,
        sourceRefs: [
          sourceRef("latest-ai-invocation", "最近调用", latestInvocation?.id || "暂无", "ai"),
          sourceRef("prompt-version", "提示词版本", latestInvocation?.promptVersion || "未记录", "ai"),
          sourceRef("pre-call-warnings", "预检警告", latestInvocation?.preCallReview?.warnings.length || 0, "ai")
        ]
      },
      {
        id: "emotion-ledger",
        label: "情绪账本",
        status: acceptedEmotionLedgerCount.value ? "done" : pendingEmotionLedgerCount.value ? "partial" : "planned",
        sourcePattern: "沉淀伤口、馈赠、权力变化和开放情绪回路。",
        localLanding: "写作回顾候选与章节摘要都能携带 emotionLedger。",
        userValue: "下一章不只记住事件，也记住人物被留下的情绪债。",
        entryAction: pendingEmotionLedgerCount.value ? "accept-recap" : "request-recap",
        evidenceCount: acceptedEmotionLedgerCount.value + pendingEmotionLedgerCount.value,
        active: emotionActive,
        activeReason: pendingEmotionLedgerCount.value
          ? `当前章有 ${pendingEmotionLedgerCount.value} 条情绪账本补丁待确认。`
          : acceptedEmotionLedgerCount.value
            ? `当前章已沉淀 ${acceptedEmotionLedgerCount.value} 条情绪账本。`
            : undefined,
        sourceRefs: [
          sourceRef("pending-emotion-ledger", "待入账", pendingEmotionLedgerCount.value, "ledger"),
          sourceRef("accepted-emotion-ledger", "已入账", acceptedEmotionLedgerCount.value, "ledger")
        ]
      },
      {
        id: "narrative-debt",
        label: "叙事债务 / 读者压力",
        status: debt ? "done" : currentSeriesQualityMetrics.value?.narrativeDebtSignals?.length ? "partial" : "planned",
        sourcePattern: "汇总未交付伏笔、风险、连续性和开放回路。",
        localLanding: "运行时快照和全书质量指标提供债务信号。",
        userValue: "作者能优先决定交付、延期或关闭哪类承诺。",
        entryAction: "open-review",
        evidenceCount: debt?.debtCount || currentSeriesQualityMetrics.value?.narrativeDebtSignals?.length || 0,
        active: narrativeDebtActive,
        activeReason: narrativeDebtActive ? `当前章检测到 ${debt?.debtCount || 0} 个运行时债务信号。` : undefined,
        sourceRefs: [
          sourceRef("runtime-debt", "运行时债务", debt?.debtCount || 0, "runtime"),
          sourceRef("series-debt", "全书债务信号", currentSeriesQualityMetrics.value?.narrativeDebtSignals?.length || 0, "quality")
        ]
      },
      {
        id: "knowledge-cast",
        label: "知识图谱 / 角色关系 / 登场调度",
        status: relationCount || appearanceCount || knowledgeCount ? "done" : storyGraph.value ? "partial" : "planned",
        sourcePattern: "把事实三元组、角色关系证据和登场覆盖度投影成图谱。",
        localLanding: "故事图谱承载知识节点、关系边和 appearanceSignals。",
        userValue: "定位缺证据角色、关系断点和长期未登场风险。",
        entryAction: "open-structure",
        entryCommand: storyGraphCommand(),
        evidenceCount: relationCount + appearanceCount + knowledgeCount,
        active: graphActive,
        activeReason: graphActive ? `故事图谱当前有 ${relationCount} 条关系、${appearanceCount} 条调度信号。` : undefined,
        sourceRefs: [
          sourceRef("relation-count", "角色关系", relationCount, "graph"),
          sourceRef("appearance-count", "登场信号", appearanceCount, "graph"),
          sourceRef("knowledge-count", "知识节点", knowledgeCount, "graph")
        ]
      }
    ];
  });
  const activeSceneCard = computed(() => {
    if (!sceneCards.value.length) return null;
    const ratio = focusTargetWords.value ? Math.min(0.99, currentWordCount.value / focusTargetWords.value) : 0;
    return sceneCards.value[Math.min(sceneCards.value.length - 1, Math.floor(ratio * sceneCards.value.length))];
  });
  const focusWritingGuide = computed<FocusWritingGuide>(() => {
    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId || "";
    const card = activeSceneCard.value;
    const dashboard = currentDashboard.value;
    const nextBeat =
      card?.turn ||
      card?.conflict ||
      dashboard?.mainConflict ||
      dashboard?.endingHook ||
      "先写一个具体动作，让角色被目标、阻力或代价推着往前走。";
    const guardrails = [
      dashboard?.goal ? `目标：${dashboard.goal}` : "",
      dashboard?.pov ? `视角：${dashboard.pov}` : "",
      dashboard?.mainConflict ? `冲突：${dashboard.mainConflict}` : "",
      dashboard?.endingHook ? `钩子：${dashboard.endingHook}` : ""
    ].filter(Boolean);
    const stageLabel =
      focusProgressPercent.value >= 85
        ? "收束钩子"
        : focusProgressPercent.value >= 55
          ? "冲突升级"
          : focusProgressPercent.value >= 25
            ? "进入场景"
            : "开场落点";

    return {
      chapterId,
      targetWords: focusTargetWords.value,
      currentWords: currentWordCount.value,
      progressPercent: focusProgressPercent.value,
      stageLabel,
      sceneTitle: card?.title || currentChapter.value?.title || "当前章节",
      nextBeat,
      guardrails,
      prompt: [
        `请继续写《${currentProject.value?.title || "当前小说"}》${currentChapter.value?.title || "当前章节"}。`,
        `阶段：${stageLabel}。`,
        `下一笔：${nextBeat}`,
        guardrails.length ? `必须守住：${guardrails.join("；")}` : "",
        "要求：保持主角有限视角，用具体动作、感官和选择推进，不要提前泄露角色不知道的信息。"
      ]
        .filter(Boolean)
        .join("\n"),
      updatedAt: new Date().toISOString()
    };
  });
  const currentProjectAssets = computed(() => {
    if (!currentProject.value || !platformLibrary.value) return [];
    return platformLibrary.value.assets.filter((asset) => asset.linkedProjects.includes(currentProject.value!.slug));
  });

  function confirmDiscard(message: string) {
    if (typeof window === "undefined" || typeof window.confirm !== "function") {
      return true;
    }

    return window.confirm(message);
  }

  function canLeaveCurrentChapter() {
    return (
      !hasUnsavedChanges.value ||
      confirmDiscard("当前章节有未保存内容，切换工作台会先保留在本次会话缓存中；刷新页面前仍建议保存。是否继续？")
    );
  }

  function canLeaveCurrentSupportFile() {
    return (
      !hasUnsavedSupportChanges.value ||
      confirmDiscard("当前资料文件有未保存内容，切换工作台会先保留在本次会话缓存中；刷新页面前仍建议保存。是否继续？")
    );
  }

  function canLeaveCurrentWorkspace() {
    return canLeaveCurrentChapter() && canLeaveCurrentSupportFile();
  }

  function countDraftWords(content: string) {
    return content.replace(/\s+/g, "").length;
  }

  function compactSnippet(value: string, maxLength = 36) {
    const compacted = value.replace(/\s+/g, " ").trim();
    if (compacted.length <= maxLength) return compacted;
    return `${compacted.slice(0, maxLength)}...`;
  }

  function splitTextUnits(content: string) {
    return content
      .replace(/\r/g, "\n")
      .split(/[\n。！？!?；;]+/)
      .map((unit) => unit.replace(/\s+/g, " ").trim())
      .filter((unit) => unit.length >= 4);
  }

  function pickConflict(units: string[]) {
    return (
      units.find((unit) => /冲突|危险|代价|阻|难|必须|不能|却|但|怕|疑|选择|暴露|失去/.test(unit)) ||
      units[Math.min(1, units.length - 1)] ||
      ""
    );
  }

  function inferPov(content: string) {
    if (/我|我的|我们/.test(content)) return "第一人称视角";
    if (/他|她|少年|少女|主角|主人公/.test(content)) return "主角限知视角";
    return "待确认视角";
  }

  function inferLocation(unit: string) {
    const matched = unit.match(/(?:在|来到|走进|进入)([^，。！？!?、\s]{2,10})/);
    return matched?.[1] || "";
  }

  function inferPowerProgression(unit: string) {
    return /灵|力|术|气|法|印|修|能|境|血|咒|符/.test(unit) ? compactSnippet(unit, 30) : "";
  }

  function makeSceneCard(chapterId: string, order: number, seed: Partial<SceneCard>): SceneCard {
    const now = new Date().toISOString();
    return {
      id: `scene-${chapterId}-${now}-${order}`,
      chapterId,
      order,
      title: seed.title || `场景 ${order}`,
      time: seed.time || "",
      location: seed.location || "",
      pov: seed.pov || "主角限知视角",
      characters: seed.characters || [],
      conflict: seed.conflict || "",
      turn: seed.turn || "",
      informationReleased: seed.informationReleased || [],
      foreshadowingIds: seed.foreshadowingIds || [],
      powerProgression: seed.powerProgression || "",
      draftAnchor: seed.draftAnchor,
      updatedAt: now
    };
  }

  function buildDashboardSeed(patch: Partial<ChapterDashboard>) {
    const chapterId = currentDashboard.value?.chapterId || currentChapter.value?.id;
    if (!chapterId) return null;
    const now = new Date().toISOString();
    return {
      goal: "",
      pov: "",
      mainConflict: "",
      endingHook: "",
      wordCount: countDraftWords(currentContent.value),
      status: "empty" as ChapterDashboard["status"],
      unresolvedForeshadowingIds: [],
      continuityRiskIds: [],
      ...currentDashboard.value,
      ...patch,
      chapterId,
      updatedAt: now
    };
  }

  function applyGeneratedStructure(dashboardPatch: Partial<ChapterDashboard>, cards: SceneCard[]) {
    const dashboard = buildDashboardSeed(dashboardPatch);
    if (!dashboard) return false;
    currentDashboard.value = dashboard;
    sceneCards.value = cards;
    structureDraftVersion.value += 1;
    return true;
  }

  function buildSceneCardsFromDraft(content: string, chapterId: string) {
    return buildSceneCardsFromDraftHelper(content, chapterId);

    const units = splitTextUnits(content);
    const beats = units.length ? units.slice(0, 5) : [content.trim()];
    return beats.map((unit, index) =>
      makeSceneCard(chapterId, index + 1, {
        title: compactSnippet(unit, 14),
        location: inferLocation(unit),
        pov: inferPovHelper(content),
        conflict: pickConflict([unit]),
        turn: compactSnippet(unit, 42),
        powerProgression: inferPowerProgression(unit),
        draftAnchor: compactSnippet(unit, 48)
      })
    );
  }

  function buildSceneCardsFromIdea(idea: string, chapterId: string) {
    return buildSceneCardsFromIdeaHelper(idea, chapterId);

    const seed = compactSnippet(idea, 28);
    const beats = [
      {
        title: "开场抓手",
        conflict: `把“${seed}”落成一个具体异常或目标。`,
        turn: "主角被迫进入本章问题，不能只旁观。"
      },
      {
        title: "冲突升级",
        conflict: "让目标受阻，并暴露代价、限制或误判。",
        turn: "主角得到线索，但同时付出更明确的风险。"
      },
      {
        title: "钩子落点",
        conflict: "用一个新问题逼出下一步行动。",
        turn: "结尾留下会牵引下一章的反应、选择或后果。"
      }
    ];
    return beats.map((beat, index) =>
      makeSceneCard(chapterId, index + 1, {
        ...beat,
        pov: "主角限知视角",
        draftAnchor: idea
      })
    );
  }

  function extractJsonText(value: string) {
    const trimmed = value.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return fenced ? fenced[1].trim() : trimmed;
  }

  function parseJsonObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const parsed = JSON.parse(extractJsonText(value));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  function textField(source: Record<string, unknown>, key: string, maxLength = 800) {
    const value = source[key];
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
  }

  function arrayField(source: Record<string, unknown>, key: string) {
    const value = source[key];
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12);
  }

  function statusField(value: unknown, fallback: ChapterDashboard["status"]): ChapterDashboard["status"] {
    const allowed: ChapterDashboard["status"][] = ["empty", "planned", "drafting", "drafted", "reviewing", "checked"];
    return allowed.includes(value as ChapterDashboard["status"]) ? (value as ChapterDashboard["status"]) : fallback;
  }

  function parseReverseStructureResult(content: unknown, chapterId: string) {
    const parsed = parseJsonObject(content) as ReverseStructurePayload | null;
    if (!parsed) return null;

    const dashboardSource =
      parsed.dashboard && typeof parsed.dashboard === "object" && !Array.isArray(parsed.dashboard)
        ? (parsed.dashboard as Record<string, unknown>)
        : (parsed as Record<string, unknown>);
    const sceneSources = Array.isArray(parsed.scenes) ? parsed.scenes : Array.isArray(parsed.sceneCards) ? parsed.sceneCards : [];
    const cards = sceneSources
      .filter((scene): scene is Record<string, unknown> => Boolean(scene && typeof scene === "object" && !Array.isArray(scene)))
      .map((scene, index) =>
        makeSceneCard(chapterId, index + 1, {
          title: textField(scene, "title", 160) || `场景 ${index + 1}`,
          time: textField(scene, "time", 160),
          location: textField(scene, "location", 180),
          pov: textField(scene, "pov", 180) || textField(dashboardSource, "pov", 180),
          characters: arrayField(scene, "characters"),
          conflict: textField(scene, "conflict"),
          turn: textField(scene, "turn"),
          informationReleased: arrayField(scene, "informationReleased"),
          foreshadowingIds: arrayField(scene, "foreshadowingIds"),
          powerProgression: textField(scene, "powerProgression"),
          draftAnchor: textField(scene, "draftAnchor", 240)
        })
      );

    if (!cards.length) return null;

    return {
      dashboardPatch: {
        goal: textField(dashboardSource, "goal"),
        pov: textField(dashboardSource, "pov"),
        mainConflict: textField(dashboardSource, "mainConflict"),
        endingHook: textField(dashboardSource, "endingHook"),
        status: statusField(dashboardSource.status, countDraftWords(currentContent.value) > 80 ? "drafted" : "drafting")
      },
      cards
    };
  }

  function clampScore(score: number) {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

/*
  function countMatches(content: string, pattern: RegExp) {
    return content.match(pattern)?.length || 0;
  }

  function scoreMetric(score: number, strongNote: string, weakNote: string) {
    const finalScore = clampScore(score);
    return {
      score: finalScore,
      note: finalScore >= 72 ? strongNote : weakNote
    };
  }

  function chapterOrdinal(project: NovelProject | null, chapter: NovelChapter | null): number | undefined {
    if (!chapter) return undefined;
    if (typeof chapter.order === "number" && chapter.order > 0) return chapter.order;
    const index = project?.chapters.findIndex((item) => item.id === chapter.id) ?? -1;
    if (index >= 0) return index + 1;
    const digitMatch = `${chapter.id} ${chapter.title}`.match(/(\d+)/);
    return digitMatch ? Number(digitMatch[1]) : undefined;
  }

  function macroPacingGuardrails(content: string, ordinal?: number): string[] {
    if (ordinal && ordinal > 12) return [];
    const revealOverload = countMatches(content, /真相|秘密|来历|身份|规则|幕后|答案|原来|全部|彻底|终于明白/g);
    const finalitySignals = countMatches(content, /真相大白|尘埃落定|彻底解决|再无阻碍|完全掌握|洗清|平反|终结|结束了/g);
    const cleanExitSignals = countMatches(content, /敌人退去|反派退去|毫无代价|没有代价|轻易解决|直接解决|不再威胁/g);
    const risks: string[] = [];
    if (revealOverload >= 5) risks.push("前期真相释放过载，建议只揭一角，把答案拆成后续章节的代价和误判。");
    if (finalitySignals >= 2) risks.push("前期出现终局感表达，建议保留未解压力，避免让主线问题过早落地。");
    if (cleanExitSignals >= 1) risks.push("核心阻力退场过轻，建议补上代价、伤痕或新的追索关系。");
    return risks;
  }

*/
  function currentNarrativeDebtRisks() {
    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId;
    if (!chapterId) return [];
    const openLedgers = ledgerEntries.value.filter((entry) => entry.status !== "resolved" && entry.chapterIds.includes(chapterId));
    const dashboardDebtCount =
      (currentDashboard.value?.unresolvedForeshadowingIds.length || 0) + (currentDashboard.value?.continuityRiskIds.length || 0);
    const openLoopCount = (currentChapterSummary.value?.emotionLedger?.openLoops || []).filter((item) => item.status !== "resolved").length;
    const riskCount = openLedgers.filter((entry) => entry.kind === "risk" || entry.kind === "continuity" || entry.status === "blocked").length;
    const warnings: string[] = [];
    if (openLedgers.length + dashboardDebtCount >= 3) warnings.push("叙事债务积压偏高，建议下一章优先交付一个伏笔、风险或明确延期。");
    if (riskCount) warnings.push("存在未解决风险/连续性账本，写作前需要确认角色已知信息和状态锁。");
    if (openLoopCount) warnings.push("情绪 open loop 尚未消化，下一场景需要给角色反应、压抑或转化。");
    return warnings;
  }

  async function diagnoseCurrentChapter() {
    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId;
    const content = currentContent.value.trim();
    if (!chapterId || !content || !canDiagnoseChapter.value) return false;

    const narrativeDebtWarnings = currentNarrativeDebtRisks();
    const analyzedReport: ChapterQualityReport = analyzeChapterQualityHelper({
      chapterId,
      content,
      ordinal: chapterOrdinalHelper(currentProject.value, currentChapter.value),
      narrativeDebtRisks: narrativeDebtWarnings
    });
    currentQualityReport.value = analyzedReport;
    if (currentProject.value) {
      const saved = await novelApi.saveChapterQualityReport(currentProject.value.slug, analyzedReport);
      currentQualityReport.value = saved.report;
      currentSeriesQualityMetrics.value = saved.seriesMetrics;
      await loadCreationRuntimeSnapshot(chapterId);
    }
    return true;
/*

    const units = splitTextUnits(content);
    const wordCount = countDraftWords(content);
    const averageUnitLength = units.length ? wordCount / units.length : wordCount;
    const conflictCount = countMatches(content, /冲突|危险|代价|必须|不能|却|但|暴露|失去|选择|逼|阻/g);
    const emotionCount = countMatches(content, /怒|怕|惊|痛|悔|冷|热|心|沉默|犹豫|颤|笑|哭|恨/g);
    const sensoryCount = countMatches(content, /看|听|闻|触|风|雨|血|光|影|声|冷|热|疼|黑|亮/g);
    const infoCount = countMatches(content, /知道|发现|明白|秘密|线索|真相|身份|规则|封印|来历/g);
    const hookCount = countMatches(units[units.length - 1] || "", /？|\?|却|但|忽然|突然|出现|回应|门|影|声|血|选择/g);
    const abstractCount = countMatches(content, /命运|世界|强大|震撼|恐怖|可怕|无比|极其|非常|深深/g);

    const rhythm = scoreMetric(
      88 - Math.abs(averageUnitLength - 28) * 1.6,
      "句段长度有变化，阅读推进感较稳。",
      "句段节奏偏单一，适合拆出动作、反应和停顿。"
    );
    const conflict = scoreMetric(
      45 + conflictCount * 13,
      "阻力和代价已经进入文本。",
      "冲突信号偏弱，需要让主角面对明确阻力。"
    );
    const emotion = scoreMetric(
      42 + emotionCount * 7 + sensoryCount * 3,
      "情绪与感官描写能支撑场面。",
      "情绪还偏外部，可以补角色的犹豫、压抑或身体反应。"
    );
    const information = scoreMetric(
      48 + infoCount * 9,
      "本章有信息释放，读者能获得推进。",
      "信息推进偏少，可以安排一个新线索或规则露面。"
    );
    const prose = scoreMetric(
      82 - abstractCount * 6 + sensoryCount * 2,
      "文字有具体画面，AI 味不重。",
      "抽象判断词偏多，建议换成动作、感官和选择。"
    );
    const hook = scoreMetric(
      50 + hookCount * 18,
      "结尾具备翻页牵引。",
      "结尾钩子偏平，可以留下新问题、后果或未完成选择。"
    );
    const tension = scoreMetric(
      conflict.score * 0.35 + emotion.score * 0.25 + hook.score * 0.25 + rhythm.score * 0.15,
      "情节、情绪、节奏和钩子形成了有效张力。",
      "张力链条偏松，建议把阻力、代价、情绪反应和结尾悬念串成同一个压力源。"
    );

    const metrics = [
      { key: "rhythm" as const, label: "节奏", ...rhythm },
      { key: "conflict" as const, label: "冲突", ...conflict },
      { key: "emotion" as const, label: "情绪", ...emotion },
      { key: "information" as const, label: "信息", ...information },
      { key: "prose" as const, label: "文笔", ...prose },
      { key: "hook" as const, label: "钩子", ...hook },
      { key: "tension" as const, label: "张力", ...tension }
    ];
    const macroPacingRisks = macroPacingGuardrails(content, chapterOrdinal(currentProject.value, currentChapter.value));
    const narrativeDebtRisks = currentNarrativeDebtRisks();
    if (macroPacingRisks.length) {
      const informationMetric = metrics.find((metric) => metric.key === "information");
      if (informationMetric) {
        informationMetric.score = clampScore(informationMetric.score - macroPacingRisks.length * 8);
        informationMetric.note = `${informationMetric.note} 宏观节奏风险：${macroPacingRisks[0]}`;
      }
    }
    if (narrativeDebtRisks.length) {
      const tensionMetric = metrics.find((metric) => metric.key === "tension");
      if (tensionMetric) {
        tensionMetric.score = clampScore(tensionMetric.score - narrativeDebtRisks.length * 5);
        tensionMetric.note = `${tensionMetric.note} 叙事债务：${narrativeDebtRisks[0]}`;
      }
    }
    const overallScore = clampScore(metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length);
    const lowMetrics = [...metrics].sort((left, right) => left.score - right.score).slice(0, 2);
    const highMetrics = metrics.filter((metric) => metric.score >= 72).slice(0, 2);
    const fixes = [...lowMetrics.map((metric) => `${metric.label}：${metric.note}`), ...macroPacingRisks.map((risk) => `宏观节奏：${risk}`)];

    fixes.push(...narrativeDebtRisks.map((risk) => `叙事债务：${risk}`));

    const report: ChapterQualityReport = {
      chapterId,
      overallScore,
      summary:
        overallScore >= 75
          ? "这一章的基础驱动力已经成立，下一步重点是把亮点写得更锋利。"
          : "这一章有可用骨架，但还需要补强读者继续读下去的压力和质感。",
      metrics,
      strengths: highMetrics.length ? highMetrics.map((metric) => `${metric.label}：${metric.note}`) : ["已有正文基础，可以继续向冲突和钩子集中。"],
      fixes,
      updatedAt: new Date().toISOString()
    };
    currentQualityReport.value = report;
    if (currentProject.value) {
      const saved = await novelApi.saveChapterQualityReport(currentProject.value.slug, report);
      currentQualityReport.value = saved.report;
      currentSeriesQualityMetrics.value = saved.seriesMetrics;
      await loadCreationRuntimeSnapshot(chapterId);
    }
    return true;
*/
  }

  async function improveQualityMetrics(metricKey?: QualityMetricKey) {
    if (!currentProject.value || !currentChapter.value || currentDocumentKind.value !== "content" || !currentFilePath.value) return false;
    setQualityImprovementState({
      status: "preparing",
      chapterId: currentChapter.value.id,
      filePath: currentFilePath.value,
      targetMetrics: [],
      changes: [],
      patchCount: 0,
      error: undefined,
      diffVersionId: undefined,
      afterOverallScore: undefined
    });
    if (hasUnsavedChanges.value) {
      await saveCurrentContent({ runPipeline: false });
    }
    if (!currentQualityReport.value) {
      await diagnoseCurrentChapter();
    }
    const report = currentQualityReport.value;
    if (!report) return false;
    const targetMetrics = report.metrics
      .filter((metric) => metric.score < qualityTargetScore && (!metricKey || metric.key === metricKey))
      .sort((left, right) => left.score - right.score);
    if (!targetMetrics.length) {
      setQualityImprovementState({ status: "idle", targetMetrics: [], changes: [], patchCount: 0 });
      return false;
    }

    isImprovingQualityMetrics.value = true;
    setQualityImprovementState({
      status: "running",
      beforeOverallScore: report.overallScore,
      targetMetrics: targetMetrics.map((metric) => ({
        key: metric.key,
        label: metric.label,
        beforeScore: metric.score,
        targetScore: qualityTargetScore,
        note: metric.note
      })),
      changes: [],
      patchCount: 0
    });
    try {
      const task = await runTask("quality.rewrite", {
        mode: metricKey ? "single-metric" : "all-under-target",
        chapterId: currentChapter.value.id,
        filePath: currentFilePath.value,
        documentKind: currentDocumentKind.value,
        targetScore: qualityTargetScore,
        maxScore: qualityMaxScore,
        targetMetrics: targetMetrics.map((metric) => ({
          key: metric.key,
          label: metric.label,
          score: metric.score,
          note: metric.note,
          gap: qualityTargetScore - metric.score
        })),
        currentQualityReport: report,
        currentChapterTitle: currentChapter.value.title,
        currentWordCount: countDraftWords(currentContent.value),
        instruction:
          "请生成可供评审的整章替换补丁。保留正式设定与叙事视角；只改善低于目标的指标，除非确有必要补写局部过渡。"
      });

      const normalizedRewrite = normalizeCurrentChapterQualityRewrite(task?.result || null);
      if (normalizedRewrite) {
        rewriteCandidate.value = normalizedRewrite;
        setQualityImprovementState({
          status: "candidate",
          taskId: task?.id,
          summary: normalizedRewrite.summary,
          changes: buildQualityImprovementChanges(currentContent.value, normalizedRewrite.content, normalizedRewrite),
          patchCount: normalizedRewrite.patches.length,
          error: normalizedRewrite.content.trim() === currentContent.value.trim() ? "候选稿与当前正文几乎一致，建议重新生成或缩小/强化改造目标。" : undefined
        });
      } else {
        setQualityImprovementState({
          status: "error",
          taskId: task?.id,
          summary: task?.result?.summary,
          changes: task?.result?.changes || [],
          patchCount: task?.result?.patches.length || 0,
          error: "AI 没有返回可应用的整章替换 patch。"
        });
      }
      return Boolean(task?.result);
    } catch (err) {
      setQualityImprovementState({
        status: "error",
        error: errorText(err)
      });
      throw err;
    } finally {
      isImprovingQualityMetrics.value = false;
    }
  }

  function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function updateStyleTone(tone: StyleToneKey) {
    styleTone.value = tone;
  }

  function removeOverstatement(content: string) {
    return content
      .replace(/非常|特别|极其|无比|简直|震撼|恐怖/g, "")
      .replace(/！！+/g, "。")
      .replace(/!+/g, "。")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tuneText(content: string, tone: StyleToneKey) {
    const clean = removeOverstatement(content);
    const ending = /[。！？!?]$/.test(clean) ? "" : "。";
    switch (tone) {
      case "restrained":
        return `${clean}${ending}`.replace(/他终于明白/g, "他没有再问").replace(/她终于明白/g, "她没有再问");
      case "tense":
        return `${clean}${ending}\n他没有立刻动。那一点迟疑，反而让危险显得更近。`;
      case "cinematic":
        return `${clean}${ending}\n风声压低，光影贴着地面滑过去，像有什么东西刚从画面外经过。`;
      case "web-serial":
        return `${clean}${ending}\n这一次，他要么抓住线索，要么把自己也赔进去。`;
      case "lower-ai":
        return clean
          .replace(/命运/g, "眼前这一步")
          .replace(/世界/g, "这片地方")
          .replace(/强大/g, "难以撼动")
          .replace(/可怕/g, "让人不敢靠近");
      case "elegant":
      default:
        return `${clean}${ending}\n沉默落下来时，细微的声响反而清晰起来，像一根线，把他牵向尚未显形的答案。`;
    }
  }

  function tuneSelectionStyle(tone: StyleToneKey = styleTone.value) {
    const selectionAnchor = selection.value;
    if (!selectionAnchor?.selectedText.trim()) return false;
    styleTone.value = tone;
    rewriteCandidate.value = {
      summary: `文风调音：${styleToneLabels[tone]}`,
      content: tuneText(selectionAnchor.selectedText, tone),
      changes: [`调整为${styleToneLabels[tone]}`, "压低空泛判断，强化画面、动作或压力"],
      risks: [],
      questions: ["接受前建议确认：这段是否仍然符合当前叙事视角和角色性格。"],
      patches: []
    };
    rewriteSelection.value = cloneSelection(selectionAnchor);
    return true;
  }

  const styleToneLabels: Record<StyleToneKey, string> = {
    elegant: "优雅留白",
    restrained: "克制冷峻",
    tense: "压迫感",
    cinematic: "镜头感",
    "web-serial": "网文爽感",
    "lower-ai": "降低 AI 味"
  };

  function syncDashboardWordCount(content = currentContent.value) {
    if (!currentDashboard.value) return;
    currentDashboard.value = {
      ...currentDashboard.value,
      wordCount: countDraftWords(content),
      updatedAt: new Date().toISOString()
    };
  }

  function parseRecapCandidate(content?: string) {
    if (!content) return null;

    try {
      const parsed = JSON.parse(content) as Partial<WritingRecapCandidate>;
      if (!parsed || typeof parsed.summary !== "string" || !parsed.chapterId) return null;
      return {
        chapterId: parsed.chapterId,
        summary: parsed.summary,
        newFacts: Array.isArray(parsed.newFacts) ? parsed.newFacts : [],
        characterStateChanges: Array.isArray(parsed.characterStateChanges) ? parsed.characterStateChanges : [],
        foreshadowingUpdates: Array.isArray(parsed.foreshadowingUpdates) ? parsed.foreshadowingUpdates : [],
        continuityRisks: Array.isArray(parsed.continuityRisks) ? parsed.continuityRisks : [],
        powerProgressionUpdates: Array.isArray(parsed.powerProgressionUpdates) ? parsed.powerProgressionUpdates : [],
        createdAt: parsed.createdAt || new Date().toISOString(),
        summaryPatch: parsed.summaryPatch,
        emotionLedgerPatch: parsed.emotionLedgerPatch,
        factPatches: Array.isArray(parsed.factPatches) ? parsed.factPatches : undefined,
        ledgerPatches: Array.isArray(parsed.ledgerPatches) ? parsed.ledgerPatches : undefined,
        characterStatePatches: Array.isArray(parsed.characterStatePatches) ? parsed.characterStatePatches : undefined,
        riskPatches: Array.isArray(parsed.riskPatches) ? parsed.riskPatches : undefined
      };
    } catch {
      return null;
    }
  }

  function taskSortTime(task: NovelTask) {
    return Date.parse(task.finishedAt || task.cancelRequestedAt || task.startedAt || "") || 0;
  }

  function isTerminalTask(task: NovelTask) {
    return task.status === "success" || task.status === "error" || task.status === "cancelled";
  }

  function upsertTaskHistory(task: NovelTask) {
    const existingIndex = taskHistory.value.findIndex((item) => item.id === task.id);
    if (existingIndex >= 0) {
      taskHistory.value.splice(existingIndex, 1, task);
    } else {
      taskHistory.value.unshift(task);
    }
    taskHistory.value = [...taskHistory.value].sort((left, right) => taskSortTime(right) - taskSortTime(left));
  }

  async function loadTaskHistory() {
    if (!currentProject.value) return;
    try {
      taskHistory.value = await novelApi.listTasks(currentProject.value.slug);
    } catch {
      taskHistory.value = [];
    }
  }

  async function loadAiInvocations() {
    if (!currentProject.value) return;
    try {
      aiInvocations.value = await novelApi.readAiInvocations(currentProject.value.slug);
    } catch {
      aiInvocations.value = [];
    }
  }

  async function loadBackgroundJobs() {
    if (!currentProject.value) return;
    try {
      backgroundJobs.value = await novelApi.listBackgroundJobs(currentProject.value.slug);
    } catch {
      backgroundJobs.value = [];
    }
  }

  async function refreshAiInvocations() {
    if (!currentProject.value) return;
    try {
      aiInvocations.value = await novelApi.readAiInvocations(currentProject.value.slug);
    } catch {
      // Keep the completed task visible even if the audit log cannot be refreshed.
    }
  }

  function startTaskProgress(type: CodexTaskType | null = null) {
    activeTaskType.value = type;
    const agentLabel = currentProject.value?.ai?.profileId === "claude-code" ? "调用 Claude Code CLI" : "调用 AI 执行器";
    taskProgress.value = [
      { id: "context", label: "准备项目上下文", status: "running" },
      { id: "codex", label: agentLabel, status: "pending" },
      { id: "parse", label: "解析结构化结果", status: "pending" }
    ];
  }

  function setTaskProgress(id: string, status: TaskProgressStep["status"]) {
    taskProgress.value = taskProgress.value.map((step) => (step.id === id ? { ...step, status } : step));
  }

  function cloneSelection(anchor: EditorSelection): EditorSelection {
    return { ...anchor };
  }

  function withSelectionPatchAnchors(patches: NovelFilePatch[]) {
    const anchor = rewriteSelection.value || selection.value;
    if (!anchor) return patches;

    return patches.map((patch) => {
      if (patch.mode !== "replace-selection" || patch.selection || patch.target !== anchor.filePath) {
        return patch;
      }

      return {
        ...patch,
        selection: {
          start: anchor.start,
          end: anchor.end
        }
      };
    });
  }

  function normalizeCurrentChapterQualityRewrite(result: CodexTaskResult | null) {
    if (!result || !currentFilePath.value) return null;
    const currentFilePatch = result.patches.find(
      (patch) => patch.target === currentFilePath.value && patch.mode === "replace-file" && Boolean(patch.content.trim())
    );
    const firstReplacementPatch = result.patches.find((patch) => patch.mode === "replace-file" && Boolean(patch.content.trim()));
    const replacementContent = currentFilePatch?.content || result.content.trim() || firstReplacementPatch?.content || "";
    if (!replacementContent.trim()) return null;

    return {
      ...result,
      content: replacementContent,
      patches: [
        {
          target: currentFilePath.value,
          mode: "replace-file" as const,
          content: replacementContent
        }
      ]
    };
  }

  function finishTaskProgress(success: boolean) {
    const fallbackStatus = success ? "done" : "error";
    taskProgress.value = taskProgress.value.map((step) => ({
      ...step,
      status: step.status === "done" ? "done" : fallbackStatus
    }));
  }

  function resetActiveWorkspace() {
    invalidateWorkspaceLoadState();
    currentProject.value = null;
    creativeSession.value = null;
    understandingPreview.value = null;
    contextManifest.value = null;
    creativeSessionError.value = "";
    activeStoryBlueprint.value = null;
    storyBlueprintLoadVersion += 1;
    storyBlueprintLoadError.value = "";
    isLoadingStoryBlueprint.value = false;
    isAdvancingAuthorJourney.value = false;
    authorJourneyError.value = "";
    currentChapter.value = null;
    currentDocumentKind.value = "content";
    currentFilePath.value = "";
    currentContent.value = "";
    savedContent.value = "";
    lastSavedAt.value = "";
    selection.value = null;
    rewriteSelection.value = null;
    currentTask.value = null;
    activeTaskType.value = null;
    taskProgress.value = [];
    taskHistory.value = [];
    aiInvocations.value = [];
    backgroundJobs.value = [];
    rewriteCandidate.value = null;
    recapCandidate.value = null;
    currentQualityReport.value = null;
    currentSeriesQualityMetrics.value = null;
    styleTone.value = "elegant";
    focusTargetWords.value = DEFAULT_FOCUS_TARGET_WORDS;
    focusDraftInstruction.value = "";
    currentDashboard.value = null;
    currentChapterSummary.value = null;
    currentRuntimeSnapshot.value = null;
    runtimeStatus.value = null;
    runtimeEvents.value = [];
    isRuntimeEventsConnected.value = false;
    disconnectRuntimeEvents();
    sceneCards.value = [];
    storyControl.value = null;
    storyGraph.value = null;
    knowledgeIndex.value = null;
    knowledgeSearchResult.value = null;
    knowledgeRetrievalPreview.value = null;
    memoryHealthReport.value = null;
    memoryReadyProof.value = null;
    memoryContinuityAudit.value = null;
    auditReportPreview.value = null;
    fileVersions.value = [];
    currentFileDiff.value = null;
    isLoadingFileVersions.value = false;
    isLoadingFileDiff.value = false;
    savePipelineSteps.value = [];
    isRunningSavePipeline.value = false;
    isImprovingQualityMetrics.value = false;
    structureIdeaInput.value = "";
    structureDraftVersion.value = 0;
    activeLedgerKind.value = "foreshadowing";
    ledgerEntries.value = [];
    writingMode.value = "structure";
    supportContent.value = "";
    savedSupportContent.value = "";
  }

  function cacheCurrentWorkspace() {
    if (!currentProject.value) return;

    workspaceCache.value = {
      ...workspaceCache.value,
      [currentProject.value.slug]: {
        project: currentProject.value,
        chapterId: currentChapter.value?.id || null,
        documentKind: currentDocumentKind.value,
        filePath: currentFilePath.value,
        content: currentContent.value,
        savedContent: savedContent.value,
        lastSavedAt: lastSavedAt.value,
        selection: selection.value,
        rewriteSelection: rewriteSelection.value,
        currentTask: currentTask.value,
        taskProgress: taskProgress.value,
        taskHistory: taskHistory.value,
        aiInvocations: aiInvocations.value,
        rewriteCandidate: rewriteCandidate.value,
        recapCandidate: recapCandidate.value,
        qualityReport: currentQualityReport.value,
        seriesQualityMetrics: currentSeriesQualityMetrics.value,
        styleTone: styleTone.value,
        focusTargetWords: focusTargetWords.value,
        focusDraftInstruction: focusDraftInstruction.value,
        dashboard: currentDashboard.value,
        chapterSummary: currentChapterSummary.value,
        runtimeSnapshot: currentRuntimeSnapshot.value,
        sceneCards: sceneCards.value,
        storyControl: storyControl.value,
        storyGraph: storyGraph.value,
        knowledgeIndex: knowledgeIndex.value,
        structureIdeaInput: structureIdeaInput.value,
        structureDraftVersion: structureDraftVersion.value,
        ledgerKind: activeLedgerKind.value,
        ledgerEntries: ledgerEntries.value,
        writingMode: writingMode.value,
        supportPath: currentSupportPath.value,
        supportContent: supportContent.value,
        savedSupportContent: savedSupportContent.value
      }
    };
  }

  function restoreCachedWorkspace(project: NovelProject) {
    const cached = workspaceCache.value[project.slug];
    if (!cached) return false;
    const cachedChapter = cached.chapterId ? project.chapters.find((chapter) => chapter.id === cached.chapterId) : null;
    if (cached.chapterId && !cachedChapter) return false;
    const storedPreference = readStoredWorkspacePreference(project.slug);

    currentProject.value = project;
    currentChapter.value = cachedChapter || resolvePreferredChapter(project, storedPreference.chapterId);
    currentDocumentKind.value = normalizeStoredDocumentKind(cached.documentKind || storedPreference.documentKind);
    currentFilePath.value = cached.filePath;
    currentContent.value = cached.content;
    savedContent.value = cached.savedContent;
    lastSavedAt.value = cached.lastSavedAt;
    selection.value = cached.selection;
    rewriteSelection.value = cached.rewriteSelection || null;
    currentTask.value = cached.currentTask;
    taskProgress.value = cached.taskProgress;
    taskHistory.value = cached.taskHistory;
    aiInvocations.value = cached.aiInvocations || [];
    rewriteCandidate.value = cached.rewriteCandidate;
    recapCandidate.value = cached.recapCandidate;
    currentQualityReport.value = cached.qualityReport || null;
    currentSeriesQualityMetrics.value = cached.seriesQualityMetrics || null;
    styleTone.value = cached.styleTone || "elegant";
    focusTargetWords.value = cached.focusTargetWords || DEFAULT_FOCUS_TARGET_WORDS;
    focusDraftInstruction.value = cached.focusDraftInstruction || "";
    currentDashboard.value = cached.dashboard;
    currentChapterSummary.value = cached.chapterSummary || null;
    currentRuntimeSnapshot.value = cached.runtimeSnapshot || null;
    runtimeStatus.value = null;
    runtimeEvents.value = [];
    sceneCards.value = cached.sceneCards;
    storyControl.value = cached.storyControl;
    storyGraph.value = cached.storyGraph || null;
    knowledgeIndex.value = cached.knowledgeIndex || null;
    structureIdeaInput.value = cached.structureIdeaInput || "";
    structureDraftVersion.value = cached.structureDraftVersion || 0;
    activeLedgerKind.value = cached.ledgerKind;
    ledgerEntries.value = cached.ledgerEntries;
    writingMode.value = cached.writingMode || "structure";
    currentSupportPath.value = cached.supportPath;
    supportContent.value = cached.supportContent;
    savedSupportContent.value = cached.savedSupportContent;
    return true;
  }

  async function loadProjects() {
    projects.value = await novelApi.listProjects();
    openWorkspaceSlugs.value = openWorkspaceSlugs.value.filter((slug) =>
      projects.value.some((project) => project.slug === slug)
    );
  }

  async function loadPlatformLibrary() {
    platformLibrary.value = await novelApi.readPlatformLibrary();
  }

  async function loadAiStages() {
    aiStages.value = await novelApi.readAiStages();
  }

  async function loadAgentProfiles() {
    const data = await novelApi.readAgentProfiles();
    agentProfiles.value = data.profiles;
    agentChecks.value = data.checks;
    defaultAgentProfileId.value = data.defaultProfileId;
  }

  async function loadPlatformAiConfig() {
    platformAiConfig.value = await novelApi.readPlatformAiConfig();
  }

  async function checkAgentProfile(profileId: string, modelId?: string) {
    const result = await novelApi.checkAgentProfile(profileId, modelId);
    agentChecks.value = [...agentChecks.value.filter((item) => item.profileId !== result.profileId), result];
    return result;
  }

  async function updateProjectAiConfig(input: { profileId: string; modelId?: string }) {
    if (!currentProject.value) return null;
    isSavingAiConfig.value = true;
    try {
      const project = await novelApi.updateProjectAiConfig(currentProject.value.slug, input);
      currentProject.value = project;
      projects.value = projects.value.map((item) => (item.slug === project.slug ? project : item));
      if (workspaceCache.value[project.slug]) {
        workspaceCache.value[project.slug] = {
          ...workspaceCache.value[project.slug],
          project
        };
      }
      return project;
    } finally {
      isSavingAiConfig.value = false;
    }
  }

  async function savePlatformAiConfig(config: PlatformAiConfig) {
    isSavingAiConfig.value = true;
    try {
      platformAiConfig.value = await novelApi.savePlatformAiConfig(config);
      return platformAiConfig.value;
    } finally {
      isSavingAiConfig.value = false;
    }
  }

  async function createProject(input: { title?: string; genre?: string; roughIdea: string }) {
    if (!canLeaveCurrentWorkspace()) return;

    isLoading.value = true;
    error.value = "";
    try {
      const project = await novelApi.createProject(input);
      projects.value = [project, ...projects.value.filter((item) => item.slug !== project.slug)];
      await openProject(project);
      return project;
    } catch (err) {
      error.value = errorText(err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function importProject(input: {
    sourcePath: string;
    title?: string;
    genre?: string;
    roughIdea?: string;
    files?: Array<{ relativePath: string; content: string }>;
  }) {
    if (!canLeaveCurrentWorkspace()) return;

    isLoading.value = true;
    error.value = "";
    try {
      const project = await novelApi.importProject(input);
      projects.value = [project, ...projects.value.filter((item) => item.slug !== project.slug)];
      await openProject(project);
      return project;
    } catch (err) {
      error.value = errorText(err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteProject(project: NovelProject) {
    isLoading.value = true;
    error.value = "";
    try {
      await novelApi.deleteProject(project.slug);
      projects.value = projects.value.filter((item) => item.slug !== project.slug);
      openWorkspaceSlugs.value = openWorkspaceSlugs.value.filter((slug) => slug !== project.slug);
      const restCache = { ...workspaceCache.value };
      delete restCache[project.slug];
      workspaceCache.value = restCache;
      if (currentProject.value?.slug === project.slug) {
        resetActiveWorkspace();
      }
      return true;
    } catch (err) {
      error.value = errorText(err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function createSharedAsset(input: {
    name: string;
    type?: PlatformAssetType;
    tags?: string[];
    filePath?: string;
    projectSlug?: string;
  }) {
    const asset = await novelApi.createPlatformAsset({
      ...input,
      scope: "shared",
      projectSlug: input.projectSlug || currentProject.value?.slug
    });
    await loadPlatformLibrary();
    return asset;
  }

  async function linkSharedAsset(asset: PlatformAsset) {
    if (!currentProject.value) return;
    const linked = await novelApi.linkPlatformAsset(asset.id, currentProject.value.slug);
    if (platformLibrary.value) {
      platformLibrary.value = {
        ...platformLibrary.value,
        assets: platformLibrary.value.assets.map((item) => (item.id === linked.id ? linked : item))
      };
    } else {
      await loadPlatformLibrary();
    }
  }

  async function loadChapterCockpit(chapterId: string, loadState?: ChapterLoadState) {
    const projectSlug = loadState?.projectSlug || currentProject.value?.slug;
    if (!projectSlug) return;
    const [dashboard, cards, summary, qualityReport, runtimeSnapshot, seriesQualityMetrics] = await Promise.all([
      novelApi.readChapterDashboard(projectSlug, chapterId),
      novelApi.readSceneCards(projectSlug, chapterId),
      novelApi.readChapterSummary(projectSlug, chapterId),
      novelApi.readChapterQualityReport(projectSlug, chapterId),
      novelApi.readCreationRuntimeSnapshot(projectSlug, chapterId),
      novelApi.readSeriesQualityMetrics(projectSlug)
    ]);
    if (loadState && !isChapterLoadCurrent(loadState)) return;
    currentDashboard.value = {
      ...dashboard,
      wordCount: countDraftWords(currentContent.value)
    };
    sceneCards.value = cards;
    currentChapterSummary.value = summary;
    currentQualityReport.value = qualityReport;
    currentRuntimeSnapshot.value = runtimeSnapshot;
    currentSeriesQualityMetrics.value = seriesQualityMetrics;
  }

  async function loadSeriesQualityMetrics() {
    if (!currentProject.value) return;
    currentSeriesQualityMetrics.value = await novelApi.readSeriesQualityMetrics(currentProject.value.slug);
  }

  async function loadCreationRuntimeSnapshot(chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId) {
    if (!currentProject.value || !chapterId) return;
    currentRuntimeSnapshot.value = await novelApi.readCreationRuntimeSnapshot(currentProject.value.slug, chapterId);
  }

  async function loadRuntimeStatus() {
    if (!currentProject.value) return null;
    runtimeStatus.value = await novelApi.readRuntimeStatus(currentProject.value.slug);
    runtimeEvents.value = runtimeStatus.value.events.slice(-100);
    return runtimeStatus.value;
  }

  function scheduleRuntimeStatusRefresh(delayMs = 120) {
    if (runtimeStatusRefreshTimer) return;
    runtimeStatusRefreshTimer = setTimeout(() => {
      runtimeStatusRefreshTimer = null;
      loadRuntimeStatus().catch(() => undefined);
    }, delayMs);
  }

  function applyRuntimeEventToStatus(event: RuntimeEvent) {
    const status = runtimeStatus.value;
    if (!status?.activeRun || !event.runId || status.activeRun.id !== event.runId) return;

    if (event.type === "stage" && event.stage) {
      runtimeStatus.value = {
        ...status,
        activeRun: {
          ...status.activeRun,
          status: "running",
          currentStage: event.stage,
          updatedAt: event.createdAt || status.activeRun.updatedAt
        }
      };
    }
  }

  function disconnectRuntimeEvents() {
    if (runtimeStatusRefreshTimer) {
      clearTimeout(runtimeStatusRefreshTimer);
      runtimeStatusRefreshTimer = null;
    }
    runtimeEventSource?.close();
    runtimeEventSource = null;
    isRuntimeEventsConnected.value = false;
  }

  function connectRuntimeEvents() {
    if (!currentProject.value) return;
    if (typeof EventSource === "undefined") {
      isRuntimeEventsConnected.value = false;
      return;
    }
    const projectSlug = currentProject.value.slug;
    disconnectRuntimeEvents();
    const lastEventId = runtimeEvents.value.at(-1)?.id || 0;
    const source = new EventSource(novelApi.runtimeEventsUrl(projectSlug, lastEventId));
    runtimeEventSource = source;
    source.onopen = () => {
      isRuntimeEventsConnected.value = true;
    };
    source.onerror = () => {
      isRuntimeEventsConnected.value = false;
    };
    source.onmessage = (event) => mergeRuntimeEvent(event.data);
    for (const type of ["command", "run", "stage", "checkpoint", "write", "quality", "review", "error", "system"]) {
      source.addEventListener(type, (event) => mergeRuntimeEvent((event as MessageEvent).data));
    }
  }

  function mergeRuntimeEvent(raw: string) {
    if (!raw) return;
    try {
      const event = JSON.parse(raw) as RuntimeEvent;
      if (!event.id || runtimeEvents.value.some((item) => item.id === event.id)) return;
      runtimeEvents.value = [...runtimeEvents.value, event].sort((left, right) => left.id - right.id).slice(-160);
      applyRuntimeEventToStatus(event);
      if (["command", "run", "stage", "checkpoint", "write", "quality", "review", "error"].includes(event.type)) {
        scheduleRuntimeStatusRefresh();
      }
      if (event.type === "review" && typeof event.payload?.candidateId === "string") {
        loadProseCandidates().catch(() => undefined);
      }
      if (event.type === "write" && currentProject.value && currentChapter.value && event.payload?.path === currentFilePath.value) {
        openChapter(currentChapter.value, currentDocumentKind.value, { skipLeaveCheck: true }).catch(() => undefined);
      }
    } catch {
      // Ignore malformed SSE payloads from interrupted connections.
    }
  }

  async function startAutopilotRuntime(input: string | { direction?: string; autoContinue?: boolean } = "") {
    if (!currentProject.value || !currentChapter.value || isStartingRuntime.value) return null;
    const direction = typeof input === "string" ? input : input.direction || "";
    const autoContinue = typeof input === "object" && input.autoContinue === true;
    isStartingRuntime.value = true;
    try {
      const result = await novelApi.startRuntime(currentProject.value.slug, {
        chapterId: currentChapter.value.id,
        direction,
        autoContinue,
        requireExecutionReady: true
      });
      await loadRuntimeStatus();
      connectRuntimeEvents();
      return result;
    } finally {
      isStartingRuntime.value = false;
    }
  }

  async function pauseAutopilotRuntime() {
    if (!currentProject.value) return;
    await novelApi.pauseRuntime(currentProject.value.slug, activeRuntimeRun.value?.id);
    await loadRuntimeStatus();
  }

  async function resumeAutopilotRuntime() {
    if (!currentProject.value) return;
    await novelApi.resumeRuntime(currentProject.value.slug, activeRuntimeRun.value?.id);
    await loadRuntimeStatus();
    connectRuntimeEvents();
  }

  async function stopAutopilotRuntime() {
    if (!currentProject.value) return;
    await novelApi.stopRuntime(currentProject.value.slug, activeRuntimeRun.value?.id);
    await loadRuntimeStatus();
  }

  async function acceptAutopilotReview() {
    if (!currentProject.value) return;
    await novelApi.acceptRuntimeReview(currentProject.value.slug, activeRuntimeRun.value?.id);
    await loadRuntimeStatus();
  }

  async function rewriteAutopilotReview(direction = "") {
    if (!currentProject.value) return;
    await novelApi.rewriteRuntimeReview(currentProject.value.slug, { runId: activeRuntimeRun.value?.id, direction });
    await loadRuntimeStatus();
    connectRuntimeEvents();
  }

  async function sendAutopilotDirection(direction: string) {
    if (!currentProject.value || !direction.trim()) return;
    await novelApi.sendRuntimeDirection(currentProject.value.slug, { runId: activeRuntimeRun.value?.id, direction });
    await loadRuntimeStatus();
  }

  async function createAutopilotDerivative(input: { title: string; type?: "side_story" | "branch" | "adaptation"; direction?: string }) {
    if (!currentProject.value) return null;
    const result = await novelApi.createRuntimeDerivative(currentProject.value.slug, {
      baseRunId: activeRuntimeRun.value?.id,
      sourceChapterId: currentChapter.value?.id,
      ...input
    });
    await loadRuntimeStatus();
    return result;
  }

  async function mergeAutopilotDerivative(
    branchId: string,
    input: { note?: string; mode?: "new_chapter" | "replace_source_chapter"; draftContent?: string } = {}
  ) {
    if (!currentProject.value || !branchId) return null;
    const projectSlug = currentProject.value.slug;
    const result = await novelApi.mergeRuntimeDerivative(projectSlug, branchId, input);
    if (result.chapterId) {
      await loadProjects();
      const mergedProject = projects.value.find((project) => project.slug === projectSlug);
      if (mergedProject) {
        await openProject(mergedProject, { skipLeaveCheck: true });
      }
    }
    await loadRuntimeStatus();
    return result;
  }

  async function restoreAutopilotCheckpoint(checkpointId: string) {
    if (!currentProject.value || !checkpointId) return;
    await novelApi.restoreRuntimeCheckpoint(currentProject.value.slug, checkpointId);
    await loadRuntimeStatus();
    if (currentChapter.value) {
      await openChapter(currentChapter.value, currentDocumentKind.value, { skipLeaveCheck: true });
    }
  }

  async function loadStoryControl() {
    if (!currentProject.value) return;
    storyControl.value = await novelApi.readStoryControl(currentProject.value.slug);
  }

  async function loadStoryGraph() {
    if (!currentProject.value) return;
    try {
      storyGraph.value = await novelApi.readStoryGraph(currentProject.value.slug);
    } catch {
      storyGraph.value = null;
    }
  }

  async function loadKnowledgeIndex() {
    if (!currentProject.value) return;
    try {
      const projectId = currentProject.value.slug;
      knowledgeIndex.value = await novelApi.readKnowledgeIndex(projectId);
      const retrievalId = readStoredRetrievalPreviewId(projectId);
      if (retrievalId) {
        try {
          knowledgeRetrievalPreview.value = await novelApi.readMemoryRetrievalPreview(projectId, retrievalId);
        } catch {
          writeStoredRetrievalPreviewId(projectId, null);
          knowledgeRetrievalPreview.value = null;
        }
      }
      const governanceIds = readStoredMemoryGovernanceIds(projectId);
      if (governanceIds.healthReportId) {
        try { memoryHealthReport.value = await novelApi.readMemoryHealthReport(projectId, governanceIds.healthReportId); } catch { memoryHealthReport.value = null; }
      }
      if (governanceIds.continuityAuditId) {
        try { memoryContinuityAudit.value = await novelApi.readMemoryContinuityAudit(projectId, governanceIds.continuityAuditId); } catch { memoryContinuityAudit.value = null; }
      }
      if (governanceIds.readyProofId) {
        try { memoryReadyProof.value = await novelApi.readMemoryReadyProof(projectId, governanceIds.readyProofId); } catch { memoryReadyProof.value = null; }
      }
    } catch {
      knowledgeIndex.value = null;
    }
  }

  async function rebuildKnowledgeIndex() {
    if (!currentProject.value) return;
    isRebuildingKnowledgeIndex.value = true;
    try {
      const projectId = currentProject.value.slug;
      await runCurrentProjectBackgroundJob("knowledge.index.rebuild", { source: "workspace" }, "知识索引重建失败");
      knowledgeIndex.value = await novelApi.readKnowledgeIndex(projectId);
      knowledgeSearchResult.value = null;
      knowledgeRetrievalPreview.value = null;
      writeStoredRetrievalPreviewId(projectId, null);
      await loadStoryGraph();
    } finally {
      isRebuildingKnowledgeIndex.value = false;
    }
  }

  async function rebuildSeriesQualityMetrics() {
    if (!currentProject.value) return;
    isRebuildingSeriesQualityMetrics.value = true;
    try {
      const projectId = currentProject.value.slug;
      await runCurrentProjectBackgroundJob("quality.series.rebuild", { source: "workspace" }, "全书质量指标重建失败");
      currentSeriesQualityMetrics.value = await novelApi.readSeriesQualityMetrics(projectId);
    } finally {
      isRebuildingSeriesQualityMetrics.value = false;
    }
  }

  async function rebuildStoryGraph() {
    if (!currentProject.value) return;
    isRebuildingStoryGraph.value = true;
    try {
      const projectId = currentProject.value.slug;
      await runCurrentProjectBackgroundJob("story.graph.rebuild", { source: "workspace" }, "故事图谱重建失败");
      storyGraph.value = await novelApi.readStoryGraph(projectId);
    } finally {
      isRebuildingStoryGraph.value = false;
    }
  }

  async function runCurrentProjectBackgroundJob(
    type: BackgroundJobType,
    payload: Record<string, unknown>,
    errorMessage: string
  ): Promise<BackgroundJob> {
    if (!currentProject.value) {
      throw new Error("未打开项目");
    }
    const startedJob = await novelApi.startBackgroundJob(currentProject.value.slug, type, payload);
    upsertBackgroundJob(startedJob);
    const finishedJob = await waitForBackgroundJob(currentProject.value.slug, startedJob.id);
    upsertBackgroundJob(finishedJob);
    if (finishedJob.status === "error") {
      throw new Error(finishedJob.error || errorMessage);
    }
    return finishedJob;
  }

  async function enqueueCurrentProjectBackgroundJob(type: BackgroundJobType, payload: Record<string, unknown>): Promise<BackgroundJob> {
    if (!currentProject.value) {
      throw new Error("未打开项目");
    }
    const startedJob = await novelApi.startBackgroundJob(currentProject.value.slug, type, payload);
    upsertBackgroundJob(startedJob);
    return startedJob;
  }

  async function cancelBackgroundJob(jobId: string): Promise<BackgroundJob | null> {
    if (!currentProject.value) return null;
    const job = await novelApi.cancelBackgroundJob(currentProject.value.slug, jobId);
    upsertBackgroundJob(job);
    return job;
  }

  async function retryBackgroundJob(jobId: string): Promise<BackgroundJob | null> {
    if (!currentProject.value) return null;
    const startedJob = await novelApi.retryBackgroundJob(currentProject.value.slug, jobId);
    upsertBackgroundJob(startedJob);
    const finishedJob = await waitForBackgroundJob(currentProject.value.slug, startedJob.id);
    upsertBackgroundJob(finishedJob);
    return finishedJob;
  }

  function upsertBackgroundJob(job: BackgroundJob) {
    backgroundJobs.value = [job, ...backgroundJobs.value.filter((item) => item.id !== job.id)].sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    );
  }

  async function waitForBackgroundJob(projectId: string, jobId: string): Promise<BackgroundJob> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const job = await novelApi.readBackgroundJob(projectId, jobId);
      upsertBackgroundJob(job);
      if (job.status === "success" || job.status === "error" || job.status === "cancelled") {
        return job;
      }
      await wait(500);
    }
    throw new Error("后台作业超时");
  }

  async function waitForTask(projectId: string, startedTask: NovelTask): Promise<NovelTask> {
    const timeoutMs = Math.max(startedTask.timeoutMs || 600_000, 60_000) + 30_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const task = await novelApi.readTask(projectId, startedTask.id);
      currentTask.value = task;
      upsertTaskHistory(task);
      if (isTerminalTask(task)) {
        return task;
      }
      await wait(500);
    }
    throw new Error("AI 任务轮询超时");
  }

  const savePipelineStepLabels: Record<SavePipelineStepId, string> = {
    save: "保存",
    recap: "章后回顾",
    runtime: "运行快照",
    quality: "质量重建",
    knowledge: "知识索引",
    story: "故事图谱"
  };

  const savePipelineStepOrder: SavePipelineStepId[] = ["save", "recap", "runtime", "quality", "knowledge", "story"];
  const savePipelineAfterSaveSteps: SavePipelineStepId[] = ["recap", "runtime", "quality", "knowledge", "story"];

  function makeSavePipelineSteps(): SavePipelineStep[] {
    return savePipelineStepOrder.map((id) => ({
      id,
      label: savePipelineStepLabels[id],
      status: "pending"
    }));
  }

  function setAutoRunSavePipeline(value: boolean) {
    autoRunSavePipeline.value = value;
  }

  function updateSavePipelineStep(id: SavePipelineStepId, status: SavePipelineStepStatus, detail?: string) {
    savePipelineSteps.value = savePipelineSteps.value.map((step) => (step.id === id ? { ...step, status, detail } : step));
  }

  function skipSavePipelineSteps(ids: SavePipelineStepId[], detail: string) {
    for (const id of ids) {
      updateSavePipelineStep(id, "skipped", detail);
    }
  }

  function pipelineErrorMessage(err: unknown) {
    return errorText(err);
  }

  async function enqueueSavePipelineBackgroundJob(stepId: SavePipelineStepId, type: BackgroundJobType, payload: Record<string, unknown>) {
    updateSavePipelineStep(stepId, "running", "正在加入后台队列");
    try {
      const job = await enqueueCurrentProjectBackgroundJob(type, payload);
      updateSavePipelineStep(stepId, "queued", `已加入后台队列：${job.id}`);
      return job;
    } catch (err) {
      const message = pipelineErrorMessage(err);
      updateSavePipelineStep(stepId, "error", message);
      error.value = message;
      return null;
    }
  }

  async function runPostSavePipeline(previousContent = savedContent.value) {
    if (isRunningSavePipeline.value) return;
    savePipelineSteps.value = makeSavePipelineSteps();
    updateSavePipelineStep("save", "done", "当前文档已保存");

    const chapterId = currentChapter.value?.id || currentDashboard.value?.chapterId;
    if (!currentProject.value || !chapterId) {
      skipSavePipelineSteps(savePipelineAfterSaveSteps, "未打开章节");
      return;
    }

    if (currentDocumentKind.value !== "content") {
      skipSavePipelineSteps(savePipelineAfterSaveSteps, "仅章节正文保存后运行");
      return;
    }

    isRunningSavePipeline.value = true;
    let activeStep: SavePipelineStepId = "recap";
    try {
      activeStep = "recap";
      updateSavePipelineStep("recap", "running", "抽取本次保存带来的事实变化");
      const recapTask = await runTask("writing.recap", {
        mode: "chapter.save.pipeline",
        previousTail: previousContent.slice(-1600),
        currentTail: currentContent.value.slice(-1600),
        changedCharCount: Math.abs(currentContent.value.length - previousContent.length),
        instruction:
          "请只复盘本次章节保存带来的事实变化，生成可由作者确认后写入账本的 WritingRecapCandidate JSON；不要改写正文，也不要自动应用账本。"
      });
      updateSavePipelineStep("recap", "done", recapCandidate.value ? "已生成待确认回顾" : "任务完成，未解析到回顾候选");

      if (!recapTask || recapTask.status === "error" || recapTask.status === "cancelled") {
        throw new Error(recapTask?.error || (recapTask?.status === "cancelled" ? "AI 任务已取消" : "章后回顾失败"));
      }

      activeStep = "runtime";
      updateSavePipelineStep("runtime", "running", "刷新创作闭环快照");
      await loadCreationRuntimeSnapshot(chapterId);
      updateSavePipelineStep("runtime", "done", "运行快照已刷新");

      await Promise.all([
        enqueueSavePipelineBackgroundJob("quality", "quality.series.rebuild", { source: "save-pipeline", chapterId }),
        enqueueSavePipelineBackgroundJob("knowledge", "knowledge.index.rebuild", { source: "save-pipeline", chapterId }),
        enqueueSavePipelineBackgroundJob("story", "story.graph.rebuild", { source: "save-pipeline", chapterId })
      ]);
    } catch (err) {
      const message = pipelineErrorMessage(err);
      error.value = message;
      updateSavePipelineStep(activeStep, "error", message);
      const remaining = savePipelineAfterSaveSteps.slice(savePipelineAfterSaveSteps.indexOf(activeStep) + 1);
      skipSavePipelineSteps(remaining, "前序步骤失败后跳过");
    } finally {
      isRunningSavePipeline.value = false;
    }
  }

  async function runPostSavePipelineFromCurrentContent() {
    await runPostSavePipeline(savedContent.value);
  }

  async function searchKnowledgeIndex(query: string) {
    if (!currentProject.value) return null;
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      knowledgeSearchResult.value = null;
      return null;
    }

    isSearchingKnowledge.value = true;
    try {
      const result = await novelApi.searchKnowledgeIndex(currentProject.value.slug, {
        query: normalizedQuery,
        task: "knowledge-index-search",
        chapterId: currentChapter.value?.id,
        limit: 12
      });
      knowledgeSearchResult.value = result;
      knowledgeRetrievalPreview.value = await novelApi.createMemoryRetrievalPreview(currentProject.value.slug, {
        query: normalizedQuery,
        task: "knowledge-index-search",
        chapterId: currentChapter.value?.id,
        limit: 12,
        maxResults: 12
      });
      writeStoredRetrievalPreviewId(currentProject.value.slug, knowledgeRetrievalPreview.value.retrievalId);
      return result;
    } finally {
      isSearchingKnowledge.value = false;
    }
  }

  function updateStoryControl(patch: Partial<StoryControl>) {
    if (!storyControl.value) return;
    storyControl.value = {
      ...storyControl.value,
      ...patch,
      version: 1,
      updatedAt: new Date().toISOString()
    };
  }

  async function saveStoryControl() {
    if (!currentProject.value || !storyControl.value) return;
    isSavingStoryControl.value = true;
    try {
      storyControl.value = await novelApi.saveStoryControl(currentProject.value.slug, storyControl.value);
      await loadStoryGraph();
      await loadKnowledgeIndex();
    } finally {
      isSavingStoryControl.value = false;
    }
  }

  function updateDashboard(patch: Partial<ChapterDashboard>) {
    if (!currentDashboard.value) return;
    currentDashboard.value = {
      ...currentDashboard.value,
      ...patch,
      chapterId: currentDashboard.value.chapterId,
      updatedAt: new Date().toISOString()
    };
  }

  async function saveCurrentDashboard() {
    if (!currentProject.value || !currentDashboard.value) return;
    isSavingDashboard.value = true;
    try {
      currentDashboard.value = await novelApi.saveChapterDashboard(currentProject.value.slug, currentDashboard.value);
      await loadCreationRuntimeSnapshot(currentDashboard.value.chapterId);
    } finally {
      isSavingDashboard.value = false;
    }
  }

  function updateSceneCards(cards: SceneCard[]) {
    sceneCards.value = cards;
  }

  async function saveCurrentSceneCards() {
    if (!currentProject.value || !currentChapter.value) return;
    isSavingScenes.value = true;
    try {
      sceneCards.value = await novelApi.saveSceneCards(currentProject.value.slug, currentChapter.value.id, sceneCards.value);
      await loadCreationRuntimeSnapshot(currentChapter.value.id);
    } finally {
      isSavingScenes.value = false;
    }
  }

  async function saveCurrentStructure() {
    await Promise.all([saveCurrentDashboard(), saveCurrentSceneCards()]);
  }

  function updateStructureIdeaInput(value: string) {
    structureIdeaInput.value = value;
  }

  function applyLocalReverseStructure(content: string, chapterId: string) {
    const units = splitTextUnitsHelper(content);
    const conflict = pickConflictHelper(units);
    return applyGeneratedStructure(
      {
        goal: `反写：梳理“${compactSnippet(units[0] || content, 28)}”这一章的目标、阻力和结尾钩子。`,
        pov: inferPov(content),
        mainConflict: compactSnippet(conflict || "主角需要在目标与代价之间做选择。", 54),
        endingHook: compactSnippet(units[units.length - 1] || content, 54),
        status: countDraftWordsHelper(content) > 80 ? "drafted" : "drafting"
      },
      buildSceneCardsFromDraft(content, chapterId)
    );
  }

  async function reverseEngineerStructureFromDraft() {
    if (isReverseEngineeringStructure.value) return false;
    const content = currentContent.value.trim();
    const chapterId = currentDashboard.value?.chapterId || currentChapter.value?.id;
    if (!currentProject.value || !chapterId || !content || !canReverseEngineerStructure.value) return false;

    isReverseEngineeringStructure.value = true;
    isLoading.value = true;
    error.value = "";
    startTaskProgress("structure.reverse");
    try {
      setTaskProgress("context", "done");
      setTaskProgress("codex", "running");
      const task = await novelApi.runTask(currentProject.value.slug, "structure.reverse", {
        chapterId,
        documentKind: currentDocumentKind.value,
        filePath: currentFilePath.value,
        draftContent: content,
        existingDashboard: currentDashboard.value,
        existingSceneCards: sceneCards.value,
        storyControl: storyControl.value,
        feedback: [
          "请从当前章节正文反向分析章节结构，生成更完整的章节仪表盘和场景卡。",
          "只提取真实叙事场景，过滤标题、写作日期、版本号、Markdown 标记、导入噪声和说明文字。",
          "场景卡不能只复述短句：每张卡都要有具体冲突、转折、释放信息和正文锚点。"
        ].join("\n")
      });
      setTaskProgress("codex", "done");
      setTaskProgress("parse", "running");
      currentTask.value = task;
      taskHistory.value.unshift(task);
      await refreshAiInvocations();

      const parsed = task.result ? parseReverseStructureResult(task.result.content, chapterId) : null;
      if (!parsed || task.status === "error") {
        error.value = task.error || "AI 反写结果无法解析，已使用本地兜底结构。";
        const generated = applyLocalReverseStructure(content, chapterId);
        setTaskProgress("parse", generated ? "error" : "done");
        return generated;
      }

      rewriteCandidate.value = null;
      rewriteSelection.value = null;
      recapCandidate.value = null;
      const generated = applyGeneratedStructure(parsed.dashboardPatch, parsed.cards);
      setTaskProgress("parse", generated ? "done" : "error");
      return generated;
    } catch (err) {
      error.value = `AI 反写失败，已使用本地兜底：${errorText(err)}`;
      finishTaskProgress(false);
      return applyLocalReverseStructure(content, chapterId);
    } finally {
      isReverseEngineeringStructure.value = false;
      isLoading.value = false;
    }
  }

  function generateStructureFromIdea(input = structureIdeaInput.value) {
    const idea = (input || currentProject.value?.roughIdea || currentChapter.value?.title || "").trim();
    const chapterId = currentDashboard.value?.chapterId || currentChapter.value?.id;
    if (!chapterId || !idea) return false;

    structureIdeaInput.value = idea;
    return applyGeneratedStructure(
      {
        goal: `根据想法搭建：${compactSnippet(idea, 46)}`,
        pov: "主角限知视角",
        mainConflict: "主角必须在目标、阻力和代价之间做选择。",
        endingHook: "结尾留下一个会逼迫主角进入下一步行动的问题。",
        status: "planned"
      },
      buildSceneCardsFromIdea(idea, chapterId)
    );
  }

  async function loadLedger(kind: LedgerKind = activeLedgerKind.value) {
    if (!currentProject.value) return;
    activeLedgerKind.value = kind;
    ledgerEntries.value = await novelApi.readLedgerEntries(currentProject.value.slug, kind);
  }

  async function saveLedger(kind: LedgerKind = activeLedgerKind.value, entries: LedgerEntry[] = ledgerEntries.value) {
    if (!currentProject.value) return;
    activeLedgerKind.value = kind;
    ledgerEntries.value = await novelApi.saveLedgerEntries(currentProject.value.slug, kind, entries);
  }

  function updateLedgerEntries(entries: LedgerEntry[]) {
    ledgerEntries.value = entries;
  }

  function setWritingMode(mode: WritingMode) {
    writingMode.value = mode;
  }

  function updateFocusTargetWords(value: number) {
    const nextValue = Number.isFinite(value) ? value : DEFAULT_FOCUS_TARGET_WORDS;
    focusTargetWords.value = Math.max(300, Math.min(12000, Math.round(nextValue)));
  }

  function updateFocusDraftInstruction(value: string) {
    focusDraftInstruction.value = value.slice(0, 240);
  }

  async function requestFocusDraft() {
    if (!currentProject.value || !currentChapter.value || !canRequestFocusDraft.value) return;
    const guide = focusWritingGuide.value;
    const authorInstruction = focusDraftInstruction.value.trim();
    await runTask("chapter.draft", {
      mode: "focus.next-draft",
      feedback: [
        guide.prompt,
        authorInstruction ? `作者微调指令：${authorInstruction}` : "",
        "",
        "请只生成可以直接接在当前正文后面的一段或数段候选正文。",
        "不要重写已有正文，不要输出整章，不要解释写作方法。",
        "候选正文需要自然承接当前章尾，优先推进下一笔，不要提前泄露叙事视角角色不知道的信息。"
      ].join("\n"),
      focusGuide: guide,
      authorInstruction,
      appendAfterCurrentDraft: true,
      currentTail: currentContent.value.slice(-1200)
    });
  }

  async function requestFocusDraftRevision(direction: string) {
    if (!currentProject.value || !currentChapter.value || !canRequestFocusDraft.value || !rewriteCandidate.value?.content.trim()) {
      return false;
    }
    const guide = focusWritingGuide.value;
    const authorInstruction = focusDraftInstruction.value.trim();
    await runTask("chapter.draft", {
      mode: "focus.refine-draft",
      feedback: [
        guide.prompt,
        authorInstruction ? `作者微调指令：${authorInstruction}` : "",
        "",
        `请基于当前候选正文再改一版，调校方向：${direction}。`,
        "保留候选正文承接章尾和推进下一笔的功能，不要改写已有正文，不要输出整章。",
        "只输出可以直接追加到正文末尾的候选正文，不要解释写作方法。",
        "",
        "当前候选正文：",
        rewriteCandidate.value.content
      ].join("\n"),
      focusGuide: guide,
      authorInstruction,
      revisionDirection: direction,
      currentCandidate: rewriteCandidate.value.content,
      appendAfterCurrentDraft: true,
      currentTail: currentContent.value.slice(-1200)
    });
    return true;
  }

  async function requestWritingRecap() {
    if (isLoading.value) return;
    await runTask("writing.recap");
  }

  async function runCreationLoopAction(action: CreationLoopAction) {
    if (action === "open-structure") {
      setWritingMode("structure");
      return;
    }
    if (action === "open-focus") {
      setWritingMode("focus");
      return;
    }
    if (action === "open-review") {
      setWritingMode("review");
      return;
    }
    if (action === "save-draft") {
      await saveCurrentContent();
      return;
    }
    if (action === "diagnose") {
      setWritingMode("review");
      await diagnoseCurrentChapter();
      return;
    }
    if (action === "request-recap") {
      await requestWritingRecap();
      return;
    }
    if (action === "accept-recap") {
      await acceptWritingRecap();
    }
  }

  async function requestStoryOrchestration() {
    if (!currentProject.value || !storyControl.value || !canRequestStoryOrchestration.value) return;
    await runTask("idea.suggest", {
      mode: "story-control.orchestrate",
      feedback: [
        "请基于故事总控台、当前章节、角色状态、事件池、升级节奏和未回收伏笔，编排未来 3-8 章路线。",
        "输出需要说明：每章目标、参与角色、触发事件或秘境、冲突、收益、代价、升级是否可信、需要提前埋的伏笔。",
        "优先让事件由角色动机和代价触发，不要让主角无因刷副本，不要跳级，不要泄露叙事视角角色尚不知道的信息。",
        "如果某个事件池条目不适合当前阶段，请明确说明原因并给出替代安排。"
      ].join("\n"),
      storyControl: storyControl.value
    });
  }

  async function acceptWritingRecap() {
    if (!currentProject.value || !recapCandidate.value) return;
    const accepted = await novelApi.acceptWritingRecap(currentProject.value.slug, recapCandidate.value);
    currentChapterSummary.value = accepted.summary;
    ledgerEntries.value = await novelApi.readLedgerEntries(currentProject.value.slug, activeLedgerKind.value);
    await rebuildKnowledgeIndex();
    await loadCreationRuntimeSnapshot(accepted.summary.chapterId);
    recapCandidate.value = null;
  }

  function rejectWritingRecap() {
    recapCandidate.value = null;
  }

  async function openProject(project: NovelProject, options: WorkspaceSwitchOptions = {}) {
    if (currentProject.value?.slug !== project.slug && !options.skipLeaveCheck && !canLeaveCurrentWorkspace()) return;

    const workspaceLoad = beginWorkspaceLoad(project.slug);
    cacheCurrentWorkspace();
    if (!openWorkspaceSlugs.value.includes(project.slug)) {
      openWorkspaceSlugs.value = [...openWorkspaceSlugs.value, project.slug];
    }

    if (restoreCachedWorkspace(project)) {
      if (!isWorkspaceLoadCurrent(workspaceLoad)) return;
      await loadRuntimeStatus().catch(() => undefined);
      await loadCreativeSession();
      await loadCreativeJourney();
      await loadLatestStoryBlueprint();
      await loadContractCandidates();
      await loadContractAdoptionProposal();
      await loadOutlineCandidates();
      await loadOutlineAdoptionProposal();
      await loadExecutionReadyProof();
      await loadExecutionWorkItems();
      await loadBookRuns();
      await loadProseCandidates();
      await loadQualityCalibrationEvidence();
      await loadReleaseAcceptance();
      await loadReleaseActivation();
      await loadLengthPlanning();
      await loadUnderstandingReview();
      await loadMigrationCutover();
      await loadUnderstandingPreview();
      await loadDialogueQuestions();
      await loadContextManifest();
      if (!isWorkspaceLoadCurrent(workspaceLoad)) return;
      connectRuntimeEvents();
      return;
    }

    currentProject.value = project;
    creativeSession.value = null;
    creativeJourney.value = null;
    understandingPreview.value = null;
    dialogueQuestions.value = [];
    dialogueQuestionLoadVersion += 1;
    isLoadingDialogueQuestions.value = false;
    dialogueQuestionsError.value = "";
    contextManifest.value = null;
    creativeSessionError.value = "";
    activeStoryBlueprint.value = null;
    storyBlueprintLoadVersion += 1;
    storyBlueprintLoadError.value = "";
    isLoadingStoryBlueprint.value = false;
    isAdvancingAuthorJourney.value = false;
    authorJourneyError.value = "";
    contractCandidates.value = [];
    contractCandidatesError.value = "";
    const storedPreference = readStoredWorkspacePreference(project.slug);
    currentDocumentKind.value = normalizeStoredDocumentKind(storedPreference.documentKind);
    const chapter = resolvePreferredChapter(project, storedPreference.chapterId);
    if (chapter) {
      await openChapter(chapter, currentDocumentKind.value, { skipLeaveCheck: true });
      if (!isWorkspaceLoadCurrent(workspaceLoad)) return;
    }
    await openSupportFile(currentSupportPath.value, { skipLeaveCheck: true });
    if (!isWorkspaceLoadCurrent(workspaceLoad)) return;
    await Promise.all([
      loadStoryControl(),
      loadStoryGraph(),
      loadKnowledgeIndex(),
      loadLedger(activeLedgerKind.value),
      loadTaskHistory(),
      loadAiInvocations(),
      loadBackgroundJobs(),
      loadRuntimeStatus().catch(() => undefined)
    ]);
    await loadCreativeSession();
    await loadCreativeJourney();
    await loadLatestStoryBlueprint();
    await loadContractCandidates();
    await loadContractAdoptionProposal();
    await loadOutlineCandidates();
    await loadOutlineAdoptionProposal();
    await loadExecutionReadyProof();
    await loadExecutionWorkItems();
    await loadBookRuns();
    await loadProseCandidates();
    await loadQualityCalibrationEvidence();
    await loadReleaseAcceptance();
    await loadReleaseActivation();
    await loadLengthPlanning();
    await loadUnderstandingReview();
    await loadMigrationCutover();
    await loadUnderstandingPreview();
    await loadDialogueQuestions();
    await loadContextManifest();
    if (!isWorkspaceLoadCurrent(workspaceLoad)) return;
    connectRuntimeEvents();
  }

  async function runMemoryGovernance() {
    if (!currentProject.value || !knowledgeRetrievalPreview.value) return null;
    isRunningMemoryGovernance.value = true;
    try {
      const projectId = currentProject.value.slug;
      const health = await novelApi.createMemoryHealthReport(projectId);
      memoryHealthReport.value = health;
      const continuity = await novelApi.createMemoryContinuityAudit(projectId, { healthReportId: health.reportId });
      memoryContinuityAudit.value = continuity;
      const targetChapterId = currentChapter.value?.id || currentProject.value.chapters[0]?.id || "";
      if (!targetChapterId) return { health, continuity, readyProof: null };
      const readyProof = await novelApi.createMemoryReadyProof(projectId, { healthReportId: health.reportId, retrievalId: knowledgeRetrievalPreview.value.retrievalId, continuityAuditId: continuity.auditId, targetChapterId });
      memoryReadyProof.value = readyProof;
      writeStoredMemoryGovernanceIds(projectId, { healthReportId: health.reportId, continuityAuditId: continuity.auditId, readyProofId: readyProof.proofId });
      return { health, continuity, readyProof };
    } finally {
      isRunningMemoryGovernance.value = false;
    }
  }

  async function startChapterProduction(chapterId: string) {
    if (currentChapter.value?.id !== chapterId) return null;
    return startAutopilotRuntime({ direction: "", autoContinue: false });
  }

  async function loadCreativeSession() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readCreativeSession !== "function") return null;
    isLoadingCreativeSession.value = true;
    creativeSessionError.value = "";
    try {
      creativeSession.value = await novelApi.readCreativeSession(projectSlug);
      return creativeSession.value;
    } catch (cause) {
      creativeSessionError.value = cause instanceof Error ? cause.message : "创作会话加载失败，请重新加载。";
      return null;
    } finally {
      isLoadingCreativeSession.value = false;
    }
  }

  async function loadCreativeJourney() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readCreativeJourney !== "function") return null;
    try {
      creativeJourney.value = await novelApi.readCreativeJourney(projectSlug);
      return creativeJourney.value;
    } catch {
      creativeJourney.value = null;
      return null;
    }
  }

  async function loadDialogueQuestions() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.listDialogueQuestions !== "function") return [];
    const requestVersion = ++dialogueQuestionLoadVersion;
    isLoadingDialogueQuestions.value = true;
    dialogueQuestionsError.value = "";
    try {
      const questions = await novelApi.listDialogueQuestions(projectSlug);
      if (requestVersion !== dialogueQuestionLoadVersion || currentProject.value?.slug !== projectSlug) return questions;
      dialogueQuestions.value = questions;
      return questions;
    } catch {
      if (requestVersion !== dialogueQuestionLoadVersion || currentProject.value?.slug !== projectSlug) return [];
      dialogueQuestions.value = [];
      dialogueQuestionsError.value = "关键问题加载失败，请重新加载后继续。";
      return [];
    } finally {
      if (requestVersion === dialogueQuestionLoadVersion && currentProject.value?.slug === projectSlug) {
        isLoadingDialogueQuestions.value = false;
      }
    }
  }

  async function answerDialogueQuestion(answerText: string, answerStatus: "confirmed" | "tentative" | "delegated" = "confirmed", idempotencyKey = `answer-${Date.now()}`) {
    const projectSlug = currentProject.value?.slug;
    const question = dialogueQuestions.value.find((candidate) => candidate.status === "active");
    if (!projectSlug || !question || typeof novelApi.answerDialogueQuestion !== "function") return null;
    isAdvancingAuthorJourney.value = true;
    authorJourneyError.value = "";
    try {
      const result = await novelApi.answerDialogueQuestion(projectSlug, question.questionId, {
        questionVersion: question.questionVersion,
        expectedSnapshotFingerprint: question.snapshotFingerprint,
        idempotencyKey,
        answerText: answerText.trim(),
        answerStatus
      });
      if (result.storyBlueprint) activeStoryBlueprint.value = result.storyBlueprint;
      if (answerStatus === "confirmed" && result.decision?.decisionId && typeof novelApi.compileContractCandidate === "function") {
        lastContractDecisionId.value = result.decision.decisionId;
      }
      await Promise.all([loadDialogueQuestions(), loadCreativeJourney(), loadLatestStoryBlueprint(), loadContractCandidates()]);
      return result;
    } catch {
      authorJourneyError.value = "当前回答尚未保存，请重试确认回答。";
      return null;
    } finally {
      isAdvancingAuthorJourney.value = false;
    }
  }

  async function loadLatestStoryBlueprint() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readLatestStoryBlueprint !== "function") return null;
    const requestVersion = ++storyBlueprintLoadVersion;
    isLoadingStoryBlueprint.value = true;
    storyBlueprintLoadError.value = "";
    try {
      const result = await novelApi.readLatestStoryBlueprint(projectSlug);
      if (requestVersion !== storyBlueprintLoadVersion || currentProject.value?.slug !== projectSlug) return result;
      activeStoryBlueprint.value = result?.blueprint ?? null;
      return result;
    } catch {
      if (requestVersion !== storyBlueprintLoadVersion || currentProject.value?.slug !== projectSlug) return null;
      storyBlueprintLoadError.value = activeStoryBlueprint.value ? "故事蓝图暂时无法加载，已保留当前内容，请重新加载。" : "故事蓝图暂时无法加载，请重新加载。";
      return null;
    } finally {
      if (requestVersion === storyBlueprintLoadVersion && currentProject.value?.slug === projectSlug) {
        isLoadingStoryBlueprint.value = false;
      }
    }
  }

  async function reviseStoryBlueprint(content: StoryBlueprintContent) {
    const projectSlug = currentProject.value?.slug;
    const blueprint = activeStoryBlueprint.value;
    if (!projectSlug || !blueprint) return null;
    isAdvancingAuthorJourney.value = true;
    authorJourneyError.value = "";
    try {
      const result = await novelApi.reviseStoryBlueprint(projectSlug, blueprint.blueprintId, { expectedFingerprint: blueprint.fingerprint, content });
      activeStoryBlueprint.value = result.blueprint;
      await loadCreativeJourney();
      return result;
    } catch {
      authorJourneyError.value = "蓝图修改尚未保存，请检查内容后重试。";
      return null;
    } finally {
      isAdvancingAuthorJourney.value = false;
    }
  }

  async function regenerateStoryBlueprint() {
    const projectSlug = currentProject.value?.slug;
    const sourceContractCandidateId = activeStoryBlueprint.value?.sourceContractCandidateId || contractCandidates.value[0]?.candidateId;
    if (!projectSlug || !sourceContractCandidateId) return null;
    isAdvancingAuthorJourney.value = true;
    authorJourneyError.value = "";
    try {
      const result = await novelApi.generateStoryBlueprint(projectSlug, sourceContractCandidateId);
      activeStoryBlueprint.value = result.blueprint;
      await loadCreativeJourney();
      return result;
    } catch {
      authorJourneyError.value = "蓝图尚未重新生成，已保留当前版本。";
      return null;
    } finally {
      isAdvancingAuthorJourney.value = false;
    }
  }

  async function confirmStoryBlueprint() {
    const projectSlug = currentProject.value?.slug;
    const blueprint = activeStoryBlueprint.value;
    if (!projectSlug || !blueprint) return null;
    isAdvancingAuthorJourney.value = true;
    authorJourneyError.value = "";
    try {
      const result = await novelApi.confirmStoryBlueprint(projectSlug, blueprint.blueprintId, { expectedFingerprint: blueprint.fingerprint, actorId: "author" });
      await loadCreativeJourney();
      return result;
    } catch {
      authorJourneyError.value = "蓝图尚未确认，请重试确认。";
      return null;
    } finally {
      isAdvancingAuthorJourney.value = false;
    }
  }

  async function retryContractCandidateCompilation() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || !lastContractDecisionId.value || typeof novelApi.compileContractCandidate !== "function") return null;
    try {
      const result = await novelApi.compileContractCandidate(projectSlug, lastContractDecisionId.value);
      await loadContractCandidates();
      contractCandidatesError.value = "";
      return result;
    } catch (cause) {
      contractCandidatesError.value = cause instanceof Error ? cause.message : "故事设定候选生成已阻断，请先完成当前理解步骤。";
      return null;
    }
  }

  async function prepareUnderstandingQuestion() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.startUnderstanding !== "function" || typeof novelApi.ensurePrimaryDialogueQuestion !== "function") return null;
    try {
      await novelApi.startUnderstanding(projectSlug, "shadow");
      const result = await novelApi.ensurePrimaryDialogueQuestion(projectSlug);
      await loadDialogueQuestions();
      await loadCreativeJourney();
      return result;
    } catch (cause) {
      creativeSessionError.value = cause instanceof Error ? cause.message : "关键问题准备失败，请重试。";
      return null;
    }
  }

  async function loadContractCandidates() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.listContractCandidates !== "function") return [];
    isLoadingContractCandidates.value = true;
    contractCandidatesError.value = "";
    try {
      contractCandidates.value = await novelApi.listContractCandidates(projectSlug);
      return contractCandidates.value;
    } catch (cause) {
      contractCandidatesError.value = cause instanceof Error ? cause.message : "故事设定候选加载失败，请重新加载。";
      contractCandidates.value = [];
      return [];
    } finally {
      isLoadingContractCandidates.value = false;
    }
  }

  async function loadContractAdoptionProposal() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readContractAdoptionProposal !== "function") return null;
    try {
      contractAdoptionProposal.value = await novelApi.readContractAdoptionProposal(projectSlug);
      return contractAdoptionProposal.value;
    } catch {
      contractAdoptionProposal.value = null;
      return null;
    }
  }

  async function loadOutlineCandidates() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.listOutlineCandidates !== "function") return [];
    isLoadingOutlineCandidates.value = true;
    outlineCandidatesError.value = "";
    try {
      outlineCandidates.value = await novelApi.listOutlineCandidates(projectSlug);
      return outlineCandidates.value;
    } catch (cause) {
      outlineCandidatesError.value = cause instanceof Error ? cause.message : "大纲候选加载失败，请重新加载。";
      outlineCandidates.value = [];
      return [];
    } finally {
      isLoadingOutlineCandidates.value = false;
    }
  }

  async function compileOutlineCandidate(sourceCandidateId: string, options: { strongFreezeCount?: number; totalChapterCount?: number } = {}) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.compileOutlineCandidate !== "function") return null;
    outlineCandidatesError.value = "";
    try {
      const result = await novelApi.compileOutlineCandidate(projectSlug, sourceCandidateId, options);
      await loadOutlineCandidates();
      return result;
    } catch (cause) {
      outlineCandidatesError.value = cause instanceof Error ? cause.message : "大纲候选生成失败，请检查故事蓝图后重试。";
      return null;
    }
  }

  async function validateOutlineCandidate(outline: OutlineCandidate) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.validateOutlineCandidate !== "function") return null;
    validatingOutlineId.value = outline.outlineId;
    outlineCandidatesError.value = "";
    try {
      const report = await novelApi.validateOutlineCandidate(projectSlug, outline.outlineId);
      outlineValidationReports.value = { ...outlineValidationReports.value, [outline.outlineId]: report };
      return report;
    } catch (cause) {
      outlineCandidatesError.value = cause instanceof Error ? cause.message : "大纲候选验证失败，请重试。";
      return null;
    } finally {
      validatingOutlineId.value = "";
    }
  }

  async function loadOutlineAdoptionProposal() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readOutlineAdoptionProposal !== "function") return null;
    try {
      outlineAdoptionProposal.value = await novelApi.readOutlineAdoptionProposal(projectSlug);
      return outlineAdoptionProposal.value;
    } catch {
      outlineAdoptionProposal.value = null;
      return null;
    }
  }

  async function loadExecutionReadyProof() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readExecutionReadyProof !== "function") return null;
    try {
      executionReadyProof.value = await novelApi.readExecutionReadyProof(projectSlug);
      return executionReadyProof.value;
    } catch {
      executionReadyProof.value = null;
      return null;
    }
  }

  async function checkExecutionReadiness(chapterId: string) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || !chapterId || typeof novelApi.checkExecutionReadiness !== "function") return null;
    isLoadingExecutionReadiness.value = true;
    executionReadinessError.value = "";
    try {
      executionReadiness.value = await novelApi.checkExecutionReadiness(projectSlug, chapterId);
      return executionReadiness.value;
    } catch (cause) {
      executionReadinessError.value = cause instanceof Error ? cause.message : "执行就绪检查失败，请先确认大纲和章节选择。";
      executionReadiness.value = null;
      return null;
    } finally { isLoadingExecutionReadiness.value = false; }
  }

  async function loadExecutionWorkItems() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.listExecutionWorkItems !== "function") return [];
    isLoadingExecutionWorkItems.value = true;
    try {
      executionWorkItems.value = await novelApi.listExecutionWorkItems(projectSlug);
      return executionWorkItems.value;
    } catch {
      executionWorkItems.value = [];
      return [];
    } finally { isLoadingExecutionWorkItems.value = false; }
  }

  async function loadBookRuns() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.listBookRuns !== "function") return [];
    isLoadingBookRun.value = true;
    bookRunError.value = "";
    try {
      bookRuns.value = await novelApi.listBookRuns(projectSlug);
      activeBookRun.value = bookRuns.value.find((run) => ["ready", "queued", "running", "gate_required", "pausing"].includes(run.status)) || bookRuns.value.at(-1) || null;
      return bookRuns.value;
    } catch (cause) {
      bookRunError.value = cause instanceof Error ? cause.message : "整书工作流加载失败，请重新加载。";
      bookRuns.value = [];
      activeBookRun.value = null;
      return [];
    } finally { isLoadingBookRun.value = false; }
  }

  async function startBookRun(input: { chapterIds?: string[]; objective?: string; autonomyLevel?: "L0" | "L1" | "L2"; limits?: BookRun["limits"] } = {}) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.startBookRun !== "function") return null;
    isLoadingBookRun.value = true;
    bookRunError.value = "";
    try {
      const run = await novelApi.startBookRun(projectSlug, {
        chapterIds: input.chapterIds || currentProject.value?.chapters.map((chapter) => chapter.id) || [],
        objective: input.objective,
        autonomyLevel: input.autonomyLevel || "L1",
        limits: input.limits || { maxWorkItems: input.chapterIds?.length || currentProject.value?.chapters.length || 1 }
      });
      activeBookRun.value = run;
      bookRuns.value = [run, ...bookRuns.value.filter((item) => item.bookRunId !== run.bookRunId)];
      return run;
    } catch (cause) {
      bookRunError.value = cause instanceof Error ? cause.message : "整书工作流启动失败，请检查执行门禁。";
      return null;
    } finally { isLoadingBookRun.value = false; }
  }

  async function advanceActiveBookRun() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || !activeBookRun.value || typeof novelApi.advanceBookRun !== "function") return null;
    isLoadingBookRun.value = true;
    bookRunError.value = "";
    try {
      const result = await novelApi.advanceBookRun(projectSlug, activeBookRun.value.bookRunId);
      activeBookRun.value = result.run;
      bookRuns.value = bookRuns.value.map((run) => run.bookRunId === result.run.bookRunId ? result.run : run);
      await Promise.all([loadExecutionWorkItems(), loadRuntimeStatus()]);
      return result;
    } catch (cause) {
      bookRunError.value = cause instanceof Error ? cause.message : "整书工作流推进失败，请检查当前门禁。";
      return null;
    } finally { isLoadingBookRun.value = false; }
  }

  async function runActiveBookCompletionAudit(sourceFingerprint: string) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || !activeBookRun.value || typeof novelApi.runBookCompletionAudit !== "function" || !sourceFingerprint.trim()) return null;
    isLoadingBookRun.value = true;
    bookRunError.value = "";
    try {
      const audit = await novelApi.runBookCompletionAudit(projectSlug, activeBookRun.value.bookRunId, sourceFingerprint.trim());
      completionAudit.value = audit;
      await loadBookRuns();
      return audit;
    } catch (cause) {
      bookRunError.value = cause instanceof Error ? cause.message : "完成审计失败，请确认来源指纹后重试。";
      return null;
    } finally { isLoadingBookRun.value = false; }
  }

  async function loadPublicationEvidence(editionId: string) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || !editionId.trim()) return null;
    isLoadingPublicationEvidence.value = true;
    publicationEvidenceError.value = "";
    try {
      const proofPromise = novelApi.verifyDeliveryProof(projectSlug, editionId).catch((cause) => {
        if (cause instanceof Error && /(?:^|\s)404(?:$|\s)/.test(cause.message)) return null;
        throw cause;
      });
      const [manifest, tree, artifacts, proof, preflight] = await Promise.all([
        novelApi.readEditionManifest(projectSlug, editionId),
        novelApi.readPublicationTree(projectSlug, editionId),
        novelApi.readPublicationArtifacts(projectSlug, editionId),
        proofPromise,
        novelApi.preflightPublicationEdition(projectSlug, editionId)
      ]);
      publicationEdition.value = manifest;
      publicationTree.value = tree;
      publicationArtifacts.value = artifacts;
      deliveryProofVerification.value = proof;
      publicationPreflight.value = preflight;
      return { manifest, tree, artifacts, proof, preflight };
    } catch (cause) {
      publicationEvidenceError.value = cause instanceof Error ? cause.message : "发布证据加载失败，请重新加载。";
      return null;
    } finally { isLoadingPublicationEvidence.value = false; }
  }

  async function issuePublicationDeliveryProof(approvalId: string) {
    const projectSlug = currentProject.value?.slug;
    const editionId = publicationEdition.value?.editionId;
    const artifactFingerprint = publicationArtifacts.value?.fingerprint;
    if (!projectSlug || !editionId || !artifactFingerprint || publicationPreflight.value?.status !== "ready" || !approvalId.trim() || typeof novelApi.issueDeliveryProof !== "function") return null;
    isLoadingPublicationEvidence.value = true;
    publicationEvidenceError.value = "";
    try {
      deliveryProof.value = await novelApi.issueDeliveryProof(projectSlug, editionId, approvalId.trim(), artifactFingerprint);
      deliveryProofVerification.value = await novelApi.verifyDeliveryProof(projectSlug, editionId);
      return deliveryProof.value;
    } catch (cause) {
      publicationEvidenceError.value = cause instanceof Error ? cause.message : "交付证明签发失败，请检查发布验收。";
      return null;
    } finally { isLoadingPublicationEvidence.value = false; }
  }

  async function createPublicationEdition(input: Parameters<typeof novelApi.createEditionManifest>[1]) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.createEditionManifest !== "function") return null;
    isLoadingPublicationEvidence.value = true;
    publicationEvidenceError.value = "";
    try {
      publicationEdition.value = await novelApi.createEditionManifest(projectSlug, input);
      publicationTree.value = null;
      publicationArtifacts.value = null;
      deliveryProof.value = null;
      deliveryProofVerification.value = null;
      publicationPreflight.value = null;
      return publicationEdition.value;
    } catch (cause) {
      publicationEvidenceError.value = cause instanceof Error ? cause.message : "出版版本创建失败，请检查输入。";
      return null;
    } finally { isLoadingPublicationEvidence.value = false; }
  }

  async function compilePublicationEditionTree() {
    const projectSlug = currentProject.value?.slug;
    const editionId = publicationEdition.value?.editionId;
    if (!projectSlug || !editionId || typeof novelApi.compilePublicationTree !== "function") return null;
    try { publicationTree.value = await novelApi.compilePublicationTree(projectSlug, editionId); return publicationTree.value; }
    catch (cause) { publicationEvidenceError.value = cause instanceof Error ? cause.message : "出版树编译失败，请重试。"; return null; }
  }

  async function renderPublicationEditionArtifacts(formats: Array<"markdown" | "txt"> = ["markdown", "txt"]) {
    const projectSlug = currentProject.value?.slug;
    const editionId = publicationEdition.value?.editionId;
    if (!projectSlug || !editionId || typeof novelApi.renderPublicationArtifacts !== "function") return null;
    try { publicationArtifacts.value = await novelApi.renderPublicationArtifacts(projectSlug, editionId, formats); return publicationArtifacts.value; }
    catch (cause) { publicationEvidenceError.value = cause instanceof Error ? cause.message : "出版制品渲染失败，请重试。"; return null; }
  }

  async function loadProseCandidates() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.listProseCandidates !== "function") return [];
    isLoadingProseCandidates.value = true;
    try {
      proseCandidates.value = await novelApi.listProseCandidates(projectSlug);
      return proseCandidates.value;
    } catch { proseCandidates.value = []; return []; }
    finally { isLoadingProseCandidates.value = false; }
  }

  async function loadQualityCalibrationEvidence() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readQualityCalibrationEvidence !== "function") return null;
    isLoadingQualityCalibration.value = true;
    qualityCalibrationError.value = "";
    try {
      qualityCalibrationEvidence.value = await novelApi.readQualityCalibrationEvidence(projectSlug);
    } catch {
      qualityCalibrationEvidence.value = null;
    }
    try {
      qualityCalibrationHistory.value = typeof novelApi.readQualityCalibrationEvidenceHistory === "function" ? await novelApi.readQualityCalibrationEvidenceHistory(projectSlug) : [];
    } catch {
      qualityCalibrationHistory.value = [];
    }
    isLoadingQualityCalibration.value = false;
    return qualityCalibrationEvidence.value;
  }

  async function submitQualityCalibrationEvidence(input: Parameters<typeof novelApi.submitQualityCalibrationEvidence>[1]) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.submitQualityCalibrationEvidence !== "function") return null;
    isLoadingQualityCalibration.value = true;
    qualityCalibrationError.value = "";
    try {
      const evidence = await novelApi.submitQualityCalibrationEvidence(projectSlug, input);
      qualityCalibrationEvidence.value = evidence;
      qualityCalibrationHistory.value = [evidence, ...qualityCalibrationHistory.value.filter((item) => item.calibrationId !== evidence.calibrationId)];
      return evidence;
    } catch (cause) {
      qualityCalibrationError.value = cause instanceof Error ? cause.message : "校准证据提交失败，请重试。";
      return null;
    } finally { isLoadingQualityCalibration.value = false; }
  }

  async function loadReleaseAcceptance() {
    if (typeof novelApi.readReleaseAcceptance !== "function") return null;
    isLoadingReleaseAcceptance.value = true;
    try { releaseAcceptanceDecision.value = await novelApi.readReleaseAcceptance(); return releaseAcceptanceDecision.value; }
    catch { releaseAcceptanceDecision.value = null; return null; }
    finally { isLoadingReleaseAcceptance.value = false; }
  }

  async function loadReleaseActivation() {
    if (typeof novelApi.readReleaseActivation !== "function") return null;
    try { releaseActivation.value = await novelApi.readReleaseActivation(); return releaseActivation.value; }
    catch { releaseActivation.value = null; return null; }
  }

  async function activateAcceptedRelease() {
    if (releaseAcceptanceDecision.value?.status !== "accepted" || typeof novelApi.activateRelease !== "function") return null;
    isActivatingRelease.value = true;
    releaseActivationError.value = "";
    try { releaseActivation.value = await novelApi.activateRelease(); return releaseActivation.value; }
    catch (cause) { releaseActivationError.value = cause instanceof Error ? cause.message : "发布激活失败，请先补齐发布门禁。"; return null; }
    finally { isActivatingRelease.value = false; }
  }

  async function loadLengthPlanning() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readLengthContract !== "function") return null;
    isLoadingLengthPlanning.value = true;
    lengthPlanningError.value = "";
    try {
      lengthContract.value = await novelApi.readLengthContract(projectSlug);
      if (lengthContract.value && typeof novelApi.readLengthForecast === "function") lengthForecast.value = await novelApi.readLengthForecast(projectSlug);
      return lengthForecast.value;
    } catch (cause) {
      lengthPlanningError.value = cause instanceof Error ? cause.message : "篇幅规划加载失败，请重新加载。";
      return null;
    } finally { isLoadingLengthPlanning.value = false; }
  }

  async function createProjectLengthContract(input: { dimensions: LengthContract["dimensions"]; hardLocks?: string[] }) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.createLengthContract !== "function") return null;
    isLoadingLengthPlanning.value = true;
    lengthPlanningError.value = "";
    try {
      lengthContract.value = await novelApi.createLengthContract(projectSlug, input);
      lengthForecast.value = typeof novelApi.readLengthForecast === "function" ? await novelApi.readLengthForecast(projectSlug) : null;
      return lengthContract.value;
    } catch (cause) {
      lengthPlanningError.value = cause instanceof Error ? cause.message : "篇幅契约创建失败，请重试。";
      return null;
    } finally { isLoadingLengthPlanning.value = false; }
  }

  async function decideProjectLengthVariance(choice: LengthVarianceDecision["choice"] = "pause-and-review") {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || !lengthForecast.value || typeof novelApi.decideLengthVariance !== "function") return null;
    isLoadingLengthPlanning.value = true;
    lengthPlanningError.value = "";
    try {
      lengthVarianceDecision.value = await novelApi.decideLengthVariance(projectSlug, choice);
      return lengthVarianceDecision.value;
    } catch (cause) {
      lengthPlanningError.value = cause instanceof Error ? cause.message : "篇幅偏差记录失败，请重试。";
      return null;
    } finally { isLoadingLengthPlanning.value = false; }
  }

  async function loadUnderstandingReview() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readUnderstandingReview !== "function") return null;
    isLoadingUnderstandingReview.value = true;
    try { understandingReview.value = await novelApi.readUnderstandingReview(projectSlug); return understandingReview.value; }
    catch { understandingReview.value = null; return null; }
    finally { isLoadingUnderstandingReview.value = false; }
  }

  async function submitExternalUnderstandingReview(input: Parameters<typeof novelApi.submitExternalUnderstandingReview>[1]) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.submitExternalUnderstandingReview !== "function") return null;
    isLoadingUnderstandingReview.value = true;
    try { understandingReview.value = await novelApi.submitExternalUnderstandingReview(projectSlug, input); return understandingReview.value; }
    finally { isLoadingUnderstandingReview.value = false; }
  }

  async function loadMigrationCutover() {
    if (typeof novelApi.readMigrationCutoverReadiness !== "function") return null;
    isLoadingMigrationCutover.value = true;
    try { migrationCutoverReport.value = await novelApi.readMigrationCutoverReadiness(); return migrationCutoverReport.value; }
    catch { migrationCutoverReport.value = null; return null; }
    finally { isLoadingMigrationCutover.value = false; }
  }

  async function validateAllProjectMigrations() {
    if (typeof novelApi.validateAllProjectMigrations !== "function") return null;
    isLoadingMigrationCutover.value = true;
    try { migrationValidationReport.value = await novelApi.validateAllProjectMigrations(); await loadMigrationCutover(); return migrationValidationReport.value; }
    finally { isLoadingMigrationCutover.value = false; }
  }

  async function validateProseCandidate(candidate: ProseCandidate) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.validateProseCandidate !== "function") return null;
    proseCandidateBusyId.value = candidate.candidateId;
    proseCandidateError.value = "";
    try { const bundle = await novelApi.validateProseCandidate(projectSlug, candidate.candidateId); proseValidations.value = { ...proseValidations.value, [candidate.candidateId]: bundle }; return bundle; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "正文候选验证失败，请重试。"; return null; }
    finally { proseCandidateBusyId.value = ""; }
  }

  async function reviewProseCandidate(candidate: ProseCandidate) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.reviewProseCandidate !== "function") return null;
    proseCandidateBusyId.value = candidate.candidateId;
    proseCandidateError.value = "";
    try { const review = await novelApi.reviewProseCandidate(projectSlug, candidate.candidateId); proseReviews.value = { ...proseReviews.value, [candidate.candidateId]: review }; return review; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "正文候选评审失败，请重试。"; return null; }
    finally { proseCandidateBusyId.value = ""; }
  }

  async function createProseRepairPlan(candidate: ProseCandidate) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.createProseRepairPlan !== "function") return null;
    proseCandidateBusyId.value = candidate.candidateId;
    proseCandidateError.value = "";
    try { const plan = await novelApi.createProseRepairPlan(projectSlug, candidate.candidateId); proseRepairPlans.value = { ...proseRepairPlans.value, [candidate.candidateId]: plan }; return plan; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "正文局部修复计划创建失败，请重试。"; return null; }
    finally { proseCandidateBusyId.value = ""; }
  }

  async function createProseRepairCandidate(candidate: ProseCandidate, content: string) {
    const projectSlug = currentProject.value?.slug;
    const plan = proseRepairPlans.value[candidate.candidateId];
    if (!projectSlug || !plan || !content.trim() || typeof novelApi.createProseRepairCandidate !== "function") return null;
    proseCandidateBusyId.value = candidate.candidateId;
    proseCandidateError.value = "";
    try { const result = await novelApi.createProseRepairCandidate(projectSlug, plan.planId, content); proseRepairCandidates.value = { ...proseRepairCandidates.value, [candidate.candidateId]: result.metadata }; proseCandidates.value = [result.candidate, ...proseCandidates.value.filter((item) => item.candidateId !== result.candidate.candidateId)]; return result; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "修复候选生成失败，请重试。"; return null; }
    finally { proseCandidateBusyId.value = ""; }
  }

  async function evaluateProseRepairRegression(candidate: ProseCandidate) {
    const projectSlug = currentProject.value?.slug;
    const metadata = proseRepairCandidates.value[candidate.candidateId];
    if (!projectSlug || !metadata || typeof novelApi.evaluateProseRepairRegression !== "function") return null;
    proseCandidateBusyId.value = candidate.candidateId;
    proseCandidateError.value = "";
    try { const dossier = await novelApi.evaluateProseRepairRegression(projectSlug, metadata.repairCandidateId); proseRepairRegressions.value = { ...proseRepairRegressions.value, [candidate.candidateId]: dossier }; return dossier; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "修复回归评估失败，请重试。"; return null; }
    finally { proseCandidateBusyId.value = ""; }
  }

  async function loadProseAdoptionReadiness(candidate: ProseCandidate) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readProseAdoptionReadiness !== "function") return null;
    try { const readiness = await novelApi.readProseAdoptionReadiness(projectSlug, candidate.candidateId); proseAdoptionReadiness.value = { ...proseAdoptionReadiness.value, [candidate.candidateId]: readiness }; return readiness; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "正文采纳门禁加载失败，请重新加载。"; return null; }
  }

  async function adoptProseCandidate(candidate: ProseCandidate, input: { expectedCanonSha256: string; authorizationId: string }) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.adoptProseCandidate !== "function") return null;
    proseCandidateBusyId.value = candidate.candidateId;
    proseCandidateError.value = "";
    try { const transaction = await novelApi.adoptProseCandidate(projectSlug, candidate.candidateId, input); proseAdoptions.value = { ...proseAdoptions.value, [candidate.candidateId]: transaction }; await loadProseCandidates(); return transaction; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "正文候选采纳失败，请检查授权和验证结果。"; return null; }
    finally { proseCandidateBusyId.value = ""; }
  }

  async function settleProseCandidate(candidate: ProseCandidate, transaction: ProseAdoptionTransaction) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.settleChapter !== "function") return null;
    proseCandidateBusyId.value = candidate.candidateId;
    proseCandidateError.value = "";
    try {
      const settlement = activeBookRun.value
        ? await novelApi.settleChapter(projectSlug, candidate.chapterId, transaction.transactionId, activeBookRun.value.bookRunId)
        : await novelApi.settleChapter(projectSlug, candidate.chapterId, transaction.transactionId);
      proseSettlements.value = { ...proseSettlements.value, [candidate.chapterId]: settlement };
      await Promise.all([loadProseCandidates(), loadRuntimeStatus(), loadExecutionReadyProof(), loadExecutionWorkItems(), activeBookRun.value ? loadBookRuns() : Promise.resolve([])]);
      if (currentChapter.value?.id === candidate.chapterId && currentFilePath.value) {
        const content = await novelApi.readFile(projectSlug, currentFilePath.value);
        currentContent.value = content;
        savedContent.value = content;
        lastSavedAt.value = "";
        selection.value = null;
        rewriteSelection.value = null;
      }
      return settlement;
    }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "章节结算失败，请重试。"; return null; }
    finally { proseCandidateBusyId.value = ""; }
  }

  async function createFeedbackAttribution(event: AuthorFeedbackEvent, input: { category: FeedbackAttribution["category"]; pattern?: string; scope: { chapterId?: string; sceneId?: string }; evidenceRefs: string[]; confounders: string[]; confidence: { lower: number; upper: number } }) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.createFeedbackAttribution !== "function") return null;
    try { const attribution = await novelApi.createFeedbackAttribution(projectSlug, event.eventId, input); feedbackAttributions.value = { ...feedbackAttributions.value, [event.eventId]: attribution }; return attribution; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "作者反馈归因失败，请重试。"; return null; }
  }

  async function derivePreferenceHypothesis(attribution: FeedbackAttribution) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.derivePreferenceHypothesis !== "function") return null;
    try { const hypothesis = await novelApi.derivePreferenceHypothesis(projectSlug, attribution.attributionId); preferenceHypotheses.value = { ...preferenceHypotheses.value, [hypothesis.hypothesisId]: hypothesis }; return hypothesis; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "偏好假设推导失败，请重试。"; return null; }
  }

  async function revokePreferenceHypothesis(hypothesis: PreferenceHypothesis, reason: string, actor = "author") {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.revokePreferenceHypothesis !== "function") return null;
    try { const result = await novelApi.revokePreferenceHypothesis(projectSlug, hypothesis.hypothesisId, { actor, reason }); preferenceHypotheses.value = { ...preferenceHypotheses.value, [result.hypothesisId]: result }; return result; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "偏好假设撤销失败，请重试。"; return null; }
  }

  async function recordPreferenceOpposition(hypothesis: PreferenceHypothesis, oppositionEventId: string, reason: string) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.recordPreferenceOpposition !== "function") return null;
    try { const result = await novelApi.recordPreferenceOpposition(projectSlug, hypothesis.hypothesisId, { oppositionEventId, reason }); preferenceHypotheses.value = { ...preferenceHypotheses.value, [result.hypothesisId]: result }; return result; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "偏好反例记录失败，请重试。"; return null; }
  }

  async function createLearningPolicy(rollbackVersion: string) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.createLearningPolicy !== "function") return null;
    try { learningPolicy.value = await novelApi.createLearningPolicy(projectSlug, rollbackVersion); return learningPolicy.value; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "学习策略创建失败，请重试。"; return null; }
  }

  async function loadLearningPolicy() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readLearningPolicy !== "function") return null;
    try { learningPolicy.value = await novelApi.readLearningPolicy(projectSlug); return learningPolicy.value; } catch { return null; }
  }

  async function createExplorationBudget(input: Omit<ExplorationBudget, "schemaVersion" | "budgetId" | "projectSlug" | "usedProbes" | "usedCost" | "consumedOperationIds" | "status" | "createdAt" | "updatedAt" | "fingerprint">) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.createExplorationBudget !== "function") return null;
    try { const budget = await novelApi.createExplorationBudget(projectSlug, input); explorationBudgets.value = { ...explorationBudgets.value, [budget.budgetId]: budget }; return budget; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "探索预算创建失败，请重试。"; return null; }
  }

  async function consumeExplorationBudget(budget: ExplorationBudget, input: { operationId: string; probes: number; cost: number; impact: string }) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.consumeExplorationBudget !== "function") return null;
    try { const result = await novelApi.consumeExplorationBudget(projectSlug, budget.budgetId, input); explorationBudgets.value = { ...explorationBudgets.value, [result.budgetId]: result }; return result; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "探索预算扣减失败，请重试。"; return null; }
  }

  async function loadExplorationBudget(budgetId: string) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readExplorationBudget !== "function") return null;
    try { const budget = await novelApi.readExplorationBudget(projectSlug, budgetId); explorationBudgets.value = { ...explorationBudgets.value, [budget.budgetId]: budget }; return budget; } catch { return null; }
  }

  async function pauseExplorationBudget(budget: ExplorationBudget, reason: string) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.pauseExplorationBudget !== "function") return null;
    try { const result = await novelApi.pauseExplorationBudget(projectSlug, budget.budgetId, reason); explorationBudgets.value = { ...explorationBudgets.value, [result.budgetId]: result }; return result; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "探索预算暂停失败，请重试。"; return null; }
  }

  async function promoteCraftPatternFromExperiment(pattern: CraftPattern, experiment?: CraftExperiment) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || !experiment || typeof novelApi.promoteCraftPatternFromExperiment !== "function") return null;
    try { const result = await novelApi.promoteCraftPatternFromExperiment(projectSlug, pattern.patternId, { experiment, actor: "author", reason: "作者确认实验结果" }); craftPatterns.value = craftPatterns.value.map((item) => item.patternId === result.patternId ? result : item); return result; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "工艺模式提升失败，请重试。"; return null; }
  }

  async function loadCraftPatterns() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.listCraftPatterns !== "function") return [];
    try { craftPatterns.value = await novelApi.listCraftPatterns(projectSlug); return craftPatterns.value; } catch { return []; }
  }

  async function loadCraftExperiments() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.listCraftExperiments !== "function") return {};
    try {
      const experiments = await novelApi.listCraftExperiments(projectSlug);
      craftExperiments.value = Object.fromEntries(experiments.map((experiment) => [experiment.experimentId, experiment]));
      return craftExperiments.value;
    } catch { return {}; }
  }

  async function loadCharacterContracts() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.listCharacterDramaticContracts !== "function") return [];
    try { characterContracts.value = await novelApi.listCharacterDramaticContracts(projectSlug); return characterContracts.value; } catch { return []; }
  }

  async function confirmCharacterContract(contract: CharacterDramaticContract, reason = "作者确认人物核心契约") {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.confirmCharacterDramaticContract !== "function") return null;
    try {
      const result = await novelApi.confirmCharacterDramaticContract(projectSlug, contract.contractId, { actor: "author", reason });
      characterContracts.value = characterContracts.value.map((item) => item.contractId === result.contractId ? result : item);
      return result;
    } catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "人物契约确认失败，请重试。"; return null; }
  }

  async function loadCharacterStateSnapshots(characterId: string) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.listCharacterStateSnapshots !== "function") return [];
    try { const snapshots = await novelApi.listCharacterStateSnapshots(projectSlug, characterId); characterStateSnapshots.value = { ...characterStateSnapshots.value, [characterId]: snapshots }; return snapshots; } catch { return []; }
  }

  async function validateCraftPatternFromExperiment(pattern: CraftPattern, experiment: CraftExperiment) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.validateCraftPatternFromExperiment !== "function") return null;
    try { const result = await novelApi.validateCraftPatternFromExperiment(projectSlug, pattern.patternId, { experiment, actor: "author", reason: "作者确认第二次 holdout" }); craftPatterns.value = craftPatterns.value.map((item) => item.patternId === result.patternId ? result : item); return result; }
    catch (cause) { proseCandidateError.value = cause instanceof Error ? cause.message : "工艺模式验证失败，请重试。"; return null; }
  }

  function setOutlineChapterSelection(input: { outline: OutlineCandidate; chapterIds: string[] }) {
    outlineChapterSelections.value = { ...outlineChapterSelections.value, [input.outline.outlineId]: [...input.chapterIds] };
    return outlineChapterSelections.value[input.outline.outlineId];
  }

  function outlineAdoptionGuidance(reason?: string): string {
    if (reason === "OUTLINE_SOURCE_CONTRACT_NOT_ADOPTED") return "请先确认并采纳该大纲对应的故事设定。";
    return "大纲采纳暂时无法完成，请刷新后重试。";
  }

  async function createOutlineAdoptionProposal(input: { outline: OutlineCandidate; chapterIds: string[] }) {
    const projectSlug = currentProject.value?.slug;
    const report = outlineValidationReports.value[input.outline.outlineId];
    if (!projectSlug || !report || report.status !== "passed" || typeof novelApi.createOutlineAdoptionProposal !== "function") return null;
    isAdoptingOutline.value = true;
    outlineAdoptionError.value = "";
    try {
      outlineAdoptionProposal.value = await novelApi.createOutlineAdoptionProposal(projectSlug, { outlineId: input.outline.outlineId, expectedOutlineFingerprint: input.outline.fingerprint, selectedChapterIds: input.chapterIds });
      return outlineAdoptionProposal.value;
    } catch {
      outlineAdoptionError.value = "暂时无法生成大纲采纳提案，请刷新后重试。";
      return null;
    } finally { isAdoptingOutline.value = false; }
  }

  async function authorizeOutlineAdoption(input: { expectedProposalFingerprint: string; actorId: string; authorizationId: string }) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.authorizeOutlineAdoption !== "function") return null;
    isAdoptingOutline.value = true;
    outlineAdoptionError.value = "";
    try {
      outlineAdoptionProposal.value = await novelApi.authorizeOutlineAdoption(projectSlug, input);
      return outlineAdoptionProposal.value;
    } catch {
      outlineAdoptionError.value = "暂时无法授权大纲采纳，请刷新后重试。";
      return null;
    } finally { isAdoptingOutline.value = false; }
  }

  async function commitOutlineAdoption(expectedProposalFingerprint: string) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.commitOutlineAdoption !== "function") return null;
    isAdoptingOutline.value = true;
    outlineAdoptionError.value = "";
    try {
      const result = await novelApi.commitOutlineAdoption(projectSlug, expectedProposalFingerprint);
      if (result.status === "committed" && outlineAdoptionProposal.value) outlineAdoptionProposal.value = { ...outlineAdoptionProposal.value, status: "committed", canonWritten: true };
      if (result.status !== "committed") outlineAdoptionError.value = outlineAdoptionGuidance(result.reason);
      return result;
    } catch (cause) {
      outlineAdoptionError.value = outlineAdoptionGuidance(cause instanceof Error ? cause.message : undefined);
      return null;
    } finally { isAdoptingOutline.value = false; }
  }

  async function createContractAdoptionProposal(input: {
    candidateId: string;
    expectedCandidateFingerprint: string;
    fieldDecisions: Array<{ fieldId: string; status: "accept" | "keep-provisional" | "reject" | "delegate"; reason?: string }>;
  }) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.createContractAdoptionProposal !== "function") return null;
    isCreatingContractAdoptionProposal.value = true;
    contractAdoptionError.value = "";
    try {
      contractAdoptionProposal.value = await novelApi.createContractAdoptionProposal(projectSlug, input);
      return contractAdoptionProposal.value;
    } catch (cause) {
      contractAdoptionError.value = cause instanceof Error ? cause.message : "故事设定采纳提案创建失败，请检查字段决定。";
      return null;
    } finally {
      isCreatingContractAdoptionProposal.value = false;
    }
  }

  async function commitContractAdoption(input: { expectedProposalFingerprint: string; actorId: string; authorizationId: string }) {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.commitContractAdoption !== "function") return null;
    isCreatingContractAdoptionProposal.value = true;
    contractAdoptionError.value = "";
    try {
      const result = await novelApi.commitContractAdoption(projectSlug, {
        expectedProposalFingerprint: input.expectedProposalFingerprint,
        authorization: { actorId: input.actorId, authorizationId: input.authorizationId }
      });
      if (result.status === "committed" && contractAdoptionProposal.value) {
        contractAdoptionProposal.value = { ...contractAdoptionProposal.value, status: "committed", canonWritten: true };
      }
      if (result.status !== "committed") contractAdoptionError.value = result.reason || "故事设定采纳已阻断，请检查授权和字段决定。";
      return result;
    } catch (cause) {
      contractAdoptionError.value = cause instanceof Error ? cause.message : "故事设定采纳提交失败，请重试。";
      return null;
    } finally {
      isCreatingContractAdoptionProposal.value = false;
    }
  }

  async function captureAuthorMessage(text: string) {
    const projectSlug = currentProject.value?.slug;
    const normalized = text.trim();
    if (!projectSlug || !normalized || typeof novelApi.captureAuthorMessage !== "function") return null;
    isSubmittingCreativeMessage.value = true;
    creativeSessionError.value = "";
    try {
      const clientMessageId = globalThis.crypto?.randomUUID?.() || `author-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await novelApi.captureAuthorMessage(projectSlug, { clientMessageId, text: normalized });
      creativeSession.value = result.session;
      await Promise.all([loadUnderstandingPreview(), loadCreativeJourney(), loadDialogueQuestions(), loadLatestStoryBlueprint()]);
      return result;
    } catch (cause) {
      creativeSessionError.value = cause instanceof Error ? cause.message : "作者原话记录失败，请重试。";
      return null;
    } finally {
      isSubmittingCreativeMessage.value = false;
    }
  }

  async function loadUnderstandingPreview() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readUnderstandingPreview !== "function") return null;
    try {
      understandingPreview.value = await novelApi.readUnderstandingPreview(projectSlug);
      return understandingPreview.value;
    } catch {
      understandingPreview.value = null;
      return null;
    }
  }

  async function loadContextManifest() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.readContextManifest !== "function") return null;
    try {
      contextManifest.value = await novelApi.readContextManifest(projectSlug);
      return contextManifest.value;
    } catch {
      contextManifest.value = null;
      return null;
    }
  }

  async function freezeCurrentContextManifest() {
    const projectSlug = currentProject.value?.slug;
    if (!projectSlug || typeof novelApi.freezeContextManifest !== "function") return null;
    isFreezingContextManifest.value = true;
    try {
      const result = await novelApi.freezeContextManifest(projectSlug);
      contextManifest.value = result.manifest;
      return result;
    } finally {
      isFreezingContextManifest.value = false;
    }
  }

  async function executeCreativeJourneyAction(actionId?: CreativeJourneyProjection["primaryAction"]["id"]) {
    const currentAction = creativeJourney.value?.primaryAction.id;
    if (actionId && actionId !== currentAction) return null;
    if (currentAction === "review-understanding") {
      const frozen = await freezeCurrentContextManifest();
      if (!frozen) return null;
      return prepareUnderstandingQuestion();
    }
    if (currentAction === "generate-outline") {
      const sourceCandidateId = activeStoryBlueprint.value?.sourceContractCandidateId || contractCandidates.value[0]?.candidateId;
      if (!sourceCandidateId) {
        authorJourneyError.value = "故事蓝图已确认，但暂未找到对应的故事设定。请刷新项目后重试。";
        return null;
      }
      isAdvancingAuthorJourney.value = true;
      authorJourneyError.value = "";
      try {
        const result = await compileOutlineCandidate(sourceCandidateId);
        if (result) await loadCreativeJourney();
        if (!result && !authorJourneyError.value) authorJourneyError.value = "大纲暂时未生成，请稍后重试。";
        return result;
      } finally {
        isAdvancingAuthorJourney.value = false;
      }
    }
    return null;
  }

  function showProjectHub(options: WorkspaceSwitchOptions = {}) {
    if (!options.skipLeaveCheck && !canLeaveCurrentWorkspace()) return;
    cacheCurrentWorkspace();
    resetActiveWorkspace();
  }

  async function closeWorkspace(projectSlug: string, options: WorkspaceSwitchOptions = {}) {
    if (currentProject.value?.slug === projectSlug && !options.skipLeaveCheck && !canLeaveCurrentWorkspace()) return;

    openWorkspaceSlugs.value = openWorkspaceSlugs.value.filter((slug) => slug !== projectSlug);
    const restCache = { ...workspaceCache.value };
    delete restCache[projectSlug];
    workspaceCache.value = restCache;
    if (currentProject.value?.slug !== projectSlug) return;

    const nextProject = openWorkspaceProjects.value[0];
    if (nextProject) {
      await openProject(nextProject, { skipLeaveCheck: true });
      return;
    }

    resetActiveWorkspace();
  }

  async function openChapter(
    chapter: NovelChapter,
    documentKind: ChapterDocumentKind = currentDocumentKind.value,
    options: WorkspaceSwitchOptions = {}
  ) {
    if (!currentProject.value) return;
    const nextFilePath = documentKind === "outline" ? chapter.outlinePath : chapter.contentPath;
    if (currentFilePath.value !== nextFilePath && !options.skipLeaveCheck && !canLeaveCurrentChapter()) return;
    if (currentFilePath.value !== nextFilePath) {
      qualityImprovementState.value = {
        status: "idle",
        targetMetrics: [],
        changes: [],
        patchCount: 0
      };
    }

    currentChapter.value = chapter;
    currentDocumentKind.value = documentKind;
    if (currentProject.value) {
      writeStoredWorkspacePreference(currentProject.value.slug, {
        chapterId: chapter.id,
        documentKind
      });
      currentProject.value = {
        ...currentProject.value,
        lastOpenedChapterId: chapter.id
      };
      projects.value = projects.value.map((item) =>
        item.slug === currentProject.value?.slug ? { ...item, lastOpenedChapterId: chapter.id } : item
      );
      if (workspaceCache.value[currentProject.value.slug]) {
        workspaceCache.value = {
          ...workspaceCache.value,
          [currentProject.value.slug]: {
            ...workspaceCache.value[currentProject.value.slug],
            project: {
              ...workspaceCache.value[currentProject.value.slug].project,
              lastOpenedChapterId: chapter.id
            }
          }
        };
      }
    }
    currentFilePath.value = nextFilePath;
    const chapterLoad = beginChapterLoad(currentProject.value.slug, chapter.id, nextFilePath);
    const content = await novelApi.readFile(currentProject.value.slug, nextFilePath);
    if (!isChapterLoadCurrent(chapterLoad)) return;
    currentContent.value = content;
    savedContent.value = content;
    lastSavedAt.value = "";
    selection.value = null;
    rewriteSelection.value = null;
    rewriteCandidate.value = null;
    recapCandidate.value = null;
    currentQualityReport.value = null;
    fileVersions.value = [];
    currentFileDiff.value = null;
    await loadChapterCockpit(chapter.id, chapterLoad);
  }

  async function openChapterDocument(documentKind: ChapterDocumentKind) {
    if (!currentChapter.value) return;
    if (documentKind === currentDocumentKind.value) return;
    if (hasUnsavedChanges.value) {
      await saveCurrentContent();
    }
    await openChapter(currentChapter.value, documentKind);
  }

  function updateContent(content: string) {
    currentContent.value = content;
    currentQualityReport.value = null;
    syncDashboardWordCount(content);
  }

  function updateSelection(nextSelection: EditorSelection | null) {
    selection.value = nextSelection;
  }

  async function saveCurrentContent(options: { runPipeline?: boolean } = {}) {
    if (!currentProject.value || !currentFilePath.value) return;
    isSavingContent.value = true;
    error.value = "";
    const previousContent = savedContent.value;
    try {
      await novelApi.saveFile(currentProject.value.slug, currentFilePath.value, currentContent.value);
      savedContent.value = currentContent.value;
      if (fileVersions.value.length) {
        await loadCurrentFileVersions();
      }
      syncDashboardWordCount();
      const hasDashboardToSave = Boolean(currentDashboard.value);
      await saveCurrentDashboard();
      if (!hasDashboardToSave) {
        await loadCreationRuntimeSnapshot();
      }
      lastSavedAt.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      if (autoRunSavePipeline.value && options.runPipeline !== false) {
        await runPostSavePipeline(previousContent);
      }
    } catch (err) {
      error.value = errorText(err);
      throw err;
    } finally {
      isSavingContent.value = false;
    }
  }

  async function openSupportFile(filePath: string, options: WorkspaceSwitchOptions = {}) {
    if (!currentProject.value) return;
    if (currentSupportPath.value !== filePath && !options.skipLeaveCheck && !canLeaveCurrentSupportFile()) return;

    currentSupportPath.value = filePath;
    const supportFileLoad = beginSupportFileLoad(currentProject.value.slug, filePath);
    const content = await novelApi.readFile(currentProject.value.slug, filePath);
    if (!isSupportFileLoadCurrent(supportFileLoad)) return;
    supportContent.value = content;
    savedSupportContent.value = content;
  }

  function updateSupportContent(content: string) {
    supportContent.value = content;
  }

  async function saveSupportContent() {
    if (!currentProject.value || !currentSupportPath.value) return;
    await novelApi.saveFile(currentProject.value.slug, currentSupportPath.value, supportContent.value);
    savedSupportContent.value = supportContent.value;
  }

  async function runTask(type: CodexTaskType, payload: Record<string, unknown> = {}) {
    if (!currentProject.value) return;
    if (type === "chapter.plan") {
      await openChapterDocument("outline");
      if (currentDocumentKind.value !== "outline") return;
    }
    if (type === "chapter.draft") {
      await openChapterDocument("content");
      if (currentDocumentKind.value !== "content") return;
    }

    isLoading.value = true;
    error.value = "";
    startTaskProgress(type);
    try {
      setTaskProgress("context", "done");
      setTaskProgress("codex", "running");
      const startedTask = await novelApi.startTask(currentProject.value.slug, type, {
        chapterId: currentChapter.value?.id,
        documentKind: currentDocumentKind.value,
        filePath: currentFilePath.value,
        ...payload
      });
      activeAsyncTaskId.value = startedTask.id;
      currentTask.value = startedTask;
      upsertTaskHistory(startedTask);

      const task = await waitForTask(currentProject.value.slug, startedTask);
      setTaskProgress("codex", "done");
      setTaskProgress("parse", "running");
      currentTask.value = task;
      upsertTaskHistory(task);
      await refreshAiInvocations();
      if (task.result) {
        if (type === "writing.recap") {
          recapCandidate.value = parseRecapCandidate(task.result.content);
          rewriteCandidate.value = null;
          rewriteSelection.value = null;
        } else if (type !== "writing.briefing") {
          rewriteCandidate.value = task.result;
          rewriteSelection.value = null;
        }
      }
      setTaskProgress("parse", task.status === "error" || task.status === "cancelled" ? "error" : "done");
      if (task.status === "error" || task.status === "cancelled") {
        error.value = task.error || (task.status === "cancelled" ? "AI 任务已取消" : "AI 任务执行失败");
      }
      return task;
    } catch (err) {
      error.value = errorText(err);
      finishTaskProgress(false);
      throw err;
    } finally {
      isLoading.value = false;
      activeAsyncTaskId.value = null;
    }
  }

  async function cancelActiveTask() {
    if (!currentProject.value) return;
    const taskId = activeAsyncTaskId.value || (currentTask.value?.status === "running" ? currentTask.value.id : null);
    if (!taskId) return;
    const task = await novelApi.cancelTask(currentProject.value.slug, taskId);
    currentTask.value = task;
    upsertTaskHistory(task);
    if (task.status === "cancelled" || task.status === "error") {
      error.value = task.error || "AI 任务已取消";
      finishTaskProgress(false);
      activeAsyncTaskId.value = null;
      isLoading.value = false;
    }
    return task;
  }

  async function polishSelection(mode: string) {
    if (!currentProject.value || !currentChapter.value || !selection.value) return;
    const selectionAnchor = cloneSelection(selection.value);
    isLoading.value = true;
    error.value = "";
    startTaskProgress("selection.polish");
    try {
      setTaskProgress("context", "done");
      setTaskProgress("codex", "running");
      const task = await novelApi.polishSelection(currentProject.value.slug, {
        ...selectionAnchor,
        chapterId: currentChapter.value.id,
        mode
      });
      setTaskProgress("codex", "done");
      setTaskProgress("parse", "running");
      currentTask.value = task;
      taskHistory.value.unshift(task);
      await refreshAiInvocations();
      rewriteCandidate.value = task.result || null;
      rewriteSelection.value = task.result ? selectionAnchor : null;
      setTaskProgress("parse", task.status === "error" ? "error" : "done");
    } catch (err) {
      error.value = errorText(err);
      finishTaskProgress(false);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  function acceptRewrite() {
    const selectionAnchor = rewriteSelection.value || selection.value;
    if (!selectionAnchor || !rewriteCandidate.value?.content) return;
    currentContent.value = `${currentContent.value.slice(0, selectionAnchor.start)}${rewriteCandidate.value.content}${currentContent.value.slice(selectionAnchor.end)}`;
    savedContent.value = savedContent.value === currentContent.value ? currentContent.value : savedContent.value;
    currentQualityReport.value = null;
    syncDashboardWordCount();
    selection.value = null;
    rewriteSelection.value = null;
    rewriteCandidate.value = null;
  }

  async function requestWritingRecapForAcceptedDraft(addition: string, previousTail: string) {
    await runTask("writing.recap", {
      mode: "focus.accepted-draft",
      acceptedDraft: addition,
      previousTail,
      currentTail: currentContent.value.slice(-1600),
      focusGuide: focusWritingGuide.value,
      instruction:
        "请只复盘本次新增候选正文带来的事实变化，生成可由作者确认后写入账本的 WritingRecapCandidate JSON；不要改写正文，也不要自动应用账本。"
    });
  }

  async function acceptFocusDraft() {
    const addition = rewriteCandidate.value?.content.trim();
    if (!addition) return false;
    const previousTail = currentContent.value.slice(-1200);
    const base = currentContent.value.replace(/\s+$/g, "");
    currentContent.value = base ? `${base}\n\n${addition}` : addition;
    currentQualityReport.value = null;
    syncDashboardWordCount();
    selection.value = null;
    rewriteSelection.value = null;
    rewriteCandidate.value = null;
    await requestWritingRecapForAcceptedDraft(addition, previousTail);
    return true;
  }

  function rejectRewrite() {
    rewriteSelection.value = null;
    rewriteCandidate.value = null;
  }

  async function applyTaskPatches() {
    if (!currentProject.value || !rewriteCandidate.value?.patches.length) return;
    if (!canLeaveCurrentChapter()) return;

    const appliedTaskType = currentTask.value?.type || null;
    const applyingQualityRewrite =
      appliedTaskType === "quality.rewrite" ||
      (qualityImprovementState.value.status === "candidate" && rewriteCandidateTargetsCurrentFile.value);
    let patchesToApply = withSelectionPatchAnchors(rewriteCandidate.value.patches);
    if (applyingQualityRewrite) {
      const normalizedQualityRewrite = normalizeCurrentChapterQualityRewrite(rewriteCandidate.value);
      if (!normalizedQualityRewrite) {
        setQualityImprovementState({ status: "error", error: "质量改造候选缺少可应用的当前章节正文 patch。" });
        error.value = "质量改造候选缺少可应用的当前章节正文补丁，请重新生成。";
        return;
      }
      patchesToApply = normalizedQualityRewrite.patches;
      setQualityImprovementState({ status: "applying", error: undefined });
    }
    try {
      await novelApi.applyPatches(currentProject.value.slug, patchesToApply, currentTask.value?.id);
      await refreshAiInvocations();
      if (currentChapter.value) {
        await openChapter(currentChapter.value, currentDocumentKind.value);
        if (applyingQualityRewrite && currentDocumentKind.value === "content") {
          setQualityImprovementState({ status: "reviewing" });
          currentQualityReport.value = null;
          await diagnoseCurrentChapter();
          const versions = await loadCurrentFileVersions();
          const latestVersion = versions[0];
          if (latestVersion) {
            await previewCurrentFileDiff(latestVersion.id);
          }
          const afterReport = currentQualityReport.value as ChapterQualityReport | null;
          setQualityImprovementState({
            status: "applied",
            afterOverallScore: afterReport?.overallScore,
            diffVersionId: latestVersion?.id,
            error: undefined
          });
        }
      }
    } catch (err) {
      if (applyingQualityRewrite) {
        setQualityImprovementState({
          status: "error",
          error: errorText(err)
        });
      }
      throw err;
    }
  }

  async function exportProjectAuditReport() {
    if (!currentProject.value || isExportingAuditReport.value) return false;
    isExportingAuditReport.value = true;
    try {
      const report = await novelApi.readProjectAuditReport(currentProject.value.slug);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${currentProject.value.slug}-audit-report.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      error.value = `导出审计报告失败：${errorText(err)}`;
      return false;
    } finally {
      isExportingAuditReport.value = false;
    }
  }

  async function previewProjectAuditReport() {
    if (!currentProject.value || isLoadingAuditReportPreview.value) return auditReportPreview.value;
    isLoadingAuditReportPreview.value = true;
    try {
      const report = await novelApi.readProjectAuditReport(currentProject.value.slug);
      auditReportPreview.value = report;
      return report;
    } catch (err) {
      error.value = `读取审计报告失败：${errorText(err)}`;
      return null;
    } finally {
      isLoadingAuditReportPreview.value = false;
    }
  }

  function clearAuditReportPreview() {
    auditReportPreview.value = null;
  }

  async function loadCurrentFileVersions() {
    if (!currentProject.value || !currentFilePath.value) {
      fileVersions.value = [];
      return [];
    }
    isLoadingFileVersions.value = true;
    try {
      fileVersions.value = await novelApi.readFileVersions(currentProject.value.slug, currentFilePath.value);
      return fileVersions.value;
    } catch (err) {
      error.value = `读取版本快照失败：${errorText(err)}`;
      return [];
    } finally {
      isLoadingFileVersions.value = false;
    }
  }

  async function previewCurrentFileDiff(versionId: string) {
    if (!currentProject.value || !currentFilePath.value || !versionId) return null;
    isLoadingFileDiff.value = true;
    try {
      currentFileDiff.value = await novelApi.readFileDiff(currentProject.value.slug, currentFilePath.value, versionId);
      return currentFileDiff.value;
    } catch (err) {
      error.value = `读取版本差异失败：${errorText(err)}`;
      return null;
    } finally {
      isLoadingFileDiff.value = false;
    }
  }

  function clearCurrentFileDiff() {
    currentFileDiff.value = null;
  }

  async function requestEditorSuggestion(input: EditorSuggestionRequest): Promise<EditorSuggestion | null> {
    if (!currentProject.value || !currentChapter.value || !currentFilePath.value) return null;
    try {
      const suggestion = await novelApi.requestEditorSuggestion(currentProject.value.slug, {
        ...input,
        chapterId: currentChapter.value.id,
        documentKind: currentDocumentKind.value,
        filePath: currentFilePath.value
      });
      return suggestion.text.trim() ? suggestion : null;
    } catch {
      return null;
    }
  }

  return {
    projects,
    openWorkspaceSlugs,
    openWorkspaceProjects,
    workspaceCache,
    currentProject,
    creativeSession,
    creativeJourney,
    activeStoryBlueprint,
    storyBlueprintLoadError,
    isLoadingStoryBlueprint,
    isAdvancingAuthorJourney,
    authorJourneyError,
    contractCandidates,
    isLoadingContractCandidates,
    contractCandidatesError,
    lastContractDecisionId,
    contractAdoptionProposal,
    isCreatingContractAdoptionProposal,
    contractAdoptionError,
    outlineCandidates,
    compileOutlineCandidate,
    outlineValidationReports,
    isLoadingOutlineCandidates,
    validatingOutlineId,
    outlineCandidatesError,
    outlineChapterSelections,
    outlineAdoptionProposal,
    isAdoptingOutline,
    outlineAdoptionError,
    executionReadyProof,
    executionReadiness,
    isLoadingExecutionReadiness,
    executionReadinessError,
    executionWorkItems,
    isLoadingExecutionWorkItems,
    bookRuns,
    activeBookRun,
    bookRunError,
    isLoadingBookRun,
    completionAudit,
    publicationEdition,
    publicationTree,
    publicationArtifacts,
    deliveryProofVerification,
    publicationPreflight,
    publicationEvidenceError,
    isLoadingPublicationEvidence,
    deliveryProof,
    lengthContract,
    lengthForecast,
    lengthVarianceDecision,
    lengthPlanningError,
    isLoadingLengthPlanning,
    proseCandidates,
    isLoadingProseCandidates,
    proseValidations,
    proseReviews,
    proseRepairPlans,
    proseRepairCandidates,
    proseRepairRegressions,
    proseAdoptionReadiness,
    proseAdoptions,
    proseSettlements,
    feedbackAttributions,
    preferenceHypotheses,
    createFeedbackAttribution,
    derivePreferenceHypothesis,
    revokePreferenceHypothesis,
    recordPreferenceOpposition,
    learningPolicy,
    explorationBudgets,
    createLearningPolicy,
    loadLearningPolicy,
    createExplorationBudget,
    consumeExplorationBudget,
    loadExplorationBudget,
    pauseExplorationBudget,
    craftPatterns,
    craftExperiments,
    characterContracts,
    characterStateSnapshots,
    loadCraftPatterns,
    loadCraftExperiments,
    loadCharacterContracts,
    confirmCharacterContract,
    loadCharacterStateSnapshots,
    promoteCraftPatternFromExperiment,
    validateCraftPatternFromExperiment,
    proseCandidateBusyId,
    proseCandidateError,
    qualityCalibrationEvidence,
    qualityCalibrationHistory,
    isLoadingQualityCalibration,
    qualityCalibrationError,
    releaseAcceptanceDecision,
    releaseActivation,
    releaseActivationError,
    isActivatingRelease,
    isLoadingReleaseAcceptance,
    understandingReview,
    isLoadingUnderstandingReview,
    migrationCutoverReport,
    migrationValidationReport,
    isLoadingMigrationCutover,
    contextManifest,
    isFreezingContextManifest,
    understandingPreview,
    dialogueQuestions,
    activeDialogueQuestion,
    isLoadingDialogueQuestions,
    dialogueQuestionsError,
    isLoadingCreativeSession,
    isSubmittingCreativeMessage,
    creativeSessionError,
    loadCreativeJourney,
    loadDialogueQuestions,
    answerDialogueQuestion,
    loadLatestStoryBlueprint,
    reviseStoryBlueprint,
    regenerateStoryBlueprint,
    confirmStoryBlueprint,
    prepareUnderstandingQuestion,
    retryContractCandidateCompilation,
    currentChapter,
    currentDocumentKind,
    currentDocumentLabel,
    currentSaveStateLabel,
    currentFilePath,
    currentContent,
    isSavingContent,
    selection,
    rewriteSelection,
    activeRewriteSelection,
    rewriteCandidateTargetsCurrentFile,
    rewriteComparisonOriginalText,
    rewriteComparisonEmptyOriginalText,
    rewritePatchApplyLabel,
    canAcceptSelectedRewrite,
    currentTask,
    activeTaskType,
    taskProgress,
    taskHistory,
    aiInvocations,
    aiStages,
    backgroundJobs,
    rewriteCandidate,
    recapCandidate,
    currentQualityReport,
    styleTone,
    focusTargetWords,
    focusDraftInstruction,
    currentWordCount,
    focusProgressPercent,
    activeSceneCard,
    focusWritingGuide,
    creationLoopSteps,
    nextWorkbenchActions,
    workbenchRiskSignals,
    plotPilotLearningItems,
    currentDashboard,
    currentChapterSummary,
    currentRuntimeSnapshot,
    runtimeStatus,
    runtimeEvents,
    activeRuntimeRun,
    activeRuntimeChapterLabel,
    runtimeCheckpoints,
    runtimeBranches,
    latestRuntimeNarrativeSnapshot,
    runtimeKnowledgeRefs,
    runtimeWorkerHealth,
    isRuntimeEventsConnected,
    isStartingRuntime,
    currentSeriesQualityMetrics,
    sceneCards,
    storyControl,
    storyGraph,
    knowledgeIndex,
    knowledgeSearchResult,
    knowledgeRetrievalPreview,
    memoryHealthReport,
    memoryReadyProof,
    memoryContinuityAudit,
    isRunningMemoryGovernance,
    structureIdeaInput,
    structureDraftVersion,
    activeLedgerKind,
    ledgerEntries,
    writingMode,
    isSavingDashboard,
    isSavingScenes,
    isSavingStoryControl,
    isRebuildingKnowledgeIndex,
    isRebuildingSeriesQualityMetrics,
    isImprovingQualityMetrics,
    qualityImprovementState,
    isRebuildingStoryGraph,
    isSearchingKnowledge,
    runMemoryGovernance,
    isReverseEngineeringStructure,
    isExportingAuditReport,
    auditReportPreview,
    isLoadingAuditReportPreview,
    fileVersions,
    currentFileDiff,
    isLoadingFileVersions,
    isLoadingFileDiff,
    autoRunSavePipeline,
    savePipelineSteps,
    isRunningSavePipeline,
    agentProfiles,
    agentChecks,
    defaultAgentProfileId,
    isSavingAiConfig,
    platformAiConfig,
    activeNovelAiConfig,
    activeNovelAgentProfile,
    activeNovelAgentCheck,
    activeNovelAiSummary,
    platformLibrary,
    supportFiles,
    currentSupportPath,
    supportContent,
    isLoading,
    error,
    hasProject,
    hasUnsavedChanges,
    hasUnsavedSupportChanges,
    canUseSelection,
    canTuneSelection,
    canDiagnoseChapter,
    canImproveQualityMetrics,
    qualityTargetScore,
    qualityMaxScore,
    qualityMetricsBelowTarget,
    canReverseEngineerStructure,
    canRequestFocusDraft,
    canRequestStoryOrchestration,
    currentProjectAssets,
    canLeaveCurrentWorkspace,
    loadProjects,
    loadPlatformLibrary,
    loadAiStages,
    loadPlatformAiConfig,
    loadAgentProfiles,
    checkAgentProfile,
    updateProjectAiConfig,
    savePlatformAiConfig,
    createProject,
    importProject,
    deleteProject,
    createSharedAsset,
    linkSharedAsset,
    loadChapterCockpit,
    loadCreationRuntimeSnapshot,
    loadRuntimeStatus,
    connectRuntimeEvents,
    disconnectRuntimeEvents,
    startAutopilotRuntime,
    pauseAutopilotRuntime,
    resumeAutopilotRuntime,
    stopAutopilotRuntime,
    acceptAutopilotReview,
    rewriteAutopilotReview,
    sendAutopilotDirection,
    createAutopilotDerivative,
    mergeAutopilotDerivative,
    restoreAutopilotCheckpoint,
    loadSeriesQualityMetrics,
    loadStoryControl,
    loadStoryGraph,
    loadKnowledgeIndex,
    loadBackgroundJobs,
    rebuildKnowledgeIndex,
    rebuildSeriesQualityMetrics,
    rebuildStoryGraph,
    cancelBackgroundJob,
    retryBackgroundJob,
    searchKnowledgeIndex,
    updateDashboard,
    saveCurrentDashboard,
    updateSceneCards,
    saveCurrentSceneCards,
    updateStoryControl,
    saveStoryControl,
    saveCurrentStructure,
    updateStructureIdeaInput,
    reverseEngineerStructureFromDraft,
    generateStructureFromIdea,
    loadLedger,
    saveLedger,
    updateLedgerEntries,
    setWritingMode,
    updateFocusTargetWords,
    updateFocusDraftInstruction,
    requestFocusDraft,
    requestFocusDraftRevision,
    requestStoryOrchestration,
    diagnoseCurrentChapter,
    improveQualityMetrics,
    updateStyleTone,
    tuneSelectionStyle,
    requestWritingRecap,
    runCreationLoopAction,
    acceptWritingRecap,
    rejectWritingRecap,
    openProject,
    loadCreativeSession,
    loadContractCandidates,
    createContractAdoptionProposal,
    commitContractAdoption,
    loadContractAdoptionProposal,
    loadOutlineCandidates,
    validateOutlineCandidate,
    setOutlineChapterSelection,
    createOutlineAdoptionProposal,
    authorizeOutlineAdoption,
    commitOutlineAdoption,
    loadOutlineAdoptionProposal,
    loadExecutionReadyProof,
    checkExecutionReadiness,
    startChapterProduction,
    loadExecutionWorkItems,
    loadBookRuns,
    startBookRun,
    advanceActiveBookRun,
    runActiveBookCompletionAudit,
    loadPublicationEvidence,
    issuePublicationDeliveryProof,
    createPublicationEdition,
    compilePublicationEditionTree,
    renderPublicationEditionArtifacts,
    loadProseCandidates,
    loadQualityCalibrationEvidence,
    submitQualityCalibrationEvidence,
    loadReleaseAcceptance,
    loadReleaseActivation,
    activateAcceptedRelease,
    loadLengthPlanning,
    createProjectLengthContract,
    decideProjectLengthVariance,
    loadUnderstandingReview,
    submitExternalUnderstandingReview,
    loadMigrationCutover,
    validateAllProjectMigrations,
    validateProseCandidate,
    reviewProseCandidate,
    createProseRepairPlan,
    createProseRepairCandidate,
    evaluateProseRepairRegression,
    loadProseAdoptionReadiness,
    adoptProseCandidate,
    settleProseCandidate,
    loadUnderstandingPreview,
    loadContextManifest,
    freezeCurrentContextManifest,
    executeCreativeJourneyAction,
    captureAuthorMessage,
    showProjectHub,
    closeWorkspace,
    openChapter,
    openChapterDocument,
    updateContent,
    updateSelection,
    saveCurrentContent,
    openSupportFile,
    updateSupportContent,
    saveSupportContent,
    runTask,
    cancelActiveTask,
    setAutoRunSavePipeline,
    runPostSavePipeline,
    runPostSavePipelineFromCurrentContent,
    polishSelection,
    acceptRewrite,
    acceptFocusDraft,
    rejectRewrite,
    applyTaskPatches,
    exportProjectAuditReport,
    previewProjectAuditReport,
    clearAuditReportPreview,
    loadCurrentFileVersions,
    previewCurrentFileDiff,
    clearCurrentFileDiff,
    requestEditorSuggestion
  };
});
