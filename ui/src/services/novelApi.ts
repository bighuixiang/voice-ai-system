import type {
  AiAgentCheckResult,
  AiAgentProfile,
  AiInvocationSession,
  PlatformAiConfig,
  ChapterDashboard,
  ChapterQualityReport,
  ChapterSummary,
  CodexTaskType,
  EditorSelection,
  LedgerEntry,
  NovelFilePatch,
  NovelProject,
  NovelTask,
  PlatformAsset,
  PlatformAssetType,
  PlatformLibrary,
  SceneCard,
  StoryControl,
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

  async readChapterDashboard(projectId: string, chapterId: string): Promise<ChapterDashboard> {
    const data = await request<{ dashboard: ChapterDashboard }>(`/api/novel/projects/${projectId}/dashboard/${chapterId}`);
    return data.dashboard;
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

  async saveChapterQualityReport(projectId: string, report: ChapterQualityReport): Promise<ChapterQualityReport> {
    const data = await request<{ report: ChapterQualityReport }>(`/api/novel/projects/${projectId}/quality/${report.chapterId}`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ report })
    });
    return data.report;
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

  async readAiInvocations(projectId: string): Promise<AiInvocationSession[]> {
    const data = await request<{ invocations: AiInvocationSession[] }>(`/api/novel/projects/${projectId}/tasks/invocations`);
    return data.invocations;
  },

  async polishSelection(projectId: string, selection: EditorSelection & { chapterId: string; mode: string }): Promise<NovelTask> {
    const data = await request<{ task: NovelTask }>(`/api/novel/projects/${projectId}/selection/polish`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(selection)
    });
    return data.task;
  },

  async applyPatches(projectId: string, patches: NovelFilePatch[]): Promise<void> {
    await request(`/api/novel/projects/${projectId}/patches`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ patches })
    });
  }
};
