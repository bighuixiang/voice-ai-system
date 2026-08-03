import { describe, expect, it } from "vitest";
import { evaluateRp3ContractAcceptance } from "./rp3ContractAcceptance.js";

const requirements = ["FR-ARCH-001", "FR-CHAR-001", "FR-DELIVERY-016"];

describe("RP3 contract acceptance", () => {
  it("fails closed when a complete implementation has no author or real-provider evidence", () => {
    const decision = evaluateRp3ContractAcceptance({ expectedRequirementIds: requirements, verifiedRequirementIds: requirements });
    expect(decision).toMatchObject({ status: "do-not-activate", expectedRequirementCount: 3, verifiedRequirementCount: 3, authorAcceptance: "missing", realProviderEvidence: "missing", blockedReasons: ["AUTHOR_ACCEPTANCE_REQUIRED", "REAL_PROVIDER_EVIDENCE_REQUIRED"] });
  });

  it("accepts only a complete, explicitly signed, real-provider-backed profile", () => {
    const decision = evaluateRp3ContractAcceptance({ expectedRequirementIds: requirements, verifiedRequirementIds: requirements, authorAcceptance: { status: "accepted", actorId: "author-1", authorizationId: "rp3-final-1", evidenceRefs: ["decision://rp3/final"] }, realProviderEvidence: { status: "present", providerRef: "provider://paid/v1", evidenceRefs: ["audit://provider/rp3-v1"] } });
    expect(decision).toMatchObject({ status: "accepted", authorAcceptance: "accepted", realProviderEvidence: "present", blockedReasons: [] });
    expect(decision.fingerprint).toHaveLength(64);
  });
});
