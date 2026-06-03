import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { novelApi } from "./novelApi";

describe("novelApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockJson(data: unknown, ok = true, status = ok ? 200 : 500) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok,
      status,
      json: () => Promise.resolve(data)
    } as Response);
  }

  it("lists projects through the novel endpoint", async () => {
    mockJson({ projects: [{ slug: "demo", chapters: [] }] });

    const projects = await novelApi.listProjects();

    expect(projects).toEqual([{ slug: "demo", chapters: [] }]);
    expect(fetch).toHaveBeenCalledWith("/api/novel/projects", {});
  });

  it("creates a project from a rough idea", async () => {
    mockJson({
      project: {
        id: "demo",
        slug: "demo",
        title: "Demo",
        genre: "fantasy",
        roughIdea: "A sealed mountain gate.",
        chapters: [],
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z"
      }
    });

    const project = await novelApi.createProject({ title: "Demo", roughIdea: "A sealed mountain gate." });

    expect(project.slug).toBe("demo");
    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Demo", roughIdea: "A sealed mountain gate." })
      })
    );
  });

  it("reads and saves project files", async () => {
    mockJson({ content: "# Chapter 1\n" });
    mockJson({ saved: true });

    await expect(novelApi.readFile("demo", "chapters/chapter-001.md")).resolves.toBe("# Chapter 1\n");
    await novelApi.saveFile("demo", "chapters/chapter-001.md", "new draft");

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/files/chapters/chapter-001.md", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/projects/demo/files/chapters/chapter-001.md",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ content: "new draft" })
      })
    );
  });

  it("runs Codex tasks and selection polish requests", async () => {
    mockJson({ task: { id: "task-1", type: "idea.suggest", status: "success" } });
    mockJson({ task: { id: "task-2", type: "selection.polish", status: "success" } });

    await expect(novelApi.runTask("demo", "idea.suggest", { chapterId: "chapter-001" })).resolves.toMatchObject({
      id: "task-1"
    });
    await expect(
      novelApi.polishSelection("demo", {
        chapterId: "chapter-001",
        filePath: "chapters/chapter-001.md",
        selectedText: "plain line",
        beforeText: "",
        afterText: "",
        start: 0,
        end: 10,
        mode: "polish"
      })
    ).resolves.toMatchObject({ id: "task-2" });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/novel/projects/demo/tasks",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/projects/demo/selection/polish",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("applies file patches after user confirmation", async () => {
    mockJson({ applied: 1 });

    await novelApi.applyPatches("demo", [
      {
        target: "chapters/chapter-001.md",
        mode: "replace-file",
        content: "accepted draft"
      }
    ]);

    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects/demo/patches",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("accepted draft")
      })
    );
  });

  it("throws the API error message when a request fails", async () => {
    mockJson({ error: "Unsafe file path" }, false, 400);

    await expect(novelApi.readFile("demo", "../secret.md")).rejects.toThrow("Unsafe file path");
  });
});
