import { describe, expect, it } from "vitest";
import { recordPartialPayoff, transformObligation, proposeObligationMerge, detectObligationConflict } from "./obligationResolution.js";

describe("obligation resolution safeguards", () => {
  it("keeps remaining subclaims when a payoff is only partial", () => {
    const result = recordPartialPayoff({ obligationId: "obl-1", answeredClaims: ["what opens"], remainingClaims: ["who built it"], newWindow: "chapter-8", evidenceRefs: ["manuscript://v1#20-40"] });
    expect(result.status).toBe("partially_paid");
    expect(result.remainingClaims).toContain("who built it");
  });

  it("preserves lineage and timing when transforming an obligation", () => {
    const result = transformObligation({ sourceObligationId: "obl-1", targetObligationId: "obl-2", targetType: "sequel_hook", reason: "answer opens a larger question", preservedClaims: ["door opens"], inheritedWindow: "volume-2" });
    expect(result.parentObligationId).toBe("obl-1");
    expect(result.preservedClaims).toContain("door opens");
  });

  it("proposes merge without silently deleting duplicate sources", () => {
    const merge = proposeObligationMerge({ obligationIds: ["obl-1", "obl-2"], sharedEntityRefs: ["door"], sourceRefs: ["scene://c1#s1", "scene://c2#s2"], payoffConditions: ["open", "explain"] });
    expect(merge.status).toBe("proposal");
    expect(merge.sourceRefs).toHaveLength(2);
  });
  it("rejects a merge that drops one obligation's distinct payoff condition", () => {
    expect(() => proposeObligationMerge({ obligationIds: ["obl-1", "obl-2"], sharedEntityRefs: ["mentor"], sourceRefs: ["scene://c1#s1", "scene://c2#s2"], payoffConditions: ["find body"] })).toThrow("OBLIGATION_MERGE_FIELDS_REQUIRED");
  });

  it("blocks incompatible canon obligations and reports alternatives", () => {
    const conflict = detectObligationConflict({ conflictId: "conf-1", obligations: [{ obligationId: "obl-1", requirement: "door opens", window: "chapter-5", knowledge: "reader-knows" }, { obligationId: "obl-2", requirement: "door never opens", window: "chapter-5", knowledge: "reader-knows" }], alternatives: ["reinterpret clue", "split answer"] });
    expect(conflict.status).toBe("blocked");
    expect(conflict.alternatives).toContain("split answer");
  });
});
