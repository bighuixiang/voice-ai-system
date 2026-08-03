import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readChapterSettlementProjectionClosure } from "./chapterSettlementProjectionClosure.js";
import { readChapterSettlement } from "./chapterSettlement.js";
import { readMilestoneRepairPlan } from "./milestoneRepairPlan.js";
import { readMilestoneRepairCompletion } from "./milestoneRepairCompletion.js";

export interface BookWorkItem {
  workItemId: string;
  chapterId: string;
  kind: "draft" | "repair";
  dependencyWorkItemIds: string[];
  status: "ready" | "blocked" | "completed";
  settlementId?: string;
  repairPlanId?: string;
  repairActionId?: string;
  priority?: number;
  resourceClass?: "model" | "repair" | "projection";
  createdAt?: string;
}

export interface BookWorkGraph {
  schemaVersion: "book-work-graph.v1";
  graphId: string;
  projectSlug: string;
  version: number;
  workItems: BookWorkItem[];
  updatedAt: string;
  fingerprint: string;
}

function graphPath(root: string): string { return resolveInside(root, "sessions/book-work-graph.json"); }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export function assertBookWorkGraphIntegrity(graph: BookWorkGraph): BookWorkGraph {
  const { fingerprint: _fingerprint, ...base } = graph;
  const items = graph.workItems;
  const ids = new Set(items?.map((item) => item.workItemId));
  const itemsValid = Array.isArray(items) && items.every((item) => Boolean(item && typeof item.workItemId === "string" && item.workItemId.trim() && typeof item.chapterId === "string" && item.chapterId.trim() && ["draft", "repair"].includes(item.kind) && ["ready", "blocked", "completed"].includes(item.status) && Array.isArray(item.dependencyWorkItemIds) && item.dependencyWorkItemIds.every((dependency) => typeof dependency === "string" && dependency.trim() && dependency !== item.workItemId) && (item.priority === undefined || Number.isFinite(item.priority)) && (item.resourceClass === undefined || ["model", "repair", "projection"].includes(item.resourceClass)) && (item.createdAt === undefined || Number.isFinite(Date.parse(item.createdAt))))) && ids.size === items.length && items.every((item) => item.dependencyWorkItemIds.every((dependency) => ids.has(dependency)));
  const valid = graph.schemaVersion === "book-work-graph.v1" && Boolean(graph.graphId?.trim() && graph.projectSlug?.trim() && graph.updatedAt?.trim()) && Number.isInteger(graph.version) && graph.version > 0 && itemsValid && /^[a-f0-9]{64}$/i.test(graph.fingerprint) && hash(base) === graph.fingerprint;
  if (!valid) throw new Error("BOOK_WORK_GRAPH_INTEGRITY_FAILED");
  return graph;
}

