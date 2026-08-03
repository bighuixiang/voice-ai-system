import { describe, expect, it } from "vitest";
import { createStyleSignature, detectStyleDrift } from "./styleDrift.js";

const signature = (overrides: Record<string, unknown> = {}) => createStyleSignature({ abstractWordRate: 0.1, processWordRate: 0.1, sentenceStartDistribution: { name: 0.5 }, dialogueTurnRate: 0.4, hookTypeDistribution: { question: 1 }, sensoryChannelDistribution: { visual: 1 }, characterVoiceDistance: 0.6, sceneFunctionDistribution: { conflict: 1 }, ...overrides });

describe("style drift", () => {
  it("reports explainable drift without prescribing one uniform voice", () => {
    const result = detectStyleDrift({ baseline: signature(), candidate: signature({ processWordRate: 0.5, characterVoiceDistance: 0.2 }), threshold: 0.2 });
    expect(result).toMatchObject({ status: "anomaly", anomalies: expect.arrayContaining(["process-word-rate", "character-voice-distance"]) });
  });

  it("allows project-evidenced intentional motifs to suppress only their own warning", () => {
    const result = detectStyleDrift({ baseline: signature(), candidate: signature({ processWordRate: 0.5 }), threshold: 0.2, intentionalMotifs: ["process-word-rate"] });
    expect(result).toMatchObject({ status: "stable", intentionalMotifsExcluded: ["process-word-rate"] });
  });
});
