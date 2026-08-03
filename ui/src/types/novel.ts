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
  narrativeFunction?: string;
  characterFunction?: string;
  emotionalShift?: string;
  progressionChange?: string;
  readerPayoff?: string;
  craftBeats?: CraftBeat[];
  draftAnchor?: string;
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
  task?: string;
  chapterId?: string;
  limit?: number;
  targetEvent?: string;
  eventOrder?: Record<string, number>;
  audience?: "author" | "reader" | "character" | "model-task";
  visibility?: "author-only" | "reader-visible" | "character-visible" | "public";
  authorized?: boolean;
  readerScope?: string;
  publicationVersion?: string;
  readerProgressCursor?: string;
  characterId?: string;
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

export interface KnowledgeRetrievalAudit {
  schemaVersion: "knowledge-retrieval-audit.v1";
  boundary: {
    query: string;
    task?: KnowledgeSearchQuery["task"];
    chapterId?: string;
    targetEvent?: string;
    audience?: KnowledgeSearchQuery["audience"];
    visibility?: KnowledgeSearchQuery["visibility"];
    authorized?: boolean;
    readerScope?: string;
    publicationVersion?: string;
    readerProgressCursor?: string;
    characterId?: string;
  };
  eligibleFactIds: string[];
  excluded: Array<{ id: string; reason: string }>;
  selectedIds: string[];
  evidenceSourceIds: string[];
  evidenceSourceCount: number;
  evidenceProfile?: {
    sources: Array<{ id: string; family: string; independent: boolean; quality: "canon" | "derived" | "plan" | "unknown"; derivedFromIds: string[] }>;
    independentSourceCount: number;
    familyCount: number;
    duplicateDerivedGroupCount: number;
    gaps: string[];
    saysNoContradiction: boolean;
  };
  vectorSummary?: KnowledgeVectorSummary;
  resultFingerprint: string;
}

export interface KnowledgeSearchResult {
  query: string;
  tokens: string[];
  vectorSummary?: KnowledgeVectorSummary;
  queryEmbeddingFallback?: { from: "openai-compatible"; to: "local"; reason: string };
  retrievalAudit?: KnowledgeRetrievalAudit;
  facts: Array<KnowledgeFact & { score: number; vectorScore?: number }>;
  triples: Array<KnowledgeTriple & { score: number; vectorScore?: number }>;
  chapters: Array<ChapterIndexEntry & { score: number; vectorScore?: number }>;
  excluded?: Array<{ id: string; reason: string }>;
}

export interface MemoryRetrievalPreview {
  schemaVersion: "memory-retrieval-preview.v1";
  retrievalId: string;
  projectSlug: string;
  query: string;
  boundary: KnowledgeRetrievalAudit["boundary"];
  eligibleFactIds: string[];
  excluded: Array<{ id: string; reason: string }>;
  selectedIds: string[];
  truncatedIds: string[];
  evidenceSourceIds: string[];
  evidenceSourceCount: number;
  evidenceProfile?: KnowledgeRetrievalAudit["evidenceProfile"];
  budget: { maxResults: number };
  vectorSummary?: KnowledgeVectorSummary;
  sourceResultFingerprint: string;
  resultFingerprint: string;
}

export interface MemoryHealthReport {
  schemaVersion: "memory-health-report.v1";
  reportId: string;
  projectSlug: string;
  status: "healthy" | "degraded" | "blocked";
  coverage: { totalChapters: number; settledChapters: number; eligibleClaims: number; candidateClaims: number; contestedClaims?: number; obsoleteClaims?: number; entityCount: number; timeBoundClaims: number; characterKnowledgeEntries: number; readerKnowledgeEntries: number };
  staleProjectionCount: number;
  invalidSettlementIds: string[];
  risks: string[];
  sourceRefs: string[];
  generatedAt: string;
  fingerprint: string;
}

export interface MemoryReadyProof {
  schemaVersion: "memory-ready-proof.v1";
  proofId: string;
  projectSlug: string;
  targetChapterId: string;
  healthReportId: string;
  retrievalId: string;
  continuityAuditId?: string;
  continuityAuditFingerprint?: string;
  status: "ready" | "blocked";
  blockers: string[];
  sourceRefs: string[];
  generatedAt: string;
  fingerprint: string;
}

export interface LongContinuityAudit {
  schemaVersion: "long-continuity-audit.v1";
  auditId: string;
  projectSlug: string;
  status: "audited-consistent" | "conditionally-consistent" | "blocked";
  coverage: { totalChapters: number; settledChapters: number; eligibleClaims: number; candidateClaims: number; settledRatio: number };
  contradictionSetIds: string[];
  staleProjectionCount: number;
  issues: string[];
  sourceRefs: string[];
  healthReportId: string;
  generatedAt: string;
  fingerprint: string;
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

export type QualityImprovementStatus = "idle" | "preparing" | "running" | "candidate" | "applying" | "reviewing" | "applied" | "error";

export interface QualityImprovementMetric {
  key: QualityMetricKey;
  label: string;
  beforeScore: number;
  targetScore: number;
  note: string;
}

export interface QualityImprovementState {
  status: QualityImprovementStatus;
  chapterId?: string;
  filePath?: string;
  targetMetrics: QualityImprovementMetric[];
  beforeOverallScore?: number;
  afterOverallScore?: number;
  summary?: string;
  changes: string[];
  patchCount: number;
  taskId?: string;
  diffVersionId?: string;
  error?: string;
  updatedAt?: string;
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
    pendingRecapPatchCount?: number;
    craftBeatCount?: number;
    craftGateRisks?: string[];
    narrativeDebt?: Pick<NarrativeDebtSignal, "debtCount" | "openForeshadowingCount" | "riskCount" | "openLoopCount" | "overdueCount" | "severity">;
  };
  updatedAt: string;
}

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

export interface CreativeSessionMessage {
  id: string;
  clientMessageId: string;
  role: "author";
  text: string;
  source: { kind: "author" };
  createdAt: string;
}

