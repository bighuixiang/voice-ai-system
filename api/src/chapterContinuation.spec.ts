import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createChapterContinuationRun, saveContinuationCheckpoint, resumeFromVerifiedCheckpoint, readChapterContinuationRun } from "./chapterContinuation.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "chapter-continuation-")); }
const runInput = (root: string) => ({ root, projectSlug: "demo", chapterId: "chapter-1", inputManifest: { outlineVersionId: "v1", sceneId: "scene-1", contextFingerprint: "ctx-1" }, sourceRefs: ["outline://v1"] });
describe("long chapter continuation", () => {
  it("saves a complete checkpoint with baseline, beats, candidate and token", async () => { const r = await root(); const run = await createChapterContinuationRun(runInput(r)); const checkpoint = await saveContinuationCheckpoint(r, run.runId, { baselineTail: "尾部", fulfilledBeatIds: ["beat-1"], pendingBeatIds: ["beat-2"], candidateText: "候选正文", validationStatus: "passed", validationRefs: ["validation://1"], continuationToken: "token-1" }); expect(checkpoint.status).toBe("verified"); expect(checkpoint.continuationToken).toBe("token-1"); });
  it("resumes only from latest verified checkpoint and blocks unverified checkpoints", async () => { const r = await root(); const run = await createChapterContinuationRun(runInput(r)); await saveContinuationCheckpoint(r, run.runId, { baselineTail: "a", fulfilledBeatIds: [], pendingBeatIds: ["b"], candidateText: "a", validationStatus: "failed", validationRefs: [], continuationToken: "bad" }); await expect(resumeFromVerifiedCheckpoint(r, run.runId)).rejects.toThrow("CONTINUATION_CHECKPOINT_NOT_VERIFIED"); const good = await saveContinuationCheckpoint(r, run.runId, { baselineTail: "b", fulfilledBeatIds: ["b"], pendingBeatIds: [], candidateText: "b", validationStatus: "passed", validationRefs: ["validation://2"], continuationToken: "good" }); const resumed = await resumeFromVerifiedCheckpoint(r, run.runId); expect(resumed.checkpointId).toBe(good.checkpointId); expect(resumed.continuationToken).toBe("good"); });
  it("is idempotent and requires manifest/evidence", async () => { const r = await root(); const one = await createChapterContinuationRun(runInput(r)); const two = await createChapterContinuationRun(runInput(r)); expect(two.fingerprint).toBe(one.fingerprint); await expect(createChapterContinuationRun({ ...runInput(r), sourceRefs: [] })).rejects.toThrow("CONTINUATION_SOURCE_REQUIRED"); expect(await readChapterContinuationRun(r, one.runId)).toEqual(one); });
  it("rejects conflicting beat state and blank continuation evidence", async () => {
    const r = await root();
    const run = await createChapterContinuationRun(runInput(r));
    await expect(createChapterContinuationRun({ ...runInput(r), sourceRefs: [""] })).rejects.toThrow("CONTINUATION_SOURCE_REQUIRED");
    await expect(saveContinuationCheckpoint(r, run.runId, { baselineTail: "tail", fulfilledBeatIds: ["beat-1"], pendingBeatIds: ["beat-1"], candidateText: "candidate", validationStatus: "passed", validationRefs: [""], continuationToken: "token" })).rejects.toThrow("CONTINUATION_BEAT_STATE_CONFLICT");
  });

  it("fails closed when a persisted run or checkpoint is tampered", async () => {
    const r = await root();
    const run = await createChapterContinuationRun(runInput(r));
    const checkpoint = await saveContinuationCheckpoint(r, run.runId, { baselineTail: "tail", fulfilledBeatIds: ["beat-1"], pendingBeatIds: [], candidateText: "candidate", validationStatus: "passed", validationRefs: ["validation://1"], continuationToken: "token" });
    const runPath = path.join(r, "sessions", "chapter-continuations", `${run.runId}.json`);
    const runValue = JSON.parse(await fs.readFile(runPath, "utf8")) as Record<string, unknown>;
    await fs.writeFile(runPath, JSON.stringify({ ...runValue, chapterId: "tampered" }), "utf8");
    await expect(readChapterContinuationRun(r, run.runId)).rejects.toThrow("CONTINUATION_RUN_INTEGRITY_FAILED");
    await fs.writeFile(runPath, JSON.stringify(runValue), "utf8");
    const checkpointPath = path.join(r, "sessions", "continuation-checkpoints", `${checkpoint.checkpointId}.json`);
    const checkpointValue = JSON.parse(await fs.readFile(checkpointPath, "utf8")) as Record<string, unknown>;
    await fs.writeFile(checkpointPath, JSON.stringify({ ...checkpointValue, candidateText: "tampered" }), "utf8");
    await expect(resumeFromVerifiedCheckpoint(r, run.runId)).rejects.toThrow("CONTINUATION_CHECKPOINT_INTEGRITY_FAILED");
  });
});
