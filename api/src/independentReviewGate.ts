import crypto from "node:crypto";

export interface IndependentReviewGateResult {
  schemaVersion: "independent-review-gate.v1";
  taskId: string;
  inputFingerprint: string;
  status: "passed" | "blocked";
  independent: boolean;
  reasons: string[];
  evidenceRefs: string[];
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assertIndependentReviewGateIntegrity(result: IndependentReviewGateResult): IndependentReviewGateResult {
  const { fingerprint, ...content } = result;
  const semanticValid = result.schemaVersion === "independent-review-gate.v1" && typeof result.taskId === "string" && result.taskId.trim().length > 0 && typeof result.inputFingerprint === "string" && result.inputFingerprint.trim().length > 0 && (result.status === "passed" || result.status === "blocked") && result.independent === (result.status === "passed") && Array.isArray(result.reasons) && result.reasons.every((reason) => typeof reason === "string" && reason.trim().length > 0) && (result.status === "passed" ? result.reasons.length === 0 : result.reasons.length > 0) && Array.isArray(result.evidenceRefs) && (result.status !== "passed" || result.evidenceRefs.length > 0) && result.evidenceRefs.every((ref) => typeof ref === "string" && ref.trim().length > 0);
  if (!semanticValid || hash(content) !== fingerprint) throw new Error("INDEPENDENT_REVIEW_GATE_INTEGRITY_FAILED");
  return result;
}

export function evaluateIndependentReviewGate(input: { taskId: string; inputFingerprint: string; generatorInvocationId: string; evaluatorInvocationId: string; evaluatorModelCapabilityRef: string; generatorModelCapabilityRef: string; firstOutputVisibility: "hidden" | "visible"; hardGuardsPassed: boolean; evidenceRefs: string[] }): IndependentReviewGateResult {
  const reasons: string[] = [];
  const nonBlank = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
  if (!nonBlank(input.taskId) || !nonBlank(input.inputFingerprint)) reasons.push("FROZEN_INPUT_REQUIRED");
  if (!nonBlank(input.generatorInvocationId) || !nonBlank(input.evaluatorInvocationId) || !nonBlank(input.evaluatorModelCapabilityRef) || !nonBlank(input.generatorModelCapabilityRef) || input.evaluatorInvocationId === input.generatorInvocationId || input.evaluatorModelCapabilityRef === input.generatorModelCapabilityRef) reasons.push("INDEPENDENT_EVALUATOR_REQUIRED");
  if (input.firstOutputVisibility !== "hidden") reasons.push("FIRST_OUTPUT_MUST_BE_HIDDEN");
  if (!input.hardGuardsPassed) reasons.push("HARD_GUARDS_FAILED");
  const evidenceRefs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [];
  if (!evidenceRefs.length || evidenceRefs.some((ref) => !nonBlank(ref))) reasons.push("EVIDENCE_REQUIRED");
  const base = { schemaVersion: "independent-review-gate.v1" as const, taskId: typeof input.taskId === "string" ? input.taskId : "", inputFingerprint: typeof input.inputFingerprint === "string" ? input.inputFingerprint : "", status: reasons.length ? "blocked" as const : "passed" as const, independent: reasons.length === 0, reasons, evidenceRefs: evidenceRefs.map((ref) => typeof ref === "string" ? ref : "") };
  return { ...base, fingerprint: hash(base) };
}
