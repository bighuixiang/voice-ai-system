import crypto from "node:crypto";

export type MultiIntentKind = "answer" | "constraint" | "continue" | "paragraph-lock";
export interface MultiIntentCapture {
  schemaVersion: "multi-intent-capture.v1";
  messageId: string;
  rawText: string;
  intents: Array<{ intentId: string; kind: MultiIntentKind; text: string; start: number; end: number; sourceText: string }>;
  fingerprint: string;
}
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function captureMultiIntent(input: { messageId: string; rawText: string; intents: ReadonlyArray<{ intentId: string; kind: MultiIntentKind; text: string; start: number; end: number }> }): MultiIntentCapture {
  if (!input.messageId.trim() || !input.rawText.trim() || !input.intents.length) throw new Error("MULTI_INTENT_FIELDS_REQUIRED");
  const sorted = [...input.intents].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i += 1) {
    const item = sorted[i];
    if (!item.intentId.trim() || !["answer", "constraint", "continue", "paragraph-lock"].includes(item.kind) || !item.text.trim() || item.start < 0 || item.end <= item.start || item.end > input.rawText.length || input.rawText.slice(item.start, item.end) !== item.text || (i > 0 && item.start < sorted[i - 1].end)) throw new Error("MULTI_INTENT_SPAN_INVALID");
  }
  const base = { schemaVersion: "multi-intent-capture.v1" as const, messageId: input.messageId, rawText: input.rawText, intents: sorted.map((item) => ({ ...item, sourceText: input.rawText.slice(item.start, item.end) })) };
  return { ...base, fingerprint: hash(base) };
}
