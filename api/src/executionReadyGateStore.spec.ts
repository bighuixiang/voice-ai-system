import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateExecutionReadyGate } from "./executionReadyGate.js";
import { persistExecutionReadyGateReport, readExecutionReadyGateReport } from "./executionReadyGateStore.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

const report = () => evaluateExecutionReadyGate({
  projectSlug: "demo", outlineVersionId: "outline-version-1", nearHorizon: [1, 2, 3].map((order) => ({ chapterId: `chapter-${order}`, hasFunction: true, hasStateChange: true, sourceRefs: [`outline://chapter/${order}`] })),
  arcObligationLinks: [{ arcId: "arc-1", obligationId: "obligation-1", plannedNodeId: "chapter-1" }], causalReachable: true, contextComplete: true, blockingConflictsResolved: true, sourceRefs: ["outline://version/1"], structureVersionFingerprint: "structure-1", changeLevel: "L0", adoptionAuthority: "author", adoptionProofFingerprint: "adoption-1"
});

describe("execution-ready gate report persistence", () => {
  it("persists and replays the fingerprinted report", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "execution-ready-gate-")); roots.push(root);
    const first = await persistExecutionReadyGateReport(root, report());
    const second = await persistExecutionReadyGateReport(root, report());
    expect(second).toEqual(first);
    expect(first.executionReady).toBe(true);
    await expect(readExecutionReadyGateReport(root)).resolves.toEqual(first);
  });

  it("rejects a report for another project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "execution-ready-gate-project-")); roots.push(root);
    const other = { ...report(), projectSlug: "other" };
    const { fingerprint: _fingerprint, ...base } = other;
    const validOther = { ...other, fingerprint: crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex") };
    await expect(persistExecutionReadyGateReport(root, validOther, "demo")).rejects.toThrow("EXECUTION_READY_GATE_PROJECT_MISMATCH");
  });
});
