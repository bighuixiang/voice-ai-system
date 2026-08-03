import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createChapterExecutionProof, readChapterExecutionProof, verifyChapterExecutionProof } from "./chapterExecutionProof.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
const fp = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("chapter execution proof", () => {
  it("persists a replayable chapter-level proof", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-execution-proof-")); roots.push(root);
    const input = { projectSlug: "demo", chapterId: "chapter-001", planId: "plan-1", planFingerprint: "a".repeat(64), parentExecutionReadyProofFingerprint: "b".repeat(64), contextFingerprint: "c".repeat(64) };
    const proof = await createChapterExecutionProof(root, input);
    expect(await readChapterExecutionProof(root, proof.proofId)).toEqual(proof);
    expect(verifyChapterExecutionProof(proof, { projectSlug: "demo", chapterId: "chapter-001", planId: input.planId, planFingerprint: input.planFingerprint, parentExecutionReadyProofFingerprint: input.parentExecutionReadyProofFingerprint, contextFingerprint: input.contextFingerprint })).toBe(true);
    expect(verifyChapterExecutionProof(proof, { projectSlug: "demo", chapterId: "chapter-001", planId: input.planId, planFingerprint: input.planFingerprint, parentExecutionReadyProofFingerprint: "d".repeat(64), contextFingerprint: input.contextFingerprint })).toBe(false);
    expect(verifyChapterExecutionProof(proof, { projectSlug: "other", chapterId: "chapter-001", planId: input.planId, planFingerprint: input.planFingerprint, parentExecutionReadyProofFingerprint: input.parentExecutionReadyProofFingerprint, contextFingerprint: input.contextFingerprint })).toBe(false);
  });

  it("rejects a semantically forged persisted proof even when its outer fingerprint is recomputed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-execution-proof-")); roots.push(root);
    const input = { projectSlug: "demo", chapterId: "chapter-001", planId: "plan-1", planFingerprint: "a".repeat(64), parentExecutionReadyProofFingerprint: "b".repeat(64), contextFingerprint: "c".repeat(64) };
    const proof = await createChapterExecutionProof(root, input);
    const target = path.join(root, "sessions/chapter-execution-proofs", `${proof.proofId}.json`);
    const forgedBase = { ...proof, chapterId: "chapter-999" };
    const { fingerprint: _old, ...withoutFingerprint } = forgedBase;
    await fs.writeFile(target, JSON.stringify({ ...withoutFingerprint, fingerprint: fp(withoutFingerprint) }));
    await expect(readChapterExecutionProof(root, proof.proofId)).rejects.toThrow("CHAPTER_EXECUTION_PROOF_INTEGRITY_FAILED");
  });
});
