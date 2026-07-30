import crypto from "node:crypto";

export interface QuestionGovernance {
  schemaVersion: "question-governance.v1";
  projectId: string;
  maxBlockingQuestions: number;
  questions: Array<{
    questionId: string;
    text: string;
    normalizedText: string;
    impact: string;
    blocking: boolean;
    affectedAssets: string[];
    riskIfSkipped: string;
    recommendation: string;
    whyNow: string;
    canDefer: boolean;
    staleReason?: string;
  }>;
  policy: { decideForMe: string[]; alwaysAsk: string[]; askLess: boolean };
  fingerprint: string;
}

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalize = (text: string) => text.toLowerCase().replace(/[\s?？。！,，]/g, "");

export function createQuestionGovernance(input: { projectId: string; maxBlockingQuestions: number; policy: QuestionGovernance["policy"] }): QuestionGovernance {
  if (!input.projectId.trim() || input.maxBlockingQuestions < 1) throw new Error("QUESTION_GOVERNANCE_FIELDS_REQUIRED");
  const base = { schemaVersion: "question-governance.v1" as const, projectId: input.projectId, maxBlockingQuestions: input.maxBlockingQuestions, questions: [], policy: { ...input.policy, decideForMe: [...input.policy.decideForMe], alwaysAsk: [...input.policy.alwaysAsk] } };
  return { ...base, fingerprint: hash(base) };
}

export function registerQuestion(governance: QuestionGovernance, input: { questionId: string; text: string; impact: string; blocking: boolean; affectedAssets: readonly string[]; riskIfSkipped: string; recommendation: string; canDefer: boolean; staleReason?: string }): QuestionGovernance {
  if (!input.questionId.trim() || !input.text.trim() || !input.impact.trim() || !input.affectedAssets.length || !input.riskIfSkipped.trim() || !input.recommendation.trim()) throw new Error("QUESTION_FIELDS_REQUIRED");
  if (input.blocking && governance.questions.filter((question) => question.blocking).length >= governance.maxBlockingQuestions) throw new Error("QUESTION_BUDGET_EXCEEDED");
  const normalizedText = normalize(input.text);
  const duplicate = governance.questions.find((question) => question.normalizedText === normalizedText);
  if (duplicate && !input.staleReason?.trim()) throw new Error("QUESTION_DUPLICATE");
  const whyNow = `Ask now because ${input.affectedAssets.join(", ")} is affected; skipping risks ${input.riskIfSkipped}. Recommendation: ${input.recommendation}. ${input.canDefer ? "Can defer." : "Should not defer safely."}`;
  const questions = [...governance.questions, { ...input, normalizedText, affectedAssets: [...input.affectedAssets], whyNow }];
  const base = { ...governance, questions, policy: { ...governance.policy } };
  return { ...base, fingerprint: hash(base) };
}

export function updateCollaborationPolicy(governance: QuestionGovernance, policy: QuestionGovernance["policy"]): QuestionGovernance {
  const base = { ...governance, policy: { ...policy, decideForMe: [...policy.decideForMe], alwaysAsk: [...policy.alwaysAsk] } };
  return { ...base, fingerprint: hash(base) };
}
