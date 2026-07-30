export type CodexTaskType =
  | "project.create"
  | "outline.generate"
  | "structure.reverse"
  | "chapter.plan"
  | "chapter.draft"
  | "quality.review"
  | "selection.polish"
  | "quality.rewrite"
  | "continuity.check"
  | "idea.suggest"
  | "writing.briefing"
  | "writing.recap"
  | "assistant.free";

export type NovelTaskStatus = "pending" | "running" | "success" | "error" | "cancelled";

export type RuntimeRunStatus = "queued" | "running" | "paused" | "review_required" | "completed" | "failed" | "cancelled";
export type RuntimeCommandType = "start" | "pause" | "resume" | "stop" | "rewrite" | "accept" | "direction" | "derivative";
export type RuntimeCommandStatus = "pending" | "claimed" | "succeeded" | "failed" | "cancelled";
export type RuntimeEventType = "command" | "run" | "stage" | "checkpoint" | "write" | "quality" | "review" | "error" | "system";
export type RuntimePipelineStage =
  | "find_next_chapter"
  | "checkpoint_before_run"
  | "prepare_narrative_snapshot"
  | "chapter_plan"
  | "context_assemble"
  | "chapter_draft"
  | "content_validate"
  | "quality_review"
  | "recap_and_ledger"
  | "knowledge_index_update"
  | "story_graph_update"
  | "finalize_or_gate";
export type RuntimeDerivativeType = "side_story" | "branch" | "adaptation";

