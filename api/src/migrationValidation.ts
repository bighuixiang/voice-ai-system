import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { previewProjectMigration, readMigrationPreview, type MigrationPreview } from "./migrationPreview.js";
import { readMigrationResolution } from "./migrationResolution.js";
import { createCapabilityDependencyProof, createProjectCapabilityManifest } from "./deliveryGovernance.js";
import { readProjectCapabilityManifest, removeProjectCapabilityManifest, writeProjectCapabilityManifest } from "./projectCapabilityManifest.js";
import { readCapabilityDependencyProof, removeCapabilityDependencyProof, writeCapabilityDependencyProof } from "./capabilityDependencyStore.js";

export interface MigrationValidation {
  schemaVersion: "project-migration-validation.v1";
  migrationId: string;
  projectSlug: string;
  status: "validated";
  sourceFingerprint: string;
  conflicts: string[];
  resolvedConflicts: string[];
  dependencies: { outlineVersion: "ready" | "missing" };
  validatedAt: string;
  fingerprint: string;
}

export interface MigrationActivation {
  schemaVersion: "project-migration-activation.v1";
  migrationId: string;
  projectSlug: string;
  status: "activated";
  writeAuthority: "prose-adoption";
  sourceFingerprint: string;
  idempotencyKey?: string;
  expectedValidationFingerprint?: string;
  capabilityManifestCreated?: boolean;
  capabilityDependencyProofCreated?: boolean;
  capabilityManifestFingerprint?: string;
  capabilityDependencyProofFingerprint?: string;
  activatedAt: string;
  fingerprint: string;
}

async function installMigrationCapabilityFrontDoor(root: string, projectSlug: string, migrationId: string): Promise<{ manifestCreated: boolean; proofCreated: boolean; manifestFingerprint?: string; proofFingerprint?: string }> {
  const existingManifest = await readProjectCapabilityManifest(root, projectSlug);
  if (existingManifest) return { manifestCreated: false, proofCreated: false };
  const manifest = createProjectCapabilityManifest({
    projectId: projectSlug,
    projectSchemaVersion: "v1",
    enabledSlices: ["runtime", "session", "delivery"],
    readable: ["runtime", "session", "delivery"],
    writable: ["runtime", "session", "delivery"],
    migrationStatus: "verified",
    rollbackWindow: "24h",
    missingDependencies: ["runtime-migration-capability-proof"]
  });
  await writeProjectCapabilityManifest(root, manifest);
  const existingProof = await readCapabilityDependencyProof(root, "runtime", projectSlug);
  if (!existingProof) {
    await writeCapabilityDependencyProof(root, createCapabilityDependencyProof({
      projectSlug,
      sliceId: "runtime",
      requiredKernels: [{ id: "K0-contract", version: "v1", verifiedBy: [`migration:${migrationId}`] }],
      writeAuthority: "migration-runtime-gate",
      unmet: ["migration-capability-proof-required"]
    }));
    return { manifestCreated: true, proofCreated: true, manifestFingerprint: manifest.fingerprint, proofFingerprint: (await readCapabilityDependencyProof(root, "runtime", projectSlug))?.fingerprint };
  }
  return { manifestCreated: true, proofCreated: false, manifestFingerprint: manifest.fingerprint };
}

