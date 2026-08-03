import { describe, expect, it } from "vitest";
import { detectStagnation } from "./stagnationDetection.js";

describe("stagnation detection", () => {
  it("pauses after repeated work fingerprints", () => {
    const result = detectStagnation({ workFingerprints: ["a", "a", "a"], rewriteCount: 0, questionFingerprints: [], qualityScores: [], newAssetCount: 3, completionSignals: 0, openObligations: 0 });
    expect(result).toMatchObject({ status: "paused", threshold: "repeated-work-fingerprint" });
    expect(result.rootCauseHypotheses.length).toBeGreaterThan(0);
  });

  it("detects rewrite loops and oscillating quality", () => {
    const result = detectStagnation({ workFingerprints: ["a", "b"], rewriteCount: 4, questionFingerprints: [], qualityScores: [0.8, 0.6, 0.8, 0.6], newAssetCount: 2, completionSignals: 0, openObligations: 0 });
    expect(result.status).toBe("paused");
    expect(result.thresholds).toEqual(expect.arrayContaining(["rewrite-loop", "quality-oscillation"]));
  });

  it("detects calls without new assets and inconsistent completion", () => {
    const result = detectStagnation({ workFingerprints: ["a", "b"], rewriteCount: 0, questionFingerprints: ["q", "q", "q"], qualityScores: [0.7], newAssetCount: 0, completionSignals: 2, openObligations: 3 });
    expect(result.status).toBe("paused");
    expect(result.thresholds).toEqual(expect.arrayContaining(["no-new-assets", "completion-obligation-mismatch", "repeated-question"]));
  });

  it("keeps healthy progress running and offers bounded break options", () => {
    const result = detectStagnation({ workFingerprints: ["a", "b"], rewriteCount: 1, questionFingerprints: ["q1", "q2"], qualityScores: [0.6, 0.7], newAssetCount: 2, completionSignals: 0, openObligations: 1 });
    expect(result).toMatchObject({ status: "running", thresholds: [] });
    expect(result.breakOptions).toEqual(expect.arrayContaining(["change-input", "ask-author", "narrow-scope"]));
  });
});
