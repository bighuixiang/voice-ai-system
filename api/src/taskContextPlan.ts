import crypto from "node:crypto";

export type TaskContextPlanTier = "T0" | "T1" | "T2" | "T3";

export interface TaskContextPlanBlock {
  title: string;
  tier?: TaskContextPlanTier;
  selected: boolean;
  originalTokens: number;
  finalTokens: number;
  compression: "none" | "boundary-trim";
  truncated: boolean;
  exclusionReason?: string;
}

export interface TaskContextPlan {
  schemaVersion: "context-plan.v1";
  status: "pass" | "warn" | "block";
  blocks: TaskContextPlanBlock[];
  truncatedBlocks: string[];
  warnings: string[];
  fingerprint: string;
}

interface BudgetBlockPlan {
  title?: string;
  tier?: TaskContextPlanTier;
  originalLength?: number;
  finalLength?: number;
  truncated?: boolean;
}

function fingerprint(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readBudgetPlan(blocks: Array<{ title: string; content: string }>): BudgetBlockPlan[] | undefined {
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block.content) as { version?: string; blockPlan?: BudgetBlockPlan[] };
      if (parsed.version === "context-budget:v2" && Array.isArray(parsed.blockPlan)) return parsed.blockPlan;
    } catch {
      // Non-JSON context is ordinary source material, not a plan record.
    }
  }
  return undefined;
}

function isBudgetLog(block: { title: string; content: string }): boolean {
  try {
    return (JSON.parse(block.content) as { version?: string }).version === "context-budget:v2";
  } catch {
    return false;
  }
}

export function buildTaskContextPlan(blocks: Array<{ title: string; content: string }>): TaskContextPlan {
  const budgetPlan = readBudgetPlan(blocks);
  const warnings: string[] = [];
  if (!budgetPlan) {
    warnings.push("CONTEXT_BUDGET_PLAN_MISSING");
    const result = { schemaVersion: "context-plan.v1" as const, status: "warn" as const, blocks: [], truncatedBlocks: [], warnings };
    return { ...result, fingerprint: fingerprint(result) };
  }

  const planByTitle = new Map(budgetPlan.filter((item) => typeof item.title === "string").map((item) => [item.title as string, item]));
  const plannedBlocks = blocks.filter((block) => !isBudgetLog(block));
  const resultBlocks = plannedBlocks.map((block) => {
    const planned = planByTitle.get(block.title);
    const originalLength = Number.isFinite(planned?.originalLength) ? Number(planned?.originalLength) : block.content.length;
    const finalLength = Number.isFinite(planned?.finalLength) ? Number(planned?.finalLength) : block.content.length;
    const truncated = planned?.truncated === true || finalLength < originalLength;
    return {
      title: block.title,
      tier: planned?.tier,
      selected: true,
      originalTokens: Math.ceil(originalLength / 4),
      finalTokens: Math.ceil(finalLength / 4),
      compression: truncated ? "boundary-trim" as const : "none" as const,
      truncated
    } satisfies TaskContextPlanBlock;
  });
  const truncatedBlocks = resultBlocks.filter((block) => block.truncated).map((block) => block.title);
  const result = {
    schemaVersion: "context-plan.v1" as const,
    status: truncatedBlocks.length ? "warn" as const : "pass" as const,
    blocks: resultBlocks,
    truncatedBlocks,
    warnings
  };
  return { ...result, fingerprint: fingerprint(result) };
}
