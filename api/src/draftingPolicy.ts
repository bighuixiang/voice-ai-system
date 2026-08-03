import crypto from "node:crypto";

export type DraftingRiskTier = "ordinary" | "elevated" | "key";
export type DraftingOutcome = "accepted" | "blocked" | "review_required" | "cancelled";
export type DraftingCost =
  | { status: "unknown" }
  | { status: "measured"; amount: number; currency: string };

export interface DraftingExecutionReceipt {
  schemaVersion: "drafting-execution-receipt.v1";
  policyVersion: "tiered-quality.v1";
  specificationActivationAllowed: true;
  runtimeActivationAllowed: false;
  projectSlug: string;
  runId: string;
  chapterId: string;
  riskTier: DraftingRiskTier;
  candidateCount: number;
  reviewCount: number;
  repairCount: number;
  elapsedMs: number;
  cost: DraftingCost;
  outcome: DraftingOutcome;
  createdAt: string;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const tierBudget: Record<DraftingRiskTier, { candidates: number; reviews: number; repairs: number }> = {
  ordinary: { candidates: 1, reviews: 1, repairs: 1 },
  elevated: { candidates: 2, reviews: 2, repairs: 2 },
  key: { candidates: 3, reviews: 3, repairs: 3 }
};

export function createDraftingExecutionReceipt(input: {
  projectSlug: string;
  runId: string;
  chapterId: string;
  riskTier: DraftingRiskTier;
  candidateCount: number;
  reviewCount: number;
  repairCount: number;
  elapsedMs: number;
  cost: DraftingCost;
  outcome: DraftingOutcome;
  createdAt?: string;
}): DraftingExecutionReceipt {
  if (![input.projectSlug, input.runId, input.chapterId].every((value) => value.trim())) throw new Error("DRAFTING_POLICY_ID_REQUIRED");
  const budget = tierBudget[input.riskTier];
  if (!budget || !Number.isInteger(input.candidateCount) || !Number.isInteger(input.reviewCount) || !Number.isInteger(input.repairCount) || input.candidateCount < 0 || input.reviewCount < 0 || input.repairCount < 0 || input.candidateCount > budget.candidates || input.reviewCount > budget.reviews || input.repairCount > budget.repairs) throw new Error("DRAFTING_POLICY_BUDGET_EXCEEDED");
  if (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 0) throw new Error("DRAFTING_POLICY_ELAPSED_INVALID");
  if (input.cost.status === "measured" && (!Number.isFinite(input.cost.amount) || input.cost.amount < 0 || !input.cost.currency.trim())) throw new Error("DRAFTING_POLICY_COST_INVALID");
  const base = {
    schemaVersion: "drafting-execution-receipt.v1" as const,
    policyVersion: "tiered-quality.v1" as const,
    specificationActivationAllowed: true as const,
    runtimeActivationAllowed: false as const,
    projectSlug: input.projectSlug.trim(),
    runId: input.runId.trim(),
    chapterId: input.chapterId.trim(),
    riskTier: input.riskTier,
    candidateCount: input.candidateCount,
    reviewCount: input.reviewCount,
    repairCount: input.repairCount,
    elapsedMs: input.elapsedMs,
    cost: input.cost,
    outcome: input.outcome,
    createdAt: input.createdAt || new Date().toISOString()
  };
  return { ...base, fingerprint: hash(base) };
}

export function assertDraftingExecutionReceipt(value: unknown): DraftingExecutionReceipt {
  if (!value || typeof value !== "object") throw new Error("DRAFTING_POLICY_INTEGRITY_FAILED");
  const receipt = value as DraftingExecutionReceipt;
  const { fingerprint: _fingerprint, ...base } = receipt;
  if (receipt.schemaVersion !== "drafting-execution-receipt.v1" || receipt.policyVersion !== "tiered-quality.v1" || receipt.specificationActivationAllowed !== true || receipt.runtimeActivationAllowed !== false || !/^[a-f0-9]{64}$/i.test(receipt.fingerprint || "") || hash(base) !== receipt.fingerprint) throw new Error("DRAFTING_POLICY_INTEGRITY_FAILED");
  try {
    const rebuilt = createDraftingExecutionReceipt({
      projectSlug: receipt.projectSlug,
      runId: receipt.runId,
      chapterId: receipt.chapterId,
      riskTier: receipt.riskTier,
      candidateCount: receipt.candidateCount,
      reviewCount: receipt.reviewCount,
      repairCount: receipt.repairCount,
      elapsedMs: receipt.elapsedMs,
      cost: receipt.cost,
      outcome: receipt.outcome,
      createdAt: receipt.createdAt
    });
    if (rebuilt.fingerprint !== receipt.fingerprint) throw new Error("fingerprint mismatch");
  } catch {
    throw new Error("DRAFTING_POLICY_INTEGRITY_FAILED");
  }
  return receipt;
}
