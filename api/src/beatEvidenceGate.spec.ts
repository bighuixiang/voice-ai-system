import { describe, expect, it } from "vitest";
import { evaluateBeatEvidence } from "./beatEvidenceGate.js";

describe("beat evidence gate", () => {
  it("keeps an outline-only beat planned", () => expect(evaluateBeatEvidence({ planned: true, evidenceRefs: [] })).toMatchObject({ allowed: false, status: "planned", reason: "PLAN_ONLY" }));
  it("rejects non-prose evidence and accepts an anchored prose segment", () => {
    expect(evaluateBeatEvidence({ planned: true, evidenceRefs: ["outline://scene-1"] })).toMatchObject({ allowed: false, reason: "PROSE_ANCHOR_REQUIRED" });
    expect(evaluateBeatEvidence({ planned: true, evidenceRefs: ["prose://scene-1#segment-2"] })).toMatchObject({ allowed: true, status: "setup" });
  });
});
