import { describe, expect, it } from "vitest";
import { planNarrowRetry } from "./retryPolicy.js";

describe("narrow retry policy", () => {
  it("permits one bounded retry for a transient error and honors a capped retry hint", () => {
    expect(planNarrowRetry({ errorCode: "HTTP_429 retry-after-ms=9000", attempt: 1, maxAttempts: 2, maxDelayMs: 2000 })).toMatchObject({
      allow: true,
      delayMs: 2000,
      reason: "transient failure within retry budget"
    });
  });

  it("does not retry deterministic failures", () => {
    expect(planNarrowRetry({ errorCode: "AUTH_DENIED", attempt: 1, maxAttempts: 2 })).toMatchObject({ allow: false, reason: "non-retryable failure" });
  });

  it("stops after the configured attempt budget", () => {
    expect(planNarrowRetry({ errorCode: "HTTP_503", attempt: 2, maxAttempts: 2 })).toMatchObject({ allow: false, reason: "retry budget exhausted" });
  });
});
