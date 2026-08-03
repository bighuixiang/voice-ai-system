import crypto from "node:crypto";

export interface EvaluationCandidateMetric { candidateId: string; validOutputRate: number; blindWinRate: number; hardFailures: number; costCents: number; latencyMs: number; keySliceRegression: boolean; }
export interface EvaluationParetoDecision { schemaVersion: "evaluation-pareto.v1"; candidateId: string; qualityNonInferior: boolean; costImprovement: boolean; latencyImprovement: boolean; eligibleDefault: boolean; reasons: string[]; fingerprint: string; }
const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assertEvaluationParetoIntegrity(decision: EvaluationParetoDecision): EvaluationParetoDecision { const { fingerprint: _fingerprint, ...base } = decision; if (decision.schemaVersion !== "evaluation-pareto.v1" || !decision.candidateId.trim() || typeof decision.qualityNonInferior !== "boolean" || typeof decision.costImprovement !== "boolean" || typeof decision.latencyImprovement !== "boolean" || typeof decision.eligibleDefault !== "boolean" || !Array.isArray(decision.reasons) || decision.reasons.some((reason) => typeof reason !== "string") || !/^[a-f0-9]{64}$/i.test(decision.fingerprint) || hash(base) !== decision.fingerprint) throw new Error("EVALUATION_PARETO_INTEGRITY_FAILED"); return decision; }

export function compareEvaluationCandidate(input: { baseline: EvaluationCandidateMetric; candidate: EvaluationCandidateMetric; minimumWinRate: number }): EvaluationParetoDecision {
  const metrics = [input.baseline, input.candidate];
  if (!metrics.every((metric) => metric && typeof metric.candidateId === "string" && metric.candidateId.trim() && [metric.validOutputRate, metric.blindWinRate, metric.costCents, metric.latencyMs].every((value) => Number.isFinite(value) && value >= 0) && Number.isInteger(metric.hardFailures) && metric.hardFailures >= 0 && typeof metric.keySliceRegression === "boolean")) throw new Error("EVALUATION_PARETO_INPUT_INVALID");
  if (!Number.isFinite(input.minimumWinRate) || input.minimumWinRate < 0 || input.minimumWinRate > 1) throw new Error("EVALUATION_PARETO_THRESHOLD_INVALID");
  const qualityNonInferior = input.candidate.validOutputRate >= input.baseline.validOutputRate && input.candidate.blindWinRate >= Math.max(input.minimumWinRate, input.baseline.blindWinRate) && input.candidate.hardFailures <= input.baseline.hardFailures && !input.candidate.keySliceRegression;
  const costImprovement = input.candidate.costCents < input.baseline.costCents;
  const latencyImprovement = input.candidate.latencyMs < input.baseline.latencyMs;
  const reasons: string[] = [];
  if (!qualityNonInferior) reasons.push("QUALITY_NOT_NON_INFERIOR");
  if (input.candidate.keySliceRegression) reasons.push("KEY_SLICE_REGRESSION");
  if (!costImprovement && !latencyImprovement) reasons.push("NO_OPERATIONAL_IMPROVEMENT");
  const base = { schemaVersion: "evaluation-pareto.v1" as const, candidateId: input.candidate.candidateId, qualityNonInferior, costImprovement, latencyImprovement, eligibleDefault: qualityNonInferior && (costImprovement || latencyImprovement), reasons };
  return assertEvaluationParetoIntegrity({ ...base, fingerprint: hash(base) });
}
