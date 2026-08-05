import { describe, expect, it } from "vitest";
import { advancePrimaryAction, createPrimaryActionDecision, resolvePrimaryActionDecision, validatePrimaryActionSubmission } from "./primaryActionDecision.js";

const candidate = (id: string, kind: "safety-conflict" | "l2-decision" | "recovery" | "reviewable" | "continue" | "exploration", blocked = false) => ({ actionId: id, kind, label: id, rationale: `${id} rationale`, preconditions: blocked ? ["missing-proof"] : [], targetOutcome: "next outcome", allowedCommands: ["run"], risk: kind === "safety-conflict" ? "high" as const : "low" as const, lifecycle: "ready" as const });

describe("primary action decision", () => {
  it("selects exactly one action using the fixed safety-first priority", () => {
    const decision = createPrimaryActionDecision({ journeyVersion: "journey-2", sourceFingerprint: "source-2", candidates: [candidate("explore", "exploration"), candidate("review", "reviewable"), candidate("safety", "safety-conflict")] });
    expect(decision.actionId).toBe("safety");
    expect(decision.priorityEvidence).toContain("safety-conflict");
    expect(decision.idempotencyKey).toMatch(/^primary-action-/);
  });

  it("publishes a blocked decision when the highest-priority action lacks a precondition", () => {
    const decision = createPrimaryActionDecision({ journeyVersion: "journey-2", sourceFingerprint: "source-2", candidates: [candidate("decision", "l2-decision", true), candidate("continue", "continue")] });
    expect(decision.status).toBe("blocked");
    expect(decision.blockingReasons).toEqual(["missing-proof"]);
  });

  it("revalidates the same decision at command submission", () => {
    const decision = createPrimaryActionDecision({ journeyVersion: "journey-2", sourceFingerprint: "source-2", candidates: [candidate("continue", "continue")] });
    expect(validatePrimaryActionSubmission(decision, { actionId: "continue", journeyVersion: "journey-2", sourceFingerprint: "source-2" })).toMatchObject({ accepted: true });
    expect(validatePrimaryActionSubmission(decision, { actionId: "continue", journeyVersion: "journey-3", sourceFingerprint: "source-2" })).toMatchObject({ accepted: false, reason: "journey-stale" });
  });

  it("keeps the lifecycle explicit and monotonic", () => {
    const decision = createPrimaryActionDecision({ journeyVersion: "journey-2", sourceFingerprint: "source-2", candidates: [candidate("continue", "continue")] });
    const running = advancePrimaryAction(decision, "submitted");
    expect(advancePrimaryAction(running, "running").lifecycle).toBe("running");
    expect(() => advancePrimaryAction(running, "ready")).toThrow("PRIMARY_ACTION_LIFECYCLE_INVALID");
  });

  it("derives one deterministic action from journey state without caller-supplied candidates", () => {
    const blocked = resolvePrimaryActionDecision({ journeyVersion: "journey-2", sourceFingerprint: "source-2", stage: "understanding", activeQuestionId: "question-pov" });
    expect(blocked).toMatchObject({ actionId: "answer-question-pov", kind: "l2-decision", status: "ready" });

    const continueAction = resolvePrimaryActionDecision({ journeyVersion: "journey-2", sourceFingerprint: "source-2", stage: "understanding" });
    expect(continueAction).toMatchObject({ actionId: "continue-understanding", kind: "continue", status: "ready" });
    expect(continueAction.idempotencyKey).toBe(resolvePrimaryActionDecision({ journeyVersion: "journey-2", sourceFingerprint: "source-2", stage: "understanding" }).idempotencyKey);
  });

  it("moves to a reviewable understanding result after the snapshot exists", () => {
    const decision = resolvePrimaryActionDecision({ journeyVersion: "journey-3", sourceFingerprint: "source-3", stage: "understanding", hasUnderstandingSnapshot: true });
    expect(decision).toMatchObject({ actionId: "review-understanding", kind: "reviewable", status: "ready" });
    expect(decision.allowedCommands).toContain("review-understanding");
  });

  it("selects contract candidate compilation after review and an answered decision", () => {
    const decision = resolvePrimaryActionDecision({ journeyVersion: "journey-4", sourceFingerprint: "source-4", stage: "understanding", hasUnderstandingSnapshot: true, hasUnderstandingReviewPassed: true, contractDecisionId: "decision-q1-1" });
    expect(decision).toMatchObject({ actionId: "generate-contract-candidate-decision-q1-1", kind: "continue", status: "ready" });
  });

  it("moves from candidate generation to candidate review", () => {
    const decision = resolvePrimaryActionDecision({ journeyVersion: "journey-5", sourceFingerprint: "source-5", stage: "understanding", hasUnderstandingReviewPassed: true, contractDecisionId: "decision-q1-1", contractCandidateId: "contract-candidate-decision-q1-1" });
    expect(decision).toMatchObject({ actionId: "review-contract-candidate-contract-candidate-decision-q1-1", kind: "reviewable", status: "ready" });
  });

  it("arbitrates completed blueprint review and outline-ready stages", () => {
    const review = resolvePrimaryActionDecision({ journeyVersion: "journey-blueprint", sourceFingerprint: "source-blueprint", stage: "blueprint-review", contractCandidateId: "candidate-blueprint" });
    expect(review).toMatchObject({ actionId: "review-contract-candidate-candidate-blueprint", kind: "reviewable" });
    const outline = resolvePrimaryActionDecision({ journeyVersion: "journey-outline", sourceFingerprint: "source-outline", stage: "ready-for-outline", outlineSourceCandidateId: "candidate-blueprint" });
    expect(outline).toMatchObject({ actionId: "generate-outline-candidate-candidate-blueprint", kind: "continue" });
  });

  it("requires explicit authorization after an adoption proposal exists", () => {
    const decision = resolvePrimaryActionDecision({ journeyVersion: "journey-6", sourceFingerprint: "source-6", stage: "understanding", hasUnderstandingReviewPassed: true, contractCandidateId: "candidate-1", contractAdoptionProposalId: "proposal-1", contractAdoptionProposalStatus: "ready_for_authorization" });
    expect(decision).toMatchObject({ actionId: "commit-contract-adoption-proposal-1", kind: "l2-decision", risk: "high" });
  });

  it("returns to candidate review when the adoption proposal is blocked", () => {
    const decision = resolvePrimaryActionDecision({ journeyVersion: "journey-blocked-proposal", sourceFingerprint: "source-blocked-proposal", stage: "understanding", hasUnderstandingReviewPassed: true, contractCandidateId: "candidate-1", contractAdoptionProposalId: "proposal-1", contractAdoptionProposalStatus: "blocked" });

    expect(decision).toMatchObject({ actionId: "review-contract-candidate-candidate-1", kind: "reviewable" });
  });

  it("moves to outline generation after contract adoption is committed", () => {
    const decision = resolvePrimaryActionDecision({
      journeyVersion: "journey-7",
      sourceFingerprint: "source-7",
      stage: "understanding",
      hasUnderstandingReviewPassed: true,
      contractCandidateId: "candidate-1",
      contractAdoptionProposalId: "proposal-1",
      contractAdoptionCommitted: true,
      blueprintConfirmed: true,
      outlineSourceCandidateId: "candidate-1"
    });
    expect(decision).toMatchObject({ actionId: "generate-outline-candidate-candidate-1", kind: "continue", targetOutcome: "outline-candidate-created" });
  });

  it("allows a confirmed blueprint to create a reviewable outline without claiming the contract is canon", () => {
    const decision = resolvePrimaryActionDecision({
      journeyVersion: "journey-blueprint-outline",
      sourceFingerprint: "source-blueprint-outline",
      stage: "ready-for-outline",
      blueprintConfirmed: true,
      outlineSourceCandidateId: "candidate-blueprint"
    });

    expect(decision).toMatchObject({ actionId: "generate-outline-candidate-candidate-blueprint", kind: "continue" });
    expect(decision.rationale).toContain("故事蓝图已确认");
  });

  it("prioritizes contract adoption instead of regenerating an existing outline", () => {
    const decision = resolvePrimaryActionDecision({
      journeyVersion: "journey-contract-before-outline",
      sourceFingerprint: "source-contract-before-outline",
      stage: "ready-for-outline",
      hasUnderstandingReviewPassed: true,
      contractCandidateId: "candidate-blueprint",
      contractAdoptionProposalId: "contract-proposal-1",
      contractAdoptionProposalStatus: "ready_for_authorization",
      blueprintConfirmed: true,
      outlineSourceCandidateId: "candidate-blueprint",
      outlineCandidateId: "outline-candidate-blueprint"
    });

    expect(decision).toMatchObject({ actionId: "commit-contract-adoption-contract-proposal-1", kind: "l2-decision", risk: "high" });
  });

  it("does not advance into outline work when the blueprint confirmation is missing or stale", () => {
    const decision = resolvePrimaryActionDecision({
      journeyVersion: "journey-blueprint-stale",
      sourceFingerprint: "source-blueprint-stale",
      stage: "blueprint-review",
      hasUnderstandingReviewPassed: true,
      contractCandidateId: "candidate-1",
      contractAdoptionCommitted: true,
      blueprintConfirmed: false,
      outlineSourceCandidateId: "candidate-1"
    });

    expect(decision).toMatchObject({ actionId: "review-contract-candidate-candidate-1", kind: "reviewable" });
  });

  it("requires outline review before proposing adoption", () => {
    const decision = resolvePrimaryActionDecision({
      journeyVersion: "journey-8",
      sourceFingerprint: "source-8",
      stage: "understanding",
      contractAdoptionCommitted: true,
      blueprintConfirmed: true,
      outlineCandidateId: "outline-1",
      outlineValidationPassed: true
    });
    expect(decision).toMatchObject({ actionId: "propose-outline-adoption-outline-1", kind: "reviewable" });
  });

  it("keeps outline authorization separate from canon commit", () => {
    const ready = resolvePrimaryActionDecision({ journeyVersion: "journey-9", sourceFingerprint: "source-9", stage: "understanding", contractAdoptionCommitted: true, blueprintConfirmed: true, outlineCandidateId: "outline-1", outlineAdoptionProposalId: "proposal-1", outlineAdoptionProposalStatus: "ready_for_authorization" });
    expect(ready).toMatchObject({ actionId: "authorize-outline-adoption-proposal-1", kind: "l2-decision", risk: "high" });
    const authorized = resolvePrimaryActionDecision({ journeyVersion: "journey-10", sourceFingerprint: "source-10", stage: "understanding", contractAdoptionCommitted: true, blueprintConfirmed: true, outlineCandidateId: "outline-1", outlineAdoptionProposalId: "proposal-1", outlineAdoptionProposalStatus: "authorized" });
    expect(authorized).toMatchObject({ actionId: "commit-outline-adoption-proposal-1", kind: "l2-decision", risk: "high" });
  });
});
