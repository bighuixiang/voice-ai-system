import { describe, expect, it } from "vitest";
import { updatePreferenceHypothesis } from "./preferenceHypothesis.js";

describe("preference hypothesis", () => {
  it("retains counter-evidence and narrows a short-sentence preference by context", () => {
    const result = updatePreferenceHypothesis({ hypothesis: { hypothesisId: "short", text: "偏好短句", supports: ["author://s1", "author://s2", "author://s3"], counterEvidence: [], scope: "work", status: "active" }, evidenceRef: "author://lyric-1", evidenceKind: "counter", context: "lyrical-scene" });
    expect(result).toMatchObject({ counterEvidence: ["author://lyric-1"], scope: "work;excluded:lyrical-scene", status: "active" });
  });
});
