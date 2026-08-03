import { describe, expect, it } from "vitest";
import { reportAestheticEvidence } from "./aestheticEvidence.js";

describe("aesthetic evidence", () => {
  it("reports uncertainty instead of inventing a precise resonance score", () => {
    expect(reportAestheticEvidence({ dimension: "余韵", blindSelectionEvidence: ["blind://1"], proseEvidence: ["chapter://1#end"], stableScale: false })).toMatchObject({ status: "uncertain", preciseScore: null, uncertainty: ["NO_STABLE_PRECISE_SCALE"] });
  });
});
