import { describe, expect, it } from "vitest";
import { evaluateRunPreflight, persistRunPreflight, readRunPreflight } from "./runPreflight.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const base = { runId: "run-1", objective: "draft chapters 1-3", estimatedWorkItems: 8, estimatedWallClockMs: 120000, estimatedCostCents: 300, missingAssets: [], pausePoints: ["after chapter settlement"], authorizationScope: "chapters:1-3;L0-L1", worstCaseRecoveryBoundary: "last committed chapter", storyContractConfirmed: true, migrationComplete: true, budgetAvailable: true, workerOnline: true, conflictingRun: false };

describe("run preflight", () => {
  it("exposes startup estimates and recovery boundaries when ready", () => {
    expect(evaluateRunPreflight(base)).toMatchObject({ status: "ready", estimatedWorkItems: 8, estimatedCostCents: 300, pausePoints: ["after chapter settlement"] });
  });

  it("blocks startup when a required precondition is missing", () => {
    const result = evaluateRunPreflight({ ...base, missingAssets: ["story-contract"], workerOnline: false, conflictingRun: true });
    expect(result).toMatchObject({ status: "blocked", blockedReasons: expect.arrayContaining(["MISSING_ASSETS", "WORKER_OFFLINE", "CONFLICTING_RUN"]) });
  });

  it("normalizes every execution ceiling and blocks estimates beyond a ceiling", () => {
    const result = evaluateRunPreflight({ ...base, estimatedWorkItems: 9, limits: { maxChapters: 3, maxWorkItems: 8, maxActiveWorkItems: 2, maxModelCalls: 12, maxCostCents: 300, maxWallClockMs: 120000, maxConsecutiveFailures: 2, latestStopAt: "2099-01-01T00:00:00.000Z" } });
    expect(result.limits).toMatchObject({ maxChapters: 3, maxWorkItems: 8, maxActiveWorkItems: 2, maxModelCalls: 12, maxCostCents: 300, maxWallClockMs: 120000, maxConsecutiveFailures: 2, latestStopAt: "2099-01-01T00:00:00.000Z" });
    expect(result.status).toBe("blocked");
    expect(result.blockedReasons).toContain("WORK_ITEM_ESTIMATE_EXCEEDS_LIMIT");
  });

  it("persists an immutable startup proof for replay", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "run-preflight-"));
    const preflight = evaluateRunPreflight(base);
    await expect(persistRunPreflight(root, preflight)).resolves.toMatchObject({ created: true, preflight });
    await expect(persistRunPreflight(root, preflight)).resolves.toMatchObject({ created: false, preflight });
    await expect(readRunPreflight(root, preflight.runId)).resolves.toEqual(preflight);
    const replacement = evaluateRunPreflight({ ...base, objective: "different objective" });
    await expect(persistRunPreflight(root, replacement)).rejects.toThrow("RUN_PREFLIGHT_IMMUTABLE");
  });
});
