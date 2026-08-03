import crypto from "node:crypto";
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
import { assertModelInvocationAuthorityBinding, verifyModelInvocationAuthorityBinding, type ModelInvocationAuthorityBinding } from "./modelInvocationAuthority.js";
import { appendModelInvocation, createModelInvocationRecord, retryClassFor, type ModelInvocationRecord } from "./modelInvocationLedger.js";
import { assertModelInvocationBudget, estimateModelInvocationCostCents } from "./modelInvocationBudgetGate.js";
import { normalizeProviderMeasurement } from "./providerMeasurement.js";
import { consumeBudgetReservationAtomically, readBudgetReservation } from "./budgetReservation.js";
import { authorizeProviderAttempt, recordProviderFailure, recordProviderSuccess } from "./providerHealth.js";
import { evaluateProviderFailover, type ProviderFailoverCandidate } from "./providerFailover.js";
import { planNarrowRetry } from "./retryPolicy.js";
import { evaluateModelContextBudget } from "./modelContextBudget.js";
import { buildTaskContextPlan } from "./taskContextPlan.js";
import { buildTaskContextManifest, evaluateTaskContextManifestFreshness, persistTaskContextManifest, readTaskContextManifest } from "./taskContextManifest.js";
import { resolveTaskContextSources } from "./taskContextSources.js";
import { evaluateContextPrivacy } from "./contextPrivacyGate.js";
import { evaluateContextSources, type ContextAuthority, type ContextSourceResult } from "./contextSourceGate.js";
import { buildRetrievalEligibility } from "./taskContextRetrieval.js";
import { assertMemoryProjectionCanGenerate, evaluateMemoryProjectionFreshness } from "./memoryProjectionGate.js";

interface ActiveNovelTask {
  controller: AbortController;
  task: NovelTask;
  root: string;
  completion?: Promise<void>;
}

interface NovelTaskRunOptions extends ProcessRunOptions {
  task?: NovelTask;
  appendInitialHistory?: boolean;
}

const activeNovelTasks = new Map<string, ActiveNovelTask>();

async function runWithCurrentTaskContextManifest(
  root: string,
  manifestRef: string | undefined,
  run: () => ReturnType<ProcessRunner["run"]>
): Promise<Awaited<ReturnType<ProcessRunner["run"]>>> {
  if (!manifestRef) throw new Error("TASK_CONTEXT_MANIFEST_REQUIRED");
  const manifestId = path.basename(manifestRef, ".json");
  const manifest = await readTaskContextManifest(root, manifestId);
  if (!manifest) throw new Error("TASK_CONTEXT_MANIFEST_REQUIRED");
  if (manifest.status !== "pass" || manifest.blocks.some((block) => block.permission !== "model" || !block.selected)) throw new Error("TASK_CONTEXT_MANIFEST_BLOCKED");
  const freshness = await evaluateTaskContextManifestFreshness(root, manifest);
  if (freshness.status !== "current") throw new Error("TASK_CONTEXT_MANIFEST_STALE");
  assertMemoryProjectionCanGenerate(await evaluateMemoryProjectionFreshness(root));
  return run();
}

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
  if (active) {
    if (isTerminalTask(active.task) && active.completion) await active.completion;
    return { ...active.task };
  }
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

export function preCallReview(prompt: string, context: AiInvocationContextSnapshot) {
  const warnings: string[] = [];
  if (!context.blockCount) warnings.push("missing-context");
  if (!context.tierCounts?.T0) warnings.push("missing-critical-context");
  if (prompt.length > 120_000) warnings.push("prompt-over-120k");
  if ((context.truncatedBlocks || []).length > 3) warnings.push("multiple-context-blocks-truncated");
  const blockingWarnings = warnings.filter((warning) => ["missing-context", "missing-critical-context", "prompt-over-120k"].includes(warning));
  return {
    status: blockingWarnings.length ? ("block" as const) : warnings.length ? ("warn" as const) : ("pass" as const),
    warnings,
    reviewedAt: new Date().toISOString()
  };
}

