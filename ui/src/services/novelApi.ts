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
  EditorSuggestion,
  EditorSuggestionRequest,
  EditorSelection,
  FileDiffResult,
  FileVersionSnapshot,
  KnowledgeIndexProjection,
  KnowledgeSearchQuery,
  KnowledgeSearchResult,
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
  WritingRecapCandidate
} from "@/types/novel";

const jsonHeaders = { "Content-Type": "application/json" };

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
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
      body: JSON.stringify(input)
    });
    return data.project;
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

  async startRuntime(projectId: string, input: { chapterId?: string; direction?: string; branchId?: string } = {}): Promise<{ run: RuntimeRun; command: RuntimeCommand }> {
    return request<{ run: RuntimeRun; command: RuntimeCommand }>(`/api/novel/projects/${projectId}/runtime/start`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    });
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
