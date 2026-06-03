export type CodexTaskType =
  | "project.create"
  | "outline.generate"
  | "chapter.plan"
  | "chapter.draft"
  | "selection.polish"
  | "continuity.check"
  | "idea.suggest"
  | "assistant.free";

export type CreativeModuleKey = "novel" | "assets" | "script" | "image-generation" | "video-generation";
export type ChapterDocumentKind = "content" | "outline";

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
  status: "pending" | "running" | "success" | "error" | "cancelled";
  projectId: string;
  inputSummary: string;
  outputSummary?: string;
  result?: CodexTaskResult;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
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
