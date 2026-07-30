import crypto from "node:crypto";

export interface SeedBranchQuestionResult { schemaVersion: "seed-branch-question.v1"; questionId: string; active: boolean; expectedInformationGain: number; affectedFields: string[]; whyNotAsked: string[]; reason?: "NO_MATERIAL_DIFFERENCE"; fingerprint: string; }
export interface SeedContractCandidates { schemaVersion: "seed-contract-candidates.v1"; sharedFacts: string[]; candidates: Array<{ candidateId: string; sharedFacts: string[]; assumptions: string[]; resolvedUnknowns: string[]; causalCommitments: string[]; reworkIfWrong: string }>; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateSeedBranchQuestion(input: { questionId: string; answers: readonly Array<{ answer: string; affectedFields: readonly string[]; branchSignature: string }>; ignoredQuestions?: readonly string[] }): SeedBranchQuestionResult {
  if (!input.questionId.trim() || input.answers.length < 2) throw new Error("SEED_BRANCH_QUESTION_INVALID");
  const signatures = [...new Set(input.answers.map((answer) => answer.branchSignature))];
  const affectedFields = [...new Set(input.answers.flatMap((answer) => answer.affectedFields))];
  const active = signatures.length > 1;
  const base = { schemaVersion: "seed-branch-question.v1" as const, questionId: input.questionId, active, expectedInformationGain: Number(((signatures.length - 1) / signatures.length).toFixed(4)), affectedFields, whyNotAsked: active ? [...(input.ignoredQuestions ?? [])] : [], ...(active ? {} : { reason: "NO_MATERIAL_DIFFERENCE" as const }) };
  return { ...base, fingerprint: hash(base) };
}

export function createSeedContractCandidates(input: { sharedFacts: readonly string[]; candidates: readonly Array<Omit<SeedContractCandidates["candidates"][number], "sharedFacts">> }): SeedContractCandidates {
  if (!input.sharedFacts.length || input.candidates.length < 1 || input.candidates.length > 3) throw new Error("SEED_CANDIDATE_COUNT_INVALID");
  for (const candidate of input.candidates) if (!candidate.candidateId.trim() || !candidate.assumptions.length || !candidate.causalCommitments.length || !candidate.reworkIfWrong.trim()) throw new Error("SEED_CANDIDATE_ATTRIBUTION_REQUIRED");
  const base = { schemaVersion: "seed-contract-candidates.v1" as const, sharedFacts: [...input.sharedFacts], candidates: input.candidates.map((candidate) => ({ ...candidate, sharedFacts: [...input.sharedFacts], assumptions: [...candidate.assumptions], resolvedUnknowns: [...candidate.resolvedUnknowns], causalCommitments: [...candidate.causalCommitments] })) };
  return { ...base, fingerprint: hash(base) };
}
