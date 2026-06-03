import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import { checkCodexAvailability } from "./codexConfig.js";
import { assertSafeNovelPath, resolveInside } from "./pathSafety.js";
import { createProjectFiles, createProjectSkeleton, projectRoot, readProject, writeProject } from "./novelProject.js";
import { getNovelsRoot } from "./workspace.js";
import { applyPatch, fallbackProjectCreateResult, runNovelTask } from "./taskService.js";
import type { CodexTaskType, NovelFilePatch } from "./types.js";

const taskTypes: CodexTaskType[] = [
  "project.create",
  "outline.generate",
  "chapter.plan",
  "chapter.draft",
  "selection.polish",
  "continuity.check",
  "idea.suggest"
];

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", async (_req, res) => {
    res.json({ status: "healthy", service: "novel-codex-api", codex: await checkCodexAvailability() });
  });

  app.get("/api/novel/codex", async (_req, res) => {
    res.json(await checkCodexAvailability());
  });

  app.get("/api/novel/projects", async (_req, res) => {
    await fs.mkdir(getNovelsRoot(), { recursive: true });
    const entries = await fs.readdir(getNovelsRoot(), { withFileTypes: true });
    const projects = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      try {
        projects.push(await readProject(entry.name));
      } catch {
        // Ignore folders that are not novel projects.
      }
    }
    res.json({ projects });
  });

  app.post("/api/novel/projects", async (req, res) => {
    const project = createProjectSkeleton({
      title: req.body.title,
      genre: req.body.genre,
      roughIdea: req.body.roughIdea || ""
    });
    await createProjectFiles(project);
    res.status(201).json({ project, result: fallbackProjectCreateResult(project.title) });
  });

  app.get("/api/novel/projects/:projectId", async (req, res) => {
    res.json({ project: await readProject(req.params.projectId) });
  });

  app.get("/api/novel/projects/:projectId/files", async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const files = [
      "project.json",
      "style/style-guide.md",
      "bible/characters.md",
      "bible/world.md",
      "bible/power-system.md",
      "bible/locations.md",
      "outline/volume-01.md",
      "ledger/foreshadowing.md",
      "ledger/continuity.md",
      "ledger/power-progression.md",
      ...project.chapters.flatMap((chapter) => [chapter.outlinePath, chapter.contentPath])
    ];
    res.json({ files, root });
  });

  app.get("/api/novel/projects/:projectId/files/*", async (req, res) => {
    const project = await readProject(req.params.projectId);
    const wildcardParams = req.params as Record<string, string>;
    const relativePath = assertSafeNovelPath(wildcardParams[0]);
    const content = await fs.readFile(resolveInside(projectRoot(project.slug), relativePath), "utf8");
    res.json({ path: relativePath, content });
  });

  app.put("/api/novel/projects/:projectId/files/*", async (req, res) => {
    const project = await readProject(req.params.projectId);
    const wildcardParams = req.params as Record<string, string>;
    const relativePath = assertSafeNovelPath(wildcardParams[0]);
    await fs.writeFile(resolveInside(projectRoot(project.slug), relativePath), String(req.body.content || ""), "utf8");
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    res.json({ path: relativePath, saved: true });
  });

  app.post("/api/novel/projects/:projectId/tasks", async (req, res) => {
    const type = req.body.type as CodexTaskType;
    if (!taskTypes.includes(type)) {
      res.status(400).json({ error: `Unsupported task type: ${type}` });
      return;
    }
    res.json({ task: await runNovelTask(req.params.projectId, type, req.body.payload || {}) });
  });

  app.post("/api/novel/projects/:projectId/selection/polish", async (req, res) => {
    res.json({
      task: await runNovelTask(req.params.projectId, "selection.polish", {
        selection: req.body
      })
    });
  });

  app.post("/api/novel/projects/:projectId/continuity/check", async (req, res) => {
    res.json({ task: await runNovelTask(req.params.projectId, "continuity.check", req.body || {}) });
  });

  app.post("/api/novel/projects/:projectId/patches", async (req, res) => {
    const project = await readProject(req.params.projectId);
    const patches = (req.body.patches || []) as NovelFilePatch[];
    for (const patch of patches) {
      await applyPatch(projectRoot(project.slug), patch);
    }
    res.json({ applied: patches.length });
  });

  return app;
}
