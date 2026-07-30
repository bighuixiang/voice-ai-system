import { describe, expect, it } from "vitest";
import { createLongChapterCheckpoint, resumeLongChapter } from "./longChapterRecovery.js";

const valid = { runId: "run-1", chapterId: "chapter-1", contextVersion: "ctx-v3", completedSceneIds: ["scene-1"], nextSceneId: "scene-2", checkpointText: "The door opened.", unfinishedGoals: ["warn ally"], naturalBoundary: "scene-end", sourceRefs: ["checkpoint://run-1"] };

describe("long chapter recovery", () => {
  it("saves a natural scene checkpoint with unfinished goals", () => {
    const checkpoint = createLongChapterCheckpoint(valid);
    expect(checkpoint.status).toBe("paused");
    const resumed = resumeLongChapter(checkpoint, { contextVersion: "ctx-v3" });
    expect(resumed.status).toBe("ready");
    expect(resumed.nextSceneId).toBe("scene-2");
  });

  it("blocks silent mid-sentence or mid-action checkpoints", () => {
    expect(() => createLongChapterCheckpoint({ ...valid, naturalBoundary: "mid-sentence" })).toThrow("LONG_CHAPTER_NATURAL_BOUNDARY_REQUIRED");
    expect(() => createLongChapterCheckpoint({ ...valid, checkpointText: "The door" })).toThrow("LONG_CHAPTER_CHECKPOINT_INCOMPLETE");
  });

  it("requires the same context version on resume", () => {
    const checkpoint = createLongChapterCheckpoint(valid);
    expect(() => resumeLongChapter(checkpoint, { contextVersion: "ctx-old" })).toThrow("LONG_CHAPTER_CONTEXT_VERSION_MISMATCH");
  });
});