export async function readBookWorkGraph(root: string): Promise<BookWorkGraph | null> {
  try {
    const graph = JSON.parse(await fs.readFile(graphPath(root), "utf8")) as BookWorkGraph;
    return assertBookWorkGraphIntegrity(graph);
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function createBookWorkGraph(root: string, projectSlug: string, chapterIds: string[]): Promise<BookWorkGraph> {
  const existing = await readBookWorkGraph(root);
  if (existing) return existing;
  const createdAt = new Date().toISOString();
  const workItems: BookWorkItem[] = chapterIds.map((chapterId, index) => ({
    workItemId: `book-draft-${chapterId}`,
    chapterId,
    kind: "draft" as const,
    dependencyWorkItemIds: index ? [`book-draft-${chapterIds[index - 1]}`] : [],
    status: index ? "blocked" as const : "ready" as const,
    priority: 50,
    resourceClass: "model" as const,
    createdAt
  }));
  const base = { schemaVersion: "book-work-graph.v1" as const, graphId: `book-${projectSlug}`, projectSlug, version: 1, workItems, updatedAt: new Date().toISOString() };
  const graph: BookWorkGraph = { ...base, fingerprint: hash(base) };
  await writeJson(graphPath(root), graph);
  return graph;
}

export async function refreshBookWorkGraph(root: string): Promise<BookWorkGraph> {
  const graph = await readBookWorkGraph(root);
  if (!graph) throw new Error("BOOK_WORK_GRAPH_NOT_FOUND");
  const settlementDir = resolveInside(root, "sessions/chapter-settlements");
  const settledIds = new Map<string, string>();
  const closureDir = resolveInside(root, "sessions/chapter-settlement-projection-closures");
  const closureNames = await fs.readdir(closureDir).catch(() => [] as string[]);
  for (const item of await fs.readdir(settlementDir).catch(() => [] as string[])) {
    if (!item.endsWith(".json")) continue;
    try {
      const settlement = await readChapterSettlement(root, item.slice(0, -5));
      if (settlement && settlement.projectSlug === graph.projectSlug && settlement.status === "settled" && settlement.chapterId && settlement.settlementId) {
        const closureRequired = Boolean(settlement.evidence);
        let closureReady = !closureRequired;
        if (closureRequired) {
          for (const closureName of closureNames.filter((entry) => entry.endsWith(".json"))) {
            const closure = await readChapterSettlementProjectionClosure(root, closureName.slice(0, -5)).catch(() => null);
            if (closure && closure.projectSlug === graph.projectSlug && closure.chapterId === settlement.chapterId && closure.settlementId === settlement.settlementId) { closureReady = true; break; }
          }
        }
        if (closureReady) settledIds.set(settlement.chapterId, settlement.settlementId);
      }
    } catch { /* ignore malformed projection input; source transaction remains authoritative */ }
  }
  let changed = false;
  const existingIds = new Set(graph.workItems.map((item) => item.workItemId));
  const repairDir = resolveInside(root, "sessions/milestone-repair-plans");
  const repairNames = await fs.readdir(repairDir).catch(() => [] as string[]);
  const completionDir = resolveInside(root, "sessions/milestone-repair-completions");
  const completionNames = await fs.readdir(completionDir).catch(() => [] as string[]);
  const completedRepairIds = new Set<string>();
  for (const completionName of completionNames.filter((entry) => entry.endsWith(".json"))) {
    const completion = await readMilestoneRepairCompletion(root, completionName.slice(0, -5)).catch(() => null);
    if (completion && completion.projectSlug === graph.projectSlug) completedRepairIds.add(completion.workItemId);
  }
  const repairItems: BookWorkItem[] = [];
  for (const repairName of repairNames.filter((entry) => entry.endsWith(".json")).sort()) {
    const plan = await readMilestoneRepairPlan(root, repairName.slice(0, -5)).catch(() => null);
    if (!plan || plan.projectSlug !== graph.projectSlug || plan.status !== "planned") continue;
    const dependencies = graph.workItems.filter((item) => item.kind === "draft" && plan.scopedChapterIds.includes(item.chapterId)).map((item) => item.workItemId);
    for (const action of plan.actions) {
      const workItemId = `book-repair-${action.actionId}`;
      if (existingIds.has(workItemId)) continue;
      repairItems.push({ workItemId, chapterId: plan.scopedChapterIds[0], kind: "repair", dependencyWorkItemIds: dependencies, status: completedRepairIds.has(workItemId) ? "completed" : dependencies.every((dependency) => graph.workItems.find((item) => item.workItemId === dependency)?.status === "completed") ? "ready" : "blocked", repairPlanId: plan.planId, repairActionId: action.actionId, priority: 80, resourceClass: "repair", createdAt: new Date().toISOString() });
      changed = true;
    }
  }
  const allItems = [...graph.workItems, ...repairItems];
  const projectedStatus = new Map(allItems.map((item) => [item.workItemId, item.status]));
  const nextItems = allItems.map((item) => {
    const settlementId = settledIds.get(item.chapterId);
    if (item.kind === "draft" && settlementId && item.status !== "completed") { changed = true; projectedStatus.set(item.workItemId, "completed"); return { ...item, status: "completed" as const, settlementId }; }
    if (item.kind === "repair" && completedRepairIds.has(item.workItemId) && item.status !== "completed") { changed = true; projectedStatus.set(item.workItemId, "completed"); return { ...item, status: "completed" as const }; }
    if (item.status === "blocked" && (item.kind === "repair" || !settlementId) && item.dependencyWorkItemIds.every((dependency) => projectedStatus.get(dependency) === "completed")) {
      changed = true; projectedStatus.set(item.workItemId, "ready"); return { ...item, status: "ready" as const };
    }
    return item;
  });
  if (!changed) return graph;
  const base = { ...graph, version: graph.version + 1, workItems: nextItems, updatedAt: new Date().toISOString() };
  const { fingerprint: _old, ...withoutFingerprint } = base;
  const next: BookWorkGraph = { ...withoutFingerprint, fingerprint: hash(withoutFingerprint) };
  await writeJson(graphPath(root), next);
  return next;
}
