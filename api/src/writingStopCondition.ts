import crypto from "node:crypto";

export interface WritingStopResult { schemaVersion: "writing-stop-evaluation.v1"; evaluationId: string; workItemId: string; decision: "stop" | "continue" | "blocked"; reasons: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluateWritingStopCondition(input: { evaluationId: string; workItemId: string; obligations: readonly { id: string; status: "open" | "fulfilled" | "deferred" }[]; qualityGates: readonly { gateId: string; status: "passed" | "failed" }[]; unresolvedRisks: readonly { id: string; severity: "low" | "medium" | "high" }[]; budget: { used: number; max: number }; authorInstruction: string; evidenceRefs: readonly string[] }): WritingStopResult {
  if (!input.evaluationId.trim() || !input.workItemId.trim()) throw new Error("WRITING_STOP_FIELDS_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("WRITING_STOP_EVIDENCE_REQUIRED");
  const reasons: string[] = []; if (input.authorInstruction.trim()) reasons.push("AUTHOR_STOP_INSTRUCTION");
  if (input.unresolvedRisks.some((risk) => risk.severity === "high")) reasons.push("HIGH_RISK_UNRESOLVED");
  if (input.budget.used >= input.budget.max) reasons.push("BUDGET_EXHAUSTED");
  const obligationsOpen = input.obligations.some((item) => item.status === "open"); const gatesFailed = input.qualityGates.some((gate) => gate.status === "failed");
  if (obligationsOpen) reasons.push("OBLIGATIONS_OPEN"); if (gatesFailed) reasons.push("QUALITY_GATE_FAILED");
  const decision = input.unresolvedRisks.some((risk) => risk.severity === "high") || input.budget.used >= input.budget.max ? "blocked" as const : input.authorInstruction.trim() || (!obligationsOpen && !gatesFailed) ? "stop" as const : "continue" as const;
  const base = { schemaVersion: "writing-stop-evaluation.v1" as const, evaluationId: input.evaluationId, workItemId: input.workItemId, decision, reasons };
  return { ...base, fingerprint: hash(base) };
}
