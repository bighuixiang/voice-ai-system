import { describe, expect, it } from "vitest";
import { evaluateCrossChapterTemplate } from "./crossChapterTemplateGuard.js";

const chapters = [{ chapterId: "ch-1", openingBeat: "alarm at gate", beats: ["alarm", "refusal", "choice", "cost"], repeatedPhrases: ["the gate was shut"], sourceRefs: ["chapter://1"] }, { chapterId: "ch-2", openingBeat: "letter at gate", beats: ["alarm", "refusal", "choice", "cost"], repeatedPhrases: ["the gate was shut"], sourceRefs: ["chapter://2"] }];

describe("cross chapter template guard", () => {
  it("flags repeated structure and language across chapters", () => {
    const result = evaluateCrossChapterTemplate({ reportId: "template-1", chapters, intentionalVariations: [], evidenceRefs: ["review://template"] });
    expect(result.status).toBe("blocked");
    expect(result.violations.map((item) => item.code)).toEqual(expect.arrayContaining(["CROSS_CHAPTER_BEAT_TEMPLATE", "CROSS_CHAPTER_PHRASE_REPEAT"]));
  });

  it("allows intentional recurrence with visible variation evidence", () => {
    const result = evaluateCrossChapterTemplate({ reportId: "template-2", chapters, intentionalVariations: [{ chapterIds: ["ch-1", "ch-2"], variation: "same gate motif but moral stakes invert", evidenceRefs: ["outline://arc"] }], evidenceRefs: ["review://template"] });
    expect(result.status).toBe("passed");
  });

  it("requires report evidence and at least two chapters", () => {
    expect(() => evaluateCrossChapterTemplate({ reportId: "template-3", chapters: [chapters[0]], intentionalVariations: [], evidenceRefs: ["x"] })).toThrow("CROSS_CHAPTER_SCOPE_REQUIRED");
    expect(() => evaluateCrossChapterTemplate({ reportId: "template-3", chapters, intentionalVariations: [], evidenceRefs: [] })).toThrow("CROSS_CHAPTER_EVIDENCE_REQUIRED");
  });
});
