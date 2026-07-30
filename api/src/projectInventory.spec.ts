import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProjectInventory } from "./projectInventory.js";

const roots: string[] = [];
function withFingerprint<T extends Record<string, unknown>>(value: T): T & { fingerprint: string } {
  return { ...value, fingerprint: crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex") };
}
afterEach(async () => { delete process.env.NOVELS_ROOT; await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("project migration inventory", () => {
  it("reports governance state without writing or treating legacy projects as activated", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-inventory-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const legacy = path.join(root, "legacy");
    const governed = path.join(root, "governed");
    await fs.mkdir(path.join(legacy, "chapters"), { recursive: true });
    await fs.mkdir(path.join(governed, "chapters"), { recursive: true });
    await fs.writeFile(path.join(legacy, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    await fs.writeFile(path.join(governed, "project.json"), JSON.stringify({ slug: "governed", outlineVersion: { versionId: "outline-1" }, chapters: [] }));
    await fs.mkdir(path.join(legacy, "sessions", "migrations"), { recursive: true });
    await fs.writeFile(path.join(legacy, "sessions", "migrations", "migration-preview-x.json"), JSON.stringify(withFingerprint({ projectSlug: "legacy", status: "preview_only" })));

    const inventory = await buildProjectInventory();
    expect(inventory.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectSlug: "legacy", governanceState: "migration-preview" }),
      expect.objectContaining({ projectSlug: "governed", governanceState: "governed" })
    ]));
  });

  it("does not infer activation from an unrelated migration artifact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-inventory-cross-project-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const projectRoot = path.join(root, "legacy");
    await fs.mkdir(path.join(projectRoot, "sessions", "migrations"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    await fs.writeFile(path.join(projectRoot, "sessions", "migrations", "other.activation.json"), JSON.stringify({ projectSlug: "other", status: "activated" }));

    const inventory = await buildProjectInventory();

    expect(inventory.projects).toEqual([expect.objectContaining({ projectSlug: "legacy", governanceState: "legacy" })]);
  });

  it("does not infer validation from an unrelated migration artifact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-inventory-cross-project-validation-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const projectRoot = path.join(root, "legacy");
    await fs.mkdir(path.join(projectRoot, "sessions", "migrations"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    await fs.writeFile(path.join(projectRoot, "sessions", "migrations", "other.validation.json"), JSON.stringify({ projectSlug: "other", status: "validated" }));

    const inventory = await buildProjectInventory();

    expect(inventory.projects).toEqual([expect.objectContaining({ projectSlug: "legacy", governanceState: "legacy" })]);
  });

  it("does not infer preview state from an unrelated migration artifact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-inventory-cross-project-preview-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const projectRoot = path.join(root, "legacy");
    await fs.mkdir(path.join(projectRoot, "sessions", "migrations"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    await fs.writeFile(path.join(projectRoot, "sessions", "migrations", "migration-preview-other.json"), JSON.stringify({ projectSlug: "other", status: "preview_only" }));

    const inventory = await buildProjectInventory();

    expect(inventory.projects).toEqual([expect.objectContaining({ projectSlug: "legacy", governanceState: "legacy" })]);
  });

  it("does not infer preview or validation from tampered project-owned artifacts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-inventory-tampered-transition-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const projectRoot = path.join(root, "legacy");
    await fs.mkdir(path.join(projectRoot, "sessions", "migrations"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    await fs.writeFile(path.join(projectRoot, "sessions", "migrations", "migration-preview-legacy.json"), JSON.stringify({ projectSlug: "legacy", status: "preview_only", fingerprint: "f".repeat(64) }));
    await fs.writeFile(path.join(projectRoot, "sessions", "migrations", "migration.validation.json"), JSON.stringify({ projectSlug: "legacy", status: "validated", fingerprint: "f".repeat(64) }));

    const inventory = await buildProjectInventory();

    expect(inventory.projects).toEqual([expect.objectContaining({ projectSlug: "legacy", governanceState: "legacy" })]);
  });

  it("does not infer activation from a tampered project-owned artifact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-inventory-tampered-activation-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const projectRoot = path.join(root, "legacy");
    await fs.mkdir(path.join(projectRoot, "sessions", "migrations"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    await fs.writeFile(path.join(projectRoot, "sessions", "migrations", "migration.activation.json"), JSON.stringify({
      schemaVersion: "project-migration-activation.v1", projectSlug: "legacy", status: "activated", writeAuthority: "prose-adoption", fingerprint: "f".repeat(64)
    }));

    const inventory = await buildProjectInventory();

    expect(inventory.projects).toEqual([expect.objectContaining({ projectSlug: "legacy", governanceState: "legacy" })]);
  });

  it("treats a valid rollback as the terminal migration state", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-inventory-rollback-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const projectRoot = path.join(root, "legacy");
    await fs.mkdir(path.join(projectRoot, "sessions", "migrations"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    await fs.writeFile(path.join(projectRoot, "sessions", "migrations", "migration.activation.json"), JSON.stringify(withFingerprint({
      schemaVersion: "project-migration-activation.v1", migrationId: "migration", projectSlug: "legacy", status: "activated", writeAuthority: "prose-adoption", sourceFingerprint: "source", activatedAt: "2026-07-30T00:00:00.000Z"
    })));
    await fs.writeFile(path.join(projectRoot, "sessions", "migrations", "migration.rollback.json"), JSON.stringify(withFingerprint({
      schemaVersion: "project-migration-rollback.v1", migrationId: "migration", projectSlug: "legacy", status: "rolled_back", activationFingerprint: "activation", rolledBackAt: "2026-07-30T00:01:00.000Z"
    })));

    const inventory = await buildProjectInventory();

    expect(inventory.projects).toEqual([expect.objectContaining({ projectSlug: "legacy", governanceState: "legacy" })]);
  });

  it("does not treat an activation with the wrong write authority as cut over", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "project-inventory-activation-authority-"));
    roots.push(root);
    process.env.NOVELS_ROOT = root;
    const projectRoot = path.join(root, "legacy");
    await fs.mkdir(path.join(projectRoot, "sessions", "migrations"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], migration: { state: "activated", migrationId: "migration" } }));
    await fs.writeFile(path.join(projectRoot, "sessions", "migrations", "migration.activation.json"), JSON.stringify(withFingerprint({
      schemaVersion: "project-migration-activation.v1", migrationId: "migration", projectSlug: "legacy", status: "activated", writeAuthority: "legacy", sourceFingerprint: "source", activatedAt: "2026-07-30T00:00:00.000Z"
    })));

    const inventory = await buildProjectInventory();

    expect(inventory.projects).toEqual([expect.objectContaining({ projectSlug: "legacy", governanceState: "migration-activation-incomplete" })]);
  });
});
