import { describe, expect, it } from "vitest";
import { assembleWritingContextContract } from "./writingContextContract.js";

const valid = { requestId: "write-1", storyContract: "premise and ending constraint", characterStates: ["hero guarded"], worldRules: ["fire needs oxygen"], chapterCard: "scene goal: warn ally", adjacentSummaries: ["previous scene: gate closes", "next scene: pursuit"], distantFacts: ["chapter 2 promised reveal"], openForeshadowing: ["FS-1 due soon"], styleConstraints: ["close third person"], latestDirection: "make the warning cost trust", limits: { maxChars: 12000 } };

describe("writing context contract", () => {
  it("assembles all pre-writing context sections", () => {
    const result = assembleWritingContextContract(valid);
    expect(result.status).toBe("ready");
    expect(result.missingSections).toEqual([]);
    expect(result.sections).toHaveProperty("latestDirection");
  });

  it("makes missing or truncated context visible", () => {
    const result = assembleWritingContextContract({ ...valid, worldRules: [], chapterCard: "[...middle content truncated...]" });
    expect(result.status).toBe("blocked");
    expect(result.missingSections).toEqual(expect.arrayContaining(["worldRules", "chapterCard"]));
    expect(result.truncatedSections).toContain("chapterCard");
  });

  it("does not silently exceed the declared context budget", () => {
    expect(() => assembleWritingContextContract({ ...valid, limits: { maxChars: 20 } })).toThrow("WRITING_CONTEXT_BUDGET_EXCEEDED");
  });
});
