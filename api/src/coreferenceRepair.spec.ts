import { describe, expect, it } from "vitest";
import { applyCoreferenceRepair, createCoreferenceRepair } from "./coreferenceRepair.js";

describe("coreference repair", () => {
  it("escalates repeated pronoun corrections to extraction-layer repair and reuses it", () => {
    const repair = createCoreferenceRepair({ incidentId: "inc-1", pronoun: "她", priorEntityId: "char-a", correctedEntityId: "char-b", correctionCount: 2, regressionCaseId: "reg-coref-1" });
    expect(repair).toMatchObject({ layer: "extraction", repairStrategy: "coreference-authority-override" });
    expect(applyCoreferenceRepair(repair, { pronoun: "她", candidateEntityIds: ["char-a", "char-b"] })).toEqual({ entityId: "char-b", strategy: "coreference-authority-override" });
  });

  it("does not create an extraction incident after only one correction", () => {
    expect(() => createCoreferenceRepair({ incidentId: "inc-1", pronoun: "她", priorEntityId: "a", correctedEntityId: "b", correctionCount: 1, regressionCaseId: "reg-1" })).toThrow("COREFERENCE_REPAIR_ESCALATION_REQUIRED");
  });
});
