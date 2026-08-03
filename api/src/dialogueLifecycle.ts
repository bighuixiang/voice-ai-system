import crypto from "node:crypto";

export interface DialogueAnswerClassification { schemaVersion: "dialogue-answer-classification.v1"; questionId: string; status: "tentative" | "confirmed"; nextStep: "reversible-default-or-probe" | "apply-answer"; fingerprint: string; }
export interface DialogueAnswerApplication { schemaVersion: "dialogue-answer-application.v1"; closedQuestionIds: string[]; remainingQuestionIds: string[]; evidence: Array<{ questionId: string; segment: string }>; fingerprint: string; }
export interface PreferenceProbe { schemaVersion: "preference-probe.v1"; probeId: string; kind: "preference_probe"; frozenFacts: string[]; dimension: string; variants: Array<{ variantId: string; text: string }>; canonWritten: false; fingerprint: string; }
export interface DialogueMemory { schemaVersion: "dialogue-memory.v1"; sourceUtteranceIds: string[]; effectiveIntents: string[]; decisions: string[]; provisionalAssumptions: string[]; unresolvedQuestions: string[]; preferenceEvidence: string[]; opposingEvidence: string[]; compressionVersion: string; fingerprint: string; }
export interface MisunderstandingIncident { schemaVersion: "misunderstanding-incident.v1"; incidentId: string; layer: "extraction" | "inference" | "question" | "memory" | "execution" | "presentation"; trigger: string; oldInterpretation: string; correctedInterpretation: string; repairEvidence: string[]; regressionCaseId: string; status: "open"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function classifyDialogueAnswer(input: { questionId: string; text: string }): DialogueAnswerClassification {
  if (!input.questionId.trim() || !input.text.trim()) throw new Error("DIALOGUE_ANSWER_REQUIRED");
  const tentative = /可能|也许|或许|不确定|说不准|maybe|perhaps|not sure/i.test(input.text);
  const base = { schemaVersion: "dialogue-answer-classification.v1" as const, questionId: input.questionId, status: tentative ? "tentative" as const : "confirmed" as const, nextStep: tentative ? "reversible-default-or-probe" as const : "apply-answer" as const };
  return { ...base, fingerprint: hash(base) };
}

export function applyDialogueAnswerSegments(input: { openQuestions: ReadonlyArray<{ questionId: string; semanticKey: string }>; segments: ReadonlyArray<{ text: string; answers: readonly string[] }> }): DialogueAnswerApplication {
  const evidence: DialogueAnswerApplication["evidence"] = []; const closed = new Set<string>();
  for (const segment of input.segments) for (const question of input.openQuestions) if (segment.answers.includes(question.semanticKey)) { closed.add(question.questionId); evidence.push({ questionId: question.questionId, segment: segment.text }); }
  const base = { schemaVersion: "dialogue-answer-application.v1" as const, closedQuestionIds: input.openQuestions.map((question) => question.questionId).filter((id) => closed.has(id)), remainingQuestionIds: input.openQuestions.map((question) => question.questionId).filter((id) => !closed.has(id)), evidence };
  return { ...base, fingerprint: hash(base) };
}

export function createPreferenceProbe(input: Omit<PreferenceProbe, "schemaVersion" | "kind" | "canonWritten" | "fingerprint">): PreferenceProbe {
  if (!input.probeId.trim() || !input.frozenFacts.length || !input.dimension.trim() || input.variants.length !== 2) throw new Error("PREFERENCE_PROBE_INVALID");
  const base = { schemaVersion: "preference-probe.v1" as const, probeId: input.probeId, kind: "preference_probe" as const, frozenFacts: [...input.frozenFacts], dimension: input.dimension, variants: input.variants.map((variant) => ({ ...variant })), canonWritten: false as const };
  return { ...base, fingerprint: hash(base) };
}

export function compressDialogueMemory(input: Omit<DialogueMemory, "schemaVersion" | "fingerprint">): DialogueMemory {
  if (!input.sourceUtteranceIds.length || !input.compressionVersion.trim()) throw new Error("DIALOGUE_MEMORY_FIELDS_REQUIRED");
  const base = { schemaVersion: "dialogue-memory.v1" as const, ...input, sourceUtteranceIds: [...input.sourceUtteranceIds], effectiveIntents: [...input.effectiveIntents], decisions: [...input.decisions], provisionalAssumptions: [...input.provisionalAssumptions], unresolvedQuestions: [...input.unresolvedQuestions], preferenceEvidence: [...input.preferenceEvidence], opposingEvidence: [...input.opposingEvidence] };
  return { ...base, fingerprint: hash(base) };
}

export function createMisunderstandingIncident(input: Omit<MisunderstandingIncident, "schemaVersion" | "status" | "fingerprint">): MisunderstandingIncident {
  if (!input.incidentId.trim() || !input.trigger.trim() || !input.oldInterpretation.trim() || !input.correctedInterpretation.trim() || !input.repairEvidence.length || !input.regressionCaseId.trim()) throw new Error("MISUNDERSTANDING_FIELDS_REQUIRED");
  const base = { schemaVersion: "misunderstanding-incident.v1" as const, ...input, repairEvidence: [...input.repairEvidence], status: "open" as const };
  return { ...base, fingerprint: hash(base) };
}
