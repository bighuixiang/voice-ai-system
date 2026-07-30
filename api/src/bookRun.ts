import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { createBookWorkGraph, refreshBookWorkGraph, type BookWorkGraph } from "./bookWorkGraph.js";
import { enqueueExecutionWorkItem, listExecutionWorkItems } from "./executionQueue.js";
import { scheduleReadyExecutionWork } from "./bookWorkScheduler.js";
import { issueQuiescenceProof } from "./quiescenceProof.js";
import { dispatchQueuedExecutionWorkItems, type ExecutionDispatchReceipt } from "./executionDispatcher.js";

export type BookRunStatus = "draft" | "ready" | "queued" | "running" | "pausing" | "paused" | "gate_required" | "repair_required" | "stopping" | "stopped" | "failed_recoverable" | "failed_terminal" | "scope_complete" | "audited_complete";
export interface BookRunLimits { maxWorkItems?: number; maxModelCalls?: number; maxBudgetCents?: number; deadlineAt?: string; maxWallClockMs?: number; maxConsecutiveFailures?: number; }
export interface BookRun {
  schemaVersion: "book-run.v1";
  bookRunId: string;
  projectSlug: string;
  parentRunId?: string;
  objective: string;
  scope: { chapterIds: string[]; scopeFingerprint: string };
  storyContractRef?: string;
  workGraphRef: string;
  workGraphFingerprint: string;
  autonomyGrantRef: string;
  autonomyLevel: "L0" | "L1" | "L2";
  limits: BookRunLimits;
  status: BookRunStatus;
  currentGate: "none" | "quiescence_required" | "author_required" | "completion_audit";
  progress: { totalWorkItems: number; completedWorkItems: number; queuedWorkItems: number; denominator: "frozen-work-graph" };
  version: number;
  startedAt: string;
  pausedAt?: string;
  finishedAt?: string;
  completionAuditRef?: string;
  quiescenceProofRef?: string;
  recoveryReplacementWorkItemId?: string;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function runPath(root: string, id: string): string { return resolveInside(root, `sessions/book-runs/${id}.json`); }
function eventPath(root: string, id: string): string { return resolveInside(root, `sessions/book-runs/${id}.events.jsonl`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }

export async function readBookRun(root: string, bookRunId: string): Promise<BookRun | null> { return readJson<BookRun>(runPath(root, bookRunId)); }

export async function listBookRuns(root: string): Promise<BookRun[]> {
  const directory = resolveInside(root, "sessions/book-runs");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const runs: BookRun[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const run = await readJson<BookRun>(path.join(directory, name));
    if (run) runs.push(run);
  }
  return runs.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.bookRunId.localeCompare(right.bookRunId));
}

export async function evaluateBookRunQuiescence(root: string): Promise<{ quiescent: boolean; activeWorkItemIds: string[]; activeMutationLeases: string[] }> {
  const items = await listExecutionWorkItems(root);
  const activeWorkItemIds = items.filter((item) => ["queued", "claimed", "running"].includes(item.status)).map((item) => item.workItemId).sort();
  const mutationsDir = resolveInside(root, "sessions/mutations");
  const activeMutationLeases = (await fs.readdir(mutationsDir).catch(() => [] as string[])).filter((name) => name.endsWith(".lock")).sort();
  return { quiescent: activeWorkItemIds.length === 0 && activeMutationLeases.length === 0, activeWorkItemIds, activeMutationLeases };
}

export async function startBookRun(root: string, input: { projectSlug: string; chapterIds: string[]; objective?: string; parentRunId?: string; storyContractRef?: string; autonomyLevel: "L0" | "L1" | "L2"; limits: BookRunLimits }): Promise<BookRun> {
  const chapterIds = [...new Set(input.chapterIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (!chapterIds.length) throw new Error("BOOK_RUN_SCOPE_REQUIRED");
  if (!Object.values(input.limits).some((value) => value !== undefined)) throw new Error("BOOK_RUN_LIMIT_REQUIRED");
  if (input.limits.maxWorkItems !== undefined && (!Number.isInteger(input.limits.maxWorkItems) || input.limits.maxWorkItems < chapterIds.length)) throw new Error("BOOK_RUN_LIMIT_INVALID");
  const identity = { projectSlug: input.projectSlug, chapterIds, autonomyLevel: input.autonomyLevel, limits: input.limits, parentRunId: input.parentRunId || "" };
  const bookRunId = `book-run-${hash(identity).slice(0, 24)}`;
  const existing = await readBookRun(root, bookRunId);
  if (existing) return existing;
  const graph = await createBookWorkGraph(root, input.projectSlug, chapterIds);
  const now = new Date().toISOString();
  const base = {
    schemaVersion: "book-run.v1" as const,
    bookRunId,
    projectSlug: input.projectSlug,
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    objective: (input.objective || "Continue the governed novel within the frozen scope.").trim(),
    scope: { chapterIds, scopeFingerprint: hash({ projectSlug: input.projectSlug, chapterIds }) },
    ...(input.storyContractRef ? { storyContractRef: input.storyContractRef } : {}),
    workGraphRef: "sessions/book-work-graph.json",
    workGraphFingerprint: graph.fingerprint,
    autonomyGrantRef: `book-run:${bookRunId}:autonomy`,
    autonomyLevel: input.autonomyLevel,
    limits: input.limits,
    status: "ready" as const,
    currentGate: "none" as const,
    progress: { totalWorkItems: graph.workItems.length, completedWorkItems: graph.workItems.filter((item) => item.status === "completed").length, queuedWorkItems: 0, denominator: "frozen-work-graph" as const },
    version: 1,
    startedAt: now,
    createdAt: now
  };
  const run: BookRun = { ...base, fingerprint: hash(base) };
  await writeJson(runPath(root, bookRunId), run);
  return run;
}

export async function advanceBookRun(root: string, bookRunId: string): Promise<{ run: BookRun; graph: BookWorkGraph; scheduled: Array<{ chapterId: string; workItemId: string; status: string }>; dispatched: ExecutionDispatchReceipt[] }> {
  const current = await readBookRun(root, bookRunId);
  if (!current) throw new Error("BOOK_RUN_NOT_FOUND");
  if (!["ready", "queued", "running", "gate_required"].includes(current.status)) throw new Error("BOOK_RUN_ADVANCE_INVALID");
  const graph = await refreshBookWorkGraph(root);
  const unfinished = graph.workItems.filter((item) => item.status !== "completed");
  let scheduled: Array<{ chapterId: string; workItemId: string; status: string }> = [];
  let dispatched: ExecutionDispatchReceipt[] = [];
  let status: BookRunStatus;
  let currentGate: BookRun["currentGate"] = "none";
  if (!unfinished.length) {
    status = "scope_complete";
    currentGate = "completion_audit";
  } else {
    const result = await scheduleReadyExecutionWork(root, current.projectSlug);
    scheduled = result.scheduled.map((item) => ({ chapterId: item.chapterId, workItemId: item.workItem.workItemId, status: item.workItem.status }));
    dispatched = await dispatchQueuedExecutionWorkItems(root, current.projectSlug);
    const readyItems = graph.workItems.filter((item) => item.status === "ready");
    if (scheduled.some((item) => item.status === "failed")) { status = "failed_recoverable"; currentGate = "author_required"; }
    else if (!scheduled.length && readyItems.length) { status = "gate_required"; currentGate = "author_required"; }
    else if (!scheduled.length || scheduled.every((item) => item.status === "blocked")) { status = "gate_required"; currentGate = "author_required"; }
    else if (dispatched.some((item) => item.status === "dispatched")) status = "running";
    else status = "queued";
  }
  const executionItems = await listExecutionWorkItems(root);
  const nextBase = {
    ...current,
    status,
    currentGate,
    workGraphFingerprint: graph.fingerprint,
    progress: {
      totalWorkItems: graph.workItems.length,
      completedWorkItems: graph.workItems.filter((item) => item.status === "completed").length,
      queuedWorkItems: executionItems.filter((item) => ["queued", "claimed", "running"].includes(item.status)).length,
      denominator: "frozen-work-graph" as const
    },
    version: current.version + 1
  };
  const { fingerprint: _old, ...withoutFingerprint } = nextBase;
  const next: BookRun = { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
  await writeJson(runPath(root, bookRunId), next);
  return { run: next, graph, scheduled, dispatched };
}

export async function controlBookRun(root: string, bookRunId: string, input: { action: "pause" | "resume" | "stop"; expectedVersion: number }): Promise<BookRun> {
  const current = await readBookRun(root, bookRunId);
  if (!current) throw new Error("BOOK_RUN_NOT_FOUND");
  if (current.version !== input.expectedVersion) throw new Error("BOOK_RUN_VERSION_CONFLICT");
  const quiescence = await evaluateBookRunQuiescence(root);
  let status: BookRunStatus;
  let currentGate: BookRun["currentGate"] = current.currentGate;
  if (input.action === "pause") {
    if (!quiescence.quiescent) { status = "pausing"; currentGate = "quiescence_required"; }
    else { status = "paused"; currentGate = "none"; }
  } else if (input.action === "resume") {
    if (!["paused", "pausing", "ready"].includes(current.status)) throw new Error("BOOK_RUN_RESUME_INVALID");
    status = "ready"; currentGate = "none";
  } else {
    if (!quiescence.quiescent) { status = "stopping"; currentGate = "quiescence_required"; }
    else { status = "stopped"; currentGate = "none"; }
  }
  const now = new Date().toISOString();
  const base = { ...current, status, currentGate, version: current.version + 1, ...(status === "paused" ? { pausedAt: now } : {}), ...(status === "stopped" ? { finishedAt: now } : {}) };
  const { fingerprint: _old, ...withoutFingerprint } = base;
  const nextVersion = current.version + 1;
  let quiescenceProofRef: string | undefined;
  if ((status === "paused" || status === "stopped") && quiescence.quiescent) {
    await issueQuiescenceProof(root, { bookRunId, runVersion: nextVersion });
    quiescenceProofRef = `sessions/book-runs/${bookRunId}.quiescence.v${nextVersion}.json`;
  }
  const nextBaseWithProof = { ...withoutFingerprint, version: nextVersion, ...(quiescenceProofRef ? { quiescenceProofRef } : {}) };
  const next: BookRun = { ...nextBaseWithProof, fingerprint: hash(nextBaseWithProof) };
  await writeJson(runPath(root, bookRunId), next);
  await fs.mkdir(path.dirname(eventPath(root, bookRunId)), { recursive: true });
  await fs.appendFile(eventPath(root, bookRunId), `${JSON.stringify({ schemaVersion: "book-run-control-event.v1", bookRunId, action: input.action, fromStatus: current.status, toStatus: next.status, expectedVersion: input.expectedVersion, quiescence, createdAt: now, fingerprint: hash({ bookRunId, action: input.action, fromStatus: current.status, toStatus: next.status, expectedVersion: input.expectedVersion, quiescence, createdAt: now })})}\n`, "utf8");
  return next;
}

export async function retryBookRun(root: string, bookRunId: string, input: { expectedVersion: number }): Promise<{ run: BookRun; failedWorkItemId: string; replacementWorkItemId: string; dispatched: ExecutionDispatchReceipt[] }> {
  const current = await readBookRun(root, bookRunId);
  if (!current) throw new Error("BOOK_RUN_NOT_FOUND");
  if (current.version !== input.expectedVersion) throw new Error("BOOK_RUN_VERSION_CONFLICT");
  if (current.status !== "failed_recoverable") throw new Error("BOOK_RUN_RETRY_INVALID");
  const graph = await refreshBookWorkGraph(root);
  const items = await listExecutionWorkItems(root);
  const failed = items.find((item) => item.status === "failed" && graph.workItems.some((work) => work.chapterId === item.chapterId && work.status !== "completed"));
  if (!failed) throw new Error("BOOK_RUN_FAILED_ITEM_NOT_FOUND");
  const replacement = await enqueueExecutionWorkItem(root, current.projectSlug, failed.chapterId, `book-run-retry-${bookRunId}-${failed.workItemId}`);
  const dispatched = replacement.status === "queued" ? await dispatchQueuedExecutionWorkItems(root, current.projectSlug) : [];
  const nextStatus: BookRunStatus = replacement.status === "blocked" ? "gate_required" : dispatched.some((item) => item.workItemId === replacement.workItemId && item.status === "dispatched") ? "running" : "queued";
  const base = { ...current, status: nextStatus, currentGate: replacement.status === "blocked" ? "author_required" as const : "none" as const, recoveryReplacementWorkItemId: replacement.workItemId, version: current.version + 1 };
  const { fingerprint: _old, ...withoutFingerprint } = base;
  const next: BookRun = { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
  await writeJson(runPath(root, bookRunId), next);
  await fs.mkdir(path.dirname(eventPath(root, bookRunId)), { recursive: true });
  await fs.appendFile(eventPath(root, bookRunId), `${JSON.stringify({ schemaVersion: "book-run-recovery-event.v1", bookRunId, failedWorkItemId: failed.workItemId, replacementWorkItemId: replacement.workItemId, expectedVersion: input.expectedVersion, createdAt: new Date().toISOString() })}\n`, "utf8");
  return { run: next, failedWorkItemId: failed.workItemId, replacementWorkItemId: replacement.workItemId, dispatched };
}

export function bookRunGraph(graph: BookWorkGraph): Pick<BookRun, "workGraphRef" | "workGraphFingerprint"> { return { workGraphRef: "sessions/book-work-graph.json", workGraphFingerprint: graph.fingerprint }; }

export async function markBookRunAudited(root: string, bookRunId: string, auditRef: string): Promise<BookRun> {
  const current = await readBookRun(root, bookRunId);
  if (!current) throw new Error("BOOK_RUN_NOT_FOUND");
  if (current.status !== "scope_complete") throw new Error("COMPLETION_SCOPE_REQUIRED");
  const base = { ...current, status: "audited_complete" as const, currentGate: "none" as const, completionAuditRef: auditRef, finishedAt: current.finishedAt || new Date().toISOString(), version: current.version + 1 };
  const { fingerprint: _old, ...withoutFingerprint } = base;
  const next: BookRun = { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
  await writeJson(runPath(root, bookRunId), next);
  return next;
}

export async function markBookRunRepairRequired(root: string, bookRunId: string): Promise<BookRun> {
  const current = await readBookRun(root, bookRunId);
  if (!current) throw new Error("BOOK_RUN_NOT_FOUND");
  if (current.status !== "audited_complete") return current;
  const base = { ...current, status: "repair_required" as const, currentGate: "completion_audit" as const, version: current.version + 1 };
  const { fingerprint: _old, ...withoutFingerprint } = base;
  const next: BookRun = { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
  await writeJson(runPath(root, bookRunId), next);
  return next;
}
