import { describe, expect, it } from "vitest";
import { evaluateVoiceConsistency } from "./voiceConsistency.js";

const valid = { characterId: "hero", voiceVersion: "voice-v2", emotion: "fear", relationshipState: "distrust", powerState: "outnumbered", knowledgeBoundary: ["knows the gate is sealed"], utterance: "我不会把钥匙交给你。", evidenceRefs: ["prose://scene-1#dialogue"] };
describe("voice and state consistency", () => {
  it("passes when voice, state, and knowledge evidence are complete", () => { const report = evaluateVoiceConsistency(valid); expect(report.status).toBe("passed"); expect(report.drift).toEqual([]); });
  it("blocks missing state or knowledge and ungrounded voice changes", () => { const report = evaluateVoiceConsistency({ ...valid, relationshipState: "", knowledgeBoundary: [], voiceVersion: "", previousVoiceVersion: "voice-v1", voiceChangeMilestone: null }); expect(report.status).toBe("blocked"); expect(report.drift).toEqual(expect.arrayContaining(["VOICE_VERSION_REQUIRED", "RELATIONSHIP_STATE_REQUIRED", "KNOWLEDGE_BOUNDARY_REQUIRED", "VOICE_CHANGE_MILESTONE_REQUIRED"])); });
  it("requires evidence and treats a grounded arc milestone as valid change", () => { expect(evaluateVoiceConsistency({ ...valid, voiceVersion: "voice-v3", previousVoiceVersion: "voice-v2", voiceChangeMilestone: "arc-milestone-1", voiceChangeEvidenceRefs: ["arc://milestone-1"] }).status).toBe("passed"); expect(evaluateVoiceConsistency({ ...valid, evidenceRefs: [] }).status).toBe("blocked"); });
  it("rejects blank boundary and evidence entries", () => {
    const report = evaluateVoiceConsistency({ ...valid, characterId: "", knowledgeBoundary: [""], evidenceRefs: [""] });
    expect(report.status).toBe("blocked");
    expect(report.drift).toEqual(expect.arrayContaining(["CHARACTER_ID_REQUIRED", "KNOWLEDGE_BOUNDARY_REQUIRED", "VOICE_EVIDENCE_REQUIRED"]));
  });
});
