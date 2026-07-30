import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { fingerprintCreativeSession } from "./contextManifest.js";
import { readCreativeSession } from "./creativeSession.js";
import type { AgentRunConfig, CodexRunOutput, ProcessRunner, ProcessRunOptions } from "./codexRunner.js";
import type { UnderstandingClaim } from "./understandingPreview.js";
import type { UnderstandingInterpretationSet, UnderstandingQuestion, UnderstandingSnapshot } from "./understandingExecutor.js";

export type UnderstandingWorkerStatus = "queued" | "running" | "completed" | "cancelled" | "failed" | "stale";

export interface UnderstandingTaskRecord {
  schemaVersion: "understanding-task.v1";
  taskId: string;
  projectSlug: string;
  status: UnderstandingWorkerStatus;
  sourceFingerprint: string;
  sourceMessageIds: string[];
  promptFingerprint: string;
  prompt: string;
  agent: AgentRunConfig & { id?: string };
  profileId?: string;
  modelId?: string;
  modelCallIssued: boolean;
  canonWritten: false;
  snapshotId?: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface UnderstandingWorkerInput {
  root: string;
  projectSlug: string;
  sourceFingerprint: string;
  sourceMessageIds: string[];
  prompt: string;
  agent: AgentRunConfig & { id?: string };
  taskId?: string;
  signal?: AbortSignal;
  currentSourceFingerprint?: string;
  timeoutMs?: number;
}

export interface UnderstandingModelResult {
  task: UnderstandingTaskRecord;
  snapshot?: UnderstandingSnapshot;
}

export interface UnderstandingStartupRecoveryResult {
  projectSlug: string;
  recoveredTaskIds: string[];
  error?: string;
}

function createTaskId(): string {
  return `understanding-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function writeJson(root: string, relativePath: string, value: unknown): Promise<void> {
  const target = resolveInside(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

async function writeTask(root: string, task: UnderstandingTaskRecord): Promise<void> {
  await writeJson(root, `sessions/understanding-tasks/${task.taskId}.json`, task);
}

function promptFingerprint(prompt: string): string {
  return crypto.createHash("sha256").update(prompt).digest("hex");
}

function parseModelOutput(finalMessage: string): {
  coreExplicit: UnderstandingClaim[];
  inferred: UnderstandingClaim[];
  unknowns: UnderstandingClaim[];
  question: UnderstandingQuestion;
  interpretationSet?: UnderstandingInterpretationSet;
} {
  const normalized = finalMessage.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim();
  const parsed = JSON.parse(normalized) as Record<string, unknown>;
  const claims = (key: string): UnderstandingClaim[] => {
    const value = parsed[key];
    if (!Array.isArray(value)) throw new Error(`UNDERSTANDING_OUTPUT_INVALID:${key}`);
    return value.map((claim) => {
      if (!claim || typeof claim !== "object") throw new Error(`UNDERSTANDING_OUTPUT_INVALID:${key}`);
      const candidate = claim as Record<string, unknown>;
      if (typeof candidate.id !== "string" || typeof candidate.text !== "string" || typeof candidate.status !== "string" || !Array.isArray(candidate.evidence)) {
        throw new Error(`UNDERSTANDING_OUTPUT_INVALID:${key}`);
      }
      return candidate as unknown as UnderstandingClaim;
    });
  };
  const question = parsed.question;
  if (!question || typeof question !== "object") throw new Error("UNDERSTANDING_OUTPUT_INVALID:question");
  const candidate = question as Record<string, unknown>;
  if (candidate.id !== "question-primary-desire" || typeof candidate.text !== "string" || candidate.status !== "candidate" || candidate.impact !== "high") {
    throw new Error("UNDERSTANDING_OUTPUT_INVALID:question");
  }
  let interpretationSet: UnderstandingInterpretationSet | undefined;
  if (parsed.interpretationSet !== undefined) {
    const raw = parsed.interpretationSet;
    if (!raw || typeof raw !== "object") throw new Error("UNDERSTANDING_OUTPUT_INVALID:interpretationSet");
    const set = raw as Record<string, unknown>;
    if (set.schemaVersion !== "seed-interpretation-set.v1" || set.activeQuestionId !== "question-primary-desire" || !Array.isArray(set.interpretations) || set.interpretations.length < 2) {
      throw new Error("UNDERSTANDING_OUTPUT_INVALID:interpretationSet");
    }
    const ids = new Set<string>();
    const interpretations = set.interpretations.map((item) => {
      if (!item || typeof item !== "object") throw new Error("UNDERSTANDING_OUTPUT_INVALID:interpretationSet");
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.id !== "string" || ids.has(candidate.id) || typeof candidate.label !== "string" || typeof candidate.summary !== "string" || candidate.status !== "candidate" || !Array.isArray(candidate.differences) || !Array.isArray(candidate.supportEvidence) || !Array.isArray(candidate.counterEvidence) || !Array.isArray(candidate.downstreamImpacts)) {
        throw new Error("UNDERSTANDING_OUTPUT_INVALID:interpretationSet");
      }
      ids.add(candidate.id);
      return candidate as unknown as UnderstandingInterpretationSet["interpretations"][number];
    });
    if (!Array.isArray(set.commonClaims)) throw new Error("UNDERSTANDING_OUTPUT_INVALID:interpretationSet");
    interpretationSet = {
      schemaVersion: "seed-interpretation-set.v1",
      commonClaims: set.commonClaims as UnderstandingClaim[],
      interpretations,
      activeQuestionId: "question-primary-desire"
    };
  }
  return {
    coreExplicit: claims("coreExplicit"),
    inferred: claims("inferred"),
    unknowns: claims("unknowns"),
    question: candidate as unknown as UnderstandingQuestion,
    ...(interpretationSet ? { interpretationSet } : {})
  };
}

function initialTask(input: UnderstandingWorkerInput): UnderstandingTaskRecord {
  const timestamp = nowIso();
  return {
    schemaVersion: "understanding-task.v1",
    taskId: input.taskId || createTaskId(),
    projectSlug: input.projectSlug,
    status: "running",
    sourceFingerprint: input.sourceFingerprint,
    sourceMessageIds: [...input.sourceMessageIds],
    promptFingerprint: promptFingerprint(input.prompt),
    prompt: input.prompt,
    agent: input.agent,
    ...(input.agent.id ? { profileId: input.agent.id } : {}),
    ...(input.agent.model ? { modelId: input.agent.model } : {}),
    modelCallIssued: false,
    canonWritten: false,
    startedAt: timestamp,
    updatedAt: timestamp
  };
}

const activeUnderstandingTasks = new Map<string, { controller: AbortController; input: UnderstandingWorkerInput; runner: ProcessRunner }>();

async function readTaskFile(root: string, taskId: string): Promise<UnderstandingTaskRecord | null> {
  try {
    return JSON.parse(await fs.readFile(resolveInside(root, `sessions/understanding-tasks/${taskId}.json`), "utf8")) as UnderstandingTaskRecord;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function readUnderstandingTask(root: string, taskId: string): Promise<UnderstandingTaskRecord | null> {
  return readTaskFile(root, taskId);
}

export async function startModelUnderstandingTask(
  input: Omit<UnderstandingWorkerInput, "taskId" | "signal">,
  runner: ProcessRunner
): Promise<UnderstandingTaskRecord> {
  const controller = new AbortController();
  const task = initialTask({ ...input, taskId: undefined, signal: controller.signal });
  const queued: UnderstandingTaskRecord = { ...task, status: "queued" };
  await writeTask(input.root, queued);
  activeUnderstandingTasks.set(task.taskId, { controller, input: { ...input, taskId: task.taskId, signal: controller.signal }, runner });
  queueMicrotask(() => {
    const active = activeUnderstandingTasks.get(task.taskId);
    if (!active) return;
    void executeModelUnderstanding(active.input, { run: active.runner.run.bind(active.runner) })
      .catch(async (error) => {
        const failed = finishTask({ ...queued, modelCallIssued: false }, "failed", error instanceof Error ? error.message : String(error));
        await writeTask(input.root, failed);
      })
      .finally(() => activeUnderstandingTasks.delete(task.taskId));
  });
  return queued;
}

export async function cancelUnderstandingTask(root: string, taskId: string): Promise<UnderstandingTaskRecord | null> {
  const active = activeUnderstandingTasks.get(taskId);
  if (active) {
    active.controller.abort();
    return readTaskFile(root, taskId);
  }
  const task = await readTaskFile(root, taskId);
  if (!task) return null;
  if (["completed", "cancelled", "failed", "stale"].includes(task.status)) return task;
  const cancelled = finishTask({ ...task, modelCallIssued: false }, "cancelled", "UNDERSTANDING_CANCELLED");
  await writeTask(root, cancelled);
  return cancelled;
}

export async function resumeUnderstandingTask(
  root: string,
  taskId: string,
  currentSourceFingerprint: string,
  runner: ProcessRunner
): Promise<UnderstandingTaskRecord | null> {
  const task = await readTaskFile(root, taskId);
  if (!task) return null;
  if (task.status !== "running" && task.status !== "cancelled" && task.status !== "failed") throw new Error("UNDERSTANDING_TASK_NOT_RESUMABLE");
  if (currentSourceFingerprint !== task.sourceFingerprint) {
    const stale = finishTask({ ...task, modelCallIssued: false }, "stale", "UNDERSTANDING_INPUT_STALE");
    await writeTask(root, stale);
    return stale;
  }
  const controller = new AbortController();
  const input: UnderstandingWorkerInput = {
    root,
    projectSlug: task.projectSlug,
    sourceFingerprint: task.sourceFingerprint,
    sourceMessageIds: task.sourceMessageIds,
    prompt: task.prompt,
    agent: task.agent,
    taskId: task.taskId,
    signal: controller.signal,
    currentSourceFingerprint
  };
  activeUnderstandingTasks.set(task.taskId, { controller, input, runner });
  const queued: UnderstandingTaskRecord = { ...task, status: "queued", error: undefined, updatedAt: nowIso(), finishedAt: undefined };
  await writeTask(root, queued);
  queueMicrotask(() => {
    const active = activeUnderstandingTasks.get(task.taskId);
    if (!active) return;
    void executeModelUnderstanding(active.input, { run: active.runner.run.bind(active.runner) }).finally(() => activeUnderstandingTasks.delete(task.taskId));
  });
  return queued;
}

export async function recoverUnderstandingTasks(
  root: string,
  currentSourceFingerprint: string,
  runner: ProcessRunner
): Promise<UnderstandingTaskRecord[]> {
  const directory = resolveInside(root, "sessions/understanding-tasks");
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const recovered: UnderstandingTaskRecord[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const task = await readTaskFile(root, name.slice(0, -5));
    if (!task || task.status !== "running" || activeUnderstandingTasks.has(task.taskId)) continue;
    const result = await resumeUnderstandingTask(root, task.taskId, currentSourceFingerprint, runner);
    if (result) recovered.push(result);
  }
  return recovered;
}

/**
 * Startup hook: scan every project for persisted running understanding tasks and
 * resume them against the current session fingerprint. Recovery is observable
 * and isolated per project; one malformed project cannot prevent the API from
 * starting or recover other projects.
 */
export async function recoverUnderstandingTasksAtStartup(
  novelsRoot: string,
  runner: ProcessRunner
): Promise<UnderstandingStartupRecoveryResult[]> {
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = (await fs.readdir(novelsRoot, { withFileTypes: true })).map((entry) => ({ name: entry.name, isDirectory: () => entry.isDirectory() }));
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const results: UnderstandingStartupRecoveryResult[] = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const projectSlug = entry.name;
    const root = path.join(novelsRoot, projectSlug);
    try {
      const session = await readCreativeSession(root, projectSlug);
      const tasks = await recoverUnderstandingTasks(root, fingerprintCreativeSession(session), runner);
      if (tasks.length > 0) {
        results.push({ projectSlug, recoveredTaskIds: tasks.map((task) => task.taskId) });
        const auditPath = resolveInside(root, "sessions/understanding-recovery-events.jsonl");
        await fs.mkdir(path.dirname(auditPath), { recursive: true });
        await fs.appendFile(auditPath, `${JSON.stringify({ schemaVersion: "understanding-recovery-event.v1", projectSlug, taskIds: tasks.map((task) => task.taskId), sourceFingerprint: fingerprintCreativeSession(session), createdAt: nowIso() })}\n`, "utf8");
      }
    } catch (error) {
      results.push({ projectSlug, recoveredTaskIds: [], error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

function finishTask(task: UnderstandingTaskRecord, status: UnderstandingWorkerStatus, error?: string): UnderstandingTaskRecord {
  const timestamp = nowIso();
  return {
    ...task,
    status,
    ...(error ? { error } : {}),
    updatedAt: timestamp,
    finishedAt: timestamp
  };
}

export async function executeModelUnderstanding(
  input: UnderstandingWorkerInput,
  dependencies: { run: ProcessRunner["run"] }
): Promise<UnderstandingModelResult> {
  let task = initialTask(input);
  await writeTask(input.root, task);
  if (input.signal?.aborted) {
    task = finishTask(task, "cancelled", "UNDERSTANDING_CANCELLED");
    await writeTask(input.root, task);
    return { task };
  }

  let output: CodexRunOutput;
  task = { ...task, modelCallIssued: true, updatedAt: nowIso() };
  await writeTask(input.root, task);
  try {
    const options: ProcessRunOptions = { signal: input.signal, timeoutMs: input.timeoutMs };
    output = await dependencies.run(input.prompt, input.root, input.agent, options);
  } catch (error) {
    task = finishTask(task, input.signal?.aborted ? "cancelled" : "failed", error instanceof Error ? error.message : String(error));
    await writeTask(input.root, task);
    return { task };
  }

  if (output.cancelled || input.signal?.aborted) {
    task = finishTask(task, "cancelled", output.stderr || "UNDERSTANDING_CANCELLED");
    await writeTask(input.root, task);
    return { task };
  }
  if (output.exitCode !== 0 || output.timedOut) {
    task = finishTask(task, "failed", output.stderr || `UNDERSTANDING_PROCESS_EXIT:${output.exitCode}`);
    await writeTask(input.root, task);
    return { task };
  }

  let parsed: ReturnType<typeof parseModelOutput>;
  try {
    parsed = parseModelOutput(output.finalMessage);
  } catch (error) {
    task = finishTask(task, "failed", error instanceof Error ? error.message : String(error));
    await writeTask(input.root, task);
    return { task };
  }

  if (input.currentSourceFingerprint && input.currentSourceFingerprint !== input.sourceFingerprint) {
    task = finishTask(task, "stale", "UNDERSTANDING_INPUT_STALE");
    await writeTask(input.root, task);
    return { task };
  }

  const timestamp = nowIso();
  const snapshotId = `understanding-model-${input.sourceFingerprint.slice(0, 16)}`;
  const snapshot: UnderstandingSnapshot = {
    schemaVersion: "understanding-snapshot.v1",
    snapshotId,
    projectSlug: input.projectSlug,
    mode: "model",
    sourceFingerprint: input.sourceFingerprint,
    sourceMessageIds: [...input.sourceMessageIds],
    coreExplicit: parsed.coreExplicit,
    inferred: parsed.inferred,
    unknowns: parsed.unknowns,
    question: parsed.question,
    ...(parsed.interpretationSet ? { interpretationSet: parsed.interpretationSet } : {}),
    modelCallIssued: true,
    canonWritten: false,
    createdAt: timestamp
  };
  await writeJson(input.root, "sessions/understanding-snapshot.json", snapshot);
  task = finishTask({ ...task, snapshotId }, "completed");
  await writeTask(input.root, task);
  return { task, snapshot };
}
