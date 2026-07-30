import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface BookWorkItem {
  workItemId: string;
  chapterId: string;
  kind: "draft";
  dependencyWorkItemIds: string[];
  status: "ready" | "blocked" | "completed";
  settlementId?: string;
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

export async function readBookWorkGraph(root: string): Promise<BookWorkGraph | null> {
  try { return JSON.parse(await fs.readFile(graphPath(root), "utf8")) as BookWorkGraph; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function createBookWorkGraph(root: string, projectSlug: string, chapterIds: string[]): Promise<BookWorkGraph> {
  const existing = await readBookWorkGraph(root);
  if (existing) return existing;
  const workItems: BookWorkItem[] = chapterIds.map((chapterId, index) => ({
    workItemId: `book-draft-${chapterId}`,
    chapterId,
    kind: "draft" as const,
    dependencyWorkItemIds: index ? [`book-draft-${chapterIds[index - 1]}`] : [],
    status: index ? "blocked" as const : "ready" as const
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
  for (const item of await fs.readdir(settlementDir).catch(() => [] as string[])) {
    if (!item.endsWith(".json")) continue;
    try {
      const settlement = JSON.parse(await fs.readFile(path.join(settlementDir, item), "utf8")) as { chapterId?: string; settlementId?: string; status?: string };
      if (settlement.status === "settled" && settlement.chapterId && settlement.settlementId) settledIds.set(settlement.chapterId, settlement.settlementId);
    } catch { /* ignore malformed projection input; source transaction remains authoritative */ }
  }
  let changed = false;
  const projectedStatus = new Map(graph.workItems.map((item) => [item.workItemId, item.status]));
  const nextItems = graph.workItems.map((item) => {
    const settlementId = settledIds.get(item.chapterId);
    if (settlementId && item.status !== "completed") { changed = true; projectedStatus.set(item.workItemId, "completed"); return { ...item, status: "completed" as const, settlementId }; }
    if (!settlementId && item.status === "blocked" && item.dependencyWorkItemIds.every((dependency) => projectedStatus.get(dependency) === "completed")) {
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
