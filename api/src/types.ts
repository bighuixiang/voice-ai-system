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

export type NovelTaskStatus = "pending" | "running" | "success" | "error" | "cancelled";

export type CreativeModuleKey = "novel" | "assets" | "script" | "image-generation" | "video-generation";
export type AiAgentProvider = "codex" | "claude-code";
export type AiUsageScenarioKey = "novel" | "assets" | "script" | "image-generation" | "video-generation";
export type KnowledgeEmbeddingProvider = "local" | "openai-compatible";
export type QualityMetricKey = "rhythm" | "conflict" | "emotion" | "information" | "prose" | "hook";
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

export type StoryGraphNodeType = "arc" | "character" | "event" | "chapter" | "ledger";
export type StoryGraphEdgeType = "contains" | "involves" | "tracks" | "references";

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

export interface StoryGraphProjection {
  projectSlug: string;
  nodes: StoryGraphNode[];
  edges: StoryGraphEdge[];
  updatedAt: string;
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

export interface ChapterSummary {
  chapterId: string;
  summary: string;
  keyEvents: string[];
  newFacts: ChapterFactPatch[];
  characterStateChanges: CharacterStatePatch[];
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

export type CreationLoopStepStatus = "done" | "active" | "waiting" | "blocked";
export type CreationRuntimeStepId = "structure" | "draft" | "review" | "recap" | "ledger" | "next";

export interface CreationRuntimeStep {
  id: CreationRuntimeStepId;
  label: string;
  status: CreationLoopStepStatus;
  detail: string;
  metric?: string;
}

export interface CreationRuntimeSnapshot {
  projectSlug: string;
  chapterId: string;
  chapterTitle: string;
  activeStepId?: CreationRuntimeStepId;
  fingerprint: string;
  steps: CreationRuntimeStep[];
  signals: {
    wordCount: number;
    sceneCount: number;
    hasDashboard: boolean;
    hasChapterSummary: boolean;
    hasQualityReport: boolean;
    hasWritingRecap: boolean;
    acceptedLedgerCount: number;
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
  status: NovelTaskStatus;
  projectId: string;
  inputSummary: string;
  outputSummary?: string;
  result?: CodexTaskResult;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

export type AiInvocationAdoptionDecision = "pending" | "accepted" | "rejected" | "not-required";

export interface AiInvocationPromptSnapshot {
  length: number;
  preview: string;
  contextTitles: string[];
}

export interface AiInvocationContextBlockSnapshot {
  title: string;
  length: number;
}

export interface AiInvocationContextSnapshot {
  blockCount: number;
  totalChars: number;
  blocks: AiInvocationContextBlockSnapshot[];
}

export interface AiInvocationSession {
  id: string;
  taskId: string;
  projectId: string;
  taskType: CodexTaskType;
  stageKey: AiStageKey;
  status: NovelTaskStatus;
  agentProfileId?: string;
  agentProvider?: AiAgentProvider;
  modelId?: string;
  promptSnapshot: AiInvocationPromptSnapshot;
  contextSnapshot: AiInvocationContextSnapshot;
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
    byStatus: Record<NovelTaskStatus, number>;
    byType: Partial<Record<CodexTaskType, number>>;
    latestTasks: Array<Pick<NovelTask, "id" | "type" | "status" | "inputSummary" | "outputSummary" | "error" | "startedAt" | "finishedAt" | "durationMs">>;
  };
  aiInvocationSummary: {
    total: number;
    byDecision: Record<AiInvocationAdoptionDecision, number>;
    proposedPatchCount: number;
    acceptedPatchCount: number;
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
export type BackgroundJobStatus = "pending" | "running" | "success" | "error";

export interface BackgroundJob {
  id: string;
  projectId: string;
  type: BackgroundJobType;
  status: BackgroundJobStatus;
  inputSummary: string;
  outputSummary?: string;
  resultRef?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  updatedAt: string;
}

export interface SelectionPayload {
  chapterId: string;
  filePath: string;
  selectedText: string;
  beforeText: string;
  afterText: string;
  mode: string;
  start: number;
  end: number;
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
