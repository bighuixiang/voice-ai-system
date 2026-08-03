export function evaluateObjectiveCandidate(input: { candidateId: string; preferenceScore: number; hardFactsPassed: boolean; povKnowledgePassed: boolean; }): { status: "eligible" | "rejected"; score: number; reasons: string[] } {
  if (!input.candidateId.trim() || !Number.isFinite(input.preferenceScore)) throw new Error("OBJECTIVE_CANDIDATE_FIELDS_REQUIRED");
  const reasons = [!input.hardFactsPassed ? "HARD_FACT_FAILURE" : "", !input.povKnowledgePassed ? "POV_KNOWLEDGE_FAILURE" : ""].filter(Boolean);
  return reasons.length ? { status: "rejected", score: 0, reasons } : { status: "eligible", score: input.preferenceScore, reasons: [] };
}
