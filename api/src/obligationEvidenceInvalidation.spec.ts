import { describe, expect, it } from "vitest";
import { evaluateObligationEvidenceInvalidation } from "./obligationEvidenceInvalidation.js";

describe("obligation evidence invalidation", () => {
  it("invalidates payoff and completion when the original setup anchor disappears", () => {
    const result = evaluateObligationEvidenceInvalidation({ obligationId: "obl-1", priorStatus: "paid", setupEvidenceRefs: ["prose://ch-1#p-4"], currentEvidenceRefs: ["prose://ch-7#p-2"], sameTermRefs: ["prose://ch-7#p-2"] });
    expect(result).toMatchObject({ status: "evidence_invalidated", deletedEvidenceRefs: ["prose://ch-1#p-4"], staleArtifactRefs: ["obligation://payoff/obl-1", "completion://obligation/obl-1"] });
    expect(result.reasons).toContain("SAME_TERM_IS_NOT_RELOCATION_EVIDENCE");
  });

  it("keeps a precisely preserved anchor current", () => {
    const result = evaluateObligationEvidenceInvalidation({ obligationId: "obl-2", priorStatus: "setup", setupEvidenceRefs: ["prose://ch-1#p-4"], currentEvidenceRefs: ["prose://ch-1#p-4"] });
    expect(result).toMatchObject({ status: "current", deletedEvidenceRefs: [], staleArtifactRefs: [] });
  });
});
