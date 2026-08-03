import { describe, expect, it } from "vitest";
import { createIntentCorrection } from "./intentCorrection.js";
import { applyCorrectionBeforeContinue } from "./correctionBeforeContinue.js";

describe("correction before continue", () => {
  it("supersedes the old interpretation, recomputes constraints, then authorizes safe continuation", () => {
    const correction = createIntentCorrection({ correctionId: "c-200", priorInterpretation: "亲兄妹", correctedInterpretation: "师兄妹", affectedAssets: ["relationship"], recommendation: "重算关系约束", status: "accepted" });
    const result = applyCorrectionBeforeContinue(correction, {
      understanding: [{ id: "u-old", affectedAssets: ["relationship"], status: "active" }], questions: [], plans: [],
      candidates: [{ id: "cand-old", affectedAssets: ["relationship"], status: "ready" }], tasks: [{ id: "t-old", affectedAssets: ["relationship"], status: "running" }], patches: [],
      recomputedConstraintAssets: ["relationship", "unrelated"]
    });
    expect(result.supersedes).toEqual({ priorInterpretation: "亲兄妹", correctedInterpretation: "师兄妹" });
    expect(result.recomputedConstraintAssets).toEqual(["relationship"]);
    expect(result.contextInterpretation).toBe("师兄妹");
    expect(result.continueAuthorized).toBe(true);
    expect(result.transitions).toEqual(expect.arrayContaining([{ artifactId: "cand-old", artifactType: "candidate", from: "ready", to: "stale" }, { artifactId: "t-old", artifactType: "task", from: "running", to: "paused" }]));
  });

  it("does not continue a merely proposed correction", () => {
    const correction = createIntentCorrection({ correctionId: "c-proposed", priorInterpretation: "A", correctedInterpretation: "B", affectedAssets: ["x"], recommendation: "review" });
    expect(() => applyCorrectionBeforeContinue(correction, { understanding: [], questions: [], plans: [], candidates: [], tasks: [], patches: [] })).toThrow("CORRECTION_MUST_BE_ACCEPTED_BEFORE_CONTINUE");
  });
});
