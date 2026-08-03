import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import { readProjectBackup, verifyProjectBackup } from "./projectBackup.js";

export interface RestoreDrillReceipt {
  schemaVersion: "restore-drill.v1";
  drillId: string;
  projectSlug: string;
  backupId: string;
  status: "verified" | "failed";
  isolatedWorkspace: string;
  workerStarted: false;
  externalMessagesSent: false;
  sourceFingerprint: string;
  restoredFingerprint: string;
  checked: number;
  failures: string[];
  createdAt: string;
  fingerprint: string;
}

function hash(value: unknown): string { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function hashBytes(value: Buffer): string { return crypto.createHash("sha256").update(value).digest("hex"); }
function receiptPath(root: string, drillId: string): string { return resolveInside(root, `sessions/restore-drills/${drillId}.json`); }
function workspacePath(root: string, drillId: string): string { return resolveInside(root, `sessions/restore-drills/${drillId}/workspace`); }

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function runRestoreDrill(root: string, projectSlug: string, backupId: string): Promise<RestoreDrillReceipt> {
  const manifest = await readProjectBackup(root, backupId);
  if (!manifest || manifest.projectSlug !== projectSlug) throw new Error("RESTORE_DRILL_BACKUP_NOT_FOUND");
  const verification = await verifyProjectBackup(root, backupId);
  const drillId = `restore-drill-${backupId}`;
  const isolatedWorkspace = workspacePath(root, drillId);
  await fs.rm(isolatedWorkspace, { recursive: true, force: true });
  const failures = [...verification.failures];
  if (verification.status === "verified") {
    for (const object of manifest.objects) {
      try {
        const source = resolveInside(root, `sessions/backups/${backupId}/objects/${object.relativePath}`);
        const target = resolveInside(isolatedWorkspace, object.relativePath);
        const bytes = await fs.readFile(source);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, bytes);
        if (bytes.byteLength !== object.size || hashBytes(bytes) !== object.sha256) failures.push(object.relativePath);
      } catch { failures.push(object.relativePath); }
    }
  }
  const restoredObjects: Array<{ relativePath: string; size: number; sha256: string }> = [];
  if (!failures.length) {
    for (const object of manifest.objects) {
      const bytes = await fs.readFile(resolveInside(isolatedWorkspace, object.relativePath));
      restoredObjects.push({ relativePath: object.relativePath, size: bytes.byteLength, sha256: hashBytes(bytes) });
    }
  }
  const base = {
    schemaVersion: "restore-drill.v1" as const,
    drillId,
    projectSlug,
    backupId,
    status: failures.length ? "failed" as const : "verified" as const,
    isolatedWorkspace: `sessions/restore-drills/${drillId}/workspace`,
    workerStarted: false as const,
    externalMessagesSent: false as const,
    sourceFingerprint: manifest.sourceFingerprint,
    restoredFingerprint: hash(restoredObjects),
    checked: manifest.objects.length,
    failures: [...new Set(failures)].sort(),
    createdAt: new Date().toISOString()
  };
  const receipt: RestoreDrillReceipt = { ...base, fingerprint: hash(base) };
  await writeJson(receiptPath(root, drillId), receipt);
  return receipt;
}

export async function readRestoreDrill(root: string, drillId: string): Promise<RestoreDrillReceipt | null> {
  try { return JSON.parse(await fs.readFile(receiptPath(root, drillId), "utf8")) as RestoreDrillReceipt; }
  catch (error) { if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null; throw error; }
}
