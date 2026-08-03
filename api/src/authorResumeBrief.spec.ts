import { describe, expect, it } from "vitest";
import { assertAuthorResumeBriefIntegrity, buildAuthorResumeBrief } from "./authorResumeBrief.js";

describe("author resume brief", () => {
  it("reconstructs confirmed boundaries and the single active question from server authority", () => {
    const session = {
      schemaVersion: "creative-session.v1" as const, sessionId: "session-demo", projectSlug: "demo", status: "understanding" as const, phase: "understanding" as const,
      collaborationMode: "guided" as const, activeQuestionId: "q-2", latestDirection: "protect the witness", unconfirmedAssumptions: ["city motive unknown"], decisionRefs: ["decision-q-1"], pendingPatchRefs: [],
      messages: [{ id: "m-1", clientMessageId: "m-1", role: "system" as const, text: "Confirmed the cost boundary.", source: { kind: "system-paraphrase" as const }, createdAt: "2026-01-01T00:00:00Z" }], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", fingerprint: "session-fp"
    };
    const question = { schemaVersion: "dialogue-question.v1" as const, questionId: "q-2", questionVersion: 3, projectSlug: "demo", status: "active" as const, text: "What does the witness risk?", whyNow: "It changes the next choice.", impact: "high" as const, ambiguity: 0.4, errorCost: "wrong sacrifice", reversibility: "medium", delayCost: "blocks outline", options: [], recommendation: "answer now", snapshotFingerprint: "q-fp" };
    const decision = { schemaVersion: "decision-record.v1" as const, decisionId: "decision-q-1", questionId: "q-1", projectSlug: "demo", questionVersion: 1, answerText: "The keeper must share proof.", answerStatus: "confirmed" as const, status: "recorded" as const, sourceFingerprint: "q1-fp", evidenceRefs: [{ kind: "dialogue-question" as const, refId: "q-1" }], canonWritten: false as const, createdAt: "2026-01-01T00:00:00Z" };
    const brief = buildAuthorResumeBrief({ session, questions: [question], decisions: [decision], executingTaskRefs: ["task-1"] });
    expect(brief).toMatchObject({ schemaVersion: "author-resume-brief.v1", projectSlug: "demo", lastDirection: "protect the witness", recommendedNextStep: "answer:q-2", executingTaskRefs: ["task-1"], activeQuestion: { questionId: "q-2", questionVersion: 3 } });
    expect(brief.confirmedBoundaries).toEqual([{ decisionId: "decision-q-1", questionId: "q-1", text: "The keeper must share proof." }]);
    expect(brief.adoptedDecisions).toEqual(brief.confirmedBoundaries);
    expect(brief.currentSoleRisk).toBe("city motive unknown");
    expect(brief.reviewableResults).toEqual(["task-1"]);
    expect(brief.sourceRefs).toEqual(expect.arrayContaining(["decision://decision-q-1", "question://q-2@3"]));
    expect(() => assertAuthorResumeBriefIntegrity(brief, "session-fp")).not.toThrow();
    expect(() => assertAuthorResumeBriefIntegrity({ ...brief, lastDirection: "tampered" })).toThrow("AUTHOR_RESUME_BRIEF_INTEGRITY_FAILED");
  });
});