export interface MigrationRollback {
  schemaVersion: "project-migration-rollback.v1";
  migrationId: string;
  projectSlug: string;
  status: "rolled_back";
  activationFingerprint: string;
  rolledBackAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hasValidFingerprint(value: Record<string, unknown>): boolean {
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(value.fingerprint)) return false;
  const { fingerprint: _fingerprint, ...base } = value;
  return hash(base) === value.fingerprint;
}
function hasValidTimestamp(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function hasValidValidationSemantics(value: MigrationValidation): boolean {
  return value.schemaVersion === "project-migration-validation.v1"
    && typeof value.migrationId === "string" && value.migrationId.length > 0
    && typeof value.projectSlug === "string" && value.projectSlug.length > 0
    && value.status === "validated"
    && typeof value.sourceFingerprint === "string" && /^[a-f0-9]{64}$/i.test(value.sourceFingerprint)
    && Array.isArray(value.conflicts) && value.conflicts.every((item) => typeof item === "string")
    && Array.isArray(value.resolvedConflicts) && value.resolvedConflicts.every((item) => typeof item === "string")
    && value.dependencies && (value.dependencies.outlineVersion === "ready" || value.dependencies.outlineVersion === "missing")
    && hasValidTimestamp(value.validatedAt);
}
function hasValidActivationSemantics(value: MigrationActivation, migrationId: string): boolean {
  return value.schemaVersion === "project-migration-activation.v1"
    && value.migrationId === migrationId
    && typeof value.projectSlug === "string" && value.projectSlug.length > 0
    && value.status === "activated"
    && value.writeAuthority === "prose-adoption"
    && typeof value.sourceFingerprint === "string" && /^[a-f0-9]{64}$/i.test(value.sourceFingerprint)
    && (value.idempotencyKey === undefined || (typeof value.idempotencyKey === "string" && value.idempotencyKey.length > 0))
    && (value.expectedValidationFingerprint === undefined || /^[a-f0-9]{64}$/i.test(value.expectedValidationFingerprint))
    && hasValidTimestamp(value.activatedAt);
}
function hasValidRollbackSemantics(value: MigrationRollback, migrationId: string): boolean {
  return value.schemaVersion === "project-migration-rollback.v1"
    && value.migrationId === migrationId
    && typeof value.projectSlug === "string" && value.projectSlug.length > 0
    && value.status === "rolled_back"
    && typeof value.activationFingerprint === "string" && /^[a-f0-9]{64}$/i.test(value.activationFingerprint)
    && hasValidTimestamp(value.rolledBackAt);
}
function validationPath(root: string, migrationId: string): string { return resolveInside(root, `sessions/migrations/${migrationId}.validation.json`); }
function activationPath(root: string, migrationId: string): string { return resolveInside(root, `sessions/migrations/${migrationId}.activation.json`); }
function rollbackPath(root: string, migrationId: string): string { return resolveInside(root, `sessions/migrations/${migrationId}.rollback.json`); }

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

async function readJson<T>(target: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(target, "utf8")) as T; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function readMigrationValidation(root: string, migrationId: string): Promise<MigrationValidation | null> {
  const value = await readJson<MigrationValidation>(validationPath(root, migrationId));
  if (value && !hasValidFingerprint(value as unknown as Record<string, unknown>)) throw new Error("MIGRATION_VALIDATION_INTEGRITY_FAILED");
  if (value && (!hasValidValidationSemantics(value) || value.migrationId !== migrationId)) throw new Error("MIGRATION_VALIDATION_SEMANTIC_MISMATCH");
  return value;
}

export async function readMigrationActivation(root: string, migrationId: string): Promise<MigrationActivation | null> {
  const value = await readJson<MigrationActivation>(activationPath(root, migrationId));
  if (value && !hasValidFingerprint(value as unknown as Record<string, unknown>)) throw new Error("MIGRATION_ACTIVATION_INTEGRITY_FAILED");
  if (value && !hasValidActivationSemantics(value, migrationId)) throw new Error("MIGRATION_ACTIVATION_SEMANTIC_MISMATCH");
  return value;
}

export async function readMigrationRollback(root: string, migrationId: string): Promise<MigrationRollback | null> {
  const value = await readJson<MigrationRollback>(rollbackPath(root, migrationId));
  if (value && !hasValidFingerprint(value as unknown as Record<string, unknown>)) throw new Error("MIGRATION_ROLLBACK_INTEGRITY_FAILED");
  if (value && !hasValidRollbackSemantics(value, migrationId)) throw new Error("MIGRATION_ROLLBACK_SEMANTIC_MISMATCH");
  return value;
}

export async function validateMigrationPreview(root: string, projectSlug: string, migrationId: string): Promise<MigrationValidation> {
  const preview = await readMigrationPreview(root, migrationId);
  if (!preview) throw new Error("MIGRATION_PREVIEW_NOT_FOUND");
  const current = await previewProjectMigration(root, projectSlug);
  if (current.sourceFingerprint !== preview.sourceFingerprint) throw new Error("MIGRATION_SOURCE_STALE");
  const project = JSON.parse(await fs.readFile(resolveInside(root, "project.json"), "utf8")) as { outlineVersion?: { versionId?: string } };
  const resolution = await readMigrationResolution(root, migrationId);
  if (resolution && (resolution.migrationId !== migrationId || resolution.projectSlug !== projectSlug || resolution.status !== "resolved" || (resolution.selectedOutlineAuthority !== "active" && resolution.selectedOutlineAuthority !== "archived"))) {
    throw new Error("MIGRATION_RESOLUTION_SEMANTIC_MISMATCH");
  }
  if (resolution?.resolvedConflicts.some((conflict) => !preview.conflicts.includes(conflict))) {
    throw new Error("MIGRATION_RESOLUTION_CONFLICT_MISMATCH");
  }
  const resolvedConflicts = resolution?.resolvedConflicts || [];
  const conflicts = preview.conflicts.filter((conflict) => !resolvedConflicts.includes(conflict));
  const base = {
    schemaVersion: "project-migration-validation.v1" as const,
    migrationId,
    projectSlug,
    status: "validated" as const,
    sourceFingerprint: preview.sourceFingerprint,
    conflicts,
    resolvedConflicts,
    dependencies: { outlineVersion: project.outlineVersion?.versionId ? "ready" as const : "missing" as const },
    validatedAt: new Date().toISOString()
  };
  const validation: MigrationValidation = { ...base, fingerprint: hash(base) };
  await writeJson(validationPath(root, migrationId), validation);
  return validation;
}

export async function activateProjectMigration(root: string, projectSlug: string, migrationId: string, input: { idempotencyKey?: string; expectedValidationFingerprint?: string } = {}): Promise<MigrationActivation> {
  const validation = await readMigrationValidation(root, migrationId);
  if (!validation || validation.status !== "validated") throw new Error("MIGRATION_VALIDATION_REQUIRED");
  if (validation.projectSlug !== projectSlug) throw new Error("MIGRATION_PROJECT_MISMATCH");
  if (input.expectedValidationFingerprint && input.expectedValidationFingerprint !== validation.fingerprint) throw new Error("MIGRATION_VALIDATION_FINGERPRINT_STALE");
  const existing = await readMigrationActivation(root, migrationId);
  if (existing) {
    if (existing.migrationId !== validation.migrationId || existing.projectSlug !== projectSlug || existing.status !== "activated" || existing.writeAuthority !== "prose-adoption") {
      throw new Error("MIGRATION_ACTIVATION_SEMANTIC_MISMATCH");
    }
    if (existing.sourceFingerprint !== validation.sourceFingerprint) throw new Error("MIGRATION_ACTIVATION_SOURCE_MISMATCH");
    if (input.idempotencyKey && !existing.idempotencyKey) throw new Error("MIGRATION_ACTIVATION_IDEMPOTENCY_MISSING");
    if (!input.idempotencyKey) {
      const current = await previewProjectMigration(root, projectSlug);
      if (current.sourceFingerprint !== validation.sourceFingerprint) throw new Error("MIGRATION_SOURCE_STALE");
    }
    if (existing.idempotencyKey && input.idempotencyKey && existing.idempotencyKey !== input.idempotencyKey) throw new Error("MIGRATION_ACTIVATION_IDEMPOTENCY_MISMATCH");
    return existing;
  }
  const current = await previewProjectMigration(root, projectSlug);
  if (current.sourceFingerprint !== validation.sourceFingerprint) throw new Error("MIGRATION_SOURCE_STALE");
  if (validation.conflicts.length > 0) throw new Error("MIGRATION_CONFLICTS_UNRESOLVED");
  if (validation.dependencies.outlineVersion !== "ready") throw new Error("MIGRATION_DEPENDENCY_MISSING");
  const projectPath = resolveInside(root, "project.json");
  const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as Record<string, unknown>;
  const outlineVersion = project.outlineVersion as { versionId?: string } | undefined;
  if (!outlineVersion?.versionId) throw new Error("MIGRATION_DEPENDENCY_MISSING");
  const now = new Date().toISOString();
  const capabilityFrontDoor = await installMigrationCapabilityFrontDoor(root, projectSlug, migrationId);
  const base = {
    schemaVersion: "project-migration-activation.v1" as const,
    migrationId,
    projectSlug,
    status: "activated" as const,
    writeAuthority: "prose-adoption" as const,
    sourceFingerprint: validation.sourceFingerprint,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.expectedValidationFingerprint ? { expectedValidationFingerprint: input.expectedValidationFingerprint } : {}),
    ...(capabilityFrontDoor.manifestCreated ? { capabilityManifestCreated: true } : {}),
    ...(capabilityFrontDoor.proofCreated ? { capabilityDependencyProofCreated: true } : {}),
    ...(capabilityFrontDoor.manifestFingerprint ? { capabilityManifestFingerprint: capabilityFrontDoor.manifestFingerprint } : {}),
    ...(capabilityFrontDoor.proofFingerprint ? { capabilityDependencyProofFingerprint: capabilityFrontDoor.proofFingerprint } : {}),
    activatedAt: now
  };
  const activation: MigrationActivation = { ...base, fingerprint: hash(base) };
  const nextProject = { ...project, migration: { state: "activated", migrationId, writeAuthority: "prose-adoption", activatedAt: now } };
  const originalProject = await fs.readFile(projectPath, "utf8");
  try {
    await writeJson(projectPath, nextProject);
    if (process.env.NOVEL_MIGRATION_ACTIVATION_FAIL_AFTER_PROJECT_WRITE === "1") {
      throw new Error("MIGRATION_ACTIVATION_INJECTED_FAILURE");
    }
    await writeJson(activationPath(root, migrationId), activation);
  } catch (error) {
    await fs.writeFile(projectPath, originalProject, "utf8");
    await fs.rm(activationPath(root, migrationId), { force: true });
    if (capabilityFrontDoor.proofCreated) await removeCapabilityDependencyProof(root, "runtime", capabilityFrontDoor.proofFingerprint);
    if (capabilityFrontDoor.manifestCreated) await removeProjectCapabilityManifest(root, projectSlug, capabilityFrontDoor.manifestFingerprint);
    throw error;
  }
  return activation;
}

