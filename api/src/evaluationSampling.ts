import crypto from "node:crypto";

export interface EvaluationSamplingPlan {
  schemaVersion: "evaluation-sampling-plan.v1";
  repetitionCount: number;
  seeds: number[];
  sampling: { temperature: number; topP: number };
  minSamples: number;
  maxSamples: number;
  stopRule: "fixed-count" | "threshold-stable";
  fingerprint: string;
}
export interface EvaluationSamplingSummary { winRate: number; validityRate: number; failureTailRate: number; samples: number; fingerprint: string; }

export interface MultiScaleRegressionResult {
  schemaVersion: "multi-scale-regression.v1";
  status: "pass" | "regression";
  scales: Array<"selection" | "scene" | "chapter" | "adjacent-chapters" | "ten-chapter-window" | "volume" | "book">;
  regressions: string[];
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const scaleNames: MultiScaleRegressionResult["scales"][number][] = ["selection", "scene", "chapter", "adjacent-chapters", "ten-chapter-window", "volume", "book"];

export function assertEvaluationSamplingPlanIntegrity(plan: EvaluationSamplingPlan): EvaluationSamplingPlan {
  const { fingerprint: _fingerprint, ...base } = plan;
  if (plan.schemaVersion !== "evaluation-sampling-plan.v1" || !Array.isArray(plan.seeds) || plan.repetitionCount !== plan.seeds.length || new Set(plan.seeds).size !== plan.seeds.length || !Number.isInteger(plan.minSamples) || !Number.isInteger(plan.maxSamples) || plan.minSamples < 2 || plan.maxSamples < plan.minSamples || plan.seeds.length < plan.minSamples || !Number.isFinite(plan.sampling?.temperature) || plan.sampling.temperature < 0 || plan.sampling.temperature > 2 || !Number.isFinite(plan.sampling?.topP) || plan.sampling.topP <= 0 || plan.sampling.topP > 1 || !["fixed-count", "threshold-stable"].includes(plan.stopRule) || !/^[a-f0-9]{64}$/i.test(plan.fingerprint) || hash(base) !== plan.fingerprint) throw new Error("EVALUATION_SAMPLING_PLAN_INTEGRITY_FAILED");
  return plan;
}

export function assertEvaluationSamplingSummaryIntegrity(summary: EvaluationSamplingSummary, planFingerprint: string): EvaluationSamplingSummary {
  const { fingerprint: _fingerprint, ...base } = summary;
  if (!/^[a-f0-9]{64}$/i.test(planFingerprint) || !Number.isInteger(summary.samples) || summary.samples < 1 || [summary.winRate, summary.validityRate, summary.failureTailRate].some((value) => !Number.isFinite(value) || value < 0 || value > 1) || !/^[a-f0-9]{64}$/i.test(summary.fingerprint) || hash({ planFingerprint, ...base }) !== summary.fingerprint) throw new Error("EVALUATION_SAMPLING_SUMMARY_INTEGRITY_FAILED");
  return summary;
}

export function assertMultiScaleRegressionIntegrity(result: MultiScaleRegressionResult): MultiScaleRegressionResult {
  const { fingerprint: _fingerprint, ...base } = result;
  if (result.schemaVersion !== "multi-scale-regression.v1" || !["pass", "regression"].includes(result.status) || !Array.isArray(result.scales) || result.scales.some((scale) => !scaleNames.includes(scale)) || !Array.isArray(result.regressions) || result.regressions.some((item) => typeof item !== "string") || !/^[a-f0-9]{64}$/i.test(result.fingerprint) || hash(base) !== result.fingerprint) throw new Error("MULTI_SCALE_REGRESSION_INTEGRITY_FAILED");
  return result;
}

export function createEvaluationSamplingPlan(input: { seeds: number[]; temperature: number; topP: number; minSamples: number; maxSamples: number; stopRule: EvaluationSamplingPlan["stopRule"] }): EvaluationSamplingPlan {
  if (!input.seeds.length || input.seeds.some((seed) => !Number.isInteger(seed)) || new Set(input.seeds).size !== input.seeds.length || !Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2 || !Number.isFinite(input.topP) || input.topP <= 0 || input.topP > 1 || !Number.isInteger(input.minSamples) || !Number.isInteger(input.maxSamples) || input.minSamples < 2 || input.maxSamples < input.minSamples || input.seeds.length < input.minSamples || !["fixed-count", "threshold-stable"].includes(input.stopRule)) throw new Error("EVALUATION_SAMPLING_PLAN_INVALID");
  const base = { schemaVersion: "evaluation-sampling-plan.v1" as const, repetitionCount: input.seeds.length, seeds: [...input.seeds], sampling: { temperature: input.temperature, topP: input.topP }, minSamples: input.minSamples, maxSamples: input.maxSamples, stopRule: input.stopRule };
  return { ...base, fingerprint: hash(base) };
}

export function summarizeEvaluationSampling(input: { plan: EvaluationSamplingPlan; outcomes: Array<{ valid: boolean; win: boolean; failed: boolean }> }): EvaluationSamplingSummary {
  assertEvaluationSamplingPlanIntegrity(input.plan);
  if (input.outcomes.length < input.plan.minSamples || input.outcomes.length > input.plan.maxSamples || input.outcomes.length > input.plan.seeds.length) throw new Error("EVALUATION_SAMPLING_OUTCOME_COUNT_INVALID");
  const samples = input.outcomes.length;
  const base = { winRate: input.outcomes.filter((item) => item.win).length / samples, validityRate: input.outcomes.filter((item) => item.valid).length / samples, failureTailRate: input.outcomes.filter((item) => item.failed).length / samples, samples };
  return { ...base, fingerprint: hash({ planFingerprint: input.plan.fingerprint, ...base }) };
}

export function evaluateMultiScaleRegression(input: { baseline: Partial<Record<MultiScaleRegressionResult["scales"][number], number>>; candidate: Partial<Record<MultiScaleRegressionResult["scales"][number], number>>; hardFailures: string[]; tolerance?: number }): MultiScaleRegressionResult {
  const tolerance = input.tolerance ?? 0;
  if (!Number.isFinite(tolerance) || tolerance < 0 || Object.keys(input.baseline).some((scale) => !scaleNames.includes(scale as never)) || Object.keys(input.candidate).some((scale) => !scaleNames.includes(scale as never))) throw new Error("MULTI_SCALE_REGRESSION_INPUT_INVALID");
  const scales = [...new Set([...Object.keys(input.baseline), ...Object.keys(input.candidate)])].filter((scale) => scaleNames.includes(scale as never)) as MultiScaleRegressionResult["scales"];
  const regressions = [...input.hardFailures.map((failure) => `hard:${failure}`), ...scales.filter((scale) => input.baseline[scale] !== undefined && input.candidate[scale] !== undefined && (input.candidate[scale] as number) < (input.baseline[scale] as number) - tolerance).map((scale) => `score:${scale}`)];
  const base = { schemaVersion: "multi-scale-regression.v1" as const, status: regressions.length ? "regression" as const : "pass" as const, scales, regressions };
  return assertMultiScaleRegressionIntegrity({ ...base, fingerprint: hash(base) });
}
