import crypto from "node:crypto";

export interface DialogueTimeoutDecision { schemaVersion: "dialogue-timeout-decision.v1"; questionId: string; status: "not_expired" | "gate_required" | "read_only_continue" | "delegated_continue"; consent: boolean; writeAllowed: boolean; elapsedMs: number; timeoutMs: number; reason: string; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluateDialogueTimeout(input: { questionId: string; elapsedMs: number; timeoutMs: number; impact: "low" | "medium" | "high"; pendingWrite: boolean; validDelegation: boolean }): DialogueTimeoutDecision {
  if (!input.questionId.trim() || input.elapsedMs < 0 || input.timeoutMs <= 0) throw new Error("DIALOGUE_TIMEOUT_INPUT_INVALID");
  const expired = input.elapsedMs >= input.timeoutMs;
  const status = !expired ? "not_expired" as const : input.validDelegation ? "delegated_continue" as const : input.pendingWrite || input.impact === "high" ? "gate_required" as const : "read_only_continue" as const;
  const base = { schemaVersion: "dialogue-timeout-decision.v1" as const, questionId: input.questionId, status, consent: status === "delegated_continue", writeAllowed: status === "delegated_continue", elapsedMs: input.elapsedMs, timeoutMs: input.timeoutMs, reason: !expired ? "question-still-within-window" : status === "gate_required" ? "timeout-is-not-consent" : status === "read_only_continue" ? "only-independent-read-only-work-may-continue" : "explicit-valid-delegation" };
  return { ...base, fingerprint: hash(base) };
}
