import { describe, expect, it } from "vitest";
import { evaluateCrossLayerOrphans, evaluateVolumeContract, locateSceneSeam, reviewChapterFunction } from "./chapterStructureGates.js";
describe("chapter structure gates", () => {
  it("requires volume promise payoff and keeps authorized subquestion", () => { expect(evaluateVolumeContract({ promiseAnswered: true, characterChoice: true, costPaid: true, authorizedOpenSubquestion: true, newOrganizationNameOnly: false })).toEqual({ status: "fulfilled", mainPromiseFulfilled: true, subquestionRetained: true }); });
  it("reviews chapters without state change", () => { expect(reviewChapterFunction({ informationChange: false, relationshipChange: false, resourceChange: false, emotionChange: false, choiceChange: false, readerPayoff: false, wordCountMet: true })).toMatchObject({ status: "structure_review", candidates: ["merge", "delete", "add_irreversible_choice"] }); });
  it("locates a transition seam", () => { expect(locateSceneSeam({ scenes: [{ id: "a", exitChoice: "leave", entryState: "ready", nextTrigger: "" }, { id: "b", exitChoice: "", entryState: "", nextTrigger: "" }], transitions: [] }).status).toBe("seam"); });
  it("blocks cross-layer orphans", () => { expect(evaluateCrossLayerOrphans({ engineRefs: [], arcRefs: [], milestoneRefs: [], chapterFunctionRefs: [], obligationRefs: [], promisePlanRefs: [] }).status).toBe("blocked"); });
});
