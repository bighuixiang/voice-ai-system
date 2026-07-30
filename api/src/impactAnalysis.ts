import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { listCausalityEdges } from "./causalityGraph.js";
import { resolveInside } from "./pathSafety.js";

export interface ImpactAnalysis { schemaVersion: "impact-analysis.v1"; analysisId: string; projectSlug: string; rootNodeIds: string[]; affectedNodeIds: string[]; protectedNodeIds: string[]; reason: string; sourceRefs: string[]; blockers: string[]; status: "ready" | "blocked"; rollbackPoint: string; createdAt: string; fingerprint: string; }
function hash(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function file(root: string, id: string) { return resolveInside(root, `sessions/impact-analyses/${id}.json`); }
async function read<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (e) { if (e instanceof Error && "code" in e && (e as { code?: string }).code === "ENOENT") return null; throw e; } }
async function write(target: string, value: unknown) { await fs.mkdir(path.dirname(target), { recursive: true }); const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(tmp, target); }
export async function readImpactAnalysis(root: string, analysisId: string) { return read<ImpactAnalysis>(file(root, analysisId)); }
export async function createImpactAnalysis(input: { root: string; projectSlug: string; rootNodeIds: readonly string[]; protectedNodeIds: readonly string[]; reason: string; sourceRefs: readonly string[] }): Promise<ImpactAnalysis> {
  if (!input.sourceRefs.length) throw new Error("IMPACT_SOURCE_REQUIRED"); if (!input.rootNodeIds.length || !input.reason.trim()) throw new Error("IMPACT_FIELDS_REQUIRED");
  const identity = { projectSlug: input.projectSlug, rootNodeIds: [...new Set(input.rootNodeIds)].sort(), protectedNodeIds: [...new Set(input.protectedNodeIds)].sort(), reason: input.reason, sourceRefs: [...input.sourceRefs].sort() }; const analysisId = `impact-${hash(identity).slice(0, 20)}`; const existing = await readImpactAnalysis(input.root, analysisId); if (existing) return existing;
  const edges = await listCausalityEdges(input.root, input.projectSlug); const adjacency = new Map<string, string[]>(); for (const edge of edges) adjacency.set(edge.sourceNodeId, [...(adjacency.get(edge.sourceNodeId) || []), edge.targetNodeId]);
  const affected = new Set<string>(); const queue = [...identity.rootNodeIds]; while (queue.length) { const id = queue.shift()!; if (affected.has(id)) continue; affected.add(id); queue.push(...(adjacency.get(id) || [])); }
  const protectedSet = new Set(identity.protectedNodeIds); const blockers = [...affected].filter((id) => protectedSet.has(id)).map(() => "PROTECTED_NODE_AFFECTED"); const base = { schemaVersion: "impact-analysis.v1" as const, analysisId, projectSlug: input.projectSlug, rootNodeIds: identity.rootNodeIds, affectedNodeIds: [...affected].sort(), protectedNodeIds: identity.protectedNodeIds, reason: input.reason, sourceRefs: [...input.sourceRefs], blockers: [...new Set(blockers)], status: blockers.length ? "blocked" as const : "ready" as const, rollbackPoint: `rollback-${analysisId}`, createdAt: new Date().toISOString() }; const result = { ...base, fingerprint: hash(base) }; await write(file(input.root, analysisId), result); return result;
}
