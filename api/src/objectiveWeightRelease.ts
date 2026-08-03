import crypto from "node:crypto";
export interface ObjectiveWeightRelease { releaseId: string; version: number; stage: string; weights: Record<string, number>; basisRefs: string[]; publishedAt: string; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createObjectiveWeightRelease(input: { releaseId: string; version: number; stage: string; weights: Record<string, number>; basisRefs: readonly string[]; publishedAt: string }): ObjectiveWeightRelease {
  if (!input.releaseId.trim() || !Number.isInteger(input.version) || input.version < 1 || !input.stage.trim() || !Object.keys(input.weights).length || !input.basisRefs.length || !input.publishedAt.trim()) throw new Error("OBJECTIVE_WEIGHT_RELEASE_FIELDS_REQUIRED");
  const base = { releaseId: input.releaseId, version: input.version, stage: input.stage, weights: { ...input.weights }, basisRefs: [...input.basisRefs], publishedAt: input.publishedAt };
  return { ...base, fingerprint: hash(base) };
}
export function explainCandidateWithRelease(input: { candidateId: string; candidateCreatedVersion: number; release: ObjectiveWeightRelease }): { candidateId: string; evaluatedWithVersion: number; historical: boolean; weights: Record<string, number> } {
  return { candidateId: input.candidateId, evaluatedWithVersion: input.candidateCreatedVersion, historical: input.candidateCreatedVersion !== input.release.version, weights: { ...input.release.weights } };
}
