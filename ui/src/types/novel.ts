export type CodexTaskType =
  | "project.create"
  | "outline.generate"
  | "chapter.plan"
  | "chapter.draft"
  | "selection.polish"
  | "continuity.check"
  | "idea.suggest";

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
