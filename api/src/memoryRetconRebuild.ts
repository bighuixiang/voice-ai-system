import fs from "node:fs/promises";
import path from "node:path";
import type { NovelProject } from "./types.js";
import { resolveInside } from "./pathSafety.js";
import { rebuildKnowledgeIndex } from "./knowledgeIndex.js";
import { buildStoryGraphProjection } from "./storyGraph.js";
import type { MemoryRetconImpactReport } from "./memoryRetconImpact.js";
import { invalidateDerivedPublications } from "./derivedPublication.js";

export interface MemoryRetconRebuildResult {
  schemaVersion: "memory-retcon-rebuild.v1";
  status: "executed" | "blocked";
  executedActions: string[];
  invalidationManifestPath: string;
  reason: string;
}

export async function executeMemoryRetconRebuild(root: string, project: NovelProject, report: MemoryRetconImpactReport): Promise<MemoryRetconRebuildResult> {
  if (report.status !== "blocked-until-rebuild") return { schemaVersion: "memory-retcon-rebuild.v1", status: "executed", executedActions: [], invalidationManifestPath: "memory/retcon-invalidations.jsonl", reason: "NO_REBUILD_REQUIRED" };
  await rebuildKnowledgeIndex(root, project);
  await buildStoryGraphProjection(root, project);
  const invalidatedDerivedPublicationIds = await invalidateDerivedPublications(root, report.claimId, report.reason);
  const manifestRelativePath = "memory/retcon-invalidations.jsonl";
  const manifestPath = resolveInside(root, manifestRelativePath);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  const record = { schemaVersion: "memory-retcon-invalidation.v1", claimId: report.claimId, replacementClaimVersion: report.replacementClaimVersion, affectedPaths: report.affectedPaths, actions: report.actions, invalidatedDerivedPublicationIds, status: "stale-until-downstream-revalidation", reason: report.reason, createdAt: new Date().toISOString() };
  await fs.appendFile(manifestPath, `${JSON.stringify(record)}\n`, "utf8");
  return { schemaVersion: "memory-retcon-rebuild.v1", status: "executed", executedActions: report.actions, invalidationManifestPath: manifestRelativePath, reason: "PROJECTIONS_REBUILT_DOWNSTREAM_REVALIDATION_REQUIRED" };
}
