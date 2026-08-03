import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createChapterExecutionPlan, readChapterExecutionPlan, verifyChapterExecutionPlan } from "./chapterExecutionPlan.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
const fp = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("chapter execution plan", () => {
  it("persists an immutable plan bound to proof, context, and plan output", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-execution-plan-")); roots.push(root);
    const value = { summary: "turn", sceneIds: ["scene-1"] };
    const result = await createChapterExecutionPlan(root, { projectSlug: "demo", chapterId: "chapter-001", executionProofFingerprint: "proof-fp", contextFingerprint: "context-fp", planOutputId: "stage-output-run-chapter_plan", planFingerprint: fp(value), plan: value });
    expect(await readChapterExecutionPlan(root, result.planId)).toEqual(result);
    expect(verifyChapterExecutionPlan(result, { projectSlug: "demo", chapterId: "chapter-001", executionProofFingerprint: "proof-fp", contextFingerprint: "context-fp", planFingerprint: fp(value) })).toBe(true);
    await expect(createChapterExecutionPlan(root, { projectSlug: "demo", chapterId: "chapter-001", executionProofFingerprint: "proof-fp", contextFingerprint: "context-fp", planOutputId: "stage-output-run-chapter_plan", planFingerprint: fp(value), plan: value })).resolves.toEqual(result);
  });

  it("fails closed when a plan fingerprint does not match its value", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-execution-plan-")); roots.push(root);
    await expect(createChapterExecutionPlan(root, { projectSlug: "demo", chapterId: "chapter-001", executionProofFingerprint: "proof-fp", contextFingerprint: "context-fp", planOutputId: "stage-output", planFingerprint: "bad", plan: { summary: "turn" } })).rejects.toThrow("CHAPTER_EXECUTION_PLAN_FINGERPRINT_MISMATCH");
  });

  it("rejects replay when proof or context has moved since the plan was frozen", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-execution-plan-")); roots.push(root);
    const value = { summary: "turn" };
    const plan = await createChapterExecutionPlan(root, { projectSlug: "demo", chapterId: "chapter-001", executionProofFingerprint: "proof-a", contextFingerprint: "context-a", planOutputId: "stage-output", planFingerprint: fp(value), plan: value });
    expect(verifyChapterExecutionPlan(plan, { projectSlug: "demo", chapterId: "chapter-001", executionProofFingerprint: "proof-b", contextFingerprint: "context-a", planFingerprint: fp(value) })).toBe(false);
    expect(verifyChapterExecutionPlan(plan, { projectSlug: "demo", chapterId: "chapter-001", executionProofFingerprint: "proof-a", contextFingerprint: "context-b", planFingerprint: fp(value) })).toBe(false);
  });

  it("rejects replay across project or chapter scope", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-execution-plan-")); roots.push(root);
    const value = { summary: "turn" };
    const plan = await createChapterExecutionPlan(root, { projectSlug: "demo", chapterId: "chapter-001", executionProofFingerprint: "proof-a", contextFingerprint: "context-a", planOutputId: "stage-output", planFingerprint: fp(value), plan: value });
    expect(verifyChapterExecutionPlan(plan, { projectSlug: "other", chapterId: "chapter-001", executionProofFingerprint: "proof-a", contextFingerprint: "context-a", planFingerprint: fp(value) })).toBe(false);
    expect(verifyChapterExecutionPlan(plan, { projectSlug: "demo", chapterId: "chapter-002", executionProofFingerprint: "proof-a", contextFingerprint: "context-a", planFingerprint: fp(value) })).toBe(false);
  });

  it("rejects a semantically forged persisted plan even when its outer fingerprint is recomputed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "chapter-execution-plan-")); roots.push(root);
    const value = { summary: "turn" };
    const plan = await createChapterExecutionPlan(root, { projectSlug: "demo", chapterId: "chapter-001", executionProofFingerprint: "proof-fp", contextFingerprint: "context-fp", planOutputId: "stage-output", planFingerprint: fp(value), plan: value });
    const target = path.join(root, "sessions/chapter-execution-plans", `${plan.planId}.json`);
    const forgedBase = { ...plan, chapterId: "chapter-999" };
    const { fingerprint: _old, ...withoutFingerprint } = forgedBase;
    await fs.writeFile(target, JSON.stringify({ ...withoutFingerprint, fingerprint: fp(withoutFingerprint) }));
    await expect(readChapterExecutionPlan(root, plan.planId)).rejects.toThrow("CHAPTER_EXECUTION_PLAN_INTEGRITY_FAILED");
  });
});
