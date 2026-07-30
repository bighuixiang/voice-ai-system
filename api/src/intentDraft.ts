import crypto from "node:crypto";

export type IntentItemKind = "fact" | "inference" | "unknown" | "preference" | "prohibition";
export interface IntentItem { itemId: string; kind: IntentItemKind; text: string; source: "user" | "system-inference"; confidence: number; userQuote?: string; }
export interface IntentDraft { schemaVersion: "intent-draft.v1"; draftId: string; rawInput: string; items: IntentItem[]; status: "candidate" | "blocked"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createIntentDraft(input: { draftId: string; rawInput: string; items: readonly IntentItem[] }): IntentDraft {
  if (!input.draftId.trim() || !input.rawInput.trim()) throw new Error("INTENT_DRAFT_FIELDS_REQUIRED");
  if (!input.items.length) throw new Error("INTENT_ITEMS_REQUIRED");
  for (const item of input.items) {
    if (!item.itemId.trim() || !item.text.trim() || item.confidence < 0 || item.confidence > 1) throw new Error("INTENT_ITEM_INVALID");
    if (item.kind === "inference" && item.source !== "system-inference") throw new Error("INTENT_INFERENCE_SOURCE_INVALID");
    if (item.kind === "fact" && item.source !== "user") throw new Error("INTENT_FACT_SOURCE_INVALID");
    if (item.kind === "fact" && !item.userQuote?.trim()) throw new Error("INTENT_FACT_QUOTE_REQUIRED");
  }
  const status = input.items.some((item) => item.kind === "inference" && item.source === "user") ? "blocked" as const : "candidate" as const;
  const base = { schemaVersion: "intent-draft.v1" as const, draftId: input.draftId, rawInput: input.rawInput, items: input.items.map((item) => ({ ...item })), status };
  return { ...base, fingerprint: hash(base) };
}
