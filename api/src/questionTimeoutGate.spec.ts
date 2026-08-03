import { describe, expect, it } from "vitest";
import { evaluateQuestionTimeout } from "./questionTimeoutGate.js";

describe("question timeout gate", () => {
  it("does not auto-accept an L2 recommendation after seven days", () => {
    expect(evaluateQuestionTimeout({ questionId: "q-ending", level: "L2", waitedDays: 7, now: "2026-08-01T00:00:00Z", requestedAction: "choose-recommended-ending" })).toMatchObject({ status: "gate_required", canCompleteUnrelatedWork: true });
  });

  it("continues only with an active unexpired grant covering the exact question and action", () => {
    const grant = { grantId: "g-1", scope: ["q-ending"], allowedActions: ["choose-recommended-ending"], expiresAt: "2026-08-02T00:00:00Z", status: "active" as const };
    expect(evaluateQuestionTimeout({ questionId: "q-ending", level: "L2", waitedDays: 7, now: "2026-08-01T00:00:00Z", requestedAction: "choose-recommended-ending", grant })).toMatchObject({ status: "continue_authorized" });
    expect(evaluateQuestionTimeout({ questionId: "q-ending", level: "L2", waitedDays: 7, now: "2026-08-01T00:00:00Z", requestedAction: "choose-other-ending", grant }).status).toBe("gate_required");
  });
});
