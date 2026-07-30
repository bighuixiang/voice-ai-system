import { describe, expect, it } from "vitest";
import { classifyDialogueAnswer, applyDialogueAnswerSegments, createPreferenceProbe, compressDialogueMemory, createMisunderstandingIncident } from "./dialogueLifecycle.js";

describe("dialogue lifecycle safeguards", () => {
  it("keeps uncertain answers tentative and suggests a reversible next step", () => {
    const answer = classifyDialogueAnswer({ text: "可能吧，先这样", questionId: "q-1" });
    expect(answer.status).toBe("tentative");
    expect(answer.nextStep).toBe("reversible-default-or-probe");
  });

  it("closes only questions explicitly answered by independent segments", () => {
    const result = applyDialogueAnswerSegments({ openQuestions: [{ questionId: "q-1", semanticKey: "ending" }, { questionId: "q-2", semanticKey: "pov" }], segments: [{ text: "The ending stays open", answers: ["ending"] }] });
    expect(result.closedQuestionIds).toEqual(["q-1"]);
    expect(result.remainingQuestionIds).toEqual(["q-2"]);
  });

  it("keeps preference probes exploratory and pairwise", () => {
    const probe = createPreferenceProbe({ probeId: "probe-1", frozenFacts: ["courier"], dimension: "pov", variants: [{ variantId: "a", text: "Close" }, { variantId: "b", text: "Distant" }] });
    expect(probe.kind).toBe("preference_probe");
    expect(probe.canonWritten).toBe(false);
  });

  it("compresses memory with sources and unresolved items, and records misunderstanding repair", () => {
    const memory = compressDialogueMemory({ sourceUtteranceIds: ["u-1"], effectiveIntents: ["preserve door"], decisions: ["pov=close"], provisionalAssumptions: ["portal"], unresolvedQuestions: ["ending"], preferenceEvidence: ["probe-1"], opposingEvidence: ["u-2 says wreck"], compressionVersion: "v1" });
    expect(memory.unresolvedQuestions).toContain("ending");
    expect(memory.opposingEvidence).toContain("u-2 says wreck");
    const incident = createMisunderstandingIncident({ incidentId: "m-1", layer: "inference", trigger: "author correction", oldInterpretation: "portal", correctedInterpretation: "wreck", repairEvidence: ["u-2"], regressionCaseId: "reg-1" });
    expect(incident.status).toBe("open");
  });
});
