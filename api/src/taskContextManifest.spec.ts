import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertTaskContextManifestIntegrity, buildTaskContextManifest, evaluateTaskContextManifestFreshness, persistTaskContextManifest, readTaskContextManifest } from "./taskContextManifest.js";
import { buildTaskContextPlan } from "./taskContextPlan.js";

describe("task context manifest", () => {
  it("builds a replayable manifest with source hashes and explicit fallback refs", () => {
    const blocks = [
      { title: "Story Contract", content: "contract" },
      { title: "Target Chapter", content: "trimmed" },
      { title: "context-budget-log", content: JSON.stringify({ version: "context-budget:v2", blockPlan: [{ title: "Story Contract", tier: "T0", originalLength: 8, finalLength: 8, truncated: false }, { title: "Target Chapter", tier: "T3", originalLength: 100, finalLength: 7, truncated: true }] }) }
    ];
    const plan = buildTaskContextPlan(blocks);
    const manifest = buildTaskContextManifest({ projectSlug: "demo", taskId: "task-1", taskType: "chapter.draft", blocks, plan, createdAt: "2026-08-01T00:00:00.000Z" });

    expect(manifest).toMatchObject({ schemaVersion: "task-context-manifest.v1", manifestId: expect.stringContaining("task-context-task-1-"), projectSlug: "demo", taskId: "task-1", taskType: "chapter.draft" });
    expect(manifest.blocks).toHaveLength(2);
    expect(manifest.blocks[0]).toMatchObject({ title: "Story Contract", tier: "T0", selected: true, compression: "none", sourceRefs: ["context://block/Story-Contract"] });
    expect(manifest.blocks[1]).toMatchObject({ title: "Target Chapter", compression: "boundary-trim", originalTokens: 25, finalTokens: 2, sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(manifest.warnings).toContain("SOURCE_REF_FALLBACK_USED");
    expect(manifest.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("persists and reads the manifest atomically", async () => {
    const root = path.join(process.cwd(), ".tmp-task-context-manifest");
    await fs.rm(root, { recursive: true, force: true });
    const blocks = [{ title: "Story Contract", content: "contract" }, { title: "context-budget-log", content: JSON.stringify({ version: "context-budget:v2", blockPlan: [{ title: "Story Contract", tier: "T0", originalLength: 8, finalLength: 8, truncated: false }] }) }];
    const plan = buildTaskContextPlan(blocks);
    const manifest = buildTaskContextManifest({ projectSlug: "demo", taskId: "task-2", taskType: "outline.generate", blocks, plan, createdAt: "2026-08-01T00:00:00.000Z" });
    await persistTaskContextManifest(root, manifest);
    await expect(readTaskContextManifest(root, manifest.manifestId)).resolves.toEqual(manifest);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("marks a manifest stale when a referenced source changes", async () => {
    const root = path.join(process.cwd(), ".tmp-task-context-manifest-stale");
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(path.join(root, "bible"), { recursive: true });
    await fs.writeFile(path.join(root, "bible", "world.md"), "old world", "utf8");
    const blocks = [{ title: "World", content: "old world" }, { title: "context-budget-log", content: JSON.stringify({ version: "context-budget:v2", blockPlan: [{ title: "World", tier: "T1", originalLength: 9, finalLength: 9, truncated: false }] }) }];
    const plan = buildTaskContextPlan(blocks);
    const manifest = buildTaskContextManifest({ projectSlug: "demo", taskId: "task-3", taskType: "chapter.plan", blocks, plan, sourceRefs: { World: ["bible/world.md"] }, sourceVersions: { World: "a" }, createdAt: "2026-08-01T00:00:00.000Z" });
    await expect(evaluateTaskContextManifestFreshness(root, manifest)).resolves.toEqual({ status: "stale", reasons: ["SOURCE_CHANGED:bible/world.md"] });
    await fs.rm(root, { recursive: true, force: true });
  });

  it("preserves explicit exclusion reasons and blocked permissions", () => {
    const blocks = [
      { title: "World", content: "world" },
      { title: "context-budget-log", content: JSON.stringify({ version: "context-budget:v2", blockPlan: [{ title: "World", tier: "T1", originalLength: 5, finalLength: 5, truncated: false }] }) }
    ];
    const plan = buildTaskContextPlan(blocks);
    const manifest = buildTaskContextManifest({ projectSlug: "demo", taskId: "task-4", taskType: "chapter.draft", blocks, plan, excludedBlocks: { World: "SECRET_DETECTED" } });
    expect(manifest).toMatchObject({ status: "block", warnings: expect.arrayContaining(["SECRET_DETECTED"]) });
    expect(manifest.blocks[0]).toMatchObject({ selected: false, permission: "blocked", exclusionReason: "SECRET_DETECTED" });
  });

  it("rejects a rehashed manifest with an invalid source block", () => {
    const blocks = [{ title: "World", content: "world" }];
    const plan = buildTaskContextPlan(blocks);
    const manifest = buildTaskContextManifest({ projectSlug: "demo", taskId: "task-shape", taskType: "chapter.draft", blocks, plan });
    const forged = { ...manifest, blocks: [{ ...manifest.blocks[0], sourceHash: "not-a-sha" }] };
    expect(() => assertTaskContextManifestIntegrity(forged)).toThrow("TASK_CONTEXT_MANIFEST_INTEGRITY_FAILED");
  });

  it("rejects a manifest whose selection metadata is tampered after signing", () => {
    const blocks = [{ title: "World", content: "world" }];
    const plan = buildTaskContextPlan(blocks);
    const manifest = buildTaskContextManifest({ projectSlug: "demo", taskId: "task-tamper", taskType: "chapter.draft", blocks, plan });
    const forged = { ...manifest, blocks: [{ ...manifest.blocks[0], selected: false }] };
    expect(() => assertTaskContextManifestIntegrity(forged)).toThrow("TASK_CONTEXT_MANIFEST_INTEGRITY_FAILED");
  });

  it("blocks a selected T0 block when the plan says it was truncated", () => {
    const blocks = [
      { title: "Author Input", content: "author input" },
      { title: "context-budget-log", content: JSON.stringify({ version: "context-budget:v2", blockPlan: [{ title: "Author Input", tier: "T0", originalLength: 100, finalLength: 50, truncated: true }] }) }
    ];
    const plan = buildTaskContextPlan(blocks);
    const manifest = buildTaskContextManifest({ projectSlug: "demo", taskId: "task-t0-truncated", taskType: "chapter.draft", blocks, plan });
    expect(manifest).toMatchObject({ status: "block", warnings: expect.arrayContaining(["T0_TRUNCATION_BLOCKED"]) });
  });

  it("blocks when no global context budget plan is available", () => {
    const blocks = [{ title: "Author Input", content: "author input" }];
    const plan = buildTaskContextPlan(blocks);
    expect(plan.status).toBe("warn");
    const manifest = buildTaskContextManifest({ projectSlug: "demo", taskId: "task-budget-missing", taskType: "chapter.draft", blocks, plan });
    expect(manifest).toMatchObject({ status: "block", warnings: expect.arrayContaining(["CONTEXT_PLAN_NOT_READY"]) });
  });
});
