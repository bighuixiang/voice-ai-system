import { describe, expect, it } from "vitest";
import { importLegacyQuestions } from "./legacyQuestionImport.js";

describe("legacy question import", () => {
  it("imports old question strings as sourced non-blocking candidates", () => {
    const result = importLegacyQuestions({ taskId: "task-old", questions: ["保留这个意象吗？"] });
    expect(result[0]).toMatchObject({ status: "candidate", sourceRef: "task://task-old/questions/1", blocking: false, activated: false, decisionId: null });
  });

  it("does not create a question from empty legacy text", () => {
    expect(importLegacyQuestions({ taskId: "task-old", questions: ["", "  "] })).toEqual([]);
  });
});
