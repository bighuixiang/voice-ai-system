export type CodexTaskType =
  | "project.create"
  | "outline.generate"
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

export interface PlatformAiConfig {
  version: 1;
  defaultScenario: AiUsageScenarioKey;
  scenarios: Record<AiUsageScenarioKey, AiScenarioConfig>;
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
