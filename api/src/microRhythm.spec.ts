import { describe, expect, it } from "vitest";
import { evaluateMicroRhythm } from "./microRhythm.js";

const valid = { sceneId: "scene-1", paragraphs: [{ paragraphId: "p1", sentenceLengths: [12, 24], pauseCount: 1, actionReaction: true, dialogueInterior: false, beatFunction: "escalation", endingSignature: "image-a" }, { paragraphId: "p2", sentenceLengths: [8, 30], pauseCount: 2, actionReaction: true, dialogueInterior: true, beatFunction: "choice", endingSignature: "image-b" }], sourceRefs: ["prose://scene-1"] };
describe("micro rhythm", () => {
  it("passes varied rhythm with beat functions", () => { const report = evaluateMicroRhythm(valid); expect(report.status).toBe("passed"); expect(report.issues).toEqual([]); });
  it("flags mechanical short sentences, same endings and constant pace", () => { const report = evaluateMicroRhythm({ ...valid, paragraphs: [{ ...valid.paragraphs[0], sentenceLengths: [3, 4, 3], pauseCount: 0, endingSignature: "same" }, { ...valid.paragraphs[1], sentenceLengths: [3, 4, 3], pauseCount: 0, endingSignature: "same" }] }); expect(report.status).toBe("blocked"); expect(report.issues).toEqual(expect.arrayContaining(["MECHANICAL_SHORT_SENTENCES", "HOMOGENEOUS_PARAGRAPH_ENDINGS", "CONSTANT_PACE"])); });
  it("requires beat function and evidence", () => { expect(evaluateMicroRhythm({ ...valid, sourceRefs: [] }).issues).toContain("RHYTHM_EVIDENCE_REQUIRED"); expect(evaluateMicroRhythm({ ...valid, paragraphs: [{ ...valid.paragraphs[0], beatFunction: "" }] }).status).toBe("blocked"); });
  it("rejects invalid scene metadata, paragraph identity, and rhythm values", () => {
    const report = evaluateMicroRhythm({ ...valid, sceneId: "", sourceRefs: [""], paragraphs: [{ ...valid.paragraphs[0], paragraphId: "", sentenceLengths: [12, -1], pauseCount: -1 }, { ...valid.paragraphs[1], paragraphId: "" }] });
    expect(report.status).toBe("blocked");
    expect(report.issues).toEqual(expect.arrayContaining(["RHYTHM_CONTEXT_REQUIRED", "RHYTHM_PARAGRAPH_DUPLICATE", "RHYTHM_VALUE_INVALID", "RHYTHM_EVIDENCE_REQUIRED"]));
  });
});
