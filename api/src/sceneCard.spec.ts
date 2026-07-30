import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSceneCardContract, listSceneCardContracts, readSceneCardContract } from "./sceneCard.js";

const input = (root: string, sceneId = "scene-001") => ({ root, projectSlug: "demo", sceneId, chapterId: "chapter-001", trigger: "patrol closes the gate", povCharacterId: "hero", roleGoal: "warn ally", conflictStrategy: "misdirection", turningPoint: "ally sees the route", informationChange: "route exposed", emotionChange: "fear to resolve", relationshipChange: "trust rises", resourceChange: "escape window lost", entryState: "hero hidden at gate", exitState: "hero commits to warning", nextSceneHook: "enemy tracks the route", sourceRefs: ["outline://scene-001"] });

describe("scene card contract", () => {
  it("stores causal scene transitions and state changes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "scene-card-"));
    const scene = await createSceneCardContract(input(root));
    expect(scene.schemaVersion).toBe("scene-card-contract.v1");
    expect(scene.nextSceneHook).toContain("enemy");
    expect(await readSceneCardContract(root, scene.sceneId)).toEqual(scene);
  });

  it("is idempotent and project-isolated", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "scene-card-"));
    const scene = await createSceneCardContract(input(root));
    expect(await createSceneCardContract(input(root))).toEqual(scene);
    expect(await listSceneCardContracts(root, "other")).toEqual([]);
    expect(await listSceneCardContracts(root, "demo")).toHaveLength(1);
  });

  it("rejects a scene without a state change or next hook", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "scene-card-"));
    await expect(createSceneCardContract({ ...input(root), relationshipChange: "", resourceChange: "" })).rejects.toThrow("SCENE_CARD_CHANGE_REQUIRED");
    await expect(createSceneCardContract({ ...input(root), nextSceneHook: "" })).rejects.toThrow("SCENE_CARD_HOOK_REQUIRED");
  });
});
