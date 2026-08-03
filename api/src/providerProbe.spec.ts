import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readModelInvocations } from "./modelInvocationLedger.js";
import { runProviderProbe } from "./providerProbe.js";

describe("provider probe", () => {
  it("runs a configured provider process and appends an estimated, replayable ledger record", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "provider-probe-"));
    const result = await runProviderProbe({ root, projectRoot: root, config: { command: "mock", label: "Mock Provider", model: "mock-v1", provider: "codex" }, prompt: "probe", taskId: "task-1", taskFingerprint: "task-fp", contextManifestRef: "manifest-1", promptSchemaVersion: "prompt.v1", routeDecision: "balanced", estimatedInputTokens: 4, estimatedOutputTokens: 6, estimatedCost: 0.02, runner: { run: async () => ({ stdout: "out", stderr: "", exitCode: 0, finalMessage: "result", durationMs: 12 }) } });
    expect(result.output.finalMessage).toBe("result");
    expect(result.record).toMatchObject({ status: "completed", usage: { measurement: "estimated" }, cost: { amount: 0.02, measurement: "estimated" }, adoptionDecision: "probe-only" });
    expect(await readModelInvocations(root)).toEqual([result.record]);
    await fs.rm(root, { recursive: true, force: true });
  });
});
