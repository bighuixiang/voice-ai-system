import { describe, expect, it } from "vitest";
import { admitNarrativeObligation, calibrateReaderExpectation, createHypothesisGraph, createClueClaim, validateClueIndependence, createFairnessBundle } from "./closureGovernance.js";

describe("closure governance", () => {
  it("admits only explicit or reader-significant commitments into canon", () => {
    expect(admitNarrativeObligation({ candidateId: "c-1", source: "author", explicit: true, readerSignals: 0, authorRequestedTracking: false }).status).toBe("canon");
    expect(admitNarrativeObligation({ candidateId: "c-2", source: "text", explicit: false, readerSignals: 0, authorRequestedTracking: false }).status).toBe("candidate");
  });

  it("calibrates reader expectation separately from author labels", () => {
    const result = calibrateReaderExpectation({ authorImportance: "high", firstPerception: "chapter-1", repetitionCount: 1, narrativeEmphasis: 0.2, characterReaction: 0, causalImportance: 0.2, genreConvention: 0.1, obscured: true });
    expect(result.fairnessRisk).toBe(true);
    expect(result.readerExpectation).toBe("weak");
  });

  it("tracks multiple hypotheses instead of storing only the hidden answer", () => {
    const graph = createHypothesisGraph({ graphId: "h-1", question: "what is behind the door", authorTruth: "portal", hypotheses: [{ id: "portal", status: "viable" }, { id: "wreck", status: "viable" }, { id: "monster", status: "rejected" }] });
    expect(graph.hypotheses.filter((item) => item.status === "viable")).toHaveLength(2);
  });

  it("records clue direction and rejects pseudo-independent clues", () => {
    const claim = createClueClaim({ claimId: "clue-1", sourceRef: "manuscript://v1#10-20", supports: ["portal"], opposes: [], visibleContent: "brass key", authorInterpretation: "portal clue", sourceFamily: "same-witness" });
    expect(claim.supports).toContain("portal");
    expect(validateClueIndependence({ claims: [claim, { ...claim, claimId: "clue-2", sourceRef: "manuscript://v1#30-40" }] }).independent).toBe(false);
  });

  it("requires a frozen fairness bundle before a key payoff can be fully proven", () => {
    const bundle = createFairnessBundle({ bundleId: "f-1", setupRefs: ["manuscript://v1#10-20"], reminderRefs: [], counterEvidenceRefs: ["manuscript://v1#30-40"], payoffRef: "manuscript://v1#100-120", graphFingerprint: "g1", salienceEvidence: ["reader-view"], independenceEvidence: ["different-source"], firstReaderJudgment: "fair", authorTruth: "portal", remainingQuestions: [] });
    expect(bundle.status).toBe("fair");
  });
});
