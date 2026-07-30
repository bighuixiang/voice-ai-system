import crypto from "node:crypto";

export interface SceneCreationContract { schemaVersion: "scene-creation-contract.v1"; sceneId: string; chapterId: string; narrativeFunction: string; characterFunction: string; conflict: string; change: string; informationRelease: string; emotionalShift: string; sourceRefs: string[]; status: "candidate"; fingerprint: string; }
export interface SceneCreationValidation { schemaVersion: "scene-creation-validation.v1"; sceneId: string; status: "ready" | "blocked"; issues: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createSceneCreationContract(input: Omit<SceneCreationContract, "schemaVersion" | "status" | "fingerprint">): SceneCreationContract {
  if (!input.sceneId.trim() || !input.chapterId.trim() || !input.narrativeFunction.trim() || !input.characterFunction.trim()) throw new Error("SCENE_CREATION_FIELDS_REQUIRED");
  if (!input.sourceRefs.length) throw new Error("SCENE_CREATION_SOURCE_REQUIRED");
  const base = { schemaVersion: "scene-creation-contract.v1" as const, ...input, sourceRefs: [...input.sourceRefs], status: "candidate" as const };
  return { ...base, fingerprint: hash(base) };
}
export function validateSceneCreation(scene: SceneCreationContract): SceneCreationValidation {
  const issues = [!scene.conflict.trim() ? "SCENE_CONFLICT_REQUIRED" : "", !scene.change.trim() ? "SCENE_CHANGE_REQUIRED" : "", !scene.informationRelease.trim() ? "SCENE_INFORMATION_RELEASE_REQUIRED" : "", !scene.emotionalShift.trim() ? "SCENE_EMOTIONAL_SHIFT_REQUIRED" : ""].filter(Boolean);
  const base = { schemaVersion: "scene-creation-validation.v1" as const, sceneId: scene.sceneId, status: issues.length ? "blocked" as const : "ready" as const, issues };
  return { ...base, fingerprint: hash(base) };
}
