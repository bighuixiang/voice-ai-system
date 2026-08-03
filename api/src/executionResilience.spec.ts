import { describe, expect, it } from "vitest";
import { assertCircuitDecisionIntegrity, assertRetryDecisionIntegrity, evaluateCircuitDecision, evaluateRetryDecision } from "./executionResilience.js";

describe("execution resilience gates", () => {
  it("bounds transient retries and allows only one structure repair", () => {
    expect(evaluateRetryDecision({ retryChainId: "chain-1", attempt: 1, maxAttempts: 3, errorCode: "HTTP_503" })).toMatchObject({ retry: true, repairCall: false, retryClass: "transient" });
    expect(evaluateRetryDecision({ retryChainId: "chain-1", attempt: 1, maxAttempts: 3, errorCode: "SCHEMA_INVALID", structuredOutputInvalid: true })).toMatchObject({ retry: false, repairCall: true });
    expect(evaluateRetryDecision({ retryChainId: "chain-1", attempt: 2, maxAttempts: 3, errorCode: "SCHEMA_INVALID", structuredOutputInvalid: true, repairCallAlreadyUsed: true })).toMatchObject({ retry: false, repairCall: false, retryClass: "non-retryable" });
    expect(evaluateRetryDecision({ retryChainId: "chain-1", attempt: 3, maxAttempts: 3, errorCode: "timeout" }).retry).toBe(false);
  });

  it("opens after a threshold and permits one half-open recovery probe", () => {
    expect(evaluateCircuitDecision({ consecutiveFailures: 1, failureThreshold: 2, now: "2026-07-31T00:00:00.000Z", cooldownMs: 1000 }).state).toBe("closed");
    expect(evaluateCircuitDecision({ consecutiveFailures: 2, failureThreshold: 2, now: "2026-07-31T00:00:00.000Z", openedAt: "2026-07-31T00:00:00.000Z", cooldownMs: 1000 }).allow).toBe(false);
    expect(evaluateCircuitDecision({ consecutiveFailures: 2, failureThreshold: 2, now: "2026-07-31T00:00:02.000Z", openedAt: "2026-07-31T00:00:00.000Z", cooldownMs: 1000 }).state).toBe("half-open");
    expect(evaluateCircuitDecision({ consecutiveFailures: 2, failureThreshold: 2, now: "2026-07-31T00:00:02.000Z", openedAt: "2026-07-31T00:00:00.000Z", cooldownMs: 1000, halfOpenProbeInFlight: true }).allow).toBe(false);
  });
  it("rejects malformed retry input and detects tampered retry receipts", () => { expect(() => evaluateRetryDecision({ retryChainId: "chain-1", attempt: 1, maxAttempts: 3, errorCode: "", retryAfterMs: -1 })).toThrow("RETRY_POLICY_INPUT_INVALID"); const decision = evaluateRetryDecision({ retryChainId: "chain-1", attempt: 1, maxAttempts: 3, errorCode: "HTTP_503" }); expect(() => assertRetryDecisionIntegrity({ ...decision, retry: false })).toThrow("RETRY_DECISION_INTEGRITY_FAILED"); });
  it("rejects invalid recovery timestamps and detects circuit tampering", () => { expect(() => evaluateCircuitDecision({ consecutiveFailures: 2, failureThreshold: 2, now: "2026-07-31T00:00:00.000Z", openedAt: "invalid", cooldownMs: 1000 })).toThrow("CIRCUIT_POLICY_INPUT_INVALID"); const decision = evaluateCircuitDecision({ consecutiveFailures: 0, failureThreshold: 2, now: "2026-07-31T00:00:00.000Z", cooldownMs: 1000 }); expect(() => assertCircuitDecisionIntegrity({ ...decision, allow: false })).toThrow("CIRCUIT_DECISION_INTEGRITY_FAILED"); });
});
