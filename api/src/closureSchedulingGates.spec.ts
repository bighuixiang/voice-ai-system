import { describe, expect, it } from "vitest";
import { adaptReminder, detectAnswerLeak, evaluateClosureScene, evaluateNarrativeInterest, evaluatePayoffForm, propagateClosure, resolveWindowConflict, scheduleClosure, settleSharedObject } from "./closureSchedulingGates.js";
describe("closure scheduling gates", () => {
  it("detects ending congestion", () => { expect(scheduleClosure({ chaptersToEnding: 10, obligations: Array.from({ length: 12 }, (_, i) => ({ id: String(i), dependentCharacter: i < 5 ? "same" : `c${i}`, payoffChapter: 10 })), climaxCapacity: 3 }).status).toBe("congested"); });
  it("offers alternatives when reserved window is overloaded", () => { expect(resolveWindowConflict({ reservedWindow: "ch18", newPlotLoad: 12, capacity: 8, alternatives: ["in_battle", "move", "delay"] }).status).toBe("conflict"); });
  it("reactivates forgotten clue with new consequence", () => { expect(adaptReminder({ chaptersSince: 2, chapterWords: 20000, clueSalience: 0.3, readerRecall: 0.2 })).toMatchObject({ status: "reactivate", method: "new_consequence" }); });
  it("detects answer leakage saturation", () => { expect(detectAnswerLeak({ repeatedEmphasis: 4, competingHypotheses: 0, saturationThreshold: 3 }).status).toBe("leak_risk"); });
  it("settles only answered subclaim of shared object", () => { expect(settleSharedObject({ subclaims: [{ id: "origin", answered: true }, { id: "school", answered: false }, { id: "rule", answered: false }] })).toEqual({ settled: ["origin"], open: ["school", "rule"] }); });
  it("prefers consequence-bearing payoff forms", () => { expect(evaluatePayoffForm({ form: "monologue", irreversibleConsequence: false, distinctFromPrior: false }).status).toBe("weak"); });
  it("requires consequence for closure scene", () => { expect(evaluateClosureScene({ answerProvided: true, activeChoice: false, consequence: false, relationshipChanged: false, goalChanged: false, resourceChanged: false }).status).toBe("information_only"); });
  it("keeps obligation pending when propagation write fails", () => { expect(propagateClosure({ obligationId: "o1", writes: [{ domain: "character", succeeded: false }, { domain: "ledger", succeeded: true }] })).toMatchObject({ status: "pending", rollback: true }); });
  it("charges narrative interest for endless postponement", () => { expect(evaluateNarrativeInterest({ strongPromises: 20, settledPromises: 1, postponements: 5, newValueAdded: 0 }).status).toBe("interest_due"); });
});
