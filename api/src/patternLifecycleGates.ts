export function evaluateStructuralSimilarity(input: { lexicalSimilarity: number; relationshipSimilarity: number; revealOrderSimilarity: number; signatureSacrificeMatch: boolean }): { status: "allowed" | "quarantine"; reason?: string } {
  const structural = (input.relationshipSimilarity + input.revealOrderSimilarity) / 2;
  if (structural >= 0.8 || input.signatureSacrificeMatch) return { status: "quarantine", reason: "STRUCTURAL_SKELETON_MATCH" };
  return { status: "allowed" };
}

export function applyPatternScope(input: { authorAccepted: boolean; scope: "scene" | "project"; sourceSurfacePresent: boolean }): { status: "accepted" | "blocked"; validated: false; sourceSurfaceLearned: false; scope: "scene" | "project" } {
  if (!input.authorAccepted || input.sourceSurfacePresent) return { status: "blocked", validated: false, sourceSurfaceLearned: false, scope: input.scope };
  return { status: "accepted", validated: false, sourceSurfaceLearned: false, scope: input.scope };
}

export function detectNegativePattern(input: { narrationAnnouncesThreat: boolean; concreteConsequence: boolean; wordingChanged: boolean }): { status: "hit" | "counterexample" | "clear"; mechanism: string } {
  if (input.narrationAnnouncesThreat && !input.concreteConsequence) return { status: "hit", mechanism: "EMPTY_ESCALATION_ANNOUNCEMENT" };
  if (input.narrationAnnouncesThreat && input.concreteConsequence) return { status: "counterexample", mechanism: "CONSEQUENCE_BACKED_ESCALATION" };
  return { status: "clear", mechanism: "" };
}

export function createCraftLineageAudit(input: { patternId: string; abstractMechanism: string; sourceFamilies: readonly string[]; evidenceSnapshots: readonly string[]; transferPlanId: string; qualification: string; similarityConclusion: string; authorAdopted: boolean; privateSourceNamesIncluded: boolean }): { status: "auditable" | "blocked"; exportSafe: boolean; missing: string[] } {
  const missing = [input.patternId, input.abstractMechanism, input.sourceFamilies.length ? "ok" : "", input.evidenceSnapshots.length ? "ok" : "", input.transferPlanId, input.qualification, input.similarityConclusion].filter((value) => !value || value === "ok" && false);
  return { status: missing.length ? "blocked" : "auditable", exportSafe: !input.privateSourceNamesIncluded, missing };
}

export function invalidateDerivedEvidence(input: { sourceStatus: "current" | "revoked" | "changed" | "unqualified"; published: boolean }): { status: "current" | "stale"; futureCallsAllowed: boolean; publishedClaim: "historical-fingerprint" | "none" } {
  if (input.sourceStatus !== "current") return { status: "stale", futureCallsAllowed: false, publishedClaim: input.published ? "historical-fingerprint" : "none" };
  return { status: "current", futureCallsAllowed: true, publishedClaim: "none" };
}
