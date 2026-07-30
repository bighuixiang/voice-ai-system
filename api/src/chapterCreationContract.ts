import crypto from "node:crypto";

export interface ChapterCreationContract { schemaVersion: "chapter-creation-contract.v1"; chapterId: string; volumeId: string; chapterFunction: string; sceneIds: string[]; entryState: string; exitState: string; obligations: string[]; targetLength: { min: number; max: number }; stopConditions: string[]; sourceRefs: string[]; status: "candidate"; fingerprint: string; }
export interface ChapterCreationValidation { schemaVersion: "chapter-creation-validation.v1"; chapterId: string; status: "ready" | "blocked"; issues: string[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createChapterCreationContract(input: Omit<ChapterCreationContract, "schemaVersion" | "status" | "fingerprint">): ChapterCreationContract {
  if (!input.chapterId.trim() || !input.volumeId.trim() || !input.chapterFunction.trim() || !input.entryState.trim()) throw new Error("CHAPTER_FIELDS_REQUIRED");
  if (!input.obligations.length) throw new Error("CHAPTER_OBLIGATIONS_REQUIRED");
  if (input.targetLength.min < 1 || input.targetLength.max < input.targetLength.min) throw new Error("CHAPTER_LENGTH_INVALID");
  if (!input.stopConditions.length || !input.sourceRefs.length) throw new Error("CHAPTER_ACCEPTANCE_REQUIRED");
  const base = { schemaVersion: "chapter-creation-contract.v1" as const, ...input, sceneIds: [...input.sceneIds], obligations: [...input.obligations], stopConditions: [...input.stopConditions], sourceRefs: [...input.sourceRefs], targetLength: { ...input.targetLength }, status: "candidate" as const };
  return { ...base, fingerprint: hash(base) };
}
export function validateChapterCreation(chapter: ChapterCreationContract): ChapterCreationValidation {
  const issues = [chapter.sceneIds.length ? "" : "CHAPTER_SCENES_REQUIRED", chapter.exitState.trim() ? "" : "CHAPTER_EXIT_STATE_REQUIRED", chapter.stopConditions.length ? "" : "CHAPTER_STOP_CONDITIONS_REQUIRED"].filter(Boolean);
  const base = { schemaVersion: "chapter-creation-validation.v1" as const, chapterId: chapter.chapterId, status: issues.length ? "blocked" as const : "ready" as const, issues };
  return { ...base, fingerprint: hash(base) };
}
