import { describe, expect, it } from "vitest";
import { createSetupEvidence, createObligationKnowledgeBoundary, createPayoffContract, evaluatePayoffEvidence } from "./obligationEvidence.js";

describe("obligation evidence contract", () => {
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
});
