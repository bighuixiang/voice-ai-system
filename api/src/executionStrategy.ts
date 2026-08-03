import crypto from "node:crypto";

export interface CostSavingPlan { schemaVersion: "cost-saving-plan.v1"; actions: string[]; protectedInvariants: string[]; tradeoffs: string[]; fingerprint: string; }
export interface FailoverDecision { schemaVersion: "executor-failover-gate.v1"; status: "allowed" | "blocked"; reasons: string[]; capabilityRef?: string; boundaryChange?: string; fingerprint: string; }
export interface AuthorExecutionStrategy { schemaVersion: "author-execution-strategy.v1"; preference: "fast" | "balanced" | "quality"; candidateLimit: number; optionalChecks: "reduced" | "standard" | "deep"; autoUpgradeConditions: string[]; safetyInvariants: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function buildCostSavingPlan(input: { budgetPressure: "normal" | "tight"; cacheAvailable: boolean; duplicateContext: boolean; optionalAudit: boolean; t0Protected: boolean; highImpactReviewProtected: boolean }): CostSavingPlan {
  const actions: string[] = []; const tradeoffs: string[] = [];
  if (input.budgetPressure === "tight") {
    if (input.cacheAvailable) actions.push("reuse-cache");
    if (input.duplicateContext) actions.push("deduplicate-context");
    actions.push("semantic-compression");
    actions.push("reduce-low-risk-candidates");
    if (input.optionalAudit) { actions.push("defer-optional-audit"); tradeoffs.push("optional audit is delayed"); }
  }
  const protectedInvariants = ["T0-context", "POV-and-foreshadowing-guards", "high-impact-independent-review", "canon-completion-gate"];
  if (!input.t0Protected || !input.highImpactReviewProtected) throw new Error("COST_SAVING_PROTECTION_REQUIRED");
  const base = { schemaVersion: "cost-saving-plan.v1" as const, actions, protectedInvariants, tradeoffs };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateExecutorFailover(input: { currentCapabilityRef: string; candidateCapabilityRef: string; taskType: string; requiredTier: "economy" | "balanced" | "high"; candidateTier: "economy" | "balanced" | "high"; contextCapacityOk: boolean; structuredOutput: boolean; privacyOk: boolean; rightsOk: boolean; residencyOk: boolean; inputFingerprint: string }): FailoverDecision {
  const reasons: string[] = [];
  if (!input.currentCapabilityRef.trim() || !input.candidateCapabilityRef.trim() || !input.taskType.trim() || !input.inputFingerprint.trim()) reasons.push("FAILOVER_FIELDS_REQUIRED");
  const rank = { economy: 1, balanced: 2, high: 3 };
  if (rank[input.candidateTier] < rank[input.requiredTier]) reasons.push("FAILOVER_CAPABILITY_FLOOR");
  if (!input.contextCapacityOk) reasons.push("FAILOVER_CONTEXT_CAPACITY");
  if (!input.structuredOutput) reasons.push("FAILOVER_STRUCTURED_OUTPUT_REQUIRED");
  if (!input.privacyOk) reasons.push("FAILOVER_PRIVACY_BOUNDARY");
  if (!input.rightsOk) reasons.push("FAILOVER_RIGHTS_BOUNDARY");
  if (!input.residencyOk) reasons.push("FAILOVER_RESIDENCY_BOUNDARY");
  const base = { schemaVersion: "executor-failover-gate.v1" as const, status: reasons.length ? "blocked" as const : "allowed" as const, reasons: [...new Set(reasons)], ...(reasons.length ? {} : { capabilityRef: input.candidateCapabilityRef, boundaryChange: `${input.currentCapabilityRef}->${input.candidateCapabilityRef}` }) };
  return { ...base, fingerprint: hash(base) };
}

export function buildAuthorExecutionStrategy(preference: "fast" | "balanced" | "quality"): AuthorExecutionStrategy {
  const profile = preference === "fast" ? { candidateLimit: 1, optionalChecks: "reduced" as const, autoUpgradeConditions: ["high-impact task", "T0/context safety risk", "budget or capability gate requires escalation"] } : preference === "quality" ? { candidateLimit: 3, optionalChecks: "deep" as const, autoUpgradeConditions: ["independent review disagreement", "evidence conflict"] } : { candidateLimit: 2, optionalChecks: "standard" as const, autoUpgradeConditions: ["high-impact task", "evidence conflict"] };
  const base = { schemaVersion: "author-execution-strategy.v1" as const, preference, ...profile, safetyInvariants: ["canon-write-gate", "privacy-gate", "required-context-gate", "completion-evidence-gate"] };
  return { ...base, fingerprint: hash(base) };
}
