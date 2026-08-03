import crypto from "node:crypto";

export interface AmbiguousAnswerState { schemaVersion: "ambiguous-answer-state.v1"; questionId: string; answer: string; status: "tentative"; alternatives: string[]; canonWriteAllowed: false; l2Open: true; allowedDraftKinds: Array<"non-conflicting-middle" | "exploratory-ending">; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createAmbiguousAnswerState(input: { questionId: string; answer: string; alternatives: readonly string[]; affectedDecision: string; }): AmbiguousAnswerState {
  if (!input.questionId.trim() || !input.answer.trim() || input.alternatives.length < 2 || !input.affectedDecision.trim()) throw new Error("AMBIGUOUS_ANSWER_FIELDS_REQUIRED");
  const base = { schemaVersion: "ambiguous-answer-state.v1" as const, questionId: input.questionId, answer: input.answer, status: "tentative" as const, alternatives: [...new Set(input.alternatives)], canonWriteAllowed: false as const, l2Open: true as const, allowedDraftKinds: ["non-conflicting-middle", "exploratory-ending"] as Array<"non-conflicting-middle" | "exploratory-ending"> };
  return { ...base, fingerprint: hash(base) };
}
