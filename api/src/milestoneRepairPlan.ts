import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export type MilestoneRepairKind = "continuity" | "memory" | "pacing" | "obligation" | "character" | "world" | "projection";
export interface MilestoneRepairIssue { kind: MilestoneRepairKind; targetId: string; reason: string; evidenceRefs: string[]; }
export interface MilestoneRepairPlan {
  schemaVersion: "milestone-repair-plan.v1";
  planId: string;
  projectSlug: string;
  bookRunId: string;
  runVersion: number;
  sourceFingerprint: string;
  scopedChapterIds: string[];
  preserveScope: true;
  status: "planned";
  actions: Array<MilestoneRepairIssue & { actionId: string; status: "planned" }>;
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function planPath(root: string, planId: string): string { return resolveInside(root, `sessions/milestone-repair-plans/${planId}.json`); }
async function writeJson(target: string, value: unknown): Promise<void> { await fs.mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await fs.rename(temporary, target); }

function assertIntegrity(plan: MilestoneRepairPlan, planId: string): MilestoneRepairPlan {
  const { fingerprint: _fingerprint, ...base } = plan;
  if (plan.schemaVersion !== "milestone-repair-plan.v1" || plan.planId !== planId || plan.status !== "planned" || plan.preserveScope !== true || !plan.projectSlug.trim() || !plan.bookRunId.trim() || !plan.sourceFingerprint.trim() || !Number.isInteger(plan.runVersion) || plan.runVersion < 1 || !Array.isArray(plan.scopedChapterIds) || !plan.scopedChapterIds.length || !Array.isArray(plan.actions) || !plan.actions.length || plan.actions.some((action) => !action.actionId.trim() || !action.targetId.trim() || !action.reason.trim() || !action.evidenceRefs.length || action.status !== "planned") || !/^[a-f0-9]{64}$/i.test(plan.fingerprint) || hash(base) !== plan.fingerprint) throw new Error("MILESTONE_REPAIR_PLAN_INTEGRITY_FAILED");
  return plan;
}

export async function readMilestoneRepairPlan(root: string, planId: string): Promise<MilestoneRepairPlan | null> {
  try { return assertIntegrity(JSON.parse(await fs.readFile(planPath(root, planId), "utf8")) as MilestoneRepairPlan, planId); }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function createMilestoneRepairPlan(input: { root: string; projectSlug: string; bookRunId: string; runVersion: number; sourceFingerprint: string; scopedChapterIds: readonly string[]; issues: readonly MilestoneRepairIssue[] }): Promise<MilestoneRepairPlan> {
  const scopedChapterIds = [...new Set(input.scopedChapterIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (!input.projectSlug.trim() || !input.bookRunId.trim() || !input.sourceFingerprint.trim() || !Number.isInteger(input.runVersion) || input.runVersion < 1 || !scopedChapterIds.length) throw new Error("MILESTONE_REPAIR_SCOPE_REQUIRED");
  if (!input.issues.length) throw new Error("MILESTONE_REPAIR_ISSUES_REQUIRED");
  const issues = input.issues.map((issue) => ({ kind: issue.kind, targetId: issue.targetId.trim(), reason: issue.reason.trim(), evidenceRefs: [...new Set(issue.evidenceRefs.map((ref) => ref.trim()).filter(Boolean))] }));
  if (issues.some((issue) => !issue.targetId || !issue.reason)) throw new Error("MILESTONE_REPAIR_ISSUE_FIELDS_REQUIRED");
  if (issues.some((issue) => !issue.evidenceRefs.length)) throw new Error("MILESTONE_REPAIR_EVIDENCE_REQUIRED");
  const identity = { projectSlug: input.projectSlug, bookRunId: input.bookRunId, runVersion: input.runVersion, sourceFingerprint: input.sourceFingerprint, scopedChapterIds, issues };
  const planId = `repair-${hash(identity).slice(0, 24)}`;
  const existing = await readMilestoneRepairPlan(input.root, planId);
  if (existing) return existing;
  const actions = issues.map((issue) => ({ ...issue, actionId: `repair-action-${hash({ planId, ...issue }).slice(0, 16)}`, status: "planned" as const }));
  const base = { schemaVersion: "milestone-repair-plan.v1" as const, planId, projectSlug: input.projectSlug, bookRunId: input.bookRunId, runVersion: input.runVersion, sourceFingerprint: input.sourceFingerprint, scopedChapterIds, preserveScope: true as const, status: "planned" as const, actions, createdAt: new Date().toISOString() };
  const plan: MilestoneRepairPlan = { ...base, fingerprint: hash(base) };
  await writeJson(planPath(input.root, planId), plan);
  return plan;
}
