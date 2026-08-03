import { describe, expect, it } from "vitest";
import { compileObjectiveSentence } from "./objectiveSentenceCompiler.js";

describe("objective sentence compiler", () => {
  it("separates one sentence into vision, hard constraint, and anti-goal with the same source", () => {
    const items = compileObjectiveSentence({ rawText: "想写一个温柔但不软弱的女主，悬疑要公平，结尾别靠牺牲煽情。", sourceRef: "utterance://author-1", profileId: "obj-1" });
    expect(items.map((item) => item.kind)).toEqual(["aspiration", "hard_constraint", "anti_goal"]);
    expect(items.every((item) => item.sourceRefs.includes("utterance://author-1"))).toBe(true);
    expect(items.map((item) => item.text)).not.toEqual(["高质量悬疑"]);
  });

  it("rejects a sentence that cannot produce layered objectives", () => {
    expect(() => compileObjectiveSentence({ rawText: "写故事", sourceRef: "utterance://a", profileId: "obj" })).toThrow("OBJECTIVE_SENTENCE_UNDER_SPECIFIED");
  });
});
