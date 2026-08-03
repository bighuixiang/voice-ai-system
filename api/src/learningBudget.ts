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
export function assertLearningPolicyIntegrity(policy: LearningPolicy, expectedProjectSlug?: string): LearningPolicy { const { fingerprint, ...base } = policy; const valid = policy?.schemaVersion === "learning-policy.v1" && (!expectedProjectSlug || policy.projectSlug === expectedProjectSlug) && [policy.policyId, policy.projectSlug, policy.rollbackVersion, policy.createdAt].every((value) => typeof value === "string" && value.trim()) && policy.minIndependentEvidence >= 1 && Number.isFinite(policy.confidenceThreshold) && policy.confidenceThreshold >= 0 && policy.confidenceThreshold <= 1 && Number.isFinite(policy.decayRate) && policy.decayRate >= 0 && policy.decayRate <= 1 && policy.conflictStrategy === "weaken-and-split" && Number.isFinite(policy.explorationRatio) && policy.explorationRatio >= 0 && policy.explorationRatio <= 1 && policy.privacyBoundary === "project-only" && !Number.isNaN(Date.parse(policy.createdAt)) && /^[a-f0-9]{64}$/i.test(policy.fingerprint) && hash(base) === policy.fingerprint; if (!valid) throw new Error("LEARNING_POLICY_INTEGRITY_FAILED"); return policy; }
export function assertExplorationBudgetIntegrity(budget: ExplorationBudget, expectedId?: string): ExplorationBudget { const { fingerprint, ...base } = budget; const valid = budget?.schemaVersion === "exploration-budget.v1" && (!expectedId || budget.budgetId === expectedId) && [budget.budgetId, budget.projectSlug, budget.scope, budget.maxImpact, budget.createdAt, budget.updatedAt].every((value) => typeof value === "string" && value.trim()) && Number.isInteger(budget.maxProbes) && budget.maxProbes > 0 && Number.isFinite(budget.maxCost) && budget.maxCost > 0 && Array.isArray(budget.stopConditions) && budget.stopConditions.every((value) => typeof value === "string" && value.trim()) && Number.isInteger(budget.usedProbes) && budget.usedProbes >= 0 && budget.usedProbes <= budget.maxProbes && Number.isFinite(budget.usedCost) && budget.usedCost >= 0 && budget.usedCost <= budget.maxCost && Array.isArray(budget.consumedOperationIds) && new Set(budget.consumedOperationIds).size === budget.consumedOperationIds.length && budget.consumedOperationIds.every((value) => typeof value === "string" && value.trim()) && ["active", "exhausted", "paused"].includes(budget.status) && (budget.status !== "paused" || typeof budget.pauseReason === "string" && budget.pauseReason.trim()) && (budget.status !== "exhausted" || budget.usedProbes >= budget.maxProbes || budget.usedCost >= budget.maxCost) && !Number.isNaN(Date.parse(budget.createdAt)) && !Number.isNaN(Date.parse(budget.updatedAt)) && /^[a-f0-9]{64}$/i.test(budget.fingerprint) && hash(base) === budget.fingerprint; if (!valid) throw new Error("EXPLORATION_BUDGET_INTEGRITY_FAILED"); return budget; }

export async function createLearningPolicy(input: { root: string; projectSlug: string; rollbackVersion: string }): Promise<LearningPolicy> {
  if (!input.rollbackVersion.trim()) throw new Error("LEARNING_POLICY_ROLLBACK_VERSION_REQUIRED");
  const existing = await readJson<LearningPolicy>(policyPath(input.root, input.projectSlug));
  if (existing) return existing;
  const base = { schemaVersion: "learning-policy.v1" as const, policyId: `learning-policy-${input.projectSlug}`, projectSlug: input.projectSlug, minIndependentEvidence: 2 as const, confidenceThreshold: 0.75, decayRate: 0.1, conflictStrategy: "weaken-and-split" as const, explorationRatio: 0.1, privacyBoundary: "project-only" as const, rollbackVersion: input.rollbackVersion, createdAt: new Date().toISOString() };
  const policy: LearningPolicy = { ...base, fingerprint: hash(base) };
  await writeJson(policyPath(input.root, input.projectSlug), policy);
  return policy;
}

export async function readLearningPolicy(root: string, projectSlug: string): Promise<LearningPolicy | null> { const policy = await readJson<LearningPolicy>(policyPath(root, projectSlug)); return policy ? assertLearningPolicyIntegrity(policy, projectSlug) : null; }

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

export async function readExplorationBudget(root: string, budgetId: string): Promise<ExplorationBudget | null> { const budget = await readJson<ExplorationBudget>(budgetPath(root, budgetId)); return budget ? assertExplorationBudgetIntegrity(budget, budgetId) : null; }

export async function consumeExplorationBudget(input: { root: string; budgetId: string; operationId: string; probes: number; cost: number; impact: string }): Promise<ExplorationBudget> {
  const existing = await readExplorationBudget(input.root, input.budgetId);
  if (!existing) throw new Error("EXPLORATION_BUDGET_NOT_FOUND");
  if (existing.consumedOperationIds.includes(input.operationId)) return existing;
  if (existing.status !== "active") throw new Error("EXPLORATION_BUDGET_NOT_ACTIVE");
  if (input.impact !== existing.maxImpact) throw new Error("EXPLORATION_BUDGET_IMPACT_OUT_OF_SCOPE");
  if (input.probes <= 0 || input.cost < 0) throw new Error("EXPLORATION_BUDGET_USAGE_INVALID");
  if (existing.usedProbes + input.probes > existing.maxProbes) throw new Error("EXPLORATION_BUDGET_PROBES_EXCEEDED");
  if (existing.usedCost + input.cost > existing.maxCost) throw new Error("EXPLORATION_BUDGET_COST_EXCEEDED");
  const { fingerprint: _oldFingerprint, ...existingBase } = existing;
  const base = { ...existingBase, usedProbes: existing.usedProbes + input.probes, usedCost: existing.usedCost + input.cost, consumedOperationIds: [...existing.consumedOperationIds, input.operationId], status: existing.usedProbes + input.probes >= existing.maxProbes || existing.usedCost + input.cost >= existing.maxCost ? "exhausted" as const : "active" as const, updatedAt: new Date().toISOString() };
  const budget: ExplorationBudget = { ...base, fingerprint: hash(base) };
  await writeJson(budgetPath(input.root, budget.budgetId), budget);
  return budget;
}

export async function pauseExplorationBudget(input: { root: string; budgetId: string; reason: string }): Promise<ExplorationBudget> {
  if (!input.reason.trim()) throw new Error("EXPLORATION_BUDGET_PAUSE_REASON_REQUIRED");
  const existing = await readExplorationBudget(input.root, input.budgetId);
  if (!existing) throw new Error("EXPLORATION_BUDGET_NOT_FOUND");
  if (existing.status === "paused") return existing;
  const { fingerprint: _oldFingerprint, ...existingBase } = existing;
  const base = { ...existingBase, status: "paused" as const, pauseReason: input.reason, updatedAt: new Date().toISOString() };
  const budget: ExplorationBudget = { ...base, fingerprint: hash(base) };
  await writeJson(budgetPath(input.root, budget.budgetId), budget);
  return budget;
}
