import { describe, expect, it } from "vitest";
import { createIntentDraft } from "./intentDraft.js";

describe("intent draft", () => {
  it("separates user facts, system inference, unknowns, preferences and prohibitions", () => {
    const draft = createIntentDraft({ draftId: "intent-1", rawInput: "A courier finds a door that remembers names.", items: [
      { itemId: "f1", kind: "fact", text: "courier finds a door", source: "user", confidence: 1, userQuote: "A courier finds a door" },
      { itemId: "i1", kind: "inference", text: "door is magical", source: "system-inference", confidence: 0.6 },
      { itemId: "u1", kind: "unknown", text: "who built the door", source: "system-inference", confidence: 0.2 },
      { itemId: "p1", kind: "preference", text: "quiet tension", source: "user", confidence: 0.8 },
      { itemId: "x1", kind: "prohibition", text: "no chosen-one reveal", source: "user", confidence: 0.9 }
    ] });
    expect(draft.status).toBe("candidate");
    expect(draft.items.find((item) => item.kind === "inference")?.source).toBe("system-inference");
  });

  it("rejects inference disguised as user fact", () => {
    expect(() => createIntentDraft({ draftId: "intent-2", rawInput: "idea", items: [{ itemId: "f", kind: "fact", text: "the hero is noble", source: "user", confidence: 1 }] })).toThrow("INTENT_FACT_QUOTE_REQUIRED");
  });

  it("keeps confidence bounded", () => {
    expect(() => createIntentDraft({ draftId: "intent-3", rawInput: "idea", items: [{ itemId: "u", kind: "unknown", text: "unknown", source: "system-inference", confidence: 2 }] })).toThrow("INTENT_ITEM_INVALID");
  });
});
