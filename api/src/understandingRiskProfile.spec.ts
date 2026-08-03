import { describe, expect, it } from "vitest";
import { assertUnderstandingRiskProfileIntegrity, buildUnderstandingRiskProfile } from "./understandingRiskProfile.js";

describe("task risk profile", () => {
  it("declares impact, reversibility, T0 and canon boundaries", () => {
    const profile = buildUnderstandingRiskProfile();
    expect(profile).toMatchObject({ taskType: "creative-understanding", impact: "high", reversibility: "reversible-candidate", writesCanon: false, requiresAuthorDecision: true, t0Required: true });
    expect(profile.riskFactors.length).toBeGreaterThan(0);
  });

  it("fails closed when the risk contract is tampered or incomplete", () => {
    const profile = buildUnderstandingRiskProfile();
    expect(() => assertUnderstandingRiskProfileIntegrity({ ...profile, writesCanon: true })).toThrow("TASK_RISK_PROFILE_INTEGRITY_FAILED");
    expect(() => assertUnderstandingRiskProfileIntegrity({ ...profile, riskFactors: [] })).toThrow("TASK_RISK_PROFILE_INTEGRITY_FAILED");
  });
});
