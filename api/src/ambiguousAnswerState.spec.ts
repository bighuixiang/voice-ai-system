import { describe, expect, it } from "vitest";
import { createAmbiguousAnswerState } from "./ambiguousAnswerState.js";

describe("ambiguous answer state", () => {
  it("keeps a relationship ending tentative and permits only non-canon exploration", () => {
    const state = createAmbiguousAnswerState({ questionId: "relationship-ending", answer: "可能让他们最后在一起吧", alternatives: ["together", "apart"], affectedDecision: "relationship-canon" });
    expect(state).toMatchObject({ status: "tentative", canonWriteAllowed: false, l2Open: true, allowedDraftKinds: ["non-conflicting-middle", "exploratory-ending"] });
  });
  it("requires multiple interpretations", () => {
    expect(() => createAmbiguousAnswerState({ questionId: "q", answer: "maybe", alternatives: ["one"], affectedDecision: "ending" })).toThrow("AMBIGUOUS_ANSWER_FIELDS_REQUIRED");
  });
});
