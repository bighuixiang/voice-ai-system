import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { previewProjectMigration, readMigrationPreview } from "./migrationPreview.js";

describe("project migration preview", () => {
  it("scans legacy assets without changing project canon and is idempotent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-preview-"));
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    await fs.mkdir(path.join(root, "outline"), { recursive: true });
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [{ id: "chapter-001", contentPath: "chapters/chapter-001.md", outlinePath: "outline/chapter-001.md" }] }));
    await fs.writeFile(path.join(root, "chapters", "chapter-001.md"), "legacy prose\n");
    await fs.writeFile(path.join(root, "outline", "chapter-001.md"), "legacy outline\n");

    const first = await previewProjectMigration(root, "legacy");
    const second = await previewProjectMigration(root, "legacy");
    expect(first).toEqual(second);
    expect(first.status).toBe("preview_only");
    expect(first.assetCounts).toMatchObject({ chapters: 1, outlines: 1 });
    expect(first.writeAuthority).toBe("legacy_compatibility_only");
    expect(await fs.readFile(path.join(root, "chapters", "chapter-001.md"), "utf8")).toBe("legacy prose\n");
    expect(await readMigrationPreview(root, first.migrationId)).toEqual(first);
  });

  it("preserves active and archived outline authority conflicts for review", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-conflict-"));
    await fs.mkdir(path.join(root, "outline"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    await fs.writeFile(path.join(root, "outline", "ACTIVE-outline.md"), "active outline\n");
    await fs.writeFile(path.join(root, "outline", "ARCHIVED-outline.md"), "archived outline\n");

    const preview = await previewProjectMigration(root, "legacy");

    expect(preview.conflicts).toContain("outline-authority-active-and-archived");
  });

  it("invalidates a preview when outline authority markers change", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-conflict-stale-"));
    await fs.mkdir(path.join(root, "outline"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    await fs.writeFile(path.join(root, "outline", "ACTIVE-outline.md"), "active outline\n");

    const first = await previewProjectMigration(root, "legacy");
    await fs.writeFile(path.join(root, "outline", "ARCHIVED-outline.md"), "archived outline\n");
    const second = await previewProjectMigration(root, "legacy");

    expect(second.migrationId).not.toBe(first.migrationId);
    expect(second.conflicts).toContain("outline-authority-active-and-archived");
  });

  it("rejects a tampered persisted preview instead of reusing it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-preview-tampered-"));
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    const first = await previewProjectMigration(root, "legacy");
    const previewPath = path.join(root, "sessions", "migrations", `${first.migrationId}.json`);
    await fs.writeFile(previewPath, JSON.stringify({ ...first, conflicts: ["tampered"] }));

    await expect(readMigrationPreview(root, first.migrationId)).rejects.toThrow("MIGRATION_PREVIEW_INTEGRITY_FAILED");
    await expect(previewProjectMigration(root, "legacy")).rejects.toThrow("MIGRATION_PREVIEW_INTEGRITY_FAILED");
  });

  it("rejects a validly hashed preview with mismatched identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-preview-identity-mismatch-"));
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    const first = await previewProjectMigration(root, "legacy");
    const { fingerprint: _fingerprint, ...previewBase } = first;
    const mismatchedBase = { ...previewBase, migrationId: "other-migration", status: "validated" };
    const mismatched = { ...mismatchedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(mismatchedBase)).digest("hex") };
    const previewPath = path.join(root, "sessions", "migrations", `${first.migrationId}.json`);
    await fs.writeFile(previewPath, JSON.stringify(mismatched));

    await expect(readMigrationPreview(root, first.migrationId)).rejects.toThrow("MIGRATION_PREVIEW_SEMANTIC_MISMATCH");
  });
});
