import { describe, expect, it } from "vitest";
import { evaluateRp4OutlineAcceptance } from "./rp4OutlineAcceptance.js";

const ids = ["FR-ARCH-002", "FR-CHAR-004", "FR-WORLD-004"];

describe("RP4 outline acceptance", () => {
  it("blocks a complete outline map when RP3 dependency is not accepted", () => {
    const decision = evaluateRp4OutlineAcceptance({ expectedRequirementIds: ids, verifiedRequirementIds: ids, rp3Status: "do-not-activate", authorAcceptance: { status: "accepted", actorId: "author", authorizationId: "auth", evidenceRefs: ["author://acceptance"] }, releaseEvidence: { status: "present", evidenceRefs: ["evidence://rp4"] } });
    expect(decision).toMatchObject({ status: "do-not-activate", rp3Dependency: "blocked" });
    expect(decision.blockedReasons).toContain("RP3_DEPENDENCY_NOT_ACCEPTED");
  });

  it("requires explicit author and release evidence in addition to requirement coverage", () => {
    const decision = evaluateRp4OutlineAcceptance({ expectedRequirementIds: ids, verifiedRequirementIds: ids, rp3Status: "accepted" });
    expect(decision.status).toBe("do-not-activate");
    expect(decision.blockedReasons).toEqual(expect.arrayContaining(["AUTHOR_ACCEPTANCE_REQUIRED", "RP4_RELEASE_EVIDENCE_REQUIRED"]));
  });
});
