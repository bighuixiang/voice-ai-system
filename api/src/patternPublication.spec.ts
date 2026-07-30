import { describe, expect, it } from "vitest";
import { evaluatePatternPublication } from "./patternPublication.js";

const valid = { patternId: "p1", sourceEligibility: "default_allowed" as const, abstractMechanism: true, containsPrivateExpression: false, canReconstructOriginal: false, sourceRegistered: true, sourceRefs: ["source://1"] };
describe("craft pattern publication eligibility", () => {
  it("allows only abstract, registered, public-safe patterns", () => { const result = evaluatePatternPublication(valid); expect(result.status).toBe("allowed"); });
  it("isolates unknown/analysis-only sources and blocks reconstructable/private patterns", () => { expect(evaluatePatternPublication({ ...valid, sourceEligibility: "analysis_only" }).status).toBe("analysis_only"); expect(evaluatePatternPublication({ ...valid, canReconstructOriginal: true }).status).toBe("blocked"); expect(evaluatePatternPublication({ ...valid, containsPrivateExpression: true }).status).toBe("blocked"); });
  it("requires registration and evidence", () => { const result = evaluatePatternPublication({ ...valid, sourceRegistered: false, sourceRefs: [] }); expect(result.status).toBe("blocked"); expect(result.issues).toEqual(expect.arrayContaining(["SOURCE_REGISTRATION_REQUIRED", "PUBLICATION_EVIDENCE_REQUIRED"])); });
});
