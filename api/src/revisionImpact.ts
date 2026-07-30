import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readRevisionIntent } from "./revisionIntent.js";

interface DependencyGraph { edges?: Array<{ from?: string; to?: string }>; }

export interface RevisionImpactReport {
  schemaVersion: "revision-impact-report.v1";
  intentId: string;
  status: "needs_review" | "ready_for_candidate";
  directChapterIds: string[];
  transitiveChapterIds: string[];
  protectedItems: string[];
  unknownDependencies: string[];
  generatedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

async function readGraph(root: string): Promise<DependencyGraph | null> {
  try { return JSON.parse(await fs.readFile(resolveInside(root, "sessions/revisions/dependency-graph.json"), "utf8")) as DependencyGraph; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function buildRevisionImpactReport(root: string, intentId: string): Promise<RevisionImpactReport> {
  const intent = await readRevisionIntent(root, intentId);
  if (!intent) throw new Error("REVISION_INTENT_NOT_FOUND");
  const graph = await readGraph(root);
  const direct = [...new Set(intent.scope.chapterIds)].sort();
  const impacted = new Set(direct);
  const unknownDependencies: string[] = [];
  if (!graph) unknownDependencies.push("dependency-graph-missing");
  else {
    const edges = (graph.edges || []).filter((edge) => typeof edge.from === "string" && typeof edge.to === "string") as Array<{ from: string; to: string }>;
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of edges) if (impacted.has(edge.from) && !impacted.has(edge.to)) { impacted.add(edge.to); changed = true; }
    }
  }
  const base = {
    schemaVersion: "revision-impact-report.v1" as const,
    intentId,
    status: (unknownDependencies.length || intent.protectedItems.length ? "needs_review" : "ready_for_candidate") as RevisionImpactReport["status"],
    directChapterIds: direct,
    transitiveChapterIds: [...impacted].sort(),
    protectedItems: [...intent.protectedItems],
    unknownDependencies,
    generatedAt: new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}
