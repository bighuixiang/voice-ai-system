import { describe, expect, it } from "vitest";
import { createSeparatedPattern, evaluateCrossProjectTransfer } from "./surfaceMechanismSeparation.js";

const valid = { patternId: "p1", projectSlug: "demo", surface: { vocabulary: ["短促"], syntax: ["fragment"], rhythm: "quick", imagery: ["rain"] }, mechanism: { causality: "choice follows withheld information", informationAllocation: "reveal after action", sceneFunction: "escalate", characterChoice: "hide truth", payoffMethod: "cost appears" }, abstractionProof: "removed source characters, world and signature imagery", antiImitationPassed: true, sourceRefs: ["source://1"] };
describe("surface and mechanism separation", () => {
  it("stores surface and mechanism independently", () => { const pattern = createSeparatedPattern(valid); expect(pattern.surface.vocabulary).toEqual(["短促"]); expect(pattern.mechanism.causality).toContain("choice"); });
  it("blocks cross-project surface or identifiable combinations", () => { expect(evaluateCrossProjectTransfer({ ...valid, targetProjectSlug: "other", reuseSurface: true }).status).toBe("blocked"); expect(evaluateCrossProjectTransfer({ ...valid, targetProjectSlug: "other", identifiableSourceCombination: true }).status).toBe("blocked"); });
  it("allows only abstracted mechanism after anti-imitation guard", () => { const allowed = evaluateCrossProjectTransfer({ ...valid, targetProjectSlug: "other", reuseSurface: false, identifiableSourceCombination: false }); expect(allowed.status).toBe("allowed"); const blocked = evaluateCrossProjectTransfer({ ...valid, targetProjectSlug: "other", reuseSurface: false, identifiableSourceCombination: false, abstractionProof: "", antiImitationPassed: false }); expect(blocked.status).toBe("blocked"); });
});
