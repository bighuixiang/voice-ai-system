import crypto from "node:crypto";

export interface CandidateComparison {
  schemaVersion: "candidate-comparison.v1";
  status: "ready" | "blocked";
  objectiveIds: string[];
  rejected: Array<{ candidateId: string; hardConstraintFailures: string[] }>;
  ranked: Array<{ candidateId: string; objectiveEvidence: Array<{ objectiveId: string; gap: number; evidenceRefs: string[] }>; unresolvedRisks: string[] }>;
  recommendation?: string;
  reasons: string[];
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function compareCandidates(input: { objectiveIds: string[]; candidates: Array<{ candidateId: string; hardConstraintFailures: string[]; objectiveEvidence: Array<{ objectiveId: string; gap: number; evidenceRefs: string[] }>; unresolvedRisks: string[] }> }): CandidateComparison {
  if (input.objectiveIds.length < 1 || input.objectiveIds.length > 4 || input.objectiveIds.some((id) => !id.trim())) throw new Error("CANDIDATE_COMPARISON_OBJECTIVES_INVALID");
  if (!input.candidates.length) throw new Error("CANDIDATE_COMPARISON_CANDIDATES_REQUIRED");
  const rejected = input.candidates.filter((candidate) => candidate.hardConstraintFailures.length).map((candidate) => ({ candidateId: candidate.candidateId, hardConstraintFailures: [...candidate.hardConstraintFailures] }));
  const reasons: string[] = [];
  const ranked = input.candidates.filter((candidate) => !candidate.hardConstraintFailures.length).map((candidate) => {
    const objectiveEvidence = input.objectiveIds.map((objectiveId) => candidate.objectiveEvidence.find((item) => item.objectiveId === objectiveId) || { objectiveId, gap: 1, evidenceRefs: [] });
    if (objectiveEvidence.some((item) => !item.evidenceRefs.length)) reasons.push("OBJECTIVE_EVIDENCE_MISSING");
    return { candidateId: candidate.candidateId, objectiveEvidence, unresolvedRisks: [...candidate.unresolvedRisks] };
  }).sort((left, right) => left.objectiveEvidence.reduce((sum, item) => sum + item.gap, 0) - right.objectiveEvidence.reduce((sum, item) => sum + item.gap, 0));
  if (!ranked.length) reasons.push("ALL_CANDIDATES_HARD_CONSTRAINT_FAILED");
  const base = { schemaVersion: "candidate-comparison.v1" as const, status: reasons.length ? "blocked" as const : "ready" as const, objectiveIds: [...input.objectiveIds], rejected, ranked, ...(ranked[0] ? { recommendation: ranked[0].candidateId } : {}), reasons: [...new Set(reasons)] };
  return { ...base, fingerprint: hash(base) };
}
