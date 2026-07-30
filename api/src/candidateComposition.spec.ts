import { describe, expect, it } from "vitest";
import { composeWritingCandidates } from "./candidateComposition.js";

const valid = { compositionId: "compose-1", sceneId: "scene-1", segments: [{ segmentId: "s1", sourceCandidateId: "a", text: "strong opening", rationale: "best pressure" }, { segmentId: "s2", sourceCandidateId: "b", text: "quiet aftermath", rationale: "best emotional landing" }], conflicts: [], evidenceRefs: ["review://compose-1"] };

describe("candidate composition", () => {
  it("composes selected segments with explicit provenance", () => {
    const result = composeWritingCandidates(valid);
    expect(result.status).toBe("composed");
    expect(result.provenance.map((item) => item.sourceCandidateId)).toEqual(["a", "b"]);
  });

  it("blocks unresolved segment conflicts", () => {
    const result = composeWritingCandidates({ ...valid, conflicts: [{ segmentId: "s1", candidateIds: ["a", "b"], issue: "different POV" }] });
    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain("CANDIDATE_COMPOSITION_CONFLICT");
  });

  it("requires rationale and evidence for every selected segment", () => {
    expect(() => composeWritingCandidates({ ...valid, segments: [{ ...valid.segments[0], rationale: "" }] })).toThrow("CANDIDATE_COMPOSITION_RATIONALE_REQUIRED");
    expect(() => composeWritingCandidates({ ...valid, evidenceRefs: [] })).toThrow("CANDIDATE_COMPOSITION_EVIDENCE_REQUIRED");
  });
});
