import { describe, expect, it } from "vitest";
import { createChapterCreationContract, validateChapterCreation } from "./chapterCreationContract.js";

const valid = { chapterId: "chapter-1", volumeId: "volume-1", chapterFunction: "force the alliance to choose", sceneIds: ["scene-1", "scene-2"], entryState: "gate sealed", exitState: "trust conditional", obligations: ["FS-1 reveal", "injury persists"], targetLength: { min: 1800, max: 2600 }, stopConditions: ["exit state demonstrated", "next hook recorded"], sourceRefs: ["outline://chapter-1"] };

describe("chapter creation contract", () => {
  it("keeps chapter-level scope and measurable stopping conditions", () => {
    const chapter = createChapterCreationContract(valid);
    expect(chapter.status).toBe("candidate");
    expect(validateChapterCreation(chapter).status).toBe("ready");
  });

  it("blocks incomplete scene coverage or missing exit state", () => {
    const chapter = createChapterCreationContract({ ...valid, sceneIds: [], exitState: "" });
    const result = validateChapterCreation(chapter);
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(expect.arrayContaining(["CHAPTER_SCENES_REQUIRED", "CHAPTER_EXIT_STATE_REQUIRED"]));
  });

  it("rejects invalid length windows and absent obligations", () => {
    expect(() => createChapterCreationContract({ ...valid, targetLength: { min: 0, max: 2 } })).toThrow("CHAPTER_LENGTH_INVALID");
    expect(() => createChapterCreationContract({ ...valid, obligations: [] })).toThrow("CHAPTER_OBLIGATIONS_REQUIRED");
  });
});
