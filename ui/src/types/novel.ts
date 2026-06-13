export type CodexTaskType =
  | "project.create"
  | "outline.generate"
  | "structure.reverse"
  | "chapter.plan"
  | "chapter.draft"
  | "selection.polish"
  | "continuity.check"
  | "idea.suggest"
  | "writing.briefing"
  | "writing.recap"
  | "assistant.free";

export type CreativeModuleKey = "novel" | "assets" | "script" | "image-generation" | "video-generation";
export type ChapterDocumentKind = "content" | "outline";
export type WritingMode = "focus" | "structure" | "review";
export type CreationLoopStepStatus = "done" | "active" | "waiting" | "blocked";
export type CreationLoopAction =
  | "open-structure"
  | "open-focus"
  | "save-draft"
  | "open-review"
  | "diagnose"
  | "request-recap"
  | "accept-recap";

export interface WorkbenchNextAction {
  id: string;
  priority: "critical" | "recommended" | "optional";
  label: string;
  reason: string;
  action: CreationLoopAction;
  targetPanel?: string;
}

export interface WorkbenchSourceRef {
  id: string;
  label: string;
  value?: string;
  kind?: "draft" | "quality" | "runtime" | "ledger" | "ai" | "job" | "graph" | "structure";
}

export type WorkbenchCommand =
  | { type: "creation-action"; action: CreationLoopAction }
  | { type: "open-risk"; riskId: string }
  | { type: "open-story-graph"; characterId?: string; nodeId?: string; appearanceStatus?: CharacterScheduleStatus; reason?: string }
  | { type: "open-audit-report"; section?: "ai-control-plane" };

export interface WorkbenchRiskSignal {
  id: string;
  label: string;
  status: "blocked" | "watch" | "stable";
  reason: string;
  action?: CreationLoopAction;
  actionLabel?: string;
  command?: WorkbenchCommand;
  commandLabel?: string;
  source: string;
  detailRows?: WorkbenchSourceRef[];
  sourceRefs?: WorkbenchSourceRef[];
}

export interface PlotPilotLearningItem {
  id: string;
  label: string;
  status: "done" | "partial" | "planned";
  sourcePattern: string;
  localLanding: string;
  userValue: string;
  entryAction?: CreationLoopAction;
  entryCommand?: WorkbenchCommand;
  evidenceCount?: number;
  active?: boolean;
  activeReason?: string;
  sourceRefs?: WorkbenchSourceRef[];
}
export type QualityMetricKey = "rhythm" | "conflict" | "emotion" | "information" | "prose" | "hook" | "tension";
export type StyleToneKey = "elegant" | "restrained" | "tense" | "cinematic" | "web-serial" | "lower-ai";
export type AiAgentProvider = "codex" | "claude-code";
export type AiUsageScenarioKey = "novel" | "assets" | "script" | "image-generation" | "video-generation";
export type KnowledgeEmbeddingProvider = "local" | "openai-compatible";
export type AiStageKey =
  | "pipeline.project.create"
  | "pipeline.outline.generate"
  | "pipeline.structure.reverse"
  | "pipeline.chapter.plan"
  | "pipeline.chapter.prose"
  | "pipeline.selection.polish"
  | "pipeline.chapter.validate"
  | "pipeline.idea.suggest"
  | "pipeline.writing.briefing"
  | "autopilot.post_chapter.recap"
  | "assistant.free";

export interface AiStageDefinition {
  key: AiStageKey;
  label: string;
  taskTypes: CodexTaskType[];
}

export interface AiAgentModelOption {
  id: string;
  label: string;
  provider: AiAgentProvider;
  tags?: string[];
}

export interface AiAgentProfile {
  id: string;
  label: string;
  provider: AiAgentProvider;
  command: string;
  model?: string;
  allowCustomModel?: boolean;
  enabled: boolean;
  versionArgs: string[];
  models: AiAgentModelOption[];
}

