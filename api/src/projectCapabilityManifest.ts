import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveInside } from "./pathSafety.js";
import type { ProjectCapabilityManifest } from "./deliveryGovernance.js";

function manifestPath(root: string): string {
  return resolveInside(root, "sessions/project-capability-manifest.json");
}

export async function removeProjectCapabilityManifest(root: string, projectId: string, expectedFingerprint?: string): Promise<void> {
  const current = await readProjectCapabilityManifest(root, projectId);
  if (!current) return;
  if (expectedFingerprint && current.fingerprint !== expectedFingerprint) throw new Error("CAPABILITY_MANIFEST_STALE");
  await fs.rm(manifestPath(root), { force: true });
}

function fingerprintOf(manifest: Omit<ProjectCapabilityManifest, "fingerprint">): string {
  return crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

function assertIntegrity(manifest: ProjectCapabilityManifest): void {
  const { fingerprint, ...base } = manifest;
  if (fingerprintOf(base) !== fingerprint) throw new Error("CAPABILITY_MANIFEST_INTEGRITY_FAILED");
}

export async function readProjectCapabilityManifest(root: string, projectId: string): Promise<ProjectCapabilityManifest | null> {
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath(root), "utf8")) as ProjectCapabilityManifest;
    if (manifest.schemaVersion !== "project-capability-manifest.v1" || manifest.projectId !== projectId || !Array.isArray(manifest.enabledSlices) || !Array.isArray(manifest.readable) || !Array.isArray(manifest.writable) || !Array.isArray(manifest.missingDependencies)) {
      throw new Error("CAPABILITY_MANIFEST_INVALID");
    }
    assertIntegrity(manifest);
    return manifest;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeProjectCapabilityManifest(root: string, manifest: ProjectCapabilityManifest, expectedFingerprint?: string): Promise<ProjectCapabilityManifest> {
  assertIntegrity(manifest);
  const current = await readProjectCapabilityManifest(root, manifest.projectId);
  if (current && !expectedFingerprint) throw new Error("CAPABILITY_MANIFEST_EXPECTED_FINGERPRINT_REQUIRED");
  if (current && expectedFingerprint !== current.fingerprint) throw new Error("CAPABILITY_MANIFEST_STALE");
  const target = manifestPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
  return manifest;
}

export function assertProjectCapabilityWrite(manifest: ProjectCapabilityManifest | null, sliceId: string): void {
  if (!manifest) return;
  if (manifest.migrationStatus !== "verified" || !manifest.writable.includes(sliceId)) {
    throw new Error(`CAPABILITY_WRITE_NOT_AUTHORIZED:${sliceId}`);
  }
}
