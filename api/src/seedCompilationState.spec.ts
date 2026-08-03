import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { advanceSeedCompilationAfterInterpretation, createSeedCompilationState, deriveSeedStateAfterAdoption, deriveSeedStateAfterRevocation, persistSeedCompilationState, readSeedCompilationState, recordSeedCompilationFailure } from "./seedCompilationState.js";

describe("seed compilation lifecycle", () => {
  it("does not claim a story skeleton when only a project container exists", () => {
    const state = createSeedCompilationState({ projectId: "demo", status: "seed_captured", stableUnderstandingFingerprint: undefined });
    expect(state.status).toBe("seed_captured");
    expect(state.storySkeletonReady).toBe(false);
  });

  it("keeps the last stable understanding and exposes a recovery action on failure", () => {
    const state = createSeedCompilationState({ projectId: "demo", status: "interpreting", stableUnderstandingFingerprint: "stable-1" });
    const failed = recordSeedCompilationFailure(state, { layer: "evidence-span", message: "span out of range", recoveryAction: "re-run span validation" });
    expect(failed.status).toBe("repair_required");
    expect(failed.stableUnderstandingFingerprint).toBe("stable-1");
    expect(failed.recoveryAction).toBe("re-run span validation");
  });

  it("persists and restores the state, while rejecting a tampered fingerprint", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "seed-state-"));
    const state = createSeedCompilationState({ projectId: "demo", status: "interpreting", stableUnderstandingFingerprint: "stable-1" });
    await persistSeedCompilationState(root, state);
    await expect(readSeedCompilationState(root, "demo")).resolves.toEqual(state);
    await fs.writeFile(path.join(root, "sessions", "seed-compilation-state.json"), JSON.stringify({ ...state, status: "contract_ready" }), "utf8");
    await expect(readSeedCompilationState(root, "demo")).rejects.toThrow("SEED_COMPILATION_STATE_INTEGRITY_FAILED");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("derives the next state from interpretation evidence instead of caller status", () => {
    const captured = createSeedCompilationState({ projectId: "demo", status: "seed_captured" });
    expect(advanceSeedCompilationAfterInterpretation(captured, "unresolved")).toMatchObject({ status: "clarification_required", storySkeletonReady: false });
    expect(advanceSeedCompilationAfterInterpretation(captured, "resolved")).toMatchObject({ status: "contract_candidate_ready", storySkeletonReady: false });
  });

  it("does not claim partial adoption when every candidate was rejected", () => {
    const pending = createSeedCompilationState({ projectId: "demo", status: "clarification_required" });
    expect(deriveSeedStateAfterAdoption(pending, false)).toMatchObject({ status: "clarification_required", storySkeletonReady: false });
    expect(deriveSeedStateAfterAdoption(pending, true)).toMatchObject({ status: "contract_partially_adopted", storySkeletonReady: true });
  });

  it("rolls a partially adopted state back to clarification after revocation", () => {
    const partial = createSeedCompilationState({ projectId: "demo", status: "contract_partially_adopted" });
    expect(deriveSeedStateAfterRevocation(partial)).toMatchObject({ status: "clarification_required", storySkeletonReady: false });
  });
});