export async function rollbackProjectMigration(root: string, projectSlug: string, migrationId: string): Promise<MigrationRollback> {
  const activation = await readMigrationActivation(root, migrationId);
  if (!activation || activation.status !== "activated") throw new Error("MIGRATION_ACTIVATION_REQUIRED");
  if (activation.projectSlug !== projectSlug) throw new Error("MIGRATION_PROJECT_MISMATCH");
  const existing = await readMigrationRollback(root, migrationId);
  if (existing) {
    if (existing.migrationId !== migrationId || existing.projectSlug !== projectSlug || existing.status !== "rolled_back") {
      throw new Error("MIGRATION_ROLLBACK_SEMANTIC_MISMATCH");
    }
    if (existing.activationFingerprint !== activation.fingerprint) throw new Error("MIGRATION_ROLLBACK_ACTIVATION_MISMATCH");
    return existing;
  }
  const projectPath = resolveInside(root, "project.json");
  const project = JSON.parse(await fs.readFile(projectPath, "utf8")) as Record<string, unknown>;
  const migration = project.migration as { migrationId?: string; state?: string } | undefined;
  if (migration?.migrationId !== migrationId || migration.state !== "activated") throw new Error("MIGRATION_NOT_ACTIVE");
  if (activation.capabilityManifestCreated) {
    const manifest = await readProjectCapabilityManifest(root, projectSlug);
    if (!manifest || (activation.capabilityManifestFingerprint && manifest.fingerprint !== activation.capabilityManifestFingerprint)) throw new Error("CAPABILITY_MANIFEST_STALE");
  }
  if (activation.capabilityDependencyProofCreated) {
    const proof = await readCapabilityDependencyProof(root, "runtime", projectSlug);
    if (!proof || (activation.capabilityDependencyProofFingerprint && proof.fingerprint !== activation.capabilityDependencyProofFingerprint)) throw new Error("CAPABILITY_DEPENDENCY_STALE");
  }
  const { migration: _removed, ...projectWithoutMigration } = project;
  const base = {
    schemaVersion: "project-migration-rollback.v1" as const,
    migrationId,
    projectSlug,
    status: "rolled_back" as const,
    activationFingerprint: activation.fingerprint,
    rolledBackAt: new Date().toISOString()
  };
  const rollback: MigrationRollback = { ...base, fingerprint: hash(base) };
  const originalProject = await fs.readFile(projectPath, "utf8");
  try {
    await writeJson(projectPath, projectWithoutMigration);
    if (process.env.NOVEL_MIGRATION_ROLLBACK_FAIL_AFTER_PROJECT_WRITE === "1") {
      throw new Error("MIGRATION_ROLLBACK_INJECTED_FAILURE");
    }
    await writeJson(rollbackPath(root, migrationId), rollback);
  } catch (error) {
    await fs.writeFile(projectPath, originalProject, "utf8");
    await fs.rm(rollbackPath(root, migrationId), { force: true });
    throw error;
  }
  if (activation.capabilityDependencyProofCreated) await removeCapabilityDependencyProof(root, "runtime", activation.capabilityDependencyProofFingerprint);
  if (activation.capabilityManifestCreated) await removeProjectCapabilityManifest(root, projectSlug, activation.capabilityManifestFingerprint);
  return rollback;
}
