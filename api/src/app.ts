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
import {
  applyPatch,
  cancelNovelTask,
  fallbackProjectCreateResult,
  markInvocationPatchesAccepted,
  readInvocationSessions,
  readNovelTask,
  readTaskHistory,
  runNovelTask,
  startNovelTaskAsync
} from "./taskService.js";
import { aiStageDefinitions } from "./aiStages.js";
import { buildStoryGraphProjection } from "./storyGraph.js";
import { readKnowledgeIndex, rebuildKnowledgeIndex, searchKnowledgeIndex } from "./knowledgeIndex.js";
import { buildCreationRuntimeSnapshot } from "./runtimeSnapshot.js";
import { buildProjectAuditReport } from "./auditReport.js";
import { cancelBackgroundJob, enqueueProjectBackgroundJob, listProjectBackgroundJobs, readBackgroundJob, retryBackgroundJob } from "./backgroundJobs.js";
import {
  buildEditorSuggestion,
  createWritingFileSnapshot,
  listWritingFileVersions,
  readWritingFileDiff
} from "./fileVersions.js";
import type {
  AiScenarioConfig,
  BackgroundJobType,
  CodexTaskType,
  EditorSuggestion,
  EditorSuggestionRequest,
  KnowledgeSearchQuery,
  LedgerEntry,
  NovelFilePatch,
  NovelProject,
  NovelTask,
  PlatformAiConfig
} from "./types.js";
import { databaseInfo, listProjectRecords, upsertProjectRecord } from "./database.js";
import {
  appendRuntimeEvent,
  createRuntimeBranch,
  createRuntimeRun,
  enqueueRuntimeCommand,
  getRuntimeBranch,
  getRuntimeCheckpoint,
  getRuntimeRun,
  latestActiveRun,
  listRuntimeEvents,
  runtimeStatus,
  updateRuntimeBranch,
  updateRuntimeRun
} from "./runtimeStore.js";
import { createRuntimeCheckpoint, dispatchRuntimeWrites, restoreRuntimeCheckpoint, RuntimeWriteConflictError } from "./runtimeFiles.js";
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
  "quality.review",
  "selection.polish",
  "quality.rewrite",
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

