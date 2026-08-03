import { describe, expect, it } from "vitest";
import { reaskWithNewPremise } from "./questionReask.js";

describe("question reask", () => {
  const previous = { questionId: "q-1", text: "两人的关系是什么？", premise: "两人是亲兄妹", premiseEvidenceRefs: ["utterance://m-1#relation"], reaskCount: 0 };

  it("shows the changed premise and its evidence before asking again", () => {
    const result = reaskWithNewPremise({ previous, text: "在新关系前提下，两人如何称呼彼此？", newPremise: "两人是师兄妹", premiseEvidenceRefs: ["utterance://m-2#correction"] });
    expect(result).toMatchObject({ previousPremise: "两人是亲兄妹", newPremise: "两人是师兄妹", context: { premise: "两人是师兄妹", evidenceRefs: ["utterance://m-2#correction"] } });
    expect(result.question.reaskCount).toBe(1);
  });

  it("rejects a reask without a new premise or traceable evidence", () => {
    expect(() => reaskWithNewPremise({ previous, text: "继续回答", newPremise: previous.premise, premiseEvidenceRefs: ["utterance://m-2#correction"] })).toThrow("REASK_NEW_PREMISE_REQUIRED");
    expect(() => reaskWithNewPremise({ previous, text: "继续回答", newPremise: "两人是师兄妹", premiseEvidenceRefs: [] })).toThrow("REASK_PREMISE_EVIDENCE_REQUIRED");
  });
});
