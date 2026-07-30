import crypto from "node:crypto";

export interface RankedDialogueQuestions { schemaVersion: "dialogue-question-ranking.v1"; activeQuestionId: string | null; ranking: Array<{ questionId: string; score: number; skipped: boolean; reason: string }>; fingerprint: string; }
export interface NonLeadingQuestion { schemaVersion: "non-leading-question.v1"; questionId: string; knownEvidence: string[]; whyNow: string; options: Array<{ label: string; impact: string }>; recommendation: string; freeAnswerAllowed: true; fingerprint: string; }
export interface ProvisionalAssumption { schemaVersion: "provisional-assumption.v1"; assumptionId: string; basis: string; assets: string[]; allowedActions: string[]; expiry: string; risk: string; revocationRoute: string; status: "provisional"; fingerprint: string; }
export interface DelegationGrant { schemaVersion: "delegation-grant.v1"; grantId: string; scope: string[]; expiresAt: string; rationale: string; revocable: true; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function rankDialogueQuestions(input: readonly Array<{ questionId: string; ambiguity: number; errorCost: number; impact: number; reversibility: number; delayCost: number; evidenceCoverage: number; authorBurden: number }>): RankedDialogueQuestions {
  if (!input.length) throw new Error("DIALOGUE_QUESTIONS_REQUIRED");
  const ranking = input.map((question) => ({ questionId: question.questionId, score: Number(((question.ambiguity * 0.2 + question.errorCost * 0.25 + question.impact * 0.3 + (1 - question.reversibility) * 0.1 + question.delayCost * 0.15) * (1 - question.evidenceCoverage) / Math.max(0.1, question.authorBurden)).toFixed(4)), skipped: false, reason: "highest expected value" })).sort((left, right) => right.score - left.score);
  const activeQuestionId = ranking[0]?.questionId ?? null;
  const base = { schemaVersion: "dialogue-question-ranking.v1" as const, activeQuestionId, ranking: ranking.map((item, index) => index === 0 ? item : { ...item, skipped: true, reason: "single active blocking question" }) };
  return { ...base, fingerprint: hash(base) };
}

export function renderNonLeadingQuestion(input: { questionId: string; knownEvidence: readonly string[]; whyNow: string; options: readonly Array<{ label: string; impact: string }>; recommendation: string }): NonLeadingQuestion {
  if (!input.questionId.trim() || !input.knownEvidence.length || !input.whyNow.trim() || input.options.length < 2 || input.options.length > 3 || !input.recommendation.trim()) throw new Error("DIALOGUE_QUESTION_RENDER_INVALID");
  const base = { schemaVersion: "non-leading-question.v1" as const, questionId: input.questionId, knownEvidence: [...input.knownEvidence], whyNow: input.whyNow, options: input.options.map((option) => ({ ...option })), recommendation: input.recommendation, freeAnswerAllowed: true as const };
  return { ...base, fingerprint: hash(base) };
}

export function createProvisionalAssumption(input: Omit<ProvisionalAssumption, "schemaVersion" | "status" | "fingerprint">): ProvisionalAssumption {
  const forbidden = new Set(["ending", "character-death", "major-relationship", "copyright-boundary"]);
  if (!input.assumptionId.trim() || !input.basis.trim() || !input.assets.length || !input.allowedActions.length || !input.expiry.trim() || !input.risk.trim() || !input.revocationRoute.trim()) throw new Error("PROVISIONAL_FIELDS_REQUIRED");
  if (input.assets.some((asset) => forbidden.has(asset)) || input.allowedActions.some((action) => action.includes("ending"))) throw new Error("PROVISIONAL_SCOPE_FORBIDDEN");
  const base = { schemaVersion: "provisional-assumption.v1" as const, ...input, assets: [...input.assets], allowedActions: [...input.allowedActions], status: "provisional" as const };
  return { ...base, fingerprint: hash(base) };
}

export function createDelegationGrant(input: Omit<DelegationGrant, "schemaVersion" | "revocable" | "fingerprint">): DelegationGrant {
  if (!input.grantId.trim() || !input.scope.length || !input.expiresAt.trim() || !input.rationale.trim()) throw new Error("DELEGATION_FIELDS_REQUIRED");
  if (input.scope.some((scope) => ["copyright", "privacy", "budget", "l2-hard-gate"].includes(scope))) throw new Error("DELEGATION_SCOPE_FORBIDDEN");
  const base = { schemaVersion: "delegation-grant.v1" as const, ...input, scope: [...input.scope], revocable: true as const };
  return { ...base, fingerprint: hash(base) };
}
