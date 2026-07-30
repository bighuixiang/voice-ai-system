import crypto from "node:crypto";

export interface CandidateComposition { schemaVersion: "candidate-composition.v1"; compositionId: string; sceneId: string; segments: Array<{ segmentId: string; sourceCandidateId: string; text: string; rationale: string }>; provenance: Array<{ segmentId: string; sourceCandidateId: string; rationale: string }>; conflicts: Array<{ segmentId: string; candidateIds: string[]; issue: string }>; blockers: string[]; status: "composed" | "blocked"; evidenceRefs: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function composeWritingCandidates(input: Omit<CandidateComposition, "schemaVersion" | "provenance" | "blockers" | "status" | "fingerprint">): CandidateComposition {
  if (!input.compositionId.trim() || !input.sceneId.trim() || !input.segments.length) throw new Error("CANDIDATE_COMPOSITION_FIELDS_REQUIRED");
  if (!input.evidenceRefs.length) throw new Error("CANDIDATE_COMPOSITION_EVIDENCE_REQUIRED");
  if (input.segments.some((segment) => !segment.segmentId.trim() || !segment.sourceCandidateId.trim() || !segment.text.trim())) throw new Error("CANDIDATE_COMPOSITION_SEGMENT_REQUIRED");
  if (input.segments.some((segment) => !segment.rationale.trim())) throw new Error("CANDIDATE_COMPOSITION_RATIONALE_REQUIRED");
  const blockers = input.conflicts.length ? ["CANDIDATE_COMPOSITION_CONFLICT"] : [];
  const segments = input.segments.map((segment) => ({ ...segment })); const provenance = segments.map((segment) => ({ segmentId: segment.segmentId, sourceCandidateId: segment.sourceCandidateId, rationale: segment.rationale }));
  const base = { schemaVersion: "candidate-composition.v1" as const, compositionId: input.compositionId, sceneId: input.sceneId, segments, provenance, conflicts: input.conflicts.map((conflict) => ({ ...conflict, candidateIds: [...conflict.candidateIds] })), blockers, status: blockers.length ? "blocked" as const : "composed" as const, evidenceRefs: [...input.evidenceRefs] };
  return { ...base, fingerprint: hash(base) };
}
