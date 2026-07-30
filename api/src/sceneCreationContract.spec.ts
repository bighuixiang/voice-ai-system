import { describe, expect, it } from "vitest";
import { createSceneCreationContract, validateSceneCreation } from "./sceneCreationContract.js";

const valid = { sceneId: "scene-1", chapterId: "chapter-1", narrativeFunction: "force a warning", characterFunction: "hero chooses honesty", conflict: "guard blocks the gate", change: "trust decreases", informationRelease: "the patrol route is exposed", emotionalShift: "fear to resolve", sourceRefs: ["outline://scene-1"] };

describe("scene creation contract", () => {
  it("requires scene-level functions and observable changes", () => {
    const scene = createSceneCreationContract(valid);
    expect(scene.status).toBe("candidate");
    expect(validateSceneCreation(scene).status).toBe("ready");
  });

  it("blocks a scene that is only continuous exposition", () => {
    const scene = createSceneCreationContract({ ...valid, conflict: "", change: "", informationRelease: "", emotionalShift: "" });
    const result = validateSceneCreation(scene);
    expect(result.status).toBe("blocked");
    expect(result.issues).toEqual(expect.arrayContaining(["SCENE_CONFLICT_REQUIRED", "SCENE_CHANGE_REQUIRED"]));
  });

  it("rejects missing source evidence", () => {
    expect(() => createSceneCreationContract({ ...valid, sourceRefs: [] })).toThrow("SCENE_CREATION_SOURCE_REQUIRED");
  });
});
