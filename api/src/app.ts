import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import fs from "node:fs/promises";
import { checkCodexAvailability } from "./codexConfig.js";
import { checkAllAgentAvailability, checkAgentAvailability, listAgentProfiles, normalizeAgentModelId } from "./agentConfig.js";
import { assertSafeNovelPath, resolveInside } from "./pathSafety.js";
import {
  createProjectFiles,
  createUniqueProjectSkeleton,
  deleteProject,
  importLocalProject,
  importUploadedProject,
  projectRoot,
  readProject,
  writeProject
} from "./novelProject.js";
import { getNovelsRoot } from "./workspace.js";
import { aiScenarioKeys, mergePlatformAiConfig, publicPlatformAiConfig, readPlatformAiConfig, writePlatformAiConfig } from "./platformAiConfig.js";
import { createPlatformAsset, linkAssetToProject, readPlatformLibrary } from "./platformLibrary.js";
import { applyPatch, fallbackProjectCreateResult, markInvocationPatchesAccepted, readInvocationSessions, runNovelTask } from "./taskService.js";
import { aiStageDefinitions } from "./aiStages.js";
import { buildStoryGraphProjection } from "./storyGraph.js";
import { readKnowledgeIndex, rebuildKnowledgeIndex, searchKnowledgeIndex } from "./knowledgeIndex.js";
import { buildCreationRuntimeSnapshot } from "./runtimeSnapshot.js";
import { buildProjectAuditReport } from "./auditReport.js";
import { enqueueProjectBackgroundJob, listProjectBackgroundJobs, readBackgroundJob } from "./backgroundJobs.js";
import type { AiScenarioConfig, BackgroundJobType, CodexTaskType, KnowledgeSearchQuery, LedgerEntry, NovelFilePatch, PlatformAiConfig } from "./types.js";
import { databaseInfo, listProjectRecords, upsertProjectRecord } from "./database.js";
import {
  acceptWritingRecapPatches,
  buildSeriesQualityMetrics,
  readChapterDashboard,
  readChapterQualityReport,
  readChapterSummary,
  readLedgerEntries,
  readSceneCards,
  readSeriesQualityMetrics,
  readStoryControl,
  saveChapterDashboard,
  saveChapterQualityReport,
  saveChapterSummary,
  saveLedgerEntries,
  saveSceneCards,
  saveStoryControl
} from "./writingCockpit.js";

const taskTypes: CodexTaskType[] = [
  "project.create",
  "outline.generate",
  "structure.reverse",
  "chapter.plan",
  "chapter.draft",
  "selection.polish",
  "continuity.check",
  "idea.suggest",
  "writing.briefing",
  "writing.recap",
  "assistant.free"
];

const protectedWritePaths = new Set(["project.json"]);
const ledgerKinds = new Set<LedgerEntry["kind"]>(["foreshadowing", "continuity", "power", "character", "risk"]);
const backgroundJobTypes = new Set<BackgroundJobType>(["knowledge.index.rebuild", "quality.series.rebuild", "story.graph.rebuild"]);

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function isProtectedWritePath(relativePath: string): boolean {
  return protectedWritePaths.has(relativePath);
}

function isLedgerKind(kind: string): kind is LedgerEntry["kind"] {
  return ledgerKinds.has(kind as LedgerEntry["kind"]);
}

function isBackgroundJobType(type: string): type is BackgroundJobType {
  return backgroundJobTypes.has(type as BackgroundJobType);
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

function validateAiScenarioConfig(config: AiScenarioConfig): AiScenarioConfig {
  const profileId = String(config.profileId || "").trim();
  const profile = listAgentProfiles().find((item) => item.id === profileId);
  if (!profile) {
    throw new Error(`Unsupported AI agent profile: ${profileId}`);
  }

  const modelId = normalizeAgentModelId(typeof config.modelId === "string" ? config.modelId : undefined);
  if (modelId && !profile.allowCustomModel && !profile.models.some((model) => model.id === modelId)) {
    throw new Error(`Unsupported model for ${profile.label}: ${modelId}`);
  }

  return {
    profileId,
    modelId
  };
}

function validateEmbeddingBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = String(baseUrl || "").trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Embedding base URL must use http or https");
    }
    return trimmed.replace(/\/+$/, "");
  } catch {
    throw new Error("Embedding base URL must be a valid URL");
  }
}

