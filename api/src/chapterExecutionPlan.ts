import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface ChapterExecutionPlan {
  schemaVersion: "chapter-execution-plan.v1";
  planId: string;
  projectSlug: string;
  chapterId: string;
  executionProofFingerprint: string;
  contextFingerprint: string;
  planOutputId: string;
  planFingerprint: string;
  plan: unknown;
  status: "ready";
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function planPath(root: string, planId: string): string { return resolveInside(root, `sessions/chapter-execution-plans/${planId}.json`); }

export function assertChapterExecutionPlanIntegrity(plan: ChapterExecutionPlan, expectedPlanId?: string): void {
  const { fingerprint: _fingerprint, ...base } = plan;
  const structurallyValid = plan.schemaVersion === "chapter-execution-plan.v1" && (!expectedPlanId || plan.planId === expectedPlanId) && plan.projectSlug.trim() !== "" && plan.chapterId.trim() !== "" && plan.executionProofFingerprint.trim() !== "" && plan.contextFingerprint.trim() !== "" && plan.planOutputId.trim() !== "" && /^[a-f0-9]{64}$/i.test(plan.planFingerprint) && plan.status === "ready" && Number.isFinite(Date.parse(plan.createdAt)) && plan.planId === `chapter-execution-plan-${plan.chapterId}-${plan.planFingerprint.slice(0, 16)}`;
  if (!structurallyValid || !/^[a-f0-9]{64}$/i.test(plan.fingerprint) || hash(plan.plan) !== plan.planFingerprint || hash(base) !== plan.fingerprint) throw new Error("CHAPTER_EXECUTION_PLAN_INTEGRITY_FAILED");
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readChapterExecutionPlan(root: string, planId: string): Promise<ChapterExecutionPlan | null> {
  try {
    const plan = JSON.parse(await fs.readFile(planPath(root, planId), "utf8")) as ChapterExecutionPlan;
    assertChapterExecutionPlanIntegrity(plan, planId);
    return plan;
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function createChapterExecutionPlan(root: string, input: {
  projectSlug: string;
  chapterId: string;
  executionProofFingerprint: string;
  contextFingerprint: string;
  planOutputId: string;
  planFingerprint: string;
  plan: unknown;
}): Promise<ChapterExecutionPlan> {
  if (!input.projectSlug.trim() || !input.chapterId.trim() || !input.executionProofFingerprint.trim() || !input.contextFingerprint.trim() || !input.planOutputId.trim() || !input.planFingerprint.trim()) throw new Error("CHAPTER_EXECUTION_PLAN_BINDING_REQUIRED");
  if (hash(input.plan) !== input.planFingerprint) throw new Error("CHAPTER_EXECUTION_PLAN_FINGERPRINT_MISMATCH");
  const planId = `chapter-execution-plan-${input.chapterId}-${input.planFingerprint.slice(0, 16)}`;
  const existing = await readChapterExecutionPlan(root, planId);
  if (existing) return existing;
  const base = { schemaVersion: "chapter-execution-plan.v1" as const, planId, projectSlug: input.projectSlug, chapterId: input.chapterId, executionProofFingerprint: input.executionProofFingerprint, contextFingerprint: input.contextFingerprint, planOutputId: input.planOutputId, planFingerprint: input.planFingerprint, plan: input.plan, status: "ready" as const, createdAt: new Date().toISOString() };
  const plan: ChapterExecutionPlan = { ...base, fingerprint: hash(base) };
  await writeJson(planPath(root, planId), plan);
  return plan;
}

export function verifyChapterExecutionPlan(plan: ChapterExecutionPlan, input: { projectSlug: string; chapterId: string; executionProofFingerprint: string; contextFingerprint: string; planFingerprint: string }): boolean {
  const { fingerprint, ...base } = plan;
  return plan.status === "ready" && plan.projectSlug === input.projectSlug && plan.chapterId === input.chapterId && plan.executionProofFingerprint === input.executionProofFingerprint && plan.contextFingerprint === input.contextFingerprint && plan.planFingerprint === input.planFingerprint && plan.planId === `chapter-execution-plan-${plan.chapterId}-${plan.planFingerprint.slice(0, 16)}` && /^[a-f0-9]{64}$/i.test(fingerprint) && hash(base) === fingerprint && hash(plan.plan) === plan.planFingerprint;
}
