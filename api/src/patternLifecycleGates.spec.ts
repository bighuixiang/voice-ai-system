import { describe, expect, it } from "vitest";
import { applyPatternScope, createCraftLineageAudit, detectNegativePattern, evaluateStructuralSimilarity, invalidateDerivedEvidence } from "./patternLifecycleGates.js";
describe("pattern lifecycle gates", () => {
  it("quarantines low-lexical structural copies", () => { expect(evaluateStructuralSimilarity({ lexicalSimilarity: 0.1, relationshipSimilarity: 0.9, revealOrderSimilarity: 0.9, signatureSacrificeMatch: false }).status).toBe("quarantine"); });
  it("keeps author acceptance scene-scoped", () => { expect(applyPatternScope({ authorAccepted: true, scope: "scene", sourceSurfacePresent: false })).toMatchObject({ status: "accepted", validated: false, sourceSurfaceLearned: false }); });
  it("recognizes negative mechanism despite wording change", () => { expect(detectNegativePattern({ narrationAnnouncesThreat: true, concreteConsequence: false, wordingChanged: true }).status).toBe("hit"); });
  it("produces an export-safe craft lineage", () => { expect(createCraftLineageAudit({ patternId: "p", abstractMechanism: "m", sourceFamilies: ["f"], evidenceSnapshots: ["e"], transferPlanId: "t", qualification: "qualified", similarityConclusion: "clear", authorAdopted: true, privateSourceNamesIncluded: false }).status).toBe("auditable"); });
  it("stales future derivation after source revocation", () => { expect(invalidateDerivedEvidence({ sourceStatus: "revoked", published: true })).toEqual({ status: "stale", futureCallsAllowed: false, publishedClaim: "historical-fingerprint" }); });
});
