import crypto from "node:crypto";

export interface AmbiguityImpactGate { schemaVersion: "ambiguity-impact-gate.v1"; questionId: string; status: "l2_required" | "safe_to_defer"; confidence: number; alternatives: string[]; reasons: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluateAmbiguityImpactGate(input: { questionId: string; impact: number; ambiguity: number; confidence: number; alternatives: readonly string[]; irreversible: boolean }): AmbiguityImpactGate {
  if (!input.questionId.trim() || !input.alternatives.length || [input.impact, input.ambiguity, input.confidence].some((value) => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("AMBIGUITY_GATE_INPUT_INVALID");
  const highImpact = input.impact >= 0.7 || input.irreversible;
  const unresolved = input.ambiguity > 0 || input.alternatives.length > 1;
  const required = highImpact && unresolved;
  const base = { schemaVersion: "ambiguity-impact-gate.v1" as const, questionId: input.questionId, status: required ? "l2_required" as const : "safe_to_defer" as const, confidence: input.confidence, alternatives: [...input.alternatives], reasons: required ? ["HIGH_IMPACT_AMBIGUITY_REQUIRES_L2", ...(input.irreversible ? ["IRREVERSIBLE_OUTCOME"] : [])] : [] };
  return { ...base, fingerprint: hash(base) };
}
