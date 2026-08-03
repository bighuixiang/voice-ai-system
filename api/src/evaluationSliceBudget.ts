import crypto from "node:crypto";

export interface EvaluationSliceBudget {
  schemaVersion: "evaluation-slice-budget.v1";
  sliceId: string;
  dimensions: { genre: string; chapterFunction: string; pov: string; lengthBand: string; risk: string; knownDefects: string[] };
  minimumSamples: number;
  allowedRegression: number;
  zeroTolerance: boolean;
  fingerprint: string;
}

export interface EvaluationSliceResult { schemaVersion: "evaluation-slice-result.v1"; sliceId: string; samples: number; baselineScore: number; candidateScore: number; hardFailures: string[]; status: "pass" | "regression" | "insufficient-sample"; reasons: string[]; fingerprint: string; }
const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assertEvaluationSliceBudgetIntegrity(budget: EvaluationSliceBudget): EvaluationSliceBudget { const { fingerprint: _fingerprint, ...base } = budget; const d = budget.dimensions; if (budget.schemaVersion !== "evaluation-slice-budget.v1" || !budget.sliceId.trim() || !d || [d.genre, d.chapterFunction, d.pov, d.lengthBand, d.risk].some((value) => typeof value !== "string" || !value.trim()) || !Array.isArray(d.knownDefects) || d.knownDefects.some((value) => typeof value !== "string" || !value.trim()) || !Number.isInteger(budget.minimumSamples) || budget.minimumSamples < 1 || !Number.isFinite(budget.allowedRegression) || budget.allowedRegression < 0 || typeof budget.zeroTolerance !== "boolean" || !/^[a-f0-9]{64}$/i.test(budget.fingerprint) || hash(base) !== budget.fingerprint) throw new Error("EVALUATION_SLICE_BUDGET_INTEGRITY_FAILED"); return budget; }
export function assertEvaluationSliceResultIntegrity(result: EvaluationSliceResult, budgetFingerprint: string): EvaluationSliceResult { const { fingerprint: _fingerprint, ...base } = result; if (!budgetFingerprint.trim() || result.schemaVersion !== "evaluation-slice-result.v1" || !result.sliceId.trim() || !Number.isInteger(result.samples) || result.samples < 0 || ![result.baselineScore, result.candidateScore].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || !["pass", "regression", "insufficient-sample"].includes(result.status) || !Array.isArray(result.hardFailures) || !Array.isArray(result.reasons) || !/^[a-f0-9]{64}$/i.test(result.fingerprint) || hash({ ...base, budgetFingerprint }) !== result.fingerprint) throw new Error("EVALUATION_SLICE_RESULT_INTEGRITY_FAILED"); return result; }

export function createEvaluationSliceBudget(input: Omit<EvaluationSliceBudget, "schemaVersion" | "fingerprint">): EvaluationSliceBudget {
  const dimensions = [input.dimensions.genre, input.dimensions.chapterFunction, input.dimensions.pov, input.dimensions.lengthBand, input.dimensions.risk];
  if (!input.sliceId.trim() || dimensions.some((value) => !value.trim()) || !Array.isArray(input.dimensions.knownDefects) || input.dimensions.knownDefects.some((defect) => !defect.trim()) || !Number.isInteger(input.minimumSamples) || input.minimumSamples < 1 || !Number.isFinite(input.allowedRegression) || input.allowedRegression < 0) throw new Error("EVALUATION_SLICE_BUDGET_INVALID");
  const base = { schemaVersion: "evaluation-slice-budget.v1" as const, ...input, dimensions: { ...input.dimensions, knownDefects: [...input.dimensions.knownDefects] } };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateEvaluationSlice(input: { budget: EvaluationSliceBudget; samples: number; baselineScore: number; candidateScore: number; hardFailures?: string[] }): EvaluationSliceResult {
  assertEvaluationSliceBudgetIntegrity(input.budget);
  if (!Number.isInteger(input.samples) || input.samples < 0 || ![input.baselineScore, input.candidateScore].every((score) => Number.isFinite(score) && score >= 0 && score <= 1)) throw new Error("EVALUATION_SLICE_RESULT_INVALID");
  const hardFailures = [...(input.hardFailures || [])];
  const reasons: string[] = [];
  if (input.samples < input.budget.minimumSamples) reasons.push("INSUFFICIENT_SAMPLE");
  if (hardFailures.length) reasons.push("HARD_FAILURE");
  if (input.candidateScore < input.baselineScore - input.budget.allowedRegression) reasons.push("SCORE_REGRESSION");
  const base = { schemaVersion: "evaluation-slice-result.v1" as const, sliceId: input.budget.sliceId, samples: input.samples, baselineScore: input.baselineScore, candidateScore: input.candidateScore, hardFailures, status: reasons.includes("INSUFFICIENT_SAMPLE") ? "insufficient-sample" as const : reasons.length ? "regression" as const : "pass" as const, reasons };
  return assertEvaluationSliceResultIntegrity({ ...base, fingerprint: hash({ ...base, budgetFingerprint: input.budget.fingerprint }) }, input.budget.fingerprint);
}
