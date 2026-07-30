import { describe, expect, it } from "vitest";
import { evaluateIndependentReviewGate } from "./independentReviewGate.js";

describe("independent review gate", () => {
  it("passes only with frozen evidence, isolated evaluator and hard guards", () => {
    const result = evaluateIndependentReviewGate({ taskId: "task-1", inputFingerprint: "fp-1", generatorInvocationId: "gen-1", evaluatorInvocationId: "eval-1", evaluatorModelCapabilityRef: "model-2", generatorModelCapabilityRef: "model-1", firstOutputVisibility: "hidden", hardGuardsPassed: true, evidenceRefs: ["manifest-1"] });
    expect(result).toMatchObject({ status: "passed", independent: true });
  });

  it("blocks same invocation/model, mutable input, exposed first output or failed guards", () => {
    expect(evaluateIndependentReviewGate({ taskId: "task-1", inputFingerprint: "", generatorInvocationId: "gen-1", evaluatorInvocationId: "gen-1", evaluatorModelCapabilityRef: "model-1", generatorModelCapabilityRef: "model-1", firstOutputVisibility: "visible", hardGuardsPassed: false, evidenceRefs: [] })).toMatchObject({ status: "blocked", reasons: expect.arrayContaining(["FROZEN_INPUT_REQUIRED", "INDEPENDENT_EVALUATOR_REQUIRED", "FIRST_OUTPUT_MUST_BE_HIDDEN", "HARD_GUARDS_FAILED", "EVIDENCE_REQUIRED"]) });
  });
});
