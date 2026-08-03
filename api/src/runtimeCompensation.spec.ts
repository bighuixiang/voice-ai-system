import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyRuntimeCompensation, recordRuntimeCompensation } from "./runtimeCompensation.js";

describe("runtime compensation receipts", () => {
  it("plans lease release, evidence preservation, and dependent blocking", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-compensation-"));
    const receipt = await recordRuntimeCompensation(root, { runId: "run-1", commandId: "cmd-1", stage: "story_graph_update", failureFingerprint: "failure-1", workLeaseClaimed: true });
    expect(receipt.actions.map((entry) => entry.action)).toEqual(["release-work-lease", "preserve-stage-output", "quarantine-derived-projection", "block-dependent-work"]);
    await expect(recordRuntimeCompensation(root, { runId: "run-1", commandId: "cmd-1", stage: "story_graph_update", failureFingerprint: "failure-1", workLeaseClaimed: true })).resolves.toEqual(receipt);
  });

  it("applies every planned action through an idempotent application receipt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-compensation-apply-"));
    const planned = await recordRuntimeCompensation(root, { runId: "run-apply", commandId: "cmd-apply", stage: "story_graph_update", failureFingerprint: "failure-apply", workLeaseClaimed: true });
    const applied = await applyRuntimeCompensation(root, planned);
    expect(applied).toMatchObject({ schemaVersion: "runtime-compensation-application.v1", compensationFingerprint: planned.fingerprint });
    expect(applied.actions).toEqual(planned.actions.map((action) => ({ action: action.action, status: "applied" })));
    await expect(applyRuntimeCompensation(root, planned)).resolves.toEqual(applied);
    await expect(fs.readFile(path.join(root, "sessions/runtime-compensation-effects/run-apply/block-dependent-work.json"), "utf8")).resolves.toContain("block-dependent-work");
  });
});
