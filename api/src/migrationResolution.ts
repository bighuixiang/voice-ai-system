import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readMigrationPreview } from "./migrationPreview.js";

export type OutlineAuthority = "active" | "archived";

export interface MigrationResolution {
  schemaVersion: "project-migration-resolution.v1";
  migrationId: string;
  projectSlug: string;
  status: "resolved";
  selectedOutlineAuthority: OutlineAuthority;
  resolvedConflicts: string[];
  resolvedAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hasValidFingerprint(value: Record<string, unknown>): boolean {
  if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(value.fingerprint)) return false;
  const { fingerprint: _fingerprint, ...base } = value;
  return hash(base) === value.fingerprint;
}
function hasValidSemantics(value: MigrationResolution, migrationId: string): boolean {
  return value.schemaVersion === "project-migration-resolution.v1"
    && value.migrationId === migrationId
    && typeof value.projectSlug === "string" && value.projectSlug.length > 0
    && value.status === "resolved"
    && (value.selectedOutlineAuthority === "active" || value.selectedOutlineAuthority === "archived")
    && Array.isArray(value.resolvedConflicts) && value.resolvedConflicts.every((item) => typeof item === "string")
    && typeof value.resolvedAt === "string" && Number.isFinite(Date.parse(value.resolvedAt));
}
function resolutionPath(root: string, migrationId: string): string { return resolveInside(root, `sessions/migrations/${migrationId}.resolution.json`); }

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function readMigrationResolution(root: string, migrationId: string): Promise<MigrationResolution | null> {
  try {
    const value = JSON.parse(await fs.readFile(resolutionPath(root, migrationId), "utf8")) as MigrationResolution;
    if (!hasValidFingerprint(value as unknown as Record<string, unknown>)) throw new Error("MIGRATION_RESOLUTION_INTEGRITY_FAILED");
    if (!hasValidSemantics(value, migrationId)) throw new Error("MIGRATION_RESOLUTION_SEMANTIC_MISMATCH");
    return value;
  }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function resolveMigrationConflicts(root: string, projectSlug: string, migrationId: string, selectedOutlineAuthority: OutlineAuthority): Promise<MigrationResolution> {
  if (selectedOutlineAuthority !== "active" && selectedOutlineAuthority !== "archived") throw new Error("MIGRATION_OUTLINE_AUTHORITY_INVALID");
  const preview = await readMigrationPreview(root, migrationId);
  if (!preview || preview.projectSlug !== projectSlug) throw new Error("MIGRATION_PREVIEW_NOT_FOUND");
  if (!preview.conflicts.includes("outline-authority-active-and-archived")) throw new Error("MIGRATION_CONFLICT_NOT_FOUND");
  const existing = await readMigrationResolution(root, migrationId);
  if (existing) {
    if (existing.selectedOutlineAuthority !== selectedOutlineAuthority) throw new Error("MIGRATION_CONFLICT_RESOLUTION_CONFLICT");
    return existing;
  }
  const base = {
    schemaVersion: "project-migration-resolution.v1" as const,
    migrationId,
    projectSlug,
    status: "resolved" as const,
    selectedOutlineAuthority,
    resolvedConflicts: ["outline-authority-active-and-archived"],
    resolvedAt: new Date().toISOString()
  };
  const resolution: MigrationResolution = { ...base, fingerprint: hash(base) };
  await writeJson(resolutionPath(root, migrationId), resolution);
  return resolution;
}