function createInvocationSession(task: NovelTask, authority?: { bookRunId?: string; budgetReservationId?: string; authorityBinding?: ModelInvocationAuthorityBinding }): AiInvocationSession {
  return {
    id: invocationId(),
    taskId: task.id,
    projectId: task.projectId,
    taskType: task.type,
    stageKey: stageKeyForTask(task.type),
    status: "running",
    bookRunId: authority?.bookRunId,
    budgetReservationId: authority?.budgetReservationId,
    authorityBinding: authority?.authorityBinding,
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
    const { start, end } = patch.selection;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > original.length) {
      throw new Error(`Invalid patch selection range for ${safeTarget}`);
    }
    const next = `${original.slice(0, start)}${patch.content}${original.slice(end)}`;
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
  const bookRunId = typeof task.payload.bookRunId === "string" ? task.payload.bookRunId : undefined;
  let authorityBinding: ModelInvocationAuthorityBinding | undefined;
  if (bookRunId) {
    const candidate = task.payload.authorityBinding;
    if (!candidate) throw new Error("RUNTIME_MODEL_AUTHORITY_BINDING_REQUIRED");
    assertModelInvocationAuthorityBinding(candidate);
    authorityBinding = candidate;
    if (authorityBinding.bookRunId !== bookRunId) throw new Error("MODEL_INVOCATION_AUTHORITY_RUN_MISMATCH");
    await verifyModelInvocationAuthorityBinding(root, authorityBinding);
  }
  const estimatedCostCents = typeof task.payload.estimatedCostCents === "number" ? task.payload.estimatedCostCents : undefined;
  await assertModelInvocationBudget(root, { bookRunId, budgetReservationId: typeof task.payload.budgetReservationId === "string" ? task.payload.budgetReservationId : undefined, estimatedCostCents });
  const budgetReservationId = typeof task.payload.budgetReservationId === "string" ? task.payload.budgetReservationId : undefined;
  const invocation = createInvocationSession(task, { bookRunId, budgetReservationId, authorityBinding: bookRunId ? authorityBinding : undefined });
  if (options.appendInitialHistory) {
    await appendHistory(root, task);
  }

  let promptForLedger = "";
  let outputMessageForLedger = "";
  let nativeUsageForLedger: Awaited<ReturnType<ProcessRunner["run"]>>["usage"];
  let nativeCostForLedger: Awaited<ReturnType<ProcessRunner["run"]>>["cost"];
  let nativeModelVersionForLedger: string | undefined;
  let configForLedger: ReturnType<typeof resolveAgentProfile> | undefined;
  const taskFingerprint = crypto.createHash("sha256").update(JSON.stringify({ type, payload })).digest("hex");
  let primaryAttemptForLedger: {
    config: ReturnType<typeof resolveAgentProfile>;
    output: Awaited<ReturnType<ProcessRunner["run"]>>;
    error: string;
    finishedAt: string;
    retryChainId: string;
  } | undefined;
  const appendLedgerAttempt = async (input: {
    config: ReturnType<typeof resolveAgentProfile>;
    output: Awaited<ReturnType<ProcessRunner["run"]>>;
    status: ModelInvocationRecord["status"];
    error?: string;
    attempt: number;
    retryChainId?: string;
    finishedAt: string;
    adoptionDecision: string;
  }): Promise<ModelInvocationRecord> => {
    const measurement = normalizeProviderMeasurement({ output: { usage: input.output.usage, cost: input.output.cost, modelVersion: input.output.modelVersion }, promptChars: promptForLedger.length, outputChars: (input.output.finalMessage || input.output.stdout || "").length, explicitCostCents: estimatedCostCents });
    const record = createModelInvocationRecord({
      invocationId: input.attempt === 1 && !input.retryChainId ? invocation.id : `${invocation.id}-attempt-${input.attempt}`,
      ...(bookRunId ? { bookRunId, budgetReservationId: String(payload.budgetReservationId) } : {}),
      ...(bookRunId && authorityBinding ? { authorityBinding } : {}),
      taskId: task.id,
      taskFingerprint,
      attemptId: `${task.id}-attempt-${input.attempt}`,
      routeDecision: typeof payload.routeDecision === "string" ? payload.routeDecision : input.retryChainId ? "task-service/failover" : "task-service",
      modelCapabilityRef: input.config.id,
      contextManifestRef: invocation.contextManifestRef || authorityBinding?.contextManifestRef || (typeof payload.contextManifestRef === "string" ? payload.contextManifestRef : "task-context"),
      promptSchemaVersion: invocation.promptVersion || promptVersionForTask(type),
      startedAt: task.startedAt,
      finishedAt: input.finishedAt,
      status: input.status,
      modelVersion: measurement.modelVersion,
      pricingRef: measurement.cost.pricingRef,
      usageSource: measurement.usageSource,
      ...(input.retryChainId ? { retryChainId: input.retryChainId, retryAttempt: input.attempt } : {}),
      usage: measurement.usage,
      cost: measurement.cost,
      cache: { hit: false },
      ...(input.status !== "completed" && input.error ? { failure: { code: input.error, retryClass: retryClassFor(input.error), message: input.error } } : {}),
      adoptionDecision: input.adoptionDecision
    });
    await appendModelInvocation(root, record);
    if (bookRunId && budgetReservationId) {
      const reservation = await readBudgetReservation(root, budgetReservationId);
      if (!reservation) throw new Error("MODEL_INVOCATION_BUDGET_RESERVATION_NOT_FOUND");
      await consumeBudgetReservationAtomically(root, reservation.reservationId, Math.ceil(record.cost.amount * 100 - Number.EPSILON));
    }
    return record;
  };
  try {
    const contextBlocks = await assembleContext(type, root, project, { ...payload, visibilityAudience: "model-task" });
    const prompt = buildTaskPrompt(type, {
      projectTitle: project.title,
      target: String(payload.chapterId || payload.filePath || ""),
      authorInput: String(payload.roughIdea || payload.feedback || ""),
      contextBlocks,
      payload
    });
    promptForLedger = prompt;
    const attemptEstimateCents = estimateModelInvocationCostCents({ promptChars: prompt.length, outputChars: 4000, explicitCostCents: estimatedCostCents });
    await assertModelInvocationBudget(root, {
      bookRunId,
      budgetReservationId,
      estimatedCostCents: attemptEstimateCents
    });
    invocation.promptSnapshot = promptSnapshot(prompt, contextBlocks);
    invocation.contextSnapshot = contextSnapshot(contextBlocks);
    const contextPlan = buildTaskContextPlan(contextBlocks);
    const retrievalEligibility = buildRetrievalEligibility(contextBlocks);
    invocation.contextPlan = contextPlan;
    task.contextPlan = contextPlan;
    const manifestBlocks = [...contextBlocks, { title: "Task Input", content: JSON.stringify(payload) }];
    const privacySafeContent = (content: string): string => content
      .replace(/[A-Za-z]:\\[^\s"']+/g, "[path-redacted]")
      .replace(/\/(?:Users|home)\/[^\s"']+/g, "[path-redacted]");
    const privacySources = manifestBlocks
      .filter((block) => !block.title.includes("涓婁笅鏂囬绠楁棩蹇?"))
      .map((block) => ({ sourceId: block.title, projectSlug: project.slug, content: privacySafeContent(block.content), dataClass: "project-file" as const, rights: "project-authorized" as const, providerAuthorized: true, deleted: false }));
    const privacyResult = evaluateContextPrivacy({ projectSlug: project.slug, purpose: `task:${type}`, sources: privacySources });
    const excludedBlocks: Record<string, string> = {};
    for (const sourceId of privacyResult.blockedSourceIds) {
      const source = privacySources.find((item) => item.sourceId === sourceId);
      const single = source ? evaluateContextPrivacy({ projectSlug: project.slug, purpose: `task:${type}`, sources: [source] }) : undefined;
      excludedBlocks[sourceId] = single?.reasons.join("|") || "CONTEXT_PRIVACY_BLOCKED";
    }
    const sourcePaths = [
      "project.json",
      "style/style-guide.md",
      "bible/characters.md",
      "bible/world.md",
      "bible/power-system.md",
      "story-control/story-control.json",
      "outline/volume-01.md",
      "ledger/foreshadowing.md",
      "ledger/power-progression.md",
      "ledger/foreshadowing.json",
      "ledger/continuity.json",
      "ledger/power-progression.json",
      "ledger/character-state.json",
      "ledger/risks.json",
      ...(project.chapters || []).flatMap((chapter) => [chapter.outlinePath, chapter.contentPath, `dashboard/${chapter.id}.json`, `scenes/${chapter.id}.json`])
    ];
    const sourceMatches = await resolveTaskContextSources(root, contextBlocks, sourcePaths);
    const sourceOverrides = new Map(
      (Array.isArray(payload.contextSourceDecisions) ? payload.contextSourceDecisions : [])
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).blockId === "string"))
        .map((item) => [String(item.blockId), item])
    );
    const tierAuthority: Record<string, ContextAuthority> = { T0: "canon", T1: "chapter", T2: "summary", T3: "model" };
    const sourceGate = evaluateContextSources({
      purpose: `task:${type}`,
      query: String(payload.target || payload.chapterId || type),
      sources: manifestBlocks
        .filter((block) => !block.title.includes("涓婁笅鏂囬绠楁棩蹇?"))
        .map((block) => {
          const override = sourceOverrides.get(block.title);
          const tier = contextPlan.blocks.find((item) => item.title === block.title)?.tier;
          return {
            blockId: block.title,
            factKey: typeof override?.factKey === "string" ? override.factKey : block.title,
            sourceRef: typeof override?.sourceRef === "string" ? override.sourceRef : sourceMatches[block.title]?.refs?.[0] || `context://block/${block.title}`,
            sourceVersion: typeof override?.sourceVersion === "string" ? override.sourceVersion : sourceMatches[block.title]?.version || contextPlan.fingerprint,
            contentHash: typeof override?.contentHash === "string" ? override.contentHash : crypto.createHash("sha256").update(block.content).digest("hex"),
            authority: (typeof override?.authority === "string" ? override.authority : tierAuthority[tier || "T3"]) as ContextAuthority,
            relevance: Number.isFinite(Number(override?.relevance)) ? Number(override?.relevance) : 1,
            selected: override?.selected !== false,
            selectionReason: typeof override?.selectionReason === "string" ? override.selectionReason : "DEFAULT_TASK_CONTEXT"
          };
        })
    });
    for (const excluded of sourceGate.excluded) {
      excludedBlocks[excluded.blockId] = [excludedBlocks[excluded.blockId], excluded.reason].filter(Boolean).join("|");
    }
    const contextManifest = buildTaskContextManifest({
      projectSlug: project.slug,
      taskId: task.id,
      taskType: type,
      blocks: manifestBlocks,
      plan: contextPlan,
      sourceRefs: Object.fromEntries(Object.entries(sourceMatches).map(([title, match]) => [title, match.refs])),
      sourceVersions: Object.fromEntries(Object.entries(sourceMatches).map(([title, match]) => [title, match.version])),
      excludedBlocks,
      statusOverride: privacyResult.status === "block" || sourceGate.status === "block" ? "block" : "pass",
      sourceGate,
      retrievalEligibility
    });
    await persistTaskContextManifest(root, contextManifest);
    invocation.contextManifestRef = `tasks/context-manifests/${contextManifest.manifestId}.json`;
    task.contextManifestRef = invocation.contextManifestRef;
    if (privacyResult.status === "block") throw new Error("CONTEXT_PRIVACY_BLOCKED");
    if (sourceGate.status === "block") throw new Error("CONTEXT_SOURCE_BLOCKED");
    invocation.promptVersion = promptVersionForTask(type);
    invocation.variablePlan = variablePlan(payload, invocation.contextSnapshot);
    invocation.preCallReview = preCallReview(prompt, invocation.contextSnapshot);
    if (invocation.preCallReview?.status === "block") throw new Error("PRE_CALL_CONTEXT_BLOCKED");
    const platformAiConfig = await readPlatformAiConfig();
    const novelAiConfig = platformAiConfig.scenarios.novel;
    const profileId = typeof payload.agentProfileId === "string" ? payload.agentProfileId : novelAiConfig.profileId || project.ai?.profileId;
    const payloadModel = typeof payload.modelId === "string" ? payload.modelId : undefined;
    let config = resolveAgentProfile({
      profileId,
      modelId: payloadModel || novelAiConfig.modelId || project.ai?.modelId || project.codex.model
    });
    const primaryConfigId = config.id;
    const modelContextTokens = Number(payload.modelContextTokens ?? config.failoverCapability?.contextLimit ?? 128_000);
    const contextBudget = evaluateModelContextBudget({
      modelContextTokens,
      inputTokens: Math.ceil(prompt.length / 4),
      outputReserveTokens: Number(payload.outputReserveTokens ?? 4000),
      toolReserveTokens: Number(payload.toolReserveTokens ?? 1000)
    });
    invocation.contextBudget = contextBudget;
    task.contextBudget = contextBudget;
    if (contextBudget.status === "block") throw new Error(contextBudget.reason);
    configForLedger = config;
    const providerGate = await authorizeProviderAttempt(root, config.id, new Date().toISOString());
    if (!providerGate.allow) throw new Error("PROVIDER_CIRCUIT_OPEN");
    invocation.agentProfileId = config.id;
    invocation.agentProvider = config.provider;
    invocation.modelId = config.model;
    let output = await runWithCurrentTaskContextManifest(root, invocation.contextManifestRef, () => runner.run(prompt, root, config, { signal: options.signal, timeoutMs: task.timeoutMs }));
    let primaryFailureRecorded = false;
    const primaryError = output.stderr || (output.exitCode !== 0 ? `${config.label} exited with ${output.exitCode}` : "");
    const rawCandidates = Array.isArray(payload.failoverCandidates) ? payload.failoverCandidates : [];
    const retryPlan = Boolean(primaryError.trim()) && !rawCandidates.length && !output.cancelled && !options.signal?.aborted
      ? planNarrowRetry({ errorCode: primaryError, attempt: 1, maxAttempts: 2 })
      : { allow: false, delayMs: 0, reason: "retry budget exhausted" as const };
    if (retryPlan.allow) {
      await assertModelInvocationBudget(root, { bookRunId, budgetReservationId, estimatedCostCents: attemptEstimateCents * 2 });
      await new Promise((resolve) => setTimeout(resolve, retryPlan.delayMs));
      await recordProviderFailure(root, config.id, primaryError, { now: new Date().toISOString() });
      primaryFailureRecorded = true;
      const retryChainId = typeof task.payload.retryChainId === "string" ? task.payload.retryChainId : `retry-${task.id}`;
      primaryAttemptForLedger = { config, output, error: primaryError, finishedAt: new Date().toISOString(), retryChainId };
      output = await runWithCurrentTaskContextManifest(root, invocation.contextManifestRef, () => runner.run(prompt, root, config, { signal: options.signal, timeoutMs: task.timeoutMs }));
      task.payload.retryChainId = retryChainId;
      task.payload.retryAttempt = 2;
    }
    if (!output.cancelled && !options.signal?.aborted && retryClassFor(primaryError) === "transient" && rawCandidates.length) {
      const candidates = rawCandidates.map((candidate) => {
        const item = candidate as Record<string, unknown>;
        const candidateId = String(item.candidateId ?? "");
        try {
          const profile = resolveAgentProfile({ profileId: candidateId, modelId: typeof item.modelId === "string" ? item.modelId : undefined });
          const capability = profile.failoverCapability;
          return {
            candidateId,
            provider: profile.provider,
            ...(profile.model ? { modelId: profile.model } : {}),
            status: item.status === "retired" || !capability ? "retired" as const : "active" as const,
            verifiedTaskTypes: capability?.verifiedTaskTypes || [],
            structuredOutput: capability?.structuredOutput === true,
            contextLimit: capability?.contextLimit ?? 0,
            privacyClasses: capability?.privacyClasses || [],
            dataResidencies: capability?.dataResidencies || []
          } satisfies ProviderFailoverCandidate;
        } catch {
          return { candidateId, provider: "", status: "retired" as const, verifiedTaskTypes: [], structuredOutput: false, contextLimit: 0, privacyClasses: [], dataResidencies: [] } satisfies ProviderFailoverCandidate;
        }
      });
      const failover = evaluateProviderFailover({
        currentCandidateId: config.id,
        taskType: type,
        requiredContextTokens: Number(payload.failoverRequiredContextTokens ?? 0),
        requiresStructuredOutput: payload.failoverRequiresStructuredOutput !== false,
        privacyClass: typeof payload.failoverPrivacyClass === "string" ? payload.failoverPrivacyClass : "private",
        dataResidency: typeof payload.failoverDataResidency === "string" ? payload.failoverDataResidency : "local",
        frozenInputFingerprint: crypto.createHash("sha256").update(prompt).digest("hex"),
        candidates
      });
      if (failover.status === "selected" && failover.candidateId) {
        await assertModelInvocationBudget(root, { bookRunId, budgetReservationId, estimatedCostCents: attemptEstimateCents * 2 });
        await recordProviderFailure(root, config.id, primaryError, { now: new Date().toISOString() });
        primaryFailureRecorded = true;
        const retryChainId = typeof task.payload.retryChainId === "string" ? task.payload.retryChainId : `retry-${task.id}`;
        const fallback = resolveAgentProfile({ profileId: failover.candidateId, modelId: failover.modelId });
        const fallbackGate = await authorizeProviderAttempt(root, fallback.id, new Date().toISOString());
        if (fallbackGate.allow) {
          primaryAttemptForLedger = { config, output, error: primaryError, finishedAt: new Date().toISOString(), retryChainId };
          config = fallback;
          configForLedger = config;
          invocation.agentProfileId = config.id;
          invocation.agentProvider = config.provider;
          invocation.modelId = config.model;
          output = await runWithCurrentTaskContextManifest(root, invocation.contextManifestRef, () => runner.run(prompt, root, config, { signal: options.signal, timeoutMs: task.timeoutMs }));
          task.payload.retryChainId = retryChainId;
          task.payload.retryAttempt = 2;
        }
      }
    }
    let repairRequired = false;
    let result = parseCodexResult(output.finalMessage);
    if (result.parseError && output.exitCode === 0 && !output.cancelled && !Number.isInteger(task.payload.retryAttempt) && !primaryAttemptForLedger) {
      await assertModelInvocationBudget(root, { bookRunId, budgetReservationId, estimatedCostCents: attemptEstimateCents * 2 });
      const originalOutput = output;
      const repairError = `Failed to parse ${config.label} output: ${result.parseError}`;
      const retryChainId = `repair-${task.id}`;
      primaryAttemptForLedger = { config, output: originalOutput, error: repairError, finishedAt: new Date().toISOString(), retryChainId };
      task.payload.retryChainId = retryChainId;
      task.payload.retryAttempt = 2;
      const repairPrompt = [
        "Repair the following structured AI response.",
        "Return JSON only with keys summary, content, changes, risks, questions, patches.",
        "Do not invent missing facts; preserve the original meaning.",
        "Original response:",
        originalOutput.finalMessage || originalOutput.stdout || ""
      ].join("\n");
      try {
        output = await runWithCurrentTaskContextManifest(root, invocation.contextManifestRef, () => runner.run(repairPrompt, root, config, { signal: options.signal, timeoutMs: task.timeoutMs }));
      } catch {
        output = { stdout: "", stderr: "repair invocation failed", exitCode: 1, durationMs: 0, finalMessage: "" };
      }
      const repaired = parseCodexResult(output.finalMessage);
      repaired.originalRawOutput = originalOutput.finalMessage || originalOutput.stdout || "";
      repaired.repairAttempted = true;
      if (output.exitCode !== 0 || repaired.parseError) {
        repaired.summary = "repair_required";
        repaired.parseError = "repair_required";
        repairRequired = true;
      }
      result = repaired;
    }
    outputMessageForLedger = output.finalMessage || output.stdout || "";
    nativeUsageForLedger = output.usage;
    nativeCostForLedger = output.cost;
    nativeModelVersionForLedger = output.modelVersion;
    if (output.cancelled || options.signal?.aborted) {
      task.status = "cancelled";
      task.cancelRequestedAt = task.cancelRequestedAt || new Date().toISOString();
      task.outputSummary = "AI task cancelled.";
      task.error = output.stderr || "AI task cancelled.";
    } else {
      const completedWithoutProcessError = output.exitCode === 0 && !output.timedOut;
      task.status = !repairRequired && completedWithoutProcessError && !result.parseError ? "success" : "error";
      task.outputSummary = result.summary;
      if (repairRequired) {
        task.error = "repair_required";
      } else if (completedWithoutProcessError && result.parseError) {
        task.error = `Failed to parse ${config.label} output: ${result.parseError}`;
      } else {
        task.error = completedWithoutProcessError ? undefined : output.stderr || `${config.label} exited with ${output.exitCode}`;
      }
    }
    task.result = result;
    task.durationMs = output.durationMs;
    invocation.attempt.exitCode = output.exitCode;
    invocation.proposedPatchTargets = result.patches.map((patch) => patch.target);
    invocation.adoptionDecision = task.status === "cancelled" ? "not-required" : result.patches.length ? "pending" : "not-required";
    if (task.status === "success") await recordProviderSuccess(root, config.id, new Date().toISOString());
    else if (!primaryFailureRecorded || config.id !== primaryConfigId || Number(task.payload.retryAttempt) === 2) await recordProviderFailure(root, config.id, task.error || "provider-failure", { now: new Date().toISOString() });
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
    if (configForLedger) {
      const ledgerStatus: ModelInvocationRecord["status"] = task.status === "cancelled" ? "cancelled" : task.status === "success" ? "completed" : "failed";
      if (primaryAttemptForLedger) {
        await appendLedgerAttempt({ config: primaryAttemptForLedger.config, output: primaryAttemptForLedger.output, status: "failed", error: primaryAttemptForLedger.error, attempt: 1, retryChainId: primaryAttemptForLedger.retryChainId, finishedAt: primaryAttemptForLedger.finishedAt, adoptionDecision: "not-required" });
      }
      await appendLedgerAttempt({
        config: configForLedger,
        output: { stdout: outputMessageForLedger, stderr: task.error || "", exitCode: task.status === "success" ? 0 : 1, finalMessage: outputMessageForLedger, durationMs: task.durationMs || 0, usage: nativeUsageForLedger, cost: nativeCostForLedger, modelVersion: nativeModelVersionForLedger },
        status: ledgerStatus,
        ...(task.error ? { error: task.error } : {}),
        attempt: primaryAttemptForLedger ? 2 : 1,
        ...(primaryAttemptForLedger ? { retryChainId: primaryAttemptForLedger.retryChainId } : {}),
        finishedAt: task.finishedAt,
        adoptionDecision: invocation.adoptionDecision
      });
    }
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
  const active: ActiveNovelTask = { controller, task, root };
  activeNovelTasks.set(task.id, active);
  await appendHistory(root, task);

  active.completion = new Promise<void>((resolve) => setTimeout(() => {
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
        resolve();
      });
  }, 0));

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
    const response = { ...active.task, status: "running" as const };
    active.task.status = "cancelled";
    active.task.finishedAt = timestamp;
    active.task.durationMs = Date.parse(timestamp) - Date.parse(active.task.startedAt);
    active.task.error = "AI task cancellation requested.";
    await appendHistory(root, active.task);
    active.controller.abort();
    await active.completion;
    return response;
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
