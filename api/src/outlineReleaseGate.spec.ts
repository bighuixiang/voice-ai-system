import { describe, expect, it } from "vitest";
import { evaluateOutlineReleaseGate } from "./outlineReleaseGate.js";

describe("outline release gate", () => {
  it("blocks execution when RP3 is not accepted even if outline artifacts look ready", () => {
    const decision = evaluateOutlineReleaseGate({
      rp3Status: "do-not-activate",
      outlineValidationStatus: "passed",
      outlineVersionStatus: "active",
      executionProofStatus: "ready",
      selectedChapterCount: 3,
      strongFreezeCount: 3
    });
    expect(decision).toMatchObject({ status: "blocked", fullBookExecutable: false });
    expect(decision.blockedReasons).toContain("OUTLINE_GATE_RP3_DEPENDENCY");
  });

  it("requires the bounded rolling horizon before allowing a chapter run", () => {
    const decision = evaluateOutlineReleaseGate({
      rp3Status: "accepted",
      outlineValidationStatus: "passed",
      outlineVersionStatus: "active",
      executionProofStatus: "ready",
      selectedChapterCount: 8,
      strongFreezeCount: 3
    });
    expect(decision.status).toBe("blocked");
    expect(decision.blockedReasons).toContain("OUTLINE_GATE_NEAR_HORIZON");
  });
});
