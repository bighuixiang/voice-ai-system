import crypto from "node:crypto";

export interface LongChapterCheckpoint { schemaVersion: "long-chapter-checkpoint.v1"; runId: string; chapterId: string; contextVersion: string; completedSceneIds: string[]; nextSceneId: string; checkpointText: string; unfinishedGoals: string[]; naturalBoundary: "scene-end" | "chapter-end"; status: "paused"; sourceRefs: string[]; fingerprint: string; }
export interface LongChapterResume { schemaVersion: "long-chapter-resume.v1"; runId: string; chapterId: string; contextVersion: string; nextSceneId: string; unfinishedGoals: string[]; status: "ready"; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createLongChapterCheckpoint(input: Omit<LongChapterCheckpoint, "schemaVersion" | "status" | "fingerprint">): LongChapterCheckpoint {
  if (!input.runId.trim() || !input.chapterId.trim() || !input.contextVersion.trim() || !input.nextSceneId.trim()) throw new Error("LONG_CHAPTER_FIELDS_REQUIRED");
  if (!input.completedSceneIds.length || !input.unfinishedGoals.length || !input.sourceRefs.length) throw new Error("LONG_CHAPTER_CHECKPOINT_EVIDENCE_REQUIRED");
  if (input.naturalBoundary !== "scene-end" && input.naturalBoundary !== "chapter-end") throw new Error("LONG_CHAPTER_NATURAL_BOUNDARY_REQUIRED");
  if (!/[.!?。！？]$/u.test(input.checkpointText.trim())) throw new Error("LONG_CHAPTER_CHECKPOINT_INCOMPLETE");
  const base = { schemaVersion: "long-chapter-checkpoint.v1" as const, ...input, completedSceneIds: [...input.completedSceneIds], unfinishedGoals: [...input.unfinishedGoals], sourceRefs: [...input.sourceRefs], status: "paused" as const };
  return { ...base, fingerprint: hash(base) };
}
export function resumeLongChapter(checkpoint: LongChapterCheckpoint, input: { contextVersion: string }): LongChapterResume {
  if (checkpoint.contextVersion !== input.contextVersion) throw new Error("LONG_CHAPTER_CONTEXT_VERSION_MISMATCH");
  const base = { schemaVersion: "long-chapter-resume.v1" as const, runId: checkpoint.runId, chapterId: checkpoint.chapterId, contextVersion: input.contextVersion, nextSceneId: checkpoint.nextSceneId, unfinishedGoals: [...checkpoint.unfinishedGoals], status: "ready" as const };
  return { ...base, fingerprint: hash(base) };
}
