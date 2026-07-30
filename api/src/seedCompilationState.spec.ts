import { describe, expect, it } from "vitest";
import { createSeedCompilationState, recordSeedCompilationFailure } from "./seedCompilationState.js";

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
});
