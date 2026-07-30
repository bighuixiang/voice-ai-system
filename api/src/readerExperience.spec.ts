import { describe, expect, it } from "vitest";
import { createReaderExperienceContract, createReaderExperienceHypothesis, createColdReadSnapshot, createReaderKnowledgeState, assessReaderCognitiveLoad, evaluateReaderPayoff } from "./readerExperience.js";

describe("reader experience contract", () => {
  it("declares target reading states and evidence conditions without forcing every dimension upward", () => {
    const contract = createReaderExperienceContract({ contractId: "r-1", target: "chapter-1", direction: { orientation: "increase", curiosity: "increase", emotion: "hold", tension: "release" }, evidenceConditions: ["reader sees the door"], intentionallyQuiet: ["tension"] });
    expect(contract.evidenceConditions).toContain("reader sees the door");
    expect(contract.intentionallyQuiet).toContain("tension");
  });

  it("bounds reader conclusions as calibrated hypotheses", () => {
    const hypothesis = createReaderExperienceHypothesis({ hypothesisId: "h-1", targetReader: "mystery novice", claim: "may feel curious", evidenceRefs: ["manuscript://v1#1-2"], counterExamples: ["reader may be confused"], confidence: 0.5, calibrationStatus: "uncalibrated" });
    expect(hypothesis.isCanonReaction).toBe(false);
  });

  it("seals cold-read snapshots to published reader-visible material", () => {
    const snapshot = createColdReadSnapshot({ snapshotId: "c-1", publicationVersion: "v1", progress: "chapter-2", visibleText: "The door hummed.", visibleTitles: ["Chapter 1"], leakedFields: [] });
    expect(snapshot.valid).toBe(true);
    expect(() => createColdReadSnapshot({ snapshotId: "c-2", publicationVersion: "v1", progress: "chapter-2", visibleText: "The door hummed.", visibleTitles: [], leakedFields: ["authorTruth"] })).toThrow("COLD_READ_LEAK");
  });

  it("tracks reader questions, beliefs, doubts and predictions from visible evidence", () => {
    const state = createReaderKnowledgeState({ snapshotId: "c-1", questions: ["what is behind the door"], beliefs: ["door is dangerous"], doubts: ["courier is lying"], predictions: ["door will open"], evidenceRefs: ["manuscript://v1#1-2"] });
    expect(state.predictions).toContain("door will open");
  });

  it("blocks cognitive load over budget and only counts a payoff when state changes", () => {
    const load = assessReaderCognitiveLoad({ budget: 3, newCharacters: 2, newTerms: 2, newRules: 0, timeJumps: 0, povSwitches: 0, recalledClues: 1 });
    expect(load.status).toBe("over-budget");
    const payoff = evaluateReaderPayoff({ payoffId: "p-1", before: { understanding: "unknown" }, after: { understanding: "portal" }, evidenceRef: "manuscript://v1#100-120" });
    expect(payoff.status).toBe("changed");
  });
});
