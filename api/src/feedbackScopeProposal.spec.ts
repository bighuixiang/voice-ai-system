import { describe, expect, it } from "vitest";
import { proposeFeedbackScope } from "./feedbackScopeProposal.js";

describe("feedback scope proposal", () => {
  it("keeps one emotionality complaint at scene scope", () => {
    expect(proposeFeedbackScope({ text: "这里太煽情", currentSceneId: "farewell", repeatedSceneIds: ["farewell"] })).toMatchObject({ currentScope: "scene", proposal: "none" });
  });
  it("offers scope expansion only after three repeated scenes", () => {
    expect(proposeFeedbackScope({ text: "这里太煽情", currentSceneId: "s3", repeatedSceneIds: ["s1", "s2", "s3"] }).proposal).toBe("character-line-or-project-review");
  });
});
