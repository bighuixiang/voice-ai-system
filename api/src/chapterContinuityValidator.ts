import crypto from "node:crypto";

export interface ChapterIntent { schemaVersion: "chapter-intent.v1"; chapterId: string; sceneIds: string[]; goal: string; entryState: string; exitState: string; sourceRefs: string[]; fingerprint: string; }
export interface ChapterContinuityIssue { code: string; sceneIds: string[]; detail: string; }
export interface ChapterContinuityResult { schemaVersion: "chapter-continuity-validation.v1"; chapterId: string; checkedSceneIds: string[]; status: "passed" | "blocked"; issues: ChapterContinuityIssue[]; fingerprint: string; }
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createChapterIntent(input: Omit<ChapterIntent, "schemaVersion" | "fingerprint">): ChapterIntent {
  if (!input.chapterId.trim() || !input.sceneIds.length || !input.goal.trim() || !input.entryState.trim() || !input.exitState.trim() || !input.sourceRefs.length) throw new Error("CHAPTER_INTENT_REQUIRED");
  const base = { schemaVersion: "chapter-intent.v1" as const, ...input, sceneIds: [...input.sceneIds], sourceRefs: [...input.sourceRefs] };
  return { ...base, fingerprint: hash(base) };
}
export function validateChapterContinuity(intent: ChapterIntent, segments: readonly { sceneId: string; content: string; snapshotVersion: string; terms: { address: string; location: string; time: string; props: string[]; emotion: string; pace: string; information: string[]; ending: string } }[]): ChapterContinuityResult {
  const issues: ChapterContinuityIssue[] = []; const checkedSceneIds = segments.map((segment) => segment.sceneId);
  for (const sceneId of intent.sceneIds) if (!checkedSceneIds.includes(sceneId)) issues.push({ code: "CHAPTER_SCENE_MISSING", sceneIds: [sceneId], detail: "Frozen ChapterIntent scene has no generated segment." });
  const versions = new Set(segments.map((segment) => segment.snapshotVersion)); if (versions.size > 1) issues.push({ code: "CHAPTER_SNAPSHOT_MISMATCH", sceneIds: checkedSceneIds, detail: "Segments do not share one frozen prose snapshot version." });
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1]; const current = segments[index];
    if (previous.terms.address !== current.terms.address) issues.push({ code: "CHAPTER_ADDRESS_DRIFT", sceneIds: [previous.sceneId, current.sceneId], detail: "Character address/denomination changed across seam." });
    if (previous.terms.location !== current.terms.location) issues.push({ code: "CHAPTER_LOCATION_DRIFT", sceneIds: [previous.sceneId, current.sceneId], detail: "Location changed without a transition." });
    if (previous.terms.time !== current.terms.time) issues.push({ code: "CHAPTER_TIME_DRIFT", sceneIds: [previous.sceneId, current.sceneId], detail: "Time changed without a transition." });
    if (previous.terms.props.some((prop) => !current.terms.props.includes(prop))) issues.push({ code: "CHAPTER_PROP_DRIFT", sceneIds: [previous.sceneId, current.sceneId], detail: "A carried prop disappeared across seam." });
    const repeated = current.terms.information.filter((fact) => previous.terms.information.includes(fact)); if (repeated.length) issues.push({ code: "CHAPTER_INFORMATION_REPEAT", sceneIds: [previous.sceneId, current.sceneId], detail: `Information repeated: ${repeated.join(", ")}` });
    if (!previous.terms.ending.trim()) issues.push({ code: "CHAPTER_SEAM_MISSING", sceneIds: [previous.sceneId, current.sceneId], detail: "Previous segment has no transition ending." });
  }
  const base = { schemaVersion: "chapter-continuity-validation.v1" as const, chapterId: intent.chapterId, checkedSceneIds, status: issues.length ? "blocked" as const : "passed" as const, issues };
  return { ...base, fingerprint: hash(base) };
}
