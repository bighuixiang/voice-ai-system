import crypto from "node:crypto";

export type GraphExpansionChoice = "neutralize" | "compress-reclaim" | "authorize-expansion";
export interface GraphExpansionGateResult {
  schemaVersion: "graph-expansion-gate.v1";
  gateId: string;
  allowed: boolean;
  reason?: "EXPANSION_SCOPE_EXCEEDED" | "EXPANSION_AUTHORIZATION_REQUIRED";
  currentChapterCount: number;
  proposedAdditionalChapters: number;
  currentBudgetCents: number;
  projectedAdditionalCostCents: number;
  options: Array<{ choice: GraphExpansionChoice; label: string }>;
  selectedChoice?: GraphExpansionChoice;
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateGraphExpansion(input: {
  gateId: string;
  currentChapterCount: number;
  proposedAdditionalChapters: number;
  currentBudgetCents: number;
  projectedAdditionalCostCents: number;
  choice?: GraphExpansionChoice;
  authorizationGranted?: boolean;
}): GraphExpansionGateResult {
  if (!input.gateId.trim() || !Number.isInteger(input.currentChapterCount) || input.currentChapterCount < 0 || !Number.isInteger(input.proposedAdditionalChapters) || input.proposedAdditionalChapters < 0 || !Number.isInteger(input.currentBudgetCents) || input.currentBudgetCents < 0 || !Number.isInteger(input.projectedAdditionalCostCents) || input.projectedAdditionalCostCents < 0) throw new Error("GRAPH_EXPANSION_INPUT_INVALID");
  const exceeds = input.proposedAdditionalChapters > 0 && input.projectedAdditionalCostCents > input.currentBudgetCents;
  const options = [
    { choice: "neutralize" as const, label: "中和：保留现有范围，削弱新增伏笔" },
    { choice: "compress-reclaim" as const, label: "压缩回收：从未来窗口回收容量" },
    { choice: "authorize-expansion" as const, label: "扩权新增：明确授权扩展章节与预算" }
  ];
  let allowed = true;
  let reason: GraphExpansionGateResult["reason"];
  if (exceeds && !input.choice) { allowed = false; reason = "EXPANSION_SCOPE_EXCEEDED"; }
  else if (exceeds && input.choice === "authorize-expansion" && input.authorizationGranted !== true) { allowed = false; reason = "EXPANSION_AUTHORIZATION_REQUIRED"; }
  const base = { schemaVersion: "graph-expansion-gate.v1" as const, gateId: input.gateId, allowed, ...(reason ? { reason } : {}), currentChapterCount: input.currentChapterCount, proposedAdditionalChapters: input.proposedAdditionalChapters, currentBudgetCents: input.currentBudgetCents, projectedAdditionalCostCents: input.projectedAdditionalCostCents, options, ...(input.choice ? { selectedChoice: input.choice } : {}) };
  return { ...base, fingerprint: hash(base) };
}
