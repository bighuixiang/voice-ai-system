import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readMilestoneRepairPlan } from "./milestoneRepairPlan.js";

export interface MilestoneRepairCompletionReceipt {
  schemaVersion: "milestone-repair-completion.v1";
  receiptId: string;
  planId: string;
  actionId: string;
  projectSlug: string;
  bookRunId: string;
  runVersion: number;
  workItemId: string;
  status: "completed";
  evidenceRefs: string[];
  completedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function receiptPath(root: string, receiptId: string): string { return resolveInside(root, `sessions/milestone-repair-completions/${receiptId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }

function assertIntegrity(receipt: MilestoneRepairCompletionReceipt, receiptId: string): MilestoneRepairCompletionReceipt {
  const { fingerprint: _fingerprint, ...base } = receipt;
  if (receipt.schemaVersion !== "milestone-repair-completion.v1" || receipt.receiptId !== receiptId || receipt.status !== "completed" || !receipt.planId.trim() || !receipt.actionId.trim() || !receipt.projectSlug.trim() || !receipt.bookRunId.trim() || !receipt.workItemId.trim() || !Number.isInteger(receipt.runVersion) || receipt.runVersion < 1 || !receipt.evidenceRefs.length || !/^[a-f0-9]{64}$/i.test(receipt.fingerprint) || hash(base) !== receipt.fingerprint) throw new Error("MILESTONE_REPAIR_COMPLETION_INTEGRITY_FAILED");
  return receipt;
}

export async function readMilestoneRepairCompletion(root: string, receiptId: string): Promise<MilestoneRepairCompletionReceipt | null> {
  try { return assertIntegrity(JSON.parse(await fs.readFile(receiptPath(root, receiptId), "utf8")) as MilestoneRepairCompletionReceipt, receiptId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function recordMilestoneRepairCompletion(input: { root: string; planId: string; actionId: string; projectSlug: string; bookRunId: string; runVersion: number; workItemId: string; evidenceRefs: readonly string[] }): Promise<MilestoneRepairCompletionReceipt> {
  const plan = await readMilestoneRepairPlan(input.root, input.planId);
  if (!plan) throw new Error("MILESTONE_REPAIR_PLAN_NOT_FOUND");
  const action = plan.actions.find((candidate) => candidate.actionId === input.actionId);
  if (!action) throw new Error("MILESTONE_REPAIR_ACTION_NOT_FOUND");
  const evidenceRefs = [...new Set(input.evidenceRefs.map((ref) => ref.trim()).filter(Boolean))];
  if (!evidenceRefs.length) throw new Error("MILESTONE_REPAIR_COMPLETION_EVIDENCE_REQUIRED");
  if (input.projectSlug !== plan.projectSlug || input.bookRunId !== plan.bookRunId || input.runVersion !== plan.runVersion) throw new Error("MILESTONE_REPAIR_COMPLETION_SCOPE_MISMATCH");
  const receiptId = `repair-completion-${plan.planId}-${action.actionId}`;
  const existing = await readMilestoneRepairCompletion(input.root, receiptId);
  if (existing) {
    if (existing.planId !== plan.planId || existing.actionId !== action.actionId || existing.workItemId !== input.workItemId || existing.projectSlug !== input.projectSlug || existing.bookRunId !== input.bookRunId || existing.runVersion !== input.runVersion || JSON.stringify(existing.evidenceRefs) !== JSON.stringify(evidenceRefs)) throw new Error("MILESTONE_REPAIR_COMPLETION_IMMUTABLE");
    return existing;
  }
  const base = { schemaVersion: "milestone-repair-completion.v1" as const, receiptId, planId: plan.planId, actionId: action.actionId, projectSlug: input.projectSlug, bookRunId: input.bookRunId, runVersion: input.runVersion, workItemId: input.workItemId, status: "completed" as const, evidenceRefs, completedAt: new Date().toISOString() };
  const receipt: MilestoneRepairCompletionReceipt = { ...base, fingerprint: hash(base) };
  await writeJson(receiptPath(input.root, receiptId), receipt);
  return receipt;
}
