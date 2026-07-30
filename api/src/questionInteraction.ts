import crypto from "node:crypto";

export interface InteractiveQuestion { questionId: string; text: string; level: "L0" | "L1" | "L2"; options: string[]; recommended: string; affectedAssets: string[]; whyNow: string; reversible: boolean; }
export interface QuestionSession { schemaVersion: "question-session.v1"; projectId: string; questions: InteractiveQuestion[]; activeQuestionId: string | null; fingerprint: string; }
export interface ClassifiedAnswer { kind: "delegated" | "option" | "free-text" | "new-direction" | "unrelated"; text: string; chosenBy?: "delegated_to_system" | "author"; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createQuestionSession(input: { projectId: string; questions: readonly InteractiveQuestion[] }): QuestionSession {
  if (!input.projectId.trim()) throw new Error("QUESTION_SESSION_FIELDS_REQUIRED");
  if (input.questions.some((question) => question.level === "L2") && input.questions.filter((question) => question.level === "L2").length > 1) throw new Error("QUESTION_ACTIVE_L2_LIMIT");
  if (input.questions.some((question) => question.options.length > 3)) throw new Error("QUESTION_OPTIONS_LIMIT");
  const questions = input.questions.map((question) => ({ ...question, options: [...question.options], affectedAssets: [...question.affectedAssets] })); const activeQuestionId = questions.find((question) => question.level === "L2")?.questionId ?? null;
  const base = { schemaVersion: "question-session.v1" as const, projectId: input.projectId, questions, activeQuestionId };
  return { ...base, fingerprint: hash(base) };
}
export function classifyQuestionAnswer(question: InteractiveQuestion, text: string): ClassifiedAnswer {
  const normalized = text.trim(); if (!normalized) throw new Error("QUESTION_ANSWER_REQUIRED");
  if (/^(你决定|交给系统|you decide|up to you)$/iu.test(normalized)) return { kind: "delegated", text: normalized, chosenBy: "delegated_to_system" };
  if (question.options.includes(normalized)) return { kind: "option", text: normalized, chosenBy: "author" };
  if (/^(换个方向|new direction|change direction)\s*[:：]/iu.test(normalized)) return { kind: "new-direction", text: normalized };
  if (/天气|weather|无关|off-topic/iu.test(normalized)) return { kind: "unrelated", text: normalized };
  return { kind: "free-text", text: normalized, chosenBy: "author" };
}
