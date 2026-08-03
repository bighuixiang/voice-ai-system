import { describe, expect, it } from "vitest";
import { createSetupEvidence, createObligationKnowledgeBoundary, createPayoffContract, evaluatePayoffEvidence, evaluateSetupFairness } from "./obligationEvidence.js";

describe("obligation evidence contract", () => {
  it("keeps text matches from passing fairness when salience is too low", () => {
    expect(evaluateSetupFairness({ obligationId: "obl-1", salience: { placement: 0.2, sensorySpecificity: 0.2, characterReaction: 0, repetitionCount: 1, obscuredByStrongerEvent: true } })).toMatchObject({ status: "fairness-risk", remediationRequired: true, fairnessRisk: true });
    expect(evaluateSetupFairness({ obligationId: "obl-1", salience: { placement: 0.2, sensorySpecificity: 0.2, characterReaction: 0, repetitionCount: 1, obscuredByStrongerEvent: true }, remediationEvidence: "prose://scene#reinforced" })).toMatchObject({ status: "fair", remediationRequired: false });
  });
  it("requires a recoverable setup anchor and records reader salience", () => {
    const setup = createSetupEvidence({ obligationId: "obl-1", manuscriptVersion: "v1", start: 10, end: 32, visibleText: "The brass door hummed.", narrativeFunction: "setup", salience: { placement: 0.8, sensorySpecificity: 0.9, characterReaction: 0.4, repetitionCount: 1, obscuredByStrongerEvent: false } });
    expect(setup.anchor).toBe("manuscript://v1#10-32");
    expect(setup.fairnessRisk).toBe(false);
  });

  it("keeps author truth, reader knowledge and POV knowledge separate", () => {
    const boundary = createObligationKnowledgeBoundary({ obligationId: "obl-1", authorTruth: "door is portal", readerVisible: "door hums", povKnowledge: { courier: "door hums" }, prohibitedDisclosure: ["portal"] });
    expect(boundary.povKnowledge.courier).toBe("door hums");
    expect(boundary.authorTruth).not.toBe(boundary.readerVisible);
  });

  it("requires a payoff contract and semantic evidence chain before paid", () => {
    const contract = createPayoffContract({ obligationId: "obl-1", requiredAnswer: "door opens", allowedOpenParts: ["who built it"], involvedCharacters: ["courier"], readerChange: "understands the risk", prerequisites: ["setup-1"], latestWindow: "chapter-5" });
    const result = evaluatePayoffEvidence({ contract, setupRefs: ["manuscript://v1#10-32"], reminderRefs: [], payoffRef: "manuscript://v1#100-130", semanticReason: "the door opens and costs the courier a memory", confidence: 0.9, observableChanges: ["door opens", "memory lost"] });
    expect(result.status).toBe("payoff_candidate");
    expect(() => evaluatePayoffEvidence({ contract, setupRefs: [], reminderRefs: [], payoffRef: "manuscript://v1#100-130", semanticReason: "same title", confidence: 0.9, observableChanges: [] })).toThrow("PAYOFF_EVIDENCE_CHAIN_REQUIRED");
  });

  it("keeps unresolved payoff subclaims open", () => {
    const contract = createPayoffContract({ obligationId: "obl-2", requiredAnswer: "pendant truth", requiredSubclaims: ["origin", "chosen", "cost"], allowedOpenParts: [], involvedCharacters: ["hero"], readerChange: "understands the burden", prerequisites: ["setup"], latestWindow: "chapter-60" });
    const partial = evaluatePayoffEvidence({ contract, setupRefs: ["manuscript://v1#1-2"], reminderRefs: [], payoffRef: "manuscript://v1#60-70", semanticReason: "origin answered", confidence: 0.9, observableChanges: ["origin revealed"], answeredSubclaims: ["origin"] });
    expect(partial).toMatchObject({ status: "partially_paid", remainingSubclaims: ["chosen", "cost"] });
    const paid = evaluatePayoffEvidence({ contract, setupRefs: ["manuscript://v1#1-2"], reminderRefs: [], payoffRef: "manuscript://v1#60-70", semanticReason: "all answers", confidence: 0.9, observableChanges: ["cost paid"], answeredSubclaims: ["origin", "chosen", "cost"] });
    expect(paid.status).toBe("paid");
  });
});
