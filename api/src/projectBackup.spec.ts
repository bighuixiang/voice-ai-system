import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectBackup, listProjectBackups, readProjectBackup, verifyProjectBackup } from "./projectBackup.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("project backup manifest", () => {
  it("creates a verified local project-tree manifest without recursively backing up backups", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    await fs.mkdir(path.join(root, "sessions", "backups", "old"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), "{\"slug\":\"demo\"}\n");
    await fs.writeFile(path.join(root, "chapters", "chapter-001.md"), "draft\n");
    await fs.writeFile(path.join(root, "sessions", "backups", "old", "manifest.json"), "old\n");

    const manifest = await createProjectBackup(root, "demo");

    expect(manifest.status).toBe("verified");
    expect(manifest.faultDomain).toBe("same-workspace");
    expect(manifest.objects.map((item) => item.relativePath)).toEqual(["chapters/chapter-001.md", "project.json"]);
    expect(await readProjectBackup(root, manifest.backupId)).toEqual(manifest);
    await expect(verifyProjectBackup(root, manifest.backupId)).resolves.toMatchObject({ status: "verified", checked: 2, failures: [] });
  });

  it("reports tampered backup objects instead of claiming verification", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-tamper-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "original\n");
    const manifest = await createProjectBackup(root, "demo");
    const object = manifest.objects[0]!;
    await fs.writeFile(path.join(root, "sessions", "backups", manifest.backupId, "objects", object.relativePath), "tampered\n");

    await expect(verifyProjectBackup(root, manifest.backupId)).resolves.toMatchObject({ status: "failed", failures: ["project.json"] });
  });

  it("lists only discoverable backups for the requested project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-catalog-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "demo\n");
    const first = await createProjectBackup(root, "demo");
    const otherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-other-"));
    roots.push(otherRoot);
    await fs.writeFile(path.join(otherRoot, "project.json"), "other\n");
    await createProjectBackup(otherRoot, "other");

    const catalog = await listProjectBackups(root, "demo");

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({ backupId: first.backupId, projectSlug: "demo", status: "verified", faultDomain: "same-workspace", objectCount: 1 });
  });

  it("rejects a source tree that changes during capture", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-backup-source-change-"));
    roots.push(root);
    await fs.writeFile(path.join(root, "project.json"), "demo\n");
    process.env.NOVEL_BACKUP_INJECT_SOURCE_CHANGE = "1";
    await expect(createProjectBackup(root, "demo")).rejects.toThrow("PROJECT_BACKUP_SOURCE_CHANGED");
    delete process.env.NOVEL_BACKUP_INJECT_SOURCE_CHANGE;
    await expect(fs.readdir(path.join(root, "sessions", "backups"))).resolves.toEqual([]);
  });
});
