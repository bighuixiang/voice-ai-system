import { describe, expect, it } from "vitest";
import { classifyRunFailure, decideFailureIsolation } from "./failureIsolation.js";

describe("run failure isolation", () => {
  it("classifies bounded infrastructure failures as transient", () => {
    expect(classifyRunFailure("provider-timeout")).toBe("transient-infrastructure");
    expect(decideFailureIsolation({ kind: "transient-infrastructure", critical: false })).toMatchObject({ action: "retry-with-backoff", blockDependents: false, continueUnrelated: true });
  });

  it("blocks dependents for critical content or data failures", () => {
    expect(classifyRunFailure("canon-integrity-failed")).toBe("unrecoverable-data");
    expect(decideFailureIsolation({ kind: "unrecoverable-data", critical: true })).toMatchObject({ action: "isolate-and-stop", blockDependents: true, continueUnrelated: true });
  });

  it("allows optional evaluator degradation while preserving evidence", () => {
    expect(decideFailureIsolation({ kind: "quality-guard", critical: false })).toMatchObject({ action: "degrade-with-evidence", blockDependents: false, continueUnrelated: true });
  });
});
