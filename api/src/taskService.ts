import fs from "node:fs/promises";
import path from "node:path";
import type {
  AiInvocationContextSnapshot,
  AiInvocationContextTier,
  AiInvocationSession,
  CodexTaskType,
  CodexTaskResult,
  NovelFilePatch,
  NovelTask
} from "./types.js";
import { resolveAgentProfile } from "./agentConfig.js";
import { readPlatformAiConfig } from "./platformAiConfig.js";
import { buildTaskPrompt } from "./taskTemplates.js";
import { parseCodexResult } from "./resultParser.js";
import { assembleContext } from "./contextAssembler.js";
import { readProject, projectRoot, writeProject } from "./novelProject.js";
import { assertSafeNovelPath, resolveInside } from "./pathSafety.js";
import { AgentProcessRunner, type ProcessRunner, type ProcessRunOptions } from "./codexRunner.js";
import { stageKeyForTask } from "./aiStages.js";

interface ActiveNovelTask {
  controller: AbortController;
  task: NovelTask;
  root: string;
}

interface NovelTaskRunOptions extends ProcessRunOptions {
  task?: NovelTask;
  appendInitialHistory?: boolean;
}

const activeNovelTasks = new Map<string, ActiveNovelTask>();

function taskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function invocationId(): string {
  return `invocation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function appendHistory(root: string, task: NovelTask): Promise<void> {
  const historyPath = resolveInside(root, "tasks/history.jsonl");
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.appendFile(historyPath, `${JSON.stringify(task)}\n`, "utf8");
}

function defaultTaskTimeoutMs(): number {
  const configured = Number(process.env.AI_TASK_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 600_000;
}

function taskSortTime(task: NovelTask): number {
  return Date.parse(task.finishedAt || task.cancelRequestedAt || task.startedAt || "") || 0;
}

function isTerminalTask(task: NovelTask): boolean {
  return task.status === "success" || task.status === "error" || task.status === "cancelled";
}

function isActiveTaskForRoot(root: string, task: NovelTask): boolean {
  const active = activeNovelTasks.get(task.id);
  return Boolean(active && active.task.projectId === task.projectId && path.resolve(active.root) === path.resolve(root));
}

function staleRunningTask(task: NovelTask): NovelTask {
  const finishedAt = new Date().toISOString();
  return {
    ...task,
    status: "error",
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(task.startedAt),
    outputSummary: "AI task stopped before completion.",
    error: "AI task was left running by a previous API process and cannot be recovered."
  };
}

function latestTaskRecords(tasks: NovelTask[]): NovelTask[] {
  const byId = new Map<string, NovelTask>();
  for (const task of tasks) {
    const current = byId.get(task.id);
    if (!current || taskSortTime(task) >= taskSortTime(current)) {
      byId.set(task.id, task);
    }
  }
  return [...byId.values()].sort((left, right) => taskSortTime(right) - taskSortTime(left));
}

export async function readTaskHistory(root: string, options: { reconcileStaleRunning?: boolean } = {}): Promise<NovelTask[]> {
  const historyPath = resolveInside(root, "tasks/history.jsonl");
  let content = "";
  try {
    content = await fs.readFile(historyPath, "utf8");
  } catch {
    return [];
  }

  const tasks = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as NovelTask;
      } catch {
        return null;
      }
    })
    .filter((task): task is NovelTask => Boolean(task?.id && task.type && task.status));
  const latestTasks = latestTaskRecords(tasks);
  if (options.reconcileStaleRunning === false) {
    return latestTasks;
  }

  const staleTasks = latestTasks
    .filter((task) => task.status === "running" && !isActiveTaskForRoot(root, task))
    .map(staleRunningTask);
  for (const task of staleTasks) {
    await appendHistory(root, task);
  }

  return staleTasks.length ? latestTaskRecords([...latestTasks, ...staleTasks]) : latestTasks;
}

export async function readNovelTask(root: string, taskId: string): Promise<NovelTask | null> {
  const active = activeNovelTasks.get(taskId);
  if (active) return { ...active.task };
  return (await readTaskHistory(root)).find((task) => task.id === taskId) || null;
}

async function appendInvocationSession(root: string, session: AiInvocationSession): Promise<void> {
  const invocationPath = resolveInside(root, "tasks/invocations.jsonl");
  await fs.mkdir(path.dirname(invocationPath), { recursive: true });
  await fs.appendFile(invocationPath, `${JSON.stringify(session)}\n`, "utf8");
}

async function readInvocationLines(root: string): Promise<string[]> {
  const invocationPath = resolveInside(root, "tasks/invocations.jsonl");
  try {
    const content = await fs.readFile(invocationPath, "utf8");
    return content.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

export async function readInvocationSessions(root: string): Promise<AiInvocationSession[]> {
  return (await readInvocationLines(root))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as AiInvocationSession;
      } catch {
        return null;
      }
    })
    .filter((session): session is AiInvocationSession => Boolean(session?.id && session.taskId && session.taskType))
    .sort((left, right) => Date.parse(right.attempt.startedAt || right.createdAt) - Date.parse(left.attempt.startedAt || left.createdAt));
}

export async function markInvocationPatchesAccepted(
  root: string,
  taskId: string,
  acceptedPatchTargets: string[]
): Promise<{ updated: boolean; invocationId?: string }> {
  const invocationPath = resolveInside(root, "tasks/invocations.jsonl");
  const lines = await readInvocationLines(root);
  if (!lines.length) return { updated: false };

  let updated = false;
  let invocationId = "";
  const updatedAt = new Date().toISOString();
  const nextLines = lines.map((line) => {
    try {
      const session = JSON.parse(line) as AiInvocationSession;
      if (!session?.id || session.taskId !== taskId) {
        return line;
      }
      updated = true;
      invocationId = session.id;
      return JSON.stringify({
        ...session,
        adoptionDecision: acceptedPatchTargets.length ? "accepted" : session.adoptionDecision,
        adoptionUpdatedAt: updatedAt,
        acceptedPatchTargets,
        updatedAt
      } satisfies AiInvocationSession);
    } catch {
      return line;
    }
  });

  if (!updated) return { updated: false };
  await fs.mkdir(path.dirname(invocationPath), { recursive: true });
  await fs.writeFile(invocationPath, `${nextLines.join("\n")}\n`, "utf8");
  return { updated: true, invocationId };
}

function previewText(input: string, limit = 240): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function promptVersionForTask(type: CodexTaskType): string {
  return `task-template:${type}:v2`;
}

function promptSnapshot(prompt: string, contextBlocks: Array<{ title: string; content: string }>) {
  return {
    length: prompt.length,
    preview: previewText(prompt),
    contextTitles: contextBlocks.map((block) => block.title)
  };
}

interface ContextBudgetBlockPlan {
  title: string;
  tier?: AiInvocationContextTier;
  truncated?: boolean;
}

function contextBudgetPlan(contextBlocks: Array<{ title: string; content: string }>): Map<string, ContextBudgetBlockPlan> {
  const budgetBlock = contextBlocks.find((block) => block.title === "上下文预算日志");
  if (!budgetBlock) return new Map();
  try {
    const parsed = JSON.parse(budgetBlock.content) as { blockPlan?: ContextBudgetBlockPlan[] };
    return new Map((parsed.blockPlan || []).filter((block) => block.title).map((block) => [block.title, block]));
  } catch {
    return new Map();
  }
}

function contextSnapshot(contextBlocks: Array<{ title: string; content: string }>) {
  const budgetPlan = contextBudgetPlan(contextBlocks);
  const tierCounts: Partial<Record<AiInvocationContextTier, number>> = {};
  const truncatedBlocks: string[] = [];
  const blocks = contextBlocks.map((block) => {
    const plan = budgetPlan.get(block.title);
    if (plan?.tier) {
      tierCounts[plan.tier] = (tierCounts[plan.tier] || 0) + 1;
    }
    if (plan?.truncated) {
      truncatedBlocks.push(block.title);
    }
    return {
      title: block.title,
      length: block.content.length,
      tier: plan?.tier,
      truncated: plan?.truncated
    };
  });
  return {
    blockCount: contextBlocks.length,
    totalChars: contextBlocks.reduce((total, block) => total + block.content.length, 0),
    blocks,
    tierCounts,
    truncatedBlocks
  };
}

function variablePlan(payload: Record<string, unknown>, context: AiInvocationContextSnapshot) {
  const payloadKeys = Object.keys(payload).sort();
  const target =
    typeof payload.chapterId === "string"
      ? payload.chapterId
      : typeof payload.filePath === "string"
        ? payload.filePath
        : typeof payload.target === "string"
          ? payload.target
          : undefined;
  return {
    payloadKeys,
    target,
    contextTierCounts: context.tierCounts
  };
}

function preCallReview(prompt: string, context: AiInvocationContextSnapshot) {
  const warnings: string[] = [];
  if (!context.blockCount) warnings.push("missing-context");
  if (!context.tierCounts?.T0) warnings.push("missing-critical-context");
  if (prompt.length > 120_000) warnings.push("prompt-over-120k");
  if ((context.truncatedBlocks || []).length > 3) warnings.push("multiple-context-blocks-truncated");
  return {
    status: warnings.length ? ("warn" as const) : ("pass" as const),
    warnings,
    reviewedAt: new Date().toISOString()
  };
}

function createInvocationSession(task: NovelTask): AiInvocationSession {
  return {
    id: invocationId(),
    taskId: task.id,
    projectId: task.projectId,
    taskType: task.type,
    stageKey: stageKeyForTask(task.type),
    status: "running",
    promptSnapshot: {
      length: 0,
      preview: "",
      contextTitles: []
    },
    contextSnapshot: {
      blockCount: 0,
      totalChars: 0,
      blocks: []
    },
    attempt: {
      index: 1,
      startedAt: task.startedAt
    },
    adoptionDecision: "pending",
    proposedPatchTargets: [],
    acceptedPatchTargets: [],
    commitResult: {
      historyAppended: false,
      invocationAppended: false
    },
    createdAt: task.startedAt,
    updatedAt: task.startedAt
  };
}

export async function applyPatch(root: string, patch: NovelFilePatch): Promise<void> {
  const safeTarget = assertSafeNovelPath(patch.target);
  if (safeTarget === "project.json") {
    throw new Error("Protected project metadata cannot be patched");
  }

  const target = resolveInside(root, safeTarget);
  if (patch.mode === "replace-file") {
    await fs.writeFile(target, patch.content, "utf8");
    return;
  }

  if (patch.mode === "replace-selection") {
    if (!patch.selection) {
      throw new Error("replace-selection patch requires selection");
    }
    const original = await fs.readFile(target, "utf8");
    const next = `${original.slice(0, patch.selection.start)}${patch.content}${original.slice(patch.selection.end)}`;
    await fs.writeFile(target, next, "utf8");
  }
}

export async function runNovelTask(
  projectId: string,
  type: CodexTaskType,
  payload: Record<string, unknown>,
  runner: ProcessRunner = new AgentProcessRunner(),
  options: NovelTaskRunOptions = {}
): Promise<NovelTask> {
  const project = await readProject(projectId);
  const root = projectRoot(project.slug);
  const started = Date.now();
  const task: NovelTask =
    options.task ||
    {
      id: taskId(),
      type,
      status: "running",
      projectId: project.slug,
      inputSummary: JSON.stringify(payload).slice(0, 500),
      payload,
      startedAt: new Date(started).toISOString(),
      timeoutMs: options.timeoutMs || defaultTaskTimeoutMs()
    };
  task.payload = task.payload || payload;
  task.timeoutMs = task.timeoutMs || options.timeoutMs || defaultTaskTimeoutMs();
  const invocation = createInvocationSession(task);
  if (options.appendInitialHistory) {
    await appendHistory(root, task);
  }

  try {
    const contextBlocks = await assembleContext(type, root, project, payload);
    const prompt = buildTaskPrompt(type, {
      projectTitle: project.title,
      target: String(payload.chapterId || payload.filePath || ""),
      authorInput: String(payload.roughIdea || payload.feedback || ""),
      contextBlocks,
      payload
    });
    invocation.promptSnapshot = promptSnapshot(prompt, contextBlocks);
    invocation.contextSnapshot = contextSnapshot(contextBlocks);
    invocation.promptVersion = promptVersionForTask(type);
    invocation.variablePlan = variablePlan(payload, invocation.contextSnapshot);
    invocation.preCallReview = preCallReview(prompt, invocation.contextSnapshot);
    const platformAiConfig = await readPlatformAiConfig();
    const novelAiConfig = platformAiConfig.scenarios.novel;
    const profileId = typeof payload.agentProfileId === "string" ? payload.agentProfileId : novelAiConfig.profileId || project.ai?.profileId;
    const payloadModel = typeof payload.modelId === "string" ? payload.modelId : undefined;
    const config = resolveAgentProfile({
      profileId,
      modelId: payloadModel || novelAiConfig.modelId || project.ai?.modelId || project.codex.model
    });
    invocation.agentProfileId = config.id;
    invocation.agentProvider = config.provider;
    invocation.modelId = config.model;
    const output = await runner.run(prompt, root, config, { signal: options.signal, timeoutMs: task.timeoutMs });
    const result = parseCodexResult(output.finalMessage);
    if (output.cancelled || options.signal?.aborted) {
      task.status = "cancelled";
      task.cancelRequestedAt = task.cancelRequestedAt || new Date().toISOString();
      task.outputSummary = "AI task cancelled.";
      task.error = output.stderr || "AI task cancelled.";
    } else {
      task.status = output.exitCode === 0 && !output.timedOut ? "success" : "error";
      task.outputSummary = result.summary;
      task.error = output.exitCode === 0 && !output.timedOut ? undefined : output.stderr || `${config.label} exited with ${output.exitCode}`;
    }
    task.result = result;
    task.durationMs = output.durationMs;
    invocation.attempt.exitCode = output.exitCode;
    invocation.proposedPatchTargets = result.patches.map((patch) => patch.target);
    invocation.adoptionDecision = task.status === "cancelled" ? "not-required" : result.patches.length ? "pending" : "not-required";
  } catch (error) {
    if (options.signal?.aborted) {
      task.status = "cancelled";
      task.cancelRequestedAt = task.cancelRequestedAt || new Date().toISOString();
      task.error = "AI task cancelled.";
      task.outputSummary = "AI task cancelled.";
    } else {
      task.status = "error";
      task.error = error instanceof Error ? error.message : String(error);
    }
    task.durationMs = Date.now() - started;
  } finally {
    task.finishedAt = new Date().toISOString();
    invocation.status = task.status;
    invocation.updatedAt = task.finishedAt;
    invocation.attempt.finishedAt = task.finishedAt;
    invocation.attempt.durationMs = task.durationMs;
    if (task.error) {
      invocation.attempt.error = task.error;
    }
    await appendHistory(root, task);
    invocation.commitResult.historyAppended = true;
    invocation.commitResult.invocationAppended = true;
    await appendInvocationSession(root, invocation);
  }

  project.updatedAt = new Date().toISOString();
  await writeProject(project);
  return task;
}

export async function startNovelTaskAsync(
  projectId: string,
  type: CodexTaskType,
  payload: Record<string, unknown>,
  runner: ProcessRunner = new AgentProcessRunner()
): Promise<NovelTask> {
  const project = await readProject(projectId);
  const root = projectRoot(project.slug);
  const startedAt = new Date().toISOString();
  const task: NovelTask = {
    id: taskId(),
    type,
    status: "running",
    projectId: project.slug,
    inputSummary: JSON.stringify(payload).slice(0, 500),
    payload,
    startedAt,
    timeoutMs: defaultTaskTimeoutMs()
  };
  const controller = new AbortController();
  activeNovelTasks.set(task.id, { controller, task, root });
  await appendHistory(root, task);

  setTimeout(() => {
    void runNovelTask(project.slug, type, payload, runner, { task, signal: controller.signal, timeoutMs: task.timeoutMs })
      .catch(async (error) => {
        task.status = controller.signal.aborted ? "cancelled" : "error";
        task.error = error instanceof Error ? error.message : String(error);
        task.finishedAt = new Date().toISOString();
        task.durationMs = Date.parse(task.finishedAt) - Date.parse(task.startedAt);
        await appendHistory(root, task);
      })
      .finally(() => {
        activeNovelTasks.delete(task.id);
      });
  }, 0);

  return { ...task };
}

export async function cancelNovelTask(projectId: string, id: string): Promise<NovelTask | null> {
  const project = await readProject(projectId);
  const root = projectRoot(project.slug);
  const active = activeNovelTasks.get(id);
  if (active && active.task.projectId === project.slug) {
    const timestamp = new Date().toISOString();
    active.task.cancelRequestedAt = active.task.cancelRequestedAt || timestamp;
    active.task.outputSummary = "Cancellation requested.";
    active.controller.abort();
    await appendHistory(root, active.task);
    return { ...active.task };
  }

  const task = (await readTaskHistory(root, { reconcileStaleRunning: false })).find((item) => item.id === id) || null;
  if (!task) return null;
  if (isTerminalTask(task)) {
    return task;
  }

  const timestamp = new Date().toISOString();
  const cancelledTask: NovelTask = {
    ...task,
    status: "cancelled",
    cancelRequestedAt: task.cancelRequestedAt || timestamp,
    finishedAt: timestamp,
    durationMs: Date.parse(timestamp) - Date.parse(task.startedAt),
    outputSummary: "Cancelled because the task is no longer active.",
    error: "AI task was not active in this API process."
  };
  await appendHistory(root, cancelledTask);
  return cancelledTask;
}

export function fallbackProjectCreateResult(title: string): CodexTaskResult {
  return {
    summary: "已创建基础小说项目骨架",
    content: "项目已创建。可以继续生成故事圣经、大纲和第一章章纲。",
    changes: [`创建项目：${title}`],
    risks: ["尚未调用 Codex 生成完整设定，请在工作台中继续生成大纲或补充故事圣经。"],
    questions: [],
    patches: []
  };
}
