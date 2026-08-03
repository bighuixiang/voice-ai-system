import { describe, expect, it } from "vitest";
import { assertCraftHoldoutIntegrity, validateCraftHoldout } from "./craftHoldoutValidation.js";

const base = {
  experimentId: "exp-1",
  extractionSceneIds: ["scene-extract"],
  sourceRefs: ["experiment://exp-1"],
  cases: [
    { caseId: "h1", sceneId: "scene-investigate", chapterFunction: "investigation", inputFingerprint: "in-1", labelSealed: true, generatorVisible: false, baselineScore: 0.5, treatmentScore: 0.8, hardGuardsPassed: true },
    { caseId: "h2", sceneId: "scene-aftermath", chapterFunction: "aftermath", inputFingerprint: "in-2", labelSealed: true, generatorVisible: false, baselineScore: 0.5, treatmentScore: 0.7, hardGuardsPassed: true }
  ]
};

describe("craft holdout validation", () => {
  it("requires unseen sealed cases across distinct scene functions", () => {
    const result = validateCraftHoldout(base);
    expect(result.status).toBe("cross-scene-validated");
    expect(result.holdoutCaseIds).toEqual(["h1", "h2"]);
    expect(result.sceneFunctions).toEqual(["aftermath", "investigation"]);
  });

  it("downgrades a single-function holdout to local candidate", () => {
    const result = validateCraftHoldout({ ...base, cases: [base.cases[0]] });
    expect(result.status).toBe("local-candidate");
    expect(result.issues).toContain("CROSS_SCENE_FUNCTION_COVERAGE_REQUIRED");
  });

  it("blocks leakage or reuse of extraction scenes", () => {
    const result = validateCraftHoldout({ ...base, cases: [{ ...base.cases[0], sceneId: "scene-extract", generatorVisible: true }] });
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(expect.arrayContaining(["HOLDOUT_EXTRACTION_OVERLAP", "HOLDOUT_LABEL_LEAK"]));
  });
  it("rejects malformed holdout cases and detects tampering", () => { expect(() => validateCraftHoldout({ ...base, cases: [{ ...base.cases[0], baselineScore: Number.NaN }] })).toThrow("CRAFT_HOLDOUT_CASE_INVALID"); const result = validateCraftHoldout(base); expect(() => assertCraftHoldoutIntegrity({ ...result, experimentId: "tampered" })).toThrow("CRAFT_HOLDOUT_INTEGRITY_FAILED"); });
});
