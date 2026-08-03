import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { ProseCandidate } from "./proseCandidate.js";
import type { RedBlueReview } from "./proseReview.js";

export interface ProseRepairPlan {
  schemaVersion: "prose-repair-plan.v1";
  planId: string;
  projectSlug: string;
  candidateId: string;
  reviewFingerprint: string;
  status: "ready" | "blocked";
  targetFindings: Array<{ findingId: string; severity: "hard" | "warning"; evidenceRefs: string[]; expectedImprovement: string }>;
  scope: { kind: "local-span"; chapterId: string; affectedParagraphIndexes: number[]; maxChangedParagraphs: number };
  protectedStrengths: string[];
  protectedItems: string[];
  prohibitedActions: string[];
  expectedEvidence: string[];
  regressionChecks: string[];
  rollbackPoint: { candidateFingerprint: string; canonUntouched: true };
  authorDecisionRequired: true;
  createdAt: string;
  fingerprint: string;
}

const planPath = (root: string, id: string) => resolveInside(root, `sessions/prose-repair-plans/${id}.json`);
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function writeJson(target: string, value: unknown) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export function assertProseRepairPlanIntegrity(plan: ProseRepairPlan, expectedId?: string): ProseRepairPlan {
    const { fingerprint, ...base } = plan;
    const strings = (values: unknown) => Array.isArray(values) && values.every((value) => typeof value === "string" && value.trim());
    const findings = Array.isArray(plan.targetFindings) && plan.targetFindings.length > 0 && plan.targetFindings.length <= 3 && plan.targetFindings.every((finding) => finding.findingId.trim() && ["hard", "warning"].includes(finding.severity) && strings(finding.evidenceRefs) && finding.expectedImprovement.trim());
    const scope = plan.scope?.kind === "local-span" && plan.scope.chapterId.trim() && Array.isArray(plan.scope.affectedParagraphIndexes) && plan.scope.affectedParagraphIndexes.every((index) => Number.isInteger(index) && index >= 0) && Number.isInteger(plan.scope.maxChangedParagraphs) && plan.scope.maxChangedParagraphs > 0;
    const valid = plan.schemaVersion === "prose-repair-plan.v1" && (!expectedId || plan.planId === expectedId) && [plan.planId, plan.projectSlug, plan.candidateId, plan.reviewFingerprint, plan.createdAt].every((value) => typeof value === "string" && value.trim()) && ["ready", "blocked"].includes(plan.status) && findings && scope && strings(plan.protectedStrengths) && strings(plan.protectedItems) && strings(plan.prohibitedActions) && strings(plan.expectedEvidence) && strings(plan.regressionChecks) && plan.rollbackPoint?.canonUntouched === true && plan.rollbackPoint.candidateFingerprint.trim() && plan.authorDecisionRequired === true && !Number.isNaN(Date.parse(plan.createdAt)) && /^[a-f0-9]{64}$/i.test(plan.fingerprint) && hash(base) === fingerprint;
    if (!valid) throw new Error("PROSE_REPAIR_PLAN_INTEGRITY_FAILED");
    return plan;
}

export async function readProseRepairPlan(root: string, planId: string): Promise<ProseRepairPlan | null> {
  try {
    const plan = JSON.parse(await fs.readFile(planPath(root, planId), "utf8")) as ProseRepairPlan;
    return assertProseRepairPlanIntegrity(plan, planId);
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function createProseRepairPlan(root: string, candidate: ProseCandidate, review: RedBlueReview): Promise<ProseRepairPlan> {
  if (review.verdict !== "blocks-adoption" || review.redFindings.length === 0) throw new Error("PROSE_REPAIR_NOT_REQUIRED");
  if (review.candidateFingerprint !== candidate.fingerprint) throw new Error("PROSE_REPAIR_CANDIDATE_STALE");
  const targetFindings = review.redFindings.slice(0, 3).map((finding) => ({ findingId: finding.findingId, severity: finding.severity, evidenceRefs: [`review://${review.reviewId}`, `finding://${finding.findingId}`], expectedImprovement: `Resolve ${finding.findingId} without removing protected candidate strengths.` }));
  const paragraphs = candidate.content.split(/\n\s*\n|\n/);
  const affectedParagraphIndexes = targetFindings.map((finding) => Math.max(0, paragraphs.findIndex((paragraph) => finding.findingId === "placeholder-or-wrapper" && /TODO|REDACTED|<generated>/i.test(paragraph))));
  const base = {
    schemaVersion: "prose-repair-plan.v1" as const,
    planId: `repair-plan-${candidate.candidateId}-${review.fingerprint.slice(0, 12)}`,
    projectSlug: candidate.projectSlug,
    candidateId: candidate.candidateId,
    reviewFingerprint: review.fingerprint,
    status: "ready" as const,
    targetFindings,
    scope: { kind: "local-span" as const, chapterId: candidate.chapterId, affectedParagraphIndexes: [...new Set(affectedParagraphIndexes)].slice(0, 3), maxChangedParagraphs: Math.min(3, Math.max(1, paragraphs.length)) },
    protectedStrengths: review.blueArgument.protectedStrengths,
    protectedItems: ["candidate-context", "canon-baseline", "author-locks"],
    prohibitedActions: ["replace-entire-chapter", "write-canon-before-review", "remove-protected-strength"],
    expectedEvidence: ["target-finding-resolved", "protected-strength-preserved", "validation-regression-passed", "red-blue-review-rerun"],
    regressionChecks: ["candidate-integrity", "context-current", "text-round-trip", "red-blue-verdict"],
    rollbackPoint: { candidateFingerprint: candidate.fingerprint, canonUntouched: true as const },
    authorDecisionRequired: true as const,
    createdAt: new Date().toISOString()
  };
  const plan = { ...base, fingerprint: hash(base) };
  await writeJson(planPath(root, plan.planId), plan);
  return plan;
}
