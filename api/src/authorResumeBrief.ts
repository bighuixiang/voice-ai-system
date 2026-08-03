import type { CreativeSession } from "./creativeSession.js";
import type { DecisionRecord, DialogueQuestion } from "./dialogueQuestions.js";
import crypto from "node:crypto";

export interface AuthorResumeBrief {
  schemaVersion: "author-resume-brief.v1";
  projectSlug: string;
  sessionFingerprint: string;
  lastDirection: string;
  adoptedDecisions: Array<{ decisionId: string; questionId: string; text: string }>;
  confirmedBoundaries: Array<{ decisionId: string; questionId: string; text: string }>;
  systemDecisions: string[];
  currentSoleRisk: string | null;
  activeQuestion: { questionId: string; questionVersion: number; text: string; whyNow: string } | null;
  executingTaskRefs: string[];
  isolatedTaskRefs: string[];
  unresolvedRisks: string[];
  reviewableResults: string[];
  sourceRefs: string[];
  recommendedNextStep: string;
  fingerprint: string;
}

const hash = (value: unknown): string => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function assertAuthorResumeBriefIntegrity(brief: AuthorResumeBrief, expectedSessionFingerprint?: string): void {
  if (brief.schemaVersion !== "author-resume-brief.v1" || !brief.projectSlug.trim() || !brief.sessionFingerprint.trim()) throw new Error("AUTHOR_RESUME_BRIEF_FIELDS_INVALID");
  if (expectedSessionFingerprint !== undefined && brief.sessionFingerprint !== expectedSessionFingerprint) throw new Error("AUTHOR_RESUME_BRIEF_SESSION_MISMATCH");
  if (!brief.lastDirection.trim() || !brief.recommendedNextStep.trim()) throw new Error("AUTHOR_RESUME_BRIEF_FIELDS_INVALID");
  if (!Array.isArray(brief.adoptedDecisions) || !Array.isArray(brief.confirmedBoundaries) || !Array.isArray(brief.systemDecisions) || !Array.isArray(brief.reviewableResults) || !Array.isArray(brief.sourceRefs)) throw new Error("AUTHOR_RESUME_BRIEF_FIELDS_INVALID");
  if (brief.currentSoleRisk !== null && !brief.currentSoleRisk.trim()) throw new Error("AUTHOR_RESUME_BRIEF_FIELDS_INVALID");
  if (brief.adoptedDecisions.some((item) => !item.decisionId.trim() || !item.questionId.trim() || !item.text.trim()) || brief.systemDecisions.some((item) => !item.trim()) || brief.reviewableResults.some((item) => !item.trim()) || brief.sourceRefs.some((item) => !item.trim())) throw new Error("AUTHOR_RESUME_BRIEF_FIELDS_INVALID");
  const { fingerprint: _fingerprint, ...base } = brief;
  if (!/^[a-f0-9]{64}$/i.test(brief.fingerprint) || hash(base) !== brief.fingerprint) throw new Error("AUTHOR_RESUME_BRIEF_INTEGRITY_FAILED");
}

export function buildAuthorResumeBrief(input: {
  session: CreativeSession;
  questions: DialogueQuestion[];
  decisions: DecisionRecord[];
  executingTaskRefs?: string[];
  isolatedTaskRefs?: string[];
}): AuthorResumeBrief {
  const active = input.questions.find((question) => question.status === "active") || null;
  const confirmed = input.decisions.filter((decision) => decision.answerStatus === "confirmed" && decision.status === "recorded");
  const systemDecisions = input.session.messages
    .filter((message) => message.role === "system" || message.role === "task")
    .slice(-5)
    .map((message) => message.text);
  const unresolvedRisks = [...input.session.unconfirmedAssumptions, ...(active ? [active.errorCost] : [])];
  const base: Omit<AuthorResumeBrief, "fingerprint"> = {
    schemaVersion: "author-resume-brief.v1",
    projectSlug: input.session.projectSlug,
    sessionFingerprint: input.session.fingerprint,
    lastDirection: input.session.latestDirection,
    adoptedDecisions: confirmed.map((decision) => ({ decisionId: decision.decisionId, questionId: decision.questionId, text: decision.answerText })),
    confirmedBoundaries: confirmed.map((decision) => ({ decisionId: decision.decisionId, questionId: decision.questionId, text: decision.answerText })),
    systemDecisions,
    currentSoleRisk: unresolvedRisks[0] || null,
    activeQuestion: active ? { questionId: active.questionId, questionVersion: active.questionVersion, text: active.text, whyNow: active.whyNow } : null,
    executingTaskRefs: [...(input.executingTaskRefs || [])],
    isolatedTaskRefs: [...(input.isolatedTaskRefs || [])],
    unresolvedRisks,
    reviewableResults: [...(input.executingTaskRefs || []), ...(input.isolatedTaskRefs || []), ...input.session.pendingPatchRefs],
    sourceRefs: [
      `session://${input.session.sessionId}@${input.session.fingerprint}`,
      ...confirmed.map((decision) => `decision://${decision.decisionId}`),
      ...(active ? [`question://${active.questionId}@${active.questionVersion}`] : [])
    ],
    recommendedNextStep: active ? `answer:${active.questionId}` : input.session.pendingPatchRefs[0] ? `review:${input.session.pendingPatchRefs[0]}` : "continue"
  };
  return { ...base, fingerprint: hash(base) };
}
