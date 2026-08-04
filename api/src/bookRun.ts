import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { createBookWorkGraph, refreshBookWorkGraph, type BookWorkGraph } from "./bookWorkGraph.js";
import { cancelExecutionWorkItem, enqueueExecutionWorkItem, listExecutionWorkItems } from "./executionQueue.js";
import { scheduleReadyExecutionWork } from "./bookWorkScheduler.js";
import { inspectQuiescenceState, issueQuiescenceProof } from "./quiescenceProof.js";
import { dispatchQueuedExecutionWorkItems, type ExecutionDispatchReceipt } from "./executionDispatcher.js";
import { enqueueRuntimeCommand } from "./runtimeStore.js";
import { readRunReadinessProof } from "./runReadiness.js";
import { createFrozenPublicationScope, readFrozenPublicationScope, type FrozenPublicationScopeEvidence, type FrozenPublicationScopeEvidenceBinding } from "./frozenPublicationScope.js";
import { createPublicationDependencyGraph, readPublicationDependencyGraph } from "./publicationDependencyGraph.js";
import { persistBudgetReservation, readBudgetReservation, releaseBudgetReservation } from "./budgetReservation.js";
import { readModelInvocations } from "./modelInvocationLedger.js";
import { readRunPreflight } from "./runPreflight.js";
import { createAutonomyGrant, evaluateAutonomyGrant, readAutonomyGrant } from "./autonomyGrant.js";

export type BookRunStatus = "draft" | "ready" | "queued" | "running" | "pausing" | "paused" | "gate_required" | "repair_required" | "stopping" | "stopped" | "failed_recoverable" | "failed_terminal" | "scope_complete" | "audited_complete";
export interface BookRunLimits { maxWorkItems?: number; maxActiveWorkItems?: number; maxModelCalls?: number; maxBudgetCents?: number; deadlineAt?: string; maxWallClockMs?: number; maxConsecutiveFailures?: number; }
export interface BookRun {
  schemaVersion: "book-run.v1";
  bookRunId: string;
  projectSlug: string;
  parentRunId?: string;
  objective: string;
  scope: { chapterIds: string[]; scopeFingerprint: string };
  frozenPublicationScopeRef?: string;
  publicationDependencyGraphRef?: string;
  publicationDependencyGraphFingerprint?: string;
  startupPreflightRef?: string;
  startupPreflightFingerprint?: string;
  storyContractRef?: string;
  workGraphRef: string;
  workGraphFingerprint: string;
  autonomyGrantRef: string;
  autonomyLevel: "L0" | "L1" | "L2";
  autoContinue: boolean;
  limits: BookRunLimits;
  status: BookRunStatus;
  currentGate: "none" | "quiescence_required" | "author_required" | "completion_audit";
  progress: { totalWorkItems: number; completedWorkItems: number; queuedWorkItems: number; denominator: "frozen-work-graph" };
  version: number;
  startedAt: string;
  pausedAt?: string;
  finishedAt?: string;
  pauseReason?: "AUTONOMY_GRANT_EXPIRED" | "AUTONOMY_GRANT_REVOKED";
  completionAuditRef?: string;
  quiescenceProofRef?: string;
  recoveryReplacementWorkItemId?: string;
  createdAt: string;
  fingerprint: string;
}