export interface AiAgentCheckResult {
  available: boolean;
  profileId: string;
  provider: AiAgentProvider;
  label: string;
  command: string;
  version?: string;
  error?: string;
}

export interface ProjectAiConfig {
  profileId?: string;
  modelId?: string;
}

export interface AiScenarioConfig {
  profileId: string;
  modelId?: string;
}

export interface KnowledgeEmbeddingConfig {
  provider: KnowledgeEmbeddingProvider;
  baseUrl?: string;
  model?: string;
  apiKeyConfigured?: boolean;
  apiKey?: string;
}

export interface PlatformAiConfig {
  version: 1;
  defaultScenario: AiUsageScenarioKey;
  scenarios: Record<AiUsageScenarioKey, AiScenarioConfig>;
  knowledgeEmbedding: KnowledgeEmbeddingConfig;
  updatedAt: string;
}

export interface CreativeProjectModule {
  key: CreativeModuleKey;
  label: string;
  status: "active" | "planned";
}

export interface NovelChapter {
  id: string;
  title: string;
  outlinePath: string;
  contentPath: string;
  status: "empty" | "planned" | "drafted" | "checked";
  order?: number;
  volumeId?: string;
  volumeTitle?: string;
  volumeOrder?: number;
}

export interface ChapterDashboard {
  chapterId: string;
  goal: string;
  pov: string;
  mainConflict: string;
  endingHook: string;
  wordCount: number;
  status: "empty" | "planned" | "drafting" | "drafted" | "reviewing" | "checked";
  unresolvedForeshadowingIds: string[];
  continuityRiskIds: string[];
  updatedAt: string;
}

export interface SceneCard {
  id: string;
  chapterId: string;
  order: number;
  title: string;
  time: string;
  location: string;
  pov: string;
  characters: string[];
  conflict: string;
  turn: string;
  informationReleased: string[];
  foreshadowingIds: string[];
  powerProgression: string;
  draftAnchor?: string;
  updatedAt: string;
}

export type StoryEventType = "event" | "dungeon" | "team-fight" | "training" | "reveal";
export type StoryControlStatus = "seed" | "planned" | "active" | "resolved" | "blocked";

export interface StoryArc {
  id: string;
  title: string;
  chapterRange: string;
  goal: string;
  stakes: string;
  payoff: string;
  status: StoryControlStatus;
  updatedAt: string;
}

export interface StoryCharacterProfile {
  id: string;
  name: string;
  role: string;
  goal: string;
  currentState: string;
  knownSecrets: string;
  relationshipNotes: string;
  powerLevel: string;
  firstChapterId?: string;
  lastSeenChapterId?: string;
  status: StoryControlStatus;
  updatedAt: string;
}

export interface StoryEventCard {
  id: string;
  type: StoryEventType;
  title: string;
  trigger: string;
  participants: string[];
  location: string;
  conflict: string;
  reward: string;
  cost: string;
  foreshadowing: string;
  chapterRange: string;
  status: StoryControlStatus;
  updatedAt: string;
}

export interface StoryControl {
  version: 1;
  premise: string;
  currentArcId?: string;
  arcs: StoryArc[];
  characters: StoryCharacterProfile[];
  events: StoryEventCard[];
  orchestrationNotes: string;
  updatedAt: string;
}

export type StoryGraphNodeType = "arc" | "character" | "event" | "chapter" | "ledger" | "knowledge";
export type StoryGraphEdgeType = "contains" | "involves" | "tracks" | "references" | "asserts" | "relationship";

export interface StoryGraphNode {
  id: string;
  type: StoryGraphNodeType;
  label: string;
  subtitle?: string;
  status?: string;
  chapterIds?: string[];
}

export interface StoryGraphEdge {
  id: string;
  source: string;
  target: string;
  type: StoryGraphEdgeType;
  label?: string;
}

export type CharacterRelationshipSourceType = "knowledge" | "event" | "profile";

