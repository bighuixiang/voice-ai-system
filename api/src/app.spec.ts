import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

let server: http.Server;
let baseUrl = "";
let tempRoot = "";

async function startServer() {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve test server address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer() {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(`${baseUrl}${url}`, init);
  const data = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, data };
}

describe("novel API routes", () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-api-routes-"));
    process.env.NOVELS_ROOT = tempRoot;
    process.env.PLATFORM_ROOT = path.join(tempRoot, "platform");
    process.env.NOVEL_DB_PATH = path.join(tempRoot, "data", "creative-platform.sqlite");
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
    delete process.env.NOVELS_ROOT;
    delete process.env.PLATFORM_ROOT;
    delete process.env.NOVEL_DB_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("creates, lists, reads, and saves a novel project file", async () => {
    const created = await jsonFetch<{ project: { slug: string; chapters: Array<{ contentPath: string }> } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Demo Novel",
        genre: "fantasy",
        roughIdea: "A cautious apprentice finds a sealed room."
      })
    });

    expect(created.status).toBe(201);
    expect(created.data.project.slug).toBe("demo-novel");

    const listed = await jsonFetch<{ projects: Array<{ slug: string }> }>("/api/novel/projects");
    expect(listed.data.projects.map((project) => project.slug)).toContain("demo-novel");

    const database = await jsonFetch<{ database: { exists: boolean; projectCount: number } }>("/api/platform/database");
    expect(database.data.database.exists).toBe(true);
    expect(database.data.database.projectCount).toBe(1);

    const filePath = created.data.project.chapters[0].contentPath;
    const readBefore = await jsonFetch<{ content: string }>(`/api/novel/projects/demo-novel/files/${filePath}`);
    expect(readBefore.data.content.length).toBeGreaterThan(0);

    const saved = await jsonFetch<{ saved: boolean }>(`/api/novel/projects/demo-novel/files/${filePath}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "manual draft" })
    });
    expect(saved.data.saved).toBe(true);

    const readAfter = await jsonFetch<{ content: string }>(`/api/novel/projects/demo-novel/files/${filePath}`);
    expect(readAfter.data.content).toBe("manual draft");
  });

  it("reads AI invocation audit sessions", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Audit Demo",
        roughIdea: "Track every AI call."
      })
    });
    const slug = created.data.project.slug;
    const invocation = {
      id: "invocation-1",
      taskId: "task-1",
      projectId: slug,
      taskType: "chapter.plan",
      stageKey: "chapter.plan",
      status: "success",
      promptSnapshot: { length: 100, preview: "Plan chapter", contextTitles: ["Project"] },
      contextSnapshot: { blockCount: 1, totalChars: 20, blocks: [{ title: "Project", length: 20 }] },
      attempt: { index: 1, startedAt: "2026-06-11T00:00:00.000Z", durationMs: 12, exitCode: 0 },
      adoptionDecision: "pending",
      proposedPatchTargets: ["outline/chapter-001.md"],
      acceptedPatchTargets: [],
      commitResult: { historyAppended: true, invocationAppended: true },
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    await fs.appendFile(path.join(tempRoot, slug, "tasks", "invocations.jsonl"), `${JSON.stringify(invocation)}\nnot-json\n`, "utf8");

    const response = await jsonFetch<{ invocations: Array<{ id: string; taskType: string; proposedPatchTargets: string[] }> }>(
      `/api/novel/projects/${slug}/tasks/invocations`
    );

    expect(response.status).toBe(200);
    expect(response.data.invocations).toEqual([
      expect.objectContaining({
        id: "invocation-1",
        taskType: "chapter.plan",
        proposedPatchTargets: ["outline/chapter-001.md"]
      })
    ]);
  });

  it("returns a story graph projection for a project", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Graph Route Demo", roughIdea: "Project story state into a graph." })
    });

    const response = await jsonFetch<{ graph: { projectSlug: string; nodes: Array<{ type: string }>; edges: unknown[] } }>(
      `/api/novel/projects/${created.data.project.slug}/story-graph`
    );

    expect(response.status).toBe(200);
    expect(response.data.graph.projectSlug).toBe("graph-route-demo");
    expect(response.data.graph.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ type: "chapter" })]));
    expect(response.data.graph.edges).toEqual(expect.any(Array));
  });

  it("reads and rebuilds a project knowledge index", async () => {
    const created = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Knowledge Route Demo", roughIdea: "Expose searchable project memory." })
    });
    const slug = created.data.project.slug;
    const summary = {
      chapterId: "chapter-001",
      summary: "The sealed gate responds to blood.",
      keyEvents: ["The talisman burns."],
      newFacts: [
        {
          id: "fact-gate",
          chapterId: "chapter-001",
          fact: "The gate responds to blood.",
          relatedEntities: ["Hero"],
          status: "accepted",
          createdAt: "2026-06-11T00:00:00.000Z",
          updatedAt: "2026-06-11T00:00:00.000Z"
        }
      ],
      characterStateChanges: [],
      foreshadowingUpdates: [],
      continuityRisks: [],
      powerProgressionUpdates: [],
      acceptedRecapIds: [],
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    await jsonFetch(`/api/novel/projects/${slug}/memory/chapter-summaries/chapter-001`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary })
    });

    const before = await jsonFetch<{ index: { facts: unknown[]; chapterIndex: { chapters: unknown[] } } }>(
      `/api/novel/projects/${slug}/knowledge/index`
    );
    const rebuilt = await jsonFetch<{
      index: { facts: Array<{ id: string }>; triples: unknown[]; chapterIndex: { keywords: Record<string, string[]> } };
    }>(`/api/novel/projects/${slug}/knowledge/index/rebuild`, { method: "POST" });
    const searched = await jsonFetch<{
      result: {
        query: string;
        facts: Array<{ id: string; score: number }>;
        chapters: Array<{ chapterId: string; score: number }>;
      };
    }>(`/api/novel/projects/${slug}/knowledge/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Hero blood gate", chapterId: "chapter-001" })
    });

    expect(before.status).toBe(200);
    expect(before.data.index.facts).toEqual([]);
    expect(before.data.index.chapterIndex.chapters).toEqual([]);
    expect(rebuilt.status).toBe(200);
    expect(rebuilt.data.index.facts).toEqual(expect.arrayContaining([expect.objectContaining({ id: "fact:fact-gate" })]));
    expect(rebuilt.data.index.triples).toEqual(expect.any(Array));
    expect(rebuilt.data.index.chapterIndex.keywords.blood).toContain("chapter-001");
    expect(searched.status).toBe(200);
    expect(searched.data.result.facts).toEqual(expect.arrayContaining([expect.objectContaining({ id: "fact:fact-gate" })]));
    expect(searched.data.result.chapters[0]).toEqual(expect.objectContaining({ chapterId: "chapter-001" }));
  });

  it("keeps duplicate project titles in separate folders", async () => {
    const body = JSON.stringify({
      title: "Demo Novel",
      genre: "fantasy",
      roughIdea: "A cautious apprentice finds a sealed room."
    });

    const first = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });
    const second = await jsonFetch<{ project: { slug: string } }>("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });

    expect(first.data.project.slug).toBe("demo-novel");
    expect(second.data.project.slug).toBe("demo-novel-2");
    await expect(fs.readFile(path.join(tempRoot, "demo-novel", "project.json"), "utf8")).resolves.toContain("Demo Novel");
    await expect(fs.readFile(path.join(tempRoot, "demo-novel-2", "project.json"), "utf8")).resolves.toContain("Demo Novel");
  });

  it("saves project AI profile and model without accepting command input", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Agent Demo",
        genre: "fantasy",
        roughIdea: "A configurable writing agent."
      })
    });

    const updated = await jsonFetch<{ project: { ai: { profileId: string; modelId: string }; codex: { command: string } } }>(
      "/api/novel/projects/agent-demo/ai",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: "claude-code", modelId: "claude-future-1.2", command: "malicious-command" })
      }
    );
    const projectJson = JSON.parse(await fs.readFile(path.join(tempRoot, "agent-demo", "project.json"), "utf8"));

    expect(updated.data.project.ai).toEqual({ profileId: "claude-code", modelId: "claude-future-1.2" });
    expect(updated.data.project.codex.command).not.toBe("malicious-command");
    expect(projectJson.codex.command).not.toBe("malicious-command");

    const rejected = await jsonFetch<{ error: string }>("/api/novel/projects/agent-demo/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: "unknown-agent", modelId: "sonnet" })
    });
    expect(rejected.status).toBe(400);
    expect(rejected.data.error).toContain("Unsupported AI agent profile");

    const invalidModel = await jsonFetch<{ error: string }>("/api/novel/projects/agent-demo/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: "codex-cli", modelId: "gpt-5.5 && run" })
    });
    expect(invalidModel.status).toBe(400);
    expect(invalidModel.data.error).toContain("Model id can only contain");
  });

  it("saves global AI configuration by creative scenario", async () => {
    const current = await jsonFetch<{
      config: {
        defaultScenario: string;
        scenarios: { novel: { profileId: string; modelId?: string } };
      };
    }>("/api/platform/ai-config");

    expect(current.data.config.defaultScenario).toBe("novel");
    expect(current.data.config.scenarios.novel.profileId).toBe("codex-cli");

    const nextConfig = {
      ...current.data.config,
      scenarios: {
        ...current.data.config.scenarios,
        novel: { profileId: "claude-code", modelId: "sonnet" }
      }
    };
    const saved = await jsonFetch<{
      config: {
        scenarios: { novel: { profileId: string; modelId: string } };
      };
    }>("/api/platform/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: nextConfig })
    });

    expect(saved.data.config.scenarios.novel).toEqual({ profileId: "claude-code", modelId: "sonnet" });

    const rejected = await jsonFetch<{ error: string }>("/api/platform/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          ...nextConfig,
          scenarios: {
            ...nextConfig.scenarios,
            novel: { profileId: "codex-cli", modelId: "gpt-5.5 && run" }
          }
        }
      })
    });

    expect(rejected.status).toBe(400);
    expect(rejected.data.error).toContain("Model id can only contain");
  });

  it("seeds the platform library and links shared assets across projects", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Project One", roughIdea: "First project." })
    });
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Project Two", roughIdea: "Second project." })
    });

    const library = await jsonFetch<{ library: { prompts: Array<{ id: string; title: string }>; roles: Array<{ id: string }> } }>(
      "/api/platform/library"
    );
    expect(library.data.library.prompts.map((prompt) => prompt.id)).toContain("prompt-novel-outline");
    expect(library.data.library.prompts.find((prompt) => prompt.id === "prompt-novel-outline")?.title).toBe(
      "长篇小说大纲"
    );
    expect(library.data.library.roles.map((role) => role.id)).toContain("role-storyboard-director");

    const createdAsset = await jsonFetch<{ asset: { id: string; linkedProjects: string[] } }>("/api/platform/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Shared Sword", type: "prop", projectSlug: "project-one" })
    });
    expect(createdAsset.status).toBe(201);
    expect(createdAsset.data.asset.linkedProjects).toEqual(["project-one"]);

    const linkedAsset = await jsonFetch<{ asset: { linkedProjects: string[] } }>(
      `/api/platform/assets/${createdAsset.data.asset.id}/link`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug: "project-two" })
      }
    );
    expect(linkedAsset.data.asset.linkedProjects).toEqual(["project-one", "project-two"]);

    const relations = await jsonFetch<{ linkedAssets: Array<{ name: string }> }>("/api/novel/projects/project-two/relations");
    expect(relations.data.linkedAssets).toEqual([expect.objectContaining({ name: "Shared Sword" })]);
  });

  it("imports a local folder into a managed novel project", async () => {
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "novel-import-source-"));
    await fs.writeFile(path.join(sourceRoot, "chapter-01.md"), "# First Gate\n\nThe draft opens here.", "utf8");
    await fs.writeFile(path.join(sourceRoot, "outline.md"), "# Volume Outline\n\nA grounded escalation.", "utf8");
    await fs.writeFile(path.join(sourceRoot, "characters.md"), "# Characters\n\n- Lin: careful.", "utf8");

    const imported = await jsonFetch<{ project: { slug: string; chapters: Array<{ contentPath: string; title: string }> } }>(
      "/api/novel/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: sourceRoot, title: "Imported Demo", genre: "fantasy" })
      }
    );

    expect(imported.status).toBe(201);
    expect(imported.data.project.slug).toBe("imported-demo");
    expect(imported.data.project.chapters).toHaveLength(1);
    expect(imported.data.project.chapters[0].title).toBe("First Gate");

    const chapter = await jsonFetch<{ content: string }>(
      `/api/novel/projects/imported-demo/files/${imported.data.project.chapters[0].contentPath}`
    );
    const outline = await jsonFetch<{ content: string }>("/api/novel/projects/imported-demo/files/outline/volume-01.md");

    expect(chapter.data.content).toContain("The draft opens here.");
    expect(outline.data.content).toContain("A grounded escalation.");

    await fs.rm(sourceRoot, { recursive: true, force: true });
  });

  it("imports browser selected directory files into a managed novel project", async () => {
    const imported = await jsonFetch<{ project: { slug: string; chapters: Array<{ contentPath: string; title: string }> } }>(
      "/api/novel/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: "uploaded-story",
          title: "Uploaded Story",
          genre: "fantasy",
          files: [
            {
              relativePath: "uploaded-story/03-chapters/chapter-001.md",
              content: "# Uploaded Gate\n\nThe uploaded draft opens here."
            },
            {
              relativePath: "uploaded-story/02-outline/outline.md",
              content: "# Uploaded Outline\n\nA browser selected outline."
            }
          ]
        })
      }
    );

    expect(imported.status).toBe(201);
    expect(imported.data.project.slug).toBe("uploaded-story");
    expect(imported.data.project.chapters).toHaveLength(1);
    expect(imported.data.project.chapters[0].title).toBe("Uploaded Gate");

    const chapter = await jsonFetch<{ content: string }>(
      `/api/novel/projects/uploaded-story/files/${imported.data.project.chapters[0].contentPath}`
    );
    const outline = await jsonFetch<{ content: string }>("/api/novel/projects/uploaded-story/files/outline/volume-01.md");

    expect(chapter.data.content).toContain("The uploaded draft opens here.");
    expect(outline.data.content).toContain("A browser selected outline.");
  });

  it("reads and saves writing cockpit dashboard, scenes, and ledger entries", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Cockpit Demo", roughIdea: "Build a faster writing desk." })
    });

    const dashboardBefore = await jsonFetch<{ dashboard: { chapterId: string; status: string; wordCount: number } }>(
      "/api/novel/projects/cockpit-demo/dashboard/chapter-001"
    );
    expect(dashboardBefore.data.dashboard).toMatchObject({
      chapterId: "chapter-001",
      status: "empty",
      wordCount: 0
    });

    const dashboardAfter = await jsonFetch<{ dashboard: { chapterId: string; goal: string; wordCount: number } }>(
      "/api/novel/projects/cockpit-demo/dashboard/chapter-001",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboard: {
            chapterId: "../unsafe",
            goal: "Make the choice unavoidable.",
            pov: "Hero",
            mainConflict: "Stay hidden or act.",
            endingHook: "The seal answers.",
            wordCount: 1200,
            status: "drafting",
            unresolvedForeshadowingIds: [],
            continuityRiskIds: [],
            updatedAt: "2026-06-04T00:00:00.000Z"
          }
        })
      }
    );
    expect(dashboardAfter.data.dashboard).toMatchObject({
      chapterId: "chapter-001",
      goal: "Make the choice unavoidable.",
      wordCount: 1200
    });

    const scenesAfter = await jsonFetch<{ scenes: Array<{ chapterId: string; id: string; order: number }> }>(
      "/api/novel/projects/cockpit-demo/scenes/chapter-001",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenes: [
            {
              id: "scene-late",
              chapterId: "wrong",
              order: 9,
              title: "Late turn",
              time: "night",
              location: "Gate",
              pov: "Hero",
              characters: ["Hero"],
              conflict: "Lose the clue.",
              turn: "The clue moves.",
              informationReleased: [],
              foreshadowingIds: [],
              powerProgression: "",
              updatedAt: "2026-06-04T00:00:00.000Z"
            },
            {
              id: "scene-early",
              chapterId: "wrong",
              order: 2,
              title: "Early pressure",
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
          ]
        })
      }
    );
    expect(scenesAfter.data.scenes.map((scene) => [scene.id, scene.chapterId, scene.order])).toEqual([
      ["scene-early", "chapter-001", 1],
      ["scene-late", "chapter-001", 2]
    ]);

    const ledgerAfter = await jsonFetch<{ entries: Array<{ id: string; kind: string }> }>(
      "/api/novel/projects/cockpit-demo/ledger/risk",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              id: "risk-1",
              kind: "continuity",
              title: "Information boundary",
              status: "open",
              severity: "medium",
              chapterIds: ["chapter-001"],
              relatedEntities: ["Hero"],
              note: "Avoid omniscient labels.",
              updatedAt: "2026-06-04T00:00:00.000Z"
            }
          ]
        })
      }
    );
    expect(ledgerAfter.data.entries).toEqual([expect.objectContaining({ id: "risk-1", kind: "risk" })]);

    const invalidLedger = await jsonFetch<{ error: string }>("/api/novel/projects/cockpit-demo/ledger/unknown");
    expect(invalidLedger.status).toBe(400);
    expect(invalidLedger.data.error).toContain("Unsupported ledger kind");
  });

  it("reads, saves, and accepts chapter memory recap patches", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Memory Demo", roughIdea: "Make chapter memory explicit." })
    });

    const summaryBefore = await jsonFetch<{ summary: { chapterId: string; summary: string; keyEvents: string[] } }>(
      "/api/novel/projects/memory-demo/memory/chapter-summaries/chapter-001"
    );
    expect(summaryBefore.data.summary).toMatchObject({
      chapterId: "chapter-001",
      summary: "",
      keyEvents: []
    });

    const summaryAfter = await jsonFetch<{ summary: { chapterId: string; summary: string; keyEvents: string[] } }>(
      "/api/novel/projects/memory-demo/memory/chapter-summaries/chapter-001",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: {
            chapterId: "../unsafe",
            summary: "The seal has a price.",
            keyEvents: ["The hero bleeds."],
            newFacts: [],
            characterStateChanges: [],
            foreshadowingUpdates: [],
            continuityRisks: [],
            powerProgressionUpdates: [],
            acceptedRecapIds: [],
            updatedAt: "2026-06-10T00:00:00.000Z"
          }
        })
      }
    );
    expect(summaryAfter.data.summary).toMatchObject({
      chapterId: "chapter-001",
      summary: "The seal has a price.",
      keyEvents: ["The hero bleeds."]
    });

    const qualityBefore = await jsonFetch<{ report: null }>("/api/novel/projects/memory-demo/quality/chapter-001");
    expect(qualityBefore.data.report).toBeNull();

    const qualityAfter = await jsonFetch<{ report: { chapterId: string; overallScore: number; metrics: unknown[] } }>(
      "/api/novel/projects/memory-demo/quality/chapter-001",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: {
            chapterId: "../unsafe",
            overallScore: 82,
            summary: "The chapter has readable pressure.",
            metrics: [{ key: "conflict", label: "Conflict", score: 82, note: "Clear enough." }],
            strengths: ["Clear pressure"],
            fixes: ["Sharpen the hook"],
            updatedAt: "2026-06-11T00:00:00.000Z"
          }
        })
      }
    );
    expect(qualityAfter.data.report).toMatchObject({
      chapterId: "chapter-001",
      overallScore: 82,
      metrics: [expect.objectContaining({ key: "conflict", score: 82 })]
    });

    const accepted = await jsonFetch<{ summary: { chapterId: string; summary: string; keyEvents: string[] } }>(
      "/api/novel/projects/memory-demo/recaps/accept",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recap: {
            chapterId: "chapter-001",
            summary: "The protagonist pays a cost.",
            newFacts: [],
            characterStateChanges: [],
            foreshadowingUpdates: [],
            continuityRisks: [],
            powerProgressionUpdates: [],
            createdAt: "2026-06-10T00:00:00.000Z",
            summaryPatch: {
              summary: "The protagonist pays a cost.",
              keyEvents: ["The seal weakens."]
            },
            ledgerPatches: [
              {
                id: "foreshadowing-memory-1",
                kind: "foreshadowing",
                title: "Blood price",
                status: "open",
                severity: "medium",
                chapterIds: ["chapter-001"],
                relatedEntities: ["Hero"],
                note: "The price should echo later.",
                updatedAt: "2026-06-10T00:00:00.000Z"
              }
            ]
          }
        })
      }
    );
    expect(accepted.data.summary).toMatchObject({
      chapterId: "chapter-001",
      summary: "The protagonist pays a cost.",
      keyEvents: ["The seal weakens."]
    });

    const ledger = await jsonFetch<{ entries: Array<{ id: string; kind: string }> }>(
      "/api/novel/projects/memory-demo/ledger/foreshadowing"
    );
    expect(ledger.data.entries).toEqual([
      expect.objectContaining({ id: "foreshadowing-memory-1", kind: "foreshadowing" })
    ]);
  });

  it("rejects unsafe paths and protected project metadata writes", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Safety Demo", roughIdea: "Validate guarded file writes." })
    });

    const unsafe = await jsonFetch<{ error: string }>("/api/novel/projects/safety-demo/files/%2e%2e%5csecret.md");
    expect(unsafe.status).toBe(400);
    expect(unsafe.data.error).toContain("Unsafe file path");

    const metadataSave = await jsonFetch<{ error: string }>("/api/novel/projects/safety-demo/files/project.json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "{}" })
    });
    expect(metadataSave.status).toBe(403);
    expect(metadataSave.data.error).toContain("Protected project metadata");

    const metadataPatch = await jsonFetch<{ error: string }>("/api/novel/projects/safety-demo/patches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patches: [{ target: "project.json", mode: "replace-file", content: "{}" }]
      })
    });
    expect(metadataPatch.status).toBe(403);
    expect(metadataPatch.data.error).toContain("Protected project metadata");
  });

  it("applies replace-selection patches only inside the project", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Patch Demo", roughIdea: "Patch a local draft." })
    });
    await jsonFetch("/api/novel/projects/patch-demo/files/chapters/chapter-001.md", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "before plain line after" })
    });

    const patched = await jsonFetch<{ applied: number }>("/api/novel/projects/patch-demo/patches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patches: [
          {
            target: "chapters/chapter-001.md",
            mode: "replace-selection",
            content: "sharper line",
            selection: { start: 7, end: 17 }
          }
        ]
      })
    });
    const readAfter = await jsonFetch<{ content: string }>("/api/novel/projects/patch-demo/files/chapters/chapter-001.md");

    expect(patched.data.applied).toBe(1);
    expect(readAfter.data.content).toBe("before sharper line after");
  });

  it("rejects unsupported task types before invoking Codex", async () => {
    await jsonFetch("/api/novel/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Task Demo", roughIdea: "Task validation." })
    });

    const response = await jsonFetch<{ error: string }>("/api/novel/projects/task-demo/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "unknown.task", payload: {} })
    });

    expect(response.status).toBe(400);
    expect(response.data.error).toContain("Unsupported task type");
  });
});
