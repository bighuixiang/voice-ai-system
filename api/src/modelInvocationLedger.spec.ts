import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendModelInvocation, createModelInvocationRecord, evaluateInvocationBudget, readModelInvocations, retryClassFor } from "./modelInvocationLedger.js";

const input = { invocationId: "inv-1", taskId: "task-1", taskFingerprint: "task-fp", attemptId: "attempt-1", routeDecision: "balanced", modelCapabilityRef: "model-cap-1", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), status: "completed" as const, usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 2, measurement: "actual" as const }, cost: { amount: 0.01, currency: "USD", measurement: "actual" as const }, cache: { hit: false }, adoptionDecision: "not-adopted" };

describe("model invocation ledger", () => {
  it("creates append-only replayable records and rejects silent corruption", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "invocation-ledger-"));
    const record = createModelInvocationRecord(input);
    await appendModelInvocation(root, record);
    expect(await readModelInvocations(root)).toEqual([record]);
    await fs.appendFile(path.join(root, "sessions", "model-invocations.jsonl"), "not-json\n", "utf8");
    await expect(readModelInvocations(root)).rejects.toThrow("MODEL_INVOCATION_LEDGER_CORRUPT");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("classifies only bounded transient failures as retryable and hard-stops budget overflow", () => {
    expect(retryClassFor("timeout")).toBe("transient");
    expect(retryClassFor("authentication")).toBe("non-retryable");
    expect(evaluateInvocationBudget({ hardLimit: 100, committed: 80, reserved: 20, nextEstimate: 1 })).toMatchObject({ allowed: false, reason: "BUDGET_HARD_STOP" });
  });
});