function parseTaskInputSummary(task: NovelTask): Record<string, unknown> {
  if (task.payload && typeof task.payload === "object") {
    return task.payload;
  }
  try {
    const parsed = JSON.parse(task.inputSummary);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeQualityRewritePatches(task: NovelTask | null, patches: NovelFilePatch[]): NovelFilePatch[] {
  if (task?.type !== "quality.rewrite") return patches;

  for (const patch of patches) {
    assertSafeNovelPath(patch.target);
  }
  for (const patch of task.result?.patches || []) {
    assertSafeNovelPath(patch.target);
  }

  const input = parseTaskInputSummary(task);
  const target = typeof input.filePath === "string" ? assertSafeNovelPath(input.filePath.trim()) : "";
  const documentKind = typeof input.documentKind === "string" ? input.documentKind : "";
  if (!target || documentKind !== "content") {
    throw new Error("Quality rewrite task is missing a current chapter content target");
  }

  const requestTargetPatch = patches.find(
    (patch) => assertSafeNovelPath(patch.target) === target && patch.mode === "replace-file" && Boolean(patch.content.trim())
  );
  const requestReplacementPatch = patches.find((patch) => patch.mode === "replace-file" && Boolean(patch.content.trim()));
  const resultTargetPatch = task.result?.patches.find(
    (patch) => assertSafeNovelPath(patch.target) === target && patch.mode === "replace-file" && Boolean(patch.content.trim())
  );
  const resultReplacementPatch = task.result?.patches.find((patch) => patch.mode === "replace-file" && Boolean(patch.content.trim()));
  const replacementContent =
    requestTargetPatch?.content ||
    resultTargetPatch?.content ||
    (task.result?.content.trim() ? task.result.content : "") ||
    requestReplacementPatch?.content ||
    resultReplacementPatch?.content ||
    "";

  if (!replacementContent.trim()) {
    throw new Error("Quality rewrite task has no full-chapter replacement content");
  }

  return [
    {
      target,
      mode: "replace-file",
      content: replacementContent
    }
  ];
}

async function createPatchSnapshotBeforeApply(root: string, project: NovelProject, patch: NovelFilePatch): Promise<void> {
  const safeTarget = assertSafeNovelPath(patch.target);
  if (isProtectedWritePath(safeTarget)) return;

  const target = resolveInside(root, safeTarget);
  const original = await fs.readFile(target, "utf8").catch(() => "");
  const nextContent =
    patch.mode === "replace-file"
      ? patch.content
      : patch.selection
        ? `${original.slice(0, patch.selection.start)}${patch.content}${original.slice(patch.selection.end)}`
        : original;

  await createWritingFileSnapshot(root, project, safeTarget, nextContent, {
    source: "ai",
    reason: "apply-patch"
  });
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

function createBackgroundJobHandler(project: Awaited<ReturnType<typeof readProject>>, root: string, type: BackgroundJobType) {
  return async () => {
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

    return asyncStoryGraphJob(project, root);
  };
}

async function asyncStoryGraphJob(project: Awaited<ReturnType<typeof readProject>>, root: string) {
  const graph = await buildStoryGraphProjection(root, project);
  return {
    outputSummary: `${graph.nodes.length} nodes / ${graph.edges.length} relations`,
    resultRef: `/api/novel/projects/${project.slug}/story-graph`
  };
}

function aiEditorSuggestionEnabled(): boolean {
  const mode = String(process.env.EDITOR_SUGGESTION_PROVIDER || "").trim().toLowerCase();
  return mode === "ai" || mode === "true" || mode === "1";
}

function compactEditorSuggestionText(text: string): string {
  return text
    .replace(/^```(?:\w+)?/g, "")
    .replace(/```$/g, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n")
    .slice(0, 360);
}

async function buildAiBackedEditorSuggestion(
  projectId: string,
  input: EditorSuggestionRequest,
  fallback: EditorSuggestion
): Promise<EditorSuggestion> {
  if (!aiEditorSuggestionEnabled()) return fallback;

  try {
    const task = await runNovelTask(projectId, "assistant.free", {
      mode: "editor.inline-suggestion",
      chapterId: input.chapterId,
      filePath: input.filePath,
      documentKind: input.documentKind,
      beforeText: input.beforeText,
      afterText: input.afterText,
      roughIdea: [
        "为 Monaco Editor inline suggestion 生成一条可直接 Tab 接受的中文续写 ghost text。",
        "只在 CodexTaskResult.content 中放建议文本，不要解释，不要 Markdown，不要改写已有上下文。",
        "建议应短，最多三行；接受后只进入编辑器 dirty buffer，由作者自行保存。"
      ].join("\n")
    });
    const text = compactEditorSuggestionText(task.result?.content || "");
    if (task.status !== "success" || !text.trim()) return fallback;
    return {
      id: `editor-suggestion-${task.id}`,
      text,
      summary: task.result?.summary || "AI inline suggestion",
      source: "ai",
      createdAt: task.finishedAt || new Date().toISOString()
    };
  } catch {
    return fallback;
  }
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : String(error);
  let status = 500;
  if (message.includes("Protected project metadata") || message.includes("Origin is not allowed")) {
    status = 403;
  } else if (message.includes("Project not found")) {
    status = 404;
  } else if (
    message.includes("Unsafe file path") ||
    message.includes("escapes project root") ||
    message.includes("Quality rewrite task")
  ) {
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

  app.post("/api/novel/projects/:projectId/runtime/start", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const chapterId = typeof req.body.chapterId === "string" ? req.body.chapterId : undefined;
    const run = createRuntimeRun({
      projectSlug: project.slug,
      chapterId,
      branchId: typeof req.body.branchId === "string" ? req.body.branchId : undefined,
      payload: req.body || {}
    });
    const command = enqueueRuntimeCommand({
      projectSlug: project.slug,
      runId: run.id,
      type: "start",
      payload: req.body || {},
      idempotencyKey: typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey : undefined
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: run.id,
      type: "command",
      message: "Runtime start queued",
      payload: { commandId: command.id, chapterId }
    });
    res.status(202).json({ run, command });
  }));

  app.get("/api/novel/projects/:projectId/runtime/status", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ status: runtimeStatus(project.slug) });
  }));

  app.get("/api/novel/projects/:projectId/runtime/events", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write("retry: 2000\n\n");
    let lastId = Number(req.query.after || req.header("last-event-id") || 0) || 0;
    const send = () => {
      const events = listRuntimeEvents(project.slug, lastId, 50);
      for (const event of events) {
        lastId = event.id;
        res.write(`id: ${event.id}\n`);
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };
    send();
    const interval = setInterval(send, 1500);
    req.on("close", () => {
      clearInterval(interval);
      res.end();
    });
  }));

  function resolveRuntimeRunForControl(projectSlug: string, input: Record<string, unknown>) {
    const runId = typeof input.runId === "string" ? input.runId : undefined;
    return runId ? getRuntimeRun(runId) : latestActiveRun(projectSlug);
  }

  async function enqueueRuntimeControl(projectId: string, type: "pause" | "resume" | "stop" | "rewrite" | "accept" | "direction", body: Record<string, unknown>) {
    const project = await readProject(projectId);
    const run = resolveRuntimeRunForControl(project.slug, body);
    if (!run) {
      throw new Error("Runtime run not found");
    }
    if (type === "pause") {
      updateRuntimeRun(run.id, { status: "paused" });
    } else if (type === "stop") {
      updateRuntimeRun(run.id, { status: "cancelled", finishedAt: new Date().toISOString() });
    } else if (type === "resume" || type === "rewrite") {
      updateRuntimeRun(run.id, { status: "queued", error: undefined, finishedAt: undefined });
    } else if (type === "accept") {
      updateRuntimeRun(run.id, { status: "completed", finishedAt: new Date().toISOString() });
    }
    const command = enqueueRuntimeCommand({
      projectSlug: project.slug,
      runId: run.id,
      type,
      payload: body || {}
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: run.id,
      type: "command",
      message: `Runtime ${type} queued`,
      payload: { commandId: command.id }
    });
    return { run: getRuntimeRun(run.id), command };
  }

  app.post("/api/novel/projects/:projectId/runtime/pause", asyncRoute(async (req, res) => {
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "pause", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/resume", asyncRoute(async (req, res) => {
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "resume", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/stop", asyncRoute(async (req, res) => {
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "stop", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/review/accept", asyncRoute(async (req, res) => {
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "accept", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/review/rewrite", asyncRoute(async (req, res) => {
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "rewrite", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/direction", asyncRoute(async (req, res) => {
    res.status(202).json(await enqueueRuntimeControl(req.params.projectId, "direction", req.body || {}));
  }));

  app.post("/api/novel/projects/:projectId/runtime/derivatives", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const branch = createRuntimeBranch({
      projectSlug: project.slug,
      baseRunId: typeof req.body.baseRunId === "string" ? req.body.baseRunId : undefined,
      sourceChapterId: typeof req.body.sourceChapterId === "string" ? req.body.sourceChapterId : undefined,
      type: req.body.type === "adaptation" || req.body.type === "branch" ? req.body.type : "side_story",
      title: String(req.body.title || "Derivative branch"),
      payload: req.body || {}
    });
    const run = createRuntimeRun({
      projectSlug: project.slug,
      chapterId: branch.sourceChapterId,
      branchId: branch.id,
      command: "derivative",
      payload: { ...req.body, branchId: branch.id, mode: "derivative" }
    });
    const command = enqueueRuntimeCommand({
      projectSlug: project.slug,
      runId: run.id,
      type: "derivative",
      payload: { ...req.body, branchId: branch.id }
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: run.id,
      type: "system",
      message: "Derivative branch queued",
      payload: { branchId: branch.id, commandId: command.id }
    });
    res.status(202).json({ branch, run, command });
  }));

  app.post("/api/novel/projects/:projectId/runtime/derivatives/:branchId/merge", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    const branch = getRuntimeBranch(req.params.branchId);
    if (!branch || branch.projectSlug !== project.slug) {
      res.status(404).json({ error: "Runtime branch not found" });
      return;
    }
    const mode = req.body.mode === "replace_source_chapter" ? "replace_source_chapter" : "new_chapter";
    const draftPath = typeof branch.payload.draftPath === "string" ? branch.payload.draftPath : "";
    let draftContent = typeof req.body.draftContent === "string" ? req.body.draftContent : "";
    if (!draftContent && draftPath) {
      draftContent = await fs.readFile(resolveInside(root, assertSafeNovelPath(draftPath)), "utf8");
    }
    if (!draftContent.trim()) {
      res.status(409).json({ error: "Runtime branch has no generated draft to merge", branch });
      return;
    }

    const mergedAt = new Date().toISOString();
    const sourceChapter = branch.sourceChapterId ? project.chapters.find((chapter) => chapter.id === branch.sourceChapterId) : undefined;
    if (mode === "replace_source_chapter" && !sourceChapter) {
      res.status(409).json({ error: "Replacing source chapter requires an existing sourceChapterId", branch });
      return;
    }
    const mergeRun = createRuntimeRun({
      projectSlug: project.slug,
      chapterId: sourceChapter?.id,
      branchId: branch.id,
      command: "accept",
      payload: { branchId: branch.id, mode, note: req.body.note }
    });
    updateRuntimeRun(mergeRun.id, { status: "running", currentStage: "checkpoint_before_run", startedAt: mergedAt });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: mergeRun.id,
      type: "command",
      stage: "checkpoint_before_run",
      message: "Derivative merge accepted by user",
      payload: { branchId: branch.id, mode }
    });
    const checkpoint = await createRuntimeCheckpoint({
      root,
      project,
      run: mergeRun,
      chapterId: sourceChapter?.id,
      label: `Before merging derivative ${branch.title}`
    });

    const nextProject = { ...project, chapters: project.chapters.map((chapter) => ({ ...chapter })) };
    let mergedChapterId = sourceChapter?.id || "";
    let contentPath = sourceChapter?.contentPath || "";
    let outlinePath = sourceChapter?.outlinePath || "";
    const writes: Array<{ relativePath: string; content: string; failIfExists?: boolean }> = [];
    if (mode === "replace_source_chapter" && sourceChapter) {
      const index = nextProject.chapters.findIndex((chapter) => chapter.id === sourceChapter.id);
      nextProject.chapters[index] = { ...nextProject.chapters[index], status: "drafted" };
      mergedChapterId = sourceChapter.id;
      contentPath = sourceChapter.contentPath;
      outlinePath = sourceChapter.outlinePath;
      writes.push({ relativePath: contentPath, content: draftContent.endsWith("\n") ? draftContent : `${draftContent}\n` });
    } else {
      const seed = branch.id.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 28) || String(Date.now());
      let chapterId = `derivative-${seed}`;
      let suffix = 2;
      while (nextProject.chapters.some((chapter) => chapter.id === chapterId)) {
        chapterId = `derivative-${seed}-${suffix}`;
        suffix += 1;
      }
      const sourceIndex = sourceChapter ? nextProject.chapters.findIndex((chapter) => chapter.id === sourceChapter.id) : -1;
      const maxOrder = nextProject.chapters.reduce((max, chapter, index) => Math.max(max, chapter.order ?? index + 1), 0);
      contentPath = `chapters/${chapterId}.md`;
      outlinePath = `outline/${chapterId}.md`;
      mergedChapterId = chapterId;
      const newChapter = {
        id: chapterId,
        title: branch.title,
        outlinePath,
        contentPath,
        status: "drafted" as const,
        order: maxOrder + 1,
        volumeId: sourceChapter?.volumeId,
        volumeTitle: sourceChapter?.volumeTitle,
        volumeOrder: sourceChapter?.volumeOrder
      };
      if (sourceIndex >= 0) nextProject.chapters.splice(sourceIndex + 1, 0, newChapter);
      else nextProject.chapters.push(newChapter);
      writes.push(
        {
          relativePath: outlinePath,
          failIfExists: true,
          content: [
            `# ${branch.title}`,
            "",
            `Merged from derivative branch: ${branch.id}`,
            `Source chapter: ${sourceChapter?.id || "none"}`,
            `Merge note: ${typeof req.body.note === "string" ? req.body.note : ""}`,
            ""
          ].join("\n")
        },
        { relativePath: contentPath, content: draftContent.endsWith("\n") ? draftContent : `${draftContent}\n`, failIfExists: true }
      );
    }

    nextProject.lastOpenedChapterId = mergedChapterId;
    nextProject.updatedAt = mergedAt;
    writes.push({ relativePath: "project.json", content: `${JSON.stringify(nextProject, null, 2)}\n` });
    try {
      updateRuntimeRun(mergeRun.id, { currentStage: "finalize_or_gate" });
      await dispatchRuntimeWrites({
        root,
        project,
        run: mergeRun,
        reason: "derivative_merge",
        checkpoint,
        allowProjectJson: true,
        writes
      });
    } catch (error) {
      if (error instanceof RuntimeWriteConflictError) {
        const reviewRun = updateRuntimeRun(mergeRun.id, {
          status: "review_required",
          result: {
            branchId: branch.id,
            reason: "runtime_write_conflict",
            path: error.relativePath,
            expectedSha256: error.expectedSha256,
            actualSha256: error.actualSha256
          },
          finishedAt: new Date().toISOString()
        });
        appendRuntimeEvent({
          projectSlug: project.slug,
          runId: mergeRun.id,
          type: "review",
          stage: "finalize_or_gate",
          message: "Derivative merge paused because target files changed after checkpoint",
          payload: { branchId: branch.id, path: error.relativePath }
        });
        res.status(409).json({ branch, run: reviewRun || mergeRun, merged: false, conflict: error.relativePath });
        return;
      }
      throw error;
    }
    upsertProjectRecord(nextProject, root);
    const updated = updateRuntimeBranch(branch.id, {
      status: "merged",
      payload: {
        ...branch.payload,
        mergeAcceptedAt: mergedAt,
        mergeNote: typeof req.body.note === "string" ? req.body.note : undefined,
        mergeMode: mode,
        mergedChapterId,
        contentPath,
        outlinePath,
        checkpointId: checkpoint.id,
        canonPolicy: "accepted_for_canon"
      }
    });
    const completedRun = updateRuntimeRun(mergeRun.id, {
      status: "completed",
      result: { branchId: branch.id, mergedChapterId, contentPath, outlinePath, checkpointId: checkpoint.id, mode },
      finishedAt: new Date().toISOString()
    });
    appendRuntimeEvent({
      projectSlug: project.slug,
      runId: mergeRun.id,
      type: "system",
      message: "Derivative branch accepted for canon merge",
      payload: { branchId: branch.id, mergedAt, mergedChapterId, contentPath, outlinePath, checkpointId: checkpoint.id, mode }
    });
    res.json({ branch: updated || branch, run: completedRun || mergeRun, merged: true, chapterId: mergedChapterId });
  }));

  app.get("/api/novel/projects/:projectId/runtime/checkpoints", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ checkpoints: runtimeStatus(project.slug).checkpoints });
  }));

  app.post("/api/novel/projects/:projectId/runtime/checkpoints/:checkpointId/restore", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const checkpoint = getRuntimeCheckpoint(req.params.checkpointId);
    if (!checkpoint || checkpoint.projectSlug !== project.slug) {
      res.status(404).json({ error: "Runtime checkpoint not found" });
      return;
    }
    await restoreRuntimeCheckpoint(projectRoot(project.slug), checkpoint);
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    res.json({ checkpoint, restored: true });
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
    const job = await enqueueProjectBackgroundJob(project, root, type, JSON.stringify(req.body.payload || {}).slice(0, 500), createBackgroundJobHandler(project, root, type));

    res.status(202).json({ job });
  }));

  app.post("/api/novel/projects/:projectId/jobs/:jobId/cancel", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const job = await cancelBackgroundJob(projectRoot(project.slug), project.slug, req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Background job not found" });
      return;
    }
    res.json({ job });
  }));

  app.post("/api/novel/projects/:projectId/jobs/:jobId/retry", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const root = projectRoot(project.slug);
    try {
      const job = await retryBackgroundJob(project, root, req.params.jobId, (failedJob) => createBackgroundJobHandler(project, root, failedJob.type));
      if (!job) {
        res.status(404).json({ error: "Background job not found" });
        return;
      }
      res.status(202).json({ job });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
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

  app.get("/api/novel/projects/:projectId/file-versions/*", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const wildcardParams = req.params as Record<string, string>;
    const relativePath = assertSafeNovelPath(wildcardParams[0]);
    res.json({ filePath: relativePath, versions: await listWritingFileVersions(projectRoot(project.slug), relativePath) });
  }));

  app.get("/api/novel/projects/:projectId/file-diff/*", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const wildcardParams = req.params as Record<string, string>;
    const relativePath = assertSafeNovelPath(wildcardParams[0]);
    const versionId = String(req.query.from || "").trim();
    if (!versionId) {
      res.status(400).json({ error: "from version id is required" });
      return;
    }
    res.json({ diff: await readWritingFileDiff(projectRoot(project.slug), relativePath, versionId) });
  }));

  app.post("/api/novel/projects/:projectId/editor/suggestion", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const input = (req.body || {}) as EditorSuggestionRequest;
    const filePath = assertSafeNovelPath(String(input.filePath || ""));
    const chapter = project.chapters.find((item) => item.id === input.chapterId || item.contentPath === filePath || item.outlinePath === filePath);
    if (!chapter) {
      res.status(400).json({ error: `Unknown chapter file: ${filePath}` });
      return;
    }
    const documentKind: EditorSuggestionRequest["documentKind"] = input.documentKind === "outline" ? "outline" : "content";
    const expectedPath = documentKind === "outline" ? chapter.outlinePath : chapter.contentPath;
    if (expectedPath !== filePath) {
      res.status(400).json({ error: `File does not match ${documentKind} for chapter ${chapter.id}` });
      return;
    }
    const suggestionInput: EditorSuggestionRequest = {
      ...input,
      filePath,
      chapterId: chapter.id,
      documentKind,
      beforeText: String(input.beforeText || "").slice(-1600),
      afterText: String(input.afterText || "").slice(0, 800),
      selectedText: typeof input.selectedText === "string" ? input.selectedText.slice(0, 800) : undefined
    };
    const fallback = buildEditorSuggestion(suggestionInput);
    res.json({ suggestion: await buildAiBackedEditorSuggestion(project.slug, suggestionInput, fallback) });
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

    const nextContent = String(req.body.content || "");
    const snapshot = await createWritingFileSnapshot(projectRoot(project.slug), project, relativePath, nextContent);
    await fs.writeFile(resolveInside(projectRoot(project.slug), relativePath), nextContent, "utf8");
    project.updatedAt = new Date().toISOString();
    await writeProject(project);
    res.json({ path: relativePath, saved: true, version: snapshot });
  }));

  app.post("/api/novel/projects/:projectId/tasks", asyncRoute(async (req, res) => {
    const type = req.body.type as CodexTaskType;
    if (!taskTypes.includes(type)) {
      res.status(400).json({ error: `Unsupported task type: ${type}` });
      return;
    }
    res.json({ task: await runNovelTask(req.params.projectId, type, req.body.payload || {}) });
  }));

  app.get("/api/novel/projects/:projectId/tasks", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    res.json({ tasks: await readTaskHistory(projectRoot(project.slug)) });
  }));

  app.post("/api/novel/projects/:projectId/tasks/async", asyncRoute(async (req, res) => {
    const type = req.body.type as CodexTaskType;
    if (!taskTypes.includes(type)) {
      res.status(400).json({ error: `Unsupported task type: ${type}` });
      return;
    }
    res.status(202).json({ task: await startNovelTaskAsync(req.params.projectId, type, req.body.payload || {}) });
  }));

  app.get("/api/novel/projects/:projectId/tasks/invocations", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const invocations = await readInvocationSessions(projectRoot(project.slug));
    res.json({ invocations });
  }));

  app.get("/api/novel/projects/:projectId/tasks/:taskId", asyncRoute(async (req, res) => {
    const project = await readProject(req.params.projectId);
    const task = await readNovelTask(projectRoot(project.slug), req.params.taskId);
    if (!task || task.projectId !== project.slug) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ task });
  }));

  app.post("/api/novel/projects/:projectId/tasks/:taskId/cancel", asyncRoute(async (req, res) => {
    const task = await cancelNovelTask(req.params.projectId, req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ task });
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
    const root = projectRoot(project.slug);
    const task = typeof req.body.taskId === "string" ? await readNovelTask(root, req.body.taskId) : null;
    const patches = normalizeQualityRewritePatches(task, (req.body.patches || []) as NovelFilePatch[]);
    for (const patch of patches) {
      await createPatchSnapshotBeforeApply(root, project, patch);
      await applyPatch(root, patch);
    }
    const acceptedTargets = patches.map((patch) => patch.target);
    const invocationUpdate =
      typeof req.body.taskId === "string"
        ? await markInvocationPatchesAccepted(root, req.body.taskId, acceptedTargets)
        : { updated: false };
    res.json({ applied: patches.length, invocationUpdated: invocationUpdate.updated, invocationId: invocationUpdate.invocationId });
  }));

  app.use(errorHandler);

  return app;
}
