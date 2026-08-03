import { describe, expect, it } from "vitest";
import { createUnderstandingVersion, reviseUnderstandingVersion } from "./understandingVersion.js";

describe("understanding versions", () => {
  it("keeps the exact user wording while adding fact, tension, and provisional inference", () => {
    const rawInput = "想写一个怕死的剑修，但关键时刻会救陌生人";
    const first = createUnderstandingVersion({ versionId: "u-1", rawInput, items: [{ itemId: "fact-1", kind: "fact", text: "剑修怕死", source: "user", userQuote: "怕死" }, { itemId: "tension-1", kind: "tension", text: "关键时刻救陌生人", source: "system-inference" }] });
    const second = reviseUnderstandingVersion(first, { versionId: "u-2", rawInput, additions: [{ itemId: "inference-1", kind: "inference", text: "怕死可能表现为谨慎", source: "system-inference" }] });
    expect(second.rawInput).toBe(rawInput);
    expect(second.supersedesVersionId).toBe("u-1");
    expect(second.items.find((item) => item.itemId === "fact-1")?.text).toBe("剑修怕死");
    expect(() => reviseUnderstandingVersion(first, { versionId: "u-3", rawInput: "想写一个谨慎的剑修", additions: [{ itemId: "i", kind: "inference", text: "谨慎", source: "system-inference" }] })).toThrow("UNDERSTANDING_RAW_INPUT_IMMUTABLE");
  });
});
