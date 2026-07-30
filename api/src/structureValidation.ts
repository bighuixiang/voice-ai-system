import crypto from "node:crypto";
import { listCausalityEdges } from "./causalityGraph.js";
import { listChapterFunctionContracts } from "./chapterFunction.js";
import { listSceneCardContracts } from "./sceneCard.js";

export type StructureIssueKind = "orphan-chapter" | "unchanged-scene-state" | "dangling-causal-node" | "empty-structure";
export interface StructureValidationReport { schemaVersion: "structure-validation-report.v1"; projectSlug: string; chapterCount: number; sceneCount: number; edgeCount: number; status: "passed" | "blocked"; issues: Array<{ kind: StructureIssueKind; ids: string[]; detail: string }>; fingerprint: string; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function validateNarrativeStructure(root: string, projectSlug: string): Promise<StructureValidationReport> {
  const [chapters, scenes, edges] = await Promise.all([listChapterFunctionContracts(root, projectSlug), listSceneCardContracts(root, projectSlug), listCausalityEdges(root, projectSlug)]);
  const issues: StructureValidationReport["issues"] = [];
  const sceneChapterIds = new Set(scenes.map((scene) => scene.chapterId));
  for (const chapter of chapters) if (!sceneChapterIds.has(chapter.chapterId)) issues.push({ kind: "orphan-chapter", ids: [chapter.chapterId], detail: "Chapter has no scene card." });
  for (const scene of scenes) if (scene.entryState.trim() === scene.exitState.trim()) issues.push({ kind: "unchanged-scene-state", ids: [scene.sceneId], detail: "Scene entry and exit state are identical." });
  const nodeIds = new Set([...chapters.map((chapter) => chapter.chapterId), ...scenes.map((scene) => scene.sceneId)]);
  for (const edge of edges) { const missing = [edge.sourceNodeId, edge.targetNodeId].filter((id) => !nodeIds.has(id)); if (missing.length) issues.push({ kind: "dangling-causal-node", ids: [edge.edgeId, ...missing], detail: "Causal edge references a node outside the project structure." }); }
  if (!chapters.length && !scenes.length && !edges.length) issues.push({ kind: "empty-structure", ids: [], detail: "No structural contracts exist for the project." });
  const reportBase = { schemaVersion: "structure-validation-report.v1" as const, projectSlug, chapterCount: chapters.length, sceneCount: scenes.length, edgeCount: edges.length, status: issues.length ? "blocked" as const : "passed" as const, issues };
  return { ...reportBase, fingerprint: hash(reportBase) };
}
