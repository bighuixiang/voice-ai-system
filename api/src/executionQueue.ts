import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readContextManifest } from "./contextManifest.js";
import { checkExecutionReadiness } from "./executionReadiness.js";
import { acquireWorkLease, assertWorkLease, renewWorkLease, type WorkLease } from "./workLease.js";

export interface ExecutionWorkItem {
  schemaVersion: "execution-work-item.v1";
  workItemId: string;
  projectSlug: string;
  chapterId: string;
  versionId: string;
  proofFingerprint: string;
  contextManifestId: string;
  contextFingerprint: string;
  generationManifestId?: string;
  sourceBookWorkItemId?: string;
  sourceGraphFingerprint?: string;
  status: "queued" | "blocked" | "claimed" | "running" | "completed" | "failed" | "cancelled";
  idempotencyKey: string;
  blockedReason?: "PROOF_NOT_FOUND" | "PROOF_TAMPERED" | "VERSION_TAMPERED" | "OUTLINE_SOURCE_STALE" | "EXECUTION_BINDING_STALE" | "PROOF_BLOCKED" | "VERSION_POINTER_STALE" | "CHAPTER_OUTSIDE_WINDOW" | "CONTEXT_MANIFEST_REQUIRED" | "CONTEXT_MANIFEST_STALE";
  createdAt: string;
  claimedAt?: string;
  heartbeatAt?: string;
  finishedAt?: string;
  runId?: string;
  leaseId?: string;
  writeSet?: string;
  fencingToken?: number;
  leaseExpiresAtMs?: number;
  error?: string;
  fingerprint: string;
}

function itemPath(root: string, itemId: string): string { return resolveInside(root, `sessions/execution-work-items/${itemId}.json`); }
function itemLockPath(root: string, itemId: string): string { return resolveInside(root, `sessions/execution-work-items/${itemId}.lock`); }
function fingerprint(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function itemLease(item: ExecutionWorkItem): WorkLease | undefined {
  if (!item.leaseId || !item.writeSet || !Number.isInteger(item.fencingToken) || !Number.isFinite(item.leaseExpiresAtMs) || !item.claimedAt) return undefined;
  const acquiredAtMs = Date.parse(item.claimedAt);
  if (!Number.isFinite(acquiredAtMs)) return undefined;
  return { schemaVersion: "work-lease.v1", leaseId: item.leaseId, workItemId: item.workItemId, writeSet: item.writeSet, ownerId: item.runId || "", fencingToken: item.fencingToken as number, acquiredAtMs, expiresAtMs: item.leaseExpiresAtMs as number };
}
function leaseFields(lease: WorkLease): Pick<ExecutionWorkItem, "leaseId" | "writeSet" | "fencingToken" | "leaseExpiresAtMs"> {
  return { leaseId: lease.leaseId, writeSet: lease.writeSet, fencingToken: lease.fencingToken, leaseExpiresAtMs: lease.expiresAtMs };
}

export function executionWorkItemId(chapterId: string, idempotencyKey: string): string {
  return `work-${chapterId}-${crypto.createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 12)}`;
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

async function withItemLock<T>(root: string, itemId: string, operation: () => Promise<T>): Promise<T> {
  const lockPath = itemLockPath(root, itemId);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  let handle: fs.FileHandle | null = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      handle = await fs.open(lockPath, "wx");
      await handle.writeFile(JSON.stringify({ ownerPid: process.pid, acquiredAt: new Date().toISOString() }));
      break;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "EEXIST")) throw error;
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > 30_000) {
          await fs.rm(lockPath, { force: true });
          continue;
        }
      } catch { /* another owner may have released it between stat and retry */ }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  if (!handle) throw new Error("EXECUTION_WORK_ITEM_LOCK_TIMEOUT");
  try { return await operation(); }
  finally { await handle.close(); await fs.rm(lockPath, { force: true }); }
}

