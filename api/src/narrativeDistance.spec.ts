import { describe, expect, it } from "vitest";
import { evaluateNarrativeDistance } from "./narrativeDistance.js";

const valid = { sceneId: "scene-1", povCharacterId: "hero", declaredDistance: "close" as const, allowedChanges: [{ to: "free-indirect" as const, trigger: "memory surfaces" }], segments: [{ segmentId: "seg-1", distance: "close" as const, trigger: null, hasPovKnowledgeBoundary: true, entersOtherMind: false, namesUnknownEmotion: false }, { segmentId: "seg-2", distance: "free-indirect" as const, trigger: "memory surfaces", hasPovKnowledgeBoundary: true, entersOtherMind: false, namesUnknownEmotion: false }], sourceRefs: ["prose://scene-1"] };
describe("narrative distance contract", () => {
  it("passes declared distance and authorized transition", () => { const report = evaluateNarrativeDistance(valid); expect(report.status).toBe("passed"); expect(report.issues).toEqual([]); });
  it("blocks untriggered jumps, POV violations and sudden other-mind entry", () => { const report = evaluateNarrativeDistance({ ...valid, segments: [{ ...valid.segments[0], distance: "external" }, { ...valid.segments[1], distance: "close", trigger: null, hasPovKnowledgeBoundary: false, entersOtherMind: true, namesUnknownEmotion: true }] }); expect(report.status).toBe("blocked"); expect(report.issues).toEqual(expect.arrayContaining(["DISTANCE_TRANSITION_NOT_ALLOWED", "POV_KNOWLEDGE_BOUNDARY_REQUIRED", "OTHER_MIND_ENTRY_UNTRIGGERED", "UNKNOWN_EMOTION_NAMED"])); });
  it("requires segments and evidence", () => { expect(evaluateNarrativeDistance({ ...valid, segments: [] }).status).toBe("blocked"); expect(evaluateNarrativeDistance({ ...valid, sourceRefs: [] }).issues).toContain("DISTANCE_EVIDENCE_REQUIRED"); });
  it("binds the first segment to the declared distance and rejects duplicate or blank metadata", () => {
    const report = evaluateNarrativeDistance({ ...valid, sceneId: "", povCharacterId: "", declaredDistance: "external", segments: [{ ...valid.segments[0], segmentId: "" }, { ...valid.segments[0], segmentId: "" }], sourceRefs: [""] });
    expect(report.status).toBe("blocked");
    expect(report.issues).toEqual(expect.arrayContaining(["DISTANCE_CONTEXT_REQUIRED", "DECLARED_DISTANCE_MISMATCH", "DISTANCE_SEGMENT_DUPLICATE", "DISTANCE_EVIDENCE_REQUIRED"]));
  });
});