export interface CharacterRelationshipEvidence {
  sourceType: CharacterRelationshipSourceType;
  sourceId: string;
  label: string;
  chapterIds: string[];
  note?: string;
}

export interface CharacterRelationshipEdge {
  id: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  sourceName: string;
  targetName: string;
  label: string;
  weight: number;
  sourceTypes: CharacterRelationshipSourceType[];
  chapterIds: string[];
  evidence: CharacterRelationshipEvidence[];
}

export interface CharacterRelationshipCoverage {
  characterId: string;
  name: string;
  relationshipCount: number;
  eventCount: number;
  knowledgeTripleCount: number;
  hasProfileNote: boolean;
  isolated: boolean;
}

export type CharacterScheduleStatus = "should-appear" | "overexposed" | "absent" | "balanced";

export interface CharacterAppearanceSignal {
  characterId: string;
  name: string;
  status: CharacterScheduleStatus;
  priority: number;
  appearanceCount: number;
  lastChapterId?: string;
  lastChapterNumber?: number;
  gapChapters?: number;
  mentionedInUpcoming: boolean;
  relationshipCount: number;
  reasons: string[];
}

export interface CharacterRelationGraph {
  characters: StoryGraphNode[];
  relationships: CharacterRelationshipEdge[];
  coverage: CharacterRelationshipCoverage[];
  appearanceSignals: CharacterAppearanceSignal[];
}

export interface StoryGraphProjection {
  projectSlug: string;
  nodes: StoryGraphNode[];
  edges: StoryGraphEdge[];
  characterRelations?: CharacterRelationGraph;
  updatedAt: string;
}

export interface StoryGraphFocus {
  nodeId?: string;
  characterId?: string;
  appearanceStatus?: CharacterScheduleStatus;
}

export interface LedgerEntry {
  id: string;
  kind: "foreshadowing" | "continuity" | "power" | "character" | "risk";
  title: string;
  status: "open" | "watch" | "resolved" | "blocked";
  severity: "low" | "medium" | "high";
  chapterIds: string[];
  relatedEntities: string[];
  note: string;
  expectedResolutionChapterId?: string;
  updatedAt: string;
}

export type RecapPatchStatus = "pending" | "accepted" | "rejected";

