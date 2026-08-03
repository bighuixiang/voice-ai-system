import crypto from "node:crypto";

export interface StructuredOutputGateResult {
  schemaVersion: "structured-output-gate.v1";
  status: "accepted" | "repair-required" | "quarantined";
  parsedOutput?: Record<string, unknown>;
  rawOutput: string;
  missingFields: string[];
  canonWriteAllowed: false | true;
  reasons: string[];
  fingerprint: string;
}

export interface CompletionEvidenceResult {
  schemaVersion: "completion-evidence-gate.v1";
  status: "supported" | "blocked";
  completionAllowed: boolean;
  selfClaims: string[];
  externalEvidenceRefs: string[];
  reasons: string[];
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assertStructuredOutputGateIntegrity(result: StructuredOutputGateResult): StructuredOutputGateResult { const { fingerprint, ...base } = result; if (result.schemaVersion !== "structured-output-gate.v1" || result.canonWriteAllowed && result.status !== "accepted" || hash(base) !== fingerprint) throw new Error("STRUCTURED_OUTPUT_GATE_INTEGRITY_FAILED"); return result; }
export function assertCompletionEvidenceIntegrity(result: CompletionEvidenceResult): CompletionEvidenceResult { const { fingerprint, ...base } = result; if (result.schemaVersion !== "completion-evidence-gate.v1" || result.completionAllowed !== (result.status === "supported") || hash(base) !== fingerprint) throw new Error("COMPLETION_EVIDENCE_INTEGRITY_FAILED"); return result; }

export function evaluateStructuredOutput(input: { rawOutput: string; requiredFields: string[]; repairAttempted?: boolean }): StructuredOutputGateResult {
  if (!input.rawOutput.trim() || !input.requiredFields.length || input.requiredFields.some((field) => !field.trim())) throw new Error("STRUCTURED_OUTPUT_INPUT_INVALID");
  let parsed: Record<string, unknown> | undefined;
  const reasons: string[] = [];
  try {
    const value: unknown = JSON.parse(input.rawOutput);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not-object");
    parsed = value as Record<string, unknown>;
  } catch {
    reasons.push("STRUCTURED_OUTPUT_PARSE_FAILED");
  }
  const missingFields = parsed ? input.requiredFields.filter((field) => field.trim() && !(field in parsed!)) : [...input.requiredFields];
  if (missingFields.length) reasons.push("STRUCTURED_OUTPUT_FIELDS_MISSING");
  const valid = reasons.length === 0;
  const status = valid ? "accepted" as const : input.repairAttempted ? "quarantined" as const : "repair-required" as const;
  const base = { schemaVersion: "structured-output-gate.v1" as const, status, ...(parsed ? { parsedOutput: parsed } : {}), rawOutput: input.rawOutput, missingFields, canonWriteAllowed: valid, reasons: [...new Set(reasons)] };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateCompletionEvidence(input: { selfClaims: string[]; externalEvidenceRefs: string[]; stateMachineProofRefs: string[]; independentReviewPassed: boolean }): CompletionEvidenceResult {
  const reasons: string[] = [];
  if ((!input.externalEvidenceRefs.length || input.externalEvidenceRefs.some((ref) => !ref.trim())) && (!input.stateMachineProofRefs.length || input.stateMachineProofRefs.some((ref) => !ref.trim()))) reasons.push("EXTERNAL_COMPLETION_EVIDENCE_REQUIRED");
  if (!input.independentReviewPassed) reasons.push("INDEPENDENT_REVIEW_REQUIRED");
  const base = { schemaVersion: "completion-evidence-gate.v1" as const, status: reasons.length ? "blocked" as const : "supported" as const, completionAllowed: reasons.length === 0, selfClaims: [...input.selfClaims], externalEvidenceRefs: [...input.externalEvidenceRefs], reasons: [...new Set(reasons)] };
  return { ...base, fingerprint: hash(base) };
}
