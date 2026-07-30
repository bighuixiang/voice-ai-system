import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createProseSegment, applyProseSegmentPatch, readProseSegment } from "./proseSegment.js";

async function root() { return fs.mkdtemp(path.join(os.tmpdir(), "prose-segment-")); }
const input = (root: string) => ({ root, projectSlug: "demo", sceneId: "scene-1", beatId: "beat-1", text: "她推开门。", beforeText: "夜色沉下来。", afterText: "门后没有人。", sourceCandidateId: "prose-candidate-1", sourceRefs: ["prose://candidate-1#scene-1"] });
describe("stable prose segments", () => {
  it("creates a semantic segment with boundary anchors", async () => { const segment = await createProseSegment(input(await root())); expect(segment.semanticId).toBe("segment-scene-1-beat-1"); expect(segment.beforeBoundaryFingerprint).toMatch(/^[a-f0-9]{64}$/); expect(segment.afterBoundaryFingerprint).toMatch(/^[a-f0-9]{64}$/); expect(segment.status).toBe("candidate"); });
  it("applies patch only when both semantic ID and boundaries match", async () => { const r = await root(); const segment = await createProseSegment(input(r)); const patched = await applyProseSegmentPatch(r, segment.semanticId, { beforeBoundaryFingerprint: segment.beforeBoundaryFingerprint, afterBoundaryFingerprint: segment.afterBoundaryFingerprint, replacementText: "她用力推开门。", sourceRefs: ["prose://patch-1"] }); expect(patched.status).toBe("candidate"); expect(patched.text).toBe("她用力推开门。"); await expect(applyProseSegmentPatch(r, segment.semanticId, { beforeBoundaryFingerprint: "bad", afterBoundaryFingerprint: segment.afterBoundaryFingerprint, replacementText: "误写", sourceRefs: ["prose://patch-2"] })).rejects.toThrow("PROSE_SEGMENT_ANCHOR_MISMATCH"); });
  it("keeps identity idempotent and blocks missing evidence", async () => { const r = await root(); const one = await createProseSegment(input(r)); const two = await createProseSegment({ ...input(r), text: "不同文本" }); expect(two.fingerprint).toBe(one.fingerprint); expect(await readProseSegment(r, one.semanticId)).toEqual(one); await expect(createProseSegment({ ...input(r), sourceRefs: [] })).rejects.toThrow("PROSE_SEGMENT_SOURCE_REQUIRED"); });
});
