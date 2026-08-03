import crypto from "node:crypto";

export type CollaborationEventType = "answer" | "new-direction" | "preserve" | "continue" | "delegate-decision" | "exploratory-draft" | "rollback" | "policy-change" | "objection" | "unrelated";
export interface CollaborationMessageResult { schemaVersion: "collaboration-message.v1"; events: Array<{ type: CollaborationEventType; text: string; source: "author" }>; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function parseCollaborationMessage(text: string, options: { activeQuestionId?: string } = {}): CollaborationMessageResult {
  if (!text.trim()) throw new Error("COLLAB_MESSAGE_REQUIRED");
  const chunks = text.split(/[;；\n]+/).map((chunk) => chunk.trim()).filter(Boolean); const events: CollaborationMessageResult["events"] = [];
  for (const chunk of chunks) {
    if (/^(你决定|交给系统|you decide)$/iu.test(chunk)) events.push({ type: "delegate-decision", text: chunk, source: "author" });
    else if (/^(先写一版|先写一版看看|explore draft)$/iu.test(chunk)) events.push({ type: "exploratory-draft", text: chunk, source: "author" });
    else if (/^(回到上一版|rollback)$/iu.test(chunk)) events.push({ type: "rollback", text: chunk, source: "author" });
    else if (/^(少问一点|ask less)$/iu.test(chunk)) events.push({ type: "policy-change", text: chunk, source: "author" });
    else if (/^继续$/u.test(chunk)) events.push({ type: "continue", text: chunk, source: "author" });
    else if (/^保留/u.test(chunk)) events.push({ type: "preserve", text: chunk, source: "author" });
    else if (/^换个方向[:：]/u.test(chunk)) events.push({ type: "new-direction", text: chunk, source: "author" });
    else if (/^(不是这个意思|不对|wrong)/iu.test(chunk)) events.push({ type: "objection", text: chunk, source: "author" });
    else if (/^(选|choose|选择)\s*/iu.test(chunk)) events.push({ type: "answer", text: chunk, source: "author" });
    else if (options.activeQuestionId?.trim()) events.push({ type: "answer", text: chunk, source: "author" });
    else events.push({ type: "unrelated", text: chunk, source: "author" });
  }
  const base = { schemaVersion: "collaboration-message.v1" as const, events };
  return { ...base, fingerprint: hash(base) };
}
