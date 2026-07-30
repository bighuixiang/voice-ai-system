import crypto from "node:crypto";

export type AutonomyLevel = "L0" | "L1" | "L2";
export interface QuestionGateResult { schemaVersion: "question-value-gate.v1"; questionId: string; value: number; level: AutonomyLevel; blocking: boolean; affectedAssets: string[]; whyNow: string; recommendation: string; reversible: boolean; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluateQuestionValue(input: { questionId: string; text: string; impact: number; uncertainty: number; irreversibility: number; urgency: number; userEffort: number; affectedAssets: readonly string[]; recommendation: string; reversible: boolean; threshold: number }): QuestionGateResult {
  if (!input.questionId.trim() || !input.text.trim() || !input.affectedAssets.length || !input.recommendation.trim()) throw new Error("QUESTION_GATE_FIELDS_REQUIRED");
  const values = [input.impact, input.uncertainty, input.irreversibility, input.urgency, input.userEffort]; if (values.some((value) => value < 0 || value > 1)) throw new Error("QUESTION_GATE_VALUE_INVALID");
  const value = input.impact * input.uncertainty * input.irreversibility * input.urgency - input.userEffort;
  const level: AutonomyLevel = input.impact >= 0.75 || input.irreversibility >= 0.75 || input.affectedAssets.some((asset) => /ending|canon|pov|world-rule|mainline/iu.test(asset)) ? "L2" : value >= input.threshold ? "L1" : "L0";
  const blocking = level === "L2"; const base = { schemaVersion: "question-value-gate.v1" as const, questionId: input.questionId, value, level, blocking, affectedAssets: [...input.affectedAssets], whyNow: `影响 ${input.affectedAssets.join(", ")}；不处理将使后续决策风险继续传播。`, recommendation: input.recommendation, reversible: input.reversible };
  return { ...base, fingerprint: hash(base) };
}
