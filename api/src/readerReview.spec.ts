import { describe, expect, it } from "vitest";
import { assessSceneNecessity, evaluateSurpriseFairness, createExperienceTimeline, preserveReaderDivergence, calibrateReaderReviewer, createReaderExperienceDossier } from "./readerReview.js";

describe("reader review boundaries", () => {
  it("identifies unique scene contribution before recommending removal", () => {
    const result = assessSceneNecessity({ sceneId: "s-1", functions: { causality: ["door opens"], character: [], information: ["portal clue"], emotion: [], obligation: [], rhythm: [] }, alternatives: ["merge with s-2"] });
    expect(result.status).toBe("necessary");
  });

  it("distinguishes obvious, fair and ungrounded surprise", () => {
    const result = evaluateSurpriseFairness({ revealId: "r-1", priorEvidence: ["clue-1", "clue-2"], viableAlternativeCount: 2, answerSalience: 0.5, causalConsequence: "memory loss", newRuleIntroduced: false });
    expect(result.status).toBe("fair");
  });

  it("stores experience at multiple time scales", () => {
    const timeline = createExperienceTimeline({ projectId: "demo", windows: [{ scale: "scene", label: "s1", state: "curious" }, { scale: "chapter", label: "c1", state: "tense" }, { scale: "volume", label: "v1", state: "fatigued" }] });
    expect(timeline.windows).toHaveLength(3);
  });

  it("preserves target-reader disagreement instead of averaging it away", () => {
    const divergence = preserveReaderDivergence({ claims: [{ audience: "novice", result: "confused", evidence: ["x"] }, { audience: "expert", result: "intrigued", evidence: ["y"] }] });
    expect(divergence.claims).toHaveLength(2);
  });

  it("marks uncalibrated reviewers as experimental and bounds dossier claims", () => {
    const reviewer = calibrateReaderReviewer({ reviewerId: "model-1", humanSamples: 0, blind: false, agreementRate: 0 });
    expect(reviewer.status).toBe("experimental");
    const dossier = createReaderExperienceDossier({ dossierId: "d-1", reviewedRange: "chapter-1", progress: "chapter-1", targetReaders: ["novice"], evidenceCoverage: ["contract-1"], disagreements: [], failures: [], unknowns: ["real audience"], staleItems: [] });
    expect(dossier.claimBoundary).toContain("reviewed range");
  });
});
