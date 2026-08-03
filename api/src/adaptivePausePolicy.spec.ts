import { describe, expect, it } from "vitest";
import { assertAdaptivePauseDecision, evaluateAdaptivePause } from "./adaptivePausePolicy.js";

describe("adaptive pause policy", () => {
  it("hard-pauses when an unresolved hard trigger exists", () => {
    const result = evaluateAdaptivePause({
      pausePolicyVersion: "adaptive-risk-pause.v1",
      autonomyGrantValid: true,
      unresolvedHardTriggers: ["canon-gate"],
      keyReviewDisagreement: false,
      scopeExpansionRequested: false,
      retryBudgetExhausted: false,
      authorRequestedPause: false,
      settledChapterCount: 3,
      volumeBoundary: false,
      majorClosure: false,
      materialRiskChange: false
    });
    expect(result).toMatchObject({ status: "hard_pause", nextAction: "pause_and_discuss", hardReasons: ["canon-gate"] });
  });

  it("emits a soft milestone recap without turning silence into consent", () => {
    const result = evaluateAdaptivePause({
      pausePolicyVersion: "adaptive-risk-pause.v1",
      autonomyGrantValid: true,
      unresolvedHardTriggers: [],
      keyReviewDisagreement: false,
      scopeExpansionRequested: false,
      retryBudgetExhausted: false,
      authorRequestedPause: false,
      settledChapterCount: 10,
      volumeBoundary: false,
      majorClosure: false,
      materialRiskChange: false
    });
    expect(result).toMatchObject({ status: "soft_recap", nextAction: "emit_milestone_recap", continuationRequiresExistingGrant: true });
  });

  it("blocks continuation when the scoped grant is no longer valid", () => {
    const result = evaluateAdaptivePause({
      pausePolicyVersion: "adaptive-risk-pause.v1",
      autonomyGrantValid: false,
      unresolvedHardTriggers: [],
      keyReviewDisagreement: false,
      scopeExpansionRequested: false,
      retryBudgetExhausted: false,
      authorRequestedPause: false,
      settledChapterCount: 1,
      volumeBoundary: false,
      majorClosure: false,
      materialRiskChange: false
    });
    expect(result.status).toBe("hard_pause");
    expect(result.hardReasons).toContain("autonomy-grant-invalid");
  });

  it("rejects tampered or semantically inconsistent decisions before runtime application", () => {
    const result = evaluateAdaptivePause({
      pausePolicyVersion: "adaptive-risk-pause.v1",
      autonomyGrantValid: false,
      unresolvedHardTriggers: ["canon-gate"],
      keyReviewDisagreement: false,
      scopeExpansionRequested: false,
      retryBudgetExhausted: false,
      authorRequestedPause: false,
      settledChapterCount: 3,
      volumeBoundary: false,
      majorClosure: false,
      materialRiskChange: false
    });
    expect(() => assertAdaptivePauseDecision({ ...result, nextAction: "continue_within_grant" })).toThrow("ADAPTIVE_PAUSE_DECISION_INTEGRITY_FAILED");
    expect(() => assertAdaptivePauseDecision({ ...result, fingerprint: "not-a-sha256" })).toThrow("ADAPTIVE_PAUSE_DECISION_INTEGRITY_FAILED");
  });
});