export interface RuntimeRun {
  id: string;
  projectSlug: string;
  chapterId?: string;
  branchId?: string;
  status: RuntimeRunStatus;
  currentStage?: RuntimePipelineStage;
  command: RuntimeCommandType;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  failureCount: number;
  rewriteCount: number;
  qualityScore?: number;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface RuntimeCommand {
  id: string;
  projectSlug: string;
  runId?: string;
  type: RuntimeCommandType;
  status: RuntimeCommandStatus;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  error?: string;
  createdAt: string;
  claimedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

export interface RuntimeEvent {
  id: number;
  eventId: string;
  runId?: string;
  projectSlug: string;
  type: RuntimeEventType;
  stage?: RuntimePipelineStage;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RuntimeCheckpointFile {
  relativePath: string;
  checkpointPath: string;
  existed: boolean;
  size: number;
  sha256?: string;
}

export interface RuntimeCheckpoint {
  id: string;
  projectSlug: string;
  runId?: string;
  chapterId?: string;
  label: string;
  manifest: RuntimeCheckpointFile[];
  createdAt: string;
}

export interface RuntimeContextBudgetBlock {
  title: string;
  tier?: "T0" | "T1" | "T2" | "T3";
  limit?: number;
  originalLength: number;
  finalLength: number;
  truncated: boolean;
  reason: string;
}

export interface RuntimeContextBudget {
  totalOriginalChars: number;
  totalFinalChars: number;
  blockCount: number;
  truncatedBlocks: RuntimeContextBudgetBlock[];
  blocks: RuntimeContextBudgetBlock[];
  policy: string;
}

export interface NarrativeSnapshot {
  projectSlug: string;
  chapterId: string;
  chapterTitle: string;
  contextBlocks: Array<{ title: string; length: number; preview: string }>;
  contextBudget?: RuntimeContextBudget;
  storyControl?: Pick<StoryControl, "version" | "premise" | "currentArcId" | "updatedAt"> & {
    arcCount: number;
    characterCount: number;
    eventCount: number;
  };
  summarySignals: Array<Pick<ChapterSummary, "chapterId" | "summary" | "keyEvents" | "updatedAt">>;
  ledgerSignals: Array<Pick<LedgerEntry, "id" | "kind" | "title" | "status" | "severity" | "chapterIds" | "updatedAt">>;
  knowledgeSignals: {
    factCount: number;
    tripleCount: number;
    indexedChapterCount: number;
    vectorSummary?: KnowledgeVectorSummary;
  };
  qualityRisks: string[];
  craftRisks?: string[];
  blockingReasons?: string[];
  createdAt: string;
}

export interface RuntimeSnapshotRecord {
  id: string;
  projectSlug: string;
  runId: string;
  chapterId: string;
  snapshot: NarrativeSnapshot;
  createdAt: string;
}

export type RuntimeKnowledgeRefKind = "context_block" | "fact" | "triple" | "chapter" | "summary" | "ledger" | "quality";

export interface RuntimeKnowledgeRef {
  id: string;
  projectSlug: string;
  runId: string;
  chapterId: string;
  kind: RuntimeKnowledgeRefKind;
  refId: string;
  label: string;
  score?: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RuntimeDerivativeBranch {
  id: string;
  projectSlug: string;
  baseRunId?: string;
  sourceChapterId?: string;
  type: RuntimeDerivativeType;
  title: string;
  status: "draft" | "active" | "merged" | "archived";
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeWorkerHealth {
  status: "online" | "stale" | "offline";
  lastHeartbeatAt?: string;
  lastCommandClaimedAt?: string;
  pollIntervalMs: number;
  staleAfterMs: number;
}

export interface RuntimeStatusSnapshot {
  activeRun?: RuntimeRun;
  runs: RuntimeRun[];
  events: RuntimeEvent[];
  checkpoints: RuntimeCheckpoint[];
  branches: RuntimeDerivativeBranch[];
  latestSnapshot?: RuntimeSnapshotRecord;
  knowledgeRefs: RuntimeKnowledgeRef[];
  worker: RuntimeWorkerHealth;
}

export type CreativeModuleKey = "novel" | "assets" | "script" | "image-generation" | "video-generation";
export type AiAgentProvider = "codex" | "claude-code";
export type AiUsageScenarioKey = "novel" | "assets" | "script" | "image-generation" | "video-generation";
export type KnowledgeEmbeddingProvider = "local" | "openai-compatible";
export type QualityMetricKey =
  | "rhythm"
  | "conflict"
  | "emotion"
  | "information"
  | "prose"
  | "hook"
  | "tension"
  | "character_arc"
  | "payoff"
  | "foreshadowing_health"
  | "progression"
  | "slice_of_life"
  | "redemption";
export type AiStageKey =
  | "pipeline.project.create"
  | "pipeline.outline.generate"
  | "pipeline.structure.reverse"
  | "pipeline.chapter.plan"
  | "pipeline.chapter.prose"
  | "pipeline.quality.review"
  | "pipeline.selection.polish"
  | "pipeline.quality.rewrite"
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

export type CraftBeatType =
  | "payoff"
  | "foreshadow_setup"
  | "foreshadow_payoff"
  | "reversal"
  | "setback"
  | "progression"
  | "redemption"
  | "sublimation"
  | "slice_of_life"
  | "relationship_turn"
  | "hook";

export interface CraftBeat {
  id: string;
  type: CraftBeatType;
  label: string;
  setup?: string;
  payoff?: string;
  cost?: string;
  characterName?: string;
  relatedEntities?: string[];
  required?: boolean;
  status?: "planned" | "drafted" | "paid_off" | "missed";
}

export interface CraftGenreProfile {
  patterns?: string[];
  title: string;
  formulas: string[];
  requiredBeats: CraftBeatType[];
  risks: string[];
}

export interface CraftProfile {
  version: 1;
  title: string;
  principles: string[];
  beatDefinitions: Array<{ type: CraftBeatType; label: string; purpose: string }>;
  genreProfiles: CraftGenreProfile[];
  qualityGates: string[];
  voiceRules?: string[];
  antiPatterns?: string[];
  sceneContracts?: {
    chapterOpening?: string[];
    combat?: string[];
    chapterEnding?: string[];
  };
  updatedAt?: string;
}

export interface StyleSample {
  id: string;
  tags: string[];
  excerpt: string;
  useCase: "opening" | "combat" | "mystery" | "ending" | "general";
}

export interface CraftCoverageSignal {
  chapterId: string;
  chapterTitle: string;
  craftBeatCount: number;
  requiredBeatCount: number;
  missingRequiredBeatCount: number;
  payoffCount: number;
  foreshadowingCount: number;
  progressionCount: number;
  sliceOfLifeCount: number;
  redemptionCount: number;
  note: string;
  severity: "stable" | "watch" | "blocked";
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
  craftCoverageSignals?: CraftCoverageSignal[];
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
  narrativeFunction?: string;
  characterFunction?: string;
  emotionalShift?: string;
  progressionChange?: string;
  readerPayoff?: string;
  craftBeats?: CraftBeat[];
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
  signatureTraits?: string[];
  coreWound?: string;
  desire?: string;
  misbelief?: string;
  redemptionArc?: string;
  sublimationGoal?: string;
  smallPersonHighlight?: string;
  relationshipPressure?: string;
  growthStage?: string;
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
  readerPayoff?: string;
  craftBeats?: CraftBeat[];
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
  craftBeatPatches?: CraftBeat[];
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
    pendingRecapPatchCount?: number;
    craftBeatCount?: number;
    craftGateRisks?: string[];
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

export type ChapterDocumentKind = "content" | "outline";

export interface FileVersionSnapshot {
  id: string;
  filePath: string;
  versionPath: string;
  createdAt: string;
  size: number;
  source?: "manual" | "runtime" | "ai";
  reason?: string;
  runId?: string;
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
  status: NovelTaskStatus;
  projectId: string;
  inputSummary: string;
  payload?: Record<string, unknown>;
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

export interface AiInvocationPromptSnapshot {
  length: number;
  preview: string;
  contextTitles: string[];
}

export type AiInvocationContextTier = "T0" | "T1" | "T2" | "T3";

export interface AiInvocationContextBlockSnapshot {
  title: string;
  length: number;
  tier?: AiInvocationContextTier;
  truncated?: boolean;
}

export interface AiInvocationContextSnapshot {
  blockCount: number;
  totalChars: number;
  blocks: AiInvocationContextBlockSnapshot[];
  tierCounts?: Partial<Record<AiInvocationContextTier, number>>;
  truncatedBlocks?: string[];
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
    latestTasks: Array<
      Pick<
        NovelTask,
        "id" | "type" | "status" | "inputSummary" | "outputSummary" | "error" | "startedAt" | "finishedAt" | "durationMs" | "timeoutMs" | "cancelRequestedAt"
      >
    >;
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

export type BackgroundJobType = "knowledge.index.rebuild" | "quality.series.rebuild" | "story.graph.rebuild" | "understanding.shadow";
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
