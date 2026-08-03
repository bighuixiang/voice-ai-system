import { describe, expect, it } from "vitest";
import { evaluateSceneSeam } from "./sceneSeam.js";

const valid = { leftSceneId: "scene-1", rightSceneId: "scene-2", left: { time: "dawn", space: "gate", characterPositions: { hero: "gate" }, props: { key: "held" }, injuries: { hero: "none" }, emotionTemperature: "tense", unfinishedActions: ["open gate"], addressTerms: { hero: "captain" }, informationState: "knows gate rule", narrativeDistance: "close" }, right: { time: "dawn", space: "gate", characterPositions: { hero: "gate" }, props: { key: "held" }, injuries: { hero: "none" }, emotionTemperature: "tense", unfinishedActions: ["open gate"], addressTerms: { hero: "captain" }, informationState: "knows gate rule", narrativeDistance: "close" }, leftVerifiedBeatIds: ["beat-1"], rightVerifiedBeatIds: ["beat-2"], repair: null, sourceRefs: ["prose://scene-1", "prose://scene-2"] };
describe("scene seam validation", () => {
  it("passes matching scene boundary state", () => { const report = evaluateSceneSeam(valid); expect(report.status).toBe("passed"); expect(report.mismatches).toEqual([]); });
  it("flags state contradictions and requires explicit repair", () => { const report = evaluateSceneSeam({ ...valid, right: { ...valid.right, space: "tower", injuries: { hero: "wounded" }, addressTerms: { hero: "stranger" } } }); expect(report.status).toBe("blocked"); expect(report.mismatches).toEqual(expect.arrayContaining(["SPACE_MISMATCH", "INJURY_MISMATCH", "ADDRESS_TERM_MISMATCH"])); const repaired = evaluateSceneSeam({ ...valid, right: { ...valid.right, space: "tower" }, repair: { explanation: "transition through corridor", preservesBeatIds: ["beat-1", "beat-2"], evidenceRefs: ["prose://seam-repair"] } }); expect(repaired.status).toBe("passed"); });
  it("requires seam evidence and does not accept vague transition text", () => { expect(evaluateSceneSeam({ ...valid, sourceRefs: [] }).issues).toContain("SEAM_EVIDENCE_REQUIRED"); expect(evaluateSceneSeam({ ...valid, right: { ...valid.right, time: "night" }, repair: { explanation: "smooth transition", preservesBeatIds: ["beat-1"], evidenceRefs: ["x"] } }).status).toBe("blocked"); });
  it("rejects invalid scene identity and blank seam evidence", () => {
    const report = evaluateSceneSeam({ ...valid, leftSceneId: "", rightSceneId: "scene-1", sourceRefs: [""], leftVerifiedBeatIds: [""], rightVerifiedBeatIds: [""], repair: { explanation: "corridor", preservesBeatIds: [""], evidenceRefs: [""] } });
    expect(report.status).toBe("blocked");
    expect(report.issues).toEqual(expect.arrayContaining(["SEAM_CONTEXT_REQUIRED", "SEAM_BEAT_ID_REQUIRED", "SEAM_EVIDENCE_REQUIRED"]));
    expect(evaluateSceneSeam({ ...valid, rightSceneId: "scene-1" }).issues).toContain("SEAM_SCENE_DUPLICATE");
  });
});
