import crypto from "node:crypto";

export type RetryClass = "transient" | "non-retryable";
export interface RetryDecision {
  schemaVersion: "retry-decision.v1";
  retry: boolean;
  retryClass: RetryClass;
  retryChainId: string;
  attempt: number;
  maxAttempts: number;
  repairCall: boolean;
  reason: string;
  fingerprint: string;
}
export interface CircuitDecision {
  schemaVersion: "circuit-decision.v1";
  state: "closed" | "open" | "half-open";
  allow: boolean;
  consecutiveFailures: number;
  recoveryAt?: string;
  reason: string;
  fingerprint: string;
}
export function assertCircuitDecisionIntegrity(decision: CircuitDecision): CircuitDecision { const { fingerprint, ...base } = decision; if (decision.schemaVersion !== "circuit-decision.v1" || !["closed", "open", "half-open"].includes(decision.state) || hash(base) !== fingerprint) throw new Error("CIRCUIT_DECISION_INTEGRITY_FAILED"); return decision; }

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const transient = /network|rate[-_ ]?limit|timeout|temporar|5\d\d/iu;
export function assertRetryDecisionIntegrity(decision: RetryDecision): RetryDecision { const { fingerprint, ...base } = decision; if (decision.schemaVersion !== "retry-decision.v1" || !decision.retryChainId.trim() || decision.attempt < 1 || decision.maxAttempts < decision.attempt || hash(base) !== fingerprint) throw new Error("RETRY_DECISION_INTEGRITY_FAILED"); return decision; }

export function evaluateRetryDecision(input: { retryChainId: string; attempt: number; maxAttempts: number; errorCode: string; structuredOutputInvalid?: boolean; repairCallAlreadyUsed?: boolean; retryAfterMs?: number }): RetryDecision {
  if (!input.retryChainId.trim() || !input.errorCode.trim() || !Number.isInteger(input.attempt) || input.attempt < 1 || !Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 3 || (input.retryAfterMs !== undefined && (!Number.isFinite(input.retryAfterMs) || input.retryAfterMs < 0))) throw new Error("RETRY_POLICY_INPUT_INVALID");
  const retryClass: RetryClass = transient.test(input.errorCode) ? "transient" : "non-retryable";
  const repairCall = Boolean(input.structuredOutputInvalid && !input.repairCallAlreadyUsed && input.attempt <= input.maxAttempts);
  const retry = !repairCall && retryClass === "transient" && input.attempt < input.maxAttempts;
  const reason = repairCall ? "one structure-only repair call is allowed" : retry ? "transient failure within bounded retry chain" : retryClass === "non-retryable" ? "non-retryable failure must not be retried" : "retry chain exhausted";
  const base = { schemaVersion: "retry-decision.v1" as const, retry, retryClass, retryChainId: input.retryChainId, attempt: input.attempt, maxAttempts: input.maxAttempts, repairCall, reason };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateCircuitDecision(input: { consecutiveFailures: number; failureThreshold: number; now: string; openedAt?: string; cooldownMs: number; halfOpenProbeInFlight?: boolean }): CircuitDecision {
  if (![input.consecutiveFailures, input.failureThreshold, input.cooldownMs].every((value) => Number.isInteger(value) && value >= 0) || input.failureThreshold < 1 || !Number.isFinite(Date.parse(input.now)) || (input.openedAt !== undefined && !Number.isFinite(Date.parse(input.openedAt)))) throw new Error("CIRCUIT_POLICY_INPUT_INVALID");
  if (input.consecutiveFailures < input.failureThreshold) {
    const base = { schemaVersion: "circuit-decision.v1" as const, state: "closed" as const, allow: true, consecutiveFailures: input.consecutiveFailures, reason: "failure threshold not reached" };
    return { ...base, fingerprint: hash(base) };
  }
  const recoveryAt = input.openedAt ? new Date(new Date(input.openedAt).getTime() + input.cooldownMs).toISOString() : undefined;
  const recovered = Boolean(recoveryAt && Date.parse(input.now) >= Date.parse(recoveryAt));
  const halfOpen = recovered && !input.halfOpenProbeInFlight;
  const base = { schemaVersion: "circuit-decision.v1" as const, state: halfOpen ? "half-open" as const : "open" as const, allow: halfOpen, consecutiveFailures: input.consecutiveFailures, ...(recoveryAt ? { recoveryAt } : {}), reason: halfOpen ? "cooldown elapsed; allow one recovery probe" : "circuit open; preserve queue, budget, and input fingerprint" };
  return { ...base, fingerprint: hash(base) };
}
