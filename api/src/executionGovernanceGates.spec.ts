import { describe, expect, it } from "vitest";
import { evaluateAutonomousCanonWrite, evaluateBeatEvidence, evaluateExecutionReadiness, evaluateSceneLedger, freezeProseTaskInput, relocateSemanticPatch } from "./executionGovernanceGates.js";
describe("execution governance gates", () => {
  it("invalidates proof after input change", () => { expect(evaluateExecutionReadiness({ frozenChapters: 5, requiredChapters: 5, conflicts: 0, nextContextComplete: true, structureVersion: "v1", adoptionAuthority: "author", changedSinceProof: true })).toMatchObject({ status: "stale", workersInvalidated: true }); });
  it("stales prose candidate after POV change", () => { expect(freezeProseTaskInput({ storyVersion: "s", outlineVersion: "o", sceneVersion: "c", characterVersion: "ch", obligationVersion: "ob", authorLockVersion: "l", craftVersion: "cr", directionVersion: "d", proseBaseline: "p", contextVersion: "x", currentPov: "a", requestedPov: "b" }).candidateStatus).toBe("stale"); });
  it("protects accepted canon from autonomous writes", () => { expect(evaluateAutonomousCanonWrite({ targetStatus: "settled", authorization: true, frozenBaseline: true, validationPassed: true })).toMatchObject({ status: "revision_branch", canonWrites: false }); });
  it("blocks ambiguous semantic patch target", () => { expect(relocateSemanticPatch({ semanticId: "scene-2-p2", textFingerprint: "h", candidatePositions: 2 }).status).toBe("blocked"); });
  it("misses strategy and cost when prose only exchanges information", () => { expect(evaluateSceneLedger({ requiredStrategies: ["probe", "counter", "choice", "cost"], evidencedStrategies: ["information"], choices: [], costs: [] }).status).toBe("missed"); });
  it("does not seed beat from summary alone", () => { expect(evaluateBeatEvidence({ beatId: "FS-017", summaryClaims: ["FS-017"], proseEvidence: [], semanticEvidence: [] })).toEqual({ status: "missed", canSeed: false }); });
});
