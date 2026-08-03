import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { assertIndependentReviewGateIntegrity, evaluateIndependentReviewGate } from "./independentReviewGate.js";

describe("independent review gate", () => {
  it("passes only with frozen evidence, isolated evaluator and hard guards", () => {
    const result = evaluateIndependentReviewGate({ taskId: "task-1", inputFingerprint: "fp-1", generatorInvocationId: "gen-1", evaluatorInvocationId: "eval-1", evaluatorModelCapabilityRef: "model-2", generatorModelCapabilityRef: "model-1", firstOutputVisibility: "hidden", hardGuardsPassed: true, evidenceRefs: ["manifest-1"] });
    expect(result).toMatchObject({ status: "passed", independent: true });
  });

  it("blocks same invocation/model, mutable input, exposed first output or failed guards", () => {
    expect(evaluateIndependentReviewGate({ taskId: "task-1", inputFingerprint: "", generatorInvocationId: "gen-1", evaluatorInvocationId: "gen-1", evaluatorModelCapabilityRef: "model-1", generatorModelCapabilityRef: "model-1", firstOutputVisibility: "visible", hardGuardsPassed: false, evidenceRefs: [] })).toMatchObject({ status: "blocked", reasons: expect.arrayContaining(["FROZEN_INPUT_REQUIRED", "INDEPENDENT_EVALUATOR_REQUIRED", "FIRST_OUTPUT_MUST_BE_HIDDEN", "HARD_GUARDS_FAILED", "EVIDENCE_REQUIRED"]) });
  });
  it("rejects blank evaluator evidence and detects result tampering", () => { const blocked = evaluateIndependentReviewGate({ taskId: "task-1", inputFingerprint: "fp-1", generatorInvocationId: "gen-1", evaluatorInvocationId: "eval-1", evaluatorModelCapabilityRef: "model-2", generatorModelCapabilityRef: "model-1", firstOutputVisibility: "hidden", hardGuardsPassed: true, evidenceRefs: [" "] }); expect(blocked.status).toBe("blocked"); expect(() => assertIndependentReviewGateIntegrity({ ...blocked, independent: true })).toThrow("INDEPENDENT_REVIEW_GATE_INTEGRITY_FAILED"); });
  it("rejects a validly hashed result whose independent flag disagrees with its status", () => {
    const base = { schemaVersion: "independent-review-gate.v1", taskId: "task-2", inputFingerprint: "fp-2", status: "passed", independent: false, reasons: [], evidenceRefs: [] };
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
    expect(() => assertIndependentReviewGateIntegrity({ ...base, fingerprint } as never)).toThrow("INDEPENDENT_REVIEW_GATE_INTEGRITY_FAILED");
  });

  it("fails closed for malformed evaluator input instead of throwing a runtime type error", () => {
    const result = evaluateIndependentReviewGate({
      taskId: undefined as never,
      inputFingerprint: 42 as never,
      generatorInvocationId: "gen-1",
      evaluatorInvocationId: "eval-1",
      evaluatorModelCapabilityRef: "model-2",
      generatorModelCapabilityRef: "model-1",
      firstOutputVisibility: "visible",
      hardGuardsPassed: false,
      evidenceRefs: undefined as never
    });
    expect(result).toMatchObject({ status: "blocked", reasons: expect.arrayContaining(["FROZEN_INPUT_REQUIRED", "EVIDENCE_REQUIRED"]) });
  });
});
