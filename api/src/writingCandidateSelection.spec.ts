import { describe, expect, it } from "vitest";
import { createWritingCandidateSet, selectWritingCandidate } from "./writingCandidateSelection.js";

const candidate = (id: string, score: number) => ({ candidateId: id, content: `${id} prose`, scores: { continuity: score, character: score, craft: score }, risks: [], sourceRefs: [`draft://${id}`] });

describe("writing candidate selection", () => {
  it("keeps multiple candidates isolated until an explicit selection", () => {
    const set = createWritingCandidateSet({ setId: "set-1", sceneId: "scene-1", candidates: [candidate("a", 0.8), candidate("b", 0.7)], selectionCriteria: ["continuity", "character", "craft"], sourceRefs: ["scene://1"] });
    expect(set.status).toBe("candidate");
    const selected = selectWritingCandidate(set, { candidateId: "a", rationale: "stronger character turn", evidenceRefs: ["review://1"] });
    expect(selected.selectedCandidateId).toBe("a");
  });

  it("rejects empty or incomplete candidate sets", () => {
    expect(() => createWritingCandidateSet({ setId: "set-1", sceneId: "scene-1", candidates: [], selectionCriteria: ["craft"], sourceRefs: ["scene://1"] })).toThrow("WRITING_CANDIDATES_REQUIRED");
    expect(() => createWritingCandidateSet({ setId: "set-1", sceneId: "scene-1", candidates: [candidate("a", 0.8), candidate("b", 0.7)], selectionCriteria: ["craft"], sourceRefs: [] })).toThrow("WRITING_CANDIDATE_SOURCE_REQUIRED");
  });

  it("requires a comparative rationale and evidence for selection", () => {
    const set = createWritingCandidateSet({ setId: "set-1", sceneId: "scene-1", candidates: [candidate("a", 0.8), candidate("b", 0.7)], selectionCriteria: ["craft"], sourceRefs: ["scene://1"] });
    expect(() => selectWritingCandidate(set, { candidateId: "a", rationale: "", evidenceRefs: [] })).toThrow("WRITING_SELECTION_EVIDENCE_REQUIRED");
  });
});
