import { describe, expect, it } from "vitest";
import { evaluateObjectiveCandidate } from "./objectiveCandidateGuard.js";

describe("objective candidate guard", () => {
  it("rejects a dramatic candidate leaking POV-unknown facts despite a high preference score", () => {
    expect(evaluateObjectiveCandidate({ candidateId: "c-1", preferenceScore: 0.99, hardFactsPassed: true, povKnowledgePassed: false })).toMatchObject({ status: "rejected", score: 0, reasons: ["POV_KNOWLEDGE_FAILURE"] });
  });
  it("keeps the preference score only after hard guards pass", () => {
    expect(evaluateObjectiveCandidate({ candidateId: "c-2", preferenceScore: 0.7, hardFactsPassed: true, povKnowledgePassed: true })).toMatchObject({ status: "eligible", score: 0.7 });
  });
});
