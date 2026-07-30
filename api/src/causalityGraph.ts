import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type CausalityRelation = "requires" | "enables" | "complicates" | "reveals" | "pays_off" | "conflicts_with";
export interface CausalityEdge { schemaVersion: "narrative-causality-edge.v1"; edgeId: string; projectSlug: string; sourceNodeId: string; targetNodeId: string; relation: CausalityRelation; trigger: string; consequence: string; delayedConsequence: string; evidenceRefs: string[]; status: "candidate" | "validated" | "blocked"; createdAt: string; fingerprint: string; }
export interface CausalityGraphReport { projectSlug: string; edgeCount: number; status: "passed" | "blocked"; issues: Array<{ kind: "cycle" | "isolated" | "missing-evidence"; edgeIds: string[]; detail: string }>; fingerprint: string; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function edgePath(root: string, id: string): string { return resolveInside(root, `sessions/causality-edges/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
export async function readCausalityEdge(root: string, edgeId: string): Promise<CausalityEdge | null> { return readJson<CausalityEdge>(edgePath(root, edgeId)); }
export async function listCausalityEdges(root: string, projectSlug: string): Promise<CausalityEdge[]> { const directory = resolveInside(root, "sessions/causality-edges"); let names: string[]; try { names = await fs.readdir(directory); } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return []; throw error; } const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => readJson<CausalityEdge>(path.join(directory, name)))); return records.filter((record): record is CausalityEdge => Boolean(record && record.projectSlug === projectSlug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export async function createCausalityEdge(input: { root: string; projectSlug: string; edgeId: string; sourceNodeId: string; targetNodeId: string; relation: CausalityRelation; trigger: string; consequence: string; delayedConsequence: string; evidenceRefs: readonly string[] }): Promise<CausalityEdge> {
  if (input.sourceNodeId === input.targetNodeId) throw new Error("CAUSALITY_SELF_LOOP");
  if (!input.projectSlug.trim() || !input.edgeId.trim() || !input.sourceNodeId.trim() || !input.targetNodeId.trim() || !input.trigger.trim() || !input.consequence.trim() || !input.delayedConsequence.trim()) throw new Error("CAUSALITY_FIELDS_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("CAUSALITY_EVIDENCE_REQUIRED");
  const existing = await readCausalityEdge(input.root, input.edgeId); if (existing) return existing;
  const base = { schemaVersion: "narrative-causality-edge.v1" as const, edgeId: input.edgeId, projectSlug: input.projectSlug, sourceNodeId: input.sourceNodeId, targetNodeId: input.targetNodeId, relation: input.relation, trigger: input.trigger, consequence: input.consequence, delayedConsequence: input.delayedConsequence, evidenceRefs: [...input.evidenceRefs], status: "candidate" as const, createdAt: new Date().toISOString() };
  const edge: CausalityEdge = { ...base, fingerprint: hash(base) }; await writeJson(edgePath(input.root, input.edgeId), edge); return edge;
}
export async function validateCausalityGraph(root: string, projectSlug: string): Promise<CausalityGraphReport> {
  const edges = await listCausalityEdges(root, projectSlug); const issues: CausalityGraphReport["issues"] = []; const nodes = new Set<string>(); const adjacency = new Map<string, string[]>();
  for (const edge of edges) { nodes.add(edge.sourceNodeId); nodes.add(edge.targetNodeId); adjacency.set(edge.sourceNodeId, [...(adjacency.get(edge.sourceNodeId) || []), edge.targetNodeId]); if (!edge.evidenceRefs.length) issues.push({ kind: "missing-evidence", edgeIds: [edge.edgeId], detail: "Causal edge has no evidence." }); }
  const visited = new Set<string>(); const active = new Set<string>(); const cycleEdges = new Set<string>();
  function visit(node: string) { if (active.has(node)) { cycleEdges.add(node); return; } if (visited.has(node)) return; active.add(node); for (const next of adjacency.get(node) || []) visit(next); active.delete(node); visited.add(node); }
  for (const node of nodes) visit(node);
  if (cycleEdges.size) issues.push({ kind: "cycle", edgeIds: edges.filter((edge) => cycleEdges.has(edge.sourceNodeId) || cycleEdges.has(edge.targetNodeId)).map((edge) => edge.edgeId), detail: "Causal graph contains a directed cycle." });
  const connected = new Set(edges.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId])); if (edges.some((edge) => !connected.has(edge.sourceNodeId) || !connected.has(edge.targetNodeId))) issues.push({ kind: "isolated", edgeIds: edges.map((edge) => edge.edgeId), detail: "Causal edge is not connected to a graph node." });
  return { projectSlug, edgeCount: edges.length, status: issues.length ? "blocked" : "passed", issues, fingerprint: hash({ projectSlug, edges: edges.map((edge) => edge.fingerprint), issues }) };
}
