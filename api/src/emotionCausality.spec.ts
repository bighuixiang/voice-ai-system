import { describe, expect, it } from "vitest";
import { evaluateEmotionCausality } from "./emotionCausality.js";

const valid = { sceneId: "scene-1", characterId: "hero", intensity: "high" as const, trigger: " learns ally betrayed him", bodyAttention: "hands shake; scans the exit", interpretation: "trust is unsafe", choice: "withholds the map", aftermath: { character: "becomes guarded", relationship: "trust drops", nextAction: "tests the ally" }, proseEvidenceRefs: ["prose://scene-1#emotion"] };
describe("emotion causality and aftermath", () => {
  it("passes a causal emotional chain", () => { const report = evaluateEmotionCausality(valid); expect(report.status).toBe("passed"); expect(report.issues).toEqual([]); });
  it("blocks summary-only emotion and missing high-intensity aftermath", () => { const report = evaluateEmotionCausality({ ...valid, bodyAttention: "", interpretation: "他很痛苦", choice: "", aftermath: { character: "", relationship: "", nextAction: "" } }); expect(report.status).toBe("blocked"); expect(report.issues).toEqual(expect.arrayContaining(["EMOTION_PROCESS_REQUIRED", "EMOTION_CHOICE_REQUIRED", "EMOTION_AFTERSHOCK_REQUIRED"])); });
  it("requires prose evidence and detects low intensity without impact", () => { expect(evaluateEmotionCausality({ ...valid, intensity: "low", proseEvidenceRefs: [] }).issues).toContain("EMOTION_EVIDENCE_REQUIRED"); expect(evaluateEmotionCausality({ ...valid, intensity: "medium", aftermath: { character: "", relationship: "", nextAction: "" } }).status).toBe("blocked"); });
  it("rejects invalid context, intensity, and blank prose anchors", () => {
    const report = evaluateEmotionCausality({ ...valid, sceneId: "", characterId: "", intensity: "extreme" as never, proseEvidenceRefs: [""] });
    expect(report.status).toBe("blocked");
    expect(report.issues).toEqual(expect.arrayContaining(["EMOTION_CONTEXT_REQUIRED", "EMOTION_INTENSITY_INVALID", "EMOTION_EVIDENCE_REQUIRED"]));
  });
});
