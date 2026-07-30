import crypto from "node:crypto";

export interface VoiceBlindTestResult { schemaVersion: "voice-blind-test.v1"; testId: string; utteranceId: string; topCandidateId: string; expectedCharacterId: string; profileVersion: string; status: "passed" | "failed"; distinguishingEvidence: string[]; arcChangeEvidenceRefs: string[]; sourceRefs: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function evaluateVoiceBlindTest(input: { testId: string; utteranceId: string; candidates: readonly { characterId: string; score: number }[]; expectedCharacterId: string; distinguishingEvidence: readonly string[]; profileVersion: string; arcChangeEvidenceRefs: readonly string[]; sourceRefs: readonly string[] }): VoiceBlindTestResult {
  if (!input.testId.trim() || !input.utteranceId.trim() || !input.expectedCharacterId.trim() || !input.profileVersion.trim()) throw new Error("VOICE_BLIND_FIELDS_REQUIRED");
  if (!input.candidates.length || !input.sourceRefs.length) throw new Error("VOICE_BLIND_EVIDENCE_REQUIRED");
  if (!input.distinguishingEvidence.length || input.distinguishingEvidence.some((item) => /catchphrase|口头禅/iu.test(item))) throw new Error("VOICE_BLIND_DISTINCTIVENESS_REQUIRED");
  if (input.profileVersion !== "voice-v1" && !input.arcChangeEvidenceRefs.length) throw new Error("VOICE_BLIND_ARC_CHANGE_EVIDENCE_REQUIRED");
  const top = [...input.candidates].sort((a, b) => b.score - a.score)[0];
  const base = { schemaVersion: "voice-blind-test.v1" as const, testId: input.testId, utteranceId: input.utteranceId, topCandidateId: top.characterId, expectedCharacterId: input.expectedCharacterId, profileVersion: input.profileVersion, status: top.characterId === input.expectedCharacterId ? "passed" as const : "failed" as const, distinguishingEvidence: [...input.distinguishingEvidence], arcChangeEvidenceRefs: [...input.arcChangeEvidenceRefs], sourceRefs: [...input.sourceRefs] };
  return { ...base, fingerprint: hash(base) };
}
