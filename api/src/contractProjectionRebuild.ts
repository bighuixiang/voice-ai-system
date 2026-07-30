import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { NovelProject } from "./types.js";
import { resolveInside } from "./pathSafety.js";
import { buildStoryGraphProjection } from "./storyGraph.js";
import { rebuildKnowledgeIndex } from "./knowledgeIndex.js";

interface ProjectionInvalidationEvent {
  schemaVersion: "projection-invalidation-event.v1";
  mutationId: string;
  candidateId: string;
  reviewId: string;
  affectedProjections: string[];
  createdAt: string;
}

export interface ProjectionRebuildReceipt {
  schemaVersion: "projection-rebuild-receipt.v1";
  receiptId: string;
  projectSlug: string;
  mutationIds: string[];
  projections: Array<{ name: "story-graph" | "knowledge-index"; status: "rebuilt"; outputFingerprint: string }>;
  createdAt: string;
  fingerprint: string;
}

export interface ProjectionFreshness {
  schemaVersion: "projection-freshness.v1";
  projectSlug: string;
  status: "current" | "stale" | "unknown";
  pendingMutationIds: string[];
  receiptId?: string;
  checkedAt: string;
}

export interface ProjectionFreshnessMonitorEvent {
  schemaVersion: "projection-freshness-monitor-event.v1";
  eventId: string;
  projectSlug: string;
  freshness: ProjectionFreshness;
  createdAt: string;
}

function receiptPath(root: string): string {
  return resolveInside(root, "sessions/projection-rebuild-receipt.json");
}

function hasValidReceiptFingerprint(value: Record<string, unknown>): boolean {
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(value.fingerprint)) return false;
  const { fingerprint: _fingerprint, ...base } = value;
  return crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") === value.fingerprint;
}

async function readInvalidations(root: string): Promise<ProjectionInvalidationEvent[]> {
  try {
    const lines = (await fs.readFile(resolveInside(root, "sessions/projection-invalidation-events.jsonl"), "utf8")).split(/\r?\n/).filter(Boolean);
    return lines.map((line) => JSON.parse(line) as ProjectionInvalidationEvent);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

export async function readProjectionRebuildReceipt(root: string): Promise<ProjectionRebuildReceipt | null> {
  try {
    const receipt = JSON.parse(await fs.readFile(receiptPath(root), "utf8")) as ProjectionRebuildReceipt;
    if (!hasValidReceiptFingerprint(receipt as unknown as Record<string, unknown>)) throw new Error("PROJECTION_REBUILD_RECEIPT_INTEGRITY_FAILED");
    if (
      receipt.schemaVersion !== "projection-rebuild-receipt.v1" ||
      typeof receipt.receiptId !== "string" || !receipt.receiptId.trim() ||
      typeof receipt.projectSlug !== "string" || !receipt.projectSlug.trim() ||
      !Array.isArray(receipt.mutationIds) || receipt.mutationIds.some((mutationId) => typeof mutationId !== "string" || !mutationId.trim()) ||
      !Array.isArray(receipt.projections) ||
      typeof receipt.createdAt !== "string" || !Number.isFinite(Date.parse(receipt.createdAt))
    ) throw new Error("PROJECTION_REBUILD_RECEIPT_SEMANTIC_MISMATCH");
    return receipt;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function rebuildContractProjections(root: string, project: NovelProject): Promise<ProjectionRebuildReceipt | null> {
  const invalidations = await readInvalidations(root);
  if (invalidations.length === 0) return readProjectionRebuildReceipt(root);
  const graph = await buildStoryGraphProjection(root, project);
  const knowledge = await rebuildKnowledgeIndex(root, project);
  const base = {
    schemaVersion: "projection-rebuild-receipt.v1" as const,
    receiptId: `projection-rebuild-${project.slug}-${Date.now()}`,
    projectSlug: project.slug,
    mutationIds: [...new Set(invalidations.map((event) => event.mutationId))],
    projections: [
      { name: "story-graph" as const, status: "rebuilt" as const, outputFingerprint: crypto.createHash("sha256").update(JSON.stringify(graph)).digest("hex") },
      { name: "knowledge-index" as const, status: "rebuilt" as const, outputFingerprint: crypto.createHash("sha256").update(JSON.stringify(knowledge)).digest("hex") }
    ],
    createdAt: new Date().toISOString()
  };
  const receipt: ProjectionRebuildReceipt = { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
  const target = receiptPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return receipt;
}

export async function readContractProjectionFreshness(root: string, projectSlug: string): Promise<ProjectionFreshness> {
  const invalidations = await readInvalidations(root);
  const receipt = await readProjectionRebuildReceipt(root);
  if (receipt && receipt.projectSlug !== projectSlug) throw new Error("PROJECTION_REBUILD_RECEIPT_SEMANTIC_MISMATCH");
  if (receipt) {
    const knownMutationIds = new Set(invalidations.map((event) => event.mutationId));
    if (receipt.mutationIds.some((mutationId) => !knownMutationIds.has(mutationId))) throw new Error("PROJECTION_REBUILD_RECEIPT_SEMANTIC_MISMATCH");
  }
  const completed = new Set(receipt?.mutationIds || []);
  const pendingMutationIds = [...new Set(invalidations.map((event) => event.mutationId).filter((mutationId) => !completed.has(mutationId)))];
  return {
    schemaVersion: "projection-freshness.v1",
    projectSlug,
    status: !receipt && invalidations.length === 0 ? "unknown" : pendingMutationIds.length > 0 ? "stale" : "current",
    pendingMutationIds,
    ...(receipt ? { receiptId: receipt.receiptId } : {}),
    checkedAt: new Date().toISOString()
  };
}

export async function monitorContractProjectionFreshness(root: string, projectSlug: string): Promise<ProjectionFreshnessMonitorEvent> {
  const freshness = await readContractProjectionFreshness(root, projectSlug);
  const event: ProjectionFreshnessMonitorEvent = {
    schemaVersion: "projection-freshness-monitor-event.v1",
    eventId: `projection-freshness-${projectSlug}-${Date.now()}-${crypto.randomUUID()}`,
    projectSlug,
    freshness,
    createdAt: new Date().toISOString()
  };
  const target = resolveInside(root, "sessions/projection-freshness-events.jsonl");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function readProjectionFreshnessEvents(root: string): Promise<ProjectionFreshnessMonitorEvent[]> {
  try {
    return (await fs.readFile(resolveInside(root, "sessions/projection-freshness-events.jsonl"), "utf8"))
      .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as ProjectionFreshnessMonitorEvent);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
}

export function startProjectionFreshnessMonitor(
  root: string,
  projectSlug: string,
  options: { intervalMs?: number; onStale?: (event: ProjectionFreshnessMonitorEvent) => void } = {}
): () => void {
  const intervalMs = options.intervalMs ?? 60_000;
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    const event = await monitorContractProjectionFreshness(root, projectSlug);
    if (!stopped && event.freshness.status === "stale") options.onStale?.(event);
  };
  void run();
  const timer = setInterval(() => { void run(); }, intervalMs);
  return () => { stopped = true; clearInterval(timer); };
}
