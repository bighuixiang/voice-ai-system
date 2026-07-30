import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { validateAndPersistProseCandidate, type ProseValidationBundle } from "./proseValidation.js";
import type { ProseCandidate } from "./proseCandidate.js";
import type { ProseRepairPlan } from "./proseRepairPlan.js";
import type { RedBlueReview } from "./proseReview.js";
import { reviewProseCandidate } from "./proseReview.js";

export interface ProseRepairRegression {
  schemaVersion: "prose-repair-regression.v1";
  regressionId: string;
  planId: string;
  parentCandidateFingerprint: string;
  repairedCandidateFingerprint: string;
  parentReviewFingerprint: string;
  repairedReviewFingerprint: string;
  repairedValidationFingerprint: string;
  status: "passed" | "blocked";
  improvements: Array<{ findingId: string; status: "resolved" | "persisted"; evidenceRefs: string[] }>;
  regressions: Array<{ findingId: string; detail: string; evidenceRefs: string[] }>;
  preservedStrengths: string[];
  canonicalUntouched: true;
  createdAt: string;
  fingerprint: string;
}

const dossierPath = (root: string, id: string) => resolveInside(root, `sessions/prose-repair-regressions/${id}.json`);
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function writeJson(target: string, value: unknown) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

export async function readProseRepairRegression(root: string, regressionId: string): Promise<ProseRepairRegression | null> {
  try { return JSON.parse(await fs.readFile(dossierPath(root, regressionId), "utf8")) as ProseRepairRegression; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function evaluateProseRepairRegression(input: { root: string; plan: ProseRepairPlan; parent: ProseCandidate; parentReview: RedBlueReview; repaired: ProseCandidate }): Promise<ProseRepairRegression> {
  if (input.plan.candidateId !== input.parent.candidateId || input.plan.rollbackPoint.candidateFingerprint !== input.parent.fingerprint) throw new Error("PROSE_REPAIR_PARENT_STALE");
  if (input.repaired.generation.outlineVersionId !== input.parent.generation.outlineVersionId || input.repaired.generation.executionProofFingerprint !== input.parent.generation.executionProofFingerprint || input.repaired.generation.contextManifestId !== input.parent.generation.contextManifestId || input.repaired.generation.contextFingerprint !== input.parent.generation.contextFingerprint) throw new Error("PROSE_REPAIR_CONTEXT_DRIFT");
  const validation: ProseValidationBundle = await validateAndPersistProseCandidate(input.root, input.repaired);
  const repairedReview = await reviewProseCandidate(input.root, input.repaired, validation);
  const repairedFindingIds = new Set(repairedReview.redFindings.map((finding) => finding.findingId));
  const improvements = input.parentReview.redFindings.map((finding) => ({ findingId: finding.findingId, status: repairedFindingIds.has(finding.findingId) ? "persisted" as const : "resolved" as const, evidenceRefs: [`review://${input.parentReview.reviewId}`, `review://${repairedReview.reviewId}`] }));
  const regressions = repairedReview.redFindings.map((finding) => ({ findingId: finding.findingId, detail: finding.detail, evidenceRefs: [`review://${repairedReview.reviewId}`, `finding://${finding.findingId}`] }));
  const repairedStrengthIds = new Set(repairedReview.blueStrengths.map((strength) => strength.strengthId));
  const preservedStrengths = input.parentReview.blueStrengths.map((strength) => strength.strengthId).filter((strengthId) => repairedStrengthIds.has(strengthId));
  for (const strength of input.parentReview.blueStrengths) if (!repairedStrengthIds.has(strength.strengthId)) regressions.push({ findingId: `lost-blue-${strength.strengthId}`, detail: "Repair candidate removed a protected blue strength.", evidenceRefs: [`review://${input.parentReview.reviewId}`, `review://${repairedReview.reviewId}`] });
  if (validation.status !== "passed") regressions.push({ findingId: "validation-regression", detail: validation.hardFailures.join(",") || "Repair candidate validation is blocked.", evidenceRefs: [`validation://${validation.bundleId}`] });
  if (repairedReview.verdict !== "supports-adoption") regressions.push({ findingId: "red-blue-regression", detail: `Repair review verdict is ${repairedReview.verdict}.`, evidenceRefs: [`review://${repairedReview.reviewId}`] });
  const base = { schemaVersion: "prose-repair-regression.v1" as const, regressionId: `repair-regression-${input.repaired.candidateId}-${input.plan.planId}`, planId: input.plan.planId, parentCandidateFingerprint: input.parent.fingerprint, repairedCandidateFingerprint: input.repaired.fingerprint, parentReviewFingerprint: input.parentReview.fingerprint, repairedReviewFingerprint: repairedReview.fingerprint, repairedValidationFingerprint: validation.fingerprint, status: regressions.length === 0 && improvements.every((item) => item.status === "resolved") ? "passed" as const : "blocked" as const, improvements, regressions, preservedStrengths, canonicalUntouched: true as const, createdAt: new Date().toISOString() };
  const dossier = { ...base, fingerprint: hash(base) };
  await writeJson(dossierPath(input.root, dossier.regressionId), dossier);
  return dossier;
}
