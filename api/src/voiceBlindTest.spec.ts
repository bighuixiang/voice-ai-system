import { describe, expect, it } from "vitest";
import { evaluateVoiceBlindTest } from "./voiceBlindTest.js";

const valid = { testId: "voice-test-1", utteranceId: "u-1", candidates: [{ characterId: "hero", score: 0.86 }, { characterId: "rival", score: 0.42 }], expectedCharacterId: "hero", distinguishingEvidence: ["withholds direct answer", "leaks logistics under fear"], profileVersion: "voice-v2", arcChangeEvidenceRefs: ["arc://hero#milestone"], sourceRefs: ["scene://u-1"] };

describe("voice blind test", () => {
  it("evaluates masked-speaker recognition with profile and arc evidence", () => {
    const result = evaluateVoiceBlindTest(valid);
    expect(result.status).toBe("passed");
    expect(result.topCandidateId).toBe("hero");
  });

  it("blocks recognition based only on catchphrase or missing evidence", () => {
    expect(() => evaluateVoiceBlindTest({ ...valid, distinguishingEvidence: ["repeats catchphrase"] })).toThrow("VOICE_BLIND_DISTINCTIVENESS_REQUIRED");
    expect(() => evaluateVoiceBlindTest({ ...valid, sourceRefs: [] })).toThrow("VOICE_BLIND_EVIDENCE_REQUIRED");
  });

  it("requires evidence when testing a changed voice version", () => {
    expect(() => evaluateVoiceBlindTest({ ...valid, profileVersion: "voice-v3", arcChangeEvidenceRefs: [] })).toThrow("VOICE_BLIND_ARC_CHANGE_EVIDENCE_REQUIRED");
  });
});
