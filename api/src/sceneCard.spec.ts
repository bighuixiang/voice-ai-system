import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSceneCardIntegrity, createSceneCardContract, listSceneCardContracts, readSceneCardContract } from "./sceneCard.js";

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

  it("fails closed when a persisted scene card is tampered", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "scene-card-tamper-"));
    const scene = await createSceneCardContract(input(root));
    const target = path.join(root, "sessions", "scene-cards", `${scene.sceneId}.json`);
    const tampered = { ...scene, exitState: "changed", fingerprint: "f".repeat(64) };
    await fs.writeFile(target, JSON.stringify(tampered), "utf8");
    await expect(readSceneCardContract(root, scene.sceneId)).rejects.toThrow("SCENE_CARD_INTEGRITY_FAILED");
    await expect(listSceneCardContracts(root, "demo")).rejects.toThrow("SCENE_CARD_INTEGRITY_FAILED");
    expect(() => assertSceneCardIntegrity(tampered, scene.sceneId)).toThrow("SCENE_CARD_INTEGRITY_FAILED");
  });
});
