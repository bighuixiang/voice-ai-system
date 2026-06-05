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

  it("imports a local folder as a managed project", async () => {
    mockJson({
      project: {
        id: "imported",
        slug: "imported",
        title: "Imported",
        genre: "fantasy",
        roughIdea: "Imported source",
        chapters: [],
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z"
      }
    });

    const project = await novelApi.importProject({ sourcePath: "D:\\novels\\old-story", title: "Imported" });

    expect(project.slug).toBe("imported");
    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/import",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: "D:\\novels\\old-story", title: "Imported" })
      })
    );
  });

  it("reads the platform library and manages shared asset links", async () => {
    mockJson({ library: { version: 1, assets: [], prompts: [], roles: [], skills: [], updatedAt: "now" } });
    mockJson({ asset: { id: "asset-1", name: "Shared Sword", type: "prop", linkedProjects: ["demo"] } });
    mockJson({ asset: { id: "asset-1", name: "Shared Sword", type: "prop", linkedProjects: ["demo", "other"] } });

    await expect(novelApi.readPlatformLibrary()).resolves.toMatchObject({ version: 1 });
    await expect(
      novelApi.createPlatformAsset({ name: "Shared Sword", type: "prop", projectSlug: "demo" })
    ).resolves.toMatchObject({ id: "asset-1" });
    await expect(novelApi.linkPlatformAsset("asset-1", "other")).resolves.toMatchObject({
      linkedProjects: ["demo", "other"]
    });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/platform/library", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/platform/assets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Shared Sword", type: "prop", projectSlug: "demo" })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/platform/assets/asset-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ projectSlug: "other" })
      })
    );
  });

  it("reads, checks, and saves AI agent configuration", async () => {
    mockJson({
      defaultProfileId: "codex-cli",
      profiles: [{ id: "codex-cli", label: "Codex CLI", provider: "codex", command: "codex", models: [] }],
      checks: []
    });
    mockJson({ available: true, profileId: "codex-cli", provider: "codex", label: "Codex CLI", command: "codex" });
    mockJson({
      config: {
        version: 1,
        defaultScenario: "novel",
        scenarios: {
          novel: { profileId: "codex-cli", modelId: "gpt-5" },
          assets: { profileId: "codex-cli" },
          script: { profileId: "codex-cli" },
          "image-generation": { profileId: "codex-cli" },
          "video-generation": { profileId: "codex-cli" }
        },
        updatedAt: "2026-06-05T00:00:00.000Z"
      }
    });
    mockJson({
      config: {
        version: 1,
        defaultScenario: "novel",
        scenarios: {
          novel: { profileId: "codex-cli", modelId: "gpt-5" },
          assets: { profileId: "codex-cli" },
          script: { profileId: "codex-cli" },
          "image-generation": { profileId: "codex-cli" },
          "video-generation": { profileId: "codex-cli" }
        },
        updatedAt: "2026-06-05T00:00:00.000Z"
      }
    });
    mockJson({ project: { slug: "demo", ai: { profileId: "codex-cli", modelId: "gpt-5" } } });

    await expect(novelApi.readAgentProfiles()).resolves.toMatchObject({ defaultProfileId: "codex-cli" });
    await expect(novelApi.checkAgentProfile("codex-cli", "gpt-5")).resolves.toMatchObject({ available: true });
    const platformConfig = await novelApi.readPlatformAiConfig();
    await expect(novelApi.savePlatformAiConfig(platformConfig)).resolves.toMatchObject({
      scenarios: { novel: { modelId: "gpt-5" } }
    });
    await expect(novelApi.updateProjectAiConfig("demo", { profileId: "codex-cli", modelId: "gpt-5" })).resolves.toMatchObject({
      ai: { modelId: "gpt-5" }
    });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/agents", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/agents/check",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ profileId: "codex-cli", modelId: "gpt-5" })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/platform/ai-config",
      {}
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/platform/ai-config",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ config: platformConfig })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/novel/projects/demo/ai",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ profileId: "codex-cli", modelId: "gpt-5" })
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

  it("reads and saves writing cockpit resources", async () => {
    const dashboard = {
      chapterId: "chapter-001",
      goal: "Make the choice unavoidable.",
      pov: "Hero",
      mainConflict: "Stay hidden or act.",
      endingHook: "The seal answers.",
      wordCount: 1200,
      status: "drafting",
      unresolvedForeshadowingIds: [],
      continuityRiskIds: [],
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const scenes = [
      {
        id: "scene-1",
        chapterId: "chapter-001",
        order: 1,
        title: "Pressure",
        time: "night",
        location: "Gate",
        pov: "Hero",
        characters: ["Hero"],
        conflict: "Stay quiet.",
        turn: "A sound exposes him.",
        informationReleased: [],
        foreshadowingIds: [],
        powerProgression: "",
        updatedAt: "2026-06-04T00:00:00.000Z"
      }
    ];
    const storyControl = {
      version: 1 as const,
      premise: "A careful hero opens a sealed gate.",
      currentArcId: "arc-1",
      arcs: [],
      characters: [],
      events: [],
      orchestrationNotes: "Keep upgrades causal.",
      updatedAt: "2026-06-04T00:00:00.000Z"
    };
    const entries = [
      {
        id: "risk-1",
        kind: "risk",
        title: "Information boundary",
        status: "open",
        severity: "medium",
        chapterIds: ["chapter-001"],
        relatedEntities: ["Hero"],
        note: "Avoid omniscient labels.",
        updatedAt: "2026-06-04T00:00:00.000Z"
      }
    ];
    mockJson({ dashboard });
    mockJson({ dashboard });
    mockJson({ scenes });
    mockJson({ scenes });
    mockJson({ storyControl });
    mockJson({ storyControl });
    mockJson({ entries });
    mockJson({ entries });

    await expect(novelApi.readChapterDashboard("demo", "chapter-001")).resolves.toEqual(dashboard);
    await expect(novelApi.saveChapterDashboard("demo", dashboard)).resolves.toEqual(dashboard);
    await expect(novelApi.readSceneCards("demo", "chapter-001")).resolves.toEqual(scenes);
    await expect(novelApi.saveSceneCards("demo", "chapter-001", scenes)).resolves.toEqual(scenes);
    await expect(novelApi.readStoryControl("demo")).resolves.toEqual(storyControl);
    await expect(novelApi.saveStoryControl("demo", storyControl)).resolves.toEqual(storyControl);
    await expect(novelApi.readLedgerEntries("demo", "risk")).resolves.toEqual(entries);
    await expect(novelApi.saveLedgerEntries("demo", "risk", entries)).resolves.toEqual(entries);

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/dashboard/chapter-001", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/projects/demo/dashboard/chapter-001",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ dashboard }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/novel/projects/demo/scenes/chapter-001", {});
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/novel/projects/demo/scenes/chapter-001",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ scenes }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(5, "/api/novel/projects/demo/story-control", {});
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      "/api/novel/projects/demo/story-control",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ storyControl }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(7, "/api/novel/projects/demo/ledger/risk", {});
    expect(fetch).toHaveBeenNthCalledWith(
      8,
      "/api/novel/projects/demo/ledger/risk",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ entries }) })
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
