import { describe, expect, it } from "vitest";
import { evaluateCognitiveBudget } from "./cognitiveBudget.js";

const valid = { sceneId: "scene-1", budget: { maxNewUnits: 3, maxNamedEntities: 2, maxRules: 1, maxClues: 2 }, units: [{ unitId: "u1", label: "sealed gate", kind: "clue" as const, status: "new" as const, function: "forces choice", evidenceRefs: ["prose://scene-1#u1"] }, { unitId: "u2", label: "warden", kind: "named-entity" as const, status: "confirmed" as const, function: "blocks exit", evidenceRefs: ["prose://scene-1#u2"] }], answerClaims: [], sourceRefs: ["scene://scene-1"] };
describe("information release and cognitive budget", () => {
  it("passes functional, evidenced information units within budget", () => { const report = evaluateCognitiveBudget(valid); expect(report.status).toBe("passed"); expect(report.issues).toEqual([]); });
  it("blocks duplicate unfunctional units, unsupported answers and budget overflow", () => { const report = evaluateCognitiveBudget({ ...valid, budget: { ...valid.budget, maxNewUnits: 1 }, units: [{ ...valid.units[0], function: "" }, { ...valid.units[0], unitId: "u2", label: "sealed gate" }, { ...valid.units[1], unitId: "u3", label: "another rule", kind: "rule", status: "new" }], answerClaims: [{ claim: "the gate opens at dawn", evidenceUnitIds: [] }] }); expect(report.status).toBe("blocked"); expect(report.issues).toEqual(expect.arrayContaining(["COGNITIVE_BUDGET_EXCEEDED", "INFORMATION_DUPLICATE_NO_FUNCTION", "ANSWER_EVIDENCE_REQUIRED"])); });
  it("requires explicit status and evidence", () => { expect(evaluateCognitiveBudget({ ...valid, sourceRefs: [] }).issues).toContain("COGNITIVE_EVIDENCE_REQUIRED"); expect(evaluateCognitiveBudget({ ...valid, units: [{ ...valid.units[0], status: "new", evidenceRefs: [] }] }).status).toBe("blocked"); });
  it("rejects invalid budget context, duplicate unit IDs, and blank evidence", () => {
    const report = evaluateCognitiveBudget({ ...valid, sceneId: "", budget: { maxNewUnits: -1, maxNamedEntities: 2, maxRules: 1, maxClues: 2 }, units: [{ ...valid.units[0], unitId: "", evidenceRefs: [""] }, { ...valid.units[1], unitId: "" }], sourceRefs: [""] });
    expect(report.status).toBe("blocked");
    expect(report.issues).toEqual(expect.arrayContaining(["COGNITIVE_CONTEXT_REQUIRED", "COGNITIVE_BUDGET_INVALID", "INFORMATION_UNIT_DUPLICATE", "INFORMATION_EVIDENCE_REQUIRED", "COGNITIVE_EVIDENCE_REQUIRED"]));
  });
});