async function releaseActiveRunReservations(root: string, bookRunId: string): Promise<void> {
  const directory = path.join(root, "sessions", "book-runs");
  let names: string[] = [];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return;
    throw error;
  }
  for (const name of names.filter((candidate) => candidate.endsWith(".budget-reservation.json"))) {
    const reservationId = name.slice(0, -".budget-reservation.json".length);
    const reservation = await readBudgetReservation(root, reservationId);
    if (reservation?.bookRunId === bookRunId && reservation.status === "reserved") {
      await persistBudgetReservation(root, releaseBudgetReservation(reservation));
    }
  }
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function validTimestamp(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value)); }
function runPath(root: string, id: string): string { return resolveInside(root, `sessions/book-runs/${id}.json`); }
function eventPath(root: string, id: string): string { return resolveInside(root, `sessions/book-runs/${id}.events.jsonl`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }

export function assertBookRunIntegrity(run: BookRun, expectedId?: string): BookRun {
  const { fingerprint: _fingerprint, ...base } = run;
  const statuses: BookRunStatus[] = ["draft", "ready", "queued", "running", "pausing", "paused", "gate_required", "repair_required", "stopping", "stopped", "failed_recoverable", "failed_terminal", "scope_complete", "audited_complete"];
  const gates: BookRun["currentGate"][] = ["none", "quiescence_required", "author_required", "completion_audit"];
  const progressValid = run.progress && Number.isInteger(run.progress.totalWorkItems) && run.progress.totalWorkItems >= 0 && Number.isInteger(run.progress.completedWorkItems) && run.progress.completedWorkItems >= 0 && run.progress.completedWorkItems <= run.progress.totalWorkItems && Number.isInteger(run.progress.queuedWorkItems) && run.progress.queuedWorkItems >= 0 && run.progress.denominator === "frozen-work-graph";
  const scopeValid = run.scope && Array.isArray(run.scope.chapterIds) && run.scope.chapterIds.length > 0 && run.scope.chapterIds.every((id) => typeof id === "string" && id.trim()) && typeof run.scope.scopeFingerprint === "string" && run.scope.scopeFingerprint.trim();
  const gateConsistent = run.status === "scope_complete" ? run.currentGate === "completion_audit" : run.status === "audited_complete" ? run.currentGate === "none" : (run.status === "stopping" || run.status === "pausing") ? run.currentGate === "quiescence_required" : run.status === "stopped" ? run.currentGate === "none" : true;
  const timestampsValid = validTimestamp(run.createdAt) && validTimestamp(run.startedAt) && (run.pausedAt === undefined || validTimestamp(run.pausedAt)) && (run.finishedAt === undefined || validTimestamp(run.finishedAt)) && (run.limits?.deadlineAt === undefined || validTimestamp(run.limits.deadlineAt));
  const valid = run.schemaVersion === "book-run.v1" && (!expectedId || run.bookRunId === expectedId) && Boolean(run.bookRunId?.trim() && run.projectSlug?.trim() && run.objective?.trim() && run.workGraphRef?.trim() && run.workGraphFingerprint?.trim() && run.autonomyGrantRef?.trim()) && timestampsValid && scopeValid && typeof run.autoContinue === "boolean" && ["L0", "L1", "L2"].includes(run.autonomyLevel) && statuses.includes(run.status) && gates.includes(run.currentGate) && progressValid && gateConsistent && Number.isInteger(run.version) && run.version > 0 && /^[a-f0-9]{64}$/i.test(run.fingerprint) && hash(base) === run.fingerprint;
  if (!valid) throw new Error("BOOK_RUN_INTEGRITY_FAILED");
  return run;
}

async function resolveScopeEvidence(root: string, storyContractRef?: string): Promise<FrozenPublicationScopeEvidence> {
  const unbound = (ref: string, reason: FrozenPublicationScopeEvidenceBinding["reason"] = "ARTIFACT_NOT_FOUND"): FrozenPublicationScopeEvidenceBinding => ({ status: "unbound", ref, reason });
  const bindJson = async (ref: string, target: string, accepted: (value: Record<string, unknown>) => boolean = () => true): Promise<FrozenPublicationScopeEvidenceBinding> => {
    const value = await readJson<Record<string, unknown>>(target);
    if (!value) return unbound(ref);
    if (!accepted(value)) return unbound(ref, "ARTIFACT_NOT_ACCEPTED");
    const fingerprint = typeof value.fingerprint === "string" ? value.fingerprint : "";
    return fingerprint && /^[a-f0-9]{64}$/i.test(fingerprint) ? { status: "bound", ref, fingerprint } : unbound(ref, "FINGERPRINT_MISSING");
  };
  const contractRef = storyContractRef || "sessions/story-contract-adoption-proposal.json";
  const storyContract = await bindJson(contractRef, resolveInside(root, contractRef), (value) => value.status === "committed" && value.canonWritten === true);
  const project = await readJson<{ outlineVersion?: { versionId?: string } }>(resolveInside(root, "project.json"));
  const outlineId = project?.outlineVersion?.versionId;
  const outlineVersion = outlineId
    ? await bindJson(`sessions/outline-versions/${outlineId}.json`, resolveInside(root, `sessions/outline-versions/${outlineId.replace(/[^a-zA-Z0-9._-]/g, "")}.json`), (value) => value.status === "active" && value.canonWritten === true)
    : unbound("outline-version:unbound");
  const obligationCoverage = await bindJson("sessions/obligations/coverage-certificate.json", resolveInside(root, "sessions/obligations/coverage-certificate.json"), (value) => value.schemaVersion === "obligation-coverage-certificate.v1" && value.status === "issued");
  return { storyContract, outlineVersion, obligationCoverage };
}

function validateLimits(limits: BookRunLimits): void {
  if (limits.deadlineAt !== undefined && (!Number.isFinite(Date.parse(limits.deadlineAt)) || Date.parse(limits.deadlineAt) <= 0)) throw new Error("BOOK_RUN_DEADLINE_INVALID");
  for (const [key, value] of Object.entries(limits)) {
    if (key === "deadlineAt" || value === undefined) continue;
    if (key === "maxConsecutiveFailures" && (!Number.isInteger(value) || value < 1)) throw new Error("BOOK_RUN_LIMIT_INVALID");
    if (key !== "maxConsecutiveFailures" && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) throw new Error("BOOK_RUN_LIMIT_INVALID");
  }
}

async function assertWithinLimits(root: string, run: BookRun): Promise<void> {
  const now = Date.now();
  if (run.limits.deadlineAt && now >= Date.parse(run.limits.deadlineAt)) throw new Error("BOOK_RUN_DEADLINE_EXCEEDED");
  if (run.limits.maxWallClockMs !== undefined && now - Date.parse(run.startedAt) >= run.limits.maxWallClockMs) throw new Error("BOOK_RUN_WALL_CLOCK_EXCEEDED");
  if (run.limits.maxConsecutiveFailures !== undefined) {
    const scoped = (await listExecutionWorkItems(root)).filter((item) => item.projectSlug === run.projectSlug).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    let consecutiveFailures = 0;
    for (const item of [...scoped].reverse()) {
      if (item.status !== "failed") break;
      consecutiveFailures += 1;
    }
    if (consecutiveFailures >= run.limits.maxConsecutiveFailures) throw new Error("BOOK_RUN_FAILURE_LIMIT_EXCEEDED");
  }
  const executionItems = (await listExecutionWorkItems(root)).filter((item) => item.projectSlug === run.projectSlug && run.scope.chapterIds.includes(item.chapterId) && item.status !== "cancelled");
  if (run.limits.maxWorkItems !== undefined && executionItems.length > run.limits.maxWorkItems) throw new Error("BOOK_RUN_WORK_ITEM_LIMIT_EXCEEDED");
  const invocations = (await readModelInvocations(root)).filter((record) => record.bookRunId === run.bookRunId);
  if (run.limits.maxModelCalls !== undefined && invocations.length > run.limits.maxModelCalls) throw new Error("BOOK_RUN_MODEL_CALL_LIMIT_EXCEEDED");
  if (run.limits.maxBudgetCents !== undefined) {
    const consumedCents = invocations.reduce((sum, record) => sum + record.cost.amount * 100, 0);
    if (consumedCents > run.limits.maxBudgetCents) throw new Error("BOOK_RUN_BUDGET_LIMIT_EXCEEDED");
  }
}

export async function readBookRun(root: string, bookRunId: string): Promise<BookRun | null> {
  const run = await readJson<BookRun>(runPath(root, bookRunId));
  if (!run) return null;
  const { fingerprint: _fingerprint, ...base } = run;
  return assertBookRunIntegrity(run, bookRunId);
}

export async function listBookRuns(root: string): Promise<BookRun[]> {
  const directory = resolveInside(root, "sessions/book-runs");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const runs: BookRun[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const run = await readBookRun(root, name.slice(0, -5));
    if (run) runs.push(run);
  }
  return runs.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.bookRunId.localeCompare(right.bookRunId));
}

