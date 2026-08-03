import { describe, expect, it } from "vitest";
import { evaluateNearFarCandidate } from "./longTermCandidateGate.js";

describe("near/far candidate gate", () => {
  it("isolates a beautiful but POV-leaking scene while preserving only local dialogue rhythm", () => {
    expect(evaluateNearFarCandidate({ candidateId: "c-1", nearTermQuality: 0.95, longTermEvidenceRefs: [], povKnowledgePassed: false })).toMatchObject({ status: "isolated", preserveScope: "near-term-dialogue-rhythm-only" });
  });
});
