import crypto from "node:crypto";

export type RuntimeInterruptionKind = "stop" | "correction" | "constraint" | "direction" | "question" | "comment";
export interface RuntimeInterruption { schemaVersion: "runtime-interruption.v1"; messageId: string; taskId: string; kind: RuntimeInterruptionKind; effect: "gate-now" | "queue" | "observe"; lifecycle: Array<"received" | "classified" | "effective" | "queued" | "superseded">; transitionReason?: string; fingerprint: string; }
export interface DialogueRecovery { schemaVersion: "dialogue-recovery.v1"; source: "server-authoritative"; serverCursor: number; activeQuestionId?: string; authoritativeEvents: string[]; conflicts: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function classifyRuntimeInterruption(input: { messageId: string; text: string; taskId: string }): RuntimeInterruption {
  if (!input.messageId.trim() || !input.taskId.trim() || !input.text.trim()) throw new Error("RUNTIME_MESSAGE_FIELDS_REQUIRED");
  const kind: RuntimeInterruptionKind = /\bstop\b|停止|暂停/i.test(input.text) ? "stop" : /wrong|错了|不是|纠正/i.test(input.text) ? "correction" : /constraint|必须|不要/i.test(input.text) ? "constraint" : /question|问题|吗[？?]/i.test(input.text) ? "question" : /use|采用|改成|方向/i.test(input.text) ? "direction" : "comment";
  const effect = kind === "stop" || kind === "correction" ? "gate-now" as const : kind === "direction" || kind === "constraint" ? "queue" as const : "observe" as const;
  const lifecycle = effect === "gate-now" ? ["received", "classified", "effective"] as const : effect === "queue" ? ["received", "classified", "queued"] as const : ["received", "classified"] as const;
  const base = { schemaVersion: "runtime-interruption.v1" as const, messageId: input.messageId, taskId: input.taskId, kind, effect, lifecycle: [...lifecycle] };
  return { ...base, fingerprint: hash(base) };
}

export function advanceRuntimeInterruption(interruption: RuntimeInterruption, target: "effective" | "queued" | "superseded", reason: string): RuntimeInterruption {
  if (!reason.trim()) throw new Error("RUNTIME_TRANSITION_REASON_REQUIRED");
  if (!interruption.lifecycle.includes("classified")) throw new Error("RUNTIME_CLASSIFICATION_REQUIRED");
  if (interruption.lifecycle.includes("effective") || interruption.lifecycle.includes("superseded")) throw new Error("RUNTIME_INTERRUPTION_TERMINAL");
  if (target === "effective" && interruption.kind === "comment") throw new Error("RUNTIME_COMMENT_NOT_EFFECTIVE");
  const lifecycle = interruption.lifecycle.includes(target) ? [...interruption.lifecycle] : [...interruption.lifecycle, target];
  const base = { ...interruption, lifecycle, transitionReason: reason };
  const { fingerprint: _fingerprint, ...canonical } = base;
  return { ...base, fingerprint: hash(canonical) };
}
export function reconcileDialogueSession(input: { serverCursor: number; localCursor: number; authoritativeEvents: readonly string[]; activeQuestionId?: string; localDraftMessageId?: string }): DialogueRecovery {
  if (input.serverCursor < 0 || input.localCursor < 0) throw new Error("DIALOGUE_CURSOR_INVALID");
  const conflicts = input.localCursor > input.serverCursor ? ["local-cursor-ahead-of-server"] : input.localCursor < input.serverCursor && input.localDraftMessageId ? ["local-draft-ahead-of-server"] : [];
  const base = { schemaVersion: "dialogue-recovery.v1" as const, source: "server-authoritative" as const, serverCursor: input.serverCursor, ...(input.activeQuestionId ? { activeQuestionId: input.activeQuestionId } : {}), authoritativeEvents: [...input.authoritativeEvents], conflicts };
  return { ...base, fingerprint: hash(base) };
}