export interface ChapterFactPatch {
  id: string;
  chapterId: string;
  fact: string;
  relatedEntities: string[];
  sourceAnchor?: string;
  status: RecapPatchStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterStatePatch {
  id: string;
  chapterId: string;
  characterId?: string;
  characterName: string;
  before?: string;
  after: string;
  cause: string;
  relatedEntities: string[];
  status: RecapPatchStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EmotionLedgerItem {
  id: string;
  chapterId?: string;
  characterName?: string;
  description: string;
  cause?: string;
  status: "open" | "active" | "resolved";
  relatedEntities: string[];
  updatedAt: string;
}

export interface EmotionLedger {
  wounds: EmotionLedgerItem[];
  boons: EmotionLedgerItem[];
  powerShifts: EmotionLedgerItem[];
  openLoops: EmotionLedgerItem[];
}

export interface ChapterSummary {
  chapterId: string;
  summary: string;
  keyEvents: string[];
  newFacts: ChapterFactPatch[];
  characterStateChanges: CharacterStatePatch[];
  emotionLedger?: EmotionLedger;
  foreshadowingUpdates: LedgerEntry[];
  continuityRisks: LedgerEntry[];
  powerProgressionUpdates: LedgerEntry[];
  acceptedRecapIds: string[];
  updatedAt: string;
}

export interface WritingBriefing {
  chapterId: string;
  previousChapterEnding: string;
  currentGoal: string;
  povLimits: string[];
  mustRemember: string[];
  mustNotReveal: string[];
  unresolvedForeshadowing: LedgerEntry[];
  risks: LedgerEntry[];
}

export interface WritingRecapCandidate {
  chapterId: string;
  summary: string;
  newFacts: string[];
  characterStateChanges: string[];
  foreshadowingUpdates: LedgerEntry[];
  continuityRisks: LedgerEntry[];
  powerProgressionUpdates: LedgerEntry[];
  createdAt: string;
  summaryPatch?: Partial<ChapterSummary>;
  emotionLedgerPatch?: Partial<EmotionLedger>;
  factPatches?: ChapterFactPatch[];
  ledgerPatches?: LedgerEntry[];
  characterStatePatches?: CharacterStatePatch[];
  riskPatches?: LedgerEntry[];
}

export type KnowledgeSourceType = "chapter-summary" | "ledger" | "story-control";

export interface KnowledgeSourceRef {
  type: KnowledgeSourceType;
  id: string;
  label?: string;
}

export interface KnowledgeFact {
  id: string;
  text: string;
  chapterIds: string[];
  relatedEntities: string[];
  keywords: string[];
  source: KnowledgeSourceRef;
  updatedAt: string;
}

export interface KnowledgeTriple {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  chapterIds: string[];
  sourceFactIds: string[];
  updatedAt: string;
}

export interface ChapterIndexEntry {
  chapterId: string;
  title: string;
  order?: number;
  keywords: string[];
  factIds: string[];
  tripleIds: string[];
  entityNames: string[];
  updatedAt: string;
}

export interface ChapterMemoryIndex {
  projectSlug: string;
  chapters: ChapterIndexEntry[];
  keywords: Record<string, string[]>;
  updatedAt: string;
}

export interface KnowledgeIndexProjection {
  projectSlug: string;
  facts: KnowledgeFact[];
  triples: KnowledgeTriple[];
  chapterIndex: ChapterMemoryIndex;
  vectorSummary?: KnowledgeVectorSummary;
  updatedAt: string;
}

export interface KnowledgeSearchQuery {
  query: string;
  chapterId?: string;
  limit?: number;
}

export interface KnowledgeVectorEntry {
  id: string;
  kind: "fact" | "triple" | "chapter";
  label: string;
  text: string;
  chapterIds: string[];
  sourceIds: string[];
  vector: number[];
  updatedAt: string;
}

export interface KnowledgeVectorIndex {
  projectSlug: string;
  provider: "local" | "openai-compatible";
  model?: string;
  dimensions: number;
  entries: KnowledgeVectorEntry[];
  fallbackFrom?: "local" | "openai-compatible";
  fallbackReason?: string;
  updatedAt: string;
}

export interface KnowledgeVectorSummary {
  provider: KnowledgeVectorIndex["provider"];
  model?: string;
  dimensions: number;
  entryCount: number;
  fallbackFrom?: KnowledgeVectorIndex["provider"];
  fallbackReason?: string;
  updatedAt: string;
}

export interface KnowledgeSearchResult {
  query: string;
  tokens: string[];
  vectorSummary?: KnowledgeVectorSummary;
  facts: Array<KnowledgeFact & { score: number; vectorScore?: number }>;
  triples: Array<KnowledgeTriple & { score: number; vectorScore?: number }>;
  chapters: Array<ChapterIndexEntry & { score: number; vectorScore?: number }>;
}

export interface ChapterQualityMetric {
  key: QualityMetricKey;
  label: string;
  score: number;
  note: string;
}

export interface ChapterQualityReport {
  chapterId: string;
  overallScore: number;
  summary: string;
  metrics: ChapterQualityMetric[];
  strengths: string[];
  fixes: string[];
  updatedAt: string;
}

export interface SeriesQualityMetricAverage {
  key: QualityMetricKey;
  label: string;
  averageScore: number;
  reportCount: number;
}

export interface SeriesQualityChapterSignal {
  chapterId: string;
  chapterTitle: string;
  overallScore: number;
  weakestMetricKey?: QualityMetricKey;
  weakestMetricLabel?: string;
  weakestMetricScore?: number;
  updatedAt: string;
}

export interface SeriesRhythmSignal {
  chapterId: string;
  chapterTitle: string;
  rhythmScore?: number;
  overallScore?: number;
  wordCount: number;
  sceneCount: number;
  beatCount: number;
  note: string;
  updatedAt: string;
}

export interface CharacterArcSignal {
  characterName: string;
  changeCount: number;
  chapterIds: string[];
  firstChapterId: string;
  lastChapterId: string;
  latestState: string;
  latestCause: string;
  updatedAt: string;
}

export interface SeriesQualityTrendPoint {
  chapterId: string;
  chapterTitle: string;
  score: number;
  updatedAt: string;
}

export interface SeriesQualityTrend {
  key: QualityMetricKey | "overall";
  label: string;
  points: SeriesQualityTrendPoint[];
  averageScore: number;
  latestScore: number;
  previousScore?: number;
  delta?: number;
}

export interface SeriesTensionPoint {
  chapterId: string;
  chapterTitle: string;
  tensionScore: number;
  conflictScore?: number;
  hookScore?: number;
  emotionScore?: number;
  rhythmScore?: number;
  sceneCount: number;
  note: string;
  updatedAt: string;
}

export interface SeriesStyleDriftSignal {
  chapterId: string;
  chapterTitle: string;
  proseScore: number;
  baselineScore: number;
  drift: number;
  severity: "stable" | "watch" | "review";
  note: string;
  updatedAt: string;
}

export interface NarrativeDebtSignal {
  chapterId: string;
  chapterTitle: string;
  debtCount: number;
  openForeshadowingCount: number;
  riskCount: number;
  openLoopCount: number;
  overdueCount: number;
  severity: "stable" | "watch" | "blocked";
  note: string;
  updatedAt: string;
}

export interface SeriesQualityMetrics {
  projectSlug: string;
  chapterCount: number;
  reportCount: number;
  averageOverallScore: number;
  metricAverages: SeriesQualityMetricAverage[];
  weakestChapters: SeriesQualityChapterSignal[];
  rhythmSignals?: SeriesRhythmSignal[];
  characterArcSignals?: CharacterArcSignal[];
  qualityTrends?: SeriesQualityTrend[];
  tensionCurve?: SeriesTensionPoint[];
  styleDriftSignals?: SeriesStyleDriftSignal[];
  narrativeDebtSignals?: NarrativeDebtSignal[];
  updatedAt: string;
}

export interface FocusWritingGuide {
  chapterId: string;
  targetWords: number;
  currentWords: number;
  progressPercent: number;
  stageLabel: string;
  sceneTitle: string;
  nextBeat: string;
  guardrails: string[];
  prompt: string;
  updatedAt: string;
}

export interface CreationLoopStep {
  id: "structure" | "draft" | "review" | "recap" | "ledger" | "next";
  label: string;
  status: CreationLoopStepStatus;
  detail: string;
  metric?: string;
  signals?: string[];
  action?: CreationLoopAction;
  actionLabel?: string;
}

export type CreationRuntimeStepId = CreationLoopStep["id"];

export type CreationRuntimeStep = Omit<CreationLoopStep, "action" | "actionLabel">;

export interface CreationRuntimeSnapshot {
  projectSlug: string;
  chapterId: string;
  chapterTitle: string;
  activeStepId?: CreationLoopStep["id"];
  fingerprint: string;
  steps: Array<Omit<CreationLoopStep, "action" | "actionLabel">>;
  signals: {
    wordCount: number;
    sceneCount: number;
    hasDashboard: boolean;
    hasChapterSummary: boolean;
    hasQualityReport: boolean;
    hasWritingRecap: boolean;
    acceptedLedgerCount: number;
    narrativeDebt?: Pick<NarrativeDebtSignal, "debtCount" | "openForeshadowingCount" | "riskCount" | "openLoopCount" | "overdueCount" | "severity">;
  };
  updatedAt: string;
}

export interface NovelProject {
  id: string;
  slug: string;
  title: string;
  genre: string;
  roughIdea: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedChapterId: string;
  codex: {
    command: string;
    model?: string;
  };
  ai?: ProjectAiConfig;
  modules?: CreativeProjectModule[];
  chapters: NovelChapter[];
}

export interface NovelFilePatch {
  target: string;
  mode: "replace-selection" | "replace-file";
  content: string;
  selection?: {
    start: number;
    end: number;
  };
}

export interface FileVersionSnapshot {
  id: string;
  filePath: string;
  versionPath: string;
  createdAt: string;
  size: number;
}

export interface FileDiffResult {
  filePath: string;
  fromVersion: FileVersionSnapshot;
  toVersion: {
    id: "current";
    label: string;
    createdAt: string;
  };
  original: string;
  modified: string;
}

export interface EditorSuggestionRequest {
  filePath: string;
  chapterId?: string;
  documentKind: ChapterDocumentKind;
  beforeText: string;
  afterText: string;
  selectedText?: string;
}

export interface EditorSuggestion {
  id: string;
  text: string;
  summary: string;
  source: "local" | "ai";
  createdAt: string;
}

export interface CodexTaskResult {
  summary: string;
  content: string;
  changes: string[];
  risks: string[];
  questions: string[];
  patches: NovelFilePatch[];
  rawOutput?: string;
  parseError?: string;
}

export interface NovelTask {
  id: string;
  type: CodexTaskType;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  projectId: string;
  inputSummary: string;
  outputSummary?: string;
  result?: CodexTaskResult;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  timeoutMs?: number;
  cancelRequestedAt?: string;
}

export type AiInvocationAdoptionDecision = "pending" | "accepted" | "rejected" | "not-required";
export type AiInvocationContextTier = "T0" | "T1" | "T2" | "T3";

export interface AiInvocationSession {
  id: string;
  taskId: string;
  projectId: string;
  taskType: CodexTaskType;
  stageKey: AiStageKey;
  status: NovelTask["status"];
  agentProfileId?: string;
  agentProvider?: AiAgentProvider;
  modelId?: string;
  promptVersion?: string;
  variablePlan?: {
    payloadKeys: string[];
    target?: string;
    contextTierCounts?: Partial<Record<AiInvocationContextTier, number>>;
  };
  preCallReview?: {
    status: "pass" | "warn";
    warnings: string[];
    reviewedAt: string;
  };
  promptSnapshot: {
    length: number;
    preview: string;
    contextTitles: string[];
  };
  contextSnapshot: {
    blockCount: number;
    totalChars: number;
    blocks: Array<{ title: string; length: number; tier?: AiInvocationContextTier; truncated?: boolean }>;
    tierCounts?: Partial<Record<AiInvocationContextTier, number>>;
    truncatedBlocks?: string[];
  };
  attempt: {
    index: number;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
    exitCode?: number | null;
    error?: string;
  };
  adoptionDecision: AiInvocationAdoptionDecision;
  adoptionUpdatedAt?: string;
  proposedPatchTargets: string[];
  acceptedPatchTargets: string[];
  commitResult: {
    historyAppended: boolean;
    invocationAppended: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAuditReport {
  projectSlug: string;
  projectTitle: string;
  generatedAt: string;
  chapters: Array<Pick<NovelChapter, "id" | "title" | "status" | "contentPath" | "outlinePath">>;
  quality: SeriesQualityMetrics;
  taskSummary: {
    total: number;
    byStatus: Record<NovelTask["status"], number>;
    byType: Partial<Record<CodexTaskType, number>>;
    latestTasks: Array<Pick<NovelTask, "id" | "type" | "status" | "inputSummary" | "outputSummary" | "error" | "startedAt" | "finishedAt" | "durationMs" | "timeoutMs" | "cancelRequestedAt">>;
  };
  aiInvocationSummary: {
    total: number;
    byDecision: Record<AiInvocationAdoptionDecision, number>;
    proposedPatchCount: number;
    acceptedPatchCount: number;
    promptVersions: Record<string, number>;
    preCallWarnings: Record<string, number>;
    contextTierTotals: Partial<Record<AiInvocationContextTier, number>>;
    truncatedContextBlocks: Array<{ title: string; count: number }>;
  };
  knowledgeSummary: {
    factCount: number;
    tripleCount: number;
    indexedChapterCount: number;
    keywordCount: number;
    vectorSummary?: KnowledgeVectorSummary;
  };
  runtimeSummary: {
    chapterCount: number;
    byActiveStep: Record<CreationRuntimeStepId | "none", number>;
    blockedStepCount: number;
    snapshots: Array<
      Pick<CreationRuntimeSnapshot, "chapterId" | "chapterTitle" | "activeStepId" | "fingerprint" | "signals" | "updatedAt"> & {
        steps: Array<Pick<CreationRuntimeStep, "id" | "status" | "metric">>;
      }
    >;
  };
  backgroundJobSummary: {
    total: number;
    byStatus: Record<BackgroundJobStatus, number>;
    latestJobs: Array<
      Pick<BackgroundJob, "id" | "type" | "status" | "inputSummary" | "outputSummary" | "error" | "startedAt" | "finishedAt" | "durationMs" | "updatedAt">
    >;
  };
  aiInvocations: AiInvocationSession[];
}

export type BackgroundJobType = "knowledge.index.rebuild" | "quality.series.rebuild" | "story.graph.rebuild";
export type BackgroundJobStatus = "pending" | "running" | "success" | "error" | "cancelled";

export interface BackgroundJob {
  id: string;
  projectId: string;
  type: BackgroundJobType;
  status: BackgroundJobStatus;
  inputSummary: string;
  outputSummary?: string;
  resultRef?: string;
  error?: string;
  retryOf?: string;
  cancelRequestedAt?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  updatedAt: string;
}

export type SavePipelineStepId = "save" | "recap" | "runtime" | "quality" | "knowledge" | "story";
export type SavePipelineStepStatus = "pending" | "running" | "queued" | "done" | "skipped" | "error";

export interface SavePipelineStep {
  id: SavePipelineStepId;
  label: string;
  status: SavePipelineStepStatus;
  detail?: string;
}

export interface EditorSelection {
  filePath: string;
  selectedText: string;
  beforeText: string;
  afterText: string;
  start: number;
  end: number;
}

export interface TaskProgressStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
}

export type PlatformAssetType = "character" | "prop" | "scene" | "style" | "reference" | "frame" | "video";
export type PlatformAssetScope = "project" | "shared";
export type PlatformDomain = "novel" | "asset" | "image" | "video" | "script";

export interface PlatformRelationTarget {
  projectSlug: string;
  kind: "chapter" | "character" | "location" | "plot" | "prompt" | "script";
  target: string;
  note?: string;
}

export interface PlatformAsset {
  id: string;
  name: string;
  type: PlatformAssetType;
  scope: PlatformAssetScope;
  projectSlug?: string;
  sourceProjectSlug?: string;
  filePath?: string;
  tags: string[];
  linkedProjects: string[];
  relatedNovelItems: PlatformRelationTarget[];
  createdAt: string;
  updatedAt: string;
}

export interface PromptPreset {
  id: string;
  title: string;
  category: PlatformDomain;
  roleId: string;
  prompt: string;
  tags: string[];
  isSystem: boolean;
}

export interface ExpertRole {
  id: string;
  name: string;
  domain: PlatformDomain;
  systemPrompt: string;
  defaultPromptIds: string[];
}

export interface SkillEntry {
  id: string;
  name: string;
  scope: "system" | "user" | "project";
  description: string;
  path?: string;
  tags: string[];
  enabled: boolean;
}

export interface PlatformLibrary {
  version: 1;
  assets: PlatformAsset[];
  prompts: PromptPreset[];
  roles: ExpertRole[];
  skills: SkillEntry[];
  updatedAt: string;
}
