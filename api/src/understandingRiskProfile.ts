import crypto from "node:crypto";

export interface UnderstandingRiskProfile {
  schemaVersion: "task-risk-profile.v1";
  taskType: "creative-understanding";
  impact: "high";
  reversibility: "reversible-candidate";
  writesCanon: false;
  requiresAuthorDecision: true;
  t0Required: true;
  riskFactors: string[];
  fingerprint: string;
}

export function assertUnderstandingRiskProfileIntegrity(profile: UnderstandingRiskProfile): UnderstandingRiskProfile {
  const { fingerprint, ...base } = profile;
  if (profile.schemaVersion !== "task-risk-profile.v1" || profile.taskType !== "creative-understanding" || profile.impact !== "high" || profile.reversibility !== "reversible-candidate" || profile.writesCanon || !profile.requiresAuthorDecision || !profile.t0Required || !profile.riskFactors.length || profile.riskFactors.some((factor) => !factor.trim()) || crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") !== fingerprint) throw new Error("TASK_RISK_PROFILE_INTEGRITY_FAILED");
  return profile;
}

export function buildUnderstandingRiskProfile(): UnderstandingRiskProfile {
  const base = {
    schemaVersion: "task-risk-profile.v1" as const,
    taskType: "creative-understanding" as const,
    impact: "high" as const,
    reversibility: "reversible-candidate" as const,
    writesCanon: false as const,
    requiresAuthorDecision: true as const,
    t0Required: true as const,
    riskFactors: ["misunderstanding-can-redirect-story", "author-correction-must-supersede-stale-work", "no-canon-write-before-confirmation"]
  };
  return {
    ...base,
    fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex")
  };
}
