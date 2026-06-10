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

  it("imports browser selected directory files", async () => {
    mockJson({
      project: {
        id: "uploaded",
        slug: "uploaded",
        title: "Uploaded",
        genre: "fantasy",
        roughIdea: "Uploaded source",
        chapters: [],
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z"
      }
    });

    await novelApi.importProject({
      sourcePath: "uploaded-story",
      title: "Uploaded",
      files: [{ relativePath: "uploaded-story/chapter-001.md", content: "# Uploaded" }]
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/import",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: "uploaded-story",
          title: "Uploaded",
          files: [{ relativePath: "uploaded-story/chapter-001.md", content: "# Uploaded" }]
        })
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
    mockJson({
      stages: [{ key: "pipeline.chapter.prose", label: "Chapter prose drafting", taskTypes: ["chapter.draft"] }]
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
    await expect(novelApi.readAiStages()).resolves.toEqual([
      { key: "pipeline.chapter.prose", label: "Chapter prose drafting", taskTypes: ["chapter.draft"] }
    ]);
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
      "/api/novel/ai-stages",
      {}
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/novel/agents/check",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ profileId: "codex-cli", modelId: "gpt-5" })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/platform/ai-config",
      {}
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/platform/ai-config",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ config: platformConfig })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      6,
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
    const runtimeSnapshot = {
      projectSlug: "demo",
      chapterId: "chapter-001",
      chapterTitle: "Chapter 1",
      activeStepId: "review",
      fingerprint: "abcdef1234567890",
      steps: [{ id: "draft", label: "正文", status: "done", detail: "Saved.", metric: "1200 字" }],
      signals: {
        wordCount: 1200,
        sceneCount: 1,
        hasDashboard: true,
        hasChapterSummary: false,
        hasQualityReport: false,
        hasWritingRecap: false,
        acceptedLedgerCount: 0
      },
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const qualityReport = {
      chapterId: "chapter-001",
      overallScore: 82,
      summary: "Readable pressure.",
      metrics: [{ key: "conflict" as const, label: "Conflict", score: 82, note: "Clear enough." }],
      strengths: ["Clear pressure"],
      fixes: ["Sharpen the hook"],
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const seriesMetrics = {
      projectSlug: "demo",
      chapterCount: 2,
      reportCount: 1,
      averageOverallScore: 82,
      metricAverages: [{ key: "conflict" as const, label: "Conflict", averageScore: 82, reportCount: 1 }],
      weakestChapters: [
        {
          chapterId: "chapter-001",
          chapterTitle: "Chapter 1",
          overallScore: 82,
          weakestMetricKey: "conflict" as const,
          weakestMetricLabel: "Conflict",
          weakestMetricScore: 82,
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const graph = {
      projectSlug: "demo",
      nodes: [{ id: "chapter:chapter-001", type: "chapter", label: "Chapter 1" }],
      edges: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const knowledgeIndex = {
      projectSlug: "demo",
      facts: [{ id: "fact:gate", text: "The gate opens.", chapterIds: ["chapter-001"], relatedEntities: ["Hero"], keywords: ["gate"], source: { type: "chapter-summary" as const, id: "fact-1" }, updatedAt: "2026-06-11T00:00:00.000Z" }],
      triples: [],
      chapterIndex: {
        projectSlug: "demo",
        chapters: [{ chapterId: "chapter-001", title: "Chapter 1", keywords: ["gate"], factIds: ["fact:gate"], tripleIds: [], entityNames: ["Hero"], updatedAt: "2026-06-11T00:00:00.000Z" }],
        keywords: { gate: ["chapter-001"] },
        updatedAt: "2026-06-11T00:00:00.000Z"
      },
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const knowledgeSearch = {
      query: "Hero gate",
      tokens: ["hero", "gate"],
      facts: [{ ...knowledgeIndex.facts[0], score: 2 }],
      triples: [],
      chapters: [{ ...knowledgeIndex.chapterIndex.chapters[0], score: 2 }]
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
    const auditReport = {
      projectSlug: "demo",
      projectTitle: "Demo",
      generatedAt: "2026-06-11T00:00:00.000Z",
      chapters: [{ id: "chapter-001", title: "Chapter 1", status: "drafting", contentPath: "content/chapter-001.md" }],
      quality: seriesMetrics,
      taskSummary: {
        total: 1,
        byStatus: { pending: 0, running: 0, success: 1, error: 0, cancelled: 0 },
        byType: { "chapter.draft": 1 },
        latestTasks: []
      },
      aiInvocationSummary: {
        total: 1,
        byDecision: { pending: 0, accepted: 1, rejected: 0, "not-required": 0 },
        proposedPatchCount: 1,
        acceptedPatchCount: 1
      },
      aiInvocations: []
    };
    mockJson({ dashboard });
    mockJson({ snapshot: runtimeSnapshot });
    mockJson({ dashboard });
    mockJson({ scenes });
    mockJson({ scenes });
    mockJson({ storyControl });
    mockJson({ storyControl });
    mockJson({ graph });
    mockJson({ index: knowledgeIndex });
    mockJson({ index: knowledgeIndex });
    mockJson({ result: knowledgeSearch });
    mockJson({ report: qualityReport });
    mockJson({ seriesMetrics });
    mockJson({ report: qualityReport, seriesMetrics });
    mockJson({ entries });
    mockJson({ entries });
    mockJson({ report: auditReport });

    await expect(novelApi.readChapterDashboard("demo", "chapter-001")).resolves.toEqual(dashboard);
    await expect(novelApi.readCreationRuntimeSnapshot("demo", "chapter-001")).resolves.toEqual(runtimeSnapshot);
    await expect(novelApi.saveChapterDashboard("demo", dashboard)).resolves.toEqual(dashboard);
    await expect(novelApi.readSceneCards("demo", "chapter-001")).resolves.toEqual(scenes);
    await expect(novelApi.saveSceneCards("demo", "chapter-001", scenes)).resolves.toEqual(scenes);
    await expect(novelApi.readStoryControl("demo")).resolves.toEqual(storyControl);
    await expect(novelApi.saveStoryControl("demo", storyControl)).resolves.toEqual(storyControl);
    await expect(novelApi.readStoryGraph("demo")).resolves.toEqual(graph);
    await expect(novelApi.readKnowledgeIndex("demo")).resolves.toEqual(knowledgeIndex);
    await expect(novelApi.rebuildKnowledgeIndex("demo")).resolves.toEqual(knowledgeIndex);
    await expect(novelApi.searchKnowledgeIndex("demo", { query: "Hero gate", chapterId: "chapter-001" })).resolves.toEqual(
      knowledgeSearch
    );
    await expect(novelApi.readChapterQualityReport("demo", "chapter-001")).resolves.toEqual(qualityReport);
    await expect(novelApi.readSeriesQualityMetrics("demo")).resolves.toEqual(seriesMetrics);
    await expect(novelApi.saveChapterQualityReport("demo", qualityReport)).resolves.toEqual({ report: qualityReport, seriesMetrics });
    await expect(novelApi.readLedgerEntries("demo", "risk")).resolves.toEqual(entries);
    await expect(novelApi.saveLedgerEntries("demo", "risk", entries)).resolves.toEqual(entries);
    await expect(novelApi.readProjectAuditReport("demo")).resolves.toEqual(auditReport);

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/dashboard/chapter-001", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/projects/demo/runtime/chapter-001",
      {}
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/novel/projects/demo/dashboard/chapter-001",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ dashboard }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(4, "/api/novel/projects/demo/scenes/chapter-001", {});
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/novel/projects/demo/scenes/chapter-001",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ scenes }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(6, "/api/novel/projects/demo/story-control", {});
    expect(fetch).toHaveBeenNthCalledWith(
      7,
      "/api/novel/projects/demo/story-control",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ storyControl }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(8, "/api/novel/projects/demo/story-graph", {});
    expect(fetch).toHaveBeenNthCalledWith(9, "/api/novel/projects/demo/knowledge/index", {});
    expect(fetch).toHaveBeenNthCalledWith(10, "/api/novel/projects/demo/knowledge/index/rebuild", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(
      11,
      "/api/novel/projects/demo/knowledge/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "Hero gate", chapterId: "chapter-001" })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(12, "/api/novel/projects/demo/quality/chapter-001", {});
    expect(fetch).toHaveBeenNthCalledWith(
      13,
      "/api/novel/projects/demo/quality/series-metrics",
      {}
    );
    expect(fetch).toHaveBeenNthCalledWith(
      14,
      "/api/novel/projects/demo/quality/chapter-001",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ report: qualityReport }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(15, "/api/novel/projects/demo/ledger/risk", {});
    expect(fetch).toHaveBeenNthCalledWith(
      16,
      "/api/novel/projects/demo/ledger/risk",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ entries }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(17, "/api/novel/projects/demo/audit-report", {});
  });

  it("reads, saves, and accepts chapter memory recap patches", async () => {
    const summary = {
      chapterId: "chapter-001",
      summary: "A cost was paid for the clue.",
      keyEvents: ["The gate answered blood."],
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-10T00:00:00.000Z"
    };
    const recap = {
      chapterId: "chapter-001",
      summary: "A cost was paid for the clue.",
      newFacts: [],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      createdAt: "2026-06-10T00:00:00.000Z",
      summaryPatch: { summary: "A cost was paid for the clue." }
    };
    mockJson({ summary });
    mockJson({ summary });
    mockJson({ summary });

    await expect(novelApi.readChapterSummary("demo", "chapter-001")).resolves.toEqual(summary);
    await expect(novelApi.saveChapterSummary("demo", "chapter-001", summary)).resolves.toEqual(summary);
    await expect(novelApi.acceptWritingRecap("demo", recap)).resolves.toEqual({ summary });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/novel/projects/demo/memory/chapter-summaries/chapter-001", {});
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/novel/projects/demo/memory/chapter-summaries/chapter-001",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ summary }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/novel/projects/demo/recaps/accept",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ recap }) })
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

  it("reads AI invocation audit sessions", async () => {
    mockJson({
      invocations: [
        {
          id: "invocation-1",
          taskId: "task-1",
          taskType: "idea.suggest",
          stageKey: "pipeline.idea.suggest",
          status: "success",
          promptSnapshot: { length: 100, preview: "prompt", contextTitles: [] },
          contextSnapshot: { blockCount: 0, totalChars: 0, blocks: [] },
          attempt: { index: 1, startedAt: "2026-06-11T00:00:00.000Z" },
          adoptionDecision: "not-required",
          proposedPatchTargets: [],
          acceptedPatchTargets: [],
          commitResult: { historyAppended: true, invocationAppended: true },
          createdAt: "2026-06-11T00:00:00.000Z",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ]
    });

    await expect(novelApi.readAiInvocations("demo")).resolves.toEqual([
      expect.objectContaining({ id: "invocation-1", taskId: "task-1" })
    ]);

    expect(fetch).toHaveBeenCalledWith("/api/novel/projects/demo/tasks/invocations", {});
  });

  it("applies file patches after user confirmation", async () => {
    mockJson({ applied: 1 });

    await novelApi.applyPatches("demo", [
      {
        target: "chapters/chapter-001.md",
        mode: "replace-file",
        content: "accepted draft"
      }
    ], "task-1");

    expect(fetch).toHaveBeenCalledWith(
      "/api/novel/projects/demo/patches",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          patches: [
            {
              target: "chapters/chapter-001.md",
              mode: "replace-file",
              content: "accepted draft"
            }
          ],
          taskId: "task-1"
        })
      })
    );
  });

  it("throws the API error message when a request fails", async () => {
    mockJson({ error: "Unsafe file path" }, false, 400);

    await expect(novelApi.readFile("demo", "../secret.md")).rejects.toThrow("Unsafe file path");
  });
});
