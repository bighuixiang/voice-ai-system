import { describe, expect, it } from "vitest";
import { createProseGenerationManifest, evaluateProseCandidateFreshness } from "./proseGenerationManifest.js";

const valid = { manifestId: "manifest-1", storyContractRef: "contract:v3", outlineVersion: "outline:v2", chapterIntentRef: "intent:ch-1", sceneCardRefs: ["scene:1"], characterStateRefs: ["state:hero:v4"], povStateRef: "pov:hero:v2", obligationRefs: ["obl:FS-1"], authorLockRefs: ["lock:p-1"], craftPatternRefs: ["craft:choice-cost:v1"], latestAuthorDirection: "make trust cost visible", proseBaselineRef: "prose:ch-1:v7", planningHorizonRef: "horizon:v2", contextManifestRef: "context:v5", sourceRefs: ["manifest://1"] };

describe("prose generation manifest", () => {
  it("freezes all required generation references", () => {
    const manifest = createProseGenerationManifest(valid);
    expect(manifest.status).toBe("frozen");
    expect(evaluateProseCandidateFreshness(manifest, manifest.fingerprint)).toBe("fresh");
  });

  it("marks candidate stale when any referenced manifest changes", () => {
    const manifest = createProseGenerationManifest(valid);
    expect(evaluateProseCandidateFreshness(manifest, "changed-fingerprint")).toBe("stale");
  });

  it("rejects incomplete references", () => {
    expect(() => createProseGenerationManifest({ ...valid, sceneCardRefs: [] })).toThrow("PROSE_MANIFEST_REFERENCE_REQUIRED");
    expect(() => createProseGenerationManifest({ ...valid, latestAuthorDirection: "" })).toThrow("PROSE_MANIFEST_DIRECTION_REQUIRED");
  });
});
