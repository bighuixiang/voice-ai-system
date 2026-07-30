import crypto from "node:crypto";

export type IntentAtomKind = "story_fact" | "preference" | "constraint" | "idea" | "question" | "correction" | "command" | "delegation" | "rejection";
export interface DialogueUtterance { schemaVersion: "dialogue-utterance.v1"; utteranceId: string; projectId: string; sessionId: string; turn: number; authorId: string; text: string; clientTimestamp: string; serverTimestamp: string; language: string; attachmentRefs: string[]; idempotencyKey: string; fingerprint: string; }
export interface IntentAtom { schemaVersion: "intent-atom.v1"; atomId: string; sourceUtteranceId: string; kind: IntentAtomKind; text: string; start: number; end: number; targetAsset: string; scope: string; relation: string; fingerprint: string; }
export interface UnderstandingSnapshot { schemaVersion: "understanding-snapshot.v1"; snapshotId: string; sourceUtteranceIds: string[]; explicit: string[]; inferred: string[]; provisional: string[]; unknown: string[]; conflicted: string[]; nextAction: string; fingerprint: string; }
export interface UnderstandingEvidence { schemaVersion: "understanding-evidence.v1"; status: "explicit" | "inferred" | "provisional" | "unknown" | "conflicted"; confidence: number; supportingEvidence: string[]; opposingEvidence: string[]; interpreterVersion: string; alternatives: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createDialogueUtterance(input: Omit<DialogueUtterance, "schemaVersion" | "utteranceId" | "serverTimestamp" | "fingerprint">): DialogueUtterance {
  if (!input.projectId.trim() || !input.sessionId.trim() || !input.authorId.trim() || !input.text.trim() || !input.idempotencyKey.trim()) throw new Error("DIALOGUE_UTTERANCE_FIELDS_REQUIRED");
  const utteranceId = `utterance-${hash({ projectId: input.projectId, sessionId: input.sessionId, idempotencyKey: input.idempotencyKey }).slice(0, 16)}`;
  const base = { schemaVersion: "dialogue-utterance.v1" as const, ...input, utteranceId, serverTimestamp: new Date().toISOString(), attachmentRefs: [...input.attachmentRefs] };
  return { ...base, fingerprint: hash(base) };
}

export function atomizeIntent(input: { utteranceId: string; text: string; atoms: readonly Array<Omit<IntentAtom, "schemaVersion" | "sourceUtteranceId" | "fingerprint">> }): IntentAtom[] {
  if (!input.utteranceId.trim() || !input.text.trim() || !input.atoms.length) throw new Error("INTENT_ATOMS_REQUIRED");
  return input.atoms.map((atom) => {
    if (!atom.atomId.trim() || !atom.text.trim() || atom.start < 0 || atom.end <= atom.start || atom.end > input.text.length || !atom.targetAsset.trim() || !atom.scope.trim()) throw new Error("INTENT_ATOM_INVALID");
    const base = { schemaVersion: "intent-atom.v1" as const, ...atom, sourceUtteranceId: input.utteranceId };
    return { ...base, fingerprint: hash(base) };
  });
}

export function createUnderstandingSnapshot(input: Omit<UnderstandingSnapshot, "schemaVersion" | "fingerprint">): UnderstandingSnapshot {
  if (!input.snapshotId.trim() || !input.sourceUtteranceIds.length || !input.nextAction.trim()) throw new Error("UNDERSTANDING_SNAPSHOT_FIELDS_REQUIRED");
  const base = { schemaVersion: "understanding-snapshot.v1" as const, ...input, sourceUtteranceIds: [...input.sourceUtteranceIds], explicit: [...input.explicit], inferred: [...input.inferred], provisional: [...input.provisional], unknown: [...input.unknown], conflicted: [...input.conflicted] };
  return { ...base, fingerprint: hash(base) };
}

export function evaluateUnderstandingEvidence(input: Omit<UnderstandingEvidence, "schemaVersion" | "fingerprint">): UnderstandingEvidence {
  if (input.confidence < 0 || input.confidence > 1 || !input.interpreterVersion.trim()) throw new Error("UNDERSTANDING_EVIDENCE_INVALID");
  if (input.status !== "explicit" && input.status !== "unknown" && !input.supportingEvidence.length) throw new Error("UNDERSTANDING_EVIDENCE_REQUIRED");
  const base = { schemaVersion: "understanding-evidence.v1" as const, ...input, supportingEvidence: [...input.supportingEvidence], opposingEvidence: [...input.opposingEvidence], alternatives: [...input.alternatives] };
  return { ...base, fingerprint: hash(base) };
}
