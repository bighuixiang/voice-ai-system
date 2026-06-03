import type { CodexTaskType, EditorSelection, NovelFilePatch, NovelProject, NovelTask } from "@/types/novel";

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

  async runTask(projectId: string, type: CodexTaskType, payload: Record<string, unknown>): Promise<NovelTask> {
    const data = await request<{ task: NovelTask }>(`/api/novel/projects/${projectId}/tasks`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ type, payload })
    });
    return data.task;
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
