import { describe, expect, it } from "vitest";
import { evaluateWritingStopCondition } from "./writingStopCondition.js";

const valid = { evaluationId: "stop-1", workItemId: "chapter-1", obligations: [{ id: "FS-1", status: "fulfilled" as const }, { id: "hook-1", status: "fulfilled" as const }], qualityGates: [{ gateId: "continuity", status: "passed" as const }, { gateId: "pov", status: "passed" as const }], unresolvedRisks: [], budget: { used: 8000, max: 12000 }, authorInstruction: "", evidenceRefs: ["review://chapter-1"] };

describe("writing stop condition", () => {
  it("stops only when obligations and quality gates are satisfied", () => {
    const result = evaluateWritingStopCondition(valid);
    expect(result.decision).toBe("stop");
  });

  it("continues when work remains and blocks on high risks or budget exhaustion", () => {
    expect(evaluateWritingStopCondition({ ...valid, obligations: [{ id: "FS-1", status: "open" }] }).decision).toBe("continue");
    expect(evaluateWritingStopCondition({ ...valid, unresolvedRisks: [{ id: "risk-1", severity: "high" }] }).decision).toBe("blocked");
    expect(evaluateWritingStopCondition({ ...valid, budget: { used: 12000, max: 12000 } }).decision).toBe("blocked");
  });

  it("honors an explicit author stop instruction with evidence", () => {
    const result = evaluateWritingStopCondition({ ...valid, authorInstruction: "stop after current scene" });
    expect(result.decision).toBe("stop");
    expect(result.reasons).toContain("AUTHOR_STOP_INSTRUCTION");
  });
});
