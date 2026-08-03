import { describe, expect, it } from "vitest";
import { compileCharacterVoiceVariant, createCharacterVoiceProfile } from "./characterVoiceProfile.js";

const profile = { characterId: "hero", version: "voice-v1", attentionFocus: "threats and exits", desireAndAvoidance: "wants trust, avoids dependence", vocabularyRange: "plain concrete words", syntaxAndPauses: "short clauses with withheld endings", addressHabits: "formal with authority, indirect with sister", lyingStyle: "answers the adjacent question", emotionalLeak: "overexplains logistics", powerExpression: "concedes publicly, bargains privately", forbiddenDrift: ["generic eloquence", "constant catchphrase"], sourceRefs: ["voice://hero/v1"] };
describe("character voice profile", () => {
  it("creates a behavior-language profile rather than a catchphrase list", () => {
    const result = createCharacterVoiceProfile(profile);
    expect(result.forbiddenDrift).toContain("constant catchphrase");
    expect(result.status).toBe("active");
  });

  it("allows a relationship-stage variant when state and evidence are present", () => {
    const result = compileCharacterVoiceVariant(createCharacterVoiceProfile(profile), { emotion: "fear", relationshipStage: "new trust", powerPosition: "subordinate", knowledgeBoundary: ["gate is sealed"], utterance: "I can check the east route.", variantEvidenceRefs: ["relationship://hero-sister#trust"] });
    expect(result.status).toBe("passed");
    expect(result.variantKey).toContain("new trust");
  });

  it("blocks unexplained voice changes and profile-empty generation", () => {
    const created = createCharacterVoiceProfile(profile);
    expect(() => compileCharacterVoiceVariant({ ...created, version: "voice-v2" }, { previousVersion: "voice-v1", emotion: "calm", relationshipStage: "same", powerPosition: "equal", knowledgeBoundary: ["fact"], utterance: "A long generic speech.", variantEvidenceRefs: [] })).toThrow("VOICE_PROFILE_CHANGE_EVIDENCE_REQUIRED");
    expect(() => createCharacterVoiceProfile({ ...profile, syntaxAndPauses: "", sourceRefs: [] })).toThrow("VOICE_PROFILE_FIELDS_REQUIRED");
  });

  it("rejects blank state or source entries instead of treating them as evidence", () => {
    expect(() => createCharacterVoiceProfile({ ...profile, forbiddenDrift: [""] })).toThrow("VOICE_PROFILE_FIELDS_REQUIRED");
    const created = createCharacterVoiceProfile(profile);
    expect(() => compileCharacterVoiceVariant(created, { emotion: "fear", relationshipStage: "trusted", powerPosition: "equal", knowledgeBoundary: [""], utterance: "I will go.", variantEvidenceRefs: ["voice://scene"] })).toThrow("VOICE_VARIANT_STATE_REQUIRED");
    expect(() => compileCharacterVoiceVariant(created, { emotion: "fear", relationshipStage: "trusted", powerPosition: "equal", knowledgeBoundary: ["gate sealed"], utterance: "I will go.", variantEvidenceRefs: [""] })).toThrow("VOICE_VARIANT_EVIDENCE_REQUIRED");
  });
});
