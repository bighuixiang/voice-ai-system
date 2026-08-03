import { describe, expect, it } from "vitest";
import { issueCharacterArcCertificate } from "./characterArcCertificate.js";

const base = { arcId: "arc-1", characterId: "hero", targetChange: "accept reciprocal trust", startState: "isolated", currentBeliefOrValue: "trust can be reciprocal", openBoundaries: ["still fears abandonment"], publicationFingerprint: "manuscript-sha256", milestones: [{ milestoneId: "m1", choiceEvidenceId: "choice-1", actualChange: "protects ally", cost: "loses escape route", relationshipEvidenceRefs: ["relationship://1"], sourceRefs: ["chapter://1"] }], staleDependencyIds: [], sourceRefs: ["arc://1"] };
describe("character arc closure certificate", () => {
  it("issues a certificate only when actual evidence closes the planned arc", () => {
    const result = issueCharacterArcCertificate(base);
    expect(result.status).toBe("closed");
    expect(result.choiceEvidenceIds).toEqual(["choice-1"]);
  });

  it("blocks a target change without actual milestone, choice, cost, and relationship evidence", () => {
    const result = issueCharacterArcCertificate({ ...base, milestones: [{ ...base.milestones[0], actualChange: "", cost: "", relationshipEvidenceRefs: [] }] });
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(expect.arrayContaining(["ARC_TARGET_CHANGE_UNPROVEN", "ARC_COST_EVIDENCE_MISSING", "ARC_RELATIONSHIP_EVIDENCE_MISSING"]));
  });

  it("invalidates closure when upstream dependencies are stale", () => {
    const result = issueCharacterArcCertificate({ ...base, staleDependencyIds: ["revision-1"] });
    expect(result.status).toBe("blocked");
    expect(result.issues).toContain("ARC_UPSTREAM_DEPENDENCY_STALE");
  });

  it("requires current belief or value, open boundaries, and publication fingerprint", () => {
    expect(() => issueCharacterArcCertificate({ ...base, currentBeliefOrValue: "", publicationFingerprint: "" })).toThrow("ARC_CERTIFICATE_CLOSURE_FIELDS_REQUIRED");
    const result = issueCharacterArcCertificate(base);
    expect(result.currentBeliefOrValue).toBe("trust can be reciprocal");
    expect(result.openBoundaries).toEqual(["still fears abandonment"]);
    expect(result.publicationFingerprint).toBe("manuscript-sha256");
  });
});
