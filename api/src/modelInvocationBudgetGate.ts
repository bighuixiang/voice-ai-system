import crypto from "node:crypto";
import type { BudgetReservation } from "./budgetReservation.js";
import { readBudgetReservation } from "./budgetReservation.js";
import { readModelInvocations } from "./modelInvocationLedger.js";

export interface ValueFirstCostPlan { schemaVersion: "value-first-cost-plan.v1"; actions: Array<"reuse-cache" | "compress-context" | "reduce-candidates" | "defer-optional-audit">; preservedGuards: string[]; sacrificed: string[]; fingerprint: string; }
export function planValueFirstCostReduction(input: { budgetTight: boolean; cacheAvailable: boolean; optionalAudit: boolean; candidateCount: number; hardGuards: readonly string[] }): ValueFirstCostPlan { if (!input.hardGuards.length || input.hardGuards.some((guard) => !guard.trim()) || input.candidateCount < 0 || !Number.isInteger(input.candidateCount)) throw new Error("VALUE_COST_PLAN_INPUT_INVALID"); const actions: ValueFirstCostPlan["actions"] = []; const sacrificed: string[] = []; if (input.budgetTight && input.cacheAvailable) actions.push("reuse-cache"); if (input.budgetTight) actions.push("compress-context"); if (input.budgetTight && input.candidateCount > 1) actions.push("reduce-candidates"); if (input.budgetTight && input.optionalAudit) { actions.push("defer-optional-audit"); sacrificed.push("optional-audit-latency"); } const base = { schemaVersion: "value-first-cost-plan.v1" as const, actions, preservedGuards: [...input.hardGuards], sacrificed }; return { ...base, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") }; }

export interface ModelInvocationBudgetInput {
  bookRunId?: string;
  budgetReservationId?: string;
  estimatedCostCents?: number;
}

export function estimateModelInvocationCostCents(input: { promptChars: number; outputChars?: number; explicitCostCents?: number }): number {
  if (input.explicitCostCents !== undefined) {
    if (!Number.isInteger(input.explicitCostCents) || input.explicitCostCents < 0) throw new Error("MODEL_INVOCATION_ESTIMATE_INVALID");
    return input.explicitCostCents;
  }
  if (!Number.isFinite(input.promptChars) || input.promptChars < 0 || !Number.isFinite(input.outputChars ?? 0) || (input.outputChars ?? 0) < 0) throw new Error("MODEL_INVOCATION_ESTIMATE_INVALID");
  // Until a provider returns usage, reserve a conservative minimum rather than treating an invocation as free.
  return Math.max(1, Math.ceil((input.promptChars + (input.outputChars ?? 0)) / 4000));
}

export async function assertModelInvocationBudget(root: string, input: ModelInvocationBudgetInput): Promise<BudgetReservation | undefined> {
  if (!input.bookRunId) {
    if (input.budgetReservationId) throw new Error("MODEL_INVOCATION_BUDGET_RUN_REQUIRED");
    return undefined;
  }
  if (!input.budgetReservationId?.trim()) throw new Error("MODEL_INVOCATION_BUDGET_RESERVATION_REQUIRED");
  const reservation = await readBudgetReservation(root, input.budgetReservationId);
  if (!reservation) throw new Error("MODEL_INVOCATION_BUDGET_RESERVATION_NOT_FOUND");
  if (reservation.bookRunId !== input.bookRunId || reservation.reservationId !== input.budgetReservationId) throw new Error("MODEL_INVOCATION_BUDGET_RESERVATION_MISMATCH");
  if (reservation.status !== "reserved") throw new Error("MODEL_INVOCATION_BUDGET_NOT_ACTIVE");
  const estimate = input.estimatedCostCents ?? 1;
  if (!Number.isInteger(estimate) || estimate < 0) throw new Error("MODEL_INVOCATION_ESTIMATE_INVALID");
  const pendingLedgerCents = (await readModelInvocations(root))
    .filter((record) => record.bookRunId === input.bookRunId && record.budgetReservationId === input.budgetReservationId)
    .reduce((sum, record) => sum + Math.ceil(record.cost.amount * 100 - Number.EPSILON), 0);
  if (reservation.consumedCents + pendingLedgerCents + estimate > reservation.reservedCents) throw new Error("BUDGET_HARD_STOP");
  return reservation;
}