export async function evaluateBookRunQuiescence(root: string, bookRunId?: string): Promise<{ quiescent: boolean; activeWorkItemIds: string[]; activeMutationLeases: string[]; activeMutationPlanIds: string[]; activeBudgetReservationIds: string[] }> {
  const state = await inspectQuiescenceState(root, bookRunId);
  return { ...state, quiescent: state.activeWorkItemIds.length === 0 && state.activeMutationLeases.length === 0 && state.activeMutationPlanIds.length === 0 && state.activeBudgetReservationIds.length === 0 };
}

export async function startBookRun(root: string, input: { projectSlug: string; chapterIds: string[]; objective?: string; parentRunId?: string; storyContractRef?: string; preflightId?: string; autoContinue?: boolean; autonomyLevel: "L0" | "L1" | "L2"; autonomyExpiresAt?: string; limits: BookRunLimits }): Promise<BookRun> {
  const chapterIds = [...new Set(input.chapterIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (!chapterIds.length) throw new Error("BOOK_RUN_SCOPE_REQUIRED");
  if (!Object.values(input.limits).some((value) => value !== undefined)) throw new Error("BOOK_RUN_LIMIT_REQUIRED");
  validateLimits(input.limits);
  if (input.limits.maxWorkItems !== undefined && (!Number.isInteger(input.limits.maxWorkItems) || input.limits.maxWorkItems < chapterIds.length)) throw new Error("BOOK_RUN_LIMIT_INVALID");
  let startupPreflight: Awaited<ReturnType<typeof readRunPreflight>> = null;
  if (input.preflightId) {
    startupPreflight = await readRunPreflight(root, input.preflightId);
    if (!startupPreflight) throw new Error("RUN_PREFLIGHT_REQUIRED");
    if (startupPreflight.status !== "ready") throw new Error("RUN_PREFLIGHT_BLOCKED");
    for (const [key, value] of Object.entries(input.limits)) {
      if (value === undefined || value === null) continue;
      const frozenValue = (startupPreflight.limits as unknown as Record<string, unknown>)[key];
      if (frozenValue !== undefined && Number(value) !== Number(frozenValue)) throw new Error("RUN_PREFLIGHT_LIMIT_MISMATCH");
    }
  }
  const autoContinue = input.autoContinue !== false;
  const identity = { projectSlug: input.projectSlug, chapterIds, autonomyLevel: input.autonomyLevel, autoContinue, limits: input.limits, parentRunId: input.parentRunId || "", preflightId: input.preflightId || "" };
  const bookRunId = `book-run-${hash(identity).slice(0, 24)}`;
  const existing = await readBookRun(root, bookRunId);
  if (existing) return existing;
  const graph = await createBookWorkGraph(root, input.projectSlug, chapterIds);
  const scopeFingerprint = hash({ projectSlug: input.projectSlug, chapterIds });
  const frozenScope = await createFrozenPublicationScope({ root, projectSlug: input.projectSlug, chapterIds, scopeFingerprint, evidence: await resolveScopeEvidence(root, input.storyContractRef) });
  const dependencyGraph = await createPublicationDependencyGraph({ root, projectSlug: input.projectSlug, frozenScope });
  const now = new Date().toISOString();
  const autonomyGrant = await createAutonomyGrant(root, { grantId: `grant-${bookRunId}`, projectSlug: input.projectSlug, bookRunId, chapterIds, autonomyLevel: input.autonomyLevel, expiresAt: input.autonomyExpiresAt || input.limits.deadlineAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  const base = {
    schemaVersion: "book-run.v1" as const,
    bookRunId,
    projectSlug: input.projectSlug,
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    objective: (input.objective || "Continue the governed novel within the frozen scope.").trim(),
    scope: { chapterIds, scopeFingerprint },
    frozenPublicationScopeRef: `sessions/publication-scopes/${frozenScope.scopeId}.json`,
    publicationDependencyGraphRef: `sessions/publication-dependency-graphs/${dependencyGraph.graphId}.json`,
    publicationDependencyGraphFingerprint: dependencyGraph.fingerprint,
    ...(startupPreflight ? { startupPreflightRef: `sessions/book-runs/${startupPreflight.runId}.preflight.json`, startupPreflightFingerprint: startupPreflight.fingerprint } : {}),
    ...(input.storyContractRef ? { storyContractRef: input.storyContractRef } : {}),
    workGraphRef: "sessions/book-work-graph.json",
    workGraphFingerprint: graph.fingerprint,
    autonomyGrantRef: `sessions/autonomy-grants/${autonomyGrant.grantId}.json`,
    autonomyLevel: input.autonomyLevel,
    autoContinue,
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

async function assertCurrentReadiness(root: string, run: BookRun): Promise<void> {
  const proof = await readRunReadinessProof(root, `readiness-${run.bookRunId}-v${run.version}`);
  if (!proof || proof.bookRunId !== run.bookRunId || proof.projectSlug !== run.projectSlug || proof.runVersion !== run.version || proof.scopeFingerprint !== run.scope.scopeFingerprint) {
    throw new Error("BOOK_RUN_READINESS_REQUIRED");
  }
  if (proof.status !== "ready") throw new Error(`BOOK_RUN_READINESS_BLOCKED:${proof.blockedReasons.join(",")}`);
  if (!run.frozenPublicationScopeRef) throw new Error("BOOK_RUN_FROZEN_SCOPE_REQUIRED");
  const frozenScope = await readFrozenPublicationScope(root, path.basename(run.frozenPublicationScopeRef, ".json"));
  if (!frozenScope || frozenScope.projectSlug !== run.projectSlug || frozenScope.scopeFingerprint !== run.scope.scopeFingerprint || JSON.stringify(frozenScope.chapterIds) !== JSON.stringify(run.scope.chapterIds)) throw new Error("BOOK_RUN_FROZEN_SCOPE_STALE");
  if (!run.publicationDependencyGraphRef || !run.publicationDependencyGraphFingerprint) throw new Error("BOOK_RUN_DEPENDENCY_GRAPH_REQUIRED");
  const graph = await readPublicationDependencyGraph(root, path.basename(run.publicationDependencyGraphRef, ".json"));
  if (!graph || graph.projectSlug !== run.projectSlug || graph.scopeId !== frozenScope.scopeId || graph.scopeFingerprint !== frozenScope.scopeFingerprint || graph.fingerprint !== run.publicationDependencyGraphFingerprint) throw new Error("BOOK_RUN_DEPENDENCY_GRAPH_STALE");
}

export async function advanceBookRun(root: string, bookRunId: string, options: { requireReadiness?: boolean } = {}): Promise<{ run: BookRun; graph: BookWorkGraph; scheduled: Array<{ chapterId: string; workItemId: string; status: string }>; dispatched: ExecutionDispatchReceipt[] }> {
  const current = await readBookRun(root, bookRunId);
  if (!current) throw new Error("BOOK_RUN_NOT_FOUND");
  if (!["ready", "queued", "running", "gate_required"].includes(current.status)) throw new Error("BOOK_RUN_ADVANCE_INVALID");
  if (options.requireReadiness) await assertCurrentReadiness(root, current);
  await assertWithinLimits(root, current);
  const grant = await readAutonomyGrant(root, path.basename(current.autonomyGrantRef, ".json"));
  const grantState = grant && grant.projectSlug === current.projectSlug && grant.bookRunId === current.bookRunId ? evaluateAutonomyGrant(grant) : { active: false, reason: "AUTONOMY_GRANT_EXPIRED" as const };
  if (!grantState.active) {
    const graph = await refreshBookWorkGraph(root);
    const nextBase = { ...current, status: "paused" as const, currentGate: "none" as const, pauseReason: grantState.reason, workGraphFingerprint: graph.fingerprint, version: current.version + 1 };
    const { fingerprint: _old, ...withoutFingerprint } = nextBase;
    const next: BookRun = { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
    await writeJson(runPath(root, bookRunId), next);
    return { run: next, graph, scheduled: [], dispatched: [] };
  }
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
    const completedCount = graph.workItems.filter((item) => item.status === "completed").length;
    if (!current.autoContinue && completedCount > 0) {
      status = "paused";
      currentGate = "none";
      const executionItems = await listExecutionWorkItems(root);
      const nextBase = {
        ...current,
        status,
        currentGate,
        workGraphFingerprint: graph.fingerprint,
        progress: {
          totalWorkItems: graph.workItems.length,
          completedWorkItems: completedCount,
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
    const result = await scheduleReadyExecutionWork(root, current.projectSlug);
    scheduled = result.scheduled.map((item) => ({ chapterId: item.chapterId, workItemId: item.workItem.workItemId, status: item.workItem.status }));
    dispatched = await dispatchQueuedExecutionWorkItems(root, current.projectSlug, { bookRunId: current.bookRunId, chapterIds: current.scope.chapterIds, maxActiveWorkItems: current.limits.maxActiveWorkItems, frozenPublicationScopeRef: current.frozenPublicationScopeRef, budgetReservationId: `budget-${current.bookRunId}-v${current.version}` });
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
  let quiescence = await evaluateBookRunQuiescence(root, bookRunId);
  let status: BookRunStatus;
  let currentGate: BookRun["currentGate"] = current.currentGate;
  if (input.action === "pause") {
    if (!quiescence.quiescent) { status = "pausing"; currentGate = "quiescence_required"; }
    else { status = "paused"; currentGate = "none"; }
  } else if (input.action === "resume") {
    if (!["paused", "pausing", "ready"].includes(current.status)) throw new Error("BOOK_RUN_RESUME_INVALID");
    const grant = await readAutonomyGrant(root, path.basename(current.autonomyGrantRef, ".json"));
    if (!grant || grant.projectSlug !== current.projectSlug || grant.bookRunId !== current.bookRunId || !evaluateAutonomyGrant(grant).active) throw new Error("BOOK_RUN_AUTONOMY_GRANT_INVALID");
    status = "ready"; currentGate = "none";
  } else {
    const scopedItems = (await listExecutionWorkItems(root)).filter((item) => item.projectSlug === current.projectSlug && current.scope.chapterIds.includes(item.chapterId));
    for (const item of scopedItems.filter((candidate) => ["queued", "blocked"].includes(candidate.status) && (!candidate.runId || candidate.runId === current.bookRunId))) {
      await cancelExecutionWorkItem(root, item.workItemId, { error: "BOOK_RUN_STOP_REQUESTED" });
    }
    for (const item of scopedItems.filter((candidate) => ["claimed", "running"].includes(candidate.status) && candidate.runId)) {
      enqueueRuntimeCommand({ projectSlug: current.projectSlug, runId: item.runId, type: "stop", payload: { reason: "BOOK_RUN_STOP_REQUESTED", bookRunId }, idempotencyKey: `book-run-stop-${bookRunId}-${item.workItemId}` });
    }
    // Stop releases the run-level budget preallocation before proving quiescence;
    // per-attempt spend is already recorded in the invocation ledger.
    await releaseActiveRunReservations(root, current.bookRunId);
    quiescence = await evaluateBookRunQuiescence(root, bookRunId);
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
  const dispatched = replacement.status === "queued" ? await dispatchQueuedExecutionWorkItems(root, current.projectSlug, { bookRunId: current.bookRunId, chapterIds: current.scope.chapterIds, maxActiveWorkItems: current.limits.maxActiveWorkItems, frozenPublicationScopeRef: current.frozenPublicationScopeRef, budgetReservationId: `budget-${current.bookRunId}-v${current.version}` }) : [];
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

export async function refreshBookRunWorkGraphPointer(root: string, bookRunId: string): Promise<BookRun> {
  const current = await readBookRun(root, bookRunId);
  if (!current) throw new Error("BOOK_RUN_NOT_FOUND");
  const graph = await refreshBookWorkGraph(root);
  if (current.workGraphFingerprint === graph.fingerprint) return current;
  const base = {
    ...current,
    workGraphFingerprint: graph.fingerprint,
    progress: {
      ...current.progress,
      totalWorkItems: graph.workItems.length,
      completedWorkItems: graph.workItems.filter((item) => item.status === "completed").length
    },
    version: current.version + 1
  };
  const { fingerprint: _old, ...withoutFingerprint } = base;
  const next: BookRun = { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
  await writeJson(runPath(root, bookRunId), next);
  return next;
}

export async function refreshBookRunDependencyGraph(root: string, bookRunId: string, fingerprint: string): Promise<BookRun> {
  const current = await readBookRun(root, bookRunId);
  if (!current) throw new Error("BOOK_RUN_NOT_FOUND");
  if (!fingerprint.trim()) throw new Error("BOOK_RUN_DEPENDENCY_GRAPH_FINGERPRINT_REQUIRED");
  if (current.publicationDependencyGraphFingerprint === fingerprint) return current;
  const base = { ...current, publicationDependencyGraphFingerprint: fingerprint };
  const { fingerprint: _old, ...withoutFingerprint } = base;
  const next: BookRun = { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
  await writeJson(runPath(root, bookRunId), next);
  return next;
}

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
