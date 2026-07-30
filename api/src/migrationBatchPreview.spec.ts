import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { previewAllProjectMigrations, validateAllProjectMigrations } from "./migrationBatchPreview.js";

const roots: string[] = [];
afterEach(async () => { delete process.env.NOVELS_ROOT; await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("batch migration preview", () => {
  it("previews every managed project without activating or mutating canon", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-batch-preview-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const managedRoot = path.join(root, "legacy");
    await fs.mkdir(path.join(managedRoot, "chapters"), { recursive: true });
    await fs.writeFile(path.join(managedRoot, "project.json"), JSON.stringify({ slug: "legacy", chapters: [{ id: "c1", contentPath: "chapters/c1.md" }] }));
    await fs.writeFile(path.join(managedRoot, "chapters", "c1.md"), "legacy\n");
    await fs.mkdir(path.join(root, "unmanaged"), { recursive: true });
    await fs.writeFile(path.join(root, "unmanaged", "story.md"), "legacy story\n");
    const before = await fs.readFile(path.join(managedRoot, "project.json"), "utf8");

    const report = await previewAllProjectMigrations();

    expect(report.schemaVersion).toBe("project-migration-batch-preview.v1");
    expect(report.status).toBe("blocked");
    expect(report.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectSlug: "legacy", status: "previewed", migrationId: expect.stringMatching(/^migration-preview-/) }),
      expect.objectContaining({ projectSlug: "unmanaged", status: "blocked", blockers: ["unmanaged-project"] })
    ]));
    expect(await fs.readFile(path.join(managedRoot, "project.json"), "utf8")).toBe(before);
  });

  it("validates every previewed project and reports dependencies without activation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-batch-validation-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const managedRoot = path.join(root, "legacy");
    await fs.mkdir(path.join(managedRoot, "chapters"), { recursive: true });
    await fs.writeFile(path.join(managedRoot, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));

    const report = await validateAllProjectMigrations();

    expect(report.schemaVersion).toBe("project-migration-batch-validation.v1");
    expect(report.status).toBe("blocked");
    expect(report.projects).toEqual([expect.objectContaining({ projectSlug: "legacy", status: "blocked", dependencies: { outlineVersion: "missing" }, blockers: ["outline-version-missing"] })]);
    expect(JSON.parse(await fs.readFile(path.join(managedRoot, "project.json"), "utf8"))).not.toHaveProperty("migration");
  });

  it("keeps the batch fingerprint stable when the read-only input is unchanged", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-batch-fingerprint-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const managedRoot = path.join(root, "stable");
    await fs.mkdir(path.join(managedRoot, "chapters"), { recursive: true });
    await fs.writeFile(path.join(managedRoot, "project.json"), JSON.stringify({ slug: "stable", chapters: [] }));

    const first = await previewAllProjectMigrations();
    const second = await previewAllProjectMigrations();

    expect(second.fingerprint).toBe(first.fingerprint);
  });
});
