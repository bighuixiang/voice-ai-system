import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface LearningPolicy {
  schemaVersion: "learning-policy.v1";
  policyId: string;
  projectSlug: string;
  minIndependentEvidence: 2;
  confidenceThreshold: number;
  decayRate: number;
  conflictStrategy: "weaken-and-split";
  explorationRatio: number;
  privacyBoundary: "project-only";
  rollbackVersion: string;
  createdAt: string;
  fingerprint: string;
}

export interface ExplorationBudget {
  schemaVersion: "exploration-budget.v1";
  budgetId: string;
  projectSlug: string;
  scope: string;
  maxProbes: number;
  maxCost: number;
  maxImpact: string;
  stopConditions: string[];
  usedProbes: number;
  usedCost: number;
  consumedOperationIds: string[];
  status: "active" | "exhausted" | "paused";
  pauseReason?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function policyPath(root: string, projectSlug: string): string { return resolveInside(root, `sessions/learning-policies/${projectSlug}.json`); }
function budgetPath(root: string, budgetId: string): string { return resolveInside(root, `sessions/exploration-budgets/${budgetId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(tmp, target); }
async function readJson<T>(target: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(target, "utf8")) as T; } catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; } }

export async function createLearningPolicy(input: { root: string; projectSlug: string; rollbackVersion: string }): Promise<LearningPolicy> {
  if (!input.rollbackVersion.trim()) throw new Error("LEARNING_POLICY_ROLLBACK_VERSION_REQUIRED");
  const existing = await readJson<LearningPolicy>(policyPath(input.root, input.projectSlug));
  if (existing) return existing;
  const base = { schemaVersion: "learning-policy.v1" as const, policyId: `learning-policy-${input.projectSlug}`, projectSlug: input.projectSlug, minIndependentEvidence: 2 as const, confidenceThreshold: 0.75, decayRate: 0.1, conflictStrategy: "weaken-and-split" as const, explorationRatio: 0.1, privacyBoundary: "project-only" as const, rollbackVersion: input.rollbackVersion, createdAt: new Date().toISOString() };
  const policy: LearningPolicy = { ...base, fingerprint: hash(base) };
  await writeJson(policyPath(input.root, input.projectSlug), policy);
  return policy;
}

export async function readLearningPolicy(root: string, projectSlug: string): Promise<LearningPolicy | null> { return readJson<LearningPolicy>(policyPath(root, projectSlug)); }

export async function createExplorationBudget(input: { root: string; projectSlug: string; scope: string; maxProbes: number; maxCost: number; maxImpact: string; stopConditions: string[] }): Promise<ExplorationBudget> {
  if (input.maxProbes <= 0 || input.maxCost <= 0 || !input.scope.trim() || !input.maxImpact.trim()) throw new Error("EXPLORATION_BUDGET_INVALID");
  const budgetId = `exploration-budget-${input.projectSlug}-${hash({ scope: input.scope, maxProbes: input.maxProbes, maxCost: input.maxCost }).slice(0, 16)}`;
  const existing = await readExplorationBudget(input.root, budgetId);
  if (existing) return existing;
  const base = { schemaVersion: "exploration-budget.v1" as const, budgetId, projectSlug: input.projectSlug, scope: input.scope, maxProbes: input.maxProbes, maxCost: input.maxCost, maxImpact: input.maxImpact, stopConditions: [...input.stopConditions], usedProbes: 0, usedCost: 0, consumedOperationIds: [] as string[], status: "active" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const budget: ExplorationBudget = { ...base, fingerprint: hash(base) };
  await writeJson(budgetPath(input.root, budgetId), budget);
  return budget;
}

export async function readExplorationBudget(root: string, budgetId: string): Promise<ExplorationBudget | null> { return readJson<ExplorationBudget>(budgetPath(root, budgetId)); }

export async function consumeExplorationBudget(input: { root: string; budgetId: string; operationId: string; probes: number; cost: number; impact: string }): Promise<ExplorationBudget> {
  const existing = await readExplorationBudget(input.root, input.budgetId);
  if (!existing) throw new Error("EXPLORATION_BUDGET_NOT_FOUND");
  if (existing.consumedOperationIds.includes(input.operationId)) return existing;
  if (existing.status !== "active") throw new Error("EXPLORATION_BUDGET_NOT_ACTIVE");
  if (input.impact !== existing.maxImpact) throw new Error("EXPLORATION_BUDGET_IMPACT_OUT_OF_SCOPE");
  if (input.probes <= 0 || input.cost < 0) throw new Error("EXPLORATION_BUDGET_USAGE_INVALID");
  if (existing.usedProbes + input.probes > existing.maxProbes) throw new Error("EXPLORATION_BUDGET_PROBES_EXCEEDED");
  if (existing.usedCost + input.cost > existing.maxCost) throw new Error("EXPLORATION_BUDGET_COST_EXCEEDED");
  const base = { ...existing, usedProbes: existing.usedProbes + input.probes, usedCost: existing.usedCost + input.cost, consumedOperationIds: [...existing.consumedOperationIds, input.operationId], status: existing.usedProbes + input.probes >= existing.maxProbes || existing.usedCost + input.cost >= existing.maxCost ? "exhausted" as const : "active" as const, updatedAt: new Date().toISOString() };
  const budget: ExplorationBudget = { ...base, fingerprint: hash(base) };
  await writeJson(budgetPath(input.root, budget.budgetId), budget);
  return budget;
}

export async function pauseExplorationBudget(input: { root: string; budgetId: string; reason: string }): Promise<ExplorationBudget> {
  if (!input.reason.trim()) throw new Error("EXPLORATION_BUDGET_PAUSE_REASON_REQUIRED");
  const existing = await readExplorationBudget(input.root, input.budgetId);
  if (!existing) throw new Error("EXPLORATION_BUDGET_NOT_FOUND");
  if (existing.status === "paused") return existing;
  const base = { ...existing, status: "paused" as const, pauseReason: input.reason, updatedAt: new Date().toISOString() };
  const budget: ExplorationBudget = { ...base, fingerprint: hash(base) };
  await writeJson(budgetPath(input.root, budget.budgetId), budget);
  return budget;
}
