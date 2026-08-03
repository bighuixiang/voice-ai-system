import { describe, expect, it } from "vitest";
import { captureMultiIntent } from "./multiIntentCapture.js";

describe("multi-intent capture", () => {
  it("preserves answer, constraint, continue command, and paragraph lock spans", () => {
    const rawText = "A；女主不要出场，继续写，但保留上一版结尾";
    const result = captureMultiIntent({ messageId: "m-1", rawText, intents: [
      { intentId: "answer", kind: "answer", text: "A", start: 0, end: 1 },
      { intentId: "constraint", kind: "constraint", text: "女主不要出场", start: 2, end: 8 },
      { intentId: "continue", kind: "continue", text: "继续写", start: 9, end: 12 },
      { intentId: "lock", kind: "paragraph-lock", text: "保留上一版结尾", start: 14, end: 21 }
    ] });
    expect(result.intents.map((item) => item.kind)).toEqual(["answer", "constraint", "continue", "paragraph-lock"]);
    expect(result.intents.map((item) => item.sourceText)).toEqual(["A", "女主不要出场", "继续写", "保留上一版结尾"]);
    expect(result.rawText).toBe(rawText);
  });
  it("rejects a paraphrase that does not reference the original span", () => {
    expect(() => captureMultiIntent({ messageId: "m-2", rawText: "继续写", intents: [{ intentId: "i", kind: "continue", text: "写作", start: 0, end: 2 }] })).toThrow("MULTI_INTENT_SPAN_INVALID");
  });
});
