import { describe, expect, it } from "vitest";
import { createChapterIntent, validateChapterContinuity } from "./chapterContinuityValidator.js";

const intent = createChapterIntent({ chapterId: "chapter-1", sceneIds: ["scene-1", "scene-2"], goal: "warn ally", entryState: "at gate", exitState: "trust conditional", sourceRefs: ["outline://chapter-1"] });
const segments = [{ sceneId: "scene-1", content: "Hero enters the north gate.", snapshotVersion: "v1", terms: { address: "Hero", location: "north gate", time: "dawn", props: ["key"], emotion: "fear", pace: "slow", information: ["patrol"], ending: "he sees the patrol" } }, { sceneId: "scene-2", content: "Hero warns the ally.", snapshotVersion: "v1", terms: { address: "Hero", location: "north gate", time: "dawn", props: ["key"], emotion: "resolve", pace: "fast", information: ["ally location"], ending: "trust breaks" } }];

describe("chapter continuity validator", () => {
  it("validates segments against one frozen intent and snapshot version", () => {
    const result = validateChapterContinuity(intent, segments);
    expect(result.status).toBe("passed");
    expect(result.checkedSceneIds).toEqual(["scene-1", "scene-2"]);
  });

  it("flags cross-segment continuity and seam problems", () => {
    const result = validateChapterContinuity(intent, [{ ...segments[0], snapshotVersion: "v2" }, { ...segments[1], terms: { ...segments[1].terms, location: "south tower", time: "midnight", props: ["sword"], information: ["patrol", "patrol"] } }]);
    expect(result.status).toBe("blocked");
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["CHAPTER_SNAPSHOT_MISMATCH", "CHAPTER_LOCATION_DRIFT", "CHAPTER_TIME_DRIFT", "CHAPTER_PROP_DRIFT", "CHAPTER_INFORMATION_REPEAT"]));
  });

  it("requires all intent scenes and evidence", () => {
    expect(() => createChapterIntent({ chapterId: "chapter-1", sceneIds: [], goal: "warn", entryState: "in", exitState: "out", sourceRefs: [] })).toThrow("CHAPTER_INTENT_REQUIRED");
    const result = validateChapterContinuity(intent, [segments[0]]);
    expect(result.status).toBe("blocked");
    expect(result.issues.map((issue) => issue.code)).toContain("CHAPTER_SCENE_MISSING");
  });
});
