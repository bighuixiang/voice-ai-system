import { describe, expect, it } from "vitest";
import { compareStructureCandidates, evaluateOutlineCandidateAdoption, preserveSemanticReferences, planImpactSubgraph, settleEmergenceCandidate, validateStaticOutline } from "./outlineGovernanceGates.js";
describe("outline governance gates", () => {
  it("keeps pending candidates out of canon", () => { expect(evaluateOutlineCandidateAdoption({ candidates: [{ id: "spy", status: "pending" }, { id: "framed", status: "pending" }], affectedClosureComplete: false })).toMatchObject({ status: "unchanged", canonCandidateIds: [] }); });
  it("detects duplicate structure despite changed wording", () => { const base = { agency: "high", pacing: "tight", fairness: "fair", payoffDifficulty: "medium", length: "short", impactSubgraph: "arc-a" }; expect(compareStructureCandidates([{ id: "a", ...base }, { id: "b", ...base }]).status).toBe("duplicate"); });
  it("blocks unfair payoff and ending rules", () => { expect(validateStaticOutline({ foreshadowChapter: 8, payoffChapter: 4, newRulesInEnding: true, modelSelfScore: 96 }).status).toBe("blocked"); });
  it("keeps semantic node references after insert", () => { expect(preserveSemanticReferences({ oldNodeId: "node-10", insertedChapterNumber: 10, oldChapterNumber: 10, references: [{ kind: "arc", nodeId: "node-10" }] })).toMatchObject({ displayChapterNumber: 11, semanticNodeId: "node-10", referencesStable: true }); });
  it("requires L2 for character fate changes", () => { expect(planImpactSubgraph({ direct: ["arc"], transitive: ["chapter-12"], unknown: [], protected: ["published"], unaffected: ["world-rule"], l2DecisionRequired: true }).status).toBe("needs_l2"); });
  it("keeps rejected emergence non-canon", () => { expect(settleEmergenceCandidate({ accepted: false, changesCoreConflict: true, changesCharacterFate: false, authorization: false, validation: false })).toEqual({ status: "non_canon", futureFactVisible: false }); });
});
