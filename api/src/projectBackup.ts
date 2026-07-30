import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";

export interface BackupObject {
  relativePath: string;
  size: number;
  sha256: string;
  status: "verified";
}

export interface ProjectBackupManifest {
  schemaVersion: "project-backup-manifest.v1";
  backupId: string;
  projectSlug: string;
  status: "verified";
  strategy: "local-project-tree";
  faultDomain: "same-workspace";
  sourceFingerprint: string;
  sourceFingerprintAfter: string;
  objects: BackupObject[];
  createdAt: string;
  fingerprint: string;
}

export interface BackupCatalogEntry {
  backupId: string;
  projectSlug: string;
  status: "verified" | "invalid";
  faultDomain: "same-workspace";
  createdAt: string;
  objectCount: number;
  fingerprint: string;
}

function hashBytes(value: Buffer): string { return crypto.createHash("sha256").update(value).digest("hex"); }
function hashJson(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function backupRoot(root: string, backupId: string): string { return resolveInside(root, `sessions/backups/${backupId}`); }
function manifestPath(root: string, backupId: string): string { return resolveInside(root, `sessions/backups/${backupId}/manifest.json`); }

async function collectFiles(root: string, current = ""): Promise<string[]> {
  const absolute = current ? resolveInside(root, current) : root;
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = current ? path.posix.join(current, entry.name) : entry.name;
    if (relative === "sessions/backups" || relative.startsWith("sessions/backups/")) continue;
    if (entry.isDirectory()) files.push(...await collectFiles(root, relative));
    else if (entry.isFile()) files.push(relative.replace(/\\/g, "/"));
  }
  return files.sort();
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function createProjectBackup(root: string, projectSlug: string): Promise<ProjectBackupManifest> {
  const backupId = `backup-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const files = await collectFiles(root);
  const objects: BackupObject[] = [];
  const destinationRoot = backupRoot(root, backupId);
  for (const relativePath of files) {
    const bytes = await fs.readFile(resolveInside(root, relativePath));
    const destination = resolveInside(destinationRoot, `objects/${relativePath}`);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
    objects.push({ relativePath, size: bytes.byteLength, sha256: hashBytes(bytes), status: "verified" });
    if (process.env.NOVEL_BACKUP_INJECT_SOURCE_CHANGE === "1" && objects.length === 1) {
      await fs.appendFile(resolveInside(root, relativePath), "backup-source-change\n", "utf8");
    }
  }
  const sourceFingerprint = hashJson(objects.map(({ relativePath, size, sha256 }) => ({ relativePath, size, sha256 })));
  const afterObjects: Array<{ relativePath: string; size: number; sha256: string }> = [];
  for (const relativePath of files) {
    const bytes = await fs.readFile(resolveInside(root, relativePath));
    afterObjects.push({ relativePath, size: bytes.byteLength, sha256: hashBytes(bytes) });
  }
  const sourceFingerprintAfter = hashJson(afterObjects);
  if (sourceFingerprint !== sourceFingerprintAfter) {
    await fs.rm(destinationRoot, { recursive: true, force: true });
    throw new Error("PROJECT_BACKUP_SOURCE_CHANGED");
  }
  const base = {
    schemaVersion: "project-backup-manifest.v1" as const,
    backupId,
    projectSlug,
    status: "verified" as const,
    strategy: "local-project-tree" as const,
    faultDomain: "same-workspace" as const,
    sourceFingerprint,
    sourceFingerprintAfter,
    objects,
    createdAt: new Date().toISOString()
  };
  const manifest: ProjectBackupManifest = { ...base, fingerprint: hashJson(base) };
  await writeJson(manifestPath(root, backupId), manifest);
  return manifest;
}

export async function readProjectBackup(root: string, backupId: string): Promise<ProjectBackupManifest | null> {
  try { return JSON.parse(await fs.readFile(manifestPath(root, backupId), "utf8")) as ProjectBackupManifest; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}

export async function verifyProjectBackup(root: string, backupId: string): Promise<{ backupId: string; status: "verified" | "failed"; checked: number; failures: string[]; fingerprint: string }> {
  const manifest = await readProjectBackup(root, backupId);
  if (!manifest) throw new Error("PROJECT_BACKUP_NOT_FOUND");
  const failures: string[] = [];
  for (const object of manifest.objects) {
    try {
      const bytes = await fs.readFile(resolveInside(backupRoot(root, backupId), `objects/${object.relativePath}`));
      if (bytes.byteLength !== object.size || hashBytes(bytes) !== object.sha256) failures.push(object.relativePath);
    } catch { failures.push(object.relativePath); }
  }
  const result = { backupId, status: failures.length === 0 ? "verified" as const : "failed" as const, checked: manifest.objects.length, failures };
  return { ...result, fingerprint: hashJson(result) };
}

export async function listProjectBackups(root: string, projectSlug: string): Promise<BackupCatalogEntry[]> {
  const directory = resolveInside(root, "sessions/backups");
  let names: string[];
  try { names = await fs.readdir(directory); } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return [];
    throw error;
  }
  const entries: BackupCatalogEntry[] = [];
  for (const name of names) {
    const manifest = await readProjectBackup(root, name);
    if (!manifest || manifest.projectSlug !== projectSlug) continue;
    const base = {
      backupId: manifest.backupId,
      projectSlug: manifest.projectSlug,
      status: manifest.status === "verified" ? "verified" as const : "invalid" as const,
      faultDomain: manifest.faultDomain,
      createdAt: manifest.createdAt,
      objectCount: manifest.objects.length
    };
    entries.push({ ...base, fingerprint: hashJson(base) });
  }
  return entries.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
