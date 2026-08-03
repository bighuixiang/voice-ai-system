import { describe, expect, it } from "vitest";
import { classifyPlanHorizon, detectPacingFatigue, evaluateChapterCapacity, evaluatePlannedObligations } from "./planningLoadGates.js";
describe("planning load gates", () => {
  it("keeps planned obligations out of fact ledger", () => { expect(evaluatePlannedObligations({ plannedSeeds: 3, factLedgerEntries: 0, reveals: 2, relationshipReversals: 1, cognitiveCapacity: 10 })).toMatchObject({ status: "planned", seededFacts: 0 }); });
  it("detects repeated high-pressure fatigue", () => { const chapter = { pressure: 0.9, information: 0.9, hook: 0.9, relationship: 0.1, emotion: 0.1 }; expect(detectPacingFatigue({ chapters: [chapter, chapter, chapter, chapter] }).status).toBe("fatigue"); });
  it("offers capacity alternatives before silent overload", () => { expect(evaluateChapterCapacity({ currentUnits: 8, requestedUnits: 5, capacity: 10, acceptedRisk: false })).toMatchObject({ status: "overloaded", options: ["split", "defer", "replace"] }); });
  it("keeps remote horizon confidence honest", () => { expect(classifyPlanHorizon({ endingCommitted: true, nearRolling: true, farTentative: true, allyExploratory: true })).toMatchObject({ remoteDetailsConfirmed: false }); });
});
