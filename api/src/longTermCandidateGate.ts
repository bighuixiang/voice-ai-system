export function evaluateNearFarCandidate(input: { candidateId: string; nearTermQuality: number; longTermEvidenceRefs: readonly string[]; povKnowledgePassed: boolean; }) : { status: "eligible" | "isolated"; preserveScope: string; reasons: string[] } {
  if (!input.candidateId.trim() || !Number.isFinite(input.nearTermQuality)) throw new Error("NEAR_FAR_CANDIDATE_FIELDS_REQUIRED");
  const reasons = [...(!input.longTermEvidenceRefs.length ? ["LONG_TERM_EVIDENCE_MISSING"] : []), ...(!input.povKnowledgePassed ? ["POV_KNOWLEDGE_FAILURE"] : [])];
  return reasons.length ? { status: "isolated", preserveScope: "near-term-dialogue-rhythm-only", reasons } : { status: "eligible", preserveScope: "near-and-long-term", reasons: [] };
}
