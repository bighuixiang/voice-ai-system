import { describe, expect, it } from "vitest";
import { createDecisionCostPreview, createReviewCompression } from "./contractDecisionPresentation.js";

describe("contract decision presentation", () => {
  it("shows narrative cost and reversibility without requiring technical details", () => {
    const preview = createDecisionCostPreview({ optionId: "opt-a", storyEffect: "keeps the protagonist voice restrained", affectedChapters: ["ch-1", "ch-2"], expectedRework: "rewrite two scene openings", reversibility: "bounded", setupPayoffCost: "add one setup beat", waitingCost: "delays chapter plan", technicalDetails: ["model=gpt"] });
    expect(preview).toMatchObject({ optionId: "opt-a", reversibility: "bounded", affectedChapters: ["ch-1", "ch-2"] });
  });

  it("compresses review to recommendation, red risk, changes and evidence count", () => {
    const review = createReviewCompression({ objective: "preserve voice", recommendation: "adopt candidate A", mustKeep: ["first-person distance"], strongestRedRisk: "flattens tension", actualChanges: ["trim exposition"], decisionRequired: ["accept opening"], passedSummary: { count: 12, evidenceRefs: ["review://1"] } });
    expect(review.passedSummary).toEqual({ count: 12, evidenceRefs: ["review://1"] });
  });
});
