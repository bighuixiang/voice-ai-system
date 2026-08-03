import { describe, expect, it } from "vitest";
import { evaluateObjectiveContribution, resolveObjectiveHierarchy } from "./objectiveHierarchy.js";
import type { CreativeObjectiveItem } from "./creativeObjective.js";

const hard: CreativeObjectiveItem = { objectiveId: "canon", kind: "hard_constraint", text: "Do not contradict canon", scope: "work", sourceRefs: ["s1"], verification: "canon check" };
const pref: CreativeObjectiveItem = { objectiveId: "voice", kind: "preference", text: "Keep a restrained voice", scope: "chapter", sourceRefs: ["s2"], verification: "voice review" };

describe("objective hierarchy", () => {
  it("inherits objectives and records bounded local overrides without weakening hard constraints", () => {
    const resolved = resolveObjectiveHierarchy({ scope: "chapter", ancestors: [hard, pref], local: [], overrides: [{ objectiveId: "voice", replacement: { ...pref, text: "Use a lighter voice" }, reason: "comedy buffer chapter", validWindow: "chapter-3", restorePoint: "chapter-4" }] });
    expect(resolved.inherited.map((item) => item.objectiveId)).toEqual(["canon"]);
    expect(resolved.blockedOverrides).toEqual([]);
    const blocked = resolveObjectiveHierarchy({ scope: "chapter", ancestors: [hard], local: [], overrides: [{ objectiveId: "canon", replacement: { ...hard, kind: "preference" }, reason: "faster draft", validWindow: "chapter-3", restorePoint: "chapter-4" }] });
    expect(blocked.blockedOverrides).toContain("canon:hard-constraint");
  });

  it("requires both near-term delivery and long-term contribution evidence", () => {
    expect(evaluateObjectiveContribution({ workItemId: "scene-1", nearTermOutcome: "reveal clue", nearTermSatisfied: true, nearTermEvidenceRefs: ["scene://1"], longTermTargets: ["arc://mystery"], contributesLongTerm: true, longTermEvidenceRefs: ["arc://mystery"] }).status).toBe("supported");
    expect(evaluateObjectiveContribution({ workItemId: "scene-1", nearTermOutcome: "pretty prose", nearTermSatisfied: true, nearTermEvidenceRefs: ["scene://1"], longTermTargets: ["arc://mystery"], contributesLongTerm: false, longTermEvidenceRefs: [] }).status).toBe("blocked");
  });
});
