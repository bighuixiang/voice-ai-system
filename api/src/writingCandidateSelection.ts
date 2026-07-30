import crypto from "node:crypto";

export interface WritingCandidate { candidateId: string; content: string; scores: Record<string, number>; risks: string[]; sourceRefs: string[]; }
export interface WritingCandidateSet { schemaVersion: "writing-candidate-set.v1"; setId: string; sceneId: string; candidates: WritingCandidate[]; selectionCriteria: string[]; sourceRefs: string[]; status: "candidate"; fingerprint: string; }
export interface WritingSelection { schemaVersion: "writing-selection.v1"; setId: string; selectedCandidateId: string; rationale: string; evidenceRefs: string[]; status: "selected"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createWritingCandidateSet(input: Omit<WritingCandidateSet, "schemaVersion" | "status" | "fingerprint">): WritingCandidateSet {
  if (!input.setId.trim() || !input.sceneId.trim()) throw new Error("WRITING_CANDIDATE_FIELDS_REQUIRED");
  if (input.candidates.length < 2) throw new Error("WRITING_CANDIDATES_REQUIRED");
  if (!input.selectionCriteria.length) throw new Error("WRITING_SELECTION_CRITERIA_REQUIRED");
  if (!input.sourceRefs.length || input.candidates.some((candidate) => !candidate.content.trim() || !candidate.sourceRefs.length)) throw new Error("WRITING_CANDIDATE_SOURCE_REQUIRED");
  const base = { schemaVersion: "writing-candidate-set.v1" as const, ...input, candidates: input.candidates.map((candidate) => ({ ...candidate, risks: [...candidate.risks], sourceRefs: [...candidate.sourceRefs], scores: { ...candidate.scores } })), selectionCriteria: [...input.selectionCriteria], sourceRefs: [...input.sourceRefs], status: "candidate" as const };
  return { ...base, fingerprint: hash(base) };
}
export function selectWritingCandidate(set: WritingCandidateSet, input: { candidateId: string; rationale: string; evidenceRefs: readonly string[] }): WritingSelection {
  if (!set.candidates.some((candidate) => candidate.candidateId === input.candidateId)) throw new Error("WRITING_CANDIDATE_NOT_FOUND");
  if (!input.rationale.trim() || !input.evidenceRefs.length) throw new Error("WRITING_SELECTION_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "writing-selection.v1" as const, setId: set.setId, selectedCandidateId: input.candidateId, rationale: input.rationale, evidenceRefs: [...input.evidenceRefs], status: "selected" as const };
  return { ...base, fingerprint: hash(base) };
}
