import { describe, expect, it } from "vitest";
import { evaluateEvidenceMinimum, evaluatePatternExperiment, resolveCraftConflict, selectResearchForGap } from "./researchSelectionGates.js";
describe("research selection gates", () => {
  it("reuses mechanisms before research", () => { expect(selectResearchForGap({ taskGap: "repair voice", reusableMechanisms: ["subtext"], candidates: [], tokenBudget: 100 }).status).toBe("reuse"); });
  it("researches only task-relevant mechanism", () => { expect(selectResearchForGap({ taskGap: "repair voice", reusableMechanisms: [], candidates: [{ id: "a", mechanism: "dialogue subtext", useCase: "dialogue", relevance: 1 }, { id: "b", mechanism: "battle spectacle", useCase: "battle", relevance: 10 }], tokenBudget: 100 })).toMatchObject({ status: "research", selectedIds: ["a"] }); });
  it("does not spend extra samples when evidence is sufficient", () => { expect(evaluateEvidenceMinimum({ selectedMechanisms: ["subtext"], omittedContents: ["sample-4"], omissionReasons: ["not-relevant"], tokenRemaining: 100 }).addedSamples).toBe(0); });
  it("lets local goal and anti-goal resolve conflict", () => { expect(resolveCraftConflict({ globalRule: "short tense", localGoal: "long aftermath", antiGoal: "no hook" }).selectedInstruction).toBe("long aftermath"); });
  it("rejects self-scored pattern after blind baseline loses", () => { expect(evaluatePatternExperiment({ currentStatus: "probation", modelScore: 96, blindBaselinePreferred: true, reworkCount: 2, holdoutPassed: true }).status).toBe("rejected"); });
});
