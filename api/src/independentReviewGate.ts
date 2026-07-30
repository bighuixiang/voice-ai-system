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

export function evaluateIndependentReviewGate(input: { taskId: string; inputFingerprint: string; generatorInvocationId: string; evaluatorInvocationId: string; evaluatorModelCapabilityRef: string; generatorModelCapabilityRef: string; firstOutputVisibility: "hidden" | "visible"; hardGuardsPassed: boolean; evidenceRefs: string[] }): IndependentReviewGateResult {
  const reasons: string[] = [];
  if (!input.taskId.trim() || !input.inputFingerprint.trim()) reasons.push("FROZEN_INPUT_REQUIRED");
  if (!input.evaluatorInvocationId.trim() || input.evaluatorInvocationId === input.generatorInvocationId || input.evaluatorModelCapabilityRef === input.generatorModelCapabilityRef) reasons.push("INDEPENDENT_EVALUATOR_REQUIRED");
  if (input.firstOutputVisibility !== "hidden") reasons.push("FIRST_OUTPUT_MUST_BE_HIDDEN");
  if (!input.hardGuardsPassed) reasons.push("HARD_GUARDS_FAILED");
  if (!input.evidenceRefs.length) reasons.push("EVIDENCE_REQUIRED");
  const base = { schemaVersion: "independent-review-gate.v1" as const, taskId: input.taskId, inputFingerprint: input.inputFingerprint, status: reasons.length ? "blocked" as const : "passed" as const, independent: reasons.length === 0, reasons, evidenceRefs: [...input.evidenceRefs] };
  return { ...base, fingerprint: hash(base) };
}
