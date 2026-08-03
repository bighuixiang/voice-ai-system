import { describe, expect, it } from "vitest";
import { createClosureSchedule, reservePayoffCapacity, planAdaptiveReminder, detectExposureRisk, createClosureSceneContract, propagateClosureOutcome } from "./closureExecution.js";

describe("closure execution planning", () => {
  it("reports unreachable windows and dependency cycles", () => {
    const result = createClosureSchedule({ obligations: [{ id: "obl-1", dependencies: ["obl-2"], window: "chapter-5" }, { id: "obl-2", dependencies: ["obl-1"], window: "chapter-5" }], availableWindows: ["chapter-5"] });
    expect(result.status).toBe("blocked");
    expect(result.risks).toEqual(expect.arrayContaining(["dependency-cycle"]));
  });

  it("fails closed when a closure dependency is not present in the schedule", () => {
    const result = createClosureSchedule({ obligations: [{ id: "obl-1", dependencies: ["missing-obligation"], window: "chapter-5" }], availableWindows: ["chapter-5"] });
    expect(result.status).toBe("blocked");
    expect(result.risks).toContain("missing-dependency:obl-1:missing-obligation");
  });

  it("reserves scene capacity and blocks overbooked windows", () => {
    const result = reservePayoffCapacity({ window: "chapter-5", capacity: 2, reservations: [{ obligationId: "obl-1", load: 1 }, { obligationId: "obl-2", load: 2 }] });
    expect(result.status).toBe("conflict");
    expect(result.overbooked).toBe(1);
  });

  it("suggests contextual reminders with new information instead of repetition", () => {
    const result = planAdaptiveReminder({ obligationId: "obl-1", chaptersSinceLastReminder: 8, readerSalience: 0.2, relatedCharacterPresent: true, competingObligations: 3, previousInformationGain: 0.1, currentContext: "the courier loses memory" });
    expect(result.action).toBe("recontextualize");
    expect(result.newInformation).toBeTruthy();
  });

  it("detects exposure leakage", () => {
    const result = detectExposureRisk({ obligationId: "obl-1", reminders: [{ hypothesis: "portal", chapter: 1 }, { hypothesis: "portal", chapter: 2 }, { hypothesis: "portal", chapter: 3 }], characterAttentionCount: 4, competingHypotheses: 0 });
    expect(result.status).toBe("high-risk");
  });

  it("requires active pursuit, resistance, answer, consequence and aftermath", () => {
    const contract = createClosureSceneContract({ contractId: "scene-1", entryKnowledge: "door hums", trigger: "memory loss", pursuer: "courier", resistance: "tide", evidenceRefs: ["manuscript://v1#1-2"], irreversibleChoice: "open door", answer: "portal", immediateConsequence: "loses memory", emotionalAftermath: "fear", remainingQuestions: ["who built it"], nextPressure: "flee" });
    expect(contract.valid).toBe(true);
    const outcome = propagateClosureOutcome({ payoffId: "pay-1", changes: [{ domain: "character-knowledge", before: "unknown", after: "portal" }, { domain: "resource", before: "memory", after: "lost" }], downstreamRefs: ["scene://c2#s1"] });
    expect(outcome.propagatedDomains).toContain("resource");
  });
});
