import { describe, expect, it } from "vitest";
import { assertEffortValueMeasurementIntegrity, measureAuthorEffortValue } from "./authorEffortValue.js";

describe("author effort and value measurement", () => {
  it("measures active, waiting, blocking, review, correction and asset value dimensions", () => {
    const result = measureAuthorEffortValue({
      phase: "writing", genre: "mystery", activeCreativeMs: 120000, passiveWaitMs: 30000,
      blockingIssues: 2, repeatedConfirmations: 1, reviewItems: 3, correctionPropagationMs: 8000,
      interruptions: 1, assets: [{ assetId: "scene-1", produced: true, adopted: true, valueEvidence: ["canon-link"] }],
    });
    expect(result).toMatchObject({ phase: "writing", genre: "mystery", activeCreativeMs: 120000, passiveWaitMs: 30000, blockingIssues: 2, reviewLoad: 3, correctionPropagationMs: 8000, assetValueStatus: "evidence-backed", antiMetricGuard: "passed" });
    expect(result.assetsAdopted).toBe(1);
    expect(() => assertEffortValueMeasurementIntegrity(result)).not.toThrow();
  });

  it("does not manufacture precise value when assets have no evidence", () => {
    const result = measureAuthorEffortValue({
      phase: "exploration", genre: "fantasy", activeCreativeMs: 0, passiveWaitMs: 0,
      blockingIssues: 0, repeatedConfirmations: 0, reviewItems: 0, correctionPropagationMs: 0, interruptions: 0,
      assets: [{ assetId: "idea-1", produced: true, adopted: false, valueEvidence: [] }],
    });
    expect(result.assetValueStatus).toBe("insufficient-evidence");
    expect(result.valueScore).toBeUndefined();
  });

  it("blocks value claims when hidden autonomy or quality regressions are present", () => {
    const result = measureAuthorEffortValue({ phase: "audit", genre: "mystery", activeCreativeMs: 1, passiveWaitMs: 0, blockingIssues: 0, repeatedConfirmations: 0, reviewItems: 1, correctionPropagationMs: 0, interruptions: 0, hiddenAutonomyDecisions: 1, qualityRegressions: 1, assets: [{ assetId: "a", produced: true, adopted: true, valueEvidence: ["review"] }] });
    expect(result).toMatchObject({ antiMetricGuard: "blocked", assetValueStatus: "evidence-backed" });
    expect(result.valueScore).toBeUndefined();
    expect(() => assertEffortValueMeasurementIntegrity(result)).not.toThrow();
    expect(() => assertEffortValueMeasurementIntegrity({ ...result, antiMetricGuard: "passed" })).toThrow("EFFORT_VALUE_ANTIMETRIC_BYPASS");
  });
});