export async function readExecutionWorkItem(root: string, itemId: string): Promise<ExecutionWorkItem | null> {
  try {
    const item = JSON.parse(await fs.readFile(itemPath(root, itemId), "utf8")) as ExecutionWorkItem;
    const { fingerprint: _fingerprint, ...base } = item;
    if (item.schemaVersion !== "execution-work-item.v1" || item.workItemId !== itemId || (item.sourceBookWorkItemId !== undefined && !item.sourceBookWorkItemId.trim()) || (item.sourceGraphFingerprint !== undefined && !item.sourceGraphFingerprint.trim()) || !/^[a-f0-9]{64}$/i.test(item.fingerprint) || fingerprint(base) !== item.fingerprint) throw new Error("EXECUTION_WORK_ITEM_INTEGRITY_FAILED");
    return item;
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function listExecutionWorkItems(root: string): Promise<ExecutionWorkItem[]> {
  const directory = resolveInside(root, "sessions/execution-work-items");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const items: ExecutionWorkItem[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    const item = await readExecutionWorkItem(root, name.slice(0, -5));
    if (item) items.push(item);
  }
  return items.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.workItemId.localeCompare(right.workItemId));
}

export async function enqueueExecutionWorkItem(root: string, projectSlug: string, chapterId: string, idempotencyKey: string, provenance?: { sourceBookWorkItemId?: string; sourceGraphFingerprint?: string; generationManifestId?: string }): Promise<ExecutionWorkItem> {
  const workItemId = executionWorkItemId(chapterId, idempotencyKey);
  const existing = await readExecutionWorkItem(root, workItemId);
  if (existing) {
    if (existing.projectSlug !== projectSlug || existing.chapterId !== chapterId || existing.idempotencyKey !== idempotencyKey) throw new Error("EXECUTION_WORK_ITEM_CONFLICT");
    return existing;
  }
  const readiness = await checkExecutionReadiness(root, chapterId);
  const context = await readContextManifest(root, { allowLegacyExecutionMetadata: true });
  const blockedReason = readiness.allowed ? (context ? undefined : "CONTEXT_MANIFEST_REQUIRED" as const) : readiness.reason;
  const base = {
    schemaVersion: "execution-work-item.v1" as const,
    workItemId,
    projectSlug,
    chapterId,
    versionId: readiness.version?.versionId || "",
    proofFingerprint: readiness.proof?.fingerprint || "",
    contextManifestId: context?.manifestId || "",
    contextFingerprint: context?.sourceFingerprint || "",
    ...(provenance?.generationManifestId ? { generationManifestId: provenance.generationManifestId } : {}),
    ...(provenance?.sourceBookWorkItemId ? { sourceBookWorkItemId: provenance.sourceBookWorkItemId } : {}),
    ...(provenance?.sourceGraphFingerprint ? { sourceGraphFingerprint: provenance.sourceGraphFingerprint } : {}),
    status: blockedReason ? "blocked" as const : "queued" as const,
    idempotencyKey,
    ...(blockedReason ? { blockedReason } : {}),
    createdAt: new Date().toISOString()
  };
  const item: ExecutionWorkItem = { ...base, fingerprint: fingerprint(base) };
  await writeJson(itemPath(root, workItemId), item);
  return item;
}

export async function claimExecutionWorkItem(root: string, itemId: string, runId: string): Promise<ExecutionWorkItem> {
  return withItemLock(root, itemId, async () => {
    const item = await readExecutionWorkItem(root, itemId);
    if (!item) throw new Error("EXECUTION_WORK_ITEM_NOT_FOUND");
    if (item.status !== "queued") return item;
    const context = await readContextManifest(root, { allowLegacyExecutionMetadata: true });
    if (!context || context.manifestId !== item.contextManifestId || context.sourceFingerprint !== item.contextFingerprint) {
      const blockedBase = { ...item, status: "blocked" as const, blockedReason: "CONTEXT_MANIFEST_REQUIRED" as const, error: "CONTEXT_MANIFEST_STALE", createdAt: item.createdAt };
      const { fingerprint: _old, ...blockedWithoutFingerprint } = blockedBase;
      const blocked: ExecutionWorkItem = { ...blockedWithoutFingerprint, fingerprint: fingerprint(blockedWithoutFingerprint) };
      await writeJson(itemPath(root, itemId), blocked);
      return blocked;
    }
    const now = new Date().toISOString();
    const lease = acquireWorkLease(itemLease(item), { workItemId: item.workItemId, writeSet: `chapter:${item.chapterId}`, ownerId: runId, nowMs: Date.parse(now), ttlMs: 30_000 });
    const nextBase = { ...item, status: "running" as const, runId, claimedAt: now, heartbeatAt: now, ...leaseFields(lease), createdAt: item.createdAt };
    const { fingerprint: _old, ...nextWithoutFingerprint } = nextBase;
    const next: ExecutionWorkItem = { ...nextWithoutFingerprint, fingerprint: fingerprint(nextWithoutFingerprint) };
    await writeJson(itemPath(root, itemId), next);
    return next;
  });
}

export async function heartbeatExecutionWorkItem(root: string, itemId: string, runId: string, fencingToken?: number): Promise<ExecutionWorkItem> {
  return withItemLock(root, itemId, async () => {
    const item = await readExecutionWorkItem(root, itemId);
    if (!item) throw new Error("EXECUTION_WORK_ITEM_NOT_FOUND");
    if (item.status !== "running" || item.runId !== runId) throw new Error("EXECUTION_WORK_ITEM_RUN_FENCE");
    const lease = itemLease(item);
    if (!lease) throw new Error("EXECUTION_WORK_ITEM_LEASE_REQUIRED");
    assertWorkLease(lease, { ownerId: runId, fencingToken: fencingToken ?? item.fencingToken!, nowMs: Date.now() });
    const renewed = renewWorkLease(lease, { ownerId: runId, fencingToken: fencingToken ?? item.fencingToken!, nowMs: Date.now(), ttlMs: 30_000 });
    const nextBase = { ...item, heartbeatAt: new Date().toISOString(), ...leaseFields(renewed), createdAt: item.createdAt };
    const { fingerprint: _old, ...nextWithoutFingerprint } = nextBase;
    const next: ExecutionWorkItem = { ...nextWithoutFingerprint, fingerprint: fingerprint(nextWithoutFingerprint) };
    await writeJson(itemPath(root, itemId), next);
    return next;
  });
}

export async function recoverStaleExecutionWorkItems(root: string, staleAfterMs = 30_000): Promise<ExecutionWorkItem[]> {
  const now = Date.now();
  const recovered: ExecutionWorkItem[] = [];
  for (const item of await listExecutionWorkItems(root)) {
    if (item.status !== "running") continue;
    const heartbeat = Date.parse(item.heartbeatAt || item.claimedAt || item.createdAt);
    if (!Number.isFinite(heartbeat) || now - heartbeat <= staleAfterMs) continue;
    const failed = await withItemLock(root, item.workItemId, async () => {
      const current = await readExecutionWorkItem(root, item.workItemId);
      if (!current || current.status !== "running") return current;
      const nextBase = { ...current, status: "failed" as const, error: "EXECUTION_WORK_ITEM_HEARTBEAT_STALE", finishedAt: new Date().toISOString(), createdAt: current.createdAt };
      const { fingerprint: _old, ...nextWithoutFingerprint } = nextBase;
      const next: ExecutionWorkItem = { ...nextWithoutFingerprint, fingerprint: fingerprint(nextWithoutFingerprint) };
      await writeJson(itemPath(root, item.workItemId), next);
      return next;
    });
    if (failed) recovered.push(failed);
  }
  return recovered;
}

export async function cancelExecutionWorkItem(root: string, itemId: string, input: { runId?: string; fencingToken?: number; error?: string } = {}): Promise<ExecutionWorkItem> {
  return withItemLock(root, itemId, async () => {
    const item = await readExecutionWorkItem(root, itemId);
    if (!item) throw new Error("EXECUTION_WORK_ITEM_NOT_FOUND");
    if (["completed", "failed", "cancelled"].includes(item.status)) return item;
    if (item.status === "running") {
      if (input.runId && item.runId !== input.runId) throw new Error("EXECUTION_WORK_ITEM_RUN_FENCE");
      const lease = itemLease(item);
      if (!lease) throw new Error("EXECUTION_WORK_ITEM_LEASE_REQUIRED");
      assertWorkLease(lease, { ownerId: input.runId || item.runId || "", fencingToken: input.fencingToken ?? item.fencingToken!, nowMs: Date.now() });
    } else if (!["queued", "blocked", "claimed"].includes(item.status)) {
      throw new Error("EXECUTION_WORK_ITEM_NOT_CANCELLABLE");
    }
    const nextBase = { ...item, status: "cancelled" as const, ...(input.error ? { error: input.error } : {}), finishedAt: new Date().toISOString(), createdAt: item.createdAt };
    const { fingerprint: _old, ...nextWithoutFingerprint } = nextBase;
    const next: ExecutionWorkItem = { ...nextWithoutFingerprint, fingerprint: fingerprint(nextWithoutFingerprint) };
    await writeJson(itemPath(root, itemId), next);
    return next;
  });
}

export async function finishExecutionWorkItem(root: string, itemId: string, input: { status: "completed" | "failed"; error?: string; runId?: string; fencingToken?: number }): Promise<ExecutionWorkItem> {
  return withItemLock(root, itemId, async () => {
    const item = await readExecutionWorkItem(root, itemId);
    if (!item) throw new Error("EXECUTION_WORK_ITEM_NOT_FOUND");
    if (item.status === "completed" || item.status === "failed" || item.status === "cancelled") return item;
    if (item.status !== "running") throw new Error("EXECUTION_WORK_ITEM_NOT_RUNNING");
    if (input.runId && item.runId !== input.runId) throw new Error("EXECUTION_WORK_ITEM_RUN_FENCE");
    const ownerId = input.runId || item.runId;
    const lease = itemLease(item);
    if (!lease) throw new Error("EXECUTION_WORK_ITEM_LEASE_REQUIRED");
    assertWorkLease(lease, { ownerId: ownerId || "", fencingToken: input.fencingToken ?? item.fencingToken!, nowMs: Date.now() });
    const nextBase = { ...item, status: input.status, ...(input.error ? { error: input.error } : {}), finishedAt: new Date().toISOString(), createdAt: item.createdAt };
    const { fingerprint: _old, ...nextWithoutFingerprint } = nextBase;
    const next: ExecutionWorkItem = { ...nextWithoutFingerprint, fingerprint: fingerprint(nextWithoutFingerprint) };
    await writeJson(itemPath(root, itemId), next);
    return next;
  });
}
