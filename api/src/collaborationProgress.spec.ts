import { describe, expect, it } from "vitest";
import { createCollaborationProgress } from "./collaborationProgress.js";

describe("collaboration progress", () => {
  it("reports understanding, changed assets, risks and next action", () => {
    const progress = createCollaborationProgress({ understood: ["core ending"], progressing: ["chapter 1"], changedAssets: ["outline"], risks: ["voice drift"], nextAutoAction: "run continuity check", authorDecisionNeeded: ["ending canon"] });
    expect(progress.schemaVersion).toBe("collaboration-progress.v1");
    expect(progress.changedAssets).toContain("outline");
    expect(progress.fingerprint).toHaveLength(64);
  });
});
