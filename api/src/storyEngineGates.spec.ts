import { describe, expect, it } from "vitest";
import { compileFuzzyIdea, detectDependencyCycle, separateStoryQuestions, validateArcGraph, validateEndingPrerequisites } from "./storyEngineGates.js";
describe("story engine gates", () => {
  it("keeps unknown facts unknown", () => { expect(compileFuzzyIdea({ premise: "amnesiac coroner", killerIdentityKnown: false, amnesiaCauseKnown: false })).toMatchObject({ canonWritten: false, unknowns: ["killer_identity", "amnesia_cause"] }); });
  it("blocks completion until main question is answered", () => { expect(separateStoryQuestions({ mainAnswered: false, openSubquestionAuthorized: true, mainConsequences: [], subquestionConsequences: ["sequel"] }).canFinish).toBe(false); });
  it("reports missing ending prerequisites", () => { expect(validateEndingPrerequisites({ endingChoice: "confess", prerequisites: [{ kind: "evidence", satisfied: false }, { kind: "cost", satisfied: true }] }).status).toBe("unreachable"); });
  it("preserves arc IDs across renumbering", () => { expect(validateArcGraph({ arcs: [{ id: "investigation", milestones: ["m1"] }], references: [{ arcId: "investigation", milestone: "m1" }], chapterRenumbering: { "1": "3" } }).status).toBe("stable"); });
  it("blocks circular dependencies", () => { expect(detectDependencyCycle({ edges: [{ from: "archive", to: "climax" }, { from: "climax", to: "archive" }], terminal: "climax" }).status).toBe("blocked"); });
});
