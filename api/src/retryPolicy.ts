import { retryClassFor } from "./modelInvocationLedger.js";

export interface NarrowRetryDecision {
  allow: boolean;
  delayMs: number;
  reason: "transient failure within retry budget" | "non-retryable failure" | "retry budget exhausted";
}

function retryHintMs(errorCode: string): number | undefined {
  const milliseconds = errorCode.match(/retry-after(?:-ms)?\s*[:=]\s*(\d+)/iu);
  if (!milliseconds) return undefined;
  const value = Number(milliseconds[1]);
  if (!Number.isFinite(value)) return undefined;
  return /retry-after-ms/iu.test(milliseconds[0]) ? value : value * 1000;
}

export function planNarrowRetry(input: { errorCode: string; attempt: number; maxAttempts?: number; maxDelayMs?: number }): NarrowRetryDecision {
  const maxAttempts = input.maxAttempts ?? 2;
  const maxDelayMs = input.maxDelayMs ?? 2_000;
  if (!input.errorCode.trim() || !Number.isInteger(input.attempt) || input.attempt < 1 || !Number.isInteger(maxAttempts) || maxAttempts < 1 || !Number.isInteger(maxDelayMs) || maxDelayMs < 0) throw new Error("RETRY_POLICY_INPUT_INVALID");
  if (retryClassFor(input.errorCode) !== "transient") return { allow: false, delayMs: 0, reason: "non-retryable failure" };
  if (input.attempt >= maxAttempts) return { allow: false, delayMs: 0, reason: "retry budget exhausted" };
  const exponential = Math.min(maxDelayMs, 50 * (2 ** (input.attempt - 1)));
  const hinted = retryHintMs(input.errorCode) ?? 0;
  return { allow: true, delayMs: Math.min(maxDelayMs, Math.max(exponential, hinted)), reason: "transient failure within retry budget" };
}
