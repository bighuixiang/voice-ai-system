import { describe, expect, it } from "vitest";
import { createPayoffContract } from "./obligationEvidence.js";
import { evaluateMultiObligationPayoff } from "./multiObligationPayoff.js";

describe("multi-obligation payoff", () => {
  it("creates independent assessments while sharing one payoff anchor", () => {
    const contracts = ["pendant", "mentor"].map((obligationId) => createPayoffContract({ obligationId, requiredAnswer: obligationId, allowedOpenParts: [], involvedCharacters: ["hero"], readerChange: "understands", prerequisites: ["setup"], latestWindow: "chapter-90" }));
    const result = evaluateMultiObligationPayoff({ payoffRef: "manuscript://v1#900-940", contracts, setupRefsByObligation: { pendant: ["manuscript://v1#10-20"], mentor: ["manuscript://v1#30-40"] }, semanticReasonsByObligation: { pendant: "origin explained", mentor: "betrayal explained" }, observableChangesByObligation: { pendant: ["origin"], mentor: ["betrayal" ] }, confidenceByObligation: { pendant: 0.9, mentor: 0.8 } });
    expect(result.assessments).toHaveLength(2);
    expect(result.assessments.map((item) => item.obligationId)).toEqual(["pendant", "mentor"]);
    expect(result.assessments.every((item) => item.payoffRef === result.payoffRef)).toBe(true);
  });
});
