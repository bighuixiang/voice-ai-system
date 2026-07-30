import { describe, expect, it } from "vitest";
import { advancePrimaryAction, createPrimaryActionDecision, validatePrimaryActionSubmission } from "./primaryActionDecision.js";

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
});
