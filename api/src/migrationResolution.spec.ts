import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { previewProjectMigration } from "./migrationPreview.js";
import { readMigrationResolution, resolveMigrationConflicts } from "./migrationResolution.js";
import { activateProjectMigration, validateMigrationPreview } from "./migrationValidation.js";

describe("migration conflict resolution", () => {
  it("records an explicit outline authority choice and allows activation after revalidation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-resolution-"));
    await fs.mkdir(path.join(root, "outline"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }));
    await fs.writeFile(path.join(root, "outline", "ACTIVE-outline.md"), "active\n");
    await fs.writeFile(path.join(root, "outline", "ARCHIVED-outline.md"), "archived\n");

    const preview = await previewProjectMigration(root, "legacy");
    await validateMigrationPreview(root, "legacy", preview.migrationId);
    const resolution = await resolveMigrationConflicts(root, "legacy", preview.migrationId, "active");
    expect(resolution.status).toBe("resolved");
    expect(resolution.selectedOutlineAuthority).toBe("active");
    expect(await readMigrationResolution(root, preview.migrationId)).toEqual(resolution);

    const validation = await validateMigrationPreview(root, "legacy", preview.migrationId);
    expect(validation.conflicts).toEqual([]);
    expect(validation.resolvedConflicts).toContain("outline-authority-active-and-archived");
    await expect(activateProjectMigration(root, "legacy", preview.migrationId)).resolves.toMatchObject({ status: "activated" });
  });

  it("does not allow a conflicting second authority choice", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-resolution-conflict-"));
    await fs.mkdir(path.join(root, "outline"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    await fs.writeFile(path.join(root, "outline", "ACTIVE-outline.md"), "active\n");
    await fs.writeFile(path.join(root, "outline", "ARCHIVED-outline.md"), "archived\n");
    const preview = await previewProjectMigration(root, "legacy");
    await resolveMigrationConflicts(root, "legacy", preview.migrationId, "active");
    await expect(resolveMigrationConflicts(root, "legacy", preview.migrationId, "archived")).rejects.toThrow("MIGRATION_CONFLICT_RESOLUTION_CONFLICT");
  });

  it("rejects a tampered conflict resolution before revalidation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-resolution-tampered-"));
    await fs.mkdir(path.join(root, "outline"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }));
    await fs.writeFile(path.join(root, "outline", "ACTIVE-outline.md"), "active\n");
    await fs.writeFile(path.join(root, "outline", "ARCHIVED-outline.md"), "archived\n");
    const preview = await previewProjectMigration(root, "legacy");
    await resolveMigrationConflicts(root, "legacy", preview.migrationId, "active");
    const resolutionPath = path.join(root, "sessions", "migrations", `${preview.migrationId}.resolution.json`);
    const resolution = JSON.parse(await fs.readFile(resolutionPath, "utf8")) as Record<string, unknown>;
    await fs.writeFile(resolutionPath, JSON.stringify({ ...resolution, selectedOutlineAuthority: "archived" }));

    await expect(readMigrationResolution(root, preview.migrationId)).rejects.toThrow("MIGRATION_RESOLUTION_INTEGRITY_FAILED");
    await expect(validateMigrationPreview(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_RESOLUTION_INTEGRITY_FAILED");
  });

  it("rejects a validly hashed resolution bound to another project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-resolution-mismatch-"));
    await fs.mkdir(path.join(root, "outline"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }));
    await fs.writeFile(path.join(root, "outline", "ACTIVE-outline.md"), "active\n");
    await fs.writeFile(path.join(root, "outline", "ARCHIVED-outline.md"), "archived\n");
    const preview = await previewProjectMigration(root, "legacy");
    await resolveMigrationConflicts(root, "legacy", preview.migrationId, "active");
    const resolutionPath = path.join(root, "sessions", "migrations", `${preview.migrationId}.resolution.json`);
    const original = JSON.parse(await fs.readFile(resolutionPath, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...withoutFingerprint } = original;
    const mismatchedBase = { ...withoutFingerprint, projectSlug: "other-project" };
    const mismatched = { ...mismatchedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(mismatchedBase)).digest("hex") };
    await fs.writeFile(resolutionPath, JSON.stringify(mismatched));

    await expect(validateMigrationPreview(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_RESOLUTION_SEMANTIC_MISMATCH");
  });

  it("rejects a validly hashed resolution with an unknown authority", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-resolution-authority-mismatch-"));
    await fs.mkdir(path.join(root, "outline"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }));
    await fs.writeFile(path.join(root, "outline", "ACTIVE-outline.md"), "active\n");
    await fs.writeFile(path.join(root, "outline", "ARCHIVED-outline.md"), "archived\n");
    const preview = await previewProjectMigration(root, "legacy");
    await resolveMigrationConflicts(root, "legacy", preview.migrationId, "active");
    const resolutionPath = path.join(root, "sessions", "migrations", `${preview.migrationId}.resolution.json`);
    const original = JSON.parse(await fs.readFile(resolutionPath, "utf8")) as Record<string, unknown>;
    const { fingerprint: _fingerprint, ...withoutFingerprint } = original;
    const invalidBase = { ...withoutFingerprint, selectedOutlineAuthority: "unknown" };
    const invalid = { ...invalidBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(invalidBase)).digest("hex") };
    await fs.writeFile(resolutionPath, JSON.stringify(invalid));

    await expect(validateMigrationPreview(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_RESOLUTION_SEMANTIC_MISMATCH");
  });
});
