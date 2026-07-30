import { describe, expect, it } from "vitest";
import { createQuestionSession, classifyQuestionAnswer } from "./questionInteraction.js";

const question = { questionId: "q-1", text: "Who decides the ending?", level: "L2" as const, options: ["hero", "author", "system"], recommended: "author", affectedAssets: ["ending"], whyNow: "ending blocks outline", reversible: false };

describe("question interaction", () => {
  it("exposes one active blocking question with bounded options", () => {
    const session = createQuestionSession({ projectId: "demo", questions: [question] });
    expect(session.activeQuestionId).toBe("q-1");
    expect(session.questions[0]?.options.length).toBeLessThanOrEqual(3);
  });

  it("rejects multiple active L2 questions", () => {
    expect(() => createQuestionSession({ projectId: "demo", questions: [question, { ...question, questionId: "q-2" }] })).toThrow("QUESTION_ACTIVE_L2_LIMIT");
  });

  it("classifies delegated, option, free, new-direction and unrelated answers", () => {
    expect(classifyQuestionAnswer(question, "你决定").kind).toBe("delegated");
    expect(classifyQuestionAnswer(question, "hero").kind).toBe("option");
    expect(classifyQuestionAnswer(question, "I want the ending to stay open").kind).toBe("free-text");
    expect(classifyQuestionAnswer(question, "换个方向：make it a mystery").kind).toBe("new-direction");
    expect(classifyQuestionAnswer(question, "今天天气很好").kind).toBe("unrelated");
  });
});