export interface CreativeSession {
  schemaVersion: "creative-session.v1";
  sessionId: string;
  projectSlug: string;
  status: "capturing";
  messages: CreativeSessionMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface CreativeJourneyProjection {
  schemaVersion: "creative-journey-projection.v1";
  projectSlug: string;
  stage: "capture" | "understanding";
  primaryAsset: "creative-session" | "understanding-preview";
  blockingRef?: string;
  primaryAction: {
    id: "capture-idea" | "review-understanding";
    label: string;
    kind: "capture" | "review";
    status: "available";
  };
  activeQuestion?: {
    id: "question-primary-desire";
    text: string;
    status: "candidate";
    impact: "high";
    source: "deterministic-gap" | "model-gap";
  };
  sourceMessageIds: string[];
  sessionFingerprint: string;
}

export interface UnderstandingSourceSpan {
  messageId: string;
  start: number;
  end: number;
}

export interface UnderstandingClaim {
  id: string;
  text: string;
  status: "explicit" | "inferred" | "provisional" | "unknown" | "conflicted";
  evidence: UnderstandingSourceSpan[];
}

export interface UnderstandingPreview {
  schemaVersion: "understanding-preview.v1";
  projectSlug: string;
  inputFingerprint: string;
  sourceMessageIds: string[];
  coreExplicit: UnderstandingClaim[];
  inferred: UnderstandingClaim[];
  unknowns: UnderstandingClaim[];
  nextAction: "await-safe-understanding-dependencies";
  modelCallIssued: false;
  canonWritten: false;
}

export interface UnderstandingInterpretation {
  id: string;
  label: string;
  summary: string;
  status: "candidate" | "active" | "rejected" | "merged" | "superseded";
  differences: string[];
  supportEvidence: UnderstandingClaim[];
  counterEvidence: UnderstandingClaim[];
  downstreamImpacts: string[];
}

export interface UnderstandingInterpretationSet {
  schemaVersion: "seed-interpretation-set.v1";
  commonClaims: UnderstandingClaim[];
  interpretations: UnderstandingInterpretation[];
  activeQuestionId: "question-primary-desire";
}

export interface UnderstandingSnapshot {
  schemaVersion: "understanding-snapshot.v1";
  snapshotId: string;
  projectSlug: string;
  mode: "shadow" | "model";
  sourceFingerprint: string;
  sourceMessageIds: string[];
  coreExplicit: UnderstandingClaim[];
  inferred: UnderstandingClaim[];
  unknowns: UnderstandingClaim[];
  question: { id: "question-primary-desire"; text: string; status: "candidate"; impact: "high"; source: string };
  interpretationSet?: UnderstandingInterpretationSet;
  modelCallIssued: boolean;
  canonWritten: false;
  createdAt: string;
}

export interface UnderstandingTask {
  schemaVersion: "understanding-task.v1";
  taskId: string;
  projectSlug: string;
  status: "queued" | "running" | "completed" | "cancelled" | "failed" | "stale";
  sourceFingerprint: string;
  sourceMessageIds: string[];
  modelCallIssued: boolean;
  canonWritten: false;
  snapshotId?: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface DialogueQuestion {
  schemaVersion: "dialogue-question.v1";
  questionId: string;
  questionVersion: number;
  projectSlug: string;
  status: "candidate" | "active" | "answered" | "delegated" | "deferred" | "withdrawn" | "superseded";
  text: string;
  whyNow: string;
  impact: "low" | "medium" | "high";
  ambiguity: number;
  errorCost: string;
  reversibility: string;
  delayCost: string;
  options: string[];
  recommendation: string;
  snapshotFingerprint: string;
  answerStatus?: "confirmed" | "tentative" | "delegated";
  answerText?: string;
  answeredAt?: string;
  redBlueCase?: {
    caseId: string;
    status: "open" | "superseded";
    options: Array<{ optionId: string; label: string; claim: string; bestCase: string; failureModes: string[]; opportunityCost: string; reversibility: string; uncertainty: string }>;
    sharedFacts: string[];
    irreducibleTradeoff: string;
    recommendation: string;
    recommendationReason: string;
    dissent: string[];
    whatWouldChangeRecommendation: string[];
    fingerprint: string;
  };
}

export interface DecisionRecord {
  schemaVersion: "decision-record.v1";
  decisionId: string;
  questionId: string;
  questionVersion: number;
  answerText: string;
  answerStatus: "confirmed" | "tentative" | "delegated";
  projectSlug: string;
  status: "recorded" | "provisional" | "delegated";
  sourceFingerprint: string;
  evidenceRefs: Array<{ kind: "dialogue-question"; refId: string }>;
  canonWritten: false;
  supersedesDecisionId?: string;
  correction?: { relation: "supersedes" | "retracts" | "refines"; previousText?: string; replacementText?: string };
  createdAt: string;
}

export interface StoryContractCandidate {
  schemaVersion: "story-contract-candidate.v1";
  candidateId: string;
  projectSlug: string;
  status: "candidate" | "stale";
  sourceDecisionId: string;
  sourceFingerprint: string;
  variant?: {
    interpretationId: string;
    label: string;
    summary: string;
    differences: string[];
  };
  recompile?: {
    mode: "initial" | "incremental";
    affectedPaths: Array<"protagonist.primaryDesire" | "protagonist.innerNeed" | "protagonist.misbelief" | "world.rules.primary" | "conflict.core" | "conflict.opposingPressure" | "stakes.failureCost" | "stakes.irreversibleChoice" | "readerPromise" | "endingDirection">;
    preservedPaths: Array<"protagonist.primaryDesire" | "protagonist.innerNeed" | "protagonist.misbelief" | "world.rules.primary" | "conflict.core" | "conflict.opposingPressure" | "stakes.failureCost" | "stakes.irreversibleChoice" | "readerPromise" | "endingDirection">;
    preservedFingerprints: Partial<Record<"protagonist.primaryDesire" | "protagonist.innerNeed" | "protagonist.misbelief" | "world.rules.primary" | "conflict.core" | "conflict.opposingPressure" | "stakes.failureCost" | "stakes.irreversibleChoice" | "readerPromise" | "endingDirection", string>>;
  };
  fields: Array<{
    fieldId: string;
    path: "protagonist.primaryDesire" | "protagonist.innerNeed" | "protagonist.misbelief" | "world.rules.primary" | "conflict.core" | "conflict.opposingPressure" | "stakes.failureCost" | "stakes.irreversibleChoice" | "readerPromise" | "endingDirection";
    value: string;
    epistemicStatus: "explicit" | "provisional";
    evidenceRefs: Array<{ kind: "dialogue-question"; refId: string }>;
    sourceDecisionId: string;
    lock: "unlocked";
  }>;
  contract: {
    protagonist: { primaryDesire: string | null; innerNeed: string | null; misbelief: string | null };
    conflict: { core: string | null; opposingPressure: string | null };
    stakes: { failureCost: string | null; irreversibleChoice: string | null };
    world: { primaryRule: string | null };
    readerPromise: string | null;
    endingDirection: string | null;
  };
  assumptions: string[];
  impactSummary: string[];
  unknowns: string[];
  supersedesCandidateId?: string;
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
}

export interface WorldRuleContract {
  schemaVersion: "world-rule-contract.v1";
  ruleId: string;
  version: number;
  projectSlug: string;
  sourceCandidateId: string;
  sourceFingerprint: string;
  status: "candidate" | "accepted" | "stale";
  proposition: {
    condition: string;
    mechanism: string;
    result: string;
    cost: string;
    limit: string;
    failure: string;
    prohibitedInferences?: string[];
    exceptions?: string[];
  };
  scope: { subjects: string[]; regions: string[]; time?: { from?: string; to?: string } };
  disclosure: {
    objectiveStatus: "accepted" | "proposed" | "unknown";
    domains: Array<{ domainId: string; kind: "objective_canon" | "character_belief" | "institution_belief" | "author_proposal" | "unknown"; claim: string }>;
  };
  evidenceRefs: Array<{ kind: "dialogue-question" | "canon-asset" | "decision-record"; refId: string }>;
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
}

export interface OutlineCandidate {
  schemaVersion: "outline-candidate.v1";
  outlineId: string;
  projectSlug: string;
  status: "candidate" | "stale";
  sourceCandidateId: string;
  sourceCandidateFingerprint: string;
  horizon: { strongFreezeCount: number; totalChapterCount: number };
  chapters: Array<{
    chapterId: string;
    order: number;
    title: string;
    function: "inciting-pressure" | "complication" | "reversal" | "choice" | "aftermath";
    goal: string;
    conflict: string;
    turningPoint: string;
    causalInputs: string[];
    causalOutputs: string[];
    freeze: "strong" | "tentative";
    status: "candidate";
  }>;
  assumptions: string[];
  unknowns: string[];
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
}

export interface OutlineValidationReport {
  schemaVersion: "outline-validation-report.v1";
  reportId: string;
  projectSlug: string;
  outlineId: string;
  outlineFingerprint: string;
  status: "passed" | "blocked";
  checks: Array<{ checkId: string; status: "passed" | "failed"; detail: string }>;
  executionReady: false;
  createdAt: string;
  fingerprint: string;
}

export interface OutlineAdoptionProposal {
  schemaVersion: "outline-adoption-proposal.v1";
  proposalId: string;
  projectSlug: string;
  outlineId: string;
  outlineFingerprint: string;
  validationReportId: string;
  validationFingerprint: string;
  selectedChapterIds: string[];
  status: "ready_for_authorization" | "blocked" | "authorized" | "committed";
  authorAuthorization?: { actorId: string; authorizationId: string };
  canonWritten: false | true;
  createdAt: string;
  fingerprint: string;
}

export interface OutlineVersion {
  schemaVersion: "outline-version.v1";
  versionId: string;
  projectSlug: string;
  version: number;
  outlineId: string;
  outlineFingerprint: string;
  selectedChapterIds: string[];
  strongFreezeCount: number;
  status: "active";
  canonWritten: true;
  createdAt: string;
  fingerprint: string;
}

export interface ExecutionReadyProof {
  schemaVersion: "execution-ready-proof.v1";
  proofId: string;
  projectSlug: string;
  versionId: string;
  versionFingerprint: string;
  status: "ready" | "blocked";
  executionReady: boolean;
  checks: Array<{ checkId: string; status: "passed" | "failed"; detail: string }>;
  createdAt: string;
  fingerprint: string;
}

export interface ExecutionReadinessDecision {
  allowed: boolean;
  reason?: "PROOF_NOT_FOUND" | "PROOF_BLOCKED" | "VERSION_POINTER_STALE" | "CHAPTER_OUTSIDE_WINDOW";
  proof?: ExecutionReadyProof;
  version?: OutlineVersion;
  checks: Array<{ checkId: string; status: "passed" | "failed"; detail: string }>;
}

export interface ExecutionWorkItem {
  schemaVersion: "execution-work-item.v1";
  workItemId: string;
  projectSlug: string;
  chapterId: string;
  versionId: string;
  proofFingerprint: string;
  contextManifestId: string;
  contextFingerprint: string;
  status: "queued" | "blocked" | "claimed" | "running" | "completed" | "failed";
  idempotencyKey: string;
  blockedReason?: string;
  createdAt: string;
  fingerprint: string;
}

export interface ProseGenerationManifest {
  schemaVersion: "prose-generation-manifest.v1";
  chapterId: string;
  outlineVersionId: string;
  executionProofFingerprint: string;
  contextManifestId: string;
  contextFingerprint: string;
  createdAt: string;
}

export interface ProseCandidate {
  schemaVersion: "prose-candidate.v1";
  candidateId: string;
  projectSlug: string;
  chapterId: string;
  policyVersion?: "tiered-quality.v1";
  riskTier?: "ordinary" | "elevated" | "key";
  status: "generated" | "validated" | "adopted" | "rejected";
  content: string;
  generation: ProseGenerationManifest;
  sourceFingerprint: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface ProseCandidateValidation {
  candidateId: string;
  status: "passed" | "blocked";
  reasons: string[];
  candidateFingerprint: string;
  checkedAt: string;
}

export interface ProseValidationBundle {
  schemaVersion: "prose-validation-bundle.v1";
  bundleId: string;
  candidateId: string;
  candidateFingerprint: string;
  status: "passed" | "blocked";
  checks: Array<{ checkId: string; status: "passed" | "failed"; detail: string }>;
  hardFailures: string[];
  reviewer: { kind: "independent-deterministic"; id: "prose-validation-v1" };
  createdAt: string;
  fingerprint: string;
}

export interface RedBlueReview {
  schemaVersion: "red-blue-review.v1";
  reviewId: string;
  candidateId: string;
  candidateFingerprint: string;
  validationBundleFingerprint: string;
  status: "passed" | "blocked";
  redFindings: Array<{ findingId: string; severity: "hard" | "warning"; detail: string }>;
  blueStrengths: Array<{ strengthId: string; detail: string }>;
  commonGround: Array<{ claimId: string; detail: string; evidenceRefs: string[] }>;
  blueArgument: { claims: Array<{ claimId: string; detail: string; evidenceRefs: string[] }>; protectedStrengths: string[] };
  redArgument: { claims: Array<{ claimId: string; detail: string; evidenceRefs: string[] }>; counterevidenceRefs: string[]; falsifiers: string[] };
  verdict: "supports-adoption" | "blocks-adoption" | "evidence-insufficient";
  recommendation: "adopt" | "repair" | "request-evidence";
  reviewer: { kind: "independent-deterministic"; id: "red-blue-review-v1" };
  createdAt: string;
  fingerprint: string;
}

export interface AuthorFeedbackEvent {
  schemaVersion: "author-feedback-event.v1";
  eventId: string;
  projectSlug: string;
  candidateId: string;
  adoptionTransactionId: string;
  decision: "accepted" | "needs_revision" | "rejected";
  note: string;
  createdAt: string;
  fingerprint: string;
}

export type FeedbackCategory = "content" | "structure" | "language" | "fact" | "presentation";
export interface FeedbackAttribution {
  schemaVersion: "feedback-attribution.v1";
  attributionId: string;
  eventId: string;
  adoptionTransactionId: string;
  projectSlug: string;
  candidateId: string;
  category: FeedbackCategory;
  pattern: string;
  scope: { chapterId?: string; sceneId?: string };
  evidenceRefs: string[];
  confounders: string[];
  confidence: { lower: number; upper: number };
  allowPreferenceLearning: false;
  lifecycle: "candidate";
  createdAt: string;
  fingerprint: string;
}
export interface PreferenceHypothesis {
  schemaVersion: "preference-hypothesis.v1";
  hypothesisId: string;
  projectSlug: string;
  pattern: string;
  category: FeedbackCategory;
  scope: { chapterId?: string; sceneId?: string };
  lifecycle: "candidate" | "validated" | "active" | "weakened" | "retired";
  supportEventIds: string[];
  oppositionEventIds: string[];
  confidence: { lower: number; upper: number };
  minIndependentEvidence: 2;
  revokeReason?: string;
  revokedBy?: string;
  revokedAt?: string;
  oppositionReasons?: string[];
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface LearningPolicy {
  schemaVersion: "learning-policy.v1";
  policyId: string;
  projectSlug: string;
  minIndependentEvidence: 2;
  confidenceThreshold: number;
  decayRate: number;
  conflictStrategy: "weaken-and-split";
  explorationRatio: number;
  privacyBoundary: "project-only";
  rollbackVersion: string;
  createdAt: string;
  fingerprint: string;
}
export interface ExplorationBudget {
  schemaVersion: "exploration-budget.v1";
  budgetId: string;
  projectSlug: string;
  scope: string;
  maxProbes: number;
  maxCost: number;
  maxImpact: string;
  stopConditions: string[];
  usedProbes: number;
  usedCost: number;
  consumedOperationIds: string[];
  status: "active" | "exhausted" | "paused";
  pauseReason?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export type SourceRightsStatus = "owned" | "licensed" | "public_domain" | "analysis_only" | "unknown";
export type SourceAllowedUse = "analysis" | "style-experiment" | "generation" | "publication";
export interface SourceMaterialRecord {
  schemaVersion: "source-material-record.v1";
  sourceId: string;
  projectSlug: string;
  title: string;
  type: string;
  provenance: string;
  rightsStatus: SourceRightsStatus;
  licensor: string;
  licenseExpiresAt?: string;
  allowedUses: SourceAllowedUse[];
  projectScope: string;
  retainExcerpt: boolean;
  importedBy: string;
  createdAt: string;
  fingerprint: string;
}
export interface RightsEnvelope {
  schemaVersion: "rights-envelope.v1";
  envelopeId: string;
  sourceId: string;
  projectSlug: string;
  rightsStatus: SourceRightsStatus;
  allowedUses: SourceAllowedUse[];
  analysisOnly: boolean;
  status: "valid" | "restricted" | "expired" | "unknown";
  checkedBy: string;
  checkedAt: string;
  sourceFingerprint: string;
  fingerprint: string;
}

export interface CraftPattern {
  schemaVersion: "craft-pattern.v1";
  patternId: string;
  projectSlug: string;
  name: string;
  mechanism: string;
  narrativeFunction: string;
  applicability: string[];
  counterexamples: string[];
  sourceEnvelopeIds: string[];
  evidenceRefs: string[];
  lifecycle: "candidate" | "approved" | "probation" | "validated" | "rejected" | "retired";
  approval?: { actor: string; reason: string; approvedAt: string };
  promotion?: { experimentId: string; actor: string; reason: string; promotedAt: string };
  validation?: { experimentId: string; actor: string; reason: string; validatedAt: string };
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
export type CharacterSourceProvenance = "author-confirmed" | "canon-fact" | "character-self-report" | "other-view" | "plan" | "inference" | "unknown";
export interface CharacterContractSource { field: string; provenance: CharacterSourceProvenance; sourceVersion: string; evidenceRefs: string[]; }
export interface CharacterDramaticContract {
  schemaVersion: "character-dramatic-contract.v1";
  contractId: string;
  projectSlug: string;
  characterId: string;
  displayName: string;
  externalWant: string;
  internalNeed: string;
  falseBelief: string;
  woundOrFear: string;
  valuesAndBoundaries: string[];
  contradiction: string;
  stake: string;
  unacceptableChoice: string;
  potentialChange: string;
  unknown: string[];
  sources: CharacterContractSource[];
  lifecycle: "candidate" | "confirmed";
  confirmation?: { actor: string; reason: string; confirmedAt: string };
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
export interface CharacterRelationshipState { targetCharacterId: string; trust: number; power: number; dependency: number; fear: number; publicStance: string; privateStance: string; boundary: string; unpaidDebt: string; }
export interface CharacterStateSnapshot {
  schemaVersion: "character-state-snapshot.v1";
  snapshotId: string;
  projectSlug: string;
  characterId: string;
  contractId: string;
  asOf: string;
  currentGoal: string;
  priority: string;
  belief: string;
  knowledge: string[];
  emotion: string;
  injury: string;
  resources: string[];
  abilitiesAndIdentity: string[];
  relationshipStances: CharacterRelationshipState[];
  obligations: string[];
  availableChoices: string[];
  sourceRefs: string[];
  createdAt: string;
  fingerprint: string;
}
export interface CharacterChoiceEvidence {
  schemaVersion: "character-choice-evidence.v1";
  evidenceId: string;
  projectSlug: string;
  characterId: string;
  contractId: string;
  beforeSnapshotId: string;
  choice: string;
  rejectedChoices: string[];
  immediateCost: string;
  delayedCost: string;
  evidenceRefs: string[];
  status: "planned" | "observed";
  afterSnapshotId?: string;
  outcomeRefs?: string[];
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
export interface RelationshipEvent {
  schemaVersion: "relationship-event.v1";
  eventId: string;
  projectSlug: string;
  relationshipId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  contractId: string;
  beforeSnapshotId: string;
  sharedEventRef: string;
  sourceCharacterChoice: string;
  targetCharacterChoice: string;
  sourceInterpretation: string;
  targetInterpretation: string;
  visibleActions: string[];
  valueExchange: string;
  immediateCost: string;
  delayedCost: string;
  evidenceRefs: string[];
  status: "planned" | "observed";
  afterSnapshotId?: string;
  outcomeRefs?: string[];
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
export interface CharacterArcMilestone { milestoneId: string; choiceEvidenceId: string; milestone: string; actualChange: string; sourceRefs: string[]; recordedAt: string; }
export interface CharacterArcContract {
  schemaVersion: "character-arc-contract.v1";
  arcId: string;
  projectSlug: string;
  characterId: string;
  dramaticContractId: string;
  startState: string;
  targetChange: string;
  keyPressures: string[];
  plannedChoices: string[];
  plannedCosts: string[];
  relationshipImpacts: string[];
  allowedRegression: string;
  sourceRefs: string[];
  lifecycle: "planned" | "active" | "closed";
  milestones: CharacterArcMilestone[];
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
export interface WorldStateSnapshot {
  schemaVersion: "world-state-snapshot.v1";
  snapshotId: string;
  projectSlug: string;
  asOf: string;
  region: string;
  publicationVersion: string;
  politicalControl: string[];
  activeConflicts: string[];
  institutions: string[];
  infrastructure: string[];
  markets: string[];
  environment: string[];
  resources: string[];
  effectiveRuleIds: string[];
  unknowns: string[];
  sourceRefs: string[];
  createdAt: string;
  fingerprint: string;
}
export interface CapabilityContract {
  schemaVersion: "capability-contract.v1";
  capabilityId: string;
  projectSlug: string;
  holderId: string;
  name: string;
  sourceRefs: string[];
  canDo: string;
  cannotDo: string[];
  prerequisites: string[];
  inputs: string[];
  consumption: string[];
  scope: string[];
  duration: string;
  cooldown: string;
  precision: string;
  counters: string[];
  progressionPath: string[];
  disclosure: string;
  evidenceRefs: string[];
  permanent: false;
  status: "candidate" | "confirmed" | "retired";
  progressionEventIds: string[];
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}
export interface ProgressionEvent { schemaVersion: "progression-event.v1"; progressionId: string; capabilityId: string; trigger: string; acquisition: string; retained: string; abandoned: string; limitation: string; newChoice: string; proseRefs: string[]; sourceRefs: string[]; createdAt: string; fingerprint: string; }
export interface WorldTravelRoute { toLocationId: string; distance: string; travelMode: string; normalDuration: string; blockedDuration: string; accessConditions: string[]; risks: string[]; }
export interface WorldLocation { schemaVersion: "world-location.v1"; locationId: string; projectSlug: string; name: string; hierarchy: string; region: string; travelRoutes: WorldTravelRoute[]; accessConditions: string[]; currentReachability: "reachable" | "blocked" | "unknown"; sourceRefs: string[]; createdAt: string; updatedAt: string; fingerprint: string; }
export interface StoryTimeEvent { schemaVersion: "story-time-event.v1"; eventId: string; projectSlug: string; label: string; timelineId: string; start: string; end: string; duration: string; uncertainty: "exact" | "approximate" | "unknown"; parallelLine: string; sourceRefs: string[]; createdAt: string; fingerprint: string; }
export type CausalityRelation = "requires" | "enables" | "complicates" | "reveals" | "pays_off" | "conflicts_with";
export interface CausalityEdge { schemaVersion: "narrative-causality-edge.v1"; edgeId: string; projectSlug: string; sourceNodeId: string; targetNodeId: string; relation: CausalityRelation; trigger: string; consequence: string; delayedConsequence: string; evidenceRefs: string[]; status: "candidate" | "validated" | "blocked"; createdAt: string; fingerprint: string; }
export interface CausalityGraphReport { projectSlug: string; edgeCount: number; status: "passed" | "blocked"; issues: Array<{ kind: "cycle" | "isolated" | "missing-evidence"; edgeIds: string[]; detail: string }>; fingerprint: string; }
export interface VolumeContract { schemaVersion: "volume-contract.v1"; volumeId: string; projectSlug: string; title: string; openingState: string; stageGoals: string[]; primaryConflict: string; rolePositions: string[]; irreversibleDuties: string[]; climaxChoice: string; stagePayoffs: string[]; endPressure: string; capacityBudget: { chapters: number; words: number }; sourceRefs: string[]; status: "candidate" | "confirmed" | "retired"; createdAt: string; updatedAt: string; fingerprint: string; }
export interface ChapterFunctionContract { schemaVersion: "chapter-function-contract.v1"; chapterId: string; projectSlug: string; primaryFunction: string; secondaryFunctions: string[]; sceneState: string; localGoal: string; obstacle: string; choice: string; observableChange: string; readerPayoff: string; mustRemember: string[]; mustNotReveal: string[]; sourceRefs: string[]; status: "candidate" | "validated" | "blocked"; createdAt: string; updatedAt: string; fingerprint: string; }
export interface SceneCardContract { schemaVersion: "scene-card-contract.v1"; sceneId: string; projectSlug: string; chapterId: string; trigger: string; povCharacterId: string; roleGoal: string; conflictStrategy: string; turningPoint: string; informationChange: string; emotionChange: string; relationshipChange: string; resourceChange: string; entryState: string; exitState: string; nextSceneHook: string; sourceRefs: string[]; status: "candidate" | "validated" | "blocked"; createdAt: string; updatedAt: string; fingerprint: string; }
export type NarrativeTraceRelation = "contains" | "realized_by" | "supports" | "pays_off" | "derived_from" | "constrains" | "revises";
export interface NarrativeTraceLink { schemaVersion: "narrative-trace-link.v1"; linkId: string; projectSlug: string; sourceLayer: string; sourceId: string; targetLayer: string; targetId: string; relation: NarrativeTraceRelation; evidenceRefs: string[]; createdAt: string; fingerprint: string; }
export interface NarrativeTraceReport { projectSlug: string; linkCount: number; layers: string[]; status: "passed" | "blocked"; issues: Array<{ kind: "orphan" | "missing-evidence"; linkId: string; detail: string }>; fingerprint: string; }
export interface ObligationLoadReport { schemaVersion: "obligation-load-report.v1"; projectSlug: string; windowChapterIds: string[]; openObligationCount: number; weightedLoad: number; byImportance: { low: number; medium: number; high: number }; byType: Record<string, number>; recommendations: string[]; status: "stable" | "watch" | "blocked"; canClaimNoOpenObligations: false; fingerprint: string; generatedAt: string; }
export interface NarrativeCurvePoint { schemaVersion: "narrative-curve-point.v1"; pointId: string; projectSlug: string; chapterId: string; sceneId: string; dimensions: { pressure: number; information: number; emotion: number; relationship: number; progression: number; payoff: number }; whiteSpace: string[]; evidenceRefs: string[]; createdAt: string; fingerprint: string; }
export interface PlanningNode { schemaVersion: "narrative-planning-node.v1"; nodeId: string; projectSlug: string; layer: string; title: string; status: "committed" | "rolling" | "tentative" | "exploratory"; commitments: string[]; sourceRefs: string[]; autoEvolutionAllowed: boolean; decision?: { actor: string; reason: string; decidedAt: string }; createdAt: string; updatedAt: string; fingerprint: string; }
export interface StructureAlternative { alternativeId: string; label: string; sequence: string[]; pacing: string; agency: string; suspenseFairness: string; payoffDifficulty: string; lengthImpact: string; changeScope: string; }
export interface StructureAlternativeSet { schemaVersion: "structure-alternative-set.v1"; setId: string; projectSlug: string; contractFingerprint: string; alternatives: StructureAlternative[]; sourceRefs: string[]; createdAt: string; fingerprint: string; }
export interface SimilarityGuardResult {
  schemaVersion: "similarity-guard-result.v1";
  guardId: string;
  sourceVersion: string;
  targetVersion: string;
  overlapRatio: number;
  maxTokenOverlap: number;
  status: "passed" | "blocked";
  risk: "low" | "high";
  evidenceRefs: string[];
  createdAt: string;
  fingerprint: string;
}
export interface PatternTransferPlan {
  schemaVersion: "pattern-transfer-plan.v1";
  planId: string;
  projectSlug: string;
  patternId: string;
  sourceEnvelopeId: string;
  targetChapterId: string;
  intendedEffect: string;
  prohibitedActions: string[];
  guard: SimilarityGuardResult;
  status: "candidate" | "blocked" | "approved";
  canonWriteAllowed: false;
  createdAt: string;
  fingerprint: string;
}
export interface ExperimentJudgment {
  evaluatorId: string;
  evaluatorKind: "independent-reviewer" | "author";
  winner: "baseline" | "treatment" | "tie" | "uncertain";
  hardGuardsPassed: boolean;
  authorReason: string;
  judgedAt: string;
  fingerprint: string;
}
export interface CraftExperiment {
  schemaVersion: "craft-experiment.v1";
  experimentId: string;
  projectSlug: string;
  transferPlanId: string;
  baselineCandidateId: string;
  treatmentCandidateId: string;
  holdoutSceneIds: string[];
  targetMetrics: string[];
  budgetId: string;
  status: "planned" | "running" | "judged" | "inconclusive" | "failed" | "invalidated";
  runnerId?: string;
  holdoutValidation?: { status: "cross-scene-validated" | "local-candidate" | "blocked"; holdoutCaseIds: string[]; sceneFunctions: string[] };
  providerEvaluation?: { providerRef: string; decision: "pass" | "blocked"; quality: { status: "calibrated" | "blocked" | "missing" }; totalCost: { measurement: "actual" | "estimated" | "mixed" } };
  readerCalibration?: { reviewerId: string; status: "calibrated" | "experimental"; humanSamples: number; blind: boolean; agreementRate: number };
  judgment?: ExperimentJudgment;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface DerivedPublicationTransaction {
  schemaVersion: "derived-publication-transaction.v1";
  transactionId: string;
  projectSlug: string;
  chapterId: string;
  settlementId: string;
  writes: Array<{ relativePath: string; contentSha256: string }>;
  status: "prepared" | "committed" | "rolled_back";
  createdAt: string;
  committedAt?: string;
  error?: string;
  fingerprint: string;
}

export interface ProseAdoptionTransaction {
  schemaVersion: "prose-adoption-transaction.v1";
  transactionId: string;
  candidateId: string;
  targetPath: string;
  expectedCanonSha256: string;
  adoptedSha256: string;
  authorizationId: string;
  reviewFingerprint: string;
  reviewVerdict: RedBlueReview["verdict"];
  status: "prepared" | "committed" | "rolled_back" | "blocked";
  createdAt: string;
  committedAt?: string;
  error?: string;
  fingerprint: string;
}

export interface ProseAdoptionReadiness {
  candidateId: string;
  chapterId: string;
  targetPath: string;
  expectedCanonSha256: string;
  authorizationRequired: true;
  validationStatus: "passed" | "blocked";
  canonWritten: false;
}

export interface ProseRepairPlan {
  schemaVersion: "prose-repair-plan.v1";
  planId: string;
  projectSlug: string;
  candidateId: string;
  reviewFingerprint: string;
  status: "ready" | "blocked";
  targetFindings: Array<{ findingId: string; severity: "hard" | "warning"; evidenceRefs: string[]; expectedImprovement: string }>;
  scope: { kind: "local-span"; chapterId: string; affectedParagraphIndexes: number[]; maxChangedParagraphs: number };
  protectedStrengths: string[];
  protectedItems: string[];
  prohibitedActions: string[];
  expectedEvidence: string[];
  regressionChecks: string[];
  rollbackPoint: { candidateFingerprint: string; canonUntouched: true };
  authorDecisionRequired: true;
  createdAt: string;
  fingerprint: string;
}

export interface ProseRepairCandidate {
  schemaVersion: "prose-repair-candidate.v1";
  repairCandidateId: string;
  planId: string;
  parentCandidateId: string;
  parentCandidateFingerprint: string;
  candidateId: string;
  changedParagraphIndexes: number[];
  status: "generated" | "validated" | "rejected";
  createdAt: string;
  fingerprint: string;
}

export interface ProseRepairRegression {
  schemaVersion: "prose-repair-regression.v1";
  regressionId: string;
  planId: string;
  parentCandidateFingerprint: string;
  repairedCandidateFingerprint: string;
  parentReviewFingerprint: string;
  repairedReviewFingerprint: string;
  repairedValidationFingerprint: string;
  status: "passed" | "blocked";
  improvements: Array<{ findingId: string; status: "resolved" | "persisted"; evidenceRefs: string[] }>;
  regressions: Array<{ findingId: string; detail: string; evidenceRefs: string[] }>;
  preservedStrengths: string[];
  canonicalUntouched: true;
  createdAt: string;
  fingerprint: string;
}

export interface ChapterSettlement {
  schemaVersion: "chapter-settlement.v1";
  settlementId: string;
  projectSlug: string;
  chapterId: string;
  adoptionTransactionId: string;
  adoptedContentSha256: string;
  status: "settled" | "blocked";
  nextAction: "schedule_dependency_ready_work" | "manual_review";
  createdAt: string;
  fingerprint: string;
}

export interface BookWorkItem {
  workItemId: string;
  chapterId: string;
  kind: "draft";
  dependencyWorkItemIds: string[];
  status: "ready" | "blocked" | "completed";
  settlementId?: string;
}

export interface BookWorkGraph {
  schemaVersion: "book-work-graph.v1";
  graphId: string;
  projectSlug: string;
  version: number;
  workItems: BookWorkItem[];
  updatedAt: string;
  fingerprint: string;
}

export type BookRunStatus = "draft" | "ready" | "queued" | "running" | "pausing" | "paused" | "gate_required" | "repair_required" | "stopping" | "stopped" | "failed_recoverable" | "failed_terminal" | "scope_complete" | "audited_complete";
export interface BookRun {
  schemaVersion: "book-run.v1";
  bookRunId: string;
  projectSlug: string;
  objective: string;
  scope: { chapterIds: string[]; scopeFingerprint: string };
  workGraphRef: string;
  workGraphFingerprint: string;
  autonomyGrantRef: string;
  autonomyLevel: "L0" | "L1" | "L2";
  limits: { maxWorkItems?: number; maxModelCalls?: number; maxBudgetCents?: number; deadlineAt?: string; maxWallClockMs?: number; maxConsecutiveFailures?: number };
  status: BookRunStatus;
  currentGate: "none" | "quiescence_required" | "author_required" | "completion_audit";
  progress: { totalWorkItems: number; completedWorkItems: number; queuedWorkItems: number; denominator: "frozen-work-graph" };
  version: number;
  startedAt: string;
  createdAt: string;
  fingerprint: string;
}
export interface CompletionAudit {
  schemaVersion: "completion-audit.v1";
  status: "audited_complete";
  bookRunId: string;
  runVersion: number;
  workGraphFingerprint: string;
  closureCertificateFingerprint: string;
  quiescenceProofFingerprint: string;
  sourceFingerprint: string;
  auditedAt: string;
  fingerprint: string;
}

export interface UnderstandingReview {
  schemaVersion: "understanding-review.v1";
  reviewId: string;
  projectSlug: string;
  snapshotId: string;
  snapshotFingerprint: string;
  calibrationVersion: "understanding-calibration.v1";
  reviewer: { kind: "independent-deterministic"; id: string } | { kind: "human" | "provider"; id: string; attestationReference: string };
  status: "passed" | "blocked";
  checks: Array<{ checkId: string; status: "passed" | "failed"; detail: string }>;
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
  evidenceRefs?: string[];
}

export interface ContractAdoptionProposal {
  schemaVersion: "story-contract-adoption-proposal.v1";
  proposalId: string;
  candidateId: string;
  worldRuleContractId?: string;
  candidateFingerprint: string;
  projectSlug: string;
  status: "ready_for_authorization" | "blocked" | "committed";
  fieldDecisions: Array<{ fieldId: string; status: "accept" | "keep-provisional" | "reject" | "delegate"; reason?: string }>;
  acceptedFields: StoryContractCandidate["fields"];
  unresolvedFieldIds: string[];
  reviewId: string;
  canonWritten: false | true;
  createdAt: string;
  fingerprint: string;
}

export interface ContractMutationPlan {
  schemaVersion: "mutation-plan.v1";
  mutationId: string;
  proposalId: string;
  projectSlug: string;
  authorizationId: string;
  actorId: string;
  fencingToken: string;
  status: "prepared" | "committing" | "committed" | "rolling_back" | "rolled_back" | "failed";
  targets: Array<{ relativePath: string; beforeSha256?: string; afterSha256: string; existed: boolean }>;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface ProjectionRebuildReceipt {
  schemaVersion: "projection-rebuild-receipt.v1";
  receiptId: string;
  projectSlug: string;
  mutationIds: string[];
  projections: Array<{ name: "story-graph" | "knowledge-index"; status: "rebuilt"; outputFingerprint: string }>;
  createdAt: string;
  fingerprint: string;
}

export interface ProjectionFreshness {
  schemaVersion: "projection-freshness.v1";
  projectSlug: string;
  status: "current" | "stale" | "unknown";
  pendingMutationIds: string[];
  receiptId?: string;
  checkedAt: string;
}

export interface QualityCalibrationEvidence {
  schemaVersion: "quality-calibration-evidence.v1";
  calibrationId: string;
  evaluatorVersion: string;
  sourceKind: "provider" | "human";
  split: "holdout";
  caseIds: string[];
  inputFingerprint: string;
  evaluatedCount: number;
  correctCount: number;
  accuracy: number;
  minimumAccuracy: number;
  status: "calibrated" | "blocked";
  canonGateEligible: false;
  labelAccess: "sealed-separate-from-evaluator-input";
  attestation: { kind: "provider-signed" | "human-reviewed" | "synthetic-fixture"; reference: string };
  evidenceRefs: string[];
  createdAt: string;
  fingerprint: string;
}

export interface ReleaseAcceptanceCheck {
  checkId: "migration-cutover" | "external-calibration" | "governed-e2e" | "v2-independent-review" | "delivery-proof";
  status: "passed" | "missing";
  evidence: string[];
  reason: string;
}

export interface ReleaseAcceptanceDecision {
  schemaVersion: "release-acceptance.v1";
  releaseProfile: "RP5-drafting";
  status: "accepted" | "do-not-activate";
  checks: ReleaseAcceptanceCheck[];
  evaluatedAt: string;
  fingerprint: string;
}

export interface ReleaseActivation {
  schemaVersion: "release-activation.v1";
  status: "active";
  releaseProfile: "RP5-drafting";
  acceptanceFingerprint: string;
  activatedAt: string;
  fingerprint: string;
}

export interface LengthDimension {
  mode: "hard" | "soft" | "unknown";
  min?: number;
  max?: number;
  exact?: number;
}

export interface LengthContract {
  schemaVersion: "length-contract.v1";
  projectSlug: string;
  dimensions: { totalWords: LengthDimension; totalChapters: LengthDimension; totalVolumes: LengthDimension; chapterWords: LengthDimension };
  pauseThresholdRatio: 0.15;
  hardLocks: string[];
  source: "author";
  effectiveScope: "project";
  revisionLineage: string[];
  createdAt: string;
  fingerprint: string;
}

export interface LengthForecast {
  schemaVersion: "length-forecast.v1";
  projectSlug: string;
  contractFingerprint: string;
  actuals: { totalWords: number; totalChapters: number; totalVolumes: number; chapterWords: number[] };
  obligationSummary: { total: number; open: number; highImportanceOpen: number; terminal: number; sourceFingerprint: string };
  completionRange: { totalWords: { min: number; max: number }; totalChapters: { min: number; max: number }; totalVolumes: { min: number; max: number } };
  confidence: "low" | "medium" | "high";
  assumptions: string[];
  bestPath: string;
  worstPath: string;
  endingReachability: "reachable" | "at-risk" | "blocked";
  frozenBaseline: string;
  status: "within-range" | "pause-required";
  blockingReasons: string[];
  createdAt: string;
  fingerprint: string;
}

export interface LengthVarianceDecision {
  schemaVersion: "length-variance-decision.v1";
  decisionId: string;
  projectSlug: string;
  contractFingerprint: string;
  forecastFingerprint: string;
  detectedDeviation: string[];
  cause: "forecast-drift" | "hard-lock-conflict" | "external-constraint" | "none";
  affectedOutlineIds: string[];
  affectedObligationIds: string[];
  alternatives: Array<{ optionId: string; label: string; autoAdoptable: false }>;
  authority: "author" | "external";
  choice: "pause-and-review" | "keep-plan" | "request-replan";
  status: "paused" | "recorded";
  createdAt: string;
  fingerprint: string;
}

export interface StoryContractReadinessProof {
  schemaVersion: "story-contract-readiness-proof.v1";
  proofId: string;
  projectSlug: string;
  status: "ready" | "partial" | "blocked";
  candidateId?: string;
  proposalId?: string;
  requiredFields: Array<{ path: "protagonist.primaryDesire" | "world.rules.primary"; status: "confirmed" | "missing" | "provisional"; evidenceCount: number }>;
  contractFields: Array<{ path: "protagonist.primaryDesire" | "protagonist.innerNeed" | "protagonist.misbelief" | "world.rules.primary" | "conflict.core" | "conflict.opposingPressure" | "stakes.failureCost" | "stakes.irreversibleChoice" | "readerPromise" | "endingDirection"; status: "confirmed" | "missing" | "provisional"; evidenceCount: number }>;
  unknowns: string[];
  blockingReasons: string[];
  projectionStatus: "current" | "stale" | "unknown";
  createdAt: string;
  fingerprint: string;
}

export interface ContextManifestMessage {
  id: string;
  role: "author";
  text: string;
  sourceSpan: { start: number; end: number };
}

export interface ContextManifest {
  schemaVersion: "context-manifest.v1";
  manifestId: string;
  projectSlug: string;
  purpose: "understanding";
  sourceSessionId: string;
  sourceFingerprint: string;
  sourceMessages: ContextManifestMessage[];
  frozenAt: string;
  supersedesManifestId?: string;
}

export interface MigrationPreview {
  schemaVersion: "project-migration-preview.v1";
  migrationId: string;
  projectSlug: string;
  status: "preview_only";
  previewOnly: true;
  writeAuthority: "legacy_compatibility_only";
  assetCounts: {
    chapters: number;
    outlines: number;
    sceneCards: number;
    summaries: number;
    ledgers: number;
    qualityReports: number;
  };
  conflicts: string[];
  sourceFingerprint: string;
  createdAt: string;
  fingerprint: string;
}

export interface MigrationValidation {
  schemaVersion: "project-migration-validation.v1";
  migrationId: string;
  projectSlug: string;
  status: "validated";
  sourceFingerprint: string;
  conflicts: string[];
  resolvedConflicts: string[];
  dependencies: { outlineVersion: "ready" | "missing" };
  validatedAt: string;
  fingerprint: string;
}

export interface MigrationResolution {
  schemaVersion: "project-migration-resolution.v1";
  migrationId: string;
  projectSlug: string;
  status: "resolved";
  selectedOutlineAuthority: "active" | "archived";
  resolvedConflicts: string[];
  resolvedAt: string;
  fingerprint: string;
}

export interface MigrationActivation {
  schemaVersion: "project-migration-activation.v1";
  migrationId: string;
  projectSlug: string;
  status: "activated";
  writeAuthority: "prose-adoption";
  sourceFingerprint: string;
  activatedAt: string;
  fingerprint: string;
}

export interface MigrationRollback {
  schemaVersion: "project-migration-rollback.v1";
  migrationId: string;
  projectSlug: string;
  status: "rolled_back";
  activationFingerprint: string;
  rolledBackAt: string;
  fingerprint: string;
}

export interface BackupCatalogEntry {
  backupId: string;
  projectSlug: string;
  status: "verified" | "invalid";
  faultDomain: "same-workspace";
  createdAt: string;
  objectCount: number;
  fingerprint: string;
}

export interface MigrationCutoverProject {
  projectSlug: string;
  classification: "managed" | "unmanaged" | "invalid";
  governanceState: "legacy" | "migration-preview" | "migration-validated" | "governed" | "migration-activated";
  status: "ready" | "blocked";
  blockers: string[];
}

export interface MigrationCutoverReport {
  schemaVersion: "project-migration-cutover.v1";
  status: "ready" | "blocked";
  projectCount: number;
  projects: MigrationCutoverProject[];
  blockers: string[];
  evaluatedAt: string;
  fingerprint: string;
}

export interface MigrationBatchValidationProject {
  projectSlug: string;
  status: "validated" | "blocked";
  migrationId?: string;
  sourceFingerprint?: string;
  conflicts?: string[];
  dependencies?: { outlineVersion: "ready" | "missing" };
  blockers: string[];
}

export interface MigrationBatchValidationReport {
  schemaVersion: "project-migration-batch-validation.v1";
  status: "validated" | "blocked";
  projectCount: number;
  projects: MigrationBatchValidationProject[];
  blockers: string[];
  generatedAt: string;
  fingerprint: string;
}

export type ObligationType = "mystery" | "prophecy" | "object" | "character_promise" | "relationship_debt" | "emotional_debt" | "rule_exception" | "secret" | "false_clue" | "goal" | "sequel_hook" | "general_foreshadowing";
export type ObligationStatus = "proposed" | "confirmed" | "planned" | "setup" | "reminder" | "escalated" | "partially_paid" | "paid" | "neutralized" | "transformed" | "waived" | "opened" | "invalidated" | "reanchored" | "merged" | "split";

export interface NarrativeObligation {
  schemaVersion: "narrative-obligation.v1";
  obligationId: string;
  projectSlug: string;
  type: ObligationType;
  title: string;
  questionOrPromise: string;
  importance: "low" | "medium" | "high";
  status: ObligationStatus;
  sourceRefs: string[];
  entityRefs: string[];
  version: number;
  updatedAt: string;
  fingerprint: string;
}

export interface ObligationEvent {
  schemaVersion: "obligation-event.v1";
  eventId: string;
  obligationId: string;
  fromStatus: ObligationStatus;
  toStatus: ObligationStatus;
  evidenceRefs: string[];
  reason: string;
  actor: "author" | "system" | "migration";
  expectedVersion: number;
  createdAt: string;
  fingerprint: string;
}

export interface NarrativeObligationCoverageReport {
  schemaVersion: "narrative-obligation-coverage.v1";
  chapterIds: string[];
  plannedIds: string[];
  dashboardIds: string[];
  legacyLedgerIds: string[];
  registeredIds: string[];
  orphanPlannedIds: string[];
  sourceCoverageStatus: "covered" | "partial" | "empty-assets-coverage-unknown" | "no-planned-markers";
  evidenceBackedPayoffTransitionExists: boolean;
  canClaimNoOpenObligations: false;
  generatedAt: string;
}

export interface NarrativeObligationCandidate {
  schemaVersion: "narrative-obligation-candidate.v1";
  candidateId: string;
  markerId: string;
  status: "candidate";
  chapterIds: string[];
  sourceRefs: string[];
  existingObligationId: string | null;
}

export interface ObligationCoverageCertificate {
  schemaVersion: "obligation-coverage-certificate.v1";
  status: "issued";
  sourceFingerprint: string;
  chapterIds: string[];
  plannedIds: string[];
  obligationCount: number;
  terminalObligationIds: string[];
  generatedAt: string;
  fingerprint: string;
}

export interface ObligationCoverageInvalidation {
  schemaVersion: "obligation-coverage-invalidation.v1";
  status: "stale";
  certificateFingerprint: string;
  previousSourceFingerprint: string;
  currentSourceFingerprint: string;
  reason: "source-fingerprint-changed";
  invalidatedAt: string;
}

export type RevisionIntentType = "fact_correction" | "direction_change" | "retcon" | "reorder" | "entity_rename" | "style_edit" | "quality_repair" | "restore" | "exploration_branch" | "merge" | "reopen_completion";
export type RevisionMaturity = "candidate_generated" | "author_accepted" | "settled" | "publication_ready";
export type RevisionIntentMode = "in_place" | "branch_candidate";

export interface RevisionIntent {
  schemaVersion: "revision-intent.v1";
  intentId: string;
  projectSlug: string;
  authorText: string;
  type: RevisionIntentType;
  maturity: RevisionMaturity;
  scope: { chapterIds: string[]; sceneIds?: string[] };
  requestedChanges: string[];
  protectedItems: string[];
  mode: RevisionIntentMode;
  actor: "author" | "system";
  status: "proposed";
  createdAt: string;
  fingerprint: string;
}

export interface RevisionImpactReport {
  schemaVersion: "revision-impact-report.v1";
  intentId: string;
  status: "needs_review" | "ready_for_candidate";
  directChapterIds: string[];
  transitiveChapterIds: string[];
  protectedItems: string[];
  unknownDependencies: string[];
  generatedAt: string;
  fingerprint: string;
}

export type RevisionChangeKind = "add" | "update" | "move" | "split" | "merge" | "supersede" | "transform" | "waive";
export type RevisionTargetKind = "chapter" | "scene" | "text-span" | "obligation" | "fact";
export interface RevisionChangeOperation { kind: RevisionChangeKind; targetKind: RevisionTargetKind; targetId: string; chapterId: string; rationale: string; }
export interface RevisionChangeSet {
  schemaVersion: "revision-change-set.v1";
  changeSetId: string;
  intentId: string;
  expectedIntentFingerprint: string;
  status: "candidate";
  operations: RevisionChangeOperation[];
  createdAt: string;
  fingerprint: string;
}

export interface RevisionReview {
  schemaVersion: "revision-review.v1";
  reviewId: string;
  changeSetId: string;
  expectedChangeSetFingerprint: string;
  decision: "accepted" | "needs_revision" | "rejected";
  status: "approved_for_adoption" | "needs_revision" | "rejected";
  note: string;
  actor: "author";
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
}

export interface RevisionAdoptionProposal {
  schemaVersion: "revision-adoption-proposal.v1";
  proposalId: string;
  changeSetId: string;
  expectedChangeSetFingerprint: string;
  reviewId: string;
  baseCanonFingerprint: string;
  impactFingerprint: string;
  status: "ready_for_author_adoption";
  canonWritten: false;
  createdAt: string;
  fingerprint: string;
}

export interface RevisionAdoptionReceipt {
  schemaVersion: "revision-adoption-receipt.v1";
  receiptId: string;
  proposalId: string;
  proposalFingerprint: string;
  proseAdoptionTransactionId: string;
  canonWriteFingerprint: string;
  status: "committed";
  canonWritten: true;
  createdAt: string;
  fingerprint: string;
}

export interface RevisionSettlement {
  schemaVersion: "revision-settlement.v1";
  settlementId: string;
  receiptId: string;
  receiptFingerprint: string;
  chapterSettlementIds: string[];
  status: "settled";
  canonWriteFingerprint: string;
  createdAt: string;
  fingerprint: string;
}

export interface EditionManifest {
  schemaVersion: "edition-manifest.v1";
  editionId: string;
  projectSlug: string;
  canonCommitFingerprint: string;
  title: string;
  author: string;
  language: string;
  status: "frozen";
  readerSafe: true;
  chapters: Array<{ chapterId: string; title: string; order: number; contentPath: string; settlementId: string; contentSha256: string }>;
  publicationTreeFingerprint: string;
  createdAt: string;
  fingerprint: string;
}

export interface PublicationTree {
  schemaVersion: "publication-tree.v1";
  editionId: string;
  projectSlug: string;
  readerSafe: true;
  chapters: Array<{ chapterId: string; title: string; order: number; blocks: Array<Record<string, unknown>> }>;
  fingerprint: string;
}

export interface PublicationArtifactSet {
  schemaVersion: "publication-artifact-set.v1";
  artifactSetId: string;
  editionId: string;
  projectSlug: string;
  manifestFingerprint: string;
  treeFingerprint: string;
  status: "validated";
  artifacts: Array<{ format: "markdown" | "txt"; relativePath: string; mime: string; rendererVersion: string; sha256: string; size: number }>;
  createdAt: string;
  fingerprint: string;
}

export interface DeliveryProof {
  schemaVersion: "delivery-proof.v1";
  proofId: string;
  editionId: string;
  projectSlug: string;
  manifestFingerprint: string;
  treeFingerprint: string;
  artifactSetFingerprint: string;
  artifactHashes: Array<{ format: string; relativePath: string; sha256: string; size: number }>;
  approvalId: string;
  approverKind: "author";
  status: "issued";
  issuedAt: string;
  fingerprint: string;
}

export interface DeliveryProofVerification {
  valid: boolean;
  reasons: string[];
  proof: DeliveryProof | null;
}

export interface DeliveryProofEvent {
  schemaVersion: "delivery-proof-event.v1";
  eventId: string;
  proofId: string;
  status: "revoked" | "superseded";
  actor: "author";
  reason: string;
  replacementEditionId?: string;
  createdAt: string;
  fingerprint: string;
}

export interface DeliveryAccessGrant {
  schemaVersion: "delivery-access-grant.v1";
  grantId: string;
  proofId: string;
  editionId: string;
  projectSlug: string;
  recipientId: string;
  scope: "reader" | "archive";
  expiresAt: string;
  status: "active";
  issuedAt: string;
  fingerprint: string;
}

export interface DeliveryAccessGrantVerification {
  valid: boolean;
  reasons: string[];
  grant: DeliveryAccessGrant | null;
}

export interface DeliveryAccessGrantEvent {
  schemaVersion: "delivery-access-grant-event.v1";
  eventId: string;
  grantId: string;
  status: "revoked";
  actor: "author";
  reason: string;
  createdAt: string;
  fingerprint: string;
}

export interface ReleasePreflightReport {
  schemaVersion: "release-preflight.v1";
  editionId: string;
  status: "ready" | "blocked";
  findings: Array<{ code: string; message: string; evidence: string[] }>;
  evaluatedAt: string;
  fingerprint: string;
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
