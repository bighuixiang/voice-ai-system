import crypto from "node:crypto";

export type EvaluationVerdict = "accept" | "reject" | "tie" | "uncertain" | "not_applicable";
export type DisagreementImpact = "ordinary" | "elevated" | "critical";
export interface EvaluationDisagreementDecision {
  schemaVersion: "evaluation-disagreement.v1";
  status: EvaluationVerdict;
  action: "continue" | "independent-review" | "author-choice" | "not-applicable";
  confidence: number;
  reasons: string[];
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function assertEvaluationDisagreementIntegrity(decision: EvaluationDisagreementDecision): EvaluationDisagreementDecision {
  const { fingerprint: _fingerprint, ...base } = decision;
  const validStatuses: EvaluationVerdict[] = ["accept", "reject", "tie", "uncertain", "not_applicable"];
  const validActions = ["continue", "independent-review", "author-choice", "not-applicable"];
  if (decision.schemaVersion !== "evaluation-disagreement.v1" || !validStatuses.includes(decision.status) || !validActions.includes(decision.action) || !Number.isFinite(decision.confidence) || decision.confidence < 0 || decision.confidence > 1 || !Array.isArray(decision.reasons) || decision.reasons.some((reason) => typeof reason !== "string") || !/^[a-f0-9]{64}$/i.test(decision.fingerprint) || hash(base) !== decision.fingerprint) throw new Error("EVALUATION_DISAGREEMENT_INTEGRITY_FAILED");
  return decision;
}

export function decideEvaluationDisagreement(input: { verdicts: Array<{ verdict: EvaluationVerdict; confidence: number }>; impact: DisagreementImpact; hardGatesPassed: boolean; authorGoalMatched: boolean; protectedItemRegression: boolean; autonomyAuthorized: boolean }): EvaluationDisagreementDecision {
  if (!input.verdicts.length || input.verdicts.some((item) => !["accept", "reject", "tie", "uncertain", "not_applicable"].includes(item.verdict) || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1)) throw new Error("EVALUATION_DISAGREEMENT_INPUT_INVALID");
  const verdicts = input.verdicts.map((item) => item.verdict);
  if (verdicts.every((verdict) => verdict === "not_applicable")) return finalize({ schemaVersion: "evaluation-disagreement.v1", status: "not_applicable", action: "not-applicable", confidence: 1, reasons: ["ALL_NOT_APPLICABLE"] });
  const hasDisagreement = new Set(verdicts.filter((verdict) => verdict !== "not_applicable")).size > 1 || verdicts.some((verdict) => verdict === "tie" || verdict === "uncertain");
  const confidence = input.verdicts.reduce((sum, item) => sum + item.confidence, 0) / input.verdicts.length;
  const reasons: string[] = [];
  if (!input.hardGatesPassed) reasons.push("HARD_GATE_FAILED");
  if (input.protectedItemRegression) reasons.push("PROTECTED_ITEM_REGRESSION");
  if (!input.authorGoalMatched) reasons.push("AUTHOR_GOAL_MISMATCH");
  if (!hasDisagreement && !reasons.length) return finalize({ schemaVersion: "evaluation-disagreement.v1", status: verdicts[0] as "accept" | "reject", action: "continue", confidence, reasons: [] });
  if (input.impact === "critical" || input.protectedItemRegression || !input.hardGatesPassed || !input.authorGoalMatched) return finalize({ schemaVersion: "evaluation-disagreement.v1", status: hasDisagreement ? "uncertain" : (verdicts.includes("reject") ? "reject" : "uncertain"), action: "author-choice", confidence, reasons: [...reasons, "CRITICAL_OR_PROTECTED_DISAGREEMENT"] });
  if (input.impact === "elevated" || !input.autonomyAuthorized) return finalize({ schemaVersion: "evaluation-disagreement.v1", status: "uncertain", action: "independent-review", confidence, reasons: [...reasons, "INDEPENDENT_REVIEW_REQUIRED"] });
  return finalize({ schemaVersion: "evaluation-disagreement.v1", status: "uncertain", action: "continue", confidence, reasons: [...reasons, "SCOPED_LOW_IMPACT_DISAGREEMENT"] });
}

const finalize = (base: Omit<EvaluationDisagreementDecision, "fingerprint">): EvaluationDisagreementDecision => assertEvaluationDisagreementIntegrity({ ...base, fingerprint: hash(base) });
