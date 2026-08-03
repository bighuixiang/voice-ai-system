import { describe, expect, it } from "vitest";
import { buildProseRegressionProof } from "./proseRegressionProof.js";

const valid = { candidateId: "c1", baselineFingerprint: "base", candidateFingerprint: "cand", targetScoreBefore: 0.4, targetScoreAfter: 0.8, qualityScoresBefore: [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7], qualityScoresAfter: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8], guards: { hard: true, canon: true, voice: true, pov: true, obligations: true, rhythm: true, authorLocks: true, seams: true, authorGoal: true }, targetEvidenceRefs: ["finding://target-1"], sourceRefs: ["validation://candidate"] };
describe("prose improvement and regression proof", () => {
  it("passes improvement with all regression guards intact", () => { const proof = buildProseRegressionProof(valid); expect(proof.status).toBe("passed"); expect(proof.improved).toBe(true); });
  it("blocks guard regression even when every score rises", () => { const proof = buildProseRegressionProof({ ...valid, guards: { ...valid.guards, voice: false } }); expect(proof.status).toBe("blocked"); expect(proof.issues).toContain("VOICE_REGRESSION"); });
  it("requires target improvement, seven scores and evidence", () => { expect(buildProseRegressionProof({ ...valid, targetScoreAfter: 0.3 }).issues).toContain("TARGET_NOT_IMPROVED"); expect(buildProseRegressionProof({ ...valid, qualityScoresAfter: [1, 1] }).issues).toContain("QUALITY_DIMENSIONS_REQUIRED"); expect(buildProseRegressionProof({ ...valid, sourceRefs: [] }).status).toBe("blocked"); });
  it("rejects invalid score ranges or missing target evidence and blocks rhythm/author-goal regression", () => {
    expect(buildProseRegressionProof({ ...valid, targetScoreAfter: 2 }).issues).toContain("SCORE_INVALID");
    expect(buildProseRegressionProof({ ...valid, targetEvidenceRefs: [" "] }).issues).toContain("TARGET_EVIDENCE_REQUIRED");
    expect(buildProseRegressionProof({ ...valid, guards: { ...valid.guards, rhythm: false } }).issues).toContain("RHYTHM_REGRESSION");
    expect(buildProseRegressionProof({ ...valid, guards: { ...valid.guards, authorGoal: false } }).issues).toContain("AUTHOR_GOAL_REGRESSION");
  });
});
