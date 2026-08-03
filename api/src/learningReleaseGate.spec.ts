import { describe, expect, it } from "vitest";
import { evaluateLearningRelease } from "./learningReleaseGate.js";

describe("learning release gate", () => {
  it("rejects degraded shadow strategy and rolls back an active canary", () => {
    expect(evaluateLearningRelease({ shadowAcceptanceDelta: 0.02, hardVoiceFailuresDelta: 1, reworkDelta: 2, canaryActive: false, previousStableVersion: "stable-v1" })).toMatchObject({ status: "rejected", effectiveVersion: null });
    expect(evaluateLearningRelease({ shadowAcceptanceDelta: 0.02, hardVoiceFailuresDelta: 1, reworkDelta: 2, canaryActive: true, previousStableVersion: "stable-v1" })).toMatchObject({ status: "rolled_back", effectiveVersion: "stable-v1" });
  });
});
