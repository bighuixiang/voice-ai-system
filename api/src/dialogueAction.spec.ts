import { describe, expect, it } from "vitest";
import { evaluateDialogueAction } from "./dialogueAction.js";

const valid = { dialogueId: "dialogue-1", sceneId: "scene-1", participants: [{ characterId: "hero", surfaceGoal: "获得通行", hiddenGoal: "测试对方是否背叛", speechActions: ["probe", "pressure"] }, { characterId: "guard", surfaceGoal: "拒绝请求", hiddenGoal: "掩饰恐惧", speechActions: ["evade"] }], informationAsymmetry: [{ holder: "guard", secret: "门已失守", knownTo: ["guard"] }], postChange: { power: "hero gains leverage", relationship: "trust becomes conditional" }, exchangeRefs: ["prose://scene-1#dialogue"] };
describe("dialogue action and subtext", () => {
  it("passes a dialogue with goals, subtext, asymmetric knowledge, and aftermath", () => { const report = evaluateDialogueAction(valid); expect(report.status).toBe("passed"); expect(report.issues).toEqual([]); });
  it("flags information dumping and missing subtext", () => { const report = evaluateDialogueAction({ ...valid, participants: valid.participants.map((p) => ({ ...p, hiddenGoal: "", speechActions: ["inform"] })), informationAsymmetry: [], postChange: { power: "", relationship: "" } }); expect(report.status).toBe("blocked"); expect(report.issues).toEqual(expect.arrayContaining(["HIDDEN_GOAL_REQUIRED", "SPEECH_ACTION_REQUIRED", "INFORMATION_DUMPING_RISK", "DIALOGUE_AFTERMATH_REQUIRED"])); });
  it("requires at least two participants and evidence", () => { expect(evaluateDialogueAction({ ...valid, participants: [valid.participants[0]] }).status).toBe("blocked"); expect(evaluateDialogueAction({ ...valid, exchangeRefs: [] }).issues).toContain("DIALOGUE_EVIDENCE_REQUIRED"); });
  it("rejects blank participant and asymmetric-knowledge records", () => {
    const report = evaluateDialogueAction({ ...valid, dialogueId: "", participants: [{ ...valid.participants[0], characterId: "" }, valid.participants[1]], informationAsymmetry: [{ holder: "", secret: "", knownTo: [""] }], exchangeRefs: [""] });
    expect(report.status).toBe("blocked");
    expect(report.issues).toEqual(expect.arrayContaining(["DIALOGUE_CONTEXT_REQUIRED", "DIALOGUE_PARTICIPANT_ID_REQUIRED", "INFORMATION_ASYMMETRY_INVALID", "DIALOGUE_EVIDENCE_REQUIRED"]));
  });
});
