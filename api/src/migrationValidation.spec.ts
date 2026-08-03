import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activateProjectMigration, readMigrationActivation, readMigrationRollback, rollbackProjectMigration, validateMigrationPreview } from "./migrationValidation.js";
import { previewProjectMigration } from "./migrationPreview.js";
import { readProjectCapabilityManifest } from "./projectCapabilityManifest.js";
import { assertCapabilityWriteAllowed } from "./capabilityWriteGate.js";

describe("project migration validation and activation", () => {
  it("rejects stale previews and activates only with an outline dependency", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-validation-"));
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [{ id: "chapter-001", contentPath: "chapters/chapter-001.md", outlinePath: "outline/chapter-001.md" }] }));
    await fs.writeFile(path.join(root, "chapters", "chapter-001.md"), "legacy prose\n");
    const preview = await previewProjectMigration(root, "legacy");
    const validation = await validateMigrationPreview(root, "legacy", preview.migrationId);
    expect(validation.status).toBe("validated");
    await expect(activateProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_DEPENDENCY_MISSING");

    const project = JSON.parse(await fs.readFile(path.join(root, "project.json"), "utf8")) as Record<string, unknown>;
    project.outlineVersion = { versionId: "outline-1", fingerprint: "outline-fp" };
    await fs.writeFile(path.join(root, "project.json"), `${JSON.stringify(project)}\n`);
    const governedPreview = await previewProjectMigration(root, "legacy");
    await validateMigrationPreview(root, "legacy", governedPreview.migrationId);
    const beforeActivation = await fs.readFile(path.join(root, "project.json"), "utf8");
    process.env.NOVEL_MIGRATION_ACTIVATION_FAIL_AFTER_PROJECT_WRITE = "1";
    await expect(activateProjectMigration(root, "legacy", governedPreview.migrationId)).rejects.toThrow("MIGRATION_ACTIVATION_INJECTED_FAILURE");
    delete process.env.NOVEL_MIGRATION_ACTIVATION_FAIL_AFTER_PROJECT_WRITE;
    expect(await fs.readFile(path.join(root, "project.json"), "utf8")).toBe(beforeActivation);
    const activated = await activateProjectMigration(root, "legacy", governedPreview.migrationId);
    expect(activated.status).toBe("activated");
    expect(activated.migrationId).toBe(governedPreview.migrationId);

    await fs.appendFile(path.join(root, "chapters", "chapter-001.md"), "changed\n");
    await expect(validateMigrationPreview(root, "legacy", governedPreview.migrationId)).rejects.toThrow("MIGRATION_SOURCE_STALE");
  });

  it("blocks activation while migration source conflicts remain unresolved", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-conflict-activation-"));
    await fs.mkdir(path.join(root, "outline"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }));
    await fs.writeFile(path.join(root, "outline", "ACTIVE-outline.md"), "active\n");
    await fs.writeFile(path.join(root, "outline", "ARCHIVED-outline.md"), "archived\n");

    const preview = await previewProjectMigration(root, "legacy");
    const validation = await validateMigrationPreview(root, "legacy", preview.migrationId);

    expect(validation.conflicts).toContain("outline-authority-active-and-archived");
    await expect(activateProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_CONFLICTS_UNRESOLVED");
  });

  it("rejects activation when the source changes after validation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-stale-activation-"));
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [{ id: "chapter-001", contentPath: "chapters/chapter-001.md" }], outlineVersion: { versionId: "outline-1" } }));
    await fs.writeFile(path.join(root, "chapters", "chapter-001.md"), "before\n");
    const preview = await previewProjectMigration(root, "legacy");
    await validateMigrationPreview(root, "legacy", preview.migrationId);
    await fs.appendFile(path.join(root, "chapters", "chapter-001.md"), "after\n");

    await expect(activateProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_SOURCE_STALE");
  });

  it("invalidates validation when a legacy scene card changes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-scene-card-stale-"));
    await fs.mkdir(path.join(root, "sessions", "scene-cards"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }));
    await fs.writeFile(path.join(root, "sessions", "scene-cards", "scene-001.json"), JSON.stringify({ id: "scene-001", purpose: "setup" }));
    const preview = await previewProjectMigration(root, "legacy");
    await validateMigrationPreview(root, "legacy", preview.migrationId);
    await fs.writeFile(path.join(root, "sessions", "scene-cards", "scene-001.json"), JSON.stringify({ id: "scene-001", purpose: "payoff" }));

    await expect(activateProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_SOURCE_STALE");
  });

  it("rolls back activation atomically and keeps the activation audit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-rollback-"));
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    const original = { slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } };
    await fs.writeFile(path.join(root, "project.json"), `${JSON.stringify(original)}\n`);
    const preview = await previewProjectMigration(root, "legacy");
    await validateMigrationPreview(root, "legacy", preview.migrationId);
    const activation = await activateProjectMigration(root, "legacy", preview.migrationId);
    const rolledBack = await rollbackProjectMigration(root, "legacy", preview.migrationId);

    expect(rolledBack.status).toBe("rolled_back");
    expect(rolledBack.activationFingerprint).toBe(activation.fingerprint);
    expect(JSON.parse(await fs.readFile(path.join(root, "project.json"), "utf8"))).toEqual(original);
    expect(await readMigrationRollback(root, preview.migrationId)).toEqual(rolledBack);
    expect(await fs.readFile(path.join(root, "sessions", "migrations", `${preview.migrationId}.activation.json`), "utf8")).toContain("activated");
  });

  it("restores the active project when rollback fails after the project write", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-rollback-failure-"));
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }));
    const preview = await previewProjectMigration(root, "legacy");
    await validateMigrationPreview(root, "legacy", preview.migrationId);
    await activateProjectMigration(root, "legacy", preview.migrationId);
    const before = await fs.readFile(path.join(root, "project.json"), "utf8");
    process.env.NOVEL_MIGRATION_ROLLBACK_FAIL_AFTER_PROJECT_WRITE = "1";
    await expect(rollbackProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_ROLLBACK_INJECTED_FAILURE");
    delete process.env.NOVEL_MIGRATION_ROLLBACK_FAIL_AFTER_PROJECT_WRITE;
    expect(await fs.readFile(path.join(root, "project.json"), "utf8")).toBe(before);
    expect(await readMigrationRollback(root, preview.migrationId)).toBeNull();
  });

  it("rejects a tampered validation artifact before activation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-tampered-validation-"));
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }), "utf8");
    const preview = await previewProjectMigration(root, "legacy");
    const validation = await validateMigrationPreview(root, "legacy", preview.migrationId);
    const validationPath = path.join(root, "sessions", "migrations", `${preview.migrationId}.validation.json`);
    await fs.writeFile(validationPath, JSON.stringify({ ...validation, conflicts: ["tampered"] }), "utf8");

    await expect(activateProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_VALIDATION_INTEGRITY_FAILED");
  });

  it("rejects a tampered activation artifact before rollback", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-tampered-activation-"));
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }), "utf8");
    const preview = await previewProjectMigration(root, "legacy");
    await validateMigrationPreview(root, "legacy", preview.migrationId);
    const activation = await activateProjectMigration(root, "legacy", preview.migrationId);
    const activationPath = path.join(root, "sessions", "migrations", `${preview.migrationId}.activation.json`);
    await fs.writeFile(activationPath, JSON.stringify({ ...activation, writeAuthority: "legacy" }), "utf8");

    await expect(rollbackProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_ACTIVATION_INTEGRITY_FAILED");
  });

  it("does not reuse an activation after its source becomes stale", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-stale-idempotent-activation-"));
    await fs.mkdir(path.join(root, "chapters"), { recursive: true });
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [{ id: "chapter-001", contentPath: "chapters/chapter-001.md" }], outlineVersion: { versionId: "outline-1" } }), "utf8");
    await fs.writeFile(path.join(root, "chapters", "chapter-001.md"), "before\n", "utf8");
    const preview = await previewProjectMigration(root, "legacy");
    await validateMigrationPreview(root, "legacy", preview.migrationId);
    await activateProjectMigration(root, "legacy", preview.migrationId);
    await fs.appendFile(path.join(root, "chapters", "chapter-001.md"), "after\n", "utf8");

    await expect(activateProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_SOURCE_STALE");
  });

  it("rejects a semantically mismatched but validly hashed activation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-mismatched-activation-"));
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }), "utf8");
    const preview = await previewProjectMigration(root, "legacy");
    const validation = await validateMigrationPreview(root, "legacy", preview.migrationId);
    const activationBase = {
      schemaVersion: "project-migration-activation.v1",
      migrationId: preview.migrationId,
      projectSlug: "legacy",
      status: "activated",
      writeAuthority: "prose-adoption",
      sourceFingerprint: "f".repeat(64),
      activatedAt: new Date().toISOString()
    };
    const activation = { ...activationBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(activationBase)).digest("hex") };
    const activationPath = path.join(root, "sessions", "migrations", `${preview.migrationId}.activation.json`);
    await fs.mkdir(path.dirname(activationPath), { recursive: true });
    await fs.writeFile(activationPath, JSON.stringify(activation));

    await expect(activateProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_ACTIVATION_SOURCE_MISMATCH");
    expect(validation.sourceFingerprint).not.toBe(activation.sourceFingerprint);
  });

  it("rejects a rollback artifact bound to another activation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-mismatched-rollback-"));
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }), "utf8");
    const preview = await previewProjectMigration(root, "legacy");
    await validateMigrationPreview(root, "legacy", preview.migrationId);
    const activation = await activateProjectMigration(root, "legacy", preview.migrationId);
    const rollbackBase = {
      schemaVersion: "project-migration-rollback.v1",
      migrationId: preview.migrationId,
      projectSlug: "legacy",
      status: "rolled_back",
      activationFingerprint: "f".repeat(64),
      rolledBackAt: new Date().toISOString()
    };
    const rollback = { ...rollbackBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(rollbackBase)).digest("hex") };
    const rollbackPath = path.join(root, "sessions", "migrations", `${preview.migrationId}.rollback.json`);
    await fs.mkdir(path.dirname(rollbackPath), { recursive: true });
    await fs.writeFile(rollbackPath, JSON.stringify(rollback));

    await expect(rollbackProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_ROLLBACK_ACTIVATION_MISMATCH");
    expect(activation.fingerprint).not.toBe(rollback.activationFingerprint);
  });

  it("rejects a validation artifact whose content migration id differs from its path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-validation-id-mismatch-"));
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }), "utf8");
    const preview = await previewProjectMigration(root, "legacy");
    const validation = await validateMigrationPreview(root, "legacy", preview.migrationId);
    const { fingerprint: _fingerprint, ...validationBase } = validation;
    const mismatchedBase = { ...validationBase, migrationId: "other-migration" };
    const mismatched = { ...mismatchedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(mismatchedBase)).digest("hex") };
    const validationPath = path.join(root, "sessions", "migrations", `${preview.migrationId}.validation.json`);
    await fs.writeFile(validationPath, JSON.stringify(mismatched));

    await expect(activateProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_VALIDATION_SEMANTIC_MISMATCH");
  });

  it("rejects a validly hashed validation artifact with invalid semantic fields", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-validation-fields-"));
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }));
    const preview = await previewProjectMigration(root, "legacy");
    const validation = await validateMigrationPreview(root, "legacy", preview.migrationId);
    const { fingerprint: _fingerprint, ...validationBase } = validation;
    const malformedBase = { ...validationBase, conflicts: "not-an-array" };
    const malformed = { ...malformedBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(malformedBase)).digest("hex") };
    const validationPath = path.join(root, "sessions", "migrations", `${preview.migrationId}.validation.json`);
    await fs.writeFile(validationPath, JSON.stringify(malformed));

    await expect(activateProjectMigration(root, "legacy", preview.migrationId)).rejects.toThrow("MIGRATION_VALIDATION_SEMANTIC_MISMATCH");
  });

  it("rejects validly hashed activation and rollback artifacts with invalid semantic fields", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-artifact-fields-"));
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [] }));
    const preview = await previewProjectMigration(root, "legacy");
    const migrationsDir = path.join(root, "sessions", "migrations");
    await fs.mkdir(migrationsDir, { recursive: true });
    const activationBase = {
      schemaVersion: "project-migration-activation.v1",
      migrationId: preview.migrationId,
      projectSlug: "legacy",
      status: "activated",
      writeAuthority: "invalid-authority",
      sourceFingerprint: "f".repeat(64),
      activatedAt: new Date().toISOString()
    };
    await fs.writeFile(path.join(migrationsDir, `${preview.migrationId}.activation.json`), JSON.stringify({ ...activationBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(activationBase)).digest("hex") }));
    await expect(readMigrationActivation(root, preview.migrationId)).rejects.toThrow("MIGRATION_ACTIVATION_SEMANTIC_MISMATCH");

    const rollbackBase = {
      schemaVersion: "project-migration-rollback.v1",
      migrationId: preview.migrationId,
      projectSlug: "legacy",
      status: "invalid-status",
      activationFingerprint: "f".repeat(64),
      rolledBackAt: new Date().toISOString()
    };
    await fs.writeFile(path.join(migrationsDir, `${preview.migrationId}.rollback.json`), JSON.stringify({ ...rollbackBase, fingerprint: crypto.createHash("sha256").update(JSON.stringify(rollbackBase)).digest("hex") }));
    await expect(readMigrationRollback(root, preview.migrationId)).rejects.toThrow("MIGRATION_ROLLBACK_SEMANTIC_MISMATCH");
  });

  it("rejects keyed replay against a legacy activation without an idempotency key", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-keyed-replay-"));
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }), "utf8");
    const preview = await previewProjectMigration(root, "legacy");
    const validation = await validateMigrationPreview(root, "legacy", preview.migrationId);
    const legacyActivation = await activateProjectMigration(root, "legacy", preview.migrationId);
    expect(legacyActivation.idempotencyKey).toBeUndefined();

    await expect(activateProjectMigration(root, "legacy", preview.migrationId, {
      idempotencyKey: "api-request-1",
      expectedValidationFingerprint: validation.fingerprint
    })).rejects.toThrow("MIGRATION_ACTIVATION_IDEMPOTENCY_MISSING");
  });

  it("installs a restricted capability front door on activation and removes it on rollback", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "novel-migration-capability-front-door-"));
    await fs.writeFile(path.join(root, "project.json"), JSON.stringify({ slug: "legacy", chapters: [], outlineVersion: { versionId: "outline-1" } }), "utf8");
    const preview = await previewProjectMigration(root, "legacy");
    await validateMigrationPreview(root, "legacy", preview.migrationId);

    const activation = await activateProjectMigration(root, "legacy", preview.migrationId);
    const manifest = await readProjectCapabilityManifest(root, "legacy");
    expect(manifest).toMatchObject({ migrationStatus: "verified", writable: ["runtime", "session", "delivery"], missingDependencies: ["runtime-migration-capability-proof"] });
    expect(activation.capabilityManifestCreated).toBe(true);
    await expect(assertCapabilityWriteAllowed(root, "legacy", "runtime")).rejects.toThrow("CAPABILITY_DEPENDENCY_BLOCKED:runtime");

    await rollbackProjectMigration(root, "legacy", preview.migrationId);
    expect(await readProjectCapabilityManifest(root, "legacy")).toBeNull();
  });
});
