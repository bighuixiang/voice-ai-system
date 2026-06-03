import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import fs from "node:fs/promises";
import { checkCodexAvailability } from "./codexConfig.js";
import { assertSafeNovelPath, resolveInside } from "./pathSafety.js";
import {
  createProjectFiles,
  createUniqueProjectSkeleton,
  importLocalProject,
  projectRoot,
  readProject,
  writeProject
} from "./novelProject.js";
import { getNovelsRoot } from "./workspace.js";
import { createPlatformAsset, linkAssetToProject, readPlatformLibrary } from "./platformLibrary.js";
import { applyPatch, fallbackProjectCreateResult, runNovelTask } from "./taskService.js";
import type { CodexTaskType, NovelFilePatch } from "./types.js";
import { databaseInfo, listProjectRecords, upsertProjectRecord } from "./database.js";

const taskTypes: CodexTaskType[] = [
  "project.create",
  "outline.generate",
  "chapter.plan",
  "chapter.draft",
  "selection.polish",
  "continuity.check",
  "idea.suggest",
  "assistant.free"
];

const protectedWritePaths = new Set(["project.json"]);

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function isProtectedWritePath(relativePath: string): boolean {
  return protectedWritePaths.has(relativePath);
}

function allowedOrigins(): Set<string> {
  const configured = process.env.NOVEL_API_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173";
  return new Set(
    configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    message.includes("Protected project metadata")
      ? 403
      : message.includes("Origin is not allowed")
        ? 403
      : message.includes("Unsafe file path") || message.includes("escapes project root")
        ? 400
        : 500;

  res.status(status).json({ error: message });
};

export function createApp() {
  const app = express();
  const origins = allowedOrigins();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || origins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin is not allowed: ${origin}`));
      }
    })
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", asyncRoute(async (_req, res) => {
    res.json({ status: "healthy", service: "novel-codex-api", codex: await checkCodexAvailability() });
  }));

  app.get("/api/novel/codex", asyncRoute(async (_req, res) => {
    res.json(await checkCodexAvailability());
  }));

  app.get("/api/platform/library", asyncRoute(async (_req, res) => {
    res.json({ library: await readPlatformLibrary() });
  }));

  app.get("/api/platform/database", asyncRoute(async (_req, res) => {
    const projects = listProjectRecords();
    const library = await readPlatformLibrary();
    res.json({
      database: {
        ...databaseInfo(),
        engine: "node:sqlite",
        projectCount: projects.length,
        assetCount: library.assets.length,
        promptCount: library.prompts.length,
        roleCount: library.roles.length,
        skillCount: library.skills.length
      }
    });
  }));

  app.post("/api/platform/assets", asyncRoute(async (req, res) => {
    const asset = await createPlatformAsset(req.body || {});
    res.status(201).json({ asset });
  }));

  app.post("/api/platform/assets/:assetId/link", asyncRoute(async (req, res) => {
    const projectSlug = String(req.body.projectSlug || "").trim();
    if (!projectSlug) {
      res.status(400).json({ error: "projectSlug is required" });
      return;
    }

    res.json({ asset: await linkAssetToProject(req.params.assetId, projectSlug) });
  }));

  app.get("/api/novel/projects", asyncRoute(async (_req, res) => {
    await fs.mkdir(getNovelsRoot(), { recursive: true });
    const entries = await fs.readdir(getNovelsRoot(), { withFileTypes: true });
    const projects = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      try {
        const project = await readProject(entry.name);
        upsertProjectRecord(project, projectRoot(project.slug));
        projects.push(project);
      } catch {
        // Ignore folders that are not novel projects.
      }
    }
    res.json({ projects });
  }));

  app.post("/api/novel/projects", asyncRoute(async (req, res) => {
    const project = await createUniqueProjectSkeleton({
      title: req.body.title,
      genre: req.body.genre,
      roughIdea: req.body.roughIdea || ""
    });
    await createProjectFiles(project);
    res.status(201).json({ project, result: fallbackProjectCreateResult(project.title) });
  }));

  app.post("/api/novel/import", asyncRoute(async (req, res) => {
    const project = await importLocalProject({
      sourcePath: req.body.sourcePath,
      title: req.body.title,
      genre: req.body.genre,
      roughIdea: req.body.roughIdea
    });
    res.status(201).json({ project });
  }));

  app.get("/api/novel/projects/:projectId", asyncRoute(async (req, res) => {
    res.json({ project: await readProject(req.params.projectId) });
  }));

  app.get("/api/novel/projects/:projectId/files", asyncRoute(async (req, res) => {
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
  }));

  app.get("/api/novel/projects/:projectId/relations", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const library = await readPlatformLibrary();
    const root = projectRoot(project.slug);
    const assetLinksRaw = await fs
      .readFile(resolveInside(root, "relations/asset-links.json"), "utf8")
      .catch(() => JSON.stringify({ projectSlug: project.slug, links: [] }));
    const storyAssetMap = await fs.readFile(resolveInside(root, "relations/story-asset-map.md"), "utf8").catch(() => "");
    const linkedAssets = library.assets.filter((asset) => asset.linkedProjects.includes(project.slug));

    res.json({
      projectSlug: project.slug,
      assetLinks: JSON.parse(assetLinksRaw),
      storyAssetMap,
      linkedAssets
    });
  }));

  app.get("/api/novel/projects/:projectId/files/*", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const wildcardParams = req.params as Record<string, string>;
    const relativePath = assertSafeNovelPath(wildcardParams[0]);
    const content = await fs.readFile(resolveInside(projectRoot(project.slug), relativePath), "utf8");
    res.json({ path: relativePath, content });
  }));

  app.put("/api/novel/projects/:projectId/files/*", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const wildcardParams = req.params as Record<string, string>;
    const relativePath = assertSafeNovelPath(wildcardParams[0]);
    if (isProtectedWritePath(relativePath)) {
      res.status(403).json({ error: "Protected project metadata cannot be edited through file saves" });
      return;
    }

    await fs.writeFile(resolveInside(projectRoot(project.slug), relativePath), String(req.body.content || ""), "utf8");
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    res.json({ path: relativePath, saved: true });
  }));

  app.post("/api/novel/projects/:projectId/tasks", asyncRoute(async (req, res) => {
    const type = req.body.type as CodexTaskType;
    if (!taskTypes.includes(type)) {
      res.status(400).json({ error: `Unsupported task type: ${type}` });
      return;
    }
    res.json({ task: await runNovelTask(req.params.projectId, type, req.body.payload || {}) });
  }));

  app.post("/api/novel/projects/:projectId/selection/polish", asyncRoute(async (req, res) => {
    res.json({
      task: await runNovelTask(req.params.projectId, "selection.polish", {
        selection: req.body
      })
    });
  }));

  app.post("/api/novel/projects/:projectId/continuity/check", asyncRoute(async (req, res) => {
    res.json({ task: await runNovelTask(req.params.projectId, "continuity.check", req.body || {}) });
  }));

  app.post("/api/novel/projects/:projectId/patches", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const patches = (req.body.patches || []) as NovelFilePatch[];
    for (const patch of patches) {
      await applyPatch(projectRoot(project.slug), patch);
    }
    res.json({ applied: patches.length });
  }));

  app.use(errorHandler);

  return app;
}
