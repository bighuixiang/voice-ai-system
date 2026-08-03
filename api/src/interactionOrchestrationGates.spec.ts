import { describe, expect, it } from "vitest";
import { arbitratePrimaryAction, assessJourneyEvidence, deduplicateAction, gateShellShadow, isolateProjectContinuation, isolateTaskChapter, parseAuthorReceipt, preserveStageOnViewSwitch, prioritizeSafety, reconcileWorkspace, recoverFailedCard, registerSurfaces } from "./interactionOrchestrationGates.js";
describe("interaction orchestration gates", () => {
  it("publishes one primary action", () => { expect(arbitratePrimaryAction({ unsaved: true, recapPending: true, qualityMissing: true, overdueObligations: 1 }).primary).toBe("save-or-resolve-unsaved"); });
  it("protects recovery and L2 safety before candidate review", () => { expect(prioritizeSafety({ recoveryPending: true, l2Pending: true, candidateReviewable: true })).toMatchObject({ action: "recover-data", candidateExecutable: false }); });
  it("requires every surface capability field", () => { expect(registerSurfaces({ surfaces: [{ id: "s1", command: "save", authority: "canon", phase: "draft" }], expected: 2 }).complete).toBe(false); });
  it("keeps stage and primary action across view switch", () => { expect(preserveStageOnViewSwitch({ stage: "reviewable", primaryAction: "review", cursor: "ch3", switchedView: "graph" }).regenerateOutline).toBe(false); });
  it("parses author constraints before any side effect", () => { expect(parseAuthorReceipt({ text: "continue but no death", continueRequested: true, hardConstraints: ["mentor-alive"], parseAmbiguous: true })).toMatchObject({ modelCalls: 0, fileWrites: 0, corrected: true }); });
  it("deduplicates repeated submissions", () => { expect(deduplicateAction({ actionIds: ["a1", "a1", "a1"] }).created).toBe(1); });
  it("keeps completed task result on its original chapter", () => { expect(isolateTaskChapter({ taskChapter: "10", currentChapter: "11" }).inserted).toBe(false); });
  it("does not overwrite server canon during workspace conflict", () => { expect(reconcileWorkspace({ localFingerprint: "l", serverFingerprint: "s" }).action).toBe("compare"); });
  it("recovers failed work in original card", () => { expect(recoverFailedCard({ reason: "budget", modelCalled: false, bodyWritten: false, sameActionId: true }).resumable).toBe(true); });
  it("isolates continuation semantics by project", () => { expect(isolateProjectContinuation({ projectId: "b", activeProjectId: "a", cursor: "b1" }).isolated).toBe(false); });
  it("blocks shell activation until shadow evidence passes", () => { expect(gateShellShadow({ safeBlock: true, deepLinkVerified: true, keyboardVerified: true, recoveryVerified: true, legacyFixtureVerified: true }).enabled).toBe(false); });
  it("does not release journey on hidden-panel evidence", () => { expect(assessJourneyEvidence({ firstScreenOnly: true, refreshLosesDialogue: true, failureNeedsHistory: true }).status).toBe("implemented"); });
});
