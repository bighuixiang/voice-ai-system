import { describe, expect, it } from "vitest";
import { createQuestionGovernance, registerQuestion, updateCollaborationPolicy } from "./questionGovernance.js";

describe("question governance", () => {
  it("enforces a blocking-question budget and records why-now risk", () => {
    const governance = createQuestionGovernance({ projectId: "demo", maxBlockingQuestions: 2, policy: { decideForMe: [], alwaysAsk: ["core-ending"], askLess: false } });
    const next = registerQuestion(governance, { questionId: "q-1", text: "Who decides the core ending?", impact: "core-ending", blocking: true, affectedAssets: ["ending"], riskIfSkipped: "canon may be wrong", recommendation: "ask author", canDefer: false });
    expect(next.questions[0]?.whyNow).toContain("ending");
  });

  it("deduplicates equivalent questions unless prior answer is stale with a reason", () => {
    const governance = createQuestionGovernance({ projectId: "demo", maxBlockingQuestions: 5, policy: { decideForMe: [], alwaysAsk: [], askLess: false } });
    const one = registerQuestion(governance, { questionId: "q-1", text: "Who decides the ending?", impact: "ending", blocking: true, affectedAssets: ["ending"], riskIfSkipped: "wrong canon", recommendation: "ask", canDefer: true });
    expect(() => registerQuestion(one, { questionId: "q-2", text: "Who decides the ending?", impact: "ending", blocking: true, affectedAssets: ["ending"], riskIfSkipped: "wrong canon", recommendation: "ask", canDefer: true })).toThrow("QUESTION_DUPLICATE");
    const updated = registerQuestion(one, { questionId: "q-2", text: "Who decides the ending?", impact: "ending", blocking: true, affectedAssets: ["ending"], riskIfSkipped: "new outline changed the ending", recommendation: "ask", canDefer: true, staleReason: "new outline changed the ending" });
    expect(updated.questions).toHaveLength(2);
  });

  it("records visible policy changes without overriding core protections", () => {
    const governance = createQuestionGovernance({ projectId: "demo", maxBlockingQuestions: 5, policy: { decideForMe: [], alwaysAsk: [], askLess: false } });
    const updated = updateCollaborationPolicy(governance, { decideForMe: ["temporary-location"], alwaysAsk: ["core-ending"], askLess: true });
    expect(updated.policy.askLess).toBe(true);
    expect(updated.policy.alwaysAsk).toContain("core-ending");
  });
});
