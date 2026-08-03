import { describe, expect, it } from "vitest";
import { createQ003Profile, createStageObjectiveWeights, evaluateAntiGoalGuard } from "./draftingGovernance.js";

describe("drafting governance", () => {
  it("uses stage-versioned weights without allowing hard constraints to become optional", () => {
    expect(createStageObjectiveWeights({ stage: "drafting", strategyVersion: "drafting-v1", weights: { voice: 0.5, canon: 1 }, hardConstraints: ["canon"], evidenceRefs: ["policy://1"] }).strategyVersion).toBe("drafting-v1");
    expect(() => createStageObjectiveWeights({ stage: "drafting", strategyVersion: "drafting-v1", weights: { canon: 0 }, hardConstraints: ["canon"], evidenceRefs: ["policy://1"] })).toThrow("HARD_CONSTRAINT_WEIGHT_INVALID");
  });
  it("flags anti-goal hits for local repair instead of silently accepting prose", () => {
    expect(evaluateAntiGoalGuard({ text: "The character said exactly what the author wanted and explained the mystery.", antiGoals: [{ antiGoal: "exposition", evidence: "author://1", patterns: ["explained the mystery"] }], repairScope: ["sentence"] }).status).toBe("repair-required");
    expect(evaluateAntiGoalGuard({ text: "The door creaked.", antiGoals: [{ antiGoal: "exposition", evidence: "author://1", patterns: ["explained the mystery"] }], repairScope: ["sentence"] }).status).toBe("passed");
  });
  it("keeps Q-003 unconfirmed until an explicit evidence-backed choice", () => {
    expect(createQ003Profile({ status: "unconfirmed", evidenceRefs: [] })).toMatchObject({ status: "unconfirmed", metrics: expect.arrayContaining(["delivery-speed", "quality-evidence"]) });
    expect(() => createQ003Profile({ status: "confirmed", speedPreference: 0.7, qualityPreference: 0.8, evidenceRefs: [] })).toThrow("Q003_EVIDENCE_REQUIRED");
  });
});
