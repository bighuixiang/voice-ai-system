import { describe, expect, it } from "vitest";
import { createConditionLedger, recordConditionRecovery, evaluateCondition } from "./conditionLedger.js";

const valid = { conditionId: "injury-1", subjectId: "hero", kind: "injury" as const, onset: "day-010", symptoms: ["left shoulder pain"], restrictions: ["cannot draw bow"], treatmentConditions: ["rest and splint"], recoveryWindow: "day-010..day-020", relapseRisk: "reopens under strain", sourceRefs: ["scene://10#injury"] };

describe("condition ledger", () => {
  it("keeps persistent injury constraints and recovery window", () => {
    const condition = createConditionLedger(valid);
    expect(condition.status).toBe("active");
    expect(evaluateCondition(condition, "draw bow")).toBe("blocked");
  });

  it("requires actual recovery evidence and does not clear on chapter change", () => {
    const condition = createConditionLedger(valid);
    expect(() => recordConditionRecovery(condition, { at: "chapter-2", evidenceRefs: [], treatment: "slept" })).toThrow("CONDITION_RECOVERY_EVIDENCE_REQUIRED");
    const recovered = recordConditionRecovery(condition, { at: "day-020", evidenceRefs: ["scene://20#healed"], treatment: "splint removed; full draw tested" });
    expect(recovered.status).toBe("recovered");
    expect(evaluateCondition(recovered, "draw bow")).toBe("allowed");
  });

  it("reports pseudo-cost when an active condition has no restriction", () => {
    const condition = createConditionLedger({ ...valid, restrictions: [] });
    expect(evaluateCondition(condition, "run")).toBe("pseudo-cost");
  });
});