function validatePlatformAiConfig(input: PlatformAiConfig): PlatformAiConfig {
  const rawProvider = String(input.knowledgeEmbedding?.provider || "local").trim();
  if (rawProvider !== "local" && rawProvider !== "openai-compatible") {
    throw new Error(`Unsupported knowledge embedding provider: ${rawProvider}`);
  }
  const merged = mergePlatformAiConfig(input);
  const scenarioKeys = aiScenarioKeys();
  return {
    version: 1,
    defaultScenario: scenarioKeys.includes(merged.defaultScenario) ? merged.defaultScenario : "novel",
    scenarios: scenarioKeys.reduce(
      (scenarios, key) => ({
        ...scenarios,
        [key]: validateAiScenarioConfig(merged.scenarios[key])
      }),
      {} as PlatformAiConfig["scenarios"]
    ),
    knowledgeEmbedding: {
      provider: rawProvider,
      baseUrl: validateEmbeddingBaseUrl(merged.knowledgeEmbedding.baseUrl),
      model: String(merged.knowledgeEmbedding.model || "").trim() || undefined,
      apiKey: typeof merged.knowledgeEmbedding.apiKey === "string" ? merged.knowledgeEmbedding.apiKey.trim() : undefined,
      apiKeyConfigured: Boolean(merged.knowledgeEmbedding.apiKey || merged.knowledgeEmbedding.apiKeyConfigured)
    },
    updatedAt: merged.updatedAt || new Date().toISOString()
  };
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : String(error);
  let status = 500;
  if (message.includes("Protected project metadata") || message.includes("Origin is not allowed")) {
    status = 403;
  } else if (message.includes("Project not found")) {
    status = 404;
  } else if (message.includes("Unsafe file path") || message.includes("escapes project root")) {
    status = 400;
  }

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
  app.use(express.json({ limit: "50mb" }));

  app.get("/health", asyncRoute(async (_req, res) => {
    res.json({ status: "healthy", service: "novel-codex-api", agents: await checkAllAgentAvailability() });
  }));

  app.get("/api/novel/codex", asyncRoute(async (_req, res) => {
    res.json(await checkCodexAvailability());
  }));

  app.get("/api/novel/agents", asyncRoute(async (_req, res) => {
    res.json({
      defaultProfileId: process.env.AI_AGENT_PROFILE_ID || "codex-cli",
      profiles: listAgentProfiles(),
      checks: await checkAllAgentAvailability()
    });
  }));

  app.get("/api/novel/ai-stages", asyncRoute(async (_req, res) => {
    res.json({ stages: aiStageDefinitions });
  }));

  app.post("/api/novel/agents/check", asyncRoute(async (req, res) => {
    res.json(await checkAgentAvailability({ profileId: req.body.profileId, modelId: req.body.modelId }));
  }));

  app.get("/api/platform/ai-config", asyncRoute(async (_req, res) => {
    res.json({ config: publicPlatformAiConfig(await readPlatformAiConfig()) });
  }));

  app.put("/api/platform/ai-config", asyncRoute(async (req, res) => {
    const input = (req.body.config || req.body) as PlatformAiConfig;
    try {
      const config = validatePlatformAiConfig(input);
      res.json({ config: publicPlatformAiConfig(await writePlatformAiConfig(config)) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
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
    const project = Array.isArray(req.body.files)
      ? await importUploadedProject({
          files: req.body.files,
          sourceLabel: req.body.sourcePath,
          title: req.body.title,
          genre: req.body.genre,
          roughIdea: req.body.roughIdea
        })
      : await importLocalProject({
          sourcePath: req.body.sourcePath,
          title: req.body.title,
          genre: req.body.genre,
          roughIdea: req.body.roughIdea
        });
    res.status(201).json({ project });
  }));

  app.delete("/api/novel/projects/:projectId", asyncRoute(async (req, res) => {
    const deletedSlug = await deleteProject(req.params.projectId);
    res.json({ deletedSlug });
  }));

  app.get("/api/novel/projects/:projectId", asyncRoute(async (req, res) => {
    res.json({ project: await readProject(req.params.projectId) });
  }));

  app.put("/api/novel/projects/:projectId/ai", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const profileId = String(req.body.profileId || "").trim();
    let modelId: string | undefined;
    try {
      modelId = normalizeAgentModelId(typeof req.body.modelId === "string" ? req.body.modelId : undefined);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const profile = listAgentProfiles().find((item) => item.id === profileId);
    if (!profile) {
      res.status(400).json({ error: `Unsupported AI agent profile: ${profileId}` });
      return;
    }
    if (modelId && !profile.allowCustomModel && !profile.models.some((model) => model.id === modelId)) {
      res.status(400).json({ error: `Unsupported model for ${profile.label}: ${modelId}` });
      return;
    }

    project.ai = {
      profileId,
      modelId
    };
    if (profile.provider === "codex") {
      project.codex.model = project.ai.modelId;
    }
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    res.json({ project });
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

  app.get("/api/novel/projects/:projectId/story-control", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const storyControl = await readStoryControl(projectRoot(project.slug));
    res.json({ storyControl });
  }));

  app.get("/api/novel/projects/:projectId/story-graph", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const graph = await buildStoryGraphProjection(projectRoot(project.slug), project);
    res.json({ graph });
  }));

  app.put("/api/novel/projects/:projectId/story-control", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const storyControl = await saveStoryControl(projectRoot(project.slug), req.body.storyControl || req.body || {});
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    res.json({ storyControl });
  }));

  app.get("/api/novel/projects/:projectId/dashboard/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const dashboard = await readChapterDashboard(projectRoot(project.slug), req.params.chapterId);
    res.json({ dashboard });
  }));

  app.get("/api/novel/projects/:projectId/runtime/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const snapshot = await buildCreationRuntimeSnapshot(projectRoot(project.slug), project, req.params.chapterId);
    res.json({ snapshot });
  }));

  app.put("/api/novel/projects/:projectId/dashboard/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const dashboardInput = req.body.dashboard || req.body || {};
    const dashboard = await saveChapterDashboard(projectRoot(project.slug), {
      ...dashboardInput,
      chapterId: req.params.chapterId
    });
    res.json({ dashboard });
  }));

  app.get("/api/novel/projects/:projectId/scenes/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const scenes = await readSceneCards(projectRoot(project.slug), req.params.chapterId);
    res.json({ scenes });
  }));

  app.put("/api/novel/projects/:projectId/scenes/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const scenesInput = Array.isArray(req.body.scenes) ? req.body.scenes : [];
    const scenes = await saveSceneCards(projectRoot(project.slug), req.params.chapterId, scenesInput);
    res.json({ scenes });
  }));

  app.get("/api/novel/projects/:projectId/memory/chapter-summaries/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const summary = await readChapterSummary(projectRoot(project.slug), req.params.chapterId);
    res.json({ summary });
  }));

  app.put("/api/novel/projects/:projectId/memory/chapter-summaries/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const summaryInput = req.body.summary || req.body || {};
    const summary = await saveChapterSummary(projectRoot(project.slug), {
      ...summaryInput,
      chapterId: req.params.chapterId
    });
    res.json({ summary });
  }));

  app.get("/api/novel/projects/:projectId/quality/series-metrics", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const seriesMetrics = await readSeriesQualityMetrics(projectRoot(project.slug), project);
    res.json({ seriesMetrics });
  }));

  app.get("/api/novel/projects/:projectId/quality/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const report = await readChapterQualityReport(projectRoot(project.slug), req.params.chapterId);
    res.json({ report });
  }));

  app.put("/api/novel/projects/:projectId/quality/:chapterId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const reportInput = req.body.report || req.body || {};
    const report = await saveChapterQualityReport(projectRoot(project.slug), {
      ...reportInput,
      chapterId: req.params.chapterId
    });
    const seriesMetrics = await buildSeriesQualityMetrics(projectRoot(project.slug), project);
    res.json({ report, seriesMetrics });
  }));

  app.post("/api/novel/projects/:projectId/recaps/accept", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const summary = await acceptWritingRecapPatches(projectRoot(project.slug), req.body.recap || req.body || {});
    res.json({ summary });
  }));

  app.get("/api/novel/projects/:projectId/knowledge/index", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const index = await readKnowledgeIndex(projectRoot(project.slug), project);
    res.json({ index });
  }));

  app.post("/api/novel/projects/:projectId/knowledge/index/rebuild", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const index = await rebuildKnowledgeIndex(projectRoot(project.slug), project);
    res.json({ index });
  }));

  app.post("/api/novel/projects/:projectId/knowledge/search", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const result = await searchKnowledgeIndex(projectRoot(project.slug), project, (req.body || {}) as KnowledgeSearchQuery);
    res.json({ result });
  }));

  app.get("/api/novel/projects/:projectId/jobs", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ jobs: await listProjectBackgroundJobs(projectRoot(project.slug), project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/jobs/:jobId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const job = await readBackgroundJob(projectRoot(project.slug), project.slug, req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Background job not found" });
      return;
    }
    res.json({ job });
  }));

  app.post("/api/novel/projects/:projectId/jobs", asyncRoute(async (req, res) => {
    const type = String(req.body.type || "");
    if (!isBackgroundJobType(type)) {
      res.status(400).json({ error: `Unsupported background job type: ${type}` });
      return;
    }

    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const job = await enqueueProjectBackgroundJob(project, root, type, JSON.stringify(req.body.payload || {}).slice(0, 500), async () => {
      if (type === "knowledge.index.rebuild") {
        const index = await rebuildKnowledgeIndex(root, project);
        return {
          outputSummary: `${index.facts.length} facts / ${index.triples.length} relations`,
          resultRef: `/api/novel/projects/${project.slug}/knowledge/index`
        };
      }
      if (type === "quality.series.rebuild") {
        const metrics = await buildSeriesQualityMetrics(root, project);
        return {
          outputSummary: `${metrics.reportCount}/${metrics.chapterCount} chapters reviewed, average ${metrics.averageOverallScore}`,
          resultRef: `/api/novel/projects/${project.slug}/quality/series-metrics`
        };
      }

      const graph = await buildStoryGraphProjection(root, project);
      return {
        outputSummary: `${graph.nodes.length} nodes / ${graph.edges.length} relations`,
        resultRef: `/api/novel/projects/${project.slug}/story-graph`
      };
    });

    res.status(202).json({ job });
  }));

  app.get("/api/novel/projects/:projectId/ledger/:kind", asyncRoute(async (req, res) => {
    if (!isLedgerKind(req.params.kind)) {
      res.status(400).json({ error: `Unsupported ledger kind: ${req.params.kind}` });
      return;
    }

    const project = await readProject(req.params.projectId);
    const entries = await readLedgerEntries(projectRoot(project.slug), req.params.kind);
    res.json({ entries });
  }));

  app.put("/api/novel/projects/:projectId/ledger/:kind", asyncRoute(async (req, res) => {
    if (!isLedgerKind(req.params.kind)) {
      res.status(400).json({ error: `Unsupported ledger kind: ${req.params.kind}` });
      return;
    }

    const project = await readProject(req.params.projectId);
    const entriesInput = Array.isArray(req.body.entries) ? req.body.entries : [];
    const entries = await saveLedgerEntries(projectRoot(project.slug), req.params.kind, entriesInput);
    res.json({ entries });
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

  app.get("/api/novel/projects/:projectId/tasks/invocations", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const invocations = await readInvocationSessions(projectRoot(project.slug));
    res.json({ invocations });
  }));

  app.get("/api/novel/projects/:projectId/audit-report", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const report = await buildProjectAuditReport(projectRoot(project.slug), project);
    res.json({ report });
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
    const acceptedTargets = patches.map((patch) => patch.target);
    const invocationUpdate =
      typeof req.body.taskId === "string"
        ? await markInvocationPatchesAccepted(projectRoot(project.slug), req.body.taskId, acceptedTargets)
        : { updated: false };
    res.json({ applied: patches.length, invocationUpdated: invocationUpdate.updated, invocationId: invocationUpdate.invocationId });
  }));

  app.use(errorHandler);

  return app;
}
