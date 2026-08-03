import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type PlanningStatus = "committed" | "rolling" | "tentative" | "exploratory";
export interface PlanningNode { schemaVersion: "narrative-planning-node.v1"; nodeId: string; projectSlug: string; layer: string; title: string; status: PlanningStatus; commitments: string[]; sourceRefs: string[]; autoEvolutionAllowed: boolean; decision?: { actor: string; reason: string; decidedAt: string }; createdAt: string; updatedAt: string; fingerprint: string; }
function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function nodePath(root: string, id: string): string { return resolveInside(root, `sessions/planning-nodes/${id}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }
export function assertPlanningNodeIntegrity(node: PlanningNode, expectedId?: string): PlanningNode {
  const { fingerprint, ...base } = node;
  const decisionValid = node.decision === undefined || (typeof node.decision === "object" && [node.decision.actor, node.decision.reason, node.decision.decidedAt].every((value) => typeof value === "string" && value.trim()) && !Number.isNaN(Date.parse(node.decision.decidedAt)));
  const valid = node?.schemaVersion === "narrative-planning-node.v1" && (!expectedId || node.nodeId === expectedId) &&
    [node.nodeId, node.projectSlug, node.layer, node.title, node.createdAt, node.updatedAt].every((value) => typeof value === "string" && value.trim()) &&
    [node.commitments, node.sourceRefs].every((values) => Array.isArray(values) && values.length > 0 && values.every((value) => typeof value === "string" && value.trim())) &&
    ["committed", "rolling", "tentative", "exploratory"].includes(node.status) && typeof node.autoEvolutionAllowed === "boolean" && node.autoEvolutionAllowed === (node.status !== "committed") &&
    !Number.isNaN(Date.parse(node.createdAt)) && !Number.isNaN(Date.parse(node.updatedAt)) && decisionValid && /^[a-f0-9]{64}$/i.test(node.fingerprint) && hash(base) === node.fingerprint;
  if (!valid) throw new Error("PLANNING_NODE_INTEGRITY_FAILED");
  return node;
}
export async function readPlanningNode(root: string, nodeId: string): Promise<PlanningNode | null> { const node = await readJson<PlanningNode>(nodePath(root, nodeId)); return node ? assertPlanningNodeIntegrity(node, nodeId) : null; }
export async function createPlanningNode(input: { root: string; projectSlug: string; nodeId: string; layer: string; title: string; status: PlanningStatus; commitments: readonly string[]; sourceRefs: readonly string[] }): Promise<PlanningNode> {
  if (!input.projectSlug.trim() || !input.nodeId.trim() || !input.layer.trim() || !input.title.trim()) throw new Error("PLANNING_NODE_FIELDS_REQUIRED");
  if (!input.commitments.length) throw new Error("PLANNING_COMMITMENTS_REQUIRED"); if (!input.sourceRefs.length) throw new Error("PLANNING_NODE_SOURCE_REQUIRED");
  const existing = await readPlanningNode(input.root, input.nodeId); if (existing) return existing;
  const base = { schemaVersion: "narrative-planning-node.v1" as const, nodeId: input.nodeId, projectSlug: input.projectSlug, layer: input.layer, title: input.title, status: input.status, commitments: [...input.commitments], sourceRefs: [...input.sourceRefs], autoEvolutionAllowed: input.status !== "committed", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const node: PlanningNode = { ...base, fingerprint: hash(base) }; await writeJson(nodePath(input.root, input.nodeId), node); return node;
}
export async function transitionPlanningNode(input: { root: string; nodeId: string; toStatus: PlanningStatus; actor: string; reason: string }): Promise<PlanningNode> {
  const current = await readPlanningNode(input.root, input.nodeId); if (!current) throw new Error("PLANNING_NODE_NOT_FOUND");
  if (!input.reason.trim()) throw new Error("PLANNING_DECISION_REASON_REQUIRED");
  if (current.status === input.toStatus) return current;
  const allowed: Record<PlanningStatus, PlanningStatus[]> = { exploratory: ["tentative", "rolling", "committed"], tentative: ["rolling", "committed"], rolling: ["committed", "tentative"], committed: [] };
  if (!allowed[current.status].includes(input.toStatus)) throw new Error("PLANNING_TRANSITION_INVALID");
  if (input.toStatus === "committed" && input.actor !== "author") throw new Error("PLANNING_AUTHOR_DECISION_REQUIRED");
  const base = { ...current, status: input.toStatus, autoEvolutionAllowed: input.toStatus !== "committed", decision: { actor: input.actor, reason: input.reason, decidedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() };
  const node: PlanningNode = { ...base, fingerprint: hash(base) }; await writeJson(nodePath(input.root, current.nodeId), node); return node;
}
